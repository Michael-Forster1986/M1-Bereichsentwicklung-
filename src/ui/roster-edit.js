import * as Core from '../core/index.js';
import { html, raw } from './dom.js';
import { fmt, nf, opts } from './format.js';
import { IX, LS, S, UI, collator, commit, pName, sortKey, store } from './state.js';
import { closeModal, confirmDlg, openModal, toast } from './dialogs.js';
import { ACT, CHG } from './registry.js';
import { render } from './shell.js';
import { trace } from '../platform/desktop.js';

/* ==========================================================================
 * Oberfläche · Dienstplan einer Person bearbeiten (in der Seitenleiste der Person)
 * Dienst und Bereich per Auswahl wählen, dann Tage anklicken oder überstreichen; ganze Zeiträume und
 * Wochenfolgen füllen; von anderen Personen übernehmen oder auf sie übertragen. Jede Aktion ist ein
 * Schritt für „Rückgängig“.
 * ========================================================================== */
const DAYSETS = { mf: ['Mo–Fr', [1, 2, 3, 4, 5]], ms: ['Mo–Sa', [1, 2, 3, 4, 5, 6]], all: ['Mo–So', [0, 1, 2, 3, 4, 5, 6]], we: ['Sa–So', [0, 6]] };
/** Eingaben der Werkzeuge; bleiben beim Wechsel der Person stehen. */
const tools = () => UI.ros || (UI.ros = { edit: false, shift: 'Früh', area: '', start: '', end: '', days: 'mf', seq: ['Früh', 'Spät', '', ''], from: '' });
export const rosterEditing = () => tools().edit;
export const drawerWide = () => (UI.drawerWide ?? (UI.drawerWide = store.get(LS.drawerWide) === '1'));
function setWide(on) { UI.drawerWide = !!on; if (on) store.set(LS.drawerWide, '1'); else store.del(LS.drawerWide); }
const person = () => (UI.drawer && UI.drawer.kind === 'person' ? IX.people.get(UI.drawer.pk) : null);
const areaOf = p => (Core.AREAS.includes(tools().area) ? tools().area : p.area);
/** Zeichen für den Dienstplan aus der Auswahl: 0 = Eintrag entfernen, 1 = Frei, sonst Bereich × Dienst. */
const codeOf = (p, shift = tools().shift) => shift === '-' ? 0 : Core.rosterCode(areaOf(p), shift);
const say = (p, n, what) => toast(n ? pName(p) + ': ' + nf(n) + (n === 1 ? ' Tag ' : ' Tage ') + what : 'Nichts zu ändern – diese Tage sind bereits so eingetragen');
function period() {
  const r = tools(), yr = String(S.meta.year), start = r.start || yr + '-01-01', end = r.end || yr + '-12-31';
  if (!Core.validDate(start) || !Core.validDate(end) || !start.startsWith(yr) || !end.startsWith(yr)) { toast('Der Zeitraum muss im Jahr ' + yr + ' liegen', 'crit'); return null; }
  if (end < start) { toast('Das Ende liegt vor dem Beginn', 'crit'); return null; }
  return { start, end, dows: DAYSETS[r.days][1], label: fmt(start) + ' – ' + fmt(end) + ', ' + DAYSETS[r.days][0] };
}

/** Werkzeugleiste unter dem Jahreskalender. */
export function rosterTools(p) {
  const r = tools(), yr = String(S.meta.year), others = S.people.filter(x => x.pk !== p.pk && S.roster[x.pk]).sort((a, b) => collator.compare(sortKey(a), sortKey(b)));
  const date = (f, v) => html`<input type="date" data-chg="ros-ui" data-f="${f}" value="${v}" min="${yr}-01-01" max="${yr}-12-31">`;
  return html`<div class="ros-tools" id="rosTools">
    <div class="ros-row"><b>Eintragen</b>
      <label>Dienst <select data-chg="ros-ui" data-f="shift" id="rosShift">${opts([...Core.SHIFTS, 'Frei', ['-', 'Eintrag entfernen']], r.shift)}</select></label>
      <label>Bereich <select data-chg="ros-ui" data-f="area" id="rosArea">${opts(Core.AREAS, areaOf(p))}</select></label>
      <span class="small ink2">Auswählen, dann im Kalender einen Tag anklicken – oder von einem Tag zum anderen ziehen: Der Zeitraum dazwischen wird an den unten gewählten Wochentagen eingetragen.</span></div>
    <div class="ros-row"><b>Zeitraum</b>
      <label>von ${date('start', r.start || yr + '-01-01')}</label><label>bis ${date('end', r.end || yr + '-12-31')}</label>
      <label>Wochentage <select data-chg="ros-ui" data-f="days">${opts(Object.entries(DAYSETS).map(([k, v]) => [k, v[0]]), r.days)}</select></label>
      <button class="btn sm primary" data-act="ros-fill" data-tip="Trägt den oben gewählten Dienst an den gewählten Wochentagen des Zeitraums ein">Zeitraum füllen</button></div>
    <div class="ros-row"><b>Wochenfolge</b>
      ${[0, 1, 2, 3].map(j => html`<label>Woche ${j + 1} <select data-chg="ros-ui" data-f="seq${j}" id="rosSeq${j}">${opts([['', '–'], ...Core.SHIFTS, 'Frei'], r.seq[j])}</select></label>`)}
      <button class="btn sm" data-act="ros-week" data-tip="Der Dienst wechselt wochenweise in dieser Folge – im Zeitraum und an den Wochentagen von oben. Alle übrigen Tage des Zeitraums werden frei.">Wochenfolge eintragen</button></div>
    <div class="ros-row"><b>Übernehmen</b>
      <select data-chg="ros-ui" data-f="from" id="rosFrom" aria-label="Dienstplan einer anderen Person übernehmen"><option value="">von Person …</option>${opts(others.map(x => [x.alias, pName(x)]), r.from)}</select>
      <button class="btn sm" data-act="ros-copy-from" ${others.length ? '' : raw('disabled')}>Übernehmen</button>
      <button class="btn sm" data-act="ros-copy-to" ${S.roster[p.pk] ? '' : raw('disabled')}>Auf andere Personen übertragen …</button>
      <button class="btn sm" data-act="imp-roster" data-tip="Excel- oder CSV-Datei mit dem Dienstplan: Liste oder Tabelle mit einer Zeile je Person und einer Spalte je Tag. Gilt für alle Personen der Datei.">Aus Excel einspielen …</button>
      <span class="sp"></span><button class="btn sm danger" data-act="ros-clear" ${S.roster[p.pk] ? '' : raw('disabled')}>Dienstplan leeren</button></div>
  </div>`;
}
/** Hinweis, wie Tage ohne Eintrag in diesem Projekt zählen. */
export function rosterDefaultNote(p) {
  if (S.settings.strict) return html`<p class="small muted" style="margin-top:6px">Tage ohne Eintrag gelten als frei.</p>`;
  return html`<div class="note warn" style="margin-top:8px">In diesem Projekt gilt an Tagen ohne Eintrag der Dienst aus den Stammdaten (${p.area} · ${p.shift}) – im Kalender blass dargestellt.
    <button class="btn sm" data-act="ros-default-free" style="margin-left:8px">Tage ohne Eintrag als frei werten</button></div>`;
}

CHG['ros-ui'] = t => { const r = tools(), f = t.dataset.f; if (f.startsWith('seq')) r.seq[+f.slice(3)] = t.value; else r[f] = t.value; };
ACT['ros-edit'] = () => { const r = tools(); r.edit = !r.edit; if (r.edit) setWide(true); render(); };
ACT['drawer-size'] = () => { setWide(!drawerWide()); render(); };
ACT['ros-default-free'] = () => commit('Tage ohne Dienstplan-Eintrag gelten jetzt als frei – für neue Terminverteilung „Neu berechnen“', () => { S.settings.strict = true; });
ACT['ros-fill'] = () => {
  const p = person(), per = period(); if (!p || !per) return;
  const code = codeOf(p), r = tools(); let n = 0;
  commit('', () => { n = Core.fillRoster(S, IX.cal, p.pk, { ...per, code }); });
  say(p, n, (code ? 'als ' + (code === 1 ? 'frei' : areaOf(p) + ' · ' + r.shift) + ' eingetragen' : 'ohne Eintrag') + ' (' + per.label + ')');
};
ACT['ros-week'] = () => {
  const p = person(), per = period(); if (!p || !per) return;
  const names = tools().seq.filter(Boolean), seq = names.map(s => codeOf(p, s));
  if (!names.length) return toast('Bitte mindestens eine Woche der Folge wählen', 'crit');
  let n = 0;
  commit('', () => { n = Core.fillRosterWeekly(S, IX.cal, p.pk, { ...per, seq }); });
  say(p, n, 'mit der Wochenfolge ' + names.join(' → ') + ' eingetragen (' + per.label + ')');
};
ACT['ros-copy-from'] = () => {
  const p = person(), from = S.people.find(x => x.alias === tools().from); if (!p) return;
  if (!from) return toast('Bitte die Person wählen, deren Dienstplan übernommen werden soll', 'crit');
  commit('Dienstplan von ' + pName(from) + ' für ' + pName(p) + ' übernommen', () => Core.copyRoster(S, from.pk, [p.pk]));
};
ACT['ros-copy-to'] = () => {
  const p = person(); if (!p) return;
  const rest = S.people.filter(x => x.pk !== p.pk), groups = [
    ['same', 'Alle mit gleichem Bereich und Dienst in den Stammdaten (' + p.area + ' · ' + p.shift + ')', rest.filter(x => x.area === p.area && x.shift === p.shift)],
    ['cluster', 'Alle im selben Cluster (' + (Core.CLUSTERS[p.cluster] || p.cluster) + ')', rest.filter(x => x.cluster === p.cluster)],
    ['all', 'Alle anderen Personen', rest]];
  openModal({ title: 'Dienstplan übertragen · ' + pName(p), body: html`
    <p class="ink2">Der Dienstplan dieser Person wird für das ganze Jahr auf die gewählten Personen übertragen und ersetzt dort den bisherigen.</p>
    <div class="stack" style="gap:8px;margin:12px 0">${groups.map(([k, label, list], i) => html`<label class="c"><input type="radio" name="rosTo" value="${k}" ${i === 0 ? raw('checked') : ''} ${list.length ? '' : raw('disabled')}> <span>${label} <b>(${nf(list.length)})</b></span></label>`)}</div>
    <p class="small muted">Mit „Rückgängig“ kommen Sie zurück.</p>`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok">Übertragen</button>`,
    handlers: { ok: () => {
      const k = document.querySelector('input[name=rosTo]:checked')?.value, list = (groups.find(g => g[0] === k) || [])[2] || [];
      closeModal(); if (!list.length) return;
      let n = 0;
      commit('', () => { n = Core.copyRoster(S, p.pk, list.map(x => x.pk)); });
      toast('Dienstplan von ' + pName(p) + ' auf ' + nf(list.length) + ' Personen übertragen' + (n < list.length ? ' (' + nf(list.length - n) + ' hatten ihn bereits)' : ''));
    } } });
};
ACT['ros-clear'] = async () => {
  const p = person(); if (!p) return;
  if (await confirmDlg('Dienstplan leeren', 'Alle Dienstplan-Einträge von ' + pName(p) + ' werden entfernt. Termine und Abwesenheiten bleiben stehen.', 'Leeren', true)) commit('Dienstplan von ' + pName(p) + ' geleert', () => Core.clearRoster(S, p.pk));
};

// ---------- Tage anklicken oder überstreichen --------------------------------------------------------
// Ein Klick trägt genau diesen Tag ein. Ziehen markiert den Zeitraum vom ersten bis zum aktuellen Tag – auch über
// Monatsgrenzen – und trägt darin die oben gewählten Wochentage ein.
let stroke = null;
const cellAt = el => (el && el.closest ? el.closest('.pcal.edit i[data-d]') : null);
const cellOf = d => document.querySelector('#pcal i[data-d="' + d + '"]');
function show(cell, code) {
  cell.classList.remove('s-0', 's-1', 's-2', 'free', 'fb');
  cell.classList.add(code >= 2 ? 's-' + ((code - 2) % 3) : 'free', 'paint');
  const b = cell.querySelector('b'), letter = code >= 2 ? 'FSN'[(code - 2) % 3] : '';
  if (b) b.textContent = letter; else if (letter) cell.insertAdjacentHTML('afterbegin', '<b>' + letter + '</b>');
}
/** Zeigt den Zeitraum vom ersten bis zum Tag d; Tage, die nicht mehr dazugehören, bekommen ihr Aussehen zurück. */
function extend(d) {
  const s = stroke; if (d === s.last) return;
  s.last = d;
  const a = Math.min(s.anchor, d), b = Math.max(s.anchor, d), next = new Set();
  for (let x = a; x <= b; x++) if (a === b || s.dows.includes(IX.cal.dow[x])) next.add(x);
  for (const x of s.days) if (!next.has(x)) { const cell = cellOf(x), o = s.orig.get(x); if (cell && o) { cell.className = o[0]; cell.innerHTML = o[1]; } }
  for (const x of next) if (!s.days.has(x)) { const cell = cellOf(x); if (!cell) continue; if (!s.orig.has(x)) s.orig.set(x, [cell.className, cell.innerHTML]); show(cell, s.code); }
  s.days = next;
}
function finish(cancel) {
  const s = stroke; stroke = null;
  if (!s) return;
  document.body.classList.remove('painting');
  const p = IX.people.get(s.pk);
  if (cancel || !p || !s.days.size) return render();
  trace('Dienstplan: Tage eintragen');
  let n = 0;
  commit('', () => { n = Core.setRosterDays(S, IX.cal, s.pk, s.days, s.code); });
  if (n) say(p, n, s.code ? 'als ' + (s.code === 1 ? 'frei' : Core.kArea(s.code - 2) + ' · ' + Core.kShift(s.code - 2)) + ' eingetragen' : 'ohne Eintrag'); else render();
}
document.addEventListener('pointerdown', e => {
  if (stroke) finish(true);
  const cell = cellAt(e.target), p = person();
  if (!cell || !p || e.button !== 0 || !tools().edit) return;
  e.preventDefault();
  stroke = { pk: p.pk, code: codeOf(p), anchor: +cell.dataset.d, last: -1, days: new Set(), orig: new Map(), dows: DAYSETS[tools().days][1], id: e.pointerId };
  document.body.classList.add('painting');
  extend(stroke.anchor);
});
document.addEventListener('pointermove', e => {
  if (!stroke || e.pointerId !== stroke.id) return;
  if (!(e.buttons & 1)) return finish(false);
  const cell = cellAt(document.elementFromPoint(e.clientX, e.clientY));
  if (cell) extend(+cell.dataset.d);
});
document.addEventListener('pointerup', e => { if (stroke && e.pointerId === stroke.id) finish(false); });
document.addEventListener('pointercancel', e => { if (stroke && e.pointerId === stroke.id) finish(true); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && stroke) { e.stopPropagation(); finish(true); } }, true);
window.addEventListener('blur', () => finish(true));
