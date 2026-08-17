-- Independent framing for the two hero images.
--
-- card_cover_position / card_cover_fit (20260817120000) gave the cover a
-- nine-point position and a fill/fit switch. That is not enough control for a
-- hero: the owner also needs zoom, free pan, and — for the background — how
-- dark the readability overlay sits over it. The portrait needs its own zoom
-- and pan, independent of the background.
--
-- One additive JSONB column rather than seven scalar ones, so the shape can
-- grow without another migration:
--
--   {
--     "background": { "scale": 1, "x": 50, "y": 50, "overlay": 55 },
--     "portrait":   { "scale": 1, "x": 50, "y": 30 }
--   }
--
-- scale is a multiplier (1 = fit), x/y are percentages for object-position,
-- overlay is 0-100 percent opacity of the dark scrim.
--
-- Existing rows keep working untouched: when the column is null the app falls
-- back to the defaults above, and derives the background x/y from
-- card_cover_position so a card framed under the previous migration still
-- renders the way its owner left it. Nothing needs re-uploading.

ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS card_media_transforms jsonb;
