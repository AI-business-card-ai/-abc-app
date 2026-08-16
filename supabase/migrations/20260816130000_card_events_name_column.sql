-- card_events title column drift.
--
-- 20260811160000_digital_business_card.sql declares the title column as
-- `name NOT NULL`. The deployed table was created manually with `event_name`
-- instead, and `name` does not exist there at all. Nothing wrote an event
-- title successfully: the editor's upsert targeted `name` and failed with
-- PGRST204, and the public card read `name` and rendered a blank heading.
--
-- The application now reads and writes `event_name` (see normalizeCardEventRow
-- and cardEventToRow). This converges any environment built from the migration
-- history onto the same column, without dropping data.

DO $$
BEGIN
  -- Bring the column into existence wherever it is missing.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'card_events' AND column_name = 'event_name'
  ) THEN
    ALTER TABLE public.card_events ADD COLUMN event_name text;
  END IF;

  -- Carry across any titles that were stored under the old column name, then
  -- make it optional so writes that only set event_name succeed.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'card_events' AND column_name = 'name'
  ) THEN
    EXECUTE 'UPDATE public.card_events SET event_name = name WHERE event_name IS NULL AND name IS NOT NULL';
    EXECUTE 'ALTER TABLE public.card_events ALTER COLUMN name DROP NOT NULL';
  END IF;
END $$;
