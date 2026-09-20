import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { normalizeCompanyName } from '@/lib/event-intelligence/normalize'
import { buildImportPreview, markAlreadyImported } from '@/lib/event-intelligence/import-preview'
import { parseImport, readImportRequest } from '@/lib/event-intelligence/import-request'
import { loadEventByKey, loadEventGraph } from '@/lib/event-intelligence/data'
import { readJson, requireEventIntelligence } from '@/lib/event-intelligence/route-guard'

/**
 * What would happen if this file were imported. Writes nothing.
 *
 * Deliberately a separate route from the commit rather than a `dryRun` flag on
 * it. A flag is one mistyped boolean away from writing when somebody meant to
 * look, and this route has no write path at all — no service client is created
 * here, so there is nothing in it that could reach the shared graph.
 *
 * The uploaded text is parsed, counted and thrown away. Nothing is stored: ABC
 * has no reason to keep a copy of a file somebody was only considering, and the
 * contents are a customer's commercial context.
 */
export async function POST(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase } = guard.context

  const read = readImportRequest(await readJson(request))
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status })

  try {
    const parsed = parseImport(read.request)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    let preview = buildImportPreview(parsed.dataset.exhibitors, parsed.warnings)

    /*
      What ABC already holds for this fair, so "already imported" is a fact
      rather than a guess. Read through the owner's own client: the event graph
      is readable by any signed-in account and writable by none of them.
    */
    const event = await loadEventByKey(supabase, read.request.eventKey)
    if (event) {
      const { presences, companies } = await loadEventGraph(supabase, event.id)
      const domains = new Set<string>()
      const names = new Set<string>()
      for (const presence of presences) {
        const company = companies.get(presence.companyId)
        if (!company) continue
        if (company.websiteDomain) domains.add(company.websiteDomain)
        names.add(company.nameNormalized || normalizeCompanyName(company.displayName))
      }
      preview = markAlreadyImported(preview, domains, names)
    }

    return NextResponse.json({
      eventKey: read.request.eventKey,
      eventExists: Boolean(event),
      eventName: event?.name ?? read.request.event.name,
      preview,
    })
  } catch (err) {
    return serverErrorResponse('event-intelligence/import/preview', err)
  }
}
