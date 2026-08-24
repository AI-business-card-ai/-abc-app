-- Credential containment for abc_profiles.
--
-- The profile table carries OAuth credentials next to ordinary settings, and
-- the `authenticated` role holds table-level SELECT on it. Row-level security decides
-- which rows a role may read, never which columns — so a signed-in browser was
-- entitled to its own google_access_token and google_refresh_token, and three
-- client components fetched them by running select(*) against PostgREST.
--
-- Owning the row is not a reason to be handed a bearer credential for a third
-- party's API. This replaces the table-level grants with column-level ones, so
-- the credential columns become unreachable for that role: not filtered, not
-- redacted — not granted.
--
-- Every legitimate query was converted to an explicit column list first, using
-- the same list generated below, so no screen loses a field it was reading.
-- Server code that genuinely needs credentials (lib/google-gmail-auth.ts,
-- app/auth/callback) already runs as service_role and is unaffected.

-- ---------------------------------------------------------------
-- SELECT
-- ---------------------------------------------------------------
-- Table-level first: a column grant cannot narrow a table grant that is still
-- in place, and Supabase's default privileges gave this table one.
REVOKE SELECT ON public.abc_profiles FROM authenticated;
REVOKE SELECT ON public.abc_profiles FROM anon;
REVOKE ALL ON public.abc_profiles FROM PUBLIC;

-- The 93 non-credential columns. Absent by construction:
--   google_access_token, google_refresh_token, google_token_expires_at,
--   hubspot_access_token, hubspot_refresh_token
GRANT SELECT (
  id, full_name, company, role, email, phone, linkedin_url, website, communication_style,
  outreach_language, goals, plan, scans_used, scans_limit, created_at, research_preferences,
  custom_questions, avatar_url, hubspot_portal_id, hubspot_connected_at, webhook_url,
  onboarding_completed, user_name, user_company, user_role, user_product, user_goal,
  user_icp, user_style, user_language, user_prompt, user_message_length, plan_activated_at,
  stripe_customer_id, stripe_subscription_id, research_company_size, research_revenue,
  research_location, research_news, research_events, research_linkedin, research_funding,
  research_competitors, research_tech, research_hiring, research_products,
  research_pain_points, research_custom, message_goal, message_length, product_description,
  icp, system_prompt, google_connected, google_email, card_slug, card_published,
  card_photo_url, card_cover_url, company_logo_url, card_tagline, card_bio, card_theme,
  card_accent, job_title, company_name, whatsapp, public_email, calendar_url, location,
  languages, looking_for, what_i_do, card_branding_removed, instagram_url, x_url,
  facebook_url, youtube_url, tiktok_url, github_url, threads_url, show_phone, show_whatsapp,
  show_email, show_website, show_calendar, show_location, social_enabled,
  card_cover_position, card_cover_fit, card_media_transforms, showcase_enabled,
  showcase_title
) ON public.abc_profiles TO authenticated;

-- ---------------------------------------------------------------
-- UPDATE
-- ---------------------------------------------------------------
-- Broad UPDATE was the other half of the problem, and a quieter one: with it, a
-- signed-in user could PATCH their own plan and scans_limit straight through
-- PostgREST and grant themselves a paid tier.
--
-- The replacement list is not the readable set minus a blocklist. It is the
-- union of every column the browser actually writes, read out of the eight
-- client call sites that write this table: the account settings form, the two
-- card editors and their four payload builders, the publish button, and
-- onboarding. Fifty columns. Everything else the browser has never written, so
-- granting it would only widen what a stolen session can reach.
--
-- Notably absent, each for a reason rather than by omission:
--   card_branding_removed  a paid capability — it decides whether ABC branding
--                          appears on the public card. Nothing writes it today,
--                          and a grant would let anyone PATCH it to true.
--   onboarding_completed   written by /api/onboarding/complete as service_role.
--   webhook_url            written by /api/export/webhook as service_role.
--   google_connected,      written by the auth callback and the scan route, both
--   google_email           service_role. Connection state is not client-owned.
--   hubspot_portal_id,     nothing writes these any more; HubSpot connection
--   hubspot_connected_at   truth moved to crm_connections in migration 1.
--   research_*, user_*,    no writer anywhere — columns left from earlier
--   custom_questions,      iterations. A grant with no caller is pure surface.
--   system_prompt, email,
--   card_bio
--
-- All of them remain readable, and all remain writable by service_role.
REVOKE UPDATE ON public.abc_profiles FROM authenticated;
REVOKE UPDATE ON public.abc_profiles FROM anon;

GRANT UPDATE (
  avatar_url, calendar_url, card_accent, card_cover_fit, card_cover_position,
  card_cover_url, card_media_transforms, card_photo_url, card_published, card_slug,
  card_tagline, card_theme, communication_style, company, company_logo_url, company_name,
  facebook_url, full_name, github_url, goals, icp, instagram_url, job_title, languages,
  linkedin_url, location, looking_for, message_goal, message_length, outreach_language,
  phone, product_description, public_email, role, show_calendar, show_email, show_location,
  show_phone, show_website, show_whatsapp, showcase_enabled, showcase_title, social_enabled,
  threads_url, tiktok_url, website, what_i_do, whatsapp, x_url, youtube_url
) ON public.abc_profiles TO authenticated;

-- ---------------------------------------------------------------
-- INSERT / DELETE
-- ---------------------------------------------------------------
-- Both are granted today and neither is used by a browser.
--
-- The INSERT grant is not idle: a probe shows it failing on the row-level
-- policy rather than on privilege, so the only thing stopping a signed-in user
-- from inserting their own profile row is that one already exists. A user whose
-- row were missing could create it with any plan and scans_limit they liked —
-- the same escalation the UPDATE grant above closes, reached through a
-- different door. Profile creation happens in the auth callback, the onboarding
-- route and the scan route, all as service_role, so nothing legitimate needs
-- this.
--
-- DELETE is inert today only because no policy makes any row visible to it, and
-- resting on that is the same mistake as resting on RLS for column secrecy. No
-- code deletes a profile at all.
REVOKE INSERT, DELETE ON public.abc_profiles FROM authenticated;
REVOKE INSERT, DELETE ON public.abc_profiles FROM anon;

-- Row-level security is unchanged and still confines every one of these to the
-- owner's own row. Column grants answer a different question — which fields
-- exist for that role at all — and that is the question RLS could not answer.

-- ---------------------------------------------------------------
-- Google credentials at rest
-- ---------------------------------------------------------------
-- Still plaintext in this table, and deliberately left that way for now: moving
-- and encrypting them means changing where Google's own OAuth flow reads and
-- writes, which is a separate change with its own testing. What closes today is
-- the part that was live — a browser being able to ask for them and receive
-- them. They remain readable by service_role, as they were.

NOTIFY pgrst, 'reload schema';
