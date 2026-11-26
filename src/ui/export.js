import * as Core from '../core/index.js';
import { desktop, isDesktop } from '../platform/desktop.js';
import { download, fname, nextFrame } from './files.js';
import { fmt } from './format.js';
import { PRJ, S, UI, privacy, projectClass, years } from './state.js';
import { toast } from './dialogs.js';
import { ACT } from './registry.js';
import { go } from './shell.js';

/* ==========================================================================
 * Oberfläche · Ausgaben: PDF (Druckansicht) und Excel-Arbeitsmappe
 * ========================================================================== */
const VIEW_NAMES = { overview: 'Uebersicht', year: 'Jahresplan', capacity: 'Kapazitaet', courses: 'Lehrgaenge', people: 'Personen', routes: 'Ausbildungswege',
  events: 'Termine', absences: 'Abwesenheiten', report: 'Bericht', fullreport: 'Gesamtbericht', data: 'Daten', help: 'Anleitung' };
/** Fußzeile für PDF-Seiten: Projekt, Stand und – bei Personendaten – der Vertraulichkeitshinweis. */
const pdfFooter = what => S.meta.title + ' · ' + what + ' · Stand ' + fmt(new Date().toISOString().slice(0, 10))
  + ({ real: privacy() ? ' · Namen verborgen' : ' · VERTRAULICH – enthält Personendaten', pseudo: ' · pseudonymisiert', demo: ' · Demo-Daten' }[projectClass()] || '');

// Gedruckt wird immer im hellen Erscheinungsbild – auch wenn am Bildschirm dunkel eingestellt ist.
let themeBeforePrint = '';
const lightForPrint = () => { const el = document.documentElement; if (el.dataset.theme === 'dark') { themeBeforePrint = 'dark'; el.dataset.theme = 'light'; } };
const restoreTheme = () => { if (themeBeforePrint) { document.documentElement.dataset.theme = themeBeforePrint; themeBeforePrint = ''; } };
window.addEventListener('beforeprint', lightForPrint);
window.addEventListener('afterprint', restoreTheme);

async function pdfOfCurrentView() {
  const key = VIEW_NAMES[UI.view] || 'Ansicht';
  lightForPrint();
  try {
    await nextFrame();
    const name = await desktop.exportPdf({ suggestedName: fname(key, 'pdf'), landscape: true, footer: pdfFooter(key === 'Gesamtbericht' ? 'Gesamtbericht ' + S.meta.year : key) });
    if (name) toast('PDF gespeichert: ' + name);
  } finally { restoreTheme(); }
}
/** Aktuelle Ansicht als PDF. Im Browser übernimmt der Druckdialog („Als PDF speichern“). */
ACT['export-pdf-view'] = () => isDesktop ? pdfOfCurrentView() : window.print();
/** Gesamtbericht: zur Druckansicht wechseln und von dort als PDF ausgeben. */
ACT['export-pdf-report'] = async () => {
  if (UI.view !== 'fullreport') { go('fullreport'); await nextFrame(); }
  return isDesktop ? pdfOfCurrentView() : window.print();
};
/** Alle Tabellen des aktiven Planungsjahres als Excel-Arbeitsmappe; bei „Namen verbergen“ mit Pseudonymen. */
ACT['export-xlsx'] = async () => {
  const wb = Core.buildWorkbook(S, { privacy: privacy(), years: years().map(y => PRJ.years[y]) });
  const bytes = await Core.writeXlsx(wb.sheets, { title: wb.title });
  const name = await download(fname('Auswertung', 'xlsx'), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (name) toast('Excel-Arbeitsmappe gespeichert: ' + wb.sheets.length + ' Tabellenblätter' + (privacy() ? ' · Namen verborgen' : S.meta.dataClass === 'real' ? ' – enthält Personendaten' : ''));
};
