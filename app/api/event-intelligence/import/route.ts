import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { createServiceClient } from '@/lib/supabase/service'
import { ingestEvent } from '@/lib/event-intelligence/ingest'
import { DEMO_EVENT_REF, JsonFixtureProvider } from '@/lib/event-intelligence/providers/json-fixture'
import { supabaseIngestStore } from '@/lib/event-intelligence/store/supabase-ingest'
import { requireEventIntelligence } from '@/lib/event-intelligence/route-guard'

/**
 * Load the synthetic demo fair into the shared event graph.
 *
 * This writes shared reference data, which belongs to no account, so it runs
 * with the service role — the owner's own client has no write grant on any of
 * these tables and would be refused by the database. The session is still
 * required: the feature is not public, and an unauthenticated request has no
 * business starting a job.
 *
 * It is idempotent. Pressing the button twice is two reads and no writes, which
 * is the property that makes it safe to offer as a button at all.
 *
 * Only the fixture provider is reachable from here. There is no parameter for a
 * provider id, no URL to fetch and no token to supply, because choosing a real
 * source is an owner decision that has not been taken — see
 * docs/event-intelligence/apify-provider.md.
 */
export async function POST() {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response

  try {
    const store = supabaseIngestStore(createServiceClient())
    const report = await ingestEvent(new JsonFixtureProvider(), DEMO_EVENT_REF, store)
    return NextResponse.json({ report })
  } catch (err) {
    return serverErrorResponse('event-intelligence/import', err)
  }
}
