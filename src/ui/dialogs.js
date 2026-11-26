import { $, html, setHTML } from './dom.js';
import { UI } from './state.js';
import { renderDrawer } from './drawers.js';

// ---------- Meldungen, Dialoge, Seitenleiste -------------------------------
export function toast(text, kind = '', action = null) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.setAttribute('role', kind === 'crit' ? 'alert' : 'status');
  el.append(document.createTextNode(text));
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { el.remove(); safe(action.run); }; el.append(b); }
  const box = $('#toasts'); box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), action ? 9000 : kind === 'crit' ? 7000 : 3800);
}
export function safe(fn) {
  try { const r = fn(); if (r && typeof r.catch === 'function') r.catch(err => { console.error(err); toast('Fehler: ' + (err.message || err), 'crit'); }); return r; }
  catch (err) { console.error(err); toast('Fehler: ' + (err.message || err), 'crit'); }
}
export let modalHandlers = {}, modalCloseCb = null, lastFocus = null;
export function openModal({ title, body, footer, wide = false, handlers = {}, onClose = null }) {
  const m = $('#modal'); lastFocus = document.activeElement;
  setHTML(m, html`<div class="dialog ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
    <header><h2>${title}</h2><button class="btn ghost sm" data-act="modal-close" aria-label="Schließen">✕</button></header>
    <div class="body">${body}</div>${footer ? html`<footer>${footer}</footer>` : ''}</div>`);
  modalHandlers = handlers; modalCloseCb = onClose; m.hidden = false;
  const f = $('[autofocus]', m) || $('.body input,.body select,.body textarea,footer .btn.primary', m); if (f) f.focus();
}
export function closeModal(result) { const m = $('#modal'); if (m.hidden) return; m.hidden = true; m.innerHTML = ''; const cb = modalCloseCb; modalCloseCb = null; modalHandlers = {}; if (cb) cb(result); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
export function confirmDlg(title, text, okLabel = 'OK', danger = false) {
  return new Promise(resolve => openModal({ title, body: html`<p>${text}</p>`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary ${danger ? 'danger' : ''}" data-act="m:ok" autofocus>${okLabel}</button>`,
    handlers: { ok: () => closeModal(true) }, onClose: r => resolve(r === true) }));
}
export function openDrawer(spec) { UI.drawer = spec; renderDrawer(); const d = $('#drawer'); d.hidden = false; const f = $('button,input,select', d); if (f) f.focus(); }
export function closeDrawer() { UI.drawer = null; $('#drawer').hidden = true; $('#drawer').innerHTML = ''; }
