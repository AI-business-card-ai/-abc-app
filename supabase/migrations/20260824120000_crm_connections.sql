-- Secure storage for CRM OAuth credentials.
--
-- HubSpot tokens currently live on abc_profiles as plaintext columns, and the
-- `authenticated` role holds SELECT on that table. Row-level security decides
-- which rows a role may read; it does not stop a role reading a column it has
-- been granted. So a signed-in browser can select its own OAuth tokens
-- directly — and the app does exactly that in several client components, which
-- means token secrecy has been resting on the frontend not asking for them.
--
-- Credentials therefore move to a table the browser has no privileges on at
-- all, reachable only through the service role from a server route. This is the
-- part RLS cannot do, and it is why encryption alone would not have been
-- enough: ciphertext handed to an attacker is still a stolen record, and the
-- point is that the row never leaves the server.

CREATE TABLE IF NOT EXISTS public.crm_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Provider-neutral from the start so Pipedrive does not arrive needing its
  -- own token table. Constrained rather than free text: a typo here would
  -- silently create a second, permanently disconnected "connection".
  provider text NOT NULL CHECK (provider IN ('hubspot', 'pipedrive', 'salesforce')),

  -- Which account at the provider, for the UI to name what is connected.
  -- Nullable: the connection works without it, and a lookup that failed should
  -- not fail the connect.
  remote_account_id text,

  -- AES-256-GCM, encoded v1:<iv>:<tag>:<ciphertext>. Encrypted in the
  -- application rather than the database so the key lives in the server's
  -- environment and never in Postgres, where a database backup would carry both
  -- the lock and the key.
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,

  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',

  -- Set when a refresh has failed and the owner must authorize again. The row
  -- is kept so the screen can say so; the tokens are cleared, because a refresh
  -- token that no longer refreshes is a secret with no remaining purpose.
  needs_reconnect boolean NOT NULL DEFAULT false,

  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One connection per owner per provider. Reconnecting replaces the
  -- credentials instead of leaving an older row behind still holding a
  -- refresh token nobody is watching.
  CONSTRAINT crm_connections_owner_provider_key UNIQUE (user_id, provider)
);

-- The unique constraint already indexes (user_id, provider), which is the only
-- lookup this table has. Nothing further to add.

ALTER TABLE public.crm_connections ENABLE ROW LEVEL SECURITY;

-- Defence in depth rather than the control. No policy can help a role that has
-- no table privileges, and none is granted below — but if a future migration
-- ever grants one by accident, this still confines it to the owner's own row.
DROP POLICY IF EXISTS "crm_connections_own" ON public.crm_connections;
CREATE POLICY "crm_connections_own" ON public.crm_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Privileges: the actual control
-- ---------------------------------------------------------------
-- This project has Supabase default privileges active, so a newly created table
-- arrives already granting ALL to anon and authenticated. Omitting a GRANT
-- withholds nothing; the revoke is what makes this table server-only.
REVOKE ALL ON public.crm_connections FROM PUBLIC;
REVOKE ALL ON public.crm_connections FROM anon;
REVOKE ALL ON public.crm_connections FROM authenticated;

-- Nothing for `authenticated`, deliberately — not even SELECT on the non-secret
-- columns. A browser asks a server route for connection status; that route
-- returns whether a CRM is connected and which account, and no part of the row
-- that could be used to act as the customer.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_connections TO service_role;

-- ---------------------------------------------------------------
-- Legacy HubSpot credentials
-- ---------------------------------------------------------------
-- Cleared rather than migrated into the new table.
--
-- Production holds zero of them — checked by counting non-null values without
-- reading any — so there is nothing to carry across, and requiring a reconnect
-- costs nobody anything. It is also the safer choice on principle: these tokens
-- were readable by the browser that held the session, so they should be treated
-- as exposed and reissued, not carefully re-encrypted and kept.
--
-- The columns themselves stay for now. No code reads or writes them any more,
-- and dropping columns in the same release that stops using them leaves no way
-- back if a deploy has to be rolled back. A later migration removes them.
UPDATE public.abc_profiles
SET
  hubspot_access_token = NULL,
  hubspot_refresh_token = NULL
WHERE hubspot_access_token IS NOT NULL
   OR hubspot_refresh_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';
