/*!
 * CISO Executive Agentic Enterprise Dashboard - application
 */
(function () {
  'use strict';
  const D = window.CISO_DATA, EN = window.CISO_ENGINE, KP = window.CISO_KPIS, C = window.CISO_CHARTS, XL = window.CISO_XLSX;
  const E = EN.create(D);
  const LIST = KP.build(D, E);
  E.register(LIST);
  const K = {}; LIST.forEach(k => { K[k.id] = k; });
  const DOM = KP.DOMAINS;
  const fmt = EN.fmt, esc = C.esc, css = C.css;
  const SRC = {}; D.SOURCES.forEach(s => { SRC[s.id] = s; });
  const I = D.idx;
  const FKEYS = EN.FILTER_KEYS;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const sum = (arr, f) => arr.reduce((s, x) => s + ((typeof f === 'function' ? f(x) : x[f]) || 0), 0);
  const uniq = arr => Array.from(new Set(arr));
  const SERIES = n => css('--s' + n);
  const PROV_COLOR = { 'Azure OpenAI': 1, 'AWS Bedrock': 2, 'On-prem vLLM': 3 };

  // ------------------------------------------------------------------ state
  const ROLES = [
    { id: 'group', name: 'Group CISO (all tenants)', bu: null },
    { id: 'cfo', name: 'CFO (all tenants)', bu: null },
    { id: 'bu-FIN', name: 'BU CISO - Financial Services', bu: 'FIN' },
    { id: 'bu-HLT', name: 'BU CISO - Healthcare', bu: 'HLT' },
    { id: 'bu-ENR', name: 'BU CISO - Energy & Utilities', bu: 'ENR' },
    { id: 'bu-GOV', name: 'BU CISO - Government Services', bu: 'GOV' },
    { id: 'bu-GSS', name: 'BU CISO - Group Shared Services', bu: 'GSS' }
  ];
  const state = { route: 'exec', arg: null, period: 'ytd', from: 14, to: 23, f: {}, kpi: null, drill: [], role: 'group', session: null, lastKey: '', alertSev: '', catQuery: '', catDom: '', catStatus: '', traceAgent: '', traceMonth: null };
  FKEYS.forEach(k => { state.f[k] = ''; });
  const filt = () => { const f = { from: state.from, to: state.to }; FKEYS.forEach(k => { f[k] = state.f[k]; }); return f; };
  const prevF = f => { const n = f.to - f.from + 1; const yoy = f.from === 14 && f.to === 23; const from = yoy ? 2 : f.from - n, to = yoy ? 11 : f.to - n; return from < 0 ? null : Object.assign({}, f, { from: from, to: to }); };
  const rangeLabel = (a, b) => (a === b ? D.MONTHS[a].label : D.MONTHS[a].short + ' - ' + D.MONTHS[b].short);
  const periodLabel = () => { const p = EN.PERIODS.find(x => x.id === state.period); return p ? p.label : 'Custom: ' + rangeLabel(state.from, state.to); };
  const role = () => ROLES.find(r => r.id === state.role) || ROLES[0];

  // ------------------------------------------------------------------ hash routing
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const qi = h.indexOf('?');
    const path = qi >= 0 ? h.slice(0, qi) : h, qs = qi >= 0 ? h.slice(qi + 1) : '';
    const parts = (path || 'exec').split('/');
    state.route = ['exec', 'd', 'alerts', 'trace', 'catalog', 'method'].indexOf(parts[0]) >= 0 ? parts[0] : 'exec';
    state.arg = parts[1] || null;
    if (state.route === 'd' && !DOM[state.arg]) { state.route = 'exec'; state.arg = null; }
    const p = new URLSearchParams(qs);
    const per = p.get('p') || 'ytd';
    if (per === 'custom') {
      let a = parseInt(p.get('from'), 10), b = parseInt(p.get('to'), 10);
      if (!(a >= 0 && a <= D.LAST)) a = 14; if (!(b >= 0 && b <= D.LAST)) b = D.LAST; if (a > b) { const t = a; a = b; b = t; }
      state.period = 'custom'; state.from = a; state.to = b;
    } else {
      const P = EN.PERIODS.find(x => x.id === per) || EN.PERIODS.find(x => x.id === 'ytd');
      state.period = P.id; state.from = P.from; state.to = P.to;
    }
    FKEYS.forEach(k => { state.f[k] = p.get(k) || ''; });
    state.role = ROLES.some(r => r.id === p.get('role')) ? p.get('role') : 'group';
    const r = role(); if (r.bu) { state.f.bu = r.bu; if (state.f.tn && I.TN[state.f.tn] && I.TN[state.f.tn].bu !== r.bu) state.f.tn = ''; }
    const kp = p.get('kpi');
    state.kpi = kp && K[kp] ? kp : null;
  }
  function buildHash(over) {
    const o = Object.assign({ route: state.route, arg: state.arg, kpi: state.kpi }, over || {});
    const p = new URLSearchParams();
    if (state.period === 'custom') { p.set('p', 'custom'); p.set('from', state.from); p.set('to', state.to); }
    else if (state.period !== 'ytd') p.set('p', state.period);
    FKEYS.forEach(k => { if (state.f[k] && !(k === 'bu' && role().bu)) p.set(k, state.f[k]); });
    if (state.role !== 'group') p.set('role', state.role);
    if (o.kpi) p.set('kpi', o.kpi);
    const qs = p.toString();
    return '#/' + o.route + (o.arg ? '/' + o.arg : '') + (qs ? '?' + qs : '');
  }
  function navigate(over) { const hsh = buildHash(over); if (hsh !== location.hash) location.hash = hsh; else onHash(); }
  const pageKey = () => state.route + '/' + state.arg + '|' + state.period + '|' + JSON.stringify(filt()) + '|' + state.role;

  // ------------------------------------------------------------------ formatting helpers
  const ST_LABEL = { good: 'On target', watch: 'Watch', serious: 'Warning', critical: 'Critical', info: 'No target', nodata: 'No data' };
  const ICON = {
    good: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3.4 6.2l1.8 1.8 3.4-3.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    watch: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 .8a5.2 5.2 0 0 1 0 10.4z" fill="currentColor"/></svg>',
    serious: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1l5.2 9.4H.8z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 4.6v2.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="6" cy="8.7" r=".8" fill="currentColor"/></svg>',
    critical: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 .9h4L11.1 4v4L8 11.1H4L.9 8V4z" fill="currentColor"/><path d="M4.3 4.3l3.4 3.4M7.7 4.3L4.3 7.7" stroke="#1a0b0b" stroke-width="1.4" stroke-linecap="round"/></svg>',
    info: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3.5 6h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    nodata: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/></svg>'
  };
  const pill = st => '<span class="pill st-' + st + '">' + ICON[st] + ST_LABEL[st] + '</span>';
  const statusColor = st => ({ good: css('--good'), watch: css('--watch'), serious: css('--serious'), critical: css('--critical') })[st] || css('--deemph');
  const sevColor = sev => ({ Critical: css('--critical'), High: css('--serious'), Medium: css('--watch'), Low: css('--deemph') })[sev] || css('--deemph');
  function parts(v, unit) {
    if (v == null || !isFinite(v)) return { pre: '', v: 'n/a', suf: '' };
    const s = fmt(v, unit);
    if (unit === 'AED' || unit === 'AED2') return { pre: 'AED', v: s.replace(/^AED\s*/, ''), suf: '' };
    if (unit === '%') return { pre: '', v: s.replace('%', ''), suf: '%' };
    if (unit === 'score') return { pre: '', v: s, suf: '/100' };
    const m = s.match(/^([^\s]+)\s?(.*)$/);
    return m ? { pre: '', v: m[1], suf: m[2] } : { pre: '', v: s, suf: '' };
  }
  function thrText(k, val, unit) { if (val == null) return 'n/a'; return (k.dir === 'up' ? '≥ ' : k.dir === 'down' ? '≤ ' : '') + fmt(val, unit || k.unit); }
  function targetLine(k, r) {
    if (k.dir === 'none' || r.tgt == null) return k.dir === 'none' ? 'Informational' : 'Target n/a for this slice';
    const u = k.statusOf ? statusUnit(k) : k.unit;
    return 'Target ' + thrText(k, r.tgt, u) + (k.statusOf ? ' (' + statusName(k) + ')' : '');
  }
  const statusUnit = k => (k.id === 146 ? 'count' : '%');
  const statusName = k => (k.id === 146 ? 'unapproved' : k.id === 'X3' ? 'mitigation rate' : 'cache-hit ratio');
  function deltaHtml(k, v, pv) {
    if (v == null || pv == null || !isFinite(v) || !isFinite(pv)) return '<span class="delta neutral">no prior data</span>';
    const diff = v - pv;
    let txt;
    if (k.unit === '%') txt = (diff >= 0 ? '+' : '') + (Math.abs(diff) < 0.1 ? diff.toFixed(3) : diff.toFixed(1)) + ' pp';
    else if (k.unit === 'score') txt = (diff >= 0 ? '+' : '') + Math.round(diff) + ' pts';
    else if (pv === 0) txt = (diff >= 0 ? '+' : '') + fmt(diff, k.unit === 'AED' ? 'AED' : 'num');
    else txt = (diff >= 0 ? '+' : '') + (diff / Math.abs(pv) * 100).toFixed(1) + '%';
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '■';
    const cls = k.dir === 'none' || diff === 0 ? 'neutral' : ((diff > 0) === (k.dir === 'up') ? 'good' : 'bad');
    return '<span class="delta ' + cls + '" title="Change vs ' + esc(prevF(filt()) ? rangeLabel(prevF(filt()).from, prevF(filt()).to) : 'prior period') + '">' + arrow + ' ' + txt + '</span>';
  }
  const prevName = () => { const p = prevF(filt()); return p ? (state.period === 'ytd' ? 'Jan-Oct 2025' : rangeLabel(p.from, p.to)) : 'n/a'; };

  // ------------------------------------------------------------------ KPI card
  function kpiCard(id, o) {
    o = o || {};
    const k = K[id], f = filt();
    const r = E.quick(id, f);
    const pf = prevF(f);
    const pv = pf ? E.evaluate(id, pf) : null;
    const p = parts(r.value, k.unit);
    const ser = E.series(id, f, 12).map(x => x.value);
    const hiFrom = Math.max(0, 12 - (f.to - f.from + 1));
    let sec = '';
    if (o.sec) {
      const s2 = K[o.sec], v2 = E.evaluate(o.sec, f);
      sec = '<div class="kc-sec">' + esc(o.secLabel || s2.name) + ': <b>' + esc(fmt(v2, s2.unit)) + '</b></div>';
    }
    if (o.secText) sec = '<div class="kc-sec">' + o.secText(r) + '</div>';
    return '<button type="button" class="kpi-card st-' + r.status + '" data-kpi="' + id + '" aria-label="' + esc(k.name + ': ' + fmt(r.value, k.unit) + '. ' + ST_LABEL[r.status] + '. Open calculation') + '">' +
      '<div class="kc-top"><span class="kc-name">' + esc(o.label || k.name) + '</span>' + pill(r.status) + '</div>' +
      '<div class="kc-value">' + (p.pre ? '<span class="pre">' + p.pre + '</span>' : '') + '<span class="v">' + esc(p.v) + '</span>' + (p.suf ? '<span class="suf">' + esc(p.suf) + '</span>' : '') + '</div>' +
      sec +
      '<div class="kc-meta"><span>' + esc(targetLine(k, r)) + '</span>' + deltaHtml(k, r.value, pv) + '</div>' +
      C.spark(ser, { hiFrom: hiFrom }) +
      '<div class="kc-foot"><span class="kc-id">KPI ' + esc(String(id)) + '</span><span class="kc-how">How it\'s calculated →</span></div></button>';
  }

  // ------------------------------------------------------------------ filters
  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function renderFilters() {
    const f = state.f, r = role();
    const agents = D.AGENTS.filter(a => (!f.bu || a.bu === f.bu) && (!f.tn || a.tenant === f.tn) && (!f.app || a.app === f.app) && (!f.wf || a.wf === f.wf));
    const sel = (key, label, options, cls) => '<div class="filter ' + (cls || 'opt') + '"><label for="f-' + key + '">' + label + '</label><select id="f-' + key + '" data-f="' + key + '" class="' + (f[key] ? 'set' : '') + '"' + (key === 'bu' && r.bu ? ' disabled' : '') + '>' + options + '</select></div>';
    let per = EN.PERIODS.map(P => opt(P.id, P.label, state.period === P.id)).join('') + opt('custom', 'Custom month range…', state.period === 'custom');
    let custom = '';
    if (state.period === 'custom') {
      const mo = sel2 => D.MONTHS.map(m => opt(m.i, m.label, m.i === sel2)).join('');
      custom = '<div class="filter"><label for="f-from">From</label><select id="f-from" data-c="from">' + mo(state.from) + '</select></div><div class="filter"><label for="f-to">To</label><select id="f-to" data-c="to">' + mo(state.to) + '</select></div>';
    }
    const html = '<div class="filters' + (state.filtersOpen ? ' expanded' : '') + '" id="filtersInner">' +
      '<div class="filter period"><label for="f-period">Date range</label><select id="f-period" data-p="1" class="' + (state.period !== 'ytd' ? 'set' : '') + '">' + per + '</select></div>' + custom +
      sel('bu', 'Business unit', opt('', 'All business units') + D.BUS.map(b => opt(b.id, b.name, f.bu === b.id)).join(''), 'bu-f') +
      sel('tn', 'Customer / tenant', opt('', 'All tenants') + D.TENANTS.filter(t => !f.bu || t.bu === f.bu).map(t => opt(t.id, t.id + ' · ' + t.name, f.tn === t.id)).join('')) +
      sel('env', 'Environment', opt('', 'All environments') + opt('prod', 'Production', f.env === 'prod') + opt('nonprod', 'Non-production', f.env === 'nonprod')) +
      sel('agent', 'Agent', opt('', 'All agents (' + agents.length + ')') + agents.map(a => opt(a.id, a.name + ' · ' + a.tenant, f.agent === a.id)).join('')) +
      sel('mp', 'Model / provider', opt('', 'All models & providers') + '<optgroup label="Providers">' + D.PROVIDERS.map(p => opt('P:' + p, p, f.mp === 'P:' + p)).join('') + '</optgroup><optgroup label="Models">' + D.MODELS.map(m => opt('M:' + m.id, m.name + ' (' + m.provider + ')', f.mp === 'M:' + m.id)).join('') + '</optgroup>') +
      sel('app', 'Application', opt('', 'All applications') + D.APPS.map(a => opt(a.id, a.name, f.app === a.id)).join('')) +
      sel('wf', 'Workflow', opt('', 'All workflows') + D.WORKFLOWS.map(w => opt(w.id, w.name, f.wf === w.id)).join('')) +
      sel('ctl', 'Security control', opt('', 'All controls') + D.CONTROL_FAMILIES.map(c => opt(c, c, f.ctl === c)).join('')) +
      sel('sev', 'Severity', opt('', 'All severities') + ['Critical', 'High', 'Medium', 'Low'].map(s => opt(s, s, f.sev === s)).join('')) +
      sel('fw', 'Regulatory framework', opt('', 'All frameworks') + D.FRAMEWORKS.map(w => opt(w.id, w.name, f.fw === w.id)).join('')) +
      '<div class="filter-actions"><button type="button" class="btn ghost filters-more" id="btnMore">' + (state.filtersOpen ? 'Fewer filters' : 'More filters') + '</button><button type="button" class="btn ghost" id="btnReset">Reset</button></div></div>';
    $('#filters').innerHTML = html;
  }
  function onFilterChange(e) {
    const t = e.target;
    if (t.dataset.p) {
      const v = t.value;
      if (v === 'custom') { state.period = 'custom'; }
      else { const P = EN.PERIODS.find(x => x.id === v); state.period = P.id; state.from = P.from; state.to = P.to; }
    } else if (t.dataset.c) {
      state[t.dataset.c] = parseInt(t.value, 10);
      if (state.from > state.to) { if (t.dataset.c === 'from') state.to = state.from; else state.from = state.to; }
    } else if (t.dataset.f) {
      const key = t.dataset.f;
      state.f[key] = t.value;
      if (key === 'bu') { if (state.f.tn && I.TN[state.f.tn].bu !== t.value) state.f.tn = ''; state.f.agent = ''; }
      if (key === 'tn') { if (t.value) state.f.bu = I.TN[t.value].bu; state.f.agent = ''; }
      if (key === 'agent' && t.value) { const a = I.AGENT[t.value]; state.f.tn = a.tenant; state.f.bu = a.bu; }
    } else if (t.id === 'roleSel') {
      state.role = t.value; const r = role(); state.f.bu = r.bu || ''; state.f.tn = ''; state.f.agent = '';
    } else return;
    state.drill = [];
    navigate();
  }

  // ------------------------------------------------------------------ navigation
  function domainStatusCounts(code) {
    const f = filt(); const c = { critical: 0, serious: 0 };
    LIST.filter(k => k.dom === code).forEach(k => { const s = E.quick(k.id, f).status; if (c[s] != null) c[s]++; });
    return c;
  }
  function renderNav() {
    const link = (route, arg, code, label, extra) => {
      const active = state.route === route && (state.arg || null) === (arg || null);
      return '<a class="nav-link' + (active ? ' active' : '') + '" href="' + buildHash({ route: route, arg: arg, kpi: null }) + '">' + (code ? '<span class="nav-code">' + code + '</span>' : '') + '<span>' + esc(label) + '</span>' + (extra || '') + '</a>';
    };
    const alerts = computeAlerts(filt());
    const crit = alerts.filter(a => a.sev === 'Critical').length;
    let h = '<div class="nav-group"><div class="nav-title">Level 1</div>' + link('exec', null, '★', 'Executive overview') + link('alerts', null, '!', 'Risk alerts & decisions', '<span class="nav-count"><span class="pill st-' + (crit ? 'critical' : 'serious') + '">' + alerts.length + '</span></span>') + '</div>';
    h += '<div class="nav-group"><div class="nav-title">Level 2 · KPI domains</div>';
    'ABCDEFGH'.split('').forEach(c => {
      const cnt = domainStatusCounts(c);
      const dots = '<span class="nav-count" title="' + cnt.critical + ' critical, ' + cnt.serious + ' warning">' + (cnt.critical ? '<span class="nav-dot" style="background:var(--critical)"></span>' : '') + (cnt.serious ? '<span class="nav-dot" style="background:var(--serious)"></span>' : '') + '</span>';
      h += link('d', c, c, DOM[c].short, dots);
    });
    h += '</div><div class="nav-group"><div class="nav-title">Explore</div>' + link('trace', null, '⇄', 'Agent trace explorer') + link('catalog', null, '≡', 'KPI catalog (' + LIST.length + ')') + link('method', null, 'ⓘ', 'Methodology & data') + '</div>';
    h += '<div class="nav-group"><div class="nav-title">Viewing as</div><div class="filter" style="padding:0 10px"><label for="roleSel" class="sr-only">Role</label><select id="roleSel">' + ROLES.map(r => opt(r.id, r.name, r.id === state.role)).join('') + '</select></div><p class="small muted" style="padding:6px 10px 0;margin:0">Role-based scope: BU roles are locked to their business unit (row-level tenant isolation).</p></div>';
    $('#nav').innerHTML = h;
  }

  // ------------------------------------------------------------------ alerts engine
  const SEV_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  function byAgent(q, field) { const m = {}; q.actRows().forEach(r => { if (r[field]) m[r.ag] = (m[r.ag] || 0) + r[field]; }); return m; }
  function computeAlerts(f) {
    const ck = 'alerts|' + JSON.stringify(f);
    if (computeAlerts.cache[ck]) return computeAlerts.cache[ck];
    const q = E.ctx(f), out = [];
    const asOf = Date.UTC(2026, 10, 14);
    const due = sev => new Date(asOf + ({ Critical: 7, High: 14, Medium: 30 })[sev] * 864e5).toISOString().slice(0, 10);
    const v = id => E.evaluate(id, f), st = id => E.quick(id, f).status;
    const add = o => { o.due = due(o.sev); o.owner = o.owner || K[o.kpis[0]].owner; out.push(o); };
    const wfN = ids => { const u = uniq(ids); const crit = u.filter(w => I.WF[w].crit); return (crit.length ? crit : u).map(w => I.WF[w].name); };
    const agentWf = ids => wfN(ids.map(a => I.AGENT[a].wf));
    const A = n => fmt(n, 'AED');
    const sevOf = (s, crit) => (s === 'critical' ? 'Critical' : s === 'serious' ? 'High' : crit ? 'High' : 'Medium');

    const mOut = q.outM().filter(o => o.sev !== 'Medium');
    if (mOut.length) {
      const worst = mOut.slice().sort((a, b) => b.dur - a.dur)[0];
      add({ code: 'model-outage', sev: mOut.some(o => o.sev === 'Critical') ? 'Critical' : 'High', title: 'Critical model outage', kpis: [72, 73, 85],
        services: uniq(mOut.reduce((a, o) => a.concat(wfN(o.wfs)), [])),
        impact: mOut.length + ' high-severity model outage(s); longest ' + worst.dur + ' min on ' + I.MODEL[worst.mo].name + ' (' + worst.prov + '). Estimated impact ' + A(sum(mOut, 'impactEst')) + ', validated loss ' + A(sum(mOut, 'impactActual')) + '.',
        mitigation: 'Enforce automatic fallback routing on affected workflows, provider post-incident review, tighter synthetic-probe thresholds.',
        decision: 'Approve funding for multi-provider fallback on every critical workflow.' });
    }
    if (v(86) > 0) add({ code: 'sla', sev: v(86) >= 3 ? 'High' : 'Medium', title: 'AI provider SLA / SLO violation', kpis: [86, 71], owner: 'AI Platform Owner',
      services: uniq(D.MODELS.filter(m => true).map(m => m.provider)),
      impact: v(86) + ' deployment-month(s) below SLO; model availability ' + fmt(v(71), '%') + ' against a 99.9% target.',
      mitigation: 'Claim provider SLA credits; route critical traffic to the healthiest region; review provider capacity commitments.',
      decision: 'Mandate SLA credit claims and include availability clauses in the provider renewal.' });
    const er = v(97);
    if (er != null && er >= 95) {
      const qn = q.quotaNow().map(x => Object.assign({ r: x.used / x.elapsed * x.days / x.commit }, x)).sort((a, b) => b.r - a.r)[0];
      const daysToEx = qn.commit / (qn.used / qn.elapsed);
      add({ code: 'quota', sev: er >= 100 ? 'Critical' : 'High', title: 'Token quota exhaustion forecast', kpis: [97, 93, 60],
        services: agentWf(D.AGENTS.filter(a => a.primary === qn.mo && D.isRunning(a, D.LAST)).map(a => a.id)),
        impact: I.MODEL[qn.mo].name + ' (' + qn.prov + ') projected at ' + fmt(er, '%') + ' of the monthly commitment; quota exhausted on day ' + daysToEx.toFixed(1) + ' of ' + qn.days + ' vs reset on ' + D.AS_OF.resetLabel + '.',
        mitigation: 'Raise the commitment or enable overflow to the secondary model; throttle non-critical agents; enable prompt caching for top consumers.',
        decision: 'Approve an AI budget increase for a 20% commitment uplift, or accept throttling of non-critical workloads.' });
    } else if (v(93) > 0) add({ code: 'quota', sev: 'High', title: 'Provider quota exhaustion occurred', kpis: [93], services: ['Agents on affected deployments'], impact: v(93) + ' quota exhaustion event(s) in the period.', mitigation: 'Raise commitments ahead of demand; add overflow routing.', decision: 'Approve quota uplift policy (raise at 85% forecast).' });
    const spikeSt = [95, 96, 98].map(st);
    if (spikeSt.some(s => s === 'serious' || s === 'critical') || st(53) === 'serious' || st(53) === 'critical') {
      const loops = byAgent(q, 'loops'); const top = Object.keys(loops).sort((a, b) => loops[b] - loops[a]).slice(0, 4);
      add({ code: 'token-spike', sev: spikeSt.indexOf('critical') >= 0 ? 'Critical' : 'High', title: 'Sudden uncontrolled token consumption', kpis: [96, 95, 98, 53],
        services: agentWf(top), impact: v(96) + ' runaway loops, ' + v(95) + ' anomalous sessions and ' + v(98) + ' spike days; token growth ' + fmt(v(53), '%') + '.',
        mitigation: 'Enforce per-session token ceilings, loop breakers on repeated tool calls and circuit breakers on agent-to-agent recursion.', decision: 'Make per-agent token budgets mandatory before production go-live.' });
    }
    const spend = [67, 68].map(st);
    if (spend.some(s => s === 'serious' || s === 'critical')) add({ code: 'spend', sev: spend.indexOf('critical') >= 0 ? 'Critical' : 'High', title: 'Excessive AI spending', kpis: [68, 67, 63, 69], owner: 'CFO with AI FinOps Lead',
      services: ['AI operating budget'], impact: 'AI budget utilisation ' + fmt(v(67), '%') + ', gross overrun ' + fmt(v(68), '%') + ', next-quarter forecast ' + A(v(69)) + '.',
      mitigation: 'Model-routing optimisation (small models for simple steps), caching, waste reduction, BU chargeback.', decision: 'Approve BU chargeback and a re-forecast of the AI operating budget.' });
    if (st(110) === 'serious' || st(110) === 'critical' || st(109) === 'serious' || st(109) === 'critical') add({ code: 'capacity', sev: st(110) === 'critical' || st(109) === 'critical' ? 'Critical' : 'High', title: 'GPU / infrastructure capacity exhaustion risk', kpis: [110, 109, 106, 108], owner: 'Head of Infrastructure',
      services: agentWf(D.AGENTS.filter(a => I.MODEL[a.primary].provider === 'On-prem vLLM' && D.isRunning(a, f.to)).map(a => a.id)),
      impact: 'Capacity headroom ' + fmt(v(109), '%') + '; runway ' + fmt(v(110), 'months') + ' at current demand growth (GPU lead time about 4 months).',
      mitigation: 'Order GPU expansion now; burst to cloud GPU for non-sensitive workloads; schedule batch workloads off-peak.', decision: 'Approve GPU capacity expansion (capex) or a cloud-burst contract.' });
    const fbFail = q.outM().filter(o => o.fbTried && !o.fbOk), foFail = q.outI().filter(o => o.foTried && !o.foOk);
    if (fbFail.length + foFail.length) add({ code: 'failover', sev: 'High', title: 'Failed model / infrastructure failover', kpis: [82, 118], owner: 'Head of Resilience (BCM)',
      services: uniq(fbFail.concat(foFail).reduce((a, o) => a.concat(wfN(o.wfs)), [])).slice(0, 6),
      impact: fbFail.length + ' failed model fallback(s) and ' + foFail.length + ' failed infrastructure failover(s); fallback success ' + fmt(v(82), '%') + '.',
      mitigation: 'Re-test fallback paths monthly, pre-warm secondary capacity, add failover runbooks to SOAR.', decision: 'Require quarterly failover testing evidence for every critical workflow.' });
    const v83 = v(83);
    if (v83 != null && v83 < 100) {
      const lack = q.agents((a, m) => I.WF[a.wf].crit && !(a.fallback && a.fbTestedFrom != null && a.fbTestedFrom <= m));
      add({ code: 'no-fallback', sev: v83 < 75 ? 'Critical' : 'High', title: 'Critical AI application without tested fallback', kpis: [83, 84], services: agentWf(lack.map(a => a.id)),
        impact: lack.length + ' agent(s) on critical workflows lack a tested fallback model (' + lack.slice(0, 4).map(a => a.name).join(', ') + (lack.length > 4 ? '…' : '') + '). Fallback coverage ' + fmt(v83, '%') + '.',
        mitigation: 'Configure a secondary model per critical agent and test it; single-provider agents (e.g. EU-hosted endpoint) need an in-country alternative.', decision: 'Set fallback as a go-live gate for critical workflows.' });
    }
    if (v(129) > 0) {
      const m = byAgent(q, 'toolUnOk'); const ag = Object.keys(m).sort((a, b) => m[b] - m[a]);
      add({ code: 'tool', sev: sevOf(st(129), true), title: 'Unauthorized agent tool execution', kpis: [129, 128, 130], services: agentWf(ag).slice(0, 6),
        impact: v(129) + ' tool calls executed outside the approved scope across ' + ag.length + ' agent(s) (top: ' + ag.slice(0, 3).map(a => I.AGENT[a].name).join(', ') + ').',
        mitigation: 'Deny-by-default tool gateway, scope-bound credentials per tool, SOC playbook for tool-scope violations.', decision: 'Mandate deny-by-default tool authorisation for all agents within 30 days.' });
    }
    if (v(133) > 0) {
      const m = byAgent(q, 'piOk'); const ag = Object.keys(m);
      add({ code: 'pi', sev: sevOf(st(133), true), title: 'Successful prompt injection', kpis: [133, 134, 147], services: agentWf(ag),
        impact: v(133) + ' confirmed successful prompt injection(s); resistance ' + fmt(v(134), '%') + '. Highest exposure on workflows processing external content (phishing, citizen services).',
        mitigation: 'Isolate untrusted content, add output validation before tool use, red-team affected agents, tune guardrail classifier.', decision: 'Approve AI red-team programme expansion and guardrail upgrades.' });
    }
    const leaks = q.incidents().filter(x => x.type === 'AI data leakage' || x.type === 'Shadow AI data exposure');
    if (st(136) === 'serious' || st(136) === 'critical' || leaks.length) add({ code: 'leak', sev: st(136) === 'critical' ? 'Critical' : 'High', title: 'Sensitive-data leakage to AI', kpis: [136, 135, 146], owner: 'Data Protection Officer',
      services: uniq(leaks.map(x => I.TN[x.tn].name)).slice(0, 6),
      impact: leaks.length + ' AI data-leakage incident(s); policy violation rate ' + fmt(v(136), '%') + '; ' + fmt(E.quick(146, f).statusValue, 'count') + ' unapproved cross-border transfers.',
      mitigation: 'Enforce gateway redaction for PII/PHI/PCI, block non-approved endpoints, DLP coaching for users.', decision: 'Approve mandatory redaction at the AI gateway for all BUs.' });
    if (v(126) > 0 || q.shadowAppsFound().length) add({ code: 'shadow', sev: st(126) === 'critical' || st(127) === 'critical' ? 'Critical' : (st(126) === 'serious' || st(127) === 'serious') ? 'High' : 'Medium', title: 'Shadow AI discovery', kpis: [126, 125, 127, 139], owner: 'CISO',
      services: uniq(q.shadowAgents().map(x => I.TN[x.tn].name)), impact: v(126) + ' active shadow agents, ' + v(125) + ' shadow AI apps (' + q.shadowAppsFound().length + ' new in period), ' + v(139) + ' unregistered MCP servers; ' + fmt(v(127), '%') + ' of users exposed.',
      mitigation: 'Register or decommission discovered agents within 14 days; block unsanctioned AI apps; provide sanctioned alternatives.', decision: 'Approve the sanctioned enterprise AI catalogue and blocking policy.' });
    if (v(137) > 0) {
      const ag = q.agents((a, m) => a.excessPriv && a.excessPriv[0] <= m && (a.excessPriv[1] == null || a.excessPriv[1] > m));
      add({ code: 'priv', sev: sevOf(st(137), true), title: 'Agents with excessive permissions', kpis: [137, 138, 144], owner: 'Head of IAM', services: agentWf(ag.map(a => a.id)),
        impact: ag.length + ' agent(s) hold unused high-privilege scopes (' + ag.slice(0, 4).map(a => a.name).join(', ') + '); privilege exposure ' + fmt(v(138), '%') + '.',
        mitigation: 'Right-size scopes, just-in-time elevation for agents, quarterly entitlement review.', decision: 'Approve JIT privilege for agents as policy.' });
    }
    const ksFail = q.ksDrills().filter(x => !x.pass);
    if (ksFail.length || v(141) > 0) add({ code: 'ks', sev: v(141) >= 5 || st(142) === 'critical' ? 'Critical' : 'High', title: 'Kill-switch gaps and failed drills', kpis: [141, 142], owner: 'Head of AI Governance',
      services: agentWf(uniq(ksFail.map(x => x.agent).concat(q.agents((a, m) => a.killSwitchFrom == null || a.killSwitchFrom > m).map(a => a.id)))),
      impact: ksFail.length + ' failed kill-switch drill(s) in period; ' + v(141) + ' registered agent(s) without a kill switch; coverage ' + fmt(v(142), '%') + '.',
      mitigation: 'Implement and drill kill switches (halt + credential revocation < 5 min) for all agents; re-test failures within 7 days.', decision: 'Make a tested kill switch a hard go-live gate.' });
    if (v(140) > 0) add({ code: 'a2a', sev: sevOf(st(140), false), title: 'Unapproved agent-to-agent delegation', kpis: [140], owner: 'Head of AI Governance',
      services: agentWf(Object.keys(byAgent(q, 'a2aUn'))), impact: v(140) + ' delegations outside the approved delegation graph.',
      mitigation: 'Enforce signed delegation tokens and an allow-listed delegation graph in the orchestrator.', decision: 'Approve the agent delegation policy (AIC-11) for enforcement.' });
    const ineff = q.ctlInst().filter(x => x.tests.some(t => t.m >= f.from && t.m <= f.to && !t.effective));
    if (ineff.length || st(156) === 'serious' || st(156) === 'critical') add({ code: 'ctl', sev: st(156) === 'critical' ? 'Critical' : 'High', title: 'AI control failures', kpis: [156, 155, 154], owner: 'Head of GRC',
      services: uniq(ineff.map(x => x.name)).slice(0, 5), impact: ineff.length + ' control instance(s) tested ineffective in the period; compliance gap rate ' + fmt(v(156), '%') + '.',
      mitigation: 'Remediate failed controls and re-test; prioritise frameworks with regulatory deadlines (UAE IA, CBUAE, ADHICS).', decision: 'Approve the AI control remediation plan and owners.' });
    const xb = E.quick(146, f).statusValue;
    if (xb > 0) add({ code: 'xb', sev: 'High', title: 'Unapproved cross-border AI data transfers', kpis: [146], owner: 'Data Protection Officer', services: agentWf(Object.keys(byAgent(q, 'xbUn'))),
      impact: fmt(xb, 'count') + ' sensitive-data requests sent to a non-UAE endpoint before the transfer approval.', mitigation: 'Route to the in-country model; complete the transfer impact assessment; document safeguards.', decision: 'Confirm the data-residency policy for AI endpoints.' });
    out.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);
    out.forEach((a, i) => { a.id = 'AL-' + String(i + 1).padStart(2, '0'); });
    return (computeAlerts.cache[ck] = out);
  }
  computeAlerts.cache = {};

  // ------------------------------------------------------------------ risk heatmap
  const HEAT_CATS = [
    { name: 'Agent action control', ids: [129, 132, 150, 140] },
    { name: 'Prompt & data protection', ids: [133, 136, 146] },
    { name: 'Identity & privilege', ids: [138, 144, 143] },
    { name: 'Shadow AI', ids: [126, 127, 139] },
    { name: 'Kill switch & tracing', ids: [142, 145] },
    { name: 'Governance & assurance', ids: [151, 152, 153, 148] }
  ];
  function riskFor(f, id) { const k = K[id]; const r = E.quick(id, f); return r.status === 'info' || r.status === 'nodata' ? null : r.risk; }
  function heatData(f) {
    const bus = D.BUS.filter(b => !state.f.bu || b.id === state.f.bu);
    const values = bus.map(b => HEAT_CATS.map(c => { const vals = c.ids.map(id => riskFor(Object.assign({}, f, { bu: b.id, tn: '' }), id)).filter(x => x != null); return vals.length ? vals.reduce((a, x) => a + x, 0) / vals.length : null; }));
    return { rows: bus.map(b => b.name), cols: HEAT_CATS.map(c => c.name), values: values, bus: bus };
  }

  // ------------------------------------------------------------------ figure registry (re-render on resize)
  let figs = [];
  function fig(container, o) { const f = C.figure(container, o); figs.push(f); return f; }
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => figs.forEach(f => f.isConnected && f._redraw && f._redraw()), 180); });
  const monthsWindow = (f, n) => { const out = []; for (let m = Math.max(0, f.to - (n || 12) + 1); m <= f.to; m++) out.push(m); return out; };
  const subMonth = (f, m) => Object.assign({}, f, { from: m, to: m });
  const aedAxis = v => fmt(v, 'AED');

  // ------------------------------------------------------------------ page: executive
  function scopeLine(f) {
    const chips = ['<span class="chip applied">' + esc(periodLabel()) + '</span>'];
    FKEYS.forEach(k => { if (f[k]) chips.push('<span class="chip applied">' + esc(EN.FILTER_LABELS[k]) + ': ' + esc(filterValueLabel(k, f[k])) + '</span>'); });
    return '<div class="scope-line">' + chips.join('') + '<span>· compared with ' + esc(prevName()) + '</span></div>';
  }
  function filterValueLabel(k, v) {
    if (k === 'bu') return I.BU[v] ? I.BU[v].name : v;
    if (k === 'tn') return I.TN[v] ? I.TN[v].name : v;
    if (k === 'agent') return I.AGENT[v] ? I.AGENT[v].name : v;
    if (k === 'app') return I.APP[v] ? I.APP[v].name : v;
    if (k === 'wf') return I.WF[v] ? I.WF[v].name : v;
    if (k === 'fw') return I.FW[v] ? I.FW[v].name : v;
    if (k === 'mp') return v.indexOf('M:') === 0 ? I.MODEL[v.slice(2)].name : v.slice(2);
    if (k === 'env') return v === 'prod' ? 'Production' : 'Non-production';
    return v;
  }
  function band(v) { return v == null ? 'n/a' : v < 20 ? 'Low' : v < 40 ? 'Moderate' : v < 60 ? 'High' : 'Critical'; }
  function heroHtml(f) {
    const d = E.detail('X1', f);
    const pv = prevF(f) ? E.evaluate('X1', prevF(f)) : null;
    const comps = d.inputs.map(inp => {
      const val = inp.value;
      const color = val == null ? css('--deemph') : val < 20 ? css('--good') : val < 40 ? css('--watch') : val < 60 ? css('--serious') : css('--critical');
      return '<div class="comp-row"><span class="name">' + esc(inp.label.replace(/ \(weight.*$/, '')) + ' <span class="muted">· ' + Math.round(inp.w * 100) + '%</span></span><span class="meter"><span style="width:' + (val == null ? 0 : Math.min(100, val)) + '%;background:' + color + '"></span></span><span class="num r small">' + (val == null ? 'n/a' : Math.round(val)) + '</span></div>';
    }).join('');
    const stat = (id, label) => {
      const r = E.quick(id, f), k = K[id], p = prevF(f) ? E.evaluate(id, prevF(f)) : null;
      return '<button type="button" class="stat" data-kpi="' + id + '"><div class="hero-label"><span>' + esc(label) + '</span>' + pill(r.status) + '</div><div class="stat-value">' + (r.value == null ? 'n/a' : Math.round(r.value)) + '<span class="muted" style="font-size:14px;font-weight:500"> /100 · ' + band(r.value) + '</span></div><div class="stat-sub">Target ≤ ' + r.tgt + ' · ' + deltaHtml(k, r.value, p) + '</div>' + C.spark(E.series(id, f, 12).map(x => x.value), { hiFrom: Math.max(0, 12 - (f.to - f.from + 1)) }) + '</button>';
    };
    const comp = D.SOURCES.reduce((a, s) => a + s.completeness, 0) / D.SOURCES.length;
    const oldest = D.SOURCES.slice().sort((a, b) => a.fresh.localeCompare(b.fresh))[0];
    return '<div class="hero">' +
      '<button type="button" class="hero-main" data-kpi="X1"><div class="hero-label"><span>Enterprise Cyber Risk Score</span>' + pill(d.status) + '</div>' +
      '<div class="hero-value"><span class="big">' + (d.value == null ? 'n/a' : Math.round(d.value)) + '</span><span class="of">/ 100</span><span class="hero-band">' + band(d.value) + ' risk · ' + deltaHtml(K.X1, d.value, pv) + '</span></div>' +
      '<div class="muted small">Lower is better · weighted composite of residual loss exposure, incident response, control effectiveness and agentic enterprise risk. Click for the full calculation.</div>' +
      '<div class="hero-comps">' + comps + '</div></button>' +
      stat('X2', 'Agentic Enterprise Risk Index') + stat('X6', 'Agentic Security Risk Score') +
      '<a class="stat" href="' + buildHash({ route: 'method', arg: null, kpi: null }) + '#quality" style="text-decoration:none"><div class="hero-label"><span>Data quality & freshness</span><span class="pill st-info">' + ICON.info + 'Synthetic</span></div><div class="stat-value">' + comp.toFixed(1) + '<span class="muted" style="font-size:14px;font-weight:500">% complete</span></div><div class="stat-sub">' + D.SOURCES.length + ' source systems · oldest refresh ' + esc(oldest.fresh) + ' (' + esc(oldest.id) + ')</div><div class="stat-sub" style="margin-top:6px">Every value on this site is synthetic sample data, clearly not live enterprise metrics.</div></a>' +
      '</div>';
  }
  function pageExec(main) {
    const f = filt();
    const alerts = computeAlerts(f);
    const panel = (num, title, dom, cardsHtml, figId) => '<section class="panel"><div class="panel-head"><h3><span class="panel-num">' + num + '</span>' + esc(title) + '</h3><a class="panel-link" href="' + buildHash({ route: 'd', arg: dom, kpi: null }) + '">Detailed dashboard →</a></div><div class="cards">' + cardsHtml + '</div><div id="' + figId + '" style="margin-top:10px"></div></section>';
    const prio = alerts.slice(0, 5).map(a => '<li data-kpi="' + a.kpis[0] + '"><div><div class="t">' + esc(a.title) + '</div><div class="d">' + esc(a.decision) + '</div></div><div style="text-align:right"><span class="sev ' + a.sev + '">' + a.sev + '</span><div class="small muted" style="margin-top:4px">due ' + a.due + '</div></div></li>').join('');
    main.innerHTML =
      '<div class="page-head"><div><div class="crumbs">Level 1 · One-page CISO executive dashboard</div><h2>Executive overview</h2><p class="sub">Cyber value created, AI-agent productivity, token economics, service reliability and agentic security risk on one page. Click any KPI to see exactly how it is calculated.</p></div>' + scopeLine(f) + '</div>' +
      '<div class="print-scope">Scope: ' + esc(periodLabel()) + ' · Data as of ' + esc(D.AS_OF.label) + ' · SYNTHETIC SAMPLE DATA</div>' +
      heroHtml(f) +
      '<div class="section"><div class="section-title"><h3>What leadership must prioritise</h3><a class="hint" href="' + buildHash({ route: 'alerts', arg: null, kpi: null }) + '">All ' + alerts.length + ' alerts & decisions →</a></div><ol class="prio-list">' + prio + '</ol></div>' +
      '<div class="panels">' +
      panel(1, 'Financial value and cost savings', 'A', kpiCard(1, { label: 'Total realized enterprise savings' }) + kpiCard(2) + kpiCard(3) + kpiCard('X3', { secText: () => 'of ' + E.ctx(f).incidents().filter(x => x.major).length + ' major incidents' }), 'figA') +
      panel(2, 'Agentic enterprise efficiency', 'B', kpiCard(27) + kpiCard(29, { label: 'Human working hours saved' }) + kpiCard(28) + kpiCard(31, { label: 'Agent autonomy rate' }) + kpiCard(20, { label: 'Total AI agents', sec: 126, secLabel: 'Shadow agents' }), 'figB') +
      panel(3, 'Token economics and AI service reliability', 'C', kpiCard(43, { label: 'Total tokens consumed' }) + kpiCard(63, { label: 'Total AI operating cost' }) + kpiCard(64, { label: 'Cost per successful agent task' }) + kpiCard(71, { label: 'Model availability' }) + kpiCard(72, { label: 'Model outages', sec: 73, secLabel: 'Downtime' }) + kpiCard('X4') + kpiCard(101) + kpiCard(102, { label: 'Infrastructure outages', sec: 103, secLabel: 'Downtime' }), 'figC') +
      panel(4, 'Agentic security risk, control gaps and KRIs', 'G', kpiCard('X5', { secText: () => 'Attempted: ' + fmt(E.ctx(f).a('hrAtt'), 'count') + ' · blocked ' + fmt(E.ctx(f).a('hrBlk'), 'count') }) + kpiCard('X6') + kpiCard(133) + kpiCard(129) + kpiCard(137) + kpiCard(156), 'figG') +
      '</div>' +
      '<div class="section"><div class="section-title"><h3>Executive alerts</h3><span class="hint">Severity, affected critical services, owner, deadline and the decision required</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Severity</th><th>Alert</th><th>Affected critical services</th><th>Owner</th><th>Deadline</th><th>Executive decision required</th></tr></thead><tbody>' +
      alerts.slice(0, 8).map(a => '<tr class="click" data-kpi="' + a.kpis[0] + '"><td><span class="sev ' + a.sev + '">' + a.sev + '</span></td><td class="kname">' + esc(a.title) + '<div class="def">' + esc(a.impact) + '</div></td><td class="small">' + esc((a.services || []).slice(0, 4).join(', ') || '-') + '</td><td class="small">' + esc(a.owner) + '</td><td class="small nowrap">' + a.due + '</td><td class="small">' + esc(a.decision) + '</td></tr>').join('') +
      '</tbody></table></div></div>' + footer();
    // Panel charts
    const ms = monthsWindow(f, 12);
    const lbl = ms.map(m => D.MONTHS[m].short);
    const sav = ms.map(m => E.evaluate(1, subMonth(f, m))), lp = ms.map(m => E.evaluate(2, subMonth(f, m))), cost = ms.map(m => E.evaluate(7, subMonth(f, m)));
    fig($('#figA'), {
      title: 'Verified cash value vs automation cost, monthly', sub: 'Finance-approved savings + confirmed loss prevented (de-duplicated). Capacity value and risk estimates are excluded.',
      legend: [{ name: 'Realized savings', color: SERIES(1) }, { name: 'Confirmed loss prevented', color: SERIES(3) }, { name: 'Automation operating cost', color: SERIES(2), line: true }],
      render: el => C.columns(el, { labels: lbl, series: [{ name: 'Realized savings', color: SERIES(1), values: sav }, { name: 'Confirmed loss prevented', color: SERIES(3), values: lp }], line: { name: 'Automation operating cost', color: SERIES(2), values: cost }, fmt: aedAxis, height: 200 }),
      after: '<div class="tbl-note">Not added above: productivity capacity ' + fmt(E.evaluate(6, f), 'AED') + ' (KPI 6, capacity not cash) and estimated loss avoidance ' + fmt(E.evaluate(3, f), 'AED') + '/yr (KPI 3, risk-based).</div>',
      table: () => ({ headers: ['Month', 'Realized savings', 'Loss prevented', 'Automation cost'], rows: ms.map((m, i) => [D.MONTHS[m].label, fmt(sav[i], 'AED', 'full'), fmt(lp[i], 'AED', 'full'), fmt(cost[i], 'AED', 'full')]) })
    });
    const wfItems = workflowTimes(f).slice(0, 7);
    fig($('#figB'), {
      title: 'Manual baseline vs agent end-to-end time per task', sub: 'Top workflows by volume · end-to-end includes human review, waiting, retries and rework',
      legend: [{ name: 'Manual baseline (min/task)', color: css('--deemph') }, { name: 'Agent end-to-end (min/task)', color: SERIES(1) }],
      render: el => C.dumbbell(el, { items: wfItems.map(w => ({ label: w.name, a: w.man, b: w.e2e, tag: w.speed.toFixed(1) + '× faster' })), aName: 'Manual baseline', bName: 'Agent end-to-end', aColor: css('--deemph'), bColor: SERIES(1), fmt: v => fmt(v, 'min') }),
      table: () => ({ headers: ['Workflow', 'Manual min/task', 'Agent e2e min/task', 'Speed-up', 'Tasks'], rows: wfItems.map(w => [w.name, w.man.toFixed(1), w.e2e.toFixed(1), w.speed.toFixed(2) + '×', fmt(w.tasks, 'count', 'full')]) })
    });
    const provs = D.PROVIDERS.filter(p => !state.f.mp || state.f.mp === 'P:' + p || (state.f.mp.indexOf('M:') === 0 && I.MODEL[state.f.mp.slice(2)].provider === p));
    const tokSeries = provs.map(p => ({ name: p, color: SERIES(PROV_COLOR[p]), values: ms.map(m => { const q = E.ctx(Object.assign(subMonth(f, m), { mp: state.f.mp && state.f.mp.indexOf('M:') === 0 ? state.f.mp : 'P:' + p })); return q.a('tokIn') + q.a('tokOut'); }) }));
    fig($('#figC'), {
      title: 'Tokens consumed by provider, monthly', sub: 'Input + output tokens (cached and reasoning tokens are already inside these totals)',
      legend: tokSeries.map(s => ({ name: s.name, color: s.color })),
      render: el => C.columns(el, { labels: lbl, series: tokSeries, fmt: v => fmt(v, 'tokens'), height: 200 }),
      table: () => ({ headers: ['Month'].concat(tokSeries.map(s => s.name)), rows: ms.map((m, i) => [D.MONTHS[m].label].concat(tokSeries.map(s => fmt(s.values[i], 'tokens', 'full')))) })
    });
    const hd = heatData(f);
    fig($('#figG'), {
      title: 'Agentic AI risk heatmap: business unit × risk category', sub: 'Mean normalised risk of the KRIs in each category · click a cell to open the worst KRI',
      render: el => C.heatmap(el, { rows: hd.rows, cols: hd.cols, values: hd.values, onClick: (i, j) => { const ids = HEAT_CATS[j].ids; const ff = Object.assign({}, f, { bu: hd.bus[i].id }); const worst = ids.slice().sort((a, b) => (riskFor(ff, b) || 0) - (riskFor(ff, a) || 0))[0]; state.f.bu = hd.bus[i].id; navigate({ kpi: worst }); }, extra: (i, j) => [{ k: 'KRIs', v: HEAT_CATS[j].ids.map(x => '#' + x).join(' ') }] }),
      after: C.heatLegend(),
      table: () => ({ headers: ['Business unit'].concat(hd.cols), rows: hd.rows.map((r, i) => [r].concat(hd.values[i].map(v => v == null ? 'n/a' : Math.round(v)))) })
    });
  }
  function workflowTimes(f) {
    const q = E.ctx(f);
    const by = {};
    q.actRows().forEach(r => { if (!r.primary) return; const w = by[r.wf] || (by[r.wf] = { man: 0, e2e: 0, cmp: 0, tasks: 0, ex: 0, rv: 0, wt: 0, rt: 0, rw: 0 }); w.man += r.manMin; w.e2e += r.e2eMin; w.cmp += r.cmp; w.tasks += r.tasks; w.ex += r.execMin; w.rv += r.reviewMin; w.wt += r.waitMin; w.rt += r.retryMin; w.rw += r.reworkMin; });
    return Object.keys(by).filter(k => by[k].cmp > 0).map(k => { const w = by[k]; return { id: k, name: I.WF[k].name, man: w.man / w.cmp, e2e: w.e2e / w.cmp, speed: w.man / w.e2e, gain: (w.man - w.e2e) / w.man * 100, tasks: w.tasks, ex: w.ex / w.cmp, rv: w.rv / w.cmp, wt: w.wt / w.cmp, rt: w.rt / w.cmp, rw: w.rw / w.cmp }; }).sort((a, b) => b.tasks - a.tasks);
  }
  function footer() {
    return '<div class="footer"><span>CISO Executive Agentic Enterprise Dashboard · all figures are synthetic sample data generated deterministically for demonstration and testing; they are not live enterprise metrics.</span><span>Data as of ' + esc(D.AS_OF.label) + ' · currency AED</span></div>';
  }

  // ------------------------------------------------------------------ page: domain (Level 2)
  function kpiTable(ids, o) {
    o = o || {};
    const f = filt(), pf = prevF(f);
    const rows = ids.map(id => {
      const k = K[id], r = E.quick(id, f), pv = pf ? E.evaluate(id, pf) : null;
      const ser = E.series(id, f, 12).map(x => x.value);
      const tgt = k.dir === 'none' ? '<span class="muted">Info</span>' : (r.tgt == null ? '<span class="muted">n/a</span>' : esc(thrText(k, r.tgt, k.statusOf ? statusUnit(k) : k.unit)));
      return '<tr class="click" data-kpi="' + id + '"><td class="num muted">' + esc(String(id)) + '</td><td><div class="kname">' + esc(k.name) + '</div><div class="def">' + esc(k.def) + '</div></td><td class="r num nowrap"><b>' + esc(fmt(r.value, k.unit)) + '</b></td><td class="r small nowrap">' + tgt + '</td><td>' + pill(r.status) + '</td><td class="nowrap">' + deltaHtml(k, r.value, pv) + '</td><td class="bar-cell" style="width:120px">' + C.spark(ser, { hiFrom: Math.max(0, 12 - (f.to - f.from + 1)), h: 26 }) + '</td><td class="small">' + esc(k.owner) + '</td><td class="small">' + esc(k.freq) + '</td></tr>';
    }).join('');
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>KPI / KRI</th><th class="r">Value</th><th class="r">Target</th><th>Status</th><th>vs prior</th><th>12-month trend</th><th>Owner</th><th>Frequency</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  const DOMAIN_INTRO = {
    A: 'Verified savings, confirmed loss prevention, estimated risk reduction and productivity capacity, kept separate and never double counted across controls or incidents.',
    B: 'Agent volume, success, autonomy and human effort. Every time-based measure includes human review, waiting, retries and rework.',
    C: 'Token consumption, cost and budgets by model, provider, agent and business unit, with cached and reasoning tokens normalised so nothing is double counted.',
    D: 'Request-level model availability, outages, latency, fallback and change risk. Provider failures, internal serving failures, gateway / network failures, throttling and client errors are kept apart.',
    E: 'Context-window, TPM / RPM and quota pressure, runaway consumption and the business impact of throttling, with quota exhaustion forecasts.',
    F: 'GPU, Kubernetes, gateway, network, storage and vector database resilience, capacity runway and DR assurance.',
    G: 'Agentic attack surface: shadow AI, tool authorisation, prompt injection, sensitive data, privilege, kill switches, tracing and unsafe autonomy.',
    H: 'Governance coverage and control assurance mapped to UAE IA / NESA, UAE AI policy, PDPL, CBUAE, ADHICS, ISO/IEC 27001 / 42001 / 27017 / 27018 / 27701, NIST AI RMF, MITRE ATLAS and OWASP. Applicability is determined before scoring.'
  };
  function pageDomain(main, code) {
    const f = filt(), dom = DOM[code];
    const ids = LIST.filter(k => k.dom === code).map(k => k.id);
    const counts = {}; ids.forEach(id => { const s = E.quick(id, f).status; counts[s] = (counts[s] || 0) + 1; });
    main.innerHTML = '<div class="page-head"><div><div class="crumbs"><a href="' + buildHash({ route: 'exec', arg: null, kpi: null }) + '">Executive overview</a> › Level 2 detailed dashboard</div><h2>' + code + '. ' + esc(dom.name) + '</h2><p class="sub">' + esc(DOMAIN_INTRO[code]) + ' Domain owner: ' + esc(dom.owner) + '.</p></div>' + scopeLine(f) + '</div>' +
      '<div class="status-sum">' + ['critical', 'serious', 'watch', 'good', 'info'].filter(s => counts[s]).map(s => '<span class="pill st-' + s + '">' + ICON[s] + counts[s] + ' ' + ST_LABEL[s] + '</span>').join('') + '<span class="chip">KPIs ' + ids[0] + '-' + ids[ids.length - 1] + '</span></div>' +
      '<div class="section"><div class="chart-grid" id="domCharts"></div></div>' +
      '<div class="section"><div class="section-title"><h3>All ' + ids.length + ' indicators in this domain</h3><span class="hint">Click a row for definition, formula, worked calculation, drill-down and evidence</span></div>' + kpiTable(ids) + '</div>' + footer();
    const host = $('#domCharts');
    (DOMAIN_CHARTS[code] || (() => {}))(host, f);
  }

  const DOMAIN_CHARTS = {
    A: function (host, f) {
      const q = E.ctx(f);
      const fin = q.fin();
      const byC = {};
      fin.forEach(x => { if (x.cat === 'saving' && x.status !== 'Approved') return; const c = byC[x.ctl] || (byC[x.ctl] = [0, 0]); c[x.cat === 'saving' ? 0 : 1] += x.amt; });
      const items = Object.keys(byC).map(c => ({ label: c, values: byC[c] })).sort((a, b) => (b.values[0] + b.values[1]) - (a.values[0] + a.values[1]));
      fig(host, { title: 'Financial value by security control', sub: 'Approved savings + attributed (de-duplicated) loss prevented · totals reconcile to KPI 1 + KPI 2',
        legend: [{ name: 'Realized savings', color: SERIES(1) }, { name: 'Attributed loss prevented', color: SERIES(3) }],
        render: el => C.hbars(el, { items: items, series: [{ name: 'Realized savings', color: SERIES(1) }, { name: 'Attributed loss prevented', color: SERIES(3) }], fmt: aedAxis, rowH: 24 }),
        table: () => ({ headers: ['Control', 'Savings', 'Loss prevented', 'Total'], rows: items.map(i => [i.label, fmt(i.values[0], 'AED', 'full'), fmt(i.values[1], 'AED', 'full'), fmt(i.values[0] + i.values[1], 'AED', 'full')]) }),
        onOpen: () => openKpi(17) });
      const s1 = E.evaluate(1, f), s2 = E.evaluate(2, f), s7 = E.evaluate(7, f), s5 = E.evaluate(5, f);
      const bridge = [{ label: 'Realized savings (KPI 1)', values: [s1], color: SERIES(1) }, { label: 'Confirmed loss prevented (KPI 2)', values: [s2], color: SERIES(3) }, { label: 'Automation operating cost (KPI 7)', values: [s7], color: SERIES(2), valueLabel: '− ' + fmt(s7, 'AED') }, { label: 'Net realized benefit (KPI 5)', values: [Math.max(0, s5)], color: css('--text-2'), valueLabel: '= ' + fmt(s5, 'AED') }];
      fig(host, { title: 'Net realized financial benefit bridge', sub: 'Cash basis: savings + verified prevented loss − incremental programme cost', render: el => C.hbars(el, { items: bridge, fmt: aedAxis, rowH: 34, labelW: 210, valW: 90 }),
        table: () => ({ headers: ['Component', 'AED'], rows: [['Realized savings', fmt(s1, 'AED', 'full')], ['Confirmed loss prevented', fmt(s2, 'AED', 'full')], ['Automation operating cost', '-' + fmt(s7, 'AED', 'full')], ['Net realized benefit', fmt(s5, 'AED', 'full')]] }), onOpen: () => openKpi(5) });
      const lpRows = fin.filter(x => x.cat === 'loss_prevented');
      const gross = sum(lpRows, 'claim'), net = sum(lpRows, 'amt');
      const box = document.createElement('div'); box.className = 'fig wide';
      box.innerHTML = '<div class="fig-head"><div><div class="fig-title">Value classification: reported separately, never summed</div><div class="fig-sub">Cash, capacity and risk estimates answer different questions</div></div></div><div class="kv">' +
        [[1, 'Verified', 'Finance-approved cash savings'], [2, 'Verified', 'Confirmed loss prevented (de-duplicated)'], [6, 'Capacity', 'Productivity capacity value (not cash)'], [3, 'Estimate', 'Estimated loss avoidance (annualised)']].map(x => '<div data-kpi="' + x[0] + '" style="cursor:pointer"><div class="k">' + esc(x[2]) + ' <span class="chip" style="font-size:10px;padding:1px 6px">' + x[1] + '</span></div><div class="v">' + esc(fmt(E.evaluate(x[0], f), 'AED')) + '</div></div>').join('') +
        '</div><div class="callout info" style="margin-top:10px"><b>Double-counting control:</b> security controls submitted gross claims of ' + esc(fmt(gross, 'AED')) + ' for the same verified incidents. De-duplicating on incident ID leaves ' + esc(fmt(net, 'AED')) + ' (' + (gross ? ((1 - net / gross) * 100).toFixed(0) : 0) + '% of claims removed as duplicates). Attribution weights per incident always sum to 100%.</div>';
      host.appendChild(box);
    },
    B: function (host, f) {
      const w = workflowTimes(f).slice(0, 10);
      fig(host, { title: 'Manual baseline vs agent end-to-end time per task', sub: 'Comparable tasks with an approved baseline',
        legend: [{ name: 'Manual baseline', color: css('--deemph') }, { name: 'Agent end-to-end', color: SERIES(1) }],
        render: el => C.dumbbell(el, { items: w.map(x => ({ label: x.name, a: x.man, b: x.e2e, tag: x.gain.toFixed(0) + '% gain' })), aName: 'Manual', bName: 'Agent end-to-end', aColor: css('--deemph'), bColor: SERIES(1), fmt: v => fmt(v, 'min') }),
        table: () => ({ headers: ['Workflow', 'Manual', 'Agent e2e', 'Gain'], rows: w.map(x => [x.name, x.man.toFixed(1), x.e2e.toFixed(1), x.gain.toFixed(1) + '%']) }), onOpen: () => openKpi(27) });
      fig(host, { title: 'Where end-to-end agent time goes', sub: 'Minutes per comparable task: machine execution vs human review, waiting, retries and rework',
        legend: ['Execution', 'Human review', 'Waiting / approvals', 'Retries', 'Rework'].map((n, i) => ({ name: n, color: SERIES(i + 1) })),
        render: el => C.hbars(el, { items: w.slice(0, 8).map(x => ({ label: x.name, values: [x.ex, x.rv, x.wt, x.rt, x.rw] })), series: ['Execution', 'Human review', 'Waiting / approvals', 'Retries', 'Rework'].map((n, i) => ({ name: n, color: SERIES(i + 1) })), fmt: v => fmt(v, 'min') }),
        table: () => ({ headers: ['Workflow', 'Exec', 'Review', 'Wait', 'Retry', 'Rework'], rows: w.slice(0, 8).map(x => [x.name, x.ex.toFixed(2), x.rv.toFixed(2), x.wt.toFixed(2), x.rt.toFixed(2), x.rw.toFixed(2)]) }), onOpen: () => openKpi(26) });
      const ms = monthsWindow(f, 12), lbl = ms.map(m => D.MONTHS[m].short);
      const s31 = ms.map(m => E.evaluate(31, subMonth(f, m))), s33 = ms.map(m => E.evaluate(33, subMonth(f, m))), s35 = ms.map(m => E.evaluate(35, subMonth(f, m)));
      fig(host, { title: 'Autonomy vs human intervention, monthly', sub: 'Autonomous completion of eligible tasks, unplanned intervention and escalation rates', cls: 'wide',
        legend: [{ name: 'Autonomous completion (KPI 31)', color: SERIES(1), line: true }, { name: 'Human intervention (KPI 33)', color: SERIES(2), line: true }, { name: 'Escalation to human (KPI 35)', color: SERIES(4), line: true }],
        render: el => C.line(el, { labels: lbl, series: [{ name: 'Autonomous completion', color: SERIES(1), values: s31 }, { name: 'Human intervention', color: SERIES(2), values: s33 }, { name: 'Escalation', color: SERIES(4), values: s35 }], fmt: v => fmt(v, '%'), endLabels: true, height: 220, hiFrom: Math.max(0, 12 - (f.to - f.from + 1)) }),
        table: () => ({ headers: ['Month', 'Autonomous', 'Intervention', 'Escalation'], rows: ms.map((m, i) => [D.MONTHS[m].label, fmt(s31[i], '%'), fmt(s33[i], '%'), fmt(s35[i], '%')]) }) });
    },
    C: function (host, f) {
      const ms = monthsWindow(f, 12), lbl = ms.map(m => D.MONTHS[m].short);
      const models = D.MODELS.filter(m => !state.f.mp || state.f.mp === 'M:' + m.id || state.f.mp === 'P:' + m.provider);
      const ser = models.map((md, i) => ({ name: md.name, color: SERIES(D.MODELS.indexOf(md) + 1), values: ms.map(m => { const q = E.ctx(Object.assign(subMonth(f, m), { mp: 'M:' + md.id })); return q.a('tokIn') + q.a('tokOut'); }) }));
      fig(host, { title: 'Token consumption by model, monthly', sub: 'Colour follows the model; filter by model / provider to isolate', legend: ser.map(s => ({ name: s.name, color: s.color })),
        render: el => C.columns(el, { labels: lbl, series: ser, fmt: v => fmt(v, 'tokens') }),
        table: () => ({ headers: ['Month'].concat(ser.map(s => s.name)), rows: ms.map((m, i) => [D.MONTHS[m].label].concat(ser.map(s => fmt(s.values[i], 'tokens', 'full')))) }), onOpen: () => openKpi(43) });
      const inf = ms.map(m => E.evaluate(61, subMonth(f, m))), infra = ms.map(m => E.evaluate(62, subMonth(f, m))), lic = ms.map(m => E.ctx(subMonth(f, m)).t('lic')), bud = ms.map(m => E.ctx(subMonth(f, m)).t('budAI'));
      fig(host, { title: 'AI operating cost vs budget, monthly', sub: 'Inference + infrastructure + licences against the approved AI budget (one AED axis)',
        legend: [{ name: 'Inference', color: SERIES(1) }, { name: 'Infrastructure', color: SERIES(2) }, { name: 'Licences', color: SERIES(3) }, { name: 'Approved budget', color: css('--text-2'), line: true }],
        render: el => C.columns(el, { labels: lbl, series: [{ name: 'Inference', color: SERIES(1), values: inf }, { name: 'Infrastructure', color: SERIES(2), values: infra }, { name: 'Licences', color: SERIES(3), values: lic }], line: { name: 'Approved budget', color: css('--text-2'), values: bud, dash: '4 3' }, fmt: aedAxis }),
        table: () => ({ headers: ['Month', 'Inference', 'Infrastructure', 'Licences', 'Budget'], rows: ms.map((m, i) => [D.MONTHS[m].label, fmt(inf[i], 'AED', 'full'), fmt(infra[i], 'AED', 'full'), fmt(lic[i], 'AED', 'full'), fmt(bud[i], 'AED', 'full')]) }), onOpen: () => openKpi(63) });
      const q = E.ctx(f);
      const tin = q.a('tokIn'), tc = q.a('tokCached'), tout = q.a('tokOut'), tr = q.a('tokReason');
      const mix = [{ label: 'Uncached input', values: [tin - tc], color: SERIES(1) }, { label: 'Cached input (inside input)', values: [tc], color: SERIES(3) }, { label: 'Visible output', values: [tout - tr], color: SERIES(2) }, { label: 'Reasoning (inside output)', values: [tr], color: SERIES(7) }];
      fig(host, { title: 'Token mix and double-count protection', sub: 'Total = input + output = ' + fmt(tin + tout, 'tokens') + '. A naive sum (input + output + cached + reasoning) would report ' + fmt(tin + tout + tc + tr, 'tokens') + ' (+' + ((tc + tr) / (tin + tout) * 100).toFixed(0) + '%).',
        render: el => C.hbars(el, { items: mix, fmt: v => fmt(v, 'tokens'), rowH: 30, labelW: 200 }),
        table: () => ({ headers: ['Component', 'Tokens'], rows: mix.map(x => [x.label, fmt(x.values[0], 'tokens', 'full')]) }), onOpen: () => openKpi(43) });
      const w52 = ms.map(m => E.evaluate(52, subMonth(f, m)));
      fig(host, { title: 'Token waste percentage, monthly', sub: 'Tokens spent on failed, retried or redundant work', render: el => C.line(el, { labels: lbl, series: [{ name: 'Token waste %', color: SERIES(2), values: w52 }], fmt: v => fmt(v, '%'), refs: [{ value: 5, label: 'Target 5%', color: css('--good') }, { value: 8, label: 'Warning 8%', color: css('--serious') }], area: true, height: 200, hiFrom: Math.max(0, 12 - (f.to - f.from + 1)) }),
        table: () => ({ headers: ['Month', 'Waste %'], rows: ms.map((m, i) => [D.MONTHS[m].label, fmt(w52[i], '%')]) }), onOpen: () => openKpi(52) });
    },
    D: function (host, f) {
      const items = D.MODELS.map((md, i) => {
        const q = E.ctx(Object.assign({}, f, { mp: 'M:' + md.id }));
        const el = q.a('req') - (q.a('eApp') + q.a('eRl') + q.a('eGw') + q.a('eNet'));
        const av = el > 0 ? (el - (q.a('eProv') + q.a('eSrv') + q.a('eTo'))) / el * 100 : null;
        const budget = av == null ? 0 : (100 - av) / (100 - md.slo) * 100;
        return { label: md.name + ' · ' + md.provider, values: [budget], color: budget >= 100 ? css('--critical') : budget >= 75 ? css('--serious') : SERIES(1), valueLabel: budget.toFixed(0) + '% · ' + (av == null ? 'n/a' : fmt(av, '%')), marker: 100, extra: [{ k: 'Availability', v: av == null ? 'n/a' : fmt(av, '%') }, { k: 'SLO', v: md.slo + '%' }] };
      }).filter((x, i) => !state.f.mp || state.f.mp === 'M:' + D.MODELS[i].id || state.f.mp === 'P:' + D.MODELS[i].provider);
      fig(host, { title: 'Error budget consumed per model deployment', sub: '(100 − availability) ÷ (100 − SLO) · 100% marker = SLO breached for the period', render: el => C.hbars(el, { items: items, fmt: v => v.toFixed(0) + '%', max: 120, labelW: 210, valW: 120, valueName: 'Error budget used' }),
        table: () => ({ headers: ['Deployment', 'Error budget used · availability'], rows: items.map(x => [x.label, x.valueLabel]) }), onOpen: () => openKpi(71) });
      const ms = monthsWindow(f, 12);
      const lanes = D.MODELS.map(m => m.name);
      const evs = E.ctx(Object.assign({}, f, { from: ms[0], to: f.to })).outM().map(o => ({ lane: D.MODELS.findIndex(m => m.id === o.mo), x: (o.m - ms[0]) + (o.day - 0.5) / D.MONTHS[o.m].days, dur: o.dur, color: sevColor(o.sev), title: o.id + ' · ' + I.MODEL[o.mo].name, rows: [{ k: 'Severity', v: o.sev }, { k: 'Cause', v: o.cause }, { k: 'Duration', v: o.dur + ' min' }, { k: 'MTTD / MTTR', v: o.mttd + ' / ' + o.mttr + ' min' }, { k: 'Fallback', v: o.fbTried ? (o.fbOk ? 'succeeded' : 'FAILED') : 'none configured' }, { k: 'Est. impact', v: fmt(o.impactEst, 'AED') }] }));
      fig(host, { title: 'Model outage history (last 12 months)', sub: 'Dot size = duration · colour = severity (Critical / High / Medium)', legend: [{ name: 'Critical', color: css('--critical') }, { name: 'High', color: css('--serious') }, { name: 'Medium', color: css('--watch') }],
        render: el => C.timeline(el, { months: ms.map(m => D.MONTHS[m].short), lanes: lanes, events: evs }),
        table: () => ({ headers: ['Outage', 'Model', 'Severity', 'Minutes', 'Cause'], rows: evs.map(e => [e.title.split(' · ')[0], e.title.split(' · ')[1], e.rows[0].v, e.dur, e.rows[1].v]) }), onOpen: () => openKpi(72) });
      const q = E.ctx(f);
      const tax = [['Provider 5xx (model availability)', q.a('eProv')], ['Internal model-serving 5xx (model availability)', q.a('eSrv')], ['Timeouts (model availability)', q.a('eTo')], ['Rate limited 429 (quota, not availability)', q.a('eRl')], ['Gateway failures (infrastructure)', q.a('eGw')], ['Network failures (infrastructure)', q.a('eNet')], ['Client / application errors 4xx (excluded)', q.a('eApp')]];
      fig(host, { title: 'Failure taxonomy: who failed?', sub: 'Provider outages, internal serving, throttling, local infrastructure and application errors are counted separately', render: el => C.hbars(el, { items: tax.map((t, i) => ({ label: t[0], values: [t[1]], color: i < 3 ? SERIES(1) : i === 3 ? SERIES(4) : i < 6 ? SERIES(2) : css('--deemph') })), fmt: v => fmt(v, 'count'), labelW: 260 }),
        table: () => ({ headers: ['Category', 'Requests'], rows: tax.map(t => [t[0], fmt(t[1], 'count', 'full')]) }) });
      const bsa = businessServiceAvailability(f);
      const box = document.createElement('div'); box.className = 'fig';
      box.innerHTML = '<div class="fig-head"><div><div class="fig-title">Business-service vs request-level availability</div><div class="fig-sub">Critical workflows · business-service availability = 1 − outage impact minutes ÷ period minutes (fallback shortens impact); request-level availability also counts transient errors outside declared outages</div></div></div><div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Critical workflow</th><th class="r">Outages</th><th class="r">Impact min</th><th class="r">Business-service</th><th class="r">Request-level</th></tr></thead><tbody>' +
        bsa.map(r => '<tr class="click" data-kpi="71" data-wf="' + r.id + '"><td>' + esc(r.name) + '</td><td class="r num">' + r.n + '</td><td class="r num">' + Math.round(r.min) + '</td><td class="r num">' + fmt(r.bsa, '%') + '</td><td class="r num">' + (r.req == null ? 'n/a' : fmt(r.req, '%')) + '</td></tr>').join('') + '</tbody></table></div>';
      host.appendChild(box);
    },
    E: function (host, f) {
      const qn = E.ctx(f).quotaNow();
      const days = []; for (let d = 1; d <= 30; d++) days.push(d);
      const ser = qn.map(x => ({ name: I.MODEL[x.mo].name, color: SERIES(D.MODELS.findIndex(m => m.id === x.mo) + 1), values: days.map(d => x.used / x.elapsed * d / x.commit * 100) }));
      fig(host, { title: 'Quota exhaustion forecast: November 2026', sub: 'Cumulative consumption as % of the monthly commitment: solid = actual to day ' + D.AS_OF.mtdDaysElapsed + ', dashed = projection at current burn rate; quota resets ' + D.AS_OF.resetLabel, legend: ser.map(s => ({ name: s.name, color: s.color, line: true })),
        render: el => C.line(el, { labels: days.map(d => String(d)), series: ser, fmt: v => v.toFixed(0) + '%', refs: [{ value: 100, label: 'Commitment 100%', color: css('--critical') }], endLabels: true, height: 230, zero: true, hiFrom: Math.ceil(D.AS_OF.mtdDaysElapsed), dashFrom: Math.floor(D.AS_OF.mtdDaysElapsed) - 1 }),
        table: () => ({ headers: ['Deployment', 'Used MTD', 'Commitment', 'Projected', 'Exhaustion day'], rows: qn.map(x => [I.MODEL[x.mo].name, fmt(x.used, 'tokens'), fmt(x.commit, 'tokens'), fmt(x.used / x.elapsed * x.days / x.commit * 100, '%'), (x.commit / (x.used / x.elapsed)).toFixed(1)]) }), onOpen: () => openKpi(97) });
      const ms = monthsWindow(f, 12), lbl = ms.map(m => D.MONTHS[m].short);
      const tpm = ms.map(m => E.evaluate(91, subMonth(f, m))), rpm = ms.map(m => E.evaluate(92, subMonth(f, m)));
      fig(host, { title: 'Throttling episodes, monthly', sub: 'TPM vs RPM limit episodes (grouped)', legend: [{ name: 'TPM episodes', color: SERIES(1) }, { name: 'RPM episodes', color: SERIES(2) }],
        render: el => C.columns(el, { labels: lbl, series: [{ name: 'TPM episodes', color: SERIES(1), values: tpm }, { name: 'RPM episodes', color: SERIES(2), values: rpm }], stacked: false, fmt: v => fmt(v, 'count') }),
        table: () => ({ headers: ['Month', 'TPM', 'RPM'], rows: ms.map((m, i) => [D.MONTHS[m].label, tpm[i], rpm[i]]) }), onOpen: () => openKpi(91) });
      const q = E.ctx(f);
      const lo = byAgent(q, 'loops'), an = byAgent(q, 'tokAnom');
      const ag = uniq(Object.keys(lo).concat(Object.keys(an))).map(a => ({ label: I.AGENT[a].name, values: [lo[a] || 0, an[a] || 0] })).sort((a, b) => (b.values[0] + b.values[1]) - (a.values[0] + a.values[1])).slice(0, 10);
      fig(host, { title: 'Runaway loops and excessive consumption by agent', sub: 'Top 10 agents · alerts on uncontrolled retries and circular agent-to-agent calls', cls: 'wide', legend: [{ name: 'Runaway loops', color: SERIES(2) }, { name: 'Excessive-consumption sessions', color: SERIES(4) }],
        render: el => C.hbars(el, { items: ag, series: [{ name: 'Runaway loops', color: SERIES(2) }, { name: 'Excessive sessions', color: SERIES(4) }], fmt: v => fmt(v, 'count') }),
        table: () => ({ headers: ['Agent', 'Loops', 'Excessive sessions'], rows: ag.map(x => [x.label, x.values[0], x.values[1]]) }), onOpen: () => openKpi(96) });
    },
    F: function (host, f) {
      const q = E.ctx(f);
      const items = D.COMPONENTS.map(c => { const rows = q.infRows(c.id); const req = sum(rows, 'req'), ok = sum(rows, 'ok'); const mins = sum(q.outI().filter(o => o.comp === c.id), 'dur'); return { label: c.name, values: [mins], color: SERIES(2), valueLabel: mins + ' min · ' + (req ? fmt(ok / req * 100, '%') : 'n/a'), extra: [{ k: 'Availability', v: req ? fmt(ok / req * 100, '%') : 'n/a' }] }; });
      fig(host, { title: 'Infrastructure downtime by component', sub: 'Outage minutes in period · request-level availability shown alongside', render: el => C.hbars(el, { items: items, fmt: v => fmt(v, 'mins'), labelW: 190, valW: 130, valueName: 'Downtime' }),
        table: () => ({ headers: ['Component', 'Downtime · availability'], rows: items.map(x => [x.label, x.valueLabel]) }), onOpen: () => openKpi(103) });
      const ms = monthsWindow(f, 12);
      const evs = E.ctx(Object.assign({}, f, { from: ms[0] })).outI().map(o => ({ lane: D.COMPONENTS.findIndex(c => c.id === o.comp), x: (o.m - ms[0]) + (o.day - 0.5) / D.MONTHS[o.m].days, dur: o.dur, color: sevColor(o.sev), title: o.id + ' · ' + I.COMP[o.comp].name, rows: [{ k: 'Severity', v: o.sev }, { k: 'Cause', v: o.cause }, { k: 'Duration', v: o.dur + ' min' }, { k: 'Failover', v: o.foTried ? (o.foOk ? 'succeeded' : 'FAILED') : 'n/a' }, { k: 'Affected agents', v: String(o.agents.length) }, { k: 'Est. impact', v: fmt(o.impactEst, 'AED') }] }));
      fig(host, { title: 'Infrastructure outage timeline (last 12 months)', sub: 'Linked to affected agents and workflows', legend: [{ name: 'Critical', color: css('--critical') }, { name: 'High', color: css('--serious') }, { name: 'Medium', color: css('--watch') }],
        render: el => C.timeline(el, { months: ms.map(m => D.MONTHS[m].short), lanes: D.COMPONENTS.map(c => c.name), events: evs }),
        table: () => ({ headers: ['Outage', 'Component', 'Severity', 'Minutes'], rows: evs.map(e => [e.title.split(' · ')[0], e.title.split(' · ')[1], e.rows[0].v, e.dur]) }), onOpen: () => openKpi(102) });
      const ms24 = monthsWindow(f, 18), lbl = ms24.map(m => D.MONTHS[m].short);
      const util = ms24.map(m => E.evaluate(106, subMonth(f, m))), peak = ms24.map(m => { const qq = E.ctx(subMonth(f, m)); const g = qq.infL('gpus', 'gpu'); return g ? qq.infL('peak', 'gpu') / g * 100 : null; });
      fig(host, { title: 'GPU utilisation vs peak demand (% of capacity)', sub: 'Capacity expansions in Nov 2025 (+16), Mar 2026 (+8) and Jul 2026 (+16 GPUs); demand is closing the gap again', cls: 'wide', legend: [{ name: 'Average utilisation', color: SERIES(1), line: true }, { name: 'Peak demand', color: SERIES(2), line: true }],
        render: el => C.line(el, { labels: lbl, series: [{ name: 'Average utilisation', color: SERIES(1), values: util }, { name: 'Peak demand', color: SERIES(2), values: peak }], fmt: v => fmt(v, '%'), refs: [{ value: 100, label: 'Capacity', color: css('--critical') }, { value: 80, label: '20% headroom', color: css('--watch') }], endLabels: true, height: 220, zero: true }),
        table: () => ({ headers: ['Month', 'Utilisation', 'Peak'], rows: ms24.map((m, i) => [D.MONTHS[m].label, fmt(util[i], '%'), fmt(peak[i], '%')]) }), onOpen: () => openKpi(109) });
    },
    G: function (host, f) {
      const hd = heatData(f);
      fig(host, { title: 'Agentic AI risk heatmap', sub: 'Business unit × risk category · click a cell to open the worst KRI', cls: 'wide',
        render: el => C.heatmap(el, { rows: hd.rows, cols: hd.cols, values: hd.values, onClick: (i, j) => { const ids = HEAT_CATS[j].ids; const ff = Object.assign({}, f, { bu: hd.bus[i].id }); const worst = ids.slice().sort((a, b) => (riskFor(ff, b) || 0) - (riskFor(ff, a) || 0))[0]; state.f.bu = hd.bus[i].id; navigate({ kpi: worst }); }, extra: (i, j) => [{ k: 'KRIs', v: HEAT_CATS[j].ids.map(x => '#' + x).join(' ') }] }),
        after: C.heatLegend(), table: () => ({ headers: ['Business unit'].concat(hd.cols), rows: hd.rows.map((r, i) => [r].concat(hd.values[i].map(v => v == null ? 'n/a' : Math.round(v)))) }) });
      const ms = monthsWindow(f, 12), lbl = ms.map(m => D.MONTHS[m].short);
      const apps = ms.map(m => E.ctx(subMonth(f, m)).shadowAppsFound().length), ags = ms.map(m => E.ctx(subMonth(f, m)).shadowAgentsFound().length), act = ms.map(m => E.ctx(subMonth(f, m)).shadowApps().length);
      fig(host, { title: 'Shadow AI discovery trend', sub: 'New discoveries per month and active unsanctioned apps', legend: [{ name: 'New shadow AI apps', color: SERIES(5) }, { name: 'New shadow agents', color: SERIES(7) }, { name: 'Active shadow AI apps', color: css('--text-2'), line: true }],
        render: el => C.columns(el, { labels: lbl, series: [{ name: 'New shadow AI apps', color: SERIES(5), values: apps }, { name: 'New shadow agents', color: SERIES(7), values: ags }], line: { name: 'Active shadow AI apps', color: css('--text-2'), values: act }, fmt: v => fmt(v, 'count') }),
        table: () => ({ headers: ['Month', 'New apps', 'New agents', 'Active apps'], rows: ms.map((m, i) => [D.MONTHS[m].label, apps[i], ags[i], act[i]]) }), onOpen: () => openKpi(125) });
      const per10k = ms.map(m => { const q = E.ctx(subMonth(f, m)); return q.a('toolExec') ? q.a('toolUnAtt') / q.a('toolExec') * 1e4 : null; });
      const okU = ms.map(m => E.ctx(subMonth(f, m)).a('toolUnOk')), okP = ms.map(m => E.ctx(subMonth(f, m)).a('piOk'));
      fig(host, { title: 'Tool-call authorisation: unauthorized attempts per 10,000 calls', sub: 'Attempts denied or flagged by the tool gateway', render: el => C.line(el, { labels: lbl, series: [{ name: 'Unauthorized attempts / 10k calls', color: SERIES(2), values: per10k }], fmt: v => v.toFixed(1), refs: [{ value: 5, label: 'Target 5', color: css('--good') }], area: true, height: 190 }),
        table: () => ({ headers: ['Month', 'Per 10k calls'], rows: ms.map((m, i) => [D.MONTHS[m].label, per10k[i] == null ? 'n/a' : per10k[i].toFixed(2)]) }), onOpen: () => openKpi(128) });
      fig(host, { title: 'Violations that got through, monthly', sub: 'Executed unauthorized tool calls and successful prompt injections (target zero)', legend: [{ name: 'Executed unauthorized tool calls', color: SERIES(8) }, { name: 'Successful prompt injections', color: SERIES(5) }],
        render: el => C.columns(el, { labels: lbl, series: [{ name: 'Executed unauthorized tool calls', color: SERIES(8), values: okU }, { name: 'Successful prompt injections', color: SERIES(5), values: okP }], stacked: false, fmt: v => fmt(v, 'count') }),
        table: () => ({ headers: ['Month', 'Unauthorized executed', 'Prompt injections'], rows: ms.map((m, i) => [D.MONTHS[m].label, okU[i], okP[i]]) }), onOpen: () => openKpi(129) });
      const bus = D.BUS.filter(b => !state.f.bu || b.id === state.f.bu);
      const fi = bus.map(b => { const ff = Object.assign({}, f, { bu: b.id, tn: '' }); return { label: b.name, values: [E.evaluate(149, ff) || 0, E.evaluate(137, ff) || 0, E.evaluate(141, ff) || 0, E.evaluate(139, ff) || 0] }; });
      const ns = ['Critical agent gaps', 'Excess-privilege agents', 'Agents without kill switch', 'Unregistered MCP servers'];
      fig(host, { title: 'Critical findings by business unit', sub: 'Open at period end', cls: 'wide', legend: ns.map((n, i) => ({ name: n, color: SERIES(i + 1) })),
        render: el => C.hbars(el, { items: fi, series: ns.map((n, i) => ({ name: n, color: SERIES(i + 1) })), fmt: v => fmt(v, 'count') }),
        table: () => ({ headers: ['Business unit'].concat(ns), rows: fi.map(x => [x.label].concat(x.values)) }) });
    },
    H: function (host, f) {
      const q = E.ctx(f);
      const inst = q.ctlInst();
      const fws = D.FRAMEWORKS.filter(w => !state.f.fw || w.id === state.f.fw).map(w => {
        const xs = inst.filter(x => x.fw.indexOf(w.id) >= 0);
        const impl = xs.filter(x => x.implFrom != null && x.implFrom <= f.to).length;
        const tested = xs.filter(x => latestTestOf(x, f.to));
        const eff = tested.filter(x => latestTestOf(x, f.to).effective).length;
        return { label: w.name, n: xs.length, impl: xs.length ? impl / xs.length * 100 : null, eff: tested.length ? eff / tested.length * 100 : null };
      }).filter(x => x.n > 0);
      fig(host, { title: 'Control implementation vs tested effectiveness, by framework', sub: 'Applicable control instances only (applicability determined per BU before scoring) · effectiveness n/a = no test in the last 12 months', cls: 'wide', legend: [{ name: 'Implemented %', color: SERIES(1) }, { name: 'Tested effective %', color: SERIES(3) }],
        render: el => C.hbars(el, { items: fws.map(x => ({ label: x.label, values: [x.impl, x.eff] })), series: [{ name: 'Implemented %', color: SERIES(1) }, { name: 'Tested effective %', color: SERIES(3) }], grouped: true, max: 100, rowH: 32, labelW: 300, valW: 52, fmt: v => fmt(v, '%') }),
        table: () => ({ headers: ['Framework', 'Applicable instances', 'Implemented', 'Effective'], rows: fws.map(x => [x.label, x.n, x.impl == null ? 'n/a' : fmt(x.impl, '%'), x.eff == null ? 'n/a' : fmt(x.eff, '%')]) }), onOpen: () => openKpi(154) });
      const box = document.createElement('div'); box.className = 'fig wide';
      box.innerHTML = '<div class="fig-head"><div><div class="fig-title">Framework applicability matrix</div><div class="fig-sub">Compliance score = implemented and effective ÷ applicable controls · N/A = framework not applicable to the BU (excluded from scoring)</div></div></div>' + applicabilityMatrix(f);
      host.appendChild(box);
      const ms = monthsWindow(f, 12), lbl = ms.map(m => D.MONTHS[m].short);
      const opened = ms.map(m => q.findings().filter(x => x.m === m).length), closed = ms.map(m => q.findings().filter(x => x.closed === m).length);
      fig(host, { title: 'AI audit findings opened vs closed', sub: 'Monthly · closure discipline drives KPI 157', legend: [{ name: 'Opened', color: SERIES(2) }, { name: 'Closed', color: SERIES(3) }],
        render: el => C.columns(el, { labels: lbl, series: [{ name: 'Opened', color: SERIES(2), values: opened }, { name: 'Closed', color: SERIES(3), values: closed }], stacked: false, fmt: v => fmt(v, 'count') }),
        table: () => ({ headers: ['Month', 'Opened', 'Closed'], rows: ms.map((m, i) => [D.MONTHS[m].label, opened[i], closed[i]]) }), onOpen: () => openKpi(157) });
      const cov = [151, 152, 153, 158, 159, 160, 161, 162].map(id => { const r = E.quick(id, f); return { label: K[id].name, values: [r.value || 0], color: statusColor(r.status), valueLabel: fmt(r.value, '%'), marker: r.tgt, extra: [{ k: 'Target', v: fmt(r.tgt, '%') }, { k: 'Status', v: ST_LABEL[r.status] }] }; });
      fig(host, { title: 'Governance & assurance coverage', sub: 'Bar colour = status · tick = target', render: el => C.hbars(el, { items: cov, fmt: v => fmt(v, '%'), max: 100, labelW: 230 }),
        table: () => ({ headers: ['Indicator', 'Value'], rows: cov.map(x => [x.label, x.valueLabel]) }) });
    }
  };
  function latestTestOf(inst, m) { let t = null; inst.tests.forEach(x => { if (x.m <= m && x.m >= m - 11) t = x; }); return t; }
  function applicabilityMatrix(f) {
    const bus = D.BUS.filter(b => !state.f.bu || b.id === state.f.bu);
    const fws = D.FRAMEWORKS.filter(w => !state.f.fw || w.id === state.f.fw);
    let h = '<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Framework</th>' + bus.map(b => '<th class="r">' + esc(b.id) + '</th>').join('') + '</tr></thead><tbody>';
    fws.forEach(w => {
      h += '<tr><td title="' + esc(w.note) + '">' + esc(w.name) + '</td>';
      bus.forEach(b => {
        if (w.bu.indexOf(b.id) < 0) { h += '<td class="r muted">N/A</td>'; return; }
        const xs = D.ctlInst.filter(x => x.applicable && x.bu === b.id && x.fw.indexOf(w.id) >= 0 && (!state.f.ctl || x.family === state.f.ctl));
        if (!xs.length) { h += '<td class="r muted">-</td>'; return; }
        const ok = xs.filter(x => x.implFrom != null && x.implFrom <= f.to && (() => { const t = latestTestOf(x, f.to); return !t || t.effective; })()).length;
        const sc = ok / xs.length * 100;
        const st = sc >= 90 ? 'good' : sc >= 80 ? 'watch' : sc >= 70 ? 'serious' : 'critical';
        h += '<td class="r"><span class="pill st-' + st + '">' + sc.toFixed(0) + '%</span></td>';
      });
      h += '</tr>';
    });
    return h + '</tbody></table></div><div class="tbl-note">Illustrative applicability; confirm with Legal / Compliance. Hover a framework for its scoping note.</div>';
  }
  function businessServiceAvailability(f) {
    const q = E.ctx(Object.assign({}, f, { wf: '' }));
    const minutes = q.days * 1440;
    const outs = q.outM().concat(q.outI());
    return D.WORKFLOWS.filter(w => w.crit && (!state.f.wf || state.f.wf === w.id)).map(w => {
      let n = 0, min = 0;
      outs.forEach(o => {
        if (o.wfs.indexOf(w.id) < 0) return;
        n++;
        const affected = o.agents.map(a => I.AGENT[a]).filter(a => a.wf === w.id);
        const protectedAll = affected.length && affected.every(a => (o.kind === 'model' ? (a.fallback && o.fbOk) : o.foOk));
        min += protectedAll ? Math.min(o.dur, o.mttd + 4) : o.dur;
      });
      const req = E.evaluate(71, Object.assign({}, f, { wf: w.id }));
      return { id: w.id, name: w.name, n: n, min: min, bsa: (1 - min / minutes) * 100, req: req };
    });
  }

  // ------------------------------------------------------------------ page: alerts
  function pageAlerts(main) {
    const f = filt();
    const all = computeAlerts(f);
    const list = state.alertSev ? all.filter(a => a.sev === state.alertSev) : all;
    const cnt = s => all.filter(a => a.sev === s).length;
    main.innerHTML = '<div class="page-head"><div><div class="crumbs">Level 1 · Risk alerts and executive decisions</div><h2>Risk alerts & executive decisions</h2><p class="sub">Generated from threshold logic over the KPIs and underlying records. Each alert names the affected critical services, owner, business impact, mitigation, remediation deadline and the executive decision required.</p></div>' + scopeLine(f) + '</div>' +
      '<div class="toolbar"><button class="btn' + (!state.alertSev ? ' primary' : '') + '" data-sev="">All (' + all.length + ')</button>' + ['Critical', 'High', 'Medium'].map(s => '<button class="btn' + (state.alertSev === s ? ' primary' : '') + '" data-sev="' + s + '">' + s + ' (' + cnt(s) + ')</button>').join('') + '</div>' +
      '<div class="alert-list">' + (list.length ? list.map(a => '<article class="alert ' + a.sev + '" id="' + a.id + '"><div><h4><span class="sev ' + a.sev + '">' + a.sev + '</span>' + esc(a.title) + ' <span class="muted small">' + a.id + '</span></h4><div class="meta"><span>Owner: ' + esc(a.owner) + '</span><span>Remediation deadline: <b>' + a.due + '</b></span><span>Linked KPIs: ' + a.kpis.map(id => '<button class="link-kpi" data-kpi="' + id + '">#' + id + '</button>').join(' ') + '</span></div><div class="body">' + esc(a.impact) + '</div><div class="decision"><b>Executive decision required:</b> ' + esc(a.decision) + '</div></div>' +
        '<dl><dt>Affected critical services</dt><dd>' + esc((a.services || []).join(', ') || '-') + '</dd><dt>Mitigation</dt><dd>' + esc(a.mitigation) + '</dd><dt>Deadline</dt><dd>' + a.due + ' (' + ({ Critical: '7', High: '14', Medium: '30' })[a.sev] + ' days from ' + esc(D.AS_OF.label) + ')</dd></dl></article>').join('') : '<div class="empty">No alerts for this scope.</div>') + '</div>' + footer();
  }

  // ------------------------------------------------------------------ page: trace explorer
  function pageTrace(main) {
    const f = filt();
    const agents = D.AGENTS.filter(a => (!f.bu || a.bu === f.bu) && (!f.tn || a.tenant === f.tn) && (!f.app || a.app === f.app) && (!f.wf || a.wf === f.wf) && D.isRunning(a, f.to));
    if (f.agent) state.traceAgent = f.agent;
    if (!agents.some(a => a.id === state.traceAgent)) state.traceAgent = (agents.find(a => a.id === 'GSS-PHISH') || agents[0] || {}).id || '';
    const m = state.traceMonth != null && state.traceMonth >= f.from && state.traceMonth <= f.to ? state.traceMonth : f.to;
    const ses = state.traceAgent ? D.sessions(state.traceAgent, m, 16) : [];
    const sel = ses.find(s => s.id === state.session) || ses[0];
    const a = I.AGENT[state.traceAgent];
    main.innerHTML = '<div class="page-head"><div><div class="crumbs">Explore · Agent-level activity tracing</div><h2>Agent trace explorer</h2><p class="sub">User → Agent → Session → Model → Tool → Action → Resource → Authorization → Result. Sessions that show security events (unauthorized tool calls, blocked high-risk actions, prompt injection, sensitive data, shadow MCP, delegation, loops) are listed first.</p></div>' + scopeLine(f) + '</div>' +
      '<div class="toolbar"><label class="small muted" for="trAgent">Agent</label><select id="trAgent">' + agents.map(x => opt(x.id, x.name + ' · ' + x.tenant, x.id === state.traceAgent)).join('') + '</select><label class="small muted" for="trMonth">Month</label><select id="trMonth">' + D.MONTHS.filter(mm => mm.i >= f.from && mm.i <= f.to).map(mm => opt(mm.i, mm.label, mm.i === m)).join('') + '</select>' + (a ? '<span class="chip">' + esc(I.WF[a.wf].name) + '</span><span class="chip">' + esc(a.autonomy) + '</span><span class="chip">Primary: ' + esc(I.MODEL[a.primary].name) + '</span><span class="chip">Fallback: ' + esc(a.fallback ? I.MODEL[a.fallback].name : 'none') + '</span>' : '') + '</div>' +
      '<div class="trace-layout"><div>' + sessionTable(ses, sel) + '</div><div id="traceView">' + (sel ? traceView(sel) : '<div class="empty">Select an agent with activity.</div>') + '</div></div>' + footer();
  }
  const FLAG = { unauth_ok: ['Unauthorized tool executed', 'critical'], hr_exec: ['High-risk action executed', 'critical'], hr_blocked: ['High-risk action blocked', 'watch'], pi_ok: ['Prompt injection succeeded', 'critical'], pi_blocked: ['Prompt injection blocked', 'watch'], sens: ['Sensitive data exposed', 'serious'], a2a: ['Unapproved delegation', 'serious'], loop: ['Runaway loop terminated', 'serious'], shadow_mcp: ['Shadow MCP server', 'serious'] };
  function sessionTable(ses, sel) {
    return '<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Session · time · user</th><th>Model</th><th class="r">Tokens</th><th>Signal</th></tr></thead><tbody>' + ses.map(s => '<tr class="click" tabindex="0" data-session="' + s.id + '"' + (sel && s.id === sel.id ? ' style="background:var(--surface-3)"' : '') + '><td class="small"><span class="num nowrap" style="color:var(--text-1)">' + esc(s.id) + '</span><div class="muted nowrap">' + esc(s.ts) + ' · ' + esc(s.user) + '</div></td><td class="small">' + esc(I.MODEL[s.model].name) + '</td><td class="r num small">' + fmt(s.tokens, 'tokens') + '</td><td class="nowrap">' + (s.flag ? '<span class="pill st-' + FLAG[s.flag][1] + '">' + esc(FLAG[s.flag][0]) + '</span>' : '<span class="pill st-good">' + ICON.good + 'Clean</span>') + '</td></tr>').join('') + '</tbody></table></div><div class="tbl-note">Sessions are synthetic and generated consistently with the agent\'s monthly security counters.</div>';
  }
  function traceView(s) {
    const total = s.dur || 1;
    return '<div class="fig"><div class="fig-head"><div><div class="fig-title">' + esc(s.id) + '</div><div class="fig-sub">' + esc(s.ts) + ' · ' + esc(I.AGENT[s.agent].name) + ' · ' + (total / 1000).toFixed(1) + ' s end to end</div></div></div>' +
      '<div class="trace-path">' + ['User', 'Agent', 'Session', 'Model', 'Tool', 'Action', 'Resource', 'Authorization', 'Result'].map((x, i) => (i ? '<span>→</span>' : '') + '<span class="st">' + x + '</span>').join('') + '</div>' +
      '<div class="span-list">' + s.steps.map(st => {
        const bad = /NOT AUTHORIZED|without approval|Bypassed|control gap|Unregistered/i.test(st.auth + st.result);
        const warn = !bad && /Blocked|DLP|terminated|Flagged|legacy|partial/i.test(st.auth + st.result + st.detail);
        return '<div class="span' + (bad ? ' bad' : warn ? ' warn' : '') + '"><div class="type">' + esc(st.type) + '<div class="muted" style="font-weight:500;text-transform:none;letter-spacing:0">+' + (st.t / 1000).toFixed(2) + ' s</div></div><div><div class="nm">' + esc(st.name) + '</div><div class="dt">' + esc(st.detail) + '</div><div class="au"><span class="muted">Authorization:</span> ' + esc(st.auth) + ' · <span class="muted">Result:</span> ' + esc(st.result) + '</div><div class="bar"><i style="left:' + (st.t / total * 100).toFixed(1) + '%;width:' + Math.max(1, st.dur / total * 100).toFixed(1) + '%"></i></div></div></div>';
      }).join('') + '</div></div>';
  }

  // ------------------------------------------------------------------ page: catalog
  function pageCatalog(main) {
    const f = filt();
    const qy = state.catQuery.toLowerCase();
    const rows = LIST.filter(k => (!state.catDom || k.dom === state.catDom) && (!qy || (k.name + ' ' + k.def + ' ' + k.formula + ' ' + k.owner + ' ' + k.id).toLowerCase().indexOf(qy) >= 0)).map(k => ({ k: k, r: E.quick(k.id, f) })).filter(x => !state.catStatus || x.r.status === state.catStatus);
    main.innerHTML = '<div class="page-head"><div><div class="crumbs">Explore · KPI / KRI catalog and formula data dictionary</div><h2>KPI catalog: ' + LIST.length + ' indicators</h2><p class="sub">164 catalogued KPIs / KRIs (domains A-H) plus 6 composite executive indices. Each has a definition, formula, unit, sources, frequency, owner, target, warning and critical thresholds, evidence and drill-down.</p></div>' + scopeLine(f) + '</div>' +
      '<div class="toolbar"><input type="search" id="catQ" placeholder="Search name, definition, formula, owner…" value="' + esc(state.catQuery) + '"><select id="catDom"><option value="">All domains</option>' + Object.keys(DOM).map(c => opt(c, c + '. ' + DOM[c].short, state.catDom === c)).join('') + '</select><select id="catSt"><option value="">All statuses</option>' + ['critical', 'serious', 'watch', 'good', 'info'].map(s => opt(s, ST_LABEL[s], state.catStatus === s)).join('') + '</select><span class="muted small">' + rows.length + ' shown</span><button class="btn" id="catCsv">Export CSV</button><button class="btn" id="catXlsx">Export Excel</button></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Dom.</th><th>KPI / KRI and definition</th><th>Formula</th><th>Unit</th><th class="r">Value</th><th>Target / Warn / Crit</th><th>Status</th><th>Owner · frequency</th><th>Sources</th></tr></thead><tbody>' +
      rows.map(x => { const k = x.k, r = x.r; const u = k.statusOf ? statusUnit(k) : k.unit; return '<tr class="click" data-kpi="' + k.id + '"><td class="num muted">' + esc(String(k.id)) + '</td><td>' + k.dom + '</td><td><div class="kname">' + esc(k.name) + '</div><div class="def">' + esc(k.def) + '</div></td><td class="small" style="min-width:220px;font-family:var(--mono);font-size:11.5px">' + esc(k.formula) + '</td><td class="small">' + esc(EN.unitWord(k.unit)) + '</td><td class="r num nowrap"><b>' + esc(fmt(r.value, k.unit)) + '</b></td><td class="small nowrap">' + (k.dir === 'none' ? 'Informational' : esc(fmt(r.tgt, u) + ' / ' + fmt(r.warn, u) + ' / ' + fmt(r.crit, u))) + '<div class="muted">' + (k.dir === 'up' ? 'higher is better' : k.dir === 'down' ? 'lower is better' : '') + '</div></td><td>' + pill(r.status) + '</td><td class="small">' + esc(k.owner) + '<div class="muted">' + esc(k.freq) + '</div></td><td class="small">' + esc((k.src || []).join(', ')) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + footer();
  }

  // ------------------------------------------------------------------ page: methodology
  function pageMethod(main) {
    const f = filt();
    const comp = ['X1', 'X2', 'X6'].map(id => { const k = K[id]; return '<div class="doc-card"><h4>' + esc(k.name) + ' <span class="muted small">(' + id + ')</span></h4><p>' + esc(k.def) + '</p><div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Component group</th><th>KPIs</th><th class="r">Weight</th></tr></thead><tbody>' + k.groups.map(g => '<tr><td>' + esc(g.label) + '</td><td class="small">' + g.ids.map(x => '<button class="link-kpi" data-kpi="' + x + '">' + (String(x).charAt(0) === 'X' ? x : '#' + x) + '</button>').join(' ') + '</td><td class="r num">' + Math.round(g.w * 100) + '%</td></tr>').join('') + '</tbody></table></div><p class="small muted" style="margin-top:6px">Target ≤ ' + k.tgt + ', warning ' + k.warn + ', critical ' + k.crit + '.</p></div>'; }).join('');
    main.innerHTML = '<div class="page-head"><div><div class="crumbs">Explore · Methodology, data architecture and data quality</div><h2>Methodology & data</h2><p class="sub">How every number is produced: calculation rules, normalisation, attribution, data architecture, identifiers and data quality. Full deliverables live in the repository <code>docs/</code> folder.</p></div></div>' +
      '<div class="method-grid">' +
      '<div class="doc-card"><h4>Data accuracy principles</h4><ul><li>No actual enterprise metrics are invented. Every value here is <b>synthetic sample data</b>, labelled as such on every page and export.</li><li>Financial cost savings (Finance-approved), confirmed loss prevention (verified, de-duplicated), estimated risk reduction (FAIR) and productivity capacity are reported separately and never summed.</li><li>An incident\'s financial benefit is counted once; control attribution weights sum to 100%.</li><li>Agent efficiency always includes human review, waiting, retries and rework.</li><li>Cached tokens sit inside input and reasoning tokens inside output; neither is added twice.</li><li>Provider outages, internal serving failures, gateway / network failures, throttling (429) and client errors are separated.</li><li>Request-level and business-service availability are tracked separately.</li><li>Control implementation is measured separately from tested effectiveness.</li><li>Data quality, freshness, confidence and unavailable measurements are shown for every KPI.</li></ul></div>' +
      '<div class="doc-card"><h4>Calculation rules</h4><ul><li><b>Ratios are re-computed from summed numerators and denominators</b> for any filter or period. Percentages are never averaged.</li><li><b>Flow measures</b> (tasks, tokens, cost, incidents) sum over the period; <b>snapshot measures</b> (inventories, coverage, headroom) use the period-end state.</li><li><b>Percentiles</b> (P95) use nearest rank on pooled samples, stratified in proportion to volume.</li><li><b>Comparison period</b>: prior-year YTD for YTD, otherwise the preceding period of equal length.</li><li><b>Absolute targets</b> scale with months in period and with the selected BU\'s share (baseline risk, tasks or tokens). Targets are suppressed for slices where they are not meaningful (e.g. a single model).</li><li><b>Filters</b> apply only where the underlying fact carries that dimension; each KPI shows applied / partial / not-applicable filters.</li><li><b>Missing data</b> is excluded and flagged, never imputed. Rules are stated per KPI.</li></ul></div>' +
      '<div class="doc-card"><h4>RAG thresholds and normalised risk</h4><p>Each KPI has a direction, a target, a warning and a critical threshold. Status: <b>On target</b> (meets target), <b>Watch</b> (misses target, better than warning), <b>Warning</b> (at or beyond warning), <b>Critical</b> (at or beyond critical). Normalised risk is linear: 0 at target, 50 at warning, 100 at critical. Composite indices are weighted averages of normalised risks.</p><div style="margin-top:8px">' + ['good', 'watch', 'serious', 'critical', 'info'].map(pill).join(' ') + '</div></div>' +
      '<div class="doc-card"><h4>Financial attribution methodology</h4><ul><li>Each verified incident carries a Finance / Risk-validated prevented-loss value.</li><li>Every involved control submits a claim (gross claims overlap).</li><li>De-duplication on incident ID keeps one value per incident; attribution weights: primary control 50%, the remaining 50% split equally across contributing controls.</li><li>Savings are Finance-approved, dated cost reductions; pending and rejected entries are excluded.</li><li>Estimated loss avoidance = baseline ALE − residual ALE (FAIR, annualised, as at period end).</li><li>Productivity value = hours saved × fully loaded BU rate (capacity, not cash).</li></ul></div>' +
      comp +
      '<div class="doc-card arch" style="grid-column:1/-1"><h4>Logical data architecture</h4>' + archSvg() + '</div>' +
      '<div class="doc-card"><h4>Normalised identifiers</h4><p>Every fact and record is keyed on shared identifiers so drill-down works from enterprise to individual event:</p><ul>' + ['Agent ID', 'Model and provider ID', 'Business unit / customer (tenant) ID', 'Application ID', 'Workflow ID', 'Task ID', 'Session ID', 'Trace ID (OpenTelemetry)', 'Tool and MCP server ID', 'Cloud / infrastructure resource ID', 'Incident ID', 'Control ID', 'Risk ID', 'Cost centre', 'Timestamp and reporting period'].map(x => '<li>' + x + '</li>').join('') + '</ul></div>' +
      '<div class="doc-card"><h4>Deliverables in the repository</h4><ul>' + [['docs/01-kpi-catalog.md', 'KPI / KRI catalog (all indicators)'], ['docs/02-formula-data-dictionary.md', 'Formula and data dictionary'], ['docs/03-data-architecture.md', 'Logical and physical data architecture'], ['docs/04-telemetry-mapping.md', 'Required log fields and telemetry mappings'], ['docs/05-database-schema.sql', 'Database / schema design (DDL)'], ['docs/06-integrations.md', 'Integration specifications and API connectors'], ['docs/07-ingestion-workflows.md', 'Ingestion and processing workflows'], ['docs/08-alerting-rag-logic.md', 'RAG threshold and alerting logic'], ['docs/09-attribution-methodology.md', 'Risk and financial attribution methodology'], ['docs/10-rbac-multitenancy.md', 'Role-based access and multi-tenant isolation'], ['data/', 'Synthetic dataset exports for testing'], ['tests/formulas.test.js', 'Validation tests for formulas, costs and calculations'], ['docs/11-deployment-operations.md', 'Production deployment, monitoring and maintenance']].map(x => '<li><code>' + x[0] + '</code> · ' + x[1] + '</li>').join('') + '</ul></div>' +
      '<div class="doc-card" id="quality" style="grid-column:1/-1"><h4>Source systems, freshness and completeness</h4><div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>ID</th><th>Source system</th><th>Last refresh (GST)</th><th>Cadence</th><th class="r">Completeness</th><th class="r">KPIs fed</th></tr></thead><tbody>' + D.SOURCES.map(s => '<tr><td class="num">' + s.id + '</td><td>' + esc(s.name) + '</td><td class="num small">' + esc(s.fresh) + '</td><td class="small">' + esc(s.cadence) + '</td><td class="r num">' + s.completeness.toFixed(1) + '%</td><td class="r num">' + LIST.filter(k => (k.src || []).indexOf(s.id) >= 0).length + '</td></tr>').join('') + '</tbody></table></div></div>' +
      '<div class="doc-card" style="grid-column:1/-1"><h4>Framework applicability (determined before compliance scoring)</h4>' + applicabilityMatrix(f) + '</div>' +
      '</div>' + footer();
  }
  function archSvg() {
    const col = (x, title, items, color) => '<g><rect x="' + x + '" y="34" width="180" height="' + (items.length * 24 + 34) + '" rx="10" fill="#111112" stroke="' + color + '" stroke-opacity="0.6"/><text x="' + (x + 90) + '" y="56" text-anchor="middle" class="label-text" style="font-weight:650;fill:#f2f1ee">' + title + '</text>' + items.map((t, i) => '<text x="' + (x + 12) + '" y="' + (80 + i * 24) + '" class="axis-text" style="font-size:11px;fill:#c3c2b7">' + esc(t) + '</text>').join('') + '</g>';
    const arrow = x => '<path d="M' + x + ',150 h26" stroke="#5a5a60" stroke-width="2" marker-end="url(#ah)"/>';
    return '<svg viewBox="0 0 1060 320" role="img" aria-label="Data flow from source systems through ingestion, normalised KPI data layer and KPI engine to dashboards and reporting"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="#5a5a60"/></marker></defs>' +
      col(10, 'Source systems', ['LLM providers / AI gateway', 'Azure OpenAI · AWS Bedrock', 'On-prem model serving', 'Agent orchestrator · MCP', 'OpenTelemetry · DCGM · K8s', 'SIEM · SOAR · EDR · DLP', 'IAM / PAM · CASB · SWG', 'GRC · CMDB · VM / CTEM', 'Finance ERP · ITSM · HR'], '#3987e5') +
      arrow(194) + col(222, 'Ingestion', ['Streaming (OTel, gateway)', 'Batch APIs (billing, ERP)', 'Webhooks (SOAR, ITSM)', 'Schema validation', 'PII minimisation', 'Late-data handling', 'Lineage capture'], '#199e70') +
      arrow(406) + col(434, 'Normalised KPI layer', ['Conformed dimensions', 'Fact: agent activity', 'Fact: model / infra', 'Fact: tenant-month cost', 'Records: incidents, outages', 'Ledger: value attribution', 'Inventories & controls'], '#c98500') +
      arrow(618) + col(646, 'KPI engine', ['164 KPI formulas', 'Composite indices', 'Threshold / RAG logic', 'Alert rules', 'Evidence & DQ scoring', 'Row-level tenant security'], '#d55181') +
      arrow(830) + col(858, 'Consumption', ['Executive dashboard', 'Level 2 drill-downs', 'Calculation explainer', 'PDF / Excel export', 'Monthly board report', 'API for GRC / BI'], '#9085e9') + '</svg>';
  }

  // ------------------------------------------------------------------ drawer (KPI detail)
  function drillFilter() {
    const f = filt();
    state.drill.forEach(d => { f[d.dim === 'prov' ? 'mp' : d.dim] = d.key; if (d.dim === 'tn' && I.TN[d.key]) f.bu = I.TN[d.key].bu; if (d.dim === 'agent' && I.AGENT[d.key]) { f.tn = I.AGENT[d.key].tenant; f.bu = I.AGENT[d.key].bu; } });
    return f;
  }
  function openKpi(id) { state.drill = []; state.session = null; navigate({ kpi: String(id) }); }
  function closeDrawer() { navigate({ kpi: null }); }
  function inputVal(inp) { if (inp.value == null) return 'n/a'; return fmt(inp.value, inp.unit === 'mins' ? 'mins' : inp.unit, 'full'); }
  function renderDrawer() {
    const dr = $('#drawer'), bd = $('#drawerBackdrop');
    if (!state.kpi || !K[state.kpi]) { dr.classList.remove('open'); bd.classList.remove('open'); dr.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; return; }
    const id = state.kpi, k = K[id];
    const f = drillFilter();
    const d = E.detail(id, f);
    const q = d.ctx;
    const pf = prevF(f);
    const unitS = k.statusOf ? statusUnit(k) : k.unit;
    const app = E.applicability(d.touched, f);
    const chips = ['<span class="chip applied">Period: ' + esc(rangeLabel(f.from, f.to)) + '</span>'].concat(
      app.applied.map(x => '<span class="chip applied">' + esc(EN.FILTER_LABELS[x]) + ': ' + esc(filterValueLabel(x, f[x])) + '</span>'),
      app.partial.map(x => '<span class="chip partial" title="Applies to part of the inputs only">' + esc(EN.FILTER_LABELS[x]) + ': partially applied</span>'),
      app.na.map(x => '<span class="chip na" title="This KPI\'s data does not carry this dimension">' + esc(EN.FILTER_LABELS[x]) + ': not applicable</span>')).join('');
    // substitution
    let sub = k.expr || '';
    d.inputs.forEach(inp => { sub = sub.split('{' + inp.k + '}').join(inputVal(inp)); });
    const result = fmt(d.value, k.unit, 'full');
    const nInfo = k.n ? k.n(q) : (d.inputs.find(i => i.den) ? { n: d.inputs.find(i => i.den).value, label: (d.inputs.find(i => i.den).label || '').toLowerCase() } : null);
    const inputsRows = d.inputs.map(inp => '<tr><td><span class="sym">' + esc(inp.k) + '</span></td><td>' + (inp.kpi != null ? '<button class="link-kpi" data-kpi="' + inp.kpi + '">' + esc(inp.label) + ' ↗</button>' : esc(inp.label)) + (inp.den ? ' <span class="chip" style="font-size:10px;padding:0 6px">denominator</span>' : '') + (inp.note ? '<div class="muted small">' + esc(inp.note) + '</div>' : '') + '</td><td class="r num nowrap"><b>' + esc(inputVal(inp)) + '</b></td><td class="small muted">' + esc(inp.src || (inp.kpi != null ? 'Derived from KPI ' + inp.kpi : '')) + '</td></tr>').join('');
    const prevVal = pf ? E.evaluate(id, Object.assign({}, f, { from: pf.from, to: pf.to })) : null;
    const tgtTxt = k.dir === 'none' ? 'Informational' : (d.tgt == null ? 'n/a for this slice' : thrText(k, d.tgt, unitS));
    const compTable = k.groups ? '<div class="tbl-wrap" style="margin-top:8px"><table class="tbl compact"><thead><tr><th>Component</th><th>KPIs (normalised risk 0-100)</th><th class="r">Group risk</th><th class="r">Weight</th><th class="r">Contribution</th></tr></thead><tbody>' +
      k.groups.map((g, i) => { const inp = d.inputs[i]; const wsum = d.inputs.filter(x => x.value != null).reduce((a, x) => a + x.w, 0) || 1; return '<tr><td>' + esc(g.label) + '</td><td class="small">' + g.ids.map(x => { const isX = String(x).charAt(0) === 'X'; const r = isX ? { risk: E.evaluate(x, f) } : E.quick(x, f); return '<button class="link-kpi" data-kpi="' + x + '">' + (isX ? x : '#' + x) + '</button> <span class="muted">' + (r.risk == null ? 'n/a' : Math.round(r.risk)) + '</span>'; }).join(' · ') + '</td><td class="r num">' + (inp.value == null ? 'n/a' : inp.value.toFixed(1)) + '</td><td class="r num">' + Math.round(g.w * 100) + '%</td><td class="r num">' + (inp.value == null ? '-' : (inp.value * g.w / wsum).toFixed(1)) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '';
    const linked = computeAlerts(filt()).filter(a => a.kpis.map(String).indexOf(String(id)) >= 0);
    const srcRows = (k.src || []).map(s => SRC[s]).filter(Boolean);
    const compl = srcRows.length ? srcRows.reduce((a, s) => a + s.completeness, 0) / srcRows.length : null;
    const oldest = srcRows.slice().sort((a, b) => a.fresh.localeCompare(b.fresh))[0];
    const conf = k.cls === 'Estimated' || k.cls === 'Forecast' ? 'Medium (estimate / forecast)' : k.cls === 'Composite' ? 'Medium (composite of KPIs)' : (compl != null && compl >= 98 ? 'High' : 'Medium');
    const traceCov = d.touched.indexOf('act') >= 0 ? E.evaluate(145, f) : null;
    const money = k.money ? k.money(q) : null;
    const navItems = ['Definition', 'Calculation', 'History', 'Thresholds', 'Impact', 'Drill-down', 'Records', 'Sources', 'Evidence', 'Owner', 'Actions', 'Financial'];
    let html = '<div class="dr-value"><div><div class="lbl">Current value · ' + esc(rangeLabel(f.from, f.to)) + '</div><div class="big">' + esc(fmt(d.value, k.unit)) + '</div></div>' +
      '<div><div class="lbl">Target</div><div class="val">' + esc(tgtTxt) + '</div></div><div><div class="lbl">Warning / critical</div><div class="val">' + (k.dir === 'none' ? '-' : esc(fmt(d.warn, unitS) + ' / ' + fmt(d.crit, unitS))) + '</div></div>' +
      '<div><div class="lbl">Prior period (' + esc(pf ? rangeLabel(pf.from, pf.to) : 'n/a') + ')</div><div class="val">' + esc(fmt(prevVal, k.unit)) + ' ' + deltaHtml(k, d.value, prevVal) + '</div></div>' +
      '<div><div class="lbl">Normalised risk</div><div class="val">' + (d.risk == null ? 'n/a' : Math.round(d.risk) + ' / 100') + '</div></div></div>' +
      '<div class="scope-line" style="margin-top:10px">' + chips + '</div>';
    html += sec(1, 'Definition', '<p style="margin:0;color:var(--text-2)">' + esc(k.def) + '</p><div class="kv" style="margin-top:10px"><div><div class="k">Unit</div><div class="v">' + esc(EN.unitWord(k.unit)) + '</div></div><div><div class="k">Direction</div><div class="v">' + (k.dir === 'up' ? 'Higher is better' : k.dir === 'down' ? 'Lower is better' : 'Informational') + '</div></div><div><div class="k">Classification</div><div class="v">' + esc(k.cls) + '</div></div><div><div class="k">Domain</div><div class="v">' + k.dom + '. ' + esc(DOM[k.dom].short) + '</div></div></div>');
    html += sec(2, 'How this value is calculated',
      '<div class="formula"><span class="eq">' + esc(k.name) + ' =</span><br>' + esc(k.formula) + '</div>' +
      '<div class="tbl-wrap" style="margin-top:10px"><table class="tbl compact"><thead><tr><th>Symbol</th><th>Input (selected scope)</th><th class="r">Value</th><th>Source</th></tr></thead><tbody>' + inputsRows + '</tbody></table></div>' +
      '<div class="calc-steps" style="margin-top:10px"><div class="calc-line"><span class="lbl">Worked calculation with the inputs above</span>' + esc(sub) + ' <span class="res">= ' + esc(result) + '</span></div></div>' + compTable +
      '<dl class="rules" style="margin-top:12px"><dt>Inclusion / exclusion</dt><dd>' + esc(k.incl || '-') + '</dd><dt>Sample size</dt><dd>' + (nInfo ? esc(fmt(nInfo.n, 'count', 'full') + ' ' + nInfo.label) : 'Aggregate of all records in scope') + '</dd><dt>Missing-data behaviour</dt><dd>' + esc(k.miss) + '</dd><dt>Aggregation</dt><dd>Re-computed from the summed inputs for the selected scope; ratios are never averaged.</dd></dl>');
    html += sec(3, 'Current and historical measurements', '<div id="drTrend"></div>');
    html += sec(4, 'Target and thresholds', C.bullet({ value: d.statusValue, tgt: d.tgt, warn: d.warn, crit: d.crit, dir: k.dir }) + '<dl class="rules" style="margin-top:8px"><dt>Status</dt><dd>' + pill(d.status) + (d.belowTarget && d.status === 'watch' ? ' <span class="muted small">Below target but better than the warning threshold</span>' : '') + '</dd><dt>Thresholds</dt><dd>' + (k.dir === 'none' ? 'Informational indicator.' : 'Target ' + esc(fmt(d.tgt, unitS)) + ' · Warning ' + esc(fmt(d.warn, unitS)) + ' · Critical ' + esc(fmt(d.crit, unitS)) + ' (' + (k.dir === 'up' ? 'higher is better' : 'lower is better') + ')') + '</dd>' + (k.thr ? '<dt>Note</dt><dd>' + esc(k.thr) + '</dd>' : '') + (k.statusOf ? '<dt>Rated on</dt><dd>' + esc(statusName(k)) + ' = ' + esc(fmt(d.statusValue, unitS)) + '</dd>' : '') + '<dt>Normalised risk</dt><dd>' + (d.risk == null ? 'n/a' : Math.round(d.risk) + ' / 100 (0 = at target, 50 = warning, 100 = critical)') + '</dd></dl>');
    html += sec(5, 'Business and service impact', '<p style="margin:0;color:var(--text-2)">' + esc(k.imp || '-') + '</p>');
    html += sec(6, 'Drill-down: enterprise → BU / customer → application → agent / model → workflow → session → event', '<div id="drDrill"></div>');
    html += sec(7, 'Underlying records and observations', '<div id="drRecs"></div>');
    html += sec(8, 'Source systems and last refresh', srcRows.length ? '<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Source system</th><th>Last refresh (GST)</th><th>Cadence</th><th class="r">Completeness</th></tr></thead><tbody>' + srcRows.map(s => '<tr><td>' + esc(s.name) + '</td><td class="num small">' + esc(s.fresh) + '</td><td class="small">' + esc(s.cadence) + '</td><td class="r num">' + s.completeness.toFixed(1) + '%</td></tr>').join('') + '</tbody></table></div><p class="small muted">KPI last refreshed: <b>' + esc(oldest.fresh) + ' GST</b> (bounded by ' + esc(oldest.name) + ').</p>' : '<p class="muted">Derived from the KPIs listed above.</p>');
    html += sec(9, 'Evidence quality and completeness', '<div class="kv"><div><div class="k">Source completeness</div><div class="v">' + (compl == null ? 'n/a' : compl.toFixed(1) + '%') + '</div></div><div><div class="k">Confidence</div><div class="v">' + esc(conf) + '</div></div>' + (traceCov != null ? '<div><div class="k">Trace coverage of runs</div><div class="v">' + fmt(traceCov, '%') + '</div></div>' : '') + '<div><div class="k">Data classification</div><div class="v" style="color:var(--watch)">Synthetic sample</div></div></div><p class="small" style="color:var(--text-2);margin:8px 0 0"><b>Supporting evidence:</b> ' + esc(k.ev || '-') + '</p>');
    html += sec(10, 'Risk / control owner and reporting', '<div class="kv"><div><div class="k">Owner</div><div class="v">' + esc(k.owner) + '</div></div><div><div class="k">Reporting frequency</div><div class="v">' + esc(k.freq) + '</div></div><div><div class="k">Escalation</div><div class="v">' + (d.status === 'critical' ? 'Executive committee' : d.status === 'serious' ? 'CISO / domain owner' : 'Domain owner') + '</div></div></div>');
    html += sec(11, 'Linked incidents and remediation actions', linked.length ? linked.map(a => '<div class="callout ' + (a.sev === 'Critical' ? 'warn' : 'info') + '" style="margin-bottom:8px"><span class="sev ' + a.sev + '">' + a.sev + '</span> <b>' + esc(a.title) + '</b> · due ' + a.due + '<div class="small" style="margin-top:4px">' + esc(a.impact) + '</div><div class="small" style="margin-top:4px"><span class="muted">Remediation:</span> ' + esc(a.mitigation) + '</div></div>').join('') + '<a href="' + buildHash({ route: 'alerts', arg: null, kpi: null }) + '" class="small">Open the alerts page →</a>' : '<p class="muted" style="margin:0">No open alert is linked to this KPI for the selected scope.</p>');
    html += sec(12, 'Financial contribution', money && money.value != null ? '<div class="kv"><div><div class="k">' + esc(money.label) + '</div><div class="v">' + esc(fmt(money.value, 'AED')) + '</div></div></div>' : (k.unit === 'AED' || k.unit === 'AED2' ? '<p class="muted" style="margin:0">This indicator is itself a financial measure (AED).</p>' : '<p class="muted" style="margin:0">Not applicable: non-financial indicator. Its financial effect is captured through linked KPIs in domain A.</p>'));
    dr.innerHTML = '<div class="dr-head"><div><div class="eyebrow"><span>KPI ' + esc(String(id)) + '</span><span>·</span><span>' + k.dom + '. ' + esc(DOM[k.dom].name) + '</span>' + pill(d.status) + '</div><h2 id="drTitle">' + esc(k.name) + '</h2></div><button class="dr-close" type="button" aria-label="Close" id="drClose"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>' +
      '<nav class="dr-nav" aria-label="Sections">' + navItems.map((n, i) => '<a href="#" data-sec="s' + (i + 1) + '">' + (i + 1) + ' ' + n + '</a>').join('') + '</nav>' +
      '<div class="dr-body" id="drBody">' + html + '</div>';
    dr.setAttribute('aria-hidden', 'false'); dr.setAttribute('aria-labelledby', 'drTitle');
    dr.classList.add('open'); bd.classList.add('open');
    document.body.style.overflow = 'hidden';
    // trend chart
    const ser24 = E.series(id, f, 12);
    const isStatus = !!k.statusOf;
    fig($('#drTrend'), {
      title: k.name + ', monthly (12 months to ' + D.MONTHS[f.to].label + ')', sub: 'Shaded months are inside the selected period' + (isStatus || k.dir === 'none' ? '' : ' · dashed lines: green = monthly target, orange = warning, red = critical'),
      render: el => C.line(el, { labels: ser24.map(x => x.label), series: [{ name: k.name, color: css('--accent'), values: ser24.map(x => x.value) }], fmt: v => fmt(v, k.unit), refs: isStatus || k.dir === 'none' ? [] : monthlyRefs(k, f), area: true, height: 200, hiFrom: Math.max(0, 12 - (f.to - f.from + 1)), zero: k.unit !== '%' }),
      table: () => ({ headers: ['Month', 'Value'], rows: ser24.map(x => [D.MONTHS[x.m].label, fmt(x.value, k.unit, 'full')]) })
    });
    renderDrill(id, k, d);
    renderRecords(k, q);
    const body = $('#drBody'); if (body) body.scrollTop = 0;
    setTimeout(() => { const c = $('#drClose'); if (c) c.focus({ preventScroll: true }); }, 30);
  }
  function monthlyRefs(k, f) {
    const q1 = E.quick(k.id, Object.assign({}, f, { from: f.to, to: f.to }));
    const out = [];
    if (q1.tgt != null) out.push({ value: q1.tgt, label: 'Target', color: css('--good') });
    if (q1.warn != null) out.push({ value: q1.warn, label: 'Warning', color: css('--serious') });
    if (q1.crit != null && Math.abs(q1.crit) < 1e15) out.push({ value: q1.crit, label: 'Critical', color: css('--critical') });
    return out;
  }
  function sec(n, title, body) { return '<section class="dr-sec" id="s' + n + '"><h3><span class="n">' + n + '</span>' + esc(title) + '</h3>' + body + '</section>'; }

  const DIM_LABEL = { bu: 'Business unit', tn: 'Customer / tenant', app: 'Application', agent: 'Agent', mp: 'Model', prov: 'Provider', wf: 'Workflow', ctl: 'Security control', sev: 'Severity', fw: 'Framework', env: 'Environment' };
  function renderDrill(id, k, d) {
    const host = $('#drDrill');
    if (!host) return;
    const base = filt();
    const dims = (k.drill || []).slice();
    const usesAct = d.touched.indexOf('act') >= 0;
    const crumbs = '<div class="drill-crumbs"><button type="button" data-drill="-1">Enterprise scope</button>' + state.drill.map((x, i) => '<span class="sep">›</span><button type="button" data-drill="' + i + '">' + esc(DIM_LABEL[x.dim]) + ': ' + esc(x.label) + '</button>').join('') + '</div>';
    const f = drillFilter();
    const used = new Set(state.drill.map(x => x.dim));
    const next = dims.find(dm => !used.has(dm) && !(dm === 'prov' ? base.mp : base[dm]) && !(dm === 'bu' && (f.tn || f.agent)) && !(dm === 'tn' && f.agent));
    let body = '';
    const agentSel = f.agent || null;
    if (next) {
      const q = E.ctx(f);
      const rows = q.split(next).map(s => ({ key: s.key, label: s.label, r: E.quick(id, s.ctx.f) })).filter(x => x.r.value != null && (x.r.value !== 0 || ['%', 'score'].indexOf(k.unit) >= 0));
      const additive = ['AED', 'count', 'tokens', 'h', 'hd', 'mins'].indexOf(k.unit) >= 0;
      const tot = additive ? rows.reduce((a, x) => a + Math.max(0, x.r.value), 0) : 0;
      rows.sort((a, b) => (b.r.value || 0) - (a.r.value || 0));
      body = '<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>' + esc(DIM_LABEL[next]) + '</th><th class="r">' + esc(k.name.length > 28 ? 'Value' : k.name) + '</th>' + (additive ? '<th class="r">Share</th>' : '') + '<th>Status</th></tr></thead><tbody>' +
        (rows.length ? rows.map(x => '<tr class="click" data-dkey="' + esc(x.key) + '" data-ddim="' + next + '" data-dlabel="' + esc(x.label) + '"><td>' + esc(x.label) + ' <span class="muted small">›</span></td><td class="r num">' + esc(fmt(x.r.value, k.unit)) + '</td>' + (additive ? '<td class="r num small">' + (tot ? (Math.max(0, x.r.value) / tot * 100).toFixed(1) + '%' : '-') + '</td>' : '') + '<td>' + pill(x.r.status) + '</td></tr>').join('') : '<tr><td colspan="4" class="muted">No contributing members in this scope.</td></tr>') + '</tbody></table></div><p class="tbl-note">Each row re-computes the KPI with the same formula for that member (ratios are not averaged). Click to drill further.</p>';
    } else if (!agentSel) {
      body = '<p class="muted small" style="margin:0">Lowest level for this indicator reached. See the underlying records below.</p>';
    }
    if (agentSel && usesAct) {
      const a = I.AGENT[agentSel];
      const ses = D.sessions(agentSel, f.to, 12);
      const sel = ses.find(s => s.id === state.session);
      body += '<div class="callout info" style="margin:10px 0 8px">Agent <b>' + esc(a.name) + '</b> · workflow <b>' + esc(I.WF[a.wf].name) + '</b> · application <b>' + esc(I.APP[a.app].name) + '</b> · primary model <b>' + esc(I.MODEL[a.primary].name) + '</b>. Sessions in ' + esc(D.MONTHS[f.to].label) + ' (select one to see the individual events):</div>' + sessionTable(ses, sel) + (sel ? '<div style="margin-top:10px">' + traceView(sel) + '</div>' : '');
    }
    host.innerHTML = crumbs + body;
  }

  // ------------------------------------------------------------------ underlying records
  function recTable(cols, rows, note, max) {
    max = max || 40;
    const shown = rows.slice(0, max);
    const id = 'rec' + Math.random().toString(36).slice(2, 8);
    recTable.last = { cols: cols, rows: rows };
    return '<div class="tbl-wrap"><table class="tbl compact"><thead><tr>' + cols.map(c => '<th' + (c.r ? ' class="r"' : '') + '>' + esc(c.h) + '</th>').join('') + '</tr></thead><tbody>' + (shown.length ? shown.map(r => '<tr>' + cols.map(c => { const v = c.f(r); return '<td' + (c.r ? ' class="r num"' : ' class="small"') + '>' + (c.html ? v : esc(v)) + '</td>'; }).join('') + '</tr>').join('') : '<tr><td colspan="' + cols.length + '" class="muted">No records in scope.</td></tr>') + '</tbody></table></div><div class="tbl-note">' + (rows.length > max ? 'Showing ' + max + ' of ' + rows.length + ' records. ' : rows.length + ' record(s). ') + (note || '') + ' <button class="btn" type="button" id="recCsv" style="margin-left:6px">Export records (CSV)</button></div>';
  }
  const mL = m => D.MONTHS[m].short;
  const tnN = t => (I.TN[t] ? I.TN[t].name : t);
  function agentRows(q, extraCols) {
    const by = {};
    q.actRows().forEach(r => { const a = by[r.ag] || (by[r.ag] = { id: r.ag, tasks: 0, succ: 0, tok: 0, cost: 0, toolUnOk: 0, piOk: 0, hrAtt: 0, hrBlk: 0, xbUn: 0, loops: 0 }); a.tasks += r.tasks; a.succ += r.succ; a.tok += r.tokIn + r.tokOut; a.cost += r.costInf; a.toolUnOk += r.toolUnOk; a.piOk += r.piOk; a.hrAtt += r.hrAtt; a.hrBlk += r.hrBlk; a.xbUn += r.xbUn; a.loops += r.loops; });
    return Object.keys(by).map(k => by[k]).sort((a, b) => b.tasks - a.tasks);
  }
  function invCols(attr) {
    const base = [{ h: 'Agent', f: a => a.name }, { h: 'Tenant', f: a => a.tenant }, { h: 'Workflow', f: a => I.WF[a.wf].name }];
    return base.concat(attr);
  }
  function renderRecords(k, q) {
    const host = $('#drRecs'); if (!host) return;
    const m = q.last;
    const fin = () => q.fin();
    let out = '';
    switch (k.recs) {
      case 'savings': out = recTable([{ h: 'Entry', f: x => x.id }, { h: 'Month', f: x => mL(x.m) }, { h: 'Tenant', f: x => tnN(x.tn) }, { h: 'Control', f: x => x.ctl }, { h: 'Initiative', f: x => x.desc }, { h: 'Status', f: x => x.status }, { h: 'Amount', r: 1, f: x => fmt(x.amt, 'AED', 'full') }], fin().filter(x => x.cat === 'saving').sort((a, b) => b.amt - a.amt), 'Only "Approved" entries count toward realised savings.'); break;
      case 'lossPrevented': {
        const byInc = {}; fin().filter(x => x.cat === 'loss_prevented' && (k.id !== 11 || D.incidents.find(i => i.id === x.inc).fraud)).forEach(x => { const e = byInc[x.inc] || (byInc[x.inc] = { inc: x.inc, claim: 0, amt: 0, ctls: [] }); e.claim += x.claim; e.amt += x.amt; e.ctls.push(x.ctl + ' ' + Math.round(x.amt / Math.max(1, x.claim) * 100) + '%'); });
        const incIdx = {}; D.incidents.forEach(i => { incIdx[i.id] = i; });
        out = recTable([{ h: 'Incident', f: x => x.inc }, { h: 'Month', f: x => mL(incIdx[x.inc].m) }, { h: 'Type', f: x => incIdx[x.inc].type }, { h: 'Severity', f: x => incIdx[x.inc].sev }, { h: 'Control attribution', f: x => x.ctls.join(', ') }, { h: 'Gross claims', r: 1, f: x => fmt(x.claim, 'AED', 'full') }, { h: 'Counted once', r: 1, f: x => fmt(x.amt, 'AED', 'full') }], Object.keys(byInc).map(i => byInc[i]).sort((a, b) => b.amt - a.amt), 'Gross claims overlap across controls; only the de-duplicated value is counted.');
        break;
      }
      case 'risk': {
        const by = {}; q.riskRows().forEach(r => { const e = by[r.sc] || (by[r.sc] = { sc: r.sc, b: 0, r: 0, lef: 0 }); e.b += r.bLef * r.bLm; e.r += r.rLef * r.rLm; e.lef += r.rLef; });
        const SC = {}; D.SCENARIOS.forEach(s => { SC[s.id] = s; });
        out = recTable([{ h: 'Scenario', f: x => x.sc + ' ' + SC[x.sc].name }, { h: 'Residual LEF / yr', r: 1, f: x => x.lef.toFixed(2) }, { h: 'Baseline ALE', r: 1, f: x => fmt(x.b, 'AED', 'full') }, { h: 'Residual ALE', r: 1, f: x => fmt(x.r, 'AED', 'full') }, { h: 'Avoidance', r: 1, f: x => fmt(x.b - x.r, 'AED', 'full') }], Object.keys(by).map(s => by[s]).sort((a, b) => b.r - a.r), 'FAIR scenario values at ' + D.MONTHS[m].label + '.');
        break;
      }
      case 'incidents': case 'incidentsHigh': case 'incidentsAI': case 'incidentsMajor': case 'incidentsRag': {
        let xs = q.incidents();
        if (k.recs === 'incidentsHigh') xs = xs.filter(x => x.sev === 'High' || x.sev === 'Critical');
        if (k.recs === 'incidentsAI') xs = xs.filter(x => x.ai);
        if (k.recs === 'incidentsMajor') xs = xs.filter(x => x.major);
        if (k.recs === 'incidentsRag') xs = xs.filter(x => x.type === 'RAG / memory poisoning');
        out = recTable([{ h: 'Incident', f: x => x.id }, { h: 'Month', f: x => mL(x.m) }, { h: 'Tenant', f: x => tnN(x.tn) }, { h: 'Type', f: x => x.type }, { h: 'Severity', f: x => x.sev }, { h: 'Mitigated', f: x => (x.mitigated ? 'Yes' : 'No') }, { h: 'Containment h', r: 1, f: x => x.containH.toFixed(1) }, { h: 'Potential loss', r: 1, f: x => fmt(x.potential, 'AED', 'full') }, { h: 'Actual loss', r: 1, f: x => fmt(x.actualLoss, 'AED', 'full') }, { h: 'Response cost', r: 1, f: x => fmt(x.respCost, 'AED', 'full') }], xs.slice().sort((a, b) => b.potential - a.potential), '');
        break;
      }
      case 'outages': case 'outM': case 'outI': {
        let xs = k.recs === 'outI' ? q.outI() : k.recs === 'outM' ? q.outM() : q.outM().concat(q.outI());
        out = recTable([{ h: 'Outage', f: x => x.id }, { h: 'Month', f: x => mL(x.m) }, { h: 'Target', f: x => (x.kind === 'model' ? I.MODEL[x.mo].name : I.COMP[x.comp].name) }, { h: 'Cause', f: x => x.cause }, { h: 'Severity', f: x => x.sev }, { h: 'Minutes', r: 1, f: x => x.dur }, { h: 'MTTD', r: 1, f: x => x.mttd }, { h: 'Fallback / failover', f: x => (x.kind === 'model' ? (x.fbTried ? (x.fbOk ? 'OK' : 'FAILED') : 'none') : (x.foTried ? (x.foOk ? 'OK' : 'FAILED') : 'n/a')) }, { h: 'Est. impact', r: 1, f: x => fmt(x.impactEst, 'AED', 'full') }, { h: 'Actual loss', r: 1, f: x => fmt(x.impactActual, 'AED', 'full') }, { h: 'Avoided', r: 1, f: x => fmt(x.avoided, 'AED', 'full') }], xs.slice().sort((a, b) => b.m - a.m || b.dur - a.dur), 'Linked to affected agents and workflows.');
        break;
      }
      case 'workflows': { const w = workflowTimes(q.f); out = recTable([{ h: 'Workflow', f: x => x.name }, { h: 'Tasks', r: 1, f: x => fmt(x.tasks, 'count', 'full') }, { h: 'Manual min/task', r: 1, f: x => x.man.toFixed(1) }, { h: 'Exec', r: 1, f: x => x.ex.toFixed(2) }, { h: 'Review', r: 1, f: x => x.rv.toFixed(2) }, { h: 'Wait', r: 1, f: x => x.wt.toFixed(2) }, { h: 'E2E min/task', r: 1, f: x => x.e2e.toFixed(1) }, { h: 'Gain', r: 1, f: x => x.gain.toFixed(1) + '%' }], w, 'Per-workflow cohorts behind the efficiency figures.'); break; }
      case 'models': {
        const rows = D.MODELS.map(md => { const qq = q.sub({ mp: 'M:' + md.id }); const el = qq.a('req') - (qq.a('eApp') + qq.a('eRl') + qq.a('eGw') + qq.a('eNet')); return { md: md, req: qq.a('req'), tok: qq.a('tokIn') + qq.a('tokOut'), cached: qq.a('tokCached'), reason: qq.a('tokReason'), cost: qq.a('costInf'), av: el ? (el - (qq.a('eProv') + qq.a('eSrv') + qq.a('eTo'))) / el * 100 : null, rl: qq.a('eRl') }; }).filter(r => r.req > 0);
        out = recTable([{ h: 'Model', f: r => r.md.name }, { h: 'Provider', f: r => r.md.provider + ' · ' + r.md.region }, { h: 'Requests', r: 1, f: r => fmt(r.req, 'count', 'full') }, { h: 'Tokens', r: 1, f: r => fmt(r.tok, 'tokens') }, { h: 'Cached', r: 1, f: r => fmt(r.cached, 'tokens') }, { h: 'Reasoning', r: 1, f: r => fmt(r.reason, 'tokens') }, { h: 'Price in / cache / out (AED per 1M)', f: r => r.md.p_in + ' / ' + r.md.p_cache + ' / ' + r.md.p_out }, { h: 'Inference AED', r: 1, f: r => fmt(r.cost, 'AED', 'full') }, { h: 'Availability', r: 1, f: r => (r.av == null ? 'n/a' : fmt(r.av, '%')) }, { h: '429s', r: 1, f: r => fmt(r.rl, 'count', 'full') }], rows, 'Provider-specific pricing is applied per model (synthetic price list).');
        break;
      }
      case 'providers': { const by = {}; q.actRows().forEach(r => { if (!I.WF[r.wf].crit) return; by[r.prov] = (by[r.prov] || 0) + r.tokIn + r.tokOut; }); const tot = Object.keys(by).reduce((a, p) => a + by[p], 0); out = recTable([{ h: 'Provider', f: x => x.p }, { h: 'Critical-workflow tokens', r: 1, f: x => fmt(x.t, 'tokens') }, { h: 'Share', r: 1, f: x => (x.t / tot * 100).toFixed(1) + '%' }], Object.keys(by).map(p => ({ p: p, t: by[p] })).sort((a, b) => b.t - a.t), ''); break; }
      case 'tenantMonths': out = recTable([{ h: 'Month', f: r => mL(r.m) }, { h: 'Tenant', f: r => tnN(r.tn) }, { h: 'Tokens', r: 1, f: r => fmt(r.tokens, 'tokens') }, { h: 'Token budget', r: 1, f: r => fmt(r.budTok, 'tokens') }, { h: 'AI spend', r: 1, f: r => fmt(r.aiSpend, 'AED', 'full') }, { h: 'AI budget', r: 1, f: r => fmt(r.budAI, 'AED', 'full') }, { h: 'DLP blocks (FP)', r: 1, f: r => r.dlpBlk + ' (' + r.dlpFp + ')' }, { h: 'Shadow-AI users', r: 1, f: r => r.shadowUsers + ' / ' + r.users }, { h: 'Cases / FTE', r: 1, f: r => (r.cases / r.fte).toFixed(1) }], q.tenRows().slice().sort((a, b) => b.m - a.m || a.tn.localeCompare(b.tn)), 'Tenant-month fact (allocated costs, budgets, workforce, DLP and CASB measures).'); break;
      case 'quota': out = recTable([{ h: 'Month', f: r => mL(r.m) }, { h: 'Deployment', f: r => I.MODEL[r.mo].name }, { h: 'Peak TPM / limit', r: 1, f: r => (r.peakTpm / r.tpmLimit * 100).toFixed(0) + '%' }, { h: 'Peak RPM / limit', r: 1, f: r => (r.peakRpm / r.rpmLimit * 100).toFixed(0) + '%' }, { h: 'Tokens', r: 1, f: r => fmt(r.tokens, 'tokens') }, { h: 'Commitment', r: 1, f: r => fmt(r.commit, 'tokens') }, { h: 'Exhausted', f: r => (r.exhausted ? 'YES' : 'no') }, { h: 'Days exhausted', r: 1, f: r => r.exhaustDays }], q.quota().slice().sort((a, b) => b.m - a.m), ''); break;
      case 'quotaNow': out = recTable([{ h: 'Deployment', f: r => I.MODEL[r.mo].name + ' (' + r.prov + ')' }, { h: 'Used MTD', r: 1, f: r => fmt(r.used, 'tokens') }, { h: 'Commitment', r: 1, f: r => fmt(r.commit, 'tokens') }, { h: 'Projected', r: 1, f: r => fmt(r.used / r.elapsed * r.days / r.commit * 100, '%') }, { h: 'Exhaustion day', r: 1, f: r => (r.commit / (r.used / r.elapsed)).toFixed(1) }, { h: 'Time to reset', f: () => (D.AS_OF.mtdDaysInMonth - D.AS_OF.mtdDaysElapsed).toFixed(2) + ' days' }], q.quotaNow(), 'As of ' + D.AS_OF.label + '.'); break;
      case 'slo': { const list = []; for (let mm = q.from; mm <= q.to; mm++) D.MODELS.forEach(md => { const qq = q.sub({ from: mm, to: mm, mp: 'M:' + md.id }); const el = qq.a('req') - (qq.a('eApp') + qq.a('eRl') + qq.a('eGw') + qq.a('eNet')); if (el > 0) { const av = (el - (qq.a('eProv') + qq.a('eSrv') + qq.a('eTo'))) / el * 100; list.push({ m: mm, md: md, av: av }); } }); out = recTable([{ h: 'Month', f: r => mL(r.m) }, { h: 'Deployment', f: r => r.md.name }, { h: 'Availability', r: 1, f: r => fmt(r.av, '%') }, { h: 'SLO', r: 1, f: r => r.md.slo + '%' }, { h: 'Breach', f: r => (r.av < r.md.slo ? 'BREACH' : 'ok') }], list.sort((a, b) => (a.av - a.md.slo) - (b.av - b.md.slo)), 'Worst deployment-months first.'); break; }
      case 'mchg': out = recTable([{ h: 'Change', f: r => r.id }, { h: 'Month', f: r => mL(r.m) }, { h: 'Model', f: r => I.MODEL[r.mo].name }, { h: 'Evaluated', f: r => (r.evaluated ? 'Yes' : 'NO') }, { h: 'Migration', f: r => (r.migration ? 'Yes' : 'No') }, { h: 'Failed', f: r => (r.failed ? 'YES' : '-') }], q.mchg().slice().reverse(), ''); break;
      case 'evals': out = recTable([{ h: 'Month', f: r => mL(r.m) }, { h: 'Model', f: r => I.MODEL[r.mo].name }, { h: 'Runs', r: 1, f: r => r.runs }, { h: 'Regressions', r: 1, f: r => r.regressions }], q.evals().slice().reverse(), ''); break;
      case 'gpu': case 'components': out = recTable([{ h: 'Month', f: r => mL(r.m) }, { h: 'Component', f: r => I.COMP[r.comp].name }, { h: 'Requests', r: 1, f: r => fmt(r.req, 'count', 'full') }, { h: 'Availability', r: 1, f: r => (r.req ? fmt(r.ok / r.req * 100, '%') : 'n/a') }, { h: 'GPUs', r: 1, f: r => r.gpus || '-' }, { h: 'Utilisation', r: 1, f: r => (r.util ? fmt(r.util * 100, '%') : '-') }, { h: 'Peak', r: 1, f: r => (r.peak || '-') }, { h: 'Monitored', r: 1, f: r => r.monitored + ' / ' + r.assets }, { h: 'DR tests (ok)', r: 1, f: r => (r.foTests ? r.foOk + '/' + r.foTests : '-') }], q.infRows(k.recs === 'gpu' ? 'gpu' : null).slice().sort((a, b) => b.m - a.m), 'Shared platform (not allocated to BUs).'); break;
      case 'deps': out = recTable([{ h: 'Dependency', f: x => x.name }, { h: 'SPOF', f: x => (x.spof ? (x.spofFixed != null && x.spofFixed <= m ? 'Mitigated ' + mL(x.spofFixed) : 'OPEN') : 'No') }, { h: 'Last DR test', f: x => { const t = x.tests.filter(t => t.m <= m).slice(-1)[0]; return t ? mL(t.m) + (t.pass ? ' pass' : ' FAIL') : 'never'; } }, { h: 'Passed in 12 months', f: x => (x.tests.some(t => t.pass && t.m <= m && t.m >= m - 11) ? 'Yes' : 'NO') }], q.deps(), ''); break;
      case 'shadowApps': out = recTable([{ h: 'ID', f: x => x.id }, { h: 'Application', f: x => x.name }, { h: 'Tenant', f: x => tnN(x.tn) }, { h: 'Users', r: 1, f: x => x.users }, { h: 'Discovered', f: x => mL(x.from) }, { h: 'Status', f: x => (x.to != null && x.to <= m ? x.outcome : 'ACTIVE') }], q.shadowApps().concat(q.shadowAppsFound().filter(x => !(x.from <= m && (x.to == null || x.to > m)))), 'Active at period end, plus items discovered and resolved in the period.'); break;
      case 'shadowAgents': out = recTable([{ h: 'ID', f: x => x.id }, { h: 'Agent type', f: x => x.name }, { h: 'Tenant', f: x => tnN(x.tn) }, { h: 'Discovered via', f: x => x.via }, { h: 'Discovered', f: x => mL(x.from) }, { h: 'Status', f: x => (x.to != null && x.to <= m ? x.outcome : 'ACTIVE') }], q.shadowAgents().concat(q.shadowAgentsFound().filter(x => !(x.from <= m && (x.to == null || x.to > m)))), ''); break;
      case 'mcp': out = recTable([{ h: 'ID', f: x => x.id }, { h: 'Server', f: x => x.name }, { h: 'Tenant', f: x => tnN(x.tn) }, { h: 'Registered', f: x => (x.registered ? 'Yes' : 'NO') }, { h: 'Seen since', f: x => mL(x.from) }], q.mcp().sort((a, b) => a.registered - b.registered), ''); break;
      case 'controls': out = recTable([{ h: 'Control', f: x => x.ctl + ' ' + x.name }, { h: 'BU', f: x => x.bu }, { h: 'Family', f: x => x.family }, { h: 'Frameworks', f: x => x.fw.join(', ') }, { h: 'Implemented', f: x => (x.implFrom != null && x.implFrom <= m ? mL(x.implFrom) : 'NO') }, { h: 'Latest test', f: x => { const t = latestTestOf(x, m); return t ? mL(t.m) + (t.effective ? ' effective' : ' INEFFECTIVE') : 'untested'; } }, { h: 'Drift (period)', f: x => (x.drift.some(d => d >= q.from && d <= q.to) ? 'YES' : '-') }], q.ctlInst(), 'Applicable control instances only.', 60); break;
      case 'findings': out = recTable([{ h: 'Finding', f: x => x.id }, { h: 'BU', f: x => x.bu }, { h: 'Severity', f: x => x.sev }, { h: 'Framework', f: x => x.fw }, { h: 'Title', f: x => x.title }, { h: 'Due', f: x => (D.MONTHS[x.due] ? mL(x.due) : 'later') }, { h: 'Closed', f: x => (x.closed == null ? 'OPEN' : (D.MONTHS[x.closed] ? mL(x.closed) : 'later') + (x.closed <= x.due ? ' on time' : ' LATE')) }], q.findings().filter(x => x.due >= q.from && x.due <= q.to), 'Findings due in the period.'); break;
      case 'agentFindings': out = recTable([{ h: 'Finding', f: x => x.id }, { h: 'Agent', f: x => I.AGENT[x.agent].name }, { h: 'Severity', f: x => x.sev }, { h: 'Title', f: x => x.title }, { h: 'Opened', f: x => mL(x.m) }, { h: 'Status', f: x => (x.closed != null && x.closed <= m ? 'Closed ' + mL(x.closed) : 'OPEN') }], q.agentFindings().filter(x => x.m <= m).slice().reverse(), ''); break;
      case 'exceptions': out = recTable([{ h: 'Exception', f: x => x.id }, { h: 'BU', f: x => x.bu }, { h: 'Severity', f: x => x.sev }, { h: 'Title', f: x => x.title }, { h: 'Opened', f: x => mL(x.m) }, { h: 'Expires', f: x => (D.MONTHS[x.expires] ? mL(x.expires) : 'later') + (x.expires < m ? ' (PAST)' : '') }], q.exceptions().filter(x => x.m <= m && (x.closed == null || x.closed > m)), 'Open at period end.'); break;
      case 'vendors': out = recTable([{ h: 'Vendor', f: x => x.id + ' ' + x.name }, { h: 'Onboarded', f: x => mL(x.from) }, { h: 'Assessed', f: x => (x.assessedFrom != null && x.assessedFrom <= m ? mL(x.assessedFrom) : 'NO') }], q.vendors(), ''); break;
      case 'irItems': out = recTable([{ h: 'BU', f: x => x.bu }, { h: 'Readiness item', f: x => x.name }, { h: 'Status', f: x => (x.from <= m ? 'Complete' : 'OPEN') }], q.irItems(), ''); break;
      case 'atlas': out = recTable([{ h: 'Technique', f: x => x.id + ' ' + x.name }, { h: 'Detection', f: x => (x.from <= m ? 'Validated ' + mL(x.from) : 'GAP') }], q.atlas(), 'MITRE ATLAS-aligned technique list (illustrative).'); break;
      case 'supply': out = recTable([{ h: 'Component', f: x => x.id }, { h: 'Kind', f: x => x.kind }, { h: 'Provenance verified', f: x => (x.provFrom != null && x.provFrom <= m ? mL(x.provFrom) : 'NO') }], q.supply(), ''); break;
      case 'byControl': { const by = {}; fin().forEach(x => { if (x.cat === 'saving' && x.status !== 'Approved') return; const e = by[x.ctl] || (by[x.ctl] = { c: x.ctl, s: 0, l: 0 }); if (x.cat === 'saving') e.s += x.amt; else e.l += x.amt; }); const rows = Object.keys(by).map(c => by[c]).sort((a, b) => (b.s + b.l) - (a.s + a.l)); out = recTable([{ h: 'Control', f: x => x.c }, { h: 'Savings', r: 1, f: x => fmt(x.s, 'AED', 'full') }, { h: 'Loss prevented (attributed)', r: 1, f: x => fmt(x.l, 'AED', 'full') }, { h: 'Total', r: 1, f: x => fmt(x.s + x.l, 'AED', 'full') }], rows, 'Σ of the Total column = KPI 1 + KPI 2.'); break; }
      default: {
        const usesAgents = ['agents', 'agentsCritical', 'agentsPriv', 'agentsKs', 'agentsOwner', 'agentsId', 'agentsXb', 'agentsEval', 'agentsRa', 'agentsTm', 'agentsSiem'].indexOf(k.recs) >= 0;
        if (usesAgents && k.recs !== 'agents') {
          const ags = q.agents();
          const attr = {
            agentsCritical: [{ h: 'Critical', f: a => (I.WF[a.wf].crit ? 'Yes' : 'No') }, { h: 'Fallback model', f: a => (a.fallback ? I.MODEL[a.fallback].name : 'NONE') }, { h: 'Fallback tested', f: a => (a.fbTestedFrom != null && a.fbTestedFrom <= m ? mL(a.fbTestedFrom) : 'NO') }],
            agentsPriv: [{ h: 'Privileged workflow', f: a => (a.privileged ? 'Yes' : 'No') }, { h: 'Excess privilege', f: a => (a.excessPriv && a.excessPriv[0] <= m && (a.excessPriv[1] == null || a.excessPriv[1] > m) ? 'OPEN since ' + mL(a.excessPriv[0]) : '-') }],
            agentsKs: [{ h: 'Kill switch', f: a => (a.killSwitchFrom != null && a.killSwitchFrom <= m ? mL(a.killSwitchFrom) : 'NONE') }, { h: 'Latest drill', f: a => { let dd = null; D.ksDrills.forEach(x => { if (x.agent === a.id && x.m <= m) dd = x; }); return dd ? mL(dd.m) + (dd.pass ? ' pass' : ' FAIL') : 'pending'; } }],
            agentsOwner: [{ h: 'Owner', f: a => (a.ownerUntil != null && a.ownerUntil <= m ? 'NONE (left ' + mL(a.ownerUntil) + ')' : a.owner) }],
            agentsId: [{ h: 'Identity', f: a => (a.identityFrom <= m ? 'Managed workload identity' : 'SHARED KEY') }],
            agentsXb: [{ h: 'Primary endpoint', f: a => I.MODEL[a.primary].region }, { h: 'Transfer approved', f: a => (a.xbApprovedFrom != null ? mL(a.xbApprovedFrom) : (I.MODEL[a.primary].residency !== 'UAE' ? 'NO' : 'n/a (UAE)')) }],
            agentsEval: [{ h: 'Latest evaluation', f: a => { let e = null; a.evals.forEach(x => { if (x.m <= m) e = x; }); return e ? mL(e.m) + (e.pass ? ' pass' : ' FAIL') : 'none'; } }],
            agentsRa: [{ h: 'Latest risk assessment', f: a => { const xs = a.assessments.filter(x => x <= m); return xs.length ? mL(xs[xs.length - 1]) + (xs[xs.length - 1] >= m - 11 ? '' : ' (EXPIRED)') : 'NONE'; } }],
            agentsTm: [{ h: 'Threat model', f: a => (a.threatModelFrom != null && a.threatModelFrom <= m ? mL(a.threatModelFrom) : 'NONE') }],
            agentsSiem: [{ h: 'SIEM telemetry', f: a => (a.siemFrom <= m ? mL(a.siemFrom) : 'NONE') }]
          }[k.recs] || [];
          out = recTable(invCols(attr), ags, 'Agent registry at ' + D.MONTHS[m].label + '.', 70);
        } else {
          const rows = agentRows(q);
          out = recTable([{ h: 'Agent', f: r => I.AGENT[r.id].name }, { h: 'Tenant', f: r => I.AGENT[r.id].tenant }, { h: 'Tasks', r: 1, f: r => fmt(r.tasks, 'count', 'full') }, { h: 'Success', r: 1, f: r => (r.tasks ? (r.succ / r.tasks * 100).toFixed(1) + '%' : '-') }, { h: 'Tokens', r: 1, f: r => fmt(r.tok, 'tokens') }, { h: 'Inference AED', r: 1, f: r => fmt(r.cost, 'AED', 'full') }, { h: 'Unauth. executed', r: 1, f: r => r.toolUnOk }, { h: 'PI success', r: 1, f: r => r.piOk }, { h: 'High-risk exec.', r: 1, f: r => r.hrAtt - r.hrBlk }, { h: 'Loops', r: 1, f: r => r.loops }], rows, 'Per-agent observations from the agent-activity fact.', 70);
        }
      }
    }
    host.innerHTML = out || '<p class="muted">Derived indicator: see the inputs and linked KPIs above.</p>';
    const b = $('#recCsv', host);
    if (b && recTable.last) { const snap = recTable.last; b.addEventListener('click', () => downloadCsv('records-kpi-' + k.id + '.csv', [snap.cols.map(c => c.h)].concat(snap.rows.map(r => snap.cols.map(c => String(c.f(r)).replace(/<[^>]+>/g, '')))))); }
  }

  // ------------------------------------------------------------------ exports
  function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400); }
  function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function downloadCsv(name, rows) { download(name, new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })); }
  function catalogRows(f) {
    return LIST.map(k => { const r = E.quick(k.id, f); return [k.id, k.dom, DOM[k.dom].short, k.name, k.def, k.formula, EN.unitWord(k.unit), k.dir, r.value, fmt(r.value, k.unit, 'full'), r.tgt, r.warn, r.crit, ST_LABEL[r.status], k.owner, k.freq, (k.src || []).map(s => SRC[s] ? SRC[s].name : s).join('; '), k.ev || '', k.incl || '', k.miss || '', k.cls]; });
  }
  const CAT_HEAD = ['ID', 'Domain', 'Domain name', 'KPI', 'Definition', 'Formula', 'Unit', 'Direction', 'Value (raw)', 'Value (formatted)', 'Target', 'Warning', 'Critical', 'Status', 'Owner', 'Frequency', 'Source systems', 'Evidence', 'Inclusion / exclusion', 'Missing data', 'Classification'];
  function exportCsv() { const f = filt(); downloadCsv('ciso-kpi-catalog-' + D.MONTHS[f.from].key + '_' + D.MONTHS[f.to].key + '.csv', [['SYNTHETIC SAMPLE DATA, not live enterprise metrics', 'Scope: ' + periodLabel()]].concat([CAT_HEAD]).concat(catalogRows(f))); }
  function exportXlsx() {
    const f = filt();
    const scope = [['CISO Executive Agentic Enterprise Dashboard: executive export'], ['SYNTHETIC SAMPLE DATA, not live enterprise metrics'], ['Scope', periodLabel()], ['Filters', FKEYS.filter(k => f[k]).map(k => EN.FILTER_LABELS[k] + ': ' + filterValueLabel(k, f[k])).join('; ') || 'none'], ['Data as of', D.AS_OF.label], ['Currency', 'AED'], []];
    const execIds = ['X1', 1, 2, 3, 'X3', 27, 29, 28, 31, 20, 126, 43, 63, 64, 71, 72, 73, 'X4', 101, 102, 103, 'X5', 'X6', 'X2'];
    const pf = prevF(f);
    const summary = scope.concat([['KPI', 'Name', 'Value', 'Formatted', 'Target', 'Status', 'Prior period value', 'Formula']]).concat(execIds.map(id => { const k = K[id], r = E.quick(id, f); return [String(id), k.name, r.value, fmt(r.value, k.unit, 'full'), r.tgt, ST_LABEL[r.status], pf ? E.evaluate(id, pf) : null, k.formula]; }));
    const ms = monthsWindow(f, 12);
    const trend = [['KPI', 'Name'].concat(ms.map(m => D.MONTHS[m].label))].concat(LIST.map(k => [String(k.id), k.name].concat(ms.map(m => E.evaluate(k.id, subMonth(f, m))))));
    const inputs = [['KPI', 'Name', 'Symbol', 'Input', 'Value', 'Unit', 'Source']];
    LIST.forEach(k => { const d = E.detail(k.id, f); d.inputs.forEach(i => inputs.push([String(k.id), k.name, i.k, i.label, i.value, i.unit, i.src || (i.kpi != null ? 'KPI ' + i.kpi : '')])); });
    const alerts = [['ID', 'Severity', 'Alert', 'Affected critical services', 'Owner', 'Business impact', 'Mitigation', 'Deadline', 'Executive decision', 'Linked KPIs']].concat(computeAlerts(f).map(a => [a.id, a.sev, a.title, (a.services || []).join('; '), a.owner, a.impact, a.mitigation, a.due, a.decision, a.kpis.join(', ')]));
    const bytes = XL.build([
      { name: 'Executive summary', rows: summary, headerRows: [0, 7], freeze: 8, widths: [8, 42, 18, 22, 16, 12, 18, 70] },
      { name: 'KPI catalog', rows: [CAT_HEAD].concat(catalogRows(f).map(r => r.map(v => (typeof v === 'number' && !isFinite(v) ? null : v)))), widths: [6, 6, 20, 38, 60, 60, 12, 8, 16, 22, 14, 14, 14, 12, 30, 12, 40, 40, 50, 50, 12] },
      { name: 'Monthly trend', rows: trend, widths: [6, 40].concat(ms.map(() => 14)) },
      { name: 'Calculation inputs', rows: inputs, widths: [6, 38, 8, 60, 18, 10, 40] },
      { name: 'Alerts & decisions', rows: alerts, widths: [8, 10, 36, 40, 26, 60, 60, 12, 60, 14] }
    ]);
    download('ciso-executive-dashboard-' + D.MONTHS[f.from].key + '_' + D.MONTHS[f.to].key + '.xlsx', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  // ------------------------------------------------------------------ render loop
  function render() {
    computeAlerts.cache = {};
    figs = figs.filter(f => f.isConnected);
    renderFilters();
    renderNav();
    const main = $('#main');
    figs = [];
    if (state.route === 'd') pageDomain(main, state.arg);
    else if (state.route === 'alerts') pageAlerts(main);
    else if (state.route === 'trace') pageTrace(main);
    else if (state.route === 'catalog') pageCatalog(main);
    else if (state.route === 'method') pageMethod(main);
    else pageExec(main);
    const titles = { exec: 'Executive overview', d: state.arg ? state.arg + '. ' + (DOM[state.arg] || {}).short : '', alerts: 'Risk alerts', trace: 'Agent trace explorer', catalog: 'KPI catalog', method: 'Methodology' };
    document.title = (titles[state.route] ? titles[state.route] + ' · ' : '') + 'CISO Executive Agentic Enterprise Dashboard';
  }
  function onHash() {
    parseHash();
    const key = pageKey();
    const pageChanged = key !== state.lastKey;
    if (pageChanged) { state.lastKey = key; render(); window.scrollTo({ top: 0 }); $('#nav').classList.remove('open'); }
    renderDrawer();
  }

  // ------------------------------------------------------------------ events
  document.addEventListener('change', e => {
    if (e.target.closest('#filters') || e.target.id === 'roleSel') return onFilterChange(e);
    if (e.target.id === 'trAgent') { state.traceAgent = e.target.value; state.session = null; render(); }
    if (e.target.id === 'trMonth') { state.traceMonth = parseInt(e.target.value, 10); state.session = null; render(); }
    if (e.target.id === 'catDom') { state.catDom = e.target.value; render(); }
    if (e.target.id === 'catSt') { state.catStatus = e.target.value; render(); }
  });
  let catT;
  document.addEventListener('input', e => { if (e.target.id === 'catQ') { clearTimeout(catT); const v = e.target.value; catT = setTimeout(() => { state.catQuery = v; render(); const el = $('#catQ'); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }, 220); } });
  document.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('#btnReset')) { FKEYS.forEach(k => { state.f[k] = ''; }); const r = role(); if (r.bu) state.f.bu = r.bu; state.period = 'ytd'; state.from = 14; state.to = 23; state.drill = []; navigate({ kpi: null }); return; }
    if (t.closest('#btnMore')) { state.filtersOpen = !state.filtersOpen; renderFilters(); return; }
    if (t.closest('#btnPdf')) { window.print(); return; }
    if (t.closest('#btnXlsx')) { exportXlsx(); return; }
    if (t.closest('#btnCsv') || t.closest('#catCsv')) { exportCsv(); return; }
    if (t.closest('#catXlsx')) { exportXlsx(); return; }
    if (t.closest('#menuToggle')) { $('#nav').classList.toggle('open'); return; }
    if (t.closest('#drClose') || t.id === 'drawerBackdrop') { closeDrawer(); return; }
    const secA = t.closest('[data-sec]');
    if (secA) { e.preventDefault(); const s = document.getElementById(secA.dataset.sec); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const sev = t.closest('[data-sev]');
    if (sev && state.route === 'alerts') { state.alertSev = sev.dataset.sev; render(); return; }
    const dr = t.closest('[data-drill]');
    if (dr) { const i = parseInt(dr.dataset.drill, 10); state.drill = state.drill.slice(0, i + 1); state.session = null; renderDrawer(); scrollToDrill(); return; }
    const dk = t.closest('[data-dkey]');
    if (dk) { state.drill.push({ dim: dk.dataset.ddim, key: dk.dataset.dkey, label: dk.dataset.dlabel }); state.session = null; renderDrawer(); scrollToDrill(); return; }
    const ses = t.closest('[data-session]');
    if (ses) { state.session = ses.dataset.session; if (state.kpi) { renderDrawer(); scrollToDrill(); } else render(); return; }
    const kp = t.closest('[data-kpi]');
    if (kp && !t.closest('a[href]:not([data-kpi])')) { e.preventDefault(); if (kp.dataset.wf && !state.f.wf) { state.f.wf = kp.dataset.wf; } openKpi(kp.dataset.kpi); return; }
    if (t.closest('.nav-link')) { $('#nav').classList.remove('open'); }
  });
  function scrollToDrill() { const s = document.getElementById('s6'); if (s) s.scrollIntoView({ block: 'start' }); }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (state.kpi) closeDrawer(); else $('#nav').classList.remove('open'); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('li[data-kpi], tr[data-kpi], tr[data-dkey], tr[data-session]')) { e.preventDefault(); e.target.click(); }
  });
  window.addEventListener('hashchange', onHash);
  window.addEventListener('beforeprint', () => { figs.forEach(f => f.isConnected && f._redraw && f._redraw()); });

  // expose for tests / console
  window.CISO_APP = { E: E, K: K, LIST: LIST, computeAlerts: computeAlerts, state: state, exportXlsx: exportXlsx };
  if (!location.hash) history.replaceState(null, '', '#/exec');
  onHash();
}());
