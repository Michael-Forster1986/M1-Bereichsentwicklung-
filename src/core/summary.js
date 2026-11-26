import { CLUSTERS, EPS, PREP } from './constants.js';
import { num } from './util.js';
import { cfgOf, isLocked, routeOf } from './people.js';

// ---------- Auswertung -------------------------------------------------
export function routeProgress(st, ix, p) {
  const route = routeOf(st, p), cfg = cfgOf(st, p), evs = ix.evByPerson.get(p.pk) || [];
  if (isLocked(p)) return { state: 'locked', steps: [] };
  if (p.cluster === 'offen' || !route || !cfg) return { state: 'unassigned', steps: [] };
  const steps = route.map(t => {
    const need = cfg[t]?.days || 0; let have = 0, fixed = 0;
    for (const e of evs) if (e.type === t) { const n = (ix.evDays.get(e.id) || []).length; have += n; if (!e.auto) fixed += n; }
    return { type: t, need, have: Math.min(have, need || have), fixed, over: Math.max(0, have - need) };
  });
  const done = steps.every(s => s.need > 0 && s.have >= s.need), any = steps.some(s => s.have > 0);
  let end = '';
  if (any) end = evs.filter(e => route.includes(e.type)).map(e => e.end).sort().pop() || '';
  return { state: done ? 'complete' : any ? 'partial' : 'none', steps, end };
}
export function summarize(st, ix) {
  const s = { people: st.people.length, eligible: 0, clusters: {}, route: { complete: 0, partial: 0, none: 0, locked: 0, unassigned: 0 },
    events: st.events.length, auto: 0, fixed: 0, scenario: 0, planned: 0, underMin: 0, underZero: 0, knownDays: 0, unknownDays: 0,
    worstMin: null, worstZero: null, resources: { mentor: 0, tec: 0, examiner: 0, prep: 0 },
    monthly: Array.from({ length: 12 }, () => ({ mentor: 0, tec: 0, examiner: 0, prep: 0 })), trainingDays: 0, absentDays: 0 };
  for (const k of Object.keys(CLUSTERS)) s.clusters[k] = 0;
  const planned = new Set();
  for (const p of st.people) {
    s.clusters[p.cluster] = (s.clusters[p.cluster] || 0) + 1;
    const pr = routeProgress(st, ix, p); s.route[pr.state]++;
    if (pr.state !== 'locked' && pr.state !== 'unassigned') s.eligible++;
  }
  for (const e of st.events) {
    planned.add(e.pk);
    if (e.auto) s.auto++; else if (e.synthetic) s.scenario++; else s.fixed++;
    const ds = ix.evDays.get(e.id) || [];
    if (e.type !== PREP) s.trainingDays += ds.length;
    for (const d of ds) {
      const m = ix.cal.month[d], prep = e.type === PREP;
      const v = prep ? { mentor: 0, tec: 0, examiner: 0, prep: num(e.examiner) + num(e.tec) } : { mentor: num(e.mentor), tec: num(e.tec), examiner: num(e.examiner), prep: 0 };
      for (const key in v) { s.resources[key] += v[key]; s.monthly[m][key] += v[key]; }
    }
  }
  s.planned = planned.size;
  const c = ix.cap, L = ix.load;
  for (let k = 0; k < 9; k++) for (let d = 0; d < ix.n; d++) {
    if (!c.known[k][d]) { if (k < 3) s.unknownDays++; continue; }
    s.knownDays++;
    const net = c.pre[k][d] - L.loss[k][d], dm = net - c.min[k][d], dz = net - c.zero[k][d];
    if (dm < -EPS) s.underMin++;
    if (dz < -EPS) s.underZero++;
    if (!s.worstMin || dm < s.worstMin.v) s.worstMin = { v: dm, d, k };
    if (!s.worstZero || dz < s.worstZero.v) s.worstZero = { v: dz, d, k };
  }
  for (let i = 0; i < st.people.length; i++) { const ab = ix.abs[i], r = ix.ros[i]; for (let d = 0; d < ix.n; d++) if (ab[d] && r[d] >= 2) s.absentDays++; }
  return s;
}
