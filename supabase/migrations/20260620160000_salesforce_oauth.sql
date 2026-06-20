-- Salesforce OAuth tokens
alter table public.abc_profiles
  add column if not exists salesforce_access_token text,
  add column if not exists salesforce_refresh_token text,
  add column if not exists salesforce_instance_url text,
  add column if not exists salesforce_connected_at timestamptz;
