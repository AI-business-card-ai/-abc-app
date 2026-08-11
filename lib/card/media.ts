import type { SupabaseClient } from '@supabase/supabase-js'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

export type CardMediaKind = 'photo' | 'cover' | 'logo'

export function validateCardImage(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return 'Povolené formáty: JPG, PNG, WEBP'
  }
  if (file.size > MAX_BYTES) {
    return 'Maximální velikost je 5 MB'
  }
  return null
}

async function ensureCardMediaBucket(supabase: SupabaseClient): Promise<void> {
  try {
    const { data, error } = await supabase.storage.getBucket('card-media')
    if (error || !data) {
      const { error: createError } = await supabase.storage.createBucket('card-media', {
        public: true,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      })
      if (createError && !/already exists/i.test(createError.message)) {
        console.error('[card/media] createBucket failed:', createError)
      }
    }
  } catch (err) {
    console.error('[card/media] ensureBucket failed:', err)
  }
}

export async function uploadCardMedia(
  supabase: SupabaseClient,
  userId: string,
  kind: CardMediaKind,
  file: File
): Promise<{ url: string } | { error: string }> {
  const validation = validateCardImage(file)
  if (validation) return { error: validation }

  await ensureCardMediaBucket(supabase)

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${kind}-${Date.now()}.${ext}`

  try {
    const { error } = await supabase.storage.from('card-media').upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    })
    if (error) {
      console.error('[card/media] upload failed:', error)
      return { error: error.message || 'Upload selhal' }
    }
    const { data } = supabase.storage.from('card-media').getPublicUrl(path)
    return { url: data.publicUrl }
  } catch (err) {
    console.error('[card/media] unexpected upload error:', err)
    return { error: 'Upload selhal' }
  }
}
