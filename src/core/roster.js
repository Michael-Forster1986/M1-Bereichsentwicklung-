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
