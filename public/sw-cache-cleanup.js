/*
  Deletes the caches earlier versions of ABC's service worker wrote.

  Those versions stored Supabase responses ("supabase-api"), every page a
  signed-in person opened ("pages") and the start URL ("start-url") for up to a
  day: private data at rest on the device, still readable after sign-out. The
  current worker never reads or writes any of them, but a cache nobody uses is
  not a deleted cache, so this removes them when the new worker activates.

  "static-assets" and "image-assets" go too. Their old patterns matched every
  origin, so they can hold images from other hosts — Supabase Storage among
  them. Their replacements, "next-static" and "public-images", are same-origin
  only and refill on demand.

  A plain script loaded by the generated worker through importScripts, because
  it has to run inside the worker and needs nothing from the build.
*/
;(() => {
  const RETIRED_CACHES = ['supabase-api', 'pages', 'start-url', 'static-assets', 'image-assets']

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      Promise.all(RETIRED_CACHES.map((name) => caches.delete(name))).catch(() => undefined)
    )
  })
})()
