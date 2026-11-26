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
export { LEGEND_TYPES, TSHORT, tcls, tclsBase, tname } from './measure-labels.js';
import { tname } from './measure-labels.js';
/** Auswahlliste von Maßnahmen: Wert ist der Name, angezeigt wird die Bezeichnung. */
export const typeOpts = list => list.map(t => [t, tname(t)]);
const tagged = (labels, cls) => Object.fromEntries(Object.keys(labels).map(k => [k, [labels[k], cls[k] || '']]));
export const REPORT_STATUS = tagged(Core.REPORT_LABELS, { planned: 'good', kept: 'good', partial: 'warn', open: 'crit', blocked: 'crit' });
export const ROUTE_STATE = tagged(Core.ROUTE_LABELS, { complete: 'good', partial: 'warn', none: 'crit' });
export const DATA_CLASS = tagged(Core.DATA_CLASS_LABELS, { demo: 'info', real: 'warn', pseudo: 'good' });
export const clusterLabel = k => k === 'offen' ? 'Zuordnung offen' : k === 'ausgeschlossen' ? 'Ausgeschlossen' : k + ' · ' + (Core.CLUSTERS[k] || k);
export const originOf = Core.originOf;
export const pill = (text, cls = '') => html`<span class="pill ${cls}">${cls ? raw('<i></i>') : ''}${text}</span>`;
export const opts = (list, sel) => list.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return html`<option value="${v}" ${String(v) === String(sel ?? '') ? raw('selected') : ''}>${l}</option>`; });
