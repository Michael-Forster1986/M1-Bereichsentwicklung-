import { $, html, setHTML } from './dom.js';
import { TIP } from './registry.js';

let tipEl = null;
function showTip(target, x, y) {
  const tip = $('#tip'); let content = null;
  if (target.dataset.tk && TIP[target.dataset.tk]) content = TIP[target.dataset.tk](target, tipEl);
  else if (target.dataset.tip) content = html`${target.dataset.tip}`;
  if (!content) { tip.hidden = true; return; }
  setHTML(tip, content); tip.hidden = false;
  const r = tip.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  let left = x + 14, top = y + 16;
  if (left + r.width > W - 8) left = Math.max(8, x - r.width - 12);
  if (top + r.height > H - 8) top = Math.max(8, y - r.height - 12);
  tip.style.left = left + 'px'; tip.style.top = top + 'px';
}
export function hideTip() { $('#tip').hidden = true; tipEl = null; }
document.addEventListener('pointermove', e => {
  const t = e.target.closest ? e.target.closest('[data-tk],[data-tip]') : null;
  if (!t) { if (tipEl) hideTip(); return; }
  tipEl = e.target; showTip(t, e.clientX, e.clientY);
}, { passive: true });
document.documentElement.addEventListener('pointerleave', hideTip);
document.addEventListener('scroll', hideTip, true);
document.addEventListener('focusin', e => { const t = e.target.closest && e.target.closest('[data-tk],[data-tip]'); if (t && e.target.matches(':focus-visible')) { tipEl = e.target; const r = e.target.getBoundingClientRect(); showTip(t, r.left + r.width / 2, r.bottom); } });
document.addEventListener('focusout', hideTip);
