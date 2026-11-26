import { EPS, PREP } from './constants.js';
import { num, uid } from './util.js';
import { validDate } from './dates.js';
import { assign, capInfo, eventK } from './indexing.js';

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
    const i = ix.pi.get(pk), mine = [], cells = [];
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
