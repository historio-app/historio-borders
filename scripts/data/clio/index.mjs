#!/usr/bin/env node
/**
 * Writes the two index files of the hybrid border data (docs/border-hybrid-plan.md §1.6):
 *   public/data/hist/index.json            frames, chunks {id, from, to, states, peoples, kb, gzKb}, build hash, sizes
 *   src/data/generated/borderIndex.json    frames + chunk ranges only (so frameFor/chunkOf are synchronous)
 *
 * Reads .cache/hist/states-build.json (written by build-states.mjs) and, when present, the people chunk files in
 * public/data/hist/peoples/ (builder C). Run it again after a people build to refresh the people columns:
 *   node scripts/data/clio/index.mjs
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BUILD_FILE, GENERATED_INDEX, HIST_OUT, MAX_YEAR, MIN_YEAR, readJsonFile, sha256, writeJsonFile } from './lib.mjs'

async function fileInfo(path) {
  if (!existsSync(path)) return null
  const buf = await readFile(path)
  return { bytes: buf.length, gz: gzipSync(buf, { level: 9 }).length, hash: sha256(buf) }
}

export async function writeIndex() {
  const build = await readJsonFile(BUILD_FILE)
  const frames = build.frames
  const chunks = []
  let statesBytes = 0
  let statesGz = 0
  let peoplesBytes = 0
  let peoplesGz = 0
  const hashes = [build.buildHash]
  for (const c of build.chunks) {
    const st = await fileInfo(join(HIST_OUT, 'states', `${c.id}.topo.json`))
    const pe = await fileInfo(join(HIST_OUT, 'peoples', `${c.id}.topo.json`))
    statesBytes += st?.bytes ?? 0
    statesGz += st?.gz ?? 0
    peoplesBytes += pe?.bytes ?? 0
    peoplesGz += pe?.gz ?? 0
    if (pe) hashes.push(pe.hash)
    chunks.push({
      id: c.id,
      from: c.from,
      to: c.to,
      states: `states/${c.id}.topo.json`,
      peoples: pe ? `peoples/${c.id}.topo.json` : null,
      kb: Math.round(((st?.bytes ?? 0) + (pe?.bytes ?? 0)) / 102.4) / 10,
      gzKb: Math.round(((st?.gz ?? 0) + (pe?.gz ?? 0)) / 102.4) / 10,
      statesKb: Math.round((st?.bytes ?? 0) / 102.4) / 10,
      peoplesKb: Math.round((pe?.bytes ?? 0) / 102.4) / 10,
    })
  }
  chunks.sort((a, b) => a.from - b.from)
  // contiguity check over [MIN_YEAR, MAX_YEAR]
  let expect = MIN_YEAR
  for (const c of chunks) {
    if (c.from !== expect) throw new Error(`chunk gap/overlap before ${c.id} (expected from ${expect})`)
    expect = c.to + 1
  }
  if (expect !== MAX_YEAR + 1) throw new Error(`chunks end at ${expect - 1}, expected ${MAX_YEAR}`)

  await writeJsonFile(
    join(HIST_OUT, 'index.json'),
    {
      version: 1,
      build: sha256(hashes.join(':')).slice(0, 16),
      range: [MIN_YEAR, MAX_YEAR],
      frames,
      chunks,
      totals: { statesKb: Math.round(statesBytes / 102.4) / 10, statesGzKb: Math.round(statesGz / 102.4) / 10, peoplesKb: Math.round(peoplesBytes / 102.4) / 10, peoplesGzKb: Math.round(peoplesGz / 102.4) / 10 },
      segments: { states: build.segments, realms: build.realmSegments },
      params: build.params,
    },
    true,
  )
  await writeJsonFile(GENERATED_INDEX, { frames, chunks: chunks.map(({ id, from, to }) => ({ id, from, to })) }, true)
  return { chunks: chunks.length, frames: frames.length }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeIndex()
    .then((r) => console.log(`index.json + borderIndex.json: ${r.frames} frames, ${r.chunks} chunks`))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
