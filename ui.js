// DON'T TOUCH — ui.js
// DOM overlay. The game must be fully playable with every panel closed. (Invariant 7)

import { LOCI, L, NEEDS, STAGE, STAGE_NAME, expressed, carried, marrowHomozygous, C } from './sim.js';
import { LUT, setPalette, setGlyphs, hueOf, NEED_MARK, NEED_WORD, worstNeed } from './palette.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const hueCss = (h, l) => `hsl(${hueOf(h)} 72% ${l}%)`;
// ⚠️ keep in step with the log() kinds in sim.js — a beat missing from here
// still reaches the book, it just scrolls past in the feed looking ordinary.
const BIG = new Set(['mutation', 'death-named', 'end', 'invented', 'reinvented',
  'tradition', 'lost', 'stands', 'learned', 'stillgone', 'stillcarried']);

const SET_KEY = 'donttouch-settings';
const DEFAULTS = { palette: 'off', glyph: 0, text: 1, post: 1, motion: 0, sound: 1 };

export class UI {
  constructor(sim, app) {
    this.sim = sim; this.app = app;
    this.selected = -1;
    this.lastChron = 0;
    this.chronBox = $('chron');
    this.settings = this.loadSettings();
    this.seen = new Set(JSON.parse(localStorage.getItem('donttouch-seen') || '[]'));
    this.nudgeT = 0;
    this.wire();
    this.applySettings();
  }

  // -- settings --------------------------------------------------------------
  loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SET_KEY) || '{}'); } catch (e) { /* corrupt, use defaults */ }
    return Object.assign({}, DEFAULTS, s);
  }
  saveSettings() {
    try { localStorage.setItem(SET_KEY, JSON.stringify(this.settings)); } catch (e) { /* quota */ }
  }
  applySettings() {
    const s = this.settings;
    setPalette(s.palette);
    setGlyphs(+s.glyph);
    document.documentElement.style.setProperty('--ui', s.text);
    document.body.classList.toggle('still', !!+s.motion);
    if (this.app.sfx) this.app.sfx.setMuted(!+s.sound);
    // ⚠️ the view may not exist yet on the first call — the UI is built before
    // the first frame, and applySettings runs from the constructor.
    const v = this.app.view;
    if (v) {
      if (v.post) v.post.enabled = !!+s.post;
      if (v.repaintLanterns) v.repaintLanterns();
    }
    // reflect into every segmented control
    for (const [id, key] of [['setPalette', 'palette'], ['setGlyph', 'glyph'], ['setText', 'text'],
                             ['setPost', 'post'], ['setMotion', 'motion'], ['setSound', 'sound']]) {
      const box = $(id); if (!box) continue;
      [...box.children].forEach(b => b.classList.toggle('on', String(b.dataset.v) === String(s[key])));
    }
  }

  wire() {
    // --- the fascia ---------------------------------------------------------
    const SPEEDS = [1, 4, 20, 0];
    $('speedChip').addEventListener('click', () => {
      const i = SPEEDS.indexOf(this.app.speed);
      this.app.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
    });
    $('curtain').addEventListener('input', (e) => this.sim.setCurtain(+e.target.value / 100));
    $('lamp').addEventListener('click', () => { this.sim.setLamp(!this.sim.lampOn); this.app.sfx.touch(); this.sync(); });
    $('lidBtn').addEventListener('click', () => {
      this.sim.setLid(!this.sim.lid); this.app.sfx.lid(); this.sync();
      // the one thing about this verb a player cannot see coming, said once
      // ⚠️ this key used to be 'sheetoff', the SAME key main.js:253 uses. Both
      // are one-shot-forever against a persisted set, so whichever fired first
      // permanently silenced the other — one of the game's only two lines of
      // voice could never be read at all.
      if (!this.sim.lid) this.nudge('the room is dry. whatever they lose to the air now, the air keeps.', 'sheetdry');
    });
    $('pageBtn').addEventListener('click', () => this.showPage());
    $('boxBtn').addEventListener('click', () => this.showBox(true));
    $('closeBox').addEventListener('click', () => this.showBox(false));
    $('closePage').addEventListener('click', () => $('pageWrap').classList.add('hide'));
    $('savePage').addEventListener('click', () => this.exportPage());
    $('closeInspect').addEventListener('click', () => this.select(-1));

    // --- the hand -----------------------------------------------------------
    $('hand').addEventListener('click', (e) => {
      const b = e.target.closest('.hb'); if (!b) return;
      this.app.arm(b.dataset.p);
    });
    // hovering one says what it does, without the game ever telling you to do it
    $('hand').addEventListener('pointerover', (e) => {
      const b = e.target.closest('.hb'); if (!b) return;
      const say = $('handSay'); say.textContent = b.dataset.say; say.classList.add('up');
    });
    $('hand').addEventListener('pointerout', () => $('handSay').classList.remove('up'));

    // --- the box ------------------------------------------------------------
    const seg = (id, key, after) => {
      const box = $(id); if (!box) return;
      box.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        this.settings[key] = b.dataset.v;
        this.saveSettings(); this.applySettings();
        if (after) after();
      });
    };
    seg('setPalette', 'palette'); seg('setGlyph', 'glyph'); seg('setText', 'text');
    seg('setPost', 'post'); seg('setMotion', 'motion'); seg('setSound', 'sound');
    $('boxWrap').addEventListener('click', (e) => { if (e.target.id === 'boxWrap') this.showBox(false); });
    $('pageWrap').addEventListener('click', (e) => { if (e.target.id === 'pageWrap') $('pageWrap').classList.add('hide'); });
  }

  // reflect the armed power, and leave its description up for a moment so a
  // click reads as an explanation rather than a mode change with no feedback
  armUI(p) {
    for (const b of document.querySelectorAll('#hand .hb')) {
      const on = b.dataset.p === p;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) { const say = $('handSay'); say.textContent = b.dataset.say; say.classList.add('up');
        clearTimeout(this._sayT); this._sayT = setTimeout(() => say.classList.remove('up'), 4200); }
    }
  }

  showBox(on) { $('boxWrap').classList.toggle('hide', !on); }

  // ⚠️ THE GAME'S ONLY VOICE, AND IT NEVER GIVES AN ORDER. P3 forbids the game
  // telling the player what they are or what to do, so every one of these is
  // written as an observation about the WORLD — never "you should", never "try
  // holding still", never a verdict on what just happened. Each fires once ever.
  nudge(text, key) {
    if (key) { if (this.seen.has(key)) return; this.seen.add(key);
      try { localStorage.setItem('donttouch-seen', JSON.stringify([...this.seen])); } catch (e) { /* quota */ } }
    const n = $('nudge');
    n.textContent = text; n.classList.add('up');
    this.nudgeT = 6.5;
  }

  select(id) {
    this.selected = id;
    $('inspect').classList.toggle('hide', id < 0);
  }

  sync() {
    const on = (id, v) => $(id).setAttribute('aria-pressed', v ? 'true' : 'false');
    on('lamp', this.sim.lampOn);
    on('lidBtn', this.sim.lid);
    $('speedChip').textContent = this.app.speed === 0 ? '‖' : `${this.app.speed}×`;
    $('curtain').value = Math.round(this.sim.curtain * 100);
  }

  frame(dt = 0) {
    const s = this.sim;

    // ⚠️ THE RULE FOR THIS LINE: the always-on layer may show only what is true
    // of the ROOM, never what is true of the KIN. That is Invariant 7 (the
    // lantern already says how they are, better than a number can) plus P3 (no
    // score). It is what removed "% lit" — a mean of k.bright, which is a health
    // bar with the serial numbers filed off — and the running grave count, which
    // is §9.5's scoreboard printed in the corner. Both live in the book now,
    // where aggregate numbers are allowed because you went and opened it.
    $('hud').innerHTML = `<b>day ${s.day}</b>`;

    // the day arc: "is night coming" is the one thing the lanterns cannot tell
    // you, and it governs rest, moss growth and every cold death.
    const dot = $('arcDot');
    if (dot) {
      const a = Math.PI * (1 - (s.dayFrac || 0));
      dot.setAttribute('cx', (23 + Math.cos(a) * 20).toFixed(1));
      dot.setAttribute('cy', (13 - Math.sin(a) * 20 * 0.5).toFixed(1));
      dot.setAttribute('fill', s.daylight > 0.55 ? '#f0d9ac' : s.daylight > 0.12 ? '#9aa7b8' : '#4a5563');
    }

    // ⚠️ THIS STRIP USED TO BE A CONSTANT. It asked `humid > 4.4`, but humid is
    // in S²-scaled units — it starts at 5.0*S² = 11.25 on a 96 board and the
    // real rain threshold is C.CLOUD = 24.75. Measured over 60 days: it said
    // "close" 59 times, "clear" ZERO times, ever. Reading it against C.CLOUD
    // makes it a fraction of the way to rain, which also makes it predictive —
    // the only job a weather readout has.
    const t = s.temp[s.idx(s.hearth.x, s.hearth.y)];
    const p = s.humid / C.CLOUD;
    $('weather').innerHTML =
      `${t.toFixed(0)}°<span>·</span>` +
      `${s.rainLeft > 0 ? 'raining' : p > 0.8 ? 'about to rain' : p > 0.45 ? 'heavy air' : 'clear'}` +
      (s.lid ? '' : '<span>·</span>uncovered');

    if (this.nudgeT > 0) { this.nudgeT -= dt; if (this.nudgeT <= 0) $('nudge').classList.remove('up'); }

    this.pumpChronicle();
    if (this.selected >= 0) this.paintInspector();
  }

  pumpChronicle() {
    const c = this.sim.chronicle;
    if (c.length === this.lastChron) {
      const last = c[c.length - 1], node = this.chronBox.lastChild;
      if (last && node && last.repeat > 1) node.querySelector('.t').textContent = `${last.text} (×${last.repeat})`;
      return;
    }
    for (let i = this.lastChron; i < c.length; i++) {
      const e = c[i];
      const line = el('div', 'line');
      line.appendChild(el('span', 'd', `${e.day}`));
      line.appendChild(el('span', 't', e.repeat > 1 ? `${e.text} (×${e.repeat})` : e.text));
      if (BIG.has(e.kind)) line.classList.add('big');
      this.chronBox.appendChild(line);
      if (e.kind === 'mutation') this.app.sfx.mutate();
      else if (e.kind === 'death-named') this.app.sfx.death();
      else if (e.kind === 'clutch' || e.kind === 'hatch') this.app.sfx.birth();
      else if (e.kind === 'rain') this.app.sfx.thunder();
      // ⚠️ THE ONE LOOP WORTH POINTING AT. Measured: ZERO placenames in 720 days
      // across three no-input seeds, and one after resting a hand on the crowd
      // for 2.6 real seconds. It is the fastest, most legible thing the player
      // can do that ends up in the town's own book — and it was completely
      // unsignposted, so nobody would ever find it. This stays inside P3: it
      // reports what the TOWN did, gives no instruction, and fires once ever.
      if (e.kind === 'placename') {
        this.nudge('a place only gets a name where something kept happening to them.', 'placename');
      }
    }
    while (this.chronBox.children.length > 90) this.chronBox.removeChild(this.chronBox.firstChild);
    this.chronBox.scrollTop = this.chronBox.scrollHeight;
    this.lastChron = c.length;
  }

  // -- the inspector: every aggregate decomposes into causes (§6.6) ----------
  paintInspector() {
    const s = this.sim, k = s.k, id = this.selected;
    if (!k.alive[id]) { this.select(-1); return; }
    const G = LOCI.length * 2;
    const g = k.genome.subarray(id * G, id * G + G);
    const box = $('inspectBody');
    const NN = NEEDS.length, base = id * NN;
    const nm = s.nameOf(id);
    const st = STAGE_NAME[k.stage[id]];
    // ⚠️ an index past the end of GOALS renders 'standing' — keep this in step
    // with the goal list in sim.js _decide (0 wander … 10 make)
    const GOALS = ['wandering', 'looking for food', 'going to water', 'looking for a warm place',
      'resting', 'looking for company', 'getting away', 'courting', 'carrying the dead',
      'going to the one who stays', 'making something', 'going to what fell out of the sky',
      'going where something wanted them', 'gathering for the store', 'carrying water'];

    const TRADES = ['', 'one who gathers', 'one who carries water', 'one who keeps what stands', 'one who shows how things are done'];
    const glued = !!k.glued[id];
    const worst = worstNeed(k.need, base);
    const mark = LUT.glyphs ? NEED_MARK[worst] : '';
    let h = `<div class="who"><span class="dot" style="background:${hueCss(k.hue[id], 55)}">${mark}</span>
      <b>${nm}</b><i>${st} · ${k.age[id].toFixed(0)} of ~${k.lifespan[id].toFixed(0)} days</i></div>`;
    // they still want everything anyone wants. they simply cannot go and get it.
    h += `<div class="doing">${glued ? 'wants ' + (GOALS[k.goal[id]] || 'nothing').replace(/^(looking for|going to) /, '') + ' · cannot move' : (GOALS[k.goal[id]] || 'standing')}</div>`;
    if (glued) h += `<div class="line2" style="color:#c79a3e">stuck fast to the world. whatever ${nm} needs, somebody has to bring it.</div>`;

    // ⚠️ these bars used to be #6fc / #fc6 / #f66 — green, amber, red, which is
    // the single worst triple for the commonest colour blindness, on the one
    // panel a player opens to find out what is wrong. The number beside each bar
    // is the fix that works for everyone; the colour is now a bonus, not the
    // message.
    h += '<div class="needs">';
    for (let n = 0; n < NN; n++) {
      const v = k.need[base + n];
      const col = v > 0.55 ? '#6fc' : v > 0.25 ? '#fc6' : '#f66';
      h += `<div class="need"><label>${NEEDS[n]}</label>
        <div class="bar"><i style="width:${(v * 100) | 0}%;background:${col}"></i></div>
        <em>${(v * 100) | 0}</em></div>`;
    }
    h += '</div>';
    h += `<div class="line2" style="margin-top:0">most of all, ${NEED_WORD[worst]}.</div>`;
    if (k.strain[id] > 0.02) {
      h += `<div class="strain">failing — ${((1 - k.strain[id]) * 100 | 0)}% left</div>`;
    }

    // the genome strip: bright = what you see, dim = what they carry (§5.4)
    h += '<div class="genome">';
    for (let li = 0; li < LOCI.length; li++) {
      const ex = expressed(g, li), ca = carried(g, li);
      const same = ex === ca;
      h += `<div class="locus" title="${LOCI[li].key}">
        <span class="lab">${LOCI[li].key}</span>
        <span class="al top">${ex}</span>
        <span class="al bot ${same ? 'same' : ''}">${ca}</span></div>`;
    }
    h += '</div>';
    if (marrowHomozygous(g)) h += `<div class="warn">both marrow alleles match — half a life</div>`;

    const mo = k.mother[id], fa = k.father[id];
    if (k.job && k.job[id] > 0) h += `<div class="line2">${TRADES[k.job[id]]}.</div>`;
    if (k.home && k.home[id] >= 0) { const hw = s.workById(k.home[id]); if (hw) h += `<div class="line2">lives at the ${['','','','hut','house'][hw.kind] || 'hall'} by the ${s.placeName(s.idx(hw.x, hw.y))}.</div>`; }
    if (mo >= 0) h += `<div class="line2">out of ${s.nameOf(mo)} and ${s.nameOf(fa)} · generation ${k.gen[id]}</div>`;
    else h += `<div class="line2">a founder. nobody made them.</div>`;

    box.innerHTML = h;
  }

  // -- THE PAGE (§12.3) ------------------------------------------------------
  showPage(fromDay = 0) {
    const s = this.sim;
    const p = s.page(fromDay);
    const body = $('pageBody');
    const title = fromDay > 0 ? 'while you were away' : 'the book of the town';
    // aggregates are allowed HERE, and only here — you had to go and open it
    const sub = fromDay > 0
      ? `${s.day - fromDay} days passed · ${s.alive || 0} alive · ${s.graves.length} in the yard`
      : `day ${s.day} · ${s.alive || 0} alive · ${s.graves.length} in the yard · ${s.stats.generations} generations`;
    let h = `<h2>${title}</h2><div class="sub">${sub}</div><ol>`;
    p.forEach(e => { h += `<li><span>${e.day}</span>${e.text}</li>`; });
    h += '</ol>';
    h += `<div class="foot">a DIRTY BOY DEVS game</div>`;
    body.innerHTML = h;
    $('pageWrap').classList.remove('hide');
  }

  // 9:16 PNG. This is the shareable artifact and it is a launch feature.
  exportPage() {
    const s = this.sim, p = s.page();
    const W = 1080, H = 1920;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0b0e14'); grad.addColorStop(0.55, '#12161f'); grad.addColorStop(1, '#080a0e');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);

    // a field of lanterns as the letterhead — through the live palette, so the
    // picture a colourblind player saves looks like the town they actually saw
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * W, y = 120 + Math.random() * 420;
      const hue = hueOf([172, 44, 340, 104, 282, 18][(Math.random() * 6) | 0]);
      const rad = g.createRadialGradient(x, y, 0, x, y, 22 + Math.random() * 26);
      rad.addColorStop(0, `hsla(${hue},80%,68%,0.85)`);
      rad.addColorStop(1, `hsla(${hue},80%,50%,0)`);
      g.fillStyle = rad; g.fillRect(x - 50, y - 50, 100, 100);
    }

    g.fillStyle = '#e8eef7';
    g.font = '600 76px Georgia, serif';
    g.fillText('the book of the town', 80, 640);
    g.fillStyle = '#8b97a8';
    g.font = '300 38px Georgia, serif';
    g.fillText(`day ${s.day} · ${s.alive || 0} alive · ${s.graves.length} in the yard`, 80, 700);

    g.font = '300 42px Georgia, serif';
    let y = 830;
    p.forEach(e => {
      g.fillStyle = '#4e5a6b'; g.font = '300 30px Georgia, serif';
      g.fillText(String(e.day), 80, y);
      g.fillStyle = '#dbe4f0'; g.font = '300 42px Georgia, serif';
      const words = e.text.split(' ');
      let line = '', ly = y;
      words.forEach(w => {
        const test = line ? line + ' ' + w : w;
        if (g.measureText(test).width > W - 260) { g.fillText(line, 180, ly); ly += 54; line = w; }
        else line = test;
      });
      g.fillText(line, 180, ly);
      y = ly + 96;
    });

    g.fillStyle = '#5a6675'; g.font = '300 30px Georgia, serif';
    g.fillText('DON’T TOUCH · a DIRTY BOY DEVS game', 80, H - 90);

    c.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `dont-touch-day-${s.day}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
  }
}
