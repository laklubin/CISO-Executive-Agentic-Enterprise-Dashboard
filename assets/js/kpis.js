/*!
 * CISO Executive Agentic Enterprise Dashboard - KPI / KRI catalog
 * ------------------------------------------------------------------
 * 164 catalogued indicators (domains A-H) + 6 composite executive indices.
 * Every indicator declares: definition, formula, inputs (each with its
 * source), calculation, unit, direction, target, warning & critical
 * thresholds, owner, frequency, evidence, inclusion / exclusion rules,
 * missing-data behaviour and drill-down dimensions.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CISO_KPIS = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DOMAINS = {
    A: { code: 'A', name: 'Enterprise Financial Value & Cybersecurity Savings', short: 'Financial value', panel: 1, owner: 'CFO & CISO' },
    B: { code: 'B', name: 'Agentic Enterprise Efficiency & Productivity', short: 'Agentic efficiency', panel: 2, owner: 'Head of AI Operations' },
    C: { code: 'C', name: 'Token Economics, Inference Cost & Quota', short: 'Token economics', panel: 3, owner: 'AI FinOps Lead' },
    D: { code: 'D', name: 'Model Availability, Outage & LLM Performance', short: 'Model reliability', panel: 3, owner: 'AI Platform Owner' },
    E: { code: 'E', name: 'Token Exhaustion, Rate Limits & Consumption Risk', short: 'Token exhaustion', panel: 3, owner: 'AI FinOps Lead' },
    F: { code: 'F', name: 'AI Infrastructure, GPU & Data Center Resilience', short: 'AI infrastructure', panel: 3, owner: 'Head of Infrastructure' },
    G: { code: 'G', name: 'Agentic AI Security & Operational KRIs', short: 'Agentic security', panel: 4, owner: 'CISO' },
    H: { code: 'H', name: 'Agent Governance, Control Implementation & Compliance', short: 'Governance & compliance', panel: 4, owner: 'Head of AI Governance' },
    X: { code: 'X', name: 'Composite Executive Indices', short: 'Composite indices', panel: 0, owner: 'CISO' }
  };

  const DOMAIN_DEFAULTS = {
    A: { freq: 'Monthly', miss: 'Only Finance-approved or risk-validated records are counted. Months without an approved close are excluded and flagged; nothing is imputed.' },
    B: { freq: 'Weekly', miss: 'Runs without a complete trace are excluded from timing measures and reported as trace-coverage gaps. Tasks without an approved manual baseline are excluded from time comparisons.' },
    C: { freq: 'Daily', miss: 'Requests without token metadata are excluded and reported as gateway coverage gaps; billing is reconciled to provider invoices and variances above 2% are flagged.' },
    D: { freq: 'Daily', miss: 'Probe gaps longer than 5 minutes are treated as unknown (not available) and reported separately; no back-filling.' },
    E: { freq: 'Hourly', miss: 'Missing quota telemetry is treated as unknown utilisation and raises a data-quality alert.' },
    F: { freq: 'Daily', miss: 'Assets without telemetry are excluded from availability and counted as monitoring-coverage gaps.' },
    G: { freq: 'Daily', miss: 'Counts are lower bounds while trace coverage is below 100%; agents without traces are listed as blind spots.' },
    H: { freq: 'Monthly', miss: 'Controls not yet assessed are treated as not implemented / not effective (conservative).' },
    X: { freq: 'Monthly', miss: 'Components without data are excluded and the remaining weights are re-normalised; the component count is shown.' }
  };

  function build(D, E) {
    const W = D.idx.WF, M = D.idx.MODEL;
    const INC = {}; D.incidents.forEach(x => { INC[x.id] = x; });
    const S = (arr, f) => { let s = 0; for (let i = 0; i < arr.length; i++) { const x = arr[i]; s += (typeof f === 'function' ? f(x) : x[f]) || 0; } return s; };
    const pct = (a, b) => (b ? a / b * 100 : null);
    const div = (a, b) => (b ? a / b : null);
    const KA = ['env', 'agent', 'mp', 'app', 'wf'], KF = ['ctl'], KI = ['sev', 'ctl'], KM = ['mp', 'wf', 'sev'], KO = [];
    const anySet = (q, keys) => keys.some(k => q.f[k]);
    function share(q, ref) {
      if (!q.f.bu && !q.f.tn) return 1;
      const all = q.sub({ bu: '', tn: '' });
      let a = 0, b = 0;
      if (ref === 'risk') { a = S(q.riskRows(), r => r.bLef * r.bLm); b = S(all.riskRows(), r => r.bLef * r.bLm); }
      else if (ref === 'tasks') { const qa = q.sub({ env: '', agent: '', mp: '', app: '', wf: '' }), qb = all.sub({ env: '', agent: '', mp: '', app: '', wf: '' }); a = qa.a('tasks'); b = qb.a('tasks'); }
      else if (ref === 'tokens') { a = q.t('tokens'); b = all.t('tokens'); }
      else if (ref === 'users') { a = q.tl('users'); b = all.tl('users'); }
      else if (ref === 'agents') { a = q.sub({ agent: '', mp: '', app: '', wf: '' }).agents().length; b = all.sub({ agent: '', mp: '', app: '', wf: '' }).agents().length; }
      return b ? a / b : 0;
    }
    const abs = (perMonth, ref, keys) => q => (anySet(q, keys || []) ? null : perMonth * q.nm * share(q, ref));
    const absS = (val, ref, keys) => q => (anySet(q, keys || []) ? null : val * share(q, ref));
    const cnt = (val, ref) => q => (val === 0 ? 0 : Math.max(1, Math.round(val * share(q, ref))));
    const nmT = v => q => v * q.nm;
    const IA = (k, label, unit, field, src, x) => Object.assign({ k: k, label: label, unit: unit, get: q => q.a(field), src: src }, x || {});
    const IG = (k, label, unit, get, src, x) => Object.assign({ k: k, label: label, unit: unit, get: get, src: src }, x || {});
    const IK = (k, id, label) => ({ k: k, kpi: id, label: label });
    const L = [];
    const K = (id, dom, name, o) => { L.push(Object.assign({ id: id, dom: dom, name: name }, DOMAIN_DEFAULTS[dom], o)); };
    const memo = (q, key, fn) => { if (q.c[key] === undefined) q.c[key] = fn(); return q.c[key]; };

    // ---------------- shared derivations ----------------
    const savings = q => q.fin().filter(x => x.cat === 'saving');
    const lp = q => q.fin().filter(x => x.cat === 'loss_prevented');
    const ale = (rows, base) => S(rows, r => (base ? r.bLef * r.bLm : r.rLef * r.rLm));
    const modelExcl = q => q.a('eApp') + q.a('eRl') + q.a('eGw') + q.a('eNet');
    const modelFail = q => q.a('eProv') + q.a('eSrv') + q.a('eTo');
    const modelElig = q => q.a('req') - modelExcl(q);
    const tokens = q => q.a('tokIn') + q.a('tokOut');
    const pctl = (q, kind) => memo(q, 'p95|' + kind, () => E.percentile(q.samples(kind), 95));
    const comp = (q, id) => { const r = q.infRows(id); return { req: S(r, 'req'), ok: S(r, 'ok') }; };
    const usageAgents = q => memo(q, 'usageAgents', () => { const s = new Set(); q.actRows().forEach(r => { if (r.tokIn + r.tokOut > 0) s.add(r.ag); }); return s.size; });
    const costParts = q => memo(q, 'costParts', () => {
      let cin = 0, cca = 0, cout = 0;
      q.actRows().forEach(r => { const md = M[r.mo]; cin += (r.tokIn - r.tokCached) * md.p_in / 1e6; cca += r.tokCached * md.p_cache / 1e6; cout += r.tokOut * md.p_out / 1e6; });
      return { cin: cin, cca: cca, cout: cout };
    });
    const quotaMax = (q, kind) => memo(q, 'qmax|' + kind, () => {
      let best = null;
      q.quota().forEach(r => { const u = kind === 'rpm' ? r.peakRpm / r.rpmLimit : r.peakTpm / r.tpmLimit; if (!best || u > best.u) best = { u: u, r: r }; });
      return best;
    });
    const roadmap = m => Math.round(58 * Math.pow(Math.max(m, 1) / 23, 1.1));
    const lastDrill = (a, m) => { let d = null; D.ksDrills.forEach(x => { if (x.agent === a.id && x.m <= m) d = x; }); return d; };
    const latestEval = (a, m) => { let e = null; a.evals.forEach(x => { if (x.m <= m) e = x; }); return e; };
    const latestTest = (inst, m) => { let t = null; inst.tests.forEach(x => { if (x.m <= m && x.m >= m - 11) t = x; }); return t; };
    const endDate = m => new Date(Date.UTC(D.MONTHS[m].y, D.MONTHS[m].mo, D.MONTHS[m].days));
    const taskGrowth = q => { const p = q.prev(); if (!p) return null; const a = q.a('tasks'), b = p.a('tasks'); return b ? (a - b) / b * 100 : null; };
    const MLBL = id => M[id].name + ' (' + M[id].provider + ')';

    // =====================================================================
    // A. ENTERPRISE FINANCIAL VALUE & CYBERSECURITY SAVINGS
    // =====================================================================
    K(1, 'A', 'Total Realized Cost Savings', {
      unit: 'AED', dir: 'up', cls: 'Verified',
      def: 'Actual cost reductions (contracts, licences, contractors, overtime, external fees) delivered by cybersecurity and AI-agent initiatives and approved by Finance.',
      formula: 'Σ Finance-approved actual cost reductions in the period',
      expr: 'Σ of {n} Finance-approved ledger entries (pending {pend} excluded)',
      inputs: [
        IG('n', 'Approved ledger entries', 'count', q => savings(q).filter(x => x.status === 'Approved').length, 'Benefit-approval workflow'),
        IG('appr', 'Finance-approved cost reductions', 'AED', q => S(savings(q).filter(x => x.status === 'Approved'), 'amt'), 'Finance ERP / benefit-approval workflow'),
        IG('pend', 'Awaiting Finance approval (excluded)', 'AED', q => S(savings(q).filter(x => x.status === 'Pending'), 'amt'), 'Benefit-approval workflow')
      ],
      calc: v => v.appr,
      tgt: abs(1.6e6, 'risk', KF), warn: abs(1.3e6, 'risk', KF), crit: abs(1.0e6, 'risk', KF),
      src: ['ERP', 'FINAPP'], owner: 'CFO (Finance Business Partner, Cyber & AI)',
      ev: 'GL postings, contract amendments and approval IDs for every ledger entry.',
      incl: 'Only entries with status "Approved" and a realised effective date in the period. Cost avoidance, risk reduction and productivity capacity are excluded (reported in KPIs 3, 6 and 9).',
      imp: 'Cash released to the P&L; the primary evidence for the programme business case.',
      n: q => ({ n: savings(q).filter(x => x.status === 'Approved').length, label: 'approved ledger entries' }),
      recs: 'savings', drill: ['bu', 'tn', 'ctl']
    });
    K(2, 'A', 'Confirmed Financial Loss Prevented', {
      unit: 'AED', dir: 'up', cls: 'Verified',
      def: 'Loss that verified incidents would have caused, prevented by detection and response, validated by Finance / Risk and counted once per incident.',
      formula: 'Σ verified prevented loss per incident = gross control claims − duplicate claims',
      expr: '{raw} − {dup}',
      inputs: [
        IG('raw', 'Gross control claims (every involved control claims the full incident value)', 'AED', q => S(lp(q), 'claim'), 'SOAR case records / control owners'),
        IG('dup', 'Duplicate claims removed (same incident ID, several controls)', 'AED', q => S(lp(q), 'claim') - S(lp(q), 'amt'), 'De-duplication on incident ID'),
        IG('inc', 'Verified incidents contributing', 'count', q => new Set(lp(q).map(x => x.inc)).size, 'Finance / Risk validation')
      ],
      calc: v => v.raw - v.dup,
      tgt: abs(3.0e6, 'risk', KF), warn: abs(2.2e6, 'risk', KF), crit: abs(1.5e6, 'risk', KF),
      src: ['SOAR', 'SIEM', 'FINAPP'], owner: 'CISO with Chief Risk Officer',
      ev: 'Incident record, loss-exposure worksheet, Finance validation reference and control attribution weights.',
      incl: 'Only mitigated incidents with a Finance / Risk-validated loss exposure. Each incident is counted once; control attribution weights (primary control 50%, others share 50%) always sum to 100%.',
      imp: 'Demonstrates avoided financial damage without double counting across security tools.',
      n: q => ({ n: new Set(lp(q).map(x => x.inc)).size, label: 'verified incidents' }),
      recs: 'lossPrevented', drill: ['bu', 'tn', 'ctl'], money: null
    });
    K(3, 'A', 'Estimated Cyber Loss Avoidance', {
      unit: 'AED', dir: 'up', cls: 'Estimated',
      def: 'Annualised reduction in expected cyber loss achieved by controls and AI agents. A risk-based estimate, never presented as cash.',
      formula: 'Baseline expected annual loss − Residual expected annual loss',
      expr: '{base} − {resid}',
      inputs: [
        IG('base', 'Baseline (inherent) expected annual loss: Σ LEF × LM', 'AED', q => ale(q.riskRows(), true), 'Cyber risk register (FAIR)'),
        IG('resid', 'Residual expected annual loss after controls: Σ LEF × LM', 'AED', q => ale(q.riskRows(), false), 'Cyber risk register (FAIR)')
      ],
      calc: v => v.base - v.resid,
      tgt: absS(250e6, 'risk'), warn: absS(200e6, 'risk'), crit: absS(150e6, 'risk'),
      src: ['RISK'], owner: 'Chief Risk Officer with CISO',
      ev: 'Scenario-level FAIR calibration workshops, control-effectiveness evidence and loss tables.',
      incl: 'All register scenarios applicable to the selected scope, valued at period end. Annualised; not summed across months.',
      imp: 'Shows how much expected loss the security programme removes from the risk profile.',
      n: q => ({ n: q.riskRows().length, label: 'scenario instances' }),
      recs: 'risk', drill: ['bu', 'tn']
    });
    K(4, 'A', 'Expected Annual Cyber Loss', {
      unit: 'AED', dir: 'down', cls: 'Estimated',
      def: 'Residual annualised loss expectancy across the cyber risk register after current controls (FAIR loss event frequency × loss magnitude).',
      formula: 'Σ over risk scenarios (residual LEF × residual LM)',
      expr: 'Σ (residual LEF × residual LM) over {n} scenario instances',
      inputs: [
        IG('n', 'Risk scenario instances in scope', 'count', q => q.riskRows().length, 'Cyber risk register'),
        IG('lef', 'Residual loss events per year (Σ LEF)', 'num', q => S(q.riskRows(), 'rLef'), 'Cyber risk register'),
        IG('resid', 'Residual expected annual loss', 'AED', q => ale(q.riskRows(), false), 'Cyber risk register (FAIR)')
      ],
      calc: v => v.resid,
      tgt: absS(120e6, 'risk'), warn: absS(150e6, 'risk'), crit: absS(200e6, 'risk'),
      thr: 'Warning threshold equals the Board risk appetite (AED 150M group-wide, pro-rated by baseline exposure for BU views).',
      src: ['RISK'], owner: 'Chief Risk Officer',
      ev: 'FAIR scenario models with calibrated ranges and documented assumptions.',
      incl: 'Residual values at the end of the period for scenarios applicable to the selected BU / tenant.',
      imp: 'Compared with risk appetite to decide whether additional investment is required.',
      n: q => ({ n: q.riskRows().length, label: 'scenario instances' }),
      recs: 'risk', drill: ['bu', 'tn']
    });
    K(5, 'A', 'Net Realized Financial Benefit', {
      unit: 'AED', dir: 'up', cls: 'Verified',
      def: 'Cash-basis net benefit: realised savings plus verified prevented losses, minus the incremental programme cost.',
      formula: 'Realized savings + Verified prevented financial losses − Incremental programme costs',
      expr: '{sav} + {lp} − {cost}',
      inputs: [IK('sav', 1, 'Realized cost savings (KPI 1)'), IK('lp', 2, 'Confirmed loss prevented (KPI 2)'), IK('cost', 7, 'Incremental programme cost (KPI 7)')],
      calc: v => v.sav + v.lp - v.cost,
      tgt: abs(2.5e6, 'risk', KF.concat(KA)), warn: abs(1.5e6, 'risk', KF.concat(KA)), crit: abs(0, 'risk', KF.concat(KA)),
      src: ['ERP', 'FINAPP', 'SOAR'], owner: 'CFO',
      ev: 'Reconciled to the monthly management accounts.',
      incl: 'Excludes estimated loss avoidance (KPI 3) and productivity capacity (KPI 6) to stay cash-based.',
      imp: 'The single cash figure the CFO can sign off.',
      recs: 'savings', drill: ['bu', 'tn']
    });
    K(6, 'A', 'Enterprise Productivity Value', {
      unit: 'AED', dir: 'up', cls: 'Derived',
      def: 'Monetised value of human capacity released by AI agents (capacity, not cash): hours saved valued at each BU\'s fully loaded hourly rate.',
      formula: 'Σ (Human hours saved × BU fully loaded hourly rate)',
      expr: '{hrs} × {rate}',
      inputs: [
        IK('hrs', 29, 'Human hours saved (KPI 29)'),
        IG('rate', 'Blended fully loaded rate (Σ hours × BU rate ÷ Σ hours)', 'AED2', q => { const h = (q.a('manMin') - q.a('e2eMin')) / 60; return h ? q.a('prodAed') / h : null; }, 'HR loaded cost rates')
      ],
      calc: v => v.hrs * v.rate,
      tgt: abs(7e6, 'tasks', KA), warn: abs(5e6, 'tasks', KA), crit: abs(3e6, 'tasks', KA),
      src: ['ORCH', 'ITSM', 'HR'], owner: 'Head of AI Operations with CFO',
      ev: 'Trace-linked task records, baseline time studies and HR cost rates.',
      incl: 'Capacity value only. It is not added to cash savings; redeployment of capacity is tracked separately.',
      imp: 'Quantifies capacity available for higher-value work or avoided hiring.',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent']
    });
    K(7, 'A', 'Total Automation Operating Cost', {
      unit: 'AED', dir: 'down', cls: 'Measured',
      def: 'Full incremental run cost of security automation and AI agents: AI operating spend, automation platforms and engineering labour.',
      formula: 'Total AI operating spend + Automation platform cost + Automation engineering labour',
      expr: '{ai} + {plat} + {lab}',
      inputs: [
        IK('ai', 63, 'Total AI operating spend (KPI 63)'),
        IG('plat', 'Security automation platforms (SOAR, orchestration), allocated by task share', 'AED', q => q.t('plat'), 'Finance ERP'),
        IG('lab', 'Automation engineering labour, allocated by task share', 'AED', q => q.t('lab'), 'HR / timesheets')
      ],
      calc: v => v.ai + v.plat + v.lab,
      tgt: abs(1.75e6, 'tasks', KA), warn: abs(1.9e6, 'tasks', KA), crit: abs(2.1e6, 'tasks', KA),
      src: ['ERP', 'BILL', 'HR'], owner: 'CFO with CIO',
      ev: 'Provider invoices, licence contracts and timesheet allocations.',
      incl: 'Incremental costs only; pre-existing SOC staff costs are excluded.',
      imp: 'Denominator for ROI and payback.',
      drill: ['bu', 'tn']
    });
    K(8, 'A', 'Automation ROI', {
      unit: '%', dir: 'up', cls: 'Derived',
      def: 'Cash-basis return on the security automation and AI-agent programme.',
      formula: 'Net realized financial benefit ÷ Total automation operating cost × 100',
      expr: '{net} ÷ {cost} × 100',
      inputs: [IK('net', 5, 'Net realized financial benefit (KPI 5)'), IK('cost', 7, 'Total automation operating cost (KPI 7)')],
      calc: v => pct(v.net, v.cost),
      tgt: 200, warn: 100, crit: 0,
      src: ['ERP', 'FINAPP'], owner: 'CFO',
      ev: 'Derived from KPIs 5 and 7.',
      incl: 'Cash basis. Including productivity capacity (KPI 6) would raise ROI materially, but capacity is reported separately.',
      imp: 'Board-level measure of programme value for money.',
      drill: ['bu', 'tn']
    });
    K(9, 'A', 'Estimated Downtime Loss Avoided', {
      unit: 'AED', dir: 'up', cls: 'Estimated',
      def: 'Business impact avoided when model fallback or infrastructure failover shortened an outage.',
      formula: 'Σ (avoided outage minutes × business cost per minute of affected workflows)',
      expr: '{m} + {i}',
      inputs: [
        IG('m', 'Avoided impact: model outages with successful fallback', 'AED', q => S(q.outM(), 'avoided'), 'APM, AI gateway, BIA cost-per-minute'),
        IG('i', 'Avoided impact: infrastructure outages with successful failover', 'AED', q => S(q.outI(), 'avoided'), 'APM, BCM, BIA cost-per-minute')
      ],
      calc: v => v.m + v.i,
      tgt: abs(15e3, 'tasks', KM), warn: abs(5e3, 'tasks', KM), crit: abs(0, 'tasks', KM),
      src: ['APM', 'BCM'], owner: 'Head of Resilience (BCM)',
      ev: 'Outage timeline, failover logs and business impact analysis (BIA) cost per minute.',
      incl: 'Only outages where fallback / failover succeeded; avoided minutes = outage duration − actual impact minutes.',
      imp: 'Shows the value of resilience engineering (fallback models, failover).',
      n: q => ({ n: q.outM().filter(o => o.avoided > 0).length + q.outI().filter(o => o.avoided > 0).length, label: 'outages with avoided impact' }),
      recs: 'outages', drill: []
    });
    K(10, 'A', 'Actual Outage Financial Loss', {
      unit: 'AED', dir: 'down', cls: 'Verified',
      def: 'Finance-validated loss from AI model and infrastructure outages (SLA penalties, lost revenue, overtime, manual workarounds).',
      formula: 'Σ Finance-validated actual loss from model and infrastructure outages',
      expr: '{m} + {i}',
      inputs: [
        IG('m', 'Model outages: validated actual loss', 'AED', q => S(q.outM(), 'impactActual'), 'Finance ERP / incident post-mortems'),
        IG('i', 'Infrastructure outages: validated actual loss', 'AED', q => S(q.outI(), 'impactActual'), 'Finance ERP / incident post-mortems')
      ],
      calc: v => v.m + v.i,
      tgt: abs(20e3, 'tasks', KM), warn: abs(50e3, 'tasks', KM), crit: abs(120e3, 'tasks', KM),
      src: ['ERP', 'ITSM'], owner: 'CFO with Head of Infrastructure',
      ev: 'Post-incident reviews with Finance sign-off.',
      incl: 'Actual, booked losses only; estimated impact is reported in KPIs 85 and 124.',
      imp: 'Direct P&L impact of AI service unreliability.',
      recs: 'outages', drill: []
    });
    K(11, 'A', 'Fraud Loss Prevented', {
      unit: 'AED', dir: 'up', cls: 'Verified',
      def: 'Verified prevented loss for fraud incidents (business email compromise, payment fraud, account takeover); a de-duplicated subset of KPI 2.',
      formula: 'Σ verified prevented loss for fraud incidents (gross claims − duplicate claims)',
      expr: '{raw} − {dup}',
      inputs: [
        IG('raw', 'Gross control claims on fraud incidents', 'AED', q => S(lp(q).filter(x => INC[x.inc].fraud), 'claim'), 'Fraud case management / SOAR'),
        IG('dup', 'Duplicate claims removed', 'AED', q => { const a = lp(q).filter(x => INC[x.inc].fraud); return S(a, 'claim') - S(a, 'amt'); }, 'De-duplication on incident ID'),
        IG('n', 'Verified fraud incidents', 'count', q => new Set(lp(q).filter(x => INC[x.inc].fraud).map(x => x.inc)).size, 'Finance / Risk validation')
      ],
      calc: v => v.raw - v.dup,
      tgt: abs(0.8e6, 'risk', KF), warn: abs(0.5e6, 'risk', KF), crit: abs(0.25e6, 'risk', KF),
      src: ['SOAR', 'FINAPP'], owner: 'Head of Fraud Risk',
      ev: 'Recovered / held payment references and Finance validation.',
      incl: 'Fraud-typed incidents only; included once in KPI 2.',
      imp: 'Protects customers and revenue; regulatory expectation for financial services.',
      recs: 'lossPrevented', drill: ['bu', 'tn', 'ctl']
    });
    K(12, 'A', 'DLP Data Transfers Prevented', {
      unit: 'count', dir: 'none', cls: 'Measured',
      def: 'Confirmed (true-positive) attempts to move sensitive data that DLP blocked across endpoint, email, web and AI gateway channels.',
      formula: 'DLP blocked transfers − False positives',
      expr: '{blk} − {fp}',
      inputs: [
        IG('blk', 'DLP blocked transfer attempts', 'count', q => q.t('dlpBlk'), 'DLP'),
        IG('fp', 'False positives (analyst-confirmed)', 'count', q => q.t('dlpFp'), 'DLP case review')
      ],
      calc: v => v.blk - v.fp,
      thr: 'Volume indicator with no target: an alert fires on a month-over-month change of more than ±30%.',
      src: ['DLP'], owner: 'Head of Data Protection (DPO office)',
      ev: 'DLP incident records with analyst disposition.',
      incl: 'True positives only; repeated blocks of the same file within 24h count once.',
      imp: 'Evidence that data-protection controls stop exfiltration attempts.',
      recs: 'tenantMonths', drill: ['bu', 'tn']
    });
    K(13, 'A', 'Cost per Security Incident', {
      unit: 'AED', dir: 'down', cls: 'Measured',
      def: 'Average full cost of handling a security incident (response effort, external support, recovery) plus actual loss.',
      formula: '(Σ response cost + Σ actual loss) ÷ Number of incidents',
      expr: '({resp} + {loss}) ÷ {n}',
      inputs: [
        IG('resp', 'Response & recovery cost', 'AED', q => S(q.incidents(), 'respCost'), 'ITSM time logs, DFIR invoices'),
        IG('loss', 'Actual financial loss', 'AED', q => S(q.incidents(), 'actualLoss'), 'Finance ERP'),
        IG('n', 'Incidents handled', 'count', q => q.incidents().length, 'SIEM / SOAR', { den: true })
      ],
      calc: v => div(v.resp + v.loss, v.n),
      tgt: 35000, warn: 50000, crit: 75000,
      src: ['SOAR', 'ITSM', 'ERP'], owner: 'Head of SOC',
      ev: 'Incident cost worksheets.',
      incl: 'All closed and open incidents in the period; costs accrue to the incident month.',
      imp: 'Efficiency of detection and response; benchmark against industry cost per incident.',
      n: q => ({ n: q.incidents().length, label: 'incidents' }),
      recs: 'incidents', drill: ['bu', 'tn', 'sev']
    });
    K(14, 'A', 'Incident Mitigation Rate', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of incidents contained before material impact (actual loss above AED 50K or service disruption beyond SLA).',
      formula: 'Incidents mitigated before material impact ÷ Total incidents × 100',
      expr: '{mit} ÷ {n} × 100',
      inputs: [
        IG('mit', 'Incidents mitigated before material impact', 'count', q => q.incidents().filter(x => x.mitigated).length, 'SOAR case closure codes'),
        IG('n', 'Total incidents', 'count', q => q.incidents().length, 'SIEM / SOAR', { den: true })
      ],
      calc: v => pct(v.mit, v.n),
      tgt: 95, warn: 90, crit: 85,
      src: ['SIEM', 'SOAR'], owner: 'Head of SOC',
      ev: 'Case timeline with containment timestamp and impact assessment.',
      incl: 'All severities. Incidents still open at period end count as not mitigated (conservative).',
      imp: 'Core indicator of cyber resilience.',
      n: q => ({ n: q.incidents().length, label: 'incidents' }),
      recs: 'incidents', drill: ['bu', 'tn', 'sev']
    });
    K(15, 'A', 'Average DFIR Containment Time', {
      unit: 'hd', dir: 'down', cls: 'Measured',
      def: 'Mean time from DFIR engagement to confirmed containment for High and Critical incidents.',
      formula: 'Σ containment hours (High + Critical) ÷ Number of High + Critical incidents contained',
      expr: '{h} ÷ {n}',
      inputs: [
        IG('h', 'Σ containment hours (High + Critical)', 'hd', q => S(q.incidents().filter(x => x.sev === 'High' || x.sev === 'Critical'), 'containH'), 'DFIR case timeline'),
        IG('n', 'High + Critical incidents', 'count', q => q.incidents().filter(x => x.sev === 'High' || x.sev === 'Critical').length, 'SOAR', { den: true })
      ],
      calc: v => div(v.h, v.n),
      tgt: 6, warn: 8, crit: 12,
      src: ['SOAR', 'EDR'], owner: 'DFIR Lead',
      ev: 'Containment timestamps validated in post-incident review.',
      incl: 'High and Critical severity only; containment = attacker access removed and spread stopped.',
      imp: 'Shorter containment directly reduces breach cost.',
      n: q => ({ n: q.incidents().filter(x => x.sev === 'High' || x.sev === 'Critical').length, label: 'High / Critical incidents' }),
      recs: 'incidentsHigh', drill: ['bu', 'tn']
    });
    K(16, 'A', 'Security Automation Payback Period', {
      unit: 'months', dir: 'down', cls: 'Derived',
      def: 'Months of average net cash benefit needed to recover the cumulative programme investment.',
      formula: 'Cumulative programme investment ÷ Average monthly net realized benefit',
      expr: '{inv} ÷ {mnb}',
      inputs: [
        IG('inv', 'Cumulative programme investment (allocated by task share)', 'AED', q => D.PROGRAMME.investment * share(q, 'tasks'), 'Finance fixed-asset register'),
        IG('mnb', 'Average monthly net realized benefit (KPI 5 ÷ months)', 'AED', q => q.kpi(5) / q.nm, 'Derived from KPI 5')
      ],
      calc: v => (v.mnb > 0 ? v.inv / v.mnb : null),
      tgt: 18, warn: 24, crit: 36,
      src: ['ERP'], owner: 'CFO',
      ev: 'Programme investment ledger.',
      incl: 'Investment includes capex, platform build and change management. If net benefit is not positive, payback is reported as not achieved.',
      imp: 'Board check on capital efficiency.',
      drill: ['bu', 'tn']
    });
    K(17, 'A', 'Financial Value by Security Control', {
      unit: 'AED', dir: 'up', cls: 'Verified',
      def: 'Realised savings and verified loss prevention attributed to each security control family (SOC, SIEM, SOAR, EDR/XDR, firewall, WAF, NDR, DLP, IAM/PAM, CTEM, VM, DFIR, backup, cloud, AppSec, GRC, AI agents) with no double counting.',
      formula: 'Σ over controls (approved savings + attributed loss prevented); must equal KPI 1 + KPI 2',
      expr: '{sav} + {lp}',
      inputs: [IK('sav', 1, 'Realized cost savings (KPI 1)'), IK('lp', 2, 'Confirmed loss prevented (KPI 2)'),
        IG('nc', 'Controls with attributed value', 'count', q => new Set(q.fin().filter(x => x.cat === 'loss_prevented' || x.status === 'Approved').map(x => x.ctl)).size, 'Attribution ledger')],
      calc: v => v.sav + v.lp,
      tgt: abs(4.7e6, 'risk', KF), warn: abs(3.6e6, 'risk', KF), crit: abs(2.5e6, 'risk', KF),
      src: ['ERP', 'FINAPP', 'SOAR'], owner: 'CISO',
      ev: 'Attribution ledger: each entry carries a control ID and weight.',
      incl: 'Validation rule: Σ control attributions = KPI 1 + KPI 2 (checked by the automated test suite).',
      imp: 'Guides renewal / consolidation decisions per security tool.',
      recs: 'byControl', drill: ['ctl', 'bu']
    });
    K(18, 'A', 'Risk Reduction per AED Invested', {
      unit: 'ratio', dir: 'up', cls: 'Estimated',
      def: 'Annualised expected-loss reduction per AED of annual security investment.',
      formula: 'Estimated cyber loss avoidance ÷ Annual security & AI security investment',
      expr: '{avoid} ÷ {inv}',
      inputs: [
        IK('avoid', 3, 'Estimated cyber loss avoidance (KPI 3)'),
        IG('inv', 'Annual security investment (allocated by baseline exposure)', 'AED', q => D.PROGRAMME.annualSecurityBudget * share(q, 'risk'), 'Finance budget')
      ],
      calc: v => div(v.avoid, v.inv),
      tgt: 2.5, warn: 1.5, crit: 1.0,
      src: ['RISK', 'ERP'], owner: 'CISO with CFO',
      ev: 'Risk register and approved security budget.',
      incl: 'Risk-based estimate; not a cash ROI.',
      imp: 'Compares the risk efficiency of security spend across BUs.',
      drill: ['bu', 'tn']
    });
    K(19, 'A', 'Total Financial Exposure from AI Incidents', {
      unit: 'AED', dir: 'down', cls: 'Estimated',
      def: 'Gross loss at stake in AI-related incidents (prompt injection, AI data leakage, RAG poisoning, shadow AI exposure, agent unauthorized action).',
      formula: 'Σ potential loss of AI-related incidents (realised loss and response cost shown separately)',
      expr: 'Σ potential loss over {n} AI-related incidents',
      inputs: [
        IG('n', 'AI-related incidents', 'count', q => q.incidents().filter(x => x.ai).length, 'SIEM / SOAR'),
        IG('pot', 'Potential loss (pre-mitigation exposure)', 'AED', q => S(q.incidents().filter(x => x.ai), 'potential'), 'Loss-exposure worksheets'),
        IG('act', 'of which realised actual loss', 'AED', q => S(q.incidents().filter(x => x.ai), 'actualLoss'), 'Finance ERP'),
        IG('resp', 'Response cost (additional)', 'AED', q => S(q.incidents().filter(x => x.ai), 'respCost'), 'ITSM / DFIR')
      ],
      calc: v => v.pot,
      tgt: abs(1.8e6, 'risk', KI), warn: abs(2.6e6, 'risk', KI), crit: abs(3.6e6, 'risk', KI),
      src: ['SIEM', 'SOAR', 'ERP'], owner: 'CISO with Head of AI Governance',
      ev: 'AI incident records linked to agent traces.',
      incl: 'Incidents flagged AI-related by SOC classification.',
      imp: 'Sizes the financial risk introduced by agentic AI.',
      n: q => ({ n: q.incidents().filter(x => x.ai).length, label: 'AI incidents' }),
      recs: 'incidentsAI', drill: ['bu', 'tn', 'sev']
    });

    // =====================================================================
    // B. AGENTIC ENTERPRISE EFFICIENCY & PRODUCTIVITY
    // =====================================================================
    const SB = ['ORCH', 'ITSM', 'REG'];
    K(20, 'B', 'Total Registered AI Agents', {
      unit: 'count', dir: 'up', cls: 'Measured',
      def: 'AI agents registered in the agent registry and not decommissioned at period end (active or paused).',
      formula: 'Count of registry agents with status ≠ decommissioned at period end',
      expr: 'Count of registered agents at period end ({paused} paused)',
      inputs: [
        IG('reg', 'Registered agents at period end', 'count', q => q.agents().length, 'AI agent registry'),
        IG('paused', 'of which paused', 'count', q => q.agents((a, m) => a.paused.indexOf(m) >= 0).length, 'AI agent registry')
      ],
      calc: v => v.reg,
      tgt: q => (anySet(q, ['bu', 'tn'].concat(KA)) ? null : roadmap(q.last)), warn: q => (anySet(q, ['bu', 'tn'].concat(KA)) ? null : Math.round(roadmap(q.last) * 0.88)), crit: q => (anySet(q, ['bu', 'tn'].concat(KA)) ? null : Math.round(roadmap(q.last) * 0.75)),
      thr: 'Target follows the approved AI roadmap (58 production agents by Oct 2026); BU views are informational.',
      src: ['REG'], freq: 'Daily', owner: 'Head of AI Governance',
      ev: 'Registry entries with owner, purpose, risk tier and approval ID.',
      incl: 'Shadow (unregistered) agents are excluded here and reported in KPI 126.',
      imp: 'Adoption against roadmap; denominator for governance coverage.',
      recs: 'agents', drill: ['bu', 'tn', 'app']
    });
    K(21, 'B', 'Active Agent Percentage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of registered agents that completed work in the last month of the period.',
      formula: 'Agents with ≥ 1 task in the last month ÷ Registered agents × 100',
      expr: '{act} ÷ {reg} × 100',
      inputs: [
        IG('act', 'Agents with ≥ 1 task in the last month', 'count', q => { const s = new Set(); q.month(q.last).actRows().forEach(r => { if (r.tasks > 0) s.add(r.ag); }); q.touch('act'); return s.size; }, 'Orchestrator traces'),
        IG('reg', 'Registered agents', 'count', q => q.agents().length, 'AI agent registry', { den: true })
      ],
      calc: v => pct(v.act, v.reg),
      tgt: 95, warn: 90, crit: 80,
      src: SB, owner: 'Head of AI Operations',
      ev: 'Trace counts per agent.',
      incl: 'Paused agents count as inactive.',
      imp: 'Idle agents carry licence, security and maintenance cost without value.',
      recs: 'agents', drill: ['bu', 'tn', 'app']
    });
    K(22, 'B', 'Tasks Completed by Agents', {
      unit: 'count', dir: 'up', cls: 'Measured',
      def: 'Tasks completed successfully by AI agents (autonomously or with human assistance).',
      formula: 'Σ successfully completed agent tasks',
      expr: 'Σ successfully completed tasks (all agents and months in scope)',
      inputs: [IA('succ', 'Successfully completed tasks', 'count', 'succ', 'Orchestrator / ITSM')],
      calc: v => v.succ,
      tgt: abs(145e3, 'tasks', KA), warn: abs(120e3, 'tasks', KA), crit: abs(95e3, 'tasks', KA),
      src: SB, owner: 'Head of AI Operations',
      ev: 'Task records with completion status.',
      incl: 'Completed = accepted outcome without hand-off to a human.',
      imp: 'Volume of work delivered by the digital workforce.',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent', 'mp']
    });
    K(23, 'B', 'Successful Task Completion Rate', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of initiated agent tasks completed successfully.',
      formula: 'Successful agent tasks ÷ Total initiated agent tasks × 100',
      expr: '{succ} ÷ {tasks} × 100',
      inputs: [IA('succ', 'Successful tasks', 'count', 'succ', 'Orchestrator'), IA('tasks', 'Initiated tasks', 'count', 'tasks', 'Orchestrator', { den: true })],
      calc: v => pct(v.succ, v.tasks),
      tgt: 95, warn: 90, crit: 85,
      src: SB, owner: 'Head of AI Operations',
      ev: 'Task outcome codes.',
      incl: 'Initiated = succeeded + failed + escalated to human.',
      imp: 'Reliability of agent outcomes.',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent', 'mp']
    });
    K(24, 'B', 'Manual Baseline Time', {
      unit: 'min', dir: 'none', cls: 'Measured',
      def: 'Average manual handling time for the same task types before agent automation (approved time-and-motion baseline).',
      formula: 'Σ manual baseline minutes for comparable tasks ÷ Comparable tasks',
      expr: '{man} ÷ {cmp}',
      inputs: [IA('man', 'Manual baseline minutes (comparable tasks)', 'mins', 'manMin', 'Time-study baseline / ITSM history'), IA('cmp', 'Comparable tasks with approved baseline', 'count', 'cmp', 'ITSM', { den: true })],
      calc: v => div(v.man, v.cmp),
      thr: 'Reference baseline: no target. Baselines are re-validated annually by Internal Audit.',
      src: ['ITSM', 'HR'], owner: 'Head of AI Operations',
      ev: 'Signed-off baseline studies per workflow.',
      incl: 'Only task types with an approved baseline; baselines are workflow-specific.',
      imp: 'Anchor for every efficiency claim.',
      recs: 'workflows', drill: ['wf', 'bu']
    });
    K(25, 'B', 'Agent Execution Time', {
      unit: 'min', dir: 'down', cls: 'Measured',
      def: 'Average machine execution time per comparable task (model and tool time only).',
      formula: 'Σ agent execution minutes ÷ Comparable tasks',
      expr: '{ex} ÷ {cmp}',
      inputs: [IA('ex', 'Agent execution minutes', 'mins', 'execMin', 'Orchestrator spans'), IA('cmp', 'Comparable tasks', 'count', 'cmp', 'ITSM', { den: true })],
      calc: v => div(v.ex, v.cmp),
      tgt: 3.0, warn: 4.0, crit: 5.0,
      src: ['ORCH'], owner: 'AI Platform Owner',
      ev: 'Root-span duration minus human-wait spans.',
      incl: 'Excludes review, waiting and rework (see KPI 26).',
      imp: 'Platform performance; not to be used alone for efficiency claims.',
      recs: 'workflows', drill: ['wf', 'bu', 'agent']
    });
    K(26, 'B', 'End-to-End Agent Time', {
      unit: 'min', dir: 'down', cls: 'Measured',
      def: 'Average elapsed time per comparable task including human review, approvals, waiting, retries and rework.',
      formula: '(Execution + Human review + Waiting + Retries + Rework minutes) ÷ Comparable tasks',
      expr: '({ex} + {rv} + {wt} + {rt} + {rw}) ÷ {cmp}',
      inputs: [
        IA('ex', 'Execution minutes', 'mins', 'execMin', 'Orchestrator'), IA('rv', 'Human review minutes', 'mins', 'reviewMin', 'Review queue timestamps'),
        IA('wt', 'Waiting / approval queue minutes', 'mins', 'waitMin', 'Workflow engine'), IA('rt', 'Retry minutes', 'mins', 'retryMin', 'Orchestrator'),
        IA('rw', 'Rework minutes', 'mins', 'reworkMin', 'ITSM reopen records'), IA('cmp', 'Comparable tasks', 'count', 'cmp', 'ITSM', { den: true })
      ],
      calc: v => div(v.ex + v.rv + v.wt + v.rt + v.rw, v.cmp),
      tgt: 10, warn: 13, crit: 16,
      src: ['ORCH', 'ITSM'], owner: 'Head of AI Operations',
      ev: 'Trace spans joined to review and ITSM timestamps.',
      incl: 'Human review, waiting and rework are always included, as the measurement rules require.',
      imp: 'The honest denominator for efficiency and speed.',
      recs: 'workflows', drill: ['wf', 'bu', 'agent']
    });
    K(27, 'B', 'Agentic Efficiency Gain', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Reduction in end-to-end handling time achieved by agents versus the manual baseline for comparable tasks.',
      formula: '(Manual baseline duration − Agent end-to-end duration) ÷ Manual baseline duration × 100',
      expr: '({man} − {e2e}) ÷ {man} × 100',
      inputs: [IA('man', 'Manual baseline duration (comparable tasks)', 'mins', 'manMin', 'Time-study baseline'), IA('e2e', 'Agent end-to-end duration (incl. review, waiting, retries, rework)', 'mins', 'e2eMin', 'Orchestrator + ITSM')],
      calc: v => pct(v.man - v.e2e, v.man),
      tgt: 60, warn: 45, crit: 30,
      src: ['ORCH', 'ITSM', 'HR'], owner: 'Head of AI Operations',
      ev: 'Matched cohorts of agent tasks and baseline tasks per workflow.',
      incl: 'Comparable successful tasks with an approved baseline only.',
      imp: 'Headline productivity effect of agentic automation.',
      n: q => ({ n: q.a('cmp'), label: 'comparable tasks' }),
      money: q => ({ label: 'Productivity value (KPI 6)', value: q.kpi(6) }),
      recs: 'workflows', drill: ['bu', 'tn', 'wf', 'agent']
    });
    K(28, 'B', 'Manual-to-Agent Speed Improvement', {
      unit: 'x', dir: 'up', cls: 'Measured',
      def: 'How many times faster agents complete comparable work end to end than the manual baseline.',
      formula: 'Manual baseline duration ÷ Agent end-to-end duration',
      expr: '{man} ÷ {e2e}',
      inputs: [IA('man', 'Manual baseline duration', 'mins', 'manMin', 'Time-study baseline'), IA('e2e', 'Agent end-to-end duration', 'mins', 'e2eMin', 'Orchestrator + ITSM')],
      calc: v => div(v.man, v.e2e),
      tgt: 2.5, warn: 2.0, crit: 1.5,
      src: ['ORCH', 'ITSM'], owner: 'Head of AI Operations',
      ev: 'Same cohort as KPI 27.',
      incl: 'Comparable successful tasks with approved baseline.',
      imp: 'Executive-friendly expression of efficiency.',
      n: q => ({ n: q.a('cmp'), label: 'comparable tasks' }),
      recs: 'workflows', drill: ['bu', 'tn', 'wf', 'agent']
    });
    K(29, 'B', 'Human Hours Saved', {
      unit: 'h', dir: 'up', cls: 'Measured',
      def: 'Human working hours released by agents: comparable manual minutes minus agent-assisted end-to-end minutes.',
      formula: '(Σ comparable manual task minutes − Σ agent-assisted end-to-end task minutes) ÷ 60',
      expr: '({man} − {e2e}) ÷ 60',
      inputs: [IA('man', 'Comparable manual task minutes', 'mins', 'manMin', 'Time-study baseline'), IA('e2e', 'Agent-assisted end-to-end minutes', 'mins', 'e2eMin', 'Orchestrator + ITSM')],
      calc: v => (v.man - v.e2e) / 60,
      tgt: abs(35e3, 'tasks', KA), warn: abs(26e3, 'tasks', KA), crit: abs(18e3, 'tasks', KA),
      src: ['ORCH', 'ITSM', 'HR'], owner: 'Head of AI Operations',
      ev: 'Trace-linked task cohorts.',
      incl: 'Comparable tasks only; human review and rework time is deducted.',
      imp: 'Capacity released to analysts and operations teams.',
      n: q => ({ n: q.a('cmp'), label: 'comparable tasks' }),
      money: q => ({ label: 'Monetised capacity (KPI 6)', value: q.kpi(6) }),
      recs: 'workflows', drill: ['bu', 'tn', 'app', 'agent', 'mp']
    });
    K(30, 'B', 'Analyst Productivity Increase', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Increase in cases closed per analyst FTE-month versus the pre-agent baseline.',
      formula: '(Cases closed ÷ Analyst FTE-months − Baseline cases per FTE-month) ÷ Baseline × 100',
      expr: '({cases} ÷ {fte} − {base}) ÷ {base} × 100',
      inputs: [
        IG('cases', 'Cases closed (agent-assisted and manual)', 'count', q => q.t('cases'), 'ITSM / SOAR'),
        IG('fte', 'Analyst FTE-months', 'num', q => q.t('fte'), 'HR / timesheets', { den: true }),
        IG('base', 'Baseline cases per FTE-month (' + D.PROGRAMME.fteBaselinePeriod + ')', 'num', q => D.PROGRAMME.baselineCasesPerFte, 'Baseline study')
      ],
      calc: v => (v.fte ? (v.cases / v.fte - v.base) / v.base * 100 : null),
      tgt: 35, warn: 20, crit: 10,
      src: ['ITSM', 'SOAR', 'HR'], owner: 'Head of SOC',
      ev: 'Case closure counts and FTE allocations.',
      incl: 'Analyst roles in SOC, IT operations and case-handling teams.',
      imp: 'Shows analysts are more productive, not only that agents are busy.',
      recs: 'tenantMonths', drill: ['bu', 'tn']
    });
    K(31, 'B', 'Autonomous Completion Rate', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of autonomy-eligible tasks completed end to end without human involvement (the Agent Autonomy Rate).',
      formula: 'Eligible tasks completed autonomously ÷ Total eligible tasks × 100',
      expr: '{auto} ÷ {elig} × 100',
      inputs: [IA('auto', 'Eligible tasks completed autonomously', 'count', 'auto', 'Orchestrator'), IA('elig', 'Autonomy-eligible tasks (per policy)', 'count', 'elig', 'Agent policy engine', { den: true })],
      calc: v => pct(v.auto, v.elig),
      tgt: 75, warn: 65, crit: 50,
      src: SB, owner: 'Head of AI Operations',
      ev: 'Policy decision log per task (eligibility) and trace outcome.',
      incl: 'Denominator = tasks eligible for autonomy under policy; high-risk actions requiring approval are never eligible.',
      imp: 'Measures enterprise autonomy achieved within guardrails.',
      n: q => ({ n: q.a('elig'), label: 'eligible tasks' }),
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent', 'mp']
    });
    K(32, 'B', 'AI-Assisted Completion Rate', {
      unit: '%', dir: 'none', cls: 'Measured',
      def: 'Share of completed tasks where a human reviewed or approved the agent\'s output before completion.',
      formula: '(Completed tasks − Autonomous completions) ÷ Completed tasks × 100',
      expr: '({succ} − {auto}) ÷ {succ} × 100',
      inputs: [IA('succ', 'Completed tasks', 'count', 'succ', 'Orchestrator', { den: true }), IA('auto', 'Autonomous completions', 'count', 'auto', 'Orchestrator')],
      calc: v => pct(v.succ - v.auto, v.succ),
      thr: 'Mix indicator: no target. Read together with KPI 31.',
      src: SB, owner: 'Head of AI Operations',
      ev: 'Human review events per task.',
      incl: 'Completed tasks only.',
      imp: 'Human-in-the-loop share; supports regulated-workflow oversight.',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent']
    });
    K(33, 'B', 'Human Intervention Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of initiated tasks needing unplanned human intervention (correction, override, unblock).',
      formula: 'Tasks with unplanned human intervention ÷ Initiated tasks × 100',
      expr: '{iv} ÷ {tasks} × 100',
      inputs: [IA('iv', 'Tasks with unplanned intervention', 'count', 'interv', 'Orchestrator / review queue'), IA('tasks', 'Initiated tasks', 'count', 'tasks', 'Orchestrator', { den: true })],
      calc: v => pct(v.iv, v.tasks),
      tgt: 8, warn: 12, crit: 18,
      src: SB, owner: 'Head of AI Operations',
      ev: 'Override and correction events.',
      incl: 'Planned approvals (KPI 34) are not interventions.',
      imp: 'Hidden human effort that erodes efficiency.',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent']
    });
    K(34, 'B', 'Human Approval Compliance', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of high-risk agent actions requiring human approval that were executed only after approval.',
      formula: 'High-risk actions executed with required approval ÷ High-risk actions requiring approval × 100',
      expr: '{ok} ÷ {req} × 100',
      inputs: [IA('ok', 'Executed with valid approval', 'count', 'apprOk', 'Approval service'), IA('req', 'Actions requiring approval', 'count', 'apprReq', 'Policy engine', { den: true })],
      calc: v => pct(v.ok, v.req),
      tgt: 99.5, warn: 98, crit: 95,
      src: ['ORCH', 'IAM'], owner: 'Head of AI Governance',
      ev: 'Approval IDs linked to tool-call spans.',
      incl: 'Actions classified high-risk by policy (payments, access grants, containment, record changes).',
      imp: 'Key control for regulated decisions (CBUAE, ADHICS, UAE IA).',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent']
    });
    K(35, 'B', 'Agent-to-Human Escalation Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of initiated tasks handed over to a human to complete.',
      formula: 'Escalated tasks ÷ Initiated tasks × 100',
      expr: '{es} ÷ {tasks} × 100',
      inputs: [IA('es', 'Escalated tasks', 'count', 'escal', 'Orchestrator'), IA('tasks', 'Initiated tasks', 'count', 'tasks', 'Orchestrator', { den: true })],
      calc: v => pct(v.es, v.tasks),
      tgt: 3, warn: 5, crit: 8,
      src: SB, owner: 'Head of AI Operations',
      ev: 'Hand-off events.',
      incl: 'Escalated tasks are not counted as agent successes.',
      imp: 'Capacity planning for human teams.',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent']
    });
    K(36, 'B', 'First-Time-Right Rate', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of completed tasks finished without retry or rework.',
      formula: 'Tasks completed without retry or rework ÷ Completed tasks × 100',
      expr: '{ftr} ÷ {succ} × 100',
      inputs: [IA('ftr', 'Completed without retry / rework', 'count', 'ftr', 'Orchestrator + ITSM'), IA('succ', 'Completed tasks', 'count', 'succ', 'Orchestrator', { den: true })],
      calc: v => pct(v.ftr, v.succ),
      tgt: 90, warn: 85, crit: 80,
      src: SB, owner: 'Head of AI Operations',
      ev: 'Retry spans and reopen events.',
      incl: 'Reopened within 7 days counts as rework.',
      imp: 'Quality of agent output.',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent']
    });
    K(37, 'B', 'Agent Rework Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of completed tasks that required human or agent rework.',
      formula: 'Tasks requiring rework ÷ Completed tasks × 100',
      expr: '{rw} ÷ {succ} × 100',
      inputs: [IA('rw', 'Tasks requiring rework', 'count', 'rework', 'ITSM reopen records'), IA('succ', 'Completed tasks', 'count', 'succ', 'Orchestrator', { den: true })],
      calc: v => pct(v.rw, v.succ),
      tgt: 5, warn: 8, crit: 12,
      src: ['ITSM', 'ORCH'], owner: 'Head of AI Operations',
      ev: 'Reopen and correction records.',
      incl: 'Rework minutes are included in KPI 26.',
      imp: 'Drives hidden cost and erodes trust.',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent']
    });
    K(38, 'B', 'Agent Failure Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of initiated tasks that ended in failure.',
      formula: 'Failed tasks ÷ Initiated tasks × 100',
      expr: '{fail} ÷ {tasks} × 100',
      inputs: [IA('fail', 'Failed tasks', 'count', 'fail', 'Orchestrator'), IA('tasks', 'Initiated tasks', 'count', 'tasks', 'Orchestrator', { den: true })],
      calc: v => pct(v.fail, v.tasks),
      tgt: 3, warn: 5, crit: 8,
      src: SB, owner: 'AI Platform Owner',
      ev: 'Failure codes per task.',
      incl: 'Failures caused by model outages are included and linked to KPI 72.',
      imp: 'Reliability of the digital workforce.',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent', 'mp']
    });
    K(39, 'B', 'Agent Recovery Rate', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of in-flight execution errors that the agent recovered from automatically (retry, fallback, re-plan).',
      formula: 'Recovered error events ÷ Execution error events × 100',
      expr: '{rec} ÷ {err} × 100',
      inputs: [IA('rec', 'Recovered error events', 'count', 'recov', 'Orchestrator'), IA('err', 'Execution error events', 'count', 'errEv', 'Orchestrator', { den: true })],
      calc: v => pct(v.rec, v.err),
      tgt: 92, warn: 88, crit: 80,
      src: ['ORCH'], owner: 'AI Platform Owner',
      ev: 'Error and recovery spans.',
      incl: 'Transient errors during execution; final task failures are KPI 38.',
      imp: 'Resilience of agent design.',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent']
    });
    K(40, 'B', 'Agent Throughput', {
      unit: 'perday', dir: 'up', cls: 'Measured',
      def: 'Average completed agent tasks per calendar day.',
      formula: 'Completed tasks ÷ Calendar days in period',
      expr: '{succ} ÷ {days}',
      inputs: [IA('succ', 'Completed tasks', 'count', 'succ', 'Orchestrator'), IG('days', 'Calendar days', 'num', q => q.days, 'Calendar', { den: true })],
      calc: v => div(v.succ, v.days),
      tgt: q => (anySet(q, KA) ? null : 4500 * share(q, 'tasks')), warn: q => (anySet(q, KA) ? null : 3800 * share(q, 'tasks')), crit: q => (anySet(q, KA) ? null : 3000 * share(q, 'tasks')),
      src: ['ORCH'], owner: 'Head of AI Operations',
      ev: 'Daily completion counts.',
      incl: 'All environments unless filtered.',
      imp: 'Capacity of the digital workforce.',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent']
    });
    K(41, 'B', 'AI SLA Achievement', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of SLA-bound agent tasks completed within the business SLA.',
      formula: 'Tasks completed within SLA ÷ SLA-bound tasks × 100',
      expr: '{met} ÷ {el} × 100',
      inputs: [IA('met', 'Completed within SLA', 'count', 'slaMet', 'ITSM SLA clock'), IA('el', 'SLA-bound tasks', 'count', 'slaElig', 'ITSM', { den: true })],
      calc: v => pct(v.met, v.el),
      tgt: 97, warn: 94, crit: 90,
      src: ['ITSM', 'ORCH'], owner: 'Head of AI Operations',
      ev: 'SLA clock events including waiting time.',
      incl: 'SLA clock includes human review and waiting time.',
      imp: 'Customer and citizen service commitments.',
      recs: 'agents', drill: ['bu', 'tn', 'app', 'agent']
    });
    K(42, 'B', 'Agent Automation Coverage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of in-scope, automatable workflows with production agent automation at period end.',
      formula: 'Automated in-scope workflows ÷ In-scope automatable workflows × 100',
      expr: '{done} ÷ {scope} × 100',
      inputs: [IG('done', 'Workflows with production automation', 'count', q => q.tl('autoDone'), 'Process inventory / registry'), IG('scope', 'In-scope automatable workflows', 'count', q => q.tl('autoInScope'), 'Process inventory', { den: true })],
      calc: v => pct(v.done, v.scope),
      tgt: 60, warn: 45, crit: 30,
      src: ['REG', 'ITSM'], freq: 'Monthly', owner: 'Head of AI Operations',
      ev: 'Process inventory with automation status.',
      incl: 'In-scope = approved for automation by process owners.',
      imp: 'Headroom for further value capture.',
      recs: 'tenantMonths', drill: ['bu', 'tn']
    });

    // =====================================================================
    // C. TOKEN ECONOMICS, INFERENCE COST & QUOTA
    // =====================================================================
    const ST = ['GW', 'BILL'];
    K(43, 'C', 'Total Tokens Used', {
      unit: 'tokens', dir: 'down', cls: 'Measured',
      def: 'All tokens processed by models for agents: input tokens (including cached) plus output tokens (including reasoning).',
      formula: 'Input tokens + Output tokens (cached ⊂ input, reasoning ⊂ output, never added again)',
      expr: '{in} + {out}',
      inputs: [
        IA('in', 'Input tokens (incl. cached)', 'tokens', 'tokIn', 'AI gateway'), IA('out', 'Output tokens (incl. reasoning)', 'tokens', 'tokOut', 'AI gateway'),
        IA('cached', 'Cached input tokens (subset of input, not added)', 'tokens', 'tokCached', 'Provider usage API'), IA('reason', 'Reasoning tokens (subset of output, not added)', 'tokens', 'tokReason', 'Provider usage API')
      ],
      calc: v => v.in + v.out,
      tgt: q => (anySet(q, KA) ? null : q.t('budTok')), warn: q => (anySet(q, KA) ? null : q.t('budTok') * 1.05), crit: q => (anySet(q, KA) ? null : q.t('budTok') * 1.15),
      thr: 'Target = approved token budget for the scope and period.',
      src: ST, owner: 'AI FinOps Lead',
      ev: 'Gateway usage records reconciled to provider billing exports.',
      incl: 'Normalisation: providers that report reasoning separately have it added into output at ingestion; cached tokens stay inside input. A naive sum (input + output + cached + reasoning) would double count.',
      imp: 'Primary driver of inference cost and quota exposure.',
      money: q => ({ label: 'Inference spend (KPI 61)', value: q.kpi(61) }),
      recs: 'models', drill: ['mp', 'bu', 'tn', 'agent']
    });
    K(44, 'C', 'Input Tokens', {
      unit: 'tokens', dir: 'none', cls: 'Measured',
      def: 'Prompt / context tokens sent to models, including cached tokens.',
      formula: 'Σ input tokens (uncached + cached)',
      expr: '{unc} + {cached}',
      inputs: [IG('unc', 'Uncached input tokens', 'tokens', q => q.a('tokIn') - q.a('tokCached'), 'AI gateway'), IA('cached', 'Cached input tokens', 'tokens', 'tokCached', 'Provider usage API')],
      calc: v => v.unc + v.cached,
      thr: 'Informational component of KPI 43; governed through the budget thresholds of KPI 54.',
      src: ST, owner: 'AI FinOps Lead', ev: 'Gateway usage records.', incl: 'Embedding requests count as input only.', imp: 'Context size drives cost and latency.',
      recs: 'models', drill: ['mp', 'bu', 'agent']
    });
    K(45, 'C', 'Output Tokens', {
      unit: 'tokens', dir: 'none', cls: 'Measured',
      def: 'Tokens generated by models, including reasoning tokens billed as output.',
      formula: 'Σ output tokens (visible + reasoning)',
      expr: '{vis} + {reason}',
      inputs: [IG('vis', 'Visible output tokens', 'tokens', q => q.a('tokOut') - q.a('tokReason'), 'AI gateway'), IA('reason', 'Reasoning tokens', 'tokens', 'tokReason', 'Provider usage API')],
      calc: v => v.vis + v.reason,
      thr: 'Informational component of KPI 43.',
      src: ST, owner: 'AI FinOps Lead', ev: 'Gateway usage records.', incl: 'Reasoning tokens are a subset of output tokens.', imp: 'Output is priced 4-5× input on frontier models.',
      recs: 'models', drill: ['mp', 'bu', 'agent']
    });
    K(46, 'C', 'Reasoning Tokens', {
      unit: 'tokens', dir: 'none', cls: 'Measured',
      def: 'Internal reasoning tokens generated by reasoning models (billed as output, not visible in responses).',
      formula: 'Σ reasoning tokens (subset of output tokens)',
      expr: 'Σ reasoning tokens ({share} of output tokens)',
      inputs: [IA('reason', 'Reasoning tokens', 'tokens', 'tokReason', 'Provider usage API'), IG('share', 'Share of output tokens', '%', q => pct(q.a('tokReason'), q.a('tokOut')), 'Derived')],
      calc: v => v.reason,
      thr: 'Informational: reasoning share is reviewed per workflow in model-selection decisions.',
      src: ST, owner: 'AI FinOps Lead', ev: 'Provider usage details.', incl: 'Counted inside output; never added to totals again.', imp: 'Hidden cost driver of reasoning models.',
      recs: 'models', drill: ['mp', 'agent']
    });
    K(47, 'C', 'Cached Input Tokens', {
      unit: 'tokens', dir: 'up', cls: 'Measured',
      def: 'Input tokens served from the provider or on-prem prompt cache (discounted or free).',
      formula: 'Σ cached input tokens; rated on cache-hit ratio = cached ÷ input × 100',
      expr: 'Σ cached input tokens (cache-hit ratio {cached} ÷ {in} = {ratio})',
      inputs: [IA('cached', 'Cached input tokens', 'tokens', 'tokCached', 'Provider usage API'), IA('in', 'Input tokens', 'tokens', 'tokIn', 'AI gateway'), IG('ratio', 'Cache-hit ratio', '%', q => pct(q.a('tokCached'), q.a('tokIn')), 'Derived')],
      calc: v => v.cached,
      statusOf: v => v.ratio, tgt: 40, warn: 30, crit: 20,
      thr: 'Rated on the cache-hit ratio (target ≥ 40%).',
      src: ST, owner: 'AI Platform Owner', ev: 'Provider usage details.', incl: 'Subset of input tokens.', imp: 'Caching cuts cost and latency.',
      money: q => ({ label: 'Cache cost saving (KPI 70)', value: q.kpi(70) }),
      recs: 'models', drill: ['mp', 'agent']
    });
    K(48, 'C', 'Token Usage per Agent', {
      unit: 'tokens', dir: 'none', cls: 'Measured',
      def: 'Average tokens consumed per agent that used models in the period.',
      formula: 'Total tokens ÷ Agents with model usage',
      expr: '{tok} ÷ {ag}',
      inputs: [IK('tok', 43, 'Total tokens (KPI 43)'), IG('ag', 'Agents with model usage', 'count', q => usageAgents(q), 'AI gateway', { den: true })],
      calc: v => div(v.tok, v.ag),
      thr: 'Informational: outliers are reviewed through KPI 95.',
      src: ST, owner: 'AI FinOps Lead', ev: 'Per-agent usage.', incl: 'Agents with zero usage are excluded.', imp: 'Highlights token-heavy agents for optimisation.',
      recs: 'agents', drill: ['agent', 'bu']
    });
    K(49, 'C', 'Average Tokens per Task', {
      unit: 'tokens', dir: 'down', cls: 'Measured',
      def: 'Mean tokens consumed per initiated agent task.',
      formula: 'Total tokens ÷ Initiated tasks',
      expr: '{tok} ÷ {tasks}',
      inputs: [IK('tok', 43, 'Total tokens (KPI 43)'), IA('tasks', 'Initiated tasks', 'count', 'tasks', 'Orchestrator', { den: true })],
      calc: v => div(v.tok, v.tasks),
      tgt: 175e3, warn: 195e3, crit: 220e3,
      src: ['GW', 'ORCH'], owner: 'AI Platform Owner', ev: 'Task-linked usage.', incl: 'Failed tasks included (their tokens are also counted as waste).', imp: 'Unit economics of agent work.',
      recs: 'workflows', drill: ['wf', 'agent', 'mp']
    });
    K(50, 'C', 'P95 Tokens per Task', {
      unit: 'tokens', dir: 'down', cls: 'Measured',
      def: '95th percentile of tokens consumed per task (tail cost risk).',
      formula: 'Nearest-rank 95th percentile of per-task token counts',
      expr: 'value at nearest rank {rank} of {n} sorted observations',
      inputs: [
        IG('n', 'Task observations (sample)', 'count', q => pctl(q, 'tok').n, 'Orchestrator task records', { den: true }),
        IG('rank', 'Nearest rank = ⌈0.95 × n⌉', 'count', q => pctl(q, 'tok').rank, 'Derived'),
        IG('p', 'Value at that rank', 'tokens', q => pctl(q, 'tok').value, 'Derived')
      ],
      calc: v => v.p,
      tgt: 600e3, warn: 750e3, crit: 900e3,
      src: ['ORCH', 'GW'], owner: 'AI Platform Owner', ev: 'Per-task usage distribution.', incl: 'Sample is stratified by agent and month in proportion to task volume.', imp: 'Tail tasks drive budget overruns and quota spikes.',
      recs: 'workflows', drill: ['agent', 'wf']
    });
    K(51, 'C', 'Token Waste', {
      unit: 'tokens', dir: 'down', cls: 'Measured',
      def: 'Tokens spent on avoidable work: failed tasks, retries, redundant calls and runaway loops.',
      formula: 'Σ tokens attributable to failed, retried or redundant work',
      expr: 'Σ tokens on failed, retried or redundant work',
      inputs: [IA('w', 'Tokens on failed / retried / redundant work', 'tokens', 'tokWaste', 'Gateway + orchestrator attribution'), IK('tot', 43, 'Total tokens (KPI 43)')],
      calc: v => v.w,
      tgt: q => tokens(q) * 0.05, warn: q => tokens(q) * 0.08, crit: q => tokens(q) * 0.12,
      thr: 'Thresholds expressed as 5% / 8% / 12% of total tokens in scope.',
      src: ['GW', 'ORCH'], owner: 'AI FinOps Lead', ev: 'Trace attribution of token spans to task outcomes.', incl: 'Successful first-time work is never waste.', imp: 'Direct cost leakage.',
      money: q => ({ label: 'Estimated waste cost (waste share × inference spend)', value: q.kpi(61) * (q.a('tokWaste') / Math.max(1, tokens(q))) }),
      recs: 'agents', drill: ['agent', 'mp', 'bu']
    });
    K(52, 'C', 'Token Waste Percentage', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of consumed tokens that were wasted on avoidable work.',
      formula: 'Tokens attributable to avoidable failed / retried / redundant work ÷ Total consumed tokens × 100',
      expr: '{w} ÷ {tot} × 100',
      inputs: [IA('w', 'Wasted tokens', 'tokens', 'tokWaste', 'Gateway attribution'), IK('tot', 43, 'Total tokens (KPI 43)')],
      calc: v => pct(v.w, v.tot),
      tgt: 5, warn: 8, crit: 12,
      src: ['GW', 'ORCH'], owner: 'AI FinOps Lead', ev: 'As KPI 51.', incl: 'As KPI 51.', imp: 'Efficiency of token use.',
      money: q => ({ label: 'Estimated waste cost', value: q.kpi(61) * (q.a('tokWaste') / Math.max(1, tokens(q))) }),
      recs: 'agents', drill: ['agent', 'mp', 'bu']
    });
    K(53, 'C', 'Token Growth Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Growth in tokens versus the comparison period (prior-year YTD for YTD, otherwise the preceding period of equal length).',
      formula: '(Tokens this period − Tokens comparison period) ÷ Tokens comparison period × 100',
      expr: '({cur} − {prev}) ÷ {prev} × 100',
      inputs: [IK('cur', 43, 'Tokens this period (KPI 43)'), IG('prev', 'Tokens in comparison period', 'tokens', q => { q.touch('act'); const p = q.prev(); return p ? p.a('tokIn') + p.a('tokOut') : null; }, 'AI gateway'), IG('tg', 'Task growth over the same window (reference)', '%', q => taskGrowth(q), 'Orchestrator')],
      calc: v => (v.prev ? (v.cur - v.prev) / v.prev * 100 : null),
      tgt: q => { const g = taskGrowth(q); return g == null ? null : g + 5; }, warn: q => { const g = taskGrowth(q); return g == null ? null : g + 15; }, crit: q => { const g = taskGrowth(q); return g == null ? null : g + 30; },
      thr: 'Thresholds are relative to task growth: tokens may grow up to 5 pp faster than tasks (target), 15 pp (warning), 30 pp (critical).',
      src: ['GW'], owner: 'AI FinOps Lead', ev: 'Monthly usage series.', incl: 'Same scope and filters for both periods.', imp: 'Early warning of uneconomic growth.',
      recs: 'models', drill: ['mp', 'bu', 'agent']
    });
    K(54, 'C', 'Token Budget Utilization', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Tokens consumed against the approved token budget for the scope.',
      formula: 'Tokens accounted against budget ÷ Approved token budget × 100',
      expr: '{tok} ÷ {bud} × 100',
      inputs: [IG('tok', 'Tokens accounted against budget', 'tokens', q => q.t('tokens'), 'AI gateway'), IG('bud', 'Approved token budget', 'tokens', q => q.t('budTok'), 'AI FinOps budget', { den: true })],
      calc: v => pct(v.tok, v.bud),
      tgt: 95, warn: 100, crit: 110,
      src: ['GW', 'ERP'], owner: 'AI FinOps Lead', ev: 'Budget allocations per BU / tenant.', incl: 'All models and environments of the tenant.', imp: 'Prevents uncontrolled consumption.',
      recs: 'tenantMonths', drill: ['bu', 'tn']
    });
    K(55, 'C', 'Token Budget Exceeded Count', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Number of tenant-month budget scopes where consumption exceeded the approved token budget.',
      formula: 'Count of tenant-months where tokens > token budget',
      expr: 'Count of tenant-months with tokens > budget ({over} of {scopes})',
      inputs: [IG('over', 'Tenant-months over budget', 'count', q => q.tenRows().filter(r => r.budTok > 0 && r.tokens > r.budTok).length, 'AI gateway vs budget'), IG('scopes', 'Tenant-months with a budget', 'count', q => q.tenRows().filter(r => r.budTok > 0).length, 'AI FinOps budget', { den: true })],
      calc: v => v.over,
      tgt: 0, warn: q => Math.max(1, Math.ceil(0.05 * q.tenRows().filter(r => r.budTok > 0).length)), crit: q => Math.max(2, Math.ceil(0.15 * q.tenRows().filter(r => r.budTok > 0).length)),
      thr: 'Warning at 5% of budget scopes, critical at 15%.',
      src: ['GW', 'ERP'], owner: 'AI FinOps Lead', ev: 'Monthly budget vs actual per tenant.', incl: 'Tenant-month grain.', imp: 'Budget discipline.',
      recs: 'tenantMonths', drill: ['bu', 'tn']
    });
    const rateKpi = (id, name, field, def, tgt, warn, crit, ev) => K(id, 'C', name, {
      unit: '%', dir: 'down', cls: 'Measured', def: def,
      formula: name.replace(' Rate', '') + ' events ÷ Total model requests × 100',
      expr: '{e} ÷ {req} × 100',
      inputs: [IA('e', 'Affected requests', 'count', field, 'AI gateway'), IA('req', 'Total model requests', 'count', 'req', 'AI gateway', { den: true })],
      calc: v => pct(v.e, v.req), tgt: tgt, warn: warn, crit: crit,
      src: ['GW', 'APM'], owner: 'AI Platform Owner', ev: ev, incl: 'All model requests in scope, including retries.', imp: 'Degrades task success and wastes tokens.',
      recs: 'models', drill: ['mp', 'agent', 'wf']
    });
    rateKpi(56, 'Context Window Exceeded Rate', 'ctxExc', 'Share of requests rejected or truncated because the prompt exceeded the model context window.', 0.25, 0.5, 1.0, 'Gateway error code context_length_exceeded.');
    rateKpi(57, 'Output Token Limit Hit Rate', 'outLim', 'Share of responses truncated at the maximum output-token limit.', 0.1, 0.2, 0.5, 'finish_reason = length.');
    rateKpi(58, 'Token Rate-Limit Hit Rate', 'eRl', 'Share of requests throttled by provider or gateway rate limits (HTTP 429: TPM, RPM or quota).', 0.2, 0.5, 1.0, 'HTTP 429 responses by limit type.');
    const utilKpi = (id, name, kind, label) => K(id, 'C', name, {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Peak observed ' + label + ' against the provisioned limit on the busiest deployment in the period.',
      formula: 'Peak observed ' + label + ' ÷ Provisioned ' + label + ' limit × 100 (busiest deployment-month)',
      expr: '{peak} ÷ {lim} × 100',
      inputs: [
        IG('peak', 'Peak observed ' + label, 'num', q => { const b = quotaMax(q, kind); return b ? (kind === 'rpm' ? b.r.peakRpm : b.r.peakTpm) : null; }, 'Provider quota API', { noteFn: q => { const b = quotaMax(q, kind); return b ? MLBL(b.r.mo) + ', ' + D.MONTHS[b.r.m].label : ''; } }),
        IG('lim', 'Provisioned ' + label + ' limit', 'num', q => { const b = quotaMax(q, kind); return b ? (kind === 'rpm' ? b.r.rpmLimit : b.r.tpmLimit) : null; }, 'Provider quota configuration', { den: true })
      ],
      calc: v => pct(v.peak, v.lim),
      tgt: 75, warn: 90, crit: 100,
      src: ['QUOTA'], owner: 'AI Platform Owner', ev: 'Per-minute utilisation series from provider quota APIs.', incl: 'External provider deployments (on-prem limits are enforced at the gateway).', imp: 'Above 90% the platform starts throttling agents.',
      recs: 'quota', drill: ['mp']
    });
    utilKpi(59, 'Requests per Minute Utilization', 'rpm', 'RPM');
    utilKpi(60, 'Tokens per Minute Utilization', 'tpm', 'TPM');
    K(61, 'C', 'Total AI Inference Spend', {
      unit: 'AED', dir: 'none', cls: 'Measured',
      def: 'Provider-billed inference cost using provider-specific prices for uncached input, cached input and output tokens.',
      formula: 'Σ models (uncached input × input price + cached input × cache price + output × output price) ÷ 10⁶',
      expr: '{cin} + {cca} + {cout}',
      inputs: [
        IG('cin', 'Uncached input cost', 'AED', q => costParts(q).cin, 'Provider price list × gateway usage'),
        IG('cca', 'Cached input cost', 'AED', q => costParts(q).cca, 'Provider price list × gateway usage'),
        IG('cout', 'Output cost (incl. reasoning)', 'AED', q => costParts(q).cout, 'Provider price list × gateway usage')
      ],
      calc: v => v.cin + v.cca + v.cout,
      thr: 'Governed through the AI budget thresholds of KPIs 63 and 67; reconciled monthly to invoices.',
      src: ['BILL', 'GW'], owner: 'AI FinOps Lead', ev: 'Usage × contracted price, reconciled to provider invoices.', incl: 'On-prem models carry no per-token price (their cost sits in KPI 62).', imp: 'Variable AI cost line.',
      recs: 'models', drill: ['mp', 'bu', 'tn', 'agent']
    });
    K(62, 'C', 'Total AI Infrastructure Spend', {
      unit: 'AED', dir: 'none', cls: 'Measured',
      def: 'GPU compute, Kubernetes, model-serving, vector database, gateway, storage, network and observability cost, allocated to tenants by token share.',
      formula: 'Σ AI infrastructure cost allocated by token share',
      expr: 'Σ platform infrastructure cost × tenant token share (scope share {sh})',
      inputs: [IG('inf', 'Allocated AI infrastructure cost', 'AED', q => q.t('infra'), 'Finance ERP / cloud billing'), IG('sh', 'Token share of the selected scope', '%', q => share(q, 'tokens') * 100, 'AI gateway')],
      calc: v => v.inf,
      thr: 'Governed through KPIs 63 and 67.',
      src: ['ERP', 'BILL', 'DCGM'], owner: 'Head of Infrastructure', ev: 'Asset depreciation, power, colocation and cloud invoices.', incl: 'Showback allocation by token share; total equals the platform cost.', imp: 'Fixed AI cost line.',
      recs: 'tenantMonths', drill: ['bu', 'tn']
    });
    K(63, 'C', 'Total AI Operating Spend', {
      unit: 'AED', dir: 'down', cls: 'Measured',
      def: 'Total cost of running AI: inference, infrastructure and AI platform licences / observability.',
      formula: 'Inference spend + Infrastructure spend + AI platform licences',
      expr: '{inf} + {infra} + {lic}',
      inputs: [IK('inf', 61, 'Inference spend (KPI 61)'), IK('infra', 62, 'Infrastructure spend (KPI 62)'), IG('lic', 'AI platform licences & observability (allocated)', 'AED', q => q.t('lic'), 'Finance ERP')],
      calc: v => v.inf + v.infra + v.lic,
      tgt: q => (anySet(q, KA) ? null : q.t('budAI')), warn: q => (anySet(q, KA) ? null : q.t('budAI') * 1.03), crit: q => (anySet(q, KA) ? null : q.t('budAI') * 1.10),
      thr: 'Target = approved AI operating budget for the scope and period.',
      src: ['BILL', 'ERP'], owner: 'AI FinOps Lead', ev: 'Reconciled to management accounts.', incl: 'Excludes security automation platforms and labour (in KPI 7).', imp: 'Total cost of AI operations.',
      recs: 'tenantMonths', drill: ['bu', 'tn']
    });
    K(64, 'C', 'Cost per Successful Task', {
      unit: 'AED2', dir: 'down', cls: 'Derived',
      def: 'AI operating cost per successfully completed agent task.',
      formula: 'Total attributable AI operating cost ÷ Successfully completed tasks',
      expr: '{cost} ÷ {succ}',
      inputs: [IK('cost', 63, 'Total AI operating spend (KPI 63)'), IA('succ', 'Successfully completed tasks', 'count', 'succ', 'Orchestrator', { den: true })],
      calc: v => div(v.cost, v.succ),
      tgt: 6.0, warn: 7.0, crit: 8.5,
      src: ['BILL', 'ORCH'], owner: 'AI FinOps Lead', ev: 'Derived.', incl: 'Failed and escalated tasks add cost but not output.', imp: 'Unit economics versus manual cost per task.',
      money: q => ({ label: 'Manual cost per comparable task (reference)', value: q.a('cmp') ? q.a('manMin') / q.a('cmp') / 60 * (q.a('prodAed') / Math.max(1, (q.a('manMin') - q.a('e2eMin')) / 60)) : null }),
      drill: ['bu', 'tn']
    });
    K(65, 'C', 'Cost per Million Tokens', {
      unit: 'AED2', dir: 'down', cls: 'Derived',
      def: 'Fully loaded cost per million tokens (inference plus infrastructure).',
      formula: '(Inference spend + Infrastructure spend) ÷ Total tokens × 10⁶',
      expr: '({inf} + {infra}) ÷ {tok} × 10⁶',
      inputs: [IK('inf', 61, 'Inference spend (KPI 61)'), IK('infra', 62, 'Infrastructure spend (KPI 62)'), IK('tok', 43, 'Total tokens (KPI 43)')],
      calc: v => (v.tok ? (v.inf + v.infra) / v.tok * 1e6 : null),
      tgt: 22, warn: 27, crit: 33,
      src: ['BILL', 'ERP', 'GW'], owner: 'AI FinOps Lead', ev: 'Derived.', incl: 'Includes on-prem infrastructure so cloud and on-prem compare fairly.', imp: 'Benchmark for model-routing decisions.',
      drill: ['bu', 'tn']
    });
    K(66, 'C', 'Cost per Agent', {
      unit: 'AED', dir: 'down', cls: 'Derived',
      def: 'AI operating spend per agent with model usage in the period.',
      formula: 'Total AI operating spend ÷ Agents with model usage',
      expr: '{cost} ÷ {ag}',
      inputs: [IK('cost', 63, 'Total AI operating spend (KPI 63)'), IG('ag', 'Agents with model usage', 'count', q => usageAgents(q), 'AI gateway', { den: true })],
      calc: v => div(v.cost, v.ag),
      tgt: nmT(15000), warn: nmT(18000), crit: nmT(22000),
      thr: 'AED 15K per agent-month (target), 18K (warning), 22K (critical), scaled by months in period.',
      src: ['BILL', 'REG'], owner: 'AI FinOps Lead', ev: 'Derived.', incl: 'Agents with zero usage excluded.', imp: 'Run cost of each digital worker.',
      drill: ['bu', 'tn']
    });
    K(67, 'C', 'AI Budget Utilization', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'AI operating spend against the approved AI operating budget.',
      formula: 'Total AI operating spend ÷ Approved AI budget × 100',
      expr: '{cost} ÷ {bud} × 100',
      inputs: [IK('cost', 63, 'Total AI operating spend (KPI 63)'), IG('bud', 'Approved AI operating budget', 'AED', q => q.t('budAI'), 'Finance budget (' + D.PROGRAMME.aiBudgetNote + ')', { den: true })],
      calc: v => pct(v.cost, v.bud),
      tgt: 98, warn: 102, crit: 110,
      src: ['ERP', 'BILL'], owner: 'CFO with AI FinOps Lead', ev: 'Budget phasing by BU.', incl: 'Same cost scope as KPI 63.', imp: 'Budget control.',
      recs: 'tenantMonths', drill: ['bu', 'tn']
    });
    K(68, 'C', 'AI Cost Overrun Percentage', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Gross overspend across tenant-month budgets (under-spend elsewhere does not offset it).',
      formula: 'Σ max(0, Spend − Budget) per tenant-month ÷ Σ Budget × 100',
      expr: '{over} ÷ {bud} × 100',
      inputs: [IG('over', 'Σ positive overruns (tenant-month)', 'AED', q => S(q.tenRows(), r => Math.max(0, r.aiSpend - r.budAI)), 'Finance ERP'), IG('bud', 'Σ approved budget', 'AED', q => q.t('budAI'), 'Finance budget', { den: true })],
      calc: v => pct(v.over, v.bud),
      tgt: 1, warn: 3, crit: 6,
      src: ['ERP', 'BILL'], owner: 'CFO', ev: 'Budget vs actual per tenant-month.', incl: 'Gross method: hidden overruns are not netted off.', imp: 'Financial discipline per BU.',
      recs: 'tenantMonths', drill: ['bu', 'tn']
    });
    K(69, 'C', 'AI Spend Forecast', {
      unit: 'AED', dir: 'down', cls: 'Forecast',
      def: 'Forecast AI operating spend for the next 3 months: least-squares trend over the last 6 months.',
      formula: 'Σ for t = 7..9 of (a + b·t), where a, b are fitted on monthly KPI 63 for the last 6 months (t = 1..6)',
      expr: '3 × a + 24 × b = 3 × {a} + 24 × {b}',
      inputs: [
        IG('a', 'Intercept a (AED / month)', 'AED', q => memo(q, 'fc', () => fc(q)).a, 'Least-squares fit'),
        IG('b', 'Slope b (AED / month²)', 'AED', q => memo(q, 'fc', () => fc(q)).b, 'Least-squares fit'),
        IG('h', 'Actual spend, last 6 months', 'AED', q => memo(q, 'fc', () => fc(q)).hist, 'KPI 63 monthly')
      ],
      calc: v => 3 * v.a + 24 * v.b,
      tgt: q => fcBud(q), warn: q => (fcBud(q) == null ? null : fcBud(q) * 1.05), crit: q => (fcBud(q) == null ? null : fcBud(q) * 1.15),
      thr: 'Target = budget run-rate for the next quarter (average of the last 3 monthly budgets × 3).',
      src: ['BILL', 'ERP'], owner: 'AI FinOps Lead', ev: 'Monthly series of KPI 63.', incl: 'Linear trend; seasonality is not modelled.', imp: 'Early warning for budget re-forecast.',
      drill: ['bu', 'tn']
    });
    function fc(q) {
      const ys = [];
      for (let m = q.last - 5; m <= q.last; m++) ys.push(m >= 0 ? q.month(m).kpi(63) || 0 : 0);
      q.touch('act'); q.touch('ten');
      // fit on t = 1..6
      const n = ys.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
      ys.forEach((y, i) => { const x = i + 1; sx += x; sy += y; sxx += x * x; sxy += x * y; });
      const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      const a = (sy - b * sx) / n;
      return { a: a, b: b, hist: sy };
    }
    function fcBud(q) { if (anySet(q, KA)) return null; let s = 0; for (let m = q.last - 2; m <= q.last; m++) s += q.month(m).t('budAI'); return s; }
    K(70, 'C', 'Cache Cost Saving', {
      unit: 'AED', dir: 'up', cls: 'Measured',
      def: 'Inference cost avoided because cached input tokens are billed at the discounted cache price.',
      formula: 'Σ models (cached input tokens × (input price − cache price)) ÷ 10⁶',
      expr: 'Σ over models ({cached} cached tokens × (input price − cache price)) ÷ 10⁶',
      inputs: [IA('save', 'Cost avoided through caching', 'AED', 'cacheSave', 'Provider price list × usage'), IA('cached', 'Cached input tokens', 'tokens', 'tokCached', 'Provider usage API')],
      calc: v => v.save,
      tgt: q => q.kpi(61) * 0.25, warn: q => q.kpi(61) * 0.15, crit: q => q.kpi(61) * 0.08,
      thr: 'Relative to inference spend: target ≥ 25%, warning below 15%, critical below 8%.',
      src: ['BILL', 'GW'], owner: 'AI Platform Owner', ev: 'Usage × price differential.', incl: 'On-prem caching saves GPU time, not price, and is excluded.', imp: 'Value of prompt-caching engineering.',
      recs: 'models', drill: ['mp', 'agent']
    });

    // =====================================================================
    // D. MODEL AVAILABILITY, OUTAGE & LLM PERFORMANCE
    // =====================================================================
    const SD = ['APM', 'GW'];
    K(71, 'D', 'Model Availability Percentage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Request-level availability of model endpoints: share of eligible inference requests served successfully.',
      formula: 'Successful eligible inference requests ÷ Total eligible inference requests × 100',
      expr: '({req} − {excl} − {fail}) ÷ ({req} − {excl}) × 100',
      inputs: [
        IA('req', 'Total inference requests', 'count', 'req', 'AI gateway'),
        IG('excl', 'Excluded: client errors, rate limits, gateway & network failures', 'count', q => modelExcl(q), 'AI gateway error taxonomy'),
        IG('fail', 'Failed eligible requests (provider 5xx, serving 5xx, timeouts)', 'count', q => modelFail(q), 'AI gateway / APM')
      ],
      calc: v => pct(v.req - v.excl - v.fail, v.req - v.excl),
      tgt: 99.9, warn: 99.5, crit: 99.0,
      src: SD, owner: 'AI Platform Owner',
      ev: 'Gateway request logs with error taxonomy; synthetic probes for corroboration.',
      incl: 'Eligible = requests that reached a model endpoint. Client errors (4xx), throttling (429) and gateway / network failures are excluded here and reported in KPIs 58, 101, 113 and 114, so provider outages stay distinct from throttling and local infrastructure failures.',
      imp: 'Agents fail or degrade when models are unavailable.',
      n: q => ({ n: modelElig(q), label: 'eligible requests' }),
      recs: 'models', drill: ['mp', 'wf', 'agent']
    });
    K(72, 'D', 'Model Outage Count', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Number of model outages (≥ 5 minutes of failed eligible requests on a deployment).',
      formula: 'Count of model outage records',
      expr: 'Count of model outage records ({prov} provider-side)',
      inputs: [IG('n', 'Model outages', 'count', q => q.outM().length, 'APM / incident records'), IG('prov', 'of which provider-side', 'count', q => q.outM().filter(o => M[o.mo].ext).length, 'Provider status + APM')],
      calc: v => v.n,
      tgt: nmT(1), warn: nmT(2), crit: nmT(3),
      thr: '1 / 2 / 3 outages per month (scaled by months in period).',
      src: ['APM', 'ITSM'], owner: 'AI Platform Owner', ev: 'Outage records with timeline.', incl: 'Provider outages and internal model-serving failures; throttling is not an outage.', imp: 'Frequency of AI service disruption.',
      recs: 'outM', drill: ['mp']
    });
    K(73, 'D', 'Model Downtime', {
      unit: 'hd', dir: 'down', cls: 'Measured',
      def: 'Total duration of model outages.',
      formula: 'Σ outage duration (minutes) ÷ 60',
      expr: '{min} ÷ 60',
      inputs: [IG('min', 'Σ outage minutes', 'mins', q => S(q.outM(), 'dur'), 'APM')],
      calc: v => v.min / 60,
      tgt: nmT(1.5), warn: nmT(3), crit: nmT(6),
      src: ['APM'], owner: 'AI Platform Owner', ev: 'Outage start / end timestamps.', incl: 'Overlapping outages on the same deployment are merged.', imp: 'Duration of AI service disruption.',
      recs: 'outM', drill: ['mp']
    });
    K(74, 'D', 'Mean Time to Detect Outage', {
      unit: 'mins', dir: 'down', cls: 'Measured',
      def: 'Mean time from outage start to detection (alert raised).',
      formula: 'Σ detection minutes ÷ Number of outages',
      expr: '{s} ÷ {n}',
      inputs: [IG('s', 'Σ minutes to detect', 'mins', q => S(q.outM(), 'mttd'), 'APM alerts'), IG('n', 'Outages', 'count', q => q.outM().length, 'APM', { den: true })],
      calc: v => div(v.s, v.n),
      tgt: 5, warn: 10, crit: 15,
      src: ['APM'], owner: 'AI Platform Owner', ev: 'Alert timestamps.', incl: 'Outages detected by users (not monitoring) are flagged.', imp: 'Faster detection, faster fallback.',
      recs: 'outM', drill: ['mp']
    });
    K(75, 'D', 'Mean Time to Recover Model', {
      unit: 'mins', dir: 'down', cls: 'Measured',
      def: 'Mean time from detection to full recovery of the model service.',
      formula: 'Σ recovery minutes (detection → recovery) ÷ Number of outages',
      expr: '{s} ÷ {n}',
      inputs: [IG('s', 'Σ minutes detection → recovery', 'mins', q => S(q.outM(), 'mttr'), 'APM / incident records'), IG('n', 'Outages', 'count', q => q.outM().length, 'APM', { den: true })],
      calc: v => div(v.s, v.n),
      tgt: 35, warn: 50, crit: 75,
      src: ['APM', 'ITSM'], owner: 'AI Platform Owner', ev: 'Incident timelines.', incl: 'Recovery = error rate back below 0.5% for 10 minutes.', imp: 'Length of business disruption.',
      recs: 'outM', drill: ['mp']
    });
    K(76, 'D', 'Model API Error Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of eligible model requests that failed (the complement of KPI 71).',
      formula: 'Failed eligible model requests ÷ Total eligible model requests × 100',
      expr: '{fail} ÷ {el} × 100',
      inputs: [IG('fail', 'Failed eligible requests', 'count', q => modelFail(q), 'AI gateway'), IG('el', 'Eligible requests', 'count', q => modelElig(q), 'AI gateway', { den: true })],
      calc: v => pct(v.fail, v.el),
      tgt: 0.1, warn: 0.5, crit: 1.0,
      src: SD, owner: 'AI Platform Owner', ev: 'Gateway logs.', incl: 'Same eligibility rules as KPI 71.', imp: 'Error budget consumption.',
      recs: 'models', drill: ['mp', 'agent']
    });
    K(77, 'D', 'Model Server Error Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of eligible requests failing with server-side errors (provider 5xx or internal serving 5xx).',
      formula: '(Provider 5xx + Internal serving 5xx) ÷ Eligible requests × 100',
      expr: '({p} + {s}) ÷ {el} × 100',
      inputs: [IA('p', 'Provider 5xx', 'count', 'eProv', 'AI gateway'), IA('s', 'Internal model-serving 5xx', 'count', 'eSrv', 'Model-serving APM'), IG('el', 'Eligible requests', 'count', q => modelElig(q), 'AI gateway', { den: true })],
      calc: v => pct(v.p + v.s, v.el),
      tgt: 0.08, warn: 0.3, crit: 0.8,
      src: SD, owner: 'AI Platform Owner', ev: 'Status codes by origin.', incl: 'Separates provider failures from internal serving failures.', imp: 'Distinguishes vendor issues from our own platform.',
      recs: 'models', drill: ['mp', 'agent']
    });
    K(78, 'D', 'Model Timeout Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of eligible requests that timed out before a response.',
      formula: 'Timed-out requests ÷ Eligible requests × 100',
      expr: '{to} ÷ {el} × 100',
      inputs: [IA('to', 'Timed-out requests', 'count', 'eTo', 'AI gateway'), IG('el', 'Eligible requests', 'count', q => modelElig(q), 'AI gateway', { den: true })],
      calc: v => pct(v.to, v.el),
      tgt: 0.03, warn: 0.1, crit: 0.3,
      src: SD, owner: 'AI Platform Owner', ev: 'Gateway timeout events.', incl: 'Timeout = no complete response within the workflow budget.', imp: 'Long tails break agent SLAs.',
      recs: 'models', drill: ['mp', 'agent']
    });
    const p95Kpi = (id, name, kind, def, tgt, warn, crit, src) => K(id, 'D', name, {
      unit: 'ms', dir: 'down', cls: 'Measured', def: def,
      formula: 'Nearest-rank 95th percentile of request ' + (kind === 'lat' ? 'end-to-end latency' : 'time to first token'),
      expr: 'value at nearest rank {rank} of {n} sorted observations',
      inputs: [
        IG('n', 'Request observations (sample)', 'count', q => pctl(q, kind).n, src, { den: true }),
        IG('rank', 'Nearest rank = ⌈0.95 × n⌉', 'count', q => pctl(q, kind).rank, 'Derived'),
        IG('p', 'Value at that rank', 'ms', q => pctl(q, kind).value, 'Derived')
      ],
      calc: v => v.p, tgt: tgt, warn: warn, crit: crit,
      src: ['APM', 'GW'], owner: 'AI Platform Owner', ev: 'Request-level timing samples.', incl: 'Sample stratified by model and month in proportion to request volume. Model-level metric: BU filters do not apply.', imp: 'User and agent responsiveness.',
      recs: 'models', drill: ['mp']
    });
    p95Kpi(79, 'Model Latency P95', 'lat', '95th percentile end-to-end model response latency.', 4500, 6000, 8000, 'Gateway timing');
    p95Kpi(80, 'Time to First Token P95', 'ttft', '95th percentile time to first streamed token.', 1500, 2000, 3000, 'Gateway streaming timing');
    K(81, 'D', 'Model Throughput', {
      unit: 'tps', dir: 'up', cls: 'Measured',
      def: 'Average generation throughput in output tokens per second.',
      formula: 'Σ output tokens ÷ Σ generation seconds',
      expr: '{out} ÷ {sec}',
      inputs: [IA('out', 'Output tokens', 'tokens', 'tokOut', 'AI gateway'), IA('sec', 'Generation seconds', 'num', 'genSec', 'APM', { den: true })],
      calc: v => div(v.out, v.sec),
      tgt: 50, warn: 40, crit: 30,
      src: ['APM'], owner: 'AI Platform Owner', ev: 'Streaming spans.', incl: 'Embedding models excluded (no generation).', imp: 'Capacity and speed of generation.',
      recs: 'models', drill: ['mp']
    });
    K(82, 'D', 'Model Fallback Success', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of eligible fallback attempts that completed on the secondary model.',
      formula: 'Successful fallback executions ÷ Eligible fallback attempts × 100',
      expr: '{ok} ÷ {el} × 100',
      inputs: [IA('ok', 'Successful fallback executions', 'count', 'fbOk', 'AI gateway router'), IA('el', 'Eligible fallback attempts', 'count', 'fbElig', 'AI gateway router', { den: true })],
      calc: v => pct(v.ok, v.el),
      tgt: 98, warn: 95, crit: 90,
      src: ['GW'], owner: 'AI Platform Owner', ev: 'Router decisions per request.', incl: 'Agents without a configured fallback are not eligible (see KPI 83).', imp: 'Resilience during provider outages.',
      recs: 'agents', drill: ['agent', 'mp']
    });
    K(83, 'D', 'Model Fallback Coverage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of agents on critical business workflows with a configured and tested fallback model.',
      formula: 'Critical-workflow agents with tested fallback ÷ Critical-workflow agents × 100',
      expr: '{cov} ÷ {all} × 100',
      inputs: [
        IG('cov', 'Critical-workflow agents with tested fallback', 'count', q => q.agents((a, m) => W[a.wf].crit && a.fallback && a.fbTestedFrom != null && a.fbTestedFrom <= m).length, 'AI gateway routing config + test log'),
        IG('all', 'Agents on critical workflows', 'count', q => q.agents(a => W[a.wf].crit).length, 'AI agent registry', { den: true })
      ],
      calc: v => pct(v.cov, v.all),
      tgt: 100, warn: 90, crit: 75,
      src: ['GW', 'REG'], freq: 'Weekly', owner: 'AI Platform Owner', ev: 'Routing configuration and failover test records.', incl: 'Configured but untested fallbacks do not count.', imp: 'Critical AI applications without fallback are a single point of failure.',
      recs: 'agentsCritical', drill: ['bu', 'tn', 'wf']
    });
    K(84, 'D', 'Model Dependency Concentration', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of critical-workflow tokens served by the single largest provider.',
      formula: 'Tokens of the largest provider on critical workflows ÷ All critical-workflow tokens × 100',
      expr: '{top} ÷ {tot} × 100',
      inputs: [
        IG('top', 'Tokens of largest provider', 'tokens', q => memo(q, 'conc', () => conc(q)).top, 'AI gateway', { noteFn: q => memo(q, 'conc', () => conc(q)).name }),
        IG('tot', 'All critical-workflow tokens', 'tokens', q => memo(q, 'conc', () => conc(q)).tot, 'AI gateway', { den: true })
      ],
      calc: v => pct(v.top, v.tot),
      tgt: 50, warn: 60, crit: 75,
      src: ['GW'], owner: 'Chief Technology Officer', ev: 'Token routing by provider.', incl: 'Critical workflows only; on-prem counts as its own provider.', imp: 'Vendor concentration and exit risk.',
      recs: 'providers', drill: ['prov', 'wf']
    });
    function conc(q) {
      const by = {}; let tot = 0;
      q.actRows().forEach(r => { if (!W[r.wf].crit) return; const t = r.tokIn + r.tokOut; by[r.prov] = (by[r.prov] || 0) + t; tot += t; });
      let name = '', top = 0; Object.keys(by).forEach(p => { if (by[p] > top) { top = by[p]; name = p; } });
      return { top: top, tot: tot, name: name };
    }
    K(85, 'D', 'Model Outage Business Impact', {
      unit: 'AED', dir: 'down', cls: 'Estimated',
      def: 'Estimated business impact of model outages (affected workflow minutes × cost per minute); the Finance-validated actual part is shown separately.',
      formula: 'Σ outages (impact minutes × business cost per minute of affected workflows)',
      expr: 'Σ estimated impact over model outages (of which Finance-validated {act})',
      inputs: [IG('est', 'Estimated business impact', 'AED', q => S(q.outM(), 'impactEst'), 'BIA cost-per-minute × outage timeline'), IG('act', 'of which Finance-validated actual loss', 'AED', q => S(q.outM(), 'impactActual'), 'Finance ERP')],
      calc: v => v.est,
      tgt: nmT(60e3), warn: nmT(120e3), crit: nmT(250e3),
      src: ['APM', 'ERP'], owner: 'Head of Resilience (BCM)', ev: 'Outage records linked to affected workflows.', incl: 'Impact minutes are shortened where fallback succeeded.', imp: 'Business cost of model unreliability.',
      recs: 'outM', drill: ['mp', 'wf']
    });
    K(86, 'D', 'Model SLA/SLO Breach Count', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Number of deployment-months where model availability fell below the deployment SLO.',
      formula: 'Count of (deployment, month) with availability < SLO',
      expr: 'Count of deployment-months below SLO ({br} of {dm})',
      inputs: [IG('br', 'Deployment-months below SLO', 'count', q => memo(q, 'slo', () => slo(q)).br, 'AI gateway'), IG('dm', 'Deployment-months evaluated', 'count', q => memo(q, 'slo', () => slo(q)).dm, 'AI gateway', { den: true })],
      calc: v => v.br,
      tgt: 0, warn: 1, crit: q => Math.max(3, q.nm),
      src: SD, owner: 'AI Platform Owner', ev: 'Monthly availability per deployment vs SLO (external 99.9%, on-prem 99.5%).', incl: 'Provider SLA credits are claimed for external breaches.', imp: 'Contractual and service-level exposure.',
      recs: 'slo', drill: ['mp']
    });
    function slo(q) {
      let br = 0, dm = 0; const list = [];
      for (let m = q.from; m <= q.to; m++) {
        const qm = q.month(m);
        qm.split('mp').forEach(s => {
          const c = s.ctx, el = c.a('req') - (c.a('eApp') + c.a('eRl') + c.a('eGw') + c.a('eNet'));
          if (el <= 0) return;
          const av = (el - (c.a('eProv') + c.a('eSrv') + c.a('eTo'))) / el * 100;
          const md = M[s.key.slice(2)];
          dm++; if (av < md.slo) { br++; list.push({ m: m, mo: md.id, av: av, slo: md.slo }); }
        });
      }
      q.touch('act');
      return { br: br, dm: dm, list: list };
    }
    K(87, 'D', 'Model Version Change Risk', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of model version changes deployed without a completed regression evaluation.',
      formula: 'Changes without completed evaluation ÷ Total model version changes × 100',
      expr: '{un} ÷ {n} × 100',
      inputs: [IG('un', 'Changes without completed evaluation', 'count', q => q.mchg().filter(x => !x.evaluated).length, 'Change management + eval pipeline'), IG('n', 'Model version changes', 'count', q => q.mchg().length, 'Change management', { den: true })],
      calc: v => pct(v.un, v.n),
      tgt: 5, warn: 10, crit: 20,
      src: ['ITSM', 'EVAL'], owner: 'AI Platform Owner', ev: 'Change tickets with evaluation report links.', incl: 'Provider-forced upgrades count.', imp: 'Untested model changes alter agent behaviour silently.',
      recs: 'mchg', drill: ['mp']
    });
    K(88, 'D', 'Failed Model Migration Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of model migrations rolled back or failing acceptance.',
      formula: 'Failed or rolled-back migrations ÷ Total migrations × 100',
      expr: '{f} ÷ {n} × 100',
      inputs: [IG('f', 'Failed / rolled-back migrations', 'count', q => q.mchg().filter(x => x.migration && x.failed).length, 'Change management'), IG('n', 'Migrations', 'count', q => q.mchg().filter(x => x.migration).length, 'Change management', { den: true })],
      calc: v => pct(v.f, v.n),
      tgt: 5, warn: 10, crit: 20,
      src: ['ITSM', 'EVAL'], owner: 'AI Platform Owner', ev: 'Change records.', incl: 'Migration = moving a workflow to a different model or major version.', imp: 'Change capability and stability.',
      recs: 'mchg', drill: ['mp']
    });
    K(89, 'D', 'Model Quality Regression Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of scheduled evaluation runs showing a significant quality regression against baseline.',
      formula: 'Evaluation runs with significant regression ÷ Total evaluation runs × 100',
      expr: '{r} ÷ {n} × 100',
      inputs: [IG('r', 'Runs with significant regression', 'count', q => S(q.evals(), 'regressions'), 'Evaluation pipeline'), IG('n', 'Evaluation runs', 'count', q => S(q.evals(), 'runs'), 'Evaluation pipeline', { den: true })],
      calc: v => pct(v.r, v.n),
      tgt: 3, warn: 5, crit: 8,
      src: ['EVAL'], owner: 'AI Platform Owner', ev: 'Golden-set evaluation results.', incl: 'Significance: p < 0.05 on the task-success metric.', imp: 'Silent quality drift damages outcomes.',
      recs: 'evals', drill: ['mp']
    });

    // =====================================================================
    // E. TOKEN EXHAUSTION, RATE LIMITS & CONSUMPTION RISK
    // =====================================================================
    K(90, 'E', 'Context Limit Exceeded Events', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Requests that exceeded the model context window.',
      formula: 'Σ context-limit-exceeded events',
      expr: 'Σ context-limit events ({req} requests in scope)',
      inputs: [IA('e', 'Context-limit events', 'count', 'ctxExc', 'AI gateway'), IA('req', 'Total requests (reference)', 'count', 'req', 'AI gateway')],
      calc: v => v.e,
      tgt: q => q.a('req') * 0.0025, warn: q => q.a('req') * 0.005, crit: q => q.a('req') * 0.01,
      thr: 'Thresholds = 0.25% / 0.5% / 1.0% of requests in scope (consistent with KPI 56).',
      src: ['GW'], owner: 'AI Platform Owner', ev: 'Gateway error codes.', incl: 'Includes truncation by the gateway.', imp: 'Causes failed or degraded tasks.',
      recs: 'agents', drill: ['agent', 'wf', 'mp']
    });
    K(91, 'E', 'TPM Exceeded Events', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Throttling episodes caused by tokens-per-minute limits (one episode = consecutive minutes with 429 TPM).',
      formula: 'Σ TPM throttling episodes',
      expr: 'Σ TPM throttling episodes ({req} throttled requests)',
      inputs: [IA('ev', 'TPM throttling episodes', 'count', 'tpmEv', 'AI gateway'), IA('req', 'Requests throttled on TPM', 'count', 'rlTpm', 'AI gateway')],
      calc: v => v.ev,
      tgt: nmT(120), warn: nmT(250), crit: nmT(450),
      src: ['GW', 'QUOTA'], owner: 'AI Platform Owner', ev: '429 responses grouped into episodes.', incl: 'Gateway-level and provider-level limits.', imp: 'Agent slowdown and retries.',
      recs: 'quota', drill: ['mp', 'agent']
    });
    K(92, 'E', 'RPM Exceeded Events', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Throttling episodes caused by requests-per-minute limits.',
      formula: 'Σ RPM throttling episodes',
      expr: 'Σ RPM throttling episodes ({req} throttled requests)',
      inputs: [IA('ev', 'RPM throttling episodes', 'count', 'rpmEv', 'AI gateway'), IA('req', 'Requests throttled on RPM', 'count', 'rlRpm', 'AI gateway')],
      calc: v => v.ev,
      tgt: nmT(120), warn: nmT(250), crit: nmT(450),
      src: ['GW', 'QUOTA'], owner: 'AI Platform Owner', ev: '429 responses grouped into episodes.', incl: 'As KPI 91.', imp: 'Agent slowdown and retries.',
      recs: 'quota', drill: ['mp', 'agent']
    });
    K(93, 'E', 'Provider Quota Exhaustion', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Deployment-months where the committed monthly token quota was fully consumed.',
      formula: 'Count of deployment-months with consumption > committed quota',
      expr: 'Count of deployment-months with consumption > commitment ({days} days with the daily quota exhausted)',
      inputs: [IG('n', 'Quota exhaustion events', 'count', q => q.quota().filter(x => x.exhausted).length, 'Provider quota API'), IG('days', 'Days with daily quota exhausted', 'count', q => S(q.quota(), 'exhaustDays'), 'Provider quota API')],
      calc: v => v.n,
      tgt: 0, warn: 1, crit: 3,
      src: ['QUOTA', 'BILL'], owner: 'AI FinOps Lead', ev: 'Quota API snapshots.', incl: 'External providers with monthly commitments.', imp: 'Hard stop of agent traffic until reset.',
      recs: 'quota', drill: ['mp']
    });
    K(94, 'E', 'Token Threshold Breaches', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Number of budget alert thresholds (80%, 90%, 100% of token budget) crossed by tenant budgets.',
      formula: 'Σ tenant-months of [tokens ≥ 80% budget] + [≥ 90%] + [≥ 100%]',
      expr: '{b80} + {b90} + {b100}',
      inputs: [
        IG('b80', 'Crossings of 80%', 'count', q => q.tenRows().filter(r => r.budTok > 0 && r.tokens >= 0.8 * r.budTok).length, 'Budget alerts'),
        IG('b90', 'Crossings of 90%', 'count', q => q.tenRows().filter(r => r.budTok > 0 && r.tokens >= 0.9 * r.budTok).length, 'Budget alerts'),
        IG('b100', 'Crossings of 100%', 'count', q => q.tenRows().filter(r => r.budTok > 0 && r.tokens >= r.budTok).length, 'Budget alerts')
      ],
      calc: v => v.b80 + v.b90 + v.b100,
      tgt: q => q.tenRows().filter(r => r.budTok > 0).length * 1.5, warn: q => q.tenRows().filter(r => r.budTok > 0).length * 2.0, crit: q => q.tenRows().filter(r => r.budTok > 0).length * 2.5,
      thr: 'Relative to budget scopes: ≤ 1.5 crossings per tenant-month (target), 2.0 (warning), 2.5 (critical).',
      src: ['GW', 'ERP'], owner: 'AI FinOps Lead', ev: 'Alert log.', incl: 'Each threshold counts once per tenant-month.', imp: 'Budget pressure early warning.',
      recs: 'tenantMonths', drill: ['bu', 'tn']
    });
    K(95, 'E', 'Excessive Token Consumption', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Sessions consuming more than 3× the P95 tokens-per-task baseline of their agent.',
      formula: 'Σ sessions with tokens > 3 × agent P95 baseline',
      expr: 'Σ sessions above 3 × agent P95 baseline ({tasks} tasks in scope)',
      inputs: [IA('n', 'Anomalous sessions', 'count', 'tokAnom', 'Gateway anomaly detector'), IA('tasks', 'Initiated tasks (reference)', 'count', 'tasks', 'Orchestrator')],
      calc: v => v.n,
      tgt: q => q.a('tasks') * 0.0006, warn: q => q.a('tasks') * 0.0009, crit: q => q.a('tasks') * 0.0013,
      thr: 'Relative: 0.6 / 0.9 / 1.3 anomalous sessions per 1,000 tasks.',
      src: ['GW'], owner: 'AI FinOps Lead', ev: 'Anomaly alerts with session IDs.', incl: 'Baseline recalculated weekly per agent.', imp: 'Cost spikes and possible abuse.',
      recs: 'agents', drill: ['agent', 'bu']
    });
    K(96, 'E', 'Runaway Agent Loops', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Sessions terminated by loop detection (repeated tool calls, circular agent-to-agent calls, uncontrolled retries).',
      formula: 'Σ sessions terminated by loop detectors',
      expr: 'Σ sessions terminated by loop detectors ({tasks} tasks in scope)',
      inputs: [IA('n', 'Loop terminations', 'count', 'loops', 'Orchestrator loop detector'), IA('tasks', 'Initiated tasks (reference)', 'count', 'tasks', 'Orchestrator')],
      calc: v => v.n,
      tgt: q => q.a('tasks') * 0.00008, warn: q => q.a('tasks') * 0.00012, crit: q => q.a('tasks') * 0.0002,
      thr: 'Relative: 0.08 / 0.12 / 0.20 loops per 1,000 tasks.',
      src: ['ORCH'], owner: 'AI Platform Owner', ev: 'Loop-detector events with trace IDs.', incl: 'Includes circular agent-to-agent delegation.', imp: 'Uncontrolled spend and quota exhaustion.',
      recs: 'agents', drill: ['agent', 'wf']
    });
    K(97, 'E', 'Token Exhaustion Risk', {
      unit: '%', dir: 'down', cls: 'Forecast',
      def: 'Projected month-end consumption against the committed monthly quota for the most exposed deployment (current month to date, Nov 2026).',
      formula: '(Tokens used MTD ÷ Days elapsed × Days in month) ÷ Committed monthly quota × 100',
      expr: '({used} ÷ {el} × {days}) ÷ {commit} × 100',
      inputs: [
        IG('used', 'Tokens used month-to-date', 'tokens', q => qn(q) ? qn(q).used : null, 'Provider quota API', { noteFn: q => qn(q) ? MLBL(qn(q).mo) : '' }),
        IG('el', 'Days elapsed (as of ' + D.AS_OF.label + ')', 'num', q => qn(q) ? qn(q).elapsed : null, 'Calendar'),
        IG('days', 'Days in month', 'num', q => qn(q) ? qn(q).days : null, 'Calendar'),
        IG('commit', 'Committed monthly quota', 'tokens', q => qn(q) ? qn(q).commit : null, 'Provider contract', { den: true })
      ],
      calc: v => (v.commit ? (v.used / v.el * v.days) / v.commit * 100 : null),
      tgt: 85, warn: 95, crit: 100,
      thr: 'Current-month forecast; independent of the period filter. Quota resets ' + D.AS_OF.resetLabel + '.',
      src: ['QUOTA'], freq: 'Hourly', owner: 'AI FinOps Lead', ev: 'Quota API snapshot.', incl: 'Most exposed external deployment in scope.', imp: 'Exhaustion stops agents until quota reset.',
      recs: 'quotaNow', drill: ['mp']
    });
    function qn(q) { return memo(q, 'qn', () => { let best = null; q.quotaNow().forEach(x => { const r = x.used / x.elapsed * x.days / x.commit; if (!best || r > best.r) best = Object.assign({ r: r }, x); }); return best; }); }
    K(98, 'E', 'Token Utilization Spike', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Days where an agent\'s token consumption exceeded its 7-day moving average by more than 50%.',
      formula: 'Σ spike days (daily tokens > 1.5 × 7-day moving average)',
      expr: 'Σ agent spike days (daily tokens > 1.5 × 7-day average)',
      inputs: [IA('n', 'Spike days (agent-level)', 'count', 'spikes', 'Gateway anomaly detector')],
      calc: v => v.n,
      tgt: nmT(8), warn: nmT(12), crit: nmT(20),
      src: ['GW'], owner: 'AI FinOps Lead', ev: 'Daily usage series per agent.', incl: 'Production only.', imp: 'Leading indicator of runaway consumption.',
      recs: 'agents', drill: ['agent', 'bu']
    });
    K(99, 'E', 'Rate-Limit Recovery Success', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of throttled requests that succeeded after back-off, retry or re-routing.',
      formula: 'Throttled requests later served ÷ Throttled requests × 100',
      expr: '{rec} ÷ {rl} × 100',
      inputs: [IA('rec', 'Throttled requests recovered', 'count', 'rlRecov', 'AI gateway'), IA('rl', 'Throttled requests', 'count', 'eRl', 'AI gateway', { den: true })],
      calc: v => pct(v.rec, v.rl),
      tgt: 98, warn: 95, crit: 90,
      src: ['GW'], owner: 'AI Platform Owner', ev: 'Retry chains per request ID.', incl: 'Within the workflow time budget.', imp: 'Throttling should not become task failure.',
      recs: 'models', drill: ['mp', 'agent']
    });
    K(100, 'E', 'Token Exceedance Business Impact', {
      unit: 'AED', dir: 'down', cls: 'Estimated',
      def: 'Estimated cost of tasks that fell back to manual handling because of unrecovered throttling, plus quota-exhaustion impacts.',
      formula: '(Unrecovered throttled requests ÷ Requests per task) × Manual cost per task + Quota-exhaustion impact',
      expr: '({un} ÷ {rpt}) × {mc} + {qi}',
      inputs: [
        IG('un', 'Unrecovered throttled requests', 'count', q => q.a('eRl') - q.a('rlRecov'), 'AI gateway'),
        IG('rpt', 'Requests per task', 'num', q => div(q.a('req'), q.a('tasks')), 'AI gateway / orchestrator'),
        IG('mc', 'Manual cost per task (baseline minutes × loaded rate)', 'AED2', q => { const h = (q.a('manMin') - q.a('e2eMin')) / 60; return q.a('cmp') && h ? q.a('manMin') / q.a('cmp') / 60 * (q.a('prodAed') / h) : null; }, 'Baseline + HR rates'),
        IG('qi', 'Quota-exhaustion impact', 'AED', q => S(q.quota(), 'impact'), 'Incident records')
      ],
      calc: v => (v.rpt ? v.un / v.rpt * (v.mc || 0) + v.qi : null),
      tgt: nmT(15e3), warn: nmT(40e3), crit: nmT(90e3),
      src: ['GW', 'QUOTA', 'HR'], owner: 'AI FinOps Lead', ev: 'Derived.', incl: 'Recovered throttles carry no impact.', imp: 'Business cost of capacity shortfalls.',
      drill: ['mp', 'bu']
    });

    // =====================================================================
    // F. AI INFRASTRUCTURE, GPU & DATA CENTER RESILIENCE
    // =====================================================================
    const SF = ['DCGM', 'K8S', 'APM'];
    K(101, 'F', 'AI Infrastructure Availability', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Request-level availability of AI platform services (GPU serving, Kubernetes, gateway, load balancers, network, storage, vector DB).',
      formula: 'Successful eligible AI platform service requests ÷ Total eligible service requests × 100',
      expr: '{ok} ÷ {req} × 100',
      inputs: [IG('ok', 'Successful service requests', 'count', q => q.inf('ok'), 'Component request logs / probes'), IG('req', 'Eligible service requests', 'count', q => q.inf('req'), 'Component request logs / probes', { den: true })],
      calc: v => pct(v.ok, v.req),
      tgt: 99.95, warn: 99.9, crit: 99.5,
      src: SF, owner: 'Head of Infrastructure', ev: 'Per-component request and probe logs.', incl: 'Shared platform: BU filters do not apply. Request-level, distinct from business-service availability (Model reliability page).', imp: 'Foundation for every AI workflow.',
      n: q => ({ n: q.inf('req'), label: 'service requests' }),
      recs: 'components', drill: []
    });
    K(102, 'F', 'Infrastructure Outage Count', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Number of AI infrastructure outages (≥ 5 minutes of component unavailability).',
      formula: 'Count of infrastructure outage records',
      expr: 'Count of infrastructure outage records ({c} Critical)',
      inputs: [IG('n', 'Infrastructure outages', 'count', q => q.outI().length, 'ITSM / APM'), IG('c', 'of which Critical severity', 'count', q => q.outI().filter(o => o.sev === 'Critical').length, 'ITSM')],
      calc: v => v.n,
      tgt: nmT(1), warn: nmT(2), crit: nmT(3),
      src: ['ITSM', 'APM'], owner: 'Head of Infrastructure', ev: 'Major incident records.', incl: 'GPU, Kubernetes, serving, gateway, load balancer, network, storage and vector DB.', imp: 'Platform stability.',
      recs: 'outI', drill: []
    });
    K(103, 'F', 'Total Infrastructure Downtime', {
      unit: 'hd', dir: 'down', cls: 'Measured',
      def: 'Total duration of AI infrastructure outages.',
      formula: 'Σ infrastructure outage minutes ÷ 60',
      expr: '{min} ÷ 60',
      inputs: [IG('min', 'Σ outage minutes', 'mins', q => S(q.outI(), 'dur'), 'ITSM / APM')],
      calc: v => v.min / 60,
      tgt: nmT(1), warn: nmT(2.5), crit: nmT(5),
      src: ['ITSM', 'APM'], owner: 'Head of Infrastructure', ev: 'Incident timelines.', incl: 'Component-level; overlapping outages on one component are merged.', imp: 'Platform downtime.',
      recs: 'outI', drill: []
    });
    K(104, 'F', 'GPU Availability', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of scheduled GPU-hours that were available for workloads.',
      formula: 'Available GPU-hours ÷ Scheduled GPU-hours × 100',
      expr: '{av} ÷ {sc} × 100',
      inputs: [IG('av', 'Available GPU-hours', 'h', q => q.inf('gpuHrsAvail', 'gpu'), 'DCGM'), IG('sc', 'Scheduled GPU-hours', 'h', q => q.inf('gpuHrsSched', 'gpu'), 'DCGM / CMDB', { den: true })],
      calc: v => pct(v.av, v.sc),
      tgt: 99, warn: 98, crit: 96,
      src: ['DCGM', 'CMDB'], owner: 'Head of Infrastructure', ev: 'DCGM health and Xid events.', incl: 'Planned maintenance is counted as unavailable.', imp: 'On-prem model capacity.',
      recs: 'gpu', drill: []
    });
    K(105, 'F', 'GPU Failure Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'GPU hardware failures requiring drain or RMA per GPU-month.',
      formula: 'GPU failures ÷ GPU-months × 100',
      expr: '{f} ÷ {g} × 100',
      inputs: [IG('f', 'GPU failures (drain / RMA)', 'count', q => q.inf('gpuFail', 'gpu'), 'DCGM Xid events'), IG('g', 'GPU-months in service', 'count', q => q.inf('gpus', 'gpu'), 'CMDB', { den: true })],
      calc: v => pct(v.f, v.g),
      tgt: 1.0, warn: 1.5, crit: 2.5,
      src: ['DCGM', 'CMDB'], owner: 'Head of Infrastructure', ev: 'RMA tickets.', incl: 'Per GPU-month to normalise for fleet growth.', imp: 'Hardware reliability and spares planning.',
      recs: 'gpu', drill: []
    });
    K(106, 'F', 'GPU Utilization', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Busy GPU-hours as a share of available GPU-hours (SM activity).',
      formula: 'Busy GPU-hours ÷ Available GPU-hours × 100',
      expr: '{b} ÷ {av} × 100',
      inputs: [IG('b', 'Busy GPU-hours', 'h', q => q.inf('gpuBusyHrs', 'gpu'), 'DCGM'), IG('av', 'Available GPU-hours', 'h', q => q.inf('gpuHrsAvail', 'gpu'), 'DCGM', { den: true })],
      calc: v => pct(v.b, v.av),
      tgt: 65, warn: 50, crit: 40,
      thr: 'Efficiency view (higher is better). Capacity risk from high utilisation is tracked in KPIs 109-110.',
      src: ['DCGM'], owner: 'Head of Infrastructure', ev: 'DCGM SM-activity samples.', incl: 'Average over the period.', imp: 'Return on GPU investment.',
      recs: 'gpu', drill: []
    });
    K(107, 'F', 'GPU Memory Pressure', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of available GPU-hours with HBM memory utilisation above 90%.',
      formula: 'GPU-hours with memory > 90% ÷ Available GPU-hours × 100',
      expr: '{hi} ÷ {av} × 100',
      inputs: [IG('hi', 'GPU-hours with memory > 90%', 'h', q => q.inf('gpuMemHiHrs', 'gpu'), 'DCGM'), IG('av', 'Available GPU-hours', 'h', q => q.inf('gpuHrsAvail', 'gpu'), 'DCGM', { den: true })],
      calc: v => pct(v.hi, v.av),
      tgt: 10, warn: 15, crit: 25,
      src: ['DCGM'], owner: 'Head of Infrastructure', ev: 'DCGM memory samples.', incl: '5-minute samples.', imp: 'Precursor of OOM failures and latency.',
      recs: 'gpu', drill: []
    });
    K(108, 'F', 'GPU Saturation Events', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: '5-minute windows with GPU utilisation above 95% and a growing request queue.',
      formula: 'Σ saturation windows',
      expr: 'Σ 5-minute saturation windows across both GPU clusters',
      inputs: [IG('n', 'Saturation windows', 'count', q => q.inf('satEv', 'gpu'), 'DCGM + queue metrics')],
      calc: v => v.n,
      tgt: nmT(25), warn: nmT(40), crit: nmT(60),
      src: ['DCGM', 'K8S'], owner: 'Head of Infrastructure', ev: 'Joined GPU and queue metrics.', incl: 'Both clusters.', imp: 'Latency spikes for agents.',
      recs: 'gpu', drill: []
    });
    K(109, 'F', 'Compute Capacity Headroom', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Spare GPU capacity above peak demand at period end.',
      formula: '(GPU capacity − Peak GPU demand) ÷ GPU capacity × 100',
      expr: '({cap} − {peak}) ÷ {cap} × 100',
      inputs: [IG('cap', 'GPU capacity (GPUs)', 'num', q => q.infL('gpus', 'gpu'), 'CMDB'), IG('peak', 'Peak GPU demand (GPU-equivalents)', 'num', q => q.infL('peak', 'gpu'), 'DCGM')],
      calc: v => pct(v.cap - v.peak, v.cap),
      tgt: 30, warn: 20, crit: 10,
      src: ['DCGM', 'CMDB'], owner: 'Head of Infrastructure', ev: 'Peak-hour utilisation.', incl: 'Snapshot at period end.', imp: 'Ability to absorb growth and failover.',
      recs: 'gpu', drill: []
    });
    K(110, 'F', 'AI Infrastructure Capacity Risk', {
      unit: 'months', dir: 'up', cls: 'Forecast',
      def: 'Capacity runway: months until peak GPU demand reaches capacity at the current demand growth rate.',
      formula: 'ln(Capacity ÷ Peak demand) ÷ ln(1 + Monthly demand growth)',
      expr: 'ln({cap} ÷ {peak}) ÷ ln(1 + {g}%)',
      inputs: [
        IG('cap', 'GPU capacity (GPUs)', 'num', q => q.infL('gpus', 'gpu'), 'CMDB'),
        IG('peak', 'Peak GPU demand', 'num', q => q.infL('peak', 'gpu'), 'DCGM'),
        IG('g', 'Monthly demand growth (6-month CAGR of on-prem tokens)', '%', q => { q.touch('inf'); const a = D.agg.onpremTok, m = q.last; return m >= 6 && a[m - 6] > 0 ? (Math.pow(a[m] / a[m - 6], 1 / 6) - 1) * 100 : null; }, 'AI gateway (on-prem models)')
      ],
      calc: v => (v.g > 0 && v.peak > 0 ? Math.log(v.cap / v.peak) / Math.log(1 + v.g / 100) : null),
      tgt: 12, warn: 6, crit: 3,
      src: ['DCGM', 'GW', 'CMDB'], owner: 'Head of Infrastructure', ev: 'Capacity model.', incl: 'Assumes constant growth; procurement lead time for GPUs is about 4 months.', imp: 'Drives the GPU capacity investment decision.',
      recs: 'gpu', drill: []
    });
    K(111, 'F', 'Kubernetes Node Availability', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of scheduled node-hours in Ready state on the AI Kubernetes platform.',
      formula: 'Ready node-hours ÷ Scheduled node-hours × 100',
      expr: '{r} ÷ {s} × 100',
      inputs: [IG('r', 'Ready node-hours', 'h', q => q.inf('nodeHrsReady', 'k8s'), 'Kubernetes / Prometheus'), IG('s', 'Scheduled node-hours', 'h', q => q.inf('nodeHrsSched', 'k8s'), 'Kubernetes', { den: true })],
      calc: v => pct(v.r, v.s),
      tgt: 99.7, warn: 99.5, crit: 99.0,
      src: ['K8S'], owner: 'Head of Infrastructure', ev: 'kube-state-metrics.', incl: 'AI platform node pools.', imp: 'Scheduling capacity for serving.',
      recs: 'components', drill: []
    });
    K(112, 'F', 'Container/Pod Failure Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of pod starts ending in failure (CrashLoopBackOff, OOMKilled, eviction).',
      formula: 'Pod failures ÷ Pod starts × 100',
      expr: '{f} ÷ {s} × 100',
      inputs: [IG('f', 'Pod failures', 'count', q => q.inf('podFails', 'k8s'), 'Kubernetes events'), IG('s', 'Pod starts', 'count', q => q.inf('podStarts', 'k8s'), 'Kubernetes events', { den: true })],
      calc: v => pct(v.f, v.s),
      tgt: 1.5, warn: 2.0, crit: 3.0,
      src: ['K8S'], owner: 'Head of Infrastructure', ev: 'Kubernetes events.', incl: 'AI namespaces.', imp: 'Stability of serving and agent runtimes.',
      recs: 'components', drill: []
    });
    const compAvail = (id, name, comp, tgt, warn, crit, def) => K(id, 'F', name, {
      unit: '%', dir: 'up', cls: 'Measured', def: def,
      formula: 'Successful requests ÷ Total requests × 100 (' + D.idx.COMP[comp].name + ')',
      expr: '{ok} ÷ {req} × 100',
      inputs: [IG('ok', 'Successful requests', 'count', q => comp_(q, comp).ok, 'Component logs / probes'), IG('req', 'Total requests', 'count', q => comp_(q, comp).req, 'Component logs / probes', { den: true })],
      calc: v => pct(v.ok, v.req), tgt: tgt, warn: warn, crit: crit,
      src: ['APM', 'K8S'], owner: 'Head of Infrastructure', ev: 'Component request logs and probes.', incl: 'Shared platform component.', imp: 'Failure of this component affects multiple agents.',
      recs: 'outI', drill: []
    });
    const comp_ = (q, c) => memo(q, 'comp|' + c, () => comp(q, c));
    compAvail(113, 'AI Gateway Availability', 'GW', 99.95, 99.9, 99.5, 'Availability of the AI gateway (routing, policy, token metering).');
    compAvail(114, 'Network Availability', 'NET', 99.99, 99.95, 99.9, 'Availability of DC network and WAN paths serving AI workloads.');
    compAvail(115, 'Storage Availability', 'STO', 99.99, 99.95, 99.9, 'Availability of object and block storage used by AI workloads.');
    compAvail(116, 'Vector Database Availability', 'VDB', 99.95, 99.9, 99.5, 'Availability of the vector database cluster serving RAG retrieval.');
    K(117, 'F', 'AI Queue Latency P95', {
      unit: 'ms', dir: 'down', cls: 'Measured',
      def: '95th percentile time inference requests wait in the GPU serving queue.',
      formula: 'Nearest-rank 95th percentile of queue wait times',
      expr: 'value at nearest rank {rank} of {n} sorted observations',
      inputs: [IG('n', 'Queue observations (sample)', 'count', q => pctl(q, 'queue').n, 'Serving metrics', { den: true }), IG('rank', 'Nearest rank = ⌈0.95 × n⌉', 'count', q => pctl(q, 'queue').rank, 'Derived'), IG('p', 'Value at that rank', 'ms', q => pctl(q, 'queue').value, 'Derived')],
      calc: v => v.p,
      tgt: 600, warn: 900, crit: 1500,
      src: ['K8S', 'APM'], owner: 'Head of Infrastructure', ev: 'Serving queue histograms.', incl: 'Both GPU clusters.', imp: 'Queueing adds latency to every agent step.',
      recs: 'gpu', drill: []
    });
    K(118, 'F', 'Infrastructure Failover Success', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of failover attempts (scheduled tests and real events) that succeeded.',
      formula: '(Successful failover tests + Successful real failovers) ÷ (Failover tests + Real failover attempts) × 100',
      expr: '({to} + {ro}) ÷ ({tn} + {rn}) × 100',
      inputs: [
        IG('to', 'Successful failover tests', 'count', q => q.inf('foOk'), 'BCM / DR records'), IG('ro', 'Successful real failovers', 'count', q => q.outI().filter(o => o.foOk).length, 'Incident records'),
        IG('tn', 'Failover tests', 'count', q => q.inf('foTests'), 'BCM / DR records', { den: true }), IG('rn', 'Real failover attempts', 'count', q => q.outI().filter(o => o.foTried).length, 'Incident records', { den: true })
      ],
      calc: v => pct(v.to + v.ro, v.tn + v.rn),
      tgt: 95, warn: 90, crit: 80,
      src: ['BCM', 'ITSM'], owner: 'Head of Resilience (BCM)', ev: 'DR test reports and incident timelines.', incl: 'Critical components only.', imp: 'Confidence in resilience design.',
      recs: 'outI', drill: []
    });
    K(119, 'F', 'RTO Compliance', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of DR tests and recoveries that met the recovery time objective.',
      formula: 'Recoveries meeting RTO ÷ Recoveries tested × 100',
      expr: '{met} ÷ {n} × 100',
      inputs: [IG('met', 'Met RTO', 'count', q => q.inf('rtoMet'), 'BCM / DR records'), IG('n', 'Recoveries tested', 'count', q => q.inf('rtoTests'), 'BCM / DR records', { den: true })],
      calc: v => pct(v.met, v.n),
      tgt: 95, warn: 90, crit: 80,
      src: ['BCM'], freq: 'Quarterly', owner: 'Head of Resilience (BCM)', ev: 'DR test reports.', incl: 'Quarterly DR tests on critical components; months without tests show n/a.', imp: 'Regulatory resilience expectations (UAE IA, CBUAE).',
      recs: 'components', drill: []
    });
    K(120, 'F', 'RPO Compliance', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of DR tests and recoveries that met the recovery point objective (data loss window).',
      formula: 'Recoveries meeting RPO ÷ Recoveries tested × 100',
      expr: '{met} ÷ {n} × 100',
      inputs: [IG('met', 'Met RPO', 'count', q => q.inf('rpoMet'), 'BCM / DR records'), IG('n', 'Recoveries tested', 'count', q => q.inf('rpoTests'), 'BCM / DR records', { den: true })],
      calc: v => pct(v.met, v.n),
      tgt: 98, warn: 95, crit: 90,
      src: ['BCM'], freq: 'Quarterly', owner: 'Head of Resilience (BCM)', ev: 'DR test reports.', incl: 'As KPI 119.', imp: 'Data loss tolerance for vector stores and agent memory.',
      recs: 'components', drill: []
    });
    K(121, 'F', 'Single Point of Failure Exposure', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Critical AI dependencies without redundancy at period end.',
      formula: 'Count of critical dependencies with an unmitigated single point of failure',
      expr: 'Count of unmitigated SPOFs among {tot} critical dependencies',
      inputs: [IG('n', 'Unmitigated SPOFs', 'count', q => q.deps().filter(d => d.spof && !(d.spofFixed != null && d.spofFixed <= q.last)).length, 'Dependency map (CMDB)'), IG('tot', 'Critical dependencies', 'count', q => q.deps().length, 'CMDB')],
      calc: v => v.n,
      tgt: 0, warn: 2, crit: 5,
      src: ['CMDB', 'BCM'], freq: 'Monthly', owner: 'Head of Infrastructure', ev: 'Architecture reviews.', incl: 'Third-party model endpoints included.', imp: 'One failure can stop multiple critical workflows.',
      recs: 'deps', drill: []
    });
    K(122, 'F', 'Untested DR Dependency Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of critical AI dependencies without a successful DR test in the trailing 12 months.',
      formula: 'Critical dependencies without passed DR test in 12 months ÷ Critical dependencies × 100',
      expr: '{u} ÷ {tot} × 100',
      inputs: [IG('u', 'Dependencies without a passed test (12 months)', 'count', q => q.deps().filter(d => !d.tests.some(t => t.pass && t.m <= q.last && t.m >= q.last - 11)).length, 'BCM / DR records'), IG('tot', 'Critical dependencies', 'count', q => q.deps().length, 'CMDB', { den: true })],
      calc: v => pct(v.u, v.tot),
      tgt: 5, warn: 15, crit: 30,
      src: ['BCM', 'CMDB'], freq: 'Monthly', owner: 'Head of Resilience (BCM)', ev: 'DR test register.', incl: 'Failed tests do not count as tested.', imp: 'Untested recovery is assumed to fail.',
      recs: 'deps', drill: []
    });
    K(123, 'F', 'Infrastructure Monitoring Coverage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of AI infrastructure assets sending metrics, logs and traces to monitoring.',
      formula: 'Monitored AI infrastructure assets ÷ AI infrastructure assets in CMDB × 100',
      expr: '{mon} ÷ {all} × 100',
      inputs: [IG('mon', 'Monitored assets', 'count', q => q.infL('monitored'), 'Monitoring platform'), IG('all', 'AI infrastructure assets (CMDB)', 'count', q => q.infL('assets'), 'CMDB', { den: true })],
      calc: v => pct(v.mon, v.all),
      tgt: 98, warn: 95, crit: 90,
      src: ['CMDB', 'K8S', 'DCGM'], freq: 'Weekly', owner: 'Head of Infrastructure', ev: 'CMDB reconciliation.', incl: 'Snapshot at period end.', imp: 'Unmonitored assets fail silently.',
      recs: 'components', drill: []
    });
    K(124, 'F', 'Infrastructure Outage Financial Exposure', {
      unit: 'AED', dir: 'down', cls: 'Estimated',
      def: 'Estimated business impact of infrastructure outages; the Finance-validated actual part is shown separately.',
      formula: 'Σ outages (impact minutes × cost per minute of affected workflows)',
      expr: 'Σ estimated impact over infrastructure outages (of which Finance-validated {act})',
      inputs: [IG('est', 'Estimated impact', 'AED', q => S(q.outI(), 'impactEst'), 'BIA × outage timeline'), IG('act', 'of which validated actual loss', 'AED', q => S(q.outI(), 'impactActual'), 'Finance ERP')],
      calc: v => v.est,
      tgt: nmT(50e3), warn: nmT(100e3), crit: nmT(200e3),
      src: ['ITSM', 'ERP'], owner: 'Head of Infrastructure', ev: 'Outage records linked to workflows, agents and tenants.', incl: 'Failover shortens impact minutes.', imp: 'Financial exposure of platform failures.',
      recs: 'outI', drill: []
    });

    // =====================================================================
    // G. AGENTIC AI SECURITY & OPERATIONAL KRIs
    // =====================================================================
    const SG = ['GW', 'ORCH', 'SIEM'];
    K(125, 'G', 'Shadow AI Applications', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Unsanctioned AI applications in active use at period end (discovered by CASB / SWG, not yet sanctioned or blocked).',
      formula: 'Count of discovered, unresolved shadow AI applications at period end',
      expr: 'Count of unresolved shadow AI apps at period end ({found} discovered in period)',
      inputs: [IG('n', 'Active shadow AI applications', 'count', q => q.shadowApps().length, 'CASB / SWG'), IG('found', 'Newly discovered in period', 'count', q => q.shadowAppsFound().length, 'CASB / SWG')],
      calc: v => v.n,
      tgt: cnt(10, 'users'), warn: cnt(20, 'users'), crit: cnt(35, 'users'),
      src: ['CASB'], owner: 'CISO', ev: 'CASB discovery records.', incl: 'Resolved = sanctioned with controls or blocked.', imp: 'Uncontrolled data flows to AI services.',
      recs: 'shadowApps', drill: ['bu', 'tn']
    });
    K(126, 'G', 'Shadow AI Agents', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Unregistered AI agents discovered through gateway keys, identity anomalies, egress or code scanning, still active at period end.',
      formula: 'Count of discovered, unresolved unregistered agents at period end',
      expr: 'Count of unresolved shadow agents at period end ({found} discovered in period)',
      inputs: [IG('n', 'Active shadow agents', 'count', q => q.shadowAgents().length, 'Gateway / IAM / NDR discovery'), IG('found', 'Newly discovered in period', 'count', q => q.shadowAgentsFound().length, 'Discovery pipeline')],
      calc: v => v.n,
      tgt: 0, warn: cnt(3, 'users'), crit: cnt(10, 'users'),
      src: ['GW', 'IAM', 'CASB'], owner: 'CISO', ev: 'Discovery evidence per agent.', incl: 'Resolved = registered and onboarded, or decommissioned.', imp: 'Agents with no owner, controls or traces.',
      recs: 'shadowAgents', drill: ['bu', 'tn']
    });
    K(127, 'G', 'Shadow AI Exposure Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of workforce users who accessed unsanctioned AI services in the last month of the period.',
      formula: 'Users accessing shadow AI ÷ Total users × 100',
      expr: '{u} ÷ {all} × 100',
      inputs: [IG('u', 'Users accessing shadow AI', 'count', q => q.tl('shadowUsers'), 'CASB / SWG'), IG('all', 'Workforce users', 'count', q => q.tl('users'), 'IAM directory', { den: true })],
      calc: v => pct(v.u, v.all),
      tgt: 3, warn: 5, crit: 10,
      src: ['CASB', 'IAM'], owner: 'CISO', ev: 'CASB user-activity reports.', incl: 'Last month of the period.', imp: 'Breadth of shadow AI behaviour.',
      recs: 'tenantMonths', drill: ['bu', 'tn']
    });
    K(128, 'G', 'Unauthorized Tool Calls', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Tool-call attempts outside the agent\'s authorised scope (denied or executed).',
      formula: 'Σ tool-call attempts outside authorised scope',
      expr: 'Σ unauthorized tool-call attempts (of {ex} executed tool calls)',
      inputs: [IA('n', 'Unauthorized tool-call attempts', 'count', 'toolUnAtt', 'MCP / tool gateway'), IA('ex', 'Executed tool calls (reference)', 'count', 'toolExec', 'MCP / tool gateway')],
      calc: v => v.n,
      tgt: q => q.a('toolExec') * 0.0005, warn: q => q.a('toolExec') * 0.001, crit: q => q.a('toolExec') * 0.002,
      thr: 'Relative: 5 / 10 / 20 attempts per 10,000 executed tool calls.',
      src: ['GW', 'ORCH'], owner: 'CISO', ev: 'Tool-gateway policy decisions.', incl: 'Includes MCP tools.', imp: 'Indicator of misconfiguration, prompt injection or abuse.',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });
    K(129, 'G', 'Successful Unauthorized Tool Calls', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Unauthorized tool calls that actually executed (control failure).',
      formula: 'Σ executed tool calls outside authorised scope',
      expr: 'Σ tool calls executed outside the approved scope',
      inputs: [IA('n', 'Executed unauthorized tool calls', 'count', 'toolUnOk', 'Tool gateway + trace analytics')],
      calc: v => v.n,
      tgt: 0, warn: 1, crit: q => Math.max(3, q.nm),
      thr: 'Zero tolerance: any occurrence is a warning; critical from 3 (or 1 per month).',
      src: SG, owner: 'CISO', ev: 'Trace with authorisation decision = deny-bypassed.', incl: 'Confirmed by SOC triage.', imp: 'Direct agentic security control failure.',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });
    K(130, 'G', 'Tool Authorization Compliance', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of executed tool calls that were authorised.',
      formula: 'Authorized executed tool calls ÷ All executed tool calls × 100',
      expr: '({ex} − {un}) ÷ {ex} × 100',
      inputs: [IA('ex', 'Executed tool calls', 'count', 'toolExec', 'Tool gateway', { den: true }), IA('un', 'Executed unauthorized', 'count', 'toolUnOk', 'Tool gateway')],
      calc: v => pct(v.ex - v.un, v.ex),
      tgt: 99.999, warn: 99.995, crit: 99.99,
      src: SG, owner: 'CISO', ev: 'Tool-gateway decisions.', incl: 'All executed calls.', imp: 'Integrity of agent permissions.',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });
    K(131, 'G', 'High-Risk Actions Blocked', {
      unit: 'count', dir: 'none', cls: 'Measured',
      def: 'Unauthorized high-risk agent actions blocked by policy (payments, access grants, deletions, containment without approval).',
      formula: 'Σ blocked high-risk unauthorized actions',
      expr: 'Σ blocked high-risk actions (of {att} unauthorized attempts)',
      inputs: [IA('b', 'Blocked high-risk actions', 'count', 'hrBlk', 'Policy engine'), IA('att', 'High-risk unauthorized attempts', 'count', 'hrAtt', 'Policy engine')],
      calc: v => v.b,
      thr: 'Volume indicator: effectiveness is rated in KPI 132.',
      src: SG, owner: 'CISO', ev: 'Policy-engine decisions.', incl: 'High-risk per policy taxonomy.', imp: 'Shows the guardrails are working.',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });
    K(132, 'G', 'High-Risk Block Effectiveness', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of unauthorized high-risk action attempts that were blocked.',
      formula: 'Blocked high-risk unauthorized actions ÷ High-risk unauthorized attempts × 100',
      expr: '{b} ÷ {att} × 100',
      inputs: [IA('b', 'Blocked', 'count', 'hrBlk', 'Policy engine'), IA('att', 'Attempts', 'count', 'hrAtt', 'Policy engine', { den: true })],
      calc: v => pct(v.b, v.att),
      tgt: 99, warn: 97, crit: 95,
      src: SG, owner: 'CISO', ev: 'Policy-engine decisions.', incl: 'Attempts = blocked + executed.', imp: 'Each miss is a potential unauthorized payment, grant or deletion.',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });
    K(133, 'G', 'Successful Prompt Injection', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Prompt-injection attempts (direct or indirect) that changed agent behaviour or caused a policy violation.',
      formula: 'Σ confirmed successful prompt injections',
      expr: 'Σ confirmed successful prompt injections',
      inputs: [IA('n', 'Successful prompt injections', 'count', 'piOk', 'Guardrail + SOC triage')],
      calc: v => v.n,
      tgt: 0, warn: 1, crit: q => Math.max(3, q.nm),
      src: SG, owner: 'CISO', ev: 'Trace with guardrail verdict and SOC confirmation.', incl: 'Red-team exercises are excluded.', imp: 'Agents acting on attacker instructions.',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });
    K(134, 'G', 'Prompt Injection Resistance', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of detected prompt-injection attempts neutralised.',
      formula: '(Detected attempts − Successful injections) ÷ Detected attempts × 100',
      expr: '({att} − {ok}) ÷ {att} × 100',
      inputs: [IA('att', 'Detected attempts', 'count', 'piAtt', 'Guardrail classifier', { den: true }), IA('ok', 'Successful injections', 'count', 'piOk', 'SOC triage')],
      calc: v => pct(v.att - v.ok, v.att),
      tgt: 99.9, warn: 99.5, crit: 99.0,
      src: SG, owner: 'CISO', ev: 'Guardrail logs.', incl: 'Attempts embedded in retrieved content count (indirect).', imp: 'Robustness of agents to manipulation.',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });
    K(135, 'G', 'Sensitive Data Exposure to AI', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'AI requests where classified sensitive data (PII, PHI, PCI, secrets) reached a model or tool without redaction.',
      formula: 'Σ requests with unredacted sensitive data reaching a model or tool',
      expr: 'Σ unredacted sensitive-data exposures (of {sr} sensitive-data requests)',
      inputs: [IA('n', 'Unredacted sensitive-data exposures', 'count', 'sensExpo', 'AI gateway DLP'), IA('sr', 'Requests containing sensitive data', 'count', 'sensReq', 'AI gateway DLP')],
      calc: v => v.n,
      tgt: q => q.a('sensReq') * 0.04, warn: q => q.a('sensReq') * 0.06, crit: q => q.a('sensReq') * 0.09,
      thr: 'Relative: 4% / 6% / 9% of sensitive-data requests.',
      src: ['GW', 'DLP'], owner: 'Data Protection Officer', ev: 'Gateway DLP verdicts.', incl: 'Permitted exposures (approved model and region) are included; violations are KPI 136.', imp: 'Privacy and regulatory exposure (PDPL, ADHICS, PCI).',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });
    K(136, 'G', 'Sensitive Data Policy Violation Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of sensitive-data requests that violated policy (unapproved model, region, tool or purpose).',
      formula: 'Sensitive-data policy violations ÷ Requests containing sensitive data × 100',
      expr: '{v} ÷ {sr} × 100',
      inputs: [IA('v', 'Policy violations', 'count', 'sensViol', 'AI gateway DLP'), IA('sr', 'Requests containing sensitive data', 'count', 'sensReq', 'AI gateway DLP', { den: true })],
      calc: v => pct(v.v, v.sr),
      tgt: 0.2, warn: 0.4, crit: 0.8,
      src: ['GW', 'DLP'], owner: 'Data Protection Officer', ev: 'DLP case dispositions.', incl: 'Confirmed violations only.', imp: 'Potential regulatory breach notifications.',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });
    K(137, 'G', 'Excess Privilege Agents', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Registered agents holding permissions beyond those used or approved (unused high-privilege scopes > 30 days).',
      formula: 'Count of agents with open excess-privilege findings at period end',
      expr: 'Count of agents with open excess-privilege findings',
      inputs: [IG('n', 'Agents with excess privilege', 'count', q => q.agents((a, m) => a.excessPriv && a.excessPriv[0] <= m && (a.excessPriv[1] == null || a.excessPriv[1] > m)).length, 'IAM entitlement analytics')],
      calc: v => v.n,
      tgt: 0, warn: cnt(3, 'agents'), crit: cnt(6, 'agents'),
      src: ['IAM', 'REG'], owner: 'Head of IAM', ev: 'Entitlement vs usage analysis.', incl: 'Includes MCP tool scopes.', imp: 'Blast radius if an agent is compromised.',
      recs: 'agentsPriv', drill: ['bu', 'tn']
    });
    K(138, 'G', 'Privilege Exposure Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of registered agents with excess privilege.',
      formula: 'Excess-privilege agents ÷ Registered agents × 100',
      expr: '{n} ÷ {reg} × 100',
      inputs: [IK('n', 137, 'Excess privilege agents (KPI 137)'), IG('reg', 'Registered agents', 'count', q => q.agents().length, 'AI agent registry', { den: true })],
      calc: v => pct(v.n, v.reg),
      tgt: 2, warn: 5, crit: 10,
      src: ['IAM', 'REG'], owner: 'Head of IAM', ev: 'Derived.', incl: 'Snapshot at period end.', imp: 'Least-privilege maturity.',
      recs: 'agentsPriv', drill: ['bu', 'tn']
    });
    K(139, 'G', 'Unregistered MCP Servers', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'MCP servers observed in agent traffic that are not in the MCP registry, active at period end.',
      formula: 'Count of active, unregistered MCP servers at period end',
      expr: 'Count of active unregistered MCP servers ({reg} registered)',
      inputs: [IG('n', 'Unregistered MCP servers', 'count', q => q.mcp(false).length, 'MCP / tool gateway discovery'), IG('reg', 'Registered MCP servers', 'count', q => q.mcp(true).length, 'MCP registry')],
      calc: v => v.n,
      tgt: 0, warn: 1, crit: 5,
      src: ['GW', 'REG'], owner: 'CISO', ev: 'Gateway connection logs.', incl: 'Developer and team-hosted servers included.', imp: 'Shadow tool supply chain for agents.',
      recs: 'mcp', drill: ['bu', 'tn']
    });
    K(140, 'G', 'Unauthorized Agent-to-Agent Delegation', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Agent-to-agent delegations outside the approved delegation graph.',
      formula: 'Σ delegations without an approved delegation policy',
      expr: 'Σ delegations outside the approved delegation graph',
      inputs: [IA('n', 'Unauthorized delegations', 'count', 'a2aUn', 'Agent-to-agent telemetry')],
      calc: v => v.n,
      tgt: 0, warn: nmT(2), crit: nmT(5),
      src: ['ORCH'], owner: 'Head of AI Governance', ev: 'A2A spans with policy decision.', incl: 'Production only.', imp: 'Privilege escalation through delegation chains.',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });
    K(141, 'G', 'Agents Without Kill Switch', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Registered agents without an implemented kill switch at period end.',
      formula: 'Count of registered agents with no implemented kill switch',
      expr: 'Count of registered agents without a kill switch',
      inputs: [IG('n', 'Agents without kill switch', 'count', q => q.agents((a, m) => a.killSwitchFrom == null || a.killSwitchFrom > m).length, 'AI agent registry')],
      calc: v => v.n,
      tgt: 0, warn: 2, crit: 6,
      src: ['REG'], owner: 'Head of AI Governance', ev: 'Registry control attributes.', incl: 'Kill switch = tested ability to halt the agent and revoke its credentials within 5 minutes.', imp: 'No way to stop a misbehaving agent quickly.',
      recs: 'agentsKs', drill: ['bu', 'tn']
    });
    K(142, 'G', 'Agent Kill Switch Coverage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of registered agents with an implemented kill switch whose latest quarterly drill did not fail (switches awaiting their first drill count as covered).',
      formula: 'Agents with kill switch and no failed latest drill ÷ Registered agents × 100',
      expr: '{ok} ÷ {reg} × 100',
      inputs: [IG('ok', 'Agents with kill switch & no failed latest drill', 'count', q => { q.touch('ksDrills'); return q.agents((a, m) => { if (a.killSwitchFrom == null || a.killSwitchFrom > m) return false; const d = lastDrill(a, m); return !d || d.pass; }).length; }, 'Kill-switch drill log'), IG('reg', 'Registered agents', 'count', q => q.agents().length, 'AI agent registry', { den: true })],
      calc: v => pct(v.ok, v.reg),
      tgt: 100, warn: 95, crit: 85,
      src: ['REG', 'ORCH'], owner: 'Head of AI Governance', ev: 'Quarterly drill results.', incl: 'A failed latest drill = not covered until re-tested.', imp: 'Assured ability to halt agents.',
      recs: 'agentsKs', drill: ['bu', 'tn']
    });
    K(143, 'G', 'Agents Without Owners', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Registered agents without an accountable business owner at period end.',
      formula: 'Count of registered agents with no current owner',
      expr: 'Count of registered agents without a current owner',
      inputs: [IG('n', 'Agents without owner', 'count', q => q.agents((a, m) => a.ownerUntil != null && a.ownerUntil <= m).length, 'AI agent registry / HR leavers')],
      calc: v => v.n,
      tgt: 0, warn: 1, crit: 3,
      src: ['REG', 'HR'], owner: 'Head of AI Governance', ev: 'Registry joined with HR leaver feed.', incl: 'Owner who left or moved role without reassignment.', imp: 'No accountability for agent behaviour.',
      recs: 'agentsOwner', drill: ['bu', 'tn']
    });
    K(144, 'G', 'Agent Identity Coverage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of registered agents with a unique managed workload identity (no shared API keys).',
      formula: 'Agents with managed workload identity ÷ Registered agents × 100',
      expr: '{id} ÷ {reg} × 100',
      inputs: [IG('id', 'Agents with managed identity', 'count', q => q.agents((a, m) => a.identityFrom <= m).length, 'IAM / workload identity'), IG('reg', 'Registered agents', 'count', q => q.agents().length, 'AI agent registry', { den: true })],
      calc: v => pct(v.id, v.reg),
      tgt: 100, warn: 95, crit: 90,
      src: ['IAM', 'REG'], owner: 'Head of IAM', ev: 'Identity provider records.', incl: 'Shared keys = not covered.', imp: 'Attribution and revocation of agent actions.',
      recs: 'agentsId', drill: ['bu', 'tn']
    });
    K(145, 'G', 'Agent Trace Coverage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of agent runs with a complete required trace (User → Agent → Session → Model → Tool → Action → Resource → Authorization → Result).',
      formula: 'Agent runs with complete required trace ÷ All observed agent runs × 100',
      expr: '{t} ÷ {r} × 100',
      inputs: [IA('t', 'Runs with complete trace', 'count', 'traced', 'OpenTelemetry collector'), IA('r', 'Observed agent runs', 'count', 'runs', 'Orchestrator', { den: true })],
      calc: v => pct(v.t, v.r),
      tgt: 99, warn: 97, crit: 95,
      src: ['ORCH', 'SIEM'], owner: 'CISO', ev: 'Trace completeness checks.', incl: 'All nine trace attributes are required.', imp: 'Forensics and accountability depend on it.',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });
    K(146, 'G', 'Cross-Border AI Data Transfers', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'AI requests carrying personal or sensitive data to model endpoints outside the UAE; rated on unapproved transfers.',
      formula: 'Σ sensitive-data requests to non-UAE model endpoints (rated on those without an approved transfer mechanism)',
      expr: 'Σ sensitive-data requests to non-UAE endpoints ({un} without approval)',
      inputs: [IA('xb', 'Cross-border sensitive-data requests', 'count', 'xb', 'AI gateway + DLP'), IA('un', 'without approved transfer mechanism', 'count', 'xbUn', 'Data-transfer register')],
      calc: v => v.xb,
      statusOf: v => v.un, tgt: 0, warn: 1, crit: 1,
      thr: 'Rated on unapproved transfers: any is a warning, more than one is critical.',
      src: ['GW', 'DLP'], owner: 'Data Protection Officer', ev: 'Endpoint region per request, transfer approvals.', incl: 'Approved transfers (contractual safeguards) are counted but not rated.', imp: 'Data-residency obligations (PDPL, sector rules).',
      recs: 'agentsXb', drill: ['bu', 'tn', 'agent']
    });
    K(147, 'G', 'RAG/Memory Poisoning Incidents', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Confirmed incidents of malicious content injected into retrieval corpora or agent memory.',
      formula: 'Count of confirmed RAG / memory poisoning incidents',
      expr: 'Count of confirmed RAG / memory poisoning incidents',
      inputs: [IG('n', 'RAG / memory poisoning incidents', 'count', q => q.incidents().filter(x => x.type === 'RAG / memory poisoning').length, 'SIEM / SOAR')],
      calc: v => v.n,
      tgt: 0, warn: 1, crit: q => Math.max(3, Math.ceil(q.nm / 2)),
      src: ['SIEM', 'SOAR'], owner: 'CISO', ev: 'Incident records with corpus evidence.', incl: 'Confirmed incidents only.', imp: 'Corrupted knowledge leads to wrong agent decisions.',
      recs: 'incidentsRag', drill: ['bu', 'tn']
    });
    K(148, 'G', 'Agent Security Evaluation Pass Rate', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of registered agents whose latest security evaluation (red team, injection suite, tool abuse tests) passed.',
      formula: 'Agents whose latest security evaluation passed ÷ Agents evaluated × 100',
      expr: '{p} ÷ {n} × 100',
      inputs: [IG('p', 'Agents passing latest evaluation', 'count', q => q.agents((a, m) => { const e = latestEval(a, m); return !!(e && e.pass); }).length, 'Evaluation pipeline'), IG('n', 'Agents evaluated', 'count', q => q.agents((a, m) => !!latestEval(a, m)).length, 'Evaluation pipeline', { den: true })],
      calc: v => pct(v.p, v.n),
      tgt: 95, warn: 90, crit: 80,
      src: ['EVAL'], owner: 'Head of AppSec', ev: 'Evaluation reports.', incl: 'Re-evaluated every 6 months and on major change.', imp: 'Pre-production assurance.',
      recs: 'agentsEval', drill: ['bu', 'tn']
    });
    K(149, 'G', 'Critical Agent Security Gaps', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Open Critical-severity security findings on agents at period end.',
      formula: 'Count of open Critical agent security findings at period end',
      expr: 'Count of open Critical agent findings at period end',
      inputs: [IG('n', 'Open critical findings', 'count', q => q.agentFindings().filter(x => x.sev === 'Critical' && x.m <= q.last && (x.closed == null || x.closed > q.last)).length, 'Evaluation / AppSec findings')],
      calc: v => v.n,
      tgt: 0, warn: 2, crit: 5,
      src: ['EVAL', 'GRC'], owner: 'Head of AppSec', ev: 'Finding tracker.', incl: 'Accepted risks are tracked as exceptions (KPI 164).', imp: 'Exploitable weaknesses in production agents.',
      recs: 'agentFindings', drill: ['bu', 'tn']
    });
    K(150, 'G', 'Unsafe Autonomous Execution Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of autonomous action executions that violated safety policy (outside guardrails, missing approval).',
      formula: 'Unsafe autonomous executions ÷ Autonomous executions × 100',
      expr: '{u} ÷ {a} × 100',
      inputs: [IA('u', 'Unsafe autonomous executions', 'count', 'unsafeAuto', 'Policy engine + trace analytics'), IA('a', 'Autonomous executions', 'count', 'autoExec', 'Orchestrator', { den: true })],
      calc: v => pct(v.u, v.a),
      tgt: 0.01, warn: 0.03, crit: 0.05,
      src: SG, owner: 'Head of AI Governance', ev: 'Post-hoc policy evaluation of traces.', incl: 'Autonomous executions only.', imp: 'Safety of autonomy at scale.',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });

    // =====================================================================
    // H. AGENT GOVERNANCE, CONTROL IMPLEMENTATION & COMPLIANCE
    // =====================================================================
    const SH = ['GRC', 'REG'];
    K(151, 'H', 'AI Governance Coverage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of known AI agents (registered + discovered shadow) under formal governance (approved use case, risk tier, accountable owner).',
      formula: 'Governed agents ÷ (Registered agents + Active shadow agents) × 100',
      expr: '{g} ÷ ({reg} + {sh}) × 100',
      inputs: [
        IG('g', 'Governed agents', 'count', q => q.agents((a, m) => a.governedFrom <= m && !(a.ownerUntil != null && a.ownerUntil <= m)).length, 'AI agent registry'),
        IG('reg', 'Registered agents', 'count', q => q.agents().length, 'AI agent registry', { den: true }),
        IG('sh', 'Active shadow agents', 'count', q => q.shadowAgents().length, 'Discovery pipeline', { den: true })
      ],
      calc: v => pct(v.g, v.reg + v.sh),
      tgt: 95, warn: 85, crit: 75,
      src: SH.concat(['GW']), owner: 'Head of AI Governance', ev: 'Registry approval records.', incl: 'Shadow agents count as ungoverned.', imp: 'ISO/IEC 42001 AI management system scope.',
      recs: 'agents', drill: ['bu', 'tn']
    });
    K(152, 'H', 'Agent Risk Assessment Coverage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of registered agents with a risk assessment completed in the last 12 months.',
      formula: 'Agents with current (≤ 12 months) risk assessment ÷ Registered agents × 100',
      expr: '{a} ÷ {reg} × 100',
      inputs: [IG('a', 'Agents with current assessment', 'count', q => q.agents((a, m) => a.assessments.some(x => x <= m && x >= m - 11)).length, 'GRC platform'), IG('reg', 'Registered agents', 'count', q => q.agents().length, 'AI agent registry', { den: true })],
      calc: v => pct(v.a, v.reg),
      tgt: 100, warn: 95, crit: 85,
      src: SH, owner: 'Head of AI Governance', ev: 'Assessment records.', incl: 'Expired assessments do not count.', imp: 'NIST AI RMF "Map" and ISO 42001 risk process.',
      recs: 'agentsRa', drill: ['bu', 'tn']
    });
    K(153, 'H', 'Agent Threat Modeling Coverage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of registered agents with a threat model (MITRE ATLAS / OWASP agentic threats).',
      formula: 'Agents with approved threat model ÷ Registered agents × 100',
      expr: '{t} ÷ {reg} × 100',
      inputs: [IG('t', 'Agents with threat model', 'count', q => q.agents((a, m) => a.threatModelFrom != null && a.threatModelFrom <= m).length, 'AppSec threat-model repository'), IG('reg', 'Registered agents', 'count', q => q.agents().length, 'AI agent registry', { den: true })],
      calc: v => pct(v.t, v.reg),
      tgt: 95, warn: 85, crit: 70,
      src: ['GRC', 'EVAL'], owner: 'Head of AppSec', ev: 'Threat-model documents.', incl: 'Approved threat models only.', imp: 'Design-time security.',
      recs: 'agentsTm', drill: ['bu', 'tn']
    });
    K(154, 'H', 'Agent Security Control Implementation', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of applicable AI security controls implemented (implementation, not effectiveness).',
      formula: 'Implemented applicable control instances ÷ Applicable control instances × 100',
      expr: '{i} ÷ {a} × 100',
      inputs: [IG('i', 'Implemented control instances', 'count', q => q.ctlInst().filter(x => x.implFrom != null && x.implFrom <= q.last).length, 'GRC platform'), IG('a', 'Applicable control instances', 'count', q => q.ctlInst().length, 'GRC platform (after applicability)', { den: true })],
      calc: v => pct(v.i, v.a),
      tgt: 95, warn: 85, crit: 75,
      src: SH, owner: 'Head of GRC', ev: 'Control implementation evidence.', incl: 'Framework applicability is determined per BU before scoring; non-applicable controls are excluded.', imp: 'Compliance posture.',
      recs: 'controls', drill: ['bu', 'fw', 'ctl']
    });
    K(155, 'H', 'Agent Control Effectiveness', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of tested control instances whose latest test (within 12 months) was effective. Measured separately from implementation.',
      formula: 'Control instances tested effective ÷ Control instances tested × 100',
      expr: '{e} ÷ {t} × 100',
      inputs: [IG('e', 'Tested effective', 'count', q => q.ctlInst().filter(x => { const t = latestTest(x, q.last); return t && t.effective; }).length, 'Control testing (2nd / 3rd line)'), IG('t', 'Tested in last 12 months', 'count', q => q.ctlInst().filter(x => latestTest(x, q.last)).length, 'Control testing', { den: true })],
      calc: v => pct(v.e, v.t),
      tgt: 90, warn: 80, crit: 70,
      src: SH, owner: 'Head of GRC', ev: 'Test scripts and results.', incl: 'Untested controls are excluded here and reported as an assurance gap.', imp: 'Implemented is not the same as working.',
      recs: 'controls', drill: ['bu', 'fw', 'ctl']
    });
    K(156, 'H', 'AI Compliance Gap Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of applicable control requirements not met (not implemented, or latest test ineffective).',
      formula: '(Not implemented + Implemented but tested ineffective) ÷ Applicable control instances × 100',
      expr: '({ni} + {ie}) ÷ {a} × 100',
      inputs: [
        IG('ni', 'Not implemented', 'count', q => q.ctlInst().filter(x => !(x.implFrom != null && x.implFrom <= q.last)).length, 'GRC platform'),
        IG('ie', 'Implemented but latest test ineffective', 'count', q => q.ctlInst().filter(x => x.implFrom != null && x.implFrom <= q.last && (() => { const t = latestTest(x, q.last); return t && !t.effective; })()).length, 'Control testing'),
        IG('a', 'Applicable control instances', 'count', q => q.ctlInst().length, 'GRC platform', { den: true })
      ],
      calc: v => pct(v.ni + v.ie, v.a),
      tgt: 10, warn: 20, crit: 30,
      src: SH, owner: 'Head of GRC', ev: 'Derived from KPIs 154-155.', incl: 'Applicability first; then gaps.', imp: 'Regulatory findings exposure.',
      recs: 'controls', drill: ['bu', 'fw', 'ctl']
    });
    K(157, 'H', 'AI Audit Finding Closure', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of AI audit findings due in the period that were closed on or before their due date.',
      formula: 'Findings closed on time ÷ Findings due in period × 100',
      expr: '{c} ÷ {d} × 100',
      inputs: [IG('c', 'Closed on time', 'count', q => q.findings().filter(x => x.due >= q.from && x.due <= q.to && x.closed != null && x.closed <= x.due).length, 'GRC findings tracker'), IG('d', 'Findings due in period', 'count', q => q.findings().filter(x => x.due >= q.from && x.due <= q.to).length, 'GRC findings tracker', { den: true })],
      calc: v => pct(v.c, v.d),
      tgt: 90, warn: 80, crit: 70,
      src: ['GRC'], owner: 'Head of GRC', ev: 'Finding closure evidence validated by Internal Audit.', incl: 'Due dates by severity: Critical 1, High 2, others 3 months.', imp: 'Audit committee confidence.',
      recs: 'findings', drill: ['bu', 'fw', 'sev']
    });
    K(158, 'H', 'AI Third-Party Assessment Coverage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of AI vendors and model providers with a completed security and privacy assessment.',
      formula: 'AI third parties assessed ÷ AI third parties onboarded × 100',
      expr: '{a} ÷ {n} × 100',
      inputs: [IG('a', 'Assessed', 'count', q => q.vendors().filter(v => v.assessedFrom != null && v.assessedFrom <= q.last).length, 'TPRM'), IG('n', 'Onboarded AI third parties', 'count', q => q.vendors().length, 'TPRM', { den: true })],
      calc: v => pct(v.a, v.n),
      tgt: 100, warn: 90, crit: 80,
      src: ['TPRM'], owner: 'Head of Third-Party Risk', ev: 'Assessment questionnaires and reports.', incl: 'Enterprise-wide vendor population.', imp: 'Supply-chain and data-processing risk.',
      recs: 'vendors', drill: []
    });
    K(159, 'H', 'AI Incident Response Readiness', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Completion of the AI incident-response readiness checklist (playbooks, drills, contacts, forensics, notification).',
      formula: 'Readiness items completed ÷ Required readiness items × 100',
      expr: '{c} ÷ {n} × 100',
      inputs: [IG('c', 'Items completed', 'count', q => q.irItems().filter(x => x.from <= q.last).length, 'GRC / DFIR'), IG('n', 'Required items', 'count', q => q.irItems().length, 'AI IR standard', { den: true })],
      calc: v => pct(v.c, v.n),
      tgt: 90, warn: 75, crit: 60,
      src: ['GRC'], owner: 'DFIR Lead', ev: 'Checklist evidence per BU.', incl: '10 items per BU.', imp: 'Ability to respond to agentic incidents.',
      recs: 'irItems', drill: ['bu']
    });
    K(160, 'H', 'Security Telemetry Coverage', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of registered agents sending required security telemetry to the SIEM.',
      formula: 'Agents with SIEM telemetry ÷ Registered agents × 100',
      expr: '{t} ÷ {reg} × 100',
      inputs: [IG('t', 'Agents with SIEM telemetry', 'count', q => q.agents((a, m) => a.siemFrom <= m).length, 'SIEM data-source inventory'), IG('reg', 'Registered agents', 'count', q => q.agents().length, 'AI agent registry', { den: true })],
      calc: v => pct(v.t, v.reg),
      tgt: 98, warn: 95, crit: 90,
      src: ['SIEM', 'REG'], owner: 'Head of SOC', ev: 'SIEM ingestion health.', incl: 'Required fields: identity, tool calls, policy decisions, data classifications.', imp: 'Detection depends on telemetry.',
      recs: 'agentsSiem', drill: ['bu', 'tn']
    });
    K(161, 'H', 'Detection Coverage for AI Threats', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of applicable MITRE ATLAS-aligned techniques with a validated detection.',
      formula: 'Techniques with validated detection ÷ Applicable techniques × 100',
      expr: '{d} ÷ {n} × 100',
      inputs: [IG('d', 'Techniques with validated detection', 'count', q => q.atlas().filter(x => x.from <= q.last).length, 'Detection engineering'), IG('n', 'Applicable techniques', 'count', q => q.atlas().length, 'ATLAS mapping', { den: true })],
      calc: v => pct(v.d, v.n),
      tgt: 80, warn: 65, crit: 50,
      src: ['SIEM', 'GRC'], owner: 'Head of SOC', ev: 'Detection test results (purple team).', incl: 'Validated = fired in a controlled test.', imp: 'Blind spots for AI-specific attacks.',
      recs: 'atlas', drill: []
    });
    K(162, 'H', 'AI Supply Chain Assurance', {
      unit: '%', dir: 'up', cls: 'Measured',
      def: 'Share of AI supply-chain components (models, datasets, containers / packages) with verified provenance (signed, AIBOM / SBOM, scanned).',
      formula: 'Components with verified provenance ÷ AI supply-chain components × 100',
      expr: '{v} ÷ {n} × 100',
      inputs: [IG('v', 'Components with verified provenance', 'count', q => q.supply().filter(s => s.provFrom != null && s.provFrom <= q.last).length, 'Artifact registry'), IG('n', 'AI supply-chain components', 'count', q => q.supply().length, 'Artifact registry', { den: true })],
      calc: v => pct(v.v, v.n),
      tgt: 90, warn: 80, crit: 65,
      src: ['VULN', 'EVAL'], owner: 'Head of AppSec', ev: 'Signature and AIBOM verification logs.', incl: 'Enterprise-wide artifact population.', imp: 'Poisoned or backdoored models and packages.',
      recs: 'supply', drill: []
    });
    K(163, 'H', 'AI Control Drift Rate', {
      unit: '%', dir: 'down', cls: 'Measured',
      def: 'Share of implemented control instances that drifted from their approved baseline configuration in the period.',
      formula: 'Implemented control instances with drift in period ÷ Implemented control instances × 100',
      expr: '{d} ÷ {i} × 100',
      inputs: [IG('d', 'Instances with drift in period', 'count', q => q.ctlInst().filter(x => x.implFrom != null && x.implFrom <= q.last && x.drift.some(m => m >= q.from && m <= q.to)).length, 'Configuration monitoring'), IG('i', 'Implemented instances', 'count', q => q.ctlInst().filter(x => x.implFrom != null && x.implFrom <= q.last).length, 'GRC platform', { den: true })],
      calc: v => pct(v.d, v.i),
      tgt: q => 2 * Math.min(q.nm, 6) / 3, warn: q => 5 * Math.min(q.nm, 6) / 3, crit: q => 10 * Math.min(q.nm, 6) / 3,
      thr: 'Per-quarter tolerance of 2% / 5% / 10%, pro-rated to the period length (capped at two quarters).',
      src: ['GRC', 'CMDB'], owner: 'Head of GRC', ev: 'Policy-as-code drift detection.', incl: 'Any drift event in the period counts once per instance.', imp: 'Controls silently weakening.',
      recs: 'controls', drill: ['bu', 'fw', 'ctl']
    });
    K(164, 'H', 'AI Exception Aging', {
      unit: 'days', dir: 'down', cls: 'Measured',
      def: 'Average age of open AI risk exceptions at period end.',
      formula: 'Σ age of open exceptions (days) ÷ Open exceptions',
      expr: '{age} ÷ {n}',
      inputs: [
        IG('age', 'Σ age of open exceptions (days)', 'days', q => S(openEx(q), x => (endDate(q.last) - new Date(Date.UTC(D.MONTHS[x.m].y, D.MONTHS[x.m].mo, x.day))) / 864e5), 'GRC exception register'),
        IG('n', 'Open exceptions', 'count', q => openEx(q).length, 'GRC exception register', { den: true }),
        IG('exp', 'Open past expiry', 'count', q => openEx(q).filter(x => x.expires < q.last).length, 'GRC exception register')
      ],
      calc: v => div(v.age, v.n),
      tgt: 45, warn: 75, crit: 120,
      src: ['GRC'], owner: 'Head of GRC', ev: 'Exception register with approvals.', incl: 'Open at period end.', imp: 'Long-lived exceptions become permanent risk.',
      recs: 'exceptions', drill: ['bu', 'sev']
    });
    function openEx(q) { return memo(q, 'openEx', () => q.exceptions().filter(x => x.m <= q.last && (x.closed == null || x.closed > q.last))); }

    // =====================================================================
    // X. COMPOSITE EXECUTIVE INDICES (explicit scales and weights)
    // =====================================================================
    function nr(q, id) {
      const k = E.REG[id];
      const v = q.kpi(id);
      if (String(id).charAt(0) === 'X') return v;
      const sv = E.statusValue(k, v, q);
      return E.normRisk(k.dir, sv, E.resolve(k.tgt, q), E.resolve(k.warn, q), E.resolve(k.crit, q));
    }
    function groupRisk(q, ids) {
      const vals = ids.map(id => nr(q, id)).filter(x => x != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    function composite(id, name, groups, o) {
      const inputs = groups.map((g, i) => ({
        k: 'g' + i, label: g.label + ' (weight ' + Math.round(g.w * 100) + '%)', unit: 'score', w: g.w, ids: g.ids,
        get: q => groupRisk(q, g.ids), src: g.ids.map(x => (String(x).charAt(0) === 'X' ? x : 'KPI ' + x)).join(', ')
      }));
      K(id, 'X', name, Object.assign({
        unit: 'score', cls: 'Composite', dir: 'down', inputs: inputs, groups: groups,
        expr: groups.map((g, i) => '{g' + i + '} × ' + g.w.toFixed(2)).join(' + '),
        calc: v => { let s = 0, w = 0; groups.forEach((g, i) => { const x = v['g' + i]; if (x != null) { s += x * g.w; w += g.w; } }); return w ? s / w : null; },
        incl: 'Each KPI is normalised to a 0-100 risk scale: 0 = at or better than target, 50 = warning threshold, 100 = critical threshold or worse (linear in between). Groups average their KPIs; the index is the weighted average of groups. Missing groups are excluded and weights re-normalised.'
      }, o));
    }
    composite('X6', 'Agentic Security Risk Score', [
      { label: 'Successful unauthorized tool calls', ids: [129], w: 0.15 }, { label: 'High-risk block effectiveness', ids: [132], w: 0.15 },
      { label: 'Successful prompt injection', ids: [133], w: 0.15 }, { label: 'Sensitive-data violation rate', ids: [136], w: 0.10 },
      { label: 'Privilege exposure rate', ids: [138], w: 0.10 }, { label: 'Kill-switch coverage', ids: [142], w: 0.10 },
      { label: 'Shadow AI exposure rate', ids: [127], w: 0.10 }, { label: 'Unsafe autonomous execution', ids: [150], w: 0.05 },
      { label: 'Unregistered MCP servers', ids: [139], w: 0.05 }, { label: 'Agent trace coverage', ids: [145], w: 0.05 }
    ], {
      def: 'Weighted, normalised risk across the key agentic AI security KRIs (0 = no risk, 100 = all KRIs at critical).',
      formula: 'Σ (normalised risk of KRI × weight) ÷ Σ weights',
      tgt: 30, warn: 50, crit: 70, src: ['GW', 'ORCH', 'IAM', 'CASB', 'DLP'], owner: 'CISO',
      ev: 'Component KRIs (domain G).', imp: 'Single view of agentic attack-surface risk for the Board Risk Committee.', drill: ['bu', 'tn']
    });
    composite('X2', 'Agentic Enterprise Risk Index', [
      { label: 'Agent security', ids: ['X6'], w: 0.30 },
      { label: 'Model availability', ids: [71, 82, 83, 84], w: 0.20 },
      { label: 'Infrastructure resilience', ids: [101, 109, 118, 119, 122], w: 0.20 },
      { label: 'Token / cost exposure', ids: [52, 54, 68, 97], w: 0.15 },
      { label: 'Governance', ids: [151, 154, 155, 156, 161], w: 0.15 }
    ], {
      def: 'Weighted average of normalised risks across agent security, model availability, infrastructure resilience, token / cost exposure and governance.',
      formula: 'Σ (group risk × weight) ÷ Σ weights; group risk = mean normalised risk of its KPIs',
      tgt: 30, warn: 45, crit: 60, src: ['GW', 'APM', 'DCGM', 'GRC', 'BILL'], owner: 'CISO with CIO',
      ev: 'Component KPIs across domains C-H.', imp: 'Headline risk of operating an agentic enterprise.', drill: ['bu', 'tn']
    });
    composite('X1', 'Enterprise Cyber Risk Score', [
      { label: 'Residual loss exposure vs appetite', ids: [4], w: 0.30 },
      { label: 'Incident response', ids: [14, 15], w: 0.20 },
      { label: 'Control effectiveness', ids: [155, 161], w: 0.15 },
      { label: 'Agentic enterprise risk', ids: ['X2'], w: 0.35 }
    ], {
      def: 'Enterprise-level cyber risk: residual loss exposure, incident response performance, control effectiveness and agentic enterprise risk, on a 0-100 scale (lower is better).',
      formula: 'Σ (group risk × weight) ÷ Σ weights',
      tgt: 20, warn: 40, crit: 60, src: ['RISK', 'SOAR', 'GRC'], owner: 'CISO',
      thr: 'Bands: 0-20 low (target), 20-40 moderate, 40-60 high (warning), 60+ critical.',
      ev: 'Component KPIs.', imp: 'The single number the Board uses to track cyber risk.', drill: ['bu', 'tn']
    });
    K('X3', 'X', 'Major Cyber Incidents Mitigated', {
      unit: 'count', dir: 'up', cls: 'Measured',
      def: 'Major incidents (Critical, or High with potential loss ≥ AED 1M) mitigated before material impact; rated on the mitigation rate.',
      formula: 'Count of major incidents mitigated (rated on mitigated ÷ total major × 100)',
      expr: 'Count of major incidents mitigated ({mit} of {tot})',
      inputs: [IG('mit', 'Major incidents mitigated', 'count', q => q.incidents().filter(x => x.major && x.mitigated).length, 'SOAR'), IG('tot', 'Major incidents', 'count', q => q.incidents().filter(x => x.major).length, 'SIEM / SOAR', { den: true })],
      calc: v => v.mit,
      statusOf: v => pct(v.mit, v.tot), tgt: 95, warn: 90, crit: 80,
      thr: 'Rated on the major-incident mitigation rate: 95% target, 90% warning, 80% critical.',
      src: ['SIEM', 'SOAR'], owner: 'Head of SOC', ev: 'Major incident reports.', incl: 'Major = Critical severity, or High severity with potential loss ≥ AED 1M.', imp: 'Board-reportable incidents.',
      recs: 'incidentsMajor', drill: ['bu', 'tn']
    });
    K('X4', 'X', 'Token Quota Exceeded Events', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Token budget scopes exceeded plus provider quota exhaustions.',
      formula: 'Token budget exceeded count (KPI 55) + Provider quota exhaustion (KPI 93)',
      expr: '{b} + {p}',
      inputs: [IK('b', 55, 'Token budget exceeded (KPI 55)'), IK('p', 93, 'Provider quota exhaustion (KPI 93)')],
      calc: v => v.b + v.p,
      tgt: 0, warn: q => Math.max(2, Math.ceil(q.nm * 0.5)), crit: q => Math.max(5, q.nm * 1.5),
      src: ['GW', 'QUOTA'], owner: 'AI FinOps Lead', ev: 'Budget and quota events.', incl: 'Rate-limit throttling episodes are separate (KPIs 91-92).', imp: 'Hard limits that stop or slow agents.',
      recs: 'tenantMonths', drill: ['bu', 'tn']
    });
    K('X5', 'X', 'High-Risk Unauthorized Agent Actions', {
      unit: 'count', dir: 'down', cls: 'Measured',
      def: 'Unauthorized high-risk agent actions that executed (attempts minus blocked).',
      formula: 'High-risk unauthorized attempts − Blocked',
      expr: '{att} − {blk}',
      inputs: [IA('att', 'High-risk unauthorized attempts', 'count', 'hrAtt', 'Policy engine'), IA('blk', 'Blocked by policy', 'count', 'hrBlk', 'Policy engine')],
      calc: v => v.att - v.blk,
      tgt: 0, warn: 1, crit: q => Math.max(3, q.nm),
      src: ['GW', 'ORCH', 'SIEM'], owner: 'CISO', ev: 'Policy-engine and trace evidence.', incl: 'Executed actions confirmed by SOC.', imp: 'Each one is a potential unauthorized payment, grant or deletion.',
      recs: 'agents', drill: ['bu', 'tn', 'agent']
    });

    return L;
  }

  return { build: build, DOMAINS: DOMAINS, DOMAIN_DEFAULTS: DOMAIN_DEFAULTS };
}));
