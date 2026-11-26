import { PATTERNS } from './constants.js';

// ---------- CSV --------------------------------------------------------
export function parseCSV(text) {
  text = String(text ?? '').replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const cnt = ch => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (c === ch && !q) n++; } return n; };
  const cand = [[';', cnt(';')], ['\t', cnt('\t')], [',', cnt(',')]].sort((a, b) => b[1] - a[1]);
  const D = cand[0][1] > 0 ? cand[0][0] : ';';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === D) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  if (q) throw new Error('CSV: Anführungszeichen nicht geschlossen');
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  return rows.map(r => r.map(x => x.trim()));
}
export const normHead = h => String(h ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
export const HEAD = {};
const alias = (key, ...names) => names.forEach(nm => { HEAD[normHead(nm)] = key; });
alias('pk', 'pk', 'Personalnummer', 'PersNr', 'Pers.-Nr.', 'Personalnr', 'PNR');
alias('name', 'name', 'Mitarbeiter', 'Nachname, Vorname', 'Mitarbeitername');
alias('org', 'org', 'OrgEinheit', 'Organisationseinheit', 'Abteilung', 'Team', 'OE');
alias('rights', 'rights', 'Berechtigung', 'Bestehende Berechtigung', 'Berechtigungen');
alias('cluster', 'cluster');
alias('locked', 'locked', 'gesperrt', 'Sperre');
alias('area', 'area', 'Bereich');
alias('shift', 'shift', 'Dienst', 'Schicht');
alias('start', 'start', 'Beginn', 'von', 'Individueller Start', 'Startdatum');
alias('end', 'end', 'Ende', 'bis', 'Enddatum');
alias('target', 'target', 'Zielmuster', 'Ziel', 'Muster');
alias('level', 'level', 'Zielstufe', 'Stufe');
alias('priority', 'priority', 'Priorität', 'Prio', 'Planungspriorität');
alias('confirmed', 'confirmed', 'bestätigt', 'Voraussetzungen bestätigt');
alias('gate', 'gate', 'Abschluss Doings', 'Abschluss aller Doings');
alias('date', 'date', 'Datum', 'Tag');
alias('type', 'type', 'Art', 'Maßnahme', 'Typ', 'Lehrgangsart');
alias('title', 'title', 'Titel', 'Lehrgang', 'Bezeichnung', 'Kurs', 'Kursname', 'Lehrgangsname');
alias('seats', 'seats', 'Plätze', 'Platzzahl', 'Teilnehmerzahl', 'max. Teilnehmer', 'Kapazität Lehrgang');
alias('net', 'net', 'NettoVorFortbildung', 'Netto');
alias('min', 'min', 'Minimum');
alias('zero', 'zero', '0Punkt', '0-Punkt', 'Nullpunkt');
alias('checked', 'checked', 'UrlaubGeprueft', 'geprüft');
alias('absencesIncluded', 'absencesIncluded', 'AbwesenheitenEnthalten');
alias('gross', 'gross', 'BruttoKopfzahl', 'Brutto');
alias('absent', 'absent', 'BekannteAbwesenheit', 'Abwesend');
alias('trainee', 'trainee', 'Teilnehmerverlust');
alias('mentor', 'mentor');
alias('tec', 'tec');
alias('examiner', 'examiner', 'Prüfer');
alias('alias', 'alias', 'Pseudonym');
for (const p of PATTERNS) alias(p, p);
/** Zeilen (Arrays) → Objekte mit kanonischen Feldnamen. */
export function rowsToObjects(rows) {
  if (!rows.length) throw new Error('Datei ist leer');
  const head = rows[0].map(h => HEAD[normHead(h)] || String(h).trim());
  // Spalte „Person“ dient als Personalnummer, wenn keine eigene Nummernspalte existiert, sonst als Name
  const pi = head.findIndex(h => normHead(h) === 'person');
  if (pi >= 0) head[pi] = !head.includes('pk') ? 'pk' : !head.includes('name') ? 'name' : head[pi];
  return { head, rows: rows.slice(1).map(r => Object.fromEntries(head.map((k, i) => [k, r[i] ?? '']))) };
}
export function toCSV(header, rows) {
  const q = v => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '\uFEFF' + [header, ...rows].map(r => r.map(q).join(';')).join('\r\n') + '\r\n';
}
export const TEMPLATES = {
  people: ['pk', 'name', 'org', 'rights', 'cluster', 'locked', 'area', 'shift', 'start', 'target', 'level', 'priority', 'A320', 'A330', 'A350', 'A380', 'confirmed', 'gate'],
  roster: ['pk', 'date', 'area', 'shift'], absences: ['pk', 'start', 'end', 'type'],
  capacity: ['date', 'area', 'shift', 'net', 'min', 'zero', 'checked', 'absencesIncluded', 'gross', 'absent'],
  school: ['name', 'start', 'end'], events: ['pk', 'type', 'title', 'start', 'end', 'trainee', 'mentor', 'tec', 'examiner'],
  key: ['alias', 'pk', 'name', 'org'],
  courses: ['title', 'type', 'target', 'start', 'end', 'seats', 'pk']
};
