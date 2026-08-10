/**
 * Client-side image compression before upload.
 * Max width 1600px, JPEG quality 0.82 → faster upload + OCR.
 */
export async function compressImageForScan(
  file: File,
  opts: { maxWidth?: number; quality?: number } = {}
): Promise<File> {
  const maxWidth = opts.maxWidth ?? 1600
  const quality = opts.quality ?? 0.82

  if (!file.type.startsWith('image/')) return file
  // Skip tiny files — compression overhead not worth it
  if (file.size < 200_000) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }

    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.\w+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch (err) {
    console.warn('[compressImageForScan] falling back to original', err)
    return file
  }
}
