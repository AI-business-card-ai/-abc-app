-- Clean legacy user_name values that don't conform to the slug format.
-- user_name was originally used to store raw full names during onboarding
-- (see 20260625160000_onboarding_profile.sql), and the username backfill in
-- 20260722160000_profile_username.sql only filled rows WHERE user_name IS NULL —
-- it skipped every row that already held a legacy full name (e.g. "David Bureš"),
-- leaving non-conforming values in place that fail the slug CHECK constraint
-- and block profile saves. This re-runs the same generation logic, but targets
-- rows whose user_name does NOT match the slug format instead of NULL rows.

create extension if not exists unaccent;

DO $$
DECLARE
  r record;
  base text;
  candidate text;
  n int;
BEGIN
  FOR r IN
    SELECT id, full_name, user_name
    FROM public.abc_profiles
    WHERE user_name IS NOT NULL
      AND user_name !~ '^[a-z0-9-]{3,30}$'
  LOOP
    -- Regenerate from full_name first; fall back to the legacy user_name value
    -- itself (it may still carry useful text, e.g. mixed-case/diacritics of a real name).
    base := regexp_replace(lower(unaccent(coalesce(r.full_name, r.user_name, ''))), '[^a-z0-9]', '', 'g');
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

-- Re-assert the constraints (idempotent). If any pre-existing non-conforming
-- row prevented these from being created originally, this ensures they are
-- actually active now that all data conforms.
ALTER TABLE public.abc_profiles
  DROP CONSTRAINT IF EXISTS abc_profiles_user_name_unique;
ALTER TABLE public.abc_profiles
  ADD CONSTRAINT abc_profiles_user_name_unique UNIQUE (user_name);

ALTER TABLE public.abc_profiles
  DROP CONSTRAINT IF EXISTS abc_profiles_user_name_format;
ALTER TABLE public.abc_profiles
  ADD CONSTRAINT abc_profiles_user_name_format
  CHECK (user_name IS NULL OR user_name ~ '^[a-z0-9-]{3,30}$');
