-- Multi-card scan: one photo (or one guided session), many cards, one context.
--
-- The product already has the right shape for a meeting: `contact_encounters`
-- says a contact is a person and an encounter is a time you met them. Scanning
-- ten cards at one stand is ten people and one meeting, so nothing here invents
-- a second notion of context — the batch holds the context once, and each saved
-- contact gets an ordinary encounter carrying it. Everything downstream that
-- already reads encounters (the contact screen, follow-ups, CRM export) works on
-- batch contacts on day one, without being told the batch exists.
--
-- Two tables and two columns. The batch is the session, the item is a card the
-- vision pass found, and `scanned_contacts` gains a back-reference so a contact
-- can say which handshake it came out of.

-- ---------------------------------------------------------------
-- The batch
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scan_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The owner, and the only person who may ever see it. Never the scanned
  -- people: the same distinction `contact_encounters.user_id` draws.
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- 'draft' while cards are being added and reviewed, 'saved' once contacts
  -- exist. A batch is never deleted on save: it is the record of the session,
  -- and the contacts point back at it.
  status text NOT NULL DEFAULT 'draft',

  -- How the cards arrived: 'single_photo' when one image held several cards,
  -- 'guided' when the owner captured them one at a time into the same batch,
  -- 'mixed' when both. Recorded because the two produce different failure
  -- modes and we will want to know which one people actually use.
  source_kind text NOT NULL DEFAULT 'single_photo',

  -- The shared meeting context, structured rather than free text, because every
  -- one of these already has a home on the encounter it will be copied into.
  -- Nullable throughout: a batch saved without context is still a batch, and an
  -- empty encounter is exactly what a single scan with no notes already writes.
  shared_event text,
  shared_event_normalized text,
  shared_location text,
  shared_discussed text,
  shared_next_action text,
  shared_follow_up_at timestamptz,
  -- When the meeting happened, which is not when the row was written.
  shared_met_at timestamptz,

  -- Counters, maintained by the save path. These are the analytics record for
  -- the feature: how many cards a session found and how many the owner kept.
  -- Kept as columns rather than as an events table because they describe this
  -- batch, and a batch is already a row.
  total_detected integer NOT NULL DEFAULT 0,
  total_saved integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  saved_at timestamptz,

  CONSTRAINT scan_batches_status_check
    CHECK (status IN ('draft', 'saved')),
  CONSTRAINT scan_batches_source_kind_check
    CHECK (source_kind IN ('single_photo', 'guided', 'mixed'))
);

-- Same reason contact_encounters carries one: the item table's composite
-- foreign key needs a (id, user_id) pair to point at, so that attaching an item
-- to somebody else's batch is rejected by the database rather than by a route.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scan_batches_id_user_id_key'
      AND conrelid = 'public.scan_batches'::regclass
  ) THEN
    ALTER TABLE public.scan_batches
      ADD CONSTRAINT scan_batches_id_user_id_key UNIQUE (id, user_id);
  END IF;
END $$;

-- The one list the UI asks for: my batches, newest first.
CREATE INDEX IF NOT EXISTS scan_batches_user_created_idx
  ON public.scan_batches (user_id, created_at DESC);

-- ---------------------------------------------------------------
-- The cards inside it
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scan_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  batch_id uuid NOT NULL,
  user_id uuid NOT NULL,

  -- Reading order within the batch, so the review screen and the saved result
  -- agree about which card is which. Unique per batch: two cards cannot both be
  -- third.
  position integer NOT NULL,

  -- What the vision pass read, after the same sanitizer a single scan uses.
  -- All nullable: a card photographed at an angle may give up a company and
  -- nothing else, and a partial contact the owner can correct is worth more
  -- than a rejected one.
  first_name text,
  last_name text,
  company text,
  role text,
  email text,
  phone text,
  website text,
  linkedin_url text,

  -- The model's own account of what it saw, kept separately from the parsed
  -- fields. Parsed data is what the product uses; this is what it was derived
  -- from, and the two must not be confused when a parse turns out wrong.
  raw_ocr jsonb,

  -- 0..1, the model's confidence that this region really was a business card
  -- and was read cleanly. Drives a warning on the review screen, never a
  -- rejection — trade-fair lighting is not the owner's fault.
  confidence real,

  -- Machine-readable notes about why an item might need a look: 'low_text',
  -- 'no_name', 'no_contact_method', 'possible_duplicate'. Text array rather
  -- than prose so the UI can decide how to say it.
  warnings text[] NOT NULL DEFAULT '{}',

  -- The owner's decision. Everything arrives selected; unticking is how a false
  -- detection or a card they did not want is dropped without deleting the
  -- record that it was found.
  selected boolean NOT NULL DEFAULT true,

  -- Null until the batch is saved, then the contact this card resolved to.
  -- Also the idempotency guard: an item that already has a contact is never
  -- saved twice, so pressing Save again after a partial failure finishes the
  -- job instead of duplicating the people who already succeeded.
  created_contact_id uuid,

  -- The meeting this card produced.
  --
  -- Stored rather than rediscovered, because "the newest encounter" stops being
  -- the right answer the moment the owner meets that person again: exporting
  -- this batch a week later must still send the meeting this batch was, not a
  -- later one that happened to overtake it.
  created_encounter_id uuid,

  -- The person the owner already has, when this card matched one.
  --
  -- A contact is a person and an encounter is a time you met them, so meeting
  -- somebody a second time must not manufacture a second copy of them. When
  -- this is set and `link_to_existing` is true, saving adds an encounter to
  -- that person instead of creating a new one — which is the difference between
  -- a relationship history and a list with the same name in it four times.
  link_contact_id uuid,

  -- The owner's decision about that match, defaulted to the canonical rule.
  -- Deterministic identifiers can still be shared or stale — a switchboard
  -- number, a reused info@ address — so the owner can override per card and
  -- get a genuinely separate person.
  link_to_existing boolean NOT NULL DEFAULT true,

  -- Whether this card has already been paid for.
  --
  -- A Smart Scan credit buys the processing of one physical card — the vision
  -- call, the parse, the normalization — and that work costs the same whether
  -- the person turns out to be new or somebody met before. So the unit is the
  -- card, not the person, and this column is where "paid" lives.
  --
  -- Set in the same write that records the contact, which is what makes a
  -- retry safe: an item that already carries this can never be charged again,
  -- and an item that failed carries `false` and is charged exactly once when it
  -- finally succeeds.
  credit_consumed boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scan_batch_items_batch_owner_fkey
    FOREIGN KEY (batch_id, user_id)
    REFERENCES public.scan_batches (id, user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  -- The contact must belong to the same owner as the item. Same composite-key
  -- defence as above: without it, an item could name a contact belonging to
  -- somebody else and RLS would be satisfied by the user_id alone.
  CONSTRAINT scan_batch_items_contact_owner_fkey
    FOREIGN KEY (created_contact_id, user_id)
    REFERENCES public.scanned_contacts (id, user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  -- The matched person must belong to the same owner, for the same reason: a
  -- caller-supplied contact id could otherwise point an encounter at somebody
  -- else's contact, and RLS on user_id alone would be satisfied by it.
  CONSTRAINT scan_batch_items_link_owner_fkey
    FOREIGN KEY (link_contact_id, user_id)
    REFERENCES public.scanned_contacts (id, user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CONSTRAINT scan_batch_items_position_check CHECK (position >= 0),
  CONSTRAINT scan_batch_items_confidence_check
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS scan_batch_items_batch_position_idx
  ON public.scan_batch_items (batch_id, position);

-- ---------------------------------------------------------------
-- The contact's way back
-- ---------------------------------------------------------------
-- Additive and nullable, like the provenance columns before them. Every contact
-- created before this migration, and every single-card scan after it, keeps a
-- null here — which is the honest answer to "which batch did this come from"
-- for a contact that came from no batch.
ALTER TABLE public.scanned_contacts
  ADD COLUMN IF NOT EXISTS scan_batch_id uuid,
  ADD COLUMN IF NOT EXISTS scan_batch_item_id uuid;

-- Deliberately no foreign key back to the batch.
--
-- The reference points the other way already: the item names the contact, with
-- a composite key enforcing the owner. Adding a second, opposite constraint
-- would make the two tables depend on each other's row order at insert time —
-- the contact is written first, before the item can be updated to point at it,
-- so a FK here would have to be deferrable to work at all. The column is set by
-- the same transaction-shaped code path that sets `created_contact_id`, and a
-- batch that is deleted leaves a contact whose origin is simply no longer on
-- file. That is a better outcome than cascading a person out of existence
-- because their scanning session was tidied away.

CREATE INDEX IF NOT EXISTS scanned_contacts_batch_idx
  ON public.scanned_contacts (scan_batch_id)
  WHERE scan_batch_id IS NOT NULL;

-- ---------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------
ALTER TABLE public.scan_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scan_batches_all_own" ON public.scan_batches;
CREATE POLICY "scan_batches_all_own" ON public.scan_batches
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "scan_batch_items_all_own" ON public.scan_batch_items;
CREATE POLICY "scan_batch_items_all_own" ON public.scan_batch_items
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------
-- RLS decides which rows a role may touch; it does not decide which columns.
-- Both matter, because an authenticated user holds a real Postgres role and can
-- speak to PostgREST directly without passing through any route of ours.
--
-- REVOKE first is not ceremony: this project has Supabase's default privileges
-- active, so a newly created table arrives already granting ALL to anon and
-- authenticated. Omitting a GRANT would withhold nothing.
REVOKE ALL ON public.scan_batches FROM PUBLIC;
REVOKE ALL ON public.scan_batches FROM anon;
REVOKE ALL ON public.scan_batches FROM authenticated;

REVOKE ALL ON public.scan_batch_items FROM PUBLIC;
REVOKE ALL ON public.scan_batch_items FROM anon;
REVOKE ALL ON public.scan_batch_items FROM authenticated;

-- Nothing signed-out reads a batch. anon keeps nothing at all — one fewer thing
-- depending on a policy being correct.

GRANT SELECT ON public.scan_batches TO authenticated;
-- The owner edits the shared context from the review screen, and nothing else.
-- Structural fields (id, user_id, created_at) and the counters are set by the
-- server: a counter the client can write is a counter that stops being a fact.
-- `status` is likewise server-owned, because "saved" is a claim about contacts
-- existing, and only the save path knows whether they do.
GRANT UPDATE (
  shared_event,
  shared_event_normalized,
  shared_location,
  shared_discussed,
  shared_next_action,
  shared_follow_up_at,
  shared_met_at,
  updated_at
) ON public.scan_batches TO authenticated;

GRANT SELECT ON public.scan_batch_items TO authenticated;
-- The review screen corrects a misread field and unticks a card it does not
-- want. It does not get to move an item to another batch, renumber it, rewrite
-- what the model actually saw, or claim a contact was created — those are
-- either facts about the past or the server's to decide.
-- `link_to_existing` is here because it is the owner's decision; the matched
-- contact id itself is not, because that is the server's finding.
GRANT UPDATE (
  first_name,
  last_name,
  company,
  role,
  email,
  phone,
  website,
  linkedin_url,
  selected,
  link_to_existing,
  updated_at
) ON public.scan_batch_items TO authenticated;

-- Inserts and deletes go through the server, which is where the ten-card limit
-- and the scan quota are enforced. A client that could insert its own items
-- could grant itself an unlimited batch.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_batch_items TO service_role;

NOTIFY pgrst, 'reload schema';
