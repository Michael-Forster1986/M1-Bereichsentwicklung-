/* ==========================================================================
 * M1 Qualifikationscockpit · Automatische Aktualisierung
 *
 * Das installierte Programm fragt die Veröffentlichungen des Projekts auf GitHub
 * nach einer neueren Version, lädt sie im Hintergrund und installiert sie beim
 * Beenden. Übertragen wird dabei nichts aus dem Programm – weder Projektdaten
 * noch Einstellungen; abgerufen werden nur die Versionsangabe und das
 * Installationsprogramm. Die Verbindung ist auf dieses eine Ziel beschränkt und
 * lässt sich unter „Daten & Datenschutz“ abschalten.
 *
 * Die portable Fassung kann sich nicht selbst ersetzen; sie meldet nur, dass es
 * eine neuere Version gibt.
 * ========================================================================== */
import { app, shell } from 'electron';
import electronUpdater from 'electron-updater';

export const REPO = { owner: 'Michael-Forster1986', repo: 'M1-Bereichsentwicklung-' };
const REPO_PATH = ('/' + REPO.owner + '/' + REPO.repo + '/').toLowerCase();
const PAGE = 'https://github.com/' + REPO.owner + '/' + REPO.repo + '/releases/latest';
const TEST_URL = app.isPackaged ? '' : (process.env.M1_UPDATE_URL || '');      // nur beim Entwickeln und in Tests
const DRY = !!process.env.M1_UPDATE_DRY;                                         // nur prüfen, nichts laden oder installieren
const FIRST_CHECK = 10_000, INTERVAL = 6 * 3600_000;

/** mode: 'install' = lädt und installiert selbst · 'notify' = meldet nur · 'none' = hier nicht verfügbar */
const state = { mode: 'none', enabled: true, phase: 'idle', current: app.getVersion(), version: '', percent: 0, checkedAt: '', error: '' };
let updater = null, notify = () => {}, log = () => {}, first = null, timer = null;

const loads = () => state.mode === 'install' && !DRY;
function set(patch) { Object.assign(state, patch); notify({ ...state }); }

/** Nur die Veröffentlichungen dieses Projekts und die Dateiablage von GitHub sind erreichbar. */
function allowed(u) {
  let url; try { url = new URL(u); } catch (err) { return false; }
  if (TEST_URL && u.startsWith(TEST_URL)) return true;
  if (url.protocol !== 'https:') return false;
  if (url.hostname === 'github.com') return url.pathname.toLowerCase().startsWith(REPO_PATH);
  return url.hostname.endsWith('.githubusercontent.com');
}
function plain(err) {
  const m = String((err && err.message) || err || '');
  if (/ERR_BLOCKED_BY_CLIENT/i.test(m)) return 'Eine Adresse außerhalb des Aktualisierungs-Ziels wurde abgewiesen';
  if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TIMED_OUT|ERR_PROXY|ERR_TUNNEL|ERR_BLOCKED|ERR_CERT|ERR_SSL|ERR_ADDRESS|ERR_NETWORK|ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i.test(m)) return 'GitHub ist von diesem Rechner aus nicht erreichbar';
  if (/\b404\b|Unable to find latest version|latest\.yml|No published versions/i.test(m)) return 'Auf GitHub ist keine veröffentlichte Version zu finden';
  if (/sha512|checksum|signature/i.test(m)) return 'Die geladene Datei ist unvollständig oder verändert – sie wird nicht installiert';
  return m.split('\n')[0].slice(0, 160) || 'Unbekannter Fehler';
}
function schedule() {
  clearTimeout(first); clearInterval(timer); first = timer = null;
  if (!updater || !state.enabled) return;
  first = setTimeout(checkForUpdate, FIRST_CHECK);
  timer = setInterval(checkForUpdate, INTERVAL);
}

export function initUpdater({ enabled = true, onChange, onLog } = {}) {
  notify = onChange || notify; log = onLog || log; state.enabled = enabled !== false;
  if (!TEST_URL && !(app.isPackaged && process.platform === 'win32')) return { ...state };
  try {
    updater = electronUpdater.autoUpdater;
    state.mode = TEST_URL || process.env.PORTABLE_EXECUTABLE_FILE ? 'notify' : 'install';
    updater.logger = null;
    updater.autoDownload = loads();
    updater.autoInstallOnAppQuit = loads() && state.enabled;
    updater.allowDowngrade = false; updater.allowPrerelease = false; updater.fullChangelog = false;
    if (TEST_URL) { updater.forceDevUpdateConfig = true; updater.setFeedURL({ provider: 'generic', url: TEST_URL }); }
    const ses = updater.netSession;
    ses.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !allowed(details.url) }));
    ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    const now = () => new Date().toISOString();
    updater.on('checking-for-update', () => set({ phase: 'checking', error: '' }));
    updater.on('update-available', info => set({ phase: loads() ? 'downloading' : 'available', version: String(info.version || ''), percent: 0, checkedAt: now() }));
    updater.on('update-not-available', () => set({ phase: 'current', version: '', checkedAt: now() }));
    updater.on('download-progress', p => { const percent = Math.round(p.percent || 0); if (percent !== state.percent) set({ phase: 'downloading', percent }); });
    updater.on('update-downloaded', info => set({ phase: 'ready', version: String(info.version || state.version), percent: 100 }));
    updater.on('error', err => { log('Aktualisierung: ' + String((err && err.message) || err).split('\n')[0].slice(0, 400)); set({ phase: 'error', error: plain(err), checkedAt: now() }); });
    schedule();
  } catch (err) { updater = null; state.mode = 'none'; log('Aktualisierung nicht verfügbar: ' + err.message); }
  return { ...state };
}
export const updateState = () => ({ ...state });
export async function checkForUpdate() {
  if (!updater || ['checking', 'downloading', 'ready'].includes(state.phase)) return { ...state };
  try { await updater.checkForUpdates(); } catch (err) { if (state.phase === 'checking') set({ phase: 'error', error: plain(err), checkedAt: new Date().toISOString() }); }
  return { ...state };
}
export function setUpdatesEnabled(on) {
  state.enabled = on === true;
  if (updater) updater.autoInstallOnAppQuit = loads() && state.enabled;
  schedule(); notify({ ...state });
}
/** true, wenn eine geladene Version bereitliegt und das Programm sie selbst installieren kann. */
export const updateReady = () => !!updater && loads() && state.phase === 'ready';
/** Beendet das Programm, installiert die geladene Version und startet sie. */
export function installNow() { if (updateReady()) updater.quitAndInstall(true, true); }
export const openReleasePage = () => shell.openExternal(PAGE);
