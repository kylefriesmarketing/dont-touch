// THE GLASS — sfx.js
// All synthesis, no samples. The room is the bed; the jar is quiet. (bible §15.4)

export class Sfx {
  constructor() {
    this.ready = false; this.muted = localStorage.getItem('theglass-mute') === '1';
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

    // --- the room: a refrigerator two rooms away, and the window ------------
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
    localStorage.setItem('theglass-mute', m ? '1' : '0');
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
