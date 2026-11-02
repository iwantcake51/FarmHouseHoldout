// The floors: the SBS packs' concrete, asphalt, tiles, carpet, dirt, straw and boards (tools/pack-ground.py packs them
// grey into one strip, GROUND_ART.floors) laid over a floor in the world (floorMat): the arena maps' (each drawn on its
// own map of where everything is, its paint and stains and its colours: those stay as they were, and the pack's grain,
// joints and grout come up through them) and the farmhouse's boards. Laid in metres across the world, never stretched
// with the mesh, with no repeat to see: a loose floor's copies are turned and shifted patch by patch and faded into each
// other, a tiled one's shifted by whole tiles (so the grout still lines up), boards each slid along their length;
// a finer copy over a loose one keeps it crisp close up, and a slow drift of light and dark over all of it breaks up
// what's left. Drawn by the same light-mapped shader as everything else (core/shaders.js lit), so the lights, the
// dark, the flashlights and the blood work on it as they did.

import { R } from '../core/renderer.js';
import { FLOOR_LAYERS, GROUND_ART } from './ground-art.js';

// Perlin (gradient) noise and a few octaves of it, for the shaders (world/ground.js uses them too)
export const NOISE_GLSL = `
vec2 gHash(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453) * 2.0 - 1.0; }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(dot(gHash(i), f), dot(gHash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(gHash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(gHash(i + 1.0), f - 1.0), u.x), u.y);
}
float gFbm(vec2 p) { return gNoise(p) * 0.6 + gNoise(p * 2.03 + 7.1) * 0.28 + gNoise(p * 4.07 + 3.7) * 0.12; }
`;
// each kind of floor: its layer of the strip, how many metres one copy of it covers, how strongly its light and dark
// show (0 not at all, 1 as the pack has it, more for the faint ones), and how it's laid: 0 loose (no repeat: patches
// of it turned and shifted, faded into each other), n > 0 tiles (each copy shifted by whole steps of 1/n of itself, so the grout lines up and the
// checks keep their order), n < 0 boards (-n of them across a copy, each slid along its length its own way)
const FLOOR_KIND = {
  concrete: ['concrete', 3.2, 1.9, 0],     // a pad, a slab, a lot: poured concrete
  asphalt: ['asphalt', 2.4, 0.85, 0],      // roads and car parks
  terrazzo: ['terrazzo', 2, 0.75, 2],      // the mall's concourse: metre tiles, a dark diamond at their corners
  checker: ['checker', 2, 0.42, 2],        // the food court: half-metre squares, dark and light
  granite: ['granite', 1.5, 0.6, 3],       // a shop floor: half-metre speckled tiles
  carpet: ['carpet', 1.1, 0.8, 0],         // the anchor stores
  gravel: ['gravel', 2.2, 1.3, 0],         // a farmyard's packed dirt and grit
  soil: ['soil', 2.6, 0.6, 0],             // a ploughed field, a corral's mud
  straw: ['straw', 1.6, 0.5, 0],           // old straw on a barn's floor
  boards: ['boards', 1, 0.75, -4],         // floorboards, a quarter metre wide
};
const FLOOR_PX = 128, FLOOR_ZONES = 8;
// the strip as one texture of layers (grey: one channel), mipmapped and filtered as finely as the card allows; mid grey
// (no grain at all) until the picture's in
const FLOOR_TEX = (() => {
  const n = FLOOR_LAYERS.length, t = new THREE.DataArrayTexture(new Uint8Array(FLOOR_PX * FLOOR_PX * n).fill(128), FLOOR_PX, FLOOR_PX, n);
  t.format = THREE.RedFormat; t.unpackAlignment = 1; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = R.capabilities.getMaxAnisotropy(); t.needsUpdate = true;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = FLOOR_PX; c.height = FLOOR_PX * n;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, out = t.image.data;
    for (let k = 0; k < out.length; k++) out[k] = d[k * 4];
    t.needsUpdate = true;
  };
  img.src = GROUND_ART.floors;
  return t;
})();
// (a floor all one kind has no zones to look up)
const FLOOR_NO_ZONES = (() => { const t = new THREE.DataTexture(new Uint8Array(4), 1, 1); t.needsUpdate = true; return t; })();
const FLOOR_DECL = `
uniform highp sampler2DArray uFArt;
uniform sampler2D uFZone;
uniform vec4 uFRect;
uniform vec4 uFK[${FLOOR_ZONES}];
` + NOISE_GLSL + `
vec2 fHash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float fTex(vec2 x, vec2 dx, vec2 dy, float l) { return textureGrad(uFArt, vec3(x, l), dx, dy).r; }
// a loose floor: patch i's copy (turned, shifted), and where two patches meet their copies faded into each other, the
// darker winning first so the seam follows its shapes; drawn with the gradients the plain copy would have, turned with
// it, so its mip level never jumps
float fPick(vec2 x, vec2 dx, vec2 dy, float l, float i) {
  float r = fract(sin(i * 12.9898 + 4.1) * 43758.5453) * 6.2832; mat2 m = mat2(cos(r), sin(r), -sin(r), cos(r));
  return fTex(m * x + sin(vec2(3.0, 7.0) * i), m * dx, m * dy, l);
}
float fLoose(vec2 x, vec2 dx, vec2 dy, float l, float t) {
  float s = t * 14.0, f = fract(s), ia = floor(s);
  float a = fPick(x, dx, dy, l, ia), b = fPick(x, dx, dy, l, ia + 1.0);
  return mix(a, b, smoothstep(0.15, 0.85, f - 0.4 * (a - b)));
}
`;
// the floor's grain over its colour: which kind it is here (its zone), that kind's texture laid as it's laid, a finer
// copy over a loose one, the slow drift of light and dark; doubled back from the strip's mid grey, so on average it
// leaves the colour as it was
const FLOOR_FS = `
  {
    vec2 fp = vWp.xz - uFRect.xy, fdx = dFdx(fp), fdy = dFdy(fp);
    ivec2 zs = textureSize(uFZone, 0);
    vec4 k = uFK[int(texelFetch(uFZone, clamp(ivec2(fp / uFRect.zw * vec2(zs)), ivec2(0), zs - 1), 0).r * 255.0 + 0.5)];
    vec2 x = fp * k.y, dx = fdx * k.y, dy = fdy * k.y;
    float fd;
    if (k.w > 0.5) fd = fTex(x + floor(fHash2(floor(x) + 0.37) * k.w) / k.w, dx, dy, k.x);
    else if (k.w < -0.5) fd = fTex(x + vec2(0.0, fHash2(vec2(floor(x.x * -k.w), 5.3)).x * 7.0), dx, dy, k.x);
    else {
      fd = fLoose(x, dx, dy, k.x, gFbm(fp * 0.32 + 71.0) * 0.6 + 0.5);
      mat2 fm = mat2(0.8, 0.6, -0.6, 0.8) * 3.7;
      fd *= mix(1.0, fTex(fm * x + 0.37, fm * dx, fm * dy, k.x) * 2.0, 0.3);
    }
    fd = mix(1.0, fd * 2.0, k.z) * (1.0 + gFbm(vWp.xz * 0.045 + 13.7) * 0.16);
    diffuseColor.rgb *= fd;
  }`;
// lays a floor's grain into a lit material (mat, as lam makes it: its colour, and the map of the floor if it has one)
// and hands it back. kind: what it is (FLOOR_KIND); rect: [x0, z0, x1, z1] in the world, the floor's corner (its tiles
// and boards line up with it; without one, with the world's cells) and its extent; zones: where it's something else,
// each [kind, i0, j0, i1, j1] in metres from that corner (a negative number counts back from the far side), laid in
// order over the rest
export function floorMat(mat, kind, rect, zones) {
  const r = rect || [0, 0, 1, 1], w = r[2] - r[0], d = r[3] - r[1], kinds = [kind];
  for (const z of zones || []) if (!kinds.includes(z[0])) kinds.push(z[0]);
  if (kinds.length > FLOOR_ZONES) throw new Error('floorMat: more than ' + FLOOR_ZONES + ' kinds of floor in one');
  let zt = FLOOR_NO_ZONES;
  if (zones && zones.length) {   // (where each kind is, its number in the red: 4 pixels a metre, read exactly)
    const c = document.createElement('canvas'); c.width = Math.ceil(w * 4); c.height = Math.ceil(d * 4); const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    const at = (v, L) => (v < 0 ? L + v : v) * 4;
    for (const [k, i0, j0, i1, j1] of zones) { x.fillStyle = `rgb(${kinds.indexOf(k)},0,0)`; x.fillRect(at(i0, w), at(j0, d), at(i1, w) - at(i0, w), at(j1, d) - at(j0, d)); }
    zt = new THREE.CanvasTexture(c); zt.flipY = false; zt.magFilter = zt.minFilter = THREE.NearestFilter; zt.generateMipmaps = false;
  }
  const K = kinds.map(k => { const [l, m, a, lay] = FLOOR_KIND[k]; return new THREE.Vector4(FLOOR_LAYERS.indexOf(l), 1 / m, a, lay); });
  while (K.length < FLOOR_ZONES) K.push(K[0].clone());
  const U = { uFArt: { value: FLOOR_TEX }, uFZone: { value: zt }, uFRect: { value: new THREE.Vector4(r[0], r[1], w, d) }, uFK: { value: K } };
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = function (sh, rr) {
    base.call(this || mat, sh, rr);
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = FLOOR_DECL + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + FLOOR_FS);
  };
  mat.customProgramCacheKey = () => 'lit-floor';
  return mat;
}
