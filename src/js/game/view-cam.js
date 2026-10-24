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
import { curId, SCOPES, T, W, W8 } from './run-state.js';
import { GM, gunMeshes, HOLDS, X } from '../weapons/gun-materials.js';
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
// it comes home, how far aiming down the sights draws the view in, and the free camera's speeds. side: the eye's a
// little out toward the arm the gun's in, past the gun (held X to that side: weapons/gun-materials.js), so the gun sits a
// little right of the middle of the view, as in any shooter (down the sights it comes onto the gun's sight line:
// fpSightAlign)
const FPV = { eye: [0.04, 0.12], side: 0.15, follow: 16, followY: 9, pitch: 1.45, sens: 0.0022, kick: 0.05, kickK: 150, kickD: 19, ads: 0.24 };
const FREE = { speed: 7, min: 1, max: 40, fast: 3, acc: 7, top: 40 };
// where the view and the free camera are, and its springs (kick: the pitch; ky: the yaw)
const V = { x: P.x, y: 1.4, z: P.z, fx: 0, fy: 6, fz: 0, fyaw: 0, fpitch: -0.6, vx: 0, vy: 0, vz: 0, speed: FREE.speed, kick: 0, vk: 0, ky: 0, vky: 0, eye: null, roll: 0, sw: 0, lyaw: null, lpitch: null };
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
  const s = FPV.sens * (SET.sens || 100) / 100 * (1 - 0.35 * (ANIM.ads || 0)) / (SCOPE_V.on ? 1 + (SCOPE_V.mag - 1) * 0.6 * SCOPE_V.a : 1);   // (slower through a scope, as it magnifies)
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

// ---- down the sights in first person. Each gun's sight line, in the frame of what carries it: an optic's own axis
// (weapons/attachments.js notes it on the optic), or for iron sights a line along the bore at the height of the front
// sight's tip (the rear sight's notch or aperture stands at that same height over the bore, as on any real gun), found
// once for each gun as it's built by feeling down onto its top along its middle, over its front IRON.front of its length
// (IRON_Y: a gun's own sight height, where a hood stands over its post). The rear sight's the furthest back of its top
// that comes up near that height (within IRON.rear). The line's taken from just over the rear sight's top (IRON.peek:
// the front sight's tip shows level in its notch, as you'd hold it) to the front sight's tip, raised at the back as
// far as it needs to clear anything between them. On a long gun your cheek's on the stock, IRON.pull up it from the
// butt (between IRON.cheek and IRON.far from the rear sight), so a rear aperture's close and big round the front
// sight; a handgun's held out at arm's length
const IRON = { front: 0.42, step: 0.004, rear: 0.016, peek: 0.0022, cheek: 0.05, far: 0.22, pull: 0.26, long: 0.45 }, IRON_Y = {};
// a rear aperture's middle, which the line's taken through instead of over it (the AR's A2 sight: weapons/models-rifles.js)
const IRON_AP = { ar: 1.2393 };
const SL = { key: null, obj: null, a: new V3(), b: new V3(), kind: 'iron', relief: null, r: 0 };
const _ray = new THREE.Raycaster(), _ro = new V3(), _rdn = new V3(), _sb = new THREE.Box3(), _sm = new THREE.Matrix4(), _sm2 = new THREE.Matrix4();
function sightLine() {
  const s = W8.cur, h = HOLDS[s] && HOLDS[s].R, id = curId(); if (!h || !id) return null;
  const key = h.uuid + ':' + id;
  if (SL.key === key) return SL.obj ? SL : null;
  SL.key = key; SL.obj = null;
  let opt = null; h.traverse(o => { if (!opt && o.userData.optic) opt = o; });
  if (opt) { const O = opt.userData.optic; SL.obj = opt; SL.kind = O.kind; SL.a.set(O.x, O.y, O.zr); SL.b.set(O.x, O.y, O.zf); SL.relief = O.relief ?? null; SL.r = O.r; return SL; }
  h.updateMatrixWorld(true); _sm.copy(h.matrixWorld).invert();
  const meshes = [], b = new THREE.Box3().makeEmpty(); h.traverseVisible(o => { if (o.isMesh && o.geometry) meshes.push(o); });
  for (const o of meshes) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(_sb.copy(o.geometry.boundingBox).applyMatrix4(_sm2.multiplyMatrices(_sm, o.matrixWorld))); }
  if (b.isEmpty()) return null;
  // the top along the middle, front to back
  const prof = [], len = b.max.z - b.min.z, zf = b.max.z - len * IRON.front;
  _rdn.set(0, -1, 0).transformDirection(h.matrixWorld);
  for (let z = b.min.z; z <= b.max.z; z += IRON.step) {
    _ro.set(X, b.max.y + 0.05, z).applyMatrix4(h.matrixWorld); _ray.set(_ro, _rdn); _ray.far = 1;
    const hit = _ray.intersectObjects(meshes, false)[0]; if (hit) prof.push([z, _ro.copy(hit.point).applyMatrix4(_sm).y]);
  }
  let top = -1e9, tz = 0;
  for (const [z, y] of prof) if (z >= zf && y > top) { top = y; tz = z; }
  if (top < -1e8) return null;
  const y = IRON_Y[id] ?? top;
  let rz = tz - 0.3; for (const [z, yy] of prof) if (z < tz - 0.12 && yy >= y - IRON.rear) { rz = z; break; }
  let hr = y;
  for (const [z, yy] of prof) {
    if (z >= rz && z <= rz + 0.06) hr = Math.max(hr, yy + IRON.peek);   // over the rear sight
    else if (z > rz + 0.06 && z < tz - 0.01) hr = Math.max(hr, y + (yy + 0.0008 - y) * (tz - rz) / (tz - z));   // clear of what's between
  }
  if (IRON_AP[id] !== undefined) hr = IRON_AP[id];
  const long = len > IRON.long;
  SL.obj = h; SL.kind = 'iron'; SL.a.set(X, hr, rz); SL.b.set(X, y, tz); SL.relief = long ? clamp(rz - (b.min.z + IRON.pull), IRON.cheek, IRON.far) : null; SL.r = 0;
  return SL;
}
// how far down the sights you are, eased
const adsW = () => smooth(clamp(ANIM.ads || 0, 0, 1));
// which way a round goes from your eye this frame: through the crosshair's point (the middle of the view, wandering
// with sway and kicked by recoil: player/shaky-hands.js), as the view's turned
const _aimE = new THREE.Euler();
function aimDir(out) {
  const f = Math.tan(FP_CAM.fov * Math.PI / 360), hh = innerHeight / 2;
  out.set((aimSX() - innerWidth / 2) / hh * f, -(aimSY() - hh) / hh * f, -1).normalize();
  _aimE.set(VCAM.pitch + V.kick, VCAM.yaw + Math.PI + V.ky, V.roll * 0.6, 'YXZ'); return out.applyEuler(_aimE);
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
  _mw.makeTranslation(-_pa.x, -_pa.y, -_pa.z).premultiply(_vcM.makeRotationFromQuaternion(_qi)).premultiply(_vcM.makeTranslation(_pa.x + _vcH.x, _pa.y + _vcH.y, _pa.z + _vcH.z));
  _mw.multiply(gg.matrixWorld).premultiply(_vcM.copy(gg.parent.matrixWorld).invert());
  _mw.decompose(gg.position, gg.quaternion, gg.scale); gg.updateMatrix(); gg.updateMatrixWorld(true);
}
// your eye on your head, before it's eased (a little out toward the gun arm: FPV.side)
function headEye(out) { const D = W(curId()); return out.set(D && D.akimbo ? 0 : FPV.side, FPV.eye[0], FPV.eye[1]).applyMatrix4(PM.head.matrixWorld); }
// looking through a scope: where it is and what it shows, for its view drawn in its eyepiece (effects/scope-view.js).
// on: whether it's up; eye, obj: its eyepiece's and its front lens's middles; dir: its axis; r: the eyepiece's radius;
// mag: how much it magnifies; kind: 0 a hunting scope's duplex, 1 the ACOG's chevron; a: how much of it shows (it comes
// in as the scope comes up); off: where your eye is off its axis, as a share of the eyepiece's radius (its shadow)
export const SCOPE_V = { on: false, eye: new V3(), obj: new V3(), dir: new V3(), r: 0.02, mag: 4, kind: 0, a: 0, off: new THREE.Vector2() };
// the eye's place off the scope's axis, on a spring: low as it comes up, kicked by a shot, trailing a quick turn
const BOX = { x: 0, y: 0, vx: 0, vy: 0, k: 70, d: 10 };
// down the sights of anything but a scope, there's no crosshair: you aim with the sights themselves (ui/crosshair.js)
export const fpSighted = () => fpOn() && V.sw > 0.55;
const GLASS_SEE = { on: false };

// each frame, from game/camera.js: the view in use, then the camera placed. roll: the springs' tip (a shot, a hit, a
// vault), sh: the shake
export function viewFrame(rdt, roll, sh) {
  syncView();
  if (isoOn()) { if (!lookHint.hidden) lookHint.hidden = true; SCOPE_V.on = false; V.sw = 0; return; }
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
    V.roll = roll;
    PM.g.updateMatrixWorld(true); headEye(_vcE);
    const rx = _vcE.x - P.x, ry = _vcE.y, rz = _vcE.z - P.z;
    if (!V.eye) V.eye = { x: rx, y: ry, z: rz };
    const k = 1 - Math.exp(-rdt * FPV.follow), ky = 1 - Math.exp(-rdt * FPV.followY);
    V.eye.x += (rx - V.eye.x) * k; V.eye.y += (ry - V.eye.y) * ky; V.eye.z += (rz - V.eye.z) * k;
    V.x = P.x + V.eye.x; V.y = V.eye.y; V.z = P.z + V.eye.z;
    // down the sights: the gun brought onto this frame's aim (the kick's moved on since it was held), and the eye onto
    // its sight line: at the head's own distance behind it, or a scope's eye relief behind its eyepiece
    const w = adsW(), D = W(curId()), L = w > 0.001 && D && !D.melee && !D.akimbo ? sightLine() : null, gg = gunMeshes[W8.cur];
    _vcE.set(V.x, V.y, V.z);
    if (L && gg) {
      fpSightAlign(gg, false); _pa.copy(L.a).applyMatrix4(L.obj.matrixWorld); _pb.copy(L.b).applyMatrix4(L.obj.matrixWorld); _sd.subVectors(_pb, _pa).normalize();
      if (L.relief !== null) _vcD.copy(_pa).addScaledVector(_sd, -L.relief);
      else _vcD.copy(_pa).addScaledVector(_sd, clamp(_vcH.subVectors(_vcE, _pa).dot(_sd), -0.8, -0.04));
      _vcE.lerp(_vcD, w);
    }
    V.sw = L ? w : 0;
    c.position.set(_vcE.x + rr(-0.5, 0.5) * sh * 0.25, _vcE.y + rr(-0.5, 0.5) * sh * 0.25, _vcE.z);
    c.rotation.set(VCAM.pitch + V.kick, VCAM.yaw + Math.PI + V.ky, roll * 0.6, 'YXZ');
    // a scope's own view (effects/scope-view.js), magnified in its eyepiece; the eye's spring off its axis
    const scope = !!L && (L.kind === 'scope' || L.kind === 'acog');
    { const yr = (VCAM.yaw - (V.lyaw ?? VCAM.yaw)) / Math.max(rdt, 1e-3), pr = (VCAM.pitch - (V.lpitch ?? VCAM.pitch)) / Math.max(rdt, 1e-3); V.lyaw = VCAM.yaw; V.lpitch = VCAM.pitch;
      const tx = clamp(yr * 0.18, -0.7, 0.7), ty = -1.5 * (1 - w) + clamp(-pr * 0.18, -0.7, 0.7) + V.kick * 9;
      for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++) { BOX.vx += (-BOX.k * (BOX.x - tx) - BOX.d * BOX.vx) * dt; BOX.x += BOX.vx * dt; BOX.vy += (-BOX.k * (BOX.y - ty) - BOX.d * BOX.vy) * dt; BOX.y += BOX.vy * dt; } }
    const S = SCOPE_V; S.on = scope && w > 0.3;
    if (S.on) {
      S.eye.copy(_pa); S.obj.copy(_pb); S.dir.copy(_sd); S.r = L.r; S.kind = L.kind === 'acog' ? 1 : 0;
      S.mag = L.kind === 'acog' ? 4 : 1.5 * ((SCOPES[T('sight')] || SCOPES[3]).zoom); S.a = smooth(clamp((w - 0.45) / 0.45, 0, 1)); S.off.set(BOX.x, BOX.y);
    }
    // a red dot's or a holographic sight's glass is clear to look through, down it (GM.glass, shared, back as it was after)
    { const see = !!L && (L.kind === 'dot' || L.kind === 'holo') && w > 0.2; if (see !== GLASS_SEE.on) { GLASS_SEE.on = see; GM.glass.transparent = see; GM.glass.opacity = see ? 0.12 : 1; GM.glass.depthWrite = !see; GM.glass.needsUpdate = true; } }
    // drawn in a little down the sights (a scope's magnified in its own view instead)
    const fov = (SET.fov || 75) * (1 - FPV.ads * (ANIM.ads || 0)) * (1 - 0.04 * smooth(clamp(ANIM.healFx || 0, 0, 1)));
    if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
  } else {
    SCOPE_V.on = false; V.sw = 0;
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
