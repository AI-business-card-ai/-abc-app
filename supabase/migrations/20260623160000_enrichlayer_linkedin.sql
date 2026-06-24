ALTER TABLE public.scanned_contacts
ADD COLUMN IF NOT EXISTS linkedin_headline text,
ADD COLUMN IF NOT EXISTS linkedin_summary text,
ADD COLUMN IF NOT EXISTS linkedin_experience jsonb,
ADD COLUMN IF NOT EXISTS linkedin_skills text[],
ADD COLUMN IF NOT EXISTS linkedin_posts jsonb,
ADD COLUMN IF NOT EXISTS linkedin_education jsonb;
