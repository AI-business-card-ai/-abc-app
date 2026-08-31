-- Durable rate limiting for the public Reverse Exchange endpoint.
--
-- The endpoint used a module-level Map. On Vercel that is per-instance and dies
-- with the instance, so the "5 per hour" it advertised was closer to "5 per
-- hour per lambda that happens to be warm" — no limit at all against anything
-- concurrent. This moves the counter to the one place every instance shares.
--
-- Counting happens inside a single statement. Read-then-write from the
-- application would let two simultaneous requests both read 4 and both write 5.
--
-- One table and one function serve every layer. The application decides what a
-- bucket means — a visitor against a card, an address against a card, a card
-- overall — and hashes the subject before it gets here, so this schema needs no
-- knowledge of any of them.

create table if not exists public.public_rate_limits (
  -- Opaque. The application HMACs (scope, subject, target) with a server-side
  -- secret, so this column never holds an IP address or an email address.
  bucket text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.public_rate_limits is
  'Rate-limit counters for unauthenticated endpoints. Keys are salted hashes; no IP or email is stored.';

-- Old windows are dead weight; this keeps a later sweep cheap.
create index if not exists public_rate_limits_window_idx
  on public.public_rate_limits (window_start);

/*
  Claim one unit of quota, atomically.

  Returns true when the caller is inside the limit and the hit was recorded,
  false when it is over. The whole decision is one INSERT ... ON CONFLICT with
  RETURNING, so concurrent callers serialise on the row rather than racing
  between a SELECT and an UPDATE. An expired window resets in that same
  statement, which is why there is no cleanup on the request path.

  SECURITY INVOKER, deliberately. The only caller is the server, which holds the
  service role and therefore already bypasses RLS — a definer function would add
  an escalation path worth having only if something without table rights needed
  to count, and nothing does.

  search_path is emptied so nothing in it can be shadowed; the one table is
  schema-qualified, and pg_catalog is always resolved regardless.
*/
create or replace function public.consume_public_rate_limit(
  p_bucket text,
  p_window_seconds integer,
  p_max_hits integer
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_hits integer;
begin
  if p_bucket is null or length(p_bucket) = 0 then
    return false;
  end if;

  insert into public.public_rate_limits as t (bucket, window_start, hits, updated_at)
  values (p_bucket, v_now, 1, v_now)
  on conflict (bucket) do update
    set hits = case
          when t.window_start < v_now - make_interval(secs => p_window_seconds) then 1
          else t.hits + 1
        end,
        window_start = case
          when t.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
          else t.window_start
        end,
        updated_at = v_now
  returning t.hits into v_hits;

  return v_hits <= p_max_hits;
end;
$$;

/*
  Nobody but the server reaches any of this.

  The revoke from PUBLIC is the one that matters and is easy to miss: CREATE
  FUNCTION grants EXECUTE to PUBLIC by default, so revoking from anon and
  authenticated alone leaves them holding it through PUBLIC — and PostgREST
  publishes anything in this schema they can execute. Without the line below,
  an anonymous browser could POST /rest/v1/rpc/consume_public_rate_limit and
  burn any bucket it could name.

  RLS with no policy closes the table itself. Supabase's default grants hand
  new public-schema tables to anon and authenticated, so those come off
  explicitly too — otherwise a visitor could delete their own counter row and
  lift their own limit.
*/
alter table public.public_rate_limits enable row level security;

revoke all on table public.public_rate_limits from public;
revoke all on table public.public_rate_limits from anon, authenticated;

revoke all on function public.consume_public_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_public_rate_limit(text, integer, integer) from anon, authenticated;

grant execute on function public.consume_public_rate_limit(text, integer, integer) to service_role;
