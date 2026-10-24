#!/usr/bin/env node
/**
 * Assembles the public GPL border repository folder (docs/border-hybrid-plan.md §4). NOT published by this script:
 * the owner creates `historio-app/historio-borders` from the output at launch.
 *
 *   node scripts/data/clio/export-public.mjs [--out=dist-borders]
 *
 * Output (gitignored):
 *   public/data/hist/peoples/**, peoples-entities.json, areas-peoples.json, stats-peoples.json, index.json   GPL-3.0
 *   public/data/hist/states/**, states-entities.json, relations.json, areas-states.json, stats-states.json  CC BY 4.0
 *   public/data/modern/{land,countries,meta}.json                                  Natural Earth (public domain; gate inputs)
 *   scripts/data/{borders,overrides,lib}.mjs, scripts/data/clio/*.mjs, golden.json   GPL-3.0 (the build)
 *   package.json (mapshaper, turf, polylabel, d3-geo, topojson-client), INPUTS.json (pinned inputs),
 *   LICENSE-GPL-3.0.txt, LICENSES.md, NOTICE, README.md
 * Checks first: the state files must not carry historical-basemaps data (no people entities, no `snap` property).
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { feature as topoFeature } from 'topojson-client'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const arg = process.argv.slice(2).find((a) => a.startsWith('--out='))?.slice(6) ?? 'dist-borders'
const OUT = resolve(ROOT, arg)
const HIST = join(ROOT, 'public/data/hist')
const rel = (p) => p.slice(ROOT.length + 1)
const fail = (m) => {
  console.error(`export-public: ${m}`)
  process.exit(1)
}

/* ---- licence firewall on the built state files ---- */
const ents = JSON.parse(readFileSync(join(HIST, 'states-entities.json'), 'utf8'))
for (const id of [...Object.keys(ents.entities), ...Object.keys(ents.realms ?? {})]) if (id.startsWith('p:')) fail(`states-entities.json holds a people entity (${id})`)
let segments = 0
for (const f of readdirSync(join(HIST, 'states'))) {
  const topo = JSON.parse(readFileSync(join(HIST, 'states', f), 'utf8'))
  for (const obj of Object.values(topo.objects)) {
    for (const g of topoFeature(topo, obj).features) {
      segments++
      if (g.properties?.snap !== undefined || String(g.properties?.e ?? '').startsWith('p:')) fail(`${f}: a state segment carries historical-basemaps data`)
    }
  }
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true })
mkdirSync(OUT, { recursive: true })
const put = (from, to = rel(from)) => {
  mkdirSync(dirname(join(OUT, to)), { recursive: true })
  cpSync(from, join(OUT, to), { recursive: true })
}

const GPL_DATA = ['peoples', 'peoples-entities.json', 'areas-peoples.json', 'stats-peoples.json', 'index.json']
const CC_DATA = ['states', 'states-entities.json', 'relations.json', 'areas-states.json', 'stats-states.json']
for (const f of [...GPL_DATA, ...CC_DATA]) put(join(HIST, f))
for (const f of ['land.json', 'countries.json', 'meta.json']) put(join(ROOT, 'public/data/modern', f))

const DEV_ONLY = new Set(['map-questions.mjs', 'render-frame.mjs']) // need the app's content / extra tools
for (const f of readdirSync(join(ROOT, 'scripts/data/clio'))) if (!DEV_ONLY.has(f) && (f.endsWith('.mjs') || f === 'golden.json')) put(join(ROOT, 'scripts/data/clio', f))
for (const f of ['borders.mjs', 'overrides.mjs', 'lib.mjs']) put(join(ROOT, 'scripts/data', f))
put(join(ROOT, 'public/data/LICENSE-GPL-3.0.txt'), 'LICENSE-GPL-3.0.txt')

const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const dep = (n) => rootPkg.dependencies?.[n] ?? rootPkg.devDependencies?.[n] ?? fail(`dependency ${n} not in package.json`)
writeFileSync(
  join(OUT, 'package.json'),
  JSON.stringify(
    {
      name: 'historio-borders',
      private: true,
      type: 'module',
      license: 'GPL-3.0-only',
      description: 'Derived border data of HistorIO and the scripts that build it',
      scripts: {
        'fetch:hb': 'node scripts/data/borders.mjs',
        'fetch:states': 'node scripts/data/clio/fetch.mjs',
        'build:states': 'node scripts/data/clio/build-states.mjs',
        'build:peoples': 'node scripts/data/clio/build-peoples.mjs',
        index: 'node scripts/data/clio/index.mjs',
        test: 'node scripts/data/clio/golden.mjs',
      },
      dependencies: Object.fromEntries(['mapshaper', '@turf/turf', 'polylabel', 'd3-geo', 'topojson-client'].map((n) => [n, dep(n)])),
    },
    null,
    2,
  ) + '\n',
)

/* ---- pinned inputs ---- */
const lib = readFileSync(join(ROOT, 'scripts/data/clio/lib.mjs'), 'utf8')
const md5 = lib.match(/md5: '([0-9a-f]{32})'/)?.[1] ?? fail('Cliopatria md5 pin not found in clio/lib.mjs')
const hbDir = join(ROOT, '.cache/raw/hb')
const hbFiles = existsSync(hbDir) ? Object.fromEntries(readdirSync(hbDir).filter((f) => f.endsWith('.geojson')).sort().map((f) => [f, createHash('sha256').update(readFileSync(join(hbDir, f))).digest('hex')])) : {}
writeFileSync(
  join(OUT, 'INPUTS.json'),
  JSON.stringify(
    {
      cliopatria: { version: 'v0.2.1', doi: '10.5281/zenodo.23128623', md5, licence: 'CC BY 4.0' },
      historicalBasemaps: {
        repo: 'https://github.com/aourednik/historical-basemaps',
        pathPrefix: 'geojson/world_<key>.geojson',
        lastCommitTouchingGeojsonBeforeDownload: '7bed003529d66488532c3a3256568b9725602bbf (2026-09-13); files downloaded 2026-10-14 from master',
        sha256: hbFiles,
        licence: 'GPL-3.0',
      },
      naturalEarth: { note: 'public domain; 1:50m via world-atlas v2 and 10m admin-1 (corrections)' },
    },
    null,
    2,
  ) + '\n',
)

/* ---- texts ---- */
writeFileSync(
  join(OUT, 'LICENSES.md'),
  `# Which file has which licence

| Path | Licence | Source |
|---|---|---|
| \`public/data/hist/states/**\`, \`states-entities.json\`, \`relations.json\`, \`areas-states.json\`, \`stats-states.json\` | **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/) | Cliopatria v0.2.1, Seshat Global History Databank, doi:10.5281/zenodo.23128623; *Scientific Data* (2025), doi:10.1038/s41597-025-04516-9. Changes: simplified, clipped to land, coast-fitted, corrected (\`scripts/data/clio/corrections.mjs\`), converted to year frames. Included so the people build can be reproduced. They never contain historical-basemaps geometry. |
| \`public/data/hist/peoples/**\`, \`peoples-entities.json\`, \`areas-peoples.json\`, \`stats-peoples.json\`, \`index.json\` | **GPL-3.0** (\`LICENSE-GPL-3.0.txt\`) | historical-basemaps by A. Ourednik et al., clipped to land that no Cliopatria state holds in that year. CC BY 4.0 is compatible with GPLv3, so the combined files are GPL-3.0. |
| \`scripts/**\`, \`package.json\` | **GPL-3.0** | HistorIO |
| \`public/data/modern/**\` | public domain | Natural Earth |

${segments.toLocaleString('en-US')} state segments were checked for historical-basemaps data before export.
`,
)
const notice = join(ROOT, 'docs/legal/border-repo/NOTICE')
writeFileSync(
  join(OUT, 'NOTICE'),
  existsSync(notice)
    ? readFileSync(notice, 'utf8')
    : 'HistorIO border data\n\nSources: Cliopatria v0.2.1 (CC BY 4.0); historical-basemaps by A. Ourednik (GPL-3.0); Natural Earth (public domain).\n',
)
writeFileSync(
  join(OUT, 'README.md'),
  `# historio-borders

Derived border data of [HistorIO](https://historioplay.com) and the scripts that build it. States come from **Cliopatria** (CC BY 4.0) at year level; peoples and cultures come from **historical-basemaps** (GPL-3.0) and fill the land no state holds. See \`LICENSES.md\` for the licence of each file and \`NOTICE\` for sources and changes.

## Data

\`public/data/hist/\`: century chunks of TopoJSON segments (\`states/<chunk>.topo.json\`, \`peoples/<chunk>.topo.json\`), entity files, relations, areas and build statistics. A segment is one shape of one entity active over \`[a, b]\`. Format and conventions: \`scripts/data/README.md\` is not included; the file headers of \`scripts/data/clio/*.mjs\` describe each step.

## Rebuild

\`\`\`
npm ci
npm run fetch:hb         # historical-basemaps snapshots into .cache/raw/hb (compare with sha256 in INPUTS.json)
npm run fetch:states     # Cliopatria v0.2.1 (md5 in INPUTS.json): node scripts/data/clio/fetch.mjs --from=<zip>
npm run build:states
npm run build:peoples
npm run index
npm test                 # sizes, contiguity, overlaps, golden lookups, firewall (add --no-modern without .cache)
\`\`\`

The state build never reads historical-basemaps data (checked by \`npm test\`). Without the app's theme file the realm colours use the embedded palette of \`scripts/data/lib.mjs\`.

Borders in history are contested; the data is approximate. Contact: privacy@historioplay.com
`,
)
console.log(`export-public: wrote ${rel(OUT) || OUT} (${segments} state segments checked)`)
