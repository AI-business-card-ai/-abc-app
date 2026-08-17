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
    runtimeCaching: [
      {
        urlPattern: /^https?.*\.(?:js|css|woff2?|ttf|otf|eot)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: {
            maxEntries: 128,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
          cacheableResponse: { statuses: [0, 200] },
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
          cacheableResponse: { statuses: [0, 200] },
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
          cacheableResponse: { statuses: [0, 200] },
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
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
