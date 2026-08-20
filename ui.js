// DON'T TOUCH — ui.js
// DOM overlay. The game must be fully playable with every panel closed. (Invariant 7)

import { LOCI, L, NEEDS, STAGE, STAGE_NAME, expressed, carried, marrowHomozygous, LANTERN_HUE } from './sim.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const hueCss = (h, l) => `hsl(${h} 72% ${l}%)`;
// ⚠️ keep in step with the log() kinds in sim.js — a beat missing from here
// still reaches the book, it just scrolls past in the feed looking ordinary.
const BIG = new Set(['mutation', 'death-named', 'end', 'invented', 'reinvented',
  'tradition', 'lost', 'stands', 'learned', 'stillgone', 'stillcarried']);

export class UI {
  constructor(sim, app) {
    this.sim = sim; this.app = app;
    this.selected = -1;
    this.lastChron = 0;
    this.chronBox = $('chron');
    this.wire();
  }

  wire() {
    $('speed').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.app.setSpeed(+b.dataset.s);
    });
    $('curtain').addEventListener('input', (e) => this.sim.setCurtain(+e.target.value / 100));
    $('lamp').addEventListener('click', () => { this.sim.setLamp(!this.sim.lampOn); this.app.sfx.touch(); this.sync(); });
    $('lidBtn').addEventListener('click', () => { this.sim.setLid(!this.sim.lid); this.app.sfx.lid(); this.sync(); });
    $('mute').addEventListener('click', () => { this.app.sfx.setMuted(!this.app.sfx.muted); this.sync(); });
    $('pageBtn').addEventListener('click', () => this.showPage());
    $('closePage').addEventListener('click', () => $('pageWrap').classList.add('hide'));
    $('savePage').addEventListener('click', () => this.exportPage());
    $('closeInspect').addEventListener('click', () => { this.selected = -1; $('inspect').classList.add('hide'); });
    $('helpBtn').addEventListener('click', () => $('help').classList.toggle('hide'));
    $('help').addEventListener('click', () => $('help').classList.add('hide'));
  }

  select(id) {
    this.selected = id;
    $('inspect').classList.toggle('hide', id < 0);
  }

  sync() {
    $('mute').textContent = this.app.sfx.muted ? 'sound off' : 'sound on';
    $('lamp').textContent = this.sim.lampOn ? 'bulb on' : 'bulb off';
    $('lidBtn').textContent = this.sim.lid ? 'cover off' : 'cover on';
    [...$('speed').children].forEach(b => b.classList.toggle('on', +b.dataset.s === this.app.speed));
  }

  frame() {
    const s = this.sim;
    $('hud').innerHTML =
      `<b>day ${s.day}</b><span>·</span>` +
      `<b>${s.alive || 0}</b> alive<span>·</span>` +
      `${s.graves.length} graves<span>·</span>` +
      `gen ${s.stats.generations}<span>·</span>` +
      `${(s.wellbeing * 100 || 0) | 0}% lit`;

    // the weather strip
    const t = s.temp[s.idx(s.hearth.x, s.hearth.y)];
    $('weather').innerHTML =
      `${t.toFixed(0)}°<span>·</span>` +
      `${s.rainLeft > 0 ? 'raining' : s.humid > 4.4 ? 'close' : 'clear'}<span>·</span>` +
      `${s.daylight > 0.55 ? 'bright' : s.daylight > 0.12 ? 'low sun' : 'dark'}`;

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
      // the beats that matter enough to stand out in the feed
      if (BIG.has(e.kind)) line.classList.add('big');
      this.chronBox.appendChild(line);
      if (e.kind === 'mutation') this.app.sfx.mutate();
      else if (e.kind === 'death-named') this.app.sfx.death();
      else if (e.kind === 'clutch' || e.kind === 'hatch') this.app.sfx.birth();
      else if (e.kind === 'rain') this.app.sfx.thunder();
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
    // with the goal list in sim.js _decide (0 wander … 9 tend)
    const GOALS = ['wandering', 'looking for food', 'going to water', 'looking for a warm place',
      'resting', 'looking for company', 'getting away', 'courting', 'carrying the dead',
      'going to the one who stays', 'making something'];

    const glued = !!k.glued[id];
    let h = `<div class="who"><span class="dot" style="background:${hueCss(k.hue[id], 55)}"></span>
      <b>${nm}</b><i>${st} · ${k.age[id].toFixed(0)} of ~${k.lifespan[id].toFixed(0)} days</i></div>`;
    // they still want everything anyone wants. they simply cannot go and get it.
    h += `<div class="doing">${glued ? 'wants ' + (GOALS[k.goal[id]] || 'nothing').replace(/^(looking for|going to) /, '') + ' · cannot move' : (GOALS[k.goal[id]] || 'standing')}</div>`;
    if (glued) h += `<div class="line2" style="color:#c79a3e">stuck fast to the world. whatever ${nm} needs, somebody has to bring it.</div>`;

    h += '<div class="needs">';
    for (let n = 0; n < NN; n++) {
      const v = k.need[base + n];
      h += `<div class="need"><label>${NEEDS[n]}</label>
        <div class="bar"><i style="width:${(v * 100) | 0}%;background:${v > 0.55 ? '#6fc' : v > 0.25 ? '#fc6' : '#f66'}"></i></div></div>`;
    }
    h += '</div>';
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
    const sub = fromDay > 0
      ? `${s.day - fromDay} days passed · ${s.alive || 0} alive · ${s.graves.length} in the yard`
      : `day ${s.day} · ${s.alive || 0} alive · ${s.graves.length} in the yard`;
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

    // a field of lanterns as the letterhead
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * W, y = 120 + Math.random() * 420;
      const hue = [172, 44, 340, 104, 282, 18][(Math.random() * 6) | 0];
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
