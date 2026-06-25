ALTER TABLE public.abc_profiles
ADD COLUMN IF NOT EXISTS user_name text,
ADD COLUMN IF NOT EXISTS user_company text,
ADD COLUMN IF NOT EXISTS user_role text,
ADD COLUMN IF NOT EXISTS user_product text,
ADD COLUMN IF NOT EXISTS user_goal text,
ADD COLUMN IF NOT EXISTS user_icp text,
ADD COLUMN IF NOT EXISTS user_style text,
ADD COLUMN IF NOT EXISTS user_language text,
ADD COLUMN IF NOT EXISTS user_message_length text,
ADD COLUMN IF NOT EXISTS user_prompt text,
ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
