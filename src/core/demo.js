import { uid } from './util.js';
import { holidaysBavaria, makeCalendar } from './dates.js';
import { emptyState } from './defaults.js';
import { normPerson } from './people.js';
import { encodeRoster } from './roster.js';
import { buildIndex } from './indexing.js';
import { mulberry, optimizePlan } from './planner.js';
import { courseDemand, memberEvent, proposeCourses } from './courses.js';

// ---------- Synthetische Demo-Daten -------------------------------------
/** courseBlocks = false erzeugt den Datensatz der Einzeldatei-Fassung (Kurse als einzelne Tage) – Maßstab der Vergleichstests. */
export function demoState({ year = 2027, count = 141, seed = 2027, courseBlocks = true } = {}) {
  const st = emptyState(year), rnd = mulberry(seed), cal = makeCalendar(year), n = cal.n;
  Object.assign(st.meta, { title: 'M1 Jahressimulation ' + year, dataClass: 'demo', source: 'Synthetische Demo-Daten · keine realen Personen',
    simulated: { roster: true, absences: true }, assumptions: [
      'Alle Personen, Dienstpläne und Abwesenheiten sind frei erfunden und zufällig erzeugt',
      'Synthetische 5-Dienst-/2-Frei-Rotation; vierwöchig Früh/Früh/Spät/Nacht',
      '30 Diensttage Urlaub je Person in vier Blöcken',
      'Alle Köpfe gleich 1 Produktionsäquivalent; Skill-Mix nicht berücksichtigt',
      'Ausbildung nur Mo–Fr auf vorgesehenen Diensten; Theorie/Praxis/FitCheck/ICA nur im Frühdienst',
      'Mentor max. 2, TEC max. 2, Prüfer max. 1 je Dienst als angenommene Pools',
      'Krankheit als monatliche Erwartung, keine individuellen Krankheitstage',
      'Keine Prüfung von Arbeitszeit, Betriebsvereinbarungen, Ruhezeiten oder gebuchten Kursen'] });
  Object.assign(st.settings, { cap: true, strict: true, mentorLimit: 2, tecLimit: 2 });
  st.holidays = holidaysBavaria(year).map(h => h.date);
  // Clusterverteilung (Anteile wie im Vorgängerszenario, Personen frei erfunden)
  const weights = { '5': 53, 'offen': 33, '1': 25, 'ausgeschlossen': 15, '3': 8, '2': 7 }, total = 141;
  const quota = Object.entries(weights).map(([k, w]) => ({ k, exact: w / total * count }));
  quota.forEach(q => { q.n = Math.floor(q.exact); });
  let rest = count - quota.reduce((s, q) => s + q.n, 0);
  quota.slice().sort((a, b) => (b.exact - b.n) - (a.exact - a.n)).forEach(q => { if (rest-- > 0) q.n++; });
  const bag = quota.flatMap(q => Array(q.n).fill(q.k));
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  const pick = arr => { let r = rnd() * arr.reduce((s, x) => s + x[1], 0); for (const [v, w] of arr) { if ((r -= w) < 0) return v; } return arr[0][0]; };
  const w3 = String(count).length < 3 ? 3 : String(count).length;
  bag.forEach((cluster, i) => {
    const id = String(i + 1).padStart(w3, '0');
    const p = { pk: 'D' + String(i + 1).padStart(5, '0'), name: 'Person ' + id, alias: 'P-' + id, cluster,
      org: rnd() < 0.82 ? 'L/TM-M12 · CAB, IFE' : 'L/TM-M14 · NDT, MFB', area: 'M1', shift: 'Früh', start: '', priority: 3, patterns: {} };
    if (cluster === '1') p.rights = '—';
    else if (cluster === '2' || cluster === '3') { p.rights = 'CAB'; p.patterns.A320 = 'CAB'; }
    else if (cluster === '5') {
      p.level = pick([['TEC', 27], ['CAB', 21], ['CAT A', 5]]); p.target = pick([['A330', 50], ['A380', 2], ['A350', 1]]);
      p.rights = { TEC: 'TEC', CAB: 'CAB', 'CAT A': 'A' }[p.level]; p.patterns.A320 = p.rights; p.targetAssumed = true;
      if (p.target !== 'A350' && rnd() < 0.3) p.patterns.A350 = p.rights;
    } else if (cluster === 'offen') { p.rights = pick([['TEC', 4], ['CAB', 3], ['A', 2], ['—', 3]]); if (p.rights !== '—') p.patterns.A320 = p.rights; }
    else { p.rights = pick([['B1', 5], ['TEC', 5], ['A', 3], ['B1/B2', 1]]); p.locked = true; p.patterns.A320 = p.rights; p.patterns.A330 = p.rights; }
    st.people.push(normPerson(p));
  });
  // Dienstplan
  const ros = st.people.map((p, i) => {
    const arr = new Uint8Array(n), off = i % 7, phase = Math.floor(i / 7) % 4;
    for (let d = 0; d < n; d++) {
      const x = d + off;
      arr[d] = x % 7 < 5 ? 2 + [0, 0, 1, 2][(Math.floor(x / 7) + phase) % 4] : 1;
    }
    return arr;
  });
  st.people.forEach((p, i) => { st.roster[p.pk] = encodeRoster(ros[i]); });
  // Urlaub: 4 Blöcke (10/10/5/5 Diensttage), gleichmäßig über das Jahr verteilt
  const absCount = Array.from({ length: 3 }, () => new Uint16Array(n));
  st.people.forEach((p, i) => {
    const taken = new Uint8Array(n);
    [10, 10, 5, 5].forEach((len, bi) => {
      let best = null;
      for (let tryNo = 0; tryNo < 10; tryNo++) {
        const q0 = Math.floor(n / 4 * ((bi + (i % 4)) % 4)), s0 = Math.min(n - 1, q0 + Math.floor(rnd() * (n / 4)));
        let d = s0; const ds = [];
        while (d < n && ros[i][d] < 2) d++;
        for (; d < n && ds.length < len; d++) { if (taken[d]) { ds.length = 0; break; } if (ros[i][d] >= 2) ds.push(d); }
        if (ds.length < len) continue;
        const peak = Math.max(...ds.map(x => absCount[ros[i][x] - 2][x]));
        if (!best || peak < best.peak) best = { ds, peak };
      }
      if (!best) return;
      const a = best.ds[0], b = best.ds[best.ds.length - 1];
      for (let d = a; d <= b; d++) taken[d] = 1;
      for (const d of best.ds) absCount[ros[i][d] - 2][d]++;
      st.absences.push({ pk: p.pk, type: 'Urlaub', start: cal.iso[a], end: cal.iso[b], synthetic: true });
    });
  });
  st.settings.courseBlocks = courseBlocks;
  let ix = buildIndex(st);
  const start0 = cal.idx(st.settings.start);
  if (!courseBlocks) {
    // Fassung der Einzeldatei: Kursrahmen für Cluster 3 (Theorie 46 Tage, Praxis 7 Tage) als einzelne Szenariotage je Person
    st.people.forEach((p, i) => {
      if (p.cluster !== '3') return;
      let d = start0;
      for (const [type, len] of [['Theorie', 46], ['Praxis', 7]]) {
        const ds = [];
        for (; d < n && ds.length < len; d++) if (ix.work[d] && !ix.abs[i][d] && ros[i][d] === 2) ds.push(d);
        if (ds.length === len) st.events.push({ id: uid(), pk: p.pk, type, title: 'Kursrahmen', auto: false, synthetic: true, start: cal.iso[ds[0]], end: cal.iso[ds[len - 1]],
          dates: ds.map(x => cal.iso[x]), trainee: 1, mentor: 0, tec: 0, examiner: 0, target: '' });
      }
    });
  } else {
    // Lehrgänge als zusammenhängende Blöcke für Gruppen – alle als Szenario gekennzeichnet
    st.meta.assumptions.splice(5, 0, 'Lehrgänge (Theorie, Praxis) als zusammenhängende Blöcke für Gruppen; dienstfreie Lehrgangstage gelten als Dienstplananpassung');
    const add = (c, pks) => {
      const course = { id: 'demo' + (st.courses.length + 1), target: '', seats: null, fixed: true, synthetic: true, ...c };
      st.courses.push(course);
      for (const pk of pks) { const e = memberEvent(st, ix, course, pk); if (e) { e.synthetic = true; st.events.push(e); } }
      return course;
    };
    const block = (from, len) => { const ds = []; for (let d = from; d < n && ds.length < len; d++) if (ix.work[d]) ds.push(d); return ds; };
    // Cluster 3: CAT-A-Kursrahmen (Theorie 46 Tage, danach Praxis 7 Tage); der Urlaub der Gruppe liegt außerhalb
    const c3 = st.people.filter(p => p.cluster === '3').map(p => p.pk);
    if (c3.length) {
      const a = block(start0, 46), b = block(a[a.length - 1] + 1, 7), from = cal.iso[a[0]], to = cal.iso[b[b.length - 1]], set = new Set(c3);
      st.absences = st.absences.filter(x => !(set.has(x.pk) && x.end >= from && x.start <= to));
      ix = buildIndex(st);
      add({ type: 'Theorie', title: 'CAT A Theorie', start: from, end: cal.iso[a[a.length - 1]], seats: Math.max(12, c3.length) }, c3);
      add({ type: 'Praxis', title: 'CAT A Praxis', start: cal.iso[b[0]], end: to, seats: Math.max(12, c3.length) }, c3);
      ix = buildIndex(st);
    }
    // Cluster 5 · TEC: je Zielmuster die besten Zeiträume für Theorie, danach für Praxis
    for (const type of ['Theorie', 'Praxis']) {
      for (const g of courseDemand(st, ix).filter(x => x.type === type && x.target && x.open.length)) {
        const res = proposeCourses(st, ix, { type, target: g.target, pks: g.open, len: g.days || (type === 'Theorie' ? 20 : 10), from: st.settings.start, to: year + '-12-17', minGroup: 1, maxGroup: 10, threshold: 'zero', maxCourses: 6 });
        res.courses.sort((x, y) => x.start < y.start ? -1 : 1).forEach((a, k) => { add({ type, title: 'TEC ' + g.target + ' ' + type + (res.courses.length > 1 ? ' ' + (k + 1) : ''), target: g.target, start: a.start, end: a.end, seats: 10 }, a.pks); });
        ix = buildIndex(st);
      }
    }
  }
  st.courses.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : a.title < b.title ? -1 : 1);
  ix = buildIndex(st);
  const res = optimizePlan(st, ix, { variants: 12 });
  st.events = res.events; st.report = res.report;
  st.planInfo = { at: new Date().toISOString(), mode: 'optimize', variant: res.variant, tried: res.tried.length };
  return st;
}
