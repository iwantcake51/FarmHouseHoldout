// Yard fence with gaps, and the map-edge spawn gaps.

import { scene } from '../core/renderer.js';
import { clamp, N, rr } from '../core/math.js';
import { cell, cxw, EMPTY, FENCE, idx, inb } from './grid.js';
import { M } from './materials.js';
import { viaF } from '../zombies/pathfinding.js';
import { P } from '../player/player.js';
import { burst } from '../effects/particles.js';
import { loosePlanks, setFlowDirty } from '../barricades/planks.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { setShake, shake } from '../game/state.js';

// ---- fence round the yard, with gaps zombies funnel through ----
export const FX0 = 10, FX1 = 33, FZ0 = 11, FZ1 = 33;
// the gaps in it: the side (N, S, W, E), and from and to along it (the cells across x on N and S, down z on W and E).
// The front one, where the drive goes out, stays; the others are moved each run (world/yard.js)
export const FENCE_GAPS = [['S', 20, 22], ['N', 21, 22], ['W', 21, 22], ['E', 21, 22]];
export const fenceGap = (i, j) => FENCE_GAPS.some(([s, a, b]) => { const ns = s === 'N' || s === 'S', u = ns ? i : j; return (s === 'N' ? j === FZ0 : s === 'S' ? j === FZ1 : s === 'W' ? i === FX0 : i === FX1) && u >= a && u <= b; });
// the fence put up along the yard's edge, round where its gaps are now (cells already taken are left out)
const fenceG = new THREE.Group(); scene.add(fenceG);
// stretches a brute has knocked down this run (breakFence), left down till the yard's laid out again for the next
export const FENCE_DOWN = new Set();
export function buildFence() {
  for (let k = 0; k < N * N; k++) if (cell[k] === FENCE) cell[k] = EMPTY;
  while (fenceG.children.length) { const m = fenceG.children.pop(); m.geometry.dispose(); if (m.dispose) m.dispose(); }
  const posts = [], rails = [];
  for (let j = FZ0; j <= FZ1; j++) for (let i = FX0; i <= FX1; i++) {
    if (!(i === FX0 || i === FX1 || j === FZ0 || j === FZ1)) continue;
    if (cell[idx(i, j)] || fenceGap(i, j) || FENCE_DOWN.has(idx(i, j))) continue;
    cell[idx(i, j)] = FENCE; posts.push([cxw(i), cxw(j)]);
  }
  const isF = (i, j) => inb(i, j) && cell[idx(i, j)] === FENCE;
  for (let j = FZ0; j <= FZ1; j++) for (let i = FX0; i <= FX1; i++) {
    if (!isF(i, j)) continue;
    if (isF(i + 1, j)) rails.push([cxw(i) + 0.5, cxw(j), 0]);
    if (isF(i, j + 1)) rails.push([cxw(i), cxw(j) + 0.5, Math.PI / 2]);
  }
  const dm = new THREE.Object3D();
  const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 1.0, 0.13), M.fence, posts.length);
  posts.forEach(([x, z], k) => { dm.position.set(x, 0.5, z); dm.rotation.set(rr(-.05, .05), rr(0, 1), rr(-.05, .05)); dm.scale.set(1, rr(0.85, 1.1), 1); dm.updateMatrix(); pm.setMatrixAt(k, dm.matrix); });
  const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.07, 0.05), M.fence, rails.length * 2);
  rails.forEach(([x, z, r], k) => { [0.38, 0.75].forEach((y, q) => { dm.position.set(x, y + rr(-.03, .03), z); dm.rotation.set(0, r, rr(-.04, .04)); dm.scale.set(1, 1, 1); dm.updateMatrix(); rm.setMatrixAt(k * 2 + q, dm.matrix); }); });
  [pm, rm].forEach(m => { m.castShadow = m.receiveShadow = true; fenceG.add(m); });
}
buildFence();
// ---- a brute smashing through it (zombies/ai.js: bruteFence). Each stretch (a post and the rails each side of it)
// takes FENCE_HP, a couple of a brute's blows (BRUTE_SMASH); each blow cracks and throws splinters off it, and the last
// knocks it down: the post and its rails thrown off the way the brute hit, the gap left open to anyone (the zombies'
// fields worked out again for it)
export const FENCE_HP = 130, fenceHp = new Map();
const FENCE_BIT = { post: new THREE.BoxGeometry(0.13, 1.0, 0.13), rail: new THREE.BoxGeometry(1.02, 0.07, 0.05) };
export function fenceBlow(i, j, z, dmg, dme) {
  const k = idx(i, j), x = cxw(i), zz = cxw(j), l = Math.hypot(x - z.x, zz - z.z) || 1, ox = (x - z.x) / l, oz = (zz - z.z) / l;
  const hp = (fenceHp.has(k) ? fenceHp.get(k) : FENCE_HP) - dmg; fenceHp.set(k, hp);
  burst(x - ox * 0.1, 0.6, zz - oz * 0.1, 5, 'wood', ox, oz, 2.5); burst(x, 0.5, zz, 3, 'dust');
  soundAt(x, zz, () => SFX.crack()); setShake(Math.max(shake, 0.16 * clamp(1 - dme / 9, 0, 1)));
  return hp <= 0;
}
export function breakFence(i, j, z) {
  const k = idx(i, j); if (cell[k] !== FENCE) return;
  const x = cxw(i), zz = cxw(j), l = z ? Math.hypot(x - z.x, zz - z.z) || 1 : 1, ox = z ? (x - z.x) / l : 0, oz = z ? (zz - z.z) / l : 1;
  const isF = (a, b) => inb(a, b) && cell[idx(a, b)] === FENCE;
  // what comes off: its post, and the two rails to each stretch of fence next to it
  const fly = (geo, px, py, pz, yaw, post) => {
    const g = new THREE.Mesh(geo, M.fence); g.castShadow = true; g.rotation.order = 'YXZ'; g.position.set(px, py, pz); g.rotation.set(rr(-0.2, 0.2), yaw, rr(-0.2, 0.2)); scene.add(g);
    loosePlanks.push({ g, life: 30, vx: ox * rr(1.8, 3.2) + rr(-0.7, 0.7), vy: rr(0.8, 2.4), vz: oz * rr(1.8, 3.2) + rr(-0.7, 0.7), spin: rr(-6, 6), roll: rr(-5, 5), r: post ? 0.065 : 0.035, bounces: 0, kind: 'plank', restY: post ? 0.065 : 0.03,
      rest: q => { if (post) q.rotation.set(0, yaw + rr(-0.6, 0.6), Math.PI / 2); else q.rotation.set(Math.PI / 2, yaw + rr(-0.6, 0.6), 0); } });
  };
  fly(FENCE_BIT.post, x, 0.5, zz, rr(0, 1), true);
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isF(i + a, j + b)) [0.38, 0.75].forEach(y => fly(FENCE_BIT.rail, x + a * 0.5, y, zz + b * 0.5, a ? 0 : Math.PI / 2));
  while (loosePlanks.length > 32) { const q = loosePlanks.shift(); scene.remove(q.g); }
  FENCE_DOWN.add(k); fenceHp.delete(k); cell[k] = EMPTY; buildFence();
  burst(x, 0.6, zz, 14, 'wood', ox, oz, 3.5); burst(x, 0.4, zz, 10, 'dust');
  soundAt(x, zz, () => SFX.crack()); setTimeout(() => soundAt(x, zz, () => SFX.crack()), 70); setTimeout(() => soundAt(x, zz, () => SFX.thud()), 300);
  if (Math.hypot(P.x - x, P.z - zz) < 8) setShake(Math.max(shake, 0.18));
  setFlowDirty(true); viaF.clear();   // (the ways round to each window and the door go through it now: zombies/pathfinding.js)
}
export const GAPS = [[0, 9], [0, 33], [N - 1, 12], [N - 1, 31], [10, 0], [31, 0], [14, N - 1], [29, N - 1]];
export const nearGap = (i, j, r) => GAPS.some(([a, b]) => Math.abs(a - i) + Math.abs(b - j) <= r);
