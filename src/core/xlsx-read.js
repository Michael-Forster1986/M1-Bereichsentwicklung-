import { HEAD, normHead } from './csv.js';

// ---------- XLSX (ohne Bibliothek; nur im Browser) ----------------------
export async function readXlsx(file) {
  if (file.size > 15e6) throw new Error('Datei zu groß (max. 15 MB)');
  const b = new Uint8Array(await file.arrayBuffer()), v = new DataView(b.buffer), dec = new TextDecoder();
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Keine gültige XLSX-Datei');
  let pos = v.getUint32(e + 16, true), total = 0; const files = {};
  for (let i = 0, cnt = v.getUint16(e + 10, true); i < cnt; i++) {
    const method = v.getUint16(pos + 10, true), size = v.getUint32(pos + 20, true), rawSize = v.getUint32(pos + 24, true),
      nl = v.getUint16(pos + 28, true), el = v.getUint16(pos + 30, true), cl = v.getUint16(pos + 32, true), o = v.getUint32(pos + 42, true),
      name = dec.decode(b.subarray(pos + 46, pos + 46 + nl));
    pos += 46 + nl + el + cl;
    if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
    total += rawSize; if (total > 60e6) throw new Error('Datei entpackt zu groß');
    const start = o + 30 + v.getUint16(o + 26, true) + v.getUint16(o + 28, true);
    let data = b.subarray(start, start + size);
    if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else if (method !== 0) throw new Error('Kompressionsverfahren nicht unterstützt');
    files[name] = dec.decode(data);
  }
  const xml = s => new DOMParser().parseFromString(s || '<x/>', 'application/xml');
  const txt = node => Array.from(node.getElementsByTagName('t')).map(t => t.textContent).join('');
  const strings = Array.from(xml(files['xl/sharedStrings.xml']).getElementsByTagName('si')).map(txt);
  const rels = new Map(Array.from(xml(files['xl/_rels/workbook.xml.rels']).getElementsByTagName('Relationship')).map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const col = ref => { let c = 0; for (const ch of ref.replace(/\d/g, '')) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };
  const sheets = [];
  for (const s of xml(files['xl/workbook.xml']).getElementsByTagName('sheet')) {
    let target = rels.get(s.getAttribute('r:id')) || ''; target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    if (!files[target]) continue;
    const rows = [];
    for (const r of xml(files[target]).getElementsByTagName('row')) {
      const row = [];
      for (const c of r.getElementsByTagName('c')) {
        const t = c.getAttribute('t'), val = c.getElementsByTagName('v')[0]?.textContent ?? '';
        row[col(c.getAttribute('r') || 'A')] = t === 's' ? (strings[+val] ?? '') : t === 'inlineStr' ? txt(c) : t === 'b' ? (val === '1' ? 'true' : 'false') : val;
      }
      rows.push(Array.from(row, x => String(x ?? '').trim()));
    }
    sheets.push({ name: s.getAttribute('name'), rows });
  }
  return sheets;
}
/** Sucht in den Blättern die Tabelle mit Personalnummern und liefert sie ab der Kopfzeile. */
export function xlsxPeopleTable(sheets) {
  const pref = ['stammdaten', 'berechtigungsmatrix'];
  const ordered = sheets.slice().sort((a, b) => (pref.indexOf(a.name.toLowerCase()) + 1 || 9) - (pref.indexOf(b.name.toLowerCase()) + 1 || 9));
  for (const sh of ordered) {
    const h = sh.rows.findIndex((r, i) => i < 30 && r.some(c => HEAD[normHead(c)] === 'pk'));
    if (h >= 0) return { sheet: sh.name, rows: sh.rows.slice(h).filter(r => r.some(Boolean)) };
  }
  throw new Error('Keine Tabelle mit Spalte „Personalnummer“ gefunden');
}
