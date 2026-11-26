import * as Core from '../core/index.js';
import { toast } from './dialogs.js';
import { render } from './shell.js';

// ---------- Zustand --------------------------------------------------------
export let S = null, IX = null, SUM = null, CONF = new Map(), PROG = new Map(), ALIAS = new Map(), dirty = false;
export const hist = [], future = [];
export const UI = {
  view: 'overview', q: '', cluster: '', gStatus: '', gSort: 'list', gGroup: false, gZoom: 1, gHide: new Set(),
  capArea: 0, capRange: 'year', capOnlyCrit: true, evQ: '', evType: '', evOrigin: '', repStatus: '', absQ: '',
  routeCluster: '1', routePerson: '', drawer: null, tec: null, tecResult: null, limit: 300
};
export const LS = { state: 'm1cockpit.v4.state', on: 'm1cockpit.v4.autosave', theme: 'm1cockpit.theme' };
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

export function recompute() {
  IX = Core.buildIndex(S);
  SUM = Core.summarize(S, IX);
  CONF = new Map(Core.findConflicts(S, IX).map(c => [c.id, c]));
  PROG = new Map(S.people.map(p => [p.pk, Core.routeProgress(S, IX, p)]));
  ALIAS = new Map(S.people.map(p => [p.alias, p]));
}
/** Führt eine Änderung aus, legt vorher einen Rückgängig-Schritt an und zeichnet neu. */
export function commit(label, fn) {
  const snap = JSON.stringify(S);
  try { fn(); } catch (err) { S = JSON.parse(snap); recompute(); render(); toast(err.message || String(err), 'crit'); console.error(err); return false; }
  if (JSON.stringify(S) === snap) { render(); return true; }          // nichts geändert: kein Rückgängig-Schritt
  hist.push(snap); if (hist.length > 30) hist.shift();
  future.length = 0;
  S.meta.modified = new Date().toISOString(); dirty = true;
  recompute(); render(); autosave();
  if (label) toast(label);
  return true;
}
export function undo() { if (!hist.length) return toast('Nichts rückgängig zu machen'); future.push(JSON.stringify(S)); S = JSON.parse(hist.pop()); recompute(); render(); autosave(); toast('Letzte Änderung rückgängig gemacht'); }
export function redo() { if (!future.length) return toast('Nichts zu wiederholen'); hist.push(JSON.stringify(S)); S = JSON.parse(future.pop()); recompute(); render(); autosave(); toast('Änderung wiederhergestellt'); }
/** Ersetzt den gesamten Planungsstand (Laden, Demo, leeres Projekt). */
export function replaceState(st, label) {
  if (S) { hist.push(JSON.stringify(S)); if (hist.length > 30) hist.shift(); future.length = 0; }
  S = st; UI.drawer = null; UI.tecResult = null; UI.tec = null; UI.cluster = ''; UI.q = ''; UI.routePerson = '';
  dirty = false; recompute(); render(); autosave();
  if (label) toast(label);
}
let saveTimer = 0;
export function autosave() {
  if (store.get(LS.on) !== '1') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (!store.set(LS.state, JSON.stringify(S))) toast('Zwischenspeichern im Browser nicht möglich – bitte Projektdatei sichern', 'crit'); }, 400);
}
/** Schreibzugriffe von außen: Module dürfen importierte Bindungen nicht direkt zuweisen. */
export function setS(st) { S = st; }
export function setDirty(v) { dirty = !!v; }
