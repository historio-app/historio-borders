/**
 * Corrections to Cliopatria v0.2.1 (docs/border-hybrid-plan.md §1.2, corrections E1–E19; builder B). Pure data.
 * Applied in array order by apply-corrections.mjs (its header has the operation and geometry-source contract).
 *
 * LICENCE FIREWALL. Geometry here comes only from Cliopatria rows ('row:Name@FromYear', CC BY 4.0), Natural Earth
 * ('ne:' 50 m countries, 'ne1:' 10 m admin-1; public domain), bounding boxes and the authored polygons in
 * ne-admin1.mjs. Never from historical-basemaps, so the state files stay CC BY 4.0.
 *
 * YEAR RULE. Years are inclusive and BCE years negative, as in Cliopatria. A change applies from the year in which
 * it took effect (Algeria independent 5 Jul 1962 → Algeria from 1962), except that a change in the last two weeks of
 * a year applies from the next year (Kingdom of Libya 24 Dec 1951 → 1952; Romania 30 Dec 1947 → 1948, as Cliopatria
 * already has it). Ancient dates follow the middle chronology as given by the cited Wikipedia articles.
 *
 * SOURCES. `source` names English Wikipedia articles (infobox and lead), read on 2026-10-24; QIDs come from the
 * Wikidata API (wbgetentities by enwiki title) the same day. QIDs are hints only (plan §1.1). Every match was checked
 * against the v0.2.1 rows; `node scripts/data/clio/corrections.mjs --check` re-runs the table through
 * apply-corrections.mjs on the cached raw rows and probes golden.json (see the CLI at the end of this file).
 *
 * PRIORITY. `add` and `reshape` default to priority 1 (beats stale rows). Entries that must still lose to newer rows
 * set `priority: 0` explicitly, with the reason in `why`.
 *
 * E19 EDITORIAL RULE (sensitive modern labels). Contested land is never labelled with the name of a state that holds
 * it only by military occupation or by an annexation most states do not recognise; it gets its own entity with a
 * neutral geographic name (the Wikipedia article title) and the situation in `why`. De facto states keep a neutral
 * name. Lines of control between claimants that each administer part of a region (Kashmir) are left as drawn.
 */
import { pathToFileURL } from 'node:url'
import { NG_LAGOS, NG_SOUTH, ZA_ORANGE, ZA_TRANSVAAL, ZONES } from './ne-admin1.mjs'

const MAX = 2025
const USA = 'United States of America'
const FFR = 'French Fifth Republic'
const US_TERR = 'USA+PRI+GUM+VIR+ASM+MNP'
const GAZA_BOX = { bbox: [34.0, 31.1, 34.6, 31.65] }
const ALLIED_DE = '(Allied-occupied Germany)'

export const CORRECTIONS = [
  /* ============================================================ E1 Poland 1945–1989 */
  { id: 'E1a', op: 'add', name: 'Poland', from: 1945, to: 1946, geometry: 'row:Republic of Poland@1953', wp: 'Provisional Government of National Unity', qid: 'Q36',
    source: 'WP "Recovered Territories"; "Provisional Government of National Unity" (28 Jun 1945); "1951 Polish–Soviet territorial exchange"',
    why: 'Cliopatria has no Poland 1940–1952 (Second Polish Republic ends 1939, Republic of Poland starts 1953); from 1945 Poland is drawn inside the USSR (USSR rows 23.0–24.5 M km² in 1945–1947 against 21.9 M from 1953). The post-war borders (Potsdam, Oder–Neisse) are the 1953 shape; the 1951 exchange moved < 500 km².' },
  { id: 'E1b', op: 'add', name: "Polish People's Republic", from: 1947, to: 1952, geometry: 'row:Republic of Poland@1953', wp: "Polish People's Republic", qid: 'Q211274',
    source: 'WP "Polish People\'s Republic" (infobox 1947–1989; officially "Republic of Poland" until the constitution of 22 Jul 1952)',
    why: 'Wikipedia dates the PPR from the January 1947 elections; that convention is used rather than the 1952 name change.' },
  { id: 'E1c', op: 'rename', match: { name: 'Republic of Poland', from: 1953, to: 1989 }, name: "Polish People's Republic", wp: "Polish People's Republic", qid: 'Q211274',
    source: 'WP "Polish People\'s Republic" (to 31 Dec 1989; name changed 29 Dec 1989)', why: 'Cliopatria calls 1953–1989 "Republic of Poland" (WP Poland).' },

  /* ============================================================ E2 Czechoslovakia 1945–1946 */
  { id: 'E2a', op: 'add', name: 'Czechoslovakia', from: 1945, to: 1946, geometry: 'row:Czechoslovakia@1947', wp: 'Third Czechoslovak Republic', qid: 'Q33946',
    source: 'WP "Third Czechoslovak Republic" (1945–1948)', why: 'Rows run 1938, then 1947; 1945–1946 is inside the USSR row. Carpathian Ruthenia went to the USSR in June 1945, so the 1947 shape is right.' },
  { id: 'E2b', op: 'retime', match: 'Czechoslovakia@1991', to: 1992, source: 'WP "Dissolution of Czechoslovakia" (effective 1 Jan 1993)', why: 'Cliopatria splits it in 1992; the federation existed until 31 Dec 1992.' },
  { id: 'E2c', op: 'retime', match: 'Slovakia@1992', from: 1993, source: 'WP "Slovakia" (independent 1 Jan 1993)' },
  { id: 'E2d', op: 'retime', match: 'Czech Republic@1992', from: 1993, source: 'WP "Czech Republic" (independent 1 Jan 1993)' },

  /* ============================================================ E3 Hungary 1920–1949 */
  { id: 'E3a', op: 'rename', match: { name: 'Hungarian Republic', from: 1920, to: 1943 }, name: 'Kingdom of Hungary', wp: 'Kingdom of Hungary (1920–1946)', qid: 'Q600018',
    source: 'WP "Kingdom of Hungary (1920–1946)" (monarchy restored 29 Feb 1920, abolished 1 Feb 1946)', why: 'Cliopatria names the regency "Hungarian Republic". The 1919 row (First Hungarian Republic / Soviet Republic) keeps its name.' },
  { id: 'E3b', op: 'add', name: 'Kingdom of Hungary', from: 1944, to: 1944, geometry: 'row:Hungarian Republic@1943', wp: 'Kingdom of Hungary (1920–1946)', qid: 'Q600018',
    source: 'WP "Kingdom of Hungary (1920–1946)"; "Operation Margarethe" (German occupation 19 Mar 1944)', why: 'Hungary is missing in 1944 (inside Nazi Germany\'s row). Under German occupation it remained a state with its own government; the 1941–1943 borders held until the Soviet advance late in 1944.' },
  { id: 'E3c', op: 'add', name: 'Hungary', from: 1945, to: 1946, geometry: 'row:Hungary@1947', wp: 'Second Hungarian Republic', qid: 'Q940741',
    source: 'WP "Second Hungarian Republic" (1946–1949); "Kingdom of Hungary (1920–1946)" (Provisional National Assembly, Debrecen, 21 Dec 1944)', why: 'Missing 1945–1946 (inside the USSR row); 1938-border shape of 1947.' },
  { id: 'E3d', op: 'rename', match: { name: 'Hungary', from: 1949, to: 1949 }, name: "Hungarian People's Republic", wp: "Hungarian People's Republic", qid: 'Q16410',
    source: 'WP "Hungarian People\'s Republic" (constitution of 20 Aug 1949)', why: 'Frame-year rounding (E17 type): Cliopatria starts it in 1950.' },

  /* ============================================================ E4 Romania, Bulgaria */
  { id: 'E4a', op: 'add', name: 'Kingdom of Romania', from: 1945, to: 1946, geometry: 'row:Kingdom of Romania@1947', wp: 'Kingdom of Romania', qid: 'Q203493',
    source: 'WP "Kingdom of Romania" (to 30 Dec 1947)', why: 'Missing 1945–1946 (inside the USSR row). The 1947 shape is the post-war border (Northern Transylvania back, Bessarabia and Northern Bukovina Soviet).' },
  { id: 'E4b', op: 'rename', match: { name: 'Socialist Republic of Romania', from: 1948, to: 1964 }, name: "Romanian People's Republic", wp: 'Socialist Republic of Romania',
    source: 'WP "Socialist Republic of Romania" (Romanian People\'s Republic 30 Dec 1947 – 21 Aug 1965)', why: 'Cliopatria uses the 1965 name from 1948.' },
  { id: 'E4c', op: 'rename', match: { name: 'Kingdom of Bulgaria', from: 1947, to: 1947 }, name: "People's Republic of Bulgaria", wp: "People's Republic of Bulgaria", qid: 'Q121932',
    source: 'WP "Kingdom of Bulgaria" (monarchy abolished by the referendum of 8 Sep 1946, republic proclaimed 15 Sep 1946)', why: 'Cliopatria still has a kingdom in 1947.' },
  { id: 'E4d', op: 'rename', match: { name: 'Principality of Bulgaria', from: 1908, to: 1944 }, name: 'Kingdom of Bulgaria', wp: 'Kingdom of Bulgaria', qid: 'Q147909',
    source: 'WP "Kingdom of Bulgaria" (independence and tsardom proclaimed 5 Oct 1908)', why: 'Cliopatria keeps "Principality" until 1944.' },
  { id: 'E4e', op: 'add', name: 'Kingdom of Bulgaria', from: 1945, to: 1945, geometry: 'row:Kingdom of Bulgaria@1947', wp: 'Kingdom of Bulgaria', qid: 'Q147909',
    source: 'WP "Kingdom of Bulgaria"', why: 'Missing 1945–1946 (inside the USSR row); post-war border = 1947 shape (Southern Dobruja kept).' },
  { id: 'E4f', op: 'add', name: "People's Republic of Bulgaria", from: 1946, to: 1946, geometry: 'row:Kingdom of Bulgaria@1947', wp: "People's Republic of Bulgaria", qid: 'Q121932',
    source: 'WP "1946 Bulgarian republic referendum"; "People\'s Republic of Bulgaria" (15 Sep 1946)' },

  /* ============================================================ E5 Germany 1945–1990 */
  { id: 'E5a', op: 'add', name: 'Allied-occupied Germany (US zone)', from: 1945, to: 1948, geometry: ZONES.us, memberOf: ALLIED_DE, approx: true, wp: 'Allied-occupied Germany',
    source: 'WP "Allied-occupied Germany" § zones; "Württemberg-Baden"', why: 'The zones carry the occupiers\' names in Cliopatria (Munich "United States of America", Hamburg "Kingdom of Great Britain", Saarbrücken and Berlin "French Fourth Republic"). Natural Earth Länder; the Württemberg cut and Lindau are authored (ne-admin1.mjs).' },
  { id: 'E5b', op: 'add', name: 'Allied-occupied Germany (British zone)', from: 1945, to: 1948, geometry: ZONES.uk, memberOf: ALLIED_DE, approx: true, wp: 'Allied-occupied Germany',
    source: 'WP "Allied-occupied Germany" § zones (Belgian, Polish and Dutch sub-zones not drawn)' },
  { id: 'E5c', op: 'add', name: 'Allied-occupied Germany (French zone)', from: 1945, to: 1945, geometry: ZONES.fr1945, memberOf: ALLIED_DE, approx: true, wp: 'Allied-occupied Germany',
    source: 'WP "Allied-occupied Germany" § zones (with the Saar until 16 Feb 1946)' },
  { id: 'E5d', op: 'add', name: 'Allied-occupied Germany (French zone)', from: 1946, to: 1948, geometry: ZONES.fr, memberOf: ALLIED_DE, approx: true, wp: 'Allied-occupied Germany',
    source: 'WP "Allied-occupied Germany" § zones (Saar detached 16 Feb 1946)' },
  { id: 'E5e', op: 'add', name: 'Allied-occupied Germany (Soviet zone)', from: 1945, to: 1948, geometry: ZONES.su, memberOf: ALLIED_DE, approx: true, wp: 'Allied-occupied Germany',
    source: 'WP "Allied-occupied Germany" § zones' },
  { id: 'E5f', op: 'add', name: 'Berlin (four-power area)', from: 1945, to: 1948, geometry: ZONES.berlin, memberOf: ALLIED_DE, approx: true, wp: 'Allied-occupied Germany',
    source: 'WP "Allied-occupied Germany" (Berlin jointly occupied, four sectors)', why: 'Cliopatria puts Berlin in the French rows from 1945 to 2023.' },
  { id: 'E5g', op: 'add', name: 'Saar Protectorate', from: 1946, to: 1956, geometry: ZONES.saar, approx: true, wp: 'Saar Protectorate', qid: 'Q310293',
    source: 'WP "Saar Protectorate" (detached 16 Feb 1946, protectorate constitution 17 Dec 1947, joined West Germany 1 Jan 1957)', why: 'Cliopatria leaves the Saar in the French Fourth Republic until 1957. 1946–1947 it was already detached from the zone under French administration.' },
  { id: 'E5h', op: 'add', name: 'West Berlin', from: 1949, to: 1990, geometry: ZONES.westBerlin, approx: true, wp: 'West Berlin', qid: 'Q56036',
    source: 'WP "West Berlin" (1949 – 3 Oct 1990)', why: 'Cliopatria\'s French rows hold all of Berlin until 2023 (the GDR row includes it only in 1973–1975). Sector line authored in ne-admin1.mjs (±1 km).' },
  { id: 'E5i', op: 'add', name: 'East Berlin', from: 1949, to: 1990, geometry: ZONES.eastBerlin, memberOf: '(German Democratic Republic)', approx: true, wp: 'East Berlin', qid: 'Q56037',
    source: 'WP "East Berlin" (capital of the GDR 1949–1990)', why: 'Own entity in the GDR realm (same colour, card "part of German Democratic Republic").' },
  { id: 'E5j', op: 'retime', match: 'Federal Republic of Germany@1950', from: 1949, to: 1956, source: 'WP "West Germany" (founded 23 May 1949); "Saar Protectorate" (joined 1 Jan 1957)', why: 'Frame-year rounding; the 1958 row (with the Saar) starts in 1957.' },
  { id: 'E5k', op: 'retime', match: 'Federal Republic of Germany@1958', from: 1957, source: 'WP "Saar Protectorate" (joined the Federal Republic on 1 Jan 1957)' },

  /* ============================================================ E6 Austria 1945–1955 */
  { id: 'E6', op: 'add', name: 'Allied-occupied Austria', from: 1945, to: 1955, geometry: 'row:Second Republic of Austria@1947', wp: 'Allied-occupied Austria', qid: 'Q596239',
    source: 'WP "Allied-occupied Austria" (1945–1955; State Treaty in force 27 Jul 1955, last troops left 25 Oct 1955)', why: 'Cliopatria has no Austria in 1945 and only 60k km² in 1946 (the rest in the occupiers\' rows). Priority 1 covers the 1946–1955 Second Republic rows; the Second Republic shows again from 1956.' },

  /* ============================================================ E7 Japan and Korea */
  { id: 'E7a', op: 'add', name: 'Occupied Japan', from: 1946, to: 1951, geometry: 'row:Japan@1953', wp: 'Occupation of Japan', qid: 'Q696251',
    source: 'WP "Occupation of Japan" (2 Sep 1945 – 28 Apr 1952, Treaty of San Francisco)', why: 'Cliopatria\'s USA rows hold Japan 1946–1952. The plan had 1946–1952; the occupation ended in April 1952, so Japan is sovereign from 1952 (E7b).' },
  { id: 'E7b', op: 'retime', match: 'Japan@1953', from: 1952, to: 1971, source: 'WP "Treaty of San Francisco" (in force 28 Apr 1952); "United States Civil Administration of the Ryukyu Islands" (Okinawa returned 15 May 1972)' },
  { id: 'E7c', op: 'retime', match: 'Japan@1973', from: 1972, source: 'WP "United States Civil Administration of the Ryukyu Islands" (Okinawa returned 15 May 1972)' },
  { id: 'E7d', op: 'add', name: 'United States Army Military Government in Korea', from: 1945, to: 1947, geometry: "row:Republic of Korea@1948", wp: 'United States Army Military Government in Korea', qid: 'Q484104',
    source: 'WP "United States Army Military Government in Korea" (8 Sep 1945 – 15 Aug 1948)', why: 'Korea is missing 1945–1947 (Japanese, then US and Soviet rows).' },
  { id: 'E7e', op: 'add', name: 'Soviet Civil Administration (Korea)', from: 1945, to: 1947, geometry: "row:Democratic People's Republic of Korea@1948", wp: 'Soviet Civil Administration', qid: 'Q15242873',
    source: 'WP "Soviet Civil Administration" (3 Oct 1945 – 1948; DPRK 9 Sep 1948)' },

  /* ============================================================ E8 France (and the French Community) */
  { id: 'E8a', op: 'rename', match: { name: FFR, from: 1958, to: 1961 }, name: FFR, memberOf: '(French Community)',
    source: 'WP "French Community" (1958–1995; the African colonies became its autonomous republics in 1958)', why: 'Realm for the 1958–1961 pieces split off below, so they keep France\'s colour.' },
  { id: 'E8b', op: 'split', match: FFR, knife: 'ne-countries', table: 'colonies',
    source: 'colonies.mjs (blob "French Fifth Republic")', why: 'Cliopatria\'s 1958–1960 French rows still hold all of French Africa (11.3 M km²).' },
  { id: 'E8c', op: 'retime', match: "People's Democratic Republic of Algeria@1963", from: 1962, source: 'WP "Algeria" (independence 5 Jul 1962)' },
  { id: 'E8d', op: 'reshape', match: { name: FFR, from: 1962, to: 1974 }, geometry: `row:${FFR}@1961 & ne:FRA+DJI+NCL+ATF+COM`, priority: 0, approx: false,
    source: 'WP "Algeria"; "Comoros" (independent 6 Jul 1975); "French Territory of the Afars and the Issas" (to 27 Jun 1977)',
    why: 'The 1961–2023 French row keeps Algeria (3.03 M km²) and border slivers in Libya, Niger and Tunisia. The plan\'s ne:FRA alone would drop New Caledonia, the Southern Lands, Djibouti and the Comoros, so the row is cut to those Natural Earth units instead. Priority 0 so the newer Djibouti row (1977) still wins.' },
  { id: 'E8e', op: 'reshape', match: { name: FFR, from: 1975, to: 2023 }, geometry: `row:${FFR}@1961 & ne:FRA+DJI+NCL+ATF`, priority: 0, approx: false,
    source: 'WP "Comoros" (independent 6 Jul 1975; Mayotte stayed French)' },
  { id: 'E8f', op: 'add', name: 'Comoros', from: 1975, to: MAX, geometry: `row:${FFR}@1961 & ne:COM`, wp: 'Comoros', qid: 'Q970',
    source: 'WP "Comoros" (independent 6 Jul 1975)', why: 'Cliopatria has no Comoros row; its French row keeps the islands until 2023.' },

  /* ============================================================ E9 Great Britain / United Kingdom */
  { id: 'E9a', op: 'retime', match: 'Kingdom of England@1706', to: 1706, source: 'WP "Acts of Union 1707" (effective 1 May 1707)' },
  { id: 'E9b', op: 'retime', match: 'Kingdom of Great Britain@1709', from: 1707, source: 'WP "Kingdom of Great Britain" (1707–1800)', why: 'Frame-year rounding (E17 type).' },
  { id: 'E9c', op: 'rename', match: { name: 'Kingdom of Great Britain', from: 1801, to: 1921 }, name: 'United Kingdom of Great Britain and Ireland', wp: 'United Kingdom of Great Britain and Ireland', qid: 'Q174193',
    source: 'WP "Acts of Union 1800" (effective 1 Jan 1801)', why: 'Cliopatria keeps "Kingdom of Great Britain" to 2024.' },
  { id: 'E9d', op: 'rename', match: { name: 'Kingdom of Great Britain', from: 1922, to: MAX }, name: 'United Kingdom', wp: 'United Kingdom', qid: 'Q145',
    source: 'WP "Anglo-Irish Treaty"; "Irish Free State" (6 Dec 1922)', why: 'Cliopatria\'s 1922 row already excludes the Irish Free State. Oman and the UAE (in the 1969–2023 row) go to their own newer rows by the overlap rule (retimed to 1971 in E17).' },

  /* ============================================================ E10 United States */
  { id: 'E10a', op: 'reshape', match: { name: USA, from: 1947, to: 1966 }, geometry: `row:${USA}@1947 & ne:${US_TERR}+PAN`, priority: 0,
    source: 'WP "Territories of the United States"; "Panama Canal Zone" (1903 – 1 Oct 1979)', why: 'The 1947–1966 row holds occupied Japan, the US zone of Germany, South Korea and Palau. Cut to US land; the Panama piece of the row is exactly the Canal Zone.' },
  { id: 'E10b', op: 'reshape', match: { name: USA, from: 1967, to: 1978 }, geometry: `row:${USA}@1967 & ne:${US_TERR}+PAN`, priority: 0,
    source: 'WP "Territories of the United States"; "South Vietnam"', why: 'The 1967–2005 row holds South Vietnam (157k km²).' },
  { id: 'E10c', op: 'reshape', match: { name: USA, from: 1979, to: 2005 }, geometry: `row:${USA}@1967 & ne:${US_TERR}`, priority: 0, source: 'WP "Torrijos–Carter Treaties" (Canal Zone abolished 1 Oct 1979)' },
  { id: 'E10d', op: 'reshape', match: { name: USA, from: 2006, to: 2023 }, geometry: `row:${USA}@2006 & ne:${US_TERR}`, priority: 0,
    source: 'WP "Iraq" (sovereignty restored 28 Jun 2004; US withdrawal Dec 2011)', why: 'The 2006–2023 row holds all of Iraq (432k km²).' },
  { id: 'E10e', op: 'add', name: 'Republic of Iraq', from: 2006, to: 2013, geometry: 'row:Republic of Iraq@2014', wp: 'Iraq', qid: 'Q796',
    source: 'WP "Iraq" (Republic of Iraq, constitution of 2005)', why: 'Iraq is missing 2006–2013 (only the USA row). ISIL control 2014–2017 is not drawn by Cliopatria either.' },
  { id: 'E10f', op: 'retime', match: 'Republic of Vietnam@1956', to: 1972, source: 'WP "South Vietnam" (1955 – 30 Apr 1975)', why: 'South Vietnam is missing 1967–1972 (inside the USA row); its 1956 shape is extended to the 1973 row.' },
  { id: 'E10g', op: 'retime', match: 'Republic of the Philippines@1947', from: 1946, source: 'WP "Philippines" (independence 4 Jul 1946)', why: 'The 1946 USA row holds the Philippines; equal FromYear, so the smaller Philippines row wins.' },
  { id: 'E10h', op: 'add', name: 'United States Civil Administration of the Ryukyu Islands', from: 1945, to: 1971, geometry: { intersect: [`row:${USA}@1947`, { bbox: [122.5, 23.5, 131.5, 27.0] }] }, approx: true,
    wp: 'United States Civil Administration of the Ryukyu Islands', qid: 'Q55526', source: 'WP "United States Civil Administration of the Ryukyu Islands" (military government 1945, USCAR 1950 – 15 May 1972)',
    why: 'After cutting the USA rows to US land, Okinawa would be empty until Japan\'s 1973 row. Islands south of 27°N (the Amami group north of it was returned in Dec 1953).' },

  /* ============================================================ E11 colonial blobs (colonies.mjs) */
  { id: 'E11a', op: 'rename', match: 'German Africa', name: 'German Africa', memberOf: '(German colonial empire)', source: 'WP "German colonial empire"', why: 'The blob has no MemberOf; give the split pieces one realm (one colour).' },
  { id: 'E11b', op: 'rename', match: 'Italian Africa', name: 'Italian Africa', memberOf: '(Italian colonial empire)', source: 'WP "Italian Empire"', why: 'As E11a.' },
  ...['British Africa', 'British Gold Coast', 'British East Africa', 'German Africa', 'Italian Africa', 'Portuguese Africa', 'French Africa', 'Belgian Congo'].map((blob, i) => ({
    id: `E11c${i + 1}`, op: 'split', match: blob, knife: 'ne-countries', table: 'colonies', source: `colonies.mjs (blob "${blob}")`, why: 'Colonial blob cut by Natural Earth countries (plan §1.2.2).',
  })),
  // After the split every named piece has a colony name, so rows still called by the blob name are the remainder:
  // coast and border slivers where Cliopatria and Natural Earth disagree (mostly sea), pieces hidden under the
  // (retimed) successor rows, and a few Cliopatria extents with no historical owner (FOLLOW_UPS). They are dropped so
  // no "British Africa" sliver is labelled; coast growth fills land gaps under 15 km. Kept: Portuguese Africa (its
  // remainder is real forts: Morocco, Fernando Pó, Kilwa) and French Africa before 1895 (Gabon, Porto-Novo posts).
  ...['British Africa', 'British Gold Coast', 'British East Africa', 'German Africa', 'Italian Africa'].map((blob) => ({
    id: `E11d:${blob}`, op: 'delete', match: blob, source: 'colonies.mjs', why: 'Blob remainder after the split (see above). British East Africa 1969–1972 is a 0 km² row.',
  })),
  { id: 'E11d:French Africa', op: 'delete', match: { name: 'French Africa', from: 1895, to: 1957 }, source: 'colonies.mjs', why: 'Blob remainder after the split; includes Cliopatria\'s Fezzan claims of 1905–1919 (150k km²).' },
  // Pieces that must not carry the British realm (sovereign states or other administrations); match each split piece
  // by its start year so Cliopatria's own rows of the same name are not touched.
  ...[['Mahdist State', [1885]], ['Trust Territory of Somaliland', [1950, 1953, 1956, 1958]], ['Ethiopian Empire', [1941]], ['Kingdom of Iraq', [1943, 1944, 1945]],
    ['Qajar Dynasty', [1919]], ['Pahlavi Dynasty', [1943, 1944, 1945]]].flatMap(([name, years]) => years.map((y) => ({
    id: `E11e:${name}@${y}`, op: 'rename', match: `${name}@${y}`, name, memberOf: '', source: 'colonies.mjs (see the piece\'s why)', why: 'Clear the British realm inherited from the blob.',
  }))),
  { id: 'E11f', op: 'add', name: 'Lagos Colony', from: 1885, to: 1905, geometry: { intersect: ['row:British Gold Coast@1885', NG_LAGOS] }, priority: 2, approx: true, wp: 'Lagos Colony', qid: 'Q472146', memberOf: '(British Empire)',
    source: 'WP "Lagos Colony" (1862 – merged into Southern Nigeria 1 May 1906)', why: 'Carved out of the Niger Coast / Southern Nigeria pieces with the Lagos admin-1 unit. Priority 2 so it stays on top of the 1905 Southern Nigeria add.' },
  { id: 'E11g', op: 'add', name: 'Southern Nigeria Protectorate', from: 1905, to: 1913, geometry: { intersect: ['row:British Gold Coast@1905', NG_SOUTH] }, approx: true, wp: 'Southern Nigeria Protectorate', qid: 'Q2062030', memberOf: '(British Empire)',
    source: 'WP "Southern Nigeria Protectorate" (1900 – 1 Jan 1914)', why: 'Cliopatria\'s 1905 Gold Coast row covers all of Nigeria; the south = the seventeen southern states (the 1914 amalgamation line).' },
  { id: 'E11h', op: 'add', name: 'Transvaal Colony', from: 1900, to: 1909, geometry: { intersect: ['row:British Africa@1900', ZA_TRANSVAAL] }, approx: true, wp: 'Transvaal Colony', qid: 'Q1187978', memberOf: '(British Empire)',
    source: 'WP "Transvaal Colony" (annexed 1900, colony 1902 – 31 May 1910); "South African Republic" (to 1902)', why: 'Inside the Cape Colony piece otherwise. Modern provinces approximate the old republic.' },
  { id: 'E11i', op: 'add', name: 'Orange River Colony', from: 1900, to: 1909, geometry: { intersect: ['row:British Africa@1900', ZA_ORANGE] }, approx: true, wp: 'Orange River Colony', qid: 'Q1142179', memberOf: '(British Empire)',
    source: 'WP "Orange River Colony" (annexed 28 May 1900 – 31 May 1910)' },
  { id: 'E11j', op: 'add', name: 'British Somaliland', from: 1885, to: 1939, geometry: { minus: [{ intersect: ['row:British Africa@1953', { bbox: [42.5, 7.8, 49.2, 11.6] }] }, 'ne:SOM+ETH+DJI'] }, approx: true, wp: 'British Somaliland', qid: 'Q662653', memberOf: '(British Empire)',
    source: 'WP "British Somaliland" (1884 – 26 Jun 1960)', why: 'Natural Earth\'s Somaliland unit has no ISO code, so the country knife cannot name it; cut from the blob by box instead.' },
  { id: 'E11k', op: 'add', name: 'British Somaliland', from: 1941, to: 1959, geometry: { minus: [{ intersect: ['row:British Africa@1953', { bbox: [42.5, 7.8, 49.2, 11.6] }] }, 'ne:SOM+ETH+DJI'] }, approx: true, wp: 'British Somaliland', qid: 'Q662653', memberOf: '(British Empire)',
    source: 'WP "British Somaliland" (Italian occupation Aug 1940 – Mar 1941)' },
  { id: 'E11l', op: 'add', name: 'Italian East Africa', from: 1940, to: 1940, geometry: { minus: [{ intersect: ['row:Italian Africa@1940', { bbox: [42.5, 7.8, 49.2, 11.6] }] }, 'ne:SOM+ETH+DJI'] }, approx: true, wp: 'Italian East Africa', qid: 'Q328478', memberOf: '(Italian colonial empire)',
    source: 'WP "Italian conquest of British Somaliland" (Aug 1940)' },

  /* ============================================================ E12 Natal */
  { id: 'E12a', op: 'retime', match: 'Natalia Republic@1840', from: 1839, source: 'WP "Natalia Republic" (established 12 Oct 1839)' },
  { id: 'E12b', op: 'rename', match: { name: 'Natalia Republic', from: 1843 }, name: 'Colony of Natal', memberOf: '(British Empire)', wp: 'Colony of Natal', qid: 'Q1301901',
    source: 'WP "Natalia Republic" (1839 – annexed 12 May 1843); "Colony of Natal" (1843–1910; part of the Cape 1844–1856)', why: 'Cliopatria runs the Boer republic until 1910 (Zululand added 1898).' },

  /* ============================================================ E13 Ur III */
  { id: 'E13a', op: 'retime', match: 'Akkadian Empire@-2200', to: -2155, source: 'WP "Akkadian Empire" (c. 2334 – c. 2154 BC, middle chronology)' },
  // apply-corrections limits a retime to rows overlapping [from, to], so a move of both ends past the row is two entries.
  { id: 'E13b', op: 'retime', match: 'Gutian Dynasty@-2100', from: -2154, source: 'WP "Gutian rule in Mesopotamia"; "Akkadian Empire" (c. 2154 BC)' },
  { id: 'E13b2', op: 'retime', match: 'Gutian Dynasty@-2100', to: -2120, source: 'WP "Gutian rule in Mesopotamia" (ends with Utu-hengal of Uruk, c. 2119 BC)',
    why: 'The plan had −2154…−2113; Utu-hengal defeated the Gutians c. 2119 BC and ruled Sumer until Ur-Nammu (c. 2112 BC).' },
  { id: 'E13c', op: 'retime', match: 'Sumerian City-States@-2100', from: -2119, source: 'WP "Third Dynasty of Ur" (Utu-hegal of Uruk ruled about eight years before Ur-Namma)' },
  { id: 'E13c2', op: 'retime', match: 'Sumerian City-States@-2100', to: -2113, source: 'WP "Third Dynasty of Ur"', why: 'Bridges −2119…−2113 with Cliopatria\'s own city-state row (Uruk, Lagash).' },
  { id: 'E13d', op: 'add', name: 'Third Dynasty of Ur', from: -2112, to: -2004, geometry: 'row:Akkadian Empire@-2200', approx: true, wp: 'Third Dynasty of Ur', qid: 'Q723587',
    source: 'WP "Third Dynasty of Ur" (2112/0 – 2004/3 BC; core of about twenty provinces in Sumer and Akkad, Susiana controlled)', why: 'Missing in Cliopatria (Ur shows "Gutian"). The late-Akkadian core (297k km²: Sumer, Akkad, Susiana) is the closest Cliopatria shape; the Zagros periphery is not drawn.' },
  { id: 'E13e', op: 'retime', match: 'Sumerian City-States@-2000', from: -2003, source: 'WP "Isin-Larsa period" (after the fall of Ur, c. 2004 BC)' },

  /* ============================================================ E14 Italy 476–493 */
  { id: 'E14a', op: 'add', name: 'Kingdom of Odoacer', from: 476, to: 493, priority: 0, approx: true, wp: 'Odoacer', qid: 'Q3755547',
    geometry: { union: [{ minus: [{ intersect: ['row:Western Roman Empire@469', { bbox: [6.6, 36, 20, 48] }] }, 'ne:FRA'] }, { intersect: ['row:Vandal Kingdom@469', { bbox: [12, 36.4, 15.8, 38.4] }] }] },
    source: 'WP "Odoacer" (Romulus Augustulus deposed 4 Sep 476; Sicily ceded by Gaiseric 476; Dalmatia taken 480–482; Noricum evacuated 488; killed 15 Mar 493)',
    why: 'Italy is empty 476–499. Italy, Noricum, Raetia and Dalmatia from the last Western Roman row (Provence, ceded to the Visigoths in 476/477, cut off with Natural Earth France), plus Sicily from the Vandal row. Priority 0 so the newer Ostrogoth rows take northern Italy from 490 (Theoderic\'s war 489–493).' },
  { id: 'E14b', op: 'retime', match: 'Ostrogoths@490', to: 492, source: 'WP "Ostrogothic Kingdom" (493–553)' },
  { id: 'E14c', op: 'retime', match: 'Ostrogothic Kingdom@500', from: 493, source: 'WP "Ostrogothic Kingdom" (Theoderic king of Italy from 493)', why: 'Without it Italy south of the Po is empty 494–499.' },

  /* ============================================================ E15 Alexander */
  ...[-331, -326].map((y) => ({
    id: `E15@${y}`, op: 'rename', match: `Ptolemaic Kingdom@${y}`, name: 'Macedonian Empire', memberOf: '(Macedonian Empire)', wp: 'Macedonia (ancient kingdom)', qid: 'Q83958',
    source: 'WP "Wars of Alexander the Great" (Egypt 332 BC); "Ptolemaic Kingdom" (Ptolemy satrap from 323, king from 305 BC)',
    why: 'Alexander\'s conquests (−331…−324, up to 4.8 M km²) are labelled "Ptolemaic Kingdom". The frame dissolve merges them with the 218k Macedonian Empire row of the same span.',
  })),

  /* ============================================================ E16 Merovingians 661–665 */
  { id: 'E16a', op: 'delete', match: 'Kingdom of the Franks@661', source: 'Cliopatria\'s own neighbouring rows', why: 'The 661–665 row has 0 km² (both composites too).' },
  { id: 'E16b', op: 'retime', match: 'Kingdom of the Franks@644', to: 665, source: 'Cliopatria\'s own neighbouring rows (644 and 666 rows are the same 133k shape)' },

  /* ============================================================ E17 frame-year rounding */
  { id: 'E17a', op: 'retime', match: 'First Bulgarian Empire@682', from: 681, source: 'WP "First Bulgarian Empire" (681, treaty with Byzantium)' },
  { id: 'E17b', op: 'retime', match: 'Second Bulgarian Empire@1188', from: 1185, source: 'WP "Second Bulgarian Empire" (uprising of Asen and Peter, 1185)' },
  { id: 'E17c', op: 'retime', match: 'Ottoman Empire@1305', from: 1299, source: 'WP "Ottoman Empire" (founded c. 1299)' },
  { id: 'E17d', op: 'retime', match: 'Mughal Empire@1529', from: 1526, source: 'WP "Mughal Empire" (1526); "First Battle of Panipat" (21 Apr 1526)' },
  { id: 'E17e', op: 'retime', match: 'Lodi Dynasty@1521', to: 1525, source: 'WP "Lodi dynasty" (ended at Panipat, 1526)', why: 'Otherwise the 1526–1528 Lodi row beats the retimed Mughal row (equal FromYear, smaller area).' },
  { id: 'E17f', op: 'delete', match: 'Lodi Dynasty@1526', source: 'WP "First Battle of Panipat"' },
  { id: 'E17g', op: 'rename', match: 'Communist Party of China@1949', name: "People's Republic of China", wp: 'China', qid: 'Q148', source: 'WP "People\'s Republic of China" (proclaimed 1 Oct 1949)', why: 'The CCP-held area of 1949; Cliopatria\'s PRC row starts 1950.' },
  // Decolonisation: Cliopatria starts most successor states at its next frame year (1961, 1963, 1967, 1969, 1973, 1976, 1979).
  ...[
    ['Ghana@1958', 1957, 'Ghana', 'independence 6 Mar 1957'],
    ['Guinea@1960', 1958, 'Guinea', 'independence 2 Oct 1958'],
    ['Federal Republic of Nigeria@1961', 1960, 'Nigeria', 'independence 1 Oct 1960'],
    ['Republic of Senegal@1961', 1960, 'Senegal', 'independence 20 Aug 1960'],
    ["Republic of Côte d'Ivoire@1961", 1960, 'Ivory Coast', 'independence 7 Aug 1960'],
    ['Republic of Chad@1961', 1960, 'Chad', 'independence 11 Aug 1960'],
    ['Republic of Benin@1961', 1960, 'Benin', 'independence as Dahomey, 1 Aug 1960'],
    ['Mauritania@1961', 1960, 'Mauritania', 'independence 28 Nov 1960'],
    ['Burkina Faso@1961', 1960, 'Burkina Faso', 'independence as Upper Volta, 5 Aug 1960'],
    ['Republic of the Niger@1961', 1960, 'Niger', 'independence 3 Aug 1960'],
    ['Gabon@1961', 1960, 'Gabon', 'independence 17 Aug 1960'],
    ['Republic of the Congo@1961', 1960, 'Republic of the Congo', 'independence 15 Aug 1960'],
    ['Central African Republic@1961', 1960, 'Central African Republic', 'independence 13 Aug 1960'],
    ['Republic of Cyprus@1961', 1960, 'Cyprus', 'independence 16 Aug 1960'],
    ['Republic of Uganda@1963', 1962, 'Uganda', 'independence 9 Oct 1962'],
    ['Republic of Rwanda@1963', 1962, 'Rwanda', 'independence 1 Jul 1962'],
    ['Republic of Burundi@1963', 1962, 'Burundi', 'independence 1 Jul 1962'],
    ['Malawi@1967', 1964, 'Malawi', 'independence 6 Jul 1964'],
    ['Zambia@1967', 1964, 'Zambia', 'independence 24 Oct 1964'],
    ['Malta@1967', 1964, 'Malta', 'independence 21 Sep 1964'],
    ['Republic of The Gambia@1967', 1965, 'The Gambia', 'independence 18 Feb 1965'],
    ['Rhodesia@1967', 1965, 'Rhodesia', 'UDI 11 Nov 1965'],
    ['Republic of Botswana@1967', 1966, 'Botswana', 'independence 30 Sep 1966'],
    ['Lesotho@1967', 1966, 'Lesotho', 'independence 4 Oct 1966'],
    ["People's Democratic Republic of Yemen@1969", 1967, 'South Yemen', 'independence 30 Nov 1967'],
    ['Eswatini@1969', 1968, 'Eswatini', 'independence as Swaziland, 6 Sep 1968'],
    ['Equatorial Guinea@1969', 1968, 'Equatorial Guinea', 'independence 12 Oct 1968'],
    ['Kingdom of Bahrain@1973', 1971, 'Bahrain', 'independence 15 Aug 1971'],
    ['State of Qatar@1973', 1971, 'Qatar', 'independence 3 Sep 1971'],
    ['United Arab Emirates@1973', 1971, 'United Arab Emirates', 'independence 2 Dec 1971'],
    ['Mozambique@1976', 1975, 'Mozambique', 'independence 25 Jun 1975'],
    ['Republic of Cabo Verde@1976', 1975, 'Cape Verde', 'independence 5 Jul 1975'],
    ['São Tomé and Príncipe@1976', 1975, 'São Tomé and Príncipe', 'independence 12 Jul 1975'],
    ["People's Republic of Angola@1976", 1975, 'Angola', 'independence 11 Nov 1975'],
    ['Republic of Djibouti@1979', 1977, 'Djibouti', 'independence 27 Jun 1977'],
    ['Republic of Zimbabwe@1983', 1980, 'Zimbabwe', 'independence 18 Apr 1980'],
    ['Kingdom of Libya@1953', 1952, 'Libya', '24 Dec 1951; year rule: from 1952'],
    ['Kingdom of Jordan@1947', 1946, 'Jordan', 'independence 25 May 1946'],
    ['Kingdom of Iraq@1947', 1946, 'Kingdom of Iraq', 'sovereign since 1932; Cliopatria has no row for 1946'],
  ].map(([match, from, title, detail]) => ({ id: `E17:${match}`, op: 'retime', match, from, source: `WP "${title}" (${detail})` })),
  { id: 'E17h', op: 'retime', match: 'Zimbabwe Rhodesia@1979', to: 1979, source: 'WP "Zimbabwe Rhodesia" (Jun–Dec 1979)' },
  { id: 'E17i', op: 'retime', match: 'Sultanate of Zanzibar@1963', to: 1963, source: 'WP "Sultanate of Zanzibar"; "Tanzania" (union 26 Apr 1964)' },
  { id: 'E17j', op: 'retime', match: 'Democratic Republic of the Congo@1967', to: 1970, source: 'WP "Zaire" (renamed 27 Oct 1971)' },
  { id: 'E17k', op: 'retime', match: 'Zaire@1973', from: 1971, source: 'WP "Zaire" (27 Oct 1971 – 17 May 1997)' },
  { id: 'E17l', op: 'retime', match: 'Zaire@1992', to: 1996, source: 'WP "Zaire" (to 17 May 1997)' },
  { id: 'E17m', op: 'retime', match: 'Democratic Republic of the Congo@1996', from: 1997, source: 'WP "Democratic Republic of the Congo" (renamed 17 May 1997)' },

  /* ============================================================ E18 odd names */
  { id: 'E18a', op: 'rename', match: { name: 'Argentine Confederation', from: 1861 }, name: 'Argentine Republic', wp: 'Argentina', qid: 'Q414',
    source: 'WP "Argentine Confederation" (1831–1861; Battle of Pavón 17 Sep 1861, Buenos Aires reunited 12 Dec 1861; successor "Argentine Republic")', why: 'Cliopatria uses the name until 1929; its rows from 1930 are already "Argentine Republic", so the entity runs on.' },
  { id: 'E18b', op: 'rename', match: 'Federated Republic of Germany', name: 'Federal Republic of Germany', wp: 'Germany', qid: 'Q183', source: 'WP "Germany"', why: 'Typo in Cliopatria (1991–2024); same entity as West Germany 1949–1990.' },
  { id: 'E18c', op: 'rename', match: { name: 'Denmark-Norway', from: 1814 }, name: 'Denmark', wp: 'Denmark', qid: 'Q35', source: 'WP "Denmark–Norway" (dissolved by the Treaty of Kiel, 14 Jan 1814)', why: 'Cliopatria uses "Denmark-Norway" until 1940.' },
  { id: 'E18d', op: 'rename', match: 'Mali Federation', name: 'Republic of Mali', wp: 'Mali', qid: 'Q912', source: 'WP "Mali Federation" (Jun–Aug 1960); "Mali" (Republic of Mali 22 Sep 1960)', why: 'Cliopatria keeps the federation\'s name to 2024.' },
  { id: 'E18e', op: 'rename', match: { name: 'Burkina Faso', from: 1958, to: 1983 }, name: 'Republic of Upper Volta', wp: 'Republic of Upper Volta', qid: 'Q797422', source: 'WP "Republic of Upper Volta" (1958 – renamed 4 Aug 1984)' },
  { id: 'E18f', op: 'rename', match: { name: 'Republic of Benin', from: 1958, to: 1974 }, name: 'Republic of Dahomey', wp: 'Republic of Dahomey', qid: 'Q798431', source: 'WP "Republic of Dahomey" (1958 – renamed 30 Nov 1975)' },
  { id: 'E18g', op: 'rename', match: { name: 'Eswatini', from: 1968, to: 2017 }, name: 'Swaziland', wp: 'Eswatini', qid: 'Q1050', source: 'WP "Eswatini" (renamed 19 Apr 2018)', why: 'One entity with the protectorate pieces and Cliopatria\'s 1885–1907 Swaziland rows.' },
  { id: 'E18h', op: 'rename', match: { name: 'Tanzania', from: 1961, to: 1963 }, name: 'Tanganyika', wp: 'Tanganyika', qid: 'Q397029', source: 'WP "Tanganyika" (9 Dec 1961 – union with Zanzibar 26 Apr 1964)' },
  { id: 'E18i', op: 'rename', match: { name: 'South Africa', from: 1932, to: 1960 }, name: 'Union of South Africa', wp: 'Union of South Africa', qid: 'Q193619', source: 'WP "Union of South Africa" (1910 – republic 31 May 1961)' },
  { id: 'E18j', op: 'rename', match: { name: 'Belgian Congo', from: 1885, to: 1907 }, name: 'Congo Free State', wp: 'Congo Free State', source: 'WP "Congo Free State" (1885 – annexed by Belgium 15 Nov 1908)', why: 'Cliopatria calls Leopold II\'s state "Belgian Congo" from 1890.' },

  /* ============================================================ E19 sensitive modern labels (editorial pass, rule in the header) */
  { id: 'E19a', op: 'add', name: 'Transnistria', from: 1992, to: MAX, geometry: { intersect: ['row:Russian-occupied territories@1992', { bbox: [27.5, 46.5, 30.6, 48.5] }] }, approx: false, wp: 'Transnistria', qid: 'Q907112',
    source: 'WP "Transnistria" (de facto since the 1992 war; unrecognised; Russian troops present)', why: 'Cliopatria labels three separate areas "Russian-occupied territories". Its Dniester piece is Transnistria; neutral name.' },
  { id: 'E19b', op: 'add', name: 'Republic of Moldova', from: 1992, to: MAX, geometry: { intersect: ['row:Russian-occupied territories@1992', { bbox: [27.5, 45.3, 29.6, 46.5] }] }, approx: false, wp: 'Moldova', qid: 'Q217',
    source: 'WP "Gagauzia" (autonomous region of Moldova since 1994/1995)', why: 'Error: Cliopatria\'s southern Moldovan pieces (Comrat, about 1,400 km²) are Gagauzia, which is not occupied. Returned to Moldova.' },
  { id: 'E19c', op: 'add', name: 'South Ossetia', from: 1992, to: MAX, geometry: { intersect: ['row:Russian-occupied territories@1992', { bbox: [40, 41.5, 47, 44] }] }, approx: true, wp: 'South Ossetia', qid: 'Q23427',
    source: 'WP "South Ossetia" (de facto since the 1991–1992 war; recognised by Russia and four others; Georgia and most states regard it as Russian-occupied)', why: 'Cliopatria\'s Georgian piece (1,500 km², northern South Ossetia). Neutral name. Abkhazia, also de facto independent, is drawn by Cliopatria as Georgia and left so (FOLLOW_UPS).' },
  { id: 'E19d', op: 'delete', match: 'Russian-occupied territories', source: 'E19a–c', why: 'Replaced by the three entities above.' },
  { id: 'E19e', op: 'add', name: 'Crimea', from: 2014, to: MAX, geometry: { intersect: ['row:Russian Federation@2014', 'row:Ukraine@1992'] }, approx: false, wp: 'Crimea', qid: 'Q7835',
    source: 'WP "Annexation of Crimea by the Russian Federation" (Mar 2014); UN GA resolution 68/262', why: 'Cliopatria draws Crimea as Russian Federation from 2014 (and as both Russia and Ukraine in 2014–2023). The annexation is not recognised by most states; own entity, neutral name. Russian-held mainland Ukraine after 2022 is not drawn by Cliopatria.' },
  { id: 'E19f', op: 'add', name: 'Nagorno-Karabakh', from: 1992, to: 1995, geometry: 'row:Republic of Armenia@1992 & ne:AZE', approx: true, wp: 'Republic of Artsakh', qid: 'Q244165',
    source: 'WP "Republic of Artsakh" (1991 – Azerbaijani offensive Sep 2023, dissolved 1 Jan 2024); "Nagorno-Karabakh"', why: 'Cliopatria draws the Armenian-held part of Azerbaijan as "Republic of Armenia". De facto state, de jure Azerbaijan; neutral geographic name.' },
  { id: 'E19g', op: 'add', name: 'Nagorno-Karabakh', from: 1996, to: 2022, geometry: 'row:Republic of Armenia@1996 & ne:AZE', approx: true, wp: 'Republic of Artsakh', qid: 'Q244165',
    source: 'WP "Republic of Artsakh"; "Second Nagorno-Karabakh War" (Nov 2020)', why: 'Includes the surrounding districts held 1994–2020; the Nov 2020 losses are not in Cliopatria (FOLLOW_UPS).' },
  { id: 'E19h', op: 'reshape', match: { name: 'Republic of Armenia', from: 2023, to: 2023 }, geometry: 'row:Republic of Armenia@1996 & ne:ARM', priority: 0, source: 'WP "2023 Azerbaijani offensive in Nagorno-Karabakh" (19–20 Sep 2023)' },
  { id: 'E19i', op: 'reshape', match: { name: 'Republic of Armenia', from: 2024, to: MAX }, geometry: 'row:Republic of Armenia@2024 & ne:ARM', priority: 0, source: 'WP "Republic of Artsakh" (dissolved 1 Jan 2024)', why: 'Cliopatria\'s 2024 row still includes Nagorno-Karabakh.' },
  { id: 'E19j', op: 'add', name: 'Republic of Azerbaijan', from: 2023, to: 2023, geometry: 'row:Republic of Armenia@1996 & ne:AZE', approx: true, wp: 'Azerbaijan', qid: 'Q227', source: 'WP "2023 Azerbaijani offensive in Nagorno-Karabakh"' },
  { id: 'E19k', op: 'add', name: 'Republic of Azerbaijan', from: 2024, to: MAX, geometry: 'row:Republic of Armenia@2024 & ne:AZE', approx: true, wp: 'Azerbaijan', qid: 'Q227', source: 'WP "Republic of Artsakh" (dissolved 1 Jan 2024)' },
  { id: 'E19l', op: 'add', name: 'West Bank', from: 1967, to: MAX, geometry: { minus: [{ intersect: ['row:State of Israel@2024', 'ne:PSE'] }, GAZA_BOX] }, approx: true, wp: 'West Bank', qid: 'Q36678',
    source: 'WP "West Bank" (Jordanian 1948/50–1967; Israeli-occupied since the Six-Day War; Oslo Areas A and B under the Palestinian Authority since 1994–95; East Jerusalem annexed by Israel, not recognised)', why: 'Cliopatria draws the West Bank as "State of Israel" from 1967. Neutral geographic name; Natural Earth\'s Palestine unit (includes East Jerusalem).' },
  { id: 'E19m', op: 'add', name: 'Gaza Strip', from: 1949, to: MAX, geometry: { intersect: ['ne:PSE', GAZA_BOX] }, approx: true, wp: 'Gaza Strip', qid: 'Q39760',
    source: 'WP "Gaza Strip" (1949 armistice line; Egyptian administration 1949–1967 except Nov 1956 – Mar 1957; Israeli-occupied 1967; Israeli withdrawal 2005; Hamas control from 2007)', why: 'Cliopatria leaves Gaza empty in 1948–1955, 1958–1966 and 1983–2024 and draws it as Israel in 1956–1957 and 1967–1982.' },
  { id: 'E19n', op: 'add', name: 'Golan Heights', from: 1967, to: MAX, geometry: { intersect: ['row:State of Israel@2024', { bbox: [35.64, 32.68, 35.95, 33.34] }] }, approx: true, wp: 'Golan Heights', qid: 'Q83210',
    source: 'WP "Golan Heights" (Syrian until 1967; Israeli-occupied; annexed by Israel 1981, recognised only by the United States since 2019)', why: 'Cliopatria draws it as "State of Israel" from 1967. Natural Earth includes it in Israel, so it is cut by box (east of the Jordan and the Sea of Galilee, ±2 km).' },
  { id: 'E19o', op: 'rename', match: 'Turkish Republic of Northern Cyprus', name: 'Northern Cyprus', wp: 'Northern Cyprus', qid: 'Q23681',
    source: 'WP "Northern Cyprus" (Turkish Federated State 1975, TRNC proclaimed 15 Nov 1983; recognised only by Turkey)', why: 'Neutral name (the article title) for the whole span from 1976.' },
  { id: 'E19p', op: 'rename', match: { name: 'Kosovo', from: 2000, to: 2007 }, name: 'UN-administered Kosovo', wp: 'United Nations Interim Administration Mission in Kosovo', qid: 'Q504557',
    source: 'WP "United Nations Interim Administration Mission in Kosovo" (from 10 Jun 1999); "2008 Kosovo declaration of independence" (17 Feb 2008)', why: 'Cliopatria shows a Kosovo state from 2000. From 2008 "Kosovo" (partially recognised) is kept.' },
  { id: 'E19q', op: 'rename', match: { name: 'Republic of China', from: 1950 }, name: 'Republic of China', wp: 'Taiwan', qid: 'Q865',
    source: 'WP "Taiwan"', why: 'Name kept (official, continuous entity since 1912); the Wikipedia hint pointed at "Republic of China (1912–1949)".' },

  /* ============================================================ E20 visual QA (docs/border-hybrid-qa.md) */
  // Cliopatria's Byzantine row 1440–1467 keeps Constantinople and its Thracian hinterland (28.25–29.04 E) after the
  // conquest; the Ottoman rows of 1453–1467 leave that hole. The city part goes to the Ottoman rows from 1453.
  { id: 'E20a', op: 'reshape', match: { name: 'Byzantine Empire', from: 1453, to: 1467 }, geometry: { minus: ['row:Byzantine Empire@1440', { bbox: [27.8, 40.6, 29.6, 41.8] }] }, priority: 0,
    source: 'WP "Fall of Constantinople" (29 May 1453)', why: 'QA item 7: Constantinople showed as Byzantine until 1467. The Morea, the Aegean islands and the Trebizond piece stay as Cliopatria draws them.' },
  { id: 'E20b', op: 'reshape', match: 'Ottoman Empire@1453', geometry: { union: ['row:Ottoman Empire@1453', { intersect: ['row:Byzantine Empire@1440', { bbox: [27.8, 40.6, 29.6, 41.8] }] }] }, priority: 0,
    source: 'WP "Fall of Constantinople" (29 May 1453)', why: 'Fills the hole E20a leaves (about 2,000 km²).' },
  { id: 'E20c', op: 'reshape', match: 'Ottoman Empire@1459', geometry: { union: ['row:Ottoman Empire@1459', { intersect: ['row:Byzantine Empire@1440', { bbox: [27.8, 40.6, 29.6, 41.8] }] }] }, priority: 0,
    source: 'WP "Fall of Constantinople"', why: 'As E20b.' },
  { id: 'E20d', op: 'reshape', match: 'Ottoman Empire@1463', geometry: { union: ['row:Ottoman Empire@1463', { intersect: ['row:Byzantine Empire@1440', { bbox: [27.8, 40.6, 29.6, 41.8] }] }] }, priority: 0,
    source: 'WP "Fall of Constantinople"', why: 'As E20b.' },

  /* ============================================================ E21 follow-ups F2–F4, F6 (docs/border-hybrid-qa.md) */
  // Fact-check: Savoy was a duchy from 1416 (Sigismund raised Amadeus VIII); Cliopatria keeps "County of Savoy" to 1539.
  // Applied before E21a, which names the duchy rows as HRE members.
  { id: 'E21h1', op: 'rename', match: { name: 'County of Savoy', from: 1416, to: 1555 }, name: 'Duchy of Savoy', wp: 'Duchy of Savoy', qid: 'Q426025',
    source: 'WP "Duchy of Savoy" (created 1416 when Sigismund raised Amadeus VIII to duke); "County of Savoy"', why: 'Map label read "County of Savoy" in 1500.' },

  // Fact-check: Romania. Cliopatria keeps "United Principalities of Moldavia and Wallachia" to 1916.
  { id: 'E21h2', op: 'rename', match: { name: 'United Principalities of Moldavia and Wallachia', from: 1866, to: 1880 }, name: 'Principality of Romania', wp: 'United Principalities of Moldavia and Wallachia', qid: 'Q958291',
    source: 'WP "United Principalities of Moldavia and Wallachia" (the July 1866 constitution named the country Romania; independence 1877–78)', why: 'Map label read "United Principalities" in 1880.' },
  { id: 'E21h3', op: 'rename', match: { name: 'United Principalities of Moldavia and Wallachia', from: 1881, to: 1916 }, name: 'Kingdom of Romania', wp: 'Kingdom of Romania', qid: 'Q203493',
    source: 'WP "Kingdom of Romania" (Carol I crowned 25 Mar 1881)', why: 'Joins the existing Kingdom of Romania entity (1919–1947).' },

  // F2: the Holy Roman Empire in 1459–1555. Cliopatria marks only "Holy Roman Empire Minor States" as a member after
  // 1458, so the realm has one member and no outline or colour. These rows were members in 1450 (Bohemia, Habsburg,
  // Bavaria, Brandenburg, Savoy, Trier, Milan are marked there) or sit inside the Empire's imperial circles of 1500.
  // Not members: the Swiss Confederation from 1499 (Peace of Basel; de facto exempt), the Teutonic Order (Polish fief
  // from 1466), and the Duchy of Burgundy (French fief). The realm name is the one Cliopatria uses.
  ...[
    ['Duchy of Bavaria', 1459, 1555, '(Holy Roman Empire)'],
    ['Electorate of Brandenburg', 1459, 1555, '(Holy Roman Empire)'],
    ['Electorate of Saxony', 1459, 1555, '(Holy Roman Empire)'],
    ['House of Ascania', 1459, 1555, '(Holy Roman Empire)'],
    ['Electorate of Trier', 1459, 1555, '(Holy Roman Empire)'],
    ['Duchy of Savoy', 1459, 1555, '(Holy Roman Empire)'],
    ['Duchy of Lorraine', 1459, 1555, '(Holy Roman Empire)'],
    ['Duchy of Milan', 1459, 1555, '(Holy Roman Empire)'],
    ['Duchy of Styria', 1459, 1555, '(Holy Roman Empire)'],
    ['House of Habsburg', 1459, 1555, '(Holy Roman Empire)'],
    ['Habsburg Monarchy', 1459, 1555, '(Holy Roman Empire)'],
    ['Kingdom of Bohemia', 1459, 1555, '(Holy Roman Empire);(Kingdom of Bohemia)'],
    ['Swiss Confederation', 1459, 1498, '(Holy Roman Empire)'],
  ].map(([name, from, to, mo], i) => ({
    id: `E21a${i + 1}`, op: 'rename', match: { name, from, to }, name, memberOf: mo,
    source: 'WP "Holy Roman Empire" (imperial estates; Imperial Circles of 1500 and 1512); "Imperial Estates"; "Kingdom of Bohemia" (imperial elector); "Old Swiss Confederacy" (Peace of Basel, 22 Sep 1499)',
    why: 'F2: gives the Empire a realm outline and one colour in 1459–1555. Cliopatria drops the membership of these rows after 1458 although they were estates of the Empire.',
  })),

  // F3: names by period. Entity ids change, so content refs are repointed in the same commit (see docs).
  { id: 'E21b1', op: 'rename', match: { name: 'First Hellenic Republic', from: 1832, to: 1923 }, name: 'Kingdom of Greece', wp: 'Kingdom of Greece', qid: 'Q209065',
    source: 'WP "Kingdom of Greece" (1832–1924; Treaty of London 7 May 1832)', why: 'F3: Cliopatria calls 1822–1940 "First Hellenic Republic"; that republic is 1822–1832 (WP "First Hellenic Republic"). The row joins the existing Kingdom of Greece entity (1945–1966).' },
  { id: 'E21b2', op: 'rename', match: { name: 'First Hellenic Republic', from: 1924, to: 1934 }, name: 'Second Hellenic Republic', wp: 'Second Hellenic Republic', qid: 'Q265824',
    source: 'WP "Second Hellenic Republic" (proclaimed 25 Mar 1924; monarchy restored 10 Oct 1935)', why: 'F3. The monarchy returned in 1935, so the republic is drawn to 1934.' },
  { id: 'E21b3', op: 'rename', match: { name: 'First Hellenic Republic', from: 1935, to: 1940 }, name: 'Kingdom of Greece', wp: 'Kingdom of Greece', qid: 'Q209065',
    source: 'WP "Kingdom of Greece" (restored 1935 – Axis invasion Apr 1941)', why: 'F3.' },
  { id: 'E21c1', op: 'rename', match: 'Kingdom of Lithuania', name: 'Republic of Lithuania', wp: 'Lithuania', qid: 'Q37',
    source: 'WP "Lithuania" (Act of Independence 16 Feb 1918; the Kingdom of Lithuania was the short-lived Jul–Nov 1918 project; Soviet occupation Jun 1940)', why: 'F3: Cliopatria names 1919–1939 "Kingdom of Lithuania". It was a republic; the row joins the post-1990 entity.' },
  { id: 'E21c2', op: 'alias', old: 'Kingdom of Lithuania', new: 'Republic of Lithuania' },
  { id: 'E21d1', op: 'rename', match: { name: 'Serbian Empire', from: 1375, to: 1401 }, name: 'Moravian Serbia', wp: 'Moravian Serbia', qid: 'Q2273304',
    source: 'WP "Moravian Serbia" (1371–1402, Prince Lazar); "Serbian Empire" (ended with Uroš V, Dec 1371)', why: 'F3: Cliopatria keeps the name "Serbian Empire" to 1458. The empire fell apart in 1371; the Morava lands (46–51k km², not Dušan\'s 185k) were Lazar\'s principality. The row 1363–1374 still has Dušan\'s 185k km² shape and keeps its name (the 1375 row is the first with the small shape).' },
  { id: 'E21d2', op: 'rename', match: { name: 'Serbian Empire', from: 1402, to: 1458 }, name: 'Serbian Despotate', wp: 'Serbian Despotate', qid: 'Q878319',
    source: 'WP "Serbian Despotate" (Stefan Lazarević made despot 1402; Smederevo fell 20 Jun 1459)', why: 'F3. The separate Cliopatria entity "Serbian Despots" (west of the Morava, to 1421) is left as it is.' },
  { id: 'E21e1', op: 'rename', match: { name: 'Yugoslavia', from: 1919, to: 1928 }, name: 'Kingdom of Serbs, Croats and Slovenes', wp: 'Kingdom of Serbs, Croats and Slovenes', qid: 'Q15102440',
    source: 'WP "Kingdom of Yugoslavia" (proclaimed 1 Dec 1918; renamed 3 Oct 1929)', why: 'F3: Cliopatria calls 1919–1940 "Yugoslavia".' },
  { id: 'E21e2', op: 'rename', match: { name: 'Yugoslavia', from: 1929, to: 1940 }, name: 'Kingdom of Yugoslavia', wp: 'Kingdom of Yugoslavia', qid: 'Q191077',
    source: 'WP "Kingdom of Yugoslavia" (renamed 3 Oct 1929; invaded 6 Apr 1941)' },
  { id: 'E21e3', op: 'rename', match: { name: 'Yugoslavia', from: 1945, to: 1945 }, name: "Federal People's Republic of Yugoslavia", wp: "Federal People's Republic of Yugoslavia", qid: 'Q1290149',
    source: "WP \"Federal People's Republic of Yugoslavia\" (proclaimed 29 Nov 1945; renamed Socialist Federal Republic 7 Apr 1963)", why: 'F3: year rule (29 Nov 1945 is more than two weeks before year end).' },
  { id: 'E21e4', op: 'rename', match: { name: 'Socialist Federal Republic of Yugoslavia', from: 1946, to: 1962 }, name: "Federal People's Republic of Yugoslavia", wp: "Federal People's Republic of Yugoslavia", qid: 'Q1290149',
    source: 'WP "Federal People\'s Republic of Yugoslavia"; "Socialist Federal Republic of Yugoslavia" (name from the constitution of 7 Apr 1963)', why: 'F3: Cliopatria uses the 1963 name from 1946.' },
  { id: 'E21e5', op: 'alias', old: 'Yugoslavia', new: 'Kingdom of Yugoslavia' },
  { id: 'E21f1', op: 'rename', match: { name: "People's Socialist Republic of Albania", from: 1946, to: 1976 }, name: "People's Republic of Albania", wp: "People's Socialist Republic of Albania", qid: 'Q467864',
    source: "WP \"People's Socialist Republic of Albania\" (People's Republic 11 Jan 1946; renamed 28 Dec 1976, so the new name applies from 1977)", why: 'F3: Cliopatria uses the 1976 name from 1946.' },
  { id: 'E21f2', op: 'rename', match: { name: 'Albania', from: 1925, to: 1927 }, name: 'Albanian Republic', wp: 'Albanian Republic (1925–1928)', qid: 'Q1923781',
    source: 'WP "Albanian Republic (1925–1928)" (proclaimed 21 Jan 1925; Zog crowned 1 Sep 1928)', why: 'F3.' },
  { id: 'E21f3', op: 'rename', match: { name: 'Albania', from: 1928, to: 1938 }, name: 'Albanian Kingdom', wp: 'Albanian Kingdom (1928–1939)', qid: 'Q1048340',
    source: 'WP "Albanian Kingdom (1928–1939)" (1 Sep 1928 – Italian invasion 7 Apr 1939)', why: 'F3.' },
  { id: 'E21f4', op: 'rename', match: { name: 'Albania', from: 1944, to: 1945 }, name: 'Democratic Government of Albania', wp: 'Democratic Government of Albania', qid: 'Q12100005',
    source: 'WP "Democratic Government of Albania" (Oct 1944 – 11 Jan 1946)', why: 'F3.' },

  // F4: data gaps with a small sourced fix.
  { id: 'E21g1', op: 'add', name: 'Slovak Republic', from: 1939, to: 1944, geometry: { minus: ['ne:SVK', { intersect: ['row:Hungarian Republic@1939', { bbox: [17.5, 47.5, 23.0, 49.2] }] }] }, approx: true, wp: 'Slovak Republic (1939–1945)', qid: 'Q154401',
    source: 'WP "Slovak Republic (1939–1945)" (14 Mar 1939 – 4 Apr 1945); "First Vienna Award" (2 Nov 1938); "Slovak–Hungarian War" (Mar 1939)', why: 'F4: Cliopatria has no Slovakia 1939–1944; Bratislava is drawn as Hungary and the rest as Nazi Germany. Modern Slovakia minus the area Cliopatria\'s 1939 Hungarian row holds east of 17.5 E (Vienna Award south and the March 1939 strip). Approximate: Petržalka went to Germany in 1938, and Orava and Spiš to Poland.' },
  { id: 'E21g2', op: 'add', name: 'Kingdom of Kent', from: 692, to: 704, geometry: 'row:Kingdom of Kent@534', memberOf: '(Anglo-Saxon England)', approx: true, wp: 'Kingdom of Kent', qid: 'Q328818',
    source: 'WP "Wihtred of Kent" (king of Kent c. 690/691–725); "Kingdom of Kent"', why: 'F4: Cliopatria has Kent 490–691 and again from 705; Wessex covers it in between. Wessex held Kent only briefly under Caedwalla (686–687); Wihtred ruled it independently. Priority 1 puts the 534 shape over the Wessex rows.' },
  { id: 'E21g3', op: 'reshape', match: { name: 'Crown of Castile', from: 1494, to: 1496 }, geometry: { union: ['row:Crown of Castile@1492', { intersect: ['row:Crown of Castile@1507', { bbox: [-74.6, 17.4, -68.2, 20.1] }] }] }, priority: 0, approx: true,
    source: 'WP "La Isabela" (founded Jan 1494); "Santo Domingo" (1496–1498); "Hispaniola"', why: 'F4: Hispaniola is empty before 1502 in Cliopatria although Castile held settlements there from 1493 (La Navidad, La Isabela, Santo Domingo). The island piece is taken from the 1507 row; effective control of the west and east ended only in 1503–1504, so approximate.' },
  { id: 'E21g4', op: 'reshape', match: { name: 'Crown of Castile', from: 1497, to: 1501 }, geometry: { union: ['row:Crown of Castile@1497', { intersect: ['row:Crown of Castile@1507', { bbox: [-74.6, 17.4, -68.2, 20.1] }] }] }, priority: 0, approx: true,
    source: 'WP "Santo Domingo"; "Nicolás de Ovando" (governor from 1502); "Francisco de Bobadilla" (governor 1500–1502)', why: 'As E21g3.' },
  { id: 'E21g5', op: 'retime', match: 'Ming Dynasty@1375', from: 1368, source: 'WP "Ming dynasty" (proclaimed at Nanjing 23 Jan 1368; Dadu taken 14 Sep 1368)', why: 'F4: the Ming milestone of 1368 had no border. The 1375 shape is used from 1368; Yunnan fell only in 1381–1382, so 1368–1374 is generous in the south-west.' },
  { id: 'E21g6', op: 'add', name: 'Sasanian Empire', from: 644, to: 651, geometry: { intersect: ['row:Sasanian Empire@641', { bbox: [53.0, 24.0, 80.0, 41.0] }] }, approx: true, wp: 'Sasanian Empire', qid: 'Q83891',
    source: 'WP "Sasanian Empire" (224–651); "Yazdegerd III" (retreated east, murdered near Merv in 651); "Muslim conquest of Persia" (Fars 650, Khorasan 651)', why: 'F4: Cliopatria\'s last Sasanian row is 641–643 and the Rashidun rows cover the rest. The part of the 641 shape east of 53 E (Khorasan and the east) is kept to 651 at priority 1. Approximate: the exact extent after 644 is not known.' },

]

/**
 * Problems seen while checking the rows that the 19 corrections do not fix. Not applied; for the fact-check, the
 * visual QA and later releases of this table.
 */
export const FOLLOW_UPS = [
  'USSR rows 1946–1947 hold Manchuria (1.29 M km²); Soviet troops left in May 1946 (WP "Soviet invasion of Manchuria"). 1947 should be Republic of China / CCP.',
  'USSR rows 1945–1946 hold north-western Iran (177k km²) and British Africa 1943–1945 the south; WP "Anglo-Soviet invasion of Iran" — Iran stayed sovereign (the British part is renamed in colonies.mjs, the Soviet part is not).',
  'USA 1945 row holds Greenland and Iceland (US garrisons; Iceland a republic from 17 Jun 1944).',
  'Burgundian Kingdom ends in 660 with no successor row; the Frankish realm shrinks from 625k to 133k km² from 661.',
  'British Africa 1905–1929 holds 585k km² of eastern Libya (Ottoman, then Italian). Left with the blob name.',
  'Western Sahara is empty from 1976 (no Moroccan, Mauritanian or SADR row); WP "Western Sahara".',
  'Abkhazia (de facto since 1993) and Somaliland (since 1991) are drawn as Georgia and Somalia; E19 leaves them (no occupier name involved).',
  'Nagorno-Karabakh 2021–2022: the districts returned to Azerbaijan in Nov 2020 are still inside the 1996 shape.',
  'Amami Islands 1945–1953 and Palau (US trust territory to 1994) are not drawn after the USA cut.',
  'Portuguese Colonies blob (32 rows) and British Colonial Empire blob (90 rows) are not split (outside Africa or not in the plan).',
  'Germany 1990: Cliopatria shows both German states for 1990 (reunification 3 Oct 1990).',
  'Asian and Caribbean independence years (Indonesia, Burma, Malaysia, …) were not reviewed for frame-year rounding.',
  'Colony of Natal 1910: Natal shows as a colony for all of 1910 (Union from 31 May 1910).',
  'Eritrea: Cliopatria starts the State of Eritrea in 1992 (de facto 1991, independent 24 May 1993).',
]

/* ------------------------------------------------------------------ self-check CLI */

/**
 *   node scripts/data/clio/corrections.mjs --check [--golden-only]
 *
 * Runs CORRECTIONS + COLONIES through apply-corrections.mjs on the cached raw rows (.cache/hist/rows-raw.json, from
 * fetch.mjs), prints every entry's effect and every warning, then probes golden.json against the corrected rows
 * BEFORE coast growth (points marked `coastal` may legitimately miss here). Exit 1 on warnings or a failed probe.
 * Writes nothing.
 */
async function check() {
  const { readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const T = await import('@turf/turf')
  const { ROWS_RAW_FILE, CLIO_DIR } = await import('./lib.mjs')
  const { applyCorrections } = await import('./apply-corrections.mjs')
  const { COLONIES } = await import('./colonies.mjs')
  const raw = JSON.parse(await readFile(ROWS_RAW_FILE, 'utf8'))
  const t0 = Date.now()
  const { rows, report, warnings } = await applyCorrections(raw, { corrections: CORRECTIONS, colonies: COLONIES })
  if (!process.argv.includes('--golden-only')) for (const r of report) console.log(`${String(CORRECTIONS[r.i]?.id ?? r.i).padEnd(34)} ${r.op.padEnd(8)} ${r.note}`)
  console.log(`\n${rows.length} rows after corrections (${raw.rows.length} raw), ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  for (const w of warnings) console.log(`WARNING ${w}`)
  // golden probes: the overlap rule of plan §1.2 (priority desc, newer FromYear, smaller area)
  const golden = JSON.parse(await readFile(join(CLIO_DIR, 'golden.json'), 'utf8')).lookups
  let failed = 0
  for (const g of golden) {
    const pt = [g.lng, g.lat]
    const hits = rows
      .filter((r) => r.from <= g.year && g.year <= r.to && r.geom && T.booleanPointInPolygon(pt, { type: 'Feature', properties: {}, geometry: r.geom }))
      .sort((a, b) => b.priority - a.priority || b.from - a.from || a.km2 - b.km2)
    const top = hits[0]?.name ?? null
    const ok = g.not ? top !== g.not : top === g.expect
    const soft = !ok && g.coastal && top == null
    if (!ok && !soft) failed++
    console.log(`${ok ? 'ok  ' : soft ? 'coast' : 'FAIL'} ${g.place} ${g.year}: ${top ?? '—'}${ok ? '' : `  (expected ${g.not ? `not ${g.not}` : g.expect})`}${hits.length > 1 ? `  [also ${hits.slice(1).map((h) => h.name).join(', ')}]` : ''}`)
  }
  console.log(`\n${golden.length - failed}/${golden.length} golden lookups pass (before coast growth), ${warnings.length} warnings`)
  if (failed || warnings.length) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv.includes('--check')) {
  check().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
