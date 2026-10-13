// The farm's blood map: one texture over the whole farm that blood (and scorch) is painted into, read by every surface
// that stays put (core/shaders.js), so blood soaks into the dirt, the porch boards and the rug, and runs down walls,
// fence posts and tree trunks as far up as the splash reached.
//
// It's painted on the GPU: each splash is a quad drawn into the map with a little shader that shapes it (a pool, a
// spray thrown one way, a drop with its spatter) and MAX blending, so splashes build on each other without ever
// lightening what's there. Red is blood, green how high the splash went, blue soot, and alpha how fresh it is. Pools
// spread over a few seconds by drawing their quad again a little bigger each frame.
//
// Blood stays put for a few waves and then soaks away: each wave that starts takes BM_AGE off every stain's freshness,
// so blood spilled in one wave is still there two waves later and starts to fade at the start of the third, slowly
// (over about BM_FADE seconds), from its thin edges in. A splash on top of old blood makes it fresh again. Fading reads
// the map, so it's drawn into a second copy (ping-pong) and the two swap.

const BM_RES = 1024, BM_AGE = 0.4, BM_FADE = 80;
const bmOpts = { depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
const bmTargets = [new THREE.WebGLRenderTarget(BM_RES, BM_RES, bmOpts), new THREE.WebGLRenderTarget(BM_RES, BM_RES, bmOpts)];
let bmTarget = bmTargets[0];
BMU.uBloodMap.value = bmTarget.texture;
// smooth tiling value noise for the stains' edges (here and in the shaders)
BMU.uBloodNoise.value = (() => {
  const S = 128, d = new Uint8Array(S * S * 4), g = new Float32Array(16 * 16).map(() => rand());
  const at = (x, y) => g[(y & 15) * 16 + (x & 15)];
  const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return (at(xi, yi) * (1 - su) + at(xi + 1, yi) * su) * (1 - sv) + (at(xi, yi + 1) * (1 - su) + at(xi + 1, yi + 1) * su) * sv; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S * 16, v = y / S * 16, k = (y * S + x) * 4;
    const val = n(u, v) * 0.55 + n(u * 2 + 3.1, v * 2 + 1.7) * 0.3 + n(u * 4 + 7.3, v * 4 + 5.9) * 0.15;
    d[k] = d[k + 1] = d[k + 2] = val * 255; d[k + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
})();
const bmScene = new THREE.Scene(), bmCam = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, -10, 10);
const BM_KIND = { pool: 0, spray: 1, drop: 2, scorch: 0 };
const BM_VERT = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const BM_FRAG = `
uniform float uKind, uStr, uH, uR, uSoot; uniform vec2 uSeed; uniform sampler2D uNoise; varying vec2 vUv;
float bn(vec2 p) { return texture2D(uNoise, p).r; }
void main() {
  vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  float nz = bn(vUv * 0.7 + uSeed) * 0.6 + bn(vUv * 1.9 + uSeed * 1.7) * 0.4, a;
  if (uKind < 0.5) a = smoothstep(1.0, 0.5, r + (nz - 0.5) * 0.75);   // a pool: a soft blob with a ragged rim
  else if (uKind < 1.5) {
    // a spray thrown along +x: a splash where it starts, fanning out into streaks and flecks that thin out with distance
    float t = (p.x + 1.0) * 0.5, w = mix(0.22, 0.95, t), lane = abs(p.y) / w;
    float streak = bn(vec2(t * 0.45, p.y * 2.6 / w) + uSeed);
    a = smoothstep(1.0, 0.55, lane + (nz - 0.5) * 0.5) * smoothstep(0.42, 0.66, streak + (1.0 - t) * 0.42) * smoothstep(1.0, 0.7, t);
    a = max(a, smoothstep(0.5, 0.18, length(p - vec2(-0.68, 0.0)) + (nz - 0.5) * 0.3));
  } else {
    // a drop: a small blob and the fine spatter round it
    a = smoothstep(0.52, 0.3, r + (nz - 0.5) * 0.4);
    a = max(a, smoothstep(0.66, 0.74, bn(vUv * 2.6 + uSeed * 3.1)) * smoothstep(1.0, 0.55, r));
  }
  a *= uStr;
  gl_FragColor = vec4(a * uR, a * uH * uR, a * uSoot, a);   // alpha: fresh
}`;
const BM_QUAD = new THREE.PlaneGeometry(2, 2);
const bmMat = () => new THREE.ShaderMaterial({ vertexShader: BM_VERT, fragmentShader: BM_FRAG, depthTest: false, depthWrite: false, transparent: true,
  blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  uniforms: { uKind: { value: 0 }, uStr: { value: 1 }, uH: { value: 0 }, uR: { value: 1 }, uSoot: { value: 0 }, uSeed: { value: new THREE.Vector2() }, uNoise: BMU.uBloodNoise } });
// a pool of quads to paint with: each is drawn once (or again each frame while it spreads) and then put back
const bmQuads = [];
for (let k = 0; k < 96; k++) { const m = new THREE.Mesh(BM_QUAD, bmMat()); m.visible = false; m.frustumCulled = false; bmScene.add(m); bmQuads.push({ m, t: 0, dur: 0, s: 1, busy: false }); }
let bmQ = 0, bmDirty = true, bmCleared = false, bmDry = 0;
// paint a splash: kind 'pool' | 'spray' | 'drop' | 'scorch', size (metres across), ang the way a spray was thrown,
// grow how long a pool takes to spread, h how high up walls it goes (metres; sprays default to about a metre)
function splat(x, z, kind, size, ang, grow, h) {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return;
  let q = null; for (let n = 0; n < bmQuads.length && !q; n++) { const c = bmQuads[bmQ = (bmQ + 1) % bmQuads.length]; if (!c.busy) q = c; }
  if (!q) q = bmQuads[bmQ];
  const m = q.m, u = m.material.uniforms, scorch = kind === 'scorch';
  u.uKind.value = BM_KIND[kind] || 0; u.uStr.value = kind === 'drop' ? 0.85 : 1; u.uR.value = scorch ? 0 : 1; u.uSoot.value = scorch ? 1 : 0;
  u.uH.value = clamp((h !== undefined ? h : kind === 'spray' ? 0.9 : 0) / 2, 0, 1); u.uSeed.value.set(rand(), rand());
  const r = size * (kind === 'spray' ? 0.62 : 0.5);
  m.position.set(x, z, 0); m.rotation.set(0, 0, ang === undefined ? rand() * 6.28 : ang);
  q.s = r; q.t = 0; q.dur = grow && grow > 0.2 ? grow : 0; q.busy = true; m.scale.setScalar(q.dur ? r * 0.25 : r); m.visible = true; bmDirty = true;
}
// a spray thrown from (x, z) along (dx, dz)
function spray(x, z, dx, dz, size, h) { splat(x + dx * size * 0.35, z + dz * size * 0.35, 'spray', size, Math.atan2(dz, dx), 0, h); }
// wipe the farm clean for a new run
function bloodMapClear() { bmQuads.forEach(q => { q.busy = false; q.m.visible = false; }); bmCleared = false; bmDirty = true; bmAgeDue = 0; }
// a wave starting ages every stain (waves/waves.js)
let bmAgeDue = 0;
function bloodAge() { bmAgeDue += BM_AGE; bmDry = 99; }
// the aging pass: the map copied into the other target, freshness taken down by uAge, and blood with none left faded
// by uFade; then the two swap
const bmAgeScene = new THREE.Scene(), bmAgeM = new THREE.Mesh(BM_QUAD, new THREE.ShaderMaterial({ vertexShader: BM_VERT, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  uniforms: { uSrc: { value: null }, uAge: { value: 0 }, uFade: { value: 0 } },
  fragmentShader: `uniform sampler2D uSrc; uniform float uAge, uFade; varying vec2 vUv;
void main() { vec4 c = texture2D(uSrc, vUv); float fresh = max(0.0, c.a - uAge); gl_FragColor = vec4(max(c.rgb - (fresh > 0.0 ? 0.0 : uFade), 0.0), fresh); }` }));
bmAgeM.scale.setScalar(HALF); bmAgeM.frustumCulled = false; bmAgeScene.add(bmAgeM);
const _bmCol = new THREE.Color();
// each frame: spread the pools still spreading and draw whatever's new into the map
function stepBloodMap(dt) {
  bmDry += dt;
  for (const q of bmQuads) {
    if (!q.busy || !q.dur) continue;
    q.t += dt; const e = 1 - Math.pow(1 - Math.min(1, q.t / q.dur), 3); q.m.scale.setScalar(q.s * (0.25 + 0.75 * e)); bmDirty = true;
  }
  if (!bmDirty && bmDry <= 3) return;
  const at = R.getRenderTarget(), ac = R.autoClear; R.getClearColor(_bmCol); const aa = R.getClearAlpha();
  R.autoClear = false;
  if (!bmCleared) { R.setClearColor(0x000000, 0); bmTargets.forEach(t => { R.setRenderTarget(t); R.clear(true, false, false); }); bmCleared = true; }
  // every few seconds (and straight away when a wave starts): age the stains into the other copy and swap
  if (bmDry > 3) {
    const dst = bmTarget === bmTargets[0] ? bmTargets[1] : bmTargets[0], u = bmAgeM.material.uniforms;
    u.uSrc.value = bmTarget.texture; u.uAge.value = bmAgeDue; u.uFade.value = Math.min(bmDry, 6) / BM_FADE; bmAgeDue = 0; bmDry = 0;
    R.setRenderTarget(dst); R.render(bmAgeScene, bmCam); bmTarget = dst; BMU.uBloodMap.value = dst.texture;
  }
  R.setRenderTarget(bmTarget); R.render(bmScene, bmCam);
  R.setRenderTarget(at); R.autoClear = ac; R.setClearColor(_bmCol, aa);
  bmDirty = false;
  for (const q of bmQuads) if (q.busy && (!q.dur || q.t >= q.dur)) { q.busy = false; q.m.visible = false; }
}
