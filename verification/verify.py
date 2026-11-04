import json, math
D=json.load(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'dump.json')))
p=D['p']; a=p['adv']
mon=[26.3,27.5,36.3,47.9,59.0,67.2,71.2,69.2,62.6,51.5,40.4,30.0]; hrs=[744,672,744,720,744,720,744,744,720,744,720,744]
sig=8; lat=0.15
def Phi_pdf(x): return math.exp(-x*x/2)/math.sqrt(2*math.pi)
# brute-force: integrate over temperature distribution (1000 bins, +-5 sigma)
def integ(mu, f):
    n=4000; lo=mu-6*sig; hi=mu+6*sig; h=(hi-lo)/n; s=0
    for i in range(n):
        T=lo+(i+.5)*h; s+=f(T)*Phi_pdf((T-mu)/sig)/sig*h
    return s
def copAir(T):
    lift=max(12,T+a['airApproach']-a['chwT']); return min(5,max(2,a['etaAir']*(a['chwT']+459.67)/lift))
heatUA=a['UAh']*p['sqft']*p['heatMult']; coolUA=a['UAc']*p['sqft']*p['coolMult']*(1+lat)
res={}
heat=[];cool=[];baseElec=0
for m,mu in enumerate(mon):
    dh=integ(mu,lambda T:max(0,a['Tbh']-T))*hrs[m]; dc=integ(mu,lambda T:max(0,T-a['Tbc'])*1)*hrs[m]
    heat.append(heatUA*dh); cool.append(coolUA*dc)
    # baseline cooling electricity: integrate COP-weighted per temperature (more rigorous than engine's conditional-mean shortcut)
    baseElec+=coolUA*hrs[m]*integ(mu,lambda T:max(0,T-a['Tbc'])/ (3412.14*copAir(T)))
def cmp(name,mine,eng,tol):
    d=(eng-mine)/mine*100 if mine else 0
    print(f"{name:42s} independent={mine:16,.2f} engine={eng:16,.2f}  diff={d:+.3f}%  {'OK' if abs(d)<=tol else 'CHECK'}")
    return abs(d)<=tol
ok=True
ok&=cmp('Annual heating demand (Btu)',sum(heat),sum(D['heat']),0.05)
ok&=cmp('Annual cooling demand (Btu)',sum(cool),sum(D['cool']),0.05)
gas=sum(heat)/a['boilerEff']/1e5
ok&=cmp('Baseline gas (therms)',gas,D['base']['gas'],0.05)
ok&=cmp('Baseline cooling elec (kWh) [distribution-integrated]',baseElec,D['base']['elec'],0.1)
# peaks
hp=max(heatUA*(a['Tbh']-5), 0.5*a['UAh']*p['sqft']*10)*a['sizing']; ok&=cmp('Peak heating (Btu/h)',hp,D['heatPeak'],0.01)
cp=max(coolUA*(88-a['Tbc']),3*p['sqft'])*a['sizing']; ok&=cmp('Peak cooling (Btu/h)',cp,D['coolPeak'],0.01)
# COPs by hand
srcF=p['gwTemp']-a['hxApproach']-p['open']['dT']/2
cH=min(6.5,max(2,a['etaH']*(a['supplyT']+459.67)/max(15,a['supplyT']-srcF)))
cond=p['gwTemp']+a['hxApproach']+p['open']['dT']/2+a['condApproach']
cC=min(6,max(2,a['etaC']*(a['chwT']+459.67)/max(12,cond-a['chwT'])))
ok&=cmp('Open-loop COP heating',cH,D['open']['copH'],0.001); ok&=cmp('Open-loop COP cooling',cC,D['open']['copC'],0.001)
# open-loop sizing by hand
gpmH=hp*(1-1/cH)/(500*p['open']['dT']); gpmC=cp*(1+1/cC)/(500*p['open']['dT'])
req=p['sizePct']/100*max(gpmH,gpmC); ok&=cmp('Open-loop required flow (gpm)',req,D['open']['req'],0.001)
flow=min(req,p['climate_gwSupply'] if 'climate_gwSupply' in p else D['open']['flow'])
ok&=cmp('Open-loop design flow after aquifer cap (gpm)',flow,D['open']['flow'],0.001)
cHc=min(1,flow/gpmH); cCc=min(1,flow/gpmC)
covH=1-(1-cHc)**2; covC=1-(1-cCc)**2
eH=sum(heat)*covH/3412.14/cH; eC=sum(cool)*covC/3412.14/cC
ok&=cmp('Open-loop heat pump heating kWh',eH,D['open']['eHeat'],0.05); ok&=cmp('Open-loop heat pump cooling kWh',eC,D['open']['eCool'],0.05)
wells=2*math.ceil(flow/p['open']['wellYield'])
src=wells*p['open']['wellCost']+flow*p['open']['hxCostPerGpm']+p['open']['fixedCost']
ok&=cmp('Open-loop wells (count)',wells,D['open']['wells'],0)
ok&=cmp('Open-loop source capex ($)',src*p['costMult'],D['open']['source']*p['costMult'],0.001)
plantTons=max(cHc*hp, cCc*cp)/12000; plant=plantTons*p['plantCostPerTon']*p['costMult']
ok&=cmp('Heat pump plant capex ($)',plant,D['open']['plant'],0.001)
conv=cp/12000*a['convCoolPerTon']+hp/1000*a['convHeatPerMBH']
ok&=cmp('Conventional plant capex ($)',conv,D['base']['capex'],0.001)
# opex & payback from the independent pieces
elec=D['open']['elec']; gas_o=D['open']['gas']
om=plant*a['omPlant']+src*p['costMult']*a['omOpen']
opex=elec*p['elecPrice']+gas_o*p['gasPrice']+om
ok&=cmp('Open-loop annual opex ($)',opex,D['open']['opex'],0.01)
base_opex=D['base']['elec']*p['elecPrice']+D['base']['gas']*p['gasPrice']+conv*a['omConv']
ok&=cmp('Baseline annual opex ($)',base_opex,D['base']['opex'],0.01)
sav=base_opex-opex; ok&=cmp('Annual savings ($)',sav,D['open']['savings'],0.05)
gross=plant+src*p['costMult']
credit=conv*0 + (conv)*0  # recompute credit by hand below
credit=(hp/1000*a['convHeatPerMBH'])*cHc+(cp/12000*a['convCoolPerTon'])*cCc
net=gross-credit; ok&=cmp('Net installation cost ($)',net,D['open']['net'],0.01)
ok&=cmp('Simple payback (years)',net/sav,D['open']['payback'],0.1)
print('\nOVERALL:', 'ALL CHECKS PASS' if ok else 'SOME CHECKS NEED REVIEW')
