import { DAY } from './constants.js';
import { validDate } from './dates.js';

// ---------- XLSX schreiben (ohne Bibliothek) --------------------------------
// Erzeugt eine Excel-Arbeitsmappe aus einfachen Tabellenbeschreibungen:
//   { name, columns: [{ header, width, type }], rows: [[…]], freeze, filter, landscape }
// Zellwerte: Text, Zahl, Wahrheitswert, null oder { v, type, bold, fill, wrap }.
// Spalten- bzw. Zelltypen: 'text' · 'int' · 'dec' (eine Nachkommastelle) · 'dec2' · 'pct' · 'date' (JJJJ-MM-TT)
// Texte werden immer als Text gespeichert – eine Zelle „=…“ wird nie zur Formel.

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
// eslint-disable-next-line no-control-regex -- in XML unzulässige Steuerzeichen werden entfernt
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const x = s => String(s ?? '').replace(BAD_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = i => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
/** Excel-Seriennummer eines Datums JJJJ-MM-TT (Zählung ab 30.12.1899). */
export const excelDate = s => Math.round((Date.parse(s + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / DAY);
/** Blattnamen: höchstens 31 Zeichen, ohne [ ] : * ? / \ und eindeutig. */
export function sheetNames(names) {
  const used = new Set();
  return names.map((raw, i) => {
    let base = String(raw || 'Blatt ' + (i + 1)).replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Blatt ' + (i + 1), name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) { const suffix = ' (' + n + ')'; name = base.slice(0, 31 - suffix.length) + suffix; }
    used.add(name.toLowerCase());
    return name;
  });
}

const FILLS = { head: 'FF17406D', crit: 'FFF8D7D7', warn: 'FFFDEFC8', good: 'FFDDF3DD', info: 'FFE3EDFA', soft: 'FFF1F3F6' };
const FORMATS = { int: 1, dec: 164, dec2: 2, pct: 165, date: 14 };          // 14 = Datum in der Schreibweise des Rechners
class Styles {
  constructor() { this.keys = new Map(); this.xfs = []; this.id({}); }
  /** Liefert die Formatnummer für eine Kombination aus Zahlenformat, Schrift, Füllung und Umbruch. */
  id({ type = '', bold = false, fill = '', wrap = false, head = false, title = false, right = false } = {}) {
    const key = [type, bold, fill, wrap, head, title, right].join('|');
    if (this.keys.has(key)) return this.keys.get(key);
    const font = title ? 3 : head ? 2 : bold ? 1 : 0, fillId = head ? 2 : FILLS[fill] ? 2 + Object.keys(FILLS).indexOf(fill) : 0, fmt = FORMATS[type] || 0;
    const align = wrap || head || right ? '<alignment' + (wrap || head ? ' wrapText="1"' : '') + ' vertical="' + (head ? 'center' : 'top') + '"' + (right ? ' horizontal="right"' : '') + '/>' : '';
    this.xfs.push('<xf numFmtId="' + fmt + '" fontId="' + font + '" fillId="' + fillId + '" borderId="' + (head ? 1 : 0) + '" xfId="0"' + (fmt ? ' applyNumberFormat="1"' : '') + (font ? ' applyFont="1"' : '')
      + (fillId ? ' applyFill="1"' : '') + (head ? ' applyBorder="1"' : '') + (align ? ' applyAlignment="1">' + align + '</xf>' : '/>'));
    this.keys.set(key, this.xfs.length - 1);
    return this.xfs.length - 1;
  }
  xml() {
    const fill = c => '<fill><patternFill patternType="solid"><fgColor rgb="' + c + '"/><bgColor indexed="64"/></patternFill></fill>';
    const others = Object.keys(FILLS).filter(k => k !== 'head');
    return XML_HEAD + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>'
      + '<fonts count="4"><font><sz val="10"/><name val="Segoe UI"/><family val="2"/></font><font><b/><sz val="10"/><name val="Segoe UI"/><family val="2"/></font>'
      + '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/><family val="2"/></font><font><b/><sz val="14"/><name val="Segoe UI"/><family val="2"/></font></fonts>'
      + '<fills count="' + (3 + others.length) + '"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' + fill(FILLS.head) + others.map(k => fill(FILLS[k])).join('') + '</fills>'
      + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF0F2137"/></bottom><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="' + this.xfs.length + '">' + this.xfs.join('') + '</cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }
}

function sheetXml(sheet, styles, strings) {
  const cols = sheet.columns || [], nCols = Math.max(cols.length, ...sheet.rows.map(r => r.length), 1);
  const str = s => { let i = strings.map.get(s); if (i === undefined) { i = strings.list.length; strings.map.set(s, i); strings.list.push(s); } strings.count++; return i; };
  const cell = (v, c, r, def) => {
    const o = v !== null && typeof v === 'object' ? v : { v }, ref = colName(c) + r;
    const type = o.type || def.type || '', st = { type, bold: o.bold || def.bold, fill: o.fill || def.fill || '', wrap: o.wrap ?? def.wrap, head: def.head, title: o.title };
    let val = o.v;
    if (val === null || val === undefined || val === '') return st.fill || st.head ? '<c r="' + ref + '" s="' + styles.id({ ...st, type: '' }) + '"/>' : '';
    if (type === 'date') { if (validDate(val)) return '<c r="' + ref + '" s="' + styles.id(st) + '"><v>' + excelDate(val) + '</v></c>'; st.type = ''; }
    if (typeof val === 'boolean') val = val ? 'ja' : 'nein';
    if (typeof val === 'number' && Number.isFinite(val) && type !== 'text') return '<c r="' + ref + '" s="' + styles.id(st) + '"><v>' + val + '</v></c>';
    return '<c r="' + ref + '" s="' + styles.id({ ...st, type: '' }) + '" t="s"><v>' + str(String(val)) + '</v></c>';
  };
  let data = '', r = 0;
  if (cols.length) data += '<row r="' + (++r) + '" ht="30" customHeight="1">' + cols.map((c, i) => cell(c.header ?? '', i, r, { head: true })).join('') + '</row>';
  for (const row of sheet.rows) { r++; data += '<row r="' + r + '">' + row.map((v, i) => cell(v, i, r, cols[i] || {})).join('') + '</row>'; }
  const last = colName(nCols - 1) + Math.max(r, 1), head = cols.length > 0;
  return XML_HEAD + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:' + last + '"/>'
    + '<sheetViews><sheetView workbookViewId="0"' + (sheet.active ? ' tabSelected="1"' : '') + '>' + (head && sheet.freeze !== false ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '') + '</sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + '<cols>' + Array.from({ length: nCols }, (_, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (cols[i]?.width || sheet.widths?.[i] || 14) + '" customWidth="1"/>').join('') + '</cols>'
    + '<sheetData>' + data + '</sheetData>'
    + (head && sheet.filter !== false && r > 1 ? '<autoFilter ref="A1:' + last + '"/>' : '')
    + '<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '<pageSetup paperSize="9" orientation="' + (sheet.landscape === false ? 'portrait' : 'landscape') + '" fitToWidth="1" fitToHeight="0"/>'
    + '<headerFooter><oddHeader>&amp;L&amp;A</oddHeader><oddFooter>&amp;L' + x(String(sheet.footer || '').replace(/&/g, '&&')) + '&amp;RSeite &amp;P von &amp;N</oddFooter></headerFooter></worksheet>';
}

// ---------- ZIP -------------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') return null;
  try { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); }
  catch (err) { return null; }
}
/** Packt Dateien { name: Text } zu einem ZIP-Archiv (Deflate, wo verfügbar; sonst unkomprimiert). */
export async function zip(files, date = new Date()) {
  const enc = new TextEncoder(), parts = [], central = [];
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1), day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = typeof content === 'string' ? enc.encode(content) : content, packed = await deflate(raw), useDeflate = !!packed && packed.length < raw.length;
    const body = useDeflate ? packed : raw, nameBytes = enc.encode(name), crc = crc32(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, useDeflate ? 8 : 0, true);
    local.setUint16(10, time, true); local.setUint16(12, day, true); local.setUint32(14, crc, true); local.setUint32(18, body.length, true); local.setUint32(22, raw.length, true); local.setUint16(26, nameBytes.length, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, useDeflate ? 8 : 0, true);
    cen.setUint16(12, time, true); cen.setUint16(14, day, true); cen.setUint32(16, crc, true); cen.setUint32(20, body.length, true); cen.setUint32(24, raw.length, true); cen.setUint16(28, nameBytes.length, true); cen.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, body);
    central.push(new Uint8Array(cen.buffer), nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const cenSize = central.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22)), n = Object.keys(files).length;
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, n, true); end.setUint16(10, n, true); end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cenSize + 22); let p = 0;
  for (const part of [...parts, ...central, new Uint8Array(end.buffer)]) { out.set(part, p); p += part.length; }
  return out;
}

/** Baut die Arbeitsmappe und liefert sie als Bytes (Uint8Array). */
export async function writeXlsx(sheets, { title = '', creator = 'M1 Qualifikationscockpit', created = new Date() } = {}) {
  if (!sheets.length) throw new Error('Arbeitsmappe ohne Blätter');
  const names = sheetNames(sheets.map(s => s.name)), styles = new Styles(), strings = { map: new Map(), list: [], count: 0 };
  const NS = 'http://schemas.openxmlformats.org/', files = {};
  const body = sheets.map((s, i) => sheetXml({ ...s, active: i === 0 }, styles, strings));
  files['[Content_Types].xml'] = XML_HEAD + '<Types xmlns="' + NS + 'package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
  files['_rels/.rels'] = XML_HEAD + '<Relationships xmlns="' + NS + 'package/2006/relationships"><Relationship Id="rId1" Type="' + NS + 'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '<Relationship Id="rId2" Type="' + NS + 'package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
  files['docProps/core.xml'] = XML_HEAD + '<cp:coreProperties xmlns:cp="' + NS + 'package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + '<dc:title>' + x(title) + '</dc:title><dc:creator>' + x(creator) + '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + created.toISOString().slice(0, 19) + 'Z</dcterms:created></cp:coreProperties>';
  const titles = sheets.map((s, i) => s.columns && s.columns.length ? '<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">\'' + x(names[i].replace(/'/g, "''")) + '\'!$1:$1</definedName>' : '').join('');
  files['xl/workbook.xml'] = XML_HEAD + '<workbook xmlns="' + NS + 'spreadsheetml/2006/main" xmlns:r="' + NS + 'officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'
    + names.map((n, i) => '<sheet name="' + x(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>'
    + (titles ? '<definedNames>' + titles + '</definedNames>' : '') + '</workbook>';
  files['xl/_rels/workbook.xml.rels'] = XML_HEAD + '<Relationships xmlns="' + NS + 'package/2006/relationships">'
    + sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + NS + 'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
    + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + NS + 'officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '<Relationship Id="rId' + (sheets.length + 2) + '" Type="' + NS + 'officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>';
  files['xl/styles.xml'] = styles.xml();
  files['xl/sharedStrings.xml'] = XML_HEAD + '<sst xmlns="' + NS + 'spreadsheetml/2006/main" count="' + strings.count + '" uniqueCount="' + strings.list.length + '">'
    + strings.list.map(s => '<si><t' + (/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : '') + '>' + x(s) + '</t></si>').join('') + '</sst>';
  body.forEach((xml, i) => { files['xl/worksheets/sheet' + (i + 1) + '.xml'] = xml; });
  return zip(files, created);
}
