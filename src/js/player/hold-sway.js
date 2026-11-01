// Things hung off a gun that swing with it: a belt-fed gun's belt (stepBelt, beltKick) and the bipod's legs (bipodSway).

import { V3 } from '../core/renderer.js';
import { clamp, rr } from '../core/math.js';
import { SLOTS } from '../weapons/slots.js';
import { W8 } from '../game/run-state.js';
import { BELT, BIPOD, flipOf, gunMeshes, X } from '../weapons/gun-materials.js';
import { BELT_SIM, BELT_TRAY, beltShift, beltState, beltStep } from '../weapons/belt.js';
import { holdOf } from './hold.js';

// a belt-fed gun's belt (weapons/belt.js: a chain of linked rounds, simulated). The gun in your hands notes its belt
// each frame as it's posed (beltJiggle, from player/hold.js, with how many of its rounds are left to show), and once
// the frame's done moving it (the view's put your eye on its sights, game/view-cam.js) the belt's stepped (stepBelt,
// from game/visuals.js) at its fixed rate, in the gun's frame: it feels as much of the gun's motion through space as
// INERTIA says (all of it would be a real belt's; the view's quick turns swung it about more than looked right), the
// gun's frame jumping more than JUMP in a frame (a respawn, a view swapped) taken as no motion at all. Every shot
// pulls it a link on into the gun (beltKick, from weapons/firing.js: over ADV_T seconds, the next round taking the
// port). In a reload the feed cover's opened as the old box comes off (the belt let go of), the fresh box comes up
// with its end lying loose in it, and once it's on the end's laid over onto the tray and drawn into the port (LAY:
// over t seconds, lifted up over the box's lip, onto the tray's edge, then in)
const BELT_RUN = { INERTIA: 0.6, JUMP: 0.5, MOVE: 0.008, ADV_T: 0.045, LAY: { t: 0.42, up: 0.026, at: [0.5, 0.72] } };
export const BJ = { on: false, seen: false, belt: null, h: null, nh: 0, S: null, acc: 0, adv: -1, td: [0, 1], feed: 'pin', lay: 0, lay0: [0, 0, 0], hid: false,
  M: new THREE.Matrix4(), Mi: new THREE.Matrix4(), D: new THREE.Matrix4(), B: new THREE.Matrix4(), Bi: new THREE.Matrix4(), Bp: new THREE.Matrix4(), Bc: new THREE.Matrix4(), seated: true };
export function beltJiggle(belt, h) { BJ.seen = true; BJ.belt = belt; BJ.h = h; let n = 0; for (const r of belt) if (r.visible) n++; BJ.nh = n; }
// a shot: the last pull finished (if a quick one's come before it was), and the next begun
// (the far end drawn on along the way the belt leaves it, td: up out of the stack, or along the floor of the box, as
// the belt lies there)
export function beltKick() { if (!BJ.on || BJ.feed !== 'pin' || !BJ.S) return; if (BJ.adv >= 0) beltShift(BJ.S, beltTail(1)); BJ.adv = 0; beltTailDir(); }
function beltTailDir() { const S = BJ.S, G = BJ.belt.geo, i = (S.n - 2) * 3, dx = S.p[i] - G.pin[0], dy = S.p[i + 1] - G.pin[1], d = Math.hypot(dx, dy); if (BJ.seated && d > 1e-4) { BJ.td[0] = dx / d; BJ.td[1] = dy / d; } else { BJ.td[0] = 0; BJ.td[1] = 1; } }
const _blT = new V3(), _blQ = new THREE.Quaternion(), _blQ2 = new THREE.Quaternion(), _blZ = new V3(0, 0, 1), _blG = [0, 0, 0], _blA = [0, 0, 0], _blF = [0, 0, 0];
// where the belt's far end comes out of the stack in the box (a share u of a link on), in the gun's frame
function beltTail(u) { const G = BJ.belt.geo; _blT.set(G.pin[0] + u * BELT_SIM.pitch * BJ.td[0], G.pin[1] + u * BELT_SIM.pitch * BJ.td[1], G.z); if (!BJ.seated) _blT.applyMatrix4(BJ.B); _blA[0] = _blT.x; _blA[1] = _blT.y; _blA[2] = _blT.z; return _blA; }
// the belt as it settled (rest: in its tray; loose: lying in its box), put where its box is now
function beltReset(loose) {
  const belt = BJ.belt, G = belt.geo, R = loose ? G.loose : G.rest, S = BJ.S && BJ.S.n === R.length ? BJ.S : (BJ.S = beltState(R.length));
  R.forEach((r, k) => { S.in[k] = r[0] > G.bx0 && r[0] < G.bx1 && r[1] < G.bt ? 1 : 0; _blT.set(r[0], r[1], r[2]); if (!BJ.seated) _blT.applyMatrix4(BJ.B); for (const a of [S.p, S.o, S.q]) { a[k * 3] = _blT.x; a[k * 3 + 1] = _blT.y; a[k * 3 + 2] = _blT.z; } });
  S.tr.fill(0); BJ.feed = loose ? 'free' : 'pin'; BJ.adv = -1; BJ.acc = 0; S.belt = belt;
}
const beltEase = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
// the end of the belt being laid on the tray: from where it was, up over the lip to above the tray's edge, down onto
// it, and in to the port
function beltLayAt(u) {
  const G = BJ.belt.geo, P2 = BELT_SIM.pitch, L = BELT_RUN.LAY, a = L.at, e = G.x0 + P2, s = BJ.lay0;
  if (u < a[0]) { const k = beltEase(u / a[0]); _blF[0] = s[0] + (e - s[0]) * k; _blF[1] = s[1] + (G.y + L.up - s[1]) * Math.sin(k * Math.PI / 2); }
  else if (u < a[1]) { const k = beltEase((u - a[0]) / (a[1] - a[0])); _blF[0] = e; _blF[1] = G.y + L.up * (1 - k); }
  else { const k = beltEase((u - a[1]) / (1 - a[1])); _blF[0] = e - P2 * k; _blF[1] = G.y; }
  _blF[2] = G.z; return _blF;
}
const _blV = new V3(), _blW = new V3();
// every frame (game/visuals.js), once the gun's where it'll be drawn: the belt of the gun in your hands stepped on and
// shown (its rounds where the chain has them, each turned along it; only as many as are left)
export function stepBelt(rdt) {
  if (!BJ.seen || !BJ.belt || !BJ.belt.geo) { BJ.on = false; BJ.seen = false; return; }
  BJ.seen = false;
  const belt = BJ.belt, G = belt.geo, N = belt.length, mg = belt[0].parent, fg = flipOf(BJ.h) || BJ.h, s = SLOTS.find(k => BELT[k] === belt), id = s && W8.slot[s];
  if (!mg || !id) return;
  // the box's frame: seated, or off the gun (sliding off, carried up from the pouch)
  mg.updateMatrix(); BJ.seated = mg.position.lengthSq() < 1e-10 && Math.abs(mg.rotation.x) + Math.abs(mg.rotation.y) + Math.abs(mg.rotation.z) < 1e-6;
  if (!BJ.seated) { BJ.B.copy(mg.matrix); BJ.Bi.copy(mg.matrix).invert(); }
  if (!mg.visible) { BJ.hid = true; return; }   // (between the old box gone and the fresh one out of the pouch: nothing to show)
  fg.updateWorldMatrix(true, false);
  if (!BJ.on || !BJ.S || BJ.S.belt !== belt) { beltReset(false); BJ.on = true; BJ.hid = false; BJ.M.copy(fg.matrixWorld); BJ.Bp.copy(BJ.seated ? BJ.Bc.identity() : BJ.B); }
  else if (BJ.hid) { BJ.hid = false; beltReset(!BJ.seated); BJ.M.copy(fg.matrixWorld); BJ.Bp.copy(BJ.seated ? BJ.Bc.identity() : BJ.B); }   // a fresh box
  const S = BJ.S, P2 = BELT_SIM.pitch, rel = W8.reloading === 'mag';
  // the feed cover: opened as the box comes off in a reload, the belt laid back in once the fresh one's on
  if (BJ.feed === 'pin' && rel && !BJ.seated) { BJ.feed = 'free'; if (BJ.adv >= 0) { beltShift(S, beltTail(1)); BJ.adv = -1; } }
  if (BJ.feed === 'free' && BJ.seated) { BJ.feed = 'lay'; BJ.lay = 0; BJ.lay0[0] = S.p[0]; BJ.lay0[1] = S.p[1]; BJ.lay0[2] = S.p[2]; }
  if (rdt > 0) {
    // the gun's motion this frame, felt as the belt's own inertia (as much as INERTIA): each round left where it was in
    // the world, that much of the way, by how far the gun's moved and turned under it
    BJ.Mi.copy(fg.matrixWorld).invert(); BJ.D.multiplyMatrices(BJ.Mi, BJ.M); BJ.M.copy(fg.matrixWorld);
    _blV.set(G.x0, G.y, G.z); _blW.copy(_blV).applyMatrix4(BJ.D);
    const jump = _blW.distanceTo(_blV) > BELT_RUN.JUMP, K = jump ? 0 : BELT_RUN.INERTIA, MV = BELT_RUN.MOVE;
    // (and the belt goes with its box as the box is moved, whatever of it isn't still on the tray: left behind, what
    // hung out over the lip was dragged down outside the box's wall while the rest was in it)
    const Bn = BJ.seated ? _blM.identity() : _blM.copy(BJ.B), boxMoved = !Bn.equals(BJ.Bp); _blM2.copy(BJ.Bp).invert(); BJ.Bc.multiplyMatrices(Bn, _blM2);
    for (const a of [S.p, S.o, S.q]) for (let k = 0; k < N; k++) {
      const i = k * 3, held = Math.abs(S.p[i + 1] - G.y) < 0.004 && S.p[i] < G.x0 + BELT_TRAY.cover;   // (on the tray: held by the gun)
      if (K > 0 && !held) { _blV.set(a[i], a[i + 1], a[i + 2]); _blW.copy(_blV).applyMatrix4(BJ.D).sub(_blV).multiplyScalar(K); const l = _blW.length(); if (l > MV) _blW.multiplyScalar(MV / l); a[i] += _blW.x; a[i + 1] += _blW.y; a[i + 2] += _blW.z; }
      if (boxMoved && !S.tr[k]) { _blV.set(a[i], a[i + 1], a[i + 2]).applyMatrix4(BJ.Bc); a[i] = _blV.x; a[i + 1] = _blV.y; a[i + 2] = _blV.z; }
    }
    BJ.Bp.copy(Bn);
    // gravity, in the gun's frame
    _blV.set(0, 0, 0).applyMatrix4(BJ.Mi); _blW.set(0, -9.8, 0).applyMatrix4(BJ.Mi).sub(_blV); _blG[0] = _blW.x; _blG[1] = _blW.y; _blG[2] = _blW.z;
    // and stepped at its own rate, however long the frame
    const dt = BELT_SIM.dt; BJ.acc = Math.min(BJ.acc + rdt, dt * 16);
    while (BJ.acc >= dt) {
      BJ.acc -= dt;
      // (a shot's pull: the round in the port drawn in a link, the far end up out of the stack as far; then the belt's
      // moved on a round, back where it began)
      let f = 0, f0 = 0; if (BJ.adv >= 0) { f0 = beltEase(BJ.adv / BELT_RUN.ADV_T); BJ.adv += dt; f = beltEase(BJ.adv / BELT_RUN.ADV_T); }
      const pend = BJ.adv >= 0 ? 1 : 0, total = rel && BJ.nh === N ? Infinity : (W8.mag[id] || 0) + pend, nV = Math.min(N, BJ.nh + pend);
      let feed = null;
      if (BJ.feed === 'pin') { _blF[0] = G.x0 - f * P2; _blF[1] = G.y; _blF[2] = G.z; feed = _blF; }
      else if (BJ.feed === 'lay') { BJ.lay += dt; const u = BJ.lay / BELT_RUN.LAY.t; feed = beltLayAt(u); if (u >= 1) BJ.feed = 'pin'; }
      beltStep(S, G, dt, _blG, nV, feed, total > N ? beltTail(f) : null, BJ.seated ? null : BJ.B, BJ.seated ? null : BJ.Bi, BJ.seated, (f - f0) * P2);
      if (BJ.adv >= BELT_RUN.ADV_T) { beltShift(S, beltTail(0)); BJ.adv = -1; }
    }
  }
  // shown: each round between its last two steps (by how far into the next the frame is), turned along the belt
  const al = BJ.acc / BELT_SIM.dt, p = S.p, q = S.q, nV = Math.min(N, BJ.nh + (BJ.adv >= 0 ? 1 : 0));
  const at = (k, c) => q[k * 3 + c] + (p[k * 3 + c] - q[k * 3 + c]) * al;
  if (!BJ.seated) _blQ2.setFromRotationMatrix(BJ.Bi);
  for (let k = 0; k < N; k++) {
    const r = belt[k]; r.visible = k < nV; if (!r.visible) continue;
    const a = Math.max(0, k - 1), b = Math.min(nV - 1, k + 1), roll = Math.atan2(at(b, 1) - at(a, 1), at(b, 0) - at(a, 0));
    _blV.set(at(k, 0), at(k, 1), at(k, 2));
    if (BJ.seated) { r.position.copy(_blV); r.rotation.set(0, 0, roll); }
    else { r.position.copy(_blV.applyMatrix4(BJ.Bi)); r.quaternion.copy(_blQ2).multiply(_blQ.setFromAxisAngle(_blZ, roll)); }
  }
}
const _blM = new THREE.Matrix4(), _blM2 = new THREE.Matrix4();
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
