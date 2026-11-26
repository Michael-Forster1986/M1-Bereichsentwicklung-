import * as Core from '../../core/index.js';
import { html, raw } from '../dom.js';
import { MONL, clusterLabel, dayLabel, nf, opts, sgn } from '../format.js';
import { CONF, IX, S, SUM, UI } from '../state.js';
import { ACT, CHG, INP, VIEWS } from '../registry.js';
import { yearCompareCard } from './years.js';
import { go, render } from '../shell.js';
import { areaKnown, capCells, capLegend, monthsRow } from './shared.js';

// ---------- Übersicht ---------------------------------------------------------
function buildHints() {
  const h = [], st = S.settings, add = (lvl, text, act) => h.push({ lvl, text, act });
  if (!S.people.length) { add('crit', 'Noch keine Personen geladen.', ['Stammdaten importieren', 'go', 'data']); return h; }
  if (S.meta.dataClass === 'demo') add('info', 'Demo-Daten aktiv: alle Personen, Dienste und Abwesenheiten sind frei erfunden.', ['Eigene Daten laden', 'go', 'data']);
  const pl = (n, one, many) => nf(n) + ' ' + (n === 1 ? one : many);
  if (CONF.size) add('crit', pl(CONF.size, 'Termin mit Konflikt', 'Termine mit Konflikten') + ' (Abwesenheit, Dienst, Kollision oder Kapazität).', ['Zum Bericht', 'go', 'report']);
  if (SUM.underMin) add('crit', pl(SUM.underMin, 'Diensttag liegt', 'Diensttage liegen') + ' unter dem Minimum.', ['Kapazität ansehen', 'go', 'capacity']);
  if (SUM.underZero) add('warn', pl(SUM.underZero, 'Diensttag liegt', 'Diensttage liegen') + ' unter dem 0-Punkt.', ['Kapazität ansehen', 'go', 'capacity']);
  if (SUM.route.partial) add('warn', pl(SUM.route.partial, 'Ausbildungsweg lässt', 'Ausbildungswege lassen') + ' sich ' + S.meta.year + ' nur teilweise einplanen.', ['Zum Bericht', 'go', 'report']);
  if (SUM.route.none) add('warn', pl(SUM.route.none, 'Person mit Ausbildungsweg hat', 'Personen mit Ausbildungsweg haben') + ' noch keine Termine.', ['Zum Bericht', 'go', 'report']);
  const noRoster = S.people.filter(p => !S.roster[p.pk]).length;
  if (noRoster === S.people.length) add(st.strict ? 'crit' : 'warn', 'Kein Dienstplan geladen – ' + (st.strict ? 'im strikten Modus kann nichts geplant werden.' : 'es gilt die Szenariozuordnung je Person.'), ['Dienstplan importieren', 'go', 'data']);
  else if (noRoster) add('warn', 'Für ' + nf(noRoster) + ' Personen fehlt der Dienstplan.', ['Daten prüfen', 'go', 'data']);
  if (S.meta.simulated.roster && S.meta.dataClass !== 'demo') add('warn', 'Der Dienstplan ist simuliert, nicht der freigegebene Plan.', ['Realen Dienstplan laden', 'go', 'data']);
  if (S.meta.simulated.absences && S.meta.dataClass !== 'demo') add('warn', 'Urlaub und Abwesenheiten sind simuliert.', ['Finale Abwesenheiten laden', 'go', 'data']);
  if (!S.holidays.length) add('warn', 'Keine Feiertage hinterlegt – Ausbildungstage können auf Feiertage fallen.', ['Feiertage eintragen', 'go', 'absences']);
  if (SUM.clusters.offen) add('info', nf(SUM.clusters.offen) + ' Personen ohne Clusterzuordnung werden nicht geplant.', ['Personen ansehen', 'cluster-jump', 'offen']);
  const c5 = S.people.filter(p => p.cluster === '5' && (!p.target || !p.level)).length;
  if (c5) add('warn', nf(c5) + ' Personen in Cluster 5 ohne Zielmuster oder Zielstufe.', ['Personen ansehen', 'cluster-jump', '5']);
  const assumed = S.people.filter(p => p.targetAssumed).length;
  if (assumed) add('info', 'Zielmuster von ' + nf(assumed) + ' Personen in Cluster 5 sind Annahmen und fachlich zu bestätigen.');
  if (!st.cap) add('info', 'Szenariomodus: Kapazitätsgrenzen werden bei der Planung nicht verbindlich geprüft.', ['Einstellungen', 'go', 'capacity']);
  if (SUM.unknownDays && st.cap) add('warn', 'An ' + nf(SUM.unknownDays) + ' Diensttagen in M1 ist die Kapazität nicht prüfbar.', ['Kapazität ansehen', 'go', 'capacity']);
  if (!h.some(x => x.lvl === 'crit' || x.lvl === 'warn')) add('good', 'Keine offenen Punkte: Plan ist konfliktfrei und hält alle Grenzen ein.');
  return h;
}
ACT['cluster-jump'] = t => { UI.cluster = t.dataset.id; go('people'); };
ACT['cluster-year'] = t => { UI.cluster = t.dataset.id; go('year'); };
VIEWS.overview = {
  render() {
    if (!S.people.length) return html`<div class="view-head"><div><h1>Übersicht</h1></div></div>
      <div class="card empty"><b>Dieses Projekt enthält noch keine Personen</b>Importieren Sie Stammdaten, laden Sie eine vorhandene Projektdatei oder sehen Sie sich das Werkzeug mit synthetischen Demo-Daten an.
      <div class="row" style="justify-content:center;margin-top:14px"><button class="btn primary" data-act="go" data-id="data">Daten importieren</button><button class="btn" data-act="load-project">Datei laden</button><button class="btn" data-act="load-demo">Demo-Daten erzeugen</button></div></div>`;
    const a = areaKnown(UI.capArea) ? UI.capArea : 0, ks = [0, 1, 2].map(s => a * 3 + s), r = SUM.route, n = IX.n;
    const wz = SUM.worstZero, schoolCells = raw(Array.from(IX.school, v => v ? '<i class="on"></i>' : '<i></i>').join(''));
    const seg = [['Vollständig geplant', r.complete, 'var(--good)', ''], ['Teilweise geplant', r.partial, 'var(--warn)', 'dark'], ['Ohne Termine', r.none, 'var(--crit)', ''], ['Cluster offen', r.unassigned, 'var(--t-other)', ''], ['Ausgeschlossen', r.locked, 'var(--line-2)', 'dark']].filter(x => x[1] > 0);
    const maxC = Math.max(1, ...Object.values(SUM.clusters)), hours = S.settings.hours;
    const res = [['Mentor', 'mentor'], ['TEC', 'tec'], ['Prüfer', 'examiner'], ['Vorbereitung', 'prep']], maxM = Math.max(1e-9, ...SUM.monthly.flatMap(m => res.map(x => m[x[1]])));
    return html`
    <div class="view-head"><div><h1>Übersicht ${S.meta.year}</h1><p>${S.meta.source || 'Jahresplanung Qualifizierung und Kapazität'}</p></div><span class="sp"></span>
      <button class="btn noprint" data-act="print">Drucken</button></div>
    ${S.meta.dataClass === 'demo' ? html`<div class="banner"><span><b>Sie sehen synthetische Demo-Daten.</b> Reale Stammdaten, Dienstpläne und Abwesenheiten laden Sie erst in Ihrer geschützten Umgebung – dieses Programm überträgt nichts.</span><span class="sp"></span><button class="btn sm" data-act="go" data-id="data">Daten & Datenschutz</button></div>` : ''}
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="margin-bottom:10px"><h3 style="font-size:14.5px;font-weight:650">Jahresampel · Kapazität je Dienst und Tag</h3>
        ${[1, 2].some(areaKnown) ? html`<select data-chg="ui" data-f="capArea" aria-label="Bereich">${opts(Core.AREAS.map((x, i) => [i, x]), a)}</select>` : html`<span class="muted small">Bereich ${Core.AREAS[a]}</span>`}
        <span class="sp"></span>
        </div>
      <div style="margin-bottom:10px">${capLegend()}</div>
      <div class="ampel" style="--n:${n}">
        <span></span><div class="months">${monthsRow()}</div>
        ${ks.map(k => html`<span class="lab">${Core.kShift(k)}</span><div class="cells" data-tk="capcell" data-k="${k}" data-act="day-cell" role="img" aria-label="Kapazität ${Core.kShift(k)} je Tag">${capCells(k)}</div>`)}
        <span class="lab">Ferien</span><div class="cells band">${schoolCells}</div>
      </div>
      <p class="small ink2" style="margin-top:10px">${nf(SUM.underMin)} Diensttage unter Minimum · ${nf(SUM.underZero)} unter 0-Punkt${wz ? html` · knappster Tag: ${dayLabel(wz.d)}, ${Core.kShift(wz.k)} (Δ0 ${sgn(wz.v)})` : ''}.<span class="noprint"> Tag anklicken für die Aufschlüsselung.</span></p>
    </div>
    <div class="kpis" style="margin-bottom:14px">
      <button class="kpi" data-act="go" data-id="people"><div class="l">Personen</div><div class="v">${nf(SUM.people)}</div><div class="s">${nf(SUM.eligible)} mit Ausbildungsweg</div></button>
      <button class="kpi" data-act="go" data-id="report"><div class="l">Wege vollständig geplant</div><div class="v">${nf(r.complete)}</div><div class="s">von ${nf(SUM.eligible)} · ${nf(r.partial)} teilweise</div></button>
      <button class="kpi" data-act="go" data-id="events"><div class="l">Termine</div><div class="v">${nf(SUM.events)}</div><div class="s">${nf(SUM.auto)} berechnet · ${nf(SUM.fixed + SUM.scenario)} fixiert</div></button>
      <button class="kpi ${SUM.underMin ? 'crit' : ''}" data-act="go" data-id="capacity"><div class="l">Diensttage unter Minimum</div><div class="v">${nf(SUM.underMin)}</div><div class="s">von ${nf(SUM.knownDays)} geprüften</div></button>
      <button class="kpi ${SUM.underZero ? 'warn' : ''}" data-act="go" data-id="capacity"><div class="l">Diensttage unter 0-Punkt</div><div class="v">${nf(SUM.underZero)}</div><div class="s">${wz ? 'kleinste Reserve ' + sgn(wz.v) : 'keine Tagesdaten'}</div></button>
      <button class="kpi ${CONF.size ? 'crit' : ''}" data-act="go" data-id="report"><div class="l">Termine mit Konflikt</div><div class="v">${nf(CONF.size)}</div><div class="s">${nf(SUM.trainingDays)} Ausbildungstage geplant</div></button>
    </div>
    ${yearCompareCard()}
    <div class="gridA" style="margin-bottom:14px">
      <div class="card"><h3>Stand der Ausbildungswege</h3><div class="sub">${nf(SUM.people)} Personen nach Planungsstand</div>
        <div class="segbar" role="img" aria-label="${seg.map(x => x[0] + ' ' + x[1]).join(', ')}">${seg.map(x => html`<span class="${x[3]}" style="flex:${x[1]};background:${x[2]}" data-tip="${x[0]}: ${x[1]} Personen (${nf(x[1] / SUM.people * 100)} %)">${x[1] / SUM.people > 0.045 ? x[1] : ''}</span>`)}</div>
        <div class="legend" style="margin-top:10px">${seg.map(x => html`<span><i class="sw" style="background:${x[2]}"></i>${x[0]} <b class="num">${x[1] / SUM.people > 0.045 ? '' : x[1]}</b></span>`)}</div>
        <h3 style="margin-top:18px">Ressourcenbindung je Monat</h3><div class="sub" style="color:var(--ink-2);font-size:12.5px;margin-bottom:10px">Stunden für Mentor, TEC und Prüfer bei ${nf(hours, 1)} h je Arbeitstag · Januar bis Dezember</div>
        <div class="minis">${res.map(([label, key]) => html`<span class="ink2">${label}</span>
          <div class="bars">${SUM.monthly.map((m, i) => html`<i style="height:${Math.round(m[key] / maxM * 100)}%" data-tip="${label} · ${MONL[i]}: ${nf(m[key] * hours)} h (${nf(m[key], 1)} Kapazitätstage)"></i>`)}</div>
          <b class="num">${nf(SUM.resources[key] * hours)} h</b>`)}</div>
      </div>
      <div class="stack">
        <div class="card"><h3>Cluster</h3><div class="sub">Anklicken zeigt die Personen im Jahresplan</div>
          <div class="meter">${Object.keys(Core.CLUSTERS).filter(k => SUM.clusters[k]).map(k => html`
            <button data-act="cluster-year" data-id="${k}"><span class="nm">${clusterLabel(k)}</span><span class="tr"><i style="width:${SUM.clusters[k] / maxC * 100}%"></i></span><span class="vv">${SUM.clusters[k]}</span></button>`)}</div></div>
        <div class="card"><h3>Hinweise und offene Punkte</h3><div class="sub">Aus dem aktuellen Daten- und Planungsstand abgeleitet</div>
          <ul class="hints">${buildHints().map(x => html`<li><span class="ic ${x.lvl}" aria-hidden="true">${x.lvl === 'good' ? '✓' : x.lvl === 'info' ? 'i' : '!'}</span><span class="grow">${x.text}</span>${x.act ? html`<button class="btn sm" data-act="${x.act[1]}" data-id="${x.act[2]}">${x.act[0]}</button>` : ''}</li>`)}</ul></div>
      </div>
    </div>
    ${S.meta.assumptions.length ? html`<details class="card"><summary>Annahmen dieses Szenarios (${S.meta.assumptions.length})</summary><ul class="small ink2" style="margin:8px 0 0;padding-left:18px">${S.meta.assumptions.map(x => html`<li>${x}</li>`)}</ul></details>` : ''}`;
  }
};
CHG.ui = t => { const f = t.dataset.f; UI[f] = t.type === 'checkbox' ? t.checked : /^(capArea|gZoom)$/.test(f) ? +t.value : t.value; render(); };
INP.ui = t => { UI[t.dataset.f] = t.value; clearTimeout(INP._t); INP._t = setTimeout(render, 140); };
