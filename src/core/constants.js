// ---------- Konstanten -------------------------------------------------
export const FORMAT = 'M1-Cockpit', VERSION = 4, DAY = 86400000, EPS = 1e-9;
export const AREAS = ['M1', 'M2', 'M3'];
export const SHIFTS = ['Früh', 'Spät', 'Nacht'];
export const LOGBOOK = 'Practical Logbook', PREP = 'Vorbereitung';
export const TYPES = ['Basic Knowledge', 'FG650', 'Theorie', 'Praxis', LOGBOOK, 'FitCheck', PREP, 'ICA'];
export const GATE_TYPES = new Set(['Praxis', 'Theorie', 'Basic Knowledge']);
/** Maßnahmen, die als Lehrgang stattfinden: immer ein zusammenhängender Block für eine Gruppe. */
export const COURSE_TYPES = ['Theorie', 'Praxis', 'Basic Knowledge', 'FG650'];
export const isCourseType = t => COURSE_TYPES.includes(t);
export const CLUSTERS = {
  '1': 'CAB-Erstentwicklung',
  '2': 'Frühauslerner → CAT A',
  '3': 'Basic Knowledge → CAT A',
  '4A': 'CAB → CAT A (Basic Knowledge vorhanden)',
  '4B': 'CAB → CAT A (nur FG650)',
  '5': 'Mustererweiterung innerhalb der Stufe',
  'offen': 'Entwicklungszuordnung offen',
  'ausgeschlossen': 'Keine neuen Maßnahmen'
};
export const ROUTE_CLUSTERS = ['1', '2', '3', '4A', '4B', '5'];
export const DEFAULT_ROUTES = {
  '1': ['FitCheck', 'ICA'], '2': [LOGBOOK, 'FitCheck', 'ICA'], '3': [LOGBOOK, 'FitCheck', 'ICA'],
  '4A': [LOGBOOK, 'FitCheck', 'ICA'], '4B': [LOGBOOK, 'FitCheck', 'ICA'], '5': [LOGBOOK]
};
export const ABS_TYPES = ['Urlaub', 'Krank', 'Sonstiges'];
export const TARGETS = ['A320', 'A330', 'A350', 'A380', 'A350/A380 Kombikurs'];
export const LEVELS = ['CAB', 'CAT A', 'TEC', 'CAT B'];
export const PATTERNS = ['A320', 'A330', 'A350', 'A380'];
export const ROSTER_CHARS = '.-FSNfsnxyz';           // 0 kein Eintrag · 1 Frei · 2.. Bereich×Dienst
export const SICK_DEFAULT = [7.45, 5.16, 8.54, 6.98, 6.57, 5.9, 5.89, 5.82, 5.79, 8.55, 9.13, 7.82];
export const SCHOOL_BY_2027 = [
  { name: 'Weihnachtsferien (Jahresanfang)', start: '2027-01-01', end: '2027-01-08' },
  { name: 'Frühjahrsferien', start: '2027-02-08', end: '2027-02-12' },
  { name: 'Osterferien', start: '2027-03-22', end: '2027-04-02' },
  { name: 'Pfingstferien', start: '2027-05-18', end: '2027-05-28' },
  { name: 'Sommerferien', start: '2027-08-02', end: '2027-09-13' },
  { name: 'Allerheiligen', start: '2027-11-02', end: '2027-11-05' },
  { name: 'Weihnachtsferien (Jahresende)', start: '2027-12-24', end: '2027-12-31' }
];
