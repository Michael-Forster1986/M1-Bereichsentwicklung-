import * as Core from '../../core/index.js';
import { isDesktop } from '../../platform/desktop.js';
import { html, raw } from '../dom.js';
import { DATA_CLASS, MONL, REPORT_STATUS, dayLabel, fmt, fmtS, nf, originOf, pill, sgn, tcls } from '../format.js';
import { CONF, IX, PRJ, S, SUM, collator, nameOf, privacy, years } from '../state.js';
import { VIEWS } from '../registry.js';
import { areaKnown, capCells, capLegend, monthsRow } from './shared.js';

/* ==========================================================================
 * Ansicht · Gesamtbericht: druckfertige Zusammenfassung eines Planungsjahres
 * Dieselbe Seite dient als Vorschau, für den Druck und für die PDF-Ausgabe.
 * ========================================================================== */
const ORDER = { blocked: 0, open: 1, partial: 2, planned: 3, kept: 4, skipped: 5 };
const zero = v => v ? nf(v) : html`<span class="muted">–</span>`;

VIEWS.fullreport = {
  render() {
    const st = S.settings, r = SUM.route, hours = st.hours, today = new Date().toISOString().slice(0, 10), pi = S.planInfo;
    const conf = [...CONF.values()].filter(c => c.hard.length), rep = S.report.slice().sort((a, b) => ORDER[a.status] - ORDER[b.status] || collator.compare(nameOf(a.pk), nameOf(b.pk)));
    const evs = S.events.slice().sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : collator.compare(nameOf(a.pk), nameOf(b.pk)));
    const months = Core.monthlyFigures(S, IX, SUM), clusters = Core.clusterFigures(S, IX).filter(c => c.people > 0);
    const a = areaKnown(0) ? 0 : [1, 2].find(areaKnown) ?? 0, ks = [0, 1, 2].map(s => a * 3 + s), wz = SUM.worstZero, wm = SUM.worstMin;
    const ys = years(), multi = ys.length > 1 ? ys.map(y => Core.yearFigures(PRJ.years[y])) : [];
    const flag = privacy() ? 'Namen verborgen' : S.meta.dataClass === 'real' ? 'VERTRAULICH · Personendaten' : '';
    const sum = key => months.reduce((s, m) => s + m[key], 0);
    return html`
    <div class="view-head noprint"><div><h1>Gesamtbericht ${S.meta.year}</h1><p>Druckfertige Zusammenfassung: Kennzahlen, Kapazität, Planungsergebnis je Person, Konflikte und Terminliste. Was Sie hier sehen, steht so auch im PDF.</p></div><span class="sp"></span>
      <button class="btn" data-act="go" data-id="report">Zurück zum Bericht</button>
      <button class="btn" data-act="export-xlsx" data-tip="Alle Tabellen als Excel-Arbeitsmappe (.xlsx)">Excel-Arbeitsmappe</button>
      <button class="btn" data-act="print">Drucken</button>
      <button class="btn primary" data-act="export-pdf-report">${isDesktop ? 'Als PDF speichern' : 'Als PDF drucken'}</button></div>
    <article class="doc">
      <header class="doc-head"><div><div class="doc-kicker">M1 Qualifikationscockpit · Gesamtbericht</div><h1>${S.meta.title}</h1>
        <p class="ink2">Planungsjahr ${S.meta.year} · Stand ${fmt(today)} · ${DATA_CLASS[S.meta.dataClass][0]} · ${st.cap ? 'Kapazitätsmodus' : 'Szenariomodus'}${pi && pi.at ? ' · letzte Berechnung ' + fmt(pi.at.slice(0, 10)) : ''}</p></div>
        ${flag ? html`<span class="doc-flag">${flag}</span>` : ''}</header>

      <section><h2>1 · Kennzahlen</h2>
        <div class="kpis">
          <div class="kpi"><div class="l">Personen</div><div class="v">${nf(SUM.people)}</div><div class="s">${nf(SUM.eligible)} mit Ausbildungsweg</div></div>
          <div class="kpi"><div class="l">Wege vollständig geplant</div><div class="v">${nf(r.complete)}</div><div class="s">von ${nf(SUM.eligible)} · ${nf(r.partial)} teilweise · ${nf(r.none)} ohne Termine</div></div>
          <div class="kpi"><div class="l">Termine</div><div class="v">${nf(SUM.events)}</div><div class="s">${nf(SUM.auto)} berechnet · ${nf(SUM.fixed)} fixiert · ${nf(SUM.scenario)} Szenario</div></div>
          <div class="kpi"><div class="l">Ausbildungstage</div><div class="v">${nf(SUM.trainingDays)}</div><div class="s">${nf(SUM.planned)} Personen mit Terminen</div></div>
          <div class="kpi ${SUM.underMin ? 'crit' : ''}"><div class="l">Diensttage unter Minimum</div><div class="v">${nf(SUM.underMin)}</div><div class="s">von ${nf(SUM.knownDays)} geprüften${wm ? ' · kleinste Reserve ' + sgn(wm.v) : ''}</div></div>
          <div class="kpi ${conf.length ? 'warn' : ''}"><div class="l">Termine mit Konflikt</div><div class="v">${nf(conf.length)}</div><div class="s">${nf(SUM.underZero)} Diensttage unter 0-Punkt</div></div>
        </div></section>

      <section><h2>2 · Kapazität im Jahresverlauf · Bereich ${Core.AREAS[a]}</h2>
        <div style="margin-bottom:8px">${capLegend()}</div>
        <div class="ampel" style="--n:${IX.n}"><span></span><div class="months">${monthsRow()}</div>
          ${ks.map(k => html`<span class="lab">${Core.kShift(k)}</span><div class="cells" role="img" aria-label="Kapazität ${Core.kShift(k)} je Tag">${capCells(k)}</div>`)}
          <span class="lab">Ferien</span><div class="cells band">${raw(Array.from(IX.school, v => v ? '<i class="on"></i>' : '<i></i>').join(''))}</div></div>
        <p class="small ink2" style="margin-top:8px">${st.cap ? 'Kapazität wird verbindlich geprüft.' : 'Szenariomodus: Termine sind ohne verbindliche Kapazitätsprüfung verteilt.'}
          ${wz ? html` Knappster Tag: ${dayLabel(wz.d)}, ${Core.kArea(wz.k)} ${Core.kShift(wz.k)} (Abstand zum 0-Punkt ${sgn(wz.v)}${wm ? ', zum Minimum ' + sgn(wm.v) : ''}).` : ' Keine prüfbaren Diensttage – Grenzwerte oder Dienstplan fehlen.'}
          ${S.meta.simulated.roster ? ' Der Dienstplan ist simuliert.' : ''}${S.meta.simulated.absences ? ' Die Abwesenheiten sind simuliert.' : ''}</p></section>

      <section><h2>3 · Ausbildungswege nach Cluster</h2>
        <table class="tbl"><thead><tr><th>Cluster</th><th class="n">Personen</th><th class="n">Vollständig geplant</th><th class="n">Teilweise geplant</th><th class="n">Ohne Termine</th><th class="n">Ohne Weg</th></tr></thead><tbody>
          ${clusters.map(c => html`<tr><td>${c.cluster === 'offen' || c.cluster === 'ausgeschlossen' ? c.label : c.cluster + ' · ' + c.label}</td><td class="n">${nf(c.people)}</td><td class="n">${zero(c.complete)}</td><td class="n">${zero(c.partial)}</td><td class="n">${zero(c.none)}</td><td class="n">${zero(c.other)}</td></tr>`)}
          <tr class="total"><td>Gesamt</td><td class="n">${nf(SUM.people)}</td><td class="n">${nf(r.complete)}</td><td class="n">${nf(r.partial)}</td><td class="n">${nf(r.none)}</td><td class="n">${nf(r.locked + r.unassigned)}</td></tr></tbody></table></section>

      <section><h2>4 · Monatswerte</h2>
        <table class="tbl"><thead><tr><th>Monat</th><th class="n">Arbeitstage</th><th class="n">Ausbildungstage</th><th class="n">Mentor (h)</th><th class="n">TEC (h)</th><th class="n">Prüfer (h)</th><th class="n">Vorbereitung (h)</th><th class="n">Unter Minimum</th><th class="n">Unter 0-Punkt</th><th class="n">Abwesende Diensttage</th></tr></thead><tbody>
          ${months.map(m => html`<tr><td>${MONL[m.month]}</td><td class="n">${nf(m.workdays)}</td><td class="n">${zero(m.training)}</td><td class="n">${zero(Math.round(m.mentor * hours))}</td><td class="n">${zero(Math.round(m.tec * hours))}</td><td class="n">${zero(Math.round(m.examiner * hours))}</td><td class="n">${zero(Math.round(m.prep * hours))}</td>
            <td class="n ${m.underMin ? 'd-crit' : ''}">${zero(m.underMin)}</td><td class="n">${zero(m.underZero)}</td><td class="n">${zero(m.absent)}</td></tr>`)}
          <tr class="total"><td>Jahr</td><td class="n">${nf(sum('workdays'))}</td><td class="n">${nf(sum('training'))}</td><td class="n">${nf(Math.round(sum('mentor') * hours))}</td><td class="n">${nf(Math.round(sum('tec') * hours))}</td><td class="n">${nf(Math.round(sum('examiner') * hours))}</td><td class="n">${nf(Math.round(sum('prep') * hours))}</td><td class="n">${nf(sum('underMin'))}</td><td class="n">${nf(sum('underZero'))}</td><td class="n">${nf(sum('absent'))}</td></tr></tbody></table>
        <p class="small muted" style="margin-top:6px">Stunden bei ${nf(hours, 1)} h je Arbeitstag. „Unter Minimum“ und „Unter 0-Punkt“ zählen Diensttage je Bereich und Dienst.</p></section>

      ${multi.length ? html`<section><h2>Jahresvergleich</h2>
        <table class="tbl"><thead><tr><th>Planungsjahr</th><th class="n">Personen</th><th class="n">Wege vollständig</th><th class="n">teilweise</th><th class="n">ohne Termine</th><th class="n">Ausbildungstage</th><th class="n">Konflikte</th><th class="n">Unter Minimum</th><th class="n">Unter 0-Punkt</th></tr></thead><tbody>
          ${multi.map(f => html`<tr><td>${f.year}${f.year === S.meta.year ? html` <span class="muted xs">dieser Bericht</span>` : ''}</td><td class="n">${nf(f.people)}</td><td class="n">${nf(f.complete)}</td><td class="n">${zero(f.partial)}</td><td class="n">${zero(f.none)}</td><td class="n">${nf(f.trainingDays)}</td><td class="n">${zero(f.conflicts)}</td><td class="n">${zero(f.underMin)}</td><td class="n">${zero(f.underZero)}</td></tr>`)}</tbody></table></section>` : ''}

      <section class="pb"><h2>5 · Konflikte in Terminen (${nf(conf.length)})</h2>
        ${conf.length ? html`<table class="tbl"><thead><tr><th>Person</th><th>Maßnahme</th><th>Zeitraum</th><th>Konflikt</th><th>Hinweis</th></tr></thead><tbody>
          ${conf.map(c => html`<tr><td>${nameOf(c.pk)}</td><td><i class="sw ${tcls(c.type)}"></i> ${c.type}</td><td class="num nowrap">${fmtS(c.start)} – ${fmt(c.end)}</td><td>${c.hard.map(([t, n]) => t + (n > 1 ? ' (' + n + ' Tage)' : '')).join(', ') || '–'}</td><td class="muted">${c.soft.map(([t, n]) => t + ' (' + n + ')').join(', ')}</td></tr>`)}</tbody></table>`
          : html`<div class="note good">Keine Konflikte: alle Termine liegen auf zulässigen Tagen.</div>`}</section>

      <section class="pb"><h2>6 · Planungsergebnis je Person (${nf(rep.length)})</h2>
        ${rep.length ? html`<table class="tbl"><thead><tr><th>Person</th><th>Cluster</th><th>Ergebnis</th><th>Begründung</th><th>Noch offen</th></tr></thead><tbody>
          ${rep.map(x => { const p = IX.people.get(x.pk), s = REPORT_STATUS[x.status] || [x.status, '']; return html`<tr><td>${nameOf(x.pk)}</td><td class="muted">${p ? p.cluster : ''}</td><td class="nowrap">${pill(s[0], s[1])}</td><td>${x.reason}</td><td class="muted">${(x.remaining || []).join(', ')}</td></tr>`; })}</tbody></table>`
          : html`<div class="note">Noch kein Planungsergebnis – „Neu berechnen“ erzeugt den Bericht.</div>`}</section>

      <section class="pb"><h2>7 · Terminliste (${nf(evs.length)})</h2>
        ${evs.length ? html`<table class="tbl"><thead><tr><th>Person</th><th>Maßnahme</th><th>Beginn</th><th>Ende</th><th class="n">Tage</th><th>Herkunft</th><th>Prüfung</th></tr></thead><tbody>
          ${evs.map(e => { const cf = CONF.get(e.id), hard = cf && cf.hard.length; return html`<tr><td>${nameOf(e.pk)}</td><td><i class="sw ${tcls(e.type)}"></i> ${e.title ? e.title + ' · ' : ''}${e.type}${e.partial ? html` <span class="muted xs">Teilweg</span>` : ''}</td><td class="num nowrap">${fmt(e.start)}</td><td class="num nowrap">${fmt(e.end)}</td><td class="n">${(IX.evDays.get(e.id) || []).length}</td><td class="muted">${originOf(e)}</td><td>${hard ? html`<span style="color:var(--crit-ink)">${cf.hard.map(h => h[0]).join(', ')}</span>` : cf ? html`<span class="muted">${cf.soft.map(h => h[0]).join(', ')}</span>` : html`<span class="muted">ohne Befund</span>`}</td></tr>`; })}</tbody></table>`
          : html`<div class="note">Noch keine Termine.</div>`}</section>

      <section><h2>8 · Annahmen und Grenzen</h2>
        ${S.meta.assumptions.length ? html`<ul class="doc-list">${S.meta.assumptions.map(x => html`<li>${x}</li>`)}</ul>` : ''}
        <ul class="doc-list"><li>${Core.NOTICE}</li>
          <li>Alle Köpfe zählen gleich; Skill-Mix, Arbeitszeitregeln, Ruhezeiten und Betriebsvereinbarungen werden nicht geprüft.</li>
          <li>Mentor-, TEC- und Prüferwerte sind Planungsäquivalente, keine namentliche Verfügbarkeitsprüfung. Krankenquoten sind Planungsannahmen, keine Prognose.</li>
          <li>Der Variantenvergleich des Planers ist eine Heuristik ohne Optimalitätsnachweis.</li></ul></section>
    </article>`;
  }
};
