/**
 * Colonial split table (docs/border-hybrid-plan.md §1.2.2, correction E11; builder B). Pure data.
 *
 * Cliopatria v0.2.1 draws several colonial empires as single "blob" rows ("British Africa" up to 10.6 M km²,
 * "French Africa" 11.7 M km², …). The `split` entries in corrections.mjs cut every row of a blob with Natural Earth
 * 50 m countries (public domain) and give each piece the colony name below for the years given (inclusive).
 *
 *   { blob, iso3: [...], from, to, name, wp, qid, source, why? }
 *
 * - The knife is modern Natural Earth borders, so every piece is `approx` (the state card says "approximate
 *   borders"). Where a modern border cuts a historical colony, `why` says so.
 * - Every piece keeps the blob row's MemberOf, so the realm colour stays (corrections.mjs sets a realm on the blobs
 *   that have none, e.g. German Africa → "(German colonial empire)").
 * - The plan's rule was that any part of a blob not named here keeps the blob's name. Measured after the split, that
 *   remainder is almost only coast and border slivers where Cliopatria and Natural Earth disagree (hundreds of
 *   parts, mostly sea) and pieces hidden under successor rows, so corrections.mjs (E11d) deletes the remainder of
 *   the British, German and Italian blobs and of French Africa from 1895; coast growth fills land gaps < 15 km.
 *   Portuguese Africa and French Africa before 1895 keep it (real forts and trading posts).
 * - Years follow the rule in corrections.mjs: a change applies from the year it took effect. The end of a colony is
 *   the year before the successor row starts; after that the (retimed, see E17) successor row wins by the overlap
 *   rule, and the blob remainder is hidden under it.
 * - Sources are English Wikipedia articles (title as given; dates from the infobox and lead), checked 2026-10-24.
 *   QIDs were looked up with the Wikidata API (wbgetentities by enwiki title) the same day.
 *
 * Cliopatria extents deliberately left unnamed (and so dropped with the remainder): British Africa in eastern Libya
 * 1905–1929 (585k km²; Ottoman, then Italian-claimed and Senussi-held, never British) and northern Mozambique 1918
 * (wartime operations); French Africa's Fezzan/Tibesti claims 1905–1919; German Africa 1918 (Lettow-Vorbeck's column).
 */

const BA = 'British Africa'
const FA = 'French Africa'
const GA = 'German Africa'
const IA = 'Italian Africa'
const PA = 'Portuguese Africa'
const GC = 'British Gold Coast'
const BEA = 'British East Africa'
const BC = 'Belgian Congo'
const FFR = 'French Fifth Republic'

export const COLONIES = [
  /* ------------------------------------------------------------------ British Africa (1885–1960) */
  { blob: BA, iso3: ['EGY'], from: 1885, to: 1913, name: 'Khedivate of Egypt', wp: 'Khedivate of Egypt', qid: 'Q127861', source: 'WP "Khedivate of Egypt" (1867–1914; British occupation from 1882)' },
  { blob: BA, iso3: ['EGY'], from: 1914, to: 1921, name: 'Sultanate of Egypt', wp: 'Sultanate of Egypt', qid: 'Q370173', source: 'WP "Sultanate of Egypt" (British protectorate 1914–1922; Kingdom of Egypt row from 1922)' },
  { blob: BA, iso3: ['SDN', 'SSD'], from: 1885, to: 1889, name: 'Mahdist State', wp: 'Mahdist State', qid: 'Q3125368', source: 'WP "Mahdist State" (1885–1899; Khartoum fell Jan 1885)', why: 'Cliopatria gives the Sudan to Britain in 1885–1889; it was Mahdist (Cliopatria has Mahdist rows only from 1890). corrections.mjs clears the realm of this piece.' },
  { blob: BA, iso3: ['SDN'], from: 1890, to: 1898, name: 'Khedivate of Egypt', wp: 'Khedivate of Egypt', qid: 'Q127861', source: 'WP "Khedivate of Egypt"; "Suakin"', why: 'The 75k km² Red Sea strip (Suakin, Wadi Halfa) held by Anglo-Egyptian forces during the Mahdiyya.' },
  { blob: BA, iso3: ['SDN', 'SSD'], from: 1899, to: 1955, name: 'Anglo-Egyptian Sudan', wp: 'Anglo-Egyptian Sudan', qid: 'Q541455', source: 'WP "Anglo-Egyptian Sudan" (condominium 1899–1956; Republic of Sudan row from 1956)' },
  { blob: BA, iso3: ['LBY'], from: 1930, to: 1935, name: 'Anglo-Egyptian Sudan', wp: 'Anglo-Egyptian Sudan', qid: 'Q541455', source: 'WP "Sarra Triangle"', why: 'The 84k km² south-eastern Libya piece is the Sarra Triangle, Sudanese until ceded to Italy in 1934–35.' },
  { blob: BA, iso3: ['LBY'], from: 1943, to: 1951, name: 'British Military Administration (Libya)', wp: 'British Military Administration (Libya)', qid: 'Q16953965', source: 'WP "British Military Administration (Libya)" (Tripolitania and Cyrenaica 1943–1951; Kingdom of Libya 24 Dec 1951)' },
  { blob: BA, iso3: ['ZAF'], from: 1885, to: 1909, name: 'Cape Colony', wp: 'Cape Colony', qid: 'Q370736', source: 'WP "Cape Colony" (1806–1910)', why: 'Cliopatria\'s own "British Cape Colony" rows end in 1884; from 1885 the Cape is inside British Africa. For 1900–1909 corrections.mjs adds the Transvaal and Orange River colonies on top.' },
  { blob: BA, iso3: ['ZAF'], from: 1910, to: 1931, name: 'Union of South Africa', wp: 'Union of South Africa', qid: 'Q193619', source: 'WP "Union of South Africa" (31 May 1910 – 1961)', why: 'From 1932 Cliopatria has its own "South Africa" row (renamed Union of South Africa up to 1960 in corrections.mjs).' },
  { blob: BA, iso3: ['NAM'], from: 1916, to: 1931, name: 'South West Africa', wp: 'South West Africa', qid: 'Q953068', source: 'WP "South West Africa" (South African occupation 1915, mandate 1920–1990)', why: 'Administered by the Union of South Africa; Cliopatria\'s "South Africa" row includes it from 1932.' },
  { blob: BA, iso3: ['LSO'], from: 1885, to: 1965, name: 'Basutoland', wp: 'Basutoland', qid: 'Q2340665', source: 'WP "Basutoland" (1884–1966; Lesotho 4 Oct 1966)' },
  { blob: BA, iso3: ['BWA'], from: 1885, to: 1965, name: 'Bechuanaland Protectorate', wp: 'Bechuanaland Protectorate', qid: 'Q747314', source: 'WP "Bechuanaland Protectorate" (1885–1966; Botswana 30 Sep 1966)' },
  { blob: BA, iso3: ['SWZ'], from: 1903, to: 1967, name: 'Swaziland', wp: 'Eswatini', qid: 'Q1050', source: 'WP "Eswatini" § History (British protectorate 1903/1906 – 6 Sep 1968)', why: 'Same entity name as Cliopatria\'s Swaziland rows (1885–1907) and the renamed Eswatini rows (1968–2017).' },
  { blob: BA, iso3: ['ZWE'], from: 1890, to: 1964, name: 'Southern Rhodesia', wp: 'Southern Rhodesia', qid: 'Q750583', source: 'WP "Southern Rhodesia" (BSAC rule 1890–1923, self-governing colony 1923–1965 UDI); "Company rule in Rhodesia"' },
  { blob: BA, iso3: ['ZMB'], from: 1891, to: 1963, name: 'Northern Rhodesia', wp: 'Northern Rhodesia', qid: 'Q953903', source: 'WP "Northern Rhodesia" (1911–1964; Zambia 24 Oct 1964)', why: 'Before 1911 the area was North-Western and North-Eastern Rhodesia under the BSAC; one name for the whole span.' },
  { blob: BA, iso3: ['MWI'], from: 1891, to: 1906, name: 'British Central Africa Protectorate', wp: 'British Central Africa Protectorate', qid: 'Q2642989', source: 'WP "British Central Africa Protectorate" (1891–1907)' },
  { blob: BA, iso3: ['MWI'], from: 1907, to: 1963, name: 'Nyasaland', wp: 'Nyasaland', qid: 'Q1649306', source: 'WP "Nyasaland" (1907–1964; Malawi 6 Jul 1964)' },
  { blob: BA, iso3: ['KEN'], from: 1895, to: 1919, name: 'East Africa Protectorate', wp: 'East Africa Protectorate', qid: 'Q876185', source: 'WP "East Africa Protectorate" (1895–1920)' },
  { blob: BA, iso3: ['KEN'], from: 1920, to: 1962, name: 'Kenya Colony', wp: 'Kenya Colony', qid: 'Q2538511', source: 'WP "Kenya Colony" (1920–1963; Kenya 12 Dec 1963)' },
  { blob: BA, iso3: ['UGA'], from: 1894, to: 1961, name: 'Uganda Protectorate', wp: 'Protectorate of Uganda', qid: 'Q1097943', source: 'WP "Protectorate of Uganda" (1894–1962; Uganda 9 Oct 1962)' },
  { blob: BA, iso3: ['TZA', 'RWA', 'BDI'], from: 1916, to: 1960, name: 'Tanganyika Territory', wp: 'Tanganyika Territory', qid: 'Q158725', source: 'WP "Tanganyika Territory" (1916–1961)', why: 'RWA/BDI only hold border slivers here (Ruanda-Urundi was Belgian).' },
  { blob: BA, iso3: ['SOM'], from: 1941, to: 1949, name: 'British Military Administration (Somalia)', wp: 'Italian Somaliland', qid: '', source: 'WP "Italian Somaliland" § British occupation 1941–1950; "Trust Territory of Somaliland"', why: 'Former Italian Somaliland under British military administration from 1941 until the UN trusteeship of 1 Apr 1950.' },
  { blob: BA, iso3: ['SOM'], from: 1950, to: 1959, name: 'Trust Territory of Somaliland', wp: 'Trust Territory of Somaliland', qid: 'Q616221', source: 'WP "Trust Territory of Somaliland" (Italian-administered UN trust territory 1950–1960)', why: 'Cliopatria keeps it British until 1959; it was under Italian administration. corrections.mjs clears the British realm of this piece.' },
  { blob: BA, iso3: ['ERI'], from: 1941, to: 1952, name: 'British Military Administration (Eritrea)', wp: 'British Military Administration (Eritrea)', qid: 'Q136498582', source: 'WP "British Military Administration (Eritrea)" (1941–1952; federated with Ethiopia Sep 1952)' },
  { blob: BA, iso3: ['ETH'], from: 1941, to: 1941, name: 'Ethiopian Empire', wp: 'Ethiopian Empire', qid: 'Q207521', source: 'WP "East African campaign (World War II)"; Haile Selassie re-entered Addis Ababa 5 May 1941', why: 'Liberated, not annexed; Cliopatria\'s "Ethiopia" row starts 1942. corrections.mjs clears the British realm.' },
  { blob: BA, iso3: ['SLE'], from: 1885, to: 1960, name: 'Sierra Leone Colony and Protectorate', wp: 'Sierra Leone Colony and Protectorate', qid: 'Q30059027', source: 'WP "Sierra Leone Colony and Protectorate" (1808/1896–1961; independence 27 Apr 1961)' },
  { blob: BA, iso3: ['GMB'], from: 1885, to: 1964, name: 'Gambia Colony and Protectorate', wp: 'Gambia Colony and Protectorate', qid: 'Q3557236', source: 'WP "Gambia Colony and Protectorate" (1821–1965; independence 18 Feb 1965)' },
  { blob: BA, iso3: ['ISR', 'PSE'], from: 1917, to: 1947, name: 'Mandatory Palestine', wp: 'Mandatory Palestine', qid: 'Q193714', source: 'WP "Mandatory Palestine" (military administration 1917/18, civil administration 1920 – 14 May 1948)' },
  { blob: BA, iso3: ['JOR'], from: 1921, to: 1945, name: 'Emirate of Transjordan', wp: 'Emirate of Transjordan', qid: 'Q1121819', source: 'WP "Emirate of Transjordan" (1921 – 25 May 1946)' },
  { blob: BA, iso3: ['IRQ'], from: 1918, to: 1931, name: 'Mandatory Iraq', wp: 'Mandatory Iraq', qid: 'Q146720', source: 'WP "Mandatory Iraq" (1921–1932); British occupation of Mesopotamia from 1914–1918' },
  { blob: BA, iso3: ['IRQ'], from: 1943, to: 1945, name: 'Kingdom of Iraq', wp: 'Kingdom of Iraq', qid: 'Q149805', source: 'WP "Kingdom of Iraq" (1932–1958); "Anglo-Iraqi War" (British forces stayed, Iraq remained sovereign)', why: 'Cliopatria gives Iraq to Britain in 1943–1945. corrections.mjs clears the British realm.' },
  { blob: BA, iso3: ['IRN'], from: 1919, to: 1919, name: 'Qajar Dynasty', wp: 'Qajar Iran', qid: 'Q63158027', source: 'WP "Qajar Iran"; "Anglo-Persian Agreement" (1919, never ratified)', why: 'Same entity name as Cliopatria\'s Qajar rows. corrections.mjs clears the British realm.' },
  { blob: BA, iso3: ['IRN'], from: 1943, to: 1945, name: 'Pahlavi Dynasty', wp: 'Pahlavi Iran', qid: 'Q107258515', source: 'WP "Anglo-Soviet invasion of Iran" (occupation 1941–1946, Iran remained sovereign)', why: 'Same entity name as Cliopatria\'s Pahlavi rows. corrections.mjs clears the British realm.' },
  { blob: BA, iso3: ['SYR', 'LBN'], from: 1918, to: 1919, name: 'Occupied Enemy Territory Administration', wp: 'Occupied Enemy Territory Administration', qid: 'Q7075820', source: 'WP "Occupied Enemy Territory Administration" (1917–1920)' },
  { blob: BA, iso3: ['KWT'], from: 1899, to: 1960, name: 'Kuwait', wp: 'Kuwait', qid: 'Q817', source: 'WP "Kuwait" § History (British protectorate 1899–1961)', why: 'Same entity name as Cliopatria\'s Kuwait rows (to 1872); the state existed throughout.' },

  /* ------------------------------------------------------------------ British Gold Coast (1873–1960) */
  { blob: GC, iso3: ['GHA'], from: 1873, to: 1956, name: 'Gold Coast', wp: 'Gold Coast (British colony)', qid: 'Q503623', source: 'WP "Gold Coast (British colony)" (1821/1867–1957; Ghana 6 Mar 1957)' },
  { blob: GC, iso3: ['NGA'], from: 1873, to: 1884, name: 'Lagos Colony', wp: 'Lagos Colony', qid: 'Q472146', source: 'WP "Lagos Colony" (1862–1906)' },
  { blob: GC, iso3: ['NGA'], from: 1885, to: 1899, name: 'Niger Coast Protectorate', wp: 'Niger Coast Protectorate', qid: 'Q2566427', source: 'WP "Niger Coast Protectorate" (Oil Rivers Protectorate 1884, renamed 1893 – 1900)', why: 'The Cliopatria piece is the whole southern coast; corrections.mjs carves Lagos Colony out of it.' },
  { blob: GC, iso3: ['NGA'], from: 1900, to: 1904, name: 'Southern Nigeria Protectorate', wp: 'Southern Nigeria Protectorate', qid: 'Q2062030', source: 'WP "Southern Nigeria Protectorate" (1900–1914)', why: 'Cliopatria\'s piece reaches only ~9°N in these years.' },
  { blob: GC, iso3: ['NGA'], from: 1905, to: 1913, name: 'Northern Nigeria Protectorate', wp: 'Northern Nigeria Protectorate', qid: 'Q585408', source: 'WP "Northern Nigeria Protectorate" (1900–1914)', why: 'The 1905 row covers all of Nigeria; corrections.mjs puts the Southern Nigeria Protectorate (the 17 southern states) on top.' },
  { blob: GC, iso3: ['NGA'], from: 1914, to: 1959, name: 'Colony and Protectorate of Nigeria', wp: 'Colonial Nigeria', qid: 'Q2046345', source: 'WP "Colonial Nigeria" (amalgamation 1 Jan 1914 – independence 1 Oct 1960)' },
  { blob: GC, iso3: ['CMR'], from: 1916, to: 1960, name: 'British Cameroons', wp: 'British Cameroons', qid: 'Q1028835', source: 'WP "British Cameroons" (1916/1922–1961)' },

  /* ------------------------------------------------------------------ British East Africa (Cliopatria 1961–1968) */
  // The plan proposed deleting this blob, but deleting it leaves 1961–1967 gaps (Rhodesias, Nyasaland, Bechuanaland,
  // Basutoland, Swaziland, Gambia). Split instead; after independence the retimed successor rows win.
  { blob: BEA, iso3: ['ZWE'], from: 1961, to: 1964, name: 'Southern Rhodesia', wp: 'Southern Rhodesia', qid: 'Q750583', source: 'WP "Southern Rhodesia" (to UDI 11 Nov 1965)' },
  { blob: BEA, iso3: ['ZMB'], from: 1961, to: 1963, name: 'Northern Rhodesia', wp: 'Northern Rhodesia', qid: 'Q953903', source: 'WP "Northern Rhodesia" (to 24 Oct 1964)' },
  { blob: BEA, iso3: ['MWI'], from: 1961, to: 1963, name: 'Nyasaland', wp: 'Nyasaland', qid: 'Q1649306', source: 'WP "Nyasaland" (to 6 Jul 1964)' },
  { blob: BEA, iso3: ['KEN'], from: 1961, to: 1962, name: 'Kenya Colony', wp: 'Kenya Colony', qid: 'Q2538511', source: 'WP "Kenya Colony" (to 12 Dec 1963)' },
  { blob: BEA, iso3: ['UGA'], from: 1961, to: 1961, name: 'Uganda Protectorate', wp: 'Protectorate of Uganda', qid: 'Q1097943', source: 'WP "Protectorate of Uganda" (to 9 Oct 1962)' },
  { blob: BEA, iso3: ['BWA'], from: 1961, to: 1965, name: 'Bechuanaland Protectorate', wp: 'Bechuanaland Protectorate', qid: 'Q747314', source: 'WP "Bechuanaland Protectorate" (to 30 Sep 1966)' },
  { blob: BEA, iso3: ['LSO'], from: 1961, to: 1965, name: 'Basutoland', wp: 'Basutoland', qid: 'Q2340665', source: 'WP "Basutoland" (to 4 Oct 1966)' },
  { blob: BEA, iso3: ['SWZ'], from: 1961, to: 1967, name: 'Swaziland', wp: 'Eswatini', qid: 'Q1050', source: 'WP "Eswatini" (British protectorate to 6 Sep 1968)' },
  { blob: BEA, iso3: ['GMB'], from: 1961, to: 1964, name: 'Gambia Colony and Protectorate', wp: 'Gambia Colony and Protectorate', qid: 'Q3557236', source: 'WP "Gambia Colony and Protectorate" (to 18 Feb 1965)' },

  /* ------------------------------------------------------------------ German Africa (1871–1918) */
  { blob: GA, iso3: ['NAM', 'ZAF'], from: 1884, to: 1915, name: 'German South West Africa', wp: 'German South West Africa', qid: 'Q153665', source: 'WP "German South West Africa" (1884–1915)', why: 'ZAF holds only a border sliver.' },
  { blob: GA, iso3: ['TZA', 'RWA', 'BDI', 'MOZ', 'KEN'], from: 1885, to: 1917, name: 'German East Africa', wp: 'German East Africa', qid: 'Q153963', source: 'WP "German East Africa" (1885–1918; Rwanda and Burundi part of it; Kionga Triangle)', why: 'The 1918 row is Lettow-Vorbeck\'s column in Mozambique, not a colony; it keeps the blob name.' },
  { blob: GA, iso3: ['CMR', 'NGA', 'GAB', 'COG', 'CAF', 'TCD'], from: 1884, to: 1916, name: 'Kamerun', wp: 'Kamerun', qid: 'Q668294', source: 'WP "Kamerun" (1884–1916; Neukamerun 1911–1916 in today\'s Gabon, Congo, CAR and Chad; northern strip in today\'s Nigeria)' },
  { blob: GA, iso3: ['TGO', 'GHA'], from: 1884, to: 1914, name: 'Togoland', wp: 'Togoland', qid: 'Q161062', source: 'WP "Togoland" (1884–1914; its western part is in today\'s Ghana)' },

  /* ------------------------------------------------------------------ Italian Africa (1890–1943) */
  { blob: IA, iso3: ['ERI'], from: 1890, to: 1935, name: 'Italian Eritrea', wp: 'Italian Eritrea', qid: 'Q1232988', source: 'WP "Italian Eritrea" (1890–1936, then part of Italian East Africa)' },
  { blob: IA, iso3: ['SOM', 'KEN'], from: 1889, to: 1935, name: 'Italian Somaliland', wp: 'Italian Somaliland', qid: 'Q319984', source: 'WP "Italian Somaliland" (1889–1936; Oltre Giuba/Jubaland from 1925)', why: 'KEN holds only a border sliver.' },
  { blob: IA, iso3: ['ERI', 'SOM', 'ETH', 'KEN', 'SDN'], from: 1936, to: 1941, name: 'Italian East Africa', wp: 'Italian East Africa', qid: 'Q328478', source: 'WP "Italian East Africa" (1936–1941)', why: 'From 1941 only small slivers remain in the Italian rows.' },
  { blob: IA, iso3: ['LBY', 'EGY'], from: 1912, to: 1943, name: 'Italian Libya', wp: 'Italian Libya', qid: 'Q284568', source: 'WP "Italian Libya" (1912 conquest; Tripolitania and Cyrenaica united as Libya 1934; lost 1943)', why: 'One name for the whole span; 1912–1934 the two colonies were administered separately.' },

  /* ------------------------------------------------------------------ Portuguese Africa (1507–1581) */
  { blob: PA, iso3: ['CPV'], from: 1507, to: 1581, name: 'Portuguese Cape Verde', wp: 'Portuguese Cape Verde', qid: 'Q3023340', source: 'WP "Portuguese Cape Verde" (1462–1975)' },
  { blob: PA, iso3: ['MOZ'], from: 1507, to: 1581, name: 'Portuguese Mozambique', wp: 'Portuguese Mozambique', qid: 'Q889394', source: 'WP "Portuguese Mozambique" (Sofala 1505, Mozambique Island 1507)' },
  { blob: PA, iso3: ['AGO'], from: 1575, to: 1581, name: 'Portuguese Angola', wp: 'Portuguese Angola', qid: 'Q2826232', source: 'WP "Portuguese Angola" (Luanda founded 1576 by Paulo Dias de Novais, colony from 1575)' },

  /* ------------------------------------------------------------------ French Africa (1846–1957) */
  { blob: FA, iso3: ['DZA'], from: 1846, to: 1957, name: 'French Algeria', wp: 'French Algeria', qid: 'Q218272', source: 'WP "French Algeria" (1830–1962)', why: 'Same entity name as Cliopatria\'s own French Algeria rows (1830–1847).' },
  { blob: FA, iso3: ['TUN'], from: 1881, to: 1955, name: 'French protectorate of Tunisia', wp: 'French protectorate of Tunisia', qid: 'Q2017684', source: 'WP "French protectorate of Tunisia" (Treaty of Bardo 12 May 1881 – 20 Mar 1956)' },
  { blob: FA, iso3: ['MAR'], from: 1912, to: 1955, name: 'French protectorate in Morocco', wp: 'French protectorate in Morocco', qid: 'Q907234', source: 'WP "French protectorate in Morocco" (Treaty of Fez 30 Mar 1912 – 2 Mar 1956)' },
  { blob: FA, iso3: ['SEN', 'MRT', 'MLI'], from: 1853, to: 1879, name: 'French Senegal', wp: 'French Senegal', qid: 'Q5502051', source: 'WP "French Senegal"', why: 'MRT/MLI hold the Senegal-river posts only.' },
  { blob: FA, iso3: ['SEN', 'MRT'], from: 1880, to: 1894, name: 'French Senegal', wp: 'French Senegal', qid: 'Q5502051', source: 'WP "French Senegal"' },
  { blob: FA, iso3: ['MLI'], from: 1880, to: 1894, name: 'French Sudan', wp: 'French Sudan', qid: 'Q508014', source: 'WP "French Sudan" (Upper Senegal 1880, French Sudan 1890; joined French West Africa 1895)' },
  { blob: FA, iso3: ['GIN'], from: 1882, to: 1894, name: 'French Guinea', wp: 'French Guinea', qid: 'Q797433', source: 'WP "French Guinea" (Rivières du Sud 1882, French Guinea 1891)' },
  { blob: FA, iso3: ['SEN', 'MLI', 'MRT', 'GIN', 'CIV', 'BFA', 'BEN', 'NER'], from: 1895, to: 1957, name: 'French West Africa', wp: 'French West Africa', qid: 'Q210682', source: 'WP "French West Africa" (federation 16 Jun 1895 – 1958)' },
  { blob: FA, iso3: ['GAB', 'COG', 'CAF', 'TCD', 'CMR'], from: 1886, to: 1909, name: 'French Congo', wp: 'French Congo', qid: 'Q265319', source: 'WP "French Congo" (1882/1886 – 15 Jan 1910)', why: 'CMR holds the south-eastern strip Cliopatria gives to French Congo before the 1911 Morocco–Congo treaty.' },
  { blob: FA, iso3: ['GAB', 'COG', 'CAF', 'TCD'], from: 1910, to: 1957, name: 'French Equatorial Africa', wp: 'French Equatorial Africa', qid: 'Q271894', source: 'WP "French Equatorial Africa" (15 Jan 1910 – 1958)' },
  { blob: FA, iso3: ['TGO'], from: 1914, to: 1957, name: 'French Togoland', wp: 'French Togoland', qid: 'Q797214', source: 'WP "French Togoland" (1916–1960; Anglo-French occupation Aug 1914)' },
  { blob: FA, iso3: ['CMR'], from: 1916, to: 1957, name: 'French Cameroon', wp: 'French Cameroon', qid: 'Q1028848', source: 'WP "French Cameroon" (1916–1960)' },
  { blob: FA, iso3: ['MDG'], from: 1896, to: 1957, name: 'French Madagascar', wp: 'French Madagascar', qid: 'Q5501842', source: 'WP "French Madagascar" (annexed 6 Aug 1896 – 1958)' },
  { blob: FA, iso3: ['DJI'], from: 1884, to: 1957, name: 'French Somaliland', wp: 'French Somaliland', qid: 'Q333126', source: 'WP "French Somaliland" (1884/1896–1967)' },
  { blob: FA, iso3: ['LBY'], from: 1943, to: 1951, name: 'Fezzan-Ghadames Military Territory', wp: 'Fezzan-Ghadames Military Territory', qid: 'Q3518801', source: 'WP "Fezzan-Ghadames Military Territory" (1943–1951)' },

  /* ------------------------------------------------------------------ French Fifth Republic 1958–1961 (the French Community) */
  // Cliopatria's French Fifth Republic rows 1958–1960 still hold the African colonies (11.3 M km²). From Oct 1958 they
  // were autonomous republics of the French Community; corrections.mjs sets the realm "(French Community)" on these
  // rows first, so the pieces keep France's colour. The names equal the independence rows (retimed to 1960 in E17),
  // so each state is one continuous entity. Guinea left in Oct 1958 (its row is retimed to 1958).
  { blob: FFR, iso3: ['DZA'], from: 1958, to: 1961, name: 'French Algeria', wp: 'French Algeria', qid: 'Q218272', source: 'WP "French Algeria" (to 5 Jul 1962)' },
  { blob: FFR, iso3: ['SEN'], from: 1958, to: 1959, name: 'Republic of Senegal', wp: 'Senegal', qid: 'Q1041', source: 'WP "French Community"; "Senegal" (autonomous 1958, independent 20 Aug 1960)' },
  { blob: FFR, iso3: ['MLI'], from: 1958, to: 1959, name: 'Republic of Mali', wp: 'Mali', qid: 'Q912', source: 'WP "French Community"; "Mali" (Sudanese Republic 1958, independent 22 Sep 1960)' },
  { blob: FFR, iso3: ['MRT'], from: 1958, to: 1959, name: 'Mauritania', wp: 'Mauritania', qid: 'Q1025', source: 'WP "French Community"; "Mauritania" (independent 28 Nov 1960)' },
  { blob: FFR, iso3: ['CIV'], from: 1958, to: 1959, name: "Republic of Côte d'Ivoire", wp: 'Ivory Coast', qid: 'Q1008', source: 'WP "French Community"; "Ivory Coast" (independent 7 Aug 1960)' },
  { blob: FFR, iso3: ['BFA'], from: 1958, to: 1959, name: 'Republic of Upper Volta', wp: 'Republic of Upper Volta', qid: 'Q797422', source: 'WP "Republic of Upper Volta" (11 Dec 1958 – 1984)' },
  { blob: FFR, iso3: ['BEN'], from: 1958, to: 1959, name: 'Republic of Dahomey', wp: 'Republic of Dahomey', qid: 'Q798431', source: 'WP "Republic of Dahomey" (1958–1975)' },
  { blob: FFR, iso3: ['NER'], from: 1958, to: 1959, name: 'Republic of the Niger', wp: 'Niger', qid: 'Q1032', source: 'WP "French Community"; "Niger" (independent 3 Aug 1960)' },
  { blob: FFR, iso3: ['GAB'], from: 1958, to: 1959, name: 'Gabon', wp: 'Gabon', qid: 'Q1000', source: 'WP "French Community"; "Gabon" (independent 17 Aug 1960)' },
  { blob: FFR, iso3: ['COG'], from: 1958, to: 1959, name: 'Republic of the Congo', wp: 'Republic of the Congo', qid: 'Q971', source: 'WP "French Community"; "Republic of the Congo" (independent 15 Aug 1960)' },
  { blob: FFR, iso3: ['CAF'], from: 1958, to: 1959, name: 'Central African Republic', wp: 'Central African Republic', qid: 'Q929', source: 'WP "French Community"; "Central African Republic" (independent 13 Aug 1960)' },
  { blob: FFR, iso3: ['TCD'], from: 1958, to: 1959, name: 'Republic of Chad', wp: 'Chad', qid: 'Q657', source: 'WP "French Community"; "Chad" (independent 11 Aug 1960)' },
  { blob: FFR, iso3: ['MDG'], from: 1958, to: 1959, name: 'Madagascar', wp: 'Madagascar', qid: 'Q1019', source: 'WP "French Community"; "Madagascar" (Malagasy Republic 1958, independent 26 Jun 1960)' },
  { blob: FFR, iso3: ['TGO'], from: 1958, to: 1959, name: 'French Togoland', wp: 'French Togoland', qid: 'Q797214', source: 'WP "French Togoland" (to 27 Apr 1960)' },
  { blob: FFR, iso3: ['CMR'], from: 1958, to: 1959, name: 'French Cameroon', wp: 'French Cameroon', qid: 'Q1028848', source: 'WP "French Cameroon" (to 1 Jan 1960)' },

  /* ------------------------------------------------------------------ Belgian Congo */
  { blob: BC, iso3: ['RWA', 'BDI'], from: 1916, to: 1962, name: 'Ruanda-Urundi', wp: 'Ruanda-Urundi', qid: 'Q590743', source: 'WP "Ruanda-Urundi" (Belgian occupation 1916, mandate 1922 – 1 Jul 1962)', why: 'Cliopatria\'s Belgian Congo rows 1960–1962 are only this territory.' },
]
