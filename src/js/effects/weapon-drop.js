// The weapon that slips out of someone's hands as they go down: yours (ui/screens.js: startDeath) and, in co-op, a
// teammate's, played out the same on every screen from the one throw they send ('wdrop': net/sync.js). Only ever for
// the look of it: nobody can pick it up, and it goes when they're back on their feet.
//
// It tumbles as it falls, and the ground stops it by its real size, not its middle: however it's turned, the lowest
// corner of its box sits on the floor (the porch and the floorboards too: surfaceY), so no part of it ever goes
// through. It bounces a little on a hard landing, slides to a stop, and settles flat on its widest side, easing over
// rather than snapping.

import { scene, V3 } from '../core/renderer.js';
import { surfaceY } from '../world/house.js';
import { burst } from './particles.js';
import { SFX } from '../audio/sfx.js';

// gravity (m/s²), how much of the fall a bounce gives back, how hard it slides to a stop, how quickly it settles flat
// once down, the fall it takes to bounce at all, and the fall it takes to clatter
const WDROP = { g: 12, bounce: 0.28, fric: 3.6, settle: 6.5, minBounce: 1.1, loud: 0.6 };
const _wdQ = new THREE.Quaternion(), _wdA = new V3(), _wdM = new THREE.Matrix4(), _wdUp = new V3();
// how far the box reaches below its middle as it's turned (h: its half size in its own frame)
function dropReach(q, h) { const e = _wdM.makeRotationFromQuaternion(q).elements; return Math.abs(e[1]) * h.x + Math.abs(e[5]) * h.y + Math.abs(e[9]) * h.z; }
// lying flat: its thinnest side turned straight up or down, whichever is nearer, by the smallest turn from how it is
function dropRest(q, h) {
  const i = h.x <= h.y && h.x <= h.z ? 0 : h.y <= h.z ? 1 : 2, e = _wdM.makeRotationFromQuaternion(q).elements;
  _wdA.set(e[i * 4], e[i * 4 + 1], e[i * 4 + 2]).normalize(); _wdUp.set(0, Math.sign(_wdA.y) || 1, 0);
  return new THREE.Quaternion().setFromUnitVectors(_wdA, _wdUp).multiply(q);
}
// g: the weapon, about its middle (its box's half size h); v, w: how it's thrown and how it spins (world, rad/s)
export function makeDrop(g, h, v, w, melee) { return { g, h, vx: v[0], vy: v[1], vz: v[2], w: new V3(...w), melee, down: false, rest: null, done: false }; }
export function stepDrop(d, dt) {
  if (!d || d.done || !(dt > 0)) return;
  const g = d.g, p = g.position;
  d.vy -= WDROP.g * dt; p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
  if (!d.down) { const a = d.w.length() * dt; if (a) { _wdQ.setFromAxisAngle(_wdA.copy(d.w).normalize(), a); g.quaternion.premultiply(_wdQ); } }
  const ground = surfaceY(p.x, p.z);
  if (p.y <= ground + dropReach(g.quaternion, d.h)) {
    p.y = ground + dropReach(g.quaternion, d.h);
    if (!d.down && -d.vy > WDROP.loud) { if (d.melee) SFX.thud(); else SFX.gunDrop(); burst(p.x, ground + 0.05, p.z, 3, 'dust'); }
    if (-d.vy > WDROP.minBounce) { d.vy = -d.vy * WDROP.bounce; d.w.multiplyScalar(0.45); } else d.vy = 0;
    d.down = true;
  }
  if (!d.down) return;
  // down: slide to a stop and ease over onto its side, never into the floor as it turns
  if (!d.rest) d.rest = dropRest(g.quaternion, d.h);
  g.quaternion.slerp(d.rest, 1 - Math.exp(-WDROP.settle * dt));
  const f = Math.exp(-WDROP.fric * dt); d.vx *= f; d.vz *= f;
  const fl = ground + dropReach(g.quaternion, d.h); if (p.y < fl) { p.y = fl; if (d.vy < 0) d.vy = 0; }
  if (d.vy === 0 && p.y <= fl + 1e-3 && g.quaternion.angleTo(d.rest) < 0.004 && Math.hypot(d.vx, d.vz) < 0.01) { g.quaternion.copy(d.rest); p.y = ground + dropReach(d.rest, d.h); d.done = true; }
}
// a weapon's model, centred on its box, as a group to drop: src is the model as it's held (its world place taken
// from it), the copy goes into the scene where it was. Its half size and the group back
export function dropCopy(src) {
  src.updateMatrixWorld(true);
  const inv = src.matrixWorld.clone().invert(), bb = new THREE.Box3(), tb = new THREE.Box3(), rel = new THREE.Matrix4();
  src.traverse(o => { if (!o.isMesh || !o.visible) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); rel.multiplyMatrices(inv, o.matrixWorld); bb.union(tb.copy(o.geometry.boundingBox).applyMatrix4(rel)); });
  const ctr = bb.isEmpty() ? new V3() : bb.getCenter(new V3()), size = bb.isEmpty() ? new V3(0.1, 0.1, 0.1) : bb.getSize(new V3());
  const inner = src.clone(true), c = new THREE.Group();
  inner.position.copy(ctr).negate(); inner.rotation.set(0, 0, 0); inner.scale.set(1, 1, 1); inner.visible = true; c.add(inner);
  const wq = new THREE.Quaternion(), ws = new V3(); src.matrixWorld.decompose(new V3(), wq, ws);
  c.position.copy(ctr).applyMatrix4(src.matrixWorld); c.quaternion.copy(wq); c.scale.copy(ws); scene.add(c);
  return { g: c, h: size.multiply(ws).multiplyScalar(0.5) };
}
