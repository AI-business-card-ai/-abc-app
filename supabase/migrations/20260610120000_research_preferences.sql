-- Research preferences on profiles + enriched context on contacts
ALTER TABLE public.scanned_contacts
ADD COLUMN IF NOT EXISTS enriched_context text;

ALTER TABLE public.abc_profiles
ADD COLUMN IF NOT EXISTS research_preferences text[]
DEFAULT ARRAY['revenue', 'location', 'news', 'linkedin', 'reputation', 'events', 'competitors', 'technology', 'decision_maker', 'pain_points'];

ALTER TABLE public.abc_profiles
ADD COLUMN IF NOT EXISTS custom_questions text DEFAULT '';
