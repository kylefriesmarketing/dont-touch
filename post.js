// DON'T TOUCH — post.js
// The miniature look. View-only, and the sim never hears about it.
//
// Real toys get photographed with a macro lens, so only a shallow band is in
// focus — and that defocus falloff is the strongest cue a brain has that a
// scene is SMALL. This game is a model layout seen from above, so the cue is
// not decoration here, it is the subject.
//
// Chain: scene -> MSAA render target -> bright pass (1/2) -> two blurs = bloom
//        -> a second blur of the whole frame = defocus
//        -> composite(sharp, defocused, bloom) -> canvas
//
// ⚠️ TRAPS, all of which cost somebody a day somewhere:
//  · `samples` on the render target, or post silently costs you the canvas's
//    MSAA and every edge in the game goes jaggy — a regression that is very
//    easy to ship blind because nothing errors.
//  · The bright-pass threshold is measured on LUMA of an already-clamped
//    buffer. Set it too low and the GRASS blooms, because a lit green field is
//    genuinely bright; the only things that should pass are the lanterns.
//    Do not "fix" weak bloom by lowering the threshold — brighten the source.
//  · blurMax is a gameplay number, not a taste number. The kin ARE the UI
//    (Invariant 7) and a lantern you cannot read is a lantern that says nothing.
import * as THREE from './lib/three.module.js';

const QUAD_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BRIGHT_FRAG = `
  uniform sampler2D tSrc; uniform float uThresh; uniform float uKnee;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float k = smoothstep(uThresh, uThresh + uKnee, l);
    gl_FragColor = vec4(c * k, 1.0);
  }
`;

// separable 9-tap gaussian; uDir is (1/w,0) or (0,1/h) times the radius
const BLUR_FRAG = `
  uniform sampler2D tSrc; uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec4 s = texture2D(tSrc, vUv) * 0.2270270270;
    s += texture2D(tSrc, vUv + uDir * 1.3846153846) * 0.3162162162;
    s += texture2D(tSrc, vUv - uDir * 1.3846153846) * 0.3162162162;
    s += texture2D(tSrc, vUv + uDir * 3.2307692308) * 0.0702702703;
    s += texture2D(tSrc, vUv - uDir * 3.2307692308) * 0.0702702703;
    gl_FragColor = s;
  }
`;

const COMPOSITE_FRAG = `
  uniform sampler2D tSharp, tSoft, tBloom;
  uniform float uBlurMax, uBandCenter, uBandHalf, uBandSoft;
  uniform float uBloom, uVignette, uSat, uLift;
  uniform vec3 uTint;
  varying vec2 vUv;
  void main() {
    // the focal band runs across the frame: with the camera looking down at an
    // angle, screen-Y IS depth, so a horizontal band is depth-correct
    float d = abs(vUv.y - uBandCenter);
    float blur = smoothstep(uBandHalf, uBandHalf + uBandSoft, d) * uBlurMax;

    vec3 sharp = texture2D(tSharp, vUv).rgb;
    vec3 soft  = texture2D(tSoft,  vUv).rgb;
    vec3 col = mix(sharp, soft, blur);

    col += texture2D(tBloom, vUv).rgb * uBloom;

    // grade: the lamp is warm and the shadows are cold
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, uSat) * uTint + uLift;

    // a photographed thing has a lens
    float r = distance(vUv, vec2(0.5)) * 1.414;
    col *= 1.0 - smoothstep(0.55, 1.25, r) * uVignette;

    gl_FragColor = vec4(col, 1.0);
    // ⚠️⚠️ THE WHOLE FRAME COMES OUT MUD WITHOUT THIS. three only applies the
    // output colour-space conversion when it renders to the CANVAS — render
    // into a target and the buffer holds LINEAR values. Compositing those
    // straight to an sRGB canvas is the classic "post made everything dark"
    // bug. Blur and mix in linear (which is correct), then encode once, here.
    #include <colorspace_fragment>
  }
`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.ok = !!(renderer.capabilities && renderer.capabilities.isWebGL2);
    this.p = {
      // ⚠️ this is an RTS-ish readout, not a photograph — the lanterns near the
      // frame edge still have to be legible. Resist making it prettier.
      blurMax: 0.52,
      bandCenter: 0.47, bandHalf: 0.26, bandSoft: 0.30,
      bloom: 0.60, bloomThreshold: 0.42, bloomKnee: 0.22,   // LINEAR luma
      vignette: 0.16, sat: 1.13, lift: 0.010,
      tint: new THREE.Color(1.015, 1.0, 0.975),
    };
    if (!this.ok) return;

    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene.add(this.quad);

    const mk = (frag, uniforms) => new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false,
    });
    this.mBright = mk(BRIGHT_FRAG, {
      tSrc: { value: null }, uThresh: { value: 0.62 }, uKnee: { value: 0.22 },
    });
    this.mBlur = mk(BLUR_FRAG, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.mComp = mk(COMPOSITE_FRAG, {
      tSharp: { value: null }, tSoft: { value: null }, tBloom: { value: null },
      uBlurMax: { value: 0 }, uBandCenter: { value: 0 }, uBandHalf: { value: 0 }, uBandSoft: { value: 0 },
      uBloom: { value: 0 }, uVignette: { value: 0 }, uSat: { value: 1 }, uLift: { value: 0 },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
    });
    this.size = new THREE.Vector2(1, 1);
  }

  setSize(w, h) {
    if (!this.ok || (this.size.x === w && this.size.y === h)) return;
    this.size.set(w, h);
    const opt = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
    [this.rtScene, this.rtHalfA, this.rtHalfB, this.rtQuartA, this.rtQuartB]
      .forEach(rt => rt && rt.dispose());
    this.rtScene = new THREE.WebGLRenderTarget(w, h, opt);
    // ⚠️ WITHOUT THIS THE WHOLE GAME GOES JAGGY. Rendering into a target skips
    // the canvas's own multisampling, and nothing warns you.
    this.rtScene.samples = 4;
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    const qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
    this.rtHalfA = new THREE.WebGLRenderTarget(hw, hh, opt);
    this.rtHalfB = new THREE.WebGLRenderTarget(hw, hh, opt);
    this.rtQuartA = new THREE.WebGLRenderTarget(qw, qh, opt);
    this.rtQuartB = new THREE.WebGLRenderTarget(qw, qh, opt);
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target || null);
    this.renderer.render(this.scene, this.cam);
  }

  _blur(src, a, b, radius) {
    const w = a.width, h = a.height;
    this.mBlur.uniforms.tSrc.value = src.texture;
    this.mBlur.uniforms.uDir.value.set(radius / w, 0);
    this._pass(this.mBlur, a);
    this.mBlur.uniforms.tSrc.value = a.texture;
    this.mBlur.uniforms.uDir.value.set(0, radius / h);
    this._pass(this.mBlur, b);
    return b;
  }

  render(scene, camera) {
    const r = this.renderer, p = this.p;
    if (!this.ok) { r.setRenderTarget(null); r.render(scene, camera); return; }
    const sz = r.getSize(new THREE.Vector2());
    this.setSize(Math.max(2, sz.x | 0), Math.max(2, sz.y | 0));

    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    // bloom: only what is genuinely brighter than the field
    this.mBright.uniforms.tSrc.value = this.rtScene.texture;
    this.mBright.uniforms.uThresh.value = p.bloomThreshold;
    this.mBright.uniforms.uKnee.value = p.bloomKnee;
    this._pass(this.mBright, this.rtQuartA);
    const bloom = this._blur(this.rtQuartA, this.rtQuartB, this.rtQuartA, 1.6);

    // defocus: the whole frame, softened, to be mixed back by the band
    const soft = this._blur(this.rtScene, this.rtHalfA, this.rtHalfB, 2.1);

    const u = this.mComp.uniforms;
    u.tSharp.value = this.rtScene.texture;
    u.tSoft.value = soft.texture;
    u.tBloom.value = bloom.texture;
    u.uBlurMax.value = p.blurMax;
    u.uBandCenter.value = p.bandCenter;
    u.uBandHalf.value = p.bandHalf;
    u.uBandSoft.value = p.bandSoft;
    u.uBloom.value = p.bloom;
    u.uVignette.value = p.vignette;
    u.uSat.value = p.sat;
    u.uLift.value = p.lift;
    u.uTint.value.set(p.tint.r, p.tint.g, p.tint.b);
    this._pass(this.mComp, null);
  }
}
