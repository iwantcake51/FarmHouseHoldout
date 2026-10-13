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
  pistol: { grip: [X, 1.04, 0.565], fore: [X - 0.045, 0.99, 0.6], blade: 0.12, pull: 0.1, kind: 'hand' },
  deagle: { grip: [X, 1.04, 0.56], fore: [X - 0.05, 0.985, 0.6], blade: 0.12, pull: 0.09, kind: 'hand' },
  revolver: { grip: [X, 1.03, 0.5], fore: [X - 0.045, 0.985, 0.54], blade: 0.12, pull: 0.04, kind: 'hand' },
  smg: { grip: [X, 1.03, 0.66], fore: [X, 1.06, 0.84], blade: 0.3, pull: 0.29, kind: 'hand' },
  pump: { grip: [X, 1.06, 0.45], fore: [X, 1.06, 0.88], blade: 0.58, pull: 0.16, kind: 'long', foreOnSlide: true, port: [X, 1.06, 0.66] },
  dbl: { grip: [X, 1.05, 0.44], fore: [X, 1.08, 0.74], blade: 0.48, pull: 0.12, kind: 'long', port: [X, 1.14, 0.58] },
  auto12: { grip: [X, 1.0, 0.49], fore: [X, 1.0, 0.96], blade: 0.58, pull: 0.21, kind: 'long' },
  hunting: { grip: [X, 1.06, 0.48], fore: [X, 1.06, 0.76], blade: 0.46, pull: 0.15, kind: 'long', port: [X, 1.18, 0.64] },
  sub: { grip: [X, 1.0, 0.49], fore: [X, 1.07, 0.88], blade: 0.58, pull: 0.21, kind: 'long' },
  ar: { grip: [X, 0.965, 0.6], fore: [X, 1.06, 0.95], blade: 0.58, pull: 0.2, kind: 'long' },
  lmg: { grip: [X, 0.99, 0.45], fore: [X, 1.07, 0.9], blade: 0.58, pull: 0.17, kind: 'long' }
};
const HOLD_DEF = { grip: [X, 1.04, 0.56], fore: [X - 0.045, 0.99, 0.6], blade: 0.12, pull: 0.1, kind: 'hand' };
// akimbo: each pistol out in its own hand, close enough in that both arms sit straight
const AK_PULL = 0.1;
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
// each gun's recoil: a spring per hand for muzzle flip (p), drive back (z) and a little roll (r); pistols flip, long guns
// shove back into the shoulder, and the spring overshoots a touch on the way back so it settles rather than snaps
const RK = { R: { p: 0, vp: 0, z: 0, vz: 0, r: 0, vr: 0 }, L: { p: 0, vp: 0, z: 0, vz: 0, r: 0, vr: 0 } };
function gunKick(side, pw, kind) {
  const k = RK[side], hand = kind === 'hand';
  k.vp -= pw * (hand ? 9.5 : 4.2); k.vz -= pw * (hand ? 1.4 : 2.6); k.vr += (rand() < 0.5 ? -1 : 1) * pw * (hand ? 2.2 : 1.4);
}
function stepKick(k, dt) {
  for (let n = Math.ceil(dt / (1 / 240)), h = dt / Math.max(1, n), i = 0; i < n; i++) {
    k.vp += (-380 * k.p - 26 * k.vp) * h; k.p = clamp(k.p + k.vp * h, -0.7, 0.25);
    k.vz += (-380 * k.z - 26 * k.vz) * h; k.z += k.vz * h;
    k.vr += (-300 * k.r - 22 * k.vr) * h; k.r += k.vr * h;
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
  arm.position.set(s[0], s[1], s[2]); arm.rotation.set(rx, ry, roll || 0); arm.scale.set(1, 1, sc);
}
function armRest(arm, side, rx, ry) { const s = SHOULDER_REST[side]; arm.position.set(s[0], s[1], s[2]); arm.rotation.set(rx, ry, 0); arm.scale.set(1, 1, 1); }
// a point on the gun (hold-local) in upper-body space
const holdOf = (s, side) => (HOLDS[s] && (HOLDS[s][side] || HOLDS[s].R)) || gunMeshes[s];
function gunPt(out, s, side, x, y, z) { return out.set(x, y, z).applyMatrix4(holdOf(s, side).matrix).applyMatrix4(gunMeshes[s].matrix); }
// eased walk along [time, point] keys
function walkPath(out, keys, p) {
  let k = 0; while (k < keys.length - 2 && keys[k + 1][0] <= p) k++;
  const a = keys[k], b = keys[k + 1]; return out.copy(a[1]).lerp(b[1], smooth(clamp((p - a[0]) / ((b[0] - a[0]) || 1), 0, 1)));
}
// blend a hand between its spot on the gun and a free target; wt is how far off the gun it should be
// (on a critically damped spring, so it eases off the gun and back onto it instead of leaving at full speed)
function handTarget(out, side, onGun, free, wt, rdt) {
  const h = HAND[side];
  if (free) h.free.copy(free);
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
{ cyl(SLM, 0.042, 0.026, GM.metal, 0, 0, 0, 16); cyl(SLM, 0.013, 0.03, GM.metal2, 0, 0, -0.026, 10); ring(SLM, 0.0435, 0.006, GM.metal2, 0, 0, 0.008);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, x = Math.cos(a) * 0.026, y = Math.sin(a) * 0.026; cyl(SL_RND, 0.0085, 0.04, GM.brass, x, y, 0.032, 8); cyl(SL_RND, 0.006, 0.012, GM.copper, x, y, 0.057, 8); }
  SLM.add(SL_RND); SLM.visible = false; SLM.userData.slot = 'loader'; PM.upper.add(SLM); }   // (slot: kept out of your clothes' blood, effects/body-blood.js)
const _slAx = new V3(), _slQ = new THREE.Quaternion(), _slW = new V3();
// the empty loader, let go of: it falls out of the hand, bounces and lies there a while (the casings' debris, weapons/casings.js)
function dropLoader() {
  if (!SLM.visible) return;
  SLM.updateWorldMatrix(true, false); SLM.getWorldPosition(_slW); SLM.visible = false;
  const c = mags[mIdx = (mIdx + 1) % mags.length];
  c.body.geometry = DRUM_G; c.body.material = GM.metal; c.body.scale.set(0.042, 0.026, 0.042); c.body.rotation.set(Math.PI / 2, 0, 0);
  c.r = 0.03; c.restY = 0.013; c.rest = g => { g.rotation.set(0, g.rotation.y, 0); c.body.rotation.set(0, 0, 0); };
  c.g.position.copy(_slW); c.g.rotation.set(0, P.aim, 0); c.g.scale.setScalar(1); c.g.visible = true;
  c.vx = P.vx * 0.6 + rr(-0.4, 0.4); c.vz = P.vz * 0.6 + rr(-0.4, 0.4); c.vy = rr(-0.6, 0.2);
  c.spin = rr(4, 9) * (rand() < 0.5 ? -1 : 1); c.roll = rr(-5, 5); c.bounces = 0; c.life = 14; c.kind = 'mag';
}

// arms, hands and weapon for this frame; up is the upper-body rotation, which this adds lean and twist to
function poseHands(D, up, ph, runF, rdt, now) {
  const pm = PM, s = W8.cur;
  stepKick(RK.R, rdt); stepKick(RK.L, rdt);
  ANIM.bandK = (ANIM.bandK || 0) + ((P.bandT > 0 ? 1 : 0) - (ANIM.bandK || 0)) * Math.min(1, rdt * 9);   // how far into the bandaging pose
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
  const bk = smooth(ANIM.bandK || 0);
  if (bk > 0.999) {   // weapon held low in the right hand, the left wraps the bandage round you; a bash drives the right hand out on its own
    pm.armR.rotation.x = 0.55; const bt = now;
    if (sh) { const w = sh.q; _fR.set(0.14, 1.04, 0.28 + sh.push + ANIM.shoveHit * 0.06); const [rxR, ryR] = armAim('R', _fR, true); pm.armR.rotation.set(0.55 * (1 - w) + rxR * w, ryR * w, 0); }
    reach(pm.armL, 'L', _fL.set(0.06 + Math.cos(bt * 9) * 0.07, 0.9 + Math.sin(bt * 9) * 0.05, 0.26), 0, true);
  } else {
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
    // easing into (or out of) the bandaging pose: the weapon hand drops, the other goes to the wrap
    if (bk > 0.001) {
      const r = pm.armR; r.rotation.set(r.rotation.x + (0.55 - r.rotation.x) * bk, r.rotation.y * (1 - bk), r.rotation.z * (1 - bk));
      const a = pm.armL, rx = a.rotation.x, ry = a.rotation.y, rz = a.rotation.z, px = a.position.x, py = a.position.y, pz = a.position.z, sz = a.scale.z;
      reach(a, 'L', _fL.set(0.06 + Math.cos(now * 9) * 0.07, 0.9 + Math.sin(now * 9) * 0.05, 0.26), 0, true);
      a.rotation.set(rx + (a.rotation.x - rx) * bk, ry + (a.rotation.y - ry) * bk, rz * (1 - bk));
      a.position.set(px + (a.position.x - px) * bk, py + (a.position.y - py) * bk, pz + (a.position.z - pz) * bk); a.scale.z = sz + (a.scale.z - sz) * bk;
    }
  }
}

function poseGun(D, up, ph, runF, rdt, now, sh) {
  const pm = PM, s = W8.cur, id = curId(), H = HOLD[id] || HOLD_DEF, ak = !!D.akimbo, gg = gunMeshes[s];
  const heavy = D.ammo === 'shells' || D.ammo === 'rifle' || (D.dmg || 0) > 60, band = P.bandT > 0, bk = smooth(ANIM.bandK || 0);
  if (band) ANIM.sw += (0.85 - ANIM.sw) * Math.min(1, rdt * 9);
  const sw = smooth(ANIM.sw), ads = ANIM.ads || 0;
  ANIM.pitch = (ANIM.pitch || 0) + ((ANIM.pitchT || 0) - (ANIM.pitch || 0)) * Math.min(1, rdt * 8);   // how far down you're pointing (weapons/combat-update.js)
  const idle = Math.sin(now * 1.6) * 0.015 + Math.sin(ph) * 0.03 * Math.min(1, runF) * (1 - 0.65 * ads);   // the walk hardly reaches the gun down the sights
  // reloads: rel is what kind, rp how far through this mag or this shell, re eases the gun into and out of its reload pose
  const rel = W8.reloading, rp = rel ? 1 - W8.reloadT / W8.reloadMax : 0;
  // a rifle with a charging handle fits its mag change into the first part of the reload, then charges it (rpm is how
  // far through the mag change, cg the charge's own envelope and pull how far back the handle is)
  const CH = rel === 'mag' && CHARGE[s], rpm = CH ? Math.min(1, rp / CH_MAG) : rp;
  // the hand reaches up over the receiver (cg rises), draws the handle back hard and fast, slowing as its spring
  // tightens (drawn), lets go at CH_SLAM so the handle snaps home in a blink (pull eases back to 0), waits a beat
  // where it let go and comes back down to the grip
  const cg = CH ? smooth(clamp((rp - 0.72) / 0.09, 0, 1)) * (1 - smooth(clamp((rp - 0.915) / 0.085, 0, 1))) : 0;
  const drawn = CH ? 1 - Math.pow(1 - clamp((rp - 0.8) / (CH_PULL - 0.8), 0, 1), 3) : 0, home = CH ? clamp((rp - CH_SLAM) / 0.02, 0, 1) : 0, pull = drawn * (1 - home * home);
  const slamK = CH ? Math.sin(clamp((rp - CH_SLAM) / 0.06, 0, 1) * Math.PI) : 0;   // the jolt of it slamming home
  if (rel) ANIM.relKind = rel;
  ANIM.relEnv += ((rel === 'mag' ? (rpm < 0.86 ? 1 : 0) : rel ? 1 : 0) - ANIM.relEnv) * Math.min(1, rdt * 9);
  const re = ANIM.relEnv, rk = ANIM.relKind;
  // working the pump or the bolt (weapons/casings.js has the beats): cp says where the action is and how hard it's jolting
  const cy = W8.cyc && W8.cyc.id === id ? W8.cyc : null, cq = cy ? clamp((cy.t - cy.delay) / cy.dur, 0, 1) : 0, cp = cy ? cyclePose(cy, cq) : null;
  // ---- the gun: lowered for switching, bandaging and crawlers, canted and brought in for reloads, pushed out by a shove
  const blade = ak ? 0 : H.blade * (1 - sw * 0.6);
  let pitch = 0.9 * sw + ANIM.pitch, yaw = 0, roll = idle * 0.5, ox = 0, oy = Math.sin(ph * 2) * 0.012 * Math.min(1, runF) * (1 - 0.6 * ads), oz = sh ? sh.push : 0;
  if (!ak && re > 0.001) {
    if (rk === 'mag' && id === 'revolver') { pitch -= 0.3 * re; roll += 0.35 * re; oz -= 0.07 * re; oy += 0.02 * re; }   // the speed loader: canted, open cylinder up, muzzle down a touch
    else if (rk === 'mag') { roll -= 0.5 * re; pitch -= 0.12 * re; yaw += 0.12 * re; oy += 0.04 * re; oz -= 0.08 * re; }
    else if (id === 'dbl') { pitch += 0.55 * re; oz -= 0.05 * re; }                       // broken open, muzzles down
    else if (id === 'revolver') { pitch -= 0.25 * re; roll += 0.35 * re; oz -= 0.06 * re; } // canted so the open cylinder faces up
    else { roll -= 0.45 * re; pitch -= 0.08 * re; oy -= 0.03 * re; oz -= 0.04 * re; }      // tipped to show the loading port
  }
  {
    // working the action: the rifle stays shouldered but rolls over to bring the handle up and dips as the bolt is torn
    // back; the pump's muzzle dips and the gun cants as the forend comes back. The gun follows on its loose spring, and
    // the stops knock it (CYC_FX in weapons/casings.js); the torso twists and rocks with it
    const t = _rackT; t.p = t.r = t.y = t.z = t.h = t.w = 0;
    if (cp && cy.bolt) { t.r = -0.13 * cp.grab - 0.05 * cp.lift; t.p = 0.04 * cp.off; t.y = 0.03 * cp.grab; t.z = -0.018 * cp.off; t.h = -0.012 * cp.grab; t.w = 0.04 * cp.off; }
    else if (cp) { t.r = 0.07 * cp.off; t.p = 0.06 * cp.off; t.z = -0.015 * cp.off; t.h = -0.012 * cp.off; t.w = -0.05 * cp.off; }
    stepRack(rdt, t);
    pitch += RACK.p; roll += RACK.r; yaw += RACK.y; oz += RACK.z; oy += RACK.h;
    up.y += RACK.w; up.x += 0.3 * RACK.p;
  }
  if (cg) { roll += 0.26 * cg; pitch -= 0.07 * cg + 0.05 * slamK; oy += 0.02 * cg; oz -= 0.03 * cg + 0.018 * pull - 0.012 * slamK; }   // canted over to reach the charging handle, tugged back with it, jolted as it slams home
  pitch += 0.35 * bk; ox += 0.06 * bk;                                                     // hangs at your side while you wrap up
  oy += 0.05 * ads; pitch -= 0.03 * ads; roll *= 1 - ads * 0.6;                            // aiming: up to the eye, steadier
  oz -= ak ? AK_PULL : H.pull;
  posePivot(gg, pitch, yaw, roll, X, 1.08, 0.1, ox, oy, oz, -blade);
  up.y += blade; pm.head.rotation.y = -blade * 0.9;
  // ---- one hold per hand: each gun kicks on its own shot; akimbo pistols run their own reload
  const sides = ak ? ['R', 'L'] : ['R'];
  for (const side of sides) {
    const h = HOLDS[s] && HOLDS[s][side]; if (!h) continue;
    const k = RK[side], g = H.grip, sg = side === 'R' ? 1 : -1;
    let hx = k.p, hz = k.r, hox = h.userData.x0 || 0, hoy = 0, hoz = k.z;
    if (ak && re > 0.001 && rk === 'mag') {
      // flick both mags out, drop the guns to the hip pouches to seat fresh ones, bring them back up
      const flick = Math.sin(clamp(rp / 0.2, 0, 1) * Math.PI), dip = Math.sin(clamp((rp - 0.22) / 0.6, 0, 1) * Math.PI);
      hx += -0.45 * flick + 1.1 * dip; hz += sg * 0.35 * flick; hoy -= 0.24 * dip; hoz -= 0.18 * dip; hox -= sg * 0.04 * dip;
    }
    if (ak && band && side === 'L') h.visible = false; else h.visible = true;   // the left gun goes in the belt while you bandage
    posePivot(h, hx, 0, hz, g[0], g[1], g[2], hox, hoy, hoz);
  }
  up.x -= ANIM.recoil * (heavy ? 0.06 : 0.03);
  ANIM.recoil = Math.max(0, ANIM.recoil - rdt * 11);
  // ---- moving parts: slides and bolts snap back on their own gun's shot, lock open when empty, ride the pump or bolt cycle
  const sl = SLIDES[s];
  if (sl && sl.length) {
    for (const q of sl) {
      const st = ANIM.slideT[q.side || 'R'];
      let off = st < 0.022 ? st / 0.022 : Math.max(0, 1 - (st - 0.022) / 0.07), held = false;
      if (q.cyc) {
        // the rifle's bolt stays open, handle up, while you feed it; otherwise the action follows the cycle
        const bolt = EJECT[id] === 'bolt', open = bolt && rel === 'shell';
        off = open ? 1 : cp ? cp.off : 0; held = open;
        if (bolt) { q.lift = (q.lift || 0) + ((open ? 1 : cp ? cp.lift : 0) - (q.lift || 0)) * (cp && !open ? 1 : Math.min(1, rdt * 14)); q.m.rotation.z = -BOLT_TURN * q.lift; }
      }
      else if (q.lock && (W8.mag[id] || 0) <= 0 && rel !== 'mag') { off = 1; held = true; }
      else if (q.lock && rel === 'mag' && CH) { off = rp < CH_SLAM ? 1 : 0; held = true; if (!off) q.off = 0; }   // back with the handle, then slammed home
      else if (q.lock && rel === 'mag') { off = W8.reloadT / W8.reloadMax > 0.12 ? 1 : 0; held = true; }
      // a slide locking back or dropping home after a reload eases there (fast going back, a softer run forward), never snaps
      if (held) { if (q.off === undefined) q.off = off; q.off += (off - q.off) * Math.min(1, rdt * (off > q.off ? 30 : 12)); off = q.off; } else q.off = off;
      q.m.position.z = q.z0 - q.travel * off; q.m.updateMatrix();
    }
  }
  // the magazine on the model: slides out as the reload starts, gone while the old one falls, a fresh one rises back in
  const mgs = MAGG[s] || [];
  if (mgs.length) {
    let md = 0, show = true;
    if (rel === 'mag') { const tOut = Math.min(0.3, 0.14 / Math.max(0.3, W8.reloadMax)); if (rpm < tOut) md = smooth(rpm / tOut) * 0.12; else if (rpm < 0.6) show = false; else md = 0.22 * (1 - smooth(clamp((rpm - 0.6) / 0.25, 0, 1))); }
    mgs.forEach(m => { m.visible = show; m.position.y = -md; });
    ANIM.magDrop = show ? md : 0.22;
  }
  // the charging handle: drawn back by the right hand and let go
  if (CHARGE[s]) { const c = CHARGE[s].m; c.position.z = -0.065 * pull; c.updateMatrix(); }
  // revolver: the cylinder swings out to the left for the whole reload and snaps shut after
  const cr = CRANE[s] || [];
  if (cr.length) { const want = rel === 'shell' || (rel === 'mag' && D.speedload && rp < SL_SHUT) ? 1 : 0; ANIM.crane = (ANIM.crane || 0) + (want - (ANIM.crane || 0)) * Math.min(1, rdt * (want ? 14 : 18)); cr.forEach(c => { c.rotation.z = ANIM.crane * 1.25; c.updateMatrix(); }); }
  // ---- hands: start from their places on the gun
  gunPt(_hR, s, 'R', H.grip[0], H.grip[1], H.grip[2]);
  if (ak) gunPt(_hL, s, 'L', H.grip[0], H.grip[1], H.grip[2]);
  else {
    let fz = H.fore[2];
    if (H.foreOnSlide && sl) { const q = sl.find(e => e.cyc); if (q) fz += q.m.position.z - q.z0; }   // the support hand rides the pump
    gunPt(_hL, s, 'R', H.fore[0], H.fore[1], fz);
  }
  // the firing hand: works the bolt by its knob on a bolt gun's cycle (both points are on the gun, so it never lags
  // behind it), coming up over the wrist on the way there and back
  if (cp && cy.bolt && sl) {
    const q = sl.find(e => e.cyc);
    if (q) { _p1.set(BOLT_KNOB[0] - 0.012, BOLT_KNOB[1] - 0.004, BOLT_KNOB[2]).applyMatrix4(q.m.matrix); gunPt(_p1, s, 'R', _p1.x, _p1.y, _p1.z); _hR.lerp(_p1, cp.grab); _hR.y += Math.sin(Math.PI * cp.grab) * 0.02 * (cq < 0.5 ? 1 : 0.6); }
  }
  // and the charging handle at the end of a rifle's reload: the right hand leaves the grip for it, pulls, lets go and
  // comes back
  if (cg > 0.001) { const at = CHARGE[s].at, hp = rp < CH_SLAM ? pull : drawn; gunPt(_p1, s, 'R', at[0], at[1] + 0.012, at[2] - 0.065 * hp); _hR.lerp(_p1, cg); _hR.y += Math.sin(Math.PI * cg) * 0.035; }   // over the top of the receiver on the way, and it stays back where it let go
  handTarget(_fR, 'R', _hR, null, 0, rdt);
  // the support hand: off the gun to fetch a mag or feed shells, or wrapping a bandage; on the gun the rest of the time
  if (!ak) {
    let free = null, wt = 0;
    if (band) { free = _p4.set(0.06 + Math.cos(now * 9) * 0.07, 0.9 + Math.sin(now * 9) * 0.05, 0.26); wt = 1; }
    else if (rel === 'mag' && D.speedload && cr.length) {
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
      _p2.copy(_p1); _p2.y -= 0.16; _p3.copy(_p1); _p3.y -= 0.22;
      free = walkPath(_p4, [[0, _hL], [0.12, _p1], [0.22, _p2], [0.42, POUCH], [0.6, _p3], [0.8, _p1], [0.9, _p1], [1, _hL]], rpm); wt = 1;
    } else if (rel === 'shell') {
      if (id === 'revolver' && cr.length) _p1.set(0.035, 0.045, -0.07).applyMatrix4(cr[0].matrix).applyMatrix4(holdOf(s, 'R').matrix).applyMatrix4(gg.matrix);   // the back of the open cylinder
      else { const pt = H.port || H.grip; gunPt(_p1, s, 'R', pt[0], pt[1], pt[2]); }
      _p2.copy(_p1); _p2.y -= 0.1; _p2.x -= 0.05;
      free = walkPath(_p4, [[0, POUCH], [0.45, _p2], [0.7, _p1], [0.86, _p1], [1, POUCH]], rp); wt = 1;
    }
    handTarget(_fL, 'L', _hL, free, wt, rdt);
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
  reach(pm.armR, 'R', _fR);
  if (ak && band) reach(pm.armL, 'L', _fL.set(0.06 + Math.cos(now * 9) * 0.07, 0.9 + Math.sin(now * 9) * 0.05, 0.26));
  else reach(pm.armL, 'L', _fL);
  pm.head.rotation.x += ANIM.pitch * 0.85 + ads * 0.1 + 0.35 * bk;
  pm.head.rotation.z -= ads * 0.13;   // and the head tips over onto the stock to look down the sights
  up.x += ANIM.pitch * 0.4 + ads * 0.05 + 0.18 * bk;
}
