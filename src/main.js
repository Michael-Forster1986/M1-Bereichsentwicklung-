/* ==========================================================================
 * M1 Qualifikationscockpit · Einstieg
 * Lädt alle Oberflächenmodule (sie registrieren Ansichten und Aktionen) und startet.
 * ========================================================================== */
import './ui/files.js';
import './ui/dom.js';
import './ui/format.js';
import './ui/state.js';
import './ui/dialogs.js';
import './ui/tooltip.js';
import './ui/dispatch.js';
import './ui/shell.js';
import './ui/project-files.js';
import './ui/plan-dialog.js';
import './ui/views/shared.js';
import './ui/views/overview.js';
import './ui/views/year.js';
import './ui/views/year-dnd.js';
import './ui/views/capacity.js';
import './ui/drawers.js';
import './ui/views/courses.js';
import './ui/views/people.js';
import './ui/views/routes.js';
import './ui/views/events.js';
import './ui/views/absences.js';
import './ui/views/report.js';
import './ui/views/years.js';
import './ui/views/data.js';
import './ui/views/fullreport.js';
import './ui/views/help.js';
import './ui/export.js';
import { boot } from './ui/boot.js';

boot();
