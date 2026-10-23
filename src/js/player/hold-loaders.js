// Rounds and shells in the hand: the revolver's speed loader, its rounds and the empty one dropped, and shells
// thumbed into a tube or a break-action.

import { scene, V3 } from '../core/renderer.js';
import { clamp, rand, rr } from '../core/math.js';
import { netSend } from '../net/net.js';
import { lam } from '../core/shaders.js';
import { P, PM } from './player.js';
import { roundOn } from '../weapons/rounds.js';
import { W8 } from '../game/run-state.js';
import { GM } from '../weapons/gun-materials.js';
import { cyl, ring } from '../weapons/gun-parts.js';
import { REV_CYL } from '../weapons/gun-models.js';

// the revolver's speed loader, off a photo of one: a squat black polymer body with fine turned grooves round it, its
// face drilled with six deep holes the rounds sit in (cases inside, noses out) round a stem with a bright release
// button, and a neck behind it to a knurled steel knob, the one you twist to let the rounds go. Its axis is z, the face
// forward; rnd takes the rounds (left out on an empty one). SL_FACE: where the face is, so with the fist SL_HAND behind
// the loader's middle the rounds go into the cylinder as the hand reaches it (player/hold.js: the hand's path)
export const SL_FACE = 0.03, SL_HAND = 0.07;
function speedLoader(g, rnd) {
  const R = REV_CYL.r * 0.97, C = REV_CYL.ch, f = SL_FACE, bl = 0.026;
  cyl(g, R, bl, GM.poly, 0, 0, f - bl / 2, 28);
  for (let k = 0; k < 6; k++) cyl(g, R * 1.006, 0.0008, GM.rubber, 0, 0, f - 0.004 - k * 0.0036, 28);   // the fine grooves
  cyl(g, R * 0.9, 0.0012, GM.metal, 0, 0, f + 0.0001, 28);                                             // the face, a shade lighter
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; cyl(g, 0.0064, 0.0012, GM.rubber, Math.cos(a) * C, Math.sin(a) * C, f + 0.0006, 14); }   // the holes
  cyl(g, 0.0042, 0.004, GM.steelDk, 0, 0, f + 0.002, 12); cyl(g, 0.0032, 0.0016, GM.stainless, 0, 0, f + 0.0046, 12);   // the stem and its button
  cyl(g, 0.0072, 0.01, GM.poly, 0, 0, f - bl - 0.005, 16);                                              // the neck
  const kz = f - bl - 0.019; cyl(g, 0.0104, 0.018, GM.stainless, 0, 0, kz, 20);                         // the knob
  for (let k = 0; k < 6; k++) ring(g, 0.0107, 0.0011, GM.stainlessD, 0, 0, kz - 0.0075 + k * 0.003);      // knurled
  cyl(g, 0.0092, 0.0012, GM.stainlessD, 0, 0, kz - 0.0094, 16);
  if (rnd) for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, x = Math.cos(a) * C, y = Math.sin(a) * C;
    cyl(rnd, 0.0052, 0.012, GM.brass, x, y, f + 0.002, 10);                                              // the case, mostly down in its hole
    cyl(rnd, 0.0047, 0.006, GM.copper, x, y, f + 0.011, 10); cyl(rnd, 0.0032, 0.003, GM.copper, x, y, f + 0.0155, 10);   // the bullet, its nose rounded off
  }
}
// in the left hand (weapons/reload.js has the marks): fetched from the pouch, pushed into the open cylinder, twisted to
// let go of the rounds and dropped. It lives in upper-body space beside the gun, so it follows the hand exactly
export const SLM = new THREE.Group(), SL_RND = new THREE.Group();
speedLoader(SLM, SL_RND); SLM.add(SL_RND); SLM.visible = false; SLM.userData.slot = 'loader'; PM.upper.add(SLM);   // (slot: kept out of your clothes' blood, effects/body-blood.js)
export const _slAx = new V3(), _slQ = new THREE.Quaternion(), _slW = new V3(), _slS = new V3();
// the rounds in the revolver's chambers (the case heads, weapons/gun-models.js): the ones loaded at the top of the
// count, the ones fired below them till they're dumped (W8.hudSpent, which drops as each case leaves: weapons/casings.js
// dumps them from these same chambers), the rest empty, so a reload only empties the chambers that were fired and the
// new rounds fill those
export const CHAMBERS = 6, BRASS_FIRED = lam(0x6f5a30), NICKEL = lam(0xc4c8cc), NICKEL_FIRED = lam(0x7c8084);   // (hollow points' cases are nickel, weapons/casings.js)
export const cylLive = id => Math.min(CHAMBERS, W8.mag[id] | 0), cylFired = id => Math.min(CHAMBERS - cylLive(id), W8.hudSpent[id] | 0);
export function cylHeads(cr, id) {
  const live = cylLive(id), fired = cylFired(id), nk = roundOn(id) === 'hollow';
  for (const c of cr) {
    const hd = c.children[0] && c.children[0].userData.heads; if (!hd) continue;
    hd.forEach((h, k) => { const st = k >= CHAMBERS - live ? 1 : k >= CHAMBERS - live - fired ? 2 : 0; h.visible = st > 0; if (st) { h.userData.rim.material = st === 2 ? (nk ? NICKEL_FIRED : BRASS_FIRED) : nk ? NICKEL : GM.brass; h.userData.primer.material = st === 2 ? GM.metal2 : GM.steel; } });
  }
}
// a round in the support hand while it's fed in by hand: up to three shotgun shells (one, both side by side for the
// double barrel's Sleight of Hand, or two or three in a row down the palm for the pump with Quick hands II or III, thumbed up into the
// tube one after another) or a rifle cartridge; carried from the pouch and pushed home along the bore
export const HSH = new THREE.Group(), HSH_S = [0, 1, 2].map(() => { const g = new THREE.Group(); cyl(g, 0.0115, 0.062, GM.shell, 0, 0, 0.002, 12); cyl(g, 0.0123, 0.012, GM.brass, 0, 0, -0.03, 12); HSH.add(g); return g; });
export const HSH_GAP = 0.026, HSH_FEED = [0.28, 0.84];   // shells' spacing in the hand; when a row of them is thumbed in, one push each, one after another (each counted in as its push ends: weapons/reload.js)
// a row's go: where it is in the pushes (0..1 over HSH_FEED), the shell being pushed, and how far through its push
export const rowAt = (rp, n) => { const f = clamp((rp - HSH_FEED[0]) / (HSH_FEED[1] - HSH_FEED[0]), 0, 1), k = Math.min(n - 1, Math.floor(n * f)); return { k, u: n * f - k }; };
// a round loaded on its own: carried to the port till FEED_IN[0], lined up on it by FEED_IN[1] (out of the fingers), and
// thumbed all the way in by FEED_IN[2], where it sits (its rim in the chamber's mouth, its head in the cylinder) till it counts; where it goes in (_feedAt) and the gun's axes there (_feedQ, _feedAx, _feedUp)
export const FEED_IN = [0.64, 0.7, 0.82], _feedAt = new V3(), _feedAx = new V3(), _feedUp = new V3(), _feedQ = new THREE.Quaternion(), _feedV = new V3();
export const HSH_R = new THREE.Group(); cyl(HSH_R, 0.0055, 0.056, GM.brass, 0, 0, 0, 10); cyl(HSH_R, 0.0035, 0.016, GM.copper, 0, 0, 0.034, 10); HSH.add(HSH_R);
HSH.visible = false; HSH.userData.slot = 'loader'; PM.upper.add(HSH);
export const _bq = new THREE.Quaternion();
// the empty loader, let go of: it falls out of the hand just as it was, turning over, bounces and lies there a while
// on its side (the casings' debris, weapons/casings.js). Its own model, the rounds left behind in the cylinder, at the
// size it is in the hand (the loader's inner group, sz, takes the body's scale; the debris shrinks its outer one away)
export const SL_DROPS = [];
for (let k = 0; k < 4; k++) {
  const g = new THREE.Group(), sz = new THREE.Group(); speedLoader(sz); sz.traverse(m => { if (m.isMesh) m.castShadow = true; });
  g.add(sz); g.visible = false; scene.add(g);
  SL_DROPS.push({ g, sz, life: 0, vx: 0, vy: 0, vz: 0, spin: 0, roll: 0, r: 0.03, bounces: 4, kind: 'mag', restY: 0.03, rest: g => g.rotation.set(0, g.rotation.y, 0) });
}
let slIdx = 0;
export function dropLoader() {
  if (!SLM.visible) return;
  SLM.updateWorldMatrix(true, false); SLM.getWorldPosition(_slW); SLM.getWorldQuaternion(_bq); SLM.getWorldScale(_slS); SLM.visible = false;
  const r2 = v => Math.round(v * 1000) / 1000, m = { p: [_slW.x, _slW.y, _slW.z].map(r2), q: [_bq.x, _bq.y, _bq.z, _bq.w].map(r2), s: r2(_slS.x),
    v: [P.vx * 0.6 + rr(-0.4, 0.4), rr(-0.6, 0.2), P.vz * 0.6 + rr(-0.4, 0.4)].map(r2), spin: r2(rr(4, 9) * (rand() < 0.5 ? -1 : 1)), roll: r2(rr(-5, 5)) };
  placeLoader(m); netSend('ld', m);   // (co-op: dropped on your teammates' screens too, net/arsenal.js)
}
// the empty speed loader falling from where it was let go (yours, or a co-op teammate's)
export function placeLoader(m) {
  _slW.set(m.p[0], m.p[1], m.p[2]); _bq.set(m.q[0], m.q[1], m.q[2], m.q[3]);
  const c = SL_DROPS[slIdx = (slIdx + 1) % SL_DROPS.length], s = m.s;
  c.sz.scale.setScalar(s); c.sz.position.set(0, 0, -0.01 * s);   // (turning about its middle, the knob and all)
  c.r = REV_CYL.r * 0.97 * s; c.restY = c.r;
  c.g.position.copy(_slW).addScaledVector(_slAx.set(0, 0, 0.01 * s).applyQuaternion(_bq), 1); c.g.quaternion.copy(_bq); c.g.scale.setScalar(1); c.g.visible = true;
  c.vx = m.v[0]; c.vy = m.v[1]; c.vz = m.v[2]; c.spin = m.spin; c.roll = m.roll; c.bounces = 0; c.life = 14;
}
