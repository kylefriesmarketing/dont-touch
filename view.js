// DON'T TOUCH — view.js
// Rendering only. Reads the sim, never writes it. (Invariant 2)
// Art direction: a lamplit layout in a dark basement. One bare bulb over dad's
// plywood table; the town reads as shape plus lantern glow. (bible §15, pivoted)

import * as THREE from './lib/three.module.js';
import { STAGE, NEEDS, LANTERN_HUE, LOCI, L, expressed } from './sim.js';

const R = 1.0;          // jar radius
const JH = 1.05;        // jar height (there must be AIR above the landscape)
const GR = R * 0.94;    // ground radius
const YS = 0.38;        // vertical scale of the heightfield
const BASE = -0.155;     // the jar's floor. Everything is measured from here.
const EDGE_Y = 0.035;   // the lip where the soil column meets the terrain
const TW = 4.6;         // dad's plywood: a 4×8 sheet at world scale (2:1)
const TD = 2.3;

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
    this.orbit = { az: 0.6, el: 0.46, dist: 3.6, tAz: 0.6, tEl: 0.46, tDist: 3.6 };
    // 'jar' by history: this group is THE BOARD — everything that lifts
    // together when you tilt one edge of the plywood off the sawhorses.
    this.jar = new THREE.Group();
    this.scene.add(this.jar);

    this._room();
    this._ground();
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

  // -- the basement around the table ----------------------------------------
  _room() {
    // the window well: a half-window at grade, the only daylight that gets
    // down here. Painted into a tiny gradient canvas every frame.
    const c = document.createElement('canvas'); c.width = 8; c.height = 256;
    const g = c.getContext('2d');
    this.skyCtx = g; this.skyCanvas = c;
    this.skyTex = new THREE.CanvasTexture(c);

    // the back wall
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 24),
      new THREE.MeshBasicMaterial({ color: 0x080a0e })
    );
    wall.position.set(0, 3, -3.02);
    this.scene.add(wall);
    this.wallMat = wall.material;

    // the half-window, high on the wall
    this.sky = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 0.92),
      new THREE.MeshBasicMaterial({ map: this.skyTex, depthWrite: false })
    );
    this.sky.position.set(-1.3, 2.5, -3.0);
    this.scene.add(this.sky);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1.0),
      new THREE.MeshBasicMaterial({ color: 0x0b0d12 }));
    bar.position.set(-1.3, 2.5, -2.98); this.scene.add(bar);
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(2.52, 1.12),
      new THREE.MeshBasicMaterial({ color: 0x11141a })
    );
    frame.position.set(-1.3, 2.5, -3.01); this.scene.add(frame);

    // bare concrete
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 30),
      new THREE.MeshBasicMaterial({ color: 0x0b0c10 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = BASE - 0.64;
    this.scene.add(floor);
    this.floorMat = floor.material;

    // the table's shadow pooled on it
    const shTex = (() => {
      const c2 = document.createElement('canvas'); c2.width = c2.height = 128;
      const g2 = c2.getContext('2d');
      const r2 = g2.createRadialGradient(64, 64, 6, 64, 64, 64);
      r2.addColorStop(0, 'rgba(0,0,0,0.75)'); r2.addColorStop(1, 'rgba(0,0,0,0)');
      g2.fillStyle = r2; g2.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c2);
    })();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.2),
      new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, BASE - 0.635, 0.1);
    this.scene.add(shadow);

    // sawhorses. The board only RESTS on them — a tilt lifts it clean off.
    const wood = new THREE.MeshBasicMaterial({ color: 0x191510 });
    for (const hx of [-1.55, 1.55]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.08, TD * 0.96), wood);
      beam.position.set(hx, BASE - 0.095, 0);
      this.scene.add(beam);
      for (const hz of [-TD * 0.40, TD * 0.40]) for (const lean of [-0.3, 0.3]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.56, 0.05), wood);
        leg.position.set(hx + lean * 0.28, BASE - 0.40, hz);
        leg.rotation.z = lean;
        this.scene.add(leg);
      }
    }

    // the bulb on its cord — the town's sun when the window gives up
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.6),
      new THREE.MeshBasicMaterial({ color: 0x04050a }));
    cord.position.set(0.55, 2.85, 0.3); this.scene.add(cord);
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x2a2a2e }));
    this.bulb.position.set(0.55, 2.05, 0.3); this.scene.add(this.bulb);

    const glowTex = (() => {
      const c3 = document.createElement('canvas'); c3.width = c3.height = 128;
      const g3 = c3.getContext('2d');
      const r3 = g3.createRadialGradient(64, 64, 2, 64, 64, 64);
      r3.addColorStop(0, 'rgba(255,236,190,0.9)');
      r3.addColorStop(0.25, 'rgba(255,220,160,0.28)');
      r3.addColorStop(1, 'rgba(255,210,140,0)');
      g3.fillStyle = r3; g3.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c3);
    })();
    this.bulbGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.bulbGlow.scale.set(1.3, 1.3, 1);
    this.bulbGlow.position.copy(this.bulb.position);
    this.scene.add(this.bulbGlow);

    // the cone of light down onto the table
    this.shaft = new THREE.Mesh(
      new THREE.ConeGeometry(2.0, 2.2, 40, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe9c4, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      }));
    this.shaft.position.set(0.55, 0.95, 0.3);
    this.scene.add(this.shaft);
  }

  _paintSky() {
    const s = this.sim, g = this.skyCtx;
    // the sun through the window well. Subtract the bulb's floor so the window
    // goes properly dark at night even while the light is on.
    const sun = (s.lampOn && s.daylight <= 0.221) ? 0 : s.daylight;
    // seasonal colour: cold blue in winter, amber in summer (§11.4)
    const season = s.season != null ? s.season : 0.5;
    const warm = 0.25 + season * 0.75;
    const top = [
      16 + sun * (95 + warm * 150),
      19 + sun * (108 + warm * 135),
      30 + sun * (140 + warm * 55),
    ];
    const bot = [
      22 + sun * (185 + warm * 70),
      22 + sun * (172 + warm * 72),
      32 + sun * (150 + warm * 30),
    ];
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `rgb(${top.map(v => v | 0).join(',')})`);
    grad.addColorStop(0.62, `rgb(${bot.map(v => v | 0).join(',')})`);
    grad.addColorStop(1, `rgb(${bot.map(v => (v * 0.35) | 0).join(',')})`);
    g.fillStyle = grad; g.fillRect(0, 0, 8, 256);
    this.skyTex.needsUpdate = true;

    // room ambience: s.daylight already blends window and bulb
    const d = s.daylight;
    const amb = 0.07 + d * 0.26;
    this.floorMat.color.setRGB(amb * 0.62, amb * 0.60, amb * 0.66);
    this.wallMat.color.setRGB(amb * 0.34, amb * 0.34, amb * 0.42);
    this.boardMat.color.setScalar(0.30 + d * 0.72);

    // the bulb itself
    const on = s.lampOn ? 1 : 0;
    this.bulb.material.color.setHex(on ? 0xffe9b8 : 0x2a2a2e);
    this.bulbGlow.material.opacity = on * (0.62 + Math.sin(this.t * 11.3) * 0.03);
    this.shaft.material.opacity = on * 0.075 + sun * 0.012;
  }

  // -- the ground ------------------------------------------------------------
  _ground() {
    const N = this.sim.N;
    const geo = new THREE.PlaneGeometry(GR * 2, GR * 2, N - 1, N - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const EDGE_R = 0.455, FADE = 0.07;
    for (let i = 0; i < pos.count; i++) {
      const x = i % N, y = (i / N) | 0;
      const dx = x / (N - 1) - 0.5, dy = y / (N - 1) - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      // ease the rim down to a flat lip so the soil column meets it cleanly
      const t = Math.max(0, Math.min(1, (r - (EDGE_R - FADE)) / FADE));
      const h = this.sim.height[y * N + x] * YS;
      pos.setY(i, h * (1 - t) + EDGE_Y * t);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // circular mask, computed once
    this.mask = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x / (N - 1) - 0.5, dy = y / (N - 1) - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = 1 - Math.max(0, Math.min(1, (r - 0.442) / 0.016));
      this.mask[y * N + x] = (a * 255) | 0;
    }
    this.groundData = new Uint8Array(N * N * 4);
    this.groundTex = new THREE.DataTexture(this.groundData, N, N, THREE.RGBAFormat);
    this.groundTex.needsUpdate = true;
    this.groundTex.minFilter = THREE.LinearFilter;
    this.groundTex.magFilter = THREE.LinearFilter;

    this.ground = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: this.groundTex, transparent: true, alphaTest: 0.5,
    }));
    this.jar.add(this.ground);

    // The sculpted scenery shell — plaster over screen wire, painted dirt.
    // ⚠️ This was a straight cylinder and the whole layout read as A GREEN CAKE
    // IN A TIN (captured, then fixed): a vertical wall around a disc is exactly
    // what a jar looks like, which is the fiction we left behind. It flares out
    // to meet the plywood now, the way a real embankment is built up off a board.
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(GR * 0.916, GR * 1.055, EDGE_Y - BASE, 72, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x6b5537, side: THREE.DoubleSide })
    );
    skirt.position.y = (BASE + EDGE_Y) / 2;
    this.jar.add(skirt);
    // a rim ring hides the seam where the cropped heightfield meets the shell
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(GR * 0.872, GR * 0.918, 72),
      new THREE.MeshBasicMaterial({ color: 0x453728, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = EDGE_Y - 0.001;
    this.jar.add(ring);

    // where the embankment meets the board: a feathered apron of spilled
    // ground foam, so the scenery ends in scatter instead of a hard rim
    const apron = new THREE.Mesh(
      new THREE.RingGeometry(GR * 1.03, GR * 1.20, 72),
      new THREE.MeshBasicMaterial({ color: 0x4a3c26, transparent: true, opacity: 0.55, depthWrite: false })
    );
    apron.rotation.x = -Math.PI / 2; apron.position.y = BASE + 0.002;
    this.jar.add(apron);

    const base = new THREE.Mesh(
      new THREE.CircleGeometry(GR * 0.915, 64),
      new THREE.MeshBasicMaterial({ color: 0x120e0b })
    );
    base.rotation.x = -Math.PI / 2; base.position.y = BASE;
    this.jar.add(base);

    // the evidence layer: every touch presses the flocking flat, forever (§15.3)
    this.fpGrid = new Float32Array(N * N);

    // dad's plywood — the 4×8 on the sawhorses. It tilts WITH the world:
    // lifting the board is lifting all of this.
    const ply = document.createElement('canvas'); ply.width = 512; ply.height = 256;
    const pg = ply.getContext('2d');
    pg.fillStyle = '#8a6b42'; pg.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 90; i++) {
      const y0 = Math.random() * 256, len = 80 + Math.random() * 380, x0 = Math.random() * 512;
      pg.strokeStyle = `rgba(${40 + Math.random() * 30 | 0},${26 + Math.random() * 20 | 0},12,${0.05 + Math.random() * 0.1})`;
      pg.lineWidth = 0.6 + Math.random() * 1.8;
      pg.beginPath(); pg.moveTo(x0, y0);
      pg.bezierCurveTo(x0 + len * 0.3, y0 + 3, x0 + len * 0.7, y0 - 3, x0 + len, y0 + 1);
      pg.stroke();
    }
    pg.fillStyle = 'rgba(52,34,16,0.55)';   // one knot, like always
    pg.beginPath(); pg.ellipse(392, 74, 9, 5.5, 0.3, 0, 6.3); pg.fill();
    this.boardMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(ply) });
    this.board = new THREE.Mesh(new THREE.BoxGeometry(TW, 0.05, TD), this.boardMat);
    this.board.position.y = BASE - 0.026;
    this.jar.add(this.board);
  }

  // -- dad's loop ------------------------------------------------------------
  _track() {
    // The rails are the edge of the world. The sim's boundary is a circle
    // (inJar) — the track ring IS that circle wearing its fiction. Nothing
    // inside ever crosses them.
    const RT = GR * 1.075;
    const ballast = new THREE.Mesh(
      new THREE.RingGeometry(GR * 0.985, GR * 1.165, 96),
      new THREE.MeshBasicMaterial({ color: 0x3b362e })
    );
    ballast.rotation.x = -Math.PI / 2; ballast.position.y = BASE + 0.004;
    this.jar.add(ballast);

    const ties = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.062, 0.006, 0.015),
      new THREE.MeshBasicMaterial({ color: 0x231a11 }), 84);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    const v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const Y = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 84; i++) {
      const a = (i / 84) * Math.PI * 2;
      q.setFromAxisAngle(Y, -a);
      v.set(Math.cos(a) * RT, BASE + 0.010, Math.sin(a) * RT);
      m4.compose(v, q, one);
      ties.setMatrixAt(i, m4);
    }
    this.jar.add(ties);

    const railMat = new THREE.MeshBasicMaterial({ color: 0x8f8a80 });
    for (const r of [RT - 0.021, RT + 0.021]) {
      const rail = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0042, 6, 120), railMat);
      rail.rotation.x = Math.PI / 2; rail.position.y = BASE + 0.0145;
      this.jar.add(rail);
    }

    // the 6:15, stopped where dad left it, never fixed
    const carCols = [0x1c2f22, 0x5a2222, 0x3a3a42];
    const a0 = 2.35;
    for (let ci = 0; ci < 3; ci++) {
      const car = new THREE.Group();
      const long = ci === 0 ? 0.105 : 0.085, tall = ci === 0 ? 0.042 : 0.032;
      const bodyM = new THREE.Mesh(new THREE.BoxGeometry(long, tall, 0.034),
        new THREE.MeshBasicMaterial({ color: carCols[ci] }));
      bodyM.position.y = tall / 2 + 0.004; car.add(bodyM);
      if (ci === 0) {
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.010, 0.03, 8),
          new THREE.MeshBasicMaterial({ color: 0x14161c }));
        stack.position.set(-long * 0.32, tall + 0.017, 0); car.add(stack);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.026, 0.036),
          new THREE.MeshBasicMaterial({ color: 0x233528 }));
        cab.position.set(long * 0.30, tall + 0.011, 0); car.add(cab);
      }
      const a = a0 + ci * 0.075;
      car.position.set(Math.cos(a) * RT, BASE + 0.014, Math.sin(a) * RT);
      car.rotation.y = -a - Math.PI / 2;
      this.jar.add(car);
    }
  }

  // -- dad's town ------------------------------------------------------------
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
    const ok = (x, y, hMin) => {
      const dx = x / (N - 1) - 0.5, dy = y / (N - 1) - 0.5;
      if (Math.sqrt(dx * dx + dy * dy) > 0.385) return false;
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
    const roofM = new THREE.MeshBasicMaterial({ color: 0x33241b });
    let homes = 0, tries = 0;
    while (homes < 6 && tries++ < 160) {
      const ang = rnd() * Math.PI * 2, rr2 = 3.5 + rnd() * 5.5;
      const x = Math.round(s.hearth.x + Math.cos(ang) * rr2);
      const y = Math.round(s.hearth.y + Math.sin(ang) * rr2);
      if (x < 1 || y < 1 || x > N - 2 || y > N - 2 || !ok(x, y, 0.08)) continue;
      const w = 0.048 + rnd() * 0.02, hgt = 0.032 + rnd() * 0.014;
      const house = new THREE.Group();
      const wallsM = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, w * 0.92),
        new THREE.MeshBasicMaterial({ color: wallCols[homes % wallCols.length] }));
      wallsM.position.y = hgt / 2; house.add(wallsM);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.80, hgt * 0.72, 4), roofM);
      roof.position.y = hgt + hgt * 0.36; roof.rotation.y = Math.PI / 4; house.add(roof);
      if (homes === 0) {           // the church — every layout has one
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.036, 6),
          new THREE.MeshBasicMaterial({ color: 0xe4dfd2 }));
        spire.position.y = hgt + hgt * 0.72 + 0.014; house.add(spire);
      }
      put(house, x, y);
      homes++;
    }

    // bottle-brush trees
    const trunkM = new THREE.MeshBasicMaterial({ color: 0x2a1c10 });
    const greens = [0x174023, 0x1d4d2b, 0x25573a];
    let trees = 0; tries = 0;
    while (trees < 14 && tries++ < 300) {
      const x = (2 + rnd() * (N - 4)) | 0, y = (2 + rnd() * (N - 4)) | 0;
      if (!ok(x, y, 0.05)) continue;
      const th = 0.040 + rnd() * 0.034;
      const tree = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(th * 0.34, th, 7),
        new THREE.MeshBasicMaterial({ color: greens[(rnd() * 3) | 0] }));
      cone.position.y = th / 2 + 0.006;
      tree.add(cone);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.012, 5), trunkM);
      trunk.position.y = 0.004; tree.add(trunk);
      put(tree, x, y);
      trees++;
    }
  }

  _paintGround() {
    const s = this.sim, N = s.N, d = this.groundData;
    const light = 0.22 + s.daylight * 0.78;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        // fake backlit shading from the height gradient
        const hl = s.height[s.idx(x - 1, y)], hr = s.height[s.idx(x + 1, y)];
        const hu = s.height[s.idx(x, y - 1)], hd = s.height[s.idx(x, y + 1)];
        const shade = 0.72 + (hu - hd) * 0.9 - (hr - hl) * 0.5;

        const m = s.moss[i], w = s.water[i], T = s.temp[i], q = s.moist[i];
        // painted dirt, damp dirt, ground-foam green
        let r = 92 - q * 30, g = 74 - q * 24, b = 52 - q * 16;
        r = r * (1 - m) + (38 + m * 14) * m;
        g = g * (1 - m) + (112 + m * 64) * m;
        b = b * (1 - m) + (34 + m * 18) * m;
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

        const o = i * 4, k = shade * light;
        d[o] = Math.max(0, Math.min(255, r * k));
        d[o + 1] = Math.max(0, Math.min(255, g * k));
        d[o + 2] = Math.max(0, Math.min(255, b * k));
        // ⚠️ The heightfield is square and the jar is round. Without this the
        // terrain's corners flare out through the glass like a salad bowl.
        d[o + 3] = this.mask[i];
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
    this.waterTex.magFilter = THREE.LinearFilter;
    this.water = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: this.waterTex, transparent: true, depthWrite: false, alphaTest: 0.02,
    }));
    this.jar.add(this.water);
  }

  _paintWater() {
    const s = this.sim, N = s.N, d = this.waterData;
    const pos = this.waterGeo.attributes.position;
    const light = 0.3 + s.daylight * 0.7;
    const wob = this.t * 0.9;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, w = s.water[i];
      const ripple = w > 0.004 ? Math.sin(x * 0.7 + wob) * Math.sin(y * 0.6 - wob * 1.3) * 0.0016 : 0;
      pos.setY(i, (s.height[i] + w) * YS + ripple);
      const o = i * 4;
      const a = w <= 0.0015 ? 0 : Math.min(0.86, 0.24 + w * 5.5);
      const dark = Math.min(1, w * 6);
      d[o] = (light * (148 - dark * 76)) | 0;
      d[o + 1] = (light * (188 - dark * 84)) | 0;
      d[o + 2] = (light * (214 - dark * 58)) | 0;
      d[o + 3] = Math.min(this.mask[i], (a * 255) | 0);
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
    this.bodies = new THREE.InstancedMesh(body, new THREE.MeshBasicMaterial({ color: 0x090b10 }), CAP);
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
    const grd = gg.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(228,186,96,0.92)');
    grd.addColorStop(0.55, 'rgba(198,150,62,0.55)');
    grd.addColorStop(1, 'rgba(170,124,48,0)');
    gg.fillStyle = grd; gg.fillRect(0, 0, 64, 64);
    this.glue = new THREE.Mesh(
      new THREE.PlaneGeometry(0.062, 0.062),
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
      new THREE.MeshBasicMaterial({ color: 0x99a0a9 }), 900);
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
    const geo = new THREE.PlaneGeometry(TW * 1.04, TD * 1.10, 44, 26);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const u = x / (TW * 0.52), w = z / (TD * 0.55);          // -1..1 over the board
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
    this.camera.position.set(
      Math.sin(o.az) * cy * o.dist,
      sy * o.dist + 0.20,
      Math.cos(o.az) * cy * o.dist
    );
    this.camera.lookAt(0, 0.14, 0);

    // lifting one edge of the board off the sawhorses
    this.jar.rotation.z = -s.tilt.x * 2.6;
    this.jar.rotation.x = s.tilt.y * 2.6;

    this._paintSky();
    this._paintGround();
    this._paintWater();
    this._paintKin();
    this._paintGraves();

    // the sheet slides off the board and slumps beside the track
    const want = s.lid ? 1 : 0;
    this.coverT += (want - this.coverT) * Math.min(1, dt * 3.4);
    const ct = this.coverT;
    // pulled off, the sheet slides clear of the board and crumples beside it —
    // it does not vanish. Dad will notice it moved.
    this.cover.position.set(ct * TW * 0.86, EDGE_Y + 0.03 - ct * 0.34, ct * 0.16);
    this.cover.rotation.z = -ct * 0.40;
    this.cover.scale.set(1 - ct * 0.42, 1 - ct * 0.60, 1 - ct * 0.10);
    this.fogMesh.material.opacity =
      Math.min(0.30, Math.max(0, s.humid - 5) * 0.018 + s.fog * 0.24) * (1 - ct * 0.5);

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
    const hit = this.raycaster.intersectObject(this.ground, false)[0];
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
