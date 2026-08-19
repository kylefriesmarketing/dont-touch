# THE GLASS

**Something is alive in the jar on your windowsill, and it has begun to notice that the weather has a pattern.**

A god game where every divine power is something a kid can do to a terrarium — warm the glass
with a finger, tilt it, breathe on it, open the lid — and the little glowing people inside build
a life out of what you did to them, including the parts you didn't mean.

*a DIRTY BOY DEVS game · the bedroom windowsill · browser, no build step*

---

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
| **hold on the glass** | warm it. your finger comforts, and your finger kills. it takes seconds to arrive and seconds to leave |
| **tap one of them** | look at whoever you touched |
| **shift-drag / right-drag** | tilt the jar. water runs downhill. so do they |
| **drag off the jar** | walk around it · wheel to lean in |
| **hold space** | breathe on the glass. enough breath and it rains inside |
| **L** | the lid. open it and the jar loses its water |
| **T** | tap the glass. don't |
| **B** | the book — what actually happened, in their handwriting |
| **1 · 4 · 20 · P** | speed, and pause |

URL params: `?newgame` · `?seed=whatever` · `?pause`

## What's in this build

This is **M1–M6 of the bible** (`THE_GLASS_BIBLE.md`), which is to say: the jar, the life, the
blood, the hand, the mind, and the chronicle.

- **The jar.** A 64×64 heightfield in a glass vessel on a real windowsill, with a thermal field,
  a sealed water cycle, moss that grows and can be grazed to nothing, and a room whose
  temperature follows the actual calendar.
- **The life.** Egg → nib → half → whole → rime. They eat, drink, rest, seek company, court, and
  bury their dead on a shelf they picked themselves. Death is permanent and the graves accumulate.
- **The blood.** Six of the bible's twelve loci, with a linear dominance ladder, carried
  recessives shown dimmed, mutation as an event, and the Marrow rule — matching alleles halve a
  life, so a closed gene pool visibly rots.
- **The hand.** All five verbs. Warmth has a lethal core and a comfortable ring. Tilt moves the
  pond. Breath makes weather. The lid dries the jar out. The curtain sets the day.
- **The lantern.** Every kin wears its dominant need as a colour and its wellbeing as brightness.
  The state of the whole society is readable from across the room with no panel open.
- **The chronicle.** An event stream, a sifter that ranks by statistical rarity, and **the book** —
  one page, maximum seven lines, three reversals, exportable as a 9:16 PNG.
- **Fingerprints.** Every time you touch the glass, the smudge stays. Forever.

Not in this build (M7 onward): the weave (culture and traditions), the fog board and the symbol
system, the theonym and schism, the late eras, the second species. Those are specced in the bible.

## Files

```
sim.js          the ENTIRE deterministic simulation. No THREE. No DOM. Node-testable.
view.js         Three.js rendering. Reads the sim, never writes it.
ui.js           DOM overlay — HUD, chronicle, inspector, the book, the PNG export.
sfx.js          all WebAudio synthesis, zero samples.
main.js         boot, fixed-timestep loop, input, IndexedDB persistence.
index.html      shell, CSS, the help card.
data:           all tuning lives in the C block at the top of sim.js.
test-sim.mjs    headless battery — node test-sim.mjs
test-view.mjs   browser battery — needs playwright, and the server running
lib/            vendored three.module.js, no CDN
serve.mjs       node serve.mjs 8460
```

## Tests

```
node test-sim.mjs        # 40 tests: rng, world, blood, life, the hand, determinism, save, soak
node serve.mjs 8460 &    # then, with playwright installed:
node test-view.mjs       # 19 checks: every verb, the inspector, the book, save/reload
```

Both are green as of this build.

## Save

The colony lives in **IndexedDB** (`theglass` / `colony`). `localStorage['theglass-save']` holds
only the summary the house hub reads. `navigator.storage.persist()` is requested on boot —
without it Safari evicts any origin untouched for seven days and takes the colony with it.

`__G.wipe()` in the console starts over.

## Notes

There is no score, no objective and no way to lose. Nobody is ever going to tell you what you
were. The graves will.
