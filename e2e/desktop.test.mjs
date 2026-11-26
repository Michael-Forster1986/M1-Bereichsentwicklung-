// Prüft das Desktop-Programm im echten Electron-Fenster: Start, Abschottung, Speichern/Öffnen,
// Sicherungskopie, Schließen mit ungespeicherten Änderungen, Ausgaben, Wiederherstellung.
// Aufruf: npm run e2e   (unter Linux ohne Bildschirm: xvfb-run -a npm run e2e)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'm1-e2e-'));
const USER_DATA = path.join(TMP, 'profil');
// M1_APP=<Pfad zur gepackten Programmdatei> prüft das fertige Programm statt des Quellstands
const PACKAGED = process.env.M1_APP || '';
const ARGS = [...(PACKAGED ? [] : ['.']), '--user-data-dir=' + USER_DATA, ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : [])];
let app, page;
const errors = [];

async function launch(extra = []) {
  app = await _electron.launch({ cwd: ROOT, args: [...ARGS, ...extra], ...(PACKAGED ? { executablePath: PACKAGED } : {}) });
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.waitForSelector('#main h1');
  return page;
}
const title = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
const menu = (cmd, arg) => app.evaluate(({ BrowserWindow }, [c, a]) => BrowserWindow.getAllWindows()[0].webContents.send('m1:command', c, a), [cmd, arg]);
const nextSave = file => app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: !f, filePath: f || undefined }); }, file);
const nextOpen = file => app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = async () => ({ canceled: !f, filePaths: f ? [f] : [] }); }, file);
const toastText = () => page.evaluate(() => document.querySelector('#toasts').innerText);
const waitFor = async (fn, what, ms = 8000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) assert.fail('Zeitüberschreitung: ' + what); await new Promise(r => setTimeout(r, 60)); } };
/** Fügt über die Oberfläche einen Ferienzeitraum hinzu – eine kleine, echte Änderung am Stand. */
async function change(name) {
  await menu('go', 'absences');
  await page.waitForSelector('#scName');
  await page.fill('#scName', name); await page.fill('#scStart', '2027-07-01'); await page.fill('#scEnd', '2027-07-02');
  await page.click('[data-act="school-add"]');
}

before(async () => { await launch(); });
after(async () => { if (app) { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy())).catch(() => {}); await app.close().catch(() => {}); } fs.rmSync(TMP, { recursive: true, force: true }); });

test('startet als Desktop-Programm aus dem Programmpaket', async () => {
  assert.equal(page.url(), 'app://cockpit/index.html');
  assert.match(await page.textContent('#main h1'), /^Übersicht \d{4}$/);
  assert.equal(await page.evaluate(() => window.m1desktop.info.ext), 'm1cockpit');
  assert.equal(await page.evaluate(() => typeof window.require + typeof window.process), 'undefinedundefined', 'kein Node.js in der Oberfläche');
  assert.equal(await title(), 'Unbenanntes Projekt – M1 Qualifikationscockpit');
  assert.match(await page.evaluate(() => navigator.language), /^de/, 'deutsche Oberfläche unabhängig von der Systemsprache');
});

test('baut keine Netzwerkverbindungen auf', async () => {
  const res = await page.evaluate(() => fetch('https://example.com/').then(() => 'offen', () => 'blockiert'));
  assert.equal(res, 'blockiert');
  const img = await page.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r('offen'); i.onerror = () => r('blockiert'); i.src = 'https://example.com/x.png'; }));
  assert.equal(img, 'blockiert');
  errors.length = 0;                                   // die beiden Versuche erzeugen erwartete CSP-Meldungen
});

test('Menü: alle elf Ansichten sind erreichbar', async () => {
  const expected = { overview: /^Übersicht/, year: /^Jahresplan/, capacity: /^Kapazität/, courses: /^Lehrg/, people: /^Personen/, routes: /^Ausbildungswege/, events: /^Termine/, absences: /^Abwesenheiten/, report: /^Bericht/, data: /^Daten/, help: /^Anleitung/ };
  for (const [id, re] of Object.entries(expected)) {
    await menu('go', id);
    await waitFor(async () => re.test(await page.textContent('#main h1')), 'Ansicht ' + id);
  }
  const labels = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map(i => i.label));
  assert.deepEqual(labels, ['&Datei', '&Bearbeiten', '&Ansicht', '&Planung', '&Hilfe']);
});

const FILE = path.join(TMP, 'Jahresplan Test.m1cockpit');
test('Speichern unter schreibt eine Projektdatei und merkt sie sich', async () => {
  await nextSave(FILE);
  await menu('act', 'save-project-as');
  await waitFor(() => fs.existsSync(FILE), 'Projektdatei');
  const prj = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  assert.equal(prj.format, 'M1-Cockpit'); assert.equal(prj.version, 5);
  assert.deepEqual(Object.keys(prj.years), ['2027']);
  assert.equal(prj.years['2027'].people.length, 141);
  await waitFor(async () => (await title()) === 'Jahresplan Test.m1cockpit – M1 Qualifikationscockpit', 'Fenstertitel');
  const recent = await page.evaluate(() => window.m1desktop.recent());
  assert.equal(recent[0].name, 'Jahresplan Test.m1cockpit');
});

test('Änderung markiert das Projekt als ungespeichert; Speichern legt eine Sicherungskopie an', async () => {
  await change('E2E-Ferien');
  await waitFor(async () => (await title()).startsWith('• '), 'Markierung im Titel');
  await nextSave('');                                   // kein Dialog nötig: es wird in die geöffnete Datei geschrieben
  await page.click('#top [data-act="save-project"]');
  await waitFor(async () => !(await title()).startsWith('• '), 'Titel ohne Markierung');
  assert.ok(fs.existsSync(FILE + '.bak'), 'Sicherungskopie .bak');
  const now = JSON.parse(fs.readFileSync(FILE, 'utf8')), bak = JSON.parse(fs.readFileSync(FILE + '.bak', 'utf8'));
  assert.ok(now.years['2027'].school.some(s => s.name === 'E2E-Ferien'));
  assert.ok(!bak.years['2027'].school.some(s => s.name === 'E2E-Ferien'), 'Sicherungskopie enthält den Stand davor');
});

test('Rückgängig nach dem Speichern führt wieder zu „ungespeichert“ und zurück', async () => {
  await page.click('#top [data-act="undo"]');
  await waitFor(async () => (await title()).startsWith('• '), 'ungespeichert nach Rückgängig');
  await page.click('#top [data-act="redo"]');
  await waitFor(async () => !(await title()).startsWith('• '), 'wieder gesichert nach Wiederholen');
});

test('Schließen fragt bei ungespeicherten Änderungen nach', async () => {
  await change('Noch-nicht-gesichert');
  await waitFor(async () => (await title()).startsWith('• '), 'ungespeichert');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await page.waitForSelector('#modal [data-act="m:discard"]');
  assert.match(await page.textContent('#modal h2'), /Änderungen speichern/);
  await page.click('#modal [data-act="modal-close"]');
  await new Promise(r => setTimeout(r, 300));
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1, 'Fenster bleibt nach Abbrechen offen');
  await page.click('#top [data-act="undo"]');           // Änderung zurücknehmen: Stand ist wieder gesichert
  await waitFor(async () => !(await title()).startsWith('• '), 'gesichert');
});

test('Öffnen lädt eine Projektdatei nach Prüfung; ältere Formate werden als Kopie übernommen', async () => {
  const single = path.join(TMP, 'Einzeljahr_v4.json');
  const prj = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  fs.writeFileSync(single, JSON.stringify(prj.years['2027']));        // Format der bisherigen HTML-Fassung
  await nextOpen(single);
  await menu('act', 'load-project');
  await page.waitForSelector('#modal [data-act="m:ok"]');
  assert.match(await page.textContent('#modal .body'), /Einzeldatei-Version/);
  assert.match(await page.textContent('#modal .body'), /als Kopie übernommen/);
  await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => (await title()) === 'Unbenanntes Projekt – M1 Qualifikationscockpit', 'Import ohne Dateibezug');
  await nextOpen(FILE);
  await page.click('#top [data-act="load-project"]');
  await page.waitForSelector('#modal [data-act="m:ok"]');
  await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => (await title()) === 'Jahresplan Test.m1cockpit – M1 Qualifikationscockpit', 'Projektdatei mit Dateibezug');
  // Rückgängig über das Laden hinweg stellt auch den Dateibezug wieder her
  await page.click('#top [data-act="undo"]');
  await waitFor(async () => (await title()) === 'Unbenanntes Projekt – M1 Qualifikationscockpit', 'Dateibezug folgt dem Rückgängig');
  await page.click('#top [data-act="redo"]');
  await waitFor(async () => (await title()) === 'Jahresplan Test.m1cockpit – M1 Qualifikationscockpit', 'Dateibezug folgt dem Wiederholen');
});

test('Ausgaben: CSV, Programm mit Stand (HTML) und PDF', async () => {
  const csv = path.join(TMP, 'Termine.csv'), htmlFile = path.join(TMP, 'Stand.html'), pdf = path.join(TMP, 'Ansicht.pdf');
  await nextSave(csv); await menu('act', 'events-export');
  await waitFor(() => fs.existsSync(csv), 'CSV');
  const text = fs.readFileSync(csv, 'utf8');
  assert.ok(text.startsWith('﻿pk;Name;type'), 'CSV mit BOM und Kopfzeile');
  assert.ok(text.split('\r\n').length > 100);
  await nextSave(htmlFile); await menu('act', 'save-snapshot');
  await waitFor(() => fs.existsSync(htmlFile), 'HTML');
  const snap = fs.readFileSync(htmlFile, 'utf8');
  assert.ok(snap.includes('"format":"M1-Cockpit","version":5'), 'Stand ist eingebettet');
  assert.ok(!/<script[^>]+src=/.test(snap), 'eigenständige Datei ohne Nachladen');
  await nextSave(pdf); await menu('go', 'report'); await menu('act', 'export-pdf-view');
  await waitFor(() => fs.existsSync(pdf) && fs.statSync(pdf).size > 5000, 'PDF', 30000);
  assert.equal(fs.readFileSync(pdf).subarray(0, 5).toString(), '%PDF-');
});

test('Ausgaben: Gesamtbericht als PDF und Excel-Arbeitsmappe', async () => {
  const pdf = path.join(TMP, 'Gesamtbericht.pdf'), xlsx = path.join(TMP, 'Auswertung.xlsx');
  await nextSave(pdf); await menu('act', 'export-pdf-report');
  await waitFor(() => fs.existsSync(pdf) && fs.statSync(pdf).size > 20000, 'Gesamtbericht', 30000);
  assert.equal(fs.readFileSync(pdf).subarray(0, 5).toString(), '%PDF-');
  assert.match(await page.textContent('#main h1'), /^Gesamtbericht/);
  assert.match(await page.textContent('#main .doc'), /Planungsergebnis je Person/);
  await nextSave(xlsx); await page.click('#main [data-act="export-xlsx"]');
  await waitFor(() => fs.existsSync(xlsx) && fs.statSync(xlsx).size > 20000, 'Excel-Arbeitsmappe');
  const bytes = fs.readFileSync(xlsx);
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  assert.ok(bytes.includes(Buffer.from('xl/worksheets/sheet9.xml')), 'neun Tabellenblätter');
});

test('Mehrjahresplanung: Folgejahr anlegen, wechseln, speichern und wieder laden', async () => {
  await menu('act', 'year-add');
  await page.waitForSelector('#modal #yrReopen');
  assert.match(await page.textContent('#modal h2'), /Folgejahr 2028 anlegen/);
  await page.uncheck('#yrReopen');                       // Cluster behalten: so gibt es im neuen Jahr sofort etwas zu planen
  await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => (await page.textContent('#main h1')) === 'Übersicht 2028', 'Übersicht 2028');
  assert.equal(await page.inputValue('.yearsel'), '2028');
  assert.match(await page.textContent('#main'), /Jahresvergleich/);
  assert.match(await page.textContent('#rail'), /Termine\s*$|Termine\s*0|Termine/m);
  // 2028 berechnen: Lehrgänge gibt es dort noch nicht, alle übrigen Wege werden geplant
  await page.click('#top [data-act="plan"]');
  await page.selectOption('#planMode', '16');
  await page.click('#planGo');
  await page.waitForSelector('#planResult [data-act="m:apply"]', { timeout: 60000 });
  await page.click('#planResult [data-act="m:apply"]');
  await menu('go', 'report');
  await waitFor(async () => /Neu geplant/.test(await page.textContent('#main')), 'Planungsergebnis 2028');
  // Wechsel über die Kopfzeile und zurück
  await page.selectOption('.yearsel', '2027');
  await menu('go', 'overview');
  await waitFor(async () => (await page.textContent('#main h1')) === 'Übersicht 2027', 'zurück nach 2027');
  // Speichern und Datei prüfen
  const two = path.join(TMP, 'Zwei Jahre.m1cockpit');
  await nextSave(two); await menu('act', 'save-project-as');
  await waitFor(() => fs.existsSync(two), 'Projektdatei mit zwei Jahren');
  const prj = JSON.parse(fs.readFileSync(two, 'utf8'));
  assert.deepEqual(Object.keys(prj.years), ['2027', '2028']);
  assert.equal(prj.active, 2027);
  assert.deepEqual(prj.years['2028'].courses, [], 'Lehrgänge gehören zu ihrem Jahr');
  assert.ok(prj.years['2027'].courses.length > 5 && prj.years['2027'].events.some(e => e.courseId));
  assert.ok(prj.years['2028'].events.length > 0 && prj.years['2028'].events.every(e => e.start.startsWith('2028-')));
  assert.ok(prj.years['2027'].events.every(e => e.start.startsWith('2027-')));
  // Rückgängig nimmt das Anlegen des Jahres vollständig zurück – und Wiederholen stellt es wieder her
  for (let i = 0; i < 3 && (await page.locator('.yearsel option').count()) > 2; i++) await page.click('#top [data-act="undo"]');
  assert.equal(await page.locator('.yearsel option').count(), 2, 'nur 2027 und „Folgejahr anlegen“');
  for (let i = 0; i < 3 && (await page.locator('.yearsel option').count()) < 3; i++) await page.click('#top [data-act="redo"]');
  assert.equal(await page.locator('.yearsel option').count(), 3);
  // Neu laden: beide Jahre sind da
  await nextOpen(two); await menu('act', 'load-project');
  await page.waitForSelector('#modal [data-act="m:ok"]');
  assert.match(await page.textContent('#modal .body'), /2027, 2028/);
  await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => (await title()) === 'Zwei Jahre.m1cockpit – M1 Qualifikationscockpit', 'geladenes Projekt');
  assert.equal(await page.locator('.yearsel option').count(), 3);
});

test('Echtbetrieb: simulierte Daten entfernen und Urlaubsplan aus Excel einspielen', async () => {
  await page.selectOption('.yearsel', '2027');
  await menu('go', 'data');
  await page.waitForSelector('#liveCard');
  const before = await page.evaluate(() => document.querySelector('#rail [data-id="people"] .cnt').textContent);
  await page.click('#liveCard [data-act="go-live"]');
  await page.waitForSelector('#modal #glAbs');
  await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => /Personen und Cluster sind unverändert/.test(await toastText()), 'simulierte Daten entfernt');
  assert.equal(await page.evaluate(() => document.querySelector('#rail [data-id="people"] .cnt').textContent), before, 'Personen bleiben erhalten');
  assert.match(await page.textContent('#liveCard'), /Noch kein Urlaubsplan eingespielt/);
  assert.match(await page.textContent('#top'), /Echtdaten/);
  // Excel-Tabelle: Zeile je Person, Tageszahlen unter Monatsnamen, Kürzel U und K
  const Core = await import('../src/core/index.js');
  const cal = Core.makeCalendar(2027), months = ['', ''], days = ['PersNr', 'Name'], MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  for (let d = 0; d < cal.n; d++) { months.push(cal.dom[d] === 1 ? MON[cal.month[d]] : ''); days.push(cal.dom[d]); }
  const rows = [months, days];
  for (let i = 1; i <= 100; i++) { const r = ['D' + String(i).padStart(5, '0'), 'Person ' + String(i).padStart(3, '0')]; for (let d = 0; d < cal.n; d++) r.push(Math.floor(d / 7) % 12 === i % 12 && cal.dow[d] % 6 ? 'U' : d === 100 + i ? 'K' : ''); rows.push(r); }
  const xlsx = path.join(TMP, 'Urlaubsplan.xlsx');
  fs.writeFileSync(xlsx, await Core.writeXlsx([{ name: 'Urlaub 2027', rows }]));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#liveCard [data-act="imp-matrix"]')]);
  await chooser.setFiles(xlsx);
  await page.waitForSelector('#modal #mxSum');
  const body = await page.textContent('#modal .body');
  assert.match(body, /Tageszahlen unter Monatsnamen/); assert.match(body, /100 von 141/);
  assert.equal(await page.inputValue('#modal [data-c="U"]'), 'Urlaub'); assert.equal(await page.inputValue('#modal [data-c="K"]'), 'Krank');
  await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => /Urlaubsplan übernommen/.test(await toastText()), 'Urlaubsplan übernommen');
  await waitFor(async () => /reale Abwesenheiten/.test(await page.textContent('#liveCard')), 'Urlaubsplan gilt als real');
});

test('Lehrgänge: beste Zeiträume berechnen, übernehmen und im Jahresplan nachziehen', async () => {
  await menu('go', 'courses');
  await page.waitForSelector('[data-act="crs-propose"]');
  assert.match(await page.textContent('#main'), /Noch keine Lehrgänge/);
  await page.click('[data-act="crs-propose"][data-k="Theorie|A330"]');
  await page.waitForSelector('#modal #cpLen');
  await page.click('#modal #cpGo');
  await page.waitForSelector('#crsProp [data-act="crs-prop-all"]', { timeout: 60000 });
  const n = await page.locator('#crsProp tbody tr').count();
  assert.ok(n >= 2, 'mehrere Lehrgänge vorgeschlagen');
  await page.click('#crsProp [data-act="crs-prop-all"]');
  await waitFor(async () => (await page.locator('.crs-time .cbar').count()) === n, 'Lehrgänge in der Zeitleiste');
  await waitFor(async () => (await page.locator('#crsDetail').count()) === 1, 'erster Lehrgang ist geöffnet');
  assert.match(await page.textContent('#crsDetail'), /Teilnehmer/);
  // Jahresplan berechnen und einen FitCheck von Hand hineinziehen
  await page.click('#top [data-act="plan"]'); await page.selectOption('#planMode', '16'); await page.click('#planGo');
  await page.waitForSelector('#planResult [data-act="m:apply"]', { timeout: 60000 });
  await page.click('#planResult [data-act="m:apply"]');
  await menu('go', 'year');
  await page.waitForSelector('#gantt .g-row');
  await page.evaluate(() => { document.querySelector('#toasts').innerHTML = ''; });
  const bars = await page.locator('#gantt .bar').count();
  const chip = await page.locator('.pchip[data-type="FitCheck"]').boundingBox(), track = await page.locator('#gantt .g-row').nth(2).locator('.g-track').boundingBox();
  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2); await page.mouse.down();
  await page.mouse.move(chip.x + 30, chip.y + 30, { steps: 3 }); await page.mouse.move(track.x + track.width * 0.4, track.y + track.height / 2, { steps: 6 });
  await waitFor(async () => (await page.locator('.g-drop i').count()) > 0, 'Vorschau beim Ziehen');
  assert.match(await page.textContent('#dragGhost'), /FitCheck/);
  await page.mouse.up();
  await waitFor(async () => (await page.locator('#modal:not([hidden]) [data-act="m:force"]').count()) > 0 || /eingetragen/.test(await toastText()), 'Prüfung nach dem Ablegen');
  if (await page.locator('#modal:not([hidden]) [data-act="m:force"]').count()) { const alt = page.locator('#modal [data-act="m:alt"]'); await ((await alt.count()) ? alt : page.locator('#modal [data-act="m:force"]')).click(); }
  await waitFor(async () => (await page.locator('#gantt .bar').count()) === bars + 1, 'neuer Balken im Jahresplan');
});

test('Ausbildungswege und Anleitung sind vollständig', async () => {
  await menu('go', 'routes');
  assert.equal(await page.locator('.rt-card').count(), 6);
  assert.ok((await page.locator('.rt-flow .rt-step').count()) >= 2);
  await menu('go', 'help');
  assert.equal(await page.locator('.h-doc section').count(), 14);
  assert.equal(await page.locator('.h-toc button').count(), 14);
});

test('keine Programmfehler in der Oberfläche', () => { assert.deepEqual(errors, []); });

test('Wiederherstellungskopie: nur auf Wunsch, wird nach Absturz angeboten', async () => {
  const rec = path.join(USER_DATA, 'Wiederherstellung.m1cockpit');
  await change('Ohne-Wiederherstellung');
  await new Promise(r => setTimeout(r, 1800));
  assert.ok(!fs.existsSync(rec), 'standardmäßig keine Kopie im Benutzerprofil');
  await menu('go', 'data');
  await page.check('[data-chg="autosave"]');
  await change('Mit-Wiederherstellung');
  await waitFor(() => fs.existsSync(rec), 'Wiederherstellungskopie');
  // Absturz simulieren: Fenster ohne Nachfrage zerstören, neu starten
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].destroy());
  await app.close().catch(() => {});
  await launch();
  await waitFor(async () => /Wiederherstellungskopie/.test(await toastText()), 'Angebot zur Wiederherstellung');
  await page.click('#toasts button');
  await menu('go', 'absences');
  await waitFor(async () => /Mit-Wiederherstellung/.test(await page.textContent('#main')), 'wiederhergestellter Stand');
  assert.ok((await title()).startsWith('• '), 'wiederhergestellter Stand gilt als ungespeichert');
});

test('„Nicht speichern“ schließt das Fenster und entfernt die Wiederherstellungskopie', async () => {
  await nextOpen(FILE);
  await menu('act', 'load-project');
  await page.waitForSelector('#modal [data-act="m:ok"]');
  await page.click('#modal [data-act="m:ok"]');
  await change('Wird-verworfen');
  await waitFor(() => fs.existsSync(path.join(USER_DATA, 'Wiederherstellung.m1cockpit')), 'Wiederherstellungskopie der Änderung');
  const closed = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await page.waitForSelector('#modal [data-act="m:discard"]');
  await page.click('#modal [data-act="m:discard"]');
  await closed;
  app = null;
  assert.ok(!fs.existsSync(path.join(USER_DATA, 'Wiederherstellung.m1cockpit')));
  assert.ok(!JSON.parse(fs.readFileSync(FILE, 'utf8')).years['2027'].school.some(s => s.name === 'Wird-verworfen'), 'Datei bleibt unverändert');
});
