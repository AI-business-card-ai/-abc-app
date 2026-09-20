import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { createServiceClient } from '@/lib/supabase/service'
import { ingestEvent } from '@/lib/event-intelligence/ingest'
import { buildImportPreview, importableExhibitors } from '@/lib/event-intelligence/import-preview'
import { parseImport, readImportRequest } from '@/lib/event-intelligence/import-request'
import { DatasetEventProvider } from '@/lib/event-intelligence/providers/import-file'
import { supabaseIngestStore } from '@/lib/event-intelligence/store/supabase-ingest'
import { requireEventIntelligence, readJson } from '@/lib/event-intelligence/route-guard'

/**
 * Import the file the owner just looked at.
 *
 * Re-parses and re-validates rather than trusting a preview the client sends
 * back. A round trip through the browser is a place where records could be
 * edited, so the rows that get written are decided here, from the file, by the
 * same code that produced the preview.
 *
 * Invalid rows are dropped and rows duplicated within the file are collapsed;
 * everything else goes through the ordinary ingestion, which is where company
 * identity, provenance and idempotency already live. Importing the same file
 * twice writes nothing the second time.
 *
 * Service role, because this writes the shared event graph, which belongs to no
 * account — the owner's own client has no write grant on those tables at all.
 * The session is still required; the flag is checked before it.
 */
export async function POST(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response

  const read = readImportRequest(await readJson(request))
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status })

  try {
    const parsed = parseImport(read.request)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const preview = buildImportPreview(parsed.dataset.exhibitors, parsed.warnings)
    const exhibitors = importableExhibitors(parsed.dataset.exhibitors, preview)

    if (exhibitors.length === 0) {
      return NextResponse.json(
        {
          error: 'Nothing in that file could be imported. Every row is missing a company name or anything to identify it by.',
          code: 'nothing_importable',
          preview,
        },
        { status: 400 }
      )
    }

    const provider = new DatasetEventProvider({
      event: read.request.event,
      exhibitors,
      id: read.request.providerId,
    })

    const report = await ingestEvent(
      provider,
      { providerEventId: read.request.event.providerRecordId },
      supabaseIngestStore(createServiceClient())
    )

    return NextResponse.json({
      eventKey: report.eventKey,
      report,
      skipped: {
        invalid: preview.counts.invalid,
        duplicateInFile: preview.counts.duplicateInFile,
      },
    })
  } catch (err) {
    return serverErrorResponse('event-intelligence/import/commit', err)
  }
}
