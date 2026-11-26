import * as Core from '../../core/index.js';
import { desktop, isDesktop } from '../../platform/desktop.js';
import { html } from '../dom.js';
import { VIEWS } from '../registry.js';

// ---------- Anleitung --------------------------------------------------------------------
VIEWS.help = {
  render() {
    const col = (k, cols, note) => html`<tr><td><b>${k}</b></td><td>${cols}</td><td class="muted">${note}</td></tr>`;
    return html`
    <div class="view-head"><div><h1>Anleitung</h1><p>Aufbau, Rechenregeln und Grenzen des Werkzeugs.</p></div></div>
    <div class="grid2"><div class="card"><div class="prose">
      <h3 style="margin-top:0">In fünf Schritten zum Jahresplan</h3>
      <ol><li><b>Daten laden</b> – unter „Daten & Datenschutz“ die Datei der Vorgängerversion oder Stammdaten, Dienstplan und Abwesenheiten laden. Bis dahin zeigt das Programm synthetische Demo-Daten.</li>
        <li><b>Cluster und Ziele prüfen</b> – unter „Personen & Cluster“. Cluster 5 braucht Zielmuster und Zielstufe; Cluster 3 / 4B brauchen einen Praxis-Kursrahmen oder das Abschlussdatum aller Doings.</li>
        <li><b>Ausbildungswege bestätigen</b> – Dauer und Verlustfaktoren je Cluster, bei Bedarf individuell je Person.</li>
        <li><b>Neu berechnen</b> – das Programm vergleicht viele Reihenfolgen und zeigt das beste Ergebnis im Vorher/Nachher-Vergleich. Erst „Plan übernehmen“ ändert den Stand.</li>
        <li><b>Prüfen und sichern</b> – Jahresampel, Jahresplan und Bericht ansehen, einzelne Termine fixieren, ${isDesktop ? 'Projekt speichern' : 'Projektdatei sichern'}.</li></ol>
      <h3>Mehrere Planungsjahre</h3>
      <p>Ein Projekt kann mehrere Planungsjahre enthalten; gewechselt wird in der Kopfzeile. „Folgejahr anlegen“ übernimmt Personen, Ausbildungswege, Grenzwerte und Einstellungen. Wer seinen Weg vollständig geplant hat, steht im neuen Jahr auf „Zuordnung offen“. Begonnene Wege laufen weiter: die im alten Jahr geplanten Tage zählen als <b>Vorleistung</b>, das neue Jahr plant nur den Rest. Termine, Abwesenheiten und Ferien gehören zu ihrem Jahr und werden nicht kopiert; der Dienstplan lässt sich als Simulation um 52 Wochen fortschreiben, bis der echte vorliegt.</p>
      <p>Vorleistungen lassen sich je Person auch von Hand eintragen (Seitenleiste der Person) – etwa für Ausbildungen, die vor der Nutzung des Programms begonnen haben. Ändert sich der Plan des Vorjahres, gleicht „Vorleistungen abgleichen“ unter „Daten & Datenschutz“ die Werte neu ab.</p>
      <h3>Berichte</h3>
      <p>Der <b>Gesamtbericht</b> (Ansicht „Bericht“) fasst Kennzahlen, Kapazität, Ergebnis je Person, Konflikte und Terminliste druckfertig zusammen${isDesktop ? ' und lässt sich direkt als PDF speichern' : '; über den Druckdialog entsteht daraus ein PDF'}. Die <b>Excel-Arbeitsmappe</b> enthält dieselben Daten als Tabellenblätter zum Weiterrechnen. Sind Namen verborgen, stehen in beiden Ausgaben nur Pseudonyme.</p>
      <h3>So rechnet die Kapazität</h3>
      <p>Verfügbar = Köpfe laut Dienstplan − Abwesende − Krankenreserve (Monatswert + Stress) − Maßnahmenverlust. Der Maßnahmenverlust ist die Summe aus Teilnehmer-, Mentor-, TEC- und Prüferanteil und wird dem Dienst der teilnehmenden Person zugerechnet. Jeder Wert wird genau einmal abgezogen.</p>
      <p><b>0-Punkt</b> ist die Sollbesetzung, <b>Minimum</b> die Untergrenze. Im Kapazitätsmodus plant das Programm nie unter die harte Grenze. Mit „0-Punkt bevorzugen“ arbeitet es dreistufig: erst nur Tage ab 0-Punkt, dann Fehltage bis zum Minimum auffüllen, zuletzt frei bis zum Minimum.</p>
      <h3>So verteilt der Planer</h3>
      <ul><li>Ausbildungstage liegen auf Arbeitstagen (Mo–Fr, ohne Feiertage) mit vorgesehenem Dienst, nie auf Abwesenheiten.</li>
        <li>Theorie, Praxis, FitCheck, ICA und Vorbereitung nur im Frühdienst; Logbook-Tage in jedem Dienst.</li>
        <li>Mentor-, TEC- und Prüferpools begrenzen die gleichzeitige Betreuung je Dienst.</li>
        <li>Die ICA liegt nach dem Abschluss aller Doings und nach Kursen; ein Tag Vorbereitung davor bindet nur Prüfer oder TEC.</li>
        <li>Fixierte Termine bleiben stehen, zählen zum Weg und werden nie doppelt erzeugt.</li>
        <li>Planungspriorität 1 wird zuerst verteilt; innerhalb gleicher Priorität sucht der Variantenvergleich die beste Reihenfolge.</li></ul>
      <h3>Lehrgänge</h3>
      <p>Die Lehrgangsplanung sucht zusammenhängende Zeiträume. „Größtmögliche Gruppe“ prüft je Starttag, wer teilnehmen kann, und nimmt so lange Personen heraus, bis die Grenze an jedem Tag hält. Dienstfreie Tage im Lehrgang gelten als Dienstplananpassung ohne Produktionsverlust.</p>
    </div></div>
    <div class="stack"><div class="card"><div class="prose">
      <h3 style="margin-top:0">Wichtige Grenzen</h3>
      <ul><li>Planungswerkzeug, keine zertifizierte Qualifikations- oder Produktionsfreigabe. Ausbildungsfolgen und Verlustfaktoren sind fachlich zu bestätigen.</li>
        <li>Alle Köpfe zählen gleich; Skill-Mix, Arbeitszeitregeln, Ruhezeiten und Betriebsvereinbarungen werden nicht geprüft.</li>
        <li>Mentor-, TEC- und Prüferwerte sind Planungsäquivalente, keine namentliche Verfügbarkeitsprüfung.</li>
        <li>Krankenquoten sind historische Planungsannahmen, keine Prognose. Cluster und Berechtigungen sind keine Leistungsbewertung.</li>
        <li>M2 / M3-Rotation im Logbook nur, wenn Rotationstage je Person eingetragen und Grenzwerte für diese Bereiche hinterlegt sind.</li>
        <li>Der Variantenvergleich ist eine Heuristik ohne Optimalitätsnachweis.</li></ul>
      <h3>Dateiformate</h3></div>
      <div class="tblwrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Datei</th><th>Spalten</th><th>Hinweis</th></tr></thead><tbody>
        ${col('Stammdaten', Core.TEMPLATES.people.join('; '), 'nur pk ist Pflicht; deutsche Spaltennamen werden erkannt')}
        ${col('Dienstplan', 'pk; date; area; shift', 'oder Matrix: pk; Datum; Datum; …')}
        ${col('Abwesenheiten', 'pk; start; end; type', 'Urlaub, Krank, Sonstiges')}
        ${col('Feste Termine', Core.TEMPLATES.events.join('; '), 'Maßnahme wie in der Legende')}
        ${col('Tageskapazität', Core.TEMPLATES.capacity.join('; '), 'zero ≥ min')}
        ${col('Schlüsseldatei', 'alias; pk; name; org', 'entsteht beim pseudonymisierten Sichern')}
        ${col('Projektdatei', '.m1cockpit', 'alle Planungsjahre; Inhalt ist lesbares JSON. Dateien der Einzeldatei-Fassung (.json, .html) werden weiter gelesen')}</tbody></table></div></div>
      <div class="card"><div class="prose"><h3 style="margin-top:0">Bedienung</h3>
        <ul><li><kbd>Strg</kbd> + <kbd>Z</kbd> rückgängig, <kbd>Strg</kbd> + <kbd>Y</kbd> wiederholen, <kbd>Strg</kbd> + <kbd>S</kbd> ${isDesktop ? html`speichern, <kbd>Strg</kbd> + <kbd>Umschalt</kbd> + <kbd>S</kbd> speichern unter, <kbd>Strg</kbd> + <kbd>O</kbd> öffnen, <kbd>Strg</kbd> + <kbd>1</kbd> … <kbd>9</kbd> Ansicht wechseln, <kbd>F9</kbd> neu berechnen,` : 'Projektdatei sichern,'} <kbd>Esc</kbd> schließt Dialoge.</li>
          <li>Überall gilt: Tag, Balken oder Name anklicken öffnet die Einzelheiten.</li><li>Jede Ansicht lässt sich drucken; die Druckansicht blendet Bedienelemente aus.</li></ul>
        <p class="small muted">M1 Qualifikationscockpit${isDesktop ? ' ' + (desktop.info.version || '') : ''} · Format ${Core.FORMAT} ${Core.PROJECT_VERSION} · ${isDesktop ? 'Desktop-Programm; läuft vollständig lokal, ohne Netzwerkverbindung und ohne externe Bibliotheken.' : 'läuft vollständig lokal im Browser, ohne Installation und ohne externe Bibliotheken.'}</p></div></div></div></div>`;
  }
};
