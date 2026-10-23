// House footprint, the ground (textured and blended in its shader) and grass tufts; past the farm's edge, the ground and
// grass going on into the haze, the drive carried on out, and the main road it meets.

import { R, scene } from '../core/renderer.js';
import { HALF, N, pick, rand, rr } from '../core/math.js';
import { lam, windy } from '../core/shaders.js';
import { flat } from '../core/geometry.js';
import { cxw } from './grid.js';
import { M } from './materials.js';
import { GROUND_ART } from './ground-art.js';

export const HX0 = 16, HX1 = 27, HZ0 = 17, HZ1 = 26;
// the dirt drive out the front of the house: painted into the ground's mask (groundMask), from the porch on past the
// farm's edge to the main road, which runs across in front of the farm out in the fog. Trees, grass
// and rocks keep off both (onRoad, also world/trees.js); m widens the margin
export const ROAD = { x: z => cxw(21) + Math.sin(z * 0.45) * 0.35, z0: cxw(HZ1) + 0.6, z: HALF + 7.5, w: 5.4 };
export const onRoad = (x, z, m) => Math.abs(z - ROAD.z) < ROAD.w / 2 + 0.8 + m || (z > ROAD.z0 && z < ROAD.z && Math.abs(x - ROAD.x(z)) < 1.3 + m);
// the ground is drawn from the SBS packs' textures (world/ground-art.js, tools/pack-ground.py), tiled in the world and
// faded in and out of each other by Perlin noise in the shader (GROUND_FS), so it's sharp however close you zoom and
// never repeats. Where it's bare earth rather than grass is painted into a mask that runs out past the farm's edge to
// the road (GROUND_SPAN metres across, centred on the farm): red the trodden earth (the yard round the house, the paths
// to the fence gaps and the drive), green the drive's wheel ruts, blue how much of that earth is the drive's brown dirt.
// It's painted again each run, for the paths out to where the fence gaps are this time (paths: each from x, z to x, z;
// world/yard.js), into the same texture (GROUND_MASK)
const GROUND_SPAN = 104, GROUND_MASK = { c: null, t: null };
export function groundMask(paths) {
  const S2 = 2048, c = GROUND_MASK.c || (GROUND_MASK.c = document.createElement('canvas')); c.width = c.height = S2; const x = c.getContext('2d');
  const px = v => (v + GROUND_SPAN / 2) / GROUND_SPAN * S2, pm = m => m / GROUND_SPAN * S2;
  x.fillStyle = '#000'; x.fillRect(0, 0, S2, S2);
  x.globalCompositeOperation = 'lighter';   // (each channel adds up on its own)
  const blot = (cx, cy, r, rgb, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); };
  for (let k = 0; k < 220; k++) blot(px(rr(cxw(HX0) - 2.5, cxw(HX1) + 2.5)), px(rr(cxw(HZ0) - 2.5, cxw(HZ1) + 2.5)), pm(rr(0.4, 1.7)), '255,0,0', rr(0.15, 0.4));
  // the drive, from the porch out past the farm's edge to the road
  for (let z = ROAD.z0; z < ROAD.z - ROAD.w / 2 + 0.6; z += 0.2) blot(px(ROAD.x(z) + rr(-0.5, 0.5)), px(z), pm(rr(0.7, 1.3)), '255,0,255', 0.45);
  x.strokeStyle = 'rgba(0,255,0,.6)'; x.lineWidth = pm(0.26);
  [-0.6, 0.6].forEach(o => { x.beginPath(); for (let z = cxw(HZ1) + 2; z <= ROAD.z - ROAD.w / 2 + 0.3; z += 0.25) x.lineTo(px(ROAD.x(z) + o), px(z)); x.stroke(); });
  // trampled paths to the fence gaps
  (paths || []).forEach(([a, b, c2, d]) => { for (let t = 0; t <= 1; t += 0.03) blot(px(a + (c2 - a) * t + rr(-.3, .3)), px(b + (d - b) * t + rr(-.3, .3)), pm(rr(0.35, 0.7)), '255,0,0', 0.3); });
  if (GROUND_MASK.t) { GROUND_MASK.t.needsUpdate = true; return GROUND_MASK.t; }
  const t = GROUND_MASK.t = new THREE.CanvasTexture(c); t.flipY = false; t.anisotropy = R.capabilities.getMaxAnisotropy(); return t;   // (row by row along z, as drawn)
}
// the ground's textures, each tiled over the ground at its own size (metres a tile), and how soft they're drawn
// (GROUND_BLUR: 1 as sharp as the screen allows, 2 a mip level softer)
const GROUND_TEX = {}, GROUND_TILE = { grass: 2.6, patchy: 2.3, thin: 2.8, dry: 2.5, earth: 2.4, drive: 2.6 }, GROUND_BLUR = 2.2;
for (const k of [...Object.keys(GROUND_TILE), 'rock', 'rock2']) {
  const t = GROUND_TEX[k] = new THREE.TextureLoader().load(GROUND_ART[k]);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = R.capabilities.getMaxAnisotropy();
}
// Perlin (gradient) noise, and a texture tiled with no repeat to see: the tiling noise picks an offset and a turn for
// each patch of ground (gPick), and where two patches meet their copies of the texture fade into each other (the
// darker one wins first, so the seams follow its shapes), drawn with the gradients the plain tiling would have, turned
// with it, so its mip level never jumps
const GROUND_NOISE = `
#if defined(texture2DGradEXT) || defined(GL_EXT_shader_texture_lod)
#define G_TEX(s, x, dx, dy) texture2DGradEXT(s, x, dx, dy)
#else
#define G_TEX(s, x, dx, dy) texture2D(s, x)
#endif
vec2 gHash(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453) * 2.0 - 1.0; }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(dot(gHash(i), f), dot(gHash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(gHash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(gHash(i + 1.0), f - 1.0), u.x), u.y);
}
float gFbm(vec2 p) { return gNoise(p) * 0.6 + gNoise(p * 2.03 + 7.1) * 0.28 + gNoise(p * 4.07 + 3.7) * 0.12; }
vec3 gPick(sampler2D s, vec2 x, vec2 dx, vec2 dy, float i) {
  float r = fract(sin(i * 12.9898 + 4.1) * 43758.5453) * 6.2832; mat2 m = mat2(cos(r), sin(r), -sin(r), cos(r));
  return G_TEX(s, m * x + sin(vec2(3.0, 7.0) * i), m * dx, m * dy).rgb;
}
vec3 gTile(sampler2D s, vec2 x, vec2 dx, vec2 dy, float tl) {
  float l = tl * 14.0, f = fract(l), ia = floor(l);
  vec3 a = gPick(s, x, dx, dy, ia), b = gPick(s, x, dx, dy, ia + 1.0);
  return mix(a, b, smoothstep(0.15, 0.85, f - 0.1 * dot(a - b, vec3(1.0))));
}
`;
const GROUND_DECL = `
uniform sampler2D uGMask;
uniform sampler2D uGT[6];
uniform float uGSpan;
uniform float uGHalf;
` + GROUND_NOISE;
// the ground's colour at p: the four grasses faded in and out of each other on their own slow noise fields, bare earth
// where the mask says (its edge broken up by finer noise) with the drive's brown dirt and ruts on it, the light and
// dark of it drifting a little, and past the farm's edge darkening into the floor of the woods
const GROUND_FS = `
  {
    vec2 gp = vWp.xz, gdx = dFdx(gp) * ${GROUND_BLUR.toFixed(2)}, gdy = dFdy(gp) * ${GROUND_BLUR.toFixed(2)};
    vec4 gm = texture2D(uGMask, gp / uGSpan + 0.5);
    float n1 = gFbm(gp * 0.1), n2 = gFbm(gp * 0.14 + 19.3), n3 = gFbm(gp * 0.085 + 47.1), n4 = gFbm(gp * 0.45 + 3.3);
    float tl = gFbm(gp * 0.32 + 71.0) * 0.6 + 0.5;
    vec3 gc = gTile(uGT[0], gp / ${GROUND_TILE.grass.toFixed(2)}, gdx / ${GROUND_TILE.grass.toFixed(2)}, gdy / ${GROUND_TILE.grass.toFixed(2)}, tl);
    float w = smoothstep(-0.12, 0.2, n1);
    if (w > 0.002) gc = mix(gc, gTile(uGT[1], gp / ${GROUND_TILE.patchy.toFixed(2)} + 0.37, gdx / ${GROUND_TILE.patchy.toFixed(2)}, gdy / ${GROUND_TILE.patchy.toFixed(2)}, tl), w);
    w = smoothstep(0.06, 0.32, n2);
    if (w > 0.002) gc = mix(gc, gTile(uGT[2], gp / ${GROUND_TILE.thin.toFixed(2)} + 0.71, gdx / ${GROUND_TILE.thin.toFixed(2)}, gdy / ${GROUND_TILE.thin.toFixed(2)}, tl), w);
    w = smoothstep(0.16, 0.4, n3);
    if (w > 0.002) gc = mix(gc, gTile(uGT[3], gp / ${GROUND_TILE.dry.toFixed(2)} + 0.13, gdx / ${GROUND_TILE.dry.toFixed(2)}, gdy / ${GROUND_TILE.dry.toFixed(2)}, tl), w);
    w = smoothstep(0.22, 0.52, gm.r + n4 * 0.4);
    if (w > 0.002) {
      vec3 ge = gTile(uGT[4], gp / ${GROUND_TILE.earth.toFixed(2)} + 0.53, gdx / ${GROUND_TILE.earth.toFixed(2)}, gdy / ${GROUND_TILE.earth.toFixed(2)}, tl);
      float wd = smoothstep(0.15, 0.5, gm.b + n4 * 0.3);
      if (wd > 0.002) ge = mix(ge, gTile(uGT[5], gp / ${GROUND_TILE.drive.toFixed(2)} + 0.29, gdx / ${GROUND_TILE.drive.toFixed(2)}, gdy / ${GROUND_TILE.drive.toFixed(2)}, tl), wd);
      gc = mix(gc, ge, w);
    }
    gc *= 1.0 - gm.g * 0.42 * (0.8 + n4 * 0.5);
    gc *= 0.93 + n2 * 0.14;
    float gw = smoothstep(0.0, 16.0, max(abs(gp.x), abs(gp.y)) - uGHalf + n1 * 5.0);
    gc *= mix(vec3(1.0), vec3(0.5, 0.5, 0.46), gw);
    diffuseColor.rgb *= gc;
  }`;
// a lit material drawing that ground (one program shared by the farm's ground and the ground out past it)
function groundMat() {
  const m = lam(0xffffff), base = m.onBeforeCompile, mask = groundMask();
  m.extensions = { derivatives: true, shaderTextureLOD: true };
  m.onBeforeCompile = function (sh, r) {
    base.call(this || m, sh, r);
    Object.assign(sh.uniforms, { uGMask: { value: mask }, uGT: { value: ['grass', 'patchy', 'thin', 'dry', 'earth', 'drive'].map(k => GROUND_TEX[k]) }, uGSpan: { value: GROUND_SPAN }, uGHalf: { value: HALF } });
    sh.fragmentShader = GROUND_DECL + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + GROUND_FS);
  };
  m.customProgramCacheKey = () => 'lit-ground';
  return m;
}
const GROUND_M = groundMat();
// the rocks and stones round the map (world/trees.js) take the same treatment: two stone textures from the packs, laid
// over each rock from the three sides it's seen from (triplanar, so nothing stretches down its flanks), faded into
// each other by Perlin noise and tiled at random like the ground, as soft as it (GROUND_BLUR). They're a mid grey, so
// they only add their grain to the rock's own colour and moss (in its vertices)
const ROCK_TILE = 0.6;
const ROCK_FS = `
  {
    vec3 rn = pow(abs(normalize(vWn)), vec3(4.0)); rn /= rn.x + rn.y + rn.z;
    vec3 rp = vWp / ${ROCK_TILE.toFixed(2)};
    float tl = gFbm(vWp.xz * 0.8 + vWp.y * 0.6 + 31.0) * 0.6 + 0.5, rw = smoothstep(-0.18, 0.18, gFbm(vWp.xz * 0.55 + vWp.y * 0.5 + 11.0));
    vec2 pa = rp.yz, pb = rp.xz, pc = rp.xy;
    vec2 ax = dFdx(pa) * ${GROUND_BLUR.toFixed(2)}, ay = dFdy(pa) * ${GROUND_BLUR.toFixed(2)}, bx = dFdx(pb) * ${GROUND_BLUR.toFixed(2)}, by = dFdy(pb) * ${GROUND_BLUR.toFixed(2)}, cx = dFdx(pc) * ${GROUND_BLUR.toFixed(2)}, cy = dFdy(pc) * ${GROUND_BLUR.toFixed(2)};
    vec3 r0 = gTile(uGR[0], pa, ax, ay, tl) * rn.x + gTile(uGR[0], pb, bx, by, tl) * rn.y + gTile(uGR[0], pc, cx, cy, tl) * rn.z;
    vec3 r1 = gTile(uGR[1], pa * 1.15 + 0.3, ax * 1.15, ay * 1.15, tl) * rn.x + gTile(uGR[1], pb * 1.15 + 0.3, bx * 1.15, by * 1.15, tl) * rn.y + gTile(uGR[1], pc * 1.15 + 0.3, cx * 1.15, cy * 1.15, tl) * rn.z;
    diffuseColor.rgb *= mix(r0, r1, rw) * 2.0;
  }`;
function rockMat(m) {
  const base = m.onBeforeCompile, baseKey = m.customProgramCacheKey;
  m.extensions = { derivatives: true, shaderTextureLOD: true };
  m.onBeforeCompile = function (sh, r) {
    base.call(this || m, sh, r);
    sh.uniforms.uGR = { value: [GROUND_TEX.rock, GROUND_TEX.rock2] };
    sh.fragmentShader = 'uniform sampler2D uGR[2];\n' + GROUND_NOISE + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + ROCK_FS);
  };
  m.customProgramCacheKey = function () { return baseKey.call(this || m) + '-rock'; };
  return m;
}
rockMat(M.rock);
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(N, N), GROUND_M); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), M.groundFar); far.rotation.x = -Math.PI / 2; far.position.y = -0.02; scene.add(far);
  const tufts = new THREE.InstancedMesh(flat(new THREE.ConeGeometry(0.09, 0.34, 4)), windy(lam(0x6b6c47), 0.32, 1), 1300), dm = new THREE.Object3D();   // (parting round you as you walk through: PUSHERS)
  const tufts2 = new THREE.InstancedMesh(flat(new THREE.ConeGeometry(0.07, 0.42, 3)), windy(lam(0x7d7a4c), 0.32, 1), 500);
  let k2 = 0;
  for (let k = 0; k < 1300; k++) {
    let x, z; do { x = rr(-HALF, HALF); z = rr(-HALF, HALF); } while ((x > cxw(HX0) - 0.8 && x < cxw(HX1) + 0.8 && z > cxw(HZ0) - 0.8 && z < cxw(HZ1) + 1.9) || onRoad(x, z, -0.3));
    dm.position.set(x, 0.15, z); dm.rotation.set(rr(-.3, .3), rand() * 6, rr(-.3, .3)); dm.scale.setScalar(rr(.6, 1.5)); dm.updateMatrix(); tufts.setMatrixAt(k, dm.matrix);
    if (k2 < 500 && rand() < 0.4) { dm.position.x += 0.12; dm.scale.setScalar(rr(.7, 1.3)); dm.updateMatrix(); tufts2.setMatrixAt(k2++, dm.matrix); }
  }
  tufts2.count = k2;
  tufts.receiveShadow = tufts2.receiveShadow = true; scene.add(tufts, tufts2);
  // the grass goes on past the edge of the farm, thinning out over 16 m as it fades into the haze (core/shaders.js)
  const OG = 16, n1 = 1300, oA = new THREE.InstancedMesh(tufts.geometry, tufts.material, n1), oB = new THREE.InstancedMesh(tufts2.geometry, tufts2.material, 520);
  let a = 0, b = 0;
  for (let k = 0; k < 4200 && a < n1; k++) {
    const x = rr(-HALF - OG, HALF + OG), z = rr(-HALF - OG, HALF + OG), d = Math.max(Math.abs(x), Math.abs(z)) - HALF;
    if (d < 0 || rand() > Math.pow(1 - d / OG, 1.3) || onRoad(x, z, 0.2)) continue;
    dm.position.set(x, 0.15, z); dm.rotation.set(rr(-.3, .3), rand() * 6, rr(-.3, .3)); dm.scale.setScalar(rr(.6, 1.5)); dm.updateMatrix(); oA.setMatrixAt(a++, dm.matrix);
    if (b < 520 && rand() < 0.4) { dm.position.x += 0.12; dm.scale.setScalar(rr(.7, 1.3)); dm.updateMatrix(); oB.setMatrixAt(b++, dm.matrix); }
  }
  oA.count = a; oB.count = b;
  oA.receiveShadow = oB.receiveShadow = true; scene.add(oA, oB);
}
// ---- past the edge of the farm ----
{
  const OUT = 104, aniso = R.capabilities.getMaxAnisotropy();
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  // the ground out there: the same ground as the farm's, the same textures, darkening into the woods' floor further out
  // (GROUND_FS), so the edge of the map never shows as a line. It lies just under the farm's own ground (hidden where
  // they overlap)
  {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(OUT, OUT), GROUND_M); m.rotation.x = -Math.PI / 2; m.position.y = -0.012; m.receiveShadow = true; scene.add(m);
  }
  // the main road: old two-lane blacktop, cracked and patched, with a faded yellow dash down the middle, worn white edge
  // lines and gravel shoulders feathering off into the grass. One 16 m stretch is drawn and repeats along the road
  {
    const RL = 170, W = ROAD.w + 1.6, [c, x] = canvas(512, 128), py = m => (m + W / 2) / W * 128, pu = m => m / 16 * 512;
    const grav = (y0, y1, a0, a1) => { const g = x.createLinearGradient(0, py(y0), 0, py(y1)); g.addColorStop(0, `rgba(104,96,80,${a0})`); g.addColorStop(1, `rgba(104,96,80,${a1})`); x.fillStyle = g; x.fillRect(0, py(y0), 512, py(y1) - py(y0)); };
    grav(-W / 2, -ROAD.w / 2, 0, 0.9); grav(ROAD.w / 2, W / 2, 0.9, 0);
    x.fillStyle = 'rgba(60,58,54,1)'; x.fillRect(0, py(-ROAD.w / 2), 512, py(ROAD.w / 2) - py(-ROAD.w / 2));
    for (let k = 0; k < 260; k++) { x.fillStyle = `rgba(${pick(['40,39,36', '78,74,66', '52,50,46'])},${rr(0.15, 0.4)})`; const w = rr(4, 40); x.fillRect(rand() * 512, py(rr(-ROAD.w / 2, ROAD.w / 2 - 0.3)), w, rr(2, 10)); }   // patches and wear
    for (let k = 0; k < 90; k++) { x.fillStyle = `rgba(${pick(['104,96,80', '84,78,66'])},0.8)`; x.fillRect(rand() * 512, py(pick([-1, 1]) * rr(ROAD.w / 2 - 0.25, ROAD.w / 2)), rr(2, 8), rr(1, 3)); }   // gravel spilled onto the edges
    x.strokeStyle = 'rgba(28,27,25,.75)'; x.lineWidth = 1.2;   // cracks
    for (let k = 0; k < 26; k++) { let u = rand() * 512, v = py(rr(-ROAD.w / 2, ROAD.w / 2)); x.beginPath(); x.moveTo(u, v); for (let s = 0; s < 6; s++) { u += rr(-14, 14); v += rr(-7, 7); x.lineTo(u, v); } x.stroke(); }
    x.fillStyle = 'rgba(210,206,190,.28)'; [-1, 1].forEach(s => x.fillRect(0, py(s * (ROAD.w / 2 - 0.3)) - 1.5, 512, 3));
    x.fillStyle = 'rgba(214,170,60,.5)'; [0, 8].forEach(u => x.fillRect(pu(u + 0.5), py(0) - 1.5, pu(3), 3));
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(RL / 16, 1); t.anisotropy = aniso;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(RL, W), lam(0xffffff, { map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, -0.006, ROAD.z); m.receiveShadow = true; scene.add(m);
  }
}
