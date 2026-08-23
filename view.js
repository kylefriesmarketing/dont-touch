// DON'T TOUCH — view.js
// Rendering only. Reads the sim, never writes it. (Invariant 2)
// Art direction: a lamplit miniature layout seen from above. The scenery fills
// the board edge to edge and the real world is never in frame — the tabletop
// framing belongs to THE ROOM hub. Shape plus lantern glow. (bible §15, pivoted)

import * as THREE from './lib/three.module.js';
import { STAGE, NEEDS, LANTERN_HUE, LOCI, L, expressed, S, C } from './sim.js';
import { Post } from './post.js';
import { hueOf } from './palette.js';

const R = 1.0;
const GR = R * 0.94;    // half-width of the scenery — the heightfield is square
const YS = 0.38;        // vertical scale of the heightfield
const BASE = -0.155;    // the underside of the board. Everything measures from here.
const EDGE_Y = 0.035;   // the lip where the fascia meets the terrain
// THE WORLD IS THE TABLE. The board is the scenery plus a fascia lip — there is
// no bare plywood to look at, because you are never outside the layout. The
// basement, the sawhorses and the bulb belong to THE ROOM hub, not to the game.
const BOARD = GR * 1.035;
const EL_MIN = 0.92, EL_MAX = 1.52;   // 53deg .. 87deg — bird's eye only
// ⚠️ SEVERAL BAGS OF FLOCK, NOT ONE GREEN. On a real table the scenic grass is
// laid down in patches from different tubs — bright spring, deep summer, a dry
// olive, a burnt sandy scrub — and those patch boundaries are most of what
// makes it read as something somebody MADE. Each row is [r,g,b, +r,+g,+b] where
// the second triple is how much richer it gets at full moss.
const FLOCKS = [
  [ 54,  98,  40,  20,  44,  16],   // deep summer
  [ 72, 124,  44,  26,  52,  18],   // spring, the bright one
  [ 88, 112,  52,  22,  38,  20],   // dry olive
  [104,  98,  58,  18,  30,  18],   // scrub, nearly sand
  [ 44,  86,  46,  16,  46,  22],   // shaded, blue-green
];
const RT = GR * 0.93;   // the track loop, outside the walkable circle (0.855·GR·2/1.88)

export class View {
  constructor(canvas, sim) {
    this.sim = sim;
    this.canvas = canvas;
    this.t = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor(0x0a0c10, 1);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    // ⚠️ THERE WAS NO TONE MAPPING AT ALL — renderer.toneMapping was the
    // default NoToneMapping, so additive glows clipped straight to white and
    // the whole frame sat in linear flatness. Neutral (Khronos PBR) over ACES
    // on purpose: ACES desaturates painted-toy brights (measured on the Age of
    // Toys Godot port — same material world), Neutral rolls highlights while
    // keeping the flock and the figure paint at their actual colours.
    // ⚠️ With the post chain ON this line does nothing by itself — three only
    // tone-maps when drawing to the CANVAS, and the scene renders into an RT.
    // The composite shader in post.js carries the matching include; change one
    // and you must change the other or the two paths stop agreeing.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    // ⚠️ NOTHING CAST A SHADOW, which is the single loudest "this is a toy
    // render" tell — every tree, house and figure was pasted onto the ground
    // rather than standing on it. The board is small and the light is one lamp,
    // so a single tight shadow camera covers the whole world at high density.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
    // BIRD'S EYE. You look down into the layout, never across it — the elevation
    // floor is what keeps the horizon (and therefore the real world) off screen.
    this.orbit = { az: 0.35, el: 1.16, dist: 2.35, tAz: 0.35, tEl: 1.16, tDist: 2.35 };
    // 'jar' by history: this group is THE BOARD — everything that lifts
    // together when you tilt one edge of the plywood off the sawhorses.
    this.jar = new THREE.Group();
    this.scene.add(this.jar);

    this._room();
    this._lights();
    this._ground();
    this._groundCover();
    this._works();
    this._track();
    this._scenery();
    this._water();
    this._kin();
    this._graves();
    this._cover();
    this._dust();
    this._handDisc();
    this._giftView();

    // the miniature look. Falls back to a plain render where WebGL2 is not
    // available, so nothing depends on it existing.
    this.post = new Post(this.renderer);
    // view-only title dressing. NEVER mirror these into sim state.
    this.titleDim = 0;          // 0 = the room as it is, 1 = dark at the bottom of the stairs
    this.titleTo = 0;           // eased toward; the light comes on, it does not snap
    this.reachId = -1; this.reachF = 0;   // who your hand is closing on, and how far
    this.center = new THREE.Vector3();    // what the camera is actually looking at
    this.centerTo = new THREE.Vector3();
    this.heldCell = null;                 // where a lifted kin is being carried
    this._foc = new THREE.Vector3();
    this.focusY = 0.47;

    this.raycaster = new THREE.Raycaster();
    this.resize();
  }

  // -- what is beyond the layout ---------------------------------------------
  // ⚠️ THE REAL WORLD IS GONE ON PURPOSE. The basement, the plywood, the
  // sawhorses, the window well and the bulb on its cord were all built and all
  // removed: the game is played from inside the layout, bird's eye, and the
  // tabletop framing belongs to THE ROOM hub where this is a doorway object.
  // What remains is the dark the board sits in, so a shallow camera angle finds
  // shadow rather than a void edge. `daylight` still drives the light — it is
  // just no longer attached to a window you can see.
  _room() {
    const dark = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({ color: 0x07080b })
    );
    dark.rotation.x = -Math.PI / 2;
    dark.position.y = BASE - 0.02;
    this.scene.add(dark);
    this.floorMat = dark.material;
  }

  // -- light -----------------------------------------------------------------
  // ⚠️ EVERYTHING USED TO BE MeshBasicMaterial, which ignores lights entirely —
  // that is the single reason the layout read as flat coloured cardboard no
  // matter how good the heightfield underneath it was. Hills cannot exist
  // without shading. The lamp above the board is the key; the fill is cold so
  // the shadow sides go blue rather than black.
  _lights() {
    this.hemi = new THREE.HemisphereLight(0xd8e6f2, 0x4a4432, 0.62);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffeccb, 1.05);
    this.key.position.set(1.15, 2.30, 0.75);
    this.key.castShadow = true;
    // the whole world is ~2 units across, so 2048 over 2.6 is ~790px per unit —
    // dense enough that a 3cm figure gets a real footprint instead of one texel
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -1.35; sc.right = 1.35; sc.top = 1.35; sc.bottom = -1.35;
    sc.near = 0.4; sc.far = 6.5;
    sc.updateProjectionMatrix();
    // ⚠️ normalBias, not bias. A constant bias either peels small objects off
    // the ground or leaves acne on the hillsides; normalBias scales with the
    // surface angle and does both jobs at this scale.
    this.key.shadow.normalBias = 0.008;
    this.key.shadow.bias = -0.0004;
    this.scene.add(this.key);
    this.scene.add(this.key.target);
    // a low cold counter-light so the far slopes read instead of going solid
    // THE BULB. At night the room used to go uniformly dim — physically wrong
    // (the fiction is one hanging bulb over the table) and visually dead flat.
    // A warm spot from above centre gives night a pool of light with real
    // falloff, and it swings faintly because a basement bulb on a cord does.
    // No shadow casting — the key light already owns the one shadow map.
    this.bulb = new THREE.SpotLight(0xffd9a0, 0.0, 7.5, 0.62, 0.55, 1.1);
    this.bulb.position.set(0, 3.1, 0);
    this.bulb.target.position.set(0, 0, 0);
    this.scene.add(this.bulb);
    this.scene.add(this.bulb.target);

    this.fill = new THREE.DirectionalLight(0xc8dcf5, 0.30);
    this.fill.position.set(-1.4, 0.75, -1.1);
    this.scene.add(this.fill);
  }

  _paintSky() {
    const s = this.sim;
    // `daylight` still drives the whole picture — there is simply no window to
    // see it through any more. The dark the board sits in dims with it, so the
    // layout never floats on flat black at a shallow angle.
    const d = s.daylight;
    const amb = 0.05 + d * 0.20;
    this.floorMat.color.setRGB(amb * 0.36, amb * 0.36, amb * 0.44);
    const fl = 0.30 + d * 0.70;
    this.fasciaMat.color.setRGB(0.10 * fl, 0.14 * fl, 0.11 * fl);
    // the room's light rises and falls with the day
    // ⚠️ FLOORS RAISED. Measured on a real start with the bulb on and the
    // curtain at 0.75, daylight is only 0.22 — which put the key light at 0.41
    // and the whole layout read as a dark green smudge. The floors are what a
    // basement bulb does; `d` is still what decides day from night.
    this.hemi.intensity = 0.40 + d * 0.62;
    this.key.intensity = 0.62 + d * 1.05;
    this.fill.intensity = 0.22 + d * 0.34;
    this.key.color.setRGB(1, 0.92 - d * 0.02, 0.78 + d * 0.04);
    // the title screen: the room before anybody came downstairs. View-only, and
    // applied last so it scales whatever the day had already decided.
    // the bulb takes over as the day goes: zero at noon, the main light at
    // night — but only when the lamp is actually on. Its faint swing is the
    // same cord the shadows already answer to.
    const nightF = 1 - d;
    this.bulb.intensity = s.lampOn ? nightF * nightF * 3.4 : 0;
    this.bulb.position.x = Math.sin(this.t * 0.43) * 0.10;
    this.bulb.position.z = Math.cos(this.t * 0.31) * 0.08;
    if (this.titleDim > 0.001) {
      const q = 1 - this.titleDim * 0.86;
      this.hemi.intensity *= q; this.key.intensity *= q; this.fill.intensity *= q;
      this.bulb.intensity *= q;
    }
    // the lamp swings a little across the day so shadows are not painted on
    const ang = 0.55 + s.dayFrac * 1.9;
    this.key.position.set(Math.cos(ang) * 1.7, 1.6 + Math.sin(s.dayFrac * 3.14) * 1.1, Math.sin(ang) * 1.2);
  }

  // The surface the scenery actually presents: the heightfield eased down to
  // the fascia over the last few cells. The mesh, the track and the props all
  // have to agree on this or the layout comes apart at the edge.
  _surfaceY(cx, cy) {
    const N = this.sim.N;
    const dx = cx / (N - 1) - 0.5, dy = cy / (N - 1) - 0.5;
    // ⚠️ CHEBYSHEV, not radial. A round falloff is what made this a green cake
    // in a tin; the board is square and the scenery is built out to its edges.
    // 0.47 is chosen so the walkable circle (0.455) is never eased.
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    const t = Math.max(0, Math.min(1, (m - 0.47) / 0.03));
    const h = this.sim.height[this.sim.idx(cx, cy)] * YS;
    return h * (1 - t) + EDGE_Y * t;
  }

  // ⚠️ SMOOTH, not bilinear. Straight bilinear between cell centres is only C0,
  // so every one of the 63 cell boundaries shows as a crease and the hills look
  // faceted — which is most of what "clunky" meant. Smoothstep weights give a
  // continuous-looking slope for the cost of two multiplies.
  _heightAt(fx, fy) {
    const N = this.sim.N, H = this.sim.height;
    const x = Math.max(0, Math.min(N - 1.001, fx)), y = Math.max(0, Math.min(N - 1.001, fy));
    const x0 = x | 0, y0 = y | 0;
    const x1 = Math.min(N - 1, x0 + 1), y1 = Math.min(N - 1, y0 + 1);
    let u = x - x0, v = y - y0;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    const a = H[y0 * N + x0], b = H[y0 * N + x1], c = H[y1 * N + x0], e = H[y1 * N + x1];
    const h = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
    const dx = x / (N - 1) - 0.5, dy = y / (N - 1) - 0.5;
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    const t = Math.max(0, Math.min(1, (m - 0.47) / 0.03));
    return (h * YS) * (1 - t) + EDGE_Y * t;
  }

  // -- the ground ------------------------------------------------------------
  _ground() {
    const N = this.sim.N;

    // ---- the state texture: 64x64 of moss / water / heat / evidence. This is
    // what _paintGround writes every frame, and it stays cheap because it is
    // small. LinearFilter is doing a lot of work here — it is the difference
    // between a chequerboard and a wash.
    this.groundData = new Uint8Array(N * N * 4);
    this.groundTex = new THREE.DataTexture(this.groundData, N, N, THREE.RGBAFormat);
    this.groundTex.needsUpdate = true;
    this.groundTex.minFilter = THREE.LinearFilter;
    this.groundTex.magFilter = THREE.LinearFilter;
    this.groundTex.colorSpace = THREE.SRGBColorSpace;

    // ---- the detail texture: flock, blade speckle and coarse blotching, tiled
    // far denser than the sim grid. The state says WHAT the ground is; this says
    // what it is made of. Without it a 64x64 map stretched across a whole board
    // is 3cm per texel and reads as plastic.
    const D = 512, dc = document.createElement('canvas');
    dc.width = dc.height = D;
    const g2 = dc.getContext('2d');
    g2.fillStyle = '#808080'; g2.fillRect(0, 0, D, D);
    // coarse blotches — where dad's flocking went on thick
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * D, y = Math.random() * D, r = 14 + Math.random() * 52;
      const v = 108 + Math.random() * 58;
      const rad = g2.createRadialGradient(x, y, 0, x, y, r);
      rad.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
      rad.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g2.fillStyle = rad; g2.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // blade speckle — the actual ground foam
    const img = g2.getImageData(0, 0, D, D), px = img.data;
    for (let i = 0; i < px.length; i += 4) {
      const n = (Math.random() - 0.5) * 74;
      px[i] = Math.max(0, Math.min(255, px[i] + n));
      px[i + 1] = Math.max(0, Math.min(255, px[i + 1] + n));
      px[i + 2] = Math.max(0, Math.min(255, px[i + 2] + n));
    }
    g2.putImageData(img, 0, 0);
    const detail = new THREE.CanvasTexture(dc);
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    this.detailTex = detail;

    // ---- the mesh. SUB× denser than the sim grid, sampled smoothly, so the
    // hills are hills instead of 63 folded plates.
    const SUB = N >= 96 ? 2 : 3, M = (N - 1) * SUB + 1;
    const geo = new THREE.PlaneGeometry(GR * 2, GR * 2, M - 1, M - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const gx = i % M, gy = (i / M) | 0;
      pos.setY(i, this._heightAt(gx / SUB, gy / SUB));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: this.groundTex, roughness: 0.97, metalness: 0.0,
      bumpMap: detail, bumpScale: 0.012,
    });
    // multiply the tiled detail into the low-res state colour. `map` owns uv,
    // so the detail is sampled off vMapUv at its own scale.
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDetail = { value: detail };
      sh.uniforms.uDetailScale = { value: 30.0 };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>',
          '#include <common>\nuniform sampler2D uDetail;\nuniform float uDetailScale;')
        .replace('#include <map_fragment>',
          '#include <map_fragment>\n  {\n    vec3 det = texture2D(uDetail, vMapUv * uDetailScale).rgb;\n    diffuseColor.rgb *= (0.46 + det.r * 1.08);\n  }');
    };
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.receiveShadow = true;
    this.jar.add(this.ground);

    // ⚠️ PICKING GETS ITS OWN LOW-RES MESH. Raycasting the display terrain is
    // ~110k triangles per pointermove while the finger is down. This one is the
    // sim's own 64x64 and never renders.
    const pgeo = new THREE.PlaneGeometry(GR * 2, GR * 2, N - 1, N - 1);
    pgeo.rotateX(-Math.PI / 2);
    const ppos = pgeo.attributes.position;
    for (let i = 0; i < ppos.count; i++) ppos.setY(i, this._surfaceY(i % N, (i / N) | 0));
    ppos.needsUpdate = true;
    this.pickMesh = new THREE.Mesh(pgeo, new THREE.MeshBasicMaterial());
    this.pickMesh.visible = false;
    this.jar.add(this.pickMesh);

    // the evidence layer: every touch presses the flocking flat, forever (§15.3)
    this.fpGrid = new Float32Array(N * N);

    // ⚠️ which bag of flock went where. Low frequency on purpose — patches,
    // not speckle; the speckle is the detail texture's job.
    this.flock = new Uint8Array(N * N);
    {
      let fs2 = (this.sim.seed ^ 0x3c6ef35f) >>> 0;
      const fr = () => { fs2 = (Math.imul(fs2, 1664525) + 1013904223) >>> 0; return fs2 / 4294967296; };
      const cx0 = [], cy0 = [], cid = [];
      for (let i = 0; i < 22; i++) { cx0.push(fr() * N); cy0.push(fr() * N); cid.push((fr() * FLOCKS.length) | 0); }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let bd = 1e9, b2 = 0;
        for (let c = 0; c < cx0.length; c++) {
          const dx = x - cx0[c], dy = y - cy0[c], d2 = dx * dx + dy * dy;
          if (d2 < bd) { bd = d2; b2 = cid[c]; }
        }
        this.flock[y * N + x] = b2;
      }
    }

    // grey ballast painted into the scenery under the loop, precomputed once
    this.ballast = new Float32Array(N * N);
    const rt = RT / (GR * 2);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x / (N - 1) - 0.5, dy = y / (N - 1) - 0.5;
      const d = Math.abs(Math.sqrt(dx * dx + dy * dy) - rt);
      this.ballast[y * N + x] = Math.max(0, 1 - d / 0.022);
    }

    // the fascia — the painted board edge the scenery is built out to
    this.fasciaMat = new THREE.MeshStandardMaterial({ color: 0x24301f, roughness: 0.8 });
    const lip = EDGE_Y - BASE;
    for (const [sx, sz, w, dd] of [
      [0, -BOARD, BOARD * 2 + 0.03, 0.03], [0, BOARD, BOARD * 2 + 0.03, 0.03],
      [-BOARD, 0, 0.03, BOARD * 2 + 0.03], [BOARD, 0, 0.03, BOARD * 2 + 0.03],
    ]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, lip, dd), this.fasciaMat);
      m.position.set(sx, BASE + lip / 2, sz);
      this.jar.add(m);
    }
    const under = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD * 2, 0.028, BOARD * 2),
      new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 1 })
    );
    under.position.y = BASE - 0.014;
    this.jar.add(under);
  }

  // ⚠️ THE ALARM CHORD (bible §4.2). `k.phase` is set once at spawn and never
  // changes, so the colony has always been permanently, statically out of sync
  // — every lantern breathing to its own clock forever. When the board is
  // struck they should flinch AS ONE BODY and then slowly come apart into
  // individuals again, and that is the clearest statement the game can make
  // that they noticed. Deliberately view-side: this reads sim state and writes
  // none, so determinism and the save are untouched.
  flinch(cx, cy) {
    const s = this.sim, k = s.k;
    if (!this.phase) return;
    for (let id = 0; id < s.count; id++) {
      if (!k.alive[id]) continue;
      const d = Math.hypot(k.x[id] - cx, k.y[id] - cy);
      // near the touch they snap together hard; far off it only ripples
      const pull = Math.max(0, 1 - d / (26 * S));
      if (pull <= 0) continue;
      this.phase[id] += (this.chordPhase - this.phase[id]) * pull * 0.92;
    }
  }

  _tickPhases(dt) {
    const s = this.sim, k = s.k;
    if (!this.phase) {
      this.phase = new Float32Array(k.phase.length);
      this.phase.set(k.phase);
      this.chordPhase = 0;
    }
    this.chordPhase = (this.chordPhase + dt * 0.21) % 1;
    // and then they drift apart again, because no two of them are the same
    for (let id = 0; id < s.count; id++) {
      if (!k.alive[id]) continue;
      if (this.phase[id] === 0 && k.phase[id] !== 0) this.phase[id] = k.phase[id];
      // ⚠️ this coefficient is the whole second half of the effect. At 0.030 the
      // spread in pulse rates was too small to pull them apart again and they
      // stayed locked together after a flinch (measured: sync 0.43 -> 0.45 over
      // twenty seconds, when it should fall back toward 0.12). They have to
      // become a crowd of individuals again or the chord means nothing.
      this.phase[id] = (this.phase[id] + dt * (k.pulse[id] - 0.4) * 0.14) % 1;
    }
  }

  // -- what the town has made ------------------------------------------------
  // ⚠️ GLASSBOX: the thing on the board IS the agent's activity, never an
  // illustration of it. A work rises out of the ground as its `prog` rises, so
  // watching a half-built store is watching somebody actually building it.
  _works() {
    this.workViews = new Map();      // work object -> Group
    this.workRoot = new THREE.Group();
    this.jar.add(this.workRoot);
    const mat = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    this.workMats = {
      heap: mat(0x6d5a33, 0.95), stack: mat(0x4a6a2e, 0.9),
      stone: mat(0x6b6459, 0.95), cut: mat(0x3c2f1f, 1),
      turf: mat(0x5a5138, 0.95),
      thatch: mat(0xa88748, 0.95), timber: mat(0x4a3524, 0.9),
      // the roofs carry the whole silhouette — terracotta and slate, from the
      // reference towns
      tile: mat(0xa8492c, 0.85), slate: mat(0x4a5058, 0.7),
      plasterA: mat(0xd9cfb8, 0.85), plasterB: mat(0xc4b393, 0.85),
      plasterC: mat(0xe0d6c2, 0.85), brick: mat(0x9a6146, 0.9),
    };
  }

  _buildWorkView(o) {
    const M = this.workMats, g = new THREE.Group();
    // a view-local stream so a building looks the same every time it is drawn
    let sd = ((o.x * 7349) ^ (o.y * 5741) ^ (o.kind * 977)) >>> 0;
    const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
    const pick = (a) => a[(rnd() * a.length) | 0];

    // ⚠️ A PITCHED ROOF IS THE WHOLE SILHOUETTE. Every reference Kyle sent —
    // the fantasy town, the village green, even the wargaming table's farms —
    // reads as a settlement because of ROOFS: steep, tiled, in terracotta and
    // slate, at varied angles. A flat-topped box reads as a crate. So a roof
    // here is a real prism with a ridge, and its colour does most of the work.
    const roof = (w, d, h, mat) => {
      const geo = new THREE.BufferGeometry();
      const hw = w / 2, hd = d / 2;
      // two slopes meeting at a ridge along x, plus the two gable triangles
      const v = new Float32Array([
        -hw, 0, -hd, hw, 0, -hd, hw, h, 0, -hw, 0, -hd, hw, h, 0, -hw, h, 0,
        -hw, 0, hd, -hw, h, 0, hw, h, 0, -hw, 0, hd, hw, h, 0, hw, 0, hd,
        -hw, 0, -hd, -hw, h, 0, -hw, 0, hd,
        hw, 0, -hd, hw, 0, hd, hw, h, 0,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, mat);
    };
    const chimney = (x, z, h, w) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), M.stone);
      c.position.set(x, h / 2, z);
      return c;
    };

    if (o.kind === 0) {                                  // the store — a heap
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.050, 0.012, 9), M.heap);
      base.position.y = 0.006; g.add(base);
      for (let i = 0; i < 7; i++) {
        const r = 0.010 + rnd() * 0.009;
        const d = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), M.stack);
        const a = rnd() * 6.283, rr = rnd() * 0.026;
        d.position.set(Math.cos(a) * rr, 0.012 + r * 0.7, Math.sin(a) * rr);
        d.scale.y = 0.72; g.add(d);
      }
    } else if (o.kind === 1) {                           // the windbreak — a wall
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1) - 0.5) * 0.135;
        const h = 0.030 + rnd() * 0.016;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.020, h, 0.016), M.stone);
        b.position.set(t, h / 2, Math.abs(t) * 0.34);
        b.rotation.y = (rnd() - 0.5) * 0.5;
        b.rotation.z = (rnd() - 0.5) * 0.16;
        g.add(b);
      }
    } else if (o.kind === 2) {                           // the channel — a cut
      const n = 8;
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1) - 0.5) * 0.16;
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.010, 0.019), M.cut);
        c.position.set(t, -0.002, Math.sin(i * 0.9) * 0.010);
        c.rotation.y = (rnd() - 0.5) * 0.3;
        g.add(c);
      }
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.004, 0.012),
        new THREE.MeshStandardMaterial({ color: 0x2f5a72, roughness: 0.2, metalness: 0.1 }));
      w.position.y = 0.003; g.add(w);

    } else if (o.kind === 3) {                           // THE FIRST HUT
      // bent sticks and turf. This is the first night any of them slept dry.
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.031, 0.020, 7), M.turf);
      wall.position.y = 0.010; g.add(wall);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.030, 7), M.thatch);
      cone.position.y = 0.033; g.add(cone);
      for (let i = 0; i < 3; i++) {                      // poles leaning on it
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0022, 0.050, 4), M.timber);
        const a = rnd() * 6.283;
        p.position.set(Math.cos(a) * 0.026, 0.024, Math.sin(a) * 0.026);
        p.rotation.z = 0.35 * Math.cos(a); p.rotation.x = -0.35 * Math.sin(a);
        g.add(p);
      }

    } else if (o.kind === 4) {                           // A HOUSE
      const w = 0.052 + rnd() * 0.022, d = 0.044 + rnd() * 0.018;
      const wh = 0.030 + rnd() * 0.016;
      const wallMat = pick([M.plasterA, M.plasterB, M.plasterC, M.brick]);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, wh, d), wallMat);
      body.position.y = wh / 2; g.add(body);
      // half-timbering: the reference town is full of it and it costs two boxes
      if (rnd() < 0.5) {
        for (const sx of [-1, 1]) {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(0.004, wh, d * 1.01), M.timber);
          beam.position.set(sx * w * 0.4, wh / 2, 0); g.add(beam);
        }
        const sill = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, 0.004, d * 1.01), M.timber);
        sill.position.y = wh * 0.62; g.add(sill);
      }
      const rm = pick([M.tile, M.tile, M.slate, M.thatch]);
      const rf = roof(w * 1.14, d * 1.14, 0.024 + rnd() * 0.014, rm);
      rf.position.y = wh; rf.rotation.y = rnd() < 0.5 ? 0 : Math.PI / 2;
      g.add(rf);
      g.add(chimney((rnd() - 0.5) * w * 0.5, (rnd() - 0.5) * d * 0.5, wh + 0.030, 0.008));

    } else {                                             // THE HALL
      const w = 0.115, d = 0.075, wh = 0.048;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, wh, d), M.plasterA);
      body.position.y = wh / 2; g.add(body);
      for (const sx of [-0.36, 0, 0.36]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.005, wh, d * 1.01), M.timber);
        beam.position.set(sx * w, wh / 2, 0); g.add(beam);
      }
      const rf = roof(w * 1.12, d * 1.16, 0.046, M.tile);
      rf.position.y = wh; g.add(rf);
      // a stub of a tower, because every one of those towns has one
      const tw = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.070, 0.026), M.stone);
      tw.position.set(w * 0.42, 0.035, -d * 0.30); g.add(tw);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.030, 4), M.slate);
      cap.position.set(w * 0.42, 0.085, -d * 0.30); cap.rotation.y = Math.PI / 4; g.add(cap);
      g.add(chimney(-w * 0.3, d * 0.2, wh + 0.038, 0.010));
    }

    g.traverse(o2 => { o2.castShadow = true; o2.receiveShadow = true; });
    g.rotation.y = rnd() * 6.283;
    g.scale.setScalar(S);          // everything above is written at the 64-grid scale
    return g;
  }

  _paintWorks() {
    const s = this.sim, live = new Set();
    for (const o of s.works) {
      live.add(o);
      let g = this.workViews.get(o);
      if (!g) { g = this._buildWorkView(o); this.workRoot.add(g); this.workViews.set(o, g); }
      const p = this.cellToLocal(o.x, o.y, 0);
      // it RISES as it is made — half-built is half out of the ground
      const f = Math.min(1, o.prog);
      g.position.set(p[0], p[1] - (1 - f) * 0.045, p[2]);
      g.scale.setScalar(0.55 + f * 0.45);
      g.visible = f > 0.04;
    }
    for (const [o, g] of this.workViews) {
      if (live.has(o)) continue;
      this.workRoot.remove(g);
      g.traverse(n => { if (n.geometry) n.geometry.dispose(); });
      this.workViews.delete(o);
    }
  }

  // -- ground cover ----------------------------------------------------------
  // ⚠️ THIS IS THE DIFFERENCE BETWEEN A PAINTED BOARD AND A LAYOUT. Age of Toys
  // learned it the expensive way: its maps ran a dozen props over five thousand
  // tiles and read as beautifully painted emptiness. A flat green texture is
  // flat green no matter how good the texture is — what sells scale is a great
  // many small things standing UP off the ground, and the only affordable way
  // to have thousands of them is instancing. This is three draw calls.
  // ⚠️ A lone small cone reads as a PIN, not as grass. Blades go down in
  // clusters of three to six, leaning different ways.
  _groundCover() {
    const s = this.sim, N = s.N;
    // deterministic from the WORLD's seed, and drawn from a view-local stream —
    // the sim's rng must never be touched by decoration (Invariant 1)
    let sd = (s.seed ^ 0x5bf03635) >>> 0;
    const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
    const wpos = (cx, cy) => [
      (cx / (N - 1) - 0.5) * GR * 2,
      this._heightAt(cx, cy),
      (cy / (N - 1) - 0.5) * GR * 2,
    ];

    const blade = new THREE.ConeGeometry(0.0026, 0.0105, 4);
    blade.translate(0, 0.0052, 0);
    const rockG = new THREE.IcosahedronGeometry(0.0055, 0);
    const budG = new THREE.SphereGeometry(0.0029, 5, 4);

    const CAPB = 16000, CAPR = 260, CAPF = 280;
    const grass = new THREE.InstancedMesh(blade,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), CAPB);
    const rocks = new THREE.InstancedMesh(rockG,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), CAPR);
    const buds = new THREE.InstancedMesh(budG,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), CAPF);

    const o = new THREE.Object3D(), col = new THREE.Color();
    let nb = 0, nr = 0, nf = 0, tries = 0;
    const free = (i) => s.water[i] <= 0.008 && this.ballast[i] < 0.30;

    while (nb < CAPB && tries++ < CAPB * 5) {
      const cx = rnd() * (N - 1), cy = rnd() * (N - 1);
      const i = s.idx(cx, cy);
      if (!free(i)) continue;
      const m = s.moss[i];
      if (rnd() > 0.20 + m * 1.15) continue;          // density follows the flocking
      const n = 4 + ((rnd() * 6) | 0);
      const hue = 0.255 + rnd() * 0.085;              // one clump, one shade
      for (let k = 0; k < n && nb < CAPB; k++) {
        const jx = cx + (rnd() - 0.5) * 0.85 * S, jy = cy + (rnd() - 0.5) * 0.85 * S;
        const p = wpos(jx, jy);
        o.position.set(p[0], p[1], p[2]);
        o.rotation.set((rnd() - 0.5) * 0.62, rnd() * 6.283, (rnd() - 0.5) * 0.62);
        const sc = 0.7 + rnd() * 0.75;
        o.scale.set(sc, sc * (0.72 + rnd() * 0.9), sc);
        o.updateMatrix();
        grass.setMatrixAt(nb, o.matrix);
        col.setHSL(hue, 0.46 + rnd() * 0.24, 0.15 + m * 0.13 + rnd() * 0.07);
        grass.setColorAt(nb, col);
        nb++;
      }
    }

    tries = 0;
    while (nr < CAPR && tries++ < CAPR * 12) {
      const cx = rnd() * (N - 1), cy = rnd() * (N - 1);
      const i = s.idx(cx, cy);
      if (!free(i)) continue;
      if (rnd() < s.moss[i] * 0.75) continue;         // stones show where the flock is thin
      const p = wpos(cx, cy);
      o.position.set(p[0], p[1] + 0.002, p[2]);
      o.rotation.set(rnd() * 3, rnd() * 6.283, rnd() * 3);
      const sc = 0.5 + rnd() * 0.8;
      o.scale.set(sc, sc * 0.55, sc);
      o.updateMatrix();
      rocks.setMatrixAt(nr, o.matrix);
      const v = 0.15 + rnd() * 0.13;
      col.setRGB(v, v * 0.95, v * 0.84);
      rocks.setColorAt(nr, col);
      nr++;
    }

    tries = 0;
    while (nf < CAPF && tries++ < CAPF * 14) {
      const cx = rnd() * (N - 1), cy = rnd() * (N - 1);
      const i = s.idx(cx, cy);
      if (!free(i) || s.moss[i] < 0.45) continue;
      if (rnd() < 0.45) continue;
      const p = wpos(cx, cy);
      o.position.set(p[0], p[1] + 0.012 + rnd() * 0.008, p[2]);
      o.rotation.set(0, rnd() * 6.283, 0);
      const sc = 0.7 + rnd() * 0.8;
      o.scale.set(sc, sc, sc);
      o.updateMatrix();
      buds.setMatrixAt(nf, o.matrix);
      // dad's scatter: mostly white, some yellow, a little red
      const r2 = rnd();
      if (r2 < 0.5) col.setRGB(0.92, 0.90, 0.82);
      else if (r2 < 0.82) col.setRGB(0.92, 0.80, 0.30);
      else col.setRGB(0.78, 0.30, 0.32);
      buds.setColorAt(nf, col);
      nf++;
    }

    for (const [mesh, n] of [[grass, nb], [rocks, nr], [buds, nf]]) {
      mesh.count = n;
      mesh.castShadow = true;                      // 16k blades, one shadow pass
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      this.jar.add(mesh);
    }
    this.coverCounts = { grass: nb, rocks: nr, buds: nf };
  }

  // -- dad's loop ------------------------------------------------------------
  _track() {
    // The rails are the edge of the world: the sim's walkable circle wearing its
    // fiction, and nothing inside ever crosses them.
    // ⚠️ The track FOLLOWS the scenery. It used to be a flat torus, which was
    // fine floating above a disc and impossible once the terrain filled the
    // board — a level ring over hills either buries itself or flies.
    const SEG = 132, N = this.sim.N;
    const ringPt = (a, off) => {
      const r = RT + off;
      const wx = Math.cos(a) * r, wz = Math.sin(a) * r;
      const cx = (wx / (GR * 2) + 0.5) * (N - 1);
      const cy = (wz / (GR * 2) + 0.5) * (N - 1);
      return [wx, this._surfaceY(cx, cy), wz];
    };

    const ties = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.058, 0.005, 0.013),
      new THREE.MeshStandardMaterial({ color: 0x2e2115, roughness: 0.95 }), SEG);
    const railGeo = new THREE.BoxGeometry(0.0055, 0.0048, 1);   // unit length in z
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb4ada1, roughness: 0.34, metalness: 0.75 });
    const rails = [
      new THREE.InstancedMesh(railGeo, railMat, SEG),
      new THREE.InstancedMesh(railGeo, railMat, SEG),
    ];

    const o = new THREE.Object3D();
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
      for (let r = 0; r < 2; r++) {
        const off = r === 0 ? -0.019 : 0.019;
        const p0 = ringPt(a0, off), p1 = ringPt(a1, off);
        o.position.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + 0.007, (p0[2] + p1[2]) / 2);
        o.scale.set(1, 1, 1);
        o.lookAt(p1[0], p1[1] + 0.007, p1[2]);
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
        o.scale.set(1, 1, len * 1.15);
        o.updateMatrix();
        rails[r].setMatrixAt(i, o.matrix);
      }
      const pm = ringPt(a0, 0);
      o.position.set(pm[0], pm[1] + 0.003, pm[2]);
      o.scale.set(1, 1, 1);
      o.rotation.set(0, -a0, 0);
      o.updateMatrix();
      ties.setMatrixAt(i, o.matrix);
    }
    ties.instanceMatrix.needsUpdate = true;
    ties.castShadow = ties.receiveShadow = true;
    rails.forEach(m => { m.instanceMatrix.needsUpdate = true; m.castShadow = true; this.jar.add(m); });
    this.jar.add(ties);

    // the 6:15, stopped where dad left it, never fixed
    const carCols = [0x1c2f22, 0x5a2222, 0x3a3a42];
    const a0 = 2.35;
    for (let ci = 0; ci < 3; ci++) {
      const car = new THREE.Group();
      const long = ci === 0 ? 0.105 : 0.085, tall = ci === 0 ? 0.042 : 0.032;
      const bodyM = new THREE.Mesh(new THREE.BoxGeometry(long, tall, 0.034),
        new THREE.MeshStandardMaterial({ color: carCols[ci], roughness: 0.6 }));
      bodyM.position.y = tall / 2 + 0.004; car.add(bodyM);
      if (ci === 0) {
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.010, 0.03, 8),
          new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.7 }));
        stack.position.set(-long * 0.32, tall + 0.017, 0); car.add(stack);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.026, 0.036),
          new THREE.MeshStandardMaterial({ color: 0x233528, roughness: 0.6 }));
        cab.position.set(long * 0.30, tall + 0.011, 0); car.add(cab);
      }
      const a = a0 + ci * 0.075;
      const p = ringPt(a, 0);
      car.traverse(o2 => { o2.castShadow = true; o2.receiveShadow = true; });
      car.position.set(p[0], p[1] + 0.008, p[2]);
      car.rotation.y = -a - Math.PI / 2;
      this.jar.add(car);
    }
  }

  _scenery() {
    // Deterministic dressing from the WORLD's seed — the same colony must wake
    // up on the same table every boot. View-local PRNG; the sim's rng stream
    // is never touched. (Invariant 1 stays intact.)
    const s = this.sim, N = s.N;
    let sd = (s.seed ^ 0x9e3779b9) >>> 0;
    const rnd = () => {
      sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0;
      return sd / 4294967296;
    };
    // ⚠️ dad built the town around the figures, not on top of them. Captured
    // with the one who stays standing INSIDE a house, their glue just visible
    // at the wall — which hides the one character the layout is about.
    let keepX = -99, keepY = -99;
    for (let i = 0; i < s.count; i++) if (s.k.alive[i] && s.k.glued[i]) { keepX = s.k.x[i]; keepY = s.k.y[i]; }
    const ok = (x, y, hMin, clear = 0) => {
      const dx = x / (N - 1) - 0.5, dy = y / (N - 1) - 0.5;
      // ⚠️ square, not radial — the corners of the board are prime scenery now,
      // and they are the one part of the layout nobody lives in
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 0.455) return false;
      // and keep the roadbed clear
      if (this.ballast[y * N + x] > 0.25) return false;
      if (clear > 0 && Math.abs(x - keepX) < clear && Math.abs(y - keepY) < clear) return false;
      const i = y * N + x;
      return s.height[i] > s.pondLevel + hMin && s.water[i] < 0.002;
    };
    const put = (mesh, x, y) => {
      const [wx, wy, wz] = this.cellToLocal(x, y, 0);
      mesh.position.set(wx, wy, wz);
      mesh.rotation.y = rnd() * Math.PI * 2;
      this.jar.add(mesh);
    };

    // ⚠️ NO HOUSES ARE PLACED HERE ANY MORE. They start with nothing — no
    // shelter, no tools — and every structure on this board is one they worked
    // out and built themselves (see WORKS in sim.js). A village that already
    // existed at worldgen is exactly what this game must not have.
    /* removed: decorative houses
    const wallCols = [0xd6d0c2, 0xa23f33, 0x8797a6, 0xc7b789, 0xb8a27a];
    const roofM = new THREE.MeshStandardMaterial({ color: 0x4a3427, roughness: 0.85 });
    let homes = 0, tries = 0;
    while (homes < 9 && tries++ < 300) {
      const ang = rnd() * Math.PI * 2, rr2 = (3.5 + rnd() * 5.5) * S;
      const x = Math.round(s.hearth.x + Math.cos(ang) * rr2);
      const y = Math.round(s.hearth.y + Math.sin(ang) * rr2);
      if (x < 1 || y < 1 || x > N - 2 || y > N - 2 || !ok(x, y, 0.08, 3.2 * S)) continue;
      const w = 0.048 + rnd() * 0.02, hgt = 0.032 + rnd() * 0.014;
      const house = new THREE.Group();
      const wallsM = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, w * 0.92),
        new THREE.MeshStandardMaterial({ color: wallCols[homes % wallCols.length], roughness: 0.72 }));
      wallsM.position.y = hgt / 2; house.add(wallsM);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.80, hgt * 0.72, 4), roofM);
      roof.position.y = hgt + hgt * 0.36; roof.rotation.y = Math.PI / 4; house.add(roof);
      if (homes === 0) {           // the church — every layout has one
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.036, 6),
          new THREE.MeshStandardMaterial({ color: 0xe4dfd2, roughness: 0.6 }));
        spire.position.y = hgt + hgt * 0.72 + 0.014; house.add(spire);
      }
      house.traverse(o2 => { o2.castShadow = true; o2.receiveShadow = true; });
      put(house, x, y);
      homes++;
    }
    */

    // bottle-brush trees — INSTANCED. The old build made every tree a Group of
    // 2-5 meshes, each its own draw call, doubled again by the shadow pass:
    // ~800 draw calls for 130 trees, the scene's runaway cost. Now: record the
    // same trees into arrays, then build THREE InstancedMeshes (cones, balls,
    // trunks) — 3 draws + 3 shadow draws for the whole forest.
    // ⚠⚠ THE rnd() CALL ORDER IS THE INVARIANT. Placement is seeded from the
    // world seed so the same colony wakes on the same table; every rnd() the
    // old code made must still be made, in the same sequence, even where its
    // value now lands in an instance attribute instead of a mesh. Reorder one
    // call and every board in every save grows a different forest.
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1 });
    const greens = [0x1b4526, 0x245a30, 0x2f6b34, 0x4a8b31, 0x6aa63a, 0x3d7a45];
    const cones = [], balls = [], trunks = [];   // {x,y,cy,ry,sx,sy,sz,color}
    let trees = 0, tries2 = 0;
    while (trees < 130 && tries2++ < 900) {
      const ax = (3 + rnd() * (N - 6)) | 0, ay = (3 + rnd() * (N - 6)) | 0;
      if (!ok(ax, ay, 0.05, 1.8 * S)) continue;
      const clump = 3 + ((rnd() * 7) | 0);
      for (let ci = 0; ci < clump && trees < 130; ci++) {
      const x = Math.round(ax + (rnd() - 0.5) * 7 * S), y = Math.round(ay + (rnd() - 0.5) * 7 * S);
      if (x < 2 || y < 2 || x > N - 3 || y > N - 3) continue;
      if (!ok(x, y, 0.05, 1.8 * S)) continue;
      const th = 0.052 + rnd() * 0.070;
      const kind = rnd();
      const color = greens[(rnd() * greens.length) | 0];
      if (kind < 0.45) {                              // conifer: stacked skirts
        const tiers = 3 + ((rnd() * 2) | 0);
        for (let t = 0; t < tiers; t++) {
          const f2 = t / tiers;
          const ry = rnd() * 6.283;                   // was cone.rotation.y
          cones.push({ x, y, cy: 0.010 + th * (0.16 + f2 * 0.62), ry,
            sx: th * (0.38 - f2 * 0.20), sy: th * (0.52 - f2 * 0.16), color });
        }
      } else if (kind < 0.80) {                       // the lime ball-tree
        const wob = 0.86 + rnd() * 0.3;               // was b3.scale.y
        balls.push({ x, y, cy: 0.012 + th * 0.42, ry: 0,
          sx: th * 0.34, sy: th * 0.34 * wob, sz: th * 0.34, color });
      } else {                                        // a broad low lollipop
        balls.push({ x, y, cy: 0.010 + th * 0.30, ry: 0,
          sx: th * 0.40 * 1.15, sy: th * 0.40 * 0.52, sz: th * 0.40 * 1.15, color });
      }
      trunks.push({ x, y, cy: 0.009, ry: 0, sx: 1, sy: 1, sz: 1, color: 0 });
      rnd();                                          // was put()'s group yaw
      trees++;
      }
    }

    // build the three meshes from the records
    const mkIM = (geo, mat, list, tinted) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(),
            sc = new THREE.Vector3(), col = new THREE.Color(), e = new THREE.Euler();
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const [wx, wy, wz] = this.cellToLocal(t.x, t.y, 0);
        v3.set(wx, wy + t.cy, wz);
        e.set(0, t.ry, 0); q.setFromEuler(e);
        sc.set(t.sx, t.sy, t.sz !== undefined ? t.sz : t.sx);
        m4.compose(v3, q, sc);
        im.setMatrixAt(i, m4);
        if (tinted) im.setColorAt(i, col.setHex(t.color));
      }
      im.castShadow = true; im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.jar.add(im);
      return im;
    };
    // unit geometries; per-instance scale carries the shape
    const needleM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93 });
    const ballM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93 });
    mkIM(new THREE.ConeGeometry(1, 1, 7), needleM, cones, true);
    mkIM(new THREE.IcosahedronGeometry(1, 1), ballM, balls, true);
    mkIM(new THREE.CylinderGeometry(0.0032, 0.0052, 0.020, 5), trunkM, trunks, false);
  }

  _paintGround() {
    // ⚠️ THIS WRITES ALBEDO, NOT A LIT PIXEL. It used to bake a fake
    // height-gradient shade and the daylight level straight into the colour,
    // which was right for an unlit MeshBasicMaterial and doubles up the moment
    // real lights exist — the board went to mud. The renderer does the light.
    const s = this.sim, N = s.N, d = this.groundData;
    // ⚠⚠ THE WARM FLOOR IS RELATIVE TO THE ROOM, AND IT HAS TO BE. A fixed 25°
    // was tried and measured wrong: a settled board with the bulb OFF sits at
    // 20.5°, but with the bulb ON it sits at 23.8° — and a hand resting on that
    // warmer board lifts EVERY ONE of the 9,216 cells past 25, so the whole
    // layout lit up as 'touched'. The room's own baseline moves with the bulb,
    // the window and the month, so a constant can only ever be right for one of
    // them. This is the same number _thermal relaxes toward, plus a margin.
    const warmFloor = s.ambient + s.daylight * C.SUN_GAIN + 3;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const m = s.moss[i], w = s.water[i], T = s.temp[i], q = s.moist[i];
        // ⚠️ THE RAMP IS sqrt(m), NOT m. Linear blending made the whole middle
        // of the board olive: 93% of cells are mossy but the inner ring sits at
        // 0.19, and 0.19 of a green mixed linearly into brown is mud. Thin
        // ground foam over soil still READS as grass, so the colour has to get
        // there faster than the quantity does.
        // ⚠️ SLOPE IS FREE MATERIAL VARIETY. A layout is plaster and flock, and
        // flock does not stick to a cliff — steep ground is where the plaster
        // shows. This is the cheapest way to stop a heightfield reading as one
        // painted sheet, and it costs four array reads.
        const hl = s.height[s.idx(x - 1, y)], hr2 = s.height[s.idx(x + 1, y)];
        const hu = s.height[s.idx(x, y - 1)], hd2 = s.height[s.idx(x, y + 1)];
        const slope = Math.min(1, (Math.abs(hr2 - hl) + Math.abs(hd2 - hu)) * 9);
        const mm = Math.sqrt(m) * (1 - slope * 0.8);
        // which bag of flock got used here — low-frequency, so it patches
        const fl = this.flock[i];
        let r = 88 - q * 40, g = 68 - q * 32, b = 46 - q * 22;   // painted dirt
        const F0 = FLOCKS[fl];
        r = r * (1 - mm) + (F0[0] + m * F0[3]) * mm;
        g = g * (1 - mm) + (F0[1] + m * F0[4]) * mm;
        b = b * (1 - mm) + (F0[2] + m * F0[5]) * mm;
        // grey ballast under dad's track, painted rather than modelled
        const bl = this.ballast[i];
        if (bl > 0.01) { const t2 = bl * 0.85; r = r * (1 - t2) + 118 * t2; g = g * (1 - t2) + 112 * t2; b = b * (1 - t2) + 104 * t2; }
        // plaster shows through where it is steep
        if (slope > 0.05) {
          const rk = slope * 0.7;
          r = r * (1 - rk) + 122 * rk; g = g * (1 - rk) + 114 * rk; b = b * (1 - rk) + 100 * rk;
        }
        // the tracks: worn to pale sand where enough feet have crossed
        const wn = s.worn[i];
        if (wn > 0.02) {
          const t3 = Math.min(0.88, wn * 1.15);
          r = r * (1 - t3) + 156 * t3; g = g * (1 - t3) + 140 * t3; b = b * (1 - t3) + 112 * t3;
        }
        // wet grass is dark grass — moisture used to tint only the bare soil
        if (q > 0.25) { const wetf = 1 - Math.min(0.34, (q - 0.25) * 0.55); r *= wetf; g *= wetf; b *= wetf; }
        // the evidence: flocking pressed flat where a finger has been
        const fpv = this.fpGrid[i];
        if (fpv > 0.004) {
          const pr = Math.min(0.55, fpv);
          r = r * (1 - pr) + 84 * pr; g = g * (1 - pr) + 74 * pr; b = b * (1 - pr) + 60 * pr;
        }
        // ⚠⚠ THE KIND HALF OF THE FINGER USED TO RENDER AS NOTHING AT ALL.
        // The only ground tints were scorch above 40° and frost below 8° — but
        // every comfort band in the game tops out under 40 (plain [18,32], ash
        // [26,41], rime [6,21], slick [20,34]). So a hand resting at a perfectly
        // kind 33° changed the board by literally zero pixels, and the FIRST
        // feedback anybody ever got about their own hand was a burn mark. Half a
        // verb was invisible.
        //
        // The floor is hoisted above and is relative to the room — see there.
        //
        // It is deliberately a PALE, DRY lift rather than more of the scorch's
        // saturated orange: warming a place and cooking it have to read as two
        // different events, not as two amounts of one.
        if (T > warmFloor) { const wv = Math.min(1, (T - warmFloor) / 9); r += wv * 40; g += wv * 21; b += wv * 4; }
        // the finger's mark: scorch, then heat glow
        if (T > 40) { const h = Math.min(1, (T - 40) / 45); r += h * 150; g += h * 46; b -= h * 20; }
        if (T < 8) { const c2 = Math.min(1, (8 - T) / 18); r += c2 * 20; g += c2 * 34; b += c2 * 62; }
        // water darkens and cools the ground beneath it
        if (w > 0.002) { const a = Math.min(1, w * 7); r = r * (1 - a) + 18 * a; g = g * (1 - a) + 34 * a; b = b * (1 - a) + 44 * a; }

        const o = i * 4;
        d[o] = Math.max(0, Math.min(255, r));
        d[o + 1] = Math.max(0, Math.min(255, g));
        d[o + 2] = Math.max(0, Math.min(255, b));
        // ⚠️ The heightfield is square and the jar is round. Without this the
        // terrain's corners flare out through the glass like a salad bowl.
        d[o + 3] = 255;
      }
    }
    this.groundTex.needsUpdate = true;
  }

  // -- the water -------------------------------------------------------------
  // A tiny procedural cubemap of the basement — dark walls, one warm bulb —
  // so glossy surfaces have something to reflect from EVERY angle. Without an
  // environment, a bird's-eye camera almost never lines up with the one lamp,
  // so a roughness-0.16 pond still rendered matte. Resin-pour water on a real
  // layout is glossy precisely because the whole room is in it.
  _envCube() {
    const faces = [];
    for (let f = 0; f < 6; f++) {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, 32);
      grd.addColorStop(0, '#2a2d33'); grd.addColorStop(1, '#0c0e12');
      g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
      if (f === 2) {   // +Y: the ceiling, and the bulb hanging from it
        const r = g.createRadialGradient(16, 16, 1, 16, 16, 13);
        r.addColorStop(0, 'rgba(255,222,168,1)');
        r.addColorStop(0.35, 'rgba(216,164,92,0.55)');
        r.addColorStop(1, 'rgba(216,164,92,0)');
        g.fillStyle = r; g.fillRect(0, 0, 32, 32);
      }
      faces.push(c);
    }
    const cube = new THREE.CubeTexture(faces);
    cube.colorSpace = THREE.SRGBColorSpace;
    cube.needsUpdate = true;
    return cube;
  }

  _water() {
    const N = this.sim.N;
    const geo = new THREE.PlaneGeometry(GR * 2, GR * 2, N - 1, N - 1);
    geo.rotateX(-Math.PI / 2);
    this.waterGeo = geo;
    this.waterData = new Uint8Array(N * N * 4);
    this.waterTex = new THREE.DataTexture(this.waterData, N, N, THREE.RGBAFormat);
    this.waterTex.minFilter = THREE.LinearFilter;
    this.waterTex.colorSpace = THREE.SRGBColorSpace;
    this.waterTex.magFilter = THREE.LinearFilter;
    // ⚠️ alphaTest on a rippling 64x64 plane cut triangles in and out and
    // hatched the pond with diagonal stripes. Plain transparency, and a low
    // roughness so the water actually catches the lamp.
    // resin, not paint: near-zero roughness plus the basement cubemap. The
    // envMap stays PER-MATERIAL on purpose — setting scene.environment would
    // gloss the flock and the plaster too, and a model lawn is dead matte.
    if (!this.envCube) this.envCube = this._envCube();
    this.water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: this.waterTex, transparent: true, depthWrite: false,
      roughness: 0.06, metalness: 0.0,
      envMap: this.envCube, envMapIntensity: 0.85,
    }));
    this.jar.add(this.water);
  }

  _paintWater() {
    const s = this.sim, N = s.N, d = this.waterData;
    const pos = this.waterGeo.attributes.position;
    const wob = this.t * 0.9;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, w = s.water[i];
      const ripple = w > 0.004 ? Math.sin(x * 0.7 + wob) * Math.sin(y * 0.6 - wob * 1.3) * 0.0016 : 0;
      pos.setY(i, (s.height[i] + w) * YS + ripple);
      const o = i * 4;
      // depth reads as colour AND as opacity, so a pond has a shallow edge and
      // a middle you cannot see the bottom of
      const a = w <= 0.006 ? 0 : Math.min(0.93, (w - 0.006) * 9);
      const dark = Math.min(1, w * 5.5);
      const deep = dark * dark;
      let cr = 104 - deep * 74, cg = 152 - deep * 92, cb = 176 - deep * 66;
      // the MENISCUS: where a resin pour meets the flock it pulls a pale line.
      // One band at the shallow rim sells the whole 'this was poured' read.
      if (w > 0.006 && w < 0.017) {
        const m = 1 - (w - 0.006) / 0.011;
        cr += m * 96; cg += m * 84; cb += m * 58;
      }
      d[o] = cr | 0; d[o + 1] = cg | 0; d[o + 2] = cb | 0;
      d[o + 3] = (a * 255) | 0;
    }
    pos.needsUpdate = true;
    this.waterTex.needsUpdate = true;
  }

  // -- the kin ---------------------------------------------------------------
  _kin() {
    const CAP = this.sim.k.alive.length;
    // —— THE LITTLE ALIEN PEOPLE ———————————————————————————
    // Kyle: 'i dont like the little lantern guys - i want it to be more like
    // little alien people.' The dark blob + big glow is gone. The figure is a
    // lathe profile — pear body, pinched neck, OVERSIZED head (the alien read
    // at any distance is head-to-body ratio, nothing else survives 4mm) — plus
    // a dark layer of two big eyes and an antenna stalk, plus the old lantern
    // SHRUNK to a glowing antenna tip. The interface did not die, it moved:
    //   body PAINT  = the hue (worst need blended over bloodline, as before)
    //   POSTURE     = wellbeing — a failing kin droops forward and sags
    //   the TIP     = the lantern's remnant, small, still hue + brightness
    // Four draw calls for the whole colony (body, features, tips, glue), and
    // pickKin still reads lanternPos so the reach and the inspector survive.
    //
    // ⚠️ ONE LATHE, NO MERGING LIBRARY. BufferGeometryUtils is an examples
    // module and is NOT in the vendored core — the body+head is a single lathe
    // profile, and the feature layer is hand-merged from non-indexed primitives
    // below. Do not reach for mergeBufferGeometries; it does not exist here.
    const prof = [
      [0.0000, 0.0000], [0.0085, 0.0010], [0.0105, 0.0062], [0.0078, 0.0130],
      [0.0046, 0.0160],                                     // the neck pinch
      [0.0088, 0.0205], [0.0102, 0.0252], [0.0062, 0.0300], // the big head
      [0.0000, 0.0328],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(prof, 10);
    // painted-toy material; per-instance colour carries the hue
    this.bodies = new THREE.InstancedMesh(body,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.02 }), CAP);
    this.bodies.castShadow = true;
    this.bodies.receiveShadow = true;
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodies.count = 0;
    this.bodies.frustumCulled = false;
    // force the instanceColor attribute into existence before first render
    this._col = new THREE.Color(1, 1, 1);
    for (let i = 0; i < CAP; i++) this.bodies.setColorAt(i, this._col);
    this.bodies.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.jar.add(this.bodies);

    // the dark features: two big eyes + the antenna stalk, one draw call.
    // Hand-merged: everything to non-indexed, concatenate position+normal.
    const parts = [];
    const put = (geo, x, y, z) => { geo.translate(x, y, z); parts.push(geo.toNonIndexed()); };
    put(new THREE.SphereGeometry(0.0030, 7, 5), -0.0044, 0.0246, 0.0082);   // left eye
    put(new THREE.SphereGeometry(0.0030, 7, 5),  0.0044, 0.0246, 0.0082);   // right eye
    put(new THREE.CylinderGeometry(0.0005, 0.0009, 0.0105, 4), 0, 0.0370, 0); // antenna
    let vTot = 0;
    for (const g0 of parts) vTot += g0.attributes.position.count;
    const fpos = new Float32Array(vTot * 3), fnor = new Float32Array(vTot * 3);
    let off = 0;
    for (const g0 of parts) {
      fpos.set(g0.attributes.position.array, off * 3);
      fnor.set(g0.attributes.normal.array, off * 3);
      off += g0.attributes.position.count;
    }
    const feat = new THREE.BufferGeometry();
    feat.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    feat.setAttribute('normal', new THREE.BufferAttribute(fnor, 3));
    this.features = new THREE.InstancedMesh(feat,
      new THREE.MeshStandardMaterial({ color: 0x12161d, roughness: 0.35 }), CAP);
    this.features.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.features.count = 0;
    this.features.frustumCulled = false;
    this.jar.add(this.features);

    // the lantern: additive points. This is the entire UI. (§4.2)
    const spr = document.createElement('canvas'); spr.width = spr.height = 64;
    const sg = spr.getContext('2d');
    const rad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    rad.addColorStop(0, 'rgba(255,255,255,1)');
    rad.addColorStop(0.10, 'rgba(255,255,255,0.95)');
    rad.addColorStop(0.30, 'rgba(255,255,255,0.42)');
    rad.addColorStop(0.62, 'rgba(255,255,255,0.10)');
    rad.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = rad; sg.fillRect(0, 0, 64, 64);
    const sprTex = new THREE.CanvasTexture(spr);

    const g = new THREE.BufferGeometry();
    this.lanternPos = new Float32Array(CAP * 3);
    this.lanternCol = new Float32Array(CAP * 3);
    this.lanternSize = new Float32Array(CAP);
    g.setAttribute('position', new THREE.BufferAttribute(this.lanternPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.lanternCol, 3));
    g.setAttribute('psize', new THREE.BufferAttribute(this.lanternSize, 1));
    g.setDrawRange(0, 0);

    const mat = new THREE.PointsMaterial({
      size: 0.1, map: sprTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true, sizeAttenuation: true,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float psize;\n' + sh.vertexShader
        .replace('gl_PointSize = size;', 'gl_PointSize = psize;');
    };
    this.lanterns = new THREE.Points(g, mat);
    this.lanterns.frustumCulled = false;
    this.jar.add(this.lanterns);

    // DAD'S DROP OF GLUE — gone amber and hard, under exactly one figure.
    // ⚠️ polygonOffset, NOT a raised y: the scenery's surface height varies, so
    // a fixed offset either floats or sinks under the ground and depth-fails.
    const gc = document.createElement('canvas'); gc.width = gc.height = 64;
    const gg = gc.getContext('2d');
    // ⚠️ captured as a washed-out grey speck at first — a hard amber core with
    // a wet-looking rim reads as a dried drop of glue; a soft gradient does not
    const grd = gg.createRadialGradient(32, 32, 1, 32, 32, 31);
    grd.addColorStop(0, 'rgba(255,214,122,0.98)');
    grd.addColorStop(0.40, 'rgba(236,178,74,0.95)');
    grd.addColorStop(0.74, 'rgba(198,140,52,0.72)');
    grd.addColorStop(0.92, 'rgba(160,108,38,0.30)');
    grd.addColorStop(1, 'rgba(140,94,32,0)');
    gg.fillStyle = grd; gg.fillRect(0, 0, 64, 64);
    // a bright fleck where the lamp catches the hardened surface
    const sh = gg.createRadialGradient(24, 23, 0, 24, 23, 9);
    sh.addColorStop(0, 'rgba(255,246,214,0.85)'); sh.addColorStop(1, 'rgba(255,246,214,0)');
    gg.fillStyle = sh; gg.fillRect(10, 9, 30, 30);
    this.glue = new THREE.Mesh(
      new THREE.PlaneGeometry(0.105, 0.105),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
      }));
    this.glue.rotation.x = -Math.PI / 2;
    this.glue.visible = false;
    this.jar.add(this.glue);

    this._m4 = new THREE.Matrix4();
    this._e = new THREE.Euler();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._sc = new THREE.Vector3();
    this.kinScreen = [];   // for picking
  }

  cellToLocal(cx, cy, yOff = 0) {
    const N = this.sim.N;
    const x = (cx / (N - 1) - 0.5) * GR * 2;
    const z = (cy / (N - 1) - 0.5) * GR * 2;
    const i = this.sim.idx(cx, cy);
    const y = (this.sim.height[i] + Math.max(0, this.sim.water[i] * 0.4)) * YS + yOff;
    return [x, y, z];
  }

  // the lantern is the entire UI (Invariant 7), so both the walking path and
  // the one-who-stays path must light identically
  _paintLantern(id, n, x, y, z, sz, grow, st) {
    // somebody in the air is drawn where your hand is, well above the layout
    if (this.sim.held && this.sim.held.id === id) {
      const c = this.heldCell;
      if (c) {
        const N = this.sim.N;
        x = (c[0] / (N - 1) - 0.5) * GR * 2;
        z = (c[1] / (N - 1) - 0.5) * GR * 2;
      }
      y = (y || 0) + 0.16 + Math.sin(this.t * 2.1) * 0.006;   // held, and not steady
    }
    const s = this.sim, k = s.k;
    const pulse = 0.72 + 0.28 * Math.sin((this.t * k.pulse[id] + (this.phase ? this.phase[id] : k.phase[id])) * 6.28);
    const b = k.bright[id] * pulse;
    // ⚠️ the glow is the ANTENNA TIP now, not a lantern swallowing the figure.
    // It sits at the top of the stalk and is ~40% of its old size — the body
    // paint and the droop carry the rest of what the big glow used to say.
    // ⚠️ the palette remap happens HERE and nowhere else. k.hue is written by
    // sim code and round-trips through the save and the fingerprint, so a
    // colourblind palette must never touch it — two players on one seed have to
    // agree about their town even when they see it differently.
    this._col.setHSL(hueOf(k.hue[id]) / 360, st === STAGE.EGG ? 0.45 : 0.92, 0.22 + b * 0.34);
    const o = n * 3;
    this.lanternPos[o] = x; this.lanternPos[o + 1] = y + 0.0425 * sz; this.lanternPos[o + 2] = z;
    this.lanternCol[o] = this._col.r; this.lanternCol[o + 1] = this._col.g; this.lanternCol[o + 2] = this._col.b;
    this.lanternSize[n] = (0.028 + b * 0.048) * grow * (0.85 + (1 - s.daylight) * 0.50);
  }

  _paintKin() {
    const s = this.sim, k = s.k;
    let n = 0, glueSeen = false;
    for (let id = 0; id < s.count; id++) {
      if (!k.alive[id]) continue;
      // ⚠️ let, NOT const: the held branch below reassigns x/z to the hand's
      // cell. As a const this was a strict-mode TypeError the first time a kin
      // was carried over the board — the exact moment of the game's biggest
      // power, crashing the frame loop. Caught by the graphics review, not by
      // any test, because every headless test runs without a view.
      let [x, y, z] = this.cellToLocal(k.x[id], k.y[id], 0.012);
      const st = k.stage[id];
      const grow = st === STAGE.EGG ? 0.62 : st === STAGE.NIB ? 0.7 : st === STAGE.HALF ? 0.86 : 1;
      const sz = k.size[id] * grow;

      // gait: a squash-and-stretch bob. View-only, so Math.sin is fine here.
      const ph = this.t * (2.2 + k.pulse[id] * 0.5) + (this.phase ? this.phase[id] : k.phase[id]) * 6.28;
      const moving = Math.abs(k.tx[id] - k.x[id]) + Math.abs(k.ty[id] - k.y[id]) > 0.5 && st !== STAGE.EGG;
      const bob = moving ? Math.abs(Math.sin(ph)) : 0.5 + Math.sin(ph * 0.35) * 0.08;
      const sq = 1 + (moving ? Math.sin(ph * 2) * 0.16 : Math.sin(ph * 0.5) * 0.04);

      // body paint: the same hue the lantern used to carry, worn as PAINT.
      // Saturation drops and the whole figure dims as wellbeing falls, so the
      // colony still reads at a glance — a struggling quarter of town goes
      // grey-dim while the healthy stay vivid. Palette-remapped like the tip.
      const wb = k.bright[id];
      this._col.setHSL(hueOf(k.hue[id]) / 360,
        st === STAGE.EGG ? 0.10 : 0.30 + wb * 0.34,
        st === STAGE.EGG ? 0.62 : 0.26 + wb * 0.26);
      this.bodies.setColorAt(n, this._col);

      // posture: a failing kin DROOPS — pitched forward, sagging. This is the
      // distance read that replaces the dimming lantern, and it costs a pitch
      // term in the same quaternion the yaw already used.
      const droop = st === STAGE.EGG ? 0 : Math.max(0, 0.42 - wb) * 1.1;

      // the one who stays never bobs and never turns — they are stuck fast,
      // and the stillness is the tell before you ever open the inspector
      if (k.glued[id]) {
        this.glue.position.set(x, y - 0.010, z);
        this.glue.visible = true; glueSeen = true;
        this._v.set(x, y, z);
        this._sc.set(sz, sz, sz);
        this._e.set(droop, k.phase[id] * 6.28, 0, 'YXZ');
        this._q.setFromEuler(this._e);
        this._m4.compose(this._v, this._q, this._sc);
        this.bodies.setMatrixAt(n, this._m4);
        this.features.setMatrixAt(n, this._m4);
        this._paintLantern(id, n, x, y, z, sz, grow, st);
        this.kinScreen[n] = id; n++;
        continue;
      }

      // ⚠️ somebody in the air rides at the hand, and the BODY has to go with
      // the tip — before this only the glow lifted and the figure stayed on the
      // ground, which read as the hand stealing a soul instead of a person.
      let hy = 0;
      if (this.sim.held && this.sim.held.id === id) {
        const c = this.heldCell;
        if (c) { const N = this.sim.N;
          x = (c[0] / (N - 1) - 0.5) * GR * 2;
          z = (c[1] / (N - 1) - 0.5) * GR * 2; }
        hy = 0.16 + Math.sin(this.t * 2.1) * 0.006;
      }

      this._v.set(x, y + hy + (moving ? bob * 0.006 : 0), z);
      this._sc.set(sz / sq, sz * sq, sz / sq);
      const face = Math.atan2(k.tx[id] - k.x[id], k.ty[id] - k.y[id]);
      // a moving kin leans INTO the walk a little; a failing one sags the same
      // way, further — one axis, two readings, both honest
      const lean = droop + (moving ? 0.14 + Math.sin(ph * 2) * 0.05 : 0);
      this._e.set(lean, face, 0, 'YXZ');
      this._q.setFromEuler(this._e);
      this._m4.compose(this._v, this._q, this._sc);
      this.bodies.setMatrixAt(n, this._m4);
      // eggs are eggs — no eyes, no antenna. Scale the feature layer away.
      if (st === STAGE.EGG) {
        this._sc.set(0.0001, 0.0001, 0.0001);
        this._m4.compose(this._v, this._q, this._sc);
      }
      this.features.setMatrixAt(n, this._m4);

      this._paintLantern(id, n, x, y, z, sz, grow, st);
      this.kinScreen[n] = id;
      n++;
    }
    this.glue.visible = glueSeen;
    this.bodies.count = n;
    this.features.count = n;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.features.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    this.lanterns.geometry.setDrawRange(0, n);
    this.lanterns.geometry.attributes.position.needsUpdate = true;
    this.lanterns.geometry.attributes.color.needsUpdate = true;
    this.lanterns.geometry.attributes.psize.needsUpdate = true;
    this.kinCount = n;
  }

  // -- the graves ------------------------------------------------------------
  _graves() {
    const geo = new THREE.ConeGeometry(0.007, 0.026, 5);
    this.graveMesh = new THREE.InstancedMesh(geo,
      new THREE.MeshStandardMaterial({ color: 0xb6bcc4, roughness: 0.75 }), 900);
    this.graveMesh.count = 0;
    this.graveMesh.castShadow = true;
    this.graveMesh.frustumCulled = false;
    this.jar.add(this.graveMesh);
    this._graveN = 0;
  }
  _paintGraves() {
    const g = this.sim.graves;
    if (g.length === this._graveN) return;
    const n = Math.min(g.length, 900);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = this.cellToLocal(g[i].x, g[i].y, 0.010);
      this._v.set(x, y, z);
      this._q.set(0, 0, 0, 1);
      this._sc.set(1, 1, 1);
      this._m4.compose(this._v, this._q, this._sc);
      this.graveMesh.setMatrixAt(i, this._m4);
    }
    this.graveMesh.count = n;
    this.graveMesh.instanceMatrix.needsUpdate = true;
    this._graveN = g.length;
  }

  // -- the cover -------------------------------------------------------------
  _cover() {
    // Dad's plastic sheeting over the whole layout. Draped = the town is sealed
    // and its rain comes back; pulled off (L) = the open basement air drinks the
    // pond. The sim boolean is untouched — this is the jar's lid wearing its
    // new fiction.
    // ⚠️ This was an ADDITIVE hemisphere and it read as a floating ghost-wisp
    // over the hill, not as plastic over a table (captured, then fixed).
    // Additive light cannot look like a dusty translucent sheet. Normal
    // blending, a real sag, and it has to cover the BOARD, not just the scenery.
    const geo = new THREE.PlaneGeometry(BOARD * 2.12, BOARD * 2.12, 40, 40);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const u = x / (BOARD * 1.06), w = z / (BOARD * 1.06);    // -1..1 over the board
      const r = Math.sqrt(u * u + w * w);
      const tent = Math.max(0, 1 - r * 1.05) * 0.34;           // it tents over the scenery
      const droop = Math.min(0, (0.86 - r)) * 1.15;            // and hangs off the edges
      const crinkle = Math.sin(x * 8.3) * Math.cos(z * 10.9) * 0.014
                    + Math.sin(x * 21.7 + z * 17.3) * 0.005;   // plastic never drapes smooth
      pos.setY(i, tent + droop + crinkle);
    }
    geo.computeVertexNormals();
    // ⚠️⚠️ A FLAT-OPACITY SHEET FOGS THE ENTIRE GAME. At any opacity high enough
    // to see, a full-board plane greys everything under it — and this is a
    // BIRD'S EYE game, so the player looks through the whole thing at once. I
    // chased the ground palette twice before realising the wash was the cover.
    // The physical truth is the fix: clear polythene is invisible face-on and
    // only shows at glancing angles, on creases, and as a sheen. Fresnel does
    // exactly that, and the sheet stays a real object you can see is there.
    this.cover = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uTint: { value: new THREE.Color(0xdCEAF4) }, uAmt: { value: 0.30 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uTint; uniform float uAmt;
        varying vec3 vN; varying vec3 vV;
        void main() {
          float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float a = pow(fres, 3.4) * uAmt + 0.010;
          gl_FragColor = vec4(uTint * a, a);
        }`,
    }));
    this.cover.position.y = EDGE_Y + 0.03;
    this.jar.add(this.cover);
    // ⚠️ FIFTH SITE of the lid inversion — the initialiser, which the render
    // loop then eases AWAY from. Flipping `want` without flipping this made the
    // sheet start slid-off on a covered board and crawl back over it, which
    // looks exactly like a slow-loading asset rather than a bug.
    this.coverT = this.sim.lid ? 0 : 1;

    // their weather, visible: the haze that hangs over the town before rain
    this.fogMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xc6d8e8, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
    this.fogMesh.scale.set(GR * 0.99, 0.34, GR * 0.99);
    this.fogMesh.position.y = EDGE_Y;
    this.jar.add(this.fogMesh);
  }

  // Press the evidence into the scenery. Every touch stays. (§15.3)
  fingerprintAt(cx, cy) {
    const N = this.sim.N, g = this.fpGrid;
    const x0 = Math.max(0, Math.round(cx) - 3), x1 = Math.min(N - 1, Math.round(cx) + 3);
    const y0 = Math.max(0, Math.round(cy) - 3), y1 = Math.min(N - 1, Math.round(cy) + 3);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      const add = 0.20 * Math.exp(-(dx * dx + dy * dy) / 3.4);
      const i = y * N + x;
      g[i] = Math.min(1, g[i] + add);
    }
  }


  // -- THE CONTACT DISC ------------------------------------------------------
  // ⚠️ THIS IS THE TUTORIAL FOR THE WHOLE FINGER, and it works only because it
  // LEADS the simulation. The ground takes 4-8 seconds to accept heat (§3.1),
  // so without a readout a player holding still has no way to know the hand has
  // softened — they let go long before the kindness lands, and conclude the
  // finger only ever burns. The disc is drawn from the SAME r and e that were
  // just pushed into setHand, so it can never disagree with the kernel; it just
  // arrives first.
  //
  // ⚠️ It is parented to `jar`, not `scene` — the disc belongs to the board and
  // has to lift with it when the plywood comes off the sawhorses.
  _handDisc() {
    const SEG = 72;
    const g = new THREE.BufferGeometry();
    // a flat ring built directly in XZ. RingGeometry lives in XY, and laying it
    // down with a rotation makes per-vertex terrain height a nightmare to apply.
    const pos = new Float32Array(SEG * 2 * 3);
    const idx = [];
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      idx.push(i * 2, i * 2 + 1, j * 2 + 1, i * 2, j * 2 + 1, j * 2);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.handDisc = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0xffc98a, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.handDisc.renderOrder = 8;
    this.handDisc.frustumCulled = false;
    this.jar.add(this.handDisc);
    this._handWant = 0;          // opacity we are easing toward
    this._handSeg = SEG;
  }

  // The lanterns are repainted from k.hue every single frame, so a palette
  // change needs no invalidation — this exists so the settings code has one
  // honest place to call, and so a future cached-colour optimisation has an
  // obvious place to hook without hunting for callers.
  repaintLanterns() { this._paletteDirty = true; }

  // ⚠️ THE ONLY WARNING THERE IS. Taking somebody is irreversible and has no
  // confirm dialog, so the whole of the player's protection is that they can
  // SEE it coming: the ring tightens onto one figure and goes red over 900ms,
  // and letting go before it closes costs nothing.
  setReach(id, f, power) { this.reachId = id; this.reachF = f; this.reachPower = power || 'lift'; }

  // point the camera at where they actually live
  lookAtTown() {
    const s = this.sim, k = s.k;
    let cx = 0, cy = 0, n = 0;
    for (let i = 0; i < s.count; i++) if (k.alive[i]) { cx += k.x[i]; cy += k.y[i]; n++; }
    if (!n) return;
    cx /= n; cy /= n;
    const N = s.N;
    this.centerTo.set((cx / (N - 1) - 0.5) * GR * 2, 0.06, (cy / (N - 1) - 0.5) * GR * 2);
  }

  // — what dad dropped. One group of small crumbs; a gift shrinks as it is
  // eaten, so the board shows how much of it is left without a number anywhere.
  _giftView() {
    this.giftRoot = new THREE.Group();
    this.jar.add(this.giftRoot);
    this.giftGeo = new THREE.IcosahedronGeometry(0.016, 0);
    this.giftMat = new THREE.MeshStandardMaterial({ color: 0xd8bd86, roughness: 0.88 });
    this._giftMeshes = [];
  }

  _paintGifts() {
    const s = this.sim, N = s.N, g = s.gifts || [];
    while (this._giftMeshes.length < g.length) {
      const m = new THREE.Mesh(this.giftGeo, this.giftMat);
      m.castShadow = true; m.receiveShadow = true;
      this.giftRoot.add(m); this._giftMeshes.push(m);
    }
    for (let i = 0; i < this._giftMeshes.length; i++) {
      const m = this._giftMeshes[i], gf = g[i];
      if (!gf) { m.visible = false; continue; }
      m.visible = true;
      const wx = (gf.x / (N - 1) - 0.5) * GR * 2;
      const wz = (gf.y / (N - 1) - 0.5) * GR * 2;
      m.position.set(wx, this._surfaceY(gf.x, gf.y) + 0.008, wz);
      // ⚠️ cube-rooted, not linear: a crumb at half mass should still look like
      // a crumb, and mass is a volume. Linear scaling made it vanish long
      // before it ran out, so the board lied about how much was left.
      const k = Math.max(0.25, Math.cbrt(Math.max(0.001, gf.mass)));
      m.scale.setScalar(k);
      m.rotation.set(gf.x * 0.7, gf.y * 1.3, gf.x * 0.4);
    }
  }
  setHeldAt(cell) { this.heldCell = cell; }

  // cx, cy in cells; r in cells; e is 0 (hot and narrow) … 1 (resting and wide)
  setHandDisc(cx, cy, r, e) {
    if (!this.handDisc) return;
    if (cx == null) { this._handWant = 0; return; }
    this._handWant = 1;
    const N = this.sim.N, SEG = this._handSeg;
    const pos = this.handDisc.geometry.attributes.position;
    const cell2w = (GR * 2) / (N - 1);
    const wx0 = (cx / (N - 1) - 0.5) * GR * 2;
    const wz0 = (cy / (N - 1) - 0.5) * GR * 2;
    const rw = r * cell2w;
    // the band is thin when the hand is hot and hard, and soft when it is resting
    const band = rw * (0.06 + 0.16 * e);
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      for (let k = 0; k < 2; k++) {
        const rr = k === 0 ? rw - band : rw + band;
        const wx = wx0 + ca * rr, wz = wz0 + sa * rr;
        // ⚠️ ride the terrain. A level ring over hills either buries itself in a
        // slope or floats off one — the same trap the track ring hit.
        const gx = (wx / (GR * 2) + 0.5) * (N - 1);
        const gy = (wz / (GR * 2) + 0.5) * (N - 1);
        pos.setXYZ(i * 2 + k, wx, this._surfaceY(gx, gy) + 0.004, wz);
      }
    }
    pos.needsUpdate = true;
    // amber and open when resting; a small white-hot coal when it is not
    this.handDisc.material.color.setHSL(
      (0.055 + 0.020 * e), 0.55 + 0.35 * (1 - e), 0.52 + 0.16 * (1 - e));
  }

  // -- dust in the light -----------------------------------------------------
  _dust() {
    const n = 260;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    this.dustSeed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.dustSeed[i * 3] = Math.random() * 6.28;
      this.dustSeed[i * 3 + 1] = 0.2 + Math.random() * 2.4;
      this.dustSeed[i * 3 + 2] = Math.random() * 6.28;
      p[i * 3] = (Math.random() - 0.5) * 5;
      p[i * 3 + 1] = Math.random() * 2.6;
      p[i * 3 + 2] = (Math.random() - 0.5) * 3;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const dc = document.createElement('canvas'); dc.width = dc.height = 32;
    const dg = dc.getContext('2d');
    const dr = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
    dr.addColorStop(0, 'rgba(255,240,214,1)'); dr.addColorStop(0.45, 'rgba(255,236,204,0.35)');
    dr.addColorStop(1, 'rgba(255,230,190,0)');
    dg.fillStyle = dr; dg.fillRect(0, 0, 32, 32);
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.016, color: 0xffeccc, transparent: true, opacity: 0.34,
      map: new THREE.CanvasTexture(dc),
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.dust);
  }

  // -- frame -----------------------------------------------------------------
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.post) this.post.setSize(Math.max(2, w | 0), Math.max(2, h | 0));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt) {
    const s = this.sim;
    this.t += dt;

    // camera easing
    const o = this.orbit;
    o.az += (o.tAz - o.az) * Math.min(1, dt * 9);
    o.el += (o.tEl - o.el) * Math.min(1, dt * 9);
    o.dist += (o.tDist - o.dist) * Math.min(1, dt * 7);
    const cy = Math.cos(o.el), sy = Math.sin(o.el);
    // ⚠️ the elevation floor is load-bearing: it is the only thing keeping the
    // horizon — and therefore whatever is beyond the board — out of frame.
    o.el = Math.max(EL_MIN, Math.min(EL_MAX, o.el));
    // ⚠️ the eye and the target move TOGETHER. Shifting only lookAt swings the
    // camera round and skews the board instead of panning across it.
    // ⚠️ RE-AIMED ON A SLOW CADENCE, not once at startup. A town migrates — it
    // follows the moss, the water and whatever you warmed — so a target fixed at
    // entry drifts off it within days and you are back to watching empty board.
    // Slow on purpose: this is the LOOK target, not the orbit, so the player
    // still owns the camera and this only keeps the crowd in frame.
    if ((this._aimT = (this._aimT || 0) + dt) > 2) { this._aimT = 0; this.lookAtTown(); }
    this.center.lerp(this.centerTo, Math.min(1, dt * 0.8));
    this.camera.position.set(
      this.center.x + Math.sin(o.az) * cy * o.dist,
      sy * o.dist + 0.10,
      this.center.z + Math.cos(o.az) * cy * o.dist
    );
    this.camera.lookAt(this.center.x, 0.06, this.center.z);

    // — THE REACH RING. Drawn from the same disc as the hand, so the player is
    // never looking at two different vocabularies for what their finger is doing.
    // It closes ONTO one figure and goes red, which is the only notice anybody
    // gets before an irreversible act. 900ms is long enough to change your mind
    // and short enough not to feel like a menu.
    if (this.reachF > 0 && this.reachId >= 0 && s.k.alive[this.reachId]) {
      const id = this.reachId, f = this.reachF;
      const r = 9 * S * (1 - f * 0.72) + 1.4 * S;      // tightening onto them
      this.setHandDisc(s.k.x[id], s.k.y[id], r, 0);
      this._handWant = 1;
      // the ring wears the power's colour, so what is about to happen is legible
      // before it happens: green mends, red strikes, grey-amber stills, and the
      // lift keeps its amber-to-red warning.
      const P = this.reachPower;
      if (P === 'mend') this.handDisc.material.color.setHSL(0.38, 0.55, 0.52 + f * 0.12);
      else if (P === 'strike') this.handDisc.material.color.setHSL(0.995, 0.72 + f * 0.2, 0.44 + f * 0.10);
      else if (P === 'still') this.handDisc.material.color.setHSL(0.10, 0.35, 0.45 + f * 0.10);
      else this.handDisc.material.color.setHSL(0.055 * (1 - f), 0.62 + 0.34 * f, 0.50 + 0.12 * f);
    }

    if (this.handDisc) {
      const m = this.handDisc.material;
      // in fast, out slow — a hand leaves a moment of afterglow, and a hard cut
      // reads as a bug rather than as letting go
      const want = this._handWant * (0.30 + 0.26 * Math.sin(this.t * 4.2));
      m.opacity += (want - m.opacity) * Math.min(1, dt * (this._handWant ? 14 : 4));
      this.handDisc.visible = m.opacity > 0.004;
    }

    // lifting one edge of the board off the sawhorses
    this.jar.rotation.z = -s.tilt.x * 2.6;
    this.jar.rotation.x = s.tilt.y * 2.6;

    this._tickPhases(dt);
    this._paintSky();
    this._paintGround();
    this._paintWater();
    this._paintKin();
    this._paintGraves();
    // the bulb warming up, rather than a cut to daylight
    if (this.titleDim !== this.titleTo) {
      this.titleDim += (this.titleTo - this.titleDim) * Math.min(1, dt * 1.6);
      if (Math.abs(this.titleDim - this.titleTo) < 0.002) this.titleDim = this.titleTo;
    }

    this._paintWorks();
    if (this._giftMeshes) this._paintGifts();

    // the sheet slides off the board and slumps beside the track
    // ⚠⚠ THE COVER WAS DRAWN BACKWARDS TOO. ct === 1 slides the sheet OFF the
    // board (see the position/scale below), and this asked for ct = 1 when
    // `lid` was TRUE — but lid true means the sheet is ON. This is the fourth
    // site of one inversion: the heat term, the vapour term, the narrator beat
    // and now the thing you can actually see. They were consistent with each
    // other and all four disagreed with the button and the help card.
    const want = s.lid ? 0 : 1;
    this.coverT += (want - this.coverT) * Math.min(1, dt * 3.4);
    const ct = this.coverT;
    // pulled off, the sheet slides clear of the board and crumples beside it —
    // it does not vanish. Dad will notice it moved.
    this.cover.position.set(ct * BOARD * 2.1, EDGE_Y + 0.03 - ct * 0.34, ct * 0.16);
    this.cover.rotation.z = -ct * 0.40;
    this.cover.scale.set(1 - ct * 0.42, 1 - ct * 0.60, 1 - ct * 0.10);
    this.fogMesh.material.opacity =
      // ⚠️ MEASURED: this was costing 55% OF THE BOARD'S SATURATION (0.182 vs
      // 0.282 with it hidden) — a white dome over a bird's-eye game desaturates
      // absolutely everything under it, which is the whole picture. It should
      // read as weather ARRIVING in the last stretch before rain, not as a
      // permanent veil. Late ramp, hard cap, and cooler so it tints rather
      // than bleaches.
      Math.min(0.042, Math.max(0, s.humid / (S * S) - 9.5) * 0.011 + s.fog * 0.16) * (1 - ct * 0.5);

    // dust drifts through the shaft
    const dp = this.dust.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const a = this.dustSeed[i * 3], sp = this.dustSeed[i * 3 + 1], b = this.dustSeed[i * 3 + 2];
      dp.setX(i, Math.sin(this.t * 0.06 * sp + a) * 2.4);
      dp.setY(i, ((this.dustSeed[i * 3 + 1] * 0.7 + this.t * 0.021) % 2.6));
      dp.setZ(i, Math.cos(this.t * 0.05 * sp + b) * 1.4);
    }
    dp.needsUpdate = true;
    this.dust.material.opacity = 0.06 + s.daylight * 0.4;

    // ⚠️ FOCUS FOLLOWS THE TOWN. A fixed band at screen centre put the crowd —
    // the entire subject, and the entire UI — in the defocused zone, because
    // the town wanders and the camera does not. Project the living centroid and
    // put the sharp band on it. Smoothed hard: a focus that snaps every frame
    // reads as a camera fault. (Age of Toys learned the same lesson about
    // pointing a camera at a raw centroid — never feed one to anything直接.)
    if (this.post.ok) {
      const s2 = this.sim, k2 = s2.k;
      let cx = 0, cy = 0, cz = 0, n2 = 0;
      for (let id = 0; id < s2.count; id++) {
        if (!k2.alive[id]) continue;
        const p2 = this.cellToLocal(k2.x[id], k2.y[id], 0);
        cx += p2[0]; cy += p2[1]; cz += p2[2]; n2++;
      }
      if (n2) {
        this._foc.set(cx / n2, cy / n2, cz / n2);
        this.jar.localToWorld(this._foc);
        this._foc.project(this.camera);
        const want = Math.max(0.18, Math.min(0.82, this._foc.y * 0.5 + 0.5));
        this.focusY += (want - this.focusY) * Math.min(1, dt * 1.1);
        this.post.p.bandCenter = this.focusY;
      }
    }
    if (this.post.enabled === false) this.postOn = false;
    else if (this.post.enabled === true) this.postOn = true;
    if (this.postOn !== false && this.post.ok) this.post.render(this.scene, this.camera);
    else { this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.camera); }
  }

  // -- picking ---------------------------------------------------------------
  // Returns { cell:[x,y], world:Vector3 } for a screen position, or null.
  pickGround(nx, ny) {
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    const hit = this.raycaster.intersectObject(this.pickMesh, false)[0];
    if (!hit) return null;
    const p = this.jar.worldToLocal(hit.point.clone());
    const N = this.sim.N;
    const cx = (p.x / (GR * 2) + 0.5) * (N - 1);
    const cy = (p.z / (GR * 2) + 0.5) * (N - 1);
    if (cx < 0 || cy < 0 || cx > N - 1 || cy > N - 1) return null;
    return { cell: [cx, cy], world: hit.point };
  }

  // Nearest kin to a screen position, within a radius, or -1.
  pickKin(nx, ny) {
    const cam = this.camera;
    let best = -1, bd = 0.05;
    const v = new THREE.Vector3();
    for (let n = 0; n < this.kinCount; n++) {
      const id = this.kinScreen[n];
      v.set(this.lanternPos[n * 3], this.lanternPos[n * 3 + 1], this.lanternPos[n * 3 + 2]);
      this.jar.localToWorld(v);
      v.project(cam);
      if (v.z > 1) continue;
      const d = Math.hypot(v.x - nx, v.y - ny);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
}
