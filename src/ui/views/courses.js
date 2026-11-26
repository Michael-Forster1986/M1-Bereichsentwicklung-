import * as Core from '../../core/index.js';
import { csvDownload, nextFrame, pickFile, templateDownload } from '../files.js';
import { $, html, raw } from '../dom.js';
import { TSHORT, dayLabel, fmt, fmtS, nf, opts, pill, sgn, tcls, tname, typeOpts } from '../format.js';
import { CONF, IX, P, S, UI, collator, commit, nameOf, pName, privacy, sortKey } from '../state.js';
import { closeModal, confirmDlg, openModal, toast } from '../dialogs.js';
import { ACT, CHG, TIP, VIEWS } from '../registry.js';
import { render } from '../shell.js';
import { capCells, capClass, capLegend, monthsRow } from './shared.js';
import { personMeta } from './year.js';
import { importPreview, readRows } from './data.js';

/* ==========================================================================
 * Ansicht · Lehrgänge
 * Lehrgänge finden als zusammenhängender Block für eine Gruppe statt. Die Ansicht führt von links oben
 * nach rechts unten: Bedarf → Termine im Jahr → beste Zeiträume → Teilnehmer.
 * ========================================================================== */
const state = () => UI.tec || (UI.tec = { sel: '', prop: null });
const courseOf = id => S.courses.find(c => c.id === id) || null;
const span = c => fmtS(c.start) + ' – ' + fmt(c.end);
const groupLabel = g => (TSHORT[g.type] || g.type) + (g.target ? ' · ' + g.target : '');
/** Vorschlag für die Bezeichnung: Cluster 5 mit Zielmuster sind TEC-Lehrgänge, sonst der CAT-A-Kursrahmen. */
const defaultTitle = (type, target) => (target ? 'TEC ' + target + ' ' : type === 'Theorie' || type === 'Praxis' ? 'CAT A ' : '') + type;
function uniqueTitle(base) {
  const used = new Set(S.courses.map(c => c.title));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(base + ' ' + n)) return base + ' ' + n;
}
const select = id => { state().sel = id; };

// ---------- Kennzahlen und Bedarf ----------------------------------------------------
function demandCard(demand) {
  if (!demand.length) return html`<div class="card" style="margin-bottom:14px"><h3>1 · Bedarf</h3><div class="note">Derzeit verlangt kein Ausbildungsweg einen Lehrgang. Lehrgänge gehören zum Weg „Cluster 5 · Zielstufe TEC“ (Theorie, dann Praxis); Cluster 3 und 4B brauchen den Praxis-Lehrgang als Voraussetzung. Die Wege stellen Sie unter „Ausbildungswege“ ein.</div></div>`;
  return html`<div class="card" style="margin-bottom:14px"><h3>1 · Bedarf</h3><div class="sub">Wer laut Ausbildungsweg welchen Lehrgang braucht – und wer schon einen Platz hat</div>
    <div class="demand">${demand.map(g => { const pct = g.all.length ? g.placed.length / g.all.length * 100 : 0; return html`
      <div class="dm ${g.open.length ? '' : 'done'}"><div class="dm-h"><i class="sw ${tcls(g.type)}"></i><b>${tname(g.type)}</b>${g.target ? html`<span class="pill info">${g.target}</span>` : ''}<span class="sp"></span><span class="muted small">${g.days ? g.days + ' Tage' : 'Dauer offen'}</span></div>
        <div class="dm-n"><b>${nf(g.open.length)}</b><span>${g.open.length === 1 ? 'Person braucht' : 'Personen brauchen'} noch einen Platz</span></div>
        <div class="dm-bar" role="img" aria-label="${g.placed.length} von ${g.all.length} haben einen Platz"><i style="width:${pct}%"></i></div>
        <div class="small ink2">${nf(g.placed.length)} von ${nf(g.all.length)} haben einen Platz${g.prereq ? ' · Voraussetzung für Cluster 3 / 4B' : ''}</div>
        <div class="row" style="margin-top:8px">${g.open.length ? html`<button class="btn sm primary" data-act="crs-propose" data-k="${g.key}" data-tip="Sucht die Zeiträume, in denen die größte Gruppe teilnehmen kann, ohne dass die Produktion unter die Grenze fällt">Beste Zeiträume berechnen</button>` : html`<span class="pill good"><i></i>gedeckt</span>`}
          <button class="btn sm" data-act="crs-new" data-t="${g.type}" data-target="${g.target}">Termin anlegen</button></div></div>`; })}</div></div>`;
}

// ---------- Zeitleiste ----------------------------------------------------------------
function timeline(sel) {
  const n = IX.n, T = state();
  const lane = c => { const ds = Core.courseDayList(IX, c), a = Math.max(0, IX.cal.idx(c.start)), b = Math.min(n - 1, IX.cal.idx(c.end)), m = Core.courseMembers(S, c.id), full = c.seats != null && m.length >= c.seats;
    const bad = m.some(e => CONF.get(e.id)?.hard.length);
    return html`<button class="lab crs-lab ${c.id === sel ? 'on' : ''}" data-act="crs-select" data-id="${c.id}" data-tip="${c.title}">${c.title}</button>
      <div class="cells lane"><button class="cbar ${tcls(c.type)} ${c.id === sel ? 'on' : ''} ${bad ? 'cf' : ''}" style="grid-column:${a + 1} / span ${Math.max(1, b - a + 1)}" data-act="crs-select" data-id="${c.id}" data-tk="course"
        aria-label="${c.title}, ${span(c)}, ${m.length} Teilnehmer"><span>${m.length}${c.seats != null ? '/' + c.seats : ''}${full ? ' ✓' : ''}</span></button>${ds.length ? '' : ''}</div>`; };
  const ghost = (a, i) => { const x = IX.cal.idx(a.start), y = IX.cal.idx(a.end); return html`<span class="lab crs-lab muted">Vorschlag ${i + 1}</span><div class="cells lane"><button class="cbar ghost" style="grid-column:${x + 1} / span ${y - x + 1}" data-act="crs-prop-focus" data-i="${i}" data-tip="Vorschlag: ${fmtS(a.start)} – ${fmt(a.end)} · ${a.pks.length} Teilnehmer"><span>${a.pks.length}</span></button></div>`; };
  return html`<div class="card" style="margin-bottom:14px"><div class="row"><h3 style="font-size:14.5px;font-weight:650">2 · Lehrgänge im Jahr ${S.meta.year}</h3><span class="sp"></span>
      <button class="btn sm" data-act="crs-import" data-tip="CSV oder Excel: Lehrgang; Art; Zielmuster; Beginn; Ende; Plätze – optional je Zeile ein Teilnehmer">Lehrgangstermine einspielen</button>
      <button class="btn sm" data-act="crs-tpl">Leere Vorlage</button><button class="btn sm" data-act="crs-export" ${S.courses.length ? '' : raw('disabled')}>CSV</button>
      <button class="btn sm primary" data-act="crs-new">Lehrgang anlegen</button></div>
    <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 10px">Jeder Balken ist ein Lehrgang; die Zahl zeigt belegte und vorhandene Plätze. Darüber die Kapazität je Dienst – so sehen Sie, in welche Zeit ein Lehrgang fällt. Balken anklicken zum Bearbeiten.</div>
    <div class="ampel crs-time" style="--n:${n};--lab:168px"><span></span><div class="months">${monthsRow()}</div>
      ${[0, 1, 2].map(k => html`<span class="lab">${Core.kShift(k)}</span><div class="cells" style="height:10px" data-tk="capcell" data-k="${k}">${capCells(k)}</div>`)}
      <span class="lab">Ferien</span><div class="cells band">${raw(Array.from(IX.school, v => v ? '<i class="on"></i>' : '<i></i>').join(''))}</div>
      ${S.courses.map(lane)}${T.prop ? T.prop.res.courses.map(ghost) : ''}</div>
    ${S.courses.length || T.prop ? '' : html`<div class="empty" style="padding:18px"><b>Noch keine Lehrgänge</b>Termine einspielen, einen Lehrgang anlegen oder oben „Beste Zeiträume berechnen“.</div>`}
    <div style="margin-top:10px">${capLegend()}</div></div>`;
}
TIP.course = t => {
  const c = courseOf(t.dataset.id); if (!c) return null;
  const m = Core.courseMembers(S, c.id), days = Core.courseDayList(IX, c);
  return html`<b>${c.title}</b> <span class="k">${tname(c.type)}${c.target ? ' · ' + c.target : ''}</span><br>${fmt(c.start)} – ${fmt(c.end)} · ${days.length} Lehrgangstage<br>${m.length}${c.seats != null ? ' von ' + c.seats + ' Plätzen belegt' : ' Teilnehmer'}${c.synthetic ? html`<br><span class="k">Szenario (simuliert)</span>` : ''}`;
};

// ---------- Vorschläge ------------------------------------------------------------------
function proposals() {
  const T = state(), Pr = T.prop; if (!Pr) return '';
  const res = Pr.res, o = Pr.params, margin = v => v === null ? '–' : sgn(v);
  return html`<div class="card" style="margin-bottom:14px" id="crsProp"><div class="row"><h3 style="font-size:14.5px;font-weight:650">3 · Beste Zeiträume für ${Pr.label}</h3><span class="sp"></span>
      <button class="btn sm" data-act="crs-prop-close">Verwerfen</button>${res.courses.length ? html`<button class="btn sm primary" data-act="crs-prop-all">Alle ${res.courses.length} übernehmen</button>` : ''}</div>
    <div class="sub" style="color:var(--ink-2);font-size:12.5px;margin:2px 0 10px">${o.len} Lehrgangstage · Gruppen von ${o.minGroup} bis ${o.maxGroup} · Grenze ${o.threshold === 'zero' ? '0-Punkt' : 'Minimum'}${o.avoidSchool ? ' · ohne Ferien' : ''}. Jeder Vorschlag hält an jedem Tag die Grenze ein; größte Gruppe zuerst.</div>
    ${res.courses.length ? html`<div class="tblwrap" style="max-height:none"><table class="tbl"><thead><tr><th>#</th><th>Zeitraum</th><th class="n">Teilnehmer</th><th class="n">Reserve 0-Punkt</th><th class="n">Reserve Minimum</th><th>Dienstplan</th><th>Wer</th><th></th></tr></thead><tbody>
      ${res.courses.map((a, i) => html`<tr><td class="n">${i + 1}</td><td class="nowrap"><b>${fmtS(a.start)} – ${fmt(a.end)}</b>${a.school ? html` <span class="muted xs">${a.school} Ferientage</span>` : ''}</td><td class="n"><b>${a.pks.length}</b></td>
        <td class="n">${margin(a.zeroMargin)}</td><td class="n">${margin(a.minMargin)}</td><td class="small muted">${a.adjust ? a.adjust + ' freie Tage anzupassen' : 'ohne Anpassung'}</td>
        <td class="small"><details><summary>${a.pks.length} Personen</summary>${a.pks.map(pk => nameOf(pk)).join(', ')}</details></td>
        <td><button class="btn sm" data-act="crs-prop-take" data-i="${i}">Übernehmen</button></td></tr>`)}</tbody></table></div>`
      : html`<div class="note crit"><b>Kein Zeitraum gefunden,</b> in dem mindestens ${o.minGroup} Personen gemeinsam teilnehmen können. Mindestgröße senken, Grenze auf „Minimum“ stellen, Ferien zulassen oder den Suchzeitraum erweitern.</div>`}
    ${res.left.length ? html`<p class="small ink2" style="margin-top:8px"><b>${nf(res.left.length)} nicht untergebracht:</b> ${res.left.slice(0, 12).map(pk => nameOf(pk)).join(', ')}${res.left.length > 12 ? ' …' : ''} – für sie fand sich kein Zeitraum mit ausreichender Gruppe.</p>` : res.courses.length ? html`<p class="small" style="margin-top:8px;color:var(--good-ink)">Alle ${nf(o.pks.length)} Personen sind untergebracht.</p>` : ''}</div>`;
}

// ---------- Ausgewählter Lehrgang -----------------------------------------------------------
function detail(c) {
  const yr = String(S.meta.year), members = Core.courseMembers(S, c.id).slice().sort((a, b) => collator.compare(nameOf(a.pk), nameOf(b.pk))), days = Core.courseDayList(IX, c);
  const cand = Core.courseCandidates(S, IX, c), a = cand.length ? Core.assessCourse(S, IX, c, cand) : null, okSet = new Set(a ? a.pks : []), why = new Map((a ? a.dropped : []).map(x => [x.pk, x.cats]));
  const free = c.seats == null ? null : Math.max(0, c.seats - members.length), d0 = Math.max(0, IX.cal.idx(c.start)), d1 = Math.min(IX.n - 1, IX.cal.idx(c.end));
  const strip = k => { let s = ''; for (let d = d0; d <= d1; d++) s += '<i class="' + (IX.work[d] ? capClass(d, k) : 'c-off') + '"></i>'; return raw(s); };
  const used = [0, 1, 2].filter(k => members.some(e => (IX.evDays.get(e.id) || []).some(d => Core.assign(IX, IX.pi.get(e.pk), d) === k)));
  const people = S.people.filter(p => !Core.isLocked(p) && !members.some(e => e.pk === p.pk) && !cand.includes(p.pk)).slice().sort((x, y) => collator.compare(sortKey(x), sortKey(y)));
  return html`<div class="card" id="crsDetail"><div class="row"><h3 style="font-size:14.5px;font-weight:650"><i class="sw ${tcls(c.type)}"></i> ${c.title}</h3>${c.synthetic ? pill('Szenario', '') : ''}<span class="sp"></span>
      <button class="btn sm danger" data-act="crs-delete" data-id="${c.id}">Lehrgang löschen</button><button class="btn sm" data-act="crs-select" data-id="">Schließen</button></div>
    <div class="form" style="margin:10px 0 12px;grid-template-columns:minmax(180px,2fr) repeat(5,minmax(110px,1fr))">
      <label class="f">Bezeichnung<input type="text" maxlength="80" value="${c.title}" data-chg="crs" data-f="title"></label>
      <label class="f">Art<select data-chg="crs" data-f="type">${opts(typeOpts(Core.courseTypesOf(S)), c.type)}</select></label>
      <label class="f" data-tip="Mit Zielmuster: Lehrgang für Cluster 5 mit genau diesem Muster (TEC). Ohne: Lehrgang der übrigen Cluster (CAT-A-Kursrahmen).">Zielmuster<select data-chg="crs" data-f="target">${opts([['', 'ohne (CAT A)'], ...Core.TARGETS], c.target)}</select></label>
      <label class="f">Beginn<input type="date" value="${c.start}" min="${yr}-01-01" max="${yr}-12-31" data-chg="crs" data-f="start"></label>
      <label class="f">Ende<input type="date" value="${c.end}" min="${yr}-01-01" max="${yr}-12-31" data-chg="crs" data-f="end"></label>
      <label class="f">Plätze<input type="number" min="1" max="500" value="${c.seats ?? ''}" placeholder="offen" data-chg="crs" data-f="seats" style="width:100%"></label></div>
    <div class="crs-strip"><div class="small ink2">${days.length} Lehrgangstage · Kapazität der betroffenen Dienste nach Abzug des Lehrgangs</div>
      ${(used.length ? used : [0]).map(k => html`<div class="row" style="gap:10px;flex-wrap:nowrap"><span class="small ink2" style="width:44px;flex:none">${Core.kShift(k)}</span><div class="cells" style="--n:${d1 - d0 + 1}" data-tk="crsday" data-k="${k}" data-d0="${d0}">${strip(k)}</div></div>`)}</div>
    <div class="grid2" style="margin-top:14px;align-items:start">
      <div><div class="row" style="margin-bottom:6px"><b>Teilnehmer</b><span class="muted">${members.length}${c.seats != null ? ' von ' + c.seats + ' Plätzen' : ''}</span></div>
        ${members.length ? html`<div class="tblwrap" style="max-height:330px"><table class="tbl"><tbody>${members.map(e => { const cf = CONF.get(e.id), p = IX.people.get(e.pk), hard = cf && cf.hard.length; return html`<tr class="${hard ? 'rowcrit' : ''}">
          <td><button class="btn ghost sm" data-act="person-open" data-pk="${p ? p.alias : ''}" style="padding:0;font-weight:600">${nameOf(e.pk)}</button><div class="muted xs">${p ? personMeta(p) : ''}</div></td>
          <td class="small">${hard ? html`<span style="color:var(--crit-ink)">${cf.hard.map(h => h[0] + (h[1] > 1 ? ' (' + h[1] + ' Tage)' : '')).join(', ')}</span>` : cf ? html`<span class="muted">${cf.soft.map(h => h[1] + ' freie Tage anzupassen').join(', ')}</span>` : html`<span class="muted">ohne Befund</span>`}${e.auto ? html` <span class="muted xs">· vom Planer zugeteilt</span>` : ''}</td>
          <td class="nowrap">${e.auto ? html`<button class="btn sm" data-act="event-fix" data-id="${e.id}" data-tip="Platz fest vergeben – bleibt bei jeder Neuberechnung">Fixieren</button> ` : ''}<button class="btn sm" data-act="crs-leave" data-id="${e.id}">Entfernen</button></td></tr>`; })}</tbody></table></div>`
          : html`<div class="note">Noch keine Teilnehmer. Rechts stehen die Personen, die diesen Lehrgang brauchen.</div>`}</div>
      <div><div class="row" style="margin-bottom:6px"><b>Wer braucht diesen Lehrgang?</b><span class="muted">${cand.length}</span><span class="sp"></span>
          ${a && a.pks.length ? html`<button class="btn sm primary" data-act="crs-fill" data-id="${c.id}" data-tip="Trägt die größte Gruppe ein, die an jedem Lehrgangstag die Grenze (0-Punkt) einhält">${free == null ? nf(a.pks.length) + ' passende eintragen' : 'Freie Plätze bestmöglich besetzen (' + nf(a.pks.length) + ')'}</button>` : ''}</div>
        ${cand.length ? html`<div class="tblwrap" style="max-height:330px"><table class="tbl"><tbody>${cand.map(pk => { const p = IX.people.get(pk), ok = okSet.has(pk), cats = why.get(pk) || []; return html`<tr>
          <td><b>${nameOf(pk)}</b><div class="muted xs">${personMeta(p)} · Priorität ${p.priority}</div></td>
          <td class="small">${ok ? pill('kann teilnehmen', 'good') : free === 0 ? html`<span class="muted">alle Plätze belegt</span>` : html`<span style="color:var(--warn-ink)">${cats.join(', ') || 'kein Platz in der besten Gruppe'}</span>`}</td>
          <td><button class="btn sm" data-act="crs-join" data-id="${c.id}" data-pk="${p.alias}" ${free === 0 ? raw('disabled') : ''}>${ok ? 'Eintragen' : 'Trotzdem eintragen'}</button></td></tr>`; })}</tbody></table></div>`
          : html`<div class="note good">Niemand wartet auf diesen Lehrgang${c.target ? ' (Zielmuster ' + c.target + ')' : ''}.</div>`}
        ${people.length ? html`<div class="row small" style="margin-top:8px"><span class="ink2">Andere Person eintragen:</span><select id="crsOther" style="max-width:220px">${opts(people.map(p => [p.alias, pName(p)]), '')}</select><button class="btn sm" data-act="crs-join-other" data-id="${c.id}" ${free === 0 ? raw('disabled') : ''}>Eintragen</button></div>` : ''}
        ${a && a.issues.length && !a.pks.length && free !== 0 ? html`<p class="small muted" style="margin-top:8px">Für die freien Plätze findet sich derzeit keine Gruppe, die an jedem Tag die Grenze einhält.</p>` : ''}</div>
    </div></div>`;
}
TIP.crsday = (target, el) => {
  if (!el || el.tagName !== 'I') return null;
  const d = +target.dataset.d0 + Array.prototype.indexOf.call(target.children, el), k = +target.dataset.k, c = Core.capInfo(IX, d, k);
  if (!IX.work[d]) return html`<b>${dayLabel(d)}</b><br><span class="k">kein Lehrgangstag (Wochenende oder Feiertag)</span>`;
  return html`<b>${dayLabel(d)}</b> · ${Core.kShift(k)}${c.known ? html`<table><tr><td>Verfügbar</td><td class="n"><b>${nf(c.net, 1)}</b></td></tr><tr><td class="k">0-Punkt ${nf(c.zero)}</td><td class="n">${sgn(c.net - c.zero)}</td></tr><tr><td class="k">Minimum ${nf(c.min)}</td><td class="n">${sgn(c.net - c.min)}</td></tr><tr><td class="k">Maßnahmen</td><td class="n k">−${nf(c.loss, 1)}</td></tr></table>` : html`<br><span class="k">Kapazität nicht prüfbar</span>`}`;
};

VIEWS.courses = {
  render() {
    const T = state(), demand = Core.courseDemand(S, IX), sel = courseOf(T.sel);
    if (T.sel && !sel) T.sel = '';
    const seats = S.courses.reduce((s, c) => s + (c.seats || 0), 0), taken = S.events.filter(e => e.courseId).length, open = demand.reduce((s, g) => s + g.open.length, 0), need = demand.reduce((s, g) => s + g.all.length, 0);
    const bad = S.events.filter(e => e.courseId && CONF.get(e.id)?.hard.length).length;
    return html`
    <div class="view-head"><div><h1>Lehrgänge planen</h1><p>Lehrgänge (TEC, CAT A, CAT Praxis …) finden als zusammenhängender Block für eine Gruppe statt. Feste Termine spielen Sie ein; für alles Übrige berechnet das Programm die besten Zeiträume und die beste Besetzung – Tag für Tag gegen die Grenze der Produktion geprüft.</p></div></div>
    <div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:14px">
      <div class="kpi"><div class="l">Lehrgänge ${S.meta.year}</div><div class="v">${nf(S.courses.length)}</div><div class="s">${nf(S.courses.reduce((s, c) => s + Core.courseDayList(IX, c).length, 0))} Lehrgangstage</div></div>
      <div class="kpi"><div class="l">Belegte Plätze</div><div class="v">${nf(taken)}</div><div class="s">${seats ? 'von ' + nf(seats) + ' vorhandenen' : 'Platzzahl nicht begrenzt'}</div></div>
      <div class="kpi ${open ? 'warn' : ''}"><div class="l">Ohne Lehrgangsplatz</div><div class="v">${nf(open)}</div><div class="s">von ${nf(need)} Personen mit Lehrgang im Weg</div></div>
      <div class="kpi ${bad ? 'crit' : ''}"><div class="l">Teilnahmen mit Konflikt</div><div class="v">${nf(bad)}</div><div class="s">Abwesenheit, Kollision oder Kapazität</div></div>
    </div>
    ${demandCard(demand)}
    ${timeline(T.sel)}
    ${proposals()}
    ${sel ? detail(sel) : html`<div class="card"><h3>${T.prop ? '4' : '3'} · Teilnehmer</h3><div class="note">Einen Lehrgang in der Zeitleiste anklicken: dann sehen Sie Teilnehmer, freie Plätze, die Kapazität an jedem Lehrgangstag und wer noch auf diesen Lehrgang wartet.</div></div>`}
    <div class="card flat" style="margin-top:14px"><label class="c"><input type="checkbox" data-chg="crs-blocks" ${S.settings.courseBlocks ? raw('checked') : ''}> <span><b>Lehrgänge nur als zusammenhängende Blöcke planen</b> (empfohlen) – „Neu berechnen“ vergibt dann Plätze in den Lehrgängen dieser Ansicht, statt Kurstage einzeln zu verteilen. Ohne passenden Termin bleibt der Schritt offen und steht im Bericht.</span></label></div>`;
  }
};

// ---------- Aktionen --------------------------------------------------------------------------
ACT['crs-select'] = t => { select(t.dataset.id); render(); if (t.dataset.id) { const el = $('#crsDetail'); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
CHG['crs-blocks'] = t => commit(t.checked ? 'Lehrgänge werden als Blöcke geplant – „Neu berechnen“ vergibt die Plätze' : 'Kurstage werden wieder einzeln verteilt', () => { S.settings.courseBlocks = t.checked; });
CHG.crs = t => {
  const c = courseOf(state().sel), f = t.dataset.f, yr = String(S.meta.year); if (!c) return;
  let v = t.value.trim();
  if ((f === 'start' || f === 'end') && (!Core.validDate(v) || !v.startsWith(yr))) { render(); return toast('Datum muss im Jahr ' + yr + ' liegen', 'crit'); }
  if (f === 'start' && v > c.end) { render(); return toast('Der Beginn liegt nach dem Ende', 'crit'); }
  if (f === 'end' && v < c.start) { render(); return toast('Das Ende liegt vor dem Beginn', 'crit'); }
  if (f === 'title' && !v) { render(); return toast('Bezeichnung fehlt', 'crit'); }
  commit('Lehrgang gespeichert', () => {
    const cur = courseOf(c.id);
    if (f === 'start' || f === 'end') Core.moveCourse(S, IX, cur, f === 'start' ? v : cur.start, f === 'end' ? v : cur.end);
    else if (f === 'seats') cur.seats = +v > 0 ? Core.clamp(Math.round(+v), 1, 500) : null;
    else { cur[f] = v; if (f === 'title' || f === 'type') for (const e of S.events) if (e.courseId === cur.id) { e.title = cur.title; e.type = cur.type; } }
  });
};
ACT['crs-new'] = t => {
  const type = Core.courseTypesOf(S).includes(t.dataset.t) ? t.dataset.t : 'Theorie', target = t.dataset.target || '', yr = String(S.meta.year);
  const cfgDays = Core.courseDemand(S, IX).find(g => g.type === type && g.target === target)?.days || '';
  openModal({ title: 'Lehrgang anlegen', body: html`
    <p class="ink2">Ein Lehrgang ist ein fester Zeitraum mit Plätzen. Teilnehmer tragen Sie danach ein – einzeln oder als beste Besetzung.</p>
    <div class="form"><label class="f" style="grid-column:1/-1">Bezeichnung<input type="text" id="cnTitle" maxlength="80" value="${uniqueTitle(defaultTitle(type, target))}" autofocus></label>
      <label class="f">Art<select id="cnType">${opts(typeOpts(Core.courseTypesOf(S)), type)}</select></label><label class="f" data-tip="Mit Zielmuster: Lehrgang für Cluster 5 mit genau diesem Muster (TEC). Ohne: Lehrgang der übrigen Cluster (CAT-A-Kursrahmen).">Zielmuster<select id="cnTarget">${opts([['', 'ohne (CAT A)'], ...Core.TARGETS], target)}</select></label>
      <label class="f">Beginn<input type="date" id="cnStart" min="${yr}-01-01" max="${yr}-12-31" value="${S.settings.start}"></label><label class="f">Ende<input type="date" id="cnEnd" min="${yr}-01-01" max="${yr}-12-31"></label>
      <label class="f">Plätze<input type="number" id="cnSeats" min="1" max="500" value="12" style="width:100%"></label></div>
    <p class="small muted">${cfgDays ? 'Der Ausbildungsweg sieht ' + cfgDays + ' Arbeitstage vor. ' : ''}Es zählen die Arbeitstage (Mo–Fr, ohne Feiertage) zwischen Beginn und Ende.</p>`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok">Lehrgang anlegen</button>`,
    handlers: { ok: () => {
      // eigene Schritte sind musterunabhängig: ein Zielmuster würde den Lehrgang für niemanden passend machen
      const type = $('#cnType').value, c = Core.normCourse({ type, title: $('#cnTitle').value, target: Core.measureOf(S, type) ? '' : $('#cnTarget').value, start: $('#cnStart').value, end: $('#cnEnd').value, seats: +$('#cnSeats').value || null }, Core.courseTypesOf(S));
      if (!c || !c.start.startsWith(yr) || !c.end.startsWith(yr)) return toast('Zeitraum prüfen: Beginn und Ende müssen im Jahr ' + yr + ' liegen', 'crit');
      closeModal();
      if (commit('Lehrgang angelegt – jetzt Teilnehmer eintragen', () => { S.courses.push(c); S.courses.sort((a, b) => a.start < b.start ? -1 : 1); })) { select(c.id); render(); }
    } } });
};
ACT['crs-delete'] = async t => {
  const c = courseOf(t.dataset.id); if (!c) return;
  const n = Core.courseMembers(S, c.id).length;
  if (!await confirmDlg('Lehrgang löschen', '„' + c.title + '“ (' + span(c) + ') wird gelöscht' + (n ? ' – mit den Terminen der ' + n + ' Teilnehmer.' : '.') + ' Mit „Rückgängig“ kommen Sie zurück.', 'Löschen', true)) return;
  select(''); commit('Lehrgang gelöscht', () => { Core.removeCourse(S, c.id); });
};
ACT['crs-leave'] = t => commit('Teilnehmer entfernt', () => { S.events = S.events.filter(e => e.id !== t.dataset.id); });
function join(c, pks, label) {
  let r = { added: 0, removed: 0 };
  commit('', () => { r = Core.joinCourse(S, IX, courseOf(c.id), pks); });
  toast(label(r) + (r.removed ? ' · ' + r.removed + ' berechnete Termine weichen – „Neu berechnen“ plant sie neu' : ''), '', r.removed ? { label: 'Neu berechnen', run: ACT.plan } : null);
}
ACT['crs-fill'] = t => {
  const c = courseOf(t.dataset.id); if (!c) return;
  const a = Core.assessCourse(S, IX, c, Core.courseCandidates(S, IX, c));
  if (!a.pks.length) return toast('Für die freien Plätze findet sich keine passende Gruppe', 'crit');
  join(c, a.pks, r => nf(r.added) + ' Teilnehmer eingetragen – die Grenze ist an jedem Lehrgangstag eingehalten');
};
ACT['crs-join'] = t => { const c = courseOf(t.dataset.id), p = P(t.dataset.pk); if (c && p) join(c, [p.pk], () => pName(p) + ' eingetragen'); };
ACT['crs-join-other'] = t => { const c = courseOf(t.dataset.id), p = P($('#crsOther')?.value); if (c && p) join(c, [p.pk], () => pName(p) + ' eingetragen'); };

// ---------- Beste Zeiträume --------------------------------------------------------------------
ACT['crs-propose'] = t => {
  const g = Core.courseDemand(S, IX).find(x => x.key === t.dataset.k); if (!g || !g.open.length) return;
  const yr = String(S.meta.year), n = g.open.length, maxG = Math.min(12, n), minG = Math.min(maxG, n >= 8 ? 4 : n >= 3 ? 2 : 1);
  openModal({ title: 'Beste Zeiträume berechnen · ' + groupLabel(g), wide: true, body: html`
    <p class="ink2">${nf(n)} ${n === 1 ? 'Person braucht' : 'Personen brauchen'} noch diesen Lehrgang. Das Programm prüft jeden möglichen Starttag: Wer kann teilnehmen, ohne dass an irgendeinem Lehrgangstag die Grenze der Produktion unterschritten wird? Es nimmt den Zeitraum mit der größten Gruppe und plant die Übrigen in weiteren Lehrgängen.</p>
    <div class="form">
      <label class="f" style="grid-column:1/-1">Bezeichnung der Lehrgänge<input type="text" id="cpTitle" maxlength="70" value="${defaultTitle(g.type, g.target)}"></label>
      <label class="f">Lehrgangstage<input type="number" id="cpLen" min="1" max="120" value="${g.days || 10}" style="width:100%"></label>
      <label class="f">Plätze je Lehrgang<input type="number" id="cpMax" min="1" max="200" value="${maxG}" style="width:100%"></label>
      <label class="f" data-tip="Kleinere Gruppen werden nicht vorgeschlagen">Mindestgröße<input type="number" id="cpMin" min="1" max="200" value="${minG}" style="width:100%"></label>
      <label class="f">Grenze<select id="cpThr">${opts([['zero', '0-Punkt (Sollbesetzung)'], ['min', 'Minimum (Untergrenze)']], 'zero')}</select></label>
      <label class="f">Frühester Beginn<input type="date" id="cpFrom" min="${yr}-01-01" max="${yr}-12-31" value="${S.settings.start}"></label>
      <label class="f">Spätestes Ende<input type="date" id="cpTo" min="${yr}-01-01" max="${yr}-12-31" value="${yr}-12-17"></label></div>
    <div class="stack" style="gap:7px;margin-top:12px">
      <label class="c"><input type="checkbox" id="cpSchool" checked> Ferien vermeiden</label>
      <label class="c"><input type="checkbox" id="cpOverlap" checked> Lehrgänge dieser Art nicht gleichzeitig (ein Lehrgang nach dem anderen)</label>
      <label class="c"><input type="checkbox" id="cpFree" checked> Dienstfreie Tage im Lehrgang zulassen (Dienstplananpassung, kein Produktionsverlust)</label></div>
    <div id="cpRun" hidden><div class="progress" style="margin-top:12px"><i style="width:60%"></i></div><p class="small muted" style="margin-top:6px">Zeiträume werden geprüft …</p></div>`,
    footer: html`<button class="btn" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="m:ok" id="cpGo">Berechnen</button>`,
    handlers: { ok: async () => {
      const o = { type: g.type, target: g.target, title: $('#cpTitle').value.trim() || defaultTitle(g.type, g.target), pks: g.open.slice(), len: Core.clamp(Math.round(+$('#cpLen').value) || 1, 1, 120),
        maxGroup: Core.clamp(Math.round(+$('#cpMax').value) || 1, 1, 200), minGroup: Core.clamp(Math.round(+$('#cpMin').value) || 1, 1, 200), threshold: $('#cpThr').value, from: $('#cpFrom').value, to: $('#cpTo').value,
        avoidSchool: $('#cpSchool').checked, nonOverlap: $('#cpOverlap').checked, freePolicy: $('#cpFree').checked ? 'adjust' : 'block' };
      if (!Core.validDate(o.from) || !Core.validDate(o.to) || o.to < o.from) return toast('Suchzeitraum prüfen', 'crit');
      if (o.minGroup > o.maxGroup) return toast('Die Mindestgröße ist größer als die Platzzahl', 'crit');
      $('#cpGo').disabled = true; $('#cpRun').hidden = false; await nextFrame(); await nextFrame();
      const res = Core.proposeCourses(S, IX, o);
      closeModal();
      state().prop = { key: g.key, label: groupLabel(g), params: o, res }; render();
      const el = $('#crsProp'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      toast(res.courses.length ? res.courses.length + (res.courses.length === 1 ? ' Lehrgang' : ' Lehrgänge') + ' vorgeschlagen · ' + nf(o.pks.length - res.left.length) + ' von ' + nf(o.pks.length) + ' Personen untergebracht' : 'Kein Zeitraum gefunden – Bedingungen lockern', res.courses.length ? '' : 'crit');
    } } });
};
function takeProposals(list) {
  const Pr = state().prop, o = Pr.params; let first = '', people = 0;
  commit('', () => {
    for (const a of list) {
      const c = Core.normCourse({ type: o.type, title: uniqueTitle(o.title), target: o.target, start: a.start, end: a.end, seats: o.maxGroup }, Core.courseTypesOf(S));
      S.courses.push(c); first = first || c.id;
      people += Core.joinCourse(S, Core.buildIndex(S), c, a.pks).added;
    }
    S.courses.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
  });
  return { first, people };
}
ACT['crs-prop-all'] = () => {
  const Pr = state().prop; if (!Pr || !Pr.res.courses.length) return;
  const n = Pr.res.courses.length, r = takeProposals(Pr.res.courses);
  state().prop = null; select(r.first); render();
  toast(n + (n === 1 ? ' Lehrgang' : ' Lehrgänge') + ' mit ' + nf(r.people) + ' Teilnehmern angelegt. Jetzt neu berechnen, damit die übrigen Schritte um die Lehrgänge herum geplant werden.', '', { label: 'Neu berechnen', run: ACT.plan });
};
ACT['crs-prop-take'] = t => {
  const Pr = state().prop, a = Pr && Pr.res.courses[+t.dataset.i]; if (!a) return;
  const r = takeProposals([a]), placed = new Set(a.pks), rest = Pr.params.pks.filter(pk => !placed.has(pk));
  // Die übrigen Vorschläge setzten diesen Lehrgang voraus: für die verbleibenden Personen neu rechnen
  const o = { ...Pr.params, pks: rest }, res = rest.length ? Core.proposeCourses(S, IX, o) : { courses: [], left: [] };
  state().prop = rest.length ? { ...Pr, params: o, res } : null; select(r.first); render();
  toast('Lehrgang mit ' + nf(r.people) + ' Teilnehmern angelegt' + (rest.length ? ' · Vorschläge für die übrigen ' + nf(rest.length) + ' neu berechnet' : ''));
};
ACT['crs-prop-close'] = () => { state().prop = null; render(); };
ACT['crs-prop-focus'] = () => { const el = $('#crsProp'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); };

// ---------- Einspielen und Ausgeben ---------------------------------------------------------------
ACT['crs-tpl'] = () => templateDownload('courses');
ACT['crs-export'] = () => {
  const rows = [];
  for (const c of S.courses) {
    const m = Core.courseMembers(S, c.id), base = [c.title, c.type, c.target, c.start, c.end, c.seats ?? ''];
    if (!m.length) rows.push([...base, '', '']);
    for (const e of m) rows.push([...base, privacy() ? IX.people.get(e.pk)?.alias : e.pk, nameOf(e.pk)]);
  }
  csvDownload('Lehrgaenge', [...Core.TEMPLATES.courses, 'Name'], rows);
};
ACT['crs-import'] = async () => {
  if (!S.people.length) return toast('Zuerst Stammdaten laden', 'crit');
  const file = await pickFile('.csv,.txt,.xlsx'); if (!file) return;
  const { rows, note } = await readRows(file, r => r.some(c => ['start', 'end'].includes(Core.HEAD[Core.normHead(c)]))), { head, rows: objs } = Core.rowsToObjects(rows), chk = Core.checkCourses(S, objs, head);
  importPreview({ title: 'Lehrgangstermine prüfen', file: file.name, chk, facts: [['Format', note], ['Lehrgänge in der Datei', nf(chk.courses.length)], ['Teilnehmer in der Datei', nf(chk.participants)],
    ['Arten', [...new Set(chk.courses.map(c => c.type))].join(', ') || '–']],
    extra: html`<p class="small ink2">Die Termine werden als feste Lehrgänge ergänzt; vorhandene Lehrgänge mit gleicher Bezeichnung und gleichem Zeitraum werden nicht verdoppelt. Arten wie „TEC“ oder „CAT A“ zählen als Theorie, „CAT Praxis“ als Praxis.</p>
      ${chk.courses.length ? html`<div class="tblwrap" style="max-height:200px;margin-top:8px"><table class="tbl"><thead><tr><th>Lehrgang</th><th>Art</th><th>Zeitraum</th><th class="n">Plätze</th><th class="n">Teilnehmer</th></tr></thead><tbody>${chk.courses.slice(0, 40).map(c => html`<tr><td>${c.title}</td><td>${c.type}${c.target ? ' · ' + c.target : ''}</td><td class="nowrap">${span(c)}</td><td class="n">${c.seats ?? '–'}</td><td class="n">${c.pks.length || '–'}</td></tr>`)}</tbody></table></div>` : ''}`,
    apply: () => { let info; commit('', () => { info = Core.applyCourses(S, chk); });
      toast(nf(info.added) + ' Lehrgänge ergänzt' + (info.updated ? ', ' + nf(info.updated) + ' vorhandene aktualisiert' : '') + (info.participants ? ' · ' + nf(info.participants) + ' Teilnehmer eingetragen' : '') + ' – offene Plätze können Sie jetzt besetzen'); } });
};
