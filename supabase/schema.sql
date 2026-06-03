-- ABC — AI Business Card — database schema
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- =========================================================
-- abc_profiles
-- =========================================================
create table if not exists public.abc_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  company text,
  role text,
  email text,
  phone text,
  linkedin_url text,
  website text,
  communication_style text not null default 'direct'
    check (communication_style in ('direct', 'formal', 'casual')),
  outreach_language text not null default 'EN',
  goals text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  scans_used int not null default 0,
  scans_limit int not null default 30,
  created_at timestamptz not null default now()
);

-- =========================================================
-- scanned_contacts
-- =========================================================
create table if not exists public.scanned_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  company text,
  role text,
  email text,
  phone text,
  website text,
  linkedin_url text,
  match_score int,
  company_summary text,
  industry text,
  company_size text,
  message_linkedin text,
  message_email text,
  message_whatsapp text,
  email_subject text,
  match_reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'sent', 'replied', 'archived')),
  event_name text,
  notes text,
  voice_note_url text,
  image_url text,
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists scanned_contacts_user_idx
  on public.scanned_contacts (user_id, scanned_at desc);

-- =========================================================
-- followup_sequences
-- =========================================================
create table if not exists public.followup_sequences (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.scanned_contacts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  step int not null,
  message_type text not null check (message_type in ('linkedin', 'email', 'whatsapp')),
  message_body text not null default '',
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sent', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists followup_sequences_contact_idx
  on public.followup_sequences (contact_id, step);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.abc_profiles enable row level security;
alter table public.scanned_contacts enable row level security;
alter table public.followup_sequences enable row level security;

-- abc_profiles: owner-only
drop policy if exists "profiles_select_own" on public.abc_profiles;
create policy "profiles_select_own" on public.abc_profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_upsert_own" on public.abc_profiles;
create policy "profiles_upsert_own" on public.abc_profiles
  for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.abc_profiles;
create policy "profiles_update_own" on public.abc_profiles
  for update using (auth.uid() = id);

-- scanned_contacts: owner-only
drop policy if exists "contacts_all_own" on public.scanned_contacts;
create policy "contacts_all_own" on public.scanned_contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- followup_sequences: owner-only
drop policy if exists "followups_all_own" on public.followup_sequences;
create policy "followups_all_own" on public.followup_sequences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================
-- Auto-create a profile row on signup
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.abc_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
