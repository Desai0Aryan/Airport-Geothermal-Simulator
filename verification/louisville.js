const E=require(require('path').join(__dirname,'..','js','engine.js'));
E.CLIMATES.louisville={id:'louisville',name:'Louisville',tag:'validation',monthly:[35.7,39.5,48.4,59.0,68.3,76.4,79.9,78.9,72.0,60.3,48.5,39.6],sigma:8,designHeat:8,designCool:93,latent:0.2,groundTemp:61,gwTemp:61,gwSupply:3000,k:1.4};
const f=(x,d=0)=>Number(x).toLocaleString('en-US',{maximumFractionDigits:d});
for (const [label,mut] of [['defaults',p=>{}],['sized 100% of peak, 25ft spacing',p=>{p.sizePct=100;p.closed.spacing=25}],['sized 100%, 25ft, k=1.0',p=>{p.sizePct=100;p.closed.spacing=25;p.closed.k=1.0}]]) {
 const p=E.makeDefaults('louisville'); p.sqft=412766; p.landAvail=60; mut(p);
 const r=E.computeAll(p), c=r.closed, s=c.subs[0], b=r.baseline;
 console.log('\n['+label+']');
 console.log(' boreholes',s.bores,'x500ft =',f(s.fieldFt),'ft | land',f(c.land,1),'acres | gross cost $'+f(c.capex.gross),'| heat pump plant tons',f(c.capex.plant/p.plantCostPerTon/p.costMult));
 console.log(' baseline energy',f(b.annual.energyMWh),'MWh, opex $'+f(b.annual.opex),'| closed-loop energy',f(c.annual.energyMWh),'MWh ('+f(c.energySavedPct*100)+'% less site energy), opex $'+f(c.annual.opex));
 console.log(' annual savings $'+f(c.savings),'| peak heat tons',f(r.loads.heatPeak/12000),'cool tons',f(r.loads.coolPeak/12000),'| $/ton of ground loop (source only)', f(c.capex.source/(Math.max(r.loads.heatPeak,r.loads.coolPeak)*p.sizePct/100/12000)));
}
console.log('\nDOE case study: 648 boreholes x 500 ft = 324,000 ft, 9 acres, ~$22M total (incl. MEP upgrades, $10.6M FAA grant), ~40% less energy, ~$400,000/yr operating savings, 412,766 sq ft');
