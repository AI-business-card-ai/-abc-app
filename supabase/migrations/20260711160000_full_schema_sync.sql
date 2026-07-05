-- Full schema sync for abc-production (idempotent — safe to run multiple times).
-- Consolidates all column additions from supabase/migrations/* through 20260710160000.
-- Run manually in Supabase SQL Editor, then verify with NOTIFY reload below.

-- =============================================================================
-- abc_profiles — columns added after base schema (schema.sql)
-- =============================================================================
ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS research_preferences text[] DEFAULT ARRAY[
    'revenue', 'location', 'news', 'linkedin', 'reputation', 'events',
    'competitors', 'technology', 'decision_maker', 'pain_points'
  ],
  ADD COLUMN IF NOT EXISTS custom_questions text DEFAULT '',
  ADD COLUMN IF NOT EXISTS hubspot_api_key text,
  ADD COLUMN IF NOT EXISTS hubspot_access_token text,
  ADD COLUMN IF NOT EXISTS hubspot_refresh_token text,
  ADD COLUMN IF NOT EXISTS hubspot_portal_id text,
  ADD COLUMN IF NOT EXISTS hubspot_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS salesforce_access_token text,
  ADD COLUMN IF NOT EXISTS salesforce_refresh_token text,
  ADD COLUMN IF NOT EXISTS salesforce_instance_url text,
  ADD COLUMN IF NOT EXISTS salesforce_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS user_name text,
  ADD COLUMN IF NOT EXISTS user_company text,
  ADD COLUMN IF NOT EXISTS user_role text,
  ADD COLUMN IF NOT EXISTS user_product text,
  ADD COLUMN IF NOT EXISTS user_goal text,
  ADD COLUMN IF NOT EXISTS user_icp text,
  ADD COLUMN IF NOT EXISTS user_style text,
  ADD COLUMN IF NOT EXISTS user_language text,
  ADD COLUMN IF NOT EXISTS user_message_length text,
  ADD COLUMN IF NOT EXISTS user_prompt text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS research_company_size boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_revenue boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_location boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_news boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_events boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_linkedin boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_funding boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_competitors boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_tech boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_hiring boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_products boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_pain_points boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_custom text,
  ADD COLUMN IF NOT EXISTS message_goal text DEFAULT 'Schedule a meeting',
  ADD COLUMN IF NOT EXISTS message_length text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS product_description text,
  ADD COLUMN IF NOT EXISTS icp text,
  ADD COLUMN IF NOT EXISTS system_prompt text,
  ADD COLUMN IF NOT EXISTS google_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_email text,
  ADD COLUMN IF NOT EXISTS google_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_access_token text,
  ADD COLUMN IF NOT EXISTS google_token_expires_at timestamptz;

-- Allow starter plan tier (20260701160000_stripe.sql)
ALTER TABLE public.abc_profiles DROP CONSTRAINT IF EXISTS abc_profiles_plan_check;
ALTER TABLE public.abc_profiles
  ADD CONSTRAINT abc_profiles_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'team'));

-- =============================================================================
-- scanned_contacts — columns added after base schema (schema.sql)
-- =============================================================================
ALTER TABLE public.scanned_contacts
  ADD COLUMN IF NOT EXISTS enriched_context text,
  ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS pipeline_notes text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_date timestamptz,
  ADD COLUMN IF NOT EXISTS deal_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crm_status text DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS ai_lead_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_type text,
  ADD COLUMN IF NOT EXISTS contact_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS linkedin_headline text,
  ADD COLUMN IF NOT EXISTS linkedin_summary text,
  ADD COLUMN IF NOT EXISTS linkedin_experience jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_skills text[],
  ADD COLUMN IF NOT EXISTS linkedin_posts jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_education jsonb,
  ADD COLUMN IF NOT EXISTS enrichment_status text DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS enrichment_step text,
  ADD COLUMN IF NOT EXISTS events_past jsonb,
  ADD COLUMN IF NOT EXISTS events_upcoming jsonb,
  ADD COLUMN IF NOT EXISTS speaking_engagements jsonb,
  ADD COLUMN IF NOT EXISTS person_bio text,
  ADD COLUMN IF NOT EXISTS person_quotes jsonb,
  ADD COLUMN IF NOT EXISTS recent_news jsonb,
  ADD COLUMN IF NOT EXISTS deal_currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS expected_close_date date,
  ADD COLUMN IF NOT EXISTS lead_source text DEFAULT 'ABC AI Business Card',
  ADD COLUMN IF NOT EXISTS last_message_type text,
  ADD COLUMN IF NOT EXISTS last_message_date timestamptz,
  ADD COLUMN IF NOT EXISTS response_received boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS response_date timestamptz,
  ADD COLUMN IF NOT EXISTS messages_sent integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meeting_event_name text,
  ADD COLUMN IF NOT EXISTS meeting_event_date date,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS mobile_phone text,
  ADD COLUMN IF NOT EXISTS billing_city text,
  ADD COLUMN IF NOT EXISTS billing_country text,
  ADD COLUMN IF NOT EXISTS lead_status text DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS sic_code text,
  ADD COLUMN IF NOT EXISTS no_of_employees integer,
  ADD COLUMN IF NOT EXISTS annual_revenue numeric,
  ADD COLUMN IF NOT EXISTS rating text,
  ADD COLUMN IF NOT EXISTS opportunity_name text,
  ADD COLUMN IF NOT EXISTS opportunity_stage text DEFAULT 'Prospecting',
  ADD COLUMN IF NOT EXISTS close_probability integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS next_step text,
  ADD COLUMN IF NOT EXISTS opportunity_type text DEFAULT 'New Business',
  ADD COLUMN IF NOT EXISTS last_activity_channel text,
  ADD COLUMN IF NOT EXISTS last_activity_description text,
  ADD COLUMN IF NOT EXISTS last_contacted_date timestamptz,
  ADD COLUMN IF NOT EXISTS reply_received boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_date timestamptz,
  ADD COLUMN IF NOT EXISTS total_activities integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS enrichment_source text DEFAULT 'ABC AI Business Card',
  ADD COLUMN IF NOT EXISTS meeting_location text,
  ADD COLUMN IF NOT EXISTS meeting_date date,
  ADD COLUMN IF NOT EXISTS company_funding_stage text,
  ADD COLUMN IF NOT EXISTS company_technologies text[],
  ADD COLUMN IF NOT EXISTS company_news_summary text,
  ADD COLUMN IF NOT EXISTS company_competitors text[],
  ADD COLUMN IF NOT EXISTS linkedin_connections integer,
  ADD COLUMN IF NOT EXISTS linkedin_followers integer,
  ADD COLUMN IF NOT EXISTS linkedin_activity_level text,
  ADD COLUMN IF NOT EXISTS last_event_attended text,
  ADD COLUMN IF NOT EXISTS last_event_date date,
  ADD COLUMN IF NOT EXISTS next_event_attending text,
  ADD COLUMN IF NOT EXISTS next_event_date date,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS company_revenue text,
  ADD COLUMN IF NOT EXISTS technologies text[],
  ADD COLUMN IF NOT EXISTS icp_fit_score integer,
  ADD COLUMN IF NOT EXISTS intent_score integer,
  ADD COLUMN IF NOT EXISTS timing_score integer,
  ADD COLUMN IF NOT EXISTS accessibility_score integer,
  ADD COLUMN IF NOT EXISTS red_flags text,
  ADD COLUMN IF NOT EXISTS conversation_starters jsonb,
  ADD COLUMN IF NOT EXISTS scan_status text DEFAULT 'basic';

-- Backfill scan_status for rows created before async scan flow
UPDATE public.scanned_contacts
SET scan_status = 'enriched'
WHERE scan_status IS NULL
   OR (scan_status = 'basic' AND enrichment_status = 'DONE');

GRANT SELECT, INSERT, UPDATE ON public.abc_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.abc_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scanned_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scanned_contacts TO service_role;

NOTIFY pgrst, 'reload schema';
