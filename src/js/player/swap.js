// Swapping weapons. The right hand carries the one you're holding back to where it rides (the thigh holster, the sling
// across the pack, the pack straps), crosses to where the next one is carried, draws it and brings it up into the hold,
// and the left hand comes back onto it last. Meanwhile the upper body and head ease from the old hold to the new one
// instead of snapping. The whole swap takes under half a second.
//
// It runs every frame of a swap after the normal pose (player/animation.js, player/hold.js) and the stowed copies
// (player/stow.js) are placed, and moves the weapons and arms on from there; weapon frames are worked in the
// character's own frame so they travel with you as you move and turn.

const SWAP_T = { put: 0.13, cross: 0.2, end: 0.42 };   // the old weapon is away, the hand is at the new one, it's up
const SWAP_FIRE = 0.3;                                  // how soon you can use the weapon you're drawing
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

// from is null when there's nothing to put away (the weapon in your hands was just replaced): it's only drawn
function startSwap(from, to) {
  if (!gunMeshes[to]) return;
  if (!gunMeshes[from] || from === to) from = null;
  PM.g.updateMatrixWorld(true);
  const s = swapSt = { from, to, t: 0, upQ: PM.upper.quaternion.clone(), headQ: PM.head.quaternion.clone(), oldW: null, lFist: fistOf(PM.armL, new V3()), rFist: fistOf(PM.armR, new V3()) };
  const og = from && gunMeshes[from];
  if (og && W8.slot[from] && og.visible && STOW[from]) s.oldW = toBody(og.matrixWorld, new THREE.Matrix4());
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
  st.t += dt > 0 ? rdt : 0;   // it holds still while the game is paused
  const t = st.t, T = SWAP_T;
  if (t >= T.end) { endSwap(); return; }
  const pm = PM, newMelee = isMelee(st.to), oldMelee = isMelee(st.from);
  // the body eases from the pose you had when the swap began to the new hold's
  { const e = smooth(clamp(t / T.end, 0, 1)); pm.upper.quaternion.copy(_sw.qa.copy(st.upQ).slerp(pm.upper.quaternion, e)); pm.head.quaternion.copy(_sw.qb.copy(st.headQ).slerp(pm.head.quaternion, e)); }
  pm.g.updateMatrixWorld(true);
  _sw.toUp.copy(pm.upper.matrixWorld).invert().multiply(pm.g.matrixWorld);
  // the new weapon's held frame and the left hand's place on it, as the normal pose put them
  const live = toBody(gunMeshes[st.to].matrixWorld, _sw.a), liveL = fistOf(pm.armL, _sw.liveL);
  const rQ = pm.armR.quaternion.clone(), rP = pm.armR.position.clone(), rS = pm.armR.scale.clone(), lQ = pm.armL.quaternion.clone(), lP = pm.armL.position.clone(), lS = pm.armL.scale.clone();
  const stowNew = stowFrame(st.to, _sw.b);
  // what shows where: the old weapon in the hand until it's put away, the new one on you until it's drawn
  const putting = t < T.put && st.oldW, drawing = t >= T.cross;
  if (st.from) { gunMeshes[st.from].visible = !!putting; if (STOW[st.from]) STOW[st.from].visible = !putting && !P.dead; }
  gunMeshes[st.to].visible = drawing; if (STOW[st.to]) STOW[st.to].visible = !drawing && !P.dead;
  if (putting) {
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
    // the empty hand crosses from where the old weapon went to where the new one rides
    const k = smooth(clamp((t - T.put) / (T.cross - T.put), 0, 1));
    const from = st.oldW && stowFrame(st.from, _sw.c.clone()), a = from ? gripAt(new V3(), st.from, from) : st.rFist.clone();
    const b = stowNew ? gripAt(new V3(), st.to, stowNew) : a;
    _sw.t.copy(a).lerp(b, k); _sw.t.z += 0.05 * Math.sin(Math.PI * k);
    armTo(pm.armR, 'R', _sw.t, newMelee);
    armTo(pm.armL, 'L', st.oldW ? SWAP_REST_L : _sw.t2.copy(st.lFist).lerp(SWAP_REST_L, k), newMelee);
  } else if (stowNew) {
    // the draw: out of the holster or off the sling, up into the hold; the left hand comes on in the last stretch
    const u = clamp((t - T.cross) / (T.end - T.cross), 0, 1), k = 1 - Math.pow(1 - u, 2.4);
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
