import * as Core from '../core/index.js';
import { html, raw } from './dom.js';
import { pill } from './format.js';
import { PRJ, S, dirty, practiceOn, replaceState, setPractice, years } from './state.js';
import { confirmDlg } from './dialogs.js';
import { ACT, CHG } from './registry.js';
import { go, render } from './shell.js';

/* ==========================================================================
 * Oberfläche · Übungsmodus
 * Im Normalbetrieb startet das Programm leer; Daten werden einzeln eingespielt oder ein Projekt geöffnet.
 * Der Übungsmodus füllt das Fenster mit vollständig simulierten Daten zum Einarbeiten. Der Schalter bleibt
 * gespeichert: Wer im Übungsmodus beendet, startet wieder dort.
 * ========================================================================== */
/** Enthält das Fenster Arbeit mit echten Daten, die beim Umschalten aus dem Fenster genommen würde? */
const realWork = () => years().some(y => PRJ.years[y].people.length && PRJ.years[y].meta.dataClass !== 'demo');

export async function practiceStart() {
  if (realWork() && !await confirmDlg('Übungsmodus einschalten', 'Das Fenster zeigt danach simulierte Daten zum Ausprobieren. Ihr aktueller Stand wird dafür aus dem Fenster genommen'
    + (dirty ? ' – er enthält ungespeicherte Änderungen. Speichern Sie ihn vorher, wenn Sie ihn behalten möchten.' : '; die gespeicherte Projektdatei bleibt unberührt.') + ' Mit „Rückgängig“ kommen Sie zurück.', 'Übungsmodus einschalten')) return render();
  setPractice(true);
  replaceState(Core.demoState({ year: Core.planningYear() }), 'Übungsmodus eingeschaltet – alle Personen, Dienste, Abwesenheiten und Termine sind simuliert');
  go('overview');
}
export async function practiceStop() {
  if (!practiceOn() && S.meta.dataClass !== 'demo') return render();
  setPractice(false);
  if (S.meta.dataClass !== 'demo') return render();                    // es liegt bereits ein eigenes Projekt im Fenster
  replaceState(Core.emptyState(Core.planningYear()), 'Übungsmodus beendet – das Programm ist leer. Spielen Sie Ihre Daten ein oder öffnen Sie Ihr Projekt.');
  go('overview');
}
ACT['practice-on'] = () => practiceStart();
ACT['practice-off'] = () => practiceStop();
ACT['practice-toggle'] = () => (practiceOn() ? practiceStop() : practiceStart());
CHG.practice = t => (t.checked ? practiceStart() : practiceStop());

/** Karte für „Daten & Datenschutz“: Schalter und Erklärung. */
export function practiceCard() {
  const on = practiceOn();
  return html`<div class="card" id="practiceCard" style="margin-bottom:14px">
    <div class="row"><h3 style="font-size:14.5px;font-weight:650">Übungsmodus</h3>${on ? pill('eingeschaltet – alle Daten sind simuliert', 'info') : pill('aus – Normalbetrieb', 'good')}<span class="sp"></span>
      ${on ? html`<button class="btn sm" data-act="load-demo" data-tip="Andere Personenzahl oder anderes Jahr">Übungsdaten neu erzeugen …</button>` : ''}
      <label class="c"><input type="checkbox" data-chg="practice" ${on ? raw('checked') : ''}> <span><b>Simulierte Daten zum Einarbeiten</b></span></label></div>
    <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:4px 0 0">${on
    ? 'Das Fenster zeigt erfundene Personen mit Dienstplan, Urlaub, Lehrgängen und berechnetem Jahresplan – zum gefahrlosen Ausprobieren aller Funktionen. Ausschalten leert das Programm; danach spielen Sie Ihre eigenen Daten ein oder öffnen Ihr Projekt.'
    : 'Im Normalbetrieb startet das Programm leer. Ihre Daten spielen Sie einzeln ein (Personen, Urlaubsplan, Lehrgänge, Dienstplan) oder öffnen ein gespeichertes Projekt. Zum Einarbeiten füllt der Übungsmodus das Fenster mit simulierten Daten; die Einstellung bleibt bis zum Ausschalten gespeichert.'}</div></div>`;
}
/** Leerer Normalbetrieb: führt durch das Einspielen der einzelnen Daten und bietet den Übungsmodus an. */
export function emptyStart() {
  const step = (n, title, text) => html`<li><span class="ic">${n}</span><span class="grow"><b>${title}.</b> ${text}</span></li>`;
  return html`<div class="view-head"><div><h1>Übersicht</h1><p>Das Programm ist leer. Spielen Sie Ihre Daten Schritt für Schritt ein oder öffnen Sie ein gespeichertes Projekt.</p></div></div>
    <div class="grid2">
      <div class="card" id="startCard"><h3>Eigene Daten einspielen</h3><div class="sub">Jeder Schritt einzeln, mit Prüfung und Vorschau – unter „Daten & Datenschutz“</div>
        <ul class="hints">
          ${step(1, 'Personen & Cluster', 'Stammdaten als CSV oder Excel: Personalnummer, Name, Bereich, Dienst, Cluster, Qualifikationen.')}
          ${step(2, 'Urlaubsplan', 'Excel-Tabelle mit einer Zeile je Person und einer Spalte je Tag; die Kürzel ordnen Sie beim Einspielen zu.')}
          ${step(3, 'Lehrgangstermine', 'Feste Termine einspielen; für den übrigen Bedarf berechnet das Programm die besten Zeiträume.')}
          ${step(4, 'Dienstplan', 'Sobald er vorliegt. Bis dahin gilt für jede Person ihr Dienst aus den Stammdaten.')}
          ${step(5, 'Neu berechnen', 'Verteilt die Ausbildungswege auf zulässige Tage und prüft jeden Tag gegen die Grenze der Produktion.')}</ul>
        <div class="row" style="margin-top:12px"><button class="btn primary" data-act="go" data-id="data">Daten einspielen</button><button class="btn" data-act="load-project">Projekt öffnen</button></div></div>
      <div class="card"><h3>Erst einmal ausprobieren?</h3><div class="sub">Übungsmodus mit simulierten Daten</div>
        <p style="margin:8px 0 12px">Füllt das Fenster mit erfundenen Personen samt Dienstplan, Urlaub, Lehrgängen und berechnetem Jahresplan. So lernen Sie alle Funktionen kennen, ohne echte Daten zu berühren. Nichts davon ist real, und ein Klick leert das Programm wieder.</p>
        <button class="btn" data-act="practice-on">Übungsmodus einschalten</button>
        <p class="small muted" style="margin-top:10px">Ein- und ausschalten können Sie den Übungsmodus jederzeit unter „Daten & Datenschutz“.</p></div>
    </div>`;
}
