import * as Core from '../core/index.js';
import { desktop, isDesktop } from '../platform/desktop.js';
import { toast } from './dialogs.js';
import { render } from './shell.js';
import { syncMeasures } from './measure-labels.js';

// ---------- Zustand --------------------------------------------------------
// PRJ ist das Projekt (ein oder mehrere Planungsjahre), S der Stand des aktiven Jahres.
// Alle Ansichten und Rechenwege arbeiten auf S; IX, SUM, CONF, PROG sind daraus abgeleitet.
export let PRJ = null, S = null, IX = null, SUM = null, CONF = new Map(), PROG = new Map(), ALIAS = new Map(), dirty = false;
/** Termine mit echtem Konflikt. Reine Hinweise (z. B. Dienstplananpassung im Lehrgang) stehen in CONF, zählen hier aber nicht. */
export let HARD = 0;
export const hist = [], future = [];
/** Geöffnete Datei (nur Desktop-Programm): Schlüssel beim Hauptprozess, Anzeigename, Kennung des gesicherten Stands. */
export const DOC = { token: '', name: '', path: '', clean: '' };
export const UI = {
  view: 'overview', q: '', cluster: '', gStatus: '', gSort: 'list', gGroup: false, gZoom: 1, gHide: new Set(),
  capArea: 0, capRange: 'year', capOnlyCrit: true, evQ: '', evType: '', evOrigin: '', repStatus: '', absQ: '',
  routeCluster: '1', routePerson: '', drawer: null, tec: null, tecResult: null, limit: 300
};
export const LS = { state: 'm1cockpit.v4.state', project: 'm1cockpit.v5.project', on: 'm1cockpit.v4.autosave', theme: 'm1cockpit.theme', practice: 'm1cockpit.practice', drawerWide: 'm1cockpit.drawerWide' };
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* nicht verfügbar */ } }
};
export const privacy = () => !!S.meta.privacy;
export const pName = p => privacy() ? p.alias : p.name;
export const pSub = p => privacy() ? '' : p.pk;
export const nameOf = pk => { const p = IX.people.get(pk); return p ? pName(p) : (privacy() ? 'Unbekannt' : pk); };
export const sortKey = p => privacy() ? p.alias : p.name;
/** Person zu einem DOM-Schlüssel. Im Dokument steht nur das Pseudonym, nie die Personalnummer. */
export const P = id => ALIAS.get(id) || null;
export const pidOf = pk => IX.people.get(pk)?.alias || '';
export const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
export const years = () => Core.projectYears(PRJ);

export function recompute() {
  syncMeasures(S);
  IX = Core.buildIndex(S);
  SUM = Core.summarize(S, IX);
  CONF = new Map(Core.findConflicts(S, IX).map(c => [c.id, c]));
  HARD = 0; for (const c of CONF.values()) if (c.hard.length) HARD++;
  PROG = new Map(S.people.map(p => [p.pk, Core.routeProgress(S, IX, p)]));
  ALIAS = new Map(S.people.map(p => [p.alias, p]));
}

// ---------- Gesichert / ungesichert ---------------------------------------
/** Kennung des Projektstands: ändert sich mit jeder Änderung und kehrt beim Rückgängigmachen zurück. */
const signature = () => years().map(y => y + '@' + PRJ.years[y].meta.modified).join('|');
function syncDoc() {
  dirty = !!PRJ && signature() !== DOC.clean;
  if (isDesktop) desktop.setDocument({ name: DOC.name, dirty, year: S ? S.meta.year : 0 });
}
/** Nach dem Sichern: aktueller Stand gilt als gesichert; optional neue Datei (Sichern unter). */
export function markSaved(doc = null) {
  if (doc) Object.assign(DOC, doc);
  DOC.clean = signature();
  syncDoc();
}
/** Stand gilt als ungesichert (z. B. nach dem Wiederherstellen einer Kopie). */
export function markUnsaved() { DOC.clean = ''; syncDoc(); }
/** Höchste Schutzklasse über alle Planungsjahre: real vor pseudonymisiert vor Demo vor leer. */
export const projectClass = () => ['real', 'pseudo', 'demo', 'empty'].find(c => years().some(y => PRJ.years[y].meta.dataClass === c)) || 'empty';
const nextStamp = prev => {
  const now = new Date().toISOString();
  return now > String(prev || '') ? now : new Date(Date.parse(prev) + 1).toISOString();
};

// ---------- Rückgängig -------------------------------------------------------
// Einträge: { y, s } = Stand eines Planungsjahres · { p, doc } = ganzes Projekt samt Dateibezug
const push = (stack, entry) => { stack.push(entry); if (stack.length > 30) stack.shift(); };
const snapProject = () => ({ p: JSON.stringify(PRJ), doc: { ...DOC } });
function restore(entry, other) {
  if (entry.p) {
    push(other, snapProject());
    PRJ = JSON.parse(entry.p); Object.assign(DOC, entry.doc);
    resetSelection();
  } else {
    push(other, { y: entry.y, s: JSON.stringify(PRJ.years[entry.y]) });
    if (PRJ.active !== entry.y) resetSelection();
    PRJ.years[entry.y] = JSON.parse(entry.s); PRJ.active = entry.y;
  }
  S = PRJ.years[PRJ.active];
  recompute(); syncDoc(); render(); autosave();
}
function resetSelection() { UI.drawer = null; UI.tecResult = null; UI.tec = null; }

/** Führt eine Änderung am aktiven Planungsjahr aus, legt vorher einen Rückgängig-Schritt an und zeichnet neu. */
export function commit(label, fn) {
  const snap = JSON.stringify(S), y = PRJ.active;
  try { fn(); } catch (err) { PRJ.years[y] = S = JSON.parse(snap); recompute(); render(); toast(err.message || String(err), 'crit'); console.error(err); return false; }
  if (JSON.stringify(S) === snap) { render(); return true; }          // nichts geändert: kein Rückgängig-Schritt
  push(hist, { y, s: snap });
  future.length = 0;
  S.meta.modified = nextStamp(S.meta.modified);
  recompute(); syncDoc(); render(); autosave();
  if (label) toast(label);
  return true;
}
/** Wie commit, aber für Änderungen am ganzen Projekt (Planungsjahr anlegen oder entfernen). */
export function commitProject(label, fn) {
  const entry = snapProject();
  try { fn(PRJ); } catch (err) { PRJ = JSON.parse(entry.p); S = PRJ.years[PRJ.active]; recompute(); render(); toast(err.message || String(err), 'crit'); console.error(err); return false; }
  push(hist, entry); future.length = 0;
  S = PRJ.years[PRJ.active];
  resetSelection(); UI.cluster = ''; UI.q = ''; UI.routePerson = '';
  recompute(); syncDoc(); render(); autosave();
  if (label) toast(label);
  return true;
}
export function undo() { if (!hist.length) return toast('Nichts rückgängig zu machen'); restore(hist.pop(), future); toast('Letzte Änderung rückgängig gemacht'); }
export function redo() { if (!future.length) return toast('Nichts zu wiederholen'); restore(future.pop(), hist); toast('Änderung wiederhergestellt'); }

/** Ersetzt das gesamte Projekt (Laden, Demo, leeres Projekt). doc = Dateibezug im Desktop-Programm. */
export function replaceProject(prj, label, doc = null) {
  if (PRJ) { push(hist, snapProject()); future.length = 0; }
  PRJ = prj; S = PRJ.years[PRJ.active];
  // Wer ein eigenes Projekt öffnet oder anlegt, verlässt damit den Übungsmodus
  if (practiceOn() && years().some(y => PRJ.years[y].meta.dataClass !== 'demo')) setPractice(false);
  resetSelection(); UI.cluster = ''; UI.q = ''; UI.routePerson = '';
  Object.assign(DOC, { token: '', name: '', path: '' }, doc || {});
  recompute(); markSaved(); render(); autosave();
  if (label) toast(label);
}
/** Ersetzt den Planungsstand durch ein einzelnes Jahr. */
export function replaceState(st, label, doc = null) { replaceProject(Core.wrapProject(st), label, doc); }
/** Wechselt das angezeigte Planungsjahr (keine Datenänderung). */
export function switchYear(y) {
  if (!PRJ.years[y] || y === PRJ.active) return;
  PRJ.active = y; S = PRJ.years[y];
  resetSelection(); UI.routePerson = '';
  recompute(); syncDoc(); render(); autosave();
}
/** Erststart ohne Rückgängig-Schritt. */
export function setProject(prj) { PRJ = prj; S = PRJ.years[PRJ.active]; hist.length = 0; future.length = 0; recompute(); markSaved(); }
/** Leert Projekt und Verlauf vollständig (Daten & Datenschutz → „Alle Daten entfernen“). */
export function resetAll(st) {
  hist.length = 0; future.length = 0; PRJ = null; S = null;
  Object.assign(DOC, { token: '', name: '', path: '', clean: '' });
  replaceState(st, 'Alle Daten entfernt');
  hist.length = 0;
}

// ---------- Zwischenspeichern / Wiederherstellung ---------------------------
/** Browser: Zwischenspeicher im Browserprofil · Desktop: Wiederherstellungskopie im Benutzerprofil. Beides nur auf Wunsch. */
/** Übungsmodus: das Programm startet mit simulierten Daten statt leer (siehe ui/practice.js). */
export const practiceOn = () => isDesktop ? desktop.settings.get('practice') === true : store.get(LS.practice) === '1';
export function setPractice(on) { if (isDesktop) desktop.settings.set('practice', !!on); else if (on) store.set(LS.practice, '1'); else store.del(LS.practice); }
export const autosaveOn = () => isDesktop ? desktop.settings.get('recovery') === true : store.get(LS.on) === '1';
export function setAutosave(on) {
  if (isDesktop) { desktop.settings.set('recovery', !!on); if (!on) desktop.recovery.clear(); }
  else if (on) store.set(LS.on, '1');
  else { store.del(LS.on); store.del(LS.state); store.del(LS.project); }
  if (on) autosave();
}
export function clearAutosave() { if (isDesktop) desktop.recovery.clear(); else { store.del(LS.state); store.del(LS.project); } }
let saveTimer = 0;
export function autosave() {
  if (!autosaveOn()) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const text = Core.serializeProject(PRJ);
    if (isDesktop) (dirty ? desktop.recovery.write(text) : desktop.recovery.clear()).catch(() => toast('Wiederherstellungskopie konnte nicht geschrieben werden', 'crit'));
    else if (!store.set(LS.project, text)) toast('Zwischenspeichern im Browser nicht möglich – bitte Projektdatei sichern', 'crit');
  }, isDesktop ? 1200 : 400);
}
