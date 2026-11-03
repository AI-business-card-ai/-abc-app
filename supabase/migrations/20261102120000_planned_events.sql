-- Planned events: an event exists because the owner planned it.
--
-- Until now there was no event record. The Events screen grouped the free text
-- on contact_encounters.event, so anything typed under "Where did you meet?"
-- appeared as an event, and a note could become one. This adds the record that
-- was missing, and an explicit link from a meeting to it. Only the owner's
-- "Plan an event" action writes a row here. No scan, OCR result, import, enrichment,
-- follow-up or CRM sync does, and nothing below reads meeting text to fill it in.
--
-- Additive only. No row is deleted, rewritten or backfilled: every existing
-- meeting keeps its text and starts with no planned event, and linking one is the
-- owner's decision, one meeting at a time.
--
-- Rollback: drop the constraint, index and column on contact_encounters, then
-- drop public.planned_events. Meetings are untouched either way.

create table if not exists public.planned_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.abc_profiles (id) on delete cascade,

  name text not null check (char_length(btrim(name)) between 1 and 160),
  starts_on date,
  ends_on date,
  location text,

  -- Preparation, in the owner's own words. Companies and people here are notes
  -- about who to look for, not a second contact list: someone met becomes a
  -- contact through the scan flow, as everyone else does.
  objectives text,
  companies_to_visit text,
  target_contacts text,
  meetings_to_arrange text,
  follow_up_plan text,

  -- Where the record came from. 'verified' is reserved for a real event source
  -- when one exists; no application path sets it today, and the grants below
  -- keep clients from claiming it.
  source text not null default 'manual' check (source in ('manual', 'verified')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint planned_events_dates_in_order
    check (starts_on is null or ends_on is null or ends_on >= starts_on),
  -- Gives the meeting link below something composite to point at.
  constraint planned_events_id_user_id_key unique (id, user_id)
);

create index if not exists planned_events_user_starts_idx
  on public.planned_events (user_id, starts_on);

alter table public.planned_events enable row level security;

drop policy if exists "planned_events_all_own" on public.planned_events;
create policy "planned_events_all_own" on public.planned_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The meeting's link to a planned event. A meeting belongs to at most one, and
-- null means none, which is what every existing meeting starts as.
alter table public.contact_encounters
  add column if not exists planned_event_id uuid;

-- The (event, owner) pair must agree, the same defence contact_encounters uses
-- for its contact: RLS alone would accept my meeting naming your event, because
-- the row is still mine. No ON DELETE action: nothing in the application deletes
-- a planned event, and the column-list form of SET NULL needs PostgreSQL 15,
-- which this repository cannot confirm for production. Account deletion removes
-- meetings first, so this key never stands in its way.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contact_encounters_planned_event_owner_fkey'
      and conrelid = 'public.contact_encounters'::regclass
  ) then
    alter table public.contact_encounters
      add constraint contact_encounters_planned_event_owner_fkey
      foreign key (planned_event_id, user_id)
      references public.planned_events (id, user_id);
  end if;
end $$;

-- What an event's detail screen reads: its meetings, for one owner.
create index if not exists contact_encounters_planned_event_idx
  on public.contact_encounters (user_id, planned_event_id)
  where planned_event_id is not null;

-- ---------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------
-- Per 20260823, a new table here arrives granting ALL to anon and authenticated,
-- so omitting a grant is not enough: everything is revoked first, then only what
-- the product uses is given back. source is deliberately absent from both lists,
-- so a client cannot call its own event verified, and there is no delete grant
-- because the product offers no delete.
revoke all on public.planned_events from anon, authenticated;
grant select on public.planned_events to authenticated;
grant insert (
  user_id, name, starts_on, ends_on, location,
  objectives, companies_to_visit, target_contacts, meetings_to_arrange, follow_up_plan
) on public.planned_events to authenticated;
grant update (
  name, starts_on, ends_on, location,
  objectives, companies_to_visit, target_contacts, meetings_to_arrange, follow_up_plan,
  updated_at
) on public.planned_events to authenticated;
grant select, insert, update, delete on public.planned_events to service_role;

-- contact_encounters grants UPDATE per column, so the link needs its own.
grant update (planned_event_id) on public.contact_encounters to authenticated;

notify pgrst, 'reload schema';
