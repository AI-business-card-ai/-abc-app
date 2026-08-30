-- Room for a third CRM.
--
-- Phase 7D adds Salesforce alongside HubSpot and Pipedrive. Both `provider`
-- checks already accept 'salesforce', and `crm_connections.remote_api_base_url`
-- — added for Pipedrive's api_domain — holds a Salesforce instance_url without
-- change, because it was named for what it is rather than for who returned it.
--
-- So one thing needs widening, and nothing else changes. Nothing is dropped,
-- nothing is rewritten, and no existing row changes value.

-- ---------------------------------------------------------------
-- Remote object names Salesforce actually uses
-- ---------------------------------------------------------------
-- Salesforce shares two names with HubSpot and means much the same by them: a
-- Contact is a contact, a Task is a task. Only its Account is genuinely new,
-- so only 'account' is added and nothing is removed.
--
-- 'event' is deliberately absent. ABC exports a meeting as a COMPLETED Task,
-- not an Event: Salesforce will not accept a timed Event without a duration or
-- an end time, and ABC knows neither — only when the meeting started. Writing a
-- default duration would put a measurement in somebody's CRM that nobody took.
--
-- 'lead' is absent for the same reason: ABC writes Contacts, not Leads.
-- Neither value is added speculatively; a value nothing writes is schema that
-- documents an intention rather than a fact.
--
-- A meeting and a follow-up are both Tasks in Salesforce and stay distinct
-- exactly as they always have, through `local_object_type` — 'encounter'
-- against 'follow_up' — which the unique constraint already spans.
--
-- The constraint is dropped by lookup rather than by guessed name: it has been
-- replaced once already, and a DROP that silently matched nothing would leave
-- the old list quietly in force.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'crm_object_mappings'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%remote_object_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.crm_object_mappings DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;
END $$;

ALTER TABLE public.crm_object_mappings
  ADD CONSTRAINT crm_object_mappings_remote_object_type_check
  CHECK (
    remote_object_type IN (
      -- HubSpot
      'contact', 'company', 'meeting', 'task',
      -- Pipedrive
      'person', 'organization', 'activity',
      -- Salesforce (also reuses 'contact' and 'task')
      'account'
    )
  );

-- No new column: a Salesforce instance_url is exactly what
-- `remote_api_base_url` was created to hold.
--
-- No privilege change: both tables stay server-only, and restating their grants
-- here would only risk widening them.

NOTIFY pgrst, 'reload schema';
