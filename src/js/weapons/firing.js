// Spread, muzzle and aim rays, exact part hits under the crosshair, and firing guns.

import { $ } from '../core/dom.js';
import { cam, FP_CAM, GUN_Y, V3 } from '../core/renderer.js';
import { angDiff, clamp, rand, rr, smooth } from '../core/math.js';
import { cell, ci, idx, inb, OPEN, openAt } from '../world/grid.js';
import { thinNear, thinRay } from '../world/thin-walls.js';
import { surfaceY } from '../world/house.js';
import { blockArr, bulletBlocked } from '../world/collision.js';
import { P } from '../player/player.js';
import { HEAVY_FIRE } from './gun-stats.js';
import { falloff, headFade } from './ammo.js';
import { fireModeOf } from './mod-levels.js';
import { curId, gunAtt, magSize, run, S, suppMul, suppressed, T, W, W8 } from '../game/run-state.js';
import { AKX, BELT, BIPOD, MUZ, X } from './gun-materials.js';
import { EJECT, ejectCasing, ejectLinks, needsRack, startCycle } from './casings.js';
import {
  flash, flashDress, flashLook, flashStar, flashT, muzzleWisp, muzzleWorld, setFlashLen, setFlashLife, setFlashSize,
  setFlashT, setFlashWide
} from '../effects/muzzle-flash.js';
import { smoke } from '../effects/smoke.js';
import { smokeTrail, tracer, tracerPower } from '../effects/tracers.js';
import { suppHeat } from '../effects/supp-heat.js';
import { dragonBreath, impactFx } from '../effects/puffs.js';
import { bulletHole } from '../effects/bullet-holes.js';
import { zombies } from '../zombies/zombie-types.js';
import { hurtZombie, partAt, pickPart, setCritNext, setHeadNext } from '../zombies/damage.js';
import { explode, flashes } from './explosives.js';
import { boardsCrossed, shootBoard } from '../barricades/planks.js';
import { SFX } from '../audio/sfx.js';
import { bloom, setBloom, setLmT, worldT } from '../game/state.js';
import { aimPt, hasMouse } from '../input/keyboard-mouse.js';
import { aiming, scopeAim, scoped, scopePt } from '../player/aiming.js';
import { tStick } from '../input/touch.js';
import { inspectCut } from '../player/inspect.js';
import { breakTrigger, relHeld } from './reload.js';
import { akMags, akShot } from './akimbo.js';
import { stamCost, SWING_AIR, TIRED } from '../melee/melee.js';
import { pickSwing } from '../melee/melee-anim.js';
import { SURE_CRIT } from '../upgrades/upgrades.js';
import { feed } from '../ui/hud-text.js';
import { los } from '../lighting/lightmap.js';
import { swapSt } from '../player/swap.js';
import { RG_SPREAD } from '../player/sprint.js';
import { aimSX, aimSY, XHIT, xhKick, XR } from '../player/shaky-hands.js';
import { fpOn } from '../game/view-cam.js';
import { fireCam } from '../game/camera.js';
import { angerShot, ANIM, worryShot } from '../player/animation.js';
import { HOLD, HOLD_DEF, holdOf } from '../player/hold.js';
import { gunKick, recoilFeel } from '../player/hold-kick.js';
import { beltKick, bipodKick } from '../player/hold-sway.js';
import { shotOut } from '../net/avatars.js';

// how hard a shot hits back, from what it does to a zombie: 9mm about 0.1-0.2, rifle rounds and magnums 0.3-0.8,
// the hunting rifle and shotguns up to about 1.2 (a double barrel firing both)
const gunPower = (D, shots) => clamp(D.dmg * Math.pow(D.pellets || 1, 0.85) * Math.pow(shots, 0.6) / 130, 0.08, 1.25);
// which hand's gun just fired: an akimbo pair's is the side of its last shot (weapons/akimbo.js), anything else's the right
const fireSide = D => D && D.akimbo && W8.akSide < 0 ? 'L' : 'R';
// a semi-automatic fires once a pull of the trigger: the handguns in single shots (not fanning, a burst or the auto sear)
export const semiAuto = id => { const m = fireModeOf(id); return !!m && m.k === 'semi'; };
// a revolver with its hammer filed down for fanning (Fan the hammer) is fanned whenever it's fired from the hip
export const fanning = D => !!(D && D.fan) && !aiming;
const fireRate = D => fanning(D) ? D.fan.rate : D.rate;   // seconds between shots
// running and gunning from the hip costs you: moving opens the spread up to RUN_SPREAD more (and it takes a moment
// to settle after you stop, P.mvS), and a shot fired on the move only sometimes goes exactly where the crosshair sits
// on a body (RUN_MISS of them at a full run don't, and fly with the spread instead). Aiming down the sights is steady
export const RUN_SPREAD = 1.6, RUN_MISS = 0.55;
// the shoulder stock on a sidearm steadies its kick, and only that (its aim is the sights' and laser's job): the view
// and the bloom kick back STOCK.kick as hard, and quick shots open the spread STOCK.spray as fast
export const STOCK = { kick: 0.55, spray: 0.6 };
export const stocked = id => gunAtt(id, 'stock');
// a gun with nothing against your shoulder (a sidearm without its stock, a pair of them) gets away from you quicker
// shot after shot: its spread opens HANDGUN.spray times as fast, and each kick of the crosshair grows with the spray so far
// (HANDGUN.kick more at its widest: player/shaky-hands.js)
export const HANDGUN = { spray: 1.6, kick: 0.9 };
export const unshouldered = (D, id) => D.slot === 'side' && !stocked(id);
// how a gun settles once you stop firing (weapons/combat-update.js, player/shaky-hands.js): after a beat (hold, s) it
// eases in (over ramp) and dies smoothly away (rate), never at a steady pace; a heavier round takes longer to settle
// (cal: the battle rifle's and the LMG's rifle rounds the longest), and a laser makes it quicker (D.settle: LASER_SETTLE,
// game/run-state.js)
export const SETTLE = { hold: 0.1, ramp: 0.3, rate: 4.5, cal: { p9: 1, p10: 0.85, magnum: 0.75, shells: 0.8, rifle: 0.55 } };
export const settleK = D => ((D && SETTLE.cal[D.ammo]) ?? 1) * ((D && D.settle) || 1);
// however loose everything makes it (a shotgun from the hip at a sprint, holding the trigger), a shot never strays more
// than this either side of where it's aimed (about 40°): past a right angle it would go sideways or behind you, and the
// crosshair (tan of it, ui/crosshair.js) would fold down to nothing
const SPREAD_MAX = 0.7;
// a shotgun's pattern stays usable to about 7 m: moving opens it only SG_RUN as much as it does a bullet's, holding the
// trigger only SG_SPRAY as much, and it never opens past SG_MAX (about 20° either side)
const SG_RUN = 0.35, SG_SPRAY = 0.4, SG_MAX = 0.35;
// your pace while a heavy gun's firing (D.heavy, weapons/gun-stats.js): it eases back once you let go (weapons/combat-update.js)
export function heavyFireSlow() { return 1 - (W8.heavyF || 0) * (W8.heavyK || 0); }
export function spreadOf(id) {
  // hip fire is a bit loose (aiming down the sights is far tighter), walking more than doubles it (+50% while aiming,
  // less with a sight: D.aimMove), holding the trigger opens it further
  const mv = P.mvS ?? clamp(Math.hypot(P.vx || 0, P.vz || 0) / 3, 0, 1);
  const D = W(id), pel = (D.pellets || 1) > 1; let s = D.spread * S.spreadMul * (1 + (P.conc || 0) * 1.6) * (aiming ? 0.5 * (D.aimK || 1) : 1.3 * (D.hipK || 1)) * (1 + mv * (aiming ? 0.5 * (D.aimMove ?? 1) : RUN_SPREAD * (D.mobile || 1) * (pel ? SG_RUN : 1))) * (1 + (W8.spray || 0) * 1.3 * (pel ? SG_SPRAY : 1));
  // a choke squeezes the pellets together, and steadies a slug even more
  if (D.ammo === 'shells' && T('choke')) s *= (D.pellets || 1) > 1 ? (T('choke') === 2 ? 0.49 : 0.7) : (T('choke') === 2 ? 0.3 : 0.55);
  if (D.bipod && P.still > 0.3) s *= 0.12;
  if (fanning(D)) s *= D.fan.spread;
  if (P.sprint) s *= RG_SPREAD;   // firing at a sprint, with Run and gun (player/sprint.js)
  s *= 1 + XHIT.spread * XR.hb;   // shaken by a blow you've just taken (xhHit, player/shaky-hands.js)
  return Math.min(s, pel ? SG_MAX : SPREAD_MAX);
}
// a scope pays off at range: up close a shot through it spreads like any aimed shot (it never gets worse the nearer you
// aim), and from there it tightens until, about ten metres out, the shot goes exactly where it's laid. Pellets still
// spread as they would without it
const SCOPE_NEAR = 3, SCOPE_FAR = 10;
export const scopeUse = () => scoped || scopeAim();
export function scopeSpread(id, d) {
  const D = W(id), k = smooth(clamp((d - SCOPE_NEAR) / (SCOPE_FAR - SCOPE_NEAR), 0, 1));
  return (D.pellets || 1) > 1 ? spreadOf(id) : spreadOf(id) * (1 - k);
}
// where a pellet goes inside the spread: bunched toward the middle like a real pattern (the sum of three draws), out to
// the full spread at the edges, so close up most of a shell lands on what you aimed at
export const pelletOff = sp => (rand() + rand() + rand() - 1.5) / 1.5 * sp;
// From your own eyes a shotgun's ring (ui/crosshair.js) is drawn where its pattern really goes rather than at the very
// edge any pellet could reach, which only one in hundreds gets near (they bunch to the middle): SG_FP.ring of the
// spread holds nearly all of them. And there the pattern's round, not one flat line: each pellet's also thrown up or
// down (SG_FP.v of its spread), never past that ring. Only where it flies is changed, not what it hits
export const SG_FP = { ring: 0.7, v: 0.8 };
// how far (m) from the point you aimed at a shotgun pellet can land and still hit that part (the head, the chest, a limb):
// a little more than the part itself, as a pellet clipping its edge counts
const PELLET_CORE = { head: 0.22, torso: 0.3, armL: 0.15, armR: 0.15, legL: 0.17, legR: 0.17 };
// a pattern hasn't opened up yet close to the muzzle: how far the pellets are off where you aimed is taken down to
// PAT_CLOSE.k of it at PAT_CLOSE.near metres and under, easing back to all of it by PAT_CLOSE.far, so a head you put the
// crosshair on from close up takes most of the load
const PAT_CLOSE = { k: 0.5, near: 1, far: 6 }, patTight = t => PAT_CLOSE.k + (1 - PAT_CLOSE.k) * smooth(clamp((t - PAT_CLOSE.near) / (PAT_CLOSE.far - PAT_CLOSE.near), 0, 1));
// how far off where you aimed a round can land on a body you had the crosshair on and still hit the part you aimed at
// (its spread, at that range, still counts: AIM_KEEP)
const AIM_KEEP = 0.12;
// each zombie a round goes through takes a quarter off what it does to the next
export const PIERCE_KEEP = 0.75;
// how far off the thing you're looking at through the scope is
export const scopeDist = () => scoped ? Math.hypot(scopePt.x - P.x, scopePt.z - P.z) : Math.hypot(aimPt.x - P.x, aimPt.z - P.z);
// what the barrel runs into in front of you: walls and tall props, the frame round a door or a window and any boards
// across it, and a zombie standing in front of you (a crawler's under it, a body's on the ground). The gun's pushed back
// off it (gunPush in player/hold.js), and it fires from where its muzzle has been pushed back to (muzzle, below), so a
// zombie pressed right up against you still gets shot
export const BARREL = { from: 0.2, step: 0.025, clear: 0.04, zr: 0.16, jamb: 0.4 }, _bf = { wall: 0, zom: 0 };
function barrelHits(x, z) {
  const i = ci(x), j = ci(z); if (!inb(i, j)) return false;
  const k = idx(i, j); if (blockArr[k] || thinNear(x, z, 0.07)) return true;
  const o = cell[k] === OPEN && openAt[k]; if (!o) return false;
  return o.boards.length > 0 || Math.abs(o.axis === 'x' ? x - o.x : z - o.z) > BARREL.jamb;   // boarded up, or past the jambs
}
// how far out along the aim the barrel's free of walls (wall) and of zombies (zom), on the line lat to your right,
// looking no further than L
export function barrelFree(lat, L) {
  const fx = Math.sin(P.aim), fz = Math.cos(P.aim), rx = fz, rz = -fx, x0 = P.x + rx * lat, z0 = P.z + rz * lat, st = BARREL.step;
  _bf.wall = _bf.zom = L;
  for (let t = BARREL.from; t < L; t += st) if (barrelHits(x0 + fx * t, z0 + fz * t)) {
    let a = t - st, b = t; for (let k = 0; k < 5; k++) { const m = (a + b) / 2; if (barrelHits(x0 + fx * m, z0 + fz * m)) b = m; else a = m; }   // to the face, not the step
    _bf.wall = Math.max(BARREL.from, a); break;
  }
  for (const z of zombies) {
    if (z.dead || z.crawl) continue;
    const r = BARREL.zr * z.T.scale, vx = z.x - x0, vz = z.z - z0, t = vx * fx + vz * fz, off = vx * rx + vz * rz;
    if (t <= 0 || off * off >= r * r) continue;
    const near = t - Math.sqrt(r * r - off * off); if (near < _bf.zom) _bf.zom = Math.max(BARREL.from, near);
  }
  return _bf;
}
// muzzle position in the world, and the angle from it to the cursor so shots and the laser meet under the crosshair; a
// gun pushed back off something in front of you fires from just short of it (ANIM.barrel, from gunPush; each of a
// pair from its own, ANIM.barrelS)
const TR_ADS = { ads: 0.5, out: 0.7 }, _trO = new V3();
export function muzzle(sideSign) {
  const D = W(curId()), ak = !!(D && D.akimbo), sg = sideSign || W8.akSide, sx = ak ? AKX * sg : X;
  const bar = ak && ANIM.barrelS ? ANIM.barrelS[sg < 0 ? 'L' : 'R'] : ANIM.barrel, m = Math.max(0.15, Math.min(MUZ[W8.cur] || 0.9, (bar ?? Infinity) - BARREL.clear));
  const fx = Math.sin(P.aim), fz = Math.cos(P.aim), rx = Math.cos(P.aim), rz = -Math.sin(P.aim);
  let ox = P.x + fx * m + rx * sx, oz = P.z + fz * m + rz * sx;
  // (the round leaves the gun's own muzzle, where the gun really is in your hands, as long as nothing's between you and
  // it; the place out in front of you at your side is only for when it isn't drawn)
  { const D2 = W(curId()); if (D2 && !D2.melee && !swapSt && !P.vault) { const mw = muzzleWorld(sideSign); if (Number.isFinite(mw.x) && Math.hypot(mw.x - P.x, mw.z - P.z) < 2 && !bulletBlocked(mw.x, mw.z) && los(P.x, P.z, mw.x, mw.z)) { ox = mw.x; oz = mw.z; } } }
  if (bulletBlocked(ox, oz) || !los(P.x, P.z, ox, oz)) { ox = P.x + fx * 0.3; oz = P.z + fz * 0.3; }
  // from your own eyes it goes from the muzzle straight at what the crosshair's on (aimPt: where your line of sight
  // meets something), however close that is, so it lands where you aimed and not off to the side of it
  if (fpOn()) { const tx = aimPt.x - ox, tz = aimPt.z - oz; return { ox, oz, a: Math.hypot(tx, tz) > 0.05 ? Math.atan2(tx, tz) : P.aim }; }
  // turned onto the cursor from the muzzle, eased in only once the cursor is well out past the muzzle: with the cursor
  // near you (closer than a long gun's muzzle) the angle from the muzzle would swing wildly with every small move
  let a = P.aim;
  const tx = aimPt.x - ox, tz = aimPt.z - oz, past = Math.hypot(aimPt.x - P.x, aimPt.z - P.z) - m;
  if (hasMouse && !tStick.R && past > 0.4) { const d = angDiff(Math.atan2(tx, tz), P.aim); if (Math.abs(d) < 0.7) a = P.aim + d * smooth(clamp((past - 0.4) / 1.2, 0, 1)); }
  return { ox, oz, a };
}
// what's under the crosshair (from above; in first person nothing is: game/view-cam.js): the body part of the nearest
// zombie the line from your eye through it meets. Each part is a box (HITBOX), fitted round the part and all it wears
// in the part's own frame, so it leans and swings with the limb, refitted every HITBOX.refit seconds (an arm off,
// armour gone); a zombie whose bounding sphere the line misses isn't looked at at all, and the answer's kept for the
// rest of the frame (it's asked for more than once)
const HITBOX = { refit: 0.5, sphere: 1.25, PARTS: ['head', 'torso', 'armL', 'armR', 'legL', 'legR'] };
const partRay = new THREE.Raycaster(), _pn = new THREE.Vector2(), _hbR = new THREE.Ray(), _hbM = new THREE.Matrix4(), _hbM2 = new THREE.Matrix4(), _hbP = new V3(), _hbC = new V3(), _hbB = new THREE.Box3();
let ctKey = '', ctHit = null;
// a part's box in its own frame: round every visible mesh under it
function partBox(o) {
  const u = o.userData; if (u.hb && worldT - u.hbT < HITBOX.refit && worldT >= u.hbT) return u.hb;
  const b = u.hb || (u.hb = new THREE.Box3()); b.makeEmpty(); u.hbT = worldT;
  o.updateMatrixWorld(true); _hbM.copy(o.matrixWorld).invert();
  o.traverse(m => { if (!m.isMesh || !m.visible || !m.geometry || m.userData.isOutline) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); b.union(_hbB.copy(m.geometry.boundingBox).applyMatrix4(_hbM2.multiplyMatrices(_hbM, m.matrixWorld))); });
  return b;
}
export function cursorTarget() {
  if (!hasMouse || tStick.R || scoped) return null;
  const key = worldT + ':' + aimSX() + ':' + aimSY(); if (key === ctKey) return ctHit;
  _pn.set(aimSX() / innerWidth * 2 - 1, -(aimSY() / innerHeight) * 2 + 1); partRay.setFromCamera(_pn, cam);   // under the crosshair, which wanders at low health
  const R0 = partRay.ray; let best = null, bd = Infinity;
  for (const z of zombies) {
    if (z.dead || z.vis < 0.15) continue;
    const sc = z.T.scale || 1; _hbC.set(z.x, 0.9 * sc, z.z);
    if (R0.distanceSqToPoint(_hbC) > (HITBOX.sphere * sc) ** 2 * (z.crawl ? 2.2 : 1)) continue;   // (the line nowhere near it)
    for (const p of HITBOX.PARTS) {
      if (p !== 'torso' && !z.limbs[p]) continue;
      const o = z.m[p]; if (!o || !o.visible) continue;
      const b = partBox(o); if (b.isEmpty()) continue;
      _hbR.copy(R0).applyMatrix4(_hbM.copy(o.matrixWorld).invert());
      if (!_hbR.intersectBox(b, _hbP)) continue;
      _hbP.applyMatrix4(o.matrixWorld); const d = _hbP.distanceToSquared(R0.origin);
      if (d < bd) { bd = d; best = { z, part: o.userData.part || p, x: _hbP.x, y: _hbP.y, zz: _hbP.z }; }
    }
  }
  ctKey = key; ctHit = best;
  return best;
}
// crawlers lie stretched out along the ground, so test their whole body, not just their hips: the nearest point of it
// on the ray no nearer than tMin (so a crawler that's half behind the muzzle is still hit by its half in front)
export function zRay(z, ox, oz, dx, dz, tMin = -Infinity) {
  const r = z.T.r + (z.crawl ? 0.26 : 0.08); let best = null;
  const n = z.crawl ? 2 : 1;
  for (let q = 0; q < n; q++) {
    const f = z.crawl ? (q ? 0.85 : 0.3) * z.T.scale : 0, px = z.x + Math.sin(z.face) * f, pz = z.z + Math.cos(z.face) * f;
    const vx = px - ox, vz = pz - oz, t = vx * dx + vz * dz, off = vx * dz - vz * dx;
    if (t >= tMin && off * off < r * r && (!best || t < best.t)) best = { t, off, r };
  }
  return best;
}
// how much smoke a round leaves hanging along its path, by calibre (SMOKE_CAL: a 9mm none, the .357 a wisp, the .50 and a
// slug more, a rifle round most, a rifle on full auto less, its trails overlapping), and through a can SMOKE_SUPP: thicker
// and longer-lasting, still faintest for a 9mm (effects/tracers.js: smokeTrail)
const SMOKE_CAL = { p9: 0, p10: 0.3, rimmed: 0.5, magnum: 0.8, rifle: 1, slug: 0.85 }, SMOKE_SUPP = { p9: 0.4, p10: 0.6, rimmed: 0.8, magnum: 1.05, rifle: 1.35, slug: 1.15, shells: 0.9 };
function smokeOf(D, id, supp, slug) {
  const k = D.ammo === 'shells' ? (slug ? 'slug' : 'shells') : D.ammo === 'magnum' && id === 'revolver' ? 'rimmed' : D.ammo;
  return supp ? SMOKE_SUPP[k] || 0 : (SMOKE_CAL[k] || 0) * (D.ammo === 'rifle' && D.rate < 0.15 ? 0.45 : 1);
}
export const bodyOf = z => z.crawl ? [z.x + Math.sin(z.face) * 0.55 * z.T.scale, z.z + Math.cos(z.face) * 0.55 * z.T.scale] : [z.x, z.z];
export function aimRay(ox, oz, a, maxL) {
  const dx = Math.sin(a), dz = Math.cos(a); let L = maxL, hitZ = null;
  for (let t = 0.1; t < maxL; t += 0.1) if (bulletBlocked(ox + dx * t, oz + dz * t)) { L = t; break; }
  L = thinRay(ox, oz, dx, dz, L);
  for (const z of zombies) { const h = zRay(z, ox, oz, dx, dz, 1e-6); if (h && h.t < L) { L = h.t; hitZ = z; } }
  return { L, z: hitZ };
}
export function fire() {
  const id = curId(), D = W(id);
  if (D.melee) {
    const cost = stamCost(D), tired = P.exh || P.stam < cost * 0.5;
    P.stam = Math.max(0, P.stam - cost * SWING_AIR); P.stamT = 0; if (P.stam <= 0.001) { P.exh = true; }
    W8.tired = tired; const tk = !tired ? 0 : (D.cleave || 1) < 2 ? TIRED.single : 1, slow = 1 + (TIRED.cd - 1) * tk;
    W8.cd = D.rate * 1.3 / Math.max(1, S.rateMul * 0.5 + 0.5) * slow; W8.swingDur = W8.swing = Math.min(D.rate * 1.2, D.style === 'chop' ? 0.98 : 0.64) * (1 + (TIRED.swing - 1) * tk); W8.hitDone = false; W8.whoosh = false; W8.swingSide = pickSwing(D).side; ANIM.mStop = 0;   // one of its three swings (melee/melee-anim.js)
    if (tired) SFX.pant();
    return;
  }
  gunFire(id, D);
}
// side: which of an akimbo pair fires (weapons/akimbo.js), each from its own mag
// a round into the ground: a spurt of dirt kicked up and back toward where it came from, and its flash (and from a
// teammate's shot the same: net/avatars.js)
export function groundHit(x, y, z, dx, dz, p = 0) {
  if (p < 4 || rand() < 0.4) impactFx(x, y + 0.02, z, -dx * 0.4, -dz * 0.4);
  if (p < 2) smoke(x, y + 0.03, z, -dx * 0.3, 0.55, -dz * 0.3, 0.1, 0.45, 0.8, 0.32, 0x8a7458);
}
export function gunFire(id, D, side) {
  {
  inspectCut();   // (looking it over: straight back on the aim for the shot, player/inspect.js)
  let shots = 1;
  if (D.akimbo) { if (!akShot(id, D, side || (W8.akSide > 0 ? 'L' : 'R'))) return; run.shots++; }
  else {
  if (breakTrigger(id, D)) return;   // the double barrel: stops the reload, and fires once it's closed (weapons/reload.js)
  if (W8.reloading === 'shell' && (W8.mag[id] || 0) > 0) W8.reloading = null;
  if (W8.reloading || relHeld(id)) return;   // (a reload left with its mag out, or in but not charged: weapons/reload.js)
  if (needsRack(id) && (W8.mag[id] || 0) > 0) return;   // not racked yet: it fires once the rack drives a round home (weapons/casings.js)
  if ((W8.mag[id] || 0) <= 0) { W8.cd = 0.25; if (semiAuto(id)) W8.trigLock = true; SFX.dry(); worryShot(); const aw = $('ammoWarn'); aw.classList.remove('kick'); void aw.offsetWidth; aw.classList.add('kick'); return; }
  shots = D.both && W8.mag[id] >= 2 ? 2 : 1;
  W8.mag[id] -= shots; W8.cd = fireRate(D) / S.rateMul; run.shots++; delete W8.relSave[id];
  if (D.burst && W8.burstLeft <= 0 && !W8.inBurst) { W8.burstLeft = D.burst - 1; W8.burstT = 0.06; }   // a burst, then another while it's held
  else if (!W8.inBurst && (semiAuto(id) || D.breakOpen)) W8.trigLock = true;   // one shot a pull (the double barrel too: as fast as you can pull, with no wait between, D.rate)
  }
  const { ox, oz, a: base } = muzzle();
  const mw = muzzleWorld().clone();
  // where its tracer starts: the muzzle from the hip; down the sights from your own eyes, your line of sight just out
  // past the front sight, so the round leaves from the middle of the screen, where you're aiming (TR_ADS)
  const trO = fpOn() && (ANIM.ads || 0) > TR_ADS.ads ? _trO.set(0, 0, -1).applyQuaternion(FP_CAM.quaternion).multiplyScalar(TR_ADS.out).add(FP_CAM.position) : mw;
  // anything between you and the muzzle can be hit too (a crawler at your feet, the barrel out over it: you shoot down
  // into it), as can a body a touch behind the muzzle
  const back = -Math.max(0.3, (ox - P.x) * Math.sin(P.aim) + (oz - P.z) * Math.cos(P.aim) - 0.25);
  // the first round goes exactly where the crosshair sits on a body, and hits that part (only sometimes on the run
  // from the hip: RUN_MISS; a shotgun's pattern always centres on it, as its spread already opens on the move)
  let tgt = cursorTarget(), tgtA = 0, tgtT = 0;
  if (tgt && !aiming && !scoped && !(P.eye > 0) && (D.pellets || 1) === 1 && rand() < RUN_MISS * (D.mobile || 1) * (P.mvS || 0)) tgt = null;   // (a machine pistol keeps its aim on the move: D.mobile)
  if (tgt) { tgtA = Math.atan2(tgt.x - ox, tgt.zz - oz); tgtT = Math.hypot(tgt.x - ox, tgt.zz - oz); for (let t = 0.1; t < tgtT; t += 0.1) if (bulletBlocked(ox + Math.sin(tgtA) * t, oz + Math.cos(tgtA) * t)) { tgt = null; break; } if (tgt && thinRay(ox, oz, Math.sin(tgtA), Math.cos(tgtA), tgtT) < tgtT) tgt = null; }
  let anyHit = false;
  // looking through a scope: the spread depends on the range (and a sniper's headshots crit)
  const scopeOn = scopeUse(), sp = P.eye > 0 && (D.pellets || 1) === 1 ? 0 : scopeOn ? scopeSpread(id, scopeDist()) : spreadOf(id), critC = (D.critT || 0) + (aiming && D.aimCrit ? D.aimCrit : 0), critX = Math.max(D.critM || 0, 2) + (D.critUp || 0);
  // Sure shot: a gun firing single shots rolls once a shot for a crit, whatever it hits (SURE_CRIT)
  const sure = S.sureShot && semiAuto(id) && rand() < SURE_CRIT;
  const pellets = (D.pellets || 1) * shots, pierce = D.pierce || 0;
  // tracers by how hard the round hits (effects/tracers.js); a suppressed round's is a little dimmer
  // a suppressed round's streak is a dim grey one, not a glowing one, and it leaves smoke instead (effects/tracers.js)
  const quietR = suppressed(D), trPw = tracerPower(D), trSt = D.ignite ? 'dragon' : quietR ? 'supp' : T('ammo') >= 2 ? 'hot' : 'std';
  if (quietR) suppHeat(id, trPw);   // (the can warms with each round through it: effects/supp-heat.js)
  const ends = [];   // where the tracers end, for your teammates' screens (net/avatars.js)
  const shotB = new Map();   // the boards the shot goes through, and how hard (barricades/planks.js)
  for (let p = 0; p < pellets; p++) {
    // a shotgun's pattern is centred on what the crosshair sits on (the first pellet lands exactly there), not on the
    // ground under the cursor, which from this camera is off to one side of a zombie's head
    // (a lone round spreads like any other, even with the crosshair on a body: it still hits the part you aimed at if
    // it lands near enough to it at that range, AIM_KEEP, so up close it goes where you put it, and further off it's off
    // the mark by as much as its spread throws it, and so is anything on past it)
    const one = pellets === 1, dev = one ? (rand() - 0.5) * 2 * sp : 0, aimed = p === 0 && tgt && (!one || Math.abs(Math.sin(dev)) * tgtT < AIM_KEEP);
    const po = pellets > 1 && !aimed ? pelletOff(sp) : 0;
    const a = p === 0 && tgt && one ? tgtA + dev : aimed ? tgtA : (pellets > 1 && tgt ? tgtA : base) + (pellets > 1 ? po : dev), dx = Math.sin(a), dz = Math.cos(a);
    // how high the round is along its way: from the muzzle to the part under the crosshair it was aimed at (or the
    // height you're aiming at, out where you're aiming), and on past at the same slope. Every zombie after the first it
    // goes through, and any in front of the one it was aimed at, is hit where that height meets it (partAt), or not at
    // all if it passes over; what it misses doesn't use up a pierce
    // (in first person every zombie on its way is met at its height: a round over one's head goes over it, game/view-cam.js;
    // and the round flies the line you looked down, up into the sky or down into the ground, where it stops: gndT)
    const fp = fpOn(), y0 = mw.y;
    let slope = tgt ? (tgt.y - y0) / Math.max(0.5, tgtT) : ((ANIM.aimY ?? GUN_Y) - y0) / Math.max(fp ? 0.05 : 1, Math.hypot(aimPt.x - ox, aimPt.z - oz));   // (from your own eyes through the very point the crosshair's on, however near)
    if (fp && pellets > 1 && !aimed) { const R = SG_FP.ring * sp; let v = pelletOff(sp) * SG_FP.v; if (po * po + v * v > R * R) v = Math.sign(v) * Math.sqrt(Math.max(0, R * R - po * po)); slope += Math.tan(v); }   // (up or down, inside the ring: SG_FP)
    let wallT = 26, gndT = 99;
    for (let t = 0.1; t < 26; t += 0.1) {
      if (bulletBlocked(ox + dx * t, oz + dz * t)) { wallT = t; break; }
      if (fp && slope < -1e-4 && y0 + slope * t <= surfaceY(ox + dx * t, oz + dz * t)) { gndT = t; break; }
    }
    wallT = thinRay(ox, oz, dx, dz, wallT);   // (an inside wall: world/thin-walls.js)
    const endR = Math.min(wallT, gndT, D.maxRange || 26);   // how far it can do anything: a wall, the ground, or where a dragon's breath pellet burns out
    const hits = [];
    for (const z of zombies) { const h = zRay(z, ox, oz, dx, dz, back); if (h && h.t <= endR) hits.push({ z, t: h.t, off: h.off, r: h.r, part: aimed && z === tgt.z ? tgt.part : null }); }
    if (aimed && !hits.some(h => h.z === tgt.z) && tgtT <= endR) hits.push({ z: tgt.z, t: tgtT, off: 0, r: 1, part: tgt.part });
    hits.sort((a, b) => a.t - b.t);
    let m = 0;
    for (let k = 0; k < hits.length && m <= pierce; k++) {
      const { z, off, r } = hits[k];
      const hx = -off * dz, hz = off * dx, side = hx * Math.cos(z.face) - hz * Math.sin(z.face);
      // a pellet that lands close enough to where you aimed on that zombie hits the part you aimed at; the rest of the
      // pattern scatters over the body as before (PELLET_CORE)
      let part = hits[k].part;
      if (!part && tgt && k === 0 && z === tgt.z && pellets > 1 && Math.hypot(Math.sin(a - tgtA) * hits[k].t, pelletOff(sp) * hits[k].t) * patTight(hits[k].t) < (PELLET_CORE[tgt.part] || 0.2)) part = z.limbs[tgt.part] === false ? 'torso' : tgt.part;
      if (!part && (m > 0 || fp || (tgt && z !== tgt.z)) && pellets === 1) { part = partAt(z, y0 + slope * hits[k].t, clamp(off / r, -1, 1), side); if (!part) continue; }
      hits[m++] = hits[k];
      part = part || pickPart(z, clamp(off / r, -1, 1), side, D);
      if (P.eye > 0) part = z.limbs.head ? 'head' : 'torso';   // a dead eye: every hit's a headshot (co-op Bullet time, zombies/damage.js)
      if (D.ignite && !z.dead) z.burn = 3;   // dragon's breath
      // a crit: every headshot a sniper lands through a scope (D.headCrit), a tuned gun's own (D.critT), the
      // revolver's aimed Dead-eye (D.aimCrit), or a Sure shot
      const crit = sure || (scopeOn && D.headCrit && part === 'head') || (critC > 0 && rand() < critC); setCritNext(crit); setHeadNext(headFade(id, hits[k].t));
      hurtZombie(z, D.dmg * S.dmgMul * suppMul(D) * Math.pow(D.pierceKeep ?? PIERCE_KEEP, m - 1) * falloff(id, hits[k].t) * (crit ? critX : 1), dx, dz, D.kick * falloff(id, hits[k].t), id, part);
    }
    const n = m;   // (the ones it went into, now at the front of hits)
    if (n) anyHit = true;
    // boards on its way, up to where it stops: the zombie that takes its last pierce, or the wall or its range
    boardsCrossed(ox, oz, dx, dz, n && n === 1 + pierce ? hits[n - 1].t : endR, D.dmg, shotB);
    const endT = n ? Math.max(0.2, hits[n - 1].t) : endR, lastZ = n ? hits[n - 1].z : null;
    // (from your own eyes the round's where its line has it there, so the tracer goes where you shot, up or down)
    const ey = fp && !(aimed && lastZ === tgt.z) ? Math.max(0.02, y0 + slope * endT) : aimed && lastZ === tgt.z ? tgt.y : lastZ ? (lastZ.crawl ? 0.3 : 1.0) * lastZ.T.scale : Math.min(GUN_Y, ANIM.aimY || GUN_Y);
    const hole = pellets > 2 ? 0.045 : D.ammo === 'p9' ? 0.07 : D.ammo === 'p10' ? 0.08 : 0.09;
    // what it ended in, for your teammates' screens to show the same (net/avatars.js): 1 a wall (the hole's size with
    // it), 2 the ground, 0 anything else
    const endK = n ? 0 : wallT < 26 && wallT <= endR ? 1 : gndT <= endR ? 2 : 0;
    // (dragon's breath: its own burning pellets show the shot, so just a couple of faint tracers through them)
    if (D.dragon ? p < 2 : p < 4 || rand() < 0.5) { tracer(trO.x, trO.y, trO.z, ox + dx * endT, ey, oz + dz * endT, D.dragon ? trPw * 0.45 : trPw, trSt); if (ends.length < 5) ends.push([ox + dx * endT, ey, oz + dz * endT, endK, hole]); }
    if (p === 0) smokeTrail(trO.x, trO.y, trO.z, ox + dx * endT, ey, oz + dz * endT, smokeOf(D, id, quietR, pellets === shots));   // big calibres leave smoke in the air, and every suppressed round a thicker, longer-lasting trail of it
    if (D.explode && (n || wallT < 26)) explode(ox + dx * endT, oz + dz * endT, D.explode, 45, true, false, true);
    else if (!n && wallT < 26 && wallT <= endR) {   // sparks and a little dust puff where it hits the wall
      const ix = ox + dx * (wallT - 0.05), iz = oz + dz * (wallT - 0.05);
      if (p < 4 || rand() < 0.4) impactFx(ix, ey, iz, -dx, -dz);   // a flash, sparks, a puff off the surface and some chips
      bulletHole(ox, oz, dx, dz, wallT, ey, hole);   // and a hole in it (effects/bullet-holes.js)
      if (p < 2) smoke(ix, ey, iz, -dx * 0.6, 0.2, -dz * 0.6, 0.12, 0.55, 0.7, 0.3, 0x9a8a72);
    } else if (!n && gndT <= endR) groundHit(ox + dx * endT, ey, oz + dz * endT, dx, dz, p);   // into the ground, from your own eyes
  }
  if (anyHit) run.hits++;
  shotB.forEach((h, o) => shootBoard(o, h.d, h.dx, h.dz));
  const quiet = suppressed(D);
  SFX.fire(id, quiet, D.ammo === 'shells');
  shotOut(id, D, mw, ends, trSt, D.dragon ? trPw * 0.45 : trPw, quiet);
  const st = stocked(id) ? STOCK.kick : 1;
  const pw = gunPower(D, shots) * st * (D.powK || 1);   // (a hotter powder kicks harder each shot: POWDER_KICK)
  fireCam(pw, P.aim, fireRate(D) < 0.16); angerShot(fireRate(D)); setBloom(Math.min(18, bloom + D.shake * 34 * st));
  const fx = Math.sin(base), fz = Math.cos(base), big = D.ammo === 'shells' ? 1.5 : D.ammo === 'rifle' ? 1.15 : D.dmg > 60 ? 1.1 : 0.8;
  if (!quiet) {
    // flash parented to the gun so it sits on the real muzzle, wherever the animation has the gun
    holdOf(W8.cur, fireSide(D)).add(flash);
    const L = flashLook(D, fireRate(D) < 0.16), vary = () => 1 + rr(-L.vary, L.vary);   // (each kind of gun's own flash: effects/muzzle-flash.js)
    flash.visible = true; setFlashT(L.life * rr(0.9, 1.1)); setFlashLife(flashT); setFlashSize(L.size * (1 + T('ammo') * 0.15) * vary()); setFlashLen(L.len * vary()); setFlashWide(L.wide * vary());
    flash.position.set(X, GUN_Y + 0.03, MUZ[W8.cur] + 0.03); flash.rotation.set(0, 0, rand() * 6.28);
    flashStar.material.rotation = rand() * 6.28;
    // the light it throws is the flash's own colour, and lights the smoke coming out with it (effects/smoke.js)
    flashes.push({ x: mw.x, y: mw.y, z: mw.z, r: D.ammo === 'shells' ? 7 : 5.5, int: 1.5, col: flashDress(D), t: 0.07, max: 0.07 }); setLmT(0);
  } else { flashes.push({ x: mw.x, y: mw.y, z: mw.z, r: 2.5, int: 0.12, col: [1, 0.8, 0.5], t: 0.05, max: 0.05 }); setLmT(0); }
  if (D.dragon) dragonBreath(mw.x, mw.y, mw.z, base, sp);   // dragon's breath: a jet of fire and burning pellets (effects/puffs.js)
  // smoke: a forward billow from the muzzle, a lazy cloud that hangs, more for shotguns, a thin wisp for suppressed guns
  const puffs = quiet ? 1 : D.ammo === 'shells' ? 4 : D.ammo === 'rifle' || D.dmg > 60 ? 3 : 2;
  if (!quiet && (D.ammo === 'shells' || D.ammo === 'rifle' || D.ammo === 'magnum' || D.dmg > 60)) muzzleWisp(D.ammo === 'shells' ? 1 : 0.75);   // and a wisp that keeps curling off the muzzle after a heavy shot
  for (let k = 0; k < puffs; k++) { const sp2 = rr(0.6, 2.4) * (quiet ? 0.4 : 1); smoke(mw.x + fx * 0.05, mw.y, mw.z + fz * 0.05, fx * sp2 + P.vx * 0.5 + rr(-0.3, 0.3), rr(0.05, 0.35), fz * sp2 + P.vz * 0.5 + rr(-0.3, 0.3), 0.08 * big, (quiet ? 0.35 : rr(0.55, 0.95)) * big, rr(0.8, 1.5), quiet ? 0.22 : rr(0.3, 0.45)); }
  W8.heat = Math.min(3, (W8.heat || 0) + (D.ammo === 'shells' || D.dmg > 60 ? 0.6 : D.rate < 0.12 ? 0.18 : 0.3));
  // sustained fire: every shot widens the spread a little more, up to 2.3 times, until you ease off the trigger
  W8.spray = Math.min(1, (W8.spray || 0) + clamp(0.04 + D.shake * 0.6, 0.06, 0.3) * (D.sprayK || 1) * (stocked(id) ? STOCK.spray : 1) * (unshouldered(D, id) ? HANDGUN.spray : 1)); W8.sprayT = 0;   // a steadier gun opens up slower (D.sprayK)
  if (D.heavy) { W8.heavyF = D.heavy.fire; W8.heavyK = Math.min(1, (W8.heavyK || 0) + HEAVY_FIRE.build); }   // a heavy gun bogs you down as you fire it
  { const sd = fireSide(D); ANIM.slideT[sd] = 0; const kind = (HOLD[id] || HOLD_DEF).kind, auto = fireRate(D) < 0.16; gunKick(sd, pw, kind, auto, EJECT[id], recoilFeel(D, kind, auto)); xhKick(D, id, pw, auto); }   // (the crosshair kicks too: player/shaky-hands.js)
  const ej = EJECT[id];
  if (ej === 'fire') { ejectCasing(D.ammo, shots, 'fire', W8.akSide); if (BELT[W8.cur]) { ejectLinks(shots, 0.535); beltKick(); } if (BIPOD[W8.cur]) bipodKick(); }   // a belt gun throws its links too
  // (a case the gun keeps till it's racked or reloaded stays in the HUD, fired, till then: ui/rounds.js)
  else if (ej === 'pump' || ej === 'bolt') { W8.hudSpent[id] = (W8.hudSpent[id] || 0) + 1; startCycle(id); }
  else if (ej === 'breach') { W8.spent[id] = Math.min(magSize(id), (W8.spent[id] || 0) + shots); W8.hudSpent[id] = Math.min(magSize(id), (W8.hudSpent[id] || 0) + shots); }
  if (S.luck && !anyHit && rand() < S.luck) luckyKeep(id, D);
  }
}
// Lucky shot: a shot that hit nothing (no bullet or pellet of it) sometimes costs nothing at all: the round goes back in
// the magazine (the pair's gun that fired, for akimbo) and one less empty sits in a breech
function luckyKeep(id, D) {
  W8.mag[id]++;
  if (D.akimbo) akMags(id)[W8.akSide < 0 ? 'L' : 'R']++;
  if (EJECT[id] === 'breach') { W8.spent[id] = Math.max(0, (W8.spent[id] || 0) - 1); W8.hudSpent[id] = Math.max(0, (W8.hudSpent[id] || 0) - 1); }
  feed('ammo', 1, 'saved by Lucky shot');
  W8.luckyN = (W8.luckyN || 0) + 1; W8.luckyId = id;   // (the HUD throws the round out and brings it back: ui/rounds.js)
}
