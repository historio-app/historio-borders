#!/usr/bin/env node
/**
 * historical-basemaps (GPL-3.0) loader for the people layer of the border data.
 *
 *   node scripts/data/borders.mjs [--force] [--only=bc323,1279]   # download the raw snapshots into .cache/raw/hb/
 *
 * `loadHbSnapshot(key)` (used by scripts/data/clio/build-peoples.mjs) returns a snapshot normalised
 * (NAME, SUBJECTO, PARTOF → trimmed strings, nulls → ""; BORDERPRECISION → 0–3), patched, override-applied
 * (scripts/data/overrides.mjs), dissolved by NAME+SUBJECTO+PARTOF and realm-coloured, at full upstream resolution.
 * Nothing is written to disk here. Source: https://github.com/aourednik/historical-basemaps (GPL-3.0).
 */
import mapshaper from 'mapshaper'
import { area as turfArea, bbox, bboxPolygon, cleanCoords, difference, feature, featureCollection, intersect } from '@turf/turf'
import { OVERRIDES } from './overrides.mjs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  HB_BASE,
  RAW,
  download,
  loadPolityPalette,
  loadSnapshotYears,
  pool,
  rewindD3,
} from './lib.mjs'

const args = process.argv.slice(2)
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const ONLY = arg('only')?.split(',')
/** --force re-downloads the raw snapshots instead of using .cache/raw/hb. */
const FORCE = args.includes('--force')
/** Unnamed (unclaimed) land parts smaller than this are dropped as slivers / specks. */
const MIN_UNNAMED_PART_KM2 = 60
const RAW_DIR = join(RAW, 'hb')
/** Neutral tone for unclaimed land (NAME ""). */
const UNCLAIMED_COLOR = '#4b5563'

/**
 * Known gaps in the upstream data: polygons that are clearly a named polity but carry NAME null.
 * Applied to the unnamed polygon part containing `point`, before cleaning (so -clean/-dissolve2 merge it properly).
 */
const PATCHES = [
  { keys: ['1994', '2000', '2010'], point: [8.2, 46.8], NAME: 'Switzerland', BORDERPRECISION: 3 },
  { keys: ['1994'], point: [120.9, 23.7], NAME: 'Taiwan', BORDERPRECISION: 3 },
]

function pointInRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function applyPatches(fc, key) {
  const patches = PATCHES.filter((p) => p.keys.includes(key))
  if (!patches.length) return []
  const applied = []
  const extra = []
  for (const f of fc.features) {
    if (f.properties.NAME) continue
    const polys = polygonsOf(f.geometry)
    const keep = []
    for (const poly of polys) {
      const patch = patches.find((p) => pointInRing(p.point, poly[0]))
      if (!patch) {
        keep.push(poly)
        continue
      }
      applied.push(patch.NAME)
      extra.push({
        type: 'Feature',
        properties: { NAME: patch.NAME, SUBJECTO: patch.NAME, PARTOF: patch.NAME, BORDERPRECISION: patch.BORDERPRECISION },
        geometry: { type: 'Polygon', coordinates: poly },
      })
    }
    if (keep.length !== polys.length) f.geometry = keep.length ? { type: 'MultiPolygon', coordinates: keep } : null
  }
  fc.features = fc.features.filter((f) => f.geometry).concat(extra)
  return applied
}

/* ---------- historical overrides (scripts/data/overrides.mjs) ---------- */

const rawCache = new Map()
async function rawSnapshot(key) {
  if (!rawCache.has(key)) rawCache.set(key, readFile(join(RAW_DIR, `world_${key}.geojson`), 'utf8').then(normalise))
  return rawCache.get(key)
}

const asMulti = (polys) => (polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys })
const ringCentroid = (ring) => {
  let x = 0
  let y = 0
  for (const [px, py] of ring) {
    x += px
    y += py
  }
  return [x / ring.length, y / ring.length]
}
const inBox = ([x, y], [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1

/** Clip geometry of a split rule: a bbox, a closed ring, or another snapshot's polity (raw upstream geometry). */
async function clipGeometry(clip) {
  if (Array.isArray(clip) && typeof clip[0] === 'number') return bboxPolygon(clip).geometry
  if (Array.isArray(clip)) return { type: 'Polygon', coordinates: [clip] }
  const fc = await rawSnapshot(clip.key)
  const polys = fc.features.filter((f) => f.properties.NAME === clip.NAME).flatMap((f) => polygonsOf(f.geometry))
  if (!polys.length) throw new Error(`override clip: "${clip.NAME}" not found in ${clip.key}`)
  return asMulti(polys)
}

function safeOp(op, a, b) {
  const run = (x, y) => op(featureCollection([feature(x), feature(y)]))
  let r
  try {
    r = run(a, b)
  } catch {
    // polyclip can choke on upstream self-intersections: retry once on de-duplicated rings
    r = run(cleanCoords(a), cleanCoords(b))
  }
  return r ? polygonsOf(r.geometry) : []
}

/**
 * Apply OVERRIDES[key] to a normalised raw snapshot (in place). Returns { log, aliases } where aliases maps a final
 * NAME → upstream NAMEs it replaces 1:1 (written to the feature's ALIAS).
 */
async function applyOverrides(fc, key) {
  const ops = OVERRIDES[key] ?? []
  const log = []
  const aliases = new Map()
  const props = (target, fallback) => {
    if (target && typeof target === 'object') return { SUBJECTO: target.NAME, PARTOF: target.NAME, ...target }
    const name = target ?? fallback
    const existing = fc.features.find((f) => f.properties.NAME === name)
    return existing
      ? { NAME: name, SUBJECTO: existing.properties.SUBJECTO, PARTOF: existing.properties.PARTOF }
      : { NAME: name, SUBJECTO: name, PARTOF: name }
  }
  const nameOf = (t) => (typeof t === 'string' ? t : t.NAME)
  const add = (polys, p, bp) => {
    if (polys.length) fc.features.push({ type: 'Feature', properties: { BORDERPRECISION: bp, ...p }, geometry: asMulti(polys) })
  }

  for (const o of ops) {
    const hits = fc.features.filter((f) => f.properties.NAME === (o.from ?? o.name))
    if (!hits.length) {
      if (o.optional) continue
      throw new Error(`override ${key}: "${o.from ?? o.name}" not found`)
    }
    if (o.op === 'set') {
      for (const f of hits) Object.assign(f.properties, o.props)
      log.push(`${o.name} ⟵ ${JSON.stringify(o.props)}`)
      continue
    }
    if (o.op === 'rename') {
      const toName = nameOf(o.to)
      const merge = typeof o.to === 'string' && fc.features.some((f) => f.properties.NAME === toName)
      const p = props(o.to)
      for (const f of hits) {
        const old = f.properties
        Object.assign(f.properties, {
          NAME: p.NAME,
          SUBJECTO: merge || typeof o.to === 'object' ? p.SUBJECTO : old.SUBJECTO === o.from ? p.NAME : old.SUBJECTO,
          PARTOF: merge || typeof o.to === 'object' ? p.PARTOF : old.PARTOF === o.from ? p.NAME : old.PARTOF,
        })
      }
      if (!merge) {
        const set = aliases.get(toName) ?? new Set()
        set.add(o.from)
        for (const a of aliases.get(o.from) ?? []) set.add(a)
        aliases.set(toName, set)
      }
      log.push(`${o.from} → ${toName}${merge ? ' (merged)' : ''}`)
      continue
    }
    // split
    const own = { NAME: o.from, SUBJECTO: hits[0].properties.SUBJECTO, PARTOF: hits[0].properties.PARTOF }
    const bp = hits[0].properties.BORDERPRECISION
    fc.features = fc.features.filter((f) => !hits.includes(f))
    let left = hits.flatMap((f) => polygonsOf(f.geometry))
    const pieces = [] // [{ target props, polys }]
    for (const rule of o.rules) {
      const p = rule.to === o.from ? own : props(rule.to)
      if (rule.parts) {
        const take = left.filter((poly) => inBox(ringCentroid(poly[0]), rule.parts))
        left = left.filter((poly) => !take.includes(poly))
        pieces.push({ p, polys: take })
        continue
      }
      const clip = await clipGeometry(rule.clip)
      if (!left.length) continue
      const g = asMulti(left)
      pieces.push({ p, polys: safeOp(intersect, g, clip) })
      left = safeOp(difference, g, clip)
    }
    const restP = o.rest == null ? own : props(o.rest)
    const rest = []
    for (const poly of left) {
      const km2 = polyKm2(poly)
      if (km2 >= o.minRestKm2 || !pieces.some((x) => x.polys.length)) {
        rest.push(poly)
        continue
      }
      // sliver between two upstream datasets: give it to the nearest piece (centroid → piece bbox distance)
      const c = ringCentroid(poly[0])
      let best = null
      let bestD = Infinity
      for (const piece of pieces) {
        if (!piece.polys.length) continue
        const [x0, y0, x1, y1] = bbox(asMulti(piece.polys))
        const d = Math.hypot(Math.max(x0 - c[0], 0, c[0] - x1), Math.max(y0 - c[1], 0, c[1] - y1))
        if (d < bestD) {
          bestD = d
          best = piece
        }
      }
      best.polys.push(poly)
    }
    // pieces with the same target collapse into one feature (dissolve merges them with an existing polity anyway)
    for (const piece of pieces) add(piece.polys, piece.p, bp)
    add(rest, restP, bp)
    const km2 = (polys) => Math.round(polys.reduce((a, poly) => a + polyKm2(poly), 0) / 1000)
    log.push(
      `${o.from} ⟶ ${pieces.map((x) => `${x.p.NAME} ${km2(x.polys)}k`).join(', ')}${rest.length ? `, ${restP.NAME} ${km2(rest)}k` : ''} km²`,
    )
  }
  return { log, aliases }
}

const str = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v == null ? '' : String(v).trim())

function normalise(raw) {
  const fc = JSON.parse(raw)
  for (const f of fc.features) {
    const p = f.properties ?? {}
    const bp = Number(p.BORDERPRECISION)
    f.properties = {
      NAME: str(p.NAME),
      SUBJECTO: str(p.SUBJECTO),
      PARTOF: str(p.PARTOF),
      BORDERPRECISION: Number.isFinite(bp) ? bp : 0,
    }
  }
  fc.features = fc.features.filter((f) => f.geometry && f.geometry.coordinates?.length)
  return fc
}

async function simplify(fc, { tol, prec }) {
  const cmd = [
    '-i in.json',
    '-quiet',
    '-clean',
    '-dissolve2 NAME,SUBJECTO,PARTOF copy-fields=BORDERPRECISION',
    ...(tol ? [`-simplify dp interval=${tol} keep-shapes`] : []),
    // Explicit threshold: the default scales with the tolerance and deletes whole archipelagos (Cyclades, Antilles).
    '-filter-slivers min-area=2km2',
    `-o out.json format=geojson precision=${prec}`,
  ].join(' ')
  const out = await mapshaper.applyCommands(cmd, { 'in.json': JSON.stringify(fc) })
  return JSON.parse(out['out.json'].toString())
}

/** Split any Polygon/MultiPolygon geometry into an array of polygon coordinate arrays. */
const polygonsOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [])
const polyKm2 = (coords) => turfArea({ type: 'Polygon', coordinates: coords }) / 1e6

/**
 * Realm colours. Every feature of a realm (SUBJECTO || NAME) shares one colour. Realms claim colours largest-first:
 * each takes its theme.ts hash colour unless it is perceptually too close (CIELAB ΔE < MIN_DELTA_E) to a colour an
 * already-coloured *neighbouring* realm holds; then it walks the palette with hue-distant offsets (falling back to
 * the most distinct option). Big empires therefore keep the same colour across snapshots (stable while scrubbing)
 * and neighbours never blend into each other (e.g. British vs French Africa in 1914).
 */
const MIN_DELTA_E = 28

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
const HUE_OFFSETS = [0, 7, 3, 11, 5, 13, 9, 2, 14, 6, 10, 4, 12, 1, 15, 8]
/** Upstream spells some sovereigns several ways; colour them as one realm (SUBJECTO values are left untouched). */
const REALM_ALIASES = {
  UK: 'United Kingdom of Great Britain and Ireland',
  'United Kingdom': 'United Kingdom of Great Britain and Ireland',
  'Great Britain': 'United Kingdom of Great Britain and Ireland',
  Neterlands: 'Netherlands',
  Danemark: 'Denmark',
  'Spanish Habsburg': 'Spain',
}

function assignColors(features, { palette, hashIndex }) {
  const realmOf = (f) => {
    const r = f.properties.SUBJECTO || f.properties.NAME
    return REALM_ALIASES[r] ?? r
  }
  // Adjacency via shared vertices (outputs are topological: neighbours share identical rounded vertices).
  const owners = new Map()
  for (const f of features) {
    if (!f.properties.NAME) continue
    const realm = realmOf(f)
    for (const poly of polygonsOf(f.geometry))
      for (const ring of poly)
        for (const [x, y] of ring) {
          const k = `${x},${y}`
          let set = owners.get(k)
          if (!set) owners.set(k, (set = new Set()))
          set.add(realm)
        }
  }
  const shared = new Map()
  for (const set of owners.values()) {
    if (set.size < 2) continue
    const list = [...set]
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const k = list[i] < list[j] ? `${list[i]}\u0000${list[j]}` : `${list[j]}\u0000${list[i]}`
        shared.set(k, (shared.get(k) ?? 0) + 1)
      }
  }
  const neighbours = new Map()
  for (const [k, n] of shared) {
    if (n < 2) continue // a single shared vertex is a corner touch, not a border
    const [a, b] = k.split('\u0000')
    if (!neighbours.has(a)) neighbours.set(a, new Set())
    if (!neighbours.has(b)) neighbours.set(b, new Set())
    neighbours.get(a).add(b)
    neighbours.get(b).add(a)
  }
  const realmArea = new Map()
  for (const f of features) {
    if (!f.properties.NAME) continue
    const km2 = polygonsOf(f.geometry).reduce((a, p) => a + polyKm2(p), 0)
    realmArea.set(realmOf(f), (realmArea.get(realmOf(f)) ?? 0) + km2)
  }
  const lab = palette.map(hexToLab)
  const dE = (i, j) => Math.hypot(lab[i][0] - lab[j][0], lab[i][1] - lab[j][1], lab[i][2] - lab[j][2])
  const chosen = new Map()
  const realms = [...realmArea.keys()].sort((a, b) => realmArea.get(b) - realmArea.get(a) || a.localeCompare(b))
  for (const realm of realms) {
    const taken = [...(neighbours.get(realm) ?? [])].map((n) => chosen.get(n)).filter((i) => i !== undefined)
    const base = hashIndex(realm)
    const candidates = HUE_OFFSETS.map((o) => (base + o) % palette.length)
    const distinctness = (i) => (taken.length ? Math.min(...taken.map((t) => dE(i, t))) : Infinity)
    const pick =
      candidates.find((i) => distinctness(i) >= MIN_DELTA_E) ??
      candidates.reduce((best, i) => (distinctness(i) > distinctness(best) ? i : best), base)
    chosen.set(realm, pick)
  }
  for (const f of features) f.properties.color = f.properties.NAME ? palette[chosen.get(realmOf(f))] : UNCLAIMED_COLOR
}

function finalise(fc, palette, aliases = new Map()) {
  const features = []
  for (const f of fc.features) {
    const p = f.properties
    let polys = polygonsOf(f.geometry)
    if (!p.NAME) polys = polys.filter((c) => polyKm2(c) >= MIN_UNNAMED_PART_KM2)
    if (!polys.length) continue
    const geometry = rewindD3(polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys })
    features.push({
      type: 'Feature',
      properties: {
        NAME: p.NAME ?? '',
        SUBJECTO: p.SUBJECTO ?? '',
        PARTOF: p.PARTOF ?? '',
        BORDERPRECISION: Number.isFinite(p.BORDERPRECISION) ? p.BORDERPRECISION : 0,
        // upstream names this polity replaces 1:1 (overrides.mjs), "|a|b|" so a filter can test `in "|a|"`
        ...(aliases.has(p.NAME) ? { ALIAS: `|${[...aliases.get(p.NAME)].join('|')}|` } : {}),
        color: UNCLAIMED_COLOR, // realm colours assigned below
      },
      geometry,
    })
  }
  assignColors(features, palette)
  // Unclaimed land first (drawn underneath), then polities in stable alphabetical order.
  features.sort((a, b) => (a.properties.NAME === '' ? -1 : b.properties.NAME === '' ? 1 : a.properties.NAME.localeCompare(b.properties.NAME)))
  features.forEach((f, i) => (f.id = i + 1))
  // `id` first for readability of the JSON.
  return { type: 'FeatureCollection', features: features.map(({ id, type, properties, geometry }) => ({ type, id, properties, geometry })) }
}

/**
 * The people build (scripts/data/clio/build-peoples.mjs) input: the normalised, override-applied, dissolved (one feature
 * per NAME+SUBJECTO+PARTOF) and realm-coloured snapshot, *before* simplification. Never written to disk here.
 * Returns the same FeatureCollection shape the served files have (numeric `id`, NAME/SUBJECTO/PARTOF/BORDERPRECISION/
 * ALIAS?/color), at full upstream resolution.
 */
export async function loadHbSnapshot(key) {
  const palette = await loadPolityPalette()
  const raw = await readFile(join(RAW_DIR, `world_${key}.geojson`), 'utf8')
  const input = normalise(raw)
  applyPatches(input, key)
  const { aliases } = await applyOverrides(input, key)
  return finalise(await simplify(input, { tol: 0, prec: 0.0001 }), palette, aliases)
}

async function main() {
  const { years, snapshotKey } = await loadSnapshotYears()
  const snaps = years.map((year) => ({ year, key: snapshotKey(year) }))
  console.log(`Downloading ${snaps.length} snapshots → .cache/raw/hb/`)
  let fresh = 0
  await pool(snaps, 6, async ({ key }) => {
    const dest = join(RAW_DIR, `world_${key}.geojson`)
    if (FORCE && (!ONLY || ONLY.includes(key))) await rm(dest, { force: true })
    const r = await download(`${HB_BASE}/world_${key}.geojson`, dest)
    if (!r.cached) fresh++
  })
  console.log(`  ${fresh} downloaded, ${snaps.length - fresh} cached`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
