// DON'T TOUCH — palette.js
// The lantern is the entire user interface (Invariant 7). If a player cannot
// separate the hues, this game has no interface at all — so this is not an
// accessibility nicety here, it decides whether the thing is playable.
//
// ⚠️⚠️ THE REMAP IS VIEW-SIDE AND NOWHERE ELSE. `k.hue[id]` is written in SIM
// code (`_lantern` blends the genetic LANTERN_HUE toward the dominant NEED_HUE)
// and it lives in a Float64Array inside `k`, so it round-trips through the save
// and folds into the fingerprint. Rewriting LANTERN_HUE or NEED_HUE to fix a
// palette would change persistent state and make two players on the same seed
// disagree about their own town. Everything here happens at PAINT time.
//
// ⚠️ MEASURED, NOT CHOSEN. CIE Lab ΔE of the worst pair in each set, under the
// Viénot dichromat projection. Under ~12 means two colours read as one:
//
//                       need hues        genetic hues
//   as painted, normal      26.2             44.3
//   as painted, protan      21.7             10.2
//   as painted, DEUTAN       1.0              6.7   <- no interface at all
//   as painted, tritan      12.5             14.0
//   green&red palette, deutan 23.6            31.1
//   blue&yellow palette, tritan 20.2          27.3
//
// The need hues were the emergency, not the bloodline ones: NEED warmth 205 and
// water 190 are fifteen degrees apart and are the two commonest unmet needs, so
// for roughly one man in twelve the light that says "I am freezing" and the one
// that says "I am dying of thirst" were the same colour.
//
// ⚠️ AND HUE ALONE CANNOT CARRY SIX CATEGORIES FOR A DICHROMAT — the surviving
// vision is essentially one axis. A first attempt folded the wheel onto that
// axis and collapsed everything to ΔE 1 (many-to-one: two hues either side of
// the axis land on the same target). These warps are MONOTONIC and bijective,
// which is the most hue can do; the glyph channel below is the rest of the
// answer, and it is not optional.

const N = 360;

// Control points, solved by hill-climb over the gaps between consecutive
// targets (which keeps the map monotonic around the circle by construction),
// maximising the worst pair inside the need set and inside the genetic set,
// under the target vision AND under normal vision so the look survives.
const SRC = [3, 18, 38, 44, 104, 172, 190, 205, 262, 282, 292, 340];
const DST = {
  deutan: [248, 256, 314, 329, 12, 60, 68, 131, 166, 184, 200, 211],
  tritan: [54, 81, 114, 177, 216, 261, 268, 311, 359, 8, 31, 42],
};

function identity() {
  const a = new Float32Array(N);
  for (let i = 0; i < N; i++) a[i] = i;
  return a;
}

// piecewise-linear around the circle, through the control points.
// ⚠️ CONTINUOUS on purpose, never a twelve-entry lookup: lantern hues are
// BLENDS — a kin part-way to thirst sits between two named colours — so
// snapping to control points would quantise the living into twelve buckets and
// throw away the approach-to-death the blend exists to show.
function warp(dst) {
  const a = new Float32Array(N);
  const K = SRC.length;
  for (let i = 0; i < N; i++) {
    let k = K - 1;
    for (let j = 0; j < K; j++) if (SRC[j] <= i) k = j;
    if (i < SRC[0]) k = K - 1;                        // wrapped below the first
    const s0 = SRC[k], s1 = SRC[(k + 1) % K];
    const d0 = dst[k], d1 = dst[(k + 1) % K];
    const span = ((s1 - s0) + 360) % 360 || 360;
    const t = (((i - s0) + 360) % 360) / span;
    const jump = ((d1 - d0) + 360) % 360;
    a[i] = (d0 + jump * t) % 360;
  }
  return a;
}

export const PALETTES = {
  off: identity,
  deutan: () => warp(DST.deutan),   // green–red blindness (deuter/protanopia)
  tritan: () => warp(DST.tritan),   // blue–yellow blindness
};

// The live table. ui.js and view.js import THIS OBJECT; ES modules share one
// instance, so changing the setting updates every reader at once.
export const LUT = { mode: 'off', map: identity(), glyphs: false };

export function setPalette(mode) {
  LUT.mode = PALETTES[mode] ? mode : 'off';
  LUT.map = (PALETTES[LUT.mode])();
}
export function setGlyphs(on) { LUT.glyphs = !!on; }

// hue in degrees -> hue in degrees, through whichever palette is live
export function hueOf(h) {
  return LUT.map[(((h | 0) % 360) + 360) % 360];
}

// THE SECOND CHANNEL, so colour is never the only thing carrying the message.
// One mark per need, in the order NEEDS is declared in sim.js.
//        warmth water food  rest  company safety
export const NEED_MARK = ['≡', '~', '•', ')', 'o', '!'];
export const NEED_WORD = ['cold', 'thirsty', 'hungry', 'tired', 'alone', 'afraid'];

// which need is furthest from met — the same six reads _lantern does
export function worstNeed(need, base) {
  let w = 0, wv = need[base];
  for (let n = 1; n < 6; n++) if (need[base + n] < wv) { wv = need[base + n]; w = n; }
  return w;
}
