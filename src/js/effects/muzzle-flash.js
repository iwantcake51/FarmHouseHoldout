// Muzzle flash and the live muzzle position.

const flash = new THREE.Group();
flash.visible = false;
const flashCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_CORE, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
const flashStar = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_STAR, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
const tongueG = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2);
// grows along +z from the muzzle
const tongueA = new THREE.Mesh(tongueG, addMat(TEX_TONGUE)), tongueB = new THREE.Mesh(tongueG, addMat(TEX_TONGUE));
tongueB.rotation.z = Math.PI / 2;
flash.add(flashCore, flashStar, tongueA, tongueB);
PM.upper.add(flash);
let flashSize = 1, flashLen = 1;
// where the visible muzzle is right now, following the gun through recoil and aim-down
const _mz = new V3();
function muzzleWorld(sideSign) {
  const D = W(curId()), gg = gunMeshes[W8.cur]; PM.g.updateMatrixWorld(true);
  _mz.set(D && D.akimbo ? AKX * (sideSign || W8.akSide) : X, GUN_Y + 0.03, (MUZ[W8.cur] || 0.9) + 0.02); gg.localToWorld(_mz); return _mz;
}
let flashT = 0;
