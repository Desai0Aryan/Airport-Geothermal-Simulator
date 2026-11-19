/* Airport Open-Loop Geothermal Simulator - UI controller */
(function () {
  'use strict';
  const E = window.GeoEngine, C = window.Charts, D = window.Diagrams;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const nf = (v, d) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 });
  const money = v => (v < 0 ? '-' : '') + '$' + nf(Math.abs(v));
  const moneyC = v => { const a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1e6 ? s + '$' + nf(a / 1e6, 2) + 'M' : a >= 1e4 ? s + '$' + nf(a / 1e3, 0) + 'k' : a >= 1e3 ? s + '$' + nf(a / 1e3, 1) + 'k' : s + '$' + nf(a); };
  const yrs = v => v === Infinity ? 'No payback' : v === 0 ? 'Immediate' : v > 100 ? 'Over 100 yrs' : nf(v, 1) + ' yrs';
  const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const colors = () => ({ open: cssv('--open'), base: cssv('--base'), heat: cssv('--c-heat'), cool: cssv('--c-cool'), pump: cssv('--c-pump'), back: cssv('--c-back'), gas: cssv('--c-gas'), good: cssv('--good') });

  let state = E.makeDefaults('statecollege');
  const inst3d = {}; let viewMode = '3d', prevKpi = [], no3d = !window.Scene3D;
  const curTheme = () => document.documentElement.dataset.theme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  let res = null, snap = null, eco = null, active = 'sim', raf = 0, uid = 0, heroPrev = {};
  const getp = k => k.split('.').reduce((o, x) => o[x], state);
  const setp = (k, v) => { const a = k.split('.'), l = a.pop(); a.reduce((o, x) => o[x], state)[l] = v; };
  const typical = () => E.seasonTypicalTemp(state.climate, state.season);

  /* ---------------- control builders ---------------- */
  function slider(sp) {
    const id = 'c' + (uid++), sc = sp.scale || 1, dec = sp.dec || 0;
    return '<div class="ctl" data-key="' + sp.key + '" data-scale="' + sc + '" data-dec="' + dec + '">' +
      '<label for="' + id + '">' + sp.label + '</label><div class="ctl-row">' +
      '<input type="range" id="' + id + '" min="' + sp.min + '" max="' + sp.max + '" step="' + sp.step + '" aria-label="' + sp.label + '">' +
      '<span class="numbox">' + (sp.prefix ? '<span>' + sp.prefix + '</span>' : '') + '<input type="number" min="' + sp.min + '" max="' + sp.max + '" step="' + sp.step + '" aria-label="' + sp.label + ' value">' +
      (sp.unit ? '<span>' + sp.unit + '</span>' : '') + '</span></div>' + (sp.help ? '<p class="help">' + sp.help + '</p>' : '') + '</div>';
  }
  function numCtl(sp) {
    const id = 'c' + (uid++), sc = sp.scale || 1, dec = sp.dec || 0;
    return '<div class="ctl" data-key="' + sp.key + '" data-scale="' + sc + '" data-dec="' + dec + '"><label for="' + id + '">' + sp.label + '</label>' +
      '<span class="numbox"><input id="' + id + '" type="number" min="' + sp.min + '" max="' + sp.max + '" step="' + sp.step + '">' + (sp.unit ? '<span>' + sp.unit + '</span>' : '') + '</span></div>';
  }
  const check = (key, label, help) => { const id = 'c' + (uid++); return '<div class="check"><input type="checkbox" id="' + id + '" data-key="' + key + '"><label for="' + id + '">' + label + (help ? '<span class="help" style="display:block">' + help + '</span>' : '') + '</label></div>'; };

  function buildControls() {
    const cl = E.CLIMATES;
    let h = '<div class="cgroup"><h2>Weather and season</h2><div class="chips" role="group" aria-label="Climate preset">' +
      Object.keys(cl).map(id => '<button type="button" class="chip" data-climate="' + id + '" aria-pressed="false">' + cl[id].name + '<small>' + cl[id].tag + '</small></button>').join('') + '</div>' +
      '<p class="help" style="margin:-4px 0 10px">Monthly temperatures are NOAA/NWS normals. Aquifer supply per city is an illustrative assumption.</p>' +
      '<div class="ctl" data-key="ui.season" data-scale="1" data-dec="0"><label for="season-r">Season</label><input type="range" id="season-r" min="0" max="3" step="1" style="width:100%;accent-color:var(--ink)" aria-valuetext="">' +
      '<div class="season-scale" id="season-scale">' + E.SEASON_ORDER.map(s => '<span data-s="' + s + '">' + E.SEASONS[s].label + '</span>').join('') + '</div></div>' +
      slider({ key: 'ui.temp', label: 'Outdoor temperature', min: -20, max: 120, step: 1, unit: '°F' }) +
      '<div id="temp-note" class="help"></div><button type="button" class="btn-mini reset-temp" id="temp-reset">Back to typical temperature</button></div>';
    h += '<div class="cgroup"><h2>Terminal building</h2>' +
      slider({ key: 'sqft', label: 'Terminal size', min: 100000, max: 2500000, step: 25000, unit: 'sq ft', help: 'Conditioned floor area.' }) +
      slider({ key: 'heatMult', label: 'Heating demand', min: 40, max: 160, step: 5, scale: 100, unit: '%', help: '100% is a typical terminal for this climate.' }) +
      slider({ key: 'coolMult', label: 'Cooling demand', min: 40, max: 160, step: 5, scale: 100, unit: '%', help: 'Raise for crowds, glass, or lighting heat.' }) + '</div>';
    h += '<div class="cgroup"><h2>Energy prices</h2>' +
      slider({ key: 'elecPrice', label: 'Electricity price', min: 0.04, max: 0.30, step: 0.005, dec: 3, prefix: '$', unit: '/kWh', help: 'US commercial average is about $0.14 (EIA).' }) +
      slider({ key: 'gasPrice', label: 'Natural gas price', min: 0.4, max: 3, step: 0.05, dec: 2, prefix: '$', unit: '/therm', help: 'US commercial average is about $1.07 per therm (EIA).' }) + '</div>';
    h += '<div class="cgroup"><h2>Project and funding</h2>' +
      '<div class="seg2" role="group" aria-label="Project type"><button type="button" data-ptype="new" aria-pressed="true">New or replacement plant</button><button type="button" data-ptype="retro" aria-pressed="false">Retrofit, keep full plant</button></div>' +
      '<p class="help" id="ptype-help" style="margin:6px 0 12px"></p>' +
      slider({ key: 'grantPct', label: 'Grant for the “with grant” case', min: 0, max: 60, step: 1, unit: '%', help: 'Share of the geothermal equipment cost (wells, heat exchanger, heat pumps) paid by a grant or tax credit. The “without grant” case always uses 0%.' }) +
      '<div class="presets" role="group" aria-label="Grant presets"><button type="button" class="btn-mini" data-set="grantPct:6">6% base credit</button><button type="button" class="btn-mini" data-set="grantPct:30">30% credit</button><button type="button" class="btn-mini" data-set="grantPct:50">50% (airport grant)</button></div>' +
      slider({ key: 'costMult', label: 'Installation cost level', min: 50, max: 200, step: 5, scale: 100, unit: '%', help: 'Scales every geothermal installation cost.' }) +
      slider({ key: 'sizePct', label: 'Wells sized for', min: 50, max: 100, step: 5, unit: '% of peak', help: 'The right-sized backup boiler and chiller cover the rest.' }) +
      slider({ key: 'discountPct', label: 'Discount rate (real)', min: 0, max: 8, step: 0.5, dec: 1, unit: '%', help: 'Used only for the present-value lines. Simple payback ignores it.' }) + '</div>';
    h += '<div class="cgroup"><button type="button" class="btn" id="btn-reset2" style="width:100%">Reset all inputs</button></div>';
    $('#controls').innerHTML = h;
  }

  function chartCard(id, title, sub, wide) { return '<section class="card chart-card' + (wide ? ' wide' : '') + '"><h3>' + title + '</h3><p class="sub">' + sub + '</p><div data-chart="' + id + '"></div></section>'; }

  function openSettings() {
    return [
      check('open.auto', 'Auto-size water flow to the load', 'Off lets you set the flow by hand.'),
      slider({ key: 'open.flow', label: 'Water flow rate', min: 100, max: 4000, step: 25, unit: 'gpm', help: 'Design pumping rate. Capped by the groundwater supply below.' }),
      slider({ key: 'open.supply', label: 'Groundwater availability', min: 200, max: 8000, step: 50, unit: 'gpm', help: 'Most the aquifer can sustainably supply and accept back.' }),
      slider({ key: 'gwTemp', label: 'Groundwater temperature', min: 35, max: 85, step: 1, unit: '°F' }),
      slider({ key: 'open.dT', label: 'Water temperature change', min: 6, max: 20, step: 1, unit: '°F', help: 'Bigger swing needs less water but lowers efficiency.' }),
      slider({ key: 'open.kwPer100', label: 'Pumping energy', min: 1.5, max: 8, step: 0.1, dec: 1, unit: 'kW per 100 gpm', help: 'Depends on well depth and piping. Lower is better.' }),
      slider({ key: 'open.wellCost', label: 'Cost per well', min: 40000, max: 250000, step: 5000, prefix: '$', help: 'Production and injection wells each count.' }),
      slider({ key: 'open.wellYield', label: 'Yield per well', min: 200, max: 1000, step: 50, unit: 'gpm' }),
      slider({ key: 'open.hxCostPerGpm', label: 'Heat exchanger, pumps and piping', min: 150, max: 700, step: 10, prefix: '$', unit: '/gpm' }),
      slider({ key: 'open.instAdj', label: 'Wellfield installation cost adjustment', min: -40, max: 60, step: 5, unit: '%' })
    ].join('');
  }

  function buildPanels() {
    let h = '';
    h += '<div id="panel-sim" role="tabpanel" aria-labelledby="tab-sim" hidden>' +
      '<div class="sys-head"><h2><i class="dot open"></i>Open-loop geothermal</h2><p>Pumps groundwater up from a production well, takes heat from it (or dumps heat into it) through the heat pump plant, then returns the water to the aquifer through an injection well. Drag the 3D model to look around, and use the buttons for views and night mode.</p></div>' +
      '<div class="sys-grid"><section class="card diagram-card"><div class="viewbar"><div class="seg" role="group" aria-label="Diagram view"><button type="button" data-view="3d" aria-pressed="true">3D model</button><button type="button" data-view="2d" aria-pressed="false">2D schematic</button></div></div><div class="stage"><div class="s3d" data-slot="s3d"></div><div class="schem" data-slot="diagram" hidden></div></div><div class="modeline" data-slot="modeline"></div></section>' +
      '<section class="card"><h3>Right now</h3><p class="sub" data-slot="livehead"></p><div data-slot="live"></div></section></div>' +
      '<div class="kpis" data-slot="kpis"></div><div class="warns" data-slot="warns"></div>' +
      '<section class="card settings"><h3>Open-loop settings</h3><p class="sub">Drag a slider or type a value. Results update instantly.</p><div class="settings-grid" data-slot="settings">' + openSettings() + '</div></section>' +
      '<div class="chart-grid">' +
      chartCard('month', 'Energy by month', 'Total energy use, with gas converted to kWh equivalent (MWh). Dashed line is traditional HVAC.') +
      chartCard('mix', 'Where the open-loop system’s energy goes', 'Heat pump heating and cooling, well pumping, and backup boiler or chiller.') +
      chartCard('cost', 'Annual operating cost', 'Electricity, natural gas and maintenance, versus traditional HVAC.') +
      chartCard('cop', 'Heating and cooling performance', 'Efficiency (COP): units of heat moved per unit of electricity. Higher is better.') +
      '</div></div>';
    h += '<div id="panel-cba" role="tabpanel" aria-labelledby="tab-cba" hidden><div data-slot="cba"></div>' +
      '<div class="chart-grid">' + chartCard('cum', 'Cumulative cash position over 30 years', 'Starts at minus the extra cost and rises by the yearly savings. Where a line crosses zero is the simple payback.', true) +
      chartCard('capex', 'Installation cost: traditional vs open-loop', 'Open-loop buys wells, heat exchanger and heat pumps, plus a smaller backup boiler and chiller.') +
      chartCard('opex', 'Annual operating cost', 'Electricity, gas and maintenance.') + '</div></div>';
    h += '<div id="panel-what" role="tabpanel" aria-labelledby="tab-what" hidden><div data-slot="what"></div></div>';
    h += '<div id="panel-risk" role="tabpanel" aria-labelledby="tab-risk" hidden><div data-slot="risk"></div></div>';
    h += '<div id="panel-why" role="tabpanel" aria-labelledby="tab-why" hidden><div data-slot="why"></div></div>';
    h += '<div id="panel-how" role="tabpanel" aria-labelledby="tab-how" hidden>' + howHTML() + '</div>';
    $('#panels').innerHTML = h;
  }

  /* ---------------- how it works ---------------- */
  const ADV = [
    ['adv.UAh', 'Heating response of the building', 0.70, 0.1, 0.8, 0.01, 2, 'Btu/h per sq ft per °F'],
    ['adv.UAc', 'Cooling response of the building', 0.70, 0.1, 0.8, 0.01, 2, 'Btu/h per sq ft per °F'],
    ['adv.Tbh', 'Heating starts below', 55, 40, 65, 1, 0, '°F outdoors'],
    ['adv.Tbc', 'Cooling starts above', 60, 50, 75, 1, 0, '°F outdoors'],
    ['adv.sizing', 'Design load safety margin', 1.15, 1, 1.5, 0.01, 2, 'x'],
    ['adv.etaH', 'Heat pump efficiency vs ideal', 0.5, 0.3, 0.7, 0.01, 2, 'fraction of Carnot'],
    ['adv.etaC', 'Water-cooled chiller efficiency vs ideal', 0.45, 0.25, 0.65, 0.01, 2, 'fraction of Carnot'],
    ['adv.etaAir', 'Air-cooled chiller efficiency vs ideal', 0.33, 0.2, 0.5, 0.01, 2, 'fraction of Carnot'],
    ['adv.supplyT', 'Hot water supply temperature', 110, 95, 140, 1, 0, '°F'],
    ['adv.chwT', 'Chilled water temperature', 44, 38, 55, 1, 0, '°F'],
    ['adv.boilerEff', 'Traditional boiler efficiency', 0.85, 0.7, 0.98, 0.01, 2, 'fraction'],
    ['adv.convCoolPerTon', 'Traditional chiller plant cost', 1800, 800, 4000, 50, 0, '$/ton'],
    ['adv.convHeatPerMBH', 'Traditional boiler plant cost', 60, 20, 150, 5, 0, '$/MBH'],
    ['plantCostPerTon', 'Heat pump plant cost', 2000, 800, 4000, 50, 0, '$/ton'],
    ['adv.omPlant', 'Maintenance, heat pump plant', 0.015, 0, 0.06, 0.001, 3, 'of cost per year'],
    ['adv.omOpen', 'Maintenance, wellfield', 0.035, 0, 0.1, 0.001, 3, 'of cost per year'],
    ['adv.omConv', 'Maintenance, traditional plant', 0.025, 0, 0.08, 0.001, 3, 'of cost per year']
  ];
  function howHTML() {
    const cl = E.CLIMATES;
    const rows = Object.keys(cl).map(id => '<tr><th scope="row">' + cl[id].name + '</th>' + cl[id].monthly.map(t => '<td>' + t + '</td>').join('') + '</tr>').join('');
    return '<section class="card prose"><h3>What this does</h3>' +
      '<p>It estimates the yearly energy use, cost and payback of an open-loop (groundwater) geothermal heating and cooling system for an airport terminal, and compares it with a traditional gas boiler and air-cooled chiller. It is a college-level model that favors understandable steps over precision. Nothing here replaces a site study or an engineer’s design.</p>' +
      '<h3>How the numbers are calculated</h3><ol>' +
      '<li><strong>Thermal demand.</strong> Each month, demand is the building’s response (Btu/h per sq ft per °F) times floor area times degree-hours beyond the balance temperature (55 °F heating, 60 °F cooling). Degree-hours come from the monthly mean plus a normal spread. Cooling is raised for humidity.<span class="eq">heat = UA_h × area × degree-hours below 55°F\ncool = UA_c × area × (1 + humidity) × degree-hours above 60°F</span></li>' +
      '<li><strong>Efficiency.</strong> Heat pumps reach a fixed share of the ideal (Carnot) efficiency, so they work better when the groundwater is warm in winter and cool in summer.<span class="eq">COP_heat = η_H × T_supply / (T_supply − T_source)\nCOP_cool = η_C × T_chilled / (T_condenser − T_chilled)</span></li>' +
      '<li><strong>Water flow.</strong> Flow (gpm) = heat taken from the water ÷ (500 × temperature change). Pump power rises with flow to the 1.5 power. If the aquifer cannot supply the flow, the shortfall runs on the backup boiler or chiller.</li>' +
      '<li><strong>Electricity.</strong> Thermal and electrical energy are kept separate. Heat pump electricity = heat delivered ÷ 3,412 ÷ COP. Pumping is added on top.</li>' +
      '<li><strong>Cost.</strong> Geothermal equipment = wells + heat exchanger, pumps and piping + heat pump plant. The traditional option buys a full boiler and chiller. The open-loop option also buys a smaller backup boiler and chiller for the load the wells do not cover. The extra cost is the difference.</li>' +
      '<li><strong>Payback.</strong> Simple payback = extra cost ÷ yearly operating savings, with no discounting or price changes. The grant case subtracts the grant share of the geothermal equipment cost first.</li></ol>' +
      '<h3>Season and temperature controls</h3><p>The season slider picks the typical outdoor temperature for that season. Moving the temperature slider away from it applies a what-if shift to the whole year, so annual results, the live panel and the 3D weather all respond.</p>' +
      '<h3>What the model leaves out</h3><ul><li>Hour-by-hour weather, solar gain, and real airport schedules and ventilation.</li><li>Electric demand charges, price changes over time, financing, and equipment replacement.</li><li>Water chemistry, permits for groundwater discharge, and fouling or contamination risk.</li><li>Airport-specific limits such as work near runways, taxiways and protected airspace.</li></ul>' +
      '<h3>Climate data</h3><p>Monthly mean temperatures (°F) are 1991-2020 NOAA/NWS normals. Ground and groundwater temperatures follow the annual mean air temperature plus about 2°F. Aquifer supply per city is an illustrative guess, not site data. Full sources, formulas and worked numbers are in SOURCES_AND_CALCULATIONS.txt.</p>' +
      '<div class="cmp"><table class="matrix"><thead><tr><th></th>' + E.MONTH_NAMES.map(m => '<th>' + m + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div></section>' +
      '<details class="card" style="margin-top:14px"><summary>Advanced assumptions</summary><p class="sub">Change these to test how sensitive the results are. They reset with Reset all inputs.</p><div class="adv-grid">' +
      ADV.map(a => numCtl({ key: a[0], label: a[1], min: a[3], max: a[4], step: a[5], dec: a[6], unit: a[7] })).join('') + '</div></details>';
  }

  /* ---------------- sync & events ---------------- */
  function syncControls() {
    const o = res.open.subs[0];
    $$('.ctl[data-key]').forEach(el => {
      const key = el.dataset.key, sc = +el.dataset.scale, dec = +el.dataset.dec;
      let v;
      if (key === 'ui.season') v = E.SEASON_ORDER.indexOf(state.season);
      else if (key === 'ui.temp') v = typical() + state.tempShift;
      else v = getp(key) * sc;
      if (key === 'open.flow') { const mx = Math.max(1000, Math.ceil(Math.max(o.reqFlow * 2.2, state.open.supply * 1.3) / 100) * 100); $$('input', el).forEach(i => { if (i.max !== '' + mx) i.max = mx; }); }
      $$('input', el).forEach(i => {
        if (document.activeElement === i && i.type === 'number') return;
        const txt = (+v).toFixed(dec);
        if (i.type === 'number') i.value = txt; else i.value = (+v);
      });
    });
    $$('input[type=checkbox][data-key]').forEach(i => { i.checked = !!getp(i.dataset.key); });
    $$('.chip[data-climate]').forEach(b => b.setAttribute('aria-pressed', b.dataset.climate === state.climate));
    $$('#season-scale span').forEach(s => s.classList.toggle('on', s.dataset.s === state.season));
    $('#season-r').setAttribute('aria-valuetext', E.SEASONS[state.season].label);
    const tp = typical(), sh = state.tempShift;
    $('#temp-note').textContent = 'Typical ' + E.SEASONS[state.season].label.toLowerCase() + ' temperature in ' + E.CLIMATES[state.climate].name + ': ' + nf(tp) + '°F.' +
      (Math.abs(sh) >= 0.5 ? ' You are ' + (sh > 0 ? '+' : '') + nf(sh) + '°F from typical, so all results assume a year ' + nf(Math.abs(sh)) + '°F ' + (sh > 0 ? 'warmer' : 'colder') + '.' : ' Move the slider to test a warmer or colder year.');
    $('#temp-reset').hidden = Math.abs(sh) < 0.5;
    $$('[data-ptype]').forEach(b => b.setAttribute('aria-pressed', (b.dataset.ptype === 'new') === state.creditConv));
    $('#ptype-help').textContent = state.creditConv ? 'You would buy a plant either way, so the open-loop option replaces most of the boiler and chiller you would have bought. A smaller backup stays.' : 'The full existing boiler and chiller stay in service as backup. Nothing is avoided, so all geothermal cost is extra.';
    $$('[data-set]').forEach(b => { const [k, v] = b.dataset.set.split(':'); b.classList.toggle('on', +getp(k) === +v); });
  }

  function applyChange(key, v) {
    if (key === 'ui.season') { state.season = E.SEASON_ORDER[Math.round(v)]; state.tempShift = 0; }
    else if (key === 'ui.temp') state.tempShift = v - typical();
    else { if (key === 'open.flow') state.open.auto = false; setp(key, v); }
    schedule();
  }
  function applyClimate(id) {
    const c = E.CLIMATES[id];
    state.climate = id; state.tempShift = 0; state.groundTemp = c.groundTemp; state.gwTemp = c.gwTemp; state.open.supply = c.gwSupply; state.closed.k = c.k;
    schedule();
  }
  function reset() { state = E.makeDefaults('statecollege'); schedule(); }

  function bindEvents() {
    document.addEventListener('input', e => {
      const ctl = e.target.closest('.ctl[data-key]'); if (!ctl || e.target.type === 'checkbox') return;
      let v = parseFloat(e.target.value); if (isNaN(v)) return;
      const min = parseFloat(e.target.min), max = parseFloat(e.target.max);
      if (e.target.type === 'number') v = Math.min(Math.max(v, min), Math.max(max, v));
      applyChange(ctl.dataset.key, v / (+ctl.dataset.scale || 1));
    });
    document.addEventListener('change', e => {
      const t = e.target;
      if (t.type === 'checkbox' && t.dataset.key) { setp(t.dataset.key, t.checked); schedule(); }
      else if (t.type === 'number' && t.closest('.ctl')) { schedule(); const el = t; setTimeout(() => { el.value = (+el.value).toFixed(+t.closest('.ctl').dataset.dec); }, 0); }
    });
    document.addEventListener('click', e => {
      const chip = e.target.closest('[data-climate]'); if (chip) return applyClimate(chip.dataset.climate);
      const pt = e.target.closest('[data-ptype]'); if (pt) { state.creditConv = pt.dataset.ptype === 'new'; return schedule(); }
      const st = e.target.closest('[data-set]'); if (st) { const [k, v] = st.dataset.set.split(':'); setp(k, +v); return schedule(); }
      const vw = e.target.closest('[data-view]'); if (vw) { viewMode = vw.dataset.view; return schedule(); }
      const tab = e.target.closest('[data-tab]'); if (tab) return showTab(tab.dataset.tab);
      const go = e.target.closest('[data-goto]'); if (go) return showTab(go.dataset.goto);
      const sv = e.target.closest('[data-sens]'); if (sv) { sensMode = sv.dataset.sens; return schedule(); }
      const ex = e.target.closest('[data-export]'); if (ex) { exportAs(ex.dataset.export); $('#export-menu').hidden = true; $('#btn-export').setAttribute('aria-expanded', 'false'); return; }
      if (e.target.id === 'temp-reset') { state.tempShift = 0; return schedule(); }
      if (e.target.id === 'btn-reset' || e.target.id === 'btn-reset2') return reset();
      if (e.target.id === 'btn-export') { const m = $('#export-menu'); m.hidden = !m.hidden; e.target.setAttribute('aria-expanded', !m.hidden); return; }
      if (!e.target.closest('.menu')) { $('#export-menu').hidden = true; $('#btn-export').setAttribute('aria-expanded', 'false'); }
      if (e.target.id === 'btn-theme') return toggleTheme();
      if (e.target.id === 'btn-controls') { const c = $('#controls'); const o = c.classList.toggle('open'); e.target.setAttribute('aria-expanded', o); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#export-menu').hidden = true; } });
    $('.tabs').addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tabs = $$('.tabs [role=tab]'), i = tabs.findIndex(t => t.dataset.tab === active), n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      showTab(tabs[n].dataset.tab); tabs[n].focus();
    });
  }
  let sensMode = 'n';

  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('geo-theme', root.dataset.theme); } catch (e) { /* ignore */ }
    schedule();
  }
  function showTab(id) {
    active = id;
    $$('.tabs [role=tab]').forEach(t => { const on = t.dataset.tab === id; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
    $$('#panels > [role=tabpanel]').forEach(p => { p.hidden = p.id !== 'panel-' + id; });
    $('#strip').hidden = id !== 'sim';
    schedule();
  }
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }

  /* ---------------- rendering ---------------- */
  function update() {
    res = E.computeAll(state);
    snap = E.snapshot(state, res, typical() + state.tempShift);
    eco = E.economics(state, res);
    if (state.open.auto) state.open.flow = Math.round(res.open.subs[0].designFlow);
    syncControls(); renderHero();
    if (active === 'sim') { renderStrip(); renderSim(); }
    else if (active === 'cba') renderCBA();
    else if (active === 'what') renderWhat();
    else if (active === 'risk') renderRisk();
    else if (active === 'why') renderWhy();
  }

  function countTo(el, key, to, fmt) {
    const from = heroPrev[key] == null ? to : heroPrev[key]; heroPrev[key] = to;
    if (!isFinite(to) || !isFinite(from) || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 450;
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function renderHero() {
    const h = $('#hero');
    if (!h.firstChild) h.innerHTML =
      '<div class="hs"><span>Payback, no grant</span><b data-h="n"></b></div>' +
      '<div class="hs good"><span data-h="gl"></span><b data-h="g"></b></div>' +
      '<div class="hs"><span>Savings per year</span><b data-h="s"></b></div>';
    $('[data-h=gl]', h).textContent = 'Payback, ' + nf(eco.grantPct) + '% grant';
    countTo($('[data-h=n]', h), 'n', eco.noGrant.payback, v => yrs(v));
    countTo($('[data-h=g]', h), 'g', eco.withGrant.payback, v => yrs(v));
    countTo($('[data-h=s]', h), 's', eco.savings, v => money(v));
  }

  function renderStrip() {
    const cl = E.CLIMATES[state.climate], T = typical() + state.tempShift, b = snap.baseline;
    const mode = snap.mode === 'heating' ? 'Heating' : snap.mode === 'cooling' ? 'Cooling' : 'Mild';
    const demand = snap.mode === 'heating' ? snap.heat : snap.cool;
    $('#strip').innerHTML =
      '<div class="s"><span>' + E.SEASONS[state.season].label + ' in ' + cl.name + '</span><b>' + nf(T) + '°F outdoors</b><i class="sub">' + (Math.abs(state.tempShift) >= 0.5 ? 'What-if: ' + (state.tempShift > 0 ? '+' : '') + nf(state.tempShift) + '°F vs typical' : 'Typical for the season') + '</i></div>' +
      '<div class="s"><span>Terminal demand</span><b>' + mode + (snap.mode === 'idle' ? '' : ': ' + nf(demand / E.BTU_PER_KWH / 1000, 2) + ' MW') + '</b><i class="sub">' + (snap.mode === 'idle' ? 'Little heating or cooling needed' : nf(demand / 12000) + ' tons of ' + (snap.mode === 'heating' ? 'heat' : 'cooling')) + '</i></div>' +
      '<div class="s"><span>Traditional HVAC cost per day</span><b>' + money(b.costPerHour * 24) + '</b><i class="sub">At this temperature all day</i></div>' +
      '<div class="s"><span>Open-loop cost per day</span><b>' + money(snap.open.costPerHour * 24) + '</b><i class="sub">Saves ' + money((b.costPerHour - snap.open.costPerHour) * 24) + ' a day</i></div>';
  }

  function kpi(label, value, sub, accent, bad) { return '<div class="kpi' + (bad ? ' bad' : '') + '" style="--accent:' + accent + '"><div class="k">' + label + '</div><div class="v">' + value + '</div><div class="s">' + sub + '</div></div>'; }

  function renderSim() {
    const P = $('#panel-sim'), r = res.open, b = res.baseline, col = colors(), ac = col.open;
    const sl = n => $('[data-slot=' + n + ']', P), sub0 = r.subs[0];
    const ctx = { res, snap, p: state };
    const want3d = viewMode !== '2d' && !no3d;
    if (want3d && !inst3d.open) { try { inst3d.open = window.Scene3D.create(sl('s3d'), 'open'); } catch (err) { no3d = true; } }
    const use3d = want3d && !no3d;
    sl('s3d').hidden = !use3d; sl('diagram').hidden = use3d;
    $$('[data-view]', P).forEach(x => x.setAttribute('aria-pressed', (x.dataset.view === '3d') === use3d));
    if (use3d) inst3d.open.update({ p: state, res, snap, T: typical() + state.tempShift, season: state.season, theme: curTheme() });
    else sl('diagram').innerHTML = D.open(ctx);
    const i = snap.open;
    sl('modeline').innerHTML = '<i class="dot ' + (snap.mode === 'idle' ? 'base' : 'open') + '"></i><span>' + (snap.mode === 'heating' ? 'Heating: ' + nf(snap.heat / E.BTU_PER_KWH) + ' kW of heat needed. ' : snap.mode === 'cooling' ? 'Cooling: ' + nf(snap.cool / E.BTU_PER_KWH) + ' kW of cooling needed. ' : 'Mild weather: almost no heating or cooling needed. ') +
      (snap.mode !== 'idle' ? 'The open-loop system draws ' + nf(i.elecKW) + ' kW of electricity' + (i.gasTherm > 0.5 ? ' plus backup gas' : '') + '.' : '') + '</span>';
    sl('livehead').textContent = nf(typical() + state.tempShift) + '°F outdoors, steady for a full day';
    const perDay = x => money(x * 24), cop = v => v ? nf(v, 1) : '-';
    sl('live').innerHTML = '<table class="live-table"><thead><tr><th></th><th>Traditional</th><th>Open-loop</th></tr></thead><tbody>' +
      '<tr><th scope="row">Electricity</th><td>' + nf(snap.baseline.elecKW) + ' kW</td><td>' + nf(i.elecKW) + ' kW</td></tr>' +
      '<tr><th scope="row">Natural gas</th><td>' + nf(snap.baseline.gasTherm, 1) + ' therm/h</td><td>' + nf(i.gasTherm, 1) + ' therm/h</td></tr>' +
      '<tr><th scope="row">Heating efficiency (COP)</th><td>' + cop(snap.mode === 'heating' ? snap.baseline.copH : 0) + '</td><td>' + cop(i.copH) + '</td></tr>' +
      '<tr><th scope="row">Cooling efficiency (COP)</th><td>' + cop(snap.baseline.copC) + '</td><td>' + cop(i.copC) + '</td></tr>' +
      '<tr><th scope="row">Energy cost per day</th><td>' + perDay(snap.baseline.costPerHour) + '</td><td>' + perDay(i.costPerHour) + '</td></tr>' +
      '<tr><th scope="row"><strong>Savings per day</strong></th><td></td><td><strong>' + perDay(snap.baseline.costPerHour - i.costPerHour) + '</strong></td></tr>' +
      '</tbody></table><p class="help" style="margin-top:8px">Pumping is included. Maintenance is not (it is in the annual figures).</p>';
    const pct = x => nf(Math.abs(x) * 100) + '%';
    const k = kpi('Geothermal equipment cost', moneyC(eco.gross), 'Wells, heat exchanger and heat pumps', ac) +
      kpi('Extra cost vs traditional', moneyC(eco.extra), 'After backup-plant savings of ' + moneyC(eco.credit), ac) +
      kpi('Annual savings', moneyC(r.savings), (r.savings >= 0 ? pct(r.savingsPct) + ' less operating cost' : pct(r.savingsPct) + ' more operating cost'), ac, r.savings < 0) +
      kpi('Payback, no grant', yrs(eco.noGrant.payback), '25-year net: ' + moneyC(eco.noGrant.lifeNet), ac, eco.noGrant.payback === Infinity) +
      kpi('Payback, ' + nf(eco.grantPct) + '% grant', yrs(eco.withGrant.payback), '25-year net: ' + moneyC(eco.withGrant.lifeNet), col.good, eco.withGrant.payback === Infinity) +
      kpi('Annual energy use', nf(r.annual.energyMWh) + ' MWh', pct(r.energySavedPct) + ' less than traditional', ac) +
      kpi('Groundwater flow', nf(sub0.designFlow) + ' gpm', sub0.wellCount + ' wells, ' + nf(sub0.reqFlow) + ' gpm needed', ac) +
      kpi('Land required', nf(r.land, 1) + ' acres', 'Well pads and plant yard', ac) +
      kpi('CO₂ avoided', nf(r.co2Avoided) + ' tons/yr', 'Illustrative grid and gas factors', col.good);
    sl('kpis').innerHTML = k;
    const nowK = $$('.kpi .v', sl('kpis')).map(x => x.textContent);
    if (prevKpi.length === nowK.length) $$('.kpi', sl('kpis')).forEach((el, n) => { if (prevKpi[n] !== nowK[n]) el.classList.add('flash'); });
    prevKpi = nowK;
    sl('warns').innerHTML = r.warnings.map(t => '<div class="warn">' + t + '</div>').join('') +
      '<div class="warn info">The wells handle ' + nf(r.peakCoverage.heat * 100) + '% of peak heating and ' + nf(r.peakCoverage.cool * 100) + '% of peak cooling. They supply ' + nf(r.annual.heatCoverage * 100) + '% of yearly heating and ' + nf(r.annual.coolCoverage * 100) + '% of yearly cooling; a right-sized backup boiler and chiller cover the rest.</div>';
    const mo = E.MONTH_NAMES, mwh = r.monthly.energyMWh, bm = b.monthly.energyMWh;
    const f1 = v => nf(v, 0) + ' MWh';
    C.render($('[data-chart=month]', P), { type: 'line', x: mo, xName: 'Month', title: 'Monthly energy', yTitle: 'MWh per month', format: f1, axisFormat: v => nf(v),
      series: [{ name: 'Traditional HVAC', color: col.base, dash: true, values: bm }, { name: 'Open-loop', color: ac, values: mwh }] });
    const backMWh = r.monthly.gas.map((g, m) => g * E.KWH_PER_THERM / 1000 + r.monthly.eBack[m] / 1000);
    C.render($('[data-chart=mix]', P), { type: 'bar', stacked: true, categories: mo, xName: 'Month', title: 'Energy mix', yTitle: 'MWh per month', format: v => nf(v, 1) + ' MWh', axisFormat: v => nf(v),
      series: [{ name: 'Heat pump, heating', color: col.heat, values: r.monthly.eHeat.map(x => x / 1000) }, { name: 'Heat pump, cooling', color: col.cool, values: r.monthly.eCool.map(x => x / 1000) },
        { name: 'Well pumping', color: col.pump, values: r.monthly.ePump.map(x => x / 1000) }, { name: 'Backup boiler or chiller', color: col.back, values: backMWh }] });
    C.render($('[data-chart=cost]', P), { type: 'bar', stacked: true, categories: ['Traditional HVAC', 'Open-loop'], xName: 'System', title: 'Annual operating cost', format: money, axisFormat: moneyC, height: 250,
      series: [{ name: 'Electricity', color: col.cool, values: [b.annual.costElec, r.annual.costElec] }, { name: 'Natural gas', color: col.gas, values: [b.annual.costGas, r.annual.costGas] }, { name: 'Maintenance', color: col.pump, values: [b.annual.costOM, r.annual.costOM] }] });
    C.render($('[data-chart=cop]', P), { type: 'line', x: mo, xName: 'Month', title: 'Efficiency by month', yTitle: 'COP', format: v => nf(v, 2), axisFormat: v => nf(v, 1),
      series: [{ name: 'Heating COP', color: col.heat, values: r.monthly.copH }, { name: 'Cooling COP', color: col.cool, values: r.monthly.copC }] });
  }

  /* ---------------- cost and payback page ---------------- */
  function renderCBA() {
    const P = $('#panel-cba'), r = res.open, b = res.baseline, col = colors(), a = r.annual, ba = b.annual, e = eco;
    const row = (l, f, v, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + l + '</th><td class="f">' + f + '</td><td>' + v + '</td></tr>';
    const scen = (ttl, sc, grant, cls) => '<section class="scen ' + cls + '"><h3>' + ttl + '</h3>' +
      '<div class="big">' + yrs(sc.payback) + '</div><div class="bigsub">simple payback</div>' +
      '<dl><dt>Extra cost to build</dt><dd>' + money(sc.net) + '</dd>' +
      (grant ? '<dt>Grant received</dt><dd>' + money(e.grant) + ' (' + nf(e.grantPct) + '% of ' + money(e.gross) + ')</dd>' : '<dt>Grant received</dt><dd>$0</dd>') +
      '<dt>Savings per year</dt><dd>' + money(e.savings) + '</dd>' +
      '<dt>Net over 25 years</dt><dd>' + money(sc.lifeNet) + '</dd>' +
      '<dt>Present value at ' + nf(e.discountPct, 1) + '%</dt><dd>' + money(sc.npv) + '</dd>' +
      '<dt>Discounted payback</dt><dd>' + yrs(sc.discPayback) + '</dd></dl>' +
      '<p class="formula">' + money(sc.net) + ' ÷ ' + money(e.savings) + ' per year = ' + (sc.payback === Infinity ? 'never' : nf(sc.payback, 1) + ' years') + '</p></section>';
    const pctE = nf(r.energySavedPct * 100), pctC = nf(r.savingsPct * 100);
    let h = '<div class="scen-grid">' + scen('Without a grant', e.noGrant, false, 'ng') + scen('With a ' + nf(e.grantPct) + '% grant', e.withGrant, true, 'wg') + '</div>';
    h += '<section class="card cmp"><h3>Step-by-step: installation cost</h3><p class="sub">Every line is a formula you can check by hand. Change any input on the left and this table updates.</p><table class="live-table steps"><thead><tr><th>Line</th><th style="text-align:left">How it is calculated</th><th>Amount</th></tr></thead><tbody>' +
      row('Wells, heat exchanger, pumps and piping', nf(r.subs[0].wellCount) + ' wells × ' + money(state.open.wellCost * state.costMult) + ' + ' + nf(r.subs[0].designFlow) + ' gpm × ' + money(state.open.hxCostPerGpm * state.costMult) + ' + ' + money(state.open.fixedCost * state.costMult) + ' fixed', money(e.source)) +
      row('Heat pump plant', nf(r.peakCoverage.heat * res.loads.heatPeak / 12000) + ' tons of peak heating covered × ' + money(state.plantCostPerTon * state.costMult) + ' per ton (larger of heating or cooling)', money(e.plant)) +
      row('Geothermal equipment (grant-eligible)', 'wells + heat pump plant', money(e.gross), 'sub') +
      row('Smaller backup boiler and chiller', state.creditConv ? 'full traditional plant ' + money(b.capex.gross) + ' × share not covered by the wells' : 'existing plant stays; no new purchase', money(e.backup)) +
      row('Open-loop option, total installed', 'geothermal equipment + backup', money(e.geoCapex), 'sub') +
      row('Traditional option, total installed', state.creditConv ? nf(res.loads.coolPeak / 12000) + ' tons × ' + money(state.adv.convCoolPerTon) + ' + ' + nf(res.loads.heatPeak / 1000) + ' MBH × ' + money(state.adv.convHeatPerMBH) : 'existing plant already owned', money(e.tradCapex), 'sub') +
      row('Extra cost of open-loop', 'open-loop option − traditional option', money(e.extra), 'tot') +
      row('Grant (' + nf(e.grantPct) + '% of equipment)', money(e.gross) + ' × ' + nf(e.grantPct) + '%', '−' + money(e.grant)) +
      row('Extra cost after grant', money(e.extra) + ' − ' + money(e.grant), money(e.withGrant.net), 'tot') + '</tbody></table></section>';
    h += '<section class="card cmp" style="margin-top:14px"><h3>Step-by-step: yearly operating cost</h3><table class="live-table steps"><thead><tr><th>Line</th><th style="text-align:left">How it is calculated</th><th>Traditional</th><th>Open-loop</th></tr></thead><tbody>' +
      '<tr><th scope="row">Electricity</th><td class="f">' + nf(ba.elecKWh) + ' kWh vs ' + nf(a.elecKWh) + ' kWh × $' + state.elecPrice.toFixed(3) + '</td><td>' + money(ba.costElec) + '</td><td>' + money(a.costElec) + '</td></tr>' +
      '<tr><th scope="row">Natural gas</th><td class="f">' + nf(ba.gasTherm) + ' vs ' + nf(a.gasTherm) + ' therms × $' + state.gasPrice.toFixed(2) + '</td><td>' + money(ba.costGas) + '</td><td>' + money(a.costGas) + '</td></tr>' +
      '<tr><th scope="row">Maintenance</th><td class="f">% of installed equipment cost</td><td>' + money(ba.costOM) + '</td><td>' + money(a.costOM) + '</td></tr>' +
      '<tr class="tot"><th scope="row">Operating cost</th><td class="f">electricity + gas + maintenance</td><td>' + money(ba.opex) + '</td><td>' + money(a.opex) + '</td></tr>' +
      '<tr class="tot"><th scope="row">Savings per year</th><td class="f">traditional − open-loop</td><td></td><td>' + money(e.savings) + '</td></tr></tbody></table>' +
      '<p class="note"><strong>Why ' + pctE + '% less energy but only ' + pctC + '% less cost?</strong> Gas heat costs about $' + (state.gasPrice / 100000 * 1e6).toFixed(2) + ' per million Btu at the boiler input while electricity costs about $' + (state.elecPrice / 3412.14 * 1e6).toFixed(2) + ' per million Btu, so each unit of electricity must displace several units of gas to save money. The heat pumps do (COP about ' + nf(a.seasonalCopHeat, 1) + '), but the wells and pumps also add maintenance and pumping cost.</p></section>';
    h += '<section class="card prose" style="margin-top:14px"><h3>How to read the two payback numbers</h3><p>The <strong>without grant</strong> case is the honest base case: the project pays back in ' + yrs(e.noGrant.payback) + ', close to the ' + e.life + '-year equipment life, so it is marginal. The <strong>with grant</strong> case shows what changes if a program such as the federal geothermal heat pump tax credit (30% when prevailing-wage rules are met, 6% otherwise, claimed by public owners through elective pay) or an FAA airport grant pays part of the geothermal equipment. A grant cuts the up-front cost directly, so payback falls faster than the grant percentage suggests: the extra cost is the small difference between two large costs.</p></section>';
    $('[data-slot=cba]', P).innerHTML = h;
    const yrsX = Array.from({ length: 31 }, (_, t) => t), g = id => $('[data-chart=' + id + ']', P);
    const mk = (pb) => isFinite(pb) && pb > 0 && pb <= 30 ? [{ i: Math.round(pb), label: nf(pb, 1) + ' yrs' }] : [];
    C.render(g('cum'), { type: 'line', x: yrsX, xName: 'Year', xFormat: v => 'Year ' + v, title: 'Cumulative cash position', zero: true, xEvery: 5, format: money, axisFormat: moneyC,
      series: [{ name: 'Without grant', color: col.open, values: e.noGrant.cumulative }, { name: 'With ' + nf(e.grantPct) + '% grant', color: col.good, values: e.withGrant.cumulative }] });
    C.render(g('capex'), { type: 'bar', stacked: true, categories: ['Traditional', 'Open-loop'], xName: 'Option', title: 'Installation cost', format: money, axisFormat: moneyC, height: 260,
      series: [{ name: 'Wells, heat exchanger, piping', color: col.open, values: [0, e.source] }, { name: 'Heat pump plant', color: col.cool, values: [0, e.plant] }, { name: 'Boiler and chiller (backup in open-loop)', color: col.back, values: [e.tradCapex, e.backup] }] });
    C.render(g('opex'), { type: 'bar', stacked: true, categories: ['Traditional HVAC', 'Open-loop'], xName: 'System', title: 'Annual operating cost', format: money, axisFormat: moneyC, height: 260,
      series: [{ name: 'Electricity', color: col.cool, values: [ba.costElec, a.costElec] }, { name: 'Natural gas', color: col.gas, values: [ba.costGas, a.costGas] }, { name: 'Maintenance', color: col.pump, values: [ba.costOM, a.costOM] }] });
  }

  /* ---------------- what-if page ---------------- */
  function renderWhat() {
    const P = $('#panel-what');
    const S = E.sensitivity(state), key = sensMode === 'g' ? 'G' : '';
    const base = sensMode === 'g' ? S.base.g : S.base.n;
    const rows = S.rows.map(r => ({ r, lo: r['low' + key], hi: r['high' + key] })).sort((x, y) => Math.abs(y.hi - y.lo) - Math.abs(x.hi - x.lo));
    const cap = Math.min(60, Math.max(base * 3, 10));
    const clampV = v => isFinite(v) ? Math.min(v, cap) : cap;
    const pos = v => (clampV(v) / cap * 100).toFixed(1);
    const lab = v => isFinite(v) ? nf(v, 1) : 'never';
    let t = '<section class="card"><div class="rowhead"><div><h3>What moves the payback most?</h3><p class="sub">Each input is changed by the amount shown while everything else stays put. Bars show payback in years; the line is the current value (' + yrs(base) + ').</p></div>' +
      '<div class="seg2"><button type="button" data-sens="n" aria-pressed="' + (sensMode === 'n') + '">Without grant</button><button type="button" data-sens="g" aria-pressed="' + (sensMode === 'g') + '">With ' + nf(state.grantPct) + '% grant</button></div></div><div class="tornado">';
    rows.forEach(x => {
      const lo = x.lo, hi = x.hi, a = Math.min(lo, hi), z = Math.max(lo, hi), good = lo < hi ? 'low' : 'high';
      t += '<div class="tr"><div class="tl">' + x.r.label + '<small>' + (x.r.lowPct > 0 ? '+' : '') + nf(x.r.lowPct * 100) + '% / +' + nf(x.r.highPct * 100) + '%</small></div><div class="tb"><i class="bx" style="left:' + pos(a) + '%;width:' + Math.max(0.8, pos(z) - pos(a)).toFixed(1) + '%"></i><i class="bl" style="left:' + pos(base) + '%"></i></div><div class="tv">' + lab(lo) + ' to ' + lab(hi) + ' yrs</div></div>';
    });
    t += '</div><p class="note">Bars are capped at ' + cap + ' years. Electricity price, gas price and heat pump cost move the payback far more than the well cost, so those are the numbers to firm up first.</p></section>';
    // price map
    const elecs = [0.10, 0.12, state.elecPrice, 0.17, 0.20].map(v => +v.toFixed(3)).filter((v, i, a) => a.indexOf(v) === i).sort((x, y) => x - y);
    const gases = [0.6, 0.9, state.gasPrice, 1.4, 1.8].map(v => +v.toFixed(2)).filter((v, i, a) => a.indexOf(v) === i).sort((x, y) => x - y);
    const M = E.paybackMap(state, elecs, gases);
    const cls = v => !isFinite(v) ? 'c5' : v <= 10 ? 'c1' : v <= 15 ? 'c2' : v <= 25 ? 'c3' : 'c4';
    let m = '<section class="card" style="margin-top:14px"><h3>Payback by energy prices</h3><p class="sub">Years to pay back, without grant / with ' + nf(state.grantPct) + '% grant. Rows are natural gas price, columns are electricity price. Cheap gas and expensive electricity hurt; the reverse helps.</p><div class="cmp"><table class="pmap"><thead><tr><th>Gas ↓ / Electricity →</th>' + elecs.map(v => '<th>$' + v.toFixed(3) + '</th>').join('') + '</tr></thead><tbody>';
    M.forEach((rw, i) => { m += '<tr><th scope="row">$' + gases[i].toFixed(2) + ' per therm</th>' + rw.map(c => '<td class="' + cls(sensMode === 'g' ? c.gr : c.n) + (Math.abs(c.e - state.elecPrice) < 1e-6 && Math.abs(c.g - state.gasPrice) < 1e-6 ? ' cur' : '') + '"><b>' + (isFinite(c.n) ? nf(c.n, 1) : 'never') + '</b><small>' + (isFinite(c.gr) ? nf(c.gr, 1) : 'never') + '</small></td>').join('') + '</tr>'; });
    m += '</tbody></table></div><p class="note">Colors follow the toggle above. Green is 10 years or less, then 15, 25, and red is longer. Outlined cell = your current prices.</p></section>';
    // climate sweep
    const CM = E.climateMatrix(state).map(c => ({ c, e: E.economics(Object.assign({}, state, { climate: c.id }), { open: c.open, baseline: c.baseline }) }));
    let cmx = '<section class="card" style="margin-top:14px"><h3>Open-loop in other climates</h3><p class="sub">Same building, prices and costs; each city uses its own weather and groundwater. Illustrative only: aquifer supply and ground temperature are example values.</p><div class="cmp"><table class="matrix"><thead><tr><th>Climate</th><th>Savings per year</th><th>Payback, no grant</th><th>Payback, ' + nf(state.grantPct) + '% grant</th><th>Land</th></tr></thead><tbody>';
    CM.forEach(x => { cmx += '<tr><th scope="row">' + x.c.name + '<small>' + x.c.tag + '</small></th><td>' + money(x.e.savings) + '</td><td>' + yrs(x.e.noGrant.payback) + '</td><td>' + yrs(x.e.withGrant.payback) + '</td><td>' + nf(x.c.open.land, 1) + ' acres</td></tr>'; });
    cmx += '</tbody></table></div></section>';
    $('[data-slot=what]', P).innerHTML = t + m + cmx;
  }

  /* ---------------- risks page (from the team report) ---------------- */
  const RISKS = [
    ['R1', 'Drilling could damage underground utilities or fuel lines.', 3, 4, 1, 4, 'Locate underground utilities before drilling. Use ground-penetrating radar and keep drilling areas away from airport utility lines.'],
    ['R2', 'Construction could interrupt airport operations.', 3, 5, 1, 5, 'Create a construction safety plan with the airport. Work during less busy hours and use safety checks to prevent foreign object debris.'],
    ['R3', 'Groundwater or loop water could become contaminated.', 2, 5, 1, 5, 'Use suitable materials, test equipment for leaks, properly seal wells, and monitor groundwater quality.'],
    ['R4', 'The aquifer may not provide enough water or a permit may not be approved.', 4, 3, 2, 3, 'Complete groundwater testing and a hydrogeology study before construction. Keep backup equipment.'],
    ['R5', 'Ground temperature could change over time and lower performance.', 3, 3, 1, 3, 'Monitor groundwater and system temperatures. Design for long-term heating and cooling needs.'],
    ['R6', 'Installation costs could be higher than expected.', 4, 3, 2, 3, 'Get contractor estimates, add a cost allowance for unexpected expenses, and install in planned stages.'],
    ['R7', 'The project may not receive a government grant.', 3, 4, 2, 4, 'Research funding programs early, apply to suitable programs, and make sure the project can still be considered without a grant.'],
    ['R8', 'A pump or heat pump could fail and interrupt heating or cooling.', 2, 4, 1, 4, 'Keep backup equipment. Use regular maintenance and keep replacement parts available.']
  ];
  function zone(s) { return s <= 6 ? 'g' : s <= 12 ? 'y' : 'r'; }
  function renderRisk() {
    const P = $('#panel-risk'), cell = 78, off = 46, W = off + cell * 5 + 10, H = off + cell * 5 + 40;
    const cx = sv => off + (sv - 0.5) * cell, cy = lk => off + (5 - lk + 0.5) * cell;
    const zc = { g: '#2f9e6b', y: '#e3b23c', r: '#d65745' };
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="rmx" role="img" aria-label="Risk matrix before and after mitigation"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#0f2a4a"/></marker></defs>';
    for (let lk = 1; lk <= 5; lk++) for (let sv = 1; sv <= 5; sv++) { const z = zone(lk * sv); svg += '<rect x="' + (off + (sv - 1) * cell) + '" y="' + (off + (5 - lk) * cell) + '" width="' + cell + '" height="' + cell + '" fill="' + zc[z] + '" opacity=".28" stroke="var(--line)"/><text x="' + (off + (sv - 1) * cell + 6) + '" y="' + (off + (5 - lk) * cell + 14) + '" font-size="10" fill="var(--muted)">' + lk * sv + '</text>'; }
    for (let i = 1; i <= 5; i++) { svg += '<text x="' + (off - 12) + '" y="' + (cy(i) + 4) + '" text-anchor="end" font-size="12" fill="var(--ink2)">' + i + '</text><text x="' + cx(i) + '" y="' + (off + cell * 5 + 18) + '" text-anchor="middle" font-size="12" fill="var(--ink2)">' + i + '</text>'; }
    svg += '<text x="' + (off + cell * 2.5) + '" y="' + (off + cell * 5 + 36) + '" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">Severity</text><text transform="translate(12 ' + (off + cell * 2.5) + ') rotate(-90)" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">Likelihood</text>';
    const spread = (k, n) => (n === 1 ? 0 : (k - (n - 1) / 2) * 22);
    const place = (key) => { const m = {}; RISKS.forEach(r => { const kk = key === 'b' ? r[3] + ',' + r[2] : r[5] + ',' + r[4]; (m[kk] = m[kk] || []).push(r); }); return m; };
    const pb = place('b'), pa = place('a'), pos = {};
    Object.keys(pb).forEach(k => pb[k].forEach((r, i) => { const [sv, lk] = k.split(',').map(Number); pos['b' + r[0]] = [cx(sv) + spread(i, pb[k].length), cy(lk) - 6]; }));
    Object.keys(pa).forEach(k => pa[k].forEach((r, i) => { const [sv, lk] = k.split(',').map(Number); pos['a' + r[0]] = [cx(sv) + spread(i, pa[k].length), cy(lk) + 12]; }));
    RISKS.forEach(r => { const a = pos['b' + r[0]], z = pos['a' + r[0]]; if (a[0] !== z[0] || a[1] !== z[1]) svg += '<line x1="' + a[0] + '" y1="' + (a[1] + 8) + '" x2="' + z[0] + '" y2="' + (z[1] - 10) + '" stroke="#0f2a4a" stroke-width="1.5" marker-end="url(#ah)" opacity=".75"/>'; });
    RISKS.forEach(r => { const a = pos['b' + r[0]], z = pos['a' + r[0]];
      svg += '<g><circle cx="' + a[0] + '" cy="' + a[1] + '" r="11" fill="#fff" stroke="#333" stroke-dasharray="3 2"/><text x="' + a[0] + '" y="' + (a[1] + 4) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#333">' + r[0] + '</text></g>' +
        '<g><circle cx="' + z[0] + '" cy="' + z[1] + '" r="11" fill="#0f2a4a"/><text x="' + z[0] + '" y="' + (z[1] + 4) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">' + r[0] + '</text></g>'; });
    svg += '</svg>';
    let t = '<table class="live-table risk"><thead><tr><th>Risk</th><th>Before</th><th>After</th><th style="text-align:left">Mitigation</th></tr></thead><tbody>';
    RISKS.forEach(r => { const b = r[2] * r[3], a = r[4] * r[5]; t += '<tr><th scope="row"><b>' + r[0] + '</b> ' + r[1] + '</th><td><span class="pill ' + zone(b) + '">' + b + '</span><small>' + r[2] + '×' + r[3] + '</small></td><td><span class="pill ' + zone(a) + '">' + a + '</span><small>' + r[4] + '×' + r[5] + '</small></td><td style="text-align:left;color:var(--ink2)">' + r[6] + '</td></tr>'; });
    t += '</tbody></table>';
    $('[data-slot=risk]', P).innerHTML = '<section class="card"><h3>Risk assessment</h3><p class="sub">Score = likelihood × severity, each rated 1 to 5. White dashed circles are before mitigation, navy circles are after. These are team planning estimates, not measured failure rates. Grant risk (R7) ties directly to the “with grant” payback.</p><div class="risk-grid"><div class="rmx-wrap">' + svg + '</div><div class="cmp">' + t + '</div></div><p class="note">Green: score 6 or less. Yellow: 7 to 12. Red: 13 or more. Highest risk before mitigation: R2 construction disruption (15).</p></section>';
  }

  /* ---------------- why open-loop page ---------------- */
  function renderWhy() {
    const P = $('#panel-why'), S = [['Open-loop (chosen)', res.open], ['Closed-loop', res.closed], ['Hybrid', res.hybrid]], g = state.grantPct / 100;
    const gp = s => { const net = s.capex.net - s.capex.gross * g; return s.savings <= 0 ? Infinity : net <= 0 ? 0 : net / s.savings; };
    const cells = (f, best) => { const v = S.map(x => f(x[1])); const fin = v.map(z => isFinite(z) ? z : Infinity); const m = best === 'low' ? Math.min(...fin) : Math.max(...v); return v.map((z, i) => ({ z, best: Math.abs((fin[i] === Infinity ? Infinity : z) - m) < 1e-9 })); };
    const rowx = (l, f, fmt, best) => '<tr><th scope="row">' + l + '</th>' + cells(f, best).map(c => '<td' + (c.best ? ' class="best"' : '') + '>' + fmt(c.z) + '</td>').join('') + '</tr>';
    let t = '<section class="card cmp"><h3>Why the team chose open-loop</h3><p class="sub">The same building, weather and prices run through all three geothermal designs. Shaded cell = best in that row. The closed-loop and hybrid designs are shown for comparison only; the rest of this simulator is open-loop.</p><table><thead><tr><th></th>' + S.map(x => '<th>' + x[0] + '</th>').join('') + '</tr></thead><tbody>' +
      rowx('Geothermal equipment cost', s => s.capex.gross, money, 'low') +
      rowx('Extra cost vs traditional', s => s.capex.net, money, 'low') +
      rowx('Annual savings', s => s.savings, money, 'high') +
      rowx('Payback, no grant', s => s.payback, yrs, 'low') +
      rowx('Payback, ' + nf(state.grantPct) + '% grant', gp, yrs, 'low') +
      rowx('25-year net savings, no grant', s => s.lifecycleNet, money, 'high') +
      rowx('Land required', s => s.land, v => nf(v, 1) + ' acres', 'low') +
      rowx('Annual energy', s => s.annual.energyMWh, v => nf(v) + ' MWh', 'low') +
      '</tbody></table><p class="note">Closed-loop saves a little more each year but needs far more drilling and land, so its payback is much longer. Hybrid lands in between because it pays for both systems plus integration. Open-loop depends on a good aquifer and a discharge permit (risks R3 and R4), which is why groundwater testing comes first.</p></section>';
    $('[data-slot=why]', P).innerHTML = t;
  }

  /* ---------------- export ---------------- */
  function download(name, text, type) {
    const blob = new Blob([text], { type: type }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportAs(kind) {
    if (kind === 'print') { showTab('cba'); setTimeout(() => window.print(), 300); return; }
    const stamp = new Date().toISOString().slice(0, 10), e = eco, r = res.open, b = res.baseline;
    if (kind === 'json') {
      download('open-loop-results-' + stamp + '.json', JSON.stringify({ note: 'Illustrative prototype results, not engineering design values.', inputs: state, economics: e, results: E.toPlain({ baseline: res.baseline, open: res.open }) }, null, 2), 'application/json');
      return;
    }
    const q = v => { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const line = a => a.map(q).join(',');
    const n0 = v => v === Infinity ? 'no payback' : +(+v).toFixed(2);
    let out = ['Open-loop geothermal - cost and payback export', 'Illustrative prototype results, not engineering design values.', ''];
    out.push(line(['Inputs']), line(['Climate', E.CLIMATES[state.climate].name]), line(['Terminal size (sq ft)', state.sqft]), line(['Electricity ($/kWh)', state.elecPrice]), line(['Gas ($/therm)', state.gasPrice]),
      line(['Project type', state.creditConv ? 'New or replacement plant' : 'Retrofit, keep full plant']), line(['Grant for with-grant case (%)', state.grantPct]), line(['Discount rate (%)', state.discountPct]), '');
    out.push(line(['Cost step', 'Amount ($)']),
      line(['Wells, heat exchanger, pumps and piping', n0(e.source)]), line(['Heat pump plant', n0(e.plant)]), line(['Geothermal equipment (gross)', n0(e.gross)]),
      line(['Backup boiler and chiller (open-loop option)', n0(e.backup)]), line(['Open-loop option total', n0(e.geoCapex)]), line(['Traditional option total', n0(e.tradCapex)]),
      line(['Extra cost of open-loop (no grant)', n0(e.extra)]), line(['Grant', n0(e.grant)]), line(['Extra cost after grant', n0(e.withGrant.net)]), '');
    out.push(line(['Operating cost ($/yr)', 'Traditional', 'Open-loop']), line(['Electricity', n0(b.annual.costElec), n0(r.annual.costElec)]), line(['Natural gas', n0(b.annual.costGas), n0(r.annual.costGas)]), line(['Maintenance', n0(b.annual.costOM), n0(r.annual.costOM)]), line(['Total', n0(b.annual.opex), n0(r.annual.opex)]), line(['Savings per year', '', n0(e.savings)]), '');
    out.push(line(['Result', 'Without grant', 'With grant']), line(['Simple payback (yrs)', n0(e.noGrant.payback), n0(e.withGrant.payback)]), line(['25-year net savings ($)', n0(e.noGrant.lifeNet), n0(e.withGrant.lifeNet)]), line(['Present value ($)', n0(e.noGrant.npv), n0(e.withGrant.npv)]), line(['Discounted payback (yrs)', n0(e.noGrant.discPayback), n0(e.withGrant.discPayback)]), '');
    out.push(line(['Monthly energy (MWh equivalent)', ...E.MONTH_NAMES]), line(['Traditional', ...b.monthly.energyMWh.map(v => +v.toFixed(2))]), line(['Open-loop', ...r.monthly.energyMWh.map(v => +v.toFixed(2))]), '');
    out.push(line(['Cumulative cash ($), year 0 to 30']), line(['Without grant', ...e.noGrant.cumulative.map(v => Math.round(v))]), line(['With grant', ...e.withGrant.cumulative.map(v => Math.round(v))]));
    download('open-loop-cost-payback-' + stamp + '.csv', out.join('\r\n'), 'text/csv');
  }

  /* ---------------- init ---------------- */
  function init() {
    try { const t = localStorage.getItem('geo-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
    buildControls(); buildPanels(); bindEvents();
    window.__geo = { get state() { return state; }, get res() { return res; }, get eco() { return eco; }, showTab, schedule, update };
    showTab('sim');
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
