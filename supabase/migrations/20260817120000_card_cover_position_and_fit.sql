-- Cover framing controls.
--
-- The cover was rendered with object-fit: cover and the browser default
-- object-position of 50% 50%, so a branded header image (a wordmark, booth
-- artwork) had its middle kept and its edges cut off with no way to correct it.
--
-- card_cover_position stores a CSS object-position pair ("center top",
-- "left center", …). card_cover_fit is 'fill' (object-fit: cover, the default)
-- or 'fit' (object-fit: contain, which shows the whole image on the card
-- background — useful for logos and artwork that must not be cropped).
--
-- Both are read with safe defaults, and the editor writes them in a separate
-- statement that is allowed to fail, so a database without this migration
-- still saves every other card field normally.

ALTER TABLE public.abc_profiles
  ADD COLUMN IF NOT EXISTS card_cover_position text DEFAULT 'center center',
  ADD COLUMN IF NOT EXISTS card_cover_fit text DEFAULT 'fill';
