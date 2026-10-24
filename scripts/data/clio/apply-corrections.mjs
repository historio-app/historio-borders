/**
 * Applies the corrections table (corrections.mjs, colonies.mjs; builder B) to the ingested Cliopatria rows
 * (docs/border-hybrid-plan.md §1.2). Pure data in, rows out; no HB geometry anywhere (licence firewall).
 *
 * TABLE CONTRACT (what build-states.mjs expects from the tables)
 *   corrections.mjs   export const CORRECTIONS = [ { op, why, source, ...fields }, ... ]     (or default export)
 *   colonies.mjs      export const COLONIES = [ { blob, iso3: ['KEN'], from, to, name, approx?, why?, source? }, ... ]
 *   Entries are applied in array order. `op` may also be spelled `type`.
 *
 *   match     'Name' (every row of that name; old OR new name), 'Name@FromYear' (one row), or
 *             { name, from?, to? } (rows of that name overlapping the window).
 *   from/to   inclusive year window an operation is limited to; rows spanning a window edge are split first.
 *
 *   { op:'rename',  match, from?, to?, name, memberOf?, qid?, wp? }     memberOf '' clears the realm
 *   { op:'retime',  match, from?, to? }       entity: new first/last year (extends or truncates); 'Name@From': that row
 *   { op:'reshape', match, from?, to?, geometry, approx? }              new geometry, priority 1
 *   { op:'add',     name, from, to, geometry, memberOf?, approx?, qid?, wp?, priority? }   priority defaults to 1
 *   { op:'delete',  match, from?, to? }
 *   { op:'split',   match, knife:'ne-countries', table?: 'colonies' | [rows] }   cut a colonial blob by modern countries
 *   { op:'priority',match, from?, to?, n }
 *   { op:'alias',   old, new }                                           old entity name -> new (kept in the output)
 *
 * GEOMETRY SOURCES (reshape / add)
 *   'row:Name@FromYear'    geometry of an ORIGINAL Cliopatria row (uncorrected, so renames never break references)
 *   'ne:ISO3[+ISO3...]'    Natural Earth 50 m countries (public/data/modern/countries.json, props.iso3)
 *   'ne1:Name[+Name...]'   Natural Earth 10 m admin-1 units (.cache/raw/ne/, `node fetch.mjs --ne`), matched on
 *                          name / name_en / name_local / postal
 *   { intersect:[src,...] } { union:[src,...] } { minus:[src, src] } { bbox:[w,s,e,n] }
 *   { geometry:<GeoJSON Polygon|MultiPolygon> }   or a bare GeoJSON geometry, or an array of sources (= union),
 *   or a function (ctx) => geometry, with ctx = { src, row, ne, ne1, union, intersect, minus, bbox }.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bboxPolygon, difference, featureCollection, intersect, union } from '@turf/turf'
import { NE_RAW, PUBLIC_DATA, areaKm2, asGeometry, entityId, polygonsOf, rankAsc, roundGeom } from './lib.mjs'

const MIN_PIECE_KM2 = 2

const feat = (geometry) => ({ type: 'Feature', properties: {}, geometry })
const fix = (g) => (g ? roundGeom(g) : null)
function geomUnion(list) {
  const gs = list.filter(Boolean)
  if (!gs.length) return null
  if (gs.length === 1) return gs[0]
  const r = union(featureCollection(gs.map(feat)))
  return fix(r?.geometry)
}
function geomIntersect(list) {
  let acc = list[0]
  for (const g of list.slice(1)) {
    if (!acc || !g) return null
    acc = fix(intersect(featureCollection([feat(acc), feat(g)]))?.geometry)
  }
  return acc ?? null
}
function geomMinus(a, b) {
  if (!a) return null
  if (!b) return a
  return fix(difference(featureCollection([feat(a), feat(b)]))?.geometry)
}

/** Window helpers ---------------------------------------------------------------------------------------------- */
function parseMatch(m) {
  if (typeof m === 'string') {
    const at = m.lastIndexOf('@')
    if (at > 0 && /^-?\d+$/.test(m.slice(at + 1))) return { name: m.slice(0, at), exactFrom: Number(m.slice(at + 1)) }
    return { name: m }
  }
  return { name: m.name, from: m.from, to: m.to, exactFrom: m.exactFrom }
}
const nameOf = (r) => [r.name, r.orig.n]
function select(rows, match, win = {}) {
  const m = parseMatch(match)
  const from = win.from ?? m.from ?? -Infinity
  const to = win.to ?? m.to ?? Infinity
  return rows.filter((r) => nameOf(r).includes(m.name) && (m.exactFrom == null || r.orig.f === m.exactFrom || r.from === m.exactFrom) && r.from <= to && r.to >= from)
}
let seq = 0
/** Split rows at the window edges; returns the pieces that lie inside (the outside pieces stay in `rows`). */
function carve(rows, targets, from = -Infinity, to = Infinity) {
  const inside = []
  for (const r of targets) {
    const idx = rows.indexOf(r)
    const pieces = []
    if (r.from < from) pieces.push({ ...r, uid: ++seq, to: from - 1 })
    const mid = { ...r, uid: ++seq, from: Math.max(r.from, from), to: Math.min(r.to, to) }
    pieces.push(mid)
    if (r.to > to) pieces.push({ ...r, uid: ++seq, from: to + 1 })
    rows.splice(idx, 1, ...pieces)
    inside.push(mid)
  }
  return inside
}

export async function applyCorrections(raw, { corrections = [], colonies = [], log = () => {} } = {}) {
  const warnings = []
  const report = []
  const aliases = {}

  /* original-row index for row: references */
  const rawGeom = new Map()
  for (const r of raw.rows) rawGeom.set(`${r.n}@${r.f}`, r.geom)

  let neCountries
  const ne = (isos) => {
    neCountries ??= readFile(join(PUBLIC_DATA, 'modern/countries.json'), 'utf8').then((t) => JSON.parse(t).features)
    return neCountries
  }
  const neCache = new Map()
  async function neGeom(isos) {
    const key = isos.join('+')
    if (neCache.has(key)) return neCache.get(key)
    const fs = await ne()
    const parts = []
    for (const iso of isos) {
      const f = fs.filter((x) => x.properties.iso3 === iso)
      if (!f.length) warnings.push(`ne:${iso} not found in Natural Earth countries`)
      for (const x of f) parts.push(roundGeom(x.geometry))
    }
    const g = geomUnion(parts)
    neCache.set(key, g)
    return g
  }
  let admin1
  async function ne1Geom(names) {
    const file = join(NE_RAW, 'ne_10m_admin_1_states_provinces.geojson')
    if (!existsSync(file)) throw new Error(`${file} missing - run: node scripts/data/clio/fetch.mjs --ne`)
    admin1 ??= JSON.parse(await readFile(file, 'utf8')).features
    const parts = []
    for (const nm of names) {
      const low = nm.toLowerCase()
      const f = admin1.filter((x) => ['name', 'name_en', 'name_local', 'postal', 'gn_name'].some((k) => String(x.properties[k] ?? '').toLowerCase() === low))
      if (!f.length) warnings.push(`ne1:${nm} not found in Natural Earth admin-1`)
      for (const x of f) parts.push(roundGeom(x.geometry))
    }
    return geomUnion(parts)
  }

  async function resolveGeom(src, row) {
    if (src == null) return null
    if (typeof src === 'function')
      return fix(await src({ src, row, ne: neGeom, ne1: ne1Geom, union: geomUnion, intersect: geomIntersect, minus: geomMinus, bbox: (b) => bboxPolygon(b).geometry }))
    if (Array.isArray(src)) return geomUnion(await Promise.all(src.map((s) => resolveGeom(s, row))))
    if (typeof src === 'string') {
      if (src.includes(' & ')) return geomIntersect(await Promise.all(src.split(' & ').map((s) => resolveGeom(s.trim(), row))))
      if (src.startsWith('row:')) {
        const g = rawGeom.get(src.slice(4))
        if (!g) throw new Error(`geometry source ${src}: no such Cliopatria row`)
        return g
      }
      if (src.startsWith('ne:')) return neGeom(src.slice(3).split('+').map((s) => s.trim()))
      if (src.startsWith('ne1:')) return ne1Geom(src.slice(4).split('+').map((s) => s.trim()))
      throw new Error(`unknown geometry source "${src}"`)
    }
    if (src.type === 'Polygon' || src.type === 'MultiPolygon') return fix(src)
    if (src.type === 'Feature') return fix(src.geometry)
    if (src.geometry) return resolveGeom(src.geometry, row)
    if (src.bbox) return bboxPolygon(src.bbox).geometry
    if (src.intersect) return geomIntersect(await Promise.all(src.intersect.map((s) => resolveGeom(s, row))))
    if (src.union) return geomUnion(await Promise.all(src.union.map((s) => resolveGeom(s, row))))
    if (src.minus) return geomMinus(await resolveGeom(src.minus[0], row), await resolveGeom(src.minus[1], row))
    throw new Error(`unknown geometry source ${JSON.stringify(src).slice(0, 80)}`)
  }

  /* working rows */
  const mk = (r) => ({
    uid: ++seq,
    name: r.n,
    orig: { n: r.n, f: r.f },
    from: r.f,
    to: r.t,
    wp: r.wp,
    qid: r.qid,
    mo: r.mo,
    geom: r.geom,
    priority: 0,
    approx: false,
    km2: areaKm2(r.geom),
  })
  let rows = raw.rows.map(mk)

  const tableColonies = colonies

  for (const [i, op] of corrections.entries()) {
    const kind = op.op ?? op.type ?? op.kind
    const label = `#${i + 1} ${kind} ${typeof op.match === 'string' ? op.match : (op.match?.name ?? op.name ?? op.old ?? '')}`
    try {
      const before = rows.length
      if (kind === 'alias') {
        aliases[entityId(op.old)] = entityId(op.new)
        report.push({ i, op: kind, note: `${op.old} -> ${op.new}` })
        continue
      }
      if (kind === 'add') {
        const row = {
          uid: ++seq,
          name: op.name,
          orig: { n: op.name, f: op.from },
          from: op.from,
          to: op.to,
          wp: op.wp ?? op.wikipedia ?? '',
          qid: op.qid ?? op.wikidata ?? '',
          mo: op.memberOf ?? op.mo ?? '',
          geom: null,
          priority: op.priority ?? 1,
          approx: !!op.approx,
          added: true,
        }
        row.geom = await resolveGeom(op.geometry, row)
        if (!row.geom) throw new Error('geometry resolved to nothing')
        row.km2 = areaKm2(row.geom)
        rows.push(row)
        report.push({ i, op: kind, note: `${op.name} ${op.from}..${op.to} ${Math.round(row.km2)} km2` })
        continue
      }
      if (kind === 'split') {
        const tab = Array.isArray(op.table) ? op.table : tableColonies.filter((c) => c.blob === (parseMatch(op.match).name))
        const targets = select(rows, op.match)
        if (!targets.length) throw new Error('no rows match')
        const out = []
        for (const r of targets) {
          // temporal sub-spans: cut at every table boundary inside the row
          const cuts = new Set([r.from, r.to + 1])
          const entries = tab.map((c) => ({ ...c, from: c.from ?? c.years?.[0] ?? -Infinity, to: c.to ?? c.years?.[1] ?? Infinity })).filter((c) => c.from <= r.to && c.to >= r.from)
          for (const c of entries) {
            if (c.from > r.from && c.from <= r.to) cuts.add(c.from)
            if (c.to + 1 > r.from && c.to + 1 <= r.to) cuts.add(c.to + 1)
          }
          const bounds = [...cuts].sort((a, b) => a - b)
          for (let k = 0; k + 1 < bounds.length; k++) {
            const a = bounds[k]
            const b = bounds[k + 1] - 1
            const active = entries.filter((c) => c.from <= a && c.to >= b)
            let rest = r.geom
            for (const c of active) {
              const piece = geomIntersect([r.geom, await neGeom(c.iso3)])
              if (!piece || areaKm2(piece) < MIN_PIECE_KM2) continue
              rest = geomMinus(rest, piece)
              out.push({ ...r, uid: ++seq, name: c.name, orig: { n: c.name, f: a }, from: a, to: b, geom: piece, km2: areaKm2(piece), approx: c.approx ?? true, wp: c.wp ?? '', qid: c.qid ?? '', split: r.name })
            }
            if (rest && areaKm2(rest) >= MIN_PIECE_KM2) out.push({ ...r, uid: ++seq, from: a, to: b, geom: rest, km2: areaKm2(rest) })
          }
        }
        rows = rows.filter((r) => !targets.includes(r)).concat(out)
        report.push({ i, op: kind, note: `${targets.length} rows -> ${out.length} pieces` })
        continue
      }

      const win = kind === 'retime' ? {} : { from: op.from, to: op.to } // retime: from/to are the NEW years, not a window
      const m = parseMatch(op.match)
      const targets = select(rows, op.match, win)
      if (!targets.length) {
        warnings.push(`${label}: no rows match`)
        continue
      }
      if (kind === 'retime') {
        if (m.exactFrom != null) {
          for (const r of targets) {
            if (op.from != null) r.from = op.from
            if (op.to != null) r.to = op.to
          }
        } else {
          const list = [...targets].sort((a, b) => a.from - b.from)
          if (op.from != null) {
            const first = list[0]
            if (op.from <= first.from) first.from = op.from
            else {
              for (const r of list) if (r.to < op.from) rows.splice(rows.indexOf(r), 1)
              for (const r of list) if (r.from < op.from && r.to >= op.from) r.from = op.from
            }
          }
          const live = list.filter((r) => rows.includes(r))
          if (op.to != null && live.length) {
            const last = live[live.length - 1]
            if (op.to >= last.to) last.to = op.to
            else {
              for (const r of live) if (r.from > op.to) rows.splice(rows.indexOf(r), 1)
              for (const r of live) if (r.to > op.to && r.from <= op.to) r.to = op.to
            }
          }
        }
      } else {
        const inside = carve(rows, targets, op.from ?? m.from, op.to ?? m.to)
        for (const r of inside) {
          if (kind === 'delete') rows.splice(rows.indexOf(r), 1)
          else if (kind === 'rename') {
            r.name = op.name
            if ('memberOf' in op) r.mo = op.memberOf ?? ''
            if (op.qid) r.qid = op.qid
            if (op.wp) r.wp = op.wp
          } else if (kind === 'reshape') {
            const g = await resolveGeom(op.geometry, r)
            if (!g) throw new Error('geometry resolved to nothing')
            r.geom = g
            r.km2 = areaKm2(g)
            r.priority = Math.max(r.priority, op.priority ?? 1)
            r.approx = !!op.approx
          } else if (kind === 'priority') r.priority = op.n
          else throw new Error(`unknown op "${kind}"`)
        }
      }
      report.push({ i, op: kind, note: `${targets.length} rows${rows.length !== before ? ` (rows ${before} -> ${rows.length})` : ''}` })
    } catch (e) {
      throw new Error(`correction ${label}: ${e.message}`)
    }
  }

  /* drop rows that vanished / are out of the timeline, give every row its ids */
  rows = rows.filter((r) => r.to >= r.from && r.geom && polygonsOf(r.geom).length)
  rows.sort((a, b) => (nameOf(a)[0] < nameOf(b)[0] ? -1 : nameOf(a)[0] > nameOf(b)[0] ? 1 : a.from - b.from || a.uid - b.uid))
  const seen = new Map()
  for (const r of rows) {
    r.e = entityId(r.name)
    let id = `${r.e}@${r.from}`
    const n = seen.get(id) ?? 0
    seen.set(id, n + 1)
    if (n) id += `~${n + 1}`
    r.id = id
  }
  rows.sort(rankAsc)
  log(`corrections: ${corrections.length} entries applied, ${warnings.length} warnings`)
  return { rows, report, warnings, aliases }
}
