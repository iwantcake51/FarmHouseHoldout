// Swapping weapons. The right hand carries the one you're holding back to where it rides (the hip holster, the sling
// across the pack, the pack straps), crosses to where the next one is carried, draws it and brings it up into the hold,
// and the left hand comes back onto it last. Meanwhile the upper body and head ease from the old hold to the new one
// instead of snapping. The whole swap takes half a second.
//
// It runs every frame of a swap after the normal pose (player/animation.js, player/hold.js) and the stowed copies
// (player/stow.js) are placed, and moves the weapons and arms on from there; weapon frames are worked in the
// character's own frame so they travel with you as you move and turn.

const isMelee = s => { const id = W8.slot[s]; return !!(id && WEAP[id] && WEAP[id].melee); };
const SWAP_T = { put: 0.16, cross: 0.25, end: 0.5 };   // the old weapon is away, the hand is at the new one, it's up (a melee weapon)
const SWAP_FIRE = 0.34;                                 // how soon you can use a melee weapon you're drawing
// a gun's draw takes longer, how long by where it rides (DRAW_T: from the hand closing on it to the hold), and it can
// fire DRAW_FIRE before it's all the way up
const DRAW_T = { side: 0.4, long: 0.6, auto: 0.55 }, DRAW_FIRE = 0.08;
const swapEnd = s => isMelee(s) || !DRAW_T[s] ? SWAP_T.end : SWAP_T.cross + DRAW_T[s];
const swapFire = s => isMelee(s) || !DRAW_T[s] ? SWAP_FIRE : swapEnd(s) - DRAW_FIRE;
const SWAP_REST_L = new V3(-0.22, 0.84, 0.12);          // the left hand, off the weapons while the right one swaps
let swapSt = null;
const _sw = { m: new THREE.Matrix4(), toUp: new THREE.Matrix4(), a: new THREE.Matrix4(), b: new THREE.Matrix4(), c: new THREE.Matrix4(),
  p0: new V3(), p1: new V3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), s0: new V3(), s1: new V3(), h: new V3(), t: new V3(), t2: new V3(),
  liveL: new V3(), armQ: new THREE.Quaternion(), armP: new V3(), armS: new V3(), qa: new THREE.Quaternion(), qb: new THREE.Quaternion() };
// where an arm's fist is, in upper-body space (the arm is a straight block from the shoulder)
const fistOf = (arm, out) => out.set(0, 0, FIST * arm.scale.z).applyQuaternion(arm.quaternion).add(arm.position);
// a world matrix in the character's own frame
const toBody = (mw, out) => out.copy(PM.g.matrixWorld).invert().multiply(mw);

// a pair of sidearms in the shoulder rig (player/stow.js): each hand draws the gun under the other arm, both at once
// (a cross draw), and puts it back there the same way. rigFrame is where that hand's gun rides (its copy's frame, in
// the character's frame), gunGrip the hand's place on a gun at frame f (upper-body space), placeHold puts one gun of
// the pair at a character-frame matrix
const rigPair = s => s === 'side' && !!STOW.side && !!STOW.side.userData.rig && !!(HOLDS.side && HOLDS.side.L);
const rigFrame = (side, out) => { const o = STOW.side; return toBody((side === 'R' ? o.userData.gun : o.userData.gun2).matrixWorld, out); };
function gunGrip(out, slot, f) { const gp = (HOLD[W8.slot[slot]] || HOLD_DEF).grip; return out.set(gp[0], gp[1], gp[2]).applyMatrix4(f).applyMatrix4(_sw.toUp); }
const _rg = new THREE.Matrix4(), _rf = new THREE.Matrix4();
function placeHold(h, f) { _rg.copy(h.parent.matrixWorld).invert().multiply(_rf.copy(PM.g.matrixWorld).multiply(f)); _rg.decompose(h.position, h.quaternion, h.scale); h.scale.set(1, 1, 1); h.updateMatrix(); h.updateMatrixWorld(true); }
// blendFrame about a point on the gun (gp, in its own frame: the grip) instead of its frame's origin, which is well off
// the gun, so a gun turned right round comes round in the hand rather than swinging out on a long arm
const _gpM = new THREE.Matrix4(), _gpI = new THREE.Matrix4();
function blendAbout(out, a, b, k, gp) {
  _gpM.makeTranslation(gp[0], gp[1], gp[2]); _gpI.makeTranslation(-gp[0], -gp[1], -gp[2]);
  return blendFrame(out, a.clone().multiply(_gpM), b.clone().multiply(_gpM), k).multiply(_gpI);
}
// both guns of a rig pair at k of the way from frames a[side] to b[side], each hand on its own
function rigCarry(slot, a, b, k) {
  const gp = (HOLD[W8.slot[slot]] || HOLD_DEF).grip;
  for (const sd of ['R', 'L']) {
    const f = blendAbout(new THREE.Matrix4(), a[sd], b[sd], k, gp);
    placeHold(HOLDS[slot][sd], f); armTo(sd === 'R' ? PM.armR : PM.armL, sd, gunGrip(_sw.t, slot, f), false);
  }
}
// from is null when there's nothing to put away (the weapon in your hands was just replaced): it's only drawn
function startSwap(from, to) {
  if (!gunMeshes[to]) return;
  if (!gunMeshes[from] || from === to) from = null;
  PM.g.updateMatrixWorld(true);
  const s = swapSt = { from, to, t: 0, end: swapEnd(to), upQ: PM.upper.quaternion.clone(), headQ: PM.head.quaternion.clone(), oldW: null, lFist: fistOf(PM.armL, new V3()), rFist: fistOf(PM.armR, new V3()) };
  const og = from && gunMeshes[from];
  if (og && W8.slot[from] && og.visible && STOW[from]) s.oldW = toBody(og.matrixWorld, new THREE.Matrix4());
  if (s.oldW && rigPair(from)) s.old = { R: toBody(HOLDS[from].R.matrixWorld, new THREE.Matrix4()), L: toBody(HOLDS[from].L.matrixWorld, new THREE.Matrix4()) };   // each gun of a pair from where it is
}
function endSwap() {
  if (!swapSt) return;
  gunMeshes.melee.position.set(0, 0, 0.5); SLOTS.forEach(s => gunMeshes[s].scale.set(1, 1, 1));   // back to where the poses expect them
  swapSt = null;
}
// the carried copy of a slot's weapon, in the character's frame
function stowFrame(slot, out) { const o = STOW[slot]; if (!o) return null; const copy = o.children[0] && o.children[0].children[0]; return copy ? toBody(copy.matrixWorld, out) : null; }
// a weapon's frame partway from a to b (character frame), swinging out from the body and up a little on the way
function blendFrame(out, a, b, k) {
  a.decompose(_sw.p0, _sw.q0, _sw.s0); b.decompose(_sw.p1, _sw.q1, _sw.s1);
  const p = _sw.p0.lerp(_sw.p1, k), arc = Math.sin(Math.PI * k);
  _sw.h.set(p.x, 0, p.z); const L = _sw.h.length(); if (L > 1e-4) p.addScaledVector(_sw.h, 0.06 * arc / L);
  p.y += 0.035 * arc;
  return out.compose(p, _sw.q0.slerp(_sw.q1, k), _sw.s1.set(1, 1, 1));
}
// a melee weapon coming off the pack: first slid out along its own handle (MDRAW_PULL, clear of the straps), then
// swung up and round in a higher arc than a gun's (MDRAW_ARC) toward the hand, easing in and out so it's lifted off
// rather than snatched. Where it's going moves (the flourish it runs on into: melee/melee-anim.js, MDRAW), so it
// arrives already moving with it. The weapon's turned from the pack toward there on the same side all the way (st.rel
// is last frame's turn): a weapon hanging point down turned nearly right over could otherwise flip to going round
// the other way as where it's going moves
const MDRAW_PULL = 0.26, MDRAW_ARC = 0.14;
const _mdT = new THREE.Matrix4(), _mdP = new V3(), _mdQ = new THREE.Quaternion(), _mdR = new THREE.Quaternion(), _mdO = new THREE.Quaternion(), _mdS = new V3();
function meleeDrawFrame(out, stow, live, u, st) {
  const pull = smooth(clamp(u / 0.35, 0, 1)), v = clamp((u - 0.06) / 0.94, 0, 1), k = v * v * (3 - 2 * v);
  blendFrame(out, stow.clone().multiply(_mdT.makeTranslation(0, -MDRAW_PULL * pull, 0)), live, k);
  stow.decompose(_mdP, _mdQ, _mdS); live.decompose(_mdP, _mdR, _mdS);
  const rel = _mdR.premultiply(_mdQ.clone().invert());   // (the turn from the pack to the hand, in the weapon's frame)
  if (!st.rel) st.rel = rel.clone(); else if (rel.dot(st.rel) < 0) rel.set(-rel.x, -rel.y, -rel.z, -rel.w);
  st.rel.copy(rel);
  const w = clamp(rel.w, -1, 1), ang = 2 * Math.acos(w), sn = Math.sqrt(1 - w * w);
  if (sn > 1e-5) { _mdS.set(rel.x / sn, rel.y / sn, rel.z / sn); rel.setFromAxisAngle(_mdS, ang * k); } else rel.identity();
  out.decompose(_mdP, _mdO, _mdS); out.compose(_mdP, _mdQ.multiply(rel), _mdS);
  out.elements[13] += MDRAW_ARC * Math.sin(Math.PI * v);
  return out;
}
// a gun's draw: not a straight blend from where it rides to the hold, which took a long gun straight through your
// chest and spun it round at over 1,000 degrees a second, but the way it's done. The pistol's lifted straight up out
// of the holster, rocked muzzle forward at your hip and pushed out into the hold. A long gun's pulled out past the
// pack's edge to your right, twisted in the hand while it hangs barrel down beside you (so the barrel never swings in
// across you), then swung muzzle forward into a low ready and raised to the shoulder. The automatic's pulled off the back, carried behind your right shoulder and up beside it
// muzzle up, then tipped forward and down into the hold.
// DRAW_KEYS: for each carry, the keys between where it rides and the hold: when it comes (u, through the draw); where
// the grip is ([x, y, z] off where it rides, 'at'; off the hold, 'hold'; or in the body frame, 'body': x right, y up,
// z forward); and how the gun's turned ([barrel, top] in the body frame, or a number: that much of the way from how it
// rides to the next key's turn). Grip and turn both run through the keys on smooth curves, starting and finishing at
// rest, so it never stops dead at one and never snaps
const DRAW_KEYS = {
  side: [[0.32, 'at', [0.025, 0.15, 0.0], 0.1], [0.62, 'at', [0.05, 0.25, 0.13], [[0, -0.15, 1], [0, 1, 0.15]]]],
  long: [[0.16, 'at', [0.14, 0.05, 0.02], 0], [0.45, 'at', [0.3, 0.1, 0.06], [[0.08, -1, 0.04], [-0.9, 0, 0.45]]], [0.74, 'hold', [0.22, -0.2, -0.12], [[0, -0.55, 0.84], [0, 0.84, 0.55]]]],
  auto: [[0.22, 'at', [0.12, 0.2, -0.3], 0.3], [0.46, 'body', [0.38, 1.05, -0.6], [[0.1, 0.95, -0.2], [0, -0.2, -0.98]]], [0.72, 'body', [0.44, 1.0, -0.06], [[0, 0.9, 0.4], [0, 0.4, -0.9]]]]
};
const DRAW_STEP = 3;
const _dk = { m: new THREE.Matrix4(), p: new V3(), q: new THREE.Quaternion(), s: new V3(), d: new V3(), u: new V3(), x: new V3(), g: new V3() };
const dkQ = (d, u) => { const D = _dk.d.set(d[0], d[1], d[2]).normalize(), U = _dk.u.set(u[0], u[1], u[2]); U.addScaledVector(D, -U.dot(D)).normalize(); return new THREE.Quaternion().setFromRotationMatrix(_dk.m.makeBasis(_dk.x.crossVectors(U, D), U, D)); };
// Hermite through keys (times ts, values as arrays), the tangents from the neighbours and nought at either end
function dkCurve(ts, vs, u, out) {
  let i = 0; while (i < ts.length - 2 && u > ts[i + 1]) i++;
  const t0 = ts[i], t1 = ts[i + 1], h = t1 - t0, s = clamp((u - t0) / h, 0, 1), s2 = s * s, s3 = s2 * s;
  const tan = j => j <= 0 || j >= ts.length - 1 ? null : vs[j + 1].map((v, c) => (v - vs[j - 1][c]) / (ts[j + 1] - ts[j - 1]));
  const m0 = tan(i), m1 = tan(i + 1);
  for (let c = 0; c < vs[i].length; c++) out[c] = (2 * s3 - 3 * s2 + 1) * vs[i][c] + (s3 - 2 * s2 + s) * h * (m0 ? m0[c] : 0) + (-2 * s3 + 3 * s2) * vs[i + 1][c] + (s3 - s2) * h * (m1 ? m1[c] : 0);
  return out;
}
function gunDrawFrame(out, slot, stow, live, u) {
  const K = DRAW_KEYS[slot]; if (!K) return blendFrame(out, stow, live, 1 - Math.pow(1 - smooth(u), 1.7));
  const gp = (HOLD[W8.slot[slot]] || HOLD_DEF).grip, G = m => new V3(gp[0], gp[1], gp[2]).applyMatrix4(m);
  const qOf = m => { m.decompose(_dk.p, _dk.q, _dk.s); return _dk.q.clone(); };
  const g0 = G(stow), g3 = G(live), q0 = qOf(stow), q3 = qOf(live);
  const ts = [0], ps = [g0.toArray()], qs = [q0];
  K.forEach(([t, ref, o, turn]) => { ts.push(t); const b = ref === 'at' ? g0 : ref === 'hold' ? g3 : _dk.g.set(0, 0, 0); ps.push([b.x + o[0], b.y + o[1], b.z + o[2]]); qs.push(turn); });
  ts.push(1); ps.push(g3.toArray()); qs.push(q3);
  // a turn given as a fraction is that much of the way from how it rides to the next turn that's given
  for (let i = 1; i < qs.length - 1; i++) if (!(qs[i] instanceof THREE.Quaternion)) {
    if (Array.isArray(qs[i])) { qs[i] = dkQ(qs[i][0], qs[i][1]); continue; }
    let j = i + 1; while (!(qs[j] instanceof THREE.Quaternion) && !Array.isArray(qs[j])) j++;
    const qn = qs[j] instanceof THREE.Quaternion ? qs[j] : dkQ(qs[j][0], qs[j][1]); qs[i] = q0.clone().slerp(qn, qs[i]);
  }
  // each turn on the same side as the last (q and -q are the same turn), so the curve goes the short way between them;
  // and each turn between two keys is split into DRAW_STEP even steps, so the curve (run through the quaternions'
  // components) stays on the true turn and doesn't speed up across the middle of a big one (always the same number:
  // a count that went by the angle would change the curve's shape from one frame to the next as the angle crossed over)
  const qt = [ts[0]], qa = [qs[0].toArray()];
  for (let i = 1; i < qs.length; i++) {
    const a = qs[i - 1], b = qs[i].clone(); if (a.dot(b) < 0) b.set(-b.x, -b.y, -b.z, -b.w); qs[i] = b;
    const n = DRAW_STEP;
    for (let k = 1; k <= n; k++) { qt.push(ts[i - 1] + (ts[i] - ts[i - 1]) * k / n); qa.push(a.clone().slerp(b, k / n).toArray()); }
  }
  const p = dkCurve(ts, ps, u, [0, 0, 0]), q = dkCurve(qt, qa, u, [0, 0, 0, 0]);
  _dk.q.fromArray(q).normalize(); _dk.p.fromArray(p);
  // the frame that puts the grip there, turned so
  return out.compose(_dk.p.sub(_dk.g.set(gp[0], gp[1], gp[2]).applyQuaternion(_dk.q)), _dk.q, _dk.s.set(1, 1, 1));
}
// put an object at a character-frame matrix, whatever its parent
function placeAt(o, bodyM) {
  _sw.m.copy(o.parent.matrixWorld).invert().multiply(_sw.c.copy(PM.g.matrixWorld).multiply(bodyM));
  _sw.m.decompose(o.position, o.quaternion, o.scale); o.scale.set(1, 1, 1); o.updateMatrix(); o.updateMatrixWorld(true);
}
// where the right hand holds a slot's weapon when the weapon sits at bodyM, in upper-body space
function gripAt(out, slot, bodyM) {
  const id = W8.slot[slot];
  if (isMelee(slot)) out.set(0, 0, 0);   // the melee models are built round the fist
  else { const gp = (HOLD[id] || HOLD_DEF).grip; out.set(gp[0], gp[1], gp[2]).applyMatrix4(holdOf(slot, 'R').matrix); }
  return out.applyMatrix4(bodyM).applyMatrix4(_sw.toUp);
}
// point an arm at a fist target; melee holds hang from the relaxed shoulder, guns from the shouldered one
function armTo(arm, side, t, melee) { reach(arm, side, t, 0, melee); arm.updateMatrix(); }
// ease an arm from where it is toward a saved pose by w
function armToward(arm, q, p, s, w) { arm.quaternion.slerp(q, w); arm.position.lerp(p, w); arm.scale.lerp(s, w); arm.updateMatrix(); }

function updateSwap(dt, rdt) {
  const st = swapSt; if (!st) return;
  if (P.dead || P.vault || P.shove || P.bandT > 0 || W8.cur !== st.to) { endSwap(); return; }
  st.t += dt > 0 ? rdt * S.swapMul : 0;   // it holds still while the game is paused (Quick draw speeds it up)
  const t = st.t, T = SWAP_T, end = st.end;
  if (t >= end) { endSwap(); return; }
  const pm = PM, newMelee = isMelee(st.to), oldMelee = isMelee(st.from);
  // the body eases from the pose you had when the swap began to the new hold's
  { const e = smooth(clamp(t / end, 0, 1)); pm.upper.quaternion.copy(_sw.qa.copy(st.upQ).slerp(pm.upper.quaternion, e)); pm.head.quaternion.copy(_sw.qb.copy(st.headQ).slerp(pm.head.quaternion, e)); }
  pm.g.updateMatrixWorld(true);
  _sw.toUp.copy(pm.upper.matrixWorld).invert().multiply(pm.g.matrixWorld);
  // the new weapon's held frame and the left hand's place on it, as the normal pose put them
  const live = toBody(gunMeshes[st.to].matrixWorld, _sw.a), liveL = fistOf(pm.armL, _sw.liveL);
  const rigTo = rigPair(st.to), rigFrom = !!st.old && rigPair(st.from);
  const liveP = rigTo ? { R: toBody(HOLDS[st.to].R.matrixWorld, new THREE.Matrix4()), L: toBody(HOLDS[st.to].L.matrixWorld, new THREE.Matrix4()) } : null;
  const rigAt = rigTo || rigFrom ? { R: rigFrame('R', new THREE.Matrix4()), L: rigFrame('L', new THREE.Matrix4()) } : null;
  const rQ = pm.armR.quaternion.clone(), rP = pm.armR.position.clone(), rS = pm.armR.scale.clone(), lQ = pm.armL.quaternion.clone(), lP = pm.armL.position.clone(), lS = pm.armL.scale.clone();
  const stowNew = stowFrame(st.to, _sw.b);
  // what shows where: the old weapon in the hand until it's put away, the new one on you until it's drawn
  const putting = t < T.put && st.oldW, drawing = t >= T.cross;
  if (st.from) { gunMeshes[st.from].visible = !!putting; showStowed(st.from, !putting); }
  gunMeshes[st.to].visible = drawing; showStowed(st.to, !drawing);
  if (putting && rigFrom) rigCarry(st.from, st.old, rigAt, smooth(t / T.put));   // each hand puts its gun back under the other arm
  else if (putting) {
    // the right hand carries the old weapon back to where it rides; the left lets go
    const stowOld = stowFrame(st.from, _sw.c.clone()), k = smooth(t / T.put);
    if (stowOld) {
      const f = blendFrame(new THREE.Matrix4(), st.oldW, stowOld, k);
      const t0 = gripAt(_sw.t, st.from, f);
      armTo(pm.armR, 'R', t0, oldMelee); pm.armR.updateMatrixWorld(true);
      placeAt(gunMeshes[st.from], f);
    }
    armTo(pm.armL, 'L', _sw.t2.copy(st.lFist).lerp(SWAP_REST_L, k), oldMelee);
  } else if (!drawing) {
    // the empty hand crosses from where the old weapon went to where the new one rides (with nothing to put away, as
    // you land a vault, it goes straight there)
    const t0 = st.from ? T.put : 0, k = smooth(clamp((t - t0) / (T.cross - t0), 0, 1));
    const from = st.oldW && stowFrame(st.from, _sw.c.clone()), a = rigFrom ? gunGrip(new V3(), st.from, rigAt.R) : from ? gripAt(new V3(), st.from, from) : st.rFist.clone();
    const b = rigTo ? gunGrip(new V3(), st.to, rigAt.R) : stowNew ? gripAt(new V3(), st.to, stowNew) : a;
    _sw.t.copy(a).lerp(b, k); _sw.t.z += 0.05 * Math.sin(Math.PI * k);
    armTo(pm.armR, 'R', _sw.t, newMelee);
    // the left hand: off the old weapon to its rest (from under the right arm, if it was a pair in the rig), or across
    // the chest to its own gun if the new one is
    const la = rigFrom ? gunGrip(new V3(), st.from, rigAt.L) : st.oldW ? SWAP_REST_L : st.lFist, lb = rigTo ? gunGrip(new V3(), st.to, rigAt.L) : SWAP_REST_L;
    _sw.t2.copy(la).lerp(lb, k); if (rigTo || rigFrom) _sw.t2.z += 0.05 * Math.sin(Math.PI * k);
    armTo(pm.armL, 'L', _sw.t2, newMelee);
  } else if (rigTo) {
    // the cross draw: both guns pulled forward out from under the arms and swung round onto the aim, the muzzles
    // sweeping out past your sides (the holsters turn them out a little, so that's the short way round)
    const u = clamp((t - T.cross) / (end - T.cross), 0, 1), k = 1 - Math.pow(1 - smooth(u), 1.7);
    rigCarry(st.to, rigAt, liveP, k);
    armToward(pm.armR, rQ, rP, rS, u * u); armToward(pm.armL, lQ, lP, lS, u * u);
  } else if (stowNew) {
    // the draw: out of the holster or off the sling, up into the hold; the left hand comes on in the last stretch
    const u = clamp((t - T.cross) / (end - T.cross), 0, 1);
    const f = newMelee ? meleeDrawFrame(new THREE.Matrix4(), stowNew, live, u, st) : gunDrawFrame(new THREE.Matrix4(), st.to, stowNew, live, u);
    if (newMelee) {
      armTo(pm.armR, 'R', gripAt(_sw.t, st.to, f), true); armToward(pm.armR, rQ, rP, rS, u * u); pm.armR.updateMatrixWorld(true);
      placeAt(gunMeshes.melee, f);
    } else {
      placeAt(gunMeshes[st.to], f);
      armTo(pm.armR, 'R', gripAt(_sw.t, st.to, f), false); armToward(pm.armR, rQ, rP, rS, u * u);
    }
    const kl = smooth(clamp((u - (newMelee ? 0.45 : 0.55)) / (newMelee ? 0.55 : 0.45), 0, 1));
    armTo(pm.armL, 'L', _sw.t2.copy(SWAP_REST_L).lerp(liveL, kl), newMelee); armToward(pm.armL, lQ, lP, lS, kl * kl);
  }
}
// bandaging (player/hold.js): before the hands come up to the wrap, the right hand carries the weapon back to where it
// rides, the same way a swap puts one away, and afterwards draws it again from there; bandP is how far it's gone (at 1
// it's away, and the copy on your body shows instead)
const _bs = new THREE.Matrix4();
function updateBandStow() {
  const k = ANIM.bandP || 0, s = W8.cur, g = gunMeshes[s];
  // the melee pose only turns the weapon in the fist (player/hold.js), so whatever this moved last frame goes back to
  // the fist first: the held frame it's carried from is then the real one, and it's back in the hand once it's drawn
  if (ANIM.bandMoved) { ANIM.bandMoved = false; gunMeshes.melee.position.set(0, 0, 0.5); SLOTS.forEach(q => gunMeshes[q].scale.set(1, 1, 1)); gunMeshes.melee.updateMatrix(); }
  if (k <= 0 || k >= 1 || swapSt || P.dead || P.vault || !g || !STOW[s]) return;
  ANIM.bandMoved = true;
  PM.g.updateMatrixWorld(true);
  _sw.toUp.copy(PM.upper.matrixWorld).invert().multiply(PM.g.matrixWorld);
  if (rigPair(s)) {   // a pair in the shoulder rig: each hand carries its gun back under the other arm
    const liveP = { R: toBody(HOLDS[s].R.matrixWorld, new THREE.Matrix4()), L: toBody(HOLDS[s].L.matrixWorld, new THREE.Matrix4()) };
    rigCarry(s, liveP, { R: rigFrame('R', new THREE.Matrix4()), L: rigFrame('L', new THREE.Matrix4()) }, smooth(k)); return;
  }
  const live = toBody(g.matrixWorld, _sw.a), stow = stowFrame(s, _sw.b); if (!stow) return;
  const e = smooth(k), f = blendFrame(_bs, live, stow, e), mel = isMelee(s);
  placeAt(g, f);
  armTo(PM.armR, 'R', gripAt(_sw.t, s, f), mel);
  armTo(PM.armL, 'L', _sw.t2.copy(fistOf(PM.armL, _sw.liveL)).lerp(SWAP_REST_L, e), mel);
}
