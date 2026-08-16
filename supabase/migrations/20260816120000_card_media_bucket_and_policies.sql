-- Card media storage — the P0 upload blocker.
--
-- 20260811160000_digital_business_card.sql was applied manually and its
-- storage.buckets INSERT never ran, so the 'card-media' bucket did not exist:
-- every profile photo / cover / logo upload failed with "Bucket not found",
-- and the editor surfaced it only in the save bar at the bottom of the form.
--
-- The bucket has since been created through the storage API. This file keeps
-- the repo able to rebuild the same state, and adds the owner-scoped policies
-- that were never created either.
--
-- Note: uploads are performed server-side by /api/card/media with the service
-- role, which bypasses these policies. They exist so that direct client access
-- is correctly scoped rather than silently blocked, and so a fresh environment
-- is not left globally writable.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'card-media',
  'card-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Anyone may read (the bucket is public and backs public cards).
DROP POLICY IF EXISTS "card_media_public_read" ON storage.objects;
CREATE POLICY "card_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'card-media');

-- A signed-in user may only write inside a folder named after their own id.
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
  );

DROP POLICY IF EXISTS "card_media_owner_delete" ON storage.objects;
CREATE POLICY "card_media_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'card-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
