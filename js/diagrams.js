/* Simple cross-section diagrams for the three systems. Flow animation direction and
   colour follow the live heating / cooling mode; labels show live numbers. */
(function (root) {
  'use strict';
  const nf = (v, d) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 });

  function defs() {
    return '<defs>' +
      '<marker id="ah-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--hot)"/></marker>' +
      '<marker id="ah-cold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--cold)"/></marker>' +
      '<marker id="ah-idle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--muted)"/></marker></defs>';
  }

  function strata(opts) {
    let s = '<rect class="sky" x="0" y="0" width="760" height="130"/>' +
      '<rect class="soil1" x="0" y="130" width="760" height="48"/>' +
      '<rect class="soil2" x="0" y="178" width="760" height="40"/>' +
      '<rect class="' + (opts.aquifer ? 'aquifer' : 'soil3') + '" x="0" y="218" width="760" height="72"/>' +
      '<rect class="rock" x="0" y="290" width="760" height="50"/>' +
      '<line class="surface" x1="0" x2="760" y1="130" y2="130"/>' +
      '<text class="strata-l" x="10" y="150">Topsoil</text><text class="strata-l" x="10" y="196">Sand &amp; gravel</text>' +
      '<text class="strata-l" x="10" y="236">' + (opts.aquifer ? 'Aquifer' : 'Clay &amp; shale') + '</text><text class="strata-l" x="10" y="312">Bedrock</text>';
    return s;
  }

  function terminal(x, snap, mode, label, hpLabel) {
    const w = 250, y = 26;
    const col = mode === 'heating' ? 'hot' : mode === 'cooling' ? 'cold' : 'idle';
    let s = '<g class="building"><path d="M' + (x - 8) + ',54 L' + (x + w / 2) + ',' + y + ' L' + (x + w + 8) + ',54 Z" class="roof"/>' +
      '<rect x="' + x + '" y="54" width="' + w + '" height="76" class="walls" rx="2"/>';
    for (let i = 0; i < 6; i++) s += '<rect x="' + (x + 14 + i * 38) + '" y="62" width="26" height="22" class="win"/>';
    s += '<text class="lbl strong" x="' + (x + w / 2) + '" y="20" text-anchor="middle">' + label + '</text>';
    // heat pump box
    s += '<rect x="' + (x + w / 2 - 55) + '" y="94" width="110" height="30" rx="4" class="hp"/>' +
      '<text class="lbl" x="' + (x + w / 2) + '" y="113" text-anchor="middle">' + hpLabel + '</text></g>';
    // heat flow arrow into the building (up when heating, down toward ground when cooling)
    const ax = x + w / 2;
    if (mode === 'heating') s += '<line class="flowline ' + col + ' flow" x1="' + ax + '" y1="93" x2="' + ax + '" y2="68" marker-end="url(#ah-hot)"/>';
    else if (mode === 'cooling') s += '<line class="flowline ' + col + ' flow" x1="' + ax + '" y1="68" x2="' + ax + '" y2="93" marker-end="url(#ah-cold)"/>';
    return s;
  }

  function modeText(snap) {
    if (snap.mode === 'heating') return 'Heating: ' + nf(snap.heat / 3412.14) + ' kW of heat to the terminal';
    if (snap.mode === 'cooling') return 'Cooling: ' + nf(snap.cool / 3412.14) + ' kW of cooling for the terminal';
    return 'Mild weather: almost no heating or cooling needed';
  }

  function pipe(d, cls, rev) { return '<path d="' + d + '" class="pipe ' + cls + '"/><path d="' + d + '" class="pipe-flow ' + cls + (rev ? ' rev' : '') + '"/>'; }

  function utube(x, top, bot, cls) {
    const d = 'M' + (x - 7) + ',' + top + ' L' + (x - 7) + ',' + bot + ' A7,7 0 0 0 ' + (x + 7) + ',' + bot + ' L' + (x + 7) + ',' + top;
    return '<path d="' + d + '" class="pipe ' + cls + '" /><path d="' + d + '" class="pipe-flow ' + cls + '"/>';
  }

  /* ---------- open loop ---------- */
  function open(ctx, opt) {
    const r = ctx.res.open, s = r.subs[0], sn = ctx.snap, i = sn.open, p = ctx.p;
    opt = opt || {};
    const wellTop = 130, wellBot = 252;
    let o = '<svg viewBox="0 0 760 340" role="img" aria-label="Open-loop diagram: groundwater is pumped up, passes the heat pump, and returns to the aquifer">' + defs() + strata({ aquifer: true });
    o += terminal(255, sn, sn.mode, 'Airport terminal', 'Heat pump');
    // production well left, injection well right
    o += pipe('M110,' + wellBot + ' L110,100 L255,100', 'water');
    o += pipe('M505,100 L650,100 L650,' + wellBot, 'water');
    o += '<rect x="102" y="' + (wellBot - 20) + '" width="16" height="24" rx="3" class="pump"/><text class="lbl small" x="110" y="' + (wellBot + 18) + '" text-anchor="middle">Pump</text>';
    o += '<path d="M104,' + wellBot + ' L104,' + (wellBot + 18) + ' M116,' + wellBot + ' L116,' + (wellBot + 18) + '" class="screen"/>';
    o += '<text class="lbl strong" x="110" y="86" text-anchor="middle">Production well</text>';
    o += '<text class="lbl strong" x="650" y="86" text-anchor="middle">Injection well</text>';
    o += '<text class="lbl" x="110" y="272" text-anchor="middle">' + nf(p.gwTemp) + '°F groundwater</text>';
    const ret = sn.mode === 'heating' ? p.gwTemp - p.open.dT : sn.mode === 'cooling' ? p.gwTemp + p.open.dT : p.gwTemp;
    o += '<text class="lbl" x="650" y="272" text-anchor="middle">returns at ' + nf(ret) + '°F</text>';
    o += '<text class="lbl" x="382" y="160" text-anchor="middle">' + (opt.flowText || (nf(s.designFlow) + ' gpm design flow, ' + s.wellCount + ' wells')) + '</text>';
    o += '<text class="lbl dim" x="382" y="178" text-anchor="middle">' + nf(i.pumpKW, 0) + ' kW pumping now' + '</text>';
    o += '<text class="lbl dim" x="382" y="196" text-anchor="middle">' + modeText(sn).split(':')[0] + ' COP ' + ((sn.mode === 'heating' ? i.copH : i.copC) ? nf(sn.mode === 'heating' ? i.copH : i.copC, 1) : '-') + '</text>';
    return o + '</svg>';
  }

  /* ---------- closed loop ---------- */
  function closed(ctx) {
    const r = ctx.res.closed, s = r.subs[0], sn = ctx.snap, i = sn.closed, p = ctx.p;
    const depthPx = 90 + Math.min(130, Math.max(0, (p.closed.depth - 150) / 650 * 130));
    const top = 156, bot = top + depthPx;
    let o = '<svg viewBox="0 0 760 340" role="img" aria-label="Closed-loop diagram: fluid circulates through sealed boreholes and exchanges heat with the ground">' + defs() + strata({ aquifer: false });
    o += terminal(255, sn, sn.mode, 'Airport terminal', 'Heat pump');
    o += pipe('M380,124 L380,144', 'loop');
    o += pipe('M150,144 L610,144', 'loop');
    for (let k = 0; k < 7; k++) { const x = 170 + k * 70; o += pipe('M' + x + ',144 L' + x + ',' + top, 'loop') + utube(x, top, bot, 'loop'); }
    o += '<text class="lbl strong" x="380" y="' + (bot + 24) + '" text-anchor="middle">Sealed boreholes</text>';
    // plan view inset
    const n = Math.min(s.bores, 120), cols = Math.ceil(Math.sqrt(n * 1.4)), rows = Math.ceil(n / cols);
    const cell = Math.min(9, 96 / Math.max(cols, rows));
    o += '<g class="inset"><rect x="568" y="10" width="184" height="112" rx="6" class="insetbox"/><text class="lbl small" x="576" y="26">Borefield from above</text>';
    for (let q = 0; q < n; q++) o += '<circle cx="' + (576 + (q % cols) * cell + cell / 2) + '" cy="' + (36 + Math.floor(q / cols) * cell + cell / 2) + '" r="' + (cell * 0.32) + '" class="bore"/>';
    o += '<text class="lbl small" x="576" y="116">' + nf(s.bores) + ' bores, ' + nf(s.land, 1) + ' acres' + (n < s.bores ? ' (not all drawn)' : '') + '</text></g>';
    // dimension line
    o += '<line class="dim-line" x1="132" x2="132" y1="' + top + '" y2="' + bot + '"/><text class="lbl small" x="126" y="' + ((top + bot) / 2) + '" text-anchor="end">' + nf(p.closed.depth) + ' ft</text>';
    o += '<text class="lbl" x="380" y="160" text-anchor="middle" style="display:none"></text>';
    const loopT = i.loopT != null ? nf(i.loopT) + '°F' : '-';
    o += '<g><text class="lbl" x="620" y="' + (top + 34) + '">Ground ' + nf(s.Tge) + '°F</text><text class="lbl dim" x="620" y="' + (top + 52) + '">Loop fluid ' + (sn.mode === 'idle' ? nf(s.Tge) + '°F' : loopT) + '</text><text class="lbl dim" x="620" y="' + (top + 70) + '">COP ' + ((sn.mode === 'heating' ? i.copH : i.copC) ? nf(sn.mode === 'heating' ? i.copH : i.copC, 1) : '-') + '</text></g>';
    return o + '</svg>';
  }

  /* ---------- hybrid ---------- */
  function hybrid(ctx) {
    const r = ctx.res.hybrid, sn = ctx.snap, p = ctx.p, x = p.hybrid.openShare;
    const so = r.subs[0], sc = r.subs[1];
    const wellBot = 252, top = 156, bot = 232;
    let o = '<svg viewBox="0 0 760 340" role="img" aria-label="Hybrid diagram: a groundwater well pair and a borefield share the building load">' + defs() + strata({ aquifer: true });
    o += terminal(255, sn, sn.mode, 'Airport terminal', 'Heat pumps');
    if (so.active) {
      o += pipe('M70,' + wellBot + ' L70,100 L255,100', 'water');
      o += pipe('M190,' + wellBot + ' L190,112 L255,112', 'water', true);
      o += '<rect x="62" y="' + (wellBot - 20) + '" width="16" height="24" rx="3" class="pump"/>';
      o += '<text class="lbl strong" x="70" y="86" text-anchor="middle">Production</text><text class="lbl strong" x="190" y="86" text-anchor="middle">Injection</text>';
      o += '<text class="lbl" x="130" y="276" text-anchor="middle">' + nf(so.designFlow) + ' gpm, ' + so.wellCount + ' wells</text>';
    }
    if (sc.active) {
      o += pipe('M505,106 L545,106 L545,144 L700,144', 'loop');
      for (let k = 0; k < 4; k++) { const xx = 565 + k * 45; o += pipe('M' + xx + ',144 L' + xx + ',' + top, 'loop') + utube(xx, top, bot, 'loop'); }
      o += '<text class="lbl" x="632" y="' + (bot + 34) + '" text-anchor="middle">' + nf(sc.bores) + ' bores, ' + nf(sc.land, 1) + ' acres</text>';
    }
    // split bar
    o += '<g><rect x="260" y="164" width="240" height="14" rx="7" class="splitbg"/><rect x="260" y="164" width="' + (240 * x / 100) + '" height="14" rx="7" class="splitopen"/>' +
      (x < 100 ? '<rect x="' + (260 + 240 * x / 100) + '" y="164" width="' + (240 * (1 - x / 100)) + '" height="14" rx="7" class="splitclosed"/>' : '') + '</g>';
    o += '<text class="lbl" x="380" y="198" text-anchor="middle">' + nf(x) + '% open-loop, ' + nf(100 - x) + '% closed-loop</text>';
    o += '<text class="lbl dim" x="380" y="216" text-anchor="middle">Share of heating and cooling demand</text>';
    return o + '</svg>';
  }

  root.Diagrams = { open, closed, hybrid };
})(window);
