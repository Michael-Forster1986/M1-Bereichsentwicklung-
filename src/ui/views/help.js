import * as Core from '../../core/index.js';
import { desktop, isDesktop } from '../../platform/desktop.js';
import { $, html, raw } from '../dom.js';
import { tcls } from '../format.js';
import { S } from '../state.js';
import { ACT, VIEWS } from '../registry.js';
import { capLegend } from './shared.js';

/* ==========================================================================
 * Ansicht · Anleitung
 * Links das Inhaltsverzeichnis, rechts die Kapitel. Schaubilder sind aus den Bausteinen der Oberfläche
 * gebaut, damit Anleitung und Programm gleich aussehen.
 * ========================================================================== */
const TOC = [
  ['h-ueberblick', 'Überblick'], ['h-start', 'Schritt für Schritt zum Jahresplan'], ['h-urlaub', 'Urlaubsplan einspielen'], ['h-lehrgang', 'Lehrgänge planen'],
  ['h-plan', 'Neu berechnen'], ['h-ziehen', 'Jahresplan: Ziehen und Ablegen'], ['h-kap', 'Kapazität verstehen'], ['h-wege', 'Cluster und Ausbildungswege'],
  ['h-jahre', 'Mehrere Planungsjahre'], ['h-berichte', 'Speichern, Berichte, Dateien'], ['h-daten', 'Datenschutz'], ['h-fragen', 'Häufige Fragen'], ['h-begriffe', 'Begriffe'], ['h-grenzen', 'Grenzen des Werkzeugs']
];
ACT['help-jump'] = t => { const el = $('#' + t.dataset.id); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); };

const go = (view, label) => html`<button class="btn sm" data-act="go" data-id="${view}">${label}</button>`;
const step = (n, title, body) => html`<li><span class="h-no">${n}</span><div><b>${title}</b><div>${body}</div></div></li>`;
const kbd = (...keys) => keys.map((k, i) => html`${i ? ' + ' : ''}<kbd>${k}</kbd>`);
const term = (word, text) => html`<div class="h-term"><dt>${word}</dt><dd>${text}</dd></div>`;
const faq = (q, a) => html`<details class="h-faq"><summary>${q}</summary><div>${a}</div></details>`;
const sw = t => html`<i class="sw ${tcls(t)}"></i>`;

/** Schaubild: der Weg vom Datenbestand zum Jahresplan. */
const flow = () => html`<div class="h-flow" role="img" aria-label="Ablauf: Personen und Cluster, Urlaubsplan, Lehrgänge, Neu berechnen, Prüfen und Berichte">
  ${[['1', 'Personen & Cluster', 'Wer wird wohin entwickelt?', 'people'], ['2', 'Urlaubsplan', 'Wer ist wann nicht da?', 'data'], ['3', 'Lehrgänge', 'Welche Blöcke gibt es, wer nimmt teil?', 'courses'],
    ['4', 'Neu berechnen', 'Der Planer verteilt alle übrigen Schritte', 'year'], ['5', 'Prüfen & Berichte', 'Ampel, Konflikte, PDF, Excel', 'report']]
    .map((x, i) => html`${i ? raw('<span class="h-arrow" aria-hidden="true">→</span>') : ''}<button class="h-box" data-act="go" data-id="${x[3]}"><span class="h-no">${x[0]}</span><b>${x[1]}</b><span>${x[2]}</span></button>`)}</div>`;
/** Schaubild: so sieht ein Urlaubsplan aus, den das Programm lesen kann. */
const sheet = () => html`<div class="h-xls" role="img" aria-label="Beispiel einer Urlaubsplan-Tabelle"><table><tbody>
  <tr class="m"><td></td><td></td><td colspan="5">Januar</td><td colspan="3">Februar</td></tr>
  <tr class="d"><td>PersNr</td><td>Name</td><td>27</td><td>28</td><td>29</td><td>30</td><td>31</td><td>1</td><td>2</td><td>3</td></tr>
  <tr><td>10231</td><td>Muster, Max</td><td class="u">U</td><td class="u">U</td><td class="u">U</td><td></td><td></td><td class="k">K</td><td class="k">K</td><td></td></tr>
  <tr><td>10418</td><td>Beispiel, Erika</td><td></td><td></td><td></td><td></td><td></td><td class="u">U</td><td class="u">U</td><td class="u">U</td></tr>
  <tr><td>10777</td><td>Test, Tom</td><td class="o">ZA</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></tbody></table>
  <div class="h-cap">Eine Zeile je Person · eine Spalte je Tag · Kürzel in den Zellen</div></div>`;
/** Schaubild: was von den Köpfen laut Dienstplan abgeht und wo die Grenzen liegen. */
const capBar = () => html`<div class="h-capbar" role="img" aria-label="Beispiel: 50 Köpfe laut Dienstplan, davon 4 abwesend, 3 Krankenreserve, 6 in Maßnahmen, 37 verfügbar; 0-Punkt 25, Minimum 16">
  <div class="h-seg"><span class="a" style="flex:37"><b>37</b></span><span class="m" style="flex:6"><b>6</b></span><span class="s" style="flex:3"><b>3</b></span><span class="u" style="flex:4"><b>4</b></span></div>
  <div class="h-scale"><i style="left:${16 / 50 * 100}%"><em>Minimum 16</em></i><i style="left:${25 / 50 * 100}%"><em>0-Punkt 25</em></i></div>
  <div class="legend" style="margin-top:6px"><span><i class="sw" style="background:var(--q2)"></i>verfügbar</span><span><i class="sw" style="background:var(--t-logbook)"></i>in Maßnahmen</span><span><i class="sw" style="background:var(--abs-k)"></i>Krankenreserve</span><span><i class="sw" style="background:var(--abs-u)"></i>abwesend</span></div>
  <div class="h-cap">50 Köpfe laut Dienstplan − 4 abwesend − 3 Krankenreserve − 6 in Maßnahmen = <b>37 verfügbar</b>. Reserve über dem 0-Punkt: +12.</div></div>`;

VIEWS.help = {
  render() {
    const y = S.meta.year, save = isDesktop ? 'Speichern' : 'Sichern';
    return html`
    <div class="view-head"><div><h1>Anleitung</h1><p>Vom Einspielen der Daten bis zum fertigen Jahresplan – Schritt für Schritt, mit Beispielen. Die Schaltflächen in der Anleitung führen direkt in die jeweilige Ansicht.</p></div></div>
    <div class="h-wrap">
      <nav class="h-toc noprint" aria-label="Inhalt"><b>Inhalt</b>${TOC.map(([id, label], i) => html`<button data-act="help-jump" data-id="${id}"><span>${i + 1}</span>${label}</button>`)}</nav>
      <div class="h-doc">

      <section class="card" id="h-ueberblick"><h2>1 · Überblick</h2>
        <p>Das Qualifikationscockpit plant die Ausbildungsschritte aller Personen eines Jahres so, dass die Produktion an jedem Tag ausreichend besetzt bleibt. Es kennt die Personen mit ihren Clustern, den Urlaubsplan, den Dienstplan und die Lehrgänge – und verteilt daraus Logbook-Tage, FitChecks und ICAs.</p>
        ${flow()}
        <p class="small ink2">Jede Ansicht links gehört zu einem dieser Schritte. Oben in der Kopfzeile stehen die Dinge, die Sie ständig brauchen: Planungsjahr, „Neu berechnen“, Rückgängig, ${save}.</p></section>

      <section class="card" id="h-start"><h2>2 · Schritt für Schritt zum Jahresplan</h2>
        <h3>Normalbetrieb und Übungsmodus</h3>
        <p>Das Programm startet <b>leer</b>. Ihre Daten spielen Sie einzeln ein oder Sie öffnen ein gespeichertes Projekt. Zum Einarbeiten gibt es den <b>Übungsmodus</b>: Er füllt das Fenster mit erfundenen Personen samt Dienstplan, Urlaub, Lehrgängen und berechnetem Jahresplan.</p>
        <ul class="h-list"><li><b>Einschalten:</b> auf der leeren Übersicht „Übungsmodus einschalten“ oder der Schalter unter ${go('data', 'Daten & Datenschutz')}${isDesktop ? ' (auch Menü Datei → Übungsmodus ein- / ausschalten)' : ''}.</li>
          <li><b>Ausschalten</b> leert das Programm wieder. Die Einstellung bleibt gespeichert: Wer im Übungsmodus beendet, startet auch wieder dort.</li>
          <li>Wer ein eigenes Projekt öffnet oder anlegt, verlässt den Übungsmodus von selbst. In der Kopfzeile steht immer, ob Sie simulierte Daten sehen.</li></ul>
        <h3>Vom leeren Programm zum Jahresplan</h3>
        <p>Jeder Baustein wird einzeln eingespielt, jeweils mit Prüfung und Vorschau. Personen mit Qualifikationen und Clusterzuordnung bleiben bei allen späteren Schritten erhalten.</p>
        <ol class="h-steps">
          ${step(1, 'Personen einspielen oder Projekt öffnen', html`Stammdaten als CSV oder Excel einspielen – oder einen vorhandenen Stand öffnen (${isDesktop ? html`Menü „Datei → Öffnen“ oder ${kbd('Strg', 'O')}` : '„Laden“ in der Kopfzeile'}). Dateien der früheren HTML-Fassung werden als Kopie übernommen. ${go('data', 'Daten & Datenschutz')}`)}
          ${step(2, 'Prüfen, was noch fehlt oder simuliert ist', html`Die Karte <b>„Bereit für die echte Planung?“</b> zeigt je Baustein einen grünen Haken oder ein gelbes Ausrufezeichen. Stammt ein Stand aus dem Übungsmodus, löscht <b>„Simulierte Daten entfernen …“</b> erfundene Abwesenheiten, Szenariotermine und den berechneten Plan – nichts davon betrifft Ihre Personen.`)}
          ${step(3, 'Urlaubsplan einspielen', html`Die Excel-Tabelle des Urlaubsplans wählen und die Kürzel zuordnen. Einzelheiten im nächsten Kapitel. ${go('data', 'Urlaubsplan einspielen')}`)}
          ${step(4, 'Lehrgänge festlegen', html`Feste Lehrgangstermine einspielen; für den übrigen Bedarf die besten Zeiträume berechnen lassen und die Plätze besetzen. ${go('courses', 'Lehrgänge')}`)}
          ${step(5, 'Neu berechnen', html`Der Planer verteilt alle übrigen Schritte um Urlaub und Lehrgänge herum und zeigt das Ergebnis zuerst im Vergleich. Erst „Plan übernehmen“ ändert den Stand.`)}
          ${step(6, 'Nacharbeiten', html`Im Jahresplan einzelne Elemente mit der Maus verschieben oder neu hineinziehen; das Programm prüft sofort die Kapazität. ${go('year', 'Jahresplan')}`)}
          ${step(7, 'Prüfen, speichern, weitergeben', html`Bericht ansehen, ${isDesktop ? html`mit ${kbd('Strg', 'S')} speichern` : 'Projektdatei sichern'}, Gesamtbericht als PDF oder die Excel-Arbeitsmappe ausgeben. ${go('report', 'Bericht')}`)}
        </ol>
        <h3>Dienstplan eintragen</h3>
        <p>In einem neuen Projekt gilt jeder Tag als <b>frei</b>, bis ein Dienst eingetragen ist. Ohne Dienste kann der Planer nichts verteilen. Es gibt zwei Wege:</p>
        <div class="tblwrap"><table class="tbl"><thead><tr><th>Weg</th><th>So geht es</th></tr></thead><tbody>
          <tr><td><b>Schichtplan einspielen</b></td><td>Unter ${go('roster', 'Dienstplan')} die Schaltfläche „Schichtplan einspielen“: die monatliche Excel-Tabelle des Schichtplans – eine Zeile je Person, eine Spalte je Tag, Symbole wie F1, S1, N2, Up. Monat und Jahr erkennt das Programm aus dem Dateinamen oder aus der Tabelle. Personen, die es im Projekt noch nicht gibt, legt es auf Wunsch an.</td></tr>
          <tr><td><b>Symbole zuordnen</b></td><td>Beim ersten Einspielen legen Sie für jedes Symbol fest, was es für die Planung bedeutet: Dienst (Früh, Spät, Nacht), dienstfrei, Urlaub, Krank, sonstige Abwesenheit – oder „ohne Bedeutung“. Die Zuordnung wird gemerkt und beim nächsten Monat vorgeschlagen. Ändern lässt sie sich jederzeit unter „Bedeutung festlegen“; das gilt sofort für alle Tage mit diesem Symbol.</td></tr>
          <tr><td><b>Symbole ansehen</b></td><td>Die Ansicht ${go('roster', 'Dienstplan')} zeigt den Monat wie die Excel-Tabelle, mit den Original-Symbolen; die Farbe steht für die Bedeutung. Dieselben Symbole stehen im Kalender der Person. Wer einen Tag von Hand ändert, ersetzt dort das Symbol.</td></tr>
          <tr><td><b>Als Liste einspielen</b></td><td>Unter ${go('data', 'Daten & Datenschutz')} die Karte „Dienstplan“: Liste oder Tabelle mit einer Zeile je Person und einer Spalte je Tag (F, S, N, Frei). Gilt für alle Personen der Datei.</td></tr>
          <tr><td><b>Je Person von Hand</b></td><td>Person anklicken – die Seitenleiste öffnet sich. <b>„Dienstplan bearbeiten“</b> zeigt sie groß und blendet die Werkzeuge ein.</td></tr></tbody></table></div>
        <div class="tblwrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Werkzeug in der Seitenleiste</th><th>Wirkung</th></tr></thead><tbody>
          <tr><td><b>Eintragen</b></td><td>Dienst (Früh, Spät, Nacht, Frei) und Bereich wählen, dann einen Tag anklicken. Von einem Tag zum anderen ziehen trägt den Zeitraum dazwischen ein – an den gewählten Wochentagen.</td></tr>
          <tr><td><b>Zeitraum füllen</b></td><td>Trägt den gewählten Dienst von–bis an den gewählten Wochentagen ein, z. B. das ganze Jahr Mo–Fr Früh.</td></tr>
          <tr><td><b>Wochenfolge</b></td><td>Der Dienst wechselt wochenweise, z. B. Früh → Spät → Nacht. Die Woche des Startdatums ist Woche 1; übrige Tage des Zeitraums werden frei.</td></tr>
          <tr><td><b>Übernehmen / Übertragen</b></td><td>Den Dienstplan einer anderen Person übernehmen – oder den eigenen auf alle mit gleichem Bereich und Dienst, auf den Cluster oder auf alle übertragen.</td></tr></tbody></table></div>
        <div class="note">Jede Aktion ist ein Schritt für „Rückgängig“. Wer Tage ohne Eintrag lieber mit dem Dienst aus den Stammdaten rechnen lässt, schaltet das unter ${go('capacity', 'Kapazität')} in den Einstellungen um; im Kalender erscheinen solche Tage blass.</div></section>

      <section class="card" id="h-urlaub"><h2>3 · Urlaubsplan einspielen</h2>
        <p>Erwartet wird die übliche Excel-Tabelle: <b>eine Zeile je Person, eine Spalte je Tag</b>, in den Zellen Kürzel. Vorn steht die Personalnummer oder der Name.</p>
        ${sheet()}
        <ol class="h-steps">
          ${step(1, 'Datei wählen', html`Unter „Daten & Datenschutz“ auf <b>„Urlaubsplan einspielen“</b>. Excel (.xlsx) oder CSV. Bei mehreren Tabellenblättern nimmt das Programm das passende und lässt Sie wechseln.`)}
          ${step(2, 'Erkennung prüfen', html`Angezeigt werden Aufbau, Zeitraum und wie viele Personen erkannt wurden. Die Datumszeile darf aus vollen Datumsangaben bestehen oder – wie im Bild – aus Tageszahlen unter den Monatsnamen. Namen werden auch in anderer Schreibweise erkannt („Muster, Max“ = „Max Muster“).`)}
          ${step(3, 'Kürzel zuordnen', html`Jedes gefundene Kürzel erscheint mit der Zahl seiner Tage. Der Vorschlag kennt übliche Kürzel (U = Urlaub, K = Krank, ZA = sonstige Abwesenheit); alles andere steht auf „nicht übernehmen“, bis Sie es zuordnen.`)}
          ${step(4, 'Übernehmen', html`Für die Personen der Tabelle ersetzen die Einträge im Zeitraum der Tabelle alle bisherigen Abwesenheiten – auch die simulierten. Wer nicht in der Tabelle steht, bleibt unverändert. Danach zeigt eine Meldung, ob Termine nun mit Urlaub kollidieren.`)}
        </ol>
        <p class="small ink2">Enthält dieselbe Tabelle auch die Dienste (F, S, N), setzen Sie den Haken „Dienstplan mit übernehmen“ – dann wird für diese Tage auch der Dienstplan gesetzt. Einzelne Abwesenheiten tragen Sie unter ${go('absences', 'Abwesenheiten & Kalender')} von Hand ein.</p></section>

      <section class="card" id="h-lehrgang"><h2>4 · Lehrgänge planen</h2>
        <p>Lehrgänge (TEC, CAT A, CAT Praxis …) finden als <b>zusammenhängender Block für eine Gruppe</b> statt. Sie werden deshalb nicht tageweise verteilt, sondern als eigener Termin mit Plätzen geführt. Die Ansicht führt in vier Schritten von oben nach unten:</p>
        <div class="h-grid">
          <div class="h-tile"><span class="h-no">1</span><b>Bedarf</b><p>Je Lehrgangsart und Zielmuster: wie viele Personen den Lehrgang laut Ausbildungsweg brauchen und wie viele schon einen Platz haben.</p></div>
          <div class="h-tile"><span class="h-no">2</span><b>Lehrgänge im Jahr</b><p>Zeitleiste mit einem Balken je Lehrgang (${sw('Theorie')} Theorie, ${sw('Praxis')} Praxis), darüber die Kapazität je Dienst. Die Zahl im Balken zeigt belegte / vorhandene Plätze.</p></div>
          <div class="h-tile"><span class="h-no">3</span><b>Beste Zeiträume</b><p>Vorschläge des Programms für neue Lehrgänge – größte mögliche Gruppe zuerst.</p></div>
          <div class="h-tile"><span class="h-no">4</span><b>Teilnehmer</b><p>Für den angeklickten Lehrgang: Teilnehmer, wartende Personen und die Kapazität an jedem Lehrgangstag.</p></div>
        </div>
        <h3>Feste Termine einspielen</h3>
        <p>Über <b>„Lehrgangstermine einspielen“</b> laden Sie eine CSV- oder Excel-Liste mit den Spalten <code>Lehrgang; Art; Zielmuster; Beginn; Ende; Plätze</code>. Steht zusätzlich eine Spalte mit der Personalnummer in der Liste, wird je Zeile ein Teilnehmer eingetragen. Als Art gelten „TEC“ und „CAT A“ als Theorie, „CAT Praxis“ als Praxis. Eine leere Vorlage liefert die Schaltfläche daneben.</p>
        <p><b>Module in der Liste:</b> Für Basic Knowledge gibt es die Spalte <code>Modul</code>. Eine Zeile je Modul ohne Personalnummer legt dessen Zeitraum fest (<code>M1</code>, <code>M2</code> …); steht <code>N/A</code> als Beginn, findet das Modul nicht statt – ebenso jedes Modul, das in der Liste fehlt. In einer Teilnehmerzeile nennt die Spalte die Module, die diese Person belegt (<code>M2, M5</code> oder <code>M1–M4</code>); leer heißt: alle. „CSV“ gibt die Lehrgänge in genau diesem Aufbau aus, sodass sich die Liste wieder einspielen lässt.</p>
        <p><b>Welche Arten es gibt,</b> legen Sie unter ${go('routes', 'Ausbildungswege')} in der Tabelle „Schritte und Dienste“ fest: vorhandene Arten umbenennen oder eigene anlegen (Art „Lehrgang“). Im Dialog „Lehrgang anlegen“ wählen Sie nur aus.</p>
        <p><b>Für wen ein Lehrgang gilt,</b> bestimmt das Zielmuster: Ein Lehrgang <i>mit</i> Zielmuster (z. B. A330) ist ein TEC-Lehrgang für Cluster 5 mit genau diesem Muster. Ein Lehrgang <i>ohne</i> Zielmuster gehört zum CAT-A-Kursrahmen der übrigen Cluster. So setzt der Planer niemanden in den Lehrgang einer anderen Gruppe.</p>
        <h3>Basic Knowledge: Module und Teilbeleger</h3>
        <p>Ein Lehrgang der Art <b>Basic Knowledge</b> besteht aus den Modulen M1 bis M${Core.MODULE_COUNT}. Beim Anlegen entscheidet das Kästchen <b>„Teilbeleger dabei“</b>:</p>
        <div class="tblwrap"><table class="tbl"><thead><tr><th>Teilbeleger</th><th>Was Sie eintragen</th><th>Was im Jahresplan steht</th></tr></thead><tbody>
          <tr><td><b>nein</b></td><td>Nur Beginn und Ende des Lehrgangs. Die Module müssen nicht einzeln festgelegt werden.</td><td>Ein Balken je Teilnehmer über den ganzen Zeitraum.</td></tr>
          <tr><td><b>ja</b></td><td>Jedes Modul einzeln: Beginn und Ende – oder <b>N/A</b>, wenn das Modul in diesem Lehrgang nicht stattfindet. Beginn und Ende des Lehrgangs ergeben sich aus den Modulen.</td><td>Ein Abschnitt je Modul (M1, M2 …). Teilbeleger haben nur die Abschnitte ihrer Module; an den übrigen Tagen stehen sie der Produktion zur Verfügung.</td></tr></tbody></table></div>
        <ul class="h-list" style="margin-top:10px"><li><b>Wer welche Module belegt,</b> stellen Sie im Lehrgang beim Teilnehmer über „Module“ ein – oder schon vorher in der Seitenleiste der Person („Module wählen“). Gespeichert wird bei der Person, welche Module sie braucht; das gilt auch für spätere Lehrgänge.</li>
          <li><b>Module ändern:</b> „Module bearbeiten“ im Lehrgang. Die Termine der Teilnehmer folgen; wer danach kein Modul mehr hat, wird ausgetragen und gemeldet.</li>
          <li>„Neu berechnen“ vergibt Plätze modulgenau: Ein Teilbeleger ist nach seinem letzten Modul frei für den nächsten Schritt.</li>
          <li>Die Abschnitte sind im Jahresplan ab der Ansicht „Quartal“ beschriftet; in der Excel-Arbeitsmappe stehen die Module je Lehrgang und je Teilnehmer.</li>
          <li><b>Beste Zeiträume mit Modulen:</b> Im Dialog „Beste Zeiträume berechnen“ das Kästchen „Teilbeleger dabei“ setzen und je Modul die Arbeitstage eintragen (leer = N/A). Das Programm legt die Module nacheinander und prüft jede Person nur an den Tagen ihrer Module; ein übernommener Vorschlag wird ein Lehrgang mit Modulen.</li></ul>
        <h3>Beste Zeiträume berechnen</h3>
        <p>Für jeden möglichen Starttag prüft das Programm: <i>Wer kann teilnehmen, ohne dass an irgendeinem Lehrgangstag die Grenze der Produktion unterschritten wird?</i> Berücksichtigt werden Urlaub, bestehende Termine, die Reihenfolge im Ausbildungsweg (Praxis erst nach Theorie) und die Kranken- und Stressreserve. Es wählt den Zeitraum mit der größten Gruppe, merkt ihn vor und plant die übrigen Personen in weiteren Lehrgängen – so lange, bis alle untergebracht sind oder keine Gruppe mehr die Mindestgröße erreicht.</p>
        <ul class="h-list"><li><b>Plätze je Lehrgang</b> und <b>Mindestgröße</b> bestimmen, wie viele Lehrgänge entstehen.</li>
          <li><b>Grenze 0-Punkt</b> ist die sichere Wahl; „Minimum“ lässt mehr Zeiträume zu, geht aber an die Untergrenze.</li>
          <li><b>Dienstfreie Tage</b> im Lehrgang gelten als Dienstplananpassung: Die Person kommt zum Lehrgang, der Produktion fehlt an diesem Tag niemand. Solche Tage stehen im Bericht als Hinweis, nicht als Konflikt.</li></ul>
        <h3>Plätze besetzen</h3>
        <p>Im angeklickten Lehrgang zeigt die rechte Liste, wer auf diesen Lehrgang wartet und ob die Person teilnehmen kann. <b>„Freie Plätze bestmöglich besetzen“</b> trägt die größte Gruppe ein, die an jedem Tag die Grenze hält. Einzelne Personen tragen Sie mit „Eintragen“ ein – auch gegen den Rat des Programms („Trotzdem eintragen“); der Befund steht dann im Bericht.</p>
        <div class="note good">Bleiben nach dem Besetzen Plätze frei, vergibt „Neu berechnen“ sie automatisch an wartende Personen – auch den Praxis-Lehrgang, den Cluster 3 und 4B als Voraussetzung brauchen. Von Hand eingetragene Teilnehmer bleiben dabei stehen.</div>
        ${go('courses', 'Zu den Lehrgängen')}</section>

      <section class="card" id="h-plan"><h2>5 · Neu berechnen</h2>
        <p>„Neu berechnen“ verteilt alle Schritte der Ausbildungswege auf zulässige Tage. Fixierte Termine und eingetragene Lehrgangsteilnahmen bleiben stehen; nur berechnete Termine werden neu verteilt.</p>
        <ul class="h-list"><li>Ausbildungstage liegen auf Arbeitstagen (Mo–Fr, ohne Feiertage) mit Dienst, nie auf Abwesenheiten.</li>
          <li>Jede Maßnahme liegt nur in den Diensten, die für sie zugelassen sind. Vorgabe: Logbook in jedem Dienst, alles andere nur im Frühdienst – einstellbar unter ${go('routes', 'Ausbildungswege')}.</li>
          <li>Die Schritte eines Wegs werden in der dort festgelegten Reihenfolge geplant.</li>
          <li>Lehrgänge: der Planer vergibt freie Plätze in den vorhandenen Lehrgängen. Gibt es keinen passenden Termin, bleibt der Schritt offen und der Bericht nennt den Grund.</li>
          <li>Die ICA liegt nach allen Kursen und nach dem Abschluss aller Doings; ein Tag Vorbereitung davor bindet nur Prüfer oder TEC. Der Vorbereitungstag ist eine Regel und lässt sich unter ${go('routes', 'Ausbildungswege')} abschalten.</li>
          <li>Planungspriorität 1 kommt zuerst. Innerhalb gleicher Priorität vergleicht das Programm viele Reihenfolgen und nimmt die beste.</li>
          <li>Mit „0-Punkt bevorzugen“ plant es zuerst nur auf Tagen ab der Sollbesetzung und geht erst bei Bedarf bis zum Minimum.</li></ul>
        <p>Das Ergebnis erscheint als Vorher/Nachher-Vergleich. Was nicht planbar war, steht mit Begründung im ${go('report', 'Bericht')}.</p></section>

      <section class="card" id="h-ziehen"><h2>6 · Jahresplan: Ziehen und Ablegen</h2>
        <p>Im Jahresplan hat jede Person eine Zeile, jede Maßnahme einen Balken. Über dem Plan liegt die Leiste <b>„Ziehen und Ablegen“</b>.</p>
        <p><b>Zeitraum wählen:</b> Jahr, Halbjahr, Quartal, Monat oder 2 Wochen. Ab der Ansicht „Monat“ steht über dem Plan jeder einzelne Tag mit Wochentag und Datum. ${kbd('Strg')} und Mausrad zoomt stufenweise hinein und heraus; die Stelle unter dem Mauszeiger bleibt dabei stehen.</p>
        <div class="h-grid">
          <div class="h-tile"><b>Neues Element</b><p>Logbook, FitCheck oder ICA aus der Leiste auf die Zeile einer Person ziehen. Dauer und Betreuung kommen aus ihrem Ausbildungsweg.</p></div>
          <div class="h-tile"><b>Balken verschieben</b><p>Einen vorhandenen Balken mit gedrückter Maustaste nach links oder rechts ziehen. Er wird dabei fixiert.</p></div>
          <div class="h-tile"><b>Lehrgangsplatz</b><p>Einen Lehrgang aus der Leiste auf eine Person ziehen: sie wird als Teilnehmer eingetragen.</p></div>
        </div>
        <p>Schon während des Ziehens zeigt jeder betroffene Tag seine Farbe, und am Mauszeiger steht das Ergebnis:</p>
        <div class="h-legend"><span><i style="background:var(--good)"></i><b>grün</b> – Tag ist frei, die Kapazität reicht</span><span><i style="background:var(--warn)"></i><b>gelb</b> – unter dem 0-Punkt, aber über dem Minimum</span><span><i style="background:var(--crit)"></i><b>rot</b> – unter dem Minimum, oder im Lehrgang abwesend bzw. belegt</span></div>
        <p>Ein Element belegt ab der Ablagestelle die nächsten Tage, an denen die Person im passenden Dienst und frei ist – dienstfreie Tage, Urlaub und belegte Tage werden wie beim Planer übersprungen. Ist alles grün, wird sofort eingetragen. Sonst zeigt ein Dialog jeden kritischen Tag mit der verbleibenden Reserve und bietet an, die knappen Tage auszulassen. <b>Es wird nie stillschweigend gegen die Grenze geplant.</b></p>
        <p class="small ink2">Anklicken statt Ziehen öffnet wie bisher den Termin. Lehrgänge selbst verschiebt man unter „Lehrgänge“, weil der Zeitraum für alle Teilnehmer gilt. ${kbd('Esc')} bricht das Ziehen ab, ${kbd('Strg', 'Z')} macht ein Ablegen rückgängig.</p></section>

      <section class="card" id="h-kap"><h2>7 · Kapazität verstehen</h2>
        <p>Für jeden Tag, jeden Bereich und jeden Dienst rechnet das Programm, wie viele Köpfe der Produktion bleiben:</p>
        ${capBar()}
        <div class="h-terms">
          ${term('0-Punkt', 'Die Sollbesetzung. Ab hier ist ein Dienst so besetzt, wie er sein soll.')}
          ${term('Minimum', 'Die Untergrenze. Darunter wird im Kapazitätsmodus nie geplant.')}
          ${term('Krankenreserve', 'Monatlicher Erwartungswert, der vorsorglich abgezogen wird – keine Prognose für einzelne Personen.')}
          ${term('Maßnahmenverlust', 'Was Ausbildung an diesem Tag bindet: Teilnehmer, Mentor, TEC und Prüfer zusammen.')}
        </div>
        <p>Die <b>Jahresampel</b> zeigt diese Rechnung für jeden Tag als Farbe:</p>
        <div style="margin:8px 0 10px">${capLegend()}</div>
        <p class="small ink2">Ein Tag anklicken öffnet die Aufschlüsselung. Grenzwerte, Krankenreserve und die Zahl gleichzeitig verfügbarer Mentoren, TEC und Prüfer stellen Sie unter ${go('capacity', 'Kapazität')} ein. Im <b>Szenariomodus</b> wird ohne verbindliche Grenze verteilt – für die echte Planung gehört der Kapazitätsmodus eingeschaltet.</p></section>

      <section class="card" id="h-wege"><h2>8 · Cluster und Ausbildungswege</h2>
        <p>Jede Person gehört zu einem Cluster. Der Cluster bestimmt den Ausbildungsweg: eine Folge von Schritten mit Dauer und dem, was der Produktion an einem solchen Tag fehlt.</p>
        <div class="tblwrap"><table class="tbl"><thead><tr><th>Cluster</th><th>Bedeutung</th><th>Weg in der Vorgabe</th></tr></thead><tbody>
          ${Core.ROUTE_CLUSTERS.map(k => html`<tr><td><b>${k}</b></td><td>${Core.CLUSTERS[k]}</td><td>${Core.DEFAULT_ROUTES[k].map((t, i) => html`${i ? ' → ' : ''}${sw(t)} ${t}`)}${k === '5' ? html`<br><span class="muted">Zielstufe TEC:</span> ${Core.DEFAULT_RULES.tecRoute.map((t, i) => html`${i ? ' → ' : ''}${sw(t)} ${t}`)}` : ''}${Core.DEFAULT_RULES.frame.includes(k) ? html`<br><span class="muted">Voraussetzung: Praxis-Lehrgang</span>` : ''}</td></tr>`)}
          <tr><td><b>offen</b></td><td>${Core.CLUSTERS.offen}</td><td class="muted">wird nicht geplant, zählt aber in der Kapazität</td></tr>
          <tr><td><b>ausgeschlossen</b></td><td>${Core.CLUSTERS.ausgeschlossen}</td><td class="muted">keine neuen Maßnahmen</td></tr></tbody></table></div>
        <ul class="h-list" style="margin-top:10px"><li>Cluster, Zielmuster und Zielstufe ändern Sie unter ${go('people', 'Personen & Cluster')} – oder Sie spielen eine Liste ein, die nur Personalnummer und Cluster enthält.</li>
          <li>Dauer und Verlust je Schritt stellen Sie unter ${go('routes', 'Ausbildungswege')} ein: für den ganzen Cluster oder abweichend für eine einzelne Person.</li>
          <li><b>Vorleistung:</b> Hat jemand einen Teil schon erbracht, tragen Sie die Tage in der Seitenleiste der Person ein. Der Planer verteilt dann nur den Rest.</li>
          <li>Cluster 5 braucht Zielmuster und Zielstufe; Cluster 3 und 4B brauchen in der Vorgabe den Praxis-Lehrgang oder das Datum „Abschluss aller Doings“.</li></ul>
        <h3>Reihenfolge, Schritte, Dienste und Regeln</h3>
        <div class="tblwrap"><table class="tbl"><thead><tr><th>Was</th><th>Wie</th></tr></thead><tbody>
          <tr><td><b>Reihenfolge ändern</b></td><td>Unter ${go('routes', 'Ausbildungswege')} eine Schrittkarte am Kopf greifen und an die neue Stelle ziehen – oder die Pfeile ◀ ▶ auf der Karte nutzen. Der Planer hält die Reihenfolge ein.</td></tr>
          <tr><td><b>Eigenen Schritt anlegen</b></td><td>„Neuen Schritt anlegen“: Bezeichnung, Kürzel, Farbe, Art (einzeln im Dienst oder Lehrgang als Block), zulässige Dienste, Dauer und Verlust. Der Schritt steht danach allen Clustern zur Auswahl.</td></tr>
          <tr><td><b>Dienste je Maßnahme</b></td><td>In der Tabelle „Schritte und Dienste“ je Maßnahme ankreuzen, ob sie im Früh-, Spät- oder Nachtdienst stattfinden darf. Mindestens ein Dienst bleibt immer zugelassen.</td></tr>
          <tr><td><b>In den Jahresplan übernehmen</b></td><td>Ein geänderter Weg steht erst nach der Übernahme im Jahresplan. Über dem Ablauf zeigt eine Zeile, was vom Weg im Jahresplan steht; nach einer Änderung ist sie gelb. <b>„In den Jahresplan übernehmen“</b> verteilt nur die berechneten Termine der gewählten Person – oder der Personen des gewählten Clusters – neu. Fixierte Termine und alle anderen Personen bleiben unverändert. ${kbd('Strg', 'Z')} nimmt die Übernahme zurück.</td></tr>
          <tr><td><b>Schritt ändern</b></td><td>„Ändern“ in der Tabelle „Schritte und Dienste“ – auch bei den vorgegebenen Schritten (Theorie, Praxis, Logbook, FitCheck …): Bezeichnung, Kürzel, Farbe, zulässige Dienste und, solange es noch keine Termine gibt, die Art. „Auf Vorgabe zurücksetzen“ stellt den Schritt wieder her. Bei Vorbereitung und ICA steht die Art fest.</td></tr>
          <tr><td><b>Schritt entfernen</b></td><td>Eigene Schritte lassen sich entfernen, solange es keine Termine oder Lehrgänge dazu gibt.</td></tr>
          <tr><td><b>Regeln der Planung</b></td><td>In der Karte „Regeln der Planung“: für welche Cluster der Praxis-Lehrgang Voraussetzung ist, ob A320 zurückgestellt wird, ob der Kombikurs nur für die Zielstufe TEC gilt und ob vor der ICA automatisch ein Vorbereitungstag liegt. „Regeln auf Vorgabe setzen“ stellt alles wieder her.</td></tr>
          <tr><td><b>Weg für die Zielstufe TEC</b></td><td>Cluster 5 anklicken: Unter dem Weg des Clusters steht der Weg für Personen mit Zielstufe TEC. Er lässt sich wie jeder Weg ändern – Schritte hinzufügen, entfernen, verschieben.</td></tr></tbody></table></div>
        <div class="note">Änderungen an einem einzelnen Weg übernehmen Sie mit „In den Jahresplan übernehmen“. Nach Änderungen an Schritten, Diensten oder Regeln – sie betreffen alle Wege – verteilt „Neu berechnen“ die berechneten Termine neu. Fixierte Termine bleiben stehen; liegen sie außerhalb der zugelassenen Dienste, steht das als Konflikt im Bericht.</div></section>

      <section class="card" id="h-jahre"><h2>9 · Mehrere Planungsjahre</h2>
        <p>Ein Projekt kann mehrere Planungsjahre enthalten; gewechselt wird in der Kopfzeile (aktuell ${y}). <b>„Folgejahr anlegen“</b> übernimmt Personen, Ausbildungswege, Grenzwerte und Einstellungen.</p>
        <ul class="h-list"><li>Wer seinen Weg vollständig geplant hat, steht im neuen Jahr auf „Zuordnung offen“, bis Sie die nächste Stufe festlegen.</li>
          <li>Begonnene Wege laufen weiter: die im alten Jahr geplanten Tage – auch ein besuchter Lehrgang – zählen als Vorleistung.</li>
          <li>Termine, Lehrgänge, Abwesenheiten und Ferien gehören zu ihrem Jahr und werden nicht kopiert.</li>
          <li>Ändert sich der Plan des Vorjahres später, gleicht „Vorleistungen abgleichen“ unter „Daten & Datenschutz“ die Werte neu ab.</li></ul></section>

      <section class="card" id="h-berichte"><h2>10 · Speichern, Berichte, Dateien</h2>
        ${isDesktop ? html`<p>Das Projekt liegt in einer Datei mit der Endung <code>.m1cockpit</code>. ${kbd('Strg', 'S')} speichert, ${kbd('Strg', 'Umschalt', 'S')} speichert unter neuem Namen. Vor jedem Überschreiben bleibt der vorherige Stand als <code>.bak</code> neben der Datei liegen. Ein Punkt im Fenstertitel zeigt ungespeicherte Änderungen; beim Schließen fragt das Programm nach.</p>`
          : html`<p>„Sichern“ lädt die Projektdatei herunter; mit „Laden“ arbeiten Sie später weiter. „Programm mit Stand sichern“ erzeugt eine HTML-Datei, die beim Öffnen genau diesen Stand zeigt.</p>`}
        <div class="tblwrap"><table class="tbl"><thead><tr><th>Ausgabe</th><th>Inhalt</th><th>Wo</th></tr></thead><tbody>
          <tr><td><b>Gesamtbericht (PDF)</b></td><td>Kennzahlen, Kapazität im Jahresverlauf, Cluster, Monatswerte, Konflikte, Ergebnis je Person, Terminliste</td><td>Bericht → Gesamtbericht${isDesktop ? ' · Datei → Exportieren' : ''}</td></tr>
          <tr><td><b>Excel-Arbeitsmappe</b></td><td>Dieselben Daten als Tabellenblätter zum Weiterrechnen</td><td>Bericht → Excel</td></tr>
          <tr><td><b>Ansicht als PDF</b></td><td>Die aktuelle Ansicht, z. B. der Jahresplan</td><td>${isDesktop ? 'Datei → Exportieren' : '„Drucken“ → Als PDF speichern'}</td></tr>
          <tr><td><b>CSV-Listen</b></td><td>Termine, Lehrgänge, Personen, Tageskapazität, Abwesenheiten</td><td>Schaltfläche „CSV“ in der jeweiligen Ansicht</td></tr></tbody></table></div>
        ${isDesktop ? html`<h3>Neue Programmversionen</h3>
        <p>Welche Version läuft, steht <b>oben links neben dem Programmnamen</b>. Das installierte Programm sucht kurz nach dem Start und danach alle sechs Stunden nach einer neueren Version, lädt sie im Hintergrund und installiert sie beim Beenden. Sie müssen nichts herunterladen. Ein Hinweis meldet, wenn eine Version bereitliegt; „Jetzt neu starten“ installiert sofort.</p>
        <ul class="h-list"><li><b>Voraussetzung:</b> das Programm ist über das Setup installiert und der Rechner erreicht GitHub. Die portable Fassung meldet eine neue Version nur.</li>
          <li><b>Abschalten und Stand:</b> unter ${go('data', 'Daten & Datenschutz')} auf der Karte „Programm-Aktualisierung“; von Hand suchen Sie über Hilfe → Nach Aktualisierung suchen.</li></ul>` : ''}
        <h3>Dateien zum Einspielen</h3>
        <div class="tblwrap"><table class="tbl"><thead><tr><th>Datei</th><th>Spalten</th><th>Hinweis</th></tr></thead><tbody>
          <tr><td><b>Urlaubsplan</b></td><td>Zeile je Person, Spalte je Tag, Kürzel</td><td class="muted">Excel oder CSV; Kürzel werden beim Einspielen zugeordnet</td></tr>
          <tr><td><b>Lehrgangstermine</b></td><td>${Core.TEMPLATES.courses.join('; ')}</td><td class="muted">pk nur, wenn Teilnehmer mitkommen sollen</td></tr>
          <tr><td><b>Stammdaten</b></td><td>${Core.TEMPLATES.people.join('; ')}</td><td class="muted">nur pk ist Pflicht; deutsche Spaltennamen werden erkannt</td></tr>
          <tr><td><b>Dienstplan</b></td><td>pk; date; area; shift</td><td class="muted">oder als Tabelle je Tag</td></tr>
          <tr><td><b>Schichtplan (Monat)</b></td><td>Team; Nachname; Vorname; U-Nummer; MF; je Tag ein Symbol</td><td class="muted">Excel des Schichtplans, einzuspielen unter „Dienstplan“</td></tr>
          <tr><td><b>Abwesenheiten (Liste)</b></td><td>pk; start; end; type</td><td class="muted">Urlaub, Krank, Sonstiges</td></tr>
          <tr><td><b>Feste Termine</b></td><td>${Core.TEMPLATES.events.join('; ')}</td><td class="muted">einzelne gebuchte Maßnahmen</td></tr>
          <tr><td><b>Tageskapazität</b></td><td>${Core.TEMPLATES.capacity.join('; ')}</td><td class="muted">nur wenn eigene Tageswerte gelten sollen</td></tr></tbody></table></div>
        <p class="small muted" style="margin-top:8px">Datum als TT.MM.JJJJ oder JJJJ-MM-TT. Leere Vorlagen gibt es unter „Daten & Datenschutz“.</p></section>

      <section class="card" id="h-daten"><h2>11 · Datenschutz</h2>
        <ul class="h-list"><li><b>Keine Übertragung.</b> ${isDesktop ? 'Projektdaten verlassen den Rechner nicht. Die einzige Verbindung nach außen ist die Suche nach einer neuen Programmversion; dabei wird nichts aus dem Programm übertragen.' : 'Das Programm baut keine Netzwerkverbindung auf.'} Personendaten liegen nur in den Dateien, die Sie selbst ${isDesktop ? 'speichern' : 'sichern'}.</li>
          <li><b>Namen verbergen.</b> Die Schaltfläche in der Kopfzeile ersetzt überall Namen und Personalnummern durch Pseudonyme – für Besprechungen, Bildschirmfotos und Berichte.</li>
          <li><b>Pseudonymisiert sichern.</b> Erzeugt eine Projektdatei ohne Namen und eine getrennte Schlüsseldatei. Pseudonymisiert ist nicht anonym: die Schlüsseldatei gehört geschützt aufbewahrt.</li>
          <li><b>Dateinamen.</b> Dateien mit Personendaten tragen „VERTRAULICH“ im Namen.</li></ul>
        <h3>Wer kann auf eingelesene Personendaten zugreifen?</h3>
        <p>Das Programm überträgt nichts und hat keine eigene Anmeldung. Der Schutz der Daten hängt deshalb daran, wo die Dateien liegen und wer an den Rechner kommt:</p>
        <div class="tblwrap"><table class="tbl"><thead><tr><th>Wo liegen Daten?</th><th>Wer kann sie lesen?</th><th>Was tun?</th></tr></thead><tbody>
          <tr><td>Im Programmfenster</td><td>Jeder, der auf den Bildschirm sieht oder am entsperrten Rechner sitzt</td><td>Rechner sperren; für Besprechungen „Namen verbergen“</td></tr>
          <tr><td>Projektdatei${isDesktop ? html` <code>.m1cockpit</code> und Sicherungskopie <code>.bak</code>` : ''}</td><td>Jeder mit Zugriff auf den Ordner – auch über Netzlaufwerk, Datensicherung oder Administration. Die Datei ist <b>nicht verschlüsselt</b>.</td><td>In einem Ordner speichern, auf den nur Berechtigte zugreifen</td></tr>
          ${isDesktop ? html`<tr><td>Wiederherstellungskopie (nur wenn eingeschaltet)</td><td>Jeder mit Zugriff auf Ihr Windows-Benutzerprofil</td><td>Ausgeschaltet lassen, wenn der Rechner geteilt wird</td></tr>` : ''}
          <tr><td>Ausgaben (PDF, Excel, CSV)</td><td>Jeder, der die Datei erhält</td><td>Nur weitergeben, was nötig ist; sonst pseudonymisiert ausgeben</td></tr></tbody></table></div>
        <p class="small ink2">Abwesenheitsgründe wie „Krank“ sind besonders schutzwürdig. Für die Planung genügt, dass eine Person abwesend ist: Beim Einspielen des Urlaubsplans können Sie solche Kürzel der Art „Sonstiges“ zuordnen. Ob und wie Personendaten in diesem Werkzeug verarbeitet werden dürfen, klären Sie mit Datenschutz und Mitbestimmung Ihres Betriebs.</p>
        ${go('data', 'Daten & Datenschutz')}</section>

      <section class="card" id="h-fragen"><h2>12 · Häufige Fragen</h2>
        ${faq('Eine Person bekommt keine Termine – warum?', html`Im ${go('report', 'Bericht')} steht je Person das Ergebnis mit Begründung. Häufige Gründe: Cluster offen, Zielmuster oder Zielstufe fehlen (Cluster 5), kein Lehrgangstermin vorhanden, kein Dienstplan, oder die Kapazität reicht an keinem passenden Tag.`)}
        ${faq('Der Urlaubsplan wurde eingespielt, aber einige Personen fehlen.', 'Die Vorschau nennt, wie viele Personen erkannt wurden und welche Zeilen übersprungen sind. Erkannt wird über die Personalnummer oder den Namen in einer Spalte vor den Tagen. Stimmen Schreibweisen nicht, hilft eine Spalte mit der Personalnummer.')}
        ${faq('Im Bericht stehen „Hinweise“ zu Lehrgängen. Ist das ein Problem?', 'Nein. „Dienstplananpassung“ heißt: Der Lehrgangstag wäre laut Dienstplan frei. Die Person kommt zum Lehrgang, der Produktion fehlt niemand – nur der Dienstplan ist anzupassen. Als Konflikt zählen Abwesenheit, Terminkollision und unterschrittene Kapazität.')}
        ${faq('Ich sehe nach dem Start keine Daten.', html`Das ist der Normalbetrieb: Das Programm startet leer. Öffnen Sie Ihr Projekt${isDesktop ? ' (Datei → Öffnen, auch unter „Zuletzt geöffnet“)' : ''} oder spielen Sie Daten ein. Zum Ausprobieren schalten Sie unter ${go('data', 'Daten & Datenschutz')} den Übungsmodus ein.`)}
        ${isDesktop ? faq('Das Programm reagiert nicht mehr.', 'Nach einigen Sekunden erscheint die Frage „Weiter warten“ oder „Programm neu laden“. Die Stelle wird im Fehlerprotokoll festgehalten (Hilfe → Fehlerprotokoll anzeigen). Das Protokoll enthält keine Projektdaten – nur Zeitpunkt, Version, die zuletzt ausgelöste Aktion und die Stelle im Programmcode. Damit beim Neuladen nichts verloren geht, lässt sich unter „Daten & Datenschutz“ die Wiederherstellungskopie einschalten.') : ''}
        ${faq('Ich habe etwas falsch gemacht – wie komme ich zurück?', html`${kbd('Strg', 'Z')} oder der Pfeil in der Kopfzeile nimmt die letzten 30 Schritte zurück, auch das Laden einer Datei, das Entfernen simulierter Daten oder das Anlegen eines Jahres.`)}
        ${faq('Der Plan soll stehen bleiben, auch wenn ich neu berechne.', html`Unter ${go('events', 'Termine')} macht „Plan fixieren“ aus allen berechneten Terminen fixierte. Einzelne Termine fixieren Sie über „Fixieren“ oder indem Sie den Balken verschieben.`)}
        ${faq('Zwei Lehrgänge derselben Art sollen gleichzeitig laufen.', 'Beim Berechnen der besten Zeiträume den Haken „nicht gleichzeitig“ entfernen. Von Hand angelegte Lehrgänge dürfen sich immer überschneiden.')}
        ${faq('Was passiert mit dem simulierten Dienstplan?', 'Er bleibt, bis Sie den echten einspielen oder ihn bewusst entfernen. Solange er simuliert ist, steht das in der Übersicht, im Bericht und auf der Karte „Bereit für die echte Planung?“.')}</section>

      <section class="card" id="h-begriffe"><h2>13 · Begriffe</h2>
        <dl class="h-terms">
          ${term('Berechnet', 'Vom Planer gesetzter Termin. Wird bei jeder Neuberechnung neu verteilt.')}
          ${term('Fixiert', 'Von Ihnen gesetzter oder bestätigter Termin. Bleibt stehen und zählt zum Ausbildungsweg.')}
          ${term('Szenario', 'Simulierter Termin oder Lehrgang aus der Erprobung. Wird mit „Simulierte Daten entfernen“ gelöscht.')}
          ${term('Lehrgang', 'Zusammenhängender Block für eine Gruppe mit Zeitraum und Plätzen: Theorie, Praxis, Basic Knowledge, FG650.')}
          ${term('Practical Logbook', 'Praktische Ausbildung im laufenden Dienst, tageweise mit Mentor.')}
          ${term('FitCheck / ICA', 'Prüfungsschritte; in der Vorgabe nur im Frühdienst. Vor der ICA liegt ein Tag Vorbereitung für Prüfer oder TEC.')}
          ${term('Dienstplan', 'Je Person und Tag: Früh, Spät, Nacht in einem Bereich – oder frei. Ohne Eintrag gilt ein Tag in neuen Projekten als frei.')}
          ${term('Übungsmodus', 'Füllt das leere Programm mit simulierten Daten zum Einarbeiten. Ein- und ausschaltbar unter „Daten & Datenschutz“.')}
          ${term('Eigener Schritt', 'Eine selbst angelegte Maßnahme im Ausbildungsweg – einzeln im Dienst oder als Lehrgang.')}
          ${term('Kapazitätstag', 'Ein Kopf, der der Produktion einen Tag lang fehlt. Mentor 0,5 an 10 Tagen = 5 Kapazitätstage.')}
          ${term('Vorleistung', 'Bereits erbrachte Tage eines Schritts aus Vorjahren. Der Planer verteilt nur den Rest.')}
          ${term('Planungspriorität', '1 wird zuerst verteilt, 9 zuletzt. Entscheidet, wer bei knapper Kapazität zum Zug kommt.')}
          ${term('Dienstplananpassung', 'Ein Lehrgangstag, der laut Dienstplan frei wäre. Hinweis, kein Konflikt.')}
        </dl></section>

      <section class="card" id="h-grenzen"><h2>14 · Grenzen des Werkzeugs</h2>
        <ul class="h-list"><li>${Core.NOTICE}</li>
          <li>Alle Köpfe zählen gleich; Skill-Mix, Arbeitszeitregeln, Ruhezeiten und Betriebsvereinbarungen werden nicht geprüft.</li>
          <li>Mentor-, TEC- und Prüferwerte sind Planungsäquivalente, keine namentliche Verfügbarkeitsprüfung.</li>
          <li>Krankenquoten sind Planungsannahmen, keine Prognose. Cluster und Berechtigungen sind keine Leistungsbewertung.</li>
          <li>Der Variantenvergleich des Planers und die Suche nach Lehrgangszeiträumen sind Näherungsverfahren ohne Nachweis, dass es keine bessere Lösung gibt.</li>
          <li>Mit simuliertem Dienstplan ist die Kapazität eine Näherung.</li></ul>
        <p class="small muted" style="margin-top:10px">M1 Qualifikationscockpit${isDesktop ? ' ' + (desktop.info.version || '') : ''} · Format ${Core.FORMAT} ${Core.PROJECT_VERSION} · ${isDesktop ? 'Desktop-Programm; arbeitet lokal und ohne externe Bibliotheken – einzige Verbindung nach außen ist die abschaltbare Suche nach einer neuen Programmversion.' : 'läuft vollständig lokal im Browser, ohne Installation und ohne externe Bibliotheken.'}
          Tastatur: ${kbd('Strg', 'Z')} rückgängig · ${kbd('Strg', 'Y')} wiederholen · ${kbd('Strg', 'S')} ${isDesktop ? 'speichern' : 'sichern'}${isDesktop ? html` · ${kbd('Strg', '1')} … ${kbd('9')} Ansicht · ${kbd('F9')} neu berechnen` : ''} · ${kbd('Esc')} schließt Dialoge.</p></section>
      </div>
    </div>`;
  }
};
