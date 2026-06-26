-- Stripe subscription fields on abc_profiles
ALTER TABLE public.abc_profiles
ADD COLUMN IF NOT EXISTS plan_activated_at timestamptz,
ADD COLUMN IF NOT EXISTS stripe_customer_id text,
ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Allow starter plan tier
ALTER TABLE public.abc_profiles DROP CONSTRAINT IF EXISTS abc_profiles_plan_check;
ALTER TABLE public.abc_profiles
ADD CONSTRAINT abc_profiles_plan_check
CHECK (plan IN ('free', 'starter', 'pro', 'team'));
