/* ==========================================================================
 * M1 Qualifikationscockpit · Hauptprozess des Desktop-Programms
 *
 * Aufgaben: Fenster und Menü, Projektdateien öffnen und speichern (mit
 * Sicherungskopie), zuletzt geöffnete Dateien, Wiederherstellungskopie,
 * PDF-Ausgabe. Die Oberfläche läuft abgeschottet und ohne Netzwerkzugriff:
 * geladen wird ausschließlich aus dem Programmpaket (app://cockpit/…).
 * ========================================================================== */
import { app, BrowserWindow, Menu, dialog, ipcMain, protocol, screen, session } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const APP_DIR = path.join(ROOT, 'dist', 'app');
const STANDALONE_HTML = path.join(ROOT, 'dist', 'standalone', 'M1_Qualifikationscockpit.html');
const ICON = path.join(ROOT, 'build', 'icon.png');
const APP_NAME = 'M1 Qualifikationscockpit';
const EXT = 'm1cockpit';
const ORIGIN = 'app://cockpit';
const DEV_URL = app.isPackaged ? '' : (process.env.M1_DEV_URL || '');     // nur beim Entwickeln: Vite-Server
const START_URL = DEV_URL || ORIGIN + '/index.html';
const MAX_FILE = 60e6;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true } }]);

// ---------- Einstellungen (Benutzerprofil) ----------------------------------
const settings = { recovery: false, backups: true, recent: [], lastDir: '', exportDir: '', bounds: null };
const settingsFile = () => path.join(app.getPath('userData'), 'einstellungen.json');
const recoveryFile = () => path.join(app.getPath('userData'), 'Wiederherstellung.' + EXT);
function loadSettings() {
  try {
    const x = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings.recovery = x.recovery === true;
    settings.backups = x.backups !== false;
    settings.recent = (Array.isArray(x.recent) ? x.recent : []).filter(f => typeof f === 'string').slice(0, 8);
    for (const k of ['lastDir', 'exportDir']) settings[k] = typeof x[k] === 'string' ? x[k] : '';
    settings.bounds = x.bounds && typeof x.bounds === 'object' ? x.bounds : null;
  } catch (err) { /* erster Start oder Datei nicht lesbar: Vorgaben gelten */ }
}
function saveSettings() {
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); }
  catch (err) { console.error('Einstellungen nicht gespeichert:', err.message); }
}
const existingDir = (...dirs) => dirs.find(d => { try { return d && fs.statSync(d).isDirectory(); } catch (err) { return false; } }) || app.getPath('documents');

// ---------- Dateien ----------------------------------------------------------
// Pfade kennt nur der Hauptprozess. Die Oberfläche erhält je Datei einen Schlüssel und kann
// damit ausschließlich in Dateien schreiben, die ein Mensch im Dateidialog gewählt hat.
const docs = new Map();
function tokenFor(file) {
  for (const [token, f] of docs) if (f === file) return token;
  const token = crypto.randomUUID(); docs.set(token, file); return token;
}
// eslint-disable-next-line no-control-regex -- Steuerzeichen sind in Dateinamen nicht erlaubt
const safeName = (name, fallback) => (String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 180)) || fallback;
async function writeAtomic(file, data) {
  const tmp = file + '.~' + process.pid + '.tmp';
  try { await fsp.writeFile(tmp, data); await fsp.rename(tmp, file); }
  catch (err) { await fsp.rm(tmp, { force: true }).catch(() => {}); await fsp.writeFile(file, data); }   // z. B. Netzlaufwerk ohne Umbenennen
}
async function readProjectFile(file) {
  const stat = await fsp.stat(file);
  if (!stat.isFile()) throw new Error('Keine Datei');
  if (stat.size > MAX_FILE) throw new Error('Datei zu groß (max. 60 MB)');
  const text = await fsp.readFile(file, 'utf8');
  addRecent(file);
  return { token: tokenFor(file), name: path.basename(file), path: file, text };
}
function addRecent(file) {
  settings.recent = [file, ...settings.recent.filter(f => f !== file)].slice(0, 8);
  settings.lastDir = path.dirname(file);
  saveSettings(); buildMenu();
  try { app.addRecentDocument(file); } catch (err) { /* nicht auf jedem System verfügbar */ }
}
function dropRecent(file) { settings.recent = settings.recent.filter(f => f !== file); saveSettings(); buildMenu(); }
const fileFromArgv = (argv, cwd = process.cwd()) => {
  for (const a of argv.slice(1)) {
    if (a.startsWith('-') || !/\.(m1cockpit|json|html?)$/i.test(a)) continue;
    const f = path.resolve(cwd, a);
    if (fs.existsSync(f)) return f;
  }
  return null;
};

// ---------- Fenster ----------------------------------------------------------
let win = null, rendererReady = false, pendingFile = null, closing = false, closeTimer = null;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
async function serveApp(request) {
  const url = new URL(request.url);
  if (url.host !== 'cockpit') return new Response('', { status: 404 });
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.normalize(path.join(APP_DIR, rel));
  if (!file.startsWith(APP_DIR + path.sep)) return new Response('', { status: 403 });
  try {
    return new Response(await fsp.readFile(file), { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' } });
  } catch (err) { return new Response('', { status: 404 }); }
}
/** Das Programm baut keine Netzwerkverbindungen auf; alles außer den eigenen Programmdateien wird abgewiesen. */
function lockDown() {
  const ses = session.defaultSession, devWs = DEV_URL.replace(/^http/, 'ws');
  ses.webRequest.onBeforeRequest((details, cb) => {
    const u = details.url;
    const ok = u.startsWith(ORIGIN + '/') || u.startsWith('blob:') || u.startsWith('data:') || u.startsWith('devtools:')
      || (!!DEV_URL && (u.startsWith(DEV_URL) || u.startsWith(devWs)));
    cb({ cancel: !ok });
  });
  ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
}
function visibleBounds(b) {
  if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return {};
  const hit = screen.getAllDisplays().some(d => b.x < d.workArea.x + d.workArea.width - 80 && b.x + b.width > d.workArea.x + 80 && b.y >= d.workArea.y - 10 && b.y < d.workArea.y + d.workArea.height - 80);
  return hit ? { x: b.x, y: b.y } : {};
}
function createWindow() {
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: Math.max(980, b.width || 1440), height: Math.max(640, b.height || 900), ...visibleBounds(b),
    minWidth: 980, minHeight: 640, show: false, backgroundColor: '#f1f3f6', title: APP_NAME,
    ...(fs.existsSync(ICON) ? { icon: ICON } : {}),
    webPreferences: { preload: path.join(HERE, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false }
  });
  if (b.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('page-title-updated', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (url !== START_URL) e.preventDefault(); });
  win.webContents.on('did-start-loading', () => { rendererReady = false; });
  win.on('close', onClose);
  win.on('closed', () => { win = null; });
  win.loadURL(START_URL);
}
function rememberBounds() {
  if (!win) return;
  settings.bounds = { ...win.getNormalBounds(), maximized: win.isMaximized() };
  saveSettings();
}
/** Schließen fragt zuerst die Oberfläche (ungespeicherte Änderungen). Antwortet sie nicht, entscheidet der Mensch. */
function onClose(e) {
  rememberBounds();
  if (closing || !rendererReady) return;
  e.preventDefault();
  win.webContents.send('m1:command', 'close-request');
  clearTimeout(closeTimer);
  closeTimer = setTimeout(async () => {
    if (!win) return;
    const r = await dialog.showMessageBox(win, { type: 'warning', title: APP_NAME, message: 'Das Programm reagiert nicht.',
      detail: 'Beim Schließen gehen ungespeicherte Änderungen verloren.', buttons: ['Weiter warten', 'Trotzdem schließen'], defaultId: 0, cancelId: 0, noLink: true });
    if (r.response === 1 && win) { closing = true; win.destroy(); }
  }, 4000);
}

// ---------- Menü ---------------------------------------------------------------
const VIEW_ITEMS = [['overview', 'Übersicht'], ['year', 'Jahresplan'], ['capacity', 'Kapazität'], ['courses', 'Lehrgänge'], ['people', 'Personen && Cluster'],
  ['routes', 'Ausbildungswege'], ['events', 'Termine'], ['absences', 'Abwesenheiten && Kalender'], ['report', 'Bericht'], ['data', 'Daten && Datenschutz'], ['help', 'Anleitung']];
const send = (cmd, arg) => () => { if (win && rendererReady) win.webContents.send('m1:command', cmd, arg); };
async function deliverFile(file) {
  if (!win) return;
  if (!rendererReady) { pendingFile = file; return; }
  try { win.webContents.send('m1:command', 'open-file', await readProjectFile(file)); }
  catch (err) {
    dropRecent(file);
    dialog.showMessageBox(win, { type: 'error', title: APP_NAME, message: 'Die Datei kann nicht geöffnet werden.', detail: path.basename(file) + '\n' + err.message });
  }
}
function about() {
  dialog.showMessageBox(win, { type: 'info', title: 'Über ' + APP_NAME, message: APP_NAME + ' ' + app.getVersion(),
    detail: 'Jahresplanung von Qualifikationsmaßnahmen mit Kapazitätsprüfung.\n\nDas Programm arbeitet vollständig lokal: Es baut keine Netzwerkverbindungen auf und überträgt keine Daten. '
      + 'Projektdateien liegen dort, wo Sie sie speichern.\n\nPlanungswerkzeug – keine zertifizierte Qualifikations- oder Produktionsfreigabe.\n\n'
      + 'Electron ' + process.versions.electron + ' · Chromium ' + process.versions.chrome });
}
function buildMenu() {
  const sep = { type: 'separator' };
  const recent = settings.recent.length
    ? [...settings.recent.map((f, i) => ({ label: (i + 1) + '  ' + path.basename(f).replace(/&/g, '&&'), toolTip: f, click: () => deliverFile(f) })), sep,
      { label: 'Liste leeren', click: () => { settings.recent = []; saveSettings(); buildMenu(); try { app.clearRecentDocuments(); } catch (err) { /* nicht verfügbar */ } } }]
    : [{ label: 'Noch keine Dateien', enabled: false }];
  const template = [
    { label: '&Datei', submenu: [
      { label: 'Neues Projekt …', accelerator: 'CmdOrCtrl+N', click: send('act', 'new-empty') },
      { label: 'Demo-Daten erzeugen …', click: send('act', 'load-demo') },
      sep,
      { label: 'Öffnen …', accelerator: 'CmdOrCtrl+O', click: send('act', 'load-project') },
      { label: 'Zuletzt geöffnet', submenu: recent },
      sep,
      { label: 'Speichern', accelerator: 'CmdOrCtrl+S', registerAccelerator: false, click: send('act', 'save-project') },
      { label: 'Speichern unter …', accelerator: 'CmdOrCtrl+Shift+S', click: send('act', 'save-project-as') },
      sep,
      { label: 'Exportieren', submenu: [
        { label: 'Gesamtbericht als PDF …', click: send('act', 'export-pdf-report') },
        { label: 'Aktuelle Ansicht als PDF …', click: send('act', 'export-pdf-view') },
        { label: 'Excel-Arbeitsmappe …', click: send('act', 'export-xlsx') },
        sep,
        { label: 'Programm mit Stand als HTML-Datei …', click: send('act', 'save-snapshot') },
        { label: 'Pseudonymisierte Projektdatei …', click: send('act', 'exp-pseudo') }] },
      { label: 'Drucken …', accelerator: 'CmdOrCtrl+P', click: send('act', 'print') },
      sep,
      { label: 'Beenden', accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4', click: () => win && win.close() }] },
    { label: '&Bearbeiten', submenu: [
      // Strg+Z / Strg+Y wertet die Oberfläche selbst aus, damit Eingabefelder ihr eigenes Rückgängig behalten
      { label: 'Rückgängig', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: send('act', 'undo') },
      { label: 'Wiederholen', accelerator: 'CmdOrCtrl+Y', registerAccelerator: false, click: send('act', 'redo') },
      sep,
      { label: 'Ausschneiden', role: 'cut' }, { label: 'Kopieren', role: 'copy' }, { label: 'Einfügen', role: 'paste' }, { label: 'Alles auswählen', role: 'selectAll' }] },
    { label: '&Ansicht', submenu: [
      ...VIEW_ITEMS.map(([id, label], i) => ({ label, ...(i < 9 ? { accelerator: 'CmdOrCtrl+' + (i + 1) } : {}), click: send('go', id) })),
      sep,
      { label: 'Namen verbergen / anzeigen', click: send('act', 'toggle-privacy') },
      { label: 'Hell / Dunkel', click: send('act', 'toggle-theme') },
      sep,
      { label: 'Vergrößern', role: 'zoomIn' }, { label: 'Verkleinern', role: 'zoomOut' }, { label: 'Originalgröße', role: 'resetZoom' },
      sep,
      { label: 'Vollbild', role: 'togglefullscreen' },
      ...(app.isPackaged && !process.env.M1_DEVTOOLS ? [] : [sep, { label: 'Entwicklerwerkzeuge', role: 'toggleDevTools' }])] },
    { label: '&Planung', submenu: [
      { label: 'Neu berechnen …', accelerator: 'F9', click: send('act', 'plan') },
      sep,
      { label: 'Folgejahr anlegen …', click: send('act', 'year-add') },
      { label: 'Planungsjahre verwalten', click: send('act', 'years-manage') }] },
    { label: '&Hilfe', submenu: [
      { label: 'Anleitung', accelerator: 'F1', click: send('go', 'help') },
      { label: 'Daten && Datenschutz', click: send('go', 'data') },
      sep,
      { label: 'Über ' + APP_NAME, click: about }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- Schnittstelle zur Oberfläche -------------------------------------------
const trusted = e => !!win && e.sender === win.webContents && (!e.senderFrame || e.senderFrame === win.webContents.mainFrame);
const handle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => { if (!trusted(e)) throw new Error('Nicht zulässig'); return fn(...args); });
const on = (channel, fn) => ipcMain.on(channel, (e, ...args) => { if (trusted(e)) fn(e, ...args); });

ipcMain.on('m1:init', e => {
  e.returnValue = trusted(e) ? { info: { version: app.getVersion(), platform: process.platform, ext: EXT }, settings: { recovery: settings.recovery, backups: settings.backups } } : null;
});
on('m1:ready', () => { rendererReady = true; if (pendingFile) { const f = pendingFile; pendingFile = null; deliverFile(f); } });
on('m1:doc-state', (_e, st) => {
  if (!win) return;
  const name = String((st && st.name) || '').slice(0, 200), dirty = !!(st && st.dirty);
  win.setTitle((dirty ? '• ' : '') + (name || 'Unbenanntes Projekt') + ' – ' + APP_NAME);
  if (process.platform === 'darwin') win.setDocumentEdited(dirty);
});
on('m1:close-ack', () => clearTimeout(closeTimer));
on('m1:close-cancel', () => clearTimeout(closeTimer));
on('m1:close-now', () => { clearTimeout(closeTimer); closing = true; if (win) win.close(); });

handle('m1:settings-set', (key, value) => {
  if (key !== 'recovery' && key !== 'backups') throw new Error('Unbekannte Einstellung');
  settings[key] = value === true; saveSettings(); return true;
});
handle('m1:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Projekt öffnen', defaultPath: existingDir(settings.lastDir), properties: ['openFile'], filters: [
    { name: 'M1-Cockpit-Projekte', extensions: [EXT, 'json'] }, { name: 'Dateien der Vorgängerversion', extensions: ['html', 'htm', 'json'] }, { name: 'Alle Dateien', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return readProjectFile(r.filePaths[0]);
});
handle('m1:recent', () => settings.recent.map((f, index) => ({ index, name: path.basename(f), dir: path.dirname(f) })));
handle('m1:open-recent', async index => {
  const file = settings.recent[index];
  if (!file) return null;
  try { return await readProjectFile(file); } catch (err) { dropRecent(file); throw new Error('Datei nicht mehr vorhanden: ' + path.basename(file), { cause: err }); }
});
handle('m1:save', async opts => {
  const text = opts && opts.text;
  if (typeof text !== 'string' || !text || text.length > 2 * MAX_FILE) throw new Error('Ungültiger Inhalt');
  let file = (opts.token && docs.get(opts.token)) || '';
  if (!file) {
    const r = await dialog.showSaveDialog(win, { title: 'Projekt speichern unter', defaultPath: path.join(existingDir(settings.lastDir), safeName(opts.suggestedName, 'M1_Cockpit_Projekt.' + EXT)),
      filters: [{ name: 'M1-Cockpit-Projekt', extensions: [EXT] }, { name: 'JSON-Datei', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    file = path.extname(r.filePath) ? r.filePath : r.filePath + '.' + EXT;
  }
  let backup = false;
  if (settings.backups && fs.existsSync(file)) { try { await fsp.copyFile(file, file + '.bak'); backup = true; } catch (err) { /* Sicherungskopie nicht möglich: Speichern geht vor */ } }
  await writeAtomic(file, text);
  addRecent(file);
  return { token: tokenFor(file), name: path.basename(file), path: file, backup };
});
const FILE_KINDS = { csv: 'CSV-Datei', json: 'JSON-Datei', html: 'HTML-Datei', xlsx: 'Excel-Arbeitsmappe', pdf: 'PDF-Dokument', [EXT]: 'M1-Cockpit-Projekt' };
async function askTarget(suggestedName, fallback) {
  const name = safeName(suggestedName, fallback), ext = path.extname(name).slice(1).toLowerCase();
  const r = await dialog.showSaveDialog(win, { title: 'Speichern unter', defaultPath: path.join(existingDir(settings.exportDir, settings.lastDir), name),
    filters: ext ? [{ name: FILE_KINDS[ext] || ext.toUpperCase() + '-Datei', extensions: [ext] }] : [] });
  if (r.canceled || !r.filePath) return null;
  settings.exportDir = path.dirname(r.filePath); saveSettings();
  return ext && !path.extname(r.filePath) ? r.filePath + '.' + ext : r.filePath;
}
handle('m1:save-file', async opts => {
  const data = opts && opts.data;
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : data instanceof ArrayBuffer ? Buffer.from(data) : null;
  if (!buf || buf.length > 4 * MAX_FILE) throw new Error('Ungültiger Inhalt');
  const file = await askTarget(opts.suggestedName, 'Export.txt');
  if (!file) return null;
  await writeAtomic(file, buf);
  return path.basename(file);
});
const escHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
handle('m1:export-pdf', async opts => {
  const file = await askTarget(opts && opts.suggestedName, 'Bericht.pdf');
  if (!file) return null;
  const foot = 'font-size:7.5px;font-family:Segoe UI,Arial,sans-serif;color:#6b7480;width:100%;padding:0 10mm;display:flex;justify-content:space-between';
  const data = await win.webContents.printToPDF({ landscape: !!(opts && opts.landscape), pageSize: 'A4', printBackground: true,
    margins: { top: 0.45, bottom: 0.6, left: 0.4, right: 0.4 }, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="' + foot + '"><span>' + escHtml(opts && opts.footer) + '</span><span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span></div>' });
  await writeAtomic(file, data);
  return path.basename(file);
});
handle('m1:standalone-html', () => fsp.readFile(STANDALONE_HTML, 'utf8'));
handle('m1:recovery-write', async text => {
  if (!settings.recovery || typeof text !== 'string' || text.length > 2 * MAX_FILE) return false;
  await writeAtomic(recoveryFile(), text); return true;
});
handle('m1:recovery-read', async () => {
  try { const st = await fsp.stat(recoveryFile()); return { text: await fsp.readFile(recoveryFile(), 'utf8'), at: st.mtime.toISOString() }; }
  catch (err) { return null; }
});
handle('m1:recovery-clear', async () => { await fsp.rm(recoveryFile(), { force: true }); return true; });

// ---------- Start ------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.setName(APP_NAME);
  if (process.platform === 'win32') app.setAppUserModelId('de.m1.qualifikationscockpit');
  app.on('second-instance', (_e, argv, cwd) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const f = fileFromArgv(argv, cwd); if (f) deliverFile(f);
  });
  app.on('open-file', (e, file) => { e.preventDefault(); if (win) deliverFile(file); else pendingFile = file; });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(() => {
    loadSettings();
    protocol.handle('app', serveApp);
    lockDown();
    buildMenu();
    pendingFile = pendingFile || fileFromArgv(process.argv);
    createWindow();
  });
}
