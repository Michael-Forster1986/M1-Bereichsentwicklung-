import { COURSE_TYPES, LOGBOOK, ROUTE_CLUSTERS, SHIFTS, TYPES } from './constants.js';
import { normCfg } from './people.js';

// ---------- Maßnahmenarten: eigene Schritte und zulässige Dienste -----------------------------
// Neben den festen Maßnahmen (Theorie, Praxis, Logbook …) kann ein Projekt eigene Schritte führen:
// st.measures = [{ name, short, color, course }]. Für jede Maßnahme – fest oder eigen – legt
// st.settings.shifts fest, in welchen Diensten sie stattfinden darf; gespeichert wird nur, was von der
// Vorgabe abweicht (Logbook in jedem Dienst, alles andere im Frühdienst).

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
  if (RESERVED.has(key)) return '„' + n + '“ gibt es bereits als feste Maßnahme';
  if ((st.measures || []).some(m => m.name.toLowerCase() === key && m.name !== except)) return '„' + n + '“ gibt es bereits';
  return '';
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
export const isCourse = (st, t) => COURSE_TYPES.includes(t) || (measureOf(st, t) || {}).course === true;
export const courseTypesOf = st => [...COURSE_TYPES, ...(st.measures || []).filter(m => m.course).map(m => m.name)];
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
    clusters: ROUTE_CLUSTERS.filter(k => (st.routes[k] || []).includes(name)), people: st.people.filter(p => p.customRoute && p.customRoute.steps.includes(name)).length };
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
