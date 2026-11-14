/*
 * Validation tests for KPI formulas, costs and calculations.
 * Run with:  node --test tests/
 * Uses only the Node.js built-in test runner (Node 18+).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const D = require(path.join(ROOT, 'assets/js/data.js'));
const EN = require(path.join(ROOT, 'assets/js/engine.js'));
const KP = require(path.join(ROOT, 'assets/js/kpis.js'));
const XL = require(path.join(ROOT, 'assets/js/xlsx.js'));

const E = EN.create(D);
const LIST = KP.build(D, E);
E.register(LIST);
const YTD = { from: 14, to: 23 };
const PRIOR = { from: 2, to: 11 };
const v = (id, f) => E.evaluate(id, Object.assign({}, YTD, f || {}));
const close = (a, b, rel, msg) => {
  const tol = Math.max(1e-9, Math.abs(b) * (rel || 1e-9));
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' got ' + a);
};
const sum = (arr, f) => arr.reduce((s, x) => s + (typeof f === 'function' ? f(x) : x[f]), 0);
const actSum = (field, f) => {
  f = Object.assign({}, YTD, f || {});
  let s = 0;
  for (let i = D.act.off[f.from]; i < D.act.off[f.to + 1]; i++) {
    const r = D.act.rows[i];
    if (f.bu && r.bu !== f.bu) continue;
    if (f.tn && r.tn !== f.tn) continue;
    if (f.env && r.env !== f.env) continue;
    s += r[field];
  }
  return s;
};

// ---------------------------------------------------------------- catalog
test('catalog has 164 catalogued KPIs (1..164) plus 6 composite indices', () => {
  const nums = LIST.filter(k => typeof k.id === 'number').map(k => k.id).sort((a, b) => a - b);
  assert.equal(nums.length, 164);
  nums.forEach((id, i) => assert.equal(id, i + 1));
  const comps = LIST.filter(k => typeof k.id === 'string').map(k => k.id).sort();
  assert.deepEqual(comps, ['X1', 'X2', 'X3', 'X4', 'X5', 'X6']);
});

test('domains hold the expected KPI ranges', () => {
  const ranges = { A: [1, 19], B: [20, 42], C: [43, 70], D: [71, 89], E: [90, 100], F: [101, 124], G: [125, 150], H: [151, 164] };
  Object.keys(ranges).forEach(d => {
    const ids = LIST.filter(k => k.dom === d).map(k => k.id);
    assert.equal(ids.length, ranges[d][1] - ranges[d][0] + 1, 'domain ' + d);
    assert.equal(Math.min.apply(null, ids), ranges[d][0]);
    assert.equal(Math.max.apply(null, ids), ranges[d][1]);
  });
});

test('every KPI is fully specified (definition, formula, unit, sources, owner, frequency, thresholds, rules)', () => {
  const srcIds = new Set(D.SOURCES.map(s => s.id));
  LIST.forEach(k => {
    const tag = 'KPI ' + k.id + ' ' + k.name;
    ['name', 'def', 'formula', 'unit', 'owner', 'freq', 'miss', 'incl', 'ev', 'cls', 'dir'].forEach(f => assert.ok(k[f], tag + ' missing ' + f));
    assert.ok(Array.isArray(k.inputs) && k.inputs.length > 0, tag + ' has no inputs');
    assert.equal(typeof k.calc, 'function', tag + ' calc');
    assert.ok(Array.isArray(k.src) && k.src.length > 0, tag + ' sources');
    k.src.forEach(s => assert.ok(srcIds.has(s), tag + ' unknown source ' + s));
    if (k.dir !== 'none') ['tgt', 'warn', 'crit'].forEach(f => assert.ok(k[f] !== undefined, tag + ' missing ' + f));
    else assert.ok(k.thr, tag + ' informational KPI must explain why it has no target');
    // every placeholder in the worked-calculation template has a matching input
    (k.expr.match(/\{(\w+)\}/g) || []).forEach(ph => assert.ok(k.inputs.some(i => '{' + i.k + '}' === ph), tag + ' placeholder ' + ph));
  });
});

test('every KPI evaluates to a finite value for all preset periods and every business unit', () => {
  E.PERIODS.forEach(P => {
    LIST.forEach(k => {
      const val = E.evaluate(k.id, { from: P.from, to: P.to });
      // RTO / RPO / failover legitimately have no tests in a single non-test month
      if (val == null) { assert.ok([118, 119, 120].indexOf(k.id) >= 0, 'KPI ' + k.id + ' null for ' + P.id); return; }
      assert.ok(Number.isFinite(val), 'KPI ' + k.id + ' not finite for ' + P.id);
    });
  });
  D.BUS.forEach(b => LIST.forEach(k => { const val = v(k.id, { bu: b.id }); assert.ok(val == null || Number.isFinite(val), 'KPI ' + k.id + ' BU ' + b.id); }));
});

// ---------------------------------------------------------------- efficiency formulas
test('efficiency, speed and hours saved follow the prescribed formulas', () => {
  const man = actSum('manMin'), e2e = actSum('e2eMin');
  close(v(27), (man - e2e) / man * 100, 1e-12, 'efficiency gain');
  close(v(28), man / e2e, 1e-12, 'speed');
  close(v(29), (man - e2e) / 60, 1e-12, 'hours saved');
  // identity: gain = 1 - 1/speed
  close(v(27) / 100, 1 - 1 / v(28), 1e-12, 'gain vs speed identity');
});

test('end-to-end time includes review, waiting, retries and rework', () => {
  const comps = ['execMin', 'reviewMin', 'waitMin', 'retryMin', 'reworkMin'].map(f => actSum(f)).reduce((a, b) => a + b, 0);
  close(comps, actSum('e2eMin'), 1e-9, 'e2e composition');
  assert.ok(v(26) > v(25) * 2, 'end-to-end must be materially longer than raw execution');
});

test('ratios are recomputed from summed numerators and denominators (never averaged)', () => {
  const succ = actSum('succ'), tasks = actSum('tasks');
  close(v(23), succ / tasks * 100, 1e-12, 'success rate');
  const monthly = [];
  for (let m = 14; m <= 23; m++) monthly.push(E.evaluate(23, { from: m, to: m }));
  const naiveAvg = monthly.reduce((a, b) => a + b, 0) / monthly.length;
  assert.notEqual(v(23).toFixed(6), naiveAvg.toFixed(6), 'YTD rate must not equal the average of monthly rates');
});

test('additive KPIs reconcile across business units and tenants', () => {
  [1, 2, 6, 22, 29, 43, 61, 63].forEach(id => {
    const total = v(id);
    const byBu = D.BUS.reduce((a, b) => a + v(id, { bu: b.id }), 0);
    close(byBu, total, 1e-9, 'KPI ' + id + ' BU sum');
  });
  const byTn = D.TENANTS.reduce((a, t) => a + v(43, { tn: t.id }), 0);
  close(byTn, v(43), 1e-12, 'tokens tenant sum');
  const byEnv = ['prod', 'nonprod'].reduce((a, e) => a + v(29, { env: e }), 0);
  close(byEnv, v(29), 1e-9, 'hours by environment');
});

// ---------------------------------------------------------------- tokens & cost
test('token totals never double count cached or reasoning tokens', () => {
  const tin = actSum('tokIn'), tout = actSum('tokOut'), cached = actSum('tokCached'), reason = actSum('tokReason');
  assert.ok(cached <= tin && reason <= tout);
  close(v(43), tin + tout, 1e-12, 'total tokens');
  close(v(44) + v(45), v(43), 1e-12, 'input + output = total');
  assert.ok(tin + tout + cached + reason > v(43), 'naive sum overstates');
  D.act.rows.forEach(r => { assert.ok(r.tokCached <= r.tokIn && r.tokReason <= r.tokOut); });
});

test('inference spend applies provider-specific prices per model', () => {
  const parts = LIST.find(k => k.id === 61);
  const q = E.ctx(YTD);
  const d = E.detail(61, YTD);
  const fromParts = d.inputs.reduce((a, i) => a + i.value, 0);
  close(fromParts, q.a('costInf'), 1e-9, 'cost parts vs fact');
  close(v(61), q.a('costInf'), 1e-9, 'KPI 61 vs fact');
  D.MODELS.forEach(md => {
    const qq = E.ctx(Object.assign({}, YTD, { mp: 'M:' + md.id }));
    const expect = ((qq.a('tokIn') - qq.a('tokCached')) * md.p_in + qq.a('tokCached') * md.p_cache + qq.a('tokOut') * md.p_out) / 1e6;
    close(qq.a('costInf'), expect, 1e-9, 'pricing ' + md.id);
    if (!md.ext) assert.equal(qq.a('costInf'), 0, 'on-prem has no per-token price');
  });
  assert.ok(parts);
});

test('AI operating spend, unit costs and budget measures are consistent', () => {
  const q = E.ctx(YTD);
  close(v(63), v(61) + v(62) + q.t('lic'), 1e-12, 'operating spend');
  close(v(64), v(63) / actSum('succ'), 1e-12, 'cost per task');
  close(v(65), (v(61) + v(62)) / v(43) * 1e6, 1e-12, 'cost per M tokens');
  close(v(67), v(63) / q.t('budAI') * 100, 1e-12, 'budget utilisation');
  // gross overrun is never negative and never below the net overrun
  assert.ok(v(68) >= Math.max(0, v(67) - 100) - 1e-9);
  // allocated infrastructure equals the platform cost for the full scope
  let infraTotal = 0; for (let m = 14; m <= 23; m++) infraTotal += D.infraCost[m];
  close(q.t('infra'), infraTotal, 1e-9, 'infrastructure allocation is complete');
});

test('spend forecast equals 3a + 24b of the least-squares fit', () => {
  const d = E.detail(69, YTD);
  const a = d.inputs.find(i => i.k === 'a').value, b = d.inputs.find(i => i.k === 'b').value;
  close(v(69), 3 * a + 24 * b, 1e-12, 'forecast');
  const fit = E.linreg([10, 12, 14, 16]);
  close(fit.a, 10, 1e-12); close(fit.b, 2, 1e-12);
});

// ---------------------------------------------------------------- financial value
test('net benefit, ROI, payback and value-by-control reconcile', () => {
  close(v(5), v(1) + v(2) - v(7), 1e-12, 'net benefit');
  close(v(8), v(5) / v(7) * 100, 1e-12, 'ROI');
  close(v(16), D.PROGRAMME.investment / (v(5) / 10), 1e-12, 'payback');
  close(v(17), v(1) + v(2), 1e-12, 'value by control');
  const byControl = D.CONTROL_FAMILIES.reduce((a, c) => a + v(1, { ctl: c }) + v(2, { ctl: c }), 0);
  close(byControl, v(17), 1e-9, 'sum over control filter equals total (no double counting)');
});

test('confirmed loss prevented counts each incident exactly once', () => {
  const lp = D.fin.filter(x => x.cat === 'loss_prevented' && x.m >= 14 && x.m <= 23);
  const byInc = {};
  lp.forEach(x => { (byInc[x.inc] = byInc[x.inc] || []).push(x); });
  Object.keys(byInc).forEach(id => {
    const inc = D.incidents.find(i => i.id === id);
    const w = inc.controls.reduce((a, c) => a + c.w, 0);
    close(w, 1, 1e-12, 'weights sum to 1 for ' + id);
    assert.equal(sum(byInc[id], 'amt'), inc.prevented, 'attributed = prevented for ' + id);
    assert.ok(sum(byInc[id], 'claim') >= inc.prevented, 'gross claims overlap');
  });
  const prevented = sum(D.incidents.filter(i => i.m >= 14 && i.m <= 23 && i.verified), 'prevented');
  assert.equal(v(2), prevented, 'KPI 2 equals verified prevented loss exactly');
  assert.ok(v(11) <= v(2), 'fraud is a subset of KPI 2');
});

test('realized savings only include Finance-approved entries', () => {
  const appr = sum(D.fin.filter(x => x.cat === 'saving' && x.status === 'Approved' && x.m >= 14 && x.m <= 23), 'amt');
  close(v(1), appr, 1e-12, 'approved only');
  const all = sum(D.fin.filter(x => x.cat === 'saving' && x.m >= 14 && x.m <= 23), 'amt');
  assert.ok(all > appr, 'pending / rejected exist and are excluded');
});

test('loss avoidance = baseline ALE - residual ALE at period end', () => {
  let base = 0, resid = 0;
  for (let i = D.risk.off[23]; i < D.risk.off[24]; i++) { const r = D.risk.rows[i]; base += r.bLef * r.bLm; resid += r.rLef * r.rLm; }
  close(v(3), base - resid, 1e-12);
  close(v(4), resid, 1e-12);
  close(base, 410e6, 1e-9, 'register calibrated to AED 410M baseline');
});

// ---------------------------------------------------------------- availability & reliability
test('model availability and error rate are complements with the documented eligibility', () => {
  const req = actSum('req');
  const excl = actSum('eApp') + actSum('eRl') + actSum('eGw') + actSum('eNet');
  const fail = actSum('eProv') + actSum('eSrv') + actSum('eTo');
  close(v(71), (req - excl - fail) / (req - excl) * 100, 1e-12, 'availability');
  close(v(71) + v(76), 100, 1e-12, 'availability + error rate');
  assert.ok(v(77) + v(78) - v(76) < 1e-9 + 1e-12, 'server + timeout <= error rate');
});

test('percentiles use nearest rank', () => {
  const arr = []; for (let i = 1; i <= 100; i++) arr.push(i);
  const p = E.percentile(arr, 95);
  assert.equal(p.value, 95); assert.equal(p.rank, 95); assert.equal(p.n, 100);
  assert.equal(E.percentile([5], 95).value, 5);
  const d = E.detail(79, YTD);
  assert.equal(d.inputs.find(i => i.k === 'rank').value, Math.ceil(0.95 * d.inputs.find(i => i.k === 'n').value));
});

test('capacity runway follows ln(capacity / peak) / ln(1 + growth)', () => {
  const d = E.detail(110, YTD);
  const g = d.inputs.find(i => i.k === 'g').value, cap = d.inputs.find(i => i.k === 'cap').value, peak = d.inputs.find(i => i.k === 'peak').value;
  close(v(110), Math.log(cap / peak) / Math.log(1 + g / 100), 1e-12);
  close(v(109), (cap - peak) / cap * 100, 1e-12);
});

// ---------------------------------------------------------------- thresholds, status, composites
test('normalised risk is 0 at target, 50 at warning and 100 at critical (both directions)', () => {
  assert.equal(E.normRisk('up', 95, 95, 90, 85), 0);
  assert.equal(E.normRisk('up', 90, 95, 90, 85), 50);
  assert.equal(E.normRisk('up', 85, 95, 90, 85), 100);
  assert.equal(E.normRisk('up', 92.5, 95, 90, 85), 25);
  assert.equal(E.normRisk('down', 3, 3, 5, 8), 0);
  assert.equal(E.normRisk('down', 5, 3, 5, 8), 50);
  assert.equal(E.normRisk('down', 9, 3, 5, 8), 100);
  assert.equal(E.normRisk('down', 6.5, 3, 5, 8), 75);
  const k = { dir: 'up' };
  assert.equal(E.status(k, 96, 95, 90, 85).status, 'good');
  assert.equal(E.status(k, 93, 95, 90, 85).status, 'watch');
  assert.equal(E.status(k, 88, 95, 90, 85).status, 'serious');
  assert.equal(E.status(k, 80, 95, 90, 85).status, 'critical');
  assert.equal(E.status({ dir: 'none' }, 5, null, null, null).status, 'info');
});

test('composite indices equal the weighted average of their group risks', () => {
  ['X1', 'X2', 'X6'].forEach(id => {
    const d = E.detail(id, YTD);
    let s = 0, w = 0;
    d.inputs.forEach(i => { if (i.value != null) { s += i.value * i.w; w += i.w; } });
    close(d.value, s / w, 1e-12, id);
    assert.ok(d.value >= 0 && d.value <= 100, id + ' within 0..100');
  });
  const w1 = LIST.find(k => k.id === 'X1').groups.reduce((a, g) => a + g.w, 0);
  close(w1, 1, 1e-12, 'X1 weights sum to 1');
});

test('comparison period is prior-year YTD for YTD and the preceding window otherwise', () => {
  const q = E.ctx(YTD); const p = q.prev();
  assert.equal(p.from, PRIOR.from); assert.equal(p.to, PRIOR.to);
  const q3 = E.ctx({ from: 21, to: 23 }).prev();
  assert.equal(q3.from, 18); assert.equal(q3.to, 20);
});

test('filters apply only where the underlying data carries the dimension', () => {
  const touched = id => E.detail(id, Object.assign({}, YTD, { env: 'prod' })).touched;
  const a27 = E.applicability(touched(27), { env: 'prod' });
  assert.deepEqual(a27.applied, ['env']);
  const a12 = E.applicability(touched(12), { env: 'prod' });
  assert.deepEqual(a12.na, ['env']);
  const a63 = E.applicability(touched(63), { env: 'prod' });
  assert.deepEqual(a63.partial, ['env']);
});

test('alert-relevant KPIs are consistent with their inputs', () => {
  close(v('X5'), actSum('hrAtt') - actSum('hrBlk'), 1e-12, 'executed high-risk actions');
  close(v(132), actSum('hrBlk') / actSum('hrAtt') * 100, 1e-12, 'block effectiveness');
  close(v(130), (actSum('toolExec') - actSum('toolUnOk')) / actSum('toolExec') * 100, 1e-12, 'tool authorisation');
  close(v(145), actSum('traced') / actSum('runs') * 100, 1e-12, 'trace coverage');
  close(v('X4'), v(55) + v(93), 1e-12, 'quota events');
});

// ---------------------------------------------------------------- determinism & export
test('synthetic data is deterministic across reloads', () => {
  const file = path.join(ROOT, 'assets/js/data.js');
  delete require.cache[require.resolve(file)];
  const D2 = require(file);
  assert.equal(D2.act.rows.length, D.act.rows.length);
  assert.equal(sum(D2.act.rows, 'tokIn'), sum(D.act.rows, 'tokIn'));
  assert.equal(sum(D2.incidents, 'potential'), sum(D.incidents, 'potential'));
  assert.equal(D2.synthetic, true);
});

test('XLSX writer produces a valid store-only zip with the expected parts', () => {
  const bytes = XL.build([{ name: 'Sheet A', rows: [['h1', 'h2'], [1, 'x & <y>']] }, { name: 'Sheet/B', rows: [['a']] }]);
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b); assert.equal(bytes[2], 0x03); assert.equal(bytes[3], 0x04);
  const text = Buffer.from(bytes).toString('latin1');
  ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'].forEach(n => assert.ok(text.indexOf(n) >= 0, n));
  assert.ok(text.indexOf('x &amp; &lt;y&gt;') >= 0, 'XML escaped');
  assert.ok(text.indexOf('name="Sheet B"') >= 0, 'invalid sheet characters replaced');
  const eocd = text.lastIndexOf('PK\u0005\u0006');
  assert.ok(eocd > 0);
  assert.equal(bytes[eocd + 10], 7, 'seven parts in the central directory');
  assert.equal(XL.crc32(Buffer.from('123456789')), 0xCBF43926);
  assert.equal(XL.colName(0), 'A'); assert.equal(XL.colName(25), 'Z'); assert.equal(XL.colName(26), 'AA');
});
