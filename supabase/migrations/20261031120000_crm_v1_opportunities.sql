-- ABC CRM V1: opportunities on the table that was already there.
--
-- An opportunity is commercial potential with a person the owner already met.
-- It references the contact; it never copies it. `crm_opportunities` was
-- created by 20260622160000_crm_zero_input and is already cleaned up by contact
-- deletion and account deletion, but no application code ever wrote to it. CRM
-- V1 is its first writer, so this migration only adds what V1 needs and guards
-- what V1 promises. Nothing here deletes, rewrites or backfills a row.
--
-- What V1 needs, and why each piece lives here:
--
--   next_action / next_action_type / next_action_due_at
--     The deal's own next step. Follow-ups already exist, but they belong to a
--     meeting (`contact_encounters.follow_up_at`), and "send the quote" is not
--     something that was agreed at a meeting. Writing deal steps into meeting
--     records would falsify the history of what was said; so the opportunity
--     carries one lightweight next step of its own. One, not a task list.
--
--   one opportunity per person
--     V1 promises "View opportunity" instead of a second one. The application
--     checks before it inserts; the unique index makes that true under a
--     double tap or two devices as well.
--
--   the (contact, owner) pair
--     The original table points at scanned_contacts(id) alone, so RLS checks
--     the owner and nothing checks that the contact is theirs. The composite
--     key below — the same defence contact_encounters uses — makes the
--     database refuse an opportunity on somebody else's contact.
--
-- Rollback: every object below is additive and named. To undo, drop the three
-- columns, the index and the constraint; existing rows are untouched either way
-- and the application reads them with or without the new columns.

-- ---------------------------------------------------------------
-- The table, in case this database never received 20260622
-- ---------------------------------------------------------------
-- Same definition as the original. A no-op wherever the table exists.
create table if not exists public.crm_opportunities (
  id uuid default gen_random_uuid() primary key,
  contact_id uuid references public.scanned_contacts(id) on delete cascade,
  user_id uuid references public.abc_profiles(id) on delete cascade,
  name text not null default 'New Opportunity',
  value numeric default 0,
  currency text default 'USD',
  stage text default 'PROSPECT',
  probability integer default 10,
  expected_close_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.crm_opportunities enable row level security;

-- Unchanged in meaning from 20260622; WITH CHECK is written out so the insert
-- rule is visible in review rather than implied by USING.
drop policy if exists "Users see own opportunities" on public.crm_opportunities;
create policy "Users see own opportunities" on public.crm_opportunities
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_crm_opportunities_contact on public.crm_opportunities(contact_id);

-- ---------------------------------------------------------------
-- The deal's next step
-- ---------------------------------------------------------------
alter table public.crm_opportunities
  add column if not exists next_action text,
  add column if not exists next_action_type text,
  add column if not exists next_action_due_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_opportunities_next_action_type_check'
      and conrelid = 'public.crm_opportunities'::regclass
  ) then
    alter table public.crm_opportunities
      add constraint crm_opportunities_next_action_type_check
      check (
        next_action_type is null
        or next_action_type in ('follow_up', 'call', 'meeting', 'quote', 'reminder', 'other')
      );
  end if;
end $$;

-- The owner's board reads by owner; the action list reads open steps by date.
create index if not exists idx_crm_opportunities_user_updated
  on public.crm_opportunities (user_id, updated_at desc);

-- ---------------------------------------------------------------
-- One opportunity per person
-- ---------------------------------------------------------------
-- Guarded rather than forced. If duplicates already exist (nothing in the app
-- ever wrote here, so none should), the index is skipped with a notice instead
-- of failing the migration or choosing which row to delete — that is the
-- owner's decision, not a migration's. The application keeps preventing new
-- duplicates either way.
do $$
begin
  if exists (
    select 1 from public.crm_opportunities
    where contact_id is not null
    group by user_id, contact_id
    having count(*) > 1
  ) then
    raise notice 'crm_opportunities has duplicate (user_id, contact_id) rows; unique index not created';
  else
    create unique index if not exists crm_opportunities_user_contact_key
      on public.crm_opportunities (user_id, contact_id);
  end if;
end $$;

-- ---------------------------------------------------------------
-- The (contact, owner) pair must agree
-- ---------------------------------------------------------------
-- scanned_contacts_id_user_id_key exists since 20260823 (contact encounters).
-- NOT VALID: enforced for every row written from now on, without asking the
-- database to vouch for rows it did not check. ON DELETE CASCADE matches the
-- single-column key above, so deleting a contact still removes its deal.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'scanned_contacts_id_user_id_key'
      and conrelid = 'public.scanned_contacts'::regclass
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'crm_opportunities_contact_owner_fkey'
      and conrelid = 'public.crm_opportunities'::regclass
  ) then
    alter table public.crm_opportunities
      add constraint crm_opportunities_contact_owner_fkey
      foreign key (contact_id, user_id)
      references public.scanned_contacts (id, user_id)
      on update cascade
      on delete cascade
      not valid;
  end if;
end $$;

-- ---------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------
-- Opportunities are private. Nothing signed-out reads them, so anon keeps
-- nothing; RLS already refused it every row, and this removes the reliance.
-- authenticated keeps full row access to its own opportunities through the
-- policy above; the service role keeps what account deletion granted it.
revoke all on public.crm_opportunities from anon;
grant select, insert, update, delete on public.crm_opportunities to authenticated;
grant select, insert, update, delete on public.crm_opportunities to service_role;

notify pgrst, 'reload schema';
