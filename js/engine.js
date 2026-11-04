/* ==========================================================================
   Airport Geothermal Simulator - calculation engine
   Pure functions, no DOM. Works in the browser (window.GeoEngine) and Node.
   ALL numbers are illustrative, simplified engineering estimates.
   Thermal energy (Btu) and electrical energy (kWh) are kept separate;
   they only meet through COP (or boiler efficiency for the gas baseline).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GeoEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BTU_PER_KWH = 3412.14;
  const BTU_PER_THERM = 100000;
  const KWH_PER_THERM = 29.3071;
  const WATER_BTU_PER_GPM_F = 500; // Btu/h per (gpm * degF)
  const MONTH_HOURS = [744, 672, 744, 720, 744, 720, 744, 744, 720, 744, 720, 744];
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SEASONS = {
    winter: { label: 'Winter', months: [11, 0, 1] },
    spring: { label: 'Spring', months: [2, 3, 4] },
    summer: { label: 'Summer', months: [5, 6, 7] },
    fall: { label: 'Fall', months: [8, 9, 10] }
  };
  const SEASON_ORDER = ['winter', 'spring', 'summer', 'fall'];
  const LIFE_YEARS = 25;

  /* Illustrative climate presets. Monthly mean temperatures are rounded
     values loosely based on published 30-year normals; ground / groundwater
     values and aquifer supply are ROUGH ILLUSTRATIVE guesses, not site data. */
  const CLIMATES = {
    minneapolis: {
      id: 'minneapolis', name: 'Minneapolis', tag: 'Cold',
      monthly: [16.2, 20.6, 33.3, 47.1, 59.5, 69.7, 74.3, 71.8, 63.5, 49.5, 34.8, 22.0],
      sigma: 9, designHeat: -12, designCool: 92, latent: 0.12,
      groundTemp: 49, gwTemp: 49, gwSupply: 3000, k: 1.3
    },
    statecollege: {
      id: 'statecollege', name: 'State College, PA', tag: 'Mixed',
      monthly: [26.3, 27.5, 36.3, 47.9, 59.0, 67.2, 71.2, 69.2, 62.6, 51.5, 40.4, 30.0],
      sigma: 8, designHeat: 5, designCool: 88, latent: 0.15,
      groundTemp: 50, gwTemp: 50, gwSupply: 2200, k: 1.4
    },
    miami: {
      id: 'miami', name: 'Miami', tag: 'Hot & humid',
      monthly: [68.6, 70.7, 73.1, 76.7, 80.1, 82.8, 84.1, 84.2, 83.0, 80.1, 74.8, 71.2],
      sigma: 5, designHeat: 43, designCool: 92, latent: 0.35,
      groundTemp: 79, gwTemp: 79, gwSupply: 3500, k: 1.5
    },
    phoenix: {
      id: 'phoenix', name: 'Phoenix', tag: 'Hot & dry',
      monthly: [56.8, 59.9, 66.3, 73.2, 82.0, 91.4, 95.5, 94.4, 89.2, 77.4, 65.1, 55.8],
      sigma: 11, designHeat: 36, designCool: 114, latent: 0.04,
      groundTemp: 78, gwTemp: 78, gwSupply: 1800, k: 1.2
    }
  };

  function makeDefaults(climateId) {
    const c = CLIMATES[climateId || 'statecollege'];
    return {
      climate: c.id,
      season: 'winter',
      tempShift: 0,              // degF what-if shift of the whole year
      sqft: 500000,              // terminal floor area
      heatMult: 1.0,             // heating demand multiplier
      coolMult: 1.0,             // cooling demand multiplier
      elecPrice: 0.14,           // $/kWh (EIA STEO: US commercial average 14.00 c/kWh for 2026)
      gasPrice: 1.07,            // $/therm (EIA: US commercial 2025 $10.98/Mcf / 10.26 therm per Mcf)
      costMult: 1.0,             // global installation-cost multiplier
      incentive: 0,              // % grants / incentives
      creditConv: true,          // credit avoided boiler/chiller purchase
      landAvail: 20,             // acres available near terminal
      groundTemp: c.groundTemp,  // undisturbed ground temperature, degF
      gwTemp: c.gwTemp,          // groundwater temperature, degF
      plantCostPerTon: 2000,     // $/ton heat pump plant (all geothermal options)
      sizePct: 80,               // ground system sized for this % of peak load; existing boiler/chiller covers the rest
      open: { auto: true, flow: 1500, supply: c.gwSupply, dT: 10, kwPer100: 3.5,
              wellCost: 100000, wellYield: 500, hxCostPerGpm: 350, fixedCost: 150000, instAdj: 0 },
      closed: { auto: true, bores: 300, depth: 500, spacing: 25, k: c.k,
                costPerFt: 15, costPerBore: 1500, fixedCost: 40000, instAdj: 0 },
      hybrid: { openShare: 50, integration: 120000 },
      adv: {
        UAh: 0.70, UAc: 0.70,    // Btu/h per ft2 per degF (envelope + ventilation + internal gains); calibrated to Louisville airport
        Tbh: 55, Tbc: 60,        // balance temperatures, degF
        sizing: 1.15,            // design-load safety margin
        etaH: 0.50, etaC: 0.45,  // fraction of Carnot COP achieved (heat pump / water-cooled chiller)
        etaAir: 0.33,            // same, for the air-cooled baseline chiller
        supplyT: 110, chwT: 44,  // hot-water supply and chilled-water temperatures, degF
        condApproach: 8,         // water-cooled condenser approach above loop temp, degF
        airApproach: 20,         // air-cooled condenser approach above outdoor temp, degF
        hxApproach: 3,           // plate heat exchanger approach, degF
        boilerEff: 0.85,
        eftMin: 30, eftMax: 90,  // allowed loop temperatures, degF
        loopKw100: 1.2,          // closed-loop circulation pump kW per 100 gpm
        convCoolPerTon: 1800, convHeatPerMBH: 60,
        omPlant: 0.015, omOpen: 0.035, omClosed: 0.003, omConv: 0.025,
        gridLbPerKwh: 0.823, gasLbPerTherm: 11.70
      }
    };
  }

  /* ---------- small math helpers ---------- */
  const sum = a => a.reduce((s, x) => s + x, 0);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const zeros = () => new Array(12).fill(0);
  const pdf = z => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  function cdf(z) { // Abramowitz-Stegun erf approximation
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }
  /* Expected degree-hours beyond a balance temperature when the hourly
     temperature in a month is ~ Normal(mean, sigma). */
  function degreeHours(mean, sigma, base, hours, heating) {
    const z = heating ? (base - mean) / sigma : (mean - base) / sigma;
    const e = sigma * (pdf(z) + z * cdf(z));   // E[(T-b)+] or E[(b-T)+]
    const frac = cdf(z);                        // fraction of hours in that mode
    return { degF: e, degH: e * hours, frac, condExcess: frac > 1e-6 ? e / frac : 0 };
  }

  /* ---------- heat pump / chiller performance (Carnot-fraction model) ---------- */
  function copHeat(p, sourceF) {
    const sink = p.adv.supplyT;
    const lift = Math.max(15, sink - sourceF);
    return clamp(p.adv.etaH * (sink + 459.67) / lift, 2.0, 6.5);
  }
  function copCool(p, condF) {
    const lift = Math.max(12, condF - p.adv.chwT);
    return clamp(p.adv.etaC * (p.adv.chwT + 459.67) / lift, 2.0, 6.0);
  }
  function copBaselineCool(p, outdoorF) {
    const lift = Math.max(12, outdoorF + p.adv.airApproach - p.adv.chwT);
    return clamp(p.adv.etaAir * (p.adv.chwT + 459.67) / lift, 2.0, 5.0);
  }

  /* Effective (energy-weighted) 1/COP of the air-cooled baseline chiller over a month.
     COP depends on outdoor temperature, and efficiency is convex in temperature, so using the
     mean temperature would understate electricity. We integrate over the temperature distribution. */
  function effInvCop(p, mean, sigma, base) {
    const n = 240, lo = base, hi = Math.max(base + 1, mean + 6 * sigma), h = (hi - lo) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      const T = lo + (i + 0.5) * h, w = (T - base) * pdf((T - mean) / sigma) / sigma * h;
      num += w / copBaselineCool(p, T); den += w;
    }
    return den > 1e-12 ? num / den : 1 / copBaselineCool(p, base + 1);
  }

  /* ---------- climate / season helpers ---------- */
  function seasonTypicalTemp(climateId, season) {
    const c = CLIMATES[climateId];
    return sum(SEASONS[season].months.map(m => c.monthly[m])) / 3;
  }

  /* ---------- building thermal demand ---------- */
  function buildLoads(p) {
    const c = CLIMATES[p.climate], a = p.adv;
    const heatUA = a.UAh * p.sqft * p.heatMult;
    const coolUA = a.UAc * p.sqft * p.coolMult * (1 + c.latent);
    const heat = zeros(), cool = zeros(), coolTemp = zeros(), coolInv = zeros(), hours = MONTH_HOURS;
    c.monthly.forEach((t0, m) => {
      const t = t0 + p.tempShift;
      const h = degreeHours(t, c.sigma, a.Tbh, hours[m], true);
      const k = degreeHours(t, c.sigma, a.Tbc, hours[m], false);
      heat[m] = heatUA * h.degH;                  // Btu thermal
      cool[m] = coolUA * k.degH;                  // Btu thermal
      coolTemp[m] = a.Tbc + k.condExcess;         // mean outdoor temp while cooling
      coolInv[m] = effInvCop(p, t, c.sigma, a.Tbc); // energy-weighted 1/COP of the air-cooled baseline chiller
    });
    const heatPeak = Math.max(heatUA * (a.Tbh - c.designHeat), 0.5 * a.UAh * p.sqft * p.heatMult * 10) * a.sizing;
    const coolPeak = Math.max(coolUA * (c.designCool - a.Tbc), 3 * p.sqft * p.coolMult) * a.sizing;
    return { heat, cool, coolTemp, coolInv, heatPeak, coolPeak, heatUA, coolUA };
  }

  /* instantaneous load (Btu/h) at an outdoor temperature */
  function loadsAt(p, T) {
    const c = CLIMATES[p.climate], a = p.adv;
    return {
      heat: a.UAh * p.sqft * p.heatMult * Math.max(0, a.Tbh - T),
      cool: a.UAc * p.sqft * p.coolMult * (1 + c.latent) * Math.max(0, T - a.Tbc)
    };
  }

  const emptySub = () => ({
    active: false, heatCov: zeros(), coolCov: zeros(), eHeat: zeros(), eCool: zeros(), ePump: zeros(),
    copH: zeros(), copC: zeros(), capCovH: 0, capCovC: 0, source: 0, land: 0, om: 0, peakKW: 0,
    warnings: [], inst: () => ({ covHeat: 0, covCool: 0, eKW: 0, copH: 0, copC: 0 })
  });

  /* ---------- OPEN-LOOP subsystem (serves `share` of the building load) ---------- */
  function openSub(p, L, share, auto) {
    const s = emptySub();
    if (share <= 0) return s;
    const o = p.open, a = p.adv;
    s.active = true;
    const srcF = p.gwTemp - a.hxApproach - o.dT / 2;
    const condF = p.gwTemp + a.hxApproach + o.dT / 2 + a.condApproach;
    const copH = copHeat(p, srcF), copC = copCool(p, condF);
    const PH = L.heatPeak * share, PC = L.coolPeak * share;
    const ds = p.sizePct / 100;
    const gpmH = PH * (1 - 1 / copH) / (WATER_BTU_PER_GPM_F * o.dT);   // flow for 100% of peak heating
    const gpmC = PC * (1 + 1 / copC) / (WATER_BTU_PER_GPM_F * o.dT);
    const req = ds * Math.max(gpmH, gpmC);                              // flow for the design share of peak
    const chosen = auto ? req : o.flow;
    const eff = Math.min(chosen, o.supply);          // limited by aquifer supply
    const cH = Math.min(1, eff / gpmH), cC = Math.min(1, eff / gpmC);
    const covH = 1 - Math.pow(1 - cH, 2), covC = 1 - Math.pow(1 - cC, 2); // linear load-duration curve
    s.capCovH = cH; s.capCovC = cC;
    const Pd = o.kwPer100 * eff / 100;                 // pump kW at design flow
    for (let m = 0; m < 12; m++) {
      const hc = L.heat[m] * share * covH, cc = L.cool[m] * share * covC;
      s.heatCov[m] = hc; s.coolCov[m] = cc;
      s.eHeat[m] = hc / BTU_PER_KWH / copH;
      s.eCool[m] = cc / BTU_PER_KWH / copC;
      s.copH[m] = copH; s.copC[m] = copC;
      const q = (hc * (1 - 1 / copH) + cc * (1 + 1 / copC)) / MONTH_HOURS[m];
      const r = eff > 0 ? Math.min(1, q / (WATER_BTU_PER_GPM_F * o.dT) / eff) : 0;
      s.ePump[m] = Pd * Math.pow(r, 1.5) * MONTH_HOURS[m];
    }
    const nProd = Math.max(1, Math.ceil(eff / o.wellYield));
    const wells = 2 * nProd;                           // production + injection
    s.wells = wells; s.reqFlow = req; s.designFlow = eff; s.chosenFlow = chosen;
    s.gpmH = gpmH; s.gpmC = gpmC; s.pumpKWDesign = Pd;
    s.source = (wells * o.wellCost + eff * o.hxCostPerGpm + o.fixedCost) * (1 + o.instAdj / 100);
    s.om = s.source * a.omOpen;
    s.land = 0.3 + 0.12 * wells;
    s.peakKW = Math.max(PH * cH / BTU_PER_KWH / copH, PC * cC / BTU_PER_KWH / copC) + Pd;
    if (chosen > o.supply) s.warnings.push('Requested flow (' + Math.round(chosen) + ' gpm) exceeds the sustainable groundwater supply (' + Math.round(o.supply) + ' gpm).');
    if (Math.min(cH, cC) < ds * 0.995) s.warnings.push('Water flow only covers ' + Math.round(100 * Math.min(cH, cC)) + '% of peak load (target ' + Math.round(100 * ds) + '%); the rest runs on the backup boiler/chiller.');
    s.copHval = copH; s.copCval = copC; s.wellCount = wells;
    s.inst = function (heatBtuh, coolBtuh) {
      const capH = cH * PH, capC = cC * PC;
      const hc = Math.min(heatBtuh, capH), cc = Math.min(coolBtuh, capC);
      const q = hc * (1 - 1 / copH) + cc * (1 + 1 / copC);
      const r = eff > 0 ? Math.min(1, q / (WATER_BTU_PER_GPM_F * o.dT) / eff) : 0;
      const pump = (hc + cc) > 0 ? Pd * Math.pow(r, 1.5) : 0;
      return { covHeat: hc, covCool: cc, eKW: hc / BTU_PER_KWH / copH + cc / BTU_PER_KWH / copC + pump, copH, copC, pumpKW: pump, flow: r * eff };
    };
    return s;
  }

  /* ---------- CLOSED-LOOP subsystem ---------- */
  const R_BORE = 0.12; // h*ft*degF/Btu, borehole thermal resistance (fixed assumption)
  function gFactor(N, spacing) { return 1.6 + 0.25 * Math.log(Math.max(N, 1)) * Math.pow(20 / spacing, 1.2); }

  function closedSub(p, L, share, auto, boresManual) {
    const s = emptySub();
    if (share <= 0) return s;
    const cl = p.closed, a = p.adv, Tg = p.groundTemp, D = cl.depth, sp = cl.spacing, k = cl.k;
    s.active = true;
    const PH = L.heatPeak * share, PC = L.coolPeak * share;
    const heat = L.heat.map(x => x * share), cool = L.cool.map(x => x * share);
    const copHn = copHeat(p, Tg - 3), copCn = copCool(p, Tg + 3 + a.condApproach);
    const annExt = sum(heat) * (1 - 1 / copHn), annRej = sum(cool) * (1 + 1 / copCn);
    const ds = p.sizePct / 100;
    const copHd = copHeat(p, a.eftMin - 3), copCd = copCool(p, a.eftMax + 3 + a.condApproach);
    const PHg = PH * (1 - 1 / copHd), PCr = PC * (1 + 1 / copCd);
    const Nmax = clamp(Math.floor(p.landAvail * 43560 / (sp * sp)), 1, 4000);

    const calc = N => {
      const Lft = N * D, Rtot = gFactor(N, sp) / (2 * Math.PI * k) + R_BORE;
      const imb = (annRej - annExt) / Lft / 1000;                     // kBtu/ft/yr, + = heat added to ground
      const drift = clamp(0.06 * (1.3 / k) * imb, -15, 15);          // long-term ground temperature drift
      const Tge = Tg + drift;
      return { N, Lft, Rtot, imb, drift, Tge,
               qh: Math.max(0, Tge - a.eftMin) / Rtot, qc: Math.max(0, a.eftMax - Tge) / Rtot };
    };
    let N, landLimited = false, autoN;
    {
      N = Math.max(1, Math.ceil(ds * PHg / 40 / D));
      let prev = N;
      for (let i = 0; i < 25; i++) {
        const c = calc(N);
        const Lreq = ds * Math.max(PHg / Math.max(c.qh, 1e-3), PCr / Math.max(c.qc, 1e-3));
        const Nn = Math.max(1, Math.ceil(Lreq / D));
        if (Nn === N) break;
        prev = N; N = Nn > N ? Math.min(Nn, N + Math.max(1, Math.ceil(0.5 * (Nn - N)))) : Math.max(Nn, N - Math.max(1, Math.ceil(0.5 * (N - Nn))));
      }
      const c = calc(N);
      const Lreq = ds * Math.max(PHg / Math.max(c.qh, 1e-3), PCr / Math.max(c.qc, 1e-3));
      N = Math.max(N, Math.ceil(Lreq / D));
      if (N > Nmax) { N = Nmax; landLimited = true; }
      autoN = N;
    }
    if (!auto) { N = Math.max(1, Math.round(boresManual)); landLimited = false; }
    const c = calc(N);
    const cH = Math.min(1, c.qh * c.Lft / PHg), cC = Math.min(1, c.qc * c.Lft / PCr);
    const covH = 1 - Math.pow(1 - cH, 2), covC = 1 - Math.pow(1 - cC, 2);
    s.capCovH = cH; s.capCovC = cC;

    // Monthly simulation: loop temperature responds to the net heat exchanged with the ground
    const Tloop = new Array(12).fill(c.Tge);
    const tons = Math.max(PHg, PCr) / 12000, gpmLoop = 3 * tons, Pd = a.loopKw100 * gpmLoop / 100;
    const ext = zeros(), rej = zeros();
    for (let it = 0; it < 6; it++) {
      for (let m = 0; m < 12; m++) {
        const cH_ = copHeat(p, Tloop[m] - 3), cC_ = copCool(p, Tloop[m] + 3 + a.condApproach);
        const hc = heat[m] * covH, cc = cool[m] * covC;
        ext[m] = hc * (1 - 1 / cH_); rej[m] = cc * (1 + 1 / cC_);
        Tloop[m] = clamp(c.Tge - c.Rtot * (ext[m] - rej[m]) / (MONTH_HOURS[m] * c.Lft), a.eftMin, a.eftMax);
        s.copH[m] = cH_; s.copC[m] = cC_;
        s.heatCov[m] = hc; s.coolCov[m] = cc;
      }
    }
    for (let m = 0; m < 12; m++) {
      s.eHeat[m] = s.heatCov[m] / BTU_PER_KWH / s.copH[m];
      s.eCool[m] = s.coolCov[m] / BTU_PER_KWH / s.copC[m];
      const r = Math.min(1, (ext[m] + rej[m]) / MONTH_HOURS[m] / Math.max(PHg, PCr, 1));
      s.ePump[m] = Pd * Math.pow(r, 1.5) * MONTH_HOURS[m];
    }
    s.loopTemp = Tloop.slice();
    s.autoBores = autoN; s.bores = N; s.fieldFt = c.Lft; s.depth = D; s.drift = c.drift; s.Tge = c.Tge; s.imbalance = c.imb;
    s.qhMax = c.qh; s.qcMax = c.qc; s.Rtot = c.Rtot; s.maxBores = Nmax; s.landLimited = landLimited;
    s.pumpKWDesign = Pd;
    s.source = (c.Lft * cl.costPerFt + N * cl.costPerBore + cl.fixedCost) * (1 + cl.instAdj / 100);
    s.om = s.source * a.omClosed;
    s.land = N * sp * sp / 43560;                 // borefield footprint, acres (grid of spacing x spacing)
    s.peakKW = Math.max(PH * cH / BTU_PER_KWH / copHd, PC * cC / BTU_PER_KWH / copCd) + Pd;
    if (landLimited) s.warnings.push('Land limits the borefield to ' + N + ' boreholes (' + Math.round(p.landAvail) + ' acres available); the field is undersized for peak load.');
    if (Math.min(cH, cC) < ds * 0.995) s.warnings.push('Borefield only covers ' + Math.round(100 * Math.min(cH, cC)) + '% of peak load (target ' + Math.round(100 * ds) + '%); the rest runs on the backup boiler/chiller.');
    if (Math.abs(c.drift) >= 5) s.warnings.push('Heating/cooling imbalance shifts ground temperature by about ' + (c.drift > 0 ? '+' : '') + c.drift.toFixed(1) + ' °F over time, which hurts efficiency.');
    s.inst = function (heatBtuh, coolBtuh) {
      const hc = Math.min(heatBtuh, cH * PH), cc = Math.min(coolBtuh, cC * PC);
      let T = c.Tge, cHi = copHn, cCi = copCn;
      for (let i = 0; i < 4; i++) {
        cHi = copHeat(p, T - 3); cCi = copCool(p, T + 3 + a.condApproach);
        T = clamp(c.Tge - c.Rtot * (hc * (1 - 1 / cHi) - cc * (1 + 1 / cCi)) / c.Lft, a.eftMin, a.eftMax);
      }
      const r = Math.min(1, (hc * (1 - 1 / cHi) + cc * (1 + 1 / cCi)) / Math.max(PHg, PCr, 1));
      const pump = (hc + cc) > 0 ? Pd * Math.pow(r, 1.5) : 0;
      return { covHeat: hc, covCool: cc, eKW: hc / BTU_PER_KWH / cHi + cc / BTU_PER_KWH / cCi + pump, copH: cHi, copC: cCi, pumpKW: pump, loopT: T };
    };
    return s;
  }

  /* ---------- assemble a full system from one or two subsystems ---------- */
  function conventionalCapex(p, L) {
    return (L.coolPeak / 12000) * p.adv.convCoolPerTon + (L.heatPeak / 1000) * p.adv.convHeatPerMBH;
  }
  
  function seasonSums(arr) {
    const o = {};
    SEASON_ORDER.forEach(k => { o[k] = sum(SEASONS[k].months.map(m => arr[m])); });
    return o;
  }

  function assemble(p, L, id, name, subs, extras, shares) {
    const a = p.adv;
    let sys_capH = 0, sys_capC = 0;
    const eHeat = zeros(), eCool = zeros(), ePump = zeros(), eBack = zeros(), gas = zeros();
    const heatCov = zeros(), coolCov = zeros(), backH = zeros(), backC = zeros();
    for (let m = 0; m < 12; m++) {
      subs.forEach(s => {
        if (!s.active) return;
        eHeat[m] += s.eHeat[m]; eCool[m] += s.eCool[m]; ePump[m] += s.ePump[m];
        heatCov[m] += s.heatCov[m]; coolCov[m] += s.coolCov[m];
      });
      backH[m] = Math.max(0, L.heat[m] - heatCov[m]);   // uncovered load -> existing boiler
      backC[m] = Math.max(0, L.cool[m] - coolCov[m]);   // uncovered load -> existing chiller
      gas[m] = backH[m] / a.boilerEff / BTU_PER_THERM;
      eBack[m] = backC[m] / BTU_PER_KWH * L.coolInv[m];
    }
    const elec = eHeat.map((x, m) => x + eCool[m] + ePump[m] + eBack[m]);
    const energyMWh = elec.map((x, m) => x / 1000 + gas[m] * KWH_PER_THERM / 1000);
    const cost = elec.map((x, m) => x * p.elecPrice + gas[m] * p.gasPrice);

    const capH = sum(subs.map((s, i) => s.active ? s.capCovH * shares[i] : 0));
    const capC = sum(subs.map((s, i) => s.active ? s.capCovC * shares[i] : 0));
    const plant = Math.max(capH * L.heatPeak, capC * L.coolPeak) / 12000 * p.plantCostPerTon * p.costMult;
    sys_capH = capH; sys_capC = capC;
    const source = sum(subs.map(s => s.source)) * p.costMult + (extras || 0) * p.costMult;
    const gross = plant + source;
    const incentive = gross * p.incentive / 100;
    // Credit for conventional equipment you no longer need, scaled by how much peak load geothermal truly covers
    const convHeat = (L.heatPeak / 1000) * a.convHeatPerMBH, convCool = (L.coolPeak / 12000) * a.convCoolPerTon;
    const credit = p.creditConv ? convHeat * capH + convCool * capC : 0;
    const net = gross - incentive - credit;
    const om = plant * a.omPlant + sum(subs.map(s => s.om)) * p.costMult + (extras || 0) * p.costMult * a.omClosed;
    const elecKWh = sum(elec), gasTherm = sum(gas);
    const costElec = elecKWh * p.elecPrice, costGas = gasTherm * p.gasPrice;
    const opex = costElec + costGas + om;
    const sys = {
      id, name, subs, monthly: { elec, gas, eHeat, eCool, ePump, eBack, energyMWh, cost,
        copH: subs.reduce((arr, s, i) => arr.map((v, m) => v + (s.active ? s.copH[m] * s.heatCov[m] : 0)), zeros()),
        copC: zeros() },
      heatCov, coolCov, backH, backC,
      annual: { elecKWh, gasTherm, energyMWh: sum(energyMWh), hpHeatKWh: sum(eHeat), hpCoolKWh: sum(eCool),
                pumpKWh: sum(ePump), backupElecKWh: sum(eBack), costElec, costGas, costOM: om, costPumping: sum(ePump) * p.elecPrice, opex,
                heatDemandMBtu: sum(L.heat) / 1e6, coolDemandMBtu: sum(L.cool) / 1e6,
                heatCoverage: sum(L.heat) > 0 ? sum(heatCov) / sum(L.heat) : 1,
                coolCoverage: sum(L.cool) > 0 ? sum(coolCov) / sum(L.cool) : 1 },
      season: { energyMWh: seasonSums(energyMWh), cost: seasonSums(cost), elecKWh: seasonSums(elec) },
      capex: { plant, source, gross, incentive, credit, net },
      peakCoverage: { heat: sys_capH, cool: sys_capC },
      land: sum(subs.map(s => s.active ? s.land : 0)),
      peakKW: sum(subs.map(s => s.active ? s.peakKW : 0)),
      warnings: subs.reduce((w, s) => w.concat(s.warnings), []),
      co2: (elecKWh * a.gridLbPerKwh + gasTherm * a.gasLbPerTherm) / 2000
    };
    // seasonal COPs (energy-weighted)
    const hs = sum(heatCov), cs = sum(coolCov);
    sys.annual.seasonalCopHeat = sum(eHeat) > 0 ? hs / BTU_PER_KWH / sum(eHeat) : 0;
    sys.annual.seasonalCopCool = sum(eCool) > 0 ? cs / BTU_PER_KWH / sum(eCool) : 0;
    for (let m = 0; m < 12; m++) {
      sys.monthly.copH[m] = eHeat[m] > 0 ? heatCov[m] / BTU_PER_KWH / eHeat[m] : null;
      sys.monthly.copC[m] = eCool[m] > 0 ? coolCov[m] / BTU_PER_KWH / eCool[m] : null;
    }
    return sys;
  }

  function finishVsBaseline(sys, base) {
    sys.savings = base.annual.opex - sys.annual.opex;
    sys.savingsPct = base.annual.opex > 0 ? sys.savings / base.annual.opex : 0;
    const net = sys.capex.net;
    sys.payback = sys.savings <= 0 ? Infinity : (net <= 0 ? 0 : net / sys.savings);
    sys.cumulative = [];
    for (let t = 0; t <= 30; t++) sys.cumulative.push(-net + sys.savings * t);
    sys.lifecycleNet = sys.savings * LIFE_YEARS - net;
    sys.energySavedMWh = base.annual.energyMWh - sys.annual.energyMWh;
    sys.energySavedPct = base.annual.energyMWh > 0 ? sys.energySavedMWh / base.annual.energyMWh : 0;
    sys.co2Avoided = base.co2 - sys.co2;
    sys.seasonSavings = {};
    SEASON_ORDER.forEach(k => { sys.seasonSavings[k] = base.season.cost[k] - sys.season.cost[k]; });
    return sys;
  }

  /* ---------- the traditional baseline: gas boiler + air-cooled chiller ---------- */
  function baseline(p, L) {
    const a = p.adv;
    const gas = L.heat.map(x => x / a.boilerEff / BTU_PER_THERM);
    const eCool = L.cool.map((x, m) => x / BTU_PER_KWH * L.coolInv[m]);
    const elec = eCool.slice();
    const energyMWh = elec.map((x, m) => x / 1000 + gas[m] * KWH_PER_THERM / 1000);
    const cost = elec.map((x, m) => x * p.elecPrice + gas[m] * p.gasPrice);
    const capexConv = conventionalCapex(p, L);
    const om = capexConv * a.omConv;
    const elecKWh = sum(elec), gasTherm = sum(gas);
    const opex = elecKWh * p.elecPrice + gasTherm * p.gasPrice + om;
    const PCcop = copBaselineCool(p, CLIMATES[p.climate].designCool);
    return {
      id: 'baseline', name: 'Traditional HVAC', subs: [],
      monthly: { elec, gas, eHeat: zeros(), eCool, ePump: zeros(), eBack: zeros(), energyMWh, cost, copH: zeros(), copC: zeros() },
      annual: { elecKWh, gasTherm, energyMWh: sum(energyMWh), hpHeatKWh: 0, hpCoolKWh: sum(eCool), pumpKWh: 0, backupElecKWh: 0,
                costElec: elecKWh * p.elecPrice, costGas: gasTherm * p.gasPrice, costOM: om, costPumping: 0, opex,
                heatDemandMBtu: sum(L.heat) / 1e6, coolDemandMBtu: sum(L.cool) / 1e6, heatCoverage: 0, coolCoverage: 0,
                seasonalCopHeat: a.boilerEff, seasonalCopCool: sum(L.cool) / BTU_PER_KWH / Math.max(1, sum(eCool)) },
      season: { energyMWh: seasonSums(energyMWh), cost: seasonSums(cost), elecKWh: seasonSums(elec) },
      capex: { plant: capexConv, source: 0, gross: capexConv, incentive: 0, credit: 0, net: capexConv },
      land: 0, peakKW: L.coolPeak / BTU_PER_KWH / PCcop, warnings: [],
      co2: (elecKWh * a.gridLbPerKwh + gasTherm * a.gasLbPerTherm) / 2000,
      savings: 0, payback: null, cumulative: null
    };
  }

  /* ---------- instantaneous "right now" snapshot at an outdoor temperature ---------- */
  function snapshot(p, res, T) {
    const a = p.adv, ld = loadsAt(p, T);
    const out = { T, heat: ld.heat, cool: ld.cool, mode: ld.heat > 0 ? 'heating' : (ld.cool > 0 ? 'cooling' : 'idle') };
    const baseElec = ld.cool / BTU_PER_KWH / copBaselineCool(p, T);
    const baseGas = ld.heat / a.boilerEff / BTU_PER_THERM;                 // therm/h
    const mk = (parts, shares) => {
      let eKW = 0, covH = 0, covC = 0, copH = 0, copC = 0, pump = 0;
      parts.forEach((s, i) => {
        if (!s.active) return;
        const r = s.inst(ld.heat * shares[i], ld.cool * shares[i]);
        eKW += r.eKW; covH += r.covHeat; covC += r.covCool; pump += r.pumpKW || 0;
        copH += r.copH * r.covHeat; copC += r.copC * r.covCool;
      });
      const unH = Math.max(0, ld.heat - covH), unC = Math.max(0, ld.cool - covC);
      const gasTh = unH / a.boilerEff / BTU_PER_THERM;
      const bElec = unC / BTU_PER_KWH / copBaselineCool(p, T);
      const totalKW = eKW + bElec;
      return { elecKW: totalKW, gasTherm: gasTh, costPerHour: totalKW * p.elecPrice + gasTh * p.gasPrice,
               copH: covH > 0 ? copH / covH : null, copC: covC > 0 ? copC / covC : null, pumpKW: pump,
               coverage: (ld.heat + ld.cool) > 0 ? (covH + covC) / (ld.heat + ld.cool) : 1 };
    };
    out.baseline = { elecKW: baseElec, gasTherm: baseGas, costPerHour: baseElec * p.elecPrice + baseGas * p.gasPrice,
                     copH: a.boilerEff, copC: ld.cool > 0 ? ld.cool / BTU_PER_KWH / baseElec : null };
    out.open = mk([res.open.subs[0]], [1]);
    out.closed = mk([res.closed.subs[0]], [1]);
    const x = p.hybrid.openShare / 100;
    out.hybrid = mk(res.hybrid.subs, [x, 1 - x]);
    return out;
  }

  /* ---------- main entry ---------- */
  function computeAll(p) {
    const L = buildLoads(p);
    const base = baseline(p, L);
    const x = clamp(p.hybrid.openShare, 0, 100) / 100;

    const oS = openSub(p, L, 1, p.open.auto);
    const open = finishVsBaseline(assemble(p, L, 'open', 'Open-loop', [oS], 0, [1]), base);

    const cS = closedSub(p, L, 1, p.closed.auto, p.closed.bores);
    const closed = finishVsBaseline(assemble(p, L, 'closed', 'Closed-loop', [cS], 0, [1]), base);

    const hO = openSub(p, L, x, true), hC = closedSub(p, L, 1 - x, true, 0);
    const hybrid = finishVsBaseline(assemble(p, L, 'hybrid', 'Hybrid', [hO, hC], p.hybrid.integration, [x, 1 - x]), base);
    hybrid.share = { open: x, closed: 1 - x };
    hybrid.warnings = hybrid.warnings.map(w => w);

    const res = { loads: L, baseline: base, open, closed, hybrid };
    res.params = p;
    res.snapshot = null;
    res.bestBy = bestBy(res);
    return res;
  }

  function bestBy(res) {
    const sys = [res.open, res.closed, res.hybrid];
    const pick = (fn, lower) => sys.reduce((b, s) => (lower ? fn(s) < fn(b) : fn(s) > fn(b)) ? s : b, sys[0]).id;
    return {
      payback: pick(s => s.payback, true),
      lifecycle: pick(s => s.lifecycleNet, false),
      energy: pick(s => s.annual.energyMWh, true),
      capex: pick(s => s.capex.net, true),
      opex: pick(s => s.annual.opex, true),
      land: pick(s => s.land, true)
    };
  }

  /* "Which wins where?" - rerun every climate preset at its own site conditions,
     keeping the user's building size, prices and system settings. */
  function climateMatrix(p) {
    return Object.keys(CLIMATES).map(id => {
      const c = CLIMATES[id];
      const q = JSON.parse(JSON.stringify(p));
      q.climate = id; q.tempShift = 0; q.groundTemp = c.groundTemp; q.gwTemp = c.gwTemp;
      q.open.supply = c.gwSupply; q.closed.k = c.k;
      const r = computeAll(q);
      return { id, name: c.name, tag: c.tag, open: r.open, closed: r.closed, hybrid: r.hybrid, baseline: r.baseline, best: r.bestBy };
    });
  }

  /* strip functions so results can be JSON-exported */
  function toPlain(res) {
    return JSON.parse(JSON.stringify(res, (k, v) => (typeof v === 'function' ? undefined : (v === Infinity ? 'no payback' : v))));
  }

  return { CLIMATES, SEASONS, SEASON_ORDER, MONTH_NAMES, MONTH_HOURS, LIFE_YEARS, BTU_PER_KWH, KWH_PER_THERM,
           makeDefaults, computeAll, snapshot, climateMatrix, seasonTypicalTemp, loadsAt, buildLoads,
           copHeat, copCool, copBaselineCool, degreeHours, toPlain };
});
