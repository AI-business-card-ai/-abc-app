-- Store Google OAuth tokens for Gmail API (server-side refresh)
ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS google_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_access_token text,
  ADD COLUMN IF NOT EXISTS google_token_expires_at timestamptz;

GRANT SELECT, INSERT, UPDATE ON public.abc_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.abc_profiles TO service_role;
