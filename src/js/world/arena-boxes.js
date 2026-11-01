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

import { clamp, rr } from '../core/math.js';
import { lam } from '../core/shaders.js';
import { ci, idx } from './grid.js';
import { NET_ON, netSend } from '../net/net.js';
import { PVP } from '../pvp/pvp.js';
import { dustBurst, fx } from '../effects/puffs.js';
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
  tk.onBeforeRender = () => { arBoxTick(set); arBitsStep(); }; set.tick = tk; set.g.add(tk);
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
// a box knocked off (n of set; dx, dz the way the round was going): gone, torn apart (arBits), a puff of dust thrown on
// out the way the round went and a dull papery crunch. (Again for the same box does nothing)
function arBoxBreak(set, n, dx, dz) {
  const b = set.list[n]; if (!b || set.gone.has(n)) return;
  set.gone.set(n, performance.now() + AR_BOX.back * 1000); arBoxPut(set, n, false);
  const v = Math.min(3, b.w * b.h * b.d / 0.05);   // (how big it was, against a middling one)
  arBits(set, b, dx, dz, v);
  dustBurst(b.x, b.y, b.z, Math.round(6 + 5 * v), dx, dz, 1.2);
  // (and a slow cloud of the dust that was in it, hanging where it stood a moment and settling)
  for (let k = 0, m = Math.round(3 + 2 * v); k < m; k++) fx('dust', b.x + rr(-b.w, b.w) * 0.4, b.y + rr(-b.h, b.h) * 0.3, b.z + rr(-b.d, b.d) * 0.4, dx * rr(0.1, 0.4) + rr(-0.2, 0.2), rr(-0.05, 0.15), dz * rr(0.1, 0.4) + rr(-0.2, 0.2), rr(0.16, 0.26), rr(1.2, 2.0), rr(1.0, 1.6), rr(0.12, 0.2));
  const now = performance.now() / 1000; if (now - AR_BOX.earT < AR_BOX.ear) return; AR_BOX.earT = now;
  soundAt(b.x, b.z, () => { nz(0.14, 'bandpass', 1500, 420, 0.32, 0.9); nz(0.08, 'lowpass', 800, 180, 0.28); tn(0.1, 'sine', 150, 60, 0.22); });
}

// ---- a box torn apart (arBits): its sides blown off as flat panels of its own cardboard, tumbling and fluttering down
// (the side the round went out of thrown hardest), torn scraps of it, what was in it spilling out (tins and packets in
// shop colours) and shreds of paper drifting down slowest. Each bounces and slides to rest on the shelf it stood on (or
// the floor if it's thrown clear of it) and shrinks away after a while. All of them one instanced mesh, the oldest bit
// reused once AR_BITS.n are about, stepped only while any are moving and drawn only while any are left.
// AR_BITS: how many at most; how long they lie (s) and shrink away at the end; gravity; air drag on a flat bit (panel,
// scrap, shred: how fast it slows) and on a solid one; how fast a flat one can fall (m/s) and how hard it sways side to
// side as it does; a bounce's give and a slide's grip; how thick a side's cardboard is (m)
const AR_BITS = { n: 260, life: [4, 6.5], fade: 0.7, g: 9.8, drag: { flat: 2.6, shred: 4.5, solid: 0.35 }, term: { flat: -2.4, shred: -0.7 }, sway: { flat: 1.4, shred: 0.9 }, bounce: 0.28, grip: 0.55, card: 0.006 };
const AR_GOODS = [0xc8372d, 0xe8b23a, 0x2f6fb4, 0xf0ece0, 0x3d8b4a, 0xd9692b, 0x6a4c8c, 0x1d1d1d];
const ARB = { mesh: null, bits: [], at: 0, live: 0, t: 0, o: new THREE.Object3D(), c: new THREE.Color() };
function arBitsMesh(set) {
  if (!ARB.mesh) {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0xffffff), AR_BITS.n);
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.userData.moving = true; m.count = 0;
    for (let i = 0; i < AR_BITS.n; i++) { m.setColorAt(i, ARB.c.set(0xffffff)); ARB.bits.push({ on: false }); }
    ARB.mesh = m;
  }
  if (ARB.mesh.parent !== set.g) set.g.add(ARB.mesh);   // (in whichever map's up)
  return ARB.mesh;
}
// one bit: where, how it's thrown, its size (x, y, z), its colour, and what kind (flat, shred, solid); rest is where it
// can come to rest under it (the shelf the box stood on, if it's still over it)
function arBit(set, x, y, z, vx, vy, vz, sx, sy, sz, col, kind, rest) {
  const m = arBitsMesh(set), i = ARB.at; ARB.at = (ARB.at + 1) % AR_BITS.n;
  const B = ARB.bits[i]; if (!B.on) ARB.live++;
  Object.assign(B, { on: true, x, y, z, vx, vy, vz, sx, sy, sz, kind, rest, rx: rr(0, 6.3), ry: rr(0, 6.3), rz: rr(0, 6.3), wx: rr(-14, 14), wy: rr(-8, 8), wz: rr(-14, 14), ph: rr(0, 6.3), life: rr(AR_BITS.life[0], AR_BITS.life[1]), still: false });
  m.setColorAt(i, ARB.c.set(col)); m.instanceColor.needsUpdate = true;
  m.count = AR_BITS.n;
}
function arBits(set, b, dx, dz, v) {
  const card = b.col ? b.col.getHex() : 0x8a8478, rest = { x0: b.x - b.w / 2 - 0.02, x1: b.x + b.w / 2 + 0.02, z0: b.z - b.d / 2 - 0.02, z1: b.z + b.d / 2 + 0.02, y: b.y - b.h / 2 };
  const shade = k => ARB.c.set(card).multiplyScalar(k).getHex(), t = AR_BITS.card;
  // its six sides, each blown out from the middle (the one the round left by hardest, the one it came in by least) and
  // on the way it went; a side's a little torn down from its full size
  const sides = [[1, 0, 0, t, b.h, b.d], [-1, 0, 0, t, b.h, b.d], [0, 0, 1, b.w, b.h, t], [0, 0, -1, b.w, b.h, t], [0, 1, 0, b.w, t, b.d], [0, -1, 0, b.w, t, b.d]];
  for (const [nx, ny, nz, sx, sy, sz] of sides) {
    const out = nx * dx + nz * dz, push = 0.9 + 1.4 * Math.max(0, out) - 0.5 * Math.max(0, -out), k = rr(0.7, 0.95);
    arBit(set, b.x + nx * b.w / 2, b.y + ny * b.h / 2, b.z + nz * b.d / 2, nx * push * rr(0.6, 1.3) + dx * rr(0.8, 2.2), ny * push * 0.6 + rr(0.6, 2.0), nz * push * rr(0.6, 1.3) + dz * rr(0.8, 2.2), sx * (nx ? 1 : k), sy * (ny ? 1 : k), sz * (nz ? 1 : k), shade(rr(0.82, 1.08)), 'flat', rest);
  }
  // torn scraps of it
  for (let k = 0, m = Math.round(5 + 4 * v); k < m; k++) { const s = Math.min(b.w, b.h, b.d) * rr(0.25, 0.55); arBit(set, b.x + rr(-0.4, 0.4) * b.w, b.y + rr(-0.4, 0.4) * b.h, b.z + rr(-0.4, 0.4) * b.d, dx * rr(0.6, 2.6) + rr(-1.2, 1.2), rr(0.4, 2.6), dz * rr(0.6, 2.6) + rr(-1.2, 1.2), s * rr(0.6, 1.4), t, s * rr(0.6, 1.4), shade(rr(0.7, 1.05)), 'flat', rest); }
  // what was in it
  for (let k = 0, m = Math.round(2 + 2.5 * v); k < m; k++) { const s = rr(0.035, 0.075); arBit(set, b.x + rr(-0.3, 0.3) * b.w, b.y + rr(-0.3, 0.3) * b.h, b.z + rr(-0.3, 0.3) * b.d, dx * rr(0.4, 1.8) + rr(-0.8, 0.8), rr(0.3, 1.8), dz * rr(0.4, 1.8) + rr(-0.8, 0.8), s * rr(0.7, 1.2), s * rr(1, 1.8), s * rr(0.7, 1.2), AR_GOODS[(Math.random() * AR_GOODS.length) | 0], 'solid', rest); }
  // and shreds of paper and packing
  for (let k = 0, m = Math.round(6 + 6 * v); k < m; k++) arBit(set, b.x + rr(-0.3, 0.3) * b.w, b.y + rr(-0.2, 0.4) * b.h, b.z + rr(-0.3, 0.3) * b.d, dx * rr(0.3, 1.6) + rr(-1, 1), rr(0.6, 2.4), dz * rr(0.3, 1.6) + rr(-1, 1), rr(0.015, 0.035), 0.002, rr(0.02, 0.05), Math.random() < 0.7 ? 0xece6d6 : 0xd6c9a8, 'shred', rest);
}
// every frame (once, whichever map's ticking): each bit falling (a flat one slowed by the air and swaying as it goes,
// spinning), bouncing off and sliding along what it lands on, coming to rest flat, and shrinking away at the end
function arBitsStep() {
  if (!ARB.mesh || !ARB.live) return;
  const now = performance.now() / 1000, dt = clamp(now - (ARB.t || now), 0, 0.05); ARB.t = now; if (dt <= 0) return;
  const A = AR_BITS, o = ARB.o, m = ARB.mesh;
  for (let i = 0; i < A.n; i++) {
    const B = ARB.bits[i]; if (!B.on) continue;
    B.life -= dt;
    if (B.life <= 0) { B.on = false; ARB.live--; m.setMatrixAt(i, arBoxM.makeScale(0, 0, 0)); continue; }
    if (!B.still) {
      const solid = B.kind === 'solid', dr = A.drag[B.kind], e = Math.exp(-dr * dt);
      B.vx *= e; B.vz *= e; B.vy -= A.g * dt; if (!solid) { B.vy = Math.max(B.vy, A.term[B.kind]); const sw = A.sway[B.kind] * Math.sin(now * 5 + B.ph); B.vx += sw * Math.cos(B.ph) * dt * 3; B.vz += sw * Math.sin(B.ph) * dt * 3; }
      B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
      B.rx += B.wx * dt; B.ry += B.wy * dt; B.rz += B.wz * dt;
      // (what's under it: the shelf it stood on while it's over it and above it, else the floor)
      const R = B.rest, on = R && B.x > R.x0 && B.x < R.x1 && B.z > R.z0 && B.z < R.z1 && B.y > R.y - 0.05 ? R.y : 0, half = Math.min(B.sx, B.sy, B.sz) / 2 + 0.002;
      if (B.y - half <= on && B.vy < 0) {
        B.y = on + half;
        if (B.vy < -1.2 && solid) { B.vy *= -A.bounce; B.wx *= 0.5; B.wz *= 0.5; }
        else if (B.vy < -1.6) { B.vy *= -A.bounce * 0.5; B.wx *= 0.3; B.wz *= 0.3; }
        else { B.vy = 0; B.vx *= A.grip; B.vz *= A.grip; if (Math.hypot(B.vx, B.vz) < 0.15) { B.still = true; B.vx = B.vz = 0; } }
        // (a flat bit settles lying flat, a tin on its side or end, still turned whichever way it came down)
        if (!solid) { B.rx = Math.round(B.rx / Math.PI) * Math.PI; B.rz = Math.round(B.rz / Math.PI) * Math.PI; if (B.sy > B.sx * 2 || B.sy > B.sz * 2) { const s = B.sy; B.sy = Math.min(B.sx, B.sz); if (B.sx < B.sz) B.sx = s; else B.sz = s; } }
        else { B.rx = Math.round(B.rx / (Math.PI / 2)) * (Math.PI / 2); B.rz = Math.round(B.rz / (Math.PI / 2)) * (Math.PI / 2); }
        B.wx = B.wz = 0; B.wy *= 0.4;
      }
    }
    const k = B.life < A.fade ? B.life / A.fade : 1;
    o.position.set(B.x, B.y, B.z); o.rotation.set(B.rx, B.ry, B.rz); o.scale.set(B.sx * k, B.sy * k, B.sz * k); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
  }
  m.instanceMatrix.needsUpdate = true;
  if (!ARB.live) m.count = 0;
}
// (someone else's shot, or a bot's on the host)
NET_ON.abx = m => { const set = AR_BOX.sets.get(m.s); if (set && arBoxUp(set)) arBoxBreak(set, m.i, m.dx || 0, m.dz || 0); };
