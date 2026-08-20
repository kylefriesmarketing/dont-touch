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

*Dirty Boy Devs. The jar runs, the tests are green, and nobody has told the player what they were.*
