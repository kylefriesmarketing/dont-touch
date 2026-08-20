// DON'T TOUCH — gesture.js
// Turns raw pointer events into NAMED GESTURES. It knows nothing about the sim
// and nothing about what any gesture means — it reports only what the hand did.
// main.js owns the mapping from gesture to consequence.
//
// ⚠️ WHY DURATION AND NOT PRESSURE. PointerEvent.pressure is 0.5 for every mouse
// button that is down and 0 when it is up — it carries no information at all on
// the hardware most players have. Only a stylus and some trackpads report real
// force. So "pressing harder" HAS to be expressed as pressing LONGER, and the
// game has to teach that. A design that keys off `e.pressure` works on the
// developer's iPad and nowhere else.
//
// ⚠️ WHY THE THRESHOLDS OVERLAP THE WAY THEY DO. Every gesture here has to be
// separable from every other one AND from a camera orbit, using only position
// and time, on a mouse and on a finger, with no modifier keys available on
// touch. The ordering below is the disambiguation:
//   moved far  -> it is a DRAG, whatever else it might have been
//   moved little + released fast -> TAP
//   moved little + still down -> REST, deepening into PRESS with time
// Nothing is ambiguous because the tests are on disjoint ranges of one number.

export const G = {
  TAP_MS: 230,        // released inside this and barely moved = a tap
  TAP_PX: 7,          // "barely moved", in CSS pixels
  REST_MS: 260,       // past a tap, the finger is resting
  PRESS_MS: 3200,     // resting this long is no longer resting
  DRAG_PX: 14,        // past this the hand is drawing, not resting
  JOLT_VPX: 2.6,      // px per ms — a shove rather than a lean
  JOLT_MS: 260,       // and it has to be over about this fast
  RING_CLOSE: 0.30,   // path returns within 30% of its own span = a closed loop
  RING_MIN_PTS: 12,
  SAMPLE_MS: 28,      // how often the path is sampled
};

// Douglas–Peucker would be nicer; this is a fixed-rate sample, which is enough
// for a warm trail and costs nothing.
export class Gesture {
  constructor() { this.reset(); }

  reset() {
    this.active = false;
    this.kind = null;        // 'tap' | 'rest' | 'press' | 'drag' | 'ring'
    this.path = [];          // [{x, y, t}] in client px
    this.cells = [];         // [[cx, cy]] whatever the caller pushed
    this.t0 = 0;
    this.moved = 0;          // total path length, px
    this.span = 0;           // max distance from the start point
    this.peakV = 0;          // px/ms
    this.held = 0;           // ms since down
    this.sawRing = false;    // latched: a loop that shut stays shut
    this._lastSample = 0;
  }

  start(x, y, t) {
    this.reset();
    this.active = true;
    this.t0 = t;
    this.path.push({ x, y, t });
    this._lastSample = t;
    this.kind = 'rest';
    return this.kind;
  }

  // returns the CURRENT kind, which may have changed since the last move
  move(x, y, t) {
    if (!this.active) return null;
    const p = this.path[this.path.length - 1];
    const dx = x - p.x, dy = y - p.y;
    const d = Math.hypot(dx, dy);
    const dt = Math.max(1, t - p.t);
    this.peakV = Math.max(this.peakV, d / dt);
    this.moved += d;
    const s = this.path[0];
    this.span = Math.max(this.span, Math.hypot(x - s.x, y - s.y));
    this.held = t - this.t0;

    if (t - this._lastSample >= G.SAMPLE_MS) { this.path.push({ x, y, t }); this._lastSample = t; }

    if (this.moved > G.DRAG_PX) {
      // a closed loop is a drag that came home. Checked continuously so the
      // ring can be recognised the moment it shuts, not only on release.
      // ⚠️ LATCHED. Without it a player who closes a loop and then keeps the
      // finger moving drops straight back to 'drag', and the ring they just drew
      // is never acted on. A loop that shut stays shut for the rest of the stroke.
      if (this.path.length >= G.RING_MIN_PTS && this.span > 40 &&
          Math.hypot(x - s.x, y - s.y) < this.span * G.RING_CLOSE) this.sawRing = true;
      this.kind = this.sawRing ? 'ring' : 'drag';
    } else if (this.held > G.PRESS_MS) this.kind = 'press';
    else this.kind = 'rest';
    return this.kind;
  }

  // call every frame even when the pointer is still — a rest becomes a press
  // through time alone, and nothing moves to tell you about it.
  tick(t) {
    if (!this.active) return null;
    this.held = t - this.t0;
    if (this.kind === 'rest' && this.held > G.PRESS_MS) this.kind = 'press';
    return this.kind;
  }

  end(t) {
    if (!this.active) return null;
    this.held = t - this.t0;
    let k = this.kind;
    if (this.moved <= G.TAP_PX && this.held <= G.TAP_MS) k = 'tap';
    this.active = false;
    this.kind = k;
    return k;
  }

  // was that a shove rather than a lean? used by the board, not the finger
  isJolt() { return this.peakV > G.JOLT_VPX && this.held < G.JOLT_MS; }

  // how far into a press we are, 0 at the moment resting stops and 1 well past it
  pressF() {
    if (this.held <= G.REST_MS) return 0;
    return Math.min(1, (this.held - G.REST_MS) / (G.PRESS_MS - G.REST_MS));
  }
}
