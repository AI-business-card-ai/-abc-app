import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import {
  buildRows,
  csvFilename,
  toCsv,
  type CsvContact,
  type CsvEncounter,
} from '@/lib/export/csv'

/**
 * Download this owner's contacts and meetings as CSV.
 *
 * Canonical data, not the legacy projection. The previous version of this route
 * read `scanned_contacts` alone, which meant it exported the pre-Phase-4
 * single-meeting columns and could not see `contact_encounters` at all — so a
 * person met twice came out once, carrying whichever meeting the compatibility
 * fields happened to hold.
 *
 * Read-only. The old route also wrote an `EXPORTED_CSV` activity for the first
 * ten contacts on the way past: a mutation on a GET, and an arbitrary ten. A
 * download records nothing.
 *
 * Not a CRM provider. No connection is read, no mapping is written, no token is
 * involved. This is ABC's own data leaving in a format anyone can open.
 */

/** Trim to null, so an empty column becomes an empty cell rather than a space. */
function text(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : ''
  return s || null
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    /*
      The owner comes from the session and from nowhere else. There is no
      parameter that names a user, so there is nothing to forge: every query
      below filters on `user.id`, and a request cannot ask about anybody else.
    */
    const ownerId = user.id

    // Optional, and the only thing the caller may influence. It filters rows
    // the owner can already see, so at worst it narrows their own export.
    const eventFilter = text(req.nextUrl.searchParams.get('event'))

    /*
      Newest first, with the id breaking ties. Two contacts created in the same
      millisecond would otherwise be free to swap places between runs, which
      would make two exports of unchanged data differ.
    */
    const { data: contactRows, error: contactError } = await supabase
      .from('scanned_contacts')
      .select('id, name, first_name, last_name, email, phone, mobile_phone, role, company, website')
      .eq('user_id', ownerId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })

    if (contactError) {
      // The code, never the message: a database error can quote the row it
      // failed on, and that row is somebody's contact details.
      console.error('[export/csv] contact query failed:', contactError.code ?? 'unknown')
      return NextResponse.json({ error: 'Could not build your export.' }, { status: 500 })
    }

    const contacts: CsvContact[] = (contactRows ?? []).map((c) => ({
      id: String(c.id),
      firstName: text(c.first_name),
      lastName: text(c.last_name),
      fullName: text(c.name),
      email: text(c.email),
      // The same canonical phone the CRM adapters use: phone, then mobile.
      phone: text(c.phone) || text(c.mobile_phone),
      jobTitle: text(c.role),
      company: text(c.company),
      website: text(c.website),
    }))

    /*
      Encounters for this owner only. Filtering on `user_id` rather than on the
      contact ids just collected means a mismatch between the two tables cannot
      widen what comes back — a row has to belong to the owner on its own terms,
      not by association.
    */
    const { data: encounterRows, error: encounterError } = await supabase
      .from('contact_encounters')
      .select(
        'id, contact_id, met_at, event, event_normalized, discussed, next_action, follow_up_at, capture_origin, capture_kind'
      )
      .eq('user_id', ownerId)
      .order('met_at', { ascending: false })
      .order('id', { ascending: true })

    if (encounterError) {
      console.error('[export/csv] encounter query failed:', encounterError.code ?? 'unknown')
      return NextResponse.json({ error: 'Could not build your export.' }, { status: 500 })
    }

    /*
      Event scoping happens here, in server code, and not in the query.

      It used to be a PostgREST `.or('event_normalized.eq.<value>,event.eq.<value>')`
      built by interpolating the parameter. Owner scoping was a separate `.eq`
      and so was never at risk, but a comma or a bracket in that value lands in
      a place where PostgREST reads filter *grammar* — the caller could change
      which of their own rows came back, and a filter a user can rewrite is not
      a filter. Comparing in code removes the grammar entirely: the parameter is
      a string being compared to a string, and can never be anything else.

      No extra query either. The owner's encounters were already being fetched
      whole for the unfiltered export, so this narrows what is already in hand.

      Exact equality against the sanitised name, falling back to the raw one for
      rows written before sanitising existed. A row matching both is still one
      row — the comparison decides whether to keep an encounter, so there is
      nothing to deduplicate.
    */
    const matchesEvent = (raw: unknown, normalized: unknown): boolean => {
      if (!eventFilter) return true
      const norm = text(normalized)
      const plain = text(raw)
      return norm === eventFilter || plain === eventFilter
    }

    const byContact = new Map<string, CsvEncounter[]>()
    for (const e of encounterRows ?? []) {
      if (!matchesEvent(e.event, e.event_normalized)) continue

      const contactId = String(e.contact_id)
      const encounter: CsvEncounter = {
        id: String(e.id),
        metAt: text(e.met_at),
        // The sanitised event name when there is one — both went through the
        // Phase 6 sanitiser, so neither can carry model prose.
        event: text(e.event_normalized) || text(e.event),
        discussed: text(e.discussed),
        nextAction: text(e.next_action),
        followUpAt: text(e.follow_up_at),
        captureOrigin: text(e.capture_origin),
        captureKind: text(e.capture_kind),
      }
      const list = byContact.get(contactId)
      if (list) list.push(encounter)
      else byContact.set(contactId, [encounter])
    }

    /*
      When an event is named, the export is about that event: a contact with no
      meeting there does not belong in it. Without a filter every contact
      appears, including those with no meetings recorded yet.
    */
    const included = eventFilter ? contacts.filter((c) => byContact.has(c.id)) : contacts

    const csv = toCsv(buildRows(included, byContact))

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csvFilename()}"`,
        // A download of somebody's contacts should not sit in a shared cache.
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[export/csv] failed:', err instanceof Error ? err.constructor.name : 'unknown')
    return NextResponse.json({ error: 'Could not build your export.' }, { status: 500 })
  }
}
