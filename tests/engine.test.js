// Run with: node tests/engine.test.js
const assert = require('assert');
const E = require('../js/engine.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const sum = a => a.reduce((s, x) => s + x, 0);
const run = (mut, climate) => { const p = E.makeDefaults(climate || 'statecollege'); if (mut) mut(p); return E.computeAll(p); };

t('no NaN/negative values in any climate or system', () => {
  Object.keys(E.CLIMATES).forEach(c => { const r = run(null, c);
    ['baseline', 'open', 'closed', 'hybrid'].forEach(k => {
      const a = r[k].annual; Object.keys(a).forEach(x => assert(Number.isFinite(a[x]) && a[x] >= -1e-6, c + ' ' + k + ' ' + x + '=' + a[x]));
      assert(Number.isFinite(r[k].capex.gross));
    }); });
});
t('colder weather raises heating demand, warmer raises cooling demand', () => {
  const base = run(), cold = run(p => p.tempShift = -10), warm = run(p => p.tempShift = 10);
  assert(sum(cold.loads.heat) > sum(base.loads.heat) && sum(warm.loads.heat) < sum(base.loads.heat));
  assert(sum(warm.loads.cool) > sum(base.loads.cool) && sum(cold.loads.cool) < sum(base.loads.cool));
  assert(cold.baseline.annual.opex !== base.baseline.annual.opex);
});
t('instantaneous load follows outdoor temperature', () => {
  const p = E.makeDefaults(); assert(E.loadsAt(p, 20).heat > E.loadsAt(p, 45).heat); assert(E.loadsAt(p, 95).cool > E.loadsAt(p, 75).cool);
  assert.strictEqual(E.loadsAt(p, 57).heat + E.loadsAt(p, 57).cool, 0);
});
t('bigger terminal scales demand and cost roughly linearly', () => {
  const a = run(), b = run(p => p.sqft *= 2);
  assert(Math.abs(sum(b.loads.heat) / sum(a.loads.heat) - 2) < 1e-9);
  assert(b.baseline.annual.opex > 1.8 * a.baseline.annual.opex);
});
t('electricity price changes cost but not energy', () => {
  const a = run(), b = run(p => p.elecPrice = 0.28);
  assert.strictEqual(Math.round(a.open.annual.elecKWh), Math.round(b.open.annual.elecKWh));
  assert(b.open.annual.costElec > 1.99 * a.open.annual.costElec);
});
t('thermal energy is conserved: covered + backup = demand', () => {
  const r = run(p => { p.open.supply = 600; });
  ['open', 'closed', 'hybrid'].forEach(k => { const s = r[k];
    assert(Math.abs(sum(s.heatCov) + sum(s.backH) - sum(r.loads.heat)) < 1, k + ' heat');
    assert(Math.abs(sum(s.coolCov) + sum(s.backC) - sum(r.loads.cool)) < 1, k + ' cool'); });
});
t('hybrid split sums to 100% and shares match the slider', () => {
  [0, 25, 70, 100].forEach(x => { const r = run(p => p.hybrid.openShare = x);
    assert(Math.abs(r.hybrid.share.open + r.hybrid.share.closed - 1) < 1e-12);
    assert.strictEqual(r.hybrid.subs[0].active, x > 0); assert.strictEqual(r.hybrid.subs[1].active, x < 100); });
});
t('hybrid does not double count: 100% open ~ open-loop energy, 0% ~ closed-loop energy', () => {
  const o = run(p => p.hybrid.openShare = 100), c = run(p => p.hybrid.openShare = 0);
  assert(Math.abs(o.hybrid.annual.elecKWh - o.open.annual.elecKWh) / o.open.annual.elecKWh < 1e-6);
  assert(Math.abs(c.hybrid.annual.elecKWh - c.closed.annual.elecKWh) / c.closed.annual.elecKWh < 1e-6);
  // never claims more demand served than exists
  const r = run(); assert(sum(r.hybrid.heatCov) <= sum(r.loads.heat) + 1);
});
t('hybrid is not automatically better: integration cost raises cost when no limit is hit', () => {
  const r = run(p => { p.open.supply = 9999; p.landAvail = 60; p.hybrid.openShare = 100; });
  assert(r.hybrid.capex.gross > r.open.capex.gross, 'integration cost must show up');
});
t('hybrid can win when groundwater is limited', () => {
  const r = run(p => { p.climate = 'phoenix'; });
  assert(r.hybrid.annual.heatCoverage + r.hybrid.annual.coolCoverage >= r.open.annual.heatCoverage + r.open.annual.coolCoverage);
});
t('limited aquifer reduces open-loop coverage and raises backup use', () => {
  const full = run(p => p.open.supply = 9999), lim = run(p => p.open.supply = 500);
  assert(lim.open.annual.coolCoverage < full.open.annual.coolCoverage && lim.open.annual.gasTherm > full.open.annual.gasTherm);
});
t('too few boreholes: lower efficiency/coverage than auto-sized', () => {
  const auto = run(), few = run(p => { p.closed.auto = false; p.closed.bores = 60; });
  assert(few.closed.annual.heatCoverage < auto.closed.annual.heatCoverage);
  assert(few.closed.capex.gross < auto.closed.capex.gross);
});
t('land use follows boreholes and spacing', () => {
  const a = run(p => { p.closed.auto = false; p.closed.bores = 100; p.closed.spacing = 20; }), b = run(p => { p.closed.auto = false; p.closed.bores = 100; p.closed.spacing = 30; });
  assert(b.closed.land > 2 * a.closed.land);
});
t('colder ground lowers heating COP; warmer groundwater raises it', () => {
  const p = E.makeDefaults(); assert(E.copHeat(p, 35) < E.copHeat(p, 55)); assert(E.copCool(p, 90) < E.copCool(p, 70));
});
t('payback = net cost / savings; negative savings gives no payback', () => {
  const r = run(); assert(Math.abs(r.open.payback - r.open.capex.net / r.open.savings) < 1e-9);
  const bad = run(p => { p.elecPrice = 0.3; p.gasPrice = 0.4; }); assert.strictEqual(bad.open.payback, Infinity);
});
t('incentives and cost multiplier move payback in the right direction', () => {
  const a = run(), g = run(p => p.incentive = 50), h = run(p => p.costMult = 1.5);
  assert(g.open.payback < a.open.payback && h.open.payback > a.open.payback);
});
t('season sliders: typical temps ordered sensibly in every climate', () => {
  Object.keys(E.CLIMATES).forEach(c => assert(E.seasonTypicalTemp(c, 'summer') > E.seasonTypicalTemp(c, 'winter')));
});
t('snapshot responds to temperature and stays finite', () => {
  const p = E.makeDefaults(), r = E.computeAll(p);
  const cold = E.snapshot(p, r, 10), hot = E.snapshot(p, r, 95), mild = E.snapshot(p, r, 57);
  assert.strictEqual(cold.mode, 'heating'); assert.strictEqual(hot.mode, 'cooling'); assert.strictEqual(mild.mode, 'idle');
  ['open', 'closed', 'hybrid'].forEach(k => { assert(cold[k].elecKW > 0 && hot[k].elecKW > 0 && mild[k].elecKW === 0); assert(Number.isFinite(cold[k].costPerHour)); });
  assert(cold.baseline.costPerHour > E.snapshot(p, r, 40).baseline.costPerHour);
});
t('climate matrix and JSON export work', () => {
  const m = E.climateMatrix(E.makeDefaults()); assert.strictEqual(m.length, 4);
  JSON.parse(JSON.stringify(E.toPlain(E.computeAll(E.makeDefaults()))));
});
console.log('\nAll ' + n + ' tests passed.');
