// DON'T TOUCH — ui.js
// DOM overlay. The game must be fully playable with every panel closed. (Invariant 7)

import { LOCI, L, NEEDS, STAGE, STAGE_NAME, expressed, carried, marrowHomozygous, C, AGES, WORKS } from './sim.js';
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

// what a trade is called — shared by the inspector and the census chapter
const TRADES = ['', 'one who gathers', 'one who carries water',
  'one who keeps what stands', 'one who shows how things are done'];
// how somebody went — the sim's own phrasing from _die, reused verbatim so the
// yard never invents a second voice for the same fact
const HOW_GONE = { age: 'grew old', hunger: 'went hungry', thirst: 'went dry',
  heat: 'was in the warm place too long', cold: 'went cold',
  water: 'was in the low end when it filled', smitten: 'was struck where they stood' };

export class UI {
  constructor(sim, app) {
    this.sim = sim; this.app = app;
    this.selected = -1;
    this.chapter = 'days';     // which book chapter is open

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
    $('pgtabs').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.chapter = b.dataset.ch;
      this.renderBook();
    });
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
    // the polaroid — taken ONCE per tap, never per frame (paintInspector
    // rebuilds inspectBody every paint; the photo lives outside it)
    const shot = $('inspectShot');
    if (shot) {
      shot.innerHTML = '';
      if (id >= 0 && this.app && this.app.view && this.app.view.portraitOf) {
        try {
          const url = this.app.view.portraitOf(id);
          if (url) { const im = document.createElement('img'); im.src = url; im.alt = ''; shot.appendChild(im); }
        } catch (e) { /* a failed photo must never break the inspector */ }
      }
    }
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
    // ⚠ THE AGE PASSES THAT RULE, and it is worth being explicit about why,
    // because it is the only thing ever added to this line. An age is read back
    // off WHAT STANDS ON THE BOARD (see Sim.ageNow) — it is a fact about the
    // room, exactly like the day is. It is not a score: nothing accumulates, and
    // a town that loses its last granary drops back an age and this line says
    // so. And it says nothing whatever about how the kin are, which is still the
    // lanterns' job alone.
    const ageI = s.ageNow ? s.ageNow() : 0;
    // one small bell when an age TURNS — never on load (the first frame seeds
    // the tracker), and never on the way DOWN: losing an age already has the
    // chronicle's own sentence, and a chime would make it sound like a prize.
    // ⚠️ A HIGH-WATER MARK, NOT THE CURRENT AGE. `ageNow()` is an uncached scan
    // for works STANDING at prog >= WORK_DONE, so a hall under repair or a ruin
    // decaying past the line drops the age and its return raised it again — the
    // bell rang for the same milestone over and over (measured six times in
    // ninety days on one seed). An age is only reached once per town.
    // ⚠️ per TOWN: refounding on the ruins really is a new first time, so the
    // mark resets when the founding register moves.
    const fnd = s.foundings || 1;
    if (this._ageFnd !== fnd) { this._ageFnd = fnd; this._ageSeen = ageI; }
    else if (this._ageSeen == null) this._ageSeen = ageI;
    else if (ageI > this._ageSeen) {
      this._ageSeen = ageI;
      if (this.app && this.app.sfx) this.app.sfx.chime();
    }
    $('hud').innerHTML = `<b>day ${s.day}</b><span class="agechip">${AGES[ageI].name}</span>`;
    // ── THE LAST PAGE ──────────────────────────────────────────
    // Real loss is allowed here — Kyle's call — so when the last kin dies the
    // book closes and SAYS so, once, instead of the board just going quiet and
    // the player wondering if the game broke. `_ended` is the sim's own flag
    // (recomputed on load, so a saved dead town does not re-announce itself);
    // `_endShown` is UI-local so a reload shows the page again — correct: you
    // walked back down to the basement and the town is still gone.
    if (s._ended && !this._endShown) { this._endShown = true; this.showEnd(); }

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
  // The book has CHAPTERS now: the days (the chronicle it always was), the
  // living, the yard, what they know. All pure reads; aggregates are allowed
  // in the book and only in the book — you had to go and open it.
  showPage(fromDay) {
    // ⚠️ THE AWAY PAGE HAS TO SURVIVE A TAB TAP. catchUp passes the window it
    // computed; everybody else passes nothing, and then the rule is: opening
    // the book from the board shows the whole book, while pressing B with the
    // book ALREADY open keeps whatever window is being read. Without this,
    // tapping 'the yard' and then 'the days' silently replaced 'while you were
    // away' with the whole run's greatest hits — and that page is the one a
    // returning player actually came back for. (main.js computes and stores
    // `awayFrom` for the same reason and nothing ever reads it; the memory
    // lives here instead, next to the render that needs it.)
    if (fromDay == null) {
      fromDay = $('pageWrap').classList.contains('hide') ? 0 : (this._daysFrom || 0);
    }
    this.chapter = 'days';
    this.renderBook(fromDay);
  }

  _syncTabs() {
    const t = $('pgtabs');
    if (t) [...t.children].forEach(b => b.classList.toggle('on', b.dataset.ch === this.chapter));
  }

  renderBook(fromDay = this._daysFrom || 0) {
    // the days chapter's window (0 = the whole book, >0 = the nights you were
    // away) is remembered here, because the tab handler calls this with no
    // argument at all
    this._daysFrom = fromDay;
    this._syncTabs();
    const body = $('pageBody');
    if (this.chapter === 'living') body.innerHTML = this.pageCensus() + `<div class="foot">a DIRTY BOY DEVS game</div>`;
    else if (this.chapter === 'yard') body.innerHTML = this.pageYard() + `<div class="foot">a DIRTY BOY DEVS game</div>`;
    else if (this.chapter === 'know') body.innerHTML = this.pageKnow() + `<div class="foot">a DIRTY BOY DEVS game</div>`;
    else {
      // ⚠ A DEAD TOWN'S BOOK OPENS TO THE LAST PAGE, whichever way you open it.
      // Without this, catchUp's +500ms showPage overwrote the last page half a
      // second after it appeared (died-while-away is the LIKELIEST way a player
      // meets the end), the 'b' key showed the ordinary book with no refound
      // button, and 'leave it dark' was unrecoverable. showEnd is idempotent —
      // fresh nodes, fresh listeners — so re-entry is safe. The other chapters
      // stay readable on a dead town on purpose: the yard especially IS the
      // last page's evidence.
      if (this.sim._ended) { this.showEnd(); return; }
      const s = this.sim;
      const p = s.page(fromDay);
      const title = fromDay > 0 ? 'while you were away' : 'the book of the town';
      const sub = fromDay > 0
        ? `${s.day - fromDay} days passed · ${s.alive || 0} alive · ${s.graves.length} in the yard`
        : `day ${s.day} · ${s.alive || 0} alive · ${s.graves.length} in the yard · ${s.stats.generations} generations`;
      let h = `<h2>${title}</h2><div class="sub">${sub}</div><ol>`;
      p.forEach(e => { h += `<li><span>${e.day}</span>${e.text}</li>`; });
      h += '</ol>';
      h += `<div class="foot">a DIRTY BOY DEVS game</div>`;
      body.innerHTML = h;
    }
    $('pageWrap').classList.remove('hide');
  }

  // -- THE CENSUS: everyone alive right now. aggregates allowed — you opened it.
  pageCensus() {
    const s = this.sim, k = s.k;
    const named = [];
    let unnamed = 0, eggs = 0, oldest = -1;
    for (let id = 0; id < s.count; id++) {
      if (!k.alive[id]) continue;
      if (k.stage[id] === STAGE.EGG) { eggs++; continue; }
      if (k.age[id] > oldest) oldest = k.age[id];
      if (k.nameId[id] >= 0) named.push(id); else unnamed++;
    }
    // the book's order: the old lines first, and within a line, the old first
    named.sort((a, b) => (k.gen[a] - k.gen[b]) || (k.age[b] - k.age[a]));

    let sub = `${s.alive || 0} alive · ${s.stats ? s.stats.generations : 0} generations`;
    if (oldest >= 0) sub += ` · the oldest has seen ${oldest.toFixed(0)} days`;

    // a parent is named only if the slot still holds THEM. `alive` alone is
    // not enough — freed slots are reused (_spawn pops this.free), so a living,
    // named occupant can be a stranger wearing the parent's id. A true parent
    // is always an earlier generation (child gen = max(parents)+1) and never
    // born after the child; a recycled occupant fails one of those. Dead slots
    // stay unnamed on purpose — the book must not misname the dead.
    const parent = (pid, cid) => (pid >= 0 && k.alive[pid] && k.nameId[pid] >= 0
      && k.gen[pid] < k.gen[cid] && k.born[pid] <= k.born[cid]) ? s.nameOf(pid) : null;

    let h = `<h2>the living</h2><div class="sub">${sub}</div><ol>`;
    const shown = named.slice(0, 40);
    for (const id of shown) {
      const nm = s.nameOf(id);
      const mo = k.mother ? k.mother[id] : -1;
      const fa = k.father ? k.father[id] : -1;
      let fact;
      // ⚠️ THE TRADE OUTRANKS THE BIOGRAPHY now that trades are real. It used
      // to sit below 'here since the beginning' and 'grown old', so a founder
      // or an elder — exactly the kin most likely to HAVE settled into one —
      // never showed it. What somebody spent their life doing is the most
      // characterful true thing the census can say about them.
      if (k.glued && k.glued[id]) fact = 'stuck fast';
      else if (k.stage[id] === STAGE.NIB) fact = 'a nib still';
      else if (k.stage[id] === STAGE.HALF) fact = 'half-grown';
      else if (k.job && k.job[id] > 0 && TRADES[k.job[id]]) fact = TRADES[k.job[id]];
      else if (mo < 0) fact = 'here since the beginning';
      else if (k.stage[id] === STAGE.RIME) fact = 'white with rime';
      else if (k.lifespan[id] > 0 && k.age[id] / k.lifespan[id] > 0.8) fact = 'grown old';
      else {
        const mn = parent(mo, id), fn = parent(fa, id);
        if (mn && fn) fact = `out of ${mn} and ${fn}`;
        else if (mn || fn) fact = `out of ${mn || fn}`;
        else if (k.born && k.born[id] >= 0) fact = `born on day ${k.born[id]}`;
        else fact = `of generation ${k.gen[id]}`;
      }
      h += `<li><span>${k.age[id].toFixed(0)}</span>${nm} — ${fact}.</li>`;
    }
    if (!shown.length && !unnamed) {
      h += eggs > 0
        ? `<li><span>·</span>nobody walking yet — only eggs, waiting.</li>`
        : `<li><span>·</span>nobody.</li>`;
    }
    // reads whole on its own when the list above is empty — no dangling 'and'
    if (unnamed > 0) h += shown.length
      ? `<li><span>·</span>and ${unnamed === 1 ? 'one more' : unnamed + ' more'}, not yet named.</li>`
      : `<li><span>·</span>${unnamed === 1 ? 'one of them' : unnamed + ' of them'}, not yet named.</li>`;
    h += '</ol>';

    const asides = [];
    if (named.length > shown.length) asides.push('and the rest of them, unlisted.');
    const places = Object.values(s.placeNames || {});
    if (places.length) asides.push(`the ground answers to ${places.slice(0, 4).join(', ')}.`);
    if (asides.length) h += `<div class="sub" style="margin-top:14px">${asides.join(' ')}</div>`;
    return h;
  }

  // -- THE YARD (the book's moral mirror: a record, never a verdict) ---------
  // Returns the page HTML; sets nothing, listens to nothing. Newest grave
  // first — the yard is read the way it is walked, from the fresh dirt back.
  pageYard() {
    const s = this.sim;
    const graves = s.graves || [];
    // the sim's own phrasing for how each of them went (verbatim; a grave from
    // before causes were recorded simply rests here). 'taken' is absent ON
    // PURPOSE: a taken kin leaves no body (_die's noBody path), so no grave
    // ever carries that cause — do not "complete" this table.
    const HOW = {
      age: 'grew old', hunger: 'went hungry', thirst: 'went dry',
      heat: 'was in the warm place too long', cold: 'went cold',
      water: 'was in the low end when it filled', smitten: 'was struck where they stood'
    };
    let h = '<h2>the yard</h2>';
    if (!graves.length) {
      h += '<div class="sub">nobody has been carried here.</div>';
      return h;
    }
    let first = Infinity;
    for (const g of graves) if (g && g.day < first) first = g.day;
    const bits = [`${graves.length} grave${graves.length === 1 ? '' : 's'}`];
    if (isFinite(first)) bits.push(`first buried day ${first}`);
    const st = s.stats || {};
    // died > buried + still lying: some never came back. said softly, accusing
    // nobody. a body merely waiting for its carrier does not count — without
    // that term this line flickered with the burial queue.
    if ((st.died || 0) > (st.buried || 0) + ((s.corpses && s.corpses.length) || 0)) bits.push('not all of them were found');
    h += `<div class="sub">${bits.join(' · ')}</div>`;
    const CAP = 40;
    const shown = graves.slice(-CAP).reverse();
    h += '<ol>';
    for (const g of shown) {
      if (!g) continue;
      const nm = (g.nameId >= 0 && s.names[g.nameId]) ? s.names[g.nameId] : 'one who was never named';
      const how = HOW[g.cause] || 'rests here';
      // generation only when it says something: gen 1 is the founding stock —
      // of whichever founding (refound seeds gen 1 again, and it is still a
      // true thing to say over them)
      const aside = g.gen === 1 ? ' — one of the first' : '';
      h += `<li><span>${g.day}</span>${nm} ${how}${aside}.</li>`;
    }
    h += '</ol>';
    const older = graves.length - shown.length;
    if (older > 0) h += `<div class="sub" style="margin-top:14px">and ${older} older grave${older === 1 ? '' : 's'}, unlisted.</div>`;
    return h;
  }

  pageKnow() {
    // "what they know" — the practices, and the ages. pure reads of the sim;
    // aggregates are allowed in the book, and only in the book (§12.3).
    const s = this.sim;
    const nowI = s.ageNow();
    // ageBest, not ageNow, for the ladder: ruins decay after loss, and this
    // page is the town's history, not its inventory (same rule as showEnd).
    const bestI = Math.max(s.ageBest || 0, nowI);

    let sub = (AGES[nowI] || AGES[0]).name;
    if (bestI > nowI) sub += ' · it has been further';
    if (s.foundings > 1) {
      const nth = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth'][s.foundings] || (s.foundings + 'th');
      sub += ` · the ${nth} town on this ground`;
    }
    let h = `<h2>what they know</h2><div class="sub">${sub}</div>`;

    // every practice they have, in the order it was worked out. the founding
    // four sit at day 0 with no inventor — nobody alive remembers working it
    // out, which is what a tradition is.
    const rows = [];
    for (let i = 0; i < (s.prac || []).length; i++) {
      const pr = s.prac[i], W = WORKS[i];
      if (!pr || !W || pr.invented < 0) continue;
      rows.push({ i, pr, W });
    }
    rows.sort((a, b) => (a.pr.invented - b.pr.invented) || (a.i - b.i));

    let unlisted = 0;
    if (rows.length > 40) { unlisted = rows.length - 40; rows.length = 40; }

    h += '<ol>';
    for (const r of rows) {
      const pr = r.pr;
      const endowed = pr.invented === 0 && pr.inventor < 0;
      const span = endowed ? '—' : Math.floor(pr.invented);
      const inm = pr.inventor >= 0 ? s.names[pr.inventor] : null;
      const lost = pr.lost >= 0 && pr.lost >= pr.invented;
      const bits = [r.W.name];
      if (endowed) {
        bits.push(s.foundings > 1 ? 'standing when they arrived' : 'already known when the town began');
      } else if (inm) {
        bits.push(`worked out by ${inm}`);
        // "do it now" is only true while somebody does — a lost practice has
        // nobody doing it now, so the flavor stands down until it is found
        if (pr.tradition >= 0 && !lost) bits.push(`${inm} never met the ones who do it now`);
      }
      if (lost) bits.push('nobody left remembers how it is made');
      if (pr.reinvented > 0) bits.push(pr.reinvented === 1 ? 'found again' : `found ${pr.reinvented} times`);
      h += `<li><span>${span}</span>${bits.join(' · ')}</li>`;
    }
    h += '</ol>';

    // what they have not thought of is never listed — one soft line at most,
    // and no checklist of missing things (P3: no goals shown)
    const asides = [];
    if (unlisted > 0) asides.push('and the rest of them, unlisted.');
    if ((s.prac || []).some(pr => pr && pr.invented < 0)) asides.push('what they have not thought of yet goes unwritten.');
    if (asides.length) h += `<div class="sub" style="margin-top:14px">${asides.join(' ')}</div>`;

    // the ladder — every age this ground has reached, in the order it came
    const ladder = [];
    for (let a = 0; a <= bestI && a < AGES.length; a++) ladder.push(AGES[a].name);
    if (ladder.length) h += `<div class="sub" style="margin-top:14px">${ladder.join(' → ')}.</div>`;

    return h;
  }

  // The book's last page. Aggregates are allowed here by the same rule as
  // showPage — the town is finished, and this page is the finishing of it.
  showEnd() {
    this.chapter = 'days';   // direct callers (death watcher, catchUp) land here
    this._syncTabs();
    const s = this.sim;
    const body = $('pageBody');
    // ⚠ ageBest, not ageNow: ruins decay after the last death, so the present
    // board understates what the town actually reached — and this page is the
    // town's history, not its inventory.
    const ages = (AGES[Math.max(s.ageBest || 0, s.ageNow())] || AGES[0]).name;
    const places = Object.values(s.placeNames || {});
    let h = `<h2>the last page</h2>`;
    // foundings finally has a reader — the exact 'counter nothing consumes'
    // defect this codebase has now found SIX times, once in its own reviewer's
    // code. The register says which town on this ground this was.
    const nth = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth'][s.foundings] || (s.foundings + 'th');
    const townN = s.foundings > 1 ? ` · the ${nth} town on this ground` : '';
    h += `<div class="sub">the town is quiet. day ${s.day} · ${s.graves.length} graves · ${s.stats.generations} generations · it reached ${ages}${townN}</div>`;
    h += '<ol>';
    const p = s.page();
    p.slice(-8).forEach(e => { h += `<li><span>${e.day}</span>${e.text}</li>`; });
    h += '</ol>';
    if (places.length) h += `<div class="sub" style="margin-top:14px">the ground still answers to ${places.slice(0, 4).join(', ')}.</div>`;
    // ⚠ the button is the ONLY prompt in the flow, and it is dad's act, not a
    // game-over menu: the layout is still on the table.
    h += `<div class="endrow">` +
      `<button id="refoundBtn" class="warm">set out new figures</button>` +
      `<button id="leaveBtn">leave it dark</button></div>`;
    h += `<div class="foot">a DIRTY BOY DEVS game</div>`;
    body.innerHTML = h;
    $('pageWrap').classList.remove('hide');
    $('refoundBtn').addEventListener('click', () => {
      if (this.sim.refound(14)) {
        this._endShown = false;
        $('pageWrap').classList.add('hide');
        if (this.app && this.app.view) this.app.view.lookAtTown();
      }
    });
    // leaving it dark is a real choice: the page closes and the board stays.
    // _endShown stays true so it does not nag; the book reopens it if asked.
    $('leaveBtn').addEventListener('click', () => $('pageWrap').classList.add('hide'));
  }

  // 9:16 PNG. This is the shareable artifact and it is a launch feature.
  exportPage() {
    // ⚠️ IT SAVES WHAT IS ON SCREEN. This used to render s.page() under a
    // hardcoded 'the book of the town' no matter which chapter was open, so
    // pressing the button under 'the yard' — the page the fiction just promised
    // — saved a picture of the chronicle with no grave in it, and a dead town
    // exported without its last-page register. The book now has four chapters
    // plus the away page, and one button beneath all of them, so the picture is
    // read back off #pageBody: whatever the reader is looking at is what they
    // share. Falls back to the chronicle if the DOM is not there.
    const s = this.sim;
    const body = $('pageBody');
    const h2 = body && body.querySelector('h2');
    const subEl = body && body.querySelector('.sub');
    const title = h2 ? h2.textContent : 'the book of the town';
    const sub = subEl ? subEl.textContent
      : `day ${s.day} · ${s.alive || 0} alive · ${s.graves.length} in the yard`;
    const rows = body ? [...body.querySelectorAll('ol > li')].map(li => {
      const sp = li.querySelector('span');
      const day = sp ? sp.textContent : '';
      return { day, text: li.textContent.slice(day.length).trim() };
    }) : s.page();
    const p = rows;
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

    // one wrapper for the subtitle and the rows; returns the last baseline used
    const wrap = (text, x, y0, maxW, lh) => {
      let line = '', ly = y0;
      for (const w of String(text).split(' ')) {
        const test = line ? line + ' ' + w : w;
        if (g.measureText(test).width > maxW) { g.fillText(line, x, ly); ly += lh; line = w; }
        else line = test;
      }
      g.fillText(line, x, ly);
      return ly;
    };

    g.fillStyle = '#e8eef7';
    g.font = '600 76px Georgia, serif';
    g.fillText(title, 80, 640);
    g.fillStyle = '#8b97a8';
    g.font = '300 38px Georgia, serif';
    // ⚠️ the last page's register runs long — wrap it rather than letting it
    // walk off the right edge of the picture
    let y = wrap(sub, 80, 700, W - 160, 48) + 130;

    // ⚠️ THE CHAPTERS CAN BE 40 ROWS LONG and the chronicle never was, so the
    // old unbounded loop would have drawn the yard straight off the bottom of
    // the canvas. Draw until the next row would reach the footer, then say what
    // was left behind — in the book's own voice, not as a truncation notice.
    const FOOT = H - 210;   // leaves the trailing line real air above the footer
    let left = 0;
    for (const e of p) {
      if (y > FOOT) { left++; continue; }
      g.fillStyle = '#4e5a6b'; g.font = '300 30px Georgia, serif';
      g.fillText(String(e.day), 80, y);
      g.fillStyle = '#dbe4f0'; g.font = '300 42px Georgia, serif';
      y = wrap(e.text, 180, y, W - 260, 54) + 96;
    }
    if (left > 0) {
      g.fillStyle = '#5a6675'; g.font = 'italic 300 34px Georgia, serif';
      g.fillText(`and ${left} more, in the book.`, 180, Math.min(y, FOOT + 56));
    }

    g.fillStyle = '#5a6675'; g.font = '300 30px Georgia, serif';
    g.fillText('DON’T TOUCH · a DIRTY BOY DEVS game', 80, H - 90);

    c.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      const ch = this.chapter && this.chapter !== 'days' ? `-${this.chapter}` : '';
      a.download = `dont-touch${ch}-day-${s.day}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
  }
}
