import { AREAS, SHIFTS } from './constants.js';
import { fin } from './util.js';
import { courseDemand } from './courses.js';

// ---------- Vom Testbetrieb zur echten Planung -------------------------------------
/** Was im Stand noch simuliert oder berechnet ist (Anzahlen). */
export function simulatedParts(st) {
  return { absences: st.absences.filter(a => a.synthetic).length, scenario: st.events.filter(e => e.synthetic).length, courses: (st.courses || []).filter(c => c.synthetic).length,
    auto: st.events.filter(e => e.auto).length, roster: st.meta.simulated.roster ? Object.keys(st.roster).length : 0 };
}
/**
 * Entfernt simulierte Bestandteile. Personen mit Qualifikationen, Cluster, Zielen und Vorleistungen, Ausbildungswege,
 * Grenzwerte und Einstellungen bleiben immer erhalten.
 *   o.absences simulierte Abwesenheiten · o.scenario Szenariotermine und Szenario-Lehrgänge · o.auto berechnete Termine · o.roster simulierter Dienstplan
 */
export function removeSimulated(st, o = {}) {
  const before = simulatedParts(st), done = { absences: 0, scenario: 0, courses: 0, auto: 0, roster: 0 };
  if (o.absences) { st.absences = st.absences.filter(a => !a.synthetic); st.meta.simulated.absences = false; done.absences = before.absences; }
  if (o.scenario) {
    const gone = new Set((st.courses || []).filter(c => c.synthetic).map(c => c.id));
    st.events = st.events.filter(e => !e.synthetic && !gone.has(e.courseId));
    st.courses = (st.courses || []).filter(c => !c.synthetic);
    done.scenario = before.scenario; done.courses = before.courses;
  }
  if (o.auto) { done.auto = st.events.filter(e => e.auto).length; st.events = st.events.filter(e => !e.auto); st.report = []; st.planInfo = null; }
  if (o.roster && st.meta.simulated.roster) { st.roster = {}; st.meta.simulated.roster = false; done.roster = before.roster; }
  st.meta.assumptions = st.meta.assumptions.filter(a => !(o.absences && /Urlaub/.test(a)) && !(o.roster && /Rotation|Dienstplan aus/.test(a)) && !/frei erfunden/.test(a));
  if (st.meta.dataClass === 'demo') st.meta.dataClass = st.people.length ? 'real' : 'empty';
  return done;
}
/**
 * Bereitschaft für die echte Planung: je Baustein Zustand ('good' | 'warn' | 'crit' | 'info'), Text und Ziel in der Oberfläche.
 */
export function readiness(st, ix, sum) {
  const out = [], add = (key, title, state, text, view) => out.push({ key, title, state, text, view });
  const n = st.people.length, open = sum.clusters.offen || 0, sim = st.meta.simulated;
  if (!n) add('people', 'Personen und Cluster', 'crit', 'Noch keine Personen geladen', 'data');
  else add('people', 'Personen und Cluster', open ? 'warn' : 'good', n + ' Personen' + (open ? ' · ' + open + ' ohne Clusterzuordnung werden nicht geplant' : ' · alle zugeordnet'), 'people');
  const absReal = st.absences.filter(a => !a.synthetic).length, absSim = st.absences.length - absReal;
  add('absences', 'Urlaubsplan', absSim || sim.absences ? 'warn' : absReal ? 'good' : 'warn',
    absSim || sim.absences ? 'Abwesenheiten sind simuliert (' + absSim + ') – realen Urlaubsplan einspielen' : absReal ? absReal + ' reale Abwesenheiten' : 'Noch kein Urlaubsplan eingespielt', 'data');
  const withRoster = st.people.filter(p => st.roster[p.pk]).length;
  add('roster', 'Dienstplan', !withRoster ? (st.settings.strict ? 'crit' : 'warn') : sim.roster ? 'warn' : withRoster < n ? 'warn' : 'good',
    !withRoster ? 'Kein Dienstplan – ' + (st.settings.strict ? 'so kann nichts geplant werden' : 'es gilt der Dienst je Person') : sim.roster ? 'Schichtrhythmus ist simuliert – die Kapazität ist eine Näherung, bis der echte Dienstplan eingespielt ist'
      : withRoster < n ? 'Für ' + (n - withRoster) + ' Personen fehlt der Dienstplan' : 'Realer Dienstplan für alle Personen', 'data');
  const lim = AREAS.flatMap(a => SHIFTS.map(s => st.limits?.[a]?.[s])).filter(l => l && fin(l.min) && fin(l.zero)).length;
  add('limits', 'Grenzwerte der Produktion', lim >= 3 ? 'good' : lim ? 'warn' : 'crit', lim >= 3 ? 'Minimum und 0-Punkt für ' + lim + ' Dienste hinterlegt' : lim ? 'Nur für ' + lim + ' Dienste hinterlegt' : 'Minimum und 0-Punkt fehlen – Kapazität nicht prüfbar', 'capacity');
  add('calendar', 'Feiertage und Ferien', st.holidays.length ? 'good' : 'warn', st.holidays.length ? st.holidays.length + ' Feiertage · ' + st.school.length + ' Ferienzeiträume' : 'Keine Feiertage – Ausbildungstage können auf Feiertage fallen', 'absences');
  const demand = courseDemand(st, ix), need = demand.reduce((s, g) => s + g.all.length, 0), missing = demand.reduce((s, g) => s + g.open.length, 0), nCourses = (st.courses || []).length;
  if (!need) add('courses', 'Lehrgänge', 'info', nCourses ? nCourses + ' Lehrgänge · kein offener Bedarf' : 'Kein Ausbildungsweg verlangt derzeit einen Lehrgang', 'courses');
  else add('courses', 'Lehrgänge', missing ? 'warn' : 'good', nCourses + ' Lehrgänge · ' + (need - missing) + ' von ' + need + ' benötigten Plätzen vergeben' + (missing ? ' · ' + missing + ' Personen ohne Lehrgangsplatz' : ''), 'courses');
  const stale = st.events.some(e => e.auto) || st.report.length;
  add('plan', 'Jahresplan', !n ? 'info' : !stale ? 'warn' : sum.route.none || sum.route.partial ? 'warn' : 'good',
    !n ? 'Wird nach dem Laden der Daten berechnet' : !stale ? 'Noch nicht berechnet – „Neu berechnen“' : sum.route.complete + ' Wege vollständig · ' + sum.route.partial + ' teilweise · ' + sum.route.none + ' ohne Termine', 'report');
  return out;
}
