import * as Core from '../../core/index.js';
import { html, raw } from '../dom.js';
import { MON, dayLabel, nf, sgn } from '../format.js';
import { IX } from '../state.js';
import { openDrawer } from '../dialogs.js';
import { ACT, TIP } from '../registry.js';

/* ==========================================================================
 * Ansichten · Übersicht, Jahresplan, Kapazität
 * ========================================================================== */
export const EPS = Core.EPS;
export let lastPtr = { x: 0, y: 0 };
document.addEventListener('pointermove', e => { lastPtr = { x: e.clientX, y: e.clientY }; }, { passive: true, capture: true });

export function capClass(d, k) {
  const c = IX.cap;
  if (!c.known[k][d]) return c.src[k][d] ? 'c-na' : 'c-off';
  const net = c.pre[k][d] - IX.load.loss[k][d], dz = net - c.zero[k][d];
  if (net < c.min[k][d] - EPS) return 'c-crit';
  if (dz < -EPS) return 'c-warn';
  return dz >= 6 ? 'c-q0' : dz >= 3 ? 'c-q1' : dz >= 1 ? 'c-q2' : 'c-q3';       // Reserve über dem 0-Punkt in Köpfen
}
export function capCells(k) { let s = ''; for (let d = 0; d < IX.n; d++) s += '<i class="' + capClass(d, k) + '"></i>'; return raw(s); }
export function capTipRows(d, ks) {
  return html`<table>${ks.map(k => { const c = Core.capInfo(IX, d, k); return c.known
    ? html`<tr><td>${Core.kShift(k)}</td><td class="n"><b>${nf(c.net, 1)}</b></td><td class="n k">Δ0 ${sgn(c.net - c.zero)}</td><td class="n k">ΔMin ${sgn(c.net - c.min)}</td></tr>`
    : html`<tr><td>${Core.kShift(k)}</td><td class="k" colspan="3">nicht prüfbar</td></tr>`; })}</table>`;
}
export const dayFlags = d => [IX.holiday[d] ? 'Feiertag' : '', IX.school[d] ? 'Ferien' : '', IX.cal.dow[d] === 0 || IX.cal.dow[d] === 6 ? 'Wochenende' : ''].filter(Boolean).join(' · ');
TIP.capcell = (target, el) => {
  if (!el || el.tagName !== 'I') return null;
  const d = Array.prototype.indexOf.call(target.children, el), k = +target.dataset.k, c = Core.capInfo(IX, d, k);
  return html`<b>${dayLabel(d)}</b> <span class="k">${dayFlags(d)}</span><br>${Core.kArea(k)} · ${Core.kShift(k)}${c.known
    ? html`<table><tr><td>Verfügbar</td><td class="n"><b>${nf(c.net, 1)}</b></td></tr><tr><td class="k">0-Punkt ${nf(c.zero)}</td><td class="n">${sgn(c.net - c.zero)}</td></tr><tr><td class="k">Minimum ${nf(c.min)}</td><td class="n">${sgn(c.net - c.min)}</td></tr>
      <tr><td class="k">Laut Dienstplan</td><td class="n k">${Number.isFinite(c.gross) ? nf(c.gross) : '–'}</td></tr><tr><td class="k">Abwesend</td><td class="n k">−${nf(c.absent)}</td></tr><tr><td class="k">Krankenreserve</td><td class="n k">−${nf(c.reserve, 1)}</td></tr><tr><td class="k">Maßnahmen</td><td class="n k">−${nf(c.loss, 1)}</td></tr></table>`
    : html`<br><span class="k">${c.src ? 'Grenzwerte fehlen – Kapazität nicht prüfbar' : 'Kein Dienstplan für diesen Tag'}</span>`}`;
};
ACT['day-cell'] = (t, e) => { if (e.target.tagName === 'I') openDrawer({ kind: 'day', d: Array.prototype.indexOf.call(t.children, e.target) }); };
export const capLegend = () => html`<div class="legend"><span>Reserve über dem 0-Punkt:</span><span><i class="sw c-q0"></i>ab 6 Köpfe</span><span><i class="sw c-q1"></i>3 bis 6</span><span><i class="sw c-q2"></i>1 bis 3</span><span><i class="sw c-q3"></i>unter 1</span><span><i class="sw c-warn"></i>unter 0-Punkt</span><span><i class="sw c-crit"></i>unter Minimum</span><span><i class="sw c-na"></i>nicht prüfbar</span></div>`;
export const monthsRow = () => MON.map((m, i) => html`<span style="grid-column:${IX.cal.monthStart[i] + 1} / span ${IX.cal.monthStart[i + 1] - IX.cal.monthStart[i]}">${m}</span>`);
export const areaKnown = a => [0, 1, 2].some(s => IX.cap.known[a * 3 + s].some(v => v));
