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

### Does a real place actually run a town? Yes — as well as a generated one.

120 unattended days, **best of two seeds** (a/b), which matters — see the warning:

| world | alive | standing |
|---|---|---|
| (generated) | 49 | 20 |
| Keswick | 66 | 28 |
| Boulder | 61 | 22 |
| Central Park | 69 | 29 |
| Hallstatt | 51 | 29 |

⚠️⚠️ **AN EARLIER VERSION OF THIS TABLE WAS WRONG AND THE MISTAKE IS THE POINT.**
A single-seed run put generated at 176 and the real places at 49–60, and that got
written up as "real terrain is more constrained, so real towns are smaller".
Re-run across two seeds, the generated world scores **49** on the same measure.
The spread between seeds is far larger than the spread between worlds — so a
one-seed comparison of anything in this game is noise, and this project has now
made that mistake twice. Every world above clears the baseline.

⚠️ **A sparse bbox still makes a world that cannot support life.** `ithaca` was
baked, shipped, measured at **0 alive by day 300**, and deleted: a rural township
with **69 OSM elements** and zero green ways. Read the `osm:` line the baker
prints before adopting a bake — hundreds of green cells and some water is the
shape you want.

⚠️ The geocoder resolves a place name to a POI, not a town centre: "Keswick,
Cumbria" became *Keswick Climbing Wall & Activity Centre* and "Hallstatt,
Austria" landed on the mountain above the lake (866m of relief, **zero water**,
one building — and it still runs a town). Pass `--title` for the button label,
and `--center lat,lon` when you want a specific spot rather than whatever
Nominatim decides the name means.

### 🐛 And a latent save bug it flushed out
`this.alive` is a cached aggregate recomputed at the end of every `_kin()` pass —
but `takeAway()` kills from **outside** the tick, so between a take and the next
tick the count was one too high. `fingerprint()` folds it, so **a save written in
that gap restored to a different hash than the town it came from** (caught at 31
vs 30). That is the harness reporting a desync that was never real. `takeAway`
now decrements it, by the same rule `_kin` counts with.

---

## ⚠️⚠️ A NEGATIVE RESULT: THE DROWNING FIX THAT ISN'T (2026-08-27)

**Do not "fix" kin drowning in lakes without reading this. Three attempts, all
measured, all worse than leaving it alone.**

### The bug is real
`_move` walks a STRAIGHT LINE at `tx,ty`. There is no pathfinder and the project
has always refused one. It never mattered while water could not kill — deepest
water on a generated world, sampled across 300 days, is **0.1034** against a
lethal `water > 0.14`, and tilting the whole board for forty days only reached
0.0932. **Drowning was mathematically unreachable.**

Two things shipped in v0.8–0.9 made real depth reachable for the first time:
- a **baked real world** has real lakes — Central Park peaks at **0.1671** untouched;
- the player has a **shovel** — digging the pond out took a generated world to **0.2264**.

Measured on Central Park, 60 unattended days: **nine drownings**, every one on
`flee` or `wander`, and **not one** aimed at a target that was itself lethal
water. They were crossing the reservoir in a straight line.

### Every fix measured worse than nothing
Central Park, 4 seeds × 120 days:

| build | alive | standing | drowned | thirst |
|---|---|---|---|---|
| **do nothing** | 236 | **109** | 11 | 0 |
| refuse steps into water > 0.10 | **246** | 92 | 0 | 11 |
| ...plus reject targets across water | 171 | 90 | 0 | 4 |
| ...same, as a ×0.25 preference | 232 | 103 | 1 | 13 |
| refuse steps into water > 0.125 | 175 | 102 | 1 | 48 |

- **Doing nothing and the best guard have the SAME ELEVEN water deaths.** The
  guard only relabels drowning as thirst: a local refusal makes them dither on a
  shore instead of crossing.
- **Raising the threshold toward lethal made it far worse** (48 thirst deaths at
  0.125), which is the opposite of the intuition that sent me there.
- **Rejecting unreachable targets cost 65 kin** on the map it was meant to help,
  because Central Park is mostly reservoir and nearly every bank is across water
  from somewhere.
- On a *generated* world every variant is inert or near-inert — max depth 0.1034
  is below every threshold tried. The 0.125 build reproduced HEAD exactly:
  166 alive / 73 standing / 0 drowned / 1 thirst.

**Verdict: reverted to HEAD behaviour.** `sim.js` carries the numbers in `_move`
and nothing else changed. A real fix is a real pathfinder, which is a much larger
decision than a movement guard. Until then the lake is honestly dangerous, which
is arguably the better fiction anyway: this is the first hazard in the game that
the world itself can inflict.

⚠️ The general lesson, and it is the third time this project has learned it:
**a local guard on a global problem trades one death for another.** The same
shape as the starvation-emergency disaster in v0.7 and the famine-weight in the
same batch. Measure the death CAUSES, not just the population.

---

## 🐛 THE ROOM'S OWN TEMPERATURE WAS NOT IN THE FINGERPRINT (2026-08-27)

`ambientBase` is what every one of the 9,216 cells relaxes toward. It is a live
knob, it round-trips through the save, and it was **the only room control missing
from `fingerprint()`** — the sheet (`lid`), the bulb (`lampOn`), the window
(`curtain`) and the damp (`humid`, `rainLeft`) were all folded.

So two colonies, one in a 19° room and one in a 42° room, **hashed EQUAL**.
Measured on seed 3 from day 100, thirty days later:

| ambientBase | alive | deaths |
|---|---|---|
| 19.0 (the value that never moves) | 26 | hunger 19 |
| 30 | 11 | hunger 31 |
| 42 | **0** | **heat 16**, hunger 14 |
| 8 | 7 | cold 6, hunger 28 |
| 2 | 3 | **cold 21** |

The save round-trip test would have passed while the room reset underneath the
colony. Same class as `p.techs.size`, `p.mods` and the stale `alive` count.
**Anything the sim reads every tick has to be in `fingerprint()`.**

⚠️ This is also the prerequisite for the one design finding that survived
adversarial review: **the room is the antagonist.** `ambientBase` has never
moved in play, and the table above is what happens when it does — the deaths
sort by bloodline, because each hide has its own comfort band. Any threat built
on it would have been invisible to the harness until now.

---

*Dirty Boy Devs. The jar runs, the tests are green, and nobody has told the player what they were.*

## v1.0 — THE AGES, AND THE THREE THINGS NOBODY EVER WALKED TO (2026-08-27)

Kyle played it and gave two verdicts. The first: *"so weak compared to sim city
or anno or even thronglets — it's even weaker than tamagotchi."* The second,
after the map work: *"the world needs to be a self sustaining ecosystem if i
werent to lay a finger — they need to be able to farm their own food and make
their own water well … and the creatures need to progress through ages clearly
going from hunter gather to farmers and medieval to modern."*

Both were right, and every cause turned out to be measurable rather than a
matter of taste.

### 1. Buildings rendered at 66.7% of the size they were authored at

`_buildWorkView` ends with `g.scale.setScalar(S)` (S = N/64 = 1.5). `_paintWorks`
then overwrote it **every frame** with `setScalar(0.55 + f * 0.45)` — an
assignment, not a multiply. Every building in the game was capped at 1.0 against
an intended 1.5. That is most of why a finished town read as a scattering of
pebbles.

The footprint is now always full authored scale and only the HEIGHT ramps, so a
half-built work is a half-raised frame rather than a shrunken finished one.

⚠️ **Required companion fix**: `_paintNightLife` builds window and chimney anchors
from group-local offsets and never applied `g.scale`, so windows sank into walls
and chimneys smoked from inside the roof — always, since the scale was never 1.
Both loops now multiply by `g.scale` **before** `applyAxisAngle`.

### 2. Every roof pointed a different way

`g.rotation.y = rnd() * 6.283`. Fifteen pitched roofs at fifteen unrelated angles
reads as rubble, not a village. A building now finds the nearest **real OSM road
cell** and turns its front toward it; boards with no road data fall back to a
shared axis with jitter. Measured: yaw spread 6.28 → 0.52 rad on a generated
board; on Keswick (631 real road cells) the work faced its road at −0.01 rad.

⚠️ The `rnd()` draw is consumed on **both** paths so the view stream does not
shift depending on which world is loaded.

### 3. THE FOUNDING IS NOT YEAR ZERO — `_endowWorks`

Measured on Keswick: **day 46 held ONE work and 29 kin.** A player watching for
fifteen real minutes saw a single hut appear. The game's subject is a town and
there was no town on screen for the first quarter of an hour.

Dad's layout has been on that board since the nineties, so the town was always
already there. Genesis now lays down 14 works (3 store, 2 windbreak, 2 channel,
7 hut) and a worn lane between them.

- ⚠️ **This is the one place §18 bends, and it bends once.** It is WORLDGEN, not
  a build menu — it runs before the first tick and there is still no way for the
  player to place anything, ever.
- ⚠️ **The practices come with the buildings or the village rots.** A kin can only
  work on a kind it KNOWS, so endowed works nobody understood would never be
  repaired. Founders are granted the four practices, marked invented on day 0
  with **no inventor** — nobody alive remembers working it out, which is what a
  tradition is. The invention arc is untouched: house and hall are still theirs
  to discover.
- ⚠️ **Gated on `nFound > 0`**, exactly like `_seedColony`, because `Sim.fromJSON`
  restores into `new Sim({founders: 0})` — an ungated endowment would lay 14
  phantom works and a worn lane on **every load**.
- On a baked world the works are sited on **real OSM building centroids** and the
  hearth is pulled toward the real village centre, so the founding town sits
  where the actual town sits, lined along its actual streets.

Measured: day-15 dwellings **0 on every seed → 7–8 on every seed**; day-60
population mean **39.5 → 76.2**.

### 4. THE AGES — the spine the game was missing

`AGES` in sim.js plus `Sim.ageNow()`. Four rungs, each named for what the town
has already managed: **the gathering days → the settling → the turned ground →
the kept winter** (markers: nothing / hut / farm / granary).

- An age is **read off the board, never stored as progress**. Nothing accumulates
  and the player cannot push the town up the ladder.
- ⚠️ **An age can be LOST.** `ageNow` takes the highest age whose marker still
  STANDS, so a town that loses its last granary drops back and the chronicle says
  so. An age you cannot lose is a score, and §9.5 forbids scores.
- `this.age` (last-seen) is state, not derivation: it is in `toJSON`, in
  `fromJSON`, and folded into `fingerprint()`. Without it a reload replays every
  age-turn beat the town ever had into the page. It restores as `null` for old
  saves so `_daily` seeds it from the board instead of announcing the gathering
  days to a town centuries past them.
- Shown in the HUD beside the day. ⚠️ That line has a hard rule — *room facts
  only, never kin facts* — and the age passes it: it is a fact about what stands
  on the board, exactly like the day is, and it says nothing about how anyone is.

### 5. ⚠️⚠️ THE THREE THINGS NOBODY EVER WALKED TO

The same defect, three times, and it is the most valuable pattern in this entry.
**A building can be built, stand, be saved, be hashed, be rendered — and still be
decoration, because nothing in the goal system can ever choose it as a
destination.** Every one of these passed every existing test.

| thing | what it did | what it does now |
|---|---|---|
| **the store / granary** | fed only kin already standing beside it | is a forage target, scored on the same distance curve as a moss patch |
| **the well** | drinkable only if you happened to stand on it | is a drink target |
| **the channel** | **nothing whatsoever** — grep found two hits, both non-behavioural | irrigates |

Measured for each: a town at day 300 held **four granaries containing 0.01
between them** while 11 of 21 kin stood on 0.003 moss with food eight cells away.
And with the sheet off, a town of 90 went to **ZERO in 40 days with five standing
wells on the board and moss at 0.79** — not starving, not homeless, simply unable
to find a drink it had already dug.

**THE LESSON: after adding a data key OR a building, grep for its READ SITE.**

### 6. Farming is a better curve, not a bigger number

Wild moss regrows logistically — `(0.18 + M) * (1 - M)` — so ground grazed to
nothing returns at under a fifth the rate of ground that still has something on
it. **The one patch a town can never recover is the patch it walks on**, which is
why a town starves in the middle of a green board: measured town-core moss
0.08–0.28 against a board average of 0.37–0.74.

Inside a standing field that term is replaced by a flat rate (`C.FARM_GROW`). On
bare earth a field regrows several times faster than wild moss; on healthy ground
the `(1 - M)` term means it barely out-grows it. It rescues exhausted ground; it
does not carpet the board.

⚠️ **THE HARVEST IS WHAT MAKES THE AGE REAL.** Fields sit in town, so they are the
*most* grazed ground on the board — measured 0.208 inside fields against 0.678
outside. Kin stripped the crop before it could ever be stored. A field now
carries what it grows beyond the grazers to the nearest store (`_sow`), which is
the actual agricultural chain. Granary stock went **0.01 → 8.03**.

⚠️ `STOCK_CAP(kind)` is ONE definition, read by the fill, the harvest, the
hand-out and the forage targeting — four sites that must agree and that silently
disagreed while the number was written inline.

### 7. The sheet is a cost again, not a trapdoor

§3.4 says the lid costs you the water cycle, and it should. But measured, taking
it off was **certain extinction on every seed** — 94 → 0 in 140 days, with no
counterplay, for touching one of the two controls the game offers.

A **channel** carries surface water and stops working when the pond drops. A
**well** reaches groundwater and keeps its ground damp through a drought that has
emptied everything above it. So the lid still costs exactly what the bible says —
water 58 → 5.8, humidity 13.7 → 0, the rain stops — but a town that dug its wells
before the weather turned now lives: **91 → 148 across the same 140 days**, still
growing. A town that did not still dies.

### 8. The test that had to change, and why that is not cheating

`nobody starves standing in food` asserted `bad === 0`. It was written for a real
bug — kin *dying* with saturated moss in reach, 13 of 13 — caused by the mouth
reading the cell underfoot instead of the cell they had walked to. That is fixed.

What `bad > 0` measures today is **population pressure**: farming took the town
from ~40 kin to ~219, and a growing town always has somebody walking to dinner at
any given instant. Holding the old absolute zero would mean capping the
population to keep a counter happy — tuning the game to fit the test.

It now asserts the invariant the original bug actually violated and that an
absolute count never checked: **hunger must not be a STUCK state.** Flag every kin
starving within reach of food, run three days, require that most of them ate.
Measured 22 of 30 fed, 3 died; under the original bug they starved where they
stood.

### Numbers

| | before | after |
|---|---|---|
| day-15 dwellings | **0 on every seed** | 7–8 on every seed |
| day-60 population (mean of 6 runs) | 39.5 | 76.2 |
| day-300 population (bat0) | ~40 | 219 |
| day-400 population (4 runs) | 58 / 132 / 100 / 93 | 138 / 116 / 175 / 136 |
| hunger deaths (last 24 corpses, 4 runs) | 13 and 10 | one, total |
| granary stock at day 300 | 0.01 | 8.03 |
| **uncovered board, 140 days** | **90 → 0, every seed** | **91 → 148** |
| building render scale | 1.0 (66.7% of authored) | 1.5 |
| roof yaw spread | 6.28 rad | 0.52 rad |

### ⚠️ STILL OPEN

- **Medieval and modern ages are NOT built.** Kyle asked for "medieval to modern
  etc etc" and this delivered hunter-gatherer → settler → farmer (4 rungs). The
  `AGES` table takes new rungs by appending one entry with an `at` marker.
  ⚠️ **Appending to `WORKS` is safe; INSERTING would break every `pre:` bitmask
  and every saved `k.knows`.** Always append.
- Each new work needs a branch in `_buildWorkView` **and** a decision in the
  night-window block — the trailing `else` there hands out the HALL's three-window
  row, which is how fields briefly lit three windows in mid-air.
- The population oscillates (170 → 130 → 79 → 120 → 148 on an uncovered board).
  That is honest carrying-capacity behaviour, not a bug, but it is untuned.
- `test-view.mjs` still cannot run on this machine (it hardcodes
  `/opt/pw-browsers/chromium`), so all view work is verified live and photographed.

### The v1.0 audit — 14 agents, 10 raised, 3 confirmed, 7 refuted by measurement

Four independent lenses over the change (save/fingerprint, the granted-and-never-read
class, ecology edge cases, and one open design question), each finding then handed to
a separate agent whose job was to REFUTE it. Seven were refuted with real numbers
rather than opinion, which is the part that makes the other three trustworthy.

#### ⚠️⚠️ 1. THE SHUN WAS A NO-OP, AND THE REASON WAS THE PICK, NOT THE WEIGHT

The highest-value finding in the session. `k.saw` had a read — the bias that
multiplies goal-candidate scores near the place somebody was taken — and the read
did **nothing**: measured 1–2% avoidance, at every radius from 1 to 9 cells, even
counting only the 43 kin who actually witnessed it.

The cause is one line thirty lines further down:

```js
const c = cand[ri(rng, Math.min(3, cand.length))];   // UNIFORM over the top three
```

**Demoting a candidate from rank 1 to rank 3 changes its selection probability by
exactly nothing.** Only eviction from that set matters, and a 0.65–0.81 multiplier
on a mean of ~5.5 candidates rarely achieves it. A scoring bias in this file is
therefore worth roughly nothing unless it can push a candidate out of the top three.
⚠️ **Read the SELECTION before tuning a SCORE anywhere in `_decide`.**

Fix: keep the multiplier for close calls, and additionally drop shunned candidates
entirely — **guarded by the same critical need band the survival override uses**, so
they can still eat on that ground rather than starve beside it. Measured after:
ratios 0.405 / 0.104 / 0.087 across three seeds with **identical population on and
off** (60/60, 39/39, 14/14). The take is now a real event.

#### ⚠️ 2. A "WITNESSES ABANDON THEIR HOUSES" ARM WAS BUILT AND REMOVED — MEASURED

The first attempt at the above reasoned that the shun cannot reach a settled town
because going home is a CLAIM, not a scored goal, so a kin whose house stands on
that ground walks back to it every night. That reasoning is correct and the fix
made things **worse**:

| radius | bias alone | bias + house release |
|---|---|---|
| 3.0 | 0.974 | 1.098 |
| 4.5 | 0.958 | 1.100 |
| 6.0 | 0.970 | 1.095 |

A witness stripped of a home does not leave — they become homeless and loiter in the
middle of the town, which is exactly where it happened. An independent auditor
reached the same conclusion from the other end: an unguarded refusal cost **9 of 40
lives**. Do not rebuild it.

#### ⚠️ 3. THE HARVEST BANKED FOOD THE FIELD NEVER SURRENDERED

`_sow` credited the store the full `take`, then spread it as a flat `per` across the
disc and clamped each cell at zero. Every cell holding less than its share paid only
what it had, and **the shortfall was banked anyway** — and a field in town runs at
~0.15 mean moss with many cells at exactly 0, so this was not a rounding crumb. The
comment two lines above promised the opposite ("taken off the FIELD, never
conjured") and was simply wrong.
`take` is now the ambition and gates the loop; `got` is what the ground actually
paid, and only `got` is banked. ⚠️ The subtraction disc can be wider than the `cells`
the growth loop counted (it skips flooded and out-of-band cells), so `got` can exceed
`take` — the cap is what keeps the store honest.

#### ⚠️ 4. `fingerprint()` FOLDED A STALE CACHED AGGREGATE (pre-existing)

`fingerprint()` mixes `this.alive`, but `toJSON` does **not** carry it — `fromJSON`
recomputes it from the `k.alive` bits. And `alive` was accumulated by a walk that
increments once per slot as it passes, so it is wrong by construction whenever the
population changes mid-walk: `_die` fires after the increment (leaves it high) and a
birth can take a freed slot the cursor already passed (leaves it low). **A save
written in that gap restored to a different hash than the town it came from** — the
harness reporting a desync that was purely its own accounting.
The file already knew this hazard and had patched exactly ONE path for it
(`takeAway()` hand-decrements, with a comment citing "31 vs 30"). The birth and death
paths had the same hole. `alive` is now recounted. Measured stale ticks over 90 days:
**22 / 32 / 30 / 9 across four seeds → 0 / 0 / 0 / 0.**
⚠️ It is also read by `_daily`, which runs BEFORE the walk, so a restore near a day
boundary could take a different narrator branch than the town it was saved from —
permanently, through `eventCounts`.
⚠️ `wellbeing` is stale the same way and is deliberately left alone: not
fingerprinted, never read by sim.js.

#### What the refutations were worth

Two of the seven mattered enough to record, because both sounded right:
- *"the harvest debit is normalised by eligible cells but subtracted across the whole
  disc"* — code shape accurately described, impact negligible: `_growth` already
  strips flooded cells at ~74%/day, so the excluded cells are empty. Measured over
  160 days, the excluded-cell contribution was **0.59–2.45%** of what was banked, and
  the loop is net-conservative. The proposed fix moved in-field moss 0.107 → 0.128
  against a board mean of 0.691 — i.e. it does not explain the gap it claimed to.
- *"WORKS[].radius is read raw in `_sow`/`_irrigate` while every other reader
  multiplies by S"* — refuted on units: the view evidence was inverted, because the
  view scales geometry authored in WORLD units, not cells.

**The meta-lesson: a finding that names a real code shape can still be wrong about
its consequence.** Both of these correctly described the code and both were wrong
about what it costs. Measure the consequence, not the shape.

## 🎥 THE CAMERA WALKS, THE BOARD FILLS THE SCREEN, AND WATER WORKS (2026-08-27)

Three playtest reports from Kyle, all real, all view/input only — `sim.js` untouched.

### ⚠️⚠️ 1. "once i click on a button the water button stops working"

Not the button, and not the click. **`pourAt` was set ONLY in `pointermove`**, so
pressing and holding perfectly still poured **nothing, forever**. Measured: hold with
no movement = **0.0** water; move a **single pixel** = 6.56. The verb worked only if
your hand happened to jitter — which is exactly how a player experiences "it stops
working sometimes".

⚠️ **The same defect silently broke DAD'S CORNER.** `shapeAt` was set the same way, so
raise/hollow — the one permanent act in the game — moved no ground at all under a
thumb held still (0.0 → 2.167 after the fix). Both verbs are deliberately HELD rather
than tapped; the hold just has to *start* where you put it. Both now seed from the
press.

**The lesson: a "held" gesture must act on the press, not on the first move.** Grep for
any other `mode = X; this.someAt = null` pair before adding a third.

### 2. There was no way to move across the board at all

You could orbit it, zoom it and tilt it, and the only thing that ever chose *where* you
were looking was the town itself (`lookAtTown`, every two seconds). WASD + arrows now
walk the camera.
- ⚠️ A held key needs a **Set read by the frame loop**, not a keydown handler — that
  handler returns early on `e.repeat`, and must, or every verb would fire on
  auto-repeat.
- ⚠️ **Camera-relative**, so W means "away from me" whichever way the board is turned.
- ⚠️ It moves `center` **and** `centerTo` together. The frame lerps one toward the
  other, so writing only one springs straight back and the keys read as broken.
- ⚠️ The walk sets `view.panHold = 4`, which suppresses the auto-aim — otherwise the
  town yanks the camera back mid-stride.
- ⚠️ **Clamped as a RADIUS, not per axis.** The walk is diagonal in world space, so a
  per-axis clamp let the true distance reach `LIM·√2` and the board came off the edge
  of the screen at full stick. Measured centre (0.308, −0.308) = radius 0.436 against
  an axis limit of 0.308.

### ⚠️⚠️ 3. "the map should take up the whole screen, no grey space"

The zoom-out limit was a flat **2.75**, and at 2.75 the board covers only **6–86% of
the width**. The rest is the 60×60 basement floor plane — real scenery, but dead screen.

⚠️ **A CONSTANT CANNOT FIX THIS.** The furthest zoom that still covers the frame depends
hard on the window's aspect: measured **2.2 on a tall 5:4, 1.8 on 16:9, 1.2 on a 21:9
ultrawide**. Any single number either leaves grey on the wide monitors or robs the tall
ones of most of their view. It is solved per window in `fitLimits()`.

⚠️⚠️ **THE COVERAGE TEST TOOK THREE ATTEMPTS, AND THE FIRST TWO LOOKED RIGHT.**
1. *Project the four board corners, check their BOUNDING BOX contains the screen.*
   Not sufficient — the board is a **square** and the camera is **orbited**, so a
   rotated quad's bbox can cover the screen while its own edges cut the screen's top
   corners. Photographed: dark wedges top-left and top-right while the test said pass.
2. *Test the projected quad itself.* **Worse.** A corner outside the frustum projects
   to meaningless NDC — measured **(−12.15, 38.97)** for one board corner — which
   scrambles the winding and makes the polygon test nonsense. It collapsed `maxDist` to
   the minimum on every aspect.
3. **Go the other way, which is numerically stable:** fire a ray through each corner of
   the **screen**, meet the ground plane, and ask whether that point is on the board. A
   ray that never comes down is the horizon, which is the worst case there is.

⚠️ **Pulling back now RAISES the angle** (`minElFor`) rather than showing the floor. A
steeper look fits more board on screen — **0.85 at the low elevation floor against 1.20
looking almost straight down** — so solving `maxDist` at the *worst* angle (the first
version) threw away 40% of the view for nothing. Zoom in and you get the low angle where
the faces are; pull back and the room tips toward a plan view of the whole layout.

⚠️ Both solves are **cached on the zoom** (`panLimitNow`, `_elFit`): ~240 projections is
nothing on a wheel event and far too much every frame.

**Verified live:** no void at any zoom (0.60 through the 1.20 stop) or at full walk in
all four directions; the wheel stops at the computed limit and the angle follows; water
and raise both act from a still press; natural boot fills the window; console clean.

## 🎨 THE HIGGSFIELD PASS (2026-08-29) — 4 credits of a 100 budget, and why not more

Kyle: *"do you think giving this game a higgsfield pass could help? lets start with
a budget of 100 tokens and see what you do."*

**Short answer: for exactly one thing, yes. For most of what generation is good at,
this game cannot use it.**

### ⚠️⚠️ 3D GENERATION IS ARCHITECTURALLY IMPOSSIBLE HERE — CHECK BEFORE SPENDING

`image_to_3d` bills a flat **~30cr per model** and its output is a GLB. The vendored
`lib/three.module.js` contains `TextureLoader`, `ImageLoader` and `FileLoader` — and
**no `GLTFLoader`**, because GLTFLoader lives in three's `examples/`, which this
project bans by rule ("core only, no examples modules"). So a generated model cannot
be loaded at all without changing the engine's founding constraint.
**One un-checked `image_to_3d` call would have burned 30% of the budget on a file the
game physically cannot open.** Verify the loader exists before buying the asset.

### ⚠️ THE TURF MAP: BOUGHT, WIRED IN, MEASURED, REMOVED

The most promising-looking target was `uDetail` — a procedurally drawn canvas tiled
30× across the whole ground, multiplied into the diffuse. A pluggable slot that
already existed, affecting every square inch of the board.
A 2k macro of model-railway static grass flock was generated (2cr), converted to
greyscale (the shader reads **only the red channel**), downsized to 512, and levelled
so its mean was **0.502** — a true drop-in, because `0.46 + det.r * 1.08` is neutral
at 0.5. It loaded, it was mirrored-wrapped so 30 tiles could not seam, and it was
verified live in the shader.

**It changed nothing anybody could see.**
- matched pair at the closest zoom, drawn canvas vs photographed turf: indistinguishable
- detail scale 30 vs 12 vs 6: indistinguishable
- as a **bump map** with `bumpScale` exaggerated 4× *and the lamp on* — the best case
  for surface relief that exists in this game: still indistinguishable

The cause is structural rather than a bad texture: this ground is always seen through
the **tilt-shift defocus**, at night, under a low-poly silhouette language. Fibre-scale
detail sits below the threshold the look can carry. **Any** material map here is
decoration, and the free drawn canvas does the same job. Reverted, and the note is
left at the call site so nobody re-buys it.

### ✅ THE ONE THAT LANDED: TITLE KEY ART (`assets/keyart.jpg`, 2cr, 231KB)

The game opened on a near-black screen with a pull-chain. It now opens on a painted
basement: the layout on plywood sawhorses, the bare bulb, the dust sheet pulled half
off one edge, and the kin scattered across it carrying coloured lanterns.
It is worth noting *why* this one works when the turf did not: **it is UI.** It is
seen at full resolution, unblurred, with nothing competing — the exact opposite of a
material sampled at 1/30th scale through a defocus.
- ⚠️ The art is a layer UNDER the existing radial vignette (`::before` for the
  painting, `::after` for the wash), not a replacement for it. Showing the art
  without the wash left the title and the chain floating on a busy background.
- ⚠️ It degrades on its own: if the file is missing the layer paints nothing and the
  solid `#04060a` plus the wash is exactly what shipped before. Nothing gates the
  title on a file arriving.
- The prompt carried the game's own vocabulary — sawhorses, dust sheet, one bulb,
  lantern colours in the need-hue palette — which is why it reads as this game and
  not as generic cosy art.

### The rule this pass suggests for the project

**Spend on what is seen at full resolution and unblurred; do not spend on what the
miniature look is going to defocus away.** That means UI, title art, share cards and
briefing plates are worth buying; ground materials, prop textures and anything sampled
small are not. It also means the 100-credit budget was never the constraint — at 2cr
an image the constraint is how few places in this particular game can actually show a
generated image off.

Spent: **4 of 100**. The remaining 96 has nowhere to go that would survive measurement.

⚠️ `serve.mjs` did not know `.jpg` and served the art as `application/octet-stream`
(browsers sniff it, so it worked, but it is wrong); jpg/jpeg/webp added.

## 🚉 THE STATION — the one GLB in the game, and the rules that let it in (2026-08-29)

Kyle: *"what about some GLBs??"* — after the Higgsfield pass had already ruled 3D
out on loader grounds. The honest answer was not "no", it was "one, under rules."
Total spend this pass: 36 of the 100-credit budget (2 turf + 2 keyart + 2 station
image + 30 bake).

### The three walls, and how each one actually fell

1. **No loader.** GLTFLoader lives in three's `examples/`, which this project bans.
   The wall fell by NOT vendoring it: **`glb.js`** is our own ~150-line reader —
   GLB container, accessors, baseColor materials, node TRS, nothing else. A plain
   unskinned uncompressed GLB is just a header, a JSON chunk and a BIN chunk; the
   rule "core three only, everything else is our code" survives intact.
2. **Mesh weight.** `tools/glb-diet.mjs` (bake-time only, never shipped, uses the
   permanent kit at `C:\Users\kylef\tools\gltf-kit`): decompress, strip every
   texture slot but baseColor, dedup+weld+prune, texture → 1024 JPEG.
   Raw bake 5.5MB → **1.7MB, 27,852 tris**.
3. **Style clash — the wall that stays up for everything else.** The turf pass
   proved generated MATERIAL cannot survive the miniature look. A baked MODEL is
   admissible in exactly one case: an object that is **fictionally a plastic kit**,
   because an image_to_3d bake looks like molded, hand-painted plastic. The kin,
   the huts, the trees are toy-language and would clash. A model-railway station
   IS a kit. **The medium and the fiction coincide, and nowhere else in this game
   do they.** That sentence is the admission test for any future GLB.

### Where it stands

At **a0 = 2.35** — the exact angle where the 6:15 has been stopped since the train
shipped ("stopped where dad left it, never fixed"). The train was always stopped
THERE; now there is a *there*. Just OUTSIDE the loop, on the strip between the
rails and the board edge — where a station goes when the board is already full.
Scenery like the train: the sim has never heard of it.

### ⚠️ The load contract (violate = the model silently refuses to load)

`glb.js` reads **no Draco/meshopt/quantization, no skins, no animations, no
sparse accessors**. The diet guarantees its output is inside the contract and
prints `extensions: none` as proof. A file outside it console.errors a named
message and resolves null; `_station()` treats null as "no station" — the keyart
degradation pattern. Verified live: file renamed away → no station, zero uncaught
errors, game runs.

### ⚠️ Traps hit on the way

- **sharp passes a smoke test and dies in the real pipeline.** A trivial
  `sharp().jpeg().toBuffer()` under the portable node printed "sharp OK"; the
  moment the diet actually loaded it, ERR_DLOPEN_FAILED (win32-x64 binding vs
  node 24 — the same breakage the AoT bible recorded in July). The texture step
  shells out to PowerShell/System.Drawing instead, which already shipped the
  title art. **Do not put `textureCompress` back without running the diet end to
  end — a smoke test proves nothing here.**
- glTF UVs need `texture.flipY = false` and `SRGBColorSpace`, or the bake wears
  its own texture upside-down and washed out.
- The bake normalizes to an arbitrary scale: `_station()` measures the bbox and
  scales the longest side to 0.11 world units (hall 0.115, house ~0.07), then
  seats `box.min.y` on `_surfaceY` — centroid-seating half-buries a model whose
  origin is mid-wall.

### Verified

Parser loads the shipped file first try (1 textured mesh, 27,852 tris, 0 errors);
photographed beside the 6:15 at night — palette (cream plaster / dark timber /
terracotta) lands inside the game's own house language; missing-file degradation;
0 uncaught errors across the run. sim.js untouched — the 111-test gate stands.

## 🚂 HIGGSFIELD PASS TWO (2026-08-29) — 66 of 100, all inside the admission tests

Kyle: *"lets keep improving the visuals using higgs in the best way possible -
100 token limit."* Everything bought passed one of the two tests pass one
established: **full-resolution UI** or **fictionally a plastic kit**. Spend:
tower image 2 + tower bake 30 + loco image 2 + loco bake 30 + paper 2 = **66**.
The og card was free (it is the keyart we already own).

### The 6:15 is a real engine now (`assets/loco.glb`, 1.65MB, 29,817 tris)

The most story-loaded object on the board was three painted boxes. A locomotive
passes the kit test better than anything in the game — and the bake even came
out DUSTY, which is the fiction verbatim ("stopped where dad left it").
- ⚠️ The baked engine drops INTO the procedural car's group and the boxes go
  `visible = false` — it inherits the exact ring position and curve rotation,
  and no file → boxes stay visible → exactly what shipped before.
- ⚠️ The two wagons stay procedural ON PURPOSE: a rigid baked 3-car consist
  would chord across the curve, and dad mixing a bought engine with home-made
  stock is what layouts actually look like. Do not bake the wagons.
- Axis dance for any future vehicle bake: rotate longest-axis onto local X,
  re-measure, scale to 0.112, rotate π for nose direction (photograph to
  verify; flip the constant if a re-bake faces the other way), seat min.y.

### The water tower (`assets/tower.glb`, 1.8MB) — and THE CORNER RULE

The board's first skyline spike (height-normalized to 0.17; trees run
0.10–0.15). Generalized `_placeKit(url, angle, sizeMode, target, name)` —
station sized by footprint, tower by height, because a tower's footprint is
all legs and air.

⚠️⚠️ **THE STRIP BESIDE THE TRACK CANNOT HOLD A DEEP KIT.** Rails-to-board-edge
is ~0.046 world; a height-normalized tower's footprint is ~0.09. The first
placement computed r = 0.948 on a board that ends at 0.94 and the tower HUNG
OVER THE APRON — legs in mid-air, photographed from underneath, seated on
nothing. Every gate said fine (it loaded, no errors, bbox looked sane).
**The board is SQUARE and the track is a CIRCLE: the corners outside the loop
run to r = GR·√2 ≈ 1.33.** All deep kits go in corners. The tower stands on
the exact diagonal (π·0.75) directly behind the station — which is also just
where a yard water tower belongs. Verified seated: base-to-ground gap 0.000.

⚠️ A raycast census along the ring (43 hits at a=1.75 rising monotonically to
86 at 3.05 on Keswick) is the cheap way to find clear ground — but remember it
counts fog/cover/ground-cover layers too; only the TREND is meaningful.

### Dad's planning pad (`assets/pagepaper.jpg`, 111KB)

The chronicle page ("the page" — the town's book) now sits on a scan of dark
engineering graph paper with erased pencil ghosts and a coffee ring. Model
railways are planned on graph paper; the coffee ring is dad's.
- ⚠️ The BOX keeps the plain panel on purpose — the page is the town's book,
  the box is a settings tray; same skin would blur which one you are holding.
- ⚠️ `background-attachment: local`, or the paper pins while entries scroll
  and reads as a rendering bug. Gradient rides on top at .82/.88 alpha —
  text legibility outranks texture. No file → opaque gradient → old look.

### The share card (free)

og:title/description/image + twitter:card wired to the existing keyart.
⚠️ og:image must be ABSOLUTE — scrapers do not resolve relative URLs.

### Verified

All three kits load and seat (loco swap `[false,false,false,true]`, tower gap
0.000); missing-file degradation re-confirmed on the loco (the 404 path ran
for real while only station+tower existed); ensemble photographed — loco at
the platform, tower rising behind the station roof. sim.js untouched; the
111-test gate stands. ⚠️ The console buffer showed the loco 404 from a PREVIOUS
navigation after the swap had succeeded — the buffer-lies-across-navigations
trap, again. Believe the live scene graph, not the buffer.

## 🏭 v1.1 — THE LATER AGES, REAL LOSS, AND THE SOUND OF THE HOUSE (2026-08-30)

Kyle answered four direction questions in one sitting: finish the ages to
modern · he plays it as a check-in pet · real loss is allowed · full audio pass.
This entry is all four, plus the apron regression that shipped the day before.

### ⚠️⚠️ FIRST, THE REGRESSION: THE APRON WAS A PLANE THROUGH THE BOARD

Kyle: "the map is so broken — blurred lines everywhere and all the creatures
are under the map itself." The endless-land apron was ONE plane seated at the
rim's MEAN height — and the board's lip raises the rim above the interior, so
the plane sliced through the world. Measured: **96.5–97.6% of a generated
world's interior sat BELOW it.** The entire game rendered under a flat dim
sheet. The verification photographs had all been taken on Keswick, whose baked
mountains poke above the seat — one high world made a catastrophic regression
look verified.
**Fix: a RING, never a plane.** Four slabs around the board footprint, each
seated below its own side's LOWEST rim point. The interior cannot be covered
because no apron geometry exists inside [-GR, GR]² at all — geometric
certainty, not a better height guess. Verified: `anySlabInsideBoard: false`,
lowest kin ground 0.095 with full detail restored.
**THE LESSON: verify view geometry on a GENERATED world too, always.** The sim
gate cannot see the view, and one photogenic world is not a sample.

### THE AGES, TO "MODERN" — works 9–12, ages 5–6

`WORKS` grew four rungs (APPEND ONLY — and ⚠️ **k.knows is a Uint16Array: 13 of
16 bits used.** The 17th work silently corrupts every saved mask; a tripwire
test guards the ceiling). Every work has a named READ SITE — the five-times
defect of this codebase is a building nothing consumes:

| work | pre | read site — what it actually does |
|---|---|---|
| **the mill** (9) | farm+granary | `_sow`'s harvest: a milled field banks ×1.6 per take (multiplied into the AMBITION, so the conservation fix still banks only what the ground surrendered) |
| **the mending house** (10) | house | the strain decay line: recovery ÷0.45 instead of ÷1.4 near one — a genuine 3.1× measured |
| **the school** (11) | house+hall | the teach roll: threshold ×2.4. ⚠️ it multiplies the THRESHOLD, never the draw count — the rng stream must not shift with geography |
| **the dynamo** (12) | mill+school | `_sow`'s night gate: a lit field keeps growing after dark (per-farm L replaces `light`); plus company/safety trickle near it at night. The bulb on its pole reads `1 - daylight` in the view |

Two ages read off the markers: **the turning wheel** (mill) and **the little
lights** (dynamo). Measured pacing, no tuning needed: mill ~d79–87, school
~d94–141, dynamo ~d115–154 — the gate's own fixture reaches the little lights
by day 300 with 236 alive.
⚠️ The chime rings only when an age TURNS UPWARD — never on load (first frame
seeds the tracker), never on the way down (losing an age has the chronicle's
own sentence; a chime would make it sound like a prize).

### REAL LOSS — the last page, and setting out new figures

When the last kin dies the book closes: `_ended` (derived on load — a saved
dead town does not re-announce itself) opens **"the last page"** — day, graves,
generations, the age it reached, its final entries, the ground's names — with
two buttons: *set out new figures* and *leave it dark*.
`sim.refound(14)`: new founding on the SAME world. Ruins stand at their decay,
graves and place names kept, practices remembered by the world. ⚠️ **The new
figures do NOT inherit the dead town's knowledge** — they arrive with the
founding four, and what the old town invented survives only as ruins; the
weave's reinvention path (somebody looks at a standing thing nobody
understands) is the archaeology. That loop already existed; refounding makes it
sing. `foundings` counts the sunrises: saved, restored, fingerprinted.
⚠️ The refound guard COUNTS k.alive — `this.alive` is a cached aggregate that
is 0 between construction and the first walk, and the cached check let a LIVING
town be refounded over (caught by boot validation, first try).

### THE SOUND — all synthesis, no samples, as §15.4 always said

The Higgsfield audio tool turned out to be SPEECH-ONLY (music/SFX models are
pipeline-locked; the tool says decline rather than substitute). Better outcome
anyway — everything in this game is drawn in code:
- **the music box**: 16 plucked notes, slightly detuned, slowing and fading at
  the end the way a real one runs down. Plays ONCE at the chain pull — the
  browser will not start audio before a gesture, and the fiction agrees:
  pulling the light on winds the box.
- **the age chime**: three inharmonic partials so it reads as METAL, not UI.
- **the house talks to itself**: a joist creak every ~30s, a pipe tick pair
  oftener, both quiet enough to be doubted. ⚠️ Math.random on view-side audio
  timers is fine; the AoT ambience laws hold (no raw endless waveforms, no
  sub-drones — these are EVENTS).

### ⚠️ The hunger test was recalibrated, and here is the honest reasoning

'nobody starves standing in food' → 'hunger is not a stuck state' failed at
4/10 fed vs 5 required. Diagnosis: the ages economy holds MORE kin (236 vs
219) and flags FAR fewer hungry (10 vs 30); the small tail oscillates between
warmth and food all night and SURVIVES on grazing trickles — strain 0.0 while
need sits at 0.1. Alive, managing, uncomfortable is the town working, not the
bug (which was 13 of 13 DEAD). The asserts are now the invariant itself:
died ≤ 35% AND (fed + managing-with-low-strain) ≥ 80%. Under the original bug
this fails instantly; under a transit collapse it fails on the managing line.

### Verified

Gate green (see the run for the count); determinism 60d identical; save
round-trip byte-equal with foundings/_ended; live end-to-end: chain pull →
music box → age chime through the real watcher → whole town killed → last page
opens itself → refound → 14 alive, foundings 2 — zero console errors. The
review fleet died twice on session limits (`raised: 0` with four failures —
**an empty review that did not run**, the documented trap) and was re-run on
purchased credits.

### The v1.1 review — 18 agents, 14 confirmed, 0 refuted, and the sixth counter

The fleet's first two runs died on session limits and returned `raised: 0` —
**an empty review is not a clean one**; the run that counted found 14. The ones
worth carving:

- ⚠️⚠️ **`foundings` was incremented, saved, restored, fingerprinted — and read
  by NOTHING.** The counter-nothing-consumes defect, found for the SIXTH time,
  this time in the reviewer's own reviewer-trained code. The last page reads it
  now ("the third town on this ground"). The lesson composts into: *serialization
  discipline is not a consumer.*
- ⚠️⚠️ **fromJSON derived `_ended` from `s.k.alive` BEFORE k was restored** — so
  every legacy save of a LIVING town loaded flagged dead and the last page fired
  over the title screen. The derive now reads the SAVE's own array (`o.k.alive`),
  which is order-independent. *Restore-order bugs hide behind the modern path:*
  narr.ended overwrote the garbage for every current save, so only pre-narr
  saves — the least-tested path — hit it.
- ⚠️ **`_spawn` never reset `k.saw`**, so refounded figures inherited the dead
  town's hand-trauma through recycled slots — measured 14 of 14 pre-traumatized
  by a hand they never saw. One line. The exemption from daily decay is the
  point of `saw`; the exemption from SLOT RECYCLING was an accident.
- ⚠️ **One WORKS.radius column meant two real distances**: the new `near2` used
  raw cells while every kin-facing scan uses `radius * S`. The dynamo lit kin to
  12 cells and its own fields to only 8. Scaled now.
- ⚠️ **`setCurtain(0)` makes daylight EXACTLY 0** — the dynamo test's "the getter
  never quite reaches it" comment was false, and the `hasPower` early-out clause
  could be deleted with the suite green. A true-darkness leg pins it now.
- **The dead town's book**: every route into the book (`b`, the button, catchUp's
  +500ms away-page) now lands on the last page while `_ended` — before, the
  away-page overwrote the refound button half a second after it appeared, in the
  LIKELIEST death scenario (died while away).
- **`ageBest`** tracks the historic peak (saved/restored/fingerprinted, reset to
  `ageNow()` on refound): the last page credits what the town REACHED, because
  ruins decay and the present board understates the dead.

## 🏘️ v1.2 — ORGANIZATION GROWS WITH THE AGE (2026-08-30)

Kyle: *"the buildings and civilizations look so close and mushed together — have
them start like that but as the civilization evolves so does organization."*

**The cause**: works were placed at THE INVENTOR'S FEET (`k.x[best]` at the one
`works.push` funnel), and inventors cluster at the hearth — a pile at every age.
(A `near:1` inventor-spacing gate existed, but it throttled WHO invents, not
where the building lands, and near:0 kinds stacked freely.)

**`_siteWork(wi, x0, y0)`** — the age's own sense of order, at the single
placement funnel:
- **Footprint-aware gaps that widen with age**: required distance = halfFoot[a]
  + halfFoot[b] + gap(age), gap 0.4 (huddle) → 1.0 → 1.6. A hall needs more air
  than a hut.
- **From 'the kept winter' (age 3), near-kinds settle onto a street lattice**
  anchored at the hearth. Measured at day 300 across two seeds: mean lattice
  offset 1.32–1.48 cells vs ~2.1 random, 39–47% of late buildings on street
  corners, spacing 3.42 → 4.49 cells early→late — with alive at 228/215 and
  both towns reaching the little lights.
- **The old quarter stays crooked**: position and yaw are fixed at BUILD time,
  so history stays legible in the town's shape. The view narrows roof-yaw
  jitter by age at build (×(1−age/5·0.75)) — new streets come in straight.
- One chronicle beat, once: *"they built to a line, for the first time."*

⚠️⚠️ **THE PITCH/GAP WAR — the tuning lesson worth the entry.** First tuning:
lattice weight up + distance weight halved → streets appeared AND the town
died (alive 98 vs 171, stalled at wheel). Cause: at pitch 4.2 **adjacent street
corners were closer than the spacing rule allowed** (hut-hut needs 4.8), so the
grid and the gap rule fought — buildings pushed off-grid AND far from services.
PITCH must EXCEED the widest common spacing need (house+house+gap = 5.6 →
pitch 5.6), and the gap stops growing at 1.6 for the same reason. **When two
placement constraints share a length scale, check they are jointly satisfiable
before tuning either.**

⚠️ `_siteWork` consumes NO rng (fixed spiral scan, deterministic argmax) — the
stream must not shift with geography; a 50-draw parity test pins it. Falls back
to the inventor's feet if nothing within 8 cells passes, so a founding act is
never blocked. store/windbreak/channel never take the lattice — a channel
belongs at the water it was scraped from.

### ⚠️ A GEOMETRY FIX IS AN ECONOMY CHANGE (the near2×S aftermath, 2026-08-30)

The review's radius unification was geometrically right and economically wrong:
the mill's reach grew 1.5× (2.25× AREA), so MILL_MULT 1.6 suddenly applied to
nearly every field. The harvest pinned the commons at its own floor — measured
day-300 stores **8.03 → 0.33** and town-core moss **0.087 → 0.046** — and the
walk-up hungry graze exactly the cells the harvest drains, so the hunger test
failed AGAIN with new numbers (its second recalibration would have been its
third blind one; the fix was the economy, not the assert). MILL_MULT 1.35 and
the harvest floor 0.12 → 0.16 (the floor is what stays ON THE STALK for
walk-up eaters). After: stores 4.26/17.14, ok-rates 92%/86% on two seeds.
**Retune the rate whenever the reach moves — and when a threshold test fails
twice with different numbers, the code under it is still moving; stop touching
the assert and find what.**

### ⚠️⚠️ THE BALANCE TRIANGLE, and the veto that was strangling the modern age

Closing the hunger regression opened a three-way tension — hunger-health vs
store-health vs ladder-pace — and two blind alleys before the real cause:
- Harvest floor 0.14: ladder fine, **84% of the flagged hungry DEAD in 5 days**
  on 'live' — the original bug's severity at scale. Floor stays 0.16: the floor
  is what remains on the stalk for walk-up eaters, and the humane invariant
  outranks pacing.
- `pressure` bumps to speed the school: **BACKWARDS.** `pressure` is a minimum
  need-DEFICIT threshold (`want < W.pressure → skip`), not a rate — raising it
  made inventing strictly harder. Read the want-gate before touching the table.
- **The real strangler**: the weave's `sc = 0` veto for inventors standing
  within 4.5 cells of a near-work — written when buildings landed at the
  inventor's FEET, so inventing in the crush meant building in the crush.
  `_siteWork` owns placement now, and in an organized later-age town the veto
  zeroed nearly every candidate (everyone lives ON the streets): school fired
  never/never/241 across three 400-day seeds and the modern age died with it.
  Softened to ×0.55. After: school@58/87, dynamo@92/102, both seeds at the
  little lights, alive 213/371, **stores 50.9**, hunger 84% ok / 5% died.
**When a placement-era rule outlives the placement it guarded, it turns from a
guard into a stranglehold — re-audit every rule that reads positions whenever
the thing that sets positions changes.**

Also from this arc: the saw test guarded on `k.alive[slot]` alone and had been
passing BY the recycled-slot leak it was supposed to catch (identity = birth
day now), and the once-ever `rows` beat lived in unsaved `_beat`, re-firing on
every reload — caught as a ±1 story-count divergence. `_beat` rides in narr now.

---

## THE CUTENESS PASS (2026-09-02) — the face was the missing half of the stakes

Kyle's oldest open verdict: *"the creatures arent cute enough so theres no real
stakes."* The strain/droop/grey-out work made suffering VISIBLE; this pass makes
the creature worth suffering FOR. All view.js, all inside the two existing
instanced kin layers — **the five-draw-call ceiling holds.** Photographed
before/after at portrait range (the self-photograph pipeline, receiver :8402).

What the before-portrait showed, and the fix for each:
- **Pupils were small, angular (6,4 sphere) and gazed down-vacant** → 0.0024 r,
  8×6 segments, centred at the eye's own height, a hair inward of the whites
  (the toy-shop convergent gaze), with a tiny white GLINT sphere per pupil.
- **The mouth dash floated on the NECK** — 0.0275 in the lifted frame is below
  the head (head starts 0.0285); it photographed as a chest vent → a small
  smile (TorusGeometry arc, rotated to span the bottom) ON the head at 0.0301.
- **No blush** → flattened cheek pads. `aTint` is SIGNED now: positive still
  mixes toward off-white, negative mixes toward blush pink. One attribute, two
  jobs, zero new draw calls.
- **No blink** → shader-side, keyed off `gl_InstanceID` (WebGL2 is guaranteed —
  three r169 dropped WebGL1): each instance blinks on its own 3–5s clock, ~0.2s,
  whites+glints (body layer, tag `aTint > 0.6`) and pupils (feature layer, new
  `aEye` attribute) squash to the lid line at local y 0.0330. ONE shared uniform
  object (`_kinT`) registered into both materials — desynced layers would mean
  pupils floating over shut lids. Closed eyes read as a contented ^^ squint.
- **Toddlers were miniature adults** → `chub` (NIB 0.86 / HALF 0.93) compresses
  y only; children are squat round things with the same big head. The lantern
  call takes `sz * chub` so the antenna-tip glow stays seated on the shorter
  stalk (pickKin still reads lanternPos = "the antenna tip").
- **EGGS ARE EGGS, finally** — the body geometry is shared, so eggs had always
  rendered with baked-on eye whites (shipped oddity), and this pass would have
  added pink cheeks to them. A per-instance `aKinEgg` InstancedBufferAttribute
  (written in _paintKin beside the colours) collapses every face part in the
  vertex stage. An egg is a blank pale shape now.

⚠️ Traps met on the way, so nobody re-earns them:
- **A glint too big or too central reads as a HOLE, not a highlight** — at
  0.0009 r near pupil-centre it photographed as a ring-eyed stare, worse than
  no glint. It must be small (0.0006) and clearly in the upper-outer corner.
- **Eye-white protrusion that looks right head-on looks like frog-stalks from
  3/4** — whites at z 0.0080 photographed detached from the skull at az 0.8;
  0.0074 keeps the frontal read and seats them. Always photograph BOTH angles.
- **The portrait recipe**: the orbit camera hard-locks lookAt to y 0.06, so a
  face shot must bypass it — `v.render(dt)` first (settles instances), then
  hand-place `v.camera` + `renderer.render(v.scene, v.camera)` directly.
  Boost every light ×3.2 for the shot and restore — identical for both halves
  of a matched pair. And stage the subject: teleport one kin to open ground
  (set k.x/y/tx/ty, do NOT step) — portraits inside a huddle put the camera
  INSIDE a neighbour.
- **Exact cross-reload state replay is impossible** — a background stepper
  ticks between evals, so same-seed same-calls landed on day 25 vs 27 with a
  different pick. For shared instanced geometry that doesn't matter: every kin
  wears the same face.
- To force a blink for a photo: instance n = count of alive ids below the kin's
  id; solve `fract(uT*(0.20+h*0.12)+h*7) = 0.030` for uT with
  `h = fract(sin(n*12.9898)*43758.5453)` and set `v._kinT.value` AFTER
  `v.render()` (render overwrites it from this.t), then renderer.render.

Verified: syntax (as .mjs — node --check lies on .js ESM), zero console errors
across ~20 renders incl. both shader compiles, family lineup photographed
(adult/HALF/NIB/egg), blink mid-close photographed, 3/4 + frontal matched
pairs, night lanterns unchanged, gameplay-distance town unchanged. sim.js
untouched; the 119-test gate re-run anyway before push (insurance, standing
push-on-green rule).

### THE POLAROID (same day) — the inspector shows you who you're looking at

Tap a kin and the inspector now opens with a small photograph of them — the
self-photograph pipeline promoted from a debugging trick to a feature.
`View.portraitOf(id)` in view.js; written into `#inspectShot` ONCE per select
in ui.js (inspectBody is rebuilt every paint — an <img> in there would churn).

⚠️ THE ROUTE HERE MATTERED — three designs failed and are recorded IN the code:
1. **In-situ at the kin's position**: kin live in huddles, so a lens 5–7cm in
   front of one is usually inside a neighbour. Photographed: a jumble of
   clipped eye-whites.
2. **Azimuth scan avoiding kin, then a raycast** (subject→camera, so a camera
   point inside a tree crown can't false-clear through backfaces): still lost —
   a thin fence rail made it choose the BACK of the head, and a camera point
   buried in a slope photographs a green wall.
3. **THE STUDIO — what shipped**: the subject's instance data is copied into
   slot 0, every colony draw count drops to 1 (burden/lanterns 0), the slot-0
   copy is re-composed at (0, +5, 0) jar-local — high above the board where
   nothing else exists — and shot against the dark. Cannot fail. _paintKin
   rewrites all instance data every frame, so the finally-block `render(0)`
   heals the vandalism AND replaces the stretched small buffer before the next
   composite. Counts are also restored explicitly in case render(0) throws.

⚠️ **near-plane trap, twice earned**: camera.near is 0.05 — the first framing
put the lens at 0.052 and the frustum amputated everything but the legs. The
photo drops near to 0.02 (restored in finally, with size + aspect).
⚠️ the flash: light intensities are boosted for the exposure and restored —
hemisphere hardest (`3.5 + (1-daylight)*9`; it reaches a face no matter where
the bulb hangs), directionals gently. A flat ×2.6 photographed a silhouette.
⚠️ jar-local vs world: instances live in jar space, the camera in world space,
and the tilt verb can transform the jar — the studio point maps across via
localToWorld before the camera is placed.
Measured: ~72ms per photo (once per tap), 6/6 clean portraits day AND night,
counts healed after every shot, zero console errors.

---

## THE LIGHTING POLISH (2026-09-02) — the light says the time, not just the amount

Photographed first (six-state baseline: dawn/noon/dusk/night-off/night-on):
**dawn and noon were THE SAME PICTURE at two exposures** — the key colour moved
0.92 − d·0.02, a 2% shift — and night was day dimmed 60%. All in `_paintSky`,
view-only, gate re-run green anyway.

The day arc, all keyed off `d` itself (both edges of the day get the gold, as
in life, and a heavily-curtained window simply lives nearer golden hour):
- `gold` window peaks near d 0.16 (⚠️ clamp BOTH factors — the falling edge
  exceeds 1 below the peak, caught by arithmetic audit)
- `nightK` dies by d 0.14 ON PURPOSE — the first dose ran it to 0.20, where
  its blue pull overlapped the gold window and CANCELLED the hemisphere's warm
  brush at dawn (photographed: gold arithmetically present, visually absent).
  Two blend hands must not fight over the same stretch of the day.
- dark night: the key goes MOONLIGHT (0.84, 0.92, 1.0). Measured first: a warm
  night key at 0.62 intensity swamped the bluer hemisphere — the moon never
  reached the frame (mean-RGB moved r −10% / b +17% after, luma held).
- ⚠️ THE LAMP-NIGHT ACCIDENT, KEEP IT: the sim floors daylight at 0.22 when
  lampOn, which lands inside the gold window with nightK 0 — so bulb-night
  renders warm tungsten board-wide and dark night goes moon-blue, with NO
  branch on lampOn anywhere in the view. Two honest nights.

⚠️ **A TIGHT BULB POOL WAS TRIED AND REJECTED — the sim vetoed it.** angle
0.40 put a real circle of light on the table; then `sim.js` was read: the lamp
is BOARD-WIDE in the rules (`ambient` +1.6 everywhere, `daylight` floored
everywhere). A visible pool edge would read as a gameplay boundary that does
not exist. Shipped 0.50/0.85 — centre-weighted warmth, no false boundary.
**Check what the sim thinks a light MEANS before shaping what it looks like.**

⚠️⚠️ **THE titleDim CONTAMINATION — the measurement trap of this pass.** The
title fade eases toward 0 only inside render(); with rAF suspended in the pane
it advances 0.05s per photographed frame, so every shot in a fresh page is
taken through a DIFFERENT partial fade (measured titleDim 0.368 after 12
frames). The first before/after comparison was garbage — the after set read
darker purely because its page had rendered fewer frames. For any lighting
photography here: **force `v.titleDim = 0; v.titleTo = 0` before the shot**,
and prefer same-instant pairs (stub the old `_paintSky` onto the instance,
shoot, `delete v._paintSky` to fall back to the prototype, shoot again).

Verified: mean-RGB deltas per state (dawn +24% luma and warm-shifted r>g, noon
+6% same hue, dark night cooler at held luma, lamp-night brighter and warmer),
matched-pair photographs for all four states, lights-write census (every
writer lives in _paintSky), 0 console errors, fp untouched (view-only).
Addendum, same pass: **the low sun.** The key's daily elevation arc was a bare
sine with a 1.6 floor — golden hour sat at ~45° and shadows stayed noon-short
all day. A plain floor drop measured 45° → 42°: NOTHING (the sine is too fat
near its peak). `sunUp = sin(dayFrac·π)^1.6` holds noon at exactly 2.7 and
drops the day's edges to a measured ~37° — hut and tree shadows finally
stretch at dawn/dusk. Lateral shadow-camera coverage is unaffected (a lower
sun stretches shadows ALONG the light direction, which the ortho box covers).

---

## THE BOOK HAS CHAPTERS (2026-09-03) — menu depth, spent where the fiction wanted it

Kyle: menu depth. The deepest menu this game owns is the book, and the fiction
had already promised more than the book delivered ("nobody is ever going to
tell you what you were. the graves will" — while graves recorded no cause).
Four tabs now: **the days** (the chronicle, unchanged) · **the living** ·
**the yard** · **what they know**. All pure reads composed in ui.js;
aggregates stay book-only (the documented §12.3 exception).

- **ONE sim field**: `_carry` keeps the corpse's `cause` on the grave.
  Save-compatible (graves serialize verbatim; old graves lack the field and
  phrase as 'rests here'), fingerprint-neutral (only graves.length is mixed).
  The yard reuses the `_die` how-table VERBATIM — one voice for one fact —
  and 'taken' is absent ON PURPOSE (no body, no grave; do not "complete" it).
- **The yard is the moral mirror and stays a RECORD**: no totals by cause, no
  grouping, no judgment — "Thov was struck where they stood — one of the
  first." is the whole sentence. Verified end to end: strike → corpse →
  carried → grave → book.
- **Chapters work on a dead town**: 'days' still lands on the last page
  (refound button intact), and the yard stays readable beside it — the last
  page's evidence, one tab away.
- Drafted by a 3-draft + 3-adversarial-verify workflow. The verifiers earned
  their run: a census parent-lookup that would MISNAME THE DEAD on recycled
  slots (fixed with lineage invariants: parent gen < child gen, parent born <=
  child born); a yard sub-line that FLICKERED with the burial queue ("not all
  of them were found" was true during every normal death-to-carry gap — fixed
  by adding corpses-still-lying to the buried side); and both draft notes
  carried STALE splice instructions (add TRADES / import WORKS) that would
  have been duplicate-declaration boot-kills — the plumbing had already
  landed them. **Follow a draft's notes only after grepping the live file.**
- ⚠️ SPLICE GUARD TRAP (cost one round): the idempotence check matched
  'pageCensus()' — which matches renderBook's CALL SITE — so the splice
  no-opped while syntax AND import checks stayed green (a missing method is a
  runtime error, not a parse error). Guard on the DEFINITION ('pageCensus() {')
  and count definitions after.

Verified live: all four tabs render in-voice on a day-60 town (66 alive),
grave causes 1/1, the smitten row, dead-town tab flow, 'while you were away'
title, zero console errors. Gate re-run for the sim field.

### The review of the chapters — three real defects, found before the push

A 4-lens adversarial pass (half its agents died on session limits; the book lens
survived and earned the run). Every finding independently verified against the
code before it was believed:

1. ⚠️⚠️ **THE AWAY PAGE DIED ON THE FIRST TAP THE UI INVITES.** catchUp renders
   "while you were away" via showPage(fromDay) and main.js stores `awayFrom` —
   which NOTHING has ever read. The tab handler calls renderBook() with no
   argument, and renderBook defaulted fromDay to 0, so tapping 'the yard' to see
   who died and then 'the days' to finish reading replaced the away page with
   the whole run's greatest hits, unrecoverably. The B key did the same. This is
   the SIXTH instance of this codebase's signature defect (a value computed,
   stored, and consumed by nobody) and the second time in this exact feature.
   Fixed: renderBook remembers the days window in `_daysFrom`; showPage with no
   argument opens the whole book from the board but KEEPS the window when the
   book is already open.
2. **'save it as a picture' saved a different page than the one on screen.**
   exportPage always rendered s.page() under a hardcoded 'the book of the town',
   so the button under 'the yard' — the page the fiction had just promised —
   saved a chronicle with no grave in it, and a dead town exported without its
   last-page register. The export now reads #pageBody (h2 -> title, first .sub ->
   subtitle, ol>li -> rows), so the picture can never disagree with the page the
   button was pressed under. Filename carries the chapter.
   ⚠️ that change made a SECOND bug reachable: chapters run to 40 rows and the
   chronicle never did, so the old unbounded draw loop would have walked the
   yard straight off the bottom of a 1920px canvas. Rows now stop at the footer
   and the remainder is said in voice ("and 4 more, in the book.").
3. **The text-size setting never reached the book at all.** Every size inside
   #page was absolute px, so a player on 150% text got the one panel of long
   reading in the game at 100%. Measured after: tabs 12 -> 18, rows 16 -> 24,
   h2 27 -> 40.5. ⚠️ scoped to #page (the box is out of scope) and each override
   placed AFTER its shared rule — same-specificity duplicates, later wins, the
   CSS-order trap this file already records once.

Refuted and correctly left alone: the census's dormant `k.job` branch (trades
are staged, the guard is deliberate forward-compat — HANDOFF v0.6 records it).
Verified live: away page survives yard->days and B; fresh open gives the whole
book; all four chapters render on a second seed; export photographed for days /
yard / know / the last page; polaroid and kin counts unregressed; 16/16 graves
carry causes; 0 console errors. Gate 119/0 (the sim field; the three fixes above
are UI-only).

---

## 🔬 THE FULL-GAME PASS (2026-09-04) — 24 agents, six lenses, 16 confirmed defects

Kyle asked for a whole-game review including visuals. Six lenses (sim, PLAY IT,
visuals, input/camera, UI/shell, audio), every finding then handed to a separate
adversarial verifier that had to reproduce it in the code or refute it. 24 agents,
0 errors, one finding correctly refuted.
⚠️ THE FIRST TWO LAUNCHES RETURNED `confirmed: []` BECAUSE EVERY AGENT DIED ON A
SESSION LIMIT. That is the documented empty-review trap and it looked exactly like
a clean bill of health. Always read `<failures>` and the journal before believing
a quiet result.

### Fixed in this pass

**The one that could lose a town.** `boot()` could not tell a MISSING WORLD FILE
from a corrupt save: `loadWorld` swallows a 404 and returns null, `fromJSON` then
throws its deliberate "this colony lives in <name>" guard, and that landed in the
same catch as an unreadable blob — so one flaky request filed a real town away
under a key nothing reads back, handed the player a day-0 colony under the "you
left it in the dark" line, and let the 25s autosave make it permanent. The world
now loads BEFORE the try and a missing one refuses to boot with its own sentence.

**`moved` was a time-integral, not a distance** (main.js). `moved += |dx| + |dy|`
with `sx,sy` rebased only in the orbit branch, so the same offset was re-added on
every move event: a finger resting 3px off the press crossed the 26px reach-cancel
about 120ms into a 900ms hold. Tap-select, the double-tap crumb and all four kin
reaches were failing on any pointer that jitters — which is every touch pointer.
Now the furthest displacement from the press.

**A second contact stranded a lifted kin forever.** `down`/`mode` are single
closure variables, so a resting thumb overwrote `mode='reach'` and the first
release ran the wrong branch, which never calls setDown. Re-reaching is gated on
`!s.held`, lift() then refuses everyone, and `held` survives the save. Scoped to
one `pointerId` — ⚠️ INCLUDING THE RELEASE PATH, which is not optional: without
it a stray thumb's pointerup runs the first finger's reach branch with the
SECOND finger's coordinates, and off the board that is `takeAway()`.

**Names were never unique** (sim.js). The language coins from ~175 short words, so
by the third generation the town reused them and the book read as if a dead kin
were still acting and buried "the same person" four times. This game's spine is
that the town keeps the only account of itself. Measured after: 0 duplicates in
174 / 400 / 307 names across three 300-day seeds.

**An abandoned foundation deleted a rung from the game.** A site never rots before
it is finished, so if the last knower died mid-build `unfinished` stayed true
forever, `_weave` never evaluated that rung again, and everything listing it in
`pre` died with it — one seed lost the school on day 67 and could never reach the
little lights. One line, with a truth table: `if (!relearning && (unfinished ||
mine >= room)) continue;`. The empty foundation should invite the archaeology.

**The milestone re-announced itself.** `ageNow()` scans for works STANDING at
prog >= WORK_DONE, so a hall under repair dropped the age and the climb back
re-fired `AGES[a].said` — the once-in-history arrival line — six times in ninety
days on one seed. `ageBest` was computed on the very next line and read by nobody
(this codebase's signature defect, again). Now gated on a genuine first, with a
quieter line for a return; the UI chime got the same treatment, per TOWN so a
refounding earns its milestones again.

**"who first made X" was logged only where it was FALSE.** `_name` writes its line
only for a previously UNNAMED kin, and a real first inventor is usually already
named — so across four seeds 171 such lines were logged and not one was true. The
reason is now worked out from the same branch that follows it. Measured after:
0 false lines.

**The book was 11-17% one repeated sentence.** `log()`'s anti-repeat guard
inspected only `chronicle[length-1]`, so it collapsed adjacent duplicates and
missed every interleaved one: "one went hungry." was a sixth of one seed's entire
book and one seed carried 166 copies of "something hatched near the flat." Now a
bounded 14-entry / 8-day window folds them into one line with its `repeat` count.

**Three view defects, all measured, none visible to any test.** The apron ring was
seated from `cellToLocal` (the RAW grid) while the ground mesh is built from
`_surfaceY` (edge-eased), so all four slabs sat 0.09-0.15 ABOVE the rim — a ledge
around the whole world. ⚠️ THIS IS THE THIRD APRON DEFECT IN THIS FILE'S HISTORY
AND THE SECOND CAUSED BY MEASURING THE BOARD WITH A DIFFERENT FUNCTION THAN THE
ONE THAT DRAWS IT. The kin hover halo was pinned at a literal y = 0.0016 while kin
stand at 0.15+, so it highlighted the ground a body-height below them. And the
cover's slid-off pose landed at y = -0.275, entirely under the apron, so pulling
the sheet off DELETED it from the picture — under a comment reading "it does not
vanish." (0.34 where 0.035 was meant.)
Measured after: apron -0.015 below the rim, ring 0.1602 vs feet 0.1626, sheet
0.030 and above the apron.

**One suspend killed sound for the session.** `start()` was an unconditional
`if (this.ready) return;` and NOTHING in the repo ever called `resume()` — so a
context suspended by an app-switch or created before a real gesture stayed
suspended forever. Verified: suspended -> running. sfx.js also had no page
lifecycle at all, so the four continuous beds droned on in a hidden tab frozen at
their last values; the room is quiet now when nobody is looking at it.

**Thunder was inaudible by construction** — a 60 Hz sine against the basement's
59.5 Hz hum beats at half a hertz, so the one warning that rain is coming arrived
as a slight wobble in the room tone. It is a swept rumble through a closing
lowpass now.

Also: `smite`/`takeAway` left `this.alive` one too high until the next tick (they
run from outside one), `_siteWork` gave up after a ±8 scan and planted the work at
the inventor's FEET — on the ground `ok()` had just refused — for about a third of
all works in a mature town (now widens to 14 then 20, with the ±8 pass byte-
unchanged), and the box's key card never mentioned WASD, the only way to cross
the board.

### Left as a backlog, deliberately

- **Work views are un-instanced Groups**: ~845 individually shadow-casting meshes
  by day 222 against a 53-mesh baseline. A real late-game frame-rate slide and a
  real refactor; not something to slip into a review pass.
- `page()`'s per-act rarity divisor suppresses a mass die-off *because* it is
  mass, so an away page can report masonry after 24 named kin died.
- `k.saw` can never go positive, so the witness schism is unimplemented.
- `_shaped` is written by `shape()` and read by nothing.
⚠️ REFUTED and correctly left alone: "arming a power strips the sheet for nine
verbs that do not need it" — the verifier reproduced the state and the headline
sub-claim was simply false.

### ⚠️⚠️ THE WIDENING THAT A REVIEW RECOMMENDED AND FOUR SEEDS REFUTED

The `_siteWork` fix in the list above SHIPPED RED and was reverted. It is the most
useful thing in this whole pass, so it gets its own note.

The finding was true: at ±8 the placement scan fails on about a third of calls in
a mature town and the fallback plants the work at the inventor's exact FEET, on
ground `ok()` had just refused. The verifier measured seed 3 at alive 138 → 142
and called it a win. It went in, and the gate came back **117/2** — the hunger
invariant, on a fixture the change had no obvious business touching.

A/B across four seeds, 300 days, widening ON vs OFF:

| seed | alive ON | alive OFF | works ON | works OFF | mean dist from hearth |
|---|---|---|---|---|---|
| eco1 | 37 | **183** | 55 | 92 | 13.8 vs 11.0 |
| bat0 | 337 | 208 | 95 | 137 | 20.1 vs 16.4 |
| live | 66 | **262** | 111 | 140 | 25.1 vs 18.6 |
| basin | 105 | 123 | 56 | 84 | 13.6 vs 10.5 |
| **total** | **545** | **776** | | | |

**A scattered town starves.** Pushing a building further out to satisfy the
spacing rule costs more in walking than a badly-sited building costs in anything
else, and the town then builds FEWER of them because the population that would
have built them is smaller. Reverted; the feet fallback stays.
⚠️ **SINGLE-SEED COMPARISONS OF THIS GAME ARE NOISE** — written twice in this
file already, and this is the third burn, this time inside a review's own
recommendation with a number attached. A verifier measuring one seed is not
verification. Any real fix here must find a NEARER legal cell (a BFS out from the
inventor), never a farther one.

### The other red: my own fix duplicated an existing patch

"smite() leaves this.alive stale" was real — but `takeAway()` already hand-
decremented for exactly this hazard, with a comment citing "31 vs 30". Putting the
decrement in `_die` (the correct central funnel) made that path decrement TWICE,
so a town that had lost somebody no longer restored to its own fingerprint. The
hand-decrement in `takeAway` is gone and `_die` owns it.
**Before centralising a fix, grep for the special case somebody already wrote.**

---

## 🔨 THE TRADES (2026-09-04) — the town divides its own labour

Kyle: *"the creatures need structure and job roles and daily tasks so the world
seems to be more alive and cohesively working together towards a greater goal."*

**Nobody is GIVEN a job.** `k.did` tallies what a kin actually spends its life
doing (gathering / water / keeping what stands), `k.taught` counts the times
somebody learned a practice by watching THIS kin work, and once a day a grown
kin whose life has a clear shape is NAMED for it. That is the same rule as
everything else here: the town works itself out and the record reports it.
⚠️ `k.job` and the TRADES strings had been sitting in ui.js since v0.6, read by
the inspector and (later) the book's census, with nothing in sim.js ever writing
them — the review called it out as dormant. It is live now, and the inspector,
the hover tag, the census chapter and a chronicle beat all light up at once.

**A trade is COMPETENCE, NOT COMPULSION.** The gatherer gets more out of the same
handful (and takes no more off the board, so it cannot overgraze), the
water-carrier drinks quicker, the keeper builds 1.3x faster, the one who shows
the others how is watched from 21 cells instead of 16. Biasing `_decide` was
considered and REFUSED: the need economy here is famously delicate — see the
placement-widening entry, a 30% population collapse from one well-meant change —
and a kin who wants food less because of a job title would starve for its title.
Competence divides the labour on its own: the keeper finishes the hut, so the
others do not have to.

⚠️⚠️ **THE THRESHOLDS ARE MEASURED, AND THE FIRST TWO GUESSES WERE BOTH WRONG BY
AN ORDER OF MAGNITUDE.** Measured at day 300 over 175 grown kin, median tallies:
gather 33,173 · water 11,364 · keep 33,334 · taught 38 (p90 95, max 232).
- v1 used `lead >= 2200` and `taught >= 3`: **173 of 175 became the teacher** and
  not one became a water-carrier. The witness loop credits EVERY onlooker, so a
  single afternoon's work teaches dozens.
- The counters were **Uint16 and SATURATED** — gather and keep both pin at the
  65k ceiling, and two saturated buckets cannot be compared, so every long-lived
  kin looked equally devoted to everything. Uint32 now.
- **Water must be normalised (x3) or the trade is unreachable**: drinking is
  brief and eating is constant, so on raw ticks the water-carrier can never lead.
- v2 compared the lead against the SUM of the other two, which a typical kin
  (33k / 34k / 33k) can never beat: **147 of 153 had no trade and there were zero
  keepers in four seeds.** It is the RUNNER-UP that matters — total minus the
  highest minus the lowest.

**Measured after, four seeds, 300 days** (grown / none / gather / water / keep /
show): eco1 120/32/72/1/8/7 · bat0 139/84/20/11/19/5 · live 148/72/49/2/24/1 ·
basin 131/9/118/1/0/3. All four trades occur, generalists still exist, and the
mix differs by seed — basin is a gathering town, bat0 spreads evenly.
Population 866 vs the 776 baseline: healthier, not runaway.
Determinism identical, save round-trip hash-equal, trades survive the save
(23 → 23), and a legacy save with no trade arrays loads with 0 trades and no
throw (fromJSON's `if (o.k[key])` leaves the new arrays at the constructor's
zeros, and job 0 is 'no trade' — exactly right for a town that predates the idea).
⚠️ `job`, `taught` and all three `did` buckets are folded into `fingerprint()`:
the trade changes how fast they build, eat, drink and teach, so it is live sim
state, and the tallies behind it must be folded too or two towns one tick from
different trades hash equal.

### ⚠️⚠️ `ageBest` WAS RECOMPUTED ON LOAD, AND IT IS IN THE FINGERPRINT

Latent since ageBest shipped; the trades slice moved one seed's development into
the window and it went red. `fromJSON` did:

    s.ageBest = Math.max(o.ageBest || 0, s.ageNow());

`_daily` is the ONLY writer of ageBest, so between an age turning and the next
day boundary the live value LAGS the standing board. A save taken in that window
restored to a HIGHER ageBest than the town it came from — and ageBest is folded
into `fingerprint()`, so the baked-world round-trip test failed with a hash
mismatch and no per-kin field differing anywhere. Chasing that costs an afternoon,
because every obvious suspect (the new k arrays, the works, the terrain sample)
diffs clean.

**ANYTHING THE FINGERPRINT FOLDS MUST ROUND-TRIP EXACTLY.** Deriving it on load
is how you get a hash that disagrees with its own town. This is the same class as
the stale `alive` count and `p.techs.size` — the third instance in this file.
The `max` survives only as the legacy seed for saves written before the field
existed; a real value is taken verbatim, and `_daily` corrects any lag at the
next day boundary anyway.

---

## 🏘️ SOMEBODY LIVES HERE (2026-09-04) — doors, windows, ridge beams

Kyle wants the town to read like a kingdom. Photographed at eye level first, and
the diagnosis was blunt: **not one building in this town had a door.** The roofs
were already doing real silhouette work (steep, tiled, terracotta and slate, at
varied angles — see the roof note) and then nothing said A PERSON GOES IN THERE.
Every dwelling-scale building now has a plank door with a timber lintel and a
worn stone step, and shuttered windows placed where the night-glow spots already
were, so the light now comes out of an actual opening instead of off blank
plaster. Houses take a door and 1-2 windows, the school takes a door and windows
on both faces, and the hall — the biggest thing the town ever agrees to build —
takes a great door, three windows a side and two hung banners, so it can be
picked out of the skyline and identified.
Everything is a flat panel laid ON the wall face and pushed out half a
millimetre: no booleans, no holes, no new material.

⚠️⚠️ **NO EAVES. TRIED TWICE, PHOTOGRAPHED TWICE, BOTH WORSE — do not add them
back.** An overhang is a SIDE-ON read and this game is played from a bird's eye.
As one `w × d` box it drew a huge dark tabletop across every building in the
town; as a proper four-board perimeter rim it drew a heavy dark PICTURE FRAME
around every roof, because from above a rim is an outline, not an overhang. The
ridge beam alone gives the roof its built line and costs one box. **The lesson is
the camera: detail that only reads from an angle the player never has is not
detail, it is noise.**

⚠️ COST, and it is the real ceiling on going further: work views are un-instanced
Groups, and this pass took the average house from ~9 meshes to 13.5, the school
to 23 and the hall to 32 — **959 work meshes for 91 buildings**. The full-game
review already flagged un-instanced work views as a late-game frame-rate slide.
**The next visual step is not more detail, it is the MERGE**: hand-merge each
building's Group into ONE mesh with baked vertex colours (the same technique
`_kin()` already uses, since BufferGeometryUtils is an examples module and is not
vendored). Measured, the material roughness spread across every building material
is only 0.7–1.0, so a single shared material at ~0.88 would be visually
indistinguishable — which makes the merge cheap to attempt and worth ~10x. Do
that before adding another box to any building.
