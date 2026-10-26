// The cheat menu's little studio (ui/cheats.js): a small renderer of its own on a canvas in the panel, under a studio
// light rather than the farm's. It shows either a weapon turning slowly, built just as it's built for your hands
// (buildWeapon) with everything on it that shows (its mods, tiers, attachments, the rounds and the mag in it), or you:
// a copy of the survivor as you stand (showFigure), the camera gliding in to whatever part of you is being changed
// (your face, your hat, your shoes...: FOCUS). Drag it round, drag with the right button (or Shift held) to move it
// about, scroll to zoom, double-click to set it all back; let go and a weapon (or the whole of you) carries on turning.
import { V3 } from '../core/renderer.js';
import { clamp } from '../core/math.js';
import { binModel, BLOB_TEX } from '../core/geometry.js';
import { PM } from '../player/player.js';
import { bareLook } from '../player/gear.js';
import { ARM_THIN, ARM_X } from '../player/hold.js';
import { WEAP } from '../weapons/gun-stats.js';
import { modLv } from '../weapons/mod-levels.js';
import { setTierCtx, W, W8 } from '../game/run-state.js';
import { gunMeshes } from '../weapons/gun-materials.js';
import { buildWeapon, weaponRec } from '../weapons/build-weapons.js';
import { blinkStep, faceGaze, gazeStep, LOOK } from '../player/look.js';

// how it turns (radians a second) and how far it tips, how close the camera comes and how far it'll zoom either way,
// how long it waits after you let go before it turns on its own again (s), and how much the wheel zooms (per unit it rolls)
const GV = { spin: 0.42, pitch: [-0.7, 0.9], fov: 26, fill: 1.15, zoom: [0.55, 1.8], idle: 1.6, wheel: 0.001 };
let gvR = null, gvScene = null, gvCam = null, gvPivot = null, gvModel = null, gvSig = '', gvRaf = 0, gvLast = 0;
let yaw = 1.1, pitch = 0.16, gvZoom = 1, idleT = 9, drag = null, gvLen = 0.5, gvH = 0.2;
// showing you rather than a weapon: where on you the camera's headed (fig.to: the point, how far back, from which way
// round and how far above) and where it is on the way there (fig.at, fig.dist), and each part of you the views look at
let fig = null, gvRig = null, gvFloor = null, gvSpin = true;
const figPart = new Map();
// the studio's lights: [colour, strength, and where from (to the camera's right, up, toward it)]; sky: [above, below, strength]
export const STUDIO_LIGHT = { sky: [0xfff0dc, 0x1c1610, 1.15], key: [0xfff0dc, 3.4, 1.6, 2.4, 2.2], fill: [0xc4d6ff, 1.05, -2.3, 0.8, 1.4], rimW: [0xffc48a, 2.6, -1.5, 1.9, -2.4], rimC: [0xa8c0ff, 1.5, 1.9, 1.4, -2.1] };
// where the camera looks: the gun's middle, or wherever it's been moved to (panned), and how far that may wander (of
// the gun's length)
const gvAim = new V3(), GV_PAN = 0.75, _gvR = new V3(), _gvU = new V3(), _gvL = new V3();
const angWrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const gunView = document.createElement('canvas');
gunView.className = 'chView'; gunView.setAttribute('aria-label', 'Drag to look round it, scroll to zoom');

// the model's own colours without the farm's light map (core/shaders.js: lit), so it looks the same by day or night;
// a blood-stained copy is drawn as what it's a copy of (effects/body-blood.js), which has the colour as it is now
const plainOf = new WeakMap();
export function plain(m) {
  if (Array.isArray(m)) return m.map(plain);
  if (m.userData && m.userData.bloodOf) m = m.userData.bloodOf;
  let p = plainOf.get(m); if (p) { if (m.color) p.color.copy(m.color); return p; }   // (your skin and shirt are recoloured in place: player/look.js)
  const o = { color: m.color ? m.color.clone() : new THREE.Color(0xffffff), map: m.map || null, vertexColors: !!m.vertexColors, transparent: !!m.transparent, opacity: m.opacity ?? 1, side: m.side };
  if (m.isMeshBasicMaterial) p = new THREE.MeshBasicMaterial(o);
  else { p = new THREE.MeshLambertMaterial(o); if (m.emissive) { p.emissive.copy(m.emissive); p.emissiveIntensity = m.emissiveIntensity ?? 1; } }
  plainOf.set(m, p); return p;
}
function setup() {
  gvR = new THREE.WebGLRenderer({ canvas: gunView, antialias: true, alpha: true });
  gvR.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  gvScene = new THREE.Scene(); gvCam = new THREE.PerspectiveCamera(GV.fov, 2, 0.01, 20);
  // a photographer's three lights (STUDIO_LIGHT): a warm key high and to the front-right, a softer cool fill from the
  // other side so the shadowed half still reads, and two rims from behind (warm on one side, cool on the other) that pick
  // the outline out of the dark backdrop; under them a low wash of sky and floor so nothing goes flat black. They're fixed
  // to the camera's turning, so whichever way round you're looked at the light falls the same way
  const L = STUDIO_LIGHT, rig = new THREE.Group(); gvRig = rig; gvScene.add(rig);
  rig.add(new THREE.HemisphereLight(L.sky[0], L.sky[1], L.sky[2]));
  for (const [c, k, x, y, z] of [L.key, L.fill, L.rimW, L.rimC]) { const d = new THREE.DirectionalLight(c, k); d.position.set(x, y, z); rig.add(d); }
  gvPivot = new THREE.Group(); gvScene.add(gvPivot);
  // the soft dark patch you stand on (only when it's you in here, not a gun)
  gvFloor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: BLOB_TEX, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
  gvFloor.scale.set(1.1, 1, 0.8); gvFloor.position.y = 0.004; gvFloor.visible = false; gvScene.add(gvFloor);
  // the left button turns it; the right or middle button, or the left with Shift held, moves it about (pan)
  gunView.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw, pitch, pan: e.button === 2 || e.button === 1 || e.shiftKey, aim: gvAim.clone() }; try { gunView.setPointerCapture(e.pointerId); } catch (er) {} idleT = 0; });
  gunView.addEventListener('pointermove', e => {
    if (!drag) return; idleT = 0;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.pan) {
      // across the view and up it, as far as the mouse went at the gun's distance
      const k = 2 * camDist() * Math.tan(GV.fov * Math.PI / 360) / Math.max(1, gunView.clientHeight);
      gvCam.matrixWorld.extractBasis(_gvR, _gvU, new V3());
      gvAim.copy(drag.aim).addScaledVector(_gvR, dx * k).addScaledVector(_gvU, -dy * k).clampLength(0, (fig ? 1.2 : gvLen) * GV_PAN);
    } else { yaw = drag.yaw - dx * 0.011; pitch = clamp(drag.pitch + dy * 0.008, GV.pitch[0], GV.pitch[1]); }   // (dragged right, it turns right under the pointer)
  });
  gunView.addEventListener('contextmenu', e => e.preventDefault());
  const up = () => { drag = null; idleT = 0; }; gunView.addEventListener('pointerup', up); gunView.addEventListener('pointercancel', up);
  // the wheel zooms like anywhere else: rolled toward you (down) it backs out, away from you it comes in, by as much as
  // it rolled (a notch about a tenth; a trackpad's little deltas a little at a time). It goes no further: the menu's own
  // gliding scroll (core/dom.js) would otherwise scroll the list under the view at the same time
  gunView.addEventListener('wheel', e => {
    e.preventDefault(); e.stopPropagation();
    const d = clamp(e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1), -200, 200);
    gvZoom = clamp(gvZoom * Math.exp(-d * GV.wheel), GV.zoom[0], GV.zoom[1]);
  }, { passive: false });
  gunView.addEventListener('dblclick', () => { if (fig) { yaw = fig.to.yaw; pitch = fig.to.pitch; } else { yaw = 1.1; pitch = 0.16; } gvZoom = 1; gvAim.set(0, 0, 0); idleT = 9; });
}
// what the model is built from, to rebuild it only when something on it changes
const sigOf = id => JSON.stringify([id, (W8.mods[id] || []).map(m => [m, modLv(m)]), W8.gt[id], W8.att && W8.att[id], W8.tune && W8.tune[id], W8.rounds && W8.rounds[id], W8.own && W8.own[id]]);
// show weapon id (rebuilt if it's changed since)
export function showGun(id) {
  if (!WEAP[id]) return;
  if (!gvR) setup();
  const sig = sigOf(id); if (sig === gvSig && gvModel && !fig) return; gvSig = sig;
  dropStudio();   // (before leaving the figure behind: a copy of you only comes away)
  if (fig) { yaw = 1.1; pitch = 0.16; gvZoom = 1; idleT = 9; } fig = null;
  const g = new THREE.Group(), D = W(id) || WEAP[id], mods = {}; (W8.mods[id] || []).forEach(m => { mods[m] = modLv(m); });
  setTierCtx(id); try { buildWeapon(g, id, D, mods, weaponRec()); } finally { setTierCtx(null); }
  g.traverse(o => { if (o.isMesh) { o.material = plain(o.material); o.castShadow = o.receiveShadow = false; } });
  // centred on its middle, sized to fill the view
  g.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(g), c = bb.getCenter(new V3()), sz = bb.getSize(new V3());
  g.position.sub(c); gvLen = Math.max(sz.z, sz.x, 0.2); gvH = Math.max(sz.y, 0.1);
  gvPivot.add(g); gvModel = g; gvAim.set(0, 0, 0);
  if (!gvRaf) { gvLast = performance.now(); gvRaf = requestAnimationFrame(gvTick); }
}
// how far back the camera sits: far enough to fit the gun's length across the view and its height up it, then zoomed
function gvDist() { const half = Math.tan(GV.fov * Math.PI / 360); return GV.fill * Math.max(gvLen / (2 * half * gvCam.aspect), gvH / (2 * half)) / gvZoom; }
// let the model go: a weapon's own geometry with it, but a copy of you only comes away (its geometry is yours)
function dropStudio() { if (!gvModel) return; if (fig) gvModel.parent.remove(gvModel); else binModel(gvModel); gvModel = null; }
const camDist = () => fig ? fig.dist / gvZoom : gvDist();

// ---- you, in the studio ----
// a copy of what's showing of you: every piece, in its place and pose, in plain materials (not the outlines or the
// see-through rim); each part of you mapped to its copy (figPart) so the views can find it
function copyPlain(o) {
  if (!o.visible || (o.userData && o.userData.isOutline)) return null;
  let c;
  if (o.isMesh) { const m = o.material; if (!m || m.colorWrite === false || m.visible === false || m.depthFunc === THREE.GreaterDepth) return null; c = new THREE.Mesh(o.geometry, plain(m)); }
  else if (o.isObject3D && !o.isLight && !o.isCamera && !o.isSprite && !o.isPoints && !o.isLine) c = new THREE.Group();
  else return null;
  c.position.copy(o.position); c.quaternion.copy(o.quaternion); c.scale.copy(o.scale);
  figPart.set(o, c);
  for (const k of o.children) { const q = copyPlain(k); if (q) c.add(q); }
  return c;
}
// what each view of you looks at (on: the part, at: a point on it in its own space; no part: from your feet), how far
// back (m), from which way round (0: straight in front of you) and how far above (radians)
const gvBlink = {}, gvGaze = {};
const FOCUS = {
  body: { at: [0, 0.82, 0], dist: 3.4, yaw: 0.55, pitch: 0.1 },
  face: { on: 'head', at: [0, 0.01, 0.1], dist: 1.22, yaw: 0.14, pitch: 0.05 },   // (the whole head and a hat in the frame, not cut off)
  hair: { on: 'head', at: [0, 0.08, 0], dist: 1.25, yaw: 0.95, pitch: 0.22 },
  hat: { on: 'head', at: [0, 0.16, 0], dist: 1.3, yaw: 0.6, pitch: 0.38 },
  top: { on: 'torso', at: [0, 0.05, 0.05], dist: 1.75, yaw: 0.35, pitch: 0.08 },
  legs: { at: [0, 0.42, 0.02], dist: 1.9, yaw: 0.45, pitch: 0.05 },
  shoes: { at: [0, 0.08, 0.06], dist: 1.15, yaw: 0.55, pitch: 0.42 },
  hands: { at: [0, 0.72, 0.04], dist: 1.55, yaw: 0.3, pitch: 0.16 },   // (both wrists, from in front)
  gear: { on: 'torso', at: [0, 0.0, -0.18], dist: 2.6, yaw: Math.PI - 0.6, pitch: 0.22 }
};
// the copy of you stood easy: up straight, feet together, arms down at your sides a little out from you, the weapon in
// your hands put away (what's slung or holstered stays), each part set back where the rig has it at rest
// (characters/rig.js). get: the copy's part for each of yours (a teammate's look on a card: ui/look-card.js)
const EASY = { arm: 1.5, out: 0.06 };
export function standEasy(get = o => figPart.get(o)) {
  const at = (o, x, y, z) => { const c = get(o); if (c) { c.position.set(x, y, z); c.rotation.set(0, 0, 0); } return c; };
  at(PM.upper, 0, 0, 0); at(PM.lower, 0, 0, 0); at(PM.torso, 0, 0.86, 0); at(PM.head, 0, 1.33, 0);
  at(PM.legL, -0.13, 0.55, 0); at(PM.legR, 0.13, 0.55, 0);
  [PM.shinL, PM.shinR].forEach(o => { const c = get(o); if (c) c.rotation.set(0, 0, 0); });
  [[PM.armL, -1], [PM.armR, 1]].forEach(([o, sg]) => { const c = at(o, sg * ARM_X, 1.08, 0); if (c) { c.rotation.set(EASY.arm, 0, sg * EASY.out, 'ZXY'); c.scale.set(ARM_THIN, ARM_THIN, 1); } });   // (down, then out from the side; as long as each other, whatever stretch a held gun had given one)
  const g = get(gunMeshes[W8.cur]); if (g) g.visible = false;
}
// show you, the camera headed for view `key`; fresh: copy you again (your look's just changed); gear: with what your
// upgrades put on you (the armour's jacket, boots, gloves, the helmet...), or (false) in just the clothes you're changing;
// easy: stood easy (standEasy), not as you are (on the title you're down on one knee, with a gun in your hands);
// room: how much further back than usual the camera stands (a bigger view shows more round the part being changed)
export function showFigure(key, fresh, gear, easy, room = 1) {
  if (!gvR) setup();
  const F = FOCUS[key] || FOCUS.body, was = fig;
  if (fresh || !fig) {
    dropStudio();
    figPart.clear();
    // (in first person your head's hidden: game/view-cam.js; the copy has it as ever)
    const hv = PM.head.visible; PM.head.visible = true;
    const copy = () => { PM.g.updateMatrixWorld(true); return copyPlain(PM.g); }, c = gear ? copy() : bareLook(copy); PM.head.visible = hv;
    c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); if (easy) standEasy(); gvPivot.add(c); gvModel = c; gvSig = '';
    c.updateMatrixWorld(true);
  }
  const part = (F.on && figPart.get(PM[F.on])) || gvModel, at = part.localToWorld(new V3(...F.at));
  fig = { key, to: { at, dist: F.dist * room, yaw: F.yaw, pitch: F.pitch }, at: was ? was.at : at.clone(), dist: was ? was.dist : F.dist * room };
  if (!was || was.key !== key) { yaw = was ? yaw : F.yaw; pitch = was ? pitch : F.pitch; gvZoom = 1; gvAim.set(0, 0, 0); idleT = 0; fig.glide = 1; }
  if (!gvRaf) { gvLast = performance.now(); gvRaf = requestAnimationFrame(gvTick); }
}
// the studio's view buttons (ui/look-menu.js): a quarter turn either way, straight on from the front or the back, back
// to where this part's view starts, or the slow turn of the whole of you on or off (what it is now, returned)
export function studioView(cmd) {
  if (cmd === 'spin') { gvSpin = !gvSpin; return gvSpin; }
  if (!fig) return gvSpin;
  const F = FOCUS[fig.key] || FOCUS.body, to = cmd === 'left' ? yaw - Math.PI / 4 : cmd === 'right' ? yaw + Math.PI / 4 : cmd === 'front' ? 0 : cmd === 'back' ? Math.PI : F.yaw;
  fig.to.yaw = yaw + angWrap(to - yaw); if (cmd === 'reset' || cmd === 'front' || cmd === 'back') { fig.to.pitch = cmd === 'reset' ? F.pitch : 0.08; gvZoom = 1; gvAim.set(0, 0, 0); }
  fig.glide = 1; idleT = 0; return gvSpin;
}
export const studioSpin = () => gvSpin;
// let it go (the menu shut, or another section open): it stops drawing
export function hideGun() { if (gvRaf) cancelAnimationFrame(gvRaf); gvRaf = 0; }
function gvTick(t) {
  gvRaf = 0;
  if (!gunView.isConnected || !gvR) return;
  const real = Math.min(0.3, (t - gvLast) / 1000), dt = Math.min(0.05, real); gvLast = t;   // (the glide goes by the real time, so it gets there however slow the frames)
  idleT += dt;
  if (fig) {
    // gliding in to the part of you being changed: the point, the distance and the way round all ease there together
    const k = 1 - Math.exp(-real * 5.5);
    fig.at.lerp(fig.to.at, k); fig.dist += (fig.to.dist - fig.dist) * k;
    if (fig.glide && !drag) { yaw += angWrap(fig.to.yaw - yaw) * k; pitch += (fig.to.pitch - pitch) * k; if (Math.abs(angWrap(fig.to.yaw - yaw)) < 0.01 && Math.abs(fig.to.pitch - pitch) < 0.01) fig.glide = 0; }
    if (drag) fig.glide = 0;
    if (fig.key === 'body' && gvSpin && !drag && !fig.glide && idleT > GV.idle) yaw += GV.spin * 0.6 * dt * Math.min(1, (idleT - GV.idle) / 0.8);   // (the whole of you turns slowly, unless it's been told to stay still)
  } else if (!drag && idleT > GV.idle) yaw += GV.spin * dt * Math.min(1, (idleT - GV.idle) / 0.8);   // (easing back into turning)
  const w = gunView.clientWidth, h = gunView.clientHeight;
  if (w && h) {
    const pr = gvR.getPixelRatio(); if (gunView.width !== Math.round(w * pr) || gunView.height !== Math.round(h * pr)) gvR.setSize(w, h, false);
    gvCam.aspect = w / h;
    const d = camDist(), look = fig ? _gvL.copy(fig.at).add(gvAim) : gvAim;
    gvCam.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d).add(look); gvCam.lookAt(look); gvCam.updateProjectionMatrix(); gvCam.updateMatrixWorld();
    gvRig.rotation.y = yaw; gvFloor.visible = !!fig;
    if (fig) { const H = LOOK.g.head.userData.face, b = blinkStep(gvBlink, real); if (H) H.eyes.forEach(e => { const c = figPart.get(e); if (c) c.scale.y = Math.max(0.07, 1 - b); });   // (you blink in here too)
      const gz = gazeStep(gvGaze, real, 1, gvBlink); faceGaze(LOOK.g.head, gz[0], gz[1], o => figPart.get(o)); }   // (and look about)
    gvR.render(gvScene, gvCam);
  }
  gvRaf = requestAnimationFrame(gvTick);
}
