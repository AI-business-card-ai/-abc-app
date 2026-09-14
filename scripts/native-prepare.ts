/**
 * Prepares the native shell's local files before `cap sync`.
 *
 * Run with `npm run native:prepare`, or through `npm run native:sync`.
 *
 * The local pages in native-shell/www are shown only when ABC cannot be loaded,
 * and their "Try again" needs to know where ABC is. That origin comes from the
 * same resolver capacitor.config.ts uses, so the two can never disagree:
 * ABC_NATIVE_ORIGIN if set, otherwise the working default — https only, never a
 * Vercel deployment hostname.
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveNativeOrigin } from '../lib/native/config'

const origin = resolveNativeOrigin(process.env.ABC_NATIVE_ORIGIN)
const target = path.join(process.cwd(), 'native-shell', 'www', 'native-origin.js')

fs.writeFileSync(
  target,
  `// Written by \`npm run native:prepare\` from ABC_NATIVE_ORIGIN. Do not edit by hand.\nwindow.ABC_NATIVE_ORIGIN = ${JSON.stringify(origin)}\n`
)

console.log(`native shell origin: ${origin}`)
