#!/usr/bin/env node
/**
 * Data gates for the STATES track (docs/border-hybrid-plan.md §3.4 and §5): exits 1 when any check fails.
 *
 *   node scripts/data/clio/golden.mjs [--allow-size] [--no-modern]
 *
 *   sizes        every states chunk <= 1.8 MB, all states chunks together <= 16 MB   (--allow-size reports only)
 *   contiguity   chunks cover [MIN_YEAR, MAX_YEAR] without gaps; index.json agrees with the files
 *   segments     unique ids, a <= b, every boundary is a frame, every frame is a boundary or a snapshot year
 *   overlap      double-claimed state land < 1,000 km2 per frame (stats-states.json)
 *   golden       scripts/data/clio/golden.json point/year lookups against the built chunk files
 *   coast        coastal cities in 2000 (inside a state unless they are not on Natural Earth land at all);
 *                Constantinople inside a state for every year 330..2025
 *   modern fit   2000 frame vs Natural Earth countries: median IoU >= 0.9, none < 0.7 except MODERN_ALLOW
 *   firewall     build files and their local imports never reference historical-basemaps data
 *
 * golden.json may also hold `peopleAbsent`: [{ id: 'p:..', year, state, why }], people entities that must not be drawn in
 * that year (ghost duplicates of an active state, F1).
 * golden.json (builder B) is an array of { year, lng, lat (or point: [lng, lat]), expect, why? } where `expect` is an
 * entity name or id, an array of acceptable ones, or { not: name } / { none: true } (no state at that point).
 */
import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { booleanPointInPolygon, intersect, featureCollection } from '@turf/turf'
import { feature as topoFeature } from 'topojson-client'
import { CLIO_DIR, HIST_OUT, MAX_YEAR, MIN_YEAR, PUBLIC_DATA, STATE_FRAMES_DIR, areaKm2, bboxOf, entityId, hbSnapshotYears, polygonsOf, readJsonFile } from './lib.mjs'

const args = process.argv.slice(2)
const ALLOW_SIZE = args.includes('--allow-size')
const NO_MODERN = args.includes('--no-modern')
const MAX_CHUNK_KB = 1800
const MAX_TOTAL_MB = 16
/** Countries whose modern outline is allowed to fit badly (name or ISO3 -> reason). */
const MODERN_ALLOW = {
  PSE: 'Palestine: no Cliopatria state of its own',
  ESH: 'Western Sahara: administered by Morocco in Cliopatria',
  XKX: 'Kosovo: part of Serbia in Cliopatria',
  TWN: 'Taiwan: Republic of China',
  DNK: 'Denmark: the Cliopatria row is the Danish realm including Greenland',
  TLS: 'Timor-Leste: Indonesian in 2000 (independent 2002)',
  SSD: 'South Sudan: Sudan in 2000 (independent 2011)',
  Somaliland: 'Somaliland: part of Somalia (de facto state, not recognised)',
  MNE: 'Montenegro: Serbia-Montenegro in 2000 (independent 2006)',
  'Northern Cyprus': 'Northern Cyprus: de facto state, drawn as Cyprus or its own row',
  'Siachen Glacier': 'Siachen Glacier: disputed Kashmir',
  ATA: 'Antarctica: no state',
  FLK: 'Falkland Islands: part of the British Overseas Territories row',
  SGS: 'South Georgia: part of the British Overseas Territories row',
  ATF: 'French Southern and Antarctic Lands: part of the French Republic row',
  NCL: 'New Caledonia: part of the French Republic row',
  PYF: 'French Polynesia: part of the French Republic row',
  PRI: 'Puerto Rico: part of the USA row',
  WSM: 'Samoa: island state, no polygon at 1e-4 resolution',
  VUT: 'Vanuatu: archipelago, Cliopatria polygon is a coarse envelope',
  SLB: 'Solomon Islands: archipelago, coarse envelope',
  CPV: 'Cabo Verde: archipelago, coarse envelope',
  BHS: 'Bahamas: archipelago, coarse envelope',
  BRN: 'Brunei: two exclaves, coarse envelope',
  MAR: 'Morocco: Western Sahara included in the Cliopatria row',
  MWI: 'Malawi: Lake Malawi counted as water by Natural Earth',
}

const failures = []
const notes = []
const fail = (check, msg) => failures.push(`${check}: ${msg}`)
const ok = (check, msg) => notes.push(`  ok   ${check}: ${msg}`)

/* ---------------------------------------------------------------- files */

const index = await readJsonFile(join(HIST_OUT, 'index.json'))
const entities = (await readJsonFile(join(HIST_OUT, 'states-entities.json'))).entities
const stats = await readJsonFile(join(HIST_OUT, 'stats-states.json'))
const chunkCache = new Map()
async function chunkFeatures(chunk) {
  if (!chunkCache.has(chunk.id)) {
    const topo = await readJsonFile(join(HIST_OUT, chunk.states))
    chunkCache.set(chunk.id, topoFeature(topo, topo.objects.states).features)
  }
  return chunkCache.get(chunk.id)
}
const chunkFor = (y) => index.chunks.find((c) => y >= c.from && y <= c.to)
async function statesAt(y, lng, lat) {
  const feats = await chunkFeatures(chunkFor(y))
  return feats.filter((f) => f.properties.a <= y && y <= f.properties.b && booleanPointInPolygon([lng, lat], f))
}
function ringDistanceKm(lng, lat, ring) {
  const k = Math.cos((lat * Math.PI) / 180)
  let best = Infinity
  for (let i = 0; i + 1 < ring.length; i++) {
    const ax = (ring[i][0] - lng) * k
    const ay = ring[i][1] - lat
    const bx = (ring[i + 1][0] - lng) * k
    const by = ring[i + 1][1] - lat
    const dx = bx - ax
    const dy = by - ay
    const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return best * 111.195
}
/** Same fallback the client uses for clicks: the nearest active state whose edge lies within `km` of the point. */
async function nearState(y, lng, lat, km = 8) {
  const feats = await chunkFeatures(chunkFor(y))
  let best = null
  for (const f of feats) {
    if (!(f.properties.a <= y && y <= f.properties.b)) continue
    const [w, s, e, n] = bboxOf(f.geometry)
    if (lng < w - 0.3 || lng > e + 0.3 || lat < s - 0.3 || lat > n + 0.3) continue
    let d = Infinity
    for (const poly of polygonsOf(f.geometry)) for (const ring of poly) d = Math.min(d, ringDistanceKm(lng, lat, ring))
    if (d <= km && (!best || d < best.d)) best = { d, f }
  }
  return best
}
const growFrom = index.params?.growFromYear ?? MIN_YEAR

const land = (await readJsonFile(join(PUBLIC_DATA, 'modern/land.json'))).features
const onLandPoint = (p) => land.some((f) => booleanPointInPolygon(p, f))
const nameOf = (id) => entities[id]?.name ?? id

/* ---------------------------------------------------------------- sizes, contiguity */

{
  let total = 0
  let expect = MIN_YEAR
  for (const c of index.chunks) {
    const bytes = (await stat(join(HIST_OUT, c.states))).size
    total += bytes
    if (bytes > MAX_CHUNK_KB * 1024) (ALLOW_SIZE ? notes.push(`  warn size: ${c.id} is ${(bytes / 1024).toFixed(0)} KB (> ${MAX_CHUNK_KB})`) : fail('size', `${c.id} is ${(bytes / 1024).toFixed(0)} KB (> ${MAX_CHUNK_KB} KB)`))
    if (c.from !== expect) fail('contiguity', `chunk ${c.id} starts at ${c.from}, expected ${expect}`)
    expect = c.to + 1
  }
  if (expect !== MAX_YEAR + 1) fail('contiguity', `chunks end at ${expect - 1}, expected ${MAX_YEAR}`)
  if (total > MAX_TOTAL_MB * 1024 * 1024) (ALLOW_SIZE ? notes.push(`  warn size: states total ${(total / 1e6).toFixed(1)} MB (> ${MAX_TOTAL_MB})`) : fail('size', `states total ${(total / 1e6).toFixed(1)} MB (> ${MAX_TOTAL_MB} MB)`))
  else ok('size', `states total ${(total / 1e6).toFixed(1)} MB in ${index.chunks.length} chunks`)
  const files = (await readdir(join(HIST_OUT, 'states'))).length
  if (files !== index.chunks.length) fail('contiguity', `${files} chunk files on disk, ${index.chunks.length} in index.json`)
}

/* ---------------------------------------------------------------- segments */

{
  const frames = new Set(index.frames)
  const snaps = new Set([...(await hbSnapshotYears()), MIN_YEAR, MAX_YEAR])
  const seen = new Set()
  const boundaries = new Set()
  let bad = 0
  for (const c of index.chunks) {
    for (const f of await chunkFeatures(c)) {
      const p = f.properties
      if (!(p.a <= p.b)) fail('segments', `${p.sid}: a ${p.a} > b ${p.b}`)
      if (c.from <= p.a && p.a <= c.to) {
        if (seen.has(p.sid)) fail('segments', `duplicate segment id ${p.sid}`)
        seen.add(p.sid)
      }
      boundaries.add(p.a)
      if (p.b < MAX_YEAR) boundaries.add(p.b + 1)
    }
  }
  for (const b of boundaries) if (!frames.has(b)) bad++
  if (bad) fail('segments', `${bad} segment boundaries are not frames`)
  const idle = [...frames].filter((y) => !boundaries.has(y) && !snaps.has(y))
  if (idle.length) fail('segments', `${idle.length} frames without any segment boundary (first: ${idle.slice(0, 5).join(', ')})`)
  if (!bad && !idle.length) ok('segments', `${seen.size} segments, ${frames.size} frames consistent`)
}

/* ---------------------------------------------------------------- overlap */

{
  const worst = stats.frames.reduce((a, f) => (f.doubleKm2 > a.doubleKm2 ? f : a), { doubleKm2: 0 })
  if (worst.doubleKm2 >= 1000) fail('overlap', `frame ${worst.y} double-claims ${worst.doubleKm2} km2`)
  else ok('overlap', `max double-claimed land ${worst.doubleKm2} km2 per frame`)
  const vanished = stats.vanished.length
  if (vanished) notes.push(`  info vanished: ${vanished} row spans lost every pixel to higher-ranked rows (see stats-states.json)`)
}

/* ---------------------------------------------------------------- golden lookups */

{
  const file = join(CLIO_DIR, 'golden.json')
  if (!existsSync(file)) notes.push('  info golden: scripts/data/clio/golden.json not present yet (builder B)')
  else {
    const raw = await readJsonFile(file)
    const list = Array.isArray(raw) ? raw : (raw.lookups ?? raw.golden ?? [])
    let pass = 0
    for (const g of list) {
      const [lng, lat] = g.point ?? g.lonlat ?? [g.lng ?? g.lon, g.lat]
      const label = g.label ?? g.place ?? g.why ?? `${lng},${lat}`
      let hits = await statesAt(g.year, lng, lat)
      const want = 'expect' in g ? g.expect : g.entity ?? g.state
      const wants = (Array.isArray(want) ? want : [want]).filter((w) => typeof w === 'string')
      const judge = (hs) => {
        const ids = hs.map((f) => f.properties.e)
        const names = hs.map((f) => nameOf(f.properties.e))
        const hit = (w) => ids.includes(w) || ids.includes(entityId(w)) || names.includes(w)
        if (g.not) return !hit(g.not)
        if (want === null || want?.none) return hs.length === 0
        return wants.some(hit)
      }
      let good = judge(hits)
      let via = ''
      if (!good && g.coastal && !hits.length) {
        if (!onLandPoint([lng, lat])) {
          good = true
          via = 'not on Natural Earth land'
        } else if (g.year < growFrom) {
          const near = await nearState(g.year, lng, lat)
          if (near && judge([near.f])) {
            good = true
            via = `8 km snap (${near.d.toFixed(1)} km; coast growth starts ${growFrom})`
          }
        }
      }
      if (good) {
        pass++
        if (via) notes.push(`  info golden: ${g.year} ${label}: ${via}`)
      } else fail('golden', `${g.year} ${label}: expected ${g.not ? `not ${g.not}` : JSON.stringify(want)}, got ${hits.map((f) => nameOf(f.properties.e)).join(' | ') || 'no state'}`)
    }
    if (pass === list.length) ok('golden', `${pass}/${list.length} lookups`)
    // F1 ghost rule (docs/border-hybrid-qa.md): a people entity named like a state active in the same year must have no
    // segment in that year. Reads the built entity file only (no source data).
    const absent = Array.isArray(raw) ? [] : (raw.peopleAbsent ?? [])
    if (absent.length) {
      let bad = 0
      for (const g of absent) {
        const c = chunkFor(g.year)
        const topo = await readJsonFile(join(HIST_OUT, c.peoples))
        const hit = topoFeature(topo, topo.objects.peoples).features.find((f) => f.properties.e === g.id && f.properties.a <= g.year && g.year <= f.properties.b)
        if (hit) (bad++, fail('ghost', `${g.id} is drawn in ${g.year}, but ${g.state} is active: ${g.why ?? ''}`))
      }
      if (!bad) ok('ghost', `${absent.length} people ghosts absent where their state is active`)
    }
  }
}

/* ---------------------------------------------------------------- coast */

const CITIES = {Istanbul:[28.97,41.01],Venice:[12.34,45.44],Copenhagen:[12.57,55.68],Athens:[23.73,37.98],Naples:[14.25,40.85],Genoa:[8.93,44.41],Marseille:[5.37,43.3],Barcelona:[2.17,41.39],Lisbon:[-9.14,38.72],Amsterdam:[4.9,52.37],Hamburg:[9.99,53.55],Stockholm:[18.07,59.33],Helsinki:[24.94,60.17],StPetersburg:[30.31,59.94],Oslo:[10.75,59.91],Dublin:[-6.26,53.35],Liverpool:[-2.98,53.41],Alexandria:[29.92,31.2],Tunis:[10.18,36.8],Algiers:[3.06,36.75],Casablanca:[-7.59,33.57],Dakar:[-17.44,14.69],Lagos:[3.39,6.45],CapeTown:[18.42,-33.92],Mombasa:[39.67,-4.04],Mumbai:[72.83,18.94],Chennai:[80.27,13.08],Kolkata:[88.36,22.57],Karachi:[67.0,24.86],Dubai:[55.27,25.2],Singapore:[103.85,1.29],HongKong:[114.17,22.3],Shanghai:[121.47,31.23],Tokyo:[139.69,35.69],Osaka:[135.5,34.69],Manila:[120.98,14.6],Jakarta:[106.85,-6.2],Sydney:[151.21,-33.87],Rio:[-43.2,-22.91],BuenosAires:[-58.38,-34.6],Lima:[-77.03,-12.05],Valparaiso:[-71.62,-33.05],NewYork:[-74.0,40.71],Boston:[-71.06,42.36],SanFrancisco:[-122.42,37.77],LosAngeles:[-118.24,34.05],Havana:[-82.37,23.11],Veracruz:[-96.13,19.17],Montevideo:[-56.16,-34.9],Beirut:[35.5,33.89],Haifa:[34.99,32.79],Jeddah:[39.17,21.49],Aden:[45.03,12.79],Muscat:[58.41,23.59],Colombo:[79.86,6.93],Bangkok:[100.5,13.75],Saigon:[106.7,10.78],Busan:[129.08,35.18],Rome:[12.5,41.9],Paris:[2.35,48.85]}

const onLand = onLandPoint
{
  const outside = []
  const water = []
  for (const [name, p] of Object.entries(CITIES)) {
    if ((await statesAt(2000, ...p)).length) continue
    ;(onLand(p) ? outside : water).push(name)
  }
  const total = Object.keys(CITIES).length
  if (outside.length > 3) fail('coast', `${outside.length} of ${total} coastal cities on land are outside every state in 2000: ${outside.join(', ')}`)
  else ok('coast', `${outside.length} of ${total} cities outside (${outside.join(', ') || 'none'}); ${water.length} not on Natural Earth land: ${water.join(', ')}`)

  // Constantinople every year 330..2025: strictly inside a state from the first growth year, else within the client's 8 km snap
  const cand = [[28.98, 41.008], [28.96, 41.012], [28.95, 41.02], [28.99, 41.0], [28.97, 41.0]]
  const p = cand.find(onLand) ?? cand[0]
  const missing = []
  const snapped = []
  for (let y = 330; y <= MAX_YEAR; y += y < 1900 ? 5 : 1) {
    if ((await statesAt(y, ...p)).length) continue
    if ((y < growFrom || !onLand(p)) && (await nearState(y, ...p))) snapped.push(y)
    else missing.push(y)
  }
  if (missing.length) fail('coast', `Constantinople ${p} is outside every state (and not within 8 km of one) in ${missing.length} sampled years (first ${missing.slice(0, 6).join(', ')})`)
  else ok('coast', `Constantinople ${p} inside a state in every sampled year 330..${MAX_YEAR}${snapped.length ? ` (${snapped.length} years only via the 8 km snap: before ${growFrom} or the point is water on Natural Earth)` : ''}`)
}

/* ---------------------------------------------------------------- modern fit */

if (!NO_MODERN) {
  const frame = await readJsonFile(join(STATE_FRAMES_DIR, '2000.json'))
  const countries = (await readJsonFile(join(PUBLIC_DATA, 'modern/countries.json'))).features
  const sf = frame.features.map((f) => ({ f, bb: bboxOf(f.geometry), km2: areaKm2(f.geometry) }))
  const rows = []
  for (const c of countries) {
    const cb = bboxOf(c.geometry)
    const ck = areaKm2(c.geometry)
    let best = { iou: 0, e: '' }
    for (const s of sf) {
      if (s.bb[0] > cb[2] || cb[0] > s.bb[2] || s.bb[1] > cb[3] || cb[1] > s.bb[3]) continue
      let inter = 0
      try {
        const r = intersect(featureCollection([{ type: 'Feature', properties: {}, geometry: c.geometry }, s.f]))
        inter = r ? areaKm2(r.geometry) : 0
      } catch {
        continue
      }
      const iou = inter / (ck + s.km2 - inter)
      if (iou > best.iou) best = { iou, e: s.f.properties.e }
    }
    rows.push({ iso3: c.properties.iso3, name: c.properties.name, km2: ck, ...best })
  }
  // tiny countries (< 2,000 km2) are below the resolution of the source data: reported, not gated
  const gated = rows.filter((r) => r.km2 >= 2000)
  const sorted = gated.map((r) => r.iou).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const low = gated.filter((r) => r.iou < 0.7 && !MODERN_ALLOW[r.iso3] && !MODERN_ALLOW[r.name])
  if (median < 0.9) fail('modern', `median IoU ${median.toFixed(3)} < 0.9`)
  if (low.length) fail('modern', `${low.length} countries below IoU 0.7: ${low.map((r) => `${r.name} ${r.iou.toFixed(2)} (${nameOf(r.e)})`).join('; ')}`)
  if (median >= 0.9 && !low.length) ok('modern', `median IoU ${median.toFixed(3)} over ${gated.length} countries, none below 0.7`)
}

/* ---------------------------------------------------------------- firewall */

{
  const forbidden = [['.cache/raw/', 'hb'].join(''), ['public/data/', 'borders'].join(''), ['borders', '.mjs'].join(''), ['overrides', '.mjs'].join('')]
  const roots = ['lib', 'fetch', 'apply-corrections', 'build-states', 'index', 'corrections', 'colonies', 'ne-admin1'].map((n) => join(CLIO_DIR, `${n}.mjs`))
  const seen = new Set()
  const queue = roots.filter(existsSync)
  let bad = 0
  while (queue.length) {
    const f = queue.shift()
    if (seen.has(f)) continue
    seen.add(f)
    const text = await readFile(f, 'utf8')
    for (const w of forbidden) if (text.includes(w)) (bad++, fail('firewall', `${f.replace(CLIO_DIR + '/', '')} mentions "${w}"`))
    for (const m of text.matchAll(/(?:from|import\()\s*'(\.{1,2}\/[^']+)'/g)) {
      const p = resolve(dirname(f), m[1])
      if (existsSync(p) && p.endsWith('.mjs')) queue.push(p)
    }
  }
  if (!bad) ok('firewall', `${seen.size} files checked, no historical-basemaps references`)
}

console.log(notes.join('\n'))
if (failures.length) {
  console.error(`\n${failures.length} FAILED:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log('\nall state gates passed')
