import * as Core from '../core/index.js';
import { desktop, isDesktop } from '../platform/desktop.js';
import { $ } from './dom.js';
import { PRJ, S, projectClass, years } from './state.js';

/* ==========================================================================
 * Oberfläche · Dateien: Ausgabe (Desktop: „Speichern unter“ · Browser: Download), Auswahl, Dateinamen
 * ========================================================================== */
// Einzeldatei-Variante: die unveränderte Programmdatei ist die Vorlage für „Programm mit Stand“
const PRISTINE_HTML = isDesktop ? '' : '<!doctype html>\n' + document.documentElement.outerHTML;

// ---------- Dateien ----------------------------------------------------------
/** Übergibt eine Datei an den Menschen. Liefert den Dateinamen oder null, wenn abgebrochen wurde. */
export async function download(name, content, mime = 'application/json') {
  if (isDesktop) return desktop.saveFile({ suggestedName: name, data: content });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime + ';charset=utf-8' })); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return name;
}
export function pickFile(accept) {
  return new Promise(resolve => {
    const inp = $('#filePick'); inp.value = ''; inp.accept = accept;
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}
const MARK = { real: '_VERTRAULICH-Personendaten', pseudo: '_pseudonymisiert', demo: '_Demo', empty: '' };
/**
 * Dateiname mit Jahr, Datum und Vertraulichkeitskennzeichen.
 * project: Name für das ganze Projekt (alle Planungsjahre) · dated: Tagesdatum anhängen
 */
export function fname(base, ext, { project = false, dated = true } = {}) {
  const ys = years(), span = project && ys.length > 1 ? ys[0] + '-' + ys[ys.length - 1] : S.meta.year;
  const mark = MARK[project ? projectClass() : S.meta.dataClass] || '';
  return 'M1_Cockpit_' + span + '_' + base + (dated ? '_' + new Date().toISOString().slice(0, 10) : '') + mark + '.' + ext;
}
export const csvDownload = (base, header, rows) => download(fname(base, 'csv'), Core.toCSV(header, rows), 'text/csv');
export const templateDownload = kind => download('M1_Vorlage_' + kind + '.csv', Core.toCSV(Core.TEMPLATES[kind], []), 'text/csv');
/** Eigenständige HTML-Datei, die beim Öffnen genau diesen Stand zeigt. */
export async function snapshotHtml() {
  const json = Core.serializeProject(PRJ).replace(/</g, '\\u003c');
  const re = /(<script id="embedded-state" type="application\/json">)[\s\S]*?(<\/script>)/;
  const base = isDesktop ? await desktop.standaloneHtml() : PRISTINE_HTML;
  if (!re.test(base)) throw new Error('Schnappschuss nicht möglich: Programmdatei wurde verändert');
  return base.replace(re, (m, a, b) => a + json + b);
}
export const nextFrame = () => new Promise(r => setTimeout(r, 0));
