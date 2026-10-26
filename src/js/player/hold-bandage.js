// Bandaging: the weapon put away, the bandage wound round the left forearm, the wraps that stay on it, and the
// weapon drawn again after (bandPhases, bandagePose).

import { V3 } from '../core/renderer.js';
import { clamp, smooth } from '../core/math.js';
import { lam } from '../core/shaders.js';
import { box, roundRectAt } from '../core/geometry.js';
import { P, PM } from './player.js';
import { W8 } from '../game/run-state.js';
import { equip } from '../weapons/reload.js';
import { wrapTurn } from './bandages.js';
import { ANIM } from './animation.js';
import { _fL, _fR, FIST, reach } from './hold.js';
import { fpOn } from '../game/view-cam.js';

// bandaging: first the weapon goes away, carried by the right hand to where it rides (bandP, player/swap.js), then the
// hands come up and the right one winds the bandage round the left forearm (bandW, eased into bandK); after, the hands
// come down and the weapon is drawn again, the way it's drawn any time (equip). healFx is how far the blue edge and the camera's lean-in have come: they
// build slowly as the bandage goes on, ease off as it ends, and drop away fast if a hit cuts it short (healCut)
const BAND_PUT = 0.2, BAND_WRAP = 0.16;
export function bandPhases(rdt) {
  const band = P.bandT > 0;
  // another weapon picked during the bandage (switchSlot): the hands come down, the one in hand finishes going away,
  // then the new one is taken out
  if (ANIM.bandSwitch && !band) {
    ANIM.bandW = Math.max(0, (ANIM.bandW || 0) - rdt / BAND_WRAP);
    if (ANIM.bandW <= 0) ANIM.bandP = Math.min(1, (ANIM.bandP || 0) + rdt / BAND_PUT);
    if (ANIM.bandP >= 1) { const s = ANIM.bandSwitch; ANIM.bandSwitch = null; ANIM.bandP = 0; if (W8.slot[s]) { W8.cur = s; W8.reloading = null; W8.burstLeft = 0; W8.swing = 0; equip(s, true); } }
  }
  else if (band) { ANIM.bandP = Math.min(1, (ANIM.bandP || 0) + rdt / BAND_PUT); if (ANIM.bandP >= 1) ANIM.bandW = Math.min(1, (ANIM.bandW || 0) + rdt / BAND_WRAP); }
  else {
    ANIM.bandW = Math.max(0, (ANIM.bandW || 0) - rdt / BAND_WRAP);
    // once the hands are down, the weapon's drawn as it is any time you take it out (equip: its own draw, its sound,
    // the wait before it can fire); one only part put away when the bandage was cut short just comes back to the hand
    if (ANIM.bandW <= 0) { if (ANIM.bandP >= 0.5) { ANIM.bandP = 0; if (W8.slot[W8.cur]) equip(W8.cur, true); } else ANIM.bandP = Math.max(0, (ANIM.bandP || 0) - rdt / BAND_PUT); }
  }
  ANIM.bandK = smooth(ANIM.bandW || 0);
  if (band) ANIM.healCut = false;
  const prog = band ? 1 - P.bandT / (P.bandMax || 1) : 0, fx = band ? 0.2 + 0.8 * smooth(prog) : 0;
  ANIM.healFx = (ANIM.healFx || 0) + (fx - (ANIM.healFx || 0)) * Math.min(1, rdt * (band ? 2.4 : ANIM.healCut ? 11 : 2.6));
}
// the bandages on your left arm, each a strip of gauze wound round the forearm and up it the way a real one goes on:
// a turn straight round to anchor it, then a spiral up the arm, each turn over half the last, and a last turn straight
// round, its end taped down. The one going on comes off the roll in your right hand onto the arm turn by turn, just
// where the hand's gone round; the ones already on stay, blood slowly seeping through each, until the run ends (P.wraps
// of them). WRAP_AT: where each one goes, up the forearm from the wrist; WRAP: the strip (w: how wide, lap: how much of
// each turn the next covers, thick: how much each turn stands out over the one under it, r: how round the arm's
// corners are taken, gap: how far off what it's wound over, round: what's wound round rather than over (armFit), fin: how far through the bandage the last turn's on, the rest of it the
// end pressed down and taped, seep: seconds for the blood to come through)
const WRAP_AT = [[0.34, 0.48], [0.19, 0.33], [0.05, 0.18]];
const WRAP = { w: 0.044, lap: 0.5, thick: 0.0012, r: 0.016, gap: 0.0015, round: 0.6, fin: 0.86, seep: 7, seg: [3, 4] };
const WRAP_M = lam(0xffffff, { vertexColors: true }), WRAP_TAPE = lam(0xd8d0bf);
const WRAP_GAUZE = new THREE.Color(0xfbf9f3), WRAP_SEEP_C = new THREE.Color(0x6e140d), WRAP_SEEP_E = new THREE.Color(0xa0402e);
// where round its section each sample of a turn falls (the sides split in WRAP.seg[0], each rounded corner in [1]), so
// the corners are always taken round smoothly however short they are
function wrapSamples(ax, ay, r) {
  const sx = 2 * (ax - r), sy = 2 * (ay - r), arc = Math.PI * r / 2, L = 2 * sx + 2 * sy + 4 * arc, us = [];
  let s = 0; const [ns, nc] = WRAP.seg;
  [sy / 2, arc, sx, arc, sy, arc, sx, arc, sy / 2].forEach((len, k) => { const n = k % 2 ? nc : (k === 0 || k === 8 ? Math.ceil(ns / 2) : ns); for (let j = 0; j < n; j++) { us.push((s + len * j / n) / L); } s += len; });
  return us;
}
const _wrp = [0, 0, 0, 0];
// the strip itself for wrap w, of turns turns: its points along it (t: turns from its start), how far along the arm and
// how far out each turn is, and its colour (the gauze, darker at its turned edges, and the blood through it: wrapSeep)
function wrapBuild(w, turns) {
  const us = wrapSamples(w.hx, w.hy, WRAP.r), per = us.length, segs = Math.ceil(turns * per), ts = [];
  for (let j = 0; j <= segs; j++) ts.push(Math.min(turns, Math.floor(j / per) + us[j % per]));
  // how fast it climbs the arm: not at all for the first turn and the last, the spiral between; scaled to fit its place
  const L = w.z1 - w.z0, pitch0 = WRAP.w * (1 - WRAP.lap), rate = t => smooth(clamp((t - 0.7) / 0.5, 0, 1)) * (1 - smooth(clamp((t - (turns - 1.15)) / 0.5, 0, 1)));
  const zs = [0]; for (let j = 1; j <= segs; j++) zs.push(zs[j - 1] + (ts[j] - ts[j - 1]) * (rate(ts[j]) + rate(ts[j - 1])) / 2);
  const pitch = Math.min(pitch0, (L - WRAP.w) / Math.max(1e-3, zs[segs]));
  const z1 = w.z1 - WRAP.w / 2;
  // across the strip: its edges a touch further in and darker (turned over), its middle standing out a hair
  const rows = [[-0.5, 0, 0.82], [-0.36, 0.0009, 0.97], [0.36, 0.0009, 0.97], [0.5, 0, 0.82]], nr = rows.length;
  const pos = new Float32Array((segs + 1) * nr * 3), col = new Float32Array((segs + 1) * nr * 3), at = new Float32Array((segs + 1) * nr * 2), shade = new Float32Array((segs + 1) * nr);
  const per0 = 2 * (2 * (w.hx - WRAP.r)) + 2 * (2 * (w.hy - WRAP.r)) + 2 * Math.PI * WRAP.r;
  const path = [];
  for (let j = 0; j <= segs; j++) {
    const t = ts[j], d = WRAP.thick * t, zc = z1 - zs[j] * pitch;
    path.push({ t, z: zc, d });
    rows.forEach(([o, b, sh], r) => {
      roundRectAt(t, w.hx + d + b, w.hy + d + b, WRAP.r + d + b, _wrp); const v = (j * nr + r);
      pos[v * 3] = _wrp[0]; pos[v * 3 + 1] = _wrp[1]; pos[v * 3 + 2] = zc + o * WRAP.w;
      at[v * 2] = (t % 1) * per0; at[v * 2 + 1] = zc + o * WRAP.w; shade[v] = sh;
    });
  }
  const idx = [];
  for (let j = 0; j < segs; j++) for (let r = 0; r < nr - 1; r++) { const a = j * nr + r, b = (j + 1) * nr + r, c = b + 1, e = a + 1; idx.push(a, b, c, a, c, e); }
  if (w.geo) w.geo.dispose();
  const g = w.geo = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  g.computeBoundingSphere();
  w.mesh.geometry = g; w.turns = turns; w.segs = segs; w.ts = ts; w.path = path; w.pitch = pitch; w.at = at; w.shade = shade; w.per0 = per0; w.nr = nr; w.dims = w.hx + ',' + w.hy;
  // where the blood comes through: somewhere on its outer side, part way along it, its edge ragged
  w.sU = (0.15 + Math.random() * 0.7) * per0 * 0.5 + per0 * 0.25; w.sZ = z1 - zs[segs] * pitch * (0.3 + Math.random() * 0.4); w.sR = 0.017 + Math.random() * 0.008; w.sPh = [Math.random() * 6, Math.random() * 6];
  w.seepShown = -1; wrapSeep(w);
}
// the gauze's colour, and the blood through it as far as it's seeped (w.seep, 0 to 1): dark in the middle, browner at
// its edge, ragged round
const _wsc = new THREE.Color();
function wrapSeep(w) {
  const s = w.seep || 0; if (Math.abs(s - w.seepShown) < 0.02 && w.seepShown >= 0) return; w.seepShown = s;
  const c = w.geo.attributes.color, n = c.count, a = w.at, P0 = w.per0;
  for (let v = 0; v < n; v++) {
    let du = Math.abs(a[v * 2] - w.sU); du = Math.min(du, P0 - du); const dz = a[v * 2 + 1] - w.sZ, d = Math.hypot(du, dz), an = Math.atan2(dz, du);
    const R = w.sR * smooth(s) * (0.8 + 0.14 * Math.sin(3 * an + w.sPh[0]) + 0.09 * Math.sin(7 * an + w.sPh[1]));
    const k = clamp((R - d) / 0.005 + 0.5, 0, 1), core = clamp(1 - d / Math.max(1e-4, R), 0, 1);
    _wsc.copy(WRAP_GAUZE).multiplyScalar(w.shade[v]).lerp(_wsc.clone().copy(WRAP_SEEP_E).lerp(WRAP_SEEP_C, smooth(clamp(core * 1.6, 0, 1))), k * 0.93);
    c.setXYZ(v, _wsc.r, _wsc.g, _wsc.b);
  }
  c.needsUpdate = true;
}
// a point on the strip t turns along it (wrap-local), the way out from the arm there, and the way it's going on
const _wp = new V3(), _wn = new V3(), _wt = new V3();
function wrapAt(w, t) {
  const j = clamp(w.ts.findIndex(x => x >= t), 1, w.segs), p0 = w.path[j - 1], p1 = w.path[j], f = clamp((t - p0.t) / Math.max(1e-5, p1.t - p0.t), 0, 1);
  const z = p0.z + (p1.z - p0.z) * f, d = p0.d + (p1.d - p0.d) * f;
  roundRectAt(t, w.hx + d, w.hy + d, WRAP.r + d, _wrp); _wp.set(_wrp[0], _wrp[1], z); _wn.set(_wrp[2], _wrp[3], 0);
  roundRectAt(t + 0.01, w.hx + d, w.hy + d, WRAP.r + d, _wrp); _wt.set(_wrp[0], _wrp[1], z).sub(_wp).normalize();
}
const wraps = WRAP_AT.map(([z0, z1]) => {
  const g = new THREE.Group(); PM.armL.add(g); g.visible = false; g.userData.fine = true;
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), WRAP_M); mesh.castShadow = false; mesh.userData.fine = mesh.userData.noStain = true; g.add(mesh);
  const tape = box(g, 0.032, 0.0025, 0.022, WRAP_TAPE, 0, 0, 0); tape.castShadow = false; tape.userData.fine = tape.userData.noStain = true; tape.matrixAutoUpdate = false;
  return { g, mesh, tape, z0, z1, hx: 0.077, hy: 0.077, geo: null, seep: 0, key: null };
});
// the roll in your right hand as it's wound on (thinner as it goes), and the strip running from it to the arm
const bandRoll = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, WRAP.w, 14), lam(0xe9e3d6)); bandRoll.visible = false; bandRoll.userData.fine = bandRoll.userData.noStain = true; bandRoll.castShadow = false; PM.upper.add(bandRoll);
const wrapTail = box(PM.upper, WRAP.w, 0.0022, 1, lam(0xece6da), 0, 0, 0); wrapTail.visible = false; wrapTail.userData.fine = wrapTail.userData.noStain = true; wrapTail.castShadow = false;
// each wrap goes on over whatever's on the arm there (a sleeve and its cuff, the canvas jacket, gloves, an armband), so
// it's sized to sit just outside the widest of them across its length rather than sinking into a sleeve or having a
// cuff poke through it; refit every few frames while any is showing (gear and clothes change with upgrades and runs)
const _wm = new THREE.Matrix4();
let wrapFitT = 0;
// how far out round the arm each piece of a part on it stands (in the arm's own frame: x across, y up, z along), counting
// only its points that go round it, near a corner as far up as across (WRAP.round): a sleeve's, a cuff's, a watch's; not
// a snap or a patch standing off one side, or a seam along the top, which the bandage is wound over and pressed flat.
// Pieces, as a jacket's sleeve, seam, cuff and snap are one mesh, and its bounds held every bandage out at the cuff and
// the snap: each joined-up run of its triangles on its own (meshPieces). Kept while the part sits on the arm the same
// way (ARM_FIT)
const ARM_FIT = new WeakMap(), PIECES = new WeakMap(), _wfm = new THREE.Matrix4(), _wfv = new V3();
function meshPieces(g) {
  let pc = PIECES.get(g); if (pc) return pc;
  const n = g.attributes.position.count, up = new Int32Array(n), ix = g.index;
  for (let i = 0; i < n; i++) up[i] = i;
  const root = i => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
  if (ix) for (let t = 0; t < ix.count; t += 3) { const a = root(ix.getX(t)), b = root(ix.getX(t + 1)), c = root(ix.getX(t + 2)); up[b] = a; up[c] = a; }
  else for (let t = 0; t < n; t += 3) { const a = root(t); up[root(t + 1)] = a; up[root(t + 2)] = a; }
  pc = new Int32Array(n); for (let i = 0; i < n; i++) pc[i] = root(i);
  PIECES.set(g, pc); return pc;
}
function armFit(o) {
  _wfm.multiplyMatrices(_wm, o.matrixWorld); const key = o.geometry.uuid + _wfm.elements.map(v => v.toFixed(4)).join();
  const c = ARM_FIT.get(o); if (c && c.key === key) return c.pcs;
  const p = o.geometry.attributes.position, pc = meshPieces(o.geometry), by = new Map();
  for (let i = 0; i < p.count; i++) {
    _wfv.fromBufferAttribute(p, i).applyMatrix4(_wfm); const ax = Math.abs(_wfv.x), ay = Math.abs(_wfv.y);
    let f = by.get(pc[i]); if (!f) by.set(pc[i], f = { hx: 0, hy: 0, z0: Infinity, z1: -Infinity });
    if (ay >= WRAP.round * ax) f.hx = Math.max(f.hx, ax); if (ax >= WRAP.round * ay) f.hy = Math.max(f.hy, ay);
    f.z0 = Math.min(f.z0, _wfv.z); f.z1 = Math.max(f.z1, _wfv.z);
  }
  const pcs = [...by.values()]; ARM_FIT.set(o, { key, pcs }); return pcs;
}
function fitWraps() {
  const arm = PM.armL; arm.updateMatrixWorld(true); _wm.copy(arm.matrixWorld).invert();
  const mine = new Set(); wraps.forEach(w => w.g.traverse(o => mine.add(o)));
  // clothes and gear (lit materials), not the outline shells round the arm
  const parts = []; arm.traverse(o => { if (o === arm || !o.isMesh || mine.has(o) || !o.visible || !(o.material && o.material.isMeshLambertMaterial)) return; parts.push(...armFit(o)); });
  wraps.forEach(w => {
    let hx = 0.07, hy = 0.07;   // the bare arm
    for (const b of parts) if (b.z1 > w.z0 && b.z0 < w.z1) { hx = Math.max(hx, b.hx); hy = Math.max(hy, b.hy); }
    hx += WRAP.gap; hy += WRAP.gap;
    if (Math.abs(hx - w.hx) > 0.001 || Math.abs(hy - w.hy) > 0.001) { w.hx = hx; w.hy = hy; if (w.geo) { const s = w.seep; wrapBuild(w, w.turns); w.seep = s; w.seepShown = -1; wrapSeep(w); } }
  });
}
const _wc = new V3(), _wa = new V3(), _wu = new V3(), _wv = new V3(), _we = new V3(), _wh = new V3(), _wq = new THREE.Matrix4(), _wx = new V3();
let wrapLast = 0;
// where the left hand's held while it's wrapped, in front of your chest (the wrap's on the forearm just behind it).
// From your own eyes the shoulders are behind the view, so the arms are lifted forward and up off them (BAND_FP_LIFT,
// as a game's arms are) and the forearm's laid across in front of you, the wrap going on in the bottom of the view,
// where you can watch it; it turns slowly in the hand as the bandage goes round (BAND_TURN: how far, how fast)
const BAND_ARM = [0.05, 0.98, 0.36], BAND_ARM_FP = [0.12, 1.14, 0.22], BAND_FP_LIFT = [0.05, 0.1, 0.24], BAND_TURN = [0.22, 1.7];
const _wd = new V3();
export function bandagePose(pm, up, now, sh) {
  const k = ANIM.bandK || 0, n = Math.min(WRAP_AT.length, P.wraps || 0), band = P.bandT > 0, dt = clamp(now - wrapLast, 0, 0.1); wrapLast = now;
  // the wrap going on (the next free one), wound as far as the bandage has gone; any finished ones as they are
  const prog = band ? clamp(1 - P.bandT / (P.bandMax || 1), 0, 1) : 0, cur = band && n < WRAP_AT.length ? n : -1;
  if ((n || k > 0.05) && --wrapFitT <= 0) { wrapFitT = 12; fitWraps(); }
  const wind = clamp(prog / WRAP.fin, 0, 1), press = smooth(clamp((prog - WRAP.fin) / 0.07, 0, 1)), taped = prog > WRAP.fin + 0.07;
  wraps.forEach((w, i) => {
    const on = i < n || (i === cur && k > 0.05);
    // a fresh one: as many turns as it has time for at a turn a sound (wrapTurn), at least two and no more than its
    // place on the arm holds
    if (i === cur && w.key !== P.bandMax) { w.key = P.bandMax; w.seep = 0; wrapBuild(w, clamp((P.bandMax || 1) * WRAP.fin / wrapTurn() + 0.6, 2.2, 6)); }
    else if (on && !w.geo) { w.seep = 1; wrapBuild(w, 4); }
    w.g.visible = on; if (!on) return;
    const t = i === cur ? Math.max(0.05, w.turns * wind) : w.turns, per = w.segs / w.turns;
    w.geo.setDrawRange(0, Math.ceil(t * per) * (w.nr - 1) * 6);
    // the end, taped down once it's been pressed on
    const tp = i < n || (i === cur && taped);
    w.tape.visible = tp;
    if (tp && !w.tapeAt) { wrapAt(w, w.turns - 0.015); _wx.crossVectors(_wn, _wt); _wq.makeBasis(_wt, _wn, _wx).setPosition(_wp.addScaledVector(_wn, 0.0013)); w.tape.matrix.copy(_wq); w.tapeAt = true; }
    if (i === cur) w.tapeAt = tp && w.tapeAt;
    // the blood comes through once it's on
    if (i < n && w.seep < 1) { w.seep = Math.min(1, w.seep + dt / WRAP.seep); wrapSeep(w); }
  });
  bandRoll.visible = wrapTail.visible = false;
  let w = k * (sh ? 1 - sh.q : 1); if (w <= 0.001) return;
  // the left forearm comes up in front of you, turned in across the chest; the right hand goes round and round it
  // with the roll, working up the arm as it winds on, the head bent to watch
  const a = pm.armL, rx = a.rotation.x, ry = a.rotation.y, rz = a.rotation.z, px = a.position.x, py = a.position.y, pz = a.position.z, sz = a.scale.z;
  // (from your own eyes it's held higher and further out, where you can watch it go on: BAND_ARM_FP)
  const fp = fpOn(), B = fp ? BAND_ARM_FP : BAND_ARM;
  if (fp) _wd.set(BAND_FP_LIFT[0], BAND_FP_LIFT[1], BAND_FP_LIFT[2]); else _wd.set(0, 0, 0);
  reach(a, 'L', _fL.set(B[0] + Math.sin(now * 1.3) * 0.006, B[1] + Math.sin(now * 2.1) * 0.01, B[2]), 0.4 + BAND_TURN[0] * Math.sin(now * BAND_TURN[1]) * (band ? 1 : 0), true);
  a.position.add(_wd);
  a.rotation.set(rx + (a.rotation.x - rx) * w, ry + (a.rotation.y - ry) * w, rz + (a.rotation.z - rz) * w);
  a.position.set(px + (a.position.x - px) * w, py + (a.position.y - py) * w, pz + (a.position.z - pz) * w); a.scale.z = sz + (a.scale.z - sz) * w;
  a.updateMatrix();
  _wa.set(0, 0, 1).applyQuaternion(a.quaternion);
  const W0 = wraps[Math.max(0, cur)];
  if (cur >= 0 && W0.geo) {
    // the hand just past where the strip's reached, a little out from the arm (the strip running off the roll to it);
    // at the end it comes in and presses the end down
    const t = Math.max(0.05, W0.turns * wind); wrapAt(W0, t);
    _we.copy(_wp); _wh.copy(_wp).addScaledVector(_wn, 0.062 * (1 - press) + 0.03 * press).addScaledVector(_wt, 0.035 * (1 - press));
    _wh.applyMatrix4(a.matrix); _we.addScaledVector(_wn, 0.002).applyMatrix4(a.matrix); _fR.copy(_wh);
  } else _fR.set(0, 0, 0.4 * a.scale.z).applyMatrix4(a.matrix).add(_wu.set(0, 1, 0).applyQuaternion(a.quaternion).multiplyScalar(0.12));
  const r = pm.armR, qx = r.rotation.x, qy = r.rotation.y, qz = r.rotation.z, qpx = r.position.x, qpy = r.position.y, qpz = r.position.z, qs = r.scale.z;
  reach(r, 'R', _fR.sub(_wd), 0, true); r.position.add(_wd);
  r.rotation.set(qx + (r.rotation.x - qx) * w, qy + (r.rotation.y - qy) * w, qz + (r.rotation.z - qz) * w);
  r.position.set(qpx + (r.position.x - qpx) * w, qpy + (r.position.y - qpy) * w, qpz + (r.position.z - qpz) * w); r.scale.z = qs + (r.scale.z - qs) * w;
  // the roll in the fist, along the arm it's going round, and the strip from it to where it's going on
  if (cur >= 0 && w > 0.5 && press < 0.9) {
    r.updateMatrix(); _wv.set(0, 0, FIST * r.scale.z).applyMatrix4(r.matrix);
    const rr = 0.013 + 0.015 * (1 - prog);
    bandRoll.visible = true; bandRoll.position.copy(_wv); bandRoll.quaternion.setFromUnitVectors(_wu.set(0, 1, 0), _wa); bandRoll.scale.set(rr, 1, rr);
    _wc.subVectors(_wv, _we); const L = _wc.length() - rr;
    if (L > 0.005 && prog < WRAP.fin + 0.03) {
      _wc.normalize(); _wx.copy(_wa).addScaledVector(_wc, -_wa.dot(_wc)).normalize(); _wu.crossVectors(_wc, _wx);
      wrapTail.visible = true; _wq.makeBasis(_wx, _wu, _wc); wrapTail.quaternion.setFromRotationMatrix(_wq);
      wrapTail.position.copy(_we).addScaledVector(_wc, L / 2); wrapTail.scale.z = L;
    }
  }
  pm.head.rotation.x += 0.42 * w; pm.head.rotation.y = pm.head.rotation.y * (1 - w) + 0.18 * w; up.x += 0.12 * w;
}
