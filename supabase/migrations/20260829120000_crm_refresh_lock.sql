-- One refresh at a time, per connection.
--
-- Salesforce External Client Apps enforce refresh token rotation, and it is not
-- optional: a refresh returns a replacement refresh token and invalidates the
-- one just used. Reusing a rotated token does not merely fail — Salesforce
-- treats it as a replay and revokes the whole token family, which logs the
-- customer out of their own integration.
--
-- That turns a harmless race into a destructive one. Two ABC requests hitting a
-- 401 at the same moment would both read the stored refresh token and both send
-- it; the second is a replay by definition. A mutex in the Node process cannot
-- help, because two requests can be two Vercel instances that share nothing but
-- this database. So the coordination lives here, where both can see it.
--
-- Provider-neutral on purpose. Nothing about this is Salesforce-specific: any
-- provider that rotates refresh tokens needs exactly the same guarantee, and
-- HubSpot and Pipedrive simply never claim the lock.

ALTER TABLE public.crm_connections
  ADD COLUMN IF NOT EXISTS refresh_lock_id uuid,
  ADD COLUMN IF NOT EXISTS refresh_lock_expires_at timestamptz;

COMMENT ON COLUMN public.crm_connections.refresh_lock_id IS
  'Identifies the request currently refreshing this connection. Set by an atomic conditional UPDATE; cleared when the refresh finishes. Null when no refresh is in flight.';

COMMENT ON COLUMN public.crm_connections.refresh_lock_expires_at IS
  'When the refresh claim goes stale. A request that dies mid-refresh must not hold the connection for ever, so a claim older than this can be taken over.';

-- The claim is made by:
--
--   UPDATE public.crm_connections
--      SET refresh_lock_id = <new>, refresh_lock_expires_at = <now + ttl>
--    WHERE user_id = <owner> AND provider = <provider>
--      AND (refresh_lock_id IS NULL OR refresh_lock_expires_at < now())
--
-- which is atomic without any advisory lock or transaction of its own. Two
-- concurrent statements contend for the same row: the first takes the row lock
-- and writes, the second waits, then re-evaluates its WHERE against the
-- committed value and matches nothing. Exactly one request is told it won,
-- and only that one sends the refresh token.
--
-- No index. Every read of this table is already by (user_id, provider), which
-- the existing unique constraint indexes; these two columns are only ever read
-- and written through that same row.

-- No privilege change. Both columns inherit the table's grants, and the table
-- is server-only: `anon` and `authenticated` hold nothing on it. A lock id is
-- not a credential, but it belongs to the connection and has no reason to
-- travel further than the row it lives on.
--
-- No RLS change, no policy change, no existing row rewritten: both columns
-- arrive null, which reads as "no refresh in flight" — the correct state for
-- every connection that exists today.

NOTIFY pgrst, 'reload schema';
