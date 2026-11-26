/**
 * Brücke zum Desktop-Programm. electron/preload.cjs stellt sie als window.m1desktop bereit;
 * in der Einzeldatei-Variante für den Browser ist sie null und alles läuft über Browser-Mittel.
 */
export const desktop = (typeof window !== 'undefined' && window.m1desktop) || null;
export const isDesktop = !!desktop;
