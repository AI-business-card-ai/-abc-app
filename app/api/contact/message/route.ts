import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { getLanguageInstruction } from '@/lib/ai-messages'

/**
 * Smart follow-up generation for the rebuilt contact detail.
 *
 * Deliberately narrow: the prompt sees identity, meeting context and the next
 * step — nothing else. No LinkedIn scraping, no company summary, no lead score,
 * no enrichment blobs. If we don't know something, it isn't in the prompt, so
 * the model cannot lean on it.
 *
 * The existing /api/enrich/messages/[id] route still exists for the legacy
 * screens; it feeds the old enrichment payload and is not used here.
 */

export type MessageChannel = 'email' | 'whatsapp' | 'linkedin' | 'sms'

const CHANNELS: MessageChannel[] = ['email', 'whatsapp', 'linkedin', 'sms']

const CHANNEL_BRIEF: Record<MessageChannel, string> = {
  email:
    'An email. 3-4 short sentences, max ~500 characters. Also write a subject line under 60 characters.',
  whatsapp: 'A WhatsApp message. 1-2 sentences, max 300 characters. Warm but professional.',
  linkedin: 'A LinkedIn message. 2-3 sentences, max 500 characters.',
  sms: 'An SMS. One sentence, max 160 characters.',
}

function line(label: string, value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? `${label}: ${text}` : null
}

function parseResult(raw: string): { subject: string; message: string } {
  const clean = raw.replace(/```json|```/g, '').trim()
  const match = clean.match(/\{[\s\S]*\}/)

  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { subject?: string; message?: string }
      const message = (parsed.message || '').trim()
      if (message) {
        return { subject: (parsed.subject || '').trim(), message }
      }
    } catch {
      /* fall through to plain text */
    }
  }

  // The model answered in prose — use it rather than failing the request.
  return { subject: '', message: clean }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as {
      contactId?: string
      /**
       * Which meeting to write about. Omitted means the newest, which is the
       * one the contact screen is showing. Named explicitly so a follow-up can
       * later be drafted for an older meeting without this route having to
       * guess which one anybody meant.
       */
      encounterId?: string
      channel?: string
    }
    const channel = (body.channel || 'email') as MessageChannel

    if (!body.contactId || !CHANNELS.includes(channel)) {
      return NextResponse.json({ error: 'Missing contact or channel.' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Message generation is not configured.' },
        { status: 503 }
      )
    }

    const { data: contact } = await supabase
      .from('scanned_contacts')
      .select(
        'name, role, company, event_name, meeting_event_name, meeting_location, raw_event_text, meeting_topic, notes, next_action, next_step, next_action_date, scanned_at'
      )
      .eq('id', body.contactId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    /*
      The meeting being followed up, read from the database rather than taken
      from the request. The browser sends two ids and a channel; every fact the
      model sees is fetched here under the owner's own session.

      Scoped by contact and owner together, so naming a meeting belonging to a
      different contact — or a different person entirely — finds nothing.
    */
    let encounterQuery = supabase
      .from('contact_encounters')
      .select('id, met_at, event, event_normalized, discussed, next_action, follow_up_at')
      .eq('contact_id', body.contactId)
      .eq('user_id', user.id)

    encounterQuery = body.encounterId
      ? encounterQuery.eq('id', body.encounterId)
      : encounterQuery.order('met_at', { ascending: false }).order('created_at', { ascending: false })

    const { data: encounter } = await encounterQuery.limit(1).maybeSingle()

    // A named meeting that cannot be found is an error, never a quiet fallback:
    // drafting from a different meeting than the one asked for is exactly the
    // failure this phase exists to prevent.
    if (body.encounterId && !encounter) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    /*
      One meeting or the other, never a blend of the two.

      The flat contact columns are a projection of the newest meeting that had
      something to project, so on a contact with meetings they can describe an
      *older* one — which is how a message about today's handshake ends up
      recalling a conference from two years ago and a promise already kept.
      When encounters exist they are the only source. The legacy branch is for
      contacts saved before meetings had rows of their own, and nothing from it
      is ever mixed in alongside an encounter.
    */
    const meeting = encounter
      ? {
          where: encounter.event_normalized || encounter.event,
          when: encounter.met_at,
          discussed: encounter.discussed,
          nextStep: encounter.next_action,
        }
      : {
          where:
            contact.meeting_event_name ||
            contact.event_name ||
            contact.raw_event_text ||
            contact.meeting_location,
          when: contact.scanned_at,
          discussed: contact.meeting_topic || contact.notes,
          nextStep: contact.next_action || contact.next_step,
        }

    const { data: profile } = await supabase
      .from('abc_profiles')
      .select('full_name, job_title, role, company_name, company, outreach_language, communication_style')
      .eq('id', user.id)
      .maybeSingle()

    const facts = [
      line('Their name', contact.name),
      line('Their role', contact.role),
      line('Their company', contact.company),
      line('Where we met', meeting.where),
      line('When we met', meeting.when ? new Date(meeting.when).toDateString() : null),
      line('What we discussed', meeting.discussed),
      line('What I promised to do next', meeting.nextStep),
    ].filter(Boolean)

    const sender = [
      line('My name', profile?.full_name),
      line('My role', profile?.job_title || profile?.role),
      line('My company', profile?.company_name || profile?.company),
    ].filter(Boolean)

    const tone = profile?.communication_style || 'direct'
    const languageInstruction = getLanguageInstruction(profile?.outreach_language || 'EN')

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      // Generous because thinking and the reply share this budget.
      max_tokens: 2000,
      system: `You write short follow-up messages after a real business meeting. ${languageInstruction} Tone: ${tone}.

Rules:
- Use only the facts given. Never invent a detail, a shared interest, or a compliment.
- Reference where you met and what was discussed, when those facts are provided.
- When little is recorded beyond the meeting itself, write a short, warm note about having met, and say nothing more. Do not fill the gap by guessing what was discussed or promised.
- If a next step is given, state it plainly as a commitment.
- No flattery, no filler, no "I hope this finds you well", no bullet lists.
- Sign off with the sender's first name only.
- Return JSON: {"subject": "", "message": ""}. Leave subject empty unless writing an email.`,
      messages: [
        {
          role: 'user',
          content: `Write this message.

${CHANNEL_BRIEF[channel]}

About the person I met:
${facts.length > 0 ? facts.join('\n') : 'No details recorded.'}

About me:
${sender.length > 0 ? sender.join('\n') : 'No details recorded.'}`,
        },
      ],
    })

    // Thinking blocks can precede the answer — take the first text block, not [0].
    const text = response.content.find((block) => block.type === 'text')
    const raw = text && text.type === 'text' ? text.text : ''

    if (!raw.trim()) {
      return NextResponse.json({ error: 'Could not draft a message. Try again.' }, { status: 502 })
    }

    const result = parseResult(raw)
    return NextResponse.json({ success: true, channel, encounterId: encounter?.id ?? null, ...result })
  } catch (err) {
    console.error('[contact/message] generation failed:', err)
    return NextResponse.json({ error: 'Could not draft a message. Try again.' }, { status: 500 })
  }
}
