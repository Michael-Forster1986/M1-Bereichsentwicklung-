import * as Core from '../../core/index.js';
import { csvDownload, download, pickFile, templateDownload } from '../files.js';
import { $, html, raw } from '../dom.js';
import { DATA_CLASS, fmt, fmtS, nf, opts, pill } from '../format.js';
import { desktop, isDesktop } from '../../platform/desktop.js';
import { updateCard } from '../update.js';
import { practiceCard } from '../practice.js';
import { DOC, HARD, IX, PRJ, S, SUM, autosaveOn, clearAutosave, commit, commitProject, privacy, projectClass, resetAll, setAutosave, years } from '../state.js';
import { recentFiles } from '../project-files.js';
import { closeModal, confirmDlg, openModal, toast } from '../dialogs.js';
import { ACT, CHG, VIEWS } from '../registry.js';
import { go, render } from '../shell.js';
import { yearsCard } from './years.js';

// ---------- Daten & Datenschutz -------------------------------------------------------
const IMP = { from: '', to: '', gaps: false, complete: false };
function impScope() { const y = S.meta.year; if (!IMP.from.startsWith(String(y))) IMP.from = y + '-01-01'; if (!IMP.to.startsWith(String(y))) IMP.to = y + '-12-31'; return { start: IMP.from, end: IMP.to }; }
const fullYear = sc => sc.start === S.meta.year + '-01-01' && sc.end === S.meta.year + '-12-31';
/** Vorschau mit Prüfergebnis; „Übernehmen“ nur ohne Fehler. */
export function importPreview({ title, file, facts, chk, apply, extra }) {
  const errs = chk.errors || [], warns = chk.warnings || [];
  openModal({ title, wide: true, body: html`
    <div class="cmp" style="grid-template-columns:1fr 1.4fr"><div class="h">Datei</div><div class="h">${file}</div>${facts.map(([k, v]) => html`<div>${k}</div><div class="n">${v}</div>`)}</div>
    ${extra || ''}
    ${errs.length ? html`<div class="note crit"><b>Nicht übernehmbar – ${errs.length} Fehler:</b>${errs.slice(0, 20).map(e => html`<div>${e}</div>`)}</div>` : html`<div class="note good">Prüfung bestanden. Es wird nichts übertragen – die Datei bleibt ${isDesktop ? 'auf diesem Rechner' : 'in diesem Browserfenster'}.</div>`}
    ${warns.length ? html`<div class="note warn">${warns.slice(0, 12).map(w => html`<div>${w}</div>`)}${warns.length > 12 ? html`<div>… ${warns.length - 12} weitere Hinweise</div>` : ''}</div>` : ''}`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok" ${errs.length ? raw('disabled') : ''}>Übernehmen</button>`,
    handlers: { ok: () => { const r = apply(); if (r !== false) closeModal(); } } });
}
/** Liest eine Tabelle aus CSV oder Excel. Bei Excel zählt das Blatt, dessen Kopfzeile zu headTest passt – sonst das größte. */
export async function readRows(file, headTest) {
  if (/\.xlsx$/i.test(file.name)) {
    const sheets = (await Core.readXlsx(file)).filter(x => x.rows.some(r => r.some(Boolean)));
    if (!sheets.length) throw new Error('Die Excel-Datei enthält keine Daten');
    let pick = null, at = 0;
    if (headTest) for (const sh of sheets) { const i = sh.rows.findIndex((r, j) => j < 30 && headTest(r)); if (i >= 0) { pick = sh; at = i; break; } }
    if (!pick) pick = sheets.slice().sort((a, b) => b.rows.length - a.rows.length)[0];
    return { rows: pick.rows.slice(at).filter(r => r.some(Boolean)), note: 'Excel-Blatt „' + pick.name + '“' };
  }
  if (file.size > 30e6) throw new Error('Datei zu groß (max. 30 MB)');
  return { rows: Core.parseCSV(await file.text()), note: 'CSV' };
}

// ---------- Urlaubsplan als Tabelle je Tag (Excel) -----------------------------------------
// Eine Zeile je Person, eine Spalte je Tag, Kürzel in den Zellen. Was ein Kürzel bedeutet, wird hier zugeordnet.
let MX = null;
const MX_LABEL = { Urlaub: 'Urlaub', Krank: 'Krank', Sonstiges: 'Sonstige Abwesenheit', 'Früh': 'Dienst: Früh', 'Spät': 'Dienst: Spät', Nacht: 'Dienst: Nacht', Frei: 'Dienstfrei', '': 'nicht übernehmen' };
const mxSummary = () => {
  const m = MX.tables[MX.idx].m, rows = Core.matrixAbsences(m, MX.map), days = rows.reduce((n, r) => n + Math.round((Date.parse(r.end) - Date.parse(r.start)) / 864e5) + 1, 0);
  const duty = [...m.codes].filter(([c]) => ['Früh', 'Spät', 'Nacht', 'Frei'].includes(MX.map[c])).reduce((n, x) => n + x[1], 0);
  return nf(rows.length) + ' Abwesenheiten mit ' + nf(days) + ' Tagen für ' + nf(new Set(rows.map(r => r.pk)).size) + ' Personen' + (duty ? ' · ' + nf(duty) + ' Diensttage für den Dienstplan' : '');
};
function matrixDialog() {
  const t = MX.tables[MX.idx], m = t.m, bad = m.errors.length > 0, codes = [...m.codes].sort((a, b) => b[1] - a[1]);
  openModal({ title: 'Urlaubsplan prüfen', wide: true, body: html`
    <div class="cmp" style="grid-template-columns:1fr 1.6fr"><div class="h">Datei</div><div class="h">${MX.file}</div>
      <div>Tabellenblatt</div><div class="n">${MX.tables.length > 1 ? html`<select data-chg="m:sheet">${opts(MX.tables.map((x, i) => [i, x.name + (x.m.errors.length ? ' – nicht lesbar' : ' · ' + x.m.persons + ' Personen')]), MX.idx)}</select>` : t.name}</div>
      ${bad ? '' : html`<div>Aufbau</div><div class="n">${m.layout}</div>
      <div>Zeitraum</div><div class="n">${fmt(m.range.start)} – ${fmt(m.range.end)} · ${nf(m.dates.length)} Tage</div>
      <div>Personen erkannt</div><div class="n">${nf(m.persons)} von ${nf(S.people.length)}</div>`}</div>
    ${bad ? html`<div class="note crit"><b>Nicht übernehmbar:</b>${m.errors.map(e => html`<div>${e}</div>`)}<div style="margin-top:6px">Erwartet wird eine Tabelle mit einer Zeile je Person (Personalnummer oder Name vorn) und einer Spalte je Tag.</div></div>` : html`
    <h3 style="margin:14px 0 4px;font-size:14px">Was bedeuten die Kürzel?</h3>
    <p class="small ink2" style="margin-bottom:8px">Gefunden wurden ${nf(codes.length)} verschiedene Einträge. Der Vorschlag erkennt übliche Kürzel – bitte prüfen und anpassen. „Nicht übernehmen“ lässt die Zelle unbeachtet.</p>
    <div class="tblwrap" style="max-height:260px"><table class="tbl"><thead><tr><th>Kürzel in der Tabelle</th><th class="n">Tage</th><th>Bedeutung</th></tr></thead><tbody>
      ${codes.map(([c, n]) => html`<tr><td><b>${c}</b></td><td class="n">${nf(n)}</td><td><select data-chg="m:map" data-c="${c}">${opts(Core.MATRIX_TARGETS.filter(x => MX.roster || !['Früh', 'Spät', 'Nacht', 'Frei'].includes(x)).map(x => [x, MX_LABEL[x]]), MX.map[c] || '')}</select></td></tr>`)}</tbody></table></div>
    <label class="c" style="margin-top:10px"><input type="checkbox" data-chg="m:roster" ${MX.roster ? raw('checked') : ''}> Die Tabelle enthält auch die Dienste (F, S, N …) – Dienstplan für diese Tage mit übernehmen</label>
    <div class="note good" style="margin-top:10px">Ergebnis: <b id="mxSum">${mxSummary()}</b></div>
    ${m.warnings.length ? html`<div class="note warn">${m.warnings.slice(0, 8).map(w => html`<div>${w}</div>`)}</div>` : ''}
    <p class="small ink2" style="margin-top:8px">Für die Personen der Tabelle ersetzen die Einträge im Zeitraum ${fmtS(m.range.start)} – ${fmt(m.range.end)} alle bisherigen Abwesenheiten, auch die simulierten. Wer nicht in der Tabelle steht, bleibt unverändert. Es wird nichts übertragen – die Datei bleibt ${isDesktop ? 'auf diesem Rechner' : 'in diesem Browserfenster'}.</p>`}`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok" ${bad ? raw('disabled') : ''}>Urlaubsplan übernehmen</button>`,
    handlers: {
      sheet: el => { MX.idx = +el.value; MX.map = Core.defaultCodeMap([...MX.tables[MX.idx].m.codes.keys()], MX.roster); matrixDialog(); },
      roster: el => { MX.roster = el.checked; const fresh = Core.defaultCodeMap([...m.codes.keys()], MX.roster); for (const c of Object.keys(fresh)) if (!MX.map[c] || !MX.roster) MX.map[c] = !MX.roster && ['Früh', 'Spät', 'Nacht', 'Frei'].includes(MX.map[c]) ? '' : MX.map[c] || fresh[c]; matrixDialog(); },
      map: el => { MX.map[el.dataset.c] = el.value; const out = $('#mxSum'); if (out) out.textContent = mxSummary(); },
      ok: () => {
        let info; const name = MX.file, map = MX.map;
        closeModal();
        commit('', () => { info = Core.applyDayMatrix(S, m, map); S.realImports.push({ kind: 'absences', start: m.range.start, end: m.range.end, file: name, at: new Date().toISOString() }); if (info.rosterDays) S.realImports.push({ kind: 'roster', start: m.range.start, end: m.range.end, file: name, at: new Date().toISOString() }); });
        MX = null;
        toast('Urlaubsplan übernommen: ' + nf(info.absences) + ' Abwesenheiten mit ' + nf(info.days) + ' Tagen' + (info.rosterDays ? ' · ' + nf(info.rosterDays) + ' Diensttage' : '') + ' · ' + nf(HARD) + ' Termine mit Konflikt' + (HARD ? ' – siehe Bericht' : ''), '', HARD ? { label: 'Zum Bericht', run: () => go('report') } : null);
      } } });
}
ACT['imp-matrix'] = async () => {
  if (!S.people.length) return toast('Zuerst Stammdaten laden', 'crit');
  const file = await pickFile('.xlsx,.csv,.txt'); if (!file) return;
  let tables;
  if (/\.xlsx$/i.test(file.name)) tables = (await Core.readXlsx(file)).filter(x => x.rows.some(r => r.some(Boolean))).map(x => ({ name: x.name, rows: x.rows }));
  else { if (file.size > 30e6) throw new Error('Datei zu groß (max. 30 MB)'); tables = [{ name: 'CSV', rows: Core.parseCSV(await file.text()) }]; }
  if (!tables.length) throw new Error('Die Datei enthält keine Daten');
  for (const t of tables) t.m = Core.parseDayMatrix(S, t.rows);
  const score = t => t.m.errors.length ? 0 : t.m.persons * t.m.dates.length;
  let idx = 0; tables.forEach((t, i) => { if (score(t) > score(tables[idx])) idx = i; });
  MX = { file: file.name, tables, idx, roster: false, map: Core.defaultCodeMap([...tables[idx].m.codes.keys()], false) };
  matrixDialog();
};

// ---------- Echtbetrieb ----------------------------------------------------------------------
/** Karte „Bereit für die echte Planung?“ – zeigt je Baustein, ob reale Daten vorliegen. */
function liveCard() {
  const items = Core.readiness(S, IX, SUM), parts = Core.simulatedParts(S), sim = parts.absences + parts.scenario + parts.courses;
  const icon = { good: ['good', '✓'], warn: ['warn', '!'], crit: ['crit', '!'], info: ['', 'i'] }, open = items.filter(x => x.state === 'warn' || x.state === 'crit').length;
  return html`<div class="card" style="margin-bottom:14px" id="liveCard"><div class="row"><h3 style="font-size:14.5px;font-weight:650">Bereit für die echte Planung?</h3>${open ? pill(open + (open === 1 ? ' Punkt offen' : ' Punkte offen'), 'warn') : pill('alles bereit', 'good')}<span class="sp"></span>
      <button class="btn sm primary" data-act="imp-matrix" data-tip="Excel-Tabelle mit einer Zeile je Person und einer Spalte je Tag (Kürzel wie U, K)">Urlaubsplan einspielen</button>
      <button class="btn sm" data-act="go-courses">Lehrgänge</button>
      <button class="btn sm" data-act="go-live" ${sim || parts.auto ? '' : raw('disabled')} data-tip="Entfernt simulierte Abwesenheiten, Szenariotermine und berechnete Termine – Personen, Qualifikationen und Cluster bleiben">Simulierte Daten entfernen …</button></div>
    <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 8px">Personen mit Qualifikationen und Clusterzuordnung bleiben immer erhalten. Belastbar wird die Planung mit realem Urlaubsplan, eingespielten Lehrgängen und – sobald er vorliegt – dem echten Dienstplan.</div>
    <ul class="hints">${items.map(x => html`<li><span class="ic ${icon[x.state][0]}">${icon[x.state][1]}</span><span class="grow"><b>${x.title}.</b> ${x.text}</span><button class="btn sm" data-act="go" data-id="${x.view}">${x.view === 'data' ? 'unten' : 'Öffnen'}</button></li>`)}</ul></div>`;
}
ACT['go-courses'] = () => go('courses');
ACT['go-live'] = () => {
  const p = Core.simulatedParts(S), row = (id, n, label, on = true) => html`<label class="c"><input type="checkbox" id="${id}" ${n && on ? raw('checked') : ''} ${n ? '' : raw('disabled')}> <span>${label} <b>(${nf(n)})</b></span></label>`;
  openModal({ title: 'Simulierte Daten entfernen', wide: true, body: html`
    <p class="ink2">Damit stellen Sie von der Erprobung auf die echte Planung um. <b>Erhalten bleiben immer:</b> alle ${nf(S.people.length)} Personen mit Qualifikationen, Cluster, Ziel und Vorleistungen sowie Ausbildungswege, Grenzwerte, Feiertage und Einstellungen.</p>
    <div class="stack" style="gap:9px;margin:12px 0">
      ${row('glAbs', p.absences, 'Simulierte Abwesenheiten entfernen – danach den realen Urlaubsplan einspielen')}
      ${row('glScen', p.scenario + p.courses, 'Szenariotermine und Szenario-Lehrgänge entfernen (' + nf(p.courses) + ' Lehrgänge) – danach reale Lehrgangstermine einspielen')}
      ${row('glAuto', p.auto, 'Berechnete Termine entfernen – der Plan wird mit den realen Daten neu berechnet')}
      ${row('glRoster', p.roster, 'Simulierten Dienstplan entfernen – nur sinnvoll, wenn der echte Dienstplan gleich eingespielt wird', false)}</div>
    <div class="note">Solange kein echter Dienstplan vorliegt, lassen Sie den simulierten Schichtrhythmus stehen: Die Kapazität bleibt dann eine Näherung und ist als „simuliert“ gekennzeichnet. Mit „Rückgängig“ kommen Sie zurück.</div>`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary danger" data-act="m:ok">Entfernen</button>`,
    handlers: { ok: () => {
      const o = { absences: $('#glAbs').checked, scenario: $('#glScen').checked, auto: $('#glAuto').checked, roster: $('#glRoster').checked };
      if (!Object.values(o).some(Boolean)) return toast('Nichts ausgewählt', 'crit');
      closeModal(); let done;
      commit('', () => { done = Core.removeSimulated(S, o); });
      toast('Entfernt: ' + [[done.absences, 'Abwesenheiten'], [done.scenario, 'Szenariotermine'], [done.courses, 'Szenario-Lehrgänge'], [done.auto, 'berechnete Termine'], [done.roster, 'Dienstpläne']].filter(x => x[0]).map(x => nf(x[0]) + ' ' + x[1]).join(', ') + '. Personen und Cluster sind unverändert.');
    } } });
};
export async function readTable(file) {
  if (/\.xlsx$/i.test(file.name)) { const t = Core.xlsxPeopleTable(await Core.readXlsx(file)); return { rows: t.rows, note: 'Excel-Blatt „' + t.sheet + '“' }; }
  if (file.size > 30e6) throw new Error('Datei zu groß (max. 30 MB)');
  return { rows: Core.parseCSV(await file.text()), note: 'CSV' };
}
ACT['imp-people'] = async () => {
  const file = await pickFile('.csv,.txt,.xlsx'); if (!file) return;
  const { rows, note } = await readTable(file), { head, rows: objs } = Core.rowsToObjects(rows), chk = Core.checkPeople(objs, head);
  const fresh = S.meta.dataClass === 'demo' || !S.people.length, known = new Set(S.people.map(p => p.pk)), inFile = new Set(chk.rows.map(r => String(r.pk).trim()));
  const nNew = [...inFile].filter(pk => !known.has(pk)).length, nGone = [...known].filter(pk => !inFile.has(pk)).length;
  importPreview({ title: 'Stammdaten prüfen', file: file.name, chk, facts: [['Format', note], ['Personen in der Datei', nf(chk.rows.length)], ['Erkannte Spalten', (chk.fields || []).join(', ') || '–'], ['Neu / bereits vorhanden', nf(nNew) + ' / ' + nf(chk.rows.length - nNew)]],
    extra: fresh ? html`<div class="note">${S.meta.dataClass === 'demo' ? 'Die Demo-Daten werden vollständig ersetzt (Personen, Dienstplan, Abwesenheiten, Termine).' : 'Die Personenliste wird neu angelegt.'}</div>` : html`
      <div class="stack" style="gap:8px"><label class="c"><input type="radio" name="pmode" value="merge" checked> Abgleichen – gelieferte Spalten aktualisieren, neue Personen ergänzen, übrige behalten</label>
      <label class="c"><input type="radio" name="pmode" value="replace"> Ersetzen – Liste entspricht danach genau der Datei (${nf(nGone)} Personen mit Terminen und Dienstplan würden entfernt)</label>
      <p class="small muted">Bei geändertem Cluster werden Ziel, Bestätigung und individueller Weg zurückgesetzt. Gesperrte Personen behalten ihr Cluster.</p></div>`,
    apply: () => {
      const mode = fresh ? 'replace' : ($('input[name=pmode]:checked')?.value || 'merge'); let info;
      commit('', () => {
        if (S.meta.dataClass === 'demo') { S.events = []; S.absences = []; S.roster = {}; S.report = []; S.capacity = []; S.realImports = []; S.meta.assumptions = []; S.meta.simulated = { roster: false, absences: false }; S.people = []; S.planInfo = null; }
        info = Core.applyPeople(S, chk, mode); S.meta.dataClass = 'real'; S.meta.source = 'Stammdaten: ' + file.name;
      });
      toast(nf(info.added) + ' Personen neu, ' + nf(info.updated) + ' aktualisiert' + (info.removed ? ', ' + nf(info.removed) + ' entfernt' : '') + (info.reclustered ? ' · ' + nf(info.reclustered) + ' Cluster geändert' : '') + (info.skippedLocked ? ' · ' + nf(info.skippedLocked) + ' gesperrte unverändert' : ''));
    } });
};
ACT['imp-roster'] = async () => {
  if (!S.people.length) return toast('Zuerst Stammdaten laden', 'crit');
  const file = await pickFile('.csv,.txt'); if (!file) return;
  const sc = impScope(), chk = Core.checkRoster(S, Core.parseCSV(await file.text()), sc, IMP.gaps);
  importPreview({ title: 'Dienstplan prüfen', file: file.name, chk, facts: [['Format', chk.format || '–'], ['Zeitraum', fmt(sc.start) + ' – ' + fmt(sc.end)], ['Personen in der Datei', nf(chk.persons || 0) + ' von ' + nf(S.people.length)], ['Personentage', nf(chk.cells || 0) + ' von ' + nf(chk.expected || 0)]],
    extra: html`<p class="small ink2">Im gewählten Zeitraum ersetzt die Datei den bisherigen Dienstplan vollständig; außerhalb bleibt er erhalten. Termine bleiben stehen und werden sofort auf Konflikte geprüft.</p>`,
    apply: () => { commit('', () => { Core.applyRoster(S, chk); if (fullYear(sc)) S.meta.simulated.roster = false; S.realImports.push({ kind: 'roster', start: sc.start, end: sc.end, file: file.name, at: new Date().toISOString() }); });
      toast('Dienstplan übernommen · ' + nf(HARD) + ' Termine mit Konflikt' + (HARD ? ' – siehe Bericht' : '')); } });
};
ACT['imp-absences'] = async () => {
  if (!S.people.length) return toast('Zuerst Stammdaten laden', 'crit');
  if (!IMP.complete) return toast('Bitte zuerst bestätigen, dass die Datei alle Abwesenheiten im Zeitraum enthält', 'crit');
  const file = await pickFile('.csv,.txt'); if (!file) return;
  const sc = impScope(), { head, rows } = Core.rowsToObjects(Core.parseCSV(await file.text())), chk = Core.checkAbsences(S, rows, head, sc);
  importPreview({ title: 'Abwesenheiten prüfen', file: file.name, chk, facts: [['Zeitraum', fmt(sc.start) + ' – ' + fmt(sc.end)], ['Abwesenheiten in der Datei', nf(chk.rows.length)], ['Betroffene Personen', nf(new Set(chk.rows.map(r => r.pk)).size)]],
    extra: html`<p class="small ink2">Im gewählten Zeitraum ersetzt die Datei alle bisherigen Abwesenheiten; kein Eintrag bedeutet keine Abwesenheit. Zeiträume, die über die Grenzen hinausreichen, werden abgeschnitten.</p>`,
    apply: () => { commit('', () => { Core.applyAbsences(S, chk); if (fullYear(sc)) S.meta.simulated.absences = false; S.realImports.push({ kind: 'absences', start: sc.start, end: sc.end, file: file.name, at: new Date().toISOString() }); });
      toast('Abwesenheiten übernommen · ' + nf(HARD) + ' Termine mit Konflikt' + (HARD ? ' – siehe Bericht' : '')); } });
};
ACT['imp-capacity'] = async () => {
  const file = await pickFile('.csv,.txt'); if (!file) return;
  const { head, rows } = Core.rowsToObjects(Core.parseCSV(await file.text())), chk = Core.checkCapacity(rows, head, S.meta.year);
  importPreview({ title: 'Tageskapazität prüfen', file: file.name, chk, facts: [['Tageswerte', nf(chk.rows.length)]], extra: html`<p class="small ink2">Importierte Tageswerte ersetzen die bisherigen und haben Vorrang vor der Ableitung aus dem Dienstplan. „net“ ist die Ausgangskapazität vor Krankenreserve und Maßnahmen.</p>`,
    apply: () => { commit(nf(chk.rows.length) + ' Tageswerte übernommen', () => { S.capacity = chk.rows; }); } });
};
ACT['imp-events'] = async () => {
  if (!S.people.length) return toast('Zuerst Stammdaten laden', 'crit');
  const file = await pickFile('.csv,.txt'); if (!file) return;
  const { head, rows } = Core.rowsToObjects(Core.parseCSV(await file.text())), chk = Core.checkEvents(S, rows, head);
  importPreview({ title: 'Feste Termine prüfen', file: file.name, chk, facts: [['Termine in der Datei', nf(chk.rows.length)]], extra: html`<p class="small ink2">Die Termine werden als fixierte Termine ergänzt (z. B. gebuchte Kurse). Vorhandene Termine bleiben unverändert.</p>`,
    apply: () => { commit(nf(chk.rows.length) + ' feste Termine ergänzt', () => { S.events.push(...chk.rows); }); } });
};
ACT['imp-school'] = async () => {
  const file = await pickFile('.csv,.txt'); if (!file) return;
  const { rows } = Core.rowsToObjects(Core.parseCSV(await file.text())), out = [], errors = [];
  rows.forEach((r, i) => { const s = Core.normDate(r.start), e = Core.normDate(r.end); if (!s || !e || e < s) errors.push('Zeile ' + (i + 2) + ': Zeitraum ungültig'); else out.push({ name: String(r.name || 'Ferien').slice(0, 80), start: s, end: e }); });
  importPreview({ title: 'Ferien prüfen', file: file.name, chk: { errors }, facts: [['Ferienzeiträume', nf(out.length)]], apply: () => { commit('Ferien ersetzt', () => { S.school = out.sort((a, b) => a.start < b.start ? -1 : 1); }); } });
};
ACT['imp-key'] = async () => {
  const file = await pickFile('.csv,.txt'); if (!file) return;
  const { head, rows } = Core.rowsToObjects(Core.parseCSV(await file.text()));
  if (!head.includes('alias') || !head.includes('pk')) throw new Error('Schlüsseldatei braucht die Spalten alias und pk');
  // Die Schlüsseldatei gilt für alle Planungsjahre des Projekts
  let hits = {}; commitProject('', prj => { hits = Core.reidentifyProject(prj, rows); });
  const hit = hits[S.meta.year] || 0, others = years().length > 1 ? ' · insgesamt ' + nf(Object.values(hits).reduce((s, v) => s + v, 0)) + ' Zuordnungen in ' + years().length + ' Planungsjahren' : '';
  toast(hit || others ? nf(hit) + ' von ' + nf(S.people.length) + ' Personen wieder zugeordnet' + others : 'Keine passenden Pseudonyme gefunden', Object.values(hits).some(Boolean) ? '' : 'crit');
};
ACT['tpl'] = t => templateDownload(t.dataset.k);
ACT['exp-roster'] = () => { const sc = impScope(), a = IX.cal.idx(sc.start), b = IX.cal.idx(sc.end), rows = []; S.people.forEach((p, i) => { for (let d = a; d <= b; d++) { const c = IX.ros[i][d]; rows.push([privacy() ? p.alias : p.pk, IX.cal.iso[d], c >= 2 ? Core.kArea(c - 2) : 'M1', c >= 2 ? Core.kShift(c - 2) : 'Frei']); } }); csvDownload('Dienstplan', Core.TEMPLATES.roster, rows); };
ACT['exp-pseudo'] = async () => {
  // Pseudonymisiert wird das ganze Projekt: dieselbe Person trägt in jedem Planungsjahr dasselbe Pseudonym
  const { project, key } = Core.pseudonymizeProject(PRJ), stamp = new Date().toISOString().slice(0, 10), real = projectClass() === 'real';
  const ys = years(), span = ys.length > 1 ? ys[0] + '-' + ys[ys.length - 1] : ys[0];
  if (!await download('M1_Cockpit_' + span + '_Projekt_' + stamp + '_pseudonymisiert.' + (isDesktop ? 'm1cockpit' : 'json'), Core.serializeProject(project))) return;
  if (real) {
    if (!isDesktop) await new Promise(r => setTimeout(r, 600));                 // Browser: zweiter Download erst nach dem ersten
    await download('M1_Cockpit_' + span + '_Schluesseldatei_' + stamp + '_VERTRAULICH.csv', Core.toCSV(Core.TEMPLATES.key, key.map(k => [k.alias, k.pk, k.name, k.org])), 'text/csv');
  }
  toast(real ? 'Zwei Dateien: pseudonymisierte Projektdatei und Schlüsseldatei. Die Schlüsseldatei bleibt in der geschützten Umgebung.' : 'Pseudonymisierte Projektdatei gesichert');
};
CHG.imp = t => { IMP[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value; };
CHG.meta = t => { const v = t.value.trim().slice(0, 120); if (v) commit('Projekttitel gespeichert', () => { S.meta.title = v; }); };
CHG.autosave = t => {
  setAutosave(t.checked);
  toast(t.checked ? (isDesktop ? 'Wiederherstellungskopie eingeschaltet' : 'Zwischenspeichern im Browser eingeschaltet') : (isDesktop ? 'Wiederherstellungskopie ausgeschaltet und gelöscht' : 'Zwischenspeicher ausgeschaltet und geleert'));
  render();
};
CHG.backups = t => { desktop.settings.set('backups', t.checked); toast(t.checked ? 'Sicherungskopie beim Speichern eingeschaltet' : 'Sicherungskopie beim Speichern ausgeschaltet – vorhandene .bak-Dateien bleiben liegen'); render(); };
ACT['wipe'] = async () => {
  if (!await confirmDlg('Alle Daten aus diesem Fenster entfernen', 'Planungsstand, Rückgängig-Verlauf und ' + (isDesktop ? 'Wiederherstellungskopie' : 'Browser-Zwischenspeicher') + ' werden geleert. Nicht gesicherte Änderungen gehen verloren.' + (isDesktop ? ' Gespeicherte Projektdateien bleiben unberührt.' : ''), 'Alles entfernen', true)) return;
  clearAutosave(); resetAll(Core.emptyState(S.meta.year)); go('data');
};
VIEWS.data = {
  render() {
    const sc = impScope(), yr = String(S.meta.year), withRoster = S.people.filter(p => S.roster[p.pk]).length, sim = S.meta.simulated, on = autosaveOn();
    let covered = 0; for (let d = 0; d < IX.n; d++) if (IX.rosterDay[d]) covered++;
    const hist2 = S.realImports.slice(-4).map(r => (r.kind === 'roster' ? 'Dienstplan' : 'Abwesenheiten') + ' ' + fmtS(r.start) + '–' + fmt(r.end)).join(' · ');
    const card = (title, text, buttons, extra = '') => html`<div class="dc"><h3>${title}</h3><p>${text}</p>${extra}<div class="row">${buttons}</div></div>`;
    const tpl = k => html`<button class="btn sm" data-act="tpl" data-k="${k}">Leere Vorlage</button>`;
    return html`
    <div class="view-head"><div><h1>Daten & Datenschutz</h1><p>Dieses Programm enthält keine Personendaten. Reale Daten laden Sie erst in Ihrer geschützten Umgebung; sie bleiben ${isDesktop ? 'auf diesem Rechner – im Programmfenster und in den Dateien, die Sie selbst speichern' : 'in diesem Browserfenster und in den Dateien, die Sie selbst sichern'}.</p></div></div>
    <div class="kpis" style="grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:14px">
      <div class="kpi"><div class="l">Stammdaten</div><div class="v">${nf(S.people.length)}</div><div class="s">${DATA_CLASS[S.meta.dataClass][0]}</div></div>
      <div class="kpi"><div class="l">Dienstplan</div><div class="v">${S.people.length ? nf(withRoster / S.people.length * 100) + ' %' : '–'}</div><div class="s">${nf(covered)} Tage · ${withRoster ? (sim.roster ? 'simuliert' : 'real') : 'nicht geladen'}</div></div>
      <div class="kpi"><div class="l">Abwesenheiten</div><div class="v">${nf(S.absences.length)}</div><div class="s">${S.absences.length ? (sim.absences ? 'simuliert' : 'real') : 'keine'}</div></div>
      <div class="kpi"><div class="l">Kapazität</div><div class="v">${nf(SUM.knownDays)}</div><div class="s">prüfbare Diensttage · ${S.capacity.length ? 'Tageswerte' : 'aus Dienstplan'}</div></div>
      <div class="kpi"><div class="l">Kalender</div><div class="v">${nf(S.holidays.length)}</div><div class="s">Feiertage · ${nf(S.school.length)} Ferienzeiträume</div></div>
    </div>
    ${practiceCard()}
    ${S.people.length ? liveCard() : ''}
    <div class="card" style="margin-bottom:14px"><h3>1 · Vorhandenen Stand übernehmen</h3><div class="sub">Der schnellste Weg von der Vorgängerversion: deren HTML-Datei oder JSON-Sicherung direkt laden – Personen, Dienstplan, Abwesenheiten, Termine, Wege und Einstellungen kommen vollständig mit.</div>
      <div class="row"><button class="btn primary" data-act="load-project">${isDesktop ? 'Projekt oder Vorgänger-Datei öffnen' : 'Projektdatei oder Vorgänger-Datei laden'}</button><span class="small muted">Formate: Projektdatei (.m1cockpit, .json) · Einzeldatei-Fassung als .json oder .html · „M1 Jahressimulation“ 3.x als .html oder .json</span></div>
      ${recentFiles().length ? html`<div class="row small" style="margin-top:10px"><span class="ink2">Zuletzt geöffnet:</span>${recentFiles().slice(0, 5).map(f => html`<button class="btn sm" data-act="open-recent" data-i="${f.index}" data-tip="${f.dir}">${f.name}</button>`)}</div>` : ''}</div>
    <div class="card" style="margin-bottom:14px"><h3>2 · Einzelne Datenbereiche laden</h3><div class="sub">CSV mit Semikolon, Komma oder Tabulator; Datum als JJJJ-MM-TT oder TT.MM.JJJJ. Jede Datei wird zuerst geprüft und als Vorschau gezeigt.</div>
      <div class="row" style="margin-bottom:12px;padding:10px 12px;background:var(--surface-2);border-radius:8px">
        <span class="small ink2">Zeitraum für Dienstplan und Abwesenheiten</span>
        <input type="date" data-chg="imp" data-f="from" value="${sc.start}" min="${yr}-01-01" max="${yr}-12-31" aria-label="Zeitraum von"><span class="muted">bis</span><input type="date" data-chg="imp" data-f="to" value="${sc.end}" min="${yr}-01-01" max="${yr}-12-31" aria-label="Zeitraum bis">
        ${hist2 ? html`<span class="small muted">Zuletzt geladen: ${hist2}</span>` : ''}</div>
      <div class="datacards">
        ${card('Stammdaten', 'Personalnummer, Name, Cluster, Ziel und Berechtigungen. CSV oder Excel (Blatt mit Spalte „Personalnummer“). Auch als reines Cluster-Update nutzbar.', html`<button class="btn" data-act="imp-people">Datei wählen</button>${tpl('people')}`)}
        ${card('Dienstplan', 'Liste (pk; date; area; shift) oder Matrix mit einer Zeile je Person und einer Spalte je Datum. Dienste: Früh, Spät, Nacht, Frei oder F / S / N / OFF.', html`<button class="btn" data-act="imp-roster">Datei wählen</button>${tpl('roster')}<button class="btn sm" data-act="exp-roster" data-tip="Aktueller Dienstplan im gewählten Zeitraum als bearbeitbare CSV">Arbeitsvorlage</button>`,
          html`<label class="c small"><input type="checkbox" data-chg="imp" data-f="gaps" ${IMP.gaps ? raw('checked') : ''}> Lücken zulassen (fehlende Personentage bleiben ohne Zuordnung)</label>`)}
        ${card('Urlaubsplan und Abwesenheiten', 'Am einfachsten: die Excel-Tabelle des Urlaubsplans (eine Zeile je Person, eine Spalte je Tag, Kürzel wie U oder K). Alternativ eine Liste pk; start; end; type.', html`<button class="btn primary" data-act="imp-matrix">Excel-Tabelle je Tag</button><button class="btn" data-act="imp-absences">Liste (Von/Bis)</button>${tpl('absences')}`,
          html`<label class="c small"><input type="checkbox" data-chg="imp" data-f="complete" ${IMP.complete ? raw('checked') : ''}> Nur für die Liste: Datei enthält alle Abwesenheiten aller Personen im Zeitraum</label>`)}
        ${card('Lehrgangstermine', 'Feste Termine der Lehrgänge: Lehrgang; Art; Zielmuster; Beginn; Ende; Plätze – optional je Zeile ein Teilnehmer. CSV oder Excel.', html`<button class="btn" data-act="crs-import">Datei wählen</button><button class="btn sm" data-act="crs-tpl">Leere Vorlage</button><button class="btn sm" data-act="go-courses">Zum Modul Lehrgänge</button>`)}
        ${card('Feste Termine', 'Gebuchte Kurse und andere feste Maßnahmen: pk; type; title; start; end und optional die Verlustfaktoren.', html`<button class="btn" data-act="imp-events">Datei wählen</button>${tpl('events')}`)}
        ${card('Tageskapazität (optional)', 'Eigene Tageswerte statt der Ableitung aus dem Dienstplan: date; area; shift; net; min; zero; checked.', html`<button class="btn" data-act="imp-capacity">Datei wählen</button>${tpl('capacity')}`)}
        ${card('Ferien', 'name; start; end – ersetzt die hinterlegten Ferienzeiträume.', html`<button class="btn" data-act="imp-school">Datei wählen</button>${tpl('school')}`)}
      </div></div>
    <div class="grid2" style="margin-bottom:14px">
      <div class="card"><h3>3 · Sichern und weitergeben</h3><div class="sub">Dateien mit Personendaten tragen „VERTRAULICH“ im Namen</div>
        <div class="stack" style="gap:10px">
          ${isDesktop ? html`<div class="row"><button class="btn primary" data-act="save-project">Projekt speichern</button><button class="btn" data-act="save-project-as">Speichern unter …</button><span class="small ink2 grow">${DOC.name ? 'Geöffnet: ' + DOC.name : 'Noch nicht gespeichert'} · alle Planungsjahre in einer Projektdatei (.m1cockpit).</span></div>`
            : html`<div class="row"><button class="btn primary" data-act="save-project">Projektdatei sichern</button><span class="small ink2 grow">Vollständiger Stand als JSON – zum Weiterarbeiten wieder laden.</span></div>`}
          <div class="row"><button class="btn" data-act="save-snapshot">Programm mit Stand sichern</button><span class="small ink2 grow">Eine HTML-Datei, die beim Öffnen genau diesen Stand zeigt${isDesktop ? ' – zum Weitergeben an Personen ohne das Programm' : ''}.</span></div>
          <div class="row"><button class="btn" data-act="exp-pseudo">Pseudonymisiert sichern</button><span class="small ink2 grow">Projektdatei ohne Namen und Personalnummern (P-001 …) plus getrennte Schlüsseldatei.</span></div>
          <div class="row"><button class="btn" data-act="imp-key">Schlüsseldatei anwenden</button><span class="small ink2 grow">Ordnet einem pseudonymisierten Stand Namen und Nummern wieder zu.</span>${tpl('key')}</div>
          <div class="row small"><span class="ink2">Berichte:</span><button class="btn sm" data-act="export-xlsx" data-tip="Alle Tabellen des Planungsjahres ${S.meta.year} als Excel-Arbeitsmappe (.xlsx)">Excel-Arbeitsmappe</button><button class="btn sm" data-act="go" data-id="fullreport" data-tip="Druckfertige Zusammenfassung – als PDF speicherbar">Gesamtbericht (PDF)</button></div>
          <div class="row small"><span class="ink2">Auswertungen als CSV:</span><button class="btn sm" data-act="events-export">Termine</button><button class="btn sm" data-act="report-export">Bericht</button><button class="btn sm" data-act="cap-export">Tageskapazität</button><button class="btn sm" data-act="people-export">Personen</button></div>
        </div></div>
      <div class="card"><h3>Datenschutz in diesem Programm</h3><div class="sub">Technisch abgesichert, nicht nur zugesagt</div>
        <ul class="hints">
          <li><span class="ic good">✓</span><span><b>Keine Übertragung.</b> ${isDesktop ? 'Die Oberfläche baut keine Netzwerkverbindungen auf: eine Inhaltsrichtlinie und eine Sperre im Programm weisen alles außer den eigenen Programmdateien ab. Es gibt keine externen Bibliotheken, Schriften oder Zähler. Die einzige Verbindung nach außen ist die Suche nach einer neuen Programmversion (Karte „Programm-Aktualisierung“); dabei wird nichts aus dem Programm übertragen, und sie lässt sich abschalten.' : 'Eine Inhaltsrichtlinie in der Datei sperrt jede Netzwerkverbindung; es gibt keine externen Bibliotheken, Schriften oder Zähler.'}</span></li>
          <li><span class="ic good">✓</span><span><b>Keine eingebetteten Personen.</b> ${isDesktop ? 'Das Programm' : 'Die Programmdatei'} enthält nur Logik und Vorgabewerte und startet leer. Die Daten des Übungsmodus werden zufällig erzeugt.</span></li>
          <li><span class="ic ${privacy() ? 'good' : ''}">${privacy() ? '✓' : 'i'}</span><span class="grow"><b>Namen verbergen.</b> Zeigt überall Pseudonyme statt Namen und Personalnummern – für Besprechungen und Bildschirmfotos.</span><button class="btn sm ${privacy() ? 'on' : ''}" data-act="toggle-privacy">${privacy() ? 'Namen zeigen' : 'Namen verbergen'}</button></li>
          <li><span class="ic ${on ? 'warn' : 'good'}">${on ? '!' : '✓'}</span><span class="grow">${isDesktop ? html`<b>Wiederherstellungskopie.</b> Standardmäßig aus: außerhalb Ihrer Projektdateien bleibt nichts zurück. Eingeschaltet liegt bei ungespeicherten Änderungen eine Kopie des Stands im Benutzerprofil dieses Rechners und wird nach einem Absturz angeboten.` : html`<b>Zwischenspeichern im Browser.</b> Standardmäßig aus: nichts bleibt nach dem Schließen zurück. Eingeschaltet liegt der Stand im Browserprofil dieses Rechners.`}</span><label class="c small nowrap"><input type="checkbox" data-chg="autosave" ${on ? raw('checked') : ''}> einschalten</label></li>
          ${isDesktop ? html`<li><span class="ic ${desktop.settings.get('backups') ? '' : 'good'}">${desktop.settings.get('backups') ? 'i' : '✓'}</span><span class="grow"><b>Sicherungskopie beim Speichern.</b> Vor dem Überschreiben bleibt der vorherige Stand als Datei mit der Endung .bak neben der Projektdatei erhalten. Die Kopie enthält dieselben Personendaten wie die Projektdatei.</span><label class="c small nowrap"><input type="checkbox" data-chg="backups" ${desktop.settings.get('backups') ? raw('checked') : ''}> anlegen</label></li>` : ''}
          <li><span class="ic">i</span><span class="grow"><b>Pseudonymisiert ist nicht anonym.</b> Wer die Schlüsseldatei oder genaue Kenntnis der Qualifikationen hat, kann Personen zuordnen. Schlüsseldatei getrennt und geschützt aufbewahren.</span></li>
        </ul>
        <div class="row" style="margin-top:10px"><button class="btn danger" data-act="wipe">Alle Daten aus diesem Fenster entfernen</button></div></div>
    </div>
    ${updateCard()}
    ${yearsCard()}
    <div class="card"><h3>Projekt</h3><div class="sub">Planungsjahr ${S.meta.year} · erstellt ${fmt(String(S.meta.created).slice(0, 10))}${S.meta.source ? ' · ' + S.meta.source : ''}</div>
      <div class="row"><label class="f" style="min-width:280px">Projekttitel<input type="text" data-chg="meta" value="${S.meta.title}" maxlength="120"></label><span class="sp"></span>
        <button class="btn" data-act="new-empty">Leeres Projekt anlegen</button></div></div>`;
  }
};
