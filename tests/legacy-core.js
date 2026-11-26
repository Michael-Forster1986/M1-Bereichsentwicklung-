// Lädt den Rechenkern der ursprünglichen Einzeldatei (legacy/…v4.html) als Vergleichsmaßstab.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'legacy', 'M1_Qualifikationscockpit_v4.html');

export function loadLegacyCore() {
  const html = fs.readFileSync(file, 'utf8');
  const a = html.indexOf('const Core = (() => {'), b = html.indexOf("if (typeof module !== 'undefined'", a);
  if (a < 0 || b < 0) throw new Error('Rechenkern in der Legacy-Datei nicht gefunden');
  return new Function(html.slice(a, b) + '\nreturn Core;')();
}

/** Macht Zustände vergleichbar: zufällige Termin-IDs und Zeitstempel werden ersetzt. */
export function normalizeState(st) {
  const c = JSON.parse(JSON.stringify(st));
  c.events.forEach((e, i) => { e.id = 'E' + i; });
  if (c.meta) { c.meta.created = ''; c.meta.modified = ''; }
  if (c.planInfo) c.planInfo.at = '';
  // Felder, die es in der Einzeldatei-Fassung noch nicht gab
  if (Array.isArray(c.courses) && !c.courses.length) delete c.courses;
  if (c.settings) delete c.settings.courseBlocks;
  // eigene Schritte und abweichende Dienstregeln kennt die Einzeldatei nicht; leer entsprechen sie ihrem Verhalten
  if (Array.isArray(c.measures) && !c.measures.length) delete c.measures;
  if (c.settings && c.settings.shifts && !Object.keys(c.settings.shifts).length) delete c.settings.shifts;
  return c;
}
export const normalizeEvents = evs => evs.map((e, i) => ({ ...e, id: 'E' + i }));
/** Typisierte Felder → normale Arrays, Maps → Einträge, damit toEqual sinnvoll vergleicht. */
export function plain(x) {
  if (x == null || typeof x !== 'object') return x;
  if (ArrayBuffer.isView(x)) return Array.from(x);
  if (x instanceof Map) return [...x].map(([k, v]) => [k, plain(v)]);
  if (x instanceof Set) return [...x];
  if (Array.isArray(x)) return x.map(plain);
  const o = {};
  for (const k of Object.keys(x)) if (typeof x[k] !== 'function') o[k] = plain(x[k]);
  return o;
}
