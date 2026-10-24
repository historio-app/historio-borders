#!/usr/bin/env node
/**
 * Natural Earth admin-1 building blocks for the corrections table (docs/border-hybrid-plan.md §1.2, builder B).
 *
 * Pure data plus a self-check. Every geometry here is either a Natural Earth 10 m admin-1 unit (public domain,
 * cached by `node scripts/data/clio/fetch.mjs --ne`) or an authored polygon written below. Nothing reads
 * historical-basemaps (licence firewall: state files stay CC BY 4.0).
 *
 * The specs use the geometry-source grammar of apply-corrections.mjs:
 *   'ne1:Name+Name'  admin-1 units matched on name / name_en / name_local / postal / gn_name (case-insensitive).
 *                    Only names that are unique world-wide are used here (checked by the CLI below).
 *   { union:[…] } { intersect:[…] } { minus:[a, b] } { bbox:[w,s,e,n] } and bare GeoJSON polygons.
 *
 *   node scripts/data/clio/ne-admin1.mjs      prints every zone's area and the test points inside each zone
 *
 * Sources for the zone composition:
 *   WP "Allied-occupied Germany" (zones by Land; Lindau district and the Rhine Palatinate French; Bremen and
 *   Bremerhaven a US enclave; the Saar detached from the French zone on 16 Feb 1946),
 *   WP "Württemberg-Baden" (US part of Württemberg and Baden, created 19 Sep 1945; its southern border was drawn so
 *   that the Karlsruhe–Munich autobahn, today's A8, lay wholly in the US zone),
 *   WP "West Berlin" / "East Berlin" (sector boundary 1949–1990).
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The 1945 boundary between the US zone (Württemberg-Baden) and the French zone (Württemberg-Hohenzollern, South
 * Baden), approximated as a line just south of the Karlsruhe–Stuttgart–Ulm autobahn: south of the Karlsruhe and
 * Pforzheim districts, around the (French) Calw district, then south of the Böblingen, Nürtingen, Göppingen and Ulm
 * districts. The polygon is everything NORTH of that line (US side) in a box around Baden-Württemberg; it is only
 * ever intersected with the Baden-Württemberg admin-1 unit. Accuracy about ±10 km, hence `approx` on every zone.
 * Checked cities: US side Karlsruhe, Ettlingen, Pforzheim, Stuttgart, Leonberg, Böblingen, Herrenberg, Esslingen,
 * Nürtingen, Kirchheim, Göppingen, Geislingen, Ulm, Heilbronn, Mannheim, Heidelberg; French side Rastatt,
 * Baden-Baden, Gernsbach, Calw, Freudenstadt, Tübingen, Reutlingen, Ehingen, Freiburg, Konstanz.
 */
export const WURTTEMBERG_BADEN_US = {
  type: 'Polygon',
  coordinates: [
    [
      [7.3, 48.93],
      [8.3, 48.92],
      [8.45, 48.87],
      [8.55, 48.85],
      [8.8, 48.8],
      [8.85, 48.56],
      [9.1, 48.58],
      [9.55, 48.52],
      [9.85, 48.45],
      [10.1, 48.3],
      [10.8, 48.3],
      [10.8, 50.0],
      [7.3, 50.0],
      [7.3, 48.93],
    ],
  ],
}

/** Lindau district (Bavaria) was in the French zone to link it with French Württemberg. Box ∩ Bavaria only. */
export const LINDAU_BOX = { bbox: [9.5, 47.45, 9.99, 47.76] }

/**
 * West Berlin (American, British and French sectors), 1949–1990: the part of the Berlin Land west of an authored
 * line along the sector boundary (Frohnau/Reinickendorf–Pankow, Wedding–Mitte at Bernauer Straße, Tiergarten–Mitte
 * at the Brandenburg Gate, Kreuzberg–Mitte/Friedrichshain, Neukölln–Treptow, Rudow–Altglienicke). Only ever
 * intersected with (or subtracted from) the Berlin admin-1 unit. Accuracy about ±1 km.
 */
export const WEST_BERLIN = {
  type: 'Polygon',
  coordinates: [
    [
      [12.9, 52.25],
      [13.62, 52.25],
      [13.6, 52.32],
      [13.55, 52.38],
      [13.5, 52.43],
      [13.47, 52.48],
      [13.45, 52.5],
      [13.42, 52.505],
      [13.375, 52.51],
      [13.37, 52.535],
      [13.38, 52.57],
      [13.37, 52.72],
      [12.9, 52.72],
      [12.9, 52.25],
    ],
  ],
}

const BW = 'ne1:Baden-Württemberg'

/** Occupation-zone geometries 1945–1948 (correction E5). */
export const ZONES = {
  /** Bavaria (without Lindau), Hesse, Bremen/Bremerhaven and northern Württemberg-Baden. */
  us: { minus: [{ union: ['ne1:Bayern+Hessen+Bremen', { intersect: [BW, WURTTEMBERG_BADEN_US] }] }, LINDAU_BOX] },
  /** Schleswig-Holstein, Hamburg, Lower Saxony, North Rhine-Westphalia. */
  uk: 'ne1:Schleswig-Holstein+Hamburg+Niedersachsen+Nordrhein-Westfalen',
  /** Rhineland-Palatinate (incl. Rhenish Hesse and Montabaur), southern Württemberg and Baden, Lindau; with the Saar. */
  fr1945: { union: ['ne1:Rheinland-Pfalz+Saarland', { minus: [BW, WURTTEMBERG_BADEN_US] }, { intersect: ['ne1:Bayern', LINDAU_BOX] }] },
  /** The same after the Saar was detached (16 Feb 1946). */
  fr: { union: ['ne1:Rheinland-Pfalz', { minus: [BW, WURTTEMBERG_BADEN_US] }, { intersect: ['ne1:Bayern', LINDAU_BOX] }] },
  /** Mecklenburg(-Vorpommern), Brandenburg, Saxony, Saxony-Anhalt, Thuringia. */
  su: 'ne1:Mecklenburg-Vorpommern+Brandenburg+Sachsen+Sachsen-Anhalt+Thüringen',
  berlin: 'ne1:Berlin',
  saar: 'ne1:Saarland',
  westBerlin: { intersect: ['ne1:Berlin', WEST_BERLIN] },
  eastBerlin: { minus: ['ne1:Berlin', WEST_BERLIN] },
}

/** Nigeria: the seventeen southern states = the Southern Nigeria Protectorate (1900–1913), Lagos = Lagos Colony. */
export const NG_SOUTH =
  'ne1:Lagos+Ogun+Oyo+Osun+Ondo+Ekiti+Edo+Delta+Bayelsa+Rivers+Akwa Ibom+Cross River+Imo+Abia+Anambra+Enugu+Ebonyi'
export const NG_LAGOS = 'ne1:Lagos'

/** South Africa: Transvaal ≈ Gauteng + Limpopo + Mpumalanga + North West; Orange River Colony ≈ Free State. */
export const ZA_TRANSVAAL = 'ne1:Gauteng+Limpopo+Mpumalanga+Province of North-West'
export const ZA_ORANGE = 'ne1:Free State'

/* ------------------------------------------------------------------ self-check CLI */

const TEST_POINTS = {
  us: [['Munich', 11.58, 48.14], ['Frankfurt', 8.68, 50.11], ['Bremen', 8.8, 53.08], ['Stuttgart', 9.18, 48.78], ['Karlsruhe', 8.4, 49.01], ['Ulm', 9.99, 48.4], ['Pforzheim', 8.7, 48.89], ['Herrenberg', 8.87, 48.6]],
  uk: [['Hamburg', 9.99, 53.55], ['Cologne', 6.96, 50.94], ['Hanover', 9.73, 52.37], ['Kiel', 10.13, 54.32]],
  fr: [['Mainz', 8.27, 50.0], ['Koblenz', 7.59, 50.36], ['Freiburg', 7.85, 48.0], ['Tübingen', 9.06, 48.52], ['Baden-Baden', 8.24, 48.76], ['Lindau', 9.68, 47.55], ['Calw', 8.74, 48.71], ['Reutlingen', 9.21, 48.49]],
  su: [['Leipzig', 12.37, 51.34], ['Dresden', 13.74, 51.05], ['Rostock', 12.1, 54.09], ['Erfurt', 11.03, 50.98], ['Potsdam', 13.06, 52.39]],
  westBerlin: [['Charlottenburg', 13.3, 52.52], ['Spandau', 13.2, 52.54], ['Tempelhof', 13.4, 52.47], ['Kreuzberg', 13.41, 52.5], ['Reinickendorf', 13.33, 52.6]],
  eastBerlin: [['Alexanderplatz', 13.41, 52.52], ['Pankow', 13.41, 52.57], ['Köpenick', 13.58, 52.44], ['Lichtenberg', 13.49, 52.51]],
}

async function main() {
  const { NE_RAW } = await import('./lib.mjs')
  const file = join(NE_RAW, 'ne_10m_admin_1_states_provinces.geojson')
  if (!existsSync(file)) throw new Error(`${file} missing - run: node scripts/data/clio/fetch.mjs --ne`)
  const T = await import('@turf/turf')
  const feats = JSON.parse(await readFile(file, 'utf8')).features
  const keys = ['name', 'name_en', 'name_local', 'postal', 'gn_name']
  const feat = (geometry) => ({ type: 'Feature', properties: {}, geometry })
  const byName = (nm) => feats.filter((x) => keys.some((k) => String(x.properties[k] ?? '').toLowerCase() === nm.toLowerCase()))
  const problems = []
  const ne1 = (names) => {
    const parts = []
    for (const nm of names) {
      const hits = byName(nm)
      if (hits.length !== 1) problems.push(`ne1:${nm} matches ${hits.length} units (${hits.map((h) => h.properties.adm0_a3).join(',')})`)
      parts.push(...hits.map((h) => h.geometry))
    }
    return parts.length === 1 ? parts[0] : T.union(T.featureCollection(parts.map(feat)))?.geometry
  }
  const resolve = (src) => {
    if (typeof src === 'string') return ne1(src.slice(4).split('+'))
    if (src.type) return src
    if (src.bbox) return T.bboxPolygon(src.bbox).geometry
    if (src.union) return T.union(T.featureCollection(src.union.map((s) => feat(resolve(s)))))?.geometry
    if (src.intersect) return src.intersect.map(resolve).reduce((a, b) => T.intersect(T.featureCollection([feat(a), feat(b)]))?.geometry)
    if (src.minus) return T.difference(T.featureCollection([feat(resolve(src.minus[0])), feat(resolve(src.minus[1]))]))?.geometry
    throw new Error('bad spec')
  }
  const specs = { ...ZONES, ngSouth: NG_SOUTH, ngLagos: NG_LAGOS, zaTransvaal: ZA_TRANSVAAL, zaOrange: ZA_ORANGE }
  for (const [id, spec] of Object.entries(specs)) {
    const g = resolve(spec)
    const km2 = Math.round(T.area(feat(g)) / 1e6)
    const pts = (TEST_POINTS[id] ?? []).map(([n, x, y]) => {
      const inside = T.booleanPointInPolygon([x, y], feat(g))
      if (!inside) problems.push(`${id}: ${n} should be inside`)
      return `${n}${inside ? '' : ' (OUTSIDE!)'}`
    })
    // points that must NOT be in this zone: every other zone's test points
    for (const [other, list] of Object.entries(TEST_POINTS)) {
      if (other === id || (id === 'fr1945' && other === 'fr') || (id === 'berlin' && /Berlin/.test(other))) continue
      if (id === 'fr1945' || id === 'berlin' || id === 'saar' || /^ng|^za/.test(id)) continue
      for (const [n, x, y] of list) if (T.booleanPointInPolygon([x, y], feat(g))) problems.push(`${id}: ${n} (${other}) is inside`)
    }
    console.log(`${id.padEnd(12)} ${String(km2).padStart(7)} km2  ${pts.join(', ')}`)
  }
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  console.log('\nall admin-1 names unique, all test points in their zones')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
