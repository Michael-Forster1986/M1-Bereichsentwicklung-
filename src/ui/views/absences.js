import * as Core from '../../core/index.js';
import { csvDownload } from '../files.js';
import { $, html, raw } from '../dom.js';
import { MON, dayLabel, fmt, fmtS, nf, opts } from '../format.js';
import { IX, P, S, SUM, UI, collator, commit, nameOf, pName, privacy, sortKey } from '../state.js';
import { toast } from '../dialogs.js';
import { ACT, TIP, VIEWS } from '../registry.js';
import { dayFlags, lastPtr } from './shared.js';

// ---------- Abwesenheiten & Kalender ----------------------------------------------
function drawAbsChart() {
  const box = $('#absChart'); if (!box) return;
  const n = IX.n, W = Math.max(320, box.clientWidth), L = 30, R = 8, T = 8, H = 96, B = 20, vals = new Float64Array(n);
  for (let k = 0; k < 9; k++) for (let d = 0; d < n; d++) vals[d] += IX.absR[k][d];
  const hi = Math.max(4, ...vals) * 1.1, step = (W - L - R) / n, y = v => T + (1 - v / hi) * H, stepV = [2, 5, 10, 20, 50].find(v => hi / v <= 4.2) || 100;
  let g = '', line = '';
  for (let v = 0; v <= hi; v += stepV) g += '<line class="' + (v ? 'gridl' : 'axis') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/><text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + v + '</text>';
  for (let d = 0; d < n; d++) line += (d ? 'L' : 'M') + (L + (d + 0.5) * step).toFixed(1) + ' ' + y(vals[d]).toFixed(1);
  g += '<path class="wash" d="' + line + 'L' + (W - R) + ' ' + y(0) + 'L' + L + ' ' + y(0) + 'Z"/><path class="net" d="' + line + '"/>';
  for (let m = 0; m < 12; m++) g += '<text x="' + (L + IX.cal.monthStart[m] * step + 4).toFixed(1) + '" y="' + (T + H + 15) + '">' + MON[m] + '</text>';
  g += '<line class="cross" y1="' + T + '" y2="' + (T + H) + '" visibility="hidden"/><rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + H + '" fill="transparent" data-tk="abschart" data-l="' + L + '" data-step="' + step + '"/>';
  box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + (T + H + B) + '" height="' + (T + H + B) + '" role="img" aria-label="Abwesende Personen im Dienst je Tag">' + g + '</svg>';
}
TIP.abschart = t => {
  const r = t.getBoundingClientRect(), L = +t.dataset.l, step = +t.dataset.step, svg = t.ownerSVGElement, scale = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width;
  const d = Core.clamp(Math.floor((lastPtr.x - r.left) * scale / step), 0, IX.n - 1), x = L + (d + 0.5) * step, line = $('.cross', svg);
  line.setAttribute('x1', x); line.setAttribute('x2', x); line.setAttribute('visibility', 'visible');
  return html`<b>${dayLabel(d)}</b> <span class="k">${dayFlags(d)}</span><table>${[0, 1, 2].map(s => { let v = 0; for (let a = 0; a < 3; a++) v += IX.absR[a * 3 + s][d]; return html`<tr><td>${Core.SHIFTS[s]}</td><td class="n"><b>${v}</b> abwesend</td></tr>`; })}</table>`;
};
VIEWS.absences = {
  render() {
    const q = UI.absQ.trim().toLowerCase(), yr = String(S.meta.year), bav = new Map(Core.holidaysBavaria(S.meta.year).map(h => [h.date, h.name]));
    const list = S.absences.map((a, i) => [a, i]).filter(([a]) => !q || (nameOf(a.pk) + ' ' + a.type).toLowerCase().includes(q)).sort((x, y) => x[0].start < y[0].start ? -1 : 1), shown = list.slice(0, UI.limit);
    const people = S.people.slice().sort((a, b) => collator.compare(sortKey(a), sortKey(b)));
    return html`
    <div class="view-head"><div><h1>Abwesenheiten & Kalender</h1><p>Persönliche Abwesenheiten blockieren die Planung und mindern die Kapazität. Ferien lassen sich meiden, Feiertage sind keine Ausbildungstage.</p></div></div>
    <div class="card" style="margin-bottom:14px"><h3>Abwesende im Dienst je Tag</h3><div class="sub">${nf(SUM.absentDays)} abwesende Diensttage im Jahr${S.meta.simulated.absences ? ' · Abwesenheiten sind simuliert' : ''}</div><div class="chart" id="absChart"></div></div>
    <div class="gridA">
      <div class="card"><div class="row"><h3 style="font-size:14.5px;font-weight:650">Persönliche Abwesenheiten (${nf(S.absences.length)})</h3><span class="sp"></span><button class="btn sm" data-act="go" data-id="data">CSV importieren</button><button class="btn sm" data-act="abs-export">CSV</button></div>
        <div class="form" style="margin:10px 0;grid-template-columns:minmax(150px,2fr) repeat(3,minmax(110px,1fr)) auto;align-items:end">
          <label class="f">Person<select id="abPk">${opts(people.map(p => [p.alias, pName(p)]), '')}</select></label>
          <label class="f">Art<select id="abType">${opts(Core.ABS_TYPES, 'Urlaub')}</select></label>
          <label class="f">Von<input type="date" id="abStart" min="${yr}-01-01" max="${yr}-12-31"></label><label class="f">Bis<input type="date" id="abEnd" min="${yr}-01-01" max="${yr}-12-31"></label>
          <button class="btn primary" data-act="abs-add" ${people.length ? '' : raw('disabled')}>Hinzufügen</button></div>
        <input type="search" placeholder="Person oder Art suchen" value="${UI.absQ}" data-inp="ui" data-f="absQ" id="q-abs" style="width:220px;margin-bottom:8px" aria-label="Suche">
        ${shown.length ? html`<div class="tblwrap" style="max-height:440px" data-keep="abs"><table class="tbl"><thead><tr><th>Person</th><th>Art</th><th>Von</th><th>Bis</th><th class="n">Kalendertage</th><th></th></tr></thead><tbody>
          ${shown.map(([a, i]) => html`<tr><td>${nameOf(a.pk)}</td><td><i class="sw a-${a.type}"></i> ${a.type}${a.synthetic ? html` <span class="muted xs">simuliert</span>` : ''}</td><td class="num nowrap">${fmt(a.start)}</td><td class="num nowrap">${fmt(a.end)}</td><td class="n">${IX.cal.idx(a.end) - IX.cal.idx(a.start) + 1}</td><td><button class="btn sm" data-act="abs-del" data-i="${i}">Entfernen</button></td></tr>`)}</tbody></table></div>
          <p class="small muted" style="margin-top:6px">${shown.length} von ${list.length} angezeigt${list.length > shown.length ? html` · <button class="btn sm" data-act="show-all">Alle anzeigen</button>` : ''}</p>` : html`<div class="empty">Keine Abwesenheiten für diese Auswahl.</div>`}
      </div>
      <div class="stack">
        <div class="card"><h3>Ferien (${S.school.length})</h3><div class="sub">Als Band im Jahresplan; optional bei der Planung gemieden</div>
          <table class="tbl"><tbody>${S.school.map((s, i) => html`<tr><td>${s.name}</td><td class="num nowrap">${fmtS(s.start)} – ${fmt(s.end)}</td><td><button class="btn sm" data-act="school-del" data-i="${i}" aria-label="${s.name} entfernen">✕</button></td></tr>`)}</tbody></table>
          <div class="row" style="margin-top:10px"><input type="text" id="scName" placeholder="Bezeichnung" style="width:140px" maxlength="60"><input type="date" id="scStart" aria-label="Ferien von"><input type="date" id="scEnd" aria-label="Ferien bis"><button class="btn" data-act="school-add">Hinzufügen</button></div>
          ${S.meta.year === 2027 ? html`<p class="small muted" style="margin-top:8px">Vorbelegung aus der Vorgängerversion, nicht erneut amtlich geprüft.</p>` : ''}</div>
        <div class="card"><h3>Feiertage (${S.holidays.length})</h3><div class="sub">Keine Ausbildungstage; der Dienstbetrieb läuft laut Dienstplan weiter</div>
          <div class="row">${S.holidays.map(d => html`<span class="chip" style="cursor:default">${fmtS(d)} ${bav.get(d) || ''}<button class="btn ghost sm" style="padding:0 3px" data-act="holiday-del" data-d="${d}" aria-label="${fmt(d)} entfernen">✕</button></span>`)}${S.holidays.length ? '' : html`<span class="muted small">Noch keine Feiertage eingetragen.</span>`}</div>
          <div class="row" style="margin-top:10px"><input type="date" id="hoDate" min="${yr}-01-01" max="${yr}-12-31" aria-label="Feiertag"><button class="btn" data-act="holiday-add">Hinzufügen</button><button class="btn" data-act="holiday-bav" data-tip="Berechnete gesetzliche Feiertage in Bayern (inkl. Fronleichnam, Mariä Himmelfahrt, Allerheiligen) – bitte mit dem Betriebskalender abgleichen">Feiertage Bayern einfügen</button>${S.holidays.length ? html`<button class="btn danger" data-act="holiday-clear">Alle entfernen</button>` : ''}</div></div>
      </div>
    </div>`;
  },
  after: drawAbsChart, resize: drawAbsChart
};
ACT['abs-add'] = () => {
  const a = { pk: P($('#abPk').value)?.pk, type: $('#abType').value, start: $('#abStart').value, end: $('#abEnd').value }, yr = String(S.meta.year);
  if (!IX.people.has(a.pk) || !Core.validDate(a.start) || !Core.validDate(a.end) || a.end < a.start || !a.start.startsWith(yr) || !a.end.startsWith(yr)) return toast('Zeitraum prüfen: Von und Bis müssen im Jahr ' + yr + ' liegen', 'crit');
  commit('Abwesenheit gespeichert', () => { S.absences.push(a); });
};
ACT['abs-del'] = t => commit('Abwesenheit entfernt', () => { S.absences.splice(+t.dataset.i, 1); });
ACT['abs-export'] = () => csvDownload('Abwesenheiten', ['pk', 'Name', 'start', 'end', 'type'], S.absences.map(a => [privacy() ? IX.people.get(a.pk)?.alias : a.pk, nameOf(a.pk), a.start, a.end, a.type]));
ACT['school-add'] = () => { const s = { name: $('#scName').value.trim() || 'Ferien', start: $('#scStart').value, end: $('#scEnd').value }; if (!Core.validDate(s.start) || !Core.validDate(s.end) || s.end < s.start) return toast('Ferienzeitraum prüfen', 'crit'); commit('Ferien gespeichert', () => { S.school.push(s); S.school.sort((a, b) => a.start < b.start ? -1 : 1); }); };
ACT['school-del'] = t => commit('Ferien entfernt', () => { S.school.splice(+t.dataset.i, 1); });
ACT['holiday-add'] = () => { const d = $('#hoDate').value; if (!Core.validDate(d) || !d.startsWith(String(S.meta.year))) return toast('Datum im Jahr ' + S.meta.year + ' wählen', 'crit'); commit('Feiertag gespeichert', () => { S.holidays = [...new Set([...S.holidays, d])].sort(); }); };
ACT['holiday-del'] = t => commit('Feiertag entfernt', () => { S.holidays = S.holidays.filter(d => d !== t.dataset.d); });
ACT['holiday-bav'] = () => commit('Feiertage Bayern eingefügt – bitte mit dem Betriebskalender abgleichen', () => { S.holidays = [...new Set([...S.holidays, ...Core.holidaysBavaria(S.meta.year).map(h => h.date)])].sort(); });
ACT['holiday-clear'] = () => commit('Alle Feiertage entfernt', () => { S.holidays = []; });
