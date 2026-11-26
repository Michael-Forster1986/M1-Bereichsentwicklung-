import { $ } from './dom.js';
import { isDesktop } from '../platform/desktop.js';
import { S, UI, autosaveOn, dirty, redo, undo } from './state.js';
import { closeDrawer, closeModal, modalHandlers, safe } from './dialogs.js';
import { ACT, CHG, INP } from './registry.js';
import { deferred, rendering } from './shell.js';

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const a = t.dataset.act;
  if (a === 'modal-close') return closeModal();
  if (a.startsWith('m:')) { const fn = modalHandlers[a.slice(2)]; if (fn) safe(() => fn(t, e)); return; }
  if (ACT[a]) { if (t.tagName === 'A') e.preventDefault(); safe(() => ACT[a](t, e)); }
});
function onChange(t, e) { const a = t.dataset.chg; if (a.startsWith('m:')) { const fn = modalHandlers[a.slice(2)]; if (fn) safe(() => fn(t, e)); } else if (CHG[a]) safe(() => CHG[a](t, e)); }
document.addEventListener('change', e => { const t = e.target.closest('[data-chg]'); if (!t) return; if (rendering) deferred.push(() => onChange(t, e)); else onChange(t, e); });
document.addEventListener('input', e => { const t = e.target.closest('[data-inp]'); if (t && INP[t.dataset.inp]) safe(() => INP[t.dataset.inp](t, e)); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (UI.drawer) closeDrawer(); }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    if (e.key.toLowerCase() === 's') { e.preventDefault(); safe(() => ACT[e.shiftKey && isDesktop ? 'save-project-as' : 'save-project']()); }
  }
});
$('#modal').addEventListener('pointerdown', e => { if (e.target === e.currentTarget) closeModal(); });
// Browser: Warnung beim Verlassen. Im Desktop-Programm fragt stattdessen der Dialog „Änderungen speichern?“.
if (!isDesktop) window.addEventListener('beforeunload', e => { if (dirty && S && S.meta.dataClass !== 'demo' && !autosaveOn()) { e.preventDefault(); e.returnValue = ''; } });
