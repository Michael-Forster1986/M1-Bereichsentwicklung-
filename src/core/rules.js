import { ROUTE_CLUSTERS, TYPES } from './constants.js';

// ---------- Regeln der Vorgabe -------------------------------------------------
// Die Planungsregeln der Vorgängerversion waren fest eingebaut. Hier stehen sie als Vorgabe; ein Projekt speichert
// unter st.settings.rules nur, was davon abweicht. Ohne Abweichung rechnet der Planer genau wie bisher.

/** Lehrgang, der bei den Clustern aus „frame“ vor dem Weg liegen muss. */
export const FRAME_TYPE = 'Praxis';
export const DEFAULT_RULES = {
  frame: ['3', '4B'],                 // Cluster, deren Weg erst nach dem Praxis-Lehrgang (oder dem Abschluss aller Doings) beginnt
  tecRoute: ['Theorie', 'Praxis'],    // Weg für Cluster 5 mit Zielstufe TEC
  deferA320: true,                    // Cluster 5 mit Zielmuster A320 wird zurückgestellt
  kombiTecOnly: true,                 // Kombikurs nur für Zielstufe TEC
  autoPrep: true                      // vor einer neu geplanten ICA liegt automatisch ein Tag Vorbereitung
};
export const RULE_SWITCHES = ['deferA320', 'kombiTecOnly', 'autoPrep'];
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const typesIn = st => [...TYPES, ...((st && st.measures) || []).map(m => m.name)];

/** Die geltenden Regeln: Vorgabe, überlagert von den Abweichungen des Projekts. */
export function rulesOf(st) {
  const r = st && st.settings && st.settings.rules;
  return r ? { ...DEFAULT_RULES, ...r } : DEFAULT_RULES;
}
/** Regeln aus einer Datei bereinigen; behalten wird nur, was von der Vorgabe abweicht. */
export function normRules(x, types = TYPES) {
  const out = {};
  if (!x || typeof x !== 'object') return out;
  if (Array.isArray(x.frame)) { const set = new Set(x.frame.map(String)), f = ROUTE_CLUSTERS.filter(k => set.has(k)); if (!same(f, DEFAULT_RULES.frame)) out.frame = f; }
  if (Array.isArray(x.tecRoute)) { const r = [...new Set(x.tecRoute.filter(t => types.includes(t)))]; if (r.length && !same(r, DEFAULT_RULES.tecRoute)) out.tecRoute = r; }
  for (const k of RULE_SWITCHES) if (x[k] === false) out[k] = false;
  return out;
}
export const rulesChanged = st => !!(st.settings && st.settings.rules && Object.keys(st.settings.rules).length);
/** Ändert einzelne Regeln; patch enthält nur, was sich ändern soll. */
export function setRules(st, patch) {
  if (patch.tecRoute && !patch.tecRoute.length) throw new Error('Der Weg für die Zielstufe TEC braucht mindestens einen Schritt');
  const next = normRules({ ...rulesOf(st), ...patch }, typesIn(st));
  if (Object.keys(next).length) st.settings.rules = next; else delete st.settings.rules;
  return rulesOf(st);
}
export function resetRules(st) { delete st.settings.rules; }
/** Nimmt einen entfernten Schritt aus dem Weg für die Zielstufe TEC. */
export function dropFromRules(st, type) {
  const r = rulesOf(st);
  if (!r.tecRoute.includes(type)) return;
  const rest = r.tecRoute.filter(t => t !== type);
  setRules(st, { tecRoute: rest.length ? rest : DEFAULT_RULES.tecRoute.slice() });
}
