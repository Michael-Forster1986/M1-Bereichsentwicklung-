/* ==========================================================================
 * M1 Qualifikationscockpit · Rechenkern
 * Reine Logik ohne DOM: Kalender, Kapazität, Planer, Konflikte, Importe.
 * Enthält keinerlei Personendaten; Demo-Daten werden synthetisch erzeugt.
 * ========================================================================== */
export { FORMAT, VERSION, EPS, AREAS, SHIFTS, TYPES, LOGBOOK, PREP, CLUSTERS, ROUTE_CLUSTERS, DEFAULT_ROUTES, ABS_TYPES, TARGETS, LEVELS, PATTERNS } from './constants.js';
export { clone, num, fin, clamp, uid, kOf, kArea, kShift } from './util.js';
export { validDate, addDays, fmtDE, fmtShort, normDate, makeCalendar, firstMonday, isoWeek, holidaysBavaria } from './dates.js';
export { defaultConfig, defaultLimits, defaultSettings, emptyState } from './defaults.js';
export { isLocked, parseCluster, normShift, normPerson, normCredit, creditOf, assignAliases, routeOf, cfgOf } from './people.js';
export { decodeRoster, encodeRoster, rosterCode } from './roster.js';
export { buildIndex, assign, capInfo, eventK } from './indexing.js';
export { runPlan, scorePlan, planVariants, optimizePlan, betterScore } from './planner.js';
export { findConflicts } from './conflicts.js';
export { routeProgress, summarize } from './summary.js';
export { courseAssess, courseSearch, pickSlots, courseEvents } from './courses.js';
export { TEMPLATES, parseCSV, rowsToObjects, toCSV } from './csv.js';
export { checkPeople, applyPeople, checkRoster, applyRoster, checkAbsences, applyAbsences, checkCapacity, checkEvents } from './imports.js';
export { sanitize, migrateLegacy, loadAny, readPayload } from './project.js';
export { PROJECT_VERSION, wrapProject, projectYears, isProjectPayload, sanitizeProject, sanitizeAny, loadProject, serializeProject, carriedCredit, rolloverYear, refreshCredits } from './workspace.js';
export { pseudonymize, reidentify } from './pseudonym.js';
export { demoState } from './demo.js';
export { readXlsx, xlsxPeopleTable } from './xlsx-read.js';
export { writeXlsx, zip, excelDate, sheetNames } from './xlsx-write.js';
export { REPORT_LABELS, ROUTE_LABELS, DATA_CLASS_LABELS, MONTHS, NOTICE, originOf, monthlyFigures, clusterFigures, yearFigures, capStatus, buildWorkbook } from './report.js';
