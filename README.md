# M1 Qualifikationscockpit

Jahresplanung von Qualifikationsmaßnahmen mit Kapazitätsprüfung – als Desktop-Programm für Windows.
Das Programm verteilt Ausbildungswege (Logbook, FitCheck, ICA, Kurse) auf zulässige Tage, prüft jeden
Tag gegen Minimum und 0-Punkt der Schichtbesetzung und zeigt Konflikte, Kennzahlen und Berichte.

Hervorgegangen ist es aus der Einzeldatei `M1_Qualifikationscockpit.html`. Alle Funktionen dieser
Fassung sind unverändert enthalten; dazugekommen sind echtes Speichern und Öffnen, Berichte als PDF
und Excel sowie mehrere Planungsjahre in einem Projekt.

> Planungswerkzeug – keine zertifizierte Qualifikations- oder Produktionsfreigabe.

## Programm erhalten

Jeder Stand wird auf GitHub automatisch geprüft und gebaut (Reiter **Actions** → Lauf
„Programm prüfen und bauen“ → Abschnitt **Artifacts**):

| Artefakt | Inhalt | Wofür |
|---|---|---|
| `M1-Qualifikationscockpit-Windows` | `…-Setup.exe` | Installation mit Startmenü-Eintrag; ohne Administratorrechte (je Benutzer) |
| | `…-portable.exe` | Eine Datei, startet ohne Installation |
| `M1-Qualifikationscockpit-Einzeldatei-HTML` | `M1_Qualifikationscockpit.html` | Dieselbe Oberfläche im Browser, ohne Programm |

Die `.exe`-Dateien sind nicht digital signiert. Windows zeigt beim ersten Start deshalb den Hinweis
„Der Computer wurde durch Windows geschützt“ (SmartScreen) – über „Weitere Informationen“ →
„Trotzdem ausführen“ startet das Programm. In verwalteten Umgebungen gibt die IT die Datei frei oder
signiert sie mit dem Firmenzertifikat.

## Was das Programm kann

| Bereich | Funktionen |
|---|---|
| Planung | Übersicht mit Jahresampel, Jahresplan (Gantt) mit Ziehen und Ablegen, Kapazität je Bereich und Dienst |
| Lehrgänge | Lehrgänge als zusammenhängende Blöcke mit Plätzen und Teilnehmern: Bedarf je Art, Zeitleiste, Termine einspielen, beste Zeiträume und beste Besetzung berechnen |
| Stammdaten | Personen & Cluster, Ausbildungswege (je Cluster oder individuell), Termine, Abwesenheiten, Ferien, Feiertage |
| Planer | Vergleich vieler Reihenfolgen, Vorher/Nachher-Vergleich, fixierte Termine bleiben stehen, Kapazitäts- oder Szenariomodus |
| Dateien | Projektdatei `.m1cockpit` mit Speichern / Speichern unter, zuletzt geöffnet, Sicherungskopie `.bak` vor dem Überschreiben, Nachfrage bei ungespeicherten Änderungen, optionale Wiederherstellungskopie |
| Importe | Urlaubsplan als Excel-Tabelle je Tag mit Kürzel-Zuordnung, Lehrgangstermine, Stammdaten (CSV, Excel), Dienstplan, feste Termine, Tageskapazität, Ferien – jeweils mit Prüfung und Vorschau; Dateien der bisherigen HTML-Fassung und der Vorgängerversion 3.x |
| Echtbetrieb | Karte „Bereit für die echte Planung?“, simulierte Daten entfernen (Personen, Qualifikationen und Cluster bleiben) |
| Berichte | Gesamtbericht als PDF, jede Ansicht als PDF, Excel-Arbeitsmappe mit allen Tabellen, CSV je Liste |
| Mehrere Jahre | Planungsjahre in einem Projekt, Folgejahr anlegen mit Übernahme, Vorleistungen aus Vorjahren, Jahresvergleich |
| Datenschutz | Kein Netzwerkzugriff, „Namen verbergen“, pseudonymisierter Export mit getrennter Schlüsseldatei |

### Lehrgänge

Lehrgänge (TEC, CAT A, CAT Praxis …) werden nicht tageweise verteilt, sondern als Block mit Zeitraum und Plätzen
geführt. Feste Termine werden eingespielt; für den übrigen Bedarf sucht das Programm die Zeiträume, in denen die
größte Gruppe teilnehmen kann, ohne dass an einem Lehrgangstag die Grenze der Produktion unterschritten wird.
„Neu berechnen“ vergibt freie Plätze in der Reihenfolge des Ausbildungswegs. Lehrgänge mit Zielmuster gelten für
Cluster 5 mit genau diesem Muster, Lehrgänge ohne Zielmuster für den CAT-A-Kursrahmen der übrigen Cluster.

### Ziehen und Ablegen

Im Jahresplan lassen sich Ausbildungselemente auf eine Person ziehen, Balken verschieben und Personen auf einen
Lehrgangsplatz setzen. Schon beim Ziehen zeigt jeder Tag grün, gelb oder rot, ob die Kapazität reicht; beim Ablegen
folgt die Prüfung. Gegen die Grenze wird nie stillschweigend geplant.

### Mehrere Planungsjahre

„Folgejahr anlegen“ übernimmt Personen, Ausbildungswege, Grenzwerte und Einstellungen in ein neues
Jahr. Wer seinen Weg vollständig geplant hat, steht dort auf „Zuordnung offen“. Begonnene Wege laufen
weiter: Die im alten Jahr geplanten Tage zählen als **Vorleistung**, das neue Jahr plant nur den Rest.
Termine, Abwesenheiten und Ferien gehören zu ihrem Jahr und werden nicht kopiert. Der Dienstplan kann
als Simulation um 52 Wochen fortgeschrieben werden, bis der echte vorliegt.

### Datenschutz

- Das Programm baut keine Netzwerkverbindungen auf. Eine Inhaltsrichtlinie und eine Sperre im
  Hauptprozess weisen alles außer den eigenen Programmdateien ab; es gibt keine automatischen
  Aktualisierungen, keine Telemetrie und keine externen Bibliotheken zur Laufzeit.
- Die Oberfläche läuft abgeschottet (ohne Zugriff auf Node.js oder das Dateisystem). Dateipfade wählt
  ausschließlich der Mensch im Dateidialog.
- Personendaten liegen nur in den Dateien, die Sie selbst speichern. Dazu gehören die Sicherungskopie
  `.bak` neben der Projektdatei und – nur wenn eingeschaltet – die Wiederherstellungskopie im
  Benutzerprofil. Beides lässt sich unter „Daten & Datenschutz“ abschalten.
- Das Repository enthält keine Personendaten; Demo-Daten werden beim Start synthetisch erzeugt.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/core/` | Rechenkern ohne Oberfläche: Kalender, Kapazität, Planer, Lehrgänge, Konflikte, Importe (auch Tagestabellen), Prüfung beim Ablegen, Projektdatei, Jahreswechsel, Berichte, Excel-Schreiber |
| `src/ui/` | Oberfläche: Zustand und Rückgängig, Dialoge, Ansichten (`views/`), Ausgaben, Desktop-Anbindung |
| `src/platform/` | Brücke zum Desktop-Programm (im Browser ohne Funktion) |
| `src/styles/` | Gestaltung |
| `electron/` | Hauptprozess (Fenster, Menü, Dateien, PDF) und abgeschottete Brücke zur Oberfläche |
| `tests/` | Tests des Rechenkerns, darunter der Vergleich mit der ursprünglichen HTML-Fassung |
| `e2e/` | Tests des Desktop-Programms im echten Fenster |
| `legacy/` | Ursprüngliche Einzeldatei (Format 4) als Referenz für den Vergleich |
| `build/` | Programmsymbol |

Aus demselben Quellcode entstehen zwei Ziele: das Desktop-Programm (`dist/app`, strenge
Inhaltsrichtlinie ohne Inline-Skripte) und die Einzeldatei für den Browser (`dist/standalone`).
Der ausgelieferte Code wird bewusst nicht verkleinert und bleibt lesbar.

### Projektdatei

`.m1cockpit` ist lesbares JSON: `{ "format": "M1-Cockpit", "version": 5, "active": 2027, "years": { "2027": {…}, "2028": {…} } }`.
Jedes Jahr ist ein vollständiger Stand im Format der bisherigen HTML-Fassung (Format 4). Dateien dieser
Fassung (`.json`, „Programm mit Stand“ als `.html`) und der Vorgängerversion 3.x werden weiter gelesen;
sie werden als Kopie übernommen, das Original bleibt unverändert.

## Entwickeln

Voraussetzung: Node.js ab 22.12.

```bash
npm install
```

| Befehl | Wirkung |
|---|---|
| `npm start` | Oberfläche bauen und das Desktop-Programm starten |
| `npm run dev` | Entwicklungsserver für die Oberfläche im Browser (http://localhost:5173) |
| `npm test` | Tests des Rechenkerns |
| `npm run e2e` | Desktop-Programm im Fenster prüfen (Linux ohne Bildschirm: `xvfb-run -a npm run e2e`) |
| `npm run lint` | Regeln prüfen |
| `npm run build` | Oberfläche und Einzeldatei bauen (`dist/`) |
| `npm run dist:win` | Windows-Installer und portable `.exe` bauen (`release/`, unter Windows) |

Beim Entwickeln lädt `M1_DEV_URL=http://localhost:5173 npx electron .` die Oberfläche direkt vom
Entwicklungsserver.

### Absicherung

- **Gleichheit mit der HTML-Fassung:** `tests/parity.test.js` lädt den Rechenkern aus
  `legacy/M1_Qualifikationscockpit_v4.html` und vergleicht Demo-Daten, Index, Planung in mehreren
  Reihenfolgen und Einstellungen, Konflikte, Lehrgangssuche, Importe und Pseudonymisierung. Der Vergleich läuft im
  bisherigen Modus (Kurse tageweise); Lehrgänge als Blöcke, Urlaubsplan-Import und die Prüfung beim Ablegen haben
  eigene Tests.
- **Desktop-Programm:** `e2e/desktop.test.mjs` prüft Start, Abschottung, Speichern/Öffnen mit
  Sicherungskopie, Schließen mit ungespeicherten Änderungen, PDF/Excel/CSV/HTML-Ausgabe,
  Wiederherstellung, den Jahreswechsel, den Urlaubsplan-Import aus Excel, Lehrgangsvorschläge und das Ziehen im Jahresplan – wahlweise gegen das gepackte Programm (`M1_APP=<Pfad>`).
