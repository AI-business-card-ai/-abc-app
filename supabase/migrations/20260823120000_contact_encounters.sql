-- Contact encounters: one contact, many meetings.
--
-- Meeting context lived as flat columns on scanned_contacts, so meeting the
-- same person twice meant choosing between overwriting what happened the first
-- time and saving a second contact for a person you already knew. Neither is a
-- record of a relationship. An encounter is one meeting; a contact is the
-- person, and now owns a history of them.
--
-- The flat columns stay exactly where they are. Twenty-odd files read them —
-- follow-ups, the dashboard, the contact list, CRM scoring — and this migration
-- does not ask any of them to change. From here they are a projection of the
-- latest encounter, kept current by the same code that writes the encounter.

-- ---------------------------------------------------------------
-- Tenant isolation, enforced by the database rather than by routes
-- ---------------------------------------------------------------
-- An encounter row carries both the contact and the owner, and the pair has to
-- agree: it must be impossible to attach my meeting to your contact. RLS alone
-- does not do this — a policy of `auth.uid() = user_id` is satisfied by a row
-- that names me as owner and someone else's contact_id, which is exactly the
-- attack. A composite foreign key makes the pair itself the thing being
-- referenced, so the database rejects the mismatch before any policy is
-- consulted, in every code path, including future ones nobody has written yet.
--
-- `id` is already the primary key; this unique constraint exists only to give
-- that composite key something to point at.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scanned_contacts_id_user_id_key'
      AND conrelid = 'public.scanned_contacts'::regclass
  ) THEN
    ALTER TABLE public.scanned_contacts
      ADD CONSTRAINT scanned_contacts_id_user_id_key UNIQUE (id, user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.contact_encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  contact_id uuid NOT NULL,
  -- The owner who saved the contact. Never the scanned person: a contact may
  -- carry linked_abc_user_id pointing at somebody else's ABC account, and that
  -- person has no business reading the notes taken about them.
  user_id uuid NOT NULL,

  -- When the meeting happened, which is not when the row was written. Backfill
  -- and the scan flow both set it deliberately; created_at stays honest about
  -- bookkeeping so the two can never be confused.
  met_at timestamptz NOT NULL DEFAULT now(),

  -- The product's existing meeting vocabulary, unchanged: where you met, what
  -- you discussed, the next step, when to follow up. Nothing speculative —
  -- fields nobody collects are fields nobody fills in.
  event text,
  event_normalized text,
  discussed text,
  next_action text,
  follow_up_at timestamptz,

  -- How this particular meeting entered ABC. Copied per encounter because the
  -- same person can be met twice by different routes — photographed at a
  -- conference, then QR-scanned a year later. The ABC identity link stays on
  -- the contact: it answers who they are, which does not change per meeting.
  capture_origin text,
  capture_kind text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contact_encounters_contact_owner_fkey
    FOREIGN KEY (contact_id, user_id)
    REFERENCES public.scanned_contacts (id, user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

-- Deliberately no separate FK to auth.users. Deleting an account already
-- cascades to its contacts, and cascades from there to these rows through the
-- key above — one path, no ambiguity about which constraint fires.
--
-- Note this cascade is the opposite of Phase 3's linked_abc_user_id, which has
-- no foreign key at all. The difference is whose data it is: these encounters
-- belong to the contact's owner and should die with the contact they describe,
-- whereas the linked ABC identity points at a third party whose leaving must
-- never delete the owner's record of having met them.

-- The one query the UI makes: this contact's meetings, newest first.
CREATE INDEX IF NOT EXISTS contact_encounters_contact_met_at_idx
  ON public.contact_encounters (contact_id, met_at DESC);

ALTER TABLE public.contact_encounters ENABLE ROW LEVEL SECURITY;

-- Same shape as contacts_all_own on scanned_contacts. WITH CHECK is written out
-- rather than left to default from USING, because an insert policy that is
-- implied is an insert policy that gets missed in review.
DROP POLICY IF EXISTS "encounters_all_own" ON public.contact_encounters;
CREATE POLICY "encounters_all_own" ON public.contact_encounters
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------
-- RLS decides which rows a role may touch; it does not decide which columns.
-- Both questions matter here, because the app is not the only way in: an
-- authenticated user holds a real Postgres role and can speak to PostgREST
-- directly, without passing through any route.
--
-- Consider what a plain table-wide UPDATE would allow. RLS asks only whether
-- user_id = auth.uid(); the composite foreign key asks only whether the
-- (contact, owner) pair is real. An owner moving their own encounter from their
-- own Contact A to their own Contact B satisfies both — no tenant is crossed,
-- and the relationship history is silently falsified. The defence has to be
-- that the column cannot be written at all.
--
-- So the structural fields are simply not granted: id, contact_id, user_id and
-- created_at say which meeting this is and whose, and capture_origin and
-- capture_kind are Phase 3 provenance — a record of how the meeting entered
-- ABC, which is not the sort of thing that gets edited afterwards. met_at is
-- absent too, precisely because the application never updates it: the product
-- offers no way to change when a meeting happened, so the privilege would be
-- granted against a need that does not exist. All of them are still set freely
-- at INSERT, which is where a fact about an event belongs.
--
-- REVOKE first, and this is not ceremony. This project has Supabase's default
-- privileges active — crm_activities and followup_sequences were created with
-- no explicit grant and are reachable in production — so a newly created table
-- arrives already granting ALL to anon and authenticated. Omitting a GRANT
-- therefore withholds nothing. The desired state has to be stated, starting
-- from a clean slate, or the column list below is decoration over full access.
REVOKE ALL ON public.contact_encounters FROM PUBLIC;
REVOKE ALL ON public.contact_encounters FROM anon;
REVOKE ALL ON public.contact_encounters FROM authenticated;

-- Encounters are private notes about people. Nothing public reads them, and no
-- signed-out flow touches them, so anon keeps nothing at all — one fewer thing
-- depending on a policy being correct.

GRANT SELECT, INSERT ON public.contact_encounters TO authenticated;

-- Exactly the columns updateEncounter writes, and no others. Verified against
-- the payload: it destructures met_at, capture_origin and capture_kind out
-- before updating, so these five are the whole revisable surface.
GRANT UPDATE (
  event,
  event_normalized,
  discussed,
  next_action,
  follow_up_at
) ON public.contact_encounters TO authenticated;

-- No DELETE for authenticated: the product exposes no way to delete a meeting,
-- and deleting a contact still removes its encounters, because a cascade is
-- carried out by the system as part of the parent delete rather than by the
-- caller — it needs no privilege of its own, and RLS does not filter it either.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_encounters TO service_role;

-- ---------------------------------------------------------------
-- Backfill: the meeting each existing contact already remembers
-- ---------------------------------------------------------------
-- Contacts that carry real meeting context get one encounter representing it.
-- Contacts that carry none get nothing — an empty encounter would assert that
-- a meeting happened while knowing nothing about it, and a fabricated meeting
-- is worse than an absent one. Only stored values are used; nothing is guessed.
--
-- Re-running is safe without a marker column: NOT EXISTS makes the backfill
-- describe a state rather than an action. A contact that already has any
-- encounter is skipped, so a second run inserts nothing, and a contact whose
-- history was created by the app afterwards is never given a duplicate
-- historical row.
INSERT INTO public.contact_encounters (
  contact_id, user_id, met_at,
  event, event_normalized, discussed, next_action, follow_up_at,
  capture_origin, capture_kind
)
SELECT
  c.id,
  c.user_id,
  -- Same precedence the contact detail screen already uses to decide what to
  -- show as the meeting date, so history does not contradict the header.
  COALESCE(c.meeting_date::timestamptz, c.meeting_event_date::timestamptz, c.scanned_at, c.created_at, now()),
  NULLIF(BTRIM(COALESCE(c.raw_event_text, c.meeting_event_name, c.event_name, c.meeting_location, '')), ''),
  NULLIF(BTRIM(COALESCE(c.meeting_event_name, c.event_name, '')), ''),
  NULLIF(BTRIM(COALESCE(c.meeting_topic, '')), ''),
  -- followup_note last, and only as a fallback. Its form label is
  -- "Note / follow-up" and buildMeetingContext feeds it to message generation
  -- as real meeting context, so it is not decoration — but it says the same
  -- kind of thing as a next step, and where a next step already exists that is
  -- the better answer. Nothing is lost when it loses: the column stays on the
  -- contact, unread by this migration and untouched.
  NULLIF(BTRIM(COALESCE(c.next_action, c.next_step, c.followup_note, '')), ''),
  c.next_action_date,
  c.capture_origin,
  c.capture_kind
FROM public.scanned_contacts c
WHERE (
     NULLIF(BTRIM(COALESCE(c.meeting_topic, '')), '') IS NOT NULL
  OR NULLIF(BTRIM(COALESCE(c.raw_event_text, '')), '') IS NOT NULL
  OR NULLIF(BTRIM(COALESCE(c.meeting_event_name, '')), '') IS NOT NULL
  OR NULLIF(BTRIM(COALESCE(c.event_name, '')), '') IS NOT NULL
  OR NULLIF(BTRIM(COALESCE(c.meeting_location, '')), '') IS NOT NULL
  OR NULLIF(BTRIM(COALESCE(c.next_action, '')), '') IS NOT NULL
  OR NULLIF(BTRIM(COALESCE(c.next_step, '')), '') IS NOT NULL
  -- A contact whose only surviving context is a follow-up note still had a
  -- meeting, and would otherwise have been passed over entirely.
  OR NULLIF(BTRIM(COALESCE(c.followup_note, '')), '') IS NOT NULL
  OR c.next_action_date IS NOT NULL
)
-- `notes` is deliberately absent from both the columns above and this filter.
-- Every writer sets it to something already covered: the context route builds
-- it by joining event, topic and follow-up note together; /api/card/event
-- copies raw_event_text into it; exchange and reverse-lead copy meeting_topic.
-- It holds no meeting information of its own, so a contact never qualifies on
-- notes alone, and copying it into the encounter would duplicate the fields
-- either side of it. (Webhook export also writes an AI summary there, which is
-- enrichment output and not a meeting at all.)
AND NOT EXISTS (
  SELECT 1 FROM public.contact_encounters e WHERE e.contact_id = c.id
);

NOTIFY pgrst, 'reload schema';
