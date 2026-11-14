/*!
 * CISO Executive Agentic Enterprise Dashboard - lightweight SVG charts
 * Thin marks, hairline grids, one axis per chart, hover tooltips and a
 * table-view twin for every figure.
 */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const SURFACE = () => css('--surface-2') || '#111112';

  // ---------------- tooltip ----------------
  let tipEl = null;
  function tip() {
    if (!tipEl) { tipEl = document.getElementById('tip') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tip', className: 'tooltip' })); }
    return tipEl;
  }
  function showTip(evt, title, rows) {
    const t = tip();
    t.textContent = '';
    if (title) { const d = document.createElement('div'); d.className = 'tt-title'; d.textContent = title; t.appendChild(d); }
    rows.forEach(r => {
      const row = document.createElement('div'); row.className = 'tt-row';
      const k = document.createElement('span'); k.className = 'tt-k';
      if (r.color) { const ln = document.createElement('span'); ln.className = 'tt-line'; ln.style.background = r.color; k.appendChild(ln); }
      k.appendChild(document.createTextNode(r.k));
      const v = document.createElement('span'); v.className = 'tt-v'; v.textContent = r.v;
      row.appendChild(k); row.appendChild(v); t.appendChild(row);
    });
    t.classList.add('show');
    moveTip(evt);
  }
  function moveTip(evt) {
    const t = tip();
    const w = t.offsetWidth, h = t.offsetHeight;
    let x = evt.clientX + 14, y = evt.clientY + 14;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - 14;
    t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.classList.remove('show'); }

  // ---------------- svg helpers ----------------
  function svg(w, h) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    s.setAttribute('width', w); s.setAttribute('height', h);
    s.setAttribute('role', 'img');
    return s;
  }
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(k => { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, str, cls, anchor, extra) {
    const t = el('text', Object.assign({ x: x, y: y, class: cls || 'axis-text', 'text-anchor': anchor || 'start' }, extra || {}), parent);
    t.textContent = str;
    return t;
  }
  function nice(min, max, n) {
    n = n || 4;
    if (min === max) { max = min === 0 ? 1 : min * 1.2; min = min > 0 ? 0 : min; }
    const span = max - min;
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v / step) * step);
    return { min: lo, max: hi, step: step, ticks: ticks };
  }
  // rounded-top rectangle path (4px data end, square at baseline)
  function barPath(x, y, w, h, r, dir) {
    if (h <= 0 || w <= 0) return '';
    r = Math.min(r, w / 2, h);
    if (dir === 'right') return 'M' + x + ',' + y + 'h' + (w - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'v' + (h - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r + 'h' + (-(w - r)) + 'z';
    return 'M' + x + ',' + (y + h) + 'v' + (-(h - r)) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) + 'h' + (w - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'v' + (h - r) + 'z';
  }
  function width(host) { return Math.max(260, Math.floor(host.clientWidth || host.parentNode.clientWidth || 600)); }
  function labelWidth(strs) { return Math.max(28, Math.min(90, Math.max.apply(null, strs.map(s => String(s).length)) * 6.3 + 10)); }
  function thinLabels(n, w) { const per = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 46)))); return i => (n - 1 - i) % per === 0; }

  // ---------------- sparkline (string) ----------------
  function spark(values, o) {
    o = o || {};
    const w = o.w || 160, h = o.h || 30, pad = 3;
    const vals = values.map(v => (v == null || !isFinite(v) ? null : v));
    const nums = vals.filter(v => v != null);
    if (nums.length < 2) return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" aria-hidden="true"></svg>';
    let mn = Math.min.apply(null, nums), mx = Math.max.apply(null, nums);
    if (mn === mx) { mn -= 1; mx += 1; }
    const X = i => pad + i * (w - 2 * pad) / (vals.length - 1);
    const Y = v => h - pad - (v - mn) / (mx - mn) * (h - 2 * pad);
    const hiFrom = o.hiFrom == null ? vals.length - 1 : o.hiFrom;
    let d1 = '', d2 = '';
    vals.forEach((v, i) => {
      if (v == null) return;
      const p = X(i).toFixed(1) + ',' + Y(v).toFixed(1);
      if (i <= hiFrom) d1 += (d1 ? 'L' : 'M') + p;
      if (i >= hiFrom) d2 += (d2 ? 'L' : 'M') + p;
    });
    const last = vals.length - 1, lv = vals[last];
    const accent = o.color || css('--accent');
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" width="100%" height="' + h + '" aria-hidden="true">' +
      '<path d="' + d1 + '" fill="none" stroke="' + css('--deemph') + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      (d2 ? '<path d="' + d2 + '" fill="none" stroke="' + accent + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' : '') +
      (lv != null ? '<circle cx="' + X(last).toFixed(1) + '" cy="' + Y(lv).toFixed(1) + '" r="2.6" fill="' + accent + '"/>' : '') + '</svg>';
  }

  // ---------------- line chart ----------------
  function line(host, cfg) {
    host.textContent = '';
    const W = width(host), H = cfg.height || 210;
    const fmt = cfg.fmt || (v => String(v));
    const all = [];
    cfg.series.forEach(s => s.values.forEach(v => { if (v != null && isFinite(v)) all.push(v); }));
    (cfg.refs || []).forEach(r => { if (r.value != null && isFinite(r.value)) all.push(r.value); });
    if (!all.length) { host.innerHTML = '<div class="empty">No data in scope</div>'; return; }
    let mn = cfg.yMin != null ? cfg.yMin : Math.min.apply(null, all), mx = cfg.yMax != null ? cfg.yMax : Math.max.apply(null, all);
    if (cfg.zero !== false && mn > 0 && (mx - mn) / mx > 0.35) mn = 0;
    const sc = nice(mn, mx, 4);
    const lw = labelWidth(sc.ticks.map(fmt));
    const m = { l: lw, r: cfg.endLabels ? 70 : 14, t: 10, b: 24 };
    const s = svg(W, H);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = cfg.labels.length;
    const X = i => m.l + (n === 1 ? iw / 2 : i * iw / (n - 1));
    const Y = v => m.t + ih - (v - sc.min) / (sc.max - sc.min) * ih;
    if (cfg.hiFrom != null && cfg.hiFrom > 0) el('rect', { x: X(cfg.hiFrom) - (n > 1 ? iw / (n - 1) / 2 : 0), y: m.t, width: m.l + iw - X(cfg.hiFrom) + (n > 1 ? iw / (n - 1) / 2 : 0), height: ih, fill: 'rgba(57,135,229,0.06)' }, s);
    sc.ticks.forEach(t => {
      el('line', { x1: m.l, x2: m.l + iw, y1: Y(t), y2: Y(t), stroke: css('--grid'), 'stroke-width': 1 }, s);
      text(s, m.l - 6, Y(t) + 3.5, fmt(t), 'axis-text', 'end');
    });
    el('line', { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih, stroke: css('--axis'), 'stroke-width': 1 }, s);
    const show = thinLabels(n, iw);
    cfg.labels.forEach((lb, i) => { if (show(i)) text(s, X(i), H - 6, lb, 'axis-text', 'middle'); });
    const refY = [];
    (cfg.refs || []).forEach(r => {
      if (r.value == null || !isFinite(r.value) || r.value < sc.min || r.value > sc.max) return;
      el('line', { x1: m.l, x2: m.l + iw, y1: Y(r.value), y2: Y(r.value), stroke: r.color || css('--text-3'), 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: 0.9 }, s);
      // label a reference line only if it does not collide with one already labelled (colour still identifies it)
      if (refY.some(y => Math.abs(y - Y(r.value)) < 12)) return;
      refY.push(Y(r.value));
      text(s, m.l + 4, Y(r.value) - 4, r.label, 'axis-text', 'start', { fill: r.color || css('--text-3') });
    });
    const ends = [];
    cfg.series.forEach(se => {
      let d = '', d2 = '';
      const cut = cfg.dashFrom != null ? cfg.dashFrom : Infinity;
      se.values.forEach((v, i) => {
        if (v == null || !isFinite(v)) return;
        const p = X(i).toFixed(1) + ',' + Y(v).toFixed(1);
        if (i <= cut) d += (d ? 'L' : 'M') + p;
        if (i >= cut) d2 += (d2 ? 'L' : 'M') + p;
      });
      if (cfg.area && cfg.series.length === 1 && d) {
        const first = se.values.findIndex(v => v != null), lastI = se.values.length - 1 - se.values.slice().reverse().findIndex(v => v != null);
        el('path', { d: d + (d2 ? d2.replace(/^M/, 'L') : '') + 'L' + X(lastI) + ',' + (m.t + ih) + 'L' + X(first) + ',' + (m.t + ih) + 'Z', fill: se.color, opacity: 0.1 }, s);
      }
      el('path', { d: d, fill: 'none', stroke: se.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': se.dash || null }, s);
      if (d2) el('path', { d: d2, fill: 'none', stroke: se.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': '5 4', opacity: 0.9 }, s);
      const li = se.values.length - 1 - se.values.slice().reverse().findIndex(v => v != null && isFinite(v));
      if (li >= 0 && li < se.values.length && se.values[li] != null) {
        el('circle', { cx: X(li), cy: Y(se.values[li]), r: 4, fill: se.color, stroke: SURFACE(), 'stroke-width': 2 }, s);
        ends.push({ x: X(li), y: Y(se.values[li]), v: se.values[li] });
      }
    });
    if (cfg.endLabels) {
      // label only end points that do not collide; colliding series rely on legend + tooltip
      const kept = [];
      ends.slice().sort((a, b) => b.v - a.v).forEach(e => { if (kept.every(k => Math.abs(k.y - e.y) >= 13)) kept.push(e); });
      kept.forEach(e => text(s, e.x + 8, e.y + 4, fmt(e.v), 'value-text', 'start'));
    }
    // crosshair
    const cross = el('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ih, stroke: css('--text-3'), 'stroke-width': 1, opacity: 0 }, s);
    const hit = el('rect', { x: m.l - 6, y: m.t, width: iw + 12, height: ih, class: 'hit', tabindex: 0 }, s);
    const at = i => {
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 0.6);
      return cfg.series.map(se => ({ k: se.name, v: se.values[i] == null ? 'n/a' : fmt(se.values[i]), color: se.color }));
    };
    hit.addEventListener('pointermove', e => {
      const r = s.getBoundingClientRect(); const px = (e.clientX - r.left) * W / r.width;
      const i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / (n > 1 ? iw / (n - 1) : 1))));
      showTip(e, cfg.labels[i], at(i));
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); hideTip(); });
    host.appendChild(s);
    s.setAttribute('aria-label', cfg.aria || 'Line chart');
  }

  // ---------------- column chart (stacked or grouped) ----------------
  function columns(host, cfg) {
    host.textContent = '';
    const W = width(host), H = cfg.height || 220;
    const fmt = cfg.fmt || (v => String(v));
    const n = cfg.labels.length;
    const stacked = cfg.stacked !== false;
    const totals = cfg.labels.map((_, i) => cfg.series.reduce((a, se) => a + (se.values[i] || 0), 0));
    let mx = stacked ? Math.max.apply(null, totals) : Math.max.apply(null, cfg.series.map(se => Math.max.apply(null, se.values.map(v => v || 0))));
    if (cfg.line) mx = Math.max(mx, Math.max.apply(null, cfg.line.values.map(v => v || 0)));
    const sc = nice(0, mx || 1, 4);
    const lw = labelWidth(sc.ticks.map(fmt));
    const m = { l: lw, r: 10, t: 10, b: 24 };
    const s = svg(W, H);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / n;
    const Y = v => m.t + ih - (v - sc.min) / (sc.max - sc.min) * ih;
    sc.ticks.forEach(t => {
      el('line', { x1: m.l, x2: m.l + iw, y1: Y(t), y2: Y(t), stroke: css('--grid'), 'stroke-width': 1 }, s);
      text(s, m.l - 6, Y(t) + 3.5, fmt(t), 'axis-text', 'end');
    });
    const show = thinLabels(n, iw);
    const groups = [];
    cfg.labels.forEach((lb, i) => {
      const cx = m.l + band * i + band / 2;
      if (show(i)) text(s, cx, H - 6, lb, 'axis-text', 'middle');
      const g = el('g', { class: 'mark-hover' }, s);
      if (stacked) {
        const bw = Math.min(24, band * 0.62);
        let acc = 0;
        const visible = cfg.series.map((se, k) => ({ k: k, v: se.values[i] || 0 })).filter(x => x.v > 0);
        visible.forEach((x, j) => {
          const se = cfg.series[x.k];
          const y0 = Y(acc), y1 = Y(acc + x.v);
          const top = j === visible.length - 1;
          const hgt = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0));
          const yy = y1;
          if (top) el('path', { d: barPath(cx - bw / 2, yy, bw, hgt, 4), fill: se.color }, g);
          else el('rect', { x: cx - bw / 2, y: yy, width: bw, height: hgt, fill: se.color }, g);
          acc += x.v;
        });
      } else {
        const k = cfg.series.length;
        const bw = Math.min(18, band * 0.7 / k);
        cfg.series.forEach((se, j) => {
          const v = se.values[i] || 0;
          const x = cx - (k * bw + (k - 1) * 2) / 2 + j * (bw + 2);
          el('path', { d: barPath(x, Y(v), bw, Y(0) - Y(v), 4), fill: se.color }, g);
        });
      }
      groups.push(g);
    });
    el('line', { x1: m.l, x2: m.l + iw, y1: Y(0), y2: Y(0), stroke: css('--axis'), 'stroke-width': 1 }, s);
    if (cfg.line) {
      let d = '';
      cfg.line.values.forEach((v, i) => { if (v == null) return; d += (d ? 'L' : 'M') + (m.l + band * i + band / 2).toFixed(1) + ',' + Y(v).toFixed(1); });
      el('path', { d: d, fill: 'none', stroke: cfg.line.color, 'stroke-width': 2, 'stroke-dasharray': cfg.line.dash || null, 'stroke-linejoin': 'round' }, s);
      cfg.line.values.forEach((v, i) => { if (v != null) el('circle', { cx: m.l + band * i + band / 2, cy: Y(v), r: 3, fill: cfg.line.color, stroke: SURFACE(), 'stroke-width': 1.5 }, s); });
    }
    cfg.labels.forEach((lb, i) => {
      const hit = el('rect', { x: m.l + band * i, y: m.t, width: band, height: ih, class: 'hit' }, s);
      hit.addEventListener('pointermove', e => {
        groups.forEach((g, j) => g.setAttribute('opacity', j === i ? 1 : 0.55));
        const rows = cfg.series.map(se => ({ k: se.name, v: fmt(se.values[i] || 0), color: se.color }));
        if (stacked && cfg.series.length > 1) rows.push({ k: 'Total', v: fmt(totals[i]) });
        if (cfg.line) rows.push({ k: cfg.line.name, v: cfg.line.values[i] == null ? 'n/a' : fmt(cfg.line.values[i]), color: cfg.line.color });
        showTip(e, lb, rows);
      });
      hit.addEventListener('pointerleave', () => { groups.forEach(g => g.setAttribute('opacity', 1)); hideTip(); });
      if (cfg.onClick) { hit.style.cursor = 'pointer'; hit.addEventListener('click', () => cfg.onClick(i)); }
    });
    host.appendChild(s);
    s.setAttribute('aria-label', cfg.aria || 'Column chart');
  }

  // ---------------- horizontal bars ----------------
  function hbars(host, cfg) {
    host.textContent = '';
    const W = width(host);
    const fmt = cfg.fmt || (v => String(v));
    const rowH = cfg.rowH || 26;
    const items = cfg.items;
    const stacked = cfg.series && cfg.series.length > 1;
    const tot = items.map(it => (cfg.grouped ? Math.max.apply(null, it.values.map(v => v || 0)) : it.values.reduce((a, b) => a + (b || 0), 0)));
    const mx = Math.max.apply(null, tot.concat(cfg.max || 0)) || 1;
    const labW = Math.min(cfg.labelW || 170, Math.floor(W * 0.42));
    const valW = cfg.valW || 70;
    const H = items.length * rowH + 8;
    const s = svg(W, H);
    const iw = W - labW - valW - 8;
    const X = v => labW + v / mx * iw;
    items.forEach((it, i) => {
      const y = 4 + i * rowH, cy = y + rowH / 2;
      const lbl = it.label.length > Math.floor(labW / 6.4) ? it.label.slice(0, Math.floor(labW / 6.4) - 1) + '…' : it.label;
      text(s, labW - 8, cy + 4, lbl, 'label-text', 'end');
      const g = el('g', {}, s);
      const bh = Math.min(14, rowH - 10);
      if (cfg.grouped) {
        const k = it.values.length, gh = Math.min(10, (rowH - 8 - (k - 1) * 2) / k);
        it.values.forEach((v, j) => {
          const yy = cy - (k * gh + (k - 1) * 2) / 2 + j * (gh + 2);
          if (v != null && v > 0) el('path', { d: barPath(labW, yy, Math.max(0, X(v) - labW), gh, 3, 'right'), fill: cfg.series[j].color }, g);
          text(s, (v != null && v > 0 ? X(v) : labW) + 6, yy + gh - 1, v == null ? 'n/a' : fmt(v), 'axis-text', 'start', { style: 'font-size:10px' });
        });
      } else {
        let acc = 0;
        const visible = it.values.map((v, k) => ({ k: k, v: v || 0 })).filter(x => x.v > 0);
        visible.forEach((x, j) => {
          const x0 = X(acc) + (j > 0 ? 2 : 0), x1 = X(acc + x.v);
          const color = (cfg.series ? cfg.series[x.k].color : null) || it.color || css('--s1');
          const last = j === visible.length - 1;
          if (last) el('path', { d: barPath(x0, cy - bh / 2, Math.max(0, x1 - x0), bh, 4, 'right'), fill: color }, g);
          else el('rect', { x: x0, y: cy - bh / 2, width: Math.max(0, x1 - x0), height: bh, fill: color }, g);
          acc += x.v;
        });
        const lx = it.marker != null && Math.abs(X(it.marker) - X(tot[i])) < 60 ? Math.max(X(tot[i]), X(it.marker)) : X(tot[i]);
        text(s, lx + 6, cy + 4, it.valueLabel != null ? it.valueLabel : fmt(tot[i]), 'value-text', 'start');
      }
      if (it.marker != null) el('line', { x1: X(it.marker), x2: X(it.marker), y1: cy - bh / 2 - 3, y2: cy + bh / 2 + 3, stroke: css('--text-1'), 'stroke-width': 1.5 }, s);
      const hit = el('rect', { x: 0, y: y, width: W, height: rowH, class: 'hit' }, s);
      hit.addEventListener('pointermove', e => {
        const rows = stacked ? cfg.series.map((se, k) => ({ k: se.name, v: it.values[k] == null ? 'n/a' : fmt(it.values[k] || 0), color: se.color })) : [{ k: cfg.valueName || 'Value', v: it.valueLabel != null ? it.valueLabel : fmt(tot[i]), color: it.color || (cfg.series && cfg.series[0].color) }];
        if (stacked && !cfg.grouped) rows.push({ k: 'Total', v: fmt(tot[i]) });
        (it.extra || []).forEach(x => rows.push(x));
        g.setAttribute('opacity', 0.8);
        showTip(e, it.label, rows);
      });
      hit.addEventListener('pointerleave', () => { g.setAttribute('opacity', 1); hideTip(); });
      if (cfg.onClick) { hit.style.cursor = 'pointer'; hit.addEventListener('click', () => cfg.onClick(it, i)); }
    });
    host.appendChild(s);
    s.setAttribute('aria-label', cfg.aria || 'Bar chart');
  }

  // ---------------- dumbbell (before -> after per item) ----------------
  function dumbbell(host, cfg) {
    host.textContent = '';
    const W = width(host), fmt = cfg.fmt || (v => String(v));
    const rowH = 28, items = cfg.items;
    const labW = Math.min(180, Math.floor(W * 0.38)), valW = 54;
    const H = items.length * rowH + 26;
    const s = svg(W, H);
    const mx = Math.max.apply(null, items.map(it => Math.max(it.a, it.b))) || 1;
    const sc = nice(0, mx, 4);
    const iw = W - labW - valW;
    const X = v => labW + v / sc.max * iw;
    sc.ticks.forEach(t => {
      el('line', { x1: X(t), x2: X(t), y1: 4, y2: H - 20, stroke: css('--grid'), 'stroke-width': 1 }, s);
      text(s, X(t), H - 6, fmt(t), 'axis-text', 'middle');
    });
    items.forEach((it, i) => {
      const cy = 4 + i * rowH + rowH / 2;
      const lbl = it.label.length > Math.floor(labW / 6.4) ? it.label.slice(0, Math.floor(labW / 6.4) - 1) + '…' : it.label;
      text(s, labW - 10, cy + 4, lbl, 'label-text', 'end');
      el('line', { x1: X(it.b), x2: X(it.a), y1: cy, y2: cy, stroke: css('--axis'), 'stroke-width': 2 }, s);
      el('circle', { cx: X(it.a), cy: cy, r: 5, fill: cfg.aColor, stroke: SURFACE(), 'stroke-width': 2 }, s);
      el('circle', { cx: X(it.b), cy: cy, r: 5, fill: cfg.bColor, stroke: SURFACE(), 'stroke-width': 2 }, s);
      text(s, X(Math.max(it.a, it.b)) + 10, cy + 4, it.tag || '', 'value-text', 'start');
      const hit = el('rect', { x: 0, y: cy - rowH / 2, width: W, height: rowH, class: 'hit' }, s);
      hit.addEventListener('pointermove', e => showTip(e, it.label, [{ k: cfg.aName, v: fmt(it.a), color: cfg.aColor }, { k: cfg.bName, v: fmt(it.b), color: cfg.bColor }].concat(it.extra || [])));
      hit.addEventListener('pointerleave', hideTip);
    });
    host.appendChild(s);
    s.setAttribute('aria-label', cfg.aria || 'Dumbbell chart');
  }

  // ---------------- heatmap ----------------
  const HEAT = ['#1d1b1a', '#3a2417', '#5e2f17', '#8a3d16', '#b84d16', '#e8611a'];
  const HEAT_TXT = ['#c3c2b7', '#f2f1ee', '#ffffff', '#ffffff', '#ffffff', '#0b0b0b'];
  const heatBin = v => (v == null ? -1 : v < 10 ? 0 : v < 25 ? 1 : v < 40 ? 2 : v < 55 ? 3 : v < 70 ? 4 : 5);
  function heatmap(host, cfg) {
    host.textContent = '';
    const W = width(host), fmt = cfg.fmt || (v => String(Math.round(v)));
    const labW = Math.min(cfg.labelW || 150, Math.floor(W * 0.32));
    const cols = cfg.cols.length, rows = cfg.rows.length;
    const headH = cfg.headH || 44;
    const cw = (W - labW) / cols, ch = cfg.cellH || 30;
    const H = headH + rows * ch + 4;
    const s = svg(W, H);
    cfg.cols.forEach((c, j) => {
      const words = String(c).split(' ');
      const lines = []; let cur = '';
      words.forEach(w => { if ((cur + ' ' + w).trim().length > Math.max(6, Math.floor(cw / 6.2))) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
      if (cur) lines.push(cur);
      lines.slice(0, 3).forEach((ln, k) => text(s, labW + cw * j + cw / 2, headH - 6 - (Math.min(3, lines.length) - 1 - k) * 12, ln, 'axis-text', 'middle'));
    });
    cfg.rows.forEach((r, i) => {
      const y = headH + i * ch;
      text(s, labW - 8, y + ch / 2 + 4, r, 'label-text', 'end');
      cfg.cols.forEach((c, j) => {
        const v = cfg.values[i][j];
        const b = heatBin(v);
        const x = labW + cw * j;
        const rect = el('rect', { x: x + 1, y: y + 1, width: cw - 2, height: ch - 2, rx: 3, fill: b < 0 ? 'transparent' : HEAT[b], stroke: b < 0 ? css('--line-2') : null }, s);
        if (cw > 30) text(s, x + cw / 2, y + ch / 2 + 4, v == null ? 'n/a' : fmt(v), 'value-text', 'middle', { fill: b < 0 ? css('--text-3') : HEAT_TXT[b] });
        const hit = el('rect', { x: x, y: y, width: cw, height: ch, class: 'hit' }, s);
        hit.addEventListener('pointermove', e => { rect.setAttribute('stroke', css('--text-1')); showTip(e, r + ' · ' + c, [{ k: cfg.valueName || 'Risk score', v: v == null ? 'n/a' : fmt(v) }].concat(cfg.extra ? cfg.extra(i, j) : [])); });
        hit.addEventListener('pointerleave', () => { rect.setAttribute('stroke', b < 0 ? css('--line-2') : 'none'); hideTip(); });
        if (cfg.onClick) { hit.style.cursor = 'pointer'; hit.addEventListener('click', () => cfg.onClick(i, j)); }
      });
    });
    host.appendChild(s);
    s.setAttribute('aria-label', cfg.aria || 'Heatmap');
  }
  function heatLegend() {
    return '<div class="heat-legend"><span>Normalised risk 0</span><span class="cells">' + HEAT.map(c => '<span style="background:' + c + '"></span>').join('') + '</span><span>100</span><span class="muted">(0 = at target, 50 = warning, 100 = critical)</span></div>';
  }

  // ---------------- event timeline ----------------
  function timeline(host, cfg) {
    host.textContent = '';
    const W = width(host);
    const lanes = cfg.lanes, n = cfg.months.length;
    const labW = Math.min(150, Math.floor(W * 0.3)), laneH = 26;
    const H = lanes.length * laneH + 28;
    const s = svg(W, H);
    const iw = W - labW - 10;
    const X = x => labW + x / n * iw;
    const show = thinLabels(n, iw);
    cfg.months.forEach((mm, i) => {
      el('line', { x1: X(i), x2: X(i), y1: 0, y2: H - 22, stroke: css('--grid'), 'stroke-width': 1 }, s);
      if (show(i)) text(s, X(i + 0.5), H - 6, mm, 'axis-text', 'middle');
    });
    lanes.forEach((ln, i) => {
      const cy = i * laneH + laneH / 2;
      text(s, labW - 8, cy + 4, ln.length > 22 ? ln.slice(0, 21) + '…' : ln, 'label-text', 'end');
      el('line', { x1: labW, x2: labW + iw, y1: cy, y2: cy, stroke: css('--line'), 'stroke-width': 1 }, s);
    });
    cfg.events.forEach(ev => {
      const cy = ev.lane * laneH + laneH / 2;
      const r = Math.max(4, Math.min(11, 3 + Math.sqrt(ev.dur) * 0.7));
      const c = el('circle', { cx: X(ev.x), cy: cy, r: r, fill: ev.color, stroke: SURFACE(), 'stroke-width': 2, opacity: 0.95 }, s);
      const hit = el('circle', { cx: X(ev.x), cy: cy, r: Math.max(12, r + 4), class: 'hit' }, s);
      hit.addEventListener('pointermove', e => { c.setAttribute('stroke', css('--text-1')); showTip(e, ev.title, ev.rows); });
      hit.addEventListener('pointerleave', () => { c.setAttribute('stroke', SURFACE()); hideTip(); });
      if (cfg.onClick) { hit.style.cursor = 'pointer'; hit.addEventListener('click', () => cfg.onClick(ev)); }
    });
    host.appendChild(s);
    s.setAttribute('aria-label', cfg.aria || 'Timeline');
  }

  // ---------------- bullet (value vs thresholds), string ----------------
  function bullet(o) {
    const w = 320, h = 46;
    const vals = [o.value, o.tgt, o.warn, o.crit].filter(v => v != null && isFinite(v));
    if (!vals.length) return '';
    let mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    const pad = (mx - mn) * 0.15 || Math.abs(mx) * 0.1 || 1;
    mn = Math.max(o.floor == null ? -Infinity : o.floor, mn - pad); mx = mx + pad;
    if (o.cap != null) mx = Math.min(mx, o.cap);
    const X = v => 8 + (v - mn) / (mx - mn) * (w - 16);
    const up = o.dir === 'up';
    const zones = up ? [[mn, o.crit, 'critical'], [o.crit, o.warn, 'serious'], [o.warn, o.tgt, 'watch'], [o.tgt, mx, 'good']] : [[mn, o.tgt, 'good'], [o.tgt, o.warn, 'watch'], [o.warn, o.crit, 'serious'], [o.crit, mx, 'critical']];
    const col = { good: 'rgba(12,163,12,0.30)', watch: 'rgba(250,178,25,0.28)', serious: 'rgba(236,131,90,0.30)', critical: 'rgba(208,59,59,0.34)' };
    let out = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="max-width:420px" role="img" aria-label="Value against target and thresholds">';
    zones.forEach(z => { if (z[0] == null || z[1] == null) return; const a = X(Math.max(mn, Math.min(z[0], z[1]))), b = X(Math.min(mx, Math.max(z[0], z[1]))); if (b > a) out += '<rect x="' + a.toFixed(1) + '" y="10" width="' + (b - a).toFixed(1) + '" height="14" fill="' + col[z[2]] + '"/>'; });
    const vx = X(Math.max(mn, Math.min(mx, o.value)));
    out += '<rect x="8" y="14" width="' + Math.max(0, vx - 8).toFixed(1) + '" height="6" rx="2" fill="' + css('--text-1') + '"/>';
    if (o.tgt != null) out += '<line x1="' + X(o.tgt).toFixed(1) + '" x2="' + X(o.tgt).toFixed(1) + '" y1="6" y2="28" stroke="' + css('--text-1') + '" stroke-width="2"/>';
    const lab = (v, t, y) => (v == null ? '' : '<text x="' + X(v).toFixed(1) + '" y="' + y + '" class="axis-text" text-anchor="middle">' + esc(t) + '</text>');
    out += lab(o.tgt, 'Target', 40) + lab(o.warn, 'Warn', 40) + lab(o.crit, 'Crit', 40);
    return out + '</svg>';
  }

  // ---------------- figure wrapper with table-view twin ----------------
  function figure(container, o) {
    const fig = document.createElement('figure');
    fig.className = 'fig' + (o.cls ? ' ' + o.cls : '');
    fig.style.margin = '0';
    const legend = (o.legend || []).map(l => '<span class="key"><span class="' + (l.line ? 'ln' : 'sw') + '" style="background:' + l.color + '"></span>' + esc(l.name) + '</span>').join('');
    fig.innerHTML = '<div class="fig-head"><div><div class="fig-title">' + esc(o.title) + '</div>' + (o.sub ? '<div class="fig-sub">' + esc(o.sub) + '</div>' : '') + '</div>' +
      '<div class="fig-tools">' + (o.table ? '<button class="fig-btn" type="button" data-act="table">Table</button>' : '') + (o.onOpen ? '<button class="fig-btn" type="button" data-act="open">Details</button>' : '') + '</div></div>' +
      (legend ? '<div class="legend">' + legend + '</div>' : '') +
      '<div class="chart-view"><div class="fig-body"></div>' + (o.after || '') + '</div>' +
      (o.table ? '<div class="table-view"></div>' : '');
    container.appendChild(fig);
    const body = fig.querySelector('.fig-body');
    const draw = () => { try { o.render(body); } catch (e) { body.innerHTML = '<div class="empty">Chart unavailable</div>'; if (window.console) console.error(e); } };
    draw();
    fig._redraw = draw;
    const tb = fig.querySelector('[data-act=table]');
    if (tb) tb.addEventListener('click', () => {
      const on = fig.classList.toggle('show-table');
      tb.textContent = on ? 'Chart' : 'Table';
      if (on) {
        const t = o.table();
        fig.querySelector('.table-view').innerHTML = '<div class="tbl-wrap"><table class="tbl compact"><thead><tr>' + t.headers.map((hh, i) => '<th' + (i ? ' class="r"' : '') + '>' + esc(hh) + '</th>').join('') + '</tr></thead><tbody>' +
          t.rows.map(r => '<tr>' + r.map((c, i) => '<td' + (i ? ' class="r num"' : '') + '>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
      }
    });
    const ob = fig.querySelector('[data-act=open]');
    if (ob) ob.addEventListener('click', o.onOpen);
    return fig;
  }

  root.CISO_CHARTS = { spark: spark, line: line, columns: columns, hbars: hbars, dumbbell: dumbbell, heatmap: heatmap, heatLegend: heatLegend, heatColor: v => (heatBin(v) < 0 ? 'transparent' : HEAT[heatBin(v)]), timeline: timeline, bullet: bullet, figure: figure, showTip: showTip, hideTip: hideTip, esc: esc, css: css };
}(typeof self !== 'undefined' ? self : this));
