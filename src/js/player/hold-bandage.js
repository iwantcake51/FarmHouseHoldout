// Bandaging: the weapon put away, the bandage wound round the left forearm, the wraps that stay on it, and the
// weapon drawn again after (bandPhases, bandagePose).

import { V3 } from '../core/renderer.js';
import { clamp, smooth } from '../core/math.js';
import { lam } from '../core/shaders.js';
import { box } from '../core/geometry.js';
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
const BAND_PUT = 0.2, BAND_WRAP = 0.24, BAND_UP = 1.1;
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
  // (the arms come up with a little give at the top, BAND_UP, rather than sliding straight there, and go down smoothly)
  { const x = ANIM.bandW || 0; ANIM.bandK = band ? 1 + (BAND_UP + 1) * (x - 1) ** 3 + BAND_UP * (x - 1) ** 2 : smooth(x); }
  if (band) ANIM.healCut = false;
  const prog = band ? 1 - P.bandT / (P.bandMax || 1) : 0, fx = band ? 0.2 + 0.8 * smooth(prog) : 0;
  ANIM.healFx = (ANIM.healFx || 0) + (fx - (ANIM.healFx || 0)) * Math.min(1, rdt * (band ? 2.4 : ANIM.healCut ? 11 : 2.6));
}
// the bandages on your left arm, each a strip of gauze wound round the forearm and up it the way a real one goes on:
// a turn straight round to anchor it, then a spiral up the arm, each turn over half the last, and a last turn straight
// round, its end taped down. The one going on comes off the roll in your right hand onto the arm turn by turn, just
// where the hand's gone round; the ones already on stay, blood slowly seeping through each, until the run ends (P.wraps
// of them). WRAP_AT: where each one goes, up the forearm from the wrist; WRAP: the strip (w: how wide, lap: how much of
// each turn the next covers, thick: how far a turn stands out over each one under it, bulge: its middle over its edges,
// r: how round the corners it's pulled over are taken (tight: an arm's, a sleeve's corners are square, so any rounder
// and they'd come through it), gap: how far off what it's wound over, round: what's wound round rather than over
// (armFit), dz: how finely along the arm it follows what's under it, ramp: how steeply it rises over a cuff's edge or
// a watch, tent: how finely across each side it's drawn up over what stands off it (a snap, a watch's face), rows: how
// finely across the strip, fin: how far through the bandage the last turn's on, the rest of it the end pressed down
// and taped, seep: seconds for the blood to come through, seg: points along each side and round each corner of a turn)
const WRAP_AT = [[0.34, 0.48], [0.19, 0.33], [0.05, 0.18]];
const WRAP = { w: 0.044, lap: 0.5, thick: 0.0011, bulge: 0.0005, r: 0.0045, gap: 0.0012, round: 0.6, dz: 0.0025, ramp: 1, tent: 9, rows: 11, fin: 0.86, seep: 7, seg: [6, 2] };
const WRAP_M = lam(0xffffff, { vertexColors: true }), WRAP_TAPE = lam(0xd8d0bf);
const WRAP_GAUZE = new THREE.Color(0xfbf9f3), WRAP_SEEP_C = new THREE.Color(0x6e140d), WRAP_SEEP_E = new THREE.Color(0xa0402e);
const ARM_HALF = 0.07;   // the bare forearm, half across (player/player.js), in the arm's own frame
// what each wrap's wound over, along it: every WRAP.dz a slice, how far out it is right, left, up and down at its
// corners (prof.e, four to a slice) and, WRAP.tent points across each of those sides, how far out anything standing
// off it draws the strip (prof.t: a snap, a watch's face; the side straight across where there's nothing), gap
// included: the bare arm, or the sleeve, the cuff, the jacket, the watch over it there (fitWraps)
const bareProf = (z0, z1) => { const n = Math.max(2, Math.ceil((z1 - z0) / WRAP.dz) + 1), v = ARM_HALF + WRAP.gap; return { z0, dz: (z1 - z0) / (n - 1), n, e: new Float32Array(n * 4).fill(v), t: new Float32Array(n * 4 * WRAP.tent).fill(v) }; };
// where along a turn each of its eight runs starts (u, 0 to 1, from the middle of its right side, round counter-clockwise:
// right side, corner, top, corner, left, corner, bottom, corner), set from what it's wound over on average so every
// turn's points land on the same corners however the arm under it changes along it
function wrapLayout(w) {
  const P0 = w.prof, n = P0.n, m = [0, 0, 0, 0]; for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) m[k] += P0.e[i * 4 + k] / n;
  const r = WRAP.r, arc = Math.PI * r / 2, len = [m[2] + m[3] - 2 * r, arc, m[0] + m[1] - 2 * r, arc, m[2] + m[3] - 2 * r, arc, m[0] + m[1] - 2 * r, arc];
  const L = len.reduce((x, y) => x + y, 0), at = [0]; len.forEach(l => at.push(at[at.length - 1] + l / L));
  w.lay = { at, off: len[0] / 2 / L, L };
}
// the point u of the way round wrap w's turn at z along the arm, lifted lift off what's under it (the turns under, the
// strip's own bulge): out = [x, y, outward x, outward y]
function wrapPt(w, u, z, lift, out) {
  const P0 = w.prof, s = clamp((z - P0.z0) / P0.dz, 0, P0.n - 1), i = Math.min(P0.n - 2, Math.floor(s)), f = s - i, E = P0.e;
  const xp = E[i * 4] + (E[i * 4 + 4] - E[i * 4]) * f + lift, xn = E[i * 4 + 1] + (E[i * 4 + 5] - E[i * 4 + 1]) * f + lift;
  const yp = E[i * 4 + 2] + (E[i * 4 + 6] - E[i * 4 + 2]) * f + lift, yn = E[i * 4 + 3] + (E[i * 4 + 7] - E[i * 4 + 3]) * f + lift;
  const r = WRAP.r + lift, at = w.lay.at; let v = ((u + w.lay.off) % 1 + 1) % 1, k = 0;
  while (k < 7 && v >= at[k + 1]) k++;
  const g = clamp((v - at[k]) / Math.max(1e-6, at[k + 1] - at[k]), 0, 1), arc = (cx, cy, a0) => { const a = a0 + g * Math.PI / 2; out[0] = cx + r * Math.cos(a); out[1] = cy + r * Math.sin(a); out[2] = Math.cos(a); out[3] = Math.sin(a); };
  // along a side: how far out it's drawn there (the side's own line, or up over what stands off it), s across the side
  // from the corner it starts at
  const M = WRAP.tent, T = P0.t, side = (sd, s) => { const q = clamp(s, 0, 1) * (M - 1), m = Math.min(M - 2, Math.floor(q)), h = q - m, a = (i * 4 + sd) * M + m, b = a + 4 * M;
    return (T[a] + (T[a + 1] - T[a]) * h) * (1 - f) + (T[b] + (T[b + 1] - T[b]) * h) * f + lift; };
  switch (k) {
    case 0: out[1] = -yn + r + (yp + yn - 2 * r) * g; out[0] = side(0, (out[1] + yn) / (yp + yn)); out[2] = 1; out[3] = 0; break;
    case 1: arc(xp - r, yp - r, 0); break;
    case 2: out[0] = xp - r - (xp + xn - 2 * r) * g; out[1] = side(2, (xp - out[0]) / (xp + xn)); out[2] = 0; out[3] = 1; break;
    case 3: arc(-xn + r, yp - r, Math.PI / 2); break;
    case 4: out[1] = yp - r - (yp + yn - 2 * r) * g; out[0] = -side(1, (yp - out[1]) / (yp + yn)); out[2] = -1; out[3] = 0; break;
    case 5: arc(-xn + r, -yn + r, Math.PI); break;
    case 6: out[0] = -xn + r + (xp + xn - 2 * r) * g; out[1] = -side(3, (out[0] + xn) / (xp + xn)); out[2] = 0; out[3] = -1; break;
    default: arc(xp - r, -yn + r, 1.5 * Math.PI);
  }
  return out;
}
// where round a turn each of its points falls: each side split in WRAP.seg[0], each corner in [1], so the corners are
// always taken round where they are
function wrapSamples(w) {
  const at = w.lay.at, off = w.lay.off, [ns, nc] = WRAP.seg, us = [];
  // (from the middle of the right side: its upper half, the seven runs after it, its lower half)
  for (let k = 0; k <= 8; k++) {
    const a0 = k === 0 ? off : at[k], a1 = k === 8 ? 1 + off : at[k + 1], n = k % 2 ? nc : (k === 0 || k === 8 ? Math.ceil(ns / 2) : ns);
    for (let j = 0; j < n; j++) us.push(a0 + (a1 - a0) * j / n - off);
  }
  return us;
}
const _wrp = [0, 0, 0, 0];
// how many turns lie under the strip at its jth point (per points a turn), z along the arm: each earlier turn, round
// the same way, that covers that z (softly at its edges, so a turn eases up onto the one before rather than stepping)
function under(w, j, per, z) {
  let n = 0;
  for (let i = j - per; i >= 0; i -= per) n += clamp((WRAP.w / 2 - Math.abs(z - w.zc[i])) / (0.16 * WRAP.w) + 0.5, 0, 1);
  return n;
}
// the strip itself for wrap w, of turns turns: its points along it (t: turns from its start), how far along the arm and
// how far out each turn is, and its colour (the gauze, darker at its turned edges, and the blood through it: wrapSeep)
function wrapBuild(w, turns) {
  wrapLayout(w);
  const us = wrapSamples(w), per = us.length, segs = Math.ceil(turns * per), ts = [];
  for (let j = 0; j <= segs; j++) ts.push(Math.min(turns, Math.floor(j / per) + us[j % per]));
  // how fast it climbs the arm: not at all for the first turn and the last, the spiral between; scaled to fit its place
  const L = w.z1 - w.z0, pitch0 = WRAP.w * (1 - WRAP.lap), rate = t => smooth(clamp((t - 0.7) / 0.5, 0, 1)) * (1 - smooth(clamp((t - (turns - 1.15)) / 0.5, 0, 1)));
  const zs = [0]; for (let j = 1; j <= segs; j++) zs.push(zs[j - 1] + (ts[j] - ts[j - 1]) * (rate(ts[j]) + rate(ts[j - 1])) / 2);
  const pitch = Math.min(pitch0, (L - WRAP.w) / Math.max(1e-3, zs[segs]));
  const z1 = w.z1 - WRAP.w / 2;
  w.ts = ts; w.zc = zs.map(v => z1 - v * pitch);
  // across the strip: its edges a touch further in and darker (turned over), its middle standing out a hair; finely
  // enough that it lies over a cuff's edge rather than cutting across it
  const rows = [], nr = WRAP.rows;
  for (let r = 0; r < nr; r++) { const o = r / (nr - 1) - 0.5, e = clamp((0.5 - Math.abs(o)) / 0.14, 0, 1); rows.push([o, WRAP.bulge * smooth(e), 0.82 + 0.15 * e]); }
  const pos = new Float32Array((segs + 1) * nr * 3), col = new Float32Array((segs + 1) * nr * 3), at = new Float32Array((segs + 1) * nr * 2), shade = new Float32Array((segs + 1) * nr);
  const per0 = w.lay.L, path = [];
  for (let j = 0; j <= segs; j++) {
    const t = ts[j], zc = w.zc[j];
    path.push({ t, z: zc, d: WRAP.thick * under(w, j, per, zc) + WRAP.bulge });
    rows.forEach(([o, b, sh], r) => {
      const z = zc + o * WRAP.w; wrapPt(w, t, z, WRAP.thick * under(w, j, per, z) + b, _wrp); const v = (j * nr + r);
      pos[v * 3] = _wrp[0]; pos[v * 3 + 1] = _wrp[1]; pos[v * 3 + 2] = z;
      at[v * 2] = (t % 1) * per0; at[v * 2 + 1] = z; shade[v] = sh;
    });
  }
  const idx = [];
  for (let j = 0; j < segs; j++) for (let r = 0; r < nr - 1; r++) { const a = j * nr + r, b = (j + 1) * nr + r, c = b + 1, e = a + 1; idx.push(a, b, c, a, c, e); }
  if (w.geo) w.geo.dispose();
  const g = w.geo = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  g.computeBoundingSphere();
  w.mesh.geometry = g; w.turns = turns; w.segs = segs; w.path = path; w.pitch = pitch; w.at = at; w.shade = shade; w.per0 = per0; w.nr = nr; w.tapeAt = false;
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
  wrapPt(w, t, z, d, _wrp); _wp.set(_wrp[0], _wrp[1], z); _wn.set(_wrp[2], _wrp[3], 0);
  wrapPt(w, t + 0.01, z, d, _wrp); _wt.set(_wrp[0], _wrp[1], z).sub(_wp).normalize();
}
const wraps = WRAP_AT.map(([z0, z1]) => {
  const g = new THREE.Group(); PM.armL.add(g); g.visible = false; g.userData.fine = true;
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), WRAP_M); mesh.castShadow = false; mesh.userData.fine = mesh.userData.noStain = true; g.add(mesh);
  const tape = box(g, 0.032, 0.0025, 0.022, WRAP_TAPE, 0, 0, 0); tape.castShadow = false; tape.userData.fine = tape.userData.noStain = true; tape.matrixAutoUpdate = false;
  return { g, mesh, tape, z0, z1, prof: bareProf(z0, z1), geo: null, seep: 0, key: null };
});
// the roll in your right hand as it's wound on (thinner as it goes), and the strip running from it to the arm
const bandRoll = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, WRAP.w, 14), lam(0xe9e3d6)); bandRoll.visible = false; bandRoll.userData.fine = bandRoll.userData.noStain = true; bandRoll.castShadow = false; PM.upper.add(bandRoll);
const wrapTail = box(PM.upper, WRAP.w, 0.0022, 1, lam(0xece6da), 0, 0, 0); wrapTail.visible = false; wrapTail.userData.fine = wrapTail.userData.noStain = true; wrapTail.castShadow = false;
// each wrap goes on over whatever's on the arm there (a sleeve and its cuff, the canvas jacket, gloves, an armband, a
// watch), and follows it along the arm: snug on a sleeve, up over a cuff's edge and back down past it, never sinking
// into one or having a cuff poke through it; refit every few frames while any is showing (gear and clothes change
// with upgrades and runs)
const _wm = new THREE.Matrix4();
let wrapFitT = 0;
// how far out round the arm each piece of a part on it stands to each side (in the arm's own frame: x across, y up, z
// along), counting only its points that go round it, near a corner as far up as across (WRAP.round): a sleeve's, a
// cuff's, a watch's strap; and all its points across the arm (xy), for what stands off one side, a snap or a watch's
// face, that the bandage is drawn up over rather than out to all round.
// Pieces, as a jacket's sleeve, seam, cuff and snap are one mesh: each joined-up run of its triangles on its own
// (meshPieces). Kept while the part sits on the arm the same way (ARM_FIT)
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
    _wfv.fromBufferAttribute(p, i).applyMatrix4(_wfm); const x = _wfv.x, y = _wfv.y, ax = Math.abs(x), ay = Math.abs(y);
    let f = by.get(pc[i]); if (!f) by.set(pc[i], f = { e: [0, 0, 0, 0], z0: Infinity, z1: -Infinity, xy: [] });
    f.xy.push(x, y);
    if (ay >= WRAP.round * ax) f.e[x >= 0 ? 0 : 1] = Math.max(f.e[x >= 0 ? 0 : 1], ax);
    if (ax >= WRAP.round * ay) f.e[y >= 0 ? 2 : 3] = Math.max(f.e[y >= 0 ? 2 : 3], ay);
    f.z0 = Math.min(f.z0, _wfv.z); f.z1 = Math.max(f.z1, _wfv.z);
  }
  const pcs = [...by.values()]; ARM_FIT.set(o, { key, pcs }); return pcs;
}
// a side's line, base out, drawn up over the points pts ([across, out, ...]) standing off it: the upper hull of them
// and its two corners, as WRAP.tent heights across it into out from o
function tentOver(pts, base, out, o) {
  const M = WRAP.tent, hull = [[0, base]], P = [];
  for (let q = 0; q < pts.length; q += 2) P.push([pts[q], pts[q + 1]]);
  P.sort((a, b) => a[0] - b[0]); P.push([1, base]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (const p of P) { while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], p) >= 0) hull.pop(); hull.push(p); }
  for (let m = 0, j = 0; m < M; m++) {
    const s = m / (M - 1); while (j < hull.length - 2 && hull[j + 1][0] < s) j++;
    const a = hull[j], b = hull[j + 1], f = b[0] > a[0] ? clamp((s - a[0]) / (b[0] - a[0]), 0, 1) : 1;
    out[o + m] = Math.max(base, a[1] + (b[1] - a[1]) * f);
  }
}
function fitWraps() {
  const arm = PM.armL; arm.updateMatrixWorld(true); _wm.copy(arm.matrixWorld).invert();
  const mine = new Set(); wraps.forEach(w => w.g.traverse(o => mine.add(o)));
  // clothes and gear (lit materials), not the outline shells round the arm
  const parts = []; arm.traverse(o => { if (o === arm || !o.isMesh || mine.has(o) || !o.visible || !(o.material && o.material.isMeshLambertMaterial)) return; parts.push(...armFit(o)); });
  const M = WRAP.tent;
  wraps.forEach(w => {
    // each slice: the widest of what's there to each side (the bare arm at least), then across each side anything
    // standing off it, the strip drawn straight up to it from the corners and over it (as a bandage pulled tight is);
    // then all of it eased along the arm so it rises over an edge (WRAP.ramp) rather than stepping up between slices
    // and cutting into it
    const P0 = w.prof, n = P0.n, raw = new Float32Array(n * 4).fill(ARM_HALF), h = P0.dz / 2, at = [];
    for (const b of parts) {
      const i0 = Math.max(0, Math.ceil((b.z0 - h - P0.z0) / P0.dz)), i1 = Math.min(n - 1, Math.floor((b.z1 + h - P0.z0) / P0.dz));
      if (i0 <= i1) at.push([b, i0, i1]);
      for (let i = i0; i <= i1; i++) for (let k = 0; k < 4; k++) raw[i * 4 + k] = Math.max(raw[i * 4 + k], b.e[k]);
    }
    const rawT = new Float32Array(n * 4 * M);
    for (let i = 0; i < n; i++) {
      const xp = raw[i * 4], xn = raw[i * 4 + 1], yp = raw[i * 4 + 2], yn = raw[i * 4 + 3], up = [[], [], [], []];
      for (const [b, i0, i1] of at) if (i >= i0 && i <= i1) for (let q = 0; q < b.xy.length; q += 2) {
        const x = b.xy[q], y = b.xy[q + 1];
        // which side it stands off, and how far across that side from the corner the strip comes to it from
        if (x > xp && y > -yn && y < yp) up[0].push((y + yn) / (yp + yn), x);
        else if (x < -xn && y > -yn && y < yp) up[1].push((yp - y) / (yp + yn), -x);
        else if (y > yp && x > -xn && x < xp) up[2].push((xp - x) / (xp + xn), y);
        else if (y < -yn && x > -xn && x < xp) up[3].push((x + xn) / (xp + xn), -y);
      }
      for (let k = 0; k < 4; k++) tentOver(up[k], raw[i * 4 + k], rawT, (i * 4 + k) * M);
    }
    const e = new Float32Array(n * 4), t = new Float32Array(n * 4 * M); let moved = false;
    const ease = (src, dst, cnt) => { for (let i = 0; i < n; i++) for (let k = 0; k < cnt; k++) {
      let v = 0; for (let j = 0; j < n; j++) v = Math.max(v, src[j * cnt + k] - Math.abs(i - j) * P0.dz * WRAP.ramp);
      dst[i * cnt + k] = v + WRAP.gap;
    } };
    ease(raw, e, 4); ease(rawT, t, 4 * M);
    for (let q = 0; q < t.length && !moved; q++) if (Math.abs(t[q] - P0.t[q]) > 0.0006) moved = true;
    for (let q = 0; q < e.length && !moved; q++) if (Math.abs(e[q] - P0.e[q]) > 0.0006) moved = true;
    if (!moved) return;
    P0.e = e; P0.t = t;
    if (w.geo) { const s = w.seep; wrapBuild(w, w.turns); w.seep = s; w.seepShown = -1; wrapSeep(w); }
  });
}
const _wc = new V3(), _wa = new V3(), _wu = new V3(), _wv = new V3(), _we = new V3(), _wh = new V3(), _wq = new THREE.Matrix4(), _wx = new V3();
let wrapLast = 0;
// where the left hand's held while it's wrapped, in front of your chest (the wrap's on the forearm just behind it).
// From your own eyes the shoulders are behind the view, so the arms are lifted forward and up off them (BAND_FP_LIFT,
// as a game's arms are) and the forearm's laid across in front of you, the wrap going on in the bottom of the view,
// where you can watch it; it turns slowly in the hand as the bandage goes round (BAND_TURN: how far, how fast). The
// right arm's shoulder goes out to the side and a little lower instead (BAND_FP_LIFT_R), so it reaches round the
// forearm from beside it rather than across your eyes (a thick sleeve, the canvas jacket's, would hide the wrap)
const BAND_ARM = [0.05, 0.98, 0.36], BAND_ARM_FP = [0.14, 1.12, 0.3], BAND_FP_LIFT = [0, 0.04, 0.2], BAND_FP_LIFT_R = [-0.1, 0.08, 0.3], BAND_TURN = [0.22, 1.7];
const _wd = new V3(), _wdR = new V3();
// how far round it's been wound t turns' worth of the time in: each turn a hand's pull, quicker over the top and slower
// as it comes round under the arm (WIND_EASE of a turn either way), not round at one steady speed
const WIND_EASE = 0.11, bandWindAt = t => { const n = Math.floor(t), f = t - n; return n + f - WIND_EASE * Math.sin(2 * Math.PI * f); };
// the held forearm's own drift while it's wound, slow and uneven (BAND_DRIFT: [across, up, along] metres, each the sum of
// two slow waves), and its slow turn in the hand
const BAND_DRIFT = [0.009, 0.012, 0.007];
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
    const t = i === cur ? Math.max(0.05, bandWindAt(w.turns * wind)) : w.turns, per = w.segs / w.turns;
    if (i === cur) { ANIM.bandTurn = t; ANIM.bandProg = prog; }   // (how far round it's gone and on, for the view to go with it: game/view-cam.js, BAND_CAM)
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
  const DR = BAND_DRIFT;
  reach(a, 'L', _fL.set(B[0] + (Math.sin(now * 0.9) * 0.6 + Math.sin(now * 2.3 + 1) * 0.4) * DR[0], B[1] + (Math.sin(now * 1.15 + 2) * 0.6 + Math.sin(now * 2.7) * 0.4) * DR[1], B[2] + Math.sin(now * 0.7 + 0.5) * DR[2]),
    0.4 + BAND_TURN[0] * (Math.sin(now * BAND_TURN[1]) * 0.7 + Math.sin(now * BAND_TURN[1] * 0.43 + 1.2) * 0.3) * (band ? 1 : 0), true);
  a.position.add(_wd);
  a.rotation.set(rx + (a.rotation.x - rx) * w, ry + (a.rotation.y - ry) * w, rz + (a.rotation.z - rz) * w);
  a.position.set(px + (a.position.x - px) * w, py + (a.position.y - py) * w, pz + (a.position.z - pz) * w); a.scale.z = sz + (a.scale.z - sz) * w;
  a.updateMatrix();
  _wa.set(0, 0, 1).applyQuaternion(a.quaternion);
  const W0 = wraps[Math.max(0, cur)];
  if (cur >= 0 && W0.geo) {
    // the hand just past where the strip's reached, a little out from the arm (the strip running off the roll to it);
    // at the end it comes in and presses the end down
    const t = Math.max(0.05, bandWindAt(W0.turns * wind)); wrapAt(W0, t);
    _we.copy(_wp); _wh.copy(_wp).addScaledVector(_wn, 0.062 * (1 - press) + 0.03 * press).addScaledVector(_wt, 0.035 * (1 - press));
    _wh.applyMatrix4(a.matrix); _we.addScaledVector(_wn, 0.002).applyMatrix4(a.matrix); _fR.copy(_wh);
  } else _fR.set(0, 0, 0.4 * a.scale.z).applyMatrix4(a.matrix).add(_wu.set(0, 1, 0).applyQuaternion(a.quaternion).multiplyScalar(0.12));
  const r = pm.armR, qx = r.rotation.x, qy = r.rotation.y, qz = r.rotation.z, qpx = r.position.x, qpy = r.position.y, qpz = r.position.z, qs = r.scale.z;
  if (fp) _wdR.set(BAND_FP_LIFT_R[0], BAND_FP_LIFT_R[1], BAND_FP_LIFT_R[2]); else _wdR.set(0, 0, 0);
  reach(r, 'R', _fR.sub(_wdR), 0, true); r.position.add(_wdR);
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
