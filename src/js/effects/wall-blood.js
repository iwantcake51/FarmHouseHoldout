// Blood up the house's walls: when a hit throws blood toward a wall (zombies/damage.js), the spray that reaches it lands
// on the face it struck as a splash of its own, painted on that face alone and on neither the far side nor the floor.
// Thrown at the wall head-on it's a burst, a heavy blot with droplets flung out all round it; thrown at it slantwise,
// a spatter streaking the way the blood was going, each drop drawn out into a teardrop with a tail, more and longer
// the shallower it came in. From the heaviest of it, runs of blood creep down the wall over a few seconds, slowing as
// they go, a bead swelling at the foot of each. Fresh, it's a wet red; it darkens as it dries to a dull brown, and soaks
// away on the ground's clock (effects/blood-map.js), faster once the wave's over.
// The splashes are drawn once into a few pictures (WB_ART) and each is a single lit quad on the wall (core/shaders.js:
// lit by the light map like the wall, and faded with that wall when it's cut away for you to see in: world/cutaway.js).
// There are never more than WB.max splashes and WB.maxRuns runs; the oldest go first.
//
// Walls: the house's outer walls (a whole cell each, its faces on the cell's edges: world/house.js) and the inside
// walls (thin, standing on the lines between cells: world/thin-walls.js). Windows and doors (OPEN) let it through.

import { scene } from '../core/renderer.js';
import { clamp, HALF, rand, rr } from '../core/math.js';
import { lit } from '../core/shaders.js';
import { cell, ci, idx, inb, WALL } from '../world/grid.js';
import { THIN, wallBetween } from '../world/thin-walls.js';
import { WALL_AT } from '../world/house.js';
import { IW_LINES } from '../world/interior.js';
import { phase } from '../game/state.js';

// how far blood flies to a wall (reach, m; times reachK for a heavy hit), the step it's traced in, how far off the face a
// splash sits (off: clear of the siding and the plaster), the most splashes and runs at once, its size range (m), the
// ground's clock it soaks away on (stay, fade, wash: as effects/blood-map.js), and how long it takes to dry (dry, s)
const WB = { reach: 1.7, reachK: 1.45, step: 0.05, off: 0.024, offThin: 0.068, max: 48, maxRuns: 64, size: [0.4, 1.5], stay: 15, fade: 40, wash: 6, dry: 22 };
// runs: how many from a splash (at most), how long they grow (s), how far they get (m), how wide (m)
const RUN = { n: 4, grow: [2.2, 6], len: [0.2, 0.95], w: [0.02, 0.045] };
const DRIED = new THREE.Color(0.52, 0.36, 0.34);   // what it's darkened to, dry (times the fresh red in the picture)

// ---- the pictures, drawn once: bursts (thrown head-on) and spatters (thrown along +x), and a run
const ART_N = 4, ART_PX = 256;
function wbCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const RED = a => `rgba(${96 + Math.floor(rand() * 34)},${4 + Math.floor(rand() * 8)},${3 + Math.floor(rand() * 6)},${a})`;
// a drop drawn out along a (radians) from (x, y): a round head where it struck and a tapering tail behind the way it went
function teardrop(x2, x, y, r, a, stretch) {
  const L = r * stretch, ca = Math.cos(a), sa = Math.sin(a);
  x2.beginPath(); x2.arc(x, y, r, a + Math.PI / 2, a - Math.PI / 2, false);
  x2.quadraticCurveTo(x + ca * L * 0.55 + sa * r * 0.35, y + sa * L * 0.55 - ca * r * 0.35, x + ca * L, y + sa * L);
  x2.quadraticCurveTo(x + ca * L * 0.55 - sa * r * 0.35, y + sa * L * 0.55 + ca * r * 0.35, x - sa * r, y + ca * r);
  x2.fill();
}
// a blot: overlapping blobs round (x, y), r across, with a ragged edge
function blot(x2, x, y, r) {
  for (let k = 0; k < 14; k++) { const a = rand() * 6.28, d = rand() * r * 0.55, br = r * rr(0.28, 0.6); x2.fillStyle = RED(rr(0.75, 0.95)); x2.beginPath(); x2.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, br, 0, 6.28); x2.fill(); }
  for (let k = 0; k < 22; k++) { const a = rand() * 6.28, d = r * rr(0.7, 1.05); x2.fillStyle = RED(0.9); x2.beginPath(); x2.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * rr(0.05, 0.16), 0, 6.28); x2.fill(); }
}
function art(kind) {
  const c = wbCanvas(ART_PX, ART_PX), x2 = c.getContext('2d'), S = ART_PX;
  if (kind === 'burst') {
    const cx = S / 2, cy = S / 2; blot(x2, cx, cy, S * rr(0.15, 0.21));
    for (let k = 0; k < 46; k++) {   // droplets flung out all round, smaller and drawn out further the further they went
      const a = rand() * 6.28, d = S * (0.16 + Math.pow(rand(), 1.4) * 0.32), r = S * 0.034 * (1.15 - d / S * 1.5) * rr(0.5, 1.2);
      if (r < 0.6) continue; x2.fillStyle = RED(rr(0.8, 0.95)); teardrop(x2, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, a, 1.2 + d / S * 5);
    }
    for (let k = 0; k < 140; k++) { const a = rand() * 6.28, d = S * (0.1 + rand() * 0.38); x2.fillStyle = RED(rr(0.5, 0.85)); x2.beginPath(); x2.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr(0.6, 1.8), 0, 6.28); x2.fill(); }
  } else {
    // thrown along +x: where it struck on the left, streaks and drops fanning out to the right
    const cx = S * 0.24, cy = S / 2; blot(x2, cx, cy, S * rr(0.11, 0.15));
    for (let k = 0; k < 6; k++) {   // a few long streaks, the heaviest of it dragged along
      const a = rr(-0.22, 0.22), r = S * rr(0.018, 0.04), x0 = cx + S * rr(0.02, 0.08);
      x2.fillStyle = RED(rr(0.75, 0.92)); teardrop(x2, x0, cy + rr(-0.06, 0.06) * S, r, a, rr(5, 12));
    }
    for (let k = 0; k < 60; k++) {   // drops, fanning out, the further the smaller and the more drawn out
      const a = rr(-0.5, 0.5) * (0.4 + rand() * 0.6), d = S * (0.06 + Math.pow(rand(), 1.2) * 0.62), r = S * 0.03 * (1.15 - d / S * 1.2) * rr(0.45, 1.15);
      if (r < 0.6) continue; x2.fillStyle = RED(rr(0.75, 0.95)); teardrop(x2, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, a, 1.6 + d / S * 7);
    }
    for (let k = 0; k < 170; k++) { const a = rr(-0.6, 0.6), d = S * (0.05 + rand() * 0.7); x2.fillStyle = RED(rr(0.45, 0.85)); x2.beginPath(); x2.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr(0.5, 1.6), 0, 6.28); x2.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
// a run: a thin line of blood down from the top, wavering a little, swelling to a bead at its foot
function runArt() {
  const W = 32, H = 256, c = wbCanvas(W, H), x2 = c.getContext('2d');
  x2.fillStyle = RED(0.92); x2.beginPath(); x2.moveTo(W / 2 - 5, 0);
  for (let y = 0; y <= H - 18; y += 8) x2.lineTo(W / 2 - 3.2 - Math.sin(y * 0.05) * 1.2, y);
  x2.arc(W / 2, H - 12, 7.5, Math.PI, 0, true);
  for (let y = H - 18; y >= 0; y -= 8) x2.lineTo(W / 2 + 3.2 - Math.sin(y * 0.05) * 1.2, y);
  x2.lineTo(W / 2 + 5, 0); x2.fill();
  return new THREE.CanvasTexture(c);
}
const WB_ART = { burst: Array.from({ length: ART_N }, () => art('burst')), spatter: Array.from({ length: ART_N }, () => art('spatter')), run: runArt() };
const QUAD = new THREE.PlaneGeometry(1, 1), RUN_Q = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);   // (a run hangs down from its top)

const splashes = [], runs = [];
// a piece of blood on a wall: its own material, so it fades and dries on its own; lit as the wall is, and faded with it
function piece(geo, map, cut) {
  const m = new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.userData.mobile = true;   // (it's blood itself: it doesn't read the blood map, core/shaders.js)
  if (cut) m.userData.cut = cut;
  lit(m, !!cut);
  const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = false; o.renderOrder = 1; o.matrixAutoUpdate = false; scene.add(o);
  return o;
}
function drop(list, o) { scene.remove(o); o.material.dispose(); const k = list.findIndex(e => e.o === o); if (k >= 0) list.splice(k, 1); }

// where blood thrown from (x, y, z) along (dx, dz) strikes a wall, if it does within r: the point, the face's outward
// normal, and its cut-away control (world/cutaway.js). A run of steps along the way it's going, the blood dropping a
// little as it flies; the first wall cell it enters, or inside wall it crosses
function wallHit(x, y, z, dx, dz, r) {
  let i0 = ci(x), j0 = ci(z);
  if (!inb(i0, j0) || cell[idx(i0, j0)] === WALL) return null;
  for (let d = WB.step; d <= r; d += WB.step) {
    const px = x + dx * d, pz = z + dz * d, i = ci(px), j = ci(pz);
    if (i === i0 && j === j0) continue;
    const h = y + d * 0.12 - d * d * 0.22; if (h < 0.08) return null;   // (it's come down to the floor first)
    if (!inb(i, j)) return null;
    // crossing from one cell to the next: which edge, and the wall there if there is one
    const ex = i !== i0, ez = j !== j0;
    const nx = ex ? -Math.sign(i - i0) : 0, nz = ez && !ex ? -Math.sign(j - j0) : 0;
    const bx = ex ? Math.max(i, i0) - HALF : px, bz = !ex && ez ? Math.max(j, j0) - HALF : pz;
    if (cell[idx(i, j)] === WALL && !(ex && ez)) {
      const w = WALL_AT.get(idx(i, j)); if (!w || !w.cut) return null;
      const hx = ex ? bx + nx * WB.off : px, hz = ex ? pz : bz + nz * WB.off;
      return { x: hx, y: Math.min(h, 2.2), z: hz, nx, nz, cut: w.cut, d };
    }
    if (cell[idx(i, j)] !== 0 && cell[idx(i, j)] !== WALL) return null;   // (a window, a door, a prop, a fence: not a wall it lands on)
    if (THIN.n && !(ex && ez) && wallBetween(i0, j0, i, j)) {
      const ax = ex ? 'x' : 'z', p = ex ? bx : bz, u = ex ? pz : px;
      const ln = IW_LINES.find(L => L.ax === ax && Math.abs(L.p - p) < 0.01 && u > L.lo - HALF - 0.6 && u < L.hi - HALF + 0.6) || IW_LINES.find(L => L.ax === ax && Math.abs(L.p - p) < 0.01);
      const hx = ex ? bx + nx * WB.offThin : px, hz = ex ? pz : bz + nz * WB.offThin;
      return { x: hx, y: Math.min(h, 2.2), z: hz, nx, nz, cut: ln ? ln.cut : null, d };
    }
    i0 = i; j0 = j;
  }
  return null;
}
const _wbX = new THREE.Vector3(), _wbY = new THREE.Vector3(), _wbZ = new THREE.Vector3(), _wbM = new THREE.Matrix4();
// a hit's blood thrown at whatever wall's there (zombies/damage.js): from (x, y, z) along (dx, dz), k how much of it
// (about 0.5 a light hit, 1 a heavy one, 1.5 a kill that tears it apart)
export function wallSpray(x, y, z, dx, dz, k = 1) {
  const L = Math.hypot(dx, dz); if (L < 1e-3) return; dx /= L; dz /= L;
  const reach = WB.reach * (k > 1 ? WB.reachK : 1), h = wallHit(x, y, z, dx, dz, reach); if (!h) return;
  const near = 1 - h.d / reach;   // (the closer the wall, the more of it lands)
  if (rand() > 0.35 + near * 0.75) return;
  // how slantwise it struck: the share of its way that runs along the wall. Head-on, a burst; slantwise, a spatter
  // streaking along the wall that way, a little downward as it falls
  const along = h.nx ? dz : dx, glance = Math.abs(along);
  const size = clamp((0.55 + 0.5 * k) * (0.6 + 0.6 * near) * rr(0.8, 1.2), WB.size[0], WB.size[1]);
  const kind = glance < 0.4 ? 'burst' : 'spatter';
  const s = splashes.length >= WB.max ? splashes.shift() : null; if (s) drop(splashes, s.o);
  const o = piece(QUAD, WB_ART[kind][Math.floor(rand() * ART_N)], h.cut);
  // laid on the face: its +x the way the blood went along the wall (and down a little), its +z out of the wall
  _wbZ.set(h.nx, 0, h.nz);
  const aX = h.nx ? 0 : 1, aZ = h.nx ? 1 : 0, sg = kind === 'burst' ? (rand() < 0.5 ? 1 : -1) : Math.sign(along) || 1;
  const tilt = kind === 'burst' ? rr(-3.14, 3.14) : -rr(0.05, 0.35);
  _wbX.set(aX * sg * Math.cos(tilt), Math.sin(tilt), aZ * sg * Math.cos(tilt));
  _wbY.crossVectors(_wbZ, _wbX).normalize(); _wbX.crossVectors(_wbY, _wbZ);
  _wbM.makeBasis(_wbX, _wbY, _wbZ); o.quaternion.setFromRotationMatrix(_wbM);
  // a spatter starts where the blood struck: its picture's struck point (a quarter in) on the point it hit
  const shift = kind === 'spatter' ? size * 0.26 : 0;
  o.position.set(h.x + _wbX.x * shift, clamp(h.y + _wbX.y * shift, size * 0.3, 2.3), h.z + _wbX.z * shift);
  o.scale.set(size * (kind === 'spatter' ? 1 + glance * 0.6 : 1), size, 1); o.updateMatrix();
  splashes.push({ o, t: 0 });
  // runs down from the heaviest of it, a heavier hit more of them
  const n = Math.min(RUN.n, 1 + Math.floor(rand() * (1 + k * 2.4)));
  for (let r = 0; r < n; r++) {
    const ro = runs.length >= WB.maxRuns ? runs.shift() : null; if (ro) drop(runs, ro.o);
    const u = rr(-0.18, 0.18) * size, top = h.y + rr(-0.06, 0.04) * size;
    const ox = h.x + (h.nx ? 0 : 1) * u + h.nx * 0.0012, oz = h.z + (h.nx ? 1 : 0) * u + h.nz * 0.0012;   // (a hair proud of its splash)
    const q = piece(RUN_Q, WB_ART.run, h.cut);
    q.quaternion.setFromUnitVectors(_wbY.set(0, 0, 1), _wbZ.set(h.nx, 0, h.nz));
    q.position.set(ox, top, oz);
    const len = Math.min(top - 0.04, rr(RUN.len[0], RUN.len[1]) * (0.6 + 0.4 * k)), w = rr(RUN.w[0], RUN.w[1]);
    if (len < 0.05) { scene.remove(q); q.material.dispose(); continue; }
    q.scale.set(w, 0.001, 1); q.updateMatrix();
    runs.push({ o: q, t: 0, len, w, grow: rr(RUN.grow[0], RUN.grow[1]) });
  }
}
// each frame: the runs creeping down (quick at first, slowing to a stop), everything drying darker, and fading away on
// the ground's clock; and gone when it's gone
export function stepWallBlood(dt) {
  if (!splashes.length && !runs.length) return;
  const wash = phase === 'cleared' || phase === 'break' ? WB.wash : 1;
  const age = (e, list) => {
    e.t += dt * wash;
    const m = e.o.material, op = 1 - clamp((e.t - WB.stay) / WB.fade, 0, 1);
    if (op <= 0) { drop(list, e.o); return; }
    m.opacity = op; m.color.setRGB(1, 1, 1).lerp(DRIED, clamp(e.t / WB.dry, 0, 1));
  };
  for (let k = splashes.length - 1; k >= 0; k--) age(splashes[k], splashes);
  for (let k = runs.length - 1; k >= 0; k--) {
    const r = runs[k]; age(r, runs); if (!runs.includes(r)) continue;
    if (r.t < r.grow) { const u = r.t / r.grow, e = 1 - (1 - u) * (1 - u) * (1 - u); r.o.scale.y = Math.max(0.001, r.len * e); r.o.updateMatrix(); }
  }
}
// a new run: every wall clean
export function wallBloodClear() { while (splashes.length) drop(splashes, splashes[0].o); while (runs.length) drop(runs, runs[0].o); }
