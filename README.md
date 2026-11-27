# M1 Qualifikationscockpit

Jahresplanung von Qualifikationsmaßnahmen mit Kapazitätsprüfung – als Desktop-Programm für Windows.
Das Programm verteilt Ausbildungswege (Logbook, FitCheck, ICA, Kurse) auf zulässige Tage, prüft jeden
Tag gegen Minimum und 0-Punkt der Schichtbesetzung und zeigt Konflikte, Kennzahlen und Berichte.

Hervorgegangen ist es aus der Einzeldatei `M1_Qualifikationscockpit.html`. Alle Funktionen dieser
Fassung sind unverändert enthalten; dazugekommen sind echtes Speichern und Öffnen, Berichte als PDF
und Excel sowie mehrere Planungsjahre in einem Projekt.

> Planungswerkzeug – keine zertifizierte Qualifikations- oder Produktionsfreigabe.

## Programm erhalten

Die aktuelle Version steht unter **Releases**:
<https://github.com/Michael-Forster1986/M1-Bereichsentwicklung-/releases/latest>

| Datei | Wofür |
|---|---|
| `M1-Qualifikationscockpit-<Version>-Setup.zip` | **Empfohlen für die erste Installation.** ZIP öffnen und das Setup darin starten. Installiert ohne Administratorrechte; das Programm aktualisiert sich danach selbst. |
| `M1-Qualifikationscockpit-<Version>-Setup.exe` | Dasselbe Setup ohne ZIP. Manche Browser sperren diesen Download (siehe unten). |
| `M1-Qualifikationscockpit-<Version>-portable.exe` | Eine Datei, startet ohne Installation. Meldet neue Versionen, ersetzt sich aber nicht selbst. |

**Wenn der Browser den Download sperrt:** Die `.exe`-Dateien sind nicht digital signiert. Microsoft Edge meldet
dann „… wird häufig nicht heruntergeladen“ und lässt die Datei auf verwalteten Rechnern teils gar nicht frei.
Das ZIP ist davon nicht betroffen. Nach der ersten Installation spielt der Browser keine Rolle mehr: Neue
Versionen lädt das Programm selbst. Die dauerhafte Abhilfe ist eine Signatur mit einem Code-Signing-Zertifikat
oder die Freigabe durch die IT.

### Automatische Aktualisierung

Das installierte Programm sucht kurz nach dem Start und danach alle sechs Stunden in den Releases dieses
Projekts nach einer neueren Version, lädt sie im Hintergrund und installiert sie beim Beenden. Abgerufen werden
nur die Versionsangabe und das Installationsprogramm; aus dem Programm wird nichts übertragen. Stand, „Jetzt
suchen“ und der Schalter zum Abschalten stehen unter „Daten & Datenschutz“ → „Programm-Aktualisierung“.

Voraussetzungen: Installation über das Setup, und der Rechner erreicht `github.com`. Wer bisher eine ältere
Fassung ohne diese Funktion nutzt (bis 5.1.0), installiert einmal das aktuelle Setup.

Zwischenstände jedes Laufs hängen zusätzlich als Artefakte an den Läufen (Reiter **Actions** → Lauf
„Programm prüfen und bauen“ → Abschnitt **Artifacts**):

| Artefakt | Inhalt | Wofür |
|---|---|---|
| `M1-Qualifikationscockpit-Windows` | `…-Setup.exe` | Installation mit Startmenü-Eintrag; ohne Administratorrechte (je Benutzer) |
| | `…-portable.exe` | Eine Datei, startet ohne Installation |
| `M1-Qualifikationscockpit-Einzeldatei-HTML` | `M1_Qualifikationscockpit.html` | Dieselbe Oberfläche im Browser, ohne Programm |

Beim ersten Start des Setups zeigt Windows aus demselben Grund den Hinweis „Der Computer wurde durch Windows
geschützt“ (SmartScreen) – über „Weitere Informationen“ → „Trotzdem ausführen“ startet es. In verwalteten
Umgebungen gibt die IT die Datei frei oder signiert sie mit dem Firmenzertifikat.

## Was das Programm kann

| Bereich | Funktionen |
|---|---|
| Planung | Übersicht mit Jahresampel, Jahresplan (Gantt) mit Ziehen und Ablegen und Zoom vom Jahr bis zum einzelnen Tag, Kapazität je Bereich und Dienst |
| Lehrgänge | Lehrgänge als zusammenhängende Blöcke mit Plätzen und Teilnehmern: Bedarf je Art, Zeitleiste, Termine einspielen, beste Zeiträume und beste Besetzung berechnen |
| Stammdaten | Personen & Cluster, Termine, Abwesenheiten, Ferien, Feiertage |
| Ausbildungswege | Je Cluster oder individuell; Reihenfolge der Schritte per Ziehen, eigene Schritte anlegen, vorgegebene Schritte anpassen (Bezeichnung, Kürzel, Farbe, Art), je Maßnahme die zulässigen Dienste (Früh, Spät, Nacht), Regeln der Planung einstellbar |
| Planer | Vergleich vieler Reihenfolgen, Vorher/Nachher-Vergleich, fixierte Termine bleiben stehen, Kapazitäts- oder Szenariomodus |
| Dateien | Projektdatei `.m1cockpit` mit Speichern / Speichern unter, zuletzt geöffnet, Sicherungskopie `.bak` vor dem Überschreiben, Nachfrage bei ungespeicherten Änderungen, optionale Wiederherstellungskopie |
| Importe | Urlaubsplan als Excel-Tabelle je Tag mit Kürzel-Zuordnung, Lehrgangstermine, Stammdaten (CSV, Excel), Dienstplan, feste Termine, Tageskapazität, Ferien – jeweils mit Prüfung und Vorschau; Dateien der bisherigen HTML-Fassung und der Vorgängerversion 3.x |
| Normalbetrieb | Das Programm startet leer; Personen, Dienstplan, Urlaubsplan und Lehrgänge werden einzeln eingespielt. Karte „Bereit für die echte Planung?“ |
| Schichtplan | Die monatliche Excel-Tabelle des Schichtplans einspielen (Tage „01 Fr“, Symbole wie F1, S1, N2, Up); Symbole einer Bedeutung zuordnen; Monatsansicht „Dienstplan“ mit den Original-Symbolen; fehlende Personen anlegen |
| Dienstplan | Als Excel einspielen oder je Person in der Seitenleiste eintragen: Dienst per Auswahl, Tage anklicken oder ziehen, Zeitraum und Wochenfolge füllen, auf andere Personen übertragen. Tage ohne Eintrag gelten in neuen Projekten als frei. |
| Übungsmodus | Ein- und ausschaltbar: füllt das Fenster mit vollständig simulierten Daten zum Einarbeiten; Ausschalten leert das Programm wieder |
| Berichte | Gesamtbericht als PDF, jede Ansicht als PDF, Excel-Arbeitsmappe mit allen Tabellen, CSV je Liste |
| Mehrere Jahre | Planungsjahre in einem Projekt, Folgejahr anlegen mit Übernahme, Vorleistungen aus Vorjahren, Jahresvergleich |
| Datenschutz | Keine Übertragung von Daten, „Namen verbergen“, pseudonymisierter Export mit getrennter Schlüsseldatei |
| Betrieb | Automatische Aktualisierung (abschaltbar), Fehlerprotokoll ohne Projektdaten, Dialog „Weiter warten / Neu laden“, wenn das Fenster nicht reagiert |

### Normalbetrieb und Übungsmodus

Nach dem Start ist das Programm leer. Daten werden einzeln eingespielt (Stammdaten, Urlaubsplan, Lehrgangstermine,
Dienstplan) oder ein gespeichertes Projekt wird geöffnet. Zum Einarbeiten füllt der Übungsmodus das Fenster mit
erfundenen Personen samt Dienstplan, Urlaub, Lehrgängen und berechnetem Jahresplan. Der Schalter steht unter
„Daten & Datenschutz“ und bleibt gespeichert; wer ein eigenes Projekt öffnet oder anlegt, verlässt den Übungsmodus.

In einem neuen Projekt gilt jeder Tag als frei, bis ein Dienst eingetragen ist – nichts wird aus den Stammdaten
angenommen. Der Dienstplan wird als Excel eingespielt oder je Person in ihrer Seitenleiste eingetragen (dort macht
„Dienstplan bearbeiten“ die Seitenleiste groß). Das frühere Verhalten bleibt als Einstellung unter „Kapazität“.

### Ausbildungswege

Die Schritte eines Wegs lassen sich per Ziehen der Kacheln (oder mit den Pfeilen) umordnen; der Planer hält die
Reihenfolge ein. Neben den festen Maßnahmen kann ein Projekt eigene Schritte führen – einzeln im Dienst oder als
Lehrgang. Für jede Maßnahme ist einstellbar, in welchen Diensten sie stattfinden darf (Vorgabe: Logbook in jedem
Dienst, alles andere im Frühdienst). Planer, Ablegeprüfung im Jahresplan und Konfliktprüfung richten sich danach.

Ein geänderter Weg kommt mit „In den Jahresplan übernehmen“ in den Plan: Der Planer verteilt dann nur die berechneten
Termine der betroffenen Person (oder der Personen des Clusters) neu, alle anderen Termine bleiben stehen
(`replanPeople`, `runPlan` mit `only`).

Auch die vorgegebenen Schritte (Theorie, Praxis, Logbook, FitCheck …) lassen sich anpassen: Bezeichnung, Kürzel,
Farbe und – solange es keine Termine gibt – die Art. Der Name der Maßnahme bleibt dabei der Schlüssel in Terminen
und Dateien; geändert wird nur die Anzeige (`measureEdits`).

Die Regeln der Vorgängerversion sind einstellbar (`settings.rules`, gespeichert wird nur die Abweichung): für welche
Cluster der Praxis-Lehrgang Voraussetzung ist, der Weg für die Zielstufe TEC, das Zurückstellen von A320, „Kombikurs
nur für Zielstufe TEC“ und der automatische Vorbereitungstag vor der ICA. Ohne Änderung rechnet der Planer wie bisher.

### Schichtplan und Schichtsymbole

Der Schichtplan kommt monatsweise als Excel-Tabelle: Zeile 1 mit den Tagen („01 Fr“), darunter die Beschriftung (Team,
Nachname, Vorname, U-Nummer, MF), je Person eine Zeile mit einem Symbol je Tag. Monat und Jahr stehen nur im
Dateinamen oder in einem Filtertext der Tabelle; `parseDayMatrix` liest beides (`periodHint`). Was ein Symbol für die
Planung bedeutet, legt der Mensch fest (`settings.symbols`, Vorschlag: `defaultSymbolMap`); daraus entstehen Dienste und
Abwesenheiten (`applyShiftPlan`, `deriveFromSymbols`). Die Symbole selbst bleiben je Person und Tag gespeichert
(`symbols`, ein Zeichen je Tag) und werden in der Ansicht „Dienstplan“ und im Personenkalender so angezeigt.

### Lehrgänge

Lehrgänge (TEC, CAT A, CAT Praxis …) werden nicht tageweise verteilt, sondern als Block mit Zeitraum und Plätzen
geführt. Feste Termine werden eingespielt; für den übrigen Bedarf sucht das Programm die Zeiträume, in denen die
größte Gruppe teilnehmen kann, ohne dass an einem Lehrgangstag die Grenze der Produktion unterschritten wird.
„Neu berechnen“ vergibt freie Plätze in der Reihenfolge des Ausbildungswegs. Lehrgänge mit Zielmuster gelten für
Cluster 5 mit genau diesem Muster, Lehrgänge ohne Zielmuster für den CAT-A-Kursrahmen der übrigen Cluster.

Lehrgänge der Art Basic Knowledge können in Modulen geführt werden (M1 bis M17): Sind Teilbeleger dabei, bekommt jedes
Modul einen Zeitraum oder die Kennzeichnung N/A (findet nicht statt), und je Person ist festgelegt, welche Module sie
braucht. Ihr Termin liegt dann nur an diesen Tagen; Planer, Kapazitätsprüfung und Jahresplan rechnen modulgenau
(`course.modules`, `person.modules`, `src/core/modules.js`). Ohne Teilbeleger genügen Beginn und Ende.
Die Lehrgangsliste (CSV/Excel) kennt dafür die Spalte „Modul“ – eine Zeile je Modul, bei Teilnehmern die belegten
Module – und wird in demselben Aufbau ausgegeben. „Beste Zeiträume berechnen“ nimmt einen Modulplan (Arbeitstage je
Modul) und prüft Teilbeleger nur an ihren Tagen.

### Ziehen und Ablegen

Im Jahresplan lassen sich Ausbildungselemente auf eine Person ziehen, Balken verschieben und Personen auf einen
Lehrgangsplatz setzen. Schon beim Ziehen zeigt jeder Tag grün, gelb oder rot, ob die Kapazität reicht; beim Ablegen
folgt die Prüfung. Gegen die Grenze wird nie stillschweigend geplant.

Der Zeitraum reicht von „Jahr“ bis „2 Wochen“; ab „Monat“ steht jeder Tag mit Wochentag und Datum über dem Plan.
Strg + Mausrad zoomt stufenweise.

### Mehrere Planungsjahre

„Folgejahr anlegen“ übernimmt Personen, Ausbildungswege, Grenzwerte und Einstellungen in ein neues
Jahr. Wer seinen Weg vollständig geplant hat, steht dort auf „Zuordnung offen“. Begonnene Wege laufen
weiter: Die im alten Jahr geplanten Tage zählen als **Vorleistung**, das neue Jahr plant nur den Rest.
Termine, Abwesenheiten und Ferien gehören zu ihrem Jahr und werden nicht kopiert. Der Dienstplan kann
als Simulation um 52 Wochen fortgeschrieben werden, bis der echte vorliegt.

### Datenschutz

- Die Oberfläche baut keine Netzwerkverbindungen auf. Eine Inhaltsrichtlinie und eine Sperre im
  Hauptprozess weisen alles außer den eigenen Programmdateien ab; es gibt keine Telemetrie und keine
  externen Bibliotheken zur Laufzeit.
- Die einzige Verbindung nach außen ist die Suche nach einer neuen Programmversion. Ihr Kanal erreicht
  ausschließlich die Releases dieses Projekts und die Dateiablage von GitHub; übertragen wird nichts aus dem
  Programm. Sie lässt sich abschalten – dann bleibt das Programm vollständig ohne Netzwerk.
- Das Fehlerprotokoll (Hilfe → Fehlerprotokoll anzeigen) liegt nur im Benutzerprofil und enthält Zeitpunkt,
  Version, den Namen der zuletzt ausgelösten Aktion und die Stelle im Programmcode – keine Projektdaten.
- Die Oberfläche läuft abgeschottet (ohne Zugriff auf Node.js oder das Dateisystem). Dateipfade wählt
  ausschließlich der Mensch im Dateidialog.
- Personendaten liegen nur in den Dateien, die Sie selbst speichern. Dazu gehören die Sicherungskopie
  `.bak` neben der Projektdatei und – nur wenn eingeschaltet – die Wiederherstellungskopie im
  Benutzerprofil. Beides lässt sich unter „Daten & Datenschutz“ abschalten.
- Projektdateien sind lesbares JSON und **nicht verschlüsselt**. Wer Zugriff auf den Ordner hat (auch über
  Netzlaufwerk, Datensicherung oder Administration), kann sie lesen. Das Programm hat keine eigene Anmeldung.
- Das Repository enthält keine Personendaten; die Daten des Übungsmodus werden synthetisch erzeugt.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/core/` | Rechenkern ohne Oberfläche: Kalender, Kapazität, Planer, Lehrgänge, Konflikte, Importe (auch Tagestabellen), Prüfung beim Ablegen, Projektdatei, Jahreswechsel, Berichte, Excel-Schreiber |
| `src/ui/` | Oberfläche: Zustand und Rückgängig, Dialoge, Ansichten (`views/`), Ausgaben, Desktop-Anbindung |
| `src/platform/` | Brücke zum Desktop-Programm (im Browser ohne Funktion) |
| `src/styles/` | Gestaltung |
| `electron/` | Hauptprozess (Fenster, Menü, Dateien, PDF), Aktualisierung, Fehleraufzeichnung und abgeschottete Brücke zur Oberfläche |
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

### Versionen veröffentlichen

Der Lauf auf `main` veröffentlicht jede **neue Versionsnummer** aus `package.json` einmal als Release
(Setup als `.exe` und als ZIP, portable `.exe`, `latest.yml`). Installierte Programme holen sie sich von dort. Eine Änderung, die
ausgeliefert werden soll, braucht deshalb eine höhere Versionsnummer; ohne sie entsteht kein Release.
Die `.exe`-Dateien sind nicht signiert: Die Echtheit einer Aktualisierung hängt an der HTTPS-Verbindung zu
GitHub und an der Prüfsumme aus `latest.yml` – und damit am Schutz des GitHub-Kontos (Zwei-Faktor-Anmeldung).

### Absicherung

Die Fenstertests laufen mit fester Uhr der Oberfläche (Planungsjahr 2027), weil der leere Start und der Übungsmodus
das Planungsjahr aus dem Datum ableiten.

- **Gleichheit mit der HTML-Fassung:** `tests/parity.test.js` lädt den Rechenkern aus
  `legacy/M1_Qualifikationscockpit_v4.html` und vergleicht Demo-Daten, Index, Planung in mehreren
  Reihenfolgen und Einstellungen, Konflikte, Lehrgangssuche, Importe und Pseudonymisierung. Der Vergleich läuft im
  bisherigen Modus (Kurse tageweise, Vorgabe der Dienste, feste Reihenfolge); Lehrgänge als Blöcke, Urlaubsplan-Import,
  die Prüfung beim Ablegen, eigene Schritte, Dienstregeln, freie Reihenfolge, angepasste feste Schritte und die
  Regeln der Planung sowie Module und Teilbeleger (tests/modules.test.js) haben eigene Tests.
- **Desktop-Programm:** `e2e/desktop.test.mjs` prüft Start, Abschottung, Speichern/Öffnen mit
  Sicherungskopie, Schließen mit ungespeicherten Änderungen, PDF/Excel/CSV/HTML-Ausgabe,
  Wiederherstellung, den Jahreswechsel, den leeren Start und den Übungsmodus, den Urlaubsplan-Import aus Excel,
  Lehrgangsvorschläge, das Ziehen im Jahresplan, Reihenfolge, eigene Schritte und Dienste in den Ausbildungswegen,
  die Dienstplan-Bearbeitung je Person, das Anpassen fester Schritte, die Regeln der Planung, die Übernahme eines
  geänderten Wegs in den Jahresplan, den Zoom im Jahresplan, Basic Knowledge mit Modulen und Teilbelegern,
  das Fehlerprotokoll und die Suche nach einer neuen Version (gegen einen lokalen Server; der Kanal weist fremde
  Adressen ab) – wahlweise gegen das gepackte Programm (`M1_APP=<Pfad>`). Nicht automatisch geprüft ist die
  Installation einer Aktualisierung unter Windows selbst.
