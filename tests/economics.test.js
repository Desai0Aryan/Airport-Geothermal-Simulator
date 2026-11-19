const E=require('../js/engine.js');let n=0,f=0;
function ok(c,m){n++;if(!c){f++;console.log('FAIL',m);}}
const near=(a,b,t)=>Math.abs(a-b)<=(t||1e-6*Math.max(1,Math.abs(b)));
const p=E.makeDefaults('statecollege'),r=E.computeAll(p),e=E.economics(p,r);
ok(near(e.extra,e.gross-e.credit,0.01),'extra = gross - credit');
ok(near(e.geoCapex-e.tradCapex,e.extra,0.01),'geo - trad = extra');
ok(near(e.grant,e.gross*0.30,0.01),'grant = 30% of gross');
ok(near(e.noGrant.payback,e.extra/e.savings,1e-9),'no-grant payback');
ok(near(e.withGrant.payback,(e.extra-e.grant)/e.savings,1e-9),'with-grant payback');
ok(e.withGrant.payback<e.noGrant.payback,'grant shortens payback');
ok(near(e.savings,e.tradOpex-e.geoOpex,0.01),'savings = opex difference');
ok(e.noGrant.cumulative.length===31&&near(e.noGrant.cumulative[0],-e.extra,0.01),'cumulative starts at -extra');
const t=Math.ceil(e.noGrant.payback);ok(e.noGrant.cumulative[t]>=0&&e.noGrant.cumulative[t-1]<0,'cumulative crosses zero at payback');
ok(near(e.noGrant.npv,e.savings*e.annuityFactor-e.extra,0.01),'npv');
ok(e.noGrant.discPayback>e.noGrant.payback||!isFinite(e.noGrant.discPayback),'discounted payback longer');
const p0=E.makeDefaults('statecollege');p0.grantPct=0;const e0=E.economics(p0,E.computeAll(p0));
ok(near(e0.withGrant.payback,e0.noGrant.payback,1e-9),'0% grant equals no grant');
console.log(n-f+'/'+n+' economics tests passed');process.exit(f?1:0);
