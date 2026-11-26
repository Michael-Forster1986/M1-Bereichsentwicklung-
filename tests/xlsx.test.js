// Excel-Ausgabe: gültiges ZIP/XLSX, richtige Zelltypen, Schutz der Personendaten im Modus „Namen verbergen“.
import { describe, it, expect, beforeAll } from 'vitest';
import zlib from 'node:zlib';
import * as Core from '../src/core/index.js';

/** Liest ein ZIP-Archiv (wie es writeXlsx erzeugt) und prüft dabei die Prüfsummen. */
function unzip(bytes) {
  const b = Buffer.from(bytes), end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), files = {};
  let pos = b.readUInt32LE(end + 16);
  for (let i = 0, n = b.readUInt16LE(end + 10); i < n; i++) {
    expect(b.readUInt32LE(pos)).toBe(0x02014b50);
    const method = b.readUInt16LE(pos + 10), crc = b.readUInt32LE(pos + 16), size = b.readUInt32LE(pos + 20), rawSize = b.readUInt32LE(pos + 24), nl = b.readUInt16LE(pos + 28), off = b.readUInt32LE(pos + 42);
    const name = b.subarray(pos + 46, pos + 46 + nl).toString('utf8');
    expect(b.readUInt32LE(off)).toBe(0x04034b50);
    const start = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28), body = b.subarray(start, start + size);
    const data = method === 8 ? zlib.inflateRawSync(body) : body;
    expect(data.length, name).toBe(rawSize);
    expect(zlib.crc32(data) >>> 0, name).toBe(crc);
    files[name] = data.toString('utf8');
    pos += 46 + nl + b.readUInt16LE(pos + 30) + b.readUInt16LE(pos + 32);
  }
  return files;
}
const strings = files => [...files['xl/sharedStrings.xml'].matchAll(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g)].map(m => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
/** Zellen eines Blatts als { A1: Wert } – Texte aufgelöst, Zahlen als Zahl. */
function cells(files, n) {
  const sst = strings(files), out = {};
  for (const m of files['xl/worksheets/sheet' + n + '.xml'].matchAll(/<c r="([A-Z]+\d+)" s="(\d+)"(?: t="(\w+)")?>(?:<v>([^<]*)<\/v>)?<\/c>/g)) out[m[1]] = m[3] === 's' ? sst[+m[4]] : Number(m[4]);
  return out;
}

describe('writeXlsx', () => {
  it('rechnet Datumsangaben in Excel-Seriennummern um', () => {
    expect(Core.excelDate('1900-03-01')).toBe(61);
    expect(Core.excelDate('2027-01-01')).toBe(46388);
    expect(Core.excelDate('2028-02-29')).toBe(46812);
  });
  it('bereinigt Blattnamen und hält sie eindeutig', () => {
    expect(Core.sheetNames(['Termine', 'Termine', 'a/b:c*d?e[f]', '', 'x'.repeat(40)])).toEqual(['Termine', 'Termine (2)', 'a b c d e f', 'Blatt 4', 'x'.repeat(31)]);
  });
  it('schreibt ein gültiges Archiv mit allen Pflichtteilen', async () => {
    const files = unzip(await Core.writeXlsx([{ name: 'Eins', columns: [{ header: 'A' }], rows: [['x']] }, { name: 'Zwei', rows: [[1, 2]] }], { title: 'T & <T>' }));
    for (const f of ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'])
      expect(Object.keys(files), f).toContain(f);
    expect(files['xl/workbook.xml']).toContain('<sheet name="Eins" sheetId="1" r:id="rId1"/><sheet name="Zwei" sheetId="2" r:id="rId2"/>');
    expect(files['docProps/core.xml']).toContain('<dc:title>T &amp; &lt;T&gt;</dc:title>');
    expect(files['xl/worksheets/sheet1.xml']).toContain('<pane ySplit="1" topLeftCell="A2"');
    expect(files['xl/worksheets/sheet2.xml']).not.toContain('<pane');
    for (const xml of Object.values(files)) expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
  });
  it('speichert Texte immer als Text, Zahlen als Zahl und Datumsangaben als Datum', async () => {
    const bytes = await Core.writeXlsx([{ name: 'T', columns: [{ header: 'Text' }, { header: 'Zahl', type: 'dec' }, { header: 'Datum', type: 'date' }, { header: 'Nr', type: 'text' }],
      rows: [['=SUMME(A1:A9)', 1.5, '2027-01-01', '00123'], ['<b>&"fett"</b>', 0, 'kein Datum', 7], [' führend', null, '', true], ['+49 89 \u0001', { v: 3, fill: 'crit' }, null, null]] }]);
    const files = unzip(bytes), c = cells(files, 1), xml = files['xl/worksheets/sheet1.xml'];
    expect(c.A2).toBe('=SUMME(A1:A9)');                                   // keine Formel: kein <f>-Element, Typ Text
    expect(xml).not.toContain('<f>');
    expect(c.B2).toBe(1.5); expect(c.C2).toBe(46388); expect(c.D2).toBe('00123');
    expect(c.A3).toBe('<b>&"fett"</b>'); expect(c.B3).toBe(0); expect(c.C3).toBe('kein Datum'); expect(c.D3).toBe('7');
    expect(c.A4).toBe(' führend'); expect(c.D4).toBe('ja');
    expect(c.A5).toBe('+49 89 ');                                         // Steuerzeichen entfernt
    expect(files['xl/sharedStrings.xml']).toContain('<t xml:space="preserve"> führend</t>');
    const styleOf = ref => +xml.match(new RegExp('<c r="' + ref + '" s="(\\d+)"'))[1], xfs = [...files['xl/styles.xml'].match(/<cellXfs[\s\S]*<\/cellXfs>/)[0].matchAll(/<xf [^>]*>/g)].map(m => m[0]);
    expect(xfs[styleOf('C2')]).toContain('numFmtId="14"');
    expect(xfs[styleOf('B2')]).toContain('numFmtId="164"');
    expect(xfs[styleOf('A1')]).toContain('fontId="2"');                   // Kopfzeile fett, weiß auf Blau
    expect(xfs[styleOf('B5')]).toMatch(/fillId="3"/);
  });
});

describe('buildWorkbook', () => {
  let st, wb;
  beforeAll(() => { st = Core.demoState({ year: 2027, count: 30, seed: 11 }); wb = Core.buildWorkbook(st, { today: '2027-02-01' }); });
  const sheet = (w, name) => w.sheets.find(s => s.name === name);

  it('liefert die Blätter in fester Reihenfolge; Jahresvergleich nur bei mehreren Jahren', () => {
    expect(wb.sheets.map(s => s.name)).toEqual(['Übersicht', 'Cluster', 'Monatswerte', 'Personen', 'Termine', 'Planungsergebnis', 'Konflikte', 'Tageskapazität', 'Abwesenheiten']);
    const two = Core.buildWorkbook(st, { years: [st, Core.demoState({ year: 2028, count: 20, seed: 3 })] });
    expect(two.sheets.map(s => s.name)).toContain('Jahresvergleich');
    expect(sheet(two, 'Jahresvergleich').rows.map(r => r[0])).toEqual([2027, 2028]);
  });
  it('gibt jede Person, jeden Termin und jede Abwesenheit genau einmal aus', () => {
    expect(sheet(wb, 'Personen').rows).toHaveLength(st.people.length);
    expect(sheet(wb, 'Termine').rows).toHaveLength(st.events.length);
    expect(sheet(wb, 'Abwesenheiten').rows).toHaveLength(st.absences.length);
    expect(sheet(wb, 'Planungsergebnis').rows).toHaveLength(st.report.length);
    for (const s of wb.sheets) for (const r of s.rows) if (s.columns) expect(r.length, s.name).toBeLessThanOrEqual(s.columns.length);
  });
  it('stimmt mit den Kennzahlen der Auswertung überein', () => {
    const ix = Core.buildIndex(st), sum = Core.summarize(st, ix), months = sheet(wb, 'Monatswerte').rows;
    expect(months.reduce((s, r) => s + r[2], 0)).toBe(sum.trainingDays);
    expect(months.reduce((s, r) => s + r[9], 0)).toBe(sum.absentDays);
    expect(months.reduce((s, r) => s + r[7].v, 0)).toBe(sum.underMin);
    expect(months.reduce((s, r) => s + r[8].v, 0)).toBe(sum.underZero);
    expect(sheet(wb, 'Cluster').rows.reduce((s, r) => s + r[2], 0)).toBe(st.people.length);
    expect(sheet(wb, 'Tageskapazität').rows.filter(r => r[9] !== '')).toHaveLength(sum.knownDays);
  });
  it('enthält im Modus „Namen verbergen“ weder Namen noch Personalnummern', async () => {
    const real = Core.clone(st); real.meta.dataClass = 'real';
    real.people.forEach((p, i) => { p.name = 'Nachname' + i + ', Vorname'; p.org = 'Geheime Abteilung'; });
    const hidden = Core.buildWorkbook(real, { privacy: true }), files = unzip(await Core.writeXlsx(hidden.sheets)), all = Object.values(files).join('\n');
    expect(all).not.toMatch(/Nachname\d/);
    expect(all).not.toContain('Geheime Abteilung');
    for (const p of real.people) expect(all.includes('>' + p.pk + '<'), p.pk).toBe(false);
    expect(all).toContain('P-001');
    expect(hidden.sheets[0].footer).toContain('pseudonymisiert');
    expect(Core.buildWorkbook(real).sheets[0].footer).toContain('VERTRAULICH');
  });
});
