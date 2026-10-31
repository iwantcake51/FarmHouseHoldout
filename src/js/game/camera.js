// Camera follow, aim pan, edge pan, scope view, shake and roll.

import { $ } from '../core/dom.js';
import { CAM_OFF, EL, FWD, GUN_Y, ISO_CAM, RIGHT, setZoom, V3, VIEW, zoom, zoomT } from '../core/renderer.js';
import { cache, clamp, rand, rr, smooth } from '../core/math.js';
import { cxw } from '../world/grid.js';
import { P } from '../player/player.js';
import { curId, SCOPES, T, W8 } from './run-state.js';
import { EJECT } from '../weapons/casings.js';
import { camKick, camPunch, camRoll, setCamPunch, setCamRoll, setShake, shake, state, worldT } from './state.js';
import { aimPt, hasMouse, mouseX, mouseY } from '../input/keyboard-mouse.js';
import { aiming, scopeAim, scoped, scopePt } from '../player/aiming.js';
import { usingTouch } from '../input/touch.js';
import { cinePush, deathRollK, deathZoomK } from '../ui/screens.js';
import { introCam, introCamOn, introRoll, tickIntro } from './intro.js';
import { setT } from '../ui/hud-text.js';
import { camRun, runCam, SPRINT } from '../player/sprint.js';
import { fpAds, isoOn, syncView, viewFrame, viewGround, viewKick } from './view-cam.js';
import { ANIM } from '../player/animation.js';
import { swapSt } from '../player/swap.js';
import { camFocus } from '../net/spectate.js';
import { SET } from '../ui/settings.js';

export const camTarget = new V3(P.x, 0, P.z);
// the vault camera: roll, a vertical bob and a push along the jump, each a damped spring chasing a target that follows
// the jump's progress, so the view leans and settles smoothly instead of snapping or jittering. The push is a 2D spring
// (px, pz), so a new vault that starts before the last one has settled turns it round smoothly instead of flipping it
export const camVault = { roll: 0, vr: 0, bob: 0, vb: 0, px: 0, vpx: 0, pz: 0, vpz: 0 };
// aiming down the sights from above: the gun's raise rides a spring a little under critical (about 5% past, settled
// in a quarter second), so it comes up, a hair past and settles rather than gliding to a stop
const ADS_ISO = { k: 120, d: 16 };
// how far (radians) a wall has the gun tipped down before the sights go down, and how near level before they come back
const WALL_ADS = { on: 0.12, off: 0.03 };
// firing: each shot kicks the view on its own, apart from the gun's kick in the arms (player/hold.js): it tips only a
// little (mostly one way, like a gun climbing: CAM_ROLL, and less again on a full automatic, CAM_ROLL_AUTO, whose kicks
// come too fast to settle) and punches in a touch (CAM_PUNCH: how hard, by the gun's power, so a 9mm barely nudges and
// a shotgun or a rifle thumps), caught on stiff springs that bring it home quickly without wobbling. It doesn't slide
// back along the aim, which only followed the arms being shoved back. Only the heaviest guns rattle the screen
const camRec = { roll: 0, vr: 0, px: 0, vpx: 0, pz: 0, vpz: 0, zoom: 0, vz: 0 };
const CAM_ROLL = 0.22, CAM_ROLL_AUTO = 0.45, CAM_PUNCH = { zoom: 0.02, vz: 0.9, auto: 0.6 };
export function fireCam(pw, aim, auto) {
  const c = camRec, sg = rand() < 0.7 ? 1 : -1, P_ = CAM_PUNCH, a = auto ? P_.auto : 1;
  c.vr += sg * pw * rr(0.5, 0.75) * CAM_ROLL * (auto ? CAM_ROLL_AUTO : 1);
  c.zoom += pw * P_.zoom * a; c.vz += pw * P_.vz * a;
  if (pw > 0.6) setShake(Math.max(shake, 0.03 + (pw - 0.6) * 0.3));
  viewKick(pw, auto);   // (in first person, the view's kicked up: game/view-cam.js)
}
// reloading: a small, smooth rotational jolt on each beat (mag out, mag seated, a shell in, the rack): the view rocks
// one way and settles, with only a whisper of push; seating a mag tips it the other way from pulling one
let reloadRockSide = 1;
export function reloadJolt(s) {
  const c = camRec; reloadRockSide = -reloadRockSide;
  c.vr += reloadRockSide * s * rr(0.85, 1.1); c.vpx -= Math.sin(P.aim) * s * 0.15; c.vpz -= Math.cos(P.aim) * s * 0.15;
}
// working a pump or a bolt: a looser, slower sway than a shot's kick, so the view rides the rack and settles after it
// instead of snapping (weapons/casings.js knocks it on each beat): roll, a push along the aim (back toward you as the
// action's torn back, forward as it slams home) and a little zoom; it pushes less through a scope
const camRack = { roll: 0, vr: 0, px: 0, vpx: 0, pz: 0, vpz: 0, zoom: 0, vz: 0 };
export function rackCam(roll, push, zm) {
  const c = camRack, k = 1 - 0.6 * (ANIM.scopeK || 0);
  c.vr += roll * rr(0.85, 1.15); c.vpx += Math.sin(P.aim) * push * k; c.vpz += Math.cos(P.aim) * push * k; c.vz += zm;
}
// taking a hit: the view's knocked a little the way the blow goes (away from what hit you), tipped toward that side
// and pushed in a touch. It's an impulse given to a soft spring that eases straight back with barely a sway, never a
// jump, and it adds onto everything else the camera's doing (CAM_HIT: how far for a usual hit; a harder one more)
const camHit = { roll: 0, vr: 0, px: 0, vpx: 0, pz: 0, vpz: 0, zoom: 0, vz: 0 };
const CAM_HIT = { push: 2.2, roll: 0.42, zoom: 0.3, k: 90, d: 11 };   // (a touch under its damping, so a blow shakes the view back and forth along the line it came in on as it settles)
export function hitCam(x, z, amount) {
  const c = camHit, k = clamp(amount || 1, 0.4, 2), dx = P.x - x, dz = P.z - z, L = Math.hypot(dx, dz);
  if (L > 1e-3) { c.vpx += dx / L * CAM_HIT.push * k; c.vpz += dz / L * CAM_HIT.push * k; }
  const side = L > 1e-3 ? Math.sign(dx * RIGHT.x + dz * RIGHT.z) || 1 : rand() < 0.5 ? -1 : 1;
  c.vr += side * CAM_HIT.roll * k * rr(0.8, 1.1); c.vz += CAM_HIT.zoom * k;
}
export function springTo(o, key, vkey, target, k, damp, dt) { const a = -k * (o[key] - target) - damp * o[vkey]; o[vkey] += a * dt; o[key] += o[vkey] * dt; }
function vaultCam(rdt) {
  const v = P.vault, c = camVault;
  let roll = 0, bob = 0, push = 0;
  if (v) {
    if (v.t <= 0) { const k = smooth(clamp(v.pre / v.preDur, 0, 1)); roll = v.side * 0.02 * k; bob = -0.04 * k; }   // settle back the other way as you load the jump
    else { const h = Math.sin(Math.min(1, v.t) * Math.PI); roll = -v.side * 0.065 * h; bob = 0.05 * h; push = 0.16 * Math.min(1, v.t); }   // tip into the jump and back level by the landing
  }
  // small fixed steps so the springs stay smooth however long the frame was
  for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++) {
    springTo(c, 'roll', 'vr', roll, 70, 11, dt); springTo(c, 'bob', 'vb', bob, 80, 10, dt);
    springTo(c, 'px', 'vpx', v ? v.dx * push : 0, 40, 11, dt); springTo(c, 'pz', 'vpz', v ? v.dz * push : 0, 40, 11, dt);
    springTo(camRec, 'roll', 'vr', 0, 130, 17, dt); springTo(camRec, 'zoom', 'vz', 0, 260, 27, dt);   // (stiff and near critically damped: the punch comes straight home, no wobble)
    springTo(camRec, 'px', 'vpx', 0, 230, 26, dt); springTo(camRec, 'pz', 'vpz', 0, 230, 26, dt);
    springTo(camRack, 'roll', 'vr', 0, 55, 6.5, dt); springTo(camRack, 'zoom', 'vz', 0, 70, 7, dt);
    springTo(camRack, 'px', 'vpx', 0, 60, 7.5, dt); springTo(camRack, 'pz', 'vpz', 0, 60, 7.5, dt);
    for (const key of ['roll', 'px', 'pz', 'zoom']) springTo(camHit, key, 'v' + (key === 'roll' ? 'r' : key === 'zoom' ? 'z' : key), 0, CAM_HIT.k, CAM_HIT.d, dt);
  }
}
// the jolts handed on to first person (a reload's, a rack's, a shot's, a hit's): pushes along the ground and a zoom
const FP_JOLT_IN = { px: 0, pz: 0, zoom: 0 };
let titleSpin = 0;
export const TITLE_ZOOM = 0.8;
// the cursor near an edge of the screen eases the view a little that way, so you can see a bit further where you're
// looking: from EDGE_IN of the way in from an edge, up to EDGE_PAN of the screen's height at the very edge
const EDGE_IN = 0.14, EDGE_PAN = 0.09, camEdge = { x: 0, y: 0 };
const edgeK = t => t < EDGE_IN ? -smooth(1 - t / EDGE_IN) : t > 1 - EDGE_IN ? smooth((t - 1 + EDGE_IN) / EDGE_IN) : 0;
// camera follow, aim pan, scope view, zoom, shake, kick and roll
export function updateCamera(rdt) {
  // first person or the free camera: the target's under the view, for what's laid out round it (game/view-cam.js)
  syncView(); const iso = isoOn();
  if (!iso) { viewGround(camTarget); if (state === 'play') tickIntro(rdt); }
  else if (state === 'title') { titleSpin += rdt * 0.08; camTarget.set(cxw(21) + Math.sin(titleSpin) * 3, 0, cxw(22) + Math.cos(titleSpin) * 3); }
  else if (scoped) {
    // put the scope point (at gun height) in the middle of the screen
    const vd = CAM_OFF.clone().normalize(), k = GUN_Y / vd.y, gx = scopePt.x - vd.x * k, gz = scopePt.z - vd.z * k;
    camTarget.x += (gx - camTarget.x) * Math.min(1, rdt * 14); camTarget.z += (gz - camTarget.z) * Math.min(1, rdt * 14);
    setT('scopeRng', Math.round(Math.hypot(scopePt.x - P.x, scopePt.z - P.z)) + ' m');
  }
  else {
    // keep the character's chest in the middle of the screen; no lead toward the aim, which used to drag the world under the cursor
    const vd = CAM_OFF.clone().normalize(), k = 0.85 / vd.y;
    // aiming down the sights leans the view a little toward where you're looking
    let px = 0, pz = 0; const ads = ANIM.ads || 0;
    // a scoped rifle leans the view further out toward the aim (and zooms in more, below)
    if (ads > 0.01) { const sk = ANIM.scopeK || 0, lean = 0.42 + 0.2 * sk, cap = 5.5 + 3 * sk; px = (aimPt.x - P.x) * lean; pz = (aimPt.z - P.z) * lean; const pl = Math.hypot(px, pz); if (pl > cap) { px *= cap / pl; pz *= cap / pl; } px *= ads; pz *= ads; }
    { const on = state === 'play' && hasMouse && !usingTouch && !P.dead && !introCamOn(), ex = on ? edgeK(clamp(mouseX / innerWidth, 0, 1)) : 0, ey = on ? edgeK(clamp(mouseY / innerHeight, 0, 1)) : 0;
      camEdge.x += (ex - camEdge.x) * Math.min(1, rdt * 3); camEdge.y += (ey - camEdge.y) * Math.min(1, rdt * 3);
      const m = EDGE_PAN * 2 * VIEW / zoom;   // screen right is RIGHT on the ground; screen down is back toward the camera, stretched by the tilt
      px += (RIGHT.x * camEdge.x - FWD.x * camEdge.y / Math.sin(EL)) * m; pz += (RIGHT.z * camEdge.x - FWD.z * camEdge.y / Math.sin(EL)) * m; }
    const fo = camFocus(), gx = fo.x + px - vd.x * k, gz = fo.z + pz - vd.z * k;   // (down in co-op: a teammate, net/sync.js)
    if (state === 'play') tickIntro(rdt);
    if (introCamOn()) introCam(gx, gz, rdt);   // the glide in at the start of a run (game/intro.js)
    else { camTarget.x += (gx - camTarget.x) * Math.min(1, rdt * 6); camTarget.z += (gz - camTarget.z) * Math.min(1, rdt * 6); }
  }
  if (!introCamOn()) setZoom(zoom + ((zoomT - zoom) * Math.min(1, rdt * 10)));

  // (and not while the gun's still being brought back up into your hands, off a vault or being drawn: the sights come
  // up once it's there, as long as you're still holding aim)
  // (nor while a wall has the gun tipped down out of the way, player/hold.js gunPush: the sights would come up to your
  // eye with the gun pointing at the floor; they go down as it tips, WALL_ADS.on radians, and come back once it's all
  // but level again, WALL_ADS.off, so it doesn't flicker at the edge)
  { const tip = ANIM.gtipA || 0; ANIM.wallAds = tip > WALL_ADS.on || (!!ANIM.wallAds && tip > WALL_ADS.off); }
  // (nor, from your own eyes, while a break-open gun's being loaded: the double's barrels dropped open, the revolver's
  // cylinder swung out, right at your eye, the muzzles coming up into your face; it's brought down off the eye for it,
  // and back up to it once it's shut, if you're still holding aim)
  { const want = aiming && !(P.skid > SPRINT.skid * 0.4) && !(!iso && (swapSt || P.vault || (ANIM.postVault || 0) > 0.2 || ANIM.wallAds || ((W8.reloading || W8.shutT > 0) && EJECT[curId()] === 'breach')));   // skidding out of a sprint, into the sights as you slow
    // (in first person, steadily over the time it takes, eased at both ends: game/view-cam.js)
    // (from above, on a spring a little under critical, ADS_ISO: the gun comes up, a hair past and settles, and drops
    // back the same; adsP has the overshoot, for the pose, ads stays 0..1 for everything else)
    if (iso) { fpAds(null); const t = want ? 1 : 0, A = ADS_ISO; ANIM.adsP = ANIM.adsP ?? (ANIM.ads || 0); ANIM.adsPV = ANIM.adsPV || 0;
      for (let n = Math.ceil(rdt / (1 / 240)), h = rdt / Math.max(1, n), i = 0; i < n; i++) { ANIM.adsPV += ((t - ANIM.adsP) * A.k - ANIM.adsPV * A.d) * h; ANIM.adsP += ANIM.adsPV * h; }
      ANIM.ads = clamp(ANIM.adsP, 0, 1); } else { ANIM.ads = fpAds(want, rdt); ANIM.adsP = ANIM.ads; ANIM.adsPV = 0; } }
  ANIM.scopeK = (ANIM.scopeK || 0) + ((scopeAim() ? SCOPES[T('sight')].view : 0) - (ANIM.scopeK || 0)) * Math.min(1, rdt * 7);
  ISO_CAM.zoom = state === 'title' ? TITLE_ZOOM * cinePush() : zoom * (1 + 0.13 * ANIM.ads + 0.38 * ANIM.scopeK + 0.12 * (ANIM.healFx || 0));   // bandaging leans the view in slowly
  { const vo = (Math.round(ANIM.ads * 40) / 40).toFixed(3); if (cache.adsV !== vo) { cache.adsV = vo; $('adsVig').style.opacity = (vo * 0.8).toFixed(3); } }
  setShake(Math.max(0, shake - rdt * 1.6));
  const shk = SET.shake / 100, sh = shake * shake * 1.2 * shk;   // (as hard as the settings let it: ui/settings.js)
  const kf = Math.exp(-rdt * 16); camKick.x *= kf; camKick.z *= kf; setCamRoll(camRoll * Math.exp(-rdt * 4.5));
  const cc = P.conc || 0, wob = cc > 0 ? Math.sin(worldT * 2.38) * 0.05 * cc : 0;
  vaultCam(rdt); runCam();
  const cv = camVault, cr = camRec, ck = camRack, cu = camRun, ch = camHit;
  FP_JOLT_IN.px = (cr.px + ck.px + ch.px) * shk; FP_JOLT_IN.pz = (cr.pz + ck.pz + ch.pz) * shk; FP_JOLT_IN.zoom = (cr.zoom * 0.35 + ck.zoom + ch.zoom) * shk;
  viewFrame(rdt, (camRoll + cr.roll + ck.roll + ch.roll) * shk + wob + cv.roll, sh, FP_JOLT_IN);   // (placed in first person or flown, with the pushes and zooms it feels as well: game/view-cam.js)
  if (!iso) return;
  const vx = (camKick.x + cr.px + ck.px + ch.px) * shk + cv.px + cu.px, vz = (camKick.z + cr.pz + ck.pz + ch.pz) * shk + cv.pz + cu.pz;
  setCamPunch(camPunch * Math.exp(-rdt * 9)); ISO_CAM.zoom *= (1 + (cr.zoom * 0.35 + ck.zoom + ch.zoom + camPunch) * shk) * deathZoomK();   // (going down: ui/screens.js)
  ISO_CAM.position.set(camTarget.x + vx + CAM_OFF.x + rr(-sh, sh), CAM_OFF.y + cv.bob + cu.bob + rr(-sh, sh), camTarget.z + vz + CAM_OFF.z + rr(-sh, sh));
  ISO_CAM.lookAt(camTarget.x + vx, cv.bob + cu.bob, camTarget.z + vz); ISO_CAM.rotateZ((camRoll + cr.roll + ck.roll + ch.roll) * shk + wob + cv.roll + introRoll() + deathRollK()); ISO_CAM.updateProjectionMatrix();
}
