// DON'T TOUCH — vfx.js
// What the hand LOOKS like. View-only spectacle for the twelve verbs, pooled
// into three objects so the whole vocabulary costs three draw calls.
//
// ⚠️ THIS FILE NEVER TOUCHES THE SIM. It reads cell coordinates and nothing
// else. Every random number here is Math.random on purpose (view.js already
// seeds smoke, rain and dust the same way) — none of it can move the world.
//
// ⚠️ THREE OBJECTS, NOT THREE HUNDRED. A per-event mesh is the obvious way to
// write this and it is the wrong way: the whole frame is ~68 draw calls, so a
// dozen simultaneous rings would be a 20% frame cost for decoration. Rings,
// columns and motes are each ONE buffer written in place, with a live count and
// a draw range. Nothing is ever allocated after construction.
//
// ⚠️⚠️ THE ADDITIVE CEILING IS MEASURED, NOT TASTE. This codebase already paid
// for the lesson once: the vapour dome was costing 55% OF THE BOARD'S
// SATURATION (0.182 vs 0.282 with it hidden) because a white additive sheet
// over a bird's-eye game desaturates the entire picture — which here IS the
// picture. So every effect in this file is LOCAL and TRANSIENT, and the peak
// contributions are capped hard:
//     rings   A_RING  0.55   — never wider than the power's own reach
//     columns A_COL   0.42   — a shaft you can see the town through
//     motes   A_MOTE  0.95   — but only ~14px of screen each, and gone in ~1s
// A veil is a thing that stays. Nothing here stays.
//
// ⚠️ THE SCENE TARGET IS 8-BIT (post.js makes rtScene with no `type`), so a
// colour above 1.0 linear is thrown away. There is no HDR headroom to buy
// punch with — brightness has to come from HUE and CONTRAST against the flock.
// The bloom gate is LINEAR luma 0.42, so anything meant to glow has to land
// above that after its fade multiplier, which is why the cores are near-white.

import * as THREE from './lib/three.module.js';

// pool caps. Chosen so the worst honest case — a dread on top of a call on top
// of a still-fading mend — never has to evict anything mid-life.
const RING_MAX = 12, RING_SEG = 56;   // 2016 verts
const COL_MAX = 6, COL_SEG = 14;      //  252 verts
const P_MAX = 760;

const A_RING = 0.55, A_COL = 0.42, A_MOTE = 0.95;

// the verbs that act on a PLACE rather than on a person. view.js infers these
// from sim state when nobody tells it; naming one outright turns the inference
// off, because a guess must never argue with an answer.
const GROUND_VERB = { call: 1, dread: 1, crumb: 1, water: 1, splash: 1, knock: 1 };

// every per-particle array, in one place, so the pool's swap-remove has a
// constant list to walk instead of building one per dead mote
const P_FIELDS = ['_x','_y','_z','_vx','_vy','_vz','_tx','_ty','_tz',
                  '_cr','_cg','_cb','_li','_lm','_sz','_dg','_gv','_pl','_fl'];

// ⚠️ dt is clamped because a tab that was hidden hands you one enormous frame,
// and an unclamped one teleports every mote off the board in a single step —
// the effect does not play, it simply is not there. 50ms is three frames.
const DT_MAX = 0.05;

// point sprites: gl_PointSize is in device pixels and the fill cost is its
// square, so a mote that ends up filling the screen because the camera dived
// into it is a real hazard. 46px is about a thumbnail at 1600x900.
// ⚠️ WRITTEN AS A STRING ON PURPOSE. Interpolating the NUMBER 46.0 into the
// shader emits `46`, GLSL reads that as an int, and `min(float, int)` has no
// overload — the whole points program fails to compile and every mote in the
// game silently does not exist. (Measured: "ERROR: 0:79: 'min' : no matching
// overloaded function found".) Any float constant baked into GLSL from JS
// needs its decimal point forced.
const PS_MAX = '46.0';

const P_VERT = `
  attribute float psize;
  attribute vec3 pcolor;
  varying vec3 vC;
  uniform float uScale;
  void main() {
    vC = pcolor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(psize * uScale / max(0.0001, -mv.z), ${PS_MAX});
  }
`;
// ⚠️ the sprite's alpha carries the falloff and the COLOUR carries the fade.
// Premultiplying by t.a as well squares the falloff and the motes turn into
// hard little discs with no glow at all — additive already multiplies by alpha.
const P_FRAG = `
  uniform sampler2D uMap;
  varying vec3 vC;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vC, a);
  }
`;

function softSprite(inner, mid) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, `rgba(255,255,255,${inner})`);
  r.addColorStop(0.32, `rgba(255,255,255,${mid})`);
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

const _c = new THREE.Color();
function lin(col) {
  // THREE.Color converts sRGB hex into the working (linear) space on the way
  // in, and vertex colours are read as working space — so this is already the
  // number the additive blend wants. Do not "fix" it with a second convert.
  if (col && col.isColor) return col;
  _c.set(col == null ? 0xffffff : col);
  return _c;
}

export class Vfx {
  // parent: the jar Group (so every effect tilts with the plywood, which is the
  // whole reason this is not parented to the scene).
  // view:   for _surfaceY and sim. K: { GR, YS, EDGE_Y } from view.js's consts.
  constructor(parent, view, K) {
    this.view = view;
    this.sim = view.sim;
    this.GR = K.GR; this.YS = K.YS; this.EDGE_Y = K.EDGE_Y;
    this.t = 0;
    this._v2 = new THREE.Vector2();

    this._buildRings(parent);
    this._buildColumns(parent);
    this._buildMotes(parent);

    // continuous emitters. All of them are STATE, not events: the hand is
    // where it is, so a dropped frame cannot lose a puff.
    this._hand = null;          // { cx, cy, r, e } while a finger is on the board
    this._handT = 0;
    this._pulseT = 0;           // the hand's own heat ring
    this._trailT = {};          // per-key: last time a trail mote was dropped
    this._breathT = 0;
    this._fogPrev = 0;
    this._tiltT = 0;
    // ⚠️ view.js DETECTS some verbs (it watches the gift list, the reach, the
    // held kin) and main.js may also call them explicitly. Both paths land in
    // fire(), so without this the player sees every crumb twice. A claim is
    // per kind AND per place, so two real dreads in different corners both play.
    this._claims = [];
    this._spoke = null;         // when a ground verb was last NAMED by a caller
  }

  // ————————————————————————————————————————————————————————————
  //  geometry
  // ————————————————————————————————————————————————————————————

  // A ring is three concentric rows — transparent, bright, transparent — so it
  // has a soft edge on BOTH sides. Two rows gives you a hard inner lip that
  // reads as a decal; the third row is the difference between "a light on the
  // ground" and "a sticker on the ground".
  _buildRings(parent) {
    const g = new THREE.BufferGeometry();
    const V = RING_MAX * 3 * RING_SEG;
    this._rPos = new Float32Array(V * 3);
    this._rCol = new Float32Array(V * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this._rPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this._rCol, 3));
    const idx = [];
    for (let i = 0; i < RING_MAX; i++) {
      const b = i * 3 * RING_SEG;
      for (let r = 0; r < 2; r++) {
        const a0 = b + r * RING_SEG, a1 = b + (r + 1) * RING_SEG;
        for (let j = 0; j < RING_SEG; j++) {
          const j2 = (j + 1) % RING_SEG;
          idx.push(a0 + j, a1 + j, a1 + j2, a0 + j, a1 + j2, a0 + j2);
        }
      }
    }
    g.setIndex(idx);
    this.ringMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      // ⚠️ MEASURED: 2 DRAW CALLS PER MESH WITHOUT THIS. three renders a
      // transparent DoubleSide material back-faces-then-front-faces unless it
      // is told not to, so rings and columns were quietly costing 4 of the
      // budget's 5 calls between them. Additive blending is order-independent
      // by definition, so the two-pass sort buys exactly nothing here.
      forceSinglePass: true,
    }));
    this.ringMesh.renderOrder = 7;
    this.ringMesh.frustumCulled = false;
    this.ringMesh.visible = false;
    parent.add(this.ringMesh);
    this.rings = [];
    for (let i = 0; i < RING_MAX; i++) this.rings.push({ on: false });
  }

  // A column is an open flared cone — narrow and bright at the boots, wide and
  // gone at the top.
  // ⚠️ NOT A BILLBOARD, and that is deliberate. This game is locked to bird's
  // eye (EL_MIN 0.92 .. EL_MAX 1.52, i.e. 53°..87° down), and a camera-facing
  // quad seen from 87° lies flat and reads as a smear on the grass. A cone has
  // no bad angle: from low it is a shaft, from straight down it is a bright
  // double-walled annulus, because additive draws the far wall too.
  _buildColumns(parent) {
    const g = new THREE.BufferGeometry();
    const V = COL_MAX * 3 * COL_SEG;
    this._cPos = new Float32Array(V * 3);
    this._cCol = new Float32Array(V * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this._cPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this._cCol, 3));
    const idx = [];
    for (let i = 0; i < COL_MAX; i++) {
      const b = i * 3 * COL_SEG;
      for (let r = 0; r < 2; r++) {
        const a0 = b + r * COL_SEG, a1 = b + (r + 1) * COL_SEG;
        for (let j = 0; j < COL_SEG; j++) {
          const j2 = (j + 1) % COL_SEG;
          idx.push(a0 + j, a1 + j, a1 + j2, a0 + j, a1 + j2, a0 + j2);
        }
      }
    }
    g.setIndex(idx);
    this.colMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      forceSinglePass: true,      // see the ring material — this is 2 calls saved
    }));
    this.colMesh.renderOrder = 9;
    this.colMesh.frustumCulled = false;
    this.colMesh.visible = false;
    parent.add(this.colMesh);
    this.cols = [];
    for (let i = 0; i < COL_MAX; i++) this.cols.push({ on: false });
  }

  // ⚠️ A CUSTOM POINTS SHADER, not PointsMaterial, for one reason: size is a
  // single uniform on PointsMaterial, so a shared pool would have to be split
  // into one Points object per size class. A grit fleck and a water droplet are
  // not the same size and must not be two draw calls.
  _buildMotes(parent) {
    const g = new THREE.BufferGeometry();
    this._pPos = new Float32Array(P_MAX * 3);
    this._pCol = new Float32Array(P_MAX * 3);
    this._pSiz = new Float32Array(P_MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this._pPos, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this._pCol, 3));
    g.setAttribute('psize', new THREE.BufferAttribute(this._pSiz, 1));
    g.setDrawRange(0, 0);
    this.moteMat = new THREE.ShaderMaterial({
      vertexShader: P_VERT, fragmentShader: P_FRAG,
      uniforms: { uMap: { value: softSprite(1, 0.42) }, uScale: { value: 450 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.motes = new THREE.Points(g, this.moteMat);
    this.motes.renderOrder = 10;
    this.motes.frustumCulled = false;
    this.motes.visible = false;
    parent.add(this.motes);

    // simulation arrays. Struct-of-arrays because the update is a tight loop
    // over live particles and this is the only shape that stays cheap when the
    // pool is compacted by swapping the tail into the hole.
    this.pn = 0;
    const F = n => new Float32Array(n);
    this._x = F(P_MAX); this._y = F(P_MAX); this._z = F(P_MAX);
    this._vx = F(P_MAX); this._vy = F(P_MAX); this._vz = F(P_MAX);
    this._tx = F(P_MAX); this._ty = F(P_MAX); this._tz = F(P_MAX);
    this._cr = F(P_MAX); this._cg = F(P_MAX); this._cb = F(P_MAX);
    this._li = F(P_MAX); this._lm = F(P_MAX); this._sz = F(P_MAX);
    this._dg = F(P_MAX); this._gv = F(P_MAX); this._pl = F(P_MAX);
    this._fl = F(P_MAX);   // floor: world y the mote stops at (NaN = none)
  }

  // ————————————————————————————————————————————————————————————
  //  coordinates
  // ————————————————————————————————————————————————————————————

  get _cell2w() { return (this.GR * 2) / (this.sim.N - 1); }
  _wx(cx) { return (cx / (this.sim.N - 1) - 0.5) * this.GR * 2; }
  _gx(wx) { return (wx / (this.GR * 2) + 0.5) * (this.sim.N - 1); }
  // the surface the scenery actually presents. Everything that hugs the ground
  // has to ask view.js, or it floats off a hill or buries itself in one — the
  // exact trap the contact disc and the track ring both hit.
  _gy(cx, cy) { return this.view._surfaceY(cx, cy); }

  // ————————————————————————————————————————————————————————————
  //  the API
  // ————————————————————————————————————————————————————————————

  // an expanding (or contracting) ground-hugging ring at a cell.
  // r0/r1/width are in CELLS, life in seconds.
  ring(cx, cy, o = {}) {
    const s = this._freeRing(); if (!s) return;
    const c = lin(o.color);
    s.on = true; s.cx = cx; s.cy = cy;
    s.r0 = o.r0 != null ? o.r0 : 0.5;
    s.r1 = o.r1 != null ? o.r1 : 10;
    s.w = o.width != null ? o.width : 1.2;
    s.fill = !!o.fill;
    s.life = s.max = o.life || 0.7;
    s.a = Math.min(A_RING, o.alpha != null ? o.alpha : A_RING);
    s.y = o.y || 0;
    s.ease = o.ease || 'out';       // 'out' = fade as it grows, 'in' = peak late
    s.r = c.r; s.g = c.g; s.b = c.b;
  }

  // coloured motes thrown out of a point. speed/up/spread are in CELLS/sec.
  burst(cx, cy, o = {}) {
    const c = lin(o.color);
    const n = Math.min(o.n || 14, P_MAX - this.pn);
    const cw = this._cell2w;
    const bx = this._wx(cx), bz = this._wx(cy);
    const by = this._gy(cx, cy) + (o.y || 0.004);
    const sp = (o.speed != null ? o.speed : 6) * cw;
    const up = (o.up != null ? o.up : 4) * cw;
    const spread = (o.spread || 0.4) * cw;
    const life = o.life || 0.8;
    const size = o.size || 0.026;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random());
      const j = 0.55 + Math.random() * 0.9;
      this._push(
        bx + Math.cos(a) * spread * rr, by + Math.random() * spread * 0.5, bz + Math.sin(a) * spread * rr,
        Math.cos(a) * sp * rr * j, up * (0.45 + Math.random()) , Math.sin(a) * sp * rr * j,
        c, size * (0.7 + Math.random() * 0.7), life * (0.7 + Math.random() * 0.6),
        o.grav != null ? o.grav * cw : -3.4 * cw, o.drag != null ? o.drag : 1.4, 0,
        o.floor === false ? NaN : by);
    }
  }

  // the opposite of a burst: motes born on a rim, falling INWARD and speeding
  // up as they arrive. This is the read that makes `call` legible — the eye
  // gets direction from acceleration, not from colour.
  converge(cx, cy, o = {}) {
    const c = lin(o.color);
    const n = Math.min(o.n || 26, P_MAX - this.pn);
    const cw = this._cell2w;
    const bx = this._wx(cx), bz = this._wx(cy);
    const rad = (o.r || 14);
    const life = o.life || 0.9;
    const size = o.size || 0.03;
    for (let i = 0; i < n; i++) {
      // spread the birth ring so they do not arrive as one wall
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.24;
      const rr = rad * (0.72 + Math.random() * 0.38);
      const sx = cx + Math.cos(a) * rr, sy = cy + Math.sin(a) * rr;
      const wy = this._gy(sx, sy) + 0.02 + Math.random() * 0.05;
      const k = this._push(
        this._wx(sx), wy, this._wx(sy),
        0, 0.5 * cw, 0,
        c, size * (0.7 + Math.random() * 0.6), life * (0.8 + Math.random() * 0.4),
        0, 0.9, (o.pull || 34) * cw, NaN);
      if (k < 0) break;
      this._tx[k] = bx; this._ty[k] = this._gy(cx, cy) + 0.035; this._tz[k] = bz;
    }
  }

  // a flared shaft of light at a cell. This is the "read it from across the
  // board" effect and is reserved for acts done to ONE named person.
  column(cx, cy, o = {}) {
    const s = this._freeCol(); if (!s) return;
    const c = lin(o.color);
    s.on = true;
    s.x = this._wx(cx); s.z = this._wx(cy); s.yb = this._gy(cx, cy) + 0.004;
    s.h = o.h != null ? o.h : 0.30;
    s.rb = (o.rBot != null ? o.rBot : 1.1) * this._cell2w;
    s.rt = (o.rTop != null ? o.rTop : 3.0) * this._cell2w;
    s.life = s.max = o.life || 1.1;
    s.a = Math.min(A_COL, o.alpha != null ? o.alpha : A_COL);
    s.rise = o.rise != null ? o.rise : 0.22;    // seconds to full height
    s.r = c.r; s.g = c.g; s.b = c.b;
  }

  // one mote, throttled, for things that are HELD rather than fired — the
  // lifted kin's wake, a poured stream. Safe to call every single frame.
  // ⚠️ THROTTLED PER `key`, not globally. One shared timer was fine while the
  // lifted kin was the only thing that trailed, but a poured-water stream and a
  // carried kin would then halve each other's rate and both look broken. Pass
  // a key ('lift', 'pour', …) for anything that can run at the same time as
  // something else.
  trail(cx, cy, o = {}) {
    const key = o.key || 'main';
    const gap = o.gap != null ? o.gap : 0.045;
    const last = this._trailT[key];
    if (last != null && this.t - last < gap) return;
    this._trailT[key] = this.t;
    const c = lin(o.color);
    const cw = this._cell2w;
    const j = (o.jitter != null ? o.jitter : 0.5) * cw;
    this._push(
      this._wx(cx) + (Math.random() - 0.5) * j,
      (o.y != null ? o.y : this._gy(cx, cy) + 0.16) + (Math.random() - 0.5) * 0.02,
      this._wx(cy) + (Math.random() - 0.5) * j,
      (Math.random() - 0.5) * cw, (o.up != null ? o.up : 0.9) * cw, (Math.random() - 0.5) * cw,
      c, o.size || 0.024, o.life || 0.85, (o.grav || 0) * cw, 1.0, 0, NaN);
  }

  // ⚠️ WATER IS THE OTHER ENGINEER'S HOOK. sim.drop() spreads a pool of radius
  // 4.5*S, so the fast ring is sized to the pool it actually makes — a splash
  // that is wider than the wet ground is a lie about where the water went.
  splash(cx, cy, o = {}) {
    if (!this._claim('water', cx, cy)) return;
    this._spoke = this.t;                  // water is named, never guessed
    const S = this.sim.N / 64;
    const R = (o.r || 4.5 * S);
    const blue = o.color != null ? o.color : 0x63c6ff;
    this.ring(cx, cy, { color: 0xd8f2ff, r0: 0.4, r1: R * 1.15, width: 0.9, life: 0.42, alpha: 0.5 });
    this.ring(cx, cy, { color: blue, r0: 0.4, r1: R * 1.9, width: R * 0.45, life: 0.95, alpha: 0.24 });
    this.ring(cx, cy, { color: blue, r0: 0, r1: R * 0.9, width: R * 0.6, life: 0.8, alpha: 0.20, fill: true });
    this.burst(cx, cy, { color: 0xbfe8ff, n: 26, speed: R * 1.5, up: 7, life: 0.75, size: 0.03, grav: -13 });
    this.burst(cx, cy, { color: blue, n: 14, speed: R * 0.7, up: 3.2, life: 1.1, size: 0.05, grav: -6 });
    this.column(cx, cy, { color: 0x9fdcff, life: 0.5, h: 0.10, rBot: 0.6, rTop: R * 0.7, alpha: 0.22, rise: 0.08 });
  }

  // ————————————————————————————————————————————————————————————
  //  the twelve verbs
  // ————————————————————————————————————————————————————————————
  //
  // ⚠️ EVERY COLOUR HERE MATCHES SOMETHING ALREADY ON SCREEN. The reach ring
  // already tells you what is about to happen — green mends, red strikes,
  // grey-amber stills, amber lifts (view.js render(), the reachPower branch) —
  // so the effect that LANDS has to arrive in the same colour or the player is
  // being taught two vocabularies for one act. Crumb tan is the gift mesh's own
  // 0xd8bd86; breath is the fog dome's 0xc6d8e8.
  fire(name, cx, cy, o) {
    if (cx == null || !isFinite(cx) || !isFinite(cy)) return;
    if (!this._claim(name, cx, cy)) return;
    // ⚠️ a caller who NAMES a ground verb switches view.js's flinch detector
    // off for a beat. The claim guard alone is not enough: it only stops the
    // same kind twice, and the danger is the detector guessing a DIFFERENT
    // kind and drawing it beside the right one.
    if (GROUND_VERB[name]) this._spoke = this.t;
    const S = this.sim.N / 64;
    switch (name) {

      // — kindness that lands on ONE person. Gold, rising, unhurried.
      case 'mend':
        this.column(cx, cy, { color: 0xfff0c8, life: 1.5, h: 0.34, rBot: 0.8, rTop: 3.4, alpha: 0.40, rise: 0.30 });
        this.ring(cx, cy, { color: 0x9dffb4, r0: 0.4, r1: 7 * S, width: 1.0, life: 1.1, alpha: 0.42 });
        this.ring(cx, cy, { color: 0xffe6a8, r0: 0, r1: 3.2 * S, width: 2.0, life: 1.4, alpha: 0.26, fill: true });
        // slow and UP: everything else in this file is thrown, this one lifts
        this.burst(cx, cy, { color: 0xffe6a8, n: 22, speed: 2.2, up: 5.5, life: 1.5, size: 0.028, grav: -0.7, drag: 0.5, floor: false });
        break;

      // — the hard one. Fast, low, and over before you can be sorry.
      case 'strike':
        this.column(cx, cy, { color: 0xffd9cf, life: 0.34, h: 0.40, rBot: 0.5, rTop: 1.6, alpha: 0.42, rise: 0.05 });
        this.ring(cx, cy, { color: 0xff2f22, r0: 0.3, r1: 8 * S, width: 0.8, life: 0.5, alpha: 0.50 });
        this.burst(cx, cy, { color: 0xff2f22, n: 30, speed: 15, up: 2.0, life: 0.55, size: 0.034, grav: -16, drag: 3.0 });
        this.burst(cx, cy, { color: 0x8c1108, n: 16, speed: 8, up: 1.0, life: 0.9, size: 0.046, grav: -11, drag: 3.4 });
        break;

      // — glue. It arrives, it clamps, it does not fade like the others: the
      //   ring CONTRACTS onto them and the shaft goes rigid and stays a beat.
      case 'still':
        this.column(cx, cy, { color: 0xd8b27a, life: 1.9, h: 0.22, rBot: 0.45, rTop: 0.9, alpha: 0.34, rise: 0.10 });
        this.ring(cx, cy, { color: 0xd8b27a, r0: 6 * S, r1: 1.1 * S, width: 0.9, life: 0.7, alpha: 0.48, ease: 'in' });
        this.burst(cx, cy, { color: 0xbfae90, n: 12, speed: 2.4, up: 1.2, life: 0.7, size: 0.022, grav: -9, drag: 4.0 });
        break;

      // — COME HERE. Cool white-blue, and it moves INWARD. sim.call's radius is
      //   26*S, so the motes are born on that exact rim: the effect draws the
      //   power's real footprint, it does not decorate it.
      case 'call':
        // ⚠️ WHITE-CYAN, NOT CYAN, and fat. At 0x8fdcff/0.032 the arriving
        // motes photographed as almost nothing over lit flock — the ring was
        // doing all the work and the INWARD read (which is the whole point of
        // call) was carried by one ring alone.
        this.converge(cx, cy, { color: 0xe6faff, n: 34, r: 26 * S, life: 1.05, size: 0.058, pull: 26 });
        this.ring(cx, cy, { color: 0x8fdcff, r0: 26 * S, r1: 1.5 * S, width: 0.9, life: 0.95, alpha: 0.38, ease: 'in' });
        this.ring(cx, cy, { color: 0xd8f4ff, r0: 12 * S, r1: 0.8 * S, width: 0.7, life: 0.6, alpha: 0.42, ease: 'in' });
        this.column(cx, cy, { color: 0xbfe8ff, life: 1.4, h: 0.26, rBot: 0.9, rTop: 2.6, alpha: 0.30, rise: 0.55 });
        break;

      // — GET AWAY. The exact inverse: violet, outward, and FAST. Two rings at
      //   different speeds is what makes it read as a shock rather than a fade.
      case 'dread': {
        const R = 20 * S;             // sim.terror's own radius
        // ⚠️ TUNED DOWN AFTER LOOKING AT IT. The first pass was a 1.3-cell
        // magenta band at 0.52 with a 2.6-cell crimson wash behind it, and the
        // photograph showed the entire town buried under two glowing snakes.
        // A shockwave is an EDGE, not a fill — the width is where it went wrong.
        this.ring(cx, cy, { color: 0xc257ff, r0: 0.5, r1: R, width: 0.8, life: 0.45, alpha: 0.44 });
        this.ring(cx, cy, { color: 0xff4d7a, r0: 0.5, r1: R * 1.25, width: 1.5, life: 0.95, alpha: 0.15 });
        this.column(cx, cy, { color: 0xc257ff, life: 0.55, h: 0.26, rBot: 1.6, rTop: 0.4, alpha: 0.30, rise: 0.06 });
        this.burst(cx, cy, { color: 0xc257ff, n: 30, speed: R * 1.1, up: 2.4, life: 0.7, size: 0.028, grav: -8, drag: 2.2 });
        break;
      }

      // — something fell out of the sky. Tan, and it PUFFS: the dust is the
      //   evidence that the crumb had somewhere to land.
      case 'crumb':
        this.ring(cx, cy, { color: 0xd8bd86, r0: 0.3, r1: 4.5 * S, width: 0.8, life: 0.55, alpha: 0.40 });
        this.burst(cx, cy, { color: 0xd8bd86, n: 18, speed: 5.5, up: 3.0, life: 0.8, size: 0.032, grav: -9, drag: 2.6 });
        this.burst(cx, cy, { color: 0xfff0d0, n: 6, speed: 2.0, up: 4.5, life: 0.5, size: 0.02, grav: -6, drag: 2.0 });
        break;

      case 'water': case 'splash':
        this._unclaim(name, cx, cy);        // splash() does its own claiming
        this.splash(cx, cy, o);
        break;

      // — up. The shaft rises from where they were standing, so the board keeps
      //   a mark on the place even while they are in your hand.
      case 'lift':
        this.column(cx, cy, { color: 0xffb861, life: 1.6, h: 0.46, rBot: 0.7, rTop: 2.4, alpha: 0.36, rise: 0.30 });
        this.ring(cx, cy, { color: 0xffb861, r0: 4 * S, r1: 0.8 * S, width: 0.9, life: 0.6, alpha: 0.44, ease: 'in' });
        this.burst(cx, cy, { color: 0xffd9a8, n: 14, speed: 1.6, up: 7, life: 1.2, size: 0.026, grav: -1.2, drag: 0.8, floor: false });
        break;

      // — and back down, unharmed. The only one of the reach verbs that is
      //   allowed to look gentle.
      case 'setdown':
        this.ring(cx, cy, { color: 0xdff6d8, r0: 0.3, r1: 4.5 * S, width: 1.0, life: 0.6, alpha: 0.36 });
        this.burst(cx, cy, { color: 0xdff6d8, n: 12, speed: 4.0, up: 1.6, life: 0.6, size: 0.024, grav: -10, drag: 3.0 });
        break;

      // — taken off the board. No body, no stone, and no burst either: the
      //   shaft goes UP and leaves nothing behind, which is the whole point.
      case 'taken':
        this.column(cx, cy, { color: 0xff8a5c, life: 1.7, h: 0.62, rBot: 0.5, rTop: 1.4, alpha: 0.40, rise: 0.16 });
        this.ring(cx, cy, { color: 0x8c1108, r0: 0.4, r1: 6 * S, width: 1.4, life: 1.2, alpha: 0.34 });
        break;

      // — the whole world knocked, once (main.startle). No colour of its own:
      //   this is the board itself, not a power.
      case 'knock':
        this.ring(cx, cy, { color: 0xe8e0d0, r0: 0.5, r1: 34 * S, width: 2.2, life: 0.8, alpha: 0.30 });
        this.ring(cx, cy, { color: 0xe8e0d0, r0: 0.5, r1: 18 * S, width: 1.0, life: 0.45, alpha: 0.36 });
        break;

      // — a finger touching down. Deliberately small: the CONTINUOUS emitters
      //   below are what say rest-vs-press, and this is only the contact.
      case 'contact':
        this.ring(cx, cy, { color: 0xffc98a, r0: 0.4, r1: 6 * S, width: 0.7, life: 0.35, alpha: 0.28 });
        break;

      case 'rest':
        this.ring(cx, cy, { color: 0xffca8a, r0: 0.5, r1: 9 * S, width: 2.2, life: 1.2, alpha: 0.22 });
        break;

      case 'press':
        this.ring(cx, cy, { color: 0xff9a3c, r0: 0.3, r1: 5 * S, width: 0.6, life: 0.4, alpha: 0.44 });
        this.burst(cx, cy, { color: 0xffb054, n: 10, speed: 7, up: 2.4, life: 0.4, size: 0.02, grav: -14, drag: 3.4 });
        break;

      default: break;
    }
  }

  // ————————————————————————————————————————————————————————————
  //  continuous emitters — state, not events
  // ————————————————————————————————————————————————————————————

  // Fed straight from view.setHandDisc, so the motes can never disagree with
  // the ring about where the hand is or how hot it is.
  // e is 0 (a hot hard point) … 1 (a still hand, warming).
  setHand(cx, cy, r, e) {
    if (cx == null) { this._hand = null; return; }
    this._hand = { cx, cy, r: r || 8, e: e == null ? 0 : e };
  }

  _emitHand(dt) {
    const h = this._hand; if (!h) return;
    const e = h.e;
    // ⚠️ THE HAND NEEDED A RING OF ITS OWN, and the photograph is why. Motes
    // alone vanished on a bright green board at bird's eye — a 6px orange dot
    // against lit flock is nothing. A pulse of heat going INTO the ground is
    // the actual event, so it is drawn as one: tight and quick when the hand is
    // hard, wide and slow when it is resting. Sized off the hand's own r, so it
    // can no more disagree with the contact disc than the motes can.
    // ⚠️ this is NOT the contact disc rebuilt. That ring sits at a fixed radius
    // and breathes; this one leaves and spreads. Two different sentences.
    this._pulseT -= dt;
    if (this._pulseT <= 0) {
      // ⚠️ THE KIND PULSE IS A WHISPER, and the first try proved why. At width
      // r*0.28 and alpha 0.18, with the interval (1.35s) SHORTER than the life
      // (1.4s) so two were always stacked, the resting hand drew a fat amber
      // donut that bleached everything inside it — the veil again, wearing a
      // gentler colour. Thin band, half the alpha, and the interval is now
      // longer than the life so there is only ever ONE.
      this._pulseT = e > 0.5 ? 1.6 : 0.5;
      if (e > 0.5) this.ring(h.cx, h.cy, { color: 0xffca8a, r0: h.r * 0.3, r1: h.r * 1.2, width: h.r * 0.13, life: 1.2, alpha: 0.11 });
      else this.ring(h.cx, h.cy, { color: 0xff8a2c, r0: 0.4, r1: h.r * 0.85, width: h.r * 0.10, life: 0.5, alpha: 0.30 });
    }
    this._handT -= dt;
    if (this._handT > 0) return;
    // ⚠️ THE HOT HAND IS FASTER THAN THE KIND ONE. Rate is the tell: pressing
    // spits every 60ms, resting breathes every 200ms. A player who never read
    // the help card still learns "fast and orange is the cruel one".
    this._handT = 0.06 + e * 0.14;
    const cw = this._cell2w;
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * h.r * (0.25 + e * 0.6);
    const px = h.cx + Math.cos(a) * rr, py = h.cy + Math.sin(a) * rr;
    if (e > 0.5) {
      // warmth: slow gold, drifting up out of the ground it is soaking into
      this._push(this._wx(px), this._gy(px, py) + 0.006, this._wx(py),
        (Math.random() - 0.5) * cw * 0.6, (0.7 + Math.random() * 1.1) * cw, (Math.random() - 0.5) * cw * 0.6,
        lin(0xffca8a), 0.034 + Math.random() * 0.018, 1.0 + Math.random() * 0.6,
        -0.25 * cw, 0.7, 0, NaN);
    } else {
      // a coal: sharp, orange, thrown sideways, dead in a third of a second.
      // ⚠️ sized UP from 0.016 after the day-board photograph — at that size a
      // spark is ~5 screen pixels over lit grass and is simply not there.
      const b = Math.random() * Math.PI * 2;
      this._push(this._wx(px), this._gy(px, py) + 0.006, this._wx(py),
        Math.cos(b) * (3 + Math.random() * 5) * cw, (1.6 + Math.random() * 3) * cw, Math.sin(b) * (3 + Math.random() * 5) * cw,
        lin(Math.random() < 0.45 ? 0xfff0c8 : 0xff8a2c), 0.026 + Math.random() * 0.018, 0.28 + Math.random() * 0.24,
        -16 * cw, 3.2, 0, NaN);
    }
  }

  // BREATH. sim.breathe only moves a scalar (`fog`), so the board had a weather
  // event with no weather in it. Cold motes settling out of the air while the
  // number is CLIMBING — not while it is high, or the effect would never stop.
  _emitBreath(dt) {
    const s = this.sim;
    const rising = s.fog > this._fogPrev + 0.0004;
    this._fogPrev = s.fog;
    if (!rising) return;
    this._breathT -= dt;
    if (this._breathT > 0) return;
    this._breathT = 0.035;
    const N = s.N, cw = this._cell2w;
    const cx = Math.random() * (N - 1), cy = Math.random() * (N - 1);
    this._push(this._wx(cx), this._gy(cx, cy) + 0.10 + Math.random() * 0.16, this._wx(cy),
      (Math.random() - 0.5) * cw * 1.2, -0.5 * cw, (Math.random() - 0.5) * cw * 1.2,
      lin(0xc6d8e8), 0.05 + Math.random() * 0.05, 1.3 + Math.random() * 0.9,
      0, 0.6, 0, this._gy(cx, cy) + 0.01);
  }

  // TILT. The board leans and nothing on it acknowledged that. Loose grit
  // skitters downhill — reading the same s.tilt the jar rotation reads, so the
  // motes always run the way the plywood is actually falling.
  _emitTilt(dt) {
    const s = this.sim;
    const m = Math.hypot(s.tilt.x, s.tilt.y);
    if (m < 0.035) return;
    this._tiltT -= dt;
    if (this._tiltT > 0) return;
    this._tiltT = 0.055;
    const N = s.N, cw = this._cell2w;
    // stay inside the walkable disc so grit never spawns out on the fascia
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 0.42;
    const cx = (0.5 + Math.cos(a) * rr) * (N - 1), cy = (0.5 + Math.sin(a) * rr) * (N - 1);
    const sp = m * 26 * cw;
    this._push(this._wx(cx), this._gy(cx, cy) + 0.008, this._wx(cy),
      s.tilt.x * sp / m, 0.4 * cw, s.tilt.y * sp / m,
      lin(0xbfae90), 0.014 + Math.random() * 0.01, 0.5 + Math.random() * 0.4,
      -3 * cw, 2.2, 0, this._gy(cx, cy) + 0.004);
  }

  // ————————————————————————————————————————————————————————————
  //  the one update
  // ————————————————————————————————————————————————————————————

  update(dt) {
    dt = Math.min(DT_MAX, Math.max(0, dt || 0));
    this.t += dt;
    // claims are only there to stop a double-fire in the same handful of
    // frames; anything older is a real second act.
    for (let i = this._claims.length - 1; i >= 0; i--)
      if (this.t - this._claims[i].t > 0.25) this._claims.splice(i, 1);

    this._emitHand(dt);
    this._emitBreath(dt);
    this._emitTilt(dt);
    this._stepMotes(dt);
    this._stepRings(dt);
    this._stepCols(dt);
  }

  // — motes
  _push(x, y, z, vx, vy, vz, c, size, life, grav, drag, pull, floorY) {
    if (this.pn >= P_MAX) return -1;
    const i = this.pn++;
    this._x[i] = x; this._y[i] = y; this._z[i] = z;
    this._vx[i] = vx; this._vy[i] = vy; this._vz[i] = vz;
    this._cr[i] = c.r; this._cg[i] = c.g; this._cb[i] = c.b;
    this._li[i] = this._lm[i] = life;
    this._sz[i] = size; this._gv[i] = grav; this._dg[i] = drag; this._pl[i] = pull;
    this._fl[i] = floorY == null ? NaN : floorY;
    this._tx[i] = 0; this._ty[i] = 0; this._tz[i] = 0;
    return i;
  }

  // ⚠️ the field list is a MODULE constant, not a literal in here. This runs
  // once per dying mote — up to a few hundred a second — and rebuilding a
  // 19-element array of strings that often is a garbage generator in the middle
  // of the render loop, which is the one place a hitch is visible.
  _kill(i) {
    const n = --this.pn;
    if (i === n) return;
    for (let a = 0; a < P_FIELDS.length; a++) this[P_FIELDS[a]][i] = this[P_FIELDS[a]][n];
  }

  _stepMotes(dt) {
    const pos = this._pPos, col = this._pCol, siz = this._pSiz;
    for (let i = 0; i < this.pn; i++) {
      this._li[i] -= dt;
      if (this._li[i] <= 0) { this._kill(i); i--; continue; }
      const pull = this._pl[i];
      if (pull > 0) {
        // homing: accelerate at the target and DIE on arrival, so a converge
        // does not turn into a swarm orbiting the spot it was supposed to reach
        const dx = this._tx[i] - this._x[i], dy = this._ty[i] - this._y[i], dz = this._tz[i] - this._z[i];
        const d = Math.hypot(dx, dy, dz);
        if (d < 0.012) { this._kill(i); i--; continue; }
        const k = pull * dt / d;
        this._vx[i] += dx * k; this._vy[i] += dy * k; this._vz[i] += dz * k;
      } else {
        this._vy[i] += this._gv[i] * dt;
      }
      // exponential drag — frame-rate independent, unlike (1 - drag*dt)
      const dm = Math.exp(-this._dg[i] * dt);
      this._vx[i] *= dm; this._vy[i] *= dm; this._vz[i] *= dm;
      this._x[i] += this._vx[i] * dt; this._y[i] += this._vy[i] * dt; this._z[i] += this._vz[i] * dt;
      const fy = this._fl[i];
      // ⚠️ motes that settle must STOP, not sink. Debris falling through the
      // scenery is the single cheapest way to make a board look like it has no
      // floor, and the first pass of the crumb puff did exactly that.
      if (fy === fy && this._y[i] < fy) { this._y[i] = fy; this._vy[i] = 0; this._vx[i] *= 0.5; this._vz[i] *= 0.5; }

      const f = this._li[i] / this._lm[i];
      // in fast, out slow: a mote that pops in at full brightness reads as a
      // dropped frame. The first 12% of its life is the fade-up.
      const a = Math.min(A_MOTE, (f > 0.88 ? (1 - f) / 0.12 : f * f * 1.12));
      const o = i * 3;
      pos[o] = this._x[i]; pos[o + 1] = this._y[i]; pos[o + 2] = this._z[i];
      col[o] = this._cr[i] * a; col[o + 1] = this._cg[i] * a; col[o + 2] = this._cb[i] * a;
      siz[i] = this._sz[i];
    }
    const g = this.motes.geometry;
    g.setDrawRange(0, this.pn);
    this.motes.visible = this.pn > 0;
    if (this.pn > 0) {
      g.attributes.position.needsUpdate = true;
      g.attributes.pcolor.needsUpdate = true;
      g.attributes.psize.needsUpdate = true;
      // gl_PointSize is in DEVICE pixels, so the scale has to come from the
      // drawing buffer, not the CSS size — otherwise every mote halves when the
      // offscreen capture resizes the canvas.
      // ⚠️ FLOORED, AND THE FLOOR IS LOAD-BEARING. The Browser pane never
      // composites this page, so its canvas measures 0x0 and the drawing buffer
      // height comes back ZERO — which is gl_PointSize 0, which is every mote
      // in the game silently not drawn, on the exact surface the work is
      // verified on. Measured: uScale 0. 240 is a ~480px window's worth.
      const bh = this.view.renderer.getDrawingBufferSize(this._v2).y;
      this.moteMat.uniforms.uScale.value = Math.max(240, bh * 0.5);
    }
  }

  // — rings
  _freeRing() { for (const s of this.rings) if (!s.on) return s; return null; }

  _stepRings(dt) {
    const pos = this._rPos, col = this._rCol;
    let live = 0;
    for (let i = 0; i < RING_MAX; i++) {
      const s = this.rings[i];
      const base = i * 3 * RING_SEG;
      if (!s.on) {
        // black is invisible under additive blending, so a dead slot costs its
        // triangles and nothing else. Only the colours need clearing.
        if (s.dirty) { for (let v = 0; v < 3 * RING_SEG; v++) { const o = (base + v) * 3; col[o] = col[o + 1] = col[o + 2] = 0; } s.dirty = false; }
        continue;
      }
      live++;
      s.life -= dt;
      if (s.life <= 0) { s.on = false; s.dirty = true; continue; }
      const p = 1 - s.life / s.max;
      // 'out' opens fast and fades; 'in' closes and PEAKS as it lands, which is
      // what makes call and still read as arrival rather than departure
      const k = s.ease === 'in' ? p * p : 1 - (1 - p) * (1 - p);
      const r = s.r0 + (s.r1 - s.r0) * k;
      // ⚠️⚠️ A BIG RING MUST BE A DIM RING, and this was learned by looking.
      // The first dread drew a 30-cell magenta band at alpha 0.52 with a wider
      // crimson wash behind it and the TOWN UNDER IT WENT UNREADABLE — the
      // vapour-dome mistake all over again, just circular. The fix is not a
      // hand-tuned number per preset: alpha falls off with radius for every
      // ring, because the same light spread round a bigger circumference IS
      // dimmer. 9 cells is roughly the hand's own footprint, so anything at
      // finger scale keeps its full strength and only the board-wide powers
      // are pulled down (39 cells -> 0.48x, 30 -> 0.55x).
      const spread = Math.min(1, Math.sqrt(9 / Math.max(9, r)));
      const a = s.a * spread * (s.ease === 'in' ? Math.sin(Math.PI * p) : (1 - p) * (1 - p));
      const rows = s.fill
        ? [[0, 1], [r * 0.55, 0.55], [r + s.w, 0]]
        : [[Math.max(0, r - s.w), 0], [r, 1], [r + s.w, 0]];
      for (let ro = 0; ro < 3; ro++) {
        const [rad, ra] = rows[ro];
        const cr = s.r * a * ra, cg = s.g * a * ra, cb = s.b * a * ra;
        for (let j = 0; j < RING_SEG; j++) {
          const ang = (j / RING_SEG) * Math.PI * 2;
          const gx = s.cx + Math.cos(ang) * rad, gy = s.cy + Math.sin(ang) * rad;
          const o = (base + ro * RING_SEG + j) * 3;
          pos[o] = this._wx(gx);
          // ⚠️ SAMPLE THE TERRAIN PER VERTEX. A level ring over a hill either
          // buries itself in the slope or floats off it — the trap the contact
          // disc and the track loop both hit. 0.006 is the same order as the
          // disc's 0.004 and is what keeps it off the flock without hovering.
          pos[o + 1] = this._gy(gx, gy) + 0.006 + s.y;
          pos[o + 2] = this._wx(gy);
          col[o] = cr; col[o + 1] = cg; col[o + 2] = cb;
        }
      }
    }
    this.ringMesh.visible = live > 0;
    if (live > 0 || this._ringWas) {
      this.ringMesh.geometry.attributes.position.needsUpdate = true;
      this.ringMesh.geometry.attributes.color.needsUpdate = true;
    }
    this._ringWas = live > 0;
  }

  // — columns
  _freeCol() { for (const s of this.cols) if (!s.on) return s; return null; }

  _stepCols(dt) {
    const pos = this._cPos, col = this._cCol;
    let live = 0;
    for (let i = 0; i < COL_MAX; i++) {
      const s = this.cols[i];
      const base = i * 3 * COL_SEG;
      if (!s.on) {
        if (s.dirty) { for (let v = 0; v < 3 * COL_SEG; v++) { const o = (base + v) * 3; col[o] = col[o + 1] = col[o + 2] = 0; } s.dirty = false; }
        continue;
      }
      live++;
      s.life -= dt;
      if (s.life <= 0) { s.on = false; s.dirty = true; continue; }
      const age = s.max - s.life;
      const grow = Math.min(1, age / Math.max(0.001, s.rise));
      const g2 = 1 - (1 - grow) * (1 - grow);
      const p = 1 - s.life / s.max;
      const a = s.a * g2 * (1 - p) * (1 - p);
      for (let ro = 0; ro < 3; ro++) {
        const f = ro / 2;
        const rad = s.rb + (s.rt - s.rb) * f;
        const y = s.yb + s.h * g2 * f;
        // bright at the boots, gone at the top — an actual shaft of light,
        // rather than a tube with a hard cap on it.
        // ⚠️ 0.38 and not 0.52: at the higher value the cone read as a SOLID
        // wedge of card standing on the board and hid the toys behind it.
        // Nearly all of a light shaft's brightness belongs in its first third.
        const ra = ro === 0 ? 1 : ro === 1 ? 0.38 : 0;
        const cr = s.r * a * ra, cg = s.g * a * ra, cb = s.b * a * ra;
        for (let j = 0; j < COL_SEG; j++) {
          const ang = (j / COL_SEG) * Math.PI * 2;
          const o = (base + ro * COL_SEG + j) * 3;
          pos[o] = s.x + Math.cos(ang) * rad;
          pos[o + 1] = y;
          pos[o + 2] = s.z + Math.sin(ang) * rad;
          col[o] = cr; col[o + 1] = cg; col[o + 2] = cb;
        }
      }
    }
    this.colMesh.visible = live > 0;
    if (live > 0 || this._colWas) {
      this.colMesh.geometry.attributes.position.needsUpdate = true;
      this.colMesh.geometry.attributes.color.needsUpdate = true;
    }
    this._colWas = live > 0;
  }

  // — the double-fire guard. view.js DETECTS several verbs from sim state it
  // was already reading (the gift list grew; the reach closed; the held kin was
  // let go) and main.js is also free to call fire() outright. Both are correct
  // and both must be safe, so the second one inside a quarter second at the
  // same spot is dropped.
  _claim(name, cx, cy) {
    for (const c of this._claims)
      if (c.n === name && Math.abs(c.x - cx) < 1.2 && Math.abs(c.y - cy) < 1.2) return false;
    this._claims.push({ n: name, x: cx, y: cy, t: this.t });
    return true;
  }
  // did somebody NAME a ground verb in the last beat? view.js's flinch
  // detector asks before it guesses.
  spokeRecently() { return this._spoke != null && (this.t - this._spoke) < 0.25; }

  _unclaim(name, cx, cy) {
    for (let i = this._claims.length - 1; i >= 0; i--) {
      const c = this._claims[i];
      if (c.n === name && Math.abs(c.x - cx) < 1.2 && Math.abs(c.y - cy) < 1.2) this._claims.splice(i, 1);
    }
  }

  // for tests: what is actually alive right now
  census() {
    let r = 0, c = 0;
    for (const s of this.rings) if (s.on) r++;
    for (const s of this.cols) if (s.on) c++;
    return { motes: this.pn, rings: r, columns: c };
  }
}
