#!/usr/bin/env node
/**
 * Stage 1 ingest (docs/border-hybrid-plan.md §1.1): Cliopatria v0.2.1 -> .cache/hist/rows-raw.json
 *
 *   node scripts/data/clio/fetch.mjs [--from=<cliopatria zip | .geojson>] [--ne] [--force]
 *
 * - Input is the pinned Cliopatria v0.2.1 zip (DOI 10.5281/zenodo.23128623, md5 in lib.mjs CLIO_PIN). With --from it
 *   uses a file you already have; otherwise it looks in .cache/raw/clio/ and finally asks the Zenodo API for the file
 *   list of the pinned record (plain HTTPS download, md5-checked against the pin).
 * - Only cliopatria_polities_only_v021.geojson is extracted (with `unzip -p`, never the notebooks or PNG maps). The file
 *   is untrusted data: it is only ever parsed with JSON.parse, never executed.
 * - Output rows-raw.json: ordinary POLITY rows (Name not starting with "("), composite POLITY rows ("(Realm)", names
 *   and Wikipedia hints only, geometry dropped) and RELATION rows (geometry dropped). Geometry is rounded to 1e-4 deg.
 *   The `Area` field is dropped (areas are recomputed). Rows ending in 2024 are extended to MAX_YEAR.
 * - --ne also caches Natural Earth 10 m admin-1 (only used for the German occupation zones, corrections track).
 */
import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { download, NE_BASE } from '../lib.mjs'
import { CLIO_PIN, CLIO_RAW, HIST_CACHE, MAX_YEAR, NE_RAW, ROWS_RAW_FILE, roundGeom, writeJsonFile } from './lib.mjs'

const run = promisify(execFile)
const args = process.argv.slice(2)
const arg = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
const FORCE = args.includes('--force')
const GEOJSON = join(CLIO_RAW, CLIO_PIN.member)

function md5File(path) {
  return new Promise((res, rej) => {
    const h = createHash('md5')
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('end', () => res(h.digest('hex')))
      .on('error', rej)
  })
}

async function extractMember(zip) {
  const md5 = await md5File(zip)
  if (md5 !== CLIO_PIN.md5) throw new Error(`md5 of ${zip} is ${md5}, expected the pinned ${CLIO_PIN.md5}`)
  await mkdir(CLIO_RAW, { recursive: true })
  const list = async (z) => (await run('unzip', ['-Z1', z], { maxBuffer: 64 << 20 })).stdout.split('\n').filter(Boolean)
  const cat = async (z, m) => (await run('unzip', ['-p', z, m], { maxBuffer: 1 << 30, encoding: 'buffer' })).stdout
  // The Zenodo archive is a GitHub snapshot that holds the data as a nested cliopatria.geojson.zip.
  const inner = (await list(zip)).find((l) => l.endsWith('/cliopatria.geojson.zip') || l === 'cliopatria.geojson.zip')
  let src = zip
  let member = (await list(zip)).find((l) => l.endsWith(`/${CLIO_PIN.member}`) || l === CLIO_PIN.member)
  if (!member && inner) {
    src = join(CLIO_RAW, 'cliopatria.geojson.zip')
    await writeFile(src, await cat(zip, inner))
    member = (await list(src)).find((l) => l === CLIO_PIN.member || l.endsWith(`/${CLIO_PIN.member}`))
  }
  if (!member) throw new Error(`${CLIO_PIN.member} not found in ${zip}`)
  const data = await cat(src, member)
  await writeFile(GEOJSON + '.part', data)
  await rename(GEOJSON + '.part', GEOJSON)
  console.log(`extracted ${member} (${(data.length / 1e6).toFixed(0)} MB)`)
}

async function ensureGeojson() {
  if (existsSync(GEOJSON) && !FORCE) return
  const from = arg('from')
  await mkdir(CLIO_RAW, { recursive: true })
  if (from?.endsWith('.zip')) return extractMember(from)
  if (from) {
    await copyFile(from, GEOJSON)
    return
  }
  const zip = join(CLIO_RAW, `cliopatria-${CLIO_PIN.version}.zip`)
  if (!existsSync(zip)) {
    const rec = await (await fetch(`https://zenodo.org/api/records/${CLIO_PIN.zenodoRecord}`)).json()
    const file = (rec.files ?? []).find((f) => String(f.key ?? f.filename).endsWith('.zip') && String(f.checksum ?? '').replace('md5:', '') === CLIO_PIN.md5)
    if (!file) throw new Error('no zip with the pinned md5 in the Zenodo record; pass --from=<zip>')
    const url = file.links?.self ?? file.links?.download
    console.log(`downloading ${file.key ?? file.filename} (${Math.round((file.size ?? 0) / 1e6)} MB) from Zenodo`)
    await download(url, zip)
  }
  await extractMember(zip)
}

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v == null ? '' : String(v).trim())

async function main() {
  if (args.includes('--ne')) {
    await mkdir(NE_RAW, { recursive: true })
    const f = 'ne_10m_admin_1_states_provinces.geojson'
    const r = await download(`${NE_BASE}/${f}`, join(NE_RAW, f))
    console.log(r.cached ? `cached ${f}` : `downloaded ${f} (${Math.round(r.bytes / 1e6)} MB)`)
    if (args.length === 1) return
  }
  if (existsSync(ROWS_RAW_FILE) && !FORCE) {
    console.log(`${ROWS_RAW_FILE} exists (use --force to rebuild)`)
    return
  }
  await ensureGeojson()
  const md5 = await md5File(GEOJSON)
  const gj = JSON.parse(await readFile(GEOJSON, 'utf8'))
  const rows = []
  const composites = []
  const relations = []
  let dropped = 0
  for (const f of gj.features) {
    const p = f.properties ?? {}
    const name = clean(p.Name)
    const from = Number(p.FromYear)
    let to = Number(p.ToYear)
    if (!name || !Number.isFinite(from) || !Number.isFinite(to) || to < from) {
      dropped++
      continue
    }
    if (to >= 2024) to = MAX_YEAR
    const base = { n: name, f: from, t: to, wp: clean(p.Wikipedia), qid: clean(p.Wikidata), mo: clean(p.MemberOf) }
    if (p.Type === 'RELATION') {
      relations.push({ ...base, comp: clean(p.Components) })
    } else if (p.Type === 'POLITY' && name.startsWith('(')) {
      composites.push({ ...base, comp: clean(p.Components) })
    } else if (p.Type === 'POLITY') {
      const geom = roundGeom(f.geometry)
      if (!geom) {
        dropped++
        continue
      }
      rows.push({ ...base, geom })
    }
  }
  const key = (r) => `${r.n}\u0000${String(r.f + 5000).padStart(5, '0')}`
  rows.sort((a, b) => (key(a) < key(b) ? -1 : 1))
  composites.sort((a, b) => (key(a) < key(b) ? -1 : 1))
  relations.sort((a, b) => (key(a) < key(b) ? -1 : 1))
  const bytes = await writeJsonFile(ROWS_RAW_FILE, {
    source: { ...CLIO_PIN, geojsonMd5: md5, license: 'CC BY 4.0', rows: rows.length, composites: composites.length, relations: relations.length },
    rows,
    composites,
    relations,
  })
  await mkdir(HIST_CACHE, { recursive: true })
  console.log(`rows ${rows.length}, composites ${composites.length}, relations ${relations.length}, dropped ${dropped} -> ${ROWS_RAW_FILE} (${(bytes / 1e6).toFixed(1)} MB)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
