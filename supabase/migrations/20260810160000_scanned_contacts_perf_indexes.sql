-- Performance indexes for scanned_contacts list / pipeline / CRM filters.
-- Apply manually in Supabase SQL editor if preferred (safe: IF NOT EXISTS).

-- Already present in schema.sql as scanned_contacts_user_idx — keep for clarity.
CREATE INDEX IF NOT EXISTS scanned_contacts_user_scanned_at_idx
  ON public.scanned_contacts (user_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS scanned_contacts_user_created_at_idx
  ON public.scanned_contacts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS scanned_contacts_user_crm_status_idx
  ON public.scanned_contacts (user_id, crm_status);

CREATE INDEX IF NOT EXISTS scanned_contacts_user_pipeline_stage_idx
  ON public.scanned_contacts (user_id, pipeline_stage);

CREATE INDEX IF NOT EXISTS scanned_contacts_user_enrichment_status_idx
  ON public.scanned_contacts (user_id, enrichment_status);

CREATE INDEX IF NOT EXISTS scanned_contacts_user_last_message_date_idx
  ON public.scanned_contacts (user_id, last_message_date DESC NULLS LAST);
