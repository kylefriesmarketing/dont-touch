// DON'T TOUCH — sfx.js
// All synthesis, no samples. The basement is the bed; the town is quiet. (bible §15.4)

export class Sfx {
  constructor() {
    this.ready = false; this.muted = localStorage.getItem('donttouch-mute') === '1';
  }

  start() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(c.destination);

    // --- the basement: the furnace one room over, mains hum in the wires ----
    const roomG = c.createGain(); roomG.gain.value = 0.055; roomG.connect(this.master);
    const hum = c.createOscillator(); hum.type = 'sine'; hum.frequency.value = 59.5;
    const hum2 = c.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 119.3;
    const hg2 = c.createGain(); hg2.gain.value = 0.22; hum2.connect(hg2); hg2.connect(roomG);
    hum.connect(roomG); hum.start(); hum2.start();

    // --- air: filtered noise -------------------------------------------------
    const nb = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const nd = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; nd[i] = last * 3.2; }
    this.noiseBuf = nb;
    const air = c.createBufferSource(); air.buffer = nb; air.loop = true;
    this.airF = c.createBiquadFilter(); this.airF.type = 'lowpass'; this.airF.frequency.value = 420;
    this.airG = c.createGain(); this.airG.gain.value = 0.03;
    air.connect(this.airF); this.airF.connect(this.airG); this.airG.connect(this.master);
    air.start();

    // --- rain ---------------------------------------------------------------
    const rain = c.createBufferSource(); rain.buffer = nb; rain.loop = true;
    const rf = c.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 2400; rf.Q.value = 0.6;
    this.rainG = c.createGain(); this.rainG.gain.value = 0;
    rain.connect(rf); rf.connect(this.rainG); this.rainG.connect(this.master);
    rain.start();

    // --- THE COLONY DRONE ---------------------------------------------------
    // Aggregate wellbeing as consonance. You learn to hear a sick jar. (§15.4)
    this.drone = [];
    const root = 110;
    [1, 1.5, 2, 3].forEach((mult, i) => {
      const o = c.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = root * mult;
      const g = c.createGain(); g.gain.value = 0;
      const p = c.createStereoPanner ? c.createStereoPanner() : null;
      if (p) { p.pan.value = (i - 1.5) * 0.4; o.connect(g); g.connect(p); p.connect(this.master); }
      else { o.connect(g); g.connect(this.master); }
      o.start();
      this.drone.push({ o, g, mult });
    });

    this.ready = true;
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('donttouch-mute', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  // Called every frame with the sim.
  update(sim, dt) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const wb = sim.wellbeing || 0;
    const pop = Math.min(1, (sim.alive || 0) / 90);

    // consonance: healthy = a clean fifth stack, sick = detuned and thin
    const sick = 1 - wb;
    this.drone.forEach((d, i) => {
      const detune = sick * sick * (i * 7 + 3);
      d.o.frequency.setTargetAtTime(110 * d.mult + detune, t, 0.4);
      const want = (i === 0 ? 0.05 : 0.028 * (1 - i * 0.18)) * pop * (0.25 + wb * 0.95);
      d.g.gain.setTargetAtTime(Math.max(0, want), t, 0.6);
    });

    // ── the house talks to itself ──────────────────────────────
    // A creak every half-minute or so, a pipe tick a little oftener. All
    // Math.random — audio is view-side and never touches the sim's rng.
    // ⚠ the Age of Toys ambience lesson stands: no raw endless waveforms, no
    // sub-drones. These are EVENTS, quiet ones, and the room stays a room.
    this._creakT = (this._creakT || 12) - dt;
    if (this._creakT <= 0) {
      this._creakT = 18 + Math.random() * 34;
      this._creak();
    }
    this._tickT = (this._tickT || 7) - dt;
    if (this._tickT <= 0) {
      this._tickT = 9 + Math.random() * 22;
      if (Math.random() < 0.6) this._pipeTick();
    }
    this.airF.frequency.setTargetAtTime(300 + sim.daylight * 900, t, 1.2);
    this.airG.gain.setTargetAtTime(0.018 + sim.daylight * 0.03, t, 1.2);
    this.rainG.gain.setTargetAtTime(sim.rainLeft > 0 ? 0.075 : 0, t, 0.8);
  }

  _blip(freq, dur, type, vol, pan) {
    if (!this.ready || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol == null ? 0.05 : vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (c.createStereoPanner && pan != null) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    o.connect(g); node.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // a floor joist settling one room over: a pitch-bent groan through a low
  // filter, quiet enough to be doubted
  _creak() {
    if (!this.ready || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'triangle';
    const f0 = 70 + Math.random() * 60;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (0.8 + Math.random() * 0.5), t + 0.55);
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 260; fl.Q.value = 3.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.028 + Math.random() * 0.02, t + 0.10);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(fl); fl.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1);
  }

  // the heating pipe, twice: tick... tick
  _pipeTick() {
    if (!this.ready || this.muted) return;
    const d0 = Math.random() * 0.1;
    this._blip(1900 + Math.random() * 700, 0.05, 'square', 0.012, (Math.random() - 0.5) * 0.8);
    setTimeout(() => this._blip(1700 + Math.random() * 500, 0.04, 'square', 0.009, (Math.random() - 0.5) * 0.8), 140 + d0 * 400);
  }

  // ── THE MUSIC BOX ───────────────────────────────────────────
  // Plays ONCE when the light is pulled on — the browser will not let audio
  // start before a gesture, and the chain pull IS the gesture, which is better
  // fiction than a title theme anyway: pulling the light on winds the box.
  // A dozen plucked notes, slightly detuned like a tired mechanism, slowing
  // and fading at the end the way a music box actually runs down.
  musicBox() {
    if (!this.ready || this.muted || this._boxPlayed) return;
    this._boxPlayed = true;
    const c = this.ctx, t0 = c.currentTime + 0.3;
    // D minor pentatonic-ish lullaby, in music-box register
    const seq = [587, 698, 880, 698, 587, 440, 523, 587, 440, 349, 440, 587, 523, 440, 349, 294];
    let tt = t0;
    seq.forEach((f, i) => {
      const slow = 1 + Math.max(0, i - 11) * 0.12;      // the spring runs down
      const det = 1 + (Math.random() - 0.5) * 0.004;    // tired mechanism
      const vol = 0.035 * (i >= 12 ? 1 - (i - 11) * 0.18 : 1);
      for (const [mult, mv] of [[1, 1], [2, 0.35], [3.01, 0.12]]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * det * mult;
        const g = c.createGain();
        g.gain.setValueAtTime(0, tt);
        g.gain.linearRampToValueAtTime(vol * mv, tt + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.6);
        o.connect(g); g.connect(this.master);
        o.start(tt); o.stop(tt + 1.7);
      }
      tt += (i % 4 === 3 ? 0.62 : 0.34) * slow;
    });
  }

  // ── THE AGE CHIME ───────────────────────────────────────────
  // One small bell when the town turns an age — the check-in player's reward
  // for coming back down the stairs. Inharmonic partials so it reads as METAL,
  // not as an interface bleep.
  chime() {
    if (!this.ready || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    for (const [f, v, dur] of [[660, 0.05, 2.6], [1567, 0.022, 2.0], [2310, 0.01, 1.3]]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  // the tap you should not do
  tap() {
    if (!this.ready || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(2400, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.25);
  }

  touch() { this._blip(180, 0.5, 'sine', 0.03); }
  birth() { this._blip(720, 0.35, 'triangle', 0.05); setTimeout(() => this._blip(1080, 0.3, 'triangle', 0.035), 90); }
  death() { this._blip(150, 1.1, 'sine', 0.055); }
  mutate() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this._blip(520 * Math.pow(1.26, i), 0.5, 'sine', 0.045), d)); }
  lid() { this._blip(90, 0.7, 'sawtooth', 0.035); }
  thunder() { this._blip(60, 1.6, 'sine', 0.06); }
}
