import { EPS, PREP } from './constants.js';
import { shiftIssue, shiftOk } from './measures.js';
import { isLocked } from './people.js';
import { assign, eventK } from './indexing.js';

// ---------- Konflikte --------------------------------------------------
export function findConflicts(st, ix) {
  const S = st.settings, out = [], c = ix.cap, L = ix.load;
  for (const e of st.events) {
    const i = ix.pi.get(e.pk), days = ix.evDays.get(e.id) || [], hard = new Map(), soft = new Map();
    const add = (m, r) => m.set(r, (m.get(r) || 0) + 1);
    if (i === undefined) { out.push({ id: e.id, pk: e.pk, type: e.type, start: e.start, end: e.end, hard: [['Person unbekannt', 1]], soft: [] }); continue; }
    if (isLocked(st.people[i])) add(hard, 'Person ausgeschlossen');
    if (!days.length) add(hard, 'Kein Arbeitstag im Zeitraum');
    for (const d of days) {
      const k0 = assign(ix, i, d);
      if (k0 < 0) { add(e.courseKind ? soft : hard, e.courseKind ? 'Dienstplananpassung (laut Plan frei)' : 'Kein Dienst / Frei'); continue; }
      if (ix.abs[i][d]) add(hard, 'Abwesenheit');
      if (!e.courseKind && !shiftOk(st, e.type, k0)) add(hard, shiftIssue(st, e.type));
      if (e.type !== PREP && ix.evByDay[d].some(x => x !== e && x.pk === e.pk && x.type !== PREP)) add(hard, 'Terminkollision');
      if (S.cap) {
        const k = eventK(ix, e, d, k0);
        if (!c.known[k][d]) add(hard, 'Kapazität offen');
        else if (c.pre[k][d] - L.loss[k][d] < c.min[k][d] - EPS) add(hard, 'Unter Minimum');
      }
    }
    if (hard.size || soft.size) out.push({ id: e.id, pk: e.pk, type: e.type, start: e.start, end: e.end, hard: [...hard], soft: [...soft] });
  }
  return out;
}
