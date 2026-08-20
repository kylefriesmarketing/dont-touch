// DON'T TOUCH — main.js
// Boot, fixed-timestep loop, input, persistence. View and sim never touch. (§17)

import { Sim, C, STAGE } from './sim.js';
import { View } from './view.js';
import { UI } from './ui.js';
import { Sfx } from './sfx.js';

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
    this.paused = false;
    this.sfx = new Sfx();
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

    if (params.has('pause')) this.setSpeed(0);
    if (away > 60e3) await this.catchUp(away);

    addEventListener('resize', () => this.view.resize());
    setInterval(() => this.save(), 25000);
    addEventListener('beforeunload', () => this.saveSummary());
    requestAnimationFrame(() => this.frame());
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
      this.sfx.start();
      canvas.setPointerCapture(e.pointerId);
      down = true; moved = 0; sx = e.clientX; sy = e.clientY;
      const [nx, ny] = norm(e);
      const tilting = e.button === 2 || e.shiftKey;
      if (tilting) { mode = 'tilt'; this.tilt0 = { x: s.tilt.x, y: s.tilt.y }; return; }
      const hit = v.pickGround(nx, ny);
      if (hit) { mode = 'warm'; s.setHand(hit.cell[0], hit.cell[1]); this.sfx.touch(); }
      else mode = 'orbit';
    });

    canvas.addEventListener('pointermove', (e) => {
      const [nx, ny] = norm(e);
      if (!down) return;
      moved += Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy);
      const dx = (e.clientX - sx) / innerWidth, dy = (e.clientY - sy) / innerHeight;
      if (mode === 'orbit') {
        v.orbit.tAz -= dx * 3.4; v.orbit.tEl = Math.max(-0.1, Math.min(1.32, v.orbit.tEl + dy * 2.6));
        sx = e.clientX; sy = e.clientY;
      } else if (mode === 'tilt') {
        const a = v.orbit.az;
        const wx = dx * Math.cos(a) - dy * 0 - 0;   // screen-x maps to world by camera yaw
        s.setTilt(this.tilt0.x + (dx * Math.cos(a) + dy * 0.0) * 0.9,
                  this.tilt0.y + (dy * 0.9 + dx * Math.sin(a) * 0.35));
      } else if (mode === 'warm') {
        const hit = v.pickGround(nx, ny);
        if (hit) {
          s.setHand(hit.cell[0], hit.cell[1]);
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
        s.setHand(null);
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
      v.orbit.tDist = Math.max(1.3, Math.min(7, v.orbit.tDist + Math.sign(e.deltaY) * 0.28));
    }, { passive: false });

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.sfx.start();
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); this.breathing = true; }
      else if (k === 'l') { s.setLid(!s.lid); this.sfx.lid(); this.ui.sync(); }
      else if (k === 't') { this.sfx.tap(); this.startle(); }
      else if (k === 'p') this.setSpeed(this.speed ? 0 : 1);
      else if (k === '1') this.setSpeed(1);
      else if (k === '2') this.setSpeed(4);
      else if (k === '3') this.setSpeed(20);
      else if (k === 'b') this.ui.showPage();
      else if (k === '?' || k === '/') document.getElementById('help').classList.toggle('hide');
    });
    addEventListener('keyup', (e) => { if (e.key === ' ') this.breathing = false; });
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
  }

  // -- loop ----------------------------------------------------------------
  frame() {
    const now = performance.now();
    let dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;

    if (this.breathing) this.sim.breathe(dt);
    else this.sim.ventFog(dt);

    if (!this.paused) {
      this.acc += dt * this.speed;
      const step = 1 / C.TICK_HZ;
      let guard = 0;
      while (this.acc >= step && guard < 600) { this.sim.step(); this.acc -= step; guard++; }
      if (guard >= 600) this.acc = 0;
    }

    this.sfx.update(this.sim, dt);
    this.view.render(dt);
    this.ui.frame();
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
