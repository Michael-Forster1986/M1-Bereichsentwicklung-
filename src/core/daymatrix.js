import { DAY } from './constants.js';
import { addDays, makeCalendar, normDate, validDate } from './dates.js';
import { decodeRoster, encodeRoster, rosterCode } from './roster.js';
import { HEAD, normHead } from './csv.js';

// ---------- Tabellen je Tag: Urlaubsplan (und Dienstplan) aus Excel ----------------
// Übliche Form: eine Zeile je Person, eine Spalte je Tag, in den Zellen Kürzel (U, K, F, S, N …).
// Die Datumszeile wird erkannt – als volle Datumsangaben oder als Tageszahlen 1–31 (auch mit Wochentag: „01 Fr“) unter
// Monatsnamen. Fehlen die Monatsnamen, zählen Hinweise im Dateinamen („…_Januar_27“) oder in einem Text der Tabelle
// („Monat ist Januar“, „Year ist 2027“) – so kommt der monatliche Schichtplan aus dem Auswertungssystem.
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
const WD = '(?:mo|di|mi|do|fr|sa|so|mon|tue|wed|thu|fri|sat|sun)\\.?';
const DAY_A = new RegExp('^(\\d{1,2})\\.?(?:\\s*' + WD + ')?$'), DAY_B = new RegExp('^' + WD + '\\s*(\\d{1,2})\\.?$');
/** Tageszahl einer Kopfzelle: „7“, „07.“, „07 Fr“ (auch mit Zeilenumbruch) oder „Fr 7“. */
const dayNumber = cell => { const s = String(cell ?? '').trim().toLowerCase(), m = DAY_A.exec(s) || DAY_B.exec(s); return m && +m[1] >= 1 && +m[1] <= 31 ? +m[1] : 0; };
const MONTH_EXACT = new Map([['januar', 1], ['jan', 1], ['january', 1], ['februar', 2], ['feb', 2], ['february', 2], ['maerz', 3], ['mrz', 3], ['mar', 3], ['march', 3], ['april', 4], ['apr', 4],
  ['mai', 5], ['may', 5], ['juni', 6], ['jun', 6], ['june', 6], ['juli', 7], ['jul', 7], ['july', 7], ['august', 8], ['aug', 8], ['september', 9], ['sep', 9], ['sept', 9],
  ['oktober', 10], ['okt', 10], ['oct', 10], ['october', 10], ['november', 11], ['nov', 11], ['dezember', 12], ['dez', 12], ['dec', 12], ['december', 12]]);
export const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/**
 * Hinweise auf Monat und Jahr außerhalb der Datumszeile: im Dateinamen („Schichtplan_Januar_27.xlsx“) oder in einem Text
 * der Tabelle („Monat-Default ist Januar“, „Year-Default ist 2027“). Liefert { month, year } – 0, wo nichts zu finden ist.
 */
export function periodHint(rows, fileName = '') {
  const out = { month: 0, year: 0 };
  const texts = [];
  for (const r of [...rows.slice(0, 30), ...rows.slice(-12)]) for (const c of r) { const s = String(c ?? ''); if (s.length > 8 && /[a-z]/i.test(s)) texts.push(plain(s.slice(0, 4000))); }
  for (const s of texts) {
    if (!out.year) { const y = /(?:year|jahr)[^0-9\n]{0,24}(20\d\d)/.exec(s); if (y) out.year = +y[1]; }
    if (!out.month) for (const m of s.matchAll(/(?:monat|month)[^a-z0-9\n]*(?:default)?\s*(?:ist|=|:)?\s*([a-z]{3,}|\d{1,2})\b/g)) {
      const v = /^\d+$/.test(m[1]) ? +m[1] : MONTH_EXACT.get(m[1]) || 0;
      if (v >= 1 && v <= 12) { out.month = v; break; }
    }
  }
  const parts = plain(String(fileName).replace(/\.[a-z0-9]+$/i, '')).split(/[^a-z0-9]+/).filter(Boolean);
  parts.forEach((p, i) => {
    const m = MONTH_EXACT.get(p); if (!m) return;
    if (!out.month) out.month = m;
    if (!out.year) { const y = parts[i + 1] || ''; if (/^20\d\d$/.test(y)) out.year = +y; else if (/^\d\d$/.test(y)) out.year = 2000 + +y; }
  });
  if (!out.year) { const y = parts.find(p => /^20\d\d$/.test(p)); if (y) out.year = +y; }
  return out;
}
/** Namen vergleichbar machen: „Muster, Max“ = „Max Muster“. */
export const nameKey = s => plain(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

/**
 * Liest eine Tagestabelle. Liefert { errors, warnings, dates, cells (pk → Einträge je Datum), codes (Kürzel in
 * Großschreibung → Anzahl), symbols (Einträge in Originalschreibweise → Anzahl), persons, newPeople (Zeilen mit einer
 * Personalnummer, die es im Projekt nicht gibt), unknown, range, layout, period, needsMonth }.
 * opt.fileName: Dateiname als Hinweis auf Monat und Jahr · opt.month: Monat 1–12 vorgeben · opt.newPeople: Zeilen mit
 * unbekannter Personalnummer und Namen als neue Personen sammeln (Schichtplan) statt sie zu überspringen.
 */
export function parseDayMatrix(st, rows, opt = {}) {
  const year = st.meta.year, errors = [], warnings = [], out = { errors, warnings, dates: [], cells: new Map(), codes: new Map(), symbols: new Map(), persons: 0, newPeople: [], unknown: [], range: null, layout: '', period: null, needsMonth: false };
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
    // Stehen keine Monatsnamen über den Tagen, zählt der Hinweis aus Dateiname oder Tabellentext – oder die Vorgabe des Menschen
    const named = above.some(r => r.some(c => monthOf(c))), hint = named ? { month: 0, year: 0 } : periodHint(rows, opt.fileName);
    if (hint.year && hint.year !== year) { errors.push('Die Tabelle gilt für ' + (hint.month ? MONTH_NAMES[hint.month - 1] + ' ' : '') + hint.year + ' – angezeigt wird das Planungsjahr ' + year + '. Bitte zuerst das Planungsjahr ' + hint.year + ' wählen oder anlegen.'); return out; }
    const startMonth = named ? 0 : (opt.month >= 1 && opt.month <= 12 ? opt.month : hint.month || 0);
    if (!named) { out.needsMonth = !startMonth; out.period = { month: startMonth || 1, year, source: opt.month ? 'gewählt' : hint.month ? 'erkannt' : 'angenommen' }; }
    let month = startMonth, last = 0;
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
    out.layout = named ? 'Tageszahlen unter Monatsnamen' : 'Tageszahlen eines Monats';
  }
  const seenDate = new Set(); cols = cols.filter(([, d]) => !seenDate.has(d) && seenDate.add(d));
  if (cols.length < 2) { errors.push('Zu wenige Datumsspalten im Planungsjahr ' + year + ' erkannt'); return out; }
  out.dates = cols.map(c => c[1]);
  const sorted = out.dates.slice().sort(); out.range = { start: sorted[0], end: sorted[sorted.length - 1] };
  // Personen: Personalnummer oder Name in den Spalten vor dem ersten Datum
  const firstCol = Math.min(...cols.map(c => c[0])), byPk = new Map(st.people.map(p => [plain(p.pk), p.pk])), names = new Map(), dup = new Set();
  for (const p of st.people) { const k = nameKey(p.name); if (!k) continue; if (names.has(k)) dup.add(k); names.set(k, p.pk); }
  for (const k of dup) names.delete(k);
  // Beschriftungszeile der Spalten vor den Tagen (Team, Nachname, Vorname, Personalnummer …) – sie kann auch unter der Datumszeile stehen
  const LABELS = ['pk', 'name', 'lastname', 'firstname', 'org', 'role'];
  let labelRow = -1, labels = [], hits = 1;
  for (let i = Math.max(0, head - 3); i <= Math.min(rows.length - 1, head + 2); i++) {
    const f = rows[i].slice(0, firstCol).map(c => HEAD[normHead(c)] || ''), nHit = f.filter(x => LABELS.includes(x)).length;
    if (nHit > hits) { hits = nHit; labelRow = i; labels = f; }
  }
  const col = f => labels.indexOf(f), at = (r, j) => j >= 0 ? String(r[j] ?? '').trim() : '';
  const pkCol = col('pk'), nameCol = col('name'), lastCol = col('lastname'), foreCol = col('firstname'), orgCol = col('org'), roleCol = col('role'), fresh = new Set();
  for (let i = Math.max(head, labelRow) + 1; i < rows.length; i++) {
    const r = rows[i], keys = r.slice(0, firstCol).map(c => String(c ?? '').trim()).filter(Boolean);
    const codes = cols.map(([j]) => String(r[j] ?? '').trim());
    if (!keys.length) continue;
    const full = at(r, nameCol) || [at(r, lastCol), at(r, foreCol)].filter(Boolean).join(', ');
    if (full) keys.push(full);
    let pk = '';
    if (pkCol >= 0 && byPk.has(plain(at(r, pkCol)))) pk = byPk.get(plain(at(r, pkCol)));
    if (!pk) for (const k of keys) if (byPk.has(plain(k))) { pk = byPk.get(plain(k)); break; }
    if (!pk) for (const k of keys) if (names.has(nameKey(k))) { pk = names.get(nameKey(k)); break; }
    if (!pk) {
      if (!codes.some(Boolean)) continue;
      // mit Beschriftung ist klar, welche Zelle die Personalnummer ist: die Person lässt sich beim Einspielen anlegen
      const id = at(r, pkCol);
      if (opt.newPeople && pkCol >= 0 && full && /^[A-Za-z0-9][A-Za-z0-9._/-]{1,23}$/.test(id) && /\d/.test(id) && !fresh.has(id)) { fresh.add(id); out.newPeople.push({ pk: id, name: full || id, org: at(r, orgCol), role: at(r, roleCol), codes }); for (const c of codes) if (c) out.symbols.set(c, (out.symbols.get(c) || 0) + 1); }
      else if (out.unknown.length < 200) out.unknown.push(keys.join(' · ').slice(0, 60));
      continue;
    }
    if (out.cells.has(pk)) { warnings.push('Zeile ' + (i + 1) + ': Person kommt mehrfach vor – nur die erste Zeile zählt'); continue; }
    out.cells.set(pk, codes);
    for (const c of codes) if (c) { const u = c.toUpperCase(); out.codes.set(u, (out.codes.get(u) || 0) + 1); out.symbols.set(c, (out.symbols.get(c) || 0) + 1); }
  }
  out.persons = out.cells.size;
  if (!out.persons && !out.newPeople.length) errors.push('Keine Zeile ließ sich einer Person zuordnen – erwartet wird die Personalnummer oder der Name in einer Spalte vor den Tagen');
  if (out.unknown.length) warnings.push(out.unknown.length + ' Zeilen ohne bekannte Person übersprungen (z. B. ' + out.unknown.slice(0, 3).join('; ') + ')');
  const missing = st.people.length - out.persons;
  if (out.newPeople.length) warnings.push(out.newPeople.length + (out.newPeople.length === 1 ? ' Person der Tabelle gibt' : ' Personen der Tabelle gibt') + ' es im Projekt noch nicht');
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
