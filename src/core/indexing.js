import { ABS_TYPES, AREAS } from './constants.js';
import { fin, kArea, kOf, kShift, num } from './util.js';
import { makeCalendar, validDate } from './dates.js';
import { decodeRoster } from './roster.js';

// ---------- Index ------------------------------------------------------
function markRange(arr, cal, start, end, v) {
  if (!validDate(start) || !validDate(end)) return;
  const a = Math.max(0, cal.idx(start)), b = Math.min(cal.n - 1, cal.idx(end));
  for (let d = a; d <= b; d++) arr[d] = v;
}
export const newLoad = n => {
  const mk = () => Array.from({ length: 9 }, () => new Float64Array(n));
  return { loss: mk(), mentor: mk(), tec: mk(), exam: mk() };
};
/** Zuordnung einer Person an einem Tag: Index Bereich×Dienst oder -1 (kein Dienst). */
export function assign(ix, i, d) {
  const c = ix.ros[i][d];
  if (c >= 2) return c - 2;
  if (c === 1 || ix.strict) return -1;
  return ix.fallback[i];
}
function eventDays(e, cal, work) {
  const out = [], n = cal.n;
  if (Array.isArray(e.dates)) {
    for (const s of e.dates) { const d = cal.idx(s); if (d >= 0 && d < n) out.push(d); }
    out.sort((a, b) => a - b);
  } else if (validDate(e.start) && validDate(e.end)) {
    for (let d = Math.max(0, cal.idx(e.start)), b = Math.min(n - 1, cal.idx(e.end)); d <= b; d++) if (work[d]) out.push(d);
  }
  return out;
}
export function eventK(ix, e, d, k0) {
  const ar = (e.dayAreas && e.dayAreas[ix.cal.iso[d]]) || e.area;
  if (!ar) return k0;
  const a = AREAS.indexOf(ar);
  return a < 0 ? k0 : a * 3 + k0 % 3;
}
export function addLoad(ix, L, e, days) {
  const i = ix.pi.get(e.pk);
  if (i === undefined) return;
  const m = num(e.mentor), t = num(e.tec), x = num(e.examiner), sum = num(e.trainee) + m + t + x;
  for (const d of days) {
    const k0 = assign(ix, i, d);
    if (k0 < 0) continue;                       // kein Dienst: kein Produktionsverlust, wird als Konflikt/Anpassung gemeldet
    const k = eventK(ix, e, d, k0);
    L.loss[k][d] += sum; L.mentor[k][d] += m; L.tec[k][d] += t; L.exam[k][d] += x;
  }
}
export function buildIndex(st) {
  const cal = makeCalendar(st.meta.year), n = cal.n, S = st.settings;
  const ix = { cal, n, strict: !!S.strict, people: new Map(), pi: new Map() };
  st.people.forEach((p, i) => { ix.people.set(p.pk, p); ix.pi.set(p.pk, i); });
  // Kalender
  const holiday = new Uint8Array(n), work = new Uint8Array(n), school = new Uint8Array(n);
  for (const h of st.holidays) { const d = cal.idx(h); if (d >= 0 && d < n) holiday[d] = 1; }
  for (let d = 0; d < n; d++) work[d] = cal.dow[d] !== 0 && cal.dow[d] !== 6 && !holiday[d] ? 1 : 0;
  for (const s of st.school) markRange(school, cal, s.start, s.end, 1);
  Object.assign(ix, { holiday, work, school });
  // Dienstplan und Abwesenheiten
  ix.ros = st.people.map(p => decodeRoster(st.roster[p.pk], n));
  ix.fallback = Int8Array.from(st.people, p => kOf(p.area, p.shift));
  ix.abs = st.people.map(() => new Uint8Array(n));
  for (const a of st.absences) {
    const i = ix.pi.get(a.pk);
    if (i !== undefined) markRange(ix.abs[i], cal, a.start, a.end, ABS_TYPES.indexOf(a.type) + 1 || 3);
  }
  const mk16 = () => Array.from({ length: 9 }, () => new Uint16Array(n));
  const grossR = mk16(), absR = mk16(), absA = mk16(), rosterDay = new Uint16Array(n);
  for (let i = 0; i < st.people.length; i++) {
    const r = ix.ros[i], ab = ix.abs[i], fb = ix.fallback[i];
    for (let d = 0; d < n; d++) {
      const c = r[d];
      if (c) rosterDay[d]++;
      if (c >= 2) { grossR[c - 2][d]++; if (ab[d]) { absR[c - 2][d]++; absA[c - 2][d]++; } }
      else if (c === 0 && !ix.strict && fb >= 0 && ab[d]) absA[fb][d]++;
    }
  }
  Object.assign(ix, { grossR, absR, absA, rosterDay });
  // Termine
  ix.evDays = new Map(); ix.evByDay = Array.from({ length: n }, () => []); ix.evByPerson = new Map(); ix.evById = new Map();
  ix.load = newLoad(n);
  for (const e of st.events) {
    const ds = eventDays(e, cal, work);
    ix.evDays.set(e.id, ds); ix.evById.set(e.id, e);
    for (const d of ds) ix.evByDay[d].push(e);
    let list = ix.evByPerson.get(e.pk); if (!list) ix.evByPerson.set(e.pk, list = []); list.push(e);
    addLoad(ix, ix.load, e, ds);
  }
  // Kapazität: importierte Tageswerte haben Vorrang, sonst Ableitung aus Dienstplan − Abwesenheiten
  const mkF = () => Array.from({ length: 9 }, () => new Float64Array(n));
  const cap = { known: Array.from({ length: 9 }, () => new Uint8Array(n)), src: Array.from({ length: 9 }, () => new Uint8Array(n)),
    pre: mkF(), base: mkF(), gross: mkF(), absent: mkF(), reserve: mkF(), min: mkF(), zero: mkF() };
  const ov = new Map();
  for (const c of st.capacity) { const d = cal.idx(c.date), k = kOf(c.area, c.shift); if (d >= 0 && d < n && k >= 0) ov.set(k * 1000 + d, c); }
  for (let k = 0; k < 9; k++) {
    const lim = st.limits?.[kArea(k)]?.[kShift(k)] || {};
    const lmin = fin(lim.min) ? lim.min : NaN, lzero = fin(lim.zero) ? lim.zero : NaN;
    for (let d = 0; d < n; d++) {
      const q = (num(S.sick[cal.month[d]]) + num(S.stress)) / 100, o = ov.get(k * 1000 + d);
      let base, absX = 0;
      if (o) {
        base = num(o.net); cap.gross[k][d] = fin(o.gross) ? o.gross : NaN; cap.absent[k][d] = num(o.absent);
        cap.min[k][d] = fin(o.min) ? o.min : NaN; cap.zero[k][d] = fin(o.zero) ? o.zero : NaN;
        if (o.absencesIncluded === false) absX = absA[k][d];
        cap.known[k][d] = o.checked && fin(o.net) && fin(o.min) && fin(o.zero) ? 1 : 0; cap.src[k][d] = 2;
      } else {
        base = grossR[k][d] - absR[k][d]; cap.gross[k][d] = grossR[k][d]; cap.absent[k][d] = absR[k][d];
        cap.min[k][d] = lmin; cap.zero[k][d] = lzero;
        // M1 wird an jedem Tag mit Dienstplan bewertet; M2/M3 nur dort, wo der Dienstplan Personen zuordnet
        const has = rosterDay[d] > 0 && (k < 3 || grossR[k][d] > 0);
        cap.known[k][d] = has && fin(lim.min) && fin(lim.zero) ? 1 : 0; cap.src[k][d] = has ? 1 : 0;
      }
      cap.base[k][d] = base; cap.reserve[k][d] = base * q; cap.pre[k][d] = base * (1 - q) - absX;
    }
  }
  ix.cap = cap;
  return ix;
}
/** Kapazitätswerte eines Dienstes an einem Tag (inklusive Maßnahmenverlust aus dem aktuellen Plan). */
export function capInfo(ix, d, k) {
  const c = ix.cap, L = ix.load, loss = L.loss[k][d];
  return { known: !!c.known[k][d], src: c.src[k][d], gross: c.gross[k][d], absent: c.absent[k][d], base: c.base[k][d],
    reserve: c.reserve[k][d], loss, mentor: L.mentor[k][d], tec: L.tec[k][d], exam: L.exam[k][d],
    net: c.pre[k][d] - loss, min: c.min[k][d], zero: c.zero[k][d] };
}
