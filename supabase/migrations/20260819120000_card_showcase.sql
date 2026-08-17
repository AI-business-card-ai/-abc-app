-- Showcase — the optional "what I actually do" gallery on a public card.
--
-- A card answers who someone is and how to reach them. At a trade fair the
-- next question is always what they actually build, so the owner may attach up
-- to eight images: stand projects, installations, products, references.
--
-- Two profile columns hold the switch and the section heading, and the images
-- live in their own table. Eight rows, not eight columns: the count is a
-- product rule that may move, ordering has to be explicit, and captions belong
-- next to the image they describe. Only the public URL is stored — the bytes
-- stay in the existing card-media bucket.
--
-- Every product rule in here is also a database rule. The editor already
-- clamps titles, captions and the image count, but the editor is one client
-- holding one session token; the constraints below are what actually bind.

ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS showcase_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS showcase_title text NOT NULL DEFAULT 'My work';

/*
  Title length, enforced in the database.

  The truncation runs first and only touches rows that would fail the
  constraint. On a first run the column has just been created and every value
  is the default, so it changes nothing; on a re-run against real data it means
  the ALTER cannot abort the whole migration over one long title.
*/
UPDATE public.abc_profiles
  SET showcase_title = left(showcase_title, 50)
  WHERE char_length(showcase_title) > 50;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'abc_profiles_showcase_title_len'
      AND conrelid = 'public.abc_profiles'::regclass
  ) THEN
    ALTER TABLE public.abc_profiles
      ADD CONSTRAINT abc_profiles_showcase_title_len
      CHECK (char_length(showcase_title) <= 50);
  END IF;
END
$$;

-- user_id rather than the profile_id used elsewhere in the product spec:
-- card_links and card_events both key on user_id against the same table, and
-- one inconsistent name across four sibling tables costs more than it explains.
--
-- char_length, not length: a Czech or Greek caption is measured in characters
-- the owner typed, not in bytes it happens to encode to.
CREATE TABLE IF NOT EXISTS public.card_showcase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.abc_profiles(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text,
  item_type text NOT NULL DEFAULT 'other',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_showcase_items_image_url_present
    CHECK (char_length(btrim(image_url)) > 0),
  CONSTRAINT card_showcase_items_caption_len
    CHECK (caption IS NULL OR char_length(caption) <= 100),
  CONSTRAINT card_showcase_items_type_known
    CHECK (item_type IN ('project', 'product', 'reference', 'event', 'other')),
  CONSTRAINT card_showcase_items_sort_order_positive
    CHECK (sort_order >= 0)
);

/*
  The same four constraints, for a table created by an earlier run of this
  migration before they existed. CREATE TABLE IF NOT EXISTS silently skips its
  whole definition when the table is already there, constraints included, so
  the inline list above cannot be relied on to have been applied.
*/
DO $$
DECLARE
  missing record;
BEGIN
  FOR missing IN
    SELECT *
    FROM (VALUES
      ('card_showcase_items_image_url_present', 'char_length(btrim(image_url)) > 0'),
      ('card_showcase_items_caption_len', 'caption IS NULL OR char_length(caption) <= 100'),
      ('card_showcase_items_type_known',
       'item_type IN (''project'', ''product'', ''reference'', ''event'', ''other'')'),
      ('card_showcase_items_sort_order_positive', 'sort_order >= 0')
    ) AS c(name, expression)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = c.name
        AND conrelid = 'public.card_showcase_items'::regclass
    )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.card_showcase_items ADD CONSTRAINT %I CHECK (%s)',
      missing.name,
      missing.expression
    );
  END LOOP;
END
$$;

-- Every read is "this owner's items, in display order".
CREATE INDEX IF NOT EXISTS card_showcase_items_user_sort_idx
  ON public.card_showcase_items (user_id, sort_order);

/*
  The eight-image limit, enforced where it cannot be talked around.

  A disabled Add button is a courtesy to the owner, not a rule: anyone holding
  a session token can POST a ninth row directly to PostgREST. The check lives
  in the database so every path — the editor, a route handler, a service-role
  script, psql — hits the same wall. Only INSERT counts; reordering and
  recaptioning existing rows must stay free.

  The lock is the whole point of the first statement. Counting alone is not an
  enforcement: two transactions inserting at the same moment both read the same
  snapshot, both see seven, and both commit a ninth image between them. Taking
  FOR UPDATE on the owning profile row first makes concurrent inserts for one
  owner queue behind each other, so the second one counts what the first
  actually wrote. Inserts for different owners lock different rows and never
  contend.

  The row is locked, not modified, so this costs nothing beyond the wait — and
  the foreign key already requires that row to exist.
*/
CREATE OR REPLACE FUNCTION public.enforce_showcase_item_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item_count integer;
BEGIN
  PERFORM 1
  FROM public.abc_profiles
  WHERE id = NEW.user_id
  FOR UPDATE;

  SELECT count(*) INTO item_count
  FROM public.card_showcase_items
  WHERE user_id = NEW.user_id;

  IF item_count >= 8 THEN
    RAISE EXCEPTION 'showcase_limit_reached: a card may have at most 8 showcase images'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS card_showcase_items_limit ON public.card_showcase_items;
CREATE TRIGGER card_showcase_items_limit
  BEFORE INSERT ON public.card_showcase_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_showcase_item_limit();

-- Keep updated_at honest without the application having to remember.
CREATE OR REPLACE FUNCTION public.touch_showcase_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS card_showcase_items_touch ON public.card_showcase_items;
CREATE TRIGGER card_showcase_items_touch
  BEFORE UPDATE ON public.card_showcase_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_showcase_item();

/*
  Row-level security, matching how the editor already writes card_links: the
  signed-in owner reads and writes their own rows and nobody else's.

  There is deliberately no policy for anon. The public card is rendered
  server-side with the service role, which bypasses RLS, so the gallery reaches
  visitors through code that has already checked showcase_enabled — rather than
  through a blanket "anyone may read every showcase row" policy that would also
  serve the images of owners who switched the section off.
*/
ALTER TABLE public.card_showcase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_showcase_owner_select" ON public.card_showcase_items;
CREATE POLICY "card_showcase_owner_select"
  ON public.card_showcase_items FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "card_showcase_owner_insert" ON public.card_showcase_items;
CREATE POLICY "card_showcase_owner_insert"
  ON public.card_showcase_items FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "card_showcase_owner_update" ON public.card_showcase_items;
CREATE POLICY "card_showcase_owner_update"
  ON public.card_showcase_items FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "card_showcase_owner_delete" ON public.card_showcase_items;
CREATE POLICY "card_showcase_owner_delete"
  ON public.card_showcase_items FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
