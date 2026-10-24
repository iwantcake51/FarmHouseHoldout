// First person and the free camera: the two ways to see the farm besides the isometric view (game/camera.js). First
// person's picked in the settings (or with the view key: input/keybinds.js), the free camera in the cheat menu.
// First person looks out of your own eyes. The mouse turns your head and your aim, up and down as well as round (the
// pointer's locked to the game while you play), and W A S D walk you forward, back and to either side of where you
// face. The view rides your head as it moves (a stride, a vault, a stumble), smoothed so a step is a gentle sway and
// never a jolt; shots kick it up and blows knock it aside, each eased home on a spring. Your own head isn't drawn, so
// you look out from where your eyes are, your arms and the gun in them below.
// The free camera flies anywhere to watch: W A S D along where it looks, Space and Ctrl up and down, Shift faster and
// the wheel its speed. You stay where you were, and every zombie shows wherever it is.
import { $ } from '../core/dom.js';
import { KB } from '../input/keybinds.js';
import { CAM_OFF, cv, FP_CAM, GUN_Y, ISO_CAM, R, setCam, V3 } from '../core/renderer.js';
import { clamp, rr, smooth } from '../core/math.js';
import { thinRay } from '../world/thin-walls.js';
import { bulletBlocked } from '../world/collision.js';
import { P, PM } from '../player/player.js';
import { curId, SCOPES, T, W, W8 } from './run-state.js';
import { GM, gunMeshes, HOLDS, MUZ, X } from '../weapons/gun-materials.js';
import { SPRITE_AIM, SPRITE_RES } from '../effects/sprite-batch.js';
import { openSt } from '../stations/station-ui.js';
import { state } from './state.js';
import { keys, lockLost } from '../input/keyboard-mouse.js';
import { aimSX, aimSY } from '../player/shaky-hands.js';
import { ANIM } from '../player/animation.js';
import { cheatOn } from '../ui/cheats.js';
import { SET, setOpen } from '../ui/settings.js';

// mode: the view picked; on: the one in use this frame (the isometric one on the menus and when you're down)
export const VCAM = { mode: 'iso', on: 'iso', yaw: Math.PI, pitch: 0, aimY: GUN_Y };
export const fpOn = () => VCAM.on === 'fp', freeOn = () => VCAM.on === 'free', isoOn = () => VCAM.on === 'iso';
// how it looks and moves: the eye's place on the head (from its middle: up, forward), how quickly it follows the head
// across and up and down (the stride's bob, smoothed), the furthest up and down you can look, a shot's kick and how
// it comes home, how far aiming down the sights draws the view in, and the free camera's speeds. look: how quickly the
// view takes up the mouse's movement (eased over a few frames, so turning's smooth rather than stepped). side: the eye's a
// little out toward the arm the gun's in, past the gun (held X to that side: weapons/gun-materials.js), so the gun sits a
// little right of the middle of the view, as in any shooter (down the sights it comes onto the gun's sight line:
// fpSightAlign)
const FPV = { eye: [0.04, 0.12], side: 0.15, follow: 7, followY: 4.5, look: 16, pitch: 1.45, sens: 0.0022, kick: 0.05, kickK: 150, kickD: 19, ads: 0.24, sprint: 0.06 };
const FREE = { speed: 7, min: 1, max: 40, fast: 3, acc: 7, top: 40 };
// free aim: the gun and your arms move about inside a little circle of the view (r, radians across). Only a share of
// the mouse's movement (take) moves the aim in it, the view turning with the rest and with all of it once the aim's at
// the edge; the aim eases after where it's pushed (ease: how quickly) and the view drifts back onto it (back), so the
// gun comes home to the middle once you stop. Down the sights the circle closes, the view onto the sights (ads)
const FA = { r: 0.035, take: 0.15, ease: 10, back: 1.2, adsBack: 6, ads: 0 };
// bringing the sights up and putting them down: a spring onto them (w: how stiff, in and out; a handgun's quicker),
// starting gently, quick through the middle and settling softly; and the arc the gun swings through on the way, dipping
// (dip, metres) and canting a touch (cant, radians) in the middle of it
const ADS_T = { in: 15, out: 17, side: 19, dip: 0.014, cant: 0.09 };
// a shouldered gun meeting your shoulder as it comes up: a jolt (p, y: radians up and across, r: cant, z: metres back)
// on a loose spring that shakes out (k, d), and the hands trembling a little on the way up (trem); k per gun
const SHOULDER_IN = { at: 0.72, p: 0.07, y: 0.05, r: 0.2, z: 0.09, k: 320, d: 10, trem: 0.0035, gun: { ar: 1.25, scar: 1.1, lmg: 1.35, sub: 0.9, smg: 0.75 } };
// each shot turning the gun in your hands, on a quick spring that rings out a little (k, d): the muzzle up (p), a twist
// to one side or the other (y), a cant (r, radians) and back into your shoulder (z, metres); at the hip twice as much
// (hip), a full-auto's shots each a share (auto). Down the sights the whole sight turns with it off your eye's line, so a
// scope's picture and reticle jump and roll and settle with every shot
const RECOIL = { p: 0.03, y: 0.016, r: 0.04, z: 0.012, k: 230, d: 16, hip: 2, auto: 0.6 };
// reloading in first person, the gun's brought up into view where you can watch your hands work it: its action (mid of
// the way along it: the well, the port, the cylinder) eased to
// a place low in the middle of the view (at: across, up, out from your eye, metres; a handgun's: side), turned side on
// (yaw: its muzzle round to the left, so you see its side and the well and the hands at it), canted (roll) and its muzzle
// tipped up (pitch), never in close enough to clip your eye
const FP_RELOAD = { at: [0.005, -0.12, -0.43], side: [0.01, -0.11, -0.4], roll: 0.3, pitch: 0.2, yaw: 0.85, mid: 0.42 };
// held at the hip in first person, the gun's pushed out a little from your eye (the shorter it is the more, from short
// to long: so a machine pistol isn't tucked in under your chin), along the view
const FP_REACH = { short: 0.13, long: 0.035, len: [0.8, 1.3] };
// the view leaning with how you move: banked into a sidestep (roll), dipped going forward and lifted backing off
// (pitch, and acc for speeding up and slowing), per metre a second, on a spring (k, d); less down the sights
const TILT = { roll: 0.0036, pitch: 0.0024, acc: 0.0006, k: 60, d: 13, ads: 0.6 };
// looking up, the head goes back (look: metres, from pitch p0 to p1), so the arms and the gun raised to aim up stay out
// in front of your eyes rather than in them
const LOOK_UP = { look: 0.16, p0: 0.2, p1: 1.0 };
// free look (held: input/keybinds.js, freeLook): the view turns on its own while the aim and the gun stay where they
// are, as far round as yaw and pitch (radians), easing back onto the aim (back) once it's let go or the sights come up
const FREE_LOOK = { yaw: 1.9, pitch: 1.1, ease: 16, back: 9 };
// the view's bob with your stride (P.phase: a footfall every half turn): dipping (up, metres) and nodding (pitch) as
// each foot lands, swaying across (side, metres) and rocking (roll) a step each way; at full walking pace (speed, metres
// a second), more running, much less down the sights (ads), eased in and out as you start and stop (ease)
const BOB = { up: 0.011, pitch: 0.006, side: 0.007, roll: 0.005, speed: 4.2, max: 1.4, ads: 0.75, ease: 6 };
// down the sights without a set eye relief (a red dot, a holo, a handgun's irons), the nearest your eye comes to the back
// of the sights, so the gun's never pushed into your face (aiming up, say): an optic's, iron sights'
const EYE_MIN = { optic: 0.15, iron: 0.25 };
// down the sights, particles thinned toward the aim: out to r of the view's height, by k at most
const AIM_THIN = { r: 0.16, k: 1 }, _vcS = new THREE.Vector2();
// the third-person camera's jolts as first person feels them (game/camera.js): a push along the aim dips the view
// (push, radians a unit), one across turns it, a zoom draws the view in (zoom); all eased (ease) so they roll rather
// than snap. A reload's own sway (relP: down onto the gun, relR: rocking with the hands) and the shake (shake: radians)
// as a smooth wobble rather than a jitter
const FP_JOLT = { push: 0.5, zoom: 0.4, ease: 18, relP: 0.035, relR: 0.012, shake: 0.03 };
// where the view and the free camera are, and its springs (kick: the pitch; ky: the yaw)
const V = { mdx: 0, mdy: 0, cy: Math.PI, cp: 0, fax: 0, fay: 0, ftx: 0, fty: 0, ay: null, ap: null, adsX: null, adsV: 0, sh: { p: 0, vp: 0, y: 0, vy: 0, r: 0, vr: 0, z: 0, vz: 0, up: false, k: 1 }, rc: { p: 0, vp: 0, y: 0, vy: 0, r: 0, vr: 0, z: 0, vz: 0 }, tr: 0, vtr: 0, tp: 0, vtp: 0, lvx: 0, lvz: 0, bobK: 0, bp: 0, br: 0, bx: 0, by: 0, fly: 0, flp: 0, flyT: 0, flpT: 0, jp: 0, jy: 0, jz: 0, np: 0, ny: 0, rollS: 0, x: P.x, y: 1.4, z: P.z, fx: 0, fy: 6, fz: 0, fyaw: 0, fpitch: -0.6, vx: 0, vy: 0, vz: 0, speed: FREE.speed, kick: 0, vk: 0, ky: 0, vky: 0, eye: null, roll: 0, sw: 0, lyaw: null, lpitch: null };
const _vcE = new V3(), _vcD = new V3(), _vcZ = new V3(), lookHint = $('lookHint');

// the view in use: what's picked, but the isometric one on the menus, as you go down and once you're down
// (picking cards between waves too, and as they go: upgrades/upgrade-screen.js)
const wantOn = () => (state === 'play' || state === 'paused' || state === 'upgrade' || state === 'leaving') && !P.dead ? VCAM.mode : 'iso';
export function setViewMode(m) {
  m = m === 'fp' || m === 'free' ? m : 'iso';
  if (m === VCAM.mode) return;
  if (m === 'free') {
    // the free camera starts where the view is: the isometric camera's spot (a little in toward you), or your eyes
    const c = VCAM.on === 'fp' ? FP_CAM.position : null;
    if (c) freeTo(c.x, c.y, c.z, VCAM.yaw, VCAM.pitch);
    else { const o = CAM_OFF.clone().normalize().multiplyScalar(14); freeTo(P.x + o.x, o.y, P.z + o.z, Math.atan2(-o.x, -o.z), -Math.asin(o.y / 14)); }
  }
  if (m === 'fp' && VCAM.mode !== 'fp') { VCAM.yaw = P.aim; VCAM.pitch = -0.12; V.eye = null; }   // looking where you were aiming, a touch down
  VCAM.mode = m;
  syncView();
}
// the camera that's drawn with, and what's hidden for it, kept to the view in use
export function syncView() {
  const on = wantOn();
  if (on !== VCAM.on) {
    if (on === 'fp' && VCAM.on === 'iso') { VCAM.yaw = P.aim; V.eye = null; }
    VCAM.on = on; setCam(on === 'iso' ? ISO_CAM : FP_CAM);
    document.body.classList.toggle('fpView', on === 'fp'); document.body.classList.toggle('freeView', on === 'free');
    if (on === 'iso') unlock();
  }
  PM.head.visible = on !== 'fp';   // (out of your own eyes: your head, its hair and hat, would be all round the lens)
}

// ---- the mouse: locked to the game while you look about, and let go for a menu
export const locked = () => document.pointerLockElement === cv;
let selfUnlock = false;
// (lockAt: when it was last asked for, so a menu closing as it's asked for, the pause going, doesn't let it straight go)
export function wantLock() {
  if (isoOn() || locked() || !cv.requestPointerLock) return;
  V.lockAt = performance.now();
  try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function unlock() { if (locked()) { selfUnlock = true; document.exitPointerLock(); } }
// the mouse moved this much (pixels) while it's locked: the view turns, slower down the sights and slower again through
// a scope (the settings' sensitivity on top)
export function viewLook(dx, dy) {
  const s = FPV.sens * (SET.sens || 100) / 100 * (1 - 0.35 * (ANIM.ads || 0)) / (SCOPE_V.on && SCOPE_V.mag > 1 && (SCOPE_V.kind === 'scope' || SCOPE_V.kind === 'acog') ? 1 + (SCOPE_V.mag - 1) * 0.6 * SCOPE_V.w : 1);   // (slower through a scope, as it magnifies)
  if (freeOn()) { V.fyaw -= dx * s; V.fpitch = clamp(V.fpitch - dy * s, -FPV.pitch, FPV.pitch); return; }
  fpAimSync();
  if (fpOn() && !freeLooking()) { V.mdx += dx * s; V.mdy += dy * s; return; }   // (taken up smoothly, frame by frame: fpLookStep)
  lookBy(dx * s, dy * s);
}
// the mouse's movement taken up by the view, eased: what's still to come goes in a share each frame
function fpLookStep(rdt) {
  const k = 1 - Math.exp(-rdt * FPV.look), ax = V.mdx * k, ay = V.mdy * k; V.mdx -= ax; V.mdy -= ay;
  if (Math.abs(ax) + Math.abs(ay) > 1e-7) lookBy(ax, ay);
}
// the view and the aim turned by (dx, dy) radians' worth of the mouse
function lookBy(dx, dy) {
  const ex = -dx, ey = -dy;
  if (freeLooking()) { V.flyT = clamp(V.flyT + ex, -FREE_LOOK.yaw, FREE_LOOK.yaw); V.flpT = clamp(V.flpT + ey, -FREE_LOOK.pitch, FREE_LOOK.pitch); return; }
  V.cy += ex * (1 - FA.take); V.cp += ey * (1 - FA.take); V.ftx += ex * FA.take; V.fty += ey * FA.take;
  fpFreeAim(0);
}
// the view's own way this frame on top of where it's turned (kick: a shot's, which the aim takes too; tilt, free look,
// jolts, shake: the view's alone), and its roll
const viewP = () => V.cp + V.kick + V.tp + V.flp + V.jp + V.np + V.bp, viewY = () => V.cy + V.ky + V.fly + V.jy + V.ny, viewR = () => V.roll * 0.6 + V.tr + V.br;
const freeLooking = () => fpOn() && keys.has(KB.freeLook) && adsW() < 0.3;
// the aim set from elsewhere (going into first person, a test): the view onto it, nothing off the middle
function fpAimSync() {
  if (V.ay === VCAM.yaw && V.ap === VCAM.pitch) return;
  V.cy = VCAM.yaw; V.cp = VCAM.pitch; V.fax = V.fay = V.ftx = V.fty = 0; V.ay = VCAM.yaw; V.ap = VCAM.pitch;
}
// the aim's place in the circle (as it closes down the sights): pushed past its edge the view takes the rest; the aim
// easing after where it's pushed; the view drifting back onto it. The aim's the view's way and its offset
function fpFreeAim(dt) {
  fpAimSync();
  const w = adsW(), r = FA.r * (1 - w) + FA.ads * w;
  // (the view moving onto the aim by d leaves the aim where it is)
  const toView = (dx, dy) => { V.cy += dx; V.cp += dy; V.ftx -= dx; V.fty -= dy; V.fax -= dx; V.fay -= dy; };
  if (dt > 0) { const k = 1 - Math.exp(-dt * (FA.back + (FA.adsBack - FA.back) * w)); toView(V.ftx * k, V.fty * k); }
  const L = Math.hypot(V.ftx, V.fty); if (L > r) toView(V.ftx * (1 - r / L), V.fty * (1 - r / L));
  if (dt > 0) { const k = 1 - Math.exp(-dt * FA.ease); V.fax += (V.ftx - V.fax) * k; V.fay += (V.fty - V.fay) * k; }
  const La = Math.hypot(V.fax, V.fay); if (La > r * 1.15) { V.fax *= r * 1.15 / La; V.fay *= r * 1.15 / La; }
  V.cp = clamp(V.cp, -FPV.pitch, FPV.pitch);
  VCAM.yaw = V.cy + V.fax; VCAM.pitch = clamp(V.cp + V.fay, -FPV.pitch, FPV.pitch); V.ay = VCAM.yaw; V.ap = VCAM.pitch;
}
// where the aim is on the screen, from its middle (pixels): where the crosshair sits and the arms point the gun
// (player/movement.js puts the pointer there)
const _faQ = new THREE.Quaternion(), _faE = new THREE.Euler(), _faV = new V3();
export function fpAimPx() {
  if (!fpOn()) return [0, 0];
  _faV.set(0, 0, -1).applyEuler(_faE.set(VCAM.pitch, VCAM.yaw + Math.PI, 0, 'YXZ')).applyQuaternion(_faQ.setFromEuler(_faE.set(viewP() - V.kick, viewY() - V.ky + Math.PI, viewR(), 'YXZ')).invert());
  const f = innerHeight / 2 / Math.tan(FP_CAM.fov * Math.PI / 360), z = Math.max(0.2, -_faV.z);
  return [_faV.x / z * f, -_faV.y / z * f];
}
// first person's sights coming up and going down, on a spring (ADS_T) (game/camera.js: ANIM.ads); and a shouldered gun
// meeting your shoulder on the way up (SHOULDER_IN)
export function fpAds(want, rdt) {
  if (want === null) { V.adsX = null; V.adsV = 0; return 0; }
  const id = curId(), D = W(id), side = !D || D.slot === 'side', w0 = side ? ADS_T.side : want ? ADS_T.in : ADS_T.out, S = V.sh;
  if (V.adsX === null) V.adsX = ANIM.ads || 0;
  const x0 = V.adsX;
  for (let n = Math.ceil(rdt / (1 / 240)), h = rdt / Math.max(1, n), i = 0; i < n; i++) {
    V.adsV += (w0 * w0 * ((want ? 1 : 0) - V.adsX) - 2 * w0 * V.adsV) * h; V.adsX += V.adsV * h;
    S.vp += (-SHOULDER_IN.k * S.p - SHOULDER_IN.d * S.vp) * h; S.p += S.vp * h; S.vy += (-SHOULDER_IN.k * S.y - SHOULDER_IN.d * S.vy) * h; S.y += S.vy * h;
    S.vr += (-SHOULDER_IN.k * S.r - SHOULDER_IN.d * S.vr) * h; S.r += S.vr * h; S.vz += (-SHOULDER_IN.k * S.z - SHOULDER_IN.d * S.vz) * h; S.z += S.vz * h;
  }
  V.adsX = clamp(V.adsX, -0.02, 1.02);
  if (V.adsX < 0.3) S.up = false;
  if (want && !side && !S.up && x0 < SHOULDER_IN.at && V.adsX >= SHOULDER_IN.at) {
    S.up = true; const k = SHOULDER_IN.gun[id] ?? 1; S.k = k;
    S.vp += SHOULDER_IN.p * k * rr(0.8, 1.2); S.vy += SHOULDER_IN.y * k * rr(-1, 1); S.vr += SHOULDER_IN.r * k * rr(0.6, 1) * (Math.random() < 0.5 ? -1 : 1); S.vz += SHOULDER_IN.z * k * rr(0.8, 1.2);
  }
  return clamp(V.adsX, 0, 1);
}
// the shouldering's shake this frame, and the hands' tremble as it comes up: [up, across, cant, back]
const _shk = [0, 0, 0, 0];
function shoulderShake() {
  const S = V.sh, C = V.rc, D = W(curId());
  _shk[0] = C.p; _shk[1] = C.y; _shk[2] = C.r; _shk[3] = C.z;   // (a shot's turn of the gun, every gun)
  if (!(fpOn() && D && D.slot !== 'side')) return _shk;
  const t = performance.now() / 1000, x = clamp(V.adsX ?? 0, 0, 1), tr = SHOULDER_IN.trem * (SHOULDER_IN.gun[curId()] ?? 1) * Math.sin(Math.PI * x) * (V.adsV > 0 ? 1 : 0.4);
  _shk[0] += S.p + tr * (Math.sin(t * 23.1) + 0.6 * Math.sin(t * 37.7 + 1.3)); _shk[1] += S.y + tr * (Math.sin(t * 19.3 + 2.1) + 0.6 * Math.sin(t * 41.9));
  _shk[2] += S.r; _shk[3] += S.z;
  return _shk;
}
// reloading: the gun up into view (FP_RELOAD), by k (how far into the reload it is, eased: player/hold.js), less as the
// sights come up; from the hold (player/hold.js), after fpRecoil and before your hands go on it
const _rlC = new V3(), _rlD = new V3();
export function fpReloadPose(gg, k) {
  const D = W(curId()), w = adsW(); k *= 1 - w; if (!fpOn() || !gg.parent || !D || D.melee || D.akimbo) return;
  // (out from your eye at the hip, then up into view to reload)
  { const m = MUZ[W8.cur] || 0.9, L = FP_REACH.len, push = (FP_REACH.short + (FP_REACH.long - FP_REACH.short) * clamp((m - L[0]) / (L[1] - L[0]), 0, 1)) * (1 - w) * (1 - k);
    if (push > 0.002) { _rlD.set(0, 0, -push).applyQuaternion(FP_CAM.quaternion); gg.position.add(_rlD.applyQuaternion(_vcQ.copy(gg.parent.getWorldQuaternion(_rq)).invert())); gg.updateMatrix(); gg.updateMatrixWorld(true); } }
  if (k < 0.01) return;
  const h = HOLDS[W8.cur] && HOLDS[W8.cur].R; if (!h) return;
  const c = FP_CAM, side = D.slot === 'side', at = side ? FP_RELOAD.side : FP_RELOAD.at;
  gg.updateMatrixWorld(true); _rlC.set(X, GUN_Y, (MUZ[W8.cur] || 0.9) * FP_RELOAD.mid).applyMatrix4(h.matrixWorld);
  _rlD.set(at[0], at[1], at[2]).applyMatrix4(c.matrixWorld).sub(_rlC).multiplyScalar(k);   // (where it's to go, from where it is)
  _rq.copy(c.quaternion); _rq2.copy(_rq).multiply(_vcQ.setFromEuler(_rE.set(FP_RELOAD.pitch * k, FP_RELOAD.yaw * k, FP_RELOAD.roll * k, 'YXZ'))).multiply(_vcQ.copy(_rq).invert());
  _rM.makeTranslation(-_rlC.x, -_rlC.y, -_rlC.z).premultiply(_rM2.makeRotationFromQuaternion(_rq2)).premultiply(_rM2.makeTranslation(_rlC.x + _rlD.x, _rlC.y + _rlD.y, _rlC.z + _rlD.z));
  _rM.multiply(gg.matrixWorld).premultiply(_rM2.copy(gg.parent.matrixWorld).invert());
  _rM.decompose(gg.position, gg.quaternion, gg.scale); gg.updateMatrix(); gg.updateMatrixWorld(true);
}
// at the hip, the shot's turn of the gun put on the gun as it's held (player/hold.js: after fpSightAlign, before your
// hands go on it), about where it's gripped, turned as the view is; less of it as the sights come up (they take it there)
const _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _vcQ = new THREE.Quaternion(), _rE = new THREE.Euler(), _rp = new V3(), _rM = new THREE.Matrix4(), _rM2 = new THREE.Matrix4();
export function fpRecoil(gg) {
  const C = V.rc, k = RECOIL.hip * (1 - adsW()); if (!fpOn() || !gg.parent || k < 0.01 || Math.abs(C.p) + Math.abs(C.y) + Math.abs(C.r) + Math.abs(C.z) < 1e-5) return;
  gg.updateMatrixWorld(true); _rp.setFromMatrixPosition(gg.matrixWorld);
  // (the turn made in the view's own frame: the view's way, then the turn, then back out of the view's way)
  _rq.setFromEuler(_rE.set(viewP(), viewY() + Math.PI, viewR(), 'YXZ'));
  _rq2.copy(_rq).multiply(_vcQ.setFromEuler(_rE.set(C.p * k, C.y * k, C.r * k, 'YXZ'))).multiply(_vcQ.copy(_rq).invert());
  _vcZ.set(0, 0, C.z * k).applyQuaternion(_rq);   // (back toward you, along the view)
  _rM.makeTranslation(-_rp.x, -_rp.y, -_rp.z).premultiply(_rM2.makeRotationFromQuaternion(_rq2)).premultiply(_rM2.makeTranslation(_rp.x + _vcZ.x, _rp.y + _vcZ.y, _rp.z + _vcZ.z));
  _rM.multiply(gg.matrixWorld).premultiply(_rM2.copy(gg.parent.matrixWorld).invert());
  _rM.decompose(gg.position, gg.quaternion, gg.scale); gg.updateMatrix(); gg.updateMatrixWorld(true);
}
// the free camera put somewhere, looking a given way (yaw round from +z, pitch up)
function freeTo(x, y, z, yaw, pitch) { V.fx = x; V.fy = y; V.fz = z; V.fyaw = yaw; V.fpitch = pitch; V.vx = V.vy = V.vz = 0; }
// the wheel in the free camera: how fast it flies
export function freeWheel(dy) { V.speed = clamp(V.speed * Math.exp(-dy * 0.0015), FREE.min, FREE.max); }
// the lock's gone without being let go (Esc, or the window losing focus): the game pauses, as in any shooter
// (input/keyboard-mouse.js)
document.addEventListener('pointerlockchange', () => { if (locked()) return; const s = selfUnlock; selfUnlock = false; if (!s && !isoOn()) lockLost(); });

// which way the keys walk you in first person: forward where you face, and to its sides (the isometric view's own
// otherwise: screen up and screen right)
const MV_F = { x: 0, z: 1 }, MV_R = { x: -1, z: 0 };
export function moveBasis(F, R) { return fpOn() ? viewBasis() : [F, R]; }
// the way the view faces on the ground, and its right
export function viewBasis() {
  const y = freeOn() ? V.fyaw : V.cy; MV_F.x = Math.sin(y); MV_F.z = Math.cos(y); MV_R.x = -MV_F.z; MV_R.z = MV_F.x;
  return [MV_F, MV_R];
}
// where you're aiming in first person, out along the look: the ground where it meets it, a wall in the way, or a long
// way out; and the height the look's at there (VCAM.aimY: the arms point the gun at it, and an unaimed round flies to it)
export function fpAim(out) {
  const ex = V.x, ey = V.y, ez = V.z, cp = Math.cos(VCAM.pitch), sp = Math.sin(VCAM.pitch), dx = Math.sin(VCAM.yaw), dz = Math.cos(VCAM.yaw);
  let D = 26;
  if (sp < -1e-3) D = Math.min(D, ey / -sp * cp);
  for (let t = 0.3; t < D; t += 0.1) if (bulletBlocked(ex + dx * t, ez + dz * t)) { D = t; break; }
  D = Math.max(0.6, thinRay(ex, ez, dx, dz, D));
  out.set(ex + dx * D, GUN_Y, ez + dz * D);
  VCAM.aimY = clamp(ey + sp / Math.max(0.05, cp) * D, 0, 4);
  return out;
}
// a shot kicks the view up and a touch aside (game/camera.js: fireCam), on a stiff spring home
export function viewKick(pw, auto) {
  if (isoOn()) return; V.vk += pw * FPV.kick * 22 * (auto ? 0.6 : 1); V.vky += pw * FPV.kick * 6 * rr(-0.5, 0.5);
  const C = V.rc, w = Math.sqrt(RECOIL.k) * pw * (auto ? RECOIL.auto : 1);   // (the gun turned in your hands: a spring's push for the size it's to reach)
  C.vp += RECOIL.p * w * rr(0.8, 1.2); C.vy += RECOIL.y * w * rr(-1, 1); C.vr += RECOIL.r * w * rr(-1, 1); C.vz += RECOIL.z * w * rr(0.8, 1.2);
}
// where the sounds are heard from, and which way's right: your eyes, or the free camera
export function listener() { return freeOn() ? { x: V.fx, y: V.fy, z: V.fz, rx: -Math.cos(V.fyaw), rz: Math.sin(V.fyaw) } : { x: V.x, y: V.y, z: V.z, rx: -Math.cos(V.cy), rz: Math.sin(V.cy) }; }
// the ground under the view, for what's laid out round it (the camera's target: game/camera.js)
export function viewGround(t) { if (freeOn()) t.set(V.fx + Math.sin(V.fyaw) * 4, 0, V.fz + Math.cos(V.fyaw) * 4); else t.set(P.x, 0, P.z); }
// a point's on the screen this frame (a projected point behind a perspective camera comes out mirrored, past z 1)
export const onScreen = v => v.z < 1 && v.z > -1;

// ---- down the sights in first person. Each gun's sight line, in the frame of what carries it: an optic's own axis
// (weapons/attachments.js notes it on the optic), or its iron sights' (each gun's model notes them: weapons/gun-parts.js,
// irons), from the rear sight to the front sight's tip: over a notch's floor with the post's tip level with its top
// (equal height, equal light), through the middle of an aperture, or along a shotgun's rib to its bead. On a long gun
// your cheek's on the stock, IRON.pull up it from the butt (between IRON.cheek and IRON.far from the rear sight); an
// aperture's close in front of your eye (IRON.peep), too close to see sharp, the front post sharp in the blur of its
// ring and the rest of the rear sight (blurred for it: effects/scope-view.js); a
// handgun's held out at arm's length. A gun without its sights noted has them found by feeling down onto its top along
// its middle, over its front IRON.front of its length, the rear sight the furthest back of its top that comes up near
// that height (within IRON.rear), the line over it (IRON.peek) and clear of what's between
const IRON = { front: 0.42, step: 0.004, rear: 0.016, peek: 0.0022, cheek: 0.05, far: 0.22, pull: 0.26, long: 0.45, peep: 0.07 };
const SL = { key: null, obj: null, a: new V3(), b: new V3(), kind: 'iron', relief: null, r: 0, hw: 0, hh: 0, hide: [] };
const _ray = new THREE.Raycaster(), _ro = new V3(), _rdn = new V3(), _sb = new THREE.Box3(), _sm = new THREE.Matrix4(), _sm2 = new THREE.Matrix4();
function sightLine() {
  const s = W8.cur, h = HOLDS[s] && HOLDS[s].R, id = curId(); if (!h || !id) return null;
  const key = h.uuid + ':' + id;
  if (SL.key === key) return SL.obj ? SL : null;
  SL.key = key; SL.obj = null; SL.hide = [];
  let opt = null, ir = null; h.traverse(o => { if (!opt && o.userData.optic) opt = o; if (!ir && o.userData.irons) ir = o; });
  if (opt) {
    const O = opt.userData.optic; SL.obj = opt; SL.kind = O.kind; SL.a.set(O.x, O.y, O.zr); SL.b.set(O.x, O.y, O.zf); SL.relief = O.relief ?? null; SL.r = O.r; SL.hw = O.hw || 0; SL.hh = O.hh || 0;
    opt.traverse(o => { if (o.userData.reticle) SL.hide.push(o); });   // (a sight's own lit dot, drawn instead where your eye sees it)
    return SL;
  }
  h.updateMatrixWorld(true); _sm.copy(h.matrixWorld).invert();
  const meshes = [], b = new THREE.Box3().makeEmpty(); h.traverseVisible(o => { if (o.isMesh && o.geometry) meshes.push(o); });
  for (const o of meshes) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(_sb.copy(o.geometry.boundingBox).applyMatrix4(_sm2.multiplyMatrices(_sm, o.matrixWorld))); }
  if (b.isEmpty()) return null;
  const len = b.max.z - b.min.z, long = len > IRON.long;
  if (ir && ir.userData.irons.yf !== undefined) {
    const I = ir.userData.irons; ir.updateMatrixWorld(true);
    SL.obj = ir; SL.kind = I.kind; SL.r = I.r || 0; SL.hw = SL.hh = 0;
    SL.a.set(X, I.yr, I.rz); SL.b.set(X, I.yf, I.fz);
    SL.relief = I.kind === 'ap' ? IRON.peep : long ? clamp(I.rz - (b.min.z + IRON.pull), IRON.cheek, IRON.far) : null;
    return SL;
  }
  // the top along the middle, front to back
  const prof = [], zf = b.max.z - len * IRON.front;
  _rdn.set(0, -1, 0).transformDirection(h.matrixWorld);
  for (let z = b.min.z; z <= b.max.z; z += IRON.step) {
    _ro.set(X, b.max.y + 0.05, z).applyMatrix4(h.matrixWorld); _ray.set(_ro, _rdn); _ray.far = 1;
    const hit = _ray.intersectObjects(meshes, false)[0]; if (hit) prof.push([z, _ro.copy(hit.point).applyMatrix4(_sm).y]);
  }
  let y = -1e9, tz = 0;
  for (const [z, yy] of prof) if (z >= zf && yy > y) { y = yy; tz = z; }
  if (y < -1e8) return null;
  let rz = tz - 0.3; for (const [z, yy] of prof) if (z < tz - 0.12 && yy >= y - IRON.rear) { rz = z; break; }
  let hr = y;
  for (const [z, yy] of prof) {
    if (z >= rz && z <= rz + 0.06) hr = Math.max(hr, yy + IRON.peek);   // over the rear sight
    else if (z > rz + 0.06 && z < tz - 0.01) hr = Math.max(hr, y + (yy + 0.0008 - y) * (tz - rz) / (tz - z));   // clear of what's between
  }
  SL.obj = h; SL.kind = 'iron'; SL.a.set(X, hr, rz); SL.b.set(X, y, tz); SL.relief = long ? clamp(rz - (b.min.z + IRON.pull), IRON.cheek, IRON.far) : null; SL.r = SL.hw = SL.hh = 0;
  return SL;
}
// what's hidden while you look down the sights (an aperture's own parts, a sight's lit dot), shown again after
const SL_HID = [];
function sightHide(list) {
  if (SL_HID.length === list.length && SL_HID.every((o, i) => o === list[i])) return;
  SL_HID.forEach(o => { o.visible = true; }); SL_HID.length = 0;
  list.forEach(o => { o.visible = false; SL_HID.push(o); });
}
// how far down the sights you are, eased
// (first person's already eased: fpAds)
const adsW = () => fpOn() ? clamp(ANIM.ads || 0, 0, 1) : smooth(clamp(ANIM.ads || 0, 0, 1));
// which way a round goes from your eye this frame: through the crosshair's point (the middle of the view, wandering
// with sway and kicked by recoil: player/shaky-hands.js), as the view's turned
const _aimE = new THREE.Euler();
function aimDir(out) {
  const f = Math.tan(FP_CAM.fov * Math.PI / 360), hh = innerHeight / 2;
  out.set((aimSX() - innerWidth / 2) / hh * f, -(aimSY() - hh) / hh * f, -1).normalize();
  const k = shoulderShake(); _aimE.set(viewP() + k[0], viewY() + Math.PI + k[1], viewR(), 'YXZ'); return out.applyEuler(_aimE);
}
// down the sights the gun's brought onto your aim exactly, its sight line turned onto the line a round will take, so the
// front post, the dot or the reticle sits on what you'll hit and wanders and kicks with it; and up toward your eye, as
// far as SIGHT_RAISE, the eye coming down onto the line the rest of the way (viewFrame). From the hold (player/hold.js,
// poseGun: gg, the gun in your hands, before your hands are put on it) and again as the view's placed
const SIGHT_RAISE = 0.12;
const _pa = new V3(), _pb = new V3(), _ad = new V3(), _sd = new V3(), _vcH = new V3(), _qa = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _mw = new THREE.Matrix4(), _vcM = new THREE.Matrix4();
export function fpSightAlign(gg, raise = true) {
  const w = adsW(), D = W(curId()); if (!fpOn() || w < 0.001 || !D || D.melee || D.akimbo) return;
  const L = sightLine(); if (!L || !gg.parent) return;
  PM.g.updateMatrixWorld(true);
  _pa.copy(L.a).applyMatrix4(L.obj.matrixWorld); _pb.copy(L.b).applyMatrix4(L.obj.matrixWorld);
  aimDir(_ad); _sd.subVectors(_pb, _pa).normalize();
  _qa.setFromUnitVectors(_sd, _ad); _qi.identity().slerp(_qa, w);
  // turned about the line's back end, then raised: the line's offset from your eye, as far as SIGHT_RAISE
  headEye(_vcH); _vcH.sub(_pa); _vcH.addScaledVector(_ad, -_vcH.dot(_ad)); const off = _vcH.length(); if (off > SIGHT_RAISE) _vcH.multiplyScalar(SIGHT_RAISE / off); _vcH.multiplyScalar(raise ? w : 0);
  // and on the way up or down, the arc it swings through: dipped and canted a touch in the middle of it
  if (raise) { const arc = Math.sin(Math.PI * w), k = shoulderShake(); _qa.setFromAxisAngle(_ad, ADS_T.cant * arc + k[2]); _qi.premultiply(_qa); _vcH.y -= ADS_T.dip * arc; _vcH.addScaledVector(_ad, -k[3]); }
  _mw.makeTranslation(-_pa.x, -_pa.y, -_pa.z).premultiply(_vcM.makeRotationFromQuaternion(_qi)).premultiply(_vcM.makeTranslation(_pa.x + _vcH.x, _pa.y + _vcH.y, _pa.z + _vcH.z));
  _mw.multiply(gg.matrixWorld).premultiply(_vcM.copy(gg.parent.matrixWorld).invert());
  _mw.decompose(gg.position, gg.quaternion, gg.scale); gg.updateMatrix(); gg.updateMatrixWorld(true);
}
// your eye on your head, before it's eased (a little out toward the gun arm: FPV.side)
function headEye(out) { const D = W(curId()); return out.set(D && D.akimbo ? 0 : FPV.side, FPV.eye[0], FPV.eye[1]).applyMatrix4(PM.head.matrixWorld); }
// looking down the sights: what's drawn over the view for them (effects/scope-view.js). on: whether anything is; kind:
// the sight's ('scope', 'acog', 'holo', 'dot', 'ap' an aperture, 'notch', 'bead', 'iron'); eye, obj: the middles of its back (the eyepiece,
// the window, the aperture) and its front; dir: its axis; ux, uy: across it and up it; r: the eyepiece's, the lens's or
// the aperture's radius; hw, hh: a window's half width and height; mag: how much a scope magnifies; a: how much of it
// shows (it comes in as the sights come up); off: where your eye is off a scope's axis, as a share of its eyepiece's
// radius (its shadow)
export const SCOPE_V = { on: false, kind: '', eye: new V3(), obj: new V3(), dir: new V3(), ux: new V3(), uy: new V3(), r: 0.02, hw: 0, hh: 0, mag: 4, a: 0, w: 0, off: new THREE.Vector2() };
// the eye's place off the scope's axis, on a spring: low as it comes up, kicked by a shot, trailing a quick turn
const BOX = { x: 0, y: 0, vx: 0, vy: 0, k: 70, d: 10 };
// how far (metres) your eye can be off a scope's axis and still see all of its picture
const EYEBOX = 0.007;
// down the sights of anything but a scope, there's no crosshair: you aim with the sights themselves (ui/crosshair.js)
export const fpSighted = () => fpOn() && V.sw > 0.55;
const GLASS_SEE = { on: false };
// whether something's drawn: it and everything it hangs from shown
const drawnUp = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
function glassSee(see) { if (see !== GLASS_SEE.on) { GLASS_SEE.on = see; GM.glass.transparent = see; GM.glass.opacity = see ? 0.12 : 1; GM.glass.depthWrite = !see; GM.glass.needsUpdate = true; GM.holoGlass.opacity = see ? 0.1 : 0.35; } }

// each frame, from game/camera.js: the view in use, then the camera placed. roll: the springs' tip (a shot, a hit, a
// vault), sh: the shake
export function viewFrame(rdt, roll, sh, jolt) {
  syncView();
  if (isoOn()) { if (!lookHint.hidden) lookHint.hidden = true; SCOPE_V.on = false; V.sw = 0; sightHide([]); glassSee(false); SPRITE_AIM.w = 0; return; }
  // a menu up (a station's, the cheats', the settings, the pause), the mouse is let go for it; and while it's free in
  // play, a word that a click takes it back
  const menu = (state !== 'play' && state !== 'leaving') || P.dead || !!openSt || cheatOn || setOpen();
  if (menu && locked() && performance.now() - (V.lockAt || 0) > 500) unlock();
  const hint = !menu && !locked(); if (lookHint.hidden === hint) lookHint.hidden = !hint;
  const c = FP_CAM;
  for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++) {
    V.vk += (-FPV.kickK * V.kick - FPV.kickD * V.vk) * dt; V.kick += V.vk * dt;
    V.vky += (-FPV.kickK * V.ky - FPV.kickD * V.vky) * dt; V.ky += V.vky * dt;
  }
  if (fpOn()) {
    // the eyes: on the head, the way it faces. Your own movement's taken as it comes; the head's sway about you (each
    // step, a lean, a vault) is eased, the bob more than the rest
    fpLookStep(rdt); fpFreeAim(rdt);
    const w0 = adsW(), now = performance.now() / 1000;
    // the springs' tip (a shot, a hit, a vault, a reload's beats), eased; the third-person camera's pushes and zooms as
    // dips, turns and a drawing in; a reload's own sway; the shake as a wobble
    { const e = 1 - Math.exp(-rdt * FP_JOLT.ease), j = jolt || { px: 0, pz: 0, zoom: 0 }, fx = Math.sin(VCAM.yaw), fz = Math.cos(VCAM.yaw), re = clamp(ANIM.relEnv || 0, 0, 1);
      const along = j.px * fx + j.pz * fz, across = j.px * fz - j.pz * fx;
      V.rollS += (roll + FP_JOLT.relR * re * Math.sin(now * 2.1) - V.rollS) * e; V.roll = V.rollS;
      V.jp += (-along * FP_JOLT.push - FP_JOLT.relP * re - V.jp) * e; V.jy += (across * FP_JOLT.push - V.jy) * e; V.jz += (j.zoom * FP_JOLT.zoom - V.jz) * e;
      const a = FP_JOLT.shake * sh; V.np = a * (Math.sin(now * 31) + 0.5 * Math.sin(now * 53 + 1.7)); V.ny = a * (Math.sin(now * 27 + 0.6) + 0.5 * Math.sin(now * 47 + 2.9)); }
    // free look, eased out and back
    { const fl = freeLooking(); if (!fl) { V.flyT = 0; V.flpT = 0; } const e = 1 - Math.exp(-rdt * (fl ? FREE_LOOK.ease : FREE_LOOK.back)); V.fly += (V.flyT - V.fly) * e; V.flp += (V.flpT - V.flp) * e; }
    // leaning with how you move: banked into a sidestep, dipped going forward
    { const fx = Math.sin(V.cy), fz = Math.cos(V.cy), fwd = P.vx * fx + P.vz * fz, right = P.vx * -fz + P.vz * fx, d = Math.max(rdt, 1e-3);
      const acc = ((P.vx - V.lvx) * fx + (P.vz - V.lvz) * fz) / d; V.lvx = P.vx; V.lvz = P.vz;
      const m = 1 - TILT.ads * w0, tr = -right * TILT.roll * m, tp = clamp(-fwd * TILT.pitch - clamp(acc, -25, 25) * TILT.acc, -0.04, 0.04) * m;
      for (let n = Math.ceil(rdt / (1 / 120)), h = rdt / Math.max(1, n), i = 0; i < n; i++) { V.vtr += (TILT.k * (tr - V.tr) - TILT.d * V.vtr) * h; V.tr += V.vtr * h; V.vtp += (TILT.k * (tp - V.tp) - TILT.d * V.vtp) * h; V.tp += V.vtp * h; } }
    // the shots' turn of the gun, ringing out
    { const C = V.rc, k = RECOIL.k, d = RECOIL.d; for (let n = Math.ceil(rdt / (1 / 240)), h = rdt / Math.max(1, n), i = 0; i < n; i++) {
      C.vp += (-k * C.p - d * C.vp) * h; C.p += C.vp * h; C.vy += (-k * C.y - d * C.vy) * h; C.y += C.vy * h;
      C.vr += (-k * C.r - d * C.vr) * h; C.r += C.vr * h; C.vz += (-k * C.z - d * C.vz) * h; C.z += C.vz * h; } }
    // bobbing with your stride
    { const m = clamp(Math.hypot(P.vx, P.vz) / BOB.speed, 0, BOB.max) * (P.moving ? 1 : 0) * (1 - BOB.ads * w0), ph = P.phase || 0;
      V.bobK += (m - V.bobK) * (1 - Math.exp(-rdt * BOB.ease)); const k = V.bobK;
      V.bp = -BOB.pitch * k * Math.cos(2 * ph); V.br = BOB.roll * k * Math.sin(ph); V.bx = BOB.side * k * Math.sin(ph); V.by = -BOB.up * k * Math.cos(2 * ph); }
    PM.g.updateMatrixWorld(true); headEye(_vcE);
    const rx = _vcE.x - P.x, ry = _vcE.y, rz = _vcE.z - P.z;
    if (!V.eye) V.eye = { x: rx, y: ry, z: rz };
    const k = 1 - Math.exp(-rdt * FPV.follow), ky = 1 - Math.exp(-rdt * FPV.followY);
    V.eye.x += (rx - V.eye.x) * k; V.eye.y += (ry - V.eye.y) * ky; V.eye.z += (rz - V.eye.z) * k;
    // looking up, the head back out of the way of the arms raised in front of it
    { const b = LOOK_UP.look * smooth(clamp((VCAM.pitch - LOOK_UP.p0) / (LOOK_UP.p1 - LOOK_UP.p0), 0, 1)) * (1 - w0);
      V.x = P.x + V.eye.x - Math.sin(VCAM.yaw) * b; V.y = V.eye.y - b * 0.25; V.z = P.z + V.eye.z - Math.cos(VCAM.yaw) * b; }
    // down the sights: the gun brought onto this frame's aim (the kick's moved on since it was held), and the eye onto
    // its sight line: at the head's own distance behind it, or a scope's eye relief behind its eyepiece
    const w = adsW(), D = W(curId()), LH = D && !D.melee && !D.akimbo ? sightLine() : null, L = w > 0.001 ? LH : null, gg = gunMeshes[W8.cur];
    _vcE.set(V.x, V.y, V.z);
    if (L && gg) fpSightAlign(gg, false);
    if (LH) { _pa.copy(LH.a).applyMatrix4(LH.obj.matrixWorld); _pb.copy(LH.b).applyMatrix4(LH.obj.matrixWorld); _sd.subVectors(_pb, _pa).normalize(); }
    if (L && gg) {
      if (L.relief !== null) _vcD.copy(_pa).addScaledVector(_sd, -L.relief);
      else _vcD.copy(_pa).addScaledVector(_sd, clamp(_vcH.subVectors(_vcE, _pa).dot(_sd), -0.8, -(L.kind === 'holo' || L.kind === 'dot' ? EYE_MIN.optic : EYE_MIN.iron)));
      _vcE.lerp(_vcD, w);
    }
    V.sw = L ? w : 0;
    c.position.set(_vcE.x - Math.cos(V.cy) * V.bx, _vcE.y + V.by, _vcE.z + Math.sin(V.cy) * V.bx);
    c.rotation.set(viewP(), viewY() + Math.PI, viewR(), 'YXZ'); c.updateMatrixWorld(true);
    // a scope's own view (effects/scope-view.js), magnified in its eyepiece, seen through whenever its eyepiece is in
    // view (black but for a sliver with your eye well off its axis, as a real one is); the eye's spring off its axis
    const scope = !!LH && (LH.kind === 'scope' || LH.kind === 'acog');
    { const yr = (VCAM.yaw - (V.lyaw ?? VCAM.yaw)) / Math.max(rdt, 1e-3), pr = (VCAM.pitch - (V.lpitch ?? VCAM.pitch)) / Math.max(rdt, 1e-3); V.lyaw = VCAM.yaw; V.lpitch = VCAM.pitch;
      const tx = clamp(yr * 0.18, -0.7, 0.7), ty = clamp(-pr * 0.18, -0.7, 0.7) + V.kick * 9;
      for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++) { BOX.vx += (-BOX.k * (BOX.x - tx) - BOX.d * BOX.vx) * dt; BOX.x += BOX.vx * dt; BOX.vy += (-BOX.k * (BOX.y - ty) - BOX.d * BOX.vy) * dt; BOX.y += BOX.vy * dt; } }
    // and a holographic sight's reticle, a red dot's dot, an aperture's ghost ring, each where your eye sees it, and the
    // gun a little out of focus down any of them
    const S = SCOPE_V, over = !!LH;
    S.on = over && drawnUp(LH.obj) && (scope || w > 0.3);   // (not with the gun put away for a vault or a station)
    if (S.on) {
      S.kind = LH.kind; S.eye.copy(_pa); S.obj.copy(_pb); S.dir.copy(_sd); S.r = LH.r; S.hw = LH.hw; S.hh = LH.hh;
      LH.obj.matrixWorld.extractBasis(S.ux, S.uy, _vcH); S.ux.normalize(); S.uy.normalize();
      S.mag = LH.kind === 'acog' ? 4 : 1.5 * ((SCOPES[T('sight')] || SCOPES[3]).zoom);
      // where your eye is off its axis, across the view and up it, as a share of how far it can be and still see all of it
      _vcH.subVectors(c.position, _pa); _vcH.addScaledVector(_sd, -_vcH.dot(_sd)); c.matrixWorld.extractBasis(_vcD, _faV, _vcZ);
      S.off.set(_vcH.dot(_vcD) / EYEBOX + BOX.x, _vcH.dot(_faV) / EYEBOX + BOX.y);
      S.a = scope ? 1 : smooth(clamp((w - 0.3) / 0.35, 0, 1)); S.w = w;
    }
    sightHide(L && w > 0.5 ? L.hide : []);
    // particles thinned toward your aim down the sights (effects/sprite-batch.js), round where the crosshair would be
    { const [ox, oy] = fpAimPx(); R.getDrawingBufferSize(_vcS); SPRITE_RES.set(_vcS.x, _vcS.y); SPRITE_AIM.set(0.5 + ox / innerWidth, 0.5 - oy / innerHeight, AIM_THIN.r, AIM_THIN.k * smooth(clamp((w - 0.3) / 0.6, 0, 1))); }
    // in first person every sight's glass is clear to look through (GM.glass, shared, back as it was after)
    glassSee(true);
    // drawn in a little down the sights (a scope's magnified in its own view instead)
    const fov = (SET.fov || 75) * (1 - FPV.ads * (ANIM.ads || 0)) * (1 - 0.04 * smooth(clamp(ANIM.healFx || 0, 0, 1))) * (1 - clamp(V.jz, -0.2, 0.2)) * (1 + FPV.sprint * smooth(clamp(ANIM.sprintK || 0, 0, 1)));   // (a touch wider at a sprint)
    if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
  } else {
    SCOPE_V.on = false; V.sw = 0; sightHide([]); glassSee(false); SPRITE_AIM.w = 0;
    // the free camera: flown, easing into and out of its speed
    const s = V.speed * (keys.has('shift') ? FREE.fast : 1), cy = Math.cos(V.fyaw), sy = Math.sin(V.fyaw), cp = Math.cos(V.fpitch), spp = Math.sin(V.fpitch);
    let f = 0, r = 0, u = 0;
    if (keys.has('w') || keys.has('arrowup')) f += 1; if (keys.has('s') || keys.has('arrowdown')) f -= 1;
    if (keys.has('d') || keys.has('arrowright')) r += 1; if (keys.has('a') || keys.has('arrowleft')) r -= 1;
    if (keys.has(' ') || keys.has('e')) u += 1; if (keys.has('control') || keys.has('c') || keys.has('q')) u -= 1;
    _vcD.set(sy * cp * f - cy * r, spp * f + u, cy * cp * f + sy * r); if (_vcD.lengthSq() > 1) _vcD.normalize(); _vcD.multiplyScalar(s);
    const k = 1 - Math.exp(-rdt * FREE.acc); V.vx += (_vcD.x - V.vx) * k; V.vy += (_vcD.y - V.vy) * k; V.vz += (_vcD.z - V.vz) * k;
    V.fx += V.vx * rdt; V.fy = clamp(V.fy + V.vy * rdt, 0.25, FREE.top); V.fz += V.vz * rdt;
    c.position.set(V.fx, V.fy, V.fz); c.rotation.set(V.fpitch, V.fyaw + Math.PI, 0, 'YXZ');
    const fov = SET.fov || 75; if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
  }
  c.updateMatrixWorld(true);
}
