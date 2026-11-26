import * as Core from '../../core/index.js';
import { nextFrame } from '../files.js';
import { html, raw } from '../dom.js';
import { dayLabel, fmt, fmtS, nf, opts, pill, sgn } from '../format.js';
import { IX, P, S, UI, commit, nameOf, pName } from '../state.js';
import { toast } from '../dialogs.js';
import { ACT, CHG, TIP, VIEWS } from '../registry.js';
import { render } from '../shell.js';
import { EPS, monthsRow } from './shared.js';
import { personMeta } from './year.js';

/* ==========================================================================
 * Ansichten · Lehrgänge, Personen & Cluster, Ausbildungswege
 * ========================================================================== */

// ---------- Lehrgänge ----------------------------------------------------------
const tecEligible = () => S.people.filter(p => p.cluster === '5' && p.level === 'TEC' && !Core.isLocked(p));
function tecState() {
  if (!UI.tec) UI.tec = { sel: null, target: '', from: S.settings.start, to: S.meta.year + '-12-17', len: 10, threshold: 'zero', group: 'max', minGroup: 6, maxGroup: 12,
    avoidSchool: true, freePolicy: 'adjust', ignoreReplaceable: true, sort: 'group', nonOverlap: true, max: 12, name: 'TEC Lehrgang', type: 'Theorie', mStart: '', mEnd: '', check: null };
  return UI.tec;
}
function tecSelected() { const T = tecState(), el = tecEligible().filter(p => !T.target || p.target === T.target); return T.sel ? el.filter(p => T.sel.has(p.pk)) : el; }
const tecOpts = T => ({ threshold: T.threshold, avoidSchool: T.avoidSchool, freePolicy: T.freePolicy, ignoreReplaceable: T.ignoreReplaceable, group: T.group, minGroup: T.minGroup, maxGroup: T.group === 'max' ? T.maxGroup : 0 });
function issueText(i) {
  if (i.text) return i.cat + ': ' + i.text;
  const day = i.d !== undefined ? fmtS(IX.cal.iso[i.d]) : '';
  if (i.cat === 'Kapazitätsgrenze') return day + ' ' + Core.kShift(i.k) + ': ' + nf(i.after, 1) + ' nach Lehrgang, Grenze ' + nf(i.lim) + ' (' + i.heads + ' Teilnehmer)';
  if (i.cat === 'Kapazität offen') return 'Kapazität nicht prüfbar am ' + day + ' (' + Core.kArea(i.k) + ' / ' + Core.kShift(i.k) + ')';
  if (i.cat === 'Ferien') return 'Ferien am ' + day;
  return i.cat + ': ' + nameOf(i.pk) + ' am ' + day;
}
const marginCell = v => v === null ? html`<td class="n muted">–</td>` : html`<td class="n ${v < -EPS ? 'd-crit' : ''}"><b>${sgn(v)}</b></td>`;
function tecCheckBox(T) {
  const a = T.check; if (!a) return html`<div class="note">Zeitraum eingeben und prüfen, oder unten einen Vorschlag übernehmen.</div>`;
  const cats = new Map(); for (const i of a.issues) cats.set(i.cat, (cats.get(i.cat) || 0) + 1);
  return html`<div class="note ${a.ok ? 'good' : 'crit'}"><b>${a.ok ? 'Möglich' : 'Nicht möglich'}</b> · ${fmt(a.start)} – ${fmt(a.end)} · ${a.days.length} Lehrgangstage · ${a.pks.length}${a.asked !== a.pks.length ? ' von ' + a.asked : ''} Teilnehmer
    ${a.minMargin !== null ? html`<br>Kleinste Reserve zum 0-Punkt ${sgn(a.zeroMargin)} · zum Minimum ${sgn(a.minMargin)}` : ''}
    ${a.adjust || a.offShift ? html`<br>${a.adjust ? nf(a.adjust) + ' Personentage liegen auf dienstfreien Tagen (Dienstplananpassung nötig). ' : ''}${a.offShift ? nf(a.offShift) + ' Personentage betreffen Spät- oder Nachtdienst.' : ''}` : ''}
    ${a.issues.length ? html`<br>${[...cats].map(([c, n]) => c + ' ' + n + '×').join(' · ')}<details><summary class="small">Einzelheiten (${a.issues.length})</summary><div class="small">${a.issues.slice(0, 40).map(i => html`<div>${issueText(i)}</div>`)}${a.issues.length > 40 ? '…' : ''}</div></details>` : ''}
    ${a.dropped.length ? html`<details><summary class="small">Nicht in der Gruppe (${a.dropped.length})</summary><div class="small">${a.dropped.map(x => html`<div>${nameOf(x.pk)}: ${x.cats.join(', ')}</div>`)}</div></details>` : ''}</div>`;
}
VIEWS.courses = {
  render() {
    const T = tecState(), el = tecEligible(), shown = el.filter(p => !T.target || p.target === T.target), sel = tecSelected(), R = UI.tecResult, yr = String(S.meta.year);
    const targets = [...new Set(el.map(p => p.target).filter(Boolean))].sort();
    const inp = (f, type, v, extra = '') => html`<input type="${type}" data-chg="tec" data-f="${f}" value="${v ?? ''}" ${raw(extra)}>`;
    const chk = (f, label) => html`<label class="c"><input type="checkbox" data-chg="tec" data-f="${f}" ${T[f] === true || T[f] === 'adjust' ? raw('checked') : ''}> ${label}</label>`;
    let result = html`<div class="empty"><b>Noch keine Suche gestartet</b>Teilnehmer und Zeitraum wählen, dann „Mögliche Zeiträume berechnen“.</div>`;
    if (R) {
      const cells = new Array(IX.n).fill('');
      for (const a of R.all) cells[IX.cal.idx(a.start)] = a.ok ? 'ok' : R.alt.has(a.start) ? 'alt' : 'no';
      const reasons = new Map(); for (const a of R.all) if (!a.ok) for (const c of new Set(a.issues.map(i => i.cat))) reasons.set(c, (reasons.get(c) || 0) + 1);
      const okN = R.all.filter(a => a.ok).length, maxR = Math.max(1, ...reasons.values());
      const best = R.picks.length ? R.picks : R.all.slice().sort((a, b) => a.issues.length - b.issues.length || (b.minMargin ?? -99) - (a.minMargin ?? -99)).slice(0, 8);
      result = html`
        <div class="ampel" style="--n:${IX.n};--lab:86px"><span></span><div class="months">${monthsRow()}</div>
          <span class="lab">Starttage</span><div class="cells" style="height:18px" data-tk="tecstart" data-act="tec-cell">${raw(cells.map(c => '<i' + (c ? ' style="background:' + { ok: 'var(--series)', alt: 'var(--series-soft)', no: 'var(--line-2)' }[c] + '"' : '') + '></i>').join(''))}</div>
          <span class="lab">Ferien</span><div class="cells band">${raw(Array.from(IX.school, v => v ? '<i class="on"></i>' : '<i></i>').join(''))}</div></div>
        <div class="legend" style="margin:8px 0 12px"><span><i class="sw" style="background:var(--series)"></i>Start möglich (${R.params.threshold === 'zero' ? '0-Punkt' : 'Minimum'} eingehalten)</span>${R.params.threshold === 'zero' ? html`<span><i class="sw" style="background:var(--series-soft)"></i>nur gegenüber Minimum möglich</span>` : ''}<span><i class="sw" style="background:var(--line-2)"></i>nicht möglich</span></div>
        <p class="ink2" style="margin-bottom:10px"><b>${nf(okN)}</b> von ${nf(R.checked)} geprüften Starttagen sind möglich${R.params.group === 'max' ? ' (Gruppe ab ' + R.params.minGroup + ' Personen)' : ' für alle ' + R.params.pks.length + ' gewählten Personen gemeinsam'}. ${R.picks.length ? 'Die ' + R.picks.length + ' besten Vorschläge:' : ''}</p>
        ${!okN ? html`<div class="note crit" style="margin-bottom:12px"><b>Kein sicherer Zeitraum gefunden.</b> Häufigste Hinderungsgründe (Anzahl betroffener Starttage):
          <div class="meter" style="margin-top:8px;grid-template-columns:minmax(120px,1fr) minmax(60px,2fr) 40px">${[...reasons].sort((a, b) => b[1] - a[1]).map(([c, v]) => html`<span class="nm">${c}</span><span class="tr"><i style="width:${v / maxR * 100}%"></i></span><span class="vv">${v}</span>`)}</div>
          <p style="margin-top:8px">${R.params.group === 'all' ? 'Tipp: „Größtmögliche Gruppe bilden“ wählen – dann wird je Termin geprüft, wer teilnehmen kann. ' : 'Mindestgröße senken, '}Ferienfilter lösen, Grenze auf Minimum stellen oder den Suchzeitraum erweitern. Unten die konfliktärmsten Alternativen – nicht freigegeben.</p></div>` : ''}
        <div class="tblwrap"><table class="tbl"><thead><tr><th>#</th><th>Zeitraum</th><th class="n">Tage</th><th class="n">Gruppe</th><th class="n">Reserve 0-Punkt</th><th class="n">Reserve Minimum</th><th>Dienstplan</th><th>Stand</th><th></th></tr></thead><tbody>
          ${best.map((a, i) => html`<tr><td class="n">${i + 1}</td><td class="nowrap"><b>${fmtS(a.start)} – ${fmt(a.end)}</b>${a.school ? html` <span class="muted xs">${a.school} Ferientage</span>` : ''}</td><td class="n">${a.days.length}</td><td class="n">${a.pks.length}${a.asked !== a.pks.length ? html` <span class="muted">von ${a.asked}</span>` : ''}</td>${marginCell(a.zeroMargin)}${marginCell(a.minMargin)}
            <td class="small muted">${a.adjust ? a.adjust + ' Anpassungen' : 'ohne Anpassung'}${a.offShift ? ' · ' + a.offShift + ' Spät/Nacht' : ''}</td><td>${a.ok ? pill('möglich', 'good') : pill(a.issues.length + ' Hindernisse', 'crit')}</td>
            <td><button class="btn sm" data-act="tec-use" data-s="${a.start}">Prüfen und übernehmen</button></td></tr>`)}</tbody></table></div>`;
    }
    return html`
    <div class="view-head"><div><h1>Lehrgänge planen</h1><p>Zusammenhängende Lehrgangszeiträume für Cluster 5 · Zielstufe TEC. Jeder Zeitraum wird Tag für Tag gegen die Kapazitätsgrenze geprüft – inklusive Abwesenheiten, bestehender Termine sowie Kranken- und Stressreserve.</p></div></div>
    ${!el.length ? html`<div class="card empty"><b>Keine Personen für TEC-Lehrgänge</b>Unter „Personen & Cluster“ Cluster 5, Zielstufe TEC und ein Zielmuster setzen.</div>` : html`
    <div class="gridA" style="margin-bottom:14px">
      <div class="card"><h3>Teilnehmer und Suche</h3><div class="sub">${sel.length} von ${shown.length} Personen ausgewählt</div>
        <div class="row" style="margin-bottom:8px"><button class="chip" data-act="tec-target" data-t="" aria-pressed="${!T.target}">Alle Muster <b>${el.length}</b></button>${targets.map(t => html`<button class="chip" data-act="tec-target" data-t="${t}" aria-pressed="${T.target === t}">${t} <b>${el.filter(p => p.target === t).length}</b></button>`)}
          <span class="sp"></span><button class="btn sm" data-act="tec-all">Alle</button><button class="btn sm" data-act="tec-none">Keine</button></div>
        <div class="checks">${shown.map(p => html`<label class="c" data-tip="${personMeta(p)}"><input type="checkbox" data-chg="tec-person" data-pk="${p.alias}" ${!T.sel || T.sel.has(p.pk) ? raw('checked') : ''}> ${pName(p)} <span class="muted">${p.target}</span></label>`)}</div>
        <div class="form" style="margin-top:12px">
          <label class="f">Suche von${inp('from', 'date', T.from, 'min="' + yr + '-01-01" max="' + yr + '-12-31"')}</label><label class="f">Suche bis${inp('to', 'date', T.to, 'min="' + yr + '-01-01" max="' + yr + '-12-31"')}</label>
          <label class="f">Lehrgangstage${inp('len', 'number', T.len, 'min="1" max="60"')}</label>
          <label class="f">Kapazitätsgrenze<select data-chg="tec" data-f="threshold">${opts([['zero', '0-Punkt'], ['min', 'Minimum']], T.threshold)}</select></label>
          <label class="f">Gruppe<select data-chg="tec" data-f="group">${opts([['max', 'Größtmögliche Gruppe bilden'], ['all', 'Alle Ausgewählten gemeinsam']], T.group)}</select></label>
          ${T.group === 'max' ? html`<label class="f">Mindestgröße${inp('minGroup', 'number', T.minGroup, 'min="1" max="200"')}</label><label class="f">Plätze (max.)${inp('maxGroup', 'number', T.maxGroup, 'min="1" max="200"')}</label>` : ''}
          <label class="f">Vorschläge sortieren<select data-chg="tec" data-f="sort">${opts([['group', 'Größte Gruppe'], ['reserve', 'Größte Reserve'], ['early', 'Frühester Termin']], T.sort)}</select></label>
          <label class="f">Anzahl Vorschläge${inp('max', 'number', T.max, 'min="1" max="50"')}</label>
        </div>
        <div class="stack" style="gap:7px;margin:12px 0">
          ${chk('avoidSchool', 'Ferien vermeiden')}
          ${chk('ignoreReplaceable', 'Berechnete und Szenariotermine der Teilnehmer dürfen weichen (werden bei Übernahme entfernt und neu geplant)')}
          ${chk('freePolicy', 'Dienstfreie Tage im Lehrgang zulassen (Dienstplananpassung, kein Produktionsverlust)')}
          ${chk('nonOverlap', 'Nur überschneidungsfreie Vorschläge zeigen')}
        </div>
        <button class="btn primary" data-act="tec-find">Mögliche Zeiträume berechnen</button>
      </div>
      <div class="card"><h3>Zeitraum direkt prüfen</h3><div class="sub">Für einen festen Termin oder einen übernommenen Vorschlag</div>
        <div class="form"><label class="f" style="grid-column:1/-1">Lehrgangsname${inp('name', 'text', T.name, 'maxlength="80"')}</label>
          <label class="f">Art<select data-chg="tec" data-f="type">${opts(['Theorie', 'Praxis', 'Basic Knowledge', 'FG650'], T.type)}</select></label><span></span>
          <label class="f">Beginn${inp('mStart', 'date', T.mStart, 'min="' + yr + '-01-01" max="' + yr + '-12-31"')}</label><label class="f">Ende${inp('mEnd', 'date', T.mEnd, 'min="' + yr + '-01-01" max="' + yr + '-12-31"')}</label></div>
        <div class="row" style="margin:12px 0"><button class="btn" data-act="tec-check">Kapazität prüfen</button><button class="btn primary" data-act="tec-add" ${T.check && T.check.ok ? '' : raw('disabled')}>Lehrgang eintragen</button></div>
        ${tecCheckBox(T)}
        <p class="small muted" style="margin-top:10px">Eingetragene Lehrgänge sind fixierte Termine der Art „${T.type}“ mit vollem Teilnehmerverlust und zählen zum Ausbildungsweg. Danach „Neu berechnen“, damit die übrigen Schritte um den Lehrgang herum geplant werden.</p>
      </div>
    </div>
    <div class="card"><h3>Mögliche Zeiträume</h3><div class="sub">Jeder Arbeitstag im Suchzeitraum als möglicher Lehrgangsbeginn</div>${result}</div>`}`;
  }
};
CHG.tec = t => {
  const T = tecState(), f = t.dataset.f;
  if (t.type === 'checkbox') T[f] = f === 'freePolicy' ? (t.checked ? 'adjust' : 'block') : t.checked;
  else if (t.type === 'number') T[f] = Core.clamp(Math.round(+t.value) || 1, 1, 200);
  else T[f] = t.value;
  if (!['name', 'sort', 'max', 'nonOverlap'].includes(f)) T.check = null;
  if (['sort', 'max', 'nonOverlap'].includes(f) && UI.tecResult) UI.tecResult.picks = Core.pickSlots(UI.tecResult.all.filter(a => a.ok), { sort: T.sort, nonOverlap: T.nonOverlap, max: T.max, threshold: T.threshold });
  render();
};
CHG['tec-person'] = t => { const T = tecState(); if (!T.sel) T.sel = new Set(tecEligible().map(p => p.pk)); const pk = P(t.dataset.pk)?.pk; t.checked ? T.sel.add(pk) : T.sel.delete(pk); T.check = null; render(); };
ACT['tec-target'] = t => { const T = tecState(); T.target = t.dataset.t; T.check = null; render(); };
ACT['tec-all'] = () => { const T = tecState(); T.sel = null; T.check = null; render(); };
ACT['tec-none'] = () => { const T = tecState(); T.sel = new Set(); T.check = null; render(); };
ACT['tec-find'] = async () => {
  const T = tecState(), pks = tecSelected().map(p => p.pk);
  if (!pks.length) return toast('Bitte mindestens eine Person auswählen', 'crit');
  if (!Core.validDate(T.from) || !Core.validDate(T.to) || T.to < T.from) return toast('Suchzeitraum prüfen', 'crit');
  toast('Zeiträume werden geprüft …'); await nextFrame();
  const o = { ...tecOpts(T), pks, from: T.from, to: T.to, len: T.len }, r = Core.courseSearch(S, IX, o), alt = new Set();
  if (T.threshold === 'zero') for (const a of Core.courseSearch(S, IX, { ...o, threshold: 'min' }).all) if (a.ok) alt.add(a.start);
  UI.tecResult = { ...r, alt, params: o, picks: Core.pickSlots(r.all.filter(a => a.ok), { sort: T.sort, nonOverlap: T.nonOverlap, max: T.max, threshold: T.threshold }) };
  render();
  const ok = r.all.filter(a => a.ok).length; toast(ok ? ok + ' mögliche Starttage gefunden (' + r.checked + ' geprüft)' : 'Kein sicherer Zeitraum – Hinderungsgründe werden angezeigt', ok ? '' : 'crit');
};
TIP.tecstart = (target, el) => {
  const R = UI.tecResult; if (!R || !el || el.tagName !== 'I') return null;
  const d = Array.prototype.indexOf.call(target.children, el), a = R.all.find(x => x.start === IX.cal.iso[d]);
  if (!a) return html`<b>${dayLabel(d)}</b><br><span class="k">kein möglicher Starttag (Wochenende, Feiertag oder außerhalb der Suche)</span>`;
  const cats = [...new Set(a.issues.map(i => i.cat))];
  return html`<b>Start ${dayLabel(d)}</b><br>bis ${fmt(a.end)} · ${a.pks.length}${a.asked !== a.pks.length ? ' von ' + a.asked : ''} Teilnehmer<br>${a.ok ? html`Möglich · Reserve 0-Punkt ${a.zeroMargin !== null ? sgn(a.zeroMargin) : '–'}` : html`Nicht möglich: ${cats.join(', ')}${R.alt.has(a.start) ? html`<br><span class="k">gegenüber Minimum möglich</span>` : ''}`}`;
};
function tecUse(start) {
  const T = tecState(), R = UI.tecResult, a = R && R.all.find(x => x.start === start); if (!a) return;
  T.mStart = a.start; T.mEnd = a.end; T.check = a; render(); toast('Vorschlag übernommen – „Lehrgang eintragen“ legt die Termine an');
}
ACT['tec-use'] = t => tecUse(t.dataset.s);
ACT['tec-cell'] = (t, e) => { if (e.target.tagName === 'I') tecUse(IX.cal.iso[Array.prototype.indexOf.call(t.children, e.target)]); };
ACT['tec-check'] = () => { const T = tecState(); T.check = Core.courseAssess(S, IX, { ...tecOpts(T), pks: tecSelected().map(p => p.pk), start: T.mStart, end: T.mEnd }); render(); };
ACT['tec-add'] = () => {
  const T = tecState(), a = T.check; if (!a || !a.ok) return toast('Zuerst einen möglichen Zeitraum prüfen', 'crit');
  const evs = Core.courseEvents(IX, a, { name: T.name.trim() || 'TEC Lehrgang', type: T.type, kind: 'TEC' }), pkset = new Set(a.pks), dayset = new Set(a.days);
  let removed = 0;
  commit('', () => {
    if (T.ignoreReplaceable) S.events = S.events.filter(e => {
      if (!pkset.has(e.pk) || !(e.auto || e.synthetic)) return true;
      const hit = e.type === T.type || (IX.evDays.get(e.id) || []).some(d => dayset.has(d));
      if (hit) removed++; return !hit;
    });
    S.events.push(...evs);
  });
  T.check = null; UI.tecResult = null; render();
  toast('Lehrgang für ' + evs.length + ' Personen eingetragen' + (removed ? ' · ' + removed + ' verschiebbare Termine entfernt' : '') + '. Jetzt neu berechnen, damit die übrigen Schritte passen.', '', { label: 'Neu berechnen', run: ACT.plan });
};
