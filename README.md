# historio-borders

Derived border data of [HistorIO](https://historioplay.com) and the scripts that build it. States come from **Cliopatria** (CC BY 4.0) at year level; peoples and cultures come from **historical-basemaps** (GPL-3.0) and fill the land no state holds. See `LICENSES.md` for the licence of each file and `NOTICE` for sources and changes.

## Data

`public/data/hist/`: century chunks of TopoJSON segments (`states/<chunk>.topo.json`, `peoples/<chunk>.topo.json`), entity files, relations, areas and build statistics. A segment is one shape of one entity active over `[a, b]`. Format and conventions: `scripts/data/README.md` is not included; the file headers of `scripts/data/clio/*.mjs` describe each step.

## Rebuild

```
npm ci
npm run fetch:hb         # historical-basemaps snapshots into .cache/raw/hb (compare with sha256 in INPUTS.json)
npm run fetch:states     # Cliopatria v0.2.1 (md5 in INPUTS.json): node scripts/data/clio/fetch.mjs --from=<zip>
npm run build:states
npm run build:peoples
npm run index
npm test                 # sizes, contiguity, overlaps, golden lookups, firewall (add --no-modern without .cache)
```

The state build never reads historical-basemaps data (checked by `npm test`). Without the app's theme file the realm colours use the embedded palette of `scripts/data/lib.mjs`.

Borders in history are contested; the data is approximate. Contact: privacy@historioplay.com
