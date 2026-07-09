-- Free tier: 3 lifetime scans (not monthly). Enforcement uses lib/scan-limits.ts PLAN_SCAN_LIMITS.
ALTER TABLE public.abc_profiles
  ALTER COLUMN scans_limit SET DEFAULT 3;
