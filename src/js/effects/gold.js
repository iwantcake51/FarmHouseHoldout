// Gold: Gun game's last two weapons, the golden revolver and the golden katana (pvp/pvp.js), and what they do. The
// weapons themselves are gold all over, in your hands, on anyone carrying them and in every picture of them; whoever
// they kill turns to solid gold where they fall (gild: every part of them, clothes, face and whatever they were
// holding, a cut limb or a split head included, till they're back in: ungild); and what a hit with one throws out of
// someone is gold too, not blood (GOLD.on, while a hit's effects are made: effects/particles.js drops, effects/puffs.js
// mist and spray; the stains a drop leaves on the ground and the walls, and the blood on your screen, a hit with one
// leaves none of).

import { lam } from '../core/shaders.js';

export const GOLD = { on: false };
// the gold everything's turned to: bright, a little of its own glow kept out of the light map's shading so it still
// reads as gold in the dark (core/shaders.js lit), and a darker one for the inside of a cut
const GOLD_MAT = lam(0xe0b03c, { emissive: 0x3c2a06 }), GOLD_DEEP = lam(0xb07c1c, { emissive: 0x2a1c04 });
GOLD_MAT.userData.mobile = GOLD_DEEP.userData.mobile = true;
// what's made while it's on (a hit's drops and mist) gold; on for as long as fn runs
export function goldDo(on, fn) { const was = GOLD.on; GOLD.on = !!on; try { return fn(); } finally { GOLD.on = was; } }
// everything under root turned gold (each mesh's own material kept to put back: ungild), never an outline; forever,
// nothing kept (a golden weapon's own model, gold for good: a body's ungild leaves it gold)
export function gild(root, forever) {
  if (!root) return;
  root.traverse(o => {
    if (!o.isMesh || o.userData.isOutline || o.userData.gold0 !== undefined || Array.isArray(o.material)) return;
    if (!forever) o.userData.gold0 = o.material;
    const c = o.material && o.material.color, dark = c && c.r + c.g + c.b < 0.45;   // (what was dark, a cut's meat, a deep shade, the darker gold)
    o.material = forever ? goldFull() : dark ? GOLD_DEEP : GOLD_MAT;   // (a golden weapon in the same polished gold a body turns to: goldFull)
  });
}
export function ungild(root) {
  if (!root) return;
  const ov = [];
  root.traverse(o => { if (o.isMesh && o.userData.gold0 !== undefined) { o.material = o.userData.gold0; delete o.userData.gold0; } if (o.userData.goldOv) ov.push(o); });
  ov.forEach(o => { o.parent.remove(o); });   // (a spread's gold skin off them: goldSpread)
  if (root.userData.goldSpread) { const k = GOLD_POURS.indexOf(root.userData.goldSpread); if (k >= 0) GOLD_POURS.splice(k, 1); delete root.userData.goldSpread; }
  root.userData.goldLock = false;
}

// ---- gold spreading over a body (a kill with a golden weapon: pvp/pvp.js pvpGoldBody): from where the round or the
// blade went in, out over all of them like something poured, faster downward than up as a liquid runs, its front a
// wobbling line with a molten glow along it, till every part of them, clothes, face, hair and whatever they held, is
// gold, polished, catching the light. Each part gets a gold skin over it (its own shape, drawn just in front of it,
// showing only what the gold's reached), all of one body's sharing one spread (GOLD_POUR: how long it takes to cover a
// body, s; how far it reaches by then, m; how much faster it runs down than up; the front's glow, m wide; its pace
// through it, ease). And as it starts the body locks where it is: its limbs set as they were, no falling slack (the
// ragdoll held still: net/avatars.js, player/animation.js)
const GOLD_POUR = { len: 1.8, reach: 2.1, down: 1.6, up: 0.85, rim: 0.07, ease: 1.15 };
const GOLD_POURS = [];
const GOLD_VS = `varying vec3 vW; varying vec3 vN;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const GOLD_FS = `uniform vec3 uO; uniform float uR; uniform float uRim; uniform float uDown; uniform float uUp; uniform float uT;
varying vec3 vW; varying vec3 vN;
float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main() {
  vec3 d = vW - uO; d.y *= d.y < 0.0 ? 1.0 / uDown : 1.0 / uUp;
  float wob = (n3(vW * 9.0 + uT * 0.6) - 0.5) * 0.09 + (n3(vW * 23.0) - 0.5) * 0.03;
  float e = uR - (length(d) + wob);
  if (e < 0.0) discard;
  vec3 n = normalize(vN), v = normalize(cameraPosition - vW), L = normalize(vec3(-0.35, 0.9, 0.3));
  float dif = max(dot(n, L), 0.0), sp = pow(max(dot(n, normalize(L + v)), 0.0), 38.0), fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 r = reflect(-v, n); float sky = smoothstep(-0.25, 0.6, r.y);
  vec3 base = vec3(0.86, 0.62, 0.2), col = base * (0.28 + 0.62 * dif) + base * mix(0.12, 0.55, sky) + vec3(1.0, 0.92, 0.7) * (sp * 1.1 + fr * 0.45);
  float rim = 1.0 - smoothstep(0.0, uRim, e);   // (the front, still molten)
  col = mix(col, vec3(1.0, 0.7, 0.25) * 1.5, rim * 0.8);
  gl_FragColor = vec4(col, 1.0);
}`;
function spreadMat(o) {
  return new THREE.ShaderMaterial({ vertexShader: GOLD_VS, fragmentShader: GOLD_FS, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    uniforms: { uO: { value: o.clone() }, uR: { value: 0 }, uRim: { value: GOLD_POUR.rim }, uDown: { value: GOLD_POUR.down }, uUp: { value: GOLD_POUR.up }, uT: { value: 0 } } });
}
// a gold skin on every part under root (not an outline, not one it has already), sharing mat
function goldSkin(root, mat) {
  const list = []; root.traverse(o => { if (o.isMesh && !o.userData.isOutline && !o.userData.goldOv && !o.children.some(c => c.userData.goldOv)) list.push(o); });
  for (const o of list) { const s = new THREE.Mesh(o.geometry, mat); s.userData.goldOv = true; s.renderOrder = (o.renderOrder || 0) + 1; s.castShadow = false; s.frustumCulled = o.frustumCulled; o.add(s); }
}
// gold starting at at (world) over everything under root, root locked where it stands; and what's later cut from it
// (a limb, the halves of a head) spread over the same way (goldSpreadMore)
export function goldSpread(root, at) {
  if (!root) return;
  if (root.userData.goldSpread) { goldSkin(root, root.userData.goldSpread.mat); return; }
  const S = { mat: spreadMat(at), t0: performance.now() }; root.userData.goldSpread = S; root.userData.goldLock = true; GOLD_POURS.push(S);
  goldSkin(root, S.mat);
}
// the polished gold all over, at once (a golden weapon: gild forever), made the first time it's wanted
let GOLD_FULL = null;
const goldFull = () => { if (!GOLD_FULL) { GOLD_FULL = spreadMat(new THREE.Vector3()); GOLD_FULL.uniforms.uR.value = 1e6; GOLD_FULL.uniforms.uRim.value = 0; GOLD_FULL.polygonOffset = false; } return GOLD_FULL; };
export function goldSpreadMore(root, from) { const S = from && from.userData.goldSpread; if (S && root) goldSkin(root, S.mat); }
// every frame (pvp/pvp.js pvpUpdate): each spread on, on real time
export function goldStep() {
  const now = performance.now();
  for (const S of GOLD_POURS) {
    const u = Math.min(1, (now - S.t0) / 1000 / GOLD_POUR.len), k = Math.pow(u, GOLD_POUR.ease) * (1.6 - 0.6 * u);   // (an even pour, a touch quicker at first, slowing to the end)
    S.mat.uniforms.uR.value = k * GOLD_POUR.reach + (u >= 1 ? 1 : 0); S.mat.uniforms.uT.value = (now - S.t0) / 1000;
  }
}
