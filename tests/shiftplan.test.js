// Schichtplan aus der Excel-Tabelle des Auswertungssystems: Tage „01⏎Fr“ in Zeile 1, Beschriftung darunter,
// Monat und Jahr nur im Filtertext oder Dateinamen. Alle Namen und Nummern hier sind erfunden.
import { describe, it, expect } from 'vitest';
import * as Core from '../src/core/index.js';

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const PEOPLE = [['L/TM-M 12 MUC - CAB', 'Adler', 'Anna', '700101A', 'CAB'], ['L/TM-M 12 MUC - CAB', 'Bach', 'Ben', '700102B', 'CAB'], ['L/TM-M 12 MUC - CAB-TEC', 'Christ', 'Clara', '700103C', 'TEC'], ['L/TM-M 12 MUC - IFE', 'Dorn', 'David', '700104D', 'IFE']];
/** Tabelle im Aufbau des Auswertungssystems. cells(i, tag) liefert das Symbol für Person i am Tag 1 … n. */
function sheet(month, cells, { footer = true, year = 2027, people = PEOPLE } = {}) {
  const cal = Core.makeCalendar(year), a = cal.monthStart[month - 1], b = cal.monthStart[month];
  const day = ['DayDateRowWidth', '', '', '', ''], label = ['Team', 'Nachname', 'Vorname', 'U-Nummer', 'MF'];
  for (let d = a; d < b; d++) { day.push(String(cal.dom[d]).padStart(2, '0') + '\r\n' + WD[cal.dow[d]]); label.push('Erstes Datum: ShiftShort_Masking'); }
  const rows = [day, label];
  people.forEach((p, i) => { const r = p.slice(); for (let d = a; d < b; d++) r.push(cells(i, cal.dom[d], cal.dow[d])); rows.push(r); });
  rows.push([]);
  if (footer) rows.push(['Angewendete Filter: \r\nErstes Datum: SHIFTSHORT ist nicht blank\r\nSlicerCheckMonth ist ' + month + '\r\nYear-Default ist ' + year + '\r\nMonat-Default ist ' + Core.MONTH_NAMES[month - 1]]);
  return rows;
}
/** Früh in der Woche, Wochenende frei; Person 1 hat vom 11. bis 15. Urlaub, Person 2 am 20. ein unbekanntes Symbol. */
const basic = (i, dom, dow) => dow === 0 || dow === 6 ? '-' : i === 1 && dom >= 11 && dom <= 15 ? 'Up' : i === 2 && dom === 20 ? 'LC*' : i === 3 ? 'N2' : i === 2 ? 'S1' : 'F1';
const empty = () => Core.newProjectState(2027);
const read = (st, rows, opt = {}) => Core.parseDayMatrix(st, rows, { newPeople: true, ...opt });
const letters = (st, pk, from, n) => { const cal = Core.makeCalendar(2027), ix = Core.buildIndex(st), i = ix.pi.get(pk); return Array.from({ length: n }, (_, j) => { const c = ix.ros[i][cal.idx(from) + j]; return c > 1 ? 'FSN'[(c - 2) % 3] : c === 1 ? '-' : '.'; }).join(''); };

describe('Schichtplan lesen', () => {
  it('erkennt Tage mit Wochentag, die Beschriftungszeile darunter sowie Monat und Jahr aus dem Filtertext', () => {
    const m = read(empty(), sheet(1, basic));
    expect(m.errors).toEqual([]);
    expect(m.layout).toBe('Tageszahlen eines Monats');
    expect(m.dates).toHaveLength(31);
    expect(m.range).toEqual({ start: '2027-01-01', end: '2027-01-31' });
    expect(m.period).toMatchObject({ month: 1, year: 2027 });
    expect(m.needsMonth).toBe(false);
    // die Beschriftungszeile und der Filtertext sind keine Personen
    expect(m.newPeople.map(p => [p.pk, p.name, p.org, p.role])).toEqual(PEOPLE.map(p => [p[3], p[1] + ', ' + p[2], p[0], p[4]]));
    expect(m.unknown).toEqual([]);
    expect(Object.fromEntries(m.symbols)).toEqual({ F1: 37, '-': 40, Up: 5, S1: 20, 'LC*': 1, N2: 21 });      // 21 Werktage, 10 Wochenendtage
  });
  it('nimmt Monat und Jahr sonst aus dem Dateinamen – oder fragt nach dem Monat', () => {
    const rows = sheet(3, basic, { footer: false });
    expect(Core.periodHint(rows, 'Schichtplan_M1_März_27.xlsx')).toEqual({ month: 3, year: 2027 });
    expect(Core.periodHint(rows, 'Plan Februar 2027.xlsx')).toEqual({ month: 2, year: 2027 });
    expect(Core.periodHint(rows, 'Marktbericht_M1.xlsx')).toEqual({ month: 0, year: 0 });        // „Mar…“ allein ist kein Monat
    expect(Core.periodHint(sheet(7, basic), 'export.xlsx')).toEqual({ month: 7, year: 2027 });
    expect(read(empty(), rows, { fileName: 'Schichtplan_M1_März_27.xlsx' }).range).toEqual({ start: '2027-03-01', end: '2027-03-31' });
    const guess = read(empty(), rows, { fileName: 'export.xlsx' });
    expect(guess.needsMonth).toBe(true);
    expect(guess.range.start).toBe('2027-01-01');
    const chosen = read(empty(), rows, { fileName: 'export.xlsx', month: 3 });
    expect(chosen.needsMonth).toBe(false);
    expect(chosen.range).toEqual({ start: '2027-03-01', end: '2027-03-31' });
  });
  it('weist eine Tabelle für ein anderes Jahr zurück', () => {
    const m = read(empty(), sheet(1, basic, { year: 2026 }));
    expect(m.errors[0]).toMatch(/Die Tabelle gilt für Januar 2026 – angezeigt wird das Planungsjahr 2027/);
  });
  it('findet vorhandene Personen über die Nummer oder den Namen; unbekannte werden nur auf Wunsch gesammelt', () => {
    const st = empty();
    st.people.push(Core.normPerson({ pk: '700101A', name: 'Adler, Anna', cluster: '1' }), Core.normPerson({ pk: 'X-17', name: 'Ben Bach', cluster: '2' }));
    const m = read(st, sheet(1, basic));
    expect([...m.cells.keys()]).toEqual(['700101A', 'X-17']);                                    // Bach über den Namen in anderer Schreibweise
    expect(m.newPeople.map(p => p.pk)).toEqual(['700103C', '700104D']);
    const plain = Core.parseDayMatrix(st, sheet(1, basic));                                       // Urlaubsplan-Weg: ohne neue Personen
    expect(plain.newPeople).toEqual([]);
    expect(plain.unknown).toHaveLength(2);
  });
  it('unterscheidet Symbole nach ihrer Schreibweise und schlägt nur vor, was sich ablesen lässt', () => {
    const map = Core.defaultSymbolMap(['-', 'F1', 'F0', 'Fm', 'S1', 'S41', 'Sv0', 'Sm', 'N2', 'Nv0', 'FU', 'FR', 'FaT', 'NU', 'Up', 'H', 'M1', 'LC*', 'A*', 'U', 'K']);
    expect(map).toMatchObject({ '-': 'Frei', F1: 'Früh', F0: 'Früh', Fm: 'Früh', S1: 'Spät', S41: 'Spät', Sv0: 'Spät', Sm: 'Spät', N2: 'Nacht', Nv0: 'Nacht', U: 'Urlaub', K: 'Krank' });
    for (const s of ['FU', 'FR', 'FaT', 'NU', 'Up', 'H', 'M1', 'LC*', 'A*']) expect(map[s]).toBe('');
    // eine gemerkte Zuordnung gewinnt
    expect(Core.defaultSymbolMap(['Up', 'F1'], { Up: 'Urlaub', F1: 'Spät' })).toEqual({ Up: 'Urlaub', F1: 'Spät' });
    const m = read(empty(), sheet(1, (i, dom) => dom % 2 ? 'Up' : 'UP'));
    expect([...m.symbols.keys()].sort()).toEqual(['UP', 'Up']);
  });
});

describe('Schichtplan übernehmen', () => {
  const MAP = { '-': 'Frei', F1: 'Früh', S1: 'Spät', N2: 'Nacht', Up: 'Urlaub', 'LC*': '' };
  it('legt fehlende Personen an, füllt den Dienstplan, führt Abwesenheiten und merkt sich Symbole und Zuordnung', () => {
    const st = empty(), m = read(st, sheet(1, basic));
    expect(Core.openSymbols(m, MAP)).toEqual(['LC*']);
    expect(Core.shiftPlanSummary(m, MAP)).toEqual({ persons: 4, duty: 78, free: 40, open: 1, absences: 1, absenceDays: 5 });
    const info = Core.applyShiftPlan(st, m, MAP);
    expect(info).toMatchObject({ people: 4, persons: 4, rosterDays: 78, freeDays: 40, absences: 1, absenceDays: 5, symbolDays: 124, dropped: 0 });
    expect(st.people.map(p => [p.pk, p.name, p.org, p.rights, p.cluster])).toEqual(PEOPLE.map(p => [p[3], p[1] + ', ' + p[2], p[0], p[4], 'offen']));
    expect(st.people.every(p => /^P-\d+$/.test(p.alias))).toBe(true);
    // Mo 04.01. – So 10.01.
    expect(letters(st, '700101A', '2027-01-04', 7)).toBe('FFFFF--');
    expect(letters(st, '700103C', '2027-01-04', 7)).toBe('SSSSS--');
    expect(letters(st, '700104D', '2027-01-04', 7)).toBe('NNNNN--');
    expect(letters(st, '700102B', '2027-01-11', 7)).toBe('.....--');                              // Urlaub: kein Dienst-Eintrag, aber eine Abwesenheit
    expect(st.absences).toEqual([{ pk: '700102B', type: 'Urlaub', start: '2027-01-11', end: '2027-01-15' }]);
    expect(letters(st, '700103C', '2027-01-20', 1)).toBe('.');                                    // Symbol ohne Bedeutung: kein Dienst-Eintrag
    // die Symbole stehen so da wie in der Tabelle
    const cal = Core.makeCalendar(2027), sym = Core.symbolsOf(st, '700103C', cal.n);
    expect(sym.slice(cal.idx('2027-01-18'), cal.idx('2027-01-18') + 7)).toEqual(['S1', 'S1', 'LC*', 'S1', 'S1', '-', '-']);
    expect(sym[cal.idx('2027-02-01')]).toBe('');
    expect(Object.fromEntries(Core.symbolCounts(st, cal.n))).toEqual({ F1: 37, '-': 40, Up: 5, S1: 20, 'LC*': 1, N2: 21 });
    expect(st.settings.symbols).toEqual({ '-': 'Frei', F1: 'Früh', S1: 'Spät', N2: 'Nacht', Up: 'Urlaub' });
    // Speichern und Laden
    const back = Core.sanitize(JSON.parse(JSON.stringify(st))).state;
    expect(back.symbols).toEqual(st.symbols);
    expect(back.settings.symbols).toEqual(st.settings.symbols);
    expect(back.roster).toEqual(st.roster);
  });
  it('der nächste Monat kommt dazu; ein erneut eingespielter Monat ersetzt den alten Stand', () => {
    const st = empty();
    Core.applyShiftPlan(st, read(st, sheet(1, basic)), MAP);
    const feb = read(st, sheet(2, (i, dom, dow) => dow === 0 || dow === 6 ? '-' : 'S1'));
    expect(feb.newPeople).toEqual([]);
    expect(feb.persons).toBe(4);
    expect(Core.defaultSymbolMap([...feb.symbols.keys()], st.settings.symbols)).toEqual({ '-': 'Frei', S1: 'Spät' });      // gemerkt
    Core.applyShiftPlan(st, feb, st.settings.symbols);
    expect(letters(st, '700101A', '2027-01-04', 5)).toBe('FFFFF');
    expect(letters(st, '700101A', '2027-02-01', 5)).toBe('SSSSS');
    // Januar korrigiert: Person 1 hat keinen Urlaub mehr, Person 0 ist am 12. krank
    const jan2 = read(st, sheet(1, (i, dom, dow) => dow === 0 || dow === 6 ? '-' : i === 0 && dom === 12 ? 'K' : 'F1'));
    const info = Core.applyShiftPlan(st, jan2, { ...st.settings.symbols, K: 'Krank' });
    expect(info.removed).toBe(1);
    expect(st.absences).toEqual([{ pk: '700101A', type: 'Krank', start: '2027-01-12', end: '2027-01-12' }]);
    expect(letters(st, '700102B', '2027-01-11', 5)).toBe('FFFFF');
    expect(letters(st, '700101A', '2027-02-01', 5)).toBe('SSSSS');                                // Februar unberührt
    expect(st.people).toHaveLength(4);
  });
  it('eine geänderte Bedeutung gilt sofort für alle Tage mit diesem Symbol – Einträge außerhalb bleiben', () => {
    const st = empty();
    Core.applyShiftPlan(st, read(st, sheet(1, basic)), MAP);
    st.absences.push({ pk: '700103C', type: 'Urlaub', start: '2027-03-01', end: '2027-03-05' });   // von Hand, außerhalb des Schichtplans
    const info = Core.setSymbolMap(st, { 'LC*': 'Sonstiges', Up: 'Krank', F1: 'Spät' });
    expect(st.settings.symbols).toMatchObject({ 'LC*': 'Sonstiges', Up: 'Krank', F1: 'Spät' });
    expect(info.absences).toBe(2);
    expect(st.absences.slice().sort((a, b) => a.start < b.start ? -1 : 1)).toEqual([{ pk: '700102B', type: 'Krank', start: '2027-01-11', end: '2027-01-15' },
      { pk: '700103C', type: 'Sonstiges', start: '2027-01-20', end: '2027-01-20' }, { pk: '700103C', type: 'Urlaub', start: '2027-03-01', end: '2027-03-05' }]);
    expect(letters(st, '700101A', '2027-01-04', 5)).toBe('SSSSS');
    // Bedeutung wieder entfernen
    Core.setSymbolMap(st, { 'LC*': '' });
    expect(st.settings.symbols['LC*']).toBeUndefined();
    expect(st.absences.some(a => a.type === 'Sonstiges')).toBe(false);
  });
  it('ohne Haken bleiben unbekannte Personen draußen; vorhandene Dienstpläne anderer Personen bleiben unberührt', () => {
    const st = empty();
    st.people.push(Core.normPerson({ pk: '700101A', name: 'Adler, Anna', cluster: '1' }), Core.normPerson({ pk: 'Z9', name: 'Zeller, Zoe', cluster: '1' }));
    const cal = Core.makeCalendar(2027);
    Core.fillRoster(st, cal, 'Z9', { start: '2027-01-04', end: '2027-01-08', dows: [1, 2, 3, 4, 5], code: Core.rosterCode('M1', 'Nacht') });
    const info = Core.applyShiftPlan(st, read(st, sheet(1, basic)), MAP, { addPeople: false });
    expect(info).toMatchObject({ people: 0, persons: 1 });
    expect(st.people).toHaveLength(2);
    expect(letters(st, 'Z9', '2027-01-04', 5)).toBe('NNNNN');
    expect(letters(st, '700101A', '2027-01-04', 5)).toBe('FFFFF');
  });
  it('wer den Dienst von Hand ändert, verliert an diesem Tag das Symbol; Übertragen und Leeren nehmen die Symbole mit', () => {
    const st = empty(), cal = Core.makeCalendar(2027), d = cal.idx('2027-01-05');
    Core.applyShiftPlan(st, read(st, sheet(1, basic)), MAP);
    expect(Core.symbolsOf(st, '700101A', cal.n)[d]).toBe('F1');
    Core.setRosterDays(st, cal, '700101A', [d], Core.rosterCode('M1', 'Nacht'));
    expect(Core.symbolsOf(st, '700101A', cal.n)[d]).toBe('');
    expect(Core.symbolsOf(st, '700101A', cal.n)[d + 1]).toBe('F1');
    Core.copyRoster(st, '700104D', ['700102B']);
    expect(Core.symbolsOf(st, '700102B', cal.n)[d]).toBe('N2');
    Core.clearRoster(st, '700104D');
    expect(Core.symbolsOf(st, '700104D', cal.n).some(Boolean)).toBe(false);
    expect(Core.sanitize(JSON.parse(JSON.stringify(st))).state.symbols).toEqual(st.symbols);
  });
  it('beim Jahreswechsel ziehen die Symbole mit dem fortgeschriebenen Dienstplan um', () => {
    const st = empty();
    Core.applyShiftPlan(st, read(st, sheet(1, basic)), MAP);
    st.people[0].cluster = '1';
    const next = Core.rolloverYear(st).state, cal = Core.makeCalendar(2027), cal2 = Core.makeCalendar(2028);
    const a = Core.symbolsOf(st, '700101A', cal.n), b = Core.symbolsOf(next, '700101A', cal2.n);
    expect(b[cal2.idx('2028-01-03')]).toBe(a[cal.idx('2027-01-04')]);                               // gleicher Wochentag 52 Wochen später
    expect(b[cal2.idx('2028-01-03')]).toBe('F1');
    expect(next.settings.symbols).toEqual(st.settings.symbols);
  });
  it('mehr Symbole, als die Liste fasst, werden gemeldet statt still verworfen', () => {
    const st = empty(), many = Array.from({ length: Core.MAX_SYMBOLS + 3 }, (_, i) => 'Q' + i);
    const big = read(st, sheet(1, (i, dom) => many[(i * 31 + dom - 1) % many.length]));
    const info = Core.applyShiftPlan(st, big, {});
    expect(st.symbols.list.length).toBe(Core.MAX_SYMBOLS);
    expect(info.dropped).toBeGreaterThan(0);
  });
});

describe('Urlaubsplan mit Wochentag im Tageskopf', () => {
  it('liest „01 Fr“ unter Monatsnamen wie bisher die reinen Tageszahlen', () => {
    const st = empty(); st.people.push(Core.normPerson({ pk: '1001', name: 'Muster, Max', cluster: '1' }));
    const cal = Core.makeCalendar(2027), months = ['', ''], days = ['PersNr', 'Name'], row = ['1001', 'Muster, Max'];
    for (let d = 0; d < 59; d++) { months.push(cal.dom[d] === 1 ? Core.MONTH_NAMES[cal.month[d]] : ''); days.push(String(cal.dom[d]).padStart(2, '0') + ' ' + WD[cal.dow[d]]); row.push(d >= 40 && d <= 44 ? 'U' : ''); }
    const m = Core.parseDayMatrix(st, [months, days, row]);
    expect(m.errors).toEqual([]);
    expect(m.layout).toBe('Tageszahlen unter Monatsnamen');
    expect(m.range).toEqual({ start: '2027-01-01', end: '2027-02-28' });
    expect(Core.matrixAbsences(m, { U: 'Urlaub' })).toEqual([{ pk: '1001', type: 'Urlaub', start: '2027-02-10', end: '2027-02-14' }]);
  });
});
