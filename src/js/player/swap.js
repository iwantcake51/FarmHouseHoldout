// Swapping weapons. The right hand carries the one you're holding back to where it rides (the hip holster, the sling
// across the pack, the pack straps), crosses to where the next one is carried, draws it and brings it up into the hold,
// and the left hand comes back onto it last. Meanwhile the upper body and head ease from the old hold to the new one
// instead of snapping. The whole swap takes half a second.
//
// It runs every frame of a swap after the normal pose (player/animation.js, player/hold.js) and the stowed copies
// (player/stow.js) are placed, and moves the weapons and arms on from there; weapon frames are worked in the
// character's own frame so they travel with you as you move and turn.

const SWAP_T = { put: 0.16, cross: 0.25, end: 0.5 };   // the old weapon is away, the hand is at the new one, it's up
const SWAP_FIRE = 0.34;                                 // how soon you can use the weapon you're drawing
const SWAP_REST_L = new V3(-0.22, 0.84, 0.12);          // the left hand, off the weapons while the right one swaps
let swapSt = null;
const _sw = { m: new THREE.Matrix4(), toUp: new THREE.Matrix4(), a: new THREE.Matrix4(), b: new THREE.Matrix4(), c: new THREE.Matrix4(),
  p0: new V3(), p1: new V3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), s0: new V3(), s1: new V3(), h: new V3(), t: new V3(), t2: new V3(),
  liveL: new V3(), armQ: new THREE.Quaternion(), armP: new V3(), armS: new V3(), qa: new THREE.Quaternion(), qb: new THREE.Quaternion() };
// where an arm's fist is, in upper-body space (the arm is a straight block from the shoulder)
const fistOf = (arm, out) => out.set(0, 0, FIST * arm.scale.z).applyQuaternion(arm.quaternion).add(arm.position);
// a world matrix in the character's own frame
const toBody = (mw, out) => out.copy(PM.g.matrixWorld).invert().multiply(mw);
const isMelee = s => { const id = W8.slot[s]; return !!(id && WEAP[id] && WEAP[id].melee); };

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
  const s = swapSt = { from, to, t: 0, upQ: PM.upper.quaternion.clone(), headQ: PM.head.quaternion.clone(), oldW: null, lFist: fistOf(PM.armL, new V3()), rFist: fistOf(PM.armR, new V3()) };
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
  const t = st.t, T = SWAP_T;
  if (t >= T.end) { endSwap(); return; }
  const pm = PM, newMelee = isMelee(st.to), oldMelee = isMelee(st.from);
  // the body eases from the pose you had when the swap began to the new hold's
  { const e = smooth(clamp(t / T.end, 0, 1)); pm.upper.quaternion.copy(_sw.qa.copy(st.upQ).slerp(pm.upper.quaternion, e)); pm.head.quaternion.copy(_sw.qb.copy(st.headQ).slerp(pm.head.quaternion, e)); }
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
    const u = clamp((t - T.cross) / (T.end - T.cross), 0, 1), k = 1 - Math.pow(1 - smooth(u), 1.7);
    rigCarry(st.to, rigAt, liveP, k);
    armToward(pm.armR, rQ, rP, rS, u * u); armToward(pm.armL, lQ, lP, lS, u * u);
  } else if (stowNew) {
    // the draw: out of the holster or off the sling, up into the hold; the left hand comes on in the last stretch
    const u = clamp((t - T.cross) / (T.end - T.cross), 0, 1), k = 1 - Math.pow(1 - smooth(u), 1.7);   // out quick, settling gently
    const f = blendFrame(new THREE.Matrix4(), stowNew, live, k);
    if (newMelee) {
      armTo(pm.armR, 'R', gripAt(_sw.t, st.to, f), true); armToward(pm.armR, rQ, rP, rS, u * u); pm.armR.updateMatrixWorld(true);
      placeAt(gunMeshes.melee, f);
    } else {
      placeAt(gunMeshes[st.to], f);
      armTo(pm.armR, 'R', gripAt(_sw.t, st.to, f), false); armToward(pm.armR, rQ, rP, rS, u * u);
    }
    const kl = smooth(clamp((u - 0.45) / 0.55, 0, 1));
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
