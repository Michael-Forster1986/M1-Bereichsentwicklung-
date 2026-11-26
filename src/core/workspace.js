import { FORMAT } from './constants.js';
import { loadAny, readPayload, sanitize } from './project.js';

// ---------- Projekt: mehrere Planungsjahre in einer Datei ------------------
// Ein Projekt bündelt je Planungsjahr einen vollständigen Jahresstand (Personen, Dienstplan,
// Abwesenheiten, Termine, Wege, Einstellungen). Gerechnet wird immer auf genau einem Jahr.
export const PROJECT_VERSION = 5;

/** Verpackt einen einzelnen Jahresstand als Projekt. */
export function wrapProject(state) {
  return { format: FORMAT, version: PROJECT_VERSION, active: state.meta.year, years: { [state.meta.year]: state } };
}
export const projectYears = prj => Object.keys(prj.years).map(Number).sort((a, b) => a - b);
export const isProjectPayload = x => !!x && x.format === FORMAT && !!x.years && typeof x.years === 'object' && !Array.isArray(x.years);

/** Prüft und bereinigt ein Projekt: jedes Planungsjahr durchläuft dieselbe Prüfung wie eine Einzeljahresdatei. */
export function sanitizeProject(x) {
  const warnings = [], years = {};
  for (const [key, raw] of Object.entries(x.years || {})) {
    const y = Number(key);
    if (!Number.isInteger(y) || y < 2000 || y > 2100 || !raw || typeof raw !== 'object') { warnings.push('Planungsjahr „' + key + '“ übersprungen (ungültig)'); continue; }
    const r = sanitize({ ...raw, meta: { ...(raw.meta || {}), year: y } });
    years[y] = r.state;
    for (const w of r.warnings) warnings.push(y + ': ' + w);
  }
  const list = Object.keys(years).map(Number).sort((a, b) => a - b);
  if (!list.length) throw new Error('Projektdatei enthält kein gültiges Planungsjahr');
  const active = list.includes(Number(x.active)) ? Number(x.active) : list[0];
  return { project: { format: FORMAT, version: PROJECT_VERSION, active, years }, warnings };
}
/** Prüft ein bereits gelesenes Objekt: Projekt (Format 5) oder Einzeljahr (Format 4). */
export function sanitizeAny(x) {
  if (isProjectPayload(x)) return sanitizeProject(x);
  const r = sanitize(x);
  return { project: wrapProject(r.state), warnings: r.warnings };
}
/**
 * Erkennt jedes unterstützte Dateiformat und liefert ein geprüftes Projekt.
 * native = true nur für Projektdateien des aktuellen Formats; alles andere ist ein Import.
 */
export function loadProject(text, fileName = '') {
  const { x } = readPayload(text);
  if (isProjectPayload(x)) return { ...sanitizeProject(x), kind: 'Projektdatei', native: true };
  const r = loadAny(text, fileName);
  return { project: wrapProject(r.state), warnings: r.warnings, kind: r.kind === 'Projektdatei' ? 'Projektdatei der Einzeldatei-Version (ein Planungsjahr)' : r.kind, native: false };
}
export const serializeProject = prj => JSON.stringify({ format: FORMAT, version: PROJECT_VERSION, active: prj.active, years: prj.years });
