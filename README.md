# DON'T TOUCH

**Dad built a miniature town on a sheet of plywood in the basement, and the one rule of the house is that you don't touch it. Nobody knows it woke up.**

A god game where every divine power is something a kid can do to a 4×8 model layout — press a
finger to the board, lift one edge off the sawhorses, breathe on the town, pull the plastic
sheeting off, pull the light cord — and the little glowing people inside build a life out of
what you did to them, including the parts you didn't mean. Every mark you leave stays.
Dad will see it.

*a DIRTY BOY DEVS game · the basement layout · browser, no build step*

---

## September 14 — room to grow

- New generated towns use a 192 x 192 board: 78% more playable land than the previous 144 x 144 board. Existing saves and baked places retain their original dimensions.
- The 14 starting works have footprint clearance, an open village green, and room around the glued founder. Founders start on dry ground with separation. Narrow shorelines get a wider search instead of overlapping roofs.
- M opens an optional map. Click or drag to travel, or visit kin short of water, food, or warmth. The resident panel explains the relevant existing hand gesture after a care visit. H returns to the town; exploring no longer snaps back after four seconds.
- The land beyond the rail boundary has continuous terrain, meadow detail, trees, and rocks. Screen-edge defocus is removed; lantern bloom remains.
- Blender oak, pine, and lichen rock kit: assets/nature.glb. Rebuild with tools/build-nature.py in Blender; editable source: tools/nature-kit.blend. Vegetation is instanced, with starting works and railway ballast kept clear.
- Rain forecasting uses the world's actual area, matching the simulation threshold.
- Select a resident and use F to follow, or Look closer for a low camera angle. Names in the book are clickable; large censuses have pages. Alt-drag or middle-drag rotates the view.
- Held gestures show what your hand is doing. Open books and settings block power shortcuts; keyboard activation of buttons does not breathe on the town.
- Fast-forward and returning after time away yield to the interface. On slower devices, fast-forward advances as quickly as the frame budget allows. Town rules and tick order are unchanged.
- Blender vegetation clears construction, follows sculpted ground, and keeps its positions across saves. Off-camera plants are culled. Post-processing now uses the actual pixel resolution on high-density displays.

Verification: tools/verify-expanded.mjs covers 18 opening layouts, four 60-day colonies, full saves, continued determinism, and baked-world loading. tools/verify-browser.cjs checks navigation, care shortcuts, geometry seams, shaders, mobile layout, and baked maps (local bundled Playwright and Chrome paths). The original sim battery supports --filter=<regex>; expensive shared fixtures are now lazy. All 124 original simulation tests passed against the final code, including two untouched 400-day colonies and four 112-day soaks. The six browser verification scripts passed, including mobile panel layout, retina rendering, terrain sculpting, care visits, follow identity, and construction/save stability.

## Little lives and new menus

- Creatures form persistent friendships through nearby encounters and prefer familiar company. Well-fed neighbours share food with hungry ones; older creatures teach younger ones what they know. Young creatures and bead visitors play together.
- Foragers carry a small part of real harvests as seeds and scatter them onto damp, depleted, unpaved ground. New growth comes from something they gathered.
- Three inherited aptitudes—**foraging, empathy, resilience**—affect meals, companionship and strain. Children inherit a blend of their parents’ aptitudes with small variation. Existing towns migrate with neutral aptitudes; their descendants develop from there.
- **Care → Leaf shelter** places a temporary refuge; **Play → Play bead** creates a place to gather. **Shape → Put away** removes either. Placement needs open, dry ground inside the reachable world. There can be 12 objects at once; leaves last 18 days and beads 120 days.
- The **Care / Play / Shape / Disrupt** action menu shows a persistent explanation of the selected tool. The opening screen has a clear Enter/Continue action, town summary, settings and a separate choice of new worlds.
- The creature inspector shows current social activity, a familiar companion and inherited strengths. The book’s **little lives** page records sharing, play, lessons, seed spreading and living generations.

These systems keep the colony autonomous. Food, water and danger still take priority over play. New state lives in the normal town save; changing worlds from the opening menu confirms before replacing a saved town.

Validation: all 124 existing simulation regressions pass after this update. Focused checks: tools/verify-little-life.mjs (18 cases), tools/verify-life-soak.mjs (generated N96/N192 and Boulder over 45–65 simulated days), tools/verify-life-browser.cjs, tools/verify-life-save.cjs and tools/verify-title-menu.cjs. Use the same local server and bundled browser runtime as the other tools/ checks.

## Play it

```
node serve.mjs 8460
```
then open **http://localhost:8460** — or just double-click **PLAY.bat** on Windows.

ES modules do not load from `file://`, so it needs the little server. There is no build step,
no bundler, and no dependencies: Three.js is vendored in `lib/`.

## Controls

| | |
|---|---|
| **press and hold on the town** | warm them. your finger comforts, and your finger kills. it takes seconds to arrive and seconds to leave |
| **tap one of them** | look at whoever you touched |
| **shift-drag / right-drag** | lift the board off the sawhorses. water runs downhill. so do they |
| **WASD / arrows** | move across the world |
| **Alt-drag / middle-drag** | rotate the camera · wheel to lean in |
| **M / H** | open the map / return to town |
| **F** | follow the selected resident; Look closer lowers the camera |
| **hold space** | breathe on the town. enough breath and it rains |
| **L** | the plastic sheeting. covered, their rain comes back; uncovered, the open basement air drinks their pond |
| **T** | tap the table. don't |
| **B** | the book — what actually happened, in their handwriting |
| **1 · 4 · 0 / P** | 1×, 4×, 20× / pause (2 and 3 also select 4× and 20×) |

URL params: `?newgame` · `?seed=whatever` · `?pause`

## What's in this build

A living, multigenerational town with inherited traits, individual needs, homes, trades,
construction, farming, food stores, schools, power and walls. The colony develops its own
practices and records the consequences of your actions in its book. Existing baked real-world
places remain available from the title screen.

There are no imposed missions or score. The map, follow camera and gesture readouts help you
observe and care for the town while preserving its autonomous behavior.

## Files

```
sim.js          the ENTIRE deterministic simulation. No THREE. No DOM. Node-testable.
view.js         Three.js rendering — the basement, the table, dad's town. Reads the sim, never writes it.
ui.js           DOM overlay — HUD, chronicle, inspector, the book, the PNG export.
sfx.js          all WebAudio synthesis, zero samples.
main.js         boot, fixed-timestep loop, input, IndexedDB persistence.
index.html      shell, CSS, the help card.
survey.js       optional map, care visits and construction navigation.
landscape.js    continuous outer terrain and Blender nature instances.
nature-culling.js  plant visibility, construction clearance and terrain refresh.
clock-step.js   responsive fixed-step scheduling outside the simulation.
water-finish.js  animated water reflections and damp shoreline shading.
little-life-view.js  placed beads/leaves and social-event visuals; reads the sim only.
interaction-menu.js / .css  categorized actions and opening-menu presentation.
data:           all tuning lives in the C block at the top of sim.js.
test-sim.mjs    headless battery — node test-sim.mjs
test-view.mjs   browser battery — needs playwright, and the server running
lib/            vendored three.module.js, no CDN
serve.mjs       node serve.mjs 8460
```

## Graphics

Blender source is included in tools/nature-kit.blend and tools/village-details.blend.
Rebuild the small GLB assets with Blender in background mode using tools/build-nature.py
and tools/build-village-details.py. The hut kit adds timber framing, stone foundations
and layered thatch; the nature kit includes branched pine silhouettes, oaks and rocks.
Water ripples and damp banks are view-only. HDR post-processing preserves night gradients
on supported WebGL2 devices, with an 8-bit fallback.

Run tools/verify-graphics.cjs against the local server for day, close-up and night renders,
asset loading, render-only state integrity and both post-processing formats.

## Tests

```
node test-sim.mjs        # 124 tests: rng, world, blood, life, the hand, the one who stays,
                         #           determinism, save integrity, chronicle, soak
node serve.mjs 8460 &    # then, with playwright installed:
node test-view.mjs       # 19 checks: every verb, the inspector, the book, save/reload
```

Current checks live in tools/verify-*. The Windows browser checks use the installed bundled Playwright and Chrome paths. Run tools/long-colony.mjs first for the optional mature-town fixture. Generated QA data stays in the ignored output/ directory. For a bounded simulation run, use --filter=<regex> or an inclusive --range=first:last.

## Save

The colony lives in **IndexedDB** (`donttouch` / `colony`). `localStorage['donttouch-save']`
holds only the summary the house hub reads. `navigator.storage.persist()` is requested on
boot — without it Safari evicts any origin untouched for seven days and takes the colony with it.

`__G.wipe()` in the console starts over.

## Notes

There is no score, no objective and no way to lose. Nobody is ever going to tell you what you
were. The graves will.

### Building layout

Towns now begin on mirrored, evenly spaced plots with an open village green. New construction stays on the same grid at every age and waits when no safe nearby plot is free. Building models fit their reserved footprints, face straight along the grid, and keep streets clear of tree crowns. Existing saves are aligned on load while retaining their buildings and residents.
