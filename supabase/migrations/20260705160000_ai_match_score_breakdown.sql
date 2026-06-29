-- AI match score breakdown columns
ALTER TABLE public.scanned_contacts
ADD COLUMN IF NOT EXISTS icp_fit_score integer,
ADD COLUMN IF NOT EXISTS intent_score integer,
ADD COLUMN IF NOT EXISTS timing_score integer,
ADD COLUMN IF NOT EXISTS accessibility_score integer,
ADD COLUMN IF NOT EXISTS red_flags text,
ADD COLUMN IF NOT EXISTS conversation_starters jsonb;
