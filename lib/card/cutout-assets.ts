/**
 * The two onnxruntime files the cutout runtime needs from our own origin.
 *
 * Shared between the route that serves them and the client that points
 * onnxruntime at them, so the two can never disagree about a path.
 * Deliberately free of client-only imports.
 */

/** Pinned: the upstream data package is versioned and content-addressed. */
export const CUTOUT_DATA_VERSION = '1.7.0'

export function cutoutDataPublicPath(): string {
  return `https://staticimgly.com/@imgly/background-removal-data/${CUTOUT_DATA_VERSION}/dist/`
}

/**
 * The allow-list, in full. A request naming anything else is a 404 — this
 * serves two files and cannot be pointed at a third.
 */
export const CUTOUT_ASSET_FILES = {
  'ort-wasm-simd-threaded.wasm': {
    key: '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
    contentType: 'application/wasm',
  },
  'ort-wasm-simd-threaded.mjs': {
    key: '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
    contentType: 'text/javascript; charset=utf-8',
  },
} as const

export type CutoutAssetFile = keyof typeof CUTOUT_ASSET_FILES

export function isCutoutAssetFile(value: string): value is CutoutAssetFile {
  return Object.prototype.hasOwnProperty.call(CUTOUT_ASSET_FILES, value)
}

export function cutoutAssetUrl(file: CutoutAssetFile): string {
  return `/cutout-assets/${file}`
}
