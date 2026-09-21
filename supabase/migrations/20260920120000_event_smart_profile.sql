-- ABC Smart Event Profile — what to show, and the invitation to show it.
--
-- Event Intelligence answers who is worth meeting and why. This adds the next
-- two questions: what should I show them, and how do I ask for the meeting.
--
-- ---------------------------------------------------------------
-- Why these are new tables and not the card's
-- ---------------------------------------------------------------
-- ABC already has a public card with identity, links, a showcase and a media
-- bucket, and the instinct to reuse it is right — this is a *contextual layer
-- on top of ABC*, not a second card product. Identity, the slug, the public
-- URL, the QR and the image bucket are all reused unchanged.
--
-- What could not be reused is `card_showcase_items`. It is eight images on the
-- card as a whole: no event, no edition, no product, no tags, no validity
-- window. Event material is the opposite of card-global — a video made for
-- Ambiente 2026 is not material for Ambiente 2027 unless somebody says so —
-- and bolting `event_id`, tags and a phase onto a table that ships in the
-- launch release would push event semantics into the card model and change a
-- table that is already live. So the card keeps its showcase, and the event
-- layer gets its own, and neither has to know about the other.
--
-- ---------------------------------------------------------------
-- First-party content is not a source fact
-- ---------------------------------------------------------------
-- Everything in these tables is written by the owner about their own company.
-- That makes it first-party marketing content, and it is kept in its own
-- tables precisely so it can never be confused with `intel_source_records`
-- (what an event listing says about somebody else) or with `intel_matches`
-- (what ABC inferred). Three kinds of claim, three homes, and the screens name
-- which is which.
--
-- Owner columns reference `abc_profiles` so account deletion reaches them by
-- the cascade that already runs, exactly as the rest of the feature does.

-- =================================================================
-- PRODUCTS — what the owner sells, as they describe it
-- =================================================================
-- Distinct from `intel_company_profiles.what_we_sell`, which is a text[] the
-- matching engine reads. That list answers "what should ABC look for"; this
-- answers "what am I going to talk about at this stand", and it needs an
-- identity because material and meeting briefs point at it.
CREATE TABLE IF NOT EXISTS public.intel_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles (id) ON DELETE CASCADE,

  name text NOT NULL,
  description text,

  -- Tags exist so a later, explicit feature can order material by relevance to
  -- a target. Nothing reads them for ranking today, and nothing should until
  -- the ordering is something a person asked for and can see the reason for.
  product_tags text[] NOT NULL DEFAULT '{}',
  industry_tags text[] NOT NULL DEFAULT '{}',
  use_case_tags text[] NOT NULL DEFAULT '{}',

  sort_order int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_products_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
  -- Target of the composite foreign keys below: the pair is what gets
  -- referenced, so nothing can point at one owner's product under another's id.
  CONSTRAINT intel_products_id_user_id_key UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS intel_products_user_sort_idx
  ON public.intel_products (user_id, sort_order);

-- =================================================================
-- EVENT MATERIAL — what to show, at one edition
-- =================================================================
-- `event_id` is not nullable, and that is the point: material belongs to one
-- edition of one fair. A teaser used at Ambiente 2026 becomes material for
-- Ambiente 2027 only when somebody deliberately creates a row for 2027.
-- Nothing copies it forward, because "we showed this last year" is a decision
-- and not a default.
--
-- `url` holds a reference, not bytes. The card-media bucket accepts images
-- only (image/jpeg, image/png, image/webp, 10 MB), so an image can live in
-- ABC's own storage and a video or a PDF is a link to wherever the company
-- already hosts it. That limit is a storage configuration, not a schema one;
-- when it changes, this column still holds the answer.
CREATE TABLE IF NOT EXISTS public.intel_event_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles (id) ON DELETE CASCADE,

  event_id uuid NOT NULL REFERENCES public.intel_events (id) ON DELETE CASCADE,
  product_id uuid,

  title text NOT NULL,
  description text,

  media_kind text NOT NULL
    CHECK (media_kind IN ('video', 'document', 'image', 'link', 'offer')),
  url text NOT NULL,

  -- The three moments a fair has. Material can be pinned to one of them, or
  -- left as 'any' and shown throughout.
  phase text NOT NULL DEFAULT 'any'
    CHECK (phase IN ('any', 'pre', 'live', 'post')),

  visible_from timestamptz,
  visible_until timestamptz,

  priority int NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),

  product_tags text[] NOT NULL DEFAULT '{}',
  industry_tags text[] NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_event_materials_title_len CHECK (char_length(title) BETWEEN 1 AND 120),
  -- A window that closes before it opens is a data entry mistake, not a rule
  -- the reader should have to reason about on the screen.
  CONSTRAINT intel_event_materials_window
    CHECK (visible_from IS NULL OR visible_until IS NULL OR visible_until > visible_from),

  CONSTRAINT intel_event_materials_id_user_id_key UNIQUE (id, user_id),

  CONSTRAINT intel_event_materials_product_owner_fkey
    FOREIGN KEY (product_id, user_id)
    REFERENCES public.intel_products (id, user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL (product_id)
);

CREATE INDEX IF NOT EXISTS intel_event_materials_owner_event_idx
  ON public.intel_event_materials (user_id, event_id, priority);

-- =================================================================
-- MEETING BRIEF — preparation, and an invitation that is only ever a draft
-- =================================================================
-- First, the pair a brief points at.
--
-- `intel_meeting_targets` has `id` as its primary key and carries `user_id`,
-- but nothing referenced the two together, so a composite foreign key had
-- nothing to aim at. This adds one, exactly as 20260919120000 did for
-- `contact_encounters` and for the same reason: it makes tenant agreement
-- something the database checks rather than something a route promises.
--
-- Purely additive. `id` is already unique, so every existing row satisfies it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'intel_meeting_targets_id_user_id_key'
      AND conrelid = 'public.intel_meeting_targets'::regclass
  ) THEN
    ALTER TABLE public.intel_meeting_targets
      ADD CONSTRAINT intel_meeting_targets_id_user_id_key UNIQUE (id, user_id);
  END IF;
END $$;

-- One brief per saved target: what I want to talk about, what I will show, and
-- the note I would send with it.
--
-- INVITATION != MEETING, enforced by the status column. The only values are
-- draft, ready and shared. There is deliberately no 'accepted', 'confirmed' or
-- 'scheduled', because ABC has no source of truth for any of them — nobody has
-- replied to anything inside ABC, and a status that implied otherwise would be
-- the product lying about a relationship.
--
-- TARGET != ENCOUNTER still holds too. A brief hangs off a target, a target
-- hangs off a match, and none of them is a meeting. `shared_at` records that
-- the owner sent or copied something, which is an act they performed — not
-- evidence that anybody met.
CREATE TABLE IF NOT EXISTS public.intel_meeting_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles (id) ON DELETE CASCADE,

  target_id uuid NOT NULL,
  product_id uuid,

  topic text,
  message text,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'shared')),
  shared_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intel_meeting_briefs_topic_len CHECK (topic IS NULL OR char_length(topic) <= 200),
  CONSTRAINT intel_meeting_briefs_message_len CHECK (message IS NULL OR char_length(message) <= 2000),
  -- A brief is shared when, and only when, there is a moment it was shared.
  CONSTRAINT intel_meeting_briefs_shared_at
    CHECK ((status = 'shared') = (shared_at IS NOT NULL)),

  CONSTRAINT intel_meeting_briefs_user_target_key UNIQUE (user_id, target_id),
  CONSTRAINT intel_meeting_briefs_id_user_id_key UNIQUE (id, user_id),

  CONSTRAINT intel_meeting_briefs_target_owner_fkey
    FOREIGN KEY (target_id, user_id)
    REFERENCES public.intel_meeting_targets (id, user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT intel_meeting_briefs_product_owner_fkey
    FOREIGN KEY (product_id, user_id)
    REFERENCES public.intel_products (id, user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL (product_id)
);

-- Which material is attached to which brief. A join table rather than an array
-- so the composite foreign keys can do their job on both sides: every row
-- names one owner, and both the brief and the material must be theirs.
CREATE TABLE IF NOT EXISTS public.intel_brief_materials (
  brief_id uuid NOT NULL,
  material_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.abc_profiles (id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (brief_id, material_id),

  CONSTRAINT intel_brief_materials_brief_owner_fkey
    FOREIGN KEY (brief_id, user_id)
    REFERENCES public.intel_meeting_briefs (id, user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT intel_brief_materials_material_owner_fkey
    FOREIGN KEY (material_id, user_id)
    REFERENCES public.intel_event_materials (id, user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS intel_brief_materials_brief_idx
  ON public.intel_brief_materials (brief_id, sort_order);

-- =================================================================
-- ROW LEVEL SECURITY
-- =================================================================

ALTER TABLE public.intel_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_event_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_meeting_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_brief_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intel_products_all_own" ON public.intel_products;
CREATE POLICY "intel_products_all_own" ON public.intel_products
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intel_materials_all_own" ON public.intel_event_materials;
CREATE POLICY "intel_materials_all_own" ON public.intel_event_materials
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intel_briefs_all_own" ON public.intel_meeting_briefs;
CREATE POLICY "intel_briefs_all_own" ON public.intel_meeting_briefs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intel_brief_materials_all_own" ON public.intel_brief_materials;
CREATE POLICY "intel_brief_materials_all_own" ON public.intel_brief_materials
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =================================================================
-- TABLE PRIVILEGES
-- =================================================================
-- REVOKE first, every time: Supabase default privileges hand every new table
-- to anon and authenticated, so omitting a GRANT withholds nothing.
--
-- These four are entirely the owner's own content, so unlike `intel_matches`
-- the owner may write them directly. The columns withheld from UPDATE are the
-- ones that say which owner, which event and which target a row is about —
-- changing those would move somebody's material to another fair, or their
-- invitation to another company.

REVOKE ALL ON public.intel_products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.intel_event_materials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.intel_meeting_briefs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.intel_brief_materials FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, DELETE ON public.intel_products TO authenticated;
GRANT UPDATE (
  name, description, product_tags, industry_tags, use_case_tags, sort_order, updated_at
) ON public.intel_products TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.intel_event_materials TO authenticated;
GRANT UPDATE (
  product_id, title, description, media_kind, url, phase,
  visible_from, visible_until, priority, product_tags, industry_tags, updated_at
) ON public.intel_event_materials TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.intel_meeting_briefs TO authenticated;
GRANT UPDATE (
  product_id, topic, message, status, shared_at, updated_at
) ON public.intel_meeting_briefs TO authenticated;

-- A join row is created and removed, never edited: changing which material an
-- attachment points at is the same as detaching one and attaching another, and
-- the latter is the one that leaves an honest trail.
GRANT SELECT, INSERT, DELETE ON public.intel_brief_materials TO authenticated;
GRANT UPDATE (sort_order) ON public.intel_brief_materials TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_event_materials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_meeting_briefs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_brief_materials TO service_role;

-- anon is granted nothing and holds no policy on any of these. The Smart Event
-- Profile is prepared privately; sharing it is an act the owner performs, not
-- a door left open.

NOTIFY pgrst, 'reload schema';
