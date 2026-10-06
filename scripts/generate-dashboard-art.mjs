/**
 * Draws the two static pictures the Home dashboard uses, into public/hero.
 *
 *   home-world-dots.svg  A dotted world map, flat. Used as a CSS mask on the ABC
 *                   card, so the card's own theme decides its colour.
 *   home-globe.svg       The dotted globe with connection arcs behind Event & Expo
 *                   Intelligence.
 *
 * Both are decoration. They are generated rather than drawn by hand so the
 * coastline is one definition, and they are files rather than components so
 * a few thousand dots never enter the JavaScript bundle.
 *
 * The coastline is deliberately coarse: at the size and opacity these render,
 * a continent only has to read as a continent.
 *
 *   node scripts/generate-dashboard-art.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

// public/hero is outside the middleware matcher, so these are served as plain
// static files rather than passing through the auth check on every request.
const OUT = path.join(process.cwd(), 'public', 'hero')

// [lon, lat] rings, clockwise or not — the fill test does not care.
const LAND = [
  // North America
  [[-166,68],[-156,71],[-140,70],[-128,70],[-115,69],[-100,68],[-90,69],[-82,66],[-80,62],[-90,57],[-85,55],[-80,52],[-78,58],[-72,60],[-64,60],[-56,52],[-60,47],[-66,44],[-70,41],[-75,38],[-76,35],[-81,31],[-80,26],[-82,25],[-83,29],[-90,30],[-97,27],[-97,22],[-92,19],[-87,21],[-88,16],[-84,15],[-83,10],[-79,9],[-77,8],[-83,8],[-86,12],[-92,14],[-97,16],[-105,20],[-112,29],[-115,32],[-118,34],[-121,36],[-124,40],[-124,46],[-124,49],[-128,51],[-133,56],[-140,59],[-148,60],[-152,58],[-158,57],[-163,55],[-160,59],[-165,61],[-166,64]],
  // Greenland
  [[-55,60],[-45,60],[-40,65],[-22,70],[-20,76],[-18,81],[-35,83],[-60,82],[-70,78],[-60,75],[-55,70],[-52,65]],
  // Iceland
  [[-24,64],[-14,64],[-14,66],[-22,66.5]],
  // South America
  [[-80,9],[-75,11],[-70,12],[-62,11],[-55,6],[-50,2],[-45,-1],[-38,-4],[-35,-8],[-37,-13],[-39,-18],[-41,-22],[-45,-24],[-48,-27],[-50,-30],[-53,-34],[-57,-36],[-58,-39],[-62,-40],[-65,-42],[-66,-46],[-68,-50],[-70,-53],[-72,-54],[-74,-50],[-74,-45],[-73,-40],[-72,-33],[-71,-27],[-70,-20],[-72,-17],[-76,-14],[-78,-10],[-81,-6],[-80,-2],[-80,1],[-78,4],[-77,7]],
  // Eurasia
  [[-9,43],[-2,43.5],[-1,46],[-4,48],[2,51],[5,53],[8,54],[8,57],[10,59],[5,59],[5,62],[10,64],[14,67],[18,70],[25,71],[30,70],[40,68],[44,66],[50,68],[60,69],[70,73],[80,73],[90,75],[100,77],[110,74],[120,73],[130,71],[140,72],[150,71],[160,70],[170,70],[180,68],[180,65],[172,61],[163,60],[160,53],[156,51],[155,57],[150,59],[142,59],[137,54],[141,52],[140,48],[135,43],[130,42],[129,35],[126,35],[126,38],[125,40],[121,40],[122,37],[119,35],[121,31],[122,29],[119,25],[115,22],[110,21],[109,12],[106,9],[104,10],[101,13],[100,8],[103,1],[100,4],[98,8],[98,14],[97,17],[94,16],[92,22],[89,22],[86,20],[81,15],[80,10],[77,8],[76,11],[73,17],[73,21],[69,22],[66,25],[62,25],[57,26],[56,24],[59,22],[55,17],[52,16],[45,13],[43,13],[39,21],[35,28],[34,28],[33,31],[35,33],[36,36],[30,36],[27,37],[26,40],[23,38],[21,38],[19,42],[14,45],[16,41],[18,40],[16,38],[15,40],[12,42],[10,44],[8,44],[4,43],[3,42],[0,40],[-1,37],[-5,36],[-9,37]],
  // Great Britain, Ireland
  [[-5,50],[1,51],[2,53],[0,54],[-2,57],[-3,59],[-6,58],[-5,55],[-3,54],[-5,52]],
  [[-10,52],[-6,52],[-6,55],[-8,55],[-10,54]],
  // Africa, Madagascar
  [[-17,21],[-17,15],[-15,11],[-13,8],[-8,4],[-3,5],[2,6],[6,4],[9,4],[10,1],[9,-2],[12,-6],[13,-12],[12,-17],[14,-22],[15,-27],[18,-33],[20,-35],[25,-34],[28,-33],[32,-29],[33,-25],[35,-23],[35,-19],[40,-15],[40,-11],[39,-6],[40,-3],[42,0],[48,5],[51,11],[44,11],[43,13],[39,16],[37,20],[35,24],[33,28],[32,31],[29,31],[25,32],[20,31],[15,32],[10,34],[10,37],[5,37],[0,36],[-5,36],[-9,32],[-10,29],[-13,27]],
  [[44,-25],[47,-25],[50,-16],[49,-12],[44,-17]],
  // Japan, Philippines, Indonesia, New Guinea
  [[130,31],[132,34],[136,35],[140,36],[141,40],[141,43],[145,44],[142,46],[140,42],[139,38],[136,37],[132,35],[130,33]],
  [[120,18],[122,18],[126,7],[125,6],[121,13]],
  [[95,5],[98,4],[104,-2],[106,-6],[102,-5],[96,2]],
  [[109,1],[111,-3],[116,-4],[119,1],[117,7],[113,4]],
  [[105,-6],[114,-7],[114,-8.5],[106,-7.5]],
  [[131,-1],[138,-2],[147,-6],[150,-10],[142,-9],[138,-8]],
  // Australia, New Zealand
  [[114,-22],[114,-34],[118,-35],[124,-34],[130,-32],[135,-35],[138,-35],[141,-38],[147,-39],[150,-37],[153,-32],[153,-25],[149,-21],[145,-15],[142,-11],[140,-17],[136,-12],[131,-11],[126,-14],[122,-18]],
  [[172,-34],[178,-38],[174,-41],[171,-45],[167,-46],[172,-41]],
]

function inRing(lon, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const isLand = (lon, lat) => LAND.some((ring) => inRing(lon, lat, ring))
const r1 = (n) => Math.round(n * 10) / 10
const rad = (d) => (d * Math.PI) / 180

// ── home-world-dots.svg ──────────────────────────────────────────────────────────
function worldDots() {
  const STEP = 2.6
  const W = 360
  const H = 150 // lat 80 → -70
  let d = ''
  for (let lat = 80; lat >= -70; lat -= STEP) {
    for (let lon = -180; lon < 180; lon += STEP) {
      if (isLand(lon + STEP / 2, lat - STEP / 2)) d += `M${r1(lon + 180 + STEP / 2)} ${r1(80 - lat + STEP / 2)}h0`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><path d="${d}" stroke="#000" stroke-width="1.35" stroke-linecap="round" fill="none"/></svg>\n`
}

// ── globe.svg ───────────────────────────────────────────────────────────────
function globe() {
  const W = 900
  const H = 360
  const CX = 520
  const CY = 410
  const R = 300
  const LON0 = rad(18)
  const LAT0 = rad(22)

  // Orthographic projection; z > 0 is the visible face.
  function project(lon, lat, lift = 1) {
    const l = rad(lon)
    const p = rad(lat)
    const cosc = Math.sin(LAT0) * Math.sin(p) + Math.cos(LAT0) * Math.cos(p) * Math.cos(l - LON0)
    const x = Math.cos(p) * Math.sin(l - LON0)
    const y = Math.cos(LAT0) * Math.sin(p) - Math.sin(LAT0) * Math.cos(p) * Math.cos(l - LON0)
    return { x: CX + R * lift * x, y: CY - R * lift * y, z: cosc }
  }

  // Land dots, in opacity bands so the limb falls away.
  const bands = [[], [], [], []]
  const STEP = 2.4
  for (let lat = -60; lat <= 80; lat += STEP) {
    const lonStep = STEP / Math.max(0.25, Math.cos(rad(lat)))
    for (let lon = -180; lon < 180; lon += lonStep) {
      if (!isLand(lon, lat)) continue
      const pt = project(lon, lat)
      if (pt.z <= 0.04) continue
      if (pt.y > H + 4) continue
      const band = pt.z > 0.75 ? 3 : pt.z > 0.5 ? 2 : pt.z > 0.25 ? 1 : 0
      bands[band].push(`M${r1(pt.x)} ${r1(pt.y)}h0`)
    }
  }
  const bandStyle = [
    { o: 0.32, w: 2.2 },
    { o: 0.5, w: 2.7 },
    { o: 0.66, w: 3.1 },
    { o: 0.8, w: 3.4 },
  ]

  // Graticule: every 30°, front face only.
  const grid = []
  const line = (pts) => {
    let d = ''
    let pen = false
    for (const pt of pts) {
      if (pt.z <= 0 || pt.y > H + 10) {
        pen = false
        continue
      }
      d += `${pen ? 'L' : 'M'}${r1(pt.x)} ${r1(pt.y)}`
      pen = true
    }
    return d
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts = []
    for (let lon = -180; lon <= 180; lon += 3) pts.push(project(lon, lat))
    grid.push(line(pts))
  }
  for (let lon = -180; lon < 180; lon += 30) {
    const pts = []
    for (let lat = -90; lat <= 90; lat += 3) pts.push(project(lon, lat))
    grid.push(line(pts))
  }

  // Connection arcs between places people meet, lifted off the surface.
  const PLACES = {
    prague: [14.4, 50.1],
    london: [-0.1, 51.5],
    dubai: [55.3, 25.2],
    istanbul: [29, 41],
    lagos: [3.4, 6.5],
    nairobi: [36.8, -1.3],
    mumbai: [72.9, 19.1],
    madrid: [-3.7, 40.4],
    riyadh: [46.7, 24.7],
    capetown: [18.4, -33.9],
  }
  const ROUTES = [
    ['prague', 'dubai'],
    ['london', 'prague'],
    ['prague', 'istanbul'],
    ['madrid', 'lagos'],
    ['istanbul', 'mumbai'],
    ['dubai', 'nairobi'],
    ['london', 'riyadh'],
    ['lagos', 'capetown'],
  ]
  function arc(a, b) {
    const [lon1, lat1] = PLACES[a]
    const [lon2, lat2] = PLACES[b]
    // Interpolate on the sphere (slerp) and lift the middle of the path.
    const toV = (lon, lat) => [Math.cos(rad(lat)) * Math.cos(rad(lon)), Math.cos(rad(lat)) * Math.sin(rad(lon)), Math.sin(rad(lat))]
    const v1 = toV(lon1, lat1)
    const v2 = toV(lon2, lat2)
    const omega = Math.acos(Math.min(1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]))
    const pts = []
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      const s1 = Math.sin((1 - t) * omega) / Math.sin(omega)
      const s2 = Math.sin(t * omega) / Math.sin(omega)
      const v = [s1 * v1[0] + s2 * v2[0], s1 * v1[1] + s2 * v2[1], s1 * v1[2] + s2 * v2[2]]
      const lat = (Math.asin(v[2]) * 180) / Math.PI
      const lon = (Math.atan2(v[1], v[0]) * 180) / Math.PI
      pts.push(project(lon, lat, 1 + 0.11 * Math.sin(Math.PI * t) * Math.min(1, omega * 1.6)))
    }
    return line(pts)
  }
  const arcs = ROUTES.map(([a, b]) => arc(a, b))
  const nodes = Object.values(PLACES)
    .map(([lon, lat]) => project(lon, lat))
    .filter((pt) => pt.z > 0.05 && pt.y < H - 4)

  // Long threads that arrive from the left of the panel and land on the globe.
  const threadTargets = [PLACES.london, PLACES.prague, PLACES.lagos].map(([lon, lat]) => project(lon, lat))
  const threads = threadTargets.map((pt, i) => {
    const y0 = [70, 150, 235][i]
    return `M-10 ${y0}C${r1(160 + i * 30)} ${r1(y0 - 70 + i * 10)} ${r1(pt.x - 210)} ${r1(pt.y - 150 - i * 20)} ${r1(pt.x)} ${r1(pt.y)}`
  })

  const dots = bands
    .map((paths, i) => (paths.length ? `<path d="${paths.join('')}" stroke="#b58521" stroke-opacity="${bandStyle[i].o}" stroke-width="${bandStyle[i].w}" stroke-linecap="round" fill="none"/>` : ''))
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMaxYMax meet">
<defs>
<radialGradient id="halo" cx="${CX}" cy="${CY}" r="${R * 1.42}" gradientUnits="userSpaceOnUse"><stop offset="0.6" stop-color="#e2b64e" stop-opacity="0.42"/><stop offset="0.8" stop-color="#e9c46a" stop-opacity="0.16"/><stop offset="1" stop-color="#e2b64e" stop-opacity="0"/></radialGradient>
<radialGradient id="sphere" cx="${CX - R * 0.3}" cy="${CY - R * 0.62}" r="${R * 1.25}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff7e2" stop-opacity="0.95"/><stop offset="0.5" stop-color="#f3dca2" stop-opacity="0.85"/><stop offset="1" stop-color="#d4a542" stop-opacity="0.7"/></radialGradient>
<linearGradient id="limb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c99628" stop-opacity="0.2"/><stop offset="0.5" stop-color="#e2b64e" stop-opacity="0.9"/><stop offset="1" stop-color="#c99628" stop-opacity="0.3"/></linearGradient>
<linearGradient id="thread" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c99628" stop-opacity="0"/><stop offset="0.55" stop-color="#d4a53a" stop-opacity="0.5"/><stop offset="1" stop-color="#e2b64e" stop-opacity="0.9"/></linearGradient>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<circle cx="${CX}" cy="${CY}" r="${R * 1.42}" fill="url(#halo)"/>
<circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#sphere)"/>
<path d="${grid.join('')}" stroke="#b58521" stroke-opacity="0.13" stroke-width="1" fill="none"/>
${dots}
<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="url(#limb)" stroke-width="2"/>
<g fill="none" stroke-linecap="round">
<path d="${threads.join('')}" stroke="url(#thread)" stroke-width="1"/>
<path d="${arcs.join('')}" stroke="#f0cf7a" stroke-width="7" stroke-opacity="0.55" filter="url(#soft)"/>
<path d="${arcs.join('')}" stroke="#b8862a" stroke-width="1.6" stroke-opacity="1"/>
</g>
${nodes.map((pt) => `<circle cx="${r1(pt.x)}" cy="${r1(pt.y)}" r="9" fill="#f0cf7a" fill-opacity="0.6" filter="url(#soft)"/><circle cx="${r1(pt.x)}" cy="${r1(pt.y)}" r="2.6" fill="#fff6dd" stroke="#c99628" stroke-width="1.2"/>`).join('')}
</svg>
`
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'home-world-dots.svg'), worldDots())
fs.writeFileSync(path.join(OUT, 'home-globe.svg'), globe())
for (const name of ['home-world-dots.svg', 'home-globe.svg']) {
  console.log(`${name}  ${(fs.statSync(path.join(OUT, name)).size / 1024).toFixed(1)} KB`)
}
