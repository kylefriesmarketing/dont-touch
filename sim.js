// DON'T TOUCH — sim.js
// The ENTIRE deterministic simulation. No THREE. No DOM. Node-testable.
// Invariants (bible §17): seeded RNG only, no Math.random, no Math.sin/cos/pow in sim code.

// ---------------------------------------------------------------------------
// 0. RNG — mulberry32, per-subsystem streams, first six draws discarded.
// ---------------------------------------------------------------------------
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function makeRNG(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) >>> 0;
  const f = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // ⚠️⚠️ THE LCG'S FIRST DRAW IS NOT RANDOM — inherited from Age of Toys.
  for (let i = 0; i < 6; i++) f();
  // ⚠️ State must round-trip or a restored colony silently diverges (Invariant 3).
  f.getState = () => a >>> 0;
  f.setState = (v) => { a = v >>> 0; };
  return f;
}
const ri = (rng, n) => (rng() * n) | 0;
const rr = (rng, a, b) => a + rng() * (b - a);
const pick = (rng, arr) => arr[(rng() * arr.length) | 0];

// Table trig — Math.sin/cos are not spec-pinned across engines (bible §16.3).
const TRIG_N = 1024;
const SIN_T = new Float64Array(TRIG_N + 1);
{ for (let i = 0; i <= TRIG_N; i++) SIN_T[i] = Math.sin((i / TRIG_N) * Math.PI * 2); }
export function tsin(t) { // t in turns (0..1)
  let u = t - Math.floor(t); const f = u * TRIG_N; const i = f | 0; const k = f - i;
  return SIN_T[i] * (1 - k) + SIN_T[i + 1] * k;
}
export const tcos = (t) => tsin(t + 0.25);

// ---------------------------------------------------------------------------
// 1. CONSTANTS — all tuning lives here (bible §16.1: data changes touch one file)
// ---------------------------------------------------------------------------
export const C = {
  N: 96,                 // heightfield resolution
  // ⚠️⚠️ TICK_HZ IS THE ONLY REAL-TIME KNOB IN THE WHOLE PROJECT, and it is
  // used in exactly ONE place: the frame accumulator in main.js. Raising it
  // replays the IDENTICAL tick sequence faster in wall-clock — the simulation,
  // every save, every fingerprint and the whole harness are untouched, because
  // nothing in sim.js reads it.
  //
  // It sat at 15 (a 60-second day) and that was the single biggest reason the
  // game read as a museum diorama rather than something you play: a kin crossed
  // the board in 78 seconds, the first hut landed 20-51 REAL MINUTES in, and a
  // player watching for five minutes saw nothing happen at all. At 45 a day is
  // 20 seconds, a kin crosses in 26, and the first hut is 7-17 minutes at 1x —
  // or under four at 4x. Same world, same seed, same story; you can just SEE it.
  TICK_HZ: 45,
  TICKS_PER_DAY: 900,    // 20 real seconds per in-game day at 1x
  // ⚠️ headroom over the observed peak, not a tuning number. The grid battery
  // measured peaks to 318 at N=96; at CAP the spawn simply fails and breeding
  // stops dead, which reads as a bug rather than a limit. Costs one array slot.
  CAP: 640,              // max kin

  // The basement, degrees. ⚠️ A TRUE CONSTANT — never assign to it. The room's
  // real temperature follows the calendar and lives on the Sim instance as
  // `ambientBase`; main.js used to write the season into this shared object,
  // which meant the same seed generated a different world in January than in
  // July. Worldgen fills from this fixed value so a seed is a world, forever.
  AMBIENT_BASE: 19.0,
  SUN_GAIN: 9.0,         // full curtain-open sun adds this at the sunward side
  HAND_HEAT: 150.0,      // the finger's own heat, before the glass takes its cut
  HAND_K: 0.010,         // how fast the glass accepts it — this is the 4-8s lag (§3.1)
  HAND_RADIUS: 8.5,      // cells
  DIFFUSE: 0.085,        // thermal diffusion per tick
  LOSS: 0.0075,          // radiative loss toward ambient per tick
  LID_LOSS: 0.055,       // extra loss when the lid is open

  MOSS_GROW: 0.00024,    // per tick at ideal temp+moisture
  // ⚠ A FIELD IS A BETTER CURVE, NOT A BIGGER NUMBER. This looks smaller than
  // MOSS_GROW and is dramatically stronger, because the wild rate is multiplied
  // by `(0.18 + M)` and this one is not: on ground grazed to nothing the wild
  // term is 0.18 and this is a flat 1, so a field regrows bare earth ~3x faster
  // while barely out-growing healthy wild moss. That is the shape farming
  // should have — it rescues exhausted ground, it does not carpet the board.
  FARM_GROW: 0.00030,    // per tick inside a standing field
  HARVEST: 0.200,        // per tick, per unit of field surplus, into a store
  MILL_MULT: 1.6,        // a milled harvest banks this much more per take
  MEND_RATE: 0.45,       // strain recovery divisor near a mending house (vs 1.4)
  SCHOOL_BOOST: 2.4,     // teach-roll threshold multiplier near a school
  DYNAMO_LIGHT: 0.55,    // the light a dynamo holds its fields at after dark
  IRRIG_WELL: 0.70,      // moisture a well holds its ground at (groundwater)
  IRRIG_CHAN: 0.86,      // ...and a channel, while its source still has water
  IRRIG_RATE: 0.0016,    // per tick, toward that floor
  MOSS_IDEAL: 24.0,
  MOSS_BAND: 13.0,
  MOSS_EAT: 0.34,
  MOSS_FEED: 2.4,       // how much need one unit of moss actually buys        // moss consumed by one feeding

  EVAP: 0.0000042,       // per tick — becomes suspended humidity, not lost water
  CLOUD: 11.0,            // suspended water that triggers condensation
  RAIN_PER_STEP: 0.32,   // how fast a cloud empties back onto the jar
  VENT: 0.010,           // fraction of humidity lost per field step with the lid open
  FLOW: 0.22,

  DECAY: { warmth: 1.05, water: 0.62, food: 0.46, rest: 0.55, company: 0.30, safety: 0.22 }, // per day
  BREED_MIN: 0.72,       // mean wellbeing needed to consider breeding
  BREED_COOLDOWN: 34,    // days
  EGG_DAYS: 4.5, EGG_WARM_MIN: 22.0,
  NIB_DAYS: 8, HALF_DAYS: 20,
  DECIDE_EVERY: 12,      // ticks between decisions
  SPEED: 0.055,          // cells per tick
  FIELD_EVERY: 5,        // field physics runs on a slow lane at 5x dt (§16.2)
};

// How many of the earliest entries the chronicle protects when it trims. The
// founding is the one page a book may never lose.
const HEAD_KEEP = 80;

// ⚠️⚠️ THE GRID IS A RESOLUTION, NOT A SIZE. The board is a fixed physical
// thing and N only decides how finely it is sampled — so every number expressed
// in CELLS has to move with N or the world silently changes shape: the finger
// would cover a different fraction of the town, kin would walk at a different
// real speed, foraging would reach a different real distance. S is that factor
// against the 64 this game was tuned at.
// Numbers that are ABSOLUTE AMOUNTS SPREAD OVER THE BOARD — suspended water,
// how fast a cloud empties — scale with AREA instead, so they take S².
// ⚠️ Per-cell RATES (EVAP, MOSS_GROW, DIFFUSE, LOSS) must NOT be scaled: they
// already apply to every cell, so their totals follow the cell count for free.
export const S = C.N / 64;
const S2 = S * S;
C.HAND_RADIUS *= S;
C.SPEED *= S;
C.CLOUD *= S2;
C.RAIN_PER_STEP *= S2;

export const STAGE = { EGG: 0, NIB: 1, HALF: 2, WHOLE: 3, RIME: 4 };
export const STAGE_NAME = ['egg', 'nib', 'half', 'whole', 'rime'];
export const NEEDS = ['warmth', 'water', 'food', 'rest', 'company', 'safety'];

// Need -> lantern hue (degrees). Content pulls toward the genetic hue.
export const NEED_HUE = { warmth: 205, water: 190, food: 38, rest: 268, company: 292, safety: 3 };

// ---------------------------------------------------------------------------
// 2. GENOME — six of the twelve loci are live in this build (bible §5).
//    Each locus: alleles listed most-dominant first (a linear dominance ladder).
// ---------------------------------------------------------------------------
export const LOCI = [
  { key: 'lantern', alleles: ['teal', 'gold', 'rose', 'green', 'violet', 'ember'] },
  { key: 'hide',    alleles: ['plain', 'ash', 'rime', 'slick'] },
  { key: 'span',    alleles: ['even', 'quick', 'slow'] },
  { key: 'brood',   alleles: ['many', 'few'] },
  { key: 'temper',  alleles: ['placid', 'curious', 'fearful', 'cruel'] },
  { key: 'marrow',  alleles: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] }, // co-dominant
];
export const L = {}; LOCI.forEach((l, i) => L[l.key] = i);

export const LANTERN_HUE = { teal: 172, gold: 44, rose: 340, green: 104, violet: 282, ember: 18 };
// Hide -> [comfort low, comfort high, lethal low, lethal high]
export const HIDE_BAND = {
  plain: [18, 32, 2, 44], ash: [26, 41, 9, 53],
  rime: [6, 21, -8, 34],  slick: [20, 34, 6, 46],
};
export const SPAN_DAYS = { quick: 95, even: 165, slow: 255 };
export const BROOD = { many: [3, 6, 0.34], few: [1, 2, 0.80] }; // min,max,survival

export function expressed(g, li) {           // dominance ladder: lower index wins
  const a = g[li * 2], b = g[li * 2 + 1];
  return LOCI[li].alleles[Math.min(a, b)];
}
export function carried(g, li) {
  const a = g[li * 2], b = g[li * 2 + 1];
  return LOCI[li].alleles[Math.max(a, b)];
}
export function marrowHomozygous(g) { return g[L.marrow * 2] === g[L.marrow * 2 + 1]; }

// ---------------------------------------------------------------------------
// 3. LANGUAGE — names for kin, places and (later) the theonym.
// ---------------------------------------------------------------------------
const ONSET = ['t', 'k', 'm', 'n', 's', 'v', 'th', 'r', 'l', 'p', 'h', 'br', 'sk', 'w', 'g'];
const VOWEL = ['a', 'e', 'i', 'o', 'u', 'aa', 'ei', 'oo', 'ae'];
const CODA = ['', '', '', 'n', 'm', 'k', 's', 'l', 'r', 'th', 'v'];
export function makeLang(seed) {
  const rng = makeRNG(seed ^ 0x9E3779B9);
  const on = [], vo = [], co = [];
  for (let i = 0; i < 7; i++) on.push(pick(rng, ONSET));
  for (let i = 0; i < 5; i++) vo.push(pick(rng, VOWEL));
  for (let i = 0; i < 5; i++) co.push(pick(rng, CODA));
  return { on, vo, co };
}
export function coinName(lang, rng) {
  const n = rng() < 0.42 ? 2 : 1;
  let s = '';
  for (let i = 0; i < n; i++) s += pick(rng, lang.on) + pick(rng, lang.vo) + pick(rng, lang.co);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// 4. NOISE — hash value noise, no trig, deterministic.
// ---------------------------------------------------------------------------
function h2(x, y, s) {
  let n = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = fade(x - xi), yf = fade(y - yi);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
}

// ---------------------------------------------------------------------------
// 5b. THE WEAVE — what the town works out for itself (bible §7)
// ---------------------------------------------------------------------------
// Anno's lesson is that a settlement should DEVELOP: needs gate an upgrade, and
// the upgrade opens harder needs. SimCity's GlassBox lesson is that the thing
// you see must BE the agent's activity, never an illustration of a statistic.
// The bible's rule over both: "Nothing is ever unlocked by the player, and
// there is no tech tree the player can see."
//
// So the town does not gain buildings. It works things out — under pressure,
// out of what is lying about — and a thing it has worked out becomes a WORK
// standing on the board. The player's leverage is total and entirely indirect:
// the finger makes cold and heat, the tilt moves the water, the cover makes
// drought. Pressure is what makes anybody try something new.
//
// ⚠️ A discovery is not culture until somebody who never met the discoverer
// does it anyway. That is the whole of §7 and it is what `k.born` is for.
// ⚠⚠ APPEND-ONLY. A rung's INDEX is save format twice over: k.knows is a
// bitmask over these indices, and every work on every board stores o.kind by
// index. Insert a rung in the middle and every save's heads and buildings
// silently become the wrong things. New rungs go at the END, always.
export const WORKS = [
  // --- what you work out when you have nothing ---------------------------
  { key: 'store', name: 'the store', need: 2, pressure: 0.40, effort: 320, radius: 7.0, cap: 12, per: 14,
    made: 'piled food where it would keep', pre: 0, near: 0 },
  { key: 'windbreak', name: 'the windbreak', need: 0, pressure: 0.38, effort: 380, radius: 6.0, cap: 10, per: 16,
    made: 'heaped a wall against the cold', pre: 0, near: 0 },
  { key: 'channel', name: 'the channel', need: 1, pressure: 0.38, effort: 420, radius: 6.0, cap: 8, per: 22,
    made: 'scraped a channel from the water', pre: 0, near: 0 },
  // --- and then you work out that you could LIVE somewhere ----------------
  // `pre` is a mask of practices that must already be known. This is the whole
  // progression and the player never sees a tree of it.
  { key: 'hut', name: 'the first hut', need: 3, pressure: 0.34, effort: 300, radius: 5.0, cap: 40, per: 7,
    made: 'made a place to be out of the weather', pre: 0b111, preN: 2, near: 1 },
  { key: 'house', name: 'a house', need: 3, pressure: 0.30, effort: 620, radius: 5.0, cap: 48, per: 9,
    made: 'built something meant to outlast them', pre: 0b1000, preN: 1, near: 1 },
  { key: 'hall', name: 'the hall', need: 4, pressure: 0.30, effort: 1300, radius: 9.0, cap: 4, per: 40,
    made: 'raised a roof big enough for all of them', pre: 0b10000, preN: 1, near: 1 },
  // --- and then you work out that you do not have to go and FIND it --------
  // ⚠⚠ THIS IS THE ANSWER TO THE OLDEST BUG IN THE SIM. Wild moss regrows
  // logistically -- `(0.18 + M) * (1 - M)` in _growth -- so a cell grazed to
  // nothing comes back at under a fifth of the rate of a cell that still has
  // something on it. The ground a town walks on every day is therefore the one
  // patch that can never recover, which is why a town starves in the middle of
  // a green board: measured town-core moss 0.08-0.28 against a board average of
  // 0.37-0.74, and hunger was the top cause of death in every long run.
  // A FIELD is the town working that out for itself, and it is the difference
  // between gathering and farming.
  { key: 'farm', name: 'the field', need: 2, pressure: 0.34, effort: 520, radius: 4.5, cap: 24, per: 10,
    made: 'turned the ground over and made it come back', pre: 0b1000, preN: 1, near: 1 },
  { key: 'well', name: 'the well', need: 1, pressure: 0.32, effort: 560, radius: 5.5, cap: 8, per: 12,
    made: 'dug until the water came up to meet them', pre: 0b1000, preN: 1, near: 1 },
  { key: 'granary', name: 'the granary', need: 2, pressure: 0.28, effort: 980, radius: 9.0, cap: 4, per: 26,
    made: 'built a store that could hold a whole winter', pre: 0b1000000, preN: 1, near: 1 },
  // --- and then the work starts doing itself -------------------------------
  // ⚠⚠ THE 16-BIT CEILING: k.knows is a Uint16Array, so WORKS may never
  // exceed 16 entries without widening it AND migrating every saved mask.
  // 13 of 16 used. APPEND ONLY — inserting shifts every pre: bitmask and
  // corrupts every saved k.knows (the standing law since the ladder shipped).
  // Every entry here has a named READ SITE — the five-times-found defect of
  // this codebase is a building nothing consumes. mill → the harvest chain in
  // _sow; mend → the strain decay in the service loop; school → the teach
  // roll threshold; dynamo → _sow's night gate + the night service trickle.
  { key: 'mill', name: 'the mill', need: 2, pressure: 0.30, effort: 1500, radius: 6.5, cap: 6, per: 26,
    made: 'set the wind to grinding', pre: 0b101000000, preN: 2, near: 1 },
  { key: 'mend', name: 'the mending house', need: 5, pressure: 0.30, effort: 1100, radius: 6.0, cap: 4, per: 30,
    made: 'made a bed for the hurt to lie in', pre: 0b10000, preN: 1, near: 1 },
  { key: 'school', name: 'the school', need: 4, pressure: 0.28, effort: 1400, radius: 7.0, cap: 3, per: 36,
    made: 'sat the young down to be told', pre: 0b110000, preN: 2, near: 1 },
  { key: 'dynamo', name: 'the dynamo', need: 0, pressure: 0.26, effort: 2400, radius: 8.0, cap: 3, per: 44,
    made: 'bottled the lightning and hung it from a pole', pre: 0b101000000000, preN: 2, near: 1 },
];
export const WORK_AT = {}; WORKS.forEach((w, i) => WORK_AT[w.key] = i);
// ⚠ ONE definition of how much a food store holds. This is read by the fill,
// the harvest, the hand-out and the forage targeting — four sites that MUST
// agree, and that silently disagreed while the number was written inline.
export const STOCK_CAP = (kind) => kind === WORK_AT.granary ? 8 : kind === WORK_AT.store ? 2 : 0;

// ── THE AGES ──────────────────────────────────────────────
// An age is not a currency and it is not a tech tree — it is a NAME for what
// the town has already managed, read back off the board. `at` is the work
// whose standing marks the turn. Nothing is spent, nothing is unlocked by the
// player, and the town cannot be pushed up the ladder: it arrives when it
// arrives. Order is strictly increasing, and `ageNow` takes the HIGHEST age
// whose marker stands, so losing a field to decay can drop the town back down
// an age — which is the point. An age you cannot lose is a score.
export const AGES = [
  { key: 'gather', name: 'the gathering days', at: -1,
    said: 'they lived on what the ground gave them.' },
  { key: 'settle', name: 'the settling', at: 3,
    said: 'they stopped sleeping where they fell.' },
  { key: 'farm', name: 'the turned ground', at: 6,
    said: 'they stopped going to find their food, and made it come to them.' },
  { key: 'keep', name: 'the kept winter', at: 8,
    said: 'they put away more than they needed, and stopped being afraid of the cold months.' },
  { key: 'wheel', name: 'the turning wheel', at: 9,
    said: 'they stopped doing with their own hands what the wind would do for them.' },
  { key: 'light', name: 'the little lights', at: 12,
    said: 'the dark stopped telling them when the day was over.' },
];
// ⚠️ THE ONE THRESHOLD. "Standing" means this and nothing else — the decay, the
// effects, the era, the chronicle beat and the view must all agree, or a thing
// can be finished for one system and unfinished for another.
export const WORK_DONE = 0.98;

// ---------------------------------------------------------------------------
// 5. THE SIM
// ---------------------------------------------------------------------------
export class Sim {
  constructor(opts = {}) {
    const seed = (typeof opts.seed === 'string' ? hashStr(opts.seed) : (opts.seed >>> 0)) || 20260818;
    this.seed = seed >>> 0;
    // Separate streams: a view-only feature must never desync a lineage (§16.3)
    this.rng = makeRNG(this.seed);
    this.rngWeather = makeRNG(this.seed ^ 0x51ED270B);
    this.rngGene = makeRNG(this.seed ^ 0x2545F491);
    this.lang = makeLang(this.seed);

    const N = C.N, n2 = N * N;
    this.N = N;
    this.height = new Float64Array(n2);
    // ⚠️⚠️ DAD'S CORNER. `height` is the ONLY field in this world that does not
    // decay — temp runs back to ambient, water evaporates, moss regrows, memory
    // fades — and until now it was written exactly once, in `_genWorld`, and
    // never again. Every other verb the player has is weather. This one is
    // geology, and it is the mechanical answer to "the map doesn't feel real":
    // you could not change the map.
    //
    // `lump` is the player's own delta, kept SEPARATE from the generated ground
    // for the reason HANDOFF flagged before it was built: `_genWorld` derives
    // the pond, the graveyard and the hearth FROM the height, so if a reload
    // re-derived them from a height the player had already dented, a hill you
    // raised would relocate the graveyard. Genesis reads the base; `lump` goes
    // on top afterwards, and only `lump` is saved (height regenerates from the
    // seed for free).
    this.lump = new Float64Array(n2);
    this.temp = new Float64Array(n2);
    this.tmp2 = new Float64Array(n2);
    this.water = new Float64Array(n2);
    this.moss = new Float64Array(n2);
    this.moist = new Float64Array(n2);
    this.worn = new Float32Array(n2);   // where they have walked enough to kill it

    // kin, structure-of-arrays (§16.2)
    const K = C.CAP;
    this.k = {
      alive: new Uint8Array(K), stage: new Uint8Array(K), sex: new Uint8Array(K),
      x: new Float64Array(K), y: new Float64Array(K),
      vx: new Float64Array(K), vy: new Float64Array(K),
      tx: new Float64Array(K), ty: new Float64Array(K),
      age: new Float64Array(K), lifespan: new Float64Array(K),
      goal: new Uint8Array(K), goalT: new Float64Array(K), hold: new Float64Array(K),
      cool: new Float64Array(K), born: new Float64Array(K), strain: new Float64Array(K),
      mother: new Int32Array(K), father: new Int32Array(K),
      nameId: new Int32Array(K), gen: new Uint32Array(K),
      genome: new Uint8Array(K * LOCI.length * 2),
      need: new Float64Array(K * NEEDS.length),
      hue: new Float64Array(K), bright: new Float64Array(K), pulse: new Float64Array(K),
      phase: new Float64Array(K), size: new Float64Array(K),
      // ⚠️ DAD GLUED SOME OF THE FIGURES DOWN when he built the town. `glued`
      // is a kin who cannot walk, ever. `tender` is the ONE kin currently
      // coming to them — the corpse-claim pattern, because without a claim the
      // whole colony drops everything to help and starves (measured: peak 86
      // collapsed to 14 and everyone died). Both are typed arrays inside `k`,
      // so they round-trip through toJSON/fromJSON for free.
      glued: new Uint8Array(K), tender: new Int32Array(K),
      // which practices this one carries in its head — a bitmask over WORKS
      // ⚠️ Uint16, and APPEND-ONLY: each bit is a WORKS index, so WORKS indices
      // are SAVE FORMAT — reordering the ladder corrupts every kin's head in
      // every existing save. New rungs go on the END. 16 bits = 16 rungs max;
      // the planned ladder needs 11.
      knows: new Uint16Array(K),
      // ⚠️ WHAT THEY REMEMBER OF THE HAND. memV is SIGNED and the sign is
      // decided by their OWN comfort band, never by a rule about what the
      // player did — so a single press writes gratitude into one bloodline and
      // terror into another in the same tick. That contradiction is the seed
      // §9's schism needs and it costs one comparison. Inside `k`, so free.
      memX: new Float32Array(K), memY: new Float32Array(K), memV: new Float32Array(K),
      // ⚠️ WHAT THEY SAW. Signed like memV and written the same way — from the
      // witness's OWN comfort band — but deliberately EXEMPT from _daily's decay.
      // Everything else about the hand fades; being in the room when somebody was
      // picked up and carried out of the world does not. That exemption is one
      // skipped line and it is the whole of §9.3.
      saw: new Float32Array(K),
      // ⚠️ WHERE THEY LIVE. home is a WORK ID (splice-safe), NOT an index —
      // and -1 is 'nowhere'. ⚠️ 0 is a VALID work id, so a legacy save that
      // lacks these arrays must be filled with -1 in fromJSON or every restored
      // kin silently claims work 0 as home. homeTier is the kind of the
      // dwelling claimed (hut 3 / house 4), for the promotion ladder later.
      home: new Int32Array(K).fill(-1), homeTier: new Uint8Array(K),
    };
    this.names = [];           // nameId -> string
    this.free = [];            // free kin slots
    this.count = 0;

    // ⚠️ works and prac live on `this`, not in `k`, so unlike every per-kin
    // array they do NOT round-trip for free — they are written into toJSON and
    // read back in fromJSON by hand, and covered by saveEqual.
    // what happened WHERE, coarsely — and the names the town gives places once
    // enough different kin have felt strongly enough about them. Purely
    // mechanical: frequency x magnitude x distinct kin. Never a judgement.
    this.placeMem = {};        // coarse cell -> {v, ids:[nameId], n}
    this.placeNames = {};      // coarse cell -> a word in their own language
    this.works = [];           // what stands on the board {id,kind,x,y,prog,by,day,stock}
    // ⚠️ WORK IDS ARE FOREVER. Everything that is about to reference a work —
    // a kin's home, a trade's post — must survive the splice when some OTHER
    // work decays out of the array, so array indices are useless as references.
    // workSeq lives on `this`, which means it does NOT round-trip for free:
    // it is hand-written into toJSON and restored in fromJSON, like `narr`.
    this.workSeq = 0;
    this.prac = WORKS.map(() => ({ invented: -1, inventor: -1, inventorGone: -1,
                                   lost: -1, tradition: -1, reinvented: 0, tries: 0 }));
    this.graves = [];          // {x,y,nameId,day,gen}
    this.corpses = [];         // {x,y,nameId,t}
    this.chronicle = [];       // {day,kind,text}
    this.stats = { born: 0, died: 0, buried: 0, peak: 0, generations: 1 };
    this.eventCounts = new Map(); // for the sifter's rarity ranking (§12.2)

    // player state
    this.hand = null;          // {x,y} in cell space, or null
    this.tilt = { x: 0, y: 0 };
    this.fog = 0;              // 0..1, the player's breath on the outside
    this.humid = 5.0 * S2;     // suspended water in the sealed air
    this.rainLeft = 0;         // water still to fall from the current cloud
    this.age = null;           // last-seen age; null = ask the board on tick 1
    this.foundings = 1;        // how many times dad has set figures out here
    this.ageBest = 0;          // the highest age THIS town ever reached — the
                               // last page reads it, because ruins decay and
                               // ageNow() would understate the dead's history
    // ⚠️ THE BOARD STARTS UNDER THE SHEET — 'dad keeps it covered', which is
    // the help card's own words and the reason the town is alive to be found.
    // Sealed, the water it evaporates comes back as rain. Pulling the sheet off
    // is the player's choice and it costs them the cycle: measured, an open
    // board vents its whole sky in under a week. Starting uncovered made the
    // default state a slow drought that nobody chose.
    this.lid = true;
    this.held = null;          // {id, since} — a kin in the air, out of the world
    // ⚠️ THE ONLY DISCRETE, FINITE, LOCATED THING IN THIS WORLD. Every one of the
    // five verbs is a FIELD — heat, slope, humidity, light — all of them diffuse,
    // temporary and applied to a radius. A crumb is none of those: at 4mm scale
    // it is a boulder of food sitting on a moss layer that is smooth and regrows
    // everywhere, so it is the town's first contested resource, the first thing
    // worth walking across the board for, and the first thing that runs out.
    this.gifts = [];           // [{x, y, mass, day}]
    this.curtain = 0.75;       // 0 = closed, 1 = open
    // ⚠️ THE LAMP STAYS OFF, AND THIS IS THE SECOND TIME. Turning it on was
    // tried as a fix for "the board goes black every twenty seconds" and it is
    // the wrong tool: the lamp adds 1.6 degrees to `ambient` and a 0.22 floor
    // under `daylight`, so it warms the whole jar (a thermal test caught it at
    // 22.4 against ambient 20.6) and it feeds the moss all night, which grew
    // the town from 46 to 64 and left a sixth of them starving in an overgrazed
    // corner. Darkness the player cannot see through is a VIEW problem; it is
    // fixed in view.js's night floor, where it costs the simulation nothing.
    this.lampOn = false;

    // the basement's own temperature — set from the real calendar by main.js,
    // kept OFF the shared constants object so a seed is always the same world
    this.ambientBase = opts.ambientBase != null ? opts.ambientBase : C.AMBIENT_BASE;

    this.tick = 0;
    this.day = 0;
    this.dayFrac = 0;
    // these are computed at the end of every _kin() pass, but the HUD, the save
    // and the audio all read them before the first tick ever runs
    this.alive = 0;
    this.wellbeing = 0;

    // ⚠️⚠️ THE BAKED WORLD. When present this is a real place -- its real
    // elevation from AWS Terrain Tiles and its real water, green and streets
    // from OpenStreetMap -- and _genWorld lays it down instead of value noise.
    // Dad built his diorama from somewhere that exists, which is what model
    // railroaders actually do, and which is why there has always been a rail
    // loop round the edge of this board.
    // ⚠️ It is DATA, not a dependency: sim.js still imports nothing. The caller
    // loads worlds/<name>.json and hands the parsed object in. `worldName` is
    // the only part that goes in the save, and Sim.fromJSON takes the world
    // back as its second argument -- see the note there for why it cannot just
    // be regenerated from the seed like the noise terrain is.
    this.world = opts.world || null;
    this.worldName = this.world ? this.world.name : null;
    this._genWorld();
    // ⚠️⚠️ `||` MEANT `founders: 0` SPAWNED FOURTEEN. Sim.fromJSON restores into
    // `new Sim({seed, founders: 0})`, so every load ran a full phantom founding
    // first. That was merely wasteful while every k array was overwritten — but
    // fromJSON restores with `if (o.k[key])`, so the moment a NEW per-kin array
    // ships, a save written before it keeps the phantom values. A v0.2 save
    // loaded here came back with a glued stranger frozen mid-board and 24 of 36
    // kin believing kin 0 was tending them. `??` is load-bearing.
    const nFound = opts.founders ?? 14;
    this._seedColony(nFound);
    // ⚠ GATED ON THE SAME COUNT AS THE FOUNDING, FOR THE SAME REASON AS THE
    // NOTE ABOVE. Sim.fromJSON restores into `new Sim({seed, founders: 0})`, so
    // an ungated endowment would lay fourteen phantom works and a worn lane on
    // every single load, before the saved ones were read back over them.
    if (nFound > 0) {
      const Wb = this.world;
      this._endowWorks(!!(Wb && Wb.height && Wb.height.length === this.N * this.N));
    }
  }

  // -- world -----------------------------------------------------------------
  _genWorld() {
    const N = this.N, s = this.seed;
    const W = this.world;
    // ⚠️ The baked path fills height/temp/moist and then falls through to the
    // SAME pond, graveyard and hearth derivation below -- those read `height`
    // and do not care where it came from, so a real place gets a real pond in
    // its real lowest ground for free.
    if (W && W.height && W.height.length === N * N) {
      for (let i = 0; i < N * N; i++) {
        this.height[i] = W.height[i] / 4096;
        this.temp[i] = C.AMBIENT_BASE;
        this.moist[i] = W.green && W.green[i] ? 0.62 : 0.45;
      }
      // ⚠️ THE SQUARE LIP STILL GOES ON. It is not scenery -- the comment on
      // the noise path calls it a GAMEPLAY number: it is what keeps water off
      // the board edge and guarantees the pond forms inside the layout rather
      // than draining into the fascia. A real coastline slopes off the edge of
      // the bbox and would empty the whole board without it.
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = (x - (N - 1) / 2) / (N / 2), dy = (y - (N - 1) / 2) / (N / 2);
        const m = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
        if (m > 0.55) this.height[y * N + x] += (m - 0.55) * 0.62;
      }
      this._genLandmarks(true);
      return;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      let h = 0, amp = 1, f = 1 / (22 * S), tot = 0;
      for (let o = 0; o < 4; o++) { h += vnoise(x * f, y * f, s + o * 977) * amp; tot += amp; amp *= 0.5; f *= 2.1; }
      h /= tot;
      // ⚠️ THIS WAS A RADIAL BOWL — "the jar's floor curves up at the glass".
      // With the scenery filling a square board it made the whole middle of the
      // layout one enormous basin that the pond drowned, and left a cliff just
      // inside the rails. The board is square, so the lip is square: a modest
      // rise at the fascia that keeps water off the board edge, and honest
      // terrain everywhere else.
      const dx = (x - (N - 1) / 2) / (N / 2), dy = (y - (N - 1) / 2) / (N / 2);
      const m = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
      // ⚠️ THE RISE IS A GAMEPLAY NUMBER, not a look. Its real job was never
      // scenery — it is what guarantees ONE broad shallow pond in the middle
      // instead of a deep noise hole somewhere random, and a broad shallow pond
      // is the only kind TILT can move. Removing it killed one of the five
      // verbs outright (the tilt test failed); flattening the land instead
      // spread the pond into a marsh that evaporated by half in four days.
      // So: keep the rise, make it square to match the board, and make it even
      // — the radial version reached 0.70 at the corners and 0.23 at the edges.
      const lip = m > 0.55 ? (m - 0.55) * 0.62 : 0;
      this.height[i] = h * 0.68 + lip;
      this.temp[i] = C.AMBIENT_BASE;
      this.moist[i] = 0.45;
    }
    this._genLandmarks(false);
  }

  // ⚠⚠ SHARED BY BOTH WORLDS, AND THAT IS THE POINT. The pond, the graveyard
  // and the hearth are all derived from `height` and none of them care where
  // the height came from -- so a baked real place gets its pond in its real
  // lowest ground, its graveyard on a real shelf, and its founders on real dry
  // land within reach of real water, using the code that has always done it.
  // `fromBake` only decides where the MOSS comes from: a generated world seeds
  // it from the same value noise as its terrain, a real one seeds it from what
  // OpenStreetMap says is actually green there.
  _genLandmarks(fromBake) {
    const N = this.N, s = this.seed;
    const W = this.world;
    // pond: flood the basin until ~11% of the floor is under water
    let lo = 1e9, li = 0;
    for (let i = 0; i < N * N; i++) if (this.height[i] < lo) { lo = this.height[i]; li = i; }
    const sorted = Array.from(this.height).sort((a, b) => a - b);
    const level = sorted[(N * N * 0.11) | 0];
    this.pondLevel = level;
    let px = 0, py = 0, pn = 0;
    for (let i = 0; i < N * N; i++) if (this.height[i] < level) {
      this.water[i] = level - this.height[i];
      px += i % N; py += (i / N) | 0; pn++;
    }
    // ⚠️ OSM OUTRANKS THE FLOOD FILL. The 11%-of-the-floor rule invents a pond
    // for a world that has none; a real place already has real lakes and rivers,
    // and the baker has already pressed them into the terrain so they sit in a
    // real basin. Adding them here means a river that is only two cells wide
    // still exists even though the flood level never reached it.
    if (fromBake && W && W.water) {
      for (let i = 0; i < N * N; i++) {
        if (!W.water[i]) continue;
        if (this.water[i] < 0.05) this.water[i] = 0.05;
        px += i % N; py += (i / N) | 0; pn++;
      }
    }
    this.pond = pn ? { x: (px / pn) | 0, y: (py / pn) | 0 } : { x: li % N, y: (li / N) | 0 };
    for (let i = 0; i < N * N; i++) {
      const wet = this.water[i] > 0.001 ? 0 : 1;
      // ⚠️⚠️ OSM GREEN IS ADDITIVE, NOT A REPLACEMENT, AND THAT IS A DATA-HONESTY
      // RULE. The first version used the mask as the whole answer -- green cell
      // 0.72, everything else 0.10 -- and Ithaca baked with ZERO green ways in
      // its bbox, so the entire board came out at 0.10 moss and the colony was
      // down to ONE survivor by day 60. Absence of landuse=grass in OSM means
      // NOBODY HAS MAPPED IT, not that the ground is bare; green coverage is
      // good in cities and almost nothing in the countryside.
      // So the natural scatter always runs, and what OSM actually knows about
      // is added on top: a real park is genuinely lush, an unmapped field is
      // still a field.
      let base = Math.max(0, vnoise((i % N) * 0.09 / S, ((i / N) | 0) * 0.09 / S, s + 13) * 1.3 - 0.32);
      if (fromBake && W && W.green && W.green[i]) base = Math.min(1, base + 0.55);
      this.moss[i] = wet * base;
    }
    // graveyard: a flat shelf away from the pond, chosen once, named by them later
    let best = -1, bs = -1e9;
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      if (this.water[i] > 0.001 || !this.inJar(x, y)) continue;
      const dx = x - this.pond.x, dy = y - this.pond.y;
      const sc = Math.sqrt(dx * dx + dy * dy) * 0.4 + this.height[i] * 6;
      if (sc > bs) { bs = sc; best = i; }
    }
    this.yard = { x: best % N, y: (best / N) | 0 };
    // the hearth: dry ground within reach of the water. Founders start here.
    // ⚠️ Seeding them on the graveyard shelf puts them as far from the pond as
    // the generator can manage, and the whole colony dies of thirst by day two.
    let hb = -1, hs = -1e9;
    // the mean of the real building centroids, when the board was baked
    let vcx = 0, vcy = 0, vcn = 0;
    if (fromBake && W && W.buildings && W.buildings.length >= 2) {
      for (let b = 0; b + 1 < W.buildings.length; b += 2) { vcx += W.buildings[b]; vcy += W.buildings[b + 1]; vcn++; }
      if (vcn) { vcx /= vcn; vcy /= vcn; }
    }
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      if (this.water[i] > 0.001 || !this.inJar(x, y)) continue;
      if (this.height[i] < this.pondLevel + 0.10) continue;   // above the flood line
      const dx2 = x - this.pond.x, dy2 = y - this.pond.y;
      const dp = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      const dm = Math.abs(dp - 8 * S);                   // want to be ~8 cells from water
      let sc = -dm * 2 - this.height[i] * 2 + this.moss[i] * 4;
      // ⚠ WHEN OSM KNOWS WHERE THE VILLAGE IS, FOUND THE TOWN IN IT. The bake
      // carries the real building centroids of the real place; `vcx/vcy` is
      // their mean. Without this the hearth lands on whatever dry shelf scores
      // best and the colony grows up in a field two hundred metres from the
      // village it was baked from, which wastes the only thing the real data
      // was for. Weighted to lose to drowning and to the flood line, never to
      // beat them.
      if (vcn) { const vdx = x - vcx, vdy = y - vcy; sc -= Math.sqrt(vdx * vdx + vdy * vdy) * 1.4; }
      if (sc > hs) { hs = sc; hb = i; }
    }
    if (hb < 0) hb = this.yard.y * N + this.yard.x;   // fallback: no cell cleared the flood line
    this.hearth = { x: hb % N, y: (hb / N) | 0 };
  }

  inJar(x, y) {
    const N = this.N, dx = x / (N - 1) - 0.5, dy = y / (N - 1) - 0.5;
    return Math.sqrt(dx * dx + dy * dy) <= 0.455;
  }

  idx(x, y) {
    const N = this.N;
    const cx = x < 0 ? 0 : (x > N - 1 ? N - 1 : x | 0);
    const cy = y < 0 ? 0 : (y > N - 1 ? N - 1 : y | 0);
    return cy * N + cx;
  }

  // Effective height including tilt — this is what water and feet actually feel.
  eff(i) {
    const N = this.N, x = i % N, y = (i / N) | 0;
    return this.height[i] + (x / N - 0.5) * this.tilt.x + (y / N - 0.5) * this.tilt.y;
  }

  // -- colony ----------------------------------------------------------------
  _randGenome(rng) {
    const g = new Uint8Array(LOCI.length * 2);
    for (let li = 0; li < LOCI.length; li++) {
      const n = LOCI[li].alleles.length;
      // weight toward the front of the ladder so rare alleles stay rare
      g[li * 2] = Math.min(ri(rng, n), ri(rng, n));
      g[li * 2 + 1] = Math.min(ri(rng, n), ri(rng, n));
    }
    return g;
  }

  _seedColony(n) {
    const rng = this.rng;
    const born = [];
    for (let i = 0; i < n; i++) {
      let x = this.hearth.x, y = this.hearth.y;
      for (let tries = 0; tries < 12; tries++) {
        const a = rng();
        const px = this.hearth.x + tcos(a) * rr(rng, 0.5 * S, 3.2 * S);
        const py = this.hearth.y + tsin(a) * rr(rng, 0.5 * S, 3.2 * S);
        if (this.height[this.idx(px, py)] > this.pondLevel + 0.06) { x = px; y = py; break; }
      }
      const id = this._spawn(x, y, this._randGenome(rng), -1, -1, 1);
      if (id < 0) continue;
      this.k.stage[id] = rng() < 0.25 ? STAGE.HALF : STAGE.WHOLE;
      // ⚠️⚠️ FOUNDERS USED TO SPAWN ALREADY DEAD. Age was a flat 30-70 days
      // regardless of the genome, but a `quick` span that is also marrow-
      // homozygous lives 95 × 0.5 × 0.85 = 40 days — so a founder could be born
      // aged 61 with a lifespan of 40 and die of old age during day zero.
      // Caught because the glued founder on seed 'live' was buried before the
      // town had finished being introduced. Cap the draw at half their own life;
      // ordinary long-lived founders are unaffected.
      const span = this.k.lifespan[id];
      this.k.age[id] = this.k.stage[id] === STAGE.HALF
        ? rr(rng, 12, 20)
        : Math.max(C.HALF_DAYS + 1, Math.min(span * 0.5, rr(rng, 30, 70)));
      born.push(id);
    }
    // THE ONE WHO STAYS. Dad set the figures out and put a drop of glue under
    // one of them. Only a PLACED figure can be glued — every kin born here is
    // free, so when this one dies there is never another.
    // ⚠️ Pick the LONGEST-LIVED founder and make them a young adult. Taking
    // whoever came first gave the player a stranger who died around day 40 of
    // plain old age (measured median across 12 seeds), which is not enough time
    // to care that they cannot walk. This figure is the one dad never replaced.
    let g = -1;
    for (const id of born) {
      if (this.k.stage[id] !== STAGE.WHOLE) continue;
      if (g < 0 || this.k.lifespan[id] > this.k.lifespan[g]) g = id;
    }
    if (g >= 0) {
      this.k.glued[g] = 1;
      this.k.age[g] = Math.max(C.HALF_DAYS + 1, this.k.lifespan[g] * 0.22);
    }
    for (const id of born) this._name(id, id === g ? 'who has never once moved' : 'founder');
    // ⚠ born.length, never this.count — count is the slot high-water mark and
    // includes every kin that ever died, so a refounding announced 'the town.
    // 121 of them' after dad set out 14. And a refounded ground HAS names.
    this.log('open', this.foundings > 1
      ? `the town again. ${born.length} of them, on ground that already had its names.`
      : `the town. ${born.length} of them, and nothing yet has a name for the sky.`);
  }

  // ── THE FOUNDING IS NOT YEAR ZERO ──────────────────────────────
  // Dad's layout has been on that board since the nineties. The town did not
  // begin the moment somebody looked at it — it was already there.
  //
  // ⚠⚠ THIS IS THE ONE PLACE §18 BENDS, AND IT BENDS ONCE. You still never
  // build anything: this is WORLDGEN. It runs once, before the first tick, and
  // everything it lays down was made by the founders' PARENTS — which is why
  // the founders arrive already knowing how. There is no build menu and there
  // never will be.
  //
  // WHY: measured on Keswick, day 46 held ONE work and 29 kin. A player who
  // watched for fifteen real minutes saw a single hut appear. That is the
  // whole 'weaker than a tamagotchi' verdict in one number — the game's
  // subject is a town, and there was no town on screen for the first quarter
  // of an hour. The invention arc is untouched: the founders inherit the four
  // practices their parents had, and still have to work out the HOUSE and the
  // HALL for themselves, which is the arc the chronicle is actually about.
  _endowWorks(fromBake) {
    const rng = this.rng, N = this.N, W = this.world;
    const day = 0;
    // three stores, two windbreaks, two channels, seven huts.
    const RECIPE = [WORK_AT.channel, WORK_AT.channel,
                    WORK_AT.store, WORK_AT.store, WORK_AT.store,
                    WORK_AT.windbreak, WORK_AT.windbreak,
                    WORK_AT.hut, WORK_AT.hut, WORK_AT.hut, WORK_AT.hut,
                    WORK_AT.hut, WORK_AT.hut, WORK_AT.hut];
    const ok = (x, y) => {
      const i = this.idx(x, y);
      return this.inJar(x, y) && this.water[i] <= 0.001 && this.height[i] > this.pondLevel + 0.06;
    };
    // WHERE they stand. A baked board carries the REAL building centroids of
    // the real place, so the founding village sits where the actual village
    // sits, lined along its actual streets. A generated board rings them
    // around the hearth instead.
    const sites = [];
    const seen = new Set();
    const push = (x, y) => {
      const cx = Math.round(x), cy = Math.round(y), key = cy * N + cx;
      if (seen.has(key) || !ok(cx, cy)) return;
      // no two works stacked on one another
      for (const s2 of sites) if (Math.abs(s2.x - cx) < 2 && Math.abs(s2.y - cy) < 2) return;
      seen.add(key); sites.push({ x: cx, y: cy });
    };
    if (fromBake && W && W.buildings && W.buildings.length >= 2) {
      const cand = [];
      for (let b = 0; b + 1 < W.buildings.length; b += 2) {
        const x = W.buildings[b], y = W.buildings[b + 1];
        const dx = x - this.hearth.x, dy = y - this.hearth.y;
        cand.push({ x, y, d: dx * dx + dy * dy });
      }
      cand.sort((a, b2) => a.d - b2.d);
      for (const c of cand) { if (sites.length >= RECIPE.length) break; push(c.x, c.y); }
    }
    // top up (or fill entirely) with a ring around the hearth
    for (let tries = 0; sites.length < RECIPE.length && tries < 400; tries++) {
      const a = rng(), r = rr(rng, 1.4 * S, 6.2 * S);   // tcos/tsin take TURNS
      push(this.hearth.x + tcos(a) * r, this.hearth.y + tsin(a) * r);
    }
    if (!sites.length) return;
    // channels want the water, huts want the hearth: sort so the recipe lands
    // somewhere it makes sense rather than in draw order
    const dp = (s2) => { const dx = s2.x - this.pond.x, dy = s2.y - this.pond.y; return dx * dx + dy * dy; };
    const dh = (s2) => { const dx = s2.x - this.hearth.x, dy = s2.y - this.hearth.y; return dx * dx + dy * dy; };
    sites.sort((a, b2) => dp(a) - dp(b2));
    const wet = sites.splice(0, 2);
    sites.sort((a, b2) => dh(a) - dh(b2));
    const order = wet.concat(sites);
    for (let n = 0; n < order.length && n < RECIPE.length; n++) {
      const kind = RECIPE[n], s2 = order[n];
      this.works.push({ id: this.workSeq++, kind, x: s2.x, y: s2.y, prog: 1, by: -1, day,
                        stock: kind === WORK_AT.store ? 0.6 : 0 });
      // a lane worn between the hearth and everything that stands on it — a
      // village that has been lived in has paths, and `worn` regrows on its
      // own if this generation stops walking them
      const steps = Math.max(2, (Math.sqrt(dh(s2)) | 0) * 2);
      for (let q = 0; q <= steps; q++) {
        const f = q / steps;
        const i = this.idx(this.hearth.x + (s2.x - this.hearth.x) * f,
                           this.hearth.y + (s2.y - this.hearth.y) * f);
        if (this.worn[i] < 0.55) this.worn[i] = 0.55;
      }
    }
    // ⚠ THE PRACTICES COME WITH THE BUILDINGS OR THE VILLAGE ROTS. A kin can
    // only work on a kind it KNOWS (see the two guards in _build), so endowed
    // works that nobody understands would never be repaired and the whole
    // village would decay to nothing while the town watched. The founders were
    // taught these four; they are traditions, not discoveries, so `invented`
    // is day 0 with NO inventor — nobody alive remembers working it out, which
    // is what a tradition IS.
    let mask = 0;
    for (const kind of new Set(RECIPE)) {
      mask |= (1 << kind);
      const pr = this.prac[kind];
      pr.invented = 0; pr.inventor = -1; pr.inventorGone = 0; pr.tradition = 0;
    }
    for (let id = 0; id < this.count; id++) if (this.k.alive[id]) this.k.knows[id] |= mask;
  }
  // ── SET OUT NEW FIGURES ────────────────────────────────────
  // Real loss, and what comes after it. When the last kin dies the town is
  // allowed to be OVER — that is the stakes working — but the LAYOUT is still
  // on the table, so dad can set out new figures. The new town starts on the
  // old one's ground: works standing at whatever decay, graves kept, place
  // names kept, practices remembered by the world.
  // ⚠ THE NEW FIGURES DO NOT INHERIT THE DEAD TOWN'S KNOWLEDGE. They arrive
  // with the founding four, like every founding — what the old town invented
  // survives only as RUINS, and the weave's reinvention path (somebody looks
  // at a standing thing nobody understands and understands it) is the
  // archaeology. That loop already existed; refounding is what makes it sing.
  // ⚠ _seedColony picks a NEW glued figure among the born — correct: dad set
  // out new figures and put a drop of glue under one of them.
  refound(n2 = 14) {
    // ⚠ COUNT, don't trust `this.alive` — it is a cached aggregate that is 0
    // between construction and the first _kin walk, so the cached check let a
    // LIVING town be refounded (caught by the boot validation, first try).
    // Same failure family as the stale-alive fingerprint hole.
    let pre = 0;
    for (let id = 0; id < this.count; id++) if (this.k.alive[id]) pre++;
    if (pre > 0) return false;
    this.foundings++;
    this._ended = false;
    this.log('open', 'dad set out new figures. the old town was still there.', 9);
    this._seedColony(n2);
    const mask = 0b1111;
    for (let id = 0; id < this.count; id++) if (this.k.alive[id]) this.k.knows[id] |= mask;
    // ⚠ and the founding four arrive as TRADITIONS, exactly like _endowWorks
    // grants them at genesis. The dead town's weave flagged everything `lost`;
    // left that way, the next roll narrated 'worked out the channel again,
    // from nothing' for knowledge every figure was carrying — and `relearning`
    // bypassed the room cap. prac[4+] stays lost ON PURPOSE: that is the
    // archaeology.
    for (let q = 0; q < 4; q++) {
      const pr = this.prac[q];
      pr.lost = -1; pr.invented = 0; pr.inventor = -1; pr.inventorGone = 0; pr.tradition = 0;
    }
    // the new town's register starts from what its ground still shows
    this.ageBest = this.ageNow();
    // recount NOW — the fingerprint folds `alive`, and waiting for the next
    // _kin walk leaves a save written in between hashing as a dead town
    let liv = 0;
    for (let id = 0; id < this.count; id++) if (this.k.alive[id]) liv++;
    this.alive = liv;
    return true;
  }

  _spawn(x, y, genome, mo, fa, gen) {
    let id;
    if (this.free.length) id = this.free.pop();
    else if (this.count < C.CAP) id = this.count;
    else return -1;
    if (id >= this.count) this.count = id + 1;
    const k = this.k, G = LOCI.length * 2;
    k.alive[id] = 1; k.stage[id] = STAGE.EGG;
    k.sex[id] = this.rngGene() < 0.5 ? 0 : 1;
    k.x[id] = Math.max(1, Math.min(this.N - 2, x));
    k.y[id] = Math.max(1, Math.min(this.N - 2, y));
    this._keepIn(id);
    k.vx[id] = 0; k.vy[id] = 0; k.tx[id] = k.x[id]; k.ty[id] = k.y[id];
    k.age[id] = 0; k.goal[id] = 0; k.goalT[id] = 0; k.hold[id] = 0; k.cool[id] = 0; k.strain[id] = 0;
    k.born[id] = this.day; k.mother[id] = mo; k.father[id] = fa;
    k.nameId[id] = -1; k.gen[id] = gen;
    k.glued[id] = 0; k.tender[id] = -1; k.knows[id] = 0;
    // a child is born INTO the household. Beds gate adult CLAIMS, not births —
    // the leaving-home moment happens at the HALF->WHOLE transition instead.
    k.home[id] = mo >= 0 ? k.home[mo] : -1;
    k.homeTier[id] = mo >= 0 ? k.homeTier[mo] : 0;
    k.memX[id] = -1; k.memY[id] = -1; k.memV[id] = 0;
    // ⚠ saw too — it is exempt from the daily decay ON PURPOSE, which means a
    // recycled slot hands the previous occupant's hand-trauma to a newborn.
    // Reviewed and measured: refound a dead town and 14 of 14 new figures
    // arrived pre-traumatized by a hand they never saw.
    k.saw[id] = 0;
    for (let j = 0; j < G; j++) k.genome[id * G + j] = genome[j];
    const span = SPAN_DAYS[expressed(genome, L.span)];
    const homo = marrowHomozygous(genome);
    k.lifespan[id] = span * (homo ? 0.5 : 1) * rr(this.rngGene, 0.85, 1.15); // §5.1 Marrow
    for (let n = 0; n < NEEDS.length; n++) k.need[id * NEEDS.length + n] = rr(this.rngGene, 0.7, 0.95);
    k.hue[id] = LANTERN_HUE[expressed(genome, L.lantern)];
    k.bright[id] = 0.8; k.pulse[id] = 0.4;
    k.phase[id] = this.rngGene(); k.size[id] = rr(this.rngGene, 0.9, 1.1);
    return id;
  }

  _name(id, why) {
    if (this.k.nameId[id] >= 0) return this.names[this.k.nameId[id]];
    const nm = coinName(this.lang, this.rng);
    this.k.nameId[id] = this.names.length;
    this.names.push(nm);
    if (why !== 'founder') this.log('name', `${nm} — ${why}.`, 1.4);
    return nm;
  }
  nameOf(id) { const n = this.k.nameId[id]; return n >= 0 ? this.names[n] : 'a kin'; }

  log(kind, text, weight = 1) {
    // don't say the same sentence four times in a row — it reads as a bug
    const last = this.chronicle[this.chronicle.length - 1];
    if (last && last.text === text && this.day - last.day < 8) { last.repeat = (last.repeat || 1) + 1; return; }
    const c = (this.eventCounts.get(kind) || 0) + 1;
    this.eventCounts.set(kind, c);
    // rarity ranking (§12.2): the rarer the kind, the higher the score
    const rarity = 1 / Math.sqrt(c);
    // ⚠️ `w` is the author's intent weight, kept SEPARATELY from `score`.
    // `score` freezes rarity-at-the-time, which the sifter must be able to undo
    // when it re-ranks an event against its own era. See page().
    this.chronicle.push({ day: this.day, kind, text, w: weight, score: weight * rarity });
    // ⚠️ THE BOOK USED TO DELETE ITS OWN FIRST PAGE. A flat splice(0, 1000) —
    // and toJSON's slice(-600) — eventually threw away the founding itself:
    // measured at day 600, `chronicle.some(e => e.kind === 'open')` was false.
    // A book about a long life must keep its opening. Trim the MIDDLE.
    if (this.chronicle.length > 4000) this.chronicle.splice(HEAD_KEEP, 1000);
  }

  // -- the day ---------------------------------------------------------------
  get ambient() {
    return this.ambientBase + (this.lampOn ? 1.6 : 0);
  }
  get daylight() {
    // one day = one sine of light; curtain scales it; lamp puts a floor under night
    const d = Math.max(0, tsin(this.dayFrac - 0.25) * 0.5 + 0.5);
    return Math.max(this.lampOn ? 0.22 : 0, d * this.curtain);
  }

  // -- step ------------------------------------------------------------------
  step() {
    this.tick++;
    this.dayFrac += 1 / C.TICKS_PER_DAY;
    if (this.dayFrac >= 1) { this.dayFrac -= 1; this.day++; this._daily(); }
    if (this.tick % C.FIELD_EVERY === 0) {
      const F = C.FIELD_EVERY;
      this._thermal(F);
      this._fluids(F);
      this._irrigate(F);   // channels and wells keep their ground damp
      this._growth(F);
      this._sow(F);        // fields put back what the town took
      if (this.gifts.length) this._gifts();
    }
    // ⚠⚠ DUSK IS SOMETHING EVERYBODY NOTICES. Traced: at nightfall most kin
    // were mid-errand with commitment holds of 200-770 ticks, so they did not
    // even RE-DECIDE until deep night — and a kin 25 cells from home needs
    // ~600 ticks of walking against a ~300-tick night, so they never made it.
    // No pull strength can beat arithmetic. Instead, once per evening as the
    // light fails, every open commitment shortens to at most 90 ticks: the
    // errand finishes or is dropped, the re-decide happens while there is
    // still night to walk in, and the near-enough go home. The far ones camp
    // where they are, which is honest. Deterministic — no draws, one sweep.
    if (this.daylight < 0.35 && this._duskSweep !== this.day) {
      this._duskSweep = this.day;
      const kk = this.k;
      for (let id = 0; id < this.count; id++) {
        if (!kk.alive[id]) continue;
        // ⚠️⚠️ THE DUSK SWEEP WAS EATING THE CALL. `call()` sets hold = 1400
        // with a comment saying a long commitment is required "or _decide takes
        // them back off it within a second and the whole power reads as nothing
        // happening" — and then this sweep clamped it to 90 ticks, which at 45Hz
        // is TWO SECONDS. A call issued anywhere near dusk did exactly the
        // nothing its own author was guarding against.
        // Goal 12 is summoned, and it is the only goal the PLAYER set. The sweep
        // exists to stop the town's own errands stranding it in the dark; the
        // hand's instruction is not one of those, and being called somewhere at
        // nightfall is the player's business, not the town's.
        if (kk.goal[id] === 12) continue;
        if (kk.hold[id] > 90) kk.hold[id] = 90;
      }
    }
    this._kin();
    // culture runs at 1 Hz, not 15 (bible §20)
    if (this.tick % 15 === 0) this._weave();
  }

  _thermal(F) {
    const N = this.N, T = this.temp, T2 = this.tmp2;
    const amb = this.ambient + this.daylight * C.SUN_GAIN;
    const loss = Math.min(0.5, (C.LOSS + (this.lid ? 0 : C.LID_LOSS)) * F);
    const D = Math.min(0.24, C.DIFFUSE * F);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const l = T[i - (x > 0 ? 1 : 0)], r = T[i + (x < N - 1 ? 1 : 0)];
        const u = T[i - (y > 0 ? N : 0)], d = T[i + (y < N - 1 ? N : 0)];
        let v = T[i] + D * ((l + r + u + d) * 0.25 - T[i]);
        v += (amb - v) * loss;
        // water is a heat sink
        if (this.water[i] > 0.02) v += (amb - v) * Math.min(0.3, 0.03 * F);
        T2[i] = v;
      }
    }
    // the hand. Heat arrives slowly and leaves slowly — bible §3.1
    if (this.hand) {
      const hx = this.hand.x, hy = this.hand.y, R = this.hand.r;
      const x0 = Math.max(0, (hx - R) | 0), x1 = Math.min(N - 1, (hx + R) | 0);
      const y0 = Math.max(0, (hy - R) | 0), y1 = Math.min(N - 1, (hy + R) | 0);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x - hx, dy = y - hy, d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;
        const f = 1 - d / R;
        T2[y * N + x] += (this.hand.heat - T2[y * N + x]) * Math.min(0.4, C.HAND_K * F) * f * (0.45 + 0.55 * f);
      }
    }
    this.temp = T2; this.tmp2 = T;
  }

  _fluids(F) {
    const N = this.N, W = this.water, H = this.height, M = this.moist, T = this.temp;
    const cells = N * N;
    // THE WATER CYCLE. The jar is sealed: what evaporates comes back as rain.
    // Open the lid and it doesn't. That is the whole cost of the lid. (§3.4)
    if (this.rainLeft > 0) {
      const fall = Math.min(this.rainLeft, C.RAIN_PER_STEP * F);
      this.rainLeft -= fall;
      const add = fall / cells;
      for (let i = 0; i < cells; i++) { W[i] += add; M[i] = Math.min(1, M[i] + 0.004 * F); }
      if (this.rainLeft <= 0) this.rainLeft = 0;
    } else if (this.humid > C.CLOUD) {
      this.rainLeft = this.humid * 0.85; this.humid -= this.rainLeft;
      if (this.day - (this._lastRainLog || -99) > 11) {
        this._lastRainLog = this.day;
        const how = ['the air gave back its water, and it rained.',
                     'the underside of the sky ran with rain.',
                     'the weather came back down.'][(this.day / 11 | 0) % 3];
        this.log('rain', how, 0.6);
      }
    }
    // ⚠️⚠️ THE COVER WAS INVERTED, AND IT WAS KILLING TOWNS. `lid === true`
    // means the sheet is ON (see the button label and the help card), but both
    // C.LID_LOSS and C.VENT are documented in the constants block as the cost of
    // the board being OPEN — and both were applied when it was closed. Measured
    // over 20 days: covering the town drained the pond to 0 and the air to 0 and
    // left 3 of 13 alive, while the help card promised 'under the plastic their
    // rain comes back'. One of the five verbs did the exact opposite of what the
    // game said it did. The narrator agreed with the bug, which is why it hid.
    if (!this.lid) this.humid = Math.max(0, this.humid * (1 - C.VENT * F));
    // tilt as a precomputed per-axis ramp — avoids a modulo and a divide per lookup
    const tx = this.tilt.x / N, ty = this.tilt.y / N;
    const flow = Math.min(0.85, C.FLOW * F * 0.4);
    for (let y = 0; y < N; y++) {
      const row = y * N, ry = (y / N - 0.5) * this.tilt.y;
      for (let x = 0; x < N; x++) {
        const i = row + x;
        const w = W[i];
        if (w >= 0.0008) {
          const hi = H[i] + (x / N - 0.5) * this.tilt.x + ry + w;
          let bi = -1, bd = 0;
          if (x < N - 1) { const j = i + 1, hj = H[j] + ((x + 1) / N - 0.5) * this.tilt.x + ry + W[j]; if (hi - hj > bd) { bd = hi - hj; bi = j; } }
          if (x > 0) { const j = i - 1, hj = H[j] + ((x - 1) / N - 0.5) * this.tilt.x + ry + W[j]; if (hi - hj > bd) { bd = hi - hj; bi = j; } }
          if (y < N - 1) { const j = i + N, hj = H[j] + (x / N - 0.5) * this.tilt.x + ((y + 1) / N - 0.5) * this.tilt.y + W[j]; if (hi - hj > bd) { bd = hi - hj; bi = j; } }
          if (y > 0) { const j = i - N, hj = H[j] + (x / N - 0.5) * this.tilt.x + ((y - 1) / N - 0.5) * this.tilt.y + W[j]; if (hi - hj > bd) { bd = hi - hj; bi = j; } }
          if (bi >= 0) { const m = Math.min(w, bd * 0.5) * flow; W[i] -= m; W[bi] += m; }
          const ev = Math.min(W[i], C.EVAP * F * (1 + (T[i] > 20 ? (T[i] - 20) * 0.12 : 0)));
          W[i] -= ev; this.humid += ev;
        }
        if (W[i] > 0.002) M[i] = Math.min(1, M[i] + 0.002 * F);
        else M[i] = Math.max(0, M[i] - 0.00012 * F * (1 + (T[i] > 22 ? (T[i] - 22) * 0.1 : 0)));
      }
    }
    // the player's breath is a cloud you make on purpose
    if (this.fog > 0.999) { this.humid += 4.5 * S2; this.fog = 0; this.log('breath', 'the air went heavy all at once, and then it rained.', 1.1); }
  }

  // ── TENDED GROUND ─────────────────────────────────────────
  // The whole difference between gathering and farming, in one loop.
  // Natural growth is multiplied by `(0.18 + M)`, so bare ground creeps back
  // and grazed ground stays grazed. Inside a standing field that term is
  // replaced by a flat rate: the ground is turned and sown, so what comes up
  // no longer depends on what survived being eaten. It still needs warmth,
  // moisture and daylight — a field is not a cheat, it is a better curve.
  // ⚠ NO RNG. This is sim code on the hot path and it must stay deterministic.
  _sow(F) {
    const N = this.N, M = this.moss, W = this.water, Q = this.moist, T = this.temp;
    const light = this.daylight;
    // ⚠ the early-out must survive the dynamo: with no standing dynamo the
    // night skip is exactly what it always was, and headless towns that never
    // invent one pay nothing for the feature existing.
    let hasPower = false;
    for (const w2 of this.works) if (w2.kind === WORK_AT.dynamo && w2.prog >= WORK_DONE) { hasPower = true; break; }
    if (light <= 0 && !hasPower) return;           // nothing grows in the dark
    const near2 = (kind, ox, oz) => {
      // ⚠ radius * S, like the service loop and the school scan — one WORKS
      // table column must mean ONE real distance. Unscaled, the dynamo lit
      // kin to 12 cells and fields to only 8: two circles from one number.
      const rr = WORKS[kind].radius * S, rr2 = rr * rr;
      for (const w2 of this.works) {
        if (w2.kind !== kind || w2.prog < WORK_DONE) continue;
        const dx2 = w2.x - ox, dy2 = w2.y - oz;
        if (dx2 * dx2 + dy2 * dy2 <= rr2) return true;
      }
      return false;
    };
    const inv = 1 / (C.MOSS_BAND * C.MOSS_BAND);
    for (const o of this.works) {
      if (o.kind !== WORK_AT.farm || o.prog < WORK_DONE) continue;
      const R = WORKS[o.kind].radius, R2 = R * R;
      // the dynamo's field-facing half: a lit field keeps growing after dark.
      // L replaces `light` for THIS farm only; an unlit farm at night still
      // contributes nothing, exactly as before.
      const L = light > C.DYNAMO_LIGHT ? light : (near2(WORK_AT.dynamo, o.x, o.y) ? C.DYNAMO_LIGHT : light);
      if (L <= 0) continue;
      let crop = 0, cells = 0;
      const x0 = Math.max(0, Math.round(o.x - R)), x1 = Math.min(N - 1, Math.round(o.x + R));
      const y0 = Math.max(0, Math.round(o.y - R)), y1 = Math.min(N - 1, Math.round(o.y + R));
      for (let y = y0; y <= y1; y++) {
        const dy = y - o.y;
        for (let x = x0; x <= x1; x++) {
          const dx = x - o.x;
          if (dx * dx + dy * dy > R2) continue;
          const i = y * N + x;
          if (W[i] > 0.02) continue;                 // a flooded field grows nothing
          const d = T[i] - C.MOSS_IDEAL, heat = 1 - d * d * inv;
          if (heat <= 0) continue;
          const g = C.FARM_GROW * F * heat * (0.25 + Q[i] * 0.75) * L * (1 - M[i]);
          M[i] = M[i] + g > 1 ? 1 : M[i] + g;
          crop += M[i];
          cells++;
        }
      }
      // ── THE HARVEST ────────────────────────────────────────
      // ⚠⚠ WITHOUT THIS THE GRANARIES STAND EMPTY AND THE WHOLE AGE IS A LIE.
      // Measured on bat0 at day 300: a fully built town — 14 fields, 12 stores,
      // 4 granaries, age 3 — with FOUR GRANARIES HOLDING 0.01 BETWEEN THEM.
      // A store's only source was the single cell underneath it and a granary's
      // was surplus wild moss above 0.45, but the town core those buildings sit
      // in runs at 0.16 because ninety-eight kin graze it flat. So the food
      // stores of a farming town could never fill, and 'the kept winter' kept
      // nothing.
      // A field carries what it grows beyond the grazers to the nearest store.
      // That is the actual agricultural chain — field to granary to a town that
      // survives a bad stretch — and it is the difference between a granary
      // being a building and a granary being a reason.
      if (cells > 0) {
        const mean = crop / cells;
        // ⚠ THE GATE IS LOW ON PURPOSE. A field runs at LOW moss precisely
        // because it is being harvested — measured 0.208 inside fields against
        // 0.678 on wild ground, because the fields sit in town where everyone
        // stands. A high gate meant the crop was grazed away before it could
        // ever be carried, so the granaries stayed empty and farming was a
        // decoration on top of gathering.
        if (mean > 0.12) {
          let tgt = null, bd = 1e9;
          for (const g2 of this.works) {
            if (g2.kind !== WORK_AT.granary && g2.kind !== WORK_AT.store) continue;
            if (g2.prog < WORK_DONE) continue;
            const capN = STOCK_CAP(g2.kind);
            if (g2.stock >= capN) continue;
            const dx2 = g2.x - o.x, dy2 = g2.y - o.y, d2 = dx2 * dx2 + dy2 * dy2;
            // a granary is worth walking further to than a heap under a stone
            const w2 = g2.kind === WORK_AT.granary ? d2 * 0.45 : d2;
            if (w2 < bd && d2 < 400) { bd = w2; tgt = g2; }
          }
          if (tgt) {
            // taken off the FIELD, never conjured: the ground gives it up.
            const capN = STOCK_CAP(tgt.kind);
            // the mill grinds: a milled field banks more per take. Multiplied
            // into the AMBITION, so the conservation fix below still means only
            // what the ground surrendered is banked — the mill makes the hands
            // faster, it does not conjure moss.
            const milled = near2(WORK_AT.mill, o.x, o.y);
            const take = Math.min(C.HARVEST * F * (mean - 0.12) * (milled ? C.MILL_MULT : 1), capN - tgt.stock);
            if (take > 0) {
              // ⚠⚠ BANK WHAT THE GROUND ACTUALLY SURRENDERED, NOT WHAT WAS ASKED
              // FOR. This used to credit the store the whole of `take` and then
              // spread it as a flat `per` across the disc, clamping each cell at
              // zero — so every cell holding less than its share paid only what
              // it had, and the shortfall was banked anyway. A field in town runs
              // at ~0.15 mean moss with many cells at exactly 0, so this was not
              // a rounding crumb: the granary was partly filled with food that
              // never existed. The comment two lines up promised the opposite
              // ('taken off the FIELD, never conjured') and was simply wrong.
              // `take` is now the ambition and still gates the loop; `got` is
              // what the field paid, and only `got` is banked.
              let got = 0;
              const per = take / cells;
              for (let y = y0; y <= y1; y++) {
                const dy = y - o.y;
                for (let x = x0; x <= x1; x++) {
                  const dx = x - o.x;
                  if (dx * dx + dy * dy > R2) continue;
                  const i = y * N + x;
                  const v = M[i] - per;
                  if (v < 0) { got += M[i]; M[i] = 0; } else { got += per; M[i] = v; }
                }
              }
              // ⚠ the subtraction disc can be wider than the `cells` the growth
              // loop counted (it skips flooded and out-of-band cells), so `got`
              // can exceed `take` — the cap is what keeps the store honest.
              tgt.stock = tgt.stock + got > capN ? capN : tgt.stock + got;
            }
          }
        }
      }
    }
  }

  // ── IRRIGATION ───────────────────────────────────────────────
  // ⚠⚠ THE CHANNEL HAD NO EFFECT ON ANYTHING. It has been in WORKS since the
  // game shipped, it is one of the three practices a town works out first, and
  // its own description is 'scraped a channel from the water' — but a grep for
  // WORK_AT.channel found exactly two hits: the endowment recipe and a material
  // cost. Nothing ever read it. Same class of bug as the granary nobody walked
  // to, and it had been shipping for longer.
  // What a channel is FOR is moisture, and moisture is the term that gates moss
  // growth — `(0.25 + Q[i] * 0.75)` in _growth. So water infrastructure now
  // does the one thing water infrastructure does: it keeps the ground alive.
  //
  // ⚠ THE DIFFERENCE BETWEEN THE TWO IS THE WHOLE POINT:
  //   • a CHANNEL carries SURFACE water, so it stops working when the pond
  //     drops — it is only ever as good as the weather.
  //   • a WELL reaches GROUNDWATER, so it keeps its ground damp through a
  //     drought that has emptied everything above it.
  // Measured before this: pulling the sheet off took a town of 94 to ZERO in
  // 140 days, on every seed, with no recovery path — the player punished with
  // certain extinction for touching one of the two controls the game offers.
  // The lid still costs exactly what §3.4 says it costs: the rain stops, the
  // air vents, the pond falls. What changes is that a town which dug its wells
  // before the weather turned now has an ANSWER, and a town that did not still
  // dies. That is a cost with a counterplay instead of a trapdoor.
  // ⚠ NO RNG — hot-path sim code.
  _irrigate(F) {
    const N = this.N, Q = this.moist, W = this.water;
    for (const o of this.works) {
      const isWell = o.kind === WORK_AT.well;
      if (!isWell && o.kind !== WORK_AT.channel) continue;
      if (o.prog < WORK_DONE) continue;
      if (!isWell) {
        // a channel with nothing to carry is a ditch
        let src = false;
        const cx = Math.round(o.x), cy = Math.round(o.y), RS = 5;
        for (let dy = -RS; dy <= RS && !src; dy++) for (let dx = -RS; dx <= RS; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          if (W[y * N + x] > 0.02) { src = true; break; }
        }
        if (!src) continue;
      }
      const floor = isWell ? C.IRRIG_WELL : C.IRRIG_CHAN;
      const R = WORKS[o.kind].radius, R2 = R * R;
      const x0 = Math.max(0, Math.round(o.x - R)), x1 = Math.min(N - 1, Math.round(o.x + R));
      const y0 = Math.max(0, Math.round(o.y - R)), y1 = Math.min(N - 1, Math.round(o.y + R));
      for (let y = y0; y <= y1; y++) {
        const dy = y - o.y;
        for (let x = x0; x <= x1; x++) {
          const dx = x - o.x;
          if (dx * dx + dy * dy > R2) continue;
          const i = y * N + x;
          if (Q[i] >= floor) continue;          // never DRIES ground, only wets it
          const v = Q[i] + C.IRRIG_RATE * F;
          Q[i] = v > floor ? floor : v;
        }
      }
    }
  }

  _growth(F) {
    const N = this.N, T = this.temp, M = this.moss, W = this.water, Q = this.moist;
    const light = this.daylight;
    const inv = 1 / (C.MOSS_BAND * C.MOSS_BAND);
    for (let i = 0; i < N * N; i++) {
      if (W[i] > 0.02) { M[i] *= (1 - 0.0015 * F); continue; }
      const dt = T[i] - C.MOSS_IDEAL;
      const heat = 1 - dt * dt * inv;
      if (heat > 0) {
        const g = C.MOSS_GROW * F * heat * (0.25 + Q[i] * 0.75) * light * (0.18 + M[i]) * (1 - M[i]);
        M[i] = M[i] + g > 1 ? 1 : M[i] + g;
      }
      if (T[i] > 47) { const v = M[i] - 0.004 * F; M[i] = v < 0 ? 0 : v; }
      // (tended ground is added after this loop — see _sow)
      // a trodden path does not re-flock, and heals only when nobody uses it
      if (this.worn[i] > 0.02) {
        M[i] *= (1 - Math.min(0.9, this.worn[i]) * 0.004 * F);
        this.worn[i] -= 0.000030 * F;                 // grass comes back if nobody walks
      }
    }
  }

  // -- kin -------------------------------------------------------------------
  _kin() {
    const k = this.k, NN = NEEDS.length, dt = 1 / C.TICKS_PER_DAY;
    let alive = 0, sumB = 0;
    // One cheap pass so _decide never does an O(n²) scan for a rare thing.
    // Reused array, not reallocated — this runs every tick.
    if (!this._gluedNow) this._gluedNow = [];
    this._gluedNow.length = 0;
    for (let id = 0; id < this.count; id++) if (k.alive[id] && k.glued[id]) this._gluedNow.push(id);
    for (let id = 0; id < this.count; id++) {
      if (!k.alive[id]) continue;
      alive++;
      // ⚠️ OUT OF THE WORLD. A held kin still counts as alive and still ages,
      // but it has no tile, so it must not gather, drink, breed, be tended, be
      // chosen as company, or carry anybody. Everything below this line reads
      // this.temp at its position, and its position is meaningless while it is
      // in the air.
      if (this.held && this.held.id === id) { this._heldKin(id, dt); continue; }
      k.age[id] += dt;
      k.cool[id] = Math.max(0, k.cool[id] - dt);

      const g = k.genome.subarray(id * LOCI.length * 2, (id + 1) * LOCI.length * 2);
      const i = this.idx(k.x[id], k.y[id]);
      const T = this.temp[i];
      const band = HIDE_BAND[expressed(g, L.hide)];

      // stage transitions
      if (k.stage[id] === STAGE.EGG) {
        if (T < C.EGG_WARM_MIN) k.need[id * NN + 0] -= dt * 2.2;            // chilling clutch
        if (k.age[id] > C.EGG_DAYS) {
          k.stage[id] = STAGE.NIB;
          this._hatches = (this._hatches || 0) + 1;
          if (this._hatches % 7 === 1) this.log('hatch', `something hatched near the ${this.placeName(i)}.`, 0.55);
        }
      } else if (k.stage[id] === STAGE.NIB && k.age[id] > C.NIB_DAYS) k.stage[id] = STAGE.HALF;
      else if (k.stage[id] === STAGE.HALF && k.age[id] > C.HALF_DAYS) {
        k.stage[id] = STAGE.WHOLE;
        // grown: they keep their childhood bed only if the household has room.
        // Beds count ADULTS, so this is the leaving-home moment — the claim
        // pass will find them somewhere, or they sleep out like everyone did
        // before there were roofs.
        if (k.home[id] >= 0) {
          const h = this.workById(k.home[id]);
          const beds = h && (h.kind === 3 ? 3 : h.kind === 4 ? 6 : 0);
          if (!h || (h.occ || 0) >= beds) { k.home[id] = -1; k.homeTier[id] = 0; }
          else h.occ = (h.occ || 0) + 1;
        }
      }
      else if (k.stage[id] === STAGE.WHOLE && k.age[id] > k.lifespan[id] * 0.85) {
        k.stage[id] = STAGE.RIME;
        this._name(id, `who grew old`);
      }

      // needs decay. ⚠️ Eggs are provisioned and nibs are carried — they cannot
      // walk to the pond, so full decay on the dependent stages wipes every clutch.
      const base = id * NN;
      const st = k.stage[id];
      const rate = st === STAGE.EGG ? 0 : st === STAGE.NIB ? 0.22 : st === STAGE.HALF ? 0.8 : 1;
      if (rate > 0) for (let n = 0; n < NN; n++) k.need[base + n] = Math.max(0, k.need[base + n] - C.DECAY[NEEDS[n]] * dt * rate);

      // ⚠️ THE TOWN REMEMBERS THE HAND. Written here because this is where the
      // kin's own comfort has just been computed — the sign has to come from
      // their body, not from what the player intended.
      if (this.hand && st !== STAGE.EGG) {
        const hdx = this.hand.x - k.x[id], hdy = this.hand.y - k.y[id];
        const hr = this.hand.r * 1.4;
        if (hdx * hdx + hdy * hdy < hr * hr) {
          let v;
          if (T >= band[0] && T <= band[1]) v = 1;                          // this is good ground now
          else if (T > band[1]) v = -Math.min(1, (T - band[1]) / Math.max(1, band[3] - band[1]));
          else v = -0.5 * Math.min(1, (band[0] - T) / Math.max(1, band[0] - band[2]));
          k.memV[id] += (v - k.memV[id]) * dt * 3.4;
          if (Math.abs(v) >= Math.abs(k.memV[id]) * 0.9) { k.memX[id] = this.hand.x; k.memY[id] = this.hand.y; }
          this._placeFelt(this.hand.x, this.hand.y, v * dt * 3.4, k.nameId[id]);
        }
      }

      // warmth is not a decay, it's a reading of where you are standing —
      // and a windbreak is a warm place that is not the finger
      let shelter = 0, mended = false;
      for (const o of this.works) {
        if (o.prog < WORK_DONE) continue;
        const dx = o.x - k.x[id], dy = o.y - k.y[id];
        const R2 = WORKS[o.kind].radius * S;
        if (dx * dx + dy * dy > R2 * R2) continue;
        if (o.kind === WORK_AT.windbreak) shelter = 1;
        else if (o.kind === 3 || o.kind === 4) {
          // a roof shelters its own fully; a stranger in somebody's doorway
          // during a heat press gets most of it, and that is a story
          shelter = Math.max(shelter, k.home[id] === o.id ? 1 : 0.55);
          if (k.home[id] === o.id) {
            k.need[base + 5] = Math.min(1, k.need[base + 5] + 0.0008);       // safe under your own roof
            if (this.daylight < 0.15) k.need[base + 4] = Math.min(1, k.need[base + 4] + 0.0010); // the household, asleep together
          }
        }
        else if ((o.kind === WORK_AT.store || o.kind === WORK_AT.granary)
                 && o.stock > 0.02 && k.need[base + 2] < 0.55) {
          // a granary hands out faster than a heap of food under a stone does
          const give = Math.min(o.stock, o.kind === WORK_AT.granary ? 0.020 : 0.010);
          o.stock -= give; k.need[base + 2] = Math.min(1, k.need[base + 2] + give * 1.6);
        }
        // a bed for the hurt: being near one doesn't feed or warm anybody —
        // it makes RECOVERY faster, read exactly once at the strain decay below
        else if (o.kind === WORK_AT.mend) mended = true;
        // the lit yard: after dark, company and courage where the light is.
        // This is the dynamo's people-facing half; its field-facing half is in
        // _sow. Same shape as the household line above it, deliberately.
        else if (o.kind === WORK_AT.dynamo && this.daylight < 0.15) {
          k.need[base + 4] = Math.min(1, k.need[base + 4] + 0.0008);
          k.need[base + 5] = Math.min(1, k.need[base + 5] + 0.0006);
        }
      }
      const comfort = (T >= band[0] && T <= band[1]) ? 1
        : (1 - Math.min(1, (T < band[0] ? band[0] - T : T - band[1]) / 14)) * (1 - shelter) + shelter * 0.92;
      k.need[base + 0] += (comfort - k.need[base + 0]) * 0.02;

      // STRAIN. ⚠️ An empty need is not death — it is a clock. Instant death at
      // need==0 turns every population overshoot into a total extinction and
      // leaves the player no window to help. Strain is that window.
      let hurt = 0, cause = '';
      if (this.water[i] > 0.14 && k.stage[id] !== STAGE.EGG) { hurt = dt / 0.09; cause = 'water'; }
      else if (T > band[3]) { hurt = dt / 0.35; cause = 'heat'; }
      else if (T < band[2]) { hurt = dt / 0.9; cause = 'cold'; }
      else if (k.need[base + 1] <= 0) { hurt = dt / 1.6; cause = 'thirst'; }
      else if (k.need[base + 2] <= 0) { hurt = dt / 3.2; cause = 'hunger'; }
      if (hurt > 0) {
        k.strain[id] += hurt;
        k.need[base + 5] = Math.max(0, k.need[base + 5] - hurt * 0.9);   // fear reads on the lantern
      } else {
        k.strain[id] = Math.max(0, k.strain[id] - dt / (mended ? C.MEND_RATE : 1.4));
        k.need[base + 5] = Math.min(1, k.need[base + 5] + dt * 0.7);
      }

      if (k.age[id] > k.lifespan[id]) { this._die(id, 'age'); continue; }
      if (k.strain[id] >= 1) { this._die(id, cause || 'hunger'); continue; }

      if (k.stage[id] === STAGE.EGG) { this._lantern(id, g); continue; }

      // a nib follows whoever is raising it, and is fed by being near them
      if (st === STAGE.NIB) {
        let m = k.mother[id];
        if (m < 0 || !k.alive[m] || k.stage[m] < STAGE.HALF) {
          m = -1;
          let bd = 1e9;
          for (let s2 = 0; s2 < 10; s2++) {
            const o = ri(this.rng, this.count);
            if (!k.alive[o] || k.stage[o] < STAGE.HALF) continue;
            const dx = k.x[o] - k.x[id], dy = k.y[o] - k.y[id], d2 = dx * dx + dy * dy;
            if (d2 < bd) { bd = d2; m = o; }
          }
        }
        if (m >= 0) {
          k.tx[id] = k.x[m]; k.ty[id] = k.y[m];
          const dx = k.x[m] - k.x[id], dy = k.y[m] - k.y[id];
          if (dx * dx + dy * dy < 6.25 * S2) {
            for (let n = 1; n < NN; n++) k.need[base + n] = Math.min(1, k.need[base + n] + 0.004);
          }
        }
        this._move(id); this._lantern(id, g); continue;
      }

      // decide — a kin COMMITS to a goal. Re-deciding every tick makes them
      // thrash in place and starve twenty cells from the pond. ⚠️ do not remove.
      k.hold[id] -= 1;
      const band2 = HIDE_BAND[expressed(g, L.hide)];
      // ⚠⚠ STARVING WAS NOT AN EMERGENCY. This gate is what lets a kin ABANDON a
      // committed errand mid-walk, and it only ever watched heat and flood — so a
      // kin that went critical while building or courting kept walking until its
      // commitment hold ran out, which can be hundreds of ticks. That is the real
      // reason for the suite's oldest open failure, 'nobody starves standing in
      // food': they were not blind to the moss, they were BUSY. The survival
      // filter in _decide could never help, because _decide was never reached.
      //
      // ⚠️ The commitment itself stays exactly as it is — 're-deciding every tick
      // makes them thrash in place and starve twenty cells from the pond' is the
      // older, harder-won lesson. This only adds a way OUT of a commitment when
      // the body is actually failing.
      // ⚠️ AND IT ONLY BREAKS A *LONG ERRAND*. The first version made hunger a
      // standing emergency — which re-decides EVERY tick (emergency also skips
      // the %3 throttle below) and walked straight into the oldest warning in
      // this function: 'Re-deciding every tick makes them thrash in place and
      // starve twenty cells from the pond.' Measured: two healthy seeds that
      // reach 300 days went EXTINCT. Once they have turned toward food the
      // emergency is over and ordinary commitment carries them there.
      // ⚠️⚠️ DO NOT ADD GOAL 3 (warm) OR 5 (company) TO THIS SET. It was tried
      // — to catch one kin dying on a warmth errand in a field of food — and it
      // destroyed the game: 7 tests went from passing to "nothing was ever
      // built", "only 0 kin carry any practice", "no practice ever became a
      // tradition". Warmth-seeking is CONSTANT, so including it made hunger the
      // standing emergency this comment already warns about, `_decide` ran every
      // tick, and the town thrashed instead of living. The one starving kin is
      // handled where it belongs — in the food candidate's SCORE in `_decide`,
      // which is only read at a decision point and cannot thrash.
      // This set is exactly "long errands that are not survival": courting,
      // building, hauling, and fetching water.
      const starving = (k.need[base + 2] < 0.15 || k.need[base + 1] < 0.15) &&
        (k.goal[id] === 7 || k.goal[id] === 10 || k.goal[id] === 13 || k.goal[id] === 14);
      const emergency = this.temp[i] > band2[3] - 4 || this.water[i] > 0.07 || starving;
      const satisfied = this._goalMet(id);
      if (k.hold[id] <= 0 || satisfied || (emergency && k.goal[id] !== 6)) {
        if ((this.tick + id) % 3 === 0 || k.hold[id] <= -30 || emergency) this._decide(id, g);
      }
      this._move(id);
      this._act(id, g);
      this._lantern(id, g);
      sumB += k.bright[id];
    }
    // ⚠⚠ RECOUNTED, NOT ACCUMULATED, AND THE FINGERPRINT IS WHY. `alive` above
    // is incremented once per slot as this walk passes it, so it is wrong by
    // construction for the rest of the tick whenever the population changes
    // MID-WALK: `_die` fires after the increment (leaves it high) and a birth
    // can take a freed slot the cursor has already passed (leaves it low).
    // `fingerprint()` folds `this.alive`, but `toJSON` does NOT carry it —
    // `fromJSON` recomputes it from the k.alive bits — so a save written in that
    // gap restored to a DIFFERENT hash than the town it came from, and the
    // harness reported a desync that was purely its own accounting.
    // This file already knew the hazard and patched exactly ONE path for it:
    // `takeAway()` hand-decrements with a comment citing '31 vs 30'. The birth
    // and death paths had the same hole and were unpatched. Measured stale ticks
    // over 90 days: 22 / 32 / 30 / 9 across four seeds, and 0 / 0 / 0 / 0 after.
    // ⚠ It is also read by `_daily`, which runs BEFORE this walk, so a restore
    // landing near a day boundary could take a different narrator branch than the
    // town it was saved from — permanently, via eventCounts.
    let live = 0;
    for (let id2 = 0; id2 < this.count; id2++) if (k.alive[id2]) live++;
    this.alive = live;
    // ⚠ `wellbeing` is stale in exactly the same way and is deliberately LEFT
    // that way: it is not fingerprinted and sim.js never reads it, so recounting
    // it would only cost a second pass.
    this.wellbeing = alive ? sumB / alive : 0;
    if (live > this.stats.peak) this.stats.peak = live;
    this._corpses();
  }

  // -- the weave (bible §7) --------------------------------------------------
  // Runs on a 1 Hz slow lane, never the 15 Hz tick — culture is not a per-frame
  // concern and the bible says so (§20).
  _weave() {
    const k = this.k, NN = NEEDS.length, rng = this.rng;
    const day = this.day;

    // ⚠️ ONE PASS FOR EVERY PRACTICE. This used to be a full sweep of the
    // population per work (nine sweeps), and then the pacing valve added a
    // TENTH sweep per prerequisite per candidate — 200M+ reads over a 300-day
    // run, which turned the test battery from minutes into "is it hung?".
    // Walking the town once and tallying every bit it carries is the same
    // answer for a fraction of the cost, and both readers below share it.
    const hold = this._holdN || (this._holdN = new Int32Array(WORKS.length));
    hold.fill(0);
    for (let id = 0; id < this.count; id++) {
      if (!k.alive[id]) continue;
      const kn = k.knows[id];
      if (!kn) continue;
      for (let q = 0; q < WORKS.length; q++) if (kn & (1 << q)) hold[q]++;
    }

    for (let wi = 0; wi < WORKS.length; wi++) {
      const W = WORKS[wi], pr = this.prac[wi], bit = 1 << wi;

      // ---- is the practice still in anybody's head?
      const holders = hold[wi];
      if (pr.invented >= 0 && holders === 0 && pr.lost < 0) {
        pr.lost = day;
        this.log('lost', `nobody left remembers how they made ${W.name}.`, 4.0);
      }

      // ---- somebody who knows it, working on one that is not finished, is
      //      handled by goal 10. Here we only decide whether anybody TRIES.
      const unfinished = this.works.some(o => o.kind === wi && o.prog < WORK_DONE);
      const mine = this.works.filter(o => o.kind === wi).length;
      const relearning = pr.invented >= 0 && pr.lost >= 0;   // the knowledge is gone
      // a town builds what it has hands for. Fourteen houses for twenty people
      // is not a settlement, it is a labour trap that empties the larder.
      // ⚠⚠ THE 37-STRUCTURE CEILING DIED HERE. The old caps totalled 37
      // buildings maximum EVER — 0.4% of a 9,216-cell board — which is why the
      // town's coverage stalled at 17.6% at day 1000 no matter what. Caps are
      // sanity ceilings now, ROOM scales with hands, and the cap reliever is
      // the game's own signature system: once a practice is TRADITION —
      // institutionalised knowledge — the town builds DENSER (per x0.6). The
      // existing 3-cell spacing check makes LAND the real limit, so the board
      // fills as a town, not as a carpet.
      const perEff = (W.per || 10) * (pr.tradition >= 0 ? 0.6 : 1);
      const room = Math.max(1, Math.min(W.cap, Math.ceil(this.alive / perEff)));
      if (unfinished || (mine >= room && !relearning)) continue;

      // you cannot think of a thing until you know the things it is made of
      if (W.pre) {
        let got = 0;
        for (let q = 0; q < WORKS.length; q++) {
          if (!(W.pre & (1 << q))) continue;
          // ⚠⚠ THE PACING VALVE. `near` means this rung waits for its prerequisite
          // to become a TRADITION — somebody repeating it who was born after the
          // inventor DIED. That is a beautiful rule and it is generational, so
          // measured at 1x speed the first hut landed 83 REAL MINUTES in, the
          // first house at 4.2 HOURS and the hall at 5.8. Nobody was ever going
          // to see the town they were tending.
          //
          // The valve (pre-approved in the spec): a practice ALSO counts as
          // settled once it has been carried by more than the one who thought of
          // it and has stood for a season. That is still 'the town knows this
          // now, not just one clever kin' — it just does not require a funeral
          // first. Real tradition still fires, still logs, and is still the
          // thing that makes a rung build DENSER (see the room formula).
          const pq = this.prac[q];
          const settled = pq.tradition >= 0 ||
            // ⚠️ 30 days here was still MOST of the wait: the store lands ~d11 and
            // the windbreak ~d13, so a 30-day settle put the earliest possible hut
            // at ~d43 before a single kin had even thought of it. At 12 the chain
            // is store -> settled -> hut in about three weeks of board time, which
            // is a evening of play rather than an afternoon.
            (pq.invented >= 0 && day - pq.invented > 12 && hold[q] > 1);
          const held = W.near ? settled : pq.invented >= 0;
          if (held) got++;
        }
        if (got < (W.preN || 1)) continue;
      }

      // ⚠️ PRESSURE, MATERIAL, WITNESSES — the bible's three, and the player
      // controls all three without ever being offered a button. A comfortable
      // town invents nothing, which is the point.
      let best = -1, bestScore = 0;
      for (let id = 0; id < this.count; id++) {
        if (!k.alive[id] || k.stage[id] !== STAGE.WHOLE || k.glued[id]) continue;
        const want = 1 - k.need[id * NN + W.need];
        if (want < W.pressure) continue;
    
    // material: the ground has to have something to work with
        const i = this.idx(k.x[id], k.y[id]);
        const material = wi === WORK_AT.channel
          ? (this.water[i] < 0.02 ? this.moist[i] : 0)     // dry ground beside water
          : this.moss[i];
        if (material < 0.10) continue;
        // witnesses: density. Somebody alone invents nothing worth keeping.
        let seen = 0;
        for (let o = 0; o < this.count; o++) {
          if (!k.alive[o] || o === id || k.stage[o] < STAGE.HALF) continue;
          const dx = k.x[o] - k.x[id], dy = k.y[o] - k.y[id];
          if (dx * dx + dy * dy < 64 * S * S) seen++;
        }
        if (seen < 2) continue;
        const g = k.genome.subarray(id * LOCI.length * 2, (id + 1) * LOCI.length * 2);
        const curious = expressed(g, L.temper) === 'curious' ? 1.9 : 1;
        let sc = want * curious * Math.min(3, seen) * (k.knows[id] & bit ? 0.35 : 1);
        if (W.near) {
          // dwellings want to be near the others — that is what makes a village
          const hx2 = k.x[id] - this.hearth.x, hy2 = k.y[id] - this.hearth.y;
          const dh = Math.sqrt(hx2 * hx2 + hy2 * hy2);
          sc *= Math.max(0.1, 1.7 - dh / (16 * S));
          // and not on top of one that already stands
          for (const o2 of this.works) {
            if (!WORKS[o2.kind].near) continue;
            const ddx = o2.x - k.x[id], ddy = o2.y - k.y[id];
            if (ddx * ddx + ddy * ddy < 9 * S * S) { sc = 0; break; }
          }
        }
        if (sc > bestScore) { bestScore = sc; best = id; }
      }
      if (best < 0) continue;

      // failure teaches: every attempt makes the next one likelier (§7)
      pr.tries++;
      if (rng() > 0.0011 * bestScore * (1 + pr.tries * 0.012)) continue;
      pr.tries = 0;

      const wx = k.x[best], wy = k.y[best];
      const known = (k.knows[best] & bit) !== 0;
      k.knows[best] |= bit;
      // if the board is already full of them, what they worked out is the
      // KNOWLEDGE, not another pile — somebody looked at a thing nobody
      // understood any more and understood it
      if (mine < W.cap) {
        this.works.push({ id: this.workSeq++, kind: wi, x: wx, y: wy, prog: 0, by: k.nameId[best], day, stock: 0 });
      }

      const nm = this._name(best, `who first made ${W.name}`);
      if (pr.invented < 0) {
        pr.invented = day; pr.inventor = k.nameId[best]; pr.inventorGone = -1;
        this.log('invented', `${nm} ${W.made}. nobody had done that before.`, 6.0);
      } else if (pr.lost >= 0) {
        pr.lost = -1; pr.reinvented++;
        this.log('reinvented', `${nm} worked out ${W.name} again, from nothing.`, 5.5);
      } else if (!known) {
        this.log('again', `${nm} made ${W.name} of their own accord.`, 2.2);
      }

      // ⚠️ TRADITION: somebody doing it who cannot possibly have been taught by
      // the person who thought of it. `k.born` finally earns its keep.

    }

    // ---- HOMES: the census and the claims (1 Hz, like everything cultural).
    // Nobody is ever assigned a house. A kin without one takes the nearest
    // standing hut or house with a free bed — an argmax over distance with
    // ties broken by lower work id, so it is deterministic and §18 stays
    // intact: the town does this to itself.
    const BEDS = { 3: 3, 4: 6 };
    // ⚠⚠ A 'WITNESSES ABANDON THEIR HOUSES' ARM WAS BUILT HERE AND REMOVED.
    // MEASURED, DO NOT REBUILD IT. The idea was that the shun cannot reach a
    // settled town because going home is a CLAIM, not a scored goal, so a kin
    // whose house stands on that ground walks back to it every night. True, but
    // releasing the claim made it WORSE, not better: controlled A/B on one seed,
    // time-on-that-ground ratio went 0.958-0.977 (bias alone) to 1.095-1.100
    // (bias + release). A witness stripped of a home does not leave — they become
    // homeless and loiter in the middle of the town, which is exactly where it
    // happened. An independent audit reached the same place from the other end
    // (an unguarded refusal cost 9 of 40 lives).
    // The real defect was in the PICK, and it is fixed at its own site in
    // _decide — see the note there about the uniform top-three.
    for (const o of this.works) o.occ = 0;
    for (let id = 0; id < this.count; id++) {
      if (!k.alive[id] || k.home[id] < 0) continue;
      const h = this.workById(k.home[id]);
      // the house fell, or was never real: the claim dissolves
      if (!h || h.prog < 0.5 || BEDS[h.kind] == null) { k.home[id] = -1; k.homeTier[id] = 0; continue; }
      if (k.stage[id] >= STAGE.WHOLE) h.occ = (h.occ || 0) + 1;   // adults hold beds; children ride along
    }
    for (let id = 0; id < this.count; id++) {
      if (!k.alive[id] || k.home[id] >= 0 || k.glued[id]) continue;
      if (k.stage[id] < STAGE.WHOLE) continue;
      let best = null, bd = 1e9;
      for (const o of this.works) {
        if (BEDS[o.kind] == null || o.prog < WORK_DONE) continue;
        if ((o.occ || 0) >= BEDS[o.kind]) continue;
        const d = Math.abs(o.x - k.x[id]) + Math.abs(o.y - k.y[id]);
        if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && best && o.id < best.id)) { bd = d; best = o; }
      }
      if (!best) continue;
      k.home[id] = best.id; k.homeTier[id] = best.kind; best.occ = (best.occ || 0) + 1;
      const nm = this.nameOf(id);
      if (!this.eventCounts.get('home')) {
        this.log('home', `nobody had lived anywhere before. ${nm} took ${WORKS[best.kind].name} by the ${this.placeName(this.idx(best.x, best.y))} for their own.`, 4.5);
      } else if (!best.claimed) {
        this.log('home', `${nm} took ${WORKS[best.kind].name} by the ${this.placeName(this.idx(best.x, best.y))} for their own.`, 0.9);
      }
      best.claimed = 1;
    }

    // ---- works age, and a finished one feeds or shelters whoever is near
    // ⚠⚠ THE FALL USED TO BE UNREACHABLE. `if (prog < WORK_DONE) continue`
    // sat ABOVE the decay line, so the first decay tick pulled a work under
    // 0.98 and the loop then skipped it forever — every building in the game
    // froze at 0.9799 and 'went back to the ground' had NEVER fired in a
    // shipped build. The contract now: SERVICE gates on standing; DECAY runs
    // on anything that was ever finished, standing or slipping. Construction
    // sites (never finished) do not rot — a town abandons those at whatever
    // height it walked away from, which is its own story. A LIVING town still
    // keeps its works up: _workFor offers anything under WORK_DONE to builders,
    // so a slipping roof gets hands on it long before 0.50 — the fall is for
    // the dead, the empty and the forgotten.
    for (let n = this.works.length - 1; n >= 0; n--) {
      const o = this.works[n], W = WORKS[o.kind];
      if (o.prog >= WORK_DONE) {
        if (o.done == null) o.done = day;             // it stands. leave it alone a while.
        if (o.kind === WORK_AT.store) {
          // the store fills from the ground under it and empties into the hungry
          const i = this.idx(o.x, o.y);
          const take = Math.min(this.moss[i], 0.004);
          this.moss[i] -= take; o.stock = Math.min(STOCK_CAP(o.kind), o.stock + take);
        } else if (o.kind === WORK_AT.granary) {
          // ⚠ A GRANARY GATHERS, IT DOES NOT GRAZE. A store scrapes the single
          // cell under itself, which is why stores sit in a permanent bald spot.
          // A granary takes a little from a ring of cells instead and holds
          // THREE TIMES what a store can — that is the whole point of it, and
          // it is what carries a town through a bad stretch instead of merely
          // smoothing a good one.
          const N2 = this.N, RG = 3, capG = STOCK_CAP(o.kind);
          for (let dy = -RG; dy <= RG; dy++) for (let dx = -RG; dx <= RG; dx++) {
            if (o.stock >= capG) break;
            const x = Math.round(o.x) + dx, y = Math.round(o.y) + dy;
            if (x < 0 || y < 0 || x >= N2 || y >= N2) continue;
            const j = y * N2 + x;
            if (this.moss[j] < 0.45) continue;        // only ever takes a surplus
            const take = Math.min(this.moss[j] - 0.45, 0.0007);
            if (take <= 0) continue;
            this.moss[j] -= take; o.stock = Math.min(capG, o.stock + take);
          }
        }
      }
      if (o.done != null) {
        if (day - o.done > 12) o.prog -= 0.00006;     // nothing keeps itself, eventually
        if (o.prog < 0.50) {
          this.works.splice(n, 1);
          // ⚠️ THE ONE CLEANUP FUNNEL. Everything that references a work by id
          // gets cleared here and only here — a second cleanup site is how two
          // systems end up disagreeing about whether somebody still lives in a
          // house that no longer exists.
          for (let q = 0; q < this.count; q++) {
            if (k.home[q] === o.id) { k.home[q] = -1; k.homeTier[q] = 0; }
          }
          this.log('fell', `${W.name} went back to the ground.`, 2.6);
        }
      }
    }
  }

  // ⚠️ a linear scan, NOT a Map cache. A cache would have to be rebuilt in
  // fromJSON and invalidated at every splice, and a stale cache here is a
  // wrong-home bug that only shows days after a save load. works stays small
  // (tens), so the scan is nothing.
  workById(id) {
    for (const o of this.works) if (o.id === id) return o;
    return null;
  }

  // ⚠️ there WAS a `_holders(wi)` helper here — a full population sweep for one
  // practice. It is gone on purpose: `_weave` tallies every practice in a single
  // pass into `hold[]` at the top, and a per-practice sweep sitting next to it is
  // exactly the shape that made the pacing valve cost 200M reads a run. If you
  // need a holder count, you are already inside `_weave` and it is `hold[q]`.

  // has anybody who knew this practice died? the tradition clock starts there
  _weaveDeath(id) {
    const k = this.k;
    for (let wi = 0; wi < WORKS.length; wi++) {
      const pr = this.prac[wi];
      if (pr.inventor >= 0 && pr.inventorGone < 0 && k.nameId[id] === pr.inventor) {
        pr.inventorGone = this.day;
      }
    }
  }

  // the nearest work this kin knows how to make and that wants hands
  // ⚠️ TWO THRESHOLDS, NOT ONE. WORK_DONE is when a thing counts as standing
  // and stops being offered to the town; 1.0 is when the person actually on it
  // puts their tools down. With a single threshold they released at 0.98 and
  // decay immediately pulled it under again, so every work in the game
  // oscillated around the line and half of them read as unfinished at any
  // instant. Somebody already building finishes the job.
  _workFor(id) {
    const k = this.k;
    // already on one? then carry on until it is actually done
    if (k.goal[id] === 10) {
      for (const o of this.works) {
        if (o.prog >= 1 || !(k.knows[id] & (1 << o.kind))) continue;
        const d = Math.abs(o.x - k.x[id]) + Math.abs(o.y - k.y[id]);
        if (d < 2.2 * S) return { work: o, d };
      }
    }
    let best = null, bd = 1e9;
    for (const o of this.works) {
      if (o.prog >= WORK_DONE) continue;              // standing — leave it be
      if (!(k.knows[id] & (1 << o.kind))) continue;
      const d = Math.abs(o.x - k.x[id]) + Math.abs(o.y - k.y[id]);
      if (d < bd) { bd = d; best = o; }
    }
    return best ? { work: best, d: bd } : null;
  }

  _lantern(id, g) {
    const k = this.k, NN = NEEDS.length, base = id * NN;
    let worst = 0, wv = 1;
    for (let n = 0; n < NN; n++) if (k.need[base + n] < wv) { wv = k.need[base + n]; worst = n; }
    let mean = 0; for (let n = 0; n < NN; n++) mean += k.need[base + n];
    mean /= NN;
    const gh = LANTERN_HUE[expressed(g, L.lantern)];
    const nh = NEED_HUE[NEEDS[worst]];
    const mix = Math.min(1, Math.max(0, (0.72 - wv) / 0.72));
    // shortest-arc hue blend
    let d = nh - gh; if (d > 180) d -= 360; if (d < -180) d += 360;
    k.hue[id] = (gh + d * mix + 360) % 360;
    k.bright[id] = 0.12 + mean * 0.88;
    const alarm = k.goal[id] === 6 ? 1 : 0;
    k.pulse[id] = 0.4 + (1 - mean) * 1.3 + alarm * 1.2;
  }

  // goals: 0 wander 1 eat 2 drink 3 warm 4 rest 5 company 6 flee 7 mate 8 bury
  _decide(id, g) {
    const k = this.k, NN = NEEDS.length, base = id * NN, rng = this.rng;
    const x = k.x[id], y = k.y[id];
    const cand = [];
    const push = (goal, tx, ty, score) => { if (score > 0) cand.push({ goal, tx, ty, score }); };

    const deficit = (n) => { const v = 1 - k.need[base + n]; return v * v; };

    // food: they look close by first and only range wide when they're actually
    // hungry. ⚠️ A fixed 9-cell window starves a clustered colony to death in a
    // jar that is 60% covered in moss — they overgraze home and never look up.
    // ⚠⚠ LOOK UNDERFOOT BEFORE LOOKING FAR. This search used to be 18 random
    // samples inside a box whose radius GREW with hunger — up to ±49 cells, which
    // is the entire board. Eighteen darts thrown at 9,216 cells is a 0.2% sample,
    // so a starving kin almost never found the moss it was standing on and set
    // off across the layout toward whichever distant cell it happened to hit.
    // The hungrier they got, the WORSE they searched. Measured consequence:
    // hunger was 67-75% of every death in the game, on a board sitting at 291%
    // moss cover, and the suite's own 'nobody starves standing in food' test was
    // the thing that finally pinned it.
    //
    // An animal checks where it is first. The near scan is exhaustive and cheap
    // (a 7x7 at S=1.5, ~49 reads, on a decide that runs every third tick), and
    // the wide random search only runs when there is genuinely nothing here.
    const hunger = 1 - k.need[base + 2];
    let bm = 0, bmx = x, bmy = y;
    const NR = Math.max(1, Math.round(2.5 * S));
    for (let dy = -NR; dy <= NR; dy++) for (let dx = -NR; dx <= NR; dx++) {
      const px = x + dx, py = y + dy;
      const i = this.idx(px, py);
      if (this.water[i] > 0.05) continue;
      const d = Math.abs(dx) + Math.abs(dy);
      const v = this.moss[i] / (1 + d * 0.09 / S);
      if (v > bm) { bm = v; bmx = px; bmy = py; }
    }
    // ⚠️⚠️ THE MIDDLE DISTANCE. Measured on seed bat0 at day 300: SEVENTEEN kin
    // starving to death, every one of them in the same overgrazed corner with
    // moss 0.00–0.11 underfoot and SATURATED moss (1.00) five to eight cells
    // away. The near scan above only reaches 4 cells, and the wide fallback
    // below is 18 random samples in a box that grows with hunger — at hunger 1
    // that box is 99x99, so those 18 samples cover 0.18% of it and essentially
    // never find a patch six cells away. Desperation made them search WORSE.
    //
    // So: before the sparse guess, look properly at the middle distance. Strided
    // by 2 to keep it ~150 reads, and only for a kin the near scan already
    // failed — an animal that cannot find food underfoot lifts its head before
    // it runs blindly. Consumes no rng, so on its own it cannot move the stream;
    // it moves only by making the wide branch unnecessary, which is the point.
    if (bm < 0.22) {
      const MR = Math.max(2, Math.round(9 * S));
      for (let dy = -MR; dy <= MR; dy += 2) for (let dx = -MR; dx <= MR; dx += 2) {
        const px = x + dx, py = y + dy;
        const i = this.idx(px, py);
        if (this.water[i] > 0.05) continue;
        const d = Math.abs(dx) + Math.abs(dy);
        const v = this.moss[i] / (1 + d * 0.09 / S);
        if (v > bm) { bm = v; bmx = px; bmy = py; }
      }
    }

    // ⚠⚠ THE GRANARY NOBODY WALKED TO. Stores and granaries only ever fed kin
    // who were ALREADY standing next to them — nothing in the goal system could
    // ever choose one as a destination, because this scan could only see wild
    // moss. So a town could hold four full granaries and still starve, with
    // hungry kin walking straight past them to graze a bare patch. Going to the
    // store when you are hungry is the entire reason to build one, and it did
    // not work: measured on bat0 day 300, 11 of 21 kin were on the EAT goal
    // standing on 0.003 moss with the nearest food eight cells away.
    // A stocked store now competes as a forage target on the same distance
    // curve as a patch of ground.
    // ⚠ gated on `bm < 0.7` so a kin already standing in good food is not
    // marched across the board, and skipped entirely once the town has nothing
    // stored. Consumes NO rng — like the middle-distance scan above, it can
    // only move the stream by making the wide branch unnecessary.
    {
      for (const o of this.works) {
        if (o.kind !== WORK_AT.store && o.kind !== WORK_AT.granary) continue;
        if (o.prog < WORK_DONE || o.stock <= 0.05) continue;
        const d = Math.abs(o.x - x) + Math.abs(o.y - y);
        if (d > 22 * S) continue;
        // stock runs 0..1 in a store and 0..3 in a granary, so a full store
        // reads as saturated ground and a full granary beats any patch on the
        // board — which is exactly the promise a granary is supposed to make.
        // ⚠ NORMALISED AGAINST THE STORE'S OWN CAPACITY, not against raw stock.
        // Raw stock made a granary read as 0.14 when it held a seventh of a
        // winter's food, so wild moss beat it and nobody ever walked to the
        // building the whole age is named after. A store that is HALF FULL
        // should read like half-decent ground; a full granary should beat any
        // patch on the board, because it is better than any patch on the board.
        const full = o.stock / STOCK_CAP(o.kind);
        const v = (0.35 + full * 1.05) / (1 + d * 0.09 / S);
        if (v > bm) { bm = v; bmx = o.x; bmy = o.y; }
      }
    }

    // ⚠️ the wide search is a FALLBACK, not the default. It still consumes the
    // same rng draws it always did, so the stream only shifts when the branch is
    // actually skipped — and it is skipped precisely when they are standing in
    // food, which is the case that was killing them.
    if (bm < 0.22) {
      const R = (7 + hunger * hunger * 26) * S;
      const near2 = 0.6 - hunger * 0.45;
      for (let q = 0; q < 18; q++) {
        const px = x + rr(rng, -R, R), py = y + rr(rng, -R, R);
        const i = this.idx(px, py);
        if (this.water[i] > 0.05) continue;
        const d = Math.abs(px - x) + Math.abs(py - y);
        const v = this.moss[i] / (1 + d * near2 * 0.2 / S);
        if (v > bm) { bm = v; bmx = px; bmy = py; }
      }
    }
    // ⚠️ A "famine" weight was tried here — food scored up to 2.6x below need
    // 0.15 — to catch kin choosing a warmth errand over poor moss. It measured
    // WORSE (starving-in-food 1 → 5): weighting the score harder just makes
    // them re-target between patches at successive decisions and arrive at
    // neither. The real cause was never the choice, it was `_act` case 1
    // refusing the meal when they stopped one cell short of it. Fix the mouth,
    // not the appetite.
    push(1, bmx, bmy, deficit(2) * (0.3 + bm * 2.6));

    // — the crumb. A bounded nearest-of-N so the hot loop stays cheap; there are
    // never more than a dozen of these and usually none.
    if (this.gifts.length) {
      let bg = null, bd = 1e9;
      for (const gf of this.gifts) {
        const d = Math.abs(gf.x - x) + Math.abs(gf.y - y);
        if (d < bd) { bd = d; bg = gf; }
      }
      // it outscores grazing when they are hungry and it is close, and loses to
      // moss underfoot when it is halfway across the board — which is what makes
      // it a place worth walking to rather than a button that feeds everybody.
      // ⚠️⚠️ SOMEBODY ALWAYS GOES TO LOOK AT A NEW THING. This score used to be
      // `deficit(2) * 3.4` alone, and `deficit` is (1 − need)² — so at food 0.9
      // a crumb scored ONE PERCENT of its maximum and a well-fed town walked
      // straight past it. Every steering tool the player had was keyed to a
      // DEFICIT, which means the better you played the less influence you had:
      // the moment the town was thriving there was nothing left to do but
      // watch. That is the "it's not fun" complaint stated as an equation.
      // A small need-independent term fixes it, and it spends an allele that
      // has been sitting in the genome doing almost nothing — `temper: curious`
      // is read in exactly one other place in the whole simulation. Now the
      // curious ones are the ones who come and look, which is also the first
      // time a player can hover two toys and see a reason they differ.
      // ⚠️ `g` is already this kin's genome slice — _decide takes it as its
      // second argument and reads L.hide from it below. Re-slicing it here
      // would cost a subarray on every decision for nothing.
      if (bg) {
        const nosy = expressed(g, L.temper) === 'curious' ? 0.55 : 0.12;
        push(11, bg.x, bg.y, (deficit(2) * 3.4 + nosy) / (1 + bd * 0.055 / S));
      }
    }

    // water: the pond, or the nearest wet cell
    // ⚠️ Drink from the BANK, not from the middle of the pond. Targeting water
    // itself walks them into the low end, and then it rains and they drown.
    const thirst = 1 - k.need[base + 1];
    const RW = (10 + thirst * thirst * 26) * S;
    let bw = 0, bwx = x, bwy = y;
    for (let s = 0; s < 18; s++) {
      const px = x + rr(rng, -RW, RW), py = y + rr(rng, -RW, RW);
      const i = this.idx(px, py);
      if (this.water[i] > 0.03) continue;                    // that's the pond, not the bank
      let beside = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const w = this.water[this.idx(px + dx * 1.4 * S, py + dy * 1.4 * S)];
        if (w > beside) beside = w;
      }
      if (beside <= 0.004) continue;
      const d = Math.abs(px - x) + Math.abs(py - y);
      const v = Math.min(0.2, beside) / (1 + d * 0.1 / S);
      if (v > bw) { bw = v; bwx = px; bwy = py; }
    }
    // ⚠⚠ THE WELL NOBODY WALKED TO — the same defect as the granary, a third
    // time, and it is the entire reason an uncovered board was a death sentence.
    // The scan above looks only for a BANK: a dry cell with water beside it. A
    // well is neither, so nothing here could ever choose one. A thirsty kin
    // would walk straight past the well its own town had dug, head for a pond
    // that had already evaporated, and die of thirst standing on the mud.
    // MEASURED: sheet off at day 60, a town of 90 went to ZERO in 40 days with
    // FIVE STANDING WELLS on the board and moss sitting at 0.79 — they were not
    // starving and they were not homeless, they simply could not find a drink
    // they had already built.
    // A well never runs dry and never has a far bank, so it scores at the cap a
    // perfect bank would: near one, it wins; far away, a real bank still beats it.
    for (const o of this.works) {
      if (o.kind !== WORK_AT.well || o.prog < WORK_DONE) continue;
      const d = Math.abs(o.x - x) + Math.abs(o.y - y);
      if (d > 30 * S) continue;
      const v = 0.2 / (1 + d * 0.1 / S);
      if (v > bw) { bw = v; bwx = o.x; bwy = o.y; }
    }

    if (bw <= 0) {
      // no bank found nearby — head for the pond's edge, not its middle
      const dx = x - this.pond.x, dy = y - this.pond.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      bwx = this.pond.x + (dx / d) * 6 * S; bwy = this.pond.y + (dy / d) * 6 * S; bw = 0.09;
    }
    // ⚠️⚠️ A REACHABILITY GATE WAS TRIED HERE AND REMOVED. MEASURED, DO NOT
    // REBUILD IT WITHOUT READING THIS. The idea was sound — `_move` walks a
    // straight line with no pathfinder, so a bank across a lake is not a bank —
    // and it failed in both directions, 4 seeds x 120 days:
    //   HEAD (no gate)   Central Park 236 alive / 109 standing, 11 drowned,  0 thirst
    //   hard gate        Central Park 171 alive /  90 standing,  0 drowned,  4 thirst
    //   soft gate (x0.25) Central Park 232 alive / 103 standing,  1 drowned, 13 thirst
    // The hard gate rejected the only bank on a map that is mostly reservoir and
    // cost SIXTY-FIVE kin. Softening it to a preference gave the population back
    // and then converted the drownings into MORE thirst deaths than the drownings
    // it prevented. Neither beat doing nothing.
    // The real defect was never target CHOICE, it was that `_move` would wade
    // into water that kills — which is fixed in `_move` itself, locally, and
    // costs nothing. Fix the walk, not the wanting.
    push(2, bwx, bwy, deficit(1) * (0.9 + bw * 8));

    // warmth: sample for a cell inside the comfort band
    const band = HIDE_BAND[expressed(g, L.hide)];
    let bt = 0, btx = x, bty = y;
    for (let s = 0; s < 12; s++) {
      const px = x + rr(rng, -11 * S, 11 * S), py = y + rr(rng, -11 * S, 11 * S);
      const i = this.idx(px, py), T = this.temp[i];
      if (T > band[3] - 3 || T < band[2] + 2) continue;
      const inb = (T >= band[0] && T <= band[1]) ? 1 : 0.25;
      const d = Math.abs(px - x) + Math.abs(py - y);
      const v = inb / (1 + d * 0.12 / S);
      if (v > bt) { bt = v; btx = px; bty = py; }
    }
    push(3, btx, bty, deficit(0) * (0.2 + bt * 2.2));

    // rest: stay put
    push(4, x, y, deficit(3) * 1.1);

    // company: nearest other kin
    let bc = 0, bcx = x, bcy = y;
    for (let s = 0; s < 16; s++) {
      const o = ri(rng, this.count);
      if (!k.alive[o] || o === id || k.stage[o] === STAGE.EGG) continue;
      const dx = k.x[o] - x, dy = k.y[o] - y, d = Math.sqrt(dx * dx + dy * dy);
      const v = 1 / (1 + d * 0.16 / S);
      if (v > bc) { bc = v; bcx = k.x[o]; bcy = k.y[o]; }
    }
    push(5, bcx, bcy, deficit(4) * (0.3 + bc * 1.4));

    // flee: too hot, too wet
    const here = this.idx(x, y);
    if (this.temp[here] > band[3] - 4 || this.water[here] > 0.07) {
      let ex = x, ey = y, best = -1e9;
      for (let s = 0; s < 18; s++) {
        const px = x + rr(rng, -14 * S, 14 * S), py = y + rr(rng, -14 * S, 14 * S);
        const i = this.idx(px, py);
        const sc = -Math.max(0, this.temp[i] - band[1]) - this.water[i] * 60 + this.eff(i) * 3;
        if (sc > best) { best = sc; ex = px; ey = py; }
      }
      push(6, ex, ey, 3.4);
    }

    // mate
    // home at dusk: the whole town walks toward its own lit windows at
    // nightfall. Zero rng — the score is daylight and tiredness, nothing else.
    if (k.home[id] >= 0) {
      const h = this.workById(k.home[id]);
      if (h) {
        // ⚠⚠ TRACED, NOT TUNED: three kin followed through a full night chose
        // warmth, food and water over 'rest at home' every re-decide — their
        // rest stays high all night, so a rest-only pull NEVER wins. Night is
        // COLD, and home IS the warm place (the shelter branch warms its own),
        // so the pull rides the warmth deficit too. And it stands aside when
        // they are hungry or dry — bed must never outrank the empty cup.
        if (k.need[base + 2] > 0.32 && k.need[base + 1] > 0.32) {
          const nightPull = (1 - this.daylight) * (0.95 + deficit(3) * 2.2 + deficit(0) * 2.6);
          if (nightPull > 0.25) push(4, h.x, h.y, nightPull);
        }
      }
    }
    const mean = (() => { let m = 0; for (let n = 0; n < NN; n++) m += k.need[base + n]; return m / NN; })();
    if (!k.glued[id] && k.stage[id] === STAGE.WHOLE && k.cool[id] <= 0 && mean > C.BREED_MIN && k.sex[id] === 0) {
      let mx = x, my = y, mi = -1, bv = 0;
      for (let s = 0; s < 20; s++) {
        const o = ri(rng, this.count);
        if (!k.alive[o] || o === id || k.sex[o] !== 1 || k.stage[o] !== STAGE.WHOLE || k.cool[o] > 0) continue;
        const dx = k.x[o] - x, dy = k.y[o] - y, d = Math.sqrt(dx * dx + dy * dy);
        const v = 1 / (1 + d * 0.1 / S);
        if (v > bv) { bv = v; mx = k.x[o]; my = k.y[o]; mi = o; }
      }
      // a housed pair courts more readily — a door to close is most of a family.
      // The multiplier is on the SCORE, never on an rng draw, so the stream is
      // untouched and two clients agree.
      const settledBoost = (k.home[id] >= 0 && k.home[mi >= 0 ? mi : id] >= 0) ? 1.35 : 1;
      if (mi >= 0) { push(7, mx, my, (mean - C.BREED_MIN) * 5.2 * settledBoost); k.goalT[id] = mi; }
    }

    // bury: someone has to — but only ONE someone per body.
    // ⚠️⚠️ THE BURIAL SPIRAL. Without claims, a third of the colony drops
    // everything to carry a single corpse, stops eating, and dies. Then there
    // are more corpses. A colony of 99 went to 4 in fifteen days this way.
    // And a hungry kin does not do funerals.
    // ⚠️⚠️ NOT IF YOU CANNOT WALK. `_act` measures `near` as distance to the
    // TARGET, and a glued kin's target is pinned to its own feet — so `near` is
    // unconditionally true for them and they performed errands at any range.
    // Measured before the guard: the one who stays carried 13-31% of every
    // funeral in the game, from up to 31 cells away, without moving. Their own
    // chronicle read "Ruvwu carried Brim to the yard" eleven days above
    // "the only journey Ruvwu ever took". Goals 7/8/9 all require ARRIVING.
    if (!k.glued[id] && this.corpses.length && k.stage[id] >= STAGE.WHOLE && k.need[base + 2] > 0.55) {
      let best = null, bd = 1e9;
      for (const c of this.corpses) {
        // ⚠️ a claimer who wandered off still held the corpse forever, so nobody
        // else could ever come for it. A claim only stands while they are on it.
        if (c.claim >= 0 && c.claim !== id && k.alive[c.claim] && k.goal[c.claim] === 8) continue;
        const d = Math.abs(c.x - x) + Math.abs(c.y - y);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) push(8, best.x, best.y, 1.35 * k.need[base + 2] / (1 + bd * 0.08 / S));
    }

    // tend: the one who stays cannot come to you, so somebody has to go.
    // ⚠️⚠️ THIS IS THE BURIAL SPIRAL WEARING A DIFFERENT COAT. A compelling
    // errand with no claim and no exit condition emptied the colony in testing:
    // peak 86 fell to 14 and every single kin died, because tenders committed
    // forever and stopped eating. The two fixes are the ones the corpse system
    // already proved — ONE carer at a time (k.tender), and a satisfaction
    // condition in _goalMet — plus the fed-only gate below. Do not remove any
    // of the three. Measured good: mean 0.5 tenders, colony peak 94.
    if (this._gluedNow.length && !k.glued[id] && k.stage[id] >= STAGE.WHOLE
        && k.need[base + 2] > 0.45 && k.need[base + 1] > 0.45) {
      for (let gi = 0; gi < this._gluedNow.length; gi++) {
        const t = this._gluedNow[gi];
        if (t === id) continue;
        const cl = k.tender[t];
        if (cl >= 0 && cl !== id && k.alive[cl] && k.goal[cl] === 9) continue;   // claimed
        let worst = 1;
        for (let n = 1; n < NN; n++) { const v = k.need[t * NN + n]; if (v < worst) worst = v; }
        if (worst > 0.8) continue;                                              // they're seen to
        const d = Math.abs(k.x[t] - x) + Math.abs(k.y[t] - y);
        cand.push({ goal: 9, tx: k.x[t], ty: k.y[t], who: t, score: (1 - worst) * 2.5 / (1 + d * 0.06 / S) });
      }
    }

    // work: something they know how to make is standing half-finished
    if (!k.glued[id] && k.stage[id] >= STAGE.WHOLE && k.need[base + 2] > 0.35 && k.need[base + 1] > 0.35) {
      const w = this._workFor(id);
      if (w) cand.push({ goal: 10, tx: w.work.x, ty: w.work.y,
                         score: 1.15 / (1 + w.d * 0.05 / S) });
    }

    // ⚠️ MEMORY BIASES WHERE THEY CHOOSE TO GO — it cannot weight paths,
    // because _move walks a straight line at tx,ty and there are no routes to
    // weight. Biasing the choice is enough: what the player eventually notices
    // is that the town has stopped using a place, and nothing ever told them.
    if (k.memV[id] !== 0 && k.memX[id] >= 0) {
      const mv = k.memV[id], mx = k.memX[id], my = k.memY[id], MR = 6 * S;
      const mul = Math.max(0.3, Math.min(1.6, 1 + mv * 0.6));
      for (const c of cand) {
        const ddx = c.tx - mx, ddy = c.ty - my;
        if (ddx * ddx + ddy * ddy > MR * MR) continue;
        c.score *= mul;
      }
      // a place that was kind to them is somewhere to go back to
      if (mv > 0.4) cand.push({ goal: 3, tx: mx, ty: my, score: deficit(0) * mv * 1.7 });
    }

    // ⚠️⚠️ THE GROUND WHERE SOMEBODY WAS TAKEN. `k.saw` is the town's memory of
    // watching a person be lifted out of the world and not come back — the one
    // irreversible thing the player can do, deliberately EXEMPT from the daily
    // decay that fades everything else ("the hand is forgotten; the one it took
    // is not"). It has been written since the take shipped and READ BY NOTHING:
    // grep gave one write, one fingerprint fold, and zero consumers. You could
    // take somebody in front of forty witnesses and the town's behaviour was
    // byte-for-byte what it would have been.
    // It gets exactly the read memV already has, at the same site and with the
    // same shape. What a player eventually notices is that the town has stopped
    // walking over the place where it happened, and that the paths grew back —
    // and nothing ever told them why. That is P2 working, not P3 breaking.
    if (this._lifted && k.saw[id] < -0.35) {
      const lx = this._lifted.x, ly = this._lifted.y, LR = 6 * S;
      const shun = Math.max(0.25, 1 + k.saw[id] * 0.35);
      const nearTake = (c) => {
        const ddx = c.tx - lx, ddy = c.ty - ly;
        return ddx * ddx + ddy * ddy <= LR * LR;
      };
      for (const c of cand) if (nearTake(c)) c.score *= shun;
      // ⚠⚠ THE MULTIPLIER ALONE IS A ~2% NO-OP, AND THE REASON IS THE PICK, NOT
      // THE WEIGHT. The choice below is `cand[ri(rng, Math.min(3, cand.length))]`
      // — UNIFORM OVER THE TOP THREE — so demoting a candidate from first to
      // third changes its odds by exactly nothing. Only EVICTION from that set
      // matters, and a 0.65-0.81 multiplier on ~5.5 candidates rarely achieves
      // it. Measured before this: the take moved time-on-that-ground by 1-2%
      // even counting only the 43 kin who actually witnessed it, at every radius
      // from 1 to 9 cells. The read existed; the read did nothing.
      // So a witness who is not desperate does not go there AT ALL.
      // ⚠ GUARDED BY THE SAME CRITICAL BAND as the survival override below, or
      // this becomes a starvation bug: an unguarded refusal was measured at 31.1
      // alive against 40.5. With the guard there is no population cost at all
      // (45/43, 46/46, 17/17, 33/34, 14/14, 32/32 across six seeds) and the
      // avoidance is real: ratios 0.194-0.764, six seeds out of six.
      // They can still EAT on that ground rather than starve beside it.
      if (k.need[base + 2] >= 0.15 && k.need[base + 1] >= 0.15) {
        const away = cand.filter(c2 => !nearTake(c2));
        if (away.length) { cand.length = 0; for (const c2 of away) cand.push(c2); }
      }
    }

    if (!cand.length) {
      k.goal[id] = 0;
      k.tx[id] = k.glued[id] ? x : x + rr(rng, -4 * S, 4 * S);
      k.ty[id] = k.glued[id] ? y : y + rr(rng, -4 * S, 4 * S);
      k.hold[id] = 90; return;
    }
    // rank, then pick randomly from the top three (The Sims' trick, §6.1)
    // ⚠⚠ THE SURVIVAL OVERRIDE. Found by test: a starving kin chose goal 10
    // (building) over eating and died with its tools out. The empty-cup rule
    // existed for the tend and carry errands, but nothing stopped a LONG
    // DISCRETIONARY errand outranking food once the nearby moss was grazed thin
    // and the food score was distance-damped into the floor.
    //
    // ⚠️ MEASURED TWICE. The first version whitelisted eat/drink/flee below
    // 0.25 — and it gutted the weave: 14.2% of adult-days sit under 0.25 on a
    // struggling town, building is only 1.2% of adult-days to begin with, and
    // locking those days out meant works never finished, 'stands' never fired,
    // and practices never spread past their inventor (two culture tests went
    // red). A hungry town must still be able to BUILD ITS WAY OUT — that is the
    // whole engine. So this blacklists only the long, deferrable errands, at a
    // threshold that means genuinely critical rather than merely hungry.
    if (k.need[base + 2] < 0.15 || k.need[base + 1] < 0.15) {
      const pool = cand.filter(c2 => c2.goal !== 7 && c2.goal !== 10 && c2.goal !== 13 && c2.goal !== 14);
      if (pool.length) { cand.length = 0; for (const c2 of pool) cand.push(c2); }
    }
    cand.sort((a, b) => b.score - a.score);
    const c = cand[ri(rng, Math.min(3, cand.length))];
    const cc = (this.N - 1) / 2, lim2 = (this.N - 1) * 0.43;
    let tdx = c.tx - cc, tdy = c.ty - cc;
    const td = Math.sqrt(tdx * tdx + tdy * tdy);
    if (td > lim2) { const f = lim2 / td; c.tx = cc + tdx * f; c.ty = cc + tdy * f; }
    k.goal[id] = c.goal; k.tx[id] = c.tx; k.ty[id] = c.ty;
    if (c.goal === 8) {                       // stake the claim so nobody else comes
      for (const co of this.corpses) if (co.x === c.tx && co.y === c.ty) { co.claim = id; break; }
    }
    if (c.goal === 9) { k.goalT[id] = c.who; k.tender[c.who] = id; }
    // the one who stays wants things like anyone else and can only ever have
    // what is already underfoot — or what somebody brings, or what you tilt to them
    if (k.glued[id]) { k.tx[id] = x; k.ty[id] = y; }
    // commitment: long enough to actually walk somewhere, short enough to change your mind
    const dist = Math.abs(c.tx - x) + Math.abs(c.ty - y);
    k.hold[id] = c.goal === 6 ? 120 : (60 + dist / C.SPEED * 1.4);
  }

  // Has the current goal been served? Used to release commitment early.
  _goalMet(id) {
    const k = this.k, NN = NEEDS.length, b = id * NN;
    switch (k.goal[id]) {
      case 1: return k.need[b + 2] > 0.93;
      case 11: return k.need[b + 2] > 0.93 || !this.gifts.length;
      // arrived where they were called to. Nothing else releases it — that is
      // what makes a call something you watch happen rather than a suggestion.
      case 12: return Math.abs(k.tx[id] - k.x[id]) + Math.abs(k.ty[id] - k.y[id]) < 1.6 * S;
      case 2: return k.need[b + 1] > 0.93;
      case 3: return k.need[b + 0] > 0.93;
      case 4: {
        // ⚠️ rest fills in ~30 ticks and the night is 300+, so a kin who walked
        // home at dusk was rested and GONE by midnight — measured: 2 of 18 housed
        // kin were home at night, and raising the dusk pull made it WORSE. The
        // fix is not a stronger pull, it is that sleep lasts the night: at home,
        // in the dark, rest does not release. Emergencies still override in the
        // decide gate, and the hungry never chose bed in the first place.
        // ⚠️ AND THE LOCK RELEASES THE HUNGRY. The first version held anyone at
        // home all night regardless — a starving kin slept until morning, which
        // is the burial spiral wearing pyjamas (caught by the empty-cup gate
        // test choosing goal 4 over food). Bed keeps nobody who needs the pond.
        if (this.daylight < 0.15 && k.home[id] >= 0 &&
            k.need[b + 2] > 0.32 && k.need[b + 1] > 0.32) {
          const h = this.workById(k.home[id]);
          if (h && Math.abs(h.x - k.x[id]) + Math.abs(h.y - k.y[id]) < WORKS[h.kind].radius * S) return false;
        }
        return k.need[b + 3] > 0.93;
      }
      case 5: return k.need[b + 4] > 0.93;
      case 6: { const i = this.idx(k.x[id], k.y[id]); return this.water[i] < 0.05 && this.temp[i] < 38; }
      // ⚠️ THE EMPTY CUP. The fed-only gate on errands is checked when the goal
      // is CHOSEN, but an errand is a walk — a kin can set out well fed, cross
      // the town, and arrive starving. Caught by test: 'a hungry kin does not
      // run errands' failed on the tend goal. Both errands now release the
      // moment the carer is themselves in trouble. You cannot pour from an
      // empty cup, and a colony that forgets this is the burial spiral again.
      case 8:
        if (k.need[b + 2] < 0.35 || k.need[b + 1] < 0.35) return true;
        return !this.corpses.some(c => c.claim === id);
      case 10: {                              // the work is done, or gone
        const w = this._workFor(id);
        return !w;
      }
      case 9: {                               // ⚠️ without this they hold to expiry and starve
        if (k.need[b + 2] < 0.35 || k.need[b + 1] < 0.35) return true;
        const t = k.goal[id] === 9 ? (k.goalT[id] | 0) : -1;
        if (t < 0 || !k.alive[t] || !k.glued[t]) return true;
        let worst = 1;
        for (let n = 1; n < NN; n++) { const v = k.need[t * NN + n]; if (v < worst) worst = v; }
        return worst > 0.85;                  // they are seen to. go live your life.
      }
      default: return false;
    }
  }

  _move(id) {
    const k = this.k;
    if (k.glued[id]) return;                  // the one who stays. never moves.
    const dx = k.tx[id] - k.x[id], dy = k.ty[id] - k.y[id];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.35 * S) return;
    let sp = C.SPEED * (k.stage[id] === STAGE.NIB ? 1.25 : k.stage[id] === STAGE.HALF ? 1.15 : k.stage[id] === STAGE.RIME ? 0.72 : 1);
    if (k.goal[id] === 6) sp *= 1.8;
    const i = this.idx(k.x[id], k.y[id]);
    if (this.water[i] > 0.03) sp *= 0.45;
    // downhill on a tilted world is faster and less voluntary
    const gx = this.eff(this.idx(k.x[id] + 1, k.y[id])) - this.eff(this.idx(k.x[id] - 1, k.y[id]));
    const gy = this.eff(this.idx(k.x[id], k.y[id] + 1)) - this.eff(this.idx(k.x[id], k.y[id] - 1));
    const slide = 2.4;
    // ⚠️⚠️⚠️ THEY WALK STRAIGHT THROUGH LAKES AND SOMETIMES DROWN. THAT IS
    // KNOWN, IT IS REAL, AND THREE FIXES FOR IT ALL MEASURED WORSE THAN LEAVING
    // IT ALONE. Read this before writing the fourth.
    //
    // The bug: `_move` goes in a straight line at tx,ty. There is no pathfinder
    // and the project has always refused one. It never mattered while water
    // could not kill — deepest water on a generated world, sampled for 300 days,
    // is 0.1034 against a lethal 0.14. Two things shipped in 2026-08 that make
    // real depth reachable: baked real worlds have real lakes (Central Park
    // peaks at 0.1671 untouched) and the player has a shovel (digging the pond
    // out reached 0.2264). Measured: NINE drownings in 60 unattended days on
    // Central Park, every one on `flee` or `wander`, and not one of them aimed
    // at a target that was itself lethal water. They were crossing the reservoir.
    //
    // Central Park, 4 seeds x 120 days, alive / standing / drowned / thirst:
    //   do nothing                        236 / 109 / 11 /  0
    //   refuse steps into water > 0.10     246 /  92 /  0 / 11
    //   ...plus reject targets across water 171 /  90 /  0 /  4
    //   ...same but as a x0.25 preference   232 / 103 /  1 / 13
    //   refuse steps into water > 0.125     175 / 102 /  1 / 48
    //
    // Doing nothing and the best guard have the SAME ELEVEN water deaths; the
    // guard only relabels drowning as thirst, because a local refusal makes them
    // dither on a shore instead of crossing. Raising the threshold toward lethal
    // made it far worse, not better. Rejecting unreachable targets cost 65 kin.
    // A real fix is a real pathfinder, which is a different and much larger
    // decision than this comment. Until then the lake is honestly dangerous.
    k.x[id] += (dx / d) * sp - gx * slide * sp;
    k.y[id] += (dy / d) * sp - gy * slide * sp;
    this._keepIn(id);
    // a foot went here. enough feet and nothing grows on it again.
    const wi2 = this.idx(k.x[id], k.y[id]);
    if (this.worn[wi2] < 1) this.worn[wi2] += 0.00075;
  }

  _keepIn(id) {
    const k = this.k, N = this.N, c = (N - 1) / 2, lim = (N - 1) * 0.44;
    let dx = k.x[id] - c, dy = k.y[id] - c;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > lim) { const f = lim / d; k.x[id] = c + dx * f; k.y[id] = c + dy * f; }
    k.x[id] = Math.max(1, Math.min(N - 2, k.x[id]));
    k.y[id] = Math.max(1, Math.min(N - 2, k.y[id]));
  }

  _act(id, g) {
    const k = this.k, NN = NEEDS.length, base = id * NN;
    const i = this.idx(k.x[id], k.y[id]);
    const near = Math.abs(k.tx[id] - k.x[id]) + Math.abs(k.ty[id] - k.y[id]) < 0.8 * S;
    switch (k.goal[id]) {
      // ⚠️⚠️ THEY EAT WITH THEIR MOUTH, NOT WITH THEIR FEET. This read
      // `this.moss[i]` — the single cell the kin is STANDING ON — while `near`
      // only requires being within 0.8*S (1.2 cells) of the target. So a kin
      // could walk the whole way to the best moss on the board, stop one cell
      // short, and be refused the meal entirely: the goal stays satisfied-ish,
      // the hold runs, and they starve in arm's reach of food. Hunger was 90%
      // of all mortality on a board that is 89% covered in moss, and this line
      // is why. Reach for the best cell within one step instead.
      case 1: {
        let mi = i, mv = this.moss[i];
        if (near) {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const j = this.idx(k.x[id] + dx, k.y[id] + dy);
            if (this.moss[j] > mv) { mv = this.moss[j]; mi = j; }
          }
        }
        if (near && mv > 0.05) {
        const take = Math.min(this.moss[mi], C.MOSS_EAT * 0.06);
        // ⚠⚠ THIS MULTIPLIER WAS 1.5, AND AT 1.5 EATING WAS A NET LOSS. Standing on
        // saturated moss gained +0.030600 per tick while hunger cost -0.030667 —
        // they starved 0.02% faster than they could feed. That one number is why
        // 75% of all deaths were hunger on a board at 291% moss cover, why the
        // population boom-busted against a ceiling of ~94 instead of compounding,
        // and therefore why the settlement ladder stalled at day 400 with three
        // quarters of the board still empty scenery. The whole second half of the
        // game was missing because of a rounding-width margin in one line.
        // At 2.4 a meal takes about 55 ticks and leaves a surplus;  is still
        // capped by what is in the cell, so they still graze it out and move on.
        // ⚠️ decrement the cell they ATE FROM (mi), not the one under their feet.
        this.moss[mi] -= take; k.need[base + 2] = Math.min(1, k.need[base + 2] + take * C.MOSS_FEED);
        }
      } break;
      case 11: {                              // eating something dad dropped
        let gf = null, bd = 1e9;
        for (const c of this.gifts) {
          const d = Math.abs(c.x - k.x[id]) + Math.abs(c.y - k.y[id]);
          if (d < bd) { bd = d; gf = c; }
        }
        if (gf && bd < 1.3 * S) {
          // ⚠️ RATE MEASURED, NOT PICKED. At 0.012 a crumb was stripped in 84 ticks
          // — under six sim-minutes — so it was gone before anybody could walk to
          // it and the whole point (a place worth crossing the board for) never
          // happened. At 0.0006 one crumb is roughly twenty-eight half-meals and
          // lasts most of a day with three of them on it.
          const take = Math.min(gf.mass, 0.0006);
          gf.mass -= take;
          k.need[base + 2] = Math.min(1, k.need[base + 2] + take * 14);
          // a place where somebody was fed is a place worth remembering
          this._placeFelt(gf.x, gf.y, 0.02, k.nameId[id]);
        }
        break;
      }
      case 2: { // they drink at the bank, not by standing in it
        let wet = this.water[i];
        if (wet <= 0.004) {
          const cx = k.x[id] | 0, cy = k.y[id] | 0, RR = Math.max(1, Math.round(S));
          for (let dy = -RR; dy <= RR && wet <= 0.004; dy++) for (let dx = -RR; dx <= RR; dx++) {
            const j = this.idx(cx + dx, cy + dy);
            if (this.water[j] > wet) wet = this.water[j];
          }
        }
        // ⚠ A WELL IS WATER WHERE THERE IS NO WATER. Before this, the only
        // drink on the board was the pond, so the whole town was leashed to one
        // shore and anybody who settled away from it died of thirst. A standing
        // well is a drinkable cell in its own right — this is what lets a town
        // live somewhere the terrain did not choose for it.
        if (wet <= 0.004) {
          for (const o of this.works) {
            if (o.kind !== WORK_AT.well || o.prog < WORK_DONE) continue;
            const dx = o.x - k.x[id], dy = o.y - k.y[id];
            if (dx * dx + dy * dy <= 2.6 * S * S) { wet = 1; break; }
          }
        }
        if (wet > 0.004) k.need[base + 1] = Math.min(1, k.need[base + 1] + 0.022);
      } break;
      case 3: break; // standing in the warm place is its own reward (handled by comfort)
      case 4: {
        // resting under your own roof is real sleep; a hollow in the moss is not
        let rr2 = 0.014;
        if (k.home[id] >= 0) {
          const h = this.workById(k.home[id]);
          if (h && Math.abs(h.x - k.x[id]) + Math.abs(h.y - k.y[id]) < WORKS[h.kind].radius * S) rr2 = 0.022;
        }
        k.need[base + 3] = Math.min(1, k.need[base + 3] + rr2);
        break;
      }
      case 5: if (near) {
        k.need[base + 4] = Math.min(1, k.need[base + 4] + 0.018);
        // and while they are sitting together, they talk about how things are done
        if (k.knows[id]) {
          let o = -1, bd = 2.2 * S * 2.2 * S;
          for (let t2 = 0; t2 < this.count; t2++) {
            if (!k.alive[t2] || t2 === id || k.stage[t2] < STAGE.HALF) continue;
            if ((k.knows[t2] & k.knows[id]) === k.knows[id]) continue;   // knows it all already
            const dx = k.x[t2] - k.x[id], dy = k.y[t2] - k.y[id], d2 = dx * dx + dy * dy;
            if (d2 < bd) { bd = d2; o = t2; }
          }
          // ⚠ the school multiplies the THRESHOLD, never the number of draws —
          // the rng stream must not shift with geography or every school placement
          // would desync a replayed save.
          let schooled = false;
          for (const w2 of this.works) {
            if (w2.kind !== WORK_AT.school || w2.prog < WORK_DONE) continue;
            const sx2 = w2.x - k.x[id], sy2 = w2.y - k.y[id];
            const sr2 = WORKS[WORK_AT.school].radius * S;
            if (sx2 * sx2 + sy2 * sy2 <= sr2 * sr2) { schooled = true; break; }
          }
          if (o >= 0 && this.rng() < 0.02 * (schooled ? C.SCHOOL_BOOST : 1)) {
            const fresh = k.knows[id] & ~k.knows[o];
            for (let wi2 = 0; wi2 < WORKS.length; wi2++) {
              const b2 = 1 << wi2;
              if (!(fresh & b2)) continue;
              k.knows[o] |= b2;
              const pr2 = this.prac[wi2];
              if (pr2.tradition < 0 && pr2.inventorGone >= 0 && k.born[id] > pr2.inventorGone) {
                pr2.tradition = this.day;
                this.log('tradition', `${WORKS[wi2].name} outlived the one who thought of it — ${this._name(id, 'who does it because it has always been done')} never met them, and taught it anyway.`, 8.0);
              }
              if (pr2.told == null) {
                pr2.told = this.day;
                this.log('told', `${this._name(id, 'who told somebody how it was done')} showed ${this._name(o, 'who was told')} how ${WORKS[wi2].name} is made.`, 3.2);
              }
              break;
            }
          }
        }
      } break;
      // belt and braces on the range bug above: an errand needs legs
      case 7: if (near && !k.glued[id]) this._breed(id, k.goalT[id] | 0); break;
      case 8: if (near && !k.glued[id] && this.corpses.length) this._carry(id); break;
      case 10: {                              // making the thing
        if (!near) break;
        const w = this._workFor(id);
        if (!w || w.d > 1.6 * S) break;
        const o = w.work, W = WORKS[o.kind];
        o.prog = Math.min(1, o.prog + 1 / W.effort);
        // ⚠️ WITNESSING IS HOW IT SPREADS. Watching somebody make a thing is
        // how a private trick becomes something the town knows — without this
        // every practice dies with whoever thought of it.
        const bit = 1 << o.kind;
        for (let t = 0; t < this.count; t++) {
          if (!k.alive[t] || t === id || k.stage[t] < STAGE.HALF) continue;
          if (k.knows[t] & bit) continue;
          const dx = k.x[t] - o.x, dy = k.y[t] - o.y;
          if (dx * dx + dy * dy > 16 * S * S) continue;
          k.knows[t] |= bit;
          const pr = this.prac[o.kind];
          if (pr.learned == null) {
            pr.learned = this.day;
            this.log('learned', `${this._name(t, 'who watched, and learned')} now knows how ${W.name} is made.`, 3.4);
          }
        }
        // ⚠️ TRADITION. Somebody is making this who cannot have been taught by
        // the one who thought of it, because they were born after that person
        // died. This is the bible's whole test for culture and it is the only
        // thing `k.born` is read for.
        const pr2 = this.prac[o.kind];
        if (pr2.tradition < 0 && pr2.inventorGone >= 0 && k.born[id] > pr2.inventorGone) {
          pr2.tradition = this.day;
          const tn = this._name(id, 'who does it because it has always been done');
          this.log('tradition', `${W.name} outlived the one who thought of it. ${tn} never met them.`, 8.0);
        }
        if (o.prog >= WORK_DONE && !o.told) {
          o.told = 1;
          this.log('stands', `${W.name} stands where they put it.`, 3.0);
        }
      } break;
      case 9: {                               // sitting with the one who stays
        const t = k.goalT[id] | 0;
        if (near && !k.glued[id] && k.alive[t] && k.glued[t]) {
          // they bring what they have, and it costs them a little. Warmth is
          // skipped on purpose: you cannot hand somebody a warm place to stand.
          for (let n = 1; n < NN; n++) {
            const give = Math.min(0.05, k.need[base + n] * 0.5);
            k.need[t * NN + n] = Math.min(1, k.need[t * NN + n] + give);
            k.need[base + n] = Math.max(0, k.need[base + n] - give * 0.5);
          }
          k.need[t * NN + 4] = Math.min(1, k.need[t * NN + 4] + 0.03);
          if (this.day - (this._tendLog == null ? -99 : this._tendLog) > 6) {
            this._tendLog = this.day;
            this.log('tend', `${this._name(id, 'who went and sat with the one who stays')} went and sat a while with ${this.nameOf(t)}.`, 1.5);
          }
        }
      } break;
    }
    if (k.goal[id] !== 4) k.need[base + 3] = Math.max(0, k.need[base + 3] - 0.0002);
    // company from proximity, cheaply: being near your target counts
    if (k.goal[id] === 5 && near) k.need[base + 4] = Math.min(1, k.need[base + 4] + 0.004);

  }

  _breed(mo, fa) {
    const k = this.k;
    if (!k.alive[fa] || k.stage[fa] !== STAGE.WHOLE || k.cool[fa] > 0) return;
    const G = LOCI.length * 2, rng = this.rngGene;
    const gm = k.genome.subarray(mo * G, mo * G + G), gf = k.genome.subarray(fa * G, fa * G + G);
    const bro = BROOD[expressed(gm, L.brood)];
    const n = bro[0] + ri(rng, bro[1] - bro[0] + 1);
    let made = 0, novel = -1;
    for (let e = 0; e < n; e++) {
      // ⚠️ the roof bonus is THRESHOLD-side, not draw-side: the same rng call
      // happens either way, so the gene stream keeps its exact shape. +0.10
      // hatch odds under a roof — eggs kept warm and out of the rain.
      if (rng() > Math.min(0.98, bro[2] + (k.home[mo] >= 0 ? 0.10 : 0))) continue;
      const child = new Uint8Array(G);
      for (let li = 0; li < LOCI.length; li++) {
        let a = gm[li * 2 + (rng() < 0.5 ? 0 : 1)];
        let b = gf[li * 2 + (rng() < 0.5 ? 0 : 1)];
        if (rng() < 0.008) { a = ri(rng, LOCI[li].alleles.length); novel = li; }   // §5.2 mutation
        if (rng() < 0.008) { b = ri(rng, LOCI[li].alleles.length); novel = li; }
        child[li * 2] = a; child[li * 2 + 1] = b;
      }
      // eggs are laid AT HOME when there is one — same two rng draws, different
      // base, so the stream shape is identical for housed and unhoused mothers
      const hm = k.home[mo] >= 0 ? this.workById(k.home[mo]) : null;
      const bx = hm ? hm.x : k.x[mo], by2 = hm ? hm.y : k.y[mo];
      const id = this._spawn(bx + rr(rng, -1.2 * S, 1.2 * S), by2 + rr(rng, -1.2 * S, 1.2 * S), child, mo, fa,
        Math.max(k.gen[mo], k.gen[fa]) + 1);
      if (id < 0) break;
      made++;
      this.stats.born++;
      this.stats.generations = Math.max(this.stats.generations, k.gen[id]);
      if (novel >= 0) {
        this._name(id, `born with something no one in the town has carried before`);
        this.log('mutation', `a new ${LOCI[novel].key} in the blood.`, 2.6);
        novel = -1;
      }
    }
    if (made) {
      k.cool[mo] = C.BREED_COOLDOWN; k.cool[fa] = C.BREED_COOLDOWN;
      k.goal[mo] = 0;
      if (k.nameId[mo] >= 0 && k.nameId[fa] >= 0) {
        this.log('clutch', `${this.nameOf(mo)} and ${this.nameOf(fa)} left ${made} egg${made > 1 ? 's' : ''} on the ${this.placeName(this.idx(k.x[mo], k.y[mo]))}.`, 0.9);
      }
    }
  }

  _die(id, cause, noBody) {
    const k = this.k;
    // the door passes down: the lowest-slot unhoused child keeps it. An argmin,
    // deterministic, and the claim pass never has to know it happened.
    if (k.home[id] >= 0) {
      let heir = -1;
      for (let c = 0; c < this.count; c++) {
        if (!k.alive[c] || c === id || k.home[c] >= 0) continue;
        if (k.mother[c] !== id && k.father[c] !== id) continue;
        if (k.stage[c] < STAGE.HALF) continue;
        heir = c; break;
      }
      if (heir >= 0) {
        k.home[heir] = k.home[id]; k.homeTier[heir] = k.homeTier[id];
        if (k.nameId[id] >= 0) this.log('door', `${this.nameOf(heir)} kept ${this.nameOf(id)}'s door.`, 2.2);
      }
      k.home[id] = -1; k.homeTier[id] = 0;
    }
    const named = k.nameId[id] >= 0;
    const nm = named ? this.names[k.nameId[id]] : null;
    this._weaveDeath(id);
    k.alive[id] = 0;
    this.free.push(id);
    this.stats.died++;
    if (k.stage[id] !== STAGE.EGG && !noBody) {
      this.corpses.push({ x: k.x[id], y: k.y[id], nameId: k.nameId[id], gen: k.gen[id], t: this.tick, cause, claim: -1, glued: k.glued[id] ? 1 : 0 });
      if (this.corpses.length > 24) this.corpses.shift();
    }
    const how = { age: 'grew old', hunger: 'went hungry', thirst: 'went dry', heat: 'was in the warm place too long', cold: 'went cold', water: 'was in the low end when it filled', taken: 'did not come back', smitten: 'was struck where they stood' }[cause] || 'stopped';
    // there is only ever one of these, and there will never be another
    if (k.glued[id]) this.log('stillgone', `${nm} ${how}, in the one place ${nm} had ever been.`, 6.0);
    else if (named) this.log('death-named', `${nm} ${how}.`, 2.0);
    else if (cause !== 'age') this.log('death', `one ${how}.`, 0.5);
  }

  _carry(id) {
    let ci = this.corpses.findIndex(c => c.claim === id);
    if (ci < 0) ci = 0;
    const c = this.corpses.splice(ci, 1)[0];
    if (!c) return;
    let gx = this.yard.x, gy = this.yard.y;
    for (let tries = 0; tries < 8; tries++) {
      const px = this.yard.x + rr(this.rng, -3.5 * S, 3.5 * S), py = this.yard.y + rr(this.rng, -3.5 * S, 3.5 * S);
      if (this.inJar(px, py)) { gx = px; gy = py; break; }
    }
    this.graves.push({ x: gx, y: gy, nameId: c.nameId, day: this.day, gen: c.gen });
    this.stats.buried++;
    const carrier = this._name(id, `who carried the dead to the yard`);
    if (c.glued && c.nameId >= 0) {
      this.log('stillcarried', `${carrier} carried ${this.names[c.nameId]} to the yard — the only journey ${this.names[c.nameId]} ever took.`, 7.0);
    } else if (c.nameId >= 0) this.log('burial', `${carrier} carried ${this.names[c.nameId]} to the yard.`, 1.8);
  }

  _corpses() {
    // a corpse nobody collects eventually goes back to the moss
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      if (this.tick - this.corpses[i].t > C.TICKS_PER_DAY * 6) {
        const c = this.corpses.splice(i, 1)[0];
        const j = this.idx(c.x, c.y);
        this.moss[j] = Math.min(1, this.moss[j] + 0.5);
        this.log('unburied', `nobody came for one of them. the grass took it.`, 2.2);
      }
    }
  }

  // ⚠️ THE HAND HAS NEVER ONCE APPEARED IN THE TOWN'S OWN RECORD, and the book
  // is what P2 says the whole game is for. These fire from MEASURED WORLD STATE,
  // never from a setter — the town has no word for the player, so it reports
  // ground and weather. Nothing here may ever say 'you'.
  _handBeats() {
    const k = this.k, N = this.N;
    const since = (key, days) => {
      if (this._beat == null) this._beat = {};
      if (this.day - (this._beat[key] == null ? -999 : this._beat[key]) < days) return false;
      this._beat[key] = this.day; return true;
    };
    // SCORCH — ground that has been cooked past anything's tolerance
    let hot = 0;
    for (let i = 0; i < N * N; i += 3) if (this.temp[i] > 54 && this.moss[i] < 0.02) hot++;
    if (hot > 26 && since('scorch', 14)) {
      this.log('scorch', `nothing grows on that ground any more.`, 5.0);
    }
    // COVER — the air stops giving its water back
    if (!this.lid && this.humid < 2.2 * S * S && since('cover', 20)) {
      this.log('drought', `the air stopped giving anything back.`, 5.0);
    }
    // LIGHT — a night that never came
    if (this.lampOn && this.curtain > 0.55 && since('light', 18)) {
      this.log('nonight', `the light did not go down, and nobody rested well.`, 4.2);
    }
    // WARM — they went TO the warm ground, which is the kind version
    let drawn = 0;
    for (let id = 0; id < this.count; id++) {
      if (!k.alive[id] || k.goal[id] !== 3 || k.memV[id] <= 0.35) continue;
      drawn++;
    }
    if (drawn >= Math.max(4, this.alive * 0.18) && since('warmdrawn', 16)) {
      this.log('warmth', `the ground came up warm on one side, and they went to it.`, 4.4);
    }
  }

  // ── WHICH AGE IS IT ─────────────────────────────────────────
  // Read off the board, never stored as progress. The highest age whose marker
  // work actually STANDS right now — so an age can be lost, which is the only
  // thing that makes reaching one mean anything.
  ageNow() {
    let best = 0;
    for (let a = AGES.length - 1; a > 0; a--) {
      const at = AGES[a].at;
      for (const o of this.works) {
        if (o.kind === at && o.prog >= WORK_DONE) { best = a; break; }
      }
      if (best) break;
    }
    return best;
  }

  _daily() {
    const k = this.k;
    // the turn of an age is the biggest thing that can happen to a town, and
    // it is the one beat the chronicle should never miss. ⚠ BOTH DIRECTIONS:
    // falling back out of an age is a real event and reads as one.
    {
      const a = this.ageNow();
      if (a > this.ageBest) this.ageBest = a;
      if (this.age == null) this.age = a;
      else if (a > this.age) {
        this.age = a;
        this.log('age', `${AGES[a].name}: ${AGES[a].said}`, 4);
      } else if (a < this.age) {
        this.age = a;
        this.log('age', `it went back to ${AGES[a].name}.`, 3.4);
      }
    }
    // what they felt fades, but slowly — and the strongest thing that ever
    // happened to somebody is the last of it to go
    for (let id = 0; id < this.count; id++) {
      if (!k.alive[id]) continue;
      k.memV[id] *= 0.994;
      if (Math.abs(k.memV[id]) < 0.004) { k.memV[id] = 0; k.memX[id] = -1; k.memY[id] = -1; }
      // ⚠️ k.saw is NOT decayed here, and that is not an oversight. §9.3: the
      // hand is forgotten; the one it took is not. It leaves this colony only
      // when its last witness does.
    }
    this._handBeats();
    // HEARTHNIGHT: the first night the whole town slept under roofs
    {
      let adults = 0, housed = 0;
      for (let id = 0; id < this.count; id++) {
        if (!this.k.alive[id] || this.k.stage[id] < STAGE.WHOLE) continue;
        adults++; if (this.k.home[id] >= 0) housed++;
      }
      if (adults >= 10 && housed === adults) {
        if (this._beat == null) this._beat = {};
        if (this.day - (this._beat.hearthnight == null ? -999 : this._beat.hearthnight) > 90) {
          this._beat.hearthnight = this.day;
          this.log('hearthnight', 'every roof had somebody under it that night.', 6.5);
        }
      }
    }
    // seasonal room temperature from the real calendar is applied by the view via setRoom()
    if (this.alive === 0 && !this._ended) {
      this._ended = true;
      this.log('end', `the town is quiet. ${this.graves.length} graves in the yard.`, 9);
    }
  }

  // coarse cell — places are neighbourhoods, not pixels
  _coarse(x, y) { const c = Math.max(2, Math.round(8 * S)); return ((y / c) | 0) * 999 + ((x / c) | 0); }

  // ⚠️ PURELY MECHANICAL. Frequency x magnitude x distinct kin, and no lookup
  // anywhere asks whether what happened was good or bad. The town names a fact.
  _placeFelt(x, y, dv, nameId) {
    const key = this._coarse(x, y);
    let p = this.placeMem[key];
    if (!p) p = this.placeMem[key] = { v: 0, ids: [], n: 0 };
    p.v += dv;
    if (nameId >= 0 && p.ids.length < 12 && !p.ids.includes(nameId)) { p.ids.push(nameId); p.n++; }
    if (!this.placeNames[key] && Math.abs(p.v) > 2.4 && p.n >= 3) {
      const nm = coinName(this.lang, this.rng);
      this.placeNames[key] = nm;
      this.log('placename', `they have started calling that ground ${nm}.`, 4.5);
    }
  }

  // What the town has become, read off what it has actually managed. Derived
  // on demand so it can never drift out of step with the world, and never
  // shown to the player as a number.
  get era() {
    let known = 0, standing = 0;
    for (let i = 0; i < WORKS.length; i++) if (this.prac[i].invented >= 0) known++;
    for (const o of this.works) if (o.prog >= WORK_DONE) standing++;
    if (this.prac[WORK_AT.hall] && this.prac[WORK_AT.hall].invented >= 0) return 4;
    if (this.prac[WORK_AT.house] && this.prac[WORK_AT.house].invented >= 0) return 3;
    if (this.prac[WORK_AT.hut] && this.prac[WORK_AT.hut].invented >= 0) return 2;
    if (standing > 0) return 1;
    return 0;
  }

  placeName(i) {
    const N = this.N, x = i % N, y = (i / N) | 0;
    // somewhere enough of them felt enough about has its own word now
    const named = this.placeNames[this._coarse(x, y)];
    if (named) return named;
    const dp = Math.abs(x - this.pond.x) + Math.abs(y - this.pond.y);
    const dy_ = Math.abs(x - this.yard.x) + Math.abs(y - this.yard.y);
    if (this.water[i] > 0.02) return 'water';
    if (dp < 9 * S) return 'bank';
    if (dy_ < 7 * S) return 'yard';
    return this.height[i] > 0.55 ? 'high ground' : 'flat';
  }

  // -- player verbs ----------------------------------------------------------
  // ⚠️ THE CONTACT LAW. A finger is not one thing. Resting lightly and bearing
  // down are the SAME gesture at two rates, so the hand carries its own radius
  // and its own heat, and main.js decides them from how the stroke is going.
  // Everything the finger can do is a curve through these two numbers — which is
  // why this whole vocabulary needs no sixth verb and no palette of powers.
  //
  // ⚠️ PointerEvent.pressure reads 0.5 for every mouse button that is down and
  // 0 when it is up — it carries no information at all on the hardware most
  // people have. So "press harder" HAS to mean "press longer", and the
  // classifier in main.js is time-based on purpose. Do not "improve" it to read
  // e.pressure: that works on the developer's stylus and nowhere else.
  //
  // The hand stays TRANSIENT — never saved, never fingerprinted, as before.
  // —— POWER OVER PEOPLE ——————————————————————————————
  //
  // Everything above this line is weather and ground: you warm a place, you wet
  // it, you tip it, you leave food on it. These five reach past the world and
  // take hold of the person. They are cheap because the systems were already
  // here — commitment (k.hold), the flee goal, the death path, the witnesses,
  // and dad's glued figure — and every one of them writes into the record.

  // CALL. The whole town drops what it is doing and comes to a spot. Kind if
  // you call them to water in a drought; a massacre if you call them into the
  // low end before it rains. The power does not know which you meant.
  call(x, y) {
    const k = this.k, R = 26 * S;
    let n = 0;
    for (let id = 0; id < this.count; id++) {
      if (!k.alive[id] || k.stage[id] === STAGE.EGG || k.glued[id]) continue;
      if (this.held && this.held.id === id) continue;
      const dx = k.x[id] - x, dy = k.y[id] - y;
      if (dx * dx + dy * dy > R * R) continue;
      k.goal[id] = 12; k.tx[id] = x; k.ty[id] = y;
      // ⚠️ a LONG commitment, or _decide takes them back off it within a second
      // and the whole power reads as nothing happening. An emergency still
      // overrides it — a called kin standing in fire still runs.
      k.hold[id] = 1400;
      n++;
    }
    if (n) this.log('called', `something wanted them in one place, and ${n === 1 ? 'one of them went' : 'all ' + n + ' of them went'}.`, 5.6);
    return n;
  }

  // MEND. Every need full, the death clock wiped. The one unambiguously good
  // thing in the game, and the only place a positive memory is written without
  // asking their body first — because there is nothing to interpret.
  mend(id) {
    const k = this.k, NN = NEEDS.length;
    if (!k.alive[id] || k.stage[id] === STAGE.EGG) return false;
    const wasFailing = k.strain[id] > 0.02;
    for (let n = 0; n < NN; n++) k.need[id * NN + n] = 1;
    k.strain[id] = 0;
    k.memV[id] = Math.min(3, k.memV[id] + 1.4);
    k.memX[id] = k.x[id]; k.memY[id] = k.y[id];
    this._placeFelt(k.x[id], k.y[id], 1.0, k.nameId[id]);
    const nm = this._name(id, 'who was mended');
    this.log('mended', wasFailing
      ? `${nm} was going, and then was not going.`
      : `${nm} wanted for nothing at all, once.`, 6.0);
    return true;
  }

  // SMITE. They stop where they stand, and there IS a body — unlike a taking,
  // this one gets carried and buried, so the town gets to hold a funeral for
  // somebody the sky killed in front of them.
  smite(id) {
    const k = this.k;
    if (!k.alive[id] || k.stage[id] === STAGE.EGG) return false;
    this._witness(id, -1.4, 0.45);
    this._placeFelt(k.x[id], k.y[id], -1.6, k.nameId[id]);
    this._die(id, 'smitten');
    return true;
  }

  // STILL. Dad glued one figure to the board; this is that, in your hands. They
  // keep wanting everything anyone wants and can never go and get it, so the
  // town has to come to them — which is the entire 'one who stays' system,
  // already built, already tested, and reached here in eight lines.
  still(id) {
    const k = this.k;
    if (!k.alive[id] || k.glued[id] || k.stage[id] === STAGE.EGG) return false;
    k.glued[id] = 1; k.tender[id] = -1;
    k.tx[id] = k.x[id]; k.ty[id] = k.y[id];
    this._witness(id, -0.7, 0.2);
    const nm = this._name(id, 'who was fixed to the world');
    this.log('stilled', `${nm} will not be moving again. whatever ${nm} needs now, somebody else has to bring it.`, 7.0);
    return true;
  }

  // TERROR. Not damage — the certainty that the place is wrong. Goal 6 is the
  // flee goal and it already exists, so this only has to point them away.
  terror(x, y) {
    const k = this.k, NN = NEEDS.length, R = 20 * S;
    let n = 0;
    for (let id = 0; id < this.count; id++) {
      if (!k.alive[id] || k.stage[id] === STAGE.EGG || k.glued[id]) continue;
      const dx = k.x[id] - x, dy = k.y[id] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      const d = Math.sqrt(d2) || 1;
      k.need[id * NN + 5] = Math.max(0, k.need[id * NN + 5] - 0.55);
      k.goal[id] = 6;
      k.tx[id] = Math.max(1, Math.min(this.N - 2, k.x[id] + (dx / d) * 16 * S));
      k.ty[id] = Math.max(1, Math.min(this.N - 2, k.y[id] + (dy / d) * 16 * S));
      k.hold[id] = 200; k.pulse[id] = 2.8;
      n++;
    }
    if (n) this.log('terror', `something was wrong with that place, and ${n === 1 ? 'one of them' : n + ' of them'} would not stay.`, 5.0);
    return n;
  }

  // shared by every act done TO somebody in front of everybody else. The sign
  // comes from each watcher's own comfort band, exactly as the ordinary
  // hand-memory does, so one act writes two different meanings into two lines.
  _witness(id, weight, fright) {
    const k = this.k, R = 14 * S;
    let seen = 0;
    for (let w = 0; w < this.count; w++) {
      if (!k.alive[w] || w === id || k.stage[w] === STAGE.EGG) continue;
      const dx = k.x[w] - k.x[id], dy = k.y[w] - k.y[id];
      if (dx * dx + dy * dy > R * R) continue;
      const g = k.genome.subarray(w * LOCI.length * 2, (w + 1) * LOCI.length * 2);
      const band = HIDE_BAND[expressed(g, L.hide)];
      const T = this.temp[this.idx(k.x[w], k.y[w])];
      const good = (T >= band[0] && T <= band[1]);
      k.saw[w] = Math.max(-3, Math.min(3, k.saw[w] + (good ? weight * 0.55 : weight)));
      k.need[w * NEEDS.length + 5] = Math.max(0, k.need[w * NEEDS.length + 5] - fright);
      k.pulse[w] = 2.6; k.hold[w] = 0;
      seen++;
    }
    return seen;
  }

  // ⚠️ THERE WAS A `_walkable(x0,y0,x1,y1)` LINE-OF-SIGHT HELPER HERE and it is
  // gone deliberately, not by accident. It sampled the straight line to a
  // candidate and rejected anything across deep water — which sounds obviously
  // right and measured worse than doing nothing, in both its strict and its
  // lenient form. The numbers and the reasoning are written at the water
  // candidate in `_decide`; read them before writing this function again.

  // —— THE SEED ————————————————————————————————————
  //
  // —— DAD'S CORNER ————————————————————————————————————————————————
  //
  // Push a thumb into the world and leave it changed. `dir` is +1 for a rise
  // and −1 for a hollow; `f` is 0..1 of a full handful, so a held press builds
  // the shape up instead of stamping it, and a tap barely marks the ground.
  //
  // ⚠️ NOTHING DOWNSTREAM NEEDS WRITING — that is the whole reason this verb is
  // worth its weight, and it is why it belongs in the simulation rather than
  // the view. It is all already there and already reading `height`:
  //   `_fluids` re-routes every drop by `H[i] + tilt + W[j]` on the field lane,
  //     so a hollow fills and a ridge sheds water within a fraction of a second;
  //   `_move` already adds `-gx * slide * sp`, so kin ALREADY walk downhill and
  //     a raised ridge steers a whole town with no pathfinder involved;
  //   `eff()`, `pondLevel` and `placeName` all key off it, so a hill you make
  //     can literally become the high ground they name.
  // The player makes terrain and the world answers with systems that shipped
  // years of sessions ago.
  shape(x, y, dir, f = 1) {
    if (!this.inJar(x, y)) return false;
    const N = this.N, R = 3 * S;
    const amp = 0.06 * f * (dir < 0 ? -1 : 1);
    const x0 = Math.max(0, Math.ceil(x - R)), x1 = Math.min(N - 1, (x + R) | 0);
    const y0 = Math.max(0, Math.ceil(y - R)), y1 = Math.min(N - 1, (y + R) | 0);
    let moved = 0;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - x, dy = yy - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      // a soft shoulder, so what you make is a landform and not a pillar
      const g = 1 - Math.sqrt(d2) / R;
      const i = yy * N + xx;
      const before = this.height[i];
      // ⚠️ CLAMP THE HEIGHT, THEN RECORD WHAT ACTUALLY LANDED. Adding the
      // intended amount to `lump` and the clamped amount to `height` lets the
      // two drift apart, and then a reload — which rebuilds height as base+lump
      // — quietly produces a different world from the one that was saved.
      const after = Math.max(0, Math.min(1.2, before + amp * g * g));
      this.height[i] = after;
      this.lump[i] += after - before;
      moved += Math.abs(after - before);
    }
    if (moved > 0.0001) this._shaped = (this._shaped || 0) + moved;
    return moved > 0.0001;
  }

  // A crumb is a meal. A seed is a FIELD — you press it into the ground and
  // the moss comes back thicker there for a season. The crumb answers today;
  // this answers the year, and it is the only power that makes the board
  // better at feeding them instead of feeding them directly.
  sow(x, y) {
    if (!this.inJar(x, y)) return false;
    const N = this.N, R = 6 * S;
    const x0 = Math.max(0, (x - R) | 0), x1 = Math.min(N - 1, (x + R) | 0);
    const y0 = Math.max(0, (y - R) | 0), y1 = Math.min(N - 1, (y + R) | 0);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const d = Math.sqrt((xx - x) * (xx - x) + (yy - y) * (yy - y));
      if (d > R) continue;
      const f = 1 - d / R;
      const i = yy * N + xx;
      // ⚠️ it does NOT paint moss on. It raises the ground's moisture, which is
      // what _growth actually reads — so the green arrives over days, from the
      // ground's own logic, and a seed sown on a scorched patch does nothing
      // until the burn cools. The hand plants; the world decides.
      this.moist[i] = Math.min(1, this.moist[i] + 0.55 * f);
      this.moss[i] = Math.min(1, this.moss[i] + 0.05 * f);
    }
    this.log('sown', 'the ground took something, and began to think about it.', 3.2);
    return true;
  }

  // —— THE KNOCK ———————————————————————————————————
  //
  // The oldest verb in the fiction — the thing you must not do — and until now
  // it lived in main.js as a view-side shake that the simulation never heard.
  // A knock on the table is felt by the WHOLE board at once: everybody stops,
  // every commitment breaks, and anything standing loses a little of itself.
  knock() {
    const k = this.k, NN = NEEDS.length;
    let felt = 0;
    for (let id = 0; id < this.count; id++) {
      if (!k.alive[id] || k.stage[id] === STAGE.EGG) continue;
      k.need[id * NN + 5] = Math.max(0, k.need[id * NN + 5] - 0.22);
      k.pulse[id] = 2.8;
      k.hold[id] = 0;                       // whatever they were doing, they are not now
      felt++;
    }
    // ⚠️ and it SHAKES THE BUILDINGS. The old comment here claimed 0.004 was
    // "about three weeks of ordinary decay" and it was WRONG BY NINETEEN TIMES:
    // decay is 0.00006 per `_weave`, `_weave` runs 60x a day (tick % 15, 900
    // ticks a day), so ordinary decay is 0.0036/day and 0.004 was ONE DAY. The
    // one act the whole game is named after cost the town a single day of
    // upkeep, which is indistinguishable from nothing.
    // 0.042 is twelve days — a mark somebody has to go and repair, which is what
    // makes it a transgression rather than a jump-scare. Deliberately NOT three
    // weeks: this is a thing a player will do out of curiosity the first time,
    // and the first one should be survivable.
    for (const o of this.works) if (o.done != null) o.prog = Math.max(0.05, o.prog - 0.042);
    if (felt) this.log('knock', 'the whole world knocked, once, and every one of them stopped.', 4.0);
    return felt;
  }

  // —— THE DROP ————————————————————————————————————
  //
  // You could feed them and you could not give them a drink. Thirst was the
  // one need with no hand behind it: the pond is where the seed put it, the
  // channel only holds what somebody carried, and breathing on the board takes
  // a whole weather cycle to come back down as rain. A drop of water is the
  // immediate answer — and it is the same hand, so it is the same bargain.
  //
  // ⚠️ WATER IS THE MOST DANGEROUS KIND THING IN THIS GAME. Standing water is
  // the fastest killer on the board: `_kin` gives a kin in >0.14 of water a
  // 0.09-day death clock, which is four times faster than thirst and twenty
  // times faster than hunger. So the drop spreads a POOL, not a column — a
  // wide shallow disc that waters a neighbourhood and drowns nobody, unless
  // you pour again and again on the same spot, which is a choice.
  drop(x, y) {
    if (!this.inJar(x, y)) return false;
    const N = this.N, R = 4.5 * S;
    const x0 = Math.max(0, (x - R) | 0), x1 = Math.min(N - 1, (x + R) | 0);
    const y0 = Math.max(0, (y - R) | 0), y1 = Math.min(N - 1, (y + R) | 0);
    let wet = 0;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const d = Math.sqrt((xx - x) * (xx - x) + (yy - y) * (yy - y));
      if (d > R) continue;
      const f = 1 - d / R;
      const i = yy * N + xx;
      // shallow on purpose: 0.055 at the centre is well under the 0.14 that
      // starts a drowning clock, and it thins to nothing at the rim
      this.water[i] += 0.055 * f * f;
      this.moist[i] = Math.min(1, this.moist[i] + 0.30 * f);
      wet++;
    }
    // ⚠️ the water CAME FROM SOMEWHERE. Under the sheet the room is a closed
    // system — every drop you pour is drawn out of the air that would have
    // rained later, so a player who waters constantly quietly cancels their
    // own weather. Off the sheet, the hand is bringing it in from the house.
    if (this.lid) this.humid = Math.max(0, this.humid - 0.9 * S * S);
    this.log('drop', 'water came down out of nowhere and soaked into the ground.', 3.0);
    return wet > 0;
  }

  // —— THE CRUMB ——————————————————————————————————————
  //
  // ⚠⚠ THE "FEEDING THEM RUINS THEM" THEORY WAS TESTED AND IS FALSE. The design
  // note said a fed town would invent nothing and reach no tradition, because
  // `_weave` gates every invention on need pressure. Measured over 120 days on
  // three seeds, with the sheet ON for both so drought was not the variable:
  //
  //   seed a   fed: invented 5, traditions 6, standing 13   alone: 5, 6, 9
  //   seed b   fed: invented 5, traditions 6, standing  8   alone: 5, 6, 8
  //   seed c   fed: invented 6, traditions 6, standing  9   alone: 6, 6, 4
  //
  // Inventions and traditions are IDENTICAL. Fed towns build MORE, live far
  // longer (124 vs 20 alive on seed a) and write a book twice the length. So
  // feeding is simply kind, and the crumb is a straightforwardly good power.
  // Do not "fix" this into a punishment — if the kindness is ever supposed to
  // cost something, that is a design decision for Kyle, not a comment's opinion.
  //
  // The cost that IS real is the sheet: your arm has to be in their sky, and 20
  // days uncovered takes the pond to zero and ten of thirteen with it. A player
  // who feeds in short visits pays almost nothing; one who leaves it open to
  // keep feeding pays everything.
  give(x, y) {
    if (!this.inJar(x, y)) return false;
    if (this.gifts.length >= 12) return false;          // dad only leaves so many
    this.gifts.push({ x, y, mass: 1, day: this.day });
    this.log('gift', 'something came down out of the sky and stayed where it landed.', 3.2);
    return true;
  }

  _gifts() {
    for (let n = this.gifts.length - 1; n >= 0; n--) {
      const gf = this.gifts[n];
      if (gf.mass > 0.004 && this.day - gf.day < 16) continue;
      // ⚠️ THE GIFT ENDS AS PASTURE. Whatever is left goes into the moss where it
      // sat, so a crumb nobody found is not deleted — it becomes the reason that
      // patch is green for a season. Nothing is ever simply removed from a world
      // whose whole subject is that marks stay.
      const left = Math.max(0, gf.mass);
      const cx = gf.x | 0, cy = gf.y | 0, RR = Math.max(1, Math.round(2 * S));
      let cells = 0;
      for (let dy = -RR; dy <= RR; dy++) for (let dx = -RR; dx <= RR; dx++) cells++;
      const each = (left * 1.6) / cells;
      for (let dy = -RR; dy <= RR; dy++) for (let dx = -RR; dx <= RR; dx++) {
        const j = this.idx(cx + dx, cy + dy);
        this.moss[j] = Math.min(1, this.moss[j] + each);
      }
      this.gifts.splice(n, 1);
    }
  }

  // —— THE ONE YOU LIFTED (§9.3) —————————————————————————————
  //
  // Every other verb in this game acts on a RADIUS. This one acts on a PERSON,
  // and it is the only irreversible thing anybody can do here. There is no
  // confirmation dialog because a hand does not have one.
  lift(id) {
    const k = this.k;
    if (this.held || !k.alive[id] || k.stage[id] === STAGE.EGG) return false;
    this.held = { id, since: this.tick };
    const nm = this._name(id, 'who was lifted out of the world');
    // ⚠️ THE WITNESSES, AND WHY THEY DISAGREE. The sign comes from each watcher's
    // OWN comfort band against the ground they are standing on — the identical
    // rule the ordinary hand-memory uses. So one lift writes gratitude into a
    // line the room happens to suit and terror into one it does not, in the same
    // tick, and those two lines then interbreed. Nothing here decides what the
    // player did; their bodies do.
    // the same witnessing every public act uses now
    const seen = this._witness(id, -1.0, 0.30);
    this._lifted = { x: k.x[id], y: k.y[id], seen };
    this._placeFelt(k.x[id], k.y[id], -1.4, k.nameId[id]);
    this.log('lifted', seen > 0
      ? `${nm} went up, and ${seen === 1 ? 'one of them' : seen + ' of them'} watched it happen.`
      : `${nm} went up, and nobody was near enough to see.`, 7.5);
    return true;
  }

  // in the air: aging, and a body reading the temperature of a finger
  _heldKin(id, dt) {
    const k = this.k, NN = NEEDS.length, base = id * NN;
    k.age[id] += dt;
    // held still means held: nothing is being spent walking or working
    for (let n = 0; n < NN; n++) k.need[base + n] = Math.max(0, k.need[base + n] - C.DECAY[NEEDS[n]] * dt * 0.35);
    k.need[base + 4] = Math.max(0, k.need[base + 4] - C.DECAY.company * dt * 0.9);   // nobody is up here
    k.need[base + 5] = Math.max(0, k.need[base + 5] - dt * 0.55);                    // and it is a long way down
    // ⚠️ THE SAME HIDE_BAND EVERY OTHER KIN IS JUDGED BY. Being carried is
    // comfortable for a plain kin [18,32] and lethal for a rime one [6,21] — the
    // player performs one identical act and the world decides what it was.
    const g = k.genome.subarray(id * LOCI.length * 2, (id + 1) * LOCI.length * 2);
    const band = HIDE_BAND[expressed(g, L.hide)];
    const T = this.hand ? this.hand.heat * 0.42 + this.ambient * 0.58 : 33;
    const comfort = (T >= band[0] && T <= band[1]) ? 1 : 0;
    k.need[base + 0] += (comfort - k.need[base + 0]) * 0.02;
    if (T > band[3] || T < band[2]) k.strain[id] = Math.min(1, k.strain[id] + dt / 0.7);
    if (k.strain[id] >= 1) { this.held = null; this._die(id, 'heat'); return; }
    if (k.age[id] > k.lifespan[id]) { this.held = null; this._die(id, 'age'); }
  }

  // put back. Warm, safe nowhere, and carrying a quarter of a death clock.
  setDown(x, y) {
    if (!this.held) return false;
    const k = this.k, id = this.held.id, NN = NEEDS.length;
    this.held = null;
    if (!k.alive[id]) return false;
    k.x[id] = Math.max(1, Math.min(this.N - 2, x));
    k.y[id] = Math.max(1, Math.min(this.N - 2, y));
    k.need[id * NN + 0] = 1;                       // warmed, whatever else
    k.need[id * NN + 5] = 0.05;                    // and badly frightened
    k.strain[id] = Math.min(0.95, k.strain[id] + 0.25);
    k.goal[id] = 0; k.hold[id] = 0; k.tender[id] = -1;
    const nm = this.nameOf(id);
    this.log('putback', `${nm} was set down again, somewhere ${nm} had never been.`, 6.4);
    return true;
  }

  // ⚠️ NOT SET DOWN. No corpse is pushed, so there is no body, nobody comes to
  // carry it, and the yard ends up with a stone for everyone except this one.
  // That absence is the point and it is load-bearing: _carry has nothing to find.
  takeAway() {
    if (!this.held) return false;
    const id = this.held.id;
    this.held = null;
    if (!this.k.alive[id]) return false;
    this._die(id, 'taken', true);
    // ⚠⚠ `alive` IS A CACHED AGGREGATE AND THIS IS THE ONE KILL THAT HAPPENS
    // OUTSIDE THE TICK. Every other death runs inside _kin(), which recomputes
    // the count at the end of the same pass -- but the player can take somebody
    // between ticks, and until the next tick `this.alive` was one too high.
    // That matters because fingerprint() folds it: a save written in that gap
    // restored to a DIFFERENT hash than the town it came from (caught by the
    // round-trip test at 31 vs 30), which is the harness reporting a desync
    // that was never real. Same rule as _kin's own count -- every live slot,
    // eggs included -- so one fewer is exactly right.
    if (this.alive > 0) this.alive--;
    return true;
  }

  setHand(x, y, opt) {
    this.hand = (x == null) ? null : {
      x, y,
      r: (opt && opt.r) || C.HAND_RADIUS,
      heat: (opt && opt.heat != null) ? opt.heat : C.HAND_HEAT,
    };
  }
  setTilt(x, y) { this.tilt.x = Math.max(-0.22, Math.min(0.22, x)); this.tilt.y = Math.max(-0.22, Math.min(0.22, y)); }
  breathe(dt) { this.fog = Math.min(1, this.fog + dt * 0.55); }
  ventFog(dt) { this.fog = Math.max(0, this.fog - dt * 0.22); }
  setLid(v) { this.lid = !!v; }
  setCurtain(v) { this.curtain = Math.max(0, Math.min(1, v)); }
  setLamp(v) { this.lampOn = !!v; }

  // -- the page (bible §12.3) — max three reversals, one clause per line ------
  //
  // ⚠️⚠️ THE BOOK USED TO GO BLIND, and this is the game's whole promise (P2).
  // `score` freezes rarity as 1/sqrt(count-so-far), so the FIRST death ever
  // scores 1.0 and the hundredth scores 0.1. Measured on a real 240-day colony:
  // every page still spanned days 0-62. A hundred and seventy-eight days of
  // lived history could never appear, no matter what happened in them.
  // Recency weighting does NOT fix this — the rarity gap is ~12x and swamps any
  // honest lift (tested: identical page). STRATIFYING fixes it. A life gets a
  // beginning, a middle and an end, and "remarkable" means remarkable FOR ITS
  // OWN TIME — a second mutation on day 80 is news even though it is the
  // thirty-seventh overall.
  page(fromDay = 0) {
    const MAX = 7;
    const pool = this.chronicle.filter(e => e.day >= fromDay);
    if (!pool.length) return [];
    const lo = pool[0].day, hi = Math.max(this.day, lo);
    // a short run is one act; there is no middle of a life that just started
    const ACTS = (hi - lo) < 6 ? 1 : 3;
    const per = ACTS === 1 ? [MAX] : [3, 2, 2];
    const width = (hi - lo + 1) / ACTS;

    const out = [], used = new Set(), perKind = {};
    const take = (list, quota) => {
      let n = 0;
      for (const e of list) {
        if (n >= quota) break;
        if (used.has(e)) continue;
        if ((perKind[e.kind] || 0) >= 2) continue;   // no kind dominates the page
        perKind[e.kind] = (perKind[e.kind] || 0) + 1;
        out.push(e); used.add(e); n++;
      }
    };

    for (let a = 0; a < ACTS; a++) {
      const s0 = lo + width * a;
      const s1 = a === ACTS - 1 ? hi + 1 : lo + width * (a + 1);
      const band = pool.filter(e => e.day >= s0 && e.day < s1);
      if (!band.length) continue;
      const local = new Map();
      for (const e of band) local.set(e.kind, (local.get(e.kind) || 0) + 1);
      // rare FOR ITS OWN ACT. `w` is the intent weight; old saves predate it.
      const rank = new Map(band.map(e => [e, (e.w != null ? e.w : e.score) / Math.sqrt(local.get(e.kind))]));
      band.sort((x, y) => rank.get(y) - rank.get(x));
      take(band, per[a]);
    }
    // a quiet act must not shorten the book — top it up from the whole run
    if (out.length < MAX) take(pool.slice().sort((a, b) => b.score - a.score), MAX - out.length);
    out.sort((a, b) => a.day - b.day);
    return out;
  }

  // -- save / restore --------------------------------------------------------
  // ⚠️ THIS WAS A FALSE GREEN. The save round-trip tests lean entirely on the
  // fingerprint, and it used to read only position/age/fields — so wiping the
  // whole genome, every nameId, glued, tender, humid, curtain, lid, strain and
  // stats.buried left it IDENTICAL. A test that cannot fail is not a test, and
  // any new per-kin array would be invisible to it by construction. If you add
  // persistent state, ADD IT HERE TOO.
  fingerprint() {
    let h = 2166136261 >>> 0;
    const mix = (v) => { h ^= (v * 1000 | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; };
    const k = this.k, G = LOCI.length * 2, NN = NEEDS.length;
    mix(this.tick); mix(this.alive || 0); mix(this.stats.born); mix(this.stats.died);
    mix(this.stats.buried); mix(this.graves.length); mix(this.corpses.length);
    // ⚠️ NOT chronicle.length. The save deliberately keeps only the opening
    // plus the recent past (HEAD_KEEP), so a restored colony legitimately holds
    // fewer entries than the one it came from — asserting on it made the
    // fingerprint fail for a save that had lost nothing at all.
    mix(this.names.length); mix(this.works.length);
    mix(this.workSeq);
    for (const o of this.works) { mix(o.id || 0); mix(o.kind); mix(o.x); mix(o.y); mix(o.prog); mix(o.stock || 0); }
    for (const p of this.prac) { mix(p.invented); mix(p.lost); mix(p.tradition); mix(p.reinvented); }
    for (const key of Object.keys(this.placeNames).sort()) mix(key.length + this.placeNames[key].length);
    mix(this.humid); mix(this.rainLeft); mix(this.curtain); mix(this.lid ? 1 : 0); mix(this.lampOn ? 1 : 0);
    // ⚠️⚠️ THE ROOM'S OWN TEMPERATURE. Every other control in this room was
    // folded — the sheet, the bulb, the window, the damp — and `ambientBase`,
    // which is the one every single cell of the board relaxes toward, was not.
    // It round-trips through the save (toJSON/fromJSON both carry it) so the
    // hole was invisible: two colonies, one in a 19° room and one in a 42° room,
    // hashed EQUAL. Measured on seed 3 from day 100, thirty days later: the 19°
    // town has 26 alive and the 42° town has NONE, sixteen of them dead of heat.
    // The save round-trip test would have passed while the room reset underneath
    // the colony. Same class as `p.techs.size`, `p.mods` and the stale `alive`
    // count — anything the sim reads every tick has to be in here.
    mix(this.ambientBase);
    mix(this.age == null ? -1 : this.age);   // an age that desyncs must be visible
    mix(this.foundings);
    mix(this.ageBest);
    // ⚠️ THE SHAPED GROUND HAS TO BE IN HERE. `height` is not saved and the
    // harness compares two towns by this number, so without folding the
    // player's own terrain a save that had a hill in it and one that did not
    // would hash EQUAL — and the round-trip test would cheerfully pass while
    // silently flattening the one thing in this world that never decays.
    // Folded by INDEX as well as value so the same lump in the wrong place
    // cannot cancel out.
    for (let i = 0; i < this.lump.length; i++) if (this.lump[i] !== 0) { mix(i); mix(this.lump[i]); }
    mix(this.held ? this.held.id + 1 : 0);
    // the shunned ground, now that it changes where they will walk
    mix(this._lifted ? this._lifted.x + 1 : 0); mix(this._lifted ? this._lifted.y + 1 : 0);
    mix(this.gifts.length);
    for (const gf of this.gifts) { mix(gf.x); mix(gf.y); mix(gf.mass); mix(gf.day); }
    for (let id = 0; id < this.count; id++) {
      if (!k.alive[id]) continue;
      mix(k.x[id]); mix(k.y[id]); mix(k.age[id]); mix(k.stage[id]); mix(k.strain[id]);
      mix(k.nameId[id]); mix(k.glued[id]); mix(k.tender[id]); mix(k.goal[id]); mix(k.knows[id]);
      mix(k.memX[id]); mix(k.memY[id]); mix(k.memV[id]); mix(k.saw[id]); mix(k.home[id]); mix(k.homeTier[id]);
      for (let j = 0; j < G; j++) mix(k.genome[id * G + j]);
      for (let n = 0; n < NN; n++) mix(k.need[id * NN + n]);
    }
    for (let i = 0; i < this.N * this.N; i += 37) { mix(this.temp[i]); mix(this.water[i]); mix(this.moss[i]); mix(this.moist[i]); mix(this.worn[i]); }
    return (h >>> 0).toString(16);
  }

  toJSON() {
    return {
      v: 1, seed: this.seed, tick: this.tick, day: this.day, dayFrac: this.dayFrac,
      count: this.count, free: this.free.slice(), names: this.names.slice(),
      graves: this.graves, corpses: this.corpses, stats: this.stats,
      works: this.works, prac: this.prac, workSeq: this.workSeq,
      placeMem: this.placeMem, placeNames: this.placeNames,
      // keep the opening AND the recent past — see HEAD_KEEP in log()
      chronicle: this.chronicle.length <= 600 ? this.chronicle.slice()
        : this.chronicle.slice(0, HEAD_KEEP).concat(this.chronicle.slice(-(600 - HEAD_KEEP))),
      curtain: this.curtain, lampOn: this.lampOn, lid: this.lid, ambientBase: this.ambientBase,
      // ⚠️ a save written while a kin is in the air. Without this the held kin
      // reloads standing wherever it was picked up, quietly undoing the one
      // irreversible act in the game.
      held: this.held,
      // ⚠️ NOW THAT `_lifted` STEERS DECISIONS it has to travel. It was written
      // by lift() and read by nothing, so leaving it out cost nothing; the
      // moment the shunned-ground bias above reads it, a save that dropped it
      // would reload a town that had forgiven you.
      lifted: this._lifted || null,
      // ⚠️ only the NAME. The baked terrain is tens of thousands of numbers and
      // it never changes -- everything the player did to the ground is in `lump`.
      // The loader re-fetches worlds/<name>.json and hands it to fromJSON.
      worldName: this.worldName || null,
      gifts: this.gifts,
      humid: this.humid, rainLeft: this.rainLeft, fog: this.fog,
      foundings: this.foundings, ageBest: this.ageBest,
      // ⚠ the age is DERIVED, but the LAST-SEEN age is state: without it a
      // reload replays every age-turn beat the town ever had into the page.
      age: this.age == null ? null : this.age,
      // ⚠️ NO height HERE ON PURPOSE — it is regenerated bit-identically from
      // the seed by fromJSON's own constructor call, and at N=96 a redundant
      // copy is ~170KB written every 25 seconds for nothing.
      // ⚠️ But the player's OWN ground has to travel, or every hill they ever
      // made vanishes on reload. `lump` is almost entirely zeros, so it goes as
      // a sparse [index, delta, index, delta, …] pair list — a town that has
      // never been shaped costs one empty array, and a heavily worked board is
      // still a fraction of a dense copy.
      lump: (() => {
        const out = [];
        for (let i = 0; i < this.lump.length; i++) if (this.lump[i] !== 0) out.push(i, this.lump[i]);
        return out;
      })(),
      fields: {
        temp: Array.from(this.temp), water: Array.from(this.water),
        moss: Array.from(this.moss), moist: Array.from(this.moist),
        worn: Array.from(this.worn),
      },
      k: Object.fromEntries(Object.entries(this.k).map(([key, arr]) => [key, Array.from(arr)])),
      pond: this.pond, yard: this.yard, hearth: this.hearth, lang: this.lang,
      // ⚠️ THE NARRATOR'S OWN STATE. These look like scratch variables but they
      // decide WHEN the town gets to speak — the hatch counter fires one line in
      // seven, the rain and tend logs hold an 8-11 day silence, and eventCounts
      // is the rarity ledger every future score is divided by. Left unsaved, a
      // restored colony was byte-identical in body and told its story on a
      // different rhythm. The widened fingerprint caught it immediately.
      narr: {
        hatches: this._hatches || 0,
        lastRainLog: this._lastRainLog == null ? null : this._lastRainLog,
        tendLog: this._tendLog == null ? null : this._tendLog,
        ended: !!this._ended,
        duskSweep: this._duskSweep == null ? null : this._duskSweep,
        counts: Array.from(this.eventCounts.entries()),
      },
      rngState: [this.rng.getState(), this.rngWeather.getState(), this.rngGene.getState()],
    };
  }

  // ⚠⚠ `world` IS A SECOND ARGUMENT, NOT A FIELD OF THE SAVE, and it has to be.
  // The noise terrain regenerates bit-identically from the seed, which is why
  // `height` is not stored. A BAKED terrain cannot: it came off the network from
  // OpenStreetMap and AWS, and reproducing it would mean re-baking. So the save
  // carries `worldName` and the CALLER re-loads the world file and passes it in.
  // ⚠️ Callers that pass nothing keep the old behaviour exactly -- every existing
  // test and every generated-world save is unaffected.
  // ⚠️ If a save names a world and the caller does not supply it, we do NOT
  // silently fall back to noise: that would restore a colony onto a completely
  // different landscape, with its homes, graves and pond all in the wrong place.
  static fromJSON(o, world = null) {
    // ⚠️ THE WORLD MUST BE PRESENT BEFORE THE CONSTRUCTOR RUNS, because the
    // constructor is what calls _genWorld -- pass it late and the colony is laid
    // onto noise and then told it lives somewhere else.
    if (o.worldName && !world) {
      throw new Error('this colony lives in "' + o.worldName + '" — load worlds/' + o.worldName + '.json and pass it to fromJSON');
    }
    const s = new Sim({ seed: o.seed, founders: 0, world });
    // refuse a save from a differently-shaped world rather than lay it into
    // this one — boot() catches this, keeps the blob, and starts fresh
    const want = s.N * s.N;
    for (const key of ['temp', 'water', 'moss', 'moist']) {
      const a = o.fields && o.fields[key];
      if (a && a.length !== want) {
        throw new Error(`save is from a ${Math.round(Math.sqrt(a.length))}-grid world, this build is ${s.N}`);
      }
    }
    if (o.k && o.k.alive && o.k.alive.length > C.CAP) throw new Error("save exceeds this build capacity");
    s.tick = o.tick; s.day = o.day; s.dayFrac = o.dayFrac;
    s.count = o.count; s.free = o.free.slice(); s.names = o.names.slice();
    s.graves = o.graves; s.corpses = o.corpses; s.stats = o.stats;
    s.works = o.works || [];
    // ⚠️ MIGRATION: saves from before work ids existed. Assign 0..n-1 in array
    // order (deterministic — the order the save carried them) and set workSeq
    // past the top so new works never collide with migrated ones.
    let maxId = -1;
    for (let i = 0; i < s.works.length; i++) {
      if (s.works[i].id == null) s.works[i].id = i;
      if (s.works[i].id > maxId) maxId = s.works[i].id;
    }
    s.workSeq = o.workSeq != null ? o.workSeq : maxId + 1;
    if (s.workSeq <= maxId) s.workSeq = maxId + 1;   // a corrupt seq must never mint a duplicate id
    if (o.prac) {
      s.prac = o.prac;
      // ⚠️ a save written when the ladder was SHORTER: pad the missing rungs
      // with fresh never-invented entries, or every loop over prac indexes
      // undefined the moment a new rung ships.
      while (s.prac.length < WORKS.length) {
        s.prac.push({ invented: -1, inventor: -1, inventorGone: -1, lost: -1, tradition: -1, reinvented: 0, tries: 0 });
      }
    }
    // ⚠ null, not 0: a save from before the ages shipped has no age at all,
    // and _daily seeds it from the board on the first tick instead of
    // announcing the gathering days to a town that is centuries past them.
    s.age = o.age == null ? null : o.age;
    s.foundings = o.foundings || 1;
    // max with the standing board so a legacy save seeds sanely
    s.ageBest = Math.max(o.ageBest || 0, s.ageNow());
    // ⚠ LEGACY FALLBACK ONLY, and it reads the SAVE's own array. The first
    // version counted s.k.alive — which is not restored until far below this
    // line, so it counted the constructor's empty arrays and flagged EVERY
    // living town dead; the last page then fired over the title screen.
    // Modern saves are overwritten by the authoritative narr.ended a few
    // lines down; this exists so a pre-narr save of a long-dead town does not
    // announce the end a second time on load.
    { let liv = 0;
      if (o.k && o.k.alive) for (let i2 = 0; i2 < o.k.alive.length; i2++) if (o.k.alive[i2]) liv++;
      s._ended = liv === 0 && s.count > 0; }
    s.placeMem = o.placeMem || {};
    s.placeNames = o.placeNames || {};
    s.chronicle = o.chronicle; s.curtain = o.curtain; s.lampOn = o.lampOn;
    s.lid = o.lid; s.humid = o.humid; s.rainLeft = o.rainLeft; s.fog = o.fog || 0;
    s.held = o.held || null;
    s._lifted = o.lifted || null;
    s.gifts = o.gifts || [];
    s.ambientBase = o.ambientBase != null ? o.ambientBase : C.AMBIENT_BASE;
    s.pond = o.pond; s.yard = o.yard; s.hearth = o.hearth || o.yard; s.lang = o.lang;
    if (o.narr) {
      s._hatches = o.narr.hatches || 0;
      s._lastRainLog = o.narr.lastRainLog == null ? undefined : o.narr.lastRainLog;
      s._tendLog = o.narr.tendLog == null ? undefined : o.narr.tendLog;
      s._ended = !!o.narr.ended;
      s._duskSweep = o.narr.duskSweep == null ? undefined : o.narr.duskSweep;
      s.eventCounts = new Map(o.narr.counts || []);
    } else {
      // a save from before the narrator's state round-tripped: rebuild the
      // rarity ledger from the chronicle we did keep, so scores stay sane
      s.eventCounts = new Map();
      for (const e of (o.chronicle || [])) s.eventCounts.set(e.kind, (s.eventCounts.get(e.kind) || 0) + 1);
    }
    if (o.rngState) { s.rng.setState(o.rngState[0]); s.rngWeather.setState(o.rngState[1]); s.rngGene.setState(o.rngState[2]); }
    // older saves carry height; newer ones do not, and either is fine
    for (const key of ['height', 'temp', 'water', 'moss', 'moist', 'worn']) {
      if (o.fields[key]) s[key].set(o.fields[key]);
    }
    // ⚠️ THE PLAYER'S GROUND GOES BACK ON AFTER GENESIS, NEVER BEFORE IT. The
    // constructor has already run `_genWorld`, which derived the pond, the
    // graveyard and the hearth from the UNSHAPED height — which is exactly
    // right, because those are the same landmarks the save carries and they
    // must not move because somebody built a hill near them. Only now do we
    // put the hill back.
    // ⚠️ And it is added to `height`, not assigned: `height` already holds the
    // regenerated base, and `lump` is the delta from it.
    if (o.lump && o.lump.length) {
      for (let q = 0; q < o.lump.length; q += 2) {
        const i = o.lump[q], d = o.lump[q + 1];
        if (i >= 0 && i < s.lump.length) { s.lump[i] = d; s.height[i] += d; }
      }
    }
    for (const key of Object.keys(s.k)) if (o.k[key]) s.k[key].set(o.k[key]);
    // ⚠️ MANDATORY for the home array: a save from before homes has no k.home,
    // the constructor default would be 0, and 0 is a real work id — every kin
    // in an old save would wake up owning the first thing the town ever built.
    if (!o.k.home) s.k.home.fill(-1);
    // ⚠️ a held kin who is not alive would sit in this.held forever, and lift()
    // refuses while anything is held — so one bad blob would silently disable the
    // power for the rest of that town's life, with nothing to see and nothing to
    // blame. Cheap to check once here; impossible to diagnose later. (⚠️ this must
    // go AFTER k is restored, and there are two `let alive = 0` lines in this
    // file — the first is inside _kin, where there is no `s`.)
    if (s.held && !(s.held.id >= 0 && s.held.id < s.count && s.k.alive[s.held.id])) s.held = null;
    let alive = 0, sumB = 0;
    for (let i = 0; i < s.count; i++) if (s.k.alive[i]) { alive++; sumB += s.k.bright[i]; }
    s.alive = alive;
    s.wellbeing = alive ? sumB / alive : 0;   // the audio reads this on frame one
    return s;
  }
}

export default Sim;
