/* ==========================================================================
 * M1 Qualifikationscockpit · Brücke zwischen Oberfläche und Hauptprozess
 * Läuft abgeschottet (contextIsolation + Sandbox). Die Oberfläche erhält nur die
 * unten genannten Funktionen – keinen Zugriff auf Node.js oder das Dateisystem.
 * Dateipfade wählt ausschließlich der Mensch in den Dialogen des Hauptprozesses.
 * ========================================================================== */
const { contextBridge, ipcRenderer } = require('electron');

const init = ipcRenderer.sendSync('m1:init') || { info: {}, settings: {} };           // { info, settings }
const commandListeners = new Set();
ipcRenderer.on('m1:command', (_e, cmd, arg) => { for (const fn of commandListeners) fn(cmd, arg); });

contextBridge.exposeInMainWorld('m1desktop', {
  info: init.info,
  settings: {
    get: key => init.settings[key],
    set: (key, value) => { init.settings[key] = value; return ipcRenderer.invoke('m1:settings-set', key, value); }
  },
  /** Menübefehle und vom Betriebssystem übergebene Dateien. */
  onCommand: fn => { commandListeners.add(fn); },
  ready: () => ipcRenderer.send('m1:ready'),
  // Projektdateien
  openProject: () => ipcRenderer.invoke('m1:open'),
  saveProject: opts => ipcRenderer.invoke('m1:save', opts),
  recent: () => ipcRenderer.invoke('m1:recent'),
  openRecent: index => ipcRenderer.invoke('m1:open-recent', index),
  setDocument: state => ipcRenderer.send('m1:doc-state', state),
  // Ausgaben
  saveFile: opts => ipcRenderer.invoke('m1:save-file', opts),
  exportPdf: opts => ipcRenderer.invoke('m1:export-pdf', opts),
  standaloneHtml: () => ipcRenderer.invoke('m1:standalone-html'),
  // Wiederherstellungskopie
  recovery: {
    write: text => ipcRenderer.invoke('m1:recovery-write', text),
    read: () => ipcRenderer.invoke('m1:recovery-read'),
    clear: () => ipcRenderer.invoke('m1:recovery-clear')
  },
  // Schließen des Fensters
  closeAck: () => ipcRenderer.send('m1:close-ack'),
  closeNow: () => ipcRenderer.send('m1:close-now'),
  closeCancel: () => ipcRenderer.send('m1:close-cancel')
});
