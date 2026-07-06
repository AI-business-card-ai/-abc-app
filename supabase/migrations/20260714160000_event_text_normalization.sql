ALTER TABLE public.scanned_contacts
  ADD COLUMN IF NOT EXISTS raw_event_text text,
  ADD COLUMN IF NOT EXISTS normalized_event_text text;

NOTIFY pgrst, 'reload schema';
