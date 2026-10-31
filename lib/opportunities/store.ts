import type { SupabaseClient } from '@supabase/supabase-js'
import {
  LIMITS,
  dueAtFromInput,
  isNextActionType,
  normalizeCurrency,
  positiveAmount,
  toOpportunity,
  trimTo,
  type Currency,
  type NextAction,
  type Opportunity,
  type OpportunityStage,
} from '@/lib/opportunities/model'

/**
 * Writing opportunities — the one place that does.
 *
 * Every function takes the caller's own Supabase client, so RLS applies to
 * every write; owner filters are added as well, so a mistake misses rather
 * than trusting the policy alone. Callers prove the contact is theirs before
 * creating anything (the migration's composite key backs that up in the
 * database once applied).
 */

type Failure = { code?: string } | null | undefined

/**
 * The schema V1 needs is not there yet: a table or column PostgREST or
 * Postgres does not know. The routes answer these with a sentence of their own
 * instead of a 500, so a deploy that lands before the migration degrades
 * instead of breaking.
 */
export function isMissingSchema(error: Failure): boolean {
  return ['PGRST204', 'PGRST205', '42703', '42P01'].includes(String(error?.code ?? ''))
}

export function isUniqueViolation(error: Failure): boolean {
  return String(error?.code ?? '') === '23505'
}

/** A next step from a request body, or null for none. Text is the one required part. */
export function parseNextAction(input: unknown): NextAction | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const text = trimTo(raw.text, LIMITS.action)
  if (!text) return null
  return {
    text,
    type: isNextActionType(raw.type) ? raw.type : 'other',
    dueAt: dueAtFromInput(raw.dueAt),
  }
}

function nextActionColumns(next: NextAction | null) {
  return {
    next_action: next?.text ?? null,
    next_action_type: next ? next.type : null,
    next_action_due_at: next?.dueAt ?? null,
  }
}

export async function findOpportunityForContact(
  supabase: SupabaseClient,
  args: { userId: string; contactId: string }
): Promise<{ opportunity: Opportunity | null; error: Failure }> {
  const { data, error } = await supabase
    .from('crm_opportunities')
    .select('*')
    .eq('user_id', args.userId)
    .eq('contact_id', args.contactId)
    .order('updated_at', { ascending: false })
    .limit(1)

  const row = (data as Record<string, unknown>[] | null)?.[0]
  return { opportunity: row ? toOpportunity(row) : null, error }
}

export async function findOpportunity(
  supabase: SupabaseClient,
  args: { userId: string; id: string }
): Promise<{ opportunity: Opportunity | null; error: Failure }> {
  const { data, error } = await supabase
    .from('crm_opportunities')
    .select('*')
    .eq('id', args.id)
    .eq('user_id', args.userId)
    .maybeSingle()

  return { opportunity: data ? toOpportunity(data as Record<string, unknown>) : null, error }
}

export type CreateResult =
  | { ok: true; opportunity: Opportunity; created: boolean; nextActionSaved: boolean }
  | { ok: false; error: Failure }

/**
 * One opportunity per person: an existing one is returned, not duplicated.
 *
 * The core row is written first and the next step after it, so a database
 * that has the table but not yet V1's columns still records the deal — the
 * caller is told the step was not saved rather than losing both.
 */
export async function createOpportunity(
  supabase: SupabaseClient,
  args: {
    userId: string
    contactId: string
    name: string
    stage: OpportunityStage
    value: number | null
    currency: Currency
    note: string | null
    nextAction: NextAction | null
  }
): Promise<CreateResult> {
  const existing = await findOpportunityForContact(supabase, args)
  if (existing.error) return { ok: false, error: existing.error }
  if (existing.opportunity) {
    return { ok: true, opportunity: existing.opportunity, created: false, nextActionSaved: false }
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('crm_opportunities')
    .insert({
      user_id: args.userId,
      contact_id: args.contactId,
      name: args.name,
      stage: args.stage,
      value: args.value,
      currency: args.currency,
      notes: args.note,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error || !data) {
    // Two taps, or two devices: the unique index caught the second insert.
    if (isUniqueViolation(error)) {
      const raced = await findOpportunityForContact(supabase, args)
      if (raced.opportunity) return { ok: true, opportunity: raced.opportunity, created: false, nextActionSaved: false }
    }
    return { ok: false, error }
  }

  let opportunity = toOpportunity(data as Record<string, unknown>)
  let nextActionSaved = false

  if (args.nextAction) {
    const saved = await setNextAction(supabase, { userId: args.userId, id: opportunity.id, nextAction: args.nextAction })
    if (saved.opportunity) {
      opportunity = saved.opportunity
      nextActionSaved = true
    }
  }

  return { ok: true, opportunity, created: true, nextActionSaved }
}

export async function setNextAction(
  supabase: SupabaseClient,
  args: { userId: string; id: string; nextAction: NextAction | null }
): Promise<{ opportunity: Opportunity | null; error: Failure }> {
  const { data, error } = await supabase
    .from('crm_opportunities')
    .update({ ...nextActionColumns(args.nextAction), updated_at: new Date().toISOString() })
    .eq('id', args.id)
    .eq('user_id', args.userId)
    .select('*')
    .maybeSingle()

  return { opportunity: data ? toOpportunity(data as Record<string, unknown>) : null, error }
}

export type OpportunityPatch = {
  stage?: OpportunityStage
  value?: number | null
  currency?: Currency
  name?: string
  note?: string | null
}

/** The editable fields of a request body, validated; `invalid` names the first bad one. */
export function parsePatch(
  body: Record<string, unknown>,
  isStage: (v: unknown) => v is OpportunityStage
): { patch: OpportunityPatch; invalid: string | null } {
  const patch: OpportunityPatch = {}
  if ('stage' in body) {
    if (!isStage(body.stage)) return { patch, invalid: 'stage' }
    patch.stage = body.stage
  }
  if ('value' in body) {
    if (body.value === null || body.value === '') patch.value = null
    else {
      const amount = positiveAmount(body.value)
      if (amount === null) return { patch, invalid: 'value' }
      patch.value = amount
    }
  }
  if ('currency' in body) patch.currency = normalizeCurrency(body.currency)
  if ('name' in body) {
    const name = trimTo(body.name, LIMITS.name)
    if (!name) return { patch, invalid: 'name' }
    patch.name = name
  }
  if ('note' in body) patch.note = trimTo(body.note, LIMITS.note)
  return { patch, invalid: null }
}

export async function updateOpportunity(
  supabase: SupabaseClient,
  args: { userId: string; id: string; patch: OpportunityPatch }
): Promise<{ opportunity: Opportunity | null; error: Failure }> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (args.patch.stage !== undefined) update.stage = args.patch.stage
  if (args.patch.value !== undefined) update.value = args.patch.value
  if (args.patch.currency !== undefined) update.currency = args.patch.currency
  if (args.patch.name !== undefined) update.name = args.patch.name
  if (args.patch.note !== undefined) update.notes = args.patch.note

  const { data, error } = await supabase
    .from('crm_opportunities')
    .update(update)
    .eq('id', args.id)
    .eq('user_id', args.userId)
    .select('*')
    .maybeSingle()

  return { opportunity: data ? toOpportunity(data as Record<string, unknown>) : null, error }
}
