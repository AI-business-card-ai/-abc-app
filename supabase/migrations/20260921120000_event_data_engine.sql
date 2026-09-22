-- ABC Event Data Engine V1 and Product Brain V1.
--
-- Additive. No table that already exists is altered beyond two new nullable
-- columns on intel_source_records, and no constraint, grant or policy of the
-- two earlier Event Intelligence migrations is changed. Local PGlite only:
-- this is not applied to the hosted database, which is an owner decision.
--
-- Two halves, and they never meet in the schema:
--
--   EVENT DATA ENGINE — shared, ownerless, service-role only. Where a listing
--   came from, what exactly the source said, and whether a run of that source
--   was healthy enough to publish.
--
--   PRODUCT BRAIN — owner-scoped, RLS. What ABC read about the owner's own
--   business and what it inferred from that, each kept apart from what the
--   owner typed (which stays in intel_company_profiles and intel_products and
--   is not copied here).

-- =================================================================
-- EVENT DATA ENGINE
-- =================================================================

-- ---------------------------------------------------------------
-- intel_source_records: what the source said, not only that it spoke
-- ---------------------------------------------------------------
-- `snapshot` is the listing as that source stated it, in ABC's normalised
-- vocabulary — the same object `content_hash` is computed over. It is the
-- SOURCE FACT layer: the presence and company rows are ABC's merged, current
-- view, and a later source can fill a gap in them; the snapshot is what one
-- source said at one moment and is never merged into. It also makes field-level
-- change detection possible (a changed stand, a new website) without a second
-- refresh system. It holds only fields of the provider contract, which has no
-- field for personal data — never HTML, never an "extra" bag.
--
-- `run_id` names the source run that last wrote the row. A soft reference, no
-- foreign key: runs are operational records and may be pruned without taking
-- the provenance of a published fact with them.
ALTER TABLE public.intel_source_records ADD COLUMN IF NOT EXISTS snapshot jsonb;
ALTER TABLE public.intel_source_records ADD COLUMN IF NOT EXISTS run_id uuid;

-- ---------------------------------------------------------------
-- intel_source_runs: source health, internal
-- ---------------------------------------------------------------
-- One row per attempt to read an event source: what it found, what it
-- rejected, how the quality gates judged it, and whether it was published.
--
-- A completed fetch is not a success. A run whose gates fail is recorded here
-- as `blocked` and writes nothing else — no company, no presence, no source
-- record, no withdrawal — so a directory that yesterday listed 5,000 exhibitors
-- and today returns 43 cannot quietly withdraw 4,957 of them.
--
-- The checks below make "published" mean what it says: a run may be published
-- only when it was healthy or degraded, or when an operator explicitly
-- overrode named gates (recorded in `overrides`), and a published run always
-- carries the ingestion report of what it wrote.
CREATE TABLE IF NOT EXISTS public.intel_source_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  provider text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN (
    'official_api', 'official_directory', 'official_detail',
    'company_website', 'secondary', 'file'
  )),
  payload_version text NOT NULL,

  -- The provider's own identifier for the event; opaque to ABC.
  event_ref text NOT NULL,
  -- Known once the source described the edition; null when it never did.
  event_key text,
  event_id uuid REFERENCES public.intel_events (id) ON DELETE CASCADE,

  status text NOT NULL CHECK (status IN ('published', 'blocked', 'failed')),
  health text NOT NULL CHECK (health IN ('healthy', 'degraded', 'unhealthy', 'unavailable')),

  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  duration_ms int NOT NULL CHECK (duration_ms >= 0),

  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  gates jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Codes only. Never a message, a URL with a query string, or a token.
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  ingest jsonb,
  changes jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_source_runs_publish_needs_health CHECK (
    status <> 'published'
    OR health IN ('healthy', 'degraded')
    OR jsonb_array_length(overrides) > 0
  ),
  CONSTRAINT intel_source_runs_publish_has_report CHECK (status <> 'published' OR ingest IS NOT NULL),
  CONSTRAINT intel_source_runs_blocked_is_unhealthy CHECK (status <> 'blocked' OR health = 'unhealthy'),
  CONSTRAINT intel_source_runs_blocked_wrote_nothing CHECK (status = 'published' OR ingest IS NULL),
  CONSTRAINT intel_source_runs_window CHECK (finished_at >= started_at)
);

-- The baseline a new run is judged against: the last published run of the
-- same provider for the same edition.
CREATE INDEX IF NOT EXISTS intel_source_runs_baseline_idx
  ON public.intel_source_runs (provider, event_key, status, started_at DESC);

ALTER TABLE public.intel_source_runs ENABLE ROW LEVEL SECURITY;

-- Operational intelligence, not product data. No policy for anyone, no grant to
-- anon or authenticated: a signed-in account cannot learn which sources ABC
-- reads, how often, or how they failed.
REVOKE ALL ON public.intel_source_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_source_runs TO service_role;

-- =================================================================
-- PRODUCT BRAIN
-- =================================================================
-- Three kinds of statement about the owner's business, and where each lives:
--
--   OWNER FACT      what the owner typed. intel_company_profiles, intel_products
--                   and abc_profiles — unchanged, and not duplicated here.
--   SOURCE FACT     what a document the owner pointed ABC at says, quoted with
--                   the page it came from. origin = 'source'.
--   ABC ANALYSIS    what ABC inferred, with the rule it used and the statements
--                   it rests on. origin = 'analysis'.
--
-- Nothing here feeds matching until the owner confirms it. A proposed fact is
-- ABC's reading; a confirmed one is a reading the owner agreed with — and even
-- then it keeps its origin, so a confirmed inference is never presented as
-- something the owner or a source said.

-- ---------------------------------------------------------------
-- intel_brain_documents: what ABC read
-- ---------------------------------------------------------------
-- One row per page or document read for the owner. The text itself is not
-- kept: facts quote the passage they rest on, and a page ABC read once is not
-- ABC's to archive.
CREATE TABLE IF NOT EXISTS public.intel_brain_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles (id) ON DELETE CASCADE,

  document_kind text NOT NULL CHECK (document_kind IN ('website_page', 'document')),
  url text NOT NULL,
  title text,
  page_kind text,
  content_hash text NOT NULL,
  extractor_version text NOT NULL,
  retrieved_at timestamptz NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_brain_documents_url_scheme CHECK (url ~ '^https?://'),
  CONSTRAINT intel_brain_documents_user_url_key UNIQUE (user_id, url)
);

CREATE INDEX IF NOT EXISTS intel_brain_documents_user_idx
  ON public.intel_brain_documents (user_id, retrieved_at DESC);

-- ---------------------------------------------------------------
-- intel_brain_facts: what ABC read, and what it concluded
-- ---------------------------------------------------------------
-- The checks are the design:
--
--   * No anonymous fact. `evidence` is a non-empty array — every row says
--     where it came from.
--   * ANALYSIS ≠ SOURCE FACT. An inference carries the rule that produced it
--     (`basis`); a source fact carries none. A row cannot be one while
--     claiming to be the other.
--   * A decision has a moment. `decided_at` is set exactly when the owner has
--     confirmed or rejected, and never for a proposal.
--
-- A rejected fact is kept, not deleted, so re-reading the same website does
-- not propose it again.
CREATE TABLE IF NOT EXISTS public.intel_brain_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles (id) ON DELETE CASCADE,

  kind text NOT NULL CHECK (kind IN (
    'company_name', 'summary', 'country',
    'product', 'service', 'capability',
    'industry', 'application',
    'customer_type', 'supplier_need', 'partner_type',
    'market', 'certification', 'material', 'technology'
  )),
  value text NOT NULL,
  value_key text NOT NULL,

  origin text NOT NULL CHECK (origin IN ('source', 'analysis')),
  basis text,
  evidence jsonb NOT NULL,

  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  decided_at timestamptz,

  extractor_version text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_brain_facts_value_len CHECK (char_length(value) BETWEEN 1 AND 300),
  CONSTRAINT intel_brain_facts_evidence_present CHECK (
    jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 1
  ),
  CONSTRAINT intel_brain_facts_analysis_has_basis CHECK ((origin = 'analysis') = (basis IS NOT NULL)),
  CONSTRAINT intel_brain_facts_decision_moment CHECK ((status = 'proposed') = (decided_at IS NULL)),
  CONSTRAINT intel_brain_facts_user_kind_value_key UNIQUE (user_id, kind, value_key)
);

CREATE INDEX IF NOT EXISTS intel_brain_facts_user_status_idx
  ON public.intel_brain_facts (user_id, status);

ALTER TABLE public.intel_brain_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_brain_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intel_brain_documents_all_own" ON public.intel_brain_documents;
CREATE POLICY "intel_brain_documents_all_own" ON public.intel_brain_documents
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intel_brain_facts_all_own" ON public.intel_brain_facts;
CREATE POLICY "intel_brain_facts_all_own" ON public.intel_brain_facts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.intel_brain_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.intel_brain_facts FROM PUBLIC, anon, authenticated;

-- What ABC read is the owner's to see and nobody's to rewrite: reading a page
-- is something ABC did, server-side, and a client that could insert a document
-- could manufacture provenance.
GRANT SELECT ON public.intel_brain_documents TO authenticated;

-- The owner decides; ABC extracts. The owner may confirm or reject a fact and
-- nothing else — its value, its origin, its basis and its evidence are ABC's
-- record of what it read and concluded. An owner who disagrees with the value
-- rejects it and says the true thing in their profile, where it is an OWNER
-- FACT, rather than editing ABC's reading into something it never was.
GRANT SELECT ON public.intel_brain_facts TO authenticated;
GRANT UPDATE (status, decided_at, updated_at) ON public.intel_brain_facts TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_brain_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_brain_facts TO service_role;

-- anon: nothing, on every table in this file.

NOTIFY pgrst, 'reload schema';
