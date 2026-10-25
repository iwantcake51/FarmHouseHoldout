// The cheat menu's little studio (ui/cheats.js): a small renderer of its own on a canvas in the panel, under a studio
// light rather than the farm's. It shows either a weapon turning slowly, built just as it's built for your hands
// (buildWeapon) with everything on it that shows (its mods, tiers, attachments, the rounds and the mag in it), or you:
// a copy of the survivor as you stand (showFigure), the camera gliding in to whatever part of you is being changed
// (your face, your hat, your shoes...: FOCUS). Drag it round, drag with the right button (or Shift held) to move it
// about, scroll to zoom, double-click to set it all back; let go and a weapon (or the whole of you) carries on turning.
import { V3 } from '../core/renderer.js';
import { clamp } from '../core/math.js';
import { binModel } from '../core/geometry.js';
import { PM } from '../player/player.js';
import { bareLook } from '../player/gear.js';
import { WEAP } from '../weapons/gun-stats.js';
import { modLv } from '../weapons/mod-levels.js';
import { setTierCtx, W, W8 } from '../game/run-state.js';
import { buildWeapon, weaponRec } from '../weapons/build-weapons.js';

// how it turns (radians a second) and how far it tips, how close the camera comes and how far it'll zoom either way,
// and how long it waits after you let go before it turns on its own again (s)
const GV = { spin: 0.42, pitch: [-0.7, 0.9], fov: 26, fill: 1.15, zoom: [0.55, 1.8], idle: 1.6 };
let gvR = null, gvScene = null, gvCam = null, gvPivot = null, gvModel = null, gvSig = '', gvRaf = 0, gvLast = 0;
let yaw = 1.1, pitch = 0.16, gvZoom = 1, idleT = 9, drag = null, gvLen = 0.5, gvH = 0.2;
// showing you rather than a weapon: where on you the camera's headed (fig.to: the point, how far back, from which way
// round and how far above) and where it is on the way there (fig.at, fig.dist), and each part of you the views look at
let fig = null;
const figPart = new Map();
// where the camera looks: the gun's middle, or wherever it's been moved to (panned), and how far that may wander (of
// the gun's length)
const gvAim = new V3(), GV_PAN = 0.75, _gvR = new V3(), _gvU = new V3(), _gvL = new V3();
const angWrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const gunView = document.createElement('canvas');
gunView.className = 'chView'; gunView.setAttribute('aria-label', 'Drag to look round it, scroll to zoom');

// the model's own colours without the farm's light map (core/shaders.js: lit), so it looks the same by day or night;
// a blood-stained copy is drawn as what it's a copy of (effects/body-blood.js), which has the colour as it is now
const plainOf = new Map();
function plain(m) {
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
  gvScene.add(new THREE.HemisphereLight(0xfff2dc, 0x2a2018, 2.4));
  const key = new THREE.DirectionalLight(0xfff0d8, 3.2); key.position.set(1.5, 2.2, 2); gvScene.add(key);
  const rim = new THREE.DirectionalLight(0xffb070, 2.2); rim.position.set(-2, 1, -1.6); gvScene.add(rim);
  gvPivot = new THREE.Group(); gvScene.add(gvPivot);
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
  gunView.addEventListener('wheel', e => { e.preventDefault(); gvZoom = clamp(gvZoom * (e.deltaY > 0 ? 1.1 : 0.9), GV.zoom[0], GV.zoom[1]); }, { passive: false });
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
const FOCUS = {
  body: { at: [0, 0.82, 0], dist: 3.4, yaw: 0.55, pitch: 0.1 },
  face: { on: 'head', at: [0, 0.0, 0.1], dist: 0.95, yaw: 0.12, pitch: 0.04 },
  hair: { on: 'head', at: [0, 0.08, 0], dist: 1.25, yaw: 0.95, pitch: 0.22 },
  hat: { on: 'head', at: [0, 0.16, 0], dist: 1.3, yaw: 0.6, pitch: 0.38 },
  top: { on: 'torso', at: [0, 0.05, 0.05], dist: 1.75, yaw: 0.35, pitch: 0.08 },
  legs: { at: [0, 0.42, 0.02], dist: 1.9, yaw: 0.45, pitch: 0.05 },
  shoes: { at: [0, 0.08, 0.06], dist: 1.15, yaw: 0.55, pitch: 0.42 },
  hands: { on: 'armR', at: [0, 0, 0.5], dist: 0.95, yaw: 0.9, pitch: 0.25 },
  gear: { on: 'torso', at: [0, 0.0, -0.18], dist: 2.6, yaw: Math.PI - 0.6, pitch: 0.22 }
};
// show you, the camera headed for view `key`; fresh: copy you again (your look's just changed); gear: with what your
// upgrades put on you (the armour's jacket, boots, gloves, the helmet...), or (false) in just the clothes you're changing
export function showFigure(key, fresh, gear) {
  if (!gvR) setup();
  const F = FOCUS[key] || FOCUS.body, was = fig;
  if (fresh || !fig) {
    dropStudio();
    figPart.clear();
    // (in first person your head's hidden: game/view-cam.js; the copy has it as ever)
    const hv = PM.head.visible; PM.head.visible = true;
    const copy = () => { PM.g.updateMatrixWorld(true); return copyPlain(PM.g); }, c = gear ? copy() : bareLook(copy); PM.head.visible = hv;
    c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); gvPivot.add(c); gvModel = c; gvSig = '';
    c.updateMatrixWorld(true);
  }
  const part = (F.on && figPart.get(PM[F.on])) || gvModel, at = part.localToWorld(new V3(...F.at));
  fig = { key, to: { at, dist: F.dist, yaw: F.yaw, pitch: F.pitch }, at: was ? was.at : at.clone(), dist: was ? was.dist : F.dist };
  if (!was || was.key !== key) { yaw = was ? yaw : F.yaw; pitch = was ? pitch : F.pitch; gvZoom = 1; gvAim.set(0, 0, 0); idleT = 0; fig.glide = 1; }
  if (!gvRaf) { gvLast = performance.now(); gvRaf = requestAnimationFrame(gvTick); }
}
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
    if (fig.key === 'body' && !drag && !fig.glide && idleT > GV.idle) yaw += GV.spin * 0.6 * dt * Math.min(1, (idleT - GV.idle) / 0.8);   // (the whole of you turns slowly)
  } else if (!drag && idleT > GV.idle) yaw += GV.spin * dt * Math.min(1, (idleT - GV.idle) / 0.8);   // (easing back into turning)
  const w = gunView.clientWidth, h = gunView.clientHeight;
  if (w && h) {
    const pr = gvR.getPixelRatio(); if (gunView.width !== Math.round(w * pr) || gunView.height !== Math.round(h * pr)) gvR.setSize(w, h, false);
    gvCam.aspect = w / h;
    const d = camDist(), look = fig ? _gvL.copy(fig.at).add(gvAim) : gvAim;
    gvCam.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d).add(look); gvCam.lookAt(look); gvCam.updateProjectionMatrix(); gvCam.updateMatrixWorld();
    gvR.render(gvScene, gvCam);
  }
  gvRaf = requestAnimationFrame(gvTick);
}
