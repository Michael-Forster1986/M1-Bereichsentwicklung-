// Mehrjahresplanung: Vorleistungen im Planer und der Jahreswechsel („Folgejahr anlegen“).
import { describe, it, expect, beforeAll } from 'vitest';
import * as Core from '../src/core/index.js';

const days = (st, ix, pk, type) => st.events.filter(e => e.pk === pk && e.type === type).reduce((s, e) => s + (ix.evDays.get(e.id) || []).length, 0);
const plan = st => { const res = Core.optimizePlan(st, Core.buildIndex(st), { variants: 6 }); st.events = res.events; st.report = res.report; return st; };

describe('Vorleistung aus Vorjahren', () => {
  let st, p;
  beforeAll(() => {
    st = Core.demoState({ year: 2027, count: 40, seed: 21 });
    st.events = st.events.filter(e => !e.auto); st.report = [];
    st.settings.cap = false;                                     // Szenariomodus: die Grenzwerte der Vorgabe passen nur zu 141 Personen
    p = st.people.find(x => x.cluster === '2');                  // Weg: Logbook 30 · FitCheck 2 · ICA 1
  });
  it('wird nur als positive ganze Tage je bekannter Maßnahme gespeichert', () => {
    expect(Core.normCredit({ 'Practical Logbook': 12.4, FitCheck: 0, ICA: -3, Unsinn: 5, Theorie: '7' })).toEqual({ 'Practical Logbook': 12, Theorie: 7 });
    expect(Core.normCredit({})).toBeNull(); expect(Core.normCredit(null)).toBeNull();
    expect(Core.normPerson({ pk: 'x', credit: { FitCheck: 2 } }).credit).toEqual({ FitCheck: 2 });
    expect(Core.normPerson({ pk: 'x', credit: { FitCheck: 0 } }).credit).toBeUndefined();
  });
  it('verkürzt den geplanten Rest um die bereits erbrachten Tage', () => {
    const base = plan(Core.clone(st)), ixb = Core.buildIndex(base);
    expect(days(base, ixb, p.pk, 'Practical Logbook')).toBe(30);
    const withCredit = Core.clone(st); withCredit.people.find(x => x.pk === p.pk).credit = { 'Practical Logbook': 22 };
    plan(withCredit); const ix = Core.buildIndex(withCredit), q = withCredit.people.find(x => x.pk === p.pk);
    expect(days(withCredit, ix, p.pk, 'Practical Logbook')).toBe(8);
    expect(days(withCredit, ix, p.pk, 'FitCheck')).toBe(2);
    const pr = Core.routeProgress(withCredit, ix, q);
    expect(pr.state).toBe('complete');
    expect(pr.steps[0]).toMatchObject({ type: 'Practical Logbook', need: 30, have: 30, credit: 22 });
  });
  it('lässt erledigte Schritte aus und meldet einen vollständig erbrachten Weg als abgedeckt', () => {
    const done = Core.clone(st); done.people.find(x => x.pk === p.pk).credit = { 'Practical Logbook': 30, FitCheck: 2, ICA: 1 };
    plan(done); const ix = Core.buildIndex(done);
    expect(done.events.filter(e => e.pk === p.pk)).toHaveLength(0);
    expect(done.report.find(r => r.pk === p.pk)).toMatchObject({ status: 'kept', reason: expect.stringMatching(/Vorleistungen aus Vorjahren/) });
    expect(Core.routeProgress(done, ix, done.people.find(x => x.pk === p.pk)).state).toBe('complete');
  });
  it('zeigt einen begonnenen Weg ohne Termine als teilweise geplant', () => {
    const part = Core.clone(st); part.people.find(x => x.pk === p.pk).credit = { 'Practical Logbook': 10 };
    const pr = Core.routeProgress(part, Core.buildIndex(part), part.people.find(x => x.pk === p.pk));
    expect(pr.state).toBe('partial'); expect(pr.end).toBe('');
  });
  it('ersetzt bei Cluster 3 den fehlenden Praxis-Kursrahmen', () => {
    const s3 = Core.clone(st), q = s3.people.find(x => x.cluster === '3');
    s3.events = s3.events.filter(e => e.pk !== q.pk);
    plan(s3);
    expect(s3.report.find(r => r.pk === q.pk)).toMatchObject({ status: 'open', reason: expect.stringMatching(/Praxis-Kursrahmen/) });
    q.credit = { Praxis: 7 };
    plan(s3);
    expect(s3.report.find(r => r.pk === q.pk).reason).not.toMatch(/Praxis-Kursrahmen/);
  });
});

describe('Folgejahr anlegen', () => {
  let prev, ix, next, info;
  beforeAll(() => {
    prev = Core.demoState({ year: 2027, count: 141, seed: 2027 }); ix = Core.buildIndex(prev);
    ({ state: next, info } = Core.rolloverYear(prev));
  });
  const state = p => Core.routeProgress(prev, ix, p).state;

  it('legt das nächste Jahr mit denselben Personen an und lässt das alte unverändert', () => {
    const before = JSON.stringify(prev);
    Core.rolloverYear(prev);
    expect(JSON.stringify(prev)).toBe(before);
    expect(next.meta.year).toBe(2028);
    expect(next.meta.title).toBe('M1 Jahressimulation 2028');
    expect(next.people.map(p => [p.pk, p.alias, p.name])).toEqual(prev.people.map(p => [p.pk, p.alias, p.name]));
    expect(info).toMatchObject({ from: 2027, year: 2028, people: 141 });
  });
  it('übernimmt Wege, Grenzwerte und Einstellungen – aber keine Termine, Abwesenheiten oder Ferien', () => {
    expect(next.config).toEqual(prev.config); expect(next.routes).toEqual(prev.routes); expect(next.limits).toEqual(prev.limits);
    expect(next.settings).toEqual({ ...prev.settings, start: '2028-01-03' });
    expect(next.events).toEqual([]); expect(next.absences).toEqual([]); expect(next.capacity).toEqual([]); expect(next.school).toEqual([]);
    expect(next.report).toEqual([]); expect(next.planInfo).toBeNull();
    expect(next.holidays).toEqual(Core.holidaysBavaria(2028).map(h => h.date));
    expect(next.holidays.every(d => d.startsWith('2028-'))).toBe(true);
  });
  it('setzt Personen mit vollständig geplantem Weg auf „Zuordnung offen“', () => {
    const done = prev.people.filter(p => state(p) === 'complete');
    expect(done.length).toBeGreaterThan(50);
    expect(info.completed).toBe(done.length); expect(info.reopened).toBe(done.length);
    for (const p of done) expect(next.people.find(q => q.pk === p.pk)).toMatchObject({ cluster: 'offen', target: '', level: '', confirmed: false });
    const keep = Core.rolloverYear(prev, { reopen: false }).state;
    for (const p of done) { const q = keep.people.find(x => x.pk === p.pk); expect(q.cluster).toBe(p.cluster); expect(q.credit).toBeUndefined(); }
  });
  it('rechnet begonnenen Wegen die geplanten Tage als Vorleistung an', () => {
    const part = prev.people.filter(p => state(p) === 'partial');
    expect(part.length).toBeGreaterThan(0);
    expect(info.continued).toBe(part.length);
    let total = 0;
    for (const p of part) {
      const q = next.people.find(x => x.pk === p.pk), pr = Core.routeProgress(prev, ix, p);
      expect(q.cluster).toBe(p.cluster);
      expect(q.credit).toEqual(Object.fromEntries(pr.steps.filter(s => s.have > 0).map(s => [s.type, s.have])));
      total += Object.values(q.credit).reduce((s, v) => s + v, 0);
    }
    expect(info.creditDays).toBe(total);
    expect(Core.rolloverYear(prev, { credit: false }).state.people.every(p => !p.credit)).toBe(true);
  });
  it('lässt unveränderte Personen unverändert (offen, gesperrt, noch nicht begonnen)', () => {
    for (const p of prev.people) {
      if (['complete', 'partial'].includes(state(p))) continue;
      expect(next.people.find(q => q.pk === p.pk)).toEqual({ ...p, start: '' });
    }
  });
  it('schreibt den Dienstplan um 52 Wochen fort und kennzeichnet ihn als simuliert', () => {
    expect(info.roster).toBe(141);
    expect(next.meta.simulated.roster).toBe(true);
    expect(next.meta.assumptions.some(a => a.startsWith('Dienstplan aus 2027'))).toBe(true);
    const calP = Core.makeCalendar(2027), calN = Core.makeCalendar(2028);
    for (const p of prev.people.slice(0, 20)) {
      const a = Core.decodeRoster(prev.roster[p.pk], calP.n), b = Core.decodeRoster(next.roster[p.pk], calN.n);
      for (let d = 0; d < calN.n; d++) {
        let j = calP.idx(Core.addDays(calN.iso[d], -364)); while (j >= calP.n) j -= 364;
        expect(b[d]).toBe(a[j]);
        expect(calN.dow[d]).toBe(calP.dow[j]);                       // gleicher Wochentag
      }
      expect([...b].every(c => c > 0)).toBe(true);                    // keine Lücke am Jahresende
    }
    const none = Core.rolloverYear(prev, { roster: false }).state;
    expect(none.roster).toEqual({}); expect(none.meta.simulated.roster).toBe(false);
  });
  it('das Folgejahr ist ein gültiger Stand und plant fortgesetzte Wege nur noch im Rest', () => {
    const st = Core.sanitize(JSON.parse(JSON.stringify(next))).state;
    expect(st.people).toEqual(next.people);
    plan(st); const nix = Core.buildIndex(st);
    expect(Core.findConflicts(st, nix).filter(c => c.hard.length)).toEqual([]);
    let continued = 0;
    for (const p of st.people.filter(q => q.credit)) {
      const cfg = Core.cfgOf(st, p), route = Core.routeOf(st, p);
      for (const t of route) expect(Core.creditOf(p, t) + days(st, nix, p.pk, t), p.pk + ' ' + t).toBeLessThanOrEqual(cfg[t].days);
      if (st.report.find(r => r.pk === p.pk).status === 'planned') { continued++; for (const t of route) expect(Core.creditOf(p, t) + days(st, nix, p.pk, t)).toBe(cfg[t].days); }
    }
    expect(continued).toBeGreaterThan(0);
  });
  it('gleicht Vorleistungen nach Änderungen am Vorjahr neu ab', () => {
    const st = Core.clone(next), changedPrev = Core.clone(prev);
    expect(Core.refreshCredits(prev, st)).toBe(0);                                   // nichts geändert
    const p = prev.people.find(q => state(q) === 'partial');
    changedPrev.events = changedPrev.events.filter(e => !(e.pk === p.pk && e.auto));   // Plan des Vorjahres zurückgenommen
    const n = Core.refreshCredits(changedPrev, st), q = st.people.find(x => x.pk === p.pk);
    expect(n).toBe(1);
    const expected = Core.carriedCredit(changedPrev, Core.buildIndex(changedPrev), changedPrev.people.find(x => x.pk === p.pk));
    if (expected) expect(q.credit).toEqual(expected); else expect(q.credit).toBeUndefined();
  });
  it('mehrere Jahre bleiben im Projekt getrennt und überstehen Speichern und Laden', () => {
    const prj = Core.wrapProject(prev); prj.years[2028] = next; prj.active = 2028;
    const back = Core.loadProject(Core.serializeProject(prj)).project;
    expect(Core.projectYears(back)).toEqual([2027, 2028]);
    expect(back.years[2028].people).toEqual(next.people);
    expect(back.years[2028].roster).toEqual(next.roster);
    expect(back.years[2027].events).toHaveLength(prev.events.length);
    const three = Core.rolloverYear(back.years[2028]).state;
    expect(three.meta.year).toBe(2029); expect(three.settings.start).toBe('2029-01-01');
  });
});
