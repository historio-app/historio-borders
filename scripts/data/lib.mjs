/**
 * Shared helpers for the HistorIO data pipeline (scripts/data/*.mjs).
 * Plain Node ≥ 22 ESM, no build step.
 */
import { mkdir, readFile, writeFile, stat, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { geoArea, geoEquirectangular, geoStream } from 'd3-geo'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const CACHE = join(ROOT, '.cache')
export const RAW = join(CACHE, 'raw')
export const PUBLIC_DATA = join(ROOT, 'public/data')

export const HB_BASE = 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson'
export const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'

/** The 48 historical-basemaps snapshot years (aourednik/historical-basemaps world_<key>.geojson). */
export const HB_SNAPSHOT_YEARS = [
  -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300, -200, -100, -1, 100, 200, 300, 400,
  500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650, 1700,
  1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010,
]
/** File stem of a snapshot: world_bc323 / world_1453 style. */
export const hbSnapshotKey = (y) => (y < 0 ? `bc${-y}` : String(y))

export async function loadSnapshotYears() {
  return { years: [...HB_SNAPSHOT_YEARS], snapshotKey: hbSnapshotKey }
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
}

/** Download `url` to `dest` unless it already exists (atomic: writes .part then renames). */
export async function download(url, dest, { retries = 3 } = {}) {
  if (existsSync(dest)) return { cached: true, path: dest }
  await ensureDir(dirname(dest))
  let lastErr
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(dest + '.part', buf)
      await rename(dest + '.part', dest)
      return { cached: false, path: dest, bytes: buf.length }
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 600 * attempt))
    }
  }
  throw lastErr
}

/** Run tasks with bounded concurrency. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return out
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

/** Compact JSON writer; returns size in bytes. */
export async function writeJson(path, data) {
  await ensureDir(dirname(path))
  const s = JSON.stringify(data)
  await writeFile(path, s)
  return Buffer.byteLength(s)
}

export async function fileKb(path) {
  return Math.round(((await stat(path)).size / 1024) * 10) / 10
}

/** Round every coordinate in a geometry to `digits` decimals (in place) and drop consecutive duplicates. */
export function roundGeometry(geom, digits) {
  const f = 10 ** digits
  const r = (n) => Math.round(n * f) / f
  const ring = (coords) => {
    const out = []
    for (const c of coords) {
      const p = [r(c[0]), r(c[1])]
      const last = out[out.length - 1]
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
    }
    return out
  }
  switch (geom?.type) {
    case 'Point':
      geom.coordinates = [r(geom.coordinates[0]), r(geom.coordinates[1])]
      break
    case 'LineString':
    case 'MultiPoint':
      geom.coordinates = ring(geom.coordinates)
      break
    case 'Polygon':
    case 'MultiLineString':
      geom.coordinates = geom.coordinates.map(ring)
      break
    case 'MultiPolygon':
      geom.coordinates = geom.coordinates.map((p) => p.map(ring))
      break
    case 'GeometryCollection':
      geom.geometries.forEach((g) => roundGeometry(g, digits))
      break
  }
  return geom
}

/** Shoelace sum in the lng/lat plane (y up): > 0 → clockwise. */
function ringSum(ring) {
  let s = 0
  for (let i = 0; i < ring.length - 1; i++) s += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1])
  return s
}

/**
 * Rewinds Polygon/MultiPolygon rings (in place) to the d3-geo convention: exterior rings clockwise, holes
 * counter-clockwise. d3-geo (geoArea, geoContains, geoPath) needs this — with RFC 7946 winding it reads every
 * polygon as "the whole globe minus the polygon". MapLibre and turf are winding-agnostic, so this is the one
 * convention every consumer in the app can use as-is. Planar rule first, then a spherical check: any polygon
 * d3 still reads as > a hemisphere gets all its rings reversed.
 */
export function rewindD3(geom) {
  const poly = (rings) => {
    let out = rings.map((r, i) => {
      const cw = ringSum(r) > 0
      return (i === 0) === cw ? r : r.slice().reverse()
    })
    if (geoArea({ type: 'Polygon', coordinates: out }) > 2 * Math.PI) out = out.map((r) => r.slice().reverse())
    return out
  }
  if (geom?.type === 'Polygon') geom.coordinates = poly(geom.coordinates)
  else if (geom?.type === 'MultiPolygon') geom.coordinates = geom.coordinates.map(poly)
  else if (geom?.type === 'GeometryCollection') geom.geometries.forEach(rewindD3)
  return geom
}

/**
 * Rings with a segment jumping > 180° of longitude (i.e. drawn the long way round by planar renderers).
 * A segment along a pole (|lat| ≥ 89.9, e.g. Antarctica's closing edge) is legitimate and ignored.
 */
export function countWrappingRings(geom) {
  const polys = geom?.type === 'Polygon' ? [geom.coordinates] : geom?.type === 'MultiPolygon' ? geom.coordinates : []
  let n = 0
  for (const p of polys)
    for (const r of p)
      for (let i = 1; i < r.length; i++)
        if (Math.abs(r[i][0] - r[i - 1][0]) > 180 && !(Math.abs(r[i][1]) >= 89.9 && Math.abs(r[i - 1][1]) >= 89.9)) {
          n++
          break
        }
  return n
}

const clipProj = geoEquirectangular().scale(180 / Math.PI).translate([0, 0]).precision(0)

function pointInRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Cuts spherical (d3-wound, antimeridian-stitched) polygons — e.g. world-atlas' Russia, Fiji, Antarctica — into
 * planar lng/lat polygons that never cross ±180°, so MapLibre and turf render/measure them correctly.
 * Uses d3's own antimeridian clipping (identity equirectangular, no resampling), then regroups the emitted rings:
 * clockwise rings are exteriors, counter-clockwise rings are holes assigned to the smallest exterior containing them.
 */
export function cutAntimeridian(geom) {
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return geom
  const out = []
  let rings = null
  let ring = null
  const sink = {
    polygonStart() {
      rings = []
    },
    polygonEnd() {
      const ext = []
      const holes = []
      for (const r of rings) (ringSum(r) > 0 ? ext : holes).push(r)
      const polys = ext.map((r) => ({ rings: [r], area: Math.abs(ringSum(r)) }))
      polys.sort((a, b) => a.area - b.area)
      for (const h of holes) {
        const host = polys.find((p) => pointInRing(h[0], p.rings[0]))
        if (host) host.rings.push(h)
      }
      out.push(...polys.map((p) => p.rings))
      rings = null
    },
    lineStart() {
      ring = []
    },
    point(x, y) {
      ring.push([x, -y])
    },
    lineEnd() {
      if (rings && ring.length > 2) {
        const [a, b] = [ring[0], ring[ring.length - 1]]
        if (a[0] !== b[0] || a[1] !== b[1]) ring.push([a[0], a[1]])
        if (ring.length >= 4) rings.push(ring)
      }
      ring = null
    },
    sphere() {},
  }
  geoStream({ type: 'Feature', properties: {}, geometry: geom }, clipProj.stream(sink))
  if (!out.length) return null
  return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out }
}

/**
 * Polity palette + hash — byte-for-byte mirror of POLITY_PALETTE / polityColor() in src/lib/theme.ts (FNV-1a hash
 * into the palette). The palette is read from theme.ts so pre-baked colours follow design-token changes.
 * Returns { palette, hashIndex(name), color(name) }.
 */
export async function loadPolityPalette() {
  const file = join(ROOT, 'src/lib/theme.ts')
  let palette
  try {
    const src = await readFile(file, 'utf8')
    const m = src.match(/POLITY_PALETTE\s*=\s*\[([\s\S]*?)\]/)
    if (m) palette = [...m[1].matchAll(/'(#[0-9a-fA-F]{6})'/g)].map((x) => x[1])
  } catch {
    /* fall through */
  }
  if (!palette?.length) {
    palette = [
      '#c0563f', '#d08a3a', '#c9b14a', '#7fa34a', '#3f9a6e', '#3a9aa3', '#3f78b5', '#5b62c0',
      '#8a55b8', '#b0509a', '#b8566a', '#9a6b4a', '#6f8f9a', '#a38c6a', '#4f8a8a', '#8f7fb0',
    ]
  }
  const hashIndex = (name) => {
    let h = 2166136261
    for (let i = 0; i < name.length; i++) {
      h ^= name.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return Math.abs(h) % palette.length
  }
  return { palette, hashIndex, color: (name) => palette[hashIndex(name)] }
}

export function fmtKb(kb) {
  return `${kb.toFixed(1).padStart(7)} KB`
}
