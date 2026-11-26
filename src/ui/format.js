import * as Core from '../core/index.js';
import { html, raw } from './dom.js';
import { IX } from './state.js';

// ---------- Formatierung ---------------------------------------------------
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MONL = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const nf = (v, d = 0) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
export const sgn = (v, d = 1) => (v >= -0.049 ? '+' : '−') + nf(Math.abs(v), d);
export const fmt = Core.fmtDE, fmtS = Core.fmtShort;
export const dayLabel = d => WD[IX.cal.dow[d]] + '., ' + fmt(IX.cal.iso[d]);
export const tcls = t => 't-' + String(t).replace(/[^A-Za-z0-9]/g, '');
export const TSHORT = { 'Theorie': 'Theorie', 'Praxis': 'Praxis', 'Practical Logbook': 'Logbook', 'FitCheck': 'FitCheck', 'Vorbereitung': 'Vorb.', 'ICA': 'ICA', 'Basic Knowledge': 'Basic', 'FG650': 'FG650', 'Sonstiges': 'Sonst.' };
export const LEGEND_TYPES = ['Theorie', 'Praxis', 'Practical Logbook', 'FitCheck', 'Vorbereitung', 'ICA', 'Basic Knowledge', 'FG650', 'Sonstiges'];
export const REPORT_STATUS = { planned: ['Neu geplant', 'good'], kept: ['Durch fixierte Termine abgedeckt', 'good'], partial: ['Teilweise geplant', 'warn'], open: ['Offen', 'crit'], blocked: ['Blockiert', 'crit'], skipped: ['Nicht geplant', ''] };
export const ROUTE_STATE = { complete: ['Vollständig geplant', 'good'], partial: ['Teilweise geplant', 'warn'], none: ['Ohne Termine', 'crit'], locked: ['Ausgeschlossen', ''], unassigned: ['Cluster offen', ''] };
export const DATA_CLASS = { demo: ['Demo-Daten · synthetisch', 'info'], real: ['Echtdaten · nur lokal', 'warn'], pseudo: ['Pseudonymisiert', 'good'], empty: ['Leeres Projekt', ''] };
export const clusterLabel = k => k === 'offen' ? 'Zuordnung offen' : k === 'ausgeschlossen' ? 'Ausgeschlossen' : k + ' · ' + (Core.CLUSTERS[k] || k);
export const originOf = e => e.auto ? 'berechnet' : e.synthetic ? 'Szenario' : 'fixiert';
export const pill = (text, cls = '') => html`<span class="pill ${cls}">${cls ? raw('<i></i>') : ''}${text}</span>`;
export const opts = (list, sel) => list.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return html`<option value="${v}" ${String(v) === String(sel ?? '') ? raw('selected') : ''}>${l}</option>`; });
