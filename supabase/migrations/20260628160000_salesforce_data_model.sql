-- Salesforce-compatible + ABC enriched fields
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS mobile_phone text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS billing_city text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS billing_country text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS lead_status text DEFAULT 'New';
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS sic_code text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS no_of_employees integer;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS annual_revenue numeric;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS rating text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS opportunity_name text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS opportunity_stage text DEFAULT 'Prospecting';
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS close_probability integer DEFAULT 10;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS next_step text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS opportunity_type text DEFAULT 'New Business';
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS last_activity_channel text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS last_activity_description text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS last_contacted_date timestamptz;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS reply_received boolean DEFAULT false;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS reply_date timestamptz;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS total_activities integer DEFAULT 0;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS enrichment_source text DEFAULT 'ABC AI Business Card';
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS meeting_location text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS meeting_date date;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS company_funding_stage text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS company_technologies text[];
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS company_news_summary text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS company_competitors text[];
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS linkedin_connections integer;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS linkedin_followers integer;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS linkedin_activity_level text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS last_event_attended text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS last_event_date date;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS next_event_attending text;
ALTER TABLE public.scanned_contacts ADD COLUMN IF NOT EXISTS next_event_date date;

UPDATE public.scanned_contacts
SET
  first_name = SPLIT_PART(name, ' ', 1),
  last_name = NULLIF(TRIM(SUBSTRING(name FROM POSITION(' ' IN name))), '')
WHERE first_name IS NULL AND name IS NOT NULL AND POSITION(' ' IN name) > 0;

UPDATE public.scanned_contacts
SET first_name = name
WHERE first_name IS NULL AND name IS NOT NULL AND POSITION(' ' IN name) = 0;

UPDATE public.scanned_contacts
SET company_technologies = technologies
WHERE company_technologies IS NULL AND technologies IS NOT NULL;

UPDATE public.scanned_contacts
SET ai_summary = COALESCE(company_summary, match_reason)
WHERE ai_summary IS NULL AND (company_summary IS NOT NULL OR match_reason IS NOT NULL);

UPDATE public.scanned_contacts
SET meeting_location = event_name
WHERE meeting_location IS NULL AND event_name IS NOT NULL;

UPDATE public.scanned_contacts
SET meeting_date = meeting_event_date
WHERE meeting_date IS NULL AND meeting_event_date IS NOT NULL;

UPDATE public.scanned_contacts
SET reply_received = response_received
WHERE reply_received IS NULL AND response_received IS NOT NULL;

UPDATE public.scanned_contacts
SET reply_date = response_date
WHERE reply_date IS NULL AND response_date IS NOT NULL;

UPDATE public.scanned_contacts
SET last_contacted_date = last_message_date
WHERE last_contacted_date IS NULL AND last_message_date IS NOT NULL;

UPDATE public.scanned_contacts
SET last_activity_channel = last_message_type
WHERE last_activity_channel IS NULL AND last_message_type IS NOT NULL;
