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
import { CAM_OFF, cv, FP_CAM, GUN_Y, ISO_CAM, setCam, V3 } from '../core/renderer.js';
import { clamp, rr, smooth } from '../core/math.js';
import { thinRay } from '../world/thin-walls.js';
import { bulletBlocked } from '../world/collision.js';
import { P, PM } from '../player/player.js';
import { curId, W, W8 } from './run-state.js';
import { gunMeshes } from '../weapons/gun-materials.js';
import { openSt } from '../stations/station-ui.js';
import { state } from './state.js';
import { keys, lockLost } from '../input/keyboard-mouse.js';
import { ANIM } from '../player/animation.js';
import { cheatOn } from '../ui/cheats.js';
import { SET, setOpen } from '../ui/settings.js';

// mode: the view picked; on: the one in use this frame (the isometric one on the menus and when you're down)
export const VCAM = { mode: 'iso', on: 'iso', yaw: Math.PI, pitch: 0, aimY: GUN_Y };
export const fpOn = () => VCAM.on === 'fp', freeOn = () => VCAM.on === 'free', isoOn = () => VCAM.on === 'iso';
// how it looks and moves: the eye's place on the head (from its middle: up, forward), how quickly it follows the head
// across and up and down (the stride's bob, smoothed), the furthest up and down you can look, a shot's kick and how
// it comes home, how far aiming down the sights and a scope draw the view in (and the eye drops to the gun for it: cheek,
// down and forward), and the free camera's speeds. side: the eye's a little out toward the arm the gun's in, past the
// gun (held X to that side: weapons/gun-materials.js), so the gun sits a little right of the middle of the view, as in
// any shooter. sight: down the sights the eye goes to the gun's own sight line, just over the top of it (whatever's on
// it, a scope too), at the cheek of a long gun (this far forward of its butt) or behind a handgun held out (this far
// back from its rear)
const FPV = { eye: [0.04, 0.12], side: 0.15, sight: [0.035, 0.1, 0.28], follow: 16, followY: 9, pitch: 1.45, sens: 0.0022, kick: 0.05, kickK: 150, kickD: 19, ads: 0.24, scope: 0.5 };
const FREE = { speed: 7, min: 1, max: 40, fast: 3, acc: 7, top: 40 };
// where the view and the free camera are, and its springs (kick: the pitch; ky: the yaw)
const V = { x: P.x, y: 1.4, z: P.z, fx: 0, fy: 6, fz: 0, fyaw: 0, fpitch: -0.6, vx: 0, vy: 0, vz: 0, speed: FREE.speed, kick: 0, vk: 0, ky: 0, vky: 0, eye: null, lookN: 0 };
const _vcE = new V3(), _vcD = new V3(), lookHint = $('lookHint');

// the view in use: what's picked, but the isometric one on the menus, as you go down and once you're down
const wantOn = () => (state === 'play' || state === 'paused') && !P.dead ? VCAM.mode : 'iso';
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
export function wantLock() {
  if (isoOn() || locked() || !cv.requestPointerLock) return;
  try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function unlock() { if (locked()) { selfUnlock = true; document.exitPointerLock(); } }
// the mouse moved this much (pixels) while it's locked: the view turns, slower down the sights and slower again through
// a scope (the settings' sensitivity on top)
export function viewLook(dx, dy) {
  const s = FPV.sens * (SET.sens || 100) / 100 * (1 - 0.35 * (ANIM.ads || 0) - 0.3 * (ANIM.scopeK || 0));
  if (freeOn()) { V.fyaw -= dx * s; V.fpitch = clamp(V.fpitch - dy * s, -FPV.pitch, FPV.pitch); return; }
  VCAM.yaw -= dx * s; VCAM.pitch = clamp(VCAM.pitch - dy * s, -FPV.pitch, FPV.pitch);
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
  const y = freeOn() ? V.fyaw : VCAM.yaw; MV_F.x = Math.sin(y); MV_F.z = Math.cos(y); MV_R.x = -MV_F.z; MV_R.z = MV_F.x;
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
export function viewKick(pw, auto) { if (isoOn()) return; V.vk += pw * FPV.kick * 22 * (auto ? 0.6 : 1); V.vky += pw * FPV.kick * 6 * rr(-0.5, 0.5); }
// where the sounds are heard from, and which way's right: your eyes, or the free camera
export function listener() { return freeOn() ? { x: V.fx, y: V.fy, z: V.fz, rx: -Math.cos(V.fyaw), rz: Math.sin(V.fyaw) } : { x: V.x, y: V.y, z: V.z, rx: -Math.cos(VCAM.yaw), rz: Math.sin(VCAM.yaw) }; }
// the ground under the view, for what's laid out round it (the camera's target: game/camera.js)
export function viewGround(t) { if (freeOn()) t.set(V.fx + Math.sin(V.fyaw) * 4, 0, V.fz + Math.cos(V.fyaw) * 4); else t.set(P.x, 0, P.z); }
// a point's on the screen this frame (a projected point behind a perspective camera comes out mirrored, past z 1)
export const onScreen = v => v.z < 1 && v.z > -1;

// where the eye goes down the sights of the gun in your hands (out), from its shape in its hold, worked out once for each
// gun as it's built (a new scope, a new gun: a new one); false if there's none
const _sb = new THREE.Box3(), _sm = new THREE.Matrix4(), _sm2 = new THREE.Matrix4(), SIGHT = { id: null, at: new V3() };
function sightAt(out) {
  const g = gunMeshes[W8.cur]; if (!g) return false;
  if (SIGHT.id !== g.uuid) {
    // (in the gun's own frame, so it's the same wherever the gun is: in your hands, or on its way there from your back)
    SIGHT.id = g.uuid; g.updateMatrixWorld(true); _sm.copy(g.matrixWorld).invert(); const b = new THREE.Box3().makeEmpty();
    g.traverse(o => { if (!o.isMesh || !o.visible || !o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(_sb.copy(o.geometry.boundingBox).applyMatrix4(_sm2.multiplyMatrices(_sm, o.matrixWorld))); });
    if (b.isEmpty()) { SIGHT.id = null; return false; }
    const long = b.max.z - b.min.z > 0.45, S = FPV.sight;
    SIGHT.at.set((b.min.x + b.max.x) / 2, b.max.y + S[0], long ? b.min.z + S[1] : b.min.z - S[2]);
  }
  out.copy(SIGHT.at); g.localToWorld(out); return true;
}

// each frame, from game/camera.js: the view in use, then the camera placed. roll: the springs' tip (a shot, a hit, a
// vault), sh: the shake
export function viewFrame(rdt, roll, sh) {
  syncView();
  if (isoOn()) { if (!lookHint.hidden) lookHint.hidden = true; return; }
  // a menu up (a station's, the cheats', the settings, the pause), the mouse is let go for it; and while it's free in
  // play, a word that a click takes it back
  const menu = state !== 'play' || P.dead || !!openSt || cheatOn || setOpen();
  if (menu && locked()) unlock();
  const hint = !menu && !locked(); if (lookHint.hidden === hint) lookHint.hidden = !hint;
  const c = FP_CAM;
  for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++) {
    V.vk += (-FPV.kickK * V.kick - FPV.kickD * V.vk) * dt; V.kick += V.vk * dt;
    V.vky += (-FPV.kickK * V.ky - FPV.kickD * V.vky) * dt; V.ky += V.vky * dt;
  }
  if (fpOn()) {
    // the eyes: on the head, the way it faces. Your own movement's taken as it comes; the head's sway about you (each
    // step, a lean, a vault) is eased, the bob more than the rest
    const ads = smooth(clamp(ANIM.ads || 0, 0, 1)), D = W(curId());
    PM.g.updateMatrixWorld(true); _vcE.set(D && D.akimbo ? 0 : FPV.side, FPV.eye[0], FPV.eye[1]).applyMatrix4(PM.head.matrixWorld);
    if (ads > 0.001 && D && !D.melee && !D.akimbo && sightAt(_vcD)) _vcE.lerp(_vcD, ads);
    const rx = _vcE.x - P.x, ry = _vcE.y, rz = _vcE.z - P.z;
    if (!V.eye) V.eye = { x: rx, y: ry, z: rz };
    const k = 1 - Math.exp(-rdt * FPV.follow), ky = 1 - Math.exp(-rdt * FPV.followY);
    V.eye.x += (rx - V.eye.x) * k; V.eye.y += (ry - V.eye.y) * ky; V.eye.z += (rz - V.eye.z) * k;
    V.x = P.x + V.eye.x; V.y = V.eye.y; V.z = P.z + V.eye.z;
    c.position.set(V.x + rr(-0.5, 0.5) * sh * 0.25, V.y + rr(-0.5, 0.5) * sh * 0.25, V.z);
    c.rotation.set(VCAM.pitch + V.kick, VCAM.yaw + Math.PI + V.ky, roll * 0.6, 'YXZ');
    // drawn in down the sights, and further through a scope
    const fov = (SET.fov || 75) * (1 - FPV.ads * (ANIM.ads || 0) - FPV.scope * (ANIM.scopeK || 0)) * (1 - 0.04 * smooth(clamp(ANIM.healFx || 0, 0, 1)));
    if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
  } else {
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
