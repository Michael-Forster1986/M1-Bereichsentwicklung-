// Feste Maßnahmen anpassen (Bezeichnung, Kürzel, Farbe, Art) und die Regeln der Planung ändern.
import { describe, it, expect } from 'vitest';
import * as Core from '../src/core/index.js';

const plan = st => { const res = Core.optimizePlan(st, Core.buildIndex(st), { variants: 4 }); st.events = res.events; st.report = res.report; return st; };
/** Demo-Stand ohne berechnete Termine, Kurse tageweise, ohne Kapazitätsgrenze. */
function bare(opt = {}) {
  const st = Core.demoState({ year: 2027, count: 60, seed: 11, courseBlocks: false, ...opt });
  st.events = st.events.filter(e => !e.auto); st.report = []; st.settings.cap = false;
  return st;
}
const reload = st => Core.sanitize(JSON.parse(JSON.stringify(st))).state;
const reasonOf = (st, pk) => (st.report.find(r => r.pk === pk) || {}).reason || '';
const active = (st, k) => st.people.filter(p => p.cluster === k && !Core.isLocked(p) && !p.customRoute);

describe('feste Maßnahmen anpassen', () => {
  it('Bezeichnung, Kürzel und Farbe ändern nur die Anzeige – der Name bleibt der Schlüssel', () => {
    const st = bare();
    Core.editBuiltin(st, 'Practical Logbook', { label: 'Logbuch Praxis', short: 'LB', color: 4 });
    expect(st.measureEdits).toEqual({ 'Practical Logbook': { label: 'Logbuch Praxis', short: 'LB', color: 4 } });
    expect(Core.labelOf(st, 'Practical Logbook')).toBe('Logbuch Praxis');
    expect(Core.labelOf(st, 'FitCheck')).toBe('FitCheck');
    plan(st);
    expect(st.events.some(e => e.type === 'Practical Logbook')).toBe(true);
    expect(st.events.some(e => e.type === 'Logbuch Praxis')).toBe(false);
    expect(st.routes['2']).toContain('Practical Logbook');
  });
  it('übersteht Speichern, Laden und den Jahreswechsel; die Vorgabe wird nicht gespeichert', () => {
    const st = bare();
    Core.editBuiltin(st, 'FitCheck', { label: 'Eignungstest', color: 2 });
    Core.editBuiltin(st, 'ICA', { label: 'ICA', short: '', color: 0 });              // entspricht der Vorgabe
    expect(Object.keys(st.measureEdits)).toEqual(['FitCheck']);
    expect(reload(st).measureEdits).toEqual({ FitCheck: { label: 'Eignungstest', color: 2 } });
    expect(Core.rolloverYear(plan(st)).state.measureEdits).toEqual(st.measureEdits);
    // Unsinn aus einer Datei wird verworfen
    const bad = reload({ ...JSON.parse(JSON.stringify(st)), measureEdits: { FitCheck: { label: 'ICA', color: 99, course: 'ja' }, Unbekannt: { label: 'X' }, ICA: { course: true } } });
    expect(bad.measureEdits).toEqual({});
  });
  it('Bezeichnungen bleiben eindeutig', () => {
    const st = bare();
    expect(() => Core.editBuiltin(st, 'Theorie', { label: 'Praxis' })).toThrow(/feste Maßnahme/);
    expect(() => Core.editBuiltin(st, 'Theorie', { label: 'Sonstiges' })).toThrow();
    Core.editBuiltin(st, 'Theorie', { label: 'Grundkurs' });
    expect(() => Core.editBuiltin(st, 'Praxis', { label: 'grundkurs' })).toThrow(/heißt bereits/);
    expect(Core.measureNameIssue(st, 'Grundkurs')).toMatch(/heißt bereits/);                     // auch ein eigener Schritt darf nicht so heißen
    Core.addMeasure(st, { name: 'Human Factors' }, { days: 1, trainee: 1 });
    expect(() => Core.editBuiltin(st, 'Praxis', { label: 'Human Factors' })).toThrow(/gibt es bereits/);
    Core.editBuiltin(st, 'Theorie', { label: '' });                                              // leer = Vorgabe
    expect(st.measureEdits).toEqual({});
  });
  it('die Art lässt sich umstellen, solange es keine Termine gibt – Vorbereitung und ICA stehen fest', () => {
    const st = bare({ courseBlocks: true }); st.courses = []; st.events = [];
    expect(Core.kindFixed('ICA')).toBe(true);
    expect(() => Core.editBuiltin(st, 'ICA', { course: true })).toThrow(/steht fest/);
    expect(() => Core.editBuiltin(st, 'Vorbereitung', { course: true })).toThrow(/steht fest/);
    Core.editBuiltin(st, 'FitCheck', { course: true });
    expect(Core.isCourse(st, 'FitCheck')).toBe(true);
    expect(Core.courseTypesOf(st)).toEqual(['Theorie', 'Praxis', 'Basic Knowledge', 'FG650', 'FitCheck']);
    // im Blockmodus verlangt der Planer jetzt einen Lehrgangstermin für FitCheck
    plan(st);
    const c1 = active(st, '1');
    expect(c1.length).toBeGreaterThan(0);
    for (const p of c1) expect(reasonOf(st, p.pk)).toMatch(/Kein Lehrgangstermin für FitCheck/);
    // umgekehrt: Theorie einzeln im Dienst
    Core.editBuiltin(st, 'Theorie', { course: false });
    expect(Core.isCourse(st, 'Theorie')).toBe(false);
    expect(st.measureEdits.Theorie).toEqual({ course: false });
    Core.editBuiltin(st, 'Theorie', { course: true });                                           // zurück zur Vorgabe: kein Eintrag mehr
    expect(st.measureEdits.Theorie).toBeUndefined();
  });
  it('gibt es bereits Termine, bleibt die Art – auch beim Zurücksetzen', () => {
    const st = bare({ courseBlocks: true }); st.courses = []; st.events = [];
    Core.editBuiltin(st, 'FitCheck', { course: true, label: 'Eignungstest' });
    Core.setShifts(st, 'FitCheck', [true, true, false]);
    st.courses.push(Core.normCourse({ id: 'F1', type: 'FitCheck', title: 'Eignung Januar', start: '2027-01-11', end: '2027-01-15', seats: 40 }, Core.courseTypesOf(st)));
    expect(() => Core.editBuiltin(st, 'FitCheck', { course: false })).toThrow(/Lehrgänge/);
    expect(Core.resetBuiltin(st, 'FitCheck')).toBe(false);
    expect(st.measureEdits).toEqual({ FitCheck: { course: true } });
    expect(st.settings.shifts.FitCheck).toBeUndefined();
    st.courses = [];
    expect(Core.resetBuiltin(st, 'FitCheck')).toBe(true);
    expect(st.measureEdits).toEqual({});
    expect(Core.isCourse(st, 'FitCheck')).toBe(false);
  });
  it('Meldungen und Excel-Listen kennen die Bezeichnung', () => {
    const st = bare(); st.events = [];
    Core.editBuiltin(st, 'FitCheck', { label: 'Eignungstest' });
    st.config['1'].FitCheck.days = null;
    plan(st);
    expect(reasonOf(st, active(st, '1')[0].pk)).toBe('Dauer oder Produktivitätsverlust fehlt: Eignungstest');
    const pk = st.people[0].pk, head = ['pk', 'type', 'start', 'end'];
    const res = Core.checkEvents(st, [{ pk, type: 'eignungstest', start: '2027-03-01', end: '2027-03-02' }, { pk, type: 'FitCheck', start: '2027-03-03', end: '2027-03-03' }, { pk, type: 'Unsinn', start: '2027-03-04', end: '2027-03-04' }], head);
    expect(res.rows.map(r => r.type)).toEqual(['FitCheck', 'FitCheck']);
    expect(res.errors.length).toBe(1);
    Core.editBuiltin(st, 'Praxis', { label: 'Praktischer Teil' });
    expect(Core.courseTypeOf('praktischer teil', st)).toBe('Praxis');
  });
});

describe('Regeln der Planung', () => {
  it('ohne Änderung gilt die Vorgabe und nichts wird gespeichert', () => {
    const st = bare();
    expect(st.settings.rules).toBeUndefined();
    expect(Core.rulesOf(st)).toEqual({ frame: ['3', '4B'], tecRoute: ['Theorie', 'Praxis'], deferA320: true, kombiTecOnly: true, autoPrep: true });
    Core.setRules(st, { frame: ['4B', '3'], autoPrep: true, tecRoute: ['Theorie', 'Praxis'] });   // entspricht der Vorgabe
    expect(st.settings.rules).toBeUndefined();
    expect(Core.rulesChanged(st)).toBe(false);
    expect(Core.normRules({ frame: 'x', tecRoute: ['Unsinn'], deferA320: 'nein', autoPrep: 0 })).toEqual({});
  });
  it('Änderungen überstehen Speichern, Laden und den Jahreswechsel', () => {
    const st = bare();
    Core.setRules(st, { frame: ['3'], deferA320: false });
    Core.setRules(st, { tecRoute: ['Theorie', 'Praxis', 'ICA'] });
    expect(st.settings.rules).toEqual({ frame: ['3'], tecRoute: ['Theorie', 'Praxis', 'ICA'], deferA320: false });
    expect(Core.rulesChanged(st)).toBe(true);
    expect(reload(st).settings.rules).toEqual(st.settings.rules);
    expect(Core.rolloverYear(plan(st)).state.settings.rules).toEqual(st.settings.rules);
    Core.resetRules(st);
    expect(Core.rulesOf(st)).toEqual(Core.DEFAULT_RULES);
    expect(reload(st).settings.rules).toBeUndefined();
  });
  it('Praxis-Lehrgang als Voraussetzung: gilt für die gewählten Cluster', () => {
    const st = bare(); st.events = [];
    const c3 = active(st, '3'), c2 = active(st, '2');
    for (const p of c3) { p.gate = ''; delete p.credit; }
    plan(st);
    for (const p of c3) expect(reasonOf(st, p.pk)).toBe('Praxis-Kursrahmen oder Abschlussdatum aller Doings fehlt');
    // Regel für Cluster 3 abgeschaltet: die Wege werden geplant
    Core.setRules(st, { frame: ['4B'] });
    st.events = []; plan(st);
    for (const p of c3) expect(reasonOf(st, p.pk)).not.toMatch(/Kursrahmen/);
    expect(st.events.some(e => e.pk === c3[0].pk && e.type === 'Practical Logbook')).toBe(true);
    // Regel auf Cluster 2 ausgedehnt: dort fehlt jetzt die Voraussetzung
    Core.setRules(st, { frame: ['2', '4B'] });
    for (const p of c2) { p.gate = ''; delete p.credit; }
    st.events = []; plan(st);
    for (const p of c2) expect(reasonOf(st, p.pk)).toBe('Praxis-Kursrahmen oder Abschlussdatum aller Doings fehlt');
    // der Lehrgangsbedarf folgt der Regel
    const demand = Core.courseDemand(st, Core.buildIndex(st)).find(g => g.type === 'Praxis' && g.target === '');
    expect(demand.all).toEqual(expect.arrayContaining(c2.map(p => p.pk)));
    expect(demand.all).not.toContain(c3[0].pk);
  });
  it('A320 zurückstellen und Kombikurs nur für TEC lassen sich abschalten', () => {
    const st = bare(); st.events = [];
    const [a, b] = active(st, '5').filter(p => p.level !== 'TEC');
    expect(b).toBeTruthy();
    a.target = 'A320'; b.target = 'A350/A380 Kombikurs';
    plan(st);
    expect(reasonOf(st, a.pk)).toBe('A320 gemäß Vorgängerregel zurückgestellt');
    expect(reasonOf(st, b.pk)).toBe('Kombikurs nur für Zielstufe TEC');
    Core.setRules(st, { deferA320: false, kombiTecOnly: false });
    st.events = []; plan(st);
    expect(reasonOf(st, a.pk)).not.toMatch(/zurückgestellt/);
    expect(reasonOf(st, b.pk)).not.toMatch(/Kombikurs/);
    expect(st.events.some(e => e.pk === a.pk && e.auto)).toBe(true);
    expect(st.events.some(e => e.pk === b.pk && e.auto)).toBe(true);
  });
  it('Vorbereitungstag vor der ICA: automatisch – oder gar nicht', () => {
    const st = bare(); st.events = [];
    plan(st);
    const icas = st.events.filter(e => e.type === 'ICA' && e.auto).length;
    expect(icas).toBeGreaterThan(0);
    expect(st.events.filter(e => e.type === 'Vorbereitung' && e.auto).length).toBe(icas);
    Core.setRules(st, { autoPrep: false });
    st.events = []; plan(st);
    expect(st.events.filter(e => e.type === 'ICA' && e.auto).length).toBeGreaterThanOrEqual(icas);
    expect(st.events.some(e => e.type === 'Vorbereitung')).toBe(false);
    // steht die Vorbereitung als Schritt im Weg, wird sie wie jeder Schritt geplant
    st.routes['1'] = ['FitCheck', 'Vorbereitung', 'ICA'];
    st.events = []; plan(st);
    const p = active(st, '1')[0], mine = st.events.filter(e => e.pk === p.pk).sort((x, y) => x.start < y.start ? -1 : 1).map(e => e.type);
    expect(mine).toEqual(['FitCheck', 'Vorbereitung', 'ICA']);
  });
  it('der Weg für die Zielstufe TEC ist frei wählbar', () => {
    const st = bare(); st.events = [];
    const tec = active(st, '5').filter(p => p.level === 'TEC' && p.target !== 'A320');
    expect(tec.length).toBeGreaterThan(0);
    expect(Core.routeOf(st, tec[0])).toEqual(['Theorie', 'Praxis']);
    Core.setRules(st, { tecRoute: ['Praxis', 'Theorie', 'FitCheck'] });
    expect(Core.routeOf(st, tec[0])).toEqual(['Praxis', 'Theorie', 'FitCheck']);
    expect(Core.routeOf(st, active(st, '5').find(p => p.level !== 'TEC'))).toEqual(st.routes['5']);
    plan(st);
    const mine = st.events.filter(e => e.pk === tec[0].pk && e.auto).sort((x, y) => x.start < y.start ? -1 : 1).map(e => e.type);
    expect(mine).toEqual(['Praxis', 'Theorie', 'FitCheck']);
    expect(() => Core.setRules(st, { tecRoute: [] })).toThrow(/mindestens einen Schritt/);
    // ein eigener Schritt im TEC-Weg verschwindet mit dem Schritt
    Core.addMeasure(st, { name: 'Human Factors' }, { days: 1, trainee: 1 });
    Core.setRules(st, { tecRoute: ['Theorie', 'Human Factors'] });
    expect(Core.measureUsage(st, 'Human Factors').tec).toBe(true);
    expect(reload(st).settings.rules.tecRoute).toEqual(['Theorie', 'Human Factors']);
    Core.removeMeasure(st, 'Human Factors');
    expect(Core.rulesOf(st).tecRoute).toEqual(['Theorie']);
  });
  it('im Blockmodus plant der Weg den Praxis-Lehrgang selbst, wenn er darin steht', () => {
    const st = bare({ courseBlocks: true }); st.events = [];
    const p = active(st, '3')[0]; p.gate = ''; delete p.credit;
    st.routes['3'] = ['Praxis', ...st.routes['3'].filter(t => t !== 'Praxis')];
    plan(st);
    expect(reasonOf(st, p.pk)).not.toMatch(/Kursrahmen/);
  });
});

describe('geänderten Weg in den Jahresplan übernehmen', () => {
  const sig = e => [e.id, e.pk, e.type, e.start, e.end, e.dates.join(',')].join('|');
  const daysOf = (st, pk, type) => st.events.filter(e => e.pk === pk && e.type === type).reduce((s, e) => s + e.dates.length, 0);
  const apply = (st, pks) => { const res = Core.replanPeople(st, Core.buildIndex(st), pks); st.events = res.events; st.report = res.report; return res; };

  it('verteilt nur die genannte Person neu – alle anderen Termine und Berichtszeilen bleiben, wie sie sind', () => {
    const st = plan(bare()), p = active(st, '2')[0];
    const others = st.events.filter(e => e.pk !== p.pk).map(sig).sort(), report = st.report.filter(r => r.pk !== p.pk), rows = st.report.length;
    expect(daysOf(st, p.pk, 'FitCheck')).toBe(2);
    // individueller Weg: FitCheck 4 statt 2 Tage und vor dem Logbook
    p.customRoute = { steps: ['FitCheck', 'Practical Logbook', 'ICA'], config: Core.clone(st.config['2']) };
    p.customRoute.config.FitCheck.days = 4;
    expect(Core.routeProgress(st, Core.buildIndex(st), p).state).toBe('partial');           // der Plan zeigt noch den alten Weg
    apply(st, [p.pk]);
    expect(st.events.filter(e => e.pk !== p.pk).map(sig).sort()).toEqual(others);
    expect(st.report.filter(r => r.pk !== p.pk)).toEqual(report);
    expect(st.report.length).toBe(rows);
    expect(st.report.find(r => r.pk === p.pk).status).toBe('planned');
    expect(daysOf(st, p.pk, 'FitCheck')).toBe(4);
    const mine = st.events.filter(e => e.pk === p.pk && e.auto && e.type !== 'Vorbereitung').sort((a, b) => a.start < b.start ? -1 : 1).map(e => e.type);
    expect(mine).toEqual(['FitCheck', 'Practical Logbook', 'ICA']);
    expect(Core.routeProgress(st, Core.buildIndex(st), p).state).toBe('complete');
    expect(Core.findConflicts(st, Core.buildIndex(st)).filter(c => c.pk === p.pk && c.hard.length)).toEqual([]);
  });
  it('ein ganzer Cluster folgt nach der Übernahme der neuen Reihenfolge; Personen mit eigenem Weg bleiben unberührt', () => {
    const st = plan(bare()), all = active(st, '2'), own = all[0], rest = all.slice(1);
    own.customRoute = { steps: st.routes['2'].slice(), config: Core.clone(st.config['2']) };
    const ownBefore = st.events.filter(e => e.pk === own.pk).map(sig).sort();
    st.routes['2'] = ['FitCheck', 'Practical Logbook', 'ICA'];
    apply(st, rest.map(p => p.pk));
    expect(st.events.filter(e => e.pk === own.pk).map(sig).sort()).toEqual(ownBefore);
    for (const p of rest) {
      const fit = st.events.find(e => e.pk === p.pk && e.type === 'FitCheck' && e.auto), log = st.events.find(e => e.pk === p.pk && e.type === 'Practical Logbook' && e.auto);
      if (fit && log) expect(fit.end < log.start).toBe(true);
    }
    expect(rest.some(p => st.events.some(e => e.pk === p.pk && e.type === 'FitCheck' && e.auto))).toBe(true);
  });
  it('rechnet mit den Terminen der anderen: keine neuen Tage unter dem Minimum, kein Lehrgang überbucht', () => {
    const st = Core.demoState({ year: 2027, count: 60, seed: 11 });                          // Kapazitätsmodus, Lehrgänge als Block
    const ix = Core.buildIndex(st), full = Core.optimizePlan(st, ix, { variants: 4 });
    st.events = full.events; st.report = full.report;
    const under = Core.scorePlan(st, ix, full).underMin, people = active(st, '5').slice(0, 6);
    expect(people.length).toBeGreaterThan(2);
    for (const p of people) { p.customRoute = { steps: Core.routeOf(st, p).slice(), config: Core.clone(st.config['5']) }; for (const t of p.customRoute.steps) p.customRoute.config[t].days += 2; }
    const res = apply(st, people.map(p => p.pk)), ix2 = Core.buildIndex(st);
    expect(Core.scorePlan(st, ix2, res).underMin).toBeLessThanOrEqual(under);
    for (const c of st.courses) if (c.seats != null) expect(Core.courseMembers(st, c.id).length).toBeLessThanOrEqual(c.seats);
    expect(Core.findConflicts(st, ix2).filter(c => people.some(p => p.pk === c.pk) && c.hard.some(h => /Terminkollision/.test(h[0])))).toEqual([]);
    // unbekannte Personalnummern werden übergangen
    expect(() => apply(st, ['gibt-es-nicht'])).not.toThrow();
  });
});
