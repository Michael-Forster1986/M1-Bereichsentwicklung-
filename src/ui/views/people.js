import * as Core from '../../core/index.js';
import { csvDownload } from '../files.js';
import { html, raw } from '../dom.js';
import { ROUTE_STATE, fmt, opts, pill } from '../format.js';
import { PROG, S, SUM, UI, pName, privacy } from '../state.js';
import { ACT, VIEWS } from '../registry.js';
import { render } from '../shell.js';
import { filteredPeople } from './year.js';

// ---------- Personen & Cluster ---------------------------------------------------
VIEWS.people = {
  render() {
    const list = filteredPeople(), shown = list.slice(0, UI.limit);
    const sel = (p, f, items, v, dis = false) => html`<select class="${f === 'cluster' ? 'cl' : ''}" data-chg="person" data-pk="${p.alias}" data-f="${f}" ${dis ? raw('disabled') : ''} aria-label="${f}">${opts(items, v)}</select>`;
    const clusters = Object.keys(Core.CLUSTERS).map(k => [k, k === 'offen' || k === 'ausgeschlossen' ? k : k + ' · ' + Core.CLUSTERS[k]]);
    return html`
    <div class="view-head"><div><h1>Personen & Cluster</h1><p>Clusterzuordnung, Ziel und Priorität je Person. Änderungen wirken sofort auf Anzeige und Konfliktprüfung; Termine verschieben sich erst mit „Neu berechnen“.</p></div></div>
    <div class="toolbar noprint">
      <input type="search" placeholder="Person oder Ziel suchen" value="${UI.q}" data-inp="ui" data-f="q" id="q-people" style="width:210px" aria-label="Suche">
      <button class="chip" data-act="cluster-set" data-id="" aria-pressed="${!UI.cluster}">Alle <b>${S.people.length}</b></button>
      ${Object.keys(Core.CLUSTERS).filter(k => SUM.clusters[k]).map(k => html`<button class="chip" data-act="cluster-set" data-id="${k}" aria-pressed="${UI.cluster === k}" data-tip="${Core.CLUSTERS[k]}">${k === 'offen' || k === 'ausgeschlossen' ? k : 'Cluster ' + k} <b>${SUM.clusters[k]}</b></button>`)}
      <span class="sp"></span><button class="btn" data-act="person-add">Person hinzufügen</button><button class="btn" data-act="people-export">CSV</button>
    </div>
    ${!S.people.length ? html`<div class="card empty"><b>Noch keine Personen</b>Stammdaten importieren oder einzelne Personen anlegen.<div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" data-act="go" data-id="data">Stammdaten importieren</button></div></div>` : html`
    <div class="tblwrap" data-keep="people"><table class="tbl"><thead><tr><th>Person</th><th>Cluster</th><th>Zielmuster</th><th>Zielstufe</th><th>Start</th><th>Priorität</th><th>Berechtigung</th><th>Stand</th><th></th></tr></thead><tbody>
      ${shown.map(p => { const pr = PROG.get(p.pk), yr = S.meta.year; return html`<tr>
        <td class="who"><b>${pName(p)}</b><small>${privacy() ? '' : p.pk + (p.org ? ' · ' + p.org : '')}</small></td>
        <td>${sel(p, 'cluster', clusters, p.cluster, p.locked)}</td>
        <td>${sel(p, 'target', [['', 'offen'], ...Core.TARGETS], p.target)}${p.targetAssumed ? html` <span class="muted xs" data-tip="Zielmuster ist eine Annahme und fachlich zu bestätigen">Annahme</span>` : ''}</td>
        <td>${sel(p, 'level', [['', 'offen'], ...Core.LEVELS], p.level)}</td>
        <td><input type="date" data-chg="person" data-pk="${p.alias}" data-f="start" value="${p.start}" min="${yr}-01-01" max="${yr}-12-31" aria-label="Individueller Start" data-tip="Leer = Szenariostart ${fmt(S.settings.start)}"></td>
        <td><input type="number" class="w60" min="1" max="9" data-chg="person" data-pk="${p.alias}" data-f="priority" value="${p.priority}" aria-label="Planungspriorität"></td>
        <td><b>${p.rights}</b><div class="xs muted">${Object.entries(p.patterns).filter(x => x[1] && x[1] !== '—').map(([k, v]) => k + ' ' + v).join(' · ')}</div></td>
        <td>${pill(ROUTE_STATE[pr.state][0], ROUTE_STATE[pr.state][1])}${pr.end ? html`<div class="xs muted">bis ${fmt(pr.end)}</div>` : ''}</td>
        <td><button class="btn sm" data-act="person-open" data-pk="${p.alias}">Details</button></td></tr>`; })}</tbody></table></div>
    <p class="small muted" style="margin-top:8px">${shown.length} von ${list.length} Personen angezeigt${list.length > shown.length ? html` · <button class="btn sm" data-act="show-all">Alle anzeigen</button>` : ''}. Gesperrte Personen behalten ihr Cluster; die Sperre lässt sich in den Details aufheben. Zielmuster und Zielstufe sind für Cluster 5 Pflicht.</p>`}`;
  }
};
ACT['cluster-set'] = t => { UI.cluster = t.dataset.id; render(); };
ACT['show-all'] = () => { UI.limit = 1e9; render(); };
ACT['people-export'] = () => csvDownload('Personen', [...Core.TEMPLATES.people, 'alias', 'Planungsstand', 'Letzter_Termin'],
  S.people.map(p => { const pr = PROG.get(p.pk), o = privacy() ? { ...p, pk: p.alias, name: p.alias, org: '' } : p; return [o.pk, o.name, o.org, o.rights, o.cluster, o.locked ? 'ja' : '', o.area, o.shift, o.start, o.target, o.level, o.priority, ...Core.PATTERNS.map(k => o.patterns[k]), o.confirmed ? 'ja' : '', o.gate, o.alias, ROUTE_STATE[pr.state][0], pr.end || '']; }));
