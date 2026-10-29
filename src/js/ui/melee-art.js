// Weapons as pictures in the HUD's ink, drawn from their own models: the melee weapon in your hands where a gun's ammo
// count sits, and every weapon you carry in the slot row under it (ui/hud-text.js: renderSlots), what's been fitted to
// a gun picked out in gold.

import { $ } from '../core/dom.js';
import { R, V3 } from '../core/renderer.js';
import { cache } from '../core/math.js';
import { modLv } from '../weapons/mod-levels.js';
import { magTierIn, setTierCtx, W, W8 } from '../game/run-state.js';
import { GUNS } from '../melee/melee-models.js';
import { WEAP } from '../weapons/gun-stats.js';
import { buildWeapon, weaponRec } from '../weapons/build-weapons.js';

const meleeArtCache = {};
const MELEE_ART_PPU = 190;   // CSS pixels per metre, the same for every weapon, so a katana draws longer than a wrench
// render the model once per weapon and set of mods into an offscreen target, and keep the picture
// (lv: each mod's level, yours unless given: a teammate's are sent with their loadout, net/arsenal.js)
export function meleeArt(id, mods, lv = modLv) {
  const key = id + ':' + mods.map(k => k + lv(k)).join(',');   // a mod improved at the bench grows the model, so it's a new picture
  if (meleeArtCache[key]) return meleeArtCache[key];
  const g = new THREE.Group(), flags = {}; mods.forEach(k => { flags[k] = lv(k); });
  GUNS[id](g, flags);
  // lay it on its side: tip to the left, edge down, the flat of the blade facing you
  // (the wrench is turned the other way up, so its jaw opens on top)
  g.setRotationFromMatrix(id === 'wrench' ? new THREE.Matrix4().makeBasis(new V3(0, 0, -1), new V3(-1, 0, 0), new V3(0, 1, 0))
    : new THREE.Matrix4().makeBasis(new V3(0, 0, 1), new V3(-1, 0, 0), new V3(0, -1, 0)));
  const a = snapArt(g, MELEE_ART_PPU);
  return (meleeArtCache[key] = a);
}
// a model, already turned as it should lie, drawn into a picture of its own (ppu: CSS pixels to the metre) in the HUD's
// ink, lit from the upper left so its rounds and bevels show (artMat), over clear: framed to what of it shows (its visible
// meshes, so a hidden flash or spare part can't widen it), drawn at twice the size it's shown at and multisampled so the
// edges come out smooth, and the model's geometry let go after.
// opt.cut: what's fitted to a gun (its attachments and a bigger mag: weapons/build-weapons.js marks them) drawn in the
// upgrade gold instead, standing apart from the gun by a hairline of clear around it, so a light, a laser or a sight
// reads as its own part, and as something added. (Drawn again on its own over the gun's depth, so a part on the far
// side stays hidden behind it.)
// opt.pair: an akimbo pair, the second gun behind the first, up and to the right, half see-through, with the same
// hairline round the front one
// Where one part stands out in front of another by more than ART.step (a receiver over its barrel, a grip over its
// frame), the edge of the one behind gets a line inked in, ART.line of its colour, so the parts read inside the outline
const ART = { ss: 2, cut: 2, pairX: 0.3, pairY: 0.26, pairA: 0.45, ink: 0xece6d8, gold: 0xf0bf4c, lo: 0.4, step: 0.005, line: 0.55 };   // (cut: in drawn pixels, twice CSS ones; lo: the shade facing away from the light; step: metres)
// and shaded like a drawing: a glint where a face turns the light to you (spec: how bright, how tight), the parts further
// back a shade darker than the nearest (deep), the crevices and the parts under an overhang darker still (ao: how much
// for each neighbour nearer by aoStep, as far as most, looked for r drawn pixels round), and a little lighter at the top than the
// bottom (fall), as if lit from above
const ART_SHADE = { spec: [0.3, 26], deep: 0.3, ao: 0.035, aoMost: 0.22, r: [4, 8], aoStep: 0.004, fall: 0.16 };   // (aoStep: how much nearer a neighbour must be to count, metres)
const ART_INK = artMat(ART.ink), ART_GOLD = artMat(ART.gold), ART_DEPTH = new THREE.MeshBasicMaterial({ colorWrite: false });
// how near each pixel is, as its red (0 at the camera's near plane, 255 at its far one: set to the model's own depth)
const ART_Z = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }' });
// a flat colour shaded by how a face turns to a light from the upper left and in front (in the camera's space, which for
// these pictures is the picture's): full colour facing it, ART.lo of it facing away, either side of a face
function artMat(hex) {
  return new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(hex) }, lo: { value: ART.lo } }, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vN; void main() { vN = normalMatrix * normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 col; uniform float lo; varying vec3 vN; void main() { vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0), L = normalize(vec3(-0.5, 0.75, 0.45)); float d = dot(n, L);
      float sp = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), ${ART_SHADE.spec[1].toFixed(1)}) * ${ART_SHADE.spec[0].toFixed(2)};
      gl_FragColor = vec4(min(vec3(1.0), col * mix(lo, 1.0, smoothstep(-0.6, 0.9, d)) + sp), 1.0); }`,
  });
}
function snapArt(g, ppu, opt = {}) {
  const sc = new THREE.Scene(); sc.add(g); g.updateMatrixWorld(true);
  const bb = new THREE.Box3(), mb = new THREE.Box3();
  g.traverse(o => { if (!o.isMesh) return; for (let p = o; p; p = p.parent) if (!p.visible) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.union(mb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); });
  const pad = 0.02, ss = ART.ss, w = bb.max.x - bb.min.x + pad * 2, h = bb.max.y - bb.min.y + pad * 2;
  const pw = Math.ceil(w * ppu * ss), ph = Math.ceil(h * ppu * ss);
  const near = 5 - bb.max.z - 0.01, far = 5 - bb.min.z + 0.01;
  const oc = new THREE.OrthographicCamera(bb.min.x - pad, bb.max.x + pad, bb.max.y + pad, bb.min.y - pad, near, far); oc.position.z = 5;
  const isAtt = o => { for (let p = o; p; p = p.parent) if (p.userData.att) return true; return false; };
  const meshes = []; g.traverse(o => { if (o.isMesh) meshes.push(o); });
  meshes.forEach(o => { o.material = ART_Z; });
  const depth = shoot(sc, oc, pw, ph, 0).getContext('2d').getImageData(0, 0, pw, ph).data;
  meshes.forEach(o => { o.material = ART_INK; });
  const whole = shoot(sc, oc, pw, ph);
  // the attachments on their own in gold, the rest only hiding what's behind it (drawn first)
  let parts = null;
  if (opt.cut && meshes.some(isAtt)) { meshes.forEach(o => { const a = isAtt(o); o.material = a ? ART_GOLD : ART_DEPTH; o.renderOrder = a ? 0 : -1; }); parts = shoot(sc, oc, pw, ph); }
  meshes.forEach(o => o.geometry.dispose());
  const one = parts ? canvas(pw, ph) : whole;
  if (parts) { const x = one.getContext('2d'); x.drawImage(whole, 0, 0); hairline(x, parts, 0, 0); x.drawImage(parts, 0, 0); }
  shadeArt(one, depth, ART_SHADE.aoStep / (far - near) * 255); inkSteps(one, depth, ART.step / (far - near) * 255);
  if (!opt.pair) return { url: one.toDataURL(), w: w * ppu, h: h * ppu };
  const ox = Math.round(pw * ART.pairX), oy = Math.round(ph * ART.pairY), c = canvas(pw + ox, ph + oy), x = c.getContext('2d');
  x.globalAlpha = ART.pairA; x.drawImage(one, ox, 0); x.globalAlpha = 1;
  hairline(x, one, 0, oy); x.drawImage(one, 0, oy);
  return { url: c.toDataURL(), w: (pw + ox) / ss, h: (ph + oy) / ss };
}
// ink the lines in (above): a pixel with something nearer than it by more than step (in depth's units) within a drawn
// pixel or two any way is darkened
function inkSteps(c, depth, step) {
  const pw = c.width, ph = c.height, x = c.getContext('2d'), im = x.getImageData(0, 0, pw, ph), d = im.data;
  const near = (i, j) => i >= 0 && j >= 0 && i < pw && j < ph && depth[(j * pw + i) * 4 + 3] > 0 ? depth[(j * pw + i) * 4] : 999;
  for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
    const k = (j * pw + i) * 4; if (!d[k + 3] || !depth[k + 3]) continue;
    const z = depth[k] - step;
    for (let r = 1; r <= ART.ss; r++) if (near(i + r, j) < z || near(i - r, j) < z || near(i, j + r) < z || near(i, j - r) < z) { d[k] *= ART.line; d[k + 1] *= ART.line; d[k + 2] *= ART.line; break; }
  }
  x.putImageData(im, 0, 0);
}
// the drawing's shading (ART_SHADE) over what's drawn, from how near each pixel is (depth, as for the lines)
function shadeArt(c, depth, step) {
  const pw = c.width, ph = c.height, x = c.getContext('2d'), im = x.getImageData(0, 0, pw, ph), d = im.data, S = ART_SHADE;
  let zn = 255, zf = 0; for (let k = 0; k < depth.length; k += 4) if (depth[k + 3]) { zn = Math.min(zn, depth[k]); zf = Math.max(zf, depth[k]); }
  const span = Math.max(1, zf - zn), dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
    const k = (j * pw + i) * 4; if (!d[k + 3] || !depth[k + 3]) continue;
    const z = depth[k]; let n = 0;
    for (const r of S.r) for (const [u, v] of dirs) { const a = i + Math.round(u * r * ART.ss), b = j + Math.round(v * r * ART.ss); if (a >= 0 && b >= 0 && a < pw && b < ph) { const q = (b * pw + a) * 4; if (depth[q + 3] && depth[q] < z - step) n++; } }
    const f = (1 - S.deep * (z - zn) / span) * (1 - Math.min(S.aoMost, n * S.ao)) * (1 + S.fall / 2 - S.fall * j / ph);
    d[k] = Math.min(255, d[k] * f); d[k + 1] = Math.min(255, d[k + 1] * f); d[k + 2] = Math.min(255, d[k + 2] * f);
  }
  x.putImageData(im, 0, 0);
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// render the scene into a canvas of its own (GL reads bottom row first, so it's flipped on the way)
// (samples: multisampled for smooth edges; none for the depth, so no pixel's depth is a blend of two)
function shoot(sc, oc, pw, ph, samples = 4) {
  const rt = new THREE.WebGLRenderTarget(pw, ph, { samples }), prevRT = R.getRenderTarget(), prevC = R.getClearColor(new THREE.Color()), prevA = R.getClearAlpha();
  R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(sc, oc);
  const px = new Uint8Array(pw * ph * 4); R.readRenderTargetPixels(rt, 0, 0, pw, ph, px);
  R.setRenderTarget(prevRT); R.setClearColor(prevC, prevA); rt.dispose();
  const c = canvas(pw, ph), x = c.getContext('2d'), im = x.createImageData(pw, ph);
  for (let r = 0; r < ph; r++) im.data.set(px.subarray((ph - 1 - r) * pw * 4, (ph - r) * pw * 4), r * pw * 4);
  x.putImageData(im, 0, 0);
  return c;
}
// clear a hairline round the shape of src (drawn at x0, y0) out of what's already drawn: the shape spread by ART.cut
// pixels every way and taken out, before the shape itself goes on top
function hairline(x, src, x0, y0) {
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; x.drawImage(src, x0 + Math.round(Math.cos(a) * ART.cut), y0 + Math.round(Math.sin(a) * ART.cut)); }
  x.globalCompositeOperation = 'source-over';
}
// a gun the same way, built as it's built for your hands (buildWeapon) with everything fitted to it that shows (its mods
// and their levels, its tiers, attachments, the tune-up, the rounds and mag in it), its attachments in gold
// and a pair drawn as two (snapArt), laid on its side with the muzzle to the left, as the melee weapons lie; kept
// until any of that changes (gunArtKey)
const gunArtCache = {}, GUN_ART_PPU = 120, GUN_TURN = new THREE.Matrix4().makeBasis(new V3(0, 0, 1), new V3(0, 1, 0), new V3(-1, 0, 0));
export const gunArtKey = id => id + ':' + (W8.mods[id] || []).map(m => m + modLv(m)).join(',') + JSON.stringify([W8.gt[id], W8.att && W8.att[id], W8.tune && W8.tune[id], W8.rds && W8.rds[id], W8.rounds && W8.rounds[id], magTierIn(id), !!(W(id) || {}).akimbo]);
export function gunArt(id) {
  const D = WEAP[id]; if (!D) return null;
  if (D.melee) return meleeArt(id, W8.mods[id] || []);
  const key = gunArtKey(id); if (gunArtCache[key]) return gunArtCache[key];
  const g = new THREE.Group(), mods = {}; (W8.mods[id] || []).forEach(m => { mods[m] = modLv(m); });
  setTierCtx(id); try { buildWeapon(g, id, W(id) || D, mods, weaponRec()); } finally { setTierCtx(null); }
  g.setRotationFromMatrix(GUN_TURN);
  return (gunArtCache[key] = snapArt(g, GUN_ART_PPU, { cut: true, pair: !!(W(id) || {}).akimbo }));
}
// the HUD's weapon block: the silhouette in place of the ammo count while you hold a melee weapon
export function renderMeleeArt(id, D) {
  const el = $('meleeArt'), on = !!D.melee;
  if (el.hidden === on) { el.hidden = !on; $('ammo').hidden = on; }
  if (!on) return;
  const k = id + ':' + (W8.mods[id] || []).map(m => m + modLv(m)).join(',');
  if (cache.meleeArt === k) return; cache.meleeArt = k;
  const a = meleeArt(id, W8.mods[id] || []);
  el.src = a.url; el.style.width = a.w.toFixed(0) + 'px';
  el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
}
