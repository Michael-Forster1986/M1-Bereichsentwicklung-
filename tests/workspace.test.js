// Projektdatei mit mehreren Planungsjahren: Laden, Prüfen, Speichern, Verträglichkeit mit älteren Dateien.
import { describe, it, expect } from 'vitest';
import * as Core from '../src/core/index.js';
import { normalizeState } from './legacy-core.js';

const demo = (year, seed) => Core.demoState({ year, count: 15, seed });

describe('Projekt (Format 5)', () => {
  it('verpackt ein Planungsjahr und liest es nach dem Speichern unverändert', () => {
    const st = demo(2027, 1), prj = Core.wrapProject(st);
    expect(prj).toMatchObject({ format: 'M1-Cockpit', version: 5, active: 2027 });
    const res = Core.loadProject(Core.serializeProject(prj), 'x.m1cockpit');
    expect(res.native).toBe(true); expect(res.kind).toBe('Projektdatei'); expect(res.warnings).toEqual([]);
    expect(normalizeState(res.project.years[2027])).toEqual(normalizeState(st));
  });
  it('hält mehrere Jahre auseinander und merkt sich das angezeigte Jahr', () => {
    const prj = Core.wrapProject(demo(2027, 1)); prj.years[2028] = demo(2028, 2); prj.active = 2028;
    const res = Core.loadProject(Core.serializeProject(prj));
    expect(Core.projectYears(res.project)).toEqual([2027, 2028]);
    expect(res.project.active).toBe(2028);
    expect(res.project.years[2028].meta.year).toBe(2028);
    expect(res.project.years[2027].people).toHaveLength(15);
  });
  it('liest Dateien der Einzeldatei-Version (ein Jahr, Format 4) als Import', () => {
    const st = demo(2027, 4), res = Core.loadProject(JSON.stringify(st), 'alt.json');
    expect(res.native).toBe(false);
    expect(res.kind).toMatch(/Einzeldatei-Version/);
    expect(normalizeState(res.project.years[2027])).toEqual(normalizeState(st));
  });
  it('liest den eingebetteten Stand aus „Programm mit Stand“ (HTML)', () => {
    const prj = Core.wrapProject(demo(2027, 5));
    const html = '<!doctype html><html><body><script id="embedded-state" type="application/json">' + Core.serializeProject(prj).replace(/</g, '\\u003c') + '</script></body></html>';
    const res = Core.loadProject(html, 'stand.html');
    expect(res.native).toBe(true);
    expect(res.project.years[2027].people).toHaveLength(15);
  });
  it('überspringt ungültige Jahre, verwirft aber nie stillschweigend alles', () => {
    const good = demo(2027, 6);
    const res = Core.sanitizeProject({ format: 'M1-Cockpit', version: 5, active: 1999, years: { 2027: good, abc: {}, 1500: good, 2029: null } });
    expect(Core.projectYears(res.project)).toEqual([2027]);
    expect(res.project.active).toBe(2027);
    expect(res.warnings).toHaveLength(3);
    expect(() => Core.sanitizeProject({ format: 'M1-Cockpit', years: { x: 1 } })).toThrow(/kein gültiges Planungsjahr/);
  });
  it('richtet das Jahr eines Standes nach seinem Schlüssel aus', () => {
    const res = Core.sanitizeProject({ format: 'M1-Cockpit', years: { 2030: demo(2027, 7) } });
    expect(res.project.years[2030].meta.year).toBe(2030);
  });
  it('weist unbekannte Inhalte zurück', () => {
    expect(() => Core.loadProject('{"irgendwas":1}')).toThrow(/Unbekanntes Dateiformat/);
    expect(() => Core.loadProject('<html><body>nichts</body></html>')).toThrow(/kein Planungsstand/);
    expect(() => Core.loadProject('kein json')).toThrow();
  });
});

describe('Pseudonymisierung über mehrere Planungsjahre', () => {
  const real = () => {
    const a = demo(2027, 8); a.meta.dataClass = 'real';
    a.people.forEach((p, i) => { p.name = 'Nachname' + i + ', Vorname'; p.org = 'Abteilung ' + (i % 3); });
    const prj = Core.wrapProject(a);
    prj.years[2028] = Core.rolloverYear(a).state;
    return prj;
  };
  it('vergibt derselben Person in jedem Jahr dasselbe Pseudonym und entfernt alle Klarnamen', () => {
    const prj = real(), { project, key } = Core.pseudonymizeProject(prj), text = Core.serializeProject(project);
    expect(text).not.toMatch(/Nachname\d/); expect(text).not.toContain('Abteilung');
    for (const p of prj.years[2027].people) expect(text.includes('"' + p.pk + '"'), p.pk).toBe(false);
    expect(project.years[2027].people.map(p => p.pk)).toEqual(project.years[2028].people.map(p => p.pk));
    expect(project.years[2028].meta).toMatchObject({ dataClass: 'pseudo', privacy: true });
    expect(key).toHaveLength(15);
    expect(prj.years[2027].people[0].name).toBe('Nachname0, Vorname');          // Original bleibt unberührt
    // Termine, Dienstplan und Abwesenheiten hängen am Pseudonym
    const st = project.years[2027], pks = new Set(st.people.map(p => p.pk));
    expect(st.events.every(e => pks.has(e.pk))).toBe(true);
    expect(Object.keys(st.roster).every(pk => pks.has(pk))).toBe(true);
  });
  it('gleicht widersprüchliche Pseudonyme zwischen getrennt gepflegten Jahren aus', () => {
    const prj = real();
    prj.years[2028].people.forEach((p, i, all) => { p.alias = all[(i + 1) % all.length].alias; });   // andere Zuordnung im zweiten Jahr
    prj.years[2028].people.push(Core.normPerson({ pk: 'NEU1', name: 'Neu, Person', alias: prj.years[2027].people[0].alias }));
    const { project, key } = Core.pseudonymizeProject(prj), byPk = new Map(key.map(k => [k.pk, k.alias]));
    expect(new Set(key.map(k => k.alias)).size).toBe(key.length);
    expect(key).toHaveLength(16);
    for (const y of [2027, 2028]) prj.years[y].people.forEach((p, i) => expect(project.years[y].people[i].pk).toBe(byPk.get(p.pk)));
  });
  it('die Schlüsseldatei stellt Namen und Nummern in allen Jahren wieder her', () => {
    const prj = real(), { project, key } = Core.pseudonymizeProject(prj);
    const hits = Core.reidentifyProject(project, key);
    expect(hits).toEqual({ 2027: 15, 2028: 15 });
    for (const y of [2027, 2028]) {
      expect(project.years[y].people.map(p => [p.pk, p.name, p.org])).toEqual(prj.years[y].people.map(p => [p.pk, p.name, p.org]));
      expect(project.years[y].meta.dataClass).toBe('real');
      expect(project.years[y].events.map(e => e.pk)).toEqual(prj.years[y].events.map(e => e.pk));
    }
  });
});
