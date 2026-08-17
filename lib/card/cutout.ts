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

export type CutoutStage =
  | 'checking'
  | 'loading-model'
  | 'processing'
  | 'unsupported'

export type CutoutProgress = {
  stage: CutoutStage
  /** 0–100, or null while the step reports no measurable total. */
  percent: number | null
  label: string
}

export type CutoutFailure = {
  error: string
  /**
   * The underlying stage and message. Never shown as the primary error — it
   * exists so an owner hitting a device-specific failure can hand back
   * something more useful than "it didn't work".
   */
  detail: string
}

export type CutoutResult = { blob: Blob; url: string } | CutoutFailure

/** Transparent output only — a JPEG here would silently flatten the alpha. */
const OUTPUT_FORMAT = 'image/png'

/**
 * iPhones cap how much memory a tab may use before Safari kills the page, and
 * the full-precision weights plus the runtime sit uncomfortably close to it.
 * The quantized model is a fraction of the size and materially less likely to
 * be the thing that fails on a phone at a trade fair — which is exactly where
 * this feature gets used.
 */
function preferSmallModel(): boolean {
  if (typeof navigator === 'undefined') return false
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (typeof memory === 'number' && memory <= 4) return true
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

/** Fail before downloading tens of megabytes the device cannot use anyway. */
function missingCapability(): string | null {
  if (typeof WebAssembly === 'undefined') return 'WebAssembly unavailable'
  try {
    // SIMD is required by the runtime's wasm build; Safari has it from 16.4.
    const simd = WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 30, 1, 28, 0, 65, 0, 253,
        15, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 253, 186, 1, 26, 11,
      ])
    )
    if (!simd) return 'WebAssembly SIMD unsupported'
  } catch {
    return 'WebAssembly SIMD check failed'
  }
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') {
    return 'no canvas available'
  }
  return null
}

function labelFor(key: string): { stage: CutoutStage; label: string } {
  // The library reports keys like "fetch:/models/isnet" and "compute:inference".
  if (key.startsWith('fetch')) {
    return { stage: 'loading-model', label: 'Downloading the model, one time only…' }
  }
  return { stage: 'processing', label: 'Removing the background…' }
}

const UNSUPPORTED_MESSAGE =
  "Automatic background removal isn't available on this device right now. You can try again, or upload a background-free portrait instead."

const GENERIC_MESSAGE =
  "The background couldn't be removed. You can try again, or upload a background-free portrait instead."

/**
 * Produces a transparent PNG of the subject.
 *
 * Returns a readable failure rather than throwing: every case here is one an
 * owner might reasonably hit — a device without the WebAssembly features the
 * runtime needs, a phone that runs out of memory partway through, or a model
 * download that dies on fair wifi.
 */
export async function generateCutout(
  source: string | Blob,
  onProgress: (progress: CutoutProgress) => void
): Promise<CutoutResult> {
  let reached: CutoutStage = 'checking'

  const gap = missingCapability()
  if (gap) {
    return { error: UNSUPPORTED_MESSAGE, detail: `capability: ${gap}` }
  }

  try {
    onProgress({ stage: 'checking', percent: null, label: 'Preparing…' })

    // Lazy: this is the only reference to the package in the application, and
    // it is inside a function body so the bundler splits it into its own chunk.
    const { removeBackground } = await import('@imgly/background-removal')

    reached = 'loading-model'
    const blob = await removeBackground(source, {
      // Explicit rather than defaulted: the worker proxy and the WebGPU
      // provider are the two paths most likely to behave differently on
      // Safari, and neither buys anything here.
      device: 'cpu',
      proxyToWorker: false,
      model: preferSmallModel() ? 'isnet_quint8' : 'isnet_fp16',
      output: { format: OUTPUT_FORMAT },
      progress: (key: string, current: number, total: number) => {
        const { stage, label } = labelFor(key)
        reached = stage
        const percent =
          Number.isFinite(current) && Number.isFinite(total) && total > 0
            ? Math.min(100, Math.round((current / total) * 100))
            : null
        onProgress({ stage, percent, label })
      },
    })

    if (!blob || blob.size === 0) {
      return { error: GENERIC_MESSAGE, detail: 'empty result blob' }
    }
    if (blob.size > CARD_MEDIA_MAX_BYTES) {
      return { error: 'That cutout is too large to store. Try a smaller photo.', detail: `blob ${blob.size}B` }
    }

    return { blob, url: URL.createObjectURL(blob) }
  } catch (err) {
    const name = err instanceof Error ? err.name : typeof err
    const message = err instanceof Error ? err.message : String(err)
    const detail = `stage=${reached} ${name}: ${message}`.slice(0, 300)
    console.error('[card/cutout] background removal failed:', detail, err)

    if (/wasm|WebAssembly|SIMD|Canvas|memory|allocation/i.test(message)) {
      return { error: UNSUPPORTED_MESSAGE, detail }
    }
    if (/fetch|network|Load failed|NetworkError|timeout/i.test(message)) {
      return {
        error: 'The model could not be downloaded. Check your connection and try again.',
        detail,
      }
    }
    return { error: GENERIC_MESSAGE, detail }
  }
}

/** A generated cutout is a local object URL until the owner accepts it. */
export function isPendingCutout(url: string | null): boolean {
  return typeof url === 'string' && url.startsWith('blob:')
}
