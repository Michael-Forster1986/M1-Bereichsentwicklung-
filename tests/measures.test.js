// Eigene Schritte, zulässige Dienste je Maßnahme und frei gewählte Reihenfolge im Ausbildungsweg.
import { describe, it, expect } from 'vitest';
import * as Core from '../src/core/index.js';

const plan = st => { const res = Core.optimizePlan(st, Core.buildIndex(st), { variants: 4 }); st.events = res.events; st.report = res.report; return st; };
/** Demo-Stand ohne berechnete Termine. Kurse tageweise und ohne Kapazitätsgrenze, damit nur Dienstregel und Reihenfolge wirken. */
function bare(opt = {}) {
  const st = Core.demoState({ year: 2027, count: 60, seed: 11, courseBlocks: false, ...opt });
  st.events = st.events.filter(e => !e.auto); st.report = []; st.settings.cap = false;
  return st;
}
/** Dienste (0 Früh · 1 Spät · 2 Nacht), in denen die Tage einer Maßnahmenart liegen. */
function shiftsUsed(st, type) {
  const ix = Core.buildIndex(st), used = new Set();
  for (const e of st.events) if (e.type === type) { const i = ix.pi.get(e.pk); for (const d of ix.evDays.get(e.id)) used.add(Core.assign(ix, i, d) % 3); }
  return [...used].sort();
}

describe('zulässige Dienste je Maßnahme', () => {
  it('Vorgabe wie bisher: Logbook in jedem Dienst, alles andere nur im Frühdienst', () => {
    const st = plan(bare());
    expect(Core.shiftsOf(st, 'Practical Logbook')).toEqual([true, true, true]);
    expect(Core.shiftsOf(st, 'FitCheck')).toEqual([true, false, false]);
    expect(Core.shiftsOf(st, 'Sonstiges')).toEqual([true, false, false]);
    expect(shiftsUsed(st, 'FitCheck')).toEqual([0]);
    expect(shiftsUsed(st, 'ICA')).toEqual([0]);
    expect(shiftsUsed(st, 'Practical Logbook').length).toBeGreaterThan(1);
    expect(st.settings.shifts).toEqual({});
  });
  it('der Planer hält sich an geänderte Dienste', () => {
    const st = bare();
    Core.setShifts(st, 'FitCheck', [false, true, false]);            // FitCheck nur im Spätdienst
    Core.setShifts(st, 'Practical Logbook', [true, false, false]);   // Logbook nur noch im Frühdienst
    plan(st);
    expect(shiftsUsed(st, 'FitCheck')).toEqual([1]);
    expect(shiftsUsed(st, 'Practical Logbook')).toEqual([0]);
    expect(Core.findConflicts(st, Core.buildIndex(st)).filter(c => c.hard.some(h => /Außerhalb/.test(h[0])))).toEqual([]);
  });
  it('Konfliktprüfung und Ablegeprüfung nennen die zulässigen Dienste', () => {
    const st = plan(bare()), ix = Core.buildIndex(st);
    const fit = st.events.find(e => e.type === 'FitCheck'), i = ix.pi.get(fit.pk);
    expect(Core.findConflicts(st, ix).some(c => c.id === fit.id)).toBe(false);
    Core.setShifts(st, 'FitCheck', [false, true, true]);
    const hit = Core.findConflicts(st, ix).find(c => c.id === fit.id);
    expect(hit.hard.map(h => h[0])).toContain('Außerhalb der zulässigen Dienste (Spät, Nacht)');
    // Ablegen: gewählt werden nur Tage in einem zulässigen Dienst
    const r = Core.checkPlacement(st, ix, { pk: fit.pk, type: 'FitCheck', start: 0, len: 3, factors: { trainee: 1 } });
    expect(r.days).toHaveLength(3);
    for (const d of r.days) expect(Core.assign(ix, i, d) % 3).not.toBe(0);
    expect(Core.shiftText(st, 'FitCheck')).toBe('nur im Spät- und Nachtdienst');
    expect(Core.shiftText(st, 'Practical Logbook')).toBe('in jedem Dienst');
  });
  it('gespeichert wird nur die Abweichung; die Vorgabe wiederherzustellen entfernt den Eintrag', () => {
    const st = bare();
    Core.setShifts(st, 'ICA', [true, true, false]);
    expect(st.settings.shifts).toEqual({ ICA: [true, true, false] });
    expect(Core.sanitize(JSON.parse(JSON.stringify(st))).state.settings.shifts).toEqual({ ICA: [true, true, false] });
    Core.setShifts(st, 'ICA', [true, false, false]);
    expect(st.settings.shifts).toEqual({});
    expect(() => Core.setShifts(st, 'ICA', [false, false, false])).toThrow(/Mindestens ein Dienst/);
  });
});

describe('eigene Schritte', () => {
  const def = { name: 'Human Factors', short: 'HF', color: 3, course: false, shifts: [true, true, false] }, cfg = { days: 2, trainee: 1, mentor: 0, tec: 0, examiner: 0 };
  it('lassen sich anlegen, in einen Weg aufnehmen und werden geplant', () => {
    const st = bare();
    Core.addMeasure(st, def, cfg);
    expect(Core.typesOf(st)).toContain('Human Factors');
    expect(st.config['1']['Human Factors']).toEqual({ days: 2, trainee: 1, mentor: 0, tec: 0, examiner: 0 });
    expect(Core.shiftsOf(st, 'Human Factors')).toEqual([true, true, false]);
    st.routes['1'] = Core.insertStep(st.routes['1'], 'Human Factors');
    expect(st.routes['1']).toEqual(['FitCheck', 'ICA', 'Human Factors']);                         // eigene Schritte kommen ans Ende
    plan(st);
    const ix = Core.buildIndex(st), people = st.people.filter(p => p.cluster === '1' && !Core.isLocked(p));
    const done = people.filter(p => Core.routeProgress(st, ix, p).state === 'complete');
    expect(done.length).toBeGreaterThan(0);
    for (const p of done) {
      const evs = st.events.filter(e => e.pk === p.pk), hf = evs.filter(e => e.type === 'Human Factors');
      expect(hf.reduce((s, e) => s + e.dates.length, 0)).toBe(2);
      expect(hf[0].start > evs.find(e => e.type === 'ICA').end).toBe(true);                       // in der Reihenfolge des Wegs
    }
    expect(shiftsUsed(st, 'Human Factors').every(s => s < 2)).toBe(true);
  });
  it('überstehen Speichern und Laden – samt Reihenfolge, Vorgaben und Terminen', () => {
    const st = bare();
    Core.addMeasure(st, def, cfg);
    st.routes['1'] = Core.moveStep(Core.insertStep(st.routes['1'], 'Human Factors'), 'Human Factors', 0);
    plan(st);
    const back = Core.sanitize(JSON.parse(JSON.stringify(st))).state;
    expect(back.measures).toEqual([{ name: 'Human Factors', short: 'HF', color: 3, course: false }]);
    expect(back.routes['1']).toEqual(['Human Factors', 'FitCheck', 'ICA']);
    expect(back.config['1']['Human Factors'].days).toBe(2);
    expect(back.events.filter(e => e.type === 'Human Factors').length).toBe(st.events.filter(e => e.type === 'Human Factors').length);
    expect(back.events.filter(e => e.type === 'Human Factors').length).toBeGreaterThan(0);
    // ohne den Katalog wären die Termine „Sonstiges“ – der Katalog wird deshalb zuerst gelesen
    const lost = Core.sanitize({ ...JSON.parse(JSON.stringify(st)), measures: [] }).state;
    expect(lost.events.some(e => e.type === 'Human Factors')).toBe(false);
  });
  it('Namen werden geprüft', () => {
    const st = bare();
    expect(Core.measureNameIssue(st, '')).toMatch(/fehlt/);
    expect(Core.measureNameIssue(st, 'fitcheck')).toMatch(/feste Maßnahme/);
    expect(Core.measureNameIssue(st, 'A|B')).toMatch(/unzulässiges Zeichen/);
    Core.addMeasure(st, def, cfg);
    expect(() => Core.addMeasure(st, { name: 'human factors' }, cfg)).toThrow(/gibt es bereits/);
  });
  it('lassen sich nur entfernen, solange es keine Termine dazu gibt; danach ist alles bereinigt', () => {
    const st = bare();
    Core.addMeasure(st, def, cfg);
    st.routes['1'] = Core.insertStep(st.routes['1'], 'Human Factors');
    const p = st.people.find(x => x.cluster === '1');
    p.customRoute = { steps: ['Human Factors', 'ICA'], config: Core.clone(st.config['1']) }; p.credit = { 'Human Factors': 1 };
    plan(st);
    expect(() => Core.removeMeasure(st, 'Human Factors')).toThrow(/wird noch verwendet/);
    st.events = st.events.filter(e => e.type !== 'Human Factors');
    Core.removeMeasure(st, 'Human Factors');
    expect(st.measures).toEqual([]);
    expect(st.routes['1']).not.toContain('Human Factors');
    expect(st.config['1']['Human Factors']).toBeUndefined();
    expect(p.customRoute.steps).toEqual(['ICA']);
    expect(p.credit).toBeUndefined();
    expect(st.settings.shifts).toEqual({});
  });
  it('als Lehrgang: Bedarf ohne Zielmuster, Platzvergabe im Blockmodus', () => {
    const st = bare({ courseBlocks: true }); st.courses = []; st.events = st.events.filter(e => !e.courseId);
    Core.addMeasure(st, { name: 'Sicherheitsschulung', short: 'Sich.', course: true }, { days: 2, trainee: 1 });
    expect(Core.isCourse(st, 'Sicherheitsschulung')).toBe(true);
    expect(Core.courseTypesOf(st)).toContain('Sicherheitsschulung');
    st.routes['1'] = ['Sicherheitsschulung', ...st.routes['1']];
    const ix = Core.buildIndex(st);
    const group = Core.courseDemand(st, ix).find(g => g.type === 'Sicherheitsschulung');
    expect(group.target).toBe('');
    expect(group.open.length).toBe(st.people.filter(p => p.cluster === '1' && !Core.isLocked(p) && !p.customRoute).length);
    // ohne Termin bleibt der Schritt offen …
    plan(st);
    expect(st.report.filter(r => /Kein Lehrgangstermin für Sicherheitsschulung/.test(r.reason)).length).toBe(group.open.length);
    // … mit Termin bekommen die Personen einen Platz und der Weg läuft danach weiter
    st.courses.push(Core.normCourse({ id: 'S1', type: 'Sicherheitsschulung', title: 'Sicherheit Januar', start: '2027-01-11', end: '2027-01-12', seats: 40 }, Core.courseTypesOf(st)));
    plan(st);
    const members = Core.courseMembers(st, 'S1');
    expect(members.length).toBeGreaterThan(0);
    for (const e of members) { expect(e.dates).toEqual(['2027-01-11', '2027-01-12']); expect(st.events.some(x => x.pk === e.pk && x.type === 'FitCheck' && x.start > e.end)).toBe(true); }
    expect(Core.normCourse({ type: 'Sicherheitsschulung', start: '2027-01-11', end: '2027-01-12' })).toBeNull();     // ohne Katalog keine gültige Lehrgangsart
  });
  it('ziehen beim Jahreswechsel mit um', () => {
    const st = bare();
    Core.addMeasure(st, def, cfg);
    st.routes['1'] = Core.insertStep(st.routes['1'], 'Human Factors');
    const next = Core.rolloverYear(plan(st)).state;
    expect(next.measures).toEqual(st.measures);
    expect(next.routes['1']).toContain('Human Factors');
    expect(next.settings.shifts).toEqual(st.settings.shifts);
  });
});

describe('Reihenfolge im Weg', () => {
  it('feste Maßnahmen landen an ihrer üblichen Stelle, verschieben geht frei', () => {
    expect(Core.insertStep(['Practical Logbook', 'ICA'], 'FitCheck')).toEqual(['Practical Logbook', 'FitCheck', 'ICA']);
    expect(Core.insertStep(['Practical Logbook', 'FitCheck', 'ICA'], 'Theorie')).toEqual(['Theorie', 'Practical Logbook', 'FitCheck', 'ICA']);
    expect(Core.insertStep(['ICA'], 'ICA')).toEqual(['ICA']);
    expect(Core.moveStep(['A', 'B', 'C'], 'C', 0)).toEqual(['C', 'A', 'B']);
    expect(Core.moveStep(['A', 'B', 'C'], 'A', 2)).toEqual(['B', 'C', 'A']);
    expect(Core.moveStep(['A', 'B', 'C'], 'B', 99)).toEqual(['A', 'C', 'B']);
    expect(Core.moveStep(['A', 'B'], 'X', 0)).toEqual(['A', 'B']);
  });
  it('der Planer folgt der gewählten Reihenfolge, und sie bleibt beim Laden erhalten', () => {
    const st = bare();
    st.routes['1'] = ['ICA', 'FitCheck'];                                       // umgekehrt zur Vorgabe
    plan(st);
    expect(Core.sanitize(JSON.parse(JSON.stringify(st))).state.routes['1']).toEqual(['ICA', 'FitCheck']);
    const ix = Core.buildIndex(st), done = st.people.filter(p => p.cluster === '1' && !p.customRoute && Core.routeProgress(st, ix, p).state === 'complete');
    expect(done.length).toBeGreaterThan(0);
    for (const p of done) {
      const evs = st.events.filter(e => e.pk === p.pk && e.auto), ica = evs.filter(e => e.type === 'ICA').map(e => e.end).sort().pop(), fit = evs.filter(e => e.type === 'FitCheck').map(e => e.start).sort()[0];
      if (ica && fit) expect(ica < fit).toBe(true);
    }
    expect(done.some(p => st.events.some(e => e.pk === p.pk && e.auto && e.type === 'ICA') && st.events.some(e => e.pk === p.pk && e.auto && e.type === 'FitCheck'))).toBe(true);
  });
});
