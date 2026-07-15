// Generates PWA icons: public/icons/icon-512.png, icon-192.png, icon-maskable-512.png
// Run: node scripts/generate-icons.mjs
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const OUT_DIR = path.resolve('public', 'icons')

/**
 * SVG icon: #0f0f0f background, rounded rect with a gradient ring
 * (#f0197d → #00d4d4) and bold white "AB" centered.
 * `pad` shrinks the artwork toward the center (maskable safe zone).
 */
function iconSvg(pad = 0) {
  const size = 512
  const inset = 32 + pad
  const rectSize = size - inset * 2
  const radius = Math.round(rectSize * 0.22)
  const fontSize = Math.round(200 - pad * 0.9)
  // dominant-baseline is unreliable in librsvg — offset y manually
  const textY = size / 2 + fontSize * 0.35

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f0197d"/>
      <stop offset="100%" stop-color="#00d4d4"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="#0f0f0f"/>
  <rect x="${inset}" y="${inset}" width="${rectSize}" height="${rectSize}" rx="${radius}"
        fill="none" stroke="url(#ring)" stroke-width="14" opacity="0.35"/>
  <rect x="${inset + 10}" y="${inset + 10}" width="${rectSize - 20}" height="${rectSize - 20}" rx="${radius - 6}"
        fill="none" stroke="url(#ring)" stroke-width="6"/>
  <text x="${size / 2}" y="${textY}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="900"
        fill="#ffffff">AB</text>
</svg>`
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const standard = Buffer.from(iconSvg(0))
  const maskable = Buffer.from(iconSvg(48))

  await sharp(standard).resize(512, 512).png().toFile(path.join(OUT_DIR, 'icon-512.png'))
  await sharp(standard).resize(192, 192).png().toFile(path.join(OUT_DIR, 'icon-192.png'))
  await sharp(maskable).resize(512, 512).png().toFile(path.join(OUT_DIR, 'icon-maskable-512.png'))

  console.log('Icons written to', OUT_DIR)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
