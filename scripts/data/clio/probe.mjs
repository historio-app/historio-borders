#!/usr/bin/env node
/**
 * Which state(s) hold a point in a year, read from the built chunk files:
 *   node scripts/data/clio/probe.mjs <year> <lng> <lat> [<year> <lng> <lat> ...]
 */
import { join } from 'node:path'
import { booleanPointInPolygon } from '@turf/turf'
import { feature as topoFeature } from 'topojson-client'
import { HIST_OUT, readJsonFile } from './lib.mjs'

const index = await readJsonFile(join(HIST_OUT, 'index.json'))
const names = (await readJsonFile(join(HIST_OUT, 'states-entities.json'))).entities
const a = process.argv.slice(2).map(Number)
for (let i = 0; i + 2 < a.length + 0; i += 3) {
  const [y, lng, lat] = a.slice(i, i + 3)
  const c = index.chunks.find((k) => y >= k.from && y <= k.to)
  const topo = await readJsonFile(join(HIST_OUT, c.states))
  const hits = topoFeature(topo, topo.objects.states).features.filter((f) => f.properties.a <= y && y <= f.properties.b && booleanPointInPolygon([lng, lat], f))
  console.log(`${y} (${lng}, ${lat}): ${hits.map((f) => `${names[f.properties.e]?.name ?? f.properties.e} [${f.properties.a}-${f.properties.b}]`).join(' | ') || 'no state'}`)
}
