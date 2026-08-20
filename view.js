// DON'T TOUCH — view.js
// Rendering only. Reads the sim, never writes it. (Invariant 2)
// Art direction: a lamplit miniature layout seen from above. The scenery fills
// the board edge to edge and the real world is never in frame — the tabletop
// framing belongs to THE ROOM hub. Shape plus lantern glow. (bible §15, pivoted)

import * as THREE from './lib/three.module.js';
import { STAGE, NEEDS, LANTERN_HUE, LOCI, L, expressed, S, C } from './sim.js';

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
const RT = GR * 0.93;   // the track loop, outside the walkable circle (0.855·GR·2/1.88)

export class View {
  constructor(canvas, sim) {
    this.sim = sim;
    this.canvas = canvas;
    this.t = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor(0x0a0c10, 1);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

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
    this.hemi = new THREE.HemisphereLight(0x9fb4d6, 0x2a2318, 0.62);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffeccb, 1.05);
    this.key.position.set(1.15, 2.30, 0.75);
    this.scene.add(this.key);
    this.scene.add(this.key.target);
    // a low cold counter-light so the far slopes read instead of going solid
    this.fill = new THREE.DirectionalLight(0x9ec4ff, 0.30);
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
    this.hemi.intensity = 0.10 + d * 0.34;
    this.key.intensity = 0.14 + d * 0.62;
    this.fill.intensity = 0.06 + d * 0.15;
    this.key.color.setRGB(1, 0.92 - d * 0.02, 0.78 + d * 0.04);
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

  // -- what the town has made ------------------------------------------------
  // ⚠️ GLASSBOX: the thing on the board IS the agent's activity, never an
  // illustration of it. A work rises out of the ground as its `prog` rises, so
  // watching a half-built store is watching somebody actually building it.
  _works() {
    this.workViews = new Map();      // work object -> Group
    this.workRoot = new THREE.Group();
    this.jar.add(this.workRoot);
    this.workMats = {
      heap: new THREE.MeshStandardMaterial({ color: 0x6d5a33, roughness: 0.95 }),
      stack: new THREE.MeshStandardMaterial({ color: 0x4a6a2e, roughness: 0.9 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x585048, roughness: 0.95 }),
      cut: new THREE.MeshStandardMaterial({ color: 0x3c2f1f, roughness: 1 }),
    };
  }

  _buildWorkView(o) {
    const M = this.workMats, g = new THREE.Group();
    // a view-local stream so a work looks the same every time it is drawn
    let sd = ((o.x * 7349) ^ (o.y * 5741) ^ (o.kind * 977)) >>> 0;
    const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };

    if (o.kind === 0) {                                  // the store
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.050, 0.012, 9), M.heap);
      base.position.y = 0.006; g.add(base);
      for (let i = 0; i < 7; i++) {
        const r = 0.010 + rnd() * 0.009;
        const d = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), M.stack);
        const a = rnd() * 6.283, rr = rnd() * 0.026;
        d.position.set(Math.cos(a) * rr, 0.012 + r * 0.7, Math.sin(a) * rr);
        d.scale.y = 0.72; g.add(d);
      }
    } else if (o.kind === 1) {                           // the windbreak
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1) - 0.5) * 0.135;
        const h = 0.030 + rnd() * 0.016;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.020, h, 0.016), M.stone);
        b.position.set(t, h / 2, Math.abs(t) * 0.34);    // a shallow crescent
        b.rotation.y = (rnd() - 0.5) * 0.5;
        b.rotation.z = (rnd() - 0.5) * 0.16;
        g.add(b);
      }
    } else {                                             // the channel
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
    }
    g.rotation.y = rnd() * 6.283;
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
    rails.forEach(m => { m.instanceMatrix.needsUpdate = true; this.jar.add(m); });
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

    // snap-together houses ring the hearth — the town the kin woke up in.
    // The kin walk straight through them; at this scale nobody minds yet.
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
      put(house, x, y);
      homes++;
    }

    // bottle-brush trees
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1 });
    const greens = [0x174023, 0x1d4d2b, 0x25573a];
    let trees = 0; tries = 0;
    while (trees < 80 && tries++ < 1600) {
      const x = (2 + rnd() * (N - 4)) | 0, y = (2 + rnd() * (N - 4)) | 0;
      if (!ok(x, y, 0.05, 1.8 * S)) continue;
      // ⚠️ ONE CONE IS A PARTY HAT. A bottle-brush tree is layered skirts of
      // needles on a visible trunk, and it has to be tall enough to matter
      // beside a 4mm figure — the old 0.040 cones read as scrub.
      const th = 0.058 + rnd() * 0.062;
      const tree = new THREE.Group();
      const needle = new THREE.MeshStandardMaterial({ color: greens[(rnd() * 3) | 0], roughness: 0.93 });
      const tiers = 3 + ((rnd() * 2) | 0);
      for (let t = 0; t < tiers; t++) {
        const f2 = t / tiers;
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(th * (0.38 - f2 * 0.20), th * (0.52 - f2 * 0.16), 7), needle);
        cone.position.y = 0.010 + th * (0.16 + f2 * 0.62);
        cone.rotation.y = rnd() * 6.283;
        tree.add(cone);
      }
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0052, 0.020, 5), trunkM);
      trunk.position.y = 0.009; tree.add(trunk);
      put(tree, x, y);
      trees++;
    }
  }

  _paintGround() {
    // ⚠️ THIS WRITES ALBEDO, NOT A LIT PIXEL. It used to bake a fake
    // height-gradient shade and the daylight level straight into the colour,
    // which was right for an unlit MeshBasicMaterial and doubles up the moment
    // real lights exist — the board went to mud. The renderer does the light.
    const s = this.sim, N = s.N, d = this.groundData;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const m = s.moss[i], w = s.water[i], T = s.temp[i], q = s.moist[i];
        // ⚠️ THE RAMP IS sqrt(m), NOT m. Linear blending made the whole middle
        // of the board olive: 93% of cells are mossy but the inner ring sits at
        // 0.19, and 0.19 of a green mixed linearly into brown is mud. Thin
        // ground foam over soil still READS as grass, so the colour has to get
        // there faster than the quantity does.
        const mm = Math.sqrt(m);
        let r = 88 - q * 40, g = 68 - q * 32, b = 46 - q * 22;   // painted dirt
        r = r * (1 - mm) + (54 + m * 20) * mm;
        g = g * (1 - mm) + (98 + m * 44) * mm;
        b = b * (1 - mm) + (40 + m * 16) * mm;
        // grey ballast under dad's track, painted rather than modelled
        const bl = this.ballast[i];
        if (bl > 0.01) { const t2 = bl * 0.85; r = r * (1 - t2) + 118 * t2; g = g * (1 - t2) + 112 * t2; b = b * (1 - t2) + 104 * t2; }
        // wet grass is dark grass — moisture used to tint only the bare soil
        if (q > 0.25) { const wetf = 1 - Math.min(0.34, (q - 0.25) * 0.55); r *= wetf; g *= wetf; b *= wetf; }
        // the evidence: flocking pressed flat where a finger has been
        const fpv = this.fpGrid[i];
        if (fpv > 0.004) {
          const pr = Math.min(0.55, fpv);
          r = r * (1 - pr) + 84 * pr; g = g * (1 - pr) + 74 * pr; b = b * (1 - pr) + 60 * pr;
        }
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
    this.water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: this.waterTex, transparent: true, depthWrite: false,
      roughness: 0.16, metalness: 0.06,
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
      const a = w <= 0.007 ? 0 : Math.min(0.90, (w - 0.007) * 11);
      const dark = Math.min(1, w * 6);
      d[o] = (96 - dark * 48) | 0;
      d[o + 1] = (140 - dark * 60) | 0;
      d[o + 2] = (168 - dark * 44) | 0;
      d[o + 3] = (a * 255) | 0;
    }
    pos.needsUpdate = true;
    this.waterTex.needsUpdate = true;
  }

  // -- the kin ---------------------------------------------------------------
  _kin() {
    const CAP = this.sim.k.alive.length;
    // body: one low-poly blob, instanced, silhouette-dark. One draw call.
    const body = new THREE.IcosahedronGeometry(0.0125, 1);
    body.scale(1.05, 1.3, 0.86);
    this.bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.55 }), CAP);
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodies.count = 0;
    this.bodies.frustumCulled = false;
    this.jar.add(this.bodies);

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
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._sc = new THREE.Vector3();
    this._col = new THREE.Color();
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
    const s = this.sim, k = s.k;
    const pulse = 0.72 + 0.28 * Math.sin(this.t * k.pulse[id] * 6.28);
    const b = k.bright[id] * pulse;
    this._col.setHSL(k.hue[id] / 360, st === STAGE.EGG ? 0.45 : 0.92, 0.22 + b * 0.34);
    const o = n * 3;
    this.lanternPos[o] = x; this.lanternPos[o + 1] = y + 0.024 * sz; this.lanternPos[o + 2] = z;
    this.lanternCol[o] = this._col.r; this.lanternCol[o + 1] = this._col.g; this.lanternCol[o + 2] = this._col.b;
    this.lanternSize[n] = (0.070 + b * 0.115) * grow * (0.80 + (1 - s.daylight) * 0.55);
  }

  _paintKin() {
    const s = this.sim, k = s.k;
    let n = 0, glueSeen = false;
    for (let id = 0; id < s.count; id++) {
      if (!k.alive[id]) continue;
      const [x, y, z] = this.cellToLocal(k.x[id], k.y[id], 0.012);
      const st = k.stage[id];
      const grow = st === STAGE.EGG ? 0.62 : st === STAGE.NIB ? 0.7 : st === STAGE.HALF ? 0.86 : 1;
      const sz = k.size[id] * grow;

      // gait: a squash-and-stretch bob. View-only, so Math.sin is fine here.
      const ph = this.t * (2.2 + k.pulse[id] * 0.5) + k.phase[id] * 6.28;
      const moving = Math.abs(k.tx[id] - k.x[id]) + Math.abs(k.ty[id] - k.y[id]) > 0.5 && st !== STAGE.EGG;
      const bob = moving ? Math.abs(Math.sin(ph)) : 0.5 + Math.sin(ph * 0.35) * 0.08;
      const sq = 1 + (moving ? Math.sin(ph * 2) * 0.16 : Math.sin(ph * 0.5) * 0.04);

      // the one who stays never bobs and never turns — they are stuck fast,
      // and the stillness is the tell before you ever open the inspector
      if (k.glued[id]) {
        this.glue.position.set(x, y - 0.010, z);
        this.glue.visible = true; glueSeen = true;
        this._v.set(x, y, z);
        this._sc.set(sz, sz, sz);
        this._q.setFromAxisAngle({ x: 0, y: 1, z: 0 }, k.phase[id] * 6.28);
        this._m4.compose(this._v, this._q, this._sc);
        this.bodies.setMatrixAt(n, this._m4);
        this._paintLantern(id, n, x, y, z, sz, grow, st);
        this.kinScreen[n] = id; n++;
        continue;
      }

      this._v.set(x, y + (moving ? bob * 0.006 : 0), z);
      this._sc.set(sz / sq, sz * sq, sz / sq);
      const face = Math.atan2(k.tx[id] - k.x[id], k.ty[id] - k.y[id]);
      this._q.setFromAxisAngle({ x: 0, y: 1, z: 0 }, face);
      this._m4.compose(this._v, this._q, this._sc);
      this.bodies.setMatrixAt(n, this._m4);

      this._paintLantern(id, n, x, y, z, sz, grow, st);
      this.kinScreen[n] = id;
      n++;
    }
    this.glue.visible = glueSeen;
    this.bodies.count = n;
    this.bodies.instanceMatrix.needsUpdate = true;
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
    this.cover = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xd8e2ea, transparent: true, opacity: 0.15,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    this.cover.position.y = EDGE_Y + 0.03;
    this.jar.add(this.cover);
    this.coverT = this.sim.lid ? 1 : 0;

    // their weather, visible: the haze that hangs over the town before rain
    this.fogMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xdff0ff, transparent: true, opacity: 0,
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
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.012, color: 0xffeccc, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.dust);
  }

  // -- frame -----------------------------------------------------------------
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
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
    this.camera.position.set(
      Math.sin(o.az) * cy * o.dist,
      sy * o.dist + 0.10,
      Math.cos(o.az) * cy * o.dist
    );
    this.camera.lookAt(0, 0.06, 0);

    // lifting one edge of the board off the sawhorses
    this.jar.rotation.z = -s.tilt.x * 2.6;
    this.jar.rotation.x = s.tilt.y * 2.6;

    this._paintSky();
    this._paintGround();
    this._paintWater();
    this._paintKin();
    this._paintGraves();
    this._paintWorks();

    // the sheet slides off the board and slumps beside the track
    const want = s.lid ? 1 : 0;
    this.coverT += (want - this.coverT) * Math.min(1, dt * 3.4);
    const ct = this.coverT;
    // pulled off, the sheet slides clear of the board and crumples beside it —
    // it does not vanish. Dad will notice it moved.
    this.cover.position.set(ct * BOARD * 2.1, EDGE_Y + 0.03 - ct * 0.34, ct * 0.16);
    this.cover.rotation.z = -ct * 0.40;
    this.cover.scale.set(1 - ct * 0.42, 1 - ct * 0.60, 1 - ct * 0.10);
    this.fogMesh.material.opacity =
      Math.min(0.30, Math.max(0, s.humid / (S * S) - 5) * 0.018 + s.fog * 0.24) * (1 - ct * 0.5);

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

    this.renderer.render(this.scene, this.camera);
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
