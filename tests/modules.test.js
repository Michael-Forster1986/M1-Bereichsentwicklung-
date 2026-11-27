// Basic Knowledge mit Modulen M1 … M17: Module mit Zeitraum oder N/A, Teilbeleger belegen nur ihre Module.
import { describe, it, expect } from 'vitest';
import * as Core from '../src/core/index.js';

const BK = 'Basic Knowledge';
/** Demo-Stand im Blockmodus ohne Lehrgänge und Termine; Cluster 1 beginnt mit Basic Knowledge. */
function base() {
  const st = Core.demoState({ year: 2027, count: 60, seed: 11, courseBlocks: true });
  st.events = []; st.courses = []; st.report = []; st.settings.cap = false;
  for (const k of Core.ROUTE_CLUSTERS) st.config[k][BK].days = 20;
  st.routes['1'] = [BK, ...st.routes['1']];
  return st;
}
/** Planbare Personen aus Cluster 1, die im Januar und Februar nicht abwesend sind. */
const c1 = st => st.people.filter(p => p.cluster === '1' && !Core.isLocked(p) && !p.customRoute && !st.absences.some(a => a.pk === p.pk && a.start < '2027-03-01'));
/** 17 Module: M1 – M4 je eine Woche im Januar, M5 – M17 finden nicht statt. */
const mods = (over = {}) => Array.from({ length: 17 }, (_, i) => {
  const no = i + 1, weeks = { 1: ['2027-01-11', '2027-01-15'], 2: ['2027-01-18', '2027-01-22'], 3: ['2027-01-25', '2027-01-29'], 4: ['2027-02-01', '2027-02-05'], ...over };
  return weeks[no] ? { no, start: weeks[no][0], end: weeks[no][1] } : { no, na: true };
});
function course(st, list = mods()) {
  const c = Core.normCourse({ id: 'BK1', type: BK, title: 'Basic Knowledge 1', modules: list, seats: 12 }, Core.courseTypesOf(st));
  st.courses.push(c);
  return c;
}
const plan = st => { const res = Core.optimizePlan(st, Core.buildIndex(st), { variants: 2 }); st.events = res.events; st.report = res.report; return st; };

describe('Module eines Lehrgangs', () => {
  it('nur Basic Knowledge kennt Module; Eingaben werden geprüft', () => {
    expect(Core.moduleCountOf(BK)).toBe(17);
    expect(Core.moduleCountOf('Theorie')).toBe(0);
    expect(Core.normModules(mods(), 'Theorie')).toBeNull();
    expect(Core.moduleIssues(mods(), BK, 2027)).toEqual([]);
    expect(Core.moduleIssues(mods().slice(0, 16), BK, 2027)).toEqual(['M17: Angabe fehlt']);
    expect(Core.moduleIssues(mods({ 5: ['', ''] }), BK, 2027)[0]).toMatch(/^M5: Beginn und Ende eintragen/);
    expect(Core.moduleIssues(mods({ 2: ['2027-01-22', '2027-01-18'] }), BK, 2027)[0]).toMatch(/M2: das Ende liegt vor dem Beginn/);
    expect(Core.moduleIssues(mods({ 2: ['2026-12-28', '2027-01-08'] }), BK, 2027)[0]).toMatch(/M2: der Zeitraum muss im Jahr 2027/);
    expect(Core.moduleIssues(Array.from({ length: 17 }, (_, i) => ({ no: i + 1, na: true })), BK, 2027)).toEqual(['Mindestens ein Modul muss stattfinden']);
    expect(Core.moduleText([1, 2, 3, 7, 9, 10])).toBe('M1–M3, M7, M9–M10');
    expect(Core.normPersonModules([3, 1, 1, 99, 'x'])).toEqual([1, 3]);
    expect(Core.normPersonModules(Array.from({ length: 17 }, (_, i) => i + 1))).toBeUndefined();     // alle = keine Einschränkung
    expect(Core.normPersonModules([])).toBeUndefined();
  });
  it('der Zeitraum ergibt sich aus den Modulen; N/A-Module und Lücken zählen nicht zu den Lehrgangstagen', () => {
    const st = base(), c = course(st, mods({ 3: null, 4: ['2027-02-08', '2027-02-12'] })), ix = Core.buildIndex(st);
    expect([c.start, c.end]).toEqual(['2027-01-11', '2027-02-12']);
    expect(c.modules.length).toBe(17);
    expect(c.modules.filter(m => m.na).map(m => m.no)).toEqual([3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    const days = Core.courseDayList(ix, c).map(d => ix.cal.iso[d]);
    expect(days.length).toBe(15);                                                                // 3 Wochen, die Lücke dazwischen ist frei
    expect(days).not.toContain('2027-01-27');
    expect(Core.moduleDays(ix, c).map(m => [m.no, m.days.length])).toEqual([[1, 5], [2, 5], [4, 5]]);
  });
  it('Teilbeleger belegen nur ihre Module – alle anderen den ganzen Lehrgang', () => {
    const st = base(), c = course(st), [full, part, none] = c1(st);
    part.modules = [2, 4]; none.modules = [9, 10];                                               // M9 und M10 finden hier nicht statt
    const ix = Core.buildIndex(st), r = Core.joinCourse(st, ix, c, [full.pk, part.pk, none.pk]);
    expect(r).toEqual({ added: 2, removed: 0, skipped: 1 });
    const ev = pk => st.events.find(e => e.courseId === c.id && e.pk === pk);
    expect(ev(full.pk).dates.length).toBe(20);
    expect(ev(part.pk).dates).toEqual(['2027-01-18', '2027-01-19', '2027-01-20', '2027-01-21', '2027-01-22', '2027-02-01', '2027-02-02', '2027-02-03', '2027-02-04', '2027-02-05']);
    expect([ev(part.pk).start, ev(part.pk).end]).toEqual(['2027-01-18', '2027-02-05']);
    expect(ev(none.pk)).toBeUndefined();
    expect(Core.memberModules(c, part)).toEqual([2, 4]);
    expect(Core.isPartial(c, part)).toBe(true);
    expect(Core.isPartial(c, full)).toBe(false);
    const ix2 = Core.buildIndex(st);
    expect(Core.eventModules(ix2, c, ev(part.pk)).map(m => [m.no, m.days.length])).toEqual([[2, 5], [4, 5]]);
    // die Produktion verliert den Teilbeleger nur an seinen Modultagen
    const i = ix2.pi.get(part.pk), busy = d => ix2.evByDay[ix2.cal.idx(d)].some(e => e.pk === part.pk);
    expect(busy('2027-01-12')).toBe(false);
    expect(busy('2027-01-19')).toBe(true);
    expect(i).toBeGreaterThanOrEqual(0);
  });
  it('Änderungen an Modulen und an der Person ziehen die Termine nach', () => {
    const st = base(), c = course(st), [full, part] = c1(st);
    part.modules = [2, 4];
    Core.joinCourse(st, Core.buildIndex(st), c, [full.pk, part.pk]);
    const ev = pk => st.events.find(e => e.courseId === c.id && e.pk === pk);
    // Modul 4 findet doch nicht statt, Modul 2 wird verschoben
    expect(Core.setCourseModules(st, Core.buildIndex(st), c, mods({ 2: ['2027-03-01', '2027-03-03'], 4: null })).removed).toBe(0);
    expect([c.start, c.end]).toEqual(['2027-01-11', '2027-03-03']);
    expect(ev(part.pk).dates).toEqual(['2027-03-01', '2027-03-02', '2027-03-03']);
    expect(ev(full.pk).dates.length).toBe(13);
    // die Person braucht jetzt M1 und M3
    expect(Core.setPersonModules(st, Core.buildIndex(st), part.pk, [1, 3]).removed).toBe(0);
    expect(st.people.find(p => p.pk === part.pk).modules).toEqual([1, 3]);
    expect(ev(part.pk).dates.length).toBe(10);
    // … und dann nur noch ein Modul, das nicht stattfindet: sie wird ausgetragen
    expect(Core.setPersonModules(st, Core.buildIndex(st), part.pk, [12]).removed).toBe(1);
    expect(ev(part.pk)).toBeUndefined();
    // alle Module = keine Einschränkung
    Core.setPersonModules(st, Core.buildIndex(st), part.pk, Array.from({ length: 17 }, (_, i) => i + 1));
    expect(st.people.find(p => p.pk === part.pk).modules).toBeUndefined();
    // Module aufheben: alle belegen wieder den ganzen Zeitraum
    Core.setCourseModules(st, Core.buildIndex(st), c, null);
    expect(c.modules).toBeUndefined();
    expect(ev(full.pk).dates.length).toBe(Core.courseDayList(Core.buildIndex(st), c).length);
    expect(() => Core.setCourseModules(st, Core.buildIndex(st), c, Array.from({ length: 17 }, (_, i) => ({ no: i + 1, na: true })))).toThrow(/Mindestens ein Modul/);
    // der Zeitraum eines Lehrgangs mit Modulen lässt sich nicht frei verschieben
    Core.setCourseModules(st, Core.buildIndex(st), c, mods());
    expect(() => Core.moveCourse(st, Core.buildIndex(st), c, '2027-05-03', '2027-05-28')).toThrow(/Modulen/);
  });
  it('übersteht Speichern und Laden', () => {
    const st = base(), c = course(st), [full, part] = c1(st);
    part.modules = [2, 4];
    Core.joinCourse(st, Core.buildIndex(st), c, [full.pk, part.pk]);
    const back = Core.sanitize(JSON.parse(JSON.stringify(st))).state, bc = back.courses.find(x => x.id === 'BK1');
    expect(bc.modules).toEqual(c.modules);
    expect([bc.start, bc.end]).toEqual([c.start, c.end]);
    expect(back.people.find(p => p.pk === part.pk).modules).toEqual([2, 4]);
    expect(back.people.find(p => p.pk === full.pk).modules).toBeUndefined();
    expect(back.events.find(e => e.courseId === 'BK1' && e.pk === part.pk).dates.length).toBe(10);
    // ein Lehrgang einer anderen Art behält keine Module
    const th = Core.normCourse({ type: 'Theorie', title: 'T', start: '2027-03-01', end: '2027-03-05', modules: mods() }, Core.courseTypesOf(st));
    expect(th.modules).toBeUndefined();
  });
  it('Jahreswechsel: die benötigten Module ziehen mit – außer das Ziel ist erreicht', () => {
    const st = base(), [done, open] = c1(st);
    done.modules = [1, 2]; open.modules = [3];
    // „done“ hat seinen Weg vollständig im Plan, „open“ nichts
    st.routes['1'] = ['FitCheck', 'ICA'];
    const res = Core.replanPeople(st, Core.buildIndex(st), [done.pk]); st.events = res.events; st.report = res.report;
    expect(Core.routeProgress(st, Core.buildIndex(st), done).state).toBe('complete');
    const next = Core.rolloverYear(st).state;
    expect(next.people.find(p => p.pk === done.pk).modules).toBeUndefined();
    expect(next.people.find(p => p.pk === open.pk).modules).toEqual([3]);
  });
  it('der Planer vergibt Plätze modulgenau und plant den weiteren Weg danach', () => {
    const st = base(), c = course(st), [full, part, none] = c1(st);
    c.seats = 40;
    part.modules = [1]; none.modules = [9];
    plan(st);
    const ev = pk => st.events.find(e => e.courseId === c.id && e.pk === pk);
    expect(ev(full.pk).dates.length).toBe(20);
    expect(ev(part.pk).dates).toEqual(['2027-01-11', '2027-01-12', '2027-01-13', '2027-01-14', '2027-01-15']);
    // der Teilbeleger ist nach seinem Modul frei: der nächste Schritt beginnt vor dem Ende des Lehrgangs
    const next = st.events.filter(e => e.pk === part.pk && e.type === 'FitCheck').map(e => e.start).sort()[0];
    expect(next > '2027-01-15' && next < '2027-02-05').toBe(true);
    expect(Core.routeProgress(st, Core.buildIndex(st), part).steps.find(s => s.type === BK).have).toBe(20);   // Teilnahme erfüllt den Schritt
    // wer nur ein Modul braucht, das nicht stattfindet, bekommt keinen Platz
    expect(ev(none.pk)).toBeUndefined();
    expect(st.report.find(r => r.pk === none.pk).reason).toMatch(/Kein passender Lehrgangstermin für Basic Knowledge \(keines der benötigten Module findet statt\)/);
  });
  it('die beste Besetzung prüft jede Person nur an ihren Modultagen', () => {
    const st = base(), c = course(st), [a, b] = c1(st);
    b.modules = [4];
    // b ist in der ersten Woche im Urlaub – das Modul 1 braucht b aber gar nicht
    st.absences.push({ pk: b.pk, type: 'Urlaub', start: '2027-01-11', end: '2027-01-15' }, { pk: a.pk, type: 'Urlaub', start: '2027-01-12', end: '2027-01-12' });
    for (const a of Core.AREAS) for (const s of Core.SHIFTS) st.limits[a][s] = { min: 0, zero: 0 };  // hier geht es um die Tage, nicht um die Grenze
    const ix = Core.buildIndex(st), res = Core.assessCourse(st, ix, c, [a.pk, b.pk], { threshold: 'min' });
    expect(res.pks).toEqual([b.pk]);
    expect(res.dropped).toEqual([{ pk: a.pk, cats: ['Abwesenheit'] }]);
    expect(res.days.length).toBe(20);
  });
});

describe('Lehrgangsliste mit Modulen einspielen und ausgeben', () => {
  const read = (st, csv) => { const { head, rows } = Core.rowsToObjects(Core.parseCSV(csv)); return Core.checkCourses(st, rows, head); };
  it('liest Modulangaben in üblichen Schreibweisen', () => {
    expect(Core.parseModuleList('M3')).toEqual([3]);
    expect(Core.parseModuleList('Modul 7')).toEqual([7]);
    expect(Core.parseModuleList('2, 5; M9')).toEqual([2, 5, 9]);
    expect(Core.parseModuleList('M1–M4, M7')).toEqual([1, 2, 3, 4, 7]);
    expect(Core.parseModuleList('m1 - m3')).toEqual([1, 2, 3]);
    expect(Core.parseModuleList('')).toEqual([]);
    expect(Core.parseModuleList('alle')).toEqual([]);
    expect(Core.parseModuleList('M18')).toBeNull();
    expect(Core.parseModuleList('irgendwas')).toBeNull();
  });
  it('eine Zeile je Modul legt den Lehrgang an; N/A und fehlende Module finden nicht statt; Teilnehmerzeilen nennen ihre Module', () => {
    const st = base(), [full, part] = c1(st);
    const csv = 'Lehrgang;Art;Beginn;Ende;Plätze;Personalnummer;Modul\n'
      + 'BK Frühjahr;Basic Knowledge;11.01.2027;15.01.2027;12;;M1\n'
      + 'BK Frühjahr;Basic Knowledge;18.01.2027;22.01.2027;;;M2\n'
      + 'BK Frühjahr;Basic Knowledge;N/A;;;;M3\n'
      + 'BK Frühjahr;Basic Knowledge;01.02.2027;;;;Modul 4\n'                       // eintägig: Ende wie Beginn
      + 'BK Frühjahr;Basic Knowledge;;;;' + full.pk + ';\n'                          // belegt alles
      + 'BK Frühjahr;Basic Knowledge;;;;' + part.pk + ';M2, M4\n'                    // Teilbeleger
      + 'CAT A Praxis;CAT Praxis;2027-05-03;2027-05-11;8;;\n';
    const chk = read(st, csv);
    expect(chk.errors).toEqual([]);
    expect(chk.warnings).toEqual(['BK Frühjahr: M5–M17 stehen nicht in der Liste – sie gelten als N/A (finden nicht statt)']);
    expect(chk.courses.map(c => [c.title, c.start, c.end, c.seats, c.pks.length, c.modules ? c.modules.filter(m => !m.na).length : null])).toEqual([['BK Frühjahr', '2027-01-11', '2027-02-01', 12, 2, 3], ['CAT A Praxis', '2027-05-03', '2027-05-11', 8, 0, null]]);
    expect(Core.applyCourses(st, chk)).toMatchObject({ added: 2, updated: 0, participants: 2 });
    const c = st.courses.find(x => x.title === 'BK Frühjahr'), ev = pk => st.events.find(e => e.courseId === c.id && e.pk === pk);
    expect(c.modules.filter(m => !m.na)).toEqual([{ no: 1, start: '2027-01-11', end: '2027-01-15' }, { no: 2, start: '2027-01-18', end: '2027-01-22' }, { no: 4, start: '2027-02-01', end: '2027-02-01' }]);
    expect(ev(full.pk).dates.length).toBe(11);
    expect(ev(part.pk).dates).toEqual(['2027-01-18', '2027-01-19', '2027-01-20', '2027-01-21', '2027-01-22', '2027-02-01']);
    expect(Core.memberModules(c, st.people.find(p => p.pk === part.pk))).toEqual([2, 4]);
    // erneutes Einspielen verdoppelt nichts
    expect(Core.applyCourses(st, read(st, csv))).toMatchObject({ added: 0, updated: 2, participants: 0 });
    expect(st.courses.filter(x => x.title === 'BK Frühjahr')).toHaveLength(1);
    expect(st.events.filter(e => e.courseId === c.id)).toHaveLength(2);
  });
  it('meldet unklare Modulzeilen', () => {
    const st = base();
    const head = 'Lehrgang;Art;Beginn;Ende;Plätze;Personalnummer;Modul\n';
    expect(read(st, head + 'T;Theorie;01.03.2027;05.03.2027;;;M1\n').errors[0]).toMatch(/Zeile 2: Module gibt es nur bei Basic Knowledge/);
    expect(read(st, head + 'BK;Basic Knowledge;01.03.2027;05.03.2027;;;M1, M2\n').errors[0]).toMatch(/Zeile 2: Modul nicht erkannt .* je Zeile ein Modul/);
    expect(read(st, head + 'BK;Basic Knowledge;01.03.2027;05.03.2027;;;M1\nBK;Basic Knowledge;08.03.2027;12.03.2027;;;M1\n').errors[0]).toMatch(/Zeile 3: M1 steht doppelt/);
    expect(read(st, head + 'BK;Basic Knowledge;05.03.2027;01.03.2027;;;M1\n').errors[0]).toMatch(/Zeile 2: M1: Zeitraum ungültig/);
    expect(read(st, head + 'BK;Basic Knowledge;N/A;;;;M1\n').errors).toEqual(['BK: kein Modul mit Zeitraum']);
  });
  it('die ausgegebene Liste lässt sich wieder einspielen – mit Modulen und Teilbelegern', () => {
    const st = base(), c = course(st), [full, part] = c1(st);
    part.modules = [2, 4];
    Core.joinCourse(st, Core.buildIndex(st), c, [full.pk, part.pk]);
    st.courses.push(Core.normCourse({ id: 'P1', type: 'Praxis', title: 'CAT A Praxis', start: '2027-05-03', end: '2027-05-11', seats: 8 }, Core.courseTypesOf(st)));
    const rows = Core.courseListRows(st, Core.buildIndex(st));
    expect(rows.filter(r => r[7] && !r[6])).toHaveLength(17);                                 // eine Zeile je Modul
    expect(rows.filter(r => r[3] === 'N/A')).toHaveLength(13);
    expect(rows.find(r => r[6] === part.pk)[7]).toBe('M2, M4');
    expect(rows.find(r => r[6] === full.pk)[7]).toBe('');
    const csv = Core.toCSV(Core.TEMPLATES.courses, rows);
    // in einen Stand ohne Lehrgänge einspielen: gleiche Lehrgänge, gleiche Termine
    const other = base();
    other.people.find(p => p.pk === part.pk).modules = undefined;
    const chk = read(other, csv.replace(/^\uFEFF/, ''));
    expect(chk.errors).toEqual([]);
    expect(chk.warnings).toEqual([]);
    Core.applyCourses(other, chk);
    const oc = other.courses.find(x => x.title === c.title);
    expect(oc.modules).toEqual(c.modules);
    expect([oc.start, oc.end, oc.seats]).toEqual([c.start, c.end, c.seats]);
    const dates = (s, id) => Object.fromEntries(s.events.filter(e => e.courseId === id).map(e => [e.pk, e.dates]));
    expect(dates(other, oc.id)).toEqual(dates(st, c.id));
    expect(other.people.find(p => p.pk === part.pk).modules.filter(no => no <= 4)).toEqual([2, 4]);
    expect(other.courses.find(x => x.title === 'CAT A Praxis')).toMatchObject({ start: '2027-05-03', end: '2027-05-11', seats: 8 });
  });
  it('Teilnehmer lassen sich einem vorhandenen Lehrgang mit Modulen nachmelden', () => {
    const st = base(), c = course(st), [a] = c1(st);
    const chk = read(st, 'Lehrgang;Art;Beginn;Ende;Personalnummer;Modul\n' + c.title + ';Basic Knowledge;;;' + a.pk + ';M1\n');
    expect(chk.errors).toEqual([]);
    expect(Core.applyCourses(st, chk)).toMatchObject({ added: 0, updated: 0, participants: 1 });
    expect(st.events.find(e => e.courseId === c.id && e.pk === a.pk).dates.length).toBe(5);
    expect(st.courses).toHaveLength(1);
  });
});

describe('beste Zeiträume mit Modulplan', () => {
  it('legt die Module nacheinander; Teilbeleger werden nur an ihren Tagen geprüft und eingetragen', () => {
    const st = base(), [a, b, c] = c1(st);
    for (const x of Core.AREAS) for (const s of Core.SHIFTS) st.limits[x][s] = { min: 0, zero: 0 };
    b.modules = [2];
    // a: Urlaub in der zweiten Woche · b (braucht nur M2): Urlaub in der ersten Woche · c: frei
    st.absences.push({ pk: a.pk, type: 'Urlaub', start: '2027-01-18', end: '2027-01-22' }, { pk: b.pk, type: 'Urlaub', start: '2027-01-11', end: '2027-01-15' });
    const plan = Core.modulePlan('Basic Knowledge', { 1: 5, 2: 5, 4: 2 });
    expect(plan).toMatchObject({ count: 17, len: 12, steps: [{ no: 1, days: 5 }, { no: 2, days: 5 }, { no: 4, days: 2 }] });
    expect(Core.modulePlan('Theorie', { 1: 5 })).toBeNull();
    expect(Core.modulePlan('Basic Knowledge', {})).toBeNull();
    const ix = Core.buildIndex(st);
    const res = Core.courseSearch(st, ix, { pks: [a.pk, b.pk, c.pk], from: '2027-01-11', to: '2027-01-29', len: plan.len, plan, group: 'max', threshold: 'min', freePolicy: 'adjust' });
    const first = res.all[0];
    expect([first.start, first.end]).toEqual(['2027-01-11', '2027-01-26']);
    expect(first.modules.filter(m => !m.na)).toEqual([{ no: 1, start: '2027-01-11', end: '2027-01-15' }, { no: 2, start: '2027-01-18', end: '2027-01-22' }, { no: 4, start: '2027-01-25', end: '2027-01-26' }]);
    expect(first.modules).toHaveLength(17);
    // b ist in Woche 1 im Urlaub, braucht M1 aber nicht: b kann teilnehmen; a fällt wegen Woche 2 heraus
    expect(first.pks.sort()).toEqual([b.pk, c.pk].sort());
    expect(first.personDays[b.pk].map(d => ix.cal.iso[d])).toEqual(['2027-01-18', '2027-01-19', '2027-01-20', '2027-01-21', '2027-01-22']);
    expect(first.personDays[c.pk]).toHaveLength(12);
    const evs = Core.courseEvents(ix, first, { name: 'BK', type: 'Basic Knowledge', kind: 'Lehrgang' });
    expect(evs.find(e => e.pk === b.pk).dates).toHaveLength(5);
    expect(evs.find(e => e.pk === c.pk).dates).toHaveLength(12);
  });
  it('Vorschläge tragen ihre Module und bringen alle unter', () => {
    const st = base(), people = c1(st).slice(0, 8);
    expect(people.length).toBeGreaterThan(3);
    for (const x of Core.AREAS) for (const s of Core.SHIFTS) st.limits[x][s] = { min: 0, zero: 0 };
    people[0].modules = [1]; people[1].modules = [3];
    const plan = Core.modulePlan('Basic Knowledge', { 1: 3, 2: 3, 3: 2 });
    const res = Core.proposeCourses(st, Core.buildIndex(st), { type: 'Basic Knowledge', target: '', title: 'BK', pks: people.map(p => p.pk), len: plan.len, plan, from: '2027-01-11', to: '2027-02-26', minGroup: 2, maxGroup: 6, threshold: 'min' });
    expect(res.courses.length).toBeGreaterThan(0);
    for (const a of res.courses) { expect(a.modules.filter(m => !m.na).map(m => m.no)).toEqual([1, 2, 3]); expect(a.days).toHaveLength(8); expect(a.pks.length).toBeLessThanOrEqual(6); }
    expect(res.courses.reduce((n, a) => n + a.pks.length, 0) + res.left.length).toBe(people.length);
    // aus einem Vorschlag wird ein Lehrgang mit Modulen; der Teilbeleger steht nur an seinen Tagen darin
    const a = res.courses.find(x => x.pks.includes(people[0].pk));
    if (a) {
      const c = Core.normCourse({ type: 'Basic Knowledge', title: 'BK 1', start: a.start, end: a.end, seats: 6, modules: a.modules }, Core.courseTypesOf(st));
      st.courses.push(c); Core.joinCourse(st, Core.buildIndex(st), c, a.pks);
      expect(st.events.find(e => e.courseId === c.id && e.pk === people[0].pk).dates).toHaveLength(3);
    }
  });
});
