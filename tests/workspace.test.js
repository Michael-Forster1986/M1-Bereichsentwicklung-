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
