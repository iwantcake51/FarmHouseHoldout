// Muzzle flash and the live muzzle position.

import { GUN_Y, V3 } from '../core/renderer.js';
import { pick, rr } from '../core/math.js';
import { GLOW_LAYER } from './post.js';
import { PM } from '../player/player.js';
import { curId, suppressed, W, W8 } from '../game/run-state.js';
import { gunMeshes, MUZ, X } from '../weapons/gun-materials.js';
import { addMat, TEX_CORE, TEX_MUZZLE, TEX_STAR, TEX_STARS, TEX_TONGUE } from './textures.js';
import { smoke } from './smoke.js';
import { holdOf } from '../player/hold.js';

export const flash = new THREE.Group();
flash.visible = false;
// a hot core, a star that faces you, and two crossed flame tongues along the barrel (one of the muzzle sprites each
// shot, so no two flashes look alike)
export const flashCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_CORE, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
export const flashStar = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_STAR, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
const tongueG = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2);
// grows along +z from the muzzle
export const tongueA = new THREE.Mesh(tongueG, addMat(TEX_TONGUE)), tongueB = new THREE.Mesh(tongueG, addMat(TEX_TONGUE));
tongueB.rotation.z = Math.PI / 2;
flash.add(flashCore, flashStar, tongueA, tongueB); flash.userData.isFlash = true;
[flashCore, flashStar, tongueA, tongueB].forEach(o => o.layers.enable(GLOW_LAYER));   // (it blooms: effects/post.js)
PM.upper.add(flash);
export let flashSize = 1, flashLen = 1, flashWide = 1, flashLife = 0.055;
// each kind of gun's flash (flashLook): size, its core and star; len and wide, its flame tongues' length and width;
// life, how long it shows; vary, how much each shot's differs. A 9mm's a small quick star; a magnum round a fat
// fireball; a rifle round a long narrow tongue; a shotgun a broad burst; a gun on full auto short, flickering flashes
// that change a lot from shot to shot
const FLASH_LOOK = {
  p9: { size: 0.85, len: 0.75, wide: 0.9, life: 0.045, vary: 0.15 },
  p10: { size: 1.0, len: 0.9, wide: 1.05, life: 0.05, vary: 0.16 },   // (10mm Auto: a hotter load, a bigger flash)
  magnum: { size: 1.4, len: 0.95, wide: 1.4, life: 0.065, vary: 0.2 },
  rifle: { size: 1.1, len: 1.75, wide: 0.75, life: 0.055, vary: 0.15 },
  shells: { size: 1.55, len: 1.25, wide: 1.65, life: 0.07, vary: 0.2 },
  auto: { size: 0.95, len: 1.2, wide: 0.85, life: 0.035, vary: 0.4 }
};
export const flashLook = (D, auto) => auto && D.ammo !== 'shells' ? FLASH_LOOK.auto : FLASH_LOOK[D.ammo] || FLASH_LOOK.p9;
// after a heavy shot a thin wisp keeps curling up off the muzzle a moment (MUZ_WISP: how long, how often a puff of it,
// how thick at most), following the gun as you move and aim, and thinning out as it goes
const MUZ_WISP = { t: 1.1, every: 0.07, a: 0.16 };
let wispT = 0, wispK = 0, wispAcc = 0;
export function muzzleWisp(k) { wispK = Math.min(1.4, (wispT > 0 ? wispK : 0) + k); wispT = MUZ_WISP.t; }
export function updateMuzzleWisp(rdt) {
  if (wispT <= 0) return;
  wispT -= rdt; if ((wispAcc -= rdt) > 0) return; wispAcc = MUZ_WISP.every;
  const D = W(curId()), g = gunMeshes[W8.cur]; if (!D || D.melee || !g || !g.visible || suppressed(D)) { wispT = 0; return; }
  const m = muzzleWorld(), f = Math.max(0, wispT / MUZ_WISP.t);
  smoke(m.x, m.y + 0.01, m.z, rr(-0.05, 0.05), rr(0.25, 0.45), rr(-0.05, 0.05), 0.025, 0.2 * wispK, rr(0.9, 1.4), MUZ_WISP.a * f * Math.min(1, wispK), 0xb8b0a4);
}
// the colour of a gun's flash by what it fires, and so of the light it throws and the smoke round the muzzle while
// that light lasts (smokeLight, effects/smoke.js): a pistol's warm yellow, a rifle round's paler hotter yellow, a
// shotgun's orange, a dragon's breath shell's deep orange
export const FLASH_COL = { p9: 0xffc25a, p10: 0xffb44e, magnum: 0xffae48, rifle: 0xffd27c, shells: 0xffa040, dragon: 0xff6418 };
const _fcol = new THREE.Color(), _fwhite = new THREE.Color(0xffffff);
// dress the flash for this shot: its sprites and colour; gives the colour as [r, g, b] for the light it throws
export function flashDress(D) {
  const h = D.dragon ? FLASH_COL.dragon : FLASH_COL[D.ammo] || FLASH_COL.p9;
  flashStar.material.map = pick(TEX_STARS); tongueA.material.map = pick(TEX_MUZZLE); tongueB.material.map = pick(TEX_MUZZLE);
  flashCore.material.color.setHex(h).lerp(_fwhite, 0.45); flashStar.material.color.setHex(h).lerp(_fwhite, 0.2); tongueA.material.color.setHex(h); tongueB.material.color.setHex(h);
  return flashRGB(h);
}
export const flashRGB = h => { _fcol.setHex(h); const m = Math.max(_fcol.r, _fcol.g, _fcol.b); return [_fcol.r / m, _fcol.g / m, _fcol.b / m]; };
// where the visible muzzle is right now, following the gun through recoil and aim-down
const _mz = new V3();
export function muzzleWorld(sideSign) {
  const D = W(curId()), side = D && D.akimbo && (sideSign || W8.akSide) < 0 ? 'L' : 'R', h = holdOf(W8.cur, side);
  h.updateWorldMatrix(true, false);   // (the hold and what it hangs from, not the whole of you: this is asked for several times a frame)
  _mz.set(X, GUN_Y + 0.03, (MUZ[W8.cur] || 0.9) + 0.02); h.localToWorld(_mz); return _mz;
}
export let flashT = 0;

// setters for the variables above that other files change (an imported variable can only be read)
export function setFlashSize(v) { return (flashSize = v); }
export function setFlashLen(v) { return (flashLen = v); }
export function setFlashWide(v) { return (flashWide = v); }
export function setFlashLife(v) { return (flashLife = v); }
export function setFlashT(v) { return (flashT = v); }
