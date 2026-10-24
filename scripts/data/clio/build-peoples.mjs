#!/usr/bin/env node
/**
 * Hybrid border data, PEOPLES track (docs/border-hybrid-plan.md §1.5, §1.6).  Output licence: GPL-3.0 (historical-basemaps).
 *
 *   node scripts/data/clio/build-peoples.mjs [--only=1492,1914] [--jobs=4] [--states=auto|frames|dev]
 *                                           [--partial] [--no-assemble] [--assemble-only]
 *
 * Phase 1 (one child process per HB snapshot): the snapshot's polities (borders.mjs loadHbSnapshot, unsimplified) are
 *   clipped against the state land of every frame inside the snapshot's interval [S, nextSnapshot-1]:
 *     - an HB polity name-matched to an active state is dropped for that frame (sim >= 0.8 with >= 30% overlap, or IoU >= 0.5;
 *       or, F1 ghost rule, the same polity by token containment / SAME_POLITY_ALIAS with >= 2% overlap and at most 6x the state's area),
 *     - the rest minus the state union: remaining share r >= 0.98 keep original, r < 0.25 drop, else keep the clipped
 *       geometry minus parts < 500 km2.
 *   A polity is only recomputed when its signature (the active state rows whose bbox touches it, with a geometry hash)
 *   changes. Consecutive identical results merge into one segment [a, b]. Result: .cache/hist/peoples-segs/<key>.json
 * Phase 2 (assemble): entity ids, chunking by the chunk list of public/data/hist/index.json (else the stub in
 *   src/data/generated/borderIndex.json), topology-preserving simplification, TopoJSON per chunk, entity/area/stats files.
 *
 * State input: .cache/hist/state-frames/<year>.json (builder A: FeatureCollection, unsimplified state union of the frame,
 *   one feature per entity, props e, rid). Until those exist, --states=dev (the auto fallback) derives frames straight from
 *   the untouched Cliopatria rows (no corrections, no coast growth). Peoples built in dev mode are for development only.
 *
 * Licence firewall: this script is GPL-side. It may read Cliopatria and HB; the CC BY state build must never import it.
 * Cliopatria is untrusted data: parsed with JSON.parse only, never executed.
 */
import mapshaper from 'mapshaper'
import polylabel from 'polylabel'
import { area as turfArea, intersect, featureCollection, feature } from '@turf/turf'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadHbSnapshot } from '../borders.mjs'
import { CACHE, PUBLIC_DATA, ROOT, loadSnapshotYears, pool } from '../lib.mjs'
import { DROP_HB } from './peoples-drop.mjs'

const SELF = fileURLToPath(import.meta.url)
const args = process.argv.slice(2)
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const flag = (name) => args.includes(`--${name}`)

const MIN_YEAR = -3000
const MAX_YEAR = 2025
const OUT_DIR = join(PUBLIC_DATA, 'hist')
const SEG_DIR = join(CACHE, 'hist', 'peoples-segs')
const FRAMES_DIR = join(CACHE, 'hist', 'state-frames')
/** The pinned Cliopatria polities file (scripts/data/clio/fetch.mjs keeps it in .cache/raw/clio/), or CLIO_GEOJSON. */
const CLIO_FILE = process.env.CLIO_GEOJSON ?? join(CACHE, 'raw', 'clio', 'cliopatria_polities_only_v021.geojson')

const KEEP_FULL = 0.98
const DROP_BELOW = 0.25
const MIN_PART_KM2 = 500
const NAME_SIM = 0.8
const NAME_OVERLAP = 0.3
const IOU = 0.5
/** F1 ghost rule (docs/border-hybrid-qa.md): an HB polity that names the same polity as a state active in the frame is
 *  dropped for that frame when its original shape overlaps that state by >= GHOST_OVERLAP of either area and is at most
 *  GHOST_MAX_RATIO times the state's area (a much larger HB shape is a wider notion of the polity: kept, clipped). */
const GHOST_OVERLAP = 0.02
const GHOST_NAME_SIM = 0.85 // stricter than NAME_SIM: Scythians vs Indo-Scythians scores 0.80
const GHOST_MAX_RATIO = Number(process.env.CLIO_GHOST_RATIO ?? 6)
/** Plan §3.4: peoples chunk <= 0.6 MB raw. Per-feature properties are about half of a chunk, so the simplification
 *  ladder is driven by gzip size (what travels); raw size over the plan limit is reported, not fixed by coarsening. */
const CHUNK_BUDGET_BYTES = 600 * 1024
const CHUNK_GZ_BUDGET = 190 * 1024
const LADDER = [1200, 1600, 2000, 2500, 3000, 3500, 4000]

const CULTURE_RE =
  /\b(peoples?|hunter|hunters|gatherers?|farmers|herders|nomads?|tribes?|tribal|cultures?|pastoralists|foragers|settlers|chiefdoms|clans|horticulturalists|fishers)\b/i

const hashOf = (s) => createHash('md5').update(s).digest('hex').slice(0, 12)
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d

/* ------------------------------------------------------------------ geometry helpers */

const polygonsOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [])
const asGeom = (polys) => (polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys })
const polyKm2 = (poly) => turfArea({ type: 'Polygon', coordinates: poly }) / 1e6
const geomKm2 = (g) => polygonsOf(g).reduce((a, p) => a + polyKm2(p), 0)

function bboxOf(g) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const poly of polygonsOf(g))
    for (const [x, y] of poly[0]) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  return [x0, y0, x1, y1]
}
const bbHit = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
/** Rough km2 of a lng/lat box (only used for cheap upper bounds). */
const bbKm2 = ([x0, y0, x1, y1]) => Math.max(0, x1 - x0) * Math.max(0, y1 - y0) * 111.32 * 111.2 * Math.cos((((y0 + y1) / 2) * Math.PI) / 180)
const bbInter = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]

const D2R = Math.PI / 180
const toMerc = ([x, y]) => [x, Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, y)) * D2R) / 2)) / D2R]
const fromMerc = ([x, y]) => [x, (2 * Math.atan(Math.exp(y * D2R)) - Math.PI / 2) / D2R]

/** Label point: Web-Mercator pole of inaccessibility of the largest part. */
function labelPoint(g) {
  let best = null
  let bestKm2 = -1
  for (const poly of polygonsOf(g)) {
    const k = polyKm2(poly)
    if (k > bestKm2) {
      bestKm2 = k
      best = poly
    }
  }
  const [x, y] = polylabel(best.map((r) => r.map(toMerc)), 0.05)
  const [lng, lat] = fromMerc([x, y])
  return [round(lng, 3), round(lat, 3)]
}

function roundGeom(g, digits) {
  const f = 10 ** digits
  const ring = (r) => {
    const out = []
    for (const [x, y] of r) {
      const p = [Math.round(x * f) / f, Math.round(y * f) / f]
      const l = out[out.length - 1]
      if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p)
    }
    return out
  }
  return asGeom(polygonsOf(g).map((poly) => poly.map(ring).filter((r) => r.length >= 4)))
}

async function runMapshaper(cmd, files) {
  const out = await mapshaper.applyCommands(cmd, files)
  return out['out.json'] ? JSON.parse(out['out.json'].toString()) : { features: [] }
}

/* ------------------------------------------------------------------ names */

const STOP = new Set([
  'the', 'of', 'and', 'kingdom', 'empire', 'republic', 'state', 'states', 'sultanate', 'caliphate', 'dynasty', 'khanate',
  'principality', 'duchy', 'county', 'city', 'confederation', 'confederacy', 'federation', 'emirate', 'realm', 'people', 'peoples',
])
const strip = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
/** Name variants of one label ("Abenaki / Abénaquis", "Rome (Latin)") → normalised strings without generic words. */
function nameVariants(name) {
  const parts = strip(name)
    .split(/[/(),;]|\bor\b/)
    .map((p) => p.trim())
    .filter(Boolean)
  const out = new Set()
  for (const p of [strip(name), ...parts]) {
    const toks = p.split(/[^a-z0-9]+/).filter(Boolean)
    const kept = toks.filter((t) => !STOP.has(t))
    const s = (kept.length ? kept : toks).join(' ')
    if (s) out.add(s)
  }
  return [...out]
}
function bigrams(s) {
  const m = new Map()
  const t = ` ${s} `
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2)
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return m
}
function dice(a, b) {
  if (a === b) return 1
  const A = bigrams(a)
  const B = bigrams(b)
  let inter = 0
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0)
  const total = (m) => [...m.values()].reduce((x, n) => x + n, 0)
  return (2 * inter) / (total(A) + total(B))
}
function nameSim(varsA, varsB) {
  let best = 0
  for (const a of varsA) for (const b of varsB) best = Math.max(best, dice(a, b))
  return best
}

/** Words that qualify a polity without naming it (periods, ordinals, size words; not compass words: North and South Yemen are two polities); ignored for the F1 test. */
const QUALIFIER = new Set([
  'upper', 'lower', 'new', 'old', 'great', 'greater',
  'little', 'first', 'second', 'third', 'early', 'late', 'middle', 'holy', 'grand', 'high', 'ancient', 'house', 'dynasty', 'dynastic',
  'period', 'intermediate', 'free', 'royal', 'imperial', 'later', 'classic', 'classical', 'regional', 'system',
])
const ORDINAL = /^(twenty|thirty|forty|fifty)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth)$/
const isQualifier = (t) => QUALIFIER.has(t) || ORDINAL.test(t) || /^\d+$/.test(t)
const coreTokens = (v) => v.split(/[^a-z0-9]+/).filter((t) => t && !isQualifier(t)).map((t) => (t.length > 6 && t.endsWith('land') ? t.slice(0, -4) : t))
/** F1: do two label sets name the same polity? Spelling similarity (as the 30%-overlap rule) or, after dropping
 *  qualifier words, equal core words (Ur / Third Dynasty of Ur, Egypt / Old Kingdom of Egypt, Zulu / Zululand). A label
 *  with an extra place word is another polity (Portuguese Guinea is not Portuguese Africa; Greek colonies are not Greece). */
function samePolity(varsA, varsB, plain = true) {
  if (nameSim(varsA, varsB) >= GHOST_NAME_SIM) return true
  if (!plain) return false // "Yemen (UK)", "Angola (Portugal)": the bracket names another polity
  for (const a of varsA) {
    const ta = coreTokens(a)
    if (!ta.length || ta.join('').length < 2) continue
    for (const b of varsB) {
      const tb = coreTokens(b)
      if (ta.length === tb.length && ta.every((t) => tb.includes(t))) return true
    }
  }
  return false
}
/** HB name → state entity ids for the same polity where the spelling differs too much for samePolity (curated; each
 *  checked against the two Wikipedia articles). Applied with the same overlap and ratio guards. */
const SAME_POLITY_ALIAS = {
  Makkura: ['s:makuria', 's:makuria-kingdom'],
  'Aztec Empire': ['s:aztec-triple-alliance'],
  'Nan-Zhao': ['s:nanzhao'],
  'Mauryan Empire': ['s:maurya-empire'],
  'Idrisid Caliphate': ['s:idrisids'],
  'Croatian kingdom': ['s:duchy-of-croatia', 's:kingdom-of-croatia'],
  'Gurjara Pratihara': ['s:gurjara-pratihara-dynasty'],
}

export function slug(name) {
  const s = strip(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || `u${hashOf(name).slice(0, 8)}`
}

/* ------------------------------------------------------------------ state sources */

const kmCache = new Map() // geometry hash → km2
const stateKm2 = (s) => {
  let k = kmCache.get(s.hash)
  if (k === undefined) kmCache.set(s.hash, (k = geomKm2(s.geom)))
  return k
}

/** State-frame files from builder A. */
async function openFramesSource(S, E) {
  const files = (await readdir(FRAMES_DIR)).filter((f) => /^-?\d+\.json$/.test(f))
  const all = files.map((f) => Number(f.replace('.json', ''))).sort((a, b) => a - b)
  const frames = all.filter((y) => y >= S && y <= E)
  if (!frames.includes(S)) throw new Error(`state-frames has no frame at HB snapshot year ${S} (plan §1.3 requires it)`)
  return {
    mode: 'frames',
    frames,
    async load(y) {
      const fc = JSON.parse(await readFile(join(FRAMES_DIR, `${y}.json`), 'utf8'))
      return fc.features
        .filter((f) => f.geometry)
        .map((f) => {
          const s = JSON.stringify(f.geometry)
          return { fid: `${f.properties.e}|${f.properties.rid}`, e: f.properties.e, rid: f.properties.rid, geom: f.geometry, bb: bboxOf(f.geometry), hash: hashOf(s), vars: nameVariants(String(f.properties.e).replace(/^s:/, '').replace(/-/g, ' ')) }
        })
    },
  }
}

/** Development fallback: raw Cliopatria polity rows, uncorrected. */
async function openDevSource(S, E) {
  if (!existsSync(CLIO_FILE)) throw new Error(`no state-frames in ${FRAMES_DIR} and no Cliopatria file at ${CLIO_FILE}`)
  const raw = JSON.parse(await readFile(CLIO_FILE, 'utf8'))
  const rows = []
  for (const f of raw.features) {
    const p = f.properties
    if (p.Type !== 'POLITY' || !f.geometry || p.Name.startsWith('(')) continue
    const a = p.FromYear
    const b = p.ToYear >= 2024 ? MAX_YEAR : p.ToYear
    if (a > E || b < S) continue
    const e = `s:${slug(p.Name)}`
    rows.push({ fid: `${e}|${e}@${a}`, e, rid: `${e}@${a}`, a, b, geom: f.geometry, bb: bboxOf(f.geometry), hash: `${e}@${a}`, vars: nameVariants(p.Name) })
  }
  const set = new Set([S])
  for (const r of rows) {
    if (r.a > S && r.a <= E) set.add(r.a)
    if (r.b + 1 > S && r.b + 1 <= E) set.add(r.b + 1)
  }
  const frames = [...set].sort((a, b) => a - b)
  return { mode: 'dev', frames, async load(y) { return rows.filter((r) => r.a <= y && y <= r.b) } }
}

async function openSource(S, E, mode) {
  const haveFrames = existsSync(FRAMES_DIR) && (await readdir(FRAMES_DIR)).some((f) => /^-?\d+\.json$/.test(f))
  if (mode === 'frames' || (mode === 'auto' && haveFrames)) return openFramesSource(S, E)
  return openDevSource(S, E)
}

/* ------------------------------------------------------------------ phase 1: one snapshot */

const interCache = new Map()
function interKm2(h, s) {
  const k = `${h.k}|${s.fid}#${s.hash}`
  let v = interCache.get(k)
  if (v === undefined) {
    try {
      const r = intersect(featureCollection([feature(h.geom), feature(s.geom)]))
      v = r ? geomKm2(r.geometry) : 0
    } catch {
      v = 0
    }
    interCache.set(k, v)
  }
  return v
}

/** Name-match / IoU against the touching states. Returns the matching state or null. */
function matchedState(h, touching) {
  for (const s of touching) {
    const sKm2 = stateKm2(s)
    const upper = bbKm2(bbInter(h.bb, s.bb))
    const nameOk = nameSim(h.vars, s.vars) >= NAME_SIM
    // upper bounds first: intersection <= box intersection, IoU <= min(areas)/max(areas)
    if (nameOk && upper / h.km2 >= NAME_OVERLAP * 0.8 && interKm2(h, s) / h.km2 >= NAME_OVERLAP) return s
    const ratio = Math.min(h.km2, sKm2) / Math.max(h.km2, sKm2)
    if (ratio >= IOU && Math.min(upper, h.km2, sKm2) / Math.max(h.km2, sKm2) >= IOU) {
      const inter = interKm2(h, s)
      if (inter / (h.km2 + sKm2 - inter) >= IOU) return s
    }
  }
  // F1 ghost pass: the same polity under a looser name test, any real overlap
  for (const s of touching) {
    const linked = SAME_POLITY_ALIAS[h.name]?.includes(s.e) || samePolity(h.name.includes('(') ? h.vars.slice(0, 1) : h.vars, s.vars, !h.name.includes('('))
    if (!linked) continue
    const sKm2 = stateKm2(s)
    if (h.km2 > GHOST_MAX_RATIO * sKm2) continue
    const upper = bbKm2(bbInter(h.bb, s.bb))
    if (Math.max(upper / h.km2, upper / sKm2) < GHOST_OVERLAP) continue
    const inter = interKm2(h, s)
    if (inter / h.km2 >= GHOST_OVERLAP || inter / sKm2 >= GHOST_OVERLAP) return { ...s, ghost: true }
  }
  return null
}

async function processSnapshot(key, S, E, mode) {
  const t0 = Date.now()
  const fc = await loadHbSnapshot(key)
  const byEnt = new Map()
  for (const f of fc.features) {
    const p = f.properties
    if (!p.NAME) continue
    const ek = `${p.NAME}\u0000${p.SUBJECTO}`
    const polys = polygonsOf(f.geometry)
    const cur = byEnt.get(ek)
    if (cur) cur.polys.push(...polys)
    else byEnt.set(ek, { name: p.NAME, subj: p.SUBJECTO, color: p.color, bp: p.BORDERPRECISION, alias: p.ALIAS ?? '', polys: [...polys] })
  }
  const hbs = [...byEnt.values()].map((h, i) => {
    const geom = asGeom(h.polys)
    return { ...h, k: i, geom, bb: bboxOf(geom), km2: geomKm2(geom), vars: nameVariants(h.name), cult: CULTURE_RE.test(h.name) }
  })
  const src = await openSource(S, E, mode)
  const frames = src.frames

  const sigs = new Map()
  const open = new Map() // k → {a, key, geom?, km2, overlapKm2, state?}
  const out = []
  const frameStats = []
  const dropped = new Map() // name → {states:Set, frames:number}
  const close = (k, cur, b) => {
    if (cur.key === 'none') return
    const h = hbs[k]
    out.push({ name: h.name, subj: h.subj, color: h.color, bp: h.bp, alias: h.alias, a: cur.a, b, km2: Math.round(cur.km2), clipped: cur.key !== 'orig', geometry: cur.key === 'orig' ? null : cur.geom })
  }

  for (let i = 0; i < frames.length; i++) {
    const y = frames[i]
    const states = await src.load(y)
    const need = []
    for (const h of hbs) {
      const touching = states.filter((s) => bbHit(s.bb, h.bb))
      const sig = touching.map((s) => `${s.fid}#${s.hash}`).join('|')
      if (sigs.get(h.k) === sig) continue
      sigs.set(h.k, sig)
      need.push({ h, touching })
    }
    const results = new Map()
    const erase = []
    for (const n of need) {
      const { h, touching } = n
      if (DROP_HB.some((d) => d.name === h.name && (d.from ?? MIN_YEAR) <= y && y <= (d.to ?? MAX_YEAR))) {
        results.set(h.k, { key: 'none', km2: 0, overlapKm2: 0 })
        continue
      }
      if (!touching.length) {
        results.set(h.k, { key: 'orig', km2: h.km2, overlapKm2: 0 })
        continue
      }
      const m = matchedState(h, touching)
      if (m) {
        results.set(h.k, { key: 'none', km2: 0, overlapKm2: 0 })
        const d = dropped.get(h.name) ?? { states: new Set(), frames: 0, ghost: 0 }
        d.states.add(m.e)
        d.frames++
        if (m.ghost) d.ghost++
        dropped.set(h.name, d)
        continue
      }
      erase.push(n)
    }
    if (erase.length) {
      const clip = new Map()
      for (const n of erase) for (const s of n.touching) clip.set(s.fid, s)
      const hbF = { type: 'FeatureCollection', features: erase.map(({ h }) => ({ type: 'Feature', properties: { k: h.k }, geometry: h.geom })) }
      const clipF = { type: 'FeatureCollection', features: [...clip.values()].map((s) => ({ type: 'Feature', properties: {}, geometry: s.geom })) }
      const files = { 'hb.json': JSON.stringify(hbF), 'clip.json': JSON.stringify(clipF) }
      let res
      try {
        res = await runMapshaper('-i hb.json -i clip.json -target hb -erase clip -o out.json format=geojson precision=0.0001', files)
      } catch {
        res = await runMapshaper('-i hb.json -i clip.json -target clip -clean -target hb -erase clip -o out.json format=geojson precision=0.0001', files)
      }
      const rem = new Map((res.features ?? []).filter((f) => f.geometry).map((f) => [f.properties.k, f.geometry]))
      for (const { h } of erase) {
        const g = rem.get(h.k)
        const remKm2 = g ? geomKm2(g) : 0
        const r = remKm2 / h.km2
        if (r >= KEEP_FULL) results.set(h.k, { key: 'orig', km2: h.km2, overlapKm2: (1 - r) * h.km2 })
        else if (r < DROP_BELOW) results.set(h.k, { key: 'none', km2: 0, overlapKm2: 0 })
        else {
          const parts = polygonsOf(g).filter((p) => polyKm2(p) >= MIN_PART_KM2)
          if (!parts.length) results.set(h.k, { key: 'none', km2: 0, overlapKm2: 0 })
          else {
            const geom = roundGeom(asGeom(parts), 4)
            results.set(h.k, { key: hashOf(JSON.stringify(geom.coordinates)), geom, km2: geomKm2(geom), overlapKm2: 0 })
          }
        }
      }
    }
    for (const [k, res] of [...results].sort((a, b) => a[0] - b[0])) {
      const cur = open.get(k)
      if (cur && cur.key === res.key) {
        cur.overlapKm2 = res.overlapKm2
        continue
      }
      if (cur) close(k, cur, y - 1)
      open.set(k, { a: y, ...res })
    }
    let km2 = 0
    let ov = 0
    for (const c of open.values()) {
      km2 += c.km2
      ov += c.overlapKm2
    }
    frameStats.push({ y, km2: Math.round(km2), overlapKm2: Math.round(ov), recomputed: need.length, clipPasses: erase.length ? 1 : 0 })
  }
  for (const [k, cur] of [...open].sort((a, b) => a[0] - b[0])) close(k, cur, E)

  // full-resolution geometry for untouched ('orig') segments, label points
  const segs = out.map((s) => {
    const h = byEnt.get(`${s.name}\u0000${s.subj}`)
    const geometry = s.geometry ?? roundGeom(asGeom(h.polys), 4)
    return { name: s.name, subj: s.subj, color: s.color, bp: s.bp, alias: s.alias, a: s.a, b: s.b, km2: s.km2, clipped: s.clipped, label: labelPoint(geometry), geometry }
  })
  segs.sort((x, y) => x.a - y.a || x.name.localeCompare(y.name) || x.subj.localeCompare(y.subj))
  await mkdir(SEG_DIR, { recursive: true })
  const payload = {
    key,
    snap: S,
    end: E,
    statesMode: src.mode,
    frames,
    frameStats,
    segments: segs,
    dropped: [...dropped].map(([name, d]) => ({ name, frames: d.frames, ghost: d.ghost, states: [...d.states].sort() })).sort((x, y) => x.name.localeCompare(y.name)),
    hbPolities: hbs.length,
  }
  await writeFile(join(SEG_DIR, `${key}.json`), JSON.stringify(payload))
  console.log(`[${key}] ${S}..${E} states=${src.mode} frames=${frames.length} hb=${hbs.length} segments=${segs.length} dropped(name/IoU)=${dropped.size} ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

/* ------------------------------------------------------------------ phase 2: assemble */

async function loadChunkList() {
  const idx = join(OUT_DIR, 'index.json')
  if (existsSync(idx)) {
    const j = JSON.parse(await readFile(idx, 'utf8'))
    if (Array.isArray(j.chunks) && j.chunks.length) return { chunks: j.chunks.map((c) => ({ id: c.id, from: c.from, to: c.to })), source: 'public/data/hist/index.json' }
  }
  const j = JSON.parse(await readFile(join(ROOT, 'src/data/generated/borderIndex.json'), 'utf8'))
  return { chunks: j.chunks.map((c) => ({ id: c.id, from: c.from, to: c.to })), source: 'src/data/generated/borderIndex.json (stub)' }
}

const EMPTY_TOPO = { type: 'Topology', objects: { peoples: { type: 'GeometryCollection', geometries: [] } }, arcs: [] }

async function simplifyChunk(features, tol) {
  const cmd = [
    '-i in.json -quiet',
    '-rename-layers peoples',
    ...(tol ? [`-simplify dp interval=${tol} keep-shapes`] : []),
    '-filter-slivers min-area=2km2',
    '-o out.topojson format=topojson quantization=100000',
  ].join(' ')
  const out = await mapshaper.applyCommands(cmd, { 'in.json': JSON.stringify({ type: 'FeatureCollection', features }) })
  // features whose geometry collapsed under simplification (tiny polities at coarse tolerance) are dropped
  const topo = JSON.parse(out['out.topojson'].toString())
  const obj = topo.objects.peoples
  obj.geometries = obj.geometries.filter((g) => g.type && g.arcs && g.arcs.length)
  return JSON.stringify(topo)
}

async function assemble(partial) {
  const t0 = Date.now()
  const { years, snapshotKey } = await loadSnapshotYears()
  const present = []
  for (const y of years) {
    const f = join(SEG_DIR, `${snapshotKey(y)}.json`)
    if (existsSync(f)) present.push(JSON.parse(await readFile(f, 'utf8')))
    else if (!partial) throw new Error(`missing ${f}; run phase 1 first (or pass --partial)`)
  }
  const modes = [...new Set(present.map((p) => p.statesMode))]

  // entity ids ---------------------------------------------------------------------------------------------------
  const subjByName = new Map() // name → Set(subj) within any single snapshot
  const nameBySlug = new Map()
  for (const p of present) {
    const perSnap = new Map()
    for (const s of p.segments) {
      const set = perSnap.get(s.name) ?? new Set()
      set.add(s.subj)
      perSnap.set(s.name, set)
      const sl = slug(s.name)
      const names = nameBySlug.get(sl) ?? new Set()
      names.add(s.name)
      nameBySlug.set(sl, names)
    }
    for (const [n, set] of perSnap) if (set.size > 1) subjByName.set(n, true)
  }
  const entityId = (name, subj) => {
    let base = slug(name)
    if (nameBySlug.get(base).size > 1) base += `-${hashOf(name).slice(0, 6)}`
    if (subjByName.has(name)) base += `~${slug(subj || name)}`
    return `p:${base}`
  }

  const segs = []
  const entities = new Map()
  for (const p of present)
    for (const s of p.segments) {
      const e = entityId(s.name, s.subj)
      const rid = `${e}@${p.snap}`
      segs.push({ ...s, e, rid, sid: `${e}@${s.a}`, snap: p.snap })
      const ent = entities.get(e) ?? { name: s.name, kind: 'people', from: s.a, to: s.b, color: s.color, snaps: new Set(), rows: new Map(), subj: s.subj }
      ent.from = Math.min(ent.from, s.a)
      ent.to = Math.max(ent.to, s.b)
      ent.snaps.add(p.snap)
      const row = ent.rows.get(rid) ?? [rid, s.a, s.b]
      row[1] = Math.min(row[1], s.a)
      row[2] = Math.max(row[2], s.b)
      ent.rows.set(rid, row)
      if (CULTURE_RE.test(s.name)) ent.cult = 1
      entities.set(e, ent)
    }
  const sidSeen = new Set()
  for (const s of segs) {
    if (sidSeen.has(s.sid)) throw new Error(`duplicate segment id ${s.sid}`)
    sidSeen.add(s.sid)
  }

  // chunks -------------------------------------------------------------------------------------------------------
  const { chunks, source } = await loadChunkList()
  const manifest = []
  await mkdir(join(OUT_DIR, 'peoples'), { recursive: true })
  let totalBytes = 0
  let totalGz = 0
  let anyOver = 0
  for (const c of chunks) {
    const inChunk = segs.filter((s) => s.a <= c.to && s.b >= c.from).sort((x, y) => x.a - y.a || x.e.localeCompare(y.e))
    let text = JSON.stringify(EMPTY_TOPO)
    let tolUsed = null
    let kept = 0
    if (inChunk.length) {
      const features = inChunk.map((s, i) => ({
        type: 'Feature',
        properties: {
          id: i + 1,
          sid: s.sid,
          e: s.e,
          r: s.rid,
          a: s.a,
          b: s.b,
          color: s.color,
          km2: s.km2,
          lx: s.label[0],
          ly: s.label[1],
          snap: s.snap,
          ...(CULTURE_RE.test(s.name) ? { cult: 1 } : {}),
          ...(s.subj && s.subj !== s.name ? { subj: s.subj } : {}),
          n: s.name,
        },
        geometry: s.geometry,
      }))
      for (const tol of LADDER) {
        text = await simplifyChunk(features, tol)
        tolUsed = tol
        if (gzipSync(text).length <= CHUNK_GZ_BUDGET) break
      }
      kept = JSON.parse(text).objects.peoples.geometries.length
    }
    const bytes = Buffer.byteLength(text)
    const gz = gzipSync(text).length
    await writeFile(join(OUT_DIR, 'peoples', `${c.id}.topo.json`), text)
    totalBytes += bytes
    totalGz += gz
    if (bytes > CHUNK_BUDGET_BYTES) anyOver++
    manifest.push({ id: c.id, file: `peoples/${c.id}.topo.json`, from: c.from, to: c.to, features: kept, bytes, gzBytes: gz, simplifyM: tolUsed })
  }

  // entities, areas ----------------------------------------------------------------------------------------------
  const sortedIds = [...entities.keys()].sort()
  const entOut = {}
  for (const id of sortedIds) {
    const e = entities.get(id)
    entOut[id] = {
      name: e.name,
      kind: 'people',
      from: e.from,
      to: e.to,
      color: e.color,
      ...(e.cult ? { cult: 1 } : {}),
      ...(e.subj && e.subj !== e.name ? { subj: e.subj } : {}),
      snaps: [...e.snaps].sort((a, b) => a - b),
      rows: [...e.rows.values()].sort((a, b) => a[1] - b[1]),
    }
  }
  const areas = {}
  for (const id of sortedIds) {
    const mine = segs.filter((s) => s.e === id)
    const years = [...new Set(mine.flatMap((s) => [s.a, s.b + 1]))].sort((a, b) => a - b)
    const series = []
    for (const y of years) {
      const km2 = mine.filter((s) => s.a <= y && y <= s.b).reduce((a, s) => a + s.km2, 0)
      if (!series.length || series[series.length - 1][1] !== km2) series.push([y, km2])
    }
    areas[id] = series
  }
  const wr = (name, data) => writeFile(join(OUT_DIR, name), JSON.stringify(data))
  await wr('peoples-entities.json', entOut)
  await wr('areas-peoples.json', areas)

  // stats --------------------------------------------------------------------------------------------------------
  const perSnapshot = present.map((p) => ({
    key: p.key,
    snap: p.snap,
    end: p.end,
    statesMode: p.statesMode,
    hbPolities: p.hbPolities,
    segments: p.segments.length,
    clippedSegments: p.segments.filter((s) => s.clipped).length,
    dropped: p.dropped,
    frames: p.frameStats,
  }))
  const worst = perSnapshot
    .flatMap((p) => p.frames.map((f) => ({ y: f.y, km2: f.km2, share: f.km2 ? f.overlapKm2 / f.km2 : 0 })))
    .reduce((m, f) => (f.share > m.share ? f : m), { y: null, share: 0 })
  const stats = {
    licence: 'GPL-3.0 (historical-basemaps); not derived from any state file other than as a clipping mask',
    statesMode: modes,
    chunkSource: source,
    totals: { entities: sortedIds.length, segments: segs.length, bytes: totalBytes, gzBytes: totalGz, chunksOverBudget: anyOver, budgetBytes: CHUNK_BUDGET_BYTES },
    maxPeopleStateOverlap: worst,
    chunks: manifest,
    snapshots: perSnapshot,
  }
  await wr('stats-peoples.json', stats)
  await mkdir(join(CACHE, 'hist'), { recursive: true })
  await writeFile(join(CACHE, 'hist', 'peoples-chunks.json'), JSON.stringify(manifest))
  console.log(
    `assembled ${segs.length} segments, ${sortedIds.length} entities, ${manifest.length} chunks, ${(totalBytes / 1048576).toFixed(2)} MB (${(totalGz / 1048576).toFixed(2)} MB gz), ` +
      `over-budget chunks ${anyOver}, states=${modes.join('+')}, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  )
}

/* ------------------------------------------------------------------ main */

async function main() {
  const { years, snapshotKey } = await loadSnapshotYears()
  const interval = (y) => {
    const i = years.indexOf(y)
    return [y, (years[i + 1] ?? MAX_YEAR + 1) - 1]
  }
  const mode = arg('states') ?? 'auto'
  const w = arg('worker')
  if (w) {
    const y = years.find((v) => snapshotKey(v) === w)
    const [S, E] = interval(y)
    await processSnapshot(w, S, E, mode)
    return
  }
  if (!flag('assemble-only')) {
    const only = arg('only')?.split(',')
    const todo = years.filter((y) => !only || only.includes(snapshotKey(y)))
    const jobs = Number(arg('jobs') ?? 4)
    // largest (modern, dense) snapshots first so the pool finishes evenly
    const order = [...todo].sort((a, b) => b - a)
    await pool(order, jobs, (y) =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--max-old-space-size=8192', SELF, `--worker=${snapshotKey(y)}`, `--states=${mode}`], { stdio: 'inherit' })
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${snapshotKey(y)} exited ${code}`))))
      }),
    )
  }
  if (!flag('no-assemble')) await assemble(flag('partial') || !!arg('only'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
