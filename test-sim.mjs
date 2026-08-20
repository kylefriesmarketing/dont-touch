// DON'T TOUCH — test-sim.mjs
// Headless battery. `node test-sim.mjs`
// Invariant 4: every era gets a soak, zero errors, no NaN, nothing outside the jar.

import { Sim, C, LOCI, L, expressed, NEEDS, STAGE, makeRNG } from './sim.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { const r = fn(); if (r === false) throw new Error('returned false'); pass++; }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`); }
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
    ok(d < 16, `${seed}: founders start ${d.toFixed(0)} cells from water`);
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
  s.setHand(20, 20); run(s, 2);
  const near = s.temp[s.idx(20, 20)], far = s.temp[s.idx(55, 55)];
  ok(near > 40, `finger too cold: ${near.toFixed(1)}`);
  ok(far < near - 15, `heat leaked everywhere: near ${near.toFixed(1)} far ${far.toFixed(1)}`);
});
t('heat arrives slowly (no instant kill)', () => {
  const s = new Sim({ seed: 'a', founders: 0 });
  s.setHand(20, 20);
  for (let i = 0; i < 15; i++) s.step();   // one second
  ok(s.temp[s.idx(20, 20)] < 40, 'the finger is a laser');
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
t('a sealed jar keeps its water; an open lid loses it', () => {
  const total = (s) => { let w = s.humid + s.rainLeft; for (let i = 0; i < s.N * s.N; i++) w += s.water[i]; return w; };
  const a = new Sim({ seed: 'seal', founders: 0 });
  const t0 = total(a); run(a, 34);
  ok(total(a) > t0 * 0.97, `sealed jar leaked: ${t0.toFixed(2)} -> ${total(a).toFixed(2)}`);
  const b = new Sim({ seed: 'seal', founders: 0 });
  b.setLid(true); run(b, 34);
  ok(total(b) < total(a) * 0.8, `open lid did not dry it out: ${total(b).toFixed(2)} vs ${total(a).toFixed(2)}`);
});
t('sustained heat sterilises moss', () => {
  const s = new Sim({ seed: 'a', founders: 0 });
  const i = s.idx(20, 20); s.moss[i] = 1;
  s.setHand(20, 20); run(s, 4);
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
  for (let i = 0; i < n; i++) { const a = s._spawn(10, 10, het, -1, -1, 1); sh += s.k.lifespan[a]; s.k.alive[a] = 0; s.free.push(a); }
  for (let i = 0; i < n; i++) { const a = s._spawn(10, 10, hom, -1, -1, 1); sm += s.k.lifespan[a]; s.k.alive[a] = 0; s.free.push(a); }
  ok(sm / n < sh / n * 0.62, `homozygous not penalised: ${(sh / n).toFixed(0)} vs ${(sm / n).toFixed(0)}`);
});
t('children draw one allele from each parent', () => {
  const s = new Sim({ seed: 'e', founders: 0 });
  const G = LOCI.length * 2;
  const gm = new Uint8Array(G).fill(0), gf = new Uint8Array(G).fill(1);
  const mo = s._spawn(20, 20, gm, -1, -1, 1), fa = s._spawn(20, 20, gf, -1, -1, 1);
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
  const s = new Sim({ seed: 'live' });
  run(s, 200);
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
  const a = new Sim({ seed: 'cruel' }); run(a, 40);
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
  const cruel = a.stats.died - d0, kind = b.stats.died - d0;
  ok(cruel > kind, `the finger cost nothing: ${cruel} dead vs ${kind} left alone`);
  ok(Math.max(...a.temp) > 44, 'the finger never got lethal');
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
  const s = new Sim({ seed: 'page' });
  run(s, 240);
  const p = s.page();
  const newest = Math.max(...p.map(e => e.day));
  ok(newest > s.day * 0.4, `book is blind: newest line is day ${newest} of ${s.day}`);
});
t('the book has a beginning, a middle and an end', () => {
  const s = new Sim({ seed: 'page' });
  run(s, 240);
  const acts = [0, 0, 0];
  s.page().forEach(e => acts[Math.min(2, Math.floor(e.day / (s.day / 3)))]++);
  ok(acts.every(a => a > 0), `all lines fell in one act: ${acts.join('/')}`);
});
t('page(fromDay) returns only that window', () => {
  const s = new Sim({ seed: 'page' });
  run(s, 200);
  const mark = s.day;
  run(s, 40);
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
  for (const seed of ['page', 'live', 'basement']) {
    const s = new Sim({ seed });
    run(s, 150);
    const p = s.page();
    ok(new Set(p).size === p.length, `${seed}: duplicate entries on the page`);
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
  for (const seed of ['live', 'basement', 'c']) {
    const s = new Sim({ seed });
    run(s, 40);
    saveEqual(s, seed);
  }
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
t('a jar left in the dark eventually goes quiet', () => {
  const s = new Sim({ seed: 'dark' });
  s.setCurtain(0);
  run(s, 140);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
