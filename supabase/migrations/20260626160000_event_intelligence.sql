ALTER TABLE public.scanned_contacts
ADD COLUMN IF NOT EXISTS events_past jsonb,
ADD COLUMN IF NOT EXISTS events_upcoming jsonb,
ADD COLUMN IF NOT EXISTS speaking_engagements jsonb,
ADD COLUMN IF NOT EXISTS person_bio text,
ADD COLUMN IF NOT EXISTS person_quotes jsonb,
ADD COLUMN IF NOT EXISTS recent_news jsonb;
