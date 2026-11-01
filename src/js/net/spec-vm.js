// Watching someone from their own eyes (net/avatars.js specFp): their arms and the weapon in their hands shown as your
// own first-person view shows yours (game/view-cam.js, player/hold.js). A bot sends only where its eyes are, so its
// gun and arms are put where your own sit from your own eyes for that weapon, from the hip, down the sights, at a run
// and mid-reload (SPEC_VM_POSE: recorded off your own view in the game, net/spec-vm-poses.js), eased from one to
// the next as it aims, sprints and reloads, breathing and bobbing with its stride as yours do. Every shot of theirs
// kicks the gun up and back in the hands (SVM_KICK, as your own does: game/view-cam.js FP_RECOIL), a pump's forend
// is racked with the support hand riding it and a bolt is worked by the trigger hand on its knob (the action cycling
// on their gun: net/arsenal.js arsenalFrame), the hands carried with the gun throughout (the arms reaching for where
// the fists are on it: player/hold.js reach). A player's own view sends their arms and gun as they are; only the kick's
// put on top of it, as the sent view eases over most of it
import { FP_CAM, V3 } from '../core/renderer.js';
import { clamp, smooth } from '../core/math.js';
import { FIST, HOLD, reach } from '../player/hold.js';
import { SLOTS } from '../weapons/slots.js';
import { WEAP } from '../weapons/gun-stats.js';
import { EJECT, remoteCycle } from '../weapons/casings.js';
import { BOLT_KNOB } from '../weapons/gun-models.js';
import { SPEC_VM_POSE } from './spec-vm-poses.js';
import { FPV } from '../game/view-cam.js';
import { SET } from '../ui/settings.js';

// how quickly it eases into and out of each (per second): down the sights and back, onto a run, into a reload; and
// how far a weapon coming out dips (m) and how quickly it's up
const SVM_EASE = { ads: 9, run: 7, rel: 6, swap: 4, dip: 0.22 };
// its breathing and stride: the gun's drift at rest (rad, and its rates), the bob with each step (m across and up, rad
// of roll) at a walk's pace, a share of it down the sights (ads)
const SVM_SWAY = { p: 0.006, y: 0.005, f: [1.6, 1.1], bob: [0.006, 0.005, 0.012], step: 2.1, walk: 3, ads: 0.3 };
// a shot's kick (as your own view's, game/view-cam.js FP_RECOIL): flip (rad) and shove back (m), plus as much again per
// unit of the gun's kick, about a pivot down and back from the grip (a handgun's at the wrists, a long gun's at the
// shoulder), on a spring (w: how quick, z: damped); a shotgun's flip the heaviest; down the sights a share of it
const SVM_KICK = {
  hand: { flip: 0.07, flipPw: 0.13, back: 0.024, backPw: 0.04, up: 0.006, w: 30, z: 0.66, pivot: [0, -0.07, -0.09] },
  long: { flip: 0.03, flipPw: 0.05, back: 0.026, backPw: 0.03, up: 0.004, w: 24, z: 0.7, pivot: [0, -0.05, -0.36] },
  shells: 1.55, ads: 0.5, player: 0.6
};
const _svm = new THREE.Matrix4(), _svm2 = new THREE.Matrix4(), _svwU = new THREE.Matrix4(), _svwG = new THREE.Matrix4(), _svgT = new THREE.Matrix4(), _svgI = new THREE.Matrix4(), _svk = new THREE.Matrix4();
const _svp = new V3(), _svq = new THREE.Quaternion(), _svs = new V3(), _svv = new V3(), _svv2 = new V3(), _sva = new V3(), _svb = new V3(), _svf = new V3(), _svq2 = new THREE.Quaternion(), _sve = new THREE.Euler();
const _svfist = { L: new V3(), R: new V3() }, _svfw = { L: new V3(), R: new V3() }, _svroll = { L: 0, R: 0 };
const _svbl = { u: [0, 0, 0, 0, 0, 0, 1], g: [0, 0, 0, 0, 0, 0, 1], l: [0, 0, 0, 0, 0, 0, 0, 0], r: [0, 0, 0, 0, 0, 0, 0, 0] };

// an object put at world matrix W (its own scale kept)
function svSetWorld(o, W) {
  o.parent.updateMatrixWorld(true); _svm2.copy(o.parent.matrixWorld).invert().multiply(W);
  const sx = o.scale.x, sy = o.scale.y, sz = o.scale.z; _svm2.decompose(o.position, o.quaternion, _svs); o.scale.set(sx, sy, sz); o.updateMatrixWorld(true);
}
// a pose's place and turn [x, y, z, qx, qy, qz, qw] blended toward another's by k
function svMix(out, a, b, k) {
  if (!b || k <= 0) { for (let i = 0; i < 7; i++) out[i] = a[i]; return out; }
  _svq.set(a[3], a[4], a[5], a[6]); _svq2.set(b[3], b[4], b[5], b[6]); _svq.slerp(_svq2, k);
  for (let i = 0; i < 3; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  out[3] = _svq.x; out[4] = _svq.y; out[5] = _svq.z; out[6] = _svq.w; return out;
}
const svMixArm = (out, a, b, k) => { for (let i = 0; i < 8; i++) out[i] = b && k > 0 ? a[i] + (b[i] - a[i]) * k : a[i]; return out; };
// where an arm's fist is in the upper body's frame (the arms are straight blocks from the shoulder: player/hold.js)
const svFist = (out, x, y, z, rx, ry, rz, sz) => out.set(0, 0, FIST * sz).applyEuler(_sve.set(rx, ry, rz)).add(_svv2.set(x, y, z));

// their gun's kick, stepped every frame and kicked by each shot (a.fire, net/avatars.js avShot): p (rad up), z (m back)
function svKickStep(a, rdt, kind) {
  const K = a.svk || (a.svk = { p: 0, vp: 0, z: 0, vz: 0 }), C = SVM_KICK[kind];
  const F = a.fire; if (F && !F.svk && F.t < 0.3) { F.svk = true; const D = WEAP[F.id] || {}, pw = F.k || 1, sh = D.ammo === 'shells' ? SVM_KICK.shells : 1;
    K.vp += (C.flip + C.flipPw * pw) * sh * C.w * 2; K.vz += (C.back + C.backPw * pw) * C.w * 2; }
  for (let n = Math.ceil(rdt / (1 / 240)), h = rdt / Math.max(1, n), i = 0; i < n; i++) {
    K.vp += (-C.w * C.w * K.p - 2 * C.z * C.w * K.vp) * h; K.p += K.vp * h;
    K.vz += (-C.w * C.w * K.z - 2 * C.z * C.w * K.vz) * h; K.z += K.vz * h;
  }
  return K;
}
// the kick as a move of the gun in its own frame: tipped up about the pivot behind the grip and shoved back
function svKickMat(out, K, grip, kind, k) {
  const C = SVM_KICK[kind], px = grip[0] + C.pivot[0], py = grip[1] + C.pivot[1], pz = grip[2] + C.pivot[2];
  out.makeTranslation(px, py, pz).multiply(_svm.makeRotationX(-K.p * k)).multiply(_svm.makeTranslation(-px, -py, -pz));
  return out.premultiply(_svm.makeTranslation(0, C.up * K.p / Math.max(1e-3, C.flip) * k * 0.5, -K.z * k));
}
// the action worked after a shot (net/arsenal.js arsenalFrame racks it): how far the support hand rides a pump's
// forend back (a world move), and how far the trigger hand's gone to a bolt's knob (0 to 1)
function svAction(h, id, a, s) {
  const out = { fore: null, bolt: 0, knob: null };
  const q = h.rec && h.rec.slides && h.rec.slides.find(e => e.cyc); if (!q) return out;
  q.m.updateMatrixWorld(true);
  if ((HOLD[id] || {}).foreOnSlide) { const dz = q.m.position.z - q.z0; if (Math.abs(dz) > 1e-4) { _svv.set(0, 0, dz).applyMatrix3(new THREE.Matrix3().setFromMatrix4(q.m.parent.matrixWorld)); out.fore = _svv; } }
  const F = a.fire; if (EJECT[id] === 'bolt' && F && F.s === s) {
    const cp = F.cyc && remoteCycle(F.cyc, F.t); out.bolt = cp ? cp.grab : 0;   // (the hand to the knob and back as your own goes, weapons/casings.js cyclePose)
    if (out.bolt > 0) out.knob = _svb.set(BOLT_KNOB[0], BOLT_KNOB[1], BOLT_KNOB[2]).applyMatrix4(q.m.matrixWorld);
  }
  return out;
}
// the held weapon of theirs that's out: its slot, its id, and what it's built as (net/arsenal.js)
function svHeld(p, a) {
  const e = p.wp && p.wp[0], s = e && SLOTS[e[0]], h = s && a.held && a.held[s], id = h && (h.id || (p.lo && p.lo.slots && p.lo.slots[s]));   // (what's built on them: a new loadout's guns can be a frame or two behind it, net/arsenal.js LO_Q)
  return h && id && h.g.visible !== false ? { s, h, id, D: WEAP[id] || {} } : null;
}
// a gun's sight line on their copy of it (its optic's, or its iron sights'), in the world: _sva the back, _svb the front
function svSight(h) {
  let opt = null, ir = null; h.g.traverse(o => { if (!opt && o.userData.optic) opt = o; if (!ir && o.userData.irons && o.userData.irons.yf !== undefined) ir = o; });
  const o = opt || ir; if (!o) return false;
  o.updateMatrixWorld(true);
  if (opt) { const O = opt.userData.optic; _sva.set(O.x, O.y, O.zr); _svb.set(O.x, O.y, O.zf); }
  else { const I = ir.userData.irons, X0 = HOLD.ar.grip[0]; _sva.set(X0, I.yr, I.rz); _svb.set(X0, I.yf, I.fz); }
  _sva.applyMatrix4(o.matrixWorld); _svb.applyMatrix4(o.matrixWorld); return true;
}

// a bot watched from its own eyes, the camera already at them (FP_CAM): its upper body, arms and gun put where yours sit
// from your own eyes with that weapon. Returns whether it could (a weapon with a recorded pose out)
export function specVm(p, a, rdt) {
  const H = svHeld(p, a), T = H && SPEC_VM_POSE[H.id]; if (!T) return false;
  const { h, id, D } = H, S = a.svm || (a.svm = { id: '', ads: 0, run: 0, rel: 0, sw: 0, ph: 0, t: 0 });
  // (a weapon just out: drawn up into view from low down)
  if (S.id !== id) { if (S.id) S.sw = 1; S.id = id; }
  S.sw = Math.max(0, S.sw - rdt * SVM_EASE.swap); S.t += rdt;
  const sp = Math.hypot(p.vx || 0, p.vz || 0), fc = p.fc, rel = !!(p.am && p.am[3] > 0) && !!T.rel, run = !fc && sp > 3.2 && !rel && !!T.run, ads = !!fc && fc[3] > 0.5 && fc[0] >= 0.5 && !rel && !run && !!T.ads;
  const ease = (k, on, r) => { S[k] += ((on ? 1 : 0) - S[k]) * (1 - Math.exp(-rdt * r)); return S[k] < 1e-3 ? 0 : S[k]; };
  const wa = ease('ads', ads, SVM_EASE.ads), wr = ease('run', run, SVM_EASE.run), wl = ease('rel', rel, SVM_EASE.rel);
  // the poses blended: from the hip, toward down the sights, a run, a reload
  const U = svMix(_svbl.u, T.hip[0], T.ads && T.ads[0], wa), G = svMix(_svbl.g, T.hip[1], T.ads && T.ads[1], wa), L = svMixArm(_svbl.l, T.hip[2], T.ads && T.ads[2], wa), R = svMixArm(_svbl.r, T.hip[3], T.ads && T.ads[3], wa);
  for (const [st, w] of [[T.run, wr], [T.rel, wl]]) { if (!st || w <= 0) continue; svMix(U, U.slice(), st[0], w); svMix(G, G.slice(), st[1], w); svMixArm(L, L.slice(), st[2], w); svMixArm(R, R.slice(), st[3], w); }
  // its breathing and stride, less down the sights; and a weapon coming out dipped
  const sw = 1 - SVM_SWAY.ads * wa - 0.5 * wr, walk = clamp(sp / SVM_SWAY.walk, 0, 1.3); S.ph = (S.ph + rdt * sp * SVM_SWAY.step) % (Math.PI * 4);
  const B = SVM_SWAY.bob, t = S.t, dip = SVM_EASE.dip * smooth(S.sw);
  _sve.set(SVM_SWAY.p * Math.sin(t * SVM_SWAY.f[0]) * sw - dip * 1.6, SVM_SWAY.y * Math.sin(t * SVM_SWAY.f[1] + 0.7) * sw, B[2] * Math.sin(S.ph) * walk * sw, 'YXZ');
  _svq.set(U[3], U[4], U[5], U[6]).premultiply(_svq2.setFromEuler(_sve));
  _svp.set(U[0] + B[0] * Math.sin(S.ph) * walk * sw, U[1] - B[1] * Math.abs(Math.sin(S.ph)) * walk * sw - dip, U[2]);
  FP_CAM.updateMatrixWorld(true);
  _svwU.compose(_svp, _svq, _svs.set(T.us[0], T.us[1], T.us[2])).premultiply(FP_CAM.matrixWorld);
  // the gun in the upper body's frame, and kicked by their shots
  const kind = (HOLD[id] || {}).kind === 'long' || (D.slot !== 'side' && !D.melee) ? 'long' : 'hand', grip = (HOLD[id] || HOLD.pistol).grip;
  const K = svKickStep(a, rdt, kind);
  _svgT.compose(_svp.set(G[0], G[1], G[2]), _svq.set(G[3], G[4], G[5], G[6]), _svs.set(1, 1, 1));
  _svwG.multiplyMatrices(_svwU, _svgT); if (!D.melee) _svwG.multiply(svKickMat(_svk, K, grip, kind, 1 - (1 - SVM_KICK.ads) * wa));
  // down the sights, the sight they have on it (an optic sits higher than the iron sights it was recorded with) brought
  // onto the line from the eye straight down the view, the whole of the upper body with it
  if (wa > 0.01 && !D.melee && !D.akimbo) {
    const hr = h.holds && h.holds.R; if (hr) { svSetWorld(h.g, _svm.copy(_svwG).multiply(_svm2.copy(hr.matrix).invert())); }
    if (svSight(h)) {
      FP_CAM.getWorldPosition(_svv); FP_CAM.getWorldDirection(_svf); _svv2.subVectors(_svb, _sva).normalize();
      _svq.setFromUnitVectors(_svv2, _svf); _svq2.identity().slerp(_svq, wa);
      _svv2.copy(_sva).sub(_svv); const along = _svv2.dot(_svf); _svv2.copy(_svv).addScaledVector(_svf, along);   // (the back of the line, onto the view's middle at the depth it's at)
      _svm.makeTranslation(-_sva.x, -_sva.y, -_sva.z).premultiply(_svm2.makeRotationFromQuaternion(_svq2)).premultiply(_svm2.makeTranslation(_sva.x + (_svv2.x - _sva.x) * wa, _sva.y + (_svv2.y - _sva.y) * wa, _sva.z + (_svv2.z - _sva.z) * wa));
      _svwU.premultiply(_svm); _svwG.premultiply(_svm);
    }
  }
  svSetWorld(a.upper, _svwU);
  { const hr = !D.melee && h.holds && h.holds.R; svSetWorld(h.g, hr ? _svm.copy(_svwG).multiply(_svm2.copy(hr.matrix).invert()) : _svwG); }
  // the hands where they were on the gun as recorded, carried with it (kicked, dipped, sighted), into the arms
  _svgI.copy(_svgT).invert();
  svFist(_svfist.L, L[0], L[1], L[2], L[3], L[4], L[5], L[7]); svFist(_svfist.R, R[0], R[1], R[2], R[3], R[4], R[5], R[7]); _svroll.L = L[5]; _svroll.R = R[5];
  for (const sd of ['L', 'R']) _svfw[sd].copy(_svfist[sd]).applyMatrix4(_svgI).applyMatrix4(_svwG);
  svArms(a, h, id, H.s, D.melee);
  return true;
}
// the arms reaching for _svfw (world), the action worked on top (a pump's forend, a bolt's knob)
function svArms(a, h, id, s, melee) {
  if (!melee) { const A = svAction(h, id, a, s); if (A.fore) _svfw.L.add(A.fore); if (A.bolt > 0) _svfw.R.lerp(A.knob, A.bolt); }
  a.upper.updateMatrixWorld(true); _svm.copy(a.upper.matrixWorld).invert();
  for (const sd of ['L', 'R']) { const arm = sd === 'L' ? a.armL : a.armR; reach(arm, sd, _svv.copy(_svfw[sd]).applyMatrix4(_svm), _svroll[sd]); arm.updateMatrixWorld(true); }
}
// a player watched from their own eyes (their arms and gun already as they sent them: net/avatars.js specFp): each of
// their shots kicking the gun in their hands too (a share of it, SVM_KICK.player), the hands carried with it
export function specKick(p, a, rdt) {
  const H = svHeld(p, a); if (!H || H.D.melee || H.D.akimbo) return;
  const { h, id, D } = H, kind = (HOLD[id] || {}).kind === 'long' || D.slot !== 'side' ? 'long' : 'hand', K = svKickStep(a, rdt, kind);
  if (Math.abs(K.p) < 1e-4 && Math.abs(K.z) < 1e-4) return;
  const hr = h.holds && h.holds.R; if (!hr) return;
  h.g.updateMatrixWorld(true); a.upper.updateMatrixWorld(true);
  _svwG.multiplyMatrices(h.g.matrixWorld, hr.matrix); _svgI.copy(_svwG).invert();
  for (const sd of ['L', 'R']) { const arm = sd === 'L' ? a.armL : a.armR; svFist(_svfw[sd], arm.position.x, arm.position.y, arm.position.z, arm.rotation.x, arm.rotation.y, arm.rotation.z, arm.scale.z).applyMatrix4(a.upper.matrixWorld).applyMatrix4(_svgI); _svroll[sd] = arm.rotation.z; }
  _svwG.multiply(svKickMat(_svk, K, (HOLD[id] || HOLD.pistol).grip, kind, SVM_KICK.player * (1 - (1 - SVM_KICK.ads) * clamp(p.fc ? p.fc[3] : 0, 0, 1))));
  svSetWorld(h.g, _svm.copy(_svwG).multiply(_svm2.copy(hr.matrix).invert()));
  for (const sd of ['L', 'R']) _svfw[sd].applyMatrix4(_svwG);
  a.upper.updateMatrixWorld(true); _svm.copy(a.upper.matrixWorld).invert();
  for (const sd of ['L', 'R']) { const arm = sd === 'L' ? a.armL : a.armR; reach(arm, sd, _svv.copy(_svfw[sd]).applyMatrix4(_svm), _svroll[sd]); arm.updateMatrixWorld(true); }
}
// how wide a bot's eyes see, as yours do: drawn in down the sights, a touch wider at a run (game/view-cam.js FPV)
export const specVmFov = a => { const S = a.svm || {}; return (SET.fov || 75) * (1 - FPV.ads * (S.ads || 0)) * (1 + FPV.sprint * (S.run || 0)); };
// seen from anyone else's view (not from its eyes): a bot's support hand riding its pump's forend back as it's racked,
// and its trigger hand going to its bolt's knob, as a player's own hands do (its pose only sends where its arms are held)
export function avatarAction(p, a) {
  const H = svHeld(p, a); if (!H || H.D.melee || !H.h.rec) return;
  const A = svAction(H.h, H.id, a, H.s); if (!A.fore && !(A.bolt > 0)) return;
  a.upper.updateMatrixWorld(true);
  for (const sd of ['L', 'R']) { const arm = sd === 'L' ? a.armL : a.armR; svFist(_svfw[sd], arm.position.x, arm.position.y, arm.position.z, arm.rotation.x, arm.rotation.y, arm.rotation.z, arm.scale.z).applyMatrix4(a.upper.matrixWorld); _svroll[sd] = arm.rotation.z; }
  svArms(a, H.h, H.id, H.s, false);
}
