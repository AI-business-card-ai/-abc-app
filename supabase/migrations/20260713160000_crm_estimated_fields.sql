ALTER TABLE public.scanned_contacts
  ADD COLUMN IF NOT EXISTS crm_estimated_fields jsonb DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
