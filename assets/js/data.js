/*!
 * CISO Executive Agentic Enterprise Dashboard - synthetic data layer
 * ------------------------------------------------------------------
 * EVERY VALUE PRODUCED BY THIS MODULE IS SYNTHETIC SAMPLE DATA.
 * It is generated deterministically from a fixed seed, so every reload,
 * export and validation test sees identical numbers. In production this
 * module is replaced by the normalized KPI data layer described in
 * docs/03-data-architecture.md (same fact/record shapes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CISO_DATA = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------
  // Deterministic pseudo-random helpers
  // ------------------------------------------------------------------
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const SEED = 'CISO-EAED-SYNTHETIC-v1';
  function RNG(label) {
    const u = mulberry32(xmur3(SEED + '|' + label)());
    const R = {
      u: u,
      range: (a, b) => a + (b - a) * u(),
      int: (a, b) => a + Math.floor((b - a + 1) * u()),
      chance: p => u() < p,
      pick: arr => arr[Math.floor(u() * arr.length)],
      jit: p => 1 + (u() * 2 - 1) * p,
      norm: () => {
        let a = 0, b = 0;
        while (a === 0) a = u();
        while (b === 0) b = u();
        return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
      },
      logn: (median, sigma) => median * Math.exp(sigma * R.norm()),
      pois: lam => {
        if (!(lam > 0)) return 0;
        if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * R.norm()));
        const L = Math.exp(-lam);
        let k = 0, p = 1;
        do { k++; p *= u(); } while (p > L);
        return k - 1;
      },
      binom: (n, p) => {
        n = Math.max(0, Math.round(n));
        if (n === 0 || !(p > 0)) return 0;
        if (p >= 1) return n;
        if (n < 40) { let k = 0; for (let i = 0; i < n; i++) if (u() < p) k++; return k; }
        const mean = n * p;
        if (mean < 15) return Math.min(n, R.pois(mean));
        const sd = Math.sqrt(mean * (1 - p));
        return Math.min(n, Math.max(0, Math.round(mean + sd * R.norm())));
      },
      wpick: (items, w) => {
        const s = w.reduce((a, b) => a + b, 0);
        let x = u() * s;
        for (let i = 0; i < items.length; i++) { x -= w[i]; if (x <= 0) return items[i]; }
        return items[items.length - 1];
      },
      shuffle: arr => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(u() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
      }
    };
    return R;
  }
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const round2 = x => Math.round(x * 100) / 100;

  // ------------------------------------------------------------------
  // Calendar: Nov 2024 .. Oct 2026 (24 closed months) + Nov 2026 MTD
  // ------------------------------------------------------------------
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS = [];
  for (let i = 0; i < 24; i++) {
    const y = 2024 + Math.floor((10 + i) / 12), mo = (10 + i) % 12;
    const days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    MONTHS.push({ i: i, y: y, mo: mo, days: days, key: y + '-' + String(mo + 1).padStart(2, '0'), label: MON[mo] + ' ' + y, short: MON[mo] + ' ' + String(y).slice(2) });
  }
  const NM = MONTHS.length, LAST = NM - 1;
  const AS_OF = { iso: '2026-11-14T06:00:00+04:00', label: '14 Nov 2026, 06:00 GST', mtdDaysElapsed: 13.25, mtdDaysInMonth: 30, resetLabel: '01 Dec 2026, 00:00 GST' };
  const MATURITY = m => m / LAST;
  const SEASON = { 1: 0.97, 4: 0.93, 9: 0.96, 13: 0.97, 15: 0.94, 16: 0.95, 21: 0.96 };
  const season = m => SEASON[m] || 1;
  const minutesIn = m => MONTHS[m].days * 1440;

  // ------------------------------------------------------------------
  // Organisation, platform and governance dimensions
  // ------------------------------------------------------------------
  const BUS = [
    { id: 'FIN', name: 'Financial Services', rate: 245 },
    { id: 'HLT', name: 'Healthcare', rate: 205 },
    { id: 'ENR', name: 'Energy & Utilities', rate: 225 },
    { id: 'GOV', name: 'Government Services', rate: 195 },
    { id: 'GSS', name: 'Group Shared Services', rate: 180 }
  ];
  const TENANTS = [
    { id: 'FIN-RB', bu: 'FIN', name: 'Retail Bank', users: 9000, fte: 22, inc: 6.0, size: 1.00 },
    { id: 'FIN-PAY', bu: 'FIN', name: 'Payments', users: 1800, fte: 9, inc: 4.0, size: 0.55 },
    { id: 'HLT-HOS', bu: 'HLT', name: 'Hospital Network', users: 12000, fte: 16, inc: 5.0, size: 0.90 },
    { id: 'HLT-LAB', bu: 'HLT', name: 'Diagnostics Labs', users: 2500, fte: 5, inc: 2.0, size: 0.35 },
    { id: 'ENR-PWR', bu: 'ENR', name: 'Power & Water', users: 7500, fte: 13, inc: 4.0, size: 0.95 },
    { id: 'ENR-OGS', bu: 'ENR', name: 'Oil & Gas Services', users: 3200, fte: 8, inc: 3.0, size: 0.60 },
    { id: 'GOV-SSA', bu: 'GOV', name: 'Smart Services Authority', users: 4000, fte: 14, inc: 4.0, size: 0.70 },
    { id: 'GOV-MUN', bu: 'GOV', name: 'Municipal Services', users: 6000, fte: 9, inc: 4.0, size: 0.65 },
    { id: 'GSS-IT', bu: 'GSS', name: 'Group IT & Security', users: 1400, fte: 48, inc: 6.0, size: 0.80 },
    { id: 'GSS-FHR', bu: 'GSS', name: 'Group Finance & HR', users: 2100, fte: 6, inc: 2.0, size: 0.40 }
  ];
  const ENVS = ['prod', 'nonprod'];

  const MODELS = [
    { id: 'AZ-FRONTIER', name: 'Frontier reasoning LLM', provider: 'Azure OpenAI', region: 'UAE North', residency: 'UAE', ext: true, reason: true, embed: false, p_in: 18.40, p_cache: 4.60, p_out: 73.40, tpr: 16000, tps: 55, lat: 1900, ttft: 650, slo: 99.9 },
    { id: 'AZ-MINI', name: 'Small fast LLM', provider: 'Azure OpenAI', region: 'UAE North', residency: 'UAE', ext: true, reason: false, embed: false, p_in: 0.55, p_cache: 0.14, p_out: 2.20, tpr: 9000, tps: 130, lat: 700, ttft: 280, slo: 99.9 },
    { id: 'BR-LARGE', name: 'Large instruct LLM', provider: 'AWS Bedrock', region: 'eu-central-1', residency: 'EU', ext: true, reason: false, embed: false, p_in: 11.00, p_cache: 1.10, p_out: 55.00, tpr: 18000, tps: 45, lat: 2300, ttft: 800, slo: 99.9 },
    { id: 'BR-EMBED', name: 'Embedding model', provider: 'AWS Bedrock', region: 'me-central-1', residency: 'UAE', ext: true, reason: false, embed: true, p_in: 0.37, p_cache: 0, p_out: 0, tpr: 1500, tps: 0, lat: 120, ttft: 0, slo: 99.9 },
    { id: 'OP-70B', name: 'Open-weight 70B', provider: 'On-prem vLLM', region: 'DXB DC-1', residency: 'UAE', ext: false, reason: false, embed: false, p_in: 0, p_cache: 0, p_out: 0, tpr: 12000, tps: 38, lat: 1600, ttft: 520, slo: 99.5 },
    { id: 'OP-GUARD', name: 'Guardrail classifier 8B', provider: 'On-prem vLLM', region: 'AUH DC-2', residency: 'UAE', ext: false, reason: false, embed: false, p_in: 0, p_cache: 0, p_out: 0, tpr: 2200, tps: 180, lat: 180, ttft: 90, slo: 99.5 }
  ];
  const PROVIDERS = ['Azure OpenAI', 'AWS Bedrock', 'On-prem vLLM'];

  const APPS = [
    { id: 'APP-SOC', name: 'SOC Copilot', owner: 'Head of SOC' },
    { id: 'APP-SOAR', name: 'SOAR Automation', owner: 'SOAR Engineering Lead' },
    { id: 'APP-ITSM', name: 'ITSM Virtual Agent', owner: 'IT Service Manager' },
    { id: 'APP-IAM', name: 'Identity Governance Assistant', owner: 'IAM Lead' },
    { id: 'APP-KYC', name: 'KYC & Onboarding Platform', owner: 'Head of KYC Operations' },
    { id: 'APP-FRAUD', name: 'Fraud Investigation Workbench', owner: 'Head of Fraud Risk' },
    { id: 'APP-CLAIMS', name: 'Claims Hub', owner: 'Claims Operations Director' },
    { id: 'APP-EHR', name: 'Clinical Documentation Assistant', owner: 'Chief Medical Information Officer' },
    { id: 'APP-OT', name: 'Asset Maintenance Planner', owner: 'Head of Asset Management' },
    { id: 'APP-CITIZEN', name: 'Citizen Services Portal', owner: 'Digital Services Director' },
    { id: 'APP-ERP', name: 'ERP Finance Assistant', owner: 'Financial Controller' },
    { id: 'APP-PROC', name: 'Procurement Suite', owner: 'Head of Procurement' },
    { id: 'APP-DEV', name: 'Developer Platform', owner: 'Head of AppSec' },
    { id: 'APP-GRC', name: 'GRC Evidence Hub', owner: 'Head of GRC' }
  ];

  const CONTROL_FAMILIES = ['SOC', 'SIEM', 'SOAR', 'EDR/XDR', 'Firewall', 'WAF', 'NDR', 'DLP', 'IAM/PAM', 'CTEM', 'Vulnerability Mgmt', 'DFIR', 'Backup', 'Cloud Security', 'AppSec', 'GRC', 'AI Agents'];

  // id, name, security-control family, manual min/task, exec fraction, review intensity, autonomy-eligible share,
  // k-tokens/task, output share, cache potential, tool calls/task, high-risk approvals/task, prompt-injection exposure,
  // sensitive-data share, RAG, multi-agent, context-exceed probability per request, critical, risk tier, AED/min outage cost, base tasks/month
  const WORKFLOWS = [
    { id: 'WF-TRIAGE', name: 'SOC alert triage', ctl: 'SOC', man: 18, ex: 0.08, rv: 0.70, el: 0.80, tok: 120, out: 0.07, cache: 0.55, tc: 6, hr: 0.010, pi: 0.004, sens: 0.15, rag: true, a2a: true, ctx: 0.0004, crit: true, tier: 'High', cpm: 420, base: 9000 },
    { id: 'WF-PHISH', name: 'Phishing analysis & response', ctl: 'SOAR', man: 26, ex: 0.09, rv: 0.80, el: 0.70, tok: 260, out: 0.08, cache: 0.50, tc: 9, hr: 0.040, pi: 0.030, sens: 0.25, rag: true, a2a: true, ctx: 0.0008, crit: true, tier: 'High', cpm: 380, base: 3200 },
    { id: 'WF-CONTAIN', name: 'Incident containment', ctl: 'SOAR', man: 60, ex: 0.11, rv: 1.10, el: 0.25, tok: 420, out: 0.09, cache: 0.45, tc: 14, hr: 0.300, pi: 0.006, sens: 0.20, rag: true, a2a: true, ctx: 0.0010, crit: true, tier: 'High', cpm: 900, base: 420, priv: true },
    { id: 'WF-CTI', name: 'Threat intelligence enrichment', ctl: 'SIEM', man: 35, ex: 0.08, rv: 0.70, el: 0.85, tok: 180, out: 0.10, cache: 0.50, tc: 8, hr: 0.000, pi: 0.012, sens: 0.05, rag: true, a2a: false, ctx: 0.0012, crit: false, tier: 'Medium', cpm: 90, base: 1800 },
    { id: 'WF-VULN', name: 'Vulnerability prioritisation', ctl: 'Vulnerability Mgmt', man: 42, ex: 0.10, rv: 1.00, el: 0.50, tok: 220, out: 0.09, cache: 0.40, tc: 7, hr: 0.020, pi: 0.002, sens: 0.05, rag: true, a2a: false, ctx: 0.0010, crit: false, tier: 'Medium', cpm: 110, base: 1500 },
    { id: 'WF-IAM', name: 'Access request fulfilment', ctl: 'IAM/PAM', man: 20, ex: 0.10, rv: 0.90, el: 0.60, tok: 60, out: 0.08, cache: 0.45, tc: 5, hr: 0.120, pi: 0.002, sens: 0.35, rag: false, a2a: false, ctx: 0.0001, crit: true, tier: 'High', cpm: 220, base: 2600, priv: true },
    { id: 'WF-ITSD', name: 'IT service desk resolution', ctl: 'AI Agents', man: 24, ex: 0.10, rv: 0.80, el: 0.75, tok: 80, out: 0.10, cache: 0.40, tc: 4, hr: 0.015, pi: 0.015, sens: 0.10, rag: true, a2a: false, ctx: 0.0002, crit: false, tier: 'Low', cpm: 160, base: 6500 },
    { id: 'WF-KYC', name: 'KYC document review', ctl: 'AI Agents', man: 48, ex: 0.12, rv: 1.30, el: 0.30, tok: 480, out: 0.06, cache: 0.35, tc: 6, hr: 0.050, pi: 0.008, sens: 0.92, rag: true, a2a: false, ctx: 0.0015, crit: true, tier: 'High', cpm: 650, base: 2600 },
    { id: 'WF-FRAUD', name: 'Payment fraud investigation', ctl: 'AI Agents', man: 55, ex: 0.12, rv: 1.40, el: 0.20, tok: 650, out: 0.07, cache: 0.40, tc: 11, hr: 0.090, pi: 0.004, sens: 0.85, rag: true, a2a: true, ctx: 0.0018, crit: true, tier: 'High', cpm: 1200, base: 1100, priv: true },
    { id: 'WF-CLAIMS', name: 'Claims pre-authorisation', ctl: 'AI Agents', man: 38, ex: 0.11, rv: 1.20, el: 0.35, tok: 380, out: 0.07, cache: 0.40, tc: 6, hr: 0.040, pi: 0.006, sens: 0.95, rag: true, a2a: false, ctx: 0.0012, crit: true, tier: 'High', cpm: 700, base: 2800 },
    { id: 'WF-CODING', name: 'Clinical coding assistance', ctl: 'AI Agents', man: 30, ex: 0.10, rv: 1.10, el: 0.40, tok: 210, out: 0.08, cache: 0.35, tc: 3, hr: 0.000, pi: 0.002, sens: 0.90, rag: true, a2a: false, ctx: 0.0008, crit: false, tier: 'Medium', cpm: 180, base: 2300 },
    { id: 'WF-OTMAINT', name: 'Grid & asset maintenance planning', ctl: 'AI Agents', man: 95, ex: 0.14, rv: 1.40, el: 0.15, tok: 900, out: 0.08, cache: 0.30, tc: 9, hr: 0.060, pi: 0.002, sens: 0.05, rag: true, a2a: true, ctx: 0.0030, crit: false, tier: 'High', cpm: 300, base: 280 },
    { id: 'WF-CITIZEN', name: 'Citizen service requests', ctl: 'AI Agents', man: 22, ex: 0.09, rv: 0.90, el: 0.55, tok: 110, out: 0.09, cache: 0.45, tc: 4, hr: 0.020, pi: 0.020, sens: 0.50, rag: true, a2a: false, ctx: 0.0003, crit: true, tier: 'High', cpm: 520, base: 5800 },
    { id: 'WF-CONTRACT', name: 'Contract & procurement review', ctl: 'GRC', man: 120, ex: 0.13, rv: 1.50, el: 0.10, tok: 1600, out: 0.05, cache: 0.30, tc: 5, hr: 0.020, pi: 0.010, sens: 0.20, rag: true, a2a: false, ctx: 0.0060, crit: false, tier: 'Medium', cpm: 120, base: 210 },
    { id: 'WF-RECON', name: 'Finance reconciliation', ctl: 'AI Agents', man: 65, ex: 0.11, rv: 1.00, el: 0.50, tok: 520, out: 0.05, cache: 0.40, tc: 8, hr: 0.030, pi: 0.002, sens: 0.30, rag: false, a2a: false, ctx: 0.0020, crit: false, tier: 'Medium', cpm: 150, base: 850, priv: true },
    { id: 'WF-APPSEC', name: 'Secure code review', ctl: 'AppSec', man: 45, ex: 0.12, rv: 1.20, el: 0.30, tok: 1100, out: 0.06, cache: 0.45, tc: 7, hr: 0.010, pi: 0.010, sens: 0.08, rag: true, a2a: false, ctx: 0.0040, crit: false, tier: 'Medium', cpm: 100, base: 650 },
    { id: 'WF-GRC', name: 'Control evidence collection', ctl: 'GRC', man: 40, ex: 0.09, rv: 0.90, el: 0.70, tok: 300, out: 0.06, cache: 0.40, tc: 6, hr: 0.000, pi: 0.002, sens: 0.10, rag: true, a2a: false, ctx: 0.0012, crit: false, tier: 'Low', cpm: 60, base: 600 }
  ];

  // code, name, tenant, application, workflow, primary model, fallback model, first month, volume scale, last month
  const AGENT_DEFS = [
    ['GSS-SOC-TRIAGE', 'SOC Alert Triage Agent', 'GSS-IT', 'APP-SOC', 'WF-TRIAGE', 'AZ-MINI', 'OP-70B', 0, 1.4],
    ['GSS-PHISH', 'Phishing Response Agent', 'GSS-IT', 'APP-SOAR', 'WF-PHISH', 'AZ-FRONTIER', 'BR-LARGE', 0, 1.3],
    ['GSS-LEGACY', 'Legacy Helpdesk Bot', 'GSS-IT', 'APP-ITSM', 'WF-ITSD', 'AZ-MINI', null, 0, 0.6, 12],
    ['GSS-CTI', 'Threat Intel Enrichment Agent', 'GSS-IT', 'APP-SOC', 'WF-CTI', 'OP-70B', 'AZ-MINI', 1, 1.0],
    ['GSS-ITSD', 'IT Service Desk Agent', 'GSS-IT', 'APP-ITSM', 'WF-ITSD', 'AZ-MINI', 'OP-70B', 1, 1.2],
    ['GSS-IAM', 'Access Request Agent', 'GSS-IT', 'APP-IAM', 'WF-IAM', 'AZ-MINI', 'OP-70B', 2, 1.2],
    ['GSS-CONTAIN', 'Containment Orchestrator', 'GSS-IT', 'APP-SOAR', 'WF-CONTAIN', 'AZ-FRONTIER', 'OP-70B', 3, 1.0],
    ['GSS-VULN', 'Vulnerability Prioritisation Agent', 'GSS-IT', 'APP-SOC', 'WF-VULN', 'AZ-FRONTIER', null, 4, 1.0],
    ['GSS-APPSEC', 'Secure Code Review Agent', 'GSS-IT', 'APP-DEV', 'WF-APPSEC', 'AZ-FRONTIER', 'BR-LARGE', 6, 1.0],
    ['GSS-GRC', 'Control Evidence Agent', 'GSS-IT', 'APP-GRC', 'WF-GRC', 'AZ-MINI', null, 8, 1.0],
    ['GSS-DETENG', 'Detection Engineering Copilot', 'GSS-IT', 'APP-SOC', 'WF-CTI', 'AZ-FRONTIER', null, 14, 0.5],
    ['GSS-PATCH', 'Patch Orchestration Agent', 'GSS-IT', 'APP-ITSM', 'WF-VULN', 'OP-70B', 'AZ-MINI', 17, 0.8],
    ['GSS-AIREDTEAM', 'AI Red-Team Agent', 'GSS-IT', 'APP-DEV', 'WF-APPSEC', 'AZ-FRONTIER', null, 20, 0.3],
    ['GSS-FINOPS', 'AI FinOps Agent', 'GSS-IT', 'APP-ERP', 'WF-RECON', 'AZ-MINI', null, 23, 0.3],
    ['FHR-RECON', 'Reconciliation Agent', 'GSS-FHR', 'APP-ERP', 'WF-RECON', 'AZ-FRONTIER', 'OP-70B', 5, 1.0],
    ['FHR-CONTRACT', 'Contract Review Agent', 'GSS-FHR', 'APP-PROC', 'WF-CONTRACT', 'BR-LARGE', 'AZ-FRONTIER', 7, 1.0],
    ['FHR-HRDESK', 'HR Policy Assistant', 'GSS-FHR', 'APP-ITSM', 'WF-ITSD', 'AZ-MINI', null, 9, 0.6],
    ['FHR-INVOICE', 'Invoice Matching Agent', 'GSS-FHR', 'APP-ERP', 'WF-RECON', 'OP-70B', null, 12, 0.9],
    ['FHR-TPRM', 'Third-Party Risk Agent', 'GSS-FHR', 'APP-GRC', 'WF-GRC', 'AZ-FRONTIER', null, 15, 0.6],
    ['RB-KYC', 'KYC Document Review Agent', 'FIN-RB', 'APP-KYC', 'WF-KYC', 'AZ-FRONTIER', 'OP-70B', 2, 1.2],
    ['RB-SOC', 'Bank SOC Triage Agent', 'FIN-RB', 'APP-SOC', 'WF-TRIAGE', 'AZ-MINI', 'OP-70B', 3, 0.9],
    ['RB-FRAUD', 'Fraud Investigation Agent', 'FIN-RB', 'APP-FRAUD', 'WF-FRAUD', 'AZ-FRONTIER', 'BR-LARGE', 4, 1.1],
    ['RB-ITSD', 'Branch Service Desk Agent', 'FIN-RB', 'APP-ITSM', 'WF-ITSD', 'AZ-MINI', null, 6, 0.8],
    ['RB-IAM', 'Banking Access Request Agent', 'FIN-RB', 'APP-IAM', 'WF-IAM', 'AZ-MINI', 'OP-70B', 10, 0.8],
    ['RB-PHISH', 'Bank Phishing Response Agent', 'FIN-RB', 'APP-SOAR', 'WF-PHISH', 'AZ-MINI', 'OP-70B', 11, 0.7],
    ['RB-COMPL', 'Regulatory Evidence Agent', 'FIN-RB', 'APP-GRC', 'WF-GRC', 'AZ-MINI', null, 16, 0.6],
    ['RB-RECON', 'Bank Reconciliation Agent', 'FIN-RB', 'APP-ERP', 'WF-RECON', 'AZ-FRONTIER', null, 21, 0.6],
    ['PAY-FRAUD', 'Payment Fraud Agent', 'FIN-PAY', 'APP-FRAUD', 'WF-FRAUD', 'AZ-FRONTIER', 'OP-70B', 6, 1.0],
    ['PAY-PHISH', 'Payments Phishing Agent', 'FIN-PAY', 'APP-SOAR', 'WF-PHISH', 'AZ-MINI', 'OP-70B', 8, 0.5],
    ['PAY-KYC', 'Merchant KYC Agent', 'FIN-PAY', 'APP-KYC', 'WF-KYC', 'BR-LARGE', null, 9, 0.7],
    ['PAY-DISPUTE', 'Dispute Resolution Agent', 'FIN-PAY', 'APP-FRAUD', 'WF-RECON', 'AZ-FRONTIER', 'OP-70B', 13, 0.7],
    ['PAY-CODE', 'Payments Code Review Agent', 'FIN-PAY', 'APP-DEV', 'WF-APPSEC', 'AZ-FRONTIER', null, 18, 0.4],
    ['HOS-CLAIMS', 'Claims Pre-authorisation Agent', 'HLT-HOS', 'APP-CLAIMS', 'WF-CLAIMS', 'AZ-FRONTIER', 'OP-70B', 5, 1.1],
    ['HOS-CODING', 'Clinical Coding Assistant', 'HLT-HOS', 'APP-EHR', 'WF-CODING', 'OP-70B', null, 7, 1.0],
    ['HOS-SOC', 'Hospital SOC Triage Agent', 'HLT-HOS', 'APP-SOC', 'WF-TRIAGE', 'AZ-MINI', 'OP-70B', 9, 0.7],
    ['HOS-ITSD', 'Patient & Staff Service Desk', 'HLT-HOS', 'APP-ITSM', 'WF-ITSD', 'AZ-MINI', 'OP-70B', 10, 0.9],
    ['HOS-IAM', 'Clinical Access Agent', 'HLT-HOS', 'APP-IAM', 'WF-IAM', 'AZ-MINI', 'OP-70B', 14, 0.7],
    ['HOS-PHISH', 'Hospital Phishing Agent', 'HLT-HOS', 'APP-SOAR', 'WF-PHISH', 'AZ-MINI', 'OP-70B', 19, 0.5],
    ['HOS-CONTAIN', 'Hospital Containment Agent', 'HLT-HOS', 'APP-SOAR', 'WF-CONTAIN', 'AZ-FRONTIER', 'OP-70B', 21, 0.4],
    ['LAB-CODING', 'Lab Results Coding Agent', 'HLT-LAB', 'APP-EHR', 'WF-CODING', 'OP-70B', null, 12, 0.6],
    ['LAB-CLAIMS', 'Lab Claims Agent', 'HLT-LAB', 'APP-CLAIMS', 'WF-CLAIMS', 'AZ-MINI', 'OP-70B', 14, 0.5],
    ['LAB-ITSD', 'Lab Service Desk Agent', 'HLT-LAB', 'APP-ITSM', 'WF-ITSD', 'AZ-MINI', null, 20, 0.4],
    ['PWR-MAINT', 'Grid Maintenance Planner', 'ENR-PWR', 'APP-OT', 'WF-OTMAINT', 'AZ-FRONTIER', 'OP-70B', 6, 1.0],
    ['PWR-OTVULN', 'OT Vulnerability Agent', 'ENR-PWR', 'APP-SOC', 'WF-VULN', 'OP-70B', null, 8, 0.7],
    ['PWR-SOC', 'Utility SOC Triage Agent', 'ENR-PWR', 'APP-SOC', 'WF-TRIAGE', 'OP-70B', 'AZ-MINI', 10, 0.7],
    ['PWR-ITSD', 'Field Service Desk Agent', 'ENR-PWR', 'APP-ITSM', 'WF-ITSD', 'AZ-MINI', null, 11, 0.8],
    ['PWR-IAM', 'Contractor Access Agent', 'ENR-PWR', 'APP-IAM', 'WF-IAM', 'AZ-MINI', 'OP-70B', 15, 0.6],
    ['OGS-MAINT', 'Asset Integrity Planner', 'ENR-OGS', 'APP-OT', 'WF-OTMAINT', 'OP-70B', null, 10, 0.8],
    ['OGS-IAM', 'Contractor Access Agent (OGS)', 'ENR-OGS', 'APP-IAM', 'WF-IAM', 'AZ-MINI', 'OP-70B', 13, 0.5],
    ['OGS-CONTRACT', 'Supplier Contract Agent', 'ENR-OGS', 'APP-PROC', 'WF-CONTRACT', 'AZ-FRONTIER', null, 16, 0.6],
    ['OGS-SOC', 'OGS SOC Triage Agent', 'ENR-OGS', 'APP-SOC', 'WF-TRIAGE', 'OP-70B', null, 22, 0.5],
    ['SSA-CITIZEN', 'Citizen Request Agent', 'GOV-SSA', 'APP-CITIZEN', 'WF-CITIZEN', 'AZ-MINI', 'OP-70B', 3, 1.2],
    ['SSA-SOC', 'Government SOC Triage Agent', 'GOV-SSA', 'APP-SOC', 'WF-TRIAGE', 'OP-70B', 'AZ-MINI', 5, 0.8],
    ['SSA-DOCVER', 'Document Verification Agent', 'GOV-SSA', 'APP-CITIZEN', 'WF-CITIZEN', 'AZ-FRONTIER', 'OP-70B', 7, 0.8],
    ['SSA-PHISH', 'Government Phishing Agent', 'GOV-SSA', 'APP-SOAR', 'WF-PHISH', 'OP-70B', 'AZ-MINI', 12, 0.6],
    ['SSA-CONTAIN', 'Government Containment Agent', 'GOV-SSA', 'APP-SOAR', 'WF-CONTAIN', 'AZ-FRONTIER', null, 18, 0.5],
    ['MUN-PERMIT', 'Permit Processing Agent', 'GOV-MUN', 'APP-CITIZEN', 'WF-CITIZEN', 'AZ-MINI', 'OP-70B', 9, 1.0],
    ['MUN-PROC', 'Municipal Procurement Agent', 'GOV-MUN', 'APP-PROC', 'WF-CONTRACT', 'AZ-FRONTIER', null, 12, 0.7],
    ['MUN-ITSD', 'Municipal Service Desk Agent', 'GOV-MUN', 'APP-ITSM', 'WF-ITSD', 'AZ-MINI', null, 15, 0.7],
    ['MUN-GRC', 'Municipal Evidence Agent', 'GOV-MUN', 'APP-GRC', 'WF-GRC', 'AZ-MINI', null, 19, 0.5],
    ['MUN-CHAT', 'Municipal Chat Agent', 'GOV-MUN', 'APP-CITIZEN', 'WF-CITIZEN', 'AZ-MINI', null, 22, 0.6]
  ];

  const FRAMEWORKS = [
    { id: 'UAEIA', name: 'UAE IA Regulation (NESA)', bu: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], note: 'Government entities and critical information infrastructure; GSS in scope as shared-service supplier.' },
    { id: 'UAEAI', name: 'UAE national AI & cybersecurity policies', bu: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], note: 'National Cybersecurity Strategy, UAE AI Charter and AI ethics principles (adopted as group policy).' },
    { id: 'PDPL', name: 'UAE PDPL (Federal Decree-Law 45/2021)', bu: ['ENR', 'GSS'], note: 'Illustrative: government data and sector-regulated health/banking data assessed under their own regimes. Confirm with Legal.' },
    { id: 'CBUAE', name: 'CBUAE regulations & enabling-technology guidance', bu: ['FIN'], note: 'Licensed financial institutions only.' },
    { id: 'ADHICS', name: 'DoH Abu Dhabi ADHICS (healthcare)', bu: ['HLT'], note: 'Healthcare entities licensed in Abu Dhabi.' },
    { id: 'PCI', name: 'PCI DSS v4.0', bu: ['FIN'], note: 'Card-data environments (Retail Bank, Payments).' },
    { id: 'IEC62443', name: 'IEC 62443 (OT security)', bu: ['ENR'], note: 'Operational technology environments.' },
    { id: 'ISO27001', name: 'ISO/IEC 27001:2022', bu: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], note: 'Group ISMS scope.' },
    { id: 'ISO42001', name: 'ISO/IEC 42001:2023', bu: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], note: 'AI management system (group-wide).' },
    { id: 'ISO27017', name: 'ISO/IEC 27017 (cloud controls)', bu: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], note: 'All BUs consume cloud AI services.' },
    { id: 'ISO27018', name: 'ISO/IEC 27018 (PII in public cloud)', bu: ['FIN', 'HLT', 'GOV', 'GSS'], note: 'BUs processing PII in public-cloud AI services.' },
    { id: 'ISO27701', name: 'ISO/IEC 27701 (privacy)', bu: ['FIN', 'HLT', 'GOV', 'GSS'], note: 'Privacy information management extension.' },
    { id: 'NISTAIRMF', name: 'NIST AI RMF 1.0', bu: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], note: 'Voluntary framework adopted for AI risk management.' },
    { id: 'ATLAS', name: 'MITRE ATLAS', bu: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], note: 'Adversary technique reference for threat modelling and detection.' },
    { id: 'OWASP', name: 'OWASP Top 10 for LLM & Agentic AI', bu: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], note: 'Application-level AI security baseline.' },
    { id: 'CSA', name: 'CSA Cloud Controls Matrix', bu: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], note: 'Cloud control reference.' }
  ];

  // AI security & governance control catalog: id, name, family, frameworks, tier
  const CONTROL_CATALOG = [
    ['AIC-01', 'AI system & agent inventory registration', 'GRC', ['ISO42001', 'NISTAIRMF', 'UAEIA', 'UAEAI']],
    ['AIC-02', 'Agent workload identity (no shared keys)', 'IAM/PAM', ['ISO27001', 'UAEIA', 'OWASP', 'CBUAE']],
    ['AIC-03', 'Least-privilege tool scopes', 'IAM/PAM', ['ISO27001', 'OWASP', 'NISTAIRMF', 'PCI']],
    ['AIC-04', 'Human approval for high-risk actions', 'AI Agents', ['ISO42001', 'OWASP', 'UAEAI', 'CBUAE', 'ADHICS']],
    ['AIC-05', 'Kill switch & safe shutdown', 'AI Agents', ['ISO42001', 'NISTAIRMF', 'OWASP']],
    ['AIC-06', 'Prompt-injection defences', 'AppSec', ['OWASP', 'ATLAS']],
    ['AIC-07', 'Output validation & guardrails', 'AppSec', ['OWASP', 'ISO42001']],
    ['AIC-08', 'Sensitive-data redaction at AI gateway', 'DLP', ['PDPL', 'ISO27701', 'ADHICS', 'PCI', 'UAEIA']],
    ['AIC-09', 'Data residency & cross-border transfer control', 'Cloud Security', ['PDPL', 'UAEIA', 'CBUAE', 'ADHICS', 'ISO27018']],
    ['AIC-10', 'MCP server registry & allow-listing', 'AI Agents', ['OWASP', 'ISO27001']],
    ['AIC-11', 'Agent-to-agent delegation policy', 'AI Agents', ['OWASP', 'ISO42001']],
    ['AIC-12', 'End-to-end agent tracing (OpenTelemetry)', 'SIEM', ['ISO42001', 'NISTAIRMF', 'UAEIA']],
    ['AIC-13', 'AI security telemetry to SIEM', 'SIEM', ['ISO27001', 'UAEIA', 'CBUAE']],
    ['AIC-14', 'AI threat detection use cases', 'SOC', ['ATLAS', 'NISTAIRMF', 'UAEIA']],
    ['AIC-15', 'Model provider due diligence', 'GRC', ['ISO27001', 'ISO42001', 'CBUAE', 'ISO27017']],
    ['AIC-16', 'Model change & evaluation gate', 'AppSec', ['ISO42001', 'NISTAIRMF']],
    ['AIC-17', 'RAG corpus integrity & poisoning detection', 'AI Agents', ['ATLAS', 'OWASP']],
    ['AIC-18', 'Agent memory isolation', 'AI Agents', ['OWASP', 'ISO42001']],
    ['AIC-19', 'Token, cost & quota guardrails', 'AI Agents', ['ISO42001']],
    ['AIC-20', 'Model fallback & resilience', 'Backup', ['ISO27001', 'UAEIA', 'CBUAE']],
    ['AIC-21', 'AI DR & vector-store backup', 'Backup', ['ISO27001', 'UAEIA', 'ADHICS']],
    ['AIC-22', 'AI supply chain (AIBOM, signed models)', 'AppSec', ['NISTAIRMF', 'ISO42001', 'OWASP']],
    ['AIC-23', 'Agent risk assessment', 'GRC', ['ISO42001', 'NISTAIRMF', 'UAEAI']],
    ['AIC-24', 'Agent threat modelling', 'AppSec', ['ATLAS', 'OWASP', 'ISO42001']],
    ['AIC-25', 'AI red teaming & security evaluation', 'AppSec', ['NISTAIRMF', 'OWASP', 'ATLAS']],
    ['AIC-26', 'AI incident response playbooks', 'DFIR', ['ISO27001', 'UAEIA', 'NISTAIRMF']],
    ['AIC-27', 'Shadow AI discovery (CASB/SWG)', 'Cloud Security', ['ISO27001', 'UAEIA', 'CSA']],
    ['AIC-28', 'AI acceptable use & awareness', 'GRC', ['UAEAI', 'ISO42001']],
    ['AIC-29', 'Privacy impact assessment for AI', 'GRC', ['PDPL', 'ISO27701', 'ADHICS']],
    ['AIC-30', 'Cloud AI tenant hardening', 'Cloud Security', ['ISO27017', 'ISO27018', 'CSA']],
    ['AIC-31', 'PCI scope isolation for AI workloads', 'Firewall', ['PCI']],
    ['AIC-32', 'Clinical AI safety oversight', 'GRC', ['ADHICS', 'UAEAI']],
    ['AIC-33', 'OT safety interlocks for AI recommendations', 'AI Agents', ['IEC62443', 'UAEIA']],
    ['AIC-34', 'Explainability & decision records', 'GRC', ['CBUAE', 'UAEAI', 'ISO42001']],
    ['AIC-35', 'Fairness & bias monitoring', 'GRC', ['UAEAI', 'NISTAIRMF', 'CBUAE']],
    ['AIC-36', 'AI risk exception management', 'GRC', ['ISO27001', 'ISO42001']]
  ].map(r => ({ id: r[0], name: r[1], family: r[2], fw: r[3] }));

  const COMPONENTS = [
    { id: 'GPU-DXB1', name: 'GPU cluster DXB-1', type: 'gpu', lam: 0.22, crit: true },
    { id: 'GPU-AUH2', name: 'GPU cluster AUH-2', type: 'gpu', lam: 0.16, crit: true },
    { id: 'K8S', name: 'Kubernetes AI platform', type: 'k8s', lam: 0.18, crit: true },
    { id: 'MSE', name: 'Model-serving endpoints', type: 'serving', lam: 0.20, crit: true },
    { id: 'GW', name: 'AI gateway', type: 'gateway', lam: 0.10, crit: true },
    { id: 'LB', name: 'Load balancers', type: 'lb', lam: 0.06, crit: false },
    { id: 'NET', name: 'DC network & WAN', type: 'network', lam: 0.08, crit: true },
    { id: 'STO', name: 'Object & block storage', type: 'storage', lam: 0.05, crit: false },
    { id: 'VDB', name: 'Vector database cluster', type: 'vectordb', lam: 0.15, crit: true }
  ];

  const PROGRAMME = {
    investment: 38e6,
    investmentNote: 'Cumulative programme investment Nov 2024 - Oct 2026: GPU capex, platform build, integration and change management (Finance fixed-asset register).',
    annualSecurityBudget: 96e6,
    riskAppetite: 150e6,
    baselineCasesPerFte: 62,
    fteBaselinePeriod: 'Q4 2024 time-and-motion study',
    aiBudgetNote: 'Board-approved AI operating budget, phased monthly by BU.'
  };

  const SOURCES = [
    { id: 'ERP', name: 'Finance ERP (GL, cost approvals)', fresh: '2026-11-05 18:00', cadence: 'Monthly close', completeness: 99.4 },
    { id: 'FINAPP', name: 'Finance benefit-approval workflow', fresh: '2026-11-06 12:00', cadence: 'Monthly', completeness: 98.7 },
    { id: 'RISK', name: 'Cyber risk register (FAIR model)', fresh: '2026-11-03 09:00', cadence: 'Monthly', completeness: 96.5 },
    { id: 'SIEM', name: 'SIEM (Microsoft Sentinel / Splunk)', fresh: '2026-11-14 05:55', cadence: 'Near real time', completeness: 99.2 },
    { id: 'SOAR', name: 'SOAR (FortiSOAR) case data', fresh: '2026-11-14 05:50', cadence: 'Near real time', completeness: 98.9 },
    { id: 'ITSM', name: 'ITSM & incident records', fresh: '2026-11-14 05:30', cadence: 'Hourly', completeness: 98.1 },
    { id: 'ORCH', name: 'Agent orchestrator traces (OpenTelemetry)', fresh: '2026-11-14 05:58', cadence: 'Streaming', completeness: 96.8 },
    { id: 'GW', name: 'AI gateway logs (requests, tokens, policy)', fresh: '2026-11-14 05:59', cadence: 'Streaming', completeness: 99.6 },
    { id: 'BILL', name: 'Provider billing exports (Azure, AWS)', fresh: '2026-11-13 23:00', cadence: 'Daily', completeness: 99.8 },
    { id: 'QUOTA', name: 'Provider quota & rate-limit APIs', fresh: '2026-11-14 05:45', cadence: '15 min', completeness: 99.5 },
    { id: 'APM', name: 'Model-serving APM & synthetic probes', fresh: '2026-11-14 05:59', cadence: '1 min', completeness: 99.7 },
    { id: 'DCGM', name: 'GPU telemetry (DCGM exporter)', fresh: '2026-11-14 05:59', cadence: '30 s', completeness: 99.1 },
    { id: 'K8S', name: 'Kubernetes / Prometheus metrics', fresh: '2026-11-14 05:59', cadence: '30 s', completeness: 99.3 },
    { id: 'CMDB', name: 'CMDB & asset inventory', fresh: '2026-11-13 20:00', cadence: 'Daily', completeness: 94.2 },
    { id: 'BCM', name: 'BCM / DR test records', fresh: '2026-11-02 10:00', cadence: 'Quarterly', completeness: 97.0 },
    { id: 'REG', name: 'AI agent, model & MCP registry', fresh: '2026-11-14 04:00', cadence: 'Hourly', completeness: 98.4 },
    { id: 'IAM', name: 'IAM / PAM & workload identity', fresh: '2026-11-14 05:40', cadence: 'Hourly', completeness: 98.8 },
    { id: 'CASB', name: 'CASB / secure web gateway', fresh: '2026-11-14 05:35', cadence: 'Hourly', completeness: 97.6 },
    { id: 'DLP', name: 'DLP (endpoint, email, AI gateway)', fresh: '2026-11-14 05:50', cadence: 'Near real time', completeness: 98.5 },
    { id: 'EDR', name: 'EDR/XDR, firewall, WAF, NDR', fresh: '2026-11-14 05:55', cadence: 'Near real time', completeness: 99.0 },
    { id: 'VULN', name: 'Vulnerability management & CTEM', fresh: '2026-11-13 22:00', cadence: 'Daily', completeness: 97.9 },
    { id: 'GRC', name: 'GRC platform (controls, findings, exceptions)', fresh: '2026-11-13 18:00', cadence: 'Daily', completeness: 96.9 },
    { id: 'EVAL', name: 'Model & agent evaluation pipeline', fresh: '2026-11-13 21:00', cadence: 'Daily', completeness: 97.4 },
    { id: 'HR', name: 'HR, timesheet & loaded cost rates', fresh: '2026-11-04 08:00', cadence: 'Monthly', completeness: 98.0 },
    { id: 'TPRM', name: 'Third-party risk management', fresh: '2026-11-10 12:00', cadence: 'Weekly', completeness: 95.8 }
  ];

  // ------------------------------------------------------------------
  // Indexes
  // ------------------------------------------------------------------
  const idx = list => { const o = {}; list.forEach(x => { o[x.id] = x; }); return o; };
  const BUI = idx(BUS), TNI = idx(TENANTS), MI = idx(MODELS), APPI = idx(APPS), WFI = idx(WORKFLOWS), COMPI = idx(COMPONENTS), FWI = idx(FRAMEWORKS);

  // ------------------------------------------------------------------
  // Agent registry with temporal governance attributes
  // ------------------------------------------------------------------
  const AGENTS = AGENT_DEFS.map((d, i) => {
    const R = RNG('agent|' + d[0]);
    const wf = WFI[d[4]];
    const a = {
      id: d[0], name: d[1], tenant: d[2], bu: TNI[d[2]].bu, app: d[3], wf: d[4], primary: d[5], fallback: d[6],
      start: d[7], scale: d[8], end: d.length > 9 ? d[9] : null, idx: i,
      tier: wf.tier, privileged: !!wf.priv, owner: APPI[d[3]].owner + ' (' + d[2] + ')', tokf: R.range(0.85, 1.15)
    };
    a.autonomy = wf.el >= 0.7 ? 'L3 - autonomous within guardrails' : wf.el >= 0.4 ? 'L2 - supervised autonomy' : 'L1 - human-approved actions';
    a.ownerUntil = null;
    a.identityFrom = a.start <= 6 ? a.start + R.int(2, 12) : a.start + R.int(0, 2);
    a.killSwitchFrom = R.chance(0.97) ? (a.start >= 12 ? a.start : a.start + R.int(2, 12)) : null;
    a.traceFrom = a.start + (a.start < 8 ? R.int(2, 9) : R.int(0, 2));
    a.siemFrom = a.start + R.int(0, 3);
    a.threatModelFrom = R.chance(0.88) ? a.start + R.int(0, 11) : null;
    a.governedFrom = R.chance(0.93) ? a.start : a.start + R.int(3, 12);
    a.fbTestedFrom = a.fallback ? a.start + R.int(1, 8) : null;
    a.xbApprovedFrom = null;
    // risk assessments: first assessment, then annual refresh (85% on time)
    a.assessments = [];
    let ra = a.start <= 4 ? a.start + R.int(3, 10) : a.start - 1;
    if (R.chance(0.94)) { while (ra <= LAST + 1) { a.assessments.push(ra); ra += R.chance(0.85) ? 12 : 15; } }
    // excess privilege episodes
    a.excessPriv = null;
    if (R.chance(0.22)) { const f = a.start + R.int(0, 4); a.excessPriv = [f, R.chance(0.8) ? f + R.int(2, 10) : null]; }
    // security evaluations every ~6 months
    a.evals = [];
    for (let m = Math.max(0, a.start - 1); m <= LAST; m += 6) a.evals.push({ m: m, pass: R.chance(0.80 + 0.12 * MATURITY(m)) });
    return a;
  });
  const AGI = idx(AGENTS);
  // deliberate, explainable exceptions in the synthetic estate
  AGI['FHR-INVOICE'].ownerUntil = 19;          // owner left in Jun 2026, not reassigned
  AGI['PWR-OTVULN'].ownerUntil = 21;           // owner moved role in Aug 2026
  AGI['PAY-KYC'].xbApprovedFrom = 20;          // cross-border transfer approval granted Jul 2026
  AGI['FHR-CONTRACT'].xbApprovedFrom = 7;      // approved at onboarding (contract data, low PII)
  AGI['PAY-KYC'].killSwitchFrom = null;
  AGI['OGS-SOC'].killSwitchFrom = null;
  AGI['MUN-CHAT'].killSwitchFrom = null;
  AGI['RB-RECON'].excessPriv = [21, null];
  AGI['GSS-PATCH'].excessPriv = [17, null];
  // registered but paused agents (no production traffic in these months)
  AGENTS.forEach(a => { a.paused = []; });
  AGI['GSS-DETENG'].paused = [22, 23];
  AGI['MUN-GRC'].paused = [21, 22, 23];
  AGI['LAB-ITSD'].paused = [23];
  AGI['PAY-CODE'].paused = [23];

  const isActiveAgent = (a, m) => m >= a.start && (a.end == null || m <= a.end);
  const isRunning = (a, m) => isActiveAgent(a, m) && a.paused.indexOf(m) < 0;

  // ------------------------------------------------------------------
  // Outage records (generated first: they drive request failures)
  // ------------------------------------------------------------------
  const OUT_MODEL = [];
  const MODEL_LAMBDA = { 'AZ-FRONTIER': 0.30, 'AZ-MINI': 0.18, 'BR-LARGE': 0.22, 'BR-EMBED': 0.08, 'OP-70B': 0.40, 'OP-GUARD': 0.18 };
  for (let m = 0; m < NM; m++) {
    const mat = MATURITY(m);
    for (const md of MODELS) {
      const R = RNG('outM|' + md.id + '|' + m);
      const n = R.pois(MODEL_LAMBDA[md.id] * (m < 6 ? 1.25 : 1));
      for (let k = 0; k < n; k++) {
        const dur = Math.round(clamp(R.logn(md.ext ? 30 : 46, 0.75), 6, 420));
        const mttd = Math.round(clamp((md.ext ? 9 : 7) * (1.25 - 0.55 * mat) * R.jit(0.5), 1, dur - 2));
        const cause = md.ext ? R.wpick(['Provider outage', 'Regional capacity constraint', 'Provider API degradation'], [0.55, 0.25, 0.20])
          : R.wpick(['Internal model-serving failure', 'Deployment / configuration error', 'GPU node failure'], [0.55, 0.25, 0.20]);
        const affected = AGENTS.filter(a => isRunning(a, m) && a.primary === md.id);
        const withFb = affected.filter(a => a.fallback);
        const fbTried = withFb.length > 0;
        const fbOk = fbTried && R.chance(0.84 + 0.1 * mat);
        let est = 0, avoided = 0, avoidedMin = 0;
        affected.forEach(a => {
          const cpm = WFI[a.wf].cpm * a.scale * 0.3;
          const impactMin = (a.fallback && fbOk) ? Math.min(dur, mttd + 4) : dur;
          est += cpm * impactMin;
          if (a.fallback && fbOk) { avoided += cpm * (dur - impactMin); avoidedMin += dur - impactMin; }
        });
        const critHit = affected.some(a => WFI[a.wf].crit && !(a.fallback && fbOk));
        const actual = (critHit && dur > 45) ? est * R.range(0.25, 0.5) : 0;
        const sev = (dur > 120 || (critHit && dur > 60)) ? 'Critical' : dur > 45 ? 'High' : 'Medium';
        OUT_MODEL.push({
          id: 'OUT-M-' + MONTHS[m].key.replace('-', '') + '-' + md.id.split('-')[1].slice(0, 3) + (k + 1),
          kind: 'model', m: m, day: R.int(1, MONTHS[m].days), hour: R.int(0, 23), mo: md.id, prov: md.provider, cause: cause,
          dur: dur, mttd: mttd, mttr: dur - mttd, fbTried: fbTried, fbOk: fbOk, sev: sev,
          wfs: Array.from(new Set(affected.map(a => a.wf))), agents: affected.map(a => a.id),
          impactEst: Math.round(est), impactActual: Math.round(actual), avoided: Math.round(avoided), avoidedMin: avoidedMin,
          slaBreach: md.ext && dur > 43
        });
      }
    }
  }
  const OUT_INFRA = [];
  const INFRA_CAUSE = {
    gpu: ['GPU hardware fault (Xid)', 'Thermal / cooling event', 'Driver regression'],
    k8s: ['Control-plane failure', 'Node pool exhaustion', 'Change / configuration error'],
    serving: ['Inference server crash', 'Capacity exhaustion', 'Deployment / configuration error'],
    gateway: ['Gateway software defect', 'Certificate expiry', 'Change / configuration error'],
    lb: ['Load-balancer failover fault', 'Change / configuration error', 'Health-check misconfiguration'],
    network: ['WAN carrier outage', 'Core switch failure', 'DNS failure'],
    storage: ['Storage controller failover', 'Capacity threshold', 'Firmware defect'],
    vectordb: ['Index corruption', 'Replica lag', 'Memory exhaustion']
  };
  for (let m = 0; m < NM; m++) {
    const mat = MATURITY(m);
    for (const c of COMPONENTS) {
      const R = RNG('outI|' + c.id + '|' + m);
      const n = R.pois(c.lam);
      for (let k = 0; k < n; k++) {
        const dur = Math.round(clamp(R.logn(40, 0.8), 5, 480));
        const mttd = Math.round(clamp(8 * (1.2 - 0.5 * mat) * R.jit(0.6), 1, dur - 2));
        const foTried = c.crit && R.chance(0.75);
        const foOk = foTried && R.chance(0.78 + 0.14 * mat);
        let affected;
        if (c.type === 'gpu' || c.type === 'serving' || c.type === 'k8s') affected = AGENTS.filter(a => isRunning(a, m) && MI[a.primary].provider === 'On-prem vLLM');
        else if (c.type === 'vectordb' || c.type === 'storage') affected = AGENTS.filter(a => isRunning(a, m) && WFI[a.wf].rag);
        else affected = AGENTS.filter(a => isRunning(a, m));
        const impactMin = foOk ? Math.min(dur, mttd + 5) : dur;
        const cpmSum = affected.reduce((s, a) => s + WFI[a.wf].cpm * a.scale, 0) * 0.12;
        const est = cpmSum * impactMin;
        const actual = (!foOk && dur > 30 && c.crit) ? est * R.range(0.2, 0.45) : 0;
        const sev = (dur > 120 || ((c.type === 'gateway' || c.type === 'network') && !foOk && dur > 30)) ? 'Critical' : dur > 45 ? 'High' : 'Medium';
        OUT_INFRA.push({
          id: 'OUT-I-' + MONTHS[m].key.replace('-', '') + '-' + c.id.replace('-', '') + (k + 1),
          kind: 'infra', m: m, day: R.int(1, MONTHS[m].days), hour: R.int(0, 23), comp: c.id, cause: R.pick(INFRA_CAUSE[c.type]),
          dur: dur, mttd: mttd, mttr: dur - mttd, foTried: foTried, foOk: foOk, sev: sev,
          wfs: Array.from(new Set(affected.map(a => a.wf))), agents: affected.map(a => a.id),
          impactEst: Math.round(est), impactActual: Math.round(actual), avoided: foOk ? Math.round(cpmSum * (dur - impactMin)) : 0
        });
      }
    }
  }
  const downFrac = {}; MODELS.forEach(md => { downFrac[md.id] = new Array(NM).fill(0); });
  OUT_MODEL.forEach(o => { downFrac[o.mo][o.m] += o.dur / minutesIn(o.m); });
  const infraDown = {}; COMPONENTS.forEach(c => { infraDown[c.id] = new Array(NM).fill(0); });
  OUT_INFRA.forEach(o => { infraDown[o.comp][o.m] += o.dur / minutesIn(o.m); });

  // provider quota pressure (sawtooth between capacity raises)
  const RAISES = { 'AZ-FRONTIER': [0, 7, 13, 18, 22], 'AZ-MINI': [0, 12, 20], 'BR-LARGE': [0, 9, 16, 21], 'BR-EMBED': [0, 14] };
  const UTIL0 = { 'AZ-FRONTIER': [0.64, 0.075], 'AZ-MINI': [0.55, 0.045], 'BR-LARGE': [0.60, 0.06], 'BR-EMBED': [0.45, 0.03] };
  function quotaUtil(mo, m) {
    const r = RAISES[mo];
    if (!r) return 0.6;
    let last = 0;
    r.forEach(x => { if (x <= m) last = x; });
    return UTIL0[mo][0] + UTIL0[mo][1] * (m - last);
  }
  const rlRate = u => 0.0006 + 0.2 * Math.pow(Math.max(0, u - 0.78), 2);

  // ------------------------------------------------------------------
  // Fact: agent activity (grain = month x agent x model x environment)
  // ------------------------------------------------------------------
  const ACT_FIELDS = ['tasks', 'succ', 'fail', 'escal', 'elig', 'auto', 'interv', 'ftr', 'rework', 'errEv', 'recov', 'slaElig', 'slaMet',
    'cmp', 'manMin', 'execMin', 'reviewMin', 'waitMin', 'retryMin', 'reworkMin', 'e2eMin', 'prodAed', 'apprReq', 'apprOk', 'runs', 'traced',
    'autoExec', 'unsafeAuto', 'toolExec', 'toolUnAtt', 'toolUnOk', 'hrAtt', 'hrBlk', 'piAtt', 'piOk', 'sensReq', 'sensExpo', 'sensViol',
    'a2aUn', 'xb', 'xbUn', 'loops', 'tokAnom', 'spikes',
    'tokIn', 'tokCached', 'tokOut', 'tokReason', 'tokWaste', 'costInf', 'cacheSave',
    'req', 'eApp', 'eRl', 'rlTpm', 'rlRpm', 'tpmEv', 'rpmEv', 'rlRecov', 'eGw', 'eNet', 'eProv', 'eSrv', 'eTo', 'ctxExc', 'outLim', 'fbElig', 'fbOk', 'genSec'];
  function ActRow(m, a, mo, env) {
    this.m = m; this.ag = a.id; this.mo = mo; this.prov = MI[mo].provider; this.env = env;
    this.tn = a.tenant; this.bu = a.bu; this.app = a.app; this.wf = a.wf; this.primary = mo === a.primary;
    for (let i = 0; i < ACT_FIELDS.length; i++) this[ACT_FIELDS[i]] = 0;
  }
  const act = [];
  const actOff = new Array(NM + 1).fill(0);
  const agg = { tokTn: {}, taskTn: {}, tokTotal: new Array(NM).fill(0), taskTotal: new Array(NM).fill(0), onpremTok: new Array(NM).fill(0), reqMo: {}, tokMo: {}, reqTotal: new Array(NM).fill(0), embedReq: new Array(NM).fill(0), onpremReq: {} };
  TENANTS.forEach(t => { agg.tokTn[t.id] = new Array(NM).fill(0); agg.taskTn[t.id] = new Array(NM).fill(0); });
  MODELS.forEach(md => { agg.reqMo[md.id] = new Array(NM).fill(0); agg.tokMo[md.id] = new Array(NM).fill(0); });

  for (let m = 0; m < NM; m++) {
    actOff[m] = act.length;
    const mat = MATURITY(m);
    for (const a of AGENTS) {
      if (!isRunning(a, m)) continue;
      const wf = WFI[a.wf];
      const age = m - a.start;
      const learn = 1 - 0.6 * Math.exp(-age / 7);
      const ramp = Math.min(1, 0.25 + 0.75 * age / 6);
      const R = RNG('act|' + a.id + '|' + m);
      const vol = wf.base * a.scale * ramp * Math.pow(1.015, m) * season(m) * R.jit(0.06);
      const tpt = wf.tok * 1000 * a.tokf * (1.10 - 0.14 * learn) * R.jit(0.04);
      for (const env of ENVS) {
        const prod = env === 'prod';
        const tasks = Math.max(1, Math.round(vol * (prod ? 0.9 : 0.1)));
        const row = new ActRow(m, a, a.primary, env);
        const sr = clamp(0.86 + 0.09 * learn - (prod ? 0 : 0.05) + R.range(-0.01, 0.01), 0.7, 0.985);
        const succ = R.binom(tasks, sr);
        const fail = R.binom(tasks - succ, 0.55);
        const elig = R.binom(tasks, clamp(wf.el * R.jit(0.04), 0, 0.98));
        const auto = Math.min(succ, R.binom(elig, clamp(0.50 + 0.32 * learn, 0, 0.95)));
        const ftr = R.binom(succ, clamp(0.80 + 0.12 * learn - (prod ? 0 : 0.04), 0.5, 0.97));
        const rework = R.binom(succ - ftr, 0.55);
        const errEv = R.binom(tasks * 2, clamp((0.12 - 0.04 * learn) / 2, 0, 1));
        const slaElig = R.binom(tasks, 0.7);
        const cmp = R.binom(succ, 0.93);
        const man = wf.man * R.jit(0.05);
        row.tasks = tasks; row.succ = succ; row.fail = fail; row.escal = tasks - succ - fail; row.elig = elig; row.auto = auto;
        row.interv = R.binom(tasks, clamp(0.16 - 0.08 * learn, 0.03, 0.3));
        row.ftr = ftr; row.rework = rework; row.errEv = errEv; row.recov = R.binom(errEv, clamp(0.80 + 0.12 * learn, 0, 0.98));
        row.slaElig = slaElig; row.slaMet = R.binom(slaElig, clamp(0.88 + 0.08 * learn, 0, 0.995));
        row.cmp = cmp;
        row.manMin = cmp * man;
        row.execMin = cmp * man * wf.ex;
        row.reviewMin = cmp * man * (0.20 - 0.08 * learn) * wf.rv;
        row.waitMin = cmp * man * (0.12 - 0.05 * learn) * wf.rv;
        row.retryMin = cmp * man * (0.04 - 0.02 * learn);
        row.reworkMin = cmp * man * (0.06 - 0.03 * learn);
        row.e2eMin = row.execMin + row.reviewMin + row.waitMin + row.retryMin + row.reworkMin;
        row.prodAed = (row.manMin - row.e2eMin) / 60 * BUI[a.bu].rate;
        row.apprReq = R.binom(tasks, wf.hr);
        row.apprOk = R.binom(row.apprReq, clamp(0.965 + 0.03 * learn, 0, 0.998));
        row.runs = Math.round(tasks * 1.12);
        const traceCov = (m >= a.traceFrom) ? clamp(0.985 + R.range(0, 0.013), 0, 0.999) : 0.62;
        row.traced = R.binom(row.runs, traceCov);
        row.autoExec = Math.round(auto * 2.4);
        row.unsafeAuto = R.binom(row.autoExec, clamp(0.0007 - 0.0005 * mat, 0.0001, 1));
        row.toolExec = Math.round(tasks * wf.tc * R.jit(0.05));
        row.toolUnAtt = R.binom(row.toolExec, (0.0018 - 0.0011 * mat) * (prod ? 1 : 1.5));
        row.toolUnOk = R.binom(row.toolUnAtt, clamp(0.0015 - 0.001 * mat, 0.0004, 1));
        row.hrAtt = R.binom(tasks, 0.0003 * (wf.priv ? 2 : 1));
        row.hrBlk = R.binom(row.hrAtt, clamp(0.94 + 0.055 * mat, 0, 0.997));
        row.piAtt = R.binom(tasks, wf.pi * (prod ? 1 : 0.3));
        row.piOk = R.binom(row.piAtt, clamp(0.0005 - 0.0003 * mat, 0.00015, 1));
        row.sensReq = R.binom(tasks, wf.sens);
        row.sensExpo = R.binom(row.sensReq, clamp(0.09 - 0.04 * mat, 0.03, 1));
        row.sensViol = R.binom(row.sensExpo, clamp(0.10 - 0.04 * mat, 0.03, 1));
        row.a2aUn = prod ? R.pois(wf.a2a ? 0.15 * (1.2 - mat) : 0.02) : 0;
        row.loops = R.pois(tasks * 0.00012 * (1.3 - 0.6 * mat));
        row.tokAnom = R.pois(tasks * 0.0008 * (1.2 - 0.4 * mat));
        row.spikes = prod ? R.pois(0.18) : 0;
        const wasteFrac = clamp(fail / tasks * 0.9 + rework / tasks * 0.3 + 0.02 + R.range(0, 0.008), 0.01, 0.3);

        // split tokens across serving models
        const parts = [[a.primary, 0.88]];
        if (m >= 3) parts.push(['OP-GUARD', 0.04]);
        if (wf.rag) parts.push(['BR-EMBED', 0.08]);
        const sh = parts.reduce((s, p) => s + p[1], 0);
        const total = tasks * tpt;
        for (const p of parts) {
          const md = MI[p[0]];
          const r = p[0] === a.primary ? row : new ActRow(m, a, p[0], env);
          const tok = total * p[1] / sh;
          const outShare = md.embed ? 0 : (p[0] === 'OP-GUARD' ? 0.02 : wf.out * (md.reason ? 1.3 : 1));
          const tokOut = Math.round(tok * outShare);
          const tokIn = Math.round(tok - tokOut);
          const cacheR = md.embed ? 0 : clamp(wf.cache * (0.55 + 0.45 * mat) * R.jit(0.08), 0, 0.85);
          const tokCached = Math.round(tokIn * cacheR);
          r.tokIn = tokIn; r.tokCached = tokCached; r.tokOut = tokOut;
          r.tokReason = md.reason ? Math.round(tokOut * R.range(0.42, 0.52)) : 0;
          r.tokWaste = Math.round((tokIn + tokOut) * wasteFrac);
          r.costInf = ((tokIn - tokCached) * md.p_in + tokCached * md.p_cache + tokOut * md.p_out) / 1e6;
          r.cacheSave = tokCached * (md.p_in - md.p_cache) / 1e6;
          const req = Math.max(1, Math.round((tokIn + tokOut) / md.tpr));
          const u = md.ext ? quotaUtil(md.id, m) : 0.6;
          const eApp = R.binom(req, prod ? 0.0022 : 0.004);
          const eRl = R.binom(req, md.ext ? rlRate(u) : 0.0004);
          const rlTpm = R.binom(eRl, 0.7);
          const eGw = R.binom(req, 0.00015 + infraDown.GW[m] * 0.9 + infraDown.LB[m] * 0.5);
          const eNet = R.binom(req, 0.00006 + infraDown.NET[m] * 0.9);
          const eligReq = Math.max(0, req - eApp - eRl - eGw - eNet);
          const df = downFrac[md.id][m];
          const f5 = R.binom(eligReq, (md.ext ? 0.00045 : 0.0006) * (prod ? 1 : 1.8) + df * 0.92);
          const eTo = R.binom(eligReq - f5, 0.00028 + df * 0.04);
          r.req = req; r.eApp = eApp; r.eRl = eRl; r.rlTpm = rlTpm; r.rlRpm = eRl - rlTpm;
          r.tpmEv = rlTpm > 0 ? Math.max(1, Math.round(rlTpm / R.range(30, 70))) : 0;
          r.rpmEv = (eRl - rlTpm) > 0 ? Math.max(1, Math.round((eRl - rlTpm) / R.range(25, 55))) : 0;
          r.rlRecov = R.binom(eRl, clamp(0.955 + 0.03 * mat, 0, 0.995));
          r.eGw = eGw; r.eNet = eNet;
          if (md.ext) r.eProv = f5; else r.eSrv = f5;
          r.eTo = eTo;
          r.ctxExc = md.embed ? 0 : R.binom(req, wf.ctx * 6);
          r.outLim = md.embed ? 0 : R.binom(req, 0.0011);
          if (p[0] === a.primary && a.fallback) {
            const fe = R.binom(f5 + eTo, 0.95);
            const tested = a.fbTestedFrom != null && m >= a.fbTestedFrom;
            r.fbElig = fe; r.fbOk = R.binom(fe, tested ? 0.965 : 0.72);
          }
          r.genSec = md.tps ? tokOut / (md.tps * R.jit(0.05)) : 0;
          if (md.residency !== 'UAE' && !md.embed) {
            r.xb = R.binom(req, wf.sens * 0.7);
            r.xbUn = (a.xbApprovedFrom != null && m >= a.xbApprovedFrom) ? 0 : r.xb;
          }
          if (r !== row) act.push(r);
          agg.reqMo[md.id][m] += req; agg.tokMo[md.id][m] += tokIn + tokOut; agg.reqTotal[m] += req;
          if (md.embed) agg.embedReq[m] += req;
          if (!md.ext) agg.onpremTok[m] += tokIn + tokOut;
          agg.tokTn[a.tenant][m] += tokIn + tokOut; agg.tokTotal[m] += tokIn + tokOut;
        }
        act.push(row);
        agg.taskTn[a.tenant][m] += tasks; agg.taskTotal[m] += tasks;
      }
    }
  }
  actOff[NM] = act.length;
  // inference spend by month (for allocation/budgets)
  const infSpend = new Array(NM).fill(0), infSpendTn = {};
  TENANTS.forEach(t => { infSpendTn[t.id] = new Array(NM).fill(0); });
  act.forEach(r => { infSpend[r.m] += r.costInf; infSpendTn[r.tn][r.m] += r.costInf; });

  // ------------------------------------------------------------------
  // Fact: AI infrastructure (grain = month x component)
  // ------------------------------------------------------------------
  const gpuCount = (cid, m) => cid === 'GPU-DXB1' ? (m < 12 ? 32 : m < 20 ? 48 : 64) : (m < 16 ? 16 : 24);
  const k8sNodes = m => m < 12 ? 20 : m < 20 ? 30 : 38;
  const INF_FIELDS = ['req', 'ok', 'gpus', 'gpuHrsSched', 'gpuHrsAvail', 'gpuBusyHrs', 'gpuMemHiHrs', 'gpuFail', 'satEv', 'peak', 'nodeHrsSched', 'nodeHrsReady', 'podStarts', 'podFails',
    'foTests', 'foOk', 'rtoTests', 'rtoMet', 'rpoTests', 'rpoMet', 'assets', 'monitored', 'cost', 'util'];
  function InfRow(m, c) { this.m = m; this.comp = c.id; this.type = c.type; for (let i = 0; i < INF_FIELDS.length; i++) this[INF_FIELDS[i]] = 0; }
  const inf = [], infOff = new Array(NM + 1).fill(0);
  const infraCost = new Array(NM).fill(0);
  const opTokLast = agg.onpremTok[LAST];
  const gpuUtil = {}; COMPONENTS.forEach(c => { gpuUtil[c.id] = new Array(NM).fill(0); });
  for (let m = 0; m < NM; m++) {
    infOff[m] = inf.length;
    const mat = MATURITY(m);
    const hours = MONTHS[m].days * 24;
    const totalGpu = gpuCount('GPU-DXB1', m) + gpuCount('GPU-AUH2', m);
    const demand = 0.71 * 88 * agg.onpremTok[m] / opTokLast;
    const opReq = agg.reqMo['OP-70B'][m] + agg.reqMo['OP-GUARD'][m];
    for (const c of COMPONENTS) {
      const R = RNG('inf|' + c.id + '|' + m);
      const row = new InfRow(m, c);
      const dfc = infraDown[c.id][m];
      let base = 0.0001;
      switch (c.type) {
        case 'gateway': row.req = agg.reqTotal[m]; base = 0.0001; break;
        case 'lb': row.req = agg.reqTotal[m]; base = 0.00005; break;
        case 'network': row.req = Math.round(agg.reqTotal[m] * 1.3); base = 0.00003; break;
        case 'serving': row.req = opReq; base = 0.0004; break;
        case 'k8s': row.req = Math.round(agg.reqTotal[m] * 0.4); base = 0.0002; break;
        case 'vectordb': row.req = agg.embedReq[m] * 3; base = 0.0006; break;
        case 'storage': row.req = Math.round(agg.embedReq[m] * 1.5 + 2e6); base = 0.00004; break;
        case 'gpu': row.req = c.id === 'GPU-DXB1' ? agg.reqMo['OP-70B'][m] : agg.reqMo['OP-GUARD'][m]; base = 0.0003; break;
      }
      row.ok = row.req - R.binom(row.req, base + dfc * 0.95);
      if (c.type === 'gpu') {
        const g = gpuCount(c.id, m);
        const util = clamp(demand / totalGpu * R.jit(0.03), 0.05, 0.97);
        const peakU = clamp(util * 1.19 * R.jit(0.02), 0.1, 0.99);
        row.gpus = g; row.util = util;
        row.gpuHrsSched = g * hours;
        row.gpuFail = R.pois(g * 0.0105);
        const unavail = row.gpuFail * R.range(18, 60) + dfc * row.gpuHrsSched + 0.003 * row.gpuHrsSched;
        row.gpuHrsAvail = row.gpuHrsSched - unavail;
        row.gpuBusyHrs = row.gpuHrsAvail * util;
        row.gpuMemHiHrs = row.gpuBusyHrs * clamp(0.02 + (util - 0.5) * 0.55, 0.01, 0.4);
        row.satEv = R.pois(Math.max(0, util - 0.62) * 260);
        row.peak = Math.round(g * peakU * 10) / 10;
        row.cost = row.gpuHrsSched * 5.2;
        gpuUtil[c.id][m] = util;
      }
      if (c.type === 'k8s') {
        const n = k8sNodes(m);
        row.nodeHrsSched = n * hours;
        row.nodeHrsReady = row.nodeHrsSched * (1 - R.range(0.002, 0.004)) - dfc * row.nodeHrsSched * 0.6;
        row.podStarts = Math.round(90000 * (n / 20) * Math.pow(1.02, m) * R.jit(0.05));
        row.podFails = R.binom(row.podStarts, 0.024 - 0.009 * mat);
        row.cost = row.nodeHrsSched * 1.6;
      }
      const fixedCost = { serving: 12000 + 6000 * mat, gateway: 22000, lb: 9000, network: 18000, storage: 26000 + 14000 * mat, vectordb: 38000 + 14000 * mat };
      if (fixedCost[c.type] != null) row.cost = fixedCost[c.type] * R.jit(0.03);
      const assetsBase = { gpu: gpuCount(c.id, m) / 8 + 2, k8s: k8sNodes(m), serving: 12 + Math.round(8 * mat), gateway: 4, lb: 6, network: 24, storage: 10, vectordb: 6 + Math.round(3 * mat) };
      row.assets = Math.round(assetsBase[c.type]);
      row.monitored = Math.min(row.assets, Math.round(row.assets * clamp(0.83 + 0.15 * mat + R.range(-0.03, 0.02), 0, 1)));
      if (m % 3 === 1 && c.crit) {
        row.foTests = 1; row.foOk = R.chance(0.82 + 0.12 * mat) ? 1 : 0;
        row.rtoTests = 1; row.rtoMet = R.chance(0.76 + 0.14 * mat) ? 1 : 0;
        row.rpoTests = 1; row.rpoMet = R.chance(0.86 + 0.10 * mat) ? 1 : 0;
      }
      infraCost[m] += row.cost;
      inf.push(row);
    }
    infraCost[m] += 15000 + 9000 * mat; // observability stack
  }
  infOff[NM] = inf.length;

  // ------------------------------------------------------------------
  // Fact: tenant-month (allocated costs, budgets, workforce, DLP, CASB)
  // ------------------------------------------------------------------
  const TEN_FIELDS = ['infra', 'lic', 'plat', 'lab', 'budAI', 'budTok', 'tokens', 'aiSpend', 'dlpBlk', 'dlpFp', 'fte', 'cases', 'users', 'shadowUsers', 'autoInScope', 'autoDone'];
  function TenRow(m, t) { this.m = m; this.tn = t.id; this.bu = t.bu; for (let i = 0; i < TEN_FIELDS.length; i++) this[TEN_FIELDS[i]] = 0; }
  const ten = [], tenOff = new Array(NM + 1).fill(0);
  const AUTO_SCOPE = { 'FIN-RB': 28, 'FIN-PAY': 16, 'HLT-HOS': 30, 'HLT-LAB': 12, 'ENR-PWR': 24, 'ENR-OGS': 18, 'GOV-SSA': 22, 'GOV-MUN': 20, 'GSS-IT': 34, 'GSS-FHR': 18 };
  const autoFrom = {};
  TENANTS.forEach(t => {
    const R = RNG('auto|' + t.id);
    const firstAgent = Math.min.apply(null, AGENTS.filter(a => a.tenant === t.id).map(a => a.start));
    autoFrom[t.id] = [];
    for (let i = 0; i < AUTO_SCOPE[t.id]; i++) autoFrom[t.id].push(R.chance(0.62) ? firstAgent + R.int(0, 26) : null);
  });
  const lagShare = (series, tot, m) => {
    let s = 0, n = 0;
    for (let k = Math.max(0, m - 3); k < m; k++) { if (tot[k] > 0) { s += series[k] / tot[k]; n++; } }
    return n ? s / n : (tot[m] > 0 ? series[m] / tot[m] : 0);
  };
  for (let m = 0; m < NM; m++) {
    tenOff[m] = ten.length;
    const mat = MATURITY(m);
    const lic = 60000 + 70000 * mat;
    const plat = 210000 + 90000 * mat;
    const lab = 380000 + 270000 * mat;
    const budGroup = (infSpend[m] + infraCost[m] + lic) * 1.04;
    const budTokGroup = agg.tokTotal[m] * 1.10;
    for (const t of TENANTS) {
      const R = RNG('ten|' + t.id + '|' + m);
      const row = new TenRow(m, t);
      const tokSh = agg.tokTotal[m] ? agg.tokTn[t.id][m] / agg.tokTotal[m] : 0;
      const taskSh = agg.taskTotal[m] ? agg.taskTn[t.id][m] / agg.taskTotal[m] : 0;
      row.tokens = agg.tokTn[t.id][m];
      row.infra = infraCost[m] * tokSh;
      row.lic = lic * tokSh;
      row.plat = plat * taskSh;
      row.lab = lab * taskSh;
      row.aiSpend = infSpendTn[t.id][m] + row.infra + row.lic;
      const ls = lagShare(agg.tokTn[t.id], agg.tokTotal, m);
      row.budAI = row.tokens > 0 ? budGroup * Math.max(ls, tokSh * 0.96) * R.jit(0.05) : 0;
      row.budTok = row.tokens > 0 ? budTokGroup * Math.max(ls, tokSh * 0.96) * R.jit(0.05) : 0;
      row.users = Math.round(t.users * Math.pow(1.003, m));
      row.dlpBlk = Math.round(row.users * 0.012 * R.jit(0.2));
      row.dlpFp = R.binom(row.dlpBlk, 0.22 - 0.08 * mat);
      row.fte = t.fte;
      const uplift = agg.taskTn[t.id][LAST] > 0 ? 0.48 * Math.min(1.1, agg.taskTn[t.id][m] / agg.taskTn[t.id][LAST]) : 0;
      row.cases = Math.round(t.fte * PROGRAMME.baselineCasesPerFte * (1 + uplift) * R.jit(0.04));
      row.shadowUsers = Math.round(row.users * clamp(0.115 - 0.06 * mat + R.range(-0.006, 0.006), 0.02, 0.2));
      row.autoInScope = AUTO_SCOPE[t.id];
      row.autoDone = autoFrom[t.id].filter(f => f != null && f <= m).length;
      ten.push(row);
    }
  }
  tenOff[NM] = ten.length;

  // ------------------------------------------------------------------
  // Records: security incidents and finance-approved value ledger
  // ------------------------------------------------------------------
  const INC_TYPES = [
    { t: 'Phishing / credential theft', w: [1, 1, 1, 1, 1], c: ['SOC', 'SOAR', 'AI Agents', 'IAM/PAM'] },
    { t: 'Business email compromise', w: [0.8, 0.5, 0.6, 0.5, 0.9], c: ['SOC', 'SOAR', 'AI Agents', 'DLP'], fraud: true },
    { t: 'Payment fraud', w: [1.2, 0.1, 0.1, 0.1, 0.3], c: ['AI Agents', 'SOC', 'IAM/PAM'], fraud: true },
    { t: 'Ransomware attempt', w: [0.25, 0.35, 0.35, 0.3, 0.25], c: ['EDR/XDR', 'SOC', 'Backup', 'NDR'], up: true },
    { t: 'Malware', w: [0.6, 0.6, 0.6, 0.6, 0.6], c: ['EDR/XDR', 'SOC', 'SOAR'] },
    { t: 'Data exfiltration attempt', w: [0.35, 0.4, 0.2, 0.3, 0.25], c: ['DLP', 'NDR', 'SOC', 'Firewall'] },
    { t: 'Account takeover', w: [0.6, 0.2, 0.2, 0.4, 0.2], c: ['IAM/PAM', 'SOC', 'AI Agents'], fraud: true },
    { t: 'DDoS', w: [0.35, 0.1, 0.15, 0.4, 0.05], c: ['WAF', 'Firewall', 'NDR'] },
    { t: 'Insider misuse', w: [0.2, 0.25, 0.15, 0.15, 0.2], c: ['DLP', 'IAM/PAM', 'SOC'] },
    { t: 'Cloud misconfiguration exposure', w: [0.3, 0.25, 0.2, 0.3, 0.35], c: ['Cloud Security', 'CTEM', 'Vulnerability Mgmt'] },
    { t: 'Vulnerability exploitation', w: [0.35, 0.3, 0.4, 0.35, 0.35], c: ['Vulnerability Mgmt', 'WAF', 'CTEM', 'EDR/XDR', 'AppSec'] },
    { t: 'AI prompt injection', w: [0.12, 0.1, 0.06, 0.15, 0.1], c: ['AI Agents', 'AppSec', 'SOC'], ai: true },
    { t: 'AI data leakage', w: [0.1, 0.12, 0.05, 0.08, 0.08], c: ['DLP', 'AI Agents', 'GRC'], ai: true },
    { t: 'RAG / memory poisoning', w: [0.02, 0.02, 0.02, 0.025, 0.025], c: ['AI Agents', 'AppSec', 'SOC'], ai: true, up: true },
    { t: 'Shadow AI data exposure', w: [0.1, 0.12, 0.06, 0.1, 0.06], c: ['DLP', 'GRC', 'Cloud Security'], ai: true },
    { t: 'Agent unauthorized action', w: [0.06, 0.04, 0.04, 0.05, 0.07], c: ['AI Agents', 'IAM/PAM', 'SOC'], ai: true }
  ];
  const BU_COL = { FIN: 0, HLT: 1, ENR: 2, GOV: 3, GSS: 4 };
  const SEV = ['Critical', 'High', 'Medium', 'Low'];
  const POT_MEDIAN = { Critical: 2.7e6, High: 420e3, Medium: 62e3, Low: 11e3 };
  const RESP_MEDIAN = { Critical: 250e3, High: 60e3, Medium: 12e3, Low: 3e3 };
  const CONTAIN_MEDIAN = { Critical: 9, High: 7, Medium: 5, Low: 2.5 };
  const incidents = [], fin = [];
  const SAVINGS = [
    ['SOC', 'Tier-1 MSSP monitoring scope reduced (AI triage)', ['GSS-IT', 'FIN-RB', 'HLT-HOS', 'GOV-SSA', 'ENR-PWR']],
    ['SIEM', 'SIEM ingest optimisation & tiered retention', ['GSS-IT']],
    ['SOAR', 'Automated playbooks: overtime & on-call reduction', ['GSS-IT', 'FIN-RB', 'GOV-SSA']],
    ['EDR/XDR', 'EDR/XDR licence consolidation', ['GSS-IT', 'HLT-HOS']],
    ['Firewall', 'Rule-base consolidation: hardware refresh deferred', ['GSS-IT', 'ENR-PWR', 'GOV-MUN']],
    ['WAF', 'WAF managed-service renegotiation', ['FIN-PAY', 'GOV-SSA']],
    ['NDR', 'NDR sensor rationalisation', ['GSS-IT', 'ENR-OGS']],
    ['DLP', 'DLP policy tuning: contractor reviewers released', ['FIN-RB', 'HLT-HOS', 'GSS-FHR']],
    ['IAM/PAM', 'Access-request automation: IAM contractor reduction', ['GSS-IT', 'FIN-RB', 'HLT-HOS', 'ENR-PWR']],
    ['CTEM', 'CTEM platform replacing point scanners', ['GSS-IT']],
    ['Vulnerability Mgmt', 'Scanner licence consolidation', ['GSS-IT', 'ENR-PWR']],
    ['DFIR', 'DFIR retainer hours reduced', ['GSS-IT']],
    ['Backup', 'Backup storage tiering & de-duplication', ['GSS-IT', 'HLT-LAB', 'GOV-MUN']],
    ['Cloud Security', 'Cloud posture fixes: idle resources removed', ['GSS-IT', 'FIN-PAY', 'GOV-SSA']],
    ['AppSec', 'Automated code review: external pen-test re-tests avoided', ['GSS-IT', 'FIN-PAY']],
    ['GRC', 'Automated evidence collection: external audit fees reduced', ['GSS-FHR', 'FIN-RB', 'GOV-MUN']],
    ['AI Agents', 'Service-desk deflection: contractor seats released', ['GSS-IT', 'FIN-RB', 'HLT-HOS', 'ENR-PWR', 'GOV-MUN', 'HLT-LAB']],
    ['AI Agents', 'KYC / claims review outsourcing reduced', ['FIN-RB', 'FIN-PAY', 'HLT-HOS', 'HLT-LAB']],
    ['AI Agents', 'Reconciliation & invoice matching: temp staff released', ['GSS-FHR', 'FIN-PAY']],
    ['AI Agents', 'Citizen-service backlog contractors released', ['GOV-SSA', 'GOV-MUN']]
  ];
  for (let m = 0; m < NM; m++) {
    const mat = MATURITY(m);
    for (const t of TENANTS) {
      const R = RNG('sec-inc|' + t.id + '|' + m);
      const n = R.pois(t.inc * (1 + 0.08 * Math.sin(m / 2)));
      const col = BU_COL[t.bu];
      for (let k = 0; k < n; k++) {
        const ty = R.wpick(INC_TYPES, INC_TYPES.map(x => x.w[col] * (x.ai ? (0.35 + 0.9 * mat) : 1)));
        let sev = R.wpick(SEV, ty.up ? [0.08, 0.3, 0.42, 0.2] : [0.03, 0.14, 0.43, 0.40]);
        const potential = Math.round(R.logn(POT_MEDIAN[sev], sev === 'Critical' ? 0.45 : sev === 'High' ? 0.65 : 0.8) * (0.6 + 0.6 * t.size));
        const mitigated = R.chance((sev === 'Critical' ? 0.80 : 0.88) + 0.07 * mat);
        const verified = mitigated && potential > 50000 && R.chance(0.68);
        const prevented = verified ? Math.round(potential * R.range(0.7, 1.0)) : 0;
        const actualLoss = mitigated ? 0 : Math.round(potential * R.range(0.15, 0.6));
        const ctls = [ty.c[0]].concat(R.shuffle(ty.c.slice(1)).slice(0, R.int(1, Math.min(3, ty.c.length - 1))));
        if ((sev === 'Critical' || sev === 'High') && ctls.indexOf('DFIR') < 0) ctls.push('DFIR');
        const w = ctls.map((c, i) => i === 0 ? 0.5 : 0.5 / (ctls.length - 1));
        const id = 'INC-' + MONTHS[m].key.replace('-', '') + '-' + t.id.split('-')[1] + String(k + 1).padStart(2, '0');
        const inc = {
          id: id, m: m, day: R.int(1, MONTHS[m].days), tn: t.id, bu: t.bu, sev: sev, type: ty.t, ai: !!ty.ai, fraud: !!ty.fraud,
          major: sev === 'Critical' || (sev === 'High' && potential >= 1e6),
          mitigated: mitigated, verified: verified, potential: potential, prevented: prevented, actualLoss: actualLoss,
          respCost: Math.round(R.logn(RESP_MEDIAN[sev], 0.5)),
          detectH: round2(clamp(R.logn(1.5 * (1.2 - 0.4 * mat), 0.6), 0.1, 48)),
          containH: round2(clamp(R.logn(CONTAIN_MEDIAN[sev] * (sev === 'Critical' || sev === 'High' ? (1.15 - 0.45 * mat) : 1), 0.5), 0.3, 96)),
          controls: ctls.map((c, i) => ({ ctl: c, w: w[i] })),
          action: mitigated ? 'Post-incident review closed' : 'Remediation plan in progress'
        };
        incidents.push(inc);
        if (verified) {
          // attributed shares are rounded to whole AED; the rounding remainder goes to the primary control
          const amts = inc.controls.map(c => Math.round(prevented * c.w));
          amts[0] += prevented - amts.reduce((a, x) => a + x, 0);
          inc.controls.forEach((c, i) => {
            fin.push({ id: id + '-LP' + (i + 1), m: m, tn: t.id, bu: t.bu, ctl: c.ctl, cat: 'loss_prevented', inc: id, claim: prevented, amt: amts[i], status: 'Approved', desc: ty.t + ' prevented (' + sev + ')' });
          });
        }
      }
      // finance-approved savings
      const opts = SAVINGS.filter(s => s[2].indexOf(t.id) >= 0);
      const ns = opts.length ? R.pois((0.6 + 1.1 * mat) * (t.id === 'GSS-IT' ? 2.2 : 1)) : 0;
      for (let k = 0; k < ns; k++) {
        const s = R.pick(opts);
        const st = R.wpick(['Approved', 'Pending', 'Rejected'], [0.8, 0.15, 0.05]);
        fin.push({ id: 'SAV-' + MONTHS[m].key.replace('-', '') + '-' + t.id.split('-')[1] + (k + 1), m: m, tn: t.id, bu: t.bu, ctl: s[0], cat: 'saving', inc: null, claim: 0, amt: Math.round(R.logn(92000, 0.55) * (0.7 + 0.6 * t.size)), status: st, desc: s[1] });
      }
    }
  }

  // ------------------------------------------------------------------
  // Risk register: FAIR-style scenarios per tenant, monthly snapshot
  // ------------------------------------------------------------------
  const SCENARIOS = [
    { id: 'RS-01', name: 'Ransomware & extortion', bus: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], lef: 0.35, lm: 38, ai: false },
    { id: 'RS-02', name: 'BEC & payment fraud', bus: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], lef: 2.2, lm: 3.5, ai: false },
    { id: 'RS-03', name: 'Customer / patient data breach', bus: ['FIN', 'HLT', 'GOV'], lef: 0.45, lm: 28, ai: false },
    { id: 'RS-04', name: 'OT / critical service disruption', bus: ['ENR', 'GOV'], lef: 0.15, lm: 60, ai: false },
    { id: 'RS-05', name: 'Cloud misconfiguration exposure', bus: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], lef: 0.9, lm: 6, ai: false },
    { id: 'RS-06', name: 'Insider data theft', bus: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], lef: 0.5, lm: 8, ai: false },
    { id: 'RS-07', name: 'Third-party / supply-chain compromise', bus: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], lef: 0.3, lm: 15, ai: false },
    { id: 'RS-08', name: 'DDoS on digital channels', bus: ['FIN', 'HLT', 'GOV'], lef: 1.2, lm: 2.5, ai: false },
    { id: 'RS-09', name: 'AI agent misuse / unauthorized action', bus: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], lef: 0.8, lm: 5, ai: true },
    { id: 'RS-10', name: 'Prompt injection leading to data leakage', bus: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], lef: 1.1, lm: 4, ai: true },
    { id: 'RS-11', name: 'Shadow AI data leakage', bus: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], lef: 1.6, lm: 2.2, ai: true },
    { id: 'RS-12', name: 'Model / AI supply-chain compromise', bus: ['FIN', 'HLT', 'ENR', 'GOV', 'GSS'], lef: 0.2, lm: 9, ai: true }
  ];
  const risk = [], riskOff = new Array(NM + 1).fill(0);
  const aiAdoption = m => agg.taskTotal[m] / agg.taskTotal[LAST];
  for (let m = 0; m < NM; m++) {
    riskOff[m] = risk.length;
    const mat = MATURITY(m);
    for (const t of TENANTS) {
      for (const s of SCENARIOS) {
        if (s.bus.indexOf(t.bu) < 0) continue;
        const R = RNG('risk|' + t.id + '|' + s.id + '|' + m);
        const R0 = RNG('risk0|' + t.id + '|' + s.id);
        const bLef = s.lef * t.size * R0.range(0.8, 1.2) * (s.ai ? (0.5 + 0.5 * aiAdoption(m)) : 1);
        const bLm = s.lm * 1e6 * (0.5 + 0.5 * t.size) * R0.range(0.85, 1.15);
        const rf = clamp(0.66 - 0.28 * mat + R.range(-0.02, 0.02) + (s.ai ? 0.08 : 0), 0.2, 1);
        const lf = clamp(0.92 - 0.15 * mat + R.range(-0.01, 0.01), 0.5, 1);
        risk.push({ m: m, tn: t.id, bu: t.bu, sc: s.id, ai: s.ai, bLef: bLef, bLm: bLm, rLef: bLef * rf, rLm: bLm * lf });
      }
    }
  }
  riskOff[NM] = risk.length;
  // calibrate the synthetic register to a group baseline ALE of ~AED 410M at the latest month
  (function calibrate() {
    let base = 0;
    for (let i = riskOff[LAST]; i < riskOff[NM]; i++) base += risk[i].bLef * risk[i].bLm;
    const f = 410e6 / base;
    risk.forEach(r => { r.bLm *= f; r.rLm *= f; });
  })();

  // ------------------------------------------------------------------
  // Inventories and governance records
  // ------------------------------------------------------------------
  const RI = RNG('inventory');
  const tenantIds = TENANTS.map(t => t.id);
  const SHADOW_AGENT_KINDS = ['RPA bot calling public LLM API', 'Team-built chat bot (collaboration suite)', 'Low-code flow agent', 'Browser automation agent', 'Notebook agent using personal API key', 'Spreadsheet macro calling LLM API', 'Unregistered vendor copilot plug-in'];
  const DISCOVERY = ['API-key telemetry at AI gateway', 'Workload-identity anomaly', 'CASB / SWG egress to LLM APIs', 'Code-repository secret scan', 'Network egress analytics (NDR)'];
  const shadowAgents = [];
  for (let i = 0; i < 22; i++) {
    const disc = Math.round(clamp(2 + 21 * Math.pow(RI.u(), 0.75), 2, 23));
    const res = RI.chance(0.9) ? disc + RI.int(1, 4) : null;
    shadowAgents.push({ id: 'SHA-' + String(i + 1).padStart(3, '0'), name: RI.pick(SHADOW_AGENT_KINDS), tn: RI.pick(tenantIds), via: RI.pick(DISCOVERY), from: disc, to: (res != null && res <= LAST) ? res : null, outcome: RI.chance(0.4) ? 'Registered & onboarded' : 'Decommissioned' });
  }
  shadowAgents.forEach(s => { s.bu = TNI[s.tn].bu; });
  const SHADOW_APPS = ['Consumer chatbot (web)', 'AI note-taker browser extension', 'Code assistant IDE plug-in', 'AI image generator', 'PDF summariser SaaS', 'AI translation service', 'Browser AI sidebar', 'AI meeting transcription', 'AI slide generator', 'Resume screening AI', 'AI spreadsheet add-in', 'Voice-cloning service'];
  const shadowApps = [];
  for (let i = 0; i < 84; i++) {
    const disc = RI.int(0, 23);
    const res = RI.chance(0.86) ? disc + RI.int(1, 6) : null;
    const tn = RI.pick(tenantIds);
    shadowApps.push({ id: 'SAI-' + String(i + 1).padStart(3, '0'), name: RI.pick(SHADOW_APPS), tn: tn, bu: TNI[tn].bu, users: RI.int(4, 380), from: disc, to: (res != null && res <= LAST) ? res : null, outcome: RI.chance(0.3) ? 'Sanctioned with controls' : 'Blocked at SWG' });
  }
  const mcp = [];
  for (let i = 0; i < 34; i++) {
    const tn = RI.pick(tenantIds);
    mcp.push({ id: 'MCP-' + String(i + 1).padStart(3, '0'), name: RI.pick(['ITSM tool server', 'SIEM query server', 'Ticketing server', 'Document store server', 'Identity lookup server', 'Payments ledger server', 'EHR read-only server', 'Asset register server', 'Code repository server', 'Knowledge base server']), tn: tn, bu: TNI[tn].bu, registered: true, from: RI.int(5, 23), to: null });
  }
  for (let i = 0; i < 15; i++) {
    const tn = RI.pick(tenantIds);
    const disc = RI.int(8, 23);
    const res = RI.chance(0.75) ? disc + RI.int(1, 4) : null;
    mcp.push({ id: 'MCP-U' + String(i + 1).padStart(2, '0'), name: RI.pick(['Developer laptop MCP server', 'Community file-system server', 'Unvetted web-search server', 'Team database server', 'Unapproved email server']), tn: tn, bu: TNI[tn].bu, registered: false, from: disc, to: (res != null && res <= LAST) ? res : null });
  }

  const ctlInst = [];
  CONTROL_CATALOG.forEach(c => {
    BUS.forEach(b => {
      const appl = c.fw.some(f => FWI[f].bu.indexOf(b.id) >= 0);
      const R = RNG('ctl|' + c.id + '|' + b.id);
      const inst = { id: c.id + '/' + b.id, ctl: c.id, name: c.name, family: c.family, fw: c.fw.filter(f => FWI[f].bu.indexOf(b.id) >= 0), bu: b.id, applicable: appl, implFrom: null, tests: [], drift: [] };
      if (appl) {
        inst.implFrom = R.chance(0.92) ? Math.round(clamp(Math.pow(R.u(), 0.8) * 26, 0, 30)) : null;
        if (inst.implFrom != null) {
          for (let m = inst.implFrom + 2; m <= LAST; m += 3) inst.tests.push({ m: m, effective: R.chance(0.78 + 0.15 * MATURITY(m)) });
          for (let m = inst.implFrom + 1; m <= LAST; m++) if (R.chance(0.012)) inst.drift.push(m);
        }
      }
      ctlInst.push(inst);
    });
  });

  const findings = [];
  for (let m = 0; m < NM; m++) {
    const R = RNG('findings|' + m);
    const n = R.pois(4.5);
    for (let k = 0; k < n; k++) {
      const bu = R.pick(BUS).id;
      const sev = R.wpick(SEV, [0.08, 0.27, 0.45, 0.20]);
      const fws = FRAMEWORKS.filter(f => f.bu.indexOf(bu) >= 0);
      const due = m + (sev === 'Critical' ? 1 : sev === 'High' ? 2 : 3);
      const r = R.u();
      const closed = r < 0.78 ? m + R.int(0, due - m) : r < 0.92 ? due + R.int(1, 3) : null;
      findings.push({ id: 'AUD-' + MONTHS[m].key.replace('-', '') + '-' + String(k + 1).padStart(2, '0'), m: m, bu: bu, sev: sev, fw: R.pick(fws).id, due: due, closed: closed, title: R.pick(['Agent permissions exceed approved scope', 'Missing decision records for AI-assisted approvals', 'Model change deployed without evaluation evidence', 'Incomplete agent inventory attributes', 'Vector store backup not tested', 'Prompt logs retained beyond policy', 'Third-party AI contract lacks security clauses', 'Guardrail bypass not detected by SIEM', 'Kill-switch drill evidence missing', 'Cross-border AI transfer not approved']) });
    }
  }
  const agentFindings = [];
  for (let m = 0; m < NM; m++) {
    const R = RNG('agentFindings|' + m);
    const n = R.pois(0.75);
    for (let k = 0; k < n; k++) {
      const cand = AGENTS.filter(a => isActiveAgent(a, m));
      const a = R.pick(cand);
      const closed = R.chance(0.82) ? m + R.int(1, 3) : null;
      agentFindings.push({ id: 'ASG-' + MONTHS[m].key.replace('-', '') + '-' + (k + 1), m: m, agent: a.id, tn: a.tenant, bu: a.bu, sev: R.chance(0.6) ? 'Critical' : 'High', closed: (closed != null && closed <= LAST) ? closed : null, title: R.pick(['Indirect prompt injection via retrieved documents', 'Tool scope allows write access to production data', 'Agent can delegate to unregistered agent', 'Secrets exposed in agent memory', 'Guardrail bypass with encoded payload', 'Missing human approval on payment action']) });
    }
  }
  const exceptions = [];
  for (let m = 0; m < NM; m++) {
    const R = RNG('exceptions|' + m);
    const n = R.pois(2.0);
    for (let k = 0; k < n; k++) {
      const exp = m + R.int(2, 6);
      const r = R.u();
      const closed = r < 0.82 ? exp - R.int(0, 1) : r < 0.97 ? exp + R.int(1, 3) : null;
      exceptions.push({ id: 'EXC-' + MONTHS[m].key.replace('-', '') + '-' + (k + 1), m: m, day: R.int(1, MONTHS[m].days), bu: R.pick(BUS).id, sev: R.wpick(['High', 'Medium', 'Low'], [0.3, 0.5, 0.2]), expires: exp, closed: closed, title: R.pick(['Legacy agent using shared API key', 'Model without fallback for critical workflow', 'Unredacted logs for model debugging', 'Delayed threat model for pilot agent', 'Temporary broad tool scope for migration', 'Non-UAE model endpoint during pilot']) });
    }
  }
  const vendors = [];
  ['Model provider A', 'Model provider B', 'Cloud AI platform', 'Vector DB vendor', 'Agent framework vendor', 'Guardrail vendor', 'AI observability vendor', 'MCP gateway vendor', 'OCR / document AI vendor', 'Speech AI vendor', 'Translation AI vendor', 'AI red-team service', 'Data labelling service', 'GPU colocation provider', 'Managed Kubernetes provider', 'KYC AI vendor', 'Fraud ML vendor', 'Clinical NLP vendor', 'OT analytics vendor', 'Citizen chatbot vendor', 'Contract AI vendor', 'HR AI vendor', 'Code assistant vendor', 'Synthetic data vendor', 'AI training provider', 'Embedding API provider'].forEach((nm, i) => {
    const on = RI.int(0, 22);
    vendors.push({ id: 'VEN-' + String(i + 1).padStart(2, '0'), name: nm, from: on, assessedFrom: RI.chance(0.88) ? on + RI.int(0, 5) : null });
  });
  const IR_ITEMS = ['AI incident playbooks approved', 'Agent kill-switch runbook', 'Model provider escalation contacts', 'Prompt-injection response procedure', 'AI data-leak notification workflow', 'Tabletop exercise (AI scenario) completed', 'Forensic logging for agent sessions', 'Rollback plan for model changes', 'Shadow AI containment procedure', 'Regulator notification decision tree'];
  const irItems = [];
  BUS.forEach(b => IR_ITEMS.forEach((it, i) => { irItems.push({ id: b.id + '-IR' + (i + 1), bu: b.id, name: it, from: RI.int(2, 30) }); }));
  const ATLAS_TECH = ['LLM prompt injection (direct)', 'LLM prompt injection (indirect)', 'LLM jailbreak', 'LLM data leakage', 'System-prompt extraction', 'Tool / plug-in compromise', 'RAG poisoning', 'Training-data poisoning', 'AI supply-chain compromise', 'Backdoored model', 'Exfiltration via inference API', 'Denial of AI service', 'Cost harvesting', 'Model evasion', 'Adversarial data crafting', 'Inference API abuse', 'Valid-account abuse for AI services', 'Agent tool-invocation abuse', 'Agent memory manipulation', 'Excessive agency exploitation', 'AI model discovery', 'Model integrity erosion', 'Poisoned public model', 'Data harvesting from AI services', 'Unsecured AI credentials', 'AI-generated phishing content', 'Deepfake impersonation', 'Model extraction', 'Embedding inversion', 'Rogue MCP server'];
  const atlas = ATLAS_TECH.map((n, i) => ({ id: 'ATL-' + String(i + 1).padStart(2, '0'), name: n, from: Math.round(36 * Math.pow(RI.u(), 1.25)) }));
  const supply = [];
  for (let i = 0; i < 68; i++) {
    const kind = i < 14 ? 'Model artefact' : i < 28 ? 'RAG dataset' : 'Container / package';
    supply.push({ id: 'SUP-' + String(i + 1).padStart(2, '0'), kind: kind, from: RI.int(0, 20), provFrom: RI.chance(0.9) ? RI.int(2, 26) : null });
  }
  const DEPS = ['Azure OpenAI UAE North (frontier)', 'Azure OpenAI UAE North (small model)', 'AWS Bedrock eu-central-1 (large model)', 'AWS Bedrock me-central-1 (embeddings)', 'GPU cluster DXB-1', 'GPU cluster AUH-2', 'AI gateway', 'Vector database cluster', 'Agent orchestrator', 'MCP tool gateway', 'Workload identity provider', 'Secrets vault', 'Kubernetes control plane', 'DC network core (DXB)', 'Object storage (RAG corpora)', 'Observability pipeline (OTel collector)', 'SIEM ingestion (AI telemetry)', 'Guardrail service'];
  const deps = DEPS.map((n, i) => {
    const R = RNG('dep|' + i);
    const spof = R.chance(0.42);
    const tests = [];
    for (let m = R.int(0, 5); m <= LAST; m += R.int(3, 7)) tests.push({ m: m, pass: R.chance(0.85) });
    return { id: 'DEP-' + String(i + 1).padStart(2, '0'), name: n, spof: spof, spofFixed: spof ? (R.chance(0.6) ? R.int(6, 22) : null) : null, tests: tests };
  });
  const ksDrills = [];
  AGENTS.forEach(a => {
    if (a.killSwitchFrom == null) return;
    const R = RNG('ks|' + a.id);
    for (let m = a.killSwitchFrom + 2; m <= Math.min(LAST, a.end == null ? LAST : a.end); m += 3) ksDrills.push({ agent: a.id, tn: a.tenant, bu: a.bu, m: m, pass: R.chance(0.94) });
  });
  const mchg = [], evals = [];
  for (let m = 0; m < NM; m++) {
    const mat = MATURITY(m);
    const R = RNG('mchg|' + m);
    const n = R.pois(2.6);
    for (let k = 0; k < n; k++) {
      const md = R.pick(MODELS);
      const mig = R.chance(0.35);
      mchg.push({ id: 'CHG-' + MONTHS[m].key.replace('-', '') + '-' + (k + 1), m: m, mo: md.id, prov: md.provider, evaluated: R.chance(0.78 + 0.18 * mat), migration: mig, failed: mig && R.chance(0.15 - 0.08 * mat), desc: md.name + ' version update' });
    }
    MODELS.forEach(md => {
      if (md.embed) return;
      const Re = RNG('evals|' + md.id + '|' + m);
      const runs = 12 + Re.pois(6);
      evals.push({ m: m, mo: md.id, prov: md.provider, runs: runs, regressions: Re.binom(runs, 0.075 - 0.035 * mat) });
    });
  }

  // provider quota: TPM / RPM provisioning, monthly commitments and exhaustion
  const quota = [];
  for (let m = 0; m < NM; m++) {
    MODELS.filter(md => md.ext).forEach(md => {
      const R = RNG('quota|' + md.id + '|' + m);
      const tok = agg.tokMo[md.id][m], req = agg.reqMo[md.id][m];
      if (!tok) return;
      const u = quotaUtil(md.id, m);
      const peakTpm = tok / minutesIn(m) * R.range(6, 8);
      const peakRpm = req / minutesIn(m) * R.range(6, 8);
      const tpmLimit = peakTpm / u;
      const rpmLimit = peakRpm / clamp(u * R.range(0.82, 0.95), 0.3, 1.2);
      const commit = tok * (R.chance(0.035) ? R.range(0.93, 0.99) : R.range(1.05, 1.3));
      quota.push({ m: m, mo: md.id, prov: md.provider, tokens: tok, req: req, peakTpm: peakTpm, peakRpm: peakRpm, tpmLimit: tpmLimit, rpmLimit: rpmLimit, commit: commit, exhausted: tok > commit, exhaustDays: R.pois(Math.max(0, u - 0.85) * 12) + (tok > commit ? R.int(1, 3) : 0), impact: tok > commit ? Math.round(R.range(18000, 65000)) : 0 });
    });
  }
  // current month to date (Nov 2026, 13.25 of 30 days elapsed)
  const quotaNow = MODELS.filter(md => md.ext).map(md => {
    const R = RNG('quotaNow|' + md.id);
    const lastTok = agg.tokMo[md.id][LAST];
    const commit = lastTok * (md.id === 'AZ-FRONTIER' ? 1.08 : R.range(1.15, 1.3));
    const pace = md.id === 'AZ-FRONTIER' ? 1.12 : R.range(0.95, 1.05);
    const used = lastTok * pace * AS_OF.mtdDaysElapsed / 30;
    return { mo: md.id, prov: md.provider, commit: commit, used: used, elapsed: AS_OF.mtdDaysElapsed, days: AS_OF.mtdDaysInMonth };
  });

  // ------------------------------------------------------------------
  // Lazily generated observation samples (for percentile KPIs)
  // ------------------------------------------------------------------
  const sampleCache = {};
  function samples(kind, m, key) {
    const ck = kind + '|' + m + '|' + key;
    if (sampleCache[ck]) return sampleCache[ck];
    const R = RNG('samples|' + ck);
    let out = [];
    if (kind === 'lat' || kind === 'ttft') {
      const md = MI[key];
      const reqs = agg.reqMo[key][m];
      if (!reqs || (kind === 'ttft' && md.embed)) return (sampleCache[ck] = out);
      const n = Math.round(clamp(reqs / 25000, 40, 600));
      const deg = 1 + downFrac[key][m] * 40 + (md.ext ? Math.max(0, quotaUtil(key, m) - 0.85) * 0.8 : 0);
      const med = (kind === 'lat' ? md.lat : md.ttft) * deg;
      for (let i = 0; i < n; i++) out.push(Math.round(R.logn(med, kind === 'lat' ? 0.55 : 0.5)));
    } else if (kind === 'tok') {
      let tasks = 0, toks = 0;
      for (let i = actOff[m]; i < actOff[m + 1]; i++) { const r = act[i]; if (r.ag === key) { tasks += r.tasks; toks += r.tokIn + r.tokOut; } }
      if (!tasks) return (sampleCache[ck] = out);
      const mean = toks / tasks, sig = 0.55, med = mean / Math.exp(sig * sig / 2);
      const n = Math.round(clamp(tasks / 150, 8, 220));
      for (let i = 0; i < n; i++) out.push(Math.round(R.logn(med, sig)));
    } else if (kind === 'queue') {
      const u = gpuUtil[key][m];
      const med = 80 * Math.pow(1 / (1 - Math.min(u, 0.95)), 1.1);
      for (let i = 0; i < 300; i++) out.push(Math.round(R.logn(med, 0.5)));
    }
    return (sampleCache[ck] = out);
  }

  // ------------------------------------------------------------------
  // Synthetic agent sessions for the trace explorer
  // ------------------------------------------------------------------
  const USERS = ['analyst.01', 'analyst.07', 'ops.lead.03', 'svc.scheduler', 'agent.parent', 'case.handler.12', 'reviewer.04', 'citizen.portal', 'clinician.22', 'fin.ops.09'];
  const TOOLS = {
    'WF-TRIAGE': [['siem.query', 'Read', 'SIEM incidents'], ['ti.lookup', 'Read', 'Threat-intel platform'], ['edr.isolate', 'Write', 'EDR endpoint'], ['ticket.update', 'Write', 'ITSM case']],
    'WF-PHISH': [['mail.fetch', 'Read', 'Mail gateway quarantine'], ['url.detonate', 'Execute', 'Sandbox'], ['mail.purge', 'Write', 'Mailboxes'], ['ticket.update', 'Write', 'ITSM case']],
    'WF-CONTAIN': [['edr.isolate', 'Write', 'EDR endpoint'], ['iam.disable', 'Write', 'Directory account'], ['fw.block', 'Write', 'Firewall policy'], ['ticket.update', 'Write', 'ITSM case']],
    'WF-IAM': [['iam.lookup', 'Read', 'Identity store'], ['iam.grant', 'Write', 'Entitlements'], ['approval.request', 'Write', 'Approval queue']],
    'WF-KYC': [['doc.ocr', 'Read', 'Document store'], ['sanctions.screen', 'Read', 'Screening service'], ['crm.update', 'Write', 'Customer record']],
    'WF-FRAUD': [['ledger.query', 'Read', 'Payments ledger'], ['case.create', 'Write', 'Fraud case'], ['payment.hold', 'Write', 'Payment instruction']],
    'WF-CLAIMS': [['ehr.read', 'Read', 'EHR (read-only)'], ['policy.check', 'Read', 'Coverage rules'], ['claim.decide', 'Write', 'Claims system']],
    default: [['kb.search', 'Read', 'Knowledge base'], ['record.read', 'Read', 'Line-of-business system'], ['record.update', 'Write', 'Line-of-business system'], ['notify.send', 'Write', 'Messaging']]
  };
  function sessions(agentId, m, count) {
    const a = AGI[agentId];
    if (!a || !isRunning(a, m)) return [];
    const R = RNG('sessions|' + agentId + '|' + m);
    const totals = { toolUnOk: 0, hrAtt: 0, hrBlk: 0, piAtt: 0, piOk: 0, sensExpo: 0, a2aUn: 0, loops: 0 };
    let tokTask = 0, tasks = 0;
    for (let i = actOff[m]; i < actOff[m + 1]; i++) {
      const r = act[i]; if (r.ag !== agentId) continue;
      Object.keys(totals).forEach(k => { totals[k] += r[k]; });
      tasks += r.tasks; tokTask += r.tokIn + r.tokOut;
    }
    tokTask = tasks ? tokTask / tasks : 0;
    const tools = TOOLS[a.wf] || TOOLS.default;
    const flags = [];
    if (totals.toolUnOk > 0) flags.push('unauth_ok');
    if (totals.hrAtt - totals.hrBlk > 0) flags.push('hr_exec');
    if (totals.hrBlk > 0) flags.push('hr_blocked');
    if (totals.piOk > 0) flags.push('pi_ok');
    if (totals.piAtt > 0) flags.push('pi_blocked');
    if (totals.sensExpo > 0) flags.push('sens');
    if (totals.a2aUn > 0) flags.push('a2a');
    if (totals.loops > 0) flags.push('loop');
    const shadowMcp = mcp.find(x => !x.registered && x.tn === a.tenant && x.from <= m && (x.to == null || x.to > m));
    if (shadowMcp) flags.push('shadow_mcp');
    const out = [];
    const n = count || 14;
    for (let s = 0; s < n; s++) {
      const flag = s < flags.length ? flags[s] : null;
      const day = R.int(1, MONTHS[m].days), hh = R.int(0, 23), mm = R.int(0, 59);
      const model = (flag === 'loop' || R.chance(0.85)) ? a.primary : (a.fallback || a.primary);
      const sid = 'SES-' + agentId.split('-').slice(-1)[0] + '-' + MONTHS[m].key.replace('-', '') + '-' + String(1000 + R.int(0, 8999));
      const user = R.pick(USERS);
      const steps = [];
      let t = 0;
      const push = (type, name, detail, auth, result, dur) => { steps.push({ t: t, type: type, name: name, detail: detail, auth: auth, result: result, dur: dur }); t += dur; };
      push('user', user, 'Request received via ' + APPI[a.app].name, 'Authenticated (SSO)', 'Accepted', R.int(20, 120));
      push('agent', a.name, 'Plan created (' + a.autonomy + ')', 'Agent identity ' + (m >= a.identityFrom ? 'managed workload identity' : 'shared API key (legacy)'), 'OK', R.int(150, 600));
      if (flag === 'pi_ok' || flag === 'pi_blocked') push('guard', 'Guardrail classifier', 'Indirect prompt injection detected in retrieved content', 'Policy: AI-06 prompt-injection defence', flag === 'pi_ok' ? 'Bypassed: instruction executed' : 'Blocked & sanitised', R.int(40, 120));
      const nTools = R.int(2, 4);
      for (let k = 0; k < nTools; k++) {
        const tl = tools[k % tools.length];
        push('model', MI[model].name + ' (' + MI[model].provider + ')', 'Reasoning step ' + (k + 1) + ', ' + Math.round(tokTask / (nTools + 1) / 1000) + 'k tokens', 'Gateway policy: allowed', 'OK', R.int(600, 3200));
        let auth = 'Authorized (scope: ' + tl[1].toLowerCase() + ')', result = 'Success';
        if (k === nTools - 1 && flag === 'unauth_ok') { auth = 'NOT AUTHORIZED: tool outside approved scope'; result = 'Executed (control gap)'; }
        if (k === nTools - 1 && flag === 'hr_blocked') { auth = 'High-risk action: approval missing'; result = 'Blocked by policy'; }
        if (k === nTools - 1 && flag === 'hr_exec') { auth = 'High-risk action without approval'; result = 'Executed (escalated to SOC)'; }
        if (k === 0 && flag === 'shadow_mcp') { auth = 'Unregistered MCP server: ' + shadowMcp.id; result = 'Flagged: shadow MCP'; }
        if (k === 1 && flag === 'sens') { auth = 'DLP: sensitive data detected (unredacted)'; result = 'Delivered to model, alert raised'; }
        push('tool', tl[0], tl[1] + ' on ' + tl[2], auth, result, R.int(80, 900));
      }
      if (flag === 'a2a') push('agent', 'Delegated sub-agent', 'Delegation to agent outside approved delegation graph', 'NOT AUTHORIZED: delegation policy AI-11', 'Executed (flagged)', R.int(300, 1200));
      if (flag === 'loop') push('agent', 'Loop detector', 'Repeated identical tool invocation (x' + R.int(12, 40) + ')', 'Runaway-loop policy', 'Session terminated', R.int(50, 150));
      push('result', 'Outcome', flag === 'loop' ? 'Task failed, routed to human' : (R.chance(0.9) ? 'Task completed' : 'Escalated to human reviewer'), 'Trace complete: ' + (m >= a.traceFrom ? 'yes' : 'partial'), 'Closed', R.int(20, 80));
      out.push({ id: sid, agent: agentId, m: m, ts: MONTHS[m].key + '-' + String(day).padStart(2, '0') + ' ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'), user: user, model: model, tokens: Math.round(tokTask * R.range(0.6, 1.5)), flag: flag, steps: steps, dur: t });
    }
    return out;
  }

  return {
    synthetic: true,
    seed: SEED,
    MONTHS: MONTHS, NM: NM, LAST: LAST, AS_OF: AS_OF,
    BUS: BUS, TENANTS: TENANTS, ENVS: ENVS, MODELS: MODELS, PROVIDERS: PROVIDERS, APPS: APPS, WORKFLOWS: WORKFLOWS,
    CONTROL_FAMILIES: CONTROL_FAMILIES, FRAMEWORKS: FRAMEWORKS, CONTROL_CATALOG: CONTROL_CATALOG, COMPONENTS: COMPONENTS,
    AGENTS: AGENTS, SCENARIOS: SCENARIOS, PROGRAMME: PROGRAMME, SOURCES: SOURCES,
    idx: { BU: BUI, TN: TNI, MODEL: MI, APP: APPI, WF: WFI, COMP: COMPI, FW: FWI, AGENT: AGI },
    isActiveAgent: isActiveAgent, isRunning: isRunning,
    act: { rows: act, off: actOff, fields: ACT_FIELDS },
    inf: { rows: inf, off: infOff, fields: INF_FIELDS },
    ten: { rows: ten, off: tenOff, fields: TEN_FIELDS },
    risk: { rows: risk, off: riskOff },
    incidents: incidents, fin: fin, outM: OUT_MODEL, outI: OUT_INFRA,
    shadowAgents: shadowAgents, shadowApps: shadowApps, mcp: mcp, ctlInst: ctlInst, findings: findings, agentFindings: agentFindings,
    exceptions: exceptions, vendors: vendors, irItems: irItems, atlas: atlas, supply: supply, deps: deps, ksDrills: ksDrills,
    mchg: mchg, evals: evals, quota: quota, quotaNow: quotaNow,
    agg: agg, infraCost: infraCost, infSpend: infSpend, gpuUtil: gpuUtil, quotaUtil: quotaUtil,
    samples: samples, sessions: sessions
  };
}));
