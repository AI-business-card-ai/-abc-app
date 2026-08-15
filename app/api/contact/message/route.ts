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

    const body = (await req.json()) as { contactId?: string; channel?: string }
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

    const { data: profile } = await supabase
      .from('abc_profiles')
      .select('full_name, job_title, role, company_name, company, outreach_language, communication_style')
      .eq('id', user.id)
      .maybeSingle()

    const meetingWhere =
      contact.meeting_event_name || contact.event_name || contact.raw_event_text || contact.meeting_location
    const discussed = contact.meeting_topic || contact.notes
    const nextStep = contact.next_action || contact.next_step

    const facts = [
      line('Their name', contact.name),
      line('Their role', contact.role),
      line('Their company', contact.company),
      line('Where we met', meetingWhere),
      line('When we met', contact.scanned_at ? new Date(contact.scanned_at).toDateString() : null),
      line('What we discussed', discussed),
      line('What I promised to do next', nextStep),
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
    return NextResponse.json({ success: true, channel, ...result })
  } catch (err) {
    console.error('[contact/message] generation failed:', err)
    return NextResponse.json({ error: 'Could not draft a message. Try again.' }, { status: 500 })
  }
}
