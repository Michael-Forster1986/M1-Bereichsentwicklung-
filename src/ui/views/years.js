import * as Core from '../../core/index.js';
import { pickFile } from '../files.js';
import { $, html, raw } from '../dom.js';
import { DATA_CLASS, nf } from '../format.js';
import { PRJ, S, commit, commitProject, switchYear, years } from '../state.js';
import { closeModal, confirmDlg, openModal, toast } from '../dialogs.js';
import { ACT, CHG } from '../registry.js';
import { go, render } from '../shell.js';

/* ==========================================================================
 * Planungsjahre · Jahr wechseln, Folgejahr anlegen, Vorleistungen abgleichen, Jahresvergleich
 * Jedes Planungsjahr ist ein vollständiger Stand; gerechnet und angezeigt wird immer genau eines.
 * ========================================================================== */
// Kennzahlen der Jahre werden je Stand einmal berechnet (Schlüssel: Jahr + Änderungsstempel)
const cache = new Map();
export function figures(y) {
  const st = PRJ.years[y], key = y + '@' + st.meta.modified + '@' + st.events.length + '@' + st.people.length;
  if (!cache.has(key)) { if (cache.size > 24) cache.clear(); cache.set(key, Core.yearFigures(st)); }
  return cache.get(key);
}
const zero = v => v ? nf(v) : html`<span class="muted">–</span>`;

CHG.year = t => { if (t.value === 'add') { render(); ACT['year-add'](); } else switchYear(+t.value); };
ACT['year-go'] = t => { switchYear(+t.dataset.y); if (t.dataset.view) go(t.dataset.view); };
ACT['years-manage'] = () => { go('data'); const el = $('#yearsCard'); if (el) el.scrollIntoView({ block: 'start' }); };

/** Folgejahr anlegen: zeigt zuerst, was übernommen wird; angelegt wird erst nach Bestätigung. */
ACT['year-add'] = () => {
  const ys = years(), from = ys[ys.length - 1], base = PRJ.years[from], to = from + 1;
  if (to > 2100) return toast('Weitere Planungsjahre sind nicht möglich', 'crit');
  const pre = Core.rolloverYear(base).info;
  openModal({ title: 'Folgejahr ' + to + ' anlegen', wide: true, body: html`
    <p class="ink2">Aus dem Planungsjahr ${from} entsteht das Planungsjahr ${to}. ${from} bleibt unverändert im Projekt; zwischen den Jahren wechseln Sie oben in der Kopfzeile.</p>
    <div class="cmp" style="grid-template-columns:1.6fr 1fr">
      <div class="h">Übernahme aus ${from}</div><div class="h n">Anzahl</div>
      <div>Personen mit Stammdaten, Cluster und Berechtigungen</div><div class="n">${nf(pre.people)}</div>
      <div>Ausbildungswege in ${from} vollständig geplant</div><div class="n">${nf(pre.completed)}</div>
      <div>Begonnene Wege, die in ${to} weiterlaufen</div><div class="n">${nf(pre.continued)} · ${nf(pre.creditDays)} Tage Vorleistung</div>
      <div>Personen mit Dienstplan</div><div class="n">${nf(pre.roster)}</div>
    </div>
    <div class="stack" style="gap:9px;margin-top:12px">
      <label class="c"><input type="checkbox" id="yrReopen" checked> Vollständig geplante Wege abschließen – diese ${nf(pre.completed)} Personen stehen in ${to} auf „Zuordnung offen“, bis Sie die nächste Entwicklungsstufe festlegen</label>
      <label class="c"><input type="checkbox" id="yrCredit" checked> Begonnene Wege fortsetzen – in ${from} geplante Tage zählen als Vorleistung; ${to} plant nur den Rest</label>
      <label class="c"><input type="checkbox" id="yrRoster" ${pre.roster ? raw('checked') : raw('disabled')}> Dienstplan um 52 Wochen fortschreiben – als „simuliert“ gekennzeichnet, bis der echte Dienstplan ${to} geladen ist</label>
      <label class="c"><input type="checkbox" id="yrHolidays" checked> Gesetzliche Feiertage Bayern ${to} eintragen – bitte mit dem Betriebskalender abgleichen</label>
    </div>
    <div class="note" style="margin-top:12px">Ausbildungswege, Grenzwerte, Krankenreserve und Einstellungen werden kopiert. <b>Nicht</b> übernommen werden Termine, Abwesenheiten, Tageskapazitäten und Ferien – sie gehören zum Jahr ${from}. Eine geplante Maßnahme gilt beim Jahreswechsel als erbracht; ändert sich der Plan ${from} später, gleichen Sie die Vorleistungen unter „Daten & Datenschutz“ neu ab.</div>`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok">Planungsjahr ${to} anlegen</button>`,
    handlers: { ok: () => {
      const opt = { reopen: $('#yrReopen').checked, credit: $('#yrCredit').checked, roster: $('#yrRoster').checked, holidays: $('#yrHolidays').checked };
      const { state, info } = Core.rolloverYear(base, opt);
      closeModal();
      if (!commitProject('', prj => { if (prj.years[to]) throw new Error('Planungsjahr ' + to + ' ist bereits vorhanden'); prj.years[to] = state; prj.active = to; })) return;
      go('overview');
      toast('Planungsjahr ' + to + ' angelegt: ' + nf(info.people) + ' Personen' + (info.continued ? ', ' + nf(info.continued) + ' Wege werden fortgesetzt' : '') + (info.reopened ? ', ' + nf(info.reopened) + ' neu zuzuordnen' : '') + ' – jetzt „Neu berechnen“');
    } } });
};
ACT['year-remove'] = async t => {
  const y = +t.dataset.y, ys = years(); if (ys.length < 2 || !PRJ.years[y]) return;
  const st = PRJ.years[y];
  if (!await confirmDlg('Planungsjahr ' + y + ' entfernen', 'Das Jahr ' + y + ' wird mit ' + nf(st.people.length) + ' Personen, ' + nf(st.events.length) + ' Terminen, Dienstplan und Abwesenheiten aus dem Projekt entfernt. Die anderen Planungsjahre bleiben erhalten. Mit „Rückgängig“ kommen Sie zurück.', 'Jahr entfernen', true)) return;
  commitProject('Planungsjahr ' + y + ' entfernt', prj => { delete prj.years[y]; if (prj.active === y) prj.active = Core.projectYears(prj).filter(x => x < y).pop() ?? Core.projectYears(prj)[0]; });
};
/** Vorleistungen des angezeigten Jahres neu aus dem Vorjahr ableiten (nach Änderungen am Vorjahresplan). */
ACT['year-refresh'] = async t => {
  const y = +t.dataset.y, prev = PRJ.years[y - 1]; if (!prev || !PRJ.years[y]) return;
  if (!await confirmDlg('Vorleistungen aus ' + (y - 1) + ' neu abgleichen', 'Für alle Personen, die in ' + (y - 1) + ' und ' + y + ' mit demselben Cluster und Ziel geführt werden, werden die Vorleistungen neu aus dem Plan ' + (y - 1) + ' berechnet. Von Hand eingetragene Vorleistungen dieser Personen werden dabei überschrieben.', 'Neu abgleichen')) return;
  if (PRJ.active !== y) switchYear(y);
  let n = 0;
  commit('', () => { n = Core.refreshCredits(prev, S); });
  toast(n ? nf(n) + ' Vorleistungen aktualisiert – für die neue Terminverteilung „Neu berechnen“' : 'Vorleistungen sind bereits auf dem Stand des Plans ' + (y - 1));
};
/** Planungsjahre aus einer anderen Datei ergänzen (z. B. je Jahr eine Datei der bisherigen HTML-Fassung). */
ACT['year-import'] = async () => {
  const file = await pickFile('.json,.html,.htm,.m1cockpit'); if (!file) return;
  if (file.size > 40e6) throw new Error('Datei zu groß (max. 40 MB)');
  const res = Core.loadProject(await file.text(), file.name), have = new Set(years()), all = Core.projectYears(res.project);
  const fresh = all.filter(y => !have.has(y)), skipped = all.filter(y => have.has(y));
  if (!fresh.length) return toast('Die Datei enthält nur Planungsjahre, die es im Projekt schon gibt (' + skipped.join(', ') + ')', 'crit');
  openModal({ title: 'Planungsjahre hinzufügen', body: html`
    <div class="cmp" style="grid-template-columns:1fr 1fr"><div class="h">Datei</div><div class="h">${file.name}</div>
      <div>Erkannt</div><div class="n">${res.kind}</div>
      <div>Wird hinzugefügt</div><div class="n">${fresh.map(y => y + ' (' + nf(res.project.years[y].people.length) + ' Personen)').join(', ')}</div>
      ${skipped.length ? html`<div>Bereits vorhanden, bleibt unverändert</div><div class="n">${skipped.join(', ')}</div>` : ''}</div>
    ${res.warnings.length ? html`<div class="note warn">${res.warnings.slice(0, 12).map(w => html`<div>${w}</div>`)}</div>` : ''}
    <p class="small ink2">Die Jahre werden unverändert übernommen; Personen werden nicht mit anderen Jahren abgeglichen.</p>`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok" autofocus>Hinzufügen</button>`,
    handlers: { ok: () => { closeModal(); commitProject(fresh.length > 1 ? 'Planungsjahre ' + fresh.join(', ') + ' hinzugefügt' : 'Planungsjahr ' + fresh[0] + ' hinzugefügt', prj => { for (const y of fresh) prj.years[y] = res.project.years[y]; }); } } });
};

/** Auswahl des Planungsjahres in der Kopfzeile. */
export const yearSelect = () => html`<select class="yearsel" data-chg="year" aria-label="Planungsjahr" data-tip="Planungsjahr wechseln oder Folgejahr anlegen">
  ${years().map(y => html`<option value="${y}" ${y === PRJ.active ? raw('selected') : ''}>${y}</option>`)}<option value="add">＋ Folgejahr anlegen …</option></select>`;

/** Karte „Planungsjahre“ in „Daten & Datenschutz“. */
export function yearsCard() {
  const ys = years(), last = ys[ys.length - 1];
  return html`<div class="card" id="yearsCard" style="margin-bottom:14px"><div class="row"><h3 style="font-size:14.5px;font-weight:650">Planungsjahre (${ys.length})</h3><span class="sp"></span>
      <button class="btn sm" data-act="year-import" data-tip="Planungsjahre aus einer anderen Projektdatei oder einer Datei der bisherigen HTML-Fassung in dieses Projekt holen">Jahr aus Datei hinzufügen</button>
      <button class="btn sm primary" data-act="year-add">Folgejahr ${last + 1} anlegen</button></div>
    <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 10px">Ein Projekt kann mehrere Planungsjahre enthalten. Jedes Jahr hat eigene Personen, Dienstpläne, Abwesenheiten und Termine; beim Jahreswechsel laufen begonnene Ausbildungswege mit ihrer Vorleistung weiter.</div>
    <div class="tblwrap" style="max-height:none"><table class="tbl"><thead><tr><th>Jahr</th><th>Daten</th><th class="n">Personen</th><th class="n">Wege vollständig</th><th class="n">teilweise</th><th class="n">ohne Termine</th><th class="n">Termine</th><th class="n">Konflikte</th><th class="n">Unter Minimum</th><th></th></tr></thead><tbody>
      ${ys.map(y => { const f = figures(y), active = y === PRJ.active; return html`<tr class="${active ? 'rowsel' : ''}"><td><b>${y}</b>${active ? html` <span class="muted xs">angezeigt</span>` : ''}</td><td class="muted">${DATA_CLASS[f.dataClass][0]}</td>
        <td class="n">${nf(f.people)}</td><td class="n">${zero(f.complete)}</td><td class="n">${zero(f.partial)}</td><td class="n">${zero(f.none)}</td><td class="n">${zero(f.events)}</td><td class="n">${zero(f.conflicts)}</td><td class="n ${f.underMin ? 'd-crit' : ''}">${zero(f.underMin)}</td>
        <td class="nowrap">${active ? '' : html`<button class="btn sm" data-act="year-go" data-y="${y}">Anzeigen</button> `}${PRJ.years[y - 1] ? html`<button class="btn sm" data-act="year-refresh" data-y="${y}" data-tip="Vorleistungen neu aus dem Plan ${y - 1} berechnen – nach Änderungen am Vorjahr">Vorleistungen abgleichen</button> ` : ''}${ys.length > 1 ? html`<button class="btn sm danger" data-act="year-remove" data-y="${y}">Entfernen</button>` : ''}</td></tr>`; })}</tbody></table></div></div>`;
}
/** Karte „Jahresvergleich“ in der Übersicht – nur bei mehreren Planungsjahren. */
export function yearCompareCard() {
  const ys = years(); if (ys.length < 2) return '';
  return html`<div class="card" style="margin-bottom:14px"><h3>Jahresvergleich</h3><div class="sub">Kennzahlen aller Planungsjahre dieses Projekts · Jahr anklicken zum Wechseln</div>
    <table class="tbl"><thead><tr><th>Jahr</th><th class="n">Personen</th><th class="n">mit Ausbildungsweg</th><th class="n">Wege vollständig</th><th class="n">teilweise</th><th class="n">ohne Termine</th><th class="n">Ausbildungstage</th><th class="n">Termine mit Konflikt</th><th class="n">Diensttage unter Minimum</th><th class="n">unter 0-Punkt</th></tr></thead><tbody>
    ${ys.map(y => { const f = figures(y), active = y === PRJ.active; return html`<tr class="${active ? 'rowsel' : ''}"><td>${active ? html`<b>${y}</b>` : html`<button class="btn sm" data-act="year-go" data-y="${y}">${y}</button>`}</td>
      <td class="n">${nf(f.people)}</td><td class="n">${nf(f.eligible)}</td><td class="n">${zero(f.complete)}</td><td class="n">${zero(f.partial)}</td><td class="n">${zero(f.none)}</td><td class="n">${zero(f.trainingDays)}</td><td class="n">${zero(f.conflicts)}</td><td class="n ${f.underMin ? 'd-crit' : ''}">${zero(f.underMin)}</td><td class="n">${zero(f.underZero)}</td></tr>`; })}</tbody></table></div>`;
}
