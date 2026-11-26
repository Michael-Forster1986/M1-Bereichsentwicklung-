// Dienstplan von Hand: einzelne Tage, Zeitraum, Wochenfolge, Übertragen – und die Vorgabe „ohne Eintrag = frei“.
import { describe, it, expect } from 'vitest';
import * as Core from '../src/core/index.js';

const F = Core.rosterCode('M1', 'Früh'), S = Core.rosterCode('M1', 'Spät'), N = Core.rosterCode('M1', 'Nacht'), FREI = Core.rosterCode('M1', 'Frei');
function fresh() {
  const st = Core.newProjectState(2027);
  for (const pk of ['A', 'B', 'C']) st.people.push(Core.normPerson({ pk, name: 'Person ' + pk, cluster: '1', area: 'M1', shift: 'Früh' }));
  Core.assignAliases(st.people);
  return { st, cal: Core.makeCalendar(2027) };
}
const codes = (st, cal, pk, from, to) => Array.from(Core.decodeRoster(st.roster[pk], cal.n).slice(cal.idx(from), cal.idx(to) + 1));

describe('Vorgabe für neue Projekte', () => {
  it('ein Tag ohne Eintrag ist frei – nichts wird aus den Stammdaten angenommen', () => {
    const { st } = fresh(), ix = Core.buildIndex(st);
    expect(st.settings.strict).toBe(true);
    expect(Core.emptyState(2027).settings.strict).toBe(false);             // die Vorgabe der Einzeldatei bleibt für den Vergleich erhalten
    for (let d = 0; d < ix.n; d++) expect(Core.assign(ix, 0, d)).toBe(-1);
    // ohne Dienste plant der Planer nichts
    const res = Core.runPlan(st, ix);
    expect(res.events).toEqual([]);
    expect(Core.sanitize(JSON.parse(JSON.stringify(st))).state.settings.strict).toBe(true);
  });
});

describe('Dienstplan bearbeiten', () => {
  it('einzelne Tage eintragen, ändern und wieder entfernen', () => {
    const { st, cal } = fresh(), d = cal.idx('2027-03-10');
    expect(Core.setRosterDays(st, cal, 'A', [d, d + 1], F)).toBe(2);
    expect(Core.setRosterDays(st, cal, 'A', [d, d + 1], F)).toBe(0);         // nichts geändert
    expect(Core.assign(Core.buildIndex(st), 0, d)).toBe(F - 2);
    expect(Core.setRosterDays(st, cal, 'A', [d], S)).toBe(1);
    expect(codes(st, cal, 'A', '2027-03-10', '2027-03-11')).toEqual([S, F]);
    Core.setRosterDays(st, cal, 'A', [d, d + 1], 0);
    expect(st.roster.A).toBeUndefined();                                     // ohne Einträge bleibt kein leerer Plan zurück
    expect(Core.setRosterDays(st, cal, 'A', [-5, 9999], F)).toBe(0);         // Tage außerhalb des Jahres werden übergangen
  });
  it('Zeitraum füllen: nur die gewählten Wochentage, andere Tage bleiben', () => {
    const { st, cal } = fresh();
    Core.setRosterDays(st, cal, 'A', [cal.idx('2027-03-06')], N);            // ein Samstag mit Nachtdienst
    const n = Core.fillRoster(st, cal, 'A', { start: '2027-03-01', end: '2027-03-14', dows: [1, 2, 3, 4, 5], code: F });
    expect(n).toBe(10);
    expect(codes(st, cal, 'A', '2027-03-01', '2027-03-07')).toEqual([F, F, F, F, F, N, 0]);
    // der Zeitraum wird auf das Jahr begrenzt
    expect(Core.fillRoster(st, cal, 'B', { start: '2026-12-01', end: '2027-01-08', dows: [1, 2, 3, 4, 5], code: S })).toBe(6);
  });
  it('Wochenfolge: der Dienst wechselt wochenweise ab der Startwoche, übrige Tage werden frei', () => {
    const { st, cal } = fresh();
    // Start an einem Mittwoch: seine Woche ist Woche 1 der Folge
    const n = Core.fillRosterWeekly(st, cal, 'A', { start: '2027-03-03', end: '2027-03-28', dows: [1, 2, 3, 4, 5], seq: [F, S, N] });
    expect(n).toBe(26);
    expect(codes(st, cal, 'A', '2027-03-03', '2027-03-07')).toEqual([F, F, F, FREI, FREI]);
    expect(codes(st, cal, 'A', '2027-03-08', '2027-03-14')).toEqual([S, S, S, S, S, FREI, FREI]);
    expect(codes(st, cal, 'A', '2027-03-15', '2027-03-21')).toEqual([N, N, N, N, N, FREI, FREI]);
    expect(codes(st, cal, 'A', '2027-03-22', '2027-03-26')).toEqual([F, F, F, F, F]);       // die Folge beginnt von vorn
    expect(codes(st, cal, 'A', '2027-03-01', '2027-03-02')).toEqual([0, 0]);                // vor dem Start unverändert
    expect(() => Core.fillRosterWeekly(st, cal, 'A', { start: '2027-03-01', end: '2027-03-07', dows: [1], seq: [0, 0] })).toThrow(/Wochenfolge ist leer/);
    // die Kapazität folgt dem eingetragenen Dienst
    const ix = Core.buildIndex(st);
    expect(Core.assign(ix, 0, cal.idx('2027-03-09'))).toBe(S - 2);
    expect(Core.assign(ix, 0, cal.idx('2027-03-13'))).toBe(-1);
  });
  it('übertragen und leeren', () => {
    const { st, cal } = fresh();
    expect(() => Core.copyRoster(st, 'A', ['B'])).toThrow(/keinen Dienstplan/);
    Core.fillRoster(st, cal, 'A', { start: '2027-01-01', end: '2027-12-31', dows: [1, 2, 3, 4, 5], code: F });
    expect(Core.copyRoster(st, 'A', ['A', 'B', 'C'])).toBe(2);
    expect(st.roster.B).toBe(st.roster.A);
    expect(Core.copyRoster(st, 'A', ['B'])).toBe(0);
    expect(Core.clearRoster(st, 'B')).toBe(true);
    expect(st.roster.B).toBeUndefined();
    expect(Core.clearRoster(st, 'B')).toBe(false);
  });
  it('mit eingetragenen Diensten plant der Planer', () => {
    const { st, cal } = fresh();
    for (const pk of ['A', 'B', 'C']) Core.fillRoster(st, cal, pk, { start: '2027-01-01', end: '2027-12-31', dows: [1, 2, 3, 4, 5], code: F });
    const res = Core.runPlan(st, Core.buildIndex(st));
    expect(res.report.filter(r => r.status === 'planned')).toHaveLength(3);
    expect(res.events.some(e => e.type === 'FitCheck')).toBe(true);
  });
});
