// ---------- Sichere HTML-Erzeugung: Werte werden immer maskiert -----------
export const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Safe(String(s));
const hv = v => v == null ? '' : v instanceof Safe ? v.s : Array.isArray(v) ? v.map(hv).join('') : esc(v);   // Wahrheitswerte werden als "true"/"false" ausgegeben (aria-pressed)
export function html(strings, ...vals) { let out = strings[0]; for (let i = 0; i < vals.length; i++) out += hv(vals[i]) + strings[i + 1]; return new Safe(out); }
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const setHTML = (el, content) => { el.innerHTML = hv(content); };
