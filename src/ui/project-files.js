import * as Core from '../core/index.js';
import { download, fname, pickFile, snapshotHtml } from './files.js';
import { $, html } from './dom.js';
import { nf } from './format.js';
import { S, replaceState, setDirty } from './state.js';
import { closeModal, openModal, toast } from './dialogs.js';
import { ACT } from './registry.js';
import { go, renderTop } from './shell.js';

// ---------- Projektdateien ---------------------------------------------------
ACT['save-project'] = () => { download(fname('Projekt', 'json'), JSON.stringify(S)); setDirty(false); renderTop(); toast('Projektdatei gesichert' + (S.meta.dataClass === 'real' ? ' – enthält Personendaten' : '')); };
ACT['save-snapshot'] = () => { download(fname('Programm-mit-Stand', 'html'), snapshotHtml(), 'text/html'); toast('Programm mit aktuellem Stand gesichert'); };
ACT['load-project'] = async () => {
  const file = await pickFile('.json,.html,.htm'); if (!file) return;
  if (file.size > 40e6) throw new Error('Datei zu groß (max. 40 MB)');
  const res = Core.loadAny(await file.text(), file.name), st = res.state;
  const ix = Core.buildIndex(st), sum = Core.summarize(st, ix);
  openModal({ title: 'Datei prüfen und laden', body: html`
      <div class="cmp" style="grid-template-columns:1fr 1fr">
        <div class="h">Erkannt</div><div class="h">${res.kind}</div>
        <div>Planungsjahr</div><div class="n">${st.meta.year}</div>
        <div>Personen</div><div class="n">${nf(st.people.length)}</div>
        <div>Termine</div><div class="n">${nf(st.events.length)}</div>
        <div>Abwesenheiten</div><div class="n">${nf(st.absences.length)}</div>
        <div>Dienstplan vorhanden für</div><div class="n">${nf(Object.keys(st.roster).length)} Personen</div>
        <div>Diensttage unter Minimum / 0-Punkt</div><div class="n">${nf(sum.underMin)} / ${nf(sum.underZero)}</div>
      </div>
      ${res.warnings.length ? html`<div class="note warn">${res.warnings.map(w => html`<div>${w}</div>`)}</div>` : ''}
      <p class="small ink2">Der aktuelle Stand wird ersetzt. Mit „Rückgängig“ kommen Sie zurück. Die Datei wird nur in diesem Browserfenster verarbeitet.</p>`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok" autofocus>Stand laden</button>`,
    handlers: { ok: () => { closeModal(); replaceState(st, res.kind + ' geladen: ' + st.people.length + ' Personen'); go('overview'); } } });
};
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
