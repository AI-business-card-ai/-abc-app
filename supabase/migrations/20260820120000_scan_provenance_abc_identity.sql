-- Capture provenance + ABC identity linking for scanned contacts.
--
-- A saved contact could say it came from a "qr" but not whether that was
-- another ABC card or a stranger's vCard, nor whether an image came off the
-- camera or out of the gallery. And when one ABC member scanned another, the
-- account behind the card was resolved, read for display, and thrown away —
-- only the visible strings survived, so nothing could later tell that two
-- contacts are the same person.
--
-- These columns are additive and nullable. The existing `source` column keeps
-- its coarse values and every current reader of it; no historical row is
-- rewritten and nothing is backfilled, because a guess about how an old
-- contact was captured is worse than an honest null.

ALTER TABLE public.scanned_contacts
  -- Which device path produced the capture: camera, gallery, qr_live.
  ADD COLUMN IF NOT EXISTS capture_origin text,
  -- What was read: business_card, badge, document, abc_card, vcard, mecard,
  -- mailto, tel. The image kinds are the owner's chosen mode rather than a
  -- classifier's verdict — one prompt reads every image.
  ADD COLUMN IF NOT EXISTS capture_kind text,
  -- The ABC account of the person who was scanned. Deliberately not named
  -- anything like user_id: `user_id` on this table is the owner who saved the
  -- contact, and these two must never be confused for one another.
  ADD COLUMN IF NOT EXISTS linked_abc_user_id uuid,
  -- Which card was scanned. Today an account has one profile and one slug, so
  -- this adds little; when an account can hold several cards it is the record
  -- of which one was actually in front of the camera.
  ADD COLUMN IF NOT EXISTS linked_abc_card_slug text;

-- No foreign key to auth.users on purpose.
--
-- A reference would tie the row's fate to an account that has nothing to do
-- with owning it: if the scanned person ever deletes their ABC account, the
-- contact must still be the owner's to keep — the meeting happened, the phone
-- number is still theirs. ON DELETE CASCADE would silently destroy someone's
-- contact because a third party left, and SET NULL would quietly erase the
-- linkage that made it useful. A soft reference keeps the record honest and is
-- resolved by the server at write time, which is where the trust actually is.

-- Phase 5 will match a freshly scanned ABC identity against contacts already
-- saved by the same owner, which is this pair of columns and nothing else.
CREATE INDEX IF NOT EXISTS scanned_contacts_owner_linked_abc_idx
  ON public.scanned_contacts (user_id, linked_abc_user_id)
  WHERE linked_abc_user_id IS NOT NULL;

-- Deliberately no unique constraint. One person may legitimately be scanned
-- twice — at two events, months apart — and until encounters exist as their own
-- records, a second contact is how that history survives. Deduplication is a
-- later decision, made with the owner watching, not a constraint that throws.

-- RLS, policies and grants are untouched. scanned_contacts remains owner-only
-- under contacts_all_own, and that covers these columns like any other: being
-- named in linked_abc_user_id gives that account no access whatsoever to the
-- row. The person who scanned you does not share their notes about you.

NOTIFY pgrst, 'reload schema';
