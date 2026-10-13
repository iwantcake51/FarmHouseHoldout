// Weapons you aren't holding, carried on your body: the sidearm in a thigh holster, long guns slung across the
// backpack, the melee weapon through the pack straps; the planks you carry, strapped to the back of the pack; and the
// backpack's own swing.

// each stowed weapon is a copy of its held model (shared geometry and materials), rebuilt whenever the guns are
const STOW = {}, stowSw = { x: 0, vx: 0, z: 0, vz: 0 };
// where each slot rides: the parent part, the mount point and how the weapon is turned there
const STOW_AT = {
  side: { part: () => PM.legR, pos: [0.13, -0.13, 0.02], rot: [Math.PI / 2, 0, 0.05], pivot: id => (HOLD[id] || HOLD_DEF).grip },
  long: { part: () => packBody, pos: [0, 0.94, -0.42], rot: [-Math.PI / 2, 0, 0.62], pivot: () => [X, 1.1, 0.72] },
  auto: { part: () => packBody, pos: [0, 0.94, -0.47], rot: [-Math.PI / 2, 0, -0.62], pivot: () => [X, 1.1, 0.72] },
  melee: { part: () => packBody, pos: [-0.24, 1.2, -0.33], rot: [0, 0, Math.PI - 0.12], pivot: () => [0, 0.05, 0] }
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
// planks strapped flat across the back of the pack, one for each you carry up to five: three side by side against the
// pack, then two more laid crosswise over them under a second strap
const plankStack = [];
{
  const g = new THREE.Group(); g.position.set(0, 0, -0.355); packBody.add(g);
  [[0.8, 0.04, M.board, 0, -0.02], [0.935, -0.05, M.board2, 0, 0.03], [1.07, 0.03, M.board, 0, -0.02], [0.87, -0.11, M.board2, 1, 0.01], [1.0, 0.09, M.board, 1, -0.01]].forEach(([y, tilt, mat, layer, x], k) => {
    const p = box(g, 0.6 - layer * 0.04, 0.12, 0.04, mat, x, y, -0.005 * (k % 3) - layer * 0.046); p.rotation.z = tilt;
    for (let n = 0; n < 2; n++) box(p, 0.012, 0.125, 0.045, M.metal, -0.22 + n * 0.44, 0, 0);   // nails at the ends
    p.visible = false; plankStack.push(p);
  });
  plankStack.strap = box(g, 0.05, 0.42, 0.063, STRAP_M, 0.16, 0.94, -0.02); plankStack.strap.visible = false;
  plankStack.strap2 = box(g, 0.05, 0.34, 0.028, STRAP_M, -0.15, 0.94, -0.08); plankStack.strap2.visible = false;
}
// the backpack hangs from the tops of its shoulder straps and swings on its own, like a real one: it bounces a beat
// behind each step, lags back as you set off and swings on as you pull up, rocks with your stride and out to the side
// when you cut across, and trails a turn before swinging round after you. It can swing out from your back but not into
// it, so pulling up it thumps back against you. Each part is a damped spring driven by how your body moves.
const packSw = { y: 0, vy: 0, rx: 0, vrx: 0, rz: 0, vrz: 0, ry: 0, vry: 0, yaw: null, turn: 0 };
const PACK_SW = { bounce: 0.03, back: 0.24, into: 0.025, side: 0.16, twist: 0.13 };
function updatePack(dt) {
  const q = packSw, L = PACK_SW;
  if (dt > 0) {
    const on = !P.dead, run1 = clamp(Math.hypot(P.vx, P.vz) / 4.1, 0, 1);
    // how your body is speeding up, forward and sideways, and turning (ANIM.ax/az are set in player/animation.js)
    const sy = Math.sin(ANIM.yaw), cy = Math.cos(ANIM.yaw), ax = on ? ANIM.ax || 0 : 0, az = on ? ANIM.az || 0 : 0;
    const aF = ax * sy + az * cy, aS = ax * cy - az * sy;
    if (q.yaw === null) q.yaw = ANIM.yaw;
    q.turn += (clamp(angDiff(ANIM.yaw, q.yaw) / dt, -12, 12) * (on ? 1 : 0) - q.turn) * Math.min(1, dt * 12); q.yaw = ANIM.yaw;
    const stride = on ? Math.sin(P.phase) * run1 * ANIM.legDir : 0, chest = PM.upper.position.y;
    for (let n = Math.ceil(dt / (1 / 120)), h = dt / Math.max(1, n), i = 0; i < n; i++) {
      // up and down: it rides your chest on a soft spring, so it lags each bob and bounces on past it
      q.vy += (-170 * (q.y - chest) - 6 * q.vy) * h; q.y += q.vy * h;
      const rel = q.y - chest; if (Math.abs(rel) > L.bounce) { q.y = chest + Math.sign(rel) * L.bounce; q.vy *= 0.4; }
      // fore and aft: back as you speed up, on past you as you slow, and the bottom kicks out as it drops onto a step
      q.vrx += (-95 * q.rx - 6.5 * q.vrx + aF * 0.55 - rel * 260) * h; q.rx += q.vrx * h;
      if (q.rx < -L.into) { q.rx = -L.into; if (q.vrx < 0) q.vrx *= -0.25; } else if (q.rx > L.back) { q.rx = L.back; if (q.vrx > 0) q.vrx = 0; }
      // side to side: rocks once a stride and swings out when you cut across
      q.vrz += (-90 * q.rz - 6 * q.vrz - aS * 0.35 + stride * 5.5) * h; q.rz = clamp(q.rz + q.vrz * h, -L.side, L.side);
      // round: it trails a turn, then swings round after you
      q.vry += (-110 * (q.ry + clamp(q.turn * 0.02, -L.twist, L.twist)) - 9 * q.vry) * h; q.ry += q.vry * h;
    }
  }
  packPivot.position.y = PACK_PIV[1] + clamp(q.y - PM.upper.position.y, -L.bounce, L.bounce);
  packPivot.rotation.set(q.rx, q.ry, q.rz);
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
    const o = STOW[s]; o.visible = (s !== held || !!P.vault) && !P.dead;   // the weapon in your hands goes back on you while you vault
    if (!o.visible) continue;
    if (s === 'side') o.rotation.set(stowSw.x * 0.6, 0, -Math.abs(stowSw.z) * 0.3);   // the holster rides the thigh and rocks fore and aft
    else o.rotation.set(stowSw.x * 0.5, 0, stowSw.z * 0.8);                            // slung guns and the melee weapon swing about the straps
  }
  const n = Math.min(plankStack.length, S.planks | 0);
  plankStack.forEach((p, k) => { p.visible = k < n; }); plankStack.strap.visible = n > 0; plankStack.strap2.visible = n > 3;
  plankStack[0].parent.rotation.set(stowSw.x * 0.15, 0, stowSw.z * 0.2);
}
