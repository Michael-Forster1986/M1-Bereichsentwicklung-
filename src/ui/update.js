import { desktop, isDesktop } from '../platform/desktop.js';
import { $, html, raw, setHTML } from './dom.js';
import { toast } from './dialogs.js';
import { ACT, CHG } from './registry.js';
import { go } from './shell.js';

/* ==========================================================================
 * Oberfläche · Aktualisierung des Desktop-Programms
 * Der Hauptprozess sucht, lädt und installiert; hier steht nur, was er meldet.
 * ========================================================================== */
export let UPD = null;

const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'; };
function statusOf(u) {
  if (!u || u.mode === 'none') return ['', 'In dieser Programmfassung nicht verfügbar – die Aktualisierung arbeitet im installierten Windows-Programm.'];
  const at = u.checkedAt ? ' Zuletzt geprüft: ' + when(u.checkedAt) + '.' : '';
  if (u.phase === 'checking') return ['', 'Suche nach einer neuen Version …'];
  if (u.phase === 'current') return ['good', 'Das Programm ist aktuell.' + at];
  if (u.phase === 'available') return ['warn', 'Version ' + u.version + ' ist verfügbar.' + (u.mode === 'notify' ? ' Diese Fassung ersetzt sich nicht selbst: Installieren Sie einmal das Setup, danach aktualisiert sich das Programm von allein.' : '')];
  if (u.phase === 'downloading') return ['', 'Version ' + u.version + ' wird geladen … ' + u.percent + ' %'];
  if (u.phase === 'ready') return ['good', 'Version ' + u.version + ' ist geladen und wird beim Beenden des Programms installiert.'];
  if (u.phase === 'error') return ['warn', 'Die Suche war nicht möglich: ' + u.error + '.' + at];
  return ['', u.enabled ? 'Die erste Suche läuft kurz nach dem Start.' : 'Die automatische Suche ist ausgeschaltet.'];
}
const inner = () => {
  const u = UPD, [cls, text] = statusOf(u), usable = u && u.mode !== 'none';
  return html`<h3>Programm-Aktualisierung</h3><div class="sub">Installierte Version ${desktop.info.version || ''}</div>
    <div class="note ${cls}" id="updStatus">${text}</div>
    <div class="row" style="margin-top:10px">
      <label class="c"><input type="checkbox" data-chg="updates" ${desktop.settings.get('updates') !== false ? raw('checked') : ''} ${usable ? '' : raw('disabled')}> <span>Automatisch nach neuen Versionen suchen und sie beim Beenden installieren</span></label>
      <span class="grow"></span>
      ${usable && u.phase === 'ready' ? html`<button class="btn primary" data-act="update-install">Jetzt neu starten und installieren</button>` : ''}
      ${usable && u.phase === 'available' && u.mode === 'notify' ? html`<button class="btn" data-act="update-page">Download-Seite öffnen</button>` : ''}
      <button class="btn" data-act="update-check" ${usable && !['checking', 'downloading'].includes(u.phase) ? '' : raw('disabled')}>Jetzt suchen</button></div>
    <p class="small muted" style="margin-top:8px">Abgerufen werden nur die Versionsangabe und – wenn es eine neuere gibt – das Installationsprogramm aus den Veröffentlichungen des Projekts auf GitHub. Aus dem Programm wird dabei nichts übertragen: keine Projektdaten, keine Namen, keine Einstellungen.</p>`;
};
/** Karte für „Daten & Datenschutz“ (nur im Desktop-Programm). */
export const updateCard = () => isDesktop && desktop.update ? html`<div class="card" id="updCard">${inner()}</div>` : '';

/** Neuer Stand vom Hauptprozess. Meldet sich nur, wenn etwas zu tun oder zu wissen ist. */
export function setUpdate(st, quiet = false) {
  const before = UPD; UPD = st;
  const card = $('#updCard'); if (card) setHTML(card, inner());
  if (quiet || !st || (before && before.phase === st.phase)) return;
  if (st.phase === 'ready') toast('Version ' + st.version + ' ist geladen und wird beim Beenden installiert', '', { label: 'Jetzt neu starten', run: () => ACT['update-install']() });
  else if (st.phase === 'available' && st.mode === 'notify') toast('Version ' + st.version + ' ist verfügbar', '', { label: 'Anzeigen', run: () => go('data') });
}
export function initUpdate() {
  if (!isDesktop || !desktop.update) return;
  desktop.update.state().then(st => setUpdate(st, true), () => {});
}

ACT['update-check'] = async () => {
  if (!isDesktop || !desktop.update) return;
  if (!UPD || UPD.mode === 'none') return toast('Die Aktualisierung arbeitet nur im installierten Windows-Programm');
  toast('Suche nach einer neuen Version …');
  const st = await desktop.update.check();
  setUpdate(st, true);
  const [cls, text] = statusOf(st);
  if (st.phase === 'ready') toast(text, '', { label: 'Jetzt neu starten', run: () => ACT['update-install']() });
  else toast(text, cls === 'warn' && st.phase === 'error' ? 'crit' : '');
};
ACT['update-install'] = async () => { if (!(await desktop.update.install())) toast('Es liegt keine geladene Version bereit'); };
ACT['update-page'] = () => desktop.update.openPage();
CHG.updates = t => {
  desktop.settings.set('updates', t.checked);
  toast(t.checked ? 'Automatische Aktualisierung eingeschaltet' : 'Automatische Aktualisierung ausgeschaltet – das Programm baut jetzt keine Verbindung nach außen mehr auf');
};
