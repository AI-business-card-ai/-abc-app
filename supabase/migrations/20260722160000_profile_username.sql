-- Username-based public card URLs
create extension if not exists unaccent;

ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS username text;

-- Backfill: generate from full_name (lowercase, strip diacritics + non-alphanumerics),
-- fall back to user + id prefix, append number suffix on collision
DO $$
DECLARE
  r record;
  base text;
  candidate text;
  n int;
BEGIN
  FOR r IN
    SELECT id, full_name FROM public.abc_profiles WHERE username IS NULL
  LOOP
    base := regexp_replace(lower(unaccent(coalesce(r.full_name, ''))), '[^a-z0-9]', '', 'g');
    IF length(base) < 3 THEN
      base := 'user' || replace(substr(r.id::text, 1, 8), '-', '');
    END IF;
    base := substr(base, 1, 30);

    candidate := base;
    n := 1;
    WHILE EXISTS (
      SELECT 1 FROM public.abc_profiles WHERE username = candidate AND id <> r.id
    ) LOOP
      n := n + 1;
      candidate := substr(base, 1, 30 - length(n::text)) || n::text;
    END LOOP;

    UPDATE public.abc_profiles SET username = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.abc_profiles
  DROP CONSTRAINT IF EXISTS abc_profiles_username_unique;
ALTER TABLE public.abc_profiles
  ADD CONSTRAINT abc_profiles_username_unique UNIQUE (username);

ALTER TABLE public.abc_profiles
  DROP CONSTRAINT IF EXISTS abc_profiles_username_format;
ALTER TABLE public.abc_profiles
  ADD CONSTRAINT abc_profiles_username_format
  CHECK (username IS NULL OR username ~ '^[a-z0-9-]{3,30}$');
