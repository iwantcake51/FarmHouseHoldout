// Weapons you aren't holding, carried on your body: the sidearm in a thigh holster, long guns slung across the
// backpack, the melee weapon through the pack straps; and the planks you carry, strapped to the back of the pack.

// each stowed weapon is a copy of its held model (shared geometry and materials), rebuilt whenever the guns are
const STOW = {}, stowSw = { x: 0, vx: 0, z: 0, vz: 0 };
// where each slot rides: the parent part, the mount point and how the weapon is turned there
const STOW_AT = {
  side: { part: () => PM.legR, pos: [0.13, -0.13, 0.02], rot: [Math.PI / 2, 0, 0.05], pivot: id => (HOLD[id] || HOLD_DEF).grip },
  long: { part: () => PM.upper, pos: [0, 0.94, -0.42], rot: [-Math.PI / 2, 0, 0.62], pivot: () => [X, 1.1, 0.72] },
  auto: { part: () => PM.upper, pos: [0, 0.94, -0.47], rot: [-Math.PI / 2, 0, -0.62], pivot: () => [X, 1.1, 0.72] },
  melee: { part: () => PM.upper, pos: [-0.24, 1.2, -0.33], rot: [0, 0, Math.PI - 0.12], pivot: () => [0, 0.05, 0] }
};
const HOLSTER_M = lam(0x3a2c20), STRAP_M = lam(0x2c2620);
function buildStow() {
  for (const s in STOW) { const o = STOW[s]; if (o && o.parent) o.parent.remove(o); delete STOW[s]; }
  for (const s of SLOTS) {
    const id = W8.slot[s]; if (!id) continue;
    const at = STOW_AT[s], copy = gunMeshes[s].clone(true);
    // drop the muzzle flash and the second akimbo pistol, and put everything back to its rest pose
    copy.traverse(o => { for (let k = o.children.length - 1; k >= 0; k--) { const c = o.children[k]; if (c.userData.isFlash || c.userData.side === 'L') o.remove(c); } });
    copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0); copy.visible = true;
    copy.children.forEach(h => { if (h.userData.side) { h.position.set(h.userData.x0 || 0, 0, 0); h.rotation.set(0, 0, 0); h.visible = true; } });
    const outer = new THREE.Group(), inner = new THREE.Group(), pv = at.pivot(id);
    outer.position.set(...at.pos); inner.rotation.set(...at.rot); copy.position.set(-pv[0], -pv[1], -pv[2]);
    inner.add(copy); outer.add(inner); at.part().add(outer);
    // a leather holster round the sidearm, a strap across the pack for slung guns
    if (s === 'side') box(outer, 0.075, 0.24, 0.13, HOLSTER_M, 0.0, -0.13, -0.02);
    else if (s !== 'melee') box(outer, 0.44, 0.035, 0.03, STRAP_M, 0, 0.02, 0.05).rotation.z = at.rot[2];
    outer.userData.slot = s; STOW[s] = outer;
  }
}
// planks strapped flat across the back of the pack: none, one, two, or a stack of three once you carry 3 or more
const plankStack = [];
{
  const g = new THREE.Group(); g.position.set(0, 0, -0.355); PM.upper.add(g);
  [[0.8, 0.04, M.board], [0.935, -0.05, M.board2], [1.07, 0.03, M.board]].forEach(([y, tilt, mat], k) => {
    const p = box(g, 0.6, 0.12, 0.04, mat, k === 1 ? 0.03 : -0.02, y, -0.005 * k); p.rotation.z = tilt;
    for (let n = 0; n < 2; n++) box(p, 0.012, 0.125, 0.045, M.metal, -0.22 + n * 0.44, 0, 0);   // nails at the ends
    p.visible = false; plankStack.push(p);
  });
  plankStack.strap = box(g, 0.05, 0.42, 0.06, STRAP_M, 0.16, 0.94, -0.02); plankStack.strap.visible = false;
}
// every frame: show what's stowed, and let it swing a little with your steps and your changes of pace
function updateStow(rdt) {
  if (stowDirty) { stowDirty = false; buildStow(); }
  const held = W8.cur, spd = Math.hypot(P.vx, P.vz), runF = clamp(spd / 4.1, 0, 1.2);
  // the swing follows your velocity in the body's frame: speeding up swings it back, strafing swings it aside
  const c = Math.cos(ANIM.yaw), sn = Math.sin(ANIM.yaw), fwd = P.vx * sn + P.vz * c, lat = P.vx * c - P.vz * sn;
  const tx = -fwd * 0.035 + Math.sin(P.phase * 2) * 0.05 * Math.min(1, runF), tz = lat * 0.04 + Math.sin(P.phase) * 0.04 * Math.min(1, runF);
  for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++) {
    stowSw.vx += (-60 * (stowSw.x - tx) - 5 * stowSw.vx) * dt; stowSw.x += stowSw.vx * dt;
    stowSw.vz += (-60 * (stowSw.z - tz) - 5 * stowSw.vz) * dt; stowSw.z += stowSw.vz * dt;
  }
  for (const s in STOW) {
    const o = STOW[s]; o.visible = s !== held && !P.dead;
    if (!o.visible) continue;
    if (s === 'side') o.rotation.set(stowSw.x * 0.6, 0, -Math.abs(stowSw.z) * 0.3);   // the holster rides the thigh and rocks fore and aft
    else o.rotation.set(stowSw.x * 0.5, 0, stowSw.z * 0.8);                            // slung guns and the melee weapon swing about the straps
  }
  const n = Math.min(3, S.planks | 0);
  plankStack.forEach((p, k) => { p.visible = k < n; }); plankStack.strap.visible = n > 0;
  plankStack[0].parent.rotation.set(stowSw.x * 0.15, 0, stowSw.z * 0.2);
}
