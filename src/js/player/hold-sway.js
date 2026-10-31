// Things hung off a gun that swing with it: a belt-fed gun's belt (beltKick) and the bipod's legs (bipodSway).

import { V3 } from '../core/renderer.js';
import { clamp, rr } from '../core/math.js';
import { SLOTS } from '../weapons/slots.js';
import { W8 } from '../game/run-state.js';
import { BIPOD, flipOf, gunMeshes, X } from '../weapons/gun-materials.js';
import { holdOf } from './hold.js';

// a belt-fed gun's belt jiggles: two soft springs, a slow sway of the whole loop and a quicker ripple along it, shaken
// by how the gun moves and turns (its acceleration and gravity, felt in the gun's own frame, so a cant lets the loop sag
// sideways) and nudged by every shot (beltKick, from weapons/firing.js). Both ends are held, at the feed tray and where it
// comes up out of the box, so the middle of the loop swings the most; what's folded in the box lies still. The gun's
// movement is smoothed before it shakes the belt (BELT_SW.feel: how quickly it follows), and the springs are soft and
// damped near critical, the loop's travel eased off toward its limits (lim, metres) rather than stopped dead at them:
// the raw frame-to-frame jolts (each shot's kick, each step) had it jumping and snapping against hard stops
const BELT_SW = { feel: 14, a: { k: 240, d: 22, push: 0.6, lim: [0.012, 0.012, 0.005] }, b: { k: 900, d: 48, push: 0.35, lim: [0.005, 0.005, 0.002] }, kick: [0.035, 0.025] };
export const BJ = { a: new V3(), va: new V3(), b: new V3(), vb: new V3(), p: new V3(), v: new V3(), acc: new V3(), f: new V3(), q: new THREE.Quaternion(), on: false };
export function beltKick() { const K = BELT_SW.kick; BJ.va.x += rr(-1, 1) * K[0] * 0.5; BJ.va.y += rr(0.5, 1) * K[0]; BJ.vb.x += rr(-1, 1) * K[1]; BJ.vb.y += rr(-1, 1) * K[1]; }
const softLim = (v, m) => m * Math.tanh(v / m);
export function beltJiggle(belt, h, rdt) {
  if (rdt <= 0) return;
  BJ.f.set(X + 0.08, 1.16, 0.535).applyMatrix4((flipOf(h) || h).matrixWorld);   // (on the gun's left: its own frame, weapons/gun-materials.js)
  if (!BJ.on) { BJ.p.copy(BJ.f); BJ.v.set(0, 0, 0); BJ.acc.set(0, 0, 0); BJ.a.set(0, 0, 0); BJ.va.set(0, 0, 0); BJ.b.set(0, 0, 0); BJ.vb.set(0, 0, 0); BJ.on = true; }
  // the loop's own acceleration (from its smoothed velocity, itself smoothed), turned into the gun's frame with gravity
  // added (less the pull it hangs under when level)
  const e = 1 - Math.exp(-rdt * BELT_SW.feel), vx = (BJ.f.x - BJ.p.x) / rdt, vy = (BJ.f.y - BJ.p.y) / rdt, vz = (BJ.f.z - BJ.p.z) / rdt;
  const nvx = BJ.v.x + (vx - BJ.v.x) * e, nvy = BJ.v.y + (vy - BJ.v.y) * e, nvz = BJ.v.z + (vz - BJ.v.z) * e;
  BJ.acc.x += ((nvx - BJ.v.x) / rdt - BJ.acc.x) * e; BJ.acc.y += ((nvy - BJ.v.y) / rdt - BJ.acc.y) * e; BJ.acc.z += ((nvz - BJ.v.z) / rdt - BJ.acc.z) * e;
  BJ.p.copy(BJ.f); BJ.v.set(nvx, nvy, nvz);
  (flipOf(h) || h).getWorldQuaternion(BJ.q).invert(); BJ.f.set(-BJ.acc.x, -9.8 - BJ.acc.y, -BJ.acc.z).applyQuaternion(BJ.q); BJ.f.y += 9.8;
  const A = BELT_SW.a, Bb = BELT_SW.b;
  for (let n = Math.ceil(rdt / (1 / 240)), dt = rdt / n, i = 0; i < n; i++) {
    BJ.va.addScaledVector(BJ.f, A.push * dt).addScaledVector(BJ.a, -A.k * dt).addScaledVector(BJ.va, -A.d * dt); BJ.a.addScaledVector(BJ.va, dt);
    BJ.vb.addScaledVector(BJ.f, Bb.push * dt).addScaledVector(BJ.b, -Bb.k * dt).addScaledVector(BJ.vb, -Bb.d * dt); BJ.b.addScaledVector(BJ.vb, dt);
  }
  // (eased off toward their limits, so the links stay hooked, never stopped dead at them)
  const la = A.lim, lb = Bb.lim, ax = softLim(BJ.a.x, la[0]), ay = softLim(BJ.a.y, la[1]), az = softLim(BJ.a.z, la[2]), bx = softLim(BJ.b.x, lb[0]), by = softLim(BJ.b.y, lb[1]), bz = softLim(BJ.b.z, lb[2]);
  let n = 0; for (const r of belt) if (!r.userData.inBox) n++;
  for (let k = 0; k < belt.length; k++) { const r = belt[k]; if (r.userData.inBox) { r.position.set(0, 0, 0); continue; } const s = (k + 0.5) / n, sa = Math.sin(Math.PI * s), sb = Math.sin(2 * Math.PI * s); r.position.set(ax * sa + bx * sb, ay * sa + by * sb, az * sa + bz * sb); }
}
// a bipod's legs (the LMG's, weapons/gun-models.js) swing on their hinge with the gun, each on a soft spring, through
// everything it does: down on them, they're left behind as you walk, run and turn, as the gun comes up into the sights,
// rocks through a reload, comes out or goes away, and as it rides on your back (the yoke's own acceleration, in the
// gun's frame, swings them: push), splay a little as it's swung sideways (splay), and jump forward with every shot
// (shot, bipodKick); folded along the barrel they only rattle in their clamp (folded of it). How far they can go: max,
// radians. Each set of legs (the gun in your hands, the copy on your back: player/stow.js) keeps its own motion (st)
const BIPOD_SW = { k: 90, d: 4, push: 0.8, splay: 1, shot: 0.9, max: 0.4, folded: 0.12 };
export function bipodKick() { const L = BIPOD[W8.cur]; if (L) L.forEach(l => { l.vx = (l.vx || 0) - BIPOD_SW.shot * rr(0.7, 1.2); l.vz = (l.vz || 0) + BIPOD_SW.shot * 0.35 * rr(-1, 1); }); }
export function bipodSway(legs, h, rdt) {
  if (rdt <= 0) return;
  const st = legs.st || (legs.st = { p: new V3(), v: new V3(), f: new V3(), q: new THREE.Quaternion(), on: false });
  st.f.set(X, 1.1, 1.41).applyMatrix4(h.matrixWorld);   // (the yoke)
  if (!st.on) { st.p.copy(st.f); st.v.set(0, 0, 0); st.on = true; legs.forEach(l => { l.ax = l.az = l.vx = l.vz = 0; }); }
  const vx = (st.f.x - st.p.x) / rdt, vy = (st.f.y - st.p.y) / rdt, vz = (st.f.z - st.p.z) / rdt;
  let ax = (vx - st.v.x) / rdt, ay = (vy - st.v.y) / rdt, az = (vz - st.v.z) / rdt; const am = Math.hypot(ax, ay, az); if (am > 80) { ax *= 80 / am; ay *= 80 / am; az *= 80 / am; }
  st.p.copy(st.f); st.v.set(vx, vy, vz);
  (flipOf(h) || h).getWorldQuaternion(st.q).invert(); st.f.set(-ax, -ay, -az).applyQuaternion(st.q);   // what the legs feel, in the gun's frame
  const S_ = BIPOD_SW;
  legs.forEach(l => {
    const amp = l.down ? 1 : S_.folded;
    for (let n = Math.ceil(rdt / (1 / 240)), dt = rdt / n, i = 0; i < n; i++) {
      l.vx += (-S_.push * st.f.z * amp - S_.k * l.ax - S_.d * l.vx) * dt; l.ax += l.vx * dt;
      l.vz += (S_.push * S_.splay * st.f.x * amp - S_.k * l.az - S_.d * l.vz) * dt; l.az += l.vz * dt;
    }
    const m = S_.max * amp; l.ax = clamp(l.ax, -m, m); l.az = clamp(l.az, -m * 0.5, m * 0.5);
    l.g.rotation.x = l.r0.x + l.ax; l.g.rotation.z = l.r0.z + l.az;
  });
}
// every frame, whatever's in your hands: each gun's bipod swung by its hold (so it carries on as the gun's put away or
// drawn), and left to start afresh from where the gun is next time it's shown after being hidden
export function swayBipods(rdt) {
  for (const s of SLOTS) { const L = BIPOD[s]; if (!L) continue; if (!gunMeshes[s].visible) { if (L.st) L.st.on = false; continue; } bipodSway(L, holdOf(s, 'R'), rdt); }
}
