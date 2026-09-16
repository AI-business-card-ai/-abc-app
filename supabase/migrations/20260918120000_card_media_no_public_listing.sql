-- Card media: public by URL, not listable by anyone.
--
-- 20260816120000_card_media_bucket_and_policies gave storage.objects a SELECT
-- policy for the 'card-media' bucket with no role restriction:
--
--   CREATE POLICY "card_media_public_read" ON storage.objects FOR SELECT
--     USING (bucket_id = 'card-media');
--
-- It was meant to let public cards show their images. It does more than that.
-- Storage's list and search operations run as the caller against
-- storage.objects under RLS, so that policy let an anonymous visitor enumerate
-- every object in the bucket — every owner folder, and through the folder names
-- every owner id — without knowing any card.
--
-- Showing an image never needed it. The bucket is public, and Storage serves
-- /storage/v1/object/public/card-media/<path> without consulting RLS: anyone who
-- has the URL of a published image can fetch it, which is what a public card
-- is. What goes away is discovering URLs nobody gave you.
--
-- Nothing in ABC relies on the removed policy. Every storage call is made on the
-- server with the service role, which bypasses RLS: uploads and removals in
-- app/api/card/media/route.ts, listing and removal in lib/account/delete.ts.
-- Pages build image URLs with getPublicUrl, which is string formatting. No
-- browser, PWA or native code reads, lists or signs storage objects.
--
-- After this migration:
--   anon              nothing on storage.objects for this bucket; public URLs
--                     still work because the bucket stays public
--   authenticated     may list, read, update and delete only objects inside a
--                     folder named after their own user id, and may insert only
--                     there; an update cannot move an object into someone
--                     else's folder
--   service_role      unchanged (bypasses RLS)
--
-- The bucket row is not touched: it stays public, with its size limit and MIME
-- allowlist. No object is written, moved or deleted.
--
-- The legacy 'avatars' bucket has no policies in this repository; whatever it
-- has in production was created outside migrations. See docs/store/data-inventory.md
-- (OWNER REVIEW) for the query to inspect it.

-- ---------------------------------------------------------------
-- No anonymous or cross-owner enumeration
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "card_media_public_read" ON storage.objects;

DROP POLICY IF EXISTS "card_media_owner_select" ON storage.objects;
CREATE POLICY "card_media_owner_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'card-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------
-- Owner writes, restated in full
-- ---------------------------------------------------------------
-- The same owner-folder rule as before. Restated so this migration defines the
-- bucket's whole policy set, and so UPDATE carries an explicit WITH CHECK: an
-- update may not rename an owner's object into another owner's folder.
DROP POLICY IF EXISTS "card_media_owner_insert" ON storage.objects;
CREATE POLICY "card_media_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'card-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "card_media_owner_update" ON storage.objects;
CREATE POLICY "card_media_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'card-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'card-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "card_media_owner_delete" ON storage.objects;
CREATE POLICY "card_media_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'card-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
