// A weapon turning slowly in the cheat menu (ui/cheats.js): built just as it's built for your hands (buildWeapon), with
// everything on it that shows (its mods, tiers, attachments, the rounds and the mag in it), on a small renderer of its
// own on a canvas in the panel, under a studio light rather than the farm's. Drag it round, drag with the right button
// (or Shift held) to move it about, scroll to zoom, double-click to set it all back; let go and it carries on turning.
import { V3 } from '../core/renderer.js';
import { clamp } from '../core/math.js';
import { binModel } from '../core/geometry.js';
import { WEAP } from '../weapons/gun-stats.js';
import { modLv } from '../weapons/mod-levels.js';
import { setTierCtx, W, W8 } from '../game/run-state.js';
import { buildWeapon, weaponRec } from '../weapons/build-weapons.js';

// how it turns (radians a second) and how far it tips, how close the camera comes and how far it'll zoom either way,
// and how long it waits after you let go before it turns on its own again (s)
const GV = { spin: 0.42, pitch: [-0.7, 0.9], fov: 26, fill: 1.15, zoom: [0.55, 1.8], idle: 1.6 };
let gvR = null, gvScene = null, gvCam = null, gvPivot = null, gvModel = null, gvSig = '', gvRaf = 0, gvLast = 0;
let yaw = 1.1, pitch = 0.16, gvZoom = 1, idleT = 9, drag = null, gvLen = 0.5, gvH = 0.2;
// where the camera looks: the gun's middle, or wherever it's been moved to (panned), and how far that may wander (of
// the gun's length)
const gvAim = new V3(), GV_PAN = 0.75, _gvR = new V3(), _gvU = new V3();
export const gunView = document.createElement('canvas');
gunView.className = 'chView'; gunView.setAttribute('aria-label', 'The weapon, turning: drag to look round it, scroll to gvZoom');

// the model's own colours without the farm's light map (core/shaders.js: lit), so it looks the same by day or night
const plainOf = new Map();
function plain(m) {
  if (Array.isArray(m)) return m.map(plain);
  let p = plainOf.get(m); if (p) return p;
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
      const k = 2 * gvDist() * Math.tan(GV.fov * Math.PI / 360) / Math.max(1, gunView.clientHeight);
      gvCam.matrixWorld.extractBasis(_gvR, _gvU, new V3());
      gvAim.copy(drag.aim).addScaledVector(_gvR, -dx * k).addScaledVector(_gvU, dy * k).clampLength(0, gvLen * GV_PAN);
    } else { yaw = drag.yaw + dx * 0.011; pitch = clamp(drag.pitch + dy * 0.008, GV.pitch[0], GV.pitch[1]); }
  });
  gunView.addEventListener('contextmenu', e => e.preventDefault());
  const up = () => { drag = null; idleT = 0; }; gunView.addEventListener('pointerup', up); gunView.addEventListener('pointercancel', up);
  gunView.addEventListener('wheel', e => { e.preventDefault(); gvZoom = clamp(gvZoom * (e.deltaY > 0 ? 1.1 : 0.9), GV.zoom[0], GV.zoom[1]); }, { passive: false });
  gunView.addEventListener('dblclick', () => { yaw = 1.1; pitch = 0.16; gvZoom = 1; gvAim.set(0, 0, 0); idleT = 9; });
}
// what the model is built from, to rebuild it only when something on it changes
const sigOf = id => JSON.stringify([id, (W8.mods[id] || []).map(m => [m, modLv(m)]), W8.gt[id], W8.att && W8.att[id], W8.tune && W8.tune[id], W8.rounds && W8.rounds[id], W8.own && W8.own[id]]);
// show weapon id (rebuilt if it's changed since)
export function showGun(id) {
  if (!WEAP[id]) return;
  if (!gvR) setup();
  const sig = sigOf(id); if (sig === gvSig && gvModel) return; gvSig = sig;
  if (gvModel) binModel(gvModel);
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
// let it go (the menu shut, or another section open): it stops drawing
export function hideGun() { if (gvRaf) cancelAnimationFrame(gvRaf); gvRaf = 0; }
function gvTick(t) {
  gvRaf = 0;
  if (!gunView.isConnected || !gvR) return;
  const dt = Math.min(0.05, (t - gvLast) / 1000); gvLast = t;
  idleT += dt; if (!drag && idleT > GV.idle) yaw += GV.spin * dt * Math.min(1, (idleT - GV.idle) / 0.8);   // (easing back into turning)
  const w = gunView.clientWidth, h = gunView.clientHeight;
  if (w && h) {
    const pr = gvR.getPixelRatio(); if (gunView.width !== Math.round(w * pr) || gunView.height !== Math.round(h * pr)) gvR.setSize(w, h, false);
    gvCam.aspect = w / h;
    const d = gvDist();
    gvCam.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d).add(gvAim); gvCam.lookAt(gvAim); gvCam.updateProjectionMatrix(); gvCam.updateMatrixWorld();
    gvR.render(gvScene, gvCam);
  }
  gvRaf = requestAnimationFrame(gvTick);
}
