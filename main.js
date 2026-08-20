// DON'T TOUCH — main.js
// Boot, fixed-timestep loop, input, persistence. View and sim never touch. (§17)

import { Sim, C, STAGE } from './sim.js';
import { View } from './view.js';
import { UI } from './ui.js';
import { Sfx } from './sfx.js';
import { Gesture } from './gesture.js';

// ⚠️ THE CONTACT CURVE. A still hand OPENS and COOLS; a moving one stays small
// and hot. That single rule is the whole difference between comfort and a burn,
// and it is why the game needs no sixth verb: resting and bearing down are the
// same gesture at two rates.
//
// Measured on a settled board (4 days, seed 'law'): a resting hand holds the
// ground at 32°, inside the comfort band of plain [18-32], ash [26-41] and
// slick [20-34]. A moving one holds 86° at the centre, which is past every
// lethal ceiling in the game — rime dies at 34, ash at 53. Before this, EVERY
// touch ran at the moving number, which is why the finger only ever read as
// cruel: there was no gentle setting to find.
const HAND = {
  restHeat: 40, hotHeat: 150,      // °, the finger's own temperature
  restR: 1.50, hotR: 0.62,         // × C.HAND_RADIUS
  cool: 1.7,                       // per second, toward resting, while still
  warm: 5.0,                       // per second, back to hot, the moment it moves
  // ⚠️ TWO THRESHOLDS, AND THE PIXEL ONE IS THE REAL ONE. Whether a hand is
  // moving is a fact about the HAND, so it is measured in pixels: a finger
  // resting on a capacitive screen wanders 1-3px continuously at 60Hz, so a
  // tight threshold would make the game's KINDEST verb literally unreachable on
  // a phone — every rest would classify as a stroke and stay at 150°.
  // The cell threshold is the second gate, so that a big deliberate sweep still
  // reads as drawing even when the camera is zoomed so far out that the whole
  // stroke is only a few pixels.
  stillPx: 7,                      // under this is jitter, not a stroke
  stillCells: 2.5,                 // or a real move across the world, whichever first
  moveHold: 0.22,                  // s — how long one movement keeps the hand "moving"
};

const SAVE_KEY = 'donttouch-save';        // the house contract summary (§21)
const DB = 'donttouch', STORE = 'colony';

// ---------------------------------------------------------------------------
// IndexedDB — the colony itself. localStorage holds only the hub's summary.
// ---------------------------------------------------------------------------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function put(k, v) {
  const d = await idb();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(v, k);
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
async function get(k) {
  const d = await idb();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readonly');
    const q = t.objectStore(STORE).get(k);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}

// ---------------------------------------------------------------------------
class App {
  constructor() {
    this.speed = 1;
    this.acc = 0;
    this.last = performance.now();
    this.paused = true;
    this.phase = 'title';
    this.sfx = new Sfx();
    this.gest = new Gesture();
    this.touch = null;      // the live contact: {cx, cy, e} — e is 0 hot … 1 resting
  }

  async boot() {
    // ⚠️ Safari evicts an origin untouched for 7 days and takes ALL of its
    // storage with it. Without this call a six-month-old colony vanishes. (§16.4)
    if (navigator.storage && navigator.storage.persist) {
      try { await navigator.storage.persist(); } catch (e) { /* not fatal */ }
    }

    const params = new URLSearchParams(location.search);
    let saved = null;
    if (!params.has('newgame')) {
      try { saved = await get('save'); } catch (e) { console.warn('no store', e); }
    }

    let away = 0;
    if (saved) {
      // ⚠️ A HALF-WRITTEN SAVE USED TO BE A PERMANENT LOCKOUT. fromJSON throws
      // on a missing `k` or `fields`, boot() had no guard, and the outer handler
      // painted a raw TypeError over a game with no restart control anywhere in
      // its UI — the player's only route back was clearing site data. Now the
      // unreadable blob is set aside under its own key (so the 25s autosave
      // cannot overwrite the evidence) and the town starts again.
      try {
        this.sim = Sim.fromJSON(saved.state);
        away = Math.min(Date.now() - (saved.at || Date.now()), 24 * 3600e3);
      } catch (e) {
        console.warn('unreadable save, keeping it aside and starting over', e);
        try { await put('save-broken', { at: Date.now(), why: String(e && e.message), state: saved.state }); } catch (e2) { /* nothing more we can do */ }
        this.sim = null;
      }
    }
    if (!this.sim) {
      const seed = params.get('seed') || String(Date.now() & 0xffffff);
      this.sim = new Sim({ seed, founders: 14 });
    }
    this.setSeason();

    const canvas = document.getElementById('c');
    this.view = new View(canvas, this.sim);
    this.ui = new UI(this.sim, this);
    this.ui.sync();
    this.bindInput(canvas);

    document.getElementById('boot').classList.add('hide');
    this.away = away;
    this.showTitle(!!saved);

    if (params.has('skiptitle')) this.enter();          // for the harness
    if (params.has('pause')) this.setSpeed(0);

    addEventListener('resize', () => this.view.resize());
    setInterval(() => this.save(), 25000);
    addEventListener('beforeunload', () => this.saveSummary());
    requestAnimationFrame(() => this.frame());
  }

  // ⚠️⚠️ THE TITLE IS A LOOK, NOT A STATE. It must NEVER call setLamp,
  // setCurtain or setLid to make the room dark and the sheet drawn — all three
  // are persistent world state inside toJSON AND the fingerprint, so a loaded
  // colony would come back with its cover and its bulb silently rewritten by a
  // screen the player never played. The darkness lives in view.titleDim and the
  // sheet is simply whatever sim.lid already says. View-only, cleared by enter().
  showTitle(hasSave) {
    this.phase = 'title';
    this.paused = true;
    const t = document.getElementById('title');
    t.classList.remove('hide', 'going');
    if (this.view) { this.view.titleDim = 1; this.view.titleTo = 1; }
    if (hasSave) {
      document.getElementById('chainSay').textContent = 'pull the light back on';
      document.getElementById('tsub').textContent =
        'you left it in the dark. it did not stop while you were upstairs.';
    }
    document.getElementById('chain').onclick = () => this.enter(!hasSave);
    document.getElementById('tBox').onclick = () => this.ui.showBox(true);
    document.getElementById('tNew').onclick = async () => {
      // ⚠️ a real town is being thrown away. There is no undo and the save is
      // the only copy, so this asks — the one confirm in the whole game.
      if (!confirm('start a new town? the one on the board now is not kept anywhere else.')) return;
      await window.__G.wipe();
    };
  }

  enter(fresh) {
    if (this.phase === 'play') return;
    this.phase = 'play';
    const t = document.getElementById('title');
    t.classList.add('going');
    setTimeout(() => t.classList.add('hide'), 950);
    // ⚠️ the room has to come BACK. Leaving titleDim at 1 here left the
    // whole board sitting at 14% light for the rest of the session, which
    // reads as a broken renderer rather than as a screen that forgot to lift.
    this.view.titleTo = 0;
    for (const id of ['strip', 'fascia', 'chronWrap']) document.getElementById(id).classList.remove('hide');
    this.sfx.start();
    // Pulling the chain turns the bulb on — that is what the chain IS, and it
    // is the player's own hand doing it, so this one really is world state.
    // ⚠️ only on a FRESH town. Somebody who deliberately left their town in
    // the dark and came back would otherwise find a screen had overruled them.
    if (fresh) this.sim.setLamp(true);
    this.setSpeed(1);
    this.ui.sync();
    if (this.away > 60e3) { const a = this.away; this.away = 0; this.catchUp(a); }
  }

  // The window is a real window: the room is cold in January. (§11.4)
  setSeason() {
    const d = new Date();
    const doy = (d - new Date(d.getFullYear(), 0, 0)) / 864e5;
    const s = 0.5 - Math.cos((doy / 365) * Math.PI * 2) * 0.5;   // 0 = deep winter, 1 = midsummer
    this.sim.season = s;
    // ⚠️ this used to write into the shared C object, so the SEED no longer
    // determined the world — the same seed grew a different town in January
    // than in July. The room's temperature belongs to this colony, not to the
    // module. (C.AMBIENT_BASE is a constant again; do not assign to it.)
    this.sim.ambientBase = 12.5 + s * 12;
  }

  // "While you were away." Bounded by a compute budget, not by ambition. (§13.2)
  async catchUp(ms) {
    // ⚠️ a contact left open would be integrated across the ENTIRE burst below,
    // which is up to 26 days of board with a finger on it.
    this.sim.setHand(null); this.touch = null;
    const days = Math.min(26, ms / 3600e3 * 1.1);
    const target = Math.floor(days * C.TICKS_PER_DAY);
    if (target < 200) return;
    const fromDay = this.sim.day;
    const note = document.getElementById('boot');
    note.classList.remove('hide');
    note.innerHTML = '<div class="bootin"><h1>DON&rsquo;T TOUCH</h1><p>while you were away…</p></div>';
    await new Promise(r => setTimeout(r, 40));
    const t0 = performance.now();
    let n = 0;
    while (n < target && performance.now() - t0 < 2500) { this.sim.step(); n++; }
    note.classList.add('hide');
    // ⚠️ fromDay was computed and then dropped: the "while you were away" page
    // showed the whole run's greatest hits, which after the sifter fix means
    // mostly the founding. Pass it — this page is about the nights you missed.
    this.awayFrom = fromDay;
    setTimeout(() => { this.ui.showPage(fromDay); }, 500);
  }

  setSpeed(s) {
    this.speed = s;
    this.paused = s === 0;
    this.ui.sync();
    this.sfx.start();
  }

  // -- input ---------------------------------------------------------------
  bindInput(canvas) {
    const s = this.sim, v = this.view;
    let down = false, mode = null, sx = 0, sy = 0, moved = 0, lastPrint = 0;
    const norm = (e) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)];
    };

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      if (this.phase !== 'play') return;
      this.sfx.start();
      canvas.setPointerCapture(e.pointerId);
      down = true; moved = 0; sx = e.clientX; sy = e.clientY;
      const [nx, ny] = norm(e);
      const tilting = e.button === 2 || e.shiftKey;
      if (tilting) { mode = 'tilt'; this.tilt0 = { x: s.tilt.x, y: s.tilt.y }; return; }
      const hit = v.pickGround(nx, ny);
      if (hit) {
        mode = 'warm';
        this.gest.start(e.clientX, e.clientY, performance.now());
        // ⚠️ a fresh contact starts HOT. Landing on a town is a shock; staying
        // still is what turns it into warmth. Do not start this at rest — the
        // player would never feel the difference the holding makes.
        this.touch = { cx: hit.cell[0], cy: hit.cell[1], e: 0, px: e.clientX, py: e.clientY };
        this._pushHand();
        this.sfx.touch();
        v.flinch(hit.cell[0], hit.cell[1]);
      }
      else mode = 'orbit';
    });

    canvas.addEventListener('pointermove', (e) => {
      const [nx, ny] = norm(e);
      if (!down) return;
      moved += Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy);
      const dx = (e.clientX - sx) / innerWidth, dy = (e.clientY - sy) / innerHeight;
      if (mode === 'orbit') {
        v.orbit.tAz -= dx * 3.4;
        // clamped to bird's eye — you look down into the layout, never across it
        v.orbit.tEl = Math.max(0.92, Math.min(1.52, v.orbit.tEl + dy * 2.6));
        sx = e.clientX; sy = e.clientY;
      } else if (mode === 'tilt') {
        const a = v.orbit.az;
        const wx = dx * Math.cos(a) - dy * 0 - 0;   // screen-x maps to world by camera yaw
        s.setTilt(this.tilt0.x + (dx * Math.cos(a) + dy * 0.0) * 0.9,
                  this.tilt0.y + (dy * 0.9 + dx * Math.sin(a) * 0.35));
      } else if (mode === 'warm') {
        this.gest.move(e.clientX, e.clientY, performance.now());
        const hit = v.pickGround(nx, ny);
        if (hit && this.touch) {
          const t = this.touch;
          // ⚠️ measured in CELLS, not pixels. A pixel threshold means the same
          // physical wobble counts as a stroke when the camera is zoomed in and
          // as stillness when it is out — the hand would change meaning with the
          // camera, which is not a thing a hand does.
          const d = Math.hypot(hit.cell[0] - t.cx, hit.cell[1] - t.cy);
          const dpx = Math.hypot(e.clientX - (t.px || e.clientX), e.clientY - (t.py || e.clientY));
          t.cx = hit.cell[0]; t.cy = hit.cell[1]; t.px = e.clientX; t.py = e.clientY;
          // ⚠️ a WINDOW, not a flag. Armed for a single frame, a slow careful
          // drag cools between pointermove events and draws with a resting
          // hand — the drawing verb would silently become the gentle one. The
          // window also absorbs sparse pointermove on a loaded main thread.
          if (dpx > HAND.stillPx || d > HAND.stillCells) t.moveT = HAND.moveHold;
          if (performance.now() - lastPrint > 260) { v.fingerprintAt(hit.cell[0], hit.cell[1]); lastPrint = performance.now(); }
        }
      }
    });

    const up = (e) => {
      if (!down) return;
      down = false;
      if (mode === 'warm') {
        const [nx, ny] = norm(e);
        const hit = v.pickGround(nx, ny);
        if (hit) v.fingerprintAt(hit.cell[0], hit.cell[1]);
        s.setHand(null); this.touch = null;
        if (v.setHandDisc) v.setHandDisc(null);
        this.gest.end(performance.now());
        if (moved < 6) {                       // a tap, not a hold: try to select a kin
          const id = v.pickKin(nx, ny);
          this.ui.select(id);
        }
      }
      if (mode === 'tilt') s.setTilt(0, 0);     // the jar rights itself
      mode = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      // the far limit is where the board still fills the frame
      v.orbit.tDist = Math.max(0.75, Math.min(2.75, v.orbit.tDist + Math.sign(e.deltaY) * 0.16));
    }, { passive: false });

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // ⚠️ WITHOUT THIS GUARD the verbs fire through the controls: with the
      // window slider focused, L still drags the cover off the town and space
      // still breathes on it while you are only trying to nudge a setting. It
      // becomes load-bearing the moment the box has inputs in it.
      if (e.target && e.target.closest && e.target.closest('input,textarea,select')) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        const box = document.getElementById('boxWrap');
        const page = document.getElementById('pageWrap');
        if (!page.classList.contains('hide')) page.classList.add('hide');
        else this.ui.showBox(box.classList.contains('hide'));
        return;
      }
      if (this.phase !== 'play') {
        if (k === ' ' || k === 'enter') { e.preventDefault(); this.enter(); }
        return;
      }
      this.sfx.start();
      if (k === ' ') { e.preventDefault(); this.breathing = true; }
      else if (k === 'l') { s.setLid(!s.lid); this.sfx.lid(); this.ui.sync(); }
      else if (k === 'k') { s.setLamp(!s.lampOn); this.sfx.touch(); this.ui.sync(); }
      else if (k === 't') { this.sfx.tap(); this.startle(); }
      else if (k === 'p') this.setSpeed(this.speed ? 0 : 1);
      // ⚠️ the help card and the README have always advertised "1 · 4 · 20",
      // while the code bound 1 · 2 · 3 — so pressing the key the game told you
      // to press did nothing at all. Both sets work now.
      else if (k === '1') this.setSpeed(1);
      else if (k === '4' || k === '2') this.setSpeed(4);
      else if (k === '0' || k === '3') this.setSpeed(20);
      else if (k === 'b') this.ui.showPage();
      else if (k === '?' || k === '/') this.ui.showBox(document.getElementById('boxWrap').classList.contains('hide'));
    });
    addEventListener('keyup', (e) => { if (e.key === ' ') this.breathing = false; });
    // a tab switch while breathing used to leave the town under a held breath
    addEventListener('blur', () => { this.breathing = false; });
  }

  // the tap you should not do — the whole colony hears it
  startle() {
    const s = this.sim, k = s.k;
    for (let id = 0; id < s.count; id++) {
      if (!k.alive[id] || k.stage[id] === STAGE.EGG) continue;
      k.pulse[id] = 2.6;
      k.need[id * 6 + 5] = Math.max(0, k.need[id * 6 + 5] - 0.12);
      k.hold[id] = 0;
    }
    s.log('tap', 'the whole world knocked, once, and every one of them stopped.', 2.4);
    // they flinch as one body, then come apart into individuals again
    this.view.flinch((s.N - 1) / 2, (s.N - 1) / 2);
  }

  // The hand's radius and heat, pushed every frame. This is the ONLY place the
  // curve is evaluated, so the board's disc and the sim's kernel can never
  // disagree about what the hand is currently doing.
  _pushHand(dt = 0) {
    const t = this.touch;
    if (!t) return;
    const moving = (t.moveT || 0) > 0;
    t.moveT = Math.max(0, (t.moveT || 0) - dt);
    const to = moving ? 0 : 1;
    const rate = moving ? HAND.warm : HAND.cool;
    t.e += (to - t.e) * Math.min(1, rate * dt);
    const r = C.HAND_RADIUS * (HAND.hotR + (HAND.restR - HAND.hotR) * t.e);
    const heat = HAND.hotHeat + (HAND.restHeat - HAND.hotHeat) * t.e;
    this.sim.setHand(t.cx, t.cy, { r, heat });
    // ⚠️ the disc is drawn from the SAME numbers, and it moves instantly while
    // the ground takes 4-8 seconds to catch up. That lead is the entire tutorial
    // for this verb: you can see the hand soften before you can feel it.
    if (this.view.setHandDisc) this.view.setHandDisc(t.cx, t.cy, r, t.e);
  }

  // -- loop ----------------------------------------------------------------
  frame() {
    const now = performance.now();
    let dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;

    this._pushHand(dt);

    // ⚠️ breathe/ventFog sit OUTSIDE the paused guard below, so without the
    // phase test the title screen quietly fogs and un-fogs a town nobody is
    // playing — and fog is real weather, not decoration.
    if (this.phase === 'play') {
      if (this.breathing) this.sim.breathe(dt);
      else this.sim.ventFog(dt);
    }

    if (!this.paused) {
      this.acc += dt * this.speed;
      const step = 1 / C.TICK_HZ;
      let guard = 0;
      while (this.acc >= step && guard < 600) { this.sim.step(); this.acc -= step; guard++; }
      if (guard >= 600) this.acc = 0;
    }

    this.sfx.update(this.sim, dt);
    this.view.render(dt);
    this.ui.frame(dt);
    requestAnimationFrame(() => this.frame());
  }

  // -- persistence ----------------------------------------------------------
  saveSummary() {
    const s = this.sim;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        started: true, era: 'burrow', day: s.day, generations: s.stats.generations,
        named: s.names.length, deaths: s.stats.died, graves: s.graves.length,
        symbols: 0, theonym: null, pagesWritten: 0,
      }));
    } catch (e) { /* quota — not fatal */ }
  }

  async save() {
    this.saveSummary();
    try {
      await put('save', { at: Date.now(), state: this.sim.toJSON() });
    } catch (e) { console.warn('save failed', e); }
  }
}

const app = new App();
window.__G = {
  app,
  get sim() { return app.sim; },
  step: (n = 1) => { for (let i = 0; i < n; i++) app.sim.step(); },
  run: (days) => { const n = days * C.TICKS_PER_DAY; for (let i = 0; i < n; i++) app.sim.step(); },
  page: () => app.sim.page(),
  fingerprint: () => app.sim.fingerprint(),
  wipe: async () => { await put('save', null); localStorage.removeItem(SAVE_KEY); location.search = '?newgame'; },
};
app.boot().catch(e => {
  document.getElementById('boot').innerHTML =
    `<div class="bootin"><h1>DON&rsquo;T TOUCH</h1><p style="color:#f88">${e.message}</p>
     <p style="opacity:.6;font-size:13px">serve this folder over http — es modules do not load from file://</p></div>`;
  console.error(e);
});
