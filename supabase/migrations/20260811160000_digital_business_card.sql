-- Digital business card schema (applied manually on abc-production; kept for repo parity)

ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS card_slug text,
  ADD COLUMN IF NOT EXISTS card_published boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS card_branding_removed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS card_accent text DEFAULT '#f0197d',
  ADD COLUMN IF NOT EXISTS card_theme text DEFAULT 'graphite',
  ADD COLUMN IF NOT EXISTS card_tagline text,
  ADD COLUMN IF NOT EXISTS what_i_do text,
  ADD COLUMN IF NOT EXISTS looking_for text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS card_photo_url text,
  ADD COLUMN IF NOT EXISTS card_cover_url text,
  ADD COLUMN IF NOT EXISTS company_logo_url text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS public_email text,
  ADD COLUMN IF NOT EXISTS calendar_url text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS languages text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS show_phone boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_whatsapp boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_website boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_calendar boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_location boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS x_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS github_url text,
  ADD COLUMN IF NOT EXISTS threads_url text,
  ADD COLUMN IF NOT EXISTS social_enabled jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS abc_profiles_card_slug_uidx
  ON public.abc_profiles (card_slug)
  WHERE card_slug IS NOT NULL AND card_slug <> '';

CREATE TABLE IF NOT EXISTS public.card_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  icon text NOT NULL DEFAULT 'link',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  click_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS card_links_user_sort_idx
  ON public.card_links (user_id, sort_order);

CREATE TABLE IF NOT EXISTS public.card_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text,
  date_from date,
  date_to date,
  booth text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS card_events_user_date_idx
  ON public.card_events (user_id, date_to);

CREATE TABLE IF NOT EXISTS public.card_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles(id) ON DELETE CASCADE,
  source text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS card_views_user_created_idx
  ON public.card_views (user_id, created_at DESC);

-- Storage bucket for card media (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-media', 'card-media', true)
ON CONFLICT (id) DO NOTHING;
