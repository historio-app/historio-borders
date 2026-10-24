/**
 * Shared helpers of the hybrid-borders STATES track (docs/border-hybrid-plan.md). Plain Node ESM, no build step.
 *
 * LICENCE FIREWALL: nothing in scripts/data/clio/{lib,fetch,apply-corrections,build-states,index,golden}.mjs may read
 * historical-basemaps (GPL) geometry or import its loader. The people build (build-peoples.mjs) may import from here.
 *
 * What the people build (builder C) can use from here on day 1:
 *   - constants MIN_YEAR / MAX_YEAR, directories (HIST_CACHE, HIST_OUT, STATE_FRAMES_DIR)
 *   - slug / entityId / realmId / rowId / segmentId             stable ids (plan §1.7)
 *   - hbSnapshotYears()                                         the 48 snapshot years
 *   - readRawRows() + frameYears()                              ingested rows (before corrections) and the frame list
 *   - uncorrectedFrameUnion(y)                                  rows active in y, dissolved per entity, no corrections
 *   - readStateFrame(y)                                         the real thing once build-states ran:
 *                                                               .cache/hist/state-frames/<y>.json (FeatureCollection,
 *                                                               one feature per state row, props {e, rid, realm})
 *   - chunkPlan()                                               chunk ids/ranges the states build wrote (else centuries)
 *   - canonGeom / geomHash / areaKm2 / labelPoint               geometry helpers
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import polylabel from 'polylabel'
import { area as turfArea } from '@turf/turf'
import mapshaper from 'mapshaper'
import { ROOT, CACHE, RAW, PUBLIC_DATA, HB_SNAPSHOT_YEARS, loadPolityPalette } from '../lib.mjs'

export { ROOT, CACHE, RAW, PUBLIC_DATA, loadPolityPalette }
export const CLIO_DIR = resolve(dirname(fileURLToPath(import.meta.url)))
export const MIN_YEAR = -3000
export const MAX_YEAR = 2025
export const CLIO_RAW = join(RAW, 'clio')
export const NE_RAW = join(RAW, 'ne')
export const HIST_CACHE = join(CACHE, 'hist')
/** HIST_TEST=<dir> redirects every build-states output (frames, chunks, entity files) to a scratch dir. */
const TEST = process.env.HIST_TEST
export const STATE_FRAMES_DIR = TEST ? join(TEST, 'state-frames') : join(HIST_CACHE, 'state-frames')
export const HIST_OUT = TEST ? join(TEST, 'out') : join(PUBLIC_DATA, 'hist')
export const ROWS_RAW_FILE = join(HIST_CACHE, 'rows-raw.json')
export const ROWS_CORRECTED_FILE = join(HIST_CACHE, 'rows-corrected.json')
export const CHUNK_PLAN_FILE = TEST ? join(TEST, 'chunk-plan.json') : join(HIST_CACHE, 'chunk-plan.json')
export const BUILD_FILE = TEST ? join(TEST, 'states-build.json') : join(HIST_CACHE, 'states-build.json')
export const GENERATED_INDEX = TEST ? join(TEST, 'borderIndex.json') : join(ROOT, 'src/data/generated/borderIndex.json')

/** Pinned input (plan §1.1). */
export const CLIO_PIN = {
  version: 'v0.2.1',
  doi: '10.5281/zenodo.23128623',
  zenodoRecord: '23128623',
  md5: 'caeecf41d0639f238e22c2e0e76e38ee',
  member: 'cliopatria_polities_only_v021.geojson',
}

/* ---------------------------------------------------------------- files */

export async function readJsonFile(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}
/** Atomic write; `pretty` = 1-space indent (small hand-read files), otherwise compact. */
export async function writeJsonFile(path, data, pretty = false) {
  await mkdir(dirname(path), { recursive: true })
  const text = pretty ? JSON.stringify(data, null, 1) + '\n' : JSON.stringify(data)
  await writeFile(path + '.part', text)
  await rename(path + '.part', path)
  return Buffer.byteLength(text)
}
export const sha256 = (data) => createHash('sha256').update(data).digest('hex')

/* ---------------------------------------------------------------- ids (plan §1.7) */

export function slug(name) {
  return (
    String(name)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'x'
  )
}
export const entityId = (name) => `s:${slug(name)}`
export const realmId = (realmName) => `r:${slug(realmName)}`
export const rowId = (entity, fromYear) => `${entity}@${fromYear}`
export const segmentId = (row, a) => `${row}#${a}`

/** Realm of a row = first MemberOf entry (parentheses stripped), otherwise its own name (plan §1.4). */
export function realmNameOf(name, memberOf) {
  const first = String(memberOf ?? '')
    .split(';')[0]
    .trim()
  const m = first.match(/^\((.*)\)$/)
  return (m ? m[1] : first).trim() || name
}

/* ---------------------------------------------------------------- years / frames */

/** The 48 historical-basemaps snapshot years (numbers only, no HB geometry). */
export async function hbSnapshotYears() {
  return [...HB_SNAPSHOT_YEARS]
}

/** Sorted frame years: row starts, row ends + 1, the HB snapshot years, MIN_YEAR, MAX_YEAR (all within range). */
export function frameYears(rows, extra = []) {
  const set = new Set([MIN_YEAR, MAX_YEAR, ...extra])
  for (const r of rows) {
    set.add(Math.max(MIN_YEAR, r.from))
    set.add(r.to + 1)
  }
  return [...set].filter((y) => y >= MIN_YEAR && y <= MAX_YEAR).sort((a, b) => a - b)
}

export const isActive = (row, y) => row.from <= y && y <= row.to

/** Overlap ranking, ascending = loses first (the LAST element wins): priority, newer FromYear, smaller area. */
export function rankAsc(a, b) {
  return (
    (a.priority ?? 0) - (b.priority ?? 0) ||
    a.from - b.from ||
    (b.km2 ?? 0) - (a.km2 ?? 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

/* ---------------------------------------------------------------- geometry */

export const polygonsOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [])
export const asGeometry = (polys) => (polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys })
export const areaKm2Poly = (poly) => turfArea({ type: 'Polygon', coordinates: poly }) / 1e6
export const areaKm2 = (geom) => (geom ? turfArea({ type: 'Feature', properties: {}, geometry: geom }) / 1e6 : 0)

const R4 = 1e4
/** Round to 1e-4 degrees (~11 m), drop repeated vertices and degenerate rings (in place on copies). */
export function roundGeom(geom, f = R4) {
  const polys = []
  for (const poly of polygonsOf(geom)) {
    const rings = []
    for (let i = 0; i < poly.length; i++) {
      const out = []
      for (const c of poly[i]) {
        const x = Math.round(c[0] * f) / f
        const y = Math.round(c[1] * f) / f
        const last = out[out.length - 1]
        if (!last || last[0] !== x || last[1] !== y) out.push([x, y])
      }
      if (out.length > 1 && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push([...out[0]])
      if (out.length >= 4) rings.push(out)
      else if (i === 0) break // exterior collapsed → drop the polygon
    }
    if (rings.length) polys.push(rings)
  }
  return polys.length ? asGeometry(polys) : null
}

const cmpPt = (p, q) => p[0] - q[0] || p[1] - q[1]
/** Rotate a closed ring so it starts at its smallest vertex (direction preserved). */
function rotateRing(ring) {
  const n = ring.length - 1
  if (n < 3) return ring
  let best = 0
  for (let i = 1; i < n; i++) if (cmpPt(ring[i], ring[best]) < 0) best = i
  if (best === 0) return ring
  return [...ring.slice(best, n), ...ring.slice(0, best), ring[best]]
}
/** Canonical form (ring start, ring order, polygon order) so equal shapes hash and serialise identically. */
export function canonGeom(geom) {
  if (!geom) return geom
  const polys = polygonsOf(geom).map((poly) => {
    const [outer, ...holes] = poly.map(rotateRing)
    holes.sort((a, b) => cmpPt(a[0], b[0]))
    return [outer, ...holes]
  })
  polys.sort((a, b) => cmpPt(a[0][0], b[0][0]) || b[0].length - a[0].length)
  return asGeometry(polys)
}
export const geomHash = (geom) => createHash('sha1').update(JSON.stringify(canonGeom(geom).coordinates)).digest('hex').slice(0, 16)

const D2R = Math.PI / 180
const toMerc = ([x, y]) => [x, Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, y)) * D2R) / 2)) / D2R]
const fromMerc = ([x, y]) => [x, (2 * Math.atan(Math.exp(y * D2R)) - Math.PI / 2) / D2R]
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d

/** Label point (pole of inaccessibility in Web-Mercator space of the largest part) + total area. */
export function labelPoint(geom) {
  let best = null
  let bestKm2 = -1
  let total = 0
  for (const poly of polygonsOf(geom)) {
    const km2 = areaKm2Poly(poly)
    total += km2
    if (km2 > bestKm2) {
      bestKm2 = km2
      best = poly
    }
  }
  if (!best) return { km2: 0, lx: 0, ly: 0 }
  const [x, y] = polylabel(best.map((ring) => ring.map(toMerc)), 0.05)
  const [lng, lat] = fromMerc([x, y])
  return { km2: Math.round(total), lx: round(lng, 3), ly: round(lat, 3) }
}

/** bbox [w, s, e, n] of a geometry. */
export function bboxOf(geom) {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const poly of polygonsOf(geom))
    for (const [x, y] of poly[0]) {
      if (x < w) w = x
      if (x > e) e = x
      if (y < s) s = y
      if (y > n) n = y
    }
  return [w, s, e, n]
}

/** mapshaper writes a GeometryCollection when a layer has no attribute table; normalise to a FeatureCollection. */
function asFeatureCollection(gj) {
  if (gj.type === 'GeometryCollection') return { type: 'FeatureCollection', features: gj.geometries.map((geometry) => ({ type: 'Feature', properties: {}, geometry })) }
  if (gj.type === 'Feature') return { type: 'FeatureCollection', features: [gj] }
  return gj
}

/** Run mapshaper commands on in-memory files; returns the parsed GeoJSON of each requested output. */
export async function ms(cmd, files, outs = ['out.json']) {
  const res = await mapshaper.applyCommands(cmd, files)
  const out = {}
  for (const o of outs) out[o] = res[o] ? asFeatureCollection(JSON.parse(res[o].toString())) : { type: 'FeatureCollection', features: [] }
  return outs.length === 1 ? out[outs[0]] : out
}

/* ---------------------------------------------------------------- rows */

/** Ingested rows before corrections: { source, rows: [{n, f, t, wp, qid, mo, geom}], composites, relations }. */
export async function readRawRows() {
  if (!existsSync(ROWS_RAW_FILE)) throw new Error(`${ROWS_RAW_FILE} missing - run: node scripts/data/clio/fetch.mjs`)
  return readJsonFile(ROWS_RAW_FILE)
}

/**
 * Rows active in year y WITHOUT corrections, dissolved per entity (one feature per Name; props {e, rid}). Meant for
 * developing against before build-states has produced .cache/hist/state-frames/. No overlap rule, no coast growth.
 */
export async function uncorrectedFrameUnion(y) {
  const raw = await readRawRows()
  const features = raw.rows
    .filter((r) => r.f <= y && y <= r.t)
    .map((r) => ({ type: 'Feature', properties: { e: entityId(r.n), rid: rowId(entityId(r.n), r.f) }, geometry: r.geom }))
  return ms('-i in.json -dissolve2 e copy-fields=rid -o out.json format=geojson precision=0.0001', { 'in.json': JSON.stringify({ type: 'FeatureCollection', features }) })
}

/** The state frame the states build wrote (FeatureCollection: one feature per state row, props {e, rid, realm}). */
export async function readStateFrame(y) {
  return readJsonFile(join(STATE_FRAMES_DIR, `${y}.json`))
}

/* ---------------------------------------------------------------- chunks */

export function centuryChunks() {
  const out = []
  for (let from = MIN_YEAR; from <= MAX_YEAR; from += 100) {
    const to = Math.min(MAX_YEAR, from + 99)
    out.push({ id: `${from}_${to}`, from, to })
  }
  return out
}
/** Chunk ranges of the last states build (written by build-states.mjs); centuries when none exists yet. */
export async function chunkPlan() {
  if (existsSync(CHUNK_PLAN_FILE)) return readJsonFile(CHUNK_PLAN_FILE)
  return centuryChunks()
}

/* ---------------------------------------------------------------- realm colours (plan §1.4) */

const MIN_DELTA_E = 28
const HUE_OFFSETS = [0, 7, 3, 11, 5, 13, 9, 2, 14, 6, 10, 4, 12, 1, 15, 8]
function hexToLab(hex) {
  const lin = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const [r, g, b] = lin
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047)
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722)
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

/**
 * Fixed colour per realm across all frames: hash of the realm id, nudged to another palette slot (hue-distant
 * offsets) only where an already-coloured neighbouring realm would be perceptually too close (ΔE < 28).
 * Largest realm first. `realmArea`: Map realmId → peak km². `neighbours`: Map realmId → Set(realmId), any frame.
 */
export async function assignRealmColours(realmArea, neighbours) {
  const { palette, hashIndex } = await loadPolityPalette()
  const lab = palette.map(hexToLab)
  const dE = (i, j) => Math.hypot(lab[i][0] - lab[j][0], lab[i][1] - lab[j][1], lab[i][2] - lab[j][2])
  const chosen = new Map()
  const realms = [...realmArea.keys()].sort((a, b) => realmArea.get(b) - realmArea.get(a) || (a < b ? -1 : 1))
  for (const realm of realms) {
    const taken = [...(neighbours.get(realm) ?? [])].map((n) => chosen.get(n)).filter((i) => i !== undefined)
    const base = hashIndex(realm)
    const candidates = HUE_OFFSETS.map((o) => (base + o) % palette.length)
    const distinct = (i) => (taken.length ? Math.min(...taken.map((t) => dE(i, t))) : Infinity)
    const pick = candidates.find((i) => distinct(i) >= MIN_DELTA_E) ?? candidates.reduce((best, i) => (distinct(i) > distinct(best) ? i : best), base)
    chosen.set(realm, pick)
  }
  return new Map([...chosen].map(([realm, i]) => [realm, palette[i]]))
}

export async function pMap(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}
