import * as Core from '../core/index.js';
import { nextFrame } from './files.js';
import { $, html, raw, setHTML } from './dom.js';
import { nf } from './format.js';
import { IX, S, SUM, commit } from './state.js';
import { closeModal, modalHandlers, openModal, toast } from './dialogs.js';
import { ACT } from './registry.js';
import { go } from './shell.js';

// ---------- Neuberechnung mit Vorher/Nachher-Vergleich -----------------------
function planMetrics(st, ix, sum) {
  return { complete: sum.route.complete, partial: sum.route.partial, none: sum.route.none, underMin: sum.underMin, underZero: sum.underZero,
    days: sum.trainingDays, conflicts: Core.findConflicts(st, ix).length, events: st.events.length };
}
ACT.plan = () => {
  const hasScenario = S.events.some(e => e.synthetic && !e.auto), fixed = S.events.filter(e => !e.auto && !e.synthetic).length, st = S.settings;
  if (!S.people.length) return toast('Noch keine Personen geladen – zuerst Stammdaten importieren', 'crit', { label: 'Zu den Daten', run: () => go('data') });
  openModal({ title: 'Jahresplanung berechnen', wide: true, body: html`
    <p class="ink2">Berechnete Termine werden neu verteilt. Fixierte Termine (${nf(fixed)}) bleiben stehen und zählen zum Ausbildungsweg. Das Ergebnis sehen Sie zuerst im Vergleich – übernommen wird erst nach Ihrer Bestätigung.</p>
    <div class="stack" id="planOpts">
      <label class="f">Reihenfolge der Personen
        <select id="planMode">
          <option value="64">Varianten vergleichen – gründlich (64 Reihenfolgen, empfohlen)</option>
          <option value="16">Varianten vergleichen – schnell (16 Reihenfolgen)</option>
          <option value="256">Varianten vergleichen – maximal (256 Reihenfolgen)</option>
          <option value="prio">Nur nach Planungspriorität (1 zuerst)</option>
          <option value="list">Nur in Listenreihenfolge</option>
        </select></label>
      <label class="c"><input type="checkbox" id="planZero" ${st.preferZero !== false ? raw('checked') : ''} ${st.cap && st.goal === 'min' ? '' : raw('disabled')}> 0-Punkt bevorzugen – erst wenn ein Weg sonst nicht in das Jahr passt, bis zum Minimum gehen</label>
      <label class="c"><input type="checkbox" id="planPartial" ${st.allowPartial !== false ? raw('checked') : ''}> Teilwege zulassen – begonnene Wege einplanen, auch wenn sie ${S.meta.year} nicht vollständig abschließen</label>
      ${hasScenario ? html`<label class="c"><input type="checkbox" id="planScenario"> Szenariotermine (simuliert) ebenfalls neu verteilen – echte fixierte Termine bleiben</label>` : ''}
    </div>
    <div id="planRun" hidden><div class="progress"><i></i></div><p class="small muted" style="margin-top:6px" id="planMsg">Berechnung läuft …</p></div>
    <div id="planResult"></div>`,
    footer: html`<button class="btn" data-act="modal-close">Schließen</button><button class="btn primary" data-act="m:run" id="planGo">Berechnen</button>`,
    handlers: { run: runPlanDialog } });
};
async function runPlanDialog() {
  const modeV = $('#planMode').value, opt = { replaceSynthetic: !!$('#planScenario')?.checked, allowPartial: $('#planPartial').checked };
  const preferZero = $('#planZero').checked;
  const work = Core.clone(S); work.settings.preferZero = preferZero; work.settings.allowPartial = opt.allowPartial;
  const ix = Core.buildIndex(work), btn = $('#planGo');
  btn.disabled = true; $('#planRun').hidden = false; $('#planResult').innerHTML = '';
  const t0 = performance.now(); let best = null, tried = 0;
  if (modeV === 'list' || modeV === 'prio') {
    const order = modeV === 'prio' ? Core.planVariants(work, 1)[0].order : null;
    const res = Core.runPlan(work, ix, { ...opt, order });
    best = { ...res, score: Core.scorePlan(work, ix, res), variant: modeV === 'prio' ? 'Planungspriorität' : 'Listenreihenfolge' }; tried = 1;
  } else {
    const variants = Core.planVariants(work, +modeV);
    for (const v of variants) {
      const res = Core.runPlan(work, ix, { ...opt, order: v.order }), score = Core.scorePlan(work, ix, res);
      if (Core.betterScore(score, best && best.score)) best = { ...res, score, variant: v.name };
      tried++;
      if (tried % 4 === 0) { $('#planRun .progress i').style.width = Math.round(tried / variants.length * 100) + '%'; $('#planMsg').textContent = tried + ' von ' + variants.length + ' Reihenfolgen geprüft …'; await nextFrame(); if ($('#modal').hidden) return; }
    }
  }
  $('#planRun').hidden = true; btn.disabled = false; btn.textContent = 'Erneut berechnen';
  const next = Core.clone(work); next.events = best.events; next.report = best.report;
  const nix = Core.buildIndex(next), nsum = Core.summarize(next, nix);
  const a = planMetrics(S, IX, SUM), b = planMetrics(next, nix, nsum);
  const row = (label, key, goodUp) => { const d = b[key] - a[key]; return html`<div>${label}</div><div class="n">${nf(a[key])}</div><div class="n"><b>${nf(b[key])}</b></div><div class="n ${d === 0 ? 'muted' : (d > 0) === goodUp ? 'up' : 'down'}">${d === 0 ? '±0' : (d > 0 ? '+' : '−') + nf(Math.abs(d))}</div>`; };
  setHTML($('#planResult'), html`
    <div class="cmp"><div class="h">Kennzahl</div><div class="h n">Aktuell</div><div class="h n">Neu</div><div class="h n">Änderung</div>
      ${row('Ausbildungswege vollständig geplant', 'complete', true)}${row('Teilweise geplant', 'partial', false)}${row('Ohne Termine (offen / blockiert)', 'none', false)}
      ${row('Diensttage unter Minimum', 'underMin', false)}${row('Diensttage unter 0-Punkt', 'underZero', false)}
      ${row('Geplante Ausbildungstage', 'days', true)}${row('Termine mit Konflikten', 'conflicts', false)}</div>
    <p class="small muted">${tried > 1 ? nf(tried) + ' Reihenfolgen verglichen · beste: ' + best.variant : best.variant} · ${nf(performance.now() - t0)} ms. Heuristik ohne Optimalitätsnachweis; die Kapazitätsgrenzen werden für jeden Tag einzeln geprüft.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="m:apply">Plan übernehmen</button></div>`);
  modalHandlers.apply = () => {
    closeModal();
    commit('Jahresplanung übernommen: ' + b.complete + ' Wege vollständig, ' + b.partial + ' teilweise', () => {
      S.settings.preferZero = preferZero; S.settings.allowPartial = opt.allowPartial;
      S.events = best.events; S.report = best.report;
      S.planInfo = { at: new Date().toISOString(), mode: modeV, variant: best.variant, tried };
    });
  };
}
