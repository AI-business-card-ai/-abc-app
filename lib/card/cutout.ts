'use client'

/**
 * On-device background removal for the Hero portrait.
 *
 * The photograph never leaves the phone: segmentation runs locally against a
 * model the browser downloads on first use. That is the whole reason this
 * option was chosen over a hosted matting API — a customer's face is not
 * something to hand to a third party for a nicer edge.
 *
 * The library and its model are deliberately absent from the initial bundle.
 * A visitor reading a public card, and an owner opening the editor, must never
 * pay for a feature they have not asked for, so the import lives inside the
 * function and only runs when the owner presses the button.
 */

import { CARD_MEDIA_MAX_BYTES } from '@/lib/card/media-shared'

export type CutoutStage = 'loading-model' | 'processing'

export type CutoutProgress = {
  stage: CutoutStage
  /** 0–100, or null while the step reports no measurable total. */
  percent: number | null
  label: string
}

export type CutoutResult = { blob: Blob; url: string } | { error: string }

/** Transparent output only — a JPEG here would silently flatten the alpha. */
const OUTPUT_FORMAT = 'image/png'

function labelFor(key: string): { stage: CutoutStage; label: string } {
  // The library reports keys like "fetch:/models/isnet" and "compute:inference".
  if (key.startsWith('fetch')) {
    return { stage: 'loading-model', label: 'Downloading the model, one time only…' }
  }
  return { stage: 'processing', label: 'Removing the background…' }
}

/**
 * Produces a transparent PNG of the subject.
 *
 * Returns a readable error rather than throwing: every failure here is
 * something the owner might reasonably hit — an old browser without the
 * WebAssembly features the model needs, a phone that runs out of memory on a
 * 12-megapixel photograph, or a download that dies on fair wifi.
 */
export async function generateCutout(
  source: string | Blob,
  onProgress: (progress: CutoutProgress) => void
): Promise<CutoutResult> {
  try {
    onProgress({ stage: 'loading-model', percent: null, label: 'Preparing…' })

    // Lazy: this is the only reference to the package in the application, and
    // it is inside a function body so the bundler splits it into its own chunk.
    const { removeBackground } = await import('@imgly/background-removal')

    const blob = await removeBackground(source, {
      output: { format: OUTPUT_FORMAT },
      progress: (key: string, current: number, total: number) => {
        const { stage, label } = labelFor(key)
        const percent =
          Number.isFinite(current) && Number.isFinite(total) && total > 0
            ? Math.min(100, Math.round((current / total) * 100))
            : null
        onProgress({ stage, percent, label })
      },
    })

    if (!blob || blob.size === 0) {
      return { error: 'The cutout came back empty. Try a different photo.' }
    }
    if (blob.size > CARD_MEDIA_MAX_BYTES) {
      return { error: 'The cutout is too large to store. Try a smaller photo.' }
    }

    return { blob, url: URL.createObjectURL(blob) }
  } catch (err) {
    console.error('[card/cutout] background removal failed:', err)

    const message = err instanceof Error ? err.message : ''
    if (/wasm|WebAssembly|SIMD/i.test(message)) {
      return {
        error:
          'This browser cannot run background removal. Try Chrome or Safari on a newer device, or upload a transparent PNG.',
      }
    }
    if (/fetch|network|load/i.test(message)) {
      return { error: 'The model could not be downloaded. Check your connection and try again.' }
    }
    return {
      error: 'The background could not be removed. Try again, or upload a transparent PNG instead.',
    }
  }
}

/** A generated cutout is a local object URL until the owner accepts it. */
export function isPendingCutout(url: string | null): boolean {
  return typeof url === 'string' && url.startsWith('blob:')
}
