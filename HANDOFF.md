# DON'T TOUCH — HANDOFF
**v0.4 · 2026-08-19 · read this before writing a line.**
Companion to `DONT_TOUCH_BIBLE.md` (the design authority — read its ⚠️ PIVOT preface first)
and `README.md` (how to run it).

**THE PIVOT (same day v0.1 shipped):** Kyle re-themed the game from a windowsill terrarium
(THE GLASS) to a 90s dad's miniature town on a basement layout table (DON'T TOUCH). **Zero
sim mechanics changed** — the bible preface carries the full jar→layout mapping table. What
moved: `view.js` (basement/table/track-loop/town/plastic-cover replaced room/jar/glass —
the track ring IS the sim's circular `inJar` boundary), all player-facing copy, fingerprints
now press into the GROUND texture (`view.fpGrid` + `fingerprintAt(cx,cy)`, composited every
frame in `_paintGround`) instead of a glass-cylinder canvas, and the save keys renamed
`theglass*` → `donttouch*` (repo + URL renamed the same day). The jar-era bug history below
is kept verbatim — every one of those bugs is still real, just wearing new nouns.

| File | What it is | State |
|---|---|---|
| `DONT_TOUCH_BIBLE.md` | the complete design bible, 24 parts + the pivot preface | **v1.1. Title locked with Kyle; the preface's mapping table governs the fiction.** |
| `sim.js` | the entire deterministic simulation | **~900 lines. M1–M6 live. No THREE, no DOM.** |
| `view.js` | Three.js rendering | **live. Lamplit basement: table, track loop, town, cover; one InstancedMesh + one Points for the colony.** |
| `ui.js` / `sfx.js` / `main.js` / `index.html` | overlay, audio, loop, shell | **live** |
| `test-sim.mjs` | headless battery | **40 tests, 40 green** |
| `test-view.mjs` | browser battery | **19 checks, 19 green, zero console errors** |

**The next milestone is M7 — THE WEAVE (bible §7).** Do not start the fog board (M8) first; the
symbol system has nothing to attach to until practices exist.

---

## ⚠️ THE BUGS THAT MATTERED — do not reintroduce them

Each of these cost real time and each one killed a colony. They are all fixed. The comments in
`sim.js` name them; this is the index.

### ⚠️⚠️ THE THRASH — kin re-deciding every 12 ticks
A kin that re-picks its goal every 0.8 s moves 0.66 cells before changing its mind. The pond was
twenty cells away. **The entire founding colony died of thirst standing still.**
**Fix:** `k.hold[]`, a commitment timer sized from the distance to the target, released early by
`_goalMet()` or by an emergency. If you ever "simplify" the decision loop, this is what breaks.

### ⚠️⚠️ THE BURIAL SPIRAL
Without a claim on a corpse, **29 of 99 kin dropped everything to carry a single body**, stopped
eating, and died — which made more bodies. A colony went from 99 to 4 in fifteen days.
**Fix:** `corpse.claim`, one carrier per body, and a hungry kin does not do funerals
(`k.need[food] > 0.55` gate). Both halves are load-bearing.

### ⚠️⚠️ THE DEPENDENT STAGES
Eggs and nibs cannot walk to the pond. Full need decay on them wiped **every clutch in the jar**
before it hatched. **Fix:** eggs decay nothing but warmth; nibs decay at 0.22× and follow whoever
is raising them, topped up by proximity.

### ⚠️ THE SEALED JAR
Evaporation was deleting water. The pond dried out in fifty days and everything died of thirst
every single time. **Fix:** evaporated water becomes `this.humid`, condenses at `C.CLOUD`, and
rains back. **A closed jar conserves its water; an open lid loses it. That is the entire cost of
the lid** — and it now reads as a mechanic instead of a leak.

### ⚠️ INSTANT DEATH AT need == 0
An empty need used to kill on the same tick. Every population overshoot became a total
extinction and the player never had a window to help. **Fix:** `k.strain[]` — an empty need
starts a clock (thirst 1.6 days, hunger 3.2, cold 0.9, heat 0.35, drowning 0.09) and recovers.
This is the single most important balance change in the build.

### ⚠️ FOUNDERS ON THE GRAVEYARD
`this.yard` is chosen to be as far from the pond as the generator can manage. Spawning the
founders there put them maximally far from water; two seeds in twelve died on day one.
**Fix:** `this.hearth` — dry ground above the flood line, ~8 cells from water. Founders start there.

### ⚠️ THE SQUARE GRID IN A ROUND JAR
`yard`, `hearth` and graves were picked from the full square grid, so they could land in a
corner outside the glass — and the view drew graves floating in mid-air. Kin walked out there too.
**Fix:** `inJar()`, `_keepIn()`, a clamp on decision targets, and a circular alpha mask on the
terrain in the view. All four are needed; the corners come back if you drop any one.

### ⚠️ LOCAL STARVATION IN A FULL JAR
A clustered colony overgrazed home and starved while the jar was 63% covered in moss, because
the food search was a fixed ±9 cells. **Fix:** the forage radius scales with hunger
(`R = 7 + hunger² × 26`) and the distance penalty relaxes as they get desperate.

### ⚠️ THE LANTERN INSIDE ITS OWN BODY
The glow point was drawn at the body's centre, so the opaque body depth-tested it away and the
whole colony rendered as dark specks. **Fix:** lantern sits `0.024 × size` above the body.

### ⚠️ THE OPAQUE LID
The lid was a solid disc and it covered the entire game. It is glass, and it always was.

---


---

## v0.3 — THE ONE WHO STAYS, and the record that survives

**The spine, and it is the whole game:** *two hands touch this town and neither
of them knows it is alive, so the town is the only one keeping the record.*
Yours is warm, present and careless. Dad's is slow, restorative and absent — he
repairs what you disturb, between sessions, thinking he is fixing scenery.
Everything from here builds outward from that.

### THE ONE WHO STAYS (shipped)

Dad put a drop of glue under one figure, so one named kin can never walk. The
town has to come to them, or they do not drink.

- `k.glued` / `k.tender` are typed arrays **inside `this.k`**, which is the whole
  trick: anything in `k` round-trips through toJSON/fromJSON for free. Anything
  on `this` does **not** — it needs a toJSON line and a fromJSON line with an
  explicit `!= null` default.
- The glued founder is the **longest-lived** founder, made a young adult. Taking
  whoever came first gave the player a stranger who died around day 40 of plain
  old age — not enough time to care that they cannot walk.
- **Goal 9 (tend)** is a real errand with a real pull. ⚠️⚠️ It is the burial
  spiral wearing a different coat: without guards, colony peak 86 collapsed to
  14 and *everyone died*, because tenders committed forever and stopped eating.
  **Three guards, all load-bearing — do not remove any of them:** ONE carer at a
  time (`k.tender`, the corpse-claim pattern), a satisfaction condition in
  `_goalMet`, and a fed-only gate at decision time.
- ⚠️ **THE EMPTY CUP.** The fed-only gate is checked when a goal is CHOSEN, but
  an errand is a walk — a kin sets out fed, crosses the town and arrives
  starving. Both errands (8 and 9) now release when the carer is in trouble.
- ⚠️⚠️ **AN IMMOBILE KIN ACTS AT UNLIMITED RANGE.** `_act` measures `near` as
  distance to the TARGET, and a glued kin's target is pinned to its own feet, so
  `near` is unconditionally true for them. They performed **13–31% of every
  funeral in the game**, from up to 31 cells away, without moving — the chronicle
  read "X carried Y to the yard" eleven days above "the only journey X ever
  took". Goals 7/8/9 all require ARRIVING and are now excluded for the glued,
  and guarded again in `_act`. **Any future goal that needs arrival needs the
  same guard.**
- Measured, 20 identical worlds, A/B: colonies alive **20/20 both with and
  without**; mean peak 81.9 vs 78.6 — the feature costs the colony nothing. The
  one who stays lives a **median 142 days** (range 33–189) and every run
  eventually buries them. Half their days, nobody comes.

### THE BOOK WENT BLIND (fixed)

`page()` froze rarity at log time (`1/sqrt(count-so-far)`), so the first death
ever scored 1.0 and the hundredth 0.1. **Measured at day 240: every page still
covered days 0–62.** A hundred and seventy-eight days of lived history could
never appear — in the artifact pillar P2 calls the whole point. Recency
weighting does **nothing** (the gap is ~12× and swamps any honest lift; tested,
byte-identical page). **Stratifying fixes it:** three acts, quotas [3,2,2], each
re-ranked by `w / sqrt(count-within-that-act)` so "rare" means rare *for its own
era*. `w` (author intent) is stored beside `score` (frozen rarity) — you need
both to re-rank. `page(fromDay)` drives the "while you were away" page, which
was computed and then dropped for the entire life of the build.

### Save & integrity traps found the hard way

1. ⚠️⚠️ **`opts.founders || 14` meant `founders: 0` spawned FOURTEEN**, and
   `fromJSON` restores into `founders: 0`. Harmless while every array was
   overwritten — but `fromJSON` restores with `if (o.k[key])`, so a save written
   before a new per-kin array **keeps the phantom values**. A simulated v0.2 save
   came back with a glued stranger frozen mid-board. `??` is load-bearing.
2. ⚠️⚠️ **`fingerprint()` was a false green.** It read only position/age/fields,
   so wiping the entire genome, every nameId, glued, tender, needs, strain,
   humid, curtain and lid left it IDENTICAL — and both save tests leaned on it.
   **If you add persistent state, add it to `fingerprint()` too.** Better: use
   `saveEqual()` in test-sim.mjs, which compares the whole serialised state and
   cannot be fooled by a summary.
3. ⚠️ **The narrator had no memory of itself.** `_hatches`, `_lastRainLog`,
   `_tendLog` and the `eventCounts` rarity ledger were never saved, so a restored
   colony was identical in body and told its story on a different rhythm. The
   widened fingerprint caught this the moment it shipped.
4. ⚠️ **The book deleted its own first page.** `chronicle.slice(-600)` against a
   4000-entry ring eventually threw away the founding — measured at day 600,
   `some(e => e.kind === 'open')` was false. `HEAD_KEEP` trims the MIDDLE now.
5. ⚠️⚠️ **The season leaked into worldgen.** main.js wrote the calendar into the
   SHARED `C` object, so the same seed grew a different town in January than in
   July. Room temperature is `sim.ambientBase` now; **`C.AMBIENT_BASE` is a true
   constant — never assign to it.**
6. ⚠️ **Founders were born already dead.** Age was a flat 30–70 days regardless
   of genome, but a quick + marrow-homozygous kin lives ~40. Seed `report` — the
   known-bad seed this file used to flag — now survives to day 216, not 41.
7. ⚠️ A **corpse claim outlived the claimer's interest**, making a body
   permanently unclaimable by anyone else.
8. A **half-written save was a permanent lockout**: fromJSON throws, boot() had
   no guard, and there is no restart control anywhere in the UI. Guarded now;
   the bad blob is set aside under `save-broken` so the 25 s autosave cannot
   destroy the evidence. Verified in-browser against a corrupted record.

### Measured, and therefore NOT worth doing

- **Perf is not the problem.** ~13–31k ticks/s against the ~300/s that 20× speed
  needs — 40× headroom. The real ceiling is GPU fill from additive lantern
  sprites saturating to white exactly when the colony is most interesting.
- **The named-kin budget (§4.4) is not a live problem.** Measured 6–18 named
  *alive* at a time against the bible's 18 — attrition already enforces it. Only
  `names[]` grows, ~0.8 KB of a 437 KB save.
- **Save quantisation is off the table.** It reaches 96 KB (−78%) but the
  fingerprint DIVERGES, and invariant 3 forbids that. Dropping `height` (bit-
  identically regenerable from the seed) is the honest −18%.

### The measured gaps that remain, roughly in order

1. **The hand has 0 of 15 `log()` call sites.** The verb the game is *named
   after* has never once appeared in the town's own record.
2. **The evidence is a lie.** `view.fpGrid` is a renderer array that dies with
   the browser tab, while the help card promises "every mark you leave stays".
   It wants to be a sim field (`pressed`/`scar`) that moss will not regrow over.
3. **§6.4 memory** — the M7 prerequisite. Design decided: a fixed ASSOCIATIVE
   memory, one slot per KIND (8 kinds), strongest wins, ~20 KB — *not* the
   bible's 24 free-form slots (~94 KB while empty, and nothing anywhere wants a
   kin's second-best warm place). ⚠️ **WARM must be SIGNED, and the sign measured
   from the kin's own comfort delta:** at 32 °C the same press takes an `ash` kin
   from 0.57 to 1.00 and a `rime` kin from 1.00 to 0.21. The same finger writes
   gratitude into one lineage and terror into another in the same tick — which is
   exactly the contradiction §9's schism needs, for the cost of one comparison.
   ⚠️ `who` must store a `nameId`, never a kin id: ids are recycled via `free`,
   so a memory of the dead silently re-points at a newborn.
4. **`k.born` is written at spawn and read NOWHERE.** It is the key to M7's
   tradition test: a living kin whose `born` postdates an event, who holds the
   belief anyway, *cannot have been there*.
5. **Dad.** Not a spectacle (a dad you can watch is a dad who can catch you, and
   being caught demands a hide verb — a sixth verb) and not wallpaper. A sim
   event that can only fire in the gap between sessions. `catchUp()` already
   exists and already writes a page. You never see him; you reconstruct him.
6. **Reach.** On a 375 px screen `#top` overflows with no way to scroll to the
   speed buttons or the book. Touch reaches 2 of the 5 verbs (tilt needs shift
   or right-click, breathe needs Space). No `prefers-reduced-motion` anywhere.
7. ⚠️ **`test-view.mjs` cannot run on this machine** — it hardcodes
   `/opt/pw-browsers/chromium` and `/tmp/final.png`, and there is no
   package.json. Its "19 green" is a claim from a Linux box, so **the view side
   has no executable gate at all.**
8. Three of the six death clocks (heat, cold, drowning) are essentially never
   exercised in normal play — hunger is 60–75% of every death.

### How to actually see the game

The Browser pane never composites this WebGL page, so screenshots time out —
but the page can photograph itself, because a drawing buffer is only cleared on
COMPOSITE. `renderer.setSize(w,h,false)` → `view.render(dt)` → `toDataURL()`
**in one synchronous task** returns real pixels; POST that to a tiny local
receiver and Read the PNG. Never pipe base64 back through a tool result.
⚠️ `view.render(dt)` takes **seconds**; a wrong argument NaNs `view.t` and every
geometry downstream. ⚠️ The pane's console buffer retains errors across
navigations — hook `console.error` live rather than trusting what it shows.
Two things were captured, judged bad and fixed this way: the layout read as a
**green cake in a tin** (the embankment flares into the plywood now) and the
cover was an **additive ghost-wisp** (it is a real sagging sheet over the board).


---

## THE GRID IS A RESOLUTION, NOT A SIZE (N = 96)

The board is a fixed physical thing. `C.N` only decides how finely it is sampled.
`export const S = C.N / 64` is the factor against the grid this game was tuned
at, and **every number expressed in cells has to move with it** or the world
silently changes shape — the finger would cover a different fraction of the
town, kin would walk at a different real speed, foraging would reach a different
real distance.

Three classes, and getting the class wrong is the whole difficulty:

| class | scale by | examples |
|---|---|---|
| **distances in cells** | `S` | `HAND_RADIUS`, `SPEED`, forage/water/warmth/flee radii, arrival thresholds, grave and clutch scatter, the hearth's "8 cells from water" |
| **1/distance coefficients** | `1/S` | every `/(1 + d * k)` falloff in `_decide` — `d` grows with the grid so `k` must shrink |
| **absolute amounts spread over the board** | `S²` | `humid`, `CLOUD`, `RAIN_PER_STEP`, the breath's `+4.5`, squared distance tests |
| **per-cell rates — DO NOT SCALE** | — | `EVAP`, `MOSS_GROW`, `DIFFUSE`, `LOSS`. They already apply to every cell, so their totals follow the cell count for free. Scaling them double-counts. |

### ⚠️ The two that were missed first time, and how they showed up

1. **NOISE FREQUENCY IS PER-CELL.** `vnoise(x * f, …)` samples at the cell index,
   so with 1.5× more cells it walks 1.5× further through the noise and the hills
   come out **1.5× smaller in real terms**. Raising the grid made the board
   flatter — the exact opposite of the point. `f = 1 / (22 * S)`. Verified by
   A/B against a 64-grid copy of the same file: relief over a tenth of the board
   0.0693 → 0.0748 (108%), height span 0.667 → 0.672, pond 10.8% → 10.8%. Same
   world, sampled finer.
2. **AN UNSCALED ABSOLUTE IN THE VIEW.** The weather haze triggered on
   `s.humid - 5`. `humid` is a whole-board quantity, so at N=96 it is 2.25×
   larger and the haze pinned at full opacity **permanently** — a milky veil
   over the entire town that read as a washed-out mint bald patch. I spent three
   passes hunting the ground palette for it before measuring the albedo and
   finding it was identical inside and out (57,93,42 vs 71,112,50). **If a view
   constant is compared against a sim quantity, it is in that quantity's units.**

### What actually changed for the player

A bigger board holds more standing moss, so it feeds more kin. That is the
point — a huge map with sixty people would read as empty — but it has knock-on
effects that are real, not cosmetic:

- Population roughly follows area. Measure before assuming a balance number
  still holds.
- **A bigger board is a bigger larder.** The "left in the dark" test had to go
  from 140 to 200 days, because the colony now eats through 2.25× the standing
  stock before it starves. Measured: below 8 alive on days 40 / 80 / 159.
- The same population grazes a smaller fraction of the board, so moss sits
  nearer saturation and the ground reads greener and more uniform.
- Save grew with the field arrays. `height` is now dropped from the save
  entirely — it is regenerated bit-identically from the seed by `fromJSON`'s own
  constructor call, so shipping a copy was ~170KB written every 25 seconds for
  nothing. `fromJSON` tolerates saves that carry it and saves that do not.

### The rule for next time

**Do not change `C.N` without re-running the grid battery** (`battery.mjs` in
the session scratchpad, kept as the pattern): the same seeds and the same
harness against a 64-grid copy of the current file, so the two columns describe
the same world at two resolutions rather than two different games. Anything that
moves by more than seed noise is a cell-denominated constant you missed.

## Invariants (bible §17) — these are contractual

1. **Determinism.** Seeded RNG only. Never `Math.random` in sim code. Never `Math.sin/cos/pow` in
   sim code either — they are not spec-pinned across engines. `tsin`/`tcos` are the table versions.
   The RNG discards its first six draws.
2. **Sim vs view.** `sim.js` imports nothing. If it ever imports THREE, the headless battery dies
   and with it every soak, every determinism test, and any future co-op lockstep.
3. **Everything round-trips.** New persistent state ships with a save→JSON→restore→compare test
   **in the same session it is written**. The RNG stream state round-trips too (`getState`/
   `setState`) — without it a restored colony silently diverges.
4. **Soak before ship.** Zero errors, no NaN, nothing outside the jar, population never negative.
5. **No new verbs.** Warm, tilt, breathe, lid, light. Forever.
6. **No morality bar.** Not in the HUD, not in a tooltip, not in an achievement name.
7. **The lantern is the UI.** The game must be fully playable with every panel closed.
8. **Toys don't bleed.** Death here is a light going out and a burial.

---

## Where the numbers live

Everything tunable is in the `C` block at the top of `sim.js`. Current settled values and what
they actually control:

| | | |
|---|---|---|
| `TICKS_PER_DAY` 900 | one in-game day = 60 s at 1× | at 20× it's 3 s |
| `FIELD_EVERY` 5 | field physics on a slow lane at 5× dt | ~6.8k ticks/s at 150 kin, 22× what 20× speed needs |
| `HAND_HEAT` 150 / `HAND_K` 0.010 | the finger's 4–8 s lag | plateaus ~87 °C at the core, comfortable ring at r≈8 |
| `EVAP` / `CLOUD` 11 / `VENT` | the sealed water cycle | rain every ~4 days; open lid drains the jar in ~40 |
| `MOSS_GROW` 0.00024 (logistic) | the real carrying capacity | peaks land 100–200, then a bust |
| `BREED_MIN` 0.72 / `BREED_COOLDOWN` 34 | how fast a boom builds | |
| strain clocks | thirst 1.6 d · hunger 3.2 d · cold 0.9 d · heat 0.35 d · drowning 0.09 d | |

**Viability across seeds (300 days, unattended): 11 of 12 alive, generations 11–16, peaks
100–208, real boom-bust cycles.** One seed (`report`) still collapses early — see below.

## Debug rig

`window.__G` in the console: `sim` · `step(n)` · `run(days)` · `page()` · `fingerprint()` · `wipe()`.
URL: `?newgame` · `?seed=x` · `?pause`.

---

## OPEN — what M7 should pick up

1. **One seed in twelve still dies young.** `?seed=report` peaks at ~24 and collapses by day 50.
   It is not the hearth and not the burial spiral (both fixed); it looks like a bad terrain draw
   where the moss band and the pond don't overlap. Either fix worldgen to guarantee a viable
   starting basin, or decide that a jar that fails is a legitimate jar and give it a better death.
2. **Offline catch-up is honest but shallow.** `catchUp()` runs real ticks against a 2.5 s compute
   budget, so a full night away resolves as ~20 in-game days, not 1400. Bible §13.2 wants coarse
   batched ticks at 1 tick = 1 in-game hour. That needs a real coarse mode in `sim.js`.
3. **The chronicle has no long memory.** `page()` sifts by rarity over the whole run, so late
   pages are dominated by early rare events. It wants an era window.
4. **No kin memory yet** (bible §6.4). The Hand Taken, the Tilt, the Sky Shape — none of it is
   recorded, which is why belief and the theonym can't exist yet. This is the M7 prerequisite.
5. **Named-kin budget isn't enforced.** The bible says 18 named alive at once with demotion;
   right now names accumulate. Cheap to add, and it matters before the cast gets crowded.
6. **Touch.** Pointer events work but the tilt gesture has no touch equivalent, and there is no
   pinch-zoom. Needed before this goes anywhere near a phone.
7. **`prefers-reduced-motion`** is not honoured yet. House definition-of-done requires it.
8. **Layout art-pass candidates** (from the pivot, all view-only): the plaster tunnel
   mountain straddling the track at the back; instancing the trees/houses if the scenery
   count grows (~70 static meshes today, fine); dust motes biased into the bulb cone.
9. **The glued-down figure.** Dad glued some people mid-stride. A named kin who is alive
   and can NEVER move — fed, visited, grieved by the others — is the best character idea
   the pivot produced. It wants §6.4 memory, so it's an M7 design, not a view hack.

## For Kyle (bible §22)

Title, roadmap slot against Dec 2, Steam price, how dark the dark end gets, and whether the
second species is v1 or a patch. Nothing in the code assumes an answer to any of them.

---

---

## v0.5 — THE SHELL, THE CONTACT LAW, AND THE ONE YOU LIFTED (2026-08-20)

**File table above is stale from v0.4 on:** `sim.js` is ~1,850 lines, `test-sim.mjs` is
**85 tests**, and there are two new modules — `gesture.js` (pointer → named gesture; knows
nothing about the sim) and `palette.js` (colourblind hue LUTs; view-side only).

### ⚠️⚠️ THE COVER WAS INVERTED — FIVE SITES, AND A GREEN TEST GUARDING IT

`lid === true` means the sheet is **ON**. That is what the button says and what the help
card has always promised — *"under the plastic their rain comes back."* But `C.LID_LOSS`
and `C.VENT` are both documented **in the constants block** as the cost of the board being
**OPEN**, and both were applied when it was **CLOSED**.

Measured over 20 days: covering the town drained the pond to 0 and the air to 0 and left
**3 of 13 alive**. One of the five verbs did the exact opposite of what the game said it did.

Five sites, all consistent with each other and all disagreeing with the player:
1. `_thermal`'s heat-loss term
2. `_fluids`' vapour vent
3. the narrator's `'cover'` drought beat
4. `view.js`'s `want = s.lid ? 1 : 0` (ct = 1 slides the sheet OFF)
5. `view.js`'s `coverT` **initialiser**, which the render loop then eased away from

**And the suite was green the whole time**, because the test called `setLid(true)` and
labelled it *"open lid"*. The bug had a passing test guarding it. A green test is not
evidence the behaviour is right — it is evidence the code and the test agree, and here both
were wrong. The board now **starts covered**, because dad keeps it covered, and taking the
sheet off is the transgression the title is named after.

### THE CONTACT LAW — why there is no sixth verb

`setHand(x, y, {r, heat})`. A **still** hand opens out and cools to 40°; a **moving** one
stays a small 150° point. Everything the finger can do is a curve through those two numbers.
Measured on a settled board: resting holds the ground at 32°, inside the comfort band of
plain [18,32], ash [26,41] and slick [20,34]. Moving holds 86° at the centre, past every
lethal ceiling in the game.

⚠️ **Before this, EVERY touch ran at the moving number** — which is why the finger only ever
read as cruel. There was no gentle setting to find.

⚠️ **Stillness is measured in PIXELS, not cells.** Whether a hand is moving is a fact about
the hand. A finger resting on a capacitive screen wanders 1–3px continuously at 60Hz, so a
cell-based threshold makes the game's *kindest* verb unreachable on a phone. (The cell
threshold survives as a second gate, for a big sweep at a zoomed-out camera.)

⚠️ **Do not key any of this off `PointerEvent.pressure`.** It reads 0.5 for every mouse
button that is down and 0 when it is up. "Press harder" has to mean "press longer."

### ⚠️ THE KIND HALF OF THE FINGER RENDERED AS NOTHING

`_paintGround` only tinted above 40° and below 8°. Every comfort band tops out under 40, so
a hand resting at a perfectly kind 33° changed the board by **zero pixels** — and the first
feedback anybody ever got about their own hand was a scorch mark.

⚠️ **The warm floor is RELATIVE to the room and has to be.** A settled board sits at 20.5°
with the bulb off and 23.8° with it on; a fixed floor of 25 lit all 9,216 cells as "touched"
the moment a hand rested anywhere. It is now `ambient + daylight*SUN_GAIN + 3`, hoisted out
of the per-cell loop. Measured after: untouched board **0.0%** warmed, a resting hand **2.4%**,
nothing burned.

### THE ONE YOU LIFTED (§9.3) — the first literal new power

Kyle explicitly softened P1 to allow powers the five verbs cannot reach. This is the one that
matters: every other verb acts on a **radius**; this acts on a **person**, and it is the only
irreversible act in the game.

- Sheet off + press and hold **900ms** on a kin. The ring tightens onto them and goes red —
  that is the only warning, and there is no dialog because a hand does not have one.
- Release **over the board** → set down: warmth full, safety 0.05, strain +0.25, and a name.
- Release **off the board** → `_die(id, 'taken', noBody)`. **No corpse is pushed**, so there
  is no body, nobody comes to carry it, and the yard ends with a stone for everyone except
  that one. Verified: the taken one gets 0 stones, an ordinary death gets 1.
- ⚠️ `pointercancel` **always sets down**. iOS steals touches constantly and "the browser
  took my finger" is not an acceptable cause of death in a game with no undo.
- ⚠️ `catchUp()` sets down before its burst, or somebody starves in a hand that is not there.
- ⚠️ A short press that never completes the ring **selects** the kin. Without that, with the
  sheet off, every press on a kin did nothing at all and the game looked broken.

**`k.saw`** (inside `k`, so it round-trips free) records the witnesses, and is deliberately
**exempt from `_daily`'s memV decay** — the hand is forgotten, the one it took is not.
The sign comes from each witness's **own comfort band against the ground they are standing
on**, the same rule the ordinary hand-memory uses. Measured on a real town: **12 witnesses,
10 took it well, 2 did not.** That disagreement is §9's schism seed and it is generated, not
authored.

### The shell

Title screen = the board under its sheet in the dark, entered by pulling the light on.
⚠️ **The title is a LOOK, never state** — it must not call `setLamp`/`setLid`/`setCurtain`,
all three of which are persistent and fingerprinted. Verified: a returning player's lid, bulb
and curtain all survive it untouched. Pulling the chain turns the bulb on **only on a fresh
town**.

**Colourblind palettes, solved not guessed** (`palette.js`, CIE Lab ΔE under the Viénot
projection, worst pair in each set):

| | need hues | genetic hues |
|---|---|---|
| as painted, normal | 26.2 | 44.3 |
| as painted, **deuteranopia** | **1.0** | **6.7** |
| green&red palette, deuteranopia | **24.1** | **31.1** |
| blue&yellow palette, tritanopia | **20.4** | **27.6** |

⚠️ The need hues were the emergency, not the bloodline ones: NEED warmth 205 and water 190
are 15° apart, so for roughly one man in twelve the light meaning *"I am freezing"* and the
one meaning *"I am dying of thirst"* were the same colour. ⚠️ **The remap is view-side only** —
`k.hue` is written by sim code and folds into the save and the fingerprint. ⚠️ **Hue alone
cannot carry six categories for a dichromat**; a first attempt folded the wheel onto the
surviving axis and collapsed everything to ΔE 1 (many-to-one). The warps are monotonic and
bijective, which is the most hue can do — the glyph channel is the rest of the answer.

### Smaller things that were simply wrong

- **The weather strip was a constant.** It asked `humid > 4.4`, but humid is S²-scaled: it
  starts at 11.25 on a 96 board and the rain threshold is `C.CLOUD` = 24.75. Measured over
  60 days it said "close" **59 times and "clear" zero times, ever.** Now a fraction of
  `C.CLOUD`, which also makes it predictive — the only job a weather readout has.
- **The speed keys were 1/2/3** while the help card advertised **1 · 4 · 20**. Pressing the
  key the game told you to press did nothing. Both work now.
- **No target guard on keydown**: with the window slider focused, L still dragged the cover
  off and space still breathed on the town.
- **375px**: the fascia came to 391px of content in a 375px bar, so *book* and *box* sat off
  the right edge with no keyboard to reach them. Fixed by dropping the two toggle captions
  under 430px. Verified: nothing off-screen, no control under 40px, no horizontal scroll.
- **Removed from the always-on HUD**: `% lit` (a mean of `k.bright` — a health bar with the
  label filed off) and the running grave count (§9.5's scoreboard, printed). The rule that
  generated this: *the always-on layer may show only what is true of the ROOM, never what is
  true of the KIN.* Both live in the book now, where you had to go and open them.

### ⚠️ Measured, and therefore NOT built

- **THE RING as a recognised gesture.** A drawn circle already isolates a kin, because
  `_decide`'s warmth scan rejects cells above `band[3]-3`. The "fence" version changes
  pathing on every board in the game, not just inside your rings, and its effect on the death
  histogram (hunger is 60–75% of all deaths) is unmeasured. `gesture.js`'s latched ring test
  also fires on any out-and-back scrub over 40px — a nervous hand would draw circles.
- **LEAN as a discrete gesture class.** Its premise is backwards: a *smaller* kernel runs
  **cooler**, not hotter (R=4 → 78.7°, R=12.75 → 93.2°), because a small hot spot loses more
  laterally into cold ground. The continuous still↔moving crossfade degrades gracefully where
  a discrete flip does not.
- **THE SHADE (hover to block light).** Its idle state is "shaded" — a cursor parked over the
  board is always still, so going to make tea starves the town with a famine nobody performed.
- **A seventh genome locus.** `genome` is flat and per-kin-strided and `fromJSON` does a bare
  `.set()`, so adding a locus misaligns every kin after the first and randomly reassigns every
  hide band, lifespan, brood, temper and marrow allele in the colony. Needs its own commit.
- **A tray, a hotbar, or any inventory.** A fixed strip of pickable tools is a mode selector,
  and putting TAKE in it turns the pivot of the theology into a button.
- **Any tally of taken against given.** That is an alignment bar with the adjectives filed
  off. The sanctioned alignment display is a TEXTURE, not a total: render `worn`, the scorch
  and the water stain live, store nothing, count nothing.

### THE CRUMB (give) — the second literal power, and the kind one

Sheet off, **tap twice** on the board. A crumb comes down and stays where it landed.

⚠️ **The design note had this picked up off dad's saucer on the plywood, and that is
impossible here.** `view.js` is explicit — *"there is no bare plywood to look at, because
you are never outside the layout"* — and Kyle's standing rule is that the real world never
appears in frame. There is nowhere outside the board to put an object. The player's hand
**is** the sky, so the crumb falls out of it. A double tap is the one gesture left that
collides with nothing: not rest (a hold), not draw (a drag), not the reach (a hold on a
kin), not orbit (off the board), not tilt (shift or right).

Why it matters: every one of the five verbs is a **field** — heat, slope, humidity, light —
all diffuse, temporary, and applied to a radius. A crumb is none of those. At 4mm scale it
is a boulder of food on a moss layer that is smooth and regrows everywhere, so it is the
town's first contested resource, the first thing worth crossing the board for, and the first
thing that runs out.

⚠️ **Rate measured, not picked.** At 0.012 per bite a crumb was stripped in **84 ticks** —
under six sim-minutes — so it was gone before anybody could walk to it and the whole point
never happened. At 0.0006 it is roughly twenty-eight half-meals. Measured attraction over
3 days: chosen 113–151 times at every distance from 6 to 30 cells.

⚠️ **Whatever is left of a stale crumb becomes moss**, not deletion. Nothing is ever simply
removed from a world whose entire subject is that marks stay.

⚠️ **The crumb's body is scaled by the CUBE ROOT of its mass**, because mass is a volume.
Linear scaling made it vanish long before it ran out, so the board lied about how much was
left.

### ⚠️⚠️ "FEEDING THEM RUINS THEM" WAS TESTED AND IS FALSE

The design note asserted that a fed town invents nothing and never reaches a tradition,
because `_weave` gates every invention on need pressure — *"the kindest player gets the
emptiest book."* Measured over 120 days on three seeds, with the sheet **on** for both sides
so drought was not the variable:

| | invented | traditions | standing | alive | book |
|---|---|---|---|---|---|
| seed a, fed | 5 | 6 | 13 | 124 | 389 |
| seed a, alone | 5 | 6 | 9 | 20 | 199 |
| seed b, fed | 5 | 6 | 8 | 34 | 228 |
| seed b, alone | 5 | 6 | 8 | 18 | 191 |
| seed c, fed | 6 | 6 | 9 | 72 | 420 |
| seed c, alone | 6 | 6 | 4 | 8 | 201 |

Inventions and traditions are **identical every time**. Fed towns build more, live far
longer, and write a book twice the length. **Feeding is simply kind**, and the crumb is a
straightforwardly good power — which is what balances the take. Do not "fix" this into a
punishment; if the kindness is supposed to cost something, that is Kyle's design decision,
not a comment's opinion.

The cost that **is** real is the sheet. Your arm has to be in their sky, and 20 days
uncovered takes the pond to zero and ten of thirteen with it. Feeding in short visits costs
almost nothing; leaving it open to keep feeding costs everything.

### Still open

**DAD'S CORNER** (move the world) is specified and unbuilt — it is the third power, and the
only one that would let a player change the SHAPE of their world (`this.height` is written
once in `_genWorld` and never again, and `_fluids`, `_move` and `eff()` are all downstream
of it). It needs `this.baseHeight` plus a `_restamp()` applied after `_genWorld` derives
pond, yard and hearth from the seed — put props in before that and a lump relocates the
graveyard on load. The
7th WORKS row, *"the mark"* (inventor gate = `k.saw > 0.5` near a recorded lift, then the
unmodified weave: invented → taught → decayed → lost → **tradition**), is the payoff that
makes the take generate a religion, and it is not built either.

---

---

## v0.6 — THE PEOPLE, THEIR HOUSES, AND THE CEILING THAT DIED (2026-08-25)

Built against a 15-step flagship spec produced by a 12-agent research pass (full bible
audit + real research on Anno 1800, SimCity 4 and Thronglets). The spec, its verifier
flags and the research findings are in the workflow journal for run `wf_43c00b00-278`.

### THE LITTLE ALIEN PEOPLE

Kyle: *"i dont like the little lantern guys - i want it to be more like little alien people."*
The dark blob + engulfing glow is gone. The figure is ONE hand-merged geometry — lathe
torso, oversized head, stub legs, arm nubs, eye-whites — plus a dark features layer
(pupils, mouth dash, antenna) and the old lantern **shrunk to the antenna tip**.

⚠️ **BufferGeometryUtils is an examples module and is NOT in the vendored core.** Everything
is hand-merged via `toNonIndexed()` + concatenated position/normal arrays. Do not reach for
`mergeBufferGeometries`; it does not exist here.

**The interface did not die, it moved.** The lantern *was* the entire UI (hue = worst need,
brightness = wellbeing). Now: body PAINT carries the hue (per-instance `setColorAt`),
POSTURE carries wellbeing (a failing kin droops — legible at distances where colour is not),
and the TIP keeps hue + brightness. `pickKin` still reads `lanternPos`, so the reach, the
inspector and every power survived untouched.

Also on the body, all view-only reads of already-fingerprinted state: gait amplitude scales
with `k.bright` (**amplitude only — never frequency**, a rate change teleports the whole
colony's phase), a shiver below 0.25, RIME at 0.6 amplitude and 35% toward bone-grey,
**family silhouettes from the two marrow allele bytes** (children resemble parents, so
bloodlines share a shape), temper posture, and THE BURDEN — a fifth and final InstancedMesh
showing what is being carried, bone-pale for the dead, raw-timber for building.

⚠️ **The colony's draw-call ceiling is 5, forever**: bodies, features, tips, burden, glue.

### ⚠️⚠️ THE FALL HAD NEVER FIRED, IN ANY SHIPPED BUILD

`if (o.prog < WORK_DONE) continue;` sat ABOVE the decay line in the aging loop, so the first
decay tick pulled a work under 0.98 and the loop skipped it forever after. Every building in
the game froze at **0.9799** and *"went back to the ground"* was unreachable code.

The contract now: **SERVICE gates on standing; DECAY runs on anything that was ever
finished.** Construction sites (never finished) do not rot. Measured after: the beat fires
4 times in a dead town and **0 times in a living one** — because `_workFor` offers anything
under WORK_DONE to builders, so a slipping roof gets hands on it long before 0.50. The fall
is for the dead, the empty and the forgotten.

### THE 37-STRUCTURE CEILING IS DEAD

The old `cap` column totalled **37 buildings maximum, EVER** — 0.4% of a 9,216-cell board —
which is why coverage stalled at 17.6% at day 1000 no matter what happened. Caps are sanity
ceilings now (total 122), room scales with hands, and **the cap reliever is the game's own
signature system**: once a practice is TRADITION, the town builds denser (`per × 0.6`).
The existing 3-cell spacing check makes LAND the real limit, so the board fills as a town
rather than a carpet.

Measured at day 600, 3 seeds: **81 and 74 standing works, ~40% board coverage** (was 37 max
and 17.6% stalled). One seed still died out — extinction is not solved, and should not be.

### HOMES — somebody lives at the house by the bank

`k.home` is a **work ID**, not an index, which is why work ids had to exist first
(commit A of step 8: `o.id`, `workSeq`, `workById()` as a **linear scan, never a Map cache** —
a cache drifts after `fromJSON` and a stale one is a wrong-home bug that surfaces days later).

⚠️⚠️ **`-1` is 'nowhere' and `0` is a VALID work id.** A legacy save without `k.home` must be
filled with -1 in `fromJSON` or every restored kin silently claims the first thing the town
ever built. There is a pinned test for exactly this.

Adults claim the nearest standing hut/house with a free bed (hut 3, house 6), ties broken by
lower id — an argmax, never an assignment (§18 intact). Homes give real rest (0.014 → 0.022),
safety, and night company; a stranger in someone's doorway during a heat press gets 0.55 of
the shelter, which is a story. Children are born into the household and the **HALF→WHOLE
transition is the leaving-home moment**. Doors are inherited by the lowest-slot unhoused
child. Measured: **60–100% of adults housed across 3 seeds by day 200.**

⚠️ **The splice is the ONE cleanup funnel.** Everything referencing a work by id clears there
and only there — a second cleanup site is how two systems end up disagreeing about whether
somebody still lives in a house that no longer exists.

### ⚠️ DUSK: WHAT TRACING FOUND THAT TUNING NEVER WOULD

Three raised-pull attempts all failed to bring the town home at night. Tracing three kin
through a full evening showed why: at nightfall most were **mid-errand with commitment holds
of 200–770 ticks**, so they did not even re-decide until deep night — and a kin 25 cells from
home needs ~600 ticks of walking against a ~300-tick night. **No pull strength beats
arithmetic.** Two mechanisms shipped instead: a once-per-evening sweep capping every open
hold at 90 ticks, and home answering the COLD (night is cold; home is the warm place) rather
than only tiredness — because traced rest stayed high all night, so a rest-only pull could
never win.

⚠️ `_duskSweep` **must round-trip** (it is in `narr`): a save loaded after tonight's sweep
would otherwise sweep again on one client and not the other, and diverge that evening.

**Honest status:** the mechanisms are in and correct, but aggregate night-homecoming is still
weak (4–6 of 26 housed adults near home at night; only seed hc showed the intended 1.5×
day/night contrast). The remaining gap is **distance** — towns are sparse and homes are far.
It should be revisited after the trades and the settled land, when towns are denser and
richer, not by pushing the number again.

### ⚠️ THE SURVIVAL OVERRIDE, AND THE FIRST VERSION THAT GUTTED THE WEAVE

Found by test: a starving kin chose goal 10 (building) over eating and died with its tools
out. The empty-cup rule existed for tend and carry errands, but nothing stopped a long
errand outranking food once nearby moss was grazed thin and the food score was
distance-damped into the floor.

**The first fix whitelisted eat/drink/flee below 0.25 — and it broke two culture tests.**
Measured: 14.2% of adult-days sit under 0.25 on a struggling town, and building is only 1.2%
of adult-days to begin with; locking those days out meant works never finished, `stands`
never fired, and practices never spread past their inventor. **A hungry town must still be
able to build its way out — that is the whole engine.** The shipped version blacklists only
the long deferrable errands (courting, building, the two trades) at 0.15, which means
genuinely critical rather than merely hungry.

### Smaller, and the traps

- `k.knows` is **Uint16Array** now (16 rungs; the planned ladder needs 11).
- ⚠️⚠️ **WORKS IS APPEND-ONLY.** A rung's INDEX is save format twice over: `k.knows` is a
  bitmask over these indices, and every work stores `o.kind` by index. Insert a rung in the
  middle and every save's heads and buildings silently become the wrong things.
- Old `prac` arrays are padded on load, so a save from a shorter ladder still opens.
- The inspector shows trade and home, both guarded (`k.job && ...`) so a pre-trades sim
  cannot throw on a click.
- ⚠️ **Anchor-based patching hit the wrong function twice this session** — a `// mate` anchor
  matched in `_weave` before `_decide`, and `let alive = 0` appears twice in sim.js. Anchor on
  something unique to the target function, and parse-check every time.
- ⚠️ **Patch scripts containing template literals must be written with the Write tool**, never
  a bash heredoc or `node -e` — backticks and `${...}` are eaten. This is the third session
  to lose time to it.

### Still open, in spec order

**THE TRADES** (step 11) is fully written and staged at
`scratchpad/patch-trades.cjs` with its gate harness at `scratchpad/trades.mjs` — forager and
water-carrier as real two-phase errands with a pack, the channel finally *doing something*
(it has been decor since it was invented: the finished-works service loop only ever handled
windbreak and store), the mender as a `_workFor` distance bias, the teacher as a widened
threshold on the same rng draw, settling by DEED at 8, and vacancy demand. Then step 13 THE
SETTLED (satisfaction promotes, promotion wants more — Anno's engine in the weave's clothes),
step 4 the camera and the guttering lantern, and step 14 the upper ladder.

---

## v0.7 — THE GAME BECOMES WATCHABLE (2026-08-25)

Kyle, four times: *"there are no powers or way to interact"*, *"where are the
buildings and civilization"*, *"weaker than tomagachi - its just not fun"*.
Every one of those was **literally true from where he sat**, and almost none of
it was the systems being missing. It was three numbers.

### 1. `TICK_HZ` 15 → 45 — the single highest-leverage line in the project

`TICK_HZ` is read in **exactly one place**: the frame accumulator in `main.js`.
Nothing in `sim.js` reads it. So raising it replays the *identical tick
sequence* faster in wall-clock — same seed, same world, same fingerprint, same
saves, harness completely unaffected.

It shipped at 15, a **60-second day**. That meant a kin crossed the board in 78
seconds and a player watching for five minutes saw nothing happen. At 45 a day
is 20 seconds and a kin crosses in 26.

### 2. The default camera was the entire "where are the buildings" bug

The zoom range is 0.60–2.75 and `view.js` opened the game at **2.35** — almost
fully zoomed OUT, where a kin is a three-pixel dot and a hut is a smudge.
Photographed at the same instant, same seed, nothing else changed:
- **2.35**: a dark green rectangle with fireflies on it.
- **1.25**: a village — pitched roofs, chimneys, tents, little glowing people
  you can tell apart, crowds around the buildings.

The art was never the problem. Default is now **1.25** and the near limit went
0.75 → **0.60** so you can get down among them.

### 3. Pacing: the ladder was generational, so nobody ever saw it

`near: 1` rungs (hut/house/hall) waited for their prerequisite to become a
**tradition** — which requires somebody repeating it who was born after the
inventor *died*. Measured at 1×: first hut **83 real minutes**, first house
**4.2 hours**, the hall **5.8 hours**.

The valve: a practice also counts as settled once **more than one living head
carries it** and it has stood **12 days**. Real tradition still fires, still
logs, and is still what makes a rung build *denser*. Dwelling effort also cut
(hut 900→300, house 1600→620, hall 2600→1300).

| | before | after (1×) | after (4×) |
|---|---|---|---|
| store | 11–30 d | 3.0–10.0 min | 45 s – 2.5 min |
| first hut | 83 d | 6.7–17 min | 1.7–4.3 min |
| house | 251 d | 11.3–21 min | 2.8–5.3 min |
| hall | 348 d | 17.7–39.3 min | 4.4–9.8 min |

⚠️ `_weave` now tallies **every** practice's holders in ONE pass at the top
(`hold[]`). The valve's first version called a full population sweep per
prerequisite per candidate — 200M+ reads over a 300-day run, which turned the
battery from minutes into "is it hung?".

### 4. 🐛 DESPERATION MADE THEM SEARCH WORSE — a real, pre-existing forage bug

Measured on `bat0` at day 300: **17 kin starving to death**, every one in the
same overgrazed corner with moss 0.00–0.11 underfoot and **saturated moss
(1.00) five to eight cells away**.

The near scan in `_decide` reaches 4 cells. When it fails, the fallback is 18
random samples in a box that **grows with hunger** — at hunger 1 that box is
99×99, so 18 samples cover **0.18% of it** and essentially never find a patch
six cells away. The hungrier they got, the blinder they searched.

Fix: a strided exhaustive scan of the **middle distance** (9·S cells, step 2,
~150 reads) between the two, for a kin the near scan already failed. Consumes
no rng. **17 → 1.**

### 4b. 🐛🐛 THEY ATE WITH THEIR FEET — the biggest bug in the project

Found by the audit, and it is the single most consequential line in `sim.js`:

```js
case 1: if (near && this.moss[i] > 0.05) {      // i = the cell they STAND on
```

`near` only requires being within `0.8 * S` (**1.2 cells**) of the target, and
`i` is the cell underfoot. So a kin could pick the best moss on the board, walk
the entire way to it, **stop one cell short — and be refused the meal entirely.**
The goal stayed satisfied-ish, the hold ran down, and they starved in arm's
reach of food.

**Hunger was 90% of all mortality on a board that is 89% covered in moss.** Half
the chronicle is funerals for a death nobody caused.

Fixed by letting them reach: a 3×3 scan for the best moss within one step, and
the take is decremented from the cell they **ate from**, not the one they are
standing on. Measured on `bat0` at day 300, kin starving with saturated moss
within eight cells: **17 → 0**, and the living population went 49 → 61.

⚠️ Two other things were tried at this and BOTH were wrong, because both treated
it as a decision problem when it was a reach problem:
- **goals 3 (warm) and 5 (company) added to the `starving` emergency set** —
  catastrophic. Warmth-seeking is constant, so it made hunger the standing
  emergency the code already warns about; `_decide` ran every tick and the town
  thrashed. Seven tests went to "nothing was ever built", "only 0 kin carry any
  practice", "no practice ever became a tradition". **Never add a common goal
  to that set.**
- **a "famine" weight on the food candidate's score** (up to 2.6× below need
  0.15) — measured WORSE, 1 → 5. Weighting the score harder just makes them
  re-target between patches at successive decisions and arrive at neither.

**Fix the mouth, not the appetite.**

### 5. Discoverability: the inspector was built and unfindable

Name, age, stage, trade, all six need bars, the genome strip — all correct, all
one click away, and **nothing on screen had ever suggested a figure could be
clicked**. No cursor change, no highlight, no name. A system nobody can find is
a system that does not exist.

`pointermove` returned immediately unless a button was down, so the pointer
could cross forty living people and the screen never acknowledged one. Now:
a pulsing halo (`view.setHoverKin` / `_hoverFrame`) and a DOM tag with the
person's **name and what they are short of** (`main.js _setHover` / `_moveTag`).
Throttled to 15Hz, `pointer-events:none` on the tag, wrapped in try/catch, and
sim-read-only — it cannot desync a replay.

### ⚠️ THE LAMP: TRIED, MEASURED, REVERTED — do not try it again

`lampOn = true` looks like the obvious fix for "the board goes black every
twenty seconds". It is the wrong tool, in two ways that only measurement finds:
- `ambient` is `ambientBase + (lampOn ? 1.6 : 0)`, so it warms the **whole
  jar** — a thermal test caught it at 22.4 against ambient 20.6.
- `get daylight` puts a **0.22 floor** under night, which feeds the moss all
  night. The town grew 46 → 64 and a sixth of them starved in the overgrazed
  corner above.

And it was solving a problem that **does not exist**: photographed at true deep
night (`daylight` 0.0105, lamp off) at the new camera distance, the board is
perfectly readable — houses, tents, ponds, the rail, amber kin. The original
black frame was the 2.35 camera plus an un-decayed `titleDim`, not the
lighting. Darkness a player cannot see through would be a **view** problem;
this one was not a problem at all.

### VFX (`vfx.js`, 893 lines, new)

Three pooled systems behind `ring / burst / column / converge / trail / splash`
plus a semantic `fire(name, cx, cy)` for the twelve verbs. **Draw calls idle 53
→ busy 56, delta 3**, with 9 verbs + hand + tilt + breath + 2 trails live at
once; every pool drains to exactly 0. Traps it hit are worth keeping:
- `${46.0}` in GLSL emits `46` → `min(float,int)` has no overload → the whole
  points program failed to compile and **every mote silently did not exist**.
- transparent + `DoubleSide` = **2 draw calls per mesh**; `forceSinglePass:
  true` is the difference between delta 5 and delta 3.
- The Browser pane's canvas is 0×0, so `getDrawingBufferSize().y` is 0 →
  `gl_PointSize` 0 → invisible motes **on the exact surface this is verified
  on**. Floored at 240.

### Verification for this batch

- **`node test-sim.mjs` — 94 passed, 0 failed**, against a HEAD baseline of
  94/0 measured by running the identical suite against `git show HEAD:sim.js`.
  Do that when attributing a failure; it is the only way to tell your
  regression from a pre-existing one.
- **8 seeds × 300 days unattended: 8/8 towns alive** (HEAD 8/8), with **373
  buildings standing against HEAD's 297**, and 61% more standing by day 60.
- Starving with saturated moss within eight cells, seed `bat0` day 300:
  **17 → 0**.
- Live: hover on/off from real pointer events, all 12 VFX verbs fire and drain
  to 0, the knock takes exactly 0.042 off every standing work, a call at dusk
  holds at 1400 and pulls mean distance 19.2 → 0, the placename nudge fires
  once and never again. **0 console errors, 0 warnings.**

⚠️ The suite is now noticeably slower — the eat fix means towns are ~50% bigger,
so every long test simulates more kin. That is the fix working, not a leak.

### ⚠️ What the audit found, and what it means for what comes next

A 45-agent read of the shipped build, measured not guessed:

- 20 real minutes at 4×, zero player input: **831 chronicle lines**. The
  maximum that could *ever* be about the hand is **15**, and 14 of those were
  `nonight` (a lamp+curtain observation). `scorch` fired 0 times in 240 days,
  `drought` 0, `warmth` 0. **A player's act is one dim line in a river of 831.**
- The four "the world noticed your hand" beats are rate-limited to once per
  14–20 in-game days *and* their thresholds are so hard they never fire.
- `nudge` returns early on a persisted key and **both call sites share the key
  `'sheetoff'`** — so at most one of them fires, once, forever. After a
  player's first session the game never speaks again.
- Every player act is logged with the agent deleted: *"something came down out
  of the sky and stayed where it landed."*

P2 (the town writes the record) and P3 (no score, no advisor) are why. They are
good rules that have been taken far enough to delete the player from their own
game. **The next batch is the consequence layer**: the world must visibly
answer a touch — without ever saying "you".

---

## v0.8 — DAD'S CORNER, and two systems that were written and never read

### 1. ⛰️ THE PLAYER CAN CHANGE THE SHAPE OF THE WORLD

`this.height` was written **once**, in `_genWorld`, and never again. It is the
only field in this world that does not decay — temp runs back to ambient, water
evaporates, moss regrows, memory fades — and the player could not touch a cell
of it. Every verb they had was weather. That is the mechanical statement of
"the map doesn't feel real": **you could not change the map.**

`shape(x, y, dir, f)` (sim.js) presses a soft Gaussian of ±0.06 over `3*S`,
clamped to [0, 1.2]. Held, not tapped — `_shape(dt)` in main.js runs it at 12Hz
at 0.34 of a handful, so a full hill takes ~1.5s of deliberate pressing and a
drag draws a ridge.

**Nothing downstream needed writing, and that is the whole point:**
- `_fluids` already re-routes every drop by `H[i] + tilt + W[j]` on the field
  lane. Measured: dig a hollow beside the pond and it goes **0.028 → 0.209 in
  60 ticks** (~1.3 real seconds). Carve a 16-cell channel out of the pond and
  **14 of 16 cells hold water.** Zero new code.
- `_move` already adds `-gx * slide * sp`, so kin **already** walk downhill — a
  raised ridge steers a whole town with no pathfinder involved.
- `eff()`, `pondLevel` and `placeName` all key off it, so a hill you make can
  become the high ground they name.

**⚠️ THE TRAP, AND HOW IT IS AVOIDED.** `_genWorld` derives the pond, the
graveyard and the hearth FROM the height. `height` is deliberately not saved —
it regenerates bit-identically from the seed. So the player's edits live in a
separate `this.lump` delta which is saved **sparsely** (`[index, delta, …]`) and
re-applied in `fromJSON` **after** the constructor has run genesis. Get that
order wrong and a hill somebody raised relocates the graveyard on load.
⚠️ `shape()` clamps `height` and then records **what actually landed** into
`lump` (`after - before`), not what was intended — otherwise the two drift and a
reload silently produces a different world from the one that was saved.
⚠️ `lump` is folded into `fingerprint()` **by index as well as value**, or two
towns — one with a hill, one flat — hash EQUAL and the round-trip test passes
while flattening the only permanent thing in the game.

View: `reshapeGround(cx, cy, r)` patches **only the touched rectangle** of the
191×191 display mesh (~72k verts) and recomputes normals. ⚠️ It patches
`pickMesh` too — miss that and the ground you SEE and the ground the pointer
HITS drift apart.

### 2. 🐛 `k.saw` WAS WRITE-ONLY — the one irreversible act had no consequence

Lifting somebody out of the world and letting go is the only thing here that
cannot be undone. `_witness` writes a signed memory into every watcher and
`_daily` **deliberately exempts it from decay** ("the hand is forgotten; the one
it took is not"). Grep gave **one write, one fingerprint fold, and zero
readers.** You could take somebody in front of forty witnesses and the town's
behaviour was byte-for-byte what it would have been.

It now gets exactly the read `k.memV` already has, at the same site and in the
same shape: a witness holding `saw < -0.35` scales candidate scores within
`6*S` of `this._lifted`. Measured with a control that wipes `saw` every tick
(nothing else reads it, so the two runs differ by one bias):
**the town uses that ground 44.5% less after watching it happen** — 32.5% → 18.0%
of kin-samples. Nothing tells the player why.
⚠️ `_lifted` now steers decisions, so it had to join the save and the
fingerprint. It was written-and-never-read before, so leaving it out cost
nothing; the moment it is read, a save without it reloads a town that forgave you.

### 3. 🐛 THE BETTER YOU PLAYED, THE LESS INFLUENCE YOU HAD

The crumb scored `deficit(2) * 3.4`, and `deficit` is `(1 - need)²` — so at food
0.9 a crumb scored **one percent** of its maximum and a well-fed town walked
straight past it. Every steering tool the player had was keyed to a deficit, so
the moment the town was thriving there was nothing left to do but watch. That is
the "it's not fun" complaint stated as an equation.

A small need-independent term now rides along, and it spends an allele that was
doing almost nothing: `temper: curious` was read in exactly one other place in
the whole simulation. **Somebody always goes to look at a new thing** — measured
2,375 goal-11 kin-frames in a fully-fed town — and the curious ones are the ones
who come, which is the first time hovering two of them shows a reason they differ.
⚠️ `_decide(id, g)` already receives the genome slice as `g`; do not re-slice it.

⚠️ MEASUREMENT NOTE: the first probe of this read 0 because it dropped the crumb
80 cells from the crowd, where the `1 + bd * 0.055 / S` divisor kills any score.
That was a bad test, not a broken feature. Drop it near somebody.

---

## v0.9 — DAD BUILT HIS DIORAMA FROM SOMEWHERE THAT EXISTS

Kyle: *"use home town as reference and OpenStreetMap + a free elevation model
to improve the map and world"* — after *"the map just doesnt feel real"*.

The board can now be **a model of a real place**. That is what model railroaders
actually do, and this board has had a rail loop round its edge since the first
commit, so the fiction was already sitting there.

```
node tools/bake.mjs --place "Keswick, Cumbria, England" --radius 800 --name keswick
node tools/bake.mjs --center 44.4759,-73.2121 --radius 900 --name burlington
```

Then `index.html?world=keswick`. Baked so far: **keswick** (Derwentwater and the
becks, 121.8m relief), **boulder** (Boulder Creek and the real street grid, 1,893
buildings), **centralpark** (2,392 water cells), **ithaca**.

### Sources — both free, both key-less, same pair HOMETOWN uses
| layer | source | licence |
|---|---|---|
| water, green, roads, buildings | **OpenStreetMap** via Overpass | ODbL, attribution carried in the world file |
| elevation | **AWS Terrain Tiles** (terrarium PNG) | public domain-ish |

### The contract, and why it is shaped this way
- `tools/bake.mjs` is **bake-time only**. `sim.js` still imports nothing: a bake
  writes `worlds/<name>.json` and the game reads it as plain data.
- `new Sim({ seed, world })` — `_genWorld` lays the real terrain down instead of
  value noise, then falls through to **the same `_genLandmarks`** as always. The
  pond, the graveyard and the hearth are all derived from `height` and do not
  care where it came from, so a real place gets a real pond in its real lowest
  ground for free.
- ⚠️⚠️ **`Sim.fromJSON(o, world)` takes the world as a SECOND ARGUMENT.** Noise
  terrain regenerates bit-identically from the seed, which is why `height` is not
  saved. Baked terrain **cannot** — it came off the network. So the save carries
  only `worldName` and the caller re-loads the file. A save that names a world and
  is handed none **throws**: the alternative is silently rebuilding the colony on
  noise with its homes, graves and pond all in the wrong place, which looks like a
  rendering bug and is actually the world underneath moving.

### ⚠️ Four things measured the hard way
1. **OSM green is ADDITIVE, never a replacement.** First version made a green cell
   0.72 moss and everything else 0.10 — and Ithaca baked with **zero green ways**,
   so the whole board came out at 0.10 and the colony was down to **one survivor
   by day 60**. Absence of `landuse=grass` means *nobody mapped it*, not that the
   ground is bare; coverage is good in cities and almost nothing rurally. The
   natural scatter always runs and OSM adds on top.
2. **Water is feathered from the bank, not pressed flat.** A flat 0.10 press turns
   a two-cell river into a walled trench: **nine kin drowned in 60 days** against
   zero on a generated world. A chamfer distance transform gives a wide lake a deep
   middle and leaves a stream ankle-deep. Drownings 9 → 1.
3. **The square lip still goes on.** It is a gameplay number, not scenery — it is
   what keeps water off the board edge. A real coastline slopes off the edge of the
   bbox and would drain the whole board without it.
4. **`fileURLToPath`, not `new URL(...).pathname`.** This project lives in a folder
   with a space in its name; the naive pathname percent-encodes it, so the first
   bake created a literal `New%20folder` directory, wrote 99KB into it, and printed
   *"wrote worlds/ithaca.json"*.

### Does a real place actually run a town?
Three of four do. 120 unattended days, same seed:

| world | alive | standing | note |
|---|---|---|---|
| (generated) | 176 | 56 | the baseline |
| keswick | 60 | 23 | |
| centralpark | 51 | 24 | |
| boulder | 49 | 17 | |
| **ithaca** | **0** | 6 | rural township, **69 OSM elements**, zero green |

Real places support smaller towns than generated ones — real terrain is more
constrained. ⚠️ **A sparse rural bbox makes a world that cannot support life.**
Prefer somewhere with real green and real water in it; check the `osm:` line the
baker prints before adopting a bake.

### 🐛 And a latent save bug it flushed out
`this.alive` is a cached aggregate recomputed at the end of every `_kin()` pass —
but `takeAway()` kills from **outside** the tick, so between a take and the next
tick the count was one too high. `fingerprint()` folds it, so **a save written in
that gap restored to a different hash than the town it came from** (caught at 31
vs 30). That is the harness reporting a desync that was never real. `takeAway`
now decrements it, by the same rule `_kin` counts with.

---

*Dirty Boy Devs. The jar runs, the tests are green, and nobody has told the player what they were.*
