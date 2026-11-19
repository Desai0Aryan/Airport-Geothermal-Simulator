# Airport Open-Loop Geothermal Simulator

Interactive 3D simulator and cost-benefit analysis for an **open-loop (groundwater) geothermal** heating and cooling system at an airport terminal, compared with a traditional gas boiler + air-cooled chiller.
Built for the ACRP University Design Challenge (Team 4). Illustrative college-level model, not engineering design software.

## Run it
Double-click `index.html`. No install, no internet, no build step.

## Tabs
3D simulator (orbit, night mode, camera views) · Cost and payback (with and without grant) · What-if (sensitivity) · Risks · Why open-loop · How it works.
Export: CSV, JSON, print/PDF.

## Headline results (State College PA, 500,000 sq ft, new/replacement plant)
- Extra cost $2,047,008 without grant; $748,527 with a 30% federal credit.
- Savings $94,719 per year. Simple payback 21.6 years without grant, 7.9 years with grant.
- Energy use down about 70%; operating cost down about 15%.
- Grant eligibility, benchmark costs and aquifer supply are unconfirmed assumptions (see SOURCES_AND_CALCULATIONS.txt section 10).

## Files
```
index.html, css/, js/        the app (js/engine.js = model + economics; js/src/scene3d.js = 3D, bundled)
Open-Loop_CBA.xlsx           cost and payback as live Excel formulas, self-checks against the simulator
SOURCES_AND_CALCULATIONS.txt every source, formula and worked example
REPORT_NOTES.txt             numbers and wording fixes for the written report
tests/                       node tests/engine.test.js (19), node tests/economics.test.js (12)
verification/                independent Python check (verify.py, 21 checks), Louisville calibration, workbook builder
```
Closed-loop and hybrid code remain in the engine for reference but are not shown in the app.
