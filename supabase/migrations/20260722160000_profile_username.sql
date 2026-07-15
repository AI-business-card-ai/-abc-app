-- Username-based public card URLs
create extension if not exists unaccent;

ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS user_name text;

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
    SELECT id, full_name FROM public.abc_profiles WHERE user_name IS NULL
  LOOP
    base := regexp_replace(lower(unaccent(coalesce(r.full_name, ''))), '[^a-z0-9]', '', 'g');
    IF length(base) < 3 THEN
      base := 'user' || replace(substr(r.id::text, 1, 8), '-', '');
    END IF;
    base := substr(base, 1, 30);

    candidate := base;
    n := 1;
    WHILE EXISTS (
      SELECT 1 FROM public.abc_profiles WHERE user_name = candidate AND id <> r.id
    ) LOOP
      n := n + 1;
      candidate := substr(base, 1, 30 - length(n::text)) || n::text;
    END LOOP;

    UPDATE public.abc_profiles SET user_name = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.abc_profiles
  DROP CONSTRAINT IF EXISTS abc_profiles_user_name_unique;
ALTER TABLE public.abc_profiles
  ADD CONSTRAINT abc_profiles_user_name_unique UNIQUE (user_name);

ALTER TABLE public.abc_profiles
  DROP CONSTRAINT IF EXISTS abc_profiles_user_name_format;
ALTER TABLE public.abc_profiles
  ADD CONSTRAINT abc_profiles_user_name_format
  CHECK (user_name IS NULL OR user_name ~ '^[a-z0-9-]{3,30}$');
