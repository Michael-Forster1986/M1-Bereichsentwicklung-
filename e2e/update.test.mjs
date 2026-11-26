// Prüft die automatische Aktualisierung von Ende zu Ende am installierten Windows-Programm:
// Eine ältere Version findet die veröffentlichte, lädt sie, installiert sie beim Beenden und läuft danach in der neuen.
// Aufruf (nach der Installation einer älteren Version): M1_INSTALLED=<Pfad zur installierten .exe> node --test e2e/update.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright-core';

const EXE = process.env.M1_INSTALLED || '';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'm1-update-'));
const env = { ...process.env }; delete env.M1_UPDATE_DRY; delete env.M1_UPDATE_URL;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ps = cmd => execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8' }).trim();
const fileVersion = () => ps("(Get-Item -LiteralPath '" + EXE.replace(/'/g, "''") + "').VersionInfo.ProductVersion");
// das geladene Installationsprogramm heißt M1-Qualifikationscockpit-<Version>-Setup.exe (das Programm selbst: „M1 Qualifikationscockpit“)
const installerRunning = () => ps("@(Get-Process | Where-Object { $_.ProcessName -like 'M1-Qualifikationscockpit*' }).Count") !== '0';
async function start() {
  const app = await _electron.launch({ executablePath: EXE, args: ['--user-data-dir=' + path.join(TMP, 'profil')], env });
  const page = await app.firstWindow();
  await page.waitForSelector('#main h1');
  return { app, page };
}
/** Schließt das Fenster wie ein Mensch und wartet auf das Ende des Programms – nur so läuft die Installation beim Beenden an. */
async function quit(app) {
  const closed = app.waitForEvent('close', { timeout: 60_000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
}

test('installiertes Programm aktualisiert sich aus den veröffentlichten Versionen', { skip: !EXE && 'M1_INSTALLED nicht gesetzt', timeout: 20 * 60_000 }, async t => {
  const first = await start();
  const state = () => first.page.evaluate(() => window.m1desktop.update.state());
  const before = await first.page.evaluate(() => window.m1desktop.info.version);
  t.diagnostic('installiert: Version ' + before + ' (Datei: ' + fileVersion() + ')');
  assert.equal((await state()).mode, 'install', 'das installierte Programm aktualisiert sich selbst');

  // 1) finden und laden
  let st = await first.page.evaluate(() => window.m1desktop.update.check()), last = '', errors = 0;
  for (const t0 = Date.now(); st.phase !== 'ready';) {
    const now = st.phase + (st.phase === 'downloading' ? ' ' + Math.floor(st.percent / 20) * 20 + ' %' : '');
    if (now !== last) { last = now; t.diagnostic('Stand: ' + now + (st.error ? ' – ' + st.error : '')); }
    if (st.phase === 'error') { assert.ok(++errors <= 3, 'Suche oder Laden gescheitert: ' + st.error); await sleep(5000); st = await first.page.evaluate(() => window.m1desktop.update.check()); continue; }
    assert.notEqual(st.phase, 'current', 'eine neuere veröffentlichte Version wird gefunden');
    assert.ok(Date.now() - t0 < 10 * 60_000, 'Laden dauert länger als zehn Minuten');
    await sleep(1500); st = await state();
  }
  const target = st.version;
  t.diagnostic('geladen: Version ' + target);
  assert.notEqual(target, before);
  await first.page.click('#rail [data-id="data"]');
  assert.match(await first.page.textContent('#updCard'), new RegExp('Version ' + target.replace(/\./g, '\\.') + ' ist geladen'));

  // 2) Programm beenden: die Installation läuft im Hintergrund
  await quit(first.app);
  for (const t0 = Date.now(); !fileVersion().startsWith(target) || installerRunning();) {
    assert.ok(Date.now() - t0 < 6 * 60_000, 'nach sechs Minuten ist die neue Version nicht installiert (Datei: ' + fileVersion() + ')');
    await sleep(2000);
  }
  t.diagnostic('installiert nach dem Beenden: Datei ' + fileVersion());

  // 3) erneut starten: läuft in der neuen Version, Einstellungen sind erhalten, nichts weiter zu holen
  const second = await start();
  assert.equal(await second.page.evaluate(() => window.m1desktop.info.version), target);
  const after = await second.page.evaluate(() => window.m1desktop.update.check());
  t.diagnostic('nach der Aktualisierung: ' + after.phase + (after.error ? ' – ' + after.error : ''));
  assert.equal(after.phase, 'current');
  assert.match(await second.page.textContent('#main h1'), /^Übersicht \d{4}$/);
  await quit(second.app);
  fs.rmSync(TMP, { recursive: true, force: true });
});
