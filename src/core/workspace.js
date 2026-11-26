import { FORMAT, GATE_TYPES } from './constants.js';
import { clone } from './util.js';
import { addDays, firstMonday, holidaysBavaria, makeCalendar } from './dates.js';
import { emptyState } from './defaults.js';
import { isLocked, normCredit, normPerson } from './people.js';
import { decodeRoster, encodeRoster } from './roster.js';
import { buildIndex } from './indexing.js';
import { routeProgress } from './summary.js';
import { loadAny, readPayload, sanitize } from './project.js';
import { pseudonymize, reidentify } from './pseudonym.js';

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

// ---------- Jahreswechsel ------------------------------------------------------
/** Ende des letzten Termins einer Art im Jahr (leer, wenn keiner). */
const lastEnd = (ix, pk, types) => (ix.evByPerson.get(pk) || []).filter(e => types.has(e.type)).map(e => e.end).sort().pop() || '';
/**
 * Vorleistung, die eine Person aus einem Planungsjahr ins nächste mitnimmt: je Schritt des Wegs die
 * dort geplanten Tage (einschließlich bereits früher angerechneter), höchstens die Solldauer.
 * Nur für begonnene, nicht abgeschlossene Wege – sonst null.
 */
export function carriedCredit(prev, ix, p) {
  const pr = routeProgress(prev, ix, p);
  if (pr.state !== 'partial') return null;
  return normCredit(Object.fromEntries(pr.steps.filter(s => s.have > 0).map(s => [s.type, s.have])));
}
/**
 * Legt aus einem Planungsjahr das Folgejahr an. Übernommen werden Personen, Ausbildungswege, Grenzwerte und
 * Einstellungen; Termine, Abwesenheiten und Tageskapazitäten gehören zum alten Jahr und bleiben dort.
 *   opt.reopen   Personen mit vollständig geplantem Weg auf „Zuordnung offen“ setzen (Vorgabe: ja)
 *   opt.credit   begonnene Wege fortsetzen: geplante Tage als Vorleistung anrechnen (Vorgabe: ja)
 *   opt.roster   Dienstplan um 52 Wochen fortschreiben und als simuliert kennzeichnen (Vorgabe: ja)
 *   opt.holidays gesetzliche Feiertage Bayern eintragen (Vorgabe: ja)
 * Liefert { state, info } – info zählt, was geschehen ist.
 */
export function rolloverYear(prev, opt = {}) {
  const o = { reopen: true, credit: true, roster: true, holidays: true, ...opt };
  const from = prev.meta.year, year = from + 1, ix = buildIndex(prev), cal = makeCalendar(year), next = emptyState(year);
  const info = { from, year, people: prev.people.length, completed: 0, reopened: 0, continued: 0, creditDays: 0, roster: 0, holidays: 0 };
  Object.assign(next.meta, { title: prev.meta.title.includes(String(from)) ? prev.meta.title.replace(String(from), String(year)) : 'M1 Jahressimulation ' + year,
    dataClass: prev.meta.dataClass === 'empty' && prev.people.length ? 'real' : prev.meta.dataClass, source: 'Übernahme aus dem Planungsjahr ' + from, privacy: !!prev.meta.privacy,
    assumptions: prev.meta.assumptions.filter(a => !a.startsWith('Dienstplan aus ')).slice(0, 29) });
  next.config = clone(prev.config); next.routes = clone(prev.routes); next.limits = clone(prev.limits);
  next.settings = { ...clone(prev.settings), start: firstMonday(year) };
  next.school = [];
  if (o.holidays) { next.holidays = holidaysBavaria(year).map(h => h.date); info.holidays = next.holidays.length; }
  for (const p of prev.people) {
    const q = clone(p), state = routeProgress(prev, ix, p).state;
    q.start = '';                                                    // der individuelle Start galt für das alte Jahr
    if (state === 'complete') {
      info.completed++;
      delete q.credit;
      if (o.reopen && !isLocked(p)) {                                  // Ziel erreicht: neue Zuordnung ist eine fachliche Entscheidung
        Object.assign(q, { cluster: 'offen', target: '', level: '', confirmed: false, gate: '' });
        delete q.rotation; delete q.customRoute; delete q.targetAssumed;
        info.reopened++;
      }
    } else if (state === 'partial' && o.credit) {
      const credit = carriedCredit(prev, ix, p);
      if (credit) { q.credit = credit; info.continued++; info.creditDays += Object.values(credit).reduce((s, v) => s + v, 0); }
      if (!q.gate) q.gate = lastEnd(ix, p.pk, GATE_TYPES);              // Kurse des Vorjahres gelten als Voraussetzung der ICA
    } else if (state === 'partial') delete q.credit;
    next.people.push(normPerson(q));
  }
  if (o.roster) {
    // Gleicher Wochentag 52 Wochen zuvor – setzt Wochen- und Vier-Wochen-Rhythmen nahtlos fort
    for (const p of prev.people) {
      const old = prev.roster[p.pk]; if (typeof old !== 'string' || !old) continue;
      const src = decodeRoster(old, ix.n), arr = new Uint8Array(cal.n);
      for (let d = 0; d < cal.n; d++) { let j = ix.cal.idx(addDays(cal.iso[d], -364)); while (j >= ix.n) j -= 364; arr[d] = j >= 0 ? src[j] : 0; }
      next.roster[p.pk] = encodeRoster(arr); info.roster++;
    }
    if (info.roster) { next.meta.simulated.roster = true; next.meta.assumptions.push('Dienstplan aus ' + from + ' um 52 Wochen fortgeschrieben (simuliert) – durch den echten Dienstplan ersetzen'); }
  }
  return { state: next, info };
}
/**
 * Gleicht die Vorleistungen eines Planungsjahres neu mit dem Vorjahr ab (nach Änderungen am Vorjahresplan).
 * Betrifft nur Personen, die in beiden Jahren mit demselben Cluster und Ziel geführt werden. Liefert die Zahl der Änderungen.
 */
export function refreshCredits(prev, st) {
  const ix = buildIndex(prev), old = new Map(prev.people.map(p => [p.pk, p]));
  let changed = 0;
  for (const p of st.people) {
    const q = old.get(p.pk);
    if (!q || q.cluster !== p.cluster || q.target !== p.target || q.level !== p.level) continue;
    const credit = carriedCredit(prev, ix, q), before = JSON.stringify(p.credit || null);
    if (credit) p.credit = credit; else delete p.credit;
    if (JSON.stringify(p.credit || null) !== before) changed++;
  }
  return changed;
}

// ---------- Pseudonymisierung über alle Planungsjahre ---------------------------
/**
 * Ersetzt in allen Planungsjahren Personalnummern und Namen durch Pseudonyme. Dieselbe Person trägt in jedem
 * Jahr dasselbe Pseudonym; die Schlüsseltabelle wird getrennt geliefert.
 */
export function pseudonymizeProject(prj) {
  const years = projectYears(prj), alias = new Map(), used = new Set(), copy = { ...prj, years: {} };
  for (const y of years) for (const p of prj.years[y].people) if (!alias.has(p.pk) && p.alias && !used.has(p.alias)) { alias.set(p.pk, p.alias); used.add(p.alias); }
  // Personen ohne eindeutiges Pseudonym (z. B. aus getrennt gepflegten Dateien) erhalten ein neues
  let next = 1;
  for (const a of used) { const m = a.match(/^P-(\d+)$/); if (m) next = Math.max(next, +m[1] + 1); }
  for (const y of years) for (const p of prj.years[y].people) if (!alias.has(p.pk)) { let a; do { a = 'P-' + String(next++).padStart(3, '0'); } while (used.has(a)); alias.set(p.pk, a); used.add(a); }
  const key = new Map();
  for (const y of years) {
    const st = clone(prj.years[y]);
    for (const p of st.people) p.alias = alias.get(p.pk);
    const res = pseudonymize(st);
    copy.years[y] = res.state;
    for (const k of res.key) if (!key.has(k.alias)) key.set(k.alias, k);
  }
  return { project: copy, key: [...key.values()].sort((a, b) => a.alias < b.alias ? -1 : 1) };
}
/** Ordnet mit der Schlüsseltabelle in allen Planungsjahren Namen und Nummern wieder zu; liefert die Zahl der Treffer je Jahr. */
export function reidentifyProject(prj, keyRows) {
  const hits = {};
  for (const y of projectYears(prj)) hits[y] = reidentify(prj.years[y], keyRows);
  return hits;
}
