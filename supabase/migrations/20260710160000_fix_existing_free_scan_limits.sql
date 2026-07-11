-- Preview: free-plan rows that would get scans_limit = 3 (run this block first in SQL Editor)
SELECT
  id,
  COALESCE(email, google_email) AS email,
  plan,
  scans_used,
  scans_limit,
  scans_limit AS scans_limit_before
FROM public.abc_profiles
WHERE plan = 'free'
ORDER BY scans_used DESC, email;

-- Count of rows that will be updated (scans_limit is not already 3)
SELECT COUNT(*) AS rows_to_update
FROM public.abc_profiles
WHERE plan = 'free'
  AND scans_limit IS DISTINCT FROM 3;

-- Apply: set scans_limit = 3 only for free plan (does not touch pro, starter, team, INTERNAL_TEST, etc.)
UPDATE public.abc_profiles
SET scans_limit = 3
WHERE plan = 'free'
  AND scans_limit IS DISTINCT FROM 3;

-- Verify after update
SELECT
  id,
  COALESCE(email, google_email) AS email,
  plan,
  scans_used,
  scans_limit
FROM public.abc_profiles
WHERE plan = 'free'
ORDER BY scans_used DESC, email;
