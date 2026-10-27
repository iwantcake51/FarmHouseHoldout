// The melee weapon in your hands as a flat white silhouette, shown in the HUD where a gun's ammo count sits.

import { $ } from '../core/dom.js';
import { R, V3 } from '../core/renderer.js';
import { cache } from '../core/math.js';
import { modLv } from '../weapons/mod-levels.js';
import { W8 } from '../game/run-state.js';
import { GUNS } from '../melee/melee-models.js';

const meleeArtCache = {}, MELEE_ART_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const MELEE_ART_PPU = 190;   // CSS pixels per metre, the same for every weapon, so a katana draws longer than a wrench
// render the model once per weapon and set of mods into an offscreen target, and keep the picture
export function meleeArt(id, mods) {
  const key = id + ':' + mods.map(k => k + modLv(k)).join(',');   // a mod improved at the bench grows the model, so it's a new picture
  if (meleeArtCache[key]) return meleeArtCache[key];
  const sc = new THREE.Scene(), g = new THREE.Group(), flags = {}; mods.forEach(k => { flags[k] = modLv(k); });
  GUNS[id](g, flags);
  // lay it on its side: tip to the left, edge down, the flat of the blade facing you
  // (the wrench is turned the other way up, so its jaw opens on top)
  g.setRotationFromMatrix(id === 'wrench' ? new THREE.Matrix4().makeBasis(new V3(0, 0, -1), new V3(-1, 0, 0), new V3(0, 1, 0))
    : new THREE.Matrix4().makeBasis(new V3(0, 0, 1), new V3(-1, 0, 0), new V3(0, -1, 0)));
  sc.add(g); sc.overrideMaterial = MELEE_ART_MAT; g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g), pad = 0.02, ss = 2;
  const w = bb.max.x - bb.min.x + pad * 2, h = bb.max.y - bb.min.y + pad * 2;
  const pw = Math.ceil(w * MELEE_ART_PPU * ss), ph = Math.ceil(h * MELEE_ART_PPU * ss);
  const oc = new THREE.OrthographicCamera(bb.min.x - pad, bb.max.x + pad, bb.max.y + pad, bb.min.y - pad, 0.1, 20); oc.position.z = 5;
  // drawn at twice the size it's shown at, so the edges come out smooth
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
  return (meleeArtCache[key] = { url: c.toDataURL(), w: w * MELEE_ART_PPU });
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
