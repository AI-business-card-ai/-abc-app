-- What ABC has already created in somebody's CRM.
--
-- Pressing "Push to HubSpot" twice must not produce two of the same person, and
-- the only reliable way to know is to remember what the first push made. Each
-- remote object is recorded the moment the provider confirms it, so a retry —
-- after a partial failure, or a second deliberate push — reuses what exists
-- instead of starting again.
--
-- Provider-neutral from the start, like crm_connections: Pipedrive should not
-- arrive needing a second mapping table.

CREATE TABLE IF NOT EXISTS public.crm_object_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  provider text NOT NULL CHECK (provider IN ('hubspot', 'pipedrive', 'salesforce')),

  -- What ABC calls it. `contact` and `company` both key off the ABC contact —
  -- a company is not its own record here, it is the employer named on one.
  local_object_type text NOT NULL
    CHECK (local_object_type IN ('contact', 'company', 'encounter', 'follow_up')),
  local_object_id uuid NOT NULL,

  -- What the provider calls it. Ids are opaque strings, not uuids: HubSpot's
  -- are numeric, and another provider's will be something else again.
  remote_object_type text NOT NULL
    CHECK (remote_object_type IN ('contact', 'company', 'meeting', 'task')),
  remote_object_id text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- The idempotency guarantee, expressed as a constraint rather than trusted to
  -- the code: one local object maps to one remote object of a given kind, per
  -- owner, per provider. A second push upserts this row instead of adding one.
  CONSTRAINT crm_object_mappings_local_key
    UNIQUE (user_id, provider, local_object_type, local_object_id, remote_object_type)
);

-- The unique constraint indexes every lookup this table performs, which is
-- always "what did I make for this local object". Nothing further to add.

ALTER TABLE public.crm_object_mappings ENABLE ROW LEVEL SECURITY;

-- Defence in depth. No policy helps a role with no table privileges, and none
-- is granted below — but if a future migration ever grants one by accident,
-- this still confines it to the owner's own rows.
DROP POLICY IF EXISTS "crm_object_mappings_own" ON public.crm_object_mappings;
CREATE POLICY "crm_object_mappings_own" ON public.crm_object_mappings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Privileges: the actual control
-- ---------------------------------------------------------------
-- Supabase default privileges grant ALL to anon and authenticated on a newly
-- created table, so omitting a GRANT withholds nothing. The revoke is what
-- makes this server-only, exactly as it did for crm_connections.
REVOKE ALL ON public.crm_object_mappings FROM PUBLIC;
REVOKE ALL ON public.crm_object_mappings FROM anon;
REVOKE ALL ON public.crm_object_mappings FROM authenticated;

-- Nothing for the browser. These rows say which of an owner's people exist in
-- which CRM under which id — a map of somebody's customer relationships, which
-- a screen has no reason to hold and another owner must never see. The export
-- runs server-side and reports its own result.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_object_mappings TO service_role;

NOTIFY pgrst, 'reload schema';
