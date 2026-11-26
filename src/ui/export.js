import { desktop, isDesktop } from '../platform/desktop.js';
import { fname } from './files.js';
import { fmt } from './format.js';
import { S, UI, projectClass } from './state.js';
import { toast } from './dialogs.js';
import { ACT } from './registry.js';

/* ==========================================================================
 * Oberfläche · Ausgaben: PDF (Druckansicht) und Excel-Arbeitsmappe
 * ========================================================================== */
const VIEW_NAMES = { overview: 'Uebersicht', year: 'Jahresplan', capacity: 'Kapazitaet', courses: 'Lehrgaenge', people: 'Personen', routes: 'Ausbildungswege',
  events: 'Termine', absences: 'Abwesenheiten', report: 'Bericht', data: 'Daten', help: 'Anleitung' };
/** Fußzeile für PDF-Seiten: Projekt, Stand und – bei Personendaten – der Vertraulichkeitshinweis. */
export const pdfFooter = what => S.meta.title + ' · ' + what + ' · Stand ' + fmt(new Date().toISOString().slice(0, 10))
  + ({ real: ' · VERTRAULICH – enthält Personendaten', pseudo: ' · pseudonymisiert', demo: ' · Demo-Daten' }[projectClass()] || '');

/** Aktuelle Ansicht als PDF. Im Browser übernimmt der Druckdialog („Als PDF speichern“). */
ACT['export-pdf-view'] = async () => {
  if (!isDesktop) return window.print();
  const key = VIEW_NAMES[UI.view] || 'Ansicht';
  const name = await desktop.exportPdf({ suggestedName: fname(key, 'pdf'), landscape: true, footer: pdfFooter(key) });
  if (name) toast('PDF gespeichert: ' + name);
};
