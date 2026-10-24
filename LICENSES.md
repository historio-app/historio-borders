# Which file has which licence

| Path | Licence | Source |
|---|---|---|
| `public/data/hist/states/**`, `states-entities.json`, `relations.json`, `areas-states.json`, `stats-states.json` | **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/) | Cliopatria v0.2.1, Seshat Global History Databank, doi:10.5281/zenodo.23128623; *Scientific Data* (2025), doi:10.1038/s41597-025-04516-9. Changes: simplified, clipped to land, coast-fitted, corrected (`scripts/data/clio/corrections.mjs`), converted to year frames. Included so the people build can be reproduced. They never contain historical-basemaps geometry. |
| `public/data/hist/peoples/**`, `peoples-entities.json`, `areas-peoples.json`, `stats-peoples.json`, `index.json` | **GPL-3.0** (`LICENSE-GPL-3.0.txt`) | historical-basemaps by A. Ourednik et al., clipped to land that no Cliopatria state holds in that year. CC BY 4.0 is compatible with GPLv3, so the combined files are GPL-3.0. |
| `scripts/**`, `package.json` | **GPL-3.0** | HistorIO |
| `public/data/modern/**` | public domain | Natural Earth |

18,568 state segments were checked for historical-basemaps data before export.
