// Weapons you aren't holding, carried on your body: the sidearm in a holster on your right hip (a pair of them in a
// shoulder rig, one under each arm), a long gun flat
// against the pack's left side and an automatic on a slant across its back, the melee weapon through the straps at
// its right edge; the planks you carry, strapped to the back of the pack; and the backpack's own swing.

import { FP_CAM, ISO_CAM, sun, V3 } from '../core/renderer.js';
import { angDiff, clamp } from '../core/math.js';
import { lam } from '../core/shaders.js';
import { binModel, box } from '../core/geometry.js';
import { M } from '../world/materials.js';
import { P, PACK_PIV, packBody, packPivot, PM } from './player.js';
import { LOOK, shade } from './look.js';
import { SLOTS } from '../weapons/slots.js';
import { S, W, W8 } from '../game/run-state.js';
import { gunMeshes, HOLDS, MUZ, setStowDirty, stowDirty, X } from '../weapons/gun-materials.js';
import { cyl, solid } from '../weapons/gun-parts.js';
import { EJECT } from '../weapons/casings.js';
import { METAL, plankTint } from '../barricades/planks.js';
import { vaultHold } from './vaulting.js';
import { akMags } from '../weapons/akimbo.js';
import { WALK_SPEED } from './sprint.js';
import { ANIM } from './animation.js';
import { HOLD, HOLD_DEF } from './hold.js';
import { BOLT_TURN } from './hold-kick.js';
import { bipodSway } from './hold-sway.js';

// each stowed weapon is a copy of its held model (shared geometry and materials), rebuilt whenever the guns are
export const STOW = {}, stowSw = { x: 0, vx: 0, z: 0, vz: 0 };
// what's strapped flat across the back of the pack (the planks, the automatic and the melee weapon over them) rides in
// one group, laid out in packBody's own coordinates, and swings as one piece about the straps at the top: things
// strapped over each other can't swing through each other
export const packBack = new THREE.Group(), BACK_PIV = new V3(0, 1.25, -0.34);
packBody.add(packBack);
// how a gun is turned to lie against the pack: its barrel along d, its top facing u (its left side then faces u x d)
function packQ(d, u) { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3().crossVectors(u, d), u, d)); }
// where each slot rides: the parent part, the mount point and how the weapon is turned there (seen from behind, the
// pack's left is the side the long gun is on; the melee weapon is at its right edge). The long gun lies flat against
// the pack's left side, upright and barrel down, its left side to the canvas (over the bottle in the side pocket),
// its top facing back and the butt standing a little above the pack; the automatic lies against the back on a slant,
// muzzle up and leaning toward the long gun's side, its left side to the canvas (the M60 turned over, its right side
// to the canvas, so the ammo box hangs out). pivot is the point on the model at the mount (bb: the model's bounds)
const STOW_TILT = 0.45;
export const STOW_AT = {
  side: { part: () => PM.upper, pos: [0.3, 0.6, 0.02], rot: [Math.PI / 2, 0, 0.05], pivot: id => (HOLD[id] || HOLD_DEF).grip },
  long: { part: () => packBody, pos: [0.295, 1.1, -0.24], q: packQ(new V3(0, -1, 0), new V3(0, 0, -1)), pivot: (id, bb) => [X, (bb.min.y + bb.max.y) / 2, bb.min.z + 0.4] },
  auto: { part: () => packBack, pos: [0, 0.93, -0.36], q: packQ(new V3(Math.sin(STOW_TILT), Math.cos(STOW_TILT), 0), new V3(Math.cos(STOW_TILT), -Math.sin(STOW_TILT), 0)), pivot: (id, bb) => [X, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2], flip: id => id === 'lmg' },
  melee: { part: () => packBack, pos: [-0.24, 1.2, -0.33], rot: [0, 0, Math.PI - 0.12], pivot: () => [0, 0.05, 0] }
};
// a pair of automatics: the left gun on the pack crossed over the first, slanting the other way (a pair of sidearms
// goes in the shoulder rig, STOW_RIG)
export const STOW_AK = {
  auto: { part: () => packBack, pos: [0, 0.93, -0.36], q: packQ(new V3(-Math.sin(STOW_TILT), Math.cos(STOW_TILT), 0), new V3(-Math.cos(STOW_TILT), -Math.sin(STOW_TILT), 0)), pivot: (id, bb) => [X, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2] }
};
// a pair of sidearms rides in a shoulder rig instead, one under each arm for a cross draw: the right hand's gun under
// the left arm and the left hand's under the right (player/swap.js). Each lies along your ribs on its side, muzzle back
// and dipping a little, turned out from the body a touch, the grip hanging forward and down where the other hand can
// reach it across your chest
const rigQ = sx => { const d = new V3(sx * 0.22, -0.26, -1).normalize(), u = new V3(0, 1, 0); u.addScaledVector(d, -u.dot(d)).normalize(); return packQ(d, u); };
export const STOW_RIG = {
  R: { part: () => PM.upper, pos: [-0.274, 0.86, 0.13], q: rigQ(-1), pivot: id => (HOLD[id] || HOLD_DEF).grip },
  L: { part: () => PM.upper, pos: [0.274, 0.86, 0.13], q: rigQ(1), pivot: id => (HOLD[id] || HOLD_DEF).grip }
};
// the automatic lies on whatever is under it on the pack's back: the canvas, the planks strapped there, the melee
// weapon its lower end crosses (and a pair's second gun on the first); the melee weapon lies over the planks in the same
// way (packed without them, it sits through the pack's straps). What's there is drawn into a height map, the
// furthest-out z of anything over each centimetre of the back (in packBody's frame), and the gun is pushed in until its
// nearest point touches it. Of the pack itself only the canvas counts (its own colours; the straps, buckles and bottle
// are baked into one mesh), as the straps and buckles squash under the gun
const REST = { x0: -0.45, y0: 0.35, c: 0.01, nx: 90, ny: 120 };
function restWalk(o, skip, f) { if (!o.visible || skip.has(o) || o.userData.isOutline || (o.isMesh && o.parent === packBody && o.material.vertexColors)) return; if (o.isMesh) f(o); o.children.forEach(c => restWalk(c, skip, f)); }
function restMap(skip, root = packBody) {
  const R = REST, hm = new Float32Array(R.nx * R.ny).fill(Infinity), inv = new THREE.Matrix4().copy(packBody.matrixWorld).invert(), m = new THREE.Matrix4(), a = new V3(), b = new V3(), c = new V3();
  const cell = (v, o) => Math.floor((v - o) / R.c), tri = () => {
    const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y); if (Math.abs(d) < 1e-9) return;
    const i0 = Math.max(0, cell(Math.min(a.x, b.x, c.x), R.x0)), i1 = Math.min(R.nx - 1, cell(Math.max(a.x, b.x, c.x), R.x0));
    const j0 = Math.max(0, cell(Math.min(a.y, b.y, c.y), R.y0)), j1 = Math.min(R.ny - 1, cell(Math.max(a.y, b.y, c.y), R.y0));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = R.x0 + (i + 0.5) * R.c, py = R.y0 + (j + 0.5) * R.c;
      const l1 = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / d, l2 = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const z = l1 * a.z + l2 * b.z + l3 * c.z, k = j * R.nx + i; if (z < hm[k]) hm[k] = z;
    }
  };
  restWalk(root, skip, o => {
    const g = o.geometry, pa = g.attributes.position, ix = g.index, n = ix ? ix.count : pa.count; m.multiplyMatrices(inv, o.matrixWorld);
    for (let t = 0; t + 2 < n; t += 3) {
      a.fromBufferAttribute(pa, ix ? ix.getX(t) : t).applyMatrix4(m); b.fromBufferAttribute(pa, ix ? ix.getX(t + 1) : t + 1).applyMatrix4(m); c.fromBufferAttribute(pa, ix ? ix.getX(t + 2) : t + 2).applyMatrix4(m);
      tri();
    }
  });
  return hm;
}
// a stowed weapon's points in its mount's frame, as it's turned on the pack (x, y, z flat): only its face toward the
// pack, the nearest point over each centimetre, as nothing behind that can touch first. Its faces are sampled all over,
// not just at their corners, so a long flat side can't pass over a strap or a plank's edge between two corners (kept
// with the weapon, as they don't change until it's rebuilt)
function restPts(o) {
  const near = new Map(), inv = new THREE.Matrix4().copy(o.matrixWorld).invert(), m = new THREE.Matrix4(), v = new V3(), a = new V3(), b = new V3(), c = new V3();
  const put = () => { const key = Math.round(v.x * 100) * 4096 + Math.round(v.y * 100), p = near.get(key); if (!p || v.z > p[2]) near.set(key, [v.x, v.y, v.z]); };
  restWalk(o.userData.gun, new Set(), q => {
    const pa = q.geometry.attributes.position, ix = q.geometry.index, n = ix ? ix.count : pa.count; m.multiplyMatrices(inv, q.matrixWorld);
    for (let t = 0; t + 2 < n; t += 3) {
      a.fromBufferAttribute(pa, ix ? ix.getX(t) : t).applyMatrix4(m); b.fromBufferAttribute(pa, ix ? ix.getX(t + 1) : t + 1).applyMatrix4(m); c.fromBufferAttribute(pa, ix ? ix.getX(t + 2) : t + 2).applyMatrix4(m);
      const N = Math.min(40, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.006));
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) { v.copy(a).multiplyScalar(1 - (i + j) / N).addScaledVector(b, i / N).addScaledVector(c, j / N); put(); }
    }
  });
  const out = []; near.forEach(p => out.push(p[0], p[1], p[2])); return out;
}
// how a gun lies best on what's under it: tipped end over end and rolled on its length a little, whichever leaves the
// least gap under it along its length (in 2 cm steps), then pushed in until its nearest point touches. So one crossing
// the melee weapon rests on it at one end and on the pack at the other (turn false: only pushed in or out). Returns the
// turn and how far in
function restPose(o, hm, turn = true) {
  const R = REST, pts = o.userData.pts || (o.userData.pts = restPts(o)), d = new V3(0, 0, 1).applyQuaternion(o.userData.inner.quaternion), e = new V3().crossVectors(d, new V3(0, 0, 1)).normalize();
  const q = new THREE.Quaternion(), qr = new THREE.Quaternion(), mt = new THREE.Matrix4(), v = new V3(), bins = new Map();
  let best = null;
  const T = turn ? 0.24 : 0, Rl = turn ? 0.2 : 0;
  for (let tilt = -T; tilt <= T + 1e-6; tilt += 0.06) for (let roll = -Rl; roll <= Rl + 1e-6; roll += 0.1) {
    q.setFromAxisAngle(e, tilt).multiply(qr.setFromAxisAngle(d, roll)); mt.makeRotationFromQuaternion(q);
    let sh = Infinity; bins.clear();
    for (let k = 0; k < pts.length; k += 3) {
      v.set(pts[k], pts[k + 1], pts[k + 2]).applyMatrix4(mt); const along = Math.round(v.dot(d) / 0.02); v.add(o.position);
      const i = Math.floor((v.x - R.x0) / R.c), j = Math.floor((v.y - R.y0) / R.c); if (i < 0 || j < 0 || i >= R.nx || j >= R.ny) continue;
      const s = hm[j * R.nx + i]; if (s === Infinity) continue;
      const g = s - v.z; if (g < sh) sh = g; const b = bins.get(along); if (b === undefined || g < b) bins.set(along, g);
    }
    if (sh === Infinity) continue;
    let gap = 0; bins.forEach(g => { gap += g - sh; });
    const cost = gap / bins.size + 0.02 * (Math.abs(tilt) + Math.abs(roll));
    if (!best || cost < best.cost) best = { cost, sh, q: q.clone() };
  }
  return best;
}
// lay the melee weapon over the planks, then the automatic (and a pair's second gun over it) on what's under it, with
// everything at rest; the automatic's strap reaches down to the pack either side of it
const AUTO_Z = -0.36, MELEE_Z = -0.33;
let restKey = '';   // what was last laid on the back (updateStow)
function restBack() {
  const o = STOW.auto, t = o && o.userData.twin, me = STOW.melee, rot = STOW.long && STOW.long.rotation.clone();
  const bq = packBack.quaternion.clone(), bp = packBack.position.clone();
  packBack.quaternion.identity(); packBack.position.set(0, 0, 0); if (STOW.long) STOW.long.rotation.set(0, 0, 0);
  // (each shown while it's measured, the weapon in it too: one in your hands is hidden on the pack, and measured hidden
  // it would have no shape, and stay where it was hung, under the planks)
  const vis = [o, t, me].map(q => q && [q.visible, q.userData.gun.visible]); [o, t, me].forEach(q => { if (q) q.visible = q.userData.gun.visible = true; });
  // the melee weapon only ever comes out from the pack, over the planks; without them it's left where it is
  if (me) {
    me.position.z = MELEE_Z; packBody.updateMatrixWorld(true);
    const p = restPose(me, restMap(new Set(), plankStack[0].parent), false); if (p && p.sh < 0) me.position.z += p.sh;
  }
  const lay = (g, skip) => {
    g.position.z = AUTO_Z; g.userData.inner.quaternion.copy(g.userData.q0); packBody.updateMatrixWorld(true);
    const hm = restMap(skip), p = restPose(g, hm); if (p) { g.userData.inner.quaternion.premultiply(p.q); g.position.z += p.sh; }
    return hm;
  };
  if (o) {
    const hm = lay(o, new Set([o, t].filter(Boolean))), st = o.userData.strap;
    if (st) {
      const i = Math.floor((o.position.x - REST.x0) / REST.c), j = Math.floor((o.position.y + 0.02 - REST.y0) / REST.c), s = hm[j * REST.nx + i];
      const z1 = s !== Infinity ? Math.max(0.042, s - o.position.z) : 0.042; st.scale.z = (z1 + 0.018) / 0.06; st.position.z = (z1 - 0.018) / 2;
    }
    if (t) lay(t, new Set([t]));
  }
  packBack.quaternion.copy(bq); packBack.position.copy(bp); if (rot) STOW.long.rotation.copy(rot);
  [o, t, me].forEach((q, k) => { if (q) [q.visible, q.userData.gun.visible] = vis[k]; });
}
export const HOLSTER_M = lam(0x1d1d1f), HOOD_M = lam(0x141415), STRAP_M = lam(0x2c2620), BELT_M = lam(0x19191a), SNAP_M = lam(0x2e2f31), BUCKLE_M = lam(0x8a8d90);
// a duty holster (in the run's colour, player/look.js), moulded round each sidearm (in the gun's own frame): rear and top of the shell, its closed
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
// In the shoulder rig (rig) there's no paddle or belt loop: a backing panel lies against your ribs instead, with a
// D-ring at each end for the harness
export function buildHolster(parent, id, pv, muz, rig) {
  const F = HOLSTER_FIT[id]; if (!F) { box(parent, 0.075, 0.24, 0.13, HOLSTER_M, 0.0, -0.13, -0.02); return; }
  const g = new THREE.Group(); g.position.set(-pv[0], -pv[1], -pv[2]); parent.add(g);
  const fr = Math.max(F.front, Math.min((muz || 0) - 0.012, F.front + 0.12)), w = F.w, t = F.top, b = F.bore, [z0, z1] = F.gz, x0 = X;
  solid(g, [[F.rear, t], [fr - 0.014, t], [fr, t - 0.012], [fr + 0.002, b - 0.028], [fr - 0.012, b - 0.042], [z1 + 0.03, b - 0.046], [z1 + 0.006, F.gb + 0.012], [z1 - 0.006, F.gb], [z0 + 0.012, F.gb], [z0, F.gb + 0.01], [F.mouth[0] + 0.012, F.mouth[1] - 0.006], F.mouth], w, HOLSTER_M, x0, 0.009);
  // the hood: a strap up over the back of the slide and down both sides, its tab on the outside with the snap
  const h0 = F.rear + 0.008, h1 = F.rear + 0.04;
  solid(g, [[h0, t + 0.009], [h1, t + 0.009], [h1 + 0.004, t - 0.03], [h0 - 0.004, t - 0.03]], w + 0.008, HOOD_M, x0, 0.004);
  cyl(g, 0.0065, 0.004, SNAP_M, x0 + w / 2 + 0.005, t - 0.017, (h0 + h1) / 2, 14).rotation.set(0, 0, Math.PI / 2);
  cyl(g, 0.0055, 0.003, SNAP_M, x0 + w / 2 + 0.0015, b - 0.012, z1 + 0.03, 14).rotation.set(0, 0, Math.PI / 2);
  if (rig) {
    solid(g, [[F.rear - 0.006, t + 0.004], [fr - 0.02, t + 0.004], [fr - 0.012, b - 0.03], [z1 + 0.02, F.gb + 0.02], [F.rear - 0.002, F.gb + 0.03]], 0.005, HOOD_M, x0 - w / 2 - 0.003, 0.002);
    [F.rear + 0.004, fr - 0.024].forEach(z => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0022, 5, 12), BUCKLE_M); r.position.set(x0 - w / 2 - 0.004, t + 0.008, z); r.rotation.y = Math.PI / 2; g.add(r); });
    return;
  }
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
// the shoulder rig's harness, while a pair of sidearms rides in it: a leather pad over each shoulder running down onto
// the chest, a webbing strap from each pad round to the front of the holster under that arm with its slider buckle, one
// from the holster's back end up across your back to where the two cross between the shoulder blades (under the pack),
// and a tie-down from each holster to the belt. Upper-body space; s is the side (+x the right hand's)
let rigPieces = [];
const RIG = { pad: 0.07, padT: 0.012, web: 0.034, webT: 0.006, x: 0.274, z: 0.158 };
function strapTo(parent, a, b, w, th, n, mat) {   // a flat strap from a to b, w wide, lying with its face toward n
  const along = new V3().subVectors(b, a), len = along.length(); along.divideScalar(len || 1);
  const up = new V3().copy(n).addScaledVector(along, -n.dot(along)).normalize(), side = new V3().crossVectors(up, along);
  const m = box(parent, w, th, len, mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, along)); return m;
}
function buildRig(on) {
  rigPieces.forEach(o => o.parent && o.parent.remove(o)); rigPieces = [];
  if (!on) return;
  const U = PM.upper, P2 = (x, y, z) => new V3(x, y, z), fwd = P2(0, 0, 1), top = P2(0, 1, 0), back = P2(0, 0, -1);
  for (const s of [-1, 1]) {
    const x = RIG.x * s, sx = P2(s, 0, 0);
    // the pad: over the top of the shoulder and down onto the chest
    rigPieces.push(strapTo(U, P2(0.165 * s, 1.168, -0.13), P2(0.17 * s, 1.17, RIG.z - 0.01), RIG.pad, RIG.padT, top, HOOD_M));
    rigPieces.push(strapTo(U, P2(0.172 * s, 1.17, RIG.z + 0.004), P2(0.185 * s, 1.0, RIG.z + 0.004), RIG.pad, RIG.padT, fwd, HOOD_M));
    // webbing from the pad's foot round the side to the front of the holster, its slider halfway down
    rigPieces.push(strapTo(U, P2(0.19 * s, 1.012, RIG.z + 0.009), P2(0.245 * s, 0.995, RIG.z - 0.005), RIG.web, RIG.webT, fwd, BELT_M));
    rigPieces.push(strapTo(U, P2(0.245 * s, 0.995, RIG.z - 0.005), P2(x + 0.008 * s, 0.995, 0.135), RIG.web, RIG.webT, sx, BELT_M));
    rigPieces.push(box(U, 0.03, 0.016, 0.01, BELT_M, 0.205 * s, 1.009, RIG.z + 0.014));
    // from the holster's back end up the side and across the back to the cross
    rigPieces.push(strapTo(U, P2(x - 0.004 * s, 0.94, -0.12), P2(0.235 * s, 1.0, -RIG.z - 0.004), RIG.web, RIG.webT, sx, BELT_M));
    rigPieces.push(strapTo(U, P2(0.235 * s, 1.0, -RIG.z - 0.004), P2(0, 0.93, -RIG.z - 0.006), RIG.web, RIG.webT, back, BELT_M));
    rigPieces.push(strapTo(U, P2(0.165 * s, 1.168, -0.13), P2(0.03 * s, 0.93, -RIG.z - 0.008), RIG.web * 1.2, RIG.webT, back, BELT_M));
    // the tie-down to the belt
    rigPieces.push(strapTo(U, P2(x - 0.002 * s, 0.83, 0.05), P2(0.262 * s, 0.62, 0.04), 0.022, 0.005, sx, BELT_M));
  }
  rigPieces.push(box(U, 0.06, 0.06, 0.008, HOOD_M, 0, 0.93, -RIG.z - 0.01));   // the leather patch where they cross
}
function buildStow() {
  if (LOOK.cur) { HOLSTER_M.color.setHex(LOOK.cur.holster); HOOD_M.color.setHex(shade(LOOK.cur.holster, 0.72)); }   // the hood a shade darker
  // the old copies taken down, and what was made for them alone (the holster) let go of; the guns in them are your
  // weapons' own pieces, still drawn in your hands (binModel, core/geometry.js)
  for (const s in STOW) { const o = STOW[s]; [o, o && o.userData.twin].forEach(q => { if (!q) return; const g = q.userData.gun; if (g && g.parent) g.parent.remove(g); binModel(q); }); delete STOW[s]; }
  buildBelt(!!W8.slot.side);
  // one stowed copy of a slot's weapon (for a pair, of one of its guns: hand), centred where a lone gun would be
  const place = (s, id, at, hand) => {
    const copy = gunMeshes[s].clone(true);
    // drop the muzzle flash and the pair's other gun, and put everything back to its rest pose
    copy.traverse(o => { for (let k = o.children.length - 1; k >= 0; k--) { const c = o.children[k]; if (c.userData.isFlash || (c.userData.side && c.userData.side !== hand)) o.remove(c); } });
    copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0); copy.visible = true;
    copy.children.forEach(h => { if (h.userData.side) { h.position.set(0, 0, 0); h.rotation.set(0, 0, 0); h.visible = true; } });
    copy.updateMatrixWorld(true); const outer = new THREE.Group(), inner = new THREE.Group(), pv = at.pivot(id, new THREE.Box3().setFromObject(copy));
    outer.position.set(...at.pos); if (at.q) inner.quaternion.copy(at.q); else inner.rotation.set(...at.rot); copy.position.set(-pv[0], -pv[1], -pv[2]);
    if (at.flip && at.flip(id)) inner.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), Math.PI));   // turned over on its length
    inner.add(copy); outer.add(inner); at.part().add(outer);
    if (at.part() !== PM.upper) outer.traverse(o => o.layers.set(BACK_LAYER));   // (riding on your back: not drawn from your own eyes, BACK_LAYER)
    outer.userData.gun = copy; outer.userData.inner = inner; outer.userData.q0 = inner.quaternion.clone();
    const sls = [], mags = [], belt = []; copy.traverse(o => { if (o.userData.slideRest) sls.push(o); if (o.userData.isMag) mags.push(o); if (o.userData.beltK !== undefined) belt.push(o); });
    outer.userData.mags = mags; outer.userData.belt = belt;
    const legs = []; copy.traverse(o => { if (o.userData.leg) legs.push({ g: o, r0: o.rotation.clone(), down: o.userData.leg.down }); }); outer.userData.legs = legs.length ? legs : null;   // a bipod's legs (player/hold.js: bipodSway)
    return { outer, inner, copy, pv, sls };
  };
  const rig = !!(W8.slot.side && (W(W8.slot.side) || {}).akimbo && HOLDS.side && HOLDS.side.L);
  buildRig(rig);
  for (const s of SLOTS) {
    const id = W8.slot[s]; if (!id) continue;
    const inRig = rig && s === 'side';
    const { outer, inner, copy, pv, sls } = place(s, id, inRig ? STOW_RIG.R : STOW_AT[s], 'R');
    // a leather holster round the sidearm, a strap across the pack for slung guns
    if (s === 'side') buildHolster(inner, id, pv, MUZ[s], inRig);
    else if (s === 'long') [-0.04, -0.34].forEach(y => box(outer, 0.115, 0.03, 0.17, STRAP_M, -0.028, y, 0));   // two straps round it to the side of the pack
    else if (s === 'auto') { const st = outer.userData.strap = box(outer, 0.5, 0.035, 0.06, STRAP_M, 0, 0.02, 0.012); st.rotation.z = -STOW_TILT * 0.4; }   // a strap across it, holding it to the pack
    outer.userData.slides = sls; outer.userData.id = id;
    outer.userData.slot = s; outer.userData.gun = copy; outer.userData.rig = inRig; STOW[s] = outer;
    // a pair: the left gun in its own place (for sidearms, the rig's other holster), in a mirrored holster
    const ak = (W(id) || {}).akimbo && (inRig ? STOW_RIG.L : STOW_AK[s]);
    if (ak) {
      const L = place(s, id, ak, 'L');
      if (s === 'side') { const hg = new THREE.Group(); hg.scale.x = -1; L.inner.add(hg); buildHolster(hg, id, L.pv, MUZ[s], inRig); }
      outer.userData.twin = L.outer; outer.userData.gun2 = L.copy; outer.userData.slides2 = L.sls;
    }
  }
}
// planks strapped flat across the back of the pack, one for each you carry up to five: three side by side against the
// pack, then two more laid crosswise over them under a second strap. They're set over toward the melee weapon's side
// (which lies over them) so their ends stop short of the long gun flat against the pack's other side. Each is a shade of its own, dealt again whenever
// it's a fresh plank that shows up there. Once there's a metalwork bench (barricades/metal-bars.js) it's metal you carry
// there instead, in the same places: lengths of angle iron
// what rides on your back (the long gun, the automatic, the melee weapon) is drawn on a layer of its own, which the
// first-person camera leaves out (game/view-cam.js): from your own eyes your back's never in view, but a bat or a barrel
// poking up over your shoulder was, right over your eye, whenever you looked up. From above, the free camera and the
// sun's shadows still have it
export const BACK_LAYER = 4;
[ISO_CAM, FP_CAM, sun.shadow.camera].forEach(c => c.layers.enable(BACK_LAYER));
const plankStack = [], STOW_STEEL = lam(0x8d949b), STOW_STEEL_DK = lam(0x5d636a);
{
  const g = new THREE.Group(); g.position.set(-0.06, 0, -0.355); packBack.add(g);
  [[0.8, 0.04, M.board, 0, -0.02], [0.935, -0.05, M.board2, 0, 0.03], [1.07, 0.03, M.board, 0, -0.02], [0.87, -0.11, M.board2, 1, 0.01], [1.0, 0.09, M.board, 1, -0.01]].forEach(([y, tilt, mat, layer, x], k) => {
    const w = 0.52 - layer * 0.04, p = box(g, w, 0.12, 0.04, lam(mat.color.getHex()), x, y, -0.005 * (k % 3) - layer * 0.046); p.rotation.z = tilt; p.userData.wood = mat.color.getHex();
    // the sawn ends a shade darker (end grain), and two nail heads near each end where it was pulled off a fence or a wall
    const endM = lam(mat.color.getHex()); p.userData.endM = endM;
    const nails = [-1, 1].flatMap(n => [box(p, 0.004, 0.118, 0.038, endM, n * (w / 2 - 0.0015), 0, 0), ...[-0.03, 0.03].map(dy => box(p, 0.009, 0.009, 0.004, M.metal, n * (w / 2 - 0.05), dy + n * 0.006, -0.0215))]);
    // the angle iron in its place: a flat leg against the pack, the other standing out along its top edge, cut ends darker
    const steel = [box(p, w * 0.96, 0.09, 0.012, STOW_STEEL, 0, -0.005, -0.012), box(p, w * 0.96, 0.012, 0.05, STOW_STEEL, 0, 0.034, 0.008),
      ...[-1, 1].map(n => box(p, 0.006, 0.092, 0.014, STOW_STEEL_DK, n * w * 0.48, -0.005, -0.012))];
    steel.forEach(m => { m.visible = false; });
    p.userData.nails = nails; p.userData.steel = steel; p.userData.met = false;
    p.visible = false; plankStack.push(p);
  });
  // the cinch straps: each a flat webbing band down the outside of the stack, wrapped round its top and bottom edges back
  // to the pack, with its cam buckle on the front (the second only once the stack's deep enough to need it)
  const cinch = (x, y0, y1, zo) => {
    const c = new THREE.Group(); c.position.x = x; g.add(c);
    box(c, 0.035, y1 - y0, 0.004, STRAP_M, 0, (y0 + y1) / 2, zo);
    [y0, y1].forEach(y => box(c, 0.035, 0.004, -zo + 0.01, STRAP_M, 0, y, zo / 2 + 0.005));
    box(c, 0.042, 0.036, 0.008, BUCKLE_M, 0, (y0 + y1) / 2 + 0.06, zo - 0.004); box(c, 0.03, 0.006, 0.01, STRAP_M, 0, (y0 + y1) / 2 + 0.072, zo - 0.007);
    return c;
  };
  plankStack.strap = cinch(0.16, 0.73, 1.15, -0.072); plankStack.strap.visible = false;
  plankStack.strap2 = cinch(-0.12, 0.76, 1.12, -0.074); plankStack.strap2.visible = false;
}
// the backpack hangs from the tops of its shoulder straps and swings on its own, like a real one: it bounces a beat
// behind each step, lags back as you set off and swings on as you pull up, rocks with your stride and out to the side
// when you cut across, and trails a turn before swinging round after you. It can swing out from your back but not into
// it, so pulling up it thumps back against you. Each part is a damped spring driven by how your body moves.
const packSw = { y: 0, vy: 0, rx: 0, vrx: 0, rz: 0, vrz: 0, ry: 0, vry: 0, yaw: null, turn: 0 };
const PACK_SW = { bounce: 0.03, back: 0.24, into: 0.025, side: 0.16, twist: 0.3, turn: 0.055, fling: 0.012 };
export function updatePack(dt) {
  const q = packSw, L = PACK_SW;
  if (dt > 0) {
    const on = !P.dead, run1 = clamp(Math.hypot(P.vx, P.vz) / WALK_SPEED, 0, 1);
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
  packPivot.rotation.set(q.rx, -q.ry, -q.rz);   // (swung by the world, on the mirrored upper body: player/player.js)
}
// show or hide a stowed weapon; the holster stays on your hip, empty, while the sidearm is out. A pair's left gun goes
// with it (on2), or on its own while it's put away for a Vault fire vault (player/hold.js)
export function showStowed(s, on, on2 = on) {
  const o = STOW[s]; if (!o) return; o.userData.gun.visible = on; o.visible = (on || s === 'side') && !P.dead;
  const t = o.userData.twin; if (t) { o.userData.gun2.visible = on2; t.visible = (on2 || s === 'side') && !P.dead; }
}
// a stowed gun as it was put away: a slide or bolt that locks open on the last round locked back if it's empty (each
// of a pair by its own mag), a pump's or a bolt's action left open to load still open (W8.held: the bolt's handle up
// too), no mag in it if it went away with the mag out mid reload (W8.relSave), and a belt showing what's left in it
function stowState(o, t) {
  const id = o.userData.id, D = W(id); if (!D || D.melee || !D.ammo) return;
  const held = !!W8.held[id], out = !!(W8.relSave[id] && W8.relSave[id].st === 'out'), bolt = EJECT[id] === 'bolt';
  const pose = (sls, dry) => sls.forEach(m => {
    const r = m.userData.slideRest, off = r.cyc ? (held ? 1 : 0) : r.lock && dry ? 1 : 0, zc = r.z0 - r.travel * off, cl = m.userData.clip;
    if (cl === undefined) m.position.z = zc;
    else {   // (a bolt seen through a port in the side: what's run back past the port's edge is inside, out of sight)
      const L = 2 * (m.geometry.boundingBox || (m.geometry.computeBoundingBox(), m.geometry.boundingBox)).max.z, f = zc + L / 2, rr_ = Math.max(cl, zc - L / 2);
      m.visible = f - rr_ > 0.001; if (m.visible) { m.scale.z = (f - rr_) / L; m.position.z = (f + rr_) / 2; }
    }
    if (r.cyc && bolt) m.rotation.z = -BOLT_TURN * off;
    m.updateMatrix();
  });
  pose(o.userData.slides, D.akimbo ? akMags(id).R <= 0 : (W8.mag[id] || 0) <= 0);
  if (t) pose(o.userData.slides2, akMags(id).L <= 0);
  [o, t].forEach(q => q && q.userData.mags.forEach(m => { m.visible = !out; }));
  const nb = out ? 0 : W8.mag[id] || 0; o.userData.belt.forEach(r => { r.visible = r.userData.beltK < nb; });
}
// every frame: show what's stowed, and let it swing a little with your steps and your changes of pace
export function updateStow(rdt) {
  if (stowDirty) { setStowDirty(false); buildStow(); }
  const held = W8.cur, spd = Math.hypot(P.vx, P.vz), runF = clamp(spd / WALK_SPEED, 0, 1.2);
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
    const o = STOW[s], stowed = s !== held || (!!P.vault && !vaultHold()) || ANIM.bandP >= 1; showStowed(s, stowed, stowed || (s === held && !!ANIM.akHolstered));
    if (!o.visible) continue;
    const t = o.userData.twin;
    if (s === 'side') {
      const rk = o.userData.rig ? 0.2 : 1;   // (strapped under the arms, the rig's holsters hardly move)
      o.rotation.set(stowSw.x * 0.6 * rk, 0, -Math.abs(stowSw.z) * 0.3 * rk);   // the holster rides the hip and rocks fore and aft
      if (t) t.rotation.set(stowSw.x * 0.6 * rk, 0, Math.abs(stowSw.z) * 0.3 * rk);
    }
    else if (s === 'long') o.rotation.set(stowSw.x * 0.5, 0, stowSw.z * 0.8);   // the long gun swings about its straps on the pack's side
    if (stowed) stowState(o, t);
  }
  const n = Math.min(plankStack.length, S.planks | 0);
  plankStack.forEach((p, k) => {
    if (k < n && !p.visible) { p.material.color.setHex(plankTint(p.userData.wood)); p.userData.endM.color.copy(p.material.color).multiplyScalar(0.72); } p.visible = k < n;
    const u = p.userData; if (u.met !== METAL.on) { u.met = METAL.on; p.material.visible = !u.met; u.nails.forEach(m => { m.visible = !u.met; }); u.steel.forEach(m => { m.visible = u.met; }); }   // (planks or metal)
  }); plankStack.strap.visible = n > 0; plankStack.strap2.visible = n > 3;
  // the melee weapon and the automatic are laid on what's under them again whenever that changes
  const rk = [STOW.auto, STOW.melee, STOW.long].map(o => o ? o.uuid : '').join('|') + '|' + n;
  if (rk !== restKey) { restKey = rk; restBack(); }
  // what's strapped across the back swings as one piece from the straps at the top: rocking side to side, and its
  // bottom lifting out from the pack as you speed up (it can't swing into the pack)
  packBack.rotation.set(Math.max(0, -stowSw.x) * 0.4, 0, stowSw.z * 0.3);
  packBack.position.copy(BACK_PIV).applyQuaternion(packBack.quaternion).negate().add(BACK_PIV);
  // a bipod on a gun on your back swings with you too, as the pack moves
  for (const s in STOW) { const o = STOW[s], L = o && o.userData.legs; if (!L) continue; if (o.visible && o.userData.gun.visible) bipodSway(L, o.userData.gun, rdt); else if (L.st) L.st.on = false; }
}
