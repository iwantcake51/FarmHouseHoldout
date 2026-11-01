// Co-op: a teammate's weapons, as they carry them. Each player sends their loadout (the weapon in each slot with its
// mods, tiers, attachments and rounds, and where each rides stowed on them) whenever it changes; your game builds those
// same weapons (buildWeapon, weapons/build-weapons.js) twice over onto their survivor: once to hold, once stowed
// (in the holster, slung on the pack, strapped across its back). Every pose then says which weapons are out and where,
// and how each one's moving parts sit: the mag (out, in the hand, seated), slides and bolts, the charging handle, the
// revolver's cylinder, the double barrel broken open, the belt; and the speed loader or shells in their hand. Dropped
// mags and loaders come as their own messages and fall where they did for them.

import { V3 } from '../core/renderer.js';
import { NET, NET_ON, netSend, netTo } from './net.js';
import { lam } from '../core/shaders.js';
import { binModel, box, mergeInto, spanOf } from '../core/geometry.js';
import { P, packBody, PM } from '../player/player.js';
import { LOOK, shade } from '../player/look.js';
import { SLOTS } from '../weapons/slots.js';
import { WEAP } from '../weapons/gun-stats.js';
import { modLv } from '../weapons/mod-levels.js';
import { setTierCtx, W, W8 } from '../game/run-state.js';
import { BOLT_TURN } from '../player/hold-kick.js';
import { AKX, BELT, BRK, CRANE, flipOf, GM, gunMeshes, HOLDS, MAGG, SLIDES, X } from '../weapons/gun-materials.js';
import { SHELL_MAT } from '../weapons/gun-models.js';
import { GUNS } from '../melee/melee-models.js';
import { gearOnAvatar, gearSpec } from '../player/gear.js';
import { buildWeapon, weaponRec } from '../weapons/build-weapons.js';
import { placeMag, remoteCycle, remoteEnd } from '../weapons/casings.js';
import { state } from '../game/state.js';
import { SNAP_GUN } from './avatars.js';
import { camFocus } from './spectate.js';
import { HSH, placeLoader, SL_RND, SLM } from '../player/hold-loaders.js';
import { HOLD, HOLD_DEF } from '../player/hold.js';
import {
  BELT_M, BUCKLE_M, buildHolster, HOLSTER_M, HOOD_M, packBack, STOW, STOW_AK, STOW_AT, STOW_RIG
} from '../player/stow.js';

const r3a = v => Math.round(v * 1000) / 1000, r2a = v => Math.round(v * 100) / 100;

// ---- what moves on a weapon, in the same order on every machine: the holds, the mags, the slides and bolts, the
// charging handles, the cylinder, the barrels and their rims, the belt's rounds
export function movingOf(holds, rec) {
  const hs = [holds.R, holds.L].filter(Boolean), out = [...hs, ...rec.magg, ...rec.slides.map(q => q.m)];
  hs.forEach(h => { if (h.userData.charge) out.push(h.userData.charge.m); const f = flipOf(h); if (f) out.push(f); });   // (the gun's flipped group: folded under itself)
  out.push(...rec.crane); if (rec.brk) out.push(rec.brk.g, ...rec.brk.rims); if (rec.belt) out.push(...rec.belt);
  return out;
}
const myMoving = s => movingOf(HOLDS[s] || {}, { magg: MAGG[s] || [], slides: SLIDES[s] || [], crane: CRANE[s] || [], brk: BRK[s], belt: BELT[s] });
const partVals = (list, out) => { for (const o of list) out.push(r3a(o.position.x), r3a(o.position.y), r3a(o.position.z), r2a(o.rotation.x), r2a(o.rotation.y), r2a(o.rotation.z), r2a(o.scale.z), o.visible ? 1 : 0); return out; };

// ---- your loadout
const stowPose = o => [...o.position.toArray(), ...o.userData.inner.quaternion.toArray(), ...o.userData.gun.position.toArray()].map(r3a);
function myLoadout() {
  const guns = {}, stow = {};
  for (const s of SLOTS) {
    const id = W8.slot[s]; if (!id) continue;
    const mods = W8.mods[id] || [], lv = {}; mods.forEach(m => { lv[m] = modLv(m); });
    guns[id] = { mods, lv, gt: W8.gt[id] || {}, pin: (W8.pin && W8.pin[id]) || null, att: W8.att[id] || {}, rnd: (W8.rounds && W8.rounds[id]) || null, ak: !!(W(id) || {}).akimbo, rd: (W8.rds && W8.rds[id]) || null };   // (rd: which red dot it wears: weapons/attachments.js)
    const o = STOW[s]; if (o) { stow[s] = stowPose(o); if (o.userData.twin) stow[s + '2'] = stowPose(o.userData.twin); }
  }
  return { slots: Object.assign({}, W8.slot), guns, stow, hol: LOOK.cur ? LOOK.cur.holster : 0x1d1d1f, gear: gearSpec() };
}
// a short hash of it, sent with every pose, so a teammate who's missing it (or has an old one) asks for it
let loAt = 0, loKey = '', loNow = null;
function loadoutTick() {
  const now = performance.now(); if (now - loAt < 500 && loNow) return; loAt = now;
  const lo = myLoadout(), key = JSON.stringify(lo);
  if (key !== loKey) { loKey = key; let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0; loNow = { lo, lk: h }; netSend('lo', loNow); }
}
NET_ON.loq = m => { if (loNow) netTo(m.f, 'lo', loNow); };
// (and the gear they've earned on them, built again only when it's changed: gearOnAvatar, player/gear.js)
// Built on them a survivor at a time, not all at once (LO_Q): a Showdown round's next loadout arrives for every bot
// in the same frame, and building all their guns there and then stalled it for seconds. A survivor with nothing in
// their hands yet who's in view, the one you're watching, or one whose guns are all built ahead already
// (ARS_POOL: cheap, only taken) gets theirs at once; the rest wait their turn (arsenalQueueStep), the latest loadout
// of each replacing whatever was waiting
const LO_Q = new Map(), LO_BUDGET = 6;
NET_ON.lo = m => {
  const p = NET.peers.get(m.f); if (!p) return; p.lo = m.lo; p.lk = m.lk; if (!p.av) return;
  LO_Q.delete(p.id);
  const a = p.av, bare = !a.held || !Object.keys(a.held).length;
  if ((bare && a.g.visible) || camFocus() === p || loCheap(a, m.lo)) loApply(p); else LO_Q.set(p.id, p);
};
function loApply(p) {
  const a = p.av; if (!a || !p.lo) return;
  buildArsenal(a, p.lo, p.lk);
  const gk = JSON.stringify([p.lo.gear, p.lo.slots]); if (gk !== a.gearKey) { a.gearKey = gk; gearOnAvatar(a, p.lo.gear, p.lo.slots, a.look); }
}
// (everything in it either on them already or built ahead and waiting to be taken)
function loCheap(a, lo) {
  for (const s of SLOTS) {
    const id = lo.slots[s], gl = id && lo.guns[id]; if (!gl || !GUNS[id]) continue;
    if (a.armKey && a.armKey[s] === loKeyOf(lo, s, id, gl) && a.held && a.held[s]) continue;
    const l = ARS_POOL.get(arsKey(id, gl)); if (!l || !l.length) return false;
  }
  return true;
}
// every frame (net/avatars.js): the survivors waiting for theirs, the cheap ones first, as many as fit in LO_BUDGET ms
// (always one)
export function arsenalQueueStep() {
  if (!LO_Q.size) return;
  const t0 = performance.now();
  while (LO_Q.size) {
    let p = null; for (const q of LO_Q.values()) { if (!q.av || camFocus() === q || loCheap(q.av, q.lo)) { p = q; break; } }
    if (!p) p = LO_Q.values().next().value;
    LO_Q.delete(p.id); if (p.av && NET.peers.get(p.id) === p) loApply(p);
    if (performance.now() - t0 > LO_BUDGET) break;
  }
}

// your weapons this pose: each one out (in the body's own frame), with its moving parts whenever they've changed (and
// every second regardless, for anyone who's just built your weapons); what's stowed and showing; what's in your hand
const _arInv = new THREE.Matrix4(), _arM = new THREE.Matrix4(), _arP = new V3(), _arQ = new THREE.Quaternion(), _arS = new V3();
const lastParts = {}; let partsKeyT = 0;
export function weaponPose(rdt, msg) {
  loadoutTick();
  partsKeyT -= rdt; const key = partsKeyT <= 0; if (key) partsKeyT = 1;
  PM.g.updateMatrixWorld(true); _arInv.copy(PM.g.matrixWorld).invert();
  const wp = [];
  SLOTS.forEach((s, k) => {
    const g = gunMeshes[s]; if (!W8.slot[s] || !g.visible || P.dead) return;
    (SNAP_GUN.on && SNAP_GUN.s === s ? _arM.copy(SNAP_GUN.m) : _arM.multiplyMatrices(_arInv, g.matrixWorld)).decompose(_arP, _arQ, _arS);   // (the gun in hand pointed where you look, as your arms are: net/avatars.js, poseSnap)
    const parts = partVals(myMoving(s), []), pk = parts.join(','), send = key || pk !== lastParts[s]; lastParts[s] = pk;
    wp.push([k, r3a(_arP.x), r3a(_arP.y), r3a(_arP.z), r3a(_arQ.x), r3a(_arQ.y), r3a(_arQ.z), r3a(_arQ.w), send ? parts : 0]);
  });
  let sv = 0;
  SLOTS.forEach((s, k) => { const o = STOW[s]; if (!o) return; if (o.visible) sv |= 1 << (4 + k); if (o.userData.gun.visible && o.visible) sv |= 1 << k; const t = o.userData.twin; if (t) { if (t.visible) sv |= 1 << (12 + k); if (o.userData.gun2.visible && t.visible) sv |= 1 << (8 + k); } });
  const ex = [];
  if (SLM.visible) ex.push(1, ...SLM.position.toArray().map(r3a), ...SLM.quaternion.toArray().map(r3a), SL_RND.visible ? 1 : 0); else ex.push(0);
  if (HSH.visible) ex.push(1, ...HSH.position.toArray().map(r3a), ...HSH.quaternion.toArray().map(r3a), HSH.children.reduce((b, c, i) => b | (c.visible ? 1 << i : 0), 0)); else ex.push(0);
  Object.assign(msg, { wp, sv, ex, lk: loNow ? loNow.lk : 0 });
}
// dropped mags and speed loaders fall from where they did for them
NET_ON.md = m => { if (state === 'title') return; const p = NET.peers.get(m.f), h = p && p.av && p.av.held && m.s && p.av.held[m.s]; placeMag(m, h && h.rec && h.rec.magg[m.sd | 0]); };   // (a copy of the mag on their gun, as on yours)
NET_ON.ld = m => { if (state !== 'title') placeLoader(m); };

// ---- building a teammate's: their loadout swapped in for a moment, so the models read their mods, tiers,
// attachments and rounds, not yours
function withLoadout(lo, id, fn) {
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const keep = { mods: [has(W8.mods, id), W8.mods[id]], gt: [has(W8.gt, id), W8.gt[id]], att: [has(W8.att, id), W8.att[id]], pin: [has(W8.pin, id), W8.pin && W8.pin[id]], rnd: [has(W8.rounds, id), W8.rounds && W8.rounds[id]], rd: [has(W8.rds, id), W8.rds && W8.rds[id]] };
  const mods = lo.mods || [], lvKeep = mods.map(m => [m, has(W8.modLv, m), W8.modLv && W8.modLv[m]]);
  const put = (o, k, v) => { if (o) { if (v === null || v === undefined) delete o[k]; else o[k] = v; } };
  const back = (o, k, [had, v]) => { if (o) { if (had) o[k] = v; else delete o[k]; } };
  try {
    W8.mods[id] = mods; W8.gt[id] = lo.gt || {}; W8.att[id] = lo.att || {}; put(W8.pin, id, lo.pin); put(W8.rounds, id, lo.rnd); put(W8.rds, id, lo.rd);
    if (!W8.modLv) W8.modLv = {}; mods.forEach(m => { W8.modLv[m] = (lo.lv || {})[m] || 1; });
    setTierCtx(id); return fn();
  } finally {
    setTierCtx(null); back(W8.mods, id, keep.mods); back(W8.gt, id, keep.gt); back(W8.att, id, keep.att); back(W8.pin, id, keep.pin); back(W8.rounds, id, keep.rnd); back(W8.rds, id, keep.rd);
    lvKeep.forEach(([m, had, v]) => { if (had) W8.modLv[m] = v; else delete W8.modLv[m]; });
  }
}
// one of their weapons, built as yours would be: a holder (with a hold per hand for a gun) and what moves on it
export function teamWeapon(lo, id) {
  const D = Object.assign({}, WEAP[id], { akimbo: !!lo.ak }), mods = {}; (lo.mods || []).forEach(m => { mods[m] = (lo.lv || {})[m] || 1; });
  // (drawn mirrored, as their upper body is: their weapon's sent as it sits in theirs, player/player.js)
  const g = new THREE.Group(), rec = weaponRec(), holds = {}; let muz = 0; g.scale.x = -1;
  try {
    withLoadout(lo, id, () => {
      if (D.melee) { muz = buildWeapon(g, id, D, mods, rec); return; }
      const hold = (x0, side) => { const h = new THREE.Group(); h.position.x = x0; h.userData.x0 = x0; h.userData.side = side; g.add(h); return h; };
      if (D.akimbo) { holds.R = hold(AKX - X, 'R'); holds.L = hold(-AKX - X, 'L'); muz = buildWeapon(holds.R, id, D, mods, rec); buildWeapon(holds.L, id, D, mods, rec); }
      else { holds.R = hold(0, 'R'); muz = buildWeapon(holds.R, id, D, mods, rec); }
    });
  } catch (e) { console.warn('teammate weapon', id, e); }
  return { g, holds, rec, muz, moving: movingOf(holds, rec), D };
}
// what never moves folded into a mesh or two, under each part that does (and under the holder): a teammate's rifle is
// a handful of draws, not a hundred
export function foldStatic(root, moving) {
  const stop = new Set(moving), span = spanOf(root);   // (the whole gun's reach: its far version goes over as one, core/geometry.js)
  for (const node of [root, ...moving]) {
    const parts = []; (function walk(o) { o.children.forEach(c => { if (stop.has(c)) return; if (c.isMesh && c.visible && !c.userData.isFlash) { c.castShadow = true; parts.push(c); } walk(c); }); })(node);
    if (parts.length > 1) mergeInto(node, parts, { lod: true, span });
  }
}
// a part of your rig to its part of theirs (their survivor is a copy of yours: PM_BASE, player/player.js)
function avPart(a, src) {
  if (src === packBack) { if (!a.packBack) { a.packBack = new THREE.Group(); a.partMap.get(packBody).add(a.packBack); } return a.packBack; }
  return a.partMap.get(src) || a.upper;
}
// a copy of a built weapon, its pieces sharing the original's geometry and materials (building it again, pulling its
// faces apart and all, is the slow part), with only the plain values of each piece's notes
function copyModel(o) {
  const u = o.userData; o.userData = {}; const c = o.clone(false); o.userData = u;
  for (const k in u) if (u[k] === null || typeof u[k] !== 'object') c.userData[k] = u[k];
  o.children.forEach(q => c.add(copyModel(q)));
  return c;
}
// a stowed copy of a built weapon: the one hand's gun of a pair, its hold put back on the middle
function stowCopy(proto, hand) {
  const copy = copyModel(proto), holds = {}; copy.scale.x = 1; copy.children.forEach(q => { if (q.userData.side) holds[q.userData.side] = q; });
  if (holds.L && hand === 'R') copy.remove(holds.L); else if (holds.R && hand === 'L') copy.remove(holds.R);
  Object.values(holds).forEach(hd => hd.position.set(0, 0, 0));
  return copy;
}
// weapons built ahead of time (pvp/pvp.js: Showdown's next loadout, built a piece a frame while the last round's
// winding down, so the next round doesn't start on a frame spent building everyone's guns at once): each one taken by
// the first survivor whose loadout has that same weapon (buildArsenal), instead of being built there and then
const ARS_POOL = new Map(), arsKey = (id, gl) => JSON.stringify([id, gl]);
export function arsenalWarm(gl, id) {
  if (!gl || !GUNS[id]) return;
  const h = teamWeapon(gl, id), proto = copyModel(h.g); foldStatic(h.g, h.moving);
  const stow = stowCopy(proto, 'R'); foldStatic(stow, []);
  const k = arsKey(id, gl); if (!ARS_POOL.has(k)) ARS_POOL.set(k, []); ARS_POOL.get(k).push({ h, proto, stow });
}
function arsenalTake(id, gl) { const l = ARS_POOL.get(arsKey(id, gl)); return l && l.length ? l.pop() : null; }
// and their shaders readied too, all at once, so the first frame they're drawn in isn't spent compiling them
export function arsenalWarmCompile(R, scene, cam) {
  const g = new THREE.Group(); for (const l of ARS_POOL.values()) l.forEach(e => { g.add(e.h.g); if (e.stow) g.add(e.stow); });
  scene.add(g); try { R.compile(scene, cam); } finally { scene.remove(g); [...g.children].forEach(c => g.remove(c)); }
}
// (what wasn't taken, once the round's under way: let go)
const loKeyOf = (lo, s, id, gl) => JSON.stringify([id, gl, s === 'side' ? lo.hol || 0 : 0]);
export function arsenalWarmClear() { for (const l of ARS_POOL.values()) l.forEach(e => { binModel(e.h.g); if (e.stow) binModel(e.stow); }); ARS_POOL.clear(); }
// their arsenal, kept up to date with their loadout: only a weapon that's changed (a new attachment, mod or rounds, or a
// weapon swapped in) is built again, once, and its stowed copies are copied from that one; a weapon that has only moved
// where it rides on them is moved
export function buildArsenal(a, lo, lk) {
  a.held = a.held || {}; a.stowed = a.stowed || {}; a.armKey = a.armKey || {}; a.lk = lk;
  const drop = s => {
    if (a.held[s]) binModel(a.held[s].g);
    const st = a.stowed[s]; if (st) { [st.outer, st.twin && st.twin.outer].forEach(q => { if (q) binModel(q); }); (st.belt || []).forEach(o => o.parent && o.parent.remove(o)); }
    delete a.held[s]; delete a.stowed[s]; delete a.armKey[s];
  };
  const keyOf = (s, id, gl) => loKeyOf(lo, s, id, gl);
  for (const s of SLOTS) {
    const id = lo.slots[s], gl = id && lo.guns[id], ok = !!gl && !!GUNS[id], key = ok ? keyOf(s, id, gl) : '';
    if (a.armKey[s] === key && a.held[s]) {
      // the same weapon as it was: just where it rides on them, if that's moved
      const st = a.stowed[s], put = (o, pose) => { if (o && pose) { o.outer.position.fromArray(pose, 0); o.outer.children[0].quaternion.fromArray(pose, 3); o.copy.position.fromArray(pose, 7); } };
      if (st) { put(st, lo.stow && lo.stow[s]); put(st.twin, lo.stow && lo.stow[s + '2']); }
      continue;
    }
    drop(s); if (!ok) continue;
    a.armKey[s] = key;
    const holM = lam(lo.hol || 0x1d1d1f), hoodM = lam(shade(lo.hol || 0x1d1d1f, 0.72));
    // to hold: hidden until a pose says it's out
    const pre = arsenalTake(id, gl), h = pre ? pre.h : teamWeapon(gl, id), proto = pre ? pre.proto : copyModel(h.g); if (!pre) foldStatic(h.g, h.moving); h.g.visible = false; a.g.add(h.g); a.held[s] = h; h.id = id;
    h.lasers = []; h.g.traverse(o => { if (o.userData.isLaser) h.lasers.push(o); }); h.laserT = ((gl.gt || {}).laser | 0);   // its laser's lens, shining when it's out (weapons/laser.js)
    // and stowed: where it rides on them (the sender's own placing of it, pushed down onto the pack and all)
    const rig = s === 'side' && gl.ak;
    const place = (at, hand, pose) => {
      const ready = hand === 'R' && pre && pre.stow; if (ready) pre.stow = null;   // (its stowed copy built ahead too, arsenalWarm)
      const copy = ready || stowCopy(proto, hand);
      const outer = new THREE.Group(), inner = new THREE.Group(), pv = at.pivot(id, new THREE.Box3().setFromObject(copy));
      if (pose) { outer.position.fromArray(pose, 0); inner.quaternion.fromArray(pose, 3); copy.position.fromArray(pose, 7); }
      else { outer.position.set(...at.pos); if (at.q) inner.quaternion.copy(at.q); else inner.rotation.set(...at.rot); copy.position.set(-pv[0], -pv[1], -pv[2]); }
      inner.add(copy); outer.add(inner); avPart(a, at.part()).add(outer);
      let hol = null;
      if (s === 'side') {
        hol = new THREE.Group(); inner.add(hol); const hg = hand === 'L' ? new THREE.Group() : hol; if (hand === 'L') { hg.scale.x = -1; hol.add(hg); }
        buildHolster(hg, id, pv, h.muz, rig);
        hol.traverse(o => { if (o.isMesh) { if (o.material === HOLSTER_M) o.material = holM; else if (o.material === HOOD_M) o.material = hoodM; } });
        foldStatic(hol, []);
      }
      if (!ready) foldStatic(copy, []);
      return { outer, copy, hol };
    };
    const at = rig ? STOW_RIG.R : STOW_AT[s]; if (!at) continue;
    const st = place(at, 'R', lo.stow && lo.stow[s]);
    const at2 = gl.ak && (rig ? STOW_RIG.L : STOW_AK[s]);
    if (at2) st.twin = place(at2, 'L', lo.stow && lo.stow[s + '2']);
    a.stowed[s] = st;
    if (s === 'side') st.belt = [box(a.upper, 0.512, 0.05, 0.312, BELT_M, 0, 0.6, 0), box(a.upper, 0.07, 0.054, 0.008, BUCKLE_M, 0, 0.6, 0.158)];
  }
  // the speed loader and the shells in their hand
  if (!a.slm) { a.slm = SLM.clone(true); a.slm.visible = false; a.upper.add(a.slm); a.hsh = HSH.clone(true); a.hsh.visible = false; a.upper.add(a.hsh); }
}
// a shot's kick on their gun (m: back along it, up), and when it's died away (a pump's or bolt's working after it goes
// on as your own does: weapons/casings.js remoteCycle)
// (and its muzzle flipped up about where it's gripped, flip rad: by its kick, net/avatars.js avShot)
const ARS_KICK = { back: 0.045, up: 0.012, flip: 0.09 };
const ARS_KICK_END = 0.36;
// every frame: their weapons out where they hold them (eased), the moving parts as they last said, what's stowed
const _aQ = new THREE.Quaternion();
export function arsenalFrame(p, a, rdt) {
  if (!a.held) return;
  const k = 1 - Math.exp(-rdt * 18), out = new Set();
  for (const e of p.wp || []) {
    const s = SLOTS[e[0]], h = a.held[s]; if (!h) continue; out.add(s);
    if (e[8] && e[8].length === h.moving.length * 8) h.parts = e[8];
    const g = h.g, first = !g.visible || !h.bp; g.visible = !p.dead;
    _arP.set(e[1], e[2], e[3]); _aQ.set(e[4], e[5], e[6], e[7]);
    if (first) { h.bp = _arP.clone(); h.bq = _aQ.clone(); } else { h.bp.lerp(_arP, k); h.bq.slerp(_aQ, k); }   // (eased on its own, so a shot's kick put on it below never carries over)
    g.position.copy(h.bp); g.quaternion.copy(h.bq);
    if (h.parts) h.moving.forEach((o, i) => { const b = i * 8, v = h.parts; o.position.set(v[b], v[b + 1], v[b + 2]); o.rotation.set(v[b + 3], v[b + 4], v[b + 5]); o.scale.z = v[b + 6] || 1; o.visible = !!v[b + 7]; });
    // their shot (net/avatars.js avShot, a.fire): the gun kicked back into them and its muzzle up, easing home, and a
    // slide or bolt that cycles on its own slammed back and run home, as yours does (player/hold.js)
    // (and a pump's forend or a bolt worked after the shot, racked back and run home, a bolt's handle turned up first:
    // with your own cycle's beats and curves, weapons/casings.js remoteCycle; the case flicks out as it hits the stop,
    // net/avatars.js avShot)
    const F = a.fire; if (F && F.s === s && F.t < Math.max(ARS_KICK_END, F.cyc ? remoteEnd(F.cyc) : 0)) {
      F.t += rdt; const st = F.t, kk = F.k * Math.min(1, st / 0.012) * Math.exp(-st * 16);
      g.translateZ(-ARS_KICK.back * kk); g.position.y += ARS_KICK.up * kk;
      { const gp = (HOLD[h.id || F.id] || HOLD_DEF).grip; g.translateY(gp[1]); g.translateZ(gp[2]); g.rotateX(-ARS_KICK.flip * kk); g.translateZ(-gp[2]); g.translateY(-gp[1]); }
      const off = st < 0.02 ? st / 0.02 : st < 0.032 ? 1 : Math.max(0, 1 - (st - 0.032) / 0.06);
      const cp = F.cyc && remoteCycle(F.cyc, st), rk = cp ? cp.off : 0, lift = cp ? cp.lift : 0;
      for (const q of h.rec.slides) { if (q.m.userData.clip !== undefined) continue; if (!q.cyc) q.m.position.z = q.z0 - q.travel * off; else { q.m.position.z = q.z0 - q.travel * rk; if (h.D && h.D.ammo === 'rifle' && h.D.slot === 'long') q.m.rotation.z = -BOLT_TURN * lift; } }
    }
  }
  for (const s in a.held) if (!out.has(s)) a.held[s].g.visible = false;
  SLOTS.forEach((s, i) => {
    const st = a.stowed[s]; if (!st) return;
    const sv = p.sv || 0; st.outer.visible = !p.dead && !!(sv & (1 << (4 + i))); st.copy.visible = !!(sv & (1 << i));
    if (st.twin) { st.twin.outer.visible = !p.dead && !!(sv & (1 << (12 + i))); st.twin.copy.visible = !!(sv & (1 << (8 + i))); }
  });
  // the speed loader or the shells in their hand
  const ex = p.ex || [0, 0]; let i = 0;
  if (ex[i]) { a.slm.visible = true; a.slm.position.set(ex[i + 1], ex[i + 2], ex[i + 3]); a.slm.quaternion.set(ex[i + 4], ex[i + 5], ex[i + 6], ex[i + 7]); a.slm.children[a.slm.children.length - 1].visible = !!ex[i + 8]; i += 9; } else { a.slm.visible = false; i++; }
  if (ex[i]) {
    a.hsh.visible = true; a.hsh.position.set(ex[i + 1], ex[i + 2], ex[i + 3]); a.hsh.quaternion.set(ex[i + 4], ex[i + 5], ex[i + 6], ex[i + 7]); a.hsh.children.forEach((c, j) => { c.visible = !!(ex[i + 8] & (1 << j)); });
    // their shells in the colour of the kind their gun has loaded (SHELL_MAT, weapons/gun-models.js)
    const e = (p.wp || [])[0], lo = p.lo, id = e && lo && lo.slots[SLOTS[e[0]]], r = id && lo.guns[id] && lo.guns[id].rnd, sm = SHELL_MAT[r && r.on] || GM.shell;
    a.hsh.children.forEach((c, j) => { if (j < 3 && c.children[0]) c.children[0].material = sm; });
  } else a.hsh.visible = false;
}
