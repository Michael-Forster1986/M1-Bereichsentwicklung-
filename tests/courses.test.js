// Lehrgänge als zusammenhängende Blöcke: Planer, Bedarf, beste Besetzung, beste Zeiträume, Import.
import { describe, it, expect, beforeAll } from 'vitest';
import * as Core from '../src/core/index.js';

const plan = st => { const res = Core.optimizePlan(st, Core.buildIndex(st), { variants: 4 }); st.events = res.events; st.report = res.report; return st; };
/** Demo-Stand ohne Lehrgänge und ohne berechnete Termine: 28 TEC-Personen (A330) brauchen Theorie und Praxis. */
function bare() {
  const st = Core.demoState({ year: 2027, count: 141, seed: 2027 });
  st.events = st.events.filter(e => !e.auto && !e.courseId); st.courses = []; st.report = [];
  return st;
}
const tec = st => st.people.filter(p => p.cluster === '5' && p.level === 'TEC' && p.target === 'A330');
const contiguous = (ix, e) => { const ds = ix.evDays.get(e.id); for (let d = ds[0]; d <= ds[ds.length - 1]; d++) if (ix.work[d] && !ds.includes(d)) return false; return true; };

describe('Planer im Blockmodus', () => {
  it('verstreut Lehrgänge nicht mehr auf einzelne Tage, sondern meldet den fehlenden Termin', () => {
    const st = plan(bare());
    expect(st.settings.courseBlocks).toBe(true);
    expect(st.events.filter(e => Core.isCourseType(e.type))).toEqual([]);
    const r = st.report.find(x => x.pk === tec(st)[0].pk);
    expect(r.status).toBe('blocked');
    expect(r.reason).toMatch(/Kein Lehrgangstermin für Theorie A330 vorhanden/);
    expect(r.remaining).toEqual(['Theorie: Lehrgang', 'Praxis: Lehrgang']);
  });
  it('vergibt Plätze in eingespielten Terminen – als Block, in der Reihenfolge des Wegs und nie über die Platzzahl', () => {
    const st = bare();
    st.courses.push(Core.normCourse({ id: 'T1', type: 'Theorie', title: 'TEC A330 Theorie', target: 'A330', start: '2027-03-01', end: '2027-03-26', seats: 6 }),
      Core.normCourse({ id: 'P0', type: 'Praxis', title: 'Praxis zu früh', target: 'A330', start: '2027-02-01', end: '2027-02-12', seats: 20 }),
      Core.normCourse({ id: 'P1', type: 'Praxis', title: 'TEC A330 Praxis', target: 'A330', start: '2027-04-05', end: '2027-04-16', seats: 4 }));
    plan(st); const ix = Core.buildIndex(st);
    const th = Core.courseMembers(st, 'T1'), pr = Core.courseMembers(st, 'P1');
    expect(th).toHaveLength(6); expect(pr).toHaveLength(4);
    expect(Core.courseMembers(st, 'P0')).toHaveLength(0);                       // Praxis vor der Theorie ist nicht zulässig
    for (const e of [...th, ...pr]) {
      expect(e).toMatchObject({ auto: true, courseKind: 'Lehrgang' });
      expect(contiguous(ix, e)).toBe(true);
      expect(e.dates).toEqual(Core.courseDayList(ix, st.courses.find(c => c.id === e.courseId)).map(d => ix.cal.iso[d]));
    }
    expect(pr.every(e => th.some(t => t.pk === e.pk))).toBe(true);              // Praxis nur nach besuchter Theorie
    expect(Core.findConflicts(st, ix).filter(c => c.hard.length)).toEqual([]);
    const done = st.report.filter(r => pr.some(e => e.pk === r.pk)), half = st.report.filter(r => th.some(e => e.pk === r.pk) && !pr.some(e => e.pk === r.pk));
    expect(done.every(r => r.status === 'planned')).toBe(true);
    expect(half.every(r => r.status === 'partial' && /Kein passender Lehrgangstermin für Praxis \(.*ausgebucht/.test(r.reason))).toBe(true);
    expect(Core.routeProgress(st, ix, ix.people.get(pr[0].pk)).state).toBe('complete');
  });
  it('hält die Kapazitätsgrenze auch bei Lehrgängen ein', () => {
    const st = bare();
    st.courses.push(Core.normCourse({ id: 'T1', type: 'Theorie', title: 'T', target: 'A330', start: '2027-03-01', end: '2027-03-26', seats: 40 }));
    st.limits.M1['Früh'] = { min: 44, zero: 47 }; st.limits.M1['Spät'] = { min: 21, zero: 23 }; st.limits.M1.Nacht = { min: 21, zero: 23 };   // knapp über der Besetzung
    plan(st); const ix = Core.buildIndex(st), sum = Core.summarize(st, ix);
    expect(Core.courseMembers(st, 'T1').length).toBeLessThan(20);
    const days = Core.courseDayList(ix, st.courses[0]);
    for (const d of days) for (let k = 0; k < 3; k++) { const c = Core.capInfo(ix, d, k); if (c.known && c.loss > 0) expect(c.net).toBeGreaterThanOrEqual(c.min - 1e-9); }
    expect(sum.underMin).toBe(Core.summarize({ ...st, events: [] }, Core.buildIndex({ ...st, events: [] })).underMin);   // der Plan verschlechtert nichts
  });
  it('lässt fixierte Teilnehmer stehen und plant nur die übrigen Schritte darum herum', () => {
    const st = bare(), c = Core.normCourse({ id: 'T1', type: 'Theorie', title: 'T', target: 'A330', start: '2027-03-01', end: '2027-03-26', seats: 3 });
    st.courses.push(c);
    const mine = tec(st).slice(5, 8).map(p => p.pk);
    expect(Core.joinCourse(st, Core.buildIndex(st), c, mine)).toEqual({ added: 3, removed: 0 });
    plan(st);
    const m = Core.courseMembers(st, 'T1');
    expect(m.map(e => e.pk).sort()).toEqual(mine.slice().sort());                 // ausgebucht: niemand kommt automatisch dazu
    expect(m.every(e => !e.auto)).toBe(true);
  });
  it('rechnet im alten Modus (Kurse tageweise) unverändert', () => {
    const st = bare(); st.settings.courseBlocks = false;
    plan(st);
    expect(st.events.filter(e => e.type === 'Theorie' && e.auto).length).toBeGreaterThan(20);
  });
});

describe('Bedarf, Besetzung und Zeiträume', () => {
  let st, ix;
  beforeAll(() => { st = bare(); ix = Core.buildIndex(st); });

  it('ermittelt den Bedarf je Art und Zielmuster', () => {
    const d = Core.courseDemand(st, ix), th = d.find(g => g.type === 'Theorie' && g.target === 'A330');
    expect(th.all).toHaveLength(tec(st).length); expect(th.open).toHaveLength(th.all.length); expect(th.days).toBe(20);
    expect(d.find(g => g.type === 'Praxis' && g.target === 'A330').days).toBe(10);
    const full = Core.demoState({});                                              // Demo: alle Plätze vergeben
    expect(Core.courseDemand(full, Core.buildIndex(full)).every(g => g.open.length === 0)).toBe(true);
  });
  it('findet für einen Termin die beste Besetzung der freien Plätze', () => {
    const c = Core.normCourse({ id: 'T1', type: 'Theorie', title: 'T', target: 'A330', start: '2027-03-01', end: '2027-03-26', seats: 8 });
    const s2 = Core.clone(st); s2.courses.push(c);
    const x2 = Core.buildIndex(s2), cand = Core.courseCandidates(s2, x2, c), a = Core.assessCourse(s2, x2, c, cand);
    expect(cand).toHaveLength(tec(st).length);
    expect(a.ok).toBe(true); expect(a.pks).toHaveLength(8); expect(a.free).toBe(8);
    for (const pk of a.pks) for (const d of a.days) expect(x2.abs[x2.pi.get(pk)][d]).toBe(0);     // niemand mit Urlaub im Lehrgang
    expect(a.dropped.some(x => x.cats.includes('Abwesenheit'))).toBe(true);
    Core.joinCourse(s2, x2, c, a.pks);
    const again = Core.assessCourse(s2, Core.buildIndex(s2), c, cand);
    expect(again.ok).toBe(false); expect(again.pks).toEqual([]);                  // alle Plätze belegt
    const all = Core.assessCourse(st, ix, { ...c, seats: 2 }, cand.slice(0, 5), { group: 'all' });
    expect(all.ok).toBe(false); expect(all.issues.some(i => i.cat === 'Platzzahl')).toBe(true);
  });
  it('beachtet die Reihenfolge im Ausbildungsweg', () => {
    const s2 = Core.clone(st), th = Core.normCourse({ id: 'T1', type: 'Theorie', title: 'T', target: 'A330', start: '2027-05-03', end: '2027-05-28', seats: 10 });
    s2.courses.push(th);
    const pk = tec(s2)[0].pk; Core.joinCourse(s2, Core.buildIndex(s2), th, [pk]);
    const x2 = Core.buildIndex(s2), early = Core.normCourse({ id: 'P1', type: 'Praxis', title: 'P', target: 'A330', start: '2027-03-01', end: '2027-03-12', seats: 10 });
    expect(Core.courseWindow(s2, x2, x2.people.get(pk), 'Praxis').earliest).toBe(x2.cal.idx('2027-05-28') + 1);
    const a = Core.assessCourse(s2, x2, early, [pk], { group: 'all' });
    expect(a.ok).toBe(false); expect(a.issues[0].cat).toBe('Reihenfolge im Ausbildungsweg');
  });
  it('schlägt die besten Zeiträume vor, bis alle untergebracht sind', () => {
    const pks = Core.courseDemand(st, ix).find(g => g.type === 'Theorie' && g.target === 'A330').open;
    const res = Core.proposeCourses(st, ix, { type: 'Theorie', target: 'A330', pks, len: 20, from: '2027-01-04', to: '2027-12-17', minGroup: 4, maxGroup: 10 });
    expect(res.courses.length).toBeGreaterThanOrEqual(3);
    const placed = res.courses.flatMap(a => a.pks);
    expect(new Set(placed).size).toBe(placed.length);                              // niemand doppelt
    expect(placed.length + res.left.length).toBe(pks.length);
    expect(res.left.length).toBeLessThan(4);
    for (const a of res.courses) { expect(a.ok).toBe(true); expect(a.days).toHaveLength(20); expect(a.pks.length).toBeLessThanOrEqual(10); expect(a.pks.length).toBeGreaterThanOrEqual(4); expect(a.zeroMargin).toBeGreaterThanOrEqual(-1e-9); }
    for (let i = 0; i < res.courses.length; i++) for (let j = i + 1; j < res.courses.length; j++) expect(res.courses[i].end < res.courses[j].start || res.courses[j].end < res.courses[i].start).toBe(true);
    expect(res.courses[0].pks.length).toBeGreaterThanOrEqual(res.courses[res.courses.length - 1].pks.length);   // größte Gruppe zuerst
  });
  it('verschiebt und entfernt einen Lehrgang samt Teilnehmern', () => {
    const s2 = Core.clone(st), c = Core.normCourse({ id: 'T1', type: 'Theorie', title: 'T', target: 'A330', start: '2027-03-01', end: '2027-03-26', seats: 5 });
    s2.courses.push(c); let x2 = Core.buildIndex(s2);
    Core.joinCourse(s2, x2, c, tec(s2).slice(0, 3).map(p => p.pk));
    Core.moveCourse(s2, x2, c, '2027-06-07', '2027-06-18');
    expect(Core.courseMembers(s2, 'T1').every(e => e.start === '2027-06-07' && e.end === '2027-06-18' && e.dates.length === 10)).toBe(true);
    expect(Core.removeCourse(s2, 'T1')).toBe(3);
    expect(s2.courses).toEqual([]); expect(s2.events.some(e => e.courseId)).toBe(false);
  });
});

describe('Lehrgangstermine einspielen und speichern', () => {
  it('erkennt Art, Zielmuster und Plätze und bündelt Teilnehmerzeilen zu einem Lehrgang', () => {
    const st = bare(), [a, b] = tec(st);
    const csv = 'Lehrgang;Art;Beginn;Ende;Plätze;Personalnummer\nTEC A330 Theorie;TEC;01.03.2027;26.03.2027;12;' + a.pk + '\nTEC A330 Theorie;TEC;01.03.2027;26.03.2027;12;' + b.pk
      + '\nCAT A Praxis;CAT Praxis;2027-05-03;2027-05-11;8;\nBasic;Basic Knowledge;2027-06-01;2027-06-30;;\nFalsch;TEC;2026-01-01;2026-01-10;5;\nOhne;TEC;2027-07-01;2027-07-10;5;UNBEKANNT\n';
    const { head, rows } = Core.rowsToObjects(Core.parseCSV(csv)), chk = Core.checkCourses(st, rows, head);
    expect(chk.errors).toEqual(['Zeile 6: Zeitraum ungültig oder außerhalb 2027']);
    const ok = Core.checkCourses(st, rows.filter((_, i) => i !== 4), head);
    expect(ok.errors).toEqual([]);
    expect(ok.courses.map(c => [c.title, c.type, c.target, c.seats, c.pks.length])).toEqual([['TEC A330 Theorie', 'Theorie', 'A330', 12, 2], ['CAT A Praxis', 'Praxis', '', 8, 0], ['Basic', 'Basic Knowledge', '', null, 0], ['Ohne', 'Theorie', '', 5, 0]]);
    expect(ok.warnings).toHaveLength(1);
    expect(Core.applyCourses(st, ok)).toMatchObject({ added: 4, updated: 0, participants: 2 });
    expect(Core.applyCourses(st, ok)).toMatchObject({ added: 0, updated: 4, participants: 0 });   // erneutes Einspielen verdoppelt nichts
    expect(st.courses).toHaveLength(4);
    expect(Core.courseMembers(st, st.courses.find(c => c.title === 'TEC A330 Theorie').id).map(e => e.pk).sort()).toEqual([a.pk, b.pk].sort());
  });
  it('ordnet frei geschriebene Lehrgangsarten zu', () => {
    expect(['TEC', 'CAT A', 'CAT Praxis', 'cat a praxis', 'Theorie', 'Basic Knowledge', 'FG650', 'Practical'].map(Core.courseTypeOf)).toEqual(['Theorie', 'Theorie', 'Praxis', 'Praxis', 'Theorie', 'Basic Knowledge', 'FG650', 'Praxis']);
  });
  it('Lehrgänge überstehen Speichern und Laden; verwaiste Bezüge werden gelöst', () => {
    const st = Core.demoState({}), back = Core.loadProject(Core.serializeProject(Core.wrapProject(st))).project.years[2027];
    expect(back.courses).toEqual(st.courses);
    expect(back.events.filter(e => e.courseId).length).toBe(st.events.filter(e => e.courseId).length);
    const raw = JSON.parse(JSON.stringify(st)); raw.courses = raw.courses.slice(1);
    const cut = Core.sanitize(raw).state, gone = st.courses[0].id;
    expect(cut.events.some(e => e.courseId === gone)).toBe(false);
  });
  it('macht Lehrgangstermine der Vorgängerfassung zu Lehrgängen', () => {
    const st = bare(), ix = Core.buildIndex(st), a = Core.courseAssess(st, ix, { pks: tec(st).slice(0, 4).map(p => p.pk), start: '2027-03-01', end: '2027-03-12', threshold: 'zero', group: 'max', freePolicy: 'adjust' });
    st.events.push(...Core.courseEvents(ix, a, { name: 'TEC Lehrgang', type: 'Theorie', kind: 'TEC' }));
    const back = Core.sanitize(JSON.parse(JSON.stringify(st))).state;
    expect(back.courses).toHaveLength(1);
    expect(back.courses[0]).toMatchObject({ type: 'Theorie', title: 'TEC Lehrgang', start: '2027-03-01', end: '2027-03-12', seats: null });
    expect(Core.courseMembers(back, back.courses[0].id)).toHaveLength(a.pks.length);
  });
});

describe('Demo-Daten im Blockmodus', () => {
  it('enthalten nur Lehrgänge als zusammenhängende Blöcke und keine harten Konflikte', () => {
    const st = Core.demoState({}), ix = Core.buildIndex(st);
    expect(st.courses.length).toBeGreaterThan(8);
    for (const e of st.events.filter(x => Core.isCourseType(x.type))) { expect(e.courseId, e.type).toBeTruthy(); expect(contiguous(ix, e)).toBe(true); }
    expect(Core.findConflicts(st, ix).filter(c => c.hard.length)).toEqual([]);
    for (const c of st.courses) if (c.seats != null) expect(Core.courseMembers(st, c.id).length).toBeLessThanOrEqual(c.seats);
    expect(Core.summarize(st, ix).underMin).toBe(0);
  });
});
