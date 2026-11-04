const E=require(require('path').join(__dirname,'..','js','engine.js'));
E.CLIMATES.louisville={id:'louisville',name:'Louisville',tag:'validation',monthly:[35.7,39.5,48.4,59.0,68.3,76.4,79.9,78.9,72.0,60.3,48.5,39.6],sigma:8,designHeat:8,designCool:93,latent:0.2,groundTemp:61,gwTemp:61,gwSupply:3000,k:1.4};
const f=(x,d=0)=>Number(x).toLocaleString('en-US',{maximumFractionDigits:d});
for (const ua of [0.34,0.55,0.65,0.75,0.85]) for (const k of [1.4]) {
 const p=E.makeDefaults('louisville'); p.sqft=412766; p.landAvail=60; p.sizePct=100; p.closed.spacing=25; p.adv.UAh=ua; p.adv.UAc=ua; p.closed.k=k;
 const r=E.computeAll(p), c=r.closed, s=c.subs[0], b=r.baseline;
 console.log('UA',ua,'| bores',s.bores,'(target 648 incl ~20% spare => ~540 needed) | land@25ft',f(s.bores*625/43560,1),'ac | cooling tons',f(r.loads.coolPeak/12000),'=',f(412766/(r.loads.coolPeak/12000)),'sf/ton | savings $'+f(c.savings),'| site energy',f(c.energySavedPct*100)+'% less','| baseline opex $'+f(b.annual.opex));
}
