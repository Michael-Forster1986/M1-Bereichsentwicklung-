import { AREAS, EPS, PREP } from './constants.js';
import { isCourse, shiftIssue, shiftOk } from './measures.js';
import { num } from './util.js';
import { cfgOf, creditOf } from './people.js';
import { assign, eventK } from './indexing.js';

// ---------- Maßnahme von Hand in den Jahresplan legen ------------------------------
// Grundlage für Ziehen und Ablegen: Was passiert an jedem Tag, wenn diese Maßnahme für diese Person
// an dieser Stelle liegt? Geprüft wird wie in der Konfliktprüfung – nur vorab, ohne den Stand zu ändern.

/** Dauer und Verlustfaktoren einer Maßnahme für eine Person: aus ihrem Ausbildungsweg, abzüglich bereits geplanter Tage. */
export function elementFor(st, ix, p, type) {
  const c = (cfgOf(st, p) || {})[type] || {}, total = Number.isInteger(c.days) && c.days > 0 ? c.days : 1;
  let have = creditOf(p, type);
  for (const e of ix.evByPerson.get(p.pk) || []) if (e.type === type) have += (ix.evDays.get(e.id) || []).length;
  return { days: total - have > 0 ? total - have : total, total, have, trainee: c.trainee ?? (type === PREP ? 0 : 1), mentor: num(c.mentor), tec: num(c.tec), examiner: num(c.examiner) };
}
/**
 * o: { pk, type, start (Tagesindex), len (Tage), factors { trainee, mentor, tec, examiner }, moveId (Termin, der verschoben wird),
 *      spread (true: Tage mit zu knapper Kapazität überspringen und dafür nach hinten ausweichen) }
 * Lehrgänge sind ein fester Block: jeder Arbeitstag ab dem Start zählt; Abwesenheit oder Kollision sind dort Befunde.
 * Alle anderen Maßnahmen belegen – wie im Planer – ab dem Start die nächsten Tage, an denen die Person im passenden
 * Dienst und frei ist; freie Tage, Abwesenheiten und belegte Tage werden übersprungen. Geprüft wird dann die Kapazität.
 * Liefert { days, perDay: [{ d, state 'ok'|'warn'|'crit'|'note', why, after, zero, min }], ok, crit, warn, notes, skipped, short, start, end }.
 */
export function checkPlacement(st, ix, o) {
  const i = ix.pi.get(o.pk), S = st.settings, c = ix.cap, L = ix.load, f = o.factors || {}, course = isCourse(st, o.type);
  const res = { days: [], perDay: [], ok: false, crit: 0, warn: 0, notes: 0, skipped: 0, short: false, start: '', end: '', len: o.len };
  if (i === undefined || !(o.len > 0)) { res.short = true; return res; }
  const m = num(f.mentor), t = num(f.tec), x = num(f.examiner), sum = num(f.trainee) + m + t + x;
  // Last des Termins, der gerade verschoben wird, zählt an seinen bisherigen Tagen nicht mit
  const own = new Map(), move = o.moveId ? ix.evById.get(o.moveId) : null;
  if (move) {
    const em = num(move.mentor), et = num(move.tec), ex = num(move.examiner), es = num(move.trainee) + em + et + ex;
    for (const d of ix.evDays.get(move.id) || []) { const k0 = assign(ix, i, d); if (k0 >= 0) own.set(eventK(ix, move, d, k0) * 1000 + d, [es, em, et, ex]); }
  }
  const look = d => {
    const why = [], k = assign(ix, i, d), r = { d, state: 'ok', why, k };
    const bad = w => { why.push(w); r.state = 'crit'; }, soft = w => { why.push(w); if (r.state === 'ok') r.state = 'warn'; };
    const out = w => { if (course) bad(w); else r.skip = w; };              // außerhalb von Lehrgängen kommt so ein Tag gar nicht in Frage
    if (ix.abs[i][d]) out('Abwesenheit');
    if (o.type !== PREP && ix.evByDay[d].some(e => e.pk === o.pk && e.type !== PREP && e.id !== o.moveId)) out('Terminkollision');
    if (k < 0) {
      if (course) { why.push('laut Dienstplan frei – Dienstplananpassung'); if (r.state === 'ok') r.state = 'note'; }
      else r.skip = 'Kein Dienst / Frei';
      return r;
    }
    if (!course && !shiftOk(st, o.type, k)) r.skip = shiftIssue(st, o.type);
    if (r.skip) return r;
    const mine = own.get(k * 1000 + d) || [0, 0, 0, 0];
    if (m > 0 && S.mentorLimit != null && L.mentor[k][d] - mine[1] + m > S.mentorLimit + EPS) (S.cap ? bad : soft)('Mentoren ausgeschöpft');
    if (t > 0 && S.tecLimit != null && L.tec[k][d] - mine[2] + t > S.tecLimit + EPS) (S.cap ? bad : soft)('TEC ausgeschöpft');
    if (x > 0 && S.examinerLimit != null && L.exam[k][d] - mine[3] + x > S.examinerLimit + EPS) (S.cap ? bad : soft)('Prüfer ausgeschöpft');
    if (!c.known[k][d]) { if (S.cap) bad('Kapazität nicht prüfbar'); else why.push('Kapazität nicht prüfbar'); return r; }
    r.after = c.pre[k][d] - (L.loss[k][d] - mine[0]) - sum; r.zero = c.zero[k][d]; r.min = c.min[k][d]; r.area = AREAS[(k / 3) | 0];
    if (r.after < r.min - EPS) bad('unter Minimum');
    else if (r.after < r.zero - EPS) soft('unter 0-Punkt');
    return r;
  };
  const allowWarn = S.goal === 'min' && S.preferZero === false;
  const take = d => {
    if (!ix.work[d]) return;
    const r = look(d);
    if (r.skip) { res.skipped++; return; }
    if (o.spread && (r.state === 'crit' || (r.state === 'warn' && !allowWarn))) return;
    res.days.push(d); res.perDay.push(r);
    if (r.state === 'crit') res.crit++; else if (r.state === 'warn') res.warn++; else if (r.state === 'note') res.notes++;
  };
  // o.days: die Tage stehen fest (Lehrgang mit Modulen – dazwischen liegen freie Tage); sonst ab o.start die nächsten o.len Tage
  if (Array.isArray(o.days)) for (const d of o.days) take(d);
  else for (let d = Math.max(0, o.start); d < ix.n && res.days.length < o.len; d++) take(d);
  res.short = res.days.length < o.len;
  if (res.days.length) { res.start = ix.cal.iso[res.days[0]]; res.end = ix.cal.iso[res.days[res.days.length - 1]]; }
  res.ok = !res.short && !res.crit && !res.warn;
  return res;
}
