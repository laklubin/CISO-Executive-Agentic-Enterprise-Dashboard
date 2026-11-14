/*!
 * CISO Executive Agentic Enterprise Dashboard - KPI calculation engine
 * ------------------------------------------------------------------
 * Filter context, correct aggregation (ratios are always re-computed
 * from summed numerators / denominators, never averaged), snapshot vs
 * flow semantics, threshold normalisation, RAG status and formatting.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CISO_ENGINE = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Which global filters each fact / record set can honour.
  const FACT_DIMS = {
    act: ['bu', 'tn', 'env', 'agent', 'mp', 'app', 'wf'],
    ten: ['bu', 'tn'],
    inc: ['bu', 'tn', 'sev', 'ctl'],
    fin: ['bu', 'tn', 'ctl'],
    risk: ['bu', 'tn'],
    outM: ['mp', 'wf', 'sev'],
    outI: ['sev', 'wf'],
    inf: [],
    agents: ['bu', 'tn', 'agent', 'mp', 'app', 'wf'],
    shadowAgents: ['bu', 'tn'],
    shadowApps: ['bu', 'tn'],
    mcp: ['bu', 'tn'],
    ctlInst: ['bu', 'fw', 'ctl'],
    findings: ['bu', 'sev', 'fw'],
    agentFindings: ['bu', 'tn', 'agent', 'sev'],
    exceptions: ['bu', 'sev'],
    vendors: [],
    irItems: ['bu'],
    atlas: [],
    supply: [],
    deps: [],
    ksDrills: ['bu', 'tn', 'agent'],
    mchg: ['mp'],
    evals: ['mp'],
    quota: ['mp'],
    quotaNow: ['mp'],
    smpLat: ['mp'],
    smpTok: ['bu', 'tn', 'agent', 'app', 'wf'],
    smpQueue: []
  };
  const FILTER_KEYS = ['bu', 'tn', 'env', 'agent', 'mp', 'app', 'wf', 'ctl', 'sev', 'fw'];
  const FILTER_LABELS = { period: 'Period', bu: 'Business unit', tn: 'Customer / tenant', env: 'Environment', agent: 'Agent', mp: 'Model / provider', app: 'Application', wf: 'Workflow', ctl: 'Security control', sev: 'Severity', fw: 'Regulatory framework' };

  const PERIODS = [
    { id: 'm1', label: 'Oct 2026 (last closed month)', from: 23, to: 23 },
    { id: 'l3m', label: 'Last 3 months (Aug-Oct 2026)', from: 21, to: 23 },
    { id: 'l6m', label: 'Last 6 months (May-Oct 2026)', from: 18, to: 23 },
    { id: 'ytd', label: 'Year to date (Jan-Oct 2026)', from: 14, to: 23, yoy: true },
    { id: 'l12m', label: 'Last 12 months (Nov 2025-Oct 2026)', from: 12, to: 23 }
  ];

  function create(D) {
    const I = D.idx;
    const memo = new Map();

    function normFilter(f) {
      const o = { from: f.from, to: f.to };
      FILTER_KEYS.forEach(k => { o[k] = f[k] || ''; });
      return o;
    }
    function keyOf(f) { return f.from + '-' + f.to + '|' + FILTER_KEYS.map(k => f[k]).join('|'); }

    // ---------------- matching helpers ----------------
    function mpMatch(f, mo, prov) {
      if (!f.mp) return true;
      if (f.mp.indexOf('P:') === 0) return prov === f.mp.slice(2);
      return mo === f.mp.slice(2);
    }
    function matchAct(f, r) {
      return (!f.bu || r.bu === f.bu) && (!f.tn || r.tn === f.tn) && (!f.env || r.env === f.env) && (!f.agent || r.ag === f.agent) &&
        (!f.app || r.app === f.app) && (!f.wf || r.wf === f.wf) && mpMatch(f, r.mo, r.prov);
    }
    function matchAgent(f, a) {
      return (!f.bu || a.bu === f.bu) && (!f.tn || a.tenant === f.tn) && (!f.agent || a.id === f.agent) && (!f.app || a.app === f.app) &&
        (!f.wf || a.wf === f.wf) && mpMatch(f, a.primary, I.MODEL[a.primary].provider);
    }
    const orgMatch = (f, x) => (!f.bu || x.bu === f.bu) && (!f.tn || x.tn === f.tn);
    const activeAt = (x, m) => x.from <= m && (x.to == null || x.to > m);

    // ---------------- context ----------------
    function Ctx(f, tracker) {
      this.f = normFilter(f);
      this.key = keyOf(this.f);
      let c = memo.get(this.key);
      if (!c) {
        if (memo.size > 4000) memo.clear();
        c = { act: {}, ten: {}, tenL: {}, inf: {}, kpi: {}, kvals: {}, kpiTouched: {}, detail: {} };
        memo.set(this.key, c);
      }
      this.c = c;
      this.touched = tracker || new Set();
      this.from = this.f.from; this.to = this.f.to; this.last = this.f.to;
      this.nm = this.to - this.from + 1;
      let days = 0; for (let m = this.from; m <= this.to; m++) days += D.MONTHS[m].days;
      this.days = days;
      this.D = D;
    }
    const P = Ctx.prototype;
    P.touch = function (fact) { this.touched.add(fact); };
    P.sub = function (patch) { return new Ctx(Object.assign({}, this.f, patch)); };
    P.month = function (m) { return this.sub({ from: m, to: m }); };
    P.prev = function () {
      const n = this.nm;
      const yoy = this.from === 14 && this.to === 23;
      const from = yoy ? 2 : this.from - n, to = yoy ? 11 : this.to - n;
      if (from < 0) return null;
      return this.sub({ from: from, to: to });
    };
    // sums over the agent-activity fact
    P.actIdx = function () {
      if (this.c.actIdx) return this.c.actIdx;
      const rows = D.act.rows, off = D.act.off, f = this.f, out = [];
      for (let i = off[this.from]; i < off[this.to + 1]; i++) if (matchAct(f, rows[i])) out.push(i);
      return (this.c.actIdx = out);
    };
    P.a = function (field) {
      this.touch('act');
      const v = this.c.act[field];
      if (v !== undefined) return v;
      const idx = this.actIdx(), rows = D.act.rows;
      let s = 0;
      for (let i = 0; i < idx.length; i++) s += rows[idx[i]][field];
      return (this.c.act[field] = s);
    };
    P.aWhere = function (field, pred) {
      this.touch('act');
      const idx = this.actIdx(), rows = D.act.rows;
      let s = 0;
      for (let i = 0; i < idx.length; i++) { const r = rows[idx[i]]; if (pred(r)) s += r[field]; }
      return s;
    };
    P.actRows = function () { this.touch('act'); return this.actIdx().map(i => D.act.rows[i]); };
    // tenant-month fact (flow and end-of-period snapshot)
    P.t = function (field) {
      this.touch('ten');
      const v = this.c.ten[field];
      if (v !== undefined) return v;
      const rows = D.ten.rows, off = D.ten.off, f = this.f;
      let s = 0;
      for (let i = off[this.from]; i < off[this.to + 1]; i++) if (orgMatch(f, rows[i])) s += rows[i][field];
      return (this.c.ten[field] = s);
    };
    P.tl = function (field) {
      this.touch('ten');
      const v = this.c.tenL[field];
      if (v !== undefined) return v;
      const rows = D.ten.rows, off = D.ten.off, f = this.f;
      let s = 0;
      for (let i = off[this.last]; i < off[this.last + 1]; i++) if (orgMatch(f, rows[i])) s += rows[i][field];
      return (this.c.tenL[field] = s);
    };
    P.tenRows = function () { this.touch('ten'); const f = this.f; return D.ten.rows.filter(r => r.m >= this.from && r.m <= this.to && orgMatch(f, r)); };
    // infrastructure fact (shared platform; component predicate optional)
    P.inf = function (field, pred) {
      this.touch('inf');
      const k = field + (pred ? '|' + pred : '');
      const v = this.c.inf[k];
      if (v !== undefined) return v;
      const rows = D.inf.rows, off = D.inf.off;
      let s = 0;
      for (let i = off[this.from]; i < off[this.to + 1]; i++) if (!pred || rows[i].type === pred || rows[i].comp === pred) s += rows[i][field];
      return (this.c.inf[k] = s);
    };
    P.infL = function (field, pred) {
      this.touch('inf');
      const rows = D.inf.rows, off = D.inf.off;
      let s = 0;
      for (let i = off[this.last]; i < off[this.last + 1]; i++) if (!pred || rows[i].type === pred || rows[i].comp === pred) s += rows[i][field];
      return s;
    };
    P.infRows = function (pred) { this.touch('inf'); return D.inf.rows.filter(r => r.m >= this.from && r.m <= this.to && (!pred || r.type === pred || r.comp === pred)); };
    // event records within the period
    P.incidents = function () {
      this.touch('inc');
      if (this.c.inc) return this.c.inc;
      const f = this.f;
      return (this.c.inc = D.incidents.filter(x => x.m >= this.from && x.m <= this.to && orgMatch(f, x) && (!f.sev || x.sev === f.sev) && (!f.ctl || x.controls.some(c => c.ctl === f.ctl))));
    };
    P.fin = function () {
      this.touch('fin');
      if (this.c.fin) return this.c.fin;
      const f = this.f;
      return (this.c.fin = D.fin.filter(x => x.m >= this.from && x.m <= this.to && orgMatch(f, x) && (!f.ctl || x.ctl === f.ctl)));
    };
    P.outM = function () {
      this.touch('outM');
      const f = this.f;
      return D.outM.filter(o => o.m >= this.from && o.m <= this.to && mpMatch(f, o.mo, o.prov) && (!f.sev || o.sev === f.sev) && (!f.wf || o.wfs.indexOf(f.wf) >= 0));
    };
    P.outI = function () {
      this.touch('outI');
      const f = this.f;
      return D.outI.filter(o => o.m >= this.from && o.m <= this.to && (!f.sev || o.sev === f.sev) && (!f.wf || o.wfs.indexOf(f.wf) >= 0));
    };
    P.mchg = function () { this.touch('mchg'); const f = this.f; return D.mchg.filter(x => x.m >= this.from && x.m <= this.to && mpMatch(f, x.mo, x.prov)); };
    P.evals = function () { this.touch('evals'); const f = this.f; return D.evals.filter(x => x.m >= this.from && x.m <= this.to && mpMatch(f, x.mo, x.prov)); };
    P.quota = function () { this.touch('quota'); const f = this.f; return D.quota.filter(x => x.m >= this.from && x.m <= this.to && mpMatch(f, x.mo, x.prov)); };
    P.quotaNow = function () { this.touch('quotaNow'); const f = this.f; return D.quotaNow.filter(x => mpMatch(f, x.mo, x.prov)); };
    P.findings = function () { this.touch('findings'); const f = this.f; return D.findings.filter(x => (!f.bu || x.bu === f.bu) && (!f.sev || x.sev === f.sev) && (!f.fw || x.fw === f.fw)); };
    P.agentFindings = function () { this.touch('agentFindings'); const f = this.f; return D.agentFindings.filter(x => orgMatch(f, x) && (!f.agent || x.agent === f.agent) && (!f.sev || x.sev === f.sev)); };
    P.exceptions = function () { this.touch('exceptions'); const f = this.f; return D.exceptions.filter(x => (!f.bu || x.bu === f.bu) && (!f.sev || x.sev === f.sev)); };
    P.ksDrills = function () { this.touch('ksDrills'); const f = this.f; return D.ksDrills.filter(x => x.m >= this.from && x.m <= this.to && orgMatch(f, x) && (!f.agent || x.agent === f.agent)); };
    // inventory snapshots at the end of the period
    P.agents = function (pred) {
      this.touch('agents');
      const f = this.f, m = this.last;
      return D.AGENTS.filter(a => D.isActiveAgent(a, m) && matchAgent(f, a) && (!pred || pred(a, m)));
    };
    P.shadowAgents = function (m) { this.touch('shadowAgents'); const f = this.f; m = m == null ? this.last : m; return D.shadowAgents.filter(x => activeAt(x, m) && orgMatch(f, x)); };
    P.shadowAgentsFound = function () { this.touch('shadowAgents'); const f = this.f; return D.shadowAgents.filter(x => x.from >= this.from && x.from <= this.to && orgMatch(f, x)); };
    P.shadowApps = function (m) { this.touch('shadowApps'); const f = this.f; m = m == null ? this.last : m; return D.shadowApps.filter(x => activeAt(x, m) && orgMatch(f, x)); };
    P.shadowAppsFound = function () { this.touch('shadowApps'); const f = this.f; return D.shadowApps.filter(x => x.from >= this.from && x.from <= this.to && orgMatch(f, x)); };
    P.mcp = function (registered) { this.touch('mcp'); const f = this.f, m = this.last; return D.mcp.filter(x => activeAt(x, m) && orgMatch(f, x) && (registered == null || x.registered === registered)); };
    P.ctlInst = function () {
      this.touch('ctlInst');
      const f = this.f;
      return D.ctlInst.filter(x => x.applicable && (!f.bu || x.bu === f.bu) && (!f.ctl || x.family === f.ctl) && (!f.fw || x.fw.indexOf(f.fw) >= 0));
    };
    P.vendors = function () { this.touch('vendors'); return D.vendors.filter(v => v.from <= this.last); };
    P.irItems = function () { this.touch('irItems'); const f = this.f; return D.irItems.filter(x => !f.bu || x.bu === f.bu); };
    P.atlas = function () { this.touch('atlas'); return D.atlas; };
    P.supply = function () { this.touch('supply'); return D.supply.filter(s => s.from <= this.last); };
    P.deps = function () { this.touch('deps'); return D.deps; };
    P.riskRows = function () {
      this.touch('risk');
      if (this.c.risk) return this.c.risk;
      const f = this.f, rows = D.risk.rows, off = D.risk.off, out = [];
      for (let i = off[this.last]; i < off[this.last + 1]; i++) if (orgMatch(f, rows[i])) out.push(rows[i]);
      return (this.c.risk = out);
    };
    // pooled observation samples for percentile KPIs
    P.samples = function (kind) {
      const f = this.f, out = [];
      if (kind === 'lat' || kind === 'ttft') {
        this.touch('smpLat');
        for (let m = this.from; m <= this.to; m++) D.MODELS.forEach(md => { if (mpMatch(f, md.id, md.provider)) Array.prototype.push.apply(out, D.samples(kind, m, md.id)); });
      } else if (kind === 'tok') {
        this.touch('smpTok');
        for (let m = this.from; m <= this.to; m++) D.AGENTS.forEach(a => { if (D.isActiveAgent(a, m) && (!f.bu || a.bu === f.bu) && (!f.tn || a.tenant === f.tn) && (!f.agent || a.id === f.agent) && (!f.app || a.app === f.app) && (!f.wf || a.wf === f.wf)) Array.prototype.push.apply(out, D.samples('tok', m, a.id)); });
      } else if (kind === 'queue') {
        this.touch('smpQueue');
        for (let m = this.from; m <= this.to; m++) ['GPU-DXB1', 'GPU-AUH2'].forEach(c => { Array.prototype.push.apply(out, D.samples('queue', m, c)); });
      }
      return out;
    };
    // KPI evaluation inside this context
    P.kpi = function (id) {
      const v = evaluate(id, this, true);
      return v;
    };
    // split the current scope by a dimension -> [{key,label,ctx}]
    P.split = function (dim) {
      const f = this.f, out = [];
      const add = (key, label) => { const patch = {}; patch[dim] = key; out.push({ key: key, label: label, ctx: this.sub(patch) }); };
      if (dim === 'bu') D.BUS.forEach(b => { if (!f.bu || f.bu === b.id) add(b.id, b.name); });
      else if (dim === 'tn') D.TENANTS.forEach(t => { if ((!f.bu || t.bu === f.bu) && (!f.tn || f.tn === t.id)) add(t.id, t.name); });
      else if (dim === 'app') D.APPS.forEach(a => { if (!f.app || f.app === a.id) add(a.id, a.name); });
      else if (dim === 'wf') D.WORKFLOWS.forEach(w => { if (!f.wf || f.wf === w.id) add(w.id, w.name); });
      else if (dim === 'agent') D.AGENTS.forEach(a => { if (matchAgent(f, a) && a.start <= this.to && (a.end == null || a.end >= this.from)) add(a.id, a.name); });
      else if (dim === 'mp') D.MODELS.forEach(md => { if (mpMatch(f, md.id, md.provider)) add('M:' + md.id, md.name + ' (' + md.provider + ')'); });
      else if (dim === 'prov') D.PROVIDERS.forEach(p => { if (!f.mp || f.mp === 'P:' + p || (f.mp.indexOf('M:') === 0 && I.MODEL[f.mp.slice(2)].provider === p)) { out.push({ key: 'P:' + p, label: p, ctx: this.sub({ mp: f.mp && f.mp.indexOf('M:') === 0 ? f.mp : 'P:' + p }) }); } });
      else if (dim === 'env') D.ENVS.forEach(e => { if (!f.env || f.env === e) add(e, e === 'prod' ? 'Production' : 'Non-production'); });
      else if (dim === 'ctl') D.CONTROL_FAMILIES.forEach(c => { if (!f.ctl || f.ctl === c) add(c, c); });
      else if (dim === 'sev') ['Critical', 'High', 'Medium', 'Low'].forEach(s => { if (!f.sev || f.sev === s) add(s, s); });
      else if (dim === 'fw') D.FRAMEWORKS.forEach(w => { if (!f.fw || f.fw === w.id) add(w.id, w.name); });
      else if (dim === 'm') for (let m = this.from; m <= this.to; m++) out.push({ key: m, label: D.MONTHS[m].label, ctx: this.month(m) });
      return out;
    };

    // ---------------- KPI registry & evaluation ----------------
    const REG = {};
    function register(list) { list.forEach(k => { REG[k.id] = k; }); }
    function evaluate(id, q, nested) {
      const k = REG[id];
      if (!k) throw new Error('Unknown KPI ' + id);
      const c = q.c;
      if (c.kpi[id] !== undefined) {
        const t = c.kpiTouched[id]; if (t) t.forEach(x => q.touched.add(x));
        return c.kpi[id];
      }
      const tr = new Set();
      const qq = new Ctx(q.f, tr);
      let v;
      const vals = {};
      try {
        (k.inputs || []).forEach(inp => { vals[inp.k] = inp.kpi != null ? qq.kpi(inp.kpi) : inp.get(qq); });
        v = k.calc(vals, qq);
      } catch (e) {
        if (typeof console !== 'undefined') console.error('KPI ' + id + ' failed', e);
        v = null;
      }
      if (v !== null && v !== undefined && !isFinite(v)) v = null;
      c.kpi[id] = v;
      c.kvals[id] = vals;
      c.kpiTouched[id] = tr;
      tr.forEach(x => q.touched.add(x));
      return v;
    }
    function detail(id, f) {
      const k = REG[id];
      const q = new Ctx(f);
      const value = evaluate(id, q);
      const tracker = new Set(); const qq = new Ctx(f, tracker);
      evaluate(id, qq);
      const inputs = (k.inputs || []).map(inp => {
        const val = inp.kpi != null ? qq.kpi(inp.kpi) : inp.get(qq);
        const ref = inp.kpi != null ? REG[inp.kpi] : null;
        let note = inp.note || '';
        if (inp.noteFn) { try { note = inp.noteFn(qq) || ''; } catch (e) { note = ''; } }
        return { k: inp.k, label: inp.label || (ref ? ref.name : inp.k), unit: inp.unit || (ref ? ref.unit : ''), value: val, kpi: inp.kpi, src: inp.src || '', note: note, den: !!inp.den, w: inp.w, ids: inp.ids };
      });
      const prevQ = q.prev();
      const prev = prevQ ? evaluate(id, prevQ) : null;
      const tgt = resolve(k.tgt, q), warn = resolve(k.warn, q), crit = resolve(k.crit, q);
      const sv = statusValue(k, value, q);
      const st = status(k, sv, tgt, warn, crit);
      return { kpi: k, value: value, statusValue: sv, prev: prev, inputs: inputs, tgt: tgt, warn: warn, crit: crit, status: st.status, risk: st.risk, belowTarget: st.belowTarget, touched: Array.from(tracker), ctx: q };
    }
    function resolve(x, q) { return typeof x === 'function' ? x(q) : x; }
    // some KPIs report a volume but are rated on a derived figure (e.g. the unapproved share)
    function statusValue(k, value, q) {
      if (!k.statusOf || value == null) return value;
      const vals = q.c.kvals[k.id] || {};
      return k.statusOf(vals, value, q);
    }

    // thresholds -> normalised risk (0 = at/better than target, 50 = warning, 100 = critical)
    function normRisk(dir, v, T, W, C) {
      if (v == null || T == null || dir === 'none') return null;
      const up = dir === 'up';
      const better = (a, b) => up ? a >= b : a <= b;
      if (better(v, T)) return 0;
      if (W == null || C == null) return 50;
      const seg = (x, a, b, lo, hi) => (a === b) ? hi : lo + (hi - lo) * Math.min(1, Math.max(0, (x - a) / (b - a)));
      if (better(v, W)) return seg(v, T, W, 0, 50);
      if (better(v, C)) return seg(v, W, C, 50, 100);
      return 100;
    }
    function status(k, v, T, W, C) {
      if (v == null) return { status: 'nodata', risk: null, belowTarget: false };
      if (k.dir === 'none' || T == null) return { status: 'info', risk: null, belowTarget: false };
      const r = normRisk(k.dir, v, T, W, C);
      let s = 'good';
      if (r >= 100) s = 'critical'; else if (r >= 50) s = 'serious'; else if (r > 0) s = 'watch';
      return { status: s, risk: r, belowTarget: r > 0 };
    }
    function quick(id, f) {
      const k = REG[id];
      const q = new Ctx(f);
      const v = evaluate(id, q);
      const sv = statusValue(k, v, q);
      const st = status(k, sv, resolve(k.tgt, q), resolve(k.warn, q), resolve(k.crit, q));
      return { value: v, statusValue: sv, status: st.status, risk: st.risk, belowTarget: st.belowTarget, tgt: resolve(k.tgt, q), warn: resolve(k.warn, q), crit: resolve(k.crit, q) };
    }
    function series(id, f, n) {
      n = n || 12;
      const out = [];
      for (let m = Math.max(0, f.to - n + 1); m <= f.to; m++) {
        const q = new Ctx(Object.assign({}, f, { from: m, to: m }));
        out.push({ m: m, label: D.MONTHS[m].short, value: evaluate(id, q) });
      }
      return out;
    }
    // filter applicability for a KPI given the facts it touched
    function applicability(touched, f) {
      const res = { applied: [], partial: [], na: [] };
      FILTER_KEYS.forEach(key => {
        if (!f[key]) return;
        const facts = touched.filter(t => FACT_DIMS[t]);
        if (!facts.length) { res.na.push(key); return; }
        const n = facts.filter(t => FACT_DIMS[t].indexOf(key) >= 0).length;
        if (n === facts.length) res.applied.push(key); else if (n > 0) res.partial.push(key); else res.na.push(key);
      });
      return res;
    }

    // ---------------- statistics helpers ----------------
    function percentile(arr, p) {
      if (!arr.length) return { value: null, n: 0, rank: 0 };
      const s = arr.slice().sort((a, b) => a - b);
      const rank = Math.max(1, Math.ceil(p / 100 * s.length));
      return { value: s[rank - 1], n: s.length, rank: rank };
    }
    function linreg(ys) {
      const n = ys.length;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      ys.forEach((y, x) => { sx += x; sy += y; sxx += x * x; sxy += x * y; });
      const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
      const a = (sy - b * sx) / n;
      return { a: a, b: b };
    }

    return {
      D: D, REG: REG, register: register, ctx: f => new Ctx(f), evaluate: (id, f) => evaluate(id, new Ctx(f)),
      detail: detail, quick: quick, series: series, applicability: applicability, status: status, normRisk: normRisk, statusValue: statusValue,
      percentile: percentile, linreg: linreg, resolve: resolve, FILTER_KEYS: FILTER_KEYS, FILTER_LABELS: FILTER_LABELS, PERIODS: PERIODS, FACT_DIMS: FACT_DIMS,
      clearCache: () => memo.clear()
    };
  }

  // ---------------- formatting ----------------
  const nf = (d) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  const NF0 = nf(0), NF1 = nf(1), NF2 = nf(2), NF3 = nf(3), NF4 = nf(4);
  function compact(v, d) {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(d == null ? 2 : d) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(d == null ? (a >= 1e8 ? 0 : 1) : d) + 'M';
    if (a >= 1e4) return (v / 1e3).toFixed(d == null ? 0 : d) + 'K';
    return NF0.format(v);
  }
  // unit-aware formatting; mode 'short' (cards) or 'full' (calculation drawer)
  function fmt(v, unit, mode) {
    if (v == null || !isFinite(v)) return 'n/a';
    const full = mode === 'full';
    switch (unit) {
      case 'AED': return 'AED ' + (full ? NF0.format(Math.round(v)) : compact(v));
      case 'AED2': return 'AED ' + NF2.format(v);
      case '%': {
        const a = Math.abs(v);
        const f = (a >= 99.99 && a < 100) ? NF4 : (a >= 99.9 && a < 100) ? NF3 : (a >= 99 && a < 100) ? NF2 : (a > 0 && a < 0.1) ? NF3 : (a > 0 && a < 1) ? NF2 : NF1;
        return f.format(v) + '%';
      }
      case 'pp': return (v >= 0 ? '+' : '') + NF1.format(v) + ' pp';
      case 'x': return NF1.format(v) + '×';
      case 'ratio': return NF2.format(v) + '×';
      case 'h': return (full || Math.abs(v) < 1e5 ? NF0.format(Math.round(v)) : compact(v)) + ' h';
      case 'hd': return NF1.format(v) + ' h';
      case 'min': return NF1.format(v) + ' min';
      case 'mins': return NF0.format(Math.round(v)) + ' min';
      case 'ms': return NF0.format(Math.round(v)) + ' ms';
      case 'tokens': return full ? NF0.format(Math.round(v)) : compact(v);
      case 'tps': return NF1.format(v) + ' tok/s';
      case 'days': return NF0.format(Math.round(v)) + ' days';
      case 'months': return NF1.format(v) + ' months';
      case 'score': return NF0.format(Math.round(v));
      case 'perday': return NF0.format(Math.round(v)) + ' /day';
      case 'count': return full ? NF0.format(Math.round(v)) : (Math.abs(v) >= 1e5 ? compact(v) : NF0.format(Math.round(v)));
      case 'num': return Math.abs(v) >= 1e5 && !full ? compact(v) : (Math.abs(v) < 10 && v % 1 ? NF2.format(v) : NF0.format(Math.round(v)));
      default: return Math.abs(v) < 10 && v % 1 ? NF2.format(v) : NF0.format(Math.round(v));
    }
  }
  function unitWord(unit) {
    return ({ AED: 'AED', AED2: 'AED', '%': '%', x: '×', ratio: '×', h: 'hours', hd: 'hours', min: 'minutes', mins: 'minutes', ms: 'ms', tokens: 'tokens', tps: 'tokens/s', days: 'days', months: 'months', score: 'score (0-100)', count: 'count', perday: 'per day', num: 'number' })[unit] || unit;
  }

  return { create: create, fmt: fmt, compact: compact, unitWord: unitWord, PERIODS: PERIODS, FILTER_KEYS: FILTER_KEYS, FILTER_LABELS: FILTER_LABELS };
}));
