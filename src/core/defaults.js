import { DEFAULT_ROUTES, FORMAT, LOGBOOK, PREP, ROUTE_CLUSTERS, SCHOOL_BY_2027, SICK_DEFAULT, TYPES, VERSION } from './constants.js';
import { clone } from './util.js';
import { firstMonday } from './dates.js';
import { emptySymbols } from './symbols.js';

// ---------- Vorgaben ---------------------------------------------------
export function defaultConfig() {
  const cfg = {};
  for (const k of ROUTE_CLUSTERS) {
    cfg[k] = {};
    for (const t of TYPES) {
      cfg[k][t] = {
        days: t === LOGBOOK ? (k === '5' ? 10 : ['3', '4B'].includes(k) ? 80 : 30)
          : t === 'FitCheck' ? (k === '1' ? 5 : 2)
            : t === 'ICA' || t === PREP ? 1 : t === 'Theorie' ? 20 : t === 'Praxis' ? 10 : null,
        trainee: t === PREP ? 0 : t === LOGBOOK ? (k === '5' ? 0.2 : 1) : 1,
        mentor: t === LOGBOOK ? (k === '5' ? 0.2 : 0.5) : 0,
        tec: t === 'FitCheck' || (t === 'ICA' && k === '1') ? 1 : 0,
        examiner: (t === 'ICA' && k !== '1') || t === PREP ? 1 : 0
      };
    }
  }
  return cfg;
}
export const defaultLimits = () => ({
  M1: { 'Früh': { min: 16, zero: 25 }, 'Spät': { min: 11, zero: 13 }, 'Nacht': { min: 10, zero: 12 } },
  M2: { 'Früh': { min: null, zero: null }, 'Spät': { min: null, zero: null }, 'Nacht': { min: null, zero: null } },
  M3: { 'Früh': { min: null, zero: null }, 'Spät': { min: null, zero: null }, 'Nacht': { min: null, zero: null } }
});
export const defaultSettings = year => ({
  start: firstMonday(year), cap: false, strict: false, confirmedOnly: false, goal: 'min', absenceLimit: null,
  avoidSchool: false, stress: 0, sick: SICK_DEFAULT.slice(), hours: 7.5, courseBlocks: true,
  mentorLimit: null, tecLimit: null, examinerLimit: 1, allowPartial: true, preferZero: true, buffer: 0,
  shifts: {}                    // zulässige Dienste je Maßnahme, soweit sie von der Vorgabe abweichen (core/measures.js)
  // settings.symbols (Bedeutung der Schichtsymbole) und settings.rules entstehen erst, wenn etwas festgelegt wird
});
export function emptyState(year = 2027) {
  const now = new Date().toISOString();
  return {
    format: FORMAT, version: VERSION,
    meta: { title: 'M1 Jahressimulation ' + year, year, dataClass: 'empty', source: '', created: now, modified: now,
      privacy: false, simulated: { roster: false, absences: false }, assumptions: [] },
    people: [], events: [], absences: [], holidays: [], school: year === 2027 ? clone(SCHOOL_BY_2027) : [],
    capacity: [], roster: {}, limits: defaultLimits(), config: defaultConfig(), routes: clone(DEFAULT_ROUTES),
    settings: defaultSettings(year), report: [], planInfo: null, realImports: [], courses: [], measures: [], measureEdits: {}, symbols: emptySymbols()
  };
}
/**
 * Leerer Stand für die echte Planung. Anders als die Vorgabe der Einzeldatei gilt ein Tag ohne Dienstplan-Eintrag als frei:
 * Dienste werden ausdrücklich eingetragen oder eingespielt, nichts wird aus den Stammdaten angenommen.
 */
export function newProjectState(year) {
  const st = emptyState(year);
  st.settings.strict = true;
  return st;
}
