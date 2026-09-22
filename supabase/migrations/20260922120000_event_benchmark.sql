-- ABC Mission Benchmark V1 and the intelligence feedback loop.
--
-- Additive. Two new owner-scoped tables and one new unique constraint on an
-- existing table; nothing in the three earlier Event Intelligence migrations is
-- altered, and no grant or policy of theirs is changed. Local PGlite only:
-- this is not applied to the hosted database, which is an owner decision.
--
-- The question this schema exists to answer is a business one: IS ABC
-- RECOMMENDING THE RIGHT COMPANIES? Nothing here answers it automatically. It
-- records what the owner thought of what ABC suggested, and what ABC failed to
-- suggest, so the question can be measured instead of argued about.
--
-- OWNER FEEDBACK is a fourth kind of claim, and it is kept apart from the other
-- three exactly as they are kept apart from each other:
--
--   OWNER FACT     what the owner typed about their business.
--   SOURCE FACT    what an event listing or a page says.
--   ABC ANALYSIS   what ABC inferred by comparing them.
--   OWNER FEEDBACK what the owner thought of the result. THIS FILE.
--
-- A judgment therefore rewrites nothing. It does not edit a company, a
-- presence, a source record, a brain fact or a score, and no table below is
-- read by matching. It is an opinion about an output, stored beside that
-- output, and read by a report.

-- ---------------------------------------------------------------
-- The pair a missed opportunity points at
-- ---------------------------------------------------------------
-- intel_company_presences has `id` as its primary key and carries event_id, but
-- nothing could reference the two together. This adds that constraint, exactly
-- as earlier migrations did for scanned_contacts and contact_encounters and for
-- the same reason: it lets a row below say "this company, at this edition" and
-- have the database check the pairing rather than a route promising it.
--
-- Purely additive. `id` is already unique, so every existing row satisfies it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'intel_company_presences_id_event_id_key'
      AND conrelid = 'public.intel_company_presences'::regclass
  ) THEN
    ALTER TABLE public.intel_company_presences
      ADD CONSTRAINT intel_company_presences_id_event_id_key UNIQUE (id, event_id);
  END IF;
END
$$;

-- ---------------------------------------------------------------
-- intel_match_feedback: what the owner thought of one recommendation
-- ---------------------------------------------------------------
-- One judgment per match, replaceable. Three values and nothing else:
--
--   great         worth the walk. The recommendation did its job.
--   relevant      fair enough, not remarkable.
--   not_relevant  ABC should not have suggested them.
--
-- There is no 'met', 'contacted', 'converted' or 'won' here, and there must not
-- be. TARGET ≠ ENCOUNTER holds through this table as through every other: a
-- great target is a judgment about a suggestion, not a claim that anybody met
-- anybody. What actually happened is recorded where it always was — in
-- contact_encounters, by the owner, after it happened.
--
-- `reason` exists only to explain a refusal, so the check ties it to the
-- judgment that can carry one. It is a small, closed list on purpose: a
-- taxonomy nobody fills in measures nothing.
--
-- The four stamped columns are the reproducibility record. A match row is
-- current — re-running matching rewrites its score and its engine version in
-- place — so a judgment that only pointed at the match would silently follow
-- the next tuning run and the before/after comparison would be lost. These
-- columns are what was on screen when the owner judged it, and they are written
-- by the server from the match it just read, never from the request body.
CREATE TABLE IF NOT EXISTS public.intel_match_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles (id) ON DELETE CASCADE,

  match_id uuid NOT NULL,
  objective_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.intel_events (id) ON DELETE CASCADE,

  judgment text NOT NULL CHECK (judgment IN ('great', 'relevant', 'not_relevant')),
  reason text CHECK (reason IN (
    'wrong_industry',
    'wrong_company_role',
    'we_do_not_sell_to_them',
    'wrong_market',
    'already_known',
    'not_enough_evidence',
    'other'
  )),
  note text,

  -- What ABC had concluded at the moment of the judgment.
  match_type text NOT NULL CHECK (match_type IN ('customer', 'supplier', 'partner')),
  match_score int NOT NULL CHECK (match_score >= 0 AND match_score <= 100),
  engine_version text NOT NULL,
  brain_version text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_match_feedback_note_len CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
  CONSTRAINT intel_match_feedback_reason_explains_refusal CHECK (
    reason IS NULL OR judgment = 'not_relevant'
  ),
  CONSTRAINT intel_match_feedback_user_match_key UNIQUE (user_id, match_id),
  CONSTRAINT intel_match_feedback_id_user_id_key UNIQUE (id, user_id),

  -- The judged match is this owner's own, and stays paired with them.
  CONSTRAINT intel_match_feedback_match_owner_fkey
    FOREIGN KEY (match_id, user_id)
    REFERENCES public.intel_matches (id, user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  -- And so is the mission it was judged under.
  CONSTRAINT intel_match_feedback_objective_owner_fkey
    FOREIGN KEY (objective_id, user_id)
    REFERENCES public.intel_event_objectives (id, user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS intel_match_feedback_objective_idx
  ON public.intel_match_feedback (user_id, objective_id);

-- ---------------------------------------------------------------
-- intel_missed_opportunities: what ABC failed to suggest
-- ---------------------------------------------------------------
-- The half of the benchmark that judging recommendations cannot reach. A
-- system that only grades its own output can be perfect and useless: it says
-- nothing about the right company ABC ranked ninetieth or never scored at all.
--
-- The composite foreign key is the point. A missed opportunity names a company
-- **at this edition** — the pairing is checked by the database, so a flag
-- raised on Ambiente 2026 cannot be about a stand at Ambiente 2027.
--
-- There is deliberately no score and no rank here. ABC did not rank this
-- company; that is the whole complaint.
CREATE TABLE IF NOT EXISTS public.intel_missed_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles (id) ON DELETE CASCADE,

  objective_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.intel_events (id) ON DELETE CASCADE,
  presence_id uuid NOT NULL,

  reason text CHECK (reason IN (
    'strong_customer',
    'strong_supplier',
    'strong_partner',
    'strategic',
    'known_opportunity',
    'other'
  )),
  note text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_missed_opportunities_note_len CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
  CONSTRAINT intel_missed_opportunities_owner_objective_presence_key
    UNIQUE (user_id, objective_id, presence_id),
  CONSTRAINT intel_missed_opportunities_id_user_id_key UNIQUE (id, user_id),

  CONSTRAINT intel_missed_opportunities_objective_owner_fkey
    FOREIGN KEY (objective_id, user_id)
    REFERENCES public.intel_event_objectives (id, user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  -- The flagged company is exhibiting at the edition the flag is filed under.
  CONSTRAINT intel_missed_opportunities_presence_event_fkey
    FOREIGN KEY (presence_id, event_id)
    REFERENCES public.intel_company_presences (id, event_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS intel_missed_opportunities_objective_idx
  ON public.intel_missed_opportunities (user_id, objective_id);

-- ---------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------
ALTER TABLE public.intel_match_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_missed_opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intel_match_feedback_all_own" ON public.intel_match_feedback;
CREATE POLICY "intel_match_feedback_all_own" ON public.intel_match_feedback
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intel_missed_opportunities_all_own" ON public.intel_missed_opportunities;
CREATE POLICY "intel_missed_opportunities_all_own" ON public.intel_missed_opportunities
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.intel_match_feedback FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.intel_missed_opportunities FROM PUBLIC, anon, authenticated;

-- The owner may read their own judgments and write none of them directly.
--
-- Not because the judgment is ABC's — it is theirs, and it is the only thing in
-- this feature that is — but because each row carries the stamped record of
-- what ABC had recommended at that moment. A client able to INSERT could file a
-- judgment against a score ABC never gave, and the benchmark would then be
-- measuring a fiction. The route writes the row with the service role, reading
-- the match through the owner's own client first, and stamps the owner id from
-- the session rather than from the request. Same shape as intel_matches, and
-- for the same reason.
GRANT SELECT ON public.intel_match_feedback TO authenticated;
GRANT SELECT ON public.intel_missed_opportunities TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_match_feedback TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_missed_opportunities TO service_role;

-- anon: nothing, on both tables.

NOTIFY pgrst, 'reload schema';
