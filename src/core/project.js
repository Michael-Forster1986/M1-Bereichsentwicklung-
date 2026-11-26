import { moduleSpan, normModules } from './modules.js';
import { normRules } from './rules.js';
import { ABS_TYPES, AREAS, COURSE_TYPES, FORMAT, ROUTE_CLUSTERS, SHIFTS, TARGETS } from './constants.js';
import { courseTypesOf, isCourse, normMeasureEdits, normMeasures, normShifts, typesOf } from './measures.js';
import { clamp, fin, kOf, num, uid } from './util.js';
import { makeCalendar, normDate, validDate } from './dates.js';
import { defaultLimits, emptyState } from './defaults.js';
import { assignAliases, normCfg, normPerson } from './people.js';
import { decodeRoster, encodeRoster, rosterCode } from './roster.js';
import { buildIndex } from './indexing.js';

// ---------- Laden, Prüfen, Altformat ------------------------------------
function normEvent(e, known, types) {
  if (!e || !known.has(String(e.pk))) return null;
  let dates = Array.isArray(e.dates) ? [...new Set(e.dates.filter(validDate))].sort() : null;
  const start = dates && dates.length ? dates[0] : normDate(e.start), end = dates && dates.length ? dates[dates.length - 1] : normDate(e.end);
  if (!start || !end || end < start) return null;
  const out = { id: String(e.id || uid()), pk: String(e.pk), type: types.has(e.type) ? e.type : 'Sonstiges',
    auto: !!e.auto, start, end, trainee: clamp(num(e.trainee), 0, 5), mentor: clamp(num(e.mentor), 0, 5),
    tec: clamp(num(e.tec), 0, 5), examiner: clamp(num(e.examiner), 0, 5), target: String(e.target || '') };
  if (dates && dates.length) out.dates = dates;
  if (e.dayAreas && typeof e.dayAreas === 'object') { const da = {}; for (const [d, a] of Object.entries(e.dayAreas)) if (validDate(d) && AREAS.includes(a)) da[d] = a; if (Object.keys(da).length) out.dayAreas = da; }
  if (AREAS.includes(e.area) && !e.courseKind) out.area = e.area;
  for (const k of ['synthetic', 'partial']) if (e[k]) out[k] = true;
  for (const k of ['title', 'courseKind', 'note']) if (e[k]) out[k] = String(e[k]).slice(0, 200);
  if (e.courseId) out.courseId = String(e.courseId).slice(0, 60);
  return out;
}
/** Prüft einen Lehrgangstermin (Art, Zeitraum, Plätze). types = Maßnahmen, die als Lehrgang stattfinden. */
export function normCourse(c, types = COURSE_TYPES) {
  if (!c || !types.includes(c.type)) return null;
  // Lehrgang mit Modulen: der Zeitraum ergibt sich aus den Modulen, die stattfinden
  const modules = normModules(c.modules, c.type), span = modules ? moduleSpan(modules) : null;
  const start = span ? span.start : normDate(c.start), end = span ? span.end : normDate(c.end);
  if (!start || !end || end < start) return null;
  const seats = Math.round(num(c.seats));
  return { id: String(c.id || uid()).slice(0, 60), type: c.type, title: String(c.title || c.type).trim().slice(0, 80) || c.type, target: TARGETS.includes(c.target) ? c.target : '',
    start, end, seats: seats > 0 ? clamp(seats, 1, 500) : null, fixed: c.fixed !== false, ...(c.synthetic ? { synthetic: true } : {}), ...(c.note ? { note: String(c.note).slice(0, 200) } : {}), ...(modules ? { modules } : {}) };
}
/**
 * Bringt Lehrgänge und ihre Teilnehmertermine in Einklang: Termine ohne Lehrgang verlieren den Bezug, und
 * Lehrgangstermine der Vorgängerfassung (gleiche Art, Bezeichnung und Zeitraum) werden zu einem Lehrgang gebündelt.
 */
export function linkCourses(st) {
  const ids = new Set(st.courses.map(c => c.id)), byKey = new Map(st.courses.map(c => [c.type + '|' + c.title + '|' + c.start + '|' + c.end, c]));
  for (const e of st.events) {
    if (e.courseId && !ids.has(e.courseId)) delete e.courseId;
    if (e.courseId || !e.courseKind || !isCourse(st, e.type) || !e.title) continue;
    const key = e.type + '|' + e.title + '|' + e.start + '|' + e.end;
    let c = byKey.get(key);
    if (!c) { c = { id: uid(), type: e.type, title: e.title, target: '', start: e.start, end: e.end, seats: null, fixed: true }; st.courses.push(c); byKey.set(key, c); ids.add(c.id); }
    e.courseId = c.id;
  }
  st.courses.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : a.title < b.title ? -1 : 1);
}
/** Prüft und bereinigt eine Projektdatei des aktuellen Formats. */
export function sanitize(x) {
  const year = Number.isInteger(x?.meta?.year) && x.meta.year >= 2000 && x.meta.year <= 2100 ? x.meta.year : 2027;
  const st = emptyState(year), warnings = [];
  Object.assign(st.meta, { title: String(x.meta?.title || st.meta.title).slice(0, 120), dataClass: ['demo', 'real', 'pseudo', 'empty'].includes(x.meta?.dataClass) ? x.meta.dataClass : 'real',
    source: String(x.meta?.source || '').slice(0, 300), created: x.meta?.created || st.meta.created, privacy: !!x.meta?.privacy,
    simulated: { roster: !!x.meta?.simulated?.roster, absences: !!x.meta?.simulated?.absences },
    assumptions: Array.isArray(x.meta?.assumptions) ? x.meta.assumptions.map(a => String(a).slice(0, 300)).slice(0, 30) : [] });
  st.measures = normMeasures(x.measures);
  st.measureEdits = normMeasureEdits(x.measureEdits, st);
  const types = typesOf(st), typeSet = new Set([...types, 'Sonstiges']);
  const seen = new Set();
  for (const p of Array.isArray(x.people) ? x.people : []) {
    const np = normPerson(p || {}, types);
    if (!np.pk || seen.has(np.pk)) { warnings.push('Person ohne oder mit doppelter Personalnummer übersprungen'); continue; }
    seen.add(np.pk); st.people.push(np);
  }
  assignAliases(st.people);
  const before = (x.events || []).length;
  st.events = (Array.isArray(x.events) ? x.events : []).map(e => normEvent(e, seen, typeSet)).filter(Boolean);
  if (st.events.length !== before) warnings.push((before - st.events.length) + ' ungültige Termine übersprungen');
  st.absences = (Array.isArray(x.absences) ? x.absences : []).filter(a => a && seen.has(String(a.pk)) && validDate(a.start) && validDate(a.end) && a.end >= a.start)
    .map(a => ({ pk: String(a.pk), type: ABS_TYPES.includes(a.type) ? a.type : 'Sonstiges', start: a.start, end: a.end, ...(a.synthetic ? { synthetic: true } : {}) }));
  st.holidays = [...new Set((x.holidays || []).filter(validDate))].sort();
  st.school = (Array.isArray(x.school) ? x.school : []).filter(s => s && validDate(s.start) && validDate(s.end) && s.end >= s.start).map(s => ({ name: String(s.name || 'Ferien').slice(0, 80), start: s.start, end: s.end }));
  st.capacity = (Array.isArray(x.capacity) ? x.capacity : []).filter(c => c && validDate(c.date) && kOf(c.area, c.shift) >= 0 && fin(c.net))
    .map(c => ({ date: c.date, area: c.area, shift: c.shift, net: c.net, min: fin(c.min) ? c.min : null, zero: fin(c.zero) ? c.zero : null, checked: !!c.checked, absencesIncluded: c.absencesIncluded !== false, gross: fin(c.gross) ? c.gross : null, absent: num(c.absent) }));
  const n = makeCalendar(year).n;
  if (x.roster && typeof x.roster === 'object' && !Array.isArray(x.roster)) for (const [pk, s] of Object.entries(x.roster)) if (seen.has(pk) && typeof s === 'string') st.roster[pk] = encodeRoster(decodeRoster(s, n));
  for (const a of AREAS) for (const s of SHIFTS) { const l = x.limits?.[a]?.[s]; if (l) st.limits[a][s] = { min: fin(l.min) && l.min >= 0 ? l.min : null, zero: fin(l.zero) && l.zero >= 0 ? l.zero : null }; }
  for (const k of ROUTE_CLUSTERS) {
    for (const t of types) if (x.config?.[k]?.[t] || !st.config[k][t]) st.config[k][t] = normCfg(x.config?.[k]?.[t]);
    if (Array.isArray(x.routes?.[k])) st.routes[k] = [...new Set(x.routes[k].filter(t => types.includes(t)))];   // die Reihenfolge legt der Mensch fest
  }
  const S = st.settings, xs = x.settings || {};
  if (validDate(xs.start) && xs.start.startsWith(String(year))) S.start = xs.start;
  for (const k of ['cap', 'strict', 'confirmedOnly', 'avoidSchool']) S[k] = !!xs[k];
  S.allowPartial = xs.allowPartial !== false;
  S.preferZero = xs.preferZero !== false;
  S.goal = xs.goal === 'zero' ? 'zero' : 'min';
  for (const k of ['absenceLimit', 'mentorLimit', 'tecLimit', 'examinerLimit']) S[k] = fin(xs[k]) && xs[k] >= 0 ? xs[k] : (k === 'examinerLimit' && xs[k] === undefined ? 1 : null);
  S.stress = fin(xs.stress) ? clamp(xs.stress, 0, 50) : 0;
  S.buffer = fin(xs.buffer) ? clamp(xs.buffer, 0, 50) : 0;
  S.hours = fin(xs.hours) && xs.hours > 0 && xs.hours <= 24 ? xs.hours : 7.5;
  S.courseBlocks = xs.courseBlocks !== false;
  S.shifts = normShifts(xs.shifts, [...types, 'Sonstiges']);
  { const r = normRules(xs.rules, types); if (Object.keys(r).length) S.rules = r; }
  if (Array.isArray(xs.sick) && xs.sick.length === 12 && xs.sick.every(v => fin(v) && v >= 0 && v <= 50)) S.sick = xs.sick.slice();
  st.report = (Array.isArray(x.report) ? x.report : []).filter(r => r && seen.has(String(r.pk))).map(r => ({ pk: String(r.pk), status: String(r.status || 'open'), reason: String(r.reason || '').slice(0, 400), ...(Array.isArray(r.remaining) ? { remaining: r.remaining.map(String) } : {}) }));
  st.planInfo = x.planInfo && typeof x.planInfo === 'object' ? { at: String(x.planInfo.at || ''), mode: String(x.planInfo.mode || ''), variant: String(x.planInfo.variant || ''), tried: num(x.planInfo.tried) } : null;
  { const seenC = new Set(); const ct = courseTypesOf(st); st.courses = (Array.isArray(x.courses) ? x.courses : []).map(c => normCourse(c, ct)).filter(c => c && !seenC.has(c.id) && seenC.add(c.id)); }
  linkCourses(st);
  st.realImports = (Array.isArray(x.realImports) ? x.realImports : []).map(r => ({ kind: String(r.kind || ''), start: String(r.start || ''), end: String(r.end || ''), file: String(r.file || '').slice(0, 160), at: String(r.at || '') }));
  return { state: st, warnings };
}
/** Übernimmt Sicherungen der Vorgängerversion (Format „M1-Cockpit-3“). */
export function migrateLegacy(x) {
  if (!x || !Array.isArray(x.people) || !Array.isArray(x.events) || !x.settings) throw new Error('Altformat unvollständig');
  const year = validDate(x.settings.start) ? +x.settings.start.slice(0, 4) : 2027;
  const cal = makeCalendar(year), n = cal.n;
  const statusMap = { 'Simuliert geplant': 'planned', 'Neu geplant': 'planned', 'Fixierte Planung erhalten': 'kept', 'Teilweise geplant': 'partial',
    'Nicht beauftragt': 'skipped', 'Nicht geplant': 'skipped', 'Offen': 'open', 'Blockiert': 'blocked', 'Kapazität geprüft': 'planned', 'Szenario ungeprüft': 'planned' };
  const raw = { format: FORMAT, meta: { year, title: 'M1 Jahressimulation ' + year, dataClass: 'real', source: String(x.source || 'Vorgängerversion'),
    simulated: { roster: !x.realImports?.some(r => r.kind === 'roster'), absences: (x.absences || []).some(a => a.synthetic) }, assumptions: x.simulation?.assumptions || [] },
    people: x.people, events: x.events, absences: x.absences, holidays: x.holidays, school: x.school, config: x.config, routes: x.routes,
    settings: { ...x.settings, examinerLimit: 1, allowPartial: true }, realImports: x.realImports || [],
    report: (x.report || []).filter(r => statusMap[r.status]).map(r => ({ pk: r.pk, status: statusMap[r.status], reason: r.reason, remaining: r.remaining })) };
  // Dienstplan: Zeilenliste → ein Zeichen je Tag
  const ros = new Map();
  for (const r of Array.isArray(x.roster) ? x.roster : []) {
    const d = cal.idx(r.date); if (!(d >= 0 && d < n)) continue;
    let arr = ros.get(r.pk); if (!arr) ros.set(r.pk, arr = new Uint8Array(n));
    arr[d] = rosterCode(r.area, r.shift);
  }
  raw.roster = {}; for (const [pk, arr] of ros) raw.roster[pk] = encodeRoster(arr);
  // Grenzwerte: häufigste Minimum/0-Punkt-Kombination je Bereich und Dienst
  const limits = defaultLimits(), tally = new Map();
  for (const c of x.capacity || []) { if (!fin(c.min) || !fin(c.zero)) continue; const key = c.area + '|' + c.shift + '|' + c.min + '|' + c.zero; tally.set(key, (tally.get(key) || 0) + 1); }
  const best = {};
  for (const [key, cnt] of tally) { const [a, s, mn, ze] = key.split('|'); if (!best[a + s] || cnt > best[a + s].cnt) { best[a + s] = { cnt }; if (limits[a]?.[s]) limits[a][s] = { min: +mn, zero: +ze }; } }
  raw.limits = limits; raw.capacity = [];
  const { state: st, warnings } = sanitize(raw);
  // Tageskapazitäten nur behalten, wenn sie von der Ableitung aus Dienstplan − Abwesenheiten abweichen
  const ix = buildIndex(st); let kept = 0;
  for (const c of x.capacity || []) {
    const d = cal.idx(c.date), k = kOf(c.area, c.shift); if (!(d >= 0 && d < n) || k < 0 || !fin(c.net)) continue;
    const lim = st.limits[c.area][c.shift];
    const same = c.absencesIncluded !== false && c.net === ix.grossR[k][d] - ix.absR[k][d] && (c.min ?? null) === lim.min && (c.zero ?? null) === lim.zero && (!!c.checked === (fin(lim.min) && fin(lim.zero)));
    if (!same) { st.capacity.push({ date: c.date, area: c.area, shift: c.shift, net: c.net, min: fin(c.min) ? c.min : null, zero: fin(c.zero) ? c.zero : null, checked: !!c.checked, absencesIncluded: c.absencesIncluded !== false, gross: fin(c.gross) ? c.gross : null, absent: num(c.absent) }); kept++; }
  }
  if (kept) warnings.push(kept + ' Tageskapazitäten als feste Tageswerte übernommen (weichen von der Dienstplan-Ableitung ab)');
  return { state: st, warnings };
}
/** Liest das eingebettete Planungsobjekt aus einer HTML-Datei der Vorgängerversion. */
function extractLegacyFromHtml(text) {
  const at = text.indexOf('const SIMU' + 'LATION=');
  if (at < 0) return null;
  let i = text.indexOf('{', at); if (i < 0) return null;
  let depth = 0, q = false; const start = i;
  for (; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (q) { if (c === 92) i++; else if (c === 34) q = false; }
    else if (c === 34) q = true;
    else if (c === 123) depth++;
    else if (c === 125 && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  return null;
}
/** Liest den Inhalt einer Projekt-, Sicherungs- oder HTML-Datei als Objekt (noch ungeprüft). */
export function readPayload(text) {
  const t = String(text).replace(/^\uFEFF/, '').trimStart();
  let x, legacyHtml = false;
  if (t.startsWith('<')) {
    const m = t.match(/<script id="embedded-state" type="application\/json">([\s\S]*?)<\/script>/);
    if (m && m[1].trim() && m[1].trim() !== 'null') x = JSON.parse(m[1]);
    else { try { x = extractLegacyFromHtml(t); } catch (err) { x = null; } legacyHtml = true; }
    if (!x) throw new Error('In der HTML-Datei wurde kein Planungsstand gefunden');
  } else x = JSON.parse(t);
  return { x, legacyHtml };
}
/** Erkennt Format und liefert einen geprüften Zustand (ein Planungsjahr). */
export function loadAny(text, fileName = '') {
  const { x, legacyHtml } = readPayload(text);
  if (x && x.format === FORMAT) { const r = sanitize(x); return { ...r, kind: 'Projektdatei' }; }
  if (x && (x.version === 'M1-Cockpit-3' || (Array.isArray(x.people) && Array.isArray(x.roster)))) {
    const r = migrateLegacy(x); r.state.meta.source = (fileName ? fileName + ' · ' : '') + r.state.meta.source;
    return { ...r, kind: legacyHtml ? 'Vorgängerversion (HTML)' : 'Vorgängerversion (JSON)' };
  }
  throw new Error('Unbekanntes Dateiformat');
}
