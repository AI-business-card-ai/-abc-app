-- Async scan phases: basic (OCR only) -> enriched (full AI pipeline)
ALTER TABLE public.scanned_contacts
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'basic'
  CHECK (scan_status IN ('basic', 'enriched'));

UPDATE public.scanned_contacts
SET scan_status = 'enriched'
WHERE enrichment_status = 'DONE' OR enrichment_status IS NULL;
