/**
 * Ghost duplicates in the PEOPLES layer (docs/border-hybrid-plan.md §6): historical-basemaps polities that must not be
 * drawn in the given years because a Cliopatria state already covers them and the automatic name/IoU match misses it.
 * GPL-side data: lives with the people build, never in the CC BY state corrections table.
 *
 * Entry: { name: <exact HB NAME>, from?: year, to?: year (inclusive), why: <reason> }
 *
 * Visual QA (docs/border-hybrid-qa.md): remnants of an HB state polygon left outside the Cliopatria state of the same
 * polity after clipping. They drew a second label (and a "extent c." card) for a state that is on the map already, or
 * that had ended. Only entity ids no content or question references are listed here (the Iraq profile's p:ur ref was
 * removed when Ur was added; the Sumer and Akkad profile draws that period from the state layer).
 */
export const DROP_HB = [
  { name: 'First Bulgarian Empire', why: 'QA 2: HB 1000 remnant in Moesia until 1065; the state ends 1018 (Cliopatria to 1017).' },
  { name: 'Eastern Roman Empire', why: 'QA 1: HB 600 remnant (682–691) next to the Cliopatria Byzantine Empire.' },
  { name: 'Fatimid Caliphate', why: 'HB 1100 remnant to 1199; the caliphate ended in 1171 (Cliopatria to 1176).' },
  { name: 'Caliphate of Córdoba', why: 'HB 1000 remnant to 1071 next to the Cliopatria state; the caliphate ended in 1031.' },
  { name: 'Abbasid Caliphate', why: 'HB 800/900 remnant beside the Cliopatria Abbasid Caliphate (750–1259).' },
  { name: 'Mughal Empire', why: 'HB 1530/1715 remnant beside the Cliopatria Mughal Empire (1526–1858).' },
  { name: 'Majapahit', why: 'HB 1400 remnant beside the Cliopatria Majapahit (1294–1518).' },
  { name: 'Golden Horde', from: 1502, to: 1529, why: 'HB 1500 remnant beside the Cliopatria Golden Horde row.' },
  { name: 'Toltec Empire', from: 875, to: 1187, why: 'HB remnant beside the Cliopatria Toltec state (875–1187).' },
  { name: 'Ur', why: 'Fact-check QA: the HB 3000/2000 BC "Ur" shape spans Syria, Assyria and the desert; clipped to what lies outside the Cliopatria Sumerian, Akkadian and Ur III states it drew a second "Ur" label in the north (2500 BCE) and at the Gulf beside the Akkadian Empire (2250 BCE). Ur was one Sumerian city, inside those states.' },
]
