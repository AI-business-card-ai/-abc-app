ALTER TABLE public.scanned_contacts
ADD COLUMN IF NOT EXISTS deal_value numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS deal_currency text DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS expected_close_date date,
ADD COLUMN IF NOT EXISTS lead_source text DEFAULT 'ABC AI Business Card',
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_message_type text,
ADD COLUMN IF NOT EXISTS last_message_date timestamptz,
ADD COLUMN IF NOT EXISTS response_received boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS response_date timestamptz,
ADD COLUMN IF NOT EXISTS messages_sent integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS meeting_event_name text,
ADD COLUMN IF NOT EXISTS meeting_event_date date;
