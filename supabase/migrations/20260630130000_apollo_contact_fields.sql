-- Apollo enrichment fields on scanned_contacts

alter table public.scanned_contacts
  add column if not exists photo_url text;

alter table public.scanned_contacts
  add column if not exists company_revenue text;

alter table public.scanned_contacts
  add column if not exists technologies text[];
