import { describe, expect, it } from 'vitest';
import * as Core from '../src/core/index.js';

/* Teilnehmerübersicht der Lehrgänge: eine Mappe mit einem Blatt je Lehrgangsfamilie. Alle Namen und Nummern sind erfunden. */
const HEAD = ['', '', 'No.', 'Project', '', 'Product Duration', 'Quoten MUC', 'Scheduled Begin', 'Scheduled End', 'Provider', 'Location', 'Raum'];
const course = (order, no, title, days, quota, start, end) => ['XY', order, no, title, '', String(days), quota == null ? '' : String(quota), start, end, 'Schule Nord', 'MUC', 'R1'];
const member = (n, name, id) => ['', '', n + '.', name, id];
/** Excel liefert Datumszellen als fortlaufende Zahl. */
const serial = iso => String(Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 864e5));

function project() {
  const st = Core.newProjectState(2027);
  const add = (pk, name, cluster, target = '') => st.people.push({ ...Core.normPerson({ pk, name, alias: 'P' + pk, cluster, target, area: 'A', shift: 'F' }) });
  add('700101A', 'Adler, Anna', '5', 'A330'); add('700102B', 'Bach, Bernd', '5', 'A330'); add('700103C', 'Christ, Carla', '3'); add('700104D', 'Dorn, David', '3'); add('700105E', 'Engel, Eva', '4');
  return Core.sanitize(JSON.parse(JSON.stringify(st))).state;
}
const sheets = () => [
  { name: 'TEC A330', rows: [HEAD, [], ['', '', '', 'TEC A330 – Lehrgänge 2027'],
    course('2027-1001 2027-1002', '26-1574', 'Airbus A330 (RR Trent 700) B1 Theoretical', 20, 6, serial('2027-02-01'), serial('2027-02-26')),
    member(1, 'Anna Adler', '700101A'), member(2, 'Bach, Bernd', 'U700102'), member(3, 'Fremd, Fritz', '811111X'), member(4, 'Gast, Gerda', ''), member(5, '', ''),
    course('2027-1003', '26-1575', 'Airbus A330 (RR Trent 700) B1 Practical', 5, 4, '08.03.2027', '12.03.2027'),
    member(1, 'Adler, Anna', '700101'), member(2, 'Hold, Hans', 'u822222'),
    course('2026-0990', '25-1001', 'Airbus A330 (RR Trent 700) B1 Theoretical', 20, 6, serial('2026-11-02'), serial('2026-11-27')), member(1, 'Bach, Bernd', '700102B')] },
  { name: 'CAT A Grundlagen', rows: [[], HEAD,
    course('2027-1950', 'LHA27001', 'CAT A Grundlagen Theorie', 30, 12, serial('2027-01-11'), serial('2027-02-19')), member(1, 'Carla Christ', ''), member(2, 'Dorn, David', '700104D'),
    ['XY', '', '', '', '', '', '', serial('2027-01-11'), serial('2027-02-19')],                    // zweite Zeile desselben Lehrgangs
    member(3, 'Ingo Irgendwer', 'U833333')] },
  { name: 'Run Up', rows: [HEAD, course('2027-1700', '27-0042', 'Engine Run-Up Refresher', 1, null, serial('2027-05-04'), serial('2027-05-04')), member(1, 'Engel, Eva', '700105'), member(2, 'Jung, Jana', '844444Y'),
    course('2027-1701', '27-0043', 'Engine Run-Up Initial', 2, 3, serial('2027-06-01'), serial('2027-06-02')), member(1, 'Kurz, Karl', '855555Z')] },
  { name: 'Vorlage', rows: [HEAD] },
  { name: 'Notizen', rows: [['irgendwas'], ['ohne', 'Kopfzeile']] }
];
/** Blatt mit Kopfzeile, aber die Termine stehen als freier Text daneben – so ein Blatt lässt sich nicht lesen. */
const loose = { name: 'Freitext', rows: [HEAD, ['ab 01.03.2027', '', '', 'Lehrgang in Planung'], ['', '', '', 'Anna Adler', '700101']] };

describe('Teilnehmerübersicht der Lehrgänge lesen', () => {
  it('erkennt die Mappe an ihren Spalten – eine gewöhnliche Lehrgangsliste nicht', () => {
    expect(Core.isCourseOverview(sheets())).toBe(true);
    expect(Core.isCourseOverview([{ name: 'Liste', rows: [['Lehrgang', 'Art', 'Zielmuster', 'Beginn', 'Ende', 'Plätze'], ['TEC A330 Theorie', 'Theorie', 'A330', '01.02.2027', '26.02.2027', '6']] }])).toBe(false);
    expect(Core.isCourseOverview([])).toBe(false);
  });
  it('führt die Schreibweisen der Personalnummer auf denselben Ziffernkern', () => {
    expect(['700101A', 'U700101', 'u700101', '700101', ' 700 101 a '].map(Core.idCore)).toEqual(Array(5).fill('700101'));
    expect(['', 'Adler', '12', 'AB700101'].map(Core.idCore)).toEqual(['', '', '', '']);
  });
  it('liest Lehrgänge, Zeiträume, Quote und Teilnehmer', () => {
    const st = project(), r = Core.parseCourseOverview(st, sheets());
    expect(r.errors).toEqual([]);
    expect(r.stats).toMatchObject({ sheets: 3, inFile: 6, otherYear: 1, rows: 12, known: 6, unknown: 6, people: 5 });
    expect(r.courses.map(c => [c.ref, c.start, c.end, c.quota, c.known.length, c.external])).toEqual([
      ['2027-1950', '2027-01-11', '2027-02-19', 12, 2, 1], ['2027-1002', '2027-02-01', '2027-02-26', 6, 2, 2], ['2027-1003', '2027-03-08', '2027-03-12', 4, 1, 1],
      ['2027-1700', '2027-05-04', '2027-05-04', null, 1, 1], ['2027-1701', '2027-06-01', '2027-06-02', 3, 0, 1]]);
    expect(r.warnings.join(' ')).toMatch(/1 Lehrgang liegt nicht im Planungsjahr 2027/);
    expect(r.warnings.join(' ')).toMatch(/6 Teilnehmerzeilen gehören nicht zu den Personen des Projekts/);
  });
  it('ordnet Personen über Nummer, Ziffernkern oder Namen zu – unabhängig von der Reihenfolge des Namens', () => {
    const r = Core.parseCourseOverview(project(), sheets()), by = Object.fromEntries(r.courses.map(c => [c.ref, c.known]));
    expect(by['2027-1002']).toEqual(['700101A', '700102B']);            // „Anna Adler“ mit Nummer · „U700102“
    expect(by['2027-1003']).toEqual(['700101A']);                       // „700101“ ohne Buchstaben
    expect(by['2027-1950']).toEqual(['700103C', '700104D']);            // ohne Nummer: über den Namen
    expect(by['2027-1700']).toEqual(['700105E']);
  });
  it('schlägt Art und Zielmuster vor: TEC und CAT A gehören zu den Ausbildungswegen, alles andere bindet nur', () => {
    const r = Core.parseCourseOverview(project(), sheets()), by = Object.fromEntries(r.courses.map(c => [c.ref, c]));
    expect([by['2027-1002'].type, by['2027-1002'].target, by['2027-1002'].title]).toEqual(['Theorie', 'A330', 'TEC A330 Theorie · 2027-1002']);
    expect([by['2027-1003'].type, by['2027-1003'].target]).toEqual(['Praxis', 'A330']);
    expect([by['2027-1950'].type, by['2027-1950'].target]).toEqual(['Theorie', '']);
    expect([by['2027-1700'].type, by['2027-1700'].title]).toEqual([Core.OTHER_COURSE, 'Engine Run-Up Refresher · 2027-1700']);
    expect(r.courses.map(c => c.take)).toEqual([true, true, true, true, false]);          // ohne eigene Teilnehmer und ohne Bezug zum Weg: nicht vorgeschlagen
    const types = Core.courseTypesOf(project());
    expect(Core.guessCourseKind('TEC A350 A380', 'Airbus A350/A380 Practical', types)).toMatchObject({ type: 'Praxis', target: 'A350/A380 Kombikurs' });
    expect(Core.guessCourseKind('TEC A320', 'Differences A320 to A321 Theoretical', types)).toMatchObject({ type: Core.OTHER_COURSE, target: '' });
    expect(Core.guessCourseKind('AMOS', 'AMOS Grundlagen Theorie', types)).toMatchObject({ type: Core.OTHER_COURSE, route: false });
  });
  it('findet den Namen auch mit Zusatz davor und dahinter', () => {
    const book = [{ name: 'Run Up', rows: [HEAD, course('2027-1800', '27-0050', 'Engine Run-Up Refresher', 1, 4, serial('2027-07-06'), serial('2027-07-06')),
      member(1, 'B1 - Anna Adler - CAB', ''), member(2, 'B2 -Bernd Bach -IFE', ''), member(3, 'C - Christ, Carla', ''), member(4, 'Meier-Dorn, David', ''), member(5, 'Adler', '')] }];
    const r = Core.parseCourseOverview(project(), book);
    expect(r.courses[0].known).toEqual(['700101A', '700102B', '700103C']);          // Doppelname und bloßer Nachname bleiben unzugeordnet
    expect(r.courses[0].external).toBe(2);
  });
  it('nennt Blätter ohne lesbaren Lehrgang und kürzt Lehrgänge über den Jahreswechsel auf das Planungsjahr', () => {
    const book = [...sheets(), loose, { name: 'TEC A320', rows: [HEAD, course('2027-1900', '27-0090', 'Airbus A320 B1 Theoretical', 30, 8, serial('2027-12-06'), serial('2028-01-21')), member(1, 'Engel, Eva', '700105E'),
      course('2026-0800', '26-0080', 'Airbus A320 B1 Practical', 10, 8, serial('2026-12-14'), serial('2027-01-08'))] }];
    const r = Core.parseCourseOverview(project(), book), by = Object.fromEntries(r.courses.map(c => [c.ref, c]));
    expect(r.stats.empty).toEqual(['Freitext']);                                      // die leere Vorlage wird nicht eigens genannt
    expect(r.warnings.join(' ')).toMatch(/Blatt „Freitext“ hat keinen Lehrgang mit Beginn und Ende/);
    expect([by['2027-1900'].start, by['2027-1900'].end, by['2027-1900'].clipped]).toEqual(['2027-12-06', '2027-12-31', true]);
    expect([by['2026-0800'].start, by['2026-0800'].end]).toEqual(['2027-01-01', '2027-01-08']);
    expect(r.stats.clipped).toBe(2);
    expect(r.warnings.join(' ')).toMatch(/2 Lehrgänge reichen über den Jahreswechsel/);
    const st = project(); Core.applyCourseOverview(st, [by['2027-1900']]);
    expect(st.events.find(e => e.pk === '700105E').end).toBe('2027-12-31');
  });
  it('meldet eine Mappe ohne passende Blätter und ein falsches Planungsjahr', () => {
    expect(Core.parseCourseOverview(project(), [{ name: 'x', rows: [['a', 'b']] }]).errors[0]).toMatch(/Kein Blatt mit den Spalten/);
    const st = project(); st.meta.year = 2030;
    expect(Core.parseCourseOverview(st, sheets()).errors[0]).toMatch(/keinen Lehrgang im Planungsjahr 2030/);
  });
});

describe('Teilnehmerübersicht übernehmen', () => {
  const taken = (st, r) => Core.applyCourseOverview(st, r.courses.filter(c => c.take));
  it('legt Lehrgänge an und trägt die Teilnehmer aus dem Projekt ein', () => {
    const st = project(), info = taken(st, Core.parseCourseOverview(st, sheets()));
    expect(info).toMatchObject({ added: 4, updated: 0, participants: 6, otherType: true });
    expect(st.courses.map(c => [c.title, c.type, c.target, c.seats, c.ext ?? 0, Core.courseMembers(st, c.id).length])).toEqual([
      ['CAT A Grundlagen Theorie · 2027-1950', 'Theorie', '', 12, 1, 2], ['TEC A330 Theorie · 2027-1002', 'Theorie', 'A330', 6, 2, 2],
      ['TEC A330 Praxis · 2027-1003', 'Praxis', 'A330', 4, 1, 1], ['Engine Run-Up Refresher · 2027-1700', Core.OTHER_COURSE, '', null, 1, 1]]);
    expect(st.people.length).toBe(5);                                    // niemand wird angelegt
    expect(Core.measureOf(st, Core.OTHER_COURSE)).toMatchObject({ course: true });
    expect(st.courses[1].note).toMatch(/Airbus A330 .* Theoretical · Schule Nord · MUC · Quote 6/);
    const e = st.events.find(x => x.pk === '700105E');
    expect([e.type, e.start, e.end, e.trainee]).toEqual([Core.OTHER_COURSE, '2027-05-04', '2027-05-04', 1]);
  });
  it('zählt fremd belegte Plätze bei den freien Plätzen mit', () => {
    const st = project(); taken(st, Core.parseCourseOverview(st, sheets()));
    const tec = st.courses.find(c => c.ref === '2027-1002');
    expect(Core.extSeats(tec)).toBe(2);
    expect(Core.freeSeats(tec, Core.courseMembers(st, tec.id).length)).toBe(2);       // 6 Plätze − 2 andere − 2 eigene
    expect(Core.freeSeats({ seats: 3, ext: 3 }, 0)).toBe(0);
    expect(Core.freeSeats({ seats: null, ext: 3 }, 9)).toBe(null);
    const full = { ...tec, seats: 4 }, ix = Core.buildIndex(st);
    expect(Core.assessCourse(st, ix, full, ['700103C']).issues[0].text).toBe('alle Plätze sind belegt');
  });
  it('erkennt Lehrgänge beim erneuten Einspielen wieder: aktualisiert statt verdoppelt', () => {
    const st = project(); taken(st, Core.parseCourseOverview(st, sheets()));
    const next = sheets();
    next[0].rows[3] = course('2027-1001 2027-1002', '26-1574', 'Airbus A330 (RR Trent 700) B1 Theoretical', 20, 8, serial('2027-02-08'), serial('2027-03-05'));   // verschoben, mehr Plätze
    next[0].rows.splice(5, 1);                                                                                                                              // Bach steht nicht mehr drin
    next[2].rows.splice(2, 0, member(3, 'Dorn, David', '700104D'));                                                                                         // neu im Run-Up
    const r = Core.parseCourseOverview(st, next);
    expect(r.courses.filter(c => c.exists).map(c => c.ref).sort()).toEqual(['2027-1002', '2027-1003', '2027-1700', '2027-1950']);
    const info = taken(st, r);
    expect(info).toMatchObject({ added: 0, updated: 4, participants: 1, left: 1 });
    expect(st.courses.length).toBe(4);
    const tec = st.courses.find(c => c.ref === '2027-1002'), m = Core.courseMembers(st, tec.id);
    expect([tec.start, tec.end, tec.seats, tec.ext]).toEqual(['2027-02-08', '2027-03-05', 8, 2]);
    expect(m.map(e => [e.pk, e.start, e.end])).toEqual([['700101A', '2027-02-08', '2027-03-05']]);
    expect(Core.courseMembers(st, st.courses.find(c => c.ref === '2027-1700').id).map(e => e.pk).sort()).toEqual(['700104D', '700105E']);
  });
  it('lässt Teilnehmer stehen, wenn das Austragen abgewählt ist', () => {
    const st = project(); taken(st, Core.parseCourseOverview(st, sheets()));
    const next = sheets(); next[0].rows.splice(5, 1);
    const info = Core.applyCourseOverview(st, Core.parseCourseOverview(st, next).courses.filter(c => c.take), { prune: false });
    expect(info.left).toBe(0);
    expect(Core.courseMembers(st, st.courses.find(c => c.ref === '2027-1002').id).length).toBe(2);
  });
  it('übersteht Speichern und Laden mit Kennung, Plätzen und Teilnehmern', () => {
    const st = project(); taken(st, Core.parseCourseOverview(st, sheets()));
    const back = Core.sanitize(JSON.parse(JSON.stringify(st))).state;
    expect(back.courses.map(c => [c.ref, c.seats, c.ext ?? 0, c.type])).toEqual(st.courses.map(c => [c.ref, c.seats, c.ext ?? 0, c.type]));
    expect(back.events.filter(e => e.courseId).length).toBe(6);
    expect(Core.parseCourseOverview(back, sheets()).courses.filter(c => c.exists).length).toBe(4);
  });
  it('der Planer bucht niemanden in einen Lehrgang, dessen Plätze andere belegen', () => {
    const st = project(), r = Core.parseCourseOverview(st, sheets());
    const tec = r.courses.find(c => c.ref === '2027-1003'); tec.quota = 2; tec.external = 1;        // 2 Plätze: 1 eigene, 1 andere
    taken(st, r);
    const c = st.courses.find(x => x.ref === '2027-1003');
    expect(Core.freeSeats(c, Core.courseMembers(st, c.id).length)).toBe(0);
  });
});
