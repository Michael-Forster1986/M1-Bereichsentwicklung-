import { DAY } from './constants.js';
import { addDays, makeCalendar } from './dates.js';
import { decodeRoster, encodeRoster, rosterCode } from './roster.js';
import { MATRIX_TARGETS, defaultCodeMap } from './daymatrix.js';
import { assignAliases, normPerson } from './people.js';
import { typesOf } from './measures.js';
import { setSymbols, symbolsOf } from './symbols.js';

// ---------- Schichtplan einspielen ---------------------------------------------------------
// Der Schichtplan kommt monatsweise als Excel-Tabelle: eine Zeile je Person, eine Spalte je Tag, in den Zellen die
// Schichtsymbole (F1, S1, N2, Up, LC* …). parseDayMatrix liest die Tabelle; hier wird festgelegt, was ein Symbol für
// die Planung bedeutet, und der Plan wird übernommen. Die Symbole selbst bleiben gespeichert und werden so angezeigt.

/** Was ein Symbol bedeuten kann: Dienst, dienstfrei, eine Abwesenheit – oder nichts davon ('' = nur anzeigen). */
export const SYMBOL_TARGETS = MATRIX_TARGETS;
const DUTY = new Set(['Früh', 'Spät', 'Nacht', 'Frei']), AWAY = new Set(['Urlaub', 'Krank', 'Sonstiges']);
export const isDutyTarget = t => DUTY.has(t);

/** Gespeicherte Zuordnung bereinigen. */
export function normSymbolMap(x) {
  const out = {};
  if (!x || typeof x !== 'object') return out;
  for (const [k, v] of Object.entries(x).slice(0, 300)) { const s = String(k).trim().slice(0, 8); if (s && v && SYMBOL_TARGETS.includes(v)) out[s] = v; }      // „ohne Bedeutung“ wird nicht gespeichert
  return out;
}
/**
 * Vorschlag, was die Symbole bedeuten. known = bereits gespeicherte Zuordnung (gewinnt). Vorgeschlagen wird nur, was sich
 * am Symbol ablesen lässt: „-“ ist frei, F/S/N mit Ziffer oder Kleinbuchstabe ist Früh/Spät/Nacht (F1, S41, Nv0, Fm),
 * dazu die üblichen Kürzel für Urlaub und Krank. Alles andere bleibt offen und wird vom Menschen zugeordnet.
 */
export function defaultSymbolMap(symbols, known = {}) {
  const map = {};
  for (const s of symbols) {
    if (Object.prototype.hasOwnProperty.call(known, s) && SYMBOL_TARGETS.includes(known[s])) { map[s] = known[s]; continue; }
    map[s] = s === '-' || s === '–' || s === '/' ? 'Frei'
      : /^F(\d{1,2}|[a-z]\d?)$/.test(s) ? 'Früh' : /^S(\d{1,2}|[a-z]\d?)$/.test(s) ? 'Spät' : /^N(\d{1,2}|[a-z]\d?)$/.test(s) ? 'Nacht'
        : defaultCodeMap([s], true)[s] || '';
  }
  return map;
}
/** Symbole der Tabelle, für die noch keine Bedeutung feststeht. */
export const openSymbols = (parsed, map) => [...(parsed.symbols || new Map()).keys()].filter(s => !map[s]);

/** Abwesenheiten aus den Symbolen: aufeinanderfolgende Tage derselben Art werden zu einem Zeitraum. */
function absencesOf(parsed, cells, map) {
  const order = parsed.dates.map((d, i) => [d, i]).sort((a, b) => a[0] < b[0] ? -1 : 1), rows = [];
  for (const [pk, codes] of cells) {
    let cur = null;
    for (const [date, i] of order) {
      const t = map[codes[i]] || '', type = AWAY.has(t) ? t : '';
      if (cur && type === cur.type && Date.parse(date) - Date.parse(cur.end) === DAY) { cur.end = date; continue; }
      if (cur) rows.push(cur);
      cur = type ? { pk, type, start: date, end: date } : null;
    }
    if (cur) rows.push(cur);
  }
  return rows;
}
/** Was die Übernahme bewirken würde – für die Vorschau. */
export function shiftPlanSummary(parsed, map, addPeople = true) {
  const cells = new Map(parsed.cells);
  if (addPeople) for (const p of parsed.newPeople || []) cells.set(p.pk, p.codes);
  let duty = 0, free = 0, open = 0;
  for (const codes of cells.values()) for (const c of codes) { if (!c) continue; const t = map[c] || ''; if (t === 'Frei') free++; else if (DUTY.has(t)) duty++; else if (!t) open++; }
  const abs = absencesOf(parsed, cells, map);
  return { persons: cells.size, duty, free, open, absences: abs.length, absenceDays: abs.reduce((s, r) => s + Math.round((Date.parse(r.end) - Date.parse(r.start)) / DAY) + 1, 0) };
}
/**
 * Übernimmt den Schichtplan. Für die Personen der Tabelle gilt im Zeitraum der Tabelle danach genau, was in der Tabelle
 * steht: Dienste und dienstfreie Tage nach der Zuordnung, Abwesenheiten (Urlaub, Krank, Sonstiges) ersetzen die bisherigen.
 * Tage mit einem Symbol ohne Bedeutung bekommen keinen Dienst-Eintrag. Jedes Symbol wird gespeichert und so angezeigt.
 * opt.addPeople (Vorgabe: ja): Personen der Tabelle, die es im Projekt noch nicht gibt, werden mit Cluster „offen“ angelegt.
 * Liefert { people, persons, rosterDays, freeDays, absences, absenceDays, removed, symbolDays, dropped }.
 */
export function applyShiftPlan(st, parsed, map, opt = {}) {
  const info = { people: 0, persons: 0, rosterDays: 0, freeDays: 0, absences: 0, absenceDays: 0, removed: 0, symbolDays: 0, dropped: 0 };
  const cal = makeCalendar(st.meta.year), n = cal.n, cells = new Map(parsed.cells), have = new Set(st.people.map(p => p.pk));
  if (opt.addPeople !== false) for (const np of parsed.newPeople || []) {
    if (have.has(np.pk)) continue;
    const p = normPerson({ pk: np.pk, name: np.name, org: np.org, rights: np.role, cluster: 'offen' }, typesOf(st));
    if (!p.pk) continue;
    st.people.push(p); have.add(p.pk); cells.set(p.pk, np.codes); info.people++;
  }
  if (info.people) assignAliases(st.people);
  info.persons = cells.size;
  // Symbole speichern; Tage der Tabelle ohne Eintrag verlieren Symbol und Dienst
  for (const [pk, codes] of cells) {
    const arr = decodeRoster(st.roster[pk], n), entries = [];
    parsed.dates.forEach((date, i) => {
      const d = cal.idx(date); if (!(d >= 0 && d < n)) return;
      const sym = codes[i] || '';
      if (!sym) arr[d] = 0;
      entries.push([d, sym]); if (sym) info.symbolDays++;
    });
    if (arr.some(c => c > 0)) st.roster[pk] = encodeRoster(arr); else delete st.roster[pk];
    info.dropped += setSymbols(st, n, pk, entries);
  }
  // die Zuordnung merken: der nächste Monat kommt mit denselben Symbolen
  const used = new Set((parsed.symbols || new Map()).keys());
  st.settings.symbols = normSymbolMap({ ...(st.settings.symbols || {}), ...Object.fromEntries(Object.entries(map).filter(([s]) => used.has(s))) });
  // Dienste und Abwesenheiten folgen aus den Symbolen
  Object.assign(info, deriveFromSymbols(st, [...cells.keys()], { start: cal.idx(parsed.range.start), end: cal.idx(parsed.range.end) }));
  return info;
}
/**
 * Leitet Dienste und Abwesenheiten aus den gespeicherten Symbolen ab – nach st.settings.symbols. Betrachtet werden nur Tage,
 * die ein Symbol tragen; je zusammenhängendem Lauf solcher Tage ersetzen die Abwesenheiten aus den Symbolen die bisherigen.
 * pks = Personen (ohne Angabe: alle mit Symbolen), range = { start, end } als Tagesindizes (ohne Angabe: das ganze Jahr).
 * Liefert { rosterDays, freeDays, absences, absenceDays, removed }.
 */
export function deriveFromSymbols(st, pks = null, range = null) {
  const info = { rosterDays: 0, freeDays: 0, absences: 0, absenceDays: 0, removed: 0 };
  const cal = makeCalendar(st.meta.year), n = cal.n, map = st.settings.symbols || {}, area = new Map(st.people.map(p => [p.pk, p.area]));
  const a = range ? Math.max(0, range.start) : 0, b = range ? Math.min(n - 1, range.end) : n - 1;
  for (const pk of pks || Object.keys((st.symbols && st.symbols.days) || {})) {
    if (!area.has(pk)) continue;
    const sym = symbolsOf(st, pk, n), arr = decodeRoster(st.roster[pk], n), runs = [], fresh = [];
    let run = null, cur = null;
    for (let d = a; d <= b; d++) {
      if (!sym[d]) { run = null; if (cur) { fresh.push(cur); cur = null; } continue; }
      if (!run) runs.push(run = [d, d]); else run[1] = d;
      const t = map[sym[d]] || '';
      arr[d] = DUTY.has(t) ? rosterCode(area.get(pk) || 'M1', t) : 0;
      if (arr[d] > 1) info.rosterDays++; else if (arr[d] === 1) info.freeDays++;
      const type = AWAY.has(t) ? t : '';
      if (cur && type === cur.type) { cur.end = cal.iso[d]; continue; }
      if (cur) fresh.push(cur);
      cur = type ? { pk, type, start: cal.iso[d], end: cal.iso[d] } : null;
    }
    if (cur) fresh.push(cur);
    if (arr.some(c => c > 0)) st.roster[pk] = encodeRoster(arr); else delete st.roster[pk];
    // bisherige Abwesenheiten in den Läufen entfernen (auch simulierte); was außerhalb liegt, bleibt
    for (const [s, e] of runs) {
      const start = cal.iso[s], end = cal.iso[e], kept = [];
      for (const x of st.absences) {
        if (x.pk !== pk || x.end < start || x.start > end) { kept.push(x); continue; }
        info.removed++;
        if (x.start < start) kept.push({ ...x, end: addDays(start, -1) });
        if (x.end > end) kept.push({ ...x, start: addDays(end, 1) });
      }
      st.absences = kept;
    }
    st.absences.push(...fresh);
    info.absences += fresh.length; info.absenceDays += fresh.reduce((s, r) => s + Math.round((Date.parse(r.end) - Date.parse(r.start)) / DAY) + 1, 0);
  }
  st.meta.simulated.absences = st.absences.some(x => x.synthetic);
  return info;
}
/**
 * Ändert die Bedeutung von Symbolen (patch: Symbol → Bedeutung) und wendet sie sofort auf alle Tage an, die diese Symbole
 * tragen. Liefert das Ergebnis von deriveFromSymbols.
 */
export function setSymbolMap(st, patch) {
  st.settings.symbols = normSymbolMap({ ...(st.settings.symbols || {}), ...patch });
  for (const [s, t] of Object.entries(patch)) if (!t) delete st.settings.symbols[s];
  return deriveFromSymbols(st);
}
