import { ROSTER_CHARS } from './constants.js';
import { kOf } from './util.js';

// ---------- Dienstplan (kompakt: ein Zeichen je Tag) --------------------
export function decodeRoster(str, n) {
  const a = new Uint8Array(n);
  if (typeof str === 'string') for (let i = 0, m = Math.min(n, str.length); i < m; i++) { const c = ROSTER_CHARS.indexOf(str[i]); a[i] = c < 0 ? 0 : c; }
  return a;
}
export const encodeRoster = arr => { let s = ''; for (let i = 0; i < arr.length; i++) s += ROSTER_CHARS[arr[i]] || '.'; return s; };
export const rosterCode = (area, shift) => shift === 'Frei' ? 1 : (kOf(area, shift) >= 0 ? kOf(area, shift) + 2 : 0);

// ---------- Dienstplan von Hand bearbeiten ---------------------------------------
// Je Person ein Zeichen je Tag: 0 kein Eintrag · 1 Frei · 2… Bereich × Dienst. Alle Funktionen ändern st.roster
// und liefern die Zahl der geänderten Tage. cal = Kalender des Planungsjahrs (makeCalendar).
function store(st, pk, arr) { if (arr.some(c => c > 0)) st.roster[pk] = encodeRoster(arr); else delete st.roster[pk]; }
const span = (cal, start, end) => [Math.max(0, cal.idx(start)), Math.min(cal.n - 1, cal.idx(end))];

/** Trägt für einzelne Tage (Tagesindizes) einen Dienst ein. code: rosterCode(Bereich, Dienst) oder 0 = Eintrag entfernen. */
export function setRosterDays(st, cal, pk, days, code) {
  const arr = decodeRoster(st.roster[pk], cal.n); let changed = 0;
  for (const d of days) if (d >= 0 && d < cal.n && arr[d] !== code) { arr[d] = code; changed++; }
  if (changed) store(st, pk, arr);
  return changed;
}
/** Füllt einen Zeitraum: an den gewählten Wochentagen (0 = Sonntag … 6 = Samstag) gilt der Dienst; andere Tage bleiben unverändert. */
export function fillRoster(st, cal, pk, o) {
  const [a, b] = span(cal, o.start, o.end), days = [];
  for (let d = a; d <= b; d++) if (o.dows.includes(cal.dow[d])) days.push(d);
  return setRosterDays(st, cal, pk, days, o.code);
}
/**
 * Füllt einen Zeitraum mit einer Wochenfolge, z. B. Früh, Spät, Nacht: Der Dienst wechselt wochenweise und beginnt mit der
 * Woche des Startdatums. An den gewählten Wochentagen gilt der Dienst der Woche, alle übrigen Tage des Zeitraums werden frei.
 */
export function fillRosterWeekly(st, cal, pk, o) {
  const seq = (o.seq || []).filter(c => c > 0);
  if (!seq.length) throw new Error('Die Wochenfolge ist leer');
  const [a, b] = span(cal, o.start, o.end), arr = decodeRoster(st.roster[pk], cal.n);
  const monday = cal.idx(o.start) - ((new Date(o.start + 'T00:00:00Z').getUTCDay() + 6) % 7);     // kann vor dem Jahresanfang liegen
  let changed = 0;
  for (let d = a; d <= b; d++) {
    const code = o.dows.includes(cal.dow[d]) ? seq[Math.floor((d - monday) / 7) % seq.length] : 1;
    if (arr[d] !== code) { arr[d] = code; changed++; }
  }
  if (changed) store(st, pk, arr);
  return changed;
}
/** Überträgt den Dienstplan einer Person auf andere. Liefert die Zahl der Personen, deren Plan sich dadurch geändert hat. */
export function copyRoster(st, from, to) {
  if (!st.roster[from]) throw new Error('Diese Person hat noch keinen Dienstplan');
  let changed = 0;
  for (const pk of to) if (pk !== from && st.roster[pk] !== st.roster[from]) { st.roster[pk] = st.roster[from]; changed++; }
  return changed;
}
/** Entfernt alle Einträge einer Person. */
export function clearRoster(st, pk) { const had = !!st.roster[pk]; delete st.roster[pk]; return had; }
