const E=require(require('path').join(__dirname,'..','js','engine.js'));
const p=E.makeDefaults('statecollege'); const r=E.computeAll(p);
const o=r.open.subs[0];
console.log(JSON.stringify({p, heat:r.loads.heat, cool:r.loads.cool, coolTemp:r.loads.coolTemp, heatPeak:r.loads.heatPeak, coolPeak:r.loads.coolPeak,
 base:{gas:r.baseline.annual.gasTherm, elec:r.baseline.annual.elecKWh, opex:r.baseline.annual.opex, om:r.baseline.annual.costOM, capex:r.baseline.capex.gross},
 open:{copH:o.copHval,copC:o.copCval,flow:o.designFlow,req:o.reqFlow,wells:o.wellCount,source:o.source,eHeat:r.open.annual.hpHeatKWh,eCool:r.open.annual.hpCoolKWh,pump:r.open.annual.pumpKWh,elec:r.open.annual.elecKWh,gas:r.open.annual.gasTherm,opex:r.open.annual.opex,om:r.open.annual.costOM,gross:r.open.capex.gross,net:r.open.capex.net,credit:r.open.capex.credit,plant:r.open.capex.plant,savings:r.open.savings,payback:r.open.payback,heatCov:r.open.annual.heatCoverage,coolCov:r.open.annual.coolCoverage}}));
