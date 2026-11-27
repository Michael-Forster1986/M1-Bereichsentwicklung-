import { TARGETS } from './constants.js';
import { normDate } from './dates.js';
import { nameKey } from './daymatrix.js';
import { addMeasure, courseTypesOf, measureOf } from './measures.js';
import { buildIndex } from './indexing.js';
import { joinCourse, moveCourse } from './courses.js';
import { hasModules } from './modules.js';
import { clamp, uid } from './util.js';

// ---------- Teilnehmerübersicht der Lehrgänge (Excel) ---------------------------------------
// Die Übersicht ist eine Arbeitsmappe mit einem Blatt je Lehrgangsfamilie („TEC A330“, „CAT A Grundlagen“, „Run Up“ …).
// Jedes Blatt hat die Spalten No. · Project · Product Duration · Quoten MUC · Scheduled Begin · Scheduled End · Provider ·
// Location. Eine Zeile mit Beginn und Ende ist ein Lehrgang; darunter stehen die Teilnehmer als nummerierte Zeilen
// („1.“ · Name · Personalnummer). Die Personalnummer kommt in mehreren Schreibweisen vor (123456A, U123456, 123456).

/** Art für Lehrgänge, die zu keinem Schritt der Ausbildungswege gehören: Sie binden die Teilnehmer, mehr nicht. */
export const OTHER_COURSE = 'Sonstiger Lehrgang';
const flat = s => String(s ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const head = s => flat(s).replace(/[^a-z0-9]/g, '');
const FIELDS = [['no', k => k === 'no' || k === 'nr'], ['project', k => k === 'project' || k === 'projekt'], ['days', k => k === 'productduration' || k === 'duration' || k === 'dauer'],
  ['quota', k => k.startsWith('quote')], ['start', k => k === 'scheduledbegin' || k === 'begin' || k === 'beginn'], ['end', k => k === 'scheduledend' || k === 'end' || k === 'ende'],
  ['provider', k => k === 'provider' || k === 'anbieter'], ['location', k => k === 'location' || k === 'ort']];
/** Kopfzeile eines Blatts der Übersicht: { row, col: { project, start, end, … } } oder null. */
function headerOf(rows) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const col = {};
    rows[i].forEach((c, j) => { const k = head(c); if (!k) return; for (const [f, test] of FIELDS) if (col[f] === undefined && test(k)) { col[f] = j; break; } });
    if (col.project !== undefined && col.start !== undefined && col.end !== undefined) return { row: i, col };
  }
  return null;
}
/** Ist das die Teilnehmerübersicht? Dann hat mindestens ein Blatt die Spalten Project, Scheduled Begin und Scheduled End. */
export const isCourseOverview = sheets => Array.isArray(sheets) && sheets.some(s => headerOf(s.rows || []));

/** Ziffernkern einer Personalnummer: „123456A“, „U123456“ und „123456“ meinen dieselbe Person. */
export function idCore(v) {
  const m = /^U?(\d{5,7})[A-Z]?$/.exec(String(v ?? '').toUpperCase().replace(/[\s.-]/g, ''));
  return m ? m[1] : '';
}
/** Vorschlag für Art und Zielmuster: TEC-Lehrgänge und der CAT-A-Kursrahmen gehören zu den Ausbildungswegen, alles andere bindet nur die Teilnehmer. */
export function guessCourseKind(sheet, title, types) {
  const s = flat(sheet).trim(), t = flat(title), route = /^tec\b/.test(s) || /^cat\s*a\b/.test(s);
  let type = OTHER_COURSE, target = '';
  if (/basic knowledge/.test(t) && types.includes('Basic Knowledge')) type = 'Basic Knowledge';
  else if (route && !/^differen/.test(t.trim())) {
    if (/prax|practical/.test(t)) type = 'Praxis'; else if (/theor/.test(t)) type = 'Theorie';
  }
  if (type !== OTHER_COURSE && /^tec\b/.test(s)) {
    const both = /a350/.test(s) && /a380/.test(s);
    target = both ? TARGETS.find(x => x.includes('Kombikurs')) || '' : TARGETS.find(x => !x.includes(' ') && s.includes(x.toLowerCase())) || '';
  }
  return { type, target, route: type !== OTHER_COURSE };
}
const short = (s, n) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

/**
 * Liest die Teilnehmerübersicht. sheets = [{ name, rows }] (aus readXlsx). Liefert
 * { errors, warnings, courses, stats: { sheets, inFile, otherYear, clipped, rows, known, unknown, people, empty: [Blätter ohne Lehrgang] } }.
 * Je Lehrgang: { ref, sheet, project, title, type, target, route, days, quota, start, end, provider, location,
 *   members: [{ name, id, pk }], known: [pk …], external, take, exists }.
 * quota = Plätze laut Übersicht · external = Teilnehmer, die nicht zum Projekt gehören: Sie belegen einen Platz,
 * werden aber nicht als Personen geführt.
 */
export function parseCourseOverview(st, sheets) {
  const errors = [], warnings = [], courses = [], year = String(st.meta.year), types = courseTypesOf(st);
  const stats = { sheets: 0, inFile: 0, otherYear: 0, clipped: 0, rows: 0, known: 0, unknown: 0, people: 0, empty: [] };
  const first = year + '-01-01', last = year + '-12-31';
  // Personen des Projekts: genaue Nummer, Ziffernkern, Name
  const byPk = new Map(st.people.map(p => [p.pk.toUpperCase(), p.pk])), byCore = new Map(), names = new Map(), dupC = new Set(), dupN = new Set();
  for (const p of st.people) {
    const c = idCore(p.pk); if (c) { if (byCore.has(c)) dupC.add(c); byCore.set(c, p.pk); }
    const k = nameKey(p.name); if (k) { if (names.has(k)) dupN.add(k); names.set(k, p.pk); }
  }
  for (const c of dupC) byCore.delete(c);
  for (const k of dupN) names.delete(k);
  // Der Name steht mal allein, mal mit Zusatz davor oder dahinter („B1 - Vorname Nachname - Team“)
  const byName = name => { const k = names.get(nameKey(name)); if (k) return k; for (const part of String(name).split(/\s+[-–]\s*|\s*[-–]\s+/)) { const hit = part.trim().includes(' ') || part.includes(',') ? names.get(nameKey(part)) : ''; if (hit) return hit; } return ''; };
  const find = (id, name) => byPk.get(String(id).toUpperCase().replace(/\s/g, '')) || byCore.get(idCore(id)) || byName(name) || '';
  const refs = new Set();
  for (const sh of sheets || []) {
    const rows = sh.rows || [], h = headerOf(rows); if (!h) continue;
    const col = h.col, at = (r, j) => j === undefined || j < 0 ? '' : String(r[j] ?? '').trim(), idCol = col.project + 1, noCol = col.no ?? col.project - 1, sheet = String(sh.name || '').trim();
    let cur = null, found = false;
    for (let i = h.row + 1; i < rows.length; i++) {
      const r = rows[i], s = normDate(at(r, col.start)), e = normDate(at(r, col.end)), title = at(r, col.project);
      if (s && e && e >= s) {
        found = true;
        if (!title && cur && cur.from === s && cur.to === e) continue;                   // zweite Zeile desselben Lehrgangs
        stats.inFile++;
        const project = title || (cur ? cur.project : sheet), order = at(r, noCol - 1).split(/\s+/).filter(Boolean), no = at(r, noCol);
        let ref = (order[order.length - 1] || no || sheet + ' ' + s).slice(0, 36);
        for (let n = 2; refs.has(ref); n++) ref = (order[order.length - 1] || no || sheet + ' ' + s).slice(0, 32) + ' #' + n;
        refs.add(ref);
        const g = guessCourseKind(sheet, project, types), quota = Math.round(Number(at(r, col.quota).replace(',', '.'))), days = Math.round(Number(at(r, col.days).replace(',', '.')));
        cur = { ref, sheet, project, from: s, to: e, type: g.type, target: g.target, route: g.route, days: days > 0 ? days : null, quota: quota > 0 ? clamp(quota, 1, 500) : null, start: s, end: e,
          provider: at(r, col.provider), location: at(r, col.location), members: [], known: [], external: 0, take: false, inYear: s <= last && e >= first };
        // Lehrgang über den Jahreswechsel: für die Planung zählt der Teil im Planungsjahr
        if (cur.inYear && (s < first || e > last)) { cur.start = s < first ? first : s; cur.end = e > last ? last : e; cur.clipped = true; stats.clipped++; }
        cur.title = short(g.route ? sheet + ' ' + g.type + ' · ' + ref : short(project, 78 - ref.length - 3) + ' · ' + ref, 80);
        if (cur.inYear) courses.push(cur); else stats.otherYear++;
        continue;
      }
      // Teilnehmer: laufende Nummer, Name, daneben die Personalnummer
      if (cur && /^\d{1,3}\.?$/.test(at(r, noCol)) && title) {
        const id = at(r, idCol), pk = find(id, title);
        cur.members.push({ name: title, id, pk });
        if (cur.inYear) { stats.rows++; if (pk) { if (!cur.known.includes(pk)) cur.known.push(pk); stats.known++; } else { cur.external++; stats.unknown++; } }
      }
    }
    if (found) stats.sheets++; else if (rows.slice(h.row + 1).some(r => r.some(c => String(c ?? '').trim()))) stats.empty.push(sheet);
  }
  const have = new Set((st.courses || []).map(c => c.ref).filter(Boolean));
  for (const c of courses) { c.exists = have.has(c.ref); c.take = c.exists || c.known.length > 0 || c.route; }
  stats.people = new Set(courses.flatMap(c => c.known)).size;
  courses.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : a.title < b.title ? -1 : 1);
  if (!stats.sheets) errors.push('Kein Blatt mit den Spalten „Project“, „Scheduled Begin“ und „Scheduled End“ gefunden');
  else if (!courses.length) errors.push(stats.otherYear ? 'Die Übersicht enthält keinen Lehrgang im Planungsjahr ' + year + ' (' + stats.otherYear + ' in anderen Jahren)' : 'Keine Lehrgänge mit Beginn und Ende gefunden');
  if (stats.otherYear && courses.length) warnings.push(stats.otherYear + (stats.otherYear === 1 ? ' Lehrgang liegt' : ' Lehrgänge liegen') + ' nicht im Planungsjahr ' + year + ' und ' + (stats.otherYear === 1 ? 'wird' : 'werden') + ' übergangen');
  if (stats.clipped) warnings.push(stats.clipped + (stats.clipped === 1 ? ' Lehrgang reicht' : ' Lehrgänge reichen') + ' über den Jahreswechsel – übernommen wird der Teil im Planungsjahr ' + year);
  if (stats.empty.length) warnings.push((stats.empty.length === 1 ? 'Blatt „' + stats.empty[0] + '“ hat' : 'Die Blätter ' + stats.empty.map(x => '„' + x + '“').join(', ') + ' haben') + ' keinen Lehrgang mit Beginn und Ende in den Spalten „Scheduled Begin“ und „Scheduled End“ und ' + (stats.empty.length === 1 ? 'wird' : 'werden') + ' übergangen');
  if (stats.unknown) warnings.push(stats.unknown + ' Teilnehmerzeilen gehören nicht zu den Personen des Projekts – sie belegen einen Platz, werden aber nicht als Teilnehmer geführt');
  if (!st.people.length) warnings.push('Das Projekt enthält noch keine Personen: Die Lehrgänge lassen sich übernehmen, Teilnehmer aber erst zuordnen, wenn Stammdaten oder Schichtplan eingespielt sind');
  return { errors, warnings, courses, stats };
}
/**
 * Übernimmt Lehrgänge der Übersicht (list = die gewählten, mit type und target). Ein Lehrgang wird an seiner Kennung (ref)
 * wiedererkannt: Beim erneuten Einspielen werden Zeitraum, Plätze und Teilnehmer aktualisiert statt verdoppelt.
 * opt.prune (Vorgabe: ja): Wer nicht mehr in der Übersicht steht, wird aus diesen Lehrgängen ausgetragen.
 * Liefert { added, updated, participants, left, removed, kept, otherType }.
 */
export function applyCourseOverview(st, list, opt = {}) {
  const info = { added: 0, updated: 0, participants: 0, left: 0, removed: 0, kept: 0, otherType: false }, types = () => [...courseTypesOf(st), OTHER_COURSE];
  for (const c of list) {
    const type = types().includes(c.type) ? c.type : OTHER_COURSE;
    if (type === OTHER_COURSE && !measureOf(st, OTHER_COURSE)) {
      addMeasure(st, { name: OTHER_COURSE, short: 'Lehrg.', course: true, color: 8 }, { days: 1, trainee: 1, mentor: 0, tec: 0, examiner: 0 });
      info.otherType = true;
    }
    const target = measureOf(st, type) ? '' : (TARGETS.includes(c.target) ? c.target : ''), note = short([c.project, c.provider, c.location, c.quota != null ? 'Quote ' + c.quota : ''].filter(Boolean).join(' · '), 200);
    let cur = st.courses.find(x => x.ref === c.ref);
    if (cur) {
      Object.assign(cur, { type, title: c.title, target, seats: c.quota ?? null, note });
      for (const e of st.events) if (e.courseId === cur.id) { e.type = type; e.title = cur.title; }
      if (cur.start !== c.start || cur.end !== c.end) { if (hasModules(cur)) info.kept++; else moveCourse(st, buildIndex(st), cur, c.start, c.end); }
      info.updated++;
    } else {
      cur = { id: uid(), type, title: c.title, target, start: c.start, end: c.end, seats: c.quota ?? null, fixed: true, ref: c.ref, note };
      st.courses.push(cur); info.added++;
    }
    if (c.external > 0) cur.ext = clamp(c.external, 1, 500); else delete cur.ext;
    if (opt.prune !== false) {
      const keep = new Set(c.known), before = st.events.length;
      st.events = st.events.filter(e => e.courseId !== cur.id || keep.has(e.pk));
      info.left += before - st.events.length;
    }
    if (c.known.length) { const r = joinCourse(st, buildIndex(st), cur, c.known); info.participants += r.added; info.removed += r.removed; }
  }
  st.courses.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : a.title < b.title ? -1 : 1);
  return info;
}
