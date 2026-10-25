// The fresh mag in the support hand: out of the pouch and along its way to the gun, the hand put where
// the mag is held (magInHand, magToFist).

import { V3 } from '../core/renderer.js';
import { clamp, smooth } from '../core/math.js';
import { W, W8 } from '../game/run-state.js';
import { flipOf, gunMeshes } from '../weapons/gun-materials.js';
import { MAG_SEAT, MISS_HIT } from '../weapons/reload.js';
import { armReach, HAND, holdOf, walkPath } from './hold.js';

export const POUCH = new V3(-0.21, 0.8, 0.16);   // the left hip pouch, in upper-body space: mags and shells come from here
export const POUCH_R = new V3(0.2, 0.84, 0.17);   // and on the right hip, the rifle's cartridges (the firing hand loads a bolt gun: player/hold.js)
// the fresh mag in the support hand: taken from the pouch at MAG_TAKE of the mag change, it rides in the fist (wrapped
// round it low on its left side, MAG_GRIP of the way down) along a swing of keys to the gun: drawn up out of the pouch,
// carried out and round, lined up under the well along the mag's own length, its edge hooked in, then rocked straight and
// pushed home as it seats (MAG_SEAT, when the reload hears it: weapons/reload.js). Its tip is keyed with it, so it turns
// as it goes rather than at the end. The way is worked out in the gun's own frame, so it stays with the gun as the reload
// rolls and tips it, and the hand is put where the mag is held: never off it
// how far the old mag slides down out of the well before it falls free (it speeds up all the way: weapons/casings.js
// carries that speed on into its fall)
export const MAG_SLIDE = 0.12;
export const MAG_TAKE = 0.42, MAG_GRIP = 0.68, MAG_DRAW = new V3(0.03, 0.08, 0.1);   // (out of the pouch: up and forward, clear of the shoulder)
// by reload style (W8.relStyle), after the pouch and the draw up out of it (the first key, at the pouch plus MAG_DRAW):
// [u, where the mag's top is off the well's mouth (x out to the right, y up, z forward, along the mag's own seated
// lean, so "below" is down a raked grip), its tip (x: top tipped forward, the foot back toward you; z: rolled)]
const MAG_WAY = [
  // swung out low to the left, brought in under the well, lined up with it and pushed straight up home
  [[0.16, null, [0.8, 0.5]], [0.44, [-0.17, -0.2, 0.08], [0.48, 0.42]], [0.7, [-0.03, -0.1, -0.012], [0.18, 0.1]], [0.86, [0, -0.03, -0.004], [0.08, 0.01]]],
  // brought round from in front, its front hooked into the well first, rocked back and slapped in
  [[0.16, null, [0.8, 0.5]], [0.42, [-0.13, -0.18, 0.2], [0.1, 0.34]], [0.7, [0, -0.048, 0.034], [-0.34, 0.05]], [0.87, [0, -0.012, 0.009], [-0.11, 0]]],
  // out wide and round from behind, its back hooked in first, rocked forward home
  [[0.16, null, [0.8, 0.5]], [0.44, [-0.21, -0.16, -0.17], [0.7, 0.42]], [0.7, [-0.02, -0.06, -0.045], [0.38, 0.08]], [0.87, [0, -0.013, -0.009], [0.12, 0]]]
];
// an AK mag (the battle rifle's AK kit): brought up in front of the well with its foot swung forward, its front lug
// hooked into the well first, then rocked back about it until the catch clicks
const AKM_WAY = [[0.16, null, [0.8, 0.5]], [0.44, [-0.12, -0.2, 0.16], [-0.3, 0.32]], [0.66, [0, -0.034, 0.024], [-0.48, 0.04]], [0.78, [0, -0.012, 0.009], [-0.22, 0]], [0.9, [0, -0.002, 0.001], [-0.03, 0]]];
// and the old one out: thumb on the paddle, the mag rocked forward about its front lug (AKM_ROCK, radians, its foot
// swinging forward) and pulled down out of the well (AKM_PULL) as it comes free; where that lug is in the gun (AKM_LUG)
export const AKM_ROCK = 0.5, AKM_PULL = 0.05, AKM_LUG = [1.094, 0.738];
const MAG_POUCH_TIP = [0.85, 0.5];   // how it's tipped in the pouch, in the gun's frame
// the ways above are laid out for a support hand on the gun's right: yours is on its left (the left hand: player/player.js),
// so they're mirrored across the gun as they're used (MIR on x and on the roll)
const MIR = -1;
const _mInv = new THREE.Matrix4(), _mM = new THREE.Matrix4(), _mE = new THREE.Euler(), _mQ = new V3(), _mG = new V3(), _mBox = new THREE.Box3(), _mV = new V3();
const _mK = [], _mTk = [], _mX = new V3(1, 0, 0);   // the way's keys: where the top is, its tip
// the mag's extent in the hold's frame as it sits in the gun: the middle of its top (where it goes into the well), how
// long and wide it is, and its lean (a pistol's raked grip; the straight top of a curved mag), forward of straight up
export function magShape(mg) {
  if (mg.userData.shape !== undefined) return mg.userData.shape;
  // (from its vertices, not the geometries' bounding boxes: those can be stale, from before a part was moved into place)
  mg.position.set(0, 0, 0); mg.rotation.set(0, 0, 0); mg.updateMatrixWorld(true); _mInv.copy(mg.matrixWorld).invert(); _mBox.makeEmpty();
  let main = null, mh = 0;
  mg.traverse(o => { if (!o.isMesh) return; _mM.multiplyMatrices(_mInv, o.matrixWorld); const ps = o.geometry.attributes.position, pts = [];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < ps.count; i++) { const q = new V3().fromBufferAttribute(ps, i).applyMatrix4(_mM); pts.push(q); _mBox.expandByPoint(q); lo = Math.min(lo, q.y); hi = Math.max(hi, q.y); }
    if (hi - lo > mh) { mh = hi - lo; main = { pts, top: hi, ix: o.geometry.index }; } });
  if (_mBox.isEmpty()) return (mg.userData.shape = null);
  const len = _mBox.max.y - _mBox.min.y;
  // its lean, from the body of it (the tallest part): the middle of its depth where it's cut across a little way down
  // from the top (below a raked top's slant and the feed lips) and a little further (a curved mag's straight top; a
  // pistol mag at its grip's rake)
  const mid = y => { let lo = Infinity, hi = -Infinity; const P = main.pts, I = main.ix, n = I ? I.count : P.length, at = i => P[I ? I.getX(i) : i];
    for (let i = 0; i + 2 < n; i += 3) for (let e = 0; e < 3; e++) { const a = at(i + e), b = at(i + (e + 1) % 3);
      if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) continue; const z = a.z + (b.z - a.z) * (y - a.y) / (b.y - a.y); lo = Math.min(lo, z); hi = Math.max(hi, z); }
    return lo <= hi ? (lo + hi) / 2 : null; };
  const t = main.top, za = mid(t - 0.18 * mh), zb = mid(t - 0.36 * mh), lean = za !== null && zb !== null ? clamp(Math.atan2(za - zb, 0.18 * mh), -0.6, 0.6) : 0;
  return (mg.userData.shape = { top: new V3((_mBox.min.x + _mBox.max.x) / 2, _mBox.max.y, za !== null ? za + Math.tan(lean) * 0.18 * mh : (_mBox.min.z + _mBox.max.z) / 2), len, w: _mBox.max.x - _mBox.min.x, lean });
}
// put the mag where it is at rpm of the mag change (between MAG_TAKE and MAG_SEAT) and return where the fist holding it
// is, in upper-body space (out); null when the gun has no mag of its own to carry
export function magInHand(out, s, H, mg, rpm) {
  const sh = magShape(mg); if (!sh) return null;
  const hq = holdOf(s, 'R'), lg = H.kind === 'long', way = W(W8.slot[s]) && W(W8.slot[s]).akKit ? AKM_WAY : MAG_WAY[W8.relStyle || 0] || MAG_WAY[0], k = lg ? 1 : 0.5, kp = lg ? 1 : 0.7;   // a handgun's tipped less, swung a little closer in
  const u = clamp((rpm - MAG_TAKE) / (MAG_SEAT - MAG_TAKE), 0, 1), P0 = sh.top, n = way.length + 2;
  _mM.multiplyMatrices(gunMeshes[s].matrix, hq.matrix); { const f = flipOf(hq); if (f) _mM.multiply(f.matrix); } _mInv.copy(_mM).invert();   // (the gun's own frame, flipped back: weapons/gun-materials.js)
  while (_mK.length < n) { _mK.push([0, new V3()]); _mTk.push([0, new V3()]); }
  // the grip (from the mag's top: low on its left side, down its lean) under a tip, and where the top is with that grip on p
  const grip = (o, ex, ez) => o.set(MIR * (-sh.w / 2 - 0.01), -sh.len * MAG_GRIP, 0).applyAxisAngle(_mX, sh.lean).applyEuler(_mE.set(ex, 0, ez));
  const topAt = (o, p, ex, ez) => o.copy(p).applyMatrix4(_mInv).sub(grip(_mG, ex, ez));
  // the keys: the pouch, drawn up out of it, the style's way (along the mag's lean, a handgun's closer in), home
  _mK[0][0] = 0; topAt(_mK[0][1], POUCH, MAG_POUCH_TIP[0] * k, MIR * MAG_POUCH_TIP[1] * k); _mTk[0][0] = 0; _mTk[0][1].set(MAG_POUCH_TIP[0] * k, MIR * MAG_POUCH_TIP[1] * k, 0);
  for (let i = 0; i < way.length; i++) {
    const [t, at, tip] = way[i], K = _mK[i + 1], TK = _mTk[i + 1];
    K[0] = TK[0] = t; TK[1].set(tip[0] * k, MIR * tip[1] * k, 0);
    if (!at) topAt(K[1], _mV.copy(POUCH).add(MAG_DRAW), TK[1].x, TK[1].y);
    else { K[1].set(MIR * at[0] * kp, at[1] * (lg ? 1 : 0.75), at[2] * kp).applyAxisAngle(_mX, sh.lean).add(P0); }
  }
  _mK[n - 1][0] = _mTk[n - 1][0] = 1; _mK[n - 1][1].copy(P0); _mTk[n - 1][1].set(0, 0, 0);
  _mK.length = _mTk.length = n;
  walkPath(_mQ, _mK, u); walkPath(_mV, _mTk, u);
  // (in the well it goes straight up it: MAG_FUNNEL)
  const kf = funnel(_mQ, P0, sh, lg);
  let ex = _mV.x * kf, ez = _mV.y * kf;
  // (a missed magwell: off the line and up into the lip, and back: magMiss)
  const g = W8.relSeg, miss = g && g.kind === 'miss' ? g : null;
  if (miss) { const t = magMiss(_mQ, P0, sh, lg, miss, W8.relSegK); ex += t * MAG_MISS_TIP[0] * miss.fwd; ez += t * MAG_MISS_TIP[1] * miss.side * MIR; }
  grip(_mG, ex, ez);   // (leaves _mE at this tip)
  // the group's own transform, so its contents (laid out in the hold's frame, seated) land at that top and tip
  mg.visible = true; mg.rotation.copy(_mE); mg.position.copy(P0).applyEuler(_mE).negate().add(_mQ);
  MAG_CARRY.u = u; MAG_CARRY.mg = mg; MAG_CARRY.p0 = P0; MAG_CARRY.sh = sh; MAG_CARRY.lg = lg; MAG_CARRY.miss = !!miss; MAG_CARRY.missK = miss ? W8.relSegK : 0;
  return out.copy(_mQ).add(_mG).applyMatrix4(_mM);
}
// then the mag goes where the fist really got to (a beat behind where it was sent, on its spring), so it's never out of
// it; over the last of the way (MAG_GUIDE on) the fist is drawn onto its mark instead, so the mag it carries seats exactly
export const MAG_CARRY = { u: -1, mg: null, p0: null, sh: null, lg: false, miss: false, missK: 0 }, MAG_GUIDE = 0.62, _mF = new V3();
// the well's mouth: how far below the seated mag's top it opens (a rifle's well, a handgun's whole grip: a share of the
// mag), and over how much more the mag's brought onto the well's line before it gets there (in). Once its top's into
// the well it's on that line exactly, nothing across and no tip, so it goes up the well and never through its sides
const MAG_FUNNEL = { long: 0.075, hand: 0.85, in: 0.035 };
// missing the well (weapons/reload.js: MAG_MISS): wherever the mag was when it went wrong, it's drawn back down out of
// the well to just under its mouth (pre: how far under), brought off the well's line (off: metres across and fore and
// aft, as each miss has it, side and fwd) and tipped a little with it (MAG_MISS_TIP, radians), pushed up into the
// mouth's lip (lip: how far short of the mouth it stops), gathering speed into the knock (MISS_HIT of the way through),
// knocked a little back down off it (bounce), then lined up again under the mouth and put back where it was. It's only
// ever off the line below the mouth, so it never goes through the side of the well
const MAG_MISS_OFF = [0.012, 0.009], MAG_MISS_TIP = [0.1, 0.07], MAG_MISS_V = { pre: 0.03, lip: 0.003, bounce: 0.008, clear: 0.002 };
const _mmL = new V3();
function magMiss(q, P0, sh, lg, m, k) {
  _fA.set(0, 1, 0).applyAxisAngle(_mX, sh.lean);
  const d0 = -_fD.subVectors(q, P0).dot(_fA), mouth = lg ? MAG_FUNNEL.long : sh.len * MAG_FUNNEL.hand, V = MAG_MISS_V, H = MISS_HIT;
  const pre = mouth + V.pre, hit = mouth + V.lip, back = 0.52, line = 0.8;
  let d, off;
  if (k < 0.25) { const u = smooth(k / 0.25); d = d0 + (pre - d0) * u; off = u; }   // down and off the line
  else if (k < H) { const u = (k - 0.25) / (H - 0.25); d = pre + (hit - pre) * u * u; off = 1; }   // up into the lip, quickening
  else if (k < back) { const u = (k - H) / (back - H); d = hit + V.bounce * Math.sin(Math.PI / 2 * u); off = 1; }   // knocked back off it
  else if (k < line) { const u = smooth((k - back) / (line - back)); d = hit + V.bounce + (pre - hit - V.bounce) * u; off = 1 - u; }   // lined up again
  else { const u = smooth((k - line) / (1 - line)); d = pre + (d0 - pre) * u; off = 0; }   // and on as it was
  off *= clamp((d - mouth) / V.clear, 0, 1);
  _mmL.set(MIR * m.side * MAG_MISS_OFF[0], 0, m.fwd * MAG_MISS_OFF[1]); _mmL.addScaledVector(_fA, -_mmL.dot(_fA));   // (across the well's line)
  q.addScaledVector(_fA, d0 - d).addScaledVector(_mmL, off);
  return off;
}
const _fA = new V3(), _fD = new V3();
// the mag's top (q, in the hold's frame) brought onto the well's line as it nears the mouth; how much of its own way
// across and its tip it keeps (1 below the funnel, 0 in the well)
function funnel(q, P0, sh, lg, zone = MAG_FUNNEL.in) {
  _fA.set(0, 1, 0).applyAxisAngle(_mX, sh.lean); _fD.subVectors(q, P0);
  const along = _fD.dot(_fA), mouth = lg ? MAG_FUNNEL.long : sh.len * MAG_FUNNEL.hand, k = smooth(clamp((-along - mouth) / zone, 0, 1));
  if (k >= 1) return 1;
  _fD.addScaledVector(_fA, -along).multiplyScalar(k);   // (what's across the line, kept only as much as k)
  q.copy(P0).addScaledVector(_fA, along).add(_fD);
  return k;
}
export function magToFist(fist, want) {
  const c = MAG_CARRY; if (c.u < 0 || !c.mg) return;
  // (through a missed well the fist's put on its mark exactly, eased on and off it, so the miss is the one it's sent
  // through, a hand's breadth off the well and no more)
  const mk = c.miss ? smooth(clamp(c.missK / 0.15, 0, 1)) * smooth(clamp((1 - c.missK) / 0.15, 0, 1)) : 0;
  const g = Math.max(mk, smooth(clamp((c.u - MAG_GUIDE) / (1 - MAG_GUIDE), 0, 1)));
  if (want && g > 0) { fist.lerp(want, g); HAND.L.free.lerp(want, g); }   // (its spring too, so it lets go of the mag where it is)
  armReach('L', fist);   // (and only as far as the arm goes)
  _mF.copy(fist).applyMatrix4(_mInv).sub(_mG);   // where its top is with the grip in the fist (in the hold's frame)
  // (and wherever the fist's got to, once it's up in the well it's on the well's line: the fist goes with it)
  if (funnel(_mF, c.p0, c.sh, c.lg, c.miss ? 1e-4 : MAG_FUNNEL.in) < 1) fist.copy(_mF).add(_mG).applyMatrix4(_mM);   // (missing the well: only in the well itself, so the miss keeps its way off the line under it)
  c.mg.position.copy(c.p0).applyEuler(_mE).negate().add(_mF);
  c.u = -1;
}
