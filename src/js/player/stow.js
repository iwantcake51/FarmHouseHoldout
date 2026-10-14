// Weapons you aren't holding, carried on your body: the sidearm in a holster on your right hip, a long gun flat
// against the pack's left side and an automatic on a slant across its back, the melee weapon through the straps at
// its right edge; the planks you carry, strapped to the back of the pack; and the backpack's own swing.

// each stowed weapon is a copy of its held model (shared geometry and materials), rebuilt whenever the guns are
const STOW = {}, stowSw = { x: 0, vx: 0, z: 0, vz: 0 };
// how a gun is turned to lie against the pack: its barrel along d, its top facing u (its left side then faces u x d)
function packQ(d, u) { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3().crossVectors(u, d), u, d)); }
// where each slot rides: the parent part, the mount point and how the weapon is turned there (seen from behind, the
// pack's left is the side the long gun is on; the melee weapon is at its right edge). The long gun lies flat against
// the pack's left side, upright and barrel down, its left side to the canvas (over the bottle in the side pocket),
// its top facing back and the butt standing a little above the pack; the automatic lies against the back on a slant,
// muzzle up and leaning toward the long gun's side, its left side to the canvas. pivot is the point on the model at
// the mount (bb: the model's bounds)
const STOW_TILT = 0.45;
const STOW_AT = {
  side: { part: () => PM.upper, pos: [0.3, 0.6, 0.02], rot: [Math.PI / 2, 0, 0.05], pivot: id => (HOLD[id] || HOLD_DEF).grip },
  long: { part: () => packBody, pos: [0.295, 1.1, -0.24], q: packQ(new V3(0, -1, 0), new V3(0, 0, -1)), pivot: (id, bb) => [X, (bb.min.y + bb.max.y) / 2, bb.min.z + 0.4] },
  auto: { part: () => packBody, pos: [0, 0.93, -0.36], q: packQ(new V3(Math.sin(STOW_TILT), Math.cos(STOW_TILT), 0), new V3(Math.cos(STOW_TILT), -Math.sin(STOW_TILT), 0)), pivot: (id, bb) => [X, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2] },
  melee: { part: () => packBody, pos: [-0.24, 1.2, -0.33], rot: [0, 0, Math.PI - 0.12], pivot: () => [0, 0.05, 0] }
};
// how far out from the pack's back the automatic sits (its centre line): over the planks strapped there (a first
// layer and its strap, then a second), and over the melee weapon its lower end crosses
const plankOff = () => { const n = Math.min(5, S.planks | 0); return n > 3 ? 0.12 : n ? 0.077 : 0; };
const packZ = () => (W8.slot.melee ? -0.4 : -0.36) - plankOff();
const HOLSTER_M = lam(0x1d1d1f), HOOD_M = lam(0x141415), STRAP_M = lam(0x2c2620), BELT_M = lam(0x19191a), SNAP_M = lam(0x2e2f31), BUCKLE_M = lam(0x8a8d90);
// a black duty holster, moulded round each sidearm (in the gun's own frame): rear and top of the shell, its closed
// front, the bore line, the trigger guard it covers (gz along the gun, gb its bottom), the mouth's lower corner where
// it follows the front of the grip, and its width
const HOLSTER_FIT = {
  pistol: { rear: 0.566, top: 1.168, front: 0.852, bore: 1.142, gz: [0.652, 0.738], gb: 1.046, mouth: [0.566, 1.128], w: 0.05 },
  deagle: { rear: 0.55, top: 1.197, front: 0.924, bore: 1.16, gz: [0.641, 0.727], gb: 1.054, mouth: [0.55, 1.124], w: 0.054 },
  revolver: { rear: 0.55, top: 1.182, front: 0.86, bore: 1.152, gz: [0.574, 0.634], gb: 1.034, mouth: [0.55, 1.128], w: 0.066 }
};
let beltPieces = [];
// the holster: the moulded shell (closed over the slide, the trigger guard and the muzzle, open at the mouth where the
// grip comes out), the retention hood over the back of the slide with its snap, a second snap low on the shell, and
// on the body side a paddle and the loop that holds it on the belt (pv: the gun's grip point, where the belt runs)
function buildHolster(parent, id, pv, muz) {
  const F = HOLSTER_FIT[id]; if (!F) { box(parent, 0.075, 0.24, 0.13, HOLSTER_M, 0.0, -0.13, -0.02); return; }
  const g = new THREE.Group(); g.position.set(-pv[0], -pv[1], -pv[2]); parent.add(g);
  const fr = Math.max(F.front, Math.min((muz || 0) - 0.012, F.front + 0.12)), w = F.w, t = F.top, b = F.bore, [z0, z1] = F.gz, x0 = X;
  solid(g, [[F.rear, t], [fr - 0.014, t], [fr, t - 0.012], [fr + 0.002, b - 0.028], [fr - 0.012, b - 0.042], [z1 + 0.03, b - 0.046], [z1 + 0.006, F.gb + 0.012], [z1 - 0.006, F.gb], [z0 + 0.012, F.gb], [z0, F.gb + 0.01], [F.mouth[0] + 0.012, F.mouth[1] - 0.006], F.mouth], w, HOLSTER_M, x0, 0.009);
  // the hood: a strap up over the back of the slide and down both sides, its tab on the outside with the snap
  const h0 = F.rear + 0.008, h1 = F.rear + 0.04;
  solid(g, [[h0, t + 0.009], [h1, t + 0.009], [h1 + 0.004, t - 0.03], [h0 - 0.004, t - 0.03]], w + 0.008, HOOD_M, x0, 0.004);
  cyl(g, 0.0065, 0.004, SNAP_M, x0 + w / 2 + 0.005, t - 0.017, (h0 + h1) / 2, 14).rotation.set(0, 0, Math.PI / 2);
  cyl(g, 0.0055, 0.003, SNAP_M, x0 + w / 2 + 0.0015, b - 0.012, z1 + 0.03, 14).rotation.set(0, 0, Math.PI / 2);
  // the paddle against your hip and the loop round the belt (the belt runs at the grip point: pv[2] along the gun)
  solid(g, [[F.rear - 0.012, t + 0.006], [F.rear + 0.075, t + 0.006], [F.rear + 0.08, F.gb + 0.03], [F.rear - 0.008, F.gb + 0.02]], 0.006, HOOD_M, x0 - w / 2 - 0.002, 0.002);
  box(g, 0.026, t - F.gb, 0.05, HOOD_M, x0 - w / 2 - 0.016, (t + F.gb) / 2, pv[2]);
}
// the belt round your waist the holster hangs on, with its buckle, while you carry a sidearm (drawn or not)
function buildBelt(on) {
  beltPieces.forEach(o => o.parent && o.parent.remove(o)); beltPieces = [];
  if (!on) return;
  beltPieces.push(box(PM.upper, 0.512, 0.05, 0.312, BELT_M, 0, 0.6, 0), box(PM.upper, 0.07, 0.054, 0.008, BUCKLE_M, 0, 0.6, 0.158), box(PM.upper, 0.05, 0.034, 0.01, BELT_M, 0, 0.6, 0.16));
}
function buildStow() {
  for (const s in STOW) { const o = STOW[s]; if (o && o.parent) o.parent.remove(o); delete STOW[s]; }
  buildBelt(!!W8.slot.side);
  for (const s of SLOTS) {
    const id = W8.slot[s]; if (!id) continue;
    const at = STOW_AT[s], copy = gunMeshes[s].clone(true);
    // drop the muzzle flash and the second akimbo pistol, and put everything back to its rest pose
    copy.traverse(o => { for (let k = o.children.length - 1; k >= 0; k--) { const c = o.children[k]; if (c.userData.isFlash || c.userData.side === 'L') o.remove(c); } });
    copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0); copy.visible = true;
    copy.children.forEach(h => { if (h.userData.side) { h.position.set(h.userData.x0 || 0, 0, 0); h.rotation.set(0, 0, 0); h.visible = true; } });
    copy.updateMatrixWorld(true); const outer = new THREE.Group(), inner = new THREE.Group(), pv = at.pivot(id, new THREE.Box3().setFromObject(copy));
    outer.position.set(...at.pos); if (at.q) inner.quaternion.copy(at.q); else inner.rotation.set(...at.rot); copy.position.set(-pv[0], -pv[1], -pv[2]);
    inner.add(copy); outer.add(inner); at.part().add(outer);
    // a leather holster round the sidearm, a strap across the pack for slung guns
    if (s === 'side') buildHolster(inner, id, pv, MUZ[s]);
    else if (s === 'long') [-0.04, -0.34].forEach(y => box(outer, 0.115, 0.03, 0.17, STRAP_M, -0.028, y, 0));   // two straps round it to the side of the pack
    else if (s === 'auto') box(outer, 0.5, 0.035, 0.06, STRAP_M, 0, 0.02, 0.012).rotation.z = -STOW_TILT * 0.4;   // a strap across it, holding it to the pack
    const sls = []; copy.traverse(o => { if (o.userData.slideRest) sls.push(o); }); outer.userData.slides = sls; outer.userData.id = id;
    outer.userData.slot = s; outer.userData.gun = copy; STOW[s] = outer;
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
const PACK_SW = { bounce: 0.03, back: 0.24, into: 0.025, side: 0.16, twist: 0.3, turn: 0.055, fling: 0.012 };
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
      // side to side: rocks once a stride, swings out when you cut across, and is flung outward as you turn
      q.vrz += (-90 * q.rz - 6 * q.vrz - aS * 0.35 + stride * 5.5 + q.turn * Math.abs(q.turn) * L.fling * 6) * h; q.rz = clamp(q.rz + q.vrz * h, -L.side, L.side);
      // round: it trails a turn (even a slow one), then swings round after you and on past before it settles
      q.vry += (-110 * (q.ry + clamp(q.turn * L.turn, -L.twist, L.twist)) - 7 * q.vry) * h; q.ry += q.vry * h;
    }
  }
  packPivot.position.y = PACK_PIV[1] + clamp(q.y - PM.upper.position.y, -L.bounce, L.bounce);
  packPivot.rotation.set(q.rx, q.ry, q.rz);
}
// show or hide a stowed weapon; the holster stays on your hip, empty, while the sidearm is out
function showStowed(s, on) { const o = STOW[s]; if (!o) return; o.userData.gun.visible = on; o.visible = (on || s === 'side') && !P.dead; }
// every frame: show what's stowed, and let it swing a little with your steps and your changes of pace
function updateStow(rdt) {
  if (stowDirty) { stowDirty = false; buildStow(); }
  const held = W8.cur, spd = Math.hypot(P.vx, P.vz), runF = clamp(spd / 4.1, 0, 1.2);
  // the swing follows your velocity in the body's frame: speeding up swings it back, strafing swings it aside
  const c = Math.cos(ANIM.yaw), sn = Math.sin(ANIM.yaw), fwd = P.vx * sn + P.vz * c, lat = P.vx * c - P.vz * sn;
  // turning flings them out sideways (packSw.turn is how fast you're turning, from updatePack)
  const tx = -fwd * 0.035 + Math.sin(P.phase * 2) * 0.05 * Math.min(1, runF), tz = lat * 0.04 + Math.sin(P.phase) * 0.04 * Math.min(1, runF) + clamp(packSw.turn * 0.035, -0.3, 0.3);
  for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++) {
    stowSw.vx += (-60 * (stowSw.x - tx) - 5 * stowSw.vx) * dt; stowSw.x += stowSw.vx * dt;
    stowSw.vz += (-60 * (stowSw.z - tz) - 5 * stowSw.vz) * dt; stowSw.z += stowSw.vz * dt;
  }
  for (const s in STOW) {
    // the weapon in your hands goes back on you while you vault
    const o = STOW[s], stowed = s !== held || (!!P.vault && !vaultGun()) || ANIM.bandP >= 1; showStowed(s, stowed);
    if (!o.visible) continue;
    if (s === 'side') {
      o.rotation.set(stowSw.x * 0.6, 0, -Math.abs(stowSw.z) * 0.3);   // the holster rides the hip and rocks fore and aft
      if (stowed && SLIDE_PISTOLS[o.userData.id]) { const back = slideLocked(o.userData.id) ? 1 : 0; o.userData.slides.forEach(m => { const r = m.userData.slideRest; m.position.z = r.z0 - r.travel * back; m.updateMatrix(); }); }   // an empty pistol goes in with its slide locked back
    }
    else o.rotation.set(stowSw.x * 0.5, 0, stowSw.z * 0.8);                            // slung guns and the melee weapon swing about the straps
    if (s === 'auto') o.position.z = packZ();
  }
  const n = Math.min(plankStack.length, S.planks | 0);
  plankStack.forEach((p, k) => { p.visible = k < n; }); plankStack.strap.visible = n > 0; plankStack.strap2.visible = n > 3;
  plankStack[0].parent.rotation.set(stowSw.x * 0.15, 0, stowSw.z * 0.2);
}
