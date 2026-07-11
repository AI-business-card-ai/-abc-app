-- Post-scan context sheet fields (topic, follow-up, outreach channel prefs)
ALTER TABLE public.scanned_contacts
  ADD COLUMN IF NOT EXISTS meeting_topic text,
  ADD COLUMN IF NOT EXISTS followup_note text,
  ADD COLUMN IF NOT EXISTS preferred_channels text[] DEFAULT ARRAY['email', 'whatsapp', 'linkedin']::text[];

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scanned_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scanned_contacts TO service_role;

NOTIFY pgrst, 'reload schema';
