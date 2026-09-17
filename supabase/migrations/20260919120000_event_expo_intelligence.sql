-- ABC Event & Expo Intelligence — domain foundation.
--
-- ABC records what happened after you met somebody. This adds the part before:
-- given what a company does, sells and needs, which exhibitors at a fair are
-- worth walking to, and why. Nothing here touches the relationship graph —
-- scanned_contacts, contact_encounters, scan_batches and the CRM tables are
-- read by no statement in this file and written by none.
--
-- Naming: everything is prefixed `intel_`. There is already a migration called
-- 20260626160000_event_intelligence.sql and it is a different thing entirely —
-- per-contact enrichment columns (events_past, person_bio) on scanned_contacts.
-- A prefix costs six characters and stops the two being read as one feature.
--
-- ---------------------------------------------------------------
-- Two graphs, and the line between them
-- ---------------------------------------------------------------
-- The public graph (events, companies, presences, provenance) is factual
-- business information about a fair. It carries no owner column at all, so
-- there is nothing in it to leak between accounts, and it is written only by
-- the service role — ingestion is a server job, never a request an owner makes
-- directly.
--
-- The private graph (profiles, objectives, matches, targets) is one account's
-- commercial intent and is never shown to another. It carries user_id, RLS and
-- an explicit privilege list.
--
-- A match points at a presence. A presence knows nothing about who is
-- interested in it. That direction is the whole separation.

-- =================================================================
-- PUBLIC EVENT / BUSINESS GRAPH
-- =================================================================

-- ---------------------------------------------------------------
-- intel_events
-- ---------------------------------------------------------------
-- `event_key` is the identity, and it is deliberately the same string
-- lib/events/workspace.ts already derives from an event's name for its URLs.
-- ABC therefore has one address space for fairs: /events/medica-2026 is the
-- meetings you recorded there, /events/intelligence/medica-2026 is who is worth
-- meeting, and neither had to be told about the other.
--
-- The edition lives in the name, because that is how people already type it at
-- a stand — "MEDICA 2026", not "MEDICA" plus a year column the workspace never
-- had. edition_year below is descriptive, never identifying: making it part of
-- the key would split one fair into two addresses the moment a listing omitted
-- the year.
CREATE TABLE IF NOT EXISTS public.intel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  event_key text NOT NULL UNIQUE,
  name text NOT NULL,

  edition_year int,
  organizer text,
  venue text,
  city text,
  country text,
  starts_on date,
  ends_on date,
  website_url text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- intel_companies
-- ---------------------------------------------------------------
-- The organisation itself, independent of any fair. Hall and stand are not
-- here: a company exhibits at many events and stands in a different place at
-- each, so those belong to the presence below.
--
-- `merge_candidate_of` is how uncertainty is recorded rather than resolved. Two
-- listings with the same normalised name and no domain to confirm it might be
-- one company or two; guessing either way is wrong, so both rows exist and one
-- points at the other for a human to settle later. Nothing in the application
-- follows this pointer to merge anything.
CREATE TABLE IF NOT EXISTS public.intel_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  display_name text NOT NULL,
  name_normalized text NOT NULL,
  website_domain text,
  country text,
  description_public text,
  categories text[] NOT NULL DEFAULT '{}',

  merge_candidate_of uuid REFERENCES public.intel_companies (id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A domain is the one identifier two listings can share and mean it. Partial,
-- because most exhibitor listings have no website at all and a pile of NULLs
-- must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS intel_companies_domain_key
  ON public.intel_companies (website_domain)
  WHERE website_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS intel_companies_name_country_idx
  ON public.intel_companies (name_normalized, country);

-- ---------------------------------------------------------------
-- intel_company_presences
-- ---------------------------------------------------------------
-- "This company is exhibiting at this event", and everything true only there.
--
-- A presence that disappears from a later fetch is marked withdrawn rather than
-- deleted. Someone may already have saved it as a target and written a note on
-- it; deleting the row would take their note with it and leave the plan with a
-- hole it cannot explain.
CREATE TABLE IF NOT EXISTS public.intel_company_presences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  event_id uuid NOT NULL REFERENCES public.intel_events (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.intel_companies (id) ON DELETE CASCADE,

  exhibitor_display_name text,
  hall text,
  stand text,
  event_categories text[] NOT NULL DEFAULT '{}',
  event_description text,
  products_services text[] NOT NULL DEFAULT '{}',
  listing_url text,

  status text NOT NULL DEFAULT 'listed'
    CHECK (status IN ('listed', 'withdrawn')),

  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_company_presences_event_company_key UNIQUE (event_id, company_id)
);

CREATE INDEX IF NOT EXISTS intel_company_presences_event_idx
  ON public.intel_company_presences (event_id);

-- ---------------------------------------------------------------
-- intel_source_records
-- ---------------------------------------------------------------
-- Where a fact came from, when it was fetched, and what it looked like then.
--
-- `content_hash` is what makes a re-import free: an unchanged payload updates
-- last_seen_at and stops. The unique key is what makes it idempotent: the same
-- provider record at the same payload version is one row however many times it
-- arrives.
CREATE TABLE IF NOT EXISTS public.intel_source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  provider text NOT NULL,
  provider_record_id text NOT NULL,
  payload_version text NOT NULL DEFAULT 'v1',

  source_url text,

  entity_type text NOT NULL CHECK (entity_type IN ('event', 'company', 'presence')),
  entity_id uuid NOT NULL,

  content_hash text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_updated_at timestamptz,

  CONSTRAINT intel_source_records_provider_record_key
    UNIQUE (provider, provider_record_id, payload_version)
);

CREATE INDEX IF NOT EXISTS intel_source_records_entity_idx
  ON public.intel_source_records (entity_type, entity_id);

-- =================================================================
-- PRIVATE INTELLIGENCE (owner-scoped)
-- =================================================================

-- ---------------------------------------------------------------
-- intel_company_profiles
-- ---------------------------------------------------------------
-- What the owner's own company does, sells and needs. One per account for now:
-- multi-company accounts are a product decision nobody has taken, and a unique
-- constraint is easier to relax later than a duplicate is to clean up.
--
-- The text[] columns are all optional. The form asks four questions; the rest
-- exist so that answering more makes matching better rather than requiring a
-- thirty-field CRM form before anything works at all.
-- The owner reference is to abc_profiles rather than to auth.users, and that is
-- what makes account deletion continue to work without this file touching it.
-- remove_account_data() deletes the profile row last, deliberately, because it
-- holds the identity fields; every table below hangs off this one by a cascade,
-- so the owner's intent, objectives, matches and targets go with it in the same
-- statement. Deleting the auth user reaches them the same way, one link further
-- up, since abc_profiles already cascades from auth.users.
--
-- The alternative — pointing at auth.users and adding four DELETE lines to
-- remove_account_data — would mean re-issuing a function that is part of the
-- shipped release. A foreign key says the same thing, in one place, and cannot
-- be forgotten by a future code path.
CREATE TABLE IF NOT EXISTS public.intel_company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles (id) ON DELETE CASCADE,

  company_name text,
  what_we_do text,
  what_we_sell text[] NOT NULL DEFAULT '{}',
  what_we_buy text[] NOT NULL DEFAULT '{}',
  who_we_want_to_meet text,

  target_industries text[] NOT NULL DEFAULT '{}',
  target_company_types text[] NOT NULL DEFAULT '{}',
  capabilities text[] NOT NULL DEFAULT '{}',
  technologies text[] NOT NULL DEFAULT '{}',
  materials text[] NOT NULL DEFAULT '{}',
  certifications text[] NOT NULL DEFAULT '{}',
  geographies text[] NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_company_profiles_user_key UNIQUE (user_id),
  -- Target of the composite foreign key below: the pair is what gets referenced,
  -- so an objective can never name one owner's profile under another's id.
  CONSTRAINT intel_company_profiles_id_user_id_key UNIQUE (id, user_id)
);

-- ---------------------------------------------------------------
-- intel_event_objectives
-- ---------------------------------------------------------------
-- The profile says who we are. This says what we want from *this* fair.
CREATE TABLE IF NOT EXISTS public.intel_event_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles (id) ON DELETE CASCADE,

  event_id uuid NOT NULL REFERENCES public.intel_events (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,

  goals text,
  sell_focus text[] NOT NULL DEFAULT '{}',
  buy_focus text[] NOT NULL DEFAULT '{}',
  partner_focus text[] NOT NULL DEFAULT '{}',
  priority_industries text[] NOT NULL DEFAULT '{}',
  priority_geographies text[] NOT NULL DEFAULT '{}',
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_event_objectives_user_event_key UNIQUE (user_id, event_id),
  CONSTRAINT intel_event_objectives_id_user_id_key UNIQUE (id, user_id),

  CONSTRAINT intel_event_objectives_profile_owner_fkey
    FOREIGN KEY (profile_id, user_id)
    REFERENCES public.intel_company_profiles (id, user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

-- ---------------------------------------------------------------
-- intel_matches
-- ---------------------------------------------------------------
-- One scored suggestion: this presence, for this objective, in this direction.
--
-- `reasons` and `evidence` are kept apart on purpose and stay apart all the way
-- to the screen. Evidence is what the listing says, with the source record that
-- carries it. Reasons are ABC's inference from that evidence. Merging them into
-- one prose blob is how a guess starts being read as a fact.
--
-- Note the privileges further down: `authenticated` may SELECT these rows and
-- may not write them. A score is an assertion ABC makes, computed server-side
-- from a versioned engine; a client that could INSERT one could award itself a
-- 100 and change what the product appears to have concluded.
CREATE TABLE IF NOT EXISTS public.intel_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles (id) ON DELETE CASCADE,

  objective_id uuid NOT NULL,
  presence_id uuid NOT NULL REFERENCES public.intel_company_presences (id) ON DELETE CASCADE,

  match_type text NOT NULL CHECK (match_type IN ('customer', 'supplier', 'partner')),
  score int NOT NULL CHECK (score >= 0 AND score <= 100),

  engine_version text NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,

  matched_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_matches_objective_presence_type_key
    UNIQUE (objective_id, presence_id, match_type),
  CONSTRAINT intel_matches_id_user_id_key UNIQUE (id, user_id),

  CONSTRAINT intel_matches_objective_owner_fkey
    FOREIGN KEY (objective_id, user_id)
    REFERENCES public.intel_event_objectives (id, user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS intel_matches_objective_score_idx
  ON public.intel_matches (objective_id, score DESC);

-- ---------------------------------------------------------------
-- The pair the encounter link points at
-- ---------------------------------------------------------------
-- contact_encounters has `id` as its primary key and carries user_id, but had
-- no constraint on the two together, so nothing could reference the pair. This
-- adds one, exactly as 20260823120000 did to scanned_contacts for the same
-- reason and with the same effect: it makes tenant agreement something the
-- database checks rather than something a route promises.
--
-- Purely additive. `id` is already unique, so every existing row satisfies it
-- and no data can fail the constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contact_encounters_id_user_id_key'
      AND conrelid = 'public.contact_encounters'::regclass
  ) THEN
    ALTER TABLE public.contact_encounters
      ADD CONSTRAINT contact_encounters_id_user_id_key UNIQUE (id, user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------
-- intel_meeting_targets
-- ---------------------------------------------------------------
-- A company the owner has decided is worth their time. Private, theirs, and
-- emphatically not a meeting.
--
-- TARGET != ENCOUNTER is enforced by the shape of this table rather than by a
-- rule somebody has to remember:
--
--   * `status` cannot be set to 'met'. The CHECK below allows saved, planned
--     and skipped and nothing else, so no writer — route, PostgREST call or
--     future code path — can declare a meeting happened.
--   * "met" is instead *derived* from met_encounter_id being present, and that
--     column can only point at a row of contact_encounters belonging to the
--     same owner, because the composite foreign key references the (id, user_id)
--     pair rather than the id alone.
--   * Nothing in this migration inserts into contact_encounters. The only way a
--     target becomes met is that the owner recorded a real meeting through the
--     existing scan, QR, exchange or manual paths and then linked it.
--
-- ON DELETE SET NULL on that link is the honest outcome for a deleted contact:
-- the meeting record is gone, so the target quietly goes back to being a
-- target, keeping the owner's own note and priority. It cannot be left claiming
-- a meeting that no longer exists, because the claim was never stored.
CREATE TABLE IF NOT EXISTS public.intel_meeting_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles (id) ON DELETE CASCADE,

  match_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.intel_events (id) ON DELETE CASCADE,
  presence_id uuid NOT NULL REFERENCES public.intel_company_presences (id) ON DELETE CASCADE,

  status text NOT NULL DEFAULT 'saved'
    CHECK (status IN ('saved', 'planned', 'skipped')),
  priority int NOT NULL DEFAULT 2
    CHECK (priority >= 1 AND priority <= 3),

  private_note text,
  scheduled_for timestamptz,

  met_encounter_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_meeting_targets_user_match_key UNIQUE (user_id, match_id),

  CONSTRAINT intel_meeting_targets_match_owner_fkey
    FOREIGN KEY (match_id, user_id)
    REFERENCES public.intel_matches (id, user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT intel_meeting_targets_encounter_owner_fkey
    FOREIGN KEY (met_encounter_id, user_id)
    REFERENCES public.contact_encounters (id, user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL (met_encounter_id)
);

CREATE INDEX IF NOT EXISTS intel_meeting_targets_event_idx
  ON public.intel_meeting_targets (user_id, event_id);

-- =================================================================
-- ROW LEVEL SECURITY
-- =================================================================

ALTER TABLE public.intel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_company_presences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_source_records ENABLE ROW LEVEL SECURITY;

-- Shared reference data: any signed-in account may read a fair's exhibitor
-- listing, nobody may write it through the API, and anon sees none of it. There
-- is no owner column to filter on and nothing private in these rows; the
-- restriction that matters is the absence of a write policy and of any write
-- grant, which together mean ingestion can only happen with the service role.
DROP POLICY IF EXISTS "intel_events_read_signed_in" ON public.intel_events;
CREATE POLICY "intel_events_read_signed_in" ON public.intel_events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "intel_companies_read_signed_in" ON public.intel_companies;
CREATE POLICY "intel_companies_read_signed_in" ON public.intel_companies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "intel_presences_read_signed_in" ON public.intel_company_presences;
CREATE POLICY "intel_presences_read_signed_in" ON public.intel_company_presences
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "intel_source_records_read_signed_in" ON public.intel_source_records;
CREATE POLICY "intel_source_records_read_signed_in" ON public.intel_source_records
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.intel_company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_event_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_meeting_targets ENABLE ROW LEVEL SECURITY;

-- Same shape as encounters_all_own. WITH CHECK is spelled out rather than left
-- to default from USING, so an insert policy is never one that got missed.
DROP POLICY IF EXISTS "intel_profiles_all_own" ON public.intel_company_profiles;
CREATE POLICY "intel_profiles_all_own" ON public.intel_company_profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intel_objectives_all_own" ON public.intel_event_objectives;
CREATE POLICY "intel_objectives_all_own" ON public.intel_event_objectives
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intel_matches_all_own" ON public.intel_matches;
CREATE POLICY "intel_matches_all_own" ON public.intel_matches
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intel_targets_all_own" ON public.intel_meeting_targets;
CREATE POLICY "intel_targets_all_own" ON public.intel_meeting_targets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =================================================================
-- TABLE PRIVILEGES
-- =================================================================
-- RLS decides which rows a role may touch; it does not decide which columns, and
-- it is not consulted at all for a role that was never granted the verb. Both
-- questions matter because an authenticated user holds a real Postgres role and
-- can speak to PostgREST without passing through any route of ours.
--
-- REVOKE first, every time. This project has Supabase's default privileges
-- active, so a newly created table arrives already granting ALL to anon and
-- authenticated: omitting a GRANT withholds nothing, and the lists below would
-- be decoration over full access.

REVOKE ALL ON public.intel_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.intel_companies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.intel_company_presences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.intel_source_records FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.intel_events TO authenticated;
GRANT SELECT ON public.intel_companies TO authenticated;
GRANT SELECT ON public.intel_company_presences TO authenticated;
GRANT SELECT ON public.intel_source_records TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_companies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_company_presences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_source_records TO service_role;

REVOKE ALL ON public.intel_company_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.intel_event_objectives FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.intel_matches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.intel_meeting_targets FROM PUBLIC, anon, authenticated;

-- The owner's own answers, revisable because the point is that they change as
-- the business does. user_id and id are absent from every UPDATE list: they say
-- whose row this is, which is settled at INSERT and never edited afterwards.
GRANT SELECT, INSERT ON public.intel_company_profiles TO authenticated;
GRANT UPDATE (
  company_name, what_we_do, what_we_sell, what_we_buy, who_we_want_to_meet,
  target_industries, target_company_types, capabilities, technologies,
  materials, certifications, geographies, updated_at
) ON public.intel_company_profiles TO authenticated;

GRANT SELECT, INSERT ON public.intel_event_objectives TO authenticated;
GRANT UPDATE (
  goals, sell_focus, buy_focus, partner_focus,
  priority_industries, priority_geographies, notes, updated_at
) ON public.intel_event_objectives TO authenticated;

-- Matches are read-only to the account they belong to. They are ABC's
-- conclusion, produced server-side by a versioned engine from the owner's
-- stated intent and the listing's facts; an owner who could write one could
-- change what the product says it concluded, and a score would stop meaning
-- anything. Ingestion and matching both run with the service role.
GRANT SELECT ON public.intel_matches TO authenticated;

-- Targets are the opposite: entirely the owner's decision, so they may create,
-- revise and remove them. The columns withheld from UPDATE are the ones that
-- say which match and which fair this target is about — changing those would
-- silently move a note and a priority onto a different company.
--
-- met_encounter_id *is* updatable, and is safe precisely because of the
-- composite foreign key: the only value that will be accepted is the id of an
-- encounter the same owner recorded.
GRANT SELECT, INSERT, DELETE ON public.intel_meeting_targets TO authenticated;
GRANT UPDATE (
  status, priority, private_note, scheduled_for, met_encounter_id, updated_at
) ON public.intel_meeting_targets TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_company_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_event_objectives TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_matches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_meeting_targets TO service_role;

-- anon is granted nothing on any table in this file, and holds no policy on
-- one. A signed-out request cannot enumerate exhibitors, let alone anybody's
-- intent.

NOTIFY pgrst, 'reload schema';
