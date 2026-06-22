-- ABC CRM Pipeline fields on scanned_contacts
alter table public.scanned_contacts
  add column if not exists pipeline_stage text default 'new',
  add column if not exists pipeline_notes text,
  add column if not exists next_action text,
  add column if not exists next_action_date timestamptz,
  add column if not exists deal_value numeric;
