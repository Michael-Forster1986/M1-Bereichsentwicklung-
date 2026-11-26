import * as Core from '../../core/index.js';
import { $, html, raw } from '../dom.js';
import { TSHORT, nf, opts, pill, tcls, tclsBase, tname } from '../format.js';
import { IX, P, PROG, S, UI, collator, commit, pName, sortKey } from '../state.js';
import { closeModal, confirmDlg, openModal, toast } from '../dialogs.js';
import { ACT, CHG, VIEWS } from '../registry.js';
import { go, render } from '../shell.js';
import { hideTip } from '../tooltip.js';
import { trace } from '../../platform/desktop.js';

/* ==========================================================================
 * Ansicht · Ausbildungswege
 * Oben alle Wege auf einen Blick, darunter der gewählte Weg als Ablauf: je Schritt eine Karte mit Dauer
 * und dem, was der Produktion an einem solchen Tag fehlt. Die Reihenfolge legt der Mensch fest – per Ziehen der
 * Kacheln oder mit den Pfeilen. Darunter der Katalog (alle Schritte mit Bezeichnung, Farbe, Art und zulässigen
 * Diensten) und die Regeln, nach denen der Planer die Wege verteilt.
 * ========================================================================== */
const RES = [['trainee', 'Teilnehmer'], ['mentor', 'Mentor'], ['tec', 'TEC'], ['examiner', 'Prüfer']];
const CFG_FIELDS = ['days', 'trainee', 'mentor', 'tec', 'examiner'];
const RULE_NAMES = { deferA320: 'A320 zurückstellen', kombiTecOnly: 'Kombikurs nur für Zielstufe TEC', autoPrep: 'Vorbereitungstag vor der ICA' };
const REPLAN = ' – für neue Terminverteilung „Neu berechnen“';
// Merkt sich für diese Sitzung, welche Wege geändert, aber noch nicht in den Jahresplan übernommen wurden:
// 'k:<Cluster>', 'p:<Personalnummer>' oder 'all' (Schritte, Dienste oder Regeln – betrifft jeden Weg).
// Ein neuer Stand oder eine vollständige Neuberechnung räumt die Merker ab.
let pending = new Set(), pendingFor = '';
function marks() {
  const key = S.meta.created + '|' + S.meta.year + '|' + ((S.planInfo && S.planInfo.at) || '');
  if (key !== pendingFor) { pending = new Set(); pendingFor = key; }
  return pending;
}
/** Weg für Cluster 5 mit Zielstufe TEC (aus den Regeln). */
const tecRoute = () => Core.rulesOf(S).tecRoute;
function routeContext() {
  const person = UI.routePerson ? IX.people.get(UI.routePerson) : null;
  const k = person && Core.ROUTE_CLUSTERS.includes(person.cluster) ? person.cluster : Core.ROUTE_CLUSTERS.includes(UI.routeCluster) ? UI.routeCluster : '1';
  const p = person && person.cluster === k ? person : null;
  // tecPerson: Person folgt dem Weg für die Zielstufe TEC, solange sie keinen eigenen Weg hat
  return { k, p, tecPerson: !!p && !p.customRoute && k === '5' && p.level === 'TEC', steps: (p && Core.routeOf(S, p)) || S.routes[k], cfg: p?.customRoute?.config || S.config[k] };
}
/** Personen, deren Termine der gezeigte Weg bestimmt: die gewählte Person – oder alle planbaren im Cluster ohne eigenen Weg. */
function scopePeople() {
  const { k, p } = routeContext();
  return p ? [p] : S.people.filter(x => x.cluster === k && !Core.isLocked(x) && !x.customRoute);
}
const scopeKey = () => { const { k, p } = routeContext(); return p ? 'p:' + p.pk : 'k:' + k; };
const STATE_TEXT = { complete: 'vollständig geplant', partial: 'teilweise geplant', none: 'noch ohne Termine' };
/** Zeile über dem Ablauf: was vom gezeigten Weg im Jahresplan steht – mit dem Knopf, der ihn dorthin übernimmt. */
function planRow() {
  const { p } = routeContext(), people = scopePeople(), m = marks(), dirty = m.has(scopeKey()), n = { complete: 0, partial: 0, none: 0 };
  for (const x of people) { const s = PROG.get(x.pk)?.state; if (n[s] !== undefined) n[s]++; }
  const why = p ? (S.report.find(r => r.pk === p.pk && ['blocked', 'open', 'partial'].includes(r.status)) || {}).reason : '';
  const text = p ? (STATE_TEXT[PROG.get(p.pk)?.state] || 'nicht planbar') + (why && PROG.get(p.pk)?.state !== 'complete' ? ' – ' + why : '')
    : people.length ? nf(people.length) + (people.length === 1 ? ' Person: ' : ' Personen: ') + n.complete + ' vollständig · ' + n.partial + ' teilweise · ' + n.none + ' ohne Termine' : 'diesem Weg folgt keine planbare Person';
  return html`<div class="rt-plan ${dirty ? 'dirty' : ''}" id="rtPlan"><span><b>Im Jahresplan:</b> ${text}${dirty ? html`<br><b>Der geänderte Weg ist noch nicht übernommen</b> – der Jahresplan zeigt die bisherige Verteilung.` : ''}</span><span class="sp"></span>
      <button class="btn ${dirty ? 'primary' : ''}" data-act="route-apply" ${people.length ? '' : raw('disabled')} data-tip="Verteilt die berechneten Termine ${p ? 'dieser Person' : 'dieser Personen'} nach dem gezeigten Weg neu. Fixierte Termine und alle anderen Personen bleiben unverändert.">In den Jahresplan übernehmen</button></div>
    ${m.has('all') ? html`<div class="rt-plan dirty" id="rtPlanAll"><span><b>Schritte, Dienste oder Regeln wurden geändert.</b> Das betrifft alle Wege – der Jahresplan zeigt noch die bisherige Verteilung.</span><span class="sp"></span><button class="btn primary" data-act="plan">Alle Wege neu berechnen</button></div>` : ''}`;
}
const lossOf = c => Core.num(c?.trainee) + Core.num(c?.mentor) + Core.num(c?.tec) + Core.num(c?.examiner);
const totals = (steps, cfg) => ({ days: steps.reduce((s, t) => s + (cfg[t]?.days || 0), 0), loss: steps.reduce((s, t) => s + (cfg[t]?.days || 0) * lossOf(cfg[t]), 0) });
/** Wie eine Maßnahme im Plan liegt – steht als Kennzeichen auf jeder Schrittkarte. */
function kindOf(t) {
  const how = 'tageweise, ' + Core.shiftText(S, t);
  return Core.isCourse(S, t) ? ['Lehrgang', S.settings.courseBlocks ? 'als Block für eine Gruppe' : how, 'info']
    : t === Core.PREP ? ['Vorbereitung', 'Teilnehmer bleibt produktiv', '']
      : t === 'FitCheck' || t === 'ICA' ? ['Prüfung', how, 'warn']
        : Core.measureOf(S, t) ? ['eigener Schritt', how, 'good'] : ['im Dienst', how, 'good'];
}

/** Verkleinerter Ablauf für die Übersichtskarten: Kästchen in der Breite ihrer Dauer. */
function miniFlow(steps, cfg) {
  const total = Math.max(1, steps.reduce((s, t) => s + (cfg[t]?.days || 1), 0));
  return html`<div class="rt-mini">${steps.map(t => html`<span class="${tcls(t)}" style="flex:${Math.max(0.6, (cfg[t]?.days || 1) / total * 10)}" data-tip="${tname(t)}: ${cfg[t]?.days ?? '?'} Tage"></span>`)}</div>
    <div class="rt-mini-l">${steps.map((t, i) => html`${i ? raw('<span class="muted"> → </span>') : ''}<span>${tname(t)} <b>${cfg[t]?.days ?? '?'}</b></span>`)}</div>`;
}
function clusterCard(c, k) {
  const people = S.people.filter(p => p.cluster === c && !Core.isLocked(p)), st = { complete: 0, partial: 0, none: 0 };
  for (const p of people) { const s = PROG.get(p.pk)?.state; if (st[s] !== undefined) st[s]++; }
  const steps = S.routes[c], cfg = S.config[c], t = totals(steps, cfg), custom = people.filter(p => p.customRoute).length;
  return html`<button class="rt-card ${c === k ? 'on' : ''}" data-act="route-cluster" data-id="${c}" aria-pressed="${c === k}">
    <div class="rt-h"><b>Cluster ${c}</b><span class="pill">${nf(people.length)} ${people.length === 1 ? 'Person' : 'Personen'}</span></div>
    <div class="rt-n">${Core.CLUSTERS[c]}</div>
    ${miniFlow(steps, cfg)}
    ${c === '5' ? html`<div class="rt-sub">Zielstufe TEC:</div>${miniFlow(tecRoute(), cfg)}` : ''}
    <div class="rt-f"><span>${nf(t.days)} Tage · ${nf(t.loss, 1)} Kapazitätstage</span>
      ${people.length ? html`<span class="rt-st" data-tip="${st.complete} vollständig geplant · ${st.partial} teilweise · ${st.none} ohne Termine">${[['complete', 'var(--good)'], ['partial', 'var(--warn)'], ['none', 'var(--crit)']].filter(x => st[x[0]]).map(x => html`<i style="flex:${st[x[0]]};background:${x[1]}"></i>`)}</span>` : ''}</div>
    ${custom ? html`<div class="rt-sub">${custom} mit individuellem Weg</div>` : ''}</button>`;
}
/** Eine Schrittkarte des Ablaufs. count = Schritte im Weg; scope = 'tec' für den Weg der Zielstufe TEC (braucht mindestens einen Schritt). */
function stepCard(t, cfg, n, count, scope = '') {
  const c = cfg[t] || {}, [kind, how, cls] = kindOf(t), loss = (c.days || 0) * lossOf(c), name = tname(t), sc = scope ? raw('data-scope="' + scope + '"') : '';
  const num = (f, v, max, step, label) => html`<input type="number" min="0" max="${max}" step="${step}" data-chg="route-cfg" data-t="${t}" data-f="${f}" value="${v ?? ''}" placeholder="–" aria-label="${name}: ${label}">`;
  return html`<div class="rt-step" data-step="${t}"><div class="rt-top ${tcls(t)}"></div>
    <div class="rt-sh" data-tip="Am Kopf ziehen, um den Schritt an eine andere Stelle zu setzen"><span class="rt-no">${n}</span><b>${name}</b><span class="rt-mv">
      <button class="btn ghost sm" data-act="route-move" data-t="${t}" data-dir="-1" ${sc} ${n > 1 ? '' : raw('disabled')} aria-label="${name} eine Stelle nach vorn">◀</button>
      <button class="btn ghost sm" data-act="route-move" data-t="${t}" data-dir="1" ${sc} ${n < count ? '' : raw('disabled')} aria-label="${name} eine Stelle nach hinten">▶</button></span>
      <button class="btn ghost sm" data-act="route-remove" data-t="${t}" ${sc} ${scope && count < 2 ? raw('disabled') : ''} aria-label="${name} aus dem Weg nehmen" data-tip="Schritt aus dem Weg nehmen">✕</button></div>
    <div class="rt-kind"><span class="pill ${cls}">${kind}</span><span class="muted xs">${how}</span></div>
    <label class="rt-days">${num('days', c.days, 260, 1, 'Arbeitstage')}<span>Arbeitstage</span></label>
    <div class="rt-loss"><div class="xs muted">Es fehlen der Produktion je Tag (in Köpfen):</div>
      <div class="rt-res">${RES.map(([f, label]) => html`<label><span>${label}</span>${num(f, c[f], 5, 0.1, label + ' je Tag')}</label>`)}</div></div>
    <div class="rt-sum">${c.days ? html`= <b>${nf(loss, 1)}</b> Kapazitätstage` : html`<span style="color:var(--crit-ink)">Dauer fehlt – so nicht planbar</span>`}</div></div>`;
}
const arrow = () => raw('<span class="rt-arrow" aria-hidden="true">→</span>');
const prepHint = () => html`<div class="rt-hint"><b>+ 1 Tag Vorbereitung</b><span>liegt automatisch vor der ICA, bindet nur Prüfer oder TEC – der Teilnehmer bleibt produktiv</span></div>`;

/** Katalog: alle Maßnahmen mit ihren zulässigen Diensten. Jeder Schritt lässt sich ändern; eigene Schritte lassen sich anlegen und entfernen. */
function catalog() {
  const tec = tecRoute();
  const row = t => {
    const m = Core.measureOf(S, t), e = Core.editOf(S, t), name = tname(t), sh = Core.shiftsOf(S, t), course = Core.isCourse(S, t), used = Core.ROUTE_CLUSTERS.filter(k => S.routes[k].includes(t)).map(String);
    if (tec.includes(t) && !used.includes('5')) used.push('5 (Zielstufe TEC)');
    return html`<tr><td><i class="sw ${tcls(t)}"></i> <b>${name}</b> ${m ? pill('eigener Schritt', 'info') : e ? html`<span class="pill" data-tip="Vorgabe: ${t}">angepasst</span>` : ''}</td>
      <td>${course ? 'Lehrgang' : t === Core.PREP ? 'Vorbereitung' : 'im Dienst'}</td>
      ${Core.SHIFTS.map((s, i) => html`<td class="c"><input type="checkbox" data-chg="shift" data-t="${t}" data-i="${i}" ${sh[i] ? raw('checked') : ''} aria-label="${name} im ${s}dienst"></td>`)}
      <td class="small ink2">${used.length ? 'Cluster ' + used.join(', ') : html`<span class="muted">in keinem Weg</span>`}</td>
      <td class="nowrap"><button class="btn sm" data-act="measure-edit" data-t="${t}" aria-label="${name} ändern">Ändern</button>${m ? html` <button class="btn sm danger" data-act="measure-remove" data-t="${t}">Entfernen</button>` : ''}</td></tr>`;
  };
  const changed = Object.keys(S.settings.shifts || {}).length;
  return html`<div class="card" id="msCard" style="margin-top:14px">
    <div class="row"><h3 style="font-size:16px;font-weight:650">Schritte und Dienste</h3><span class="sp"></span>
      ${changed ? html`<button class="btn" data-act="shift-reset">Dienste auf Vorgabe setzen</button>` : ''}<button class="btn primary" data-act="measure-new">Neuen Schritt anlegen</button></div>
    <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 12px">Hier legen Sie fest, in welchen Diensten eine Maßnahme stattfinden darf – das gilt für alle Cluster. Der Planer, das Ablegen im Jahresplan und die Konfliktprüfung richten sich danach. Über „Ändern“ passen Sie Bezeichnung, Kürzel, Farbe und Art an – auch bei den vorgegebenen Schritten. Vorgabe: Logbook in jedem Dienst, alles andere nur im Frühdienst.</div>
    <div class="tblwrap"><table class="tbl ms-tbl"><thead><tr><th>Maßnahme</th><th>Art</th>${Core.SHIFTS.map(s => html`<th class="c">${s}</th>`)}<th>Im Weg von</th><th></th></tr></thead>
      <tbody>${Core.typesOf(S).map(row)}</tbody></table></div>
    <p class="small muted" style="margin-top:8px">${S.settings.courseBlocks ? 'Lehrgänge laufen als Block: Ihre Tage bestimmt der Lehrgangstermin, die Dienstregel gilt dort nicht. ' : ''}Nach einer Änderung verteilt „Neu berechnen“ die berechneten Termine neu; fixierte Termine außerhalb der zulässigen Dienste erscheinen als Konflikt im Bericht.</p></div>`;
}
/**
 * Dialog für einen Schritt. m = eigener Schritt (ändern) oder null (neu anlegen); b = Name einer festen Maßnahme (anpassen).
 * Bei festen Maßnahmen bleibt der Name der Schlüssel in Terminen und Dateien; geändert wird nur die Anzeige.
 */
function measureDialog(m, b = '') {
  const { k, p } = routeContext(), key = b || (m ? m.name : ''), e = b ? Core.editOf(S, b) || {} : null;
  const sh = key ? Core.shiftsOf(S, key) : [true, false, false], isC = key ? Core.isCourse(S, key) : false;
  const color = b ? (e.color || 0) : m ? m.color : ((S.measures || []).length % Core.MEASURE_COLORS) + 1;
  const num = (id, v, max, step, label) => html`<label class="f">${label}<input type="number" id="${id}" min="0" max="${max}" step="${step}" value="${v}"></label>`;
  const usage = key ? Core.measureUsage(S, key) : null, used = !!usage && (usage.events > 0 || usage.courses > 0), locked = (b && Core.kindFixed(b)) || used;
  const deviates = !!b && (Object.keys(e).length > 0 || !!(S.settings.shifts || {})[b]), keepKind = !!b && e.course !== undefined && used;
  openModal({ title: key ? 'Schritt ändern · ' + tname(key) : 'Neuen Schritt anlegen', wide: true, body: html`
    <div class="form">
      <label class="f">Bezeichnung<input type="text" id="msName" maxlength="40" value="${b ? tname(b) : m ? m.name : ''}" ${m ? raw('disabled') : b ? '' : raw('autofocus')} placeholder="${b || 'z. B. Human Factors'}"></label>
      <label class="f" data-tip="Steht auf schmalen Balken im Jahresplan">Kürzel<input type="text" id="msShort" maxlength="12" value="${b ? (e.short || '') : m ? m.short : ''}" placeholder="${b ? TSHORT[b] || b : 'z. B. HF'}"></label></div>
    ${b ? html`<p class="small muted" style="margin-top:6px">Vorgabe: <b>${b}</b>. Ein leeres Feld stellt die Vorgabe wieder her. Excel-Listen erkennen die Maßnahme unter beiden Namen.</p>` : ''}
    <div class="f ms-f" style="margin-top:10px">Farbe<div class="ms-colors" role="radiogroup" aria-label="Farbe">
      ${b ? html`<label><input type="radio" name="msColor" value="0" ${color ? '' : raw('checked')} aria-label="Farbe der Vorgabe"><i class="${tclsBase(b)}"></i><span>Vorgabe</span></label>` : ''}
      ${Array.from({ length: Core.MEASURE_COLORS }, (_, i) => html`<label><input type="radio" name="msColor" value="${i + 1}" ${i + 1 === color ? raw('checked') : ''} aria-label="Farbe ${i + 1}"><i class="t-x${i + 1}"></i></label>`)}</div></div>
    <div class="f ms-f" style="margin-top:10px">Art
      <label class="c"><input type="radio" name="msKind" value="0" ${isC ? '' : raw('checked')} ${locked ? raw('disabled') : ''}> <span><b>Einzeln im Dienst</b> – die Tage werden wie Logbook oder FitCheck auf zulässige Diensttage verteilt</span></label>
      <label class="c"><input type="radio" name="msKind" value="1" ${isC ? raw('checked') : ''} ${locked ? raw('disabled') : ''}> <span><b>Lehrgang</b> – zusammenhängender Block für eine Gruppe; Termine planen Sie unter „Lehrgänge“</span></label>
      ${b && Core.kindFixed(b) ? html`<span class="small muted">Die Art steht fest: Vorbereitung und ICA gehören zur Prüfung und liegen immer einzeln im Dienst.</span>`
        : used ? html`<span class="small muted">Die Art lässt sich nicht mehr ändern, weil es bereits Termine oder Lehrgänge dieser Maßnahme gibt.</span>` : ''}</div>
    <div class="f ms-f" style="margin-top:10px">Zulässige Dienste<div class="row">${Core.SHIFTS.map((s, i) => html`<label class="c"><input type="checkbox" id="msS${i}" ${sh[i] ? raw('checked') : ''}> ${s}</label>`)}</div></div>
    ${key ? '' : html`<h3 style="font-size:13.5px;font-weight:650;margin:14px 0 6px">Vorgabe für alle Cluster <span class="muted" style="font-weight:400">· je Cluster auf der Schrittkarte änderbar</span></h3>
      <div class="form" style="grid-template-columns:repeat(5,minmax(0,1fr))">${num('msDays', 1, 260, 1, 'Arbeitstage')}${num('msTrainee', 1, 5, 0.1, 'Teilnehmer fehlt')}${num('msMentor', 0, 5, 0.1, 'Mentor')}${num('msTec', 0, 5, 0.1, 'TEC')}${num('msExam', 0, 5, 0.1, 'Prüfer')}</div>
      <label class="c" style="margin-top:10px"><input type="checkbox" id="msAdd" checked> <span>Gleich in den ${p ? 'individuellen Weg von ' + pName(p) : 'Weg von Cluster ' + k} aufnehmen (am Ende – danach verschiebbar)</span></label>`}`,
    footer: html`${deviates ? html`<button class="btn" data-act="m:reset" style="margin-right:auto">Auf Vorgabe zurücksetzen</button>` : ''}<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok">${key ? 'Speichern' : 'Schritt anlegen'}</button>`,
    handlers: {
      reset: () => { closeModal(); marks().add('all'); commit('„' + b + '“ steht wieder auf der Vorgabe' + (keepKind ? ' – die Art bleibt, weil es bereits Termine oder Lehrgänge gibt' : ''), () => { Core.resetBuiltin(S, b); }); },
      ok: () => {
        // alle Eingaben lesen, solange der Dialog noch steht
        const shifts = [0, 1, 2].map(i => $('#msS' + i).checked), course = document.querySelector('input[name=msKind]:checked').value === '1', colorNow = +document.querySelector('input[name=msColor]:checked').value, short = $('#msShort').value;
        if (!shifts.some(Boolean)) return toast('Mindestens ein Dienst muss zulässig sein', 'crit');
        if (b) {
          const label = $('#msName').value.replace(/\s+/g, ' ').trim();
          if (label && label !== b) { const issue = Core.measureNameIssue(S, label, b); if (issue) return toast(issue, 'crit'); }
          closeModal(); if (shifts.join() !== sh.join() || (!locked && course !== isC)) marks().add('all');
          return commit('Schritt „' + (label || b) + '“ geändert', () => { Core.editBuiltin(S, b, { label, short, color: colorNow, ...(locked ? {} : { course }) }); Core.setShifts(S, b, shifts); });
        }
        if (m) { closeModal(); if (shifts.join() !== sh.join() || (!locked && course !== isC)) marks().add('all'); return commit('Schritt „' + m.name + '“ geändert', () => { Core.editMeasure(S, m.name, { short, color: colorNow, ...(locked ? {} : { course }) }); Core.setShifts(S, m.name, shifts); }); }
        const name = $('#msName').value, issue = Core.measureNameIssue(S, name);
        if (issue) return toast(issue, 'crit');
        const n = id => Number(String($(id).value).replace(',', '.')), days = n('#msDays'), f = { trainee: n('#msTrainee'), mentor: n('#msMentor'), tec: n('#msTec'), examiner: n('#msExam') };
        if (!Number.isInteger(days) || days < 1 || days > 260 || Object.values(f).some(v => !Number.isFinite(v) || v < 0 || v > 5)) return toast('Ungültiger Wert: Tage 1–260 (ganzzahlig), Faktoren 0–5', 'crit');
        const add = $('#msAdd').checked; closeModal();
        routeEdit('Schritt „' + name.trim() + '“ angelegt' + (add ? ' und in den Weg aufgenommen' : '') + REPLAN, r => {
          const made = Core.addMeasure(S, { name, short, color: colorNow, course, shifts }, { days, ...f });
          if (add) { r.config[made.name] = r.config[made.name] || { days, ...f }; r.steps = Core.insertStep(r.steps, made.name); }
        }, add);
      }
    } });
}

/** Regeln, nach denen der Planer die Wege verteilt – jede lässt sich ändern; gespeichert wird nur die Abweichung von der Vorgabe. */
function rulesCard() {
  const r = Core.rulesOf(S), own = S.settings.rules || {}, mark = key => key in own ? html` <span class="pill warn"><i></i>geändert</span>` : '';
  const sw = (key, text) => html`<tr><td><b>${RULE_NAMES[key]}</b>${mark(key)}<div class="small ink2">${text}</div></td>
    <td><label class="c"><input type="checkbox" data-chg="rule" data-k="${key}" ${r[key] ? raw('checked') : ''} aria-label="${RULE_NAMES[key]}"> <span>${r[key] ? 'gilt' : 'gilt nicht'}</span></label></td><td class="small ink2">gilt</td></tr>`;
  return html`<div class="card" id="rulesCard" style="margin-top:14px">
    <div class="row"><h3 style="font-size:16px;font-weight:650">Regeln der Planung</h3><span class="sp"></span>${Core.rulesChanged(S) ? html`<button class="btn" data-act="rules-reset">Regeln auf Vorgabe setzen</button>` : ''}</div>
    <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 12px">Nach diesen Regeln verteilt der Planer die Wege. Die Vorgabe stammt aus der Vorgängerversion; jede Regel lässt sich hier ändern. Dauer und Betreuung der einzelnen Schritte ändern Sie oben auf den Schrittkarten.</div>
    <div class="tblwrap"><table class="tbl rules-tbl"><thead><tr><th>Regel</th><th>Einstellung</th><th>Vorgabe</th></tr></thead><tbody>
      <tr><td><b>${tname(Core.FRAME_TYPE)}-Lehrgang als Voraussetzung</b>${mark('frame')}<div class="small ink2">Der Weg dieser Cluster beginnt erst nach dem ${tname(Core.FRAME_TYPE)}-Lehrgang – oder nach dem Datum „Abschluss aller Doings“, das bei der Person eingetragen ist.</div></td>
        <td><div class="row">${Core.ROUTE_CLUSTERS.map(c => html`<label class="c"><input type="checkbox" data-chg="rule-frame" data-k="${c}" ${r.frame.includes(c) ? raw('checked') : ''} aria-label="Voraussetzung für Cluster ${c}"> ${c}</label>`)}</div></td><td class="small ink2">Cluster 3 und 4B</td></tr>
      <tr><td><b>Weg für die Zielstufe TEC</b>${mark('tecRoute')}<div class="small ink2">Personen in Cluster 5 mit Zielstufe TEC folgen diesem Weg statt dem des Clusters.</div></td>
        <td><span id="ruleTec">${r.tecRoute.map(tname).join(' → ')}</span> <button class="btn sm" data-act="rule-tec-edit">Bearbeiten</button></td><td class="small ink2">${Core.DEFAULT_RULES.tecRoute.map(tname).join(' → ')}</td></tr>
      ${sw('deferA320', 'Personen in Cluster 5 mit Zielmuster A320 werden nicht geplant; im Planungsbericht stehen sie als offen.')}
      ${sw('kombiTecOnly', 'Das Zielmuster „A350/A380 Kombikurs“ wird nur zusammen mit der Zielstufe TEC geplant.')}
      ${sw('autoPrep', 'Vor jeder neu geplanten ICA liegt automatisch ein Tag Vorbereitung. Er bindet nur Prüfer oder TEC, der Teilnehmer bleibt produktiv.')}
    </tbody></table></div>
    <p class="small muted" style="margin-top:8px">Nach einer Änderung verteilt „Neu berechnen“ die berechneten Termine neu. Die Regeln gelten für dieses Planungsjahr und ziehen beim Jahreswechsel mit um.</p></div>`;
}
/** Werte der Vorgabe je Cluster zum Vergleich – mit Kennzeichen, wo der aktuelle Stand davon abweicht. */
function defaultsCard() {
  const def = Core.defaultConfig(), same = k => S.routes[k].join('|') === Core.DEFAULT_ROUTES[k].join('|') && Core.TYPES.every(t => CFG_FIELDS.every(f => (S.config[k][t]?.[f] ?? null) === (def[k][t][f] ?? null)));
  const line = (k, steps) => steps.map(t => tname(t) + ' ' + nf(def[k][t].days) + ' T').join(' → ');
  return html`<div class="card" id="defCard"><h3>Werte der Vorgabe</h3><div class="sub">Zum Vergleich – geändert wird oben auf den Schrittkarten</div>
    <ul class="hints">${Core.ROUTE_CLUSTERS.map(k => { const ok = same(k), d = Core.DEFAULT_ROUTES[k]; return html`<li><span class="ic ${ok ? 'good' : 'warn'}">${ok ? '✓' : '!'}</span><span><b>Cluster ${k}:</b> ${line(k, d)}${d.includes(Core.LOGBOOK) ? ' · Mentor im Logbook ' + nf(def[k][Core.LOGBOOK].mentor, 1) : ''}${k === '5' ? html`<br>Zielstufe TEC: ${line(k, Core.DEFAULT_RULES.tecRoute)}` : ''}
      ${ok ? '' : html`<br><span class="small" style="color:var(--warn-ink)">Der aktuelle Stand weicht ab.</span> <button class="btn sm" data-act="route-reset-cluster" data-k="${k}">Zurücksetzen</button>`}</span></li>`; })}
      <li><span class="ic">i</span><span>T = Arbeitstage. Vorleistungen aus Vorjahren tragen Sie bei der Person ein.</span></li></ul></div>`;
}

VIEWS.routes = {
  render() {
    const { k, p, tecPerson, steps, cfg } = routeContext(), rules = Core.rulesOf(S), tec = rules.tecRoute, all = Core.typesOf(S);
    const inCluster = S.people.filter(x => x.cluster === k && !Core.isLocked(x)).slice().sort((a, b) => collator.compare(sortKey(a), sortKey(b)));
    const t = totals(steps, cfg), free = all.filter(x => !steps.includes(x)), needsPrep = list => rules.autoPrep && list.includes('ICA') && !list.includes(Core.PREP);
    const tecT = totals(tec, cfg), tecFree = all.filter(x => !tec.includes(x)), tecChanged = !!(S.settings.rules && S.settings.rules.tecRoute);
    const bar = list => { const total = Math.max(1, list.reduce((s, x) => s + (cfg[x]?.days || 0), 0)); return html`<div class="rt-bar">${list.filter(x => cfg[x]?.days).map(x => html`<span class="${tcls(x)}" style="flex:${cfg[x].days / total}"><b>${tname(x)}</b> ${cfg[x].days} T</span>`)}</div>`; };
    const chips = (list, scope) => list.map(x => html`<button class="chip" data-act="route-add" data-t="${x}" ${scope ? raw('data-scope="' + scope + '"') : ''}><i class="sw ${tcls(x)}"></i>${tname(x)}</button>`);
    return html`
    <div class="view-head"><div><h1>Ausbildungswege</h1><p>Jeder Cluster hat einen Weg: eine Folge von Schritten mit Dauer und dem, was der Produktion an einem solchen Tag fehlt. Der Planer verteilt genau diese Schritte in dieser Reihenfolge. Die Werte sind Planungsannahmen und fachlich zu bestätigen.</p></div></div>
    <h3 class="rt-title">Alle Wege auf einen Blick <span class="muted">· Karte anklicken zum Bearbeiten</span></h3>
    <div class="rt-grid">${Core.ROUTE_CLUSTERS.map(c => clusterCard(c, p ? '' : k))}</div>

    <div class="card" style="margin-top:16px">
      <div class="row"><h3 style="font-size:16px;font-weight:650">${p ? 'Individueller Weg · ' + pName(p) : 'Cluster ' + k + ' · ' + Core.CLUSTERS[k]}</h3><span class="sp"></span>
        <select data-chg="route-person" aria-label="Individueller Weg" style="max-width:300px"><option value="">Standard für Cluster ${k}</option>${opts(inCluster.map(x => [x.alias, pName(x) + (x.customRoute ? ' · individuell' : '')]), p ? p.alias : '')}</select>
        ${p ? html`<button class="btn" data-act="route-reset-person" ${p.customRoute ? '' : raw('disabled')}>Auf Clusterstandard zurücksetzen</button>` : html`<button class="btn" data-act="route-reset-cluster">Vorgabewerte wiederherstellen</button>`}</div>
      <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 14px">${p ? (p.customRoute ? 'Weicht vom Clusterstandard ab – gilt nur für diese Person.' : 'Entspricht dem Clusterstandard. Die erste Änderung legt für diese Person einen eigenen Weg an.') : nf(inCluster.length) + ' planbare Personen folgen diesem Weg. Eine einzelne Person mit abweichendem Weg wählen Sie rechts aus.'}</div>

      ${planRow()}
      ${tecPerson ? html`<div class="note" style="margin-bottom:12px">Zielstufe TEC: Es gilt der Weg für die Zielstufe TEC (${tec.map(tname).join(' → ')}). Die erste Änderung legt für diese Person einen eigenen Weg an; den Weg für alle mit Zielstufe TEC ändern Sie bei Cluster 5.</div>` : ''}
      <div class="rt-flow" data-keep="rtflow" data-sortable>${steps.map((x, i) => html`${i ? arrow() : ''}${stepCard(x, cfg, i + 1, steps.length)}`)}
        ${needsPrep(steps) ? prepHint() : ''}
        ${steps.length ? '' : html`<div class="empty" style="flex:1"><b>Dieser Weg hat noch keinen Schritt</b>Unten einen Schritt hinzufügen.</div>`}</div>
      <div class="row" style="margin-top:12px"><span class="small ink2">Schritt hinzufügen:</span>${free.length ? chips(free, '') : html`<span class="muted small">alle Maßnahmen sind im Weg</span>`}
        <button class="chip" data-act="measure-new" data-tip="Eine eigene Maßnahme anlegen – mit Dauer, Betreuung und zulässigen Diensten">＋ Neuer Schritt</button>
        <span class="small muted">Reihenfolge ändern: Kachel am Kopf ziehen oder die Pfeile ◀ ▶ nutzen.</span></div>

      <h3 class="rt-title" style="margin-top:18px">Zeitbedarf <span class="muted">· Breite entspricht den Arbeitstagen</span></h3>
      ${t.days ? bar(steps) : html`<div class="note">Noch keine Dauer hinterlegt.</div>`}
      <p class="small ink2" style="margin-top:8px"><b>${nf(t.days)} Ausbildungstage</b> je Person · <b>${nf(t.loss, 1)} Kapazitätstage</b> fehlen der Produktion insgesamt (Teilnehmer, Mentor, TEC und Prüfer zusammen)${inCluster.length && !p ? html` · für alle ${nf(inCluster.length)} Personen des Clusters ${nf(t.loss * inCluster.length)} Kapazitätstage` : ''}.</p>

      ${k === '5' && !p ? html`<h3 class="rt-title" id="tecRoute" style="margin-top:18px">Zielstufe TEC <span class="muted">· eigener Weg für Personen mit Zielstufe TEC${tecChanged ? '' : ' – Vorgabe: ' + Core.DEFAULT_RULES.tecRoute.map(tname).join(', dann ')}</span></h3>
        <div class="rt-flow" data-keep="rtflowtec" data-sortable data-scope="tec">${tec.map((x, i) => html`${i ? arrow() : ''}${stepCard(x, cfg, i + 1, tec.length, 'tec')}`)}${needsPrep(tec) ? prepHint() : ''}</div>
        <div class="row" style="margin-top:12px"><span class="small ink2">Schritt hinzufügen:</span>${tecFree.length ? chips(tecFree, 'tec') : html`<span class="muted small">alle Maßnahmen sind im Weg</span>`}
          ${tecChanged ? html`<button class="btn sm" data-act="rule-tec-reset">Auf Vorgabe setzen</button>` : ''}</div>
        <div style="margin-top:12px">${bar(tec)}</div><p class="small ink2" style="margin-top:8px"><b>${nf(tecT.days)} Ausbildungstage</b> je Person · ${nf(tecT.loss, 1)} Kapazitätstage. Die Termine der Lehrgänge planen Sie unter „Lehrgänge“.</p>` : ''}
    </div>

    ${catalog()}

    ${rulesCard()}

    <div class="grid2" style="margin-top:14px">
      <div class="card"><h3>So liest man eine Schrittkarte</h3><div class="sub">Drei Angaben je Schritt</div>
        <ul class="hints"><li><span class="ic">1</span><span><b>Arbeitstage.</b> So viele Tage braucht eine Person für diesen Schritt.</span></li>
          <li><span class="ic">2</span><span><b>Fehlende Köpfe je Tag.</b> Teilnehmer 1 heißt: die Person fehlt der Produktion ganz. Mentor 0,5 heißt: ein Mentor ist an diesem Tag zur Hälfte gebunden. Die Summe wird von der Kapazität des Dienstes abgezogen.</span></li>
          <li><span class="ic">3</span><span><b>Art des Schritts.</b> Lehrgänge laufen als Block für eine Gruppe, alle anderen Schritte liegen einzeln in den Diensten, die unter „Schritte und Dienste“ zugelassen sind.</span></li></ul></div>
      ${defaultsCard()}
    </div>`;
  }
};
ACT['route-cluster'] = t => { UI.routeCluster = t.dataset.id; UI.routePerson = ''; render(); };
CHG['route-person'] = t => { UI.routePerson = P(t.value)?.pk || ''; render(); };
/**
 * Ändert einen Weg. scope = 'tec': der Weg für die Zielstufe TEC (steht in den Regeln), sonst der gewählte Cluster oder die gewählte Person.
 * touch = false: nur den Stand ändern, ohne für die gewählte Person einen individuellen Weg anzulegen.
 */
function routeEdit(label, fn, touch = true, scope = '') {
  const { k, p } = routeContext();
  if (scope === 'tec') marks().add('k:5'); else if (touch) marks().add(p ? 'p:' + p.pk : 'k:' + k);
  commit(label, () => {
    if (scope === 'tec') { const r = { steps: tecRoute().slice(), config: S.config['5'] }; fn(r, false); Core.setRules(S, { tecRoute: r.steps }); return; }
    if (!touch) return fn({ steps: [], config: {} }, false);
    if (p) { const person = S.people.find(x => x.pk === p.pk); person.customRoute = person.customRoute || { steps: Core.clone(Core.routeOf(S, person)), config: Core.clone(S.config[k]) }; fn(person.customRoute, true); }
    else fn({ get steps() { return S.routes[k]; }, set steps(v) { S.routes[k] = v; }, config: S.config[k] }, false);
  });
}
const whereOf = scope => scope === 'tec' ? 'Weg für die Zielstufe TEC' : 'Weg';
const setStep = (type, on, scope = '') => routeEdit(tname(type) + (on ? ' in den ' + whereOf(scope) + ' aufgenommen' : ' aus dem ' + whereOf(scope) + ' genommen') + REPLAN, r => { r.steps = on ? Core.insertStep(r.steps, type) : r.steps.filter(x => x !== type); }, true, scope);
ACT['route-add'] = t => setStep(t.dataset.t, true, t.dataset.scope || '');
ACT['route-remove'] = t => setStep(t.dataset.t, false, t.dataset.scope || '');
CHG['route-cfg'] = t => {
  const f = t.dataset.f, type = t.dataset.t, v = t.value === '' ? null : Number(String(t.value).replace(',', '.'));
  if (v !== null && (!Number.isFinite(v) || v < 0 || (f === 'days' && (!Number.isInteger(v) || v > 260)) || (f !== 'days' && v > 5))) { render(); return toast('Ungültiger Wert: Tage 0–260 (ganzzahlig), Faktoren 0–5', 'crit'); }
  routeEdit('Ausbildungsweg gespeichert' + REPLAN, r => { const c = r.config[type] || (r.config[type] = { days: null, trainee: 1, mentor: 0, tec: 0, examiner: 0 }); c[f] = f === 'days' || f === 'trainee' ? v : (v ?? 0); });
};
ACT['route-reset-person'] = () => { const { p } = routeContext(); if (!p) return; marks().add('p:' + p.pk); commit('Individueller Weg zurückgesetzt', () => { delete S.people.find(x => x.pk === p.pk).customRoute; }); };
ACT['route-reset-cluster'] = async t => {
  const k = Core.ROUTE_CLUSTERS.includes(t?.dataset?.k) ? t.dataset.k : routeContext().k;
  // eigene Schritte behalten ihre Werte; zurückgesetzt werden die Schritte der Vorgabe und die Reihenfolge
  if (await confirmDlg('Vorgabewerte wiederherstellen', 'Schrittfolge und Werte für Cluster ' + k + ' werden auf die Vorgabewerte zurückgesetzt. Individuelle Wege bleiben unverändert.', 'Wiederherstellen')) { marks().add('k:' + k); commit('Cluster ' + k + ' auf Vorgabewerte gesetzt', () => { S.config[k] = { ...S.config[k], ...Core.defaultConfig()[k] }; S.routes[k] = Core.clone(Core.DEFAULT_ROUTES[k]); }); }
};
ACT['route-move'] = t => {
  const scope = t.dataset.scope || '', steps = scope === 'tec' ? tecRoute() : routeContext().steps, at = steps.indexOf(t.dataset.t), to = at + (+t.dataset.dir);
  if (at < 0 || to < 0 || to >= steps.length) return;
  routeEdit('Reihenfolge geändert' + REPLAN, r => { r.steps = Core.moveStep(r.steps, t.dataset.t, to); }, true, scope);
};

// ---------- Übernahme in den Jahresplan ---------------------------------------------
/**
 * Verteilt die berechneten Termine der Personen des gezeigten Wegs neu – nur diese. Fixierte Termine, Lehrgangsplätze
 * und die Termine aller anderen Personen bleiben stehen und zählen in der Kapazität mit.
 */
ACT['route-apply'] = () => {
  const { k, p } = routeContext(), people = scopePeople(), pks = people.map(x => x.pk), key = scopeKey();
  if (!pks.length) return toast('Diesem Weg folgt keine planbare Person', 'crit');
  let res = null;
  trace('Weg in den Jahresplan übernehmen');
  if (!commit('', () => { res = Core.replanPeople(S, IX, pks); S.events = res.events; S.report = res.report; }) || !res) return;
  marks().delete(key); render();
  const mine = res.report.filter(r => pks.includes(r.pk)), count = list => mine.filter(r => list.includes(r.status)).length;
  const full = count(['planned', 'kept']), part = count(['partial']), none = count(['blocked', 'open', 'skipped']), show = { label: 'Jahresplan zeigen', run: () => go('year') };
  if (p) { const r = mine[0] || {}; return toast((full ? 'Weg von ' + pName(p) + ' in den Jahresplan übernommen: ' : 'Weg von ' + pName(p) + (part ? ' nur teilweise planbar: ' : ' nicht planbar: ')) + (r.reason || ''), full ? '' : 'crit', show); }
  toast('Cluster ' + k + ' in den Jahresplan übernommen: ' + full + ' vollständig, ' + part + ' teilweise, ' + none + ' nicht planbar' + (part || none ? ' – die Gründe stehen im Bericht' : ''), part || none ? 'crit' : '', show);
};

// ---------- Katalog: Dienste, Schritte ändern, eigene Schritte ---------------------------------------------
CHG.shift = t => {
  const type = t.dataset.t, sh = Core.shiftsOf(S, type).slice(); sh[+t.dataset.i] = t.checked;
  if (!sh.some(Boolean)) { render(); return toast('Mindestens ein Dienst muss zulässig bleiben', 'crit'); }
  marks().add('all');
  commit(tname(type) + ' ist jetzt ' + Core.SHIFTS.filter((_, i) => sh[i]).join(', ') + ' zulässig' + REPLAN, () => Core.setShifts(S, type, sh));
};
ACT['shift-reset'] = async () => { if (await confirmDlg('Dienste auf Vorgabe setzen', 'Alle Maßnahmen gelten danach wieder wie vorgegeben: Logbook in jedem Dienst, alles andere nur im Frühdienst. Eigene Schritte bleiben erhalten.', 'Zurücksetzen')) { marks().add('all'); commit('Dienste auf Vorgabe gesetzt', () => { S.settings.shifts = {}; }); } };
ACT['measure-new'] = () => measureDialog(null);
ACT['measure-edit'] = t => { const name = t.dataset.t, m = Core.measureOf(S, name); if (m) measureDialog(m); else if (Core.isBuiltin(name)) measureDialog(null, name); };
ACT['measure-remove'] = async t => {
  const name = t.dataset.t, u = Core.measureUsage(S, name);
  if (u.events || u.courses) return toast('„' + name + '“ wird noch verwendet (' + [u.events ? u.events + ' Termine' : '', u.courses ? u.courses + ' Lehrgänge' : ''].filter(Boolean).join(', ') + ') – bitte zuerst entfernen', 'crit');
  if (await confirmDlg('Schritt „' + name + '“ entfernen', 'Der Schritt verschwindet aus dem Katalog' + (u.clusters.length ? ', aus dem Weg von Cluster ' + u.clusters.join(', ') : '') + (u.tec ? ', aus dem Weg für die Zielstufe TEC' : '') + (u.people ? ' und aus ' + u.people + ' individuellen Wegen' : '') + '. Rückgängig ist möglich.', 'Entfernen')) { if (u.clusters.length || u.tec || u.people) marks().add('all'); commit('Schritt „' + name + '“ entfernt', () => Core.removeMeasure(S, name)); }
};

// ---------- Regeln der Planung ---------------------------------------------
CHG.rule = t => {
  const key = t.dataset.k; if (!Core.RULE_SWITCHES.includes(key)) return;
  marks().add('all');
  commit('Regel „' + RULE_NAMES[key] + '“ ' + (t.checked ? 'gilt' : 'gilt nicht mehr') + REPLAN, () => { Core.setRules(S, { [key]: t.checked }); });
};
CHG['rule-frame'] = t => {
  const set = new Set(Core.rulesOf(S).frame); if (t.checked) set.add(t.dataset.k); else set.delete(t.dataset.k);
  const list = Core.ROUTE_CLUSTERS.filter(c => set.has(c));
  marks().add('all');
  commit((list.length ? 'Der ' + tname(Core.FRAME_TYPE) + '-Lehrgang ist jetzt Voraussetzung für Cluster ' + list.join(', ') : 'Der ' + tname(Core.FRAME_TYPE) + '-Lehrgang ist für keinen Cluster mehr Voraussetzung') + REPLAN, () => { Core.setRules(S, { frame: list }); });
};
ACT['rules-reset'] = async () => { if (await confirmDlg('Regeln auf Vorgabe setzen', 'Alle Regeln der Planung gelten danach wieder wie vorgegeben – auch der Weg für die Zielstufe TEC. Schritte, Dauern und Dienste bleiben unverändert.', 'Zurücksetzen')) { marks().add('all'); commit('Regeln auf Vorgabe gesetzt' + REPLAN, () => Core.resetRules(S)); } };
ACT['rule-tec-reset'] = () => { marks().add('k:5'); commit('Weg für die Zielstufe TEC auf Vorgabe gesetzt' + REPLAN, () => { Core.setRules(S, { tecRoute: Core.DEFAULT_RULES.tecRoute.slice() }); }); };
ACT['rule-tec-edit'] = () => { UI.routeCluster = '5'; UI.routePerson = ''; render(); const el = document.getElementById('tecRoute'); if (el) el.scrollIntoView({ block: 'center' }); };

// ---------- Reihenfolge per Ziehen: Kachel am Kopf greifen und an die neue Stelle setzen ---------------------
let drag = null;
const tilesOf = d => [...d.flow.querySelectorAll('.rt-step[data-step]')].filter(x => x !== d.tile);
function clearMarks(flow) { for (const x of flow.querySelectorAll('.drop-before,.drop-after,.moving')) x.classList.remove('drop-before', 'drop-after', 'moving'); }
function endDrag(cancel) {
  const d = drag; drag = null;
  if (!d) return;
  if (!d.active) return;
  clearMarks(d.flow); document.body.classList.remove('dragging');
  const eat = ev => { ev.stopPropagation(); ev.preventDefault(); };
  window.addEventListener('click', eat, { capture: true, once: true }); setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 0);
  if (cancel || d.to < 0) return;
  const steps = d.scope === 'tec' ? tecRoute() : routeContext().steps, moved = Core.moveStep(steps, d.type, d.to);
  if (moved.join('|') === steps.join('|')) return;
  trace('Ablegen: Schritt im Weg');
  routeEdit(tname(d.type) + ' steht jetzt an Stelle ' + (moved.indexOf(d.type) + 1) + REPLAN, r => { r.steps = Core.moveStep(r.steps, d.type, d.to); }, true, d.scope);
}
document.addEventListener('pointerdown', e => {
  if (drag) endDrag(true);
  if (UI.view !== 'routes' || e.button !== 0 || !e.target.closest) return;
  const grip = e.target.closest('.rt-flow[data-sortable] .rt-step[data-step] .rt-sh');
  if (!grip || e.target.closest('button,input,select,a')) return;
  const tile = grip.closest('.rt-step');
  const flow = tile.closest('.rt-flow');
  drag = { tile, flow, scope: flow.dataset.scope || '', type: tile.dataset.step, id: e.pointerId, x: e.clientX, y: e.clientY, active: false, to: -1 };
});
document.addEventListener('pointermove', e => {
  const d = drag;
  if (!d || e.pointerId !== d.id) return;
  if (!(e.buttons & 1)) return endDrag(true);
  if (!d.active) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.active = true; hideTip(); document.body.classList.add('dragging'); d.tile.classList.add('moving'); trace('Ziehen: Schritt im Weg');
  }
  e.preventDefault();
  // Zielstelle: vor der ersten Kachel, deren Mitte rechts vom Zeiger liegt – sonst ans Ende
  const tiles = tilesOf(d); let to = tiles.length;
  for (let i = 0; i < tiles.length; i++) { const r = tiles[i].getBoundingClientRect(); if (e.clientX < r.left + r.width / 2) { to = i; break; } }
  if (to === d.to) return;
  d.to = to; clearMarks(d.flow); d.tile.classList.add('moving');
  if (tiles.length) (to < tiles.length ? tiles[to] : tiles[tiles.length - 1]).classList.add(to < tiles.length ? 'drop-before' : 'drop-after');
  // am Rand des Ablaufs weiterblättern
  const fr = d.flow.getBoundingClientRect();
  if (e.clientX > fr.right - 40) d.flow.scrollLeft += 30; else if (e.clientX < fr.left + 40) d.flow.scrollLeft -= 30;
});
document.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) endDrag(false); });
document.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) endDrag(true); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && drag && drag.active) { e.stopPropagation(); endDrag(true); } }, true);
window.addEventListener('blur', () => endDrag(true));
