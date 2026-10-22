// The frame's own post-processing: ambient occlusion (SSAO) and a soft bloom, laid over the scene in one pass.
// The farm's drawn into a multisampled target (WebGL2) so it keeps its antialiasing and gives a depth texture; the
// occlusion's worked out from that depth at half the resolution, blurred wide and soft (gently held back across a big
// step in depth, so it doesn't spread far round a zombie onto the ground behind it, but grades off rather than
// stopping in steps) and brought up to full size smoothly; the bright
// parts (muzzle flashes, eyes and spit glowing in the dark) spread out at a quarter and an eighth of the size. Then one
// pass puts it all on the screen. Without WebGL2 the scene's drawn straight to the screen as it always was.
// The camera's orthographic, so a point's place in view comes straight from where it is on screen and its depth:
// that's what makes the occlusion cheap and exact here.

// AO: how far round a point it looks for what shades it (metres), how dark the most shaded corner goes, its bias (how
// near a surface counts as shading, against acne on flat ground), the samples by quality level, and how its shade
// thins out into the fog; BLOOM: where brightness starts to glow and how softly it comes in, and how strong it is,
// each [by day, in the dark] (curDark, lighting/day-night.js): by day only the brightest things glow, faintly, so
// sunlit walls don't haze over; in the dark a muzzle flash, a lamp, eyes and spit bloom out
const AO = { r: 0.55, k: 0.5, bias: 0.025, n: [0, 10, 14], pow: 1.25, keep: 0.9, fade: 2.5 };
const BLOOM = { th: [0.95, 0.87], knee: [0.07, 0.14], k: [0.1, 0.24], k2: [0.06, 0.15] };
// the things that glow whatever the hour (zombies' eyes and their halos and trails, muzzle flashes): on a layer of
// their own, drawn alone into a small target and added into the glow in full, where nothing nearer hides them (the
// scene's depth). GLOW.k: how strongly
const GLOW_LAYER = 3, GLOW = { k: 1.35 };
const lerpD = a => a[0] + (a[1] - a[0]) * clamp(curDark, 0, 1);
// POST.q: the quality the frame's run at (2 full, 1 fewer occlusion samples, 0 no occlusion: game/loop.js steps it
// down when the frame rate drops, before the resolution goes)
// POST.aoK: how much of the occlusion's shown, eased in and out (AO.fade a second) as it's turned on and off, so a
// quality change never pops it on or off the whole screen at once
const POST = { ok: R.capabilities.isWebGL2, q: 2, w: 0, h: 0, aoK: 1, aoT: 0 };
const PS_VERT = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// linear depth from the depth buffer: an orthographic camera's is straight from near to far
const PS_DEPTH = `
uniform sampler2D tDepth; uniform vec2 uNF;
float viewD(vec2 uv) { return uNF.x + texture2D(tDepth, uv).r * (uNF.y - uNF.x); }`;
const psMat = (frag, uniforms, defines) => new THREE.ShaderMaterial({ uniforms, defines: defines || {}, vertexShader: PS_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
// the hemisphere it samples, more of them near the middle
const AO_KERNEL = (() => {
  const n = AO.n[AO.n.length - 1], ks = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, z = 0.15 + 0.85 * ((i * 0.618034 + 0.31) % 1), r = Math.sqrt(1 - z * z), s = 0.12 + 0.88 * ((i + 1) / n) ** 2;
    ks.push(new THREE.Vector3(Math.cos(a) * r * s, Math.sin(a) * r * s, z * s));
  }
  return ks;
})();
const aoMat = psMat(`
${PS_DEPTH}
uniform vec2 uSize, uCenter, uPx; uniform float uR, uBias, uN; uniform vec3 uK[${AO_KERNEL.length}]; uniform mat4 uInvView;
varying vec2 vUv;
vec3 viewPos(vec2 uv, float d) { return vec3(uCenter + (uv - 0.5) * uSize, -d); }
void main() {
  float d = viewD(vUv);
  if (d > uNF.y * 0.995) { gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0); return; }
  vec3 P = viewPos(vUv, d);
  // its normal from the depth round it: the nearer of the two neighbours each way, so an edge doesn't bend it
  vec3 pl = viewPos(vUv - vec2(uPx.x, 0.0), viewD(vUv - vec2(uPx.x, 0.0))), pr = viewPos(vUv + vec2(uPx.x, 0.0), viewD(vUv + vec2(uPx.x, 0.0)));
  vec3 pd = viewPos(vUv - vec2(0.0, uPx.y), viewD(vUv - vec2(0.0, uPx.y))), pu = viewPos(vUv + vec2(0.0, uPx.y), viewD(vUv + vec2(0.0, uPx.y)));
  vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl, dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
  vec3 N = normalize(cross(dx, dy));
  // turned a different way every couple of centimetres, so its few samples blur into a smooth shade; the pattern's
  // fixed to the world, not the screen, so it moves with what it's on as the camera moves instead of crawling over it
  vec3 wq = floor((uInvView * vec4(P, 1.0)).xyz * 40.0);
  float rn = fract(sin(dot(wq, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 6.2831853;
  vec3 rv = vec3(cos(rn), sin(rn), 0.0), T = normalize(rv - N * dot(rv, N)), B = cross(N, T);
  mat3 tbn = mat3(T, B, N);
  float occ = 0.0;
  for (int i = 0; i < ${AO_KERNEL.length}; i++) {
    if (float(i) >= uN) break;
    vec3 s = P + tbn * uK[i] * uR;
    vec2 su = (s.xy - uCenter) / uSize + 0.5;
    float sd = viewD(su), sz = -sd;
    float range = smoothstep(0.0, 1.0, uR / max(abs(P.z - sz), 1e-4));
    occ += step(s.z + uBias, sz) * range;
  }
  float ao = 1.0 - occ / max(uN, 1.0);
  gl_FragColor = vec4(ao, d / uNF.y, 0.0, 1.0);
}`, { tDepth: { value: null }, uNF: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector2() }, uPx: { value: new THREE.Vector2() }, uR: { value: AO.r }, uBias: { value: AO.bias }, uN: { value: 8 }, uK: { value: AO_KERNEL }, uInvView: { value: new THREE.Matrix4() } });
// a wide, soft blur one way: a tap counts less the further its depth is from the middle's, but gently (a smooth
// falloff, not a cut), so the shade grades off round an edge instead of stopping at it in steps
const aoBlurMat = psMat(`
uniform sampler2D tAO; uniform vec2 uDir; uniform float uFar;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tAO, vUv); float d0 = c.g * uFar, sum = c.r, wsum = 1.0;
  for (int i = -6; i <= 6; i++) {
    if (i == 0) continue;
    vec4 s = texture2D(tAO, vUv + uDir * float(i));
    float dz = (s.g * uFar - d0) * 2.5;
    float w = exp(-float(i * i) / 24.0) / (1.0 + dz * dz);
    sum += s.r * w; wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, c.g, 0.0, 1.0);
}`, { tAO: { value: null }, uDir: { value: new THREE.Vector2() }, uFar: { value: 1 } });
// the occlusion kept steady from frame to frame: last frame's, found where this pixel's point was on the screen then (the
// camera's orthographic, so where it was follows from the two frames' views alone), blended with this frame's
// (AO.keep of the old). It's held to the range of this frame's own round it (so a zombie walking off leaves no smear of
// its shade behind), and thrown out where the depth there isn't what the point's was (it was hidden, or something's moved)
const aoTemporalMat = psMat(`
uniform sampler2D tCur, tHist; uniform mat4 uInvView, uPrevView; uniform vec2 uSize, uCenter, uPrevSize, uPrevCenter, uPx; uniform float uFar, uKeep, uValid;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tCur, vUv);
  if (uValid < 0.5 || c.g > 0.994) { gl_FragColor = c; return; }
  float d = c.g * uFar;
  vec4 Wp = uInvView * vec4(uCenter + (vUv - 0.5) * uSize, -d, 1.0);
  vec3 Vp = (uPrevView * Wp).xyz;
  vec2 pu = (Vp.xy - uPrevCenter) / uPrevSize + 0.5;
  if (pu.x < 0.0 || pu.y < 0.0 || pu.x > 1.0 || pu.y > 1.0) { gl_FragColor = c; return; }
  vec4 h = texture2D(tHist, pu);
  float mn = c.r, mx = c.r;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) { float v = texture2D(tCur, vUv + vec2(float(i), float(j)) * uPx).r; mn = min(mn, v); mx = max(mx, v); }
  float hv = clamp(h.r, mn - 0.04, mx + 0.04);
  float ok = 1.0 - smoothstep(0.08, 0.25 + d * 0.004, abs(h.g * uFar + Vp.z));
  gl_FragColor = vec4(mix(c.r, hv, uKeep * ok), c.g, 0.0, 1.0);
}`, { tCur: { value: null }, tHist: { value: null }, uInvView: { value: new THREE.Matrix4() }, uPrevView: { value: new THREE.Matrix4() }, uSize: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector2() }, uPrevSize: { value: new THREE.Vector2() }, uPrevCenter: { value: new THREE.Vector2() }, uPx: { value: new THREE.Vector2() }, uFar: { value: 1 }, uKeep: { value: 0.88 }, uValid: { value: 0 } });
// the bright parts, softly cut off, boxed down four pixels to one
const brightMat = psMat(`
uniform sampler2D tCol, tGlow, tGlowD, tSceneD; uniform vec2 uPx; uniform float uTh, uKnee, uGlow;
varying vec2 vUv;
void main() {
  vec3 c = (texture2D(tCol, vUv + uPx * vec2(-1.0, -1.0)).rgb + texture2D(tCol, vUv + uPx * vec2(1.0, -1.0)).rgb + texture2D(tCol, vUv + uPx * vec2(-1.0, 1.0)).rgb + texture2D(tCol, vUv + uPx * vec2(1.0, 1.0)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  vec3 o = c * smoothstep(uTh, uTh + uKnee, l);
  // and the glowing things, where they're not behind something
  // (a halo or a trail writes no depth of its own: it's taken as seen, as it only shows on a zombie you can see)
  if (uGlow > 0.0) { float gd = texture2D(tGlowD, vUv).r, seen = gd > 0.9999 ? 1.0 : step(gd, texture2D(tSceneD, vUv).r + 0.0015); o += texture2D(tGlow, vUv).rgb * seen * uGlow; }
  gl_FragColor = vec4(o, 1.0);
}`, { tCol: { value: null }, tGlow: { value: null }, tGlowD: { value: null }, tSceneD: { value: null }, uPx: { value: new THREE.Vector2() }, uTh: { value: 0.8 }, uKnee: { value: 0.2 }, uGlow: { value: 0 } });
const blurMat = psMat(`
uniform sampler2D tSrc; uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
  c += (texture2D(tSrc, vUv + uDir * 1.3846154).rgb + texture2D(tSrc, vUv - uDir * 1.3846154).rgb) * 0.3162162;
  c += (texture2D(tSrc, vUv + uDir * 3.2307692).rgb + texture2D(tSrc, vUv - uDir * 3.2307692).rgb) * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
const copyMat = psMat(`
uniform sampler2D tSrc; varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`, { tSrc: { value: null } });
// all of it on the screen: the scene, darkened by its occlusion (brought up from half size smoothly, read between
// its texels), and the glow added over it
const compMat = psMat(`
${PS_DEPTH}
uniform sampler2D tCol, tAO, tB1, tB2; uniform float uAoK, uAoPow, uB1, uB2, uFogN, uFogF, uDbg;
varying vec2 vUv;
${MIST_GLSL}
void main() {
  vec3 c = texture2D(tCol, vUv).rgb;
  if (uAoK > 0.0) {
    float d = viewD(vUv), ao = texture2D(tAO, vUv).r;
    ao = pow(clamp(ao, 0.0, 1.0), uAoPow);
    float k = uAoK * (1.0 - smoothstep(uFogN, uFogF, d));
    c *= mix(1.0, ao, k);
    if (uDbg > 0.5) c = vec3(mix(1.0, ao, k));
  }
  // a fog round's fog (world/mist.js), under the glow, so lamps and flashes in it still bloom through
  if (uMist.w > 0.0) { vec4 m = mistOf(vUv, viewD(vUv)); c = mix(c, m.rgb, m.a); }
  c += texture2D(tB1, vUv).rgb * uB1 + texture2D(tB2, vUv).rgb * uB2;
  gl_FragColor = vec4(c, 1.0);
}`, { ...MIST_U, tDepth: { value: null }, uNF: { value: new THREE.Vector2() }, tCol: { value: null }, tAO: { value: null }, tB1: { value: null }, tB2: { value: null }, uAoK: { value: AO.k }, uAoPow: { value: AO.pow }, uB1: { value: 0 }, uB2: { value: 0 }, uFogN: { value: 40 }, uFogF: { value: 70 }, uDbg: { value: 0 } });
const psQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat); psQuad.frustumCulled = false;
const psScene = new THREE.Scene(); psScene.add(psQuad);
const psCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const PS_RT = { sc: null, ao: null, ao2: null, hA: null, hB: null, b1: null, b1b: null, b2: null, b2b: null, gl: null };
// last frame's view of the occlusion (its history, PS_RT.hA) and the camera it was seen from
const PS_PREV = { view: new THREE.Matrix4(), size: new THREE.Vector2(), center: new THREE.Vector2(), ok: false };
const psTarget = (w, h, o) => { const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), Object.assign({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false }, o || {})); t.texture.generateMipmaps = false; return t; };
const _psSz = new THREE.Vector2();
// (re)made at the drawing buffer's size whenever it changes
function postTargets() {
  R.getDrawingBufferSize(_psSz); const W = _psSz.x, H = _psSz.y;
  if (W === POST.w && H === POST.h && PS_RT.sc) return;
  Object.keys(PS_RT).forEach(k => { if (PS_RT[k]) { PS_RT[k].dispose(); if (PS_RT[k].depthTexture) PS_RT[k].depthTexture.dispose(); } });
  POST.w = W; POST.h = H;
  const sc = new THREE.WebGLMultisampleRenderTarget(W, H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false });
  sc.samples = Math.min(4, R.capabilities.maxSamples || 4); sc.texture.generateMipmaps = false;
  sc.depthTexture = new THREE.DepthTexture(W, H, THREE.UnsignedIntType); sc.depthTexture.minFilter = sc.depthTexture.magFilter = THREE.NearestFilter;
  PS_RT.sc = sc;
  const h2 = [Math.ceil(W / 2), Math.ceil(H / 2)], h4 = [Math.ceil(W / 4), Math.ceil(H / 4)], h8 = [Math.ceil(W / 8), Math.ceil(H / 8)];
  PS_RT.ao = psTarget(...h2); PS_RT.ao2 = psTarget(...h2); PS_RT.hA = psTarget(...h2); PS_RT.hB = psTarget(...h2); PS_PREV.ok = false;
  PS_RT.b1 = psTarget(...h4); PS_RT.b1b = psTarget(...h4); PS_RT.b2 = psTarget(...h8); PS_RT.b2b = psTarget(...h8);
  PS_RT.gl = psTarget(...h2, { depthBuffer: true }); PS_RT.gl.depthTexture = new THREE.DepthTexture(...h2, THREE.UnsignedIntType); PS_RT.gl.depthTexture.minFilter = PS_RT.gl.depthTexture.magFilter = THREE.NearestFilter;
}
function psPass(mat, target) { psQuad.material = mat; R.setRenderTarget(target); R.render(psScene, psCam); }
function psBlur(src, tmp, w, h) {
  const U = blurMat.uniforms;
  U.tSrc.value = src.texture; U.uDir.value.set(1 / w, 0); psPass(blurMat, tmp);
  U.tSrc.value = tmp.texture; U.uDir.value.set(0, 1 / h); psPass(blurMat, src);
}
// the glowing things alone (GLOW_LAYER), when any are out: the camera seeing only them, nothing else drawn (no
// shadows, no sky). How strongly they're to glow back, or 0 for none this frame
function glowPass() {
  if (!(flash.visible || zombies.some(z => z.vis > 0.05 && !z.dead))) return 0;
  const lm = cam.layers.mask, bg = scene.background, sh = R.shadowMap.autoUpdate, cc = R.getClearAlpha(); R.getClearColor(_glCC);
  cam.layers.set(GLOW_LAYER); scene.background = null; R.shadowMap.autoUpdate = false; R.setClearColor(0x000000, 1);
  R.setRenderTarget(PS_RT.gl); R.clear(true, true, false); R.render(scene, cam);
  cam.layers.mask = lm; scene.background = bg; R.shadowMap.autoUpdate = sh; R.setClearColor(_glCC, cc);
  return GLOW.k;
}
const _glCC = new THREE.Color();
// the frame: the farm drawn, then laid on the screen with its occlusion and glow (game/loop.js)
function renderFrame() {
  if (!POST.ok) { R.render(scene, cam); return; }
  postTargets();
  const W = POST.w, H = POST.h, prev = R.getRenderTarget(), ac = R.autoClear;
  R.setRenderTarget(PS_RT.sc); R.render(scene, cam);
  R.autoClear = true;
  { const now = performance.now(), dt = POST.aoT ? Math.min(0.1, (now - POST.aoT) / 1000) : 0; POST.aoT = now; const want = AO.n[POST.q] && SET.ao === 'on' ? 1 : 0; POST.aoK += clamp(want - POST.aoK, -dt * AO.fade, dt * AO.fade); }
  const nf = [cam.near, cam.far], sc = PS_RT.sc, aoN = POST.aoK > 0.001 ? AO.n[POST.q] || AO.n[1] : 0;
  if (aoN) {
    const U = aoMat.uniforms, z = cam.zoom;
    U.tDepth.value = sc.depthTexture; U.uNF.value.set(...nf);
    U.uSize.value.set((cam.right - cam.left) / z, (cam.top - cam.bottom) / z); U.uCenter.value.set((cam.right + cam.left) / 2, (cam.top + cam.bottom) / 2);
    U.uPx.value.set(1 / W, 1 / H); U.uN.value = aoN; U.uInvView.value.copy(cam.matrixWorld);
    psPass(aoMat, PS_RT.ao);
    const B = aoBlurMat.uniforms, w2 = PS_RT.ao.width, h2 = PS_RT.ao.height; B.uFar.value = cam.far;
    B.tAO.value = PS_RT.ao.texture; B.uDir.value.set(1 / w2, 0); psPass(aoBlurMat, PS_RT.ao2);
    B.tAO.value = PS_RT.ao2.texture; B.uDir.value.set(0, 1 / h2); psPass(aoBlurMat, PS_RT.ao);
    // steadied against last frame's (into the history's other half, which is then the one shown and kept)
    const T = aoTemporalMat.uniforms;
    T.tCur.value = PS_RT.ao.texture; T.tHist.value = PS_RT.hA.texture; T.uInvView.value.copy(cam.matrixWorld); T.uPrevView.value.copy(PS_PREV.view);
    T.uSize.value.copy(U.uSize.value); T.uCenter.value.copy(U.uCenter.value); T.uPrevSize.value.copy(PS_PREV.size); T.uPrevCenter.value.copy(PS_PREV.center);
    T.uPx.value.set(1 / w2, 1 / h2); T.uFar.value = cam.far; T.uKeep.value = AO.keep; T.uValid.value = PS_PREV.ok ? 1 : 0;
    psPass(aoTemporalMat, PS_RT.hB);
    const t = PS_RT.hA; PS_RT.hA = PS_RT.hB; PS_RT.hB = t;
    PS_PREV.view.copy(cam.matrixWorldInverse); PS_PREV.size.copy(U.uSize.value); PS_PREV.center.copy(U.uCenter.value); PS_PREV.ok = true;
  } else PS_PREV.ok = false;
  // the glow: the bright parts at a quarter size, blurred, and again at an eighth for its wider haze (none at all with
  // it off in the settings, ui/settings.js)
  const bk = POST.noBloom ? 0 : BLOOM_K[SET.bloom] ?? 1;
  const gk = bk > 0 ? glowPass() : 0;
  if (bk > 0) { const U = brightMat.uniforms; U.tGlow.value = PS_RT.gl.texture; U.tGlowD.value = PS_RT.gl.depthTexture; U.tSceneD.value = sc.depthTexture; U.uGlow.value = gk; U.uTh.value = lerpD(BLOOM.th); U.uKnee.value = lerpD(BLOOM.knee); U.tCol.value = sc.texture; U.uPx.value.set(1 / W, 1 / H); psPass(brightMat, PS_RT.b1);
    psBlur(PS_RT.b1, PS_RT.b1b, PS_RT.b1.width, PS_RT.b1.height);
    copyMat.uniforms.tSrc.value = PS_RT.b1.texture; psPass(copyMat, PS_RT.b2);
    psBlur(PS_RT.b2, PS_RT.b2b, PS_RT.b2.width, PS_RT.b2.height); }
  { const now = performance.now(); mistTick(POST.mT ? Math.min(0.1, (now - POST.mT) / 1000) : 0); POST.mT = now; mistUniforms(); }   // (world/mist.js)
  const U = compMat.uniforms;
  U.tDepth.value = sc.depthTexture; U.uNF.value.set(...nf); U.tCol.value = sc.texture; U.tAO.value = PS_RT.hA.texture;
  U.uAoK.value = aoN ? AO.k * POST.aoK : 0;
  U.tB1.value = PS_RT.b1.texture; U.tB2.value = PS_RT.b2.texture; U.uB1.value = lerpD(BLOOM.k) * bk; U.uB2.value = lerpD(BLOOM.k2) * bk; U.uDbg.value = POST.dbg ? 1 : 0;
  // (the occlusion thins out into the fog as the scene does: from where the fog starts, measured from the camera)
  if (scene.fog) { U.uFogN.value = scene.fog.near; U.uFogF.value = scene.fog.far; }
  psPass(compMat, prev);
  R.autoClear = ac;
}
