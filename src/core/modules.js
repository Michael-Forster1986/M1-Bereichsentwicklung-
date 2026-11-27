import { normDate } from './dates.js';

// ---------- Module eines Lehrgangs (Basic Knowledge: M1 … M17) ----------------------------
// Ein Lehrgang der Art „Basic Knowledge“ besteht aus bis zu 17 Modulen. Gibt es Teilbeleger – Personen, die nur
// bestimmte Module brauchen –, werden die Module einzeln geführt: c.modules = [{ no, start, end } | { no, na: true }].
// „na“ heißt: das Modul findet in diesem Lehrgang nicht statt. Ohne Teilbeleger hat der Lehrgang keine Module
// und alle belegen den ganzen Zeitraum.
// Welche Module eine Person braucht, steht bei der Person: p.modules = [1, 3, 7]; ohne Angabe sind es alle.

export const MODULE_TYPE = 'Basic Knowledge';
export const MODULE_COUNT = 17;
/** Zahl der Module einer Lehrgangsart; 0 = die Art kennt keine Module. */
export const moduleCountOf = type => type === MODULE_TYPE ? MODULE_COUNT : 0;
export const moduleName = no => 'M' + no;
export const hasModules = c => !!c && Array.isArray(c.modules) && c.modules.length > 0;

/**
 * Module aus einer Datei oder Eingabe bereinigen. Liefert die vollständige Liste 1 … n oder null, wenn der Lehrgang
 * keine Module führt. Ein Modul ohne gültigen Zeitraum gilt als „findet nicht statt“.
 */
export function normModules(x, type) {
  const n = moduleCountOf(type);
  if (!n || !Array.isArray(x)) return null;
  const by = new Map();
  for (const m of x) { const no = Math.round(Number(m && m.no)); if (no >= 1 && no <= n && !by.has(no)) by.set(no, m); }
  const out = [];
  for (let no = 1; no <= n; no++) {
    const m = by.get(no), s = m && !m.na ? normDate(m.start) : '', e = m && !m.na ? normDate(m.end) : '';
    out.push(s && e && e >= s ? { no, start: s, end: e } : { no, na: true });
  }
  return out.some(m => !m.na) ? out : null;
}
/** Frühester Beginn und spätestes Ende der Module, die stattfinden. */
export function moduleSpan(mods) {
  let start = '', end = '';
  for (const m of mods) if (!m.na) { if (!start || m.start < start) start = m.start; if (!end || m.end > end) end = m.end; }
  return { start, end };
}
/**
 * Prüft die Eingabe der Module: Jedes Modul braucht einen Zeitraum im Planungsjahr – oder ist als „findet nicht statt“
 * gekennzeichnet. Liefert die Befunde als Text; leer heißt: in Ordnung.
 */
export function moduleIssues(rows, type, year) {
  const n = moduleCountOf(type), y = String(year), out = [], by = new Map((rows || []).map(m => [Math.round(Number(m.no)), m]));
  let any = false;
  for (let no = 1; no <= n; no++) {
    const m = by.get(no);
    if (!m) { out.push(moduleName(no) + ': Angabe fehlt'); continue; }
    if (m.na) continue;
    const s = normDate(m.start), e = normDate(m.end);
    if (!s || !e) out.push(moduleName(no) + ': Beginn und Ende eintragen – oder N/A wählen');
    else if (e < s) out.push(moduleName(no) + ': das Ende liegt vor dem Beginn');
    else if (!s.startsWith(y) || !e.startsWith(y)) out.push(moduleName(no) + ': der Zeitraum muss im Jahr ' + y + ' liegen');
    else any = true;
  }
  if (!out.length && !any) out.push('Mindestens ein Modul muss stattfinden');
  return out;
}
/**
 * Liest Modulangaben aus einer Liste: „M3“, „2, 5“, „M1–M4“, „Modul 7“. Liefert die sortierten Nummern,
 * [] für „alle“ oder eine leere Angabe und null, wenn sich die Angabe nicht lesen lässt.
 */
export function parseModuleList(text, count = MODULE_COUNT) {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s || s === 'alle' || s === 'all') return [];
  const out = new Set();
  for (const part of s.replace(/module?/g, ' ').replace(/m/g, ' ').replace(/\s*[-–—]\s*/g, '-').split(/[\s,;]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return null;
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b > count || b < a) return null;
    for (let no = a; no <= b; no++) out.add(no);
  }
  return [...out].sort((a, b) => a - b);
}
/** Module, die eine Person braucht, bereinigen: sortierte Nummern – oder undefined, wenn es alle sind. */
export function normPersonModules(x, count = MODULE_COUNT) {
  if (!Array.isArray(x)) return undefined;
  const list = [...new Set(x.map(v => Math.round(Number(v))).filter(v => v >= 1 && v <= count))].sort((a, b) => a - b);
  return list.length && list.length < count ? list : undefined;
}
/** Nummern der Module dieses Lehrgangs, die die Person belegt: die stattfinden und die sie braucht. */
export function memberModules(c, p) {
  if (!hasModules(c)) return [];
  const need = p && Array.isArray(p.modules) && p.modules.length ? new Set(p.modules) : null;
  return c.modules.filter(m => !m.na && (!need || need.has(m.no))).map(m => m.no);
}
/** Ist die Person in diesem Lehrgang Teilbeleger – belegt sie also nicht alle Module, die stattfinden? */
export const isPartial = (c, p) => hasModules(c) && memberModules(c, p).length < c.modules.filter(m => !m.na).length;
/** Module als Text: „M1–M3, M7“. */
export function moduleText(nos) {
  const list = [...nos].sort((a, b) => a - b), out = [];
  for (let i = 0; i < list.length; i++) { let j = i; while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++; out.push(j > i ? moduleName(list[i]) + '–' + moduleName(list[j]) : moduleName(list[i])); i = j; }
  return out.join(', ');
}
