// Co-op teammates on your screen: each one's survivor built from the same body as yours (PM_BASE, player/player.js)
// in their own look (player/look.js), posed every frame from the pose their game sends (twenty times a second, eased
// in between), with the weapon they're holding in their hands and their name over their head. Their shots are drawn
// and heard here too: the tracer, the flash and the bang, quieter the further off they are.

import { $ } from '../core/dom.js';
import { cam, FP_CAM, scene, V3 } from '../core/renderer.js';
import { angDiff, clamp, rr, smooth } from '../core/math.js';
import { outline } from '../effects/screen-outlines.js';
import { NET, NET_COL, NET_ON, netLink, netSend, netTo } from './net.js';
import { lam, markMobile, MOBILE_SWEEP } from '../core/shaders.js';
import { blobShadow, mergeInto } from '../core/geometry.js';
import { bandPouch2, bandRolls, KNEE_Y, P, PACK, PM, PM_BASE, PM_BASE_SRC } from '../player/player.js';
import { blinkStep, buildLook, dealLook, faceGaze, faceGroups, faceMood, gazeStep, LOOK, shade } from '../player/look.js';
import { SLOTS } from '../weapons/slots.js';
import { WEAP } from '../weapons/gun-stats.js';
import { curId, magCap, run, S, T, W, W8 } from '../game/run-state.js';
import { gearOnAvatar } from '../player/gear.js';
import { FLASH_COL, flashRGB } from '../effects/muzzle-flash.js';
import { smoke } from '../effects/smoke.js';
import { tracer } from '../effects/tracers.js';
import { dropCopy, makeDrop, stepDrop } from '../effects/weapon-drop.js';
import { fx, impactFx } from '../effects/puffs.js';
import { bulletHole } from '../effects/bullet-holes.js';
import { groundHit } from '../weapons/firing.js';
import { stepRagdoll } from '../zombies/deaths.js';
import { xray } from '../effects/outlines.js';
import { fpOn, isoOn, specFpOn } from '../game/view-cam.js';
import { FP_PIV, lookTurn } from '../player/hold.js';
import { gunMeshes } from '../weapons/gun-materials.js';
import { flashes } from '../weapons/explosives.js';
import { indoors, playS, SUPP_SFX } from '../audio/samples.js';
import { footstep } from '../audio/footsteps.js';
import { setLmT, state } from '../game/state.js';
import { aimPt } from '../input/keyboard-mouse.js';
import { AK_ON, akMags, akPer } from '../weapons/akimbo.js';
import { bandHeal, bandProg } from '../player/bandages.js';
import { bonusDue, bonusHand, pickWait } from '../upgrades/upgrade-screen.js';
import { flDir, myLight } from '../lighting/lightmap.js';
import { hudMag } from '../ui/rounds.js';
import { endSurvivorRagdoll, survivorRagdoll } from '../player/player-ragdoll.js';
import { ANIM } from '../player/animation.js';
import { turnedDown } from './sync.js';
import { arsenalFrame, buildArsenal, weaponPose } from './arsenal.js';
import { teamDown } from './lobby.js';
import { camFocus, myDrops, updateSpecDrops, updateSpecXh } from './spectate.js';
import { coverFromCam } from '../zombies/zombie-visuals.js';

// the joints a pose carries, in order: where each is and how it's turned (and the arms how they're stretched)
const POSE_K = ['g', 'upper', 'lower', 'torso', 'head', 'armL', 'armR', 'legL', 'legR', 'shinL', 'shinR'];
const POSE_N = POSE_K.length;   // (the weapons come separately: net/arsenal.js)
const r3 = v => Math.round(v * 1000) / 1000, r2 = v => Math.round(v * 100) / 100;

// ---- your pose, sent out POSE_HZ times a second: the joints to the centimetre and the hundredth of a radian (eased on
// their side, that's finer than shows), where you are to the millimetre and how fast you're going, so your survivor can
// be drawn a moment ahead on their screens instead of a moment behind
const POSE_HZ = 15;
let poseDr = 0, poseT = 0, poseX = 0, poseZ = 0, poseAt = 0, poseWid = '', poseWnAt = 0;
// your pose as your body has it, taken each frame before the first-person view takes your arms and chest over to hold
// them on the view (game/view-cam.js): what your teammates see is you as you stand, looking up or down where you look,
// not your upper body stood straight for your own eyes (game/visuals.js calls it)
// From your own eyes your arms and gun are held level and the view carries them (player/hold.js: FP_PIV): here they're
// turned to point where you look (lookTurn) as the hold would have them, and the gun in your hands with them (SNAP_GUN,
// what net/arsenal.js sends of it, in your body's frame)
const poseSnapJ = [];
export const SNAP_GUN = { on: false, s: null, m: new THREE.Matrix4() };
const _psL = new THREE.Matrix4(), _psM = new THREE.Matrix4(), _psP = new V3(), _psQ = new THREE.Quaternion(), _psS = new V3(), _psE = new THREE.Euler();
export function poseSnap() {
  if (!netLink()) return;
  const j = poseSnapJ, look = fpOn() && Math.abs(FP_PIV.p) > 1e-4; j.length = 0;
  if (look) lookTurn(_psL);
  const put = (o, fine) => { const r = fine ? r3 : r2; j.push(r(o.position.x), r2(o.position.y), r(o.position.z), r2(o.rotation.x), r2(o.rotation.y), r2(o.rotation.z)); };
  const putT = o => { _psM.compose(o.position, o.quaternion, o.scale).premultiply(_psL).decompose(_psP, _psQ, _psS); _psE.setFromQuaternion(_psQ, o.rotation.order);
    j.push(r2(_psP.x), r2(_psP.y), r2(_psP.z), r2(_psE.x), r2(_psE.y), r2(_psE.z)); };
  POSE_K.forEach((k, n) => (look && (k === 'armL' || k === 'armR') ? putT : put)(PM[k], n === 0));
  j.push(r2(PM.armL.scale.x), r2(PM.armL.scale.z), r2(PM.armR.scale.x), r2(PM.armR.scale.z));
  const g = gunMeshes[W8.cur]; SNAP_GUN.on = look && !!g; SNAP_GUN.s = W8.cur;
  if (SNAP_GUN.on) { const u = PM.upper; g.updateMatrix(); SNAP_GUN.m.compose(u.position, u.quaternion, u.scale).multiply(_psL).multiply(g.matrix); }
}
export function poseOut(rdt) {
  if (!netLink()) return;
  poseT -= rdt; if (poseT > 0) return; poseT = 1 / POSE_HZ;
  const j = poseSnapJ.length ? poseSnapJ.slice() : (poseSnap(), poseSnapJ.slice());
  j[0] = r3(P.x); j[2] = r3(P.z);   // (where you are this frame: the rig only catches up when it's drawn, after this)
  const now = performance.now(), dt = Math.max(0.03, (now - poseAt) / 1000);
  const vx = clamp((P.x - poseX) / dt, -12, 12), vz = clamp((P.z - poseZ) / dt, -12, 12); poseX = P.x; poseZ = P.z; poseAt = now;
  const msg = { x: r3(P.x), z: r3(P.z), vx: r2(vx), vz: r2(vz), hp: Math.round(Math.max(0, P.hp)), mh: S.maxHp, dead: P.dead ? 1 : 0, v: P.vault ? 1 : 0, pk: (state === 'upgrade' && pickWait === null) || (state === 'leaving' && !bonusHand && bonusDue()) ? 1 : 0, cw: run.cardHand | 0, j,
    fl: myLight() ? [myLight(), r2(flDir())] : 0, vw: [r2(P.aim), r2(S.cone), r2(S.near), S.nightVis || 0, T('night') || 0], st: [S.planks | 0, S.scrap | 0, run.kills | 0], hl: Math.round((P.heal || 0) + bandHeal() * bandProg()),
    ap: !P.dead && state === 'play' ? [r2(aimPt.x), r2(aimPt.z)] : 0,   // (where you're aiming, for the crosshair a teammate watching you sees: net/spectate.js)
    fc: !P.dead && (ANIM.anger || ANIM.worry || ANIM.hurt || ANIM.ads) ? [r2(ANIM.anger || 0), r2(ANIM.worry || 0), r2(ANIM.hurt || 0), r2(ANIM.ads || 0)] : 0 };   // (hl: healing still to come, the blue on your bar; fc: your face, angry, startled, wincing and aiming, faceMood in player/look.js)   // (what the team list shows of you: planks, scrap and kills)
  // what's lying on your farm, a few times a second while a teammate's down (they may be watching you: net/spectate.js)
  if ((poseDr = (poseDr + 1) % 6) === 0 && [...NET.peers.values()].some(p => p.dead)) msg.dr = myDrops();
  if (fpOn() && !P.dead && [...NET.peers.values()].some(p => p.dead)) msg.fv = fpView();   // (what you see, for a teammate down and watching you from your own eyes: specFp)
  weaponPose(rdt, msg);   // the weapons out, their moving parts, what's stowed (net/arsenal.js)
  ammoOut(msg, now);
  netSend('p', msg);
}

// what a teammate watching you while they're down sees on their HUD (net/spectate.js): what's in the gun as your HUD
// shows it (-1 for a melee weapon; a pair, left then right, for akimbo), what's left to load, how much it holds,
// whether you're reloading (1) or loading shells (2), and your bandages. The weapon's name only when it changes, and
// every couple of seconds in case that one went missing
function ammoOut(msg, now) {
  const id = curId(), D = W(id) || {};
  let have, res = 0, cap = 0;
  if (D.melee) have = -1;
  else if (D.akimbo) { const m = akMags(id); have = [m[AK_ON.left], m[AK_ON.right]]; res = W8.reserve[D.ammo] | 0; cap = akPer(id); }
  else { const h = hudMag(id); have = h.have; res = h.res | 0; cap = magCap(id); }
  msg.am = [have, res, cap, W8.reloading === 'shell' ? 2 : W8.reloading ? 1 : 0, P.band | 0];
  if (id !== poseWid || now - poseWnAt > 2000) { poseWid = id; poseWnAt = now; msg.wn = D.name || ''; msg.wid = id || ''; }
}

// ---- from your own eyes, for a teammate who's down and watching through them: your view (the camera, how wide it
// sees) and what's in it (your upper body and arms as the first-person view has them, and the gun in your hand), all in
// your body's frame as your pose sends it (poseSnap: before the first-person view draws your body back about your eye,
// game/view-cam.js), as the view drew them last frame (this goes out before this frame's are drawn: net/sync.js).
// Their screen puts your survivor in that pose and their camera where yours is, so they see what you see
const FV_K = ['upper', 'armL', 'armR'], _fvI = new THREE.Matrix4(), _fvM = new THREE.Matrix4(), _fvP = new V3(), _fvQ = new THREE.Quaternion(), _fvS = new V3(), _fvE = new THREE.Euler();
function fpView() {
  const j = poseSnapJ;
  _fvI.compose(_fvP.set(j[0], j[1], j[2]), _fvQ.setFromEuler(_fvE.set(j[3], j[4], j[5], PM.g.rotation.order)), _fvS.set(1, 1, 1)).invert();
  const out = [], put = m => { _fvM.multiplyMatrices(_fvI, m).decompose(_fvP, _fvQ, _fvS); out.push(r3(_fvP.x), r3(_fvP.y), r3(_fvP.z), r3(_fvQ.x), r3(_fvQ.y), r3(_fvQ.z), r3(_fvQ.w)); };
  FP_CAM.updateMatrixWorld(true); put(FP_CAM.matrixWorld); out.push(r2(FP_CAM.fov));
  FV_K.forEach(k => put(PM[k].matrixWorld));
  const g = gunMeshes[W8.cur]; if (g && g.visible) put(g.matrixWorld);
  return out;
}
// watching a teammate from their own eyes (game/view-cam.js: specFpOn): their survivor's upper body, arms and gun put
// as their view had them, eased on as their pose is, the head (and what's on it) out of the way of the lens, and the
// camera at their eye, looking where they look, as wide as they see
const _sfpA = new THREE.Matrix4(), _sfpB = new THREE.Matrix4(), _sfpP = new V3(), _sfpQ = new THREE.Quaternion(), _sfpS = new V3(1, 1, 1);
function specFp(p, a, rdt) {
  const f = p.fv, on = !!f && !p.dead && specFpOn() && camFocus() === p;
  if (a.head.visible !== !on) a.head.visible = !on;
  if (!on) { a.fvc = null; return; }
  const k = 1 - Math.exp(-rdt * 20), c = a.fvc && a.fvc.length === f.length ? a.fvc : (a.fvc = f.slice());
  for (let i = 0; i < f.length; i++) c[i] += (f[i] - c[i]) * k;
  a.g.updateMatrixWorld(true);
  // (each part's world: their body's frame, then where it was in it; into its parent's frame)
  const place = (o, b) => {
    _sfpQ.set(c[b + 3], c[b + 4], c[b + 5], c[b + 6]).normalize(); _sfpP.set(c[b], c[b + 1], c[b + 2]);
    _sfpA.compose(_sfpP, _sfpQ, _sfpS.set(1, 1, 1)).premultiply(a.g.matrixWorld);
    o.parent.updateMatrixWorld(true); _sfpB.copy(o.parent.matrixWorld).invert().multiply(_sfpA);
    const sc = o.scale.clone(); _sfpB.decompose(o.position, o.quaternion, _sfpS); o.scale.copy(sc); o.updateMatrixWorld(true);
  };
  FV_K.forEach((key, i) => place(a[key], 8 + i * 7));
  const held = a.held && p.wp && p.wp[0] && a.held[SLOTS[p.wp[0][0]]];
  if (held && c.length >= 8 + FV_K.length * 7 + 7) place(held.g, 8 + FV_K.length * 7);
  _sfpQ.set(c[3], c[4], c[5], c[6]).normalize(); _sfpP.set(c[0], c[1], c[2]);
  _sfpA.compose(_sfpP, _sfpQ, _sfpS.set(1, 1, 1)).premultiply(a.g.matrixWorld).decompose(FP_CAM.position, FP_CAM.quaternion, _sfpS);
  if (Math.abs(FP_CAM.fov - c[7]) > 0.01) { FP_CAM.fov = c[7]; FP_CAM.updateProjectionMatrix(); }
  FP_CAM.updateMatrixWorld(true);
}

// ---- their survivors
const AV_SWAP = ['skin', 'shirt', 'pants', 'shirtDk', 'skinDk'];
// a survivor in look L, built from the same body as yours (PM_BASE) with their own materials and the look on it, the
// joints as they stand at rest; what buildAvatar makes a teammate from, and the look card shows (ui/look-card.js).
// partMap: each part of yours to its part of theirs; groups: what the look was built into, by where it goes
export function lookFigure(L) {
  const g = PM_BASE.clone(true), partMap = new Map(); { let k = 0; g.traverse(o => { partMap.set(PM_BASE_SRC[k++], o); }); }
  // their own materials for everything coloured by the look; the rest (the belt, the buckles, the webbing) is shared
  const mats = { skin: lam(L.skin), shirt: lam(L.topCol), pants: lam(L.pants), shirtDk: lam(shade(L.topCol, 0.76)), skinDk: lam(shade(L.skin, 0.86)) };
  const pack = { canvas: lam(L.pack), canvasDk: lam(shade(L.pack, 0.78)), canvasLt: lam(shade(L.pack, 1.22)), roll: lam(L.roll) };
  const swap = new Map(); AV_SWAP.forEach(k => swap.set(PM.mats[k], mats[k])); Object.keys(PACK).forEach(k => swap.set(PACK[k], pack[k]));
  g.traverse(o => { if (o.isMesh && swap.has(o.material)) o.material = swap.get(o.material); if (o.isMesh) o.castShadow = true; });
  const rig = { g, mats, partMap };
  POSE_K.forEach(k => { rig[k] = g.getObjectByName('pm.' + k); });
  // the look, built onto their rig: buildLook works on whatever LOOK.g and PM.mats hold, so for a moment they hold theirs
  const groups = {}, on = { head: rig.head, hat: rig.head, torso: rig.torso, armL: rig.armL, armR: rig.armR, legL: rig.legL, legR: rig.legR, shinL: rig.shinL, shinR: rig.shinR, shoeL: rig.shinL, shoeR: rig.shinR };
  for (const k in on) { const q = new THREE.Group(); on[k].add(q); groups[k] = q; if (k.startsWith('shin') || k.startsWith('shoe')) q.position.y = -KNEE_Y; }
  const keepG = LOOK.g, keepM = PM.mats, keepY = LOOK.mirrorY, keepW = LOOK.wr;   // (your own loose bracelets too: wristSway)
  try { LOOK.g = groups; PM.mats = Object.assign({}, keepM, mats); buildLook(L); } catch (e) { console.warn('avatar look', e); }
  finally { rig.mirrorY = LOOK.mirrorY; LOOK.g = keepG; PM.mats = keepM; LOOK.mirrorY = keepY; LOOK.wr = keepW; }
  rig.groups = groups;
  return rig;
}
function buildAvatar(p) {
  const L = p.look || dealLook(), rig = lookFigure(L), { g, partMap, groups } = rig;
  // the eyes, brows and mouth each folded into a mesh of their own and kept off the joint's, so they can move as their
  // face does (faceMood, player/look.js)
  rig.faceH = groups.head; const faceParts = new Set(faceGroups(groups.head));
  faceParts.forEach(f => { const ms = []; f.traverse(o => { if (o.isMesh) ms.push(o); }); if (ms.length) mergeInto(f, ms); });
  // then everything that rides on each joint (the look, the pack, the belt, the pouches) folded into a mesh or two:
  // their colours never change, so it all bakes into one vertex-coloured material per joint (mergeInto,
  // core/geometry.js) and a teammate costs a few dozen draws, not a couple of hundred
  // (all but their hat and shoes, which their gear can cover and hide: gearOnAvatar, player/gear.js)
  const joints = new Set(POSE_K.map(k => rig[k])), own = [groups.hat, groups.shoeL, groups.shoeR], ownSet = new Set(own);
  rig.hat = groups.hat; rig.shoes = [groups.shoeL, groups.shoeR]; rig.pouch2 = partMap.get(bandPouch2) || null;
  rig.rolls = bandRolls.map(m => partMap.get(m)).filter(Boolean);   // their bandages in the pouches, one roll each (am[4])
  for (const J of [...joints, ...own]) {
    const parts = []; (function walk(o) { o.children.forEach(c => { if (joints.has(c) || faceParts.has(c) || (ownSet.has(c) && c !== J)) return; if (!c.visible) return; if (c.isMesh) parts.push(c); walk(c); }); })(J);
    parts.forEach(o => { o.castShadow = true; });
    if (parts.length > 1) mergeInto(J, parts);
  }
  // their weapons, from their loadout (net/arsenal.js), once it's come
  rig.look = L;
  if (p.lo) { buildArsenal(rig, p.lo, p.lk); rig.gearKey = JSON.stringify([p.lo.gear, p.lo.slots]); gearOnAvatar(rig, p.lo.gear, p.lo.slots, L); }
  rig.blob = blobShadow(1.15, 0.38);
  // an outline in their colour, and through walls, trees and anything else in the way their shape in it, as your own
  // shows grey (effects/outlines.js)
  const col = new THREE.Color(NET_COL[p.idx] || '#888').getHex();
  rig.ol = outline(g, col, 0, 0.022, null, o => !o.userData.fine); rig.ol.opacity = 0.9; rig.ol.depthWrite = false;
  rig.xr = xray(g, col, false, col, o => !o.userData.fine && !o.userData.isOutline, 1.0); rig.xr.rim.opacity = 0.85; rig.xr.sil.opacity = 0.22;
  scene.add(g);
  g.position.set(P.x, 0, P.z);
  // their name over their head
  const tag = document.createElement('div'); tag.className = 'tag'; tag.style.setProperty('--pc', NET_COL[p.idx] || '#888');
  tag.innerHTML = '<i class="dot"></i><span class="nm"></span><s><u></u></s>'; tag.querySelector('.nm').textContent = p.name; $('tags').appendChild(tag);
  const bar = tag.querySelector('s');
  rig.tag = tag; rig.tagBar = bar.firstChild;
  rig.cur = null; rig.tgt = null;
  p.av = rig;
  return rig;
}
// a teammate going down: the weapon falling out of their hands, as they threw it ('wdrop', from startDeath in
// ui/screens.js), built from the one they were holding. To look at only, and gone once they're back up
NET_ON.wdrop = m => {
  const p = NET.peers.get(m.f), a = p && p.av, h = a && a.held && a.held[SLOTS[m.s]]; if (!h) return;
  dropGone(p);
  const c = dropCopy(h.g); c.g.position.fromArray(m.p); c.g.quaternion.fromArray(m.q);
  const id = p.lo && p.lo.slots[SLOTS[m.s]]; p.drop = makeDrop(c.g, c.h, m.v, m.w, !!(WEAP[id] || {}).melee);
};
function dropGone(p) { if (p.drop) { scene.remove(p.drop.g); p.drop = null; } }
export function netDropAvatar(p) {
  dropGone(p);
  const a = p.av; if (!a) return;
  scene.remove(a.g); if (a.blob) scene.remove(a.blob); if (a.tag) a.tag.remove();
  p.av = null;
}
// a pose in: kept as where they're headed; their survivor eases there over the next frames
NET_ON.p = m => {
  const p = NET.peers.get(m.f); if (!p) return;
  if (m.dead && !p.dead && p.x !== undefined && state !== 'title') { teamDown(p); turnedDown(p.id); }   // they've just gone down (net/lobby.js), and they'll be back next wave as one of them (net/sync.js)
  Object.assign(p, { x: m.x, z: m.z, vx: m.vx || 0, vz: m.vz || 0, hp: m.hp, maxHp: m.mh, vw: m.vw || p.vw, dead: !!m.dead, vault: !!m.v, picking: !!m.pk, cw: m.cw | 0, wp: m.wp, sv: m.sv, ex: m.ex, stats: m.st, am: m.am, heal: m.hl || 0, fl: m.fl || 0, fc: m.fc || 0, ap: m.ap || 0, fv: m.fv || 0, loaded: true }); if (m.wn !== undefined) { p.wn = m.wn; p.wid = m.wid || ''; } if (m.dr) p.drops = m.dr;
  // a loadout we haven't got (or an old one): ask for it, once a second at most
  if (m.lk && m.lk !== (p.av ? p.av.lk : p.lk) && performance.now() - (p.loAsk || 0) > 1000) { p.loAsk = performance.now(); netTo(m.f, 'loq', {}); }
  p.tgt = m.j; p.poseAt = performance.now();
};
// every frame: each teammate's survivor eased toward their last pose, their name over them
const _tagV = new V3(), TAG_GONE = { stay: 2.5, fade: 1.5 };
export function updateAvatars(rdt) {
  updateSpecXh(rdt); updateSpecDrops();   // (the crosshair and the drops of whoever you're watching: net/spectate.js)
  const show = netLink() && (state === 'play' || state === 'paused' || state === 'upgrade' || state === 'leaving' || state === 'dead');
  for (const p of NET.peers.values()) {
    if (!show || !p.tgt) { if (p.av) { p.av.g.visible = false; p.av.tag.style.opacity = 0; p.av.tagO = 0; if (p.av.blob) p.av.blob.visible = false; } continue; }
    const a = p.av || buildAvatar(p), t = p.tgt;
    if (p.drop) { if (p.dead) stepDrop(p.drop, rdt); else dropGone(p); }   // (the weapon they let fall going down, till they're up: below)
    a.g.visible = true; if (a.blob) a.blob.visible = !p.dead;
    if ((a.mobT = (a.mobT || 0) - rdt) <= 0) { a.mobT = MOBILE_SWEEP; markMobile(a.g); }   // (nor anything of them: core/shaders.js)
    if (a.ol) a.ol.visible = !p.dead; if (a.xr) { a.cvK = coverFromCam(a.g.position.x, a.g.position.z) ? 1 : Math.max(0, (a.cvK || 0) - rdt * 4); const xo = !p.dead && isoOn() && a.cvK > 0; a.xr.rim.visible = a.xr.fill.visible = xo; if (a.xr.sil) a.xr.sil.visible = xo; }   // (down, no outline round them or through walls; through walls only from above, as zombies are, and only with something in the way: coverFromCam)
    const k = 1 - Math.exp(-rdt * 16), first = !a.cur;
    if (first) a.cur = t.slice();
    const c = a.cur;
    // where they are now, not where they were: their last position carried on along how fast they were going, for as
    // long as the pose has been on its way (a fifth of a second at most, and not while they're climbing or down)
    const ahead = p.vault || p.dead ? 0 : Math.min(0.2, (performance.now() - p.poseAt) / 1000 + 0.05);
    for (let i = 0; i < t.length; i++) {
      const rot = i < POSE_N * 6 && i % 6 >= 3, want = i === 0 ? t[0] + (p.vx || 0) * ahead : i === 2 ? t[2] + (p.vz || 0) * ahead : t[i];
      c[i] = first ? want : rot ? c[i] + angDiff(want, c[i]) * k : c[i] + (want - c[i]) * (Math.abs(want - c[i]) > 3 ? 1 : k);
    }
    const set = (o, n) => { const b = n * 6; o.position.set(c[b], c[b + 1], c[b + 2]); o.rotation.set(c[b + 3], c[b + 4], c[b + 5]); };
    // down, they go down as a ragdoll here as they did on their own screen (player/player-ragdoll.js), thrown on the way
    // they were going and a little off their facing, and lie where they fell; up again, their pose takes over
    if (p.dead && !a.rag) { POSE_K.forEach((key, n) => set(a[key], n)); a.g.updateMatrixWorld(true); const f = c[4] || 0, s = rr(-0.6, 0.6); a.rag = survivorRagdoll(a, a.g.position.x, a.g.position.z, f, p.vx, p.vz, -Math.sin(f + s), -Math.cos(f + s), null); }
    else if (!p.dead && a.rag) { endSurvivorRagdoll(a.rag); a.rag = null; }
    if (a.rag) stepRagdoll(a.rag, rdt);
    else POSE_K.forEach((key, n) => set(a[key], n));
    arsenalFrame(p, a, rdt);   // their weapons (net/arsenal.js)
    specFp(p, a, rdt);   // (and from their own eyes, if you're down and watching through them)
    { const f = p.fc || [0, 0, 0, 0], e = (key, i) => { a[key] = (a[key] || 0) + ((f[i] || 0) - (a[key] || 0)) * k; return a[key] < 0.002 ? 0 : a[key]; };
      faceMood(a.faceH, e('fa', 0), e('fw', 1), e('fh', 2), e('fk', 3), p.dead ? 0 : blinkStep(a.blink || (a.blink = {}), rdt));   // their face, angry, startled, wincing or aiming as they are
      const gz = gazeStep(a.gaze || (a.gaze = {}), rdt, p.dead ? 0 : (1 - (a.fk || 0)) * (1 - Math.min(1, (a.fa || 0) * 1.5)) * (1 - Math.min(1, a.fh || 0)), a.blink); faceGaze(a.faceH, gz[0], gz[1]); }   // (their eyes wandering on their own: player/look.js)
    if (a.rolls) { const nb = (p.am && p.am[4]) | 0; a.rolls.forEach((m, k) => { m.visible = k < nb; }); }
    const sb = POSE_N * 6; a.armL.scale.set(c[sb], c[sb], c[sb + 1]); a.armR.scale.set(c[sb + 2], c[sb + 2], c[sb + 3]);
    if (a.blob) { a.blob.position.set(a.g.position.x, 0.02, a.g.position.z); }
    // their footsteps, from their feet: a step every stride's length they cover, a run's when they're moving fast
    { const gx = a.g.position.x, gz = a.g.position.z, d = a.lx === undefined ? 0 : Math.hypot(gx - a.lx, gz - a.lz); a.lx = gx; a.lz = gz;
      if (d < 1 && !p.dead && !p.vault) { const sp = Math.hypot(p.vx || 0, p.vz || 0), run = sp > 4.2; a.walked = (a.walked || 0) + d; if (a.walked > (run ? 1.05 : 0.72)) { a.walked = 0; footstep(run ? 'run' : 'walk', 0.85, gx, gz); } } }
    // the name: over the head, gone while they're out of sight or past the edge of the screen
    // the dot over their head (and their name); when they're off the screen, it waits at its edge on the line toward
    // them, pointing their way
    a.head.getWorldPosition(_tagV); _tagV.y += 0.42; _tagV.project(cam);
    const W_ = innerWidth, H_ = innerHeight, M = 30, bh = _tagV.z > 1, sx = (bh ? -1 : 1) * (_tagV.x * 0.5) * W_ + W_ / 2, sy = (bh ? 1 : -1) * (_tagV.y * 0.5) * H_ + H_ / 2;   // (behind you in first person it comes out mirrored: turned back round, and to the edge)
    const inView = !bh && sx > M && sx < W_ - M && sy > M + 20 && sy < H_ - M;
    let tx = sx, ty = sy;
    if (!inView) {
      const cx = W_ / 2, cy = H_ / 2, dx = sx - cx, dy = sy - cy, t = Math.min((cx - M) / Math.max(1e-3, Math.abs(dx)), (cy - M) / Math.max(1e-3, Math.abs(dy)));
      tx = cx + dx * t; ty = cy + dy * t; a.tag.style.setProperty('--a', Math.atan2(dy, dx).toFixed(3) + 'rad');
    }
    if (a.edge !== !inView) { a.edge = !inView; a.tag.classList.toggle('edge', a.edge); }
    a.tag.classList.toggle('down', !!p.dead);
    // down, their name shows it a moment (struck through, the dot pulsing red) and then fades away rather than staying
    // over the body till the next wave (TAG_GONE: how long it stays, how long it takes to go)
    a.deadT = p.dead ? (a.deadT || 0) + rdt : 0;
    const tg = 1 - smooth(clamp((a.deadT - TAG_GONE.stay) / TAG_GONE.fade, 0, 1));
    const tgo = a.fvc ? 0 : tg;   // (none over the one whose eyes you're watching from)
    if (a.tagO !== tgo) { a.tagO = tgo; a.tag.style.opacity = tgo; }
    a.tag.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px)`;
    const hk = clamp((p.hp ?? 100) / (p.maxHp || 100), 0, 1); if (a.hk !== hk) { a.hk = hk; a.tagBar.style.transform = `scaleX(${hk.toFixed(3)})`; }
  }
}
// ---- their shots: what your own would show, from where they stand
export function shotOut(id, D, mw, ends, trSt, trPw, quiet) {
  if (!netLink()) return;
  netSend('shot', { w: id, q: quiet ? 1 : 0, x: r3(mw.x), y: r3(mw.y), z: r3(mw.z), e: ends.map(e => [r3(e[0]), r3(e[1]), r3(e[2]), e[3] | 0, r3(e[4] || 0)]), st: trSt, pw: r3(trPw), sh: D.ammo === 'shells' ? 1 : 0, dr: D.dragon ? 1 : 0 });
}
NET_ON.shot = m => {
  if (state === 'title') return;
  for (const e of m.e) {
    tracer(m.x, m.y, m.z, e[0], e[1], e[2], m.pw, m.st, e[3] === 3);
    // where it ended, as on their screen: a hole in the wall it hit and its sparks, or dirt kicked up off the ground
    const L = Math.hypot(e[0] - m.x, e[2] - m.z), dx = (e[0] - m.x) / (L || 1), dz = (e[2] - m.z) / (L || 1);
    if (e[3] === 1 && L > 0.1) { impactFx(e[0] - dx * 0.05, e[1], e[2] - dz * 0.05, -dx, -dz, 'wood'); bulletHole(m.x, m.z, dx, dz, L, e[1], e[4] || 0.08); }
    else if (e[3] === 2) groundHit(e[0], e[1], e[2], dx, dz);
  }
  if (!m.q) {   // their flash, in the colour of what they fired, and the light it throws
    const col = flashRGB(m.dr ? FLASH_COL.dragon : m.sh ? FLASH_COL.shells : FLASH_COL.p9);
    flashes.push({ x: m.x, y: m.y, z: m.z, r: m.sh ? 7 : 5.5, int: 1.5, col, t: 0.07, max: 0.07 }); setLmT(0);
    fx('star', m.x, m.y, m.z, 0, 0, 0, 0.35, m.sh ? 0.8 : 0.55, 0.06, 1).s.material.color.setRGB(col[0], col[1], col[2]); fx('glow', m.x, m.y, m.z, 0, 0, 0, 0.5, 0.7, 0.07, 0.7);
  }
  if (m.e.length) { const e = m.e[0], L = Math.hypot(e[0] - m.x, e[2] - m.z) || 1; smoke(m.x, m.y, m.z, (e[0] - m.x) / L * 0.8, 0.2, (e[2] - m.z) / L * 0.8, 0.08, m.q ? 0.35 : 0.7, 1.1, m.q ? 0.22 : 0.38); }
  heardFrom(m.q ? SUPP_SFX[m.w] : 'shot_' + m.w, m.x, m.z, m.q ? 0.55 : 1);
};
// a recorded sound from somewhere on the farm: quieter and duller the further it is from you, and off to its side
// (earFrom, audio/spatial.js: the further, the quieter and duller; through the house's walls, muffled)
export function heardFrom(name, x, z, vol) { playS(name, { at: [x, z], vol: vol ?? 1, jit: 0.06, tone: 3, verb: indoors() ? 0.4 : 0 }); }
