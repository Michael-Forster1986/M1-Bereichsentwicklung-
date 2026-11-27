// ---------- Schichtsymbole des eingespielten Schichtplans -------------------------------
// Der Schichtplan kommt mit eigenen Symbolen (F1, S1, N2, Up, LC* …). Für die Planung zählt nur, was ein Symbol bedeutet
// (Früh, Spät, Nacht, frei, abwesend) – angezeigt wird aber das Symbol selbst, so wie es im Schichtplan steht.
// Gespeichert wird kompakt: st.symbols.list = alle Symbole des Planungsjahrs, st.symbols.days[pk] = ein Zeichen je Tag,
// das auf die Liste zeigt („.“ = kein Symbol).

const CHARS = '.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,-/:;<=>?@[]^_{|}~';
/** So viele verschiedene Symbole kann ein Planungsjahr führen. */
export const MAX_SYMBOLS = CHARS.length - 1;
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 8);

export const emptySymbols = () => ({ list: [], days: {} });
function decode(str, n) {
  const a = new Uint8Array(n);
  if (typeof str === 'string') for (let i = 0, m = Math.min(n, str.length); i < m; i++) { const c = CHARS.indexOf(str[i]); a[i] = c < 0 ? 0 : c; }
  return a;
}
const encode = arr => { let s = ''; for (let i = 0; i < arr.length; i++) s += CHARS[arr[i]] || '.'; return s; };
const store = (st, pk, arr) => { if (arr.some(c => c > 0)) st.symbols.days[pk] = encode(arr); else delete st.symbols.days[pk]; };
const ensure = st => st.symbols && Array.isArray(st.symbols.list) && st.symbols.days ? st.symbols : (st.symbols = emptySymbols());

/** Symbole aus einer Datei bereinigen: n = Tage des Jahres, pks = bekannte Personalnummern. */
export function normSymbols(x, n, pks) {
  const out = emptySymbols();
  if (!x || typeof x !== 'object' || !Array.isArray(x.list)) return out;
  // Die Liste bleibt in ihrer Reihenfolge – die Zeichen je Tag zeigen auf ihre Plätze. Doppelte und leere Einträge werden entwertet.
  const seen = new Set(), valid = [];
  x.list.slice(0, MAX_SYMBOLS).forEach(v => { const s = clean(v), ok = !!s && !seen.has(s); seen.add(s); out.list.push(ok ? s : ''); valid.push(ok); });
  if (x.days && typeof x.days === 'object') for (const [pk, str] of Object.entries(x.days)) {
    if (!pks.has(pk) || typeof str !== 'string') continue;
    const arr = decode(str, n);
    for (let d = 0; d < n; d++) if (arr[d] && !valid[arr[d] - 1]) arr[d] = 0;
    if (arr.some(c => c > 0)) out.days[pk] = encode(arr);
  }
  while (out.list.length && !out.list[out.list.length - 1]) out.list.pop();
  return out;
}
/** Symbole einer Person als Liste je Tag ('' = kein Symbol). */
export function symbolsOf(st, pk, n) {
  const sym = st.symbols, out = new Array(n).fill('');
  if (!sym || !sym.days || !sym.days[pk]) return out;
  const arr = decode(sym.days[pk], n);
  for (let d = 0; d < n; d++) if (arr[d]) out[d] = sym.list[arr[d] - 1] || '';
  return out;
}
/** Zähler je Symbol über alle Personen (für die Legende). */
export function symbolCounts(st, n) {
  const counts = new Map(), sym = st.symbols;
  if (!sym || !sym.days) return counts;
  for (const str of Object.values(sym.days)) { const arr = decode(str, n); for (let d = 0; d < n; d++) if (arr[d]) { const s = sym.list[arr[d] - 1]; if (s) counts.set(s, (counts.get(s) || 0) + 1); } }
  return counts;
}
/**
 * Trägt Symbole für einzelne Tage ein: entries = [[Tagesindex, Symbol], …]; ein leeres Symbol entfernt den Eintrag.
 * Liefert die Zahl der Symbole, die nicht mehr in die Liste passten (mehr als MAX_SYMBOLS verschiedene).
 */
export function setSymbols(st, n, pk, entries) {
  const sym = ensure(st), arr = decode(sym.days[pk], n), index = new Map(sym.list.map((s, i) => [s, i + 1]));
  let dropped = 0;
  for (const [d, raw] of entries) {
    if (!(d >= 0 && d < n)) continue;
    const s = clean(raw);
    if (!s) { arr[d] = 0; continue; }
    let at = index.get(s);
    if (!at) {
      const free = sym.list.indexOf('');                       // entwerteten Platz wiederverwenden
      if (free >= 0) { sym.list[free] = s; at = free + 1; }
      else if (sym.list.length < MAX_SYMBOLS) { sym.list.push(s); at = sym.list.length; }
      else { dropped++; arr[d] = 0; continue; }
      index.set(s, at);
    }
    arr[d] = at;
  }
  store(st, pk, arr);
  return dropped;
}
/** Entfernt die Symbole einzelner Tage – etwa, wenn der Dienst dort von Hand geändert wurde. */
export function clearSymbolDays(st, n, pk, days) {
  const sym = st.symbols; if (!sym || !sym.days || !sym.days[pk]) return;
  const arr = decode(sym.days[pk], n);
  for (const d of days) if (d >= 0 && d < n) arr[d] = 0;
  store(st, pk, arr);
}
export function clearSymbols(st, pk) { if (st.symbols && st.symbols.days) delete st.symbols.days[pk]; }
/** Überträgt die Symbole einer Person auf andere (zusammen mit ihrem Dienstplan). */
export function copySymbols(st, from, to) {
  const sym = st.symbols; if (!sym || !sym.days) return;
  for (const pk of to) if (pk !== from) { if (sym.days[from]) sym.days[pk] = sym.days[from]; else delete sym.days[pk]; }
}
/** Schreibt die Symbole um 52 Wochen fort – im Gleichschritt mit dem Dienstplan beim Jahreswechsel. map(d) = Tagesindex im alten Jahr oder -1. */
export function shiftSymbols(prev, next, nPrev, nNext, pks, map) {
  const src = prev.symbols; if (!src || !src.days) return;
  const out = ensure(next); out.list = src.list.slice();
  for (const pk of pks) {
    if (!src.days[pk]) continue;
    const a = decode(src.days[pk], nPrev), b = new Uint8Array(nNext);
    for (let d = 0; d < nNext; d++) { const j = map(d); b[d] = j >= 0 && j < nPrev ? a[j] : 0; }
    if (b.some(c => c > 0)) out.days[pk] = encode(b);
  }
}
