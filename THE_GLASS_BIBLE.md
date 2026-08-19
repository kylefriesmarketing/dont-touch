# THE GLASS — THE COMPLETE BIBLE
**Dirty Boy Devs · a flagship of THE HOUSE (the bedroom windowsill) · HTML5 browser · Age of Toys scale · Steam-ready**
*Working title. Shortlist at §23.*

> **Logline:** Something is alive in the jar on your windowsill, and it has begun to notice that the weather has a pattern.
>
> **Pitch in one breath:** A god game where every divine power is something a kid can do to a terrarium — warm the glass with a finger, tilt it, breathe on it, open the lid — and the little glowing people inside build a civilization out of what you did to them, including the parts you didn't mean.
>
> **Format:** browser, no build step, vanilla ES modules + Three.js, single diorama · **Session:** 10–20 min a sitting, forever · **Tone:** cozy on the surface, no guardrails underneath · **Production:** 100% procedural art + WebAudio synth, zero generated-asset spend · **Design school:** Populous's one-verb discipline, *Creatures*' interiority, Dwarf Fortress's silence, the Sims' refusal to moralise.

---

## ⚠️ READ THIS FIRST — handoff note to the next session

| File | What it is | State |
|---|---|---|
| `THE_GLASS_BIBLE.md` | this document | **v1.0, 2026-08-18. Four decisions locked with Kyle (§1). Nothing built yet.** |
| `sim.js` | the entire deterministic simulation | not written |
| `index.html` | view + input only | not written |
| `test-sim.mjs` | headless battery | not written |

**The next milestone is M1 — THE JAR (§19). Do not build the genetics, the culture ladder, or the symbol system first.** M1 is: a heightfield in a glass vessel, forty kin walking on it, lanterns lit, and a finger that warms the glass. If forty glowing beans wandering a terrarium is not already pleasant to look at with no score, no genetics and no goals, the game does not exist and everything after M1 is decoration on a corpse.

**Read §17 INVARIANTS before writing a line.** The sim/view split is the whole reason this project can be tested, and it is the first thing a hurried session breaks.

---

# 1. THE PITCH

You did not buy this. It was on the sill when you moved in, or the kid brought it home, or it came back stamped RETURN TO SENDER. A glass vessel about the size of a jar of pickles, a finger of soil, some moss that isn't moss, and forty small soft things with lights in their chests.

They are alive. They eat, they sleep, they pair off, they have children who look like both of them and neither. They die and the others bury them. And because you are the largest fact in their universe — the warmth, the tilt, the fog, the light and the dark — everything they eventually believe about the nature of existence is a theory about **you**, built from evidence you left without meaning to.

You can make their lives good. You can make their lives a horror. Mostly you will do both, by accident, over months, and they will write it down.

## The three pillars

**P1 — EVERY GODLY POWER IS A THING A KID CAN DO TO A JAR.**
Warm the glass with a finger. Tilt it. Breathe on it and draw in the fog. Open the lid. Move it into the sun or out of it. That is the complete verb list and it never grows. There is no menu of miracles, no belief currency, no card deck, no research tree for the player. The reason this game is not Godus is this pillar. *Every feature request gets tested here first: if it adds a button between the player and the glass, it does not ship.*

**P2 — THE SIMULATION WRITES THE STORY DOWN, IN THEIR HANDWRITING.**
The player never authors a caption. The kin do. Their art, their symbols, their burial grounds, their word for you — all of it is generated from what actually happened, surfaced as one readable page per era. If the player has to explain what happened to a friend, we failed; the game should hand them the page.

**P3 — THE GAME NEVER TELLS YOU WHAT YOU ARE.**
No alignment bar. No good/evil. No advisor tutting. The consequences of cruelty are *simulated and visible* — smaller colonies, longer graveyards, a second god invented to explain the bad days, a name for you with a hard edge in it — and never *scored*. The player is allowed to be the villain, and is never once informed of it. The world is the scoreboard.

## Locked decisions (Kyle, 2026-08-18)

| # | Decision | Call |
|---|---|---|
| 1 | Doorway | **The terrarium on the bedroom windowsill.** FRESH CUT's Odd Job H already planted it — *"the sky is wrong. Something vast watches you mow."* This is the other side of that joke. QUARRY takes the same window's star view. |
| 2 | Moral frame | **The world is the scoreboard.** No morality bar, ever. Their art, myths, graves and name for you are the readout. |
| 3 | Structure | **The forever terrarium.** One jar, one continuous lineage, runs while you're away, returns a written page. No runs, no reset, no score screen. |
| 4 | Scope | **Flagship.** Own repo, own bible, sim/view split, ~22–28 sessions. Steam-ready alongside THE HOUSE. |
| 5 | Species | **The Kin.** Their own name for themselves is procedural and changes by era; the player only learns it if they teach them to write (§8). |
| 6 | Population | **Named vs unnamed.** Only kin who *do* something earn a name and a portrait. A colony of 200 carries ~12–18 named characters at a time (§4.4). |
| 7 | Art | **Backlit silhouette.** The jar is lit from behind by the window. Everything reads as shape + lantern glow. Procedural, zero asset spend. |
| 8 | Ending | **The Glass Era.** They eventually invent glass, look at it, and understand. What they do next is theirs, and it is decided by your record, not by a menu. |

---

# 2. WHAT THE RESEARCH ESTABLISHED

*Every finding below changed a design decision. Sources at §24.*

### The god verb keeps getting demoted, and that is what killed the genre.
Populous: The Beginning made terraforming optional — Hardcore Gaming 101: *"this Populous is genetically closer to Warcraft III than any of its own kin."* Black & White 2 converted creature learning into a shop currency (Tribute) and fell from Platinum (300k+) to Silver (100k+) in the UK — roughly a 3× commercial collapse. Godus made godhood into clicking pink Belief spheres. Molyneux's own 2026 comeback, *Masters of Albion*, launched Mixed at 914 peak CCU with players writing that *"godhood in this game appears to be micromanaging, making pie recipes."*
**Therefore:** P1. Four verbs and a dial, forever. No currency, no cards, no research, no build queue, no menu of miracles. Audit test: *if I removed the hand, could the player still progress?* If yes, we have shipped a colony sim with a weird camera.

### Indirect control turns every AI bug into a progression wall.
*From Dust*: villagers *"would get stuck in front of microscopic changes in elevation"* and the player *"can never give them direct orders"* — GameCritics: dependents become *"stubborn obstacles that must be suffered."*
**Therefore:** the lid is the bail-out valve (§3.4). You can reach in and pick one up. It is expensive (they see the hand, §9.3), it is not the optimal play, and it exists so that helplessness is never the experience.

### Legibility beats fidelity. SimEarth simulated Daisyworld and read as noise; Reus states its adjacency bonuses outright and reads as depth.
**Therefore:** the lantern (§4.2). Every kin wears its dominant need as a colour and its wellbeing as brightness. The state of an entire society is readable from across the room, at a glance, with no UI open. This is the single most important legibility decision in the design and it is also the art direction.

### Dwarf Fortress describes 78% of its dwarves with silence.
Personality facets roll on a curve; the neutral 40–60 band (78% of rolls) is **never reported**. Character description budget is spent entirely on deviation.
**Therefore:** §4.4 and §6.3. Most kin have no name, no portrait, no traits printed. A kin earns a name by deviating — by doing something first, surviving something, refusing something. That is also how we hold 200 agents and 15 characters in the same jar.

### Creatures proved attachment, and the community proved the other half.
952 neurons, 256 chemicals, genetically-specified brains — and the thing that made players cry was that you *taught them words* and they *died in forty hours*. The same depth produced an organised Norn-torture subculture with published genetic recipes for chronic pain. Jenn Frank on hoarding them on floppies: *"I was looking at headstones. This was not suspended animation at all. **I had made coffins.**"*
**Therefore:** the sim must be deep enough to be tortured or the care means nothing (§14). And: the player teaches them something (§8), and they die (§4.3), and the game keeps the graves.

### The permadeath study (n=394) found permadeath does not *create* attachment — it converts existing attachment into meaning, mediated by grief.
**Therefore:** build the attachment systems (name, lantern, memory, portrait, the page) *before* tuning lifespan. Death shipped early is just churn.

### Niche solved genome legibility and failed attachment.
Two stacked icons per locus — bright top allele = phenotype, dimmed bottom = carrier. No Punnett square, no percentages. Reviewers still called it *"generic in totality"* — because nichelings have no names, no memory, no personality, no bark. **Correctness is not charisma.**
**Therefore:** §5 steals the two-slot widget verbatim, steals the co-dominant immunity rule (homozygous = halved lifespan) verbatim, and then spends everything else on the twelfth locus, §5.3 — the one that decides whether a kin can see you.

### CK3 caps the best possible inheritance at 80%.
Two Genius parents produce Genius only 80% of the time. That ceiling is why 40-hour dynasty projects generate stories instead of solved states.
**Therefore:** no trait in §5 ever inherits above 80%, and Sight-of-God (§5.3) tops out at 45%. Nothing in this game can be finished.

### Story sifting: simulations don't lack stories, they lack curation.
James Ryan: *"Without curation, actual stories cannot obtain in emergent narrative."* Kreminski's *Select the Unexpected* result: rank surfaced events by **statistical improbability**, not by hand-tuned importance. And the retellings study: *"retellings with a small number of reversals (up to three) tend to feel more compelling."*
**Therefore:** §12. The sifter is a real system with a real budget, it ranks by rarity against running counters, and THE PAGE is capped at three reversals. Build the sifter before building more simulation — the Tale-Spin effect means depth without surfacing reads as *shallower*.

### The Sims' AI was deliberately made worse.
Will Wright: the original AI was *"too good — almost anything the player did was worse than the Sims running on autopilot."* They degraded it to create a job for the player.
**Therefore:** §6.5. The Kin are competent at surviving and bad at deciding. They will farm the wrong patch, over-winter in a cold corner, and follow a charismatic idiot. Autonomous agents that solve their own problems produce no stories, because a story is a gap between intent and outcome.

### Alignment belongs in the art, not the HUD.
Black & White's temple, hand, music and landscape all morphed with the player; it is the most-remembered thing about the game and there was never a bar. Masters of Albion tried the same and was praised for it even in a Mixed review.
**Therefore:** P3 and §9. Also §15.3 — the fingerprints on the glass never wipe.

### The market says: cozy-shaped, cruelty-permitted, and the artifact is the product.
Cozy went from 0.4% to 3.1% of Steam titles grossing $100k+ between 2022 and 2025 — a 675% rise, the fastest-growing keyword on the store. WorldBox — pixel art, solo dev, $19.99, permanently Early Access — sits at ~33,000 reviews / 96% positive / ~$13M estimated, on a disaster menu. **No successful game in this space markets cruelty as the main verb.** RimWorld's real moat is that the *game* supplies the proper noun for the clip.
**Therefore:** we ship cozy-shaped with no guardrails, and §12's PAGE export is a launch feature, not a stretch goal. 36% of Steam players cite short-form video as a discovery channel and *"strategy and less visually dynamic games underperform in showcase content"* — our compensation is characters, lanterns and a page that reads in three seconds at 9:16.

### The hard browser numbers.
SoA typed arrays beat object arrays by ~24× in pure JS with no WASM, and remove the GC frame spikes that make a sim feel cheap. `Float64Array` measured ~5% *faster* than `Float32Array` in JS. Spatial hashing beats quadtrees for uniform moving agents. `InstancedMesh` does not support skeletons, and three.js SkinnedMesh collapses below 60fps at ~200 instances — but a vertex-shader-animated InstancedMesh crowd demo hits 100,000 characters in one draw call. localStorage is 5 MiB and synchronous; IndexedDB is effectively unbounded and Safari evicts any origin untouched for 7 days unless you call `navigator.storage.persist()`.
**Therefore:** all of §16, and specifically: **call `navigator.storage.persist()` on first meaningful action or a player's six-month-old colony will silently cease to exist on a Mac.**

---

# 3. THE HAND — the five verbs, and there will never be a sixth

The whole of the player's power. Each is analog, continuous, and does at least two opposite jobs.

## 3.1 WARM — press a finger to the glass
Hold left mouse / a finger on the glass. A soft heat kernel is injected into the world's thermal field at that point, falling off with distance and with the glass's thickness. Heat diffuses on the sim grid and radiates out of the lid.

- **Kindness:** thaws frost, dries a marsh, incubates a clutch (eggs need sustained ~28° for 3 days), lets cold-blooded lineages travel at night, and *feels good* — kin with the placid temper will come and stand in a warm patch, which is the game's single most affecting sight.
- **Cruelty:** above 41° they blister; above 46° they die in under a minute; sustained heat over a moss bed sterilises the soil for a season; heat over water makes the whole jar a humid rot-house.
- **Triple duty:** heat is also agriculture (three of the seven food species are heat-gated), and it is the only way to crack the Kiln era open (§10).

**Feel:** the glass conducts. Your finger's heat arrives *slowly and leaves slowly* — 4–8 seconds of lag either way. You cannot use it as a precision instrument, and that is the point. Every act of god in this game is imprecise, which is why every act of god in this game has consequences you did not choose.

## 3.2 TILT — drag the jar
Click-drag on the vessel body (not the glass surface). The whole world rotates up to 22° and returns to level over ~3 seconds when released, with the terrain and fluids honouring it.

- **Kindness:** moves standing water to a dry field, opens a landslide path to an unreachable mineral seam, dumps snow off a roof, tips a trapped kin out of a crevice.
- **Cruelty:** floods a burrow. Collapses a hillside onto a village. Spills the pond into the moss and kills the season's food. Drowns everyone in the low end.
- **The slapstick:** kin *slide*. They windmill. They grab each other. It is legitimately funny at 4mm scale and it is also how you kill a hundred of them, which is exactly the Lemmings license — the comedy has to be in the fiction, and it has to arrive before the player's guilt does.

Tilt is loud in the world: every kin above ground gets a **Tilt memory** (§6.4) and the surface of the pond keeps sloshing for a minute after you let go.

## 3.3 BREATHE — fog the glass, and draw in it
Hold `Space` (or two-finger press) and the inside of the glass fogs from the outside in. Two consequences:

**(a) Weather.** Fog raises humidity; released, it condenses and it **rains inside the jar** for 20–90 seconds depending on how long you held it. Rain fills the pond, greens the moss, drowns eggs, and puts out fires.

**(b) The Fog Board — the most important system in the game.** While the glass is fogged you can draw on it with the cursor. A stroke is captured, simplified, and added to your **symbol set**. The kin can see it. Kin with the Sight (§5.3) can see it *clearly*; everyone else sees a shape in the sky. Over time they copy it, carve it, and — critically — **assign it a meaning you did not choose** (§8).

You do not get to say what your symbols mean. You only get to choose when they are showing.

## 3.4 THE LID — open it
Click the lid. It lifts. The world's temperature and humidity begin to equalise with the room, which is itself seasonal (§11.4), so leaving it open is never free.

With the lid open you may:
- **Give:** a crumb, a drop of water, a seed from the other window plant, a dead fly, a match struck and dropped in. Each is a physical object that lands with weight and is dealt with by the sim, not by a menu.
- **Take:** reach in and pick up exactly one kin. You can move it, separate it, save it from a fire, or drop it in the pond. Holding a kin is the game's only direct control and it is deliberately awful for the kin — see §9.3, the Hand Taken. Every kin who *witnesses* it remembers it forever.
- **Introduce:** later-era items you have earned by discovery, not by purchase — a second species (§11.5), a pane of coloured glass over part of the lid, a mirror.

**The lid is the bail-out valve for the From Dust problem.** It exists so the player is never helpless, and it costs enough that it is never routine.

## 3.5 THE LIGHT — the curtain and the lamp
Not a press; a setting. A slider on the window itself: full curtain (dark), half, open, plus a desk lamp you can leave on at night.

Day length drives everything downstream — the lantern economy, sleep, the growth of every food species, and the kin's own calendar. Leaving the lamp on for a week produces a generation with no concept of night, which sounds cute and is in fact catastrophic (§10.4).

**That is the whole verb list. Warm, tilt, breathe, lid, light.** If a design conversation ever ends in "and we could add a power that…", the answer is no. Take the idea and express it through one of these five, or drop it.

---

# 4. THE KIN

## 4.1 The body
A soft two-lobed silhouette — a bulb of a body, a smaller head-bulb, a light in the chest. Between two and six limbs depending on the Limb locus. Adults stand 3–5mm at world scale; the jar is 140mm across. They are **legible only as silhouette plus lantern**, which is both the art direction (§15) and the reason 400 of them run at 60fps (§16).

They are not cute in the plush sense. They are shaped like something you'd find under a rock and be glad about. The affection has to be earned by behaviour, not by big eyes.

## 4.2 The lantern — the whole UI
Every kin carries a bioluminescent organ in the chest. It broadcasts, continuously and without any interface:

| Channel | Encodes | Read as |
|---|---|---|
| **Hue** | dominant unmet need | amber = hungry · blue = cold · violet = lonely · green = content · white = *working* · red = afraid · black-flicker = dying |
| **Brightness** | overall wellbeing | a healthy colony is bright. A neglected one is a field of dim dots and you can see it from the doorway. |
| **Pulse rate** | arousal / urgency | resting 0.4 Hz, alarmed 2.5 Hz. A colony that has just seen the hand pulses together, then desynchronises over ~40 seconds. That desynchronisation is the most beautiful thing in the game and it costs one shader uniform. |
| **A second colour, in the ring** | belief tag (§9.4) | after a schism the jar visibly separates into two colours of faith, and you can watch the border move. |

The lantern's *base* colour is genetic (§5.1), so bloodlines are visually traceable across generations without a family tree screen open. Grandma was teal; you can find her grandchildren in a crowd.

**Design rule:** any state the player needs to know goes on the lantern or it does not get a UI. Inspectors exist (§6.6) but the game must be fully playable with every panel closed.

## 4.3 The life
| Stage | Duration (default) | What's different |
|---|---|---|
| Egg | 3–6 days | needs warmth ≥ 24°; a clutch chills in one cold night |
| Nib | 8 days | carried; cannot eat solids; learns by watching only |
| Half | 20 days | can work, cannot breed, learns fastest, imitates the nearest adult |
| Whole | 90–260 days (Span locus) | breeds, invents, teaches, leads, dies |
| Rime | last ~15% of life | slower, stronger memory, the only ones who *teach unprompted* |

**One day = 90 seconds of watched real time** (tunable; the accumulator runs the sim at a fixed 15 Hz and a day is 1350 ticks). A default Whole lives 3–7 hours of watched play. You will bury a lot of them, and every one is buried by hand by the others.

Death is permanent. There is no revive verb. The graves stay (§9.5).

## 4.4 Named and unnamed — how 200 kin become 15 characters
A kin is born unnamed. It is drawn, simulated and buried like everyone else, and the chronicle refers to it as *a kin*.

A kin **earns a name** by deviating — first to do a thing, sole survivor of a thing, refuser of a thing, carrier of a visible rare allele, mate of a named kin, or subject of a sifter hit (§12). At that moment the game generates a name in the kin's own current language (§8.4), promotes it to a **portrait card**, and starts keeping its memories in full.

**Budget: 18 named kin alive at once.** When a nineteenth qualifies, the least-storied living name is demoted to "known" (keeps its name, loses its card slot). Named kin who die stay named forever and stay in the chronicle.

This is the 78% silence rule made structural. It is also the entire answer to "how does a colony sim hold 200 agents without becoming a spreadsheet."

---

# 5. THE BLOOD — genetics

Twelve loci. Every one of them changes *how a kin plays*, not what a number says (the Rogue Legacy lesson: Vertigo beats a clade diagram at 1% of the engineering cost). Two alleles per locus, one from each parent, 50/50 draw, with a **linear dominance ladder** per locus (Niche's model, not binary dominant/recessive).

## 5.1 The twelve

| # | Locus | Alleles | What it actually does |
|---|---|---|---|
| 1 | **Lantern** | 6 hues × 3 intensities | base glow colour (bloodline tracking); intensity sets night vision radius and how visible you are to what else lives in the jar |
| 2 | **Hide** | rime · plain · ash · slick | thermal band. Rime kin work in frost and blister at 34°. Ash kin walk into your warm patch and are fine. **This locus decides who survives your finger.** |
| 3 | **Gut** | moss · spore · lick · carrion · kin | what they can eat. `lick` (mineral) unlocks the Kiln era. `kin` is recessive, rare, and exactly as bad as it sounds |
| 4 | **Limb** | 2 · 4 · 6 · long-4 | burrower / walker / climber / brachiator. Gates *terrain*, which gates which parts of the jar a bloodline can even live in |
| 5 | **Voice** | carry-short · carry-far · mute | how far a call reaches. Mutes are a social catastrophe and a cultural revolution — a mute lineage invents gesture-writing 3× faster (§8) |
| 6 | **Eye** | four · two · none | none = navigates by lantern-heat, immune to your light tricks, and cannot see the fog board at all |
| 7 | **Span** | quick · even · slow | 90 / 160 / 260 day life. Quick lineages evolve and forget fast; slow ones hold traditions and stagnate |
| 8 | **Brood** | many-frail · few-hardy | 5–7 eggs at 40% survival, or 2 at 85% |
| 9 | **Temper** | placid · curious · fearful · cruel | the behavioural allele (§6.2). `cruel` kin are not villains, they are a *pressure* — they hoard, they push, and they are also the ones who will do the thing everyone else is too afraid to try |
| 10 | **Weft** | none · hand · fine-hand | tool capability. `none` lineages can still hold culture (song, burial, naming) but never leave the Hearth era |
| 11 | **Marrow** | 8 co-dominant alleles A–H | disease resistance. **Both alleles express — heterozygotes resist two blights. Homozygotes halve their lifespan.** Straight from Niche, and it does four jobs at once: it mechanises inbreeding depression, forces outcrossing, creates a reason to want strangers, and teaches real biology without one word of tutorial |
| 12 | **Sight** | blind · dim · true | **§5.3** |

## 5.2 Inheritance and the ceiling
Standard: two alleles per parent, one drawn from each, dominance ladder decides the phenotype, recessive is carried and displayed dimmed.

**Nothing inherits above 80%.** Even two `true`-Sight parents, even two `slow`-Span parents. CK3's ceiling, imported wholesale, for exactly CK3's reason: a lineage project that can be completed stops being a story.

**Mutation** is rare (base 0.8% per locus per birth), telegraphed, and *dramatised*: a novel allele triggers a birth event with a sound, a card, a chronicle line, and — if the colony has reached the Word era — the kin themselves notice and name it.

## 5.3 The twelfth locus: Sight
Most kin cannot see you. They see weather.

- **blind** (common, ~62%) — the hand is not perceptible. Warmth is warmth, tilt is an earthquake, the fog is fog.
- **dim** (~33%) — perceives *something*: reacts to the shadow of the hand approaching, becomes agitated before a tilt, sometimes looks up. Cannot read the fog board reliably.
- **true** (~5%, ceiling 45% inheritance even from two carriers) — **sees the hand.** Reads your symbols cleanly. Knows the difference between the glass and the sky. These are the prophets.

A `true` kin behaves differently: it looks up, it goes to where you last touched, it points, and it *teaches what it saw* — which is how your fog symbols get into the culture at all (§8.2). Other kin respond to a `true` according to the colony's belief state: revered in a faithful colony, driven out of a fearful one, ignored in a happy one that doesn't need explanations.

**You can breed for prophets. You can also breed them out.** A colony with no Sight is a colony that will never understand you, never build a temple, and never blame you either. That is a legitimate and quietly devastating way to play.

## 5.4 The genome UI — steal Niche verbatim
Twelve rows. Each row: a bright icon (the expressed allele) stacked over a dimmed icon (the carried one). No text, no percentages, no Punnett square. A player learns what "recessive" means in under a minute without the word being used.

The **only** numeric screen in the game is the optional lineage tree, colour-coded by whichever locus you have selected — pedigree charts are for breeders, Punnett squares are for exams.

---

# 6. THE MIND

## 6.1 Needs
Eight, decaying: warmth, water, food, rest, company, safety, purpose, wonder.

The last two are the ones that matter. **Purpose** is met by doing a thing you are good at, and it is the reason a kin will keep hauling stone in the rain. **Wonder** is met by seeing something new — a symbol in the fog, a mutation born, the lid opening, a place they've never been. **Wonder is the need your presence feeds.** A colony that never sees you is well-fed and flat.

The decisive borrow from The Sims: objects and places **advertise** what they offer, the kin multiplies each advertisement by a curve against its current need level, ranks them, and then picks randomly from the top three. That last randomisation is what keeps them from looking like robots, and it is also what leaves a job for the player.

## 6.2 Temper and belief split
Facets roll on a curve (DF's distribution: 78% land in a neutral band and are never printed). The Temper locus biases the roll. Only the tails get named on the portrait card.

Crucially — and this is Dwarf Fortress's best free idea — **what a kin believes and how a kin acts are separate layers and are allowed to contradict.** A kin can hold *the hand is good* as a value and still flinch every time the shadow falls. That contradiction is a story engine costing one extra field.

## 6.3 Needs derive from values
A kin who does not hold *wonder* as a value has no wonder need. A kin raised in a Hearth-era colony has a fire need that a Burrow-era kin does not. Needs as characterisation, not as chores — which also makes need-satisfaction diagnostic: *she's the one standing in the warm patch again.*

## 6.4 Memory
Every kin holds up to 24 memories. A memory is `{what, who, where, when, weight}` and it decays unless it is *reinforced by being retold* — which is how it becomes culture.

Memories the hand creates are heavy and slow to fade:
- **The Warm Place** — where the finger was, and whether it helped
- **The Tilt** — every kin above ground when the world moved
- **The Sky Shape** — a symbol seen, with whatever was happening at the time (§8)
- **The Hand Taken** — witnessing a kin lifted out. Never fades. Ever.
- **The Long Night** — a curtain left closed too long
- **The Opening** — the lid

**Memory must speak.** The Nemesis system's actual patent requires the system to *output an indication of the changed parameters* — a creature that remembers and never mentions it has no relationship with the player. So: kin retell memories to each other, retelling is visible as a small animation and a chronicle line, and a retold memory is how a private experience becomes a shared belief.

## 6.5 They are deliberately not smart
They are competent at surviving and bad at deciding. They over-winter in cold corners. They follow a charismatic idiot. They farm the patch nearest home rather than the good one. This is not a bug budget, it is Will Wright's finding applied on purpose: if autonomous agents solve their own problems, there is no gap between intent and outcome, and a story is exactly that gap.

## 6.6 The inspector
Click a kin: a card with its name, portrait silhouette, the twelve-locus genome strip, its named traits (deviations only), its current need stack **decomposed into itemised causes**, its memories, its lineage, and its relationships.

RimWorld's mood tab is the model: if the player can audit the number, they will argue with it, and arguing with a simulation is the beginning of caring about it.

---

# 7. THE WEAVE — how culture actually happens

This is FIRST OF US's thesis, moved from inside one skull to above a whole colony. Kyle already shipped and proved it; this is the same spine at a new scale, and that continuity is a feature.

**A discovery is not culture until another kin learns it and repeats it without the discoverer present.**

The state machine, per practice:

`latent → observed → attempted → invented → demonstrated → learned → tradition → institution`

- **invented** — one kin can do it. If it dies here, it dies with it. (The colony's private tragedy: a lineage that invented fire twice and lost it twice.)
- **demonstrated** — done with witnesses. Witness count and witness rank matter.
- **learned** — a second kin does it unaided.
- **tradition** — a third kin does it who never met the inventor. **This is the only one that persists across a generation.**
- **institution** — it has a place, a time and a symbol attached. Institutions grant passive colony effects and are what the Era ladder actually counts (§10).

Invention odds per attempt combine: observation × curiosity × practice × available material × pressure × witnesses − stress. **Failure teaches** — a failed attempt raises the next attempt's odds. Nothing is ever unlocked by the player, and there is no tech tree the player can see.

**Your leverage over all of this is indirect and total.** Pressure comes from hardship — which you supply. Material comes from what's in the jar — which you supply. Witnesses come from density — which your tilt and your warmth arrange. You never teach them a practice. You arrange the conditions under which they teach each other, and then you find out what they learned.

---

# 8. THE FOG — symbols, scripture, and the accident of meaning

The best idea in this document. It is cheap to build and there is nothing else like it.

## 8.1 Drawing
Fog the glass (§3.3), draw a stroke with the cursor. The stroke is resampled to 24 points, normalised, and stored in your **symbol set** (cap: 12; you can retire one to make room, and retiring a symbol that has become scripture is its own event).

While a symbol is showing, every kin with line of sight to the glass generates a **Sky Shape** memory — with, attached to it, *whatever was happening to that kin at that moment.*

## 8.2 Meaning accretes and you do not control it
A symbol has no meaning when you draw it. It acquires meaning from the weighted average of what happened while it was up, across every kin who saw it.

- Show the spiral during a famine that then broke → the spiral means **plenty**.
- Show the same spiral during a flood → the spiral means **drowning**.
- Show it during nothing at all, forty times → it means **nothing**, and becomes decoration, which is its own kind of true.
- Show it during two contradictory things → it becomes **contested**, and contested symbols are how schisms start (§9.4).

Meaning is stored as a vector over ~14 concepts (food, water, death, birth, heat, cold, safety, fear, hand, work, journey, together, alone, wrong). Once a symbol's dominant concept passes a confidence threshold it is **fixed** and no longer drifts — cultures do not renegotiate their alphabet lightly.

## 8.3 Where symbols end up
Once a symbol is fixed and a colony has reached the Word era, it leaves the glass and enters the world:
- scratched at burial sites
- painted on the burrow mouth
- carried on the tools of a trade
- **carved into the first temple** — the temple's face is your doodles
- worn as marks by whichever faction owns them after a schism

The player's flag, religion and alphabet are things they drew at two in the morning and forgot about.

## 8.4 Their language, and their name
Symbols are the writing system; the spoken language runs underneath it and is generated from a per-colony phonotactic seed. It drifts by era and splits at a schism. It is what generates:
- kin names (§4.4)
- place names — the pond, the high shelf, the burn scar, all named by them, after events
- **their name for themselves**, which you only ever learn if the colony reaches the Word era with at least one `true`-Sight kin alive to write it where you can read it
- **their name for you** (§9.2)

---

# 9. THE NAME THEY GIVE YOU

## 9.1 Belief is not a currency
Say it plainly, because every failed god game got this wrong: **belief does not power anything.** You cannot spend it. There is no meter. Your verbs cost nothing and are always available. Belief is purely a *model the kin hold about you*, and its only mechanical effects are on **their** behaviour.

## 9.2 The theonym
The colony's word for you is generated from their language and their dominant belief vector, and it changes as the record changes. It appears in the chronicle, on carvings, and in the mouths of `true`-Sight kin.

Examples of the shape (generated, not authored): *the Warm* · *the Weather* · *the Long Shadow* · *She Who Tilts* · *the One Above the Glass* · *the Watcher Who Does Not Help* · *the Two-Handed* (after a schism) · *Nothing* (a colony that concluded there is no hand — which is *earned*, by consistent absence, and which is the coldest ending in the game).

## 9.3 What they see
Sight-gated (§5.3), and every event they *can* perceive updates their model:

| Event | What it teaches them |
|---|---|
| Warmth in the cold | the hand is kind |
| Warmth that killed | the hand is dangerous *and* the hand is present |
| Tilt after a drought that then filled the pond | the hand answers |
| Tilt out of nowhere | the world is unsafe |
| A symbol shown during a good thing | the shape is a promise |
| **The Hand Taken** | this is the big one. Every witness holds it forever. A colony that has seen a kin lifted out of the world and returned changed *reorganises its entire theology around it.* Do it once and it is a miracle. Do it often and it is a predator. |
| Absence, for a long time | the hand has gone, or the hand was never there |

## 9.4 Schism
Track the variance of your actions' valence over a rolling window. When variance exceeds a threshold *and* the colony has at least two `true`-Sight kin with conflicting memory sets, the colony **invents a second god** — the kind one and the cruel one — and splits.

Mechanically: a belief tag, a ring colour on the lantern, divergent practice adoption, contested symbols, separate burial grounds, and a border between them that you can watch move across the jar. Not scripted. It just happens to inconsistent players, which is all of them.

Schisms can heal. Consistency heals them, slowly, over generations. So does a disaster that requires everyone.

## 9.5 The graves
They bury their dead. Always, from the Hearth era onward, in a place they choose and name.

Graves are permanent world objects. They accumulate. A well-tended colony's burial ground grows slowly and is decorated. A tormented colony's burial ground is the biggest structure in the jar, and it is the first thing you see when you look at your own windowsill from across the room.

**That is the scoreboard. That's the whole thing. Nobody ever tells you.**

---

# 10. THE ERAS

Not a tech tree. A count of institutions (§7) with a name attached. Eras cannot be rushed by the player and there is no button.

| Era | Reached when | What changes |
|---|---|---|
| **Burrow** | start | dig, carry, huddle. Warmth is survival. No burial. |
| **Hearth** | 3 institutions incl. fire *or* huddle-rite | burial begins, night stops being lethal, the first place gets a name |
| **Field** | 6 institutions incl. one cultivation | food stops being foraged, population climbs steeply, and the first *surplus* appears — which is where hierarchy, hoarding and the `cruel` temper start to matter |
| **Kiln** | 9, incl. a `lick`-Gut lineage + sustained heat | they can fire clay and smelt. **They can now make things that outlive them,** which changes memory into record |
| **Word** | 12, incl. a fixed symbol carved | your symbols become their writing. Names, places, the theonym, and the first thing they write that you can read |
| **Wheel** | 16 | mechanism. They begin to *move the world themselves* — small dams, levers, a way to hold a hillside against a tilt. **The first era where they can resist you.** |
| **Glass** | 20, incl. Kiln + sand + a `true`-Sight lineage | they make glass, they look through it, and they understand where they are |

## 10.4 The Glass Era, and the lid
When they reach Glass, they know. There is a period — a generation or two — where the colony is quiet and the chronicle is very short, and then they decide something, and what they decide is read off the whole record: the theonym, the schism state, the graves, the traditions, the symbols and what they mean.

Possible shapes (each generated, none announced in advance): they build a **shrine to the lid** and wait. They build a **way to reach it**. They stop building entirely. They **write you a message** on the floor of the jar in symbols you taught them, and the message is assembled from their own history, not from a script. They split, and half of them try the lid.

**And then you decide whether to open it.** There is no correct answer, no score, and no ending screen. The colony continues either way. That is the last thing this game does and it should be the only authored beat in it.

*Note for the build: this is M12 and it is the single easiest thing in the document to get wrong by over-writing it. The Glass Era needs the fewest words in the game, not the most.*

---

# 11. THE JAR

## 11.1 The vessel
One glass container on a wooden sill. ~140mm across, ~180mm tall, with a lid that isn't quite airtight. Camera orbits it, dollies in to a few millimetres, and can go *inside* down at kin level for one purpose only: looking. There is no first-person play.

**One diorama. That is the entire world budget of this game,** and it is why a flagship-scale simulation is affordable in a browser.

## 11.2 The ground
A 96×96 heightfield, ~1.5mm per cell. Layers: stone, clay, soil, sand, water table, moss/growth, snow. Tilt moves loose material and water; heat moves the thermal field; rain moves the water table.

Landmarks are emergent and get named by the kin: the shelf, the crack, the low end, the sun side, the burn.

## 11.3 What else lives in there
- **Seven food species**, each with its own temperature/humidity/light band. Three heat-gated, two rain-gated, one that only fruits after a fire, one that is mildly toxic and delicious.
- **The mould.** A slow antagonist that thrives in exactly the warm-wet conditions a generous player creates. Kindness has a disease.
- **Springtails.** Harmless, ambient, and the kin domesticate them eventually if they get to Field.
- **Whatever you drop in.** A dead fly is a month of protein and a religious event.

## 11.4 The sill, the room, the year
The jar sits in the real world and the real world gets in. The window is cold in January and blazing in July. The room's temperature and the day's length are on a **real-calendar cycle** (seeded from the player's clock, same trick as NIGHT CRAWLERS' wet nights and the seasonal doorway doctrine).

You cannot fully insulate the jar. Winter is coming to their world whether you like it or not, and holding a colony through a January on a cold sill with a finger and a curtain is one of the game's best sustained tests.

## 11.5 A second species
Late unlock, earned not bought: another jar's worth of kin can be introduced through the lid. Outcrossing fixes the Marrow homozygosity problem (§5.1), brings foreign traditions the way Tala does in FIRST OF US, and starts either a merger or a war. It is the single biggest thing you can do to a colony and it should be available exactly once per lineage.

---

# 12. THE CHRONICLE — the sifter and THE PAGE

**Build this in M6, before adding any more simulation.** The Tale-Spin effect is real: a rich sim with a thin output reads as a *shallow* sim. Depth without surfacing is worse than no depth.

## 12.1 The event stream
Every sim-significant occurrence writes an immutable fact `{t, type, actors[], place, tags[]}` to a ring buffer. Cheap, typed, ~40 bytes.

## 12.2 The sifter
A set of parameterised patterns over that stream — *a kin who witnessed the Hand Taken later becoming the one who carves the symbol for it*; *a lineage that invented the same practice three times and lost it three times*; *the last carrier of an allele dying alone*; *a `cruel`-temper kin doing the thing that saved everyone*.

Matches are ranked by **statistical improbability against running counters**, not by hand-tuned weights. Kreminski's result: sorting by rarity surfaces more interesting microstories than any importance heuristic a designer will write.

## 12.3 THE PAGE
Once per era (and on demand), the sifter's best 3–7 matches are composed into **one page of their book**: their script, their symbols, their names, a hand-drawn map fragment of where it happened, and a portrait or two.

Hard constraints, from the retellings research:
- **Maximum three reversals.** Four reads as incoherent.
- One line, one clause, past tense, named subject.
- Emotion always carries a circumstance and a recency: *"she was afraid for a long time after the sky opened."*
- The same voice for live events and archived history, so the present reads as history in progress.

**THE PAGE exports as a 9:16 PNG with one keypress.** That is the launch feature that makes this game shareable, and it is the answer to the market finding that systems games underperform in short-form video. RimWorld's moat is that the game supplies the proper noun. Ours has to as well.

## 12.4 The Book
All pages, bound, in order, forever. Plus the graves list, the lineage tree, the symbol lexicon with what each one came to mean, and the running list of every name they have ever had for you.

---

# 13. TIME — and what happens while you're gone

## 13.1 Watched time
Fixed 15 Hz accumulator, render interpolates. 1 in-game day = 1350 ticks = 90 real seconds at 1×. Speeds: 1× · 4× · 20×, and pause. No faster — the whole point is that you cannot outrun a generation.

## 13.2 Absence
The house doctrine is that absence is a retention mechanic (NIGHT CRAWLERS' jar, ADMIRAL DUCK's voyages — *"the only game that rewards not playing"*). Here it is load-bearing.

On load, `elapsed = min(now − lastSave, 24h)`. Resources resolve closed-form; life events (births, deaths, invention rolls, weather) resolve in **coarse batched ticks at 1 tick = 1 in-game hour**, capped at 2,000 iterations so a six-month-old save cannot hang the tab.

**And then the sifter runs on the gap and writes a page.** *"While you were away: the pond went down. Nine were born. Ott, who remembered the tilt, died in the cold end and they buried her on the shelf with the others. Somebody drew your spiral on the burrow mouth."*

That page is the ant-farm time-lapse in text, and it is the reason the player opens the tab tomorrow.

**No energy meters. No timers gating fun. No push notifications. No ad-doubling.** We have no monetisation pressure, so we buy goodwill with the offline design instead — the idle-design literature is clear that the auteur idlers deliberately designed *for* disengagement, and it's the right call.

## 13.3 Anti-cheat
`elapsed = min(now − lastSave, CAP)`; if `now < lastSave`, treat as zero. That's the whole policy. Clock-setting is unwinnable client-side and irrelevant in a premium single-player game.

---

# 14. FAILURE, CRUELTY, AND FORGIVENESS

There is no fail state, no lose screen and no game over. There is only the record. But a colony can absolutely be destroyed, and it can be destroyed by you.

## 14.1 The rules cruelty runs on
Assembled from the cases (Lemmings, Dungeon Keeper, The Sims, WorldBox, Black & White's cut human creature) and non-negotiable:

1. **Abstraction buys the permission.** They are 4mm glowing beans. B&W could not ship a human creature to slap, and cut it for exactly that reason. Our fidelity ceiling is deliberate and permanent.
2. **The cruel verb is the kind verb.** Warmth comforts and warmth kills. Tilt waters and tilt drowns. There is no evil button, because a dedicated evil button is what made B&W2's army layer feel bolted on.
3. **The game laughs first, in the fiction.** Kin windmill when they slide. They pile up. They get up and dust themselves off and glare at the sky. Comedy in the world, never in the UI.
4. **Consequence, never judgement.** Molyneux, correctly, for once: *"I don't want to be your judge, but I want there to be consequences."*
5. **The forgiveness channel must exist.** Every punishment needs a matching path back. A tormented colony *can* be won back — slowly, over generations, by consistency — and doing it is the best story this game can produce. A cruelty system with no road back turns play into commitment.
6. **Cruelty is never optimal.** The moment torment is the efficient strategy, transgression becomes homework. Cruel play must be *interesting* and never *correct*.
7. **The sim supplies the provocation.** Reus's greed→war is the model: a colony you have been generous to gets fat, hoards, and starts pushing its own weak around, and *then* you have a reason. Provoked cruelty is drama; unprovoked cruelty is just gross.

## 14.2 Extinction
If the last kin dies, the jar stays. The graves stay. The carvings stay. The chronicle closes with a final page and the theonym they died holding.

The jar can be reseeded from the lid — with new kin who will find the ruins of the last civilisation and have absolutely no idea what any of it means, and who will build a religion out of *that*. The Book keeps both.

---

# 15. ART AND AUDIO

## 15.1 The look: backlit
The jar is lit from behind by the window. Everything inside is silhouette plus glow. This is the cheapest possible way to look expensive, it makes 400 instanced creatures read perfectly at 3mm, and it means no character art, no textures on the kin, and no lighting rig.

- **Palette:** two per season, drawn from the window — winter is bone-white and blue shadow; July is amber and hot green. Interior colour comes almost entirely from the lanterns.
- **The light shaft:** volumetric-ish god ray through the glass with drifting dust motes. One quad, one noise texture, does 40% of the mood.
- **Condensation** on the glass, procedural, responding to §3.3.
- **Depth of field** on the near glass so the vessel reads as an *object in a room*, not a level.

## 15.2 The kin
One low-poly base mesh with body-part IDs baked into a vertex attribute. **All variation is per-instance attributes read in the vertex shader** — body scale x/y/z, limb length and count mask, head size, lantern hue/intensity/pulse phase, gait phase and speed, pattern index. One geometry, one draw call, unlimited apparent species.

**No SkinnedMesh in the field view, ever.** Animation is vertex-shader gait, squash and lantern pulse — zero CPU. A real rigged model exists only for the single close-up inspector card.

## 15.3 The fingerprints
Every time you touch the glass, a smudge stays. They accumulate. They never wipe. Months in, the outside of the jar is a fogged mess of your own attention, and the places you touched most are the places you cared about most, and you can see it.

This is the alignment display. It is one accumulation texture. It costs nothing and it is the best thing in the art direction.

## 15.4 Audio
All WebAudio synthesis, zero samples.

- **The room** is the bed: a refrigerator hum two rooms away, a radiator, rain on the window, birds outside in spring. The jar is *quiet* and the room is what you actually hear.
- **The kin** have procedural voices seeded from the Voice locus — clicks, a hum, a two-tone call. A colony at rest is a texture; a colony alarmed is a chord.
- **The lantern hum:** the colony's aggregate wellbeing is a sustained drone whose consonance tracks the mood. **You will learn to hear a sick colony before you look at it.** This is the audio equivalent of HOME BREW's banjo that grows up with you — same idea, opposite direction.
- **Glass:** every touch has a real glass response. The tap you should not do (the doorway hint) is a hard, ugly, wrong sound and the whole colony pulses at 2.5 Hz.

---

# 16. TECH ARCHITECTURE

## 16.1 Files
```
sim.js          ← the ENTIRE deterministic simulation. No THREE. No DOM. Node-testable.
genome.js       ← the twelve loci, inheritance, dominance ladders
mind.js         ← needs, advertisements, memory, retelling
weave.js        ← the practice state machine, invention/teaching rolls
fog.js          ← symbol capture, meaning accretion, lexicon
chronicle.js    ← event ring buffer + the sifter + page composition
world.js        ← heightfield, thermal field, water, growth, tilt physics
lang.js         ← phonotactics, names, places, the theonym
index.html      ← view + input only. Imports sim.js and three.
view/           ← render.js, kin.js (instancing + shaders), glass.js, ui.js, sfx.js, post.js
data.js         ← ALL tuning and content. Balance changes touch one file.
test-sim.mjs    ← headless battery. `node test-sim.mjs`
serve.mjs       ← `node serve.mjs 8460`
lib/three.module.js  ← vendored, no CDN
```

**The sim/view split is non-negotiable.** It is what makes headless soaks, determinism tests and long-run evolution experiments possible, exactly as `game.js` + `__ttSoak` do in Age of Toys and `sim.js` + `test-sim.mjs` do in QUARRY.

## 16.2 Data layout
Structure-of-arrays typed arrays for all agent state, preallocated, zero per-tick allocation. `Float64Array` not `Float32Array` (measured ~5% faster in JS). This is worth ~24× over an object-array design *and* removes the GC frame spikes that make a simulation feel cheap.

Budget: **400 kin at 15 Hz sim / 60 fps render on a 2020 laptop.** Comfortable headroom; the design's population target is 40–250.

Spatial hash rebuilt each tick into flat bucket arrays (cell = 2× interaction radius). **Not** a quadtree — cache locality beats asymptotics at this scale by ~8×.

Navigation: flow fields per attractor type (~0.3ms per 50×50 field), regenerated only on terrain change. A* only for a picked-up kin returning home.

## 16.3 Determinism
- `mulberry32`, seeded per subsystem — **separate streams for sim, weather, cosmetics, and view.** A view-only feature must never be able to desync a lineage.
- **Never `Math.random` in sim code.** Lint it.
- **No `Math.sin/cos/pow/exp` in sim code** — not spec-pinned across engines and they have changed between browser versions. Ship a table-based `sin/cos/atan2` in `lib/`.
- The RNG discards its first six draws (inherited from Age of Toys: ⚠️⚠️ the LCG's first draw is not random). Keep every hash unsigned the whole way (`>>> 0`).

## 16.4 Persistence
- **IndexedDB** for the colony: typed-array blobs + a JSON header, gzipped via the Compression Streams API. 250 kin ≈ 20 KB raw. Three rolling autosaves plus one manual.
- **localStorage** for metadata only — `theglass-save` carrying `{ started, era, generations, named, symbols, theonym, deaths, pagesWritten }` for the house hub to read (§21).
- **`navigator.storage.persist()` on first meaningful action.** Safari evicts any origin untouched for 7 days, and eviction takes *all* of an origin's storage at once. A player who checks their jar monthly will lose everything without this call. This is a correctness requirement, not a nicety.
- **File export/import** of the whole colony as user-owned backup. Browser storage is not a promise we can make.
- **A ~44-character genome share code** for a single kin: 32 bytes of genome → base64. Tweetable.

## 16.5 Debug rig
One global, `window.__G`: `step`, `run(days)`, `soak(seeds, days)`, `fingerprint()`, `page()`, `spawn`, `kill`, `warm(x,y,ms)`, `tilt(deg)`, `draw(points)`, `lid`, `era`, `shot(name,w,h,port)`.

URL params: `?seed=N`, `?days=N` (fast-forward a fresh jar), `?era=word`, `?post=0`, `?newgame`.

---

# 17. INVARIANTS (non-negotiable)

1. **Determinism.** All sim uses the seeded RNG. Never `Math.random`, never `Math.sin/cos/pow` in sim code. View-only systems may use whatever they like.
2. **Sim vs view.** Shaders, animation, condensation and grain never run headless. `node test-sim.mjs` must always pass with no browser.
3. **Everything round-trips.** New persistent state ships with a save→JSON→restore→compare test *in the same session it is written*.
4. **Soak before ship.** Every era gets a headless battery: 8 seeds × 5,000 in-game days, zero errors, no NaN, nothing outside the jar, population never negative, no lineage immortal.
5. **No new verbs.** Five, forever (§3).
6. **No morality bar.** Not in the HUD, not in a tooltip, not in an achievement name.
7. **The lantern is the UI.** The game must be fully playable with every panel closed.
8. **Toys don't bleed.** House rule. Death here is a light going out and a burial, and it is never gory. Nothing ships Kyle wouldn't sign.

---

# 18. FAILURE MODES TO DESIGN AROUND

| Failure | Source | Our answer |
|---|---|---|
| God verb demoted to a support action | Populous: The Beginning, Godus, Masters of Albion | P1 + Invariant 5. The audit question is in §2. |
| A currency between player and world | B&W2 Tribute, Godus Belief, Godus gems | §9.1. Belief exists and cannot be spent. Verbs are free and always available. |
| Indirect control makes every AI bug a wall | From Dust | §3.4, the lid. One direct override, expensive, never optimal. |
| Simulation reads as a random number generator | SimEarth | §4.2 lantern + §6.6 auditable inspector + §12 chronicle. |
| Village management becomes the tax on the good part | Black & White | There is no management layer at all. The player never assigns a job, places a building, or opens a queue. |
| Five games at once | Spore | One scale. One jar. One camera. Eras change *practices*, never the genre. |
| Deep sim, thin output → reads as shallow | Tale-Spin effect | §12 is an M6 deliverable, not a stretch goal. |
| Genome correct, creatures charmless | Niche | §4.4 names, §6.4 memory, §15.2 lantern bloodlines, §5.3 prophets. Correctness is not charisma. |
| The tail is short because the sandbox is solvable | Reus 2: 90% positive, 19 concurrents at 27 months | The 80% inheritance ceiling, the real-calendar year, and a chronicle that is different every time. Nothing here can be completed. |
| Cruelty reads as gross rather than playful | B&W's cut human creature | §14.1, all seven rules. |
| Six-month-old colony silently deleted | Safari 7-day eviction | §16.4. `persist()` on first action + file export. |
| Scope creep (our house disease) | FRESH CUT §15 | Pillars and the locked table are contractual. Every addition must name the pillar it serves. |

---

# 19. BUILD ORDER

Each milestone carries an acceptance test. **Failing it means not proceeding.** ~22–28 sessions total, comparable to QUARRY.

**M1 — THE JAR.** Heightfield in a glass vessel, orbit camera, 40 kin walking with lanterns lit, WARM implemented with real thermal diffusion.
*Accept: a stranger watches it for two minutes with no score, no goals and no genetics, and touches the glass unprompted.* ⚠️ This is a judgement and it needs Kyle at the keyboard, not a test suite.

**M2 — THE LIFE.** Needs, advertisements, eat/drink/rest/huddle, life stages, breeding, death, burial. `test-sim.mjs` from day one.
*Accept: a colony seeded with 12 kin survives 200 in-game days unattended and its population curve is neither a flatline nor a spike.*

**M3 — THE BLOOD.** All twelve loci, dominance ladders, the two-slot genome widget, the lineage tree, Marrow homozygosity.
*Accept: a 40-generation headless run shows real allele frequency drift, and an inbred lineage visibly dies of it.*

**M4 — THE HAND.** Tilt physics, breathe/rain, the lid, the light. All five verbs feeling right.
*Accept: each verb is blind-identifiable by feel alone, and each has produced both a save and a massacre in the same play session.*

**M5 — THE MIND.** Memory, retelling, temper facets, the values/facets contradiction, the inspector.
*Accept: click any kin and the card explains, in causes, why it is doing what it is doing right now.*

**M6 — THE CHRONICLE.** Event stream, sifter, rarity ranking, THE PAGE, the 9:16 export.
*Accept: three pages generated from three different 500-day runs are recognisably different stories, and a non-player can read one and describe what happened.* **Do not proceed past M6 without this.**

**M7 — THE WEAVE.** The practice state machine, invention, teaching, tradition, institution, the era ladder to Field.
*Accept: a practice is invented, lost with its inventor, reinvented, and becomes a tradition — all in one unattended run, and all four beats appear on the page.*

**M8 — THE FOG.** Symbol capture, Sky Shape memories, meaning accretion, the lexicon, symbols entering the world.
*Accept: the same symbol shown in two different runs acquires two different meanings, and both are legible in the lexicon and visible carved somewhere.*

**M9 — THE NAME.** Language generation, kin/place names, belief modelling, the theonym, schism.
*Accept: an inconsistent 800-day run schisms without being told to, and the two factions are visually distinguishable at a glance from the field view.*

**M10 — THE YEAR.** Real-calendar seasons, the sill, the room, winter as a genuine test, absence and the offline page.
*Accept: close the tab for a real day; the returning page tells a story the player did not see, and it is worth reading.*

**M11 — THE LATE ERAS.** Kiln, Word, Wheel. The Wheel-era ability to resist a tilt. The second species.
*Accept: a colony successfully dams a flood you caused, and the chronicle notices that they did it themselves.*

**M12 — THE GLASS.** The final era, the understanding, the message on the floor, the lid decision.
*Accept: it lands without a cutscene, without a score, and without the game telling the player what they were.* ⚠️ The strongest temptation in this entire project is to write more here. Write less.

**M13 — SHIP.** House contract (§21), a11y pass, `prefers-reduced-motion`, persistent mute, touch, README, repo, deploy.

---

# 20. RISKS & THE CUT ORDER

| Risk | Severity | Mitigation |
|---|---|---|
| M1 fails — a jar of beans just isn't pleasant | 🔴 fatal | Find out in one session. That is why M1 is first and has nothing else in it. |
| The fog/meaning system is too abstract to read | 🟠 | The lexicon page shows each symbol and what it came to mean, in plain language. If a tester can't explain their own alphabet, cut accretion to a simpler good/bad valence. |
| Emergence produces mush, not stories | 🟠 | M6's acceptance test is exactly this, and it gates everything after it. |
| Performance dies at 250 kin with culture running | 🟡 | SoA from day one; culture updates on a 1 Hz slow lane, not the 15 Hz tick. |
| Player never feels agency because everything is indirect | 🟡 | The lid (§3.4) and warmth's immediate local effect. Measure: can a tester reliably cause a specific thing within 60 seconds of deciding to? |
| Scope creep | 🟠 | The five verbs. The one jar. The locked table. |

**If scope bites, cut in this order:** the second species → the Wheel era → schism healing → the mirror/coloured-glass lid items → the Glass era shipped as a quieter "they know" state with the message deferred to a patch.

**Never cut:** the lantern, the fog board, the graves, the chronicle page, the fingerprints on the glass. **Those five ARE the game.**

---

# 21. THE HOUSE CONTRACT

- **Doorway:** the terrarium on the bedroom windowsill. *(QUARRY takes the same window's star view — one window, two directions, and the attic window still belongs to TELESCOPE.)*
- **Hint (lowercase, deadpan, warm):** `"the windowsill — don't tap the glass. they can hear you."`
- **Save key:** `theglass-save` — `{ started: true, era, generations, named, deaths, symbols, theonym, pagesWritten }`. The colony itself lives in IndexedDB; this is the hub's readable summary. Never rename a field after ship.
- **Collectible:** **a shard of glass with one fingerprint on it.** Earned when a colony reaches the **Word** era with at least one `true`-Sight kin alive — i.e. when they can finally write something you can read.
- **Cross-game lore (load-bearing, not decoration):**
  - **FRESH CUT** — Odd Job H, The Terrarium, is this game from the inside. Reading `fc-save` for Terrarium completion should change the *first* thing you see: a mowed line already cut into the moss.
  - **QUARRY** — the same window. On nights the window shows space, the jar's sky is the hunt's sky.
  - **NIGHT CRAWLERS** — the jar precedent. If `crawlers-save` shows a full jar, one springtail species in the terrarium is one the kid caught.
  - **GLOW STARS** — a colony that reaches Word names constellations of their own, from the lantern lights of their dead. The ceiling upstairs is doing the same thing.
- **A DBD credit** on the title screen: `a DIRTY BOY DEVS game`, and a small "the house" link back to the hub.
- **Catalog housekeeping:** add to `CATALOG.md` (kid's bedroom, line F), write `game-briefs/bedroom.md` entry with `status:`, repo `kylefriesmarketing/the-glass` on day one.

---

# 22. OPEN QUESTIONS — Kyle's redline

1. **The title.** THE GLASS is the working title and it's good. Shortlist at §23 — pick or veto.
2. **Roadmap slot.** This is a 22–28 session flagship and the December grand opening is 106 days out. Recommendation: **write and prototype M1–M2 now, then park it until January.** It competes with nothing at launch and it is the strongest 2027 flagship on the board. Your call.
3. **Steam.** Standalone, or a 99¢ doorway in THE HOUSE, or both? The market data says a game like this prices at **$14.99–$19.99** standalone (WorldBox at $19.99 is the exact comp) — the doorway can still exist and read the same save.
4. **The kid.** Does the fiction ever show whose windowsill this is? Recommendation: no — the room is present in the audio and never in the frame.
5. **Second species (§11.5) — in v1 or a patch?** It's the biggest single feature in the doc and the easiest to defer.
6. **How dark is the dark end?** The design permits genuine atrocity at 4mm scale. §14.1 rules keep it inside the house style, but you should look at a deliberately-tormented colony at M9 and tell me whether it's still a Dirty Boy Devs game.
7. **Co-op?** Two hands on one jar is either the funniest thing in the catalog or a nightmare. Architecture-ready, not shipped, unless you want it.

---

# 23. TITLE SHORTLIST

**THE GLASS** *(working — the vessel, the ending, and the thing between you and them)* · **SMALL MERCIES** · **THE SILL** · **WARM SIDE** · **THE LID** · **KINDLY** · **MOTE** · **DON'T TAP THE GLASS** *(the doorway hint as the title — long, and might be the best one)*

---

# 24. SOURCES

**God games & the genre's collapse** — [Lionhead's B&W postmortem](https://www.gamedeveloper.com/design/postmortem-lionhead-studios-i-black-white-i-) · [B&W creature AI (Wexler, PDF)](https://www.cs.rochester.edu/~brown/242/assts/termprojs/games.pdf) · [PC Gamer: Reinstall Black & White](https://www.pcgamer.com/reinstall-black-white/) · [Black & White 2](https://en.wikipedia.org/wiki/Black_%26_White_2) · [Populous](https://en.wikipedia.org/wiki/Populous_(video_game)) · [HG101: Populous: The Beginning](http://www.hardcoregaming101.net/populous-the-beginning/) · [Molyneux regrets the Godus Kickstarter](https://www.pcgamesn.com/godus/peter-molyneux-regrets-godus-kickstarter-this-urge-to-over-promise-is-incredibly-destructive) · [Kotaku: why Godus is a disaster](https://kotaku.com/why-peter-molyneuxs-godus-is-such-a-disaster-1685539932) · [Soren Johnson: Spore, My View of the Elephant](https://www.gamedeveloper.com/design/spore-my-view-of-the-elephant) · [GameCritics: From Dust](https://gamecritics.com/brad-gallaway/from-dust-review/) · [Reus / Reus 2](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Reus) · [God Games: Impostors in the Pantheon](https://www.gamedeveloper.com/design/god-games-impostors-in-the-pantheon) · [PC Gamer: nobody cares about god games anymore](https://www.pcgamer.com/games/sim/peter-molyneuxs-right-about-one-thing-its-sad-how-no-one-seems-to-care-about-god-games-anymore/) · [TheGamer: Masters of Albion mixed reviews](https://www.thegamer.com/masters-of-albion-early-access-mixed-reviews/) · [SimEarth](https://www.manospondylus.com/2021/11/simearth-ultimate-god-game.html) · [Doshin the Giant](https://en.wikipedia.org/wiki/Doshin_the_Giant)

**A-life, genetics, attachment** — [The AI of Creatures (Zucconi)](https://www.alanzucconi.com/2020/07/27/the-ai-of-creatures/) · [Creatures Genetics Kit manual (PDF)](https://cdn.akamai.steamstatic.com/steam/apps/1838430/manuals/Genetics_Kit_Manual.pdf) · [Jenn Frank: Playing God — On Death, Motherhood and Creatures](https://unwinnable.com/2012/01/27/playing-god-on-death-motherhood-and-creatures/) · [Norn torture](https://creatures.fandom.com/wiki/Norn_torture) · [Niche: Genes](https://niche.fandom.com/wiki/Genes) · [CK3 genetic traits](https://www.thegamer.com/crusader-kings-3-genetic-traits-guide/) · [Massive Chalice's bloodline system](https://www.gamedeveloper.com/design/multigenerational-mayhem-exploring-i-massive-chalice-i-s-bloodline-system) · [Rogue Legacy traits](https://roguelegacy.wiki.gg/wiki/Traits) · [Why we get attached to XCOM soldiers](https://www.gamedeveloper.com/design/why-do-we-get-so-attached-to-our-soldiers-in-xcom-) · [Permadeath appreciation, grief & mortality salience (n=394)](https://intellectdiscover.com/content/journals/10.1386/jgvw_00057_1) · [Kate Compton: ten thousand bowls of oatmeal](https://procedural-generation.tumblr.com/post/139979646183/so-you-want-to-build-a-generator)

**Emergent society & story sifting** — [DF personality facets](https://dwarffortresswiki.org/index.php/DF2014:Personality_facet) · [DF needs](https://dwarffortresswiki.org/index.php/DF2014:Need) · [DF emotion](https://dwarffortresswiki.org/index.php/DF2014:Emotion) · [DF strange moods](https://dwarffortresswiki.org/index.php/DF2014:Strange_mood) · [Tarn Adams interview](https://www.gamedeveloper.com/design/interview-the-making-of-dwarf-fortress) · [Aaron Reed on Dwarf Fortress](https://if50.substack.com/p/2006-dwarf-fortress) · [RimWorld storytellers](https://rimworldwiki.com/wiki/AI_Storytellers) · [RimWorld raid points](https://rimworldwiki.com/wiki/Raid_points) · [RimWorld mental breaks](https://rimworldwiki.com/wiki/Mental_break) · [GMTK: the genius AI behind The Sims](https://gmtk.substack.com/p/the-genius-ai-behind-the-sims) · [Will Wright: the original Sims AI was too good](https://www.pcgamer.com/games/the-sims/will-wright-says-the-original-sims-ai-was-actually-too-good-almost-anything-the-player-did-was-worse-than-the-sims-running-on-autopilot/) · [PC Gamer: torturing the Sims](https://www.pcgamer.com/torturing-the-sims/) · [Nemesis system design](https://www.gamedeveloper.com/design/designing-i-shadow-of-mordor-i-s-nemesis-system) · [Caves of Qud: mythic biographies (PDF)](https://www.freeholdgames.com/papers/Generation_of_mythic_biographies_in_Cavesofqud.pdf) · [James Ryan: Curating Simulated Storyworlds (PDF)](https://escholarship.org/content/qt1340j5h2/qt1340j5h2.pdf) · [Open Design Challenges for Interactive Emergent Narrative (PDF)](https://eis.ucsc.edu/papers/ryanEtAl_OpenDesignChallengesForInteractiveEmergentNarrative.pdf) · [Kreminski: Felt (PDF)](https://mkremins.github.io/publications/Felt_SimpleStorySifter.pdf) · [Select the Unexpected](https://link.springer.com/chapter/10.1007/978-3-031-22298-6_18) · [Evaluating AI-based games through retellings](https://www.researchgate.net/publication/337325308_Evaluating_AI-Based_Games_through_Retellings)

**Market & tech** — [Steam colony sim tag data](https://games-stats.com/steam/?tag=colony-sim) · [god game tag](https://games-stats.com/steam/?tag=god-game) · [creature collector tag](https://games-stats.com/steam/?tag=creature-collector) · [WorldBox](https://games-stats.com/steam/game/worldbox-god-simulator/) · [PC Gamer: the cozy game boom](https://www.pcgamer.com/games/life-sim/the-cozy-game-boom-is-the-clearest-trend-on-steam-over-five-years-of-data/) · [The rise of anti-cozy games](https://buttondown.com/oldweb-blog/archive/the-rise-of-anti-cozy-games/) · [GameDiscoverCo on short-form discovery](https://newsletter.gamediscover.co/p/everything-you-want-to-know-about) · ["It Started as a Joke": on the design of idle games (PDF)](https://par.nsf.gov/servlets/purl/10174274) · [ECS vs OOP JS benchmark, 2026](https://www.dmurph.com/posts/2026/06/ecs_vs_oop_benchmark/ecs_vs_oop_benchmark.html) · [three.js: one draw call, massive crowd](https://discourse.threejs.org/t/one-draw-call-massive-crowd-performance-engineering-in-three-js/89928) · [three.js skinned mesh limits](https://discourse.threejs.org/t/optimization-of-large-amounts-100-1000-of-skinned-meshes-cpu-bottlenecks/58196) · [Codrops: three.js instancing](https://tympanus.net/codrops/2025/07/10/three-js-instances-rendering-multiple-objects-simultaneously/) · [Gaffer: fix your timestep](https://gafferongames.com/post/fix_your_timestep/) · [Gaffer: floating point determinism](https://gafferongames.com/post/floating_point_determinism/) · [mulberry32](https://www.4rknova.com/blog/2026/03/01/mulberry32-rng) · [MDN storage quotas & eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) · [jdxdev: flow fields](https://www.jdxdev.com/blog/2020/05/03/flowfields/)

---

*Dirty Boy Devs. Nothing is built yet and everything above is negotiable except the pillars — and the five verbs, which are the reason this is not Godus.*
