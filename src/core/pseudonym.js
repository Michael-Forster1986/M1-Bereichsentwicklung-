import { clone } from './util.js';
import { assignAliases } from './people.js';

// ---------- Pseudonymisierung ------------------------------------------
function rewritePk(st, map) {
  const f = pk => map.get(pk) ?? pk;
  st.events.forEach(e => { e.pk = f(e.pk); }); st.absences.forEach(a => { a.pk = f(a.pk); }); st.report.forEach(r => { r.pk = f(r.pk); });
  const ros = {}; for (const [pk, s] of Object.entries(st.roster)) ros[f(pk)] = s; st.roster = ros;
}
/** Ersetzt Personalnummern und Namen durch Pseudonyme; liefert die Schlüsseltabelle getrennt. */
export function pseudonymize(st) {
  const c = clone(st), map = new Map(), key = [];
  assignAliases(c.people);
  for (const p of c.people) { key.push({ alias: p.alias, pk: p.pk, name: p.name, org: p.org }); map.set(p.pk, p.alias); p.pk = p.alias; p.name = p.alias; p.org = ''; }
  rewritePk(c, map);
  c.realImports = c.realImports.map(r => ({ ...r, file: '' }));
  Object.assign(c.meta, { dataClass: 'pseudo', privacy: true, source: 'Pseudonymisierter Export' });
  return { state: c, key };
}
export function reidentify(st, keyRows) {
  const byAlias = new Map(keyRows.filter(r => r.alias && r.pk).map(r => [String(r.alias).trim(), r]));
  const map = new Map(); let hit = 0;
  const taken = new Set(st.people.map(p => p.pk));
  for (const p of st.people) {
    const r = byAlias.get(p.pk) || byAlias.get(p.alias);
    if (!r || (taken.has(String(r.pk).trim()) && String(r.pk).trim() !== p.pk)) continue;
    map.set(p.pk, String(r.pk).trim()); p.pk = String(r.pk).trim(); p.name = String(r.name || p.pk).trim(); p.org = String(r.org || '').trim(); hit++;
  }
  rewritePk(st, map);
  if (hit && hit === st.people.length) { st.meta.dataClass = 'real'; st.meta.privacy = false; }
  return hit;
}
