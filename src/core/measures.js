import { COURSE_TYPES, LOGBOOK, PREP, ROUTE_CLUSTERS, SHIFTS, TYPES } from './constants.js';
import { normCfg } from './people.js';
import { dropFromRules, rulesOf } from './rules.js';

// ---------- Maßnahmenarten: eigene Schritte und zulässige Dienste -----------------------------
// Neben den festen Maßnahmen (Theorie, Praxis, Logbook …) kann ein Projekt eigene Schritte führen:
// st.measures = [{ name, short, color, course }]. Für jede Maßnahme – fest oder eigen – legt
// st.settings.shifts fest, in welchen Diensten sie stattfinden darf; gespeichert wird nur, was von der
// Vorgabe abweicht (Logbook in jedem Dienst, alles andere im Frühdienst).
// Auch die festen Maßnahmen lassen sich anpassen: st.measureEdits = { Maßnahme: { label, short, color, course } }.
// Der Name der Maßnahme bleibt dabei der Schlüssel in Terminen, Wegen und Dateien; „label“ ist nur die Anzeige.

/** Zahl der Farbfelder für eigene Schritte (Klassen t-x1 … t-x8 in der Gestaltung). */
export const MEASURE_COLORS = 8;
export const MAX_MEASURES = 24;
const RESERVED = new Set([...TYPES, 'Sonstiges'].map(t => t.toLowerCase()));
export const defaultShifts = t => t === LOGBOOK ? [true, true, true] : [true, false, false];
const cleanName = v => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

/** Warum ein Name für einen eigenen Schritt nicht geht – oder '' wenn er passt. */
export function measureNameIssue(st, name, except = '') {
  const n = cleanName(name), key = n.toLowerCase();
  if (!n) return 'Bezeichnung fehlt';
  if (/[|;"<>\\]/.test(n)) return 'Bezeichnung enthält ein unzulässiges Zeichen (| ; " < > \\)';
  if (RESERVED.has(key) && n !== except) return '„' + n + '“ gibt es bereits als feste Maßnahme';
  if ((st.measures || []).some(m => m.name.toLowerCase() === key && m.name !== except)) return '„' + n + '“ gibt es bereits';
  for (const [t, e] of Object.entries(st.measureEdits || {})) if (t !== except && e.label && e.label.toLowerCase() === key) return '„' + n + '“ heißt bereits die Maßnahme ' + t;
  return '';
}
/** Feste Maßnahmen, deren Art (einzeln im Dienst oder Lehrgang) feststeht: Sie hängen an der Prüfungslogik. */
const KIND_FIXED = new Set([PREP, 'ICA']);
export const isBuiltin = t => TYPES.includes(t);
export const kindFixed = t => KIND_FIXED.has(t);
/** Anpassung einer festen Maßnahme oder null. */
export const editOf = (st, t) => (st.measureEdits && st.measureEdits[t]) || null;
/** Bezeichnung, unter der eine Maßnahme angezeigt wird. */
export const labelOf = (st, t) => { const e = editOf(st, t); return (e && e.label) || t; };
/** Anpassungen fester Maßnahmen aus einer Datei bereinigen; behalten wird nur, was von der Vorgabe abweicht. */
export function normMeasureEdits(x, st) {
  const out = {}, probe = { measures: st.measures || [], measureEdits: out };
  if (!x || typeof x !== 'object') return out;
  for (const t of TYPES) {
    const e = x[t]; if (!e || typeof e !== 'object') continue;
    const o = {}, label = cleanName(e.label), short = cleanName(e.short).slice(0, 12), color = Math.round(Number(e.color));
    if (label && label !== t && !measureNameIssue(probe, label, t)) o.label = label;
    if (short) o.short = short;
    if (color >= 1 && color <= MEASURE_COLORS) o.color = color;
    if (typeof e.course === 'boolean' && !KIND_FIXED.has(t) && e.course !== COURSE_TYPES.includes(t)) o.course = e.course;
    if (Object.keys(o).length) out[t] = o;
  }
  return out;
}
/** Eigene Schritte aus einer Datei bereinigen. */
export function normMeasures(list) {
  const out = [], probe = { measures: out };
  for (const m of Array.isArray(list) ? list : []) {
    const name = cleanName(m && m.name);
    if (measureNameIssue(probe, name) || out.length >= MAX_MEASURES) continue;
    const color = Math.round(Number(m.color));
    out.push({ name, short: cleanName(m.short).slice(0, 12) || name.slice(0, 12), color: color >= 1 && color <= MEASURE_COLORS ? color : (out.length % MEASURE_COLORS) + 1, course: m.course === true });
  }
  return out;
}
/** Zulässige Dienste bereinigen; behalten wird nur, was von der Vorgabe abweicht. */
export function normShifts(x, types) {
  const out = {};
  if (!x || typeof x !== 'object') return out;
  for (const t of types) {
    const s = x[t]; if (!Array.isArray(s) || s.length !== 3 || !s.some(Boolean)) continue;
    const v = s.map(Boolean), d = defaultShifts(t);
    if (v.some((b, i) => b !== d[i])) out[t] = v;
  }
  return out;
}

/** Alle Maßnahmenarten des Projekts: die festen, dann die eigenen. */
export const typesOf = st => st.measures && st.measures.length ? [...TYPES, ...st.measures.map(m => m.name)] : TYPES;
export const measureOf = (st, t) => (st.measures || []).find(m => m.name === t) || null;
/** Findet die Maßnahme als Lehrgang statt (zusammenhängender Block für eine Gruppe)? */
export function isCourse(st, t) {
  const e = editOf(st, t);
  if (e && typeof e.course === 'boolean') return e.course;
  return COURSE_TYPES.includes(t) || (measureOf(st, t) || {}).course === true;
}
/** Die Lehrgangsarten des Projekts: zuerst die der Vorgabe, dann umgestellte feste Maßnahmen, dann eigene Schritte. */
export const courseTypesOf = st => [...COURSE_TYPES, ...TYPES.filter(t => !COURSE_TYPES.includes(t)), ...(st.measures || []).map(m => m.name)].filter(t => isCourse(st, t));
/** [Früh, Spät, Nacht] – in welchen Diensten die Maßnahme stattfinden darf. */
export function shiftsOf(st, t) {
  const s = st.settings && st.settings.shifts && st.settings.shifts[t];
  return Array.isArray(s) && s.length === 3 && s.some(Boolean) ? s : defaultShifts(t);
}
/** k = Bereich × Dienst (0…8). */
export const shiftOk = (st, t, k) => shiftsOf(st, t)[k % 3] === true;
export function shiftText(st, t) {
  const s = shiftsOf(st, t), names = SHIFTS.filter((_, i) => s[i]);
  return names.length === 3 ? 'in jedem Dienst' : 'nur im ' + names.join('- und ') + 'dienst';
}
/** Befund für einen Tag außerhalb der zulässigen Dienste. */
export function shiftIssue(st, t) {
  const s = shiftsOf(st, t);
  return s[0] && !s[1] && !s[2] ? 'Außerhalb Frühdienst' : 'Außerhalb der zulässigen Dienste (' + SHIFTS.filter((_, i) => s[i]).join(', ') + ')';
}
/**
 * Passt eine feste Maßnahme an. patch: { label, short, color, course } – leere Bezeichnung oder Kürzel, Farbe 0 und die
 * Art der Vorgabe setzen den jeweiligen Wert zurück. Die Art lässt sich nur ändern, solange es keine Termine oder
 * Lehrgänge dieser Maßnahme gibt.
 */
export function editBuiltin(st, t, patch) {
  if (!TYPES.includes(t)) throw new Error('Keine feste Maßnahme: ' + t);
  const all = st.measureEdits || (st.measureEdits = {}), e = { ...(all[t] || {}) };
  if (patch.label !== undefined) {
    const label = cleanName(patch.label);
    if (!label || label === t) delete e.label;
    else { const issue = measureNameIssue(st, label, t); if (issue) throw new Error(issue); e.label = label; }
  }
  if (patch.short !== undefined) { const short = cleanName(patch.short).slice(0, 12); if (short) e.short = short; else delete e.short; }
  if (patch.color !== undefined) { const c = Math.round(Number(patch.color)); if (c >= 1 && c <= MEASURE_COLORS) e.color = c; else delete e.color; }
  if (patch.course !== undefined && !!patch.course !== isCourse(st, t)) {
    if (KIND_FIXED.has(t)) throw new Error('Die Art von ' + t + ' steht fest');
    const u = measureUsage(st, t);
    if (u.events || u.courses) throw new Error('Die Art lässt sich nicht mehr ändern: Es gibt bereits ' + (u.courses ? u.courses + ' Lehrgänge' : u.events + ' Termine') + ' dieser Maßnahme');
    if (!!patch.course === COURSE_TYPES.includes(t)) delete e.course; else e.course = !!patch.course;
  }
  if (Object.keys(e).length) all[t] = e; else delete all[t];
  return e;
}
/** Setzt eine feste Maßnahme auf die Vorgabe zurück (Bezeichnung, Kürzel, Farbe, Art und Dienste). Liefert, ob alles zurückgesetzt wurde. */
export function resetBuiltin(st, t) {
  const e = editOf(st, t), u = measureUsage(st, t), keep = !!e && e.course !== undefined && (u.events > 0 || u.courses > 0);
  if (st.measureEdits) { if (keep) st.measureEdits[t] = { course: e.course }; else delete st.measureEdits[t]; }
  if (st.settings.shifts) delete st.settings.shifts[t];
  return !keep;                                              // false: die Art bleibt, weil es bereits Termine oder Lehrgänge gibt
}
/** Legt die zulässigen Dienste einer Maßnahme fest; mindestens ein Dienst muss bleiben. */
export function setShifts(st, t, shifts) {
  const v = [0, 1, 2].map(i => !!shifts[i]);
  if (!v.some(Boolean)) throw new Error('Mindestens ein Dienst muss zulässig bleiben');
  const d = defaultShifts(t), all = st.settings.shifts || (st.settings.shifts = {});
  if (v.some((b, i) => b !== d[i])) all[t] = v; else delete all[t];
}

/** Wo ein eigener Schritt verwendet wird. */
export function measureUsage(st, name) {
  return { events: st.events.filter(e => e.type === name).length, courses: (st.courses || []).filter(c => c.type === name).length,
    tec: rulesOf(st).tecRoute.includes(name), clusters: ROUTE_CLUSTERS.filter(k => (st.routes[k] || []).includes(name)), people: st.people.filter(p => p.customRoute && p.customRoute.steps.includes(name)).length };
}
/**
 * Legt einen eigenen Schritt an. def: { name, short, color, course, shifts }, cfg: { days, trainee, mentor, tec, examiner }
 * – die Werte gelten zunächst für jeden Cluster und lassen sich dort einzeln ändern.
 */
export function addMeasure(st, def, cfg) {
  const issue = measureNameIssue(st, def.name);
  if (issue) throw new Error(issue);
  st.measures = st.measures || [];
  if (st.measures.length >= MAX_MEASURES) throw new Error('Mehr als ' + MAX_MEASURES + ' eigene Schritte sind nicht möglich');
  const [m] = normMeasures([{ ...def, color: def.color || (st.measures.length % MEASURE_COLORS) + 1 }]);
  st.measures.push(m);
  const c = normCfg(cfg);
  for (const k of ROUTE_CLUSTERS) st.config[k][m.name] = { ...c };
  for (const p of st.people) if (p.customRoute) p.customRoute.config[m.name] = { ...c };
  if (def.shifts) setShifts(st, m.name, def.shifts);
  return m;
}
/** Ändert Kürzel, Farbe oder Art eines eigenen Schritts (der Name bleibt). */
export function editMeasure(st, name, patch) {
  const m = measureOf(st, name); if (!m) throw new Error('Schritt nicht gefunden');
  if (patch.course !== undefined && !!patch.course !== m.course) {
    const u = measureUsage(st, name);
    if (u.events || u.courses) throw new Error('Die Art lässt sich nicht mehr ändern: Es gibt bereits ' + (u.courses ? u.courses + ' Lehrgänge' : u.events + ' Termine') + ' dieser Maßnahme');
    m.course = !!patch.course;
  }
  if (patch.short !== undefined) m.short = cleanName(patch.short).slice(0, 12) || m.name.slice(0, 12);
  if (patch.color !== undefined) { const c = Math.round(Number(patch.color)); if (c >= 1 && c <= MEASURE_COLORS) m.color = c; }
  return m;
}
/** Entfernt einen eigenen Schritt aus Katalog, Wegen und Vorgaben. Geht nur, solange es keine Termine oder Lehrgänge dazu gibt. */
export function removeMeasure(st, name) {
  if (!measureOf(st, name)) throw new Error('Schritt nicht gefunden');
  const u = measureUsage(st, name);
  if (u.events || u.courses) throw new Error('„' + name + '“ wird noch verwendet: ' + [u.events ? u.events + ' Termine' : '', u.courses ? u.courses + ' Lehrgänge' : ''].filter(Boolean).join(', ') + '. Bitte zuerst entfernen.');
  st.measures = st.measures.filter(m => m.name !== name);
  for (const k of ROUTE_CLUSTERS) { st.routes[k] = (st.routes[k] || []).filter(t => t !== name); delete st.config[k][name]; }
  for (const p of st.people) {
    if (p.customRoute) { p.customRoute.steps = p.customRoute.steps.filter(t => t !== name); delete p.customRoute.config[name]; }
    if (p.credit) { delete p.credit[name]; if (!Object.keys(p.credit).length) delete p.credit; }
  }
  if (st.settings.shifts) delete st.settings.shifts[name];
  dropFromRules(st, name);
}
/** Setzt einen Schritt im Weg an eine neue Stelle (to = Zielposition in der Liste ohne den Schritt). */
export function moveStep(steps, type, to) {
  const rest = steps.filter(t => t !== type);
  if (rest.length === steps.length) return steps.slice();
  rest.splice(Math.max(0, Math.min(rest.length, to)), 0, type);
  return rest;
}
/**
 * Nimmt einen Schritt in den Weg auf. Feste Maßnahmen landen an ihrer üblichen Stelle (Kurse vor Logbook,
 * FitCheck und ICA), eigene Schritte am Ende – beides lässt sich danach verschieben.
 */
export function insertStep(steps, type) {
  if (steps.includes(type)) return steps.slice();
  const at = TYPES.indexOf(type), out = steps.slice();
  if (at < 0) { out.push(type); return out; }
  const next = out.findIndex(t => TYPES.indexOf(t) > at);
  out.splice(next < 0 ? out.length : next, 0, type);
  return out;
}
