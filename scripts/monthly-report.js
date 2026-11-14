#!/usr/bin/env node
/*
 * Monthly executive report generator.
 *   node scripts/monthly-report.js            -> last closed month (Oct 2026)
 *   node scripts/monthly-report.js 2026-09    -> a specific month
 * Writes reports/monthly-executive-report-YYYY-MM.md and a CSV of all KPIs,
 * using the same KPI engine as the dashboard. Values are synthetic sample data.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const D = require(path.join(ROOT, 'assets/js/data.js'));
const EN = require(path.join(ROOT, 'assets/js/engine.js'));
const KP = require(path.join(ROOT, 'assets/js/kpis.js'));
const E = EN.create(D);
const LIST = KP.build(D, E);
E.register(LIST);
const K = {}; LIST.forEach(k => { K[k.id] = k; });

const arg = process.argv[2];
const m = arg ? D.MONTHS.findIndex(x => x.key === arg) : D.LAST;
if (m < 0) { console.error('Unknown month ' + arg + '. Use YYYY-MM between ' + D.MONTHS[0].key + ' and ' + D.MONTHS[D.LAST].key + '.'); process.exit(1); }
const month = D.MONTHS[m];
const F = { from: m, to: m };
const ytdFrom = D.MONTHS.findIndex(x => x.y === month.y && x.mo === 0);
const YTD = { from: ytdFrom >= 0 ? ytdFrom : 0, to: m };
const PREV = m > 0 ? { from: m - 1, to: m - 1 } : null;
const ST = { good: 'On target', watch: 'Watch', serious: 'Warning', critical: 'Critical', info: 'No target', nodata: 'No data' };
const f = (v, u) => EN.fmt(v, u);
const row = (id, scope) => {
  const k = K[id], r = E.quick(id, scope);
  const pv = PREV && scope === F ? E.evaluate(id, PREV) : null;
  return '| ' + id + ' | ' + k.name + ' | ' + f(r.value, k.unit) + ' | ' + (k.dir === 'none' || r.tgt == null ? '-' : f(r.tgt, k.statusOf ? (id === 146 ? 'count' : '%') : k.unit)) + ' | ' + ST[r.status] + ' | ' + (pv == null ? '-' : f(pv, k.unit)) + ' |';
};

const EXEC = ['X1', 1, 2, 3, 'X3', 27, 29, 28, 31, 20, 126, 43, 63, 64, 71, 72, 73, 'X4', 101, 102, 103, 'X5', 'X6', 'X2'];
let out = '# Monthly executive report: ' + month.label + '\n\n';
out += '> **Synthetic sample data**, generated deterministically for demonstration and testing. It is not live enterprise data. Currency AED. Data as of ' + D.AS_OF.label + '.\n\n';
const x1 = E.quick('X1', F), x2 = E.quick('X2', F), x6 = E.quick('X6', F);
out += '## Headline\n\n';
out += '- **Enterprise Cyber Risk Score:** ' + Math.round(x1.value) + ' / 100 (' + ST[x1.status] + ')\n';
out += '- **Agentic Enterprise Risk Index:** ' + Math.round(x2.value) + ' / 100 (' + ST[x2.status] + ')\n';
out += '- **Agentic Security Risk Score:** ' + Math.round(x6.value) + ' / 100 (' + ST[x6.status] + ')\n';
out += '- **Verified value this month:** realised savings ' + f(E.evaluate(1, F), 'AED') + ' + confirmed loss prevented ' + f(E.evaluate(2, F), 'AED') + ' − automation cost ' + f(E.evaluate(7, F), 'AED') + ' = net ' + f(E.evaluate(5, F), 'AED') + '\n';
out += '- **Year to date (' + D.MONTHS[YTD.from].short + ' - ' + month.short + '):** net realised benefit ' + f(E.evaluate(5, YTD), 'AED') + ', automation ROI ' + f(E.evaluate(8, YTD), '%') + ', human hours saved ' + f(E.evaluate(29, YTD), 'h') + '\n\n';
out += '## Executive KPIs (' + month.label + ')\n\n| # | KPI | Value | Target | Status | Prior month |\n|---|---|---|---|---|---|\n' + EXEC.map(id => row(id, F)).join('\n') + '\n\n';

const counts = {}; const flagged = [];
LIST.forEach(k => { const r = E.quick(k.id, F); counts[r.status] = (counts[r.status] || 0) + 1; if (r.status === 'critical' || r.status === 'serious') flagged.push({ k: k, r: r }); });
out += '## Status summary\n\n' + ['critical', 'serious', 'watch', 'good', 'info', 'nodata'].filter(s => counts[s]).map(s => '- ' + ST[s] + ': ' + counts[s]).join('\n') + '\n\n';
out += '## Exceptions requiring attention (Warning or Critical)\n\n| # | Domain | KPI | Value | Target | Status | Owner |\n|---|---|---|---|---|---|---|\n';
flagged.sort((a, b) => (b.r.status === 'critical') - (a.r.status === 'critical') || (b.r.risk || 0) - (a.r.risk || 0)).forEach(x => {
  out += '| ' + x.k.id + ' | ' + x.k.dom + ' | ' + x.k.name + ' | ' + f(x.r.value, x.k.unit) + ' | ' + (x.r.tgt == null ? '-' : f(x.r.tgt, x.k.statusOf ? (x.k.id === 146 ? 'count' : '%') : x.k.unit)) + ' | ' + ST[x.r.status] + ' | ' + x.k.owner + ' |\n';
});
out += '\n## How the headline numbers are calculated\n\n';
[1, 2, 27, 29, 63, 71].forEach(id => {
  const k = K[id], d = E.detail(id, F);
  let sub = k.expr; d.inputs.forEach(i => { sub = sub.split('{' + i.k + '}').join(EN.fmt(i.value, i.unit, 'full')); });
  out += '- **' + k.name + '** = `' + k.formula + '`  \n  ' + sub + ' = **' + EN.fmt(d.value, k.unit, 'full') + '**\n';
});
out += '\nThe full catalog of 164 KPIs and 6 composite indices, with definitions, formulas, sources, owners and thresholds, is in `docs/01-kpi-catalog.md`.\n';

const dir = path.join(ROOT, 'reports');
fs.mkdirSync(dir, { recursive: true });
const md = path.join(dir, 'monthly-executive-report-' + month.key + '.md');
fs.writeFileSync(md, out);
const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const lines = [['# SYNTHETIC SAMPLE DATA'], ['kpi_id', 'domain', 'name', 'month', 'value', 'target', 'warning', 'critical', 'status', 'ytd_value']];
LIST.forEach(k => { const r = E.quick(k.id, F); lines.push([k.id, k.dom, k.name, month.key, r.value, r.tgt, r.warn, r.crit, ST[r.status], E.evaluate(k.id, YTD)]); });
fs.writeFileSync(path.join(dir, 'monthly-kpis-' + month.key + '.csv'), lines.map(r => r.map(csvCell).join(',')).join('\n') + '\n');
console.log('wrote ' + path.relative(ROOT, md) + ' and reports/monthly-kpis-' + month.key + '.csv');
