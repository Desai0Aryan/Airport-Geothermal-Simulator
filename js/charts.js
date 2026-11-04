/* Lightweight SVG charts (no dependencies): grouped/stacked bars and lines,
   hover tooltips, always-on legend for 2+ series, and a "Table" view toggle. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let tip = null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function tooltip() {
    if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    return tip;
  }
  function showTip(html, ev) {
    const t = tooltip(); t.innerHTML = html; t.style.display = 'block';
    const r = t.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY - r.height - 10;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y < 8) y = ev.clientY + 16;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }

  function niceScale(min, max, ticks) {
    if (max === min) { max = min + 1; }
    const span = max - min, raw = span / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag, step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10));
    return { lo, hi, ticks: out };
  }

  function barPath(x, y, w, h, r, top, bottom) {
    // rounded data end only; y is the top edge of the rect (h may be 0)
    r = Math.min(r, w / 2, Math.abs(h));
    if (h <= 0.01) return '';
    const t = top ? r : 0, b = bottom ? r : 0;
    return 'M' + x + ',' + (y + t) + (t ? 'Q' + x + ',' + y + ' ' + (x + t) + ',' + y : '') +
      'L' + (x + w - t) + ',' + y + (t ? 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + t) : '') +
      'L' + (x + w) + ',' + (y + h - b) + (b ? 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w - b) + ',' + (y + h) : '') +
      'L' + (x + b) + ',' + (y + h) + (b ? 'Q' + x + ',' + (y + h) + ' ' + x + ',' + (y + h - b) : '') + 'Z';
  }

  function legendHTML(cfg) {
    if (!cfg.series || cfg.series.length < 2 || cfg.legend === false) return '';
    return '<ul class="legend">' + cfg.series.map(s =>
      '<li><span class="sw" style="background:' + s.color + (s.dash ? ';height:0;border-top:2px dashed ' + s.color + ';background:none' : '') + '"></span>' + esc(s.name) + '</li>').join('') + '</ul>';
  }

  function tableHTML(cfg) {
    const f = cfg.tableFormat || cfg.format || (v => v);
    let h = '<table class="data-table"><thead><tr><th>' + esc(cfg.xName || '') + '</th>' +
      cfg.series.map(s => '<th>' + esc(s.name) + '</th>').join('') + '</tr></thead><tbody>';
    const cats = cfg.categories || cfg.x;
    cats.forEach((c, i) => {
      h += '<tr><th scope="row">' + esc(cfg.xFormat ? cfg.xFormat(c) : c) + '</th>' +
        cfg.series.map(s => '<td>' + (s.values[i] == null ? '–' : esc(f(s.values[i]))) + '</td>').join('') + '</tr>';
    });
    return h + '</tbody></table>';
  }

  function plotBar(W, cfg) {
    const H = cfg.height || 250, m = { t: 14, r: 12, b: 30, l: 52 };
    const cats = cfg.categories, S = cfg.series, stacked = !!cfg.stacked;
    const fmt = cfg.format || (v => v), axf = cfg.axisFormat || fmt;
    let vmin = 0, vmax = 0;
    cats.forEach((_, i) => {
      if (stacked) { let pos = 0, neg = 0; S.forEach(s => { const v = s.values[i] || 0; if (v >= 0) pos += v; else neg += v; }); vmax = Math.max(vmax, pos); vmin = Math.min(vmin, neg); }
      else S.forEach(s => { const v = s.values[i] || 0; vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); });
    });
    if (cfg.refLine != null) vmax = Math.max(vmax, cfg.refLine);
    const sc = niceScale(vmin, vmax <= 0 ? 1 : vmax * 1.04, 4);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const Y = v => m.t + ih - (v - sc.lo) / (sc.hi - sc.lo) * ih;
    const band = iw / cats.length, pad = Math.min(0.32 * band, 22);
    const groupW = band - pad * 2, n = stacked ? 1 : S.length, gap = n > 1 ? 3 : 0;
    const bw = Math.min(46, (groupW - gap * (n - 1)) / n);
    let out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="' + esc(cfg.title || 'chart') + '">';
    sc.ticks.forEach(t => {
      out += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/>' +
        '<text class="tick" x="' + (m.l - 8) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + esc(axf(t)) + '</text>';
    });
    out += '<line class="axis" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
    cats.forEach((c, i) => {
      const cx = m.l + band * i + band / 2;
      out += '<text class="tick" x="' + cx + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(c) + '</text>';
      if (stacked) {
        let pos = 0, neg = 0; const last = S.reduce((li, s, k) => ((s.values[i] || 0) > 0 ? k : li), -1);
        S.forEach((s, k) => {
          const v = s.values[i] || 0; if (!v) return;
          const y0 = v >= 0 ? pos : neg, y1 = y0 + v; if (v >= 0) pos = y1; else neg = y1;
          const yt = Y(Math.max(y0, y1)), h = Math.abs(Y(y0) - Y(y1)) - (k !== last ? 1.5 : 0);
          out += '<path d="' + barPath(cx - bw / 2, yt, bw, Math.max(h, 0), 4, k === last, false) + '" fill="' + s.color + '"/>';
        });
      } else {
        S.forEach((s, k) => {
          const v = s.values[i] || 0, x = cx - (n * bw + gap * (n - 1)) / 2 + k * (bw + gap);
          const col = (cfg.colors && cfg.colors[i]) || s.color;
          const yt = v >= 0 ? Y(v) : Y(0), h = Math.abs(Y(v) - Y(0));
          out += '<path d="' + barPath(x, yt, bw, h, 4, v >= 0, v < 0) + '" fill="' + col + '"/>';
          if (cfg.labels) out += '<text class="vlabel" x="' + (x + bw / 2) + '" y="' + (v >= 0 ? yt - 5 : yt + h + 12) + '" text-anchor="middle">' + esc(fmt(v)) + '</text>';
        });
      }
      out += '<rect class="hit" data-i="' + i + '" x="' + (m.l + band * i) + '" y="' + m.t + '" width="' + band + '" height="' + ih + '" fill="transparent"/>';
    });
    if (cfg.refLine != null) out += '<line class="ref" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(cfg.refLine) + '" y2="' + Y(cfg.refLine) + '"/><text class="tick" x="' + (W - m.r) + '" y="' + (Y(cfg.refLine) - 4) + '" text-anchor="end">' + esc(cfg.refLabel || '') + '</text>';
    if (cfg.yTitle) out += '<text class="ytitle" x="' + m.l + '" y="9">' + esc(cfg.yTitle) + '</text>';
    out += '</svg>';
    return { svg: out, hover: i => {
      const rows = S.map((s, k) => '<div class="tt-row"><span class="sw" style="background:' + ((cfg.colors && cfg.colors[i] && S.length === 1) ? cfg.colors[i] : s.color) + '"></span>' + esc(s.name) + '<b>' + esc(fmt(s.values[i] || 0)) + '</b></div>').join('');
      const tot = stacked ? '<div class="tt-row tt-total">Total<b>' + esc(fmt(S.reduce((a, s) => a + (s.values[i] || 0), 0))) + '</b></div>' : '';
      return '<div class="tt-h">' + esc(cats[i]) + '</div>' + rows + tot;
    } };
  }

  function plotLine(W, cfg) {
    const H = cfg.height || 250, m = { t: 14, r: 24, b: 30, l: 52 };
    const xs = cfg.x, S = cfg.series, fmt = cfg.format || (v => v), axf = cfg.axisFormat || fmt;
    let vmin = Infinity, vmax = -Infinity;
    S.forEach(s => s.values.forEach(v => { if (v != null && isFinite(v)) { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); } }));
    if (!isFinite(vmin)) { vmin = 0; vmax = 1; }
    if (cfg.zero) { vmin = Math.min(vmin, 0); vmax = Math.max(vmax, 0); }
    const pad = (vmax - vmin) * 0.06 || 1;
    const sc = niceScale((cfg.zero || vmin >= 0) ? Math.min(vmin, 0) : vmin - pad, vmax + pad, 4);
    const iw = W - m.l - m.r, ih = H - m.t - m.b, n = xs.length;
    const X = i => m.l + (n > 1 ? i / (n - 1) : 0.5) * iw, Y = v => m.t + ih - (v - sc.lo) / (sc.hi - sc.lo) * ih;
    let out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="' + esc(cfg.title || 'chart') + '">';
    sc.ticks.forEach(t => { out += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text class="tick" x="' + (m.l - 8) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + esc(axf(t)) + '</text>'; });
    if (cfg.zero) out += '<line class="axis" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
    const every = cfg.xEvery || Math.max(1, Math.ceil(n / Math.floor(iw / 44)));
    xs.forEach((x, i) => { if (i % every === 0) out += '<text class="tick" x="' + X(i) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(cfg.xFormat ? cfg.xFormat(x) : x) + '</text>'; });
    S.forEach(s => {
      let d = '', pen = false;
      s.values.forEach((v, i) => { if (v == null || !isFinite(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); pen = true; });
      out += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"' + (s.dash ? ' stroke-dasharray="6 4"' : '') + '/>';
    });
    if (cfg.marks) cfg.marks.forEach(mk => { out += '<line class="ref" x1="' + X(mk.i) + '" x2="' + X(mk.i) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '"/><text class="tick" x="' + X(mk.i) + '" y="' + (m.t + 10) + '" text-anchor="middle">' + esc(mk.label) + '</text>'; });
    if (cfg.yTitle) out += '<text class="ytitle" x="' + m.l + '" y="9">' + esc(cfg.yTitle) + '</text>';
    out += '<line class="cross" x1="0" x2="0" y1="' + m.t + '" y2="' + (m.t + ih) + '" style="display:none"/><g class="dots"></g>';
    out += '<rect class="hitline" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" fill="transparent"/></svg>';
    return { svg: out, X, Y, m, iw, n, hover: i => {
      const rows = S.map(s => s.values[i] == null ? '' : '<div class="tt-row"><span class="sw" style="background:' + s.color + '"></span>' + esc(s.name) + '<b>' + esc(fmt(s.values[i])) + '</b></div>').join('');
      return '<div class="tt-h">' + esc(cfg.xFormat ? cfg.xFormat(xs[i]) : xs[i]) + '</div>' + rows;
    } };
  }

  function draw(el) {
    const cfg = el._cfg, plot = el.querySelector('.plot');
    const W = Math.max(280, Math.round(plot.clientWidth || el.clientWidth || 600));
    const P = cfg.type === 'line' ? plotLine(W, cfg) : plotBar(W, cfg);
    plot.innerHTML = P.svg;
    const svg = plot.querySelector('svg');
    if (cfg.type === 'line') {
      const hit = svg.querySelector('.hitline'), cross = svg.querySelector('.cross'), dots = svg.querySelector('.dots');
      const move = ev => {
        const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * (W / r.width);
        let i = Math.round((x - P.m.l) / P.iw * (P.n - 1)); i = Math.max(0, Math.min(P.n - 1, i));
        cross.setAttribute('x1', P.X(i)); cross.setAttribute('x2', P.X(i)); cross.style.display = '';
        dots.innerHTML = cfg.series.map(s => s.values[i] == null ? '' : '<circle cx="' + P.X(i) + '" cy="' + P.Y(s.values[i]) + '" r="4.5" fill="' + s.color + '" class="dot"/>').join('');
        showTip(P.hover(i), ev);
      };
      hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
      hit.addEventListener('pointerleave', () => { cross.style.display = 'none'; dots.innerHTML = ''; hideTip(); });
    } else {
      svg.querySelectorAll('.hit').forEach(h => {
        const mv = ev => showTip(P.hover(+h.dataset.i), ev);
        h.addEventListener('pointermove', mv); h.addEventListener('pointerdown', mv); h.addEventListener('pointerleave', hideTip);
      });
    }
    el.querySelector('.legend-slot').innerHTML = legendHTML(cfg);
    el.querySelector('.tablewrap').innerHTML = tableHTML(cfg);
  }

  /* mount or update a chart inside `el` */
  function render(el, cfg) {
    if (!el._mounted) {
      el._mounted = true; el._tableView = false;
      el.classList.add('chart');
      el.innerHTML = '<div class="chart-tools"><button type="button" class="btn-mini" aria-pressed="false">Table view</button></div>' +
        '<div class="legend-slot"></div><div class="plot"></div><div class="tablewrap" hidden></div>';
      const btn = el.querySelector('.btn-mini');
      btn.addEventListener('click', () => {
        el._tableView = !el._tableView;
        btn.setAttribute('aria-pressed', el._tableView); btn.textContent = el._tableView ? 'Chart view' : 'Table view';
        el.querySelector('.plot').hidden = el._tableView; el.querySelector('.tablewrap').hidden = !el._tableView;
      });
      if (window.ResizeObserver) {
        let last = 0;
        new ResizeObserver(() => { const w = el.querySelector('.plot').clientWidth; if (el._cfg && Math.abs(w - last) > 4 && w > 0) { last = w; draw(el); } }).observe(el);
      }
    }
    el._cfg = cfg; draw(el);
  }

  root.Charts = { render, hideTip };
})(window);
