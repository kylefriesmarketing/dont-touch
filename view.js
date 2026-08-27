// DON'T TOUCH — view.js
// Rendering only. Reads the sim, never writes it. (Invariant 2)
// Art direction: a lamplit miniature layout seen from above. The scenery fills
// the board edge to edge and the real world is never in frame — the tabletop
// framing belongs to THE ROOM hub. Shape plus lantern glow. (bible §15, pivoted)

import * as THREE from './lib/three.module.js';
import { STAGE, NEEDS, LANTERN_HUE, LOCI, L, expressed, S, C } from './sim.js';
import { Post } from './post.js';
import { Vfx } from './vfx.js';
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
const APRON = 7;              // half-widths of scenery land past the board
const APRON_GR = GR * APRON;  // ...and how far that reaches, for the fit solve
// ⚠ THE CAMERA STAYS CLOSE ON PURPOSE. With the apron there is no void to stop
// you, so the fit solve would happily let you pull back until the whole layout
// is a postage stamp — and the whole point of the walk is that you go and look.
const ZOOM_OUT_MAX = 1.35;
// ⚠️⚠️ THE FLOOR IS NOW A FUNCTION OF ZOOM, AND THAT IS THE POINT.
// EL_MIN was a flat 0.92 — 53 degrees above the horizon, "bird's eye only" —
// and the stated reason is real: at a shallow angle you see past the edge of
// the board into whatever is beyond it. But it had a cost nobody had measured.
// Photographed from directly overhead at maximum zoom, a kin is a pastel blob
// with a lamp on top: `_kin()` builds eye-whites, pupils, a mouth and an
// antenna, and from 53-87 degrees YOU ARE LOOKING AT THE TOP OF ITS HEAD. The
// creatures have faces and the camera was never allowed to see one. "The
// creatures aren't cute enough" was a camera constraint, not a modelling one.
// So: the high floor still applies when you are pulled back and the horizon
// would actually come into frame, and drops to EL_NEAR once you are close
// enough that the board fills the view anyway.
const EL_MIN = 0.92, EL_MAX = 1.52;   // 53deg .. 87deg — the pulled-back floor
const EL_NEAR = 0.44;                 // ~25deg — close up, where faces live
const EL_NEAR_DIST = 0.95;            // below this zoom the low floor applies
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
    // ⚠️⚠️ THE DEFAULT CAMERA WAS THE GRAPHICS BUG. The zoom range is 0.60–2.75
    // and this shipped at 2.35 — the player opened the game almost fully zoomed
    // OUT, where a kin is a three-pixel dot and a hut is a smudge. Photographed
    // side by side at the same instant, 2.35 is a dark green rectangle with
    // fireflies on it; 1.25 is a village with pitched roofs, chimney smoke and
    // little glowing people you can tell apart. Nothing else changed between the
    // two frames. "Where are the buildings and civilisation" was answered by a
    // number in this line, not by the art and not by the pacing.
    this.orbit = { az: 0.35, el: 1.16, dist: 1.25, tAz: 0.35, tEl: 1.16, tDist: 1.25 };
    this.panHold = 0;      // seconds the player's own camera walk owns the view
    this.GR = GR;          // the board half-width, so the pan can clamp to it
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
    this._nightLife();
    this._giftView();

    // ⚠️ EVERY VERB HAS TO LEAVE A MARK ON THE PICTURE. Before this the board
    // answered a mend, a strike and a call with the same nothing — the ring
    // told you what was ABOUT to happen and then the act itself was invisible,
    // which is most of what "unresponsive" meant. Three pooled objects, three
    // draw calls, parented to `jar` so the spectacle tilts with the plywood.
    this.vfx = new Vfx(this.jar, this, { GR, YS, EDGE_Y });
    // ⚠️ seeded from the sim, not from zero: a LOADED save can arrive with
    // crumbs already lying on the board, and starting at 0 would puff dust off
    // every one of them on the first frame as if dad had just come downstairs.
    this._giftSeen = (sim.gifts && sim.gifts.length) || 0;
    this._heldPrev = -1;      // who was in the hand last frame
    this._heldWhere = null;   // and where the hand was holding them
    this._reachDone = '';     // the reach we have already paid out

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
    // the dark under the table falls away from the board instead of being one
    // flat sheet — shadow, not a room reveal: the gradient stays dark enough
    // that 'you are never outside the layout' holds.
    const rc = document.createElement('canvas'); rc.width = rc.height = 256;
    const rg = rc.getContext('2d');
    const grd = rg.createRadialGradient(128, 128, 10, 128, 128, 128);
    grd.addColorStop(0, '#101319');
    grd.addColorStop(0.35, '#0a0d12');
    grd.addColorStop(1, '#04050a');
    rg.fillStyle = grd; rg.fillRect(0, 0, 256, 256);
    const dark = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(rc), color: 0xffffff })
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
    this.floorMat.color.setRGB(0.5 + amb * 0.5, 0.5 + amb * 0.5, 0.55 + amb * 0.5);
    const fl = 0.30 + d * 0.70;
    // with the painted texture in place this is only the day dimmer — a
    // neutral scale, or the map's own greens go muddy
    this.fasciaMat.color.setRGB(0.55 + 0.45 * fl, 0.55 + 0.45 * fl, 0.55 + 0.45 * fl);
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

    // ── THE APRON — THE WORLD DOES NOT END AT THE BOARD ─────────────────
    // Kyle, three times: "it should be endless and fill the screen and you
    // should be able to see everything using WASD".
    // ⚠⚠ WITHOUT THIS, SCROLLING IS THE THING THAT CANNOT WORK. A tilted camera
    // sees ahead of itself, so walking toward any edge brings the void past it
    // into frame — which is why the no-void solve could only ever allow the
    // camera to reach 27-59% of the way to the rim (measured across zooms and
    // angles). No clamp can fix that: the board is finite and the fix has to be
    // that it stops LOOKING finite.
    // The same ground texture, tiled outward and dimmed with distance, so the
    // land keeps going and falls away into the dark of the room rather than
    // stopping at a line. The play area is unchanged — this is scenery, it has
    // no cells, and the sim has never heard of it.
    {
      // ⚠⚠ A FLAT AVERAGED COLOUR, NOT THE TILED GROUND TEXTURE. Tiling the
      // ground map outward was tried and photographed twice: at seven repeats
      // each tile is board-sized, so the tile beside the board is a MIRROR of
      // the board and matches it nowhere — it put a hard diagonal colour break
      // right along the edge, which reads as an edge just as plainly as the void
      // it replaced. Competing detail cannot be made to line up; no detail can.
      // The apron is the ground's own average colour, dimmed toward the rim, and
      // the miniature blur does the rest.
      const AP = 7;                       // half-widths of land in every direction
      let ar = 90, ag = 105, ab = 70;
      try {
        const sc = document.createElement('canvas'); sc.width = sc.height = 16;
        const sg = sc.getContext('2d');
        sg.drawImage(this.groundTex.image, 0, 0, 16, 16);
        const d = sg.getImageData(0, 0, 16, 16).data;
        let r2 = 0, g2 = 0, b2 = 0;
        for (let i = 0; i < d.length; i += 4) { r2 += d[i]; g2 += d[i + 1]; b2 += d[i + 2]; }
        const nn = d.length / 4;
        ar = r2 / nn; ag = g2 / nn; ab = b2 / nn;
      } catch (e) { /* an unready canvas must not stop the world being built */ }
      const ageo = new THREE.PlaneGeometry(GR * 2 * AP, GR * 2 * AP, AP * 4, AP * 4);
      ageo.rotateX(-Math.PI / 2);
      // dim it toward the rim so the layout stays the bright thing in the room
      const col = [];
      const pos = ageo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) / (GR * AP), dz = pos.getZ(i) / (GR * AP);
        const r = Math.min(1, Math.sqrt(dx * dx + dz * dz));
        // ⚠ gentle, and it starts at FULL brightness. A strong vignette put a
        // hard tonal line right where the board meets the apron, which reads as
        // an edge just as plainly as the void did — the thing this exists to
        // remove. It only really darkens past halfway out, where the miniature
        // blur is already carrying it.
        const f = Math.max(0.10, 1 - Math.pow(r, 2.6) * 0.95);
        col.push(f, f, f);
      }
      ageo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      // ⚠ CLAMPED, NOT TILED — this is what makes the join invisible. The UVs are
      // built so the board's own square maps to [0,1] and everything beyond it
      // falls outside; with ClampToEdgeWrapping the outside is the board's EDGE
      // PIXEL smeared outward, so the colour at the seam matches the board
      // exactly by construction instead of by luck. A repeat or a mirror cannot
      // do that — both put a different part of the map against the edge.
      const auv = [];
      for (let i = 0; i < pos.count; i++) {
        auv.push(0.5 + pos.getX(i) / (GR * 2), 0.5 - pos.getZ(i) / (GR * 2));
      }
      ageo.setAttribute('uv', new THREE.Float32BufferAttribute(auv, 2));
      const aedge = this.groundTex.clone();
      aedge.needsUpdate = true;
      aedge.wrapS = aedge.wrapT = THREE.ClampToEdgeWrapping;
      const amat = new THREE.MeshStandardMaterial({
        map: aedge, color: new THREE.Color(0xffffff),
        vertexColors: true, roughness: 1, metalness: 0,
      });
      this.apron = new THREE.Mesh(ageo, amat);
      // ⚠ SAMPLED FROM THE BOARD'S OWN RIM, not guessed. At a guessed 0.16 the
      // apron sat below the terrain edge (measured rim 0.18-0.25) and the step
      // between them was a hard diagonal line across the screen.
      let rim = 0, rn = 0;
      for (let c = 0; c < N; c += 4) {
        rim += this.cellToLocal(c, 0, 0)[1] + this.cellToLocal(c, N - 1, 0)[1];
        rim += this.cellToLocal(0, c, 0)[1] + this.cellToLocal(N - 1, c, 0)[1];
        rn += 4;
      }
      this.apron.position.y = rn ? rim / rn - 0.012 : 0.16;
      this.apron.renderOrder = -1;
      this.apron.receiveShadow = false;
      this.jar.add(this.apron);
    }

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
    this._groundSUB = SUB; this._groundM = M;

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
    // brushed dark-green paint over plywood — dad painted this edge by hand,
    // and a flat colour box reads as UI, not wood. One 256x64 canvas, dragged
    // strokes with the grain, wear at the top edge where hands catch it.
    const fc = document.createElement('canvas'); fc.width = 256; fc.height = 64;
    const fg = fc.getContext('2d');
    fg.fillStyle = '#243020'; fg.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 90; i++) {
      const y0 = Math.random() * 64, ln = 30 + Math.random() * 120;
      fg.strokeStyle = Math.random() < 0.5 ? 'rgba(18,26,15,0.35)' : 'rgba(52,66,44,0.30)';
      fg.lineWidth = 0.6 + Math.random() * 1.6;
      fg.beginPath(); fg.moveTo(Math.random() * 256, y0);
      fg.lineTo(Math.random() * 256 + ln, y0 + (Math.random() - 0.5) * 3); fg.stroke();
    }
    // worn top edge: the plywood showing through where the paint has gone
    for (let i = 0; i < 26; i++) {
      fg.fillStyle = 'rgba(122,96,58,' + (0.10 + Math.random() * 0.25) + ')';
      fg.fillRect(Math.random() * 256, Math.random() * 5, 3 + Math.random() * 14, 1.5 + Math.random() * 2.5);
    }
    const fasciaTex = new THREE.CanvasTexture(fc);
    fasciaTex.wrapS = THREE.RepeatWrapping;
    this.fasciaMat = new THREE.MeshStandardMaterial({ map: fasciaTex, color: 0xffffff, roughness: 0.8 });
    const lip = EDGE_Y - BASE;
    for (const [sx, sz, w, dd] of [
      [0, -BOARD, BOARD * 2 + 0.03, 0.03], [0, BOARD, BOARD * 2 + 0.03, 0.03],
      [-BOARD, 0, 0.03, BOARD * 2 + 0.03], [BOARD, 0, 0.03, BOARD * 2 + 0.03],
    ]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, lip, dd), this.fasciaMat);
      m.position.set(sx, BASE + lip / 2, sz);
      // ⚠ THE PLYWOOD LIP IS OFF WHILE THE LAND IS ENDLESS. It is the edge of a
      // finite board, and with the apron behind it it reads as a wall standing
      // in the middle of a field. Kept in the tree (and in `this.fascia`) so the
      // finite-board look is one flag away if the fiction wants it back.
      m.visible = false;
      (this.fascia || (this.fascia = [])).push(m);
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
    this._flinchFx(cx, cy);
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

  // ⚠️ READING THE VERB OFF THE BOARD, so the spectacle needed no main.js
  // change to exist. `flinch` is the one call every ground act already makes,
  // and the sim state at that instant says which act it was:
  //   · s.hand is SET   — _pushHand ran first, so a finger is down: rest/press.
  //   · goal 12 + a long hold inside 26*S — sim.call just committed them.
  //   · goal 6 + hold 200 inside 20*S     — sim.terror just scattered them.
  //   · none of the above — the T key, which knocks the whole world at once.
  // main.js is still free to call view.fxPower() outright; the claim guard in
  // vfx.js means the explicit call and this detector cannot both pay out.
  // ⚠️ if the ORDER in main.js ever changes so that flinch runs BEFORE the sim
  // verb, this silently degrades to a plain knock ring. It never breaks; it
  // just gets less specific. That is why the explicit hook exists too.
  _flinchFx(cx, cy) {
    if (!this.vfx) return;
    const s = this.sim, k = s.k;
    // ⚠️ IF MAIN.JS SAID WHAT HAPPENED, DO NOT GUESS. An explicit fxPower for
    // a ground verb closes this detector for a quarter second — otherwise a
    // wrong guess would sit BESIDE the right answer rather than being swallowed
    // by the claim guard, because a bad guess is a DIFFERENT kind and claims
    // are per kind.
    if (this.vfx.spokeRecently()) return;
    // a finger is down (main._pushHand runs before flinch), so this is a
    // contact, not a power — the continuous hand emitter says the rest.
    if (s.hand) { this.vfx.fire('contact', cx, cy); return; }
    // startle() knocks the WHOLE WORLD and flinches at the exact board centre.
    // Checked before anything else so no stale kin state can steal it.
    const mid = (s.N - 1) / 2;
    if (Math.abs(cx - mid) < 0.001 && Math.abs(cy - mid) < 0.001) { this.vfx.fire('knock', cx, cy); return; }
    // a crumb also flinches them. The gift watcher in _paintGifts owns that one
    // (it also catches the double-tap crumb, which never flinches at all).
    if ((s.gifts ? s.gifts.length : 0) > this._giftSeen) return;

    // ⚠️⚠️ EDGE-TRIGGERED, NOT STATE-MATCHED, and this took two goes to get
    // right. The first version read the kin: goal 12 with a long hold meant
    // call, goal 6 with hold 200 meant terror. But `hold` only ticks down when
    // the SIM runs, so with the game PAUSED those marks sit there for as long
    // as you like and every later flinch re-read them — a knock after a dread
    // drew a second dread. sim.eventCounts is a Map that only ever grows and is
    // never trimmed, so a delta of one is proof the verb fired since the last
    // time a finger landed, whatever the clock is doing.
    const ec = s.eventCounts;
    const nc = (ec && ec.get('called')) || 0, nt = (ec && ec.get('terror')) || 0;
    const dc = nc - (this._evCall || 0), dt = nt - (this._evDread || 0);
    this._evCall = nc; this._evDread = nt;
    if (dc > 0) { this.vfx.fire('call', cx, cy); return; }
    if (dt > 0) { this.vfx.fire('dread', cx, cy); return; }
    // ⚠️ log() DEDUPES an identical sentence inside eight days and returns
    // before it counts — and sim.call's sentence only varies by how many went,
    // so calling the same crowd twice really can leave the counter still. The
    // kin-state read is kept as the second opinion for exactly that case.
    let called = 0, scared = 0;
    for (let id = 0; id < s.count; id++) {
      if (!k.alive[id]) continue;
      const d2 = (k.x[id] - cx) * (k.x[id] - cx) + (k.y[id] - cy) * (k.y[id] - cy);
      if (d2 > (26 * S) * (26 * S)) continue;
      // exact values: sim.call writes hold = 1400, sim.terror writes 200, and
      // _decide subtracts 1 per tick — so equality means "this tick".
      if (k.goal[id] === 12 && k.hold[id] >= 1400) called++;
      else if (k.goal[id] === 6 && k.hold[id] >= 200 && k.pulse[id] >= 2.8 &&
               d2 <= (20 * S) * (20 * S)) scared++;
    }
    if (called) this.vfx.fire('call', cx, cy);
    else if (scared) this.vfx.fire('dread', cx, cy);
    // ⚠️ and if we genuinely cannot tell, the fallback is the SMALL ring, not
    // the world-knock. A wrong guess has to be cheap.
    else this.vfx.fire('contact', cx, cy);
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
      c.userData.chimney = h;      // the smoke system harvests these by tag
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

    } else if (o.kind === 6) {                           // THE FIELD
      // ⚠ A FIELD IS GROUND, NOT A BUILDING. It has to read as worked earth
      // from the default camera without becoming another roof in the skyline —
      // the whole silhouette rule works the other way here. Furrows, a low
      // fence, and a leaning stake somebody put there.
      const w = 0.090, d = 0.070;
      const bed = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, d), M.cut);
      bed.position.y = 0.002; g.add(bed);
      const rows = 5;
      for (let r = 0; r < rows; r++) {
        const fz = (r / (rows - 1) - 0.5) * d * 0.82;
        const fur = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, 0.005, d * 0.055), M.stack);
        fur.position.set(0, 0.006, fz); g.add(fur);
      }
      // a rail fence on the two long sides
      for (const sz of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.003, 0.003), M.timber);
        rail.position.set(0, 0.011, sz * d * 0.5); g.add(rail);
        for (const sx of [-0.42, 0, 0.42]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.004), M.timber);
          post.position.set(sx * w, 0.008, sz * d * 0.5); g.add(post);
        }
      }
      // the stake, leaning, because nobody ever drives one straight
      const stake = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.034, 0.004), M.timber);
      stake.position.set((rnd() - 0.5) * w * 0.5, 0.017, (rnd() - 0.5) * d * 0.4);
      stake.rotation.z = (rnd() - 0.5) * 0.4; g.add(stake);

    } else if (o.kind === 7) {                           // THE WELL
      const r = 0.019;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 0.020, 10), M.stone);
      ring.position.y = 0.010; g.add(ring);
      // the dark of it — a plain disc, so it reads as a hole and not a drum
      const mouth = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.74, r * 0.74, 0.002, 10), M.cut);
      mouth.position.y = 0.021; g.add(mouth);
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.040, 0.005), M.timber);
        post.position.set(sx * r * 0.86, 0.040, 0); g.add(post);
      }
      const rf = roof(r * 2.5, r * 2.0, 0.016, pick([M.tile, M.slate, M.thatch]));
      rf.position.y = 0.060; g.add(rf);
      // the winding bar between the posts
      const bar = new THREE.Mesh(new THREE.BoxGeometry(r * 1.9, 0.003, 0.003), M.timber);
      bar.position.y = 0.052; g.add(bar);

    } else if (o.kind === 8) {                           // THE GRANARY
      // the biggest thing a town builds that is not the hall, and it should
      // look like the town has something worth keeping
      const w = 0.086, d = 0.062, wh = 0.050;
      // staddle stones — a granary stands off the ground or the winter gets in
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.012, 6), M.stone);
        leg.position.set(sx * w * 0.38, 0.006, sz * d * 0.34); g.add(leg);
      }
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, wh, d), M.timber);
      body.position.y = 0.012 + wh / 2; g.add(body);
      // plank banding, so it is not a smooth crate
      for (const fy of [0.30, 0.62]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, 0.004, d * 1.01), M.plasterB);
        band.position.y = 0.012 + wh * fy; g.add(band);
      }
      const rf = roof(w * 1.16, d * 1.20, 0.030, pick([M.thatch, M.tile]));
      rf.position.y = 0.012 + wh; g.add(rf);
      // the loading step
      const step = new THREE.Mesh(new THREE.BoxGeometry(w * 0.30, 0.008, 0.010), M.stone);
      step.position.set(0, 0.004, d * 0.52); g.add(step);

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
    // ── WHICH WAY A BUILDING FACES ───────────────────────────────
    // This was `rnd() * 6.283`. Fifteen pitched roofs at fifteen unrelated
    // angles does not read as a village — it reads as scattered rubble, which
    // is exactly what the town looked like from the default camera.
    // Real buildings face the road. When the board was baked from
    // OpenStreetMap we have the real road network, so we find the nearest real
    // road cell and turn the front of the building toward it — the village
    // lines its street the way the actual village does. Generated boards have
    // no roads and fall back to a shared axis with a little jitter: still a
    // village, just an unplanned one.
    // ⚠ the rnd() draw is CONSUMED on both paths so the view's stream does not
    // shift depending on which world happens to be loaded.
    const jit = (rnd() - 0.5) * 0.55;
    let yaw = jit;
    const RDW = this.sim.world && this.sim.world.road ? this.sim.world.road : null;
    if (RDW) {
      const NW = this.sim.N;
      let bd = 1e9, bx = 0, by = 0;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
        const x = o.x + dx, y = o.y + dy;
        if (x < 0 || y < 0 || x >= NW || y >= NW) continue;
        if (RDW[y * NW + x] <= 0.05) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; bx = dx; by = dy; }
      }
      if (bd < 1e9) yaw = Math.atan2(bx, by) + jit * 0.3;
    }
    g.rotation.y = yaw;
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
      // ⚠⚠ THIS WAS setScalar(0.55 + f * 0.45), WHICH OVERWROTE THE S THAT
      // _buildWorkView had just set — an assignment, not a multiply. Every work
      // in the game therefore rendered at 1/S (66.7% at N=96) of the size it was
      // authored at, which is most of why the town read as a scattering of
      // pebbles. The FOOTPRINT now always sits at full authored scale and only
      // the HEIGHT ramps, so a half-built work is a half-raised frame instead of
      // a shrunken finished one.
      g.scale.set(S, S * (0.55 + f * 0.45), S);
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
    // hoisted: a property lookup per cell over 9,216 cells, every frame, adds up
    const RD = s.world && s.world.road ? s.world.road : null;
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
        // ⚠️ THE REAL STREETS, PAINTED ON. When this board is a model of a real
        // place, `world.road` is where OpenStreetMap says the roads actually
        // run. They are painted into the albedo rather than simulated: nothing
        // in the game walks on a road, and a model railway layout has its roads
        // PAINTED ON TOO. It costs one array read per cell and it is the single
        // strongest cue that this is somewhere rather than anywhere.
        // Under water it is skipped -- a road does not show through a lake.
        if (RD && RD[i] && w <= 0.002) { r = r * 0.55 + 118 * 0.45; g = g * 0.55 + 108 * 0.45; b = b * 0.55 + 96 * 0.45; }
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
    // Five draw calls for the whole colony (body, features, tips, burden,
    // glue) — five is the ceiling forever — and pickKin still reads lanternPos
    // so the reach and the inspector survive.
    //
    // ⚠️ NO MERGING LIBRARY. BufferGeometryUtils is an examples module and is
    // NOT in the vendored core — the body (lathe + legs + arms + eye whites)
    // and the feature layer are both hand-merged from non-indexed primitives
    // below. Do not reach for mergeBufferGeometries; it does not exist here.
    //
    // ⚠️ THE FRAME MOVED, NOT THE FIGURE. Legs demanded the lathe base lift to
    // local y=0.008 while _paintKin's yOff dropped 0.012 -> 0.004 — the two
    // cancel exactly, so every part of the old figure stands at the world
    // height it always did and the legs simply fill the gap it used to float
    // across. Every head feature (eye whites here, pupils/mouth/antenna in the
    // dark layer, the 0.0505 tip constant in _paintLantern) carries the same
    // +0.008; change one and you must change them all or the face slides off
    // the head.
    const prof = [
      [0.0000, 0.0000], [0.0085, 0.0010], [0.0105, 0.0062], [0.0078, 0.0130],
      [0.0046, 0.0160],                                     // the neck pinch
      [0.0088, 0.0205], [0.0102, 0.0252], [0.0062, 0.0300], // the big head
      [0.0000, 0.0328],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const lathe = new THREE.LatheGeometry(prof, 10);

    // hand-merge the body with a per-vertex aTint channel: 1.0 on the eye
    // whites (near-white no matter what the paint says), a baked belly patch
    // on the front of the pear, 0 everywhere else. Tints are computed in each
    // part's OWN local space before the translate, so the belly band reads
    // off the lathe's own y — bake after translating and the band lands on
    // the shins.
    const bparts = [];   // { g: non-indexed geometry, t: per-vertex aTint }
    const addBody = (geo, tint, x, y, z) => {
      const g0 = geo.toNonIndexed();
      const nv0 = g0.attributes.position.count;
      const ta = new Float32Array(nv0);
      if (typeof tint === 'function') {
        const p0 = g0.attributes.position;
        for (let i = 0; i < nv0; i++) ta[i] = tint(p0.getX(i), p0.getY(i), p0.getZ(i));
      } else if (tint) ta.fill(tint);
      g0.translate(x, y, z);
      bparts.push({ g: g0, t: ta });
    };
    // torso + head, lifted onto the legs; a lighter patch on the belly front
    const maxR = 0.0105;
    addBody(lathe, (px, py, pz) =>
      (py > 0.004 && py < 0.016) ? Math.max(0, pz / maxR) * 0.35 : 0, 0, 0.008, 0);
    // two stub legs reaching down so the feet actually meet the flock
    addBody(new THREE.CylinderGeometry(0.0016, 0.0020, 0.0100, 6), 0, -0.0045, 0.005, 0);
    addBody(new THREE.CylinderGeometry(0.0016, 0.0020, 0.0100, 6), 0,  0.0045, 0.005, 0);
    // arm nubs at the shoulder
    addBody(new THREE.SphereGeometry(0.0022, 6, 4), 0, -0.0085, 0.020, 0);
    addBody(new THREE.SphereGeometry(0.0022, 6, 4), 0,  0.0085, 0.020, 0);
    // eye WHITES — moved out of the dark layer so they render near-white and
    // the pupils in the feature layer sit proud of them
    addBody(new THREE.SphereGeometry(0.0034, 7, 5), 1.0, -0.0044, 0.0326, 0.0082);
    addBody(new THREE.SphereGeometry(0.0034, 7, 5), 1.0,  0.0044, 0.0326, 0.0082);
    let bTot = 0;
    for (const bp of bparts) bTot += bp.g.attributes.position.count;
    const bpos = new Float32Array(bTot * 3), bnor = new Float32Array(bTot * 3);
    const btint = new Float32Array(bTot);
    let boff = 0;
    for (const bp of bparts) {
      bpos.set(bp.g.attributes.position.array, boff * 3);
      bnor.set(bp.g.attributes.normal.array, boff * 3);
      btint.set(bp.t, boff);
      boff += bp.g.attributes.position.count;
    }
    const body = new THREE.BufferGeometry();
    body.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
    body.setAttribute('normal', new THREE.BufferAttribute(bnor, 3));
    body.setAttribute('aTint', new THREE.BufferAttribute(btint, 1));

    // painted-toy material; per-instance colour carries the hue.
    // ⚠️ aTint injection point matters: with InstancedMesh + setColorAt, three
    // folds vertexColor·instanceColor into diffuseColor inside color_fragment,
    // so the mix must come AFTER that include — it lerps the FINAL instance-
    // tinted colour toward off-white, which is what keeps the eye whites white
    // over any paint. (Same onBeforeCompile pattern as the lantern points.)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.02 });
    bodyMat.onBeforeCompile = (sh2) => {
      sh2.vertexShader = sh2.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTint;\nvarying float vTint;')
        .replace('#include <color_vertex>', '#include <color_vertex>\n  vTint = aTint;');
      sh2.fragmentShader = sh2.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTint;')
        .replace('#include <color_fragment>',
          '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93,0.94,0.90), vTint);');
    };
    this.bodies = new THREE.InstancedMesh(body, bodyMat, CAP);
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

    // the dark features: PUPILS proud of the whites, a mouth dash, and the
    // antenna stalk (unchanged in shape — it just rides the same +0.008 the
    // head did). One draw call. Hand-merged: everything to non-indexed,
    // concatenate position+normal. The big dark eyes of the first figure
    // became the eye WHITES in the body mesh above; only what must never take
    // the paint stays in this layer.
    const parts = [];
    const put = (geo, x, y, z) => { geo.translate(x, y, z); parts.push(geo.toNonIndexed()); };
    put(new THREE.SphereGeometry(0.0016, 6, 4), -0.0044, 0.0326, 0.0102);   // left pupil
    put(new THREE.SphereGeometry(0.0016, 6, 4),  0.0044, 0.0326, 0.0102);   // right pupil
    put(new THREE.BoxGeometry(0.0022, 0.0008, 0.0006), 0, 0.0275, 0.0098);  // the mouth dash
    put(new THREE.CylinderGeometry(0.0005, 0.0009, 0.0105, 4), 0, 0.0450, 0); // antenna
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

    // THE BURDEN — what a kin is carrying, held against the chest: bone-pale
    // when they carry their dead home (goal 8), raw timber when they walk to
    // a build (goal 10). The chest offset is baked into the geometry, so each
    // instance takes the SAME matrix as its body and is hidden by the same
    // scale-away trick the eggs use — InstancedMesh has no per-instance
    // visibility. This is the fifth and FINAL colony draw call.
    const burdenGeo = new THREE.BoxGeometry(0.006, 0.005, 0.004);
    burdenGeo.translate(0, 0.014, 0.0105);
    this.burden = new THREE.InstancedMesh(burdenGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), CAP);
    this.burden.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.burden.count = 0;
    this.burden.frustumCulled = false;
    for (let i = 0; i < CAP; i++) this.burden.setColorAt(i, this._col);
    this.burden.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.jar.add(this.burden);

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
    this._m4b = new THREE.Matrix4();     // the burden's hidden matrix — never clobbers _m4
    this._e = new THREE.Euler();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._sc = new THREE.Vector3();
    this._boneC = new THREE.Color(0xcfc9bd);      // the dead, wrapped
    this._timberC = new THREE.Color(0x8a6b42);    // raw building timber
    this._rimeC = new THREE.Color(0.72, 0.70, 0.66);  // the bone-grey of stage rime
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
    // ⚠️ 0.0505 is the antenna TOP in the legged frame (stalk centre 0.0450 +
    // half its 0.0105 height). It was 0.0425 when the lathe base sat at local
    // zero; the +0.008 body lift and the yOff drop in _paintKin cancel, so the
    // glow stays at the same world height it always had. lanternPos still
    // means "the antenna tip" — pickKin depends on that meaning.
    this.lanternPos[o] = x; this.lanternPos[o + 1] = y + 0.0505 * sz; this.lanternPos[o + 2] = z;
    this.lanternCol[o] = this._col.r; this.lanternCol[o + 1] = this._col.g; this.lanternCol[o + 2] = this._col.b;
    this.lanternSize[n] = (0.028 + b * 0.048) * grow * (0.85 + (1 - s.daylight) * 0.50);
  }

  _paintKin() {
    const s = this.sim, k = s.k;
    const G2 = LOCI.length * 2;
    let n = 0, glueSeen = false;
    for (let id = 0; id < s.count; id++) {
      if (!k.alive[id]) continue;
      // ⚠️ let, NOT const: the held branch below reassigns x/z to the hand's
      // cell. As a const this was a strict-mode TypeError the first time a kin
      // was carried over the board — the exact moment of the game's biggest
      // power, crashing the frame loop. Caught by the graphics review, not by
      // any test, because every headless test runs without a view.
      // ⚠️ yOff was 0.012 back when the lathe base WAS the bottom of the
      // figure and it floated on that offset. The legs now own local 0..0.010
      // and the body starts at 0.008, so 0.004 plants the feet on the flock —
      // the small remainder covers the gap between the coarse cell height used
      // here and the smoothed display terrain.
      let [x, y, z] = this.cellToLocal(k.x[id], k.y[id], 0.004);
      const st = k.stage[id];
      const grow = st === STAGE.EGG ? 0.62 : st === STAGE.NIB ? 0.7 : st === STAGE.HALF ? 0.86 : 1;
      const sz = k.size[id] * grow;

      // BLOODLINE SILHOUETTES: the two marrow allele bytes set the body WIDTH
      // (x/z only — height belongs to age and stage). Children share alleles
      // with their parents, so families share shapes across the whole board.
      const gO = id * G2;
      const m0 = k.genome[gO + L.marrow * 2], m1 = k.genome[gO + L.marrow * 2 + 1];
      const wf = 0.92 + ((m0 * 3 + m1) % 16) / 16 * 0.15;

      // gait: a squash-and-stretch bob. View-only, so Math.sin is fine here.
      const ph = this.t * (2.2 + k.pulse[id] * 0.5) + (this.phase ? this.phase[id] : k.phase[id]) * 6.28;
      const moving = Math.abs(k.tx[id] - k.x[id]) + Math.abs(k.ty[id] - k.y[id]) > 0.5 && st !== STAGE.EGG;
      const bob = moving ? Math.abs(Math.sin(ph)) : 0.5 + Math.sin(ph * 0.35) * 0.08;
      const sq = 1 + (moving ? Math.sin(ph * 2) * 0.16 : Math.sin(ph * 0.5) * 0.04);

      // GAIT AS HEALTH: a bright kin bounces, a failing one barely lifts its
      // feet, and stage rime stiffens everything. ⚠️ AMPLITUDE ONLY, never
      // frequency — the phase term above is shared clockwork, and scaling the
      // rate would make the whole colony's phase jump every time somebody's
      // day went badly.
      const wb = k.bright[id];
      // ⚠⚠⚠ THE DYING USED TO RENDER AS PERFECTLY HEALTHY. Every wellbeing
      // channel below keyed off `bright`, which is 0.12 + MEAN(all six needs)
      // * 0.88 (sim.js) — and a mean cannot fall. One need at zero moves it by
      // at most 1/6 * 0.88 = 0.147, so the thresholds were unreachable BY
      // ARITHMETIC. Measured over 2,647,972 sampled kin-frames (3 seeds, 240
      // days): the droop fired on 0.038% of frames and the shiver fired ZERO
      // TIMES, EVER. `bright` never went below 0.4085 against a 0.42 droop
      // threshold, so the largest forward lean any creature ever expressed was
      // 0.73 DEGREES.
      // Meanwhile `k.strain` is the actual 0..1 death clock — it climbs at
      // dt/3.2 hungry, dt/1.6 thirsty, dt/0.9 cold, dt/0.35 hot, dt/0.09
      // drowning, and at 1.0 the kin dies — and grep for `strain` in this file
      // returned exactly ONE hit, inside the word "constraint" in a comment.
      // At the literal instant of a strain death, 98.8% of the dying rendered
      // as fine. That is most of what "there are no stakes" meant: you could
      // not see anybody suffering, because nothing on screen was looking.
      // ⚠️ PURE READ. `strain` is already in `k`, already round-trips through
      // the save, and is already folded into fingerprint() — this changes
      // nothing about the simulation, only what the player is shown.
      const ail = st === STAGE.EGG ? 0 : k.strain[id];
      // a failing body moves less, and moves worse
      let amp = (0.7 + wb * 0.5) * (1 - ail * 0.6);
      if (st === STAGE.RIME) amp *= 0.6;

      // body paint: the same hue the lantern used to carry, worn as PAINT.
      // Saturation drops and the whole figure dims as wellbeing falls, so the
      // colony still reads at a glance — a struggling quarter of town goes
      // grey-dim while the healthy stay vivid. Palette-remapped like the tip.
      // ⚠️ saturation and lightness now carry `ail` too, so a failing toy
      // visibly drains toward grey while the healthy stay vivid. This is the
      // at-a-glance read the comment above always claimed and never delivered.
      this._col.setHSL(hueOf(k.hue[id]) / 360,
        st === STAGE.EGG ? 0.10 : (0.30 + wb * 0.34) * (1 - ail * 0.7),
        st === STAGE.EGG ? 0.62 : (0.26 + wb * 0.26) * (1 - ail * 0.35));
      // rime: the paint itself goes a third of the way to bone — the last
      // stage reads at a glance even when the figure is standing still
      if (st === STAGE.RIME) this._col.lerp(this._rimeC, 0.35);
      this.bodies.setColorAt(n, this._col);

      // posture: a failing kin DROOPS — pitched forward, sagging. This is the
      // distance read that replaces the dimming lantern, and it costs a pitch
      // term in the same quaternion the yaw already used.
      // ⚠️ `ail * 0.55` is 0.55 rad — 31.5 degrees — at death's door, where the
      // old term topped out at 0.73 degrees. The bright term is kept so a
      // merely miserable toy still sags a little before the clock starts.
      const droop = st === STAGE.EGG ? 0 : ail * 0.55 + Math.max(0, 0.42 - wb) * 1.1;

      // the one who stays never bobs and never turns — they are stuck fast,
      // and the stillness is the tell before you ever open the inspector
      if (k.glued[id]) {
        // ⚠️ -0.002, not -0.010: y carries the new smaller yOff, and the decal
        // must land where it always did — surface + 0.002, riding polygonOffset
        this.glue.position.set(x, y - 0.002, z);
        this.glue.visible = true; glueSeen = true;
        this._v.set(x, y, z);
        // the family width still shows — being glued changes what they can DO,
        // not what bloodline they are
        this._sc.set(sz * wf, sz, sz * wf);
        this._e.set(droop, k.phase[id] * 6.28, 0, 'YXZ');
        this._q.setFromEuler(this._e);
        this._m4.compose(this._v, this._q, this._sc);
        this.bodies.setMatrixAt(n, this._m4);
        this.features.setMatrixAt(n, this._m4);
        this._paintBurden(id, n);
        this._paintLantern(id, n, x, y, z, sz, grow, st);
        this.kinScreen[n] = id; n++;
        continue;
      }

      // ⚠️ somebody in the air rides at the hand, and the BODY has to go with
      // the tip — before this only the glow lifted and the figure stayed on the
      // ground, which read as the hand stealing a soul instead of a person.
      let hy = 0, held = false;
      if (this.sim.held && this.sim.held.id === id) {
        held = true;
        const c = this.heldCell;
        if (c) { const N = this.sim.N;
          x = (c[0] / (N - 1) - 0.5) * GR * 2;
          z = (c[1] / (N - 1) - 0.5) * GR * 2; }
        hy = 0.16 + Math.sin(this.t * 2.1) * 0.006;
      }

      // temper posture: the dominance ladder, inlined from expressed() — a
      // subarray per kin per frame is garbage-collector bait at 60fps. The
      // temper alleles are [placid, curious, fearful, cruel], lowest index
      // wins. Eggs have no posture; they are eggs.
      const tmin = Math.min(k.genome[gO + L.temper * 2], k.genome[gO + L.temper * 2 + 1]);
      let tPitch = 0, tY = 1;
      if (st !== STAGE.EGG) {
        if (tmin === 1) tPitch = 0.06;                       // curious leans in
        else if (tmin === 2) { tPitch = 0.10; tY = 0.96; }   // fearful hunches
        else if (tmin === 3) tPitch = -0.05;                 // cruel struts, chest out
      }

      this._v.set(x, y + hy + (moving ? bob * 0.006 * amp : 0), z);
      this._sc.set((sz / sq) * wf, sz * sq * tY, (sz / sq) * wf);
      // held: they slowly turn in the hand — being looked at from every side
      let face = held ? this.t * 0.6
        : Math.atan2(k.tx[id] - k.x[id], k.ty[id] - k.y[id]);
      // the shiver: a kin at the bottom of its wellbeing cannot hold still.
      // Jitter, not gait — this one may run off this.t directly.
      // ⚠️ keyed off the death clock, not the mean. `wb < 0.25` never once
      // happened in 2.6 million frames; `ail > 0.45` is roughly the last third
      // of a dying toy's life.
      if (ail > 0.45 && st !== STAGE.EGG) face += Math.sin(this.t * 31 + id) * 0.03;
      // a moving kin leans INTO the walk a little; a failing one sags the same
      // way, further — one axis, two readings, both honest
      const lean = tPitch + droop + (moving ? 0.14 + Math.sin(ph * 2) * 0.05 : 0);
      // the waddle: a roll around the walk axis, health-scaled like the bob
      const roll = moving ? Math.sin(ph) * 0.09 * amp : 0;
      this._e.set(lean, face, roll, 'YXZ');
      this._q.setFromEuler(this._e);
      this._m4.compose(this._v, this._q, this._sc);
      this.bodies.setMatrixAt(n, this._m4);
      this._paintBurden(id, n);
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
    this.burden.count = n;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.features.instanceMatrix.needsUpdate = true;
    this.burden.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.burden.instanceColor) this.burden.instanceColor.needsUpdate = true;
    this.lanterns.geometry.setDrawRange(0, n);
    this.lanterns.geometry.attributes.position.needsUpdate = true;
    this.lanterns.geometry.attributes.color.needsUpdate = true;
    this.lanterns.geometry.attributes.psize.needsUpdate = true;
    this.kinCount = n;
  }

  // THE BURDEN, per instance — visible only while the kin is actually
  // carrying: the dead home (goal 8, bone-pale) or timber to a build
  // (goal 10, raw wood). The chest offset is baked into the geometry, so the
  // visible branch reuses this._m4 exactly as the body composed it.
  // ⚠️ call this right after bodies.setMatrixAt and BEFORE the egg trick
  // recomposes _m4 for the features — and the hidden branch writes _m4b, not
  // _m4, because the features still need the body's matrix afterwards.
  _paintBurden(id, n) {
    const g = this.sim.k.goal[id];
    if (g === 8 || g === 10) {
      this.burden.setMatrixAt(n, this._m4);
      this.burden.setColorAt(n, g === 8 ? this._boneC : this._timberC);
    } else {
      // the egg scale trick: InstancedMesh has no per-instance visibility,
      // so scale it away instead
      this._sc.set(0.0001, 0.0001, 0.0001);
      this._m4b.compose(this._v, this._q, this._sc);
      this.burden.setMatrixAt(n, this._m4b);
    }
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
  // ⚠️ THIS IS ALSO WHERE THE ACT LANDS. main.js pushes f up to 1 and only
  // THEN calls sim.mend/smite/still/lift — so the frame f first reaches 1 is
  // exactly the frame the thing happens, and view.js can pay out the spectacle
  // without main.js knowing this file exists.
  // ⚠️ 'lift' keeps being pushed at f === 1 for as long as the kin is in the
  // air (the reach is not cleared for a lift), so the payout has to be keyed
  // and one-shot or the shaft re-fires every frame you carry somebody.
  setReach(id, f, power) {
    const P = power || 'lift';
    if (this.vfx && f >= 1 && id >= 0) {
      const key = id + ':' + P;
      if (this._reachDone !== key) {
        this._reachDone = key;
        const k = this.sim.k;
        this.vfx.fire(P, k.x[id], k.y[id]);
      }
    } else if (f < 0.6) this._reachDone = '';
    this.reachId = id; this.reachF = f; this.reachPower = P;
  }

  // —— THE SPECTACLE, FROM OUTSIDE ————————————————————————————
  // main.js reaches all of this as app.view.vfx.* ; these are the thin
  // convenience wrappers so a caller never has to know the pool exists.
  //   v.fxPower('call', cx, cy)      — the named verb, fully composed
  //   v.fxRing(cx, cy, {color, r0, r1, life, width, alpha, fill, ease})
  //   v.fxBurst(cx, cy, {color, n, speed, up, life, size, grav, drag})
  //   v.fxColumn(cx, cy, {color, life, h, rBot, rTop, alpha, rise})
  //   v.fxConverge(cx, cy, {color, n, r, life, pull})
  //   v.fxTrail(cx, cy, {key, color, y, size, gap})  — safe every frame; pass
  //        a distinct `key` per concurrent stream ('lift' is taken) or two
  //        trails throttle each other and both look broken
  //   v.fxSplash(cx, cy)             — water. THE OTHER ENGINEER'S HOOK.
  // ⚠️ every one of these is a no-op before the constructor finishes, because
  // several of them are reachable from input handlers that bind early.
  fxPower(name, cx, cy, o) { if (this.vfx) this.vfx.fire(name, cx, cy, o); }
  fxRing(cx, cy, o) { if (this.vfx) this.vfx.ring(cx, cy, o); }
  fxBurst(cx, cy, o) { if (this.vfx) this.vfx.burst(cx, cy, o); }
  fxColumn(cx, cy, o) { if (this.vfx) this.vfx.column(cx, cy, o); }
  fxConverge(cx, cy, o) { if (this.vfx) this.vfx.converge(cx, cy, o); }
  fxTrail(cx, cy, o) { if (this.vfx) this.vfx.trail(cx, cy, o); }
  fxSplash(cx, cy, o) { if (this.vfx) this.vfx.splash(cx, cy, o); }

  // point the camera at where they actually live
  lookAtTown() {
    const s = this.sim, k = s.k;
    let cx = 0, cy = 0, n = 0;
    for (let i = 0; i < s.count; i++) if (k.alive[i]) { cx += k.x[i]; cy += k.y[i]; n++; }
    if (!n) return;
    cx /= n; cy /= n;
    const N = s.N;
    // ⚠ HELD TO THE SAME SLACK THE WALK IS. Without this the auto-aim can put
    // the camera somewhere the player is not allowed to walk to — which both
    // shows the dark past the rim and makes the two clamps fight each frame,
    // reading as a jitter. When the board already fills the screen the slack is
    // zero and the camera simply stays centred, which is correct: there is
    // nothing off-centre to go and look at.
    const lim = this.panLimitNow();
    let tx = (cx / (N - 1) - 0.5) * GR * 2, tz = (cy / (N - 1) - 0.5) * GR * 2;
    // ⚠ clamped as a RADIUS, not per axis — see the note in solvePanLimit
    const rr2 = Math.sqrt(tx * tx + tz * tz);
    if (rr2 > lim && rr2 > 0) { const k2 = lim / rr2; tx *= k2; tz *= k2; }
    this.centerTo.set(tx, 0.06, tz);
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
    // ⚠️ THE CRUMB IS DETECTED, NOT SIGNALLED. There are two ways to feed them
    // (the armed power and the double tap) and only one of them flinches, so
    // watching the list is the only place that catches both. sim.give appends,
    // and _gifts splices from the tail — so a newly arrived crumb is always at
    // the end of a LONGER list, and this cannot mistake a decayed one for a new
    // one. Puff at the crumb's own cell, not at the cursor.
    if (g.length > this._giftSeen)
      for (let i = this._giftSeen; i < g.length; i++) this.vfx.fire('crumb', g[i].x, g[i].y);
    this._giftSeen = g.length;
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
  setHeldAt(cell) {
    this.heldCell = cell;
    // somebody in your hand trails. The lantern is drawn 0.16 above the
    // scenery (see _paintLantern), so the wake is dropped at the same height
    // or it comes out of their feet instead of out of them.
    if (cell && this.vfx && this.sim.held)
      this.vfx.trail(cell[0], cell[1], { key: 'lift', color: 0xffb861, y: this._surfaceY(cell[0], cell[1]) + 0.155, size: 0.03, up: 0.4, gap: 0.05 });
  }

  // cx, cy in cells; r in cells; e is 0 (hot and narrow) … 1 (resting and wide)
  setHandDisc(cx, cy, r, e) {
    if (!this.handDisc) return;
    if (cx == null) { this._handWant = 0; if (this.vfx) this.vfx.setHand(null); return; }
    // ⚠️ the motes are fed the SAME r and e the ring is drawn from, for the
    // same reason the ring is: two readouts of one hand must never disagree.
    if (this.vfx) this.vfx.setHand(cx, cy, r, e);
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

  // —— WINDOWS AND RAIN —————————————————————————————————
  // The Anno/SimCity 'the town is alive' read is buildings that LIGHT UP at
  // dusk. One InstancedMesh of tiny warm quads, anchored to finished dwellings,
  // opacity driven by night — the bloom pass turns them into lit windows for
  // free. Rebuilt only when the works set changes; +1 draw call total.
  _nightLife() {
    this.windowIM = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.0074, 0.0092),
      new THREE.MeshBasicMaterial({
        color: 0xffca7a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }), 160);
    this.windowIM.count = 0;
    this.windowIM.frustumCulled = false;
    this.jar.add(this.windowIM);
    this._winSig = '';

    // CHIMNEY SMOKE. Houses and the hall have had chimneys since the pitched-
    // roof pass and they have never smoked. One Points system; anchors are
    // harvested from the tagged chimney meshes whenever the works set changes.
    // ⚠️ opacity ceiling is deliberate: the haze dome was MEASURED costing
    // 55% of the board's saturation as a careless veil — additive smoke over
    // twenty houses must never become the same mistake. 0.09 per puff, hard.
    const SM = 200;
    this._smokeN = SM;
    const sg2 = new THREE.BufferGeometry();
    this._smokePos = new Float32Array(SM * 3);
    sg2.setAttribute('position', new THREE.BufferAttribute(this._smokePos, 3));
    sg2.setDrawRange(0, 0);
    const smokeTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d');
      const r = g.createRadialGradient(16, 16, 1, 16, 16, 15);
      r.addColorStop(0, 'rgba(210,214,220,0.9)'); r.addColorStop(1, 'rgba(210,214,220,0)');
      g.fillStyle = r; g.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(c);
    })();
    this.smoke = new THREE.Points(sg2, new THREE.PointsMaterial({
      size: 0.02, map: smokeTex, transparent: true, opacity: 0.09,
      depthWrite: false, sizeAttenuation: true,
    }));
    this.smoke.frustumCulled = false;
    this.jar.add(this.smoke);
    this._stacks = [];               // world-space chimney tops
    this._smokeSeed = [];
    for (let i = 0; i < SM; i++) this._smokeSeed.push(Math.random());

    // RAIN. s.rainLeft was invisible — the sky event with no sky. Slanted
    // additive line segments inside the jar group, so tilting the board slants
    // the rain WITH it (physically wrong, visually right: the rain is theirs).
    const RN = 320;
    this._rainN = RN;
    const rg = new THREE.BufferGeometry();
    this._rainPos = new Float32Array(RN * 2 * 3);
    rg.setAttribute('position', new THREE.BufferAttribute(this._rainPos, 3));
    rg.setDrawRange(0, 0);
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({
      color: 0x9db8cc, transparent: true, opacity: 0.15,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.rain.frustumCulled = false;
    this.jar.add(this.rain);
    this._rainSeed = [];
    for (let i = 0; i < RN; i++) this._rainSeed.push([Math.random(), Math.random(), Math.random()]);
  }

  _paintNightLife(dt) {
    const s = this.sim;
    // -- windows: rebuild anchors only when the finished-dwelling set changes
    let sig = '';
    for (const [o] of this.workViews) if (o.kind >= 3 && o.prog >= 0.98) sig += o.x + ',' + o.y + ',' + o.kind + ';';
    if (sig !== this._winSig) {
      this._winSig = sig;
      const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), q = new THREE.Quaternion(),
            sc = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
      let n = 0;
      for (const [o, g] of this.workViews) {
        // ⚠ A FIELD AND A WELL HAVE NO WINDOWS. This was `o.kind < 3`, and the
        // trailing `else` below hands out the HALL's three-window row — so the
        // moment the farming age shipped, every field on the board lit three
        // windows in mid-air at night and every well lit three more.
        if (o.kind < 3 || o.kind === 6 || o.kind === 7 || o.prog < 0.98 || n >= 158) continue;
        // ⚠️ OUTSIDE the deepest wall, or the quad sits inside the box and the
        // depth test hides it — 7 windows rendered invisible on the first pass
        // because a house body can be 0.062 deep and the quad sat at z 0.023.
        const spots = o.kind === 3 ? [[0, 0.014, 0.036]]
          : o.kind === 4 ? [[-0.014, 0.019, 0.038], [0.014, 0.019, 0.038]]
          // a granary is a store, not a home: one lamp over the loading step
          : o.kind === 8 ? [[0, 0.040, 0.033]]
          : [[-0.030, 0.027, 0.048], [0, 0.027, 0.048], [0.030, 0.027, 0.048]];
        for (const [lx, ly, lz] of spots) {
          // group-local offset through the group's own yaw, or windows float
          // off the corners of every rotated building
          // ⚠ authored in group-local units, so they must pass through the
          // group's SCALE before its yaw — otherwise every window sinks into
          // the wall the moment the building is not sitting at scale 1.
          v3.set(lx, ly, lz).multiply(g.scale).applyAxisAngle({ x: 0, y: 1, z: 0 }, g.rotation.y);
          v3.add(g.position);
          e.set(0, g.rotation.y, 0); q.setFromEuler(e);
          sc.setScalar(g.scale.x);
          m4.compose(v3, q, sc);
          this.windowIM.setMatrixAt(n++, m4);
        }
      }
      this.windowIM.count = n;
      this.windowIM.instanceMatrix.needsUpdate = true;
      // re-harvest the chimney tops from the tagged meshes — group-local
      // position through the group's yaw, exactly like the window quads
      this._stacks.length = 0;
      const wv = new THREE.Vector3();
      for (const [o, g] of this.workViews) {
        if (o.kind < 4 || o.prog < 0.98) continue;
        g.traverse(m => {
          if (!m.userData.chimney) return;
          wv.copy(m.position); wv.y += m.userData.chimney / 2;
          wv.multiply(g.scale);   // ⚠ same reason as the windows above
          wv.applyAxisAngle({ x: 0, y: 1, z: 0 }, g.rotation.y);
          wv.add(g.position);
          this._stacks.push([wv.x, wv.y, wv.z]);
        });
      }
    }
    // smoke rises from every stack: per-puff loop of rise + drift + regrow
    if (this._stacks.length) {
      const perStack = Math.max(3, Math.min(8, (this._smokeN / this._stacks.length) | 0));
      const total = Math.min(this._smokeN, perStack * this._stacks.length);
      const pos = this._smokePos;
      for (let i = 0; i < total; i++) {
        const st = this._stacks[(i / perStack) | 0];
        const ph = this._smokeSeed[i];
        const f = ((this.t * 0.055 * (0.7 + ph * 0.6) + ph) % 1);
        const o = i * 3;
        pos[o] = st[0] + Math.sin((this.t * 0.4 + ph * 9)) * 0.004 * f + f * 0.010;
        pos[o + 1] = st[1] + f * 0.055;
        pos[o + 2] = st[2] + Math.cos((this.t * 0.33 + ph * 7)) * 0.004 * f;
      }
      this.smoke.geometry.setDrawRange(0, total);
      this.smoke.geometry.attributes.position.needsUpdate = true;
    } else this.smoke.geometry.setDrawRange(0, 0);
    // dusk brings them up; the lamp being on does not put them out — a lit
    // window is the household's own light, not the room's
    const nightF = 1 - s.daylight;
    this.windowIM.material.opacity = Math.max(0, nightF - 0.35) * 1.15;

    // -- rain
    const raining = s.rainLeft > 0;
    if (raining) {
      const RN = this._rainN, pos = this._rainPos;
      const H = 0.55, slX = 0.05, len = 0.045;
      for (let i = 0; i < RN; i++) {
        const [ax, az, aph] = this._rainSeed[i];
        const f = ((this.t * (0.9 + aph * 0.5) + aph * 7) % 1);
        const x = (ax - 0.5) * GR * 2 + f * slX;
        const z = (az - 0.5) * GR * 2;
        const y = EDGE_Y + H * (1 - f);
        const o = i * 6;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        pos[o + 3] = x - slX * 0.12; pos[o + 4] = y + len; pos[o + 5] = z;
      }
      this.rain.geometry.setDrawRange(0, RN * 2);
      this.rain.geometry.attributes.position.needsUpdate = true;
    } else {
      this.rain.geometry.setDrawRange(0, 0);
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

  // ── THE BOARD FILLS THE SCREEN ─────────────────────────────────
  // Kyle: "the map should take up the whole screen and be endless, no grey
  // space". The zoom-out limit was a flat 2.75, and at 2.75 the board covers
  // only 6-86% of the width — dead room down both sides.
  // ⚠⚠ A CONSTANT CANNOT FIX THIS, WHICH IS WHY IT IS COMPUTED. The furthest
  // zoom that still covers the frame depends on the window's ASPECT, hard:
  // measured 2.2 on a tall 5:4, 1.8 on 16:9, and 1.2 on a 21:9 ultrawide. Any
  // single number either leaves grey on the wide monitors or robs the tall ones
  // of most of their view. So we solve for it whenever the window changes.
  // ⚠ Scanned across the WHOLE legal elevation range, not just the current one:
  // the player can tilt freely once they are there, and which elevation is worst
  // flips with the aspect (on ultrawide the mid angle is the worst, not the low
  // one). We take the tightest.
  // Uses a scratch camera and touches no live state.
  fitLimits() {
    try { return this._fitLimits(); }
    catch (e) { this.maxDist = this.maxDist || 1.6; this.panLimit = this.panLimit || 0; return this.maxDist; }
  }

  _fitLimits() {
    const cam = this._fitCam || (this._fitCam = this.camera.clone());
    cam.aspect = this.camera.aspect;
    cam.fov = this.camera.fov; cam.near = this.camera.near; cam.far = this.camera.far;
    cam.updateProjectionMatrix();
    const corners = [[0, 0], [this.sim.N - 1, 0], [0, this.sim.N - 1], [this.sim.N - 1, this.sim.N - 1]]
      .map(([cx, cy]) => this.cellToLocal(cx, cy, 0));
    const p = new THREE.Vector3();
    // ⚠⚠ CAST THE SCREEN ONTO THE BOARD, DO NOT PROJECT THE BOARD ONTO THE
    // SCREEN. Two earlier versions of this test projected the four board corners
    // and both were wrong. The bounding box of those corners containing the
    // screen is not sufficient — the board is a SQUARE and the camera is orbited,
    // so a rotated quad's bbox can cover the screen while its own edges cut the
    // screen's top corners (photographed: dark wedges top-left and top-right).
    // And testing the quad itself is WORSE, because a corner outside the frustum
    // projects to meaningless NDC — measured (-12.15, 38.97) for one board corner
    // — which scrambles the winding and makes the polygon test nonsense.
    // Going the other way is stable: fire a ray through each corner of the
    // screen, meet the ground plane, and ask whether that point is on the board.
    // A ray that never comes down is the horizon, which is the worst case there
    // is.
    const NDC = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const ray = new THREE.Vector3();
    const covers = (dist, el, az, ox, oz) => {
      ox = ox || 0; oz = oz || 0;
      const cy2 = Math.cos(el), sy2 = Math.sin(el);
      const camX = ox + Math.sin(az) * cy2 * dist;
      const camY = sy2 * dist + 0.10;
      const camZ = oz + Math.cos(az) * cy2 * dist;
      cam.position.set(camX, camY, camZ);
      cam.lookAt(ox, 0.06, oz);
      cam.updateMatrixWorld(true);
      for (const [nx2, ny2] of NDC) {
        ray.set(nx2, ny2, 0.5).unproject(cam);
        ray.x -= camX; ray.y -= camY; ray.z -= camZ;
        if (ray.y >= -1e-6) return false;          // that corner is the horizon
        const tt = -camY / ray.y;
        const hx = camX + ray.x * tt, hz = camZ + ray.z * tt;
        if (hx < -APRON_GR || hx > APRON_GR || hz < -APRON_GR || hz > APRON_GR) return false;
      }
      return true;
    };
    // ⚠ THE BEST ANY LEGAL ANGLE CAN DO, not the worst. A steeper look fits more
    // board on the screen — measured 0.85 at the low floor against 1.20 looking
    // almost straight down — so taking the worst angle threw away 40% of the view
    // for nothing. The angle is then RAISED to suit the zoom in applyCamera
    // (see minElFor), which is also how it should look: pull back and the room
    // tips toward a plan view of the whole layout.
    let best = 0.60;
    for (let d = 0.60; d <= 3.0; d += 0.05) {
      if (!covers(d, EL_MAX, this.orbit.az)) break;
      best = d;
    }
    // ⚠ capped: the apron means 'no void' no longer limits anything, so without
    // this the far stop drifts out to wherever the maths allows.
    this.maxDist = Math.min(best, ZOOM_OUT_MAX);
    this._fitCovers = covers;
    this.panLimit = this.solvePanLimit(this.orbit.dist);
    return best;
  }

  // The shallowest angle that still keeps the board over the whole screen at
  // this zoom. Pulling back forces the look steeper rather than showing the
  // basement floor around the layout.
  minElFor(dist) {
    const covers = this._fitCovers;
    if (!covers) return EL_MIN;
    for (let el = EL_MIN; el <= EL_MAX; el += (EL_MAX - EL_MIN) / 12) {
      if (covers(dist, el, this.orbit.az, 0, 0)) return el;
    }
    return EL_MAX;
  }

  // ── HOW FAR THE WALK MAY STRAY ────────────────────────────────
  // Walking to the rim shows the dark past the board exactly as zooming out
  // does, so the walk needs a bound too — but it is NOT a fixed fraction of the
  // zoom. This used to be a guess, `(maxDist - dist) * 0.55 * GR`, which gave a
  // quarter of the board at the default zoom while the board was in fact
  // over-filling the screen with room to spare. Solve it the same way maxDist is
  // solved: push the centre out until a corner of the frame stops being board,
  // in the worst direction and at the worst legal elevation.
  // ⚠ Zoomed all the way out the answer is legitimately ~0: the whole board is
  // already on screen, so there is nowhere to go and nothing to see by moving.
  // ⚠ CACHED ON THE ZOOM. The solve is ~240 projections — nothing at all when
  // the wheel moves, far too much every frame. Recomputed only when the zoom has
  // actually changed enough to matter.
  panLimitNow() {
    const d = this.orbit.dist;
    if (this._plD === undefined || Math.abs(d - this._plD) > 0.02) {
      this._plD = d; this.panLimit = this.solvePanLimit(d);
    }
    return this.panLimit || 0;
  }

  // ⚠⚠ THE WALK REACHES THE WHOLE LAYOUT NOW, and that is the point of the
  // apron. This used to solve for 'how far before the void shows', which
  // measured 27-59% of the way to the rim depending on zoom and angle — so the
  // corners of the player's own town were literally unreachable. With land past
  // the board there is nothing to protect against, so the bound is simply the
  // board itself, plus enough margin to stand at its edge and look in.
  solvePanLimit(dist) {
    return GR * 1.06;
  }

  _solvePanLimitVoid(dist) {
    const covers = this._fitCovers;
    if (!covers) return 0;
    const az = this.orbit.az;
    // ⚠ DIAGONALS TOO. The walk is camera-relative, so pressing one key moves
    // the centre diagonally in world space — a limit solved only on the axes is
    // exceeded by a factor of root two on the diagonal, and the board came off
    // the edge of the screen. Measured: walking right put the centre at
    // (0.308, -0.308), radius 0.436, against an axis limit of 0.308.
    const q = Math.SQRT1_2;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [q, q], [q, -q], [-q, q], [-q, -q]];
    let lo = 0, hi = GR;
    const okAt = (r) => {
      for (const [dx, dz] of dirs) {
        for (let el = EL_MIN; el <= EL_MAX + 1e-6; el += (EL_MAX - EL_MIN) / 4) {
          if (!covers(dist, el, az, dx * r, dz * r)) return false;
        }
      }
      return true;
    };
    if (!okAt(0)) return 0;
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (okAt(mid)) lo = mid; else hi = mid; }
    return lo;
  }

  // -- frame -----------------------------------------------------------------
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.post) this.post.setSize(Math.max(2, w | 0), Math.max(2, h | 0));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitLimits();
    // a window that just got narrower can leave you already too far out
    if (this.orbit.tDist > this.maxDist) this.orbit.tDist = this.maxDist;
    if (this.orbit.dist > this.maxDist) this.orbit.dist = this.maxDist;
  }

  render(dt) {
    const s = this.sim;
    this.t += dt;

    // camera easing
    const o = this.orbit;
    o.az += (o.tAz - o.az) * Math.min(1, dt * 9);
    o.el += (o.tEl - o.el) * Math.min(1, dt * 9);
    o.dist += (o.tDist - o.dist) * Math.min(1, dt * 7);
    // ⚠️ the elevation floor is load-bearing: it is the only thing keeping the
    // horizon — and therefore whatever is beyond the board — out of frame. It
    // relaxes to EL_NEAR once you are zoomed in past EL_NEAR_DIST, because at
    // that range the board fills the frame and there is no horizon to protect
    // — and it is the only angle from which these creatures have faces.
    let elFloor = o.dist < EL_NEAR_DIST ? EL_NEAR : EL_MIN;
    // ⚠ and never shallower than the zoom can afford. Cached on the zoom for the
    // same reason panLimitNow is — the solve is far too much for every frame.
    if (o.dist >= EL_NEAR_DIST) {
      if (this._elD === undefined || Math.abs(o.dist - this._elD) > 0.02) {
        this._elD = o.dist; this._elFit = this.minElFor(o.dist);
      }
      if (this._elFit > elFloor) elFloor = this._elFit;
    }
    o.el = Math.max(elFloor, Math.min(EL_MAX, o.el));
    if (o.tEl < elFloor) o.tEl = elFloor;   // or the ease fights the clamp forever
    // ⚠️ AFTER the clamp, not before. These used to be computed from the
    // UNCLAMPED elevation, so the frame you actually saw was always one behind
    // the limit — most visible as a shimmer when you drag into the stop.
    const cy = Math.cos(o.el), sy = Math.sin(o.el);
    // ⚠️ the eye and the target move TOGETHER. Shifting only lookAt swings the
    // camera round and skews the board instead of panning across it.
    // ⚠️ RE-AIMED ON A SLOW CADENCE, not once at startup. A town migrates — it
    // follows the moss, the water and whatever you warmed — so a target fixed at
    // entry drifts off it within days and you are back to watching empty board.
    // Slow on purpose: this is the LOOK target, not the orbit, so the player
    // still owns the camera and this only keeps the crowd in frame.
    // ⚠ THE PLAYER OUTRANKS THE AUTO-AIM. `panHold` is set by the WASD walk in
    // main.js; while it is running the town does not get to pull the camera back
    // onto itself mid-stride, which would read as the keys being broken. It ticks
    // down so following the town resumes on its own a moment after you stop.
    if (this.panHold > 0) this.panHold -= dt;
    else if ((this._aimT = (this._aimT || 0) + dt) > 2) { this._aimT = 0; this.lookAtTown(); }
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
      // ⚠️ the reach drives the contact disc too, and the disc feeds the hand
      // emitter — so without this a mend spits press-sparks for 450ms while
      // the ring is closing. The reach has its own spectacle; the finger does
      // not get one as well.
      if (this.vfx) this.vfx.setHand(null);
    }

    // — LETTING GO. Over the board puts them back; off it does not, and the
    // board has to say which one just happened. Detected rather than signalled:
    // sim.held clearing with the kin still alive is a set-down, and clearing
    // with the kin dead is a taking (sim.takeAway kills them on the way out).
    {
      const hn = s.held ? s.held.id : -1;
      if (hn >= 0) this._heldWhere = this.heldCell ? [this.heldCell[0], this.heldCell[1]] : [s.k.x[hn], s.k.y[hn]];
      else if (this._heldPrev >= 0) {
        const id = this._heldPrev, w = this._heldWhere;
        if (s.k.alive[id]) this.fxPower('setdown', s.k.x[id], s.k.y[id]);
        else if (w) this.fxPower('taken', w[0], w[1]);
        this._heldWhere = null;
      }
      this._heldPrev = hn;
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
    this._paintNightLife(dt);

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
    // ⚠️ ONE update, at the END of the frame, AFTER everything that can fire
    // an effect has run — the reach branch, the held-kin check, _paintGifts.
    // Ticked here rather than in each system so a paused board holds its rings
    // exactly where they were instead of losing them to a dropped call.
    this.vfx.update(dt);
    // ⚠️ after the kin pass, never before: _hoverFrame reads lanternPos, which
    // is rewritten every frame, and a stale read puts the halo one frame behind
    // the figure — which at a walking pace is a visible slip.
    this._hoverFrame(dt);

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
  // ⚠️⚠️ RESHAPE ONLY THE RECTANGLE THAT MOVED. The display terrain is a
  // 191×191 grid — ~72k vertices and ~110k triangles — so rebuilding it on
  // every frame of a held press would cost more than the rest of the renderer
  // put together. A press is 3*S cells across, so it touches on the order of a
  // hundred vertices; walking only those, then recomputing normals, keeps a
  // continuous press cheap.
  // ⚠️ BOTH MESHES. `pickMesh` is the low-res raycast target, and if it is not
  // patched too then the ground you can SEE and the ground the pointer HITS
  // drift apart — you would aim at a hill and the game would put the crumb
  // where the flat used to be.
  reshapeGround(cx, cy, r) {
    if (!this.ground) return;
    const N = this.sim.N, SUB = this._groundSUB, M = this._groundM;
    const pad = r + 1.5;
    const pos = this.ground.geometry.attributes.position;
    const gx0 = Math.max(0, Math.floor((cx - pad) * SUB)), gx1 = Math.min(M - 1, Math.ceil((cx + pad) * SUB));
    const gy0 = Math.max(0, Math.floor((cy - pad) * SUB)), gy1 = Math.min(M - 1, Math.ceil((cy + pad) * SUB));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      pos.setY(gy * M + gx, this._heightAt(gx / SUB, gy / SUB));
    }
    pos.needsUpdate = true;
    // normals are what make a new hill catch the light instead of reading as a
    // flat smear of the old shading
    this.ground.geometry.computeVertexNormals();
    this.ground.geometry.attributes.normal.needsUpdate = true;

    const ppos = this.pickMesh.geometry.attributes.position;
    const px0 = Math.max(0, Math.floor(cx - pad)), px1 = Math.min(N - 1, Math.ceil(cx + pad));
    const py0 = Math.max(0, Math.floor(cy - pad)), py1 = Math.min(N - 1, Math.ceil(cy + pad));
    for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
      ppos.setY(y * N + x, this._surfaceY(x, y));
    }
    ppos.needsUpdate = true;
    this.pickMesh.geometry.computeBoundingSphere();
  }

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

  // ⚠️⚠️ WHY THIS EXISTS. The inspector — name, age, trade, all six needs, the
  // genome — has been built and correct this whole time, and the player reported
  // "there are no powers or way to interact". They were telling the truth from
  // where they sat: NOTHING on screen ever suggested a figure could be clicked.
  // No cursor change, no highlight, no name. A system nobody can find is a
  // system that does not exist, so the fix is not more inspector — it is one
  // ring and one name that follow the pointer.
  //
  // Returns pixel coordinates for a kin's lantern so the DOM tag can sit over
  // them, or null when they are behind the camera or off the board.
  kinScreenPos(id) {
    if (id < 0) return null;
    let n = -1;
    for (let i = 0; i < this.kinCount; i++) if (this.kinScreen[i] === id) { n = i; break; }
    if (n < 0) return null;
    const v = new THREE.Vector3(
      this.lanternPos[n * 3], this.lanternPos[n * 3 + 1], this.lanternPos[n * 3 + 2]);
    this.jar.localToWorld(v);
    v.project(this.camera);
    if (v.z > 1) return null;
    const el = this.renderer.domElement;
    // ⚠️ clientWidth, not .width: the drawing buffer is in device pixels and the
    // DOM tag is positioned in CSS pixels. On any HiDPI screen those differ by
    // the pixel ratio and the tag lands at double the offset — off-screen.
    const w = el.clientWidth || el.width, h = el.clientHeight || el.height;
    return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h];
  }

  // The hover halo. Deliberately NOT a vfx ring: those are pooled one-shots that
  // drain, and this has to persist for exactly as long as the pointer rests.
  setHoverKin(id) {
    if (this._hoverId === id) return;
    this._hoverId = id;
    if (!this._hoverRing) {
      const g = new THREE.RingGeometry(0.030, 0.040, 28);
      g.rotateX(-Math.PI / 2);
      this._hoverRing = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: 0xffe6b0, transparent: true, opacity: 0.62, depthWrite: false,
        depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        forceSinglePass: true,
      }));
      this._hoverRing.renderOrder = 12;
      this._hoverRing.frustumCulled = false;
      this.jar.add(this._hoverRing);
    }
    this._hoverRing.visible = id >= 0;
  }

  // called from render(): the ring rides the figure, and breathes so it reads as
  // a live highlight rather than a decal somebody left on the floor
  _hoverFrame(dt) {
    const r = this._hoverRing;
    if (!r || !r.visible) return;
    const id = this._hoverId, k = this.sim.k;
    if (id < 0 || !k.alive[id]) { r.visible = false; this._hoverId = -1; return; }
    let n = -1;
    for (let i = 0; i < this.kinCount; i++) if (this.kinScreen[i] === id) { n = i; break; }
    if (n < 0) { r.visible = false; return; }
    r.position.set(this.lanternPos[n * 3], 0.0016, this.lanternPos[n * 3 + 2]);
    this._hoverT = (this._hoverT || 0) + dt;
    const p = 1 + Math.sin(this._hoverT * 4.2) * 0.10;
    r.scale.set(p, 1, p);
    r.material.opacity = 0.48 + Math.sin(this._hoverT * 4.2) * 0.14;
  }
}
