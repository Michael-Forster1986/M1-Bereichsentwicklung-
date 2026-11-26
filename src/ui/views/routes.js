import * as Core from '../../core/index.js';
import { html, raw } from '../dom.js';
import { nf, opts, tcls } from '../format.js';
import { IX, P, PROG, S, UI, collator, commit, pName, sortKey } from '../state.js';
import { confirmDlg, toast } from '../dialogs.js';
import { ACT, CHG, VIEWS } from '../registry.js';
import { render } from '../shell.js';

/* ==========================================================================
 * Ansicht · Ausbildungswege
 * Oben alle Wege auf einen Blick, darunter der gewählte Weg als Ablauf: je Schritt eine Karte mit Dauer
 * und dem, was der Produktion an einem solchen Tag fehlt. Die Reihenfolge der Schritte ist fest.
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
const kindOf = t => Core.isCourseType(t) ? ['Lehrgang', 'als Block für eine Gruppe', 'info'] : t === Core.LOGBOOK ? ['im Dienst', 'tageweise, in jedem Dienst', 'good'] : t === Core.PREP ? ['Vorbereitung', 'Teilnehmer bleibt produktiv', ''] : ['Prüfung', 'tageweise, nur im Frühdienst', 'warn'];

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
/** Eine Schrittkarte des Ablaufs. fixed = Schritt gehört fest zum Weg (TEC) und lässt sich nicht entfernen. */
function stepCard(t, cfg, n, fixed) {
  const c = cfg[t] || {}, [kind, how, cls] = kindOf(t), loss = (c.days || 0) * lossOf(c);
  const num = (f, v, max, step, label) => html`<input type="number" min="0" max="${max}" step="${step}" data-chg="route-cfg" data-t="${t}" data-f="${f}" value="${v ?? ''}" placeholder="–" aria-label="${t}: ${label}">`;
  return html`<div class="rt-step"><div class="rt-top ${tcls(t)}"></div>
    <div class="rt-sh"><span class="rt-no">${n}</span><b>${t}</b>${fixed ? '' : html`<button class="btn ghost sm" data-act="route-remove" data-t="${t}" aria-label="${t} aus dem Weg nehmen" data-tip="Schritt aus dem Weg nehmen">✕</button>`}</div>
    <div class="rt-kind"><span class="pill ${cls}">${kind}</span><span class="muted xs">${how}</span></div>
    <label class="rt-days">${num('days', c.days, 260, 1, 'Arbeitstage')}<span>Arbeitstage</span></label>
    <div class="rt-loss"><div class="xs muted">Es fehlen der Produktion je Tag (in Köpfen):</div>
      <div class="rt-res">${RES.map(([f, label]) => html`<label><span>${label}</span>${num(f, c[f], 5, 0.1, label + ' je Tag')}</label>`)}</div></div>
    <div class="rt-sum">${c.days ? html`= <b>${nf(loss, 1)}</b> Kapazitätstage` : html`<span style="color:var(--crit-ink)">Dauer fehlt – so nicht planbar</span>`}</div></div>`;
}
const arrow = () => raw('<span class="rt-arrow" aria-hidden="true">→</span>');

VIEWS.routes = {
  render() {
    const { k, p, steps, cfg } = routeContext(), isTec = p && k === '5' && p.level === 'TEC' && !p.customRoute;
    const inCluster = S.people.filter(x => x.cluster === k && !Core.isLocked(x)).slice().sort((a, b) => collator.compare(sortKey(a), sortKey(b)));
    const shown = isTec ? TEC_ROUTE : steps, t = totals(shown, cfg), free = Core.TYPES.filter(x => !steps.includes(x)), prep = shown.includes('ICA') && !shown.includes(Core.PREP);
    const tecT = totals(TEC_ROUTE, cfg), bar = list => { const total = Math.max(1, list.reduce((s, x) => s + (cfg[x]?.days || 0), 0)); return html`<div class="rt-bar">${list.filter(x => cfg[x]?.days).map(x => html`<span class="${tcls(x)}" style="flex:${cfg[x].days / total}"><b>${x}</b> ${cfg[x].days} T</span>`)}</div>`; };
    return html`
    <div class="view-head"><div><h1>Ausbildungswege</h1><p>Jeder Cluster hat einen Weg: eine feste Folge von Schritten mit Dauer und dem, was der Produktion an einem solchen Tag fehlt. Der Planer verteilt genau diese Schritte. Die Werte sind Planungsannahmen und fachlich zu bestätigen.</p></div></div>
    <h3 class="rt-title">Alle Wege auf einen Blick <span class="muted">· Karte anklicken zum Bearbeiten</span></h3>
    <div class="rt-grid">${Core.ROUTE_CLUSTERS.map(c => clusterCard(c, p ? '' : k))}</div>

    <div class="card" style="margin-top:16px">
      <div class="row"><h3 style="font-size:16px;font-weight:650">${p ? 'Individueller Weg · ' + pName(p) : 'Cluster ' + k + ' · ' + Core.CLUSTERS[k]}</h3><span class="sp"></span>
        <select data-chg="route-person" aria-label="Individueller Weg" style="max-width:300px"><option value="">Standard für Cluster ${k}</option>${opts(inCluster.map(x => [x.alias, pName(x) + (x.customRoute ? ' · individuell' : '')]), p ? p.alias : '')}</select>
        ${p ? html`<button class="btn" data-act="route-reset-person" ${p.customRoute ? '' : raw('disabled')}>Auf Clusterstandard zurücksetzen</button>` : html`<button class="btn" data-act="route-reset-cluster">Vorgabewerte wiederherstellen</button>`}</div>
      <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 14px">${p ? (p.customRoute ? 'Weicht vom Clusterstandard ab – gilt nur für diese Person.' : 'Entspricht dem Clusterstandard. Die erste Änderung legt für diese Person einen eigenen Weg an.') : nf(inCluster.length) + ' planbare Personen folgen diesem Weg. Eine einzelne Person mit abweichendem Weg wählen Sie rechts aus.'}</div>

      ${isTec ? html`<div class="note" style="margin-bottom:12px">Zielstufe TEC: der Weg besteht fest aus Theorie und Praxis.</div>` : ''}
      <div class="rt-flow" data-keep="rtflow">${shown.map((x, i) => html`${i ? arrow() : ''}${stepCard(x, cfg, i + 1, isTec)}${x === 'ICA' && prep ? '' : ''}`)}
        ${prep ? html`<div class="rt-hint"><b>+ 1 Tag Vorbereitung</b><span>liegt automatisch vor der ICA, bindet nur Prüfer oder TEC – der Teilnehmer bleibt produktiv</span></div>` : ''}
        ${shown.length ? '' : html`<div class="empty" style="flex:1"><b>Dieser Weg hat noch keinen Schritt</b>Unten einen Schritt hinzufügen.</div>`}</div>
      ${isTec ? '' : html`<div class="row" style="margin-top:12px"><span class="small ink2">Schritt hinzufügen:</span>${free.length ? free.map(x => html`<button class="chip" data-act="route-add" data-t="${x}"><i class="sw ${tcls(x)}"></i>${x}</button>`) : html`<span class="muted small">alle Maßnahmen sind im Weg</span>`}
        <span class="small muted">Die Reihenfolge ist fest: Kurse vor Logbook, FitCheck und ICA.</span></div>`}

      <h3 class="rt-title" style="margin-top:18px">Zeitbedarf <span class="muted">· Breite entspricht den Arbeitstagen</span></h3>
      ${t.days ? bar(shown) : html`<div class="note">Noch keine Dauer hinterlegt.</div>`}
      <p class="small ink2" style="margin-top:8px"><b>${nf(t.days)} Ausbildungstage</b> je Person · <b>${nf(t.loss, 1)} Kapazitätstage</b> fehlen der Produktion insgesamt (Teilnehmer, Mentor, TEC und Prüfer zusammen)${inCluster.length && !p ? html` · für alle ${nf(inCluster.length)} Personen des Clusters ${nf(t.loss * inCluster.length)} Kapazitätstage` : ''}.</p>

      ${k === '5' && !p ? html`<h3 class="rt-title" style="margin-top:18px">Zielstufe TEC <span class="muted">· fester Weg: Theorie, dann Praxis – beides als Lehrgang</span></h3>
        <div class="rt-flow">${TEC_ROUTE.map((x, i) => html`${i ? arrow() : ''}${stepCard(x, cfg, i + 1, true)}`)}</div>
        ${bar(TEC_ROUTE)}<p class="small ink2" style="margin-top:8px"><b>${nf(tecT.days)} Lehrgangstage</b> je Person · ${nf(tecT.loss, 1)} Kapazitätstage. Die Termine planen Sie unter „Lehrgänge“.</p>` : ''}
    </div>

    <div class="grid2" style="margin-top:14px">
      <div class="card"><h3>So liest man eine Schrittkarte</h3><div class="sub">Drei Angaben je Schritt</div>
        <ul class="hints"><li><span class="ic">1</span><span><b>Arbeitstage.</b> So viele Tage braucht eine Person für diesen Schritt.</span></li>
          <li><span class="ic">2</span><span><b>Fehlende Köpfe je Tag.</b> Teilnehmer 1 heißt: die Person fehlt der Produktion ganz. Mentor 0,5 heißt: ein Mentor ist an diesem Tag zur Hälfte gebunden. Die Summe wird von der Kapazität des Dienstes abgezogen.</span></li>
          <li><span class="ic">3</span><span><b>Art des Schritts.</b> Lehrgänge laufen als Block für eine Gruppe, Logbook-Tage liegen einzeln in jedem Dienst, Prüfungen nur im Frühdienst.</span></li></ul></div>
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
function routeEdit(label, fn) {
  const { k, p } = routeContext();
  commit(label, () => {
    if (p) { const person = S.people.find(x => x.pk === p.pk); person.customRoute = person.customRoute || { steps: Core.clone(S.routes[k]), config: Core.clone(S.config[k]) }; fn(person.customRoute, true); }
    else fn({ get steps() { return S.routes[k]; }, set steps(v) { S.routes[k] = v; }, config: S.config[k] }, false);
  });
}
const setStep = (type, on) => routeEdit(on ? type + ' in den Weg aufgenommen – für neue Terminverteilung „Neu berechnen“' : type + ' aus dem Weg genommen – für neue Terminverteilung „Neu berechnen“', r => { r.steps = Core.TYPES.filter(x => x === type ? on : r.steps.includes(x)); });
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
