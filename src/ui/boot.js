import * as Core from '../core/index.js';
import { isDesktop, logError } from '../platform/desktop.js';
import { $ } from './dom.js';
import { fmt } from './format.js';
import { LS, UI, autosaveOn, practiceOn, replaceProject, setProject, store } from './state.js';
import { toast } from './dialogs.js';
import { VIEWS } from './registry.js';
import { applyTheme, render } from './shell.js';
import { initDesktop } from './desktop-shell.js';

// ---------- Start --------------------------------------------------------------
export function boot() {
  applyTheme(store.get(LS.theme) || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  let prj = null, note = null;
  try { const emb = JSON.parse($('#embedded-state').textContent || 'null'); if (emb) { prj = Core.sanitizeAny(emb).project; note = 'Eingebetteter Planungsstand geladen'; } }
  catch (err) { console.error(err); note = 'Eingebetteter Stand nicht lesbar'; }
  let saved = null;
  if (!prj && !isDesktop && autosaveOn()) { try { const x = JSON.parse(store.get(LS.project) || store.get(LS.state) || 'null'); if (x) saved = Core.sanitizeAny(x).project; } catch (err) { saved = null; } }
  // Normalbetrieb: leer. Nur im Übungsmodus füllt sich das Fenster mit simulierten Daten.
  setProject(prj || Core.wrapProject(practiceOn() ? Core.demoState({ year: Core.planningYear() }) : Core.newProjectState(Core.planningYear())));
  render();
  if (note) toast(note);
  if (saved) { const st = saved.years[saved.active]; toast('Im Browser liegt ein zwischengespeicherter Stand (' + st.people.length + ' Personen, ' + fmt(String(st.meta.modified).slice(0, 10)) + ')', '', { label: 'Wiederherstellen', run: () => replaceProject(saved, 'Zwischengespeicherter Stand wiederhergestellt') }); }
  let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const v = VIEWS[UI.view]; if (v && v.resize) v.resize($('#main')); }, 120); });
  window.addEventListener('error', e => { logError(e.error || e.message, 'Programmfehler'); toast('Programmfehler: ' + e.message, 'crit'); });
  window.addEventListener('unhandledrejection', e => { logError(e.reason, 'Unbehandelter Fehler'); toast('Fehler: ' + (e.reason?.message || e.reason), 'crit'); });
  initDesktop();
}
