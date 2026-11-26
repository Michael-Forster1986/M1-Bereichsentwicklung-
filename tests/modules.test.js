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
