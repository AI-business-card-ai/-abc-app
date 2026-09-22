import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { createServiceClient } from '@/lib/supabase/service'
import { analyzeOwnerBusiness, decideBrainFacts, loadBrainView } from '@/lib/event-intelligence/brain-data'
import { readJson, requireEventIntelligence } from '@/lib/event-intelligence/route-guard'

/**
 * The Product Brain: how ABC understands the owner's business.
 *
 *   { action: 'analyze', website? }  read the owner's site and what they wrote; propose facts
 *   { action: 'confirm' }            "Looks right": every open proposal is confirmed
 *   { action: 'reject', factId }     one fact is wrong: remove it, do not propose it again
 *
 * The owner id is the session's. `website`, when given, is an address the
 * owner typed; it passes the same public-address checks as every fetch ABC
 * makes, and reading it at most once every ten minutes per account keeps the
 * button from becoming a way to use ABC as a crawler.
 *
 * Nothing here sends, contacts or publishes anything. Facts ABC proposes
 * change no match until the owner confirms them.
 */

// A few pages, spaced a second apart, fit comfortably; the crawl's own budget is 40 s.
export const maxDuration = 60

const ERROR_TEXT: Record<string, { status: number; error: string }> = {
  cooldown: { status: 429, error: 'ABC read your website a few minutes ago. Try again shortly.' },
  invalid_website: { status: 400, error: 'That does not look like a public website address.' },
  write_failed: { status: 500, error: 'ABC could not save what it found. Nothing was changed.' },
}

export async function POST(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  const action = typeof body?.action === 'string' ? body.action : ''

  try {
    if (action === 'analyze') {
      const website = typeof body?.website === 'string' ? body.website.trim().slice(0, 300) : null
      const result = await analyzeOwnerBusiness({
        session: supabase,
        service: createServiceClient(),
        ownerId,
        website: website || null,
      })
      if (!result.ok) {
        const text = ERROR_TEXT[result.code]
        return NextResponse.json({ error: text.error, code: result.code }, { status: text.status })
      }
      return NextResponse.json({
        summary: result.view.summary,
        read: result.crawl ? { pages: result.crawl.pagesKept, stoppedBy: result.crawl.stoppedBy } : null,
      })
    }

    if (action === 'confirm') {
      const decided = await decideBrainFacts(supabase, ownerId, 'confirm', 'all_proposed')
      if (!decided.ok) return NextResponse.json({ error: 'That did not save. Nothing was changed.' }, { status: 500 })
      return NextResponse.json({ summary: (await loadBrainView(supabase, ownerId)).summary, confirmed: decided.changed })
    }

    if (action === 'reject') {
      const factId = typeof body?.factId === 'string' ? body.factId : ''
      if (!/^[0-9a-f-]{36}$/i.test(factId)) return NextResponse.json({ error: 'Which fact?' }, { status: 400 })
      const decided = await decideBrainFacts(supabase, ownerId, 'reject', [factId])
      if (!decided.ok) return NextResponse.json({ error: 'That did not save. Nothing was changed.' }, { status: 500 })
      return NextResponse.json({ summary: (await loadBrainView(supabase, ownerId)).summary, rejected: decided.changed })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (err) {
    return serverErrorResponse('event-intelligence/brain', err)
  }
}
