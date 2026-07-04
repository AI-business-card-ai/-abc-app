-- Ensure abc_profiles has all columns required by onboarding, settings, and Google OAuth.
-- Safe to run multiple times (IF NOT EXISTS). Apply manually on abc-production if CLI is unavailable.

-- Onboarding core (20260625160000, 20260704160000, 20260706160000)
ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS product_description text,
  ADD COLUMN IF NOT EXISTS icp text,
  ADD COLUMN IF NOT EXISTS system_prompt text,
  ADD COLUMN IF NOT EXISTS message_goal text DEFAULT 'Schedule a meeting',
  ADD COLUMN IF NOT EXISTS message_length text DEFAULT 'medium';

-- Research toggles (20260704160000)
ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS research_company_size boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_revenue boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_location boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_news boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_events boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_linkedin boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_funding boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_competitors boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_tech boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_hiring boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_products boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_pain_points boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_custom text;

-- Google OAuth (20260707160000, 20260709160000)
ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS google_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_email text,
  ADD COLUMN IF NOT EXISTS google_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_access_token text,
  ADD COLUMN IF NOT EXISTS google_token_expires_at timestamptz;

GRANT SELECT, INSERT, UPDATE ON public.abc_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.abc_profiles TO service_role;

-- Reload PostgREST schema cache so API stops returning PGRST204
NOTIFY pgrst, 'reload schema';
