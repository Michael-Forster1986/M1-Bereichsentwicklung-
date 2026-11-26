// 1:1-Nachweis: Der modulare Rechenkern liefert dieselben Ergebnisse wie der Kern der ursprünglichen HTML-Datei.
import { describe, it, expect, beforeAll } from 'vitest';
import * as Core from '../src/core/index.js';
import { loadLegacyCore, normalizeState, normalizeEvents, plain } from './legacy-core.js';

let Old;
beforeAll(() => { Old = loadLegacyCore(); });

const CASES = [{ year: 2027, count: 141, seed: 2027 }, { year: 2027, count: 40, seed: 7 }, { year: 2028, count: 75, seed: 99 }, { year: 2026, count: 12, seed: 3 }];

describe('öffentliche Schnittstelle', () => {
  it('stellt dieselben Namen bereit wie der ursprüngliche Kern', () => {
    expect(Object.keys(Core).sort()).toEqual(expect.arrayContaining(Object.keys(Old).sort()));
  });
  it('Konstanten sind identisch', () => {
    for (const k of ['FORMAT', 'VERSION', 'EPS', 'AREAS', 'SHIFTS', 'TYPES', 'LOGBOOK', 'PREP', 'CLUSTERS', 'ROUTE_CLUSTERS', 'DEFAULT_ROUTES', 'ABS_TYPES', 'TARGETS', 'LEVELS', 'PATTERNS'])
      expect(Core[k], k).toEqual(Old[k]);
    expect(Core.TEMPLATES).toMatchObject(Old.TEMPLATES);                 // neue Vorlagen (Lehrgangstermine) kommen hinzu
  });
  it('Vorgaben sind identisch', () => {
    expect(Core.defaultConfig()).toEqual(Old.defaultConfig());
    expect(Core.defaultLimits()).toEqual(Old.defaultLimits());
    for (const y of [2026, 2027, 2028, 2032]) {
      expect({ ...Core.defaultSettings(y), courseBlocks: undefined }).toEqual({ ...Old.defaultSettings(y), courseBlocks: undefined });
      expect(Core.holidaysBavaria(y)).toEqual(Old.holidaysBavaria(y));
      expect(normalizeState(Core.emptyState(y))).toEqual(normalizeState(Old.emptyState(y)));
    }
  });
});

describe.each(CASES)('Demo-Daten Jahr $year, $count Personen, Startwert $seed', opt => {
  let a, b, ixA, ixB;
  // courseBlocks: false = Planung wie in der Einzeldatei (Kurse tageweise); der Blockmodus hat eigene Tests
  beforeAll(() => { a = Core.demoState({ ...opt, courseBlocks: false }); b = Old.demoState(opt); ixA = Core.buildIndex(a); ixB = Old.buildIndex(b); });

  it('erzeugt denselben Zustand samt Jahresplan', () => {
    expect(normalizeState(a)).toEqual(normalizeState(b));
  });
  it('baut denselben Index (Kalender, Dienstplan, Kapazität, Last)', () => {
    for (const k of ['n', 'strict', 'holiday', 'work', 'school', 'ros', 'fallback', 'abs', 'grossR', 'absR', 'absA', 'rosterDay', 'load', 'cap'])
      expect(plain(ixA[k]), k).toEqual(plain(ixB[k]));
  });
  it('fasst gleich zusammen und findet dieselben Konflikte', () => {
    expect(Core.summarize(a, ixA)).toEqual(Old.summarize(b, ixB));
    const strip = list => list.map(c => ({ ...c, id: '' }));
    expect(strip(Core.findConflicts(a, ixA))).toEqual(strip(Old.findConflicts(b, ixB)));
    for (let i = 0; i < a.people.length; i++) expect(Core.routeProgress(a, ixA, a.people[i])).toEqual(Old.routeProgress(b, ixB, b.people[i]));
  });
  it('plant in jeder Reihenfolgevariante identisch', () => {
    const va = Core.planVariants(a, 8), vb = Old.planVariants(b, 8);
    expect(va).toEqual(vb);
    for (const mode of [{}, { allowPartial: false }, { replaceSynthetic: true }]) {
      for (let i = 0; i < va.length; i += 3) {
        const ra = Core.runPlan(a, ixA, { ...mode, order: va[i].order }), rb = Old.runPlan(b, ixB, { ...mode, order: vb[i].order });
        expect(normalizeEvents(ra.events)).toEqual(normalizeEvents(rb.events));
        expect(ra.report).toEqual(rb.report);
        expect(plain(ra.ledger)).toEqual(plain(rb.ledger));
        expect(Core.scorePlan(a, ixA, ra)).toEqual(Old.scorePlan(b, ixB, rb));
      }
    }
  });
  it('plant auch mit geänderten Einstellungen identisch', () => {
    for (const patch of [{ cap: false }, { goal: 'zero' }, { preferZero: false }, { avoidSchool: true, buffer: 1 }, { absenceLimit: 25, stress: 3 }, { strict: false, confirmedOnly: true }]) {
      const sa = Core.clone(a), sb = Old.clone(b);
      Object.assign(sa.settings, patch); Object.assign(sb.settings, patch);
      const xa = Core.buildIndex(sa), xb = Old.buildIndex(sb);
      const ra = Core.optimizePlan(sa, xa, { variants: 4 }), rb = Old.optimizePlan(sb, xb, { variants: 4 });
      expect(normalizeEvents(ra.events), JSON.stringify(patch)).toEqual(normalizeEvents(rb.events));
      expect(ra.report).toEqual(rb.report);
      expect(ra.score).toEqual(rb.score);
      expect(ra.variant).toBe(rb.variant);
    }
  });
  it('bewertet Lehrgangszeiträume identisch', () => {
    const pks = a.people.filter(p => p.cluster === '5' && p.level === 'TEC' && !Core.isLocked(p)).map(p => p.pk);
    for (const o of [{ group: 'all', threshold: 'zero', freePolicy: 'adjust' }, { group: 'max', threshold: 'min', minGroup: 2, maxGroup: 6, ignoreReplaceable: true, avoidSchool: true, freePolicy: 'block' }]) {
      const q = { ...o, pks, from: opt.year + '-02-01', to: opt.year + '-06-30', len: 10 };
      const ra = Core.courseSearch(a, ixA, q), rb = Old.courseSearch(b, ixB, q);
      expect(ra).toEqual(rb);
      expect(Core.pickSlots(ra.all.filter(x => x.ok), { sort: 'reserve', threshold: o.threshold })).toEqual(Old.pickSlots(rb.all.filter(x => x.ok), { sort: 'reserve', threshold: o.threshold }));
    }
  });
  it('pseudonymisiert und prüft Projektdateien identisch', () => {
    const pa = Core.pseudonymize(a), pb = Old.pseudonymize(b);
    expect(normalizeState(pa.state)).toEqual(normalizeState(pb.state));
    expect(pa.key).toEqual(pb.key);
    const ja = JSON.parse(JSON.stringify(a)), sa = Core.sanitize(ja), sb = Old.sanitize(ja);
    expect(normalizeState(sa.state)).toEqual(normalizeState(sb.state));
    expect(sa.warnings).toEqual(sb.warnings);
    // Speichern → Laden ändert nichts
    expect(normalizeState(Core.loadAny(JSON.stringify(a)).state)).toEqual(normalizeState(a));
  });
});

describe('Importe', () => {
  const csvPeople = 'Personalnummer;Name;Cluster;Bereich;Dienst;Zielmuster;Zielstufe;A320\r\n1001;"Muster, Max";1;M1;Früh;;;—\r\n1002;Beispiel Erika;5 · Mustererweiterung;M1;Spät;A330;TEC;TEC\r\n1003;Test Tom;unbekannt;M1;N;;;\r\n';
  it('liest CSV und prüft Stammdaten identisch', () => {
    const ra = Core.rowsToObjects(Core.parseCSV(csvPeople)), rb = Old.rowsToObjects(Old.parseCSV(csvPeople));
    expect(ra).toEqual(rb);
    const ca = Core.checkPeople(ra.rows, ra.head), cb = Old.checkPeople(rb.rows, rb.head);
    expect(ca).toEqual(cb);
    const sa = Core.emptyState(2027), sb = Old.emptyState(2027);
    expect(Core.applyPeople(sa, ca, 'replace')).toEqual(Old.applyPeople(sb, cb, 'replace'));
    const noAlias = st => st.people.map(p => ({ ...p, alias: '' }));     // Pseudonyme werden absichtlich zufällig vergeben
    expect(noAlias(sa)).toEqual(noAlias(sb));
  });
  it('prüft Dienstplan, Abwesenheiten, Kapazität und Termine identisch', () => {
    const mk = C => { const st = C.emptyState(2027); const r = C.rowsToObjects(C.parseCSV(csvPeople)); C.applyPeople(st, C.checkPeople(r.rows, r.head), 'replace'); return st; };
    const sa = mk(Core), sb = mk(Old), scope = { start: '2027-03-01', end: '2027-03-07' };
    let roster = 'pk;date;area;shift\n';
    for (const pk of ['1001', '1002', '1003']) for (let d = 1; d <= 7; d++) roster += pk + ';0' + d + '.03.2027;M1;' + ['F', 'S', 'N', 'Frei'][(d + +pk) % 4] + '\n';
    const ka = Core.checkRoster(sa, Core.parseCSV(roster), scope, false), kb = Old.checkRoster(sb, Old.parseCSV(roster), scope, false);
    expect(plain(ka)).toEqual(plain(kb));
    expect(ka.errors).toEqual([]);
    Core.applyRoster(sa, ka); Old.applyRoster(sb, kb);
    expect(sa.roster).toEqual(sb.roster);
    const abs = 'pk;start;end;type\n1001;01.03.2027;05.03.2027;Urlaub\n1002;2027-02-20;2027-03-02;krank\n9999;2027-03-01;2027-03-02;Urlaub\n';
    const oa = Core.rowsToObjects(Core.parseCSV(abs)), ob = Old.rowsToObjects(Old.parseCSV(abs));
    expect(Core.checkAbsences(sa, oa.rows, oa.head, scope)).toEqual(Old.checkAbsences(sb, ob.rows, ob.head, scope));
    const cap = 'date;area;shift;net;min;zero\n2027-03-01;M1;Früh;20;16;25\n2027-03-01;M1;Spät;12,5;11;13\n2027-03-02;M1;Früh;9;16;8\n';
    const pa = Core.rowsToObjects(Core.parseCSV(cap)), pb = Old.rowsToObjects(Old.parseCSV(cap));
    expect(Core.checkCapacity(pa.rows, pa.head, 2027)).toEqual(Old.checkCapacity(pb.rows, pb.head, 2027));
    const ev = 'pk;type;title;start;end\n1001;FitCheck;;2027-03-01;2027-03-05\n1002;theorie;Kurs;01.04.2027;30.04.2027\n1003;Unsinn;;2027-03-01;2027-03-02\n';
    const ea = Core.rowsToObjects(Core.parseCSV(ev)), eb = Old.rowsToObjects(Old.parseCSV(ev));
    const xa = Core.checkEvents(sa, ea.rows, ea.head), xb = Old.checkEvents(sb, eb.rows, eb.head);
    expect({ ...xa, rows: normalizeEvents(xa.rows) }).toEqual({ ...xb, rows: normalizeEvents(xb.rows) });
  });
  it('wandelt Datumsangaben identisch um', () => {
    for (const v of ['2027-03-01', '1.3.27', '01.03.2027', '2027/3/1', '46447', '2027-03-01T10:00:00', '31.02.2027', '', 'x', null, 46447.5])
      expect(Core.normDate(v), String(v)).toBe(Old.normDate(v));
    for (const d of ['2027-01-01', '2027-01-04', '2026-12-31', '2028-12-31']) expect(Core.isoWeek(d)).toBe(Old.isoWeek(d));
  });
});
