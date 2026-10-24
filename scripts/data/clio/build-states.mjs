#!/usr/bin/env node
/**
 * Hybrid borders, STATES track (docs/border-hybrid-plan.md §1.3, §1.4, §1.6). Licence: output is CC BY 4.0 only.
 *
 *   node scripts/data/clio/build-states.mjs [--only=<chunk id>] [--workers=N] [--force] [--corrections=<module>]
 *
 *   fetch.mjs ─► .cache/hist/rows-raw.json
 *   apply-corrections.mjs (corrections.mjs + colonies.mjs when present) ─► .cache/hist/rows-corrected.json
 *   resolve (parallel, one process per shard; cached per frame by a content key):
 *       for every frame y: active rows, ranked (priority, newer FromYear, smaller area), overlap rule via
 *       mapshaper -clean overlap-rule=max-id, coast growth (15 km buffer ∩ uncovered land within 25 km of the sea),
 *       2 km² sliver filter, realm outlines (dissolve per realm with >= 2 member states)
 *       ─► .cache/hist/state-frames/<y>.json   (the interface the people build reads)
 *   collect: segments {row, a, b} by geometry hash, entities, realm colours, areas, relations, stats
 *   chunks:  per century (halves when > 1.8 MB): topology-preserving DP 1.2 km (ladder to 4 km), quantisation 1e5
 *       ─► public/data/hist/states/<chunk>.topo.json  + states-entities.json, relations.json, areas-states.json,
 *          stats-states.json   (index.mjs then writes index.json and src/data/generated/borderIndex.json)
 *
 * Determinism: rows, keys and ids are sorted; no timestamps in any output; two runs give byte-identical files.
 * FIREWALL: this file and everything it imports never read historical-basemaps data (checked by golden.mjs).
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cpus } from 'node:os'
import {
  BUILD_FILE,
  CHUNK_PLAN_FILE,
  CLIO_DIR,
  HIST_CACHE,
  HIST_OUT,
  MAX_YEAR,
  MIN_YEAR,
  PUBLIC_DATA,
  ROWS_CORRECTED_FILE,
  STATE_FRAMES_DIR,
  areaKm2,
  areaKm2Poly,
  assignRealmColours,
  asGeometry,
  bboxOf,
  canonGeom,
  centuryChunks,
  entityId,
  frameYears,
  geomHash,
  hbSnapshotYears,
  labelPoint,
  ms,
  polygonsOf,
  rankAsc,
  readJsonFile,
  readRawRows,
  realmId,
  realmNameOf,
  roundGeom,
  segmentId,
  sha256,
  slug,
  writeJsonFile,
} from './lib.mjs'
import { applyCorrections } from './apply-corrections.mjs'
import { writeIndex } from './index.mjs'

/** Bump when the resolve algorithm changes (invalidates the per-frame cache). */
const PIPELINE_VERSION = 'states-1'
const GROW_KM = Number(process.env.CLIO_GROW_KM ?? 15) // 0 = no coast growth (experiments only)
const STRIP_KM = Number(process.env.CLIO_STRIP_KM ?? 25)
const STRIP_DP_M = Number(process.env.CLIO_STRIP_DP ?? 0) // simplify the coast the growth follows (metres)
const GROW_WMAX_M = Number(process.env.CLIO_GROW_WMAX ?? 0) // keep growth pieces whose mean width (2A/P) is at most this; 0 = keep all
const GROW_FROM = Number(process.env.CLIO_GROW_FROM ?? 1900) // coast growth only for frames >= this year
const GROW_SPECK_KM2 = Number(process.env.CLIO_SPECK_KM2 ?? 80)
const GROW_MIN_KM2 = Number(process.env.CLIO_GROW_MIN_KM2 ?? 0) // drop growth specks below this area
const MIN_PART_KM2 = 2
const STATES_CHUNK_MAX_KB = 1800
const LADDER = process.env.CLIO_LADDER ? process.env.CLIO_LADDER.split(',').map(Number) : [1200, 1600, 2000, 2500, 3000, 3500, 4000]
const OVERLAP_REPORT_KM2 = 20000
const STRIP_FILE = join(HIST_CACHE, `coast-strip-${STRIP_KM}-${STRIP_DP_M}.json`)

const args = process.argv.slice(2)
const arg = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
const FORCE = args.includes('--force')
const ONLY = arg('only')
const WORKER = arg('worker') // "k/N"
const WORKERS = Number(arg('workers') ?? Math.max(1, Math.min(8, cpus().length - 2)))
const STATES_DIR = join(HIST_OUT, 'states')

/* ================================================================== tables */

async function loadTables() {
  const load = async (file) => (existsSync(file) ? import(pathToFileURL(file).href) : null)
  const flat = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v).flat() : [])
  const override = arg('corrections')
  const c = await load(override ? override : join(CLIO_DIR, 'corrections.mjs'))
  const k = await load(join(CLIO_DIR, 'colonies.mjs'))
  const corrections = flat(c?.CORRECTIONS ?? c?.corrections ?? c?.default)
  const colonies = flat(k?.COLONIES ?? k?.colonies ?? k?.default ?? c?.COLONIES)
  return { corrections, colonies }
}

/* ================================================================== corrected rows */

async function prepareRows() {
  const raw = await readRawRows()
  const tables = await loadTables()
  const { rows, report, warnings, aliases } = await applyCorrections(raw, { ...tables, log: (m) => console.log(m) })
  for (const w of warnings) console.warn(`  warning: ${w}`)
  const out = []
  for (const r of rows) {
    if (r.to < MIN_YEAR || r.from > MAX_YEAR) continue
    const realmName = realmNameOf(r.name, r.mo)
    const realm = realmId(realmName)
    const geom = roundGeom(r.geom)
    if (!geom) continue
    out.push({
      id: r.id,
      e: r.e,
      name: r.name,
      from: r.from,
      to: Math.min(MAX_YEAR, r.to),
      wp: r.wp,
      qid: r.qid,
      mo: r.mo,
      realm,
      realmName,
      priority: r.priority ?? 0,
      approx: !!r.approx,
      km2: Math.round(r.km2 ?? areaKm2(geom)),
      orig: r.orig,
      gh: geomHash(geom),
      geom,
    })
  }
  out.sort(rankAsc)
  const meta = { raw: raw.source, corrections: tables.corrections.length, colonies: tables.colonies.length, version: PIPELINE_VERSION }
  const inputsHash = sha256(JSON.stringify([PIPELINE_VERSION, GROW_KM, STRIP_KM, STRIP_DP_M, GROW_FROM, GROW_WMAX_M, GROW_SPECK_KM2, GROW_MIN_KM2, MIN_PART_KM2, raw.source.geojsonMd5, tables.corrections, tables.colonies]))
  await writeJsonFile(ROWS_CORRECTED_FILE, { meta, inputsHash, aliases, report, warnings, rows: out })
  return { rows: out, raw, aliases, report, warnings, meta, inputsHash }
}

/* ================================================================== coast strip (land within STRIP_KM of the sea) */

async function ensureStrip() {
  if (existsSync(STRIP_FILE)) return
  const land = await readFile(join(PUBLIC_DATA, 'modern/land.json'), 'utf8')
  // Antarctica is excluded (mapshaper cannot buffer lat-long shapes that reach a pole).
  const simp = STRIP_DP_M > 0 ? `-simplify dp interval=${STRIP_DP_M} keep-shapes` : ''
  // land (optionally simplified: the growth edge then follows a smooth coast) -> lines -> buffer -> clip back to land
  const landS = await ms(`-i land.json -clip bbox=-180,-60,180,84 ${simp} -o out.json format=geojson precision=0.0001`, { 'land.json': land })
  const lines = await ms(`-i land.json -lines -buffer ${STRIP_KM}km -o out.json format=geojson`, { 'land.json': JSON.stringify(landS) })
  const strip = await ms(
    `-i s.json name=s -dissolve2 -i land.json name=land -target s -clip land -o out.json format=geojson precision=0.0001`,
    { 's.json': JSON.stringify(lines), 'land.json': JSON.stringify(landS) },
  )
  await writeJsonFile(STRIP_FILE, strip)
}

/* ================================================================== frame resolve */

/** Drop polygon parts and holes under MIN_PART_KM2 (keeping the largest part so tiny states survive). */
function dropSlivers(geom) {
  const polys = polygonsOf(geom).map((p) => ({ p, km2: areaKm2Poly([p[0]]) }))
  if (!polys.length) return null
  const biggest = polys.reduce((a, b) => (b.km2 > a.km2 ? b : a))
  const kept = polys
    .filter((x) => x === biggest || x.km2 >= MIN_PART_KM2)
    .map((x) => [x.p[0], ...x.p.slice(1).filter((h) => areaKm2Poly([h]) >= MIN_PART_KM2)])
  return asGeometry(kept)
}

function pointInRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
/**
 * Coast growth also creates detached specks (islands next to the coast that Cliopatria does not hold). Each one costs
 * a ring in every segment version, so parts below GROW_SPECK_KM2 that contain no vertex of the row's own pre-growth
 * geometry are dropped.
 */
function dropGrowthSpecks(geom, cleanGeom) {
  if (!GROW_SPECK_KM2 || !geom) return geom
  const own = polygonsOf(cleanGeom).map((p) => p[0][0])
  const kept = polygonsOf(geom).filter((poly) => {
    if (areaKm2Poly([poly[0]]) >= GROW_SPECK_KM2) return true
    return own.some(([x, y]) => pointInRing(x, y, poly[0]))
  })
  return kept.length ? asGeometry(kept) : geom
}

async function resolveFrame(y, active, strip, landText) {
  const fc = {
    type: 'FeatureCollection',
    features: active.map((r, i) => ({ type: 'Feature', properties: { i, realm: r.realm }, geometry: r.geom })),
  }
  const files = { 'rows.json': JSON.stringify(fc), 'strip.json': strip }
  const cmd = [
    '-i rows.json name=rows',
    '-clean overlap-rule=max-id',
    '-o clean.json format=geojson precision=0.0001 target=rows',
    '-i strip.json name=strip',
    ...(GROW_KM > 0 && y >= GROW_FROM
      ? [
          '-target rows',
          `-buffer ${GROW_KM}km + name=grow`,
          '-target grow',
          '-erase rows',
          '-target grow',
          '-clip strip',
          ...(GROW_WMAX_M > 0 ? ['-explode', `-filter 'this.area * 2 / this.perimeter <= ${GROW_WMAX_M}'`] : []),
          ...(GROW_MIN_KM2 > 0 ? ['-explode', `-filter-slivers min-area=${GROW_MIN_KM2}km2 remove-empty`] : []),
          '-merge-layers target=rows,grow name=all',
          '-dissolve2 i copy-fields=realm',
          '-clean overlap-rule=max-id',
        ]
      : ['-rename-layers all target=rows']),
    '-o out.json format=geojson precision=0.0001 target=all',
  ].join(' ')
  const res = await ms(cmd, files, ['clean.json', 'out.json'])
  const clean = new Map(res['clean.json'].features.map((f) => [f.properties.i, f]))
  const rows = []
  const lost = []
  let sum = 0
  let growth = 0
  for (const f of res['out.json'].features) {
    const r = active[f.properties.i]
    const geom = f.geometry && dropSlivers(dropGrowthSpecks(roundGeom(f.geometry), clean.get(f.properties.i)?.geometry))
    if (!geom) continue
    rows.push({ r, f, geom })
  }
  rows.sort((a, b) => (a.r.id < b.r.id ? -1 : 1))
  const outFeatures = []
  for (const x of rows) {
    const km2 = areaKm2(x.geom)
    sum += km2
    const cl = clean.get(x.f.properties.i)
    const clKm2 = cl?.geometry ? areaKm2(cl.geometry) : 0
    growth += Math.max(0, km2 - clKm2)
    if (x.r.km2 - clKm2 > OVERLAP_REPORT_KM2) lost.push({ rid: x.r.id, km2: Math.round(x.r.km2 - clKm2), i: x.f.properties.i })
    outFeatures.push({ type: 'Feature', properties: { e: x.r.e, rid: x.r.id, realm: x.r.realm }, geometry: canonGeom(x.geom) })
  }
  const vanished = active.filter((r) => !outFeatures.some((f) => f.properties.rid === r.id)).map((r) => r.id)
  // winners of the big subtractions: higher-ranked rows whose bbox touches (cheap attribution for the review list)
  for (const l of lost) {
    const loser = active[l.i]
    const [w, s, e, n] = bboxOf(loser.geom)
    l.winners = []
    for (let j = l.i + 1; j < active.length; j++) {
      const [w2, s2, e2, n2] = bboxOf(active[j].geom)
      if (w2 <= e && w <= e2 && s2 <= n && s <= n2) l.winners.push(active[j].id)
    }
    l.winners = l.winners.slice(0, 6)
    delete l.i
  }
  // realm outlines: realms with >= 2 member states active in this frame
  const byRealm = new Map()
  for (const f of outFeatures) {
    const set = byRealm.get(f.properties.realm) ?? new Set()
    set.add(f.properties.e)
    byRealm.set(f.properties.realm, set)
  }
  const multi = new Set([...byRealm].filter(([, s]) => s.size >= 2).map(([k]) => k))
  let realms = []
  if (multi.size) {
    const sub = { type: 'FeatureCollection', features: outFeatures.filter((f) => multi.has(f.properties.realm)).map((f) => ({ type: 'Feature', properties: { realm: f.properties.realm }, geometry: f.geometry })) }
    const diss = await ms('-i in.json -dissolve2 realm -o out.json format=geojson precision=0.0001', { 'in.json': JSON.stringify(sub) })
    realms = diss.features
      .filter((f) => f.geometry)
      .map((f) => ({ type: 'Feature', properties: { realm: f.properties.realm, n: byRealm.get(f.properties.realm).size }, geometry: canonGeom(roundGeom(f.geometry)) }))
      .sort((a, b) => (a.properties.realm < b.properties.realm ? -1 : 1))
  }
  // union area (double-claim measure) + sea share on snapshot frames
  let unionKm2 = sum
  let seaKm2
  if (outFeatures.length) {
    const all = { type: 'FeatureCollection', features: outFeatures.map((f) => ({ type: 'Feature', properties: {}, geometry: f.geometry })) }
    const u = await ms('-i in.json -dissolve2 -o out.json format=geojson precision=0.0001', { 'in.json': JSON.stringify(all) })
    unionKm2 = u.features.reduce((s, f) => s + (f.geometry ? areaKm2(f.geometry) : 0), 0)
    if (landText) {
      const sea = await ms('-i in.json -erase land.json -o out.json format=geojson precision=0.001', { 'in.json': JSON.stringify(u), 'land.json': landText })
      seaKm2 = sea.features.reduce((s, f) => s + (f.geometry ? areaKm2(f.geometry) : 0), 0)
    }
  }
  return {
    features: outFeatures,
    realms,
    stats: {
      active: active.length,
      rows: outFeatures.length,
      sumKm2: Math.round(sum),
      unionKm2: Math.round(unionKm2),
      doubleKm2: Math.max(0, Math.round(sum - unionKm2)),
      growthKm2: Math.round(growth),
      ...(seaKm2 !== undefined ? { seaKm2: Math.round(seaKm2) } : {}),
      lost,
      vanished,
    },
  }
}

const frameKey = (inputsHash, active) => sha256(inputsHash + active.map((r) => `${r.id}:${r.gh}:${r.priority}:${r.realm}`).join('|')).slice(0, 20)

async function workerMain(spec) {
  const [k, n] = spec.split('/').map(Number)
  const { rows, inputsHash } = await readJsonFile(ROWS_CORRECTED_FILE)
  const { frames, snaps } = await readJsonFile(join(HIST_CACHE, 'frames.json'))
  const strip = await readFile(STRIP_FILE, 'utf8')
  const land = await readFile(join(PUBLIC_DATA, 'modern/land.json'), 'utf8')
  const snapSet = new Set(snaps)
  await mkdir(STATE_FRAMES_DIR, { recursive: true })
  let done = 0
  for (let fi = k; fi < frames.length; fi += n) {
    const y = frames[fi]
    const active = rows.filter((r) => r.from <= y && y <= r.to) // already ranked ascending
    const key = frameKey(inputsHash, active)
    const file = join(STATE_FRAMES_DIR, `${y}.json`)
    if (!FORCE && existsSync(file)) {
      try {
        if ((await readJsonFile(file)).key === key) continue
      } catch {
        /* recompute */
      }
    }
    const res = await resolveFrame(y, active, strip, snapSet.has(y) ? land : null)
    await writeJsonFile(file, { type: 'FeatureCollection', frame: y, key, features: res.features, realms: res.realms, stats: res.stats })
    done++
  }
  console.log(`  worker ${k}/${n}: ${done} frames resolved`)
}

async function runWorkers(frames, snaps) {
  await writeJsonFile(join(HIST_CACHE, 'frames.json'), { frames, snaps })
  const n = Math.max(1, Math.min(WORKERS, frames.length))
  await Promise.all(
    Array.from({ length: n }, (_, k) =>
      new Promise((res, rej) => {
        const p = spawn(process.execPath, ['--max-old-space-size=6144', new URL(import.meta.url).pathname, `--worker=${k}/${n}`, ...(FORCE ? ['--force'] : [])], { stdio: ['ignore', 'inherit', 'inherit'] })
        p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`worker ${k} exited ${c}`))))
      }),
    ),
  )
}

/* ================================================================== collect */

const vkey = (x, y) => Math.round((x + 180) * 1e4) * 2e6 + Math.round((y + 90) * 1e4)
function vertexKeys(geom) {
  const s = new Set()
  for (const poly of polygonsOf(geom)) for (const ring of poly) for (const [x, y] of ring) s.add(vkey(x, y))
  return s
}

async function collect(prep, frames) {
  const meta = new Map(prep.rows.map((r) => [r.id, r]))
  const open = new Map() // rid -> segment
  const segs = []
  const realmOpen = new Map()
  const realmSegs = []
  const realmPeak = new Map()
  const pairCount = new Map()
  const frameStats = []
  const lostAgg = new Map()
  const areaByEntity = new Map()
  const t0 = Date.now()
  for (const [fi, y] of frames.entries()) {
    const fr = await readJsonFile(join(STATE_FRAMES_DIR, `${y}.json`))
    const cur = new Map()
    for (const f of fr.features) cur.set(f.properties.rid, f)
    // close changed / ended segments
    for (const [rid, seg] of open) {
      const f = cur.get(rid)
      if (!f || geomHash(f.geometry) !== seg.hash) {
        seg.b = y - 1
        seg.keys = undefined
        open.delete(rid)
      }
    }
    for (const [rid, f] of cur) {
      if (open.has(rid)) continue
      const row = meta.get(rid)
      const geom = canonGeom(f.geometry)
      const lp = labelPoint(geom)
      const seg = { rid, e: row.e, realm: row.realm, a: y, b: MAX_YEAR, hash: geomHash(geom), geom, approx: row.approx, km2: lp.km2, lx: lp.lx, ly: lp.ly }
      seg.keys = vertexKeys(geom)
      open.set(rid, seg)
      segs.push(seg)
    }
    // realm outlines
    const curR = new Map(fr.realms.map((f) => [f.properties.realm, f]))
    for (const [realm, seg] of realmOpen) {
      const f = curR.get(realm)
      if (!f || geomHash(f.geometry) !== seg.hash) {
        seg.b = y - 1
        realmOpen.delete(realm)
      }
    }
    for (const [realm, f] of curR) {
      if (realmOpen.has(realm)) continue
      const geom = canonGeom(f.geometry)
      const lp = labelPoint(geom)
      const seg = { realm, a: y, b: MAX_YEAR, hash: geomHash(geom), geom, n: f.properties.n, km2: lp.km2, lx: lp.lx, ly: lp.ly }
      realmOpen.set(realm, seg)
      realmSegs.push(seg)
    }
    // per-frame bookkeeping: realm area, neighbours, entity areas
    const realmKm2 = new Map()
    const owners = new Map()
    for (const seg of open.values()) {
      realmKm2.set(seg.realm, (realmKm2.get(seg.realm) ?? 0) + seg.km2)
      for (const k of seg.keys) {
        const o = owners.get(k)
        if (o === undefined) owners.set(k, seg.realm)
        else if (o !== seg.realm && o !== null) {
          const a = o < seg.realm ? o : seg.realm
          const b = o < seg.realm ? seg.realm : o
          pairCount.set(`${a}\u0000${b}`, (pairCount.get(`${a}\u0000${b}`) ?? 0) + 1)
        }
      }
      const list = areaByEntity.get(seg.e) ?? []
      const last = list[list.length - 1]
      if (last && last[0] === y) last[1] += seg.km2
      else list.push([y, seg.km2])
      areaByEntity.set(seg.e, list)
    }
    for (const [realm, km2] of realmKm2) realmPeak.set(realm, Math.max(realmPeak.get(realm) ?? 0, km2))
    frameStats.push({ y, ...fr.stats, lost: undefined, vanished: undefined })
    for (const l of fr.stats.lost) {
      const k = l.rid
      const a = lostAgg.get(k) ?? { rid: k, maxKm2: 0, from: y, to: y, winners: l.winners }
      a.maxKm2 = Math.max(a.maxKm2, l.km2)
      a.to = frames[fi + 1] !== undefined ? frames[fi + 1] - 1 : MAX_YEAR
      lostAgg.set(k, a)
    }
    for (const rid of fr.stats.vanished) lostAgg.set(`vanished:${rid}`, { rid, vanished: true, from: y, to: y })
    if ((fi + 1) % 100 === 0) console.log(`  collected ${fi + 1}/${frames.length} frames (${segs.length} segments, ${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  }
  for (const seg of open.values()) seg.b = MAX_YEAR
  for (const seg of realmOpen.values()) seg.b = MAX_YEAR

  const neighbours = new Map()
  for (const [k, n] of pairCount) {
    if (n < 2) continue
    const [a, b] = k.split('\u0000')
    if (!neighbours.has(a)) neighbours.set(a, new Set())
    if (!neighbours.has(b)) neighbours.set(b, new Set())
    neighbours.get(a).add(b)
    neighbours.get(b).add(a)
  }
  const colours = await assignRealmColours(realmPeak, neighbours)
  for (const s of segs) {
    s.color = colours.get(s.realm)
    s.keys = undefined
  }
  for (const s of realmSegs) s.color = colours.get(s.realm)

  // deterministic segment ids
  segs.sort((x, y) => (x.rid < y.rid ? -1 : x.rid > y.rid ? 1 : x.a - y.a))
  for (const s of segs) s.sid = segmentId(s.rid, s.a)
  realmSegs.sort((x, y) => (x.realm < y.realm ? -1 : x.realm > y.realm ? 1 : x.a - y.a))
  for (const s of realmSegs) s.sid = `${s.realm}#${s.a}`
  return { segs, realmSegs, colours, frameStats, lostAgg, areaByEntity, realmPeak }
}

/* ================================================================== entities, relations */

function buildEntities(prep, col) {
  const { rows, raw } = prep
  const byEntity = new Map()
  for (const r of rows) {
    const list = byEntity.get(r.e) ?? []
    list.push(r)
    byEntity.set(r.e, list)
  }
  const mostCommon = (arr) => {
    const m = new Map()
    for (const v of arr) if (v) m.set(v, (m.get(v) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? ''
  }
  // segments per row give the spans that were really drawn
  const segsByRow = new Map()
  for (const s of col.segs) {
    const l = segsByRow.get(s.rid) ?? []
    l.push(s)
    segsByRow.set(s.rid, l)
  }
  const entities = {}
  for (const e of [...byEntity.keys()].sort()) {
    const list = byEntity.get(e).filter((r) => segsByRow.has(r.id))
    if (!list.length) continue
    const spanOf = (r) => r.to - r.from + 1
    const longest = list.reduce((a, b) => (spanOf(b) > spanOf(a) ? b : a))
    const realm = longest.realm
    entities[e] = {
      name: longest.name,
      kind: 'state',
      wp: mostCommon(list.map((r) => r.wp)),
      qid: mostCommon(list.map((r) => r.qid)),
      from: Math.min(...list.map((r) => Math.max(MIN_YEAR, r.from))),
      to: Math.max(...list.map((r) => r.to)),
      realm,
      color: col.colours.get(realm),
      ...(list.some((r) => r.approx) ? { approx: true } : {}),
      rows: list.map((r) => [r.id, Math.max(MIN_YEAR, r.from), r.to]),
    }
  }
  // realms (names from the composite "(Realm)" rows when present)
  const compInfo = new Map()
  for (const c of raw.composites) {
    const n = c.n.replace(/^\((.*)\)$/, '$1')
    const cur = compInfo.get(n) ?? { wp: [], qid: [] }
    cur.wp.push(c.wp)
    cur.qid.push(c.qid)
    compInfo.set(n, cur)
  }
  const realmMembers = new Map()
  for (const [id, ent] of Object.entries(entities)) {
    const l = realmMembers.get(ent.realm) ?? []
    l.push(id)
    realmMembers.set(ent.realm, l)
  }
  const realmNames = new Map(rows.map((r) => [r.realm, r.realmName]))
  const realms = {}
  for (const realm of [...realmMembers.keys()].sort()) {
    if (realmMembers.get(realm).length < 2) continue // a realm of one state is that state
    const name = realmNames.get(realm)
    const info = compInfo.get(name)
    realms[realm] = {
      name,
      kind: 'realm',
      wp: info ? mostCommon(info.wp) : '',
      qid: info ? mostCommon(info.qid) : '',
      color: col.colours.get(realm),
      members: realmMembers.get(realm),
    }
  }
  return { entities, realms }
}

function buildRelations(raw, rows) {
  // entity id of an ORIGINAL Cliopatria name (renames keep working): the entity of the row of that name closest in time
  const byOrig = new Map()
  for (const r of rows) {
    const l = byOrig.get(r.orig.n) ?? []
    l.push(r)
    byOrig.set(r.orig.n, l)
  }
  const idFor = (name, a, b) => {
    const cand = byOrig.get(name) ?? []
    const hit = cand.find((r) => r.from <= b && r.to >= a) ?? cand[0]
    return hit ? hit.e : entityId(name)
  }
  const out = []
  for (const r of raw.relations) {
    const m1 = r.n.match(/^\(Allegiance of (.+) to (.+)\)$/)
    const m2 = r.n.match(/^\(Alliance between (.+) and (.+)\)$/)
    const type = m1 ? 'allegiance' : m2 ? 'alliance' : 'relation'
    const names = m1 ? [m1[1], m1[2]] : m2 ? [m2[1], m2[2]] : r.comp.split(';').map((s) => s.trim()).filter(Boolean)
    out.push({ type, members: names.map((n) => idFor(n, r.f, r.t)), a: Math.max(MIN_YEAR, r.f), b: r.t, name: r.n.replace(/^\((.*)\)$/, '$1') })
  }
  // merge consecutive rows of the same relation
  out.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : x.a - y.a))
  const merged = []
  for (const r of out) {
    const last = merged[merged.length - 1]
    if (last && last.name === r.name && r.a <= last.b + 1) last.b = Math.max(last.b, r.b)
    else merged.push({ ...r })
  }
  return merged
}

/* ================================================================== chunks */

function statesFeature(s, id) {
  const p = { id, sid: s.sid, e: s.e, r: s.rid, a: s.a, b: s.b, realm: s.realm, color: s.color, km2: s.km2, lx: s.lx, ly: s.ly }
  if (s.approx) p.approx = true
  return { type: 'Feature', properties: p, geometry: s.geom }
}
function realmFeature(s, id) {
  return { type: 'Feature', properties: { id, sid: s.sid, realm: s.realm, a: s.a, b: s.b, color: s.color, km2: s.km2, lx: s.lx, ly: s.ly, n: s.n }, geometry: s.geom }
}

async function buildChunk(spec, segs, realmSegs, tol) {
  const inChunk = (s) => s.b >= spec.from && s.a <= spec.to
  const st = segs.filter(inChunk).sort((x, y) => x.a - y.a || (x.e < y.e ? -1 : x.e > y.e ? 1 : 0) || (x.rid < y.rid ? -1 : 1))
  const rl = realmSegs.filter(inChunk).sort((x, y) => x.a - y.a || (x.realm < y.realm ? -1 : 1))
  const fcS = { type: 'FeatureCollection', features: st.map((s, i) => statesFeature(s, i + 1)) }
  const fcR = { type: 'FeatureCollection', features: rl.map((s, i) => realmFeature(s, i + 1)) }
  const files = { 'states.json': JSON.stringify(fcS), 'realms.json': JSON.stringify(fcR) }
  const cmd = `-i combine-files states.json realms.json -simplify dp interval=${tol} keep-shapes -o out.topo.json format=topojson quantization=100000`
  const res = await (await import('mapshaper')).default.applyCommands(cmd, files)
  const text = res['out.topo.json'].toString()
  const topo = JSON.parse(text)
  // stable key order for deterministic bytes
  const bytes = Buffer.from(JSON.stringify(topo))
  return { bytes, nStates: st.length, nRealms: rl.length, tol }
}

async function writeChunks(segs, realmSegs) {
  await mkdir(STATES_DIR, { recursive: true })
  let plan = centuryChunks()
  const forced = arg('chunks') // dev: explicit ranges, e.g. --chunks=1000_2025
  if (forced) plan = forced.split(',').map((id) => { const [from, to] = id.split('_').map(Number); return { id, from, to } })
  if (ONLY && !forced) {
    const prev = existsSync(CHUNK_PLAN_FILE) ? await readJsonFile(CHUNK_PLAN_FILE) : plan
    plan = prev
  }
  const results = []
  const final = []
  const queue = [...plan]
  const sizeLimit = STATES_CHUNK_MAX_KB * 1024
  while (queue.length) {
    const spec = queue.shift()
    if (ONLY && spec.id !== ONLY) {
      final.push(spec)
      continue
    }
    let res = await buildChunk(spec, segs, realmSegs, LADDER[0])
    const span = spec.to - spec.from
    if (res.bytes.length > sizeLimit && span >= 20 && !forced) {
      const mid = spec.from + Math.floor((span + 1) / 2) - 1
      queue.unshift({ id: `${mid + 1}_${spec.to}`, from: mid + 1, to: spec.to }, { id: `${spec.from}_${mid}`, from: spec.from, to: mid })
      console.log(`  ${spec.id}: ${(res.bytes.length / 1024).toFixed(0)} KB > ${STATES_CHUNK_MAX_KB} KB, splitting`)
      continue
    }
    for (const tol of LADDER.slice(1)) {
      if (res.bytes.length <= sizeLimit) break
      res = await buildChunk(spec, segs, realmSegs, tol)
    }
    await writeFile(join(STATES_DIR, `${spec.id}.topo.json`), res.bytes)
    const gz = gzipSync(res.bytes, { level: 9 }).length
    results.push({ ...spec, states: `states/${spec.id}.topo.json`, kb: Math.round(res.bytes.length / 102.4) / 10, gzKb: Math.round(gz / 102.4) / 10, simplifyM: res.tol, segments: res.nStates, realmSegments: res.nRealms })
    final.push(spec)
    console.log(`  ${spec.id}  ${(res.bytes.length / 1024).toFixed(0).padStart(5)} KB  gz ${(gz / 1024).toFixed(0).padStart(4)} KB  ${res.nStates} segments + ${res.nRealms} realm outlines  dp ${res.tol} m`)
  }
  final.sort((a, b) => a.from - b.from)
  if (!ONLY) {
    // remove stale chunk files of an earlier plan
    for (const f of await readdir(STATES_DIR)) if (!final.some((c) => `${c.id}.topo.json` === f)) await rm(join(STATES_DIR, f))
  }
  await writeJsonFile(CHUNK_PLAN_FILE, final.map(({ id, from, to }) => ({ id, from, to })), true)
  return results
}

/* ================================================================== main */

async function main() {
  if (WORKER) return workerMain(WORKER)
  if (!process.execArgv.some((a) => a.startsWith('--max-old-space-size'))) {
    const r = spawnSync(process.execPath, ['--max-old-space-size=12288', ...process.execArgv, new URL(import.meta.url).pathname, ...args], { stdio: 'inherit' })
    process.exit(r.status ?? 1)
  }
  const t0 = Date.now()
  const prep = await prepareRows()
  console.log(`rows: ${prep.rows.length} (corrections ${prep.meta.corrections}, colonies ${prep.meta.colonies})`)
  const hb = await hbSnapshotYears()
  let frames = frameYears(prep.rows, hb)
  const range = arg('range')?.split(',').map(Number)
  if (range) frames = frames.filter((y) => y >= range[0] && y <= range[1])
  console.log(`frames: ${frames.length} (${frames[0]}..${frames[frames.length - 1]})`)
  await ensureStrip()
  await runWorkers(frames, hb)
  console.log(`resolved in ${((Date.now() - t0) / 1000).toFixed(0)} s`)

  const col = await collect(prep, frames)
  console.log(`segments: ${col.segs.length} states, ${col.realmSegs.length} realm outlines`)
  const { entities, realms } = buildEntities(prep, col)
  const relations = buildRelations(prep.raw, prep.rows)

  const chunkResults = await writeChunks(col.segs, col.realmSegs)

  await mkdir(HIST_OUT, { recursive: true })
  const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))
  const entFile = { source: { cliopatria: prep.raw.source.version, doi: prep.raw.source.doi, license: 'CC BY 4.0' }, aliases: sortObj(prep.aliases), entities, realms }
  await writeJsonFile(join(HIST_OUT, 'states-entities.json'), entFile)
  await writeJsonFile(join(HIST_OUT, 'relations.json'), relations)
  await writeJsonFile(
    join(HIST_OUT, 'areas-states.json'),
    sortObj(Object.fromEntries([...col.areaByEntity].filter(([e]) => entities[e]))),
  )
  const doubleMax = Math.max(0, ...col.frameStats.map((f) => f.doubleKm2))
  await writeJsonFile(
    join(HIST_OUT, 'stats-states.json'),
    {
      frames: col.frameStats,
      overlaps: [...col.lostAgg.values()].filter((x) => !x.vanished).sort((a, b) => b.maxKm2 - a.maxKm2 || (a.rid < b.rid ? -1 : 1)),
      vanished: [...col.lostAgg.values()].filter((x) => x.vanished).sort((a, b) => a.from - b.from || (a.rid < b.rid ? -1 : 1)),
      corrections: prep.report,
      warnings: prep.warnings,
      maxDoubleKm2: doubleMax,
    },
    true,
  )
  let chunks = chunkResults
  if (ONLY && existsSync(BUILD_FILE)) {
    const prev = await readJsonFile(BUILD_FILE)
    chunks = [...prev.chunks.filter((c) => c.id !== ONLY && !chunkResults.some((r) => r.id === c.id)), ...chunkResults].sort((a, b) => a.from - b.from)
  }
  const buildHash = sha256(Buffer.concat(await Promise.all(chunks.map((c) => readFile(join(HIST_OUT, c.states)))))).slice(0, 16)
  await writeJsonFile(BUILD_FILE, { frames, chunks, buildHash, inputsHash: prep.inputsHash, segments: col.segs.length, realmSegments: col.realmSegs.length, params: { growKm: GROW_KM, growFromYear: GROW_FROM, stripKm: STRIP_KM, specksKm2: GROW_SPECK_KM2, simplifyM: LADDER[0], quantization: 100000 } }, true)
  await writeIndex()
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s; max double-claim ${doubleMax} km2`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
