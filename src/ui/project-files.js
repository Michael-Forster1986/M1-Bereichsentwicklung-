import * as Core from '../core/index.js';
import { desktop, isDesktop } from '../platform/desktop.js';
import { download, fname, pickFile, snapshotHtml } from './files.js';
import { $, html } from './dom.js';
import { nf } from './format.js';
import { DOC, PRJ, S, UI, markSaved, projectClass, replaceProject, replaceState } from './state.js';
import { closeModal, openModal, toast } from './dialogs.js';
import { ACT } from './registry.js';
import { go, render, renderTop } from './shell.js';

// ---------- Projektdateien ---------------------------------------------------
let recent = [];
/** Zuletzt geöffnete Dateien (nur Desktop); die Liste führt der Hauptprozess. */
export const recentFiles = () => recent;
export function refreshRecent() {
  if (isDesktop) desktop.recent().then(list => { recent = list || []; if (UI.view === 'data') render(); }).catch(() => {});
}
/**
 * Sichert das Projekt. Desktop: in die geöffnete Datei, sonst mit Dateidialog („Speichern unter“);
 * vor dem Überschreiben legt der Hauptprozess eine Sicherungskopie (.bak) an. Browser: als Download.
 */
export async function saveProject(saveAs = false) {
  const text = Core.serializeProject(PRJ), note = projectClass() === 'real' ? ' – enthält Personendaten' : '';
  if (!isDesktop) {
    await download(fname('Projekt', 'json', { project: true }), text);
    markSaved(); renderTop(); toast('Projektdatei gesichert' + note);
    return true;
  }
  const res = await desktop.saveProject({ token: saveAs ? '' : DOC.token, text, suggestedName: fname('Projekt', desktop.info.ext || 'm1cockpit', { project: true, dated: false }) });
  if (!res) return false;                                   // im Dateidialog abgebrochen
  markSaved({ token: res.token, name: res.name, path: res.path }); renderTop(); refreshRecent();
  desktop.recovery.clear();
  toast('Gespeichert: ' + res.name + note);
  return true;
}
/** Zeigt Prüfergebnis und Kennzahlen einer gelesenen Datei; erst die Bestätigung ersetzt den Stand. */
export function presentLoad(text, fileName, doc = null) {
  const res = Core.loadProject(text, fileName), prj = res.project, st = prj.years[prj.active], ys = Core.projectYears(prj);
  const ix = Core.buildIndex(st), sum = Core.summarize(st, ix), multi = ys.length > 1;
  openModal({ title: 'Datei prüfen und laden', body: html`
      <div class="cmp" style="grid-template-columns:1fr 1fr">
        <div class="h">Erkannt</div><div class="h">${res.kind}</div>
        <div>${multi ? 'Planungsjahre' : 'Planungsjahr'}</div><div class="n">${multi ? ys.join(', ') + ' · angezeigt: ' + prj.active : st.meta.year}</div>
        <div>Personen</div><div class="n">${nf(st.people.length)}</div>
        <div>Termine</div><div class="n">${nf(st.events.length)}</div>
        <div>Abwesenheiten</div><div class="n">${nf(st.absences.length)}</div>
        <div>Dienstplan vorhanden für</div><div class="n">${nf(Object.keys(st.roster).length)} Personen</div>
        <div>Diensttage unter Minimum / 0-Punkt</div><div class="n">${nf(sum.underMin)} / ${nf(sum.underZero)}</div>
      </div>
      ${res.warnings.length ? html`<div class="note warn">${res.warnings.map(w => html`<div>${w}</div>`)}</div>` : ''}
      ${isDesktop && !res.native ? html`<div class="note">Die Datei stammt aus einer anderen Programmversion und wird als Kopie übernommen. Das Original bleibt unverändert; beim ersten Speichern entsteht eine neue Projektdatei.</div>` : ''}
      <p class="small ink2">Der aktuelle Stand wird ersetzt. Mit „Rückgängig“ kommen Sie zurück. Die Datei wird nur ${isDesktop ? 'auf diesem Rechner' : 'in diesem Browserfenster'} verarbeitet.</p>`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok" autofocus>Stand laden</button>`,
    handlers: { ok: () => {
      closeModal();
      replaceProject(prj, res.kind + ' geladen: ' + st.people.length + ' Personen', doc && res.native ? doc : null);
      refreshRecent(); go('overview');
    } } });
}
ACT['save-project'] = () => saveProject(false);
ACT['save-project-as'] = () => saveProject(true);
ACT['save-snapshot'] = async () => { if (await download(fname('Programm-mit-Stand', 'html', { project: true }), await snapshotHtml(), 'text/html')) toast('Programm mit aktuellem Stand gesichert'); };
ACT['load-project'] = async () => {
  if (isDesktop) { const f = await desktop.openProject(); if (f) presentLoad(f.text, f.name, { token: f.token, name: f.name, path: f.path }); return; }
  const file = await pickFile('.json,.html,.htm,.m1cockpit'); if (!file) return;
  if (file.size > 40e6) throw new Error('Datei zu groß (max. 40 MB)');
  presentLoad(await file.text(), file.name);
};
ACT['open-recent'] = async t => { const f = await desktop.openRecent(+t.dataset.i); if (f) presentLoad(f.text, f.name, { token: f.token, name: f.name, path: f.path }); };
ACT['load-demo'] = () => openModal({ title: 'Demo-Daten erzeugen', body: html`
    <p>Erzeugt einen vollständig synthetischen Datensatz: erfundene Personen, zufälliger Dienstplan und Urlaub, berechneter Jahresplan. Es werden keine realen Daten verwendet.</p>
    <div class="form"><label class="f">Planungsjahr<input type="number" id="demoYear" min="2024" max="2040" value="${S ? S.meta.year : 2027}"></label>
    <label class="f">Anzahl Personen<input type="number" id="demoCount" min="10" max="600" value="141"></label></div>`,
  footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok">Demo-Daten erzeugen</button>`,
  handlers: { ok: () => { const year = Core.clamp(+$('#demoYear').value || 2027, 2024, 2040), count = Core.clamp(+$('#demoCount').value || 141, 10, 600); closeModal(); replaceState(Core.demoState({ year, count, seed: year + count }), 'Demo-Daten erzeugt'); go('overview'); } } });
ACT['new-empty'] = () => openModal({ title: 'Leeres Projekt anlegen', body: html`
    <p>Legt ein Projekt ohne Personen an. Ausbildungswege, Grenzwerte und Krankenreserve werden mit den Standardwerten vorbelegt. Danach Stammdaten, Dienstplan und Abwesenheiten importieren.</p>
    <div class="form"><label class="f">Planungsjahr<input type="number" id="newYear" min="2024" max="2040" value="${S.meta.year}"></label></div>`,
  footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok">Leeres Projekt anlegen</button>`,
  handlers: { ok: () => { const year = Core.clamp(+$('#newYear').value || 2027, 2024, 2040); closeModal(); replaceState(Core.emptyState(year), 'Leeres Projekt für ' + year + ' angelegt'); go('data'); } } });
