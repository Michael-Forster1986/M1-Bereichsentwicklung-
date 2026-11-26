import { csvDownload } from '../files.js';
import { html, raw } from '../dom.js';
import { REPORT_STATUS, fmt, fmtS, nf, pill, tcls, tname } from '../format.js';
import { CONF, HARD, IX, S, UI, collator, nameOf, privacy } from '../state.js';
import { ACT, VIEWS } from '../registry.js';
import { render } from '../shell.js';

// ---------- Bericht ------------------------------------------------------------------
VIEWS.report = {
  render() {
    const counts = {}; for (const r of S.report) counts[r.status] = (counts[r.status] || 0) + 1;
    const rows = S.report.filter(r => !UI.repStatus || r.status === UI.repStatus), conf = [...CONF.values()].sort((a, b) => (b.hard.length ? 1 : 0) - (a.hard.length ? 1 : 0)), pi = S.planInfo, notes = conf.length - HARD;
    const order = { blocked: 0, open: 1, partial: 2, planned: 3, kept: 4, skipped: 5 };
    rows.sort((a, b) => order[a.status] - order[b.status] || collator.compare(nameOf(a.pk), nameOf(b.pk)));
    return html`
    <div class="view-head"><div><h1>Bericht</h1><p>Ergebnis der letzten Berechnung je Person und die laufende Konfliktprüfung aller Termine.</p></div><span class="sp"></span><button class="btn noprint" data-act="go" data-id="fullreport" data-tip="Druckfertige Zusammenfassung mit Kennzahlen, Kapazität, Ergebnis je Person, Konflikten und Terminliste – auch als PDF">Gesamtbericht</button><button class="btn noprint" data-act="export-xlsx" data-tip="Alle Tabellen als Excel-Arbeitsmappe (.xlsx)">Excel</button><button class="btn noprint" data-act="print">Drucken</button></div>
    <div class="card" style="margin-bottom:14px"><div class="row"><h3 style="font-size:14.5px;font-weight:650">Konflikte in Terminen (${HARD})${notes ? html` <span class="muted" style="font-weight:400">· ${notes} Hinweise</span>` : ''}</h3><span class="sp"></span><button class="btn sm" data-act="conf-export" ${conf.length ? '' : raw('disabled')}>CSV</button></div>
      <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 10px">Wird bei jeder Änderung neu geprüft: Abwesenheit, fehlender Dienst, Kurs außerhalb Frühdienst, Terminkollision${S.settings.cap ? ', Kapazität unter Minimum' : ''}. Konflikte werden nie still verschoben.</div>
      ${conf.length ? html`<div class="tblwrap" style="max-height:340px"><table class="tbl"><thead><tr><th>Person</th><th>Maßnahme</th><th>Zeitraum</th><th>Konflikt</th><th>Hinweis</th><th></th></tr></thead><tbody>
        ${conf.slice(0, 300).map(c => html`<tr class="${c.hard.length ? 'rowcrit' : 'rowwarn'}"><td>${nameOf(c.pk)}</td><td><i class="sw ${tcls(c.type)}"></i> ${tname(c.type)}</td><td class="num nowrap">${fmtS(c.start)} – ${fmt(c.end)}</td><td>${c.hard.map(([r, n]) => r + (n > 1 ? ' (' + n + ' Tage)' : '')).join(', ') || '–'}</td><td class="muted">${c.soft.map(([r, n]) => r + ' (' + n + ')').join(', ')}</td><td><button class="btn sm" data-act="event-open" data-id="${c.id}">Öffnen</button></td></tr>`)}</tbody></table></div>`
        : html`<div class="note good">Keine Konflikte: alle Termine liegen auf zulässigen Tagen.</div>`}
      ${conf.length && !HARD ? html`<div class="note good" style="margin-top:10px">Keine Konflikte. Die Hinweise oben betreffen Lehrgangstage, die laut Dienstplan frei wären – dort ist der Dienstplan anzupassen, Produktionsverlust entsteht nicht.</div>` : ''}</div>
    <div class="card"><div class="row"><h3 style="font-size:14.5px;font-weight:650">Planungsergebnis je Person</h3><span class="sp"></span><button class="btn sm" data-act="report-export" ${S.report.length ? '' : raw('disabled')}>CSV</button></div>
      <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 10px">${pi && pi.at ? 'Letzte Berechnung am ' + fmt(pi.at.slice(0, 10)) + ' · ' + (pi.tried > 1 ? nf(pi.tried) + ' Reihenfolgen verglichen, beste: ' + pi.variant : pi.variant || '') : 'Stand aus der geladenen Datei'}</div>
      <div class="row" style="margin-bottom:10px"><button class="chip" data-act="rep-status" data-id="" aria-pressed="${!UI.repStatus}">Alle <b>${S.report.length}</b></button>
        ${Object.keys(REPORT_STATUS).filter(k => counts[k]).map(k => html`<button class="chip" data-act="rep-status" data-id="${k}" aria-pressed="${UI.repStatus === k}">${REPORT_STATUS[k][0]} <b>${counts[k]}</b></button>`)}</div>
      ${rows.length ? html`<div class="tblwrap" data-keep="report"><table class="tbl"><thead><tr><th>Person</th><th>Cluster</th><th>Ergebnis</th><th>Begründung</th><th>Noch offen</th><th></th></tr></thead><tbody>
        ${rows.slice(0, UI.limit).map(r => { const p = IX.people.get(r.pk), s = REPORT_STATUS[r.status] || [r.status, '']; return html`<tr><td>${nameOf(r.pk)}</td><td class="muted">${p ? p.cluster : ''}</td><td>${pill(s[0], s[1])}</td><td>${r.reason}</td><td class="muted">${(r.remaining || []).join(', ')}</td><td><button class="btn sm" data-act="person-open" data-pk="${p ? p.alias : ''}">Details</button></td></tr>`; })}</tbody></table></div>`
        : html`<div class="empty"><b>Noch kein Planungsergebnis</b>„Neu berechnen“ erzeugt den Bericht.</div>`}</div>`;
  }
};
ACT['rep-status'] = t => { UI.repStatus = t.dataset.id; render(); };
ACT['report-export'] = () => csvDownload('Berechnungsbericht', ['pk', 'Name', 'Cluster', 'Ergebnis', 'Begruendung', 'Offen'], S.report.map(r => { const p = IX.people.get(r.pk); return [privacy() ? p?.alias : r.pk, nameOf(r.pk), p?.cluster || '', (REPORT_STATUS[r.status] || [r.status])[0], r.reason, (r.remaining || []).join(', ')]; }));
ACT['conf-export'] = () => csvDownload('Konflikte', ['pk', 'Name', 'Massnahme', 'Start', 'Ende', 'Konflikt', 'Hinweis'], [...CONF.values()].map(c => [privacy() ? IX.people.get(c.pk)?.alias : c.pk, nameOf(c.pk), tname(c.type), c.start, c.end, c.hard.map(x => x[0] + ' (' + x[1] + ')').join(', '), c.soft.map(x => x[0] + ' (' + x[1] + ')').join(', ')]));
