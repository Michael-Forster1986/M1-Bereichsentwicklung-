import { DAY } from './constants.js';

// ---------- Datum ------------------------------------------------------
const parseT = s => Date.parse(s + 'T00:00:00Z');
const iso = t => new Date(t).toISOString().slice(0, 10);
export const validDate = s => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = parseT(s); return Number.isFinite(t) && iso(t) === s;
};
export const addDays = (s, n) => iso(parseT(s) + n * DAY);
export const fmtDE = s => validDate(s) ? s.slice(8) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : String(s || '');
export const fmtShort = s => validDate(s) ? s.slice(8) + '.' + s.slice(5, 7) + '.' : String(s || '');
/** Akzeptiert JJJJ-MM-TT, TT.MM.JJJJ, T.M.JJ und Excel-Serienzahlen. */
export function normDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (validDate(s)) return s;
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    const r = y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return validDate(r) ? r : '';
  }
  m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m) { const r = m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'); return validDate(r) ? r : ''; }
  if (/^\d{5}(\.\d+)?$/.test(s)) { const n = Math.floor(Number(s)); if (n > 20000 && n < 80000) return iso(Date.UTC(1899, 11, 30) + n * DAY); }
  m = s.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
  if (m && validDate(m[1])) return m[1];
  return '';
}
export function makeCalendar(year) {
  const t0 = Date.UTC(year, 0, 1), n = Math.round((Date.UTC(year + 1, 0, 1) - t0) / DAY);
  const isoArr = new Array(n), dow = new Uint8Array(n), month = new Uint8Array(n), dom = new Uint8Array(n);
  const monthStart = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(t0 + i * DAY);
    isoArr[i] = d.toISOString().slice(0, 10); dow[i] = d.getUTCDay(); month[i] = d.getUTCMonth(); dom[i] = d.getUTCDate();
    if (dom[i] === 1) monthStart.push(i);
  }
  monthStart.push(n);
  const idx = s => Math.round((parseT(s) - t0) / DAY);
  return { year, n, iso: isoArr, dow, month, dom, monthStart, idx, first: isoArr[0], last: isoArr[n - 1] };
}
export function firstMonday(year) {
  for (let d = 1; d <= 7; d++) if (new Date(Date.UTC(year, 0, d)).getUTCDay() === 1) return iso(Date.UTC(year, 0, d));
  return year + '-01-01';
}
/** ISO-Kalenderwoche eines Datums. */
export function isoWeek(s) {
  const d = new Date(parseT(s)); const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - first) / DAY - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}
/** Gesetzliche Feiertage Bayern (berechnet, als Vorschlag – vor Verwendung prüfen). */
export function holidaysBavaria(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  const E = Date.UTC(y, mo - 1, da), off = n => iso(E + n * DAY), fix = (mm, dd) => iso(Date.UTC(y, mm - 1, dd));
  return [
    [fix(1, 1), 'Neujahr'], [fix(1, 6), 'Heilige Drei Könige'], [off(-2), 'Karfreitag'], [off(1), 'Ostermontag'],
    [fix(5, 1), 'Tag der Arbeit'], [off(39), 'Christi Himmelfahrt'], [off(50), 'Pfingstmontag'], [off(60), 'Fronleichnam'],
    [fix(8, 15), 'Mariä Himmelfahrt'], [fix(10, 3), 'Tag der Deutschen Einheit'], [fix(11, 1), 'Allerheiligen'],
    [fix(12, 25), '1. Weihnachtstag'], [fix(12, 26), '2. Weihnachtstag']
  ].map(([date, name]) => ({ date, name })).sort((p, q) => p.date < q.date ? -1 : 1);
}
/** Jahr, das üblicherweise gerade geplant wird: bis Juni das laufende, ab Juli das folgende. */
export function planningYear(now = new Date()) { return now.getFullYear() + (now.getMonth() >= 6 ? 1 : 0); }
