import { ABS_TYPES, CLUSTERS, EPS, PATTERNS, PREP } from './constants.js';
import { kArea, kShift, num } from './util.js';
import { isoWeek } from './dates.js';
import { buildIndex, capInfo } from './indexing.js';
import { findConflicts } from './conflicts.js';
import { courseDayList, courseMembers } from './courses.js';
import { routeProgress, summarize } from './summary.js';
import { labelOf } from './measures.js';

// ---------- Berichte: Kennzahlen und Tabellen für Excel und PDF ----------------
export const REPORT_LABELS = { planned: 'Neu geplant', kept: 'Durch fixierte Termine abgedeckt', partial: 'Teilweise geplant', open: 'Offen', blocked: 'Blockiert', skipped: 'Nicht geplant' };
export const ROUTE_LABELS = { complete: 'Vollständig geplant', partial: 'Teilweise geplant', none: 'Ohne Termine', locked: 'Ausgeschlossen', unassigned: 'Cluster offen' };
export const DATA_CLASS_LABELS = { demo: 'Demo-Daten · synthetisch', real: 'Echtdaten · nur lokal', pseudo: 'Pseudonymisiert', empty: 'Leeres Projekt' };
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const originOf = e => e.auto ? 'berechnet' : e.synthetic ? 'Szenario' : 'fixiert';
const REPORT_ORDER = { blocked: 0, open: 1, partial: 2, planned: 3, kept: 4, skipped: 5 };
export const NOTICE = 'Planungswerkzeug – keine zertifizierte Qualifikations- oder Produktionsfreigabe. Ausbildungsfolgen und Verlustfaktoren sind fachlich zu bestätigen.';

/** Monatswerte: Ausbildungstage, Betreuungsaufwand, kritische Diensttage und Abwesenheiten. */
export function monthlyFigures(st, ix, sum) {
  const out = Array.from({ length: 12 }, (_, m) => ({ month: m, workdays: 0, training: 0, mentor: sum.monthly[m].mentor, tec: sum.monthly[m].tec, examiner: sum.monthly[m].examiner, prep: sum.monthly[m].prep, underMin: 0, underZero: 0, absent: 0 }));
  const month = ix.cal.month, c = ix.cap, L = ix.load;
  for (let d = 0; d < ix.n; d++) if (ix.work[d]) out[month[d]].workdays++;
  for (const e of st.events) if (e.type !== PREP) for (const d of ix.evDays.get(e.id) || []) out[month[d]].training++;
  for (let k = 0; k < 9; k++) for (let d = 0; d < ix.n; d++) {
    if (!c.known[k][d]) continue;
    const net = c.pre[k][d] - L.loss[k][d];
    if (net - c.min[k][d] < -EPS) out[month[d]].underMin++;
    if (net - c.zero[k][d] < -EPS) out[month[d]].underZero++;
  }
  for (let i = 0; i < st.people.length; i++) { const ab = ix.abs[i], r = ix.ros[i]; for (let d = 0; d < ix.n; d++) if (ab[d] && r[d] >= 2) out[month[d]].absent++; }
  return out;
}
/** Planungsstand je Cluster. */
export function clusterFigures(st, ix) {
  const rows = new Map(Object.keys(CLUSTERS).map(k => [k, { cluster: k, label: CLUSTERS[k], people: 0, complete: 0, partial: 0, none: 0, other: 0 }]));
  for (const p of st.people) {
    const r = rows.get(p.cluster) || rows.get('offen'), state = routeProgress(st, ix, p).state;
    r.people++;
    if (state === 'complete' || state === 'partial' || state === 'none') r[state]++; else r.other++;
  }
  return [...rows.values()];
}
/** Kennzahlen eines Planungsjahres für den Jahresvergleich. */
export function yearFigures(st) {
  const ix = buildIndex(st), sum = summarize(st, ix);
  return { year: st.meta.year, people: sum.people, eligible: sum.eligible, complete: sum.route.complete, partial: sum.route.partial, none: sum.route.none,
    events: sum.events, trainingDays: sum.trainingDays, conflicts: findConflicts(st, ix).filter(c => c.hard.length).length, underMin: sum.underMin, underZero: sum.underZero, knownDays: sum.knownDays,
    mentor: sum.resources.mentor, tec: sum.resources.tec, examiner: sum.resources.examiner + sum.resources.prep, dataClass: st.meta.dataClass, planned: st.planInfo && st.planInfo.at ? st.planInfo.at.slice(0, 10) : '' };
}
export const capStatus = c => !c.known ? 'nicht prüfbar' : c.net < c.min - EPS ? 'unter Minimum' : c.net < c.zero - EPS ? 'unter 0-Punkt' : 'ab 0-Punkt';

/**
 * Beschreibt die Excel-Arbeitsmappe eines Planungsjahres (reine Daten; geschrieben wird sie von writeXlsx).
 * privacy: Pseudonyme statt Namen und Personalnummern · years: alle Jahresstände des Projekts für den Jahresvergleich
 */
export function buildWorkbook(st, { privacy = false, today = new Date().toISOString().slice(0, 10), years = [] } = {}) {
  const ix = buildIndex(st), sum = summarize(st, ix), conf = findConflicts(st, ix), confById = new Map(conf.map(c => [c.id, c]));
  const S = st.settings, cal = ix.cal, hours = num(S.hours) || 7.5;
  const idOf = p => privacy ? p.alias : p.pk, nameOf = p => privacy ? p.alias : p.name;
  const person = pk => { const p = ix.people.get(pk); return p ? [idOf(p), nameOf(p)] : [privacy ? '' : pk, 'Unbekannt']; };
  const label = (map, key) => map[key] || key;
  const classNote = { real: 'VERTRAULICH – enthält Personendaten', pseudo: 'pseudonymisiert', demo: 'Demo-Daten (synthetisch)' }[privacy && st.meta.dataClass === 'real' ? 'pseudo' : st.meta.dataClass] || '';
  const footer = st.meta.title + ' · Stand ' + today.slice(8) + '.' + today.slice(5, 7) + '.' + today.slice(0, 4) + (classNote ? ' · ' + classNote : '');
  const sheets = [];
  const add = s => sheets.push({ footer, ...s });
  const r2 = v => typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : v;
  const kv = (k, v, type) => [k, type ? { v: r2(v), type } : v], head = t => [{ v: t, bold: true, fill: 'soft' }, { v: '', fill: 'soft' }];

  // Übersicht
  const pi = st.planInfo, mf = monthlyFigures(st, ix, sum);
  add({ name: 'Übersicht', widths: [44, 70], landscape: false, rows: [
    [{ v: 'M1 Qualifikationscockpit · Jahresplanung ' + st.meta.year, title: true }], [],
    head('Projekt'),
    kv('Projekttitel', st.meta.title), kv('Planungsjahr', st.meta.year, 'int'), kv('Datenklasse', label(DATA_CLASS_LABELS, st.meta.dataClass) + (privacy ? ' · Namen verborgen' : '')),
    kv('Stand der Auswertung', today, 'date'), kv('Letzte Berechnung', pi && pi.at ? pi.at.slice(0, 10) : '', 'date'),
    kv('Berechnungsvariante', pi ? (pi.tried > 1 ? pi.tried + ' Reihenfolgen verglichen, beste: ' + pi.variant : pi.variant || '') : ''),
    kv('Planungsmodus', S.cap ? 'Kapazitätsmodus (verbindliche Prüfung)' : 'Szenariomodus (ohne verbindliche Kapazitätsprüfung)'),
    kv('Dienstplan / Abwesenheiten', (st.meta.simulated.roster ? 'simuliert' : 'real') + ' / ' + (st.meta.simulated.absences ? 'simuliert' : 'real')), [],
    head('Ausbildungswege'),
    kv('Personen', sum.people, 'int'), kv('davon mit Ausbildungsweg', sum.eligible, 'int'), kv('Wege vollständig geplant', sum.route.complete, 'int'),
    kv('Wege teilweise geplant', sum.route.partial, 'int'), kv('Wege ohne Termine', sum.route.none, 'int'), kv('Cluster offen', sum.route.unassigned, 'int'), kv('Ausgeschlossen', sum.route.locked, 'int'), [],
    head('Termine'),
    kv('Termine gesamt', sum.events, 'int'), kv('davon berechnet', sum.auto, 'int'), kv('davon fixiert', sum.fixed, 'int'), kv('davon Szenario (simuliert)', sum.scenario, 'int'),
    kv('Ausbildungstage', sum.trainingDays, 'int'), kv('Termine mit Konflikten', conf.filter(c => c.hard.length).length, 'int'), [],
    head('Kapazität'),
    kv('Geprüfte Diensttage (Bereich × Dienst)', sum.knownDays, 'int'), kv('Diensttage unter Minimum', { v: sum.underMin, type: 'int', fill: sum.underMin ? 'crit' : '' }),
    kv('Diensttage unter 0-Punkt', { v: sum.underZero, type: 'int', fill: sum.underZero ? 'warn' : '' }),
    kv('Kleinste Reserve zum Minimum (Köpfe)', sum.worstMin ? sum.worstMin.v : '', 'dec'), kv('Kleinste Reserve zum 0-Punkt (Köpfe)', sum.worstZero ? sum.worstZero.v : '', 'dec'),
    kv('Abwesende Diensttage', sum.absentDays, 'int'), [],
    head('Betreuungsaufwand im Jahr (Stunden bei ' + String(hours).replace('.', ',') + ' h je Arbeitstag)'),
    kv('Mentor', sum.resources.mentor * hours, 'dec'), kv('TEC', sum.resources.tec * hours, 'dec'), kv('Prüfer', sum.resources.examiner * hours, 'dec'), kv('Vorbereitung (Prüfer / TEC)', sum.resources.prep * hours, 'dec'), [],
    ...(st.meta.assumptions.length ? [head('Annahmen'), ...st.meta.assumptions.map((a, i) => [String(i + 1), { v: a, wrap: true }]), []] : []),
    head('Hinweis'), ['', { v: NOTICE, wrap: true }]
  ] });

  // Jahresvergleich (nur bei mehreren Planungsjahren)
  if (years.length > 1) add({ name: 'Jahresvergleich', columns: [
    { header: 'Planungsjahr', width: 13, type: 'int' }, { header: 'Personen', width: 11, type: 'int' }, { header: 'mit Ausbildungsweg', width: 14, type: 'int' }, { header: 'Wege vollständig', width: 13, type: 'int' },
    { header: 'Wege teilweise', width: 12, type: 'int' }, { header: 'Wege ohne Termine', width: 13, type: 'int' }, { header: 'Termine', width: 10, type: 'int' }, { header: 'Ausbildungstage', width: 14, type: 'int' },
    { header: 'Termine mit Konflikt', width: 13, type: 'int' }, { header: 'Diensttage unter Minimum', width: 15, type: 'int' }, { header: 'Diensttage unter 0-Punkt', width: 15, type: 'int' },
    { header: 'Mentor (Tage)', width: 12, type: 'dec' }, { header: 'TEC (Tage)', width: 11, type: 'dec' }, { header: 'Prüfer inkl. Vorbereitung (Tage)', width: 16, type: 'dec' }, { header: 'Letzte Berechnung', width: 14, type: 'date' }],
  rows: years.map(yearFigures).map(f => [f.year, f.people, f.eligible, f.complete, f.partial, f.none, f.events, f.trainingDays, { v: f.conflicts, fill: f.conflicts ? 'warn' : '' },
    { v: f.underMin, fill: f.underMin ? 'crit' : '' }, { v: f.underZero, fill: f.underZero ? 'warn' : '' }, r2(f.mentor), r2(f.tec), r2(f.examiner), f.planned]) });

  // Cluster
  add({ name: 'Cluster', columns: [{ header: 'Cluster', width: 14 }, { header: 'Bezeichnung', width: 44 }, { header: 'Personen', width: 11, type: 'int' }, { header: 'vollständig geplant', width: 13, type: 'int' },
    { header: 'teilweise geplant', width: 13, type: 'int' }, { header: 'ohne Termine', width: 12, type: 'int' }, { header: 'ohne Weg (offen / ausgeschlossen)', width: 17, type: 'int' }],
  rows: clusterFigures(st, ix).map(c => [{ v: c.cluster, type: 'text' }, c.label, c.people, c.complete, c.partial, { v: c.none, fill: c.none ? 'warn' : '' }, c.other]) });

  // Monatswerte
  add({ name: 'Monatswerte', columns: [{ header: 'Monat', width: 13 }, { header: 'Arbeitstage', width: 11, type: 'int' }, { header: 'Ausbildungstage', width: 14, type: 'int' }, { header: 'Mentor (h)', width: 11, type: 'dec' },
    { header: 'TEC (h)', width: 10, type: 'dec' }, { header: 'Prüfer (h)', width: 10, type: 'dec' }, { header: 'Vorbereitung (h)', width: 13, type: 'dec' },
    { header: 'Diensttage unter Minimum', width: 15, type: 'int' }, { header: 'Diensttage unter 0-Punkt', width: 15, type: 'int' }, { header: 'Abwesende Diensttage', width: 14, type: 'int' }, { header: 'Krankenreserve (%)', width: 13, type: 'dec2' }],
  rows: mf.map(m => [MONTHS[m.month], m.workdays, m.training, r2(m.mentor * hours), r2(m.tec * hours), r2(m.examiner * hours), r2(m.prep * hours),
    { v: m.underMin, fill: m.underMin ? 'crit' : '' }, { v: m.underZero, fill: m.underZero ? 'warn' : '' }, m.absent, num(S.sick[m.month]) + num(S.stress)]) });

  // Personen
  add({ name: 'Personen', columns: [{ header: privacy ? 'Pseudonym' : 'Personalnummer', width: 15, type: 'text' }, { header: 'Name', width: 26 }, { header: 'Org.-Einheit', width: 22 }, { header: 'Berechtigung', width: 13 },
    { header: 'Cluster', width: 10, type: 'text' }, { header: 'Gesperrt', width: 9 }, { header: 'Bereich', width: 8 }, { header: 'Dienst', width: 8 }, { header: 'Zielmuster', width: 14 }, { header: 'Zielstufe', width: 10 },
    { header: 'Priorität', width: 9, type: 'int' }, ...PATTERNS.map(k => ({ header: k, width: 8 })), { header: 'Voraussetzungen bestätigt', width: 14 }, { header: 'Abschluss Doings', width: 13, type: 'date' },
    { header: 'Individueller Start', width: 13, type: 'date' }, { header: 'Planungsstand', width: 20 }, { header: 'Geplante Tage', width: 10, type: 'int' }, { header: 'davon Vorleistung aus Vorjahren', width: 14, type: 'int' }, { header: 'Solltage', width: 9, type: 'int' }, { header: 'Letzter Termin', width: 13, type: 'date' }],
  rows: st.people.map(p => {
    const pr = routeProgress(st, ix, p), have = pr.steps.reduce((s, x) => s + x.have, 0), need = pr.steps.reduce((s, x) => s + x.need, 0);
    return [idOf(p), nameOf(p), privacy ? '' : p.org, p.rights, p.cluster, p.locked ? 'ja' : '', p.area, p.shift, p.target, p.level, p.priority, ...PATTERNS.map(k => p.patterns[k]), p.confirmed ? 'ja' : '', p.gate, p.start,
      { v: label(ROUTE_LABELS, pr.state), fill: { complete: 'good', partial: 'warn', none: 'crit' }[pr.state] || '' }, pr.steps.length ? have : '', pr.steps.reduce((s, x) => s + (x.credit || 0), 0) || '', pr.steps.length ? need : '', pr.end || ''];
  }) });

  // Termine
  const evs = st.events.slice().sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
  add({ name: 'Termine', columns: [{ header: privacy ? 'Pseudonym' : 'Personalnummer', width: 15, type: 'text' }, { header: 'Name', width: 26 }, { header: 'Maßnahme', width: 19 }, { header: 'Titel', width: 20 },
    { header: 'Beginn', width: 12, type: 'date' }, { header: 'Ende', width: 12, type: 'date' }, { header: 'Tage', width: 7, type: 'int' }, { header: 'Herkunft', width: 11 }, { header: 'Teilweg', width: 8 },
    { header: 'Teilnehmer', width: 11, type: 'dec' }, { header: 'Mentor', width: 8, type: 'dec' }, { header: 'TEC', width: 7, type: 'dec' }, { header: 'Prüfer', width: 8, type: 'dec' }, { header: 'Konflikt', width: 34 }, { header: 'Hinweis', width: 30 }],
  rows: evs.map(e => { const cf = confById.get(e.id), hard = cf ? cf.hard.map(h => h[0] + (h[1] > 1 ? ' (' + h[1] + ' Tage)' : '')).join(', ') : '';
    return [...person(e.pk), labelOf(st, e.type), e.title || '', e.start, e.end, (ix.evDays.get(e.id) || []).length, originOf(e), e.partial ? 'ja' : '', e.trainee, e.mentor, e.tec, e.examiner,
      { v: hard, fill: hard ? 'crit' : '' }, cf ? cf.soft.map(h => h[0] + ' (' + h[1] + ')').join(', ') : '']; }) });

  // Lehrgänge: je Teilnehmer eine Zeile; Lehrgänge ohne Teilnehmer stehen mit leerer Person
  const courseRows = [];
  for (const c of st.courses || []) {
    const m = courseMembers(st, c.id), base = [c.title, labelOf(st, c.type), c.target, c.start, c.end, courseDayList(ix, c).length, c.seats ?? '', m.length];
    if (!m.length) courseRows.push([...base, '', '', '']);
    for (const e of m) { const cf = confById.get(e.id); courseRows.push([...base, ...person(e.pk), { v: cf && cf.hard.length ? cf.hard.map(h => h[0]).join(', ') : '', fill: cf && cf.hard.length ? 'crit' : '' }]); }
  }
  add({ name: 'Lehrgänge', columns: [{ header: 'Lehrgang', width: 28 }, { header: 'Art', width: 16 }, { header: 'Zielmuster', width: 11 }, { header: 'Beginn', width: 12, type: 'date' }, { header: 'Ende', width: 12, type: 'date' },
    { header: 'Lehrgangstage', width: 12, type: 'int' }, { header: 'Plätze', width: 8, type: 'int' }, { header: 'Teilnehmer', width: 11, type: 'int' }, { header: privacy ? 'Pseudonym' : 'Personalnummer', width: 15, type: 'text' }, { header: 'Name', width: 26 }, { header: 'Konflikt', width: 30 }], rows: courseRows });

  // Planungsergebnis
  const rep = st.report.slice().sort((a, b) => (REPORT_ORDER[a.status] ?? 9) - (REPORT_ORDER[b.status] ?? 9));
  add({ name: 'Planungsergebnis', columns: [{ header: privacy ? 'Pseudonym' : 'Personalnummer', width: 15, type: 'text' }, { header: 'Name', width: 26 }, { header: 'Cluster', width: 10, type: 'text' },
    { header: 'Ergebnis', width: 30 }, { header: 'Begründung', width: 70, wrap: true }, { header: 'Noch offen', width: 40, wrap: true }],
  rows: rep.map(r => [...person(r.pk), ix.people.get(r.pk)?.cluster || '', { v: label(REPORT_LABELS, r.status), fill: { planned: 'good', kept: 'good', partial: 'warn', open: 'crit', blocked: 'crit' }[r.status] || '' }, r.reason, (r.remaining || []).join(', ')]) });

  // Konflikte
  add({ name: 'Konflikte', columns: [{ header: privacy ? 'Pseudonym' : 'Personalnummer', width: 15, type: 'text' }, { header: 'Name', width: 26 }, { header: 'Maßnahme', width: 19 }, { header: 'Beginn', width: 12, type: 'date' },
    { header: 'Ende', width: 12, type: 'date' }, { header: 'Konflikt', width: 60, wrap: true }, { header: 'Hinweis', width: 40, wrap: true }],
  rows: conf.map(c => [...person(c.pk), labelOf(st, c.type), c.start, c.end, { v: c.hard.map(h => h[0] + ' (' + h[1] + ')').join(', '), fill: c.hard.length ? 'crit' : '' }, c.soft.map(h => h[0] + ' (' + h[1] + ')').join(', ')]) });

  // Tageskapazität
  const capRows = [];
  for (let d = 0; d < ix.n; d++) for (let k = 0; k < 9; k++) {
    const c = capInfo(ix, d, k); if (!c.known && !c.src) continue;
    const status = capStatus(c);
    capRows.push([cal.iso[d], WEEKDAYS[cal.dow[d]], isoWeek(cal.iso[d]), kArea(k), kShift(k), Number.isFinite(c.gross) ? c.gross : '', c.absent, r2(c.reserve), r2(c.loss), c.known ? r2(c.net) : '',
      Number.isFinite(c.min) ? c.min : '', Number.isFinite(c.zero) ? c.zero : '', c.known ? r2(c.net - c.min) : '', c.known ? r2(c.net - c.zero) : '',
      { v: status, fill: { 'unter Minimum': 'crit', 'unter 0-Punkt': 'warn' }[status] || '' }, [ix.holiday[d] ? 'Feiertag' : '', ix.school[d] ? 'Ferien' : ''].filter(Boolean).join(', ')]);
  }
  add({ name: 'Tageskapazität', columns: [{ header: 'Datum', width: 12, type: 'date' }, { header: 'Tag', width: 6 }, { header: 'KW', width: 6, type: 'int' }, { header: 'Bereich', width: 8 }, { header: 'Dienst', width: 8 },
    { header: 'Köpfe laut Dienstplan', width: 12, type: 'int' }, { header: 'Abwesend', width: 10, type: 'int' }, { header: 'Krankenreserve', width: 13, type: 'dec2' }, { header: 'Maßnahmenverlust', width: 13, type: 'dec2' },
    { header: 'Verfügbar', width: 11, type: 'dec2' }, { header: 'Minimum', width: 10, type: 'dec' }, { header: '0-Punkt', width: 10, type: 'dec' }, { header: 'Reserve zum Minimum', width: 12, type: 'dec2' },
    { header: 'Reserve zum 0-Punkt', width: 12, type: 'dec2' }, { header: 'Status', width: 15 }, { header: 'Kalender', width: 16 }], rows: capRows });

  // Abwesenheiten
  add({ name: 'Abwesenheiten', columns: [{ header: privacy ? 'Pseudonym' : 'Personalnummer', width: 15, type: 'text' }, { header: 'Name', width: 26 }, { header: 'Art', width: 12 }, { header: 'Von', width: 12, type: 'date' },
    { header: 'Bis', width: 12, type: 'date' }, { header: 'Kalendertage', width: 12, type: 'int' }, { header: 'Simuliert', width: 10 }],
  rows: st.absences.slice().sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0).map(a => [...person(a.pk), ABS_TYPES.includes(a.type) ? a.type : 'Sonstiges', a.start, a.end, cal.idx(a.end) - cal.idx(a.start) + 1, a.synthetic ? 'ja' : '']) });

  return { title: st.meta.title, sheets };
}
