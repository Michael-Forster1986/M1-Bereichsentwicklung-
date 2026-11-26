import * as Core from '../../core/index.js';
import { $, esc, html, raw } from '../dom.js';
import { LEGEND_TYPES, MON, MONL, ROUTE_STATE, TSHORT, clusterLabel, fmt, fmtS, nf, opts, originOf, tcls } from '../format.js';
import { CONF, IX, P, PROG, S, SUM, UI, collator, nameOf, pName, pSub, privacy, sortKey } from '../state.js';
import { openDrawer } from '../dialogs.js';
import { ACT, TIP, VIEWS } from '../registry.js';
import { render } from '../shell.js';
import { capClass, capLegend } from './shared.js';

// ---------- Jahresplan (Gantt) -------------------------------------------------
function matchQ(p, q) {
  if (!q) return true;
  const hay = (pName(p) + ' ' + pSub(p) + ' ' + p.alias + ' ' + p.target + ' ' + p.level + ' ' + p.cluster + ' ' + (privacy() ? '' : p.org)).toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}
export function filteredPeople() {
  const firstStart = p => (IX.evByPerson.get(p.pk) || []).reduce((m, e) => e.start < m ? e.start : m, '9999');
  let list = S.people.filter(p => (!UI.cluster || p.cluster === UI.cluster) && matchQ(p, UI.q) && (() => {
    const st = PROG.get(p.pk).state, has = IX.evByPerson.has(p.pk);
    switch (UI.gStatus) {
      case 'with': return has; case 'without': return !has && (st === 'none');
      case 'incomplete': return st === 'partial' || st === 'none';
      case 'conflict': return (IX.evByPerson.get(p.pk) || []).some(e => CONF.has(e.id) && CONF.get(e.id).hard.length);
      default: return true;
    }
  })());
  const cmp = { name: (a, b) => collator.compare(sortKey(a), sortKey(b)), cluster: (a, b) => collator.compare(a.cluster, b.cluster) || collator.compare(sortKey(a), sortKey(b)),
    start: (a, b) => firstStart(a) < firstStart(b) ? -1 : firstStart(a) > firstStart(b) ? 1 : 0,
    end: (a, b) => (PROG.get(a.pk).end || '9999') < (PROG.get(b.pk).end || '9999') ? -1 : 1 }[UI.gSort];
  if (cmp) list = list.slice().sort(cmp);
  else if (privacy()) list = list.slice().sort((a, b) => collator.compare(a.alias, b.alias));   // Listenreihenfolge würde die alphabetische Reihenfolge verraten
  return list;
}
const stColor = { complete: 'var(--good)', partial: 'var(--warn)', none: 'var(--crit)', locked: 'var(--line-2)', unassigned: 'var(--line-2)' };
export const personMeta = p => [p.cluster === 'offen' ? 'Cluster offen' : p.cluster === 'ausgeschlossen' ? 'ausgeschlossen' : 'Cluster ' + p.cluster, p.target, p.level].filter(Boolean).join(' · ');
function drawGantt() {
  const el = $('#gantt'); if (!el) return;
  const cal = IX.cal, n = IX.n, lw = parseFloat(getComputedStyle(el).getPropertyValue('--lw')) || 232;
  const dw = Math.round(Math.max(1.5, (el.clientWidth - lw - 2) / n) * UI.gZoom * 100) / 100, W = Math.round(n * dw);
  const px = d => Math.round(d * dw * 10) / 10;
  const workCum = new Int32Array(n + 1); for (let d = 0; d < n; d++) workCum[d + 1] = workCum[d] + IX.work[d];
  const absBy = new Map(); for (const a of S.absences) { let l = absBy.get(a.pk); if (!l) absBy.set(a.pk, l = []); l.push(a); }
  const people = filteredPeople();
  // Kopf: Monate, Kalenderwochen, Kapazitätsband
  let head = '<div class="g-months">';
  for (let m = 0; m < 12; m++) head += '<span style="left:' + px(cal.monthStart[m]) + 'px;width:' + px(cal.monthStart[m + 1] - cal.monthStart[m]) + 'px">' + (dw * 30 > 70 ? MONL[m] : MON[m]) + '</span>';
  head += '</div>';
  if (dw >= 3.4) {
    head += '<div class="g-weeks">';
    for (let d = 0; d < n; d++) if (cal.dow[d] === 1) head += '<span style="left:' + px(d) + 'px;width:' + px(7) + 'px">' + (dw * 7 >= 34 ? 'KW ' : '') + Core.isoWeek(cal.iso[d]) + '</span>';
    head += '</div>';
  }
  head += '<div class="g-cap" style="--dw:' + dw + 'px">' + [0, 1, 2].map(k => { let s = '<div data-tk="capcell" data-k="' + k + '" data-act="day-cell">'; for (let d = 0; d < n; d++) s += '<i class="' + capClass(d, k) + '" style="width:' + dw + 'px"></i>'; return s + '</div>'; }).join('') + '</div>';
  // Hintergrund: Monatslinien, Wochenenden, Ferien, Feiertage
  let under = '';
  if (dw >= 3.4) for (let d = 0; d < n; d++) { if (cal.dow[d] === 6) under += '<i class="w" style="left:' + px(d) + 'px;width:' + px(Math.min(2, n - d)) + 'px"></i>'; if (IX.holiday[d]) under += '<i class="h" style="left:' + px(d) + 'px;width:' + px(1) + 'px"></i>'; }
  for (const s of S.school) { const a = Math.max(0, cal.idx(s.start)), b = Math.min(n - 1, cal.idx(s.end)); if (b >= a) under += '<i class="sc" style="left:' + px(a) + 'px;width:' + px(b - a + 1) + 'px"></i>'; }
  for (let m = 1; m < 12; m++) under += '<i class="m" style="left:' + px(cal.monthStart[m]) + 'px"></i>';
  // Zeilen
  const rowHtml = p => {
    const evs = IX.evByPerson.get(p.pk) || [], pr = PROG.get(p.pk);
    let t = '';
    for (const a of absBy.get(p.pk) || []) { const x = Math.max(0, cal.idx(a.start)), y = Math.min(n - 1, cal.idx(a.end)); if (y >= x) t += '<i class="abs a-' + a.type + '" style="left:' + px(x) + 'px;width:' + Math.max(1, px(y - x + 1)) + 'px" data-tip="' + esc(a.type + ' ' + fmtS(a.start) + '–' + fmt(a.end)) + '"></i>'; }
    for (const e of evs) {
      if (UI.gHide.has(e.type)) continue;
      const ds = IX.evDays.get(e.id); if (!ds || !ds.length) continue;
      const runs = []; let a = ds[0], b = ds[0];
      for (let i = 1; i < ds.length; i++) { if (workCum[ds[i]] - workCum[b + 1] > 0) { runs.push([a, b]); a = ds[i]; } b = ds[i]; }
      runs.push([a, b]);
      const cf = CONF.get(e.id), cls = tcls(e.type) + (e.auto ? '' : e.synthetic ? ' sc' : ' fx') + (cf && cf.hard.length ? ' cf' : '');
      if (runs.length > 1) t += '<i class="link ' + tcls(e.type) + '" style="left:' + px(ds[0]) + 'px;width:' + px(ds[ds.length - 1] - ds[0] + 1) + 'px"></i>';
      const label = e.title && e.courseKind ? e.title : TSHORT[e.type] || e.type;
      runs.forEach(([x, y], ri) => {
        const w = Math.max(2, px(y - x + 1) - (dw >= 3 ? 1 : 0)), last = ri === runs.length - 1;
        t += '<button class="bar ' + cls + (e.partial && last ? ' pt' : '') + '" style="left:' + px(x) + 'px;width:' + w + 'px" data-act="event-open" data-id="' + esc(e.id) + '" data-tk="event" aria-label="' + esc(e.type + ' ' + fmt(e.start) + ' bis ' + fmt(e.end)) + '">' + (w >= label.length * 6.3 + 10 ? '<span>' + esc(label) + '</span>' : '') + '</button>';
      });
    }
    if (!evs.length) t += '<small class="g-open">' + esc(pr.state === 'locked' ? 'ausgeschlossen – keine neuen Maßnahmen' : pr.state === 'unassigned' ? 'Cluster offen' : (S.report.find(r => r.pk === p.pk)?.reason || 'Planung offen')) + '</small>';
    return '<div class="g-row"><button class="g-lab" data-act="person-open" data-pk="' + esc(p.alias) + '" data-tk="person"><i class="st" style="background:' + stColor[pr.state] + '"></i><span class="t"><b>' + esc(pName(p)) + '</b><small>' + esc(personMeta(p)) + '</small></span></button><div class="g-track" style="width:' + W + 'px">' + t + '</div></div>';
  };
  let rows = '';
  if (UI.gGroup) for (const k of Object.keys(Core.CLUSTERS)) { const g = people.filter(p => p.cluster === k); if (g.length) rows += '<div class="g-group"><div>' + esc(clusterLabel(k)) + ' · ' + g.length + '</div></div>' + g.map(rowHtml).join(''); }
  else rows = people.map(rowHtml).join('');
  if (!people.length) rows = '<div class="empty" style="position:sticky;left:0;width:' + el.clientWidth + 'px"><b>Keine Personen für diese Auswahl</b>Suche oder Filter anpassen.</div>';
  el.innerHTML = '<div class="g-head"><div class="g-corner"><span>' + people.length + ' von ' + S.people.length + ' Personen</span><div class="caplab"><span>Früh</span><span>Spät</span><span>Nacht</span></div></div><div class="g-time" style="width:' + W + 'px">' + head + '</div></div>'
    + '<div class="g-body"><div class="g-under" style="width:' + W + 'px">' + under + '</div>' + rows + '</div>';
}
TIP.event = t => {
  const e = IX.evById.get(t.dataset.id); if (!e) return null;
  const ds = IX.evDays.get(e.id) || [], cf = CONF.get(e.id), span = ds.length ? IX.cal.idx(e.end) - IX.cal.idx(e.start) + 1 : 0;
  return html`<b>${e.title ? e.title + ' · ' : ''}${e.type}</b> <span class="k">${originOf(e)}${e.partial ? ' · Teilweg' : ''}</span><br>${nameOf(e.pk)}<br>
    ${fmt(e.start)} – ${fmt(e.end)}<br><span class="k">${ds.length} Ausbildungstage${span > ds.length ? ' verteilt über ' + span + ' Kalendertage' : ''}</span>
<br><span class="k">Verlust je Tag: Teilnehmer ${nf(e.trainee, 1)} · Mentor ${nf(e.mentor, 1)} · TEC ${nf(e.tec, 1)} · Prüfer ${nf(e.examiner, 1)}</span><br>
    ${cf && cf.hard.length ? html`<b>Konflikt:</b> ${cf.hard.map(([r, c]) => r + (c > 1 ? ' (' + c + ' Tage)' : '')).join(', ')}` : ''}${cf && cf.soft.length ? html`<br><span class="k">${cf.soft.map(([r, c]) => r + ' (' + c + ' Tage)').join(', ')}</span>` : ''}`;
};
TIP.person = t => {
  const p = P(t.dataset.pk); if (!p) return null;
  const pr = PROG.get(p.pk), rep = S.report.find(r => r.pk === p.pk);
  return html`<b>${pName(p)}</b> <span class="k">${pSub(p)}</span><br>${clusterLabel(p.cluster)}<br><span class="k">${ROUTE_STATE[pr.state][0]}${pr.end ? ' · letzter Termin ' + fmt(pr.end) : ''}</span>
    ${pr.steps.length ? html`<table>${pr.steps.map(s => html`<tr><td>${s.type}</td><td class="n">${s.have} / ${s.need} Tage</td></tr>`)}</table>` : ''}${rep && ['open', 'blocked', 'partial'].includes(rep.status) ? html`<span class="k">${rep.reason}</span>` : ''}`;
};
VIEWS.year = {
  render() {
    const zooms = [[1, 'Jahr'], [2, 'Halbjahr'], [4, 'Quartal'], [12, 'Monat']];
    return html`
    <div class="view-head"><div><h1>Jahresplan ${S.meta.year}</h1><p>Ein Balken je Maßnahme, darunter Abwesenheiten. Oben das Kapazitätsband je Dienst – Plan und Kapazität auf derselben Zeitachse.</p></div></div>
    <div class="toolbar noprint">
      <input type="search" placeholder="Person oder Ziel suchen" value="${UI.q}" data-inp="ui" data-f="q" id="q-year" style="width:210px" aria-label="Suche">
      <select data-chg="ui" data-f="cluster" aria-label="Cluster"><option value="">Alle Cluster</option>${opts(Object.keys(Core.CLUSTERS).map(k => [k, clusterLabel(k) + ' (' + SUM.clusters[k] + ')']), UI.cluster)}</select>
      <select data-chg="ui" data-f="gStatus" aria-label="Planungsstand">${opts([['', 'Alle Personen'], ['with', 'Mit Terminen'], ['incomplete', 'Weg unvollständig'], ['without', 'Planbar, ohne Termine'], ['conflict', 'Mit Konflikt']], UI.gStatus)}</select>
      <select data-chg="ui" data-f="gSort" aria-label="Sortierung">${opts([['list', 'Listenreihenfolge'], ['name', 'Nach Name'], ['cluster', 'Nach Cluster'], ['start', 'Nach erstem Termin'], ['end', 'Nach Abschluss']], UI.gSort)}</select>
      <label class="c small"><input type="checkbox" data-chg="ui" data-f="gGroup" ${UI.gGroup ? raw('checked') : ''}> nach Cluster gruppieren</label>
      <span class="sp"></span>
      <div class="seg" role="group" aria-label="Zeitraum">${zooms.map(([z, l]) => html`<button data-act="gantt-zoom" data-z="${z}" aria-pressed="${UI.gZoom === z}">${l}</button>`)}</div>
    </div>
    <div class="legend noprint" style="margin-bottom:10px">
      ${LEGEND_TYPES.filter(t => S.events.some(e => e.type === t)).map(t => html`<button class="chip" data-act="gantt-type" data-t="${t}" aria-pressed="${!UI.gHide.has(t)}" data-tip="Anklicken blendet ${t} aus oder ein"><i class="sw ${tcls(t)}"></i>${t}</button>`)}
      <span><i class="sw" style="background:var(--t-other);box-shadow:inset 3px 0 0 rgba(0,0,0,.45)"></i>fixiert</span>
      <span><i class="sw" style="background:var(--t-other);box-shadow:inset 0 -3px 0 rgba(0,0,0,.35)"></i>Szenario</span>
      <span><i class="sw" style="background:var(--crit);border-radius:50%"></i>Konflikt</span>
      <span><i class="sw a-Urlaub" style="height:4px"></i>Abwesenheit</span>
      <span><i class="sw" style="background:var(--school)"></i>Ferien</span>
    </div>
    <div class="gantt" id="gantt" data-keep="gantt"></div>
    <div class="noprint" style="margin-top:8px">${capLegend()}</div>
    <p class="small muted" style="margin-top:8px">Balken anklicken zum Bearbeiten, Namen anklicken für Personenkalender und Wegfortschritt. Ausbildungstage liegen nur auf Arbeitstagen (Mo–Fr, ohne eingetragene Feiertage); die dünne Linie verbindet verteilte Tage derselben Maßnahme.</p>`;
  },
  after: drawGantt, resize: drawGantt
};
ACT['gantt-zoom'] = t => {
  const el = $('#gantt'), lw = parseFloat(getComputedStyle(el).getPropertyValue('--lw')) || 232, view = el.clientWidth - lw;
  const total = Math.max(1, el.scrollWidth - lw), ratio = (el.scrollLeft + view / 2) / total;
  UI.gZoom = +t.dataset.z; render();
  const el2 = $('#gantt'); el2.scrollLeft = Math.max(0, ratio * (el2.scrollWidth - lw) - view / 2);
};
ACT['gantt-type'] = t => { const k = t.dataset.t; UI.gHide.has(k) ? UI.gHide.delete(k) : UI.gHide.add(k); render(); };
ACT['person-open'] = t => { const p = P(t.dataset.pk); if (p) openDrawer({ kind: 'person', pk: p.pk }); };
ACT['event-open'] = t => openDrawer({ kind: 'event', id: t.dataset.id });
