import * as Core from '../../core/index.js';
import { html } from '../dom.js';
import { TSHORT, dayLabel, fmt, fmtS, nf, sgn } from '../format.js';
import { IX, P, S, UI, commit, pName } from '../state.js';
import { closeModal, openModal, toast } from '../dialogs.js';
import { hideTip } from '../tooltip.js';
import { ganttGeom } from './year.js';

/* ==========================================================================
 * Jahresplan · Ziehen und Ablegen
 * Ein Ausbildungselement aus der Leiste auf eine Person ziehen, einen Balken verschieben oder eine Person
 * auf einen Lehrgangsplatz setzen. Schon beim Ziehen zeigt jeder Tag, ob er frei ist und die Kapazität reicht;
 * beim Ablegen folgt die Prüfung – Konflikte werden nie stillschweigend eingetragen.
 * ========================================================================== */
let drag = null, ghost = null;

/** Was wird gezogen? Liefert Art, Dauer, Verlustfaktoren und ggf. den Termin bzw. Lehrgang. */
function specOf(src) {
  const kind = src.dataset.drag;
  if (kind === 'new') return { kind, type: src.dataset.type, label: TSHORT[src.dataset.type] || src.dataset.type };
  if (kind === 'seat') { const c = S.courses.find(x => x.id === src.dataset.id); return c ? { kind, course: c, type: c.type, label: c.title } : null; }
  const e = IX.evById.get(src.dataset.id); if (!e) return null;
  if (e.courseId) return { kind: 'locked', label: e.title || e.type };
  return { kind: 'event', event: e, type: e.type, label: e.title || TSHORT[e.type] || e.type };
}
function rowAt(x, y) {
  const el = document.elementFromPoint(x, y), row = el && el.closest && el.closest('.g-row');
  return row && row.querySelector('.g-track') ? row : null;
}
const dayAt = (row, x) => Core.clamp(Math.floor((x - row.querySelector('.g-track').getBoundingClientRect().left) / ganttGeom.dw), 0, IX.n - 1);
const personOf = row => P(row.querySelector('.g-lab').dataset.pk);

/** Prüfung für die aktuelle Zielstelle. */
function evaluate(spec, p, day) {
  if (spec.kind === 'seat') {
    const c = spec.course, ds = Core.courseDayList(IX, c), f = Core.elementFor(S, IX, p, c.type);
    const r = Core.checkPlacement(S, IX, { pk: p.pk, type: c.type, start: ds[0] ?? 0, len: ds.length, factors: f });
    const a = Core.assessCourse(S, IX, c, [p.pk], { group: 'all' }), extra = a.issues.filter(i => i.cat === 'Platzzahl' || i.cat === 'Reihenfolge im Ausbildungsweg' || i.cat === 'Lehrgang').map(i => i.cat === 'Lehrgang' ? 'alle Plätze belegt' : i.cat);
    if (Core.courseMembers(S, c.id).some(e => e.pk === p.pk)) extra.push('nimmt bereits teil');
    return { ...r, ok: r.ok && !extra.length, extra, factors: f };
  }
  if (spec.kind === 'event') {
    const e = spec.event, len = (IX.evDays.get(e.id) || []).length || 1, f = { trainee: e.trainee, mentor: e.mentor, tec: e.tec, examiner: e.examiner };
    return { ...Core.checkPlacement(S, IX, { pk: p.pk, type: e.type, start: day, len, factors: f, moveId: e.id }), extra: [], factors: f };
  }
  const f = Core.elementFor(S, IX, p, spec.type);
  return { ...Core.checkPlacement(S, IX, { pk: p.pk, type: spec.type, start: day, len: f.days, factors: f }), extra: [], factors: f };
}
function clearPreview() { for (const el of document.querySelectorAll('.g-drop')) el.remove(); for (const el of document.querySelectorAll('.g-row.drop')) el.classList.remove('drop'); }
function preview(row, res) {
  clearPreview();
  const box = document.createElement('div'); box.className = 'g-drop';
  let s = '';
  for (const r of res.perDay) s += '<i class="' + r.state + '" style="left:' + (r.d * ganttGeom.dw).toFixed(1) + 'px;width:' + Math.max(2, ganttGeom.dw - (ganttGeom.dw >= 3 ? 1 : 0)).toFixed(1) + 'px"></i>';
  box.innerHTML = s;
  row.querySelector('.g-track').append(box); row.classList.add('drop');
}
function showGhost(x, y, text, cls) {
  if (!ghost) { ghost = document.createElement('div'); ghost.id = 'dragGhost'; document.body.append(ghost); }
  ghost.className = cls; ghost.textContent = text; ghost.hidden = false;
  ghost.style.left = Math.min(x + 14, innerWidth - ghost.offsetWidth - 8) + 'px'; ghost.style.top = Math.min(y + 16, innerHeight - ghost.offsetHeight - 8) + 'px';
}
const verdict = res => res.short ? ['crit', 'nicht genug freie Diensttage bis Jahresende'] : res.extra.length ? ['crit', res.extra[0]] : res.crit ? ['crit', res.crit + (res.crit === 1 ? ' Tag' : ' Tage') + ' nicht möglich'] : res.warn ? ['warn', res.warn + (res.warn === 1 ? ' Tag' : ' Tage') + ' unter 0-Punkt'] : ['ok', 'Kapazität reicht'];

function update(e) {
  const d = drag, row = d.spec.kind === 'event' ? d.home : rowAt(e.clientX, e.clientY);
  d.target = null;
  if (!row) { clearPreview(); return showGhost(e.clientX, e.clientY, d.spec.label + ' – auf eine Person im Jahresplan ziehen', ''); }
  const p = personOf(row); if (!p) return;
  if (Core.isLocked(p)) { clearPreview(); return showGhost(e.clientX, e.clientY, pName(p) + ' ist ausgeschlossen', 'crit'); }
  const day = d.spec.kind === 'event' ? Core.clamp(dayAt(row, e.clientX) - d.grab, 0, IX.n - 1) : dayAt(row, e.clientX), res = evaluate(d.spec, p, day), [cls, text] = verdict(res);
  d.target = { p, day, res };
  preview(row, res);
  showGhost(e.clientX, e.clientY, d.spec.label + ' · ' + pName(p) + (res.days.length ? ' · ' + fmtS(res.start) + ' – ' + fmt(res.end) + ' (' + res.days.length + ' T)' : '') + ' · ' + text, cls);
  // am Rand weiterblättern
  const g = document.querySelector('#gantt'), r = g.getBoundingClientRect();
  if (e.clientX > r.right - 36) g.scrollLeft += 24; else if (e.clientX < r.left + 250 && e.clientX > r.left + 232) g.scrollLeft -= 24;
}

// ---------- Eintragen --------------------------------------------------------------------------
function apply(spec, p, res, note) {
  const dates = res.days.map(d => IX.cal.iso[d]), f = res.factors;
  if (spec.kind === 'seat') {
    let r; commit('', () => { r = Core.joinCourse(S, IX, S.courses.find(c => c.id === spec.course.id), [p.pk]); });
    return toast(pName(p) + ' nimmt an „' + spec.course.title + '“ teil' + note + (r && r.removed ? ' · ' + r.removed + ' berechnete Termine weichen' : ''));
  }
  if (spec.kind === 'event') {
    commit('', () => { const e = S.events.find(x => x.id === spec.event.id); e.start = dates[0]; e.end = dates[dates.length - 1]; e.dates = dates; e.auto = false; delete e.synthetic; delete e.dayAreas; delete e.partial; });
    return toast(spec.label + ' verschoben auf ' + fmtS(dates[0]) + ' – ' + fmt(dates[dates.length - 1]) + ' und fixiert' + note);
  }
  commit('', () => { S.events.push({ id: Core.uid(), pk: p.pk, type: spec.type, auto: false, start: dates[0], end: dates[dates.length - 1], dates, trainee: f.trainee, mentor: f.mentor, tec: f.tec, examiner: f.examiner, target: p.target || '' }); });
  toast(spec.label + ' für ' + pName(p) + ' eingetragen: ' + fmtS(dates[0]) + ' – ' + fmt(dates[dates.length - 1]) + note);
}
function ask(spec, p, day, res) {
  const alt = spec.kind === 'seat' || res.short && !res.days.length ? null : Core.checkPlacement(S, IX, { pk: p.pk, type: spec.type, start: day, len: res.len, factors: res.factors, moveId: spec.kind === 'event' ? spec.event.id : undefined, spread: true });
  const hasAlt = alt && alt.ok && (alt.end !== res.end || alt.start !== res.start), bad = res.perDay.filter(r => r.state === 'crit' || r.state === 'warn'), okN = res.perDay.length - bad.length;
  openModal({ title: 'Prüfung: ' + spec.label + ' · ' + pName(p), wide: true, body: html`
    <p class="ink2">${res.days.length ? html`${res.days.length} ${spec.kind === 'seat' ? 'Lehrgangstage' : 'Diensttage'} vom <b>${fmt(res.start)}</b> bis <b>${fmt(res.end)}</b>.` : 'Ab dieser Stelle ist kein passender Diensttag mehr frei.'} ${res.short ? html`<b>Bis zum Jahresende fehlen ${res.len - res.days.length} Tage.</b>` : ''}${res.skipped ? html` <span class="muted">Dienstfreie Tage, Abwesenheiten und belegte Tage sind übersprungen (${res.skipped}).</span>` : ''}</p>
    <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:10px 0">
      <div class="kpi"><div class="l">Ohne Befund</div><div class="v" style="color:var(--good-ink)">${nf(okN)}</div><div class="s">Tage frei, Kapazität ab 0-Punkt</div></div>
      <div class="kpi ${res.warn ? 'warn' : ''}"><div class="l">Unter 0-Punkt</div><div class="v">${nf(res.warn)}</div><div class="s">über dem Minimum, unter der Sollbesetzung</div></div>
      <div class="kpi ${res.crit ? 'crit' : ''}"><div class="l">Nicht möglich</div><div class="v">${nf(res.crit)}</div><div class="s">${spec.kind === 'seat' ? 'Abwesenheit, Kollision oder unter Minimum' : 'unter Minimum oder Betreuung ausgeschöpft'}</div></div></div>
    ${res.extra.length ? html`<div class="note crit"><b>${res.extra.join(' · ')}</b></div>` : ''}
    ${bad.length ? html`<div class="tblwrap" style="max-height:250px"><table class="tbl"><thead><tr><th>Tag</th><th>Dienst</th><th>Befund</th><th class="n">Verfügbar danach</th><th class="n">0-Punkt</th><th class="n">Minimum</th></tr></thead><tbody>
      ${bad.map(r => html`<tr class="${r.state === 'crit' ? 'rowcrit' : 'rowwarn'}"><td class="nowrap">${dayLabel(r.d)}</td><td>${r.k >= 0 ? Core.kShift(r.k) : 'frei'}</td><td>${r.why.join(', ')}</td><td class="n">${r.after === undefined ? '–' : html`<b>${nf(r.after, 1)}</b>`}</td><td class="n">${r.zero === undefined ? '–' : sgn(r.after - r.zero)}</td><td class="n">${r.min === undefined ? '–' : sgn(r.after - r.min)}</td></tr>`)}</tbody></table></div>` : ''}
    ${res.notes ? html`<p class="small muted" style="margin-top:8px">${res.notes} Lehrgangstage liegen auf dienstfreien Tagen – dort ist der Dienstplan anzupassen, Produktionsverlust entsteht nicht.</p>` : ''}
    ${hasAlt ? html`<div class="note good" style="margin-top:10px"><b>Ausweichen ist möglich:</b> die knappen Tage auslassen und dafür später weitermachen – das Element endet dann am ${fmt(alt.end)} und hält an jedem Tag die Grenze ein.</div>` : ''}
    <p class="small ink2" style="margin-top:8px">„Trotzdem eintragen“ legt den Termin fixiert an; die Befunde stehen danach als Konflikt im Bericht.</p>`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button>${hasAlt ? html`<button class="btn primary" data-act="m:alt" autofocus>Knappe Tage auslassen</button>` : ''}${res.days.length && !res.extra.includes('nimmt bereits teil') ? html`<button class="btn ${hasAlt ? '' : 'primary'} danger" data-act="m:force">Trotzdem eintragen</button>` : ''}`,
    handlers: { alt: () => { closeModal(); apply(spec, p, { ...alt, factors: res.factors }, ' · knappe Tage ausgelassen'); }, force: () => { closeModal(); apply(spec, p, res, ' · mit ' + (res.crit + res.warn) + ' Befunden'); } } });
}

// ---------- Zeigerereignisse ------------------------------------------------------------------------
document.addEventListener('pointerdown', e => {
  if (UI.view !== 'year' || e.button !== 0 || !ganttGeom) return;
  const src = e.target.closest && e.target.closest('[data-drag]'); if (!src) return;
  const spec = specOf(src); if (!spec) return;
  const home = src.closest('.g-row');
  drag = { spec, home, x: e.clientX, y: e.clientY, active: false, target: null, grab: spec.kind === 'event' && home ? dayAt(home, e.clientX) - ((IX.evDays.get(spec.event.id) || [0])[0]) : 0 };
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    if (drag.spec.kind === 'locked') { const label = drag.spec.label; drag = null; return toast('„' + label + '“ ist ein Lehrgang – Zeitraum und Teilnehmer ändern Sie unter „Lehrgänge“'); }
    drag.active = true; hideTip(); document.body.classList.add('dragging');
  }
  e.preventDefault(); update(e);
});
function end(cancel) {
  const d = drag; drag = null;
  if (!d || !d.active) return;
  clearPreview(); if (ghost) ghost.hidden = true; document.body.classList.remove('dragging');
  // der Klick, der auf das Loslassen folgt, soll den Balken nicht öffnen
  const eat = ev => { ev.stopPropagation(); ev.preventDefault(); };
  window.addEventListener('click', eat, { capture: true, once: true }); setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 0);
  if (cancel || !d.target) return;
  const { p, day, res } = d.target;
  if (d.spec.kind === 'event' && res.days.length && res.days[0] === (IX.evDays.get(d.spec.event.id) || [])[0]) return;      // nicht bewegt
  if (res.ok) apply(d.spec, p, res, res.days.length === 1 ? ' · Kapazität ausreichend' : ' · Kapazität an allen ' + res.days.length + ' Tagen ausreichend'); else ask(d.spec, p, day, res);
}
document.addEventListener('pointerup', () => end(false));
document.addEventListener('pointercancel', () => end(true));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && drag && drag.active) { e.stopPropagation(); end(true); } }, true);
