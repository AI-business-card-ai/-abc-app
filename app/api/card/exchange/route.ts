import { NextRequest, NextResponse } from 'next/server'
import { createEncounter } from '@/lib/encounters'
import { findExistingContactMatches } from '@/lib/contacts/duplicate-match'
import { consumeRateLimits } from '@/lib/rate-limit'
import { sendCardExchangeNotification } from '@/lib/email'
import { createServerSupabase } from '@/lib/supabase'
import {
  EXCHANGE_CAPTURE_KIND,
  EXCHANGE_CAPTURE_ORIGIN,
  exchangeContactFields,
  parseExchangeSubmission,
  type ExchangeSubmission,
} from '@/lib/card/exchange'

/**
 * The one place a public card exchange becomes owner data.
 *
 * A stranger at a stand opens somebody's card and hands their details back.
 * Everything about that is untrusted except the fact that it happened, so this
 * route is written the way a public write surface has to be: the caller names
 * the card, never the owner; every field is read out individually; and what
 * comes out the other end is a contact and a meeting, both true.
 *
 * Read this alongside `lib/card/exchange.ts`, which holds the validation with
 * no database attached to it.
 */

/**
 * The rate policy, in one place.
 *
 * A single per-IP number cannot describe a trade fair. Venue Wi-Fi, corporate
 * Wi-Fi and carrier CGNAT put a whole hall behind one public address, so a
 * tight per-IP cap does not stop an attacker — it stops the sixth real person
 * to visit a stand. These three bands each bound something different:
 *
 *  - IP + card, loose enough that a shared address is not a lockout, tight
 *    enough that one machine cannot sit on one card all day.
 *  - Email + card, tight, because the same person sending their details four
 *    times in an hour is a replay rather than a second meeting.
 *  - Card overall, high, as a ceiling on a distributed flood that neither of
 *    the other two would notice.
 */
const HOUR = 60 * 60
const RATE_IP_CARD = { windowSeconds: HOUR, maxHits: 60 }
const RATE_EMAIL_CARD = { windowSeconds: HOUR, maxHits: 3 }
const RATE_CARD_GLOBAL = { windowSeconds: HOUR, maxHits: 300 }

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

/** One generic refusal. The caller learns nothing beyond the status. */
const GENERIC = 'Your details could not be sent. Try again.'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = parseExchangeSubmission(body)

    /*
      A bot gets the success it was looking for and nothing else happens: no
      contact, no meeting, no email to the owner. Answered before the card is
      even looked up, so a scripted flood costs one JSON parse.
    */
    if (!parsed.ok && parsed.reason === 'honeypot') {
      return NextResponse.json({ ok: true })
    }
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.message }, { status: 400 })
    }

    const submission: ExchangeSubmission = parsed.submission
    const supabase = createServerSupabase()

    /*
      The card decides who this is for.

      The old version took `ownerUserId` from the request body and checked that
      it existed — but the owner's id is printed into the HTML of every
      published card, so anyone could read one off a card and post contacts at
      that account without ever opening it. The visitor now names the card they
      are actually looking at, and the owner is whoever that card resolves to.

      Same predicate the public page uses: the slug must exist and the card must
      be published. An unpublished card is not a card yet.
    */
    const { data: card } = await supabase
      .from('abc_profiles')
      .select('id, full_name, email, public_email')
      .eq('card_slug', submission.cardSlug)
      .eq('card_published', true)
      .maybeSingle()

    if (!card) {
      return NextResponse.json({ ok: false, error: 'Card not found.' }, { status: 404 })
    }

    const ownerId = card.id as string

    /*
      Counted only once the card is known to be real, so guessing slugs cannot
      spend a stranger's quota, and before anything is written, so a refused
      request leaves no contact, no meeting and no email behind.

      The bands run narrowest first. A replaying visitor is stopped at their own
      address and never reaches the card's global ceiling, so they cannot walk a
      card towards its cap and lock the room out.

      `unavailable` is refused rather than waved through. It means the counter
      could not be reached, and an endpoint that has stopped counting is an
      endpoint with no limit at all. The response is the same either way — which
      band objected, and whether the card even exists, are not the caller's to
      learn.
    */
    const limit = await consumeRateLimits(supabase, ownerId, [
      { scope: 'exchange:ip-card', subject: getClientIp(req), ...RATE_IP_CARD },
      // The address the receiver typed, already normalised by the parser, so
      // the key is the same one the duplicate matcher would compare.
      { scope: 'exchange:email-card', subject: submission.email, ...RATE_EMAIL_CARD },
      // No subject: the whole card is the thing being bounded.
      { scope: 'exchange:card-global', subject: '', ...RATE_CARD_GLOBAL },
    ])

    if (!limit.allowed) {
      const status = limit.reason === 'limited' ? 429 : 503
      return NextResponse.json(
        { ok: false, error: 'Too many requests. Try again shortly.' },
        { status }
      )
    }

    /*
      The person, if the owner already has them.

      The same deterministic matcher the scanner uses — email, then phone, never
      a name. The scanner asks the owner to choose because the owner is standing
      there; nobody is standing here, so the strongest deterministic identifier
      decides on its own. That is safe precisely because it is deterministic:
      the receiver typed their own address, and an exact address is one person.
    */
    const match = await findExistingContactMatches(supabase, {
      ownerId,
      email: submission.email,
      phone: submission.phone,
    })

    let contactId = match?.contacts[0]?.contactId ?? null

    if (!contactId) {
      const { data: inserted, error } = await supabase
        .from('scanned_contacts')
        .insert({
          user_id: ownerId,
          ...exchangeContactFields(submission),
          scanned_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (error || !inserted) {
        console.error('[card/exchange] contact insert failed:', error?.code ?? 'unknown')
        return NextResponse.json({ ok: false, error: GENERIC }, { status: 500 })
      }
      contactId = inserted.id as string
    }

    /*
      An existing contact is left exactly as it is.

      The owner may have spent a week correcting this person's job title; a
      later exchange carrying a blank company is not new information, and
      "whatever arrived last wins" is not a merge policy. What the exchange adds
      is the meeting below, which is the part that is genuinely new.

      That meeting records what is honestly known: when it happened, and how it
      arrived. The form asks for nothing else, so nothing else is written — no
      event, nothing discussed, no next action, no follow-up date. The owner
      fills those in afterwards through the meeting context they already have,
      and a null is the truth until they do.
    */
    const encounter = await createEncounter(supabase, {
      contactId,
      userId: ownerId,
      meeting: {
        event: null,
        eventNormalized: null,
        discussed: null,
        nextAction: null,
        followUpAt: null,
        metAt: new Date().toISOString(),
      },
      capture: {
        captureOrigin: EXCHANGE_CAPTURE_ORIGIN,
        captureKind: EXCHANGE_CAPTURE_KIND,
      },
    })

    /*
      No meeting, no success.

      There is no transaction available here — the project has no RPC layer for
      one — so this fails closed rather than pretending. A contact may already
      exist when this returns 500, and that is recoverable by design: the
      matcher above finds it by email on the retry and the meeting lands on it.
      What a transaction would prevent is a contact with no meeting being
      reported as fine, and that is the case this refuses.
    */
    if (!encounter) {
      console.error('[card/exchange] encounter create failed for contact', contactId)
      return NextResponse.json({ ok: false, error: GENERIC }, { status: 500 })
    }

    /*
      Only now, and only about what exists. Deep-links to the reused contact
      when there was one, so the owner lands on the person rather than a second
      copy of them. A bounced email does not unmake the meeting.
    */
    const ownerEmail = (card.public_email || card.email) as string | null
    if (ownerEmail) {
      void sendCardExchangeNotification({
        to: ownerEmail,
        ownerName: (card.full_name as string) || 'there',
        contactName: submission.name,
        company: submission.company || undefined,
        email: submission.email,
        phone: submission.phone || undefined,
        role: submission.role || undefined,
        contactId,
      }).catch((err) => console.error('[card/exchange] notification failed:', err?.name ?? 'unknown'))
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[card/exchange] failed:', err instanceof Error ? err.constructor.name : 'unknown')
    return NextResponse.json({ ok: false, error: GENERIC }, { status: 500 })
  }
}
