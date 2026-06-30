-- Unify abc_profiles: migrate legacy user_* columns to canonical names
ALTER TABLE public.abc_profiles
ADD COLUMN IF NOT EXISTS product_description text,
ADD COLUMN IF NOT EXISTS icp text,
ADD COLUMN IF NOT EXISTS system_prompt text;

UPDATE public.abc_profiles SET
  full_name = COALESCE(full_name, user_name),
  company = COALESCE(company, user_company),
  product_description = COALESCE(product_description, user_product),
  icp = COALESCE(icp, user_icp),
  goals = COALESCE(goals, user_goal),
  communication_style = COALESCE(
    NULLIF(communication_style, ''),
    CASE
      WHEN user_style IS NULL THEN communication_style
      WHEN lower(user_style) LIKE '%formal%' THEN 'formal'
      WHEN lower(user_style) LIKE '%casual%' THEN 'casual'
      ELSE 'direct'
    END
  ),
  outreach_language = COALESCE(outreach_language, user_language, 'EN'),
  role = COALESCE(role, user_role),
  message_length = COALESCE(message_length, user_message_length, 'medium'),
  message_goal = COALESCE(message_goal, user_goal, goals, 'Schedule a meeting'),
  system_prompt = COALESCE(system_prompt, user_prompt)
WHERE user_name IS NOT NULL
   OR user_company IS NOT NULL
   OR user_product IS NOT NULL
   OR user_icp IS NOT NULL
   OR user_goal IS NOT NULL
   OR user_style IS NOT NULL
   OR user_language IS NOT NULL
   OR user_role IS NOT NULL
   OR user_prompt IS NOT NULL;
