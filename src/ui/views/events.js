import * as Core from '../../core/index.js';
import { csvDownload } from '../files.js';
import { html, raw } from '../dom.js';
import { clusterLabel, fmt, nf, opts, originOf, pill, tcls, tname, typeOpts } from '../format.js';
import { CONF, IX, S, UI, collator, commit, nameOf, privacy } from '../state.js';
import { confirmDlg } from '../dialogs.js';
import { ACT, VIEWS } from '../registry.js';

/* ==========================================================================
 * Ansichten · Termine, Abwesenheiten & Kalender, Bericht, Daten, Anleitung
 * ========================================================================== */

// ---------- Termine -------------------------------------------------------------
function filteredEvents() {
  const q = UI.evQ.trim().toLowerCase();
  return S.events.filter(e => (!UI.evType || e.type === UI.evType) && (!UI.cluster || IX.people.get(e.pk)?.cluster === UI.cluster)
    && (!UI.evOrigin || (UI.evOrigin === 'Konflikt' ? !!CONF.get(e.id)?.hard.length : originOf(e) === UI.evOrigin))
    && (!q || (nameOf(e.pk) + ' ' + (privacy() ? '' : e.pk) + ' ' + e.type + ' ' + tname(e.type) + ' ' + (e.title || '')).toLowerCase().includes(q)))
    .sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : collator.compare(nameOf(a.pk), nameOf(b.pk)));
}
VIEWS.events = {
  render() {
    const list = filteredEvents(), shown = list.slice(0, UI.limit), nAuto = S.events.filter(e => e.auto).length;
    return html`
    <div class="view-head"><div><h1>Termine</h1><p>Alle Maßnahmen des Jahres. Berechnete Termine werden bei jeder Neuberechnung neu verteilt, fixierte bleiben stehen und zählen zum Ausbildungsweg.</p></div></div>
    <div class="toolbar noprint">
      <input type="search" placeholder="Person oder Maßnahme suchen" value="${UI.evQ}" data-inp="ui" data-f="evQ" id="q-events" style="width:220px" aria-label="Suche">
      <select data-chg="ui" data-f="evType" aria-label="Maßnahme"><option value="">Alle Maßnahmen</option>${opts(typeOpts([...Core.typesOf(S), 'Sonstiges']), UI.evType)}</select>
      <select data-chg="ui" data-f="evOrigin" aria-label="Herkunft">${opts([['', 'Alle Herkünfte'], ['berechnet', 'Berechnet'], ['fixiert', 'Fixiert'], ['Szenario', 'Szenario (simuliert)'], ['Konflikt', 'Mit Konflikt']], UI.evOrigin)}</select>
      <select data-chg="ui" data-f="cluster" aria-label="Cluster"><option value="">Alle Cluster</option>${opts(Object.keys(Core.CLUSTERS).map(k => [k, clusterLabel(k)]), UI.cluster)}</select>
      <span class="sp"></span>
      <button class="btn primary" data-act="event-new">Neuer Termin</button>
      <button class="btn" data-act="events-fix-all" ${nAuto ? '' : raw('disabled')} data-tip="Macht aus allen berechneten Terminen fixierte Termine – der Plan bleibt bei Neuberechnungen stehen">Plan fixieren (${nf(nAuto)})</button>
      <button class="btn" data-act="events-clear-auto" ${nAuto ? '' : raw('disabled')}>Berechnete entfernen</button>
      <button class="btn" data-act="events-export">CSV</button>
    </div>
    ${!list.length ? html`<div class="card empty"><b>${S.events.length ? 'Keine Termine für diese Auswahl' : 'Noch keine Termine'}</b>${S.events.length ? 'Suche oder Filter anpassen.' : 'Mit „Neu berechnen“ verteilt das Programm die Ausbildungswege, oder Sie legen Termine einzeln an.'}</div>` : html`
    <div class="tblwrap" data-keep="events"><table class="tbl"><thead><tr><th>Person</th><th>Maßnahme</th><th>Beginn</th><th>Ende</th><th class="n">Tage</th><th>Herkunft</th><th>Prüfung</th><th></th></tr></thead><tbody>
      ${shown.map(e => { const cf = CONF.get(e.id), hard = cf && cf.hard.length; return html`<tr class="${hard ? 'rowcrit' : ''}">
        <td>${nameOf(e.pk)}</td><td><i class="sw ${tcls(e.type)}"></i> ${e.title ? e.title + ' · ' : ''}${tname(e.type)}${e.partial ? html` <span class="muted xs">Teilweg</span>` : ''}</td>
        <td class="nowrap num">${fmt(e.start)}</td><td class="nowrap num">${fmt(e.end)}</td><td class="n">${(IX.evDays.get(e.id) || []).length}</td>
        <td>${e.auto ? html`<span class="muted">berechnet</span>` : pill(originOf(e), 'info')}</td>
        <td>${hard ? html`<span class="small" style="color:var(--crit-ink)">${cf.hard.map(x => x[0]).join(', ')}</span>` : cf ? html`<span class="small muted">${cf.soft.map(x => x[0]).join(', ')}</span>` : html`<span class="muted small">ohne Befund</span>`}</td>
        <td class="nowrap"><button class="btn sm" data-act="event-open" data-id="${e.id}">Bearbeiten</button> ${e.auto ? html`<button class="btn sm" data-act="event-fix" data-id="${e.id}">Fixieren</button>` : ''}</td></tr>`; })}</tbody></table></div>
    <p class="small muted" style="margin-top:8px">${shown.length} von ${list.length} Terminen angezeigt${list.length > shown.length ? html` · <button class="btn sm" data-act="show-all">Alle anzeigen</button>` : ''}.</p>`}`;
  }
};
ACT['events-fix-all'] = async () => { if (await confirmDlg('Plan fixieren', 'Alle berechneten Termine werden zu fixierten Terminen. Eine Neuberechnung verschiebt sie dann nicht mehr.', 'Plan fixieren')) commit('Alle berechneten Termine fixiert', () => { for (const e of S.events) e.auto = false; }); };
ACT['events-clear-auto'] = async () => { if (await confirmDlg('Berechnete Termine entfernen', 'Alle berechneten Termine werden gelöscht. Fixierte Termine und Szenariotermine bleiben erhalten.', 'Entfernen', true)) commit('Berechnete Termine entfernt', () => { S.events = S.events.filter(e => !e.auto); S.report = []; }); };
ACT['events-export'] = () => csvDownload('Termine', ['pk', 'Name', 'type', 'title', 'start', 'end', 'Tage', 'Herkunft', 'trainee', 'mentor', 'tec', 'examiner', 'Konflikt'],
  filteredEvents().map(e => { const p = IX.people.get(e.pk); return [privacy() ? p?.alias : e.pk, nameOf(e.pk), tname(e.type), e.title || '', e.start, e.end, (IX.evDays.get(e.id) || []).length, originOf(e), e.trainee, e.mentor, e.tec, e.examiner, (CONF.get(e.id)?.hard || []).map(x => x[0]).join(', ')]; }));
