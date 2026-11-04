# Airport Geothermal Simulator

Interactive prototype comparing **open-loop**, **closed-loop** and **hybrid** geothermal heating and cooling for an airport terminal, against a traditional gas boiler + air-cooled chiller.
Built for the ACRP University Design Challenge (Team 4). Illustrative college-level model, not engineering design software.

## Run it
Double-click `index.html`. No install, no internet, no build step (plain HTML, CSS and JavaScript).

## What you can do
- Pick a climate preset (Minneapolis, State College PA, Miami, Phoenix), move the **season slider**, or set the **outdoor temperature**. Moving the temperature off the season's typical value applies a what-if shift to the whole year, so annual results update too.
- Change terminal size, heating and cooling demand, electricity and gas price, ground and groundwater temperature, installation cost level, grants, sizing and available land.
- Open each system tab for its diagram (flow reverses between heating and cooling), live "right now" numbers, KPIs, settings, and charts.
- **Hybrid** tab: one slider sets the open-loop share; closed-loop is always the remainder (they total 100%).
- **Compare all** tab: side-by-side table, charts, an auto-written verdict, and a "which wins where" matrix across all four climates.
- **Export results**: CSV (comparison table), JSON (inputs + full results), or print / save as PDF.
- **How it works** tab: calculation steps, limits of the model, climate data, and editable advanced assumptions.

## Files
```
index.html          page shell
css/styles.css      styles (light and dark themes)
js/engine.js        calculation engine, no DOM; also runs in Node
js/charts.js        small SVG chart library (bars, lines, tooltips, table view)
js/diagrams.js      2D system schematics (fallback / "2D schematic" view)
js/src/scene3d.js   3D scenes (three.js); bundled to js/vendor/scene3d.bundle.js (see BUILD_3D.txt)
js/app.js           controls, tabs, rendering, export
tests/engine.test.js  19 engine tests:  node tests/engine.test.js
verification/       independent Python recomputation (verify.py, 21 checks), Louisville validation
SOURCES_AND_CALCULATIONS.txt  every source, formula and worked example for manual fact-checking
```

## Model in brief
1. Monthly heating/cooling demand = building response x area x degree-hours beyond a balance temperature (monthly mean temperature plus a normal spread).
2. Heat pump / chiller COP = fraction of Carnot COP, driven by source temperature (groundwater, or loop fluid for closed-loop).
3. Electricity = thermal energy / 3,412 / COP, plus pumping. Thermal and electrical energy are kept separate.
4. Open-loop: flow needed = ground heat / (500 x temperature change), limited by aquifer supply.
5. Closed-loop: loop temperature depends on heat per foot of borehole, ground conductivity, borehole count and spacing, and long-term heating/cooling imbalance; land from count x spacing.
6. Ground systems are sized for a share of peak load (default 80%); the existing boiler/chiller covers the rest and any shortfall.
7. Hybrid: each source sized for its share, energy and cost added once (no double counting), plus an integration cost.
8. Savings = traditional operating cost - system operating cost. Simple payback = net installation cost / annual savings (no discounting).

## Honest limits
Weather uses NOAA 1991-2020 normals and prices follow EIA averages; cost, aquifer and efficiency numbers are pre-design assumptions (listed in SOURCES_AND_CALCULATIONS.txt, section 10). Not modeled: hourly weather, electric demand charges, price escalation, financing, water chemistry and permitting, detailed borehole thermal response, airport-specific siting limits. Have an engineer review before drawing real conclusions.
