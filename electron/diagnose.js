/* ==========================================================================
 * M1 Qualifikationscockpit · Fehleraufzeichnung
 *
 * Hält fest, wenn das Fenster nicht mehr reagiert oder die Oberfläche einen
 * Fehler meldet: Zeitpunkt, Programmversion, die zuletzt ausgelöste Aktion und –
 * soweit ermittelbar – die Stelle im Programmcode. Projektdaten, Namen oder
 * Dateiinhalte stehen nicht im Protokoll. Es liegt nur auf diesem Rechner.
 * ========================================================================== */
import { app, dialog, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const MAX = 200_000;
let lastAction = '', lastAt = 0;
export const logFile = () => path.join(app.getPath('userData'), 'Fehlerprotokoll.txt');

export function logLine(text) {
  try {
    const f = logFile(); fs.mkdirSync(path.dirname(f), { recursive: true });
    let old = ''; try { old = fs.readFileSync(f, 'utf8'); } catch (err) { /* noch kein Protokoll */ }
    if (old.length > MAX) old = old.slice(old.indexOf('\n', old.length - MAX / 2) + 1);
    const entry = new Date().toISOString() + '  Version ' + app.getVersion() + '  ' + String(text).slice(0, 6000).replace(/\r?\n/g, '\n    ');
    fs.writeFileSync(f, old + entry + '\n');
  } catch (err) { console.error('Fehlerprotokoll nicht geschrieben:', err.message); }
}
/** Merkt sich die zuletzt ausgelöste Aktion der Oberfläche (nur ihr Name, keine Inhalte). */
export function trace(name) { lastAction = String(name || '').slice(0, 80); lastAt = Date.now(); }
const lastText = () => lastAction ? 'letzte Aktion: ' + lastAction + ' (vor ' + Math.round((Date.now() - lastAt) / 1000) + ' s)' : 'letzte Aktion: unbekannt';

/** Überwacht ein Fenster: reagiert es nicht mehr, wird die Stelle aufgezeichnet und Neuladen angeboten. */
export function watchWindow(win, { title, recoveryOn }) {
  let ask = null, reloading = false;
  const reload = () => { reloading = true; try { win.webContents.forcefullyCrashRenderer(); } catch (err) { /* schon beendet */ } win.webContents.reload(); };
  const detail = () => 'Beim Neuladen gehen ungespeicherte Änderungen verloren' + (recoveryOn() ? ' – die Wiederherstellungskopie wird danach angeboten.' : '.')
    + '\n\nDie Stelle ist im Fehlerprotokoll festgehalten (Menü Hilfe → Fehlerprotokoll anzeigen).';
  win.on('unresponsive', async () => {
    let stack = '';
    try { stack = (await Promise.race([win.webContents.mainFrame.collectJavaScriptCallStack(), new Promise(r => setTimeout(() => r(''), 3000))])) || ''; } catch (err) { /* nicht ermittelbar */ }
    logLine('Fenster reagiert nicht · ' + lastText() + (stack ? '\n' + String(stack).trim() : '\n(Stelle im Programmcode nicht ermittelbar)'));
    if (ask || win.isDestroyed()) return;
    ask = new AbortController();
    const r = await dialog.showMessageBox(win, { type: 'warning', title, message: 'Das Programm reagiert gerade nicht.', detail: detail(),
      buttons: ['Weiter warten', 'Programm neu laden'], defaultId: 0, cancelId: 0, noLink: true, signal: ask.signal }).catch(() => null);
    ask = null;
    if (r && r.response === 1 && !win.isDestroyed()) reload();
  });
  win.on('responsive', () => { if (ask) { ask.abort(); ask = null; } });
  win.webContents.on('render-process-gone', async (_e, d) => {
    if (reloading) { reloading = false; return; }
    if (d.reason === 'clean-exit' || win.isDestroyed()) return;
    logLine('Oberfläche unerwartet beendet (' + d.reason + ', Code ' + d.exitCode + ') · ' + lastText());
    const r = await dialog.showMessageBox(win, { type: 'error', title, message: 'Die Oberfläche wurde unerwartet beendet.', detail: detail(),
      buttons: ['Programm neu laden', 'Schließen'], defaultId: 0, cancelId: 1, noLink: true }).catch(() => null);
    if (r && r.response === 0 && !win.isDestroyed()) win.webContents.reload();
  });
}
/** Zeigt das Protokoll im Dateimanager – oder sagt, dass es noch keines gibt. */
export function showLog(win, title) {
  if (fs.existsSync(logFile())) return shell.showItemInFolder(logFile());
  dialog.showMessageBox(win, { type: 'info', title, message: 'Bisher ist kein Fehler aufgezeichnet.', detail: 'Das Protokoll entsteht erst, wenn das Programm einmal nicht reagiert oder einen Fehler meldet. Es enthält keine Projektdaten.' });
}
