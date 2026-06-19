-- HubSpot CRM integration: per-user Private App token
alter table public.abc_profiles
  add column if not exists hubspot_api_key text;
