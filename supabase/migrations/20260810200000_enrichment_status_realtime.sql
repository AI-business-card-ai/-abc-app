-- Ensure enrichment_status + realtime for progressive scan UI.
-- Safe to run manually in Supabase SQL editor (IF NOT EXISTS).

ALTER TABLE public.scanned_contacts
  ADD COLUMN IF NOT EXISTS enrichment_status text DEFAULT 'PENDING';

ALTER TABLE public.scanned_contacts
  ADD COLUMN IF NOT EXISTS enrichment_step text;

-- Backfill nulls
UPDATE public.scanned_contacts
SET enrichment_status = 'PENDING'
WHERE enrichment_status IS NULL;

-- Realtime needs full row for UPDATE payloads
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
