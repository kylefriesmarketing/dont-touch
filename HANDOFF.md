# THE GLASS — HANDOFF
**v0.1 · 2026-08-19 · read this before writing a line.**
Companion to `THE_GLASS_BIBLE.md` (the design authority) and `README.md` (how to run it).

| File | What it is | State |
|---|---|---|
| `THE_GLASS_BIBLE.md` | the complete design bible, 24 parts | **v1.0. Four decisions locked with Kyle. §22 is the redline list.** |
| `sim.js` | the entire deterministic simulation | **~900 lines. M1–M6 live. No THREE, no DOM.** |
| `view.js` | Three.js rendering | **live. Backlit, one InstancedMesh + one Points for the whole colony.** |
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

## For Kyle (bible §22)

Title, roadmap slot against Dec 2, Steam price, how dark the dark end gets, and whether the
second species is v1 or a patch. Nothing in the code assumes an answer to any of them.

---

*Dirty Boy Devs. The jar runs, the tests are green, and nobody has told the player what they were.*
