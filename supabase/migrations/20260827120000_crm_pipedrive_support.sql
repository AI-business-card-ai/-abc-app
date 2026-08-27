-- Room for a second CRM.
--
-- Phase 7C adds Pipedrive alongside HubSpot. Both `provider` checks already
-- accept 'pipedrive', so nothing here widens who may connect. Two things do not
-- fit yet, and this is the smallest change that makes them fit.
--
-- Nothing is dropped, nothing is rewritten, and no existing row changes value.

-- ---------------------------------------------------------------
-- 1. Remote object names Pipedrive actually uses
-- ---------------------------------------------------------------
-- `remote_object_type` is documented as "what the provider calls it", and the
-- existing list is HubSpot's vocabulary. Pipedrive has no contacts, companies
-- or tasks: it has persons, organizations and activities. Storing 'meeting'
-- for something Pipedrive calls an activity would make the column lie, and the
-- person who eventually debugs a mapping row is the one who pays for that.
--
-- A meeting and a follow-up are both activities in Pipedrive. They stay
-- distinct because `local_object_type` already separates 'encounter' from
-- 'follow_up', and the unique constraint spans both columns.
--
-- The constraint is dropped by lookup rather than by guessed name: the original
-- was declared inline, so its name was chosen by Postgres, and a DROP that
-- silently matched nothing would leave the old list quietly in force.
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
      'person', 'organization', 'activity'
    )
  );

-- ---------------------------------------------------------------
-- 2. Where a connection's API lives
-- ---------------------------------------------------------------
-- HubSpot answers on one host for everybody. Pipedrive does not: an OAuth app
-- must call the account's own domain, returned as `api_domain` with every token
-- and every refresh, and Pipedrive added that parameter precisely because a
-- company's domain can change under you.
--
-- So it is stored, and re-stored on each refresh, rather than derived once and
-- trusted forever. Nullable because HubSpot has nothing to put here and should
-- not be made to invent a value.
--
-- Not a secret: it is the hostname a customer already sees in their browser.
-- It lives in this table because it belongs to the connection, and the table
-- is server-only for other reasons that apply just as well to it.
ALTER TABLE public.crm_connections
  ADD COLUMN IF NOT EXISTS remote_api_base_url text;

COMMENT ON COLUMN public.crm_connections.remote_api_base_url IS
  'Provider API origin for this connection, when the provider is account-specific (Pipedrive api_domain). Null when the provider serves every account from one host (HubSpot).';

-- Privileges are inherited from the table and deliberately unchanged: a new
-- column on a table the browser cannot reach is still a column the browser
-- cannot reach. Restating the grants here would only risk widening them.

NOTIFY pgrst, 'reload schema';
