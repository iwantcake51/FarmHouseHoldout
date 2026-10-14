// The farm's blood map: one texture over the whole farm that blood (and scorch) is painted into, read by every surface
// that stays put (core/shaders.js), so blood soaks into the dirt, the porch boards and the rug, and runs down walls,
// fence posts and tree trunks as far up as the splash reached.
//
// It's painted on the GPU: each splash is a quad drawn into the map with a little shader that shapes it (a pool, a
// spray thrown one way, a drop with its spatter) and MAX blending, so splashes build on each other without ever
// lightening what's there. Red is blood, green how high the splash went, blue soot, and alpha how fresh it is. Pools
// spread over a few seconds by drawing their quad again a little bigger each frame.
//
// Blood thrown through the air lands when it gets there (splatLater): a hit's spray comes down a moment after the hit,
// a little way out, never as a pool under the zombie the instant it's struck.
//
// Blood soaks away on its own clock: fresh for BM_STAY seconds, then fading from its thin edges in over BM_FADE, so a
// splash is gone 70 to 90 seconds after it landed (the thickest last). A splash on top of old blood makes it fresh
// again. Fading reads the map, so it's drawn into a second copy (ping-pong) and the two swap.

const BM_RES = 1024, BM_STAY = 25, BM_FADE = 58;
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
const BM_KIND = { pool: 0, spray: 1, drop: 2, scorch: 0, foot: 3 };
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
  } else if (uKind < 2.5) {
    // a drop: a small blob and the fine spatter round it
    a = smoothstep(0.52, 0.3, r + (nz - 0.5) * 0.4);
    a = max(a, smoothstep(0.66, 0.74, bn(vUv * 2.6 + uSeed * 3.1)) * smoothstep(1.0, 0.55, r));
  } else {
    // a boot print the size of the boot sole (0.28 m long, 0.2 m wide over the 0.3 m quad), toe along +x: a squared-off
    // sole and heel with a gap between, its tread breaking it up so it reads pressed in rather than painted on
    vec2 qs = abs(p - vec2(0.28, 0.0)) / vec2(0.62, 0.66), qh = abs(p - vec2(-0.64, 0.0)) / vec2(0.27, 0.6);
    float sole = pow(pow(qs.x, 4.0) + pow(qs.y, 4.0), 0.25), heel = pow(pow(qh.x, 4.0) + pow(qh.y, 4.0), 0.25);
    a = max(smoothstep(1.0, 0.78, sole + (nz - 0.5) * 0.35), smoothstep(1.0, 0.78, heel + (nz - 0.5) * 0.35));
    a *= 0.55 + 0.45 * smoothstep(0.32, 0.62, bn(vUv * 5.0 + uSeed));
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
for (let k = 0; k < 160; k++) { const m = new THREE.Mesh(BM_QUAD, bmMat()); m.visible = false; m.frustumCulled = false; bmScene.add(m); bmQuads.push({ m, t: 0, dur: 0, s: 1, busy: false }); }
let bmQ = 0, bmDirty = true, bmCleared = false, bmDry = 0;
// what's known of the blood on the ground away from the GPU, for footprints: how wet each half-metre of the farm is.
// Splashes wet it (a drop only a little), it dries over BW_DRY seconds or so, and a new run dries it out
const BW_DRY = 20;
const BW_CELL = 0.5, BW_N = Math.ceil(HALF * 2 / BW_CELL), bloodWet = new Float32Array(BW_N * BW_N);
const bwCell = v => clamp(Math.floor((v + HALF) / BW_CELL), 0, BW_N - 1);
function wetSplat(x, z, r, k) {
  for (let cz = bwCell(z - r); cz <= bwCell(z + r); cz++) for (let cx = bwCell(x - r); cx <= bwCell(x + r); cx++) {
    const px = (cx + 0.5) * BW_CELL - HALF, pz = (cz + 0.5) * BW_CELL - HALF;
    if (Math.hypot(px - x, pz - z) <= r + BW_CELL * 0.35) { const i = cz * BW_N + cx; bloodWet[i] = Math.max(bloodWet[i], k); }
  }
}
const bloodWetAt = (x, z) => bloodWet[bwCell(z) * BW_N + bwCell(x)];
// a footfall (player/movement.js): stepping in wet blood soaks your boots for about eight prints (P.bloodFeet), and each
// step while they're bloody leaves a print under that foot, toe the way you're walking, fainter each time
function bloodyStep() {
  P.footSide = -(P.footSide || 1);
  const wet = bloodWetAt(P.x, P.z);
  if (wet > 0.35) P.bloodFeet = Math.max(P.bloodFeet || 0, Math.min(1, wet));
  if (!(P.bloodFeet > 0.04)) return;
  const v = Math.hypot(P.vx, P.vz) || 1, dx = P.vx / v, dz = P.vz / v, off = 0.13 * P.footSide;   // under that leg
  splat(P.x - dz * off + dx * 0.08, P.z + dx * off + dz * 0.08, 'foot', 0.3, Math.atan2(dz, dx), 0, 0, 0.3 + 0.55 * P.bloodFeet);
  P.bloodFeet -= 0.12;
}
// paint a splash: kind 'pool' | 'spray' | 'drop' | 'scorch', size (metres across), ang the way a spray was thrown,
// grow how long a pool takes to spread, h how high up walls it goes (metres; sprays default to about a metre)
function splat(x, z, kind, size, ang, grow, h, str) {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return;
  if (kind !== 'scorch' && kind !== 'foot') wetSplat(x, z, size * (kind === 'spray' ? 0.5 : 0.42), kind === 'drop' ? 0.3 : 1);
  let q = null; for (let n = 0; n < bmQuads.length && !q; n++) { const c = bmQuads[bmQ = (bmQ + 1) % bmQuads.length]; if (!c.busy) q = c; }
  if (!q) q = bmQuads[bmQ];
  const m = q.m, u = m.material.uniforms, scorch = kind === 'scorch';
  u.uKind.value = BM_KIND[kind] || 0; u.uStr.value = str !== undefined ? str : kind === 'drop' ? 0.85 : 1; u.uR.value = scorch ? 0 : 1; u.uSoot.value = scorch ? 1 : 0;
  u.uH.value = clamp((h !== undefined ? h : kind === 'spray' ? 0.9 : 0) / 2, 0, 1); u.uSeed.value.set(rand(), rand());
  const r = size * (kind === 'spray' ? 0.62 : 0.5);
  m.position.set(x, z, 0); m.rotation.set(0, 0, ang === undefined ? rand() * 6.28 : ang);
  q.s = r; q.t = 0; q.dur = grow && grow > 0.2 ? grow : 0; q.busy = true; m.scale.setScalar(q.dur ? r * 0.25 : r); m.visible = true; bmDirty = true;
}
// a splash that's still in the air: painted when it lands, t seconds from now (stepBloodMap)
const bmLater = [];
function splatLater(t, ...a) { bmLater.push({ t, a }); }
// a spray thrown from (x, z) along (dx, dz): it's in the air a moment, the first of it landing close in and the main
// spray further out just after
function spray(x, z, dx, dz, size, h) {
  const t = rr(0.18, 0.32), a = Math.atan2(dz, dx);
  splatLater(t * 0.55, x + dx * size * 0.12, z + dz * size * 0.12, 'drop', size * 0.32, undefined, 0, h);
  splatLater(t, x + dx * size * 0.42, z + dz * size * 0.42, 'spray', size, a, 0, h);
}
// wipe the farm clean for a new run
function bloodMapClear() { bmQuads.forEach(q => { q.busy = false; q.m.visible = false; }); bmLater.length = 0; bmCleared = false; bmDirty = true; bloodWet.fill(0); }
// a wave starting (waves/waves.js): nothing to do now blood keeps its own time
function bloodAge() {}
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
  for (let k = bmLater.length - 1; k >= 0; k--) { const L = bmLater[k]; if ((L.t -= dt) <= 0) { bmLater.splice(k, 1); splat(...L.a); } }   // blood landing
  for (const q of bmQuads) {
    if (!q.busy || !q.dur) continue;
    q.t += dt; const e = 1 - Math.pow(1 - Math.min(1, q.t / q.dur), 3); q.m.scale.setScalar(q.s * (0.25 + 0.75 * e)); bmDirty = true;
  }
  if (!bmDirty && bmDry <= 3) return;
  const at = R.getRenderTarget(), ac = R.autoClear; R.getClearColor(_bmCol); const aa = R.getClearAlpha();
  R.autoClear = false;
  if (!bmCleared) { R.setClearColor(0x000000, 0); bmTargets.forEach(t => { R.setRenderTarget(t); R.clear(true, false, false); }); bmCleared = true; }
  // every few seconds: age the stains into the other copy and swap (freshness down by the time gone over BM_STAY, and
  // stains with none left faded by it over BM_FADE), and dry the ground underfoot to match
  if (bmDry > 3) {
    const dst = bmTarget === bmTargets[0] ? bmTargets[1] : bmTargets[0], u = bmAgeM.material.uniforms, el = Math.min(bmDry, 6);
    u.uSrc.value = bmTarget.texture; u.uAge.value = el / BM_STAY; u.uFade.value = el / BM_FADE; bmDry = 0;
    const dry = Math.exp(-el / BW_DRY); for (let i = 0; i < bloodWet.length; i++) bloodWet[i] *= dry;
    R.setRenderTarget(dst); R.render(bmAgeScene, bmCam); bmTarget = dst; BMU.uBloodMap.value = dst.texture;
  }
  R.setRenderTarget(bmTarget); R.render(bmScene, bmCam);
  R.setRenderTarget(at); R.autoClear = ac; R.setClearColor(_bmCol, aa);
  bmDirty = false;
  for (const q of bmQuads) if (q.busy && (!q.dur || q.t >= q.dur)) { q.busy = false; q.m.visible = false; }
}
