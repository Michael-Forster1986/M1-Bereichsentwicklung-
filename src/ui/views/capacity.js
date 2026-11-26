import * as Core from '../../core/index.js';
import { csvDownload } from '../files.js';
import { $, $$, html, raw } from '../dom.js';
import { MON, MONL, dayLabel, nf, opts, sgn } from '../format.js';
import { IX, S, SUM, UI, commit } from '../state.js';
import { confirmDlg, openDrawer, toast } from '../dialogs.js';
import { ACT, CHG, TIP, VIEWS } from '../registry.js';
import { render } from '../shell.js';
import { EPS, capTipRows, dayFlags, lastPtr } from './shared.js';

// ---------- Kapazität -----------------------------------------------------------
function capRange() {
  const cal = IX.cal, r = UI.capRange;
  if (r[0] === 'q') { const q = +r[1] - 1; return [cal.monthStart[q * 3], cal.monthStart[q * 3 + 3] - 1]; }
  if (r[0] === 'm') { const m = +r.slice(1) - 1; return [cal.monthStart[m], cal.monthStart[m + 1] - 1]; }
  return [0, IX.n - 1];
}
let capGeom = null;
function drawCapCharts() {
  const box = $('#capCharts'); if (!box) return;
  const [d0, d1] = capRange(), cnt = d1 - d0 + 1, W = Math.max(320, box.clientWidth), L = 34, R = 86, T = 22, a = UI.capArea, cal = IX.cal;
  const step = (W - L - R) / cnt, x = d => L + (d - d0 + 0.5) * step;
  let out = ''; const geom = { d0, d1, L, step, charts: [] };
  [0, 1, 2].forEach((s, ci) => {
    const k = a * 3 + s, last = ci === 2, H = 118, B = last ? 30 : 6, data = [];
    let hi = 1, lo = 0, um = 0, uz = 0, any = false;
    for (let d = d0; d <= d1; d++) { const c = Core.capInfo(IX, d, k); data.push(c); if (c.known) { any = true; hi = Math.max(hi, c.net, c.zero); lo = Math.min(lo, c.net); if (c.net < c.min - EPS) um++; if (c.net < c.zero - EPS) uz++; } }
    if (any && lo >= 0) { let floor = Infinity; for (const c of data) if (c.known) floor = Math.min(floor, c.net, c.min); lo = Math.max(0, Math.floor(floor * 0.8 / 5) * 5); }   // Linien brauchen keine Nulllinie: Ausschnitt um die Grenzen
    hi *= 1.06; const y = v => T + (hi - v) / (hi - lo) * H;
    const stepV = [1, 2, 5, 10, 20, 25, 50, 100].find(v => (hi - lo) / v <= 4.2) || 200;
    let g = '';
    // nicht prüfbare Tage
    for (let i = 0; i < cnt; i++) if (!data[i].known) { let j = i; while (j + 1 < cnt && !data[j + 1].known) j++; g += '<rect class="na" x="' + (L + i * step).toFixed(1) + '" y="' + T + '" width="' + ((j - i + 1) * step).toFixed(1) + '" height="' + H + '"/>'; i = j; }
    for (let v = Math.ceil(lo / stepV) * stepV; v <= hi; v += stepV) g += '<line class="' + (v === lo ? 'axis' : 'gridl') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/><text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + v + '</text>';
    // Unterschreitungen als Flächen zwischen verfügbarer Kapazität und Grenze
    const bw = Math.max(1, step + 0.3).toFixed(2);
    data.forEach((c, i) => {
      if (!c.known || c.net >= c.zero - EPS) return;
      const xx = (L + i * step).toFixed(1), top = y(c.zero), mid = y(Math.max(c.net, c.min));
      g += '<rect class="v-warn" x="' + xx + '" y="' + top.toFixed(1) + '" width="' + bw + '" height="' + Math.max(1, mid - top).toFixed(1) + '"/>';
      if (c.net < c.min - EPS) g += '<rect class="v-crit" x="' + xx + '" y="' + y(c.min).toFixed(1) + '" width="' + bw + '" height="' + Math.max(1, y(c.net) - y(c.min)).toFixed(1) + '"/>';
    });
    // Grenzlinien (stufenweise, falls Tageswerte abweichen) und verfügbare Kapazität
    const path = (key, stepped) => { let p = '', on = false; data.forEach((c, i) => { if (!c.known) { on = false; return; } const xa = L + i * step, xb = xa + step, yy = y(c[key]).toFixed(1); p += stepped ? (on ? 'L' : 'M') + xa.toFixed(1) + ' ' + yy + 'L' + xb.toFixed(1) + ' ' + yy : (on ? 'L' : 'M') + (xa + step / 2).toFixed(1) + ' ' + yy; on = true; }); return p; };
    if (any) {
      g += '<path class="thr" fill="none" d="' + path('zero', true) + '"/><path class="thr min" fill="none" d="' + path('min', true) + '"/><path class="net" d="' + path('net', false) + '"/>';
      const lastK = [...data].reverse().find(c => c.known); let yz = y(lastK.zero) + 4, ym = y(lastK.min) + 4; if (ym - yz < 13) ym = yz + 13;
      g += '<text class="lbl" x="' + (W - R + 8) + '" y="' + yz.toFixed(1) + '">0-Punkt ' + nf(lastK.zero) + '</text><text class="lbl" x="' + (W - R + 8) + '" y="' + ym.toFixed(1) + '">Minimum ' + nf(lastK.min) + '</text>';
    } else g += '<text x="' + (L + 12) + '" y="' + (T + H / 2) + '">Keine prüfbaren Tageswerte – Dienstplan und Grenzwerte für ' + Core.kArea(k) + ' / ' + Core.kShift(k) + ' fehlen.</text>';
    g += '<text class="ttl" x="' + L + '" y="13">' + Core.kShift(k) + '</text><text x="' + (L + 46) + '" y="13">' + (any ? um + ' Tage unter Minimum · ' + uz + ' unter 0-Punkt' : '') + '</text>';
    if (last) {
      g += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + H) + '" y2="' + (T + H) + '"/>';
      if (cnt > 62) for (let m = 0; m < 12; m++) { const ms = cal.monthStart[m]; if (ms >= d0 && ms <= d1) g += '<line class="axis" x1="' + (L + (ms - d0) * step).toFixed(1) + '" x2="' + (L + (ms - d0) * step).toFixed(1) + '" y1="' + (T + H) + '" y2="' + (T + H + 4) + '"/><text x="' + (L + (ms - d0) * step + 4).toFixed(1) + '" y="' + (T + H + 15) + '">' + MON[m] + '</text>'; }
      else for (let d = d0; d <= d1; d++) if (cal.dow[d] === 1 || cnt <= 31) g += '<text text-anchor="middle" x="' + x(d).toFixed(1) + '" y="' + (T + H + 15) + '">' + cal.dom[d] + (cal.dow[d] === 1 && cnt > 31 ? '.' + (cal.month[d] + 1) + '.' : '') + '</text>';
      for (let i = 0; i < cnt; i++) if (IX.school[d0 + i]) { let j = i; while (j + 1 < cnt && IX.school[d0 + j + 1]) j++; g += '<rect class="schoolb" x="' + (L + i * step).toFixed(1) + '" y="' + (T + H + 22) + '" width="' + ((j - i + 1) * step).toFixed(1) + '" height="4" rx="2"/>'; i = j; }
    }
    g += '<line class="cross" y1="' + T + '" y2="' + (T + H) + '" x1="0" x2="0" visibility="hidden"/><circle class="dot" r="4" visibility="hidden"/>';
    g += '<rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + H + '" fill="transparent" data-tk="capchart" data-act="cap-day" data-ci="' + ci + '" style="cursor:crosshair"/>';
    out += '<svg viewBox="0 0 ' + W + ' ' + (T + H + B) + '" height="' + (T + H + B) + '" role="img" aria-label="Verfügbare Kapazität ' + Core.kShift(k) + ' gegenüber 0-Punkt und Minimum">' + g + '</svg>';
    geom.charts.push({ k, y, data });
  });
  box.innerHTML = out; capGeom = geom;
}
function capDayAt(target) { const g = capGeom, r = target.getBoundingClientRect(), svgW = target.ownerSVGElement.viewBox.baseVal.width, scale = svgW / target.ownerSVGElement.getBoundingClientRect().width; return Core.clamp(g.d0 + Math.floor(((lastPtr.x - r.left) * scale) / g.step), g.d0, g.d1); }
TIP.capchart = target => {
  if (!capGeom) return null;
  const g = capGeom, d = capDayAt(target), xx = g.L + (d - g.d0 + 0.5) * g.step;
  $$('#capCharts svg').forEach((svg, i) => {
    const ch = g.charts[i], c = ch.data[d - g.d0], line = $('.cross', svg), dot = $('.dot', svg);
    line.setAttribute('x1', xx); line.setAttribute('x2', xx); line.setAttribute('visibility', 'visible');
    if (c.known) { dot.setAttribute('cx', xx); dot.setAttribute('cy', ch.y(c.net)); dot.setAttribute('visibility', 'visible'); } else dot.setAttribute('visibility', 'hidden');
  });
  return html`<b>${dayLabel(d)}</b> <span class="k">${dayFlags(d)}</span>${capTipRows(d, g.charts.map(c => c.k))}<span class="k">Klick: Aufschlüsselung des Tages</span>`;
};
ACT['cap-day'] = t => openDrawer({ kind: 'day', d: capDayAt(t) });
ACT['day-open'] = t => openDrawer({ kind: 'day', d: +t.dataset.d });
ACT['cap-range'] = t => { UI.capRange = t.dataset.r; render(); };
/** Einstellung ändern (Prüfmodus, Pools, Simulation). */
CHG.set = t => {
  const f = t.dataset.f, st = S.settings; let v;
  if (t.type === 'checkbox') v = t.checked;
  else if (t.type === 'number') { v = t.value === '' ? null : Number(String(t.value).replace(',', '.')); if (v !== null && (!Number.isFinite(v) || v < 0)) { render(); return toast('Wert prüfen', 'crit'); } }
  else v = t.value;
  if (f === 'start' && (!Core.validDate(v) || !v.startsWith(String(S.meta.year)))) { render(); return toast('Szenariostart muss im Jahr ' + S.meta.year + ' liegen', 'crit'); }
  if (f === 'hours' && (v === null || v <= 0 || v > 24)) { render(); return toast('Stunden je Arbeitstag: größer 0 bis 24', 'crit'); }
  if (f === 'buffer') v = Core.clamp(v || 0, 0, 50);
  if (f === 'stress' && (v === null || v > 50)) { render(); return toast('Zusätzlicher Stress: 0 bis 50 %', 'crit'); }
  if (f === 'absenceLimit' && v !== null && v > 100) { render(); return toast('Abwesenheitsbudget: 0 bis 100 %', 'crit'); }
  commit('Einstellung gespeichert – Anzeige aktualisiert. Für neue Terminverteilung „Neu berechnen“.', () => { st[f] = v; });
};
CHG.sick = t => { const v = Number(String(t.value).replace(',', '.')); if (!Number.isFinite(v) || v < 0 || v > 50) { render(); return toast('Krankenreserve: 0 bis 50 %', 'crit'); } commit('Krankenreserve ' + MONL[+t.dataset.i] + ' gespeichert', () => { S.settings.sick[+t.dataset.i] = v; }); };
CHG.limit = t => {
  const [a, s, key] = t.dataset.f.split('|'), v = t.value === '' ? null : Number(String(t.value).replace(',', '.'));
  if (v !== null && (!Number.isFinite(v) || v < 0)) { render(); return toast('Grenzwert prüfen', 'crit'); }
  const cur = { ...S.limits[a][s], [key]: v };
  if (cur.min != null && cur.zero != null && cur.zero < cur.min) { render(); return toast('Der 0-Punkt muss mindestens so hoch sein wie das Minimum', 'crit'); }
  commit('Grenzwert ' + a + ' / ' + s + ' gespeichert', () => { S.limits[a][s] = cur; });
};
VIEWS.capacity = {
  render() {
    const st = S.settings, a = UI.capArea, [d0, d1] = capRange(), ks = [0, 1, 2].map(s => a * 3 + s), hours = st.hours;
    const rows = [];
    for (let d = d0; d <= d1; d++) { const cs = ks.map(k => Core.capInfo(IX, d, k)); if (!UI.capOnlyCrit || cs.some(c => c.known && c.net < c.zero - EPS)) rows.push([d, cs]); }
    const cell = c => c.known ? html`<td class="n ${c.net < c.min - EPS ? 'd-crit' : c.net < c.zero - EPS ? 'd-warn' : 'd-good'}"><b>${nf(c.net, 1)}</b> <span class="muted">${sgn(c.net - c.zero)} / ${sgn(c.net - c.min)}</span></td>` : html`<td class="n d-na">offen</td>`;
    const numIn = (f, v, extra = '') => html`<input type="number" data-chg="set" data-f="${f}" value="${v ?? ''}" ${raw(extra)}>`;
    const ranges = [['year', 'Jahr'], ['q1', 'Q1'], ['q2', 'Q2'], ['q3', 'Q3'], ['q4', 'Q4']];
    const res = [['Mentor', 'mentor'], ['TEC', 'tec'], ['ICA-Prüfer', 'examiner'], ['Vorbereitung (TEC / Prüfer)', 'prep']];
    return html`
    <div class="view-head"><div><h1>Kapazität</h1><p>Verfügbare Köpfe je Dienst nach Abwesenheit, Krankenreserve und Maßnahmen – im Vergleich zu 0-Punkt und Minimum.</p></div></div>
    <div class="toolbar noprint">
      <label class="row small">Bereich <select data-chg="ui" data-f="capArea">${opts(Core.AREAS.map((x, i) => [i, x]), a)}</select></label>
      <div class="seg" role="group" aria-label="Zeitraum">${ranges.map(([r, l]) => html`<button data-act="cap-range" data-r="${r}" aria-pressed="${UI.capRange === r}">${l}</button>`)}</div>
      <select data-chg="ui" data-f="capRange" aria-label="Monat"><option value="year">Monat wählen …</option>${opts(MONL.map((m, i) => ['m' + (i + 1), m]), UI.capRange)}</select>
      <span class="sp"></span>
      <div class="legend"><span><i class="sw" style="background:var(--series);height:3px"></i>verfügbar</span><span><i class="sw" style="background:var(--warn)"></i>unter 0-Punkt</span><span><i class="sw" style="background:var(--crit)"></i>unter Minimum</span><span><i class="sw" style="background:var(--surface-3)"></i>nicht prüfbar</span></div>
    </div>
    <div class="card" style="margin-bottom:14px"><div class="chart" id="capCharts"></div></div>
    <div class="gridA">
      <div class="stack">
        <div class="card"><div class="row"><h3 style="font-size:14.5px;font-weight:650">${UI.capOnlyCrit ? 'Kritische Tage' : 'Tageswerte'} · ${Core.AREAS[a]}</h3><span class="sp"></span>
          <label class="c small"><input type="checkbox" data-chg="ui" data-f="capOnlyCrit" ${UI.capOnlyCrit ? raw('checked') : ''}> nur Tage unter 0-Punkt</label>
          <button class="btn sm" data-act="cap-export">CSV</button></div>
          <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 10px">Verfügbar, daneben Abstand zum 0-Punkt / zum Minimum. Negative Werte sind Fehlbedarf in Köpfen.</div>
          ${rows.length ? html`<div class="tblwrap" style="max-height:420px" data-keep="capdays"><table class="tbl"><thead><tr><th>Datum</th><th class="n">Früh</th><th class="n">Spät</th><th class="n">Nacht</th></tr></thead><tbody>
            ${rows.slice(0, 400).map(([d, cs]) => html`<tr><td class="nowrap"><button class="btn ghost sm" data-act="day-open" data-d="${d}">${dayLabel(d)}</button> <span class="muted xs">${dayFlags(d)}</span></td>${cs.map(cell)}</tr>`)}</tbody></table></div>`
            : html`<div class="empty"><b>Kein Tag unter dem 0-Punkt</b>Im gewählten Zeitraum hält der Plan alle Grenzen ein.</div>`}
        </div>
        <div class="card"><h3>Aufwand für Mentor, TEC und Prüfer</h3><div class="sub">Planungsäquivalente aus allen Terminen, keine namentliche Verfügbarkeitsprüfung</div>
          <div class="tblwrap"><table class="tbl"><thead><tr><th>Ressource</th><th class="n">Kapazitätstage</th><th class="n">Stunden</th>${MON.map(m => html`<th class="n">${m}</th>`)}</tr></thead><tbody>
          ${res.map(([l, key]) => html`<tr><td>${l}</td><td class="n">${nf(SUM.resources[key], 1)}</td><td class="n"><b>${nf(SUM.resources[key] * hours)}</b></td>${SUM.monthly.map(m => html`<td class="n muted">${m[key] ? nf(m[key] * hours) : '–'}</td>`)}</tr>`)}</tbody></table></div></div>
      </div>
      <div class="stack">
        <div class="card"><h3>Prüfmodus</h3><div class="sub">Was bei der Neuberechnung verbindlich gilt</div><div class="stack" style="gap:8px">
          <label class="c"><input type="checkbox" data-chg="set" data-f="cap" ${st.cap ? raw('checked') : ''}> Kapazität verbindlich prüfen</label>
          <label class="c"><input type="checkbox" data-chg="set" data-f="strict" ${st.strict ? raw('checked') : ''}> Tage ohne Dienstplan-Eintrag gelten als frei (aus = Dienst aus den Stammdaten annehmen)</label>
          <label class="c"><input type="checkbox" data-chg="set" data-f="confirmedOnly" ${st.confirmedOnly ? raw('checked') : ''}> Nur Personen mit bestätigten Voraussetzungen planen</label>
          <label class="c"><input type="checkbox" data-chg="set" data-f="avoidSchool" ${st.avoidSchool ? raw('checked') : ''}> Ferien bei Ausbildung meiden</label>
          <div class="form" style="margin-top:4px"><label class="f">Harte Grenze<select data-chg="set" data-f="goal">${opts([['min', 'Minimum'], ['zero', '0-Punkt']], st.goal)}</select></label>
            <label class="f">Abwesenheitsbudget (%)${numIn('absenceLimit', st.absenceLimit, 'min="0" max="100" placeholder="offen"')}</label>
            <label class="f">Szenariostart<input type="date" data-chg="set" data-f="start" value="${st.start}"></label></div></div></div>
        <div class="card"><h3>Grenzwerte je Dienst</h3><div class="sub">Minimum und 0-Punkt in Köpfen; leer = nicht prüfbar</div>
          <table class="tbl"><thead><tr><th>Bereich</th><th>Dienst</th><th>Minimum</th><th>0-Punkt</th></tr></thead><tbody>
          ${Core.AREAS.flatMap(ar => Core.SHIFTS.map(sh => html`<tr><td>${ar}</td><td>${sh}</td>${['min', 'zero'].map(key => html`<td><input type="number" class="w60" min="0" step="1" data-chg="limit" data-f="${ar}|${sh}|${key}" value="${S.limits[ar][sh][key] ?? ''}" placeholder="–" aria-label="${key === 'min' ? 'Minimum' : '0-Punkt'} ${ar} ${sh}"></td>`)}</tr>`))}</tbody></table>
          ${S.capacity.length ? html`<p class="small ink2" style="margin-top:8px">${nf(S.capacity.length)} importierte Tageswerte haben Vorrang vor der Ableitung aus dem Dienstplan. <button class="btn sm" data-act="cap-clear">Tageswerte entfernen</button></p>` : ''}</div>
        <div class="card"><h3>Simulation und Ressourcenpools</h3><div class="sub">Gleichzeitig verfügbare Betreuer je Dienst; leer = unbegrenzt</div>
          <div class="form"><label class="f">Zusätzlicher Stress (%)${numIn('stress', st.stress, 'min="0" max="50" step="0.1"')}</label>
            <label class="f" data-tip="Der Planer hält diesen Abstand zur Grenze frei. Die Ampel misst weiter gegen 0-Punkt und Minimum.">Planungspuffer (Köpfe)${numIn('buffer', st.buffer || 0, 'min="0" max="50" step="0.5"')}</label>
            <label class="f">Stunden je Arbeitstag${numIn('hours', st.hours, 'min="0.5" max="24" step="0.1"')}</label>
            <label class="f">Mentoren gleichzeitig${numIn('mentorLimit', st.mentorLimit, 'min="0" step="0.1" placeholder="offen"')}</label>
            <label class="f">TEC gleichzeitig${numIn('tecLimit', st.tecLimit, 'min="0" step="0.1" placeholder="offen"')}</label>
            <label class="f">Prüfer gleichzeitig${numIn('examinerLimit', st.examinerLimit, 'min="0" step="0.1" placeholder="offen"')}</label></div></div>
        <div class="card"><h3>Krankenreserve je Monat (%)</h3><div class="sub">Erwartungswert, der von der verfügbaren Kapazität abgezogen wird – keine Prognose für Einzelpersonen</div>
          <div class="form" style="grid-template-columns:repeat(6,minmax(0,1fr));gap:8px">${st.sick.map((v, i) => html`<label class="f">${MON[i]}<input type="number" min="0" max="50" step="0.01" data-chg="sick" data-i="${i}" value="${v}" style="width:100%"></label>`)}</div></div>
      </div>
    </div>`;
  },
  after: drawCapCharts, resize: drawCapCharts
};
ACT['cap-export'] = () => {
  const rows = [];
  for (let d = 0; d < IX.n; d++) for (let k = 0; k < 9; k++) { const c = Core.capInfo(IX, d, k); if (!c.known && !c.src) continue; rows.push([IX.cal.iso[d], Core.kArea(k), Core.kShift(k), Number.isFinite(c.gross) ? c.gross : '', c.absent, c.reserve.toFixed(2), c.loss.toFixed(2), c.known ? c.net.toFixed(2) : '', Number.isFinite(c.min) ? c.min : '', Number.isFinite(c.zero) ? c.zero : '', c.known ? (c.net < c.min - EPS ? 'unter Minimum' : c.net < c.zero - EPS ? 'unter 0-Punkt' : 'ab 0-Punkt') : 'nicht prüfbar']); }
  csvDownload('Tageskapazitaet', ['Datum', 'Bereich', 'Dienst', 'Brutto', 'Abwesend', 'Krankenreserve', 'Massnahmenverlust', 'Verfuegbar', 'Minimum', '0Punkt', 'Status'], rows);
};
ACT['cap-clear'] = async () => { if (await confirmDlg('Importierte Tageswerte entfernen', 'Danach wird die Kapazität wieder aus Dienstplan und Abwesenheiten abgeleitet.', 'Entfernen')) commit('Importierte Tageswerte entfernt', () => { S.capacity = []; }); };
