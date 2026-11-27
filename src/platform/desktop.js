/**
 * Brücke zum Desktop-Programm. electron/preload.cjs stellt sie als window.m1desktop bereit;
 * in der Einzeldatei-Variante für den Browser ist sie null und alles läuft über Browser-Mittel.
 */
export const desktop = (typeof window !== 'undefined' && window.m1desktop) || null;
export const isDesktop = !!desktop;
/**
 * Versionsnummer des Programms. Im Desktop-Programm meldet sie das installierte Programm selbst, sonst steht sie seit dem
 * Bau in der Datei. Leer nur beim Start ohne Build (Tests des Rechenkerns).
 */
export const APP_VERSION = String((desktop && desktop.info && desktop.info.version) || (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''));

/** Fehleraufzeichnung im Desktop-Programm: merkt sich den Namen der zuletzt ausgelösten Aktion (keine Inhalte). */
export const trace = name => { if (desktop && desktop.trace) desktop.trace(name); };
/**
 * Schreibt einen Programmfehler ins Fehlerprotokoll: Art des Fehlers und die Stelle im Programmcode.
 * Der Meldungstext wird nur bei Programmfehlern (TypeError usw.) übernommen – eigene Meldungen können Namen enthalten.
 */
export function logError(err, where) {
  if (!desktop || !desktop.log) return;
  const e = err instanceof Error ? err : null, bug = !!e && e.constructor !== Error;
  const stack = e && e.stack ? e.stack.split('\n').filter(l => /^\s*at /.test(l)).slice(0, 8).join('\n') : '';
  desktop.log(where + ': ' + (e ? e.name : typeof err) + (bug ? ' – ' + e.message : '') + (stack ? '\n' + stack : ''));
}
