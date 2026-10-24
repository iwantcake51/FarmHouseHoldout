// Looking through a scope in first person (the hunting scope, the ACOG). What's down it is a second view of the farm,
// along the scope's own axis from its front lens (so it sways and kicks with the gun), as much of the world as the
// eyepiece covers shown that many times bigger, drawn into the eyepiece's circle on the screen. Over it: the reticle (a
// hunting scope's duplex, the ACOG's lit red chevron and its drop marks), the colour fringes and the darkening of the
// glass toward its rim, and the shadow of the tube closing in from one side when your eye's off the scope's axis
// (bringing it up, a shot's kick, a quick turn: game/view-cam.js, SCOPE_V.off), the picture and the reticle sliding a
// little against each other as it does (parallax). Round it the rest of the view's dimmed, your eye on the scope.
import { FP_CAM, R, scene } from '../core/renderer.js';
import { PM } from '../player/player.js';
import { SCOPE_V } from '../game/view-cam.js';

// how dim the view round the eyepiece goes, right at its rim and further out; and the most the scope's view is drawn at
const SCOPE_DIM = { rim: 0.9, out: 0.55, max: 1024 };
const SC = { rt: null, size: 0 }, _sz = new THREE.Vector2(), _sp = new THREE.Vector3(), _st = new THREE.Vector3();
const scopeCam = new THREE.PerspectiveCamera(10, 1, 0.08, 200);
const scopeMat = new THREE.ShaderMaterial({
  uniforms: { tS: { value: null }, uC: { value: new THREE.Vector2() }, uR: { value: 100 }, uA: { value: 0 }, uKind: { value: 0 }, uOff: { value: new THREE.Vector2() }, uDim: { value: new THREE.Vector2(SCOPE_DIM.rim, SCOPE_DIM.out) } },
  vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
uniform sampler2D tS; uniform vec2 uC, uOff, uDim; uniform float uR, uA, uKind;
// a line's coverage, half width w, at distance d (in the lens's units: its radius is 1), smoothed over a pixel
float ln(float d, float w, float px) { return 1.0 - smoothstep(w - px, w + px, d); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
void main() {
  vec2 p = (gl_FragCoord.xy - uC) / uR; float d = length(p), px = 1.0 / uR;
  // round the eyepiece: its rim dark, the rest of the view dimmed
  float outside = uA * mix(uDim.x, uDim.y, smoothstep(1.02, 1.7, d));
  // the picture, slid a touch against your eye's offset (parallax), with colour fringes toward the rim
  vec2 uv = p * 0.5 + 0.5 - uOff * 0.035;
  float ca = 0.008 * d * d;
  vec3 col = vec3(texture2D(tS, (uv - 0.5) * (1.0 + ca) + 0.5).r, texture2D(tS, uv).g, texture2D(tS, (uv - 0.5) * (1.0 - ca) + 0.5).b);
  col *= vec3(0.98, 1.0, 1.02);   // the coatings' faint cast
  // the reticle, in the scope (moved a little less than the picture: what's left of the parallax)
  vec2 q = p - uOff * 0.012;
  if (uKind < 0.5) {
    // a duplex: fine cross hairs in the middle, thick posts out to the rim
    float t = max(ln(abs(q.x), 0.0035, px) * step(abs(q.y), 0.34), ln(abs(q.y), 0.0035, px) * step(abs(q.x), 0.34));
    float k = max(ln(abs(q.x), 0.016, px) * step(0.34, abs(q.y)), ln(abs(q.y), 0.016, px) * step(0.34, abs(q.x)));
    col = mix(col, vec3(0.02), max(t, k));
  } else {
    // the ACOG: a lit red chevron, its tip the aim, and the drop line under it with its marks
    float cv = min(seg(q, vec2(-0.075, -0.07), vec2(0.0, 0.0)), seg(q, vec2(0.075, -0.07), vec2(0.0, 0.0)));
    float bdc = ln(abs(q.x), 0.003, px) * step(q.y, -0.11) * step(-0.62, q.y);
    for (int i = 1; i <= 5; i++) { float y = -0.11 - float(i) * 0.1, w = 0.07 - float(i) * 0.01; bdc = max(bdc, ln(abs(q.y - y), 0.003, px) * step(abs(q.x), w)); }
    col = mix(col, vec3(0.02), bdc);
    col = mix(col, vec3(1.0, 0.16, 0.08) * 1.5, ln(cv, 0.008, px));
    col += vec3(1.0, 0.2, 0.1) * 0.35 * exp(-cv * cv / 0.0012);   // its glow
  }
  // the tube's shadow, closing in from where your eye's off its axis, and the glass darkening to its rim
  col *= 1.0 - smoothstep(0.72, 1.0, length(p + uOff * 0.8));
  col *= 1.0 - 0.3 * smoothstep(0.7, 1.0, d);
  float inside = 1.0 - smoothstep(1.0 - px * 1.5, 1.0 + px * 1.5, d);
  gl_FragColor = vec4(col * inside, mix(outside, uA, inside));
}`,
  transparent: true, depthTest: false, depthWrite: false
});
const scopeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), scopeMat); scopeQuad.frustumCulled = false;
const scopeScene = new THREE.Scene(); scopeScene.add(scopeQuad);
const scopeQCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// over the finished frame, while a scope's up (game/loop.js)
export function scopePass() {
  const S = SCOPE_V; if (!S.on || S.a < 0.01) return;
  R.getDrawingBufferSize(_sz); const W = _sz.x, H = _sz.y, c = FP_CAM;
  // the eyepiece on the screen: where its middle is and how big it looks from your eye
  _sp.copy(S.eye).project(c); if (_sp.z > 1) return;
  const f = H / 2 / Math.tan(c.fov * Math.PI / 360), dist = Math.max(0.02, c.position.distanceTo(S.eye)), r = S.r / dist * f;
  // what's down it: the world over as much of your view as the eyepiece covers, S.mag times bigger
  const half = Math.atan(r / f); scopeCam.fov = 2 * Math.atan(Math.tan(half) / S.mag) * 180 / Math.PI; scopeCam.updateProjectionMatrix();
  scopeCam.position.copy(S.obj); scopeCam.up.set(0, 1, 0).applyQuaternion(c.quaternion); scopeCam.lookAt(_st.copy(S.obj).add(S.dir)); scopeCam.updateMatrixWorld(true);
  const size = Math.min(SCOPE_DIM.max, Math.max(128, Math.round(r * 2 / 64) * 64));
  if (!SC.rt || SC.size !== size) { if (SC.rt) SC.rt.dispose(); SC.rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, samples: Math.min(4, R.capabilities.maxSamples || 4) }); SC.size = size; }
  const prev = R.getRenderTarget(), ac = R.autoClear, sh = R.shadowMap.autoUpdate;
  // (you're left out of it: the gun's own front sight, or your arm, a hand's breadth from its front lens)
  const pv = PM.g.visible; PM.g.visible = false;
  R.shadowMap.autoUpdate = false; R.autoClear = true; R.setRenderTarget(SC.rt); R.render(scene, scopeCam); R.shadowMap.autoUpdate = sh; PM.g.visible = pv;
  const U = scopeMat.uniforms;
  U.tS.value = SC.rt.texture; U.uC.value.set((_sp.x + 1) / 2 * W, (_sp.y + 1) / 2 * H); U.uR.value = r; U.uA.value = S.a; U.uKind.value = S.kind; U.uOff.value.copy(S.off);
  R.setRenderTarget(null); R.autoClear = false; R.render(scopeScene, scopeQCam); R.autoClear = ac; R.setRenderTarget(prev);
}
