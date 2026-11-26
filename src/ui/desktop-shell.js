import * as Core from '../core/index.js';
import { desktop, isDesktop } from '../platform/desktop.js';
import { html } from './dom.js';
import { fmt } from './format.js';
import { DOC, PRJ, autosaveOn, dirty, markUnsaved, redo, replaceProject, undo, years } from './state.js';
import { closeModal, openModal, safe, toast } from './dialogs.js';
import { ACT } from './registry.js';
import { go } from './shell.js';
import { presentLoad, refreshRecent, saveProject } from './project-files.js';

/* ==========================================================================
 * Oberfläche · Desktop-Programm: Menübefehle, Dateien vom Betriebssystem,
 * Nachfrage beim Schließen, Wiederherstellung nach einem Absturz.
 * In der Einzeldatei-Variante für den Browser bleibt dieses Modul untätig.
 * ========================================================================== */
const onlyDemo = () => years().every(y => PRJ.years[y].meta.dataClass === 'demo');

/** Fenster schließen: bei ungesicherten Änderungen zuerst fragen. Reine Demo-Daten ohne Datei gelten nicht als schützenswert. */
async function closeRequest() {
  desktop.closeAck();
  if (!dirty || (onlyDemo() && !DOC.token)) { await desktop.recovery.clear(); return desktop.closeNow(); }
  const choice = await new Promise(resolve => openModal({ title: 'Änderungen speichern?',
    body: html`<p>${DOC.name ? '„' + DOC.name + '“' : 'Das Projekt'} enthält Änderungen, die noch nicht gespeichert sind.</p>`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn danger" data-act="m:discard">Nicht speichern</button><button class="btn primary" data-act="m:save" autofocus>Speichern</button>`,
    handlers: { discard: () => closeModal('discard'), save: () => closeModal('save') }, onClose: r => resolve(r || 'cancel') }));
  if (choice === 'cancel') return desktop.closeCancel();
  if (choice === 'save' && !(await saveProject(false))) return desktop.closeCancel();
  await desktop.recovery.clear();
  desktop.closeNow();
}
function command(cmd, arg) {
  if (cmd === 'close-request') return closeRequest();
  if (cmd === 'go') return go(arg);
  if (cmd === 'open-file') return presentLoad(arg.text, arg.name, { token: arg.token, name: arg.name, path: arg.path });
  if (cmd === 'act') {
    if (arg === 'undo') return undo();
    if (arg === 'redo') return redo();
    if (ACT[arg]) return ACT[arg]();
  }
}
async function offerRecovery() {
  if (!autosaveOn()) return;
  const r = await desktop.recovery.read(); if (!r) return;
  let res; try { res = Core.loadProject(r.text); } catch (err) { return; }
  const people = res.project.years[res.project.active].people.length;
  toast('Wiederherstellungskopie vom ' + fmt(String(r.at).slice(0, 10)) + ' gefunden (' + people + ' Personen) – die letzte Sitzung endete mit ungespeicherten Änderungen', '',
    { label: 'Wiederherstellen', run: () => { replaceProject(res.project, 'Stand aus der Wiederherstellungskopie geladen – bitte speichern'); markUnsaved(); } });
}
export function initDesktop() {
  if (!isDesktop) return;
  document.documentElement.dataset.desktop = '1';
  desktop.onCommand((cmd, arg) => safe(() => command(cmd, arg)));
  safe(offerRecovery);
  refreshRecent();
  desktop.ready();                       // ab jetzt stellt der Hauptprozess Dateien und Menübefehle zu
}
