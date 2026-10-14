// Holding weapons: where each hand goes on each gun, the gun's own pose (aim, recoil, reloads, cycling, akimbo),
// and arms that reach for their targets, so the hands stay on the gun whatever it is doing.
//
// The order every frame: pose the gun (the slot group, then one hold group per hand), work out where each fist
// should be (on the gun, or off doing something: fetching a mag, feeding shells, working the bolt, bandaging),
// then point each arm from its shoulder at its fist target. Only the hand that is doing something moves.

// shoulders roll a little forward and in when you shoulder a gun; the fist grips about its front third
const SHOULDER = { L: [-0.31, 1.08, 0.05], R: [0.31, 1.08, 0.05] }, SHOULDER_REST = { L: [-0.33, 1.08, 0], R: [0.33, 1.08, 0] }, FIST = 0.5, Y_AX = new V3(0, 1, 0);
// gun-local points (the model's own coordinates): grip is the firing hand, fore the support hand (on long guns the back of
// the handguard, where you'd really hold it). blade turns the torso side-on (the gun stays on the aim) and pull brings the
// gun back into the shoulder; both are solved so the arms reach without stretching much
const HOLD = {
  pistol: { grip: [X, 1.04, 0.565], fore: [X - 0.045, 0.99, 0.6], blade: 0.12, pull: 0.1, kind: 'hand', slideAt: [X, 1.172, 0.565], stopAt: [X + 0.03, 1.13, 0.662] },
  deagle: { grip: [X, 1.04, 0.56], fore: [X - 0.05, 0.985, 0.6], blade: 0.12, pull: 0.09, kind: 'hand', slideAt: [X, 1.2, 0.585], stopAt: [X + 0.032, 1.122, 0.628] },
  revolver: { grip: [X, 1.03, 0.5], fore: [X - 0.045, 0.985, 0.54], blade: 0.12, pull: 0.04, kind: 'hand' },
  smg: { grip: [X, 1.0, 0.628], fore: [X, 0.99, 0.836], blade: 0.5, pull: 0.25, kind: 'long' },
  pump: { grip: [X, 1.082, 0.445], fore: [X, 1.104, 0.915], blade: 0.58, pull: 0.16, kind: 'long', foreOnSlide: true, port: [X, 1.095, 0.66] },
  dbl: { grip: [X, 1.07, 0.5], fore: [X, 1.094, 0.84], blade: 0.48, pull: 0.12, kind: 'long', port: [X, 1.14, 0.612] },
  auto12: { grip: [X, 0.975, 0.5], fore: [X, 1.075, 0.98], blade: 0.58, pull: 0.21, kind: 'long' },
  hunting: { grip: [X, 1.055, 0.49], fore: [X, 1.085, 0.82], blade: 0.46, pull: 0.15, kind: 'long', port: [X, 1.165, 0.7] },
  sub: { grip: [X, 0.975, 0.548], fore: [X, 1.095, 0.92], blade: 0.58, pull: 0.21, kind: 'long' },
  ar: { grip: [X, 0.965, 0.47], fore: [X, 1.072, 0.95], blade: 0.58, pull: 0.2, kind: 'long' },
  lmg: { grip: [X, 0.99, 0.48], fore: [X, 1.055, 0.9], blade: 0.58, pull: 0.17, kind: 'long' }
};
const HOLD_DEF = { grip: [X, 1.04, 0.56], fore: [X - 0.045, 0.99, 0.6], blade: 0.12, pull: 0.1, kind: 'hand' };
// the arms are thick blocks aimed at those points, so a fist centred on the gun hides it from the camera above: the
// hands are aimed this far below them (metres, down the gun), the fist's top against the gun's underside, and the
// trigger hand out to its own side (out), so it takes the grip from the side and below rather than lying over the
// receiver. A long gun lies on the support hand and sits clear over the trigger hand; a handgun's grip is already
// below its slide, so its hands only drop a little
const HAND_DROP = { long: { grip: 0.06, out: 0.035, fore: 0.07 }, hand: { grip: 0.02, out: 0.015, fore: 0.015 } };
// and the rest of keeping the gun in view: the arms a little slimmer than the body's blocks, a long gun carried a touch
// higher (LONG_RAISE) so the arms come up to it from below rather than level with it, and the wrists turned (HAND_ROLL):
// the support hand's palm up under the fore-end, the trigger hand's knuckles out round the grip
const ARM_THIN = 0.84, LONG_RAISE = 0.045, HAND_ROLL = { long: { R: -0.17, L: 0.24 }, hand: { R: -0.07, L: 0.13 } };
// each reload is done one of three ways, picked at random (weapons/reload.js), with the same timing: how far the gun
// is rolled over, pitched down, turned, lifted and drawn in for it. A mag change: rolled to show the well, held flatter
// and nosed down, or rolled hard and turned; feeding shells: tipped to show the port, flatter, or rolled further
const REL_MAG = [{ r: 0.5, p: 0.12, y: 0.12, oy: 0.04, oz: 0.08 }, { r: 0.32, p: 0.2, y: 0.04, oy: 0.02, oz: 0.1 }, { r: 0.68, p: 0.08, y: 0.18, oy: 0.05, oz: 0.06 }];
const REL_SHELL = [{ r: 0.45, p: 0.08, oy: 0.03, oz: 0.04 }, { r: 0.32, p: 0.14, oy: 0.02, oz: 0.06 }, { r: 0.58, p: 0.05, oy: 0.04, oz: 0.03 }];
const _rv = new V3();
// akimbo: each pistol out in its own hand, close enough in that both arms sit straight. Each is reloaded on its own
// turn (akU in weapons/akimbo.js says how far through it is), the other kept up on the aim
const AK_PULL = 0.1;
// shotguns at rest sit at low ready: the stock in the shoulder pocket and the muzzle down (p), a little lower and
// further in (y, z), canted (r) and turned across the body (yaw). They come up to the shoulder the moment you fire,
// aim or hold the trigger, and settle back down MOUNT_HOLD seconds after the last shot (ANIM.mount). The double barrel
// rests lowest and most canted, hunter style
const LOW_READY = { pump: { p: 0.3, y: -0.035, z: -0.05, r: 0.06, yaw: -0.05 }, auto12: { p: 0.24, y: -0.03, z: -0.04, r: 0.05, yaw: -0.04 }, dbl: { p: 0.44, y: -0.07, z: -0.07, r: 0.17, yaw: -0.12 } }, MOUNT_HOLD = 1.5;
const REL_JIT0 = { k: 1, dx: 0, dy: 0, seed: 0 };
// and no one holds two guns the same: the right a touch higher and further out, the left lower, drawn back and in, each
// canted over toward the middle (the left more, a little gangster) and toed in, and each drifting on its own (f: how
// quickly). cant and toe in radians, the rest in metres
const AK_HAND = {
  R: { cant: 0.2, toe: 0.03, p: -0.012, up: 0.012, fwd: 0.018, in: 0, f: 1.3 },
  L: { cant: 0.3, toe: 0.05, p: 0.035, up: -0.022, fwd: -0.03, in: 0.012, f: 1.75 }
};
// Run and gun with a pair: the left hand's needed for the vault, so its gun goes away for it (into its holster, or onto
// your back) and is drawn again after: over AK_DRAW seconds the hand goes down to it, pulls it at AK_GRAB of the way and
// brings it up to the aim. AK_DRAW_AT is where it's drawn from (the hip for a pistol, over the shoulder for one off the
// back): the gun's pitch there, and how far down, back and out
const AK_DRAW = 0.55, AK_GRAB = 0.4, AK_DRAW_AT = { side: { p: 1.3, y: -0.42, z: -0.3, x: 0.07 }, auto: { p: -1.1, y: 0.1, z: -0.48, x: 0.02 } };
// free aim: the arms don't turn in lockstep with the body. As you turn, the arms and the gun lag behind (a heavy gun
// more), swinging round from the shoulders, then swing on past and settle; looking up or down the same. A loose spring
// per axis; FREE_SWING is how far out from the shoulders the swing reaches, so the hands carry with it
const FREE_AIM = { yaw: 0, vy: 0, pitch: 0, vp: 0, last: null, lastP: 0 }, FREE_SWING = 0.26;
function freeAim(rdt, heavy, ads) {
  const F = FREE_AIM; if (!(rdt > 0)) return F;
  const yw = ANIM.chestYaw ?? ANIM.yaw;   // the chest's turning (player/animation.js), not the hips'
  if (F.last === null) { F.last = yw; F.lastP = ANIM.pitch || 0; }
  const turn = clamp(angDiff(yw, F.last) / rdt, -14, 14), tilt = clamp(((ANIM.pitch || 0) - F.lastP) / rdt, -6, 6);
  F.last = yw; F.lastP = ANIM.pitch || 0;
  const lag = (heavy ? 0.06 : 0.045) * (1 - 0.5 * ads), ty = clamp(-turn * lag, -0.2, 0.2), tp = clamp(-tilt * lag * 0.6, -0.12, 0.12);
  for (let n = Math.ceil(rdt / (1 / 120)), h = rdt / Math.max(1, n), i = 0; i < n; i++) {
    F.vy += ((ty - F.yaw) * 75 - F.vy * 9.5) * h; F.yaw += F.vy * h;
    F.vp += ((tp - F.pitch) * 75 - F.vp * 9.5) * h; F.pitch += F.vp * h;
  }
  return F;
}
// how far the hunting rifle's bolt handle turns up to unlock (radians)
const BOLT_TURN = 1.05;
// the gun riding a rack: a loose spring per axis (muzzle pitch, roll, yaw, back into the shoulder, down, and the
// torso's twist) chasing where working the action pulls it, knocked again at each stop (rackKick, from
// weapons/casings.js), so it lags behind the hand, overshoots and settles instead of moving in lockstep with the action
const RACK = { p: 0, vp: 0, r: 0, vr: 0, y: 0, vy: 0, z: 0, vz: 0, h: 0, vh: 0, w: 0, vw: 0 }, RACK_K = 130, RACK_D = 10;
function rackKick(p, r, z) { RACK.vp += p; RACK.vr += r * rr(0.85, 1.15); RACK.vz += z; }
function stepRack(rdt, t) {
  for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++)
    for (const a of ['p', 'r', 'y', 'z', 'h', 'w']) springTo(RACK, a, 'v' + a, t[a], a === 'z' ? RACK_K * 1.3 : a === 'w' ? RACK_K * 0.6 : RACK_K, RACK_D, dt);
}
const _rackT = { p: 0, r: 0, y: 0, z: 0, h: 0, w: 0 };
// each gun's recoil, a spring per hand: muzzle flip (p, up is negative), drive back (z), lift (h), roll (r) and a kick
// to the side (y). A shot throws the gun up and back; a beat later the hands haul it back down (drop), so a strong gun
// dips past where it was aimed before it settles home smoothly. No two shots are quite alike: how hard each way, which
// way it rolls and kicks, when and how hard it's hauled down. Pistols flip, long guns shove back into the shoulder; a
// light gun or one on full auto just flips and settles. A handgun's kick goes with less than its power (pw^0.6), so even
// a 9mm snaps the wrists up a few degrees and drives back, and the hand cannons don't fly out of the hands
const kickState = () => ({ p: 0, vp: 0, z: 0, vz: 0, h: 0, vh: 0, r: 0, vr: 0, y: 0, vy: 0, dropT: 0, dP: 0, dH: 0, dZ: 0 });
const RK = { R: kickState(), L: kickState() };
function gunKick(side, pw, kind, auto) {
  const k = RK[side], hand = kind === 'hand', big = smooth(clamp((pw - 0.25) / 0.75, 0, 1)), a = 1 - 0.3 * (ANIM.ads || 0), hp = Math.pow(pw, 0.6);
  const flip = (hand ? 13.5 * hp : pw * 7.5 * (1 + 0.4 * big)) * a;
  k.vp -= flip * rr(0.85, 1.2); k.vz -= (hand ? 2.2 * hp : pw * 3) * a * rr(0.85, 1.2); k.vh += (hand ? 0.9 * hp * (0.4 + 0.6 * big) : pw * 0.8 * big) * a * rr(0.8, 1.2);
  k.vr += (rand() < 0.5 ? -1 : 1) * (hand ? 2.4 * hp : pw * 1.6) * rr(0.7, 1.2); k.vy += rr(-1, 1) * (hand ? 1.3 * hp : pw * 0.8);
  if (big > 0.05 && !auto) { const d = big * rr(0.8, 1.05); k.dropT = rr(0.07, 0.1); k.dP = flip * d; k.dH = -pw * 0.9 * d; k.dZ = pw * 0.8 * d; }
}
function stepKick(k, dt) {
  for (let n = Math.ceil(dt / (1 / 240)), h = dt / Math.max(1, n), i = 0; i < n; i++) {
    if (k.dropT > 0 && (k.dropT -= h) <= 0) { k.vp += k.dP; k.vh += k.dH; k.vz += k.dZ; }   // hauled back down, just past the peak
    k.vp += (-380 * k.p - 26 * k.vp) * h; k.p = clamp(k.p + k.vp * h, -0.7, 0.25);
    k.vz += (-380 * k.z - 26 * k.vz) * h; k.z += k.vz * h;
    k.vh += (-340 * k.h - 25 * k.vh) * h; k.h += k.vh * h;
    k.vr += (-300 * k.r - 22 * k.vr) * h; k.r += k.vr * h;
    k.vy += (-320 * k.y - 24 * k.vy) * h; k.y += k.vy * h;
  }
}
const POUCH = new V3(-0.21, 0.8, 0.16);   // the left hip pouch, in upper-body space: mags and shells come from here
// a hand that leaves the gun blends out to a free target and back; w is how far off the gun it is
const HAND = { L: { w: 0, free: new V3(-0.2, 0.8, 0.2) }, R: { w: 0, free: new V3(0.2, 0.8, 0.2) } };
const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new V3();
const _hL = new V3(), _hR = new V3(), _fL = new V3(), _fR = new V3(), _p1 = new V3(), _p2 = new V3(), _p3 = new V3(), _p4 = new V3(), _p5 = new V3(), _p6 = new V3();

// pose a group: rotate by (rx, ry, rz) about the point p (in its own coordinates), shift by o, then turn the lot by yaw0
function posePivot(g, rx, ry, rz, px, py, pz, ox, oy, oz, yaw0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _v.set(px, py, pz).applyQuaternion(_q);
  g.position.set(px - _v.x + ox, py - _v.y + oy, pz - _v.z + oz); g.quaternion.copy(_q);
  if (yaw0) { _qy.setFromAxisAngle(Y_AX, yaw0); g.position.applyQuaternion(_qy); g.quaternion.premultiply(_qy); }
  g.updateMatrix();
}
// the arm angles that put the fist on t (upper-body space); arms are straight blocks, so they stretch a touch when they must
function armAim(side, t, rest) {
  const s = (rest ? SHOULDER_REST : SHOULDER)[side], dx = t.x - s[0], dy = t.y - s[1], dz = t.z - s[2], len = Math.hypot(dx, dy, dz) || 1;
  return [Math.atan2(-dy / len, dz / len), Math.asin(clamp(dx / len, -1, 1)), clamp(len / FIST, 0.8, 1.3)];
}
function reach(arm, side, t, roll, rest) {
  const [rx, ry, sc] = armAim(side, t, rest), s = (rest ? SHOULDER_REST : SHOULDER)[side];
  arm.position.set(s[0], s[1], s[2]); arm.rotation.set(rx, ry, roll || 0); arm.scale.set(ARM_THIN, ARM_THIN, sc);
}
function armRest(arm, side, rx, ry) { const s = SHOULDER_REST[side]; arm.position.set(s[0], s[1], s[2]); arm.rotation.set(rx, ry, 0); arm.scale.set(ARM_THIN, ARM_THIN, 1); }
// a point on the gun (hold-local) in upper-body space
const holdOf = (s, side) => (HOLDS[s] && (HOLDS[s][side] || HOLDS[s].R)) || gunMeshes[s];
function gunPt(out, s, side, x, y, z) { return out.set(x, y, z).applyMatrix4(holdOf(s, side).matrix).applyMatrix4(gunMeshes[s].matrix); }
// a walk along [time, point] keys that flows through them: it passes each key at its time, but keeps moving through
// the ones on the way (a curve through its neighbours, so the hand swings round instead of stopping at every point)
// and only comes to rest where it's meant to wait (a key repeated) or at the ends
const _wpA = new V3(), _wpB = new V3();
function walkPath(out, keys, p) {
  let k = 0; while (k < keys.length - 2 && keys[k + 1][0] <= p) k++;
  const a = keys[k], b = keys[k + 1], dt = (b[0] - a[0]) || 1, u = clamp((p - a[0]) / dt, 0, 1);
  // the hand's speed through a key: along the line from the key before to the key after, none at a wait or an end
  const vel = (i, o) => {
    const prev = keys[i - 1], next = keys[i + 1], here = keys[i][1];
    if (!prev || !next || prev[1].distanceToSquared(here) < 1e-8 || next[1].distanceToSquared(here) < 1e-8) return o.set(0, 0, 0);
    return o.subVectors(next[1], prev[1]).multiplyScalar(1 / ((next[0] - prev[0]) || 1));
  };
  vel(k, _wpA); vel(k + 1, _wpB);
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return out.copy(a[1]).multiplyScalar(h00).addScaledVector(_wpA, h10 * dt).addScaledVector(b[1], h01).addScaledVector(_wpB, h11 * dt);
}
// a belt-fed gun's belt jiggles: two loose springs, a slow sway of the whole loop and a quicker ripple along it, shaken
// by how the gun moves and turns (its acceleration and gravity, felt in the gun's own frame, so a cant lets the loop sag
// sideways) and kicked by every shot (beltKick, from weapons/firing.js). Both ends are held, at the feed tray and in the
// box, so the middle of the loop swings the most
const BJ = { a: new V3(), va: new V3(), b: new V3(), vb: new V3(), p: new V3(), v: new V3(), f: new V3(), q: new THREE.Quaternion(), on: false };
function beltKick() { BJ.va.x += rr(-0.1, 0.1); BJ.va.y += rr(0.08, 0.2); BJ.vb.x += rr(-0.08, 0.08); BJ.vb.y += rr(-0.1, 0.1); }
function beltJiggle(belt, h, rdt) {
  if (rdt <= 0) return;
  BJ.f.set(X + 0.08, 1.16, 0.535).applyMatrix4(h.matrixWorld);
  if (!BJ.on) { BJ.p.copy(BJ.f); BJ.v.set(0, 0, 0); BJ.a.set(0, 0, 0); BJ.va.set(0, 0, 0); BJ.b.set(0, 0, 0); BJ.vb.set(0, 0, 0); BJ.on = true; }
  // the loop's own acceleration, turned into the gun's frame with gravity added (less the pull it hangs under when level)
  const vx = (BJ.f.x - BJ.p.x) / rdt, vy = (BJ.f.y - BJ.p.y) / rdt, vz = (BJ.f.z - BJ.p.z) / rdt;
  let ax = (vx - BJ.v.x) / rdt, ay = (vy - BJ.v.y) / rdt, az = (vz - BJ.v.z) / rdt; const am = Math.hypot(ax, ay, az); if (am > 60) { ax *= 60 / am; ay *= 60 / am; az *= 60 / am; }
  BJ.p.copy(BJ.f); BJ.v.set(vx, vy, vz);
  h.getWorldQuaternion(BJ.q).invert(); BJ.f.set(-ax, -9.8 - ay, -az).applyQuaternion(BJ.q); BJ.f.y += 9.8;
  for (let n = Math.ceil(rdt / (1 / 240)), dt = rdt / n, i = 0; i < n; i++) {
    BJ.va.addScaledVector(BJ.f, 0.7 * dt).addScaledVector(BJ.a, -1900 * dt).addScaledVector(BJ.va, -10 * dt); BJ.a.addScaledVector(BJ.va, dt);
    BJ.vb.addScaledVector(BJ.f, 0.5 * dt).addScaledVector(BJ.b, -5600 * dt).addScaledVector(BJ.vb, -22 * dt); BJ.b.addScaledVector(BJ.vb, dt);
  }
  BJ.a.set(clamp(BJ.a.x, -0.01, 0.01), clamp(BJ.a.y, -0.01, 0.01), clamp(BJ.a.z, -0.004, 0.004)); BJ.b.set(clamp(BJ.b.x, -0.004, 0.004), clamp(BJ.b.y, -0.004, 0.004), clamp(BJ.b.z, -0.002, 0.002));   // the ripple stays small, so the links stay hooked
  const n = belt.length; belt.forEach((r, k) => { const s = (k + 0.5) / n; r.position.copy(BJ.a).multiplyScalar(Math.sin(Math.PI * s)).addScaledVector(BJ.b, Math.sin(2 * Math.PI * s)); });
}
// blend a hand between its spot on the gun and a free target; wt is how far off the gun it should be
// (on a critically damped spring, so it eases off the gun and back onto it instead of leaving at full speed)
function handTarget(out, side, onGun, free, wt, rdt) {
  const h = HAND[side];
  // the free hand follows its path on a loose spring: a beat behind it, settling with a little give when it stops
  if (free) {
    if (!h.fv || h.w < 0.01) { h.fv = h.fv || new V3(); h.free.copy(free); h.fv.set(0, 0, 0); }
    else if (rdt > 0) for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / n, i = 0; i < n; i++) {
      h.fv.x += (480 * (free.x - h.free.x) - 30 * h.fv.x) * dt; h.fv.y += (480 * (free.y - h.free.y) - 30 * h.fv.y) * dt; h.fv.z += (480 * (free.z - h.free.z) - 30 * h.fv.z) * dt;
      h.free.addScaledVector(h.fv, dt);
    }
  }
  if (rdt > 0) for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / n, i = 0; i < n; i++) { h.vw = (h.vw || 0) + (-420 * (h.w - wt) - 41 * (h.vw || 0)) * dt; h.w = clamp(h.w + h.vw * dt, 0, 1); }
  if (Math.abs(wt - h.w) < 0.002 && Math.abs(h.vw || 0) < 0.02) { h.w = wt; h.vw = 0; }
  return out.copy(onGun).lerp(h.free, h.w);
}

// the shove's shape, shared by guns and melee: q how far into it, push how far the hands drive out, lean and twist of the torso
function shovePose() {
  const sv = P.shove;
  if (!sv) return null;
  const p = clamp(sv.t / sv.dur, 0, 1), WP = [-0.1, -0.2, 0.28], SP = [0.26, 0.46, -0.14];
  let pose, q;
  if (p < 0.2) { const w = smooth(p / 0.2); pose = WP.map(v => v * w); q = w; }
  else if (p < 0.36) { const e = 1 - Math.pow(1 - (p - 0.2) / 0.16, 3); pose = WP.map((v, i) => v + (SP[i] - v) * e); q = 1; }
  else { const r = 1 - smooth((p - 0.36) / 0.64); pose = SP.map(v => v * r); q = r; }
  return { q, push: pose[0], lean: pose[1], tw: pose[2] };
}

// the revolver's speed loader in the left hand (weapons/reload.js has the marks): six rounds held in a dark ring with a
// knurled knob behind, fetched from the pouch, pushed into the open cylinder, twisted to let go of the rounds and
// dropped. It lives in upper-body space beside the gun, so it follows the hand exactly
const SLM = new THREE.Group(), SL_RND = new THREE.Group();
{ const R = REV_CYL.r, C = REV_CYL.ch; cyl(SLM, R * 0.95, 0.018, GM.metal, 0, 0, 0, 18); cyl(SLM, 0.008, 0.022, GM.metal2, 0, 0, -0.02, 12); ring(SLM, R * 0.97, 0.004, GM.metal2, 0, 0, 0.006);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, x = Math.cos(a) * C, y = Math.sin(a) * C; cyl(SL_RND, 0.0052, 0.028, GM.brass, x, y, 0.022, 10); cyl(SL_RND, 0.0038, 0.008, GM.copper, x, y, 0.039, 10); }
  SLM.add(SL_RND); SLM.visible = false; SLM.userData.slot = 'loader'; PM.upper.add(SLM); }   // (slot: kept out of your clothes' blood, effects/body-blood.js)
const _slAx = new V3(), _slQ = new THREE.Quaternion(), _slW = new V3();
// a round in the support hand while it's fed in by hand: two shotgun shells side by side (one shows, or both with a
// speed loader feeding a pair) or a rifle cartridge; carried from the pouch and pushed home along the bore
const HSH = new THREE.Group(), HSH_S = [0, 1].map(k => { const g = new THREE.Group(); g.position.x = k * 0.026; cyl(g, 0.0115, 0.062, GM.shell, 0, 0, 0.002, 12); cyl(g, 0.0123, 0.012, GM.brass, 0, 0, -0.03, 12); HSH.add(g); return g; });
const HSH_R = new THREE.Group(); cyl(HSH_R, 0.0055, 0.056, GM.brass, 0, 0, 0, 10); cyl(HSH_R, 0.0035, 0.016, GM.copper, 0, 0, 0.034, 10); HSH.add(HSH_R);
HSH.visible = false; HSH.userData.slot = 'loader'; PM.upper.add(HSH);
const _bq = new THREE.Quaternion();
// the empty loader, let go of: it falls out of the hand, bounces and lies there a while (the casings' debris, weapons/casings.js)
function dropLoader() {
  if (!SLM.visible) return;
  SLM.updateWorldMatrix(true, false); SLM.getWorldPosition(_slW); SLM.visible = false;
  const c = mags[mIdx = (mIdx + 1) % mags.length];
  c.body.geometry = DRUM_G; c.body.material = GM.metal; c.body.scale.set(REV_CYL.r * 0.95, 0.018, REV_CYL.r * 0.95); c.body.rotation.set(Math.PI / 2, 0, 0);
  c.r = 0.022; c.restY = 0.009; c.rest = g => { g.rotation.set(0, g.rotation.y, 0); c.body.rotation.set(0, 0, 0); };
  c.g.position.copy(_slW); c.g.rotation.set(0, P.aim, 0); c.g.scale.setScalar(1); c.g.visible = true;
  c.vx = P.vx * 0.6 + rr(-0.4, 0.4); c.vz = P.vz * 0.6 + rr(-0.4, 0.4); c.vy = rr(-0.6, 0.2);
  c.spin = rr(4, 9) * (rand() < 0.5 ? -1 : 1); c.roll = rr(-5, 5); c.bounces = 0; c.life = 14; c.kind = 'mag';
}

// bandaging: first the weapon goes away, carried by the right hand to where it rides (bandP, player/swap.js), then the
// hands come up and the right one winds the bandage round the left forearm (bandW, eased into bandK); after, the hands
// come down and the weapon is drawn again. healFx is how far the blue edge and the camera's lean-in have come: they
// build slowly as the bandage goes on, ease off as it ends, and drop away fast if a hit cuts it short (healCut)
const BAND_PUT = 0.2, BAND_WRAP = 0.16;
function bandPhases(rdt) {
  const band = P.bandT > 0;
  // another weapon picked during the bandage (switchSlot): the hands come down, the one in hand finishes going away,
  // then the new one is taken out
  if (ANIM.bandSwitch && !band) {
    ANIM.bandW = Math.max(0, (ANIM.bandW || 0) - rdt / BAND_WRAP);
    if (ANIM.bandW <= 0) ANIM.bandP = Math.min(1, (ANIM.bandP || 0) + rdt / BAND_PUT);
    if (ANIM.bandP >= 1) { const s = ANIM.bandSwitch; ANIM.bandSwitch = null; if (W8.slot[s]) { W8.cur = s; W8.reloading = null; W8.burstLeft = 0; W8.swing = 0; W8.cd = Math.max(W8.cd, BAND_PUT); SFX.click(); if (WEAP[W8.slot[s]].melee) ANIM.meleeEqT = -BAND_PUT; } }
  }
  else if (band) { ANIM.bandP = Math.min(1, (ANIM.bandP || 0) + rdt / BAND_PUT); if (ANIM.bandP >= 1) ANIM.bandW = Math.min(1, (ANIM.bandW || 0) + rdt / BAND_WRAP); }
  else { ANIM.bandW = Math.max(0, (ANIM.bandW || 0) - rdt / BAND_WRAP); if (ANIM.bandW <= 0) ANIM.bandP = Math.max(0, (ANIM.bandP || 0) - rdt / BAND_PUT); }
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
function bandagePose(pm, up, now, sh) {
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
// arms, hands and weapon for this frame; up is the upper-body rotation, which this adds lean and twist to
function poseHands(D, up, ph, runF, rdt, now) {
  const pm = PM, s = W8.cur;
  stepKick(RK.R, rdt); stepKick(RK.L, rdt);
  bandPhases(rdt);
  ANIM.slideT.R += rdt; ANIM.slideT.L += rdt;
  ANIM.shoveHit = Math.max(0, (ANIM.shoveHit || 0) - rdt * 5);
  if (ANIM.handFor !== curId()) { ANIM.handFor = curId(); HAND.L.w = HAND.R.w = HAND.L.vw = HAND.R.vw = 0; ANIM.relEnv = 0; }   // a fresh weapon starts with both hands on it
  const sh = shovePose();
  if (sh) {
    up.x += sh.lean - ANIM.shoveHit * 0.08; up.y = up.y * (1 - sh.q) + sh.tw;
    const step = Math.max(0, sh.lean) / 0.46; pm.legL.rotation.x -= 0.45 * step; pm.legR.rotation.x += 0.3 * step;
  }
  if (D.melee) poseMelee(D, up, ph, runF, rdt, now, sh);
  else poseGun(D, up, ph, runF, rdt, now, sh);
  bandagePose(pm, up, now, sh);
}

// a melee weapon, just drawn (player/swap.js draws it, weapons/reload.js starts this): a one-hander is spun once
// round in the hand, the katana's blade is flicked out and back, and the heavy two-handers are hefted up toward the
// shoulder and brought down into the ready
const MELEE_EQ = 0.5;
function meleeFlourish(D, rdt, swinging) {
  if (ANIM.meleeEqT === undefined || ANIM.meleeEqT >= MELEE_EQ) return null;
  const t0 = ANIM.meleeEqT; ANIM.meleeEqT += rdt;
  ANIM.flCut = false;
  if (swinging) { ANIM.meleeEqT = MELEE_EQ; ANIM.flCut = t0 >= 0; return null; }   // a swing straight away cuts it short (and it fades out)
  if (t0 < 0) return null;
  const k = clamp(t0 / MELEE_EQ, 0, 1), a = Math.sin(Math.PI * k);
  if (t0 < 0.22 && ANIM.meleeEqT >= 0.22) { if (D.blunt) SFX.swingBlunt(false); else SFX.swingBlade(false); }
  if (!D.two) return { arx: -0.35 * a, hrx: Math.PI * 2 * smooth(k), uy: 0.12 * a, ux: 0 };              // the twirl
  if (D.style === 'slash') { const f = Math.sin(Math.PI * Math.min(1, k * 1.4)); return { arx: -0.25 * a, hrx: -0.9 * f + 0.25 * Math.sin(Math.PI * 2 * k), uy: -0.18 * a, ux: 0 }; }   // the flick
  return { arx: -0.75 * a, hrx: 0.95 * a, uy: 0.2 * a, ux: -0.08 * a };                                          // the heft
}
// what the swing and flourish added to the pose last frame, so one that's cut off (a swing interrupted by a bandage,
// a flourish by a swing) fades out over a moment instead of jumping
const MCUT = { v: [0, 0, 0, 0, 0], t: 1, last: [0, 0, 0, 0, 0], lastP: 0 };
function poseMelee(D, up, ph, runF, rdt, now, sh) {
  const pm = PM, mh = gunMeshes.melee;
  const keys = SWING[D.style || 'swing'], p = W8.swing > 0 ? 1 - W8.swing / W8.swingDur : 0;
  let [, uy, ux, arx, ary, hrx] = sampleSwing(keys, p);
  const fl = meleeFlourish(D, rdt, p > 0 || !!sh);
  if (fl) { arx += fl.arx; hrx += fl.hrx; uy += fl.uy; ux += fl.ux; }
  {
    const k0 = keys[0], now5 = [uy - k0[1], ux - k0[2], arx - k0[3], ary - k0[4], hrx - k0[5]];
    const cut = (MCUT.lastP > 0 && MCUT.lastP < 0.93 && p === 0) || (ANIM.flPrev && !fl && ANIM.meleeEqT >= MELEE_EQ && ANIM.flCut);
    if (cut) { MCUT.v = MCUT.last.slice(); MCUT.t = 0; }
    if (MCUT.t < 1) { MCUT.t = Math.min(1, MCUT.t + rdt / 0.16); const w = 1 - smooth(MCUT.t); uy += MCUT.v[0] * w; ux += MCUT.v[1] * w; arx += MCUT.v[2] * w; ary += MCUT.v[3] * w; hrx += MCUT.v[4] * w; }
    MCUT.last = now5; MCUT.lastP = p; ANIM.flPrev = !!fl;
  }
  const walk = Math.sin(ph) * 0.06 * Math.min(1, runF) * (p ? 0 : 1);
  up.y += uy; up.x += ux;
  // the weapon rides in the right fist on its keyframes
  armRest(pm.armR, 'R', arx + walk, ary);
  mh.rotation.set(hrx, 0, D.style === 'chop' ? 0 : 0.15);
  {
    // the left arm's own pose first: two-handed, the fist closes on the handle just above the right, wherever the
    // swing takes it; one-handed, it hangs loose
    if (D.two) {
      pm.armR.updateMatrix(); mh.updateMatrix();
      _fL.set(0, 0.15, 0).applyMatrix4(mh.matrix).applyMatrix4(pm.armR.matrix);
      reach(pm.armL, 'L', _fL, 0, true);
    } else armRest(pm.armL, 'L', 0.25 - walk * 2, 0.25);
    if (sh) {
      // a shove: both hands drive straight out from the chest, each blended in from (and back out to) where it was,
      // so the left hand leaves the handle and comes back to it rather than jumping
      const w = sh.q, j = ANIM.shoveHit * 0.06;
      _fR.set(0.14, 1.04, 0.28 + sh.push + j); _fL.set(-0.14, 1.04, 0.28 + sh.push + j);
      const [rxR, ryR] = armAim('R', _fR, true); pm.armR.rotation.set(pm.armR.rotation.x * (1 - w) + rxR * w, pm.armR.rotation.y * (1 - w) + ryR * w, pm.armR.rotation.z * (1 - w));
      const a = pm.armL, rx = a.rotation.x, ry = a.rotation.y, rz = a.rotation.z, px = a.position.x, py = a.position.y, pz = a.position.z, sz = a.scale.z;
      reach(a, 'L', _fL, 0, true);
      a.rotation.set(rx + (a.rotation.x - rx) * w, ry + (a.rotation.y - ry) * w, rz * (1 - w));
      a.position.set(px + (a.position.x - px) * w, py + (a.position.y - py) * w, pz + (a.position.z - pz) * w); a.scale.z = sz + (a.scale.z - sz) * w;
    }
  }
}

function poseGun(D, up, ph, runF, rdt, now, sh) {
  const pm = PM, s = W8.cur, id = curId(), H = HOLD[id] || HOLD_DEF, ak = !!D.akimbo, gg = gunMeshes[s];
  const heavy = D.ammo === 'shells' || D.ammo === 'rifle' || (D.dmg || 0) > 60;
  const sw = smooth(ANIM.sw), ads = ANIM.ads || 0;
  ANIM.pitch = (ANIM.pitch || 0) + ((ANIM.pitchT || 0) - (ANIM.pitch || 0)) * Math.min(1, rdt * 8);   // how far down you're pointing (weapons/combat-update.js)
  const idle = Math.sin(now * 1.6) * 0.015 + Math.sin(ph) * 0.03 * Math.min(1, runF) * (1 - 0.65 * ads);   // the walk hardly reaches the gun down the sights
  // reloads: rel is what kind, rp how far through this mag or this shell, re eases the gun into and out of its reload pose
  const rel = W8.reloading, rp = rel ? 1 - W8.reloadT / W8.reloadMax : 0;
  // a rifle with a charging handle fits its mag change into the first part of the reload, then charges it (rpm is how
  // far through the mag change, cg the charge's own envelope and pull how far back the handle is)
  const CH = rel === 'mag' && CHARGE[s];
  // an empty pistol's reload: the mag change in the first PS_MAG of it, then the support hand drops the slide (rr is how
  // far through that, relU when it lets go)
  const PS = rel === 'mag' && W8.relEmpty && !CH && !D.akimbo, rpm = CH ? Math.min(1, rp / CH_MAG) : PS ? Math.min(1, rp / PS_MAG) : rp;
  const rr = PS ? clamp((rp - PS_MAG) / (1 - PS_MAG), 0, 1) : 0, relU = PS ? (PS_REL[W8.relVar] - PS_MAG) / (1 - PS_MAG) : 0;
  const psW = PS ? smooth(clamp(rr / 0.3, 0, 1)) * (1 - smooth(clamp((rr - relU - 0.06) / (1 - relU - 0.06), 0, 1))) : 0;   // the hand's on the slide
  // the hand reaches up over the receiver (cg rises), draws the handle back hard and fast, slowing as its spring
  // tightens (drawn), lets go at CH_SLAM so the handle snaps home in a blink (pull eases back to 0), waits a beat
  // where it let go and comes back down to the grip
  const cg = CH ? smooth(clamp((rp - 0.72) / 0.09, 0, 1)) * (1 - smooth(clamp((rp - 0.915) / 0.085, 0, 1))) : 0;
  const drawn = CH ? 1 - Math.pow(1 - clamp((rp - 0.8) / (CH_PULL - 0.8), 0, 1), 3) : 0, home = CH ? clamp((rp - CH_SLAM) / 0.02, 0, 1) : 0, pull = drawn * (1 - home * home);
  const slamK = CH ? Math.sin(clamp((rp - CH_SLAM) / 0.06, 0, 1) * Math.PI) : 0;   // the jolt of it slamming home
  if (rel) ANIM.relKind = rel;
  ANIM.relEnv += ((rel === 'mag' ? ((PS ? rp < 0.95 : rpm < 0.86) ? 1 : 0) : rel ? 1 : 0) - ANIM.relEnv) * Math.min(1, rdt * 9);
  const re = ANIM.relEnv, rk = ANIM.relKind;
  // working the pump or the bolt (weapons/casings.js has the beats): cp says where the action is and how hard it's jolting
  const cy = W8.cyc && W8.cyc.id === id ? W8.cyc : null, cq = cy ? clamp((cy.t - cy.delay) / cy.dur, 0, 1) : 0, cp = cy ? cyclePose(cy, cq) : null;
  // ---- the gun: lowered for switching, bandaging and crawlers, canted and brought in for reloads, pushed out by a shove
  const blade = ak ? 0 : H.blade * (1 - sw * 0.6);
  let pitch = 0.9 * sw + ANIM.pitch, yaw = 0, roll = idle * 0.5, ox = 0, oy = Math.sin(ph * 2) * 0.012 * Math.min(1, runF) * (1 - 0.6 * ads), oz = sh ? sh.push : 0;
  // no two reloads alike (W8.relJit, set as each one starts: weapons/reload.js): the pose a touch more or less, and the
  // gun never quite still in the hands while they work on it
  const J = W8.relJit || REL_JIT0;
  if (re > 0.001) { roll += re * 0.04 * Math.sin(now * 2.3 + J.seed); pitch += re * 0.03 * Math.sin(now * 1.7 + J.seed * 1.3); yaw += re * 0.025 * Math.sin(now * 1.3 + J.seed * 0.7); }
  if (!ak && re > 0.001) {
    if (rk === 'mag' && id === 'revolver') { pitch -= 0.3 * re; roll += 0.35 * re; oz -= 0.07 * re; oy += 0.02 * re; }   // the speed loader: canted, open cylinder up, muzzle down a touch
    else if (rk === 'mag') { const v = REL_MAG[W8.relStyle || 0], e = re * J.k; roll -= v.r * e; pitch -= v.p * e; yaw += v.y * e; oy += v.oy * e; oz -= v.oz * e; }
    else if (id === 'dbl') { pitch += 0.55 * re; oz -= 0.05 * re; }                       // broken open, muzzles down
    else if (id === 'revolver') { pitch -= 0.25 * re; roll += 0.35 * re; oz -= 0.06 * re; } // canted so the open cylinder faces up
    else { const v = REL_SHELL[W8.relStyle || 0], e = re * J.k; roll -= v.r * e; pitch -= v.p * e; oy -= v.oy * e; oz -= v.oz * e; }   // tipped to show the loading port
  }
  {
    // working the action: the gun leans the way this rack works it (RACKS in weapons/casings.js) and follows on its
    // loose spring, and the stops knock it; the torso twists and rocks with it
    const t = _rackT; t.p = t.r = t.y = t.z = t.h = t.w = 0;
    if (cp) for (const src in cy.v.lean) { const L = cy.v.lean[src], k = cp[src]; for (const a in L) t[a] += L[a] * k; }   // this way of working it (RACKS)
    stepRack(rdt, t);
    pitch += RACK.p; roll += RACK.r; yaw += RACK.y; oz += RACK.z; oy += RACK.h;
    up.y += RACK.w; up.x += 0.3 * RACK.p;
  }
  if (psW && W8.relVar === 0) {   // a slingshot: turned to the support hand as it takes the slide, tugged back, jolted by the slam
    const tug = smooth(clamp((rp - PS_TUG) / (PS_REL[0] - PS_TUG), 0, 1)) * (rp < PS_REL[0] ? 1 : 0), slam = Math.sin(clamp((rp - PS_REL[0]) / 0.05, 0, 1) * Math.PI);
    roll -= 0.22 * psW; yaw += 0.1 * psW; pitch -= 0.04 * psW - 0.06 * slam; oz += 0.012 * tug - 0.01 * slam;
  }
  if (PS && W8.relVar === 1) {   // the slide release: the gun rolled in to the shooting hand's thumb, which drops the slide, and the slam jolts it
    const th = Math.sin(clamp((rp - (PS_REL[1] - 0.09)) / 0.15, 0, 1) * Math.PI), slam = Math.sin(clamp((rp - PS_REL[1]) / 0.05, 0, 1) * Math.PI);
    roll += 0.3 * th; yaw -= 0.07 * th; pitch -= 0.05 * th - 0.07 * slam; oz -= 0.01 * slam;
  }
  // a shotgun at low ready between shots (LOW_READY), not while it's being reloaded or worked
  const LR = !ak && LOW_READY[id];
  if (LR) {
    const mt = ads > 0.05 || now - (ANIM.shotAt || -9) < MOUNT_HOLD || (mouseDown && state === 'play') || !!cy;
    ANIM.mount = (ANIM.mount ?? 1) + ((mt ? 1 : 0) - (ANIM.mount ?? 1)) * Math.min(1, rdt * (mt ? 16 : 2.4));
    const lw = smooth(1 - ANIM.mount) * (1 - re); pitch += LR.p * lw; oy += LR.y * lw; oz += LR.z * lw; roll += LR.r * lw; yaw += LR.yaw * lw;
  }
  // the double barrel snapped shut with a flick of the wrist: the barrels swinging up into place jolt the gun up
  if (id === 'dbl') { const shut = Math.max(0, (ANIM.brkPrev ?? 0) - (ANIM.brk || 0)); ANIM.brkPrev = ANIM.brk || 0; ANIM.flk = Math.min(1, Math.max((ANIM.flk || 0) * Math.exp(-rdt * 7), shut * 3)); pitch -= 0.26 * ANIM.flk; oy += 0.02 * ANIM.flk; }
  if (cg) { roll += 0.26 * cg; pitch -= 0.07 * cg + 0.05 * slamK; oy += 0.02 * cg; oz -= 0.03 * cg + 0.018 * pull - 0.012 * slamK; }   // canted over to reach the charging handle, tugged back with it, jolted as it slams home
  oy += 0.05 * ads; pitch -= 0.03 * ads; roll *= 1 - ads * 0.6;                            // aiming: up to the eye, steadier
  oz -= ak ? AK_PULL : H.pull;
  if (H.kind === 'long') oy += LONG_RAISE;
  { const fa = freeAim(rdt, heavy, ads); yaw += fa.yaw; pitch += fa.pitch; ox += Math.sin(fa.yaw) * FREE_SWING; oy -= Math.sin(fa.pitch) * FREE_SWING; }   // the arms trail a turn and swing on after it
  if (ANIM.rg > 0) pitch -= PM.g.rotation.x * ANIM.rg;   // Run and gun: the gun stays level while the body tips over the sill and dips into the landing
  posePivot(gg, pitch, yaw, roll, X, 1.08, 0.1, ox, oy, oz, -blade);
  up.y += blade; pm.head.rotation.y = -blade * 0.9;
  // ---- one hold per hand: each gun kicks on its own shot; akimbo pistols run their own reload
  // the left gun put away for a Run and gun vault and drawn again after (AK_DRAW); akHolstered while it's away
  if (ak && vaultGun()) { ANIM.akIn = true; ANIM.akDraw = 0; }
  else if (!ak) ANIM.akIn = false;
  else if (ANIM.akIn) { ANIM.akDraw += rdt / AK_DRAW; if (ANIM.akDraw >= 1) ANIM.akIn = false; }
  ANIM.akHolstered = !!ANIM.akIn && (!!P.vault || ANIM.akDraw < AK_GRAB);
  const sides = ak ? ['R', 'L'] : ['R'];
  for (const side of sides) {
    const h = HOLDS[s] && HOLDS[s][side]; if (!h) continue;
    const k = RK[side], g = H.grip, sg = side === 'R' ? 1 : -1;
    let hx = k.p, hy = k.y, hz = k.r, hox = h.userData.x0 || 0, hoy = k.h, hoz = k.z;
    const u = ak ? akU(side) : 0;
    if (ak) {
      // this hand's own way of holding it (AK_HAND), eased off while it's down being reloaded, and its own drift
      const a = AK_HAND[side], on = u > 0 ? 1 - Math.sin(Math.PI * clamp(u, 0, 1)) : 1, dr = now * a.f;
      hz += sg * a.cant * on; hy -= sg * a.toe * on; hx += a.p + Math.sin(dr) * 0.012;
      hox -= sg * a.in; hoy += a.up + Math.sin(dr * 1.3 + 0.5) * 0.004; hoz += a.fwd; hy += Math.sin(dr * 0.7 + 1.3) * 0.01;
      if (side === 'L') {
        // put away for a vault, then drawn: the hand goes down to where it is, and comes back up with it
        h.visible = !ANIM.akHolstered;
        if (ANIM.akIn && !P.vault) { const at = AK_DRAW_AT[s] || AK_DRAW_AT.side, w = vk(ANIM.akDraw, 0, AK_GRAB - 0.05) * (1 - vk(ANIM.akDraw, AK_GRAB + 0.08, 1)); hx += at.p * w; hoy += at.y * w; hoz += at.z * w; hox += sg * at.x * w; }
      }
    }
    if (u > 0) {
      // this gun's turn, the other kept up on the aim: its mag flicked out with a roll of the wrist, the gun taken down
      // to its hip pouch and driven onto a fresh one, and back up with a snap as it seats; one that ran dry gets its
      // slide stop thumbed on the way up, a twist of the wrist as the slide slams home
      const flick = Math.sin(clamp(u / 0.14, 0, 1) * Math.PI), dip = Math.sin(clamp((u - 0.12) / 0.62, 0, 1) * Math.PI), seat = Math.sin(clamp((u - 0.5) / 0.14, 0, 1) * Math.PI);
      const thumb = W8.akRel.empty ? Math.sin(clamp((u - AK_SLIDE + 0.05) / 0.12, 0, 1) * Math.PI) : 0;
      hx += -0.4 * flick + 1.15 * dip - 0.25 * seat - 0.1 * thumb; hz += sg * (0.4 * flick + 0.16 * thumb); hoy -= 0.26 * dip; hoz -= 0.16 * dip; hox -= sg * 0.05 * dip;
    }
    posePivot(h, hx, hy, hz, g[0], g[1], g[2], hox, hoy, hoz);
  }
  up.x -= ANIM.recoil * (heavy ? 0.06 : 0.03);
  ANIM.recoil = Math.max(0, ANIM.recoil - rdt * 11);
  // ---- moving parts: slides and bolts snap back on their own gun's shot, lock open when empty, ride the pump or bolt cycle
  const sl = SLIDES[s];
  if (sl && sl.length) {
    for (const q of sl) {
      const st = ANIM.slideT[q.side || 'R'];
      let off = st < 0.02 ? st / 0.02 : st < 0.032 ? 1 : Math.max(0, 1 - (st - 0.032) / 0.06), held = false, fast = false;   // slammed back, a beat at the end of its stroke, run home
      if (q.cyc) {
        // the rifle's bolt stays open, handle up, while you feed it; otherwise the action follows the cycle
        const bolt = EJECT[id] === 'bolt', open = bolt && rel === 'shell';
        off = open ? 1 : cp ? cp.off : 0; held = open || !cp;   // eased when nothing's working it (a rack cut short closes, not snaps)
        if (bolt) { q.lift = (q.lift || 0) + ((open ? 1 : cp ? cp.lift : 0) - (q.lift || 0)) * (cp && !open ? 1 : Math.min(1, rdt * 14)); q.m.rotation.z = -BOLT_TURN * q.lift; }
      }
      // an akimbo gun's slide: locked back once that gun's run dry, until its own reload drops it (weapons/akimbo.js);
      // let go, it slams home in a blink rather than snapping
      else if (q.lock && ak && akSlideBack(id, q.side)) { off = 1; held = true; }
      else if (q.lock && ak && q.off > 0.02 && st > 0.1) { off = 0; held = true; fast = true; }
      else if (q.lock && !ak && (W8.mag[id] || 0) <= 0 && rel !== 'mag') { off = 1; held = true; }
      else if (q.lock && PS) {   // locked back through the mag change, tugged off the stop (a slingshot), then flies home
        const relT = PS_REL[W8.relVar], tug = W8.relVar === 0 ? smooth(clamp((rp - PS_TUG) / (relT - PS_TUG), 0, 1)) * 0.14 : 0;
        off = rp < relT ? 1 + tug : 0; held = true; fast = rp >= relT;
      }
      else if (q.lock && rel === 'mag' && SLIDE_PISTOLS[id]) { off = 0; held = true; }   // rounds still in it: the slide stays put
      else if (q.lock && rel === 'mag' && CH) { off = rp < CH_SLAM ? 1 : 0; held = true; if (!off) q.off = 0; }   // back with the handle, then slammed home
      else if (q.lock && rel === 'mag') { off = W8.reloadT / W8.reloadMax > 0.12 ? 1 : 0; held = true; }
      // a slide locking back or dropping home after a reload eases there (fast going back, a softer run forward), never snaps
      if (held) { if (q.off === undefined) q.off = off; q.off += (off - q.off) * Math.min(1, rdt * (fast ? 60 : off > q.off ? 30 : 12)); off = q.off; } else q.off = off;
      const zc = q.z0 - q.travel * off, cl = q.m.userData.clip;
      if (cl === undefined) q.m.position.z = zc;
      else {   // a bolt seen through a port in the gun's side: whatever has run back past the port's rear edge is inside the receiver, out of sight
        const L = q.L || (q.L = 2 * (q.m.geometry.boundingBox || (q.m.geometry.computeBoundingBox(), q.m.geometry.boundingBox)).max.z), f = zc + L / 2, r = Math.max(cl, zc - L / 2);
        q.m.visible = f - r > 0.001; if (q.m.visible) { q.m.scale.z = (f - r) / L; q.m.position.z = (f + r) / 2; }
      }
      q.m.updateMatrix();
    }
  }
  // the magazine on the model: slides out as the reload starts, gone while the old one falls, a fresh one rises back in
  const mgs = MAGG[s] || [];
  if (mgs.length && ak) {
    // an akimbo pair: each gun's mag slides out as its turn starts, is gone while it falls, and the fresh one is driven
    // up into the grip as that gun comes down onto it (the right gun's is built first)
    mgs.forEach((m, k) => {
      const side = k ? 'L' : 'R', u = akU(side), md = u < 0.08 ? smooth(u / 0.08) * 0.12 : u < 0.55 ? 0 : 0.12 * (1 - smooth(clamp((u - 0.55) / 0.05, 0, 1)));
      m.visible = u < 0.08 || u >= 0.55; m.position.y = -md;
      if (akBusy(side) || (!k && !W8.reloading)) ANIM.magDrop = m.visible ? md : 0.22;
    });
  } else if (mgs.length) {
    let md = 0, show = true;
    if (rel === 'mag') { const tOut = Math.min(0.3, 0.14 / Math.max(0.3, W8.reloadMax)); if (rpm < tOut) md = smooth(rpm / tOut) * 0.12; else if (rpm < 0.6) show = false; else md = 0.22 * (1 - smooth(clamp((rpm - 0.6) / 0.25, 0, 1))); }
    mgs.forEach(m => { m.visible = show; m.position.y = -md; });
    ANIM.magDrop = show ? md : 0.22;
  }
  // the charging handle: drawn back by the right hand and let go
  if (CHARGE[s]) { const c = CHARGE[s].m; c.position.z = -CHARGE[s].tr * pull; c.updateMatrix(); }
  // the double barrel breaks open for its whole reload (the barrels drop on the hinge, the breech up at you) and snaps
  // shut after; the brass of each loaded shell shows in its chamber, the one being pushed home as soon as it's in
  const brkG = BRK[s];
  if (brkG) {
    const open = rel === 'shell' ? 1 : 0;
    ANIM.brk = (ANIM.brk || 0) + (open - (ANIM.brk || 0)) * Math.min(1, rdt * (open ? 11 : 24));
    brkG.g.rotation.x = 0.62 * smooth(clamp(ANIM.brk, 0, 1)); brkG.g.updateMatrix();
    const loaded = (W8.mag[id] || 0) + (rel === 'shell' && rp >= 0.7 ? Math.min(D.loadN || 1, 2 - (W8.mag[id] || 0)) : 0);
    brkG.rims.forEach((r, k) => { r.visible = k < loaded; });
  }
  // a belt-fed gun shows what's left in its belt: the rounds go from the box end first under ten, and none are left
  // when it's empty; the old box slides out as it was, the fresh one rising in on a reload is full
  const belt = BELT[s];
  if (belt) { const n = rel === 'mag' && rpm >= 0.6 ? belt.length : Math.min(belt.length, W8.mag[id] || 0); belt.forEach((r, k) => { r.visible = k < n; }); beltJiggle(belt, holdOf(s, 'R'), rdt); } else BJ.on = false;
  // revolver: the cylinder swings out to the left for the whole reload and snaps shut after
  const cr = CRANE[s] || [];
  if (cr.length) { const want = rel === 'shell' || (rel === 'mag' && D.speedload && rp < SL_SHUT) ? 1 : 0; ANIM.crane = (ANIM.crane || 0) + (want - (ANIM.crane || 0)) * Math.min(1, rdt * (want ? 14 : 18)); cr.forEach(c => { c.rotation.z = -ANIM.crane * 1.3; c.updateMatrix(); }); }   // out to the left
  // ---- hands: start from their places on the gun
  const hd = HAND_DROP[H.kind] || HAND_DROP.hand;
  gunPt(_hR, s, 'R', H.grip[0] + hd.out, H.grip[1] - hd.grip, H.grip[2]);
  if (ak) gunPt(_hL, s, 'L', H.grip[0] - hd.out, H.grip[1] - hd.grip, H.grip[2]);
  else {
    let fz = H.fore[2];
    if (H.foreOnSlide && sl) { const q = sl.find(e => e.cyc); if (q) fz += q.m.position.z - q.z0; }   // the support hand rides the pump
    gunPt(_hL, s, 'R', H.fore[0], H.fore[1] - hd.fore, fz);
  }
  // the firing hand: works the bolt by its knob on a bolt gun's cycle (both points are on the gun, so it never lags
  // behind it), coming up over the wrist on the way there and back
  if (cp && cy.bolt && sl) {
    const q = sl.find(e => e.cyc);
    if (q) { const hd = cy.v.hand; _p1.set(BOLT_KNOB[0] + hd[0], BOLT_KNOB[1] + hd[1], BOLT_KNOB[2]).applyMatrix4(q.m.matrix); gunPt(_p1, s, 'R', _p1.x, _p1.y, _p1.z); _hR.lerp(_p1, cp.grab); _hR.y += Math.sin(Math.PI * cp.grab) * 0.02 * (cq < 0.5 ? 1 : 0.6); }
  }
  // and the charging handle at the end of a rifle's reload: the right hand leaves the grip for it, pulls, lets go and
  // comes back
  if (cg > 0.001) { const at = CHARGE[s].at, hp = rp < CH_SLAM ? pull : drawn; gunPt(_p1, s, 'R', at[0], at[1] + 0.012, at[2] - CHARGE[s].tr * hp); _hR.lerp(_p1, cg); _hR.y += Math.sin(Math.PI * cg) * 0.035; }   // over the top of the receiver on the way, and it stays back where it let go
  handTarget(_fR, 'R', _hR, null, 0, rdt);
  // the support hand: off the gun to fetch a mag or feed shells, or wrapping a bandage; on the gun the rest of the time
  if (!ak) {
    let free = null, wt = 0;
    if (rel === 'mag' && D.speedload && cr.length) {
      // the back of the open cylinder and the gun's forward axis, in upper-body space
      const hq = holdOf(s, 'R');
      _p1.set(0.035, 0.045, -0.06).applyMatrix4(cr[0].matrix).applyMatrix4(hq.matrix).applyMatrix4(gg.matrix);
      _slQ.copy(gg.quaternion).multiply(hq.quaternion); _slAx.set(0, 0, 1).applyQuaternion(_slQ);
      _p2.copy(_p1).addScaledVector(_slAx, -0.1);                              // the fist, loader pushed home
      _p3.copy(_p1).addScaledVector(_slAx, -0.24); _p3.y -= 0.07;              // lining it up behind the cylinder
      _p5.copy(_p2); _p5.y -= 0.16; _p5.x -= 0.05;                             // let go: the hand drops away
      _p6.copy(_p1).addScaledVector(_slAx, 0.04); _p6.x -= 0.05;               // the palm flicks the cylinder shut
      free = walkPath(_p4, [[0, _hL], [0.08, _hL], [0.26, POUCH], [0.42, _p3], [SL_IN, _p2], [SL_DROP - 0.02, _p2], [0.77, _p5], [SL_SHUT - 0.01, _p6], [0.9, _p6], [1, _hL]], rp); wt = 1;
    }
    else if (rel === 'mag') {
      const mp = MAGPOS[s]; gunPt(_p1, s, 'R', mp ? mp[0] : H.grip[0], mp ? mp[1] + 0.03 : H.grip[1] - 0.14, mp ? mp[2] : H.grip[2] + 0.05);   // the bottom of the mag well
      const st = W8.relStyle || 0;
      if (st === 1) {   // let the old one drop, bring the new one up from in front and slap it home
        _p2.copy(_p1).add(_rv.set(0.03, -0.1, -0.03)); _p3.copy(_p1).add(_rv.set(0, -0.2, 0.06)); _p5.copy(_p1).add(_rv.set(0, -0.03, 0.01)); _p6.copy(_p1); _p6.y += 0.012;
        free = walkPath(_p4, [[0, _hL], [0.14, _p2], [0.42, POUCH], [0.62, _p3], [0.76, _p5], [0.8, _p1], [0.84, _p6], [0.9, _p1], [1, _hL]], rpm);
      } else if (st === 2) {   // strip the old one out and away to the side, rock the new one in from behind and tug it to check
        _p2.copy(_p1).add(_rv.set(-0.05, -0.14, 0)); _p3.copy(_p1).add(_rv.set(-0.05, -0.18, -0.04)); _p5.copy(_p1).add(_rv.set(0, -0.04, -0.02)); _p6.copy(_p1); _p6.y -= 0.012;
        free = walkPath(_p4, [[0, _hL], [0.12, _p1], [0.22, _p2], [0.42, POUCH], [0.58, _p3], [0.72, _p5], [0.8, _p1], [0.86, _p6], [0.92, _p1], [1, _hL]], rpm);
      } else {          // strip it, to the pouch, the new one up into the well and pushed home
        _p2.copy(_p1); _p2.y -= 0.16; _p3.copy(_p1); _p3.y -= 0.22;
        free = walkPath(_p4, [[0, _hL], [0.12, _p1], [0.22, _p2], [0.42, POUCH], [0.6, _p3], [0.8, _p1], [0.9, _p1], [1, _hL]], rpm);
      }
      wt = 1;
      if (PS && rr > 0) {
        // then the slide: over the top to pinch the back of it, tug it off the stop and let it fly, the hand flicking
        // away; or the thumb pressed down on the slide stop at the frame's left
        const sq = sl && sl.find(e => e.lock), dz = sq ? sq.m.position.z - sq.z0 : 0, A = H.slideAt || [X, 1.172, 0.57], B = H.stopAt || [X + 0.03, 1.128, 0.66];
        if (W8.relVar === 0) {
          gunPt(_p1, s, 'R', A[0], A[1] + 0.04, A[2] + dz - 0.01); gunPt(_p2, s, 'R', A[0], A[1], A[2] + dz); gunPt(_p3, s, 'R', A[0] + 0.01, A[1] + 0.05, A[2] - 0.07);
          free = walkPath(_p4, [[0, _hL], [0.24, _p1], [0.36, _p2], [relU, _p2], [relU + 0.09, _p3], [1, _hL]], rr);
        } else { free = null; wt = 0; }   // the slide release: the shooting hand's thumb does it (the gun's roll, above), the support hand back on the grip
      }
    } else if (rel === 'shell') {
      if (id === 'revolver' && cr.length) _p1.set(0.035, 0.045, -0.07).applyMatrix4(cr[0].matrix).applyMatrix4(holdOf(s, 'R').matrix).applyMatrix4(gg.matrix);   // the back of the open cylinder
      else if (brkG && brkG.rims.length) {
        // the next empty chamber of the open barrels, and the line back along its bore the shell comes in on
        const r = brkG.rims[Math.min(brkG.rims.length - 1, W8.mag[id] || 0)], hq = holdOf(s, 'R');
        _p1.copy(r.position).applyMatrix4(brkG.g.matrix).applyMatrix4(hq.matrix).applyMatrix4(gg.matrix);
        _bq.copy(gg.quaternion).multiply(hq.quaternion).multiply(brkG.g.quaternion); _slAx.set(0, 0, 1).applyQuaternion(_bq);
        _p1.addScaledVector(_slAx, -0.03);
      }
      else { const pt = H.port || H.grip; gunPt(_p1, s, 'R', pt[0], pt[1], pt[2]); }
      if (brkG && brkG.rims.length) { _p2.copy(_p1).addScaledVector(_slAx, -0.09); _p2.y += 0.03; }   // lined up behind the chamber
      else { _p2.copy(_p1); _p2.y -= 0.1; _p2.x -= 0.05; }
      const st = W8.relStyle || 0;
      if (st === 1) { _p2.add(_rv.set(-0.03, -0.04, 0)); _p3.copy(_p1).lerp(_p2, -0.12); free = walkPath(_p4, [[0, POUCH], [0.45, _p2], [0.7, _p1], [0.76, _p3], [0.86, _p1], [1, POUCH]], rp); }   // in low from the left, a firm thumb push
      else if (st === 2) { _p3.copy(POUCH).lerp(_p2, 0.5); _p3.y += 0.05; free = walkPath(_p4, [[0, POUCH], [0.28, _p3], [0.5, _p2], [0.7, _p1], [0.86, _p1], [1, POUCH]], rp); }   // up and over, then in
      else free = walkPath(_p4, [[0, POUCH], [0.45, _p2], [0.7, _p1], [0.86, _p1], [1, POUCH]], rp);
      wt = 1;
    }
    if (free && re > 0.001) { const b = Math.sin(Math.PI * clamp(rp, 0, 1)); free.x += J.dx * b; free.y += J.dy * b; }
    handTarget(_fL, 'L', _hL, free, wt, rdt);
    // the round in the hand from the pouch till it's pushed in (pump and double barrel shells, rifle cartridges)
    const feed = rel === 'shell' && id !== 'revolver' && rp > 0.12 && rp < 0.72;
    HSH.visible = feed;
    if (feed) {
      const rifle = D.ammo === 'rifle', two = !rifle && (D.loadN || 1) >= 2 && !!brkG;
      HSH_R.visible = rifle; HSH_S[0].visible = !rifle; HSH_S[1].visible = two;
      if (!(brkG && brkG.rims.length)) { _bq.copy(gg.quaternion).multiply(holdOf(s, 'R').quaternion); _slAx.set(0, 0, 1).applyQuaternion(_bq); }
      HSH.quaternion.copy(_bq); HSH.position.copy(_fL).addScaledVector(_slAx, 0.04);
    }
    // the loader rides in front of the left fist from the pouch until it's let go, rounds pointing into the cylinder,
    // and is twisted a sixth of a turn once they're in
    const slOn = rel === 'mag' && D.speedload && rp > 0.25 && rp < SL_DROP;
    if (slOn) {
      SLM.visible = true; SL_RND.visible = true;
      SLM.position.copy(_fL).addScaledVector(_slAx, 0.07); SLM.quaternion.copy(_slQ);
      SLM.rotateZ(smooth(clamp((rp - SL_IN - 0.02) / 0.08, 0, 1)) * Math.PI / 3);
    } else if (SLM.visible && !(rel === 'mag' && D.speedload)) SLM.visible = false;   // cut short (a swap, a vault)
  } else handTarget(_fL, 'L', _hL, null, 0, rdt);
  // ---- arms: each one points at its own fist target, so only the hand that is busy moves
  const hr = HAND_ROLL[H.kind] || HAND_ROLL.hand;
  reach(pm.armR, 'R', _fR, hr.R * (1 - HAND.R.w)); reach(pm.armL, 'L', _fL, ak ? -hr.R * (1 - HAND.L.w) : hr.L * (1 - HAND.L.w));   // (turned back straight while a hand's off the gun)
  pm.head.rotation.x += ANIM.pitch * 0.85 + ads * 0.1;
  pm.head.rotation.z -= ads * 0.13;   // and the head tips over onto the stock to look down the sights
  up.x += ANIM.pitch * 0.4 + ads * 0.05;
}
