import { NextResponse } from 'next/server'

/**
 * Retired: generic webhook export.
 *
 * This route took a destination URL from the browser and POSTed the owner's
 * contacts to it from ABC's servers — to any host, following redirects,
 * private and internal addresses included — then stored that URL on the
 * profile and in the activity log. Nothing in the app called it, and ABC has no
 * webhook integration whose destination is configured and owned server-side:
 * the only "configured" destination was whatever the last request said.
 *
 * A browser must never be able to say "send my contacts to this address", so
 * the route is closed rather than defended. It reads nothing, sends nothing and
 * writes nothing; every request gets the same answer. CSV export and CRM sync
 * are the supported ways to take contacts elsewhere. A webhook product would
 * need a stored, owner-configured destination and network-level protection, and
 * belongs in a design of its own.
 */

const RETIRED = {
  error: 'Webhook export is no longer available. Use CSV export or CRM sync instead.',
  code: 'webhook_export_retired',
} as const

export async function POST() {
  return NextResponse.json(RETIRED, { status: 410 })
}
