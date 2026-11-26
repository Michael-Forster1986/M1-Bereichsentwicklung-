import { DAY } from './constants.js';
import { addDays, makeCalendar, normDate, validDate } from './dates.js';
import { decodeRoster, encodeRoster, rosterCode } from './roster.js';

// ---------- Tabellen je Tag: Urlaubsplan (und Dienstplan) aus Excel ----------------
// Übliche Form: eine Zeile je Person, eine Spalte je Tag, in den Zellen Kürzel (U, K, F, S, N …).
// Die Datumszeile wird erkannt – als volle Datumsangaben oder als Tageszahlen 1–31 unter Monatsnamen.
// Welche Kürzel was bedeuten, legt der Mensch beim Einspielen fest (Vorschlag: defaultCodeMap).

const MONTH_WORDS = [['jan'], ['feb'], ['mar', 'mrz', 'maer'], ['apr'], ['mai', 'may'], ['jun'], ['jul'], ['aug'], ['sep'], ['okt', 'oct'], ['nov'], ['dez', 'dec']];
const plain = s => String(s ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').trim();
function monthOf(cell) {
  const s = plain(cell);
  if (!s) return 0;
  const d = normDate(cell); if (d) return +d.slice(5, 7);
  let m = s.match(/^(\d{1,2})[./-](\d{2}|\d{4})$/); if (m && +m[1] >= 1 && +m[1] <= 12) return +m[1];
  m = s.match(/^[a-z]+/);
  if (m) for (let i = 0; i < 12; i++) if (MONTH_WORDS[i].some(w => m[0].startsWith(w))) return i + 1;
  return 0;
}
const dayNumber = cell => { const s = String(cell ?? '').trim().replace(/\.$/, ''); return /^\d{1,2}$/.test(s) && +s >= 1 && +s <= 31 ? +s : 0; };
/** Namen vergleichbar machen: „Muster, Max“ = „Max Muster“. */
export const nameKey = s => plain(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

/**
 * Liest eine Tagestabelle. Liefert { errors, warnings, dates, cells (pk → Kürzel je Datum), codes (Kürzel → Anzahl),
 * persons, unknown, range, layout }.
 */
export function parseDayMatrix(st, rows) {
  const year = st.meta.year, errors = [], warnings = [], out = { errors, warnings, dates: [], cells: new Map(), codes: new Map(), persons: 0, unknown: [], range: null, layout: '' };
  if (!Array.isArray(rows) || rows.length < 2) { errors.push('Die Tabelle enthält keine Datenzeilen'); return out; }
  const top = rows.slice(0, 25), inYear = d => d && d.startsWith(year + '-');
  // 1) Kopfzeile mit vollen Datumsangaben
  let head = -1, best = 2, cols = [];
  top.forEach((r, i) => { const n = r.filter(c => inYear(normDate(c))).length; if (n > best) { best = n; head = i; } });
  if (head >= 0) {
    rows[head].forEach((c, j) => { const d = normDate(c); if (inYear(d)) cols.push([j, d]); });
    out.layout = 'Datum je Spalte';
  } else {
    // 2) Tageszahlen 1–31, Monate aus den Zeilen darüber oder aus dem Neubeginn der Zählung
    best = 9;
    top.forEach((r, i) => { const n = r.filter(dayNumber).length; if (n > best) { best = n; head = i; } });
    if (head < 0) { errors.push('Keine Datumszeile gefunden – erwartet wird eine Zeile mit Datumsangaben oder mit Tageszahlen 1–31 unter den Monatsnamen'); return out; }
    const row = rows[head], above = rows.slice(Math.max(0, head - 3), head);
    let month = 0, last = 0;
    for (let j = 0; j < row.length; j++) {
      for (const r of above) { const m = monthOf(r[j]); if (m) { if (m !== month) last = 0; month = m; } }
      const d = dayNumber(row[j]); if (!d) continue;
      if (!month) month = 1;
      else if (d < last) month++;                         // Zählung beginnt neu: nächster Monat
      last = d;
      if (month > 12) break;
      const iso = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      if (validDate(iso)) cols.push([j, iso]);
    }
    out.layout = 'Tageszahlen unter Monatsnamen';
  }
  const seenDate = new Set(); cols = cols.filter(([, d]) => !seenDate.has(d) && seenDate.add(d));
  if (cols.length < 2) { errors.push('Zu wenige Datumsspalten im Planungsjahr ' + year + ' erkannt'); return out; }
  out.dates = cols.map(c => c[1]);
  const sorted = out.dates.slice().sort(); out.range = { start: sorted[0], end: sorted[sorted.length - 1] };
  // Personen: Personalnummer oder Name in den Spalten vor dem ersten Datum
  const firstCol = Math.min(...cols.map(c => c[0])), byPk = new Map(st.people.map(p => [plain(p.pk), p.pk])), names = new Map(), dup = new Set();
  for (const p of st.people) { const k = nameKey(p.name); if (!k) continue; if (names.has(k)) dup.add(k); names.set(k, p.pk); }
  for (const k of dup) names.delete(k);
  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i], keys = r.slice(0, firstCol).map(c => String(c ?? '').trim()).filter(Boolean);
    const codes = cols.map(([j]) => String(r[j] ?? '').trim());
    if (!keys.length) continue;
    let pk = '';
    for (const k of keys) if (byPk.has(plain(k))) { pk = byPk.get(plain(k)); break; }
    if (!pk) for (const k of keys) if (names.has(nameKey(k))) { pk = names.get(nameKey(k)); break; }
    if (!pk) { if (codes.some(Boolean) && out.unknown.length < 200) out.unknown.push(keys.join(' · ').slice(0, 60)); continue; }
    if (out.cells.has(pk)) { warnings.push('Zeile ' + (i + 1) + ': Person kommt mehrfach vor – nur die erste Zeile zählt'); continue; }
    out.cells.set(pk, codes);
    for (const c of codes) if (c) { const u = c.toUpperCase(); out.codes.set(u, (out.codes.get(u) || 0) + 1); }
  }
  out.persons = out.cells.size;
  if (!out.persons) errors.push('Keine Zeile ließ sich einer Person zuordnen – erwartet wird die Personalnummer oder der Name in einer Spalte vor den Tagen');
  if (out.unknown.length) warnings.push(out.unknown.length + ' Zeilen ohne bekannte Person übersprungen (z. B. ' + out.unknown.slice(0, 3).join('; ') + ')');
  const missing = st.people.length - out.persons;
  if (out.persons && missing > 0) warnings.push(missing + ' Personen des Projekts stehen nicht in der Tabelle – ihre Einträge bleiben unverändert');
  return out;
}

export const MATRIX_TARGETS = ['Urlaub', 'Krank', 'Sonstiges', 'Früh', 'Spät', 'Nacht', 'Frei', ''];
/** Vorschlag, was ein Kürzel bedeutet. Dienste werden nur vorgeschlagen, wenn auch der Dienstplan übernommen werden soll. */
export function defaultCodeMap(codes, withRoster = false) {
  const map = {};
  for (const code of codes) {
    const c = plain(code).replace(/[^a-z0-9]/g, '');
    let t = '';
    if (/^(u|ur|url|urlaub|tu|ru|eu|su|ju|uv|ua|u\d+|resturlaub|sonderurlaub)$/.test(c)) t = 'Urlaub';
    else if (/^(k|kr|krank|kk|au|kur|ko|kind)$/.test(c)) t = 'Krank';
    else if (/^(za|fza|glz|eltern|elternzeit|ez|mutterschutz|dr|dienstreise|abw|abwesend)$/.test(c)) t = 'Sonstiges';
    else if (withRoster) {
      if (/^(f|fd|frueh|fs|f\d)$/.test(c)) t = 'Früh';
      else if (/^(s|sd|spaet|ss|s\d)$/.test(c)) t = 'Spät';
      else if (/^(n|nd|nacht|ns|n\d)$/.test(c)) t = 'Nacht';
      else if (/^(frei|off|r|rt|o|0)$/.test(c) || code === '-' || code === '/') t = 'Frei';
    }
    map[code] = t;
  }
  return map;
}
/** Abwesenheiten aus der Tabelle: aufeinanderfolgende Tage derselben Art werden zu einem Zeitraum. */
export function matrixAbsences(parsed, map) {
  const order = parsed.dates.map((d, i) => [d, i]).sort((a, b) => a[0] < b[0] ? -1 : 1), rows = [];
  for (const [pk, codes] of parsed.cells) {
    let cur = null;
    for (const [date, i] of order) {
      const t = codes[i] ? map[codes[i].toUpperCase()] : '';
      const type = t === 'Urlaub' || t === 'Krank' || t === 'Sonstiges' ? t : '';
      if (cur && type === cur.type && Date.parse(date) - Date.parse(cur.end) === DAY) { cur.end = date; continue; }
      if (cur) rows.push(cur);
      cur = type ? { pk, type, start: date, end: date } : null;
    }
    if (cur) rows.push(cur);
  }
  return rows;
}
/**
 * Übernimmt die Tabelle. Für die Personen der Tabelle ersetzen die Einträge im Zeitraum der Tabelle die bisherigen
 * Abwesenheiten (auch simulierte); alle anderen Personen bleiben unberührt. Sind Kürzel als Dienst zugeordnet,
 * wird für diese Tage auch der Dienstplan gesetzt. Liefert { absences, days, removed, rosterDays }.
 */
export function applyDayMatrix(st, parsed, map) {
  const { start, end } = parsed.range, set = new Set(parsed.cells.keys()), kept = [], info = { absences: 0, days: 0, removed: 0, rosterDays: 0 };
  for (const a of st.absences) {
    if (!set.has(a.pk) || a.end < start || a.start > end) { kept.push(a); continue; }
    info.removed++;
    if (a.start < start) kept.push({ ...a, end: addDays(start, -1) });
    if (a.end > end) kept.push({ ...a, start: addDays(end, 1) });
  }
  const rows = matrixAbsences(parsed, map);
  st.absences = kept.concat(rows);
  info.absences = rows.length; info.days = rows.reduce((s, r) => s + Math.round((Date.parse(r.end) - Date.parse(r.start)) / DAY) + 1, 0);
  // Dienstplan nur, wenn Kürzel als Dienst zugeordnet sind
  const shiftOf = c => { const t = c ? map[c.toUpperCase()] : ''; return t === 'Früh' || t === 'Spät' || t === 'Nacht' || t === 'Frei' ? t : ''; };
  if (Object.values(map).some(t => t === 'Früh' || t === 'Spät' || t === 'Nacht')) {
    const cal = makeCalendar(st.meta.year), area = new Map(st.people.map(p => [p.pk, p.area]));
    for (const [pk, codes] of parsed.cells) {
      const arr = decodeRoster(st.roster[pk], cal.n);
      parsed.dates.forEach((date, i) => { const t = shiftOf(codes[i]); if (!t) return; const d = cal.idx(date); if (d >= 0 && d < cal.n) { arr[d] = rosterCode(area.get(pk) || 'M1', t); info.rosterDays++; } });
      st.roster[pk] = encodeRoster(arr);
    }
  }
  st.meta.simulated.absences = st.absences.some(a => a.synthetic);
  return info;
}
