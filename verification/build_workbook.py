"""Builds Open-Loop_CBA.xlsx: every calculation as a live Excel formula.
Run: python3 verification/build_workbook.py  (needs openpyxl; then recalc with LibreOffice for cached values)
Simulator-output cells (blue italic) come from node verification/dump.js; everything else is a formula."""
import json, subprocess, sys, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
js = r"""
const E=require(process.argv[1]+'/js/engine.js');const p=E.makeDefaults('statecollege');const r=E.computeAll(p);const e=E.economics(p,r);const o=r.open,b=r.baseline;
console.log(JSON.stringify({req:o.subs[0].reqFlow,supply:p.open.supply,covH:o.peakCoverage.heat,covC:o.peakCoverage.cool,elec:o.annual.elecKWh,gas:o.annual.gasTherm,belec:b.annual.elecKWh,bgas:b.annual.gasTherm,
 sim:{gross:e.gross,plant:e.plant,source:e.source,credit:e.credit,backup:e.backup,extra:e.extra,grant:e.grant,opex:e.geoOpex,bopex:e.tradOpex,sav:e.savings,pn:e.noGrant.payback,pg:e.withGrant.payback,netg:e.withGrant.net,lifen:e.noGrant.lifeNet,lifeg:e.withGrant.lifeNet,npvn:e.noGrant.npv,npvg:e.withGrant.npv,dpn:e.noGrant.discPayback,dpg:e.withGrant.discPayback}}))"""
S = json.loads(subprocess.check_output(['node', '-e', js, root]).decode())
sim = S['sim']

wb = Workbook()
NAVY = '0F2A4A'; BLUE = '1F5FB4'
hfont = Font(bold=True, color='FFFFFF'); hfill = PatternFill('solid', fgColor=NAVY)
inp_font = Font(color='0000FF'); simf = Font(color='0000FF', italic=True)
tot_fill = PatternFill('solid', fgColor='DCE8F7'); key_fill = PatternFill('solid', fgColor='E3F5EC')
thin = Side(style='thin', color='C8D1D9'); box = Border(top=thin, bottom=thin, left=thin, right=thin)
wrap = Alignment(wrap_text=True, vertical='top')

def sheet(name, widths):
    ws = wb.create_sheet(name)
    for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w
    return ws
def head(ws, r, cols):
    for i, c in enumerate(cols, 1):
        x = ws.cell(r, i, c); x.font = hfont; x.fill = hfill; x.alignment = Alignment(wrap_text=True, vertical='center')

wb.remove(wb.active)
ov = sheet('Overview', [34, 22, 22, 60])
inp = sheet('Inputs', [46, 16, 16, 70])
cost = sheet('Cost', [46, 62, 18])
opx = sheet('Operating', [34, 52, 18, 18])
pay = sheet('Payback', [40, 22, 22, 56])
src = sheet('Sources', [8, 62, 70])

# ---------------- Inputs ----------------
ref = {}
def put(row, key, label, val, unit, note, kind='in', fmt=None):
    inp.cell(row, 1, label); c = inp.cell(row, 2, val); inp.cell(row, 3, unit); inp.cell(row, 4, note).alignment = wrap
    c.font = inp_font if kind == 'in' else simf
    if kind == 'f': c.font = Font(color='000000')
    if fmt: c.number_format = fmt
    ref[key] = "Inputs!$B$%d" % row
inp['A1'] = 'Inputs and assumptions'; inp['A1'].font = Font(bold=True, size=14)
inp['A2'] = 'Blue = typed input you can change. Blue italic = value taken from the simulator run (State College PA, winter-to-annual model). Black = formula.'
inp['A2'].alignment = wrap; inp.merge_cells('A2:D2'); inp.row_dimensions[2].height = 30
head(inp, 4, ['Item', 'Value', 'Unit', 'Source or note'])
r = 5
rows = [
 ('sqft','Terminal floor area',500000,'sq ft','Team assumption: mid-size airport terminal','in','#,##0'),
 ('elec','Electricity price',0.14,'$/kWh','EIA commercial average, about 14 cents/kWh','in','0.000'),
 ('gas','Natural gas price',1.07,'$/therm','EIA commercial: about $10.98 per Mcf / 10.26 therms per Mcf','in','0.00'),
 ('UA','Building heat-loss factor (heating and cooling)',0.70,'Btu/h per sq ft per F','Calibrated to the Louisville airport borefield (see SOURCES_AND_CALCULATIONS.txt section 8)','in','0.00'),
 ('Tbh','Heating balance temperature',55,'F','Standard assumption: heating needed below 55 F','in','0'),
 ('Tbc','Cooling balance temperature',60,'F','Cooling needed above 60 F','in','0'),
 ('Tdh','Winter design temperature (State College)',5,'F','ASHRAE 99.6% heating design condition, rounded','in','0'),
 ('Tdc','Summer design temperature (State College)',88,'F','ASHRAE 0.4% cooling design condition, rounded','in','0'),
 ('lat','Humidity (latent) cooling factor',0.15,'fraction','Added to cooling load for moist air','in','0.00'),
 ('margin','Design safety margin',1.15,'x','Equipment sized 15% above calculated peak','in','0.00'),
 ('covH','Share of peak heating the wells cover',S['covH'],'fraction','From simulator: limited by 2,200 gpm aquifer supply','sim','0.0000'),
 ('covC','Share of peak cooling the wells cover',S['covC'],'fraction','From simulator','sim','0.0000'),
 ('req','Water flow needed to cover 80% of peak heating',S['req'],'gpm','From simulator: Q x (1 - 1/COP) / (500 x 10 F); see sources file section 4','sim','#,##0.0'),
 ('supply','Groundwater the aquifer can supply',S['supply'],'gpm','Illustrative assumption for central Pennsylvania; needs a hydrogeology study','in','#,##0'),
 ('yield','Yield per well',500,'gpm','Assumption','in','#,##0'),
 ('wellc','Cost per well',100000,'$','Assumption: pre-design benchmark; replace with a driller quote','in','$#,##0'),
 ('hx','Heat exchanger, pumps and piping',350,'$/gpm','Assumption: pre-design benchmark','in','$#,##0'),
 ('fixed','Fixed wellfield cost (permits, testing, controls)',150000,'$','Assumption','in','$#,##0'),
 ('hp','Heat pump plant cost',2000,'$/ton','Assumption: pre-design benchmark','in','$#,##0'),
 ('convc','Traditional chiller plant cost',1800,'$/ton','Assumption','in','$#,##0'),
 ('convh','Traditional boiler plant cost',60,'$/MBH','Assumption (MBH = 1,000 Btu/h)','in','$#,##0'),
 ('omp','Maintenance, heat pump plant',0.015,'of cost per year','Assumption','in','0.0%'),
 ('omo','Maintenance, wellfield',0.035,'of cost per year','Assumption (pumps, well rehabilitation, water treatment)','in','0.0%'),
 ('omc','Maintenance, traditional plant',0.025,'of cost per year','Assumption','in','0.0%'),
 ('e_elec','Open-loop electricity use',S['elec'],'kWh per year','From simulator (heat pumps + well pumps + backup chiller)','sim','#,##0'),
 ('e_gas','Open-loop backup gas use',S['gas'],'therms per year','From simulator (backup boiler)','sim','#,##0'),
 ('b_elec','Traditional electricity use',S['belec'],'kWh per year','From simulator (air-cooled chiller)','sim','#,##0'),
 ('b_gas','Traditional gas use',S['bgas'],'therms per year','From simulator (boiler at 85% efficiency)','sim','#,##0'),
 ('grant','Grant or tax credit (with-grant case)',0.30,'% of geothermal equipment cost','Section 48 geothermal heat pump credit, 30% when prevailing wage rules are met (6% otherwise); public owners claim it through elective pay. Confirm eligibility.','in','0%'),
 ('disc','Discount rate (real)',0.03,'per year','Assumption for present value only','in','0.0%'),
 ('life','Evaluation period',25,'years','Typical heat pump equipment life; wells last longer','in','0'),
]
for k, lbl, v, u, n, kind, fmt in rows:
    put(r, k, lbl, v, u, n, kind, fmt); r += 1
R = ref

# ---------------- Cost ----------------
cost['A1'] = 'Installation cost, step by step'; cost['A1'].font = Font(bold=True, size=14)
head(cost, 3, ['Line', 'How it is calculated', 'Amount'])
cl = {}
def crow(row, key, label, how, formula, total=False, fmt='$#,##0'):
    cost.cell(row, 1, label); cost.cell(row, 2, how).alignment = wrap; c = cost.cell(row, 3, formula); c.number_format = fmt
    if total:
        for i in (1, 2, 3): cost.cell(row, i).fill = tot_fill; cost.cell(row, i).font = Font(bold=True)
    cl[key] = "Cost!$C$%d" % row
crow(4,'hpk','Peak heating load','UA x area x (balance temp - design temp) x margin (Btu/h)', "=%s*%s*(%s-%s)*%s" % (R['UA'],R['sqft'],R['Tbh'],R['Tdh'],R['margin']), fmt='#,##0')
crow(5,'cpk','Peak cooling load','UA x area x (1 + humidity) x (design temp - balance temp) x margin (Btu/h)', "=%s*%s*(1+%s)*(%s-%s)*%s" % (R['UA'],R['sqft'],R['lat'],R['Tdc'],R['Tbc'],R['margin']), fmt='#,##0')
crow(6,'flow','Design water flow (gpm)','smaller of the flow needed and what the aquifer supplies', "=MIN(%s,%s)" % (R['req'],R['supply']), fmt='#,##0')
crow(7,'wells','Number of wells','2 x ROUNDUP(flow / yield per well) (production + injection)', "=2*ROUNDUP(%s/%s,0)" % (cl['flow'],R['yield']), fmt='0')
crow(8,'wellcost','Wells','number of wells x cost per well', "=%s*%s" % (cl['wells'],R['wellc']))
crow(9,'hxcost','Heat exchanger, pumps and piping','flow (gpm) x $ per gpm', "=%s*%s" % (cl['flow'],R['hx']))
crow(10,'fix','Fixed wellfield cost','permits, testing, controls', "=%s" % R['fixed'])
crow(11,'source','Wells, heat exchanger and piping total','sum of the three lines above', "=SUM(C8:C10)", True)
crow(12,'tons','Heat pump plant size (tons)','larger of: covered peak heating or covered peak cooling, divided by 12,000 Btu/h per ton', "=MAX(%s*%s,%s*%s)/12000" % (R['covH'],cl['hpk'],R['covC'],cl['cpk']), fmt='#,##0.0')
crow(13,'plant','Heat pump plant','tons x $ per ton', "=%s*%s" % (cl['tons'],R['hp']))
crow(14,'gross','Geothermal equipment (grant-eligible)','wells, heat exchanger, piping + heat pump plant', "=%s+%s" % (cl['source'],cl['plant']), True)
crow(15,'convc','Traditional chiller plant','peak cooling tons x $ per ton', "=%s/12000*%s" % (cl['cpk'],R['convc']))
crow(16,'convh','Traditional boiler plant','peak heating MBH x $ per MBH', "=%s/1000*%s" % (cl['hpk'],R['convh']))
crow(17,'trad','Traditional option, total installed','full boiler and chiller', "=%s+%s" % (cl['convc'],cl['convh']), True)
crow(18,'avoid','Boiler and chiller NOT needed','covered share of peak x traditional plant cost (heating and cooling separately)', "=%s*%s+%s*%s" % (R['covH'],cl['convh'],R['covC'],cl['convc']))
crow(19,'backup','Smaller backup boiler and chiller still bought','traditional plant - the part not needed', "=%s-%s" % (cl['trad'],cl['avoid']))
crow(20,'geo','Open-loop option, total installed','geothermal equipment + backup', "=%s+%s" % (cl['gross'],cl['backup']), True)
crow(21,'extra','Extra cost of open-loop','open-loop option - traditional option', "=%s-%s" % (cl['geo'],cl['trad']), True)
crow(22,'grant','Grant','grant % x geothermal equipment cost (backup equipment is not eligible)', "=%s*%s" % (R['grant'],cl['gross']))
crow(23,'extrag','Extra cost after grant','extra cost - grant', "=%s-%s" % (cl['extra'],cl['grant']), True)

# ---------------- Operating ----------------
opx['A1'] = 'Yearly operating cost, step by step'; opx['A1'].font = Font(bold=True, size=14)
head(opx, 3, ['Line', 'How it is calculated', 'Traditional', 'Open-loop'])
ol = {}
def orow(row, key, label, how, ft, fo, total=False):
    opx.cell(row, 1, label); opx.cell(row, 2, how).alignment = wrap
    for col, f in ((3, ft), (4, fo)):
        if f is not None:
            c = opx.cell(row, col, f); c.number_format = '$#,##0'
    if total:
        for i in range(1, 5): opx.cell(row, i).fill = tot_fill; opx.cell(row, i).font = Font(bold=True)
    ol[key] = row
orow(4,'e','Electricity','kWh per year x $ per kWh', "=%s*%s" % (R['b_elec'],R['elec']), "=%s*%s" % (R['e_elec'],R['elec']))
orow(5,'g','Natural gas','therms per year x $ per therm', "=%s*%s" % (R['b_gas'],R['gas']), "=%s*%s" % (R['e_gas'],R['gas']))
orow(6,'m','Maintenance','traditional: rate x plant cost; open-loop: rate x heat pump plant + rate x wellfield', "=%s*%s" % (R['omc'],cl['trad']), "=%s*%s+%s*%s" % (R['omp'],cl['plant'],R['omo'],cl['source']))
orow(7,'t','Operating cost per year','electricity + gas + maintenance', "=SUM(C4:C6)", "=SUM(D4:D6)", True)
orow(8,'s','Savings per year','traditional - open-loop', None, "=C7-D7", True)
opx['A10'] = 'Why about 70% less energy but only about 15% less cost?'; opx['A10'].font = Font(bold=True)
opx['A11'] = 'Gas heat costs about $10.70 per million Btu at the boiler input; electricity costs about $41 per million Btu. Heat pumps (COP about 4.2) move enough heat per unit of electricity to win on heating, but the wellfield adds pumping and maintenance cost, so the money saved is much smaller than the energy saved.'
opx['A11'].alignment = wrap; opx.merge_cells('A11:D11'); opx.row_dimensions[11].height = 62
SAV = "Operating!$D$8"

# ---------------- Payback ----------------
pay['A1'] = 'Payback, without and with a grant'; pay['A1'].font = Font(bold=True, size=14)
head(pay, 3, ['Measure', 'Without grant', 'With grant', 'How it is calculated'])
def prow(row, label, f1, f2, how, fmt, key=False):
    pay.cell(row, 1, label)
    for col, f in ((2, f1), (3, f2)):
        c = pay.cell(row, col, f); c.number_format = fmt
        if key: c.fill = key_fill; c.font = Font(bold=True)
    pay.cell(row, 4, how).alignment = wrap
prow(4,'Extra cost to build',"=%s"%cl['extra'],"=%s"%cl['extrag'],'from the Cost sheet','$#,##0')
prow(5,'Savings per year',"=%s"%SAV,"=%s"%SAV,'from the Operating sheet','$#,##0')
prow(6,'Simple payback (years)',"=B4/B5","=C4/C5",'extra cost / savings per year','0.0',True)
prow(7,'Net savings over the evaluation period',"=B5*%s-B4"%R['life'],"=C5*%s-C4"%R['life'],'savings x years - extra cost (no discounting)','$#,##0')
prow(8,'Present value of net savings',"=B5*(1-(1+%s)^-%s)/%s-B4"%(R['disc'],R['life'],R['disc']),"=C5*(1-(1+%s)^-%s)/%s-C4"%(R['disc'],R['life'],R['disc']),'savings x annuity factor - extra cost, at the discount rate','$#,##0')
prow(9,'Discounted payback (years)',"=-LN(1-%s*B4/B5)/LN(1+%s)"%(R['disc'],R['disc']),"=-LN(1-%s*C4/C5)/LN(1+%s)"%(R['disc'],R['disc']),'years until discounted savings equal the extra cost','0.0')
pay['A11'] = 'Cumulative cash position ($)'; pay['A11'].font = Font(bold=True)
head(pay, 12, ['Year', 'Without grant', 'With grant', ''])
for y in range(0, 31):
    rr = 13 + y; pay.cell(rr, 1, y)
    pay.cell(rr, 2, "=-$B$4+$B$5*A%d" % rr).number_format = '$#,##0;[Red]-$#,##0'
    pay.cell(rr, 3, "=-$C$4+$C$5*A%d" % rr).number_format = '$#,##0;[Red]-$#,##0'
from openpyxl.chart import LineChart, Reference
ch = LineChart(); ch.title = 'Cumulative cash position'; ch.y_axis.title = 'Dollars'; ch.x_axis.title = 'Year'; ch.height = 9; ch.width = 20
ch.add_data(Reference(pay, min_col=2, min_row=12, max_col=3, max_row=43), titles_from_data=True); ch.set_categories(Reference(pay, min_col=1, min_row=13, max_row=43))
pay.add_chart(ch, 'F3')

# ---------------- Overview ----------------
ov['A1'] = 'Open-Loop Geothermal Cost-Benefit Workbook'; ov['A1'].font = Font(bold=True, size=16, color=NAVY)
ov['A2'] = 'ACRP University Design Challenge, Team 4 (Aryan, Kenneth, Maddie, Praneeth, Jai). Open-loop (groundwater) geothermal heating and cooling for a 500,000 sq ft airport terminal in central Pennsylvania.'
ov['A2'].alignment = wrap; ov.merge_cells('A2:D2'); ov.row_dimensions[2].height = 34
txt = [
 'What this workbook is: a written, formula-by-formula version of the simulator results. Change a blue input on the Inputs sheet and every other sheet updates.',
 'The comparison: a traditional gas boiler plus air-cooled chiller, versus open-loop geothermal wells and heat pumps with a smaller backup boiler and chiller kept for the load the wells do not cover.',
 'Extra cost = (open-loop equipment + smaller backup) - (full traditional plant). Simple payback = extra cost / yearly operating savings. The with-grant case subtracts the grant from the geothermal equipment cost first.',
 'These are simulator assumptions for a college project, not contractor quotes. Items marked Assumption on the Inputs sheet should be replaced with quotes, as listed in the report next steps.',
]
for i, t in enumerate(txt): ov.cell(4 + i, 1, t).alignment = wrap; ov.merge_cells(start_row=4 + i, start_column=1, end_row=4 + i, end_column=4); ov.row_dimensions[4 + i].height = 46
head(ov, 9, ['Result', 'Without grant', 'With grant', 'Note'])
res_rows = [
 ('Geothermal equipment cost', "=%s"%cl['gross'], "=%s"%cl['gross'], 'wells, heat exchanger, piping, heat pump plant', '$#,##0'),
 ('Boiler and chiller not needed', "=%s"%cl['avoid'], "=%s"%cl['avoid'], 'covered share of the traditional plant', '$#,##0'),
 ('Grant', 0, "=%s"%cl['grant'], '30% of geothermal equipment in the with-grant case', '$#,##0'),
 ('Net project cost (extra cost)', "=Payback!B4", "=Payback!C4", 'what the airport pays beyond a traditional plant', '$#,##0'),
 ('Savings per year', "=Payback!B5", "=Payback!C5", 'traditional operating cost - open-loop operating cost', '$#,##0'),
 ('Simple payback (years)', "=Payback!B6", "=Payback!C6", 'net project cost / savings per year', '0.0'),
 ('Net savings over 25 years', "=Payback!B7", "=Payback!C7", 'no discounting', '$#,##0'),
]
for i, (l, a, b, n, f) in enumerate(res_rows):
    rr = 10 + i; ov.cell(rr, 1, l); ov.cell(rr, 2, a).number_format = f; ov.cell(rr, 3, b).number_format = f; ov.cell(rr, 4, n).alignment = wrap
    if l.startswith('Simple'):
        for c in (1, 2, 3): ov.cell(rr, c).fill = key_fill; ov.cell(rr, c).font = Font(bold=True)
# check vs simulator
ov['A19'] = 'Check against the simulator'; ov['A19'].font = Font(bold=True, size=12)
head(ov, 20, ['Quantity', 'This workbook', 'Simulator', 'Difference'])
chk = [
 ('Geothermal equipment cost', "=%s"%cl['gross'], sim['gross']), ('Boiler and chiller not needed', "=%s"%cl['avoid'], sim['credit']),
 ('Extra cost (no grant)', "=%s"%cl['extra'], sim['extra']), ('Open-loop operating cost', "=Operating!D7", sim['opex']), ('Traditional operating cost', "=Operating!C7", sim['bopex']),
 ('Savings per year', "=%s"%SAV, sim['sav']), ('Payback, no grant (years)', "=Payback!B6", sim['pn']), ('Payback, with grant (years)', "=Payback!C6", sim['pg']),
 ('Present value, no grant', "=Payback!B8", sim['npvn']), ('Present value, with grant', "=Payback!C8", sim['npvg']), ('Discounted payback, with grant (years)', "=Payback!C9", sim['dpg']),
]
for i, (l, f, v) in enumerate(chk):
    rr = 21 + i; ov.cell(rr, 1, l); ov.cell(rr, 2, f); c = ov.cell(rr, 3, v); c.font = simf; ov.cell(rr, 4, "=B%d-C%d" % (rr, rr))
    fm = '0.000' if 'years' in l else '$#,##0.00'
    for cc in (2, 3, 4): ov.cell(rr, cc).number_format = fm
ov['A33'] = 'All differences should be 0 (rounding only). The simulator column is the engine output; the workbook column is rebuilt from the formulas.'; ov['A33'].alignment = wrap; ov.merge_cells('A33:D33'); ov.row_dimensions[33].height = 30

# ---------------- Sources ----------------
src['A1'] = 'Sources'; src['A1'].font = Font(bold=True, size=14)
head(src, 3, ['#', 'Source', 'Used for'])
S_ROWS = [
 ('U.S. Energy Information Administration (EIA), Electric Power Monthly, commercial average price. https://www.eia.gov/electricity/monthly/', 'Electricity price $0.14/kWh'),
 ('EIA, Natural Gas Prices, commercial consumers. https://www.eia.gov/dnav/ng/ng_pri_sum_dcu_nus_m.htm (1 Mcf = about 10.26 therms)', 'Gas price $1.07/therm'),
 ('NOAA/NWS 1991-2020 U.S. Climate Normals. https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals', 'Monthly temperatures'),
 ('ASHRAE Handbook - Fundamentals, Climatic Design Conditions', 'Design temperatures 5 F and 88 F'),
 ('Kavanaugh and Rafferty, Geothermal Heating and Cooling: Design of Ground-Source Heat Pump Systems (ASHRAE, 2014)', 'Water and ground heat-transfer practice'),
 ('Plante Moran (Feb 2026), Geothermal heat pump systems tax incentives. https://plantemoran.com/explore-our-thinking/insight/2026/02/geothermal-heat-pump-systems-tax-incentives', 'Section 48 credit: 6% base, 30% with prevailing wage, elective pay for public entities'),
 ('FAA Voluntary Airport Low Emissions (VALE) program. https://www.faa.gov/airports/environmental/vale', 'Possible airport funding route (AIP/PFC); eligibility of geothermal to be confirmed with FAA'),
 ('DOE / FAA case study of the Louisville Muhammad Ali Intl Airport terminal geothermal borefield', 'Calibration of the building heat-loss factor (see SOURCES_AND_CALCULATIONS.txt)'),
 ('Simulator: SOURCES_AND_CALCULATIONS.txt (formulas, worked examples, list of unverified assumptions)', 'Energy use figures marked from simulator'),
]
for i, (a, b) in enumerate(S_ROWS):
    src.cell(4 + i, 1, i + 1); src.cell(4 + i, 2, a).alignment = wrap; src.cell(4 + i, 3, b).alignment = wrap; src.row_dimensions[4 + i].height = 44
for ws in wb.worksheets:
    ws.sheet_view.showGridLines = False
    ws.freeze_panes = None
out = os.path.join(root, 'Open-Loop_CBA.xlsx')
wb.save(out); print('saved', out)
