/*
  Build/deploy compatibility only. Nothing here runs at runtime.

  Vercel's Next builder asks, after `next build`, whether the build was a
  static export. It answers that by looking for `.next/export-detail.json`:

      async function getExportStatus(entryPath) {
        const pathExportDetail = path.join(entryPath, '.next', 'export-detail.json')
        ...
        switch (manifest.version) {
          case 1: return { success: !!manifest.success, outDirectory: manifest.outDirectory }
          default: return false
        }
      }

  (verified in the installed @vercel/next 15.0.2 and 17.0.0)

  This app is a server build, not a static export, so Next 14.2.18 never
  writes that file — correctly. The two builder versions above check for it
  with `fs.access` and treat its absence as "not an export", which is why a
  local `vercel build` completes here with no such file.

  The builder running for this project in the cloud does not: it fails with

      Error: ENOENT: no such file or directory,
      lstat '/vercel/path0/.next/export-detail.json'

  after the Next build has finished — stat'ing the path rather than
  access-checking it. That failure is what has kept every Preview deployment
  from completing.

  So the file is written here, after Next has finished with `.next` and before
  the builder inspects it.

  `{ "version": 0 }` is deliberate. Every builder version above routes an
  unrecognised version to `default: return false` — "this build is not a static
  export", which is exactly true. The alternatives would both lie:
  `{ version: 1, success: false }` claims an export that failed, and
  `success: true` would send the builder looking for an export output directory
  that does not exist.

  The 404/500 copies are belt-and-braces for a builder that reads the export
  directory. Only files Next actually generated are copied, and only when they
  exist — nothing is fabricated, and an app without them is left without them.
*/

const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const nextDir = path.join(root, '.next')

// `next build` failing should fail the build; this script is not the place to
// paper over that, so a missing .next means something earlier went wrong.
if (!fs.existsSync(nextDir)) {
  console.error('[vercel-export-detail-fix] .next is missing — did `next build` run?')
  process.exit(1)
}

const detailPath = path.join(nextDir, 'export-detail.json')

/*
  Never overwrite a real one. If a future Next version (or an `output: export`
  build) writes its own manifest, that file is the truth and this script has
  nothing to add.
*/
if (fs.existsSync(detailPath)) {
  console.log('[vercel-export-detail-fix] .next/export-detail.json already exists — left as is')
} else {
  fs.writeFileSync(detailPath, `${JSON.stringify({ version: 0 })}\n`)
  console.log('[vercel-export-detail-fix] wrote .next/export-detail.json {"version":0}')
}

const exportDir = path.join(nextDir, 'export')
const pages = [
  ['404.html', path.join(nextDir, 'server', 'pages', '404.html')],
  ['500.html', path.join(nextDir, 'server', 'pages', '500.html')],
]

const copied = []
for (const [name, source] of pages) {
  if (!fs.existsSync(source)) continue
  fs.mkdirSync(exportDir, { recursive: true })
  fs.copyFileSync(source, path.join(exportDir, name))
  copied.push(name)
}

console.log(
  copied.length > 0
    ? `[vercel-export-detail-fix] copied ${copied.join(', ')} into .next/export`
    : '[vercel-export-detail-fix] no generated 404/500 to copy'
)
