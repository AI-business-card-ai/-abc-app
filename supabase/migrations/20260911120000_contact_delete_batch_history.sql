-- Deleting a contact that a Multi-Card batch saved or matched.
--
-- The failure this fixes. scan_batch_items points at contacts through two
-- composite foreign keys, (created_contact_id, user_id) and
-- (link_contact_id, user_id), both declared ON DELETE SET NULL. On a composite
-- key that action sets every referencing column to null — user_id included —
-- and user_id is NOT NULL. Deleting any contact a batch had saved or matched
-- was therefore refused with 23502, and /api/card/delete answered 500.
--
-- What happens instead. A batch item is scan history: which card was read,
-- what the model saw, whether it was paid for. Deleting the person it became
-- removes that person from the owner's CRM; it does not un-read the card. So,
-- inside the delete statement itself:
--
--   created_contact_id    -> null    the person is gone
--   created_encounter_id  -> null    the meeting goes with the person, as it
--                                    always has (contact_encounters cascades)
--   contact_deleted_at    -> now()   the item remembers it was saved, and that
--                                    its person was deleted afterwards
--   link_contact_id       -> null    an unsaved card's match no longer exists
--
-- Everything else on the item is left exactly as it was: fields, raw_ocr,
-- confidence, selected, credit_consumed. No credit moves and the credit ledger
-- is not touched — the Smart Scan credit paid for reading the card, and that
-- happened. Saving the same batch again skips the item instead of bringing the
-- deleted person back.
--
-- Why a trigger rather than new foreign-key actions. The declarative form,
-- ON DELETE SET NULL (created_contact_id), needs PostgreSQL 15, and the
-- production major version cannot be confirmed from this repository. A BEFORE
-- DELETE row trigger works on every supported version and runs inside the
-- delete statement, so there is no moment at which the contact is gone and an
-- item still names it, or the other way round. Having cleared the references
-- first, it leaves the composite keys nothing to act on. The keys themselves
-- are not dropped or altered: they still guarantee that an item's contact
-- belongs to the item's owner.
--
-- ADDITIVE ONLY: one nullable column, three partial indexes, one foreign key,
-- one trigger function and its trigger. This migration writes no row.

-- ---------------------------------------------------------------
-- The history marker
-- ---------------------------------------------------------------
alter table public.scan_batch_items
  add column if not exists contact_deleted_at timestamptz;

comment on column public.scan_batch_items.contact_deleted_at is
  'When the contact this card was saved as was deleted. The card stays as scan history and is never saved again.';

-- ---------------------------------------------------------------
-- The lookups a contact delete makes
-- ---------------------------------------------------------------
-- Postgres does not index the referencing side of a foreign key. Without these
-- every contact delete scans the whole item table, once per lookup.
create index if not exists scan_batch_items_created_contact_idx
  on public.scan_batch_items (created_contact_id)
  where created_contact_id is not null;

create index if not exists scan_batch_items_link_contact_idx
  on public.scan_batch_items (link_contact_id)
  where link_contact_id is not null;

create index if not exists scan_batch_items_created_encounter_idx
  on public.scan_batch_items (created_encounter_id)
  where created_encounter_id is not null;

-- ---------------------------------------------------------------
-- created_encounter_id: never a meeting that does not exist
-- ---------------------------------------------------------------
-- The column had no foreign key, so a meeting deleted by any route would have
-- left the item naming it. Existing rows are expected to satisfy the key: an
-- item's meeting belongs to its contact, meetings are only ever deleted with
-- their contact, and that delete was refused while an item referenced it. If a
-- row somehow disagrees, adding the key fails and this migration changes
-- nothing — it does not repair data silently.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scan_batch_items_created_encounter_fkey'
      and conrelid = 'public.scan_batch_items'::regclass
  ) then
    alter table public.scan_batch_items
      add constraint scan_batch_items_created_encounter_fkey
      foreign key (created_encounter_id)
      references public.contact_encounters (id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------
-- Releasing a deleted contact from its batch items
-- ---------------------------------------------------------------
-- SECURITY DEFINER because an owner may delete their own contact directly —
-- authenticated holds DELETE on scanned_contacts — and is deliberately not
-- granted UPDATE on these columns of scan_batch_items. The function reaches only
-- items that name the row being deleted and belong to that row's owner, which
-- the composite keys already make the same person.
create or replace function public.scan_batch_items_release_deleted_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.scan_batch_items i
  set created_contact_id = null,
      created_encounter_id = null,
      contact_deleted_at = now(),
      updated_at = now()
  where i.created_contact_id = old.id
    and i.user_id = old.user_id;

  update public.scan_batch_items i
  set link_contact_id = null,
      updated_at = now()
  where i.link_contact_id = old.id
    and i.user_id = old.user_id;

  return old;
end;
$$;

revoke all on function public.scan_batch_items_release_deleted_contact() from public;
revoke all on function public.scan_batch_items_release_deleted_contact() from anon, authenticated;

-- Guard for re-applying this migration; the trigger is its own.
drop trigger if exists scan_batch_items_release_deleted_contact on public.scanned_contacts;
create trigger scan_batch_items_release_deleted_contact
  before delete on public.scanned_contacts
  for each row
  execute function public.scan_batch_items_release_deleted_contact();

notify pgrst, 'reload schema';
