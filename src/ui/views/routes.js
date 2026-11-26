import * as Core from '../../core/index.js';
import { html, raw } from '../dom.js';
import { nf, opts, tcls } from '../format.js';
import { IX, P, S, SUM, UI, collator, commit, pName, sortKey } from '../state.js';
import { confirmDlg, toast } from '../dialogs.js';
import { ACT, CHG, VIEWS } from '../registry.js';
import { render } from '../shell.js';

// ---------- Ausbildungswege -------------------------------------------------------
function routeContext() {
  const person = UI.routePerson ? IX.people.get(UI.routePerson) : null;
  const k = person && Core.ROUTE_CLUSTERS.includes(person.cluster) ? person.cluster : Core.ROUTE_CLUSTERS.includes(UI.routeCluster) ? UI.routeCluster : '1';
  const p = person && person.cluster === k ? person : null;
  return { k, p, steps: p?.customRoute?.steps || S.routes[k], cfg: p?.customRoute?.config || S.config[k] };
}
const chain = (steps, cfg, note) => html`<div class="chain">${steps.map((t, i) => html`${i ? html`<span class="arrow" aria-hidden="true">→</span>` : ''}<span class="node"><i class="sw ${tcls(t)}"></i><b>${t}</b><span class="muted">${cfg[t]?.days ?? '?'} Tage</span></span>`)}${note ? html`<span class="muted small">${note}</span>` : ''}</div>`;
VIEWS.routes = {
  render() {
    const { k, p, steps, cfg } = routeContext();
    const inCluster = S.people.filter(x => x.cluster === k && !Core.isLocked(x)).slice().sort((a, b) => collator.compare(sortKey(a), sortKey(b)));
    const days = steps.reduce((s, t) => s + (cfg[t]?.days || 0), 0);
    const loss = steps.reduce((s, t) => { const c = cfg[t]; return s + (c?.days || 0) * (Core.num(c?.trainee) + Core.num(c?.mentor) + Core.num(c?.tec) + Core.num(c?.examiner)); }, 0);
    return html`
    <div class="view-head"><div><h1>Ausbildungswege</h1><p>Schrittfolge, Dauer und Produktivitätsverlust je Cluster – oder individuell für eine Person. Die Werte sind Planungsannahmen und fachlich zu bestätigen.</p></div></div>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Cluster">${Core.ROUTE_CLUSTERS.map(c => html`<button data-act="route-cluster" data-id="${c}" aria-pressed="${c === k}" data-tip="${Core.CLUSTERS[c]}">Cluster ${c} <span class="num">(${SUM.clusters[c] || 0})</span></button>`)}</div>
      <select data-chg="route-person" aria-label="Individueller Weg" style="max-width:320px"><option value="">Clusterstandard bearbeiten</option>${opts(inCluster.map(x => [x.alias, pName(x) + (x.customRoute ? ' · individuell' : '')]), p ? p.alias : '')}</select>
      <span class="sp"></span>
      ${p ? html`<button class="btn" data-act="route-reset-person" ${p.customRoute ? '' : raw('disabled')}>Auf Clusterstandard zurücksetzen</button>` : html`<button class="btn" data-act="route-reset-cluster">Vorgabewerte wiederherstellen</button>`}
    </div>
    <div class="card" style="margin-bottom:14px"><h3>${p ? 'Individueller Weg · ' + pName(p) : 'Cluster ' + k + ' · ' + Core.CLUSTERS[k]}</h3>
      <div class="sub">${p ? (p.customRoute ? 'Abweichend vom Clusterstandard' : 'Entspricht dem Clusterstandard – die erste Änderung legt einen individuellen Weg an') : nf(inCluster.length) + ' planbare Personen folgen diesem Weg'}</div>
      ${k === '5' && !p ? html`<div class="stack"><div><div class="small ink2" style="margin-bottom:4px">Zielstufe CAB / CAT A</div>${chain(steps, cfg)}</div><div><div class="small ink2" style="margin-bottom:4px">Zielstufe TEC (fest: Theorie, dann Praxis)</div>${chain(['Theorie', 'Praxis'], cfg)}</div></div>`
        : chain(p && k === '5' && p.level === 'TEC' && !p.customRoute ? ['Theorie', 'Praxis'] : steps, cfg, steps.includes('ICA') && !steps.includes(Core.PREP) ? '+ 1 Tag Vorbereitung vor der ICA (automatisch, Teilnehmer bleibt produktiv)' : '')}
      <p class="small ink2" style="margin-top:10px">${nf(days)} Ausbildungstage · ${nf(loss, 1)} Kapazitätstage Produktionsverlust je Person (Teilnehmer, Mentor, TEC und Prüfer zusammen).</p></div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Im Weg</th><th>Maßnahme</th><th>Arbeitstage</th><th>Teilnehmerverlust / Tag</th><th>Mentor / Tag</th><th>TEC / Tag</th><th>Prüfer / Tag</th></tr></thead><tbody>
      ${Core.TYPES.map(t => html`<tr><td><input type="checkbox" data-chg="route-step" data-t="${t}" ${steps.includes(t) ? raw('checked') : ''} aria-label="${t} im Weg"></td><td><i class="sw ${tcls(t)}"></i> <b>${t}</b></td>
        ${['days', 'trainee', 'mentor', 'tec', 'examiner'].map(f => html`<td><input type="number" min="0" max="${f === 'days' ? 260 : 5}" step="${f === 'days' ? 1 : 0.1}" data-chg="route-cfg" data-t="${t}" data-f="${f}" value="${cfg[t][f] ?? ''}" placeholder="offen" aria-label="${t} ${f}"></td>`)}</tr>`)}</tbody></table></div>
    <div class="note" style="margin-top:12px">Vorbelegt sind die Regeln der Vorgängerversion: Cluster 1 FitCheck 5 Tage + ICA 1 Tag · Cluster 2 / 4A Logbook 30 Tage + FitCheck 2 + ICA 1 · Cluster 3 / 4B Logbook 80 Tage, beginnt nach dem Praxis-Kursrahmen · Cluster 5 CAB / CAT A 10 Logbook-Tage, TEC 20 Tage Theorie + 10 Tage Praxis ohne ICA. Mentor im Logbook: Cluster 2–4 = 0,5, Cluster 5 = 0,2. Kurs- und Prüfungstage liegen nur im Frühdienst, Logbook-Tage in jedem Dienst. Die Reihenfolge der Schritte ist fest (von oben nach unten).</div>`;
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
CHG['route-step'] = t => routeEdit('Schrittfolge gespeichert', r => { r.steps = Core.TYPES.filter(x => x === t.dataset.t ? t.checked : r.steps.includes(x)); });
CHG['route-cfg'] = t => {
  const f = t.dataset.f, v = t.value === '' ? null : Number(String(t.value).replace(',', '.'));
  if (v !== null && (!Number.isFinite(v) || v < 0 || (f === 'days' && (!Number.isInteger(v) || v > 260)) || (f !== 'days' && v > 5))) { render(); return toast('Ungültiger Wert: Tage 0–260 (ganzzahlig), Faktoren 0–5', 'crit'); }
  routeEdit('Ausbildungsweg gespeichert – für neue Terminverteilung „Neu berechnen“', r => { r.config[t.dataset.t][f] = f === 'days' || f === 'trainee' ? v : (v ?? 0); });
};
ACT['route-reset-person'] = () => { const { p } = routeContext(); if (p) commit('Individueller Weg zurückgesetzt', () => { delete S.people.find(x => x.pk === p.pk).customRoute; }); };
ACT['route-reset-cluster'] = async () => { const { k } = routeContext(); if (await confirmDlg('Vorgabewerte wiederherstellen', 'Schrittfolge und Werte für Cluster ' + k + ' werden auf die Vorgabewerte zurückgesetzt. Individuelle Wege bleiben unverändert.', 'Wiederherstellen')) commit('Cluster ' + k + ' auf Vorgabewerte gesetzt', () => { S.config[k] = Core.defaultConfig()[k]; S.routes[k] = Core.clone(Core.DEFAULT_ROUTES[k]); }); };
