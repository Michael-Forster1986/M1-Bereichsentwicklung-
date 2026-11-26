/* ==========================================================================
 * Oberfläche · Farbe, Kürzel und Legende der Maßnahmen
 * Die festen Maßnahmen haben feste Farben; eigene Schritte tragen eines von acht Farbfeldern (t-x1 … t-x8).
 * Dieses Modul hängt von nichts ab, damit Zustand und Formatierung es beide nutzen können.
 * ========================================================================== */
const BASE_SHORT = { 'Theorie': 'Theorie', 'Praxis': 'Praxis', 'Practical Logbook': 'Logbook', 'FitCheck': 'FitCheck', 'Vorbereitung': 'Vorb.', 'ICA': 'ICA', 'Basic Knowledge': 'Basic', 'FG650': 'FG650', 'Sonstiges': 'Sonst.' };
const BASE_LEGEND = ['Theorie', 'Praxis', 'Practical Logbook', 'FitCheck', 'Vorbereitung', 'ICA', 'Basic Knowledge', 'FG650'];
const custom = new Map();                                  // Name → Farbfeld 1…8 (eigene Schritte und umgefärbte feste Maßnahmen)
const names = new Map();                                   // feste Maßnahme → angezeigte Bezeichnung, wenn sie geändert wurde

/** Bezeichnung, unter der eine Maßnahme angezeigt wird. Der Name selbst bleibt der Schlüssel in Terminen und Wegen. */
export const tname = t => names.get(t) || t;

/** Farbklasse der Vorgabe – ohne Rücksicht auf eine geänderte Farbe. */
export const tclsBase = t => 't-' + String(t).replace(/[^A-Za-z0-9]/g, '');
export const tcls = t => custom.has(t) ? 't-x' + custom.get(t) : tclsBase(t);
export const TSHORT = { ...BASE_SHORT };
export const LEGEND_TYPES = [...BASE_LEGEND, 'Sonstiges'];
/** Gleicht Farben, Kürzel und Legende mit den eigenen Schritten des angezeigten Planungsjahrs ab. */
export function syncMeasures(st) {
  custom.clear(); names.clear();
  for (const k of Object.keys(TSHORT)) if (!(k in BASE_SHORT)) delete TSHORT[k];
  Object.assign(TSHORT, BASE_SHORT);
  for (const [t, e] of Object.entries((st && st.measureEdits) || {})) {
    if (e.label) names.set(t, e.label);
    if (e.short || e.label) TSHORT[t] = e.short || e.label.slice(0, 12);
    if (e.color) custom.set(t, e.color);
  }
  LEGEND_TYPES.length = 0; LEGEND_TYPES.push(...BASE_LEGEND);
  for (const m of (st && st.measures) || []) { custom.set(m.name, m.color); TSHORT[m.name] = m.short; LEGEND_TYPES.push(m.name); }
  LEGEND_TYPES.push('Sonstiges');
}
