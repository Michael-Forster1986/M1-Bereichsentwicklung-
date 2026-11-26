import { AREAS, EPS, GATE_TYPES, LOGBOOK, PREP, ROUTE_CLUSTERS } from './constants.js';
import { clamp, num, uid } from './util.js';
import { fmtDE, validDate } from './dates.js';
import { cfgOf, isLocked, routeOf } from './people.js';
import { addLoad, assign, newLoad } from './indexing.js';

// ---------- Planer -----------------------------------------------------
/**
 * Verteilt die Ausbildungswege auf zulässige Tage. Fixierte Termine zählen zum Weg und
 * werden nie doppelt erzeugt. opt.order = Reihenfolge der Personalnummern.
 */
export function runPlan(st, ix, opt = {}) {
  const S = st.settings, cal = ix.cal, n = ix.n, cap = ix.cap;
  const replaceSynthetic = !!opt.replaceSynthetic, allowPartial = opt.allowPartial ?? S.allowPartial !== false;
  // Szenariotermine werden nur ersetzt, wenn der Planer sie neu erzeugen kann (Schritt gehört zum Weg der Person);
  // simulierte Kursrahmen außerhalb des Wegs bleiben als Voraussetzung stehen.
  const regen = e => { const p = ix.people.get(e.pk), r = p && routeOf(st, p); return !!r && (r.includes(e.type) || e.type === PREP); };
  const keep = st.events.filter(e => !e.auto && !(replaceSynthetic && e.synthetic && regen(e)));
  const L = newLoad(n), occ = new Array(st.people.length).fill(null), fixedBy = new Map();
  const occOf = i => occ[i] || (occ[i] = new Uint8Array(n));
  for (const e of keep) {
    const ds = ix.evDays.get(e.id) || [], i = ix.pi.get(e.pk);
    addLoad(ix, L, e, ds);
    if (i === undefined) continue;
    if (e.type !== PREP) { const o = occOf(i); for (const d of ds) o[d] = 1; }
    let list = fixedBy.get(e.pk); if (!list) fixedBy.set(e.pk, list = []); list.push(e);
  }
  const events = keep.slice(), report = [], span = new Map();
  let mode = S.goal;                                    // aktuell geprüfte Grenze: 'zero' oder 'min'
  const buf = Math.max(0, num(S.buffer));              // Planungspuffer in Köpfen über der Grenze
  const thr = (k, d) => (mode === 'zero' ? cap.zero[k][d] : cap.min[k][d]) + buf;
  const dayCount = e => (ix.evDays.get(e.id) || []).length;
  const endIdx = e => { const s = span.get(e.id); if (s) return s[1]; const ds = ix.evDays.get(e.id); return ds && ds.length ? ds[ds.length - 1] : cal.idx(e.end); };
  const startDefault = clamp(validDate(S.start) ? cal.idx(S.start) : 0, 0, n - 1);
  const seen = new Set(), seq = [];
  for (const pk of (opt.order || [])) if (ix.people.has(pk) && !seen.has(pk)) { seen.add(pk); seq.push(pk); }
  for (const p of st.people) if (!seen.has(p.pk)) seq.push(p.pk);
  // Stufen: 1) 0-Punkt strikt, 2) 0-Punkt bevorzugt (nur Fehltage bis Minimum), 3) Minimum
  const tiers = S.cap && S.goal === 'min' && S.preferZero !== false ? ['zero', 'mixed', 'min'] : [S.goal];

  const fits = (k, d, c, sum) => {
    if (c.mentor > 0 && S.mentorLimit != null && L.mentor[k][d] + c.mentor > S.mentorLimit + EPS) return false;
    if (c.tec > 0 && S.tecLimit != null && L.tec[k][d] + c.tec > S.tecLimit + EPS) return false;
    if (c.examiner > 0 && S.examinerLimit != null && L.exam[k][d] + c.examiner > S.examinerLimit + EPS) return false;
    if (S.cap) {
      if (!cap.known[k][d]) return false;
      const total = L.loss[k][d] + sum;
      if (cap.pre[k][d] - total < thr(k, d) - EPS) return false;
      if (S.absenceLimit != null) {
        const g = cap.gross[k][d], a = cap.absent[k][d];
        if (!(g > 0)) return false;
        const q = (num(S.sick[cal.month[d]]) + num(S.stress)) / 100;
        if ((a + (g - a) * q + total) / g > S.absenceLimit / 100 + EPS) return false;
      }
    }
    return true;
  };

  for (const pk of seq) {
    const p = ix.people.get(pk), i = ix.pi.get(pk), fixed = fixedBy.get(pk) || [];
    const open = reason => report.push({ pk, status: 'open', reason });
    if (isLocked(p) || p.cluster === 'offen') { report.push({ pk, status: 'skipped', reason: isLocked(p) ? 'Ausgeschlossen / gesperrt' : 'Cluster offen' }); continue; }
    const route = routeOf(st, p), cfg = cfgOf(st, p);
    if (!route || !route.length || !cfg) { open('Kein Ausbildungsweg hinterlegt'); continue; }
    if (S.confirmedOnly && !p.confirmed) { open('Voraussetzungen nicht bestätigt; fixierte Termine bleiben erhalten'); continue; }
    if (p.cluster === '5') {
      if (!p.target || !p.level) { open('Zielmuster und Zielstufe fehlen'); continue; }
      if (p.target === 'A320') { open('A320 gemäß Vorgängerregel zurückgestellt'); continue; }
      if (p.target.includes('Kombikurs') && p.level !== 'TEC') { open('Kombikurs nur für Zielstufe TEC'); continue; }
    }
    const needsFrame = ['3', '4B'].includes(p.cluster);
    if (needsFrame && !p.gate && !fixed.some(e => e.type === 'Praxis')) { open('Praxis-Kursrahmen oder Abschlussdatum aller Doings fehlt'); continue; }
    const o = occOf(i);
    const mk = (t, ds, dayAreas, c, partial) => {
      const e = { id: uid(), pk, type: t, auto: true, start: cal.iso[ds[0]], end: cal.iso[ds[ds.length - 1]],
        dates: ds.map(d => cal.iso[d]), trainee: c.trainee, mentor: c.mentor, tec: c.tec, examiner: c.examiner, target: p.target || '' };
      if (dayAreas && Object.keys(dayAreas).length) e.dayAreas = dayAreas;
      if (partial) e.partial = true;
      span.set(e.id, [ds[0], ds[ds.length - 1]]);
      return e;
    };

    /** Ein Planungsversuch für die Person; verändert L und o, liefert bei Misserfolg alles zurückgerollt. */
    const attempt = tier => {
      mode = tier === 'mixed' ? 'zero' : tier;
      let cursor = p.start && validDate(p.start) ? clamp(cal.idx(p.start), 0, n) : startDefault;
      if (needsFrame) for (const e of fixed) if (e.type === 'Praxis') cursor = Math.max(cursor, endIdx(e) + 1);
      const local = [], log = [];
      let reason = '', hardFail = false, failed = false, remaining = null;
      const undo = cnt => { while (cnt-- > 0 && log.length) { const [k, d, sum, m, t, x, occupied] = log.pop(); L.loss[k][d] -= sum; L.mentor[k][d] -= m; L.tec[k][d] -= t; L.exam[k][d] -= x; if (occupied) o[d] = 0; } };
      for (let r = 0; r < route.length; r++) {
        const t = route[r], c = cfg[t];
        if (!c || !Number.isInteger(c.days) || c.days < 1 || c.trainee == null) { reason = 'Dauer oder Produktivitätsverlust fehlt: ' + t; hardFail = true; break; }
        const fs = fixed.filter(e => e.type === t), count = fs.reduce((s, e) => s + dayCount(e), 0);
        for (const e of fs) cursor = Math.max(cursor, endIdx(e) + 1);
        if (count >= c.days) continue;
        const rot = t === LOGBOOK && Array.isArray(p.rotation) ? p.rotation : null;
        if (rot && rot[0] + rot[1] + rot[2] !== c.days) { reason = 'Rotationstage M1/M2/M3 passen nicht zur Logbook-Dauer'; hardFail = true; break; }
        const need = c.days - count;
        if (t === 'ICA') {
          let gate = p.gate && validDate(p.gate) ? cal.idx(p.gate) : -1;
          for (const e of fixed) if (GATE_TYPES.has(e.type)) gate = Math.max(gate, endIdx(e));
          for (const e of local) if (GATE_TYPES.has(e.type)) gate = Math.max(gate, endIdx(e));
          if (cursor <= gate) cursor = gate + 1;
        }
        const sum = c.trainee + c.mentor + c.tec + c.examiner, ds = [], dayAreas = {};
        const scan = () => {
          for (let d = Math.max(0, cursor); d < n && ds.length < need; d++) {
            if (!ix.work[d] || ix.abs[i][d] || o[d] || (S.avoidSchool && ix.school[d])) continue;
            let k = assign(ix, i, d);
            if (k < 0) continue;
            if (rot) { const j = ds.length + count, a = j < rot[0] ? 0 : j < rot[0] + rot[1] ? 1 : 2; k = a * 3 + k % 3; }
            if (t !== LOGBOOK && k % 3 !== 0) continue;              // Kurs-/Prüfungstage nur im Frühdienst
            if (!fits(k, d, c, sum)) continue;
            ds.push(d); o[d] = 1;
            if (rot) dayAreas[cal.iso[d]] = AREAS[(k / 3) | 0];
            L.loss[k][d] += sum; L.mentor[k][d] += c.mentor; L.tec[k][d] += c.tec; L.exam[k][d] += c.examiner;
            log.push([k, d, sum, c.mentor, c.tec, c.examiner, 1]);
          }
        };
        scan();
        if (ds.length < need && tier === 'mixed' && !rot) { mode = 'min'; scan(); mode = 'zero'; ds.sort((a, b) => a - b); }
        if (ds.length < need) {
          failed = true;
          reason = 'Nicht genügend zulässige Tage für ' + t + ' (' + ds.length + '/' + need + ')';
          remaining = [t + ': ' + (need - ds.length) + ' Tage'];
          for (let q = r + 1; q < route.length; q++) {
            const c2 = cfg[route[q]], have = fixed.filter(e => e.type === route[q]).reduce((s, e) => s + dayCount(e), 0);
            if (c2 && Number.isInteger(c2.days) && c2.days - have > 0) remaining.push(route[q] + ': ' + (c2.days - have) + ' Tage');
          }
          if (allowPartial && ds.length) local.push(mk(t, ds, dayAreas, c, true)); else undo(ds.length);
          break;
        }
        local.push(mk(t, ds, dayAreas, c, false));
        cursor = ds[ds.length - 1] + 1;
      }
      if (hardFail || (failed && (!allowPartial || !local.length))) {
        undo(log.length);
        return { state: 'blocked', hardFail, reason: reason + (failed && local.length ? '; Kette nicht übernommen' : ''), remaining };
      }
      // Vorbereitung vor einer neu geplanten ICA: reiner Prüfer-/TEC-Aufwand, Teilnehmer bleibt produktiv
      const ica = local.find(e => e.type === 'ICA');
      if (ica && !fixed.some(e => e.type === PREP) && !local.some(e => e.type === PREP)) {
        const tec = p.cluster === '1' ? 1 : 0, exam = 1 - tec;
        let prep = null;
        for (const m of (tier === 'mixed' ? ['zero', 'min'] : [mode])) {
          mode = m;
          for (let d = span.get(ica.id)[0] - 1; d >= 0 && !prep; d--) {
            if (!ix.work[d] || ix.abs[i][d]) continue;
            const k = assign(ix, i, d);
            if (k < 0 || k % 3 !== 0) continue;
            if (tec && S.tecLimit != null && L.tec[k][d] + tec > S.tecLimit + EPS) continue;
            if (exam && S.examinerLimit != null && L.exam[k][d] + exam > S.examinerLimit + EPS) continue;
            if (S.cap && (!cap.known[k][d] || cap.pre[k][d] - L.loss[k][d] - 1 < thr(k, d) - EPS)) continue;
            prep = mk(PREP, [d], null, { trainee: 0, mentor: 0, tec, examiner: exam }, false);
            L.loss[k][d] += 1; L.tec[k][d] += tec; L.exam[k][d] += exam; log.push([k, d, 1, 0, tec, exam, 0]);
          }
          if (prep) break;
        }
        if (!prep) { undo(log.length); return { state: 'blocked', reason: 'Vorbereitung vor ICA nicht möglich; Kette nicht übernommen' }; }
        local.push(prep);
      }
      return { state: failed ? 'partial' : 'ok', local, reason, remaining, undo: () => undo(log.length) };
    };

    // Erste vollständige Stufe gewinnt; sonst die Stufe mit den meisten planbaren Tagen (bei Gleichstand die schonendere).
    let res = null, bestTier = 0, bestDays = -1;
    const daysOf = r => r.local ? r.local.reduce((s, e) => s + e.dates.length, 0) : 0;
    for (let ti = 0; ti < tiers.length; ti++) {
      res = attempt(tiers[ti]);
      if (res.state === 'ok' || res.hardFail) { bestTier = ti; break; }
      if (daysOf(res) > bestDays) { bestDays = daysOf(res); bestTier = ti; }
      if (ti < tiers.length - 1 || bestTier !== ti) { if (res.undo) res.undo(); res = null; }
    }
    if (!res) res = attempt(tiers[bestTier]);
    mode = S.goal;
    if (res.state === 'blocked') { report.push({ pk, status: 'blocked', reason: res.reason, remaining: res.remaining || undefined }); continue; }
    const local = res.local;
    events.push(...local);
    const lastEnd = local.filter(e => e.type !== PREP).map(e => e.end).sort().pop();
    if (res.state === 'partial') report.push({ pk, status: 'partial', reason: res.reason + ' · ' + local.length + ' Maßnahmen bis ' + fmtDE(lastEnd), remaining: res.remaining });
    else if (local.length) report.push({ pk, status: 'planned', reason: local.length + ' neue Maßnahmen · Abschluss ' + fmtDE(lastEnd) + (fixed.length ? ' · ' + fixed.length + ' fixierte Termine berücksichtigt' : '') });
    else report.push({ pk, status: 'kept', reason: 'Weg durch ' + fixed.length + ' fixierte Termine abgedeckt; keine neuen Termine nötig' });
  }
  return { events, report, ledger: L };
}

/** Bewertet ein Planergebnis: Vollständigkeit, kritische Diensttage, Abschlusszeitpunkte. */
export function scorePlan(st, ix, res) {
  const sc = { complete: 0, partial: 0, blocked: 0, open: 0, skipped: 0, days: 0, underMin: 0, underZero: 0, endSum: 0, worstMin: Infinity, worstZero: Infinity };
  for (const r of res.report) {
    if (r.status === 'planned' || r.status === 'kept') sc.complete++;
    else if (sc[r.status] !== undefined) sc[r.status]++;
  }
  for (const e of res.events) if (e.auto) { sc.days += e.dates.length; sc.endSum += ix.cal.idx(e.end); }
  const c = ix.cap, L = res.ledger;
  for (let k = 0; k < 9; k++) for (let d = 0; d < ix.n; d++) {
    if (!c.known[k][d]) continue;
    const net = c.pre[k][d] - L.loss[k][d], dm = net - c.min[k][d], dz = net - c.zero[k][d];
    if (dm < -EPS) sc.underMin++;
    if (dz < -EPS) sc.underZero++;
    if (dm < sc.worstMin) sc.worstMin = dm;
    if (dz < sc.worstZero) sc.worstZero = dz;
  }
  return sc;
}
export const betterScore = (a, b) => {
  if (!b) return true;
  for (const [key, dir] of [['complete', 1], ['underMin', -1], ['days', 1], ['underZero', -1], ['endSum', -1]]) {
    if (a[key] !== b[key]) return dir > 0 ? a[key] > b[key] : a[key] < b[key];
  }
  return false;
};
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Reihenfolgevarianten: Priorität bleibt Hauptkriterium, innerhalb gleicher Priorität wird variiert. */
export function planVariants(st, count = 16, seed = 7) {
  const pri = p => Number(p.priority) || 3;
  const el = st.people.filter(p => !isLocked(p) && p.cluster !== 'offen');
  const routeDays = p => { const r = routeOf(st, p), c = cfgOf(st, p); return r && c ? r.reduce((s, t) => s + (c[t]?.days || 0), 0) : 0; };
  const pos = new Map(st.people.map((p, i) => [p.pk, i]));
  const by = (name, cmp) => ({ name, order: el.slice().sort((a, b) => pri(a) - pri(b) || cmp(a, b) || pos.get(a.pk) - pos.get(b.pk)).map(p => p.pk) });
  const ci = p => ROUTE_CLUSTERS.indexOf(p.cluster);
  const list = [
    by('Priorität, dann Listenreihenfolge', () => 0),
    by('Priorität, kurze Wege zuerst', (a, b) => routeDays(a) - routeDays(b)),
    by('Priorität, lange Wege zuerst', (a, b) => routeDays(b) - routeDays(a)),
    by('Priorität, Cluster aufsteigend', (a, b) => ci(a) - ci(b)),
    by('Priorität, Cluster absteigend', (a, b) => ci(b) - ci(a)),
    by('Priorität, früher Individualstart zuerst', (a, b) => (a.start || st.settings.start) < (b.start || st.settings.start) ? -1 : (a.start || st.settings.start) > (b.start || st.settings.start) ? 1 : 0)
  ];
  const rnd = mulberry(seed);
  for (let v = 1; list.length < count; v++) {
    const key = new Map(el.map(p => [p.pk, rnd()]));
    list.push(by('Priorität, Zufallsvariante ' + v, (a, b) => key.get(a.pk) - key.get(b.pk)));
  }
  return list.slice(0, Math.max(1, count));
}
/** Probiert mehrere Reihenfolgen und liefert das beste Ergebnis (kein globaler Optimalitätsnachweis). */
export function optimizePlan(st, ix, opt = {}) {
  const variants = planVariants(st, opt.variants || 16, opt.seed || 7);
  let best = null; const tried = [];
  for (const v of variants) {
    const res = runPlan(st, ix, { ...opt, order: v.order }), score = scorePlan(st, ix, res);
    tried.push({ name: v.name, score });
    if (!best || betterScore(score, best.score)) best = { ...res, score, variant: v.name };
  }
  best.tried = tried;
  return best;
}
