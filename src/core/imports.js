import { ABS_TYPES, AREAS, PATTERNS, PREP, SHIFTS, TYPES } from './constants.js';
import { clamp, num, truthy, uid } from './util.js';
import { addDays, fmtDE, makeCalendar, normDate } from './dates.js';
import { assignAliases, normPerson, normShift, parseCluster } from './people.js';
import { decodeRoster, encodeRoster, rosterCode } from './roster.js';
import { TEMPLATES, rowsToObjects } from './csv.js';

// ---------- Importprüfungen --------------------------------------------
/** Liefert {rows, errors, warnings}. Fehler blockieren die Übernahme. */
export function checkPeople(objs, head) {
  const errors = [], warnings = [], rows = [], seen = new Set();
  if (!head.includes('pk')) errors.push('Spalte „pk“ bzw. „Personalnummer“ fehlt');
  objs.forEach((r, i) => {
    const pk = String(r.pk ?? '').trim();
    if (!pk) return;
    if (seen.has(pk)) { errors.push('Zeile ' + (i + 2) + ': Personalnummer doppelt'); return; }
    seen.add(pk);
    if (head.includes('cluster') && String(r.cluster).trim() && !parseCluster(r.cluster)) warnings.push('Zeile ' + (i + 2) + ': Cluster nicht erkannt, als „offen“ übernommen');
    rows.push(r);
  });
  if (!rows.length && !errors.length) errors.push('Keine Personenzeilen gefunden');
  return { rows, errors, warnings, fields: head.filter(h => TEMPLATES.people.includes(h) || h === 'alias') };
}
/** Übernimmt Stammdaten. mode 'replace' ersetzt die Liste, 'merge' aktualisiert nur gelieferte Spalten. */
export function applyPeople(st, chk, mode) {
  const info = { added: 0, updated: 0, removed: 0, reclustered: 0, skippedLocked: 0 };
  const byPk = new Map(st.people.map(p => [p.pk, p])), fields = new Set(chk.fields);
  const next = [];
  for (const r of chk.rows) {
    const pk = String(r.pk).trim(), old = byPk.get(pk);
    if (!old) { next.push(normPerson(r)); info.added++; continue; }
    const merged = { ...old };
    for (const f of fields) {
      if (f === 'pk') continue;
      if (PATTERNS.includes(f)) merged.patterns = { ...merged.patterns, [f]: String(r[f]).trim() || '—' };
      else if (f === 'cluster') {
        const c = parseCluster(r.cluster) || 'offen';
        if (c !== old.cluster) {
          if (old.locked && c !== 'ausgeschlossen' && !fields.has('locked')) { info.skippedLocked++; continue; }
          merged.cluster = c; info.reclustered++;
          if (!fields.has('target')) merged.target = '';
          if (!fields.has('level')) merged.level = '';
          merged.confirmed = false; delete merged.rotation; delete merged.customRoute; delete merged.credit;
        }
      } else merged[f] = r[f];
    }
    const np = normPerson(merged); np.alias = old.alias;
    if (!fields.has('locked')) np.locked = old.locked || np.cluster === 'ausgeschlossen';
    next.push(np); info.updated++;
    byPk.delete(pk);
  }
  if (mode === 'merge') {
    const order = new Map(next.map(p => [p.pk, p]));
    st.people = st.people.map(p => order.get(p.pk) || p).concat(next.filter(p => !st.people.some(o => o.pk === p.pk)));
  } else {
    info.removed = byPk.size; st.people = next;
    const keep = new Set(next.map(p => p.pk));
    st.events = st.events.filter(e => keep.has(e.pk)); st.absences = st.absences.filter(a => keep.has(a.pk));
    st.report = st.report.filter(r => keep.has(r.pk));
    for (const pk of Object.keys(st.roster)) if (!keep.has(pk)) delete st.roster[pk];
  }
  assignAliases(st.people);
  return info;
}
/** Dienstplan lang (pk;date;area;shift) oder breit (pk;Datum1;Datum2;…). */
export function checkRoster(st, rawRows, scope, allowGaps) {
  const errors = [], warnings = [], cal = makeCalendar(st.meta.year);
  const known = new Set(st.people.map(p => p.pk)), byName = new Map(st.people.map(p => [p.name, p.pk]));
  const a = cal.idx(scope.start), b = cal.idx(scope.end), days = b - a + 1;
  const data = new Map();     // pk → Uint8Array(days) mit Code+1 (0 = fehlt)
  const err = m => { if (errors.length < 25) errors.push(m); else if (errors.length === 25) errors.push('… weitere Fehler'); };
  const put = (pkRaw, date, area, shiftRaw, line) => {
    let pk = String(pkRaw ?? '').trim();
    if (!known.has(pk) && byName.has(pk)) pk = byName.get(pk);
    if (!known.has(pk)) return err('Zeile ' + line + ': unbekannte Personalnummer');
    const d = normDate(date);
    if (!d) return err('Zeile ' + line + ': Datum ungültig');
    const di = cal.idx(d);
    if (di < a || di > b) return;                                   // außerhalb des gewählten Zeitraums: ignorieren
    let ar = String(area || '').trim() || 'M1', sh = String(shiftRaw ?? '').trim();
    const m = sh.match(/^(M[123])\s*[:/ ]\s*(.+)$/i);
    if (m) { ar = m[1].toUpperCase(); sh = m[2]; }
    const shift = normShift(sh);
    if (!shift || !AREAS.includes(ar)) return err('Zeile ' + line + ': Dienst oder Bereich ungültig (' + sh + ')');
    let arr = data.get(pk); if (!arr) data.set(pk, arr = new Uint8Array(days));
    if (arr[di - a]) return err('Zeile ' + line + ': doppelte Dienstzuordnung am ' + fmtDE(d));
    arr[di - a] = rosterCode(ar, shift) + 1;
  };
  if (rawRows.length < 2) { errors.push('Datei enthält keine Datenzeilen'); return { errors, warnings }; }
  const head = rawRows[0], dateCols = head.slice(1).map(normDate);
  const wide = dateCols.length >= 2 && dateCols.filter(Boolean).length >= dateCols.length * 0.8;
  if (wide) {
    rawRows.slice(1).forEach((r, i) => dateCols.forEach((d, c) => { if (d) put(r[0], d, 'M1', r[c + 1] ?? '', i + 2); }));
  } else {
    const { head: h, rows } = rowsToObjects(rawRows);
    for (const f of ['pk', 'date', 'shift']) if (!h.includes(f)) errors.push('Spalte „' + f + '“ fehlt');
    if (!errors.length) rows.forEach((r, i) => put(r.pk, r.date, r.area, r.shift, i + 2));
  }
  let cells = 0;
  for (const arr of data.values()) for (const v of arr) if (v) cells++;
  const expected = st.people.length * days;
  if (!errors.length && cells !== expected) {
    const msg = 'Dienstplan unvollständig: ' + cells + ' von ' + expected + ' Personentagen (jede Person, jeder Tag, auch Frei)';
    if (allowGaps) warnings.push(msg + ' – Lücken bleiben ohne Zuordnung'); else errors.push(msg);
  }
  return { errors, warnings, data, scope, a, b, cells, expected, format: wide ? 'Matrix (breit)' : 'Liste (lang)', persons: data.size };
}
export function applyRoster(st, chk) {
  const n = makeCalendar(st.meta.year).n;
  for (const p of st.people) {
    const cur = decodeRoster(st.roster[p.pk], n), inc = chk.data.get(p.pk);
    for (let d = chk.a; d <= chk.b; d++) cur[d] = inc && inc[d - chk.a] ? inc[d - chk.a] - 1 : 0;
    st.roster[p.pk] = encodeRoster(cur);
  }
}
export function checkAbsences(st, objs, head, scope) {
  const errors = [], warnings = [], rows = [], seen = new Set(), known = new Set(st.people.map(p => p.pk));
  for (const f of ['pk', 'start', 'end']) if (!head.includes(f)) errors.push('Spalte „' + f + '“ fehlt');
  if (errors.length) return { errors, warnings, rows };
  objs.forEach((r, i) => {
    const pk = String(r.pk ?? '').trim(), s = normDate(r.start), e = normDate(r.end);
    if (!pk && !String(r.start).trim() && !String(r.end).trim()) return;
    const line = 'Zeile ' + (i + 2) + ': ';
    if (errors.length > 25) return;
    if (!known.has(pk)) return errors.push(line + 'unbekannte Personalnummer');
    if (!s || !e || e < s) return errors.push(line + 'Zeitraum ungültig');
    let type = String(r.type || 'Urlaub').trim();
    type = ABS_TYPES.find(t => t.toLowerCase() === type.toLowerCase()) || (/^k/i.test(type) ? 'Krank' : /^u/i.test(type) ? 'Urlaub' : 'Sonstiges');
    if (scope && (e < scope.start || s > scope.end)) return;
    const cs = scope && s < scope.start ? scope.start : s, ce = scope && e > scope.end ? scope.end : e;
    const key = pk + '|' + cs + '|' + ce + '|' + type;
    if (seen.has(key)) return warnings.push(line + 'doppelte Abwesenheit übersprungen');
    seen.add(key); rows.push({ pk, type, start: cs, end: ce });
  });
  return { errors, warnings, rows, scope };
}
export function applyAbsences(st, chk) {
  const sc = chk.scope, kept = [];
  for (const a of st.absences) {
    if (!sc || a.end < sc.start || a.start > sc.end) { kept.push(a); continue; }
    if (a.start < sc.start) kept.push({ ...a, end: addDays(sc.start, -1) });
    if (a.end > sc.end) kept.push({ ...a, start: addDays(sc.end, 1) });
  }
  st.absences = kept.concat(chk.rows);
}
export function checkCapacity(objs, head, year) {
  const errors = [], rows = [], seen = new Set();
  for (const f of ['date', 'shift', 'net', 'min', 'zero']) if (!head.includes(f)) errors.push('Spalte „' + f + '“ fehlt');
  if (errors.length) return { errors, warnings: [], rows };
  objs.forEach((r, i) => {
    if (errors.length > 25) return;
    const line = 'Zeile ' + (i + 2) + ': ', date = normDate(r.date), area = String(r.area || 'M1').trim(), shift = normShift(r.shift);
    const nums = ['net', 'min', 'zero'].map(k => String(r[k]).trim() === '' ? NaN : Number(String(r[k]).replace(',', '.')));
    if (!date || !date.startsWith(String(year))) return errors.push(line + 'Datum ungültig oder außerhalb ' + year);
    if (!AREAS.includes(area) || !SHIFTS.includes(shift)) return errors.push(line + 'Bereich oder Dienst ungültig');
    if (nums.some(v => !Number.isFinite(v) || v < 0) || nums[2] < nums[1]) return errors.push(line + 'net/min/zero ungültig (zero muss ≥ min sein)');
    const key = date + area + shift;
    if (seen.has(key)) return errors.push(line + 'doppelte Kapazitätszeile');
    seen.add(key);
    const nv = k => String(r[k] ?? '').trim() === '' ? null : Number(String(r[k]).replace(',', '.'));
    rows.push({ date, area, shift, net: nums[0], min: nums[1], zero: nums[2], checked: head.includes('checked') ? truthy(r.checked) : true,
      absencesIncluded: head.includes('absencesIncluded') ? truthy(r.absencesIncluded) : true, gross: nv('gross'), absent: nv('absent') || 0 });
  });
  return { errors, warnings: [], rows };
}
export function checkEvents(st, objs, head) {
  const errors = [], warnings = [], rows = [], known = new Set(st.people.map(p => p.pk)), y = String(st.meta.year);
  for (const f of ['pk', 'type', 'start', 'end']) if (!head.includes(f)) errors.push('Spalte „' + f + '“ fehlt');
  if (errors.length) return { errors, warnings, rows };
  objs.forEach((r, i) => {
    if (errors.length > 25) return;
    const line = 'Zeile ' + (i + 2) + ': ', pk = String(r.pk ?? '').trim(), s = normDate(r.start), e = normDate(r.end);
    if (!pk) return;
    if (!known.has(pk)) return errors.push(line + 'unbekannte Personalnummer');
    if (!s || !e || e < s || !s.startsWith(y) || !e.startsWith(y)) return errors.push(line + 'Zeitraum ungültig oder außerhalb ' + y);
    const type = [...TYPES, 'Sonstiges'].find(t => t.toLowerCase() === String(r.type).trim().toLowerCase());
    if (!type) return errors.push(line + 'Maßnahme unbekannt (' + r.type + ')');
    const f = (k, def) => { const v = String(r[k] ?? '').trim(); return v === '' ? def : clamp(num(v.replace(',', '.')), 0, 5); };
    rows.push({ id: uid(), pk, type, title: String(r.title || '').trim() || undefined, start: s, end: e, auto: false,
      trainee: f('trainee', type === PREP ? 0 : 1), mentor: f('mentor', 0), tec: f('tec', 0), examiner: f('examiner', 0), target: '' });
  });
  return { errors, warnings, rows };
}
