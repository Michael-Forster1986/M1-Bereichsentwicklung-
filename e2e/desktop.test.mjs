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
const ARGS = ['.', '--user-data-dir=' + USER_DATA, ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : [])];
let app, page;
const errors = [];

async function launch(extra = []) {
  app = await _electron.launch({ cwd: ROOT, args: [...ARGS, ...extra] });
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
