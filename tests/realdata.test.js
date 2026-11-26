// Echtbetrieb: Urlaubsplan aus einer Tagestabelle, Prüfung beim Ablegen im Jahresplan, Umstellung von simuliert auf real.
import { describe, it, expect, beforeAll } from 'vitest';
import * as Core from '../src/core/index.js';

function small() {
  const st = Core.emptyState(2027);
  for (const [pk, name] of [['1001', 'Muster, Max'], ['1002', 'Beispiel, Erika'], ['1003', 'Test, Tom']]) st.people.push(Core.normPerson({ pk, name, cluster: '2' }));
  Core.assignAliases(st.people);
  return st;
}

describe('Urlaubsplan als Tabelle je Tag', () => {
  it('liest Datumsspalten, ordnet Personen über Nummer oder Namen zu und zählt die Kürzel', () => {
    const st = small(), rows = [
      ['Urlaubsplan 2027'], [],
      ['PersNr', 'Name', '01.03.2027', '02.03.2027', '03.03.2027', '04.03.2027', '05.03.2027', '06.03.2027', '07.03.2027', '08.03.2027'],
      ['1001', 'Muster, Max', 'U', 'U', 'U', '', 'K', '', '', 'u'],
      ['', 'Erika Beispiel', 'F', 'S', 'ZA', 'ZA', '', '', '', ''],
      ['9999', 'Fremd, Person', 'U', '', '', '', '', '', '', ''],
      ['Summe', '', '2', '1', '1', '', '', '', '', '']];
    const m = Core.parseDayMatrix(st, rows);
    expect(m.errors).toEqual([]);
    expect(m.layout).toBe('Datum je Spalte');
    expect(m.dates).toHaveLength(8); expect(m.range).toEqual({ start: '2027-03-01', end: '2027-03-08' });
    expect([...m.cells.keys()]).toEqual(['1001', '1002']);                         // Name in anderer Schreibweise erkannt
    expect(Object.fromEntries(m.codes)).toEqual({ U: 4, K: 1, F: 1, S: 1, ZA: 2 });
    expect(m.unknown).toHaveLength(2);
    expect(m.warnings.join(' ')).toMatch(/2 Zeilen ohne bekannte Person/);
    expect(m.warnings.join(' ')).toMatch(/1 Personen des Projekts stehen nicht in der Tabelle/);
  });
  it('liest Tageszahlen unter Monatsnamen (auch über den Monatswechsel)', () => {
    const st = small(), days = [...Array.from({ length: 12 }, (_, i) => String(20 + i)), '1', '2', '3'];
    const months = ['', '', 'Januar', ...Array(11).fill(''), 'Februar', '', ''];
    const rows = [months, ['Nr', 'Name', ...days], ['1003', 'Test, Tom', ...Array(9).fill(''), 'U', 'U', 'U', 'U', '', 'K']];
    const m = Core.parseDayMatrix(st, rows);
    expect(m.errors).toEqual([]);
    expect(m.layout).toBe('Tageszahlen unter Monatsnamen');
    expect(m.dates).toHaveLength(15);
    expect(m.dates.slice(9)).toEqual(['2027-01-29', '2027-01-30', '2027-01-31', '2027-02-01', '2027-02-02', '2027-02-03']);
    expect(Core.matrixAbsences(m, { U: 'Urlaub', K: 'Krank' })).toEqual([{ pk: '1003', type: 'Urlaub', start: '2027-01-29', end: '2027-02-01' }, { pk: '1003', type: 'Krank', start: '2027-02-03', end: '2027-02-03' }]);
    const noMonths = Core.parseDayMatrix(st, [['Nr', ...Array.from({ length: 31 }, (_, i) => String(i + 1)), '1', '2'], ['1003', ...Array(33).fill('U')]]);
    expect(noMonths.dates[0]).toBe('2027-01-01'); expect(noMonths.dates[32]).toBe('2027-02-02');
  });
  it('schlägt die Bedeutung der Kürzel vor – Dienste nur, wenn der Dienstplan mitkommen soll', () => {
    const codes = ['U', 'K', 'ZA', 'F', 'S', 'N', '-', 'XYZ'];
    expect(Core.defaultCodeMap(codes)).toEqual({ U: 'Urlaub', K: 'Krank', ZA: 'Sonstiges', F: '', S: '', N: '', '-': '', XYZ: '' });
    expect(Core.defaultCodeMap(codes, true)).toMatchObject({ F: 'Früh', S: 'Spät', N: 'Nacht', '-': 'Frei', XYZ: '' });
  });
  it('fasst aufeinanderfolgende Tage zusammen und ersetzt nur die Personen der Tabelle im Zeitraum der Tabelle', () => {
    const st = small();
    st.absences = [{ pk: '1001', type: 'Urlaub', start: '2027-02-20', end: '2027-03-03', synthetic: true }, { pk: '1001', type: 'Urlaub', start: '2027-07-01', end: '2027-07-10', synthetic: true },
      { pk: '1003', type: 'Urlaub', start: '2027-03-01', end: '2027-03-05', synthetic: true }];
    st.meta.simulated.absences = true;
    const m = Core.parseDayMatrix(st, [['PersNr', '2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05', '2027-03-08'], ['1001', 'U', 'U', 'U', '', 'K', 'U'], ['1002', '', '', '', '', '', '']]);
    const map = Core.defaultCodeMap([...m.codes.keys()]);
    expect(Core.matrixAbsences(m, map)).toEqual([{ pk: '1001', type: 'Urlaub', start: '2027-03-01', end: '2027-03-03' }, { pk: '1001', type: 'Krank', start: '2027-03-05', end: '2027-03-05' }, { pk: '1001', type: 'Urlaub', start: '2027-03-08', end: '2027-03-08' }]);
    const info = Core.applyDayMatrix(st, m, map);
    expect(info).toMatchObject({ absences: 3, days: 5, removed: 1, rosterDays: 0 });
    const of = pk => st.absences.filter(a => a.pk === pk).map(a => a.start + '…' + a.end + (a.synthetic ? ' sim' : '')).sort();
    expect(of('1001')).toEqual(['2027-02-20…2027-02-28 sim', '2027-03-01…2027-03-03', '2027-03-05…2027-03-05', '2027-03-08…2027-03-08', '2027-07-01…2027-07-10 sim']);
    expect(of('1003')).toEqual(['2027-03-01…2027-03-05 sim']);                    // nicht in der Tabelle: unverändert
    expect(st.meta.simulated.absences).toBe(true);
    expect(st.roster).toEqual({});
  });
  it('setzt auf Wunsch auch den Dienstplan aus denselben Kürzeln', () => {
    const st = small(), m = Core.parseDayMatrix(st, [['PersNr', '2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04'], ['1001', 'F', 'N', 'U', '-']]);
    const info = Core.applyDayMatrix(st, m, Core.defaultCodeMap([...m.codes.keys()], true)), cal = Core.makeCalendar(2027), r = Core.decodeRoster(st.roster['1001'], cal.n), d = cal.idx('2027-03-01');
    expect(info.rosterDays).toBe(3);
    expect([r[d], r[d + 1], r[d + 2], r[d + 3]]).toEqual([Core.rosterCode('M1', 'Früh'), Core.rosterCode('M1', 'Nacht'), 0, 1]);
    expect(st.absences).toEqual([{ pk: '1001', type: 'Urlaub', start: '2027-03-03', end: '2027-03-03' }]);
  });
  it('meldet verständlich, wenn keine Datumszeile oder keine Person erkannt wird', () => {
    const st = small();
    expect(Core.parseDayMatrix(st, [['a', 'b'], ['c', 'd']]).errors[0]).toMatch(/Keine Datumszeile/);
    expect(Core.parseDayMatrix(st, [['Nr', '2027-03-01', '2027-03-02', '2027-03-03'], ['4711', 'U', 'U', 'U']]).errors[0]).toMatch(/Keine Zeile ließ sich einer Person zuordnen/);
  });
});

describe('Maßnahme im Jahresplan ablegen', () => {
  let st, ix, p, i;
  beforeAll(() => {
    st = Core.demoState({}); st.events = st.events.filter(e => !e.auto); ix = Core.buildIndex(st);
    p = st.people.find(x => x.cluster === '2'); i = ix.pi.get(p.pk);
  });
  const firstDuty = (from, shift) => { for (let d = from; d < ix.n; d++) if (ix.work[d] && !ix.abs[i][d] && Core.assign(ix, i, d) === shift) return d; return -1; };

  it('liefert Dauer und Faktoren aus dem Ausbildungsweg', () => {
    expect(Core.elementFor(st, ix, p, 'Practical Logbook')).toMatchObject({ days: 30, total: 30, trainee: 1, mentor: 0.5 });
    expect(Core.elementFor(st, ix, p, 'FitCheck')).toMatchObject({ days: 2, tec: 1 });
  });
  it('belegt ab dem Ablagetag die nächsten Diensttage der Person und prüft dort die Kapazität', () => {
    const f = Core.elementFor(st, ix, p, 'Practical Logbook'), start = firstDuty(60, 0);
    const r = Core.checkPlacement(st, ix, { pk: p.pk, type: 'Practical Logbook', start, len: 10, factors: f });
    expect(r.days).toHaveLength(10); expect(r.days[0]).toBe(start);
    expect(r.skipped).toBeGreaterThan(0);                                           // freie Tage im 5/2-Rhythmus werden übersprungen
    for (const d of r.days) { expect(ix.abs[i][d]).toBe(0); expect(Core.assign(ix, i, d)).toBeGreaterThanOrEqual(0); }
    expect(r.ok).toBe(true);
    expect(r.perDay.every(x => x.state === 'ok' && x.after >= x.zero)).toBe(true);
  });
  it('legt Prüfungstage nur in den Frühdienst und nie auf belegte Tage', () => {
    const late = firstDuty(60, 1), r = Core.checkPlacement(st, ix, { pk: p.pk, type: 'FitCheck', start: late, len: 2, factors: { trainee: 1 } });
    for (const d of r.days) expect(Core.assign(ix, i, d) % 3).toBe(0);
    expect(r.days[0]).toBeGreaterThan(late);
    expect(Core.checkPlacement(st, ix, { pk: p.pk, type: 'Practical Logbook', start: late, len: 1, factors: { trainee: 1 } }).days[0]).toBe(late);
  });
  it('meldet zu knappe Kapazität und weicht auf Wunsch auf zulässige Tage aus', () => {
    const tight = Core.clone(st), early = firstDuty(60, 0), k = Core.assign(ix, i, early);
    // an genau diesem Tag ist die Besetzung zu knapp
    tight.capacity.push({ date: ix.cal.iso[early], area: Core.kArea(k), shift: Core.kShift(k), net: 20, min: 30, zero: 35, checked: true, absencesIncluded: true, gross: 25, absent: 0 });
    const tx = Core.buildIndex(tight), f = { trainee: 1 };
    const r = Core.checkPlacement(tight, tx, { pk: p.pk, type: 'Practical Logbook', start: early, len: 3, factors: f });
    expect(r.ok).toBe(false); expect(r.crit).toBe(1);
    expect(r.perDay[0]).toMatchObject({ d: early, state: 'crit', why: ['unter Minimum'] });
    const alt = Core.checkPlacement(tight, tx, { pk: p.pk, type: 'Practical Logbook', start: early, len: 3, factors: f, spread: true });
    expect(alt.ok).toBe(true); expect(alt.days).toHaveLength(3); expect(alt.days).not.toContain(early);
  });
  it('behandelt einen Lehrgang als festen Block: Abwesenheit ist ein Befund, freie Tage sind ein Hinweis', () => {
    const abs = st.absences.find(a => a.pk === p.pk), d0 = ix.cal.idx(abs.start);
    const r = Core.checkPlacement(st, ix, { pk: p.pk, type: 'Theorie', start: d0, len: 10, factors: { trainee: 1 } });
    expect(r.days).toHaveLength(10);
    expect(r.perDay.some(x => x.why.includes('Abwesenheit'))).toBe(true);
    expect(r.crit).toBeGreaterThan(0); expect(r.skipped).toBe(0);
    const free = Core.checkPlacement(st, ix, { pk: p.pk, type: 'Theorie', start: firstDuty(150, 0), len: 10, factors: { trainee: 1 } });
    expect(free.notes).toBeGreaterThan(0);
  });
  it('rechnet beim Verschieben die eigene Last nicht doppelt', () => {
    const s2 = Core.clone(st), early = firstDuty(60, 0), e = { id: 'mv', pk: p.pk, type: 'Practical Logbook', auto: false, start: ix.cal.iso[early], end: ix.cal.iso[early], dates: [ix.cal.iso[early]], trainee: 1, mentor: 0.5, tec: 0, examiner: 0, target: '' };
    s2.events.push(e);
    const x2 = Core.buildIndex(s2), f = { trainee: 1, mentor: 0.5 };
    const stay = Core.checkPlacement(s2, x2, { pk: p.pk, type: e.type, start: early, len: 1, factors: f, moveId: 'mv' });
    const fresh = Core.checkPlacement(st, ix, { pk: p.pk, type: e.type, start: early, len: 1, factors: f });
    expect(stay.perDay[0].why).not.toContain('Terminkollision');
    expect(stay.perDay[0].after).toBeCloseTo(fresh.perDay[0].after, 9);
    expect(Core.checkPlacement(s2, x2, { pk: p.pk, type: e.type, start: early, len: 1, factors: f }).days[0]).toBeGreaterThan(early);   // ohne Verschieben ist der Tag belegt
  });
});

describe('Umstellung auf Echtbetrieb', () => {
  it('entfernt Simuliertes und lässt Personen, Qualifikationen, Cluster und Wege unberührt', () => {
    const st = Core.demoState({}), people = JSON.stringify(st.people), routes = JSON.stringify([st.routes, st.config, st.limits]);
    const parts = Core.simulatedParts(st);
    expect(parts.absences).toBe(st.absences.length); expect(parts.courses).toBe(st.courses.length); expect(parts.roster).toBe(141);
    const done = Core.removeSimulated(st, { absences: true, scenario: true, auto: true });
    expect(done).toMatchObject({ absences: parts.absences, scenario: parts.scenario, courses: parts.courses, roster: 0 });
    expect(JSON.stringify(st.people)).toBe(people);
    expect(JSON.stringify([st.routes, st.config, st.limits])).toBe(routes);
    expect(st.absences).toEqual([]); expect(st.events).toEqual([]); expect(st.courses).toEqual([]);
    expect(Object.keys(st.roster)).toHaveLength(141);                              // Dienstplan bleibt, solange kein echter vorliegt
    expect(st.meta).toMatchObject({ dataClass: 'real', simulated: { roster: true, absences: false } });
    Core.removeSimulated(st, { roster: true });
    expect(st.roster).toEqual({}); expect(st.meta.simulated.roster).toBe(false);
  });
  it('zeigt je Baustein, was für eine belastbare Planung noch fehlt', () => {
    const st = Core.demoState({}), ix = Core.buildIndex(st), r = Object.fromEntries(Core.readiness(st, ix, Core.summarize(st, ix)).map(x => [x.key, x.state]));
    expect(r).toEqual({ people: 'warn', absences: 'warn', roster: 'warn', limits: 'good', calendar: 'good', courses: 'good', plan: 'good' });
    Core.removeSimulated(st, { absences: true, scenario: true, auto: true });
    const ix2 = Core.buildIndex(st), r2 = Object.fromEntries(Core.readiness(st, ix2, Core.summarize(st, ix2)).map(x => [x.key, x]));
    expect(r2.absences.text).toMatch(/Noch kein Urlaubsplan/);
    expect(r2.courses.state).toBe('warn'); expect(r2.courses.text).toMatch(/Personen ohne Lehrgangsplatz/);
    expect(r2.plan.text).toMatch(/Noch nicht berechnet/);
    const empty = Core.emptyState(2027), ex = Core.buildIndex(empty);
    expect(Core.readiness(empty, ex, Core.summarize(empty, ex))[0]).toMatchObject({ key: 'people', state: 'crit' });
  });
});
