-- HubSpot OAuth tokens (replaces manual API key flow)
alter table public.abc_profiles
  add column if not exists hubspot_access_token text;

alter table public.abc_profiles
  add column if not exists hubspot_refresh_token text;

alter table public.abc_profiles
  add column if not exists hubspot_portal_id text;

alter table public.abc_profiles
  add column if not exists hubspot_connected_at timestamptz;
