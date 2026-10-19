// Muzzle flash and the live muzzle position.

const flash = new THREE.Group();
flash.visible = false;
// a hot core, a star that faces you, and two crossed flame tongues along the barrel (one of the muzzle sprites each
// shot, so no two flashes look alike)
const flashCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_CORE, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
const flashStar = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_STAR, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
const tongueG = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2);
// grows along +z from the muzzle
const tongueA = new THREE.Mesh(tongueG, addMat(TEX_TONGUE)), tongueB = new THREE.Mesh(tongueG, addMat(TEX_TONGUE));
tongueB.rotation.z = Math.PI / 2;
flash.add(flashCore, flashStar, tongueA, tongueB); flash.userData.isFlash = true;
PM.upper.add(flash);
let flashSize = 1, flashLen = 1;
// the colour of a gun's flash by what it fires, and so of the light it throws and the smoke round the muzzle while
// that light lasts (smokeLight, effects/smoke.js): a pistol's warm yellow, a rifle round's paler hotter yellow, a
// shotgun's orange, a dragon's breath shell's deep orange
const FLASH_COL = { p9: 0xffc25a, magnum: 0xffae48, rifle: 0xffd27c, shells: 0xffa040, dragon: 0xff6418 };
const _fcol = new THREE.Color(), _fwhite = new THREE.Color(0xffffff);
// dress the flash for this shot: its sprites and colour; gives the colour as [r, g, b] for the light it throws
function flashDress(D) {
  const h = D.dragon ? FLASH_COL.dragon : FLASH_COL[D.ammo] || FLASH_COL.p9;
  flashStar.material.map = pick(TEX_STARS); tongueA.material.map = pick(TEX_MUZZLE); tongueB.material.map = pick(TEX_MUZZLE);
  flashCore.material.color.setHex(h).lerp(_fwhite, 0.45); flashStar.material.color.setHex(h).lerp(_fwhite, 0.2); tongueA.material.color.setHex(h); tongueB.material.color.setHex(h);
  return flashRGB(h);
}
const flashRGB = h => { _fcol.setHex(h); const m = Math.max(_fcol.r, _fcol.g, _fcol.b); return [_fcol.r / m, _fcol.g / m, _fcol.b / m]; };
// where the visible muzzle is right now, following the gun through recoil and aim-down
const _mz = new V3();
function muzzleWorld(sideSign) {
  const D = W(curId()), side = D && D.akimbo && (sideSign || W8.akSide) < 0 ? 'L' : 'R'; PM.g.updateMatrixWorld(true);
  _mz.set(X, GUN_Y + 0.03, (MUZ[W8.cur] || 0.9) + 0.02); holdOf(W8.cur, side).localToWorld(_mz); return _mz;
}
let flashT = 0;
