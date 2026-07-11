-- Add growth plan tier to abc_profiles.plan constraint
ALTER TABLE public.abc_profiles DROP CONSTRAINT IF EXISTS abc_profiles_plan_check;
ALTER TABLE public.abc_profiles
  ADD CONSTRAINT abc_profiles_plan_check
  CHECK (plan IN ('free', 'starter', 'growth', 'pro', 'team', 'INTERNAL_TEST'));

NOTIFY pgrst, 'reload schema';
