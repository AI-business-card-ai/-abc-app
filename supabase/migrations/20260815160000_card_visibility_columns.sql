-- Completes 20260811160000_digital_business_card.sql.
--
-- That migration was applied manually and seven of its columns did not land:
-- the six show_* visibility toggles and social_enabled. Everything else from
-- it (card_slug, card_published, job_title, company_name, the social URL
-- columns, card_links / card_events / card_views) is present.
--
-- The gap is not cosmetic. CardEditor's save payload includes show_phone and
-- social_enabled, so every save from /profile/card fails with PGRST204 until
-- these exist. Reads survive it — the card mappers default a missing toggle to
-- visible — which is why the public card renders but editing does not save.

ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS show_phone boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_whatsapp boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_website boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_calendar boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_location boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS social_enabled jsonb DEFAULT '{}'::jsonb;
