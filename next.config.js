const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  fallbacks: {
    document: '/offline',
  },
  workboxOptions: {
    disableDevLogs: true,
    /*
      The background-removal runtime must never be precached. Workbox already
      skips the 24 MB wasm for size, but the two onnxruntime .mjs files are
      small enough to slip into the precache manifest — which would make every
      visitor download the machinery for a feature only card owners use, at
      service-worker install time, before anyone has asked for it.

      It also removes the service worker from the path entirely for these
      assets, which matters because the editor behaves differently in
      production (where the worker is active) than in development (where it is
      disabled) — the one environmental difference between the desktop runs
      that passed and the iPhone run that failed.
    */
    exclude: [/ort[.\-].*\.mjs$/, /\.wasm$/],
    runtimeCaching: [
      /*
        The background-removal runtime must reach the network untouched.

        A real iPhone reported "Response served by service worker is opaque"
        during inference. An opaque response is one whose body cannot be read,
        and WebAssembly rejects it outright — so the moment the worker answers
        one of these requests from a cache, or proxies it without CORS,
        background removal cannot start. Excluding them from the precache was
        not enough: exclude governs precaching only and says nothing about what
        the worker does at runtime.

        NetworkOnly, registered before every other rule because Workbox matches
        in order, keeps the worker out of the way for the model, its runtime
        and the wasm binary. None of it is worth caching here: the browser's
        own HTTP cache already handles them, and they are fetched only when an
        owner asks for a cutout.

        A callback, not a RegExp, and that distinction is the whole point. A
        RegExp route in Workbox 7 is applied to a cross-origin request only
        when the match begins at index 0 of the full href:

          const s = t.exec(e.href);
          if (s && (e.origin === location.origin || 0 === s.index)) ...

        The previous pattern found "staticimgly.com" at index 8 of
        "https://staticimgly.com/…", so for the one host it was written for it
        never applied at all. A callback is evaluated as written, every origin.
      */
      {
        urlPattern: ({ url }) =>
          url.host === 'staticimgly.com' ||
          url.pathname.startsWith('/cutout-assets/') ||
          /ort[.\-].*\.mjs$/i.test(url.pathname) ||
          /\.wasm$/i.test(url.pathname),
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /^https?.*\.(?:js|css|woff2?|ttf|otf|eot)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: {
            maxEntries: 128,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
          cacheableResponse: { statuses: [200] },
        },
      },
      {
        urlPattern: /^https?.*\.(?:png|jpg|jpeg|svg|gif|webp|ico|avif)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'image-assets',
          expiration: {
            maxEntries: 128,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
          cacheableResponse: { statuses: [200] },
        },
      },
      {
        urlPattern: /^https:\/\/[^/]+\.supabase\.co\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-api',
          networkTimeoutSeconds: 3,
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60,
          },
          cacheableResponse: { statuses: [200] },
        },
      },
      {
        urlPattern: ({ request }) => request.mode === 'navigate',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          networkTimeoutSeconds: 3,
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60,
          },
          cacheableResponse: { statuses: [200] },
        },
      },
    ],
  },
})

/*
  Which build is actually running, readable from the page itself.

  Answering "is the fix deployed?" took a git remote check, a service-worker
  download and a byte comparison, because nothing the browser could see named
  the commit it came from. Vercel already knows the sha; exposing it as a meta
  tag turns that investigation into one request. Outside Vercel there is no sha
  to report, and 'dev' is the honest answer rather than a fabricated one.
*/
const BUILD_SHA = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_SHA: BUILD_SHA,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  experimental: {
    optimizePackageImports: ['@tabler/icons-react', 'framer-motion'],
  },
  webpack: (config) => {
    /*
      onnxruntime-web — pulled in by @imgly/background-removal for on-device
      background removal — ships a Node build alongside its browser one, and
      references it through `new URL('ort.node.min.mjs', import.meta.url)`.
      Webpack cannot tell that the branch is unreachable in a browser, emits
      the file as an asset, and the minifier then fails on its top-level
      `import` because it is being parsed as a classic script rather than a
      module.

      The file is only ever loaded when the runtime detects Node, which never
      happens in the card editor. Resolving the reference but emitting nothing
      leaves the browser path untouched and keeps the dead Node build out of
      the output entirely.
    */
    config.module.rules.push({
      test: /ort\.node\.min\.mjs$/,
      type: 'asset/resource',
      generator: { emit: false },
    })

    /*
      The browser runtime files are emitted the same way and are genuinely
      needed. They arrive already minified by Microsoft and use `import.meta`
      at the top level, which the minifier rejects because it parses emitted
      .mjs assets as classic scripts.

      Webpack's own answer to "this asset is already minified" is the
      `minimized` flag, which TerserPlugin honours — so the assets are marked
      before the minify stage rather than the minifier being reconfigured.
      Nothing else in the build changes, and a file named .min.mjs had nothing
      left to gain from another pass.
    */
    config.plugins.push({
      apply(compiler) {
        const { Compilation } = compiler.webpack
        compiler.hooks.compilation.tap('AbcMarkOrtMinimized', (compilation) => {
          compilation.hooks.processAssets.tap(
            {
              name: 'AbcMarkOrtMinimized',
              stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
            },
            (assets) => {
              for (const name of Object.keys(assets)) {
                if (/ort[.\-].*\.mjs$/.test(name)) {
                  compilation.updateAsset(name, (source) => source, { minimized: true })
                }
              }
            }
          )
        })
      },
    })

    return config
  },
}

module.exports = withPWA(nextConfig)
