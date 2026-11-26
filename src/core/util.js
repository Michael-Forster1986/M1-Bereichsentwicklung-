import { AREAS, SHIFTS } from './constants.js';

// ---------- Hilfen -----------------------------------------------------
export const clone = x => JSON.parse(JSON.stringify(x));
export const num = x => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
export const fin = x => typeof x === 'number' && Number.isFinite(x);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const truthy = x => x === true || ['true', '1', 'ja', 'j', 'x', 'yes', 'wahr'].includes(String(x ?? '').trim().toLowerCase());
export const kOf = (area, shift) => { const a = AREAS.indexOf(area), s = SHIFTS.indexOf(shift); return a < 0 || s < 0 ? -1 : a * 3 + s; };
export const kArea = k => AREAS[(k / 3) | 0], kShift = k => SHIFTS[k % 3];
let uidN = 0;
export const uid = () => 'e' + Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 6);
