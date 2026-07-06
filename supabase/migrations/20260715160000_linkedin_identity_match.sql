ALTER TABLE public.scanned_contacts
  ADD COLUMN IF NOT EXISTS linkedin_match_status text,
  ADD COLUMN IF NOT EXISTS linkedin_match_confidence text,
  ADD COLUMN IF NOT EXISTS linkedin_profile_name text,
  ADD COLUMN IF NOT EXISTS linkedin_profile_company text,
  ADD COLUMN IF NOT EXISTS linkedin_mismatch_reason text;

NOTIFY pgrst, 'reload schema';
