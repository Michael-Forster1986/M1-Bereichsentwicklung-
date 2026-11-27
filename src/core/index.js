/* ==========================================================================
 * M1 Qualifikationscockpit · Rechenkern
 * Reine Logik ohne DOM: Kalender, Kapazität, Planer, Konflikte, Importe.
 * Enthält keinerlei Personendaten; Demo-Daten werden synthetisch erzeugt.
 * ========================================================================== */
export { FORMAT, VERSION, EPS, AREAS, SHIFTS, TYPES, LOGBOOK, PREP, CLUSTERS, ROUTE_CLUSTERS, DEFAULT_ROUTES, ABS_TYPES, TARGETS, LEVELS, PATTERNS, COURSE_TYPES, isCourseType } from './constants.js';
export { clone, num, fin, clamp, uid, kOf, kArea, kShift } from './util.js';
export { validDate, addDays, fmtDE, fmtShort, normDate, makeCalendar, firstMonday, isoWeek, holidaysBavaria, planningYear } from './dates.js';
export { defaultConfig, defaultLimits, defaultSettings, emptyState, newProjectState } from './defaults.js';
export { isLocked, parseCluster, normShift, normPerson, normCredit, creditOf, assignAliases, routeOf, cfgOf } from './people.js';
export { decodeRoster, encodeRoster, rosterCode, setRosterDays, fillRoster, fillRosterWeekly, copyRoster, clearRoster } from './roster.js';
export { buildIndex, assign, capInfo, eventK } from './indexing.js';
export { runPlan, scorePlan, planVariants, optimizePlan, replanPeople, betterScore } from './planner.js';
export { findConflicts } from './conflicts.js';
export { routeProgress, summarize } from './summary.js';
export { courseAssess, courseSearch, modulePlan, courseListRows, pickSlots, courseEvents, courseDayList, memberDayList, moduleDays, eventModules, syncCourse, setCourseModules, setPersonModules, courseMembers, courseKey, courseTargetOf, courseAudience, courseDemand, courseWindow, courseCandidates, assessCourse, memberEvent, joinCourse, moveCourse, removeCourse, proposeCourses } from './courses.js';
export { TEMPLATES, HEAD, normHead, parseCSV, rowsToObjects, toCSV } from './csv.js';
export { checkPeople, applyPeople, checkRoster, applyRoster, checkAbsences, applyAbsences, checkCapacity, checkEvents, courseTypeOf, checkCourses, applyCourses } from './imports.js';
export { sanitize, migrateLegacy, loadAny, readPayload, normCourse, linkCourses } from './project.js';
export { parseDayMatrix, defaultCodeMap, matrixAbsences, applyDayMatrix, nameKey, MATRIX_TARGETS } from './daymatrix.js';
export { elementFor, checkPlacement } from './placement.js';
export { simulatedParts, removeSimulated, readiness } from './golive.js';
export { PROJECT_VERSION, wrapProject, projectYears, isProjectPayload, sanitizeProject, sanitizeAny, loadProject, serializeProject, carriedCredit, rolloverYear, refreshCredits, pseudonymizeProject, reidentifyProject } from './workspace.js';
export { pseudonymize, reidentify } from './pseudonym.js';
export { demoState } from './demo.js';
export { readXlsx, xlsxPeopleTable } from './xlsx-read.js';
export { writeXlsx, zip, excelDate, sheetNames } from './xlsx-write.js';
export { REPORT_LABELS, ROUTE_LABELS, DATA_CLASS_LABELS, MONTHS, NOTICE, originOf, monthlyFigures, clusterFigures, yearFigures, capStatus, buildWorkbook } from './report.js';
export { MEASURE_COLORS, MAX_MEASURES, defaultShifts, measureNameIssue, isBuiltin, kindFixed, editOf, labelOf, normMeasureEdits, editBuiltin, resetBuiltin, normMeasures, normShifts, typesOf, measureOf, isCourse, courseTypesOf, shiftsOf, shiftOk, shiftText, shiftIssue, setShifts, measureUsage, addMeasure, editMeasure, removeMeasure, moveStep, insertStep } from './measures.js';
export { DEFAULT_RULES, FRAME_TYPE, RULE_SWITCHES, rulesOf, normRules, rulesChanged, setRules, resetRules } from './rules.js';
export { MODULE_TYPE, MODULE_COUNT, moduleCountOf, moduleName, hasModules, normModules, moduleSpan, moduleIssues, normPersonModules, parseModuleList, memberModules, isPartial, moduleText } from './modules.js';
