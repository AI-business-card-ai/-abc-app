ALTER TABLE public.scanned_contacts
ADD COLUMN IF NOT EXISTS enrichment_status text DEFAULT 'DONE',
ADD COLUMN IF NOT EXISTS enrichment_step text;

ALTER TABLE public.scanned_contacts
ALTER COLUMN enrichment_status SET DEFAULT 'PENDING';

ALTER TABLE public.scanned_contacts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'scanned_contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scanned_contacts;
  END IF;
END $$;
