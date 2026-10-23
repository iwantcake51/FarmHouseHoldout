// Bandaging: the weapon put away, the bandage wound round the left forearm, the wraps that stay on it, and the
// weapon drawn again after (bandPhases, bandagePose).

import { V3 } from '../core/renderer.js';
import { clamp, mix, smooth } from '../core/math.js';
import { lam } from '../core/shaders.js';
import { box } from '../core/geometry.js';
import { P, PM } from './player.js';
import { W8 } from '../game/run-state.js';
import { equip } from '../weapons/reload.js';
import { BAND_TIME, bandTime } from './bandages.js';
import { ANIM } from './animation.js';
import { _fL, _fR, FIST, reach } from './hold.js';

// bandaging: first the weapon goes away, carried by the right hand to where it rides (bandP, player/swap.js), then the
// hands come up and the right one winds the bandage round the left forearm (bandW, eased into bandK); after, the hands
// come down and the weapon is drawn again, the way it's drawn any time (equip). healFx is how far the blue edge and the camera's lean-in have come: they
// build slowly as the bandage goes on, ease off as it ends, and drop away fast if a hit cuts it short (healCut)
const BAND_PUT = 0.2, BAND_WRAP = 0.16;
export function bandPhases(rdt) {
  const band = P.bandT > 0;
  // another weapon picked during the bandage (switchSlot): the hands come down, the one in hand finishes going away,
  // then the new one is taken out
  if (ANIM.bandSwitch && !band) {
    ANIM.bandW = Math.max(0, (ANIM.bandW || 0) - rdt / BAND_WRAP);
    if (ANIM.bandW <= 0) ANIM.bandP = Math.min(1, (ANIM.bandP || 0) + rdt / BAND_PUT);
    if (ANIM.bandP >= 1) { const s = ANIM.bandSwitch; ANIM.bandSwitch = null; ANIM.bandP = 0; if (W8.slot[s]) { W8.cur = s; W8.reloading = null; W8.burstLeft = 0; W8.swing = 0; equip(s, true); } }
  }
  else if (band) { ANIM.bandP = Math.min(1, (ANIM.bandP || 0) + rdt / BAND_PUT); if (ANIM.bandP >= 1) ANIM.bandW = Math.min(1, (ANIM.bandW || 0) + rdt / BAND_WRAP); }
  else {
    ANIM.bandW = Math.max(0, (ANIM.bandW || 0) - rdt / BAND_WRAP);
    // once the hands are down, the weapon's drawn as it is any time you take it out (equip: its own draw, its sound,
    // the wait before it can fire); one only part put away when the bandage was cut short just comes back to the hand
    if (ANIM.bandW <= 0) { if (ANIM.bandP >= 0.5) { ANIM.bandP = 0; if (W8.slot[W8.cur]) equip(W8.cur, true); } else ANIM.bandP = Math.max(0, (ANIM.bandP || 0) - rdt / BAND_PUT); }
  }
  ANIM.bandK = smooth(ANIM.bandW || 0);
  if (band) ANIM.healCut = false;
  const prog = band ? 1 - P.bandT / (P.bandMax || 1) : 0, fx = band ? 0.2 + 0.8 * smooth(prog) : 0;
  ANIM.healFx = (ANIM.healFx || 0) + (fx - (ANIM.healFx || 0)) * Math.min(1, rdt * (band ? 2.4 : ANIM.healCut ? 11 : 2.6));
}
// the bandages on your left arm, each a wrap round the forearm and up it: the one going on grows round the arm as it's
// wound (from the wrist up), with the loose end running to the right hand; the ones already on stay, a spot of blood
// seeping through each, until the run ends (P.wraps of them)
const WRAP_AT = [[0.34, 0.47], [0.2, 0.31], [0.07, 0.17]], WRAP_M = lam(0xe8e2d4), WRAP_EDGE = lam(0xcfc7b6), WRAP_BLOOD = lam(0x8a1c14);
const wraps = WRAP_AT.map(([z0, z1]) => {
  const g = new THREE.Group(); g.position.z = (z0 + z1) / 2; PM.armL.add(g); g.visible = false; g.userData.fine = true;
  const L = z1 - z0, band = box(g, 0.158, 0.158, L, WRAP_M, 0, 0, 0);
  [-1, 1].forEach(e => box(g, 0.164, 0.164, 0.012, WRAP_EDGE, 0, 0, e * (L / 2 - 0.006)));   // the turned-over edges
  const blood = box(g, 0.05, 0.004, 0.04, WRAP_BLOOD, 0.02, 0.08, 0.005); blood.userData.fine = true;   // on top, where it's seeped through
  g.traverse(o => { o.userData.fine = true; o.castShadow = false; });
  return { g, band, blood, L };
});
const wrapTail = box(PM.upper, 0.03, 0.004, 1, WRAP_M, 0, 0, 0); wrapTail.visible = false; wrapTail.userData.fine = true;
// each wrap goes on over whatever's on the arm there (a sleeve and its cuff, the canvas jacket, gloves, an armband), so
// it's sized to sit just outside the widest of them across its length rather than sinking into a sleeve or having a
// cuff poke through it; refit every few frames while any is showing (gear and clothes change with upgrades and runs)
const _wb = new THREE.Box3(), _wm = new THREE.Matrix4(), WRAP_GAP = 0.007;
let wrapFitT = 0;
function fitWraps() {
  const arm = PM.armL; arm.updateMatrixWorld(true); _wm.copy(arm.matrixWorld).invert();
  const mine = new Set(); wraps.forEach(w => w.g.traverse(o => mine.add(o)));
  // clothes and gear (lit materials), not the outline shells round the arm
  const parts = []; arm.traverse(o => { if (o === arm || !o.isMesh || mine.has(o) || !o.visible || !(o.material && o.material.isMeshLambertMaterial)) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _wb.copy(o.geometry.boundingBox).applyMatrix4(_wm.clone().multiply(o.matrixWorld)); parts.push(_wb.clone()); });
  wraps.forEach((w, i) => {
    const [z0, z1] = WRAP_AT[i]; let half = 0.07;   // the bare arm
    for (const b of parts) if (b.max.z > z0 && b.min.z < z1) half = Math.max(half, -b.min.x, b.max.x, -b.min.y, b.max.y);
    w.half = half + WRAP_GAP; w.g.scale.x = w.g.scale.y = (2 * w.half) / 0.158;
  });
}
const _wc = new V3(), _wa = new V3(), _wu = new V3(), _wv = new V3();
export function bandagePose(pm, up, now, sh) {
  const k = ANIM.bandK || 0, n = Math.min(WRAP_AT.length, P.wraps || 0), band = P.bandT > 0;
  // the wrap going on (the next free one), grown as far as the bandage has gone; any finished ones as they are
  const prog = band ? clamp(1 - P.bandT / (P.bandMax || 1), 0, 1) : 0, cur = band && n < WRAP_AT.length ? n : -1;
  if ((n || k > 0.05) && --wrapFitT <= 0) { wrapFitT = 12; fitWraps(); }
  wraps.forEach((w, i) => {
    w.g.visible = i < n || (i === cur && k > 0.05);
    const f = i === cur ? Math.max(0.04, prog) : 1;
    w.band.scale.z = f; w.band.position.z = -w.L / 2 * (1 - f); w.blood.visible = i < n;
  });
  wrapTail.visible = false;
  let w = k * (sh ? 1 - sh.q : 1); if (w <= 0.001) return;
  // the left forearm comes up in front of you, turned in across the chest; the right hand goes round and round it,
  // working up the arm as it winds on, the head bent to watch
  const a = pm.armL, rx = a.rotation.x, ry = a.rotation.y, rz = a.rotation.z, px = a.position.x, py = a.position.y, pz = a.position.z, sz = a.scale.z;
  reach(a, 'L', _fL.set(0.05, 0.98 + Math.sin(now * 2.1) * 0.01, 0.36), 0.4, true);
  a.rotation.set(rx + (a.rotation.x - rx) * w, ry + (a.rotation.y - ry) * w, rz + (a.rotation.z - rz) * w);
  a.position.set(px + (a.position.x - px) * w, py + (a.position.y - py) * w, pz + (a.position.z - pz) * w); a.scale.z = sz + (a.scale.z - sz) * w;
  a.updateMatrix();
  const cz = band ? mix(WRAP_AT[Math.max(0, cur)][1] - 0.02, WRAP_AT[Math.max(0, cur)][0] + 0.02, prog) : 0.4, wr = 0.45 * bandTime() / BAND_TIME;
  _wc.set(0, 0, cz * a.scale.z).applyMatrix4(a.matrix);                                    // the point being wound, in upper-body space
  _wa.set(0, 0, 1).applyQuaternion(a.quaternion); _wu.set(0, 1, 0).applyQuaternion(a.quaternion); _wv.crossVectors(_wa, _wu);
  const th = (band ? (P.bandMax - P.bandT) : now) / wr * Math.PI * 2, R = Math.max(0.13, ((wraps[Math.max(0, cur)] || {}).half || 0.08) + 0.05);   // the hand goes round outside whatever the arm has on
  _fR.copy(_wc).addScaledVector(_wu, Math.cos(th) * R).addScaledVector(_wv, Math.sin(th) * R);
  const r = pm.armR, qx = r.rotation.x, qy = r.rotation.y, qz = r.rotation.z, qpx = r.position.x, qpy = r.position.y, qpz = r.position.z, qs = r.scale.z;
  reach(r, 'R', _fR, 0, true);
  r.rotation.set(qx + (r.rotation.x - qx) * w, qy + (r.rotation.y - qy) * w, qz + (r.rotation.z - qz) * w);
  r.position.set(qpx + (r.position.x - qpx) * w, qpy + (r.position.y - qpy) * w, qpz + (r.position.z - qpz) * w); r.scale.z = qs + (r.scale.z - qs) * w;
  // the loose end, from the roll in the right hand to where it's going on
  if (cur >= 0 && w > 0.6) {
    r.updateMatrix(); _wv.set(0, 0, FIST * r.scale.z).applyMatrix4(r.matrix); _wa.copy(_wc).addScaledVector(_wu, 0.08);
    wrapTail.visible = true; wrapTail.position.lerpVectors(_wv, _wa, 0.5); wrapTail.scale.z = Math.max(0.01, _wv.distanceTo(_wa)); wrapTail.lookAt(_wv.applyMatrix4(pm.upper.matrixWorld));
  }
  pm.head.rotation.x += 0.42 * w; pm.head.rotation.y = pm.head.rotation.y * (1 - w) + 0.18 * w; up.x += 0.12 * w;
}
