// Laser sight beam.

const laser = new THREE.Mesh(new THREE.BoxGeometry(1, 0.018, 0.018), new THREE.MeshBasicMaterial({ color: 0xff3a24, transparent: true, opacity: 0.55, depthWrite: false }));
const laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), basic(0xff5a3a));
laser.visible = laserDot.visible = false;
scene.add(laser, laserDot);
// the laser sight beam, following the exact bullet line
function updateLaser(D) {
  // laser follows exactly the line the bullets take
  const gunOut = !scoped && state === 'play' && T('laser') > 0 && !D.melee && !P.vault && !W8.reloading;
  laser.visible = laserDot.visible = gunOut;
  if (gunOut) {
    const mz = muzzle(D.akimbo ? 1 : 0), dx = Math.sin(mz.a), dz = Math.cos(mz.a);
    const L = aimRay(mz.ox, mz.oz, mz.a, 18).L;
    laser.position.set(mz.ox + dx * L / 2, GUN_Y, mz.oz + dz * L / 2); laser.scale.set(L, T('laser') === 2 ? 1.3 : 0.8, T('laser') === 2 ? 1.3 : 0.8); laser.rotation.set(0, -Math.atan2(dz, dx), 0);
    laser.material.opacity = T('laser') === 2 ? 0.65 : 0.4;
    laserDot.position.set(mz.ox + dx * L, GUN_Y, mz.oz + dz * L);
  }
}
