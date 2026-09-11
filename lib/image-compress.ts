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

/**
 * The most detail a vision model will actually use from one image.
 *
 * The API never processes an image larger than its model's tier allows: it
 * sees the image as 28×28-pixel patches and downscales anything over either
 * a long-edge limit or a patch count before reading it. So beyond that budget,
 * extra pixels are not extra detail — they are upload time on trade-fair wifi,
 * resampled away before the model looks.
 */
export type VisionBudget = {
  /** Longest side the model will read, in pixels. */
  maxLongEdge: number
  /** Most 28×28 patches the model will read. */
  maxVisualTokens: number
  /** JPEG quality for the single encode. */
  quality: number
}

const PATCH = 28

/** What may go to the model exactly as it came, when it is already small enough. */
const PASS_THROUGH_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const PASS_THROUGH_BYTES = 1_500_000

export function visualTokens(width: number, height: number): number {
  return Math.ceil(width / PATCH) * Math.ceil(height / PATCH)
}

/**
 * The largest size, at the source's aspect ratio, that the model will read
 * without downscaling it again. Never enlarges: a small source stays as it is.
 */
export function fitToVisionBudget(
  width: number,
  height: number,
  budget: Pick<VisionBudget, 'maxLongEdge' | 'maxVisualTokens'>
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }

  const long = Math.max(width, height)
  /*
    Every patch covers at most 28×28 px, so no image with more pixels than
    budget × 784 can fit — which bounds the long edge from above. From there,
    walk down one pixel at a time to the largest size whose rounded-up patch
    grid is within budget. A few dozen steps, and exact: a coarser search lands
    a pixel or two short of the size the model would actually have read.
  */
  const bound = Math.floor(long * PATCH * Math.sqrt(budget.maxVisualTokens / (width * height))) + 1
  let edge = Math.min(long, budget.maxLongEdge, bound)

  for (; edge > 1; edge--) {
    const scale = edge / long
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    if (visualTokens(w, h) <= budget.maxVisualTokens) return { width: w, height: h }
  }
  return { width: 1, height: 1 }
}

/**
 * Prepare a photograph for a vision model that has to read small print.
 *
 * Deliberately separate from `compressImageForScan`, which single-card scanning
 * keeps using unchanged. Three things differ, and each is about text staying
 * legible:
 *
 *   1. The target is the model's own budget rather than a width. The API would
 *      downscale anything larger anyway, so resizing here to exactly that size
 *      means one resample in total instead of two.
 *   2. The downscale is stepped. Shrinking a twelve-megapixel photo to one
 *      megapixel in a single canvas draw aliases fine strokes into mush on
 *      some browsers; halving first, then finishing, keeps the edges of small
 *      letters intact.
 *   3. A light JPEG encode. The camera frame has already been encoded once,
 *      and a second heavy pass on top of it is what eats thin type — so this
 *      one is at a quality where compression artefacts stay out of the letters.
 */
export async function prepareImageForVision(file: File, budget: VisionBudget): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  try {
    // Honours EXIF orientation, so a sideways gallery photo arrives upright.
    const bitmap = await createImageBitmap(file)
    const target = fitToVisionBudget(bitmap.width, bitmap.height, budget)

    /*
      Already within what the model reads, in a format it takes and at a size
      that uploads quickly: send it untouched. Anything else — a HEIC from a
      phone gallery, a heavy PNG — is re-encoded at its own dimensions.
    */
    const withinBudget = target.width >= bitmap.width && target.height >= bitmap.height
    if (withinBudget && PASS_THROUGH_TYPES.includes(file.type) && file.size <= PASS_THROUGH_BYTES) {
      bitmap.close()
      return file
    }

    let source: CanvasImageSource = bitmap
    let sw = bitmap.width
    let sh = bitmap.height

    while (sw / 2 >= target.width * 1.5 && sh / 2 >= target.height * 1.5) {
      const step = document.createElement('canvas')
      step.width = Math.floor(sw / 2)
      step.height = Math.floor(sh / 2)
      const sctx = step.getContext('2d')
      if (!sctx) break
      sctx.imageSmoothingEnabled = true
      sctx.imageSmoothingQuality = 'high'
      sctx.drawImage(source, 0, 0, step.width, step.height)
      source = step
      sw = step.width
      sh = step.height
    }

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, target.width, target.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', budget.quality)
    )
    if (!blob) return file

    const name = file.name.replace(/\.\w+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch (err) {
    console.warn('[prepareImageForVision] falling back to original', err)
    return file
  }
}
