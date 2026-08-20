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
  N: 64,                 // heightfield resolution
  TICK_HZ: 15,
  TICKS_PER_DAY: 900,    // 60 real seconds per in-game day at 1x
  CAP: 400,              // max kin

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
  MOSS_IDEAL: 24.0,
  MOSS_BAND: 13.0,
  MOSS_EAT: 0.34,        // moss consumed by one feeding

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
    this.temp = new Float64Array(n2);
    this.tmp2 = new Float64Array(n2);
    this.water = new Float64Array(n2);
    this.moss = new Float64Array(n2);
    this.moist = new Float64Array(n2);

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
    };
    this.names = [];           // nameId -> string
    this.free = [];            // free kin slots
    this.count = 0;

    this.graves = [];          // {x,y,nameId,day,gen}
    this.corpses = [];         // {x,y,nameId,t}
    this.chronicle = [];       // {day,kind,text}
    this.stats = { born: 0, died: 0, buried: 0, peak: 0, generations: 1 };
    this.eventCounts = new Map(); // for the sifter's rarity ranking (§12.2)

    // player state
    this.hand = null;          // {x,y} in cell space, or null
    this.tilt = { x: 0, y: 0 };
    this.fog = 0;              // 0..1, the player's breath on the outside
    this.humid = 5.0;          // suspended water inside the sealed jar
    this.rainLeft = 0;         // water still to fall from the current cloud
    this.lid = false;
    this.curtain = 0.75;       // 0 = closed, 1 = open
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

    this._genWorld();
    // ⚠️⚠️ `||` MEANT `founders: 0` SPAWNED FOURTEEN. Sim.fromJSON restores into
    // `new Sim({seed, founders: 0})`, so every load ran a full phantom founding
    // first. That was merely wasteful while every k array was overwritten — but
    // fromJSON restores with `if (o.k[key])`, so the moment a NEW per-kin array
    // ships, a save written before it keeps the phantom values. A v0.2 save
    // loaded here came back with a glued stranger frozen mid-board and 24 of 36
    // kin believing kin 0 was tending them. `??` is load-bearing.
    this._seedColony(opts.founders ?? 14);
  }

  // -- world -----------------------------------------------------------------
  _genWorld() {
    const N = this.N, s = this.seed;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      let h = 0, amp = 1, f = 1 / 22, tot = 0;
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
    this.pond = pn ? { x: (px / pn) | 0, y: (py / pn) | 0 } : { x: li % N, y: (li / N) | 0 };
    for (let i = 0; i < N * N; i++) {
      const wet = this.water[i] > 0.001 ? 0 : 1;
      this.moss[i] = wet * Math.max(0, vnoise((i % N) * 0.09, ((i / N) | 0) * 0.09, s + 13) * 1.3 - 0.32);
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
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      if (this.water[i] > 0.001 || !this.inJar(x, y)) continue;
      if (this.height[i] < this.pondLevel + 0.10) continue;   // above the flood line
      const dx2 = x - this.pond.x, dy2 = y - this.pond.y;
      const dp = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      const dm = Math.abs(dp - 8);                       // want to be ~8 cells from water
      const sc = -dm * 2 - this.height[i] * 2 + this.moss[i] * 4;
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
        const px = this.hearth.x + tcos(a) * rr(rng, 0.5, 3.2);
        const py = this.hearth.y + tsin(a) * rr(rng, 0.5, 3.2);
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
    this.log('open', `the town. ${this.count} of them, and nothing yet has a name for the sky.`);
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
    k.glued[id] = 0; k.tender[id] = -1;
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
      this._growth(F);
    }
    this._kin();
  }

  _thermal(F) {
    const N = this.N, T = this.temp, T2 = this.tmp2;
    const amb = this.ambient + this.daylight * C.SUN_GAIN;
    const loss = Math.min(0.5, (C.LOSS + (this.lid ? C.LID_LOSS : 0)) * F);
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
      const hx = this.hand.x, hy = this.hand.y, R = C.HAND_RADIUS;
      const x0 = Math.max(0, (hx - R) | 0), x1 = Math.min(N - 1, (hx + R) | 0);
      const y0 = Math.max(0, (hy - R) | 0), y1 = Math.min(N - 1, (hy + R) | 0);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x - hx, dy = y - hy, d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;
        const f = 1 - d / R;
        T2[y * N + x] += (C.HAND_HEAT - T2[y * N + x]) * Math.min(0.4, C.HAND_K * F) * f * (0.45 + 0.55 * f);
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
    if (this.lid) this.humid = Math.max(0, this.humid * (1 - C.VENT * F));
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
    if (this.fog > 0.999) { this.humid += 4.5; this.fog = 0; this.log('breath', 'you breathed on the town, and weather happened.', 1.1); }
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
      else if (k.stage[id] === STAGE.HALF && k.age[id] > C.HALF_DAYS) k.stage[id] = STAGE.WHOLE;
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

      // warmth is not a decay, it's a reading of where you are standing
      const comfort = (T >= band[0] && T <= band[1]) ? 1
        : 1 - Math.min(1, (T < band[0] ? band[0] - T : T - band[1]) / 14);
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
        k.strain[id] = Math.max(0, k.strain[id] - dt / 1.4);
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
          if (dx * dx + dy * dy < 6.25) {
            for (let n = 1; n < NN; n++) k.need[base + n] = Math.min(1, k.need[base + n] + 0.004);
          }
        }
        this._move(id); this._lantern(id, g); continue;
      }

      // decide — a kin COMMITS to a goal. Re-deciding every tick makes them
      // thrash in place and starve twenty cells from the pond. ⚠️ do not remove.
      k.hold[id] -= 1;
      const band2 = HIDE_BAND[expressed(g, L.hide)];
      const emergency = this.temp[i] > band2[3] - 4 || this.water[i] > 0.07;
      const satisfied = this._goalMet(id);
      if (k.hold[id] <= 0 || satisfied || (emergency && k.goal[id] !== 6)) {
        if ((this.tick + id) % 3 === 0 || k.hold[id] <= -30 || emergency) this._decide(id, g);
      }
      this._move(id);
      this._act(id, g);
      this._lantern(id, g);
      sumB += k.bright[id];
    }
    this.alive = alive;
    this.wellbeing = alive ? sumB / alive : 0;
    if (alive > this.stats.peak) this.stats.peak = alive;
    this._corpses();
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
    const hunger = 1 - k.need[base + 2];
    const R = 7 + hunger * hunger * 26;
    const near2 = 0.6 - hunger * 0.45;
    let bm = 0, bmx = x, bmy = y;
    for (let s = 0; s < 18; s++) {
      const px = x + rr(rng, -R, R), py = y + rr(rng, -R, R);
      const i = this.idx(px, py);
      if (this.water[i] > 0.05) continue;
      const d = Math.abs(px - x) + Math.abs(py - y);
      const v = this.moss[i] / (1 + d * near2 * 0.2);
      if (v > bm) { bm = v; bmx = px; bmy = py; }
    }
    push(1, bmx, bmy, deficit(2) * (0.3 + bm * 2.6));

    // water: the pond, or the nearest wet cell
    // ⚠️ Drink from the BANK, not from the middle of the pond. Targeting water
    // itself walks them into the low end, and then it rains and they drown.
    const thirst = 1 - k.need[base + 1];
    const RW = 10 + thirst * thirst * 26;
    let bw = 0, bwx = x, bwy = y;
    for (let s = 0; s < 18; s++) {
      const px = x + rr(rng, -RW, RW), py = y + rr(rng, -RW, RW);
      const i = this.idx(px, py);
      if (this.water[i] > 0.03) continue;                    // that's the pond, not the bank
      let beside = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const w = this.water[this.idx(px + dx * 1.4, py + dy * 1.4)];
        if (w > beside) beside = w;
      }
      if (beside <= 0.004) continue;
      const d = Math.abs(px - x) + Math.abs(py - y);
      const v = Math.min(0.2, beside) / (1 + d * 0.1);
      if (v > bw) { bw = v; bwx = px; bwy = py; }
    }
    if (bw <= 0) {
      // no bank found nearby — head for the pond's edge, not its middle
      const dx = x - this.pond.x, dy = y - this.pond.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      bwx = this.pond.x + (dx / d) * 6; bwy = this.pond.y + (dy / d) * 6; bw = 0.09;
    }
    push(2, bwx, bwy, deficit(1) * (0.9 + bw * 8));

    // warmth: sample for a cell inside the comfort band
    const band = HIDE_BAND[expressed(g, L.hide)];
    let bt = 0, btx = x, bty = y;
    for (let s = 0; s < 12; s++) {
      const px = x + rr(rng, -11, 11), py = y + rr(rng, -11, 11);
      const i = this.idx(px, py), T = this.temp[i];
      if (T > band[3] - 3 || T < band[2] + 2) continue;
      const inb = (T >= band[0] && T <= band[1]) ? 1 : 0.25;
      const d = Math.abs(px - x) + Math.abs(py - y);
      const v = inb / (1 + d * 0.12);
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
      const v = 1 / (1 + d * 0.16);
      if (v > bc) { bc = v; bcx = k.x[o]; bcy = k.y[o]; }
    }
    push(5, bcx, bcy, deficit(4) * (0.3 + bc * 1.4));

    // flee: too hot, too wet
    const here = this.idx(x, y);
    if (this.temp[here] > band[3] - 4 || this.water[here] > 0.07) {
      let ex = x, ey = y, best = -1e9;
      for (let s = 0; s < 18; s++) {
        const px = x + rr(rng, -14, 14), py = y + rr(rng, -14, 14);
        const i = this.idx(px, py);
        const sc = -Math.max(0, this.temp[i] - band[1]) - this.water[i] * 60 + this.eff(i) * 3;
        if (sc > best) { best = sc; ex = px; ey = py; }
      }
      push(6, ex, ey, 3.4);
    }

    // mate
    const mean = (() => { let m = 0; for (let n = 0; n < NN; n++) m += k.need[base + n]; return m / NN; })();
    if (!k.glued[id] && k.stage[id] === STAGE.WHOLE && k.cool[id] <= 0 && mean > C.BREED_MIN && k.sex[id] === 0) {
      let mx = x, my = y, mi = -1, bv = 0;
      for (let s = 0; s < 20; s++) {
        const o = ri(rng, this.count);
        if (!k.alive[o] || o === id || k.sex[o] !== 1 || k.stage[o] !== STAGE.WHOLE || k.cool[o] > 0) continue;
        const dx = k.x[o] - x, dy = k.y[o] - y, d = Math.sqrt(dx * dx + dy * dy);
        const v = 1 / (1 + d * 0.1);
        if (v > bv) { bv = v; mx = k.x[o]; my = k.y[o]; mi = o; }
      }
      if (mi >= 0) { push(7, mx, my, (mean - C.BREED_MIN) * 5.2); k.goalT[id] = mi; }
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
      if (best) push(8, best.x, best.y, 1.35 * k.need[base + 2] / (1 + bd * 0.08));
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
        cand.push({ goal: 9, tx: k.x[t], ty: k.y[t], who: t, score: (1 - worst) * 2.5 / (1 + d * 0.06) });
      }
    }

    if (!cand.length) {
      k.goal[id] = 0;
      k.tx[id] = k.glued[id] ? x : x + rr(rng, -4, 4);
      k.ty[id] = k.glued[id] ? y : y + rr(rng, -4, 4);
      k.hold[id] = 90; return;
    }
    // rank, then pick randomly from the top three (The Sims' trick, §6.1)
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
      case 2: return k.need[b + 1] > 0.93;
      case 3: return k.need[b + 0] > 0.93;
      case 4: return k.need[b + 3] > 0.93;
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
    if (d < 0.35) return;
    let sp = C.SPEED * (k.stage[id] === STAGE.NIB ? 1.25 : k.stage[id] === STAGE.HALF ? 1.15 : k.stage[id] === STAGE.RIME ? 0.72 : 1);
    if (k.goal[id] === 6) sp *= 1.8;
    const i = this.idx(k.x[id], k.y[id]);
    if (this.water[i] > 0.03) sp *= 0.45;
    // downhill on a tilted world is faster and less voluntary
    const gx = this.eff(this.idx(k.x[id] + 1, k.y[id])) - this.eff(this.idx(k.x[id] - 1, k.y[id]));
    const gy = this.eff(this.idx(k.x[id], k.y[id] + 1)) - this.eff(this.idx(k.x[id], k.y[id] - 1));
    const slide = 2.4;
    k.x[id] += (dx / d) * sp - gx * slide * sp;
    k.y[id] += (dy / d) * sp - gy * slide * sp;
    this._keepIn(id);
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
    const near = Math.abs(k.tx[id] - k.x[id]) + Math.abs(k.ty[id] - k.y[id]) < 0.8;
    switch (k.goal[id]) {
      case 1: if (near && this.moss[i] > 0.05) {
        const take = Math.min(this.moss[i], C.MOSS_EAT * 0.06);
        this.moss[i] -= take; k.need[base + 2] = Math.min(1, k.need[base + 2] + take * 1.5);
      } break;
      case 2: { // they drink at the bank, not by standing in it
        let wet = this.water[i];
        if (wet <= 0.004) {
          const N = this.N, cx = k.x[id] | 0, cy = k.y[id] | 0;
          for (let dy = -1; dy <= 1 && wet <= 0.004; dy++) for (let dx = -1; dx <= 1; dx++) {
            const j = this.idx(cx + dx, cy + dy);
            if (this.water[j] > wet) wet = this.water[j];
          }
        }
        if (wet > 0.004) k.need[base + 1] = Math.min(1, k.need[base + 1] + 0.022);
      } break;
      case 3: break; // standing in the warm place is its own reward (handled by comfort)
      case 4: k.need[base + 3] = Math.min(1, k.need[base + 3] + 0.014); break;
      case 5: if (near) k.need[base + 4] = Math.min(1, k.need[base + 4] + 0.018); break;
      // belt and braces on the range bug above: an errand needs legs
      case 7: if (near && !k.glued[id]) this._breed(id, k.goalT[id] | 0); break;
      case 8: if (near && !k.glued[id] && this.corpses.length) this._carry(id); break;
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
            this.log('tend', `${this.nameOf(id)} went and sat a while with ${this.nameOf(t)}.`, 1.5);
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
      if (rng() > bro[2]) continue;
      const child = new Uint8Array(G);
      for (let li = 0; li < LOCI.length; li++) {
        let a = gm[li * 2 + (rng() < 0.5 ? 0 : 1)];
        let b = gf[li * 2 + (rng() < 0.5 ? 0 : 1)];
        if (rng() < 0.008) { a = ri(rng, LOCI[li].alleles.length); novel = li; }   // §5.2 mutation
        if (rng() < 0.008) { b = ri(rng, LOCI[li].alleles.length); novel = li; }
        child[li * 2] = a; child[li * 2 + 1] = b;
      }
      const id = this._spawn(k.x[mo] + rr(rng, -1.2, 1.2), k.y[mo] + rr(rng, -1.2, 1.2), child, mo, fa,
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

  _die(id, cause) {
    const k = this.k;
    const named = k.nameId[id] >= 0;
    const nm = named ? this.names[k.nameId[id]] : null;
    k.alive[id] = 0;
    this.free.push(id);
    this.stats.died++;
    if (k.stage[id] !== STAGE.EGG) {
      this.corpses.push({ x: k.x[id], y: k.y[id], nameId: k.nameId[id], gen: k.gen[id], t: this.tick, cause, claim: -1, glued: k.glued[id] ? 1 : 0 });
      if (this.corpses.length > 24) this.corpses.shift();
    }
    const how = { age: 'grew old', hunger: 'went hungry', thirst: 'went dry', heat: 'was in the warm place too long', cold: 'went cold', water: 'was in the low end when it filled' }[cause] || 'stopped';
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
      const px = this.yard.x + rr(this.rng, -3.5, 3.5), py = this.yard.y + rr(this.rng, -3.5, 3.5);
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

  _daily() {
    // seasonal room temperature from the real calendar is applied by the view via setRoom()
    if (this.alive === 0 && !this._ended) {
      this._ended = true;
      this.log('end', `the town is quiet. ${this.graves.length} graves in the yard.`, 9);
    }
  }

  placeName(i) {
    const N = this.N, x = i % N, y = (i / N) | 0;
    const dp = Math.abs(x - this.pond.x) + Math.abs(y - this.pond.y);
    const dy_ = Math.abs(x - this.yard.x) + Math.abs(y - this.yard.y);
    if (this.water[i] > 0.02) return 'water';
    if (dp < 9) return 'bank';
    if (dy_ < 7) return 'yard';
    return this.height[i] > 0.55 ? 'high ground' : 'flat';
  }

  // -- player verbs ----------------------------------------------------------
  setHand(x, y) { this.hand = (x == null) ? null : { x, y }; }
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
    mix(this.names.length); mix(this.chronicle.length);
    mix(this.humid); mix(this.rainLeft); mix(this.curtain); mix(this.lid ? 1 : 0); mix(this.lampOn ? 1 : 0);
    for (let id = 0; id < this.count; id++) {
      if (!k.alive[id]) continue;
      mix(k.x[id]); mix(k.y[id]); mix(k.age[id]); mix(k.stage[id]); mix(k.strain[id]);
      mix(k.nameId[id]); mix(k.glued[id]); mix(k.tender[id]); mix(k.goal[id]);
      for (let j = 0; j < G; j++) mix(k.genome[id * G + j]);
      for (let n = 0; n < NN; n++) mix(k.need[id * NN + n]);
    }
    for (let i = 0; i < this.N * this.N; i += 37) { mix(this.temp[i]); mix(this.water[i]); mix(this.moss[i]); mix(this.moist[i]); }
    return (h >>> 0).toString(16);
  }

  toJSON() {
    return {
      v: 1, seed: this.seed, tick: this.tick, day: this.day, dayFrac: this.dayFrac,
      count: this.count, free: this.free.slice(), names: this.names.slice(),
      graves: this.graves, corpses: this.corpses, stats: this.stats,
      // keep the opening AND the recent past — see HEAD_KEEP in log()
      chronicle: this.chronicle.length <= 600 ? this.chronicle.slice()
        : this.chronicle.slice(0, HEAD_KEEP).concat(this.chronicle.slice(-(600 - HEAD_KEEP))),
      curtain: this.curtain, lampOn: this.lampOn, lid: this.lid, ambientBase: this.ambientBase,
      humid: this.humid, rainLeft: this.rainLeft, fog: this.fog,
      fields: {
        height: Array.from(this.height), temp: Array.from(this.temp),
        water: Array.from(this.water), moss: Array.from(this.moss), moist: Array.from(this.moist),
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
        counts: Array.from(this.eventCounts.entries()),
      },
      rngState: [this.rng.getState(), this.rngWeather.getState(), this.rngGene.getState()],
    };
  }

  static fromJSON(o) {
    const s = new Sim({ seed: o.seed, founders: 0 });
    s.tick = o.tick; s.day = o.day; s.dayFrac = o.dayFrac;
    s.count = o.count; s.free = o.free.slice(); s.names = o.names.slice();
    s.graves = o.graves; s.corpses = o.corpses; s.stats = o.stats;
    s.chronicle = o.chronicle; s.curtain = o.curtain; s.lampOn = o.lampOn;
    s.lid = o.lid; s.humid = o.humid; s.rainLeft = o.rainLeft; s.fog = o.fog || 0;
    s.ambientBase = o.ambientBase != null ? o.ambientBase : C.AMBIENT_BASE;
    s.pond = o.pond; s.yard = o.yard; s.hearth = o.hearth || o.yard; s.lang = o.lang;
    if (o.narr) {
      s._hatches = o.narr.hatches || 0;
      s._lastRainLog = o.narr.lastRainLog == null ? undefined : o.narr.lastRainLog;
      s._tendLog = o.narr.tendLog == null ? undefined : o.narr.tendLog;
      s._ended = !!o.narr.ended;
      s.eventCounts = new Map(o.narr.counts || []);
    } else {
      // a save from before the narrator's state round-tripped: rebuild the
      // rarity ledger from the chronicle we did keep, so scores stay sane
      s.eventCounts = new Map();
      for (const e of (o.chronicle || [])) s.eventCounts.set(e.kind, (s.eventCounts.get(e.kind) || 0) + 1);
    }
    if (o.rngState) { s.rng.setState(o.rngState[0]); s.rngWeather.setState(o.rngState[1]); s.rngGene.setState(o.rngState[2]); }
    for (const key of ['height', 'temp', 'water', 'moss', 'moist']) s[key].set(o.fields[key]);
    for (const key of Object.keys(s.k)) if (o.k[key]) s.k[key].set(o.k[key]);
    let alive = 0, sumB = 0;
    for (let i = 0; i < s.count; i++) if (s.k.alive[i]) { alive++; sumB += s.k.bright[i]; }
    s.alive = alive;
    s.wellbeing = alive ? sumB / alive : 0;   // the audio reads this on frame one
    return s;
  }
}

export default Sim;
