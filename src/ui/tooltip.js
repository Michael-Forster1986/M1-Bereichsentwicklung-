import { $, html, setHTML } from './dom.js';
import { TIP } from './registry.js';

let tipEl = null, tipShown = false, tipW = 0, tipH = 0;
function place(x, y) {
  const tip = $('#tip'), W = innerWidth, H = innerHeight;
  let left = x + 14, top = y + 16;
  if (left + tipW > W - 8) left = Math.max(8, x - tipW - 12);
  if (top + tipH > H - 8) top = Math.max(8, y - tipH - 12);
  tip.style.left = left + 'px'; tip.style.top = top + 'px';
}
function showTip(target, x, y) {
  const tip = $('#tip'); let content = null;
  if (target.dataset.tk && TIP[target.dataset.tk]) content = TIP[target.dataset.tk](target, tipEl);
  else if (target.dataset.tip) content = html`${target.dataset.tip}`;
  tipShown = !!content;
  if (!content) { tip.hidden = true; return; }
  setHTML(tip, content); tip.hidden = false;
  const r = tip.getBoundingClientRect(); tipW = r.width; tipH = r.height;
  place(x, y);
}
export function hideTip() { $('#tip').hidden = true; tipEl = null; tipShown = false; }
document.addEventListener('pointermove', e => {
  // Beim Ziehen im Jahresplan zeigt die Marke am Zeiger, was geschieht – Hinweisfenster würden nur bremsen
  if (document.body.classList.contains('dragging')) return;
  const t = e.target.closest ? e.target.closest('[data-tk],[data-tip]') : null;
  if (!t) { if (tipEl) hideTip(); return; }
  // Der Inhalt hängt nur vom Element ab: solange der Zeiger darauf bleibt, wandert das Fenster nur mit
  if (e.target === tipEl) { if (tipShown) place(e.clientX, e.clientY); return; }
  tipEl = e.target; showTip(t, e.clientX, e.clientY);
}, { passive: true });
document.documentElement.addEventListener('pointerleave', hideTip);
document.addEventListener('scroll', hideTip, true);
document.addEventListener('focusin', e => { const t = e.target.closest && e.target.closest('[data-tk],[data-tip]'); if (t && e.target.matches(':focus-visible')) { tipEl = e.target; const r = e.target.getBoundingClientRect(); showTip(t, r.left + r.width / 2, r.bottom); } });
document.addEventListener('focusout', hideTip);
