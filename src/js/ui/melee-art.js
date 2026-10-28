// Weapons as flat white silhouettes: the melee weapon in your hands where a gun's ammo count sits, and every weapon
// you carry in the slot row under it (ui/hud-text.js: renderSlots), each drawn from its own model.

import { $ } from '../core/dom.js';
import { R, V3 } from '../core/renderer.js';
import { cache } from '../core/math.js';
import { modLv } from '../weapons/mod-levels.js';
import { setTierCtx, W, W8 } from '../game/run-state.js';
import { GUNS } from '../melee/melee-models.js';
import { WEAP } from '../weapons/gun-stats.js';
import { buildWeapon, weaponRec } from '../weapons/build-weapons.js';

const meleeArtCache = {}, MELEE_ART_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
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
  const a = snapWhite(g, MELEE_ART_PPU);
  return (meleeArtCache[key] = a);
}
// a model, already turned as it should lie, drawn flat white over clear into a picture of its own (ppu: CSS pixels to
// the metre): framed to what of it shows (its visible meshes, so a hidden flash or spare part can't widen it), drawn at
// twice the size it's shown at so the edges come out smooth, and the model's geometry let go after
function snapWhite(g, ppu) {
  const sc = new THREE.Scene(); sc.add(g); sc.overrideMaterial = MELEE_ART_MAT; g.updateMatrixWorld(true);
  const bb = new THREE.Box3(), mb = new THREE.Box3();
  g.traverse(o => { if (!o.isMesh) return; for (let p = o; p; p = p.parent) if (!p.visible) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.union(mb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); });
  const pad = 0.02, ss = 2, w = bb.max.x - bb.min.x + pad * 2, h = bb.max.y - bb.min.y + pad * 2;
  const pw = Math.ceil(w * ppu * ss), ph = Math.ceil(h * ppu * ss);
  const oc = new THREE.OrthographicCamera(bb.min.x - pad, bb.max.x + pad, bb.max.y + pad, bb.min.y - pad, 0.1, 20); oc.position.z = 5;
  const rt = new THREE.WebGLRenderTarget(pw, ph), prevRT = R.getRenderTarget(), prevC = R.getClearColor(new THREE.Color()), prevA = R.getClearAlpha();
  R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(sc, oc);
  const px = new Uint8Array(pw * ph * 4); R.readRenderTargetPixels(rt, 0, 0, pw, ph, px);
  R.setRenderTarget(prevRT); R.setClearColor(prevC, prevA); rt.dispose();
  g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  // GL reads bottom row first: flip it into a canvas
  const c = document.createElement('canvas'); c.width = pw; c.height = ph;
  const x = c.getContext('2d'), im = x.createImageData(pw, ph);
  for (let r = 0; r < ph; r++) im.data.set(px.subarray((ph - 1 - r) * pw * 4, (ph - r) * pw * 4), r * pw * 4);
  x.putImageData(im, 0, 0);
  return { url: c.toDataURL(), w: w * ppu, h: h * ppu };
}
// a gun the same way, built as it's built for your hands (buildWeapon) with everything fitted to it that shows (its mods
// and their levels, its tier, attachments, the tune-up), laid on its side with the muzzle to the left, as the melee
// weapons lie; kept until any of that changes (gunArtKey)
const gunArtCache = {}, GUN_ART_PPU = 120, GUN_TURN = new THREE.Matrix4().makeBasis(new V3(0, 0, 1), new V3(0, 1, 0), new V3(-1, 0, 0));
export const gunArtKey = id => id + ':' + (W8.mods[id] || []).map(m => m + modLv(m)).join(',') + JSON.stringify([W8.gt[id], W8.att && W8.att[id], W8.tune && W8.tune[id]]);
export function gunArt(id) {
  const D = WEAP[id]; if (!D) return null;
  if (D.melee) return meleeArt(id, W8.mods[id] || []);
  const key = gunArtKey(id); if (gunArtCache[key]) return gunArtCache[key];
  const g = new THREE.Group(), mods = {}; (W8.mods[id] || []).forEach(m => { mods[m] = modLv(m); });
  setTierCtx(id); try { buildWeapon(g, id, W(id) || D, mods, weaponRec()); } finally { setTierCtx(null); }
  g.setRotationFromMatrix(GUN_TURN);
  return (gunArtCache[key] = snapWhite(g, GUN_ART_PPU));
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
