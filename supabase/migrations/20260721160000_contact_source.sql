-- Distinguish reverse QR leads from normal card scans
ALTER TABLE public.scanned_contacts
  ADD COLUMN IF NOT EXISTS source text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scanned_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scanned_contacts TO service_role;
