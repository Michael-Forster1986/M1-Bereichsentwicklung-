import * as Core from '../../core/index.js';
import { csvDownload, download, pickFile, templateDownload } from '../files.js';
import { $, html, raw } from '../dom.js';
import { DATA_CLASS, fmt, fmtS, nf } from '../format.js';
import { isDesktop } from '../../platform/desktop.js';
import { CONF, IX, S, SUM, autosaveOn, clearAutosave, commit, privacy, resetAll, setAutosave } from '../state.js';
import { closeModal, confirmDlg, openModal, toast } from '../dialogs.js';
import { ACT, CHG, VIEWS } from '../registry.js';
import { go, render } from '../shell.js';

// ---------- Daten & Datenschutz -------------------------------------------------------
const IMP = { from: '', to: '', gaps: false, complete: false };
function impScope() { const y = S.meta.year; if (!IMP.from.startsWith(String(y))) IMP.from = y + '-01-01'; if (!IMP.to.startsWith(String(y))) IMP.to = y + '-12-31'; return { start: IMP.from, end: IMP.to }; }
const fullYear = sc => sc.start === S.meta.year + '-01-01' && sc.end === S.meta.year + '-12-31';
/** Vorschau mit Prüfergebnis; „Übernehmen“ nur ohne Fehler. */
function importPreview({ title, file, facts, chk, apply, extra }) {
  const errs = chk.errors || [], warns = chk.warnings || [];
  openModal({ title, wide: true, body: html`
    <div class="cmp" style="grid-template-columns:1fr 1.4fr"><div class="h">Datei</div><div class="h">${file}</div>${facts.map(([k, v]) => html`<div>${k}</div><div class="n">${v}</div>`)}</div>
    ${extra || ''}
    ${errs.length ? html`<div class="note crit"><b>Nicht übernehmbar – ${errs.length} Fehler:</b>${errs.slice(0, 20).map(e => html`<div>${e}</div>`)}</div>` : html`<div class="note good">Prüfung bestanden. Es wird nichts übertragen – die Datei bleibt in diesem Browserfenster.</div>`}
    ${warns.length ? html`<div class="note warn">${warns.slice(0, 12).map(w => html`<div>${w}</div>`)}${warns.length > 12 ? html`<div>… ${warns.length - 12} weitere Hinweise</div>` : ''}</div>` : ''}`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok" ${errs.length ? raw('disabled') : ''}>Übernehmen</button>`,
    handlers: { ok: () => { const r = apply(); if (r !== false) closeModal(); } } });
}
async function readTable(file) {
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
      toast('Dienstplan übernommen · ' + nf(CONF.size) + ' Termine mit Konflikt' + (CONF.size ? ' – siehe Bericht' : '')); } });
};
ACT['imp-absences'] = async () => {
  if (!S.people.length) return toast('Zuerst Stammdaten laden', 'crit');
  if (!IMP.complete) return toast('Bitte zuerst bestätigen, dass die Datei alle Abwesenheiten im Zeitraum enthält', 'crit');
  const file = await pickFile('.csv,.txt'); if (!file) return;
  const sc = impScope(), { head, rows } = Core.rowsToObjects(Core.parseCSV(await file.text())), chk = Core.checkAbsences(S, rows, head, sc);
  importPreview({ title: 'Abwesenheiten prüfen', file: file.name, chk, facts: [['Zeitraum', fmt(sc.start) + ' – ' + fmt(sc.end)], ['Abwesenheiten in der Datei', nf(chk.rows.length)], ['Betroffene Personen', nf(new Set(chk.rows.map(r => r.pk)).size)]],
    extra: html`<p class="small ink2">Im gewählten Zeitraum ersetzt die Datei alle bisherigen Abwesenheiten; kein Eintrag bedeutet keine Abwesenheit. Zeiträume, die über die Grenzen hinausreichen, werden abgeschnitten.</p>`,
    apply: () => { commit('', () => { Core.applyAbsences(S, chk); if (fullYear(sc)) S.meta.simulated.absences = false; S.realImports.push({ kind: 'absences', start: sc.start, end: sc.end, file: file.name, at: new Date().toISOString() }); });
      toast('Abwesenheiten übernommen · ' + nf(CONF.size) + ' Termine mit Konflikt' + (CONF.size ? ' – siehe Bericht' : '')); } });
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
  let hit = 0; commit('', () => { hit = Core.reidentify(S, rows); });
  toast(hit ? nf(hit) + ' von ' + nf(S.people.length) + ' Personen wieder zugeordnet' : 'Keine passenden Pseudonyme gefunden', hit ? '' : 'crit');
};
ACT['tpl'] = t => templateDownload(t.dataset.k);
ACT['exp-roster'] = () => { const sc = impScope(), a = IX.cal.idx(sc.start), b = IX.cal.idx(sc.end), rows = []; S.people.forEach((p, i) => { for (let d = a; d <= b; d++) { const c = IX.ros[i][d]; rows.push([privacy() ? p.alias : p.pk, IX.cal.iso[d], c >= 2 ? Core.kArea(c - 2) : 'M1', c >= 2 ? Core.kShift(c - 2) : 'Frei']); } }); csvDownload('Dienstplan', Core.TEMPLATES.roster, rows); };
ACT['exp-pseudo'] = async () => {
  const { state, key } = Core.pseudonymize(S), stamp = new Date().toISOString().slice(0, 10), real = S.meta.dataClass === 'real';
  if (!await download('M1_Cockpit_' + S.meta.year + '_Projekt_' + stamp + '_pseudonymisiert.json', JSON.stringify(state))) return;
  if (real) {
    if (!isDesktop) await new Promise(r => setTimeout(r, 600));                 // Browser: zweiter Download erst nach dem ersten
    await download('M1_Cockpit_' + S.meta.year + '_Schluesseldatei_' + stamp + '_VERTRAULICH.csv', Core.toCSV(Core.TEMPLATES.key, key.map(k => [k.alias, k.pk, k.name, k.org])), 'text/csv');
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
    <div class="view-head"><div><h1>Daten & Datenschutz</h1><p>Dieses Programm enthält keine Personendaten. Reale Daten laden Sie erst in Ihrer geschützten Umgebung; sie bleiben in diesem Browserfenster und in den Dateien, die Sie selbst sichern.</p></div></div>
    <div class="kpis" style="grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:14px">
      <div class="kpi"><div class="l">Stammdaten</div><div class="v">${nf(S.people.length)}</div><div class="s">${DATA_CLASS[S.meta.dataClass][0]}</div></div>
      <div class="kpi"><div class="l">Dienstplan</div><div class="v">${S.people.length ? nf(withRoster / S.people.length * 100) + ' %' : '–'}</div><div class="s">${nf(covered)} Tage · ${withRoster ? (sim.roster ? 'simuliert' : 'real') : 'nicht geladen'}</div></div>
      <div class="kpi"><div class="l">Abwesenheiten</div><div class="v">${nf(S.absences.length)}</div><div class="s">${S.absences.length ? (sim.absences ? 'simuliert' : 'real') : 'keine'}</div></div>
      <div class="kpi"><div class="l">Kapazität</div><div class="v">${nf(SUM.knownDays)}</div><div class="s">prüfbare Diensttage · ${S.capacity.length ? 'Tageswerte' : 'aus Dienstplan'}</div></div>
      <div class="kpi"><div class="l">Kalender</div><div class="v">${nf(S.holidays.length)}</div><div class="s">Feiertage · ${nf(S.school.length)} Ferienzeiträume</div></div>
    </div>
    <div class="card" style="margin-bottom:14px"><h3>1 · Vorhandenen Stand übernehmen</h3><div class="sub">Der schnellste Weg von der Vorgängerversion: deren HTML-Datei oder JSON-Sicherung direkt laden – Personen, Dienstplan, Abwesenheiten, Termine, Wege und Einstellungen kommen vollständig mit.</div>
      <div class="row"><button class="btn primary" data-act="load-project">Projektdatei oder Vorgänger-Datei laden</button><span class="small muted">Formate: Projektdatei (.json) · „M1 Jahressimulation“ 3.x als .html oder .json</span></div></div>
    <div class="card" style="margin-bottom:14px"><h3>2 · Einzelne Datenbereiche laden</h3><div class="sub">CSV mit Semikolon, Komma oder Tabulator; Datum als JJJJ-MM-TT oder TT.MM.JJJJ. Jede Datei wird zuerst geprüft und als Vorschau gezeigt.</div>
      <div class="row" style="margin-bottom:12px;padding:10px 12px;background:var(--surface-2);border-radius:8px">
        <span class="small ink2">Zeitraum für Dienstplan und Abwesenheiten</span>
        <input type="date" data-chg="imp" data-f="from" value="${sc.start}" min="${yr}-01-01" max="${yr}-12-31" aria-label="Zeitraum von"><span class="muted">bis</span><input type="date" data-chg="imp" data-f="to" value="${sc.end}" min="${yr}-01-01" max="${yr}-12-31" aria-label="Zeitraum bis">
        ${hist2 ? html`<span class="small muted">Zuletzt geladen: ${hist2}</span>` : ''}</div>
      <div class="datacards">
        ${card('Stammdaten', 'Personalnummer, Name, Cluster, Ziel und Berechtigungen. CSV oder Excel (Blatt mit Spalte „Personalnummer“). Auch als reines Cluster-Update nutzbar.', html`<button class="btn" data-act="imp-people">Datei wählen</button>${tpl('people')}`)}
        ${card('Dienstplan', 'Liste (pk; date; area; shift) oder Matrix mit einer Zeile je Person und einer Spalte je Datum. Dienste: Früh, Spät, Nacht, Frei oder F / S / N / OFF.', html`<button class="btn" data-act="imp-roster">Datei wählen</button>${tpl('roster')}<button class="btn sm" data-act="exp-roster" data-tip="Aktueller Dienstplan im gewählten Zeitraum als bearbeitbare CSV">Arbeitsvorlage</button>`,
          html`<label class="c small"><input type="checkbox" data-chg="imp" data-f="gaps" ${IMP.gaps ? raw('checked') : ''}> Lücken zulassen (fehlende Personentage bleiben ohne Zuordnung)</label>`)}
        ${card('Urlaub und Abwesenheiten', 'pk; start; end; type mit Urlaub, Krank oder Sonstiges. Zeiträume einschließlich Start und Ende.', html`<button class="btn" data-act="imp-absences">Datei wählen</button>${tpl('absences')}`,
          html`<label class="c small"><input type="checkbox" data-chg="imp" data-f="complete" ${IMP.complete ? raw('checked') : ''}> Datei enthält alle Abwesenheiten aller Personen im Zeitraum</label>`)}
        ${card('Feste Termine', 'Gebuchte Kurse und andere feste Maßnahmen: pk; type; title; start; end und optional die Verlustfaktoren.', html`<button class="btn" data-act="imp-events">Datei wählen</button>${tpl('events')}`)}
        ${card('Tageskapazität (optional)', 'Eigene Tageswerte statt der Ableitung aus dem Dienstplan: date; area; shift; net; min; zero; checked.', html`<button class="btn" data-act="imp-capacity">Datei wählen</button>${tpl('capacity')}`)}
        ${card('Ferien', 'name; start; end – ersetzt die hinterlegten Ferienzeiträume.', html`<button class="btn" data-act="imp-school">Datei wählen</button>${tpl('school')}`)}
      </div></div>
    <div class="grid2" style="margin-bottom:14px">
      <div class="card"><h3>3 · Sichern und weitergeben</h3><div class="sub">Dateien mit Personendaten tragen „VERTRAULICH“ im Namen</div>
        <div class="stack" style="gap:10px">
          <div class="row"><button class="btn primary" data-act="save-project">Projektdatei sichern</button><span class="small ink2 grow">Vollständiger Stand als JSON – zum Weiterarbeiten wieder laden.</span></div>
          <div class="row"><button class="btn" data-act="save-snapshot">Programm mit Stand sichern</button><span class="small ink2 grow">Eine HTML-Datei, die beim Öffnen genau diesen Stand zeigt.</span></div>
          <div class="row"><button class="btn" data-act="exp-pseudo">Pseudonymisiert sichern</button><span class="small ink2 grow">Projektdatei ohne Namen und Personalnummern (P-001 …) plus getrennte Schlüsseldatei.</span></div>
          <div class="row"><button class="btn" data-act="imp-key">Schlüsseldatei anwenden</button><span class="small ink2 grow">Ordnet einem pseudonymisierten Stand Namen und Nummern wieder zu.</span>${tpl('key')}</div>
          <div class="row small"><span class="ink2">Auswertungen als CSV:</span><button class="btn sm" data-act="events-export">Termine</button><button class="btn sm" data-act="report-export">Bericht</button><button class="btn sm" data-act="cap-export">Tageskapazität</button><button class="btn sm" data-act="people-export">Personen</button></div>
        </div></div>
      <div class="card"><h3>Datenschutz in diesem Programm</h3><div class="sub">Technisch abgesichert, nicht nur zugesagt</div>
        <ul class="hints">
          <li><span class="ic good">✓</span><span><b>Keine Übertragung.</b> Eine Inhaltsrichtlinie in der Datei sperrt jede Netzwerkverbindung; es gibt keine externen Bibliotheken, Schriften oder Zähler.</span></li>
          <li><span class="ic good">✓</span><span><b>Keine eingebetteten Personen.</b> Die Programmdatei enthält nur Logik und Vorgabewerte. Demo-Daten werden beim Start zufällig erzeugt.</span></li>
          <li><span class="ic ${privacy() ? 'good' : ''}">${privacy() ? '✓' : 'i'}</span><span class="grow"><b>Namen verbergen.</b> Zeigt überall Pseudonyme statt Namen und Personalnummern – für Besprechungen und Bildschirmfotos.</span><button class="btn sm ${privacy() ? 'on' : ''}" data-act="toggle-privacy">${privacy() ? 'Namen zeigen' : 'Namen verbergen'}</button></li>
          <li><span class="ic ${on ? 'warn' : 'good'}">${on ? '!' : '✓'}</span><span class="grow"><b>Zwischenspeichern im Browser.</b> Standardmäßig aus: nichts bleibt nach dem Schließen zurück. Eingeschaltet liegt der Stand im Browserprofil dieses Rechners.</span><label class="c small nowrap"><input type="checkbox" data-chg="autosave" ${on ? raw('checked') : ''}> einschalten</label></li>
          <li><span class="ic">i</span><span class="grow"><b>Pseudonymisiert ist nicht anonym.</b> Wer die Schlüsseldatei oder genaue Kenntnis der Qualifikationen hat, kann Personen zuordnen. Schlüsseldatei getrennt und geschützt aufbewahren.</span></li>
        </ul>
        <div class="row" style="margin-top:10px"><button class="btn danger" data-act="wipe">Alle Daten aus diesem Fenster entfernen</button></div></div>
    </div>
    <div class="card"><h3>Projekt</h3><div class="sub">Planungsjahr ${S.meta.year} · erstellt ${fmt(String(S.meta.created).slice(0, 10))}${S.meta.source ? ' · ' + S.meta.source : ''}</div>
      <div class="row"><label class="f" style="min-width:280px">Projekttitel<input type="text" data-chg="meta" value="${S.meta.title}" maxlength="120"></label><span class="sp"></span>
        <button class="btn" data-act="load-demo">Demo-Daten erzeugen</button><button class="btn" data-act="new-empty">Leeres Projekt anlegen</button></div></div>`;
  }
};
