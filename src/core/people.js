import { AREAS, CLUSTERS, LEVELS, PATTERNS, SHIFTS, TARGETS, TYPES } from './constants.js';
import { clamp, fin, num, truthy } from './util.js';
import { normDate } from './dates.js';

// ---------- Personen ---------------------------------------------------
export const isLocked = p => !!p.locked || p.cluster === 'ausgeschlossen';
export function parseCluster(v) {
  const m = String(v ?? '').trim().match(/^(ausgeschlossen|offen|4A|4B|[1-5])(?=$|[\s·.:\-–—(])/i);
  if (!m) return '';
  const c = m[1].toLowerCase(), k = c === '4a' ? '4A' : c === '4b' ? '4B' : c;
  return CLUSTERS[k] ? k : '';
}
export function normShift(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['f', 'früh', 'frueh', 'fruh', 'frühdienst', 'early'].includes(s)) return 'Früh';
  if (['s', 'spät', 'spaet', 'spat', 'spätdienst', 'late'].includes(s)) return 'Spät';
  if (['n', 'nacht', 'nachtdienst', 'night'].includes(s)) return 'Nacht';
  if (['', '-', 'x', 'off', 'frei', 'free', '/', '0'].includes(s)) return 'Frei';
  return null;
}
export function normPerson(p) {
  const cluster = parseCluster(p.cluster) || 'offen';
  const out = {
    pk: String(p.pk ?? '').trim(), name: String(p.name ?? '').trim(), alias: String(p.alias ?? '').trim(),
    org: String(p.org ?? '').trim(), rights: String(p.rights ?? '').trim() || '—',
    cluster, locked: truthy(p.locked) || cluster === 'ausgeschlossen',
    area: AREAS.includes(p.area) ? p.area : 'M1',
    shift: SHIFTS.includes(p.shift) ? p.shift : (SHIFTS.includes(normShift(p.shift)) ? normShift(p.shift) : 'Früh'),
    start: normDate(p.start), target: TARGETS.includes(p.target) ? p.target : '', level: LEVELS.includes(p.level) ? p.level : '',
    priority: clamp(Math.round(num(p.priority)) || 3, 1, 9),
    patterns: Object.fromEntries(PATTERNS.map(k => [k, String((p.patterns && p.patterns[k]) ?? p[k] ?? '—').trim() || '—'])),
    confirmed: truthy(p.confirmed), gate: normDate(p.gate)
  };
  if (!out.name) out.name = out.pk;
  if (Array.isArray(p.rotation) && p.rotation.length === 3) out.rotation = p.rotation.map(v => clamp(Math.round(num(v)), 0, 260));
  if (p.customRoute && Array.isArray(p.customRoute.steps) && p.customRoute.config) {
    const cfg = {};
    for (const t of TYPES) cfg[t] = normCfg(p.customRoute.config[t]);
    out.customRoute = { steps: TYPES.filter(t => p.customRoute.steps.includes(t)), config: cfg };
  }
  if (p.targetAssumed) out.targetAssumed = true;
  const credit = normCredit(p.credit);
  if (credit) out.credit = credit;
  return out;
}
export const normCfg = c => ({
  days: c && Number.isInteger(c.days) && c.days >= 0 && c.days <= 260 ? c.days : null,
  trainee: c && c.trainee != null && fin(+c.trainee) ? clamp(+c.trainee, 0, 5) : null,
  mentor: c ? clamp(num(c.mentor), 0, 5) : 0, tec: c ? clamp(num(c.tec), 0, 5) : 0, examiner: c ? clamp(num(c.examiner), 0, 5) : 0
});
/** Vorleistung: bereits erbrachte Tage je Maßnahme aus Vorjahren ({ Maßnahme: Tage }); null, wenn keine. */
export function normCredit(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  for (const t of TYPES) { const v = Math.round(num(c[t])); if (v > 0) out[t] = clamp(v, 1, 999); }
  return Object.keys(out).length ? out : null;
}
/** Bereits erbrachte Tage einer Person für eine Maßnahme. */
export const creditOf = (p, t) => (p.credit && p.credit[t]) || 0;
/** Vergibt Pseudonyme P-001… in zufälliger Reihenfolge (keine Rückschlüsse aus der Sortierung). */
export function assignAliases(people, rnd = Math.random) {
  const used = new Set(people.map(p => p.alias).filter(Boolean));
  let next = 1;
  for (const a of used) { const m = a.match(/^P-(\d+)$/); if (m) next = Math.max(next, +m[1] + 1); }
  const todo = people.filter(p => !p.alias);
  for (let i = todo.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [todo[i], todo[j]] = [todo[j], todo[i]]; }
  const width = Math.max(3, String(next + todo.length).length);
  for (const p of todo) { p.alias = 'P-' + String(next++).padStart(width, '0'); }
}
export const routeOf = (st, p) => p.customRoute?.steps || (p.cluster === '5' && p.level === 'TEC' ? ['Theorie', 'Praxis'] : st.routes[p.cluster] || null);
export const cfgOf = (st, p) => p.customRoute?.config || st.config[p.cluster] || null;
