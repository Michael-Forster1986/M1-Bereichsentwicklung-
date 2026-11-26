import * as Core from '../core/index.js';
import { $ } from './dom.js';
import { S } from './state.js';

const PRISTINE_HTML = '<!doctype html>\n' + document.documentElement.outerHTML;   // unveränderte Programmdatei für Schnappschüsse

// ---------- Dateien ----------------------------------------------------------
export function download(name, content, mime = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime + ';charset=utf-8' })); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function pickFile(accept) {
  return new Promise(resolve => {
    const inp = $('#filePick'); inp.value = ''; inp.accept = accept;
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}
/** Dateiname mit Jahr, Datum und Vertraulichkeitskennzeichen. */
export function fname(base, ext) {
  const mark = { real: '_VERTRAULICH-Personendaten', pseudo: '_pseudonymisiert', demo: '_Demo', empty: '' }[S.meta.dataClass] || '';
  return 'M1_Cockpit_' + S.meta.year + '_' + base + '_' + new Date().toISOString().slice(0, 10) + mark + '.' + ext;
}
export const csvDownload = (base, header, rows) => download(fname(base, 'csv'), Core.toCSV(header, rows), 'text/csv');
export const templateDownload = kind => download('M1_Vorlage_' + kind + '.csv', Core.toCSV(Core.TEMPLATES[kind], []), 'text/csv');
export function snapshotHtml() {
  const json = JSON.stringify(S).replace(/</g, '\\u003c');
  const re = /(<script id="embedded-state" type="application\/json">)[\s\S]*?(<\/script>)/;
  if (!re.test(PRISTINE_HTML)) throw new Error('Schnappschuss nicht möglich: Programmdatei wurde verändert');
  return PRISTINE_HTML.replace(re, (m, a, b) => a + json + b);
}
export const nextFrame = () => new Promise(r => setTimeout(r, 0));
