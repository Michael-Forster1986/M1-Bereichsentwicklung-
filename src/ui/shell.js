import { isDesktop } from '../platform/desktop.js';
import { $, $$, html, raw, setHTML } from './dom.js';
import { DATA_CLASS, nf } from './format.js';
import { HARD, LS, S, UI, autosave, dirty, future, hist, privacy, redo, store, undo } from './state.js';
import { toast } from './dialogs.js';
import { ACT, VIEWS } from './registry.js';
import { hideTip } from './tooltip.js';
import { renderDrawer } from './drawers.js';
import { yearSelect } from './views/years.js';

// Während des Neuzeichnens ausgelöste Änderungen (Feld verliert beim Ersetzen den Fokus) werden danach ausgeführt.
export let rendering = false;
export const deferred = [];
const NAV = [
  ['Planung', [['overview', 'Übersicht'], ['year', 'Jahresplan'], ['capacity', 'Kapazität'], ['courses', 'Lehrgänge']]],
  ['Stammdaten', [['people', 'Personen & Cluster'], ['routes', 'Ausbildungswege'], ['events', 'Termine'], ['absences', 'Abwesenheiten & Kalender']]],
  ['Projekt', [['report', 'Bericht'], ['data', 'Daten & Datenschutz'], ['help', 'Anleitung']]]
];

function focusKey(el) {
  if (!el || el === document.body) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  const d = el.dataset; let s = '';
  for (const k of ['chg', 'inp', 'act']) if (d[k]) { s = '[data-' + k + '="' + CSS.escape(d[k]) + '"]'; break; }
  if (!s) return null;
  for (const k of ['pk', 'f', 'i', 'id', 't', 'k']) if (d[k] !== undefined) s += '[data-' + k + '="' + CSS.escape(d[k]) + '"]';
  return s;
}
export function render() {
  if (rendering) return;
  rendering = true;
  try { renderNow(); } finally { rendering = false; }
  for (const f of deferred.splice(0)) f();
}
function renderNow() {
  const main = $('#main'), fk = focusKey(document.activeElement);
  const keep = new Map($$('[data-keep]').map(el => [el.dataset.keep, [el.scrollLeft, el.scrollTop]]));
  const sameView = main.dataset.view === UI.view, top = main.scrollTop;
  renderTop(); renderRail();
  const v = VIEWS[UI.view] || VIEWS.overview;
  main.dataset.view = UI.view;
  setHTML(main, v.render());
  if (v.after) v.after(main);
  for (const el of $$('[data-keep]')) { const p = keep.get(el.dataset.keep); if (p) { el.scrollLeft = p[0]; el.scrollTop = p[1]; } }
  main.scrollTop = sameView ? top : 0;
  if (UI.drawer) renderDrawer();
  if (fk) { const el = $(fk); if (el && el !== document.activeElement) el.focus({ preventScroll: true }); }
}
export function go(view) { UI.view = view; hideTip(); render(); $('#main').focus({ preventScroll: true }); }

export function renderTop() {
  const dc = DATA_CLASS[S.meta.dataClass] || DATA_CLASS.real, cap = S.settings.cap;
  setHTML($('#top'), html`
    <div class="brand"><b>M1 Qualifikationscockpit</b><span>${S.meta.title}</span></div>
    ${yearSelect()}
    <span class="pill" data-tip="${S.meta.dataClass === 'demo' ? 'Alle Personen, Dienstpläne und Abwesenheiten sind frei erfunden.' : S.meta.dataClass === 'real' ? 'Enthält Personendaten. Datei und Sicherungen nur im berechtigten Umfeld speichern.' : S.meta.dataClass === 'pseudo' ? 'Namen und Personalnummern sind durch Pseudonyme ersetzt.' : 'Noch keine Personen geladen.'}">${dc[0]}</span>
    <span class="pill hide-s" data-tip="${cap ? 'Kapazität wird verbindlich geprüft: fehlende Tagesdaten blockieren die Planung.' : 'Szenariomodus: Termine werden ohne verbindliche Kapazitätsprüfung verteilt.'}">${cap ? 'Kapazitätsmodus' : 'Szenariomodus'}</span>
    <span class="sp"></span>
    <button class="btn primary" data-act="plan" data-tip="Jahresplanung berechnen und vor der Übernahme vergleichen">Neu berechnen</button>
    <button class="btn" data-act="undo" ${hist.length ? '' : raw('disabled')} aria-label="Rückgängig" data-tip="Rückgängig (Strg+Z)">↶</button>
    <button class="btn hide-xs" data-act="redo" ${future.length ? '' : raw('disabled')} aria-label="Wiederholen" data-tip="Wiederholen (Strg+Y)">↷</button>
    <button class="btn hide-xs" data-act="save-project" data-tip="${isDesktop ? 'Projekt speichern (Strg+S) · Speichern unter: Strg+Umschalt+S' : 'Projektdatei sichern (Strg+S)'}">${isDesktop ? 'Speichern' : 'Sichern'}${dirty ? ' •' : ''}</button>
    <button class="btn hide-s" data-act="load-project" data-tip="Projektdatei oder Datei der Vorgängerversion laden">${isDesktop ? 'Öffnen' : 'Laden'}</button>
    <button class="btn ${privacy() ? 'on' : ''}" data-act="toggle-privacy" aria-pressed="${privacy()}" data-tip="Namen und Personalnummern durch Pseudonyme ersetzen – für Präsentationen und Bildschirmfotos">${privacy() ? 'Namen verborgen' : 'Namen sichtbar'}</button>
    <button class="btn hide-xs" data-act="toggle-theme" aria-label="Hell oder dunkel" data-tip="Hell / Dunkel">◐</button>`);
}
function renderRail() {
  const cnt = { report: HARD ? [HARD, 'crit'] : null, people: [S.people.length, ''], events: [S.events.length, ''] };
  setHTML($('#rail'), NAV.map(([group, items]) => html`<h4>${group}</h4>${items.map(([id, label]) => html`
    <button data-act="go" data-id="${id}" ${UI.view === id || (id === 'report' && UI.view === 'fullreport') ? raw('aria-current="page"') : ''}>${label}${cnt[id] ? html`<span class="cnt ${cnt[id][1]}">${nf(cnt[id][0])}</span>` : ''}</button>`)}`));
}
ACT.go = t => go(t.dataset.id);
ACT.undo = undo;
ACT.redo = redo;
ACT['toggle-privacy'] = () => { S.meta.privacy = !S.meta.privacy; render(); autosave(); toast(privacy() ? 'Namen und Personalnummern verborgen' : 'Namen sichtbar'); };
export function applyTheme(t) { document.documentElement.dataset.theme = t; }
ACT['toggle-theme'] = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; applyTheme(t); store.set(LS.theme, t); render(); };
ACT.print = () => window.print();
