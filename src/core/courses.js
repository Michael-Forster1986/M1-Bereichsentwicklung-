import { EPS, PREP, isCourseType } from './constants.js';
import { num, uid } from './util.js';
import { validDate } from './dates.js';
import { cfgOf, creditOf, isLocked, routeOf } from './people.js';
import { assign, buildIndex, capInfo, eventK } from './indexing.js';

// ---------- Lehrgangsplanung (zusammenhängende Kurse) -------------------
/**
 * Prüft einen Lehrgangszeitraum gegen die Kapazitätsgrenze.
 * o.group 'all': alle gewählten Personen müssen teilnehmen können; 'max': größtmögliche Gruppe bilden.
 * o.ignoreReplaceable: berechnete und Szenariotermine der Teilnehmer gelten als verschiebbar.
 */
export function courseAssess(st, ix, o) {
  const cal = ix.cal, issues = [], all = (o.pks || []).filter(pk => ix.pi.has(pk));
  const res = { ok: false, issues, start: o.start, end: o.end, pks: [], asked: all.length, dropped: [], days: [], minMargin: null, zeroMargin: null, adjust: 0, offShift: 0, school: 0, threshold: o.threshold };
  if (!all.length) { issues.push({ cat: 'Eingabe', text: 'Keine Teilnehmer ausgewählt' }); return res; }
  if (!validDate(o.start) || !validDate(o.end) || o.end < o.start) { issues.push({ cat: 'Eingabe', text: 'Ungültiger Zeitraum' }); return res; }
  const a = Math.max(0, cal.idx(o.start)), b = Math.min(ix.n - 1, cal.idx(o.end));
  for (let d = a; d <= b; d++) if (ix.work[d]) res.days.push(d);
  if (!res.days.length) { issues.push({ cat: 'Eingabe', text: 'Zeitraum enthält keinen Arbeitstag' }); return res; }
  const movable = e => o.ignoreReplaceable && (e.auto || e.synthetic);
  for (const d of res.days) if (ix.school[d]) { res.school++; if (o.avoidSchool) issues.push({ cat: 'Ferien', d }); }
  // Persönliche Hinderungsgründe je Teilnehmer
  const personal = new Map(), duty = new Map(), credit = new Map();
  for (const pk of all) {
    const i = ix.pi.get(pk), mine = [], cells = [], win = o.window && o.window.get(pk);
    if (win && (a < win.earliest || b > win.latest)) mine.push({ cat: 'Reihenfolge im Ausbildungsweg', pk, d: a });
    for (const d of res.days) {
      if (ix.abs[i][d]) { mine.push({ cat: 'Abwesenheit', pk, d }); continue; }
      const own = ix.evByDay[d].filter(e => e.pk === pk && e.type !== PREP);
      if (own.some(e => !movable(e))) { mine.push({ cat: 'Terminkollision', pk, d }); continue; }
      const k = assign(ix, i, d);
      if (k < 0) { if (o.freePolicy === 'block') mine.push({ cat: 'Kein Dienst', pk, d }); continue; }
      cells.push(k * 1000 + d);
      for (const e of own) { const key = eventK(ix, e, d, k) * 1000 + d; credit.set(pk + '|' + key, (credit.get(pk + '|' + key) || 0) + num(e.trainee) + num(e.mentor) + num(e.tec) + num(e.examiner)); }
    }
    if (mine.length) personal.set(pk, mine);
    duty.set(pk, cells);
  }
  let group = all.slice();
  if (o.group === 'max') {
    group = all.filter(pk => !personal.has(pk));
    for (const [pk, mine] of personal) res.dropped.push({ pk, cats: [...new Set(mine.map(m => m.cat))] });
  } else for (const mine of personal.values()) issues.push(...mine);
  // Kapazität je Tag/Bereich/Dienst einmal prüfen
  const lim = c => o.threshold === 'zero' ? c.zero : c.min;
  const evaluate = () => {
    const heads = new Map(), back = new Map(), viol = [];
    for (const pk of group) for (const key of duty.get(pk)) heads.set(key, (heads.get(key) || 0) + 1);
    for (const pk of group) for (const [ck, v] of credit) if (ck.startsWith(pk + '|')) { const key = +ck.slice(pk.length + 1); back.set(key, (back.get(key) || 0) + v); }
    let mm = Infinity, zm = Infinity;
    for (const [key, h] of heads) {
      const k = Math.floor(key / 1000), d = key % 1000, c = capInfo(ix, d, k);
      if (!c.known) { viol.push({ cat: 'Kapazität offen', d, k, key }); continue; }
      const after = c.net + (back.get(key) || 0) - h;
      mm = Math.min(mm, after - c.min); zm = Math.min(zm, after - c.zero);
      if (after < lim(c) - EPS) viol.push({ cat: 'Kapazitätsgrenze', d, k, key, after, lim: lim(c), heads: h });
    }
    return { viol, mm, zm };
  };
  let ev = evaluate();
  if (o.group === 'max') {
    // Solange die Grenze verletzt ist: die Person mit den meisten betroffenen Diensttagen herausnehmen
    while (ev.viol.length && group.length) {
      const bad = new Set(ev.viol.map(v => v.key)), cnt = new Map();
      for (const pk of group) { const c = duty.get(pk).filter(key => bad.has(key)).length; if (c) cnt.set(pk, c); }
      if (!cnt.size) break;
      const out = [...cnt].sort((x, y) => y[1] - x[1])[0][0];
      group = group.filter(pk => pk !== out); res.dropped.push({ pk: out, cats: ['Kapazitätsgrenze'] });
      ev = evaluate();
    }
  }
  if (o.group === 'max' && o.maxGroup > 0 && group.length > o.maxGroup) {
    // Mehr Interessenten als Plätze: zuerst dort kürzen, wo die Reserve am kleinsten ist (niedrigste Planungspriorität zuerst)
    const pr = pk => Number(ix.people.get(pk)?.priority) || 3;
    while (group.length > o.maxGroup) {
      const heads = new Map();
      for (const pk of group) for (const key of duty.get(pk)) heads.set(key, (heads.get(key) || 0) + 1);
      let worst = null;
      for (const [key, h] of heads) { const c = capInfo(ix, key % 1000, Math.floor(key / 1000)); if (!c.known) continue; const m = c.net - h - lim(c); if (!worst || m < worst.m) worst = { key, m }; }
      const cand = worst ? group.filter(pk => duty.get(pk).includes(worst.key)) : group;
      const out = (cand.length ? cand : group).slice().sort((x, y) => pr(y) - pr(x))[0];
      group = group.filter(pk => pk !== out); res.dropped.push({ pk: out, cats: ['Platzzahl'] });
    }
    ev = evaluate();
  }
  issues.push(...ev.viol);
  res.pks = group;
  res.minMargin = Number.isFinite(ev.mm) ? ev.mm : null; res.zeroMargin = Number.isFinite(ev.zm) ? ev.zm : null;
  for (const pk of group) {
    const i = ix.pi.get(pk);
    for (const d of res.days) { const k = assign(ix, i, d); if (k < 0) res.adjust++; else if (k % 3 !== 0) res.offShift++; }
  }
  if (o.group === 'max' && group.length < Math.max(1, o.minGroup || 1)) issues.push({ cat: 'Gruppe zu klein', text: group.length + ' von mindestens ' + (o.minGroup || 1) });
  res.ok = issues.length === 0;
  return res;
}
/** Prüft jeden möglichen Starttag im Suchzeitraum. */
export function courseSearch(st, ix, o) {
  const cal = ix.cal, all = [];
  if (!validDate(o.from) || !validDate(o.to) || o.to < o.from) return { all, checked: 0 };
  const a = Math.max(0, cal.idx(o.from)), b = Math.min(ix.n - 1, cal.idx(o.to));
  for (let d = a; d <= b; d++) {
    if (!ix.work[d]) continue;
    let e = d, cnt = 0;
    for (; e < ix.n && cnt < o.len; e++) if (ix.work[e]) cnt++;
    e--;
    if (cnt < o.len || e > b) break;
    all.push(courseAssess(st, ix, { ...o, start: cal.iso[d], end: cal.iso[e] }));
  }
  return { all, checked: all.length };
}
/** Wählt Vorschläge aus: früheste, reservenstärkste oder größte Gruppe; optional überschneidungsfrei. */
export function pickSlots(list, { sort = 'early', nonOverlap = true, max = 15, threshold = 'zero' } = {}) {
  const margin = a => threshold === 'zero' ? a.zeroMargin ?? -1e9 : a.minMargin ?? -1e9;
  const early = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
  const arr = list.slice().sort(sort === 'reserve' ? (a, b) => margin(b) - margin(a) || a.adjust - b.adjust || early(a, b)
    : sort === 'group' ? (a, b) => b.pks.length - a.pks.length || margin(b) - margin(a) || early(a, b) : early);
  const out = [];
  for (const a of arr) {
    if (nonOverlap && out.some(x => !(a.end < x.start || a.start > x.end))) continue;
    out.push(a);
    if (out.length >= max) break;
  }
  return sort === 'early' ? out : out;
}
export function courseEvents(ix, a, { name = 'TEC Lehrgang', type = 'Theorie', kind = 'TEC' } = {}) {
  const dates = a.days.map(d => ix.cal.iso[d]);
  return a.pks.map(pk => ({ id: uid(), pk, type, title: name, courseKind: kind, auto: false, start: dates[0], end: dates[dates.length - 1],
    dates: dates.slice(), trainee: 1, mentor: 0, tec: 0, examiner: 0, target: ix.people.get(pk)?.target || '' }));
}

// ---------- Lehrgänge als eigene Einheit: Termin, Plätze, Teilnehmer --------------
// Ein Lehrgang (st.courses) beschreibt Art, Zeitraum und Plätze. Wer teilnimmt, steht in den Terminen
// (st.events) mit courseId – so zählen Lehrgänge in Kapazität, Konfliktprüfung und Ausbildungsweg wie jeder Termin.

/** Arbeitstage eines Lehrgangs als Tagesindizes. */
export function courseDayList(ix, c) {
  const out = [];
  if (!validDate(c.start) || !validDate(c.end)) return out;
  for (let d = Math.max(0, ix.cal.idx(c.start)), b = Math.min(ix.n - 1, ix.cal.idx(c.end)); d <= b; d++) if (ix.work[d]) out.push(d);
  return out;
}
export const courseMembers = (st, id) => st.events.filter(e => e.courseId === id);
export const courseKey = c => c.type + '|' + c.title + '|' + c.start + '|' + c.end;
/** Ein Lehrgangsplatz gilt als vergeben durch einen Lehrgangstermin, einen fixierten Termin der Art oder ausreichende Vorleistung. */
const hasCoursePlace = (p, t, evs, need) => evs.some(e => e.type === t && (e.courseId || e.courseKind || !e.auto)) || (need > 0 && creditOf(p, t) >= need);

/**
 * Lehrgangsbedarf: je Art und Zielmuster die Personen, deren Ausbildungsweg den Lehrgang verlangt.
 * placed = haben einen Platz · open = brauchen noch einen. Cluster 3 / 4B brauchen den Praxis-Lehrgang als Voraussetzung.
 */
export function courseDemand(st, ix) {
  const groups = new Map();
  for (const p of st.people) {
    if (isLocked(p) || p.cluster === 'offen') continue;
    const route = routeOf(st, p) || [], cfg = cfgOf(st, p) || {}, evs = ix.evByPerson.get(p.pk) || [];
    const need = new Map(route.filter(isCourseType).map(t => [t, false]));
    if (['3', '4B'].includes(p.cluster) && !p.gate && !need.has('Praxis')) need.set('Praxis', true);
    for (const [t, prereq] of need) {
      const key = t + '|' + (p.target || '');
      let g = groups.get(key);
      if (!g) groups.set(key, g = { key, type: t, target: p.target || '', days: null, all: [], open: [], placed: [], prereq: 0 });
      const days = Number.isInteger(cfg[t]?.days) && cfg[t].days > 0 ? cfg[t].days : null;
      if (days && (!g.days || days > g.days)) g.days = days;
      g.all.push(p.pk); if (prereq) g.prereq++;
      (hasCoursePlace(p, t, evs, days || 0) ? g.placed : g.open).push(p.pk);
    }
  }
  return [...groups.values()].sort((a, b) => a.type < b.type ? -1 : a.type > b.type ? 1 : a.target < b.target ? -1 : 1);
}
/** Zeitfenster, in dem ein Lehrgang im Ausbildungsweg einer Person liegen darf (nach früheren, vor späteren fixierten Schritten). */
export function courseWindow(st, ix, p, type) {
  const route = (p && routeOf(st, p)) || [], at = route.indexOf(type), win = { earliest: 0, latest: ix.n - 1 };
  if (at < 0) return win;
  for (const e of ix.evByPerson.get(p.pk) || []) {
    if (e.auto) continue;
    const j = route.indexOf(e.type), ds = ix.evDays.get(e.id) || [];
    if (j < 0 || j === at || !ds.length) continue;
    if (j < at) win.earliest = Math.max(win.earliest, ds[ds.length - 1] + 1); else win.latest = Math.min(win.latest, ds[0] - 1);
  }
  return win;
}
/** Personen, die für einen Lehrgang in Frage kommen: Bedarf an dieser Art (und diesem Zielmuster), noch ohne Platz. */
export function courseCandidates(st, ix, c) {
  const have = new Set(courseMembers(st, c.id).map(e => e.pk)), out = [];
  for (const g of courseDemand(st, ix)) if (g.type === c.type && (!c.target || g.target === c.target)) for (const pk of g.open) if (!have.has(pk)) out.push(pk);
  const pr = pk => Number(ix.people.get(pk)?.priority) || 3;
  return out.sort((a, b) => pr(a) - pr(b) || ix.pi.get(a) - ix.pi.get(b));
}
/**
 * Prüft, wer an einem Lehrgang teilnehmen kann, ohne dass die Produktion unter die Grenze fällt.
 * opt.group 'max' (Vorgabe): bestmögliche Besetzung der freien Plätze · 'all': alle genannten Personen gemeinsam.
 */
export function assessCourse(st, ix, c, pks, opt = {}) {
  const list = pks.filter(pk => ix.pi.has(pk)), taken = courseMembers(st, c.id).length, free = c.seats == null ? null : Math.max(0, c.seats - taken);
  const window = new Map(list.map(pk => [pk, courseWindow(st, ix, ix.people.get(pk), c.type)])), group = opt.group || 'max';
  const o = { threshold: 'zero', freePolicy: 'adjust', ignoreReplaceable: true, avoidSchool: false, minGroup: 1, ...opt, group, pks: list, start: c.start, end: c.end, window,
    maxGroup: group === 'max' ? (free == null ? (opt.maxGroup || 0) : free) : 0 };
  if (group === 'max' && free === 0) return { ok: false, issues: [{ cat: 'Lehrgang', text: 'alle Plätze sind belegt' }], start: c.start, end: c.end, pks: [], asked: list.length, dropped: list.map(pk => ({ pk, cats: ['Platzzahl'] })), days: courseDayList(ix, c), minMargin: null, zeroMargin: null, adjust: 0, offShift: 0, school: 0, threshold: o.threshold, free };
  const res = courseAssess(st, ix, o);
  if (group === 'all' && free != null && list.length > free) { res.issues.push({ cat: 'Platzzahl', text: list.length + ' Personen bei ' + free + ' freien Plätzen' }); res.ok = false; }
  res.free = free;
  return res;
}
/** Teilnehmertermin einer Person für einen Lehrgang; die Verlustfaktoren kommen aus ihrem Ausbildungsweg. */
export function memberEvent(st, ix, c, pk, auto = false) {
  const p = ix.people.get(pk), f = (p && cfgOf(st, p)?.[c.type]) || {}, dates = courseDayList(ix, c).map(d => ix.cal.iso[d]);
  if (!dates.length) return null;
  return { id: uid(), pk, type: c.type, title: c.title, courseKind: 'Lehrgang', courseId: c.id, auto, start: dates[0], end: dates[dates.length - 1], dates,
    trainee: f.trainee ?? 1, mentor: num(f.mentor), tec: num(f.tec), examiner: num(f.examiner), target: p?.target || c.target || '' };
}
/**
 * Trägt Personen als Teilnehmer ein. Berechnete und Szenariotermine dieser Personen, die im Lehrgangszeitraum liegen
 * oder dieselbe Art haben, weichen (sie werden bei der nächsten Berechnung neu verteilt). Liefert { added, removed }.
 */
export function joinCourse(st, ix, c, pks, { auto = false } = {}) {
  const have = new Set(courseMembers(st, c.id).map(e => e.pk)), fresh = [...new Set(pks)].filter(pk => ix.pi.has(pk) && !have.has(pk)), set = new Set(fresh), days = new Set(courseDayList(ix, c));
  let removed = 0;
  st.events = st.events.filter(e => {
    if (!set.has(e.pk) || !(e.auto || e.synthetic) || e.type === PREP) return true;
    const hit = e.type === c.type || (ix.evDays.get(e.id) || []).some(d => days.has(d));
    if (hit) removed++;
    return !hit;
  });
  const evs = fresh.map(pk => memberEvent(st, ix, c, pk, auto)).filter(Boolean);
  st.events.push(...evs);
  return { added: evs.length, removed };
}
/** Verschiebt einen Lehrgang samt Teilnehmerterminen auf einen neuen Zeitraum. */
export function moveCourse(st, ix, c, start, end) {
  c.start = start; c.end = end;
  const dates = courseDayList(ix, c).map(d => ix.cal.iso[d]);
  for (const e of st.events) if (e.courseId === c.id) { e.start = dates[0] || start; e.end = dates[dates.length - 1] || end; e.dates = dates.slice(); delete e.dayAreas; }
}
export function removeCourse(st, id) {
  const n = st.events.filter(e => e.courseId === id).length;
  st.events = st.events.filter(e => e.courseId !== id); st.courses = st.courses.filter(c => c.id !== id);
  return n;
}
/**
 * Beste Zeiträume für neue Lehrgänge: sucht den Starttag mit der größten möglichen Gruppe (bei Gleichstand die größte
 * Reserve, dann der früheste), merkt ihn vor und plant die übrigen Personen weiter, bis alle untergebracht sind
 * oder kein Zeitraum mehr die Mindestgröße erreicht.
 * o: { type, target, title, pks, len, from, to, minGroup, maxGroup, threshold, avoidSchool, freePolicy, maxCourses, nonOverlap }
 * Liefert { courses: [Bewertung je Vorschlag], left: [nicht untergebrachte Personen] }.
 */
export function proposeCourses(st, ix0, o) {
  const work = { ...st, events: st.events.slice() }, out = [], minGroup = Math.max(1, o.minGroup || 1), busy = [];
  if (o.nonOverlap !== false) for (const c of st.courses) if (c.type === o.type && (!o.target || !c.target || c.target === o.target)) busy.push([c.start, c.end]);
  let ix = ix0, pool = [...new Set(o.pks)].filter(pk => ix.pi.has(pk));
  while (pool.length >= minGroup && out.length < (o.maxCourses || 12)) {
    const window = new Map(pool.map(pk => [pk, courseWindow(work, ix, ix.people.get(pk), o.type)]));
    const res = courseSearch(work, ix, { threshold: o.threshold || 'zero', avoidSchool: !!o.avoidSchool, freePolicy: o.freePolicy || 'adjust', ignoreReplaceable: o.ignoreReplaceable !== false,
      group: 'max', minGroup, maxGroup: o.maxGroup || 0, pks: pool, from: o.from, to: o.to, len: o.len, window });
    const free = res.all.filter(a => a.ok && a.pks.length >= minGroup && !busy.some(([s, e]) => !(a.end < s || a.start > e)));
    const best = pickSlots(free, { sort: 'group', nonOverlap: false, max: 1, threshold: o.threshold || 'zero' })[0];
    if (!best) break;
    out.push(best);
    if (o.nonOverlap !== false) busy.push([best.start, best.end]);
    const placed = new Set(best.pks), days = new Set(best.days);
    work.events = work.events.filter(e => !(placed.has(e.pk) && (e.auto || e.synthetic) && e.type !== PREP && (e.type === o.type || (ix.evDays.get(e.id) || []).some(d => days.has(d)))));
    work.events.push(...courseEvents(ix, best, { name: o.title || o.type, type: o.type, kind: 'Lehrgang' }));
    pool = pool.filter(pk => !placed.has(pk));
    ix = buildIndex(work);
  }
  return { courses: out, left: pool };
}
