/**
 * Historical corrections to the upstream historical-basemaps snapshots, applied by borders.mjs (loadHbSnapshot) after normalise()
 * and before simplification (so -clean / -dissolve2 merge a renamed part into an existing polity).
 *
 * Upstream reuses one polygon set for long stretches, so some snapshots carry names that were already gone at that
 * date (China as "Great Khanate" in 1400, the "Sui Empire" in 700, "Zaire" in 2010). Every entry below is keyed by
 * snapshot key (bc323 / 1453) and runs in order:
 *
 *   rename(from, to, props?)   NAME from → to. If `to` already exists in the snapshot the part adopts its SUBJECTO /
 *                              PARTOF and is dissolved into it (a merge); otherwise it is a 1:1 rename and the
 *                              upstream name survives as the feature's ALIAS.
 *   (MODERN entries are `optional`: skipped where the snapshot lacks that name; every other entry must match.)
 *   set(name, props)           patch SUBJECTO / PARTOF (realm colour) without renaming.
 *   split(from, rules, rest)   cut a polity apart. Rules run in order on what is left of it:
 *                                { parts: bbox, to }  whole polygon parts whose centroid lies in bbox
 *                                { clip: bbox | ring | { key, NAME }, to }  geometric intersection with a box, a ring
 *                                  or another snapshot's polity (raw upstream geometry)
 *                              Whatever remains goes to `rest` (null keeps it under `from`). Remainder parts smaller
 *                              than `minRestKm2` (coastline slivers between two upstream datasets) join the nearest
 *                              rule target instead.
 * `to` / `rest` / `props` targets: a NAME string, or { NAME, SUBJECTO, PARTOF } (SUBJECTO/PARTOF default to NAME).
 */

const rename = (from, to, props) => ({ op: 'rename', from, to: props ? { NAME: to, ...props } : to })
const set = (name, props) => ({ op: 'set', name, props })
const split = (from, rules, rest, opts = {}) => ({ op: 'split', from, rules, rest, minRestKm2: opts.minRestKm2 ?? 0 })

/** Constantinople and its walls-to-Selymbria hinterland: all that was left of Byzantium in Thrace after c. 1370. */
const CONSTANTINOPLE = [
  [28.2, 41.02],
  [28.2, 41.32],
  [29.04, 41.25],
  [29.01, 41.05],
  [29.0, 40.98],
  [28.62, 40.94],
  [28.2, 41.02],
]
/** The Peloponnese south of the Gulf of Corinth and the Isthmus (Despotate of the Morea). */
const MOREA = [
  [21.0, 36.2],
  [23.6, 36.2],
  [23.6, 37.62],
  [23.1, 37.75],
  [22.99, 37.92],
  [22.85, 38.08],
  [22.4, 38.2],
  [21.8, 38.31],
  [21.0, 38.3],
  [21.0, 36.2],
]

/** Modern-era spelling clean-up ("Korea, Republic of" → "South Korea"), for snapshots where the state exists. */
const MODERN = [
  rename("Korea, Democratic People's Republic of", 'North Korea'),
  rename('Korea, Republic of', 'South Korea'),
  rename('Gambia, The', 'Gambia'),
  rename('Trinidad', 'Trinidad and Tobago'),
  rename('Byelarus', 'Belarus'),
  rename('Tanzania, United Republic of', 'Tanzania'),
].map((o) => ({ ...o, optional: true }))

const SATAVAHANA = [rename('Satavahanihara', 'Satavahana Empire')]
/** The Satavahanas collapsed c. 220 CE; the Vakatakas held the northern Deccan c. 250–500. */
const VAKATAKA = [rename('Satavahanihara', 'Vakataka Kingdom')]
const BELGIAN_CONGO = { NAME: 'Belgian Congo', SUBJECTO: 'Belgium', PARTOF: 'Belgian Congo' }

export const OVERRIDES = {
  bc1: SATAVAHANA,
  100: SATAVAHANA,
  200: SATAVAHANA,
  300: VAKATAKA,
  400: VAKATAKA,
  700: [
    // Tang from 618; the Umayyads had taken Sasanian Iran (651) and Yemen/Oman.
    rename('Sui Empire', 'Tang Empire'),
    rename('Sasanian Empire', 'Umayyad Caliphate'),
    rename('Sasanian dependencies', 'Umayyad Caliphate'),
  ],
  1000: [rename('Bulgar Khanate', 'First Bulgarian Empire')],
  // Basil II annexed Bulgaria in 1018; it was Byzantine until the 1185 revolt.
  1100: [rename('Bulgar Khanate', 'Byzantine Empire')],
  1200: [
    rename('Fatimid Caliphate', 'Ayyubid Sultanate'), // Saladin ended the Fatimids in 1171
    rename('Bulgar Khanate', 'Second Bulgarian Empire'),
  ],
  1279: [
    rename('Great Khanate', 'Yuan Empire'),
    rename('Hainan', 'Yuan Empire'),
    rename('Seljuk Caliphate', 'Sultanate of Rum'), // the Seljuks never held the caliphate; Rum was an Ilkhanid vassal
    rename('Bulgar Khanate', 'Second Bulgarian Empire'),
    rename('Kediri', 'Singhasari'),
  ],
  1300: [
    rename('Great Khanate', 'Yuan Empire'),
    rename('Hainan', 'Yuan Empire'),
    rename('Seljuk Caliphate', 'Sultanate of Rum'),
    rename('Bulgar Khanate', 'Second Bulgarian Empire'),
    rename('Kediri', 'Majapahit'),
  ],
  // Shown 1400–1491 (incl. 1453): Ming China since 1368, Bulgaria Ottoman since 1396, Byzantium a city + the Morea.
  1400: [
    split(
      'Great Khanate',
      [
        { clip: { key: '1492', NAME: 'Ming Empire' }, to: 'Ming Empire' },
        { clip: { key: '1492', NAME: 'Korea' }, to: 'Joseon' },
      ],
      'Northern Yuan',
      { minRestKm2: 25000 },
    ),
    rename('Hainan', 'Ming Empire'),
    set('Tibet', { SUBJECTO: 'Tibet', PARTOF: 'Tibet' }),
    split(
      'Byzantine Empire',
      [
        { parts: [23.4, 34.7, 26.4, 35.8], to: { NAME: 'Venetian Crete', SUBJECTO: 'Venice', PARTOF: 'Venice' } },
        { parts: [23.2, 38.0, 24.7, 39.1], to: { NAME: 'Negroponte', SUBJECTO: 'Venice', PARTOF: 'Venice' } },
        { parts: [24.2, 36.2, 26.0, 38.05], to: { NAME: 'Duchy of the Archipelago', SUBJECTO: 'Venice', PARTOF: 'Venice' } },
        { parts: [26.6, 35.8, 28.4, 37.4], to: 'Knights Hospitaller' },
        { clip: MOREA, to: 'Byzantine Empire' },
      ],
      'Ottoman Empire',
    ),
    rename('Bulgar Khanate', 'Ottoman Empire'),
    split('Ottoman Empire', [{ clip: CONSTANTINOPLE, to: 'Byzantine Empire' }], null),
    rename('Seljuk Caliphate', 'Anatolian Beyliks'),
    rename('Pagan', 'Ava'),
    rename('Shogun Japan (Kamakura)', 'Ashikaga Shogunate'),
    rename('Kediri', 'Majapahit'),
    rename('Srivijaya Empire', 'Majapahit'),
  ],
  // Upstream stretches the Chagatai Khanate to the Pacific; east of Moghulistan the steppe was the Northern Yuan.
  1492: [split('Chagatai Khanate', [{ clip: { key: '1400', NAME: 'Chagatai Khanate' }, to: 'Chagatai Khanate' }], 'Northern Yuan', { minRestKm2: 25000 })],
  1500: [split('Chagatai Khanate', [{ clip: { key: '1400', NAME: 'Chagatai Khanate' }, to: 'Chagatai Khanate' }], 'Northern Yuan', { minRestKm2: 25000 })],
  1920: [rename('Zaire (Belgium)', BELGIAN_CONGO.NAME, BELGIAN_CONGO), rename('Tanzania, United Republic of', 'Tanganyika')],
  1930: [rename('Zaire (Belgium)', BELGIAN_CONGO.NAME, BELGIAN_CONGO), rename('Tanzania, United Republic of', 'Tanganyika')],
  1938: [rename('Tanzania, United Republic of', 'Tanganyika')],
  1945: [rename('Zaire', BELGIAN_CONGO.NAME, BELGIAN_CONGO), rename('Tanzania, United Republic of', 'Tanganyika')],
  // Shown 1960–1993: Congo-Léopoldville until 1971, Zaire after.
  1960: [rename('Zaire', 'DR Congo (Zaire)'), ...MODERN],
  1994: [rename('Burma', 'Myanmar'), ...MODERN],
  2000: [rename('Zaire', 'DR Congo'), rename('Burma', 'Myanmar'), ...MODERN],
  2010: [rename('Zaire', 'DR Congo'), rename('Burma', 'Myanmar'), ...MODERN],
}
