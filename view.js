// THE GLASS — view.js
// Rendering only. Reads the sim, never writes it. (Invariant 2)
// Art direction: backlit silhouette. The window is behind the jar; everything
// inside reads as shape plus lantern glow. (bible §15)

import * as THREE from './lib/three.module.js';
import { STAGE, NEEDS, LANTERN_HUE, LOCI, L, expressed } from './sim.js';

const R = 1.0;          // jar radius
const JH = 1.05;        // jar height (there must be AIR above the landscape)
const GR = R * 0.94;    // ground radius
const YS = 0.38;        // vertical scale of the heightfield
const BASE = -0.155;     // the jar's floor. Everything is measured from here.
const EDGE_Y = 0.035;   // the lip where the soil column meets the terrain

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
    this.jar = new THREE.Group();
    this.scene.add(this.jar);

    this._room();
    this._ground();
    this._water();
    this._kin();
    this._graves();
    this._glass();
    this._dust();

    this.raycaster = new THREE.Raycaster();
    this.resize();
  }

  // -- the room behind the jar ----------------------------------------------
  _room() {
    // the window: a big soft gradient plane. This is the only real light in the
    // picture, and it is behind everything, which is the whole art direction.
    const c = document.createElement('canvas'); c.width = 8; c.height = 256;
    const g = c.getContext('2d');
    this.skyCtx = g; this.skyCanvas = c;
    this.skyTex = new THREE.CanvasTexture(c);
    // the wall the window is in
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 24),
      new THREE.MeshBasicMaterial({ color: 0x080a0e })
    );
    wall.position.set(0, 3, -3.02);
    this.scene.add(wall);
    this.wallMat = wall.material;

    // the window itself — the only real light in the picture
    this.sky = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 5.2),
      new THREE.MeshBasicMaterial({ map: this.skyTex, depthWrite: false })
    );
    this.sky.position.set(0, 1.55, -3.0);
    this.scene.add(this.sky);

    // muntins — the cross in the window. Sells the whole read instantly.
    const barMat = new THREE.MeshBasicMaterial({ color: 0x0b0d12 });
    [[0, 1.55, 0.09, 5.3], [0, 1.55, 4.5, 0.085]].forEach(([x, y, w, h]) => {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), barMat);
      b.position.set(x, y, -2.98); this.scene.add(b);
    });
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(4.9, 5.7),
      new THREE.MeshBasicMaterial({ color: 0x11141a })
    );
    frame.position.set(0, 1.55, -3.01); this.scene.add(frame);

    // the sill the jar stands on
    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 0.14, 1.5),
      new THREE.MeshBasicMaterial({ color: 0x16181f })
    );
    sill.position.set(0, BASE - 0.07, -0.15);
    this.scene.add(sill);
    this.sillMat = sill.material;

    // the jar's own shadow on the sill
    const shTex = (() => {
      const c2 = document.createElement('canvas'); c2.width = c2.height = 128;
      const g2 = c2.getContext('2d');
      const r2 = g2.createRadialGradient(64, 64, 6, 64, 64, 64);
      r2.addColorStop(0, 'rgba(0,0,0,0.75)'); r2.addColorStop(1, 'rgba(0,0,0,0)');
      g2.fillStyle = r2; g2.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c2);
    })();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.2),
      new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.35, BASE + 0.006, 0.28);
    this.scene.add(shadow);

    // the light shaft through the glass
    const shaftGeo = new THREE.PlaneGeometry(2.6, 3.2);
    this.shaft = new THREE.Mesh(shaftGeo, new THREE.MeshBasicMaterial({
      color: 0xffe9c4, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false,
    }));
    this.shaft.position.set(0, 0.45, -1.5);
    this.scene.add(this.shaft);
  }

  _paintSky() {
    const s = this.sim, g = this.skyCtx;
    const d = s.daylight;
    // seasonal window colour: cold blue in winter, amber in summer (§11.4)
    const season = s.season != null ? s.season : 0.5;
    const warm = 0.25 + season * 0.75;
    const top = [
      16 + d * (95 + warm * 150),
      19 + d * (108 + warm * 135),
      30 + d * (140 + warm * 55),
    ];
    const bot = [
      22 + d * (185 + warm * 70),
      22 + d * (172 + warm * 72),
      32 + d * (150 + warm * 30),
    ];
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `rgb(${top.map(v => v | 0).join(',')})`);
    grad.addColorStop(0.62, `rgb(${bot.map(v => v | 0).join(',')})`);
    grad.addColorStop(1, `rgb(${bot.map(v => (v * 0.35) | 0).join(',')})`);
    g.fillStyle = grad; g.fillRect(0, 0, 8, 256);
    this.skyTex.needsUpdate = true;
    const amb = 0.07 + d * 0.26;
    this.sillMat.color.setRGB(amb * 0.95, amb * 0.86, amb * 0.74);
    this.wallMat.color.setRGB(amb * 0.34, amb * 0.34, amb * 0.42);
    this.shaft.material.opacity = 0.015 + d * 0.10;
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

    // a clay wall so the terrain doesn't float
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(GR * 0.916, GR * 0.916, EDGE_Y - BASE, 72, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x241d18, side: THREE.DoubleSide })
    );
    skirt.position.y = (BASE + EDGE_Y) / 2;
    this.jar.add(skirt);
    // a rim ring hides the seam where the cropped heightfield meets the soil
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(GR * 0.872, GR * 0.918, 72),
      new THREE.MeshBasicMaterial({ color: 0x2a2119, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = EDGE_Y - 0.001;
    this.jar.add(ring);

    const base = new THREE.Mesh(
      new THREE.CircleGeometry(GR * 0.915, 64),
      new THREE.MeshBasicMaterial({ color: 0x120e0b })
    );
    base.rotation.x = -Math.PI / 2; base.position.y = BASE;
    this.jar.add(base);
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
        // soil, damp soil, moss
        let r = 74 - q * 26, g = 58 - q * 18, b = 44 - q * 12;
        r = r * (1 - m) + (52 + m * 24) * m;
        g = g * (1 - m) + (96 + m * 62) * m;
        b = b * (1 - m) + (44 + m * 22) * m;
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
      d[o] = (light * (120 - dark * 84)) | 0;
      d[o + 1] = (light * (170 - dark * 96)) | 0;
      d[o + 2] = (light * (200 - dark * 70)) | 0;
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

  _paintKin() {
    const s = this.sim, k = s.k;
    let n = 0;
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

      this._v.set(x, y + (moving ? bob * 0.006 : 0), z);
      this._sc.set(sz / sq, sz * sq, sz / sq);
      const face = Math.atan2(k.tx[id] - k.x[id], k.ty[id] - k.y[id]);
      this._q.setFromAxisAngle({ x: 0, y: 1, z: 0 }, face);
      this._m4.compose(this._v, this._q, this._sc);
      this.bodies.setMatrixAt(n, this._m4);

      // lantern
      const pulse = 0.72 + 0.28 * Math.sin(this.t * k.pulse[id] * 6.28);
      const b = k.bright[id] * pulse;
      this._col.setHSL(k.hue[id] / 360, st === STAGE.EGG ? 0.45 : 0.92, 0.22 + b * 0.34);
      const o = n * 3;
      this.lanternPos[o] = x; this.lanternPos[o + 1] = y + 0.024 * sz; this.lanternPos[o + 2] = z;
      this.lanternCol[o] = this._col.r; this.lanternCol[o + 1] = this._col.g; this.lanternCol[o + 2] = this._col.b;
      this.lanternSize[n] = (0.070 + b * 0.115) * grow * (0.80 + (1 - s.daylight) * 0.55);
      this.kinScreen[n] = id;
      n++;
    }
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
      new THREE.MeshBasicMaterial({ color: 0x2b2f38 }), 900);
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

  // -- the glass -------------------------------------------------------------
  _glass() {
    // the fingerprint layer: every touch stays. This is the alignment display. (§15.3)
    const fp = document.createElement('canvas'); fp.width = 1024; fp.height = 256;
    this.fpCtx = fp.getContext('2d');
    this.fpCtx.fillStyle = '#000'; this.fpCtx.fillRect(0, 0, 1024, 256);
    this.fpTex = new THREE.CanvasTexture(fp);
    this.fpTex.wrapS = THREE.RepeatWrapping;

    const gGeo = new THREE.CylinderGeometry(R, R, JH, 96, 1, true);
    // Fresnel: glass is invisible face-on and bright at the silhouette. Without
    // this the jar reads as a hole rather than a vessel.
    const glassMat = new THREE.ShaderMaterial({
      uniforms: { uTint: { value: new THREE.Color(0xbcd8ec) }, uAmt: { value: 0.55 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uTint; uniform float uAmt;
        varying vec3 vN; varying vec3 vV;
        void main(){
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float a = pow(f, 3.0) * uAmt + 0.012;
          gl_FragColor = vec4(uTint * a, a);
        }`,
    });
    this.glass = new THREE.Mesh(gGeo, glassMat);
    this.glass.position.y = BASE + JH / 2;
    this.jar.add(this.glass);

    this.smudge = new THREE.Mesh(gGeo.clone(), new THREE.MeshBasicMaterial({
      map: this.fpTex, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.smudge.position.y = this.glass.position.y;
    this.smudge.scale.setScalar(1.004);
    this.jar.add(this.smudge);

    // the rim and the lid
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(R * 1.005, 0.016, 8, 60),
      new THREE.MeshBasicMaterial({ color: 0x6d747f })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = BASE + JH;
    this.jar.add(rim);

    // ⚠️ The lid was an opaque disc and it covered the entire game. It is glass.
    this.lid = new THREE.Group();
    const pane = new THREE.Mesh(
      new THREE.CircleGeometry(R * 0.99, 56),
      new THREE.MeshBasicMaterial({
        color: 0x9dc0d8, transparent: true, opacity: 0.085,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    pane.rotation.x = -Math.PI / 2;
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(R * 1.012, 0.014, 8, 60),
      new THREE.MeshBasicMaterial({ color: 0x484e59 })
    );
    band.rotation.x = Math.PI / 2;
    this.lid.add(pane); this.lid.add(band);
    this.lid.position.y = BASE + JH + 0.012;
    this.jar.add(this.lid);

    // condensation on the inside, driven by humidity
    this.fogMesh = new THREE.Mesh(gGeo.clone(), new THREE.MeshBasicMaterial({
      color: 0xdff0ff, transparent: true, opacity: 0, side: THREE.BackSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.fogMesh.position.y = this.glass.position.y;
    this.fogMesh.scale.setScalar(0.996);
    this.jar.add(this.fogMesh);
  }

  // Stamp a fingerprint where the ray crossed the glass.
  fingerprint(worldPoint) {
    const p = this.jar.worldToLocal(worldPoint.clone());
    const u = ((Math.atan2(p.x, p.z) / (Math.PI * 2)) + 0.5) % 1;
    const v = 1 - Math.max(0, Math.min(1, (p.y + 0.5) / JH));
    const g = this.fpCtx, X = u * 1024, Y = v * 256;
    const rad = g.createRadialGradient(X, Y, 0, X, Y, 26);
    rad.addColorStop(0, 'rgba(190,215,235,0.055)');
    rad.addColorStop(0.6, 'rgba(170,200,225,0.022)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rad;
    g.beginPath(); g.arc(X, Y, 26, 0, 6.2832); g.fill();
    this.fpTex.needsUpdate = true;
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

    // the jar tips when you tilt it
    this.jar.rotation.z = -s.tilt.x * 2.6;
    this.jar.rotation.x = s.tilt.y * 2.6;

    this._paintSky();
    this._paintGround();
    this._paintWater();
    this._paintKin();
    this._paintGraves();

    this.fogMesh.material.opacity = Math.min(0.34, Math.max(0, s.humid - 5) * 0.020 + s.fog * 0.26);
    this.lid.position.y = BASE + JH + 0.012 + (s.lid ? 0.30 : 0);
    this.lid.rotation.z = s.lid ? 0.20 : 0;

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
    // where the same ray crosses the glass — that's where your finger actually is
    const dir = this.raycaster.ray.direction, org = this.raycaster.ray.origin;
    let glassPoint = hit.point.clone();
    const a = dir.x * dir.x + dir.z * dir.z;
    if (a > 1e-6) {
      const b = 2 * (org.x * dir.x + org.z * dir.z);
      const c = org.x * org.x + org.z * org.z - R * R;
      const disc = b * b - 4 * a * c;
      if (disc > 0) {
        const t1 = (-b - Math.sqrt(disc)) / (2 * a);
        if (t1 > 0) glassPoint = org.clone().addScaledVector(dir, t1);
      }
    }
    return { cell: [cx, cy], world: hit.point, glass: glassPoint };
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
