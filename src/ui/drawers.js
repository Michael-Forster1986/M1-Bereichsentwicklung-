import * as Core from '../core/index.js';
import { $, html, raw, setHTML } from './dom.js';
import { MON, REPORT_STATUS, ROUTE_STATE, TSHORT, clusterLabel, dayLabel, fmt, fmtS, nf, opts, originOf, pill, sgn, tcls } from './format.js';
import { CONF, IX, P, PROG, S, UI, collator, commit, nameOf, pName, pidOf, privacy, sortKey } from './state.js';
import { closeDrawer, closeModal, confirmDlg, openDrawer, openModal, toast } from './dialogs.js';
import { ACT, CHG, TIP } from './registry.js';
import { go, render } from './shell.js';
import { EPS, dayFlags } from './views/shared.js';
import { personMeta } from './views/year.js';

/* ==========================================================================
 * Seitenleisten · Person, Termin, Tag
 * ========================================================================== */
let drawerKey = '';
export function renderDrawer() {
  const d = $('#drawer'), spec = UI.drawer; if (!spec) return;
  const keep = $('.body', d)?.scrollTop || 0, sameKey = drawerKey === JSON.stringify(spec);
  let out = null;
  if (spec.kind === 'person') { const p = IX.people.get(spec.pk); out = p ? drawerPerson(p) : null; }
  else if (spec.kind === 'event') { const e = IX.evById.get(spec.id); out = e ? drawerEvent(e) : null; }
  else if (spec.kind === 'event-new') out = drawerEvent(null, spec.pk);
  else if (spec.kind === 'day') out = drawerDay(Core.clamp(spec.d, 0, IX.n - 1));
  if (!out) return closeDrawer();
  setHTML(d, html`<header><h2>${out.title}</h2>${out.head || ''}<button class="btn ghost sm" data-act="drawer-close" aria-label="Schließen">✕</button></header><div class="body">${out.body}</div>`);
  drawerKey = JSON.stringify(spec);
  if (sameKey) $('.body', d).scrollTop = keep;
}
ACT['drawer-close'] = closeDrawer;

// ---------- Person ------------------------------------------------------------
function personCalendar(p) {
  const i = IX.pi.get(p.pk), cal = IX.cal; let s = '<span></span>';
  for (let dd = 1; dd <= 31; dd++) s += '<span class="dh">' + (dd % 5 === 0 || dd === 1 ? dd : '') + '</span>';
  for (let m = 0; m < 12; m++) {
    s += '<span class="mh">' + MON[m] + '</span>';
    const len = cal.monthStart[m + 1] - cal.monthStart[m];
    for (let dd = 0; dd < 31; dd++) {
      if (dd >= len) { s += '<i class="none"></i>'; continue; }
      const d = cal.monthStart[m] + dd, k = Core.assign(IX, i, d), ev = IX.evByDay[d].find(e => e.pk === p.pk && e.type !== Core.PREP) || IX.evByDay[d].find(e => e.pk === p.pk);
      s += '<i class="' + (k >= 0 ? 's-' + (k % 3) : 'free') + (cal.dow[d] === 0 || cal.dow[d] === 6 ? ' wk' : '') + (IX.abs[i][d] ? ' ab' : '') + '" data-tk="pday" data-d="' + d + '">' + (ev ? '<em class="' + tcls(ev.type) + '"></em>' : '') + '</i>';
    }
  }
  return raw(s);
}
TIP.pday = t => {
  const sp = UI.drawer; if (!sp || sp.kind !== 'person') return null;
  const d = +t.dataset.d, i = IX.pi.get(sp.pk), k = Core.assign(IX, i, d), code = IX.ros[i][d], evs = IX.evByDay[d].filter(e => e.pk === sp.pk);
  return html`<b>${dayLabel(d)}</b> <span class="k">${dayFlags(d)}</span><br>${k >= 0 ? Core.kArea(k) + ' · ' + Core.kShift(k) + (code < 2 ? ' (Szenariozuordnung)' : '') : code === 1 ? 'Frei' : 'Kein Dienst eingetragen'}
    ${IX.abs[i][d] ? html`<br>Abwesend: ${Core.ABS_TYPES[IX.abs[i][d] - 1]}` : ''}${evs.map(e => html`<br><span class="key ${tcls(e.type)}"></span>${e.title || e.type} <span class="k">${originOf(e)}</span>`)}`;
};
function drawerPerson(p) {
  const pr = PROG.get(p.pk), evs = (IX.evByPerson.get(p.pk) || []).slice().sort((a, b) => a.start < b.start ? -1 : 1), rep = S.report.find(r => r.pk === p.pk);
  const i = IX.pi.get(p.pk), yr = String(S.meta.year); let duty = 0, vac = 0;
  for (let d = 0; d < IX.n; d++) { if (IX.ros[i][d] >= 2) { duty++; if (IX.abs[i][d]) vac++; } }
  const route = Core.routeOf(S, p), rot = p.rotation || [0, 0, 0];
  const sel = (f, list, v, extra = '') => html`<select data-chg="person" data-pk="${p.alias}" data-f="${f}" ${raw(extra)}>${opts(list, v)}</select>`;
  return { title: pName(p), body: html`
    <div class="row">${pill(p.cluster === 'offen' || p.cluster === 'ausgeschlossen' ? Core.CLUSTERS[p.cluster] : 'Cluster ' + p.cluster, 'info')}${pill(ROUTE_STATE[pr.state][0], ROUTE_STATE[pr.state][1])}
      ${privacy() ? '' : html`<span class="small muted">${p.pk}${p.org ? ' · ' + p.org : ''}</span>`}</div>
    <div class="small ink2">${Core.CLUSTERS[p.cluster]} · Berechtigung ${p.rights}${Object.entries(p.patterns).filter(x => x[1] && x[1] !== '—').map(([k, v]) => ' · ' + k + ': ' + v).join('')}</div>
    ${pr.steps.length ? html`<div><h3>Ausbildungsweg ${p.customRoute ? '(individuell)' : ''}</h3><div class="steps">${pr.steps.map(s => html`
      <div class="step"><span>${s.type}</span><span class="tr"><i class="${tcls(s.type)}" style="width:${s.need ? Math.min(100, s.have / s.need * 100) : 0}%"></i></span><span class="num right">${s.have} / ${s.need} Tage</span></div>`)}</div>
      ${p.credit ? html`<p class="small muted" style="margin-top:6px">Davon Vorleistung aus Vorjahren: ${pr.steps.filter(s => s.credit).map(s => (TSHORT[s.type] || s.type) + ' ' + s.credit + ' Tage').join(' · ')}</p>` : ''}
      ${rep && ['open', 'blocked', 'partial'].includes(rep.status) ? html`<div class="note ${rep.status === 'partial' ? 'warn' : 'crit'}" style="margin-top:10px"><b>${REPORT_STATUS[rep.status][0]}:</b> ${rep.reason}${rep.remaining ? html`<br>Offen: ${rep.remaining.join(', ')}` : ''}</div>` : ''}</div>`
      : html`<div class="note">${pr.state === 'locked' ? 'Für diese Person werden keine neuen Maßnahmen geplant; in der Kapazität zählt sie weiter mit.' : 'Ohne Clusterzuordnung gibt es keinen Ausbildungsweg. Cluster unten wählen.'}</div>`}
    <div><h3>Jahreskalender ${yr}</h3>
      <div class="pcal">${personCalendar(p)}</div>
      <div class="legend" style="margin-top:8px"><span><i class="sw s-0"></i>Früh</span><span><i class="sw s-1"></i>Spät</span><span><i class="sw s-2"></i>Nacht</span><span><i class="sw" style="background:var(--surface-3)"></i>frei</span><span><i class="sw" style="background:repeating-linear-gradient(135deg,var(--muted) 0 2px,var(--surface) 2px 4px)"></i>abwesend</span><span><i class="sw" style="background:var(--t-theorie);height:5px"></i>Maßnahme (Farbe = Art)</span></div>
      <p class="small muted" style="margin-top:6px">${nf(duty)} Diensttage laut Plan · ${nf(vac)} davon abwesend</p></div>
    <div><div class="row"><h3 style="margin:0">Termine (${evs.length})</h3><span class="sp"></span><button class="btn sm" data-act="event-new" data-pk="${p.alias}" ${Core.isLocked(p) ? raw('disabled') : ''}>Termin hinzufügen</button></div>
      ${evs.length ? html`<table class="tbl" style="margin-top:6px"><tbody>${evs.map(e => { const cf = CONF.get(e.id); return html`<tr class="${cf && cf.hard.length ? 'rowcrit' : ''}"><td><i class="sw ${tcls(e.type)}"></i> ${e.title || e.type}</td><td class="nowrap">${fmtS(e.start)}–${fmt(e.end)}</td><td class="n">${(IX.evDays.get(e.id) || []).length} T</td><td class="muted">${originOf(e)}</td><td><button class="btn sm" data-act="event-open" data-id="${e.id}">Bearbeiten</button></td></tr>`; })}</tbody></table>` : html`<p class="small muted" style="margin-top:6px">Noch keine Termine.</p>`}</div>
    <div><h3>Planungsdaten</h3><div class="form">
      <label class="f">Cluster${sel('cluster', Object.keys(Core.CLUSTERS).map(k => [k, clusterLabel(k)]), p.cluster, p.locked ? 'disabled' : '')}</label>
      <label class="f">Zielmuster${sel('target', [['', 'offen'], ...Core.TARGETS], p.target)}</label>
      <label class="f">Zielstufe${sel('level', [['', 'offen'], ...Core.LEVELS], p.level)}</label>
      <label class="f">Individueller Start<input type="date" data-chg="person" data-pk="${p.alias}" data-f="start" value="${p.start}" min="${yr}-01-01" max="${yr}-12-31"></label>
      <label class="f">Planungspriorität (1 zuerst)<input type="number" min="1" max="9" data-chg="person" data-pk="${p.alias}" data-f="priority" value="${p.priority}"></label>
      <label class="f" data-tip="Darf auch in einem Vorjahr liegen">Abschluss aller Doings<input type="date" data-chg="person" data-pk="${p.alias}" data-f="gate" value="${p.gate}" max="${yr}-12-31"></label>
      <label class="f">Bereich ohne Dienstplan${sel('area', Core.AREAS, p.area)}</label>
      <label class="f">Dienst ohne Dienstplan${sel('shift', Core.SHIFTS, p.shift)}</label>
    </div>
    <div class="stack" style="gap:8px;margin-top:10px">
      <label class="c"><input type="checkbox" data-chg="person" data-pk="${p.alias}" data-f="confirmed" ${p.confirmed ? raw('checked') : ''}> Individuelle Voraussetzungen bestätigt</label>
      <label class="c"><input type="checkbox" data-chg="person" data-pk="${p.alias}" data-f="locked" ${p.locked ? raw('checked') : ''}> Gesperrt – keine neuen Maßnahmen, Cluster nicht änderbar</label>
      ${route && route.includes(Core.LOGBOOK) ? html`<div class="row small"><span class="ink2">Logbook-Tage M1 / M2 / M3</span>${[0, 1, 2].map(j => html`<input type="number" class="w60" min="0" max="260" data-chg="person" data-pk="${p.alias}" data-f="rot${j}" value="${p.rotation ? rot[j] : ''}" placeholder="–" aria-label="Logbook-Tage ${Core.AREAS[j]}">`)}
        ${p.rotation ? html`<button class="btn sm" data-act="person-rot-clear" data-pk="${p.alias}">Rotation entfernen</button>` : html`<span class="muted">leer = alle Tage im eigenen Bereich</span>`}</div>` : ''}
      ${route && route.length ? html`<div class="row small" data-tip="Tage, die vor diesem Planungsjahr bereits erbracht wurden. Der Planer verteilt nur den Rest. Beim Anlegen eines Folgejahres wird der Wert automatisch übernommen."><span class="ink2">Vorleistung aus Vorjahren (Tage)</span>${route.map(t => html`<label class="c">${TSHORT[t] || t}<input type="number" class="w60" min="0" max="999" data-chg="person" data-pk="${p.alias}" data-f="credit:${t}" value="${Core.creditOf(p, t) || ''}" placeholder="–" aria-label="Vorleistung ${t}"></label>`)}</div>` : ''}
    </div></div>
    <div class="row noprint">${route ? html`<button class="btn sm" data-act="route-person" data-pk="${p.alias}">Individuellen Weg bearbeiten</button>` : ''}<span class="sp"></span><button class="btn sm danger" data-act="person-delete" data-pk="${p.alias}">Person entfernen</button></div>` };
}
CHG.person = t => {
  const p = P(t.dataset.pk), f = t.dataset.f; if (!p) return;
  const yr = String(S.meta.year); let v = t.type === 'checkbox' ? t.checked : t.value;
  if (f === 'start' && v && (!Core.validDate(v) || !v.startsWith(yr))) { render(); return toast('Datum muss im Jahr ' + yr + ' liegen', 'crit'); }
  if (f === 'gate' && v && (!Core.validDate(v) || v > yr + '-12-31')) { render(); return toast('Datum darf nicht nach dem Jahr ' + yr + ' liegen', 'crit'); }
  if (f === 'cluster' && p.locked) { render(); return toast('Gesperrte Person: Cluster nicht änderbar', 'crit'); }
  commit('Person gespeichert – für neue Terminverteilung „Neu berechnen“', () => {
    if (f.startsWith('rot')) { const r = p.rotation ? p.rotation.slice() : [0, 0, 0]; r[+f.slice(3)] = Core.clamp(Math.round(+v || 0), 0, 260); p.rotation = r; }
    else if (f.startsWith('credit:')) { const c = Core.normCredit({ ...(p.credit || {}), [f.slice(7)]: +v || 0 }); if (c) p.credit = c; else delete p.credit; }
    else if (f === 'priority') p.priority = Core.clamp(Math.round(+v) || 3, 1, 9);
    else if (f === 'locked') { p.locked = v; if (!v && p.cluster === 'ausgeschlossen') p.cluster = 'offen'; }
    else p[f] = v;
    if (f === 'cluster') { p.target = ''; p.level = ''; p.confirmed = false; delete p.rotation; delete p.customRoute; delete p.targetAssumed; delete p.credit; if (v === 'ausgeschlossen') p.locked = true; }
    if (f === 'target') delete p.targetAssumed;
  });
};
ACT['person-rot-clear'] = t => commit('Rotation entfernt', () => { delete P(t.dataset.pk).rotation; });
ACT['route-person'] = t => { const p = P(t.dataset.pk); UI.routeCluster = p.cluster; UI.routePerson = p.pk; closeDrawer(); go('routes'); };
ACT['person-delete'] = async t => {
  const p = P(t.dataset.pk); if (!p) return;
  if (!await confirmDlg('Person entfernen', pName(p) + ' wird mit allen Terminen, Abwesenheiten und dem Dienstplan aus dem Projekt entfernt.', 'Entfernen', true)) return;
  closeDrawer();
  commit('Person entfernt', () => { const pk = p.pk; S.people = S.people.filter(x => x.pk !== pk); S.events = S.events.filter(e => e.pk !== pk); S.absences = S.absences.filter(a => a.pk !== pk); S.report = S.report.filter(r => r.pk !== pk); delete S.roster[pk]; });
};
ACT['person-add'] = () => openModal({ title: 'Person hinzufügen', body: html`
    <div class="form"><label class="f">Personalnummer<input type="text" id="npPk" maxlength="40" autofocus></label><label class="f">Name<input type="text" id="npName" maxlength="120"></label>
      <label class="f">Organisationseinheit<input type="text" id="npOrg" maxlength="120"></label><label class="f">Cluster<select id="npCl">${opts(Object.keys(Core.CLUSTERS).map(k => [k, clusterLabel(k)]), 'offen')}</select></label></div>
    <p class="small muted">Für mehrere Personen ist der Stammdaten-Import unter „Daten & Datenschutz“ schneller.</p>`,
  footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok">Hinzufügen</button>`,
  handlers: { ok: () => {
    const pk = $('#npPk').value.trim(); if (!pk) return toast('Personalnummer fehlt', 'crit'); if (IX.people.has(pk)) return toast('Personalnummer existiert bereits', 'crit');
    const np = Core.normPerson({ pk, name: $('#npName').value, org: $('#npOrg').value, cluster: $('#npCl').value }); closeModal();
    commit('Person hinzugefügt', () => { S.people.push(np); Core.assignAliases(S.people); if (S.meta.dataClass === 'empty') S.meta.dataClass = 'real'; });
    openDrawer({ kind: 'person', pk });
  } } });

// ---------- Termin ------------------------------------------------------------
function drawerEvent(e, pkNew) {
  const isNew = !e, yr = String(S.meta.year), cf = e && CONF.get(e.id), ds = e ? IX.evDays.get(e.id) || [] : [];
  const p = e ? IX.people.get(e.pk) : pkNew ? IX.people.get(pkNew) : null;
  const v = e || { type: 'Theorie', start: S.settings.start, end: S.settings.start, trainee: 1, mentor: 0, tec: 0, examiner: 0, title: '' };
  const cand = S.people.filter(x => !Core.isLocked(x)).slice().sort((a, b) => collator.compare(sortKey(a), sortKey(b)));
  const numF = (id, label, val) => html`<label class="f">${label}<input type="number" id="${id}" min="0" max="5" step="0.1" value="${val}"></label>`;
  return { title: isNew ? 'Neuer Termin' : (e.title || e.type), body: html`
    ${e ? html`<div class="row">${pill(originOf(e), e.auto ? '' : 'info')}${e.partial ? pill('Teilweg', 'warn') : ''}${cf && cf.hard.length ? pill('Konflikt', 'crit') : ''}<span class="small muted">${ds.length} Ausbildungstage</span></div>` : ''}
    ${cf && cf.hard.length ? html`<div class="note crit"><b>Konflikt:</b> ${cf.hard.map(([r, c]) => r + ' (' + c + (c === 1 ? ' Tag' : ' Tage') + ')').join(' · ')}</div>` : ''}
    ${cf && cf.soft.length ? html`<div class="note warn">${cf.soft.map(([r, c]) => r + ': ' + c + (c === 1 ? ' Tag' : ' Tage')).join(' · ')}</div>` : ''}
    <div class="form">
      <label class="f" style="grid-column:1/-1">Person${e ? html`<input type="text" value="${pName(p)}" disabled>` : html`<select id="evPk">${opts(cand.map(x => [x.alias, pName(x) + ' · ' + personMeta(x)]), p ? p.alias : '')}</select>`}</label>
      <label class="f">Maßnahme<select id="evType">${opts([...Core.TYPES, 'Sonstiges'], v.type)}</select></label>
      <label class="f">Bezeichnung (optional)<input type="text" id="evTitle" maxlength="80" value="${v.title || ''}" placeholder="z. B. Kursname"></label>
      <label class="f">Beginn<input type="date" id="evStart" value="${v.start}" min="${yr}-01-01" max="${yr}-12-31"></label>
      <label class="f">Ende<input type="date" id="evEnd" value="${v.end}" min="${yr}-01-01" max="${yr}-12-31"></label>
      ${numF('evTrainee', 'Teilnehmerverlust je Tag', v.trainee)}${numF('evMentor', 'Mentor je Tag', v.mentor)}${numF('evTec', 'TEC je Tag', v.tec)}${numF('evExaminer', 'Prüfer je Tag', v.examiner)}
    </div>
    <p class="small ink2">${e && e.dates ? 'Dieser Termin liegt auf ' + ds.length + ' einzelnen Tagen. Bleibt der Zeitraum unverändert, bleiben diese Tage erhalten; bei geändertem Zeitraum gelten alle Arbeitstage zwischen Beginn und Ende.' : 'Es zählen alle Arbeitstage (Mo–Fr, ohne Feiertage) zwischen Beginn und Ende.'} Speichern fixiert den Termin: Er bleibt bei jeder Neuberechnung stehen und zählt zum Ausbildungsweg.</p>
    <div class="row"><button class="btn primary" data-act="event-save" data-id="${e ? e.id : ''}">${isNew ? 'Termin anlegen' : 'Speichern und fixieren'}</button>
      ${e && !e.auto ? html`<button class="btn" data-act="event-unfix" data-id="${e.id}" data-tip="Der Termin wird bei der nächsten Neuberechnung wieder frei verteilt">Fixierung lösen</button>` : ''}
      <span class="sp"></span>${e ? html`<button class="btn danger" data-act="event-delete" data-id="${e.id}">Löschen</button>` : ''}</div>
    ${e ? html`<div class="row small"><button class="btn sm" data-act="person-open" data-pk="${pidOf(e.pk)}">Zur Person</button><button class="btn sm" data-act="day-open" data-d="${IX.cal.idx(e.start)}">Kapazität am ${fmtS(e.start)}</button></div>` : ''}` };
}
ACT['event-new'] = t => openDrawer({ kind: 'event-new', pk: P(t.dataset.pk || '')?.pk || '' });
ACT['event-save'] = t => {
  const old = t.dataset.id ? IX.evById.get(t.dataset.id) : null, pk = old ? old.pk : P($('#evPk').value)?.pk, p = IX.people.get(pk), yr = String(S.meta.year);
  if (!p || Core.isLocked(p)) return toast('Person fehlt oder ist ausgeschlossen', 'crit');
  const e = { id: old ? old.id : Core.uid(), pk, type: $('#evType').value, start: $('#evStart').value, end: $('#evEnd').value, auto: false,
    trainee: +$('#evTrainee').value, mentor: +$('#evMentor').value, tec: +$('#evTec').value, examiner: +$('#evExaminer').value, target: old ? old.target : p.target || '' };
  const title = $('#evTitle').value.trim(); if (title) e.title = title;
  if (!Core.validDate(e.start) || !Core.validDate(e.end) || e.end < e.start || !e.start.startsWith(yr) || !e.end.startsWith(yr)) return toast('Zeitraum prüfen: Beginn und Ende müssen im Jahr ' + yr + ' liegen', 'crit');
  if ([e.trainee, e.mentor, e.tec, e.examiner].some(x => !Number.isFinite(x) || x < 0 || x > 5)) return toast('Verlustfaktoren müssen zwischen 0 und 5 liegen', 'crit');
  if (old && old.start === e.start && old.end === e.end) { if (old.dates) e.dates = old.dates; if (old.dayAreas) e.dayAreas = old.dayAreas; }
  if (old && old.courseKind) e.courseKind = old.courseKind;
  commit(old ? 'Termin gespeichert und fixiert' : 'Termin angelegt', () => { S.events = S.events.filter(x => x.id !== e.id).concat(e); });
  UI.drawer = { kind: 'event', id: e.id }; renderDrawer();
};
ACT['event-delete'] = t => { closeDrawer(); commit('Termin gelöscht', () => { S.events = S.events.filter(e => e.id !== t.dataset.id); }); };
ACT['event-unfix'] = t => commit('Fixierung gelöst – der Termin wird bei der nächsten Neuberechnung neu verteilt', () => { const e = S.events.find(x => x.id === t.dataset.id); e.auto = true; delete e.synthetic; });
ACT['event-fix'] = t => commit('Termin fixiert', () => { const e = S.events.find(x => x.id === t.dataset.id); e.auto = false; });

// ---------- Tag ------------------------------------------------------------------
function drawerDay(d) {
  const evs = IX.evByDay[d], areas = [0, 1, 2].filter(a => a === 0 || [0, 1, 2].some(s => { const k = a * 3 + s; return IX.cap.known[k][d] || IX.cap.src[k][d] === 2 || IX.cap.gross[k][d] > 0 || IX.load.loss[k][d] > 0; }));
  const absent = [];
  S.people.forEach((p, i) => { if (IX.abs[i][d] && IX.ros[i][d] >= 2) absent.push([p, IX.abs[i][d], IX.ros[i][d] - 2]); });
  const delta = v => html`<span class="${v < -EPS ? 'down' : 'muted'}">${sgn(v)}</span>`;
  return { title: dayLabel(d), head: html`<span class="muted small nowrap">KW ${Core.isoWeek(IX.cal.iso[d])}</span><button class="btn sm" data-act="day-open" data-d="${Math.max(0, d - 1)}" aria-label="Vorheriger Tag">‹</button><button class="btn sm" data-act="day-open" data-d="${Math.min(IX.n - 1, d + 1)}" aria-label="Nächster Tag">›</button>`, body: html`
    ${dayFlags(d) ? html`<div class="row">${dayFlags(d).split(' · ').map(f => pill(f))}</div>` : ''}
    ${areas.map(a => html`<div><h3>Kapazität ${Core.AREAS[a]}</h3><table class="tbl"><thead><tr><th></th>${Core.SHIFTS.map(s => html`<th class="n">${s}</th>`)}</tr></thead><tbody>
      ${(() => { const cs = [0, 1, 2].map(s => Core.capInfo(IX, d, a * 3 + s)); const row = (label, f, cls = '') => html`<tr><td class="${cls}">${label}</td>${cs.map(c => html`<td class="n ${cls}">${c.known || c.src ? f(c) : '–'}</td>`)}</tr>`;
        return [row('Laut Dienstplan', c => Number.isFinite(c.gross) ? nf(c.gross) : '–'), row('− Abwesend', c => nf(c.absent), 'muted'), row('− Krankenreserve', c => nf(c.reserve, 1), 'muted'), row('− Maßnahmen', c => nf(c.loss, 1), 'muted'),
          html`<tr><td><b>Verfügbar</b></td>${cs.map(c => html`<td class="n ${c.known ? (c.net < c.min - EPS ? 'd-crit' : c.net < c.zero - EPS ? 'd-warn' : 'd-good') : 'd-na'}"><b>${c.known ? nf(c.net, 1) : 'offen'}</b></td>`)}</tr>`,
          html`<tr><td>0-Punkt</td>${cs.map(c => html`<td class="n">${c.known ? html`${nf(c.zero)} ${delta(c.net - c.zero)}` : '–'}</td>`)}</tr>`,
          html`<tr><td>Minimum</td>${cs.map(c => html`<td class="n">${c.known ? html`${nf(c.min)} ${delta(c.net - c.min)}` : '–'}</td>`)}</tr>`,
          row('davon Mentor / TEC / Prüfer', c => nf(c.mentor, 1) + ' / ' + nf(c.tec, 1) + ' / ' + nf(c.exam, 1), 'muted')]; })()}</tbody></table></div>`)}
    <div><h3>Maßnahmen an diesem Tag (${evs.length})</h3>
      ${evs.length ? html`<table class="tbl"><tbody>${evs.slice().sort((x, y) => x.type < y.type ? -1 : 1).map(e => { const i = IX.pi.get(e.pk), k = i === undefined ? -1 : Core.assign(IX, i, d);
        return html`<tr><td><i class="sw ${tcls(e.type)}"></i> ${e.title || e.type}</td><td>${nameOf(e.pk)}</td><td class="muted">${k >= 0 ? Core.kShift(Core.eventK(IX, e, d, k)) : 'kein Dienst'}</td><td class="n">${nf(Core.num(e.trainee) + Core.num(e.mentor) + Core.num(e.tec) + Core.num(e.examiner), 1)}</td><td><button class="btn sm" data-act="event-open" data-id="${e.id}">Öffnen</button></td></tr>`; })}</tbody></table>` : html`<p class="small muted">Keine Maßnahmen.</p>`}</div>
    <div><h3>Abwesend im Dienst (${absent.length})</h3>
      ${absent.length ? html`<p class="small ink2">${Core.SHIFTS.map((s, si) => s + ': ' + absent.filter(x => x[2] % 3 === si).length).join(' · ')}</p>
        <details><summary class="small">Personen anzeigen</summary><table class="tbl"><tbody>${absent.map(([p, t, k]) => html`<tr><td>${pName(p)}</td><td class="muted">${Core.ABS_TYPES[t - 1]}</td><td class="muted">${Core.kShift(k)}</td></tr>`)}</tbody></table></details>` : html`<p class="small muted">Niemand abwesend.</p>`}</div>` };
}
