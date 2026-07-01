-- Google OAuth connection status on abc_profiles
ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS google_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_email text;

GRANT SELECT, INSERT, UPDATE ON public.abc_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.abc_profiles TO service_role;
