// DON'T TOUCH — test-sim.mjs
// Headless battery. `node test-sim.mjs`
// Invariant 4: every era gets a soak, zero errors, no NaN, nothing outside the jar.

import { readFileSync } from 'node:fs';
import { Sim, C, LOCI, L, expressed, NEEDS, STAGE, makeRNG, S, WORKS, WORK_AT, WORK_DONE, AGES, STOCK_CAP } from './sim.js';

let pass = 0, fail = 0;
// ⚠️ the battery is a GATE — the house rule is to run it after every sim
// change, and a gate that costs eight minutes teaches you not to run it. This
// records where the time actually goes, so the expensive tests can be found and
// made to share a fixture rather than each growing their own colony.
const times = [];
const t = (name, fn) => {
  const t0 = Date.now();
  try { const r = fn(); if (r === false) throw new Error('returned false'); pass++; }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`); }
  times.push([Date.now() - t0, name]);
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} expected ${b}, got ${a}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const run = (s, days) => { const n = days * C.TICKS_PER_DAY; for (let i = 0; i < n; i++) s.step(); return s; };
// ⚠️ The fingerprint answers "does it CONTINUE identically", which is a different
// and weaker question than "did the save keep everything". A fingerprint that
// missed the genome, every nameId, glued/tender and the narrator's own counters
// reported a perfect green while the save was quietly losing them. This compares
// the whole serialised state, so a field that fails to round-trip cannot hide.
const norm = (s) => JSON.stringify(s.toJSON());
const saveEqual = (s, m) => {
  const before = norm(s);
  const after = norm(Sim.fromJSON(JSON.parse(before)));
  if (before === after) return;
  let i = 0; while (i < before.length && before[i] === after[i]) i++;
  throw new Error(`${m || 'save'} diverged at char ${i}: ...${before.slice(Math.max(0, i - 70), i + 70)}`);
};

// ⚠️ COLONIES ARE EXPENSIVE — a 240-day town at N=96 is ~40 seconds, and the
// four page tests were each growing their own. Grow one, memoise it, and ask it
// as many questions as it can answer. Anything that needs to advance the sim
// takes a `clone()` so it cannot disturb the shared one.
const FIX = new Map();
const fixture = (seed, days) => {
  const key = seed + ':' + days;
  if (!FIX.has(key)) FIX.set(key, run(new Sim({ seed }), days));
  return FIX.get(key);
};
const clone = (s) => Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));

console.log("DON'T TOUCH — sim battery\n");

// --- RNG -------------------------------------------------------------------
console.log('rng');
t('mulberry32 is deterministic', () => {
  const a = makeRNG('kin'), b = makeRNG('kin');
  for (let i = 0; i < 50; i++) eq(a(), b(), 'draw');
});
t('different seeds diverge', () => {
  const a = makeRNG('kin'), b = makeRNG('kim');
  let same = 0; for (let i = 0; i < 50; i++) if (a() === b()) same++;
  ok(same === 0, 'seeds collided');
});
t('draws are in [0,1)', () => {
  const r = makeRNG(7); for (let i = 0; i < 2000; i++) { const v = r(); ok(v >= 0 && v < 1, `out of range ${v}`); }
});

// --- world -----------------------------------------------------------------
console.log('world');
t('terrain generates finite heights', () => {
  const s = new Sim({ seed: 'a' });
  for (let i = 0; i < s.N * s.N; i++) ok(Number.isFinite(s.height[i]), 'NaN height');
});
t('a pond exists and holds water', () => {
  const s = new Sim({ seed: 'a' });
  let w = 0; for (let i = 0; i < s.N * s.N; i++) w += s.water[i];
  ok(w > 0.5, `pond too small: ${w.toFixed(3)}`);
});
t('the graveyard shelf is dry land', () => {
  const s = new Sim({ seed: 'a' });
  ok(s.water[s.idx(s.yard.x, s.yard.y)] < 0.02, 'yard is underwater');
});
t('the hearth is dry and within reach of water', () => {
  for (const seed of ['a', 'b', 'c', 'report', 'live']) {
    const s = new Sim({ seed });
    ok(s.water[s.idx(s.hearth.x, s.hearth.y)] < 0.02, `${seed}: hearth is underwater`);
    const d = Math.hypot(s.hearth.x - s.pond.x, s.hearth.y - s.pond.y);
    ok(d < 16 * S, `${seed}: founders start ${d.toFixed(0)} cells from water`);
  }
});
t('thermal field relaxes toward ambient with no hand', () => {
  const s = new Sim({ seed: 'a', founders: 0 });
  for (let i = 0; i < s.N * s.N; i++) s.temp[i] = 80;
  s.curtain = 0; run(s, 3);
  let mx = -1e9; for (let i = 0; i < s.N * s.N; i++) mx = Math.max(mx, s.temp[i]);
  ok(mx < 30, `did not cool: ${mx.toFixed(1)}`);
});
t('the hand heats the ground, and only near the finger', () => {
  const s = new Sim({ seed: 'a', founders: 0 });
  const hx = 20 * S, hy = 20 * S, fx = 55 * S, fy = 55 * S;
  s.setHand(hx, hy); run(s, 2);
  const near = s.temp[s.idx(hx, hy)], far = s.temp[s.idx(fx, fy)];
  ok(near > 40, `finger too cold: ${near.toFixed(1)}`);
  ok(far < near - 15, `heat leaked everywhere: near ${near.toFixed(1)} far ${far.toFixed(1)}`);
});
t('heat arrives slowly (no instant kill)', () => {
  const s = new Sim({ seed: 'a', founders: 0 });
  s.setHand(20 * S, 20 * S);
  for (let i = 0; i < 15; i++) s.step();   // one second
  ok(s.temp[s.idx(20 * S, 20 * S)] < 40, 'the finger is a laser');
});
t('water is conserved under tilt (within evaporation)', () => {
  const s = new Sim({ seed: 'b', founders: 0 });
  s.humid = 0; s.rainLeft = 0; s.curtain = 0;
  let before = 0; for (let i = 0; i < s.N * s.N; i++) before += s.water[i];
  s.setTilt(0.2, 0.1); run(s, 4);
  let after = 0; for (let i = 0; i < s.N * s.N; i++) after += s.water[i];
  ok(after < before && after > before * 0.55, `water: ${before.toFixed(2)} -> ${after.toFixed(2)}`);
});
t('tilt moves water toward the low corner', () => {
  const s = new Sim({ seed: 'b', founders: 0 });
  const half = (w) => { let l = 0, r = 0; for (let i = 0; i < s.N * s.N; i++) ((i % s.N) < s.N / 2 ? (l += w[i]) : (r += w[i])); return [l, r]; };
  const [l0, r0] = half(s.water);
  s.setTilt(0.2, 0); run(s, 6);   // +x tilt lowers the small-x side: water goes left
  const [l1, r1] = half(s.water);
  ok((l1 / (l1 + r1)) > (l0 / (l0 + r0)), `water did not shift: ${(l0 / (l0 + r0)).toFixed(3)} -> ${(l1 / (l1 + r1)).toFixed(3)}`);
});
t('breathing enough makes it rain', () => {
  const s = new Sim({ seed: 'c', founders: 0 });
  let dry = 0; for (let i = 0; i < s.N * s.N; i++) dry += s.water[i];
  for (let i = 0; i < 40; i++) { s.breathe(0.1); s.step(); }
  run(s, 1.2);
  let wet = 0; for (let i = 0; i < s.N * s.N; i++) wet += s.water[i];
  ok(wet > dry, `no rain: ${dry.toFixed(2)} -> ${wet.toFixed(2)}`);
});
// ⚠️⚠️ THIS TEST USED TO GUARD THE BUG. It called `setLid(true)` and labelled
// it "open lid" — but `lid === true` means the sheet is ON, which is what the
// button and the help card have always said. Three places disagreed about the
// same boolean: the UI ("cover on"), the constants block (LID_LOSS/VENT are both
// documented as the cost of being OPEN, and both were applied when CLOSED), and
// this test, which sided with the constants. So the suite was green while
// covering a town drained its pond to zero and killed ten of thirteen — the
// exact opposite of the promise on the help card. A green test is not evidence
// that the behaviour is right; it is evidence that the code and the test agree.
// Both of them were wrong.
//
// The vocabulary is now fixed everywhere: lid === true means UNDER THE SHEET.
t('under the sheet it keeps its water; with the sheet off the room drinks it', () => {
  const total = (s) => { let w = s.humid + s.rainLeft; for (let i = 0; i < s.N * s.N; i++) w += s.water[i]; return w; };
  const a = new Sim({ seed: 'seal', founders: 0 });
  ok(a.lid === true, 'the board is supposed to start under the sheet — dad keeps it covered');
  const t0 = total(a); run(a, 34);
  ok(total(a) > t0 * 0.97, `a covered board leaked: ${t0.toFixed(2)} -> ${total(a).toFixed(2)}`);
  const b = new Sim({ seed: 'seal', founders: 0 });
  b.setLid(false);                                   // pull the sheet OFF
  run(b, 34);
  ok(total(b) < total(a) * 0.8, `an uncovered board did not dry out: ${total(b).toFixed(2)} vs ${total(a).toFixed(2)}`);
});
t('the cover holds heat in rather than letting it go', () => {
  // the other half of the same inversion: a sheet INSULATES. LID_LOSS is the
  // cost of the board being open, so it must not be charged to a covered one.
  const warm = (s) => { let t = 0; for (let i = 0; i < s.N * s.N; i += 7) t += s.temp[i]; return t / Math.ceil(s.N * s.N / 7); };
  const a = new Sim({ seed: 'heat', founders: 0 });   // covered
  const b = new Sim({ seed: 'heat', founders: 0 }); b.setLid(false);
  a.setLamp(true); b.setLamp(true);                   // give them both something to hold
  run(a, 6); run(b, 6);
  ok(warm(a) > warm(b), `covered board was not the warmer one: ${warm(a).toFixed(2)} vs ${warm(b).toFixed(2)}`);
});
t('sustained heat sterilises moss', () => {
  const s = new Sim({ seed: 'a', founders: 0 });
  const i = s.idx(20 * S, 20 * S); s.moss[i] = 1;
  s.setHand(20 * S, 20 * S); run(s, 4);
  ok(s.moss[i] < 0.5, `moss survived the finger: ${s.moss[i].toFixed(2)}`);
});

// --- genetics --------------------------------------------------------------
console.log('blood');
t('twelve-locus strip: expression follows the dominance ladder', () => {
  const g = new Uint8Array(LOCI.length * 2);
  g[L.lantern * 2] = 3; g[L.lantern * 2 + 1] = 1;
  eq(expressed(g, L.lantern), LOCI[L.lantern].alleles[1], 'dominant');
});
t('marrow homozygosity halves lifespan', () => {
  const s = new Sim({ seed: 'd', founders: 0 });
  const G = LOCI.length * 2;
  const het = new Uint8Array(G); het[L.marrow * 2] = 0; het[L.marrow * 2 + 1] = 3;
  const hom = new Uint8Array(G); hom[L.marrow * 2] = 2; hom[L.marrow * 2 + 1] = 2;
  let sh = 0, sm = 0, n = 40;
  for (let i = 0; i < n; i++) { const a = s._spawn(10 * S, 10 * S, het, -1, -1, 1); sh += s.k.lifespan[a]; s.k.alive[a] = 0; s.free.push(a); }
  for (let i = 0; i < n; i++) { const a = s._spawn(10 * S, 10 * S, hom, -1, -1, 1); sm += s.k.lifespan[a]; s.k.alive[a] = 0; s.free.push(a); }
  ok(sm / n < sh / n * 0.62, `homozygous not penalised: ${(sh / n).toFixed(0)} vs ${(sm / n).toFixed(0)}`);
});
t('children draw one allele from each parent', () => {
  const s = new Sim({ seed: 'e', founders: 0 });
  const G = LOCI.length * 2;
  const gm = new Uint8Array(G).fill(0), gf = new Uint8Array(G).fill(1);
  const mo = s._spawn(20 * S, 20 * S, gm, -1, -1, 1), fa = s._spawn(20 * S, 20 * S, gf, -1, -1, 1);
  s.k.stage[mo] = STAGE.WHOLE; s.k.stage[fa] = STAGE.WHOLE;
  s.k.sex[mo] = 0; s.k.sex[fa] = 1;
  const before = s.count;
  s._breed(mo, fa);
  ok(s.count > before, 'no children');
  for (let id = before; id < s.count; id++) {
    if (!s.k.alive[id]) continue;
    for (let li = 0; li < LOCI.length; li++) {
      const a = s.k.genome[id * G + li * 2], b = s.k.genome[id * G + li * 2 + 1];
      ok((a === 0 || a === 1 || a > 1) && (b === 0 || b === 1 || b > 1), 'impossible allele');
    }
  }
});
t('long drift does not corrupt the genome', () => {
  const s = new Sim({ seed: 'drift' });
  run(s, 168);
  const G = LOCI.length * 2;
  for (let id = 0; id < s.count; id++) {
    if (!s.k.alive[id]) continue;
    for (let li = 0; li < LOCI.length; li++) {
      const n = LOCI[li].alleles.length;
      ok(s.k.genome[id * G + li * 2] < n, `allele out of range at ${LOCI[li].key}`);
      ok(s.k.genome[id * G + li * 2 + 1] < n, `carried allele out of range at ${LOCI[li].key}`);
    }
  }
});

// --- life ------------------------------------------------------------------
console.log('life');
t('a seeded colony survives 200 days unattended', () => {
  const s = fixture('live', 200);
  ok(s.alive > 0, 'colony died out');
  ok(s.stats.born > 0, 'nothing was born');
});
t('population is neither a flatline nor a spike (M2 gate)', () => {
  const s = new Sim({ seed: 'live' });
  const samples = [];
  for (let d = 0; d < 120; d++) { run(s, 1); samples.push(s.alive); }
  const mn = Math.min(...samples), mx = Math.max(...samples);
  ok(mx > mn + 3, `flatline: ${mn}..${mx}`);
  ok(mx < C.CAP, `hit the cap: ${mx}`);
});
t('the dead get buried and the graves accumulate', () => {
  const s = new Sim({ seed: 'live' });
  run(s, 73);
  ok(s.stats.died > 0, 'nobody died in 73 days');
  ok(s.graves.length > 0, 'nobody was buried');
});
t('nothing ever leaves the jar', () => {
  const s = new Sim({ seed: 'edge' });
  run(s, 70);
  for (let id = 0; id < s.count; id++) {
    if (!s.k.alive[id]) continue;
    ok(s.k.x[id] >= 0 && s.k.x[id] <= s.N, `x out of jar: ${s.k.x[id]}`);
    ok(s.k.y[id] >= 0 && s.k.y[id] <= s.N, `y out of jar: ${s.k.y[id]}`);
  }
});
t('no NaN anywhere after a long run', () => {
  const s = new Sim({ seed: 'nan' });
  run(s, 112);
  for (const key of ['x', 'y', 'age', 'lifespan', 'hue', 'bright', 'need']) {
    const a = s.k[key];
    for (let i = 0; i < a.length; i++) ok(Number.isFinite(a[i]), `NaN in k.${key}[${i}]`);
  }
  for (const f of ['height', 'temp', 'water', 'moss', 'moist']) {
    for (let i = 0; i < s.N * s.N; i++) ok(Number.isFinite(s[f][i]), `NaN in ${f}[${i}]`);
  }
});
t('population never goes negative and slots are recycled', () => {
  const s = new Sim({ seed: 'slots' });
  run(s, 140);
  let alive = 0; for (let i = 0; i < s.count; i++) if (s.k.alive[i]) alive++;
  eq(alive, s.alive, 'alive count drifted');
  ok(s.stats.died > 10, 'too few deaths to test recycling');
  ok(s.count <= C.CAP, 'exceeded capacity');
});
t('no lineage is immortal', () => {
  const s = new Sim({ seed: 'mortal' });
  run(s, 112);
  for (let id = 0; id < s.count; id++) if (s.k.alive[id]) ok(s.k.age[id] <= s.k.lifespan[id] + 1, 'someone outlived their span');
});

// --- the hand kills --------------------------------------------------------
console.log('the hand');
t('the finger, held on a village, kills more than leaving it alone', () => {
  // A control run and a cruel run from identical state. The colony grows either
  // way — what the finger changes is the death rate, not the headcount.
  // ⚠️ MEASURED OVER SEVERAL SEEDS ON PURPOSE. On any single seed the cluster
  // can be small enough that nobody dies either way — this asserted a one-seed
  // outcome and failed on a terrain change while the finger was in fact still
  // killing 4.16x as many kin across 24 seeds. Aggregate, then assert.
  let cruelAll = 0, kindAll = 0, hottest = 0;
  for (let seed = 0; seed < 6; seed++) { oneFinger(seed); }
  function oneFinger(sd) {
  const a = new Sim({ seed: 'cruel' + sd }); run(a, 40);
  const b = Sim.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
  let bx = 0, by = 0, best = -1;
  for (let id = 0; id < a.count; id++) {
    if (!a.k.alive[id]) continue;
    let n = 0;
    for (let o = 0; o < a.count; o++) {
      if (!a.k.alive[o]) continue;
      const dx = a.k.x[o] - a.k.x[id], dy = a.k.y[o] - a.k.y[id];
      if (dx * dx + dy * dy < 64) n++;
    }
    if (n > best) { best = n; bx = a.k.x[id]; by = a.k.y[id]; }
  }
  const d0 = a.stats.died;
  a.setHand(bx, by);
  run(a, 8); run(b, 8);
  cruelAll += a.stats.died - d0; kindAll += b.stats.died - d0;
  hottest = Math.max(hottest, Math.max(...a.temp));
  }
  ok(cruelAll > kindAll * 1.5, `the finger cost little: ${cruelAll} dead vs ${kindAll} left alone`);
  ok(hottest > 44, `the finger never got lethal: ${hottest.toFixed(1)}C`);
});
t('the finger has a lethal core and a comfortable ring', () => {
  const s = new Sim({ seed: 'kind', founders: 0 });
  for (let i = 0; i < s.N * s.N; i++) s.temp[i] = 8;
  s.curtain = 0; s.setHand(20, 20);
  for (let i = 0; i < C.TICKS_PER_DAY * 0.6; i++) s.step();
  const at = (r) => s.temp[s.idx(20 + r, 20)];
  ok(at(0) > 44, `the core cannot kill: ${at(0).toFixed(1)}`);      // plain hide dies above 44
  let ring = -1;
  for (let r = 1; r <= 14; r++) if (at(r) >= 18 && at(r) <= 32) { ring = r; break; }
  ok(ring > 0, `no comfortable ring anywhere: ${[...Array(15).keys()].map(r => at(r).toFixed(0)).join(',')}`);
  ok(at(20) < s.ambient + 1.5, `the whole jar warmed up: ${at(20).toFixed(1)} vs ambient ${s.ambient}`);
});
t('and the same finger, at arm\'s length, is a mercy', () => {
  const s = new Sim({ seed: 'kind', founders: 0 });
  const G = LOCI.length * 2;
  const g = new Uint8Array(G); // plain hide: comfort 18-32
  const id = s._spawn(26, 20, g, -1, -1, 1);
  s.k.stage[id] = STAGE.WHOLE; s.k.age[id] = 30;
  for (let i = 0; i < s.N * s.N; i++) s.temp[i] = 8;
  s.curtain = 0;
  const b = id * NEEDS.length;
  const w0 = s.k.need[b + 0];
  s.setHand(20, 20);
  for (let i = 0; i < C.TICKS_PER_DAY * 0.6; i++) {
    s.step();
    for (let n = 1; n < NEEDS.length; n++) s.k.need[b + n] = 1;  // isolate warmth
  }
  ok(s.k.alive[id], 'the mercy killed them');
  ok(s.k.need[b + 0] > w0, `warmth did not comfort: ${w0.toFixed(2)} -> ${s.k.need[b + 0].toFixed(2)}`);
});

// --- determinism -----------------------------------------------------------
console.log('determinism');
t('same seed -> identical fingerprint', () => {
  const a = new Sim({ seed: 'fp' }), b = new Sim({ seed: 'fp' });
  run(a, 34); run(b, 34);
  eq(a.fingerprint(), b.fingerprint(), 'fingerprint');
});
t('different seed -> different fingerprint', () => {
  const a = new Sim({ seed: 'fp1' }), b = new Sim({ seed: 'fp2' });
  run(a, 34); run(b, 34);
  ok(a.fingerprint() !== b.fingerprint(), 'seeds collided');
});
t('identical player input replays identically', () => {
  const script = (s) => {
    for (let d = 0; d < 60; d++) {
      if (d === 10) s.setHand(20, 20);
      if (d === 16) s.setHand(null);
      if (d === 24) s.setTilt(0.15, -0.05);
      if (d === 30) s.setTilt(0, 0);
      if (d === 38) for (let i = 0; i < 40; i++) s.breathe(0.1);
      run(s, 1);
    }
  };
  const a = new Sim({ seed: 'replay' }), b = new Sim({ seed: 'replay' });
  script(a); script(b);
  eq(a.fingerprint(), b.fingerprint(), 'replay');
});

// --- save round-trip (Invariant 3) ----------------------------------------
// --- the one you lifted (§9.3) ------------------------------------------
console.log('the one you lifted');
const someone = (s) => { for (let i = 0; i < s.count; i++) if (s.k.alive[i] && s.k.stage[i] !== STAGE.EGG) return i; return -1; };

t('a lifted kin leaves the world but stays alive in it', () => {
  const s = clone(fixture('live', 200));
  const id = someone(s); ok(id >= 0, 'nobody to lift');
  const x0 = s.k.x[id], y0 = s.k.y[id];
  ok(s.lift(id), 'could not lift a living kin');
  ok(!s.lift(someone(s)), 'lifted two at once');
  run(s, 2);
  eq(s.k.x[id], x0, 'a held kin drifted');
  eq(s.k.y[id], y0, 'a held kin drifted');
  ok(s.k.alive[id] === 1, 'a held kin stopped being alive');
});

t('the witnesses disagree, because their own bodies decide', () => {
  // this is §9's schism seed and it must not quietly become unanimous
  const s = clone(fixture('live', 200));
  s.lift(someone(s));
  const saw = [...Array(s.count).keys()].filter(i => s.k.alive[i] && s.k.saw[i] !== 0);
  ok(saw.length > 0, 'nobody witnessed a lift in a whole town');
  const pos = saw.filter(i => s.k.saw[i] > 0).length;
  const neg = saw.filter(i => s.k.saw[i] < 0).length;
  ok(pos + neg === saw.length, 'a witness recorded nothing');
});

t('what they saw never fades, while the hand itself does', () => {
  const s = clone(fixture('live', 200));
  s.lift(someone(s)); s.takeAway();
  // ⚠ IDENTITY, NOT SLOT. This used to guard on `k.alive[w]` alone — but slots
  // are recycled, so 'alive' can be a NEWBORN wearing the dead witness's index.
  // Before _spawn reset k.saw, the newborn INHERITED the trauma and this test
  // passed BY THE LEAK the review then fixed. Track every witness by birth day
  // and only judge the ones still occupied by the same kin.
  const wits = [];
  for (let i = 0; i < s.count; i++) if (s.k.alive[i] && s.k.saw[i] !== 0) wits.push({ i, saw: s.k.saw[i], born: s.k.born[i] });
  ok(wits.length > 0, 'no surviving witness');
  run(s, 40);
  let judged = 0;
  for (const w of wits) {
    if (!s.k.alive[w.i] || s.k.born[w.i] !== w.born) continue;   // died, slot recycled
    eq(s.k.saw[w.i], w.saw, 'a witness forgot');
    judged++;
  }
  ok(judged > 0, 'every witness died within forty days — the scenario stopped testing anything');
});

t('taken means no body, so there is never a stone for that one', () => {
  const s = clone(fixture('live', 200));
  const id = someone(s), nameId = s.k.nameId[id];
  const corpses0 = s.corpses.length;
  s.lift(id); s.takeAway();
  ok(s.k.alive[id] === 0, 'the taken one survived');
  eq(s.corpses.length, corpses0, 'a body was left behind by a taking');
  run(s, 12);
  const stones = s.graves.filter(g => g.nameId === nameId && nameId >= 0).length;
  eq(stones, 0, 'somebody buried a kin that was never there');
});

t('setting down costs warmth, safety and a quarter of a death clock', () => {
  const s = clone(fixture('live', 200));
  const id = someone(s), NN = NEEDS.length;
  const strain0 = s.k.strain[id];
  s.lift(id); run(s, 1); s.setDown(30, 30);
  ok(!s.held, 'still holding after setting down');
  ok(Math.abs(s.k.x[id] - 30) < 0.01, 'set down in the wrong place');
  eq(s.k.need[id * NN + 0], 1, 'not warmed by the hand');
  ok(s.k.need[id * NN + 5] <= 0.06, 'not frightened by it');
  ok(s.k.strain[id] >= Math.min(0.95, strain0 + 0.25) - 1e-9, 'no lasting cost');
});

t('a save taken mid-lift puts the same kin back in the air', () => {
  // ⚠️ new persistent state the fingerprint cannot see is the project's own
  // definition of a harness that lies — held and k.saw both have to round-trip.
  const s = clone(fixture('live', 200));
  s.lift(someone(s)); run(s, 1);
  const fp = s.fingerprint();
  const b = Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  eq(b.fingerprint(), fp, 'a mid-lift save did not restore identically');
  ok(b.held && b.held.id === s.held.id, 'the held kin came back to the ground');
  b.setDown(40, 40); s.setDown(40, 40);
  run(b, 3); run(s, 3);
  eq(b.fingerprint(), s.fingerprint(), 'they diverged after the hand let go');
});

t('lifting the same one on the same seed writes the same town', () => {
  const a = clone(fixture('live', 200)), b = clone(fixture('live', 200));
  const ia = someone(a);
  a.lift(ia); b.lift(ia);
  run(a, 1); run(b, 1);
  a.setDown(35, 35); b.setDown(35, 35);
  run(a, 5); run(b, 5);
  eq(a.fingerprint(), b.fingerprint(), 'the same act gave two different towns');
});

// --- the crumb ------------------------------------------------------------
console.log('the crumb');

t('a crumb is somewhere they will walk to, and it runs out', () => {
  const s = clone(fixture('live', 200));
  let cx = 0, cy = 0, n = 0;
  for (let i = 0; i < s.count; i++) if (s.k.alive[i]) { cx += s.k.x[i]; cy += s.k.y[i]; n++; }
  ok(n > 0, 'nobody alive to feed');
  cx /= n; cy /= n;
  const gx = Math.max(12, Math.min(s.N - 12, cx + 9)), gy = Math.max(12, Math.min(s.N - 12, cy));
  ok(s.give(gx, gy), 'could not leave a crumb');
  eq(s.gifts.length, 1, 'the crumb is not on the board');
  let chose = 0;
  for (let i = 0; i < C.TICKS_PER_DAY * 2; i++) {
    s.step();
    if (i % 120 === 0) for (let id = 0; id < s.count; id++) if (s.k.alive[id] && s.k.goal[id] === 11) chose++;
  }
  ok(chose > 0, 'nobody ever went to the crumb');
  ok(!s.gifts.length || s.gifts[0].mass < 1, 'nobody ate any of it');
});

t('what is left of a stale crumb becomes pasture', () => {
  // ⚠️ nothing is ever simply deleted from a world whose whole subject is that
  // marks stay. A crumb nobody finished is the reason that patch is green.
  const s = clone(fixture('live', 200));
  // ⚠ QUIET GROUND, FOUND, NOT HARDCODED. This used (48,48) — which by day 200
  // on this trajectory is the dead centre of the town: 57 kin and 27 works
  // within 8 cells, three stores within 3. The crumb's deposit landed and was
  // grazed to nothing INSIDE the same day, so the assert read 'the ground did
  // not get the rest of it' when the truth was 'the town ate it immediately'.
  // The mechanic under test is deposit-on-decay, so the test needs ground
  // nobody is standing on — and trajectories move every time the sim is
  // rebalanced, so it has to look rather than remember.
  let gx = -1, gy = -1;
  outer: for (let y = 8; y < s.N - 8; y += 2) for (let x = 8; x < s.N - 8; x += 2) {
    if (!s.inJar(x, y) || s.water[s.idx(x, y)] > 0.001) continue;
    let busy = false;
    for (let id = 0; id < s.count && !busy; id++)
      if (s.k.alive[id] && Math.hypot(s.k.x[id] - x, s.k.y[id] - y) < 10) busy = true;
    for (const o of s.works) if (Math.hypot(o.x - x, o.y - y) < 10) { busy = true; break; }
    if (!busy) { gx = x; gy = y; break outer; }
  }
  ok(gx >= 0, 'no quiet ground left on the whole board — the town ate the map');
  // ⚠ quiet ground tends to be SATURATED ground (nobody grazes it), and a
  // cell at moss 1.0 cannot rise — the first fix passed by a float hair
  // (0.9999... → 1.0 cap). The mechanic under test is the DEPOSIT, so the
  // test sets its own headroom instead of hoping the map provides it.
  s.moss[s.idx(gx, gy)] = 0.3;
  const before = s.moss[s.idx(gx, gy)];
  s.give(gx, gy);
  s.gifts[0].mass = 0.5;
  s.gifts[0].day = s.day - 20;
  run(s, 1);
  eq(s.gifts.length, 0, 'a stale crumb outstayed its welcome');
  ok(s.moss[s.idx(gx, gy)] > before, 'the ground did not get the rest of it');
});

t('crumbs round-trip and stay deterministic', () => {
  const s = clone(fixture('live', 200));
  s.give(40, 40); s.give(52, 44);
  run(s, 2);
  const fp = s.fingerprint();
  const b = Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  eq(b.fingerprint(), fp, 'a save with crumbs did not restore identically');
  eq(b.gifts.length, s.gifts.length, 'the crumbs did not come back');
  if (s.gifts.length) ok(Math.abs(b.gifts[0].mass - s.gifts[0].mass) < 1e-12, 'half-eaten did not stay half-eaten');
  run(b, 3); run(s, 3);
  eq(b.fingerprint(), s.fingerprint(), 'they drifted apart afterwards');
});

t('a crumb outside the board is refused', () => {
  const s = clone(fixture('live', 200));
  const before = s.gifts.length;
  ok(!s.give(1, 1), 'a crumb was accepted off the edge of the world');
  eq(s.gifts.length, before, 'it landed anyway');
});

// --- homes ------------------------------------------------------------------
console.log('homes');

t('adults claim the standing dwellings, and children ride along', () => {
  const s = clone(fixture('live', 200));
  run(s, 30);
  let adults = 0, housed = 0, childHomes = 0;
  for (let i = 0; i < s.count; i++) {
    if (!s.k.alive[i]) continue;
    if (s.k.stage[i] >= STAGE.WHOLE) { adults++; if (s.k.home[i] >= 0) housed++; }
    else if (s.k.home[i] >= 0) childHomes++;
  }
  const dwellings = s.works.filter(o => (o.kind === 3 || o.kind === 4) && o.prog >= WORK_DONE).length;
  if (dwellings > 0) ok(housed > 0, `dwellings exist (${dwellings}) but nobody moved in`);
  // every claim must point at a real, standing dwelling
  for (let i = 0; i < s.count; i++) {
    if (!s.k.alive[i] || s.k.home[i] < 0) continue;
    const h = s.workById(s.k.home[i]);
    ok(h && h.prog >= 0.5 && (h.kind === 3 || h.kind === 4), 'a claim points at nothing');
  }
});

t('a fallen house leaves no stale claims (the one cleanup funnel)', () => {
  const s = clone(fixture('live', 200));
  run(s, 30);
  const dw = s.works.find(o => (o.kind === 3 || o.kind === 4) && o.prog >= WORK_DONE &&
    Array.from({ length: s.count }, (_, i) => i).some(i => s.k.alive[i] && s.k.home[i] === o.id));
  if (!dw) return;                        // no occupied dwelling this fixture — nothing to assert
  // ⚠️ 0.49 was WRONG for a living town: builders repaired the house back over
  // the line within a day and people legitimately moved back in — the first run
  // of this test failed on a house that had been SAVED, not on a stale claim.
  // Drop it far below anything a repair crew can catch before the next weave.
  dw.prog = 0.05; dw.done = s.day - 20;
  run(s, 2);
  for (let i = 0; i < s.count; i++) ok(!(s.k.alive[i] && s.k.home[i] === dw.id), 'a stale claim survived the fall');
});

t('a starving kin eats before it goes home at night (the empty cup, again)', () => {
  const s = clone(fixture('live', 200));
  let id = -1;
  for (let i = 0; i < s.count; i++) if (s.k.alive[i] && s.k.home[i] >= 0 && s.k.stage[i] === STAGE.WHOLE && !s.k.glued[i]) { id = i; break; }
  if (id < 0) return;
  s.k.need[id * NEEDS.length + 2] = 0.1;
  while (s.dayFrac > 0.05) s.step();
  // ⚠️ ASSERT THE CONTRACT, NOT A SNAPSHOT. The first form checked 'is eating
  // OR above 0.2' sixty ticks later — which failed on a kin that had eaten its
  // way up to 0.18 and gone back to work, i.e. correct behaviour landing in the
  // gap between the survival threshold (0.15) and the test's bar (0.2). The
  // real invariant is the one the override exists to enforce: while a kin is
  // genuinely critical it must never be on a long deferrable errand — courting,
  // building, or hauling for a trade.
  const LONG = [7, 10, 13, 14];
  for (let i = 0; i < 240; i++) {
    s.step();
    if (!s.k.alive[id]) break;
    const f = s.k.need[id * NEEDS.length + 2], w = s.k.need[id * NEEDS.length + 1];
    if (f < 0.15 || w < 0.15) {
      ok(!LONG.includes(s.k.goal[id]),
        `critical (food ${f.toFixed(2)}) and still on a long errand (goal ${s.k.goal[id]})`);
    }
  }
});

t('a legacy save wakes with nobody claiming work 0', () => {
  // ⚠️ -1 is 'nowhere' and 0 is a REAL work id, so a save from before homes
  // must load as unhoused — the constructor default of a fresh Int32Array is 0.
  const s = clone(fixture('live', 200));
  const blob = JSON.parse(JSON.stringify(s.toJSON()));
  delete blob.k.home; delete blob.k.homeTier;
  const b = Sim.fromJSON(blob);
  for (let i = 0; i < b.count; i++) eq(b.k.home[i], -1, 'a legacy kin woke up owning work 0');
});

t('homes round-trip and hold determinism', () => {
  const s = clone(fixture('live', 200));
  run(s, 20);
  const fp = s.fingerprint();
  const b = Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  eq(b.fingerprint(), fp, 'homes did not restore identically');
  run(s, 15); run(b, 15);
  eq(b.fingerprint(), s.fingerprint(), 'they drifted after the doors were claimed');
});

t('the room temperature is in the fingerprint', () => {
  // ⚠⚠ IT WAS NOT, AND THE HOLE WAS INVISIBLE. `ambientBase` is what every
  // cell of the board relaxes toward, it round-trips through the save, and it
  // was the ONLY room control missing from fingerprint() -- the sheet, the
  // bulb, the window and the damp were all folded. Two colonies, one in a 19
  // degree room and one in a 42 degree room, hashed EQUAL. Measured on seed 3
  // from day 100: thirty days later the 19 degree town has 26 alive and the 42
  // degree town has NONE, sixteen of them dead of heat.
  const a = fixture('room', 20);
  const b = clone(a);
  eq(b.fingerprint(), a.fingerprint(), 'the clone did not start equal');
  b.ambientBase = 42;
  ok(b.fingerprint() !== a.fingerprint(), 'a room 23 degrees hotter hashed the same');
  // and it still restores exactly
  const c = Sim.fromJSON(JSON.parse(JSON.stringify(b.toJSON())));
  eq(c.fingerprint(), b.fingerprint(), 'the hot room did not restore identically');
});

t('the room can actually kill, which is what makes it worth hashing', () => {
  const s2 = fixture('room', 20);
  const hot = clone(s2);
  hot.ambientBase = 44;
  run(hot, 25);
  const cool = clone(s2);
  run(cool, 25);
  ok(hot.alive < cool.alive,
    'a 44 degree room killed nobody: hot ' + hot.alive + ' vs cool ' + cool.alive);
});

// --- a real place ----------------------------------------------------------
console.log('somewhere real');

t('a colony lives on a baked real place, and it round-trips', () => {
  // ⚠️ The world is DATA the caller supplies, not something sim.js fetches --
  // sim.js still imports nothing. And it CANNOT be regenerated from the seed
  // the way the noise terrain is, because it came off the network, which is
  // exactly why fromJSON takes it as a second argument.
  let world = null;
  try { world = JSON.parse(readFileSync(new URL('./worlds/keswick.json', import.meta.url), 'utf8')); }
  catch (e) { console.log('    (no baked world on disk, skipping)'); return; }
  const a = new Sim({ seed: 'realplace', founders: 14, world });
  ok(a.worldName === 'keswick', 'the colony does not know where it lives');
  // the landmarks are derived from REAL height by the same code as always
  ok(a.inJar(a.pond.x, a.pond.y), 'the pond landed outside the jar');
  ok(a.inJar(a.hearth.x, a.hearth.y), 'the founders were seeded outside the jar');
  let wet = 0;
  for (let i = 0; i < a.N * a.N; i++) if (a.water[i] > 0.001) wet++;
  ok(wet > 100, 'a real place with real lakes came out dry: ' + wet + ' cells');
  run(a, 20);
  ok(a.alive > 0, 'the town died in twenty days on real ground');
  const blob = JSON.parse(JSON.stringify(a.toJSON()));
  eq(blob.worldName, 'keswick', 'the save forgot which place this is');
  const b = Sim.fromJSON(blob, world);
  eq(b.fingerprint(), a.fingerprint(), 'a real place did not restore identically');
  run(a, 10); run(b, 10);
  eq(b.fingerprint(), a.fingerprint(), 'two identical real worlds drifted');
});

t('a save that names a world REFUSES to load without it', () => {
  // ⚠⚠ the alternative is silently rebuilding the colony on noise terrain
  // with its homes, graves and pond all in the wrong place -- a corruption that
  // looks like a rendering bug and is actually the world underneath moving.
  let world = null;
  try { world = JSON.parse(readFileSync(new URL('./worlds/keswick.json', import.meta.url), 'utf8')); }
  catch (e) { return; }
  const a = new Sim({ seed: 'refuse', founders: 6, world });
  run(a, 3);
  const blob = JSON.parse(JSON.stringify(a.toJSON()));
  let threw = false;
  try { Sim.fromJSON(blob); } catch (e) { threw = true; }
  ok(threw, 'it laid a real colony onto a generated world without complaining');
});

t('a generated world still needs no world file at all', () => {
  const a = new Sim({ seed: 'plain', founders: 8 });
  eq(a.worldName, null, 'a generated world claimed to be somewhere');
  run(a, 5);
  const b = Sim.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
  eq(b.fingerprint(), a.fingerprint(), 'the old path stopped round-tripping');
});

// --- the ground where somebody was taken -----------------------------------
t('the town stops using the ground where it watched somebody taken', () => {
  // ⚠⚠ `k.saw` was written by _witness, folded into the fingerprint, and read
  // by NOTHING for the whole life of the feature -- so the one irreversible act
  // in the game had zero mechanical consequence. This test exists so that can
  // never quietly become true again.
  // The control wipes k.saw every tick. Nothing else in the sim reads it, so the
  // two runs differ by exactly one bias and nothing else.
  const R = 6 * S;
  const go = (shunOn) => {
    const s2 = new Sim({ seed: 'sawread', founders: 14 });
    run(s2, 45);
    let vic = -1, best = 0;
    for (let id = 0; id < s2.count; id++) {
      if (!s2.k.alive[id] || s2.k.stage[id] === STAGE.EGG) continue;
      let n = 0;
      for (let j = 0; j < s2.count; j++) {
        if (s2.k.alive[j] && Math.hypot(s2.k.x[id] - s2.k.x[j], s2.k.y[id] - s2.k.y[j]) < 10) n++;
      }
      if (n > best) { best = n; vic = id; }
    }
    ok(vic >= 0, 'nobody to take');
    const vx = s2.k.x[vic], vy = s2.k.y[vic];
    s2.lift(vic); s2.takeAway();
    let samples = 0, near = 0;
    for (let i = 0; i < 3000; i++) {
      if (!shunOn) s2.k.saw.fill(0);
      s2.step();
      if (i % 25) continue;
      for (let id = 0; id < s2.count; id++) {
        if (!s2.k.alive[id] || s2.k.stage[id] === STAGE.EGG) continue;
        samples++;
        if (Math.hypot(s2.k.x[id] - vx, s2.k.y[id] - vy) < R) near++;
      }
    }
    return samples ? near / samples : 0;
  };
  const off = go(false), on = go(true);
  ok(on < off * 0.85,
    `the take changed nothing: ${(off * 100).toFixed(1)}% -> ${(on * 100).toFixed(1)}% of time on that ground`);
});

t('the taken place round-trips through a save', () => {
  const a = fixture('sawsave', 30);
  let vic = -1;
  for (let id = 0; id < a.count; id++) if (a.k.alive[id] && a.k.stage[id] !== STAGE.EGG) { vic = id; break; }
  a.lift(vic); a.takeAway();
  ok(a._lifted, 'lift recorded nothing');
  const b = Sim.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
  ok(b._lifted, 'the place they lost somebody was forgotten on reload');
  eq(b._lifted.x.toFixed(6), a._lifted.x.toFixed(6), 'it came back in the wrong place');
  eq(b.fingerprint(), a.fingerprint(), 'a town that had lost somebody did not restore identically');
  run(a, 10); run(b, 10);
  eq(b.fingerprint(), a.fingerprint(), 'they drifted after the take');
});

// --- DAD'S CORNER: the ground the player made -------------------------------
console.log('the ground you made');

t('a raised hill is still there after a reload, and the pond did not move', () => {
  // ⚠️ THE WHOLE POINT OF THE TEST. `height` is deliberately NOT saved -- it is
  // regenerated from the seed -- so the player's own terrain travels as a sparse
  // `lump` delta and is re-applied AFTER _genWorld has derived the pond, the
  // graveyard and the hearth from the UNSHAPED ground. Get that order wrong and a
  // hill somebody raised silently relocates the graveyard on load.
  const a = fixture('lump', 30);
  const mid = (a.N - 1) / 2;
  ok(a.shape(mid, mid, 1, 1), 'the ground refused to rise at all');
  const h = a.height[a.idx(mid, mid)];
  const b = Sim.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
  eq(b.height[b.idx(mid, mid)].toFixed(6), h.toFixed(6), 'the hill did not come back');
  eq(JSON.stringify(b.pond), JSON.stringify(a.pond), 'the pond moved');
  eq(JSON.stringify(b.yard), JSON.stringify(a.yard), 'the graveyard moved');
  eq(JSON.stringify(b.hearth), JSON.stringify(a.hearth), 'the hearth moved');
  eq(b.fingerprint(), a.fingerprint(), 'the shaped world did not restore identically');
});

t('the shaped ground is IN the fingerprint', () => {
  // ⚠⚠ without this the harness lies: two towns, one with a hill and one
  // without, would hash EQUAL, and the save round-trip test above would pass
  // while quietly flattening the only field in this world that never decays.
  const a = fixture('lumphash', 20);
  const b = clone(a);
  eq(b.fingerprint(), a.fingerprint(), 'the clone did not start equal');
  const mid = (a.N - 1) / 2;
  a.shape(mid, mid, 1, 1);
  ok(b.fingerprint() !== a.fingerprint(), 'a hill did not move the fingerprint');
  // and the SAME lump in a different place must not hash the same
  const c = clone(fixture('lumphash', 20));
  c.shape(mid + 6, mid, 1, 1);
  ok(c.fingerprint() !== a.fingerprint(), 'the same hill in two places hashed equal');
});

t('water runs down a channel the player dug', () => {
  // ⚠️ THE FIRST VERSION OF THIS TEST WAS WRONG and it is worth saying why: it
  // dug a pit five cells from the pond and asserted it filled. Water does not
  // climb. If anything between the pit and the water sits higher, the pit stays
  // dry forever and that is CORRECT physics -- the test was asserting a bug.
  // What a player actually does is dig a CHANNEL, and that is what _fluids has
  // always been able to answer. Measured live before this test existed: a
  // 16-cell trench cut out of the pond carried water down 14 of its 16 cells.
  const s2 = fixture('hollow', 40);
  const N = s2.N;
  let px = -1, py = -1;
  for (let y = 6; y < N - 6 && px < 0; y++) for (let x = 6; x < N - 6; x++) {
    if (s2.water[s2.idx(x, y)] > 0.03) { px = x; py = y; break; }
  }
  ok(px >= 0, 'the world had no pond to dig out of');
  // cut a trench away from the water, digging each cell as we go
  const dir = px < N / 2 ? 1 : -1, LEN = 10;
  for (let pass = 0; pass < 8; pass++) {
    for (let q = 1; q <= LEN; q++) s2.shape(px + dir * q, py, -1, 1);
    run(s2, 1);
  }
  // ⚠️ ASSERT ON VOLUME, NOT ON A CELL COUNT. Measured at 8/14/20 digging
  // passes the wetted-cell count bounces 6/5/7 -- it depends on exactly where
  // the trench bottoms out against the terrain -- while the total water IN the
  // trench is a steady 0.41-0.54. A count near its own threshold is a flaky
  // test; the volume is the thing the feature actually claims.
  let wet = 0, depth = 0;
  for (let q = 1; q <= LEN; q++) {
    const i = s2.idx(px + dir * q, py);
    if (s2.water[i] > 0.01) wet++;
    depth += s2.water[i];
  }
  ok(depth > 0.15, `the channel stayed dry: ${wet}/${LEN} cells, total water ${depth.toFixed(3)}`);
});

t('a raised ridge sheds the water off itself', () => {
  const s2 = fixture('ridge', 40);
  const N = s2.N;
  let px = -1, py = -1;
  for (let y = 6; y < N - 6 && px < 0; y++) for (let x = 6; x < N - 6; x++) {
    if (s2.water[s2.idx(x, y)] > 0.05) { px = x; py = y; break; }
  }
  ok(px >= 0, 'no water to push off anything');
  const before = s2.water[s2.idx(px, py)];
  for (let i = 0; i < 30; i++) s2.shape(px, py, 1, 1);
  run(s2, 1);
  const after = s2.water[s2.idx(px, py)];
  ok(after < before * 0.5, `the water stayed on the hill: ${before.toFixed(3)} -> ${after.toFixed(3)}`);
});

t('shaping is deterministic and refuses the world outside the jar', () => {
  const a = fixture('lumpdet', 25), b = clone(a);
  const mid = (a.N - 1) / 2;
  for (const s3 of [a, b]) { s3.shape(mid, mid, 1, 0.5); s3.shape(mid + 3, mid + 1, -1, 1); }
  run(a, 12); run(b, 12);
  eq(b.fingerprint(), a.fingerprint(), 'two identically shaped worlds drifted');
  eq(a.shape(-40, -40, 1, 1), false, 'it shaped ground outside the jar');
});

console.log('save');
t('save -> JSON -> restore -> compare', () => {
  const a = new Sim({ seed: 'save' });
  run(a, 42);
  const json = JSON.parse(JSON.stringify(a.toJSON()));
  const b = Sim.fromJSON(json);
  eq(b.fingerprint(), a.fingerprint(), 'restore diverged');
  eq(b.alive, a.alive, 'alive');
  eq(b.graves.length, a.graves.length, 'graves');
});
t('a restored colony continues identically', () => {
  const a = new Sim({ seed: 'cont' });
  run(a, 28);
  const b = Sim.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
  run(a, 12); run(b, 12);
  eq(b.fingerprint(), a.fingerprint(), 'divergence after restore');
});

// --- the chronicle ---------------------------------------------------------
console.log('chronicle');
t('a run writes a chronicle', () => {
  const s = new Sim({ seed: 'story' });
  run(s, 84);
  ok(s.chronicle.length > 8, `too few events: ${s.chronicle.length}`);
});
t('the page is capped and ordered', () => {
  const s = new Sim({ seed: 'story' });
  run(s, 84);
  const p = s.page();
  ok(p.length > 0 && p.length <= 7, `page length ${p.length}`);
  for (let i = 1; i < p.length; i++) ok(p[i].day >= p[i - 1].day, 'page out of order');
});
t('three runs produce three different stories (M6 gate)', () => {
  const texts = ['s1', 's2', 's3'].map(seed => {
    const s = new Sim({ seed }); run(s, 84);
    return s.page().map(e => e.text).join('|');
  });
  ok(new Set(texts).size === 3, 'pages were identical');
});
// ⚠️ REGRESSION GUARD. The page used to freeze rarity at log time, so every book
// ever written covered only the first sixty days — measured at day 240, the page
// spanned days 0-62 and 178 days of lived history could not appear. If someone
// "simplifies" page() back to a flat score sort, these three tests fail.
t('a long life reaches the book (the page does not go blind)', () => {
  const s = fixture('page', 240);
  const p = s.page();
  const newest = Math.max(...p.map(e => e.day));
  ok(newest > s.day * 0.4, `book is blind: newest line is day ${newest} of ${s.day}`);
});
t('the book has a beginning, a middle and an end', () => {
  const s = fixture('page', 240);
  const acts = [0, 0, 0];
  s.page().forEach(e => acts[Math.min(2, Math.floor(e.day / (s.day / 3)))]++);
  ok(acts.every(a => a > 0), `all lines fell in one act: ${acts.join('/')}`);
});
t('page(fromDay) returns only that window', () => {
  const s = clone(fixture('page', 240));
  const mark = s.day;
  run(s, 30);
  const p = s.page(mark);
  ok(p.length > 0, 'no lines in the window');
  ok(p.every(e => e.day >= mark), 'leaked events from before the window');
});
t('a two-day-old colony still writes a page', () => {
  const s = new Sim({ seed: 'young' });
  run(s, 2);
  const p = s.page();
  ok(p.length > 0 && p.length <= 7, `young page length ${p.length}`);
  ok(new Set(p).size === p.length, 'the page repeated an entry');
});
t('the page never repeats an entry', () => {
  for (const s of [fixture('page', 240), fixture('live', 200), fixture('basement', 150)]) {
    const p = s.page();
    ok(new Set(p).size === p.length, 'duplicate entries on the page');
  }
});
t('rare kinds outrank common ones', () => {
  const s = new Sim({ seed: 'rare' });
  run(s, 84);
  const byKind = {};
  s.chronicle.forEach(e => { byKind[e.kind] = (byKind[e.kind] || 0) + 1; });
  const kinds = Object.keys(byKind);
  if (kinds.length < 2) return true;
  const common = kinds.sort((a, b) => byKind[b] - byKind[a])[0];
  const last = s.chronicle.filter(e => e.kind === common).slice(-1)[0];
  const first = s.chronicle.filter(e => e.kind === common)[0];
  ok(last.score <= first.score, 'rarity score did not decay with repetition');
});

// --- the one who stays (dad glued a figure down) ---------------------------
console.log('the one who stays');
t('dad glued exactly one figure, and it is a named adult', () => {
  for (const seed of ['a', 'b', 'c', 'live', 'basement']) {
    const s = new Sim({ seed });
    let n = 0, id = -1;
    for (let i = 0; i < s.count; i++) if (s.k.glued[i]) { n++; id = i; }
    eq(n, 1, `${seed}: glued count`);
    ok(s.k.nameId[id] >= 0, `${seed}: the one who stays has no name`);
    eq(s.k.stage[id], STAGE.WHOLE, `${seed}: not an adult`);
  }
});
t('the one who stays NEVER moves', () => {
  const s = new Sim({ seed: 'live' });
  let g = -1; for (let i = 0; i < s.count; i++) if (s.k.glued[i]) g = i;
  // ⚠️ kin slots are RECYCLED via s.free, so a dead glued kin's slot can be
  // reused by a newborn that walks. Only measure while it is still the SAME kin.
  const nid = s.k.nameId[g], x0 = s.k.x[g], y0 = s.k.y[g];
  let drift = 0;
  for (let i = 0; i < C.TICKS_PER_DAY * 60; i++) {
    s.step();
    if (s.k.alive[g] && s.k.glued[g] && s.k.nameId[g] === nid) {
      drift = Math.max(drift, Math.abs(s.k.x[g] - x0) + Math.abs(s.k.y[g] - y0));
    }
  }
  eq(drift, 0, 'the glued figure moved');
});
t('the glue never spreads to anyone born here', () => {
  const s = new Sim({ seed: 'basement' });
  let maxG = 0;
  for (let d = 0; d < 90; d++) {
    run(s, 1);
    let g = 0; for (let id = 0; id < s.count; id++) if (s.k.alive[id] && s.k.glued[id]) g++;
    maxG = Math.max(maxG, g);
  }
  ok(maxG <= 1, `${maxG} glued kin alive at once — a recycled slot leaked the flag`);
});
t('the town comes to tend them', () => {
  const s = new Sim({ seed: 'live' });
  let days = 0;
  for (let d = 0; d < 60; d++) {
    run(s, 1);
    for (let id = 0; id < s.count; id++) if (s.k.alive[id] && s.k.goal[id] === 9) { days++; break; }
  }
  ok(days > 3, `nobody ever went to them (${days}/60 days had a tender)`);
});
t('ONE tender at a time (the burial-spiral claim)', () => {
  const s = new Sim({ seed: 'live' });
  let worst = 0;
  for (let i = 0; i < C.TICKS_PER_DAY * 60; i++) {
    s.step();
    if (i % 97 !== 0) continue;
    const per = new Map();
    for (let id = 0; id < s.count; id++) {
      if (!s.k.alive[id] || s.k.goal[id] !== 9) continue;
      const tgt = s.k.goalT[id] | 0;
      per.set(tgt, (per.get(tgt) || 0) + 1);
    }
    for (const v of per.values()) worst = Math.max(worst, v);
  }
  ok(worst <= 1, `${worst} kin tended one person at once — the spiral is back`);
});
t('a hungry kin does not run errands', () => {
  const s = new Sim({ seed: 'live' });
  for (let i = 0; i < C.TICKS_PER_DAY * 60; i++) {
    s.step();
    if (i % 89 !== 0) continue;
    for (let id = 0; id < s.count; id++) {
      if (!s.k.alive[id] || s.k.goal[id] !== 9) continue;
      ok(s.k.need[id * NEEDS.length + 2] > 0.25, 'a starving kin went tending');
    }
  }
});
t('a town with someone to look after does not collapse', () => {
  const s = new Sim({ seed: 'basement' });
  run(s, 150);
  ok(s.alive > 5, `collapsed to ${s.alive} — check the tend goal`);
});
t('glued state round-trips through a save', () => {
  const s = new Sim({ seed: 'c' });
  run(s, 25);
  const grab = (x) => { const o = []; for (let i = 0; i < x.count; i++) if (x.k.glued[i]) o.push([i, x.k.x[i], x.k.y[i], x.k.nameId[i]]); return JSON.stringify(o); };
  const before = grab(s);
  const r = Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  eq(grab(r), before, 'glued state did not survive the save');
  eq(r.fingerprint(), s.fingerprint(), 'fingerprint changed across the save');
});
t('founders are never born already past their lifespan', () => {
  for (let i = 0; i < 25; i++) {
    const s = new Sim({ seed: 'fx' + i });
    for (let id = 0; id < s.count; id++) {
      if (!s.k.alive[id]) continue;
      ok(s.k.age[id] < s.k.lifespan[id],
        `founder aged ${s.k.age[id].toFixed(0)} with a lifespan of ${s.k.lifespan[id].toFixed(0)}`);
    }
  }
});

t('the whole save round-trips, not just the fingerprint', () => {
  saveEqual(fixture('live', 200), 'live');
  for (const seed of ['basement', 'c']) saveEqual(run(new Sim({ seed }), 40), seed);
});
t('the narrator keeps its own place across a save', () => {
  const s = new Sim({ seed: 'live' });
  run(s, 60);
  const r = Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  eq(r._hatches, s._hatches, 'hatch counter');
  eq(r._lastRainLog, s._lastRainLog, 'rain silence');
  eq(JSON.stringify([...r.eventCounts.entries()].sort()), JSON.stringify([...s.eventCounts.entries()].sort()), 'rarity ledger');
  run(s, 20); run(r, 20);
  eq(r.chronicle.length, s.chronicle.length, 'the two told different numbers of stories');
});
t('a save written before a field existed does not resurrect phantoms', () => {
  const s = new Sim({ seed: 'oldsave' });
  run(s, 20);
  const o = JSON.parse(JSON.stringify(s.toJSON()));
  delete o.k.glued; delete o.k.tender; delete o.narr;   // a v0.2 save
  const r = Sim.fromJSON(o);
  let glued = 0;
  for (let i = 0; i < r.count; i++) if (r.k.alive[i] && r.k.glued[i]) glued++;
  eq(glued, 0, 'an old save came back with a glued stranger');
  ok(r.eventCounts.size > 0, 'the rarity ledger was not rebuilt');
});
t('founders:0 really means zero', () => {
  const s = new Sim({ seed: 'nobody', founders: 0 });
  eq(s.count, 0, 'phantom founders');
});
t('the founding survives a very long life', () => {
  const s = new Sim({ seed: 'longlife' });
  for (let d = 0; d < 700 && s.alive !== 0; d++) run(s, 1);
  const r = Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  ok(r.chronicle.some(e => e.kind === 'open'), 'the book deleted its own first page');
});

t('a seed is the same world whatever month it is', () => {
  // ⚠️ main.js used to write the season into the shared C object, so the same
  // seed grew a different town in January than in July.
  const jan = new Sim({ seed: 'season', ambientBase: 12.5 });
  const jul = new Sim({ seed: 'season', ambientBase: 24.5 });
  for (let i = 0; i < jan.N * jan.N; i++) eq(jan.height[i], jul.height[i], 'terrain differs by month');
  eq(JSON.stringify(jan.pond), JSON.stringify(jul.pond), 'pond differs by month');
  eq(JSON.stringify(jan.hearth), JSON.stringify(jul.hearth), 'hearth differs by month');
  ok(jan.ambient < jul.ambient, 'the basement is not colder in winter');
});
t('the room temperature round-trips', () => {
  const s = new Sim({ seed: 'amb', ambientBase: 14.25 });
  run(s, 6);
  const r = Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  eq(r.ambientBase, 14.25, 'ambientBase');
  saveEqual(s, 'ambient');
});

// --- the weave (bible §7) ---------------------------------------------------
console.log('the weave');
// ⚠️ ONE FIXTURE, SHARED. Each of these used to grow its own 200-day colony,
// which pushed the whole battery past ten minutes at N=96 — and a gate nobody
// can afford to run is not a gate. Culture needs real time to happen, so grow
// the town ONCE and ask it seven questions.
const W = (() => {
  const s = new Sim({ seed: 'bat0' });
  const glueSeen = [];
  for (let i = 0; i < C.TICKS_PER_DAY * 200; i++) {
    s.step();
    if (i % 997 !== 0) continue;
    for (let id = 0; id < s.count; id++) {
      if (s.k.alive[id] && s.k.glued[id]) glueSeen.push(s.k.goal[id]);
    }
  }
  return { s, glueSeen };
})();

t('a town under pressure works something out', () => {
  ok(W.s.prac.some(p => p.invented >= 0), 'nobody ever invented anything');
  ok(W.s.works.length > 0, 'nothing was ever built');
  ok(W.s.chronicle.some(e => e.kind === 'invented'), 'invention never reached the book');
});
t('what one works out, another can learn by watching', () => {
  let holders = 0;
  for (let id = 0; id < W.s.count; id++) if (W.s.k.alive[id] && W.s.k.knows[id]) holders++;
  ok(holders > 1, `only ${holders} kin carry any practice — it is not spreading`);
});
t('a practice outlives the one who thought of it', () => {
  // the bible's own acceptance test for culture (§7): somebody DOES it who
  // cannot have been taught by the inventor, because they were born after that
  // person died. This is the only thing k.born is read for.
  ok(W.s.prac.some(p => p.tradition >= 0), 'no practice ever became a tradition');
  ok(W.s.chronicle.some(e => e.kind === 'tradition'), 'tradition never reached the book');
});
t('what they build stands, and does something', () => {
  const standing = W.s.works.filter(o => o.prog >= 0.9).length;
  ok(standing > 0, 'nothing they built ever finished');
  for (const o of W.s.works) {
    ok(o.stock >= 0 && o.prog >= 0 && o.prog <= 1, 'a work has impossible state');
    ok(Number.isFinite(o.x) && Number.isFinite(o.y), 'a work is nowhere');
  }
});
t('the one who stays never builds', () => {
  // same class as the errand bug — making a thing means going to it
  ok(W.glueSeen.length > 0, 'never sampled a glued kin');
  ok(!W.glueSeen.includes(10), 'a glued kin went to build something');
});
t('the weave round-trips through a save', () => {
  ok(W.s.works.length > 0, 'nothing built, so this proves nothing');
  saveEqual(W.s, 'weave');
  const r = Sim.fromJSON(JSON.parse(JSON.stringify(W.s.toJSON())));
  eq(r.works.length, W.s.works.length, 'works count');
  eq(JSON.stringify(r.prac), JSON.stringify(W.s.prac), 'practice state');
  let x = 0, y = 0;
  for (let i = 0; i < W.s.count; i++) { x += W.s.k.knows[i]; y += r.k.knows[i]; }
  eq(y, x, 'who knows what');
  eq(r.fingerprint(), W.s.fingerprint(), 'fingerprint');
});
t('a restored town keeps building the same way', () => {
  const a2 = Sim.fromJSON(JSON.parse(JSON.stringify(W.s.toJSON())));
  const b2 = Sim.fromJSON(JSON.parse(JSON.stringify(W.s.toJSON())));
  run(a2, 20); run(b2, 20);
  eq(b2.fingerprint(), a2.fingerprint(), 'two restores of one save diverged');
});

// --- the town remembers the hand (bible §6.4 / §9) --------------------------
console.log('memory of the hand');
const MEM = (() => {
  const s = new Sim({ seed: 'bat0' });
  run(s, 90);
  s.setHand(s.hearth.x, s.hearth.y);
  run(s, 40);
  return s;
})();

t('the finger writes a memory, and the sign is the KIN’S OWN', () => {
  // ⚠️ THE HEADLINE. One press, one tick, and the same warmth is remembered as
  // good by a bloodline whose comfort band contains it and as bad by one it
  // overshoots. Measured: plain (18-32) 0% bad, rime (6-21, lethal 34) 53% bad.
  // Never assert this on DISTANCE — kin cluster around food and water and it
  // drowns the signal. The memory itself is the thing under test.
  const by = {};
  for (let id = 0; id < MEM.count; id++) {
    if (!MEM.k.alive[id] || MEM.k.memV[id] === 0) continue;
    const g = MEM.k.genome.subarray(id * LOCI.length * 2, (id + 1) * LOCI.length * 2);
    const h = expressed(g, L.hide);
    (by[h] || (by[h] = [])).push(MEM.k.memV[id]);
  }
  ok(Object.keys(by).length > 0, 'nobody remembers the hand at all');
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  if (by.plain && by.rime) {
    ok(mean(by.plain) > mean(by.rime),
      `bloodlines did not diverge: plain ${mean(by.plain).toFixed(2)} vs rime ${mean(by.rime).toFixed(2)}`);
    ok(by.rime.some(v => v < 0), 'no rime kin holds the warmth as harm');
  }
});
t('the hand reaches the town’s own record', () => {
  const kinds = ['scorch', 'drought', 'nonight', 'warmth', 'placename'];
  ok(MEM.chronicle.some(e => kinds.includes(e.kind)), 'the hand never appears in the book');
});
t('the town has no word for the player', () => {
  // P3: cruelty is simulated and visible, and NEVER addressed. If a line ever
  // says "you", the game has started telling the player what they are.
  for (const s of [MEM, fixture('page', 240), W.s]) {
    for (const e of s.chronicle) {
      ok(!/\byou(r|rs)?\b/i.test(e.text), `the record spoke to the player: "${e.text}"`);
    }
  }
});
t('memory round-trips, and a remembering town continues identically', () => {
  let held = 0;
  for (let i = 0; i < MEM.count; i++) if (MEM.k.alive[i] && MEM.k.memV[i] !== 0) held++;
  ok(held > 0, 'nothing to round-trip');
  saveEqual(MEM, 'memory');
  const r = Sim.fromJSON(JSON.parse(JSON.stringify(MEM.toJSON())));
  eq(r.fingerprint(), MEM.fingerprint(), 'fingerprint');
  eq(JSON.stringify(r.placeNames), JSON.stringify(MEM.placeNames), 'place names');
  const a2 = clone(MEM), b2 = clone(MEM);
  a2.setHand(a2.hearth.x, a2.hearth.y); b2.setHand(b2.hearth.x, b2.hearth.y);
  run(a2, 15); run(b2, 15);
  eq(b2.fingerprint(), a2.fingerprint(), 'two remembering towns diverged');
});
t('the same hand on the same seed writes the same memory', () => {
  const mk = () => { const s = new Sim({ seed: 'handdet' }); run(s, 30); s.setHand(20 * S, 20 * S); run(s, 20); s.setHand(null); run(s, 10); return s; };
  eq(mk().fingerprint(), mk().fingerprint(), 'a scripted hand was not deterministic');
});

t('what they build actually works', () => {
  // ⚠️ REGRESSION GUARD FOR THE WORST BUG THIS GAME HAS HAD. A deadband stopped
  // finished works being re-offered, but every EFFECT still asked for prog >= 1
  // and building stopped at the deadband — so across 300 days NO work ever
  // finished, the store fed nobody (stock 0.0000), the windbreak sheltered
  // nobody, and 'stands' fired zero times in the game's life. The player
  // watched a town assemble itself and not one brick of it touched the sim.
  const s = fixture('bat0', 300);
  const standing = s.works.filter(o => o.prog >= WORK_DONE);
  ok(standing.length > 0, 'nothing they built ever counted as standing');
  ok(s.chronicle.some(e => e.kind === 'stands'), 'the town never noticed a thing being finished');
  const stores = s.works.filter(o => o.kind === WORK_AT.store && o.prog >= WORK_DONE);
  if (stores.length) ok(stores.some(o => o.stock > 0), 'no store ever held anything');
});
// ⚠⚠ THIS TEST USED TO ASSERT `bad === 0` AND THAT THRESHOLD IS NOW WRONG.
// It was written for a real bug: kin DYING with saturated moss in arm's reach,
// measured at 13 of 13 — every single starving kin in the town. The cause was
// the mouth (they ate the cell under their feet, not the cell they had walked
// to) and it is fixed.
// What `bad > 0` measures TODAY is population pressure, which is a different
// phenomenon and not a defect: farming took the town from ~40 kin to ~219, and
// a growing town always has somebody walking to dinner at any instant. Holding
// the old absolute zero would mean capping the population to keep a counter
// happy — tuning the game to fit the test.
// So this now asserts the invariant the original bug actually violated, which
// an absolute count never checked: HUNGER MUST NOT BE A STUCK STATE. Flag every
// kin starving within reach of food, run three days, and require that most of
// them ate. Under the original bug they starved to death where they stood.
t('hunger is not a stuck state — kin starving near food go and eat', () => {
  const s = clone(fixture('bat0', 300));
  const NN = NEEDS.length;
  const flagged = [];
  for (let id = 0; id < s.count; id++) {
    if (!s.k.alive[id] || s.k.need[id * NN + 2] > 0.15) continue;
    let best = 0;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const m = s.moss[s.idx(s.k.x[id] + dx, s.k.y[id] + dy)];
      if (m > best) best = m;
    }
    if (best > 0.5) flagged.push(id);
  }
  ok(flagged.length > 0, 'nobody was hungry at all — the fixture stopped being a test');
  run(s, 3);
  let fed = 0, died = 0, managing = 0;
  for (const id of flagged) {
    if (!s.k.alive[id]) { died++; continue; }
    if (s.k.need[id * NN + 2] > 0.35) fed++;
    else if (s.k.strain[id] < 0.6) managing++;
  }
  // ⚠ RECALIBRATED FOR THE LATER AGES, and here is the reasoning in full so
  // nobody tightens it back by instinct. The original bug was kin DYING where
  // they stood with food in arm's reach — 13 of 13, dead. The fed>=50% form
  // was calibrated when day-300 towns held ~219 kin and flagged ~30; the ages
  // economy holds ~236 and flags ~10, and that small tail includes kin who
  // oscillate between warmth and food all night and SURVIVE on grazing
  // trickles — measured: strain 0.0 while need sits at 0.1. Alive, managing,
  // uncomfortable is the town working, not the bug. So the asserts are now the
  // invariant itself: almost nobody dies, and everyone left is either fed or
  // holding strain down. Under the original bug this fails instantly (all
  // dead); under a transit-collapse it fails on the managing line.
  ok(died <= flagged.length * 0.35,
    `${died} of ${flagged.length} starved to death with food within eight cells`);
  ok(fed + managing >= flagged.length * 0.8,
    `${fed} fed + ${managing} managing of ${flagged.length} — the rest are dying in place`);
});

// ── THE ECOSYSTEM ─────────────────────────────────────────────
// The player is allowed to never touch the board. If a town cannot live
// through that, nothing else in the game matters.
t('a town nobody ever touches is still alive after 400 days', () => {
  for (const seed of ['eco1', 'eco2']) {
    const s = run(new Sim({ seed }), 400);
    ok(s.alive >= 12, `${seed}: only ${s.alive} left after 400 untouched days`);
    ok(s.stats.peak >= 30, `${seed}: peaked at only ${s.stats.peak}`);
  }
});

t('a town works out farming, and the fields feed the stores', () => {
  const s = run(new Sim({ seed: 'farmt' }), 300);
  const standing = (kind) => s.works.filter(o => o.kind === kind && o.prog >= WORK_DONE);
  ok(standing(WORK_AT.farm).length > 0, 'no field was ever turned');
  ok(standing(WORK_AT.well).length > 0, 'no well was ever dug');
  // the whole point of the chain: the stores are not empty
  const food = standing(WORK_AT.granary).concat(standing(WORK_AT.store))
    .reduce((a, o) => a + o.stock, 0);
  ok(food > 0.5, `every food store in the town is empty (${food.toFixed(2)})`);
});

t('a well is drinkable, and it is the well that does it', () => {
  const s = new Sim({ seed: 'wellt' });
  // put a kin on dry ground far from water, and a standing well beside them
  const id = 0;
  let dry = -1;
  for (let i = 0; i < s.N * s.N && dry < 0; i++) {
    if (s.water[i] <= 0.001) {
      const x = i % s.N, y = (i / s.N) | 0;
      let wetNear = false;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        if (s.water[s.idx(x + dx, y + dy)] > 0.004) wetNear = true;
      }
      if (!wetNear) dry = i;
    }
  }
  ok(dry >= 0, 'no dry ground on the board to test with');
  s.k.x[id] = dry % s.N; s.k.y[id] = (dry / s.N) | 0;
  s.k.alive[id] = 1; s.k.stage[id] = STAGE.WHOLE;
  s.k.goal[id] = 2;                                  // drinking
  const NN = NEEDS.length;
  s.k.need[id * NN + 1] = 0.2;
  const before = s.k.need[id * NN + 1];
  s._act(id, 2);
  eq(s.k.need[id * NN + 1], before, 'drank on dry ground with no well');
  s.works.push({ id: 9999, kind: WORK_AT.well, x: s.k.x[id], y: s.k.y[id], prog: 1, by: -1, day: 0, stock: 0 });
  s._act(id, 2);
  ok(s.k.need[id * NN + 1] > before, 'a standing well beside them gave no water');
});

t('the ages turn, and an age can be lost again', () => {
  // ⚠ founders: 0 because a real founding is ENDOWED with huts and therefore
  // opens in the settling age — this test is about the ladder itself, so it
  // needs the one board in the game that genuinely has nothing on it.
  const s = new Sim({ seed: 'aget', founders: 0 });
  eq(s.ageNow(), 0, 'a board with nothing on it is not in the gathering days');
  s.works.push({ id: 9001, kind: WORK_AT.hut, x: 40, y: 40, prog: 1, by: -1, day: 0, stock: 0 });
  eq(s.ageNow(), 1, 'a standing hut did not turn the age');
  s.works.push({ id: 9002, kind: WORK_AT.farm, x: 42, y: 40, prog: 1, by: -1, day: 0, stock: 0 });
  eq(s.ageNow(), 2, 'a standing field did not turn the age');
  s.works.push({ id: 9003, kind: WORK_AT.granary, x: 44, y: 40, prog: 1, by: -1, day: 0, stock: 0 });
  eq(s.ageNow(), 3, 'a standing granary did not turn the age');
  // ⚠ an age you cannot lose is a score, not an age
  s.works = s.works.filter(o => o.kind !== WORK_AT.granary);
  eq(s.ageNow(), 2, 'the age did not fall back when the granary went');
});

t('a town reaches the farming age on its own, and the save remembers which age', () => {
  const s = run(new Sim({ seed: 'agerun' }), 200);
  ok(s.ageNow() >= 2, `after 200 days the town is still in ${AGES[s.ageNow()].key}`);
  saveEqual(s, 'age');
  const back = clone(s);
  eq(back.age, s.age, 'the last-seen age did not survive the save');
  eq(back.ageNow(), s.ageNow(), 'the board reads a different age after a reload');
});

// ── THE LATER AGES ────────────────────────────────────────────
t('WORKS fits in the 16-bit knows mask', () => {
  // k.knows is a Uint16Array. The 17th work silently corrupts every mask.
  ok(WORKS.length <= 16, 'WORKS has outgrown Uint16Array — widen knows AND migrate saves');
});

t('the mill grinds — a milled harvest banks faster', () => {
  const mk = (withMill) => {
    const s2 = new Sim({ seed: 'millt', founders: 0 });
    s2.works.push({ id: 900, kind: WORK_AT.farm, x: 40, y: 40, prog: 1, by: -1, day: 0, stock: 0 });
    s2.works.push({ id: 901, kind: WORK_AT.granary, x: 46, y: 40, prog: 1, by: -1, day: 0, stock: 0 });
    if (withMill) s2.works.push({ id: 902, kind: WORK_AT.mill, x: 40, y: 44, prog: 1, by: -1, day: 0, stock: 0 });
    // prime the field and hold it primed: only the TAKE rate is under test
    const R = WORKS[WORK_AT.farm].radius;
    for (let y = 34; y <= 46; y++) for (let x = 34; x <= 46; x++) {
      const dx = x - 40, dy = y - 40;
      if (dx * dx + dy * dy <= R * R) s2.moss[y * s2.N + x] = 0.6;
    }
    s2.dayFrac = 0.5;                              // midday
    // ⚠ 28 iterations, NOT 40: at 40 the milled run hits the granary cap (8.0)
    // and the assert measures the ceiling instead of the grind rate.
    for (let i = 0; i < 28; i++) {
      s2._sow(1);
      for (let y = 34; y <= 46; y++) for (let x = 34; x <= 46; x++) {
        const dx = x - 40, dy = y - 40;
        if (dx * dx + dy * dy <= R * R) s2.moss[y * s2.N + x] = 0.6;
      }
    }
    return s2.works.find(o => o.id === 901).stock;
  };
  const plain = mk(false), milled = mk(true);
  ok(plain > 0.05, 'the unmilled harvest banked nothing — the scenario is broken, not the mill');
  ok(milled > plain * 1.3, `the mill changed nothing: ${plain.toFixed(3)} -> ${milled.toFixed(3)}`);
});

t('the dynamo keeps the fields growing after dark', () => {
  const mk = (withDyn) => {
    const s2 = new Sim({ seed: 'dynt', founders: 0 });
    s2.works.push({ id: 900, kind: WORK_AT.farm, x: 40, y: 40, prog: 1, by: -1, day: 0, stock: 0 });
    if (withDyn) s2.works.push({ id: 903, kind: WORK_AT.dynamo, x: 43, y: 40, prog: 1, by: -1, day: 0, stock: 0 });
    // ⚠ dayFrac 0.99 is daylight 0.0007, not zero. (The getter DOES reach
    // exactly zero — daylight is d * curtain, so setCurtain(0) pins it — and
    // the second leg below uses that to exercise the hasPower early-out,
    // which this leg cannot: at 0.0007 the early-out never fires and the
    // review proved its clause could be deleted with this test still green.)
    s2.dayFrac = 0.99;
    ok(s2.daylight < 0.01, 'the night is not dark enough for this test to mean anything');
    const i0 = 40 * s2.N + 40;
    s2.moss[i0] = 0.2; s2.moist[i0] = 0.8;
    for (let i = 0; i < 60; i++) s2._sow(1);
    return s2.moss[i0];
  };
  const dark = mk(false), lit = mk(true);
  ok(dark < 0.2005, 'an unlit field grew in the dark — the night gate broke');
  ok(lit > dark + 0.004, `the dynamo lit nothing: dark ${dark.toFixed(4)} vs lit ${lit.toFixed(4)}`);
  // ── TRUE darkness: curtain 0 makes daylight EXACTLY 0, which is the only
  // state where the hasPower clause in _sow's early-out matters at all
  const mk0 = (withDyn) => {
    const s2 = new Sim({ seed: 'dynt', founders: 0 });
    s2.works.push({ id: 900, kind: WORK_AT.farm, x: 40, y: 40, prog: 1, by: -1, day: 0, stock: 0 });
    if (withDyn) s2.works.push({ id: 903, kind: WORK_AT.dynamo, x: 43, y: 40, prog: 1, by: -1, day: 0, stock: 0 });
    s2.setCurtain(0);
    ok(s2.daylight === 0, 'curtain 0 did not make true darkness — the getter changed');
    const i0 = 40 * s2.N + 40;
    s2.moss[i0] = 0.2; s2.moist[i0] = 0.8;
    for (let i = 0; i < 60; i++) s2._sow(1);
    return s2.moss[i0];
  };
  const dead = mk0(false), kept = mk0(true);
  eq(dead, 0.2, 'an unlit field grew at daylight === 0');
  ok(kept > 0.2 + 0.004, `at true darkness the dynamo did nothing: ${kept.toFixed(4)}`);
});

t('the mending house heals — strain recovers faster in its shadow', () => {
  const mk = (withMend) => {
    const s2 = new Sim({ seed: 'mendt', founders: 2 });
    if (withMend) s2.works.push({ id: 904, kind: WORK_AT.mend, x: s2.hearth.x, y: s2.hearth.y, prog: 1, by: -1, day: 0, stock: 0 });
    const id = 0;
    s2.k.x[id] = s2.hearth.x; s2.k.y[id] = s2.hearth.y;
    s2.k.glued[id] = 1;                            // hold them still
    s2.k.strain[id] = 0.6;
    const NN = NEEDS.length;
    for (let q = 0; q < NN; q++) s2.k.need[id * NN + q] = 1;   // no hurt — only recovery
    // ⚠ 120 steps, not 18: the decay is ~0.0008/step unmended, so a short run
    // leaves the two towns 0.03 apart — a margin the assert cannot stand on.
    // Measured at 18 steps the RATIO was already the intended 3.1x; the run
    // length is about making that visible, not about making it true.
    for (let i = 0; i < 120; i++) s2.step();
    return s2.k.strain[id];
  };
  const far = mk(false), near = mk(true);
  ok(near < far - 0.05, `the mending house healed nothing: ${far.toFixed(3)} vs ${near.toFixed(3)}`);
});

t('the school quickens the telling', () => {
  // same seed, same rng draw sequence: the school widens the THRESHOLD, so on
  // an identical draw sequence the first success can only come sooner or at
  // the same draw — never later. That is also the determinism law holding.
  const mk = (withSchool, seed2) => {
    const s2 = new Sim({ seed: seed2 || 'schoolt', founders: 2 });
    const A = 0, B = 1, NN = NEEDS.length;
    for (const id of [A, B]) {
      s2.k.x[id] = s2.hearth.x + (id === B ? 1 : 0); s2.k.y[id] = s2.hearth.y;
      s2.k.stage[id] = STAGE.WHOLE;
      s2.k.tx[id] = s2.k.x[id]; s2.k.ty[id] = s2.k.y[id];   // near === true
    }
    s2.k.knows[A] = 1 << 3; s2.k.knows[B] = 0;
    if (withSchool) s2.works.push({ id: 905, kind: WORK_AT.school, x: s2.hearth.x, y: s2.hearth.y, prog: 1, by: -1, day: 0, stock: 0 });
    s2.k.goal[A] = 5;
    let ticks = 0;
    while (!(s2.k.knows[B] & (1 << 3)) && ticks < 4000) { s2._act(A, 5); ticks++; }
    return ticks;
  };
  // ⚠ on any ONE seed the first roll under 0.02 may also be the first under
  // 0.048 — a tie that says nothing either way (measured: seed 'schoolt' ties
  // at 3 ticks). So scan seeds until the thresholds separate; each probe is
  // fully deterministic, ties are SKIPPED not failed, and a strictly slower
  // schooled run on any seed is still an instant failure. P(30 straight ties)
  // is ~1e-11, so the cap only trips if the mechanism is actually broken.
  let separated = false;
  for (let sd = 0; sd < 30 && !separated; sd++) {
    const slow = mk(false, 'schoolt' + sd), fast = mk(true, 'schoolt' + sd);
    ok(slow < 4000 && fast < 4000, 'nobody ever taught anybody — the scenario is broken');
    ok(fast <= slow, `the school made the telling SLOWER on seed ${sd}: ${slow} vs ${fast} ticks`);
    if (fast < slow) separated = true;
  }
  ok(separated, 'thirty seeds and the school never once beat the fireside — the boost is not being read');
});

t('the ladder reaches the little lights', () => {
  // the same 300-day fixture the other batteries share — the whole point of
  // the later ages is that a town gets there ON ITS OWN.
  const s2 = fixture('bat0', 300);
  ok(s2.prac[WORK_AT.mill].invented >= 0, 'no town ever set the wind to grinding');
  ok(s2.prac[WORK_AT.dynamo].invented >= 0, 'no town ever bottled the lightning');
  ok(s2.ageNow() >= 4, `day 300 and the town is still in ${AGES[s2.ageNow()].key}`);
});

t('organization grows with the age — huddle first, streets later', () => {
  const mk = () => {
    const s2 = new Sim({ seed: 'orgt', founders: 0 });
    return s2;
  };
  // the settling age: a young town HUDDLES — small gaps are legal
  const a = mk();
  a.works.push({ id: 900, kind: WORK_AT.hut, x: 40, y: 40, prog: 1, by: -1, day: 0, stock: 0 });
  eq(a.ageNow(), 1, 'one standing hut is the settling');
  const [hx, hy] = a._siteWork(WORK_AT.hut, 41, 40);
  const dHud = Math.hypot(hx - 40, hy - 40);
  ok(dHud >= 3.6 - 1e-9, `the huddle broke its own minimum: ${dHud.toFixed(2)}`);
  ok(dHud < 4.8, `the young town is not huddling: ${dHud.toFixed(2)} — this is old-age spacing`);
  // the kept winter: the gap widens AND the lattice takes hold
  const b = mk();
  b.works.push({ id: 900, kind: WORK_AT.hut, x: b.hearth.x, y: b.hearth.y, prog: 1, by: -1, day: 0, stock: 0 });
  b.works.push({ id: 901, kind: WORK_AT.farm, x: b.hearth.x + 8, y: b.hearth.y, prog: 1, by: -1, day: 0, stock: 0 });
  b.works.push({ id: 902, kind: WORK_AT.granary, x: b.hearth.x, y: b.hearth.y + 9, prog: 1, by: -1, day: 0, stock: 0 });
  eq(b.ageNow(), 3, 'hut+farm+granary is the kept winter');
  // site from a spot deliberately OFF the street grid, with clear ground
  const PITCH = 5.6;
  const nx = b.hearth.x + PITCH * 2, ny = b.hearth.y - PITCH;   // a far corner, clear of the three works
  const [sx, sy] = b._siteWork(WORK_AT.house, nx + 2, ny + 2);
  const lx = (sx - b.hearth.x) / PITCH, ly = (sy - b.hearth.y) / PITCH;
  const off = Math.hypot(lx - Math.round(lx), ly - Math.round(ly)) * PITCH;
  ok(off < 0.9, `at the kept winter a house ignored the street: ${off.toFixed(2)} cells off the lattice`);
  // spacing against the standing works also held
  for (const o of b.works) {
    const d = Math.hypot(o.x - sx, o.y - sy);
    ok(d >= 3.0, `sited on top of ${WORKS[o.kind].key}: ${d.toFixed(2)}`);
  }
  // ⚠ and the pass consumes NO rng — geography must never shift the stream
  const c1 = mk(), c2 = mk();
  c1.works.push({ id: 900, kind: WORK_AT.hut, x: 40, y: 40, prog: 1, by: -1, day: 0, stock: 0 });
  c1._siteWork(WORK_AT.hut, 44, 40);
  for (let i = 0; i < 50; i++) { const r1 = c1.rng(), r2 = c2.rng(); eq(r1, r2, 'siting consumed rng'); }
});

t('a dead town can be refounded on its own ruins', () => {
  const s2 = clone(fixture('live', 200));
  const worksBefore = s2.works.length;
  const gravesBefore = s2.graves.length;
  const hadTradition = s2.prac.filter(p => p.tradition >= 0).length;
  ok(s2.refound(14) === false, 'a LIVING town was refounded over');
  for (let id = 0; id < s2.count; id++) if (s2.k.alive[id]) s2._die(id, 'age');
  run(s2, 1.2);
  ok(s2._ended, 'the last death did not close the book');
  const fpDead = s2.fingerprint();
  ok(s2.refound(14), 'a dead town refused new figures');
  ok(s2.fingerprint() !== fpDead, 'refounding is invisible to the fingerprint');
  eq(s2.foundings, 2, 'the founding was not counted');
  let liv = 0; for (let id = 0; id < s2.count; id++) if (s2.k.alive[id]) liv++;
  eq(liv, 14, 'the new figures did not arrive');
  ok(s2.works.length === worksBefore, 'the ruins did not survive the refounding');
  ok(s2.graves.length >= gravesBefore, 'the graves were disturbed');
  eq(s2.prac.filter(p => p.tradition >= 0).length, hadTradition, 'the world forgot its practices');
  // the new figures know the founding four and nothing the dead town learned
  for (let id = 0; id < s2.count; id++) if (s2.k.alive[id]) {
    ok((s2.k.knows[id] & 0b1111) === 0b1111, 'a new figure arrived not knowing the founding four');
    ok((s2.k.knows[id] >> 4) === 0, 'a new figure inherited the dead town\'s knowledge');
  }
  // ⚠ surgical fingerprint folds — the refound-changes-the-hash assert above
  // moves alive/kin too, so it cannot prove these two fields are folded
  const fpA = s2.fingerprint(); s2.foundings++;
  ok(s2.fingerprint() !== fpA, 'foundings is invisible to the fingerprint');
  s2.foundings--;
  const fpB = s2.fingerprint(); s2.ageBest = (s2.ageBest || 0) + 1;
  ok(s2.fingerprint() !== fpB, 'ageBest is invisible to the fingerprint');
  s2.ageBest--;
  eq(s2.fingerprint(), fpB, 'the fold probes did not restore cleanly');
  saveEqual(s2, 'refound');
  run(s2, 3);
  ok(s2.alive > 0, 'the refounded town died within three days');
});
t('a save from a differently-shaped world is refused, not laid into this one', () => {
  // ⚠️ LIVE HAZARD: the grid went 64 -> 96 and TypedArray.set does NOT throw on
  // a short source, so yesterday's save loaded silently into a bigger world
  // with its pond on a hillside — and the 25s autosave wrote it back.
  const s = new Sim({ seed: 'shape' });
  run(s, 3);
  const o = JSON.parse(JSON.stringify(s.toJSON()));
  o.fields.temp = o.fields.temp.slice(0, 64 * 64);
  let threw = false;
  try { Sim.fromJSON(o); } catch (e) { threw = true; }
  ok(threw, 'a 64-grid save was accepted into a 96-grid world');
});
t('the town never speaks to the player, even when breathed on', () => {
  // ⚠️ this used to pass only because no fixture ever BREATHED — and the breath
  // line said "you breathed on the town". Drive all five verbs.
  const s = new Sim({ seed: 'verbs' });
  run(s, 20);
  s.setHand(20 * S, 20 * S); run(s, 6); s.setHand(null);
  s.setTilt(0.15, 0.1); run(s, 4); s.setTilt(0, 0);
  for (let i = 0; i < 60; i++) { s.breathe(0.1); s.step(); }
  run(s, 4);
  s.setLid(true); run(s, 6); s.setLid(false);
  s.setLamp(true); s.setCurtain(0.2); run(s, 6);
  ok(s.chronicle.some(e => e.kind === 'breath'), 'never actually breathed');
  for (const e of s.chronicle) {
    ok(!/\byou(r|rs)?\b/i.test(e.text), `the record spoke to the player: "${e.text}"`);
  }
});

// --- soak ------------------------------------------------------------------
console.log('soak');
t('4 seeds x 112 days, zero errors', () => {
  for (let i = 0; i < 4; i++) {
    const s = new Sim({ seed: 1000 + i * 7919 });
    run(s, 112);
    ok(Number.isFinite(s.wellbeing), `seed ${i}: wellbeing NaN`);
    ok(s.count <= C.CAP, `seed ${i}: over capacity`);
    for (let id = 0; id < s.count; id++) if (s.k.alive[id]) {
      ok(Number.isFinite(s.k.x[id]) && Number.isFinite(s.k.y[id]), `seed ${i}: NaN position`);
    }
  }
});
t('a town left in the dark eventually goes quiet', () => {
  // ⚠️ 200 days, not 140. The board holds standing moss, so a bigger board
  // holds a bigger larder — at N=96 there is 2.25x more of it and the colony
  // eats through the stock before it starves. Measured across three seeds:
  // below 8 alive on days 40 / 80 / 159, extinct 62 / 110 / 186.
  const s = new Sim({ seed: 'dark' });
  s.setCurtain(0);
  run(s, 200);
  ok(s.alive < 8, `starvation in the dark did not bite: ${s.alive} alive`);
});

// --- report ----------------------------------------------------------------
console.log('');
{
  const s = new Sim({ seed: 'report' });
  run(s, 300);
  console.log(`sample run (seed "report", 300 days):`);
  console.log(`  alive ${s.alive} · born ${s.stats.born} · died ${s.stats.died} · buried ${s.stats.buried} · peak ${s.stats.peak} · gen ${s.stats.generations}`);
  console.log(`  the page:`);
  s.page().forEach(e => console.log(`    day ${String(e.day).padStart(3)} · ${e.text}`));
}

times.sort((x, y) => y[0] - x[0]);
const total = times.reduce((s, x) => s + x[0], 0);
console.log(`\nSLOWEST (of ${(total / 1000).toFixed(0)}s total):`);
times.slice(0, 12).forEach(([ms, n]) => console.log(`  ${(ms / 1000).toFixed(1)}s  ${n}`));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
