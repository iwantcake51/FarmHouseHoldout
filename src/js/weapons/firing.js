// Spread, muzzle and aim rays, exact part hits under the crosshair, and firing guns.

import { $, replay } from '../core/dom.js';
import { cam, FP_CAM, GUN_Y, V3 } from '../core/renderer.js';
import { angDiff, clamp, rand, rr, smooth } from '../core/math.js';
import { cell, ci, idx, inb, OPEN, openAt } from '../world/grid.js';
import { thinNear, thinRay } from '../world/thin-walls.js';
import { HOUSE_FP, surfaceY } from '../world/house.js';
import { blockArr, bulletBlocked, bulletBlockedAt, inCellBox } from '../world/collision.js';
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
import { armoredAt, hurtZombie, partAt, pickPart, setCritNext, setHeadNext, setHitY } from '../zombies/damage.js';
import { explode, flashes } from './explosives.js';
import { boardsCrossed, shootBoard } from '../barricades/planks.js';
import { SFX } from '../audio/sfx.js';
import { bloom, setBloom, setLmT, worldT } from '../game/state.js';
import { aimPt, hasMouse, mouseX, mouseY } from '../input/keyboard-mouse.js';
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
import { XHIT, xhKick, XR } from '../player/shaky-hands.js';
import { fpOn, xhAt } from '../game/view-cam.js';
import { fireCam } from '../game/camera.js';
import { angerShot, ANIM, worryShot } from '../player/animation.js';
import { HOLD, HOLD_DEF, holdOf } from '../player/hold.js';
import { gunKick, recoilFeel } from '../player/hold-kick.js';
import { beltKick, bipodKick } from '../player/hold-sway.js';
import { shotOut } from '../net/avatars.js';

// how hard a shot hits back, from what it does to a zombie: 9mm about 0.1-0.2, rifle rounds and magnums 0.3-0.8,
// the hunting rifle and shotguns up to about 1.2 (a double barrel firing both)
// (by the round's own weight, not a hotter powder's extra damage: the powder's kick is its own, D.powK)
const gunPower = (D, shots) => clamp(D.dmg / (D.powDmg || 1) * Math.pow(D.pellets || 1, 0.85) * Math.pow(shots, 0.6) / 130, 0.08, 1.25);
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
const POW_PUNCH = 0.5;
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
// down the sights the first shots of a string go where the sights are (ADS_FIRST): the first n of them dead on standing
// still, and the cone opens back up to all it would be over the next ramp shots; on the move even the first ones
// spread, but only move of what they would (shots more than gap seconds apart each start a string of their own). A
// gun with adsBloom (the LMG) goes on opening the longer a burst runs, by as much again as that at most, over bloomN
// shots. Not a shotgun: its pellets always spread
const ADS_FIRST = { n: 2, ramp: 3, move: 0.35, gap: 0.45, bloomN: 10 };
// (how many shots of this string have gone already)
const burstN = () => (W8.sprayT ?? 9) < ADS_FIRST.gap ? W8.burst || 0 : 0;
export function spreadOf(id) {
  // hip fire is a bit loose (aiming down the sights is far tighter), walking more than doubles it (+30% while aiming,
  // less with a sight: D.aimMove), holding the trigger opens it further
  const mv = P.mvS ?? clamp(Math.hypot(P.vx || 0, P.vz || 0) / 3, 0, 1);
  const D = W(id), pel = (D.pellets || 1) > 1; let s = D.spread * S.spreadMul * (1 + (P.conc || 0) * 1.6) * (aiming ? 0.5 * (D.aimK || 1) : 1.3 * (D.hipK || 1)) * (1 + mv * (aiming ? 0.3 * (D.aimMove ?? 1) : RUN_SPREAD * (D.mobile || 1) * (pel ? SG_RUN : 1))) * (1 + (W8.spray || 0) * 1.3 * (pel ? SG_SPRAY : 1));
  if (aiming && !pel && D.ammo !== 'shells') {
    const A = ADS_FIRST, b = burstN(), open = b < A.n ? 0 : Math.min(1, (b - A.n + 1) / A.ramp);
    s *= Math.max(open, mv * A.move);
    if (D.adsBloom) s *= 1 + D.adsBloom * clamp((b - A.n) / A.bloomN, 0, 1);
  }
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
// spread. And there the pattern's round, all around the middle, not one flat line: each pellet's thrown up or down as
// far as sideways (SG_FP.v of its spread), and never lands outside that ring
export const SG_FP = { ring: 0.7, v: 1 };
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
// a round that meets nothing: how far its streak runs on before it's out of sight (the view's far edge), and its smoke
const FLY = { far: 180, smoke: 60 };
// from your own eyes a round fired up over the house meets its ceiling or its roof: anywhere over the house between its
// eaves and about its ridge (ROOF_ZONE, metres up); over that it's clear
const ROOF_ZONE = [2.5, 4.5];
// the most a round's ever steered off the line it's fired along onto the body under the crosshair (radians)
const TGT_OFF = 0.6;
// how far a round can reach anything: from above, a little past the edge of the view (top); from your own eyes, out past
// the edge of the farm to the zombies coming in out of the fog beyond it, as far as you can see them (fp); its way checked
// every 10 cm out to the top's reach, and in bigger steps (step) past it, where there's nothing but the ground
const SHOT_REACH = { top: 26, fp: 75, step: 0.25 };
const underRoof = (x, z, y) => { if (y < ROOF_ZONE[0] || y > ROOF_ZONE[1]) return false; const i = ci(x), j = ci(z); return inb(i, j) && HOUSE_FP[idx(i, j)] === 1; };
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
  const k = idx(i, j); if ((blockArr[k] && inCellBox(k, x, z)) || thinNear(x, z, 0.07)) return true;
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
let ctKey = '', ctHit = null; const _ctP = [0, 0];
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
  // (kept for the frame: by the world's clock, where the crosshair is and where the camera looks. The clock alone stands
  // still through a hit-stop, and from your own eyes the crosshair's always in the middle, so turning onto another
  // zombie inside one kept the old one under it, and a shotgun's pattern, centred on it, went off sideways into it)
  xhAt(_ctP); const q = cam.quaternion, key = worldT + ':' + _ctP[0] + ':' + _ctP[1] + ':' + q.x.toFixed(5) + q.y.toFixed(5) + q.z.toFixed(5) + ':' + cam.position.x.toFixed(3) + cam.position.z.toFixed(3); if (key === ctKey) return ctHit;
  _pn.set(_ctP[0] / innerWidth * 2 - 1, -(_ctP[1] / innerHeight) * 2 + 1); partRay.setFromCamera(_pn, cam);   // under the crosshair, which wanders at low health (and from your own eyes kicks with the gun: xhAt)
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
// from your own eyes, how far the crosshair as it's drawn (with its sway, wander and kick, and at the hip the gun's own
// kick on top: game/view-cam.js, xhAt) has the line of fire turned off the line the shot's worked out along, the one
// your eye looks down to what it meets (aimPt): up (p) and round the way P.aim turns (y). The barrel's turned just that
// far with it, so a round turned the same goes out along the barrel and its tracer climbs with the gun
const _soR = new THREE.Raycaster(), _soN = new THREE.Vector2(), _soP = [0, 0], SHOT_OFF = { p: 0, y: 0 };
const rayAngs = (x, y) => { _soN.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); _soR.setFromCamera(_soN, FP_CAM); const d = _soR.ray.direction; return [Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(d.x, d.z)]; };
// (at the hip: down the sights the gun's on your eye and the round goes down them, so it fades out as they come up)
function shotOff() {
  xhAt(_soP); const [ap, ay] = rayAngs(_soP[0], _soP[1]), [bp, by] = rayAngs(mouseX, mouseY), k = 1 - clamp(ANIM.ads || 0, 0, 1);
  SHOT_OFF.p = (ap - bp) * k; SHOT_OFF.y = angDiff(ay, by) * k; return SHOT_OFF;
}
// the point your line of sight's on (aimPt, at the height you're aiming: ANIM.aimY) turned about your eye by o, as far off
const _spE = new V3(), _spT = new V3();
function shotPt(o) {
  FP_CAM.getWorldPosition(_spE);
  const vx = aimPt.x - _spE.x, vy = (ANIM.aimY ?? GUN_Y) - _spE.y, vz = aimPt.z - _spE.z, h = Math.hypot(vx, vz), L = Math.hypot(h, vy);
  if (L < 0.05) return null;
  const p = clamp(Math.atan2(vy, h) + o.p, -1.4, 1.4), y = Math.atan2(vx, vz) + o.y;
  return _spT.set(_spE.x + L * Math.cos(p) * Math.sin(y), _spE.y + L * Math.sin(p), _spE.z + L * Math.cos(p) * Math.cos(y));
}
// side: which of an akimbo pair fires (weapons/akimbo.js), each from its own mag
// a round into the ground: a spurt of dirt kicked up and back toward where it came from, and its flash (and from a
// teammate's shot the same: net/avatars.js)
export function groundHit(x, y, z, dx, dz, p = 0) {
  if (p < 4 || rand() < 0.4) impactFx(x, y + 0.02, z, -dx * 0.4, -dz * 0.4, 'dirt');
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
  if ((W8.mag[id] || 0) <= 0) { W8.cd = 0.25; if (semiAuto(id)) W8.trigLock = true; SFX.dry(); worryShot(); replay($('ammoWarn'), 'kick'); return; }
  shots = D.both && W8.mag[id] >= 2 ? 2 : 1;
  W8.mag[id] -= shots; W8.cd = fireRate(D) / S.rateMul; run.shots++; delete W8.relSave[id];
  if (D.burst && W8.burstLeft <= 0 && !W8.inBurst) { W8.burstLeft = D.burst - 1; W8.burstT = 0.06; }   // a burst, then another while it's held
  else if (!W8.inBurst && (semiAuto(id) || D.breakOpen)) W8.trigLock = true;   // one shot a pull (the double barrel too: as fast as you can pull, with no wait between, D.rate)
  }
  // from your own eyes the point the shot's sent to is turned about your eye with the crosshair (shotOff), and the round
  // goes to it from the muzzle: so it leaves along the barrel as the kick has it, closing on the crosshair just as it
  // does at rest, however far the kick has lifted the muzzle as well as turned it
  const fpo = fpOn() && !D.akimbo && hasMouse ? shotOff() : null, fpT = fpo ? shotPt(fpo) : null;
  const { ox, oz, a: base0 } = muzzle(), base = fpT && Math.hypot(fpT.x - ox, fpT.z - oz) > 0.05 ? Math.atan2(fpT.x - ox, fpT.z - oz) : base0;
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
  if (tgt) { tgtA = Math.atan2(tgt.x - ox, tgt.zz - oz); tgtT = Math.hypot(tgt.x - ox, tgt.zz - oz); if (Math.abs(angDiff(tgtA, base)) > TGT_OFF && tgtT > 1) tgt = null; }   // (never one well off the line the shot's going along: TGT_OFF)
  if (tgt) { for (let t = 0.1; t < tgtT; t += 0.1) if (bulletBlocked(ox + Math.sin(tgtA) * t, oz + Math.cos(tgtA) * t)) { tgt = null; break; } if (tgt && thinRay(ox, oz, Math.sin(tgtA), Math.cos(tgtA), tgtT) < tgtT) tgt = null; }
  let anyHit = false;
  // looking through a scope: the spread depends on the range (and a sniper's headshots crit)
  const scopeOn = scopeUse(), sp = P.eye > 0 && (D.pellets || 1) === 1 ? 0 : scopeOn ? scopeSpread(id, scopeDist()) : spreadOf(id), critC = (D.critT || 0) + (aiming && D.aimCrit ? D.aimCrit : 0), critX = Math.max(D.critM || 0, 2) + (D.critUp || 0);
  // Sure shot: a gun firing single shots rolls once a shot for a crit, whatever it hits (SURE_CRIT)
  const sure = S.sureShot && semiAuto(id) && rand() < SURE_CRIT;
  const pellets = (D.pellets || 1) * shots, pierce = D.pierce || 0;
  // tracers by how hard the round hits (effects/tracers.js); a suppressed round's is a little dimmer
  // a suppressed round's streak is a dim grey one, not a glowing one, and it leaves smoke instead (effects/tracers.js)
  const quietR = suppressed(D), trPw = tracerPower(D), trSt = D.ignite ? 'dragon' : quietR ? 'supp' : T('ammo') >= 2 ? 'hot' : 'std';
  if (quietR) suppHeat(id, trPw, T('ammo'));   // (the can warms with each round through it, quicker behind a hotter powder: effects/supp-heat.js)
  const ends = [];   // where the tracers end, for your teammates' screens (net/avatars.js)
  const shotB = new Map();   // the boards the shot goes through, and how hard (barricades/planks.js)
  for (let p = 0; p < pellets; p++) {
    // a shotgun's pattern is centred on what the crosshair sits on (the first pellet lands exactly there), not on the
    // ground under the cursor, which from this camera is off to one side of a zombie's head
    // (a lone round spreads like any other, even with the crosshair on a body: it still hits the part you aimed at if
    // it lands near enough to it at that range, AIM_KEEP, so up close it goes where you put it, and further off it's off
    // the mark by as much as its spread throws it, and so is anything on past it)
    // (from your own eyes a lone round's thrown anywhere inside the round spread, up and down as much as sideways, evenly
    // over it: from above only sideways shows, so it's only sideways there)
    const one = pellets === 1, fpd = one && fpOn(), dr = fpd ? sp * Math.sqrt(rand()) : 0, da = rand() * Math.PI * 2;
    const dev = one ? (fpd ? dr * Math.cos(da) : (rand() - 0.5) * 2 * sp) : 0, dv = fpd ? dr * Math.sin(da) : 0;
    const aimed = p === 0 && tgt && (!one || Math.hypot(Math.sin(dev), Math.sin(dv)) * tgtT < AIM_KEEP);
    // (from your own eyes the pattern's round and inside the ring, SG_FP: each pellet thrown up or down as far as sideways,
    // and one that would land outside the ring pulled back in to its edge)
    let po = pellets > 1 && !aimed ? pelletOff(sp) : 0, pv = one && !aimed ? dv : 0;
    if (fpOn() && pellets > 1 && !aimed) { const R = SG_FP.ring * sp; pv = pelletOff(sp) * SG_FP.v; const r = Math.hypot(po, pv); if (r > R) { const k = R * rr(0.85, 1) / r; po *= k; pv *= k; } }
    const a = p === 0 && tgt && one ? tgtA + dev : aimed ? tgtA : (pellets > 1 && tgt ? tgtA : base) + (pellets > 1 ? po : dev), dx = Math.sin(a), dz = Math.cos(a);
    // how high the round is along its way: from the muzzle to the part under the crosshair it was aimed at (or the
    // height you're aiming at, out where you're aiming), and on past at the same slope. Every zombie after the first it
    // goes through, and any in front of the one it was aimed at, is hit where that height meets it (partAt), or not at
    // all if it passes over; what it misses doesn't use up a pierce
    // (in first person every zombie on its way is met at its height: a round over one's head goes over it, game/view-cam.js;
    // and the round flies the line you looked down, up into the sky or down into the ground, where it stops: gndT)
    const fp = fpOn(), y0 = mw.y;
    let slope = tgt ? (tgt.y - y0) / Math.max(0.5, tgtT) : fpT ? (fpT.y - y0) / Math.max(0.05, Math.hypot(fpT.x - ox, fpT.z - oz)) : ((ANIM.aimY ?? GUN_Y) - y0) / Math.max(fp ? 0.05 : 1, Math.hypot(aimPt.x - ox, aimPt.z - oz));   // (from your own eyes through the very point the crosshair's on, however near)
    if (pv) slope += Math.tan(pv);   // (up or down: SG_FP, or a lone round's own spread)
    const reach = fp ? SHOT_REACH.fp : SHOT_REACH.top;
    let wallT = reach, gndT = 99;
    for (let t = 0.1; t < reach; t += t < SHOT_REACH.top ? 0.1 : SHOT_REACH.step) {
      if (fp ? bulletBlockedAt(ox + dx * t, oz + dz * t, y0 + slope * t) || underRoof(ox + dx * t, oz + dz * t, y0 + slope * t) : bulletBlocked(ox + dx * t, oz + dz * t)) { wallT = t; break; }
      if (fp && slope < -1e-4 && y0 + slope * t <= surfaceY(ox + dx * t, oz + dz * t)) { gndT = t; break; }
    }
    wallT = thinRay(ox, oz, dx, dz, wallT);   // (an inside wall: world/thin-walls.js)
    const endR = Math.min(wallT, gndT, D.maxRange || reach);   // how far it can do anything: a wall, the ground, or where a dragon's breath pellet burns out
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
      // (from your own eyes, by how far off the aim point the pellet's own line really passes, up and down as well as across)
      if (!part && tgt && k === 0 && z === tgt.z && pellets > 1 && Math.hypot(Math.sin(a - tgtA) * hits[k].t, (fp ? Math.tan(pv) : pelletOff(sp)) * hits[k].t) * patTight(hits[k].t) < (PELLET_CORE[tgt.part] || 0.2)) part = z.limbs[tgt.part] === false ? 'torso' : tgt.part;
      // and from your own eyes every pellet, like a lone round, hits what's at its height where it meets the zombie (over
      // its head or between its legs, nothing): not a part picked anywhere on the body, which put the blood and the mist
      // on a leg when the pellet's streak ended at the chest, as if it had curved down into it
      if (!part && (m > 0 || fp || (tgt && z !== tgt.z)) && (pellets === 1 || fp)) { part = partAt(z, y0 + slope * hits[k].t, clamp(off / r, -1, 1), side); if (!part) continue; }
      hits[m++] = hits[k];
      part = part || pickPart(z, clamp(off / r, -1, 1), side, D);
      if (P.eye > 0) part = z.limbs.head ? 'head' : 'torso';   // a dead eye: every hit's a headshot (co-op Bullet time, zombies/damage.js)
      if (D.ignite && !z.dead && !armoredAt(z, part)) { if (!(z.burn > 0)) { z.burnFrom = part; z.burnAge = 0; } z.burn = 3; }   // dragon's breath: it catches where it's hit, and spreads from there (zombies/ai.js); not on armour
      // a crit: every headshot a sniper lands through a scope (D.headCrit), a tuned gun's own (D.critT), the
      // revolver's aimed Dead-eye (D.aimCrit), or a Sure shot
      const crit = sure || (scopeOn && D.headCrit && part === 'head') || (critC > 0 && rand() < critC); setCritNext(crit); setHeadNext(headFade(id, hits[k].t));
      setHitY(aimed && z === tgt.z ? tgt.y : fp ? y0 + slope * hits[k].t : null);   // (how high it struck: a helmet only guards the top of the head, zombies/damage.js)
      hurtZombie(z, D.dmg * S.dmgMul * suppMul(D) * Math.pow(D.pierceKeep ?? PIERCE_KEEP, m - 1) * falloff(id, hits[k].t) * (crit ? critX : 1), dx, dz, D.kick * falloff(id, hits[k].t), id, part);
      setHitY(null);
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
    const endK = n ? 0 : wallT < reach && wallT <= endR ? 1 : gndT <= endR ? 2 : 0;
    // a round that meets nothing at all flies on out of sight: its streak runs on to the edge of the view (FLY.far, or
    // down to where its line meets the ground out there) rather than stopping dead in mid-air at its range, and it's
    // marked for your teammates' screens the same way (3: into the distance)
    const free = !n && wallT >= reach && gndT > endR && endR >= reach, flyT = free ? (fp && slope < -1e-4 ? Math.min(FLY.far, Math.max(endT, y0 / -slope)) : FLY.far) : endT;
    const fy = free && fp ? y0 + slope * flyT : ey, sky = free && flyT >= FLY.far, fK = free ? (sky ? 3 : 2) : endK;
    // (dragon's breath: its own burning pellets show the shot, so just a couple of faint tracers through them)
    if (D.dragon ? p < 2 : p < 4 || rand() < 0.5) { tracer(trO.x, trO.y, trO.z, ox + dx * flyT, fy, oz + dz * flyT, D.dragon ? trPw * 0.45 : trPw, trSt, sky); if (ends.length < 5) ends.push([ox + dx * flyT, fy, oz + dz * flyT, fK, hole]); }
    if (p === 0) { const sT = Math.min(flyT, FLY.smoke); smokeTrail(trO.x, trO.y, trO.z, ox + dx * sT, free && fp ? y0 + slope * sT : ey, oz + dz * sT, smokeOf(D, id, quietR, pellets === shots)); }   // big calibres leave smoke in the air, and every suppressed round a thicker, longer-lasting trail of it
    if (D.explode && (n || wallT < reach)) explode(ox + dx * endT, oz + dz * endT, D.explode, 45, true, false, true);
    else if (!n && wallT < reach && wallT <= endR) {   // sparks and a little dust puff where it hits the wall
      const ix = ox + dx * (wallT - 0.05), iz = oz + dz * (wallT - 0.05);
      if (p < 4 || rand() < 0.4) impactFx(ix, ey, iz, -dx, -dz, 'wood');   // a flash, splinters, a puff off the surface (effects/puffs.js)
      bulletHole(ox, oz, dx, dz, wallT, ey, hole);   // and a hole in it (effects/bullet-holes.js)
      if (p < 2) smoke(ix, ey, iz, -dx * 0.6, 0.2, -dz * 0.6, 0.12, 0.55, 0.7, 0.3, 0x9a8a72);
    } else if (!n && gndT <= endR) groundHit(ox + dx * endT, ey, oz + dz * endT, dx, dz, p);   // into the ground, from your own eyes
    else if (free && !sky) groundHit(ox + dx * flyT, fy, oz + dz * flyT, dx, dz, p);   // (or further out, past its range)
  }
  if (anyHit) run.hits++;
  shotB.forEach((h, o) => shootBoard(o, h.d, h.dx, h.dz));
  const quiet = suppressed(D);
  SFX.fire(id, quiet, D.ammo === 'shells');
  shotOut(id, D, mw, ends, trSt, D.dragon ? trPw * 0.45 : trPw, quiet);
  const st = stocked(id) ? STOCK.kick : 1;
  const pw = gunPower(D, shots) * st * (1 + ((D.powK || 1) - 1) * POW_PUNCH);   // (a hotter powder kicks harder each shot: POWDER_KICK, half of it as a harder punch all round, its climb and swing aside by the gun's kickUp and kickSide, game/run-state.js)
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
  W8.burst = burstN() + 1;   // (this string's count: ADS_FIRST)
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
