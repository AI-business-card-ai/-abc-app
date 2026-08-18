import { NextResponse } from 'next/server'
import {
  CUTOUT_ASSET_FILES,
  cutoutDataPublicPath,
  isCutoutAssetFile,
  type CutoutAssetFile,
} from '@/lib/card/cutout-assets'

/**
 * The onnxruntime wasm and its loader, served from our own origin.
 *
 * @imgly/background-removal downloads these two files and hands them to
 * onnxruntime as object URLs:
 *
 *   const wasmPath = await loadAsUrl(`${base}.wasm`, config)   // blob:…
 *   const mjsPath  = await loadAsUrl(`${base}.mjs`, config)    // blob:…
 *   ort.env.wasm.wasmPaths = { mjs: mjsPath, wasm: wasmPath }
 *
 * On a service-worker-controlled page WebKit routes `blob:` fetches through
 * the worker and yields an opaque response, and WebAssembly cannot read a body
 * it is not allowed to see — which is the "Response served by service worker
 * is opaque" a real iPhone reported at stage=processing, after every download
 * had already succeeded. There is no configuration option for that handoff;
 * the library hardcodes it. So the bytes are given a real same-origin URL
 * here, and the client hands onnxruntime that instead of an object URL.
 *
 * This is not a general proxy. It serves two fixed files, from one fixed
 * upstream, and nothing in the request can point it at a third.
 */

/*
  Edge, and streamed, because the wasm is 11.8 MB and a Node serverless
  response on Vercel is capped at 4.5 MB — buffering it would fail in
  production while passing everywhere else. Chunks are piped through as they
  arrive, so nothing holds the whole binary in memory either.
*/
export const runtime = 'edge'

/** The upstream stores each asset as content-addressed chunks. */
type Manifest = Record<string, { size: number; chunks: { name: string }[] }>

let manifestCache: { at: number; value: Manifest } | null = null
const MANIFEST_TTL_MS = 60 * 60 * 1000

async function manifest(): Promise<Manifest> {
  const now = Date.now()
  if (manifestCache && now - manifestCache.at < MANIFEST_TTL_MS) return manifestCache.value

  const res = await fetch(`${cutoutDataPublicPath()}resources.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`manifest ${res.status}`)
  const value = (await res.json()) as Manifest
  manifestCache = { at: now, value }
  return value
}

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const file = params.file
  if (!isCutoutAssetFile(file)) {
    return NextResponse.json({ error: 'Unknown asset.' }, { status: 404 })
  }

  const asset = CUTOUT_ASSET_FILES[file as CutoutAssetFile]

  let entry: Manifest[string] | undefined
  try {
    entry = (await manifest())[asset.key]
  } catch (err) {
    console.error('[cutout-assets] manifest unavailable:', err)
    return NextResponse.json({ error: 'Asset unavailable.' }, { status: 502 })
  }
  if (!entry) {
    return NextResponse.json({ error: 'Asset not published upstream.' }, { status: 502 })
  }

  const chunks = entry.chunks
  const expected = entry.size

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let written = 0
      try {
        // Sequential on purpose: the chunks are pieces of one binary and must
        // arrive in order, and a phone does not benefit from six parallel
        // multi-megabyte downloads competing for the same connection.
        for (const chunk of chunks) {
          const res = await fetch(`${cutoutDataPublicPath()}${chunk.name}`)
          if (!res.ok || !res.body) throw new Error(`chunk ${chunk.name} ${res.status}`)

          const reader = res.body.getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            written += value.byteLength
            controller.enqueue(value)
          }
        }

        if (written !== expected) {
          // Truncation here would surface later as a wasm that fails to
          // compile, with a far less obvious message than this one.
          throw new Error(`size mismatch: sent ${written}, expected ${expected}`)
        }
        controller.close()
      } catch (err) {
        console.error('[cutout-assets] stream failed for', file, err)
        controller.error(err)
      }
    },
  })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': asset.contentType,
      'Content-Length': String(expected),
      // Content-addressed upstream and pinned to a package version, so what
      // this URL returns never changes.
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
    },
  })
}
