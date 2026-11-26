import * as Core from '../core/index.js';
import { $ } from './dom.js';
import { fmt } from './format.js';
import { LS, UI, recompute, replaceState, setS, store } from './state.js';
import { toast } from './dialogs.js';
import { VIEWS } from './registry.js';
import { applyTheme, render } from './shell.js';

// ---------- Start --------------------------------------------------------------
export function boot() {
  applyTheme(store.get(LS.theme) || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  let st = null, note = null;
  try { const emb = JSON.parse($('#embedded-state').textContent || 'null'); if (emb) { st = Core.sanitize(emb).state; note = 'Eingebetteter Planungsstand geladen'; } }
  catch (err) { console.error(err); note = 'Eingebetteter Stand nicht lesbar – Demo-Daten geladen'; }
  let saved = null;
  if (!st && store.get(LS.on) === '1') { try { const x = JSON.parse(store.get(LS.state) || 'null'); if (x) saved = Core.sanitize(x).state; } catch (err) { saved = null; } }
  setS(st || Core.demoState({}));
  recompute(); render();
  if (note) toast(note);
  if (saved) toast('Im Browser liegt ein zwischengespeicherter Stand (' + saved.people.length + ' Personen, ' + fmt(String(saved.meta.modified).slice(0, 10)) + ')', '', { label: 'Wiederherstellen', run: () => replaceState(saved, 'Zwischengespeicherter Stand wiederhergestellt') });
  let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const v = VIEWS[UI.view]; if (v && v.resize) v.resize($('#main')); }, 120); });
  window.addEventListener('error', e => toast('Programmfehler: ' + e.message, 'crit'));
  window.addEventListener('unhandledrejection', e => toast('Fehler: ' + (e.reason?.message || e.reason), 'crit'));
}
