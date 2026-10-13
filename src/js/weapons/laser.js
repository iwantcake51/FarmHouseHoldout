// Laser sight beam: from the laser's lens on the gun to the point the bullets go, at the height you're aiming at.

const laser = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 1).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xff3a24, transparent: true, opacity: 0.55, depthWrite: false }));
const laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), basic(0xff5a3a));
laser.visible = laserDot.visible = false;
scene.add(laser, laserDot);
const _lsA = new V3(), _lsB = new V3();
function updateLaser(D) {
  const gunOut = !scoped && state === 'play' && T('laser') > 0 && !D.melee && !P.vault && !W8.reloading;
  laser.visible = laserDot.visible = gunOut;
  if (!gunOut) return;
  // the far end: along the bullets' line, as far as they'd go, at the height of what's under the crosshair
  const mz = muzzle(D.akimbo ? 1 : 0), dx = Math.sin(mz.a), dz = Math.cos(mz.a), L = aimRay(mz.ox, mz.oz, mz.a, 18).L;
  _lsB.set(mz.ox + dx * L, Math.min(GUN_Y, ANIM.aimY || GUN_Y), mz.oz + dz * L);
  // the near end: the lens of the laser on the gun in your (right) hand
  const h = HOLDS[W8.cur] && HOLDS[W8.cur].R, em = h && h.userData.laserEm;
  if (em) { em.updateWorldMatrix(true, false); em.getWorldPosition(_lsA); } else _lsA.set(mz.ox, GUN_Y, mz.oz);
  const w = T('laser') === 2 ? 1.3 : 0.8;
  laser.position.copy(_lsA); laser.lookAt(_lsB); laser.scale.set(w, w, Math.max(0.01, _lsA.distanceTo(_lsB)));
  laser.material.opacity = T('laser') === 2 ? 0.65 : 0.4;
  laserDot.position.copy(_lsB);
}
