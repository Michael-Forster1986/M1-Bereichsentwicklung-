// Prüft das Desktop-Programm im echten Electron-Fenster: Start, Abschottung, Speichern/Öffnen,
// Sicherungskopie, Schließen mit ungespeicherten Änderungen, Ausgaben, Wiederherstellung.
// Aufruf: npm run e2e   (unter Linux ohne Bildschirm: xvfb-run -a npm run e2e)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
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
const CLOCK = '2026-11-26T09:00:00';               // aus Sicht der Oberfläche: Planungsjahr 2027
// In den Tests sucht das Programm höchstens nach einer neuen Version – geladen oder installiert wird nichts
process.env.M1_UPDATE_DRY = '1';

async function launch(extra = [], env = {}) {
  app = await _electron.launch({ cwd: ROOT, args: [...ARGS, ...extra], env: { ...process.env, ...env }, ...(PACKAGED ? { executablePath: PACKAGED } : {}) });
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.waitForSelector('#main h1');
  // Die Tests rechnen mit dem Planungsjahr 2027. Das Programm leitet es aus dem Datum ab – deshalb steht die Uhr der
  // Oberfläche hier fest (Zeitgeber laufen normal weiter), und die Oberfläche startet damit noch einmal.
  await page.clock.setFixedTime(new Date(CLOCK));
  await page.reload();
  await page.waitForSelector('#main h1');
  assert.equal(await page.evaluate(() => new Date().getFullYear() + '-' + (new Date().getMonth() + 1)), '2026-11', 'feste Uhr der Oberfläche');
  return page;
}
/** Beendet das Programm und wartet, bis der Prozess wirklich fort ist – sonst weist die Einzelinstanz-Sperre den nächsten Start ab. */
async function shutdown() {
  if (!app) return;
  const proc = app.process(), gone = new Promise(r => { if (proc.exitCode !== null || proc.signalCode !== null) r(); else proc.once('exit', r); });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy())).catch(() => {});
  await app.close().catch(() => {});
  await gone; app = null;
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
after(async () => { await shutdown(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('startet als Desktop-Programm aus dem Programmpaket', async () => {
  assert.equal(page.url(), 'app://cockpit/index.html');
  assert.equal(await page.textContent('#main h1'), 'Übersicht');
  assert.equal(await page.evaluate(() => window.m1desktop.info.ext), 'm1cockpit');
  assert.equal(await page.evaluate(() => typeof window.require + typeof window.process), 'undefinedundefined', 'kein Node.js in der Oberfläche');
  assert.equal(await title(), 'Unbenanntes Projekt – M1 Qualifikationscockpit');
  assert.match(await page.evaluate(() => navigator.language), /^de/, 'deutsche Oberfläche unabhängig von der Systemsprache');
});

test('Kopfzeile: die Programmversion steht oben links neben dem Programmnamen', async () => {
  const version = await app.evaluate(({ app: a }) => a.getVersion());
  assert.match(version, /^\d+\.\d+\.\d+$/);
  if (!PACKAGED) assert.equal(version, JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version);
  assert.equal((await page.locator('#top #appVersion').textContent()).trim(), 'Version ' + version);          // im schmalen Fenster ist nur die Nummer sichtbar
  assert.equal(await page.isVisible('#appVersion'), true);
  // links oben: gleich hinter dem Programmnamen, in der Kopfzeile sichtbar
  const name = await page.locator('#top .brand b').boundingBox(), ver = await page.locator('#appVersion').boundingBox(), top = await page.locator('#top').boundingBox();
  assert.ok(ver.x >= name.x + name.width - 1 && ver.x < name.x + name.width + 40, 'direkt hinter dem Programmnamen');
  assert.ok(ver.y >= top.y && ver.y + ver.height <= top.y + top.height + 1, 'in der Kopfzeile');
  assert.ok(ver.x + ver.width < 520, 'im linken Teil der Kopfzeile');
  // die Nummer ist vollständig zu sehen – nichts ist abgeschnitten
  // die Nummer ist vollständig zu sehen, und nichts ragt rechts aus der Kopfzeile
  assert.deepEqual(await page.evaluate(() => { const el = document.querySelector('#appVersion'), hit = r => document.elementFromPoint(r.left + 2, r.top + r.height / 2), r = el.getBoundingClientRect(), last = [...document.querySelectorAll('#top > *')].filter(e => e.getBoundingClientRect().width > 0).pop().getBoundingClientRect();
    const at = hit(r);
    return { ganz: el.scrollWidth <= el.clientWidth + 1 && (at === el || el.contains(at)), imFenster: last.right <= innerWidth + 0.5 }; }), { ganz: true, imFenster: true });
});

test('Normalbetrieb startet leer; der Übungsmodus lädt simulierte Daten und bleibt gespeichert', async () => {
  const settings = () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'einstellungen.json'), 'utf8'));
  assert.equal(await page.locator('#rail [data-id="people"] .cnt').innerText(), '0', 'ohne Übungsmodus enthält das Programm keine Personen');
  assert.match(await page.textContent('#startCard'), /Personen & Cluster[\s\S]*Urlaubsplan[\s\S]*Lehrgangstermine[\s\S]*Dienstplan/);
  assert.match(await page.textContent('#top'), /Leeres Projekt/);
  await page.click('[data-act="practice-on"]');
  await waitFor(async () => /^Übersicht \d{4}$/.test(await page.textContent('#main h1')), 'simulierte Daten');
  assert.match(await page.textContent('#top'), /Übungsmodus · simulierte Daten/);
  assert.equal(await page.locator('#rail [data-id="people"] .cnt').innerText(), '141');
  await waitFor(() => settings().practice === true, 'Schalter gespeichert');
  await menu('go', 'data');
  assert.equal(await page.isChecked('#practiceCard [data-chg="practice"]'), true);
  assert.equal(await title(), 'Unbenanntes Projekt – M1 Qualifikationscockpit', 'Übungsdaten gelten nicht als ungespeicherte Arbeit');
  await menu('go', 'overview');
});

test('baut keine Netzwerkverbindungen auf', async () => {
  const res = await page.evaluate(() => fetch('https://example.com/').then(() => 'offen', () => 'blockiert'));
  assert.equal(res, 'blockiert');
  const img = await page.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r('offen'); i.onerror = () => r('blockiert'); i.src = 'https://example.com/x.png'; }));
  assert.equal(img, 'blockiert');
  errors.length = 0;                                   // die beiden Versuche erzeugen erwartete CSP-Meldungen
});

test('Menü: alle zwölf Ansichten sind erreichbar', async () => {
  const expected = { overview: /^Übersicht/, year: /^Jahresplan/, capacity: /^Kapazität/, courses: /^Lehrg/, people: /^Personen/, roster: /^Dienstplan/, routes: /^Ausbildungswege/, events: /^Termine/, absences: /^Abwesenheiten/, report: /^Bericht/, data: /^Daten/, help: /^Anleitung/ };
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
  assert.ok(text.startsWith('\uFEFFpk;Name;type'), 'CSV mit BOM und Kopfzeile');
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

test('Ziehen im Jahresplan endet sicher, wenn das Loslassen nicht ankommt', async () => {
  await menu('go', 'year');
  const bar = page.locator('#gantt .bar.t-PracticalLogbook, #gantt .bar.t-FitCheck, #gantt .bar.t-ICA').first();
  await bar.waitFor(); await bar.scrollIntoViewIfNeeded();
  const b = await bar.boundingBox(), y = b.y + b.height / 2, count = await page.locator('#gantt .bar').count();
  const dragging = () => page.evaluate(() => document.body.classList.contains('dragging') || !!document.querySelector('.g-drop') || !!document.querySelector('#dragGhost:not([hidden])'));
  await page.mouse.move(b.x + 2, y); await page.mouse.down(); await page.mouse.move(b.x + 90, y, { steps: 6 });
  await waitFor(dragging, 'Zug läuft');
  assert.equal(await page.evaluate(() => document.querySelector('#tip').hidden), true, 'beim Ziehen bleibt das Hinweisfenster aus');
  // die Taste ist nicht mehr gedrückt, das Loslassen hat das Fenster aber nie erreicht
  await page.evaluate(([x, yy]) => document.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, buttons: 0, clientX: x, clientY: yy, bubbles: true })), [b.x + 150, y]);
  assert.equal(await dragging(), false, 'der Zug ist beendet');
  await page.mouse.up();
  assert.equal(await page.locator('#gantt .bar').count(), count, 'nichts wurde eingetragen');
  assert.equal(await page.evaluate(() => document.querySelector('#modal').hidden), true);
});

test('Ausbildungswege und Anleitung sind vollständig', async () => {
  await menu('go', 'routes');
  assert.equal(await page.locator('.rt-card').count(), 6);
  assert.ok((await page.locator('.rt-flow .rt-step').count()) >= 2);
  await menu('go', 'help');
  assert.equal(await page.locator('.h-doc section').count(), 14);
  assert.equal(await page.locator('.h-toc button').count(), 14);
});

test('Ausbildungswege: Reihenfolge per Ziehen, eigener Schritt und zulässige Dienste', async () => {
  await menu('go', 'routes'); await page.waitForSelector('#msCard');
  await page.click('.rt-card >> nth=1');                                     // Cluster 2: Logbook, FitCheck, ICA
  const order = () => page.evaluate(() => [...document.querySelectorAll('.rt-flow[data-sortable] .rt-step[data-step]')].map(x => x.dataset.step));
  assert.deepEqual(await order(), ['Practical Logbook', 'FitCheck', 'ICA']);
  // Kachel am Kopf greifen und vor die Nachbarkachel ziehen. Beide zuerst in den sichtbaren Bereich holen –
  // auf kleinen Bildschirmen liegt der Ablauf sonst unterhalb oder rechts außerhalb des Fensters.
  await page.evaluate(() => document.querySelector('.rt-step[data-step="FitCheck"]').scrollIntoView({ block: 'center', inline: 'start' }));
  const grip = await page.locator('.rt-step[data-step="ICA"] .rt-sh b').boundingBox(), target = await page.locator('.rt-step[data-step="FitCheck"]').boundingBox();
  const view = page.viewportSize() || await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(grip.x > 0 && grip.x + 8 < view.width && grip.y > 0 && grip.y < view.height, 'die Kachel liegt im sichtbaren Bereich');
  await page.mouse.move(grip.x + 8, grip.y + grip.height / 2); await page.mouse.down();
  await page.mouse.move(grip.x - 30, grip.y + 4, { steps: 4 }); await page.mouse.move(target.x + 20, target.y + 30, { steps: 8 });
  await waitFor(() => page.evaluate(() => (document.querySelector('.rt-step.drop-before') || { dataset: {} }).dataset.step === 'FitCheck'), 'Marke an der Zielstelle');
  await page.mouse.up();
  await waitFor(async () => (await order())[1] === 'ICA', 'neue Reihenfolge');
  assert.deepEqual(await order(), ['Practical Logbook', 'ICA', 'FitCheck']);
  // mit dem Pfeil zurück
  await page.click('[data-act="route-move"][data-t="ICA"][data-dir="1"]');
  assert.deepEqual(await order(), ['Practical Logbook', 'FitCheck', 'ICA']);
  // eigener Schritt: im Spätdienst zulässig, zwei Tage, gleich im Weg
  await page.click('#msCard [data-act="measure-new"]'); await page.waitForSelector('#msName');
  await page.fill('#msName', 'Human Factors'); await page.fill('#msShort', 'HF'); await page.check('#msS1'); await page.fill('#msDays', '2');
  await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => (await order()).includes('Human Factors'), 'eigener Schritt im Weg');
  assert.deepEqual(await order(), ['Practical Logbook', 'FitCheck', 'ICA', 'Human Factors']);
  assert.match(await page.locator('#msCard tr:has-text("Human Factors")').innerText(), /eigener Schritt/);
  // zulässige Dienste einer festen Maßnahme ändern; der letzte Dienst lässt sich nicht abwählen
  await page.click('#msCard input[data-t="FitCheck"][data-i="1"]');
  await waitFor(async () => /Früh- und Spätdienst/.test(await page.locator('.rt-step[data-step="FitCheck"] .rt-kind').innerText()), 'Dienstregel auf der Schrittkarte');
  await page.click('#msCard input[data-t="ICA"][data-i="0"]');
  await waitFor(async () => /Mindestens ein Dienst/.test(await toastText()), 'letzter Dienst bleibt');
  assert.equal(await page.isChecked('#msCard input[data-t="ICA"][data-i="0"]'), true);
  // alles steht in der Projektdatei
  const file = path.join(TMP, 'Wege.m1cockpit');
  await nextSave(file); await menu('act', 'save-project-as');
  await waitFor(() => fs.existsSync(file), 'Projektdatei mit eigenem Schritt');
  const prj = JSON.parse(fs.readFileSync(file, 'utf8')), st = prj.years[prj.active];
  assert.deepEqual(st.measures, [{ name: 'Human Factors', short: 'HF', color: 1, course: false }]);
  assert.deepEqual(st.routes['2'], ['Practical Logbook', 'FitCheck', 'ICA', 'Human Factors']);
  assert.deepEqual(st.settings.shifts, { 'FitCheck': [true, true, false], 'Human Factors': [true, true, false] });
  assert.equal(st.config['2']['Human Factors'].days, 2);
  // Neu berechnen plant den eigenen Schritt; er erscheint im Jahresplan in seiner Farbe
  await page.click('#top [data-act="plan"]'); await page.selectOption('#planMode', '16'); await page.click('#planGo');
  await page.waitForSelector('#planResult [data-act="m:apply"]', { timeout: 60000 });
  await page.click('#planResult [data-act="m:apply"]');
  await menu('go', 'year');
  await waitFor(async () => (await page.locator('#gantt .bar.t-x1').count()) > 0, 'Balken des eigenen Schritts');
  assert.ok(await page.locator('.pchip:has-text("HF")').count(), 'eigener Schritt lässt sich in den Jahresplan ziehen');
});

test('Ausbildungswege: feste Schritte ändern, Regeln einstellen, Kacheln ohne Überlappung', async () => {
  await menu('go', 'routes'); await page.waitForSelector('#rulesCard');
  // Kacheln: keine Beschriftung ragt in ein Eingabefeld oder über den Kachelrand – auch nicht mit deutlich breiterer Schrift
  const overlap = () => page.evaluate(() => {
    const bad = [];
    for (const l of document.querySelectorAll('.rt-res label, .rt-days')) {
      const s = l.querySelector('span').getBoundingClientRect(), i = l.querySelector('input').getBoundingClientRect(), card = l.closest('.rt-step').getBoundingClientRect();
      const hit = !(s.right <= i.left + 0.5 || s.left >= i.right - 0.5 || s.bottom <= i.top + 0.5 || s.top >= i.bottom - 0.5);
      if (hit || i.right > card.right + 0.5 || s.right > card.right + 0.5) bad.push(l.textContent.trim());
    }
    return bad;
  });
  assert.ok(await page.locator('.rt-res label').count() >= 8);
  assert.deepEqual(await overlap(), []);
  const wide = await page.addStyleTag({ content: '.rt-step, .rt-step *{letter-spacing:.09em !important}' });
  assert.deepEqual(await overlap(), [], 'auch mit breiterer Schrift');
  await wide.evaluate(n => n.remove());

  // feste Maßnahme: Bezeichnung, Kürzel und Farbe ändern – der Name bleibt der Schlüssel
  await page.click('#msCard [data-act="measure-edit"][data-t="Practical Logbook"]'); await page.waitForSelector('#msName');
  assert.equal(await page.inputValue('#msName'), 'Practical Logbook');
  assert.equal(await page.isDisabled('input[name=msKind][value="1"]'), true, 'Art gesperrt, weil es bereits Termine gibt');
  await page.fill('#msName', 'FitCheck'); await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => /gibt es bereits als feste Maßnahme/.test(await toastText()), 'vergebene Bezeichnung wird abgelehnt');
  await page.fill('#msName', 'Logbuch Praxis'); await page.fill('#msShort', 'LB'); await page.click('.ms-colors label:has(input[value="4"]) i');
  await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => (await page.locator('.rt-step[data-step="Practical Logbook"] .rt-sh b').innerText()) === 'Logbuch Praxis', 'neue Bezeichnung auf der Schrittkarte');
  assert.match(await page.locator('#msCard tr:has-text("Logbuch Praxis")').innerText(), /angepasst/);
  assert.equal(await page.locator('.rt-step[data-step="Practical Logbook"] .rt-top.t-x4').count(), 1, 'neue Farbe');
  // Vorbereitung und ICA: die Art steht fest
  await page.click('#msCard [data-act="measure-edit"][data-t="ICA"]'); await page.waitForSelector('#msName');
  assert.equal(await page.isDisabled('input[name=msKind][value="1"]'), true);
  assert.match(await page.locator('#modal').innerText(), /Die Art steht fest/);
  await page.click('#modal [data-act="modal-close"]');

  // Regeln: Voraussetzung nur noch für Cluster 4B, A320-Regel aus, Weg für die Zielstufe TEC um die ICA erweitert
  await page.click('#rulesCard [data-chg="rule-frame"][data-k="3"]');
  await waitFor(async () => /Voraussetzung für Cluster 4B/.test(await toastText()), 'Regel zur Voraussetzung geändert');
  await page.click('#rulesCard [data-chg="rule"][data-k="deferA320"]');
  await waitFor(() => page.evaluate(() => /gilt nicht/.test(document.querySelector('#rulesCard [data-k="deferA320"]').closest('label').innerText)), 'A320-Regel abgeschaltet');
  await page.click('#rulesCard [data-act="rule-tec-edit"]'); await page.waitForSelector('#tecRoute');
  const tec = () => page.evaluate(() => [...document.querySelectorAll('.rt-flow[data-scope="tec"] .rt-step')].map(x => x.dataset.step));
  assert.deepEqual(await tec(), ['Theorie', 'Praxis']);
  await page.click('[data-act="route-add"][data-scope="tec"][data-t="ICA"]');
  await waitFor(async () => (await tec()).length === 3, 'ICA im Weg für die Zielstufe TEC');
  await page.click('.rt-flow[data-scope="tec"] [data-act="route-move"][data-t="ICA"][data-dir="-1"]');
  await waitFor(async () => (await tec())[1] === 'ICA', 'ICA vorgezogen');
  assert.deepEqual(await tec(), ['Theorie', 'ICA', 'Praxis']);
  assert.equal(await page.locator('#ruleTec').innerText(), 'Theorie → ICA → Praxis');
  assert.equal(await page.locator('#rulesCard .pill:has-text("geändert")').count(), 3);
  // der Clusterweg von Cluster 5 bleibt davon unberührt
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.rt-flow[data-keep="rtflow"] .rt-step')].map(x => x.dataset.step)), ['Practical Logbook']);

  // alles steht in der Projektdatei – gespeichert wird nur die Abweichung von der Vorgabe
  const file = path.join(TMP, 'Regeln.m1cockpit');
  await nextSave(file); await menu('act', 'save-project-as');
  await waitFor(() => fs.existsSync(file), 'Projektdatei mit Regeln');
  const prj = JSON.parse(fs.readFileSync(file, 'utf8')), st = prj.years[prj.active];
  assert.deepEqual(st.settings.rules, { frame: ['4B'], tecRoute: ['Theorie', 'ICA', 'Praxis'], deferA320: false });
  assert.deepEqual(st.measureEdits, { 'Practical Logbook': { label: 'Logbuch Praxis', short: 'LB', color: 4 } });
  assert.ok(st.events.some(e => e.type === 'Practical Logbook') && !st.events.some(e => e.type === 'Logbuch Praxis'), 'Termine behalten den Namen der Maßnahme');
  // zurück auf die Vorgabe
  await page.click('#rulesCard [data-act="rules-reset"]'); await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => (await page.locator('#rulesCard .pill:has-text("geändert")').count()) === 0, 'Regeln wieder auf Vorgabe');
  assert.deepEqual(await tec(), ['Theorie', 'Praxis']);
});

test('Ausbildungswege: ein geänderter individueller Weg kommt per Knopf in den Jahresplan', async () => {
  await menu('go', 'routes'); await page.waitForSelector('#rtPlan');
  await page.click('.rt-card >> nth=1');                                     // Cluster 2
  const snap = async name => { const f = path.join(TMP, name); await nextSave(f); await menu('act', 'save-project-as'); await waitFor(() => fs.existsSync(f), name); const prj = JSON.parse(fs.readFileSync(f, 'utf8')); return prj.years[prj.active]; };
  const sig = e => [e.id, e.type, e.start, e.end].join('|');
  const before = await snap('Vor-Uebernahme.m1cockpit');
  // eine Person wählen und ihren Weg ändern: FitCheck 4 Tage – damit entsteht ein individueller Weg
  const alias = await page.evaluate(() => document.querySelector('[data-chg="route-person"] option:nth-child(2)').value);
  await page.selectOption('[data-chg="route-person"]', alias);
  await waitFor(async () => /Individueller Weg/.test(await page.locator('#main').innerText()), 'Person gewählt');
  assert.equal(await page.locator('#rtPlan.dirty').count(), 0, 'ohne Änderung kein Hinweis');
  await page.fill('.rt-flow[data-keep="rtflow"] .rt-step[data-step="FitCheck"] input[data-f="days"]', '4'); await page.keyboard.press('Tab');
  await page.waitForSelector('#rtPlan.dirty');
  assert.match(await page.locator('#rtPlan').innerText(), /noch nicht übernommen/);
  // der Jahresplan ist bis hierher unverändert
  const between = await snap('Zwischen-Uebernahme.m1cockpit'), person = between.people.find(p => p.alias === alias);
  assert.equal(person.customRoute.config.FitCheck.days, 4);
  assert.deepEqual(between.events.map(sig).sort(), before.events.map(sig).sort());
  // Übernahme: nur diese Person wird neu verteilt
  await page.click('#rtPlan [data-act="route-apply"]');
  await waitFor(async () => /in den Jahresplan übernommen|planbar/.test(await toastText()), 'Meldung zur Übernahme');
  await waitFor(async () => (await page.locator('#rtPlan.dirty').count()) === 0, 'Hinweis verschwindet');
  const after = await snap('Nach-Uebernahme.m1cockpit'), r = after.report.find(x => x.pk === person.pk);
  assert.deepEqual(after.events.filter(e => e.pk !== person.pk).map(sig).sort(), before.events.filter(e => e.pk !== person.pk).map(sig).sort(), 'alle anderen Termine bleiben unverändert');
  assert.ok(r && ['planned', 'kept', 'partial', 'blocked'].includes(r.status), 'Berichtszeile der Person');
  if (r.status === 'planned') {
    assert.equal(after.events.filter(e => e.pk === person.pk && e.type === 'FitCheck').reduce((s, e) => s + e.dates.length, 0), 4, 'FitCheck mit vier Tagen im Jahresplan');
    const old = new Set(before.events.filter(e => e.pk === person.pk && e.auto).map(e => e.id));
    assert.ok(after.events.filter(e => e.pk === person.pk && e.auto).every(e => !old.has(e.id)), 'berechnete Termine der Person neu verteilt');
  }
  // die Meldung führt in den Jahresplan
  await page.click('#toasts .toast:has-text("Jahresplan") button');
  await page.waitForSelector('#gantt .g-row');
  await page.keyboard.press('Control+z');                                     // Rückgängig nimmt die Übernahme zurück
  await menu('go', 'routes'); await page.waitForSelector('#rtPlan');
});

test('Jahresplan: Monatsansicht zeigt die Zeilen, hineinzoomen bis auf einzelne Tage', async () => {
  await menu('go', 'year'); await page.waitForSelector('.g-row');
  assert.match(await page.locator('#main').innerText(), /Logbuch Praxis/, 'geänderte Bezeichnung in der Legende');
  const rowVisible = () => page.evaluate(() => {
    const lab = document.querySelector('.g-row .g-lab'); lab.scrollIntoView({ block: 'center' });
    const r = lab.getBoundingClientRect(), el = document.elementFromPoint(r.left + 20, r.top + r.height / 2);
    return r.width > 50 && r.height > 10 && !!el && !!el.closest('.g-lab') && lab.textContent.trim().length > 0;
  });
  assert.equal(await rowVisible(), true, 'Zeilen in der Jahresansicht');
  assert.equal(await page.locator('.g-days').count(), 0, 'in der Jahresansicht keine Tagesleiste');
  for (const [z, name] of [['12', 'Monat'], ['26', '2 Wochen']]) {
    await page.click('[data-act="gantt-zoom"][data-z="' + z + '"]');
    await waitFor(() => page.evaluate(() => document.querySelectorAll('.g-days span').length === 365), 'Tagesleiste in der Ansicht ' + name);
    assert.equal(await rowVisible(), true, 'Zeilen in der Ansicht ' + name);
    // je nach Fensterbreite steht der Wochentag dabei; in der Ansicht „2 Wochen“ immer
    assert.match(await page.locator('.g-days span >> nth=3').innerText(), z === '26' ? /^(Mo|Di|Mi|Do|Fr|Sa|So) \d+\.$/ : /^((Mo|Di|Mi|Do|Fr|Sa|So) )?\d+\.$/, 'Tag (und Wochentag)');
  }
  // Strg + Mausrad zoomt stufenweise heraus
  const box = await page.locator('#gantt').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height, 200) / 2);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, 120); await page.keyboard.up('Control');
  await waitFor(() => page.evaluate(() => (document.querySelector('[data-act="gantt-zoom"].on, [data-act="gantt-zoom"][aria-pressed="true"]') || { dataset: {} }).dataset.z === '12'), 'Strg + Mausrad: zurück zur Monatsansicht');
  await page.click('[data-act="gantt-zoom"][data-z="1"]');
  await waitFor(async () => (await page.locator('.g-days').count()) === 0, 'zurück in der Jahresansicht');
});

test('Lehrgänge: Basic Knowledge mit Modulen, N/A und Teilbelegern – bis in den Jahresplan', async () => {
  // Basic Knowledge gehört für diesen Test zum Weg von Cluster 1
  await menu('go', 'routes'); await page.waitForSelector('#rtPlan');
  await page.click('.rt-card >> nth=0');
  await page.click('.rt-flow[data-keep="rtflow"] ~ .row [data-act="route-add"][data-t="Basic Knowledge"]');
  await page.waitForSelector('.rt-step[data-step="Basic Knowledge"]');
  await page.fill('.rt-step[data-step="Basic Knowledge"] input[data-f="days"]', '20'); await page.keyboard.press('Tab');
  await menu('go', 'courses'); await page.waitForSelector('.dm:has-text("Basic Knowledge") [data-act="crs-new"]');
  await page.click('.dm:has-text("Basic Knowledge") [data-act="crs-new"]'); await page.waitForSelector('#cnTitle');
  // die Erweiterung erscheint nur bei Basic Knowledge; die Modul-Tabelle erst mit dem Kästchen „Teilbeleger dabei“
  assert.equal(await page.isVisible('#cnMods'), true);
  await page.selectOption('#cnType', 'Theorie'); assert.equal(await page.isVisible('#cnMods'), false);
  await page.selectOption('#cnType', 'Basic Knowledge'); assert.equal(await page.isVisible('#cnMods'), true);
  assert.equal(await page.isVisible('#cnModBox'), false, 'ohne Teilbeleger keine Modul-Tabelle');
  assert.equal(await page.isDisabled('#cnStart'), false);
  await page.check('#cnPartial');
  assert.equal(await page.locator('#modEd .mod-r').count(), 17);
  assert.equal(await page.isDisabled('#cnStart'), true, 'der Zeitraum ergibt sich aus den Modulen');
  const setMod = async (no, a, b) => { const r = page.locator('#modEd .mod-r[data-no="' + no + '"]'); await r.locator('input[data-f="start"]').fill(a); await r.locator('input[data-f="start"]').dispatchEvent('change'); if (b) { await r.locator('input[data-f="end"]').fill(b); await r.locator('input[data-f="end"]').dispatchEvent('change'); } };
  await setMod(1, '2027-01-11', '2027-01-15'); await setMod(2, '2027-01-18', '2027-01-22'); await setMod(3, '2027-02-01');          // eintägig: das Ende folgt dem Beginn
  assert.equal(await page.inputValue('#modEd .mod-r[data-no="3"] input[data-f="end"]'), '2027-02-01');
  // mit Teilbelegern muss jedes Modul einen Zeitraum haben – oder N/A sein
  await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => /M4: Beginn und Ende eintragen/.test(await toastText()), 'unvollständige Module werden abgelehnt');
  assert.equal(await page.isVisible('#cnTitle'), true, 'der Dialog bleibt offen');
  for (let no = 4; no <= 17; no++) await page.check('#modEd .mod-r[data-no="' + no + '"] input[type=checkbox]');
  assert.match(await page.locator('#modSum').innerText(), /3 Module mit Zeitraum .*14 N\/A$/);
  assert.equal(await page.isDisabled('#modEd .mod-r[data-no="9"] input[data-f="start"]'), true);
  await page.click('#modal [data-act="m:ok"]'); await page.waitForSelector('#crsDetail #crsMods');
  assert.equal(await page.locator('#crsDetail .mchip').count(), 17);
  assert.equal(await page.locator('#crsDetail .mchip.na').count(), 14);
  assert.equal(await page.locator('.crs-time .cbar.seg').count(), 3, 'ein Abschnitt je Modul in der Zeitleiste');
  assert.equal(await page.inputValue('#crsDetail input[data-f="start"]'), '2027-01-11');
  assert.equal(await page.inputValue('#crsDetail input[data-f="end"]'), '2027-02-01');
  assert.equal(await page.isDisabled('#crsDetail input[data-f="end"]'), true);
  // zwei Teilnehmer; der erste wird Teilbeleger und belegt nur M2
  await page.click('#crsDetail [data-act="crs-join"] >> nth=0');
  await waitFor(async () => (await page.locator('#crsDetail [data-act="crs-member-mods"]').count()) === 1, 'erster Teilnehmer');
  await page.click('#crsDetail [data-act="crs-join"] >> nth=0');
  await waitFor(async () => (await page.locator('#crsDetail [data-act="crs-member-mods"]').count()) === 2, 'zweiter Teilnehmer');
  await page.click('#crsDetail [data-act="crs-member-mods"] >> nth=0'); await page.waitForSelector('#mmList');
  assert.equal(await page.locator('#mmList input:not(:disabled)').count(), 3);
  assert.equal(await page.locator('#mmList input:disabled').count(), 14);
  await page.click('#modal [data-act="m:none"]'); await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => /Mindestens ein Modul wählen/.test(await toastText()), 'ohne Modul kein Teilbeleger');
  await page.check('#mmList input[value="2"]'); await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => /Teilbeleger: M2/.test(await page.locator('#crsDetail').innerText()), 'Teilbeleger im Lehrgang');
  assert.match(await page.locator('#crsDetail').innerText(), /alle Module/);
  // Projektdatei: Module am Lehrgang, benötigte Module an der Person, Termine genau an den Modultagen
  const file = path.join(TMP, 'Module.m1cockpit');
  await nextSave(file); await menu('act', 'save-project-as');
  await waitFor(() => fs.existsSync(file), 'Projektdatei mit Modulen');
  const prj = JSON.parse(fs.readFileSync(file, 'utf8')), st = prj.years[prj.active], c = st.courses.find(x => x.type === 'Basic Knowledge');
  assert.deepEqual([c.start, c.end, c.modules.length], ['2027-01-11', '2027-02-01', 17]);
  assert.deepEqual(c.modules.filter(m => !m.na), [{ no: 1, start: '2027-01-11', end: '2027-01-15' }, { no: 2, start: '2027-01-18', end: '2027-01-22' }, { no: 3, start: '2027-02-01', end: '2027-02-01' }]);
  const evs = st.events.filter(e => e.courseId === c.id), part = st.people.find(p => Array.isArray(p.modules));
  assert.equal(evs.length, 2);
  assert.ok(part && part.modules.includes(2) && !part.modules.includes(1) && !part.modules.includes(3), 'die Person braucht M2, nicht M1 und M3');
  assert.deepEqual(evs.find(e => e.pk === part.pk).dates, ['2027-01-18', '2027-01-19', '2027-01-20', '2027-01-21', '2027-01-22']);
  assert.equal(evs.find(e => e.pk !== part.pk).dates.length, 11);
  // Jahresplan: der Balken zerfällt in die Module – drei beim Vollbeleger, eines beim Teilbeleger
  await menu('go', 'year'); await page.waitForSelector('.g-row');
  await waitFor(async () => (await page.locator('#gantt .bar.md').count()) === 4, 'Modulabschnitte im Jahresplan');
  assert.equal(await page.locator('#gantt .bar.md[aria-label^="Basic Knowledge M2"]').count(), 2);
  assert.equal(await page.locator('#gantt .bar.md[aria-label^="Basic Knowledge M1"]').count(), 1);
  // Seitenleiste der Person: benötigte Module ansehen und ändern – der Jahresplan folgt sofort
  await page.evaluate(() => { const row = [...document.querySelectorAll('#gantt .g-row')].find(r => r.querySelectorAll('.bar.md').length === 1); row.querySelector('.g-lab').click(); });
  await page.waitForSelector('#pMods');
  assert.match(await page.locator('#pMods').innerText(), /M2[\s\S]*Teilbeleger/);
  await page.click('#pMods [data-act="person-modules"]'); await page.waitForSelector('#pmList');
  assert.equal(await page.locator('#pmList input').count(), 17);
  assert.equal(await page.isChecked('#pmList input[value="1"]'), false);
  assert.equal(await page.isChecked('#pmList input[value="2"]'), true);
  await page.click('#modal [data-act="m:all"]'); await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => /braucht alle Module/.test(await toastText()), 'Person braucht wieder alle Module');
  await waitFor(async () => (await page.locator('#gantt .bar.md').count()) === 6, 'beide belegen jetzt drei Module');
  await page.click('[data-act="drawer-close"]');
  // ohne Teilbeleger: die Module entfallen, alle belegen wieder den ganzen Zeitraum
  await menu('go', 'courses'); await page.waitForSelector('#crsDetail #crsMods');
  await page.click('#crsDetail [data-chg="crs-partial"]'); await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => (await page.locator('#crsDetail .mchip').count()) === 0, 'Module verworfen');
  assert.equal(await page.isDisabled('#crsDetail input[data-f="end"]'), false);
  assert.equal(await page.locator('.crs-time .cbar.seg').count(), 0);
  await page.click('#crsDetail [data-act="crs-delete"]'); await page.click('#modal [data-act="m:ok"]');
});

test('Lehrgänge: Module über die Lehrgangsliste einspielen und ausgeben; beste Zeiträume mit Modulplan', async () => {
  await menu('go', 'courses'); await page.waitForSelector('[data-act="crs-import"]');
  const before = await page.locator('.crs-time .cbar.seg').count();
  // Liste mit Modulen: eine Zeile je Modul, N/A als Beginn; ein Teilnehmer nur mit M2
  const snap = async name => { const f = path.join(TMP, name); await nextSave(f); await menu('act', 'save-project-as'); await waitFor(() => fs.existsSync(f), name); const prj = JSON.parse(fs.readFileSync(f, 'utf8')); return prj.years[prj.active]; };
  const st0 = await snap('Vor-Modulliste.m1cockpit'), who = st0.people.filter(p => p.cluster === '1' && !p.locked).slice(0, 2).map(p => p.pk);
  assert.equal(who.length, 2);
  const csv = path.join(TMP, 'Lehrgangsliste.csv');
  fs.writeFileSync(csv, '\uFEFFLehrgang;Art;Zielmuster;Beginn;Ende;Plätze;Personalnummer;Modul\r\n'
    + 'BK Liste;Basic Knowledge;;08.03.2027;12.03.2027;10;;M1\r\n'
    + 'BK Liste;Basic Knowledge;;15.03.2027;17.03.2027;;;M2\r\n'
    + 'BK Liste;Basic Knowledge;;N/A;;;;M3\r\n'
    + 'BK Liste;Basic Knowledge;;;;;' + who[0] + ';\r\n'
    + 'BK Liste;Basic Knowledge;;;;;' + who[1] + ';M2\r\n');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="crs-import"]')]);
  await chooser.setFiles(csv);
  await page.waitForSelector('#modal [data-act="m:ok"]');
  const preview = await page.locator('#modal').innerText();
  assert.match(preview, /Prüfung bestanden/);
  assert.match(preview, /Lehrgänge mit Modulen\s*1/);
  assert.match(preview, /M4–M17 stehen nicht in der Liste/);
  assert.match(preview, /M1–M2[\s\S]*1 Teilbeleger/);
  await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => (await page.locator('.crs-time .cbar.seg').count()) === before + 2, 'zwei Modulabschnitte in der Zeitleiste');
  const st1 = await snap('Nach-Modulliste.m1cockpit'), c = st1.courses.find(x => x.title === 'BK Liste');
  assert.deepEqual([c.start, c.end, c.seats, c.modules.length], ['2027-03-08', '2027-03-17', 10, 17]);
  assert.deepEqual(c.modules.filter(m => !m.na), [{ no: 1, start: '2027-03-08', end: '2027-03-12' }, { no: 2, start: '2027-03-15', end: '2027-03-17' }]);
  const dates = p => st1.events.find(e => e.courseId === c.id && e.pk === p).dates;
  assert.equal(dates(who[0]).length, 8);
  assert.deepEqual(dates(who[1]), ['2027-03-15', '2027-03-16', '2027-03-17']);
  // Ausgabe: je Modul eine Zeile, beim Teilbeleger die Module – und die Liste lässt sich wieder einspielen
  const out = path.join(TMP, 'Lehrgaenge-aus.csv');
  await nextSave(out); await page.click('[data-act="crs-export"]');
  await waitFor(() => fs.existsSync(out), 'ausgegebene Lehrgangsliste');
  const lines = fs.readFileSync(out, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.startsWith('BK Liste;'));
  assert.equal(lines.filter(l => l.split(';')[6] === '' && /^M\d+$/.test(l.split(';')[7])).length, 17, 'eine Zeile je Modul');
  assert.equal(lines.filter(l => l.split(';')[3] === 'N/A').length, 15);
  assert.equal(lines.find(l => l.split(';')[6] === who[1]).split(';')[7], 'M2');
  const [again] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="crs-import"]')]);
  await again.setFiles(out);
  await page.waitForSelector('#modal [data-act="m:ok"]');
  assert.match(await page.locator('#modal').innerText(), /Prüfung bestanden/);
  await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => /vorhandene aktualisiert/.test(await toastText()), 'erneutes Einspielen aktualisiert');
  const st2 = await snap('Nach-Wiedereinspielen.m1cockpit');
  assert.equal(st2.courses.filter(x => x.title === 'BK Liste').length, 1, 'nichts verdoppelt');
  assert.equal(st2.events.filter(e => e.courseId === c.id).length, 2);

  // Beste Zeiträume mit Modulplan: M1 drei Tage, M2 zwei Tage – der Vorschlag wird ein Lehrgang mit Modulen
  await page.click('.dm:has-text("Basic Knowledge") [data-act="crs-propose"]'); await page.waitForSelector('#modal #cpLen');
  assert.equal(await page.isVisible('#cpModBox'), false);
  await page.check('#cpPartial');
  assert.equal(await page.locator('#cpDays input').count(), 17);
  assert.equal(await page.isDisabled('#cpLen'), true);
  await page.click('#modal #cpGo');
  await waitFor(async () => /mindestens ein Modul eine Dauer/.test(await toastText()), 'ohne Dauer kein Modulplan');
  await page.fill('#cpDays input[data-no="1"]', '3'); await page.locator('#cpDays input[data-no="1"]').dispatchEvent('change');
  await page.fill('#cpDays input[data-no="2"]', '2'); await page.locator('#cpDays input[data-no="2"]').dispatchEvent('change');
  assert.equal(await page.inputValue('#cpLen'), '5');
  assert.match(await page.locator('#cpSum').innerText(), /2 Module \(M1–M2\) · zusammen 5 Lehrgangstage · 15 N\/A/);
  await page.fill('#cpMin', '1'); await page.selectOption('#cpThr', 'min');
  await page.click('#modal #cpGo');
  await page.waitForSelector('#crsProp [data-act="crs-prop-take"]', { timeout: 60000 });
  assert.match(await page.locator('#crsProp').innerText(), /5 Lehrgangstage in 2 Modulen \(M1–M2\)/);
  assert.match(await page.locator('#crsProp tbody tr >> nth=0').innerText(), /M1 [\s\S]*M2 /);
  const segs = await page.locator('.crs-time .cbar.seg').count();
  await page.click('#crsProp [data-act="crs-prop-take"] >> nth=0');
  await waitFor(async () => (await page.locator('.crs-time .cbar.seg').count()) === segs + 2, 'übernommener Vorschlag hat zwei Module');
  await waitFor(async () => (await page.locator('#crsDetail .mchip:not(.na)').count()) === 2, 'Module im geöffneten Lehrgang');
  assert.equal(await page.locator('#crsDetail .mchip.na').count(), 15);
});

test('Dienstplan je Person: große Seitenleiste, Auswahl, Zeitraum, Wochenfolge und Ziehen', async () => {
  await menu('go', 'year'); await page.waitForSelector('.g-row');
  await page.click('.g-row >> nth=0 >> .g-lab'); await page.waitForSelector('#pcal');
  const width = () => page.evaluate(() => Math.round(document.querySelector('#drawer').getBoundingClientRect().width));
  // Buchstaben der Tage ab einem Tagesindex (0 = 1. Januar): F, S, N oder · für frei
  const letters = (from, n) => page.evaluate(([a, c]) => Array.from({ length: c }, (_, i) => (document.querySelector('#pcal i[data-d="' + (a + i) + '"] b') || {}).textContent || '·').join(''), [from, n]);
  const narrow = await width();
  assert.equal(await page.locator('#rosTools').count(), 0, 'Werkzeuge erscheinen erst beim Bearbeiten');
  await page.click('[data-act="ros-edit"]'); await page.waitForSelector('#rosTools');
  assert.ok(await width() > narrow + 150, 'Bearbeiten zeigt die Seitenleiste groß');
  // leeren: ohne Eintrag ist jeder Tag frei
  await page.click('[data-act="ros-clear"]'); await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => (await letters(3, 7)) === '·······', 'geleerter Dienstplan');
  assert.match(await page.textContent('#drawer'), /Tage ohne Eintrag gelten als frei/);
  // Zeitraum füllen: Früh, Mo–Fr, ganzes Jahr (04.–10.01.2027 = Montag bis Sonntag)
  await page.click('[data-act="ros-fill"]');
  await waitFor(async () => (await letters(3, 7)) === 'FFFFF··', 'Frühdienst Montag bis Freitag');
  assert.match(await toastText(), /261 Tage als M1 · Früh eingetragen/);
  // Wochenfolge Früh → Spät → Nacht ab 01.03.2027 (ein Montag)
  await page.fill('#rosTools input[data-f="start"]', '2027-03-01'); await page.selectOption('#rosSeq2', 'Nacht');
  await page.click('[data-act="ros-week"]');
  await waitFor(async () => (await letters(59, 21)) === 'FFFFF··SSSSS··NNNNN··', 'Wochenfolge');
  // Dienst per Auswahl wählen, dann von einem Tag zum anderen ziehen – auch über die Monatsgrenze (31.05. bis 04.06.)
  await page.selectOption('#rosShift', 'Frei');
  await page.evaluate(() => document.querySelector('#pcal i[data-d="154"]').scrollIntoView({ block: 'center' }));      // beide Zeilen ins Bild, auch auf kleinen Bildschirmen
  const a = await page.locator('#pcal i[data-d="150"]').boundingBox(), b = await page.locator('#pcal i[data-d="154"]').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await page.mouse.up();
  await waitFor(async () => (await letters(150, 5)) === '·····', 'überstrichener Zeitraum ist frei');
  // ein einzelner Klick trägt genau diesen Tag ein
  await page.selectOption('#rosShift', 'Nacht'); await page.selectOption('#rosArea', 'M2');
  await page.evaluate(() => document.querySelector('#rosTools').scrollIntoView({ block: 'start' }));
  await page.evaluate(() => document.querySelector('#pcal i[data-d="152"]').scrollIntoView({ block: 'center' }));
  await page.click('#pcal i[data-d="152"]');
  await waitFor(async () => (await letters(150, 5)) === '··N··', 'einzelner Tag');
  assert.match(await toastText(), /1 Tag als M2 · Nacht eingetragen/);
  // auf andere Personen übertragen und mit Rückgängig zurück
  await page.click('[data-act="ros-copy-to"]'); await page.waitForSelector('input[name=rosTo]');
  await page.check('input[name=rosTo][value="all"]'); await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => /auf 140 Personen übertragen/.test(await toastText()), 'Übertragen');
  await menu('act', 'undo');
  await waitFor(async () => /rückgängig/.test(await toastText()), 'Rückgängig');
  // Größe umschalten, Bearbeiten beenden
  await page.click('[data-act="drawer-size"]'); assert.equal(await width(), narrow);
  await page.click('[data-act="drawer-size"]'); assert.ok(await width() > narrow + 150);
  await page.click('[data-act="ros-edit"]');
  assert.equal(await page.locator('#rosTools').count(), 0);
  await page.click('[data-act="drawer-close"]');
});

test('Schichtplan: Excel des Auswertungssystems einspielen, Symbole zuordnen und im Dienstplan sehen', async () => {
  // Tabelle im Aufbau des Auswertungssystems: Tage „01⏎Fr“ in Zeile 1, Beschriftung in Zeile 2, Monat und Jahr im Filtertext.
  // Drei erfundene Personen, die es im Projekt nicht gibt, und eine vorhandene.
  const Core = await import('../src/core/index.js');
  const cal = Core.makeCalendar(2027), WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const day = ['DayDateRowWidth', '', '', '', ''], label = ['Team', 'Nachname', 'Vorname', 'U-Nummer', 'MF'];
  for (let d = 0; d < 31; d++) { day.push(String(cal.dom[d]).padStart(2, '0') + '\r\n' + WD[cal.dow[d]]); label.push('Erstes Datum: ShiftShort_Masking'); }
  const who = [['L/TM-M 12 MUC - CAB', 'Adler', 'Anna', '700101A', 'CAB'], ['L/TM-M 12 MUC - CAB', 'Bach', 'Ben', '700102B', 'CAB'], ['L/TM-M 12 MUC - IFE', 'Christ', 'Clara', '700103C', 'IFE'], ['Übung', 'Person', '001', 'D00001', 'CAB']];
  const cell = (i, d) => cal.dow[d] === 0 || cal.dow[d] === 6 ? '-' : i === 1 && cal.dom[d] >= 11 && cal.dom[d] <= 15 ? 'Up' : i === 2 && cal.dom[d] === 20 ? 'LC*' : i === 2 ? 'S1' : i === 3 ? 'N2' : 'F1';
  const rows = [day, label, ...who.map((p, i) => [...p, ...Array.from({ length: 31 }, (_, d) => cell(i, d))]), [], ['Angewendete Filter: \r\nSlicerCheckMonth ist 1\r\nYear-Default ist 2027\r\nMonat-Default ist Januar']];
  const xlsx = path.join(TMP, 'Schichtplan_M1_Januar_27.xlsx');
  fs.writeFileSync(xlsx, await Core.writeXlsx([{ name: 'Export', rows }]));
  await menu('go', 'roster'); await page.waitForSelector('[data-act="imp-shiftplan"]');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="imp-shiftplan"]')]);
  await chooser.setFiles(xlsx);
  await page.waitForSelector('#modal #spSyms');
  const facts = await page.locator('#modal .cmp').innerText();
  assert.match(facts, /01\.01\.2027 – 31\.01\.2027 · 31 Tage/);
  assert.match(facts, /1 im Projekt gefunden · 3 neu/);
  assert.equal(await page.inputValue('#spMonth'), '1', 'Monat aus dem Filtertext');
  assert.equal(await page.isChecked('#spPeople'), true);
  // Vorschläge nur, wo sich die Bedeutung ablesen lässt; „Up“ und „LC*“ sind offen
  assert.equal(await page.locator('#spSyms tbody tr').count(), 6);
  assert.equal(await page.inputValue('#spSyms select[data-s="F1"]'), 'Früh');
  assert.equal(await page.inputValue('#spSyms select[data-s="N2"]'), 'Nacht');
  assert.equal(await page.inputValue('#spSyms select[data-s="-"]'), 'Frei');
  assert.equal(await page.inputValue('#spSyms select[data-s="Up"]'), '');
  assert.equal(await page.locator('#spSyms tr.rowwarn').count(), 2);
  await page.selectOption('#spSyms select[data-s="Up"]', 'Urlaub');
  assert.equal(await page.locator('#spSyms tr.rowwarn').count(), 1);
  assert.match(await page.locator('#spSum').innerText(), /4 Personen · 78 Diensttage · 40 dienstfreie Tage · 1 Abwesenheiten mit 5 Tagen · 1 Tage mit Symbol ohne Bedeutung/);
  await page.click('#modal [data-act="m:ok"]');
  await page.waitForSelector('.rs-tbl');
  await waitFor(async () => /Schichtplan übernommen: 4 Personen \(3 neu angelegt\)/.test(await toastText()), 'Meldung zur Übernahme');
  // die Ansicht zeigt den Januar mit den Symbolen der Tabelle – in der Farbe ihrer Bedeutung
  assert.equal(await page.locator('.rs-tbl thead th').count(), 32);
  assert.equal(await page.getAttribute('[data-act="ros-month"][data-m="0"]', 'aria-pressed'), 'true');
  await page.fill('#q-roster', 'Bach'); await waitFor(async () => (await page.locator('.rs-tbl tbody tr').count()) === 1, 'Suche im Dienstplan');
  const cells = await page.evaluate(() => [...document.querySelectorAll('.rs-tbl tbody tr td:not(.rs-name)')].map(td => td.textContent + ':' + td.className.split(' ')[0]));
  assert.equal(cells.length, 31);
  assert.deepEqual(cells.slice(3, 10), ['F1:k-f', 'F1:k-f', 'F1:k-f', 'F1:k-f', 'F1:k-f', '-:k-free', '-:k-free']);          // Mo 04.01. – So 10.01.
  assert.deepEqual(cells.slice(10, 15), ['Up:k-away', 'Up:k-away', 'Up:k-away', 'Up:k-away', 'Up:k-away']);
  await page.fill('#q-roster', 'Christ'); await waitFor(async () => (await page.locator('.rs-tbl tbody tr').count()) === 1 && /Christ/.test(await page.locator('.rs-tbl tbody').innerText()), 'andere Person');
  assert.equal(await page.locator('.rs-tbl td.k-open').count(), 1, 'Symbol ohne Bedeutung fällt auf');
  assert.equal((await page.locator('.rs-tbl td.k-open').innerText()).trim(), 'LC*');
  assert.match(await page.locator('#rsLegend').innerText(), /1 Symbol hat noch keine Bedeutung/);
  // Bedeutung nachträglich festlegen: gilt sofort
  await page.click('#rsLegend [data-act="sym-map"]'); await page.waitForSelector('#smSyms');
  await page.selectOption('#smSyms select[data-s="LC*"]', 'Sonstiges');
  await page.click('#modal [data-act="m:ok"]');
  await waitFor(async () => /Bedeutung gespeichert/.test(await toastText()), 'Bedeutung gespeichert');
  await waitFor(async () => (await page.locator('.rs-tbl td.k-open').count()) === 0, 'kein offenes Symbol mehr');
  // im Personenkalender stehen dieselben Symbole
  await page.click('.rs-tbl tbody .rs-name button'); await page.waitForSelector('#pcal');
  await waitFor(async () => (await page.locator('#pcal b.sy').count()) === 31, 'Symbole im Personenkalender');
  assert.equal(await page.locator('#pcal b.sy:text-is("LC*")').count(), 1);
  await page.click('[data-act="drawer-close"]'); await page.fill('#q-roster', '');
  // Projektdatei: Personen, Dienstplan, Abwesenheiten, Symbole und die gemerkte Zuordnung
  const file = path.join(TMP, 'Schichtplan.m1cockpit');
  await nextSave(file); await menu('act', 'save-project-as');
  await waitFor(() => fs.existsSync(file), 'Projektdatei mit Schichtplan');
  const prj = JSON.parse(fs.readFileSync(file, 'utf8')), st = prj.years[prj.active], anna = st.people.find(p => p.pk === '700101A');
  assert.deepEqual([anna.name, anna.org, anna.rights, anna.cluster], ['Adler, Anna', 'L/TM-M 12 MUC - CAB', 'CAB', 'offen']);
  assert.deepEqual(st.settings.symbols, { '-': 'Frei', F1: 'Früh', S1: 'Spät', N2: 'Nacht', Up: 'Urlaub', 'LC*': 'Sonstiges' });
  assert.deepEqual([...st.symbols.list].sort(), ['-', 'F1', 'LC*', 'N2', 'S1', 'Up']);
  assert.deepEqual(Object.keys(st.symbols.days).sort(), ['700101A', '700102B', '700103C', 'D00001']);
  assert.deepEqual(st.absences.filter(x => ['700102B', '700103C'].includes(x.pk)), [{ pk: '700102B', type: 'Urlaub', start: '2027-01-11', end: '2027-01-15' }, { pk: '700103C', type: 'Sonstiges', start: '2027-01-20', end: '2027-01-20' }]);
  const back = Core.sanitize(st).state, days = Core.symbolsOf(back, '700103C', cal.n);
  assert.deepEqual(days.slice(17, 24), ['S1', 'S1', 'LC*', 'S1', 'S1', '-', '-']);
  assert.ok(st.realImports.some(r => r.kind === 'roster' && r.file === 'Schichtplan_M1_Januar_27.xlsx'));
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
  await shutdown();
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

test('Fehleraufzeichnung: Programmfehler landen ohne Projektdaten im Protokoll', async () => {
  if (!app) await launch();
  const log = path.join(USER_DATA, 'Fehlerprotokoll.txt');
  fs.rmSync(log, { force: true });
  // ein Programmfehler in einer Ereignisbehandlung – so, wie er in der Oberfläche tatsächlich aufträte
  await page.evaluate(() => { document.body.addEventListener('m1-testfehler', () => { null.fehlt; }, { once: true }); document.body.dispatchEvent(new Event('m1-testfehler')); });
  await waitFor(() => fs.existsSync(log), 'Eintrag im Fehlerprotokoll');
  const text = fs.readFileSync(log, 'utf8');
  assert.match(text, /Version \d+\.\d+\.\d+ {2}Oberfläche: Programmfehler: TypeError/);
  assert.doesNotMatch(text, /Person \d{3}/, 'keine Namen im Protokoll');
  // der ausgelöste Fehler ist erwartet – erst verwerfen, wenn er auch hier angekommen ist
  await waitFor(() => errors.some(e => /fehlt/.test(e)), 'Fehlermeldung der Oberfläche');
  errors.length = 0;
});

test('Aktualisierung: neue Version wird gefunden und gemeldet; der Kanal erreicht nur sein Ziel', async t => {
  const state = () => page.evaluate(() => window.m1desktop.update.state());
  // der Kanal der Aktualisierung weist jede fremde Adresse ab
  const foreign = () => app.evaluate(({ session, net }) => new Promise(resolve => {
    const req = net.request({ url: 'https://example.com/', session: session.fromPartition('electron-updater') });
    req.on('response', () => resolve('offen')); req.on('error', e => resolve('blockiert ' + e.message)); req.end();
  }));
  if (PACKAGED) {
    // fertiges Programm: die Aktualisierung ist eingebaut und fragt die Veröffentlichungen des Projekts
    assert.equal((await state()).mode, 'install', 'das gepackte Programm kann sich selbst aktualisieren');
    // die Suche läuft gegen die echten Veröffentlichungen: sie muss sie erreichen und zu einem Ergebnis kommen
    let st = null;
    for (let i = 0; i < 3 && (!st || st.phase === 'error'); i++) { if (st) await new Promise(r => setTimeout(r, 4000)); st = await page.evaluate(() => window.m1desktop.update.check()); }
    t.diagnostic('Suche in den Veröffentlichungen: ' + st.phase + (st.version ? ' ' + st.version : '') + (st.error ? ' – ' + st.error : ''));
    assert.ok(['current', 'available'].includes(st.phase), 'Suche endet mit einem Ergebnis, nicht mit: ' + st.phase + ' ' + st.error);
    assert.match(await foreign(), /^blockiert/);
    return;
  }
  // Quellstand: ein lokaler Server bietet eine höhere Version an
  const yml = ['version: 99.0.0', 'files:', '  - url: M1-Qualifikationscockpit-99.0.0-Setup.exe', '    sha512: ' + 'A'.repeat(86) + '==', '    size: 1000',
    'path: M1-Qualifikationscockpit-99.0.0-Setup.exe', 'sha512: ' + 'A'.repeat(86) + '==', "releaseDate: '2026-11-26T10:00:00.000Z'", ''].join('\n');
  const hits = [];
  const server = http.createServer((req, res) => { hits.push(req.url); if (/latest[\w-]*\.yml/.test(req.url)) { res.writeHead(200, { 'content-type': 'text/yaml' }); res.end(yml); } else { res.writeHead(404); res.end(); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    await shutdown();
    await launch([], { M1_UPDATE_URL: 'http://127.0.0.1:' + server.address().port + '/' });
    errors.length = 0;
    assert.equal((await state()).mode, 'notify');
    await menu('act', 'update-check');
    await waitFor(async () => /Version 99\.0\.0 ist verfügbar/.test(await toastText()), 'Meldung der neuen Version');
    assert.ok(hits.some(u => /latest[\w-]*\.yml/.test(u)), 'Versionsangabe wurde abgerufen');
    await menu('go', 'data');
    assert.match(await page.textContent('#updCard'), /Version 99\.0\.0 ist verfügbar/);
    assert.match(await page.textContent('#updCard'), /Installierte Version \d+\.\d+\.\d+/);
    assert.match(await foreign(), /^blockiert/);
    // abschalten bleibt gespeichert
    await page.uncheck('#updCard [data-chg="updates"]');
    await waitFor(() => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'einstellungen.json'), 'utf8')).updates === false, 'Einstellung gespeichert');
    assert.equal((await state()).enabled, false);
    await page.check('#updCard [data-chg="updates"]');
    assert.deepEqual(errors, []);
  } finally { server.close(); }
});

test('Übungsmodus ausschalten leert das Programm – auch nach einem Neustart', async () => {
  const settings = () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'einstellungen.json'), 'utf8'));
  const people = () => page.locator('#rail [data-id="people"] .cnt').innerText();
  if (!app) await launch();
  // Weiter oben wurde ein eigenes Projekt geöffnet – das beendet den Übungsmodus von selbst
  assert.equal(settings().practice, false, 'das Öffnen eines eigenen Projekts beendet den Übungsmodus');
  assert.equal(await people(), '0', 'der Neustart danach war leer');
  await menu('act', 'practice-toggle');
  await waitFor(async () => (await people()) === '141', 'simulierte Daten');
  await waitFor(() => settings().practice === true, 'Schalter gespeichert');
  await menu('act', 'practice-toggle');
  await waitFor(async () => (await people()) === '0', 'leeres Programm');
  await waitFor(() => settings().practice === false, 'Schalter gespeichert');
  assert.equal(await page.textContent('#main h1'), 'Übersicht');
  await shutdown();
  await launch();
  assert.equal(await page.textContent('#main h1'), 'Übersicht');
  assert.equal(await people(), '0');
  assert.match(await page.textContent('#top'), /Leeres Projekt/);
  assert.deepEqual(errors, []);
});
