-- ABC Zero-Input CRM: activities, opportunities, contact fields, webhook

create table if not exists public.crm_activities (
  id uuid default gen_random_uuid() primary key,
  contact_id uuid references public.scanned_contacts(id) on delete cascade,
  user_id uuid references public.abc_profiles(id) on delete cascade,
  activity_type text not null,
  activity_detail text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

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

alter table public.scanned_contacts
  add column if not exists crm_status text default 'NEW',
  add column if not exists ai_lead_score integer default 0,
  add column if not exists last_activity_at timestamptz,
  add column if not exists last_activity_type text,
  add column if not exists contact_count integer default 0,
  add column if not exists tags text[] default '{}',
  add column if not exists whatsapp_number text;

alter table public.abc_profiles
  add column if not exists webhook_url text;

alter table public.crm_activities enable row level security;
alter table public.crm_opportunities enable row level security;

drop policy if exists "Users see own activities" on public.crm_activities;
create policy "Users see own activities" on public.crm_activities
  for all using (auth.uid() = user_id);

drop policy if exists "Users see own opportunities" on public.crm_opportunities;
create policy "Users see own opportunities" on public.crm_opportunities
  for all using (auth.uid() = user_id);

create index if not exists idx_crm_activities_contact on public.crm_activities(contact_id);
create index if not exists idx_crm_activities_user on public.crm_activities(user_id);
create index if not exists idx_crm_activities_type on public.crm_activities(activity_type);
create index if not exists idx_crm_opportunities_contact on public.crm_opportunities(contact_id);
