import * as Core from '../../core/index.js';
import { $, esc, html, raw } from '../dom.js';
import { LEGEND_TYPES, MON, MONL, ROUTE_STATE, TSHORT, clusterLabel, fmt, fmtS, nf, opts, originOf, tcls, tname } from '../format.js';
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
/** Maße des gezeichneten Jahresplans (Breite eines Tages in Pixeln) – Grundlage für Ziehen und Ablegen. */
export let ganttGeom = null;
/** Maßnahmen, die sich als einzelnes Element in den Plan ziehen lassen: alles außer der Vorbereitung; Lehrgänge nur, solange sie nicht als Block geplant werden. */
function paletteTypes() {
  const all = Core.typesOf(S).filter(t => t !== Core.PREP), single = all.filter(t => !Core.isCourse(S, t));
  return S.settings.courseBlocks ? single : [...single, ...all.filter(t => Core.isCourse(S, t))];
}
const DAY_LABELS = 15, WD2 = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];          // Tagesbreite in Pixeln, ab der jeder Tag beschriftet wird
const ZOOMS = [[1, 'Jahr'], [2, 'Halbjahr'], [4, 'Quartal'], [12, 'Monat'], [26, '2 Wochen']];
function drawGantt() {
  const el = $('#gantt'); if (!el) return;
  const cal = IX.cal, n = IX.n, lw = parseFloat(getComputedStyle(el).getPropertyValue('--lw')) || 232;
  const dw = Math.round(Math.max(1.5, (el.clientWidth - lw - 2) / n) * UI.gZoom * 100) / 100, W = Math.round(n * dw);
  const px = d => Math.round(d * dw * 10) / 10;
  ganttGeom = { dw, n };
  const workCum = new Int32Array(n + 1); for (let d = 0; d < n; d++) workCum[d + 1] = workCum[d] + IX.work[d];
  const absBy = new Map(); for (const a of S.absences) { let l = absBy.get(a.pk); if (!l) absBy.set(a.pk, l = []); l.push(a); }
  const people = filteredPeople();
  // Kopf: Monate, Kalenderwochen, Kapazitätsband
  let head = '<div class="g-months">';
  for (let m = 0; m < 12; m++) head += '<span style="left:' + px(cal.monthStart[m]) + 'px;width:' + px(cal.monthStart[m + 1] - cal.monthStart[m]) + 'px"><em>' + (dw * 30 > 70 ? MONL[m] + (dw >= DAY_LABELS ? ' ' + cal.year : '') : MON[m]) + '</em></span>';
  head += '</div>';
  if (dw >= 3.4) {
    head += '<div class="g-weeks">';
    for (let d = 0; d < n; d++) if (cal.dow[d] === 1) head += '<span style="left:' + px(d) + 'px;width:' + px(7) + 'px"><em>' + (dw * 7 >= 34 ? 'KW ' : '') + Core.isoWeek(cal.iso[d]) + '</em></span>';
    head += '</div>';
  }
  // ab einer Tagesbreite, in der eine Zahl Platz hat: jeder Tag mit Datum, bei mehr Platz auch mit Wochentag
  if (dw >= DAY_LABELS) {
    head += '<div class="g-days">';
    for (let d = 0; d < n; d++) head += '<span class="' + (cal.dow[d] === 0 || cal.dow[d] === 6 ? 'we' : '') + (IX.holiday[d] ? ' ho' : '') + '" style="left:' + px(d) + 'px;width:' + dw + 'px">' + (dw >= 34 ? WD2[cal.dow[d]] + ' ' : '') + cal.dom[d] + '.</span>';
    head += '</div>';
  }
  head += '<div class="g-cap" style="--dw:' + dw + 'px">' + [0, 1, 2].map(k => { let s = '<div data-tk="capcell" data-k="' + k + '" data-act="day-cell">'; for (let d = 0; d < n; d++) s += '<i class="' + capClass(d, k) + '" style="width:' + dw + 'px"></i>'; return s + '</div>'; }).join('') + '</div>';
  // Hintergrund: Monatslinien, Wochenenden, Ferien, Feiertage
  let under = '';
  if (dw >= 3.4) for (let d = 0; d < n; d++) { if (cal.dow[d] === 6) under += '<i class="w" style="left:' + px(d) + 'px;width:' + px(Math.min(2, n - d)) + 'px"></i>'; if (IX.holiday[d]) under += '<i class="h" style="left:' + px(d) + 'px;width:' + px(1) + 'px"></i>'; }
  for (const s of S.school) { const a = Math.max(0, cal.idx(s.start)), b = Math.min(n - 1, cal.idx(s.end)); if (b >= a) under += '<i class="sc" style="left:' + px(a) + 'px;width:' + px(b - a + 1) + 'px"></i>'; }
  for (let m = 1; m < 12; m++) under += '<i class="m" style="left:' + px(cal.monthStart[m]) + 'px"></i>';
  // Lehrgänge mit Modulen: der Balken einer Person zerfällt in ihre Module
  const modCourse = new Map(S.courses.filter(c => Core.hasModules(c)).map(c => [c.id, c]));
  const runsOf = list => { const runs = []; let a = list[0], b = list[0]; for (let i = 1; i < list.length; i++) { if (workCum[list[i]] - workCum[b + 1] > 0) { runs.push([a, b]); a = list[i]; } b = list[i]; } runs.push([a, b]); return runs; };
  // Zeilen
  const rowHtml = p => {
    const evs = IX.evByPerson.get(p.pk) || [], pr = PROG.get(p.pk);
    let t = '';
    for (const a of absBy.get(p.pk) || []) { const x = Math.max(0, cal.idx(a.start)), y = Math.min(n - 1, cal.idx(a.end)); if (y >= x) t += '<i class="abs a-' + a.type + '" style="left:' + px(x) + 'px;width:' + Math.max(1, px(y - x + 1)) + 'px" data-tip="' + esc(a.type + ' ' + fmtS(a.start) + '–' + fmt(a.end)) + '"></i>'; }
    for (const e of evs) {
      if (UI.gHide.has(e.type)) continue;
      const ds = IX.evDays.get(e.id); if (!ds || !ds.length) continue;
      const cf = CONF.get(e.id), cls = tcls(e.type) + (e.auto ? '' : e.synthetic ? ' sc' : ' fx') + (cf && cf.hard.length ? ' cf' : '');
      const title = e.title && e.courseKind ? e.title : TSHORT[e.type] || e.type;
      const mc = e.courseId ? modCourse.get(e.courseId) : null, parts = mc ? Core.eventModules(IX, mc, e) : [];
      // je Abschnitt: [erster Tag, letzter Tag, Beschriftung] – bei Modulen ein Abschnitt je Modul, sonst je zusammenhängendem Lauf
      const runs = parts.length ? parts.flatMap(m => runsOf(m.days).map(r => [r[0], r[1], Core.moduleName(m.no)])) : runsOf(ds).map(r => [r[0], r[1], title]);
      if (runs.length > 1) t += '<i class="link ' + tcls(e.type) + '" style="left:' + px(ds[0]) + 'px;width:' + px(ds[ds.length - 1] - ds[0] + 1) + 'px"></i>';
      runs.forEach(([x, y, label], ri) => {
        const w = Math.max(2, px(y - x + 1) - (dw >= 3 ? 1 : 0)), last = ri === runs.length - 1;
        t += '<button class="bar ' + cls + (parts.length ? ' md' : '') + (e.partial && last ? ' pt' : '') + '" style="left:' + px(x) + 'px;width:' + w + 'px" data-act="event-open" data-id="' + esc(e.id) + '" data-drag="event" data-tk="event" aria-label="' + esc(tname(e.type) + (parts.length ? ' ' + label : '') + ' ' + fmt(cal.iso[x]) + ' bis ' + fmt(cal.iso[y])) + '">' + (w >= label.length * 6.3 + 10 ? '<span>' + esc(label) + '</span>' : '') + '</button>';
      });
    }
    if (!evs.length) t += '<small class="g-open">' + esc(pr.state === 'locked' ? 'ausgeschlossen – keine neuen Maßnahmen' : pr.state === 'unassigned' ? 'Cluster offen' : (S.report.find(r => r.pk === p.pk)?.reason || 'Planung offen')) + '</small>';
    return '<div class="g-row"><button class="g-lab" data-act="person-open" data-pk="' + esc(p.alias) + '" data-tk="person"><i class="st" style="background:' + stColor[pr.state] + '"></i><span class="t"><b>' + esc(pName(p)) + '</b><small>' + esc(personMeta(p)) + '</small></span></button><div class="g-track" style="width:' + W + 'px">' + t + '</div></div>';
  };
  let rows = '';
  if (UI.gGroup) for (const k of Object.keys(Core.CLUSTERS)) { const g = people.filter(p => p.cluster === k); if (g.length) rows += '<div class="g-group"><div>' + esc(clusterLabel(k)) + ' · ' + g.length + '</div></div>' + g.map(rowHtml).join(''); }
  else rows = people.map(rowHtml).join('');
  if (!people.length) rows = '<div class="empty" style="position:sticky;left:0;width:' + el.clientWidth + 'px"><b>Keine Personen für diese Auswahl</b>Suche oder Filter anpassen.</div>';
  // Die Breite steht fest an der Zeile: Der Browser zeichnet Zeilen nur, wenn ihr Kasten im Fenster liegt – ohne feste Breite
  // endete er am rechten Fensterrand, und weiter rechts (Monatsansicht) blieben Namen und Balken leer.
  el.innerHTML = '<div class="g-head"><div class="g-corner"><span>' + people.length + ' von ' + S.people.length + ' Personen</span><div class="caplab"><span>Früh</span><span>Spät</span><span>Nacht</span></div></div><div class="g-time" style="width:' + W + 'px">' + head + '</div></div>'
    + '<div class="g-body" style="width:' + (W + lw) + 'px"><div class="g-under" style="width:' + W + 'px">' + under + '</div>' + rows + '</div>';
}
TIP.event = t => {
  const e = IX.evById.get(t.dataset.id); if (!e) return null;
  const ds = IX.evDays.get(e.id) || [], cf = CONF.get(e.id), span = ds.length ? IX.cal.idx(e.end) - IX.cal.idx(e.start) + 1 : 0;
  const mc = e.courseId ? S.courses.find(c => c.id === e.courseId && Core.hasModules(c)) : null, mods = mc ? Core.eventModules(IX, mc, e).map(m => m.no) : [];
  return html`<b>${e.title ? e.title + ' · ' : ''}${tname(e.type)}</b> <span class="k">${originOf(e)}${e.partial ? ' · Teilweg' : ''}</span><br>${nameOf(e.pk)}<br>
    ${fmt(e.start)} – ${fmt(e.end)}<br><span class="k">${ds.length} Ausbildungstage${span > ds.length ? ' verteilt über ' + span + ' Kalendertage' : ''}</span>${mods.length ? html`<br><b>Module:</b> ${Core.moduleText(mods)}${Core.isPartial(mc, IX.people.get(e.pk)) ? html` <span class="k">· Teilbeleger</span>` : ''}` : ''}
<br><span class="k">Verlust je Tag: Teilnehmer ${nf(e.trainee, 1)} · Mentor ${nf(e.mentor, 1)} · TEC ${nf(e.tec, 1)} · Prüfer ${nf(e.examiner, 1)}</span><br>
    ${cf && cf.hard.length ? html`<b>Konflikt:</b> ${cf.hard.map(([r, c]) => r + (c > 1 ? ' (' + c + ' Tage)' : '')).join(', ')}` : ''}${cf && cf.soft.length ? html`<br><span class="k">${cf.soft.map(([r, c]) => r + ' (' + c + ' Tage)').join(', ')}</span>` : ''}`;
};
TIP.person = t => {
  const p = P(t.dataset.pk); if (!p) return null;
  const pr = PROG.get(p.pk), rep = S.report.find(r => r.pk === p.pk);
  return html`<b>${pName(p)}</b> <span class="k">${pSub(p)}</span><br>${clusterLabel(p.cluster)}<br><span class="k">${ROUTE_STATE[pr.state][0]}${pr.end ? ' · letzter Termin ' + fmt(pr.end) : ''}</span>
    ${pr.steps.length ? html`<table>${pr.steps.map(s => html`<tr><td>${tname(s.type)}</td><td class="n">${s.have} / ${s.need} Tage</td></tr>`)}</table>` : ''}${rep && ['open', 'blocked', 'partial'].includes(rep.status) ? html`<span class="k">${rep.reason}</span>` : ''}`;
};
VIEWS.year = {
  render() {
    const zooms = ZOOMS;
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
      ${LEGEND_TYPES.filter(t => S.events.some(e => e.type === t)).map(t => html`<button class="chip" data-act="gantt-type" data-t="${t}" aria-pressed="${!UI.gHide.has(t)}" data-tip="Anklicken blendet ${tname(t)} aus oder ein"><i class="sw ${tcls(t)}"></i>${tname(t)}</button>`)}
      <span><i class="sw" style="background:var(--t-other);box-shadow:inset 3px 0 0 rgba(0,0,0,.45)"></i>fixiert</span>
      <span><i class="sw" style="background:var(--t-other);box-shadow:inset 0 -3px 0 rgba(0,0,0,.35)"></i>Szenario</span>
      <span><i class="sw" style="background:var(--crit);border-radius:50%"></i>Konflikt</span>
      <span><i class="sw a-Urlaub" style="height:4px"></i>Abwesenheit</span>
      <span><i class="sw" style="background:var(--school)"></i>Ferien</span>
    </div>
    <div class="palette noprint"><span class="small ink2"><b>Ziehen und Ablegen:</b> Element auf eine Person ziehen – oder einen Balken verschieben</span>
      ${paletteTypes().map(t => html`<span class="pchip" data-drag="new" data-type="${t}" data-tip="${tname(t)}: auf eine Zeile ziehen. Dauer und Betreuung kommen aus dem Ausbildungsweg der Person; beim Ablegen wird die Kapazität geprüft."><i class="sw ${tcls(t)}"></i>${TSHORT[t] || t}</span>`)}
      ${S.courses.filter(c => c.seats == null || Core.courseMembers(S, c.id).length < c.seats).slice(0, 14).map(c => html`<span class="pchip crs" data-drag="seat" data-id="${c.id}" data-tip="Lehrgangsplatz: auf eine Person ziehen, um sie in ${c.title} (${fmtS(c.start)} – ${fmt(c.end)}) einzutragen"><i class="sw ${tcls(c.type)}"></i>${c.title} <span class="muted">${fmtS(c.start)} · ${Core.courseMembers(S, c.id).length}${c.seats != null ? '/' + c.seats : ''}</span></span>`)}</div>
    <div class="gantt" id="gantt" data-keep="gantt"></div>
    <div class="noprint" style="margin-top:8px">${capLegend()}</div>
    <p class="small muted" style="margin-top:8px">Balken anklicken zum Bearbeiten oder mit gedrückter Maustaste verschieben; Namen anklicken für Personenkalender und Wegfortschritt. Beim Ziehen zeigt jeder Tag grün (frei, Kapazität reicht), gelb (unter 0-Punkt) oder rot (nicht möglich). Ausbildungstage liegen nur auf Arbeitstagen (Mo–Fr, ohne eingetragene Feiertage); die dünne Linie verbindet verteilte Tage derselben Maßnahme.</p>`;
  },
  after: drawGantt, resize: drawGantt
};
/** Stellt den Zoom ein und hält die Stelle unter „at“ fest (Abstand vom linken Rand der Zeitachse; ohne Angabe: die Mitte). */
function setZoom(z, at) {
  const el = $('#gantt'); if (!el || z === UI.gZoom) return;
  const lw = parseFloat(getComputedStyle(el).getPropertyValue('--lw')) || 232, view = el.clientWidth - lw, x = at ?? view / 2;
  const total = Math.max(1, el.scrollWidth - lw), ratio = (el.scrollLeft + x) / total;
  UI.gZoom = z; render();
  const el2 = $('#gantt'); el2.scrollLeft = Math.max(0, ratio * (el2.scrollWidth - lw) - x);
}
ACT['gantt-zoom'] = t => setZoom(+t.dataset.z);
// Strg + Mausrad über dem Plan: stufenweise hinein- und herauszoomen, die Stelle unter dem Zeiger bleibt stehen
document.addEventListener('wheel', e => {
  if (!e.ctrlKey || UI.view !== 'year' || !e.target.closest) return;
  const el = e.target.closest('#gantt'); if (!el) return;
  e.preventDefault();
  const i = ZOOMS.findIndex(z => z[0] === UI.gZoom), next = ZOOMS[Core.clamp((i < 0 ? 0 : i) + (e.deltaY < 0 ? 1 : -1), 0, ZOOMS.length - 1)][0];
  const lw = parseFloat(getComputedStyle(el).getPropertyValue('--lw')) || 232;
  setZoom(next, Math.max(0, e.clientX - el.getBoundingClientRect().left - lw));
}, { passive: false });
ACT['gantt-type'] = t => { const k = t.dataset.t; UI.gHide.has(k) ? UI.gHide.delete(k) : UI.gHide.add(k); render(); };
ACT['person-open'] = t => { const p = P(t.dataset.pk); if (p) openDrawer({ kind: 'person', pk: p.pk }); };
ACT['event-open'] = t => openDrawer({ kind: 'event', id: t.dataset.id });
