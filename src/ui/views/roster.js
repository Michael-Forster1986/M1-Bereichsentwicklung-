import * as Core from '../../core/index.js';
import { pickFile } from '../files.js';
import { $, esc, html, raw } from '../dom.js';
import { fmt, nf, opts } from '../format.js';
import { HARD, IX, S, UI, collator, commit, pName, privacy, sortKey } from '../state.js';
import { closeModal, openModal, toast } from '../dialogs.js';
import { ACT, TIP, VIEWS } from '../registry.js';
import { go, render } from '../shell.js';
import { isDesktop } from '../../platform/desktop.js';

/* ==========================================================================
 * Ansicht · Dienstplan
 * Der Schichtplan kommt monatsweise als Excel-Tabelle. Diese Ansicht zeigt ihn so, wie er dort steht: eine Zeile je
 * Person, eine Spalte je Tag, in den Zellen die Schichtsymbole. Die Farbe sagt, was ein Symbol für die Planung
 * bedeutet (Früh, Spät, Nacht, frei, abwesend) – diese Zuordnung legt der Mensch einmal fest.
 * ========================================================================== */
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const TARGET_LABEL = { 'Früh': 'Dienst: Früh', 'Spät': 'Dienst: Spät', Nacht: 'Dienst: Nacht', Frei: 'Dienstfrei', Urlaub: 'Urlaub', Krank: 'Krank', Sonstiges: 'Sonstige Abwesenheit', '': 'ohne Bedeutung – nur anzeigen' };
const TARGET_SHORT = { 'Früh': 'Früh', 'Spät': 'Spät', Nacht: 'Nacht', Frei: 'frei', Urlaub: 'Urlaub', Krank: 'krank', Sonstiges: 'abwesend', '': 'ohne Bedeutung' };
const TARGET_CLS = { 'Früh': 'k-f', 'Spät': 'k-s', Nacht: 'k-n', Frei: 'k-free', Urlaub: 'k-away', Krank: 'k-away', Sonstiges: 'k-away', '': 'k-open' };
const TARGET_ORDER = ['Früh', 'Spät', 'Nacht', 'Frei', 'Urlaub', 'Krank', 'Sonstiges', ''];
const symMap = () => S.settings.symbols || {};
const targetOpts = v => opts(TARGET_ORDER.map(t => [t, TARGET_LABEL[t]]), v || '');
const orgOf = p => (p.org || '').trim();
/** Monat, der gezeigt wird: der gewählte – sonst der erste Monat, für den Symbole vorliegen. */
function shownMonth() {
  if (Number.isInteger(UI.rosMonth) && UI.rosMonth >= 0 && UI.rosMonth < 12) return UI.rosMonth;
  const cal = IX.cal, days = Object.values((S.symbols && S.symbols.days) || {});
  for (let m = 0; m < 12; m++) for (const str of days) if (/[^.]/.test(str.slice(cal.monthStart[m], cal.monthStart[m + 1]))) return m;
  return 0;
}
/** Monate, für die ein Schichtplan mit Symbolen vorliegt. */
function monthsWithSymbols() {
  const cal = IX.cal, days = Object.values((S.symbols && S.symbols.days) || {}), out = new Set();
  for (let m = 0; m < 12; m++) if (days.some(str => /[^.]/.test(str.slice(cal.monthStart[m], cal.monthStart[m + 1])))) out.add(m);
  return out;
}

function grid(m, people) {
  const cal = IX.cal, a = cal.monthStart[m], b = cal.monthStart[m + 1], map = symMap();
  let head = '<tr><th class="rs-name">Person</th>';
  for (let d = a; d < b; d++) head += '<th class="' + (cal.dow[d] === 0 || cal.dow[d] === 6 ? 'we' : '') + (IX.holiday[d] ? ' ho' : '') + '"><b>' + String(cal.dom[d]).padStart(2, '0') + '</b><span>' + WD[cal.dow[d]] + '</span></th>';
  head += '</tr>';
  let body = '';
  for (const p of people) {
    const i = IX.pi.get(p.pk), sym = Core.symbolsOf(S, p.pk, cal.n), sub = privacy() ? '' : orgOf(p);
    body += '<tr><td class="rs-name"><button data-act="person-open" data-pk="' + esc(p.alias) + '"><b>' + esc(pName(p)) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button></td>';
    for (let d = a; d < b; d++) {
      const s = sym[d], code = IX.ros[i][d], we = cal.dow[d] === 0 || cal.dow[d] === 6 ? ' we' : '', ab = IX.abs[i][d] ? ' ab' : '';
      // mit Symbol: so wie im Schichtplan; ohne Symbol: der von Hand eingetragene Dienst als blasser Buchstabe
      if (s) body += '<td class="' + TARGET_CLS[map[s] || ''] + we + ab + '" data-tk="rosday" data-pk="' + esc(p.alias) + '" data-d="' + d + '">' + esc(s) + '</td>';
      else if (code > 1) body += '<td class="k-' + 'fsn'[(code - 2) % 3] + ' hand' + we + ab + '" data-tk="rosday" data-pk="' + esc(p.alias) + '" data-d="' + d + '">' + 'FSN'[(code - 2) % 3] + '</td>';
      else body += '<td class="' + (code === 1 ? 'k-free hand' : 'none') + we + ab + '" data-tk="rosday" data-pk="' + esc(p.alias) + '" data-d="' + d + '"></td>';
    }
    body += '</tr>';
  }
  return raw('<table class="rs-tbl" style="--days:' + (b - a) + '"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>');
}
TIP.rosday = t => {
  const p = S.people.find(x => x.alias === t.dataset.pk); if (!p) return null;
  const d = +t.dataset.d, i = IX.pi.get(p.pk), cal = IX.cal, s = Core.symbolsOf(S, p.pk, cal.n)[d], code = IX.ros[i][d], target = s ? symMap()[s] || '' : null;
  return html`<b>${pName(p)}</b><br>${WD[cal.dow[d]]}, ${fmt(cal.iso[d])}${IX.holiday[d] ? ' · Feiertag' : ''}<br>
    ${s ? html`Symbol im Schichtplan: <b>${s}</b> <span class="k">${TARGET_SHORT[target]}</span>` : code > 1 ? html`${Core.kArea(code - 2)} · ${Core.kShift(code - 2)} <span class="k">von Hand eingetragen</span>` : code === 1 ? 'dienstfrei (von Hand eingetragen)' : 'kein Eintrag'}
    ${IX.abs[i][d] ? html`<br>Abwesend: ${Core.ABS_TYPES[IX.abs[i][d] - 1]}` : ''}`;
};
/** Legende: jedes Symbol des Jahres mit seiner Bedeutung; offene Symbole fallen auf. */
function legend() {
  const counts = Core.symbolCounts(S, IX.n), map = symMap();
  if (!counts.size) return '';
  const list = [...counts].sort((x, y) => TARGET_ORDER.indexOf(map[x[0]] || '') - TARGET_ORDER.indexOf(map[y[0]] || '') || y[1] - x[1]), open = list.filter(x => !map[x[0]]).length;
  return html`<div class="card" id="rsLegend" style="margin-top:14px"><div class="row"><h3 style="font-size:14.5px;font-weight:650">Symbole und ihre Bedeutung</h3><span class="sp"></span>
      <button class="btn ${open ? 'primary' : ''}" data-act="sym-map">Bedeutung festlegen</button></div>
    <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 10px">Die Symbole stehen so in der Ansicht, wie sie im Schichtplan stehen. Für die Planung zählt ihre Bedeutung: Dienste füllen den Dienstplan, Abwesenheiten mindern die Kapazität.${open ? html` <b style="color:var(--warn-ink)">${open} ${open === 1 ? 'Symbol hat' : 'Symbole haben'} noch keine Bedeutung</b> – diese Tage zählen ${S.settings.strict ? 'als dienstfrei' : 'mit dem Stammdienst der Person'}.` : ''}</div>
    <div class="rs-legend">${list.map(([s, n]) => html`<span class="rs-chip"><i class="${TARGET_CLS[map[s] || '']}">${s}</i><span>${TARGET_SHORT[map[s] || '']}</span><small>${nf(n)}</small></span>`)}</div></div>`;
}

VIEWS.roster = {
  render() {
    const m = shownMonth(), have = monthsWithSymbols(), q = (UI.rosQ || '').trim().toLowerCase(), orgs = [...new Set(S.people.map(orgOf).filter(Boolean))].sort(collator.compare);
    if (UI.rosOrg && !orgs.includes(UI.rosOrg)) UI.rosOrg = '';
    const people = S.people.filter(p => (!UI.rosOrg || orgOf(p) === UI.rosOrg) && (!q || (pName(p) + ' ' + (privacy() ? '' : p.pk + ' ' + orgOf(p))).toLowerCase().includes(q)))
      .slice().sort((x, y) => collator.compare(orgOf(x), orgOf(y)) || collator.compare(sortKey(x), sortKey(y)));
    const any = S.symbols && Object.keys(S.symbols.days || {}).length > 0;
    return html`
    <div class="view-head"><div><h1>Dienstplan ${S.meta.year}</h1><p>Der Schichtplan so, wie er eingespielt wurde: eine Zeile je Person, eine Spalte je Tag, in den Zellen die Schichtsymbole. Die Farbe zeigt, was ein Symbol für die Planung bedeutet.</p></div>
      <div class="row noprint"><button class="btn primary" data-act="imp-shiftplan" data-tip="Excel-Tabelle des Schichtplans: eine Zeile je Person, eine Spalte je Tag. Monat für Monat einspielbar.">Schichtplan einspielen</button></div></div>
    <div class="toolbar noprint">
      <div class="seg" role="group" aria-label="Monat">${Core.MONTH_NAMES.map((name, i) => html`<button data-act="ros-month" data-m="${i}" aria-pressed="${i === m}" class="${have.has(i) ? 'has' : ''}" data-tip="${name}${have.has(i) ? ' – Schichtplan eingespielt' : ' – noch kein Schichtplan'}">${name.slice(0, 3)}</button>`)}</div>
      <input type="search" placeholder="Person oder Team suchen" value="${UI.rosQ || ''}" data-inp="ui" data-f="rosQ" id="q-roster" style="width:210px" aria-label="Suche">
      ${orgs.length > 1 ? html`<select data-chg="ui" data-f="rosOrg" aria-label="Team"><option value="">Alle Teams</option>${opts(orgs, UI.rosOrg || '')}</select>` : ''}
      <span class="small ink2">${nf(people.length)} von ${nf(S.people.length)} Personen · ${Core.MONTH_NAMES[m]} ${S.meta.year}</span></div>
    ${!S.people.length && !any ? html`<div class="card"><div class="empty"><b>Noch kein Schichtplan eingespielt</b>„Schichtplan einspielen“ liest die Excel-Tabelle des Schichtplans. Personen, die es im Projekt noch nicht gibt, werden dabei angelegt.</div></div>`
      : html`<div class="card flat" style="padding:0"><div class="tblwrap rs-wrap" data-keep="rosgrid">${people.length ? grid(m, people) : html`<div class="empty"><b>Keine Personen für diese Auswahl</b>Suche oder Team anpassen.</div>`}</div></div>
      ${have.has(m) || !any ? '' : html`<p class="small muted" style="margin-top:8px">Für ${Core.MONTH_NAMES[m]} ist noch kein Schichtplan eingespielt. Blasse Buchstaben sind von Hand eingetragene Dienste.</p>`}
      ${any ? '' : html`<div class="note" style="margin-top:12px"><b>Noch kein Schichtplan eingespielt.</b> „Schichtplan einspielen“ liest die Excel-Tabelle (eine Zeile je Person, eine Spalte je Tag). Die Symbole der Tabelle erscheinen dann hier.</div>`}`}
    ${legend()}`;
  }
};
ACT['ros-month'] = t => { UI.rosMonth = +t.dataset.m; render(); };

// ---------- Schichtplan einspielen ---------------------------------------------------------
let SP = null;
const spTable = () => SP.tables[SP.idx];
function spParse() { for (const t of SP.tables) t.m = Core.parseDayMatrix(S, t.rows, { fileName: SP.file, newPeople: true, month: SP.month || 0 }); }
function spPick() {
  const score = t => t.m.errors.length ? 0 : (t.m.persons + t.m.newPeople.length) * t.m.dates.length;
  SP.idx = 0; SP.tables.forEach((t, i) => { if (score(t) > score(SP.tables[SP.idx])) SP.idx = i; });
}
function spSummary() {
  const m = spTable().m, s = Core.shiftPlanSummary(m, SP.map, SP.addPeople);
  return nf(s.persons) + ' Personen · ' + nf(s.duty) + ' Diensttage · ' + nf(s.free) + ' dienstfreie Tage · ' + nf(s.absences) + ' Abwesenheiten mit ' + nf(s.absenceDays) + ' Tagen' + (s.open ? ' · ' + nf(s.open) + ' Tage mit Symbol ohne Bedeutung' : '');
}
function spDialog() {
  const t = spTable(), m = t.m, bad = m.errors.length > 0, syms = [...m.symbols].sort((a, b) => b[1] - a[1]), known = symMap(), open = syms.filter(([s]) => !SP.map[s]).length;
  const monthName = m.period ? Core.MONTH_NAMES[m.period.month - 1] : '';
  openModal({ title: 'Schichtplan prüfen', wide: true, body: html`
    <div class="cmp" style="grid-template-columns:1fr 1.6fr"><div class="h">Datei</div><div class="h">${SP.file}</div>
      <div>Tabellenblatt</div><div class="n">${SP.tables.length > 1 ? html`<select data-chg="m:sheet">${opts(SP.tables.map((x, i) => [i, x.name + (x.m.errors.length ? ' – nicht lesbar' : '')]), SP.idx)}</select>` : t.name}</div>
      ${bad ? '' : html`<div>Zeitraum</div><div class="n">${fmt(m.range.start)} – ${fmt(m.range.end)} · ${nf(m.dates.length)} Tage
          ${m.period ? html` · Monat <select data-chg="m:month" aria-label="Monat der Tabelle" id="spMonth">${opts(Core.MONTH_NAMES.map((x, i) => [i + 1, x]), m.period.month)}</select> <span class="muted xs">${m.period.source}</span>` : ''}</div>
      <div>Personen</div><div class="n">${nf(m.persons)} im Projekt gefunden${m.newPeople.length ? html` · <b>${nf(m.newPeople.length)} neu</b>` : ''}</div>`}</div>
    ${bad ? html`<div class="note crit"><b>Nicht übernehmbar:</b>${m.errors.map(e => html`<div>${e}</div>`)}<div style="margin-top:6px">Erwartet wird eine Tabelle mit einer Zeile je Person (Personalnummer oder Name vorn) und einer Spalte je Tag.</div></div>` : html`
    ${m.needsMonth ? html`<div class="note warn"><b>Der Monat steht nicht in der Tabelle.</b> Angenommen ist ${monthName} – bitte oben den richtigen Monat wählen.</div>` : ''}
    ${m.newPeople.length ? html`<label class="c" style="margin-top:10px"><input type="checkbox" data-chg="m:people" id="spPeople" ${SP.addPeople ? raw('checked') : ''}> <span><b>${nf(m.newPeople.length)} ${m.newPeople.length === 1 ? 'Person steht' : 'Personen stehen'} noch nicht im Projekt</b> – mit Personalnummer, Name und Team anlegen (Cluster „offen“). Ohne Haken werden diese Zeilen übersprungen.</span></label>` : ''}
    <h3 style="margin:14px 0 4px;font-size:14px">Was bedeuten die Symbole?</h3>
    <p class="small ink2" style="margin-bottom:8px">Die Tabelle enthält ${nf(syms.length)} verschiedene Symbole. Angezeigt werden sie später genau so. Für die Planung braucht jedes eine Bedeutung – die Zuordnung wird gemerkt und beim nächsten Monat wieder vorgeschlagen.${open ? html` <b style="color:var(--warn-ink)">${open} ${open === 1 ? 'Symbol ist' : 'Symbole sind'} noch offen.</b>` : ''}</p>
    <div class="tblwrap" style="max-height:300px"><table class="tbl" id="spSyms"><thead><tr><th>Symbol</th><th class="n">Tage</th><th>Bedeutung für die Planung</th><th></th></tr></thead><tbody>
      ${syms.map(([s, n]) => html`<tr class="${SP.map[s] ? '' : 'rowwarn'}"><td><i class="rs-sym ${TARGET_CLS[SP.map[s] || '']}">${s}</i></td><td class="n">${nf(n)}</td>
        <td><select data-chg="m:map" data-s="${s}" aria-label="Bedeutung von ${s}">${targetOpts(SP.map[s])}</select></td>
        <td class="small muted">${Object.prototype.hasOwnProperty.call(known, s) ? 'gemerkt' : SP.map[s] ? 'Vorschlag' : 'bitte zuordnen'}</td></tr>`)}</tbody></table></div>
    <div class="note good" style="margin-top:10px">Ergebnis: <b id="spSum">${spSummary()}</b></div>
    ${m.warnings.length ? html`<div class="note warn">${m.warnings.slice(0, 8).map(w => html`<div>${w}</div>`)}</div>` : ''}
    <p class="small ink2" style="margin-top:8px">Für die Personen der Tabelle gilt im Zeitraum ${fmt(m.range.start)} – ${fmt(m.range.end)} danach genau, was in der Tabelle steht; bisherige Dienste und Abwesenheiten dieser Tage werden ersetzt. Ein Symbol ohne Bedeutung wird angezeigt, zählt aber ${S.settings.strict ? 'als dienstfrei' : 'mit dem Stammdienst der Person'}. Es wird nichts übertragen – die Datei bleibt ${isDesktop ? 'auf diesem Rechner' : 'in diesem Browserfenster'}.</p>`}`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok" ${bad ? raw('disabled') : ''}>Schichtplan übernehmen</button>`,
    handlers: {
      sheet: el => { SP.idx = +el.value; SP.map = Core.defaultSymbolMap([...spTable().m.symbols.keys()], { ...symMap(), ...SP.map }); spDialog(); },
      month: el => { SP.month = +el.value; spParse(); SP.map = Core.defaultSymbolMap([...spTable().m.symbols.keys()], { ...symMap(), ...SP.map }); spDialog(); },
      people: el => { SP.addPeople = el.checked; const out = $('#spSum'); if (out) out.textContent = spSummary(); },
      map: el => {
        SP.map[el.dataset.s] = el.value;
        const row = el.closest('tr'), out = $('#spSum');
        row.classList.toggle('rowwarn', !el.value); row.querySelector('.rs-sym').className = 'rs-sym ' + TARGET_CLS[el.value]; row.lastElementChild.textContent = el.value ? '' : 'bitte zuordnen';
        if (out) out.textContent = spSummary();
      },
      ok: () => {
        const name = SP.file, map = { ...SP.map }, add = SP.addPeople, month = m.period ? m.period.month - 1 : +m.range.start.slice(5, 7) - 1;
        let info = null;
        closeModal();
        const ok = commit('', () => {
          info = Core.applyShiftPlan(S, m, map, { addPeople: add });
          const at = new Date().toISOString();
          S.realImports.push({ kind: 'roster', start: m.range.start, end: m.range.end, file: name, at });
          if (info.absences) S.realImports.push({ kind: 'absences', start: m.range.start, end: m.range.end, file: name, at });
          if (info.people && S.meta.dataClass === 'empty') S.meta.dataClass = 'real';
        });
        SP = null;
        if (!ok || !info) return;
        UI.rosMonth = month; go('roster');
        const open = Core.symbolCounts(S, IX.n), left = [...open.keys()].filter(s => !symMap()[s]).length;
        toast('Schichtplan übernommen: ' + nf(info.persons) + ' Personen' + (info.people ? ' (' + nf(info.people) + ' neu angelegt)' : '') + ' · ' + nf(info.rosterDays) + ' Diensttage · ' + nf(info.absences) + ' Abwesenheiten'
          + (left ? ' · ' + left + ' Symbole ohne Bedeutung' : '') + (HARD ? ' · ' + nf(HARD) + ' Termine mit Konflikt' : '') + (info.dropped ? ' · ' + info.dropped + ' Einträge passten nicht mehr in die Symbolliste' : ''), left || info.dropped ? 'crit' : '',
          left ? { label: 'Bedeutung festlegen', run: () => ACT['sym-map']() } : null);
      } } });
}
ACT['imp-shiftplan'] = async () => {
  const file = await pickFile('.xlsx,.csv,.txt'); if (!file) return;
  let tables;
  if (/\.xlsx$/i.test(file.name)) tables = (await Core.readXlsx(file)).filter(x => x.rows.some(r => r.some(Boolean))).map(x => ({ name: x.name, rows: x.rows }));
  else { if (file.size > 30e6) throw new Error('Datei zu groß (max. 30 MB)'); tables = [{ name: 'CSV', rows: Core.parseCSV(await file.text()) }]; }
  if (!tables.length) throw new Error('Die Datei enthält keine Daten');
  SP = { file: file.name, tables, idx: 0, month: 0, addPeople: true, map: {} };
  spParse(); spPick();
  SP.map = Core.defaultSymbolMap([...spTable().m.symbols.keys()], symMap());
  spDialog();
};

// ---------- Bedeutung der Symbole ändern ----------------------------------------------------
ACT['sym-map'] = () => {
  const counts = Core.symbolCounts(S, IX.n), map = { ...symMap() }, syms = [...counts].sort((a, b) => b[1] - a[1]);
  if (!syms.length) return toast('Noch kein Schichtplan mit Symbolen eingespielt', 'crit');
  openModal({ title: 'Symbole und ihre Bedeutung', wide: true, body: html`
    <p class="ink2">Jedes Symbol des Schichtplans bekommt eine Bedeutung für die Planung. Eine Änderung gilt sofort für alle Tage, die dieses Symbol tragen – Dienste und Abwesenheiten werden daraus neu abgeleitet – und für jeden Schichtplan, den Sie später einspielen.</p>
    <div class="tblwrap" style="max-height:420px"><table class="tbl" id="smSyms"><thead><tr><th>Symbol</th><th class="n">Tage im Jahr</th><th>Bedeutung für die Planung</th></tr></thead><tbody>
      ${syms.map(([s, n]) => html`<tr class="${map[s] ? '' : 'rowwarn'}"><td><i class="rs-sym ${TARGET_CLS[map[s] || '']}">${s}</i></td><td class="n">${nf(n)}</td>
        <td><select data-chg="m:map" data-s="${s}" aria-label="Bedeutung von ${s}">${targetOpts(map[s])}</select></td></tr>`)}</tbody></table></div>
    <p class="small muted" style="margin-top:8px">Dienst (Früh, Spät, Nacht) und „Dienstfrei“ füllen den Dienstplan. Urlaub, Krank und „Sonstige Abwesenheit“ werden als Abwesenheit geführt und mindern die Kapazität. „Ohne Bedeutung“ zeigt das Symbol nur an.</p>`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok">Speichern</button>`,
    handlers: {
      map: el => { map[el.dataset.s] = el.value; const row = el.closest('tr'); row.classList.toggle('rowwarn', !el.value); row.querySelector('.rs-sym').className = 'rs-sym ' + TARGET_CLS[el.value]; },
      ok: () => {
        const patch = Object.fromEntries(syms.map(([s]) => [s, map[s] || '']));
        closeModal();
        let info = null;
        if (commit('', () => { info = Core.setSymbolMap(S, patch); }) && info)
          toast('Bedeutung gespeichert: ' + nf(info.rosterDays) + ' Diensttage · ' + nf(info.freeDays) + ' dienstfreie Tage · ' + nf(info.absences) + ' Abwesenheiten' + (HARD ? ' · ' + nf(HARD) + ' Termine mit Konflikt' : ''), '', HARD ? { label: 'Zum Bericht', run: () => go('report') } : null);
      } } });
};
