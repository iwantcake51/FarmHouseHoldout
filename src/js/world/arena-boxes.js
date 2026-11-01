// Boxes on the arena maps' shelving that a round knocks off: each bursts into a cloud of dust and scraps of cardboard
// with a dull papery crunch, and they all come back for the next round (Showdown: each 'pick'), or in a deathmatch each
// one AR_BOX.back seconds after it went. They're dressing: the shelving they stand on still stops the round, and nothing
// new is seen through it once they're gone.
//
// A map registers its boxes as it's built (once; world/arena.js keeps the map's group):
//   const bx = arBoxSet('mall', g);           // a set, its own name (the same on every screen), into the map's group
//   bx.add(x, y, z, w, h, d, col);            // a box: its middle, its size (x, y, z: axis-aligned) and its colour
//   bx.addMesh(mesh);                         // or a mesh of your own already in the group (a jerry can, a tyre): hit
//                                             // by its box in the world as it stands, hidden while it's knocked off
//   bx.done();                                // built: the boxes one instanced mesh, each a copy of it
// They stand on something in a grid cell that stops a round (shelving, a workbench): a shot (weapons/firing.js, a
// bot's in pvp/bots.js) that one stops looks for a box in the cell it stopped in, or the next one along that also
// holds boxes, up to AR_BOX.reach past where it stopped (arBoxShot); and from your own eyes any the round's line meets
// before that (one on a bench it flies over). From your own eyes it's the box its line really meets first; from above
// (where the round flies at one height) of those it crosses, the one nearest that height, so the next shot into the
// same spot takes the next one up or down.
// Every screen builds the map from the same seed, so a box is the same number everywhere: a break is sent by its set
// and number (abx), and done again on every screen, once.

import { rr } from '../core/math.js';
import { lam } from '../core/shaders.js';
import { ci, idx } from './grid.js';
import { NET_ON, netSend } from '../net/net.js';
import { PVP } from '../pvp/pvp.js';
import { dustBurst, fx } from '../effects/puffs.js';
import { cubeBurst } from '../effects/particles.js';
import { nz, tn } from '../audio/audio.js';
import { soundAt } from '../audio/spatial.js';

// back: a deathmatch's wait before a box is back (s); reach: how far past where the shelving stopped the round a box can
// still be met (m); ear: the least gap between two boxes' sounds (s: a shotgun's blast knocking off several at once)
const AR_BOX = { sets: new Map(), back: 25, reach: 1.0, near: 0.45, ear: 0.05, earT: 0 };
const arBoxM = new THREE.Matrix4();
// a set of boxes (id: its name, the same on every screen; g: the map's group). Registering a set again under the same
// name (the map built again) replaces it
const arBoxB3 = new THREE.Box3(), arBoxV = new THREE.Vector3();
export function arBoxSet(id, g) {
  const set = { id, g, list: [], cells: new Map(), gone: new Map(), im: null, tick: null, add: null, addMesh: null, done: null };
  const put = b => { const n = set.list.length; b.k = idx(ci(b.x), ci(b.z)); set.list.push(b); if (!set.cells.has(b.k)) set.cells.set(b.k, []); set.cells.get(b.k).push(n); return n; };
  set.add = (x, y, z, w, h, d, col) => put({ x, y, z, w, h, d, col: new THREE.Color(col), mesh: null, inst: 0 });
  set.addMesh = m => {
    m.updateWorldMatrix(true, false); arBoxB3.setFromObject(m); arBoxB3.getCenter(arBoxV); const c = arBoxV.clone(); arBoxB3.getSize(arBoxV);
    m.userData.moving = true;   // (core/still-shadows.js: it'll come and go)
    return put({ x: c.x, y: c.y, z: c.z, w: arBoxV.x, h: arBoxV.y, d: arBoxV.z, col: null, mesh: m, inst: -1 });
  };
  set.done = () => arBoxMesh(set);
  AR_BOX.sets.set(id, set);
  return set;
}
function arBoxMesh(set) {
  const L = set.list, own = L.filter(b => !b.mesh);
  if (own.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0xffffff), own.length);
    own.forEach((b, n) => { b.inst = n; im.setColorAt(n, b.col); });
    // (its own bounds aren't the boxes': never culled; core/still-shadows.js leaves an instanced mesh to cast its own shadow)
    im.castShadow = im.receiveShadow = true; im.frustumCulled = false; im.userData.moving = true;
    set.im = im; set.g.add(im);
  }
  // (what keeps time for it: a speck drawn every frame, nothing to see, put back when it's time: arBoxTick)
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  const tk = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0, depthWrite: false })); tk.frustumCulled = false; tk.userData.moving = true;
  tk.onBeforeRender = () => arBoxTick(set); set.tick = tk; set.g.add(tk);
  set.gone.clear(); L.forEach((b, n) => arBoxPut(set, n, true));
}
const arBoxUp = set => !!(set.tick && set.tick.parent && set.tick.parent.parent);   // (its map's the one that's up)
function arBoxPut(set, n, on) {
  const b = set.list[n];
  if (b.mesh) { b.mesh.visible = on; return; }
  set.im.setMatrixAt(b.inst, on ? arBoxM.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z) : arBoxM.makeScale(0, 0, 0));
  set.im.instanceMatrix.needsUpdate = true;
}
// all back for a new round or match (or out of the arena), or in a deathmatch each when its time's up
function arBoxTick(set) {
  const G = set.gone; if (!G.size) return;
  if (!PVP.on || PVP.ph === 'pick' || PVP.ph === 'idle') { for (const n of G.keys()) arBoxPut(set, n, true); G.clear(); return; }
  if (PVP.mode === 'rounds') return;
  const now = performance.now(); for (const [n, t] of G) if (now >= t) { G.delete(n); arBoxPut(set, n, true); }
}
// how far along (o) + (d)·t a line first meets box b (from t = 0; Infinity if it misses it): from above (top) only
// across the floor, its height left out
function arBoxT(b, ox, oy, oz, dx, dy, dz, top) {
  let t0 = 0, t1 = Infinity;
  for (let a = 0; a < (top ? 2 : 3); a++) {
    const o = a === 0 ? ox : a === 1 ? oz : oy, d = a === 0 ? dx : a === 1 ? dz : dy, c = a === 0 ? b.x : a === 1 ? b.z : b.y, s = (a === 0 ? b.w : a === 1 ? b.d : b.h) / 2;
    if (Math.abs(d) < 1e-9) { if (o < c - s || o > c + s) return Infinity; continue; }
    let u = (c - s - o) / d, v = (c + s - o) / d; if (u > v) { const w = u; u = v; v = w; }
    t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return Infinity;
  }
  return t0;
}
// a round (or pellet) along (ox, oy, oz) + (dx, dy, dz)·t (dx, dz across the floor, a unit; dy its rise a metre) that
// went as far as endT, stopped there by something in the grid if stopped (fp: from your own eyes): the box it went into
// knocked off, and sent. True if one went
export function arBoxShot(ox, oy, oz, dx, dy, dz, endT, stopped, fp) {
  if (!AR_BOX.sets.size) return false;
  const si = ci(ox + dx * (endT + 0.01)), sj = ci(oz + dz * (endT + 0.01)), k0 = idx(si, sj), near = [k0, idx(si - 1, sj), idx(si + 1, sj), idx(si, sj - 1), idx(si, sj + 1)];
  let best = null, bn = -1, bs = Infinity;
  const look = (set, n, lim) => {
    if (set.gone.has(n)) return;
    const b = set.list[n], t = arBoxT(b, ox, oy, oz, dx, dy, dz, !fp); if (t > lim) return;
    const s = fp ? t : Math.max(0, Math.abs(oy + dy * t - b.y) - b.h / 2) + 0.25 * Math.max(0, t - endT);
    if (s < bs) { bs = s; best = set; bn = n; }
  };
  for (const set of AR_BOX.sets.values()) {
    if (!arBoxUp(set)) continue;
    // (in what stopped it, and the next along that holds boxes too: never through a wall beside it)
    if (stopped && set.cells.has(k0)) for (const k of near) { const ns = set.cells.get(k); if (ns) for (const n of ns) look(set, n, endT + AR_BOX.reach); }
    // (any its line meets on the way: the shelving lets rounds through, world/collision.js SHOOT_THRU, so a round
    // fired through a shelf knocks off the box it passes through and flies on. From above, only one near the height the
    // round flies at, AR_BOX.near)
    for (let n = 0; n < set.list.length; n++) { if (fp) look(set, n, endT); else { const b = set.list[n], t = arBoxT(b, ox, oy, oz, dx, dy, dz, true); if (t <= endT && Math.abs(oy + dy * t - b.y) - b.h / 2 < AR_BOX.near) look(set, n, endT); } }
  }
  if (!best) return false;
  arBoxBreak(best, bn, dx, dz); netSend('abx', { s: best.id, i: bn, dx: Math.round(dx * 100) / 100, dz: Math.round(dz * 100) / 100 });
  return true;
}
// a box knocked off (n of set; dx, dz the way the round was going): gone, a puff of dust, scraps of cardboard thrown on
// out the way the round went and a dull papery crunch. (Again for the same box does nothing)
function arBoxBreak(set, n, dx, dz) {
  const b = set.list[n]; if (!b || set.gone.has(n)) return;
  set.gone.set(n, performance.now() + AR_BOX.back * 1000); arBoxPut(set, n, false);
  const v = Math.min(3, b.w * b.h * b.d / 0.05);   // (how big it was, against a middling one)
  dustBurst(b.x, b.y, b.z, Math.round(8 + 6 * v), dx, dz, 1.4);
  cubeBurst(b.x, b.y, b.z, Math.round(5 + 4 * v), 'wood', dx, dz, 2.2, 1.1);
  for (let k = 0; k < 3; k++) fx('debris', b.x, b.y, b.z, dx * rr(0.6, 1.6) + rr(-0.6, 0.6), rr(0.4, 1.4), dz * rr(0.6, 1.6) + rr(-0.6, 0.6), 0.08, rr(0.3, 0.5), rr(0.35, 0.55), 0.75);
  const now = performance.now() / 1000; if (now - AR_BOX.earT < AR_BOX.ear) return; AR_BOX.earT = now;
  soundAt(b.x, b.z, () => { nz(0.14, 'bandpass', 1500, 420, 0.32, 0.9); nz(0.08, 'lowpass', 800, 180, 0.28); tn(0.1, 'sine', 150, 60, 0.22); });
}
// (someone else's shot, or a bot's on the host)
NET_ON.abx = m => { const set = AR_BOX.sets.get(m.s); if (set && arBoxUp(set)) arBoxBreak(set, m.i, m.dx || 0, m.dz || 0); };
