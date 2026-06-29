-- Research preference toggles + message settings on abc_profiles
ALTER TABLE public.abc_profiles
ADD COLUMN IF NOT EXISTS research_company_size boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS research_revenue boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS research_location boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS research_news boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS research_events boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS research_linkedin boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS research_funding boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS research_competitors boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS research_tech boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS research_hiring boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS research_products boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS research_pain_points boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS research_custom text,
ADD COLUMN IF NOT EXISTS message_goal text DEFAULT 'Schedule a meeting',
ADD COLUMN IF NOT EXISTS message_length text DEFAULT 'medium';
