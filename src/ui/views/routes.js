import * as Core from '../../core/index.js';
import { $, esc, html, raw } from '../dom.js';
import { nf, opts, pill, tcls } from '../format.js';
import { IX, P, PROG, S, UI, collator, commit, pName, sortKey } from '../state.js';
import { closeModal, confirmDlg, openModal, toast } from '../dialogs.js';
import { ACT, CHG, VIEWS } from '../registry.js';
import { render } from '../shell.js';
import { hideTip } from '../tooltip.js';
import { trace } from '../../platform/desktop.js';

/* ==========================================================================
 * Ansicht · Ausbildungswege
 * Oben alle Wege auf einen Blick, darunter der gewählte Weg als Ablauf: je Schritt eine Karte mit Dauer
 * und dem, was der Produktion an einem solchen Tag fehlt. Die Reihenfolge legt der Mensch fest – per Ziehen der
 * Kacheln oder mit den Pfeilen. Darunter der Katalog: eigene Schritte und die zulässigen Dienste je Maßnahme.
 * ========================================================================== */
const TEC_ROUTE = ['Theorie', 'Praxis'];
const RES = [['trainee', 'Teilnehmer'], ['mentor', 'Mentor'], ['tec', 'TEC'], ['examiner', 'Prüfer']];
function routeContext() {
  const person = UI.routePerson ? IX.people.get(UI.routePerson) : null;
  const k = person && Core.ROUTE_CLUSTERS.includes(person.cluster) ? person.cluster : Core.ROUTE_CLUSTERS.includes(UI.routeCluster) ? UI.routeCluster : '1';
  const p = person && person.cluster === k ? person : null;
  return { k, p, steps: p?.customRoute?.steps || S.routes[k], cfg: p?.customRoute?.config || S.config[k] };
}
const lossOf = c => Core.num(c?.trainee) + Core.num(c?.mentor) + Core.num(c?.tec) + Core.num(c?.examiner);
const totals = (steps, cfg) => ({ days: steps.reduce((s, t) => s + (cfg[t]?.days || 0), 0), loss: steps.reduce((s, t) => s + (cfg[t]?.days || 0) * lossOf(cfg[t]), 0) });
/** Wie eine Maßnahme im Plan liegt – steht als Kennzeichen auf jeder Schrittkarte. */
const kindOf = t => Core.isCourse(S, t) ? ['Lehrgang', S.settings.courseBlocks ? 'als Block für eine Gruppe' : 'tageweise, ' + Core.shiftText(S, t), 'info']
  : t === Core.PREP ? ['Vorbereitung', 'Teilnehmer bleibt produktiv', '']
    : t === Core.LOGBOOK ? ['im Dienst', 'tageweise, ' + Core.shiftText(S, t), 'good']
      : Core.measureOf(S, t) ? ['eigener Schritt', 'tageweise, ' + Core.shiftText(S, t), 'good'] : ['Prüfung', 'tageweise, ' + Core.shiftText(S, t), 'warn'];

/** Verkleinerter Ablauf für die Übersichtskarten: Kästchen in der Breite ihrer Dauer. */
function miniFlow(steps, cfg) {
  const total = Math.max(1, steps.reduce((s, t) => s + (cfg[t]?.days || 1), 0));
  return html`<div class="rt-mini">${steps.map(t => html`<span class="${tcls(t)}" style="flex:${Math.max(0.6, (cfg[t]?.days || 1) / total * 10)}" data-tip="${t}: ${cfg[t]?.days ?? '?'} Tage"></span>`)}</div>
    <div class="rt-mini-l">${steps.map((t, i) => html`${i ? raw('<span class="muted"> → </span>') : ''}<span>${t} <b>${cfg[t]?.days ?? '?'}</b></span>`)}</div>`;
}
function clusterCard(c, k) {
  const people = S.people.filter(p => p.cluster === c && !Core.isLocked(p)), st = { complete: 0, partial: 0, none: 0 };
  for (const p of people) { const s = PROG.get(p.pk)?.state; if (st[s] !== undefined) st[s]++; }
  const steps = S.routes[c], cfg = S.config[c], t = totals(steps, cfg), custom = people.filter(p => p.customRoute).length;
  return html`<button class="rt-card ${c === k ? 'on' : ''}" data-act="route-cluster" data-id="${c}" aria-pressed="${c === k}">
    <div class="rt-h"><b>Cluster ${c}</b><span class="pill">${nf(people.length)} ${people.length === 1 ? 'Person' : 'Personen'}</span></div>
    <div class="rt-n">${Core.CLUSTERS[c]}</div>
    ${miniFlow(steps, cfg)}
    ${c === '5' ? html`<div class="rt-sub">Zielstufe TEC:</div>${miniFlow(TEC_ROUTE, cfg)}` : ''}
    <div class="rt-f"><span>${nf(t.days)} Tage · ${nf(t.loss, 1)} Kapazitätstage</span>
      ${people.length ? html`<span class="rt-st" data-tip="${st.complete} vollständig geplant · ${st.partial} teilweise · ${st.none} ohne Termine">${[['complete', 'var(--good)'], ['partial', 'var(--warn)'], ['none', 'var(--crit)']].filter(x => st[x[0]]).map(x => html`<i style="flex:${st[x[0]]};background:${x[1]}"></i>`)}</span>` : ''}</div>
    ${custom ? html`<div class="rt-sub">${custom} mit individuellem Weg</div>` : ''}</button>`;
}
/** Eine Schrittkarte des Ablaufs. fixed = Schritt gehört fest zum Weg (TEC): nicht entfernbar, nicht verschiebbar. count = Schritte im Weg. */
function stepCard(t, cfg, n, fixed, count = 0) {
  const c = cfg[t] || {}, [kind, how, cls] = kindOf(t), loss = (c.days || 0) * lossOf(c);
  const num = (f, v, max, step, label) => html`<input type="number" min="0" max="${max}" step="${step}" data-chg="route-cfg" data-t="${t}" data-f="${f}" value="${v ?? ''}" placeholder="–" aria-label="${t}: ${label}">`;
  return html`<div class="rt-step" ${fixed ? '' : raw('data-step="' + esc(t) + '"')}><div class="rt-top ${tcls(t)}"></div>
    <div class="rt-sh" ${fixed ? '' : raw('data-tip="Am Kopf ziehen, um den Schritt an eine andere Stelle zu setzen"')}><span class="rt-no">${n}</span><b>${t}</b>${fixed ? '' : html`<span class="rt-mv">
      <button class="btn ghost sm" data-act="route-move" data-t="${t}" data-dir="-1" ${n > 1 ? '' : raw('disabled')} aria-label="${t} eine Stelle nach vorn">◀</button>
      <button class="btn ghost sm" data-act="route-move" data-t="${t}" data-dir="1" ${n < count ? '' : raw('disabled')} aria-label="${t} eine Stelle nach hinten">▶</button></span>
      <button class="btn ghost sm" data-act="route-remove" data-t="${t}" aria-label="${t} aus dem Weg nehmen" data-tip="Schritt aus dem Weg nehmen">✕</button>`}</div>
    <div class="rt-kind"><span class="pill ${cls}">${kind}</span><span class="muted xs">${how}</span></div>
    <label class="rt-days">${num('days', c.days, 260, 1, 'Arbeitstage')}<span>Arbeitstage</span></label>
    <div class="rt-loss"><div class="xs muted">Es fehlen der Produktion je Tag (in Köpfen):</div>
      <div class="rt-res">${RES.map(([f, label]) => html`<label><span>${label}</span>${num(f, c[f], 5, 0.1, label + ' je Tag')}</label>`)}</div></div>
    <div class="rt-sum">${c.days ? html`= <b>${nf(loss, 1)}</b> Kapazitätstage` : html`<span style="color:var(--crit-ink)">Dauer fehlt – so nicht planbar</span>`}</div></div>`;
}
const arrow = () => raw('<span class="rt-arrow" aria-hidden="true">→</span>');

/** Katalog: alle Maßnahmen mit ihren zulässigen Diensten; eigene Schritte lassen sich anlegen, ändern und entfernen. */
function catalog() {
  const row = t => {
    const m = Core.measureOf(S, t), sh = Core.shiftsOf(S, t), course = Core.isCourse(S, t), used = Core.ROUTE_CLUSTERS.filter(k => S.routes[k].includes(t)).map(String);
    if (TEC_ROUTE.includes(t) && !used.includes('5')) used.push('5 (Zielstufe TEC)');
    return html`<tr><td><i class="sw ${tcls(t)}"></i> <b>${t}</b> ${m ? pill('eigener Schritt', 'info') : ''}</td>
      <td>${course ? 'Lehrgang' : t === Core.PREP ? 'Vorbereitung' : 'im Dienst'}</td>
      ${Core.SHIFTS.map((name, i) => html`<td class="c"><input type="checkbox" data-chg="shift" data-t="${t}" data-i="${i}" ${sh[i] ? raw('checked') : ''} aria-label="${t} im ${name}dienst"></td>`)}
      <td class="small ink2">${used.length ? 'Cluster ' + used.join(', ') : html`<span class="muted">in keinem Weg</span>`}</td>
      <td class="nowrap">${m ? html`<button class="btn sm" data-act="measure-edit" data-t="${t}">Ändern</button> <button class="btn sm danger" data-act="measure-remove" data-t="${t}">Entfernen</button>` : ''}</td></tr>`;
  };
  const changed = Object.keys(S.settings.shifts || {}).length;
  return html`<div class="card" id="msCard" style="margin-top:14px">
    <div class="row"><h3 style="font-size:16px;font-weight:650">Schritte und Dienste</h3><span class="sp"></span>
      ${changed ? html`<button class="btn" data-act="shift-reset">Dienste auf Vorgabe setzen</button>` : ''}<button class="btn primary" data-act="measure-new">Neuen Schritt anlegen</button></div>
    <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 12px">Hier legen Sie fest, in welchen Diensten eine Maßnahme stattfinden darf – das gilt für alle Cluster. Der Planer, das Ablegen im Jahresplan und die Konfliktprüfung richten sich danach. Vorgabe: Logbook in jedem Dienst, alles andere nur im Frühdienst.</div>
    <div class="tblwrap"><table class="tbl ms-tbl"><thead><tr><th>Maßnahme</th><th>Art</th>${Core.SHIFTS.map(s => html`<th class="c">${s}</th>`)}<th>Im Weg von</th><th></th></tr></thead>
      <tbody>${Core.typesOf(S).map(row)}</tbody></table></div>
    <p class="small muted" style="margin-top:8px">${S.settings.courseBlocks ? 'Lehrgänge laufen als Block: Ihre Tage bestimmt der Lehrgangstermin, die Dienstregel gilt dort nicht. ' : ''}Nach einer Änderung verteilt „Neu berechnen“ die berechneten Termine neu; fixierte Termine außerhalb der zulässigen Dienste erscheinen als Konflikt im Bericht.</p></div>`;
}
/** Dialog für einen eigenen Schritt. m = vorhandener Schritt (ändern) oder null (neu anlegen). */
function measureDialog(m) {
  const { k, p } = routeContext(), sh = m ? Core.shiftsOf(S, m.name) : [true, false, false], color = m ? m.color : ((S.measures || []).length % Core.MEASURE_COLORS) + 1;
  const num = (id, v, max, step, label) => html`<label class="f">${label}<input type="number" id="${id}" min="0" max="${max}" step="${step}" value="${v}"></label>`;
  const usage = m ? Core.measureUsage(S, m.name) : null, locked = usage && (usage.events || usage.courses);
  openModal({ title: m ? 'Schritt ändern · ' + m.name : 'Neuen Schritt anlegen', wide: true, body: html`
    <div class="form">
      <label class="f">Bezeichnung<input type="text" id="msName" maxlength="40" value="${m ? m.name : ''}" ${m ? raw('disabled') : raw('autofocus')} placeholder="z. B. Human Factors"></label>
      <label class="f" data-tip="Steht auf schmalen Balken im Jahresplan">Kürzel<input type="text" id="msShort" maxlength="12" value="${m ? m.short : ''}" placeholder="z. B. HF"></label></div>
    <div class="f ms-f" style="margin-top:10px">Farbe<div class="ms-colors" role="radiogroup" aria-label="Farbe">${Array.from({ length: Core.MEASURE_COLORS }, (_, i) => html`<label><input type="radio" name="msColor" value="${i + 1}" ${i + 1 === color ? raw('checked') : ''} aria-label="Farbe ${i + 1}"><i class="t-x${i + 1}"></i></label>`)}</div></div>
    <div class="f ms-f" style="margin-top:10px">Art
      <label class="c"><input type="radio" name="msKind" value="0" ${m && m.course ? '' : raw('checked')} ${locked ? raw('disabled') : ''}> <span><b>Einzeln im Dienst</b> – die Tage werden wie Logbook oder FitCheck auf zulässige Diensttage verteilt</span></label>
      <label class="c"><input type="radio" name="msKind" value="1" ${m && m.course ? raw('checked') : ''} ${locked ? raw('disabled') : ''}> <span><b>Lehrgang</b> – zusammenhängender Block für eine Gruppe; Termine planen Sie unter „Lehrgänge“</span></label>
      ${locked ? html`<span class="small muted">Die Art lässt sich nicht mehr ändern, weil es bereits Termine oder Lehrgänge dieser Maßnahme gibt.</span>` : ''}</div>
    <div class="f ms-f" style="margin-top:10px">Zulässige Dienste<div class="row">${Core.SHIFTS.map((s, i) => html`<label class="c"><input type="checkbox" id="msS${i}" ${sh[i] ? raw('checked') : ''}> ${s}</label>`)}</div></div>
    ${m ? '' : html`<h3 style="font-size:13.5px;font-weight:650;margin:14px 0 6px">Vorgabe für alle Cluster <span class="muted" style="font-weight:400">· je Cluster auf der Schrittkarte änderbar</span></h3>
      <div class="form" style="grid-template-columns:repeat(5,minmax(0,1fr))">${num('msDays', 1, 260, 1, 'Arbeitstage')}${num('msTrainee', 1, 5, 0.1, 'Teilnehmer fehlt')}${num('msMentor', 0, 5, 0.1, 'Mentor')}${num('msTec', 0, 5, 0.1, 'TEC')}${num('msExam', 0, 5, 0.1, 'Prüfer')}</div>
      <label class="c" style="margin-top:10px"><input type="checkbox" id="msAdd" checked> <span>Gleich in den ${p ? 'individuellen Weg von ' + pName(p) : 'Weg von Cluster ' + k} aufnehmen (am Ende – danach verschiebbar)</span></label>`}`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok">${m ? 'Speichern' : 'Schritt anlegen'}</button>`,
    handlers: { ok: () => {
      // alle Eingaben lesen, solange der Dialog noch steht
      const shifts = [0, 1, 2].map(i => $('#msS' + i).checked), course = document.querySelector('input[name=msKind]:checked').value === '1', colorNow = +document.querySelector('input[name=msColor]:checked').value, short = $('#msShort').value;
      if (!shifts.some(Boolean)) return toast('Mindestens ein Dienst muss zulässig sein', 'crit');
      if (m) { closeModal(); return commit('Schritt „' + m.name + '“ geändert', () => { Core.editMeasure(S, m.name, { short, color: colorNow, ...(locked ? {} : { course }) }); Core.setShifts(S, m.name, shifts); }); }
      const name = $('#msName').value, issue = Core.measureNameIssue(S, name);
      if (issue) return toast(issue, 'crit');
      const n = id => Number(String($(id).value).replace(',', '.')), days = n('#msDays'), f = { trainee: n('#msTrainee'), mentor: n('#msMentor'), tec: n('#msTec'), examiner: n('#msExam') };
      if (!Number.isInteger(days) || days < 1 || days > 260 || Object.values(f).some(v => !Number.isFinite(v) || v < 0 || v > 5)) return toast('Ungültiger Wert: Tage 1–260 (ganzzahlig), Faktoren 0–5', 'crit');
      const add = $('#msAdd').checked; closeModal();
      routeEdit('Schritt „' + name.trim() + '“ angelegt' + (add ? ' und in den Weg aufgenommen' : '') + ' – für neue Terminverteilung „Neu berechnen“', r => {
        const made = Core.addMeasure(S, { name, short, color: colorNow, course, shifts }, { days, ...f });
        if (add) { r.config[made.name] = r.config[made.name] || { days, ...f }; r.steps = Core.insertStep(r.steps, made.name); }
      }, add);
    } } });
}

VIEWS.routes = {
  render() {
    const { k, p, steps, cfg } = routeContext(), isTec = p && k === '5' && p.level === 'TEC' && !p.customRoute;
    const inCluster = S.people.filter(x => x.cluster === k && !Core.isLocked(x)).slice().sort((a, b) => collator.compare(sortKey(a), sortKey(b)));
    const shown = isTec ? TEC_ROUTE : steps, t = totals(shown, cfg), free = Core.typesOf(S).filter(x => !steps.includes(x)), prep = shown.includes('ICA') && !shown.includes(Core.PREP);
    const tecT = totals(TEC_ROUTE, cfg), bar = list => { const total = Math.max(1, list.reduce((s, x) => s + (cfg[x]?.days || 0), 0)); return html`<div class="rt-bar">${list.filter(x => cfg[x]?.days).map(x => html`<span class="${tcls(x)}" style="flex:${cfg[x].days / total}"><b>${x}</b> ${cfg[x].days} T</span>`)}</div>`; };
    return html`
    <div class="view-head"><div><h1>Ausbildungswege</h1><p>Jeder Cluster hat einen Weg: eine Folge von Schritten mit Dauer und dem, was der Produktion an einem solchen Tag fehlt. Der Planer verteilt genau diese Schritte in dieser Reihenfolge. Die Werte sind Planungsannahmen und fachlich zu bestätigen.</p></div></div>
    <h3 class="rt-title">Alle Wege auf einen Blick <span class="muted">· Karte anklicken zum Bearbeiten</span></h3>
    <div class="rt-grid">${Core.ROUTE_CLUSTERS.map(c => clusterCard(c, p ? '' : k))}</div>

    <div class="card" style="margin-top:16px">
      <div class="row"><h3 style="font-size:16px;font-weight:650">${p ? 'Individueller Weg · ' + pName(p) : 'Cluster ' + k + ' · ' + Core.CLUSTERS[k]}</h3><span class="sp"></span>
        <select data-chg="route-person" aria-label="Individueller Weg" style="max-width:300px"><option value="">Standard für Cluster ${k}</option>${opts(inCluster.map(x => [x.alias, pName(x) + (x.customRoute ? ' · individuell' : '')]), p ? p.alias : '')}</select>
        ${p ? html`<button class="btn" data-act="route-reset-person" ${p.customRoute ? '' : raw('disabled')}>Auf Clusterstandard zurücksetzen</button>` : html`<button class="btn" data-act="route-reset-cluster">Vorgabewerte wiederherstellen</button>`}</div>
      <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 14px">${p ? (p.customRoute ? 'Weicht vom Clusterstandard ab – gilt nur für diese Person.' : 'Entspricht dem Clusterstandard. Die erste Änderung legt für diese Person einen eigenen Weg an.') : nf(inCluster.length) + ' planbare Personen folgen diesem Weg. Eine einzelne Person mit abweichendem Weg wählen Sie rechts aus.'}</div>

      ${isTec ? html`<div class="note" style="margin-bottom:12px">Zielstufe TEC: der Weg besteht fest aus Theorie und Praxis.</div>` : ''}
      <div class="rt-flow" data-keep="rtflow" ${isTec ? '' : raw('data-sortable')}>${shown.map((x, i) => html`${i ? arrow() : ''}${stepCard(x, cfg, i + 1, isTec, shown.length)}`)}
        ${prep ? html`<div class="rt-hint"><b>+ 1 Tag Vorbereitung</b><span>liegt automatisch vor der ICA, bindet nur Prüfer oder TEC – der Teilnehmer bleibt produktiv</span></div>` : ''}
        ${shown.length ? '' : html`<div class="empty" style="flex:1"><b>Dieser Weg hat noch keinen Schritt</b>Unten einen Schritt hinzufügen.</div>`}</div>
      ${isTec ? '' : html`<div class="row" style="margin-top:12px"><span class="small ink2">Schritt hinzufügen:</span>${free.length ? free.map(x => html`<button class="chip" data-act="route-add" data-t="${x}"><i class="sw ${tcls(x)}"></i>${x}</button>`) : html`<span class="muted small">alle Maßnahmen sind im Weg</span>`}
        <button class="chip" data-act="measure-new" data-tip="Eine eigene Maßnahme anlegen – mit Dauer, Betreuung und zulässigen Diensten">＋ Neuer Schritt</button>
        <span class="small muted">Reihenfolge ändern: Kachel am Kopf ziehen oder die Pfeile ◀ ▶ nutzen.</span></div>`}

      <h3 class="rt-title" style="margin-top:18px">Zeitbedarf <span class="muted">· Breite entspricht den Arbeitstagen</span></h3>
      ${t.days ? bar(shown) : html`<div class="note">Noch keine Dauer hinterlegt.</div>`}
      <p class="small ink2" style="margin-top:8px"><b>${nf(t.days)} Ausbildungstage</b> je Person · <b>${nf(t.loss, 1)} Kapazitätstage</b> fehlen der Produktion insgesamt (Teilnehmer, Mentor, TEC und Prüfer zusammen)${inCluster.length && !p ? html` · für alle ${nf(inCluster.length)} Personen des Clusters ${nf(t.loss * inCluster.length)} Kapazitätstage` : ''}.</p>

      ${k === '5' && !p ? html`<h3 class="rt-title" style="margin-top:18px">Zielstufe TEC <span class="muted">· fester Weg: Theorie, dann Praxis – beides als Lehrgang</span></h3>
        <div class="rt-flow">${TEC_ROUTE.map((x, i) => html`${i ? arrow() : ''}${stepCard(x, cfg, i + 1, true)}`)}</div>
        ${bar(TEC_ROUTE)}<p class="small ink2" style="margin-top:8px"><b>${nf(tecT.days)} Lehrgangstage</b> je Person · ${nf(tecT.loss, 1)} Kapazitätstage. Die Termine planen Sie unter „Lehrgänge“.</p>` : ''}
    </div>

    ${catalog()}

    <div class="grid2" style="margin-top:14px">
      <div class="card"><h3>So liest man eine Schrittkarte</h3><div class="sub">Drei Angaben je Schritt</div>
        <ul class="hints"><li><span class="ic">1</span><span><b>Arbeitstage.</b> So viele Tage braucht eine Person für diesen Schritt.</span></li>
          <li><span class="ic">2</span><span><b>Fehlende Köpfe je Tag.</b> Teilnehmer 1 heißt: die Person fehlt der Produktion ganz. Mentor 0,5 heißt: ein Mentor ist an diesem Tag zur Hälfte gebunden. Die Summe wird von der Kapazität des Dienstes abgezogen.</span></li>
          <li><span class="ic">3</span><span><b>Art des Schritts.</b> Lehrgänge laufen als Block für eine Gruppe, alle anderen Schritte liegen einzeln in den Diensten, die unter „Schritte und Dienste“ zugelassen sind.</span></li></ul></div>
      <div class="card"><h3>Regeln der Vorgabe</h3><div class="sub">Übernommen aus der Vorgängerversion</div>
        <ul class="hints"><li><span class="ic">i</span><span>Cluster 1: FitCheck 5 Tage, ICA 1 Tag. Cluster 2 / 4A: Logbook 30 Tage, FitCheck 2, ICA 1.</span></li>
          <li><span class="ic">i</span><span>Cluster 3 / 4B: Logbook 80 Tage – beginnt erst nach dem Praxis-Lehrgang (oder dem eingetragenen Abschluss aller Doings).</span></li>
          <li><span class="ic">i</span><span>Cluster 5: Zielstufe CAB / CAT A 10 Logbook-Tage; Zielstufe TEC 20 Tage Theorie und 10 Tage Praxis, ohne ICA.</span></li>
          <li><span class="ic">i</span><span>Mentor im Logbook: Cluster 2–4 = 0,5 · Cluster 5 = 0,2. Vorleistungen aus Vorjahren tragen Sie bei der Person ein.</span></li></ul></div>
    </div>`;
  }
};
ACT['route-cluster'] = t => { UI.routeCluster = t.dataset.id; UI.routePerson = ''; render(); };
CHG['route-person'] = t => { UI.routePerson = P(t.value)?.pk || ''; render(); };
/** touch = false: nur den Stand ändern, ohne für die gewählte Person einen individuellen Weg anzulegen. */
function routeEdit(label, fn, touch = true) {
  const { k, p } = routeContext();
  commit(label, () => {
    if (!touch) return fn({ steps: [], config: {} }, false);
    if (p) { const person = S.people.find(x => x.pk === p.pk); person.customRoute = person.customRoute || { steps: Core.clone(S.routes[k]), config: Core.clone(S.config[k]) }; fn(person.customRoute, true); }
    else fn({ get steps() { return S.routes[k]; }, set steps(v) { S.routes[k] = v; }, config: S.config[k] }, false);
  });
}
const setStep = (type, on) => routeEdit(on ? type + ' in den Weg aufgenommen – für neue Terminverteilung „Neu berechnen“' : type + ' aus dem Weg genommen – für neue Terminverteilung „Neu berechnen“', r => { r.steps = on ? Core.insertStep(r.steps, type) : r.steps.filter(x => x !== type); });
ACT['route-add'] = t => setStep(t.dataset.t, true);
ACT['route-remove'] = t => setStep(t.dataset.t, false);
CHG['route-step'] = t => setStep(t.dataset.t, t.checked);
CHG['route-cfg'] = t => {
  const f = t.dataset.f, v = t.value === '' ? null : Number(String(t.value).replace(',', '.'));
  if (v !== null && (!Number.isFinite(v) || v < 0 || (f === 'days' && (!Number.isInteger(v) || v > 260)) || (f !== 'days' && v > 5))) { render(); return toast('Ungültiger Wert: Tage 0–260 (ganzzahlig), Faktoren 0–5', 'crit'); }
  routeEdit('Ausbildungsweg gespeichert – für neue Terminverteilung „Neu berechnen“', r => { r.config[t.dataset.t][f] = f === 'days' || f === 'trainee' ? v : (v ?? 0); });
};
ACT['route-reset-person'] = () => { const { p } = routeContext(); if (p) commit('Individueller Weg zurückgesetzt', () => { delete S.people.find(x => x.pk === p.pk).customRoute; }); };
ACT['route-reset-cluster'] = async () => { const { k } = routeContext(); if (await confirmDlg('Vorgabewerte wiederherstellen', 'Schrittfolge und Werte für Cluster ' + k + ' werden auf die Vorgabewerte zurückgesetzt. Individuelle Wege bleiben unverändert.', 'Wiederherstellen')) commit('Cluster ' + k + ' auf Vorgabewerte gesetzt', () => { S.config[k] = Core.defaultConfig()[k]; S.routes[k] = Core.clone(Core.DEFAULT_ROUTES[k]); }); };
ACT['route-move'] = t => {
  const { steps } = routeContext(), at = steps.indexOf(t.dataset.t), to = at + (+t.dataset.dir);
  if (at < 0 || to < 0 || to >= steps.length) return;
  routeEdit('Reihenfolge geändert – für neue Terminverteilung „Neu berechnen“', r => { r.steps = Core.moveStep(r.steps, t.dataset.t, to); });
};

// ---------- Katalog: Dienste und eigene Schritte ---------------------------------------------
CHG.shift = t => {
  const type = t.dataset.t, sh = Core.shiftsOf(S, type).slice(); sh[+t.dataset.i] = t.checked;
  if (!sh.some(Boolean)) { render(); return toast('Mindestens ein Dienst muss zulässig bleiben', 'crit'); }
  commit(type + ' ist jetzt ' + Core.SHIFTS.filter((_, i) => sh[i]).join(', ') + ' zulässig – für neue Terminverteilung „Neu berechnen“', () => Core.setShifts(S, type, sh));
};
ACT['shift-reset'] = async () => { if (await confirmDlg('Dienste auf Vorgabe setzen', 'Alle Maßnahmen gelten danach wieder wie vorgegeben: Logbook in jedem Dienst, alles andere nur im Frühdienst. Eigene Schritte bleiben erhalten.', 'Zurücksetzen')) commit('Dienste auf Vorgabe gesetzt', () => { S.settings.shifts = {}; }); };
ACT['measure-new'] = () => measureDialog(null);
ACT['measure-edit'] = t => { const m = Core.measureOf(S, t.dataset.t); if (m) measureDialog(m); };
ACT['measure-remove'] = async t => {
  const name = t.dataset.t, u = Core.measureUsage(S, name);
  if (u.events || u.courses) return toast('„' + name + '“ wird noch verwendet (' + [u.events ? u.events + ' Termine' : '', u.courses ? u.courses + ' Lehrgänge' : ''].filter(Boolean).join(', ') + ') – bitte zuerst entfernen', 'crit');
  if (await confirmDlg('Schritt „' + name + '“ entfernen', 'Der Schritt verschwindet aus dem Katalog' + (u.clusters.length ? ', aus dem Weg von Cluster ' + u.clusters.join(', ') : '') + (u.people ? ' und aus ' + u.people + ' individuellen Wegen' : '') + '. Rückgängig ist möglich.', 'Entfernen')) commit('Schritt „' + name + '“ entfernt', () => Core.removeMeasure(S, name));
};

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
  const { steps } = routeContext(), moved = Core.moveStep(steps, d.type, d.to);
  if (moved.join('|') === steps.join('|')) return;
  trace('Ablegen: Schritt im Weg');
  routeEdit(d.type + ' steht jetzt an Stelle ' + (moved.indexOf(d.type) + 1) + ' – für neue Terminverteilung „Neu berechnen“', r => { r.steps = Core.moveStep(r.steps, d.type, d.to); });
}
document.addEventListener('pointerdown', e => {
  if (drag) endDrag(true);
  if (UI.view !== 'routes' || e.button !== 0 || !e.target.closest) return;
  const grip = e.target.closest('.rt-flow[data-sortable] .rt-step[data-step] .rt-sh');
  if (!grip || e.target.closest('button,input,select,a')) return;
  const tile = grip.closest('.rt-step');
  drag = { tile, flow: tile.closest('.rt-flow'), type: tile.dataset.step, id: e.pointerId, x: e.clientX, y: e.clientY, active: false, to: -1 };
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
