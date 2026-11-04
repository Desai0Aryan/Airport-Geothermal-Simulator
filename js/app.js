/* Airport Geothermal Simulator - UI controller */
(function () {
  'use strict';
  const E = window.GeoEngine, C = window.Charts, D = window.Diagrams;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const nf = (v, d) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 });
  const money = v => (v < 0 ? '-' : '') + '$' + nf(Math.abs(v));
  const moneyC = v => { const a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1e6 ? s + '$' + nf(a / 1e6, 2) + 'M' : a >= 1e4 ? s + '$' + nf(a / 1e3, 0) + 'k' : a >= 1e3 ? s + '$' + nf(a / 1e3, 1) + 'k' : s + '$' + nf(a); };
  const yrs = v => v === Infinity ? 'No payback' : v === 0 ? 'Immediate' : v > 100 ? 'Over 100 yrs' : nf(v, 1) + ' yrs';
  const SYS = { open: { name: 'Open-loop' }, closed: { name: 'Closed-loop' }, hybrid: { name: 'Hybrid' } };
  const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const colors = () => ({ open: cssv('--open'), closed: cssv('--closed'), hybrid: cssv('--hybrid'), base: cssv('--base'),
    heat: cssv('--c-heat'), cool: cssv('--c-cool'), pump: cssv('--c-pump'), back: cssv('--c-back'), gas: cssv('--c-gas') });

  let state = E.makeDefaults('statecollege');
  const inst3d = {}, viewMode = {}, prevKpi = {}; let no3d = !window.Scene3D;
  const curTheme = () => document.documentElement.dataset.theme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  let res = null, snap = null, active = 'open', raf = 0, uid = 0;
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
      '<p class="help" style="margin:-4px 0 10px">Example climates with illustrative weather data, not measured records.</p>' +
      '<div class="ctl" data-key="ui.season" data-scale="1" data-dec="0"><label for="season-r">Season</label><input type="range" id="season-r" min="0" max="3" step="1" style="width:100%;accent-color:var(--ink)" aria-valuetext="">' +
      '<div class="season-scale" id="season-scale">' + E.SEASON_ORDER.map(s => '<span data-s="' + s + '">' + E.SEASONS[s].label + '</span>').join('') + '</div></div>' +
      slider({ key: 'ui.temp', label: 'Outdoor temperature', min: -20, max: 120, step: 1, unit: '°F', help: '' }) +
      '<div id="temp-note" class="help"></div><button type="button" class="btn-mini reset-temp" id="temp-reset">Back to typical temperature</button></div>';
    h += '<div class="cgroup"><h2>Terminal building</h2>' +
      slider({ key: 'sqft', label: 'Terminal size', min: 100000, max: 2500000, step: 25000, unit: 'sq ft', help: 'Conditioned floor area.' }) +
      slider({ key: 'heatMult', label: 'Heating demand', min: 40, max: 160, step: 5, scale: 100, unit: '%', help: '100% is a typical terminal for this climate.' }) +
      slider({ key: 'coolMult', label: 'Cooling demand', min: 40, max: 160, step: 5, scale: 100, unit: '%', help: 'Raise for crowds, glass, or lighting heat.' }) + '</div>';
    h += '<div class="cgroup"><h2>Energy prices</h2>' +
      slider({ key: 'elecPrice', label: 'Electricity price', min: 0.04, max: 0.30, step: 0.005, dec: 3, prefix: '$', unit: '/kWh', help: 'US commercial average is about $0.14 in 2026 (EIA).' }) +
      slider({ key: 'gasPrice', label: 'Natural gas price', min: 0.4, max: 3, step: 0.05, dec: 2, prefix: '$', unit: '/therm', help: 'US commercial average is about $1.07 per therm (EIA 2025). Only the traditional boiler and backup boilers use gas.' }) + '</div>';
    h += '<div class="cgroup"><h2>Underground conditions</h2>' +
      slider({ key: 'groundTemp', label: 'Ground temperature', min: 35, max: 85, step: 1, unit: '°F', help: 'Undisturbed temperature at borehole depth.' }) +
      slider({ key: 'gwTemp', label: 'Groundwater temperature', min: 35, max: 85, step: 1, unit: '°F' }) + '</div>';
    h += '<div class="cgroup"><h2>Costs and sizing</h2>' +
      slider({ key: 'costMult', label: 'Installation cost level', min: 50, max: 200, step: 5, scale: 100, unit: '%', help: 'Scales every geothermal installation cost.' }) +
      slider({ key: 'incentive', label: 'Grants and incentives', min: 0, max: 80, step: 1, unit: '%', help: 'Share of installation cost paid by others.' }) +
      slider({ key: 'sizePct', label: 'Ground system sized for', min: 50, max: 100, step: 5, unit: '% of peak', help: 'The existing boiler and chiller cover the remaining peak hours.' }) +
      slider({ key: 'landAvail', label: 'Land available for a borefield', min: 1, max: 60, step: 1, unit: 'acres' }) +
      check('creditConv', 'Credit avoided boiler and chiller cost', 'On: payback uses extra cost over a conventional plant. Off: payback uses full cost.') + '</div>';
    h += '<div class="cgroup"><button type="button" class="btn" id="btn-reset2" style="width:100%">Reset all inputs</button></div>';
    $('#controls').innerHTML = h;
  }

  /* ---------------- panels ---------------- */
  const BLURB = {
    open: 'Pumps groundwater up from a well, takes or gives heat through the heat pump, then returns the water to the aquifer through a second well.',
    closed: 'Circulates a sealed fluid loop through vertical boreholes. The ground is the heat source in winter and the heat sink in summer.',
    hybrid: 'Splits the load between a groundwater well pair and a borefield. Each part is sized for its share, then added together.'
  };
  function chartCard(id, title, sub, wide) { return '<section class="card chart-card' + (wide ? ' wide' : '') + '"><h3>' + title + '</h3><p class="sub">' + sub + '</p><div data-chart="' + id + '"></div></section>'; }

  function buildPanels() {
    let h = '';
    ['open', 'closed', 'hybrid'].forEach(id => {
      h += '<div id="panel-' + id + '" role="tabpanel" aria-labelledby="tab-' + id + '" hidden>' +
        '<div class="sys-head"><h2><i class="dot ' + id + '"></i>' + SYS[id].name + ' geothermal</h2><p>' + BLURB[id] + '</p></div>' +
        '<div class="sys-grid"><section class="card diagram-card"><div class="viewbar"><div class="seg" role="group" aria-label="Diagram view"><button type="button" data-view="3d" aria-pressed="true">3D model</button><button type="button" data-view="2d" aria-pressed="false">2D schematic</button></div></div><div class="stage"><div class="s3d" data-slot="s3d"></div><div class="schem" data-slot="diagram" hidden></div></div><div class="modeline" data-slot="modeline"></div></section>' +
        '<section class="card"><h3>Right now</h3><p class="sub" data-slot="livehead"></p><div data-slot="live"></div></section></div>' +
        '<div class="kpis" data-slot="kpis"></div><div class="warns" data-slot="warns"></div>' +
        '<section class="card settings"><h3>' + SYS[id].name + ' settings</h3><p class="sub">Drag a slider or type a value. Results update instantly.</p><div class="settings-grid" data-slot="settings">' + settingsFor(id) + '</div></section>' +
        '<div class="chart-grid">' +
        chartCard(id + '-month', 'Energy by month', 'Total energy use, with gas converted to kWh equivalent (MWh). Dashed line is traditional HVAC.') +
        chartCard(id + '-mix', 'Where this system’s energy goes', 'Heat pump heating and cooling, pumping, and backup boiler or chiller.') +
        chartCard(id + '-cost', 'Annual operating cost', 'Electricity, natural gas and maintenance, versus traditional HVAC.') +
        chartCard(id + '-cop', 'Heating and cooling performance', 'Efficiency (COP): units of heat moved per unit of electricity. Higher is better.') +
        chartCard(id + '-cum', 'Cumulative cash position over 30 years', 'Savings added up year by year, starting from the net installation cost. Prices held flat, no discounting.', true) +
        '</div><details class="card"><summary>Show the calculation</summary><div data-slot="math"></div></details></div>';
    });
    h += '<div id="panel-compare" role="tabpanel" aria-labelledby="tab-compare" hidden>' +
      '<section class="card verdict" data-slot="verdict"></section>' +
      '<section class="card cmp" data-slot="table"></section>' +
      '<div class="chart-grid">' +
      chartCard('cmp-season', 'Energy use by season', 'Winter is the cold-weather case and summer the warm-weather case. All systems share the same building, weather and prices.', true) +
      chartCard('cmp-annual', 'Annual energy use', 'MWh per year (gas counted as kWh equivalent).') +
      chartCard('cmp-opex', 'Annual operating cost', 'Electricity, gas and maintenance.') +
      chartCard('cmp-capex', 'Installation cost', 'Before grants and avoided-equipment credits.') +
      chartCard('cmp-life', '25-year net savings', 'Savings over 25 years minus net installation cost. Below zero means it has not paid back.') +
      chartCard('cmp-land', 'Land required', 'Acres for wells or the borefield footprint.') +
      chartCard('cmp-cum', 'Cumulative cash position over 30 years', 'Where each line crosses zero is the simple payback point.') +
      '</div><section class="card cmp" data-slot="matrix"></section></div>';
    h += '<div id="panel-how" role="tabpanel" aria-labelledby="tab-how" hidden>' + howHTML() + '</div>';
    $('#panels').innerHTML = h;
  }

  function settingsFor(id) {
    if (id === 'open') return [
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
    if (id === 'closed') return [
      check('closed.auto', 'Auto-size number of boreholes to the load', 'Off lets you set the count by hand.'),
      slider({ key: 'closed.bores', label: 'Number of boreholes', min: 10, max: 1500, step: 5 }),
      slider({ key: 'closed.depth', label: 'Borehole depth', min: 200, max: 800, step: 25, unit: 'ft', help: 'Deeper holes mean fewer holes and less land.' }),
      slider({ key: 'groundTemp', label: 'Ground temperature', min: 35, max: 85, step: 1, unit: '°F' }),
      slider({ key: 'closed.k', label: 'Ground thermal conductivity', min: 0.3, max: 2.4, step: 0.05, dec: 2, unit: 'Btu/h·ft·°F', help: 'Typical: 0.3 to 0.6 dry light clay or sand, 0.6 to 1.1 heavy clay or shale, 1.3 to 2.2 limestone, granite or wet sand.' }),
      slider({ key: 'closed.spacing', label: 'Borehole spacing', min: 15, max: 30, step: 1, unit: 'ft', help: 'Wider spacing lowers interference but needs more land. Louisville airport used about 25 ft.' }),
      slider({ key: 'closed.costPerFt', label: 'Drilling and loop cost', min: 10, max: 40, step: 1, prefix: '$', unit: '/ft' }),
      slider({ key: 'closed.costPerBore', label: 'Cost per borehole connection', min: 500, max: 4000, step: 100, prefix: '$' }),
      slider({ key: 'closed.instAdj', label: 'Borefield installation cost adjustment', min: -40, max: 60, step: 5, unit: '%' })
    ].join('');
    return [
      slider({ key: 'hybrid.openShare', label: 'Share handled by open-loop', min: 0, max: 100, step: 5, unit: '%', help: 'Closed-loop handles the rest, so the two always total 100%.' }),
      '<div class="ctl"><span class="lbl-t">Share handled by closed-loop</span><div class="ctl-row"><strong id="hyb-closed-share" style="font-variant-numeric:tabular-nums"></strong></div></div>',
      slider({ key: 'hybrid.integration', label: 'Integration and controls cost', min: 0, max: 500000, step: 10000, prefix: '$', help: 'Extra piping, valves and controls to run two sources together.' }),
      '<div class="ctl"><span class="lbl-t">Sizing at this split</span><div class="help" data-slot="hybsize" style="font-size:13.5px;color:var(--ink2)"></div><p class="help">Groundwater supply, ground conductivity, drilling and well costs come from the Open-loop and Closed-loop tabs.</p></div>'
    ].join('');
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
    ['adv.eftMin', 'Lowest allowed loop temperature', 30, 20, 40, 1, 0, '°F'],
    ['adv.eftMax', 'Highest allowed loop temperature', 90, 80, 110, 1, 0, '°F'],
    ['adv.convCoolPerTon', 'Traditional chiller plant cost', 1800, 800, 4000, 50, 0, '$/ton'],
    ['adv.convHeatPerMBH', 'Traditional boiler plant cost', 60, 20, 150, 5, 0, '$/MBH'],
    ['plantCostPerTon', 'Geothermal heat pump plant cost', 2000, 800, 4000, 50, 0, '$/ton'],
    ['adv.omPlant', 'Maintenance, heat pump plant', 0.015, 0, 0.06, 0.001, 3, 'of cost per year'],
    ['adv.omOpen', 'Maintenance, wellfield', 0.035, 0, 0.1, 0.001, 3, 'of cost per year'],
    ['adv.omClosed', 'Maintenance, borefield', 0.003, 0, 0.05, 0.001, 3, 'of cost per year'],
    ['adv.omConv', 'Maintenance, traditional plant', 0.025, 0, 0.08, 0.001, 3, 'of cost per year']
  ];
  function howHTML() {
    const cl = E.CLIMATES;
    const rows = Object.keys(cl).map(id => '<tr><th scope="row">' + cl[id].name + '</th>' + cl[id].monthly.map(t => '<td>' + t + '</td>').join('') + '</tr>').join('');
    return '<section class="card prose"><h3>What this prototype does</h3>' +
      '<p>It estimates the yearly energy use, cost and payback of three geothermal heating and cooling options for an airport terminal, and compares them with a traditional gas boiler and air-cooled chiller. It is a college-level model that favors understandable steps over precision. Nothing here replaces a site study or an engineer’s design.</p>' +
      '<h3>How the numbers are calculated</h3><ol>' +
      '<li><strong>Thermal demand.</strong> Each month, heating or cooling demand is the building’s response (Btu/h per sq ft per °F) times the floor area times the degree-hours beyond the balance temperature. Degree-hours come from the monthly mean temperature plus a normal spread for day-to-day and day-night swings. Cooling is increased for humidity (latent load).<span class="eq">heat (Btu) = UA_h x area x heating multiplier x degree-hours below 55°F\ncool (Btu) = UA_c x area x cooling multiplier x (1 + humidity) x degree-hours above 60°F</span></li>' +
      '<li><strong>Efficiency.</strong> Heat pumps and chillers reach a fixed share of the ideal (Carnot) efficiency, so they work better when the source is warm in winter or cool in summer.<span class="eq">COP_heat = eta_H x T_supply / (T_supply - T_source)      COP_cool = eta_C x T_chilled / (T_condenser - T_chilled)\n(temperatures in absolute degrees; results are limited to realistic ranges)</span></li>' +
      '<li><strong>Electricity.</strong> Thermal energy and electrical energy are kept separate. Heat pump electricity = thermal energy delivered / 3,412 / COP. Pumping electricity is added on top.</li>' +
      '<li><strong>Open-loop.</strong> Groundwater temperature sets the source temperature. Flow needed = heat taken from the water / (500 x temperature change). Pump power rises with the 1.5 power of flow. If the aquifer cannot supply the flow, the shortfall runs on the existing boiler or chiller.</li>' +
      '<li><strong>Closed-loop.</strong> The loop fluid temperature moves away from the ground temperature in proportion to the heat exchanged per foot of borehole and the ground resistance (from conductivity, borehole count and spacing). A long-term drift term captures heating and cooling imbalance. Too few or too short boreholes mean colder or hotter fluid, lower COP, and less capacity.</li>' +
      '<li><strong>Hybrid.</strong> Each source is sized for its own share of the load, then the electricity, cost and land of both are added. Nothing is counted twice: the same thermal energy is split once, and each subsystem’s uncovered load goes to one shared backup. Hybrid adds an integration cost, so it only wins when its split avoids a limit (limited groundwater, limited land, ground imbalance).</li>' +
      '<li><strong>Cost and payback.</strong> Installation cost covers the heat pump plant plus the wells or boreholes. Annual operating cost is electricity plus gas plus maintenance. Savings are traditional operating cost minus system operating cost. Simple payback is net installation cost divided by annual savings, with no discounting, price changes or financing.</li></ol>' +
      '<h3>Season and temperature controls</h3><p>The season slider picks the typical outdoor temperature for that season. Moving the temperature slider away from it applies a what-if shift to the whole year, so annual results, seasonal results and the live panel all respond. Changing the season or climate clears the shift.</p>' +
      '<h3>What the model leaves out</h3><ul><li>Hour-by-hour weather, solar gain, and real airport schedules and ventilation.</li><li>Electric demand charges, price changes over time, financing, and replacement cycles.</li><li>Water chemistry, permitting for groundwater discharge, and contamination or fouling risk.</li><li>Detailed borehole thermal response (g-functions) and groundwater flow through the borefield.</li><li>Airport-specific limits such as work near runways, taxiways and protected airspace.</li></ul>' +
      '<h3>Illustrative climate data</h3><p>Monthly mean temperatures (\u00B0F) are published 1991-2020 normals for the Minneapolis-St. Paul, Miami and Phoenix airport stations (NOAA/NWS). State College uses Penn State\u2019s 1882-1990 record, which runs slightly cool. Ground and groundwater temperatures follow the annual mean air temperature plus about 2\u00B0F. Aquifer supply per preset is an illustrative guess, not site data. Full sources and worked numbers are in SOURCES_AND_CALCULATIONS.txt.</p>' +
      '<div class="cmp"><table class="matrix"><thead><tr><th></th>' + E.MONTH_NAMES.map(m => '<th>' + m + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div></section>' +
      '<details class="card" style="margin-top:14px"><summary>Advanced assumptions</summary><p class="sub">Change these to test how sensitive the results are. They apply to every system and reset with Reset all inputs.</p><div class="adv-grid">' +
      ADV.map(a => numCtl({ key: a[0], label: a[1], min: a[3], max: a[4], step: a[5], dec: a[6], unit: a[7] })).join('') + '</div></details>';
  }

  /* ---------------- sync & events ---------------- */
  function syncControls() {
    const o = res.open.subs[0], c = res.closed.subs[0];
    $$('.ctl[data-key]').forEach(el => {
      const key = el.dataset.key, sc = +el.dataset.scale, dec = +el.dataset.dec;
      let v;
      if (key === 'ui.season') v = E.SEASON_ORDER.indexOf(state.season);
      else if (key === 'ui.temp') v = typical() + state.tempShift;
      else v = getp(key) * sc;
      if (key === 'open.flow') { const mx = Math.max(1000, Math.ceil(Math.max(o.reqFlow * 2.2, state.open.supply * 1.3) / 100) * 100); $$('input', el).forEach(i => { if (i.max !== '' + mx) i.max = mx; }); }
      if (key === 'closed.bores') { const mx = Math.max(200, Math.ceil(Math.max((c.autoBores || 50) * 2.2, 100) / 50) * 50); $$('input', el).forEach(i => { if (i.max !== '' + mx) i.max = mx; }); }
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
    const hc = $('#hyb-closed-share'); if (hc) hc.textContent = (100 - state.hybrid.openShare) + '%';
  }

  function applyChange(key, v) {
    if (key === 'ui.season') { state.season = E.SEASON_ORDER[Math.round(v)]; state.tempShift = 0; }
    else if (key === 'ui.temp') state.tempShift = v - typical();
    else { if (key === 'open.flow') state.open.auto = false; if (key === 'closed.bores') state.closed.auto = false; setp(key, v); }
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
      if (e.target.type === 'number') v = Math.min(Math.max(v, min), Math.max(max, v)); // allow typing past the slider max for flow / bores
      applyChange(ctl.dataset.key, v / (+ctl.dataset.scale || 1));
    });
    document.addEventListener('change', e => {
      const t = e.target;
      if (t.type === 'checkbox' && t.dataset.key) { setp(t.dataset.key, t.checked); schedule(); }
      else if (t.type === 'number' && t.closest('.ctl')) { schedule(); const el = t; setTimeout(() => { el.value = (+el.value).toFixed(+t.closest('.ctl').dataset.dec); }, 0); }
    });
    document.addEventListener('click', e => {
      const chip = e.target.closest('[data-climate]'); if (chip) return applyClimate(chip.dataset.climate);
      const vw = e.target.closest('[data-view]'); if (vw) { viewMode[active] = vw.dataset.view; return schedule(); }
      const tab = e.target.closest('[data-tab]'); if (tab) return showTab(tab.dataset.tab);
      const go = e.target.closest('[data-goto]'); if (go) return showTab(go.dataset.goto);
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
    $('#strip').hidden = id === 'how';
    schedule();
  }
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }

  /* ---------------- rendering ---------------- */
  function update() {
    res = E.computeAll(state);
    snap = E.snapshot(state, res, typical() + state.tempShift);
    if (state.open.auto) state.open.flow = Math.round(res.open.subs[0].designFlow);
    if (state.closed.auto) state.closed.bores = res.closed.subs[0].autoBores;
    syncControls(); renderStrip();
    if (active === 'compare') renderCompare(); else if (active !== 'how') renderSystem(active);
  }

  function renderStrip() {
    const cl = E.CLIMATES[state.climate], T = typical() + state.tempShift, b = snap.baseline;
    const mode = snap.mode === 'heating' ? 'Heating' : snap.mode === 'cooling' ? 'Cooling' : 'Mild';
    const demand = snap.mode === 'heating' ? snap.heat : snap.cool;
    const sys = ['open', 'closed', 'hybrid'].includes(active) ? active : null;
    let last;
    if (sys) { const c = snap[sys].costPerHour * 24; last = '<div class="s"><span>' + SYS[sys].name + ' cost per day</span><b>' + money(c) + '</b><i class="sub">vs ' + money(b.costPerHour * 24) + ' traditional</i></div>'; }
    else { const best = ['open', 'closed', 'hybrid'].reduce((m, k) => snap[k].costPerHour < snap[m].costPerHour ? k : m, 'open'); last = '<div class="s"><span>Cheapest to run right now</span><b>' + SYS[best].name + '</b><i class="sub">' + money(snap[best].costPerHour * 24) + ' per day</i></div>'; }
    $('#strip').innerHTML =
      '<div class="s"><span>' + E.SEASONS[state.season].label + ' in ' + cl.name + '</span><b>' + nf(T) + '°F outdoors</b><i class="sub">' + (Math.abs(state.tempShift) >= 0.5 ? 'What-if: ' + (state.tempShift > 0 ? '+' : '') + nf(state.tempShift) + '°F vs typical' : 'Typical for the season') + '</i></div>' +
      '<div class="s"><span>Terminal demand</span><b>' + mode + (snap.mode === 'idle' ? '' : ': ' + nf(demand / E.BTU_PER_KWH / 1000, 2) + ' MW') + '</b><i class="sub">' + (snap.mode === 'idle' ? 'Little heating or cooling needed' : nf(demand / 12000) + ' tons of ' + (snap.mode === 'heating' ? 'heat' : 'cooling')) + '</i></div>' +
      '<div class="s"><span>Traditional HVAC cost per day</span><b>' + money(b.costPerHour * 24) + '</b><i class="sub">At this temperature all day</i></div>' + last;
  }

  function kpi(label, value, sub, accent, bad) { return '<div class="kpi' + (bad ? ' bad' : '') + '" style="--accent:' + accent + '"><div class="k">' + label + '</div><div class="v">' + value + '</div><div class="s">' + sub + '</div></div>'; }

  function renderSystem(id) {
    const P = $('#panel-' + id), r = res[id], b = res.baseline, col = colors(), ac = col[id], ps = state;
    const sl = n => $('[data-slot=' + n + ']', P);
    const sub0 = r.subs[0];
    // diagram
    const ctx = { res, snap, p: ps };
    const want3d = viewMode[id] !== '2d' && !no3d;
    if (want3d && !inst3d[id]) { try { inst3d[id] = window.Scene3D.create(sl('s3d'), id); } catch (err) { no3d = true; } }
    const use3d = want3d && !no3d;
    sl('s3d').hidden = !use3d; sl('diagram').hidden = use3d;
    $$('[data-view]', P).forEach(b => b.setAttribute('aria-pressed', (b.dataset.view === '3d') === use3d));
    if (use3d) inst3d[id].update({ p: ps, res, snap, T: typical() + state.tempShift, season: state.season, theme: curTheme() });
    else sl('diagram').innerHTML = D[id](ctx);
    const i = snap[id];
    sl('modeline').innerHTML = '<i class="dot ' + (snap.mode === 'idle' ? 'base' : id) + '"></i><span>' + (snap.mode === 'heating' ? 'Heating: ' + nf(snap.heat / E.BTU_PER_KWH) + ' kW of heat needed. ' : snap.mode === 'cooling' ? 'Cooling: ' + nf(snap.cool / E.BTU_PER_KWH) + ' kW of cooling needed. ' : 'Mild weather: almost no heating or cooling needed. ') +
      (snap.mode !== 'idle' ? 'This system draws ' + nf(i.elecKW) + ' kW of electricity' + (i.gasTherm > 0.5 ? ' plus backup gas' : '') + '.' : '') + '</span>';
    // live panel
    sl('livehead').textContent = nf(typical() + state.tempShift) + '°F outdoors, steady for a full day';
    const perDay = x => money(x * 24);
    const cop = (v) => v ? nf(v, 1) : '-';
    sl('live').innerHTML = '<table class="live-table"><thead><tr><th></th><th>Traditional</th><th>' + SYS[id].name + '</th></tr></thead><tbody>' +
      '<tr><th scope="row">Electricity</th><td>' + nf(snap.baseline.elecKW) + ' kW</td><td>' + nf(i.elecKW) + ' kW</td></tr>' +
      '<tr><th scope="row">Natural gas</th><td>' + nf(snap.baseline.gasTherm, 1) + ' therm/h</td><td>' + nf(i.gasTherm, 1) + ' therm/h</td></tr>' +
      '<tr><th scope="row">Heating efficiency (COP)</th><td>' + cop(snap.mode === 'heating' ? snap.baseline.copH : 0) + '</td><td>' + cop(i.copH) + '</td></tr>' +
      '<tr><th scope="row">Cooling efficiency (COP)</th><td>' + cop(snap.baseline.copC) + '</td><td>' + cop(i.copC) + '</td></tr>' +
      '<tr><th scope="row">Energy cost per day</th><td>' + perDay(snap.baseline.costPerHour) + '</td><td>' + perDay(i.costPerHour) + '</td></tr>' +
      '<tr><th scope="row"><strong>Savings per day</strong></th><td></td><td><strong>' + perDay(snap.baseline.costPerHour - i.costPerHour) + '</strong></td></tr>' +
      '</tbody></table><p class="help" style="margin-top:8px">Pumping is included. Maintenance is not (it is in the annual figures).</p>';
    // KPIs
    const pct = x => nf(Math.abs(x) * 100) + '%';
    let k = kpi('Installation cost', moneyC(r.capex.gross), 'Net after credits: ' + moneyC(r.capex.net), ac) +
      kpi('Annual operating cost', moneyC(r.annual.opex), 'Traditional: ' + moneyC(b.annual.opex), ac) +
      kpi('Annual savings', moneyC(r.savings), (r.savings >= 0 ? pct(r.savingsPct) + ' less than traditional' : pct(r.savingsPct) + ' more than traditional'), ac, r.savings < 0) +
      kpi('Simple payback', yrs(r.payback), '25-year net: ' + moneyC(r.lifecycleNet), ac, r.payback === Infinity) +
      kpi('Annual energy use', nf(r.annual.energyMWh) + ' MWh', (r.energySavedPct >= 0 ? pct(r.energySavedPct) + ' less' : pct(r.energySavedPct) + ' more') + ' than traditional', ac);
    if (id === 'open') k += kpi('Groundwater flow', nf(sub0.designFlow) + ' gpm', sub0.wellCount + ' wells, ' + nf(sub0.reqFlow) + ' gpm needed', ac) + kpi('Pumping cost', moneyC(r.annual.costPumping) + '/yr', nf(r.annual.pumpKWh / 1000) + ' MWh of pumping', ac) + kpi('Land required', nf(r.land, 1) + ' acres', 'Well pads and plant yard', ac);
    if (id === 'closed') k += kpi('Land required', nf(r.land, 1) + ' acres', nf(sub0.bores) + ' boreholes, ' + nf(sub0.fieldFt / 1000) + 'k ft of drilling', ac) + kpi('Heating efficiency', nf(r.annual.seasonalCopHeat, 1) + ' COP', 'Cooling: ' + nf(r.annual.seasonalCopCool, 1) + ' COP', ac) + kpi('Ground drift', (sub0.drift > 0 ? '+' : '') + nf(sub0.drift, 1) + '°F', 'Long-term effect of heating and cooling imbalance', ac);
    if (id === 'hybrid') k += kpi('Land required', nf(r.land, 1) + ' acres', 'Wells plus boreholes', ac) + kpi('Heating efficiency', nf(r.annual.seasonalCopHeat, 1) + ' COP', 'Cooling: ' + nf(r.annual.seasonalCopCool, 1) + ' COP', ac) + kpi('Split', nf(state.hybrid.openShare) + ' / ' + nf(100 - state.hybrid.openShare), 'Open-loop / closed-loop, % of demand', ac);
    sl('kpis').innerHTML = k;
    const nowK = $$('.kpi .v', sl('kpis')).map(x => x.textContent);
    if (prevKpi[id] && prevKpi[id].length === nowK.length) $$('.kpi', sl('kpis')).forEach((el, i) => { if (prevKpi[id][i] !== nowK[i]) el.classList.add('flash'); });
    prevKpi[id] = nowK;
    // warnings / notes
    const w = r.warnings.map(t => '<div class="warn">' + t + '</div>').join('') +
      '<div class="warn info">Peak coverage: ground system handles ' + nf(r.peakCoverage.heat * 100) + '% of peak heating and ' + nf(r.peakCoverage.cool * 100) + '% of peak cooling. It supplies ' + nf(r.annual.heatCoverage * 100) + '% of yearly heating and ' + nf(r.annual.coolCoverage * 100) + '% of yearly cooling; the existing boiler and chiller cover the rest.</div>';
    sl('warns').innerHTML = w;
    if (id === 'hybrid') {
      const o = r.subs[0], c = r.subs[1];
      sl('hybsize').innerHTML = (o.active ? nf(o.designFlow) + ' gpm and ' + o.wellCount + ' wells (open-loop)<br>' : 'No open-loop part<br>') + (c.active ? nf(c.bores) + ' boreholes at ' + nf(c.depth) + ' ft (closed-loop)' : 'No closed-loop part');
    }
    // charts
    const cc = col, mo = E.MONTH_NAMES;
    const mwh = r.monthly.energyMWh, bm = b.monthly.energyMWh;
    const f1 = v => nf(v, 0) + ' MWh', f2 = v => moneyC(v);
    C.render($('[data-chart=' + id + '-month]', P), { type: 'line', x: mo, xName: 'Month', title: 'Monthly energy', yTitle: 'MWh per month', format: f1, axisFormat: v => nf(v),
      series: [{ name: 'Traditional HVAC', color: cc.base, dash: true, values: bm }, { name: SYS[id].name, color: ac, values: mwh }] });
    const backMWh = r.monthly.gas.map((g, m) => g * E.KWH_PER_THERM / 1000 + r.monthly.eBack[m] / 1000);
    C.render($('[data-chart=' + id + '-mix]', P), { type: 'bar', stacked: true, categories: mo, xName: 'Month', title: 'Energy mix', yTitle: 'MWh per month', format: v => nf(v, 1) + ' MWh', axisFormat: v => nf(v),
      series: [{ name: 'Heat pump, heating', color: cc.heat, values: r.monthly.eHeat.map(x => x / 1000) }, { name: 'Heat pump, cooling', color: cc.cool, values: r.monthly.eCool.map(x => x / 1000) },
        { name: 'Pumping', color: cc.pump, values: r.monthly.ePump.map(x => x / 1000) }, { name: 'Backup boiler or chiller', color: cc.back, values: backMWh }] });
    C.render($('[data-chart=' + id + '-cost]', P), { type: 'bar', stacked: true, categories: ['Traditional HVAC', SYS[id].name], xName: 'System', title: 'Annual operating cost', format: money, axisFormat: moneyC, height: 250,
      series: [{ name: 'Electricity', color: cc.cool, values: [b.annual.costElec, r.annual.costElec] }, { name: 'Natural gas', color: cc.gas, values: [b.annual.costGas, r.annual.costGas] }, { name: 'Maintenance', color: cc.pump, values: [b.annual.costOM, r.annual.costOM] }] });
    C.render($('[data-chart=' + id + '-cop]', P), { type: 'line', x: mo, xName: 'Month', title: 'Efficiency by month', yTitle: 'COP', format: v => nf(v, 2), axisFormat: v => nf(v, 1),
      series: [{ name: 'Heating COP', color: cc.heat, values: r.monthly.copH }, { name: 'Cooling COP', color: cc.cool, values: r.monthly.copC }] });
    const yrsX = Array.from({ length: 31 }, (_, t) => t);
    C.render($('[data-chart=' + id + '-cum]', P), { type: 'line', x: yrsX, xName: 'Year', xFormat: v => 'Year ' + v, title: 'Cumulative cash position', zero: true, xEvery: 5, format: money, axisFormat: moneyC,
      marks: isFinite(r.payback) && r.payback > 0 && r.payback <= 30 ? [{ i: Math.round(r.payback), label: 'payback' }] : [],
      series: [{ name: SYS[id].name + ' (net of installation cost)', color: ac, values: r.cumulative }] });
    // math
    sl('math').innerHTML = mathTable(id);
  }

  function mathTable(id) {
    const r = res[id], b = res.baseline, a = r.annual, L = res.loads;
    const row = (l, f, v, u) => '<tr><th scope="row">' + l + '</th><td style="text-align:left;color:var(--ink2)">' + f + '</td><td>' + v + '</td><td style="text-align:left">' + u + '</td></tr>';
    return '<div class="cmp"><table class="live-table"><thead><tr><th>Step</th><th style="text-align:left">How it is calculated</th><th>Value</th><th style="text-align:left">Unit</th></tr></thead><tbody>' +
      row('Heating demand (thermal)', 'UA x area x multiplier x degree-hours', nf(a.heatDemandMBtu), 'MMBtu / yr') +
      row('Cooling demand (thermal)', 'UA x area x multiplier x (1 + humidity) x degree-hours', nf(a.coolDemandMBtu), 'MMBtu / yr') +
      row('Peak heating design load', 'UA x (balance temp - design temp) x margin', nf(L.heatPeak / 12000), 'tons') +
      row('Peak cooling design load', 'UA x (design temp - balance temp) x margin x humidity', nf(L.coolPeak / 12000), 'tons') +
      row('Heat pump heating electricity', 'heat delivered / 3,412 / COP', nf(a.hpHeatKWh / 1000), 'MWh (COP ' + nf(a.seasonalCopHeat, 2) + ')') +
      row('Heat pump cooling electricity', 'cooling delivered / 3,412 / COP', nf(a.hpCoolKWh / 1000), 'MWh (COP ' + nf(a.seasonalCopCool, 2) + ')') +
      row('Pumping electricity', id === 'closed' ? 'loop circulation pumps' : 'well pumps (+ loop pumps in hybrid)', nf(a.pumpKWh / 1000), 'MWh') +
      row('Backup boiler and chiller', 'uncovered load / boiler efficiency or chiller COP', nf(a.gasTherm) + ' therms, ' + nf(a.backupElecKWh / 1000) + ' MWh', '') +
      row('Total electricity', 'sum of the electric lines above', nf(a.elecKWh / 1000), 'MWh') +
      row('Electricity cost', 'kWh x price', money(a.costElec), '/ yr') +
      row('Gas cost', 'therms x price', money(a.costGas), '/ yr') +
      row('Maintenance', '% of installed cost', money(a.costOM), '/ yr') +
      row('Operating cost', 'electricity + gas + maintenance', money(a.opex), '/ yr') +
      row('Traditional operating cost', 'boiler gas + chiller electricity + maintenance', money(b.annual.opex), '/ yr') +
      row('Annual savings', 'traditional - this system', money(r.savings), '/ yr') +
      row('Heat pump plant', 'peak tons covered x cost per ton x cost level', money(r.capex.plant), '') +
      row('Wells or boreholes', 'sized, drilled and connected', money(r.capex.source), '') +
      row('Grants and credits', 'incentive % + avoided boiler/chiller', '-' + money(r.capex.incentive + r.capex.credit), '') +
      row('Net installation cost', 'plant + source - grants - credits', money(r.capex.net), '') +
      row('Simple payback', 'net installation cost / annual savings', yrs(r.payback), '') + '</tbody></table></div>';
  }

  /* ---------------- compare ---------------- */
  const ROWS = [
    ['g', 'Energy use'],
    ['Cold-weather energy (Dec to Feb)', s => s.season.energyMWh.winter, v => nf(v) + ' MWh', 'low'],
    ['Warm-weather energy (Jun to Aug)', s => s.season.energyMWh.summer, v => nf(v) + ' MWh', 'low'],
    ['Annual energy', s => s.annual.energyMWh, v => nf(v) + ' MWh', 'low'],
    ['Annual electricity', s => s.annual.elecKWh / 1000, v => nf(v) + ' MWh', null],
    ['Annual natural gas', s => s.annual.gasTherm, v => nf(v) + ' therms', null],
    ['Heating efficiency (seasonal COP)', s => s.annual.seasonalCopHeat, v => nf(v, 2), 'high'],
    ['Cooling efficiency (seasonal COP)', s => s.annual.seasonalCopCool, v => nf(v, 2), 'high'],
    ['Peak electric demand', s => s.peakKW, v => nf(v) + ' kW', null],
    ['g', 'Cost'],
    ['Installation cost (gross)', s => s.capex.gross, money, 'low'],
    ['Installation cost (net of grants and credits)', s => s.capex.net, money, 'low'],
    ['Annual operating cost', s => s.annual.opex, money, 'low'],
    ['Annual savings vs traditional', s => s.savings, money, 'high'],
    ['Simple payback', s => s.payback, yrs, 'low'],
    ['25-year net savings', s => s.lifecycleNet, money, 'high'],
    ['g', 'Site and environment'],
    ['Land required', s => s.land, v => nf(v, 1) + ' acres', 'low'],
    ['CO₂ per year (illustrative grid factor)', s => s.co2, v => nf(v) + ' tons', 'low']
  ];
  function renderCompare() {
    const P = $('#panel-compare'), col = colors(), b = res.baseline, S = [res.open, res.closed, res.hybrid], cats = ['Traditional', 'Open-loop', 'Closed-loop', 'Hybrid'];
    $('[data-slot=verdict]', P).innerHTML = verdictHTML();
    let t = '<table><thead><tr><th>Same building, weather and prices for all</th><th><i class="dot base"></i>Traditional</th><th><i class="dot open"></i>Open-loop</th><th><i class="dot closed"></i>Closed-loop</th><th><i class="dot hybrid"></i>Hybrid</th></tr></thead><tbody>';
    ROWS.forEach(r => {
      if (r[0] === 'g') { t += '<tr class="grp"><th colspan="5">' + r[1] + '</th></tr>'; return; }
      const vals = S.map(s => r[1](s)), bv = r[1](b);
      let bestI = -1;
      if (r[3]) { const fin = vals.map(v => (typeof v === 'number' && !isNaN(v)) ? v : (r[3] === 'low' ? Infinity : -Infinity)); const tgt = r[3] === 'low' ? Math.min(...fin) : Math.max(...fin); if (isFinite(tgt)) bestI = fin.findIndex(v => Math.abs(v - tgt) < 1e-9); }
      const baseTxt = (r[0].indexOf('savings') >= 0 || r[0] === 'Simple payback') ? '–' : (r[0].indexOf('Installation cost (net') === 0 ? money(b.capex.net) : (r[0].indexOf('Heating efficiency') === 0 ? nf(b.annual.seasonalCopHeat, 2) : r[2](bv)));
      t += '<tr><th scope="row">' + r[0] + '</th><td class="base">' + baseTxt + '</td>' + vals.map((v, i) => '<td' + (i === bestI ? ' class="best"' : '') + '>' + r[2](v) + '</td>').join('') + '</tr>';
    });
    t += '</tbody></table><p class="note">Shaded cell = best of the three geothermal options in that row. Traditional HVAC is a gas boiler plus air-cooled chiller. “Net” installation cost subtracts grants and, if checked, the boiler and chiller you would not need to buy. Electric demand charges are not modeled.</p>' +
      '<div class="cmp-actions"><button type="button" class="btn" data-export="csv">Download CSV</button><button type="button" class="btn ghost" data-export="json">Download JSON</button><button type="button" class="btn ghost" data-export="print">Print or save as PDF</button></div>';
    $('[data-slot=table]', P).innerHTML = t;
    const colors4 = [col.base, col.open, col.closed, col.hybrid];
    const g = id => $('[data-chart=' + id + ']', P);
    C.render(g('cmp-season'), { type: 'bar', categories: E.SEASON_ORDER.map(s => E.SEASONS[s].label), xName: 'Season', title: 'Energy by season', yTitle: 'MWh per season', format: v => nf(v) + ' MWh', axisFormat: v => nf(v),
      series: [{ name: 'Traditional HVAC', color: col.base, values: E.SEASON_ORDER.map(s => b.season.energyMWh[s]) }].concat(S.map((s, i) => ({ name: cats[i + 1], color: [col.open, col.closed, col.hybrid][i], values: E.SEASON_ORDER.map(k => s.season.energyMWh[k]) }))) });
    const one = (name, vals, fmt, axf, extra) => Object.assign({ type: 'bar', categories: cats, xName: 'System', title: name, labels: true, legend: false, format: fmt, axisFormat: axf || fmt, colors: colors4, series: [{ name: name, color: col.base, values: vals }], height: 240 }, extra || {});
    C.render(g('cmp-annual'), one('Annual energy', [b, ...S].map(s => s.annual.energyMWh), v => nf(v) + ' MWh', v => nf(v)));
    C.render(g('cmp-opex'), one('Annual operating cost', [b, ...S].map(s => s.annual.opex), moneyC, moneyC, { tableFormat: money }));
    C.render(g('cmp-capex'), one('Installation cost', [null, ...S].map((s, i) => i === 0 ? b.capex.gross : s.capex.gross), moneyC, moneyC, { tableFormat: money, categories: ['Traditional (for reference)', 'Open-loop', 'Closed-loop', 'Hybrid'] }));
    C.render(g('cmp-life'), one('25-year net savings', [0, ...S.map(s => s.lifecycleNet)], moneyC, moneyC, { tableFormat: money, categories: ['Traditional (baseline)', 'Open-loop', 'Closed-loop', 'Hybrid'] }));
    C.render(g('cmp-land'), one('Land required', [0, ...S.map(s => s.land)], v => nf(v, 1) + ' ac', v => nf(v, 1), { tableFormat: v => nf(v, 1) + ' acres', refLine: state.landAvail, refLabel: 'land available: ' + nf(state.landAvail) + ' acres' }));
    C.render(g('cmp-cum'), { type: 'line', x: Array.from({ length: 31 }, (_, t) => t), xName: 'Year', xFormat: v => 'Year ' + v, title: 'Cumulative cash position', zero: true, xEvery: 5, format: money, axisFormat: moneyC,
      series: S.map((s, i) => ({ name: cats[i + 1], color: [col.open, col.closed, col.hybrid][i], values: s.cumulative })) });
    // climate matrix
    const M = E.climateMatrix(state);
    let m = '<h3 style="margin-bottom:4px">Which option wins where?</h3><p class="sub">Each climate preset is rerun with its own ground and groundwater conditions. Your building size, prices, costs and system settings stay as they are. Winner = highest 25-year net savings.</p><table class="matrix"><thead><tr><th>Climate</th><th><i class="dot open"></i> Open-loop</th><th><i class="dot closed"></i> Closed-loop</th><th><i class="dot hybrid"></i> Hybrid</th><th>Result</th></tr></thead><tbody>';
    M.forEach(c => {
      const best = c.best.lifecycle, bs = c[best];
      const none = bs.lifecycleNet <= 0;
      const cell = (k, s) => '<td' + (!none && k === best ? ' class="win"' : '') + '>' + yrs(s.payback) + '<small>' + moneyC(s.lifecycleNet) + ' over 25 yrs</small></td>';
      m += '<tr><th scope="row">' + c.name + '<small>' + c.tag + '</small></th>' + cell('open', c.open) + cell('closed', c.closed) + cell('hybrid', c.hybrid) + '<td>' + (none ? 'None pays back in 25 years' : SYS[best].name + ' wins') + '</td></tr>';
    });
    $('[data-slot=matrix]', P).innerHTML = m + '</tbody></table><p class="note">Payback is shown first, then 25-year net savings. These are illustrative, so treat them as a way to see how the answer shifts with climate and groundwater, not as a siting recommendation.</p>';
  }

  function verdictHTML() {
    const S = [res.open, res.closed, res.hybrid], nm = s => s.name;
    const best = S.reduce((m, s) => s.lifecycleNet > m.lifecycleNet ? s : m, S[0]);
    const lowCap = S.reduce((m, s) => s.capex.net < m.capex.net ? s : m, S[0]);
    const topSav = S.reduce((m, s) => s.savings > m.savings ? s : m, S[0]);
    const lowEn = S.reduce((m, s) => s.annual.energyMWh < m.annual.energyMWh ? s : m, S[0]);
    const smallLand = S.reduce((m, s) => s.land < m.land ? s : m, S[0]);
    let head, p1;
    if (best.lifecycleNet <= 0) {
      head = 'None of the three pays back within 25 years at these inputs';
      p1 = 'The largest yearly saving is ' + moneyC(topSav.savings) + ' (' + nm(topSav) + '), which does not recover its ' + moneyC(topSav.capex.net) + ' net installation cost in 25 years. Try a higher electricity-to-gas price gap, grants, a lower installation cost level, or a colder or hotter climate with more demand.';
    } else {
      head = nm(best) + ' is the most cost-effective option at these inputs';
      p1 = nm(best) + ' pays back in ' + yrs(best.payback) + ' and nets ' + moneyC(best.lifecycleNet) + ' over 25 years, saving ' + moneyC(best.savings) + ' a year (' + nf(best.savingsPct * 100) + '% of traditional operating cost).';
    }
    let p2 = nm(lowCap) + ' has the lowest net installation cost (' + moneyC(lowCap.capex.net) + '), ' + nm(topSav) + ' saves the most each year (' + moneyC(topSav.savings) + '), ' + nm(lowEn) + ' uses the least energy (' + nf(lowEn.annual.energyMWh) + ' MWh) and ' + nm(smallLand) + ' needs the least land (' + nf(smallLand.land, 1) + ' acres).';
    const notes = [];
    const o = res.open, c = res.closed, h = res.hybrid;
    if (o.warnings.some(w => /supply|only covers/.test(w))) notes.push('Open-loop is limited by groundwater supply' + (!h.warnings.some(w => /groundwater|water flow/i.test(w)) ? ', which the hybrid split relieves.' : '.'));
    if (c.warnings.some(w => /Land limits/.test(w))) notes.push('Closed-loop alone does not fit in the available land' + (!h.warnings.some(w => /Land limits/.test(w)) ? '; the hybrid does.' : '.'));
    if (Math.abs(c.subs[0].drift) >= 5) notes.push('Closed-loop efficiency suffers from ground temperature drift (' + nf(c.subs[0].drift, 1) + '°F).');
    if (best === h) notes.push('Hybrid wins here because its split avoids a limit that hurts one single option, not because hybrids are better by default.');
    else notes.push('Hybrid is not automatically best: it adds integration cost and mostly lands between the two single options unless groundwater or land is limited.');
    const key = best.id === 'hybrid' ? 'hybrid' : best.id;
    return '<h3 style="border-left:0">' + head + '</h3><p>' + p1 + '</p><p>' + p2 + '</p><p style="color:var(--ink2)">' + notes.join(' ') + '</p>' +
      '<p class="help" style="margin-top:8px">Illustrative estimates based on ' + E.CLIMATES[state.climate].name + ' weather' + (Math.abs(state.tempShift) >= 0.5 ? ' shifted ' + (state.tempShift > 0 ? '+' : '') + nf(state.tempShift) + '°F' : '') + ', a ' + nf(state.sqft) + ' sq ft terminal, electricity at $' + state.elecPrice.toFixed(3) + '/kWh and gas at $' + state.gasPrice.toFixed(2) + '/therm.</p>';
  }

  /* ---------------- export ---------------- */
  function download(name, text, type) {
    const blob = new Blob([text], { type: type }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportAs(kind) {
    if (kind === 'print') { showTab('compare'); setTimeout(() => window.print(), 250); return; }
    const S = [res.baseline, res.open, res.closed, res.hybrid];
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === 'json') {
      download('geothermal-comparison-' + stamp + '.json', JSON.stringify({ note: 'Illustrative prototype results, not engineering design values.', inputs: state, results: E.toPlain({ baseline: res.baseline, open: res.open, closed: res.closed, hybrid: res.hybrid }) }, null, 2), 'application/json');
      return;
    }
    const q = v => { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const line = a => a.map(q).join(',');
    let out = ['Airport Geothermal Simulator - comparison export', 'Illustrative prototype results, not engineering design values.', ''];
    out.push(line(['Inputs']));
    out.push(line(['Climate', E.CLIMATES[state.climate].name]), line(['Season', E.SEASONS[state.season].label]), line(['Outdoor temperature (F)', nf(typical() + state.tempShift)]),
      line(['Terminal size (sq ft)', state.sqft]), line(['Heating demand multiplier', state.heatMult]), line(['Cooling demand multiplier', state.coolMult]),
      line(['Electricity price ($/kWh)', state.elecPrice]), line(['Gas price ($/therm)', state.gasPrice]), line(['Ground temperature (F)', state.groundTemp]), line(['Groundwater temperature (F)', state.gwTemp]),
      line(['Installation cost level', state.costMult]), line(['Grants and incentives (%)', state.incentive]), line(['Ground system sized for (% of peak)', state.sizePct]), line(['Hybrid open-loop share (%)', state.hybrid.openShare]), '');
    out.push(line(['Metric', 'Traditional HVAC', 'Open-loop', 'Closed-loop', 'Hybrid']));
    ROWS.forEach(r => {
      if (r[0] === 'g') return;
      out.push(line([r[0]].concat(S.map((s, i) => {
        if (i === 0 && (r[0].indexOf('savings') >= 0 || r[0] === 'Simple payback')) return '';
        const v = i === 0 && r[0].indexOf('Installation cost (net') === 0 ? s.capex.net : r[1](s);
        return v === Infinity ? 'no payback' : (typeof v === 'number' ? +v.toFixed(3) : v);
      }))));
    });
    out.push('', line(['Monthly energy (MWh equivalent)', ...E.MONTH_NAMES]));
    S.forEach(s => out.push(line([s.name, ...s.monthly.energyMWh.map(v => +v.toFixed(2))])));
    out.push('', line(['Cumulative cash position ($), year 0 to 30']));
    [res.open, res.closed, res.hybrid].forEach(s => out.push(line([s.name, ...s.cumulative.map(v => Math.round(v))])));
    download('geothermal-comparison-' + stamp + '.csv', out.join('\r\n'), 'text/csv');
  }

  /* ---------------- init ---------------- */
  function init() {
    try { const t = localStorage.getItem('geo-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
    buildControls(); buildPanels(); bindEvents();
    window.__geo = { get state() { return state; }, get res() { return res; }, showTab, schedule, update };
    showTab('open');
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
