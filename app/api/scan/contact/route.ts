import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { onCardScanned } from '@/lib/crm-engine'
import {
  abcIdentityFromProfile,
  normalizeAbcCardRef,
  resolveAbcCardProfile,
  type AbcCardIdentity,
} from '@/lib/card/abc-identity'
import { createServerSupabase } from '@/lib/supabase'
import { sanitizeProvenance } from '@/lib/scan/provenance'
import { createEncounter } from '@/lib/encounters'
import { findExistingContactMatches } from '@/lib/contacts/duplicate-match'
import { sanitizeCardExtract, type CardExtract } from '@/lib/scan-card-validation'
import { splitName } from '@/lib/data-model'

/**
 * The one place a scan becomes a contact.
 *
 * Every capture — a photographed card, a vCard QR, another ABC card — arrives
 * here as reviewed fields with no id, and is created. Nothing upstream writes:
 * /api/card/scan reads the image and returns a candidate, so a scan the owner
 * discards leaves nothing behind to clean up.
 *
 * The `contactId` branch updates an existing contact instead of creating one.
 * No scan flow sends it any more, and it is kept rather than removed because it
 * is a legitimate owner-scoped edit path for anything that needs one later.
 *
 * Deliberately free of enrichment, scoring and message generation. QR captures
 * consume no scan credit — no vision call was made.
 */

const ALLOWED_SOURCES = ['business_card', 'badge', 'qr', 'document', 'upload', 'auto']

type Body = {
  contactId?: string
  source?: string
  /** How the capture happened. Untrusted: validated and, for ABC, re-resolved. */
  provenance?: unknown
  /**
   * The owner saw the duplicate warning and chose to create a separate contact
   * anyway. Honoured for this one request only — deterministic identifiers can
   * be shared or stale, and the owner is the one who knows. Nothing is
   * remembered: there is no standing "ignore duplicates" setting to forget to
   * turn off.
   */
  allowDuplicate?: boolean
  fields?: Partial<CardExtract> & { first_name?: string; last_name?: string }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as Body
    const input = body.fields || {}

    const clean = sanitizeCardExtract({
      name: input.name ?? null,
      company: input.company ?? null,
      role: input.role ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      linkedin_url: input.linkedin_url ?? null,
    } as CardExtract)

    // Prefer explicit first/last from the review form; fall back to splitting.
    const first = (input.first_name || '').trim()
    const last = (input.last_name || '').trim()
    const derived = splitName(clean.name)
    const firstName = first || derived.first_name
    const lastName = last || derived.last_name
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || clean.name

    if (!fullName && !clean.company && !clean.email) {
      return NextResponse.json(
        { error: 'Add at least a name, company or email before saving.' },
        { status: 400 }
      )
    }

    const source =
      typeof body.source === 'string' && ALLOWED_SOURCES.includes(body.source)
        ? body.source
        : null

    const provenance = sanitizeProvenance(body.provenance)

    /*
      Who was scanned is decided here, from the database, never from the request.

      The client may say "this came from an ABC card, here is the slug" — that
      is a pointer, and pointers are safe to accept. What it may not do is name
      the account behind it. Storing a caller-supplied id would let any signed-in
      user manufacture a link between their contact and someone else's ABC
      identity, which is precisely the claim Phase 5 will later trust for
      matching. So the slug is looked up with the same rules the public card
      uses, and the identifiers come out of the row that lookup returns.

      Deliberately not the public resolve endpoint: that records a card view,
      and one scan must not count as two just because saving re-checks who it
      was.
    */
    let linkedIdentity: AbcCardIdentity | null = null
    if (provenance?.kind === 'abc_card' && provenance.abcCardSlug) {
      const profile = await resolveAbcCardProfile(
        createServerSupabase(),
        provenance.abcCardSlug,
        normalizeAbcCardRef(provenance.abcCardRef)
      )
      linkedIdentity = abcIdentityFromProfile(profile)
    }

    /*
      Is this someone the owner already has?

      Asked before anything is written, so a duplicate costs nothing to
      discover: no row is created, no id is issued, and declining the warning
      leaves the database exactly as it was. Only deterministic identifiers are
      consulted — the ABC account resolved above, then the email, then the
      phone — and the answer is handed back for the owner to decide on. Matching
      never merges, never edits the existing contact, and never picks between
      several matches on the owner's behalf.
    */
    if (!body.allowDuplicate) {
      const match = await findExistingContactMatches(supabase, {
        ownerId: user.id,
        abcUserId: linkedIdentity?.linkedUserId ?? null,
        email: clean.email,
        phone: clean.phone,
      })

      if (match) {
        return NextResponse.json({ success: true, outcome: 'existing_contact', match })
      }
    }

    const identity = {
      name: fullName,
      first_name: firstName || null,
      last_name: lastName || null,
      company: clean.company,
      role: clean.role,
      email: clean.email,
      phone: clean.phone,
      website: clean.website,
      linkedin_url: clean.linkedin_url,
    }

    if (body.contactId) {
      const { data, error } = await supabase
        .from('scanned_contacts')
        .update(source ? { ...identity, source } : identity)
        .eq('id', body.contactId)
        .eq('user_id', user.id)
        .select('*')
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true, contact: data })
    }

    const { data, error } = await supabase
      .from('scanned_contacts')
      .insert({
        ...identity,
        user_id: user.id,
        status: 'pending',
        scan_status: 'basic',
        source: source || 'qr',
        /*
          Provenance is additive: `source` keeps its coarse legacy vocabulary
          and every reader it already has, while these say how and what. Null
          when the caller did not send provenance, which is what an older client
          or a non-scan writer looks like — never a guess.
        */
        capture_origin: provenance?.origin ?? null,
        capture_kind: provenance?.kind ?? null,
        // The scanned person's ABC account, not the owner's. Only ever set from
        // the lookup above; null for every capture that was not an ABC card.
        linked_abc_user_id: linkedIdentity?.linkedUserId ?? null,
        linked_abc_card_slug: linkedIdentity?.linkedCardSlug ?? null,
        enrichment_status: 'DONE',
        enrichment_step: 'none',
        lead_source: 'ABC AI Business Card',
        scanned_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (error || !data) {
      console.error('[scan/contact] insert failed:', error)
      return NextResponse.json({ error: 'Could not save this contact.' }, { status: 500 })
    }

    /*
      CRM defaults and the "card scanned" activity belong to the moment a
      contact starts existing, and that moment moved here.

      They used to fire in /api/card/scan, next to the insert it did before the
      owner had reviewed anything — so an image scan got them and a QR scan,
      which has always created its contact here, silently never did. Running it
      at the one place a scan can create a row keeps the image path exactly as
      it was and gives the QR path the same treatment.
    */
    onCardScanned(data.id, user.id, { enrichmentPending: false }).catch(console.error)

    /*
      Saving a scan is a meeting, so it gets an encounter even when the owner
      typed nothing into the context form. Meeting someone and writing nothing
      down is still meeting them, and a contact with no history at all would
      claim otherwise.

      Empty of context but not of meaning: it carries when and how. If the owner
      does fill the form in, the client passes this encounter's id back so the
      context lands on this meeting instead of inventing a second one.

      Only the create branch. Editing an existing contact through the branch
      above is not a meeting, and neither is Reverse Exchange, which is a
      stranger submitting a form on a public card while the owner may be
      nowhere near — it writes contacts through its own route and is untouched.
    */
    const encounter = await createEncounter(supabase, {
      contactId: data.id,
      userId: user.id,
      meeting: {
        event: null,
        eventNormalized: null,
        discussed: null,
        nextAction: null,
        followUpAt: null,
        metAt: new Date().toISOString(),
      },
      capture: {
        captureOrigin: provenance?.origin ?? null,
        captureKind: provenance?.kind ?? null,
      },
    })

    /*
      The contact stands whether or not the meeting row was written. Deleting a
      contact the owner just reviewed and saved, to punish a failure in a second
      write, would lose the thing they actually asked for.

      `encounter` is null when that write failed, and the client must not invent
      an id: sending a made-up one would be rejected as "not found", while
      sending none makes the context submission create the missing meeting. That
      is the recovery path, and it cannot duplicate, because a contact whose
      first encounter failed has no encounter to duplicate.
    */
    return NextResponse.json({ success: true, outcome: 'created', contact: data, encounter })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save this contact.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
