// Pooled particles (blood, dust, sparks, embers, smoke) and flying gibs.

import { scene, V3 } from '../core/renderer.js';
import { rand, rr } from '../core/math.js';
import { basic, lam } from '../core/shaders.js';
import { cell, ci, cxw, FENCE, idx, inb, OBST, OPEN, openAt, WALL } from '../world/grid.js';
import { lowObst } from '../world/props.js';
import { bulletBlocked } from '../world/collision.js';
import { P, PM } from '../player/player.js';
import { splat, stepBloodMap } from './blood-map.js';
import { dustBurst, fx, sparkBurst } from './puffs.js';
import { zFree } from '../zombies/zombie-kit.js';
import { visAt } from '../lighting/vision.js';

export const parts = [];
const PG = new THREE.BoxGeometry(0.07, 0.07, 0.07);
const PMAT = { spark: basic(0xffd88a), blood: lam(0x7a1a12), blood2: lam(0x4d0f0b), wood: lam(0xa8804f), dust: lam(0x7d7564), ember: basic(0xff8a32), smoke: lam(0x3a3836) };
for (let k = 0; k < 280; k++) { const m = new THREE.Mesh(PG, PMAT.blood); m.visible = false; scene.add(m); parts.push({ m, life: 0, vx: 0, vy: 0, vz: 0, kind: 'blood', landed: false }); }
let pIdx = 0;
Object.values(PMAT).forEach(m => { m.userData.mobile = true; });
// blood droplets: teardrops in a few sizes (a few heavy drops among a fine spray), thrown well out (DROP_THROW),
// their round head leading the way they're flying and a tail drawn out behind (longer the faster they go), slowed by
// the air (the fine ones more), shrinking a little as they go; each a little flattened its own way (sq, turned round
// its path by roll) so no two are the same bead.
// Where one comes down it leaves its stain in the farm's blood map (effects/blood-map.js): a drop and its spatter on the
// ground, or at the height it hit whatever it ran into first (dropHits): a wall, a trunk, a fence post or rail, a
// crate, the bench, a window's sill or the wall over it, or the boards across it.
// They're all drawn at once, as instances of one mesh (a shotgun on a crowd throws hundreds of them, and each its own
// mesh was a draw call apiece): each drop keeps its own position, turn and size, and only the ones in the air are kept
// in liveDrops, so a quiet moment costs nothing and a big spray only what's flying. They're all one colour, DROP_COL:
// a colour per drop (instance colours) came out black through the farm's lighting, so the blood in the air read as
// dark specks
const DROP_PROFILE = [[0, -1.6], [0.22, -1.1], [0.55, -0.55], [0.86, 0], [0.96, 0.38], [0.78, 0.78], [0.42, 1.0], [0, 1.06]];
const DROP_G = new THREE.LatheGeometry(DROP_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 7); DROP_G.rotateX(Math.PI / 2);
const DROP_COL = 0x9a1a10, _dz = new V3(0, 0, 1), _dv = new V3(), _dmx = new THREE.Matrix4(), _dq = new THREE.Quaternion();
const DROP_N = 640, DROP_MAT = lam(DROP_COL); DROP_MAT.userData.mobile = true;
const dropIM = new THREE.InstancedMesh(DROP_G, DROP_MAT, DROP_N); dropIM.frustumCulled = false; dropIM.count = 0; dropIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(dropIM);
const drops = [], liveDrops = [];
for (let k = 0; k < DROP_N; k++) drops.push({ p: new V3(), q: new THREE.Quaternion(), s: new V3(), shown: false, live: false, life: 0, vx: 0, vy: 0, vz: 0, r: 0.01, wait: 0, sq: 1, roll: 0 });
let dropIdx = 0;
// the next drop from the pool (the oldest, if they're all flying), into the list of live ones
function takeDrop(r) {
  const d = drops[dropIdx = (dropIdx + 1) % DROP_N];
  if (!d.live) { d.live = true; liveDrops.push(d); }
  d.r = r; d.sq = rr(0.72, 1.12); d.roll = rand() * Math.PI; d.q.identity(); d.s.setScalar(r);
  return d;
}
// every drop out of the air (a fresh run, ui/screens.js)
export function clearDrops() { for (const d of liveDrops) { d.live = d.shown = false; d.life = 0; } liveDrops.length = 0; dropIM.count = 0; }
const DROP_THROW = 1.7, DROP_SCATTER = 1.5, DROP_DRAG = 0.6;
function bloodDrops(x, y, z, n, dirx, dirz, force) {
  for (let k = 0, c = Math.max(1, Math.round(n * 2.6)); k < c; k++) {   // (a good many: each one marks the ground where it lands)
    const big = rand() < 0.22, d = takeDrop(big ? rr(0.02, 0.036) : rr(0.007, 0.017)), f = (force || 2) * DROP_THROW * (big ? rr(0.3, 0.9) : rr(0.5, 1.45));
    d.vx = (dirx || 0) * f + rr(-1, 1) * (big ? 0.6 : 1.25) * DROP_SCATTER; d.vz = (dirz || 0) * f + rr(-1, 1) * (big ? 0.6 : 1.25) * DROP_SCATTER; d.vy = rr(0.5, 3.4) * (big ? 0.8 : 1);
    d.life = 2.6; d.wait = 0; d.p.set(x + rr(-0.05, 0.05), y + rr(-0.05, 0.05), z + rr(-0.05, 0.05)); d.shown = true;
  }
}
// a hit's blood gushing out of the body where the round (or the blade) goes through, so you see it leave: a jet of
// fat, bright drops out of the far side along (dirx, dirz), from the body's surface rather than its middle, let out
// over SPURT.t seconds instead of all at once so it reads as a stream thrown out, slow enough to follow as it arcs
// down (SPURT.v metres a second), and a little of it back out of the near side. n: how many drops (a big hit, more)
const SPURT = { t: 0.12, v: 3.6, out: 0.16, back: 0.25 };
export function bloodSpurt(x, y, z, dirx, dirz, n, power) {
  const p = power || 1;
  for (let k = 0; k < n; k++) {
    const back = k < n * SPURT.back * 0.5, s = back ? -1 : 1, d = takeDrop(rr(0.016, 0.034) * (back ? 0.8 : 1));
    const f = SPURT.v * p * rr(0.55, 1.25) * (back ? 0.45 : 1), sx = rr(-0.3, 0.3), wt = rand() * SPURT.t;
    d.wait = wt;
    d.vx = (dirx * s - dirz * sx) * f; d.vz = (dirz * s + dirx * sx) * f; d.vy = rr(0.5, 2.1) * (0.7 + 0.3 * p);
    d.life = 2.6 + wt; d.p.set(x + dirx * s * SPURT.out + rr(-0.03, 0.03), y + rr(-0.04, 0.04), z + dirz * s * SPURT.out + rr(-0.03, 0.03)); d.shown = false;
  }
}
// you bleeding: a drop or two falls from the wound (the left arm or your side) carried along at your speed, and spots the
// ground where it lands, so you leave a trail as you go and a spreading patch where you stand
const _bw = new V3();
export function bleedDrip() {
  PM.upper.updateMatrixWorld(); const arm = rand() < 0.6;
  _bw.set(arm ? -0.3 : 0.24, arm ? 0.8 : 0.95, rr(-0.05, 0.08)); PM.upper.localToWorld(_bw);
  for (let k = 0, n = rand() < 0.3 ? 2 : 1; k < n; k++) {
    const d = takeDrop(rr(0.012, 0.022));
    d.vx = P.vx * 0.85 + rr(-0.15, 0.15); d.vz = P.vz * 0.85 + rr(-0.15, 0.15); d.vy = rr(-0.4, 0.2);
    d.life = 2; d.wait = 0; d.p.copy(_bw); d.shown = true;
  }
  if (Math.hypot(P.vx, P.vz) < 0.3 && rand() < 0.22) splat(P.x + rr(-0.12, 0.12), P.z + rr(-0.12, 0.12), 'drop', rr(0.2, 0.32));
}
// whether a drop at x, y, z has run into something standing there (up to how high it stands, and only its real parts:
// a fence's post and its two rails, not the gaps between; a window's sill and the wall over it, or a board across it)
export function dropHits(x, y, z) {
  const i = ci(x), j = ci(z); if (!inb(i, j)) return false;
  const k = idx(i, j), c = cell[k];
  if (c === WALL || (c === OBST && !lowObst.has(k))) return y < 2.4;
  if (c === OBST) return y < 0.92;   // a crate, the bench, the hay: waist high
  if (c === FENCE) {
    if (y > 1.02) return false;
    const fx = Math.abs(x - cxw(i)), fz = Math.abs(z - cxw(j)), isF = (a, b) => inb(a, b) && cell[idx(a, b)] === FENCE, rail = Math.abs(y - 0.38) < 0.06 || Math.abs(y - 0.75) < 0.06;
    return (fx < 0.09 && fz < 0.09) || (rail && ((fz < 0.05 && (isF(i - 1, j) || isF(i + 1, j))) || (fx < 0.05 && (isF(i, j - 1) || isF(i, j + 1)))));
  }
  const o = c === OPEN && openAt[k]; if (!o) return false;
  if (o.boards.some((b, n) => Math.abs(y - o.ys[n]) < 0.13)) return true;
  return o.kind === 'window' ? y < 1.0 || y > 1.9 : y > 2.05;
}
function stepDrops(dt) {
  if (dt > 0) moveDrops(dt);
  // the ones in the air into the instances (when the world's frozen they hold where they are)
  let n = 0;
  for (const d of liveDrops) { if (!d.shown) continue; _dmx.compose(d.p, d.q, d.s); dropIM.setMatrixAt(n, _dmx); n++; }
  dropIM.count = n; dropIM.visible = n > 0;
  if (n) dropIM.instanceMatrix.needsUpdate = true;
}
function moveDrops(dt) {
  for (let k = liveDrops.length - 1; k >= 0; k--) {
    const d = liveDrops[k];
    if (d.life > 0) moveDrop(d, dt);
    if (d.life <= 0) { d.live = d.shown = false; liveDrops[k] = liveDrops[liveDrops.length - 1]; liveDrops.pop(); }   // (out of the list: the last one takes its place)
  }
}
function moveDrop(d, dt) {
  d.life -= dt;
  if (d.wait > 0) { d.wait -= dt; if (d.wait > 0) return; d.shown = true; }   // (a spurt's later drops, still to come out)
  const p = d.p, drag = Math.exp(-dt * (0.012 / d.r) * DROP_DRAG);
  d.vx *= drag; d.vz *= drag; d.vy = d.vy * drag - 13 * dt;
  p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
  const sp = Math.hypot(d.vx, d.vy, d.vz);
  // into something standing in its way: it splashes there, as high as it was
  if (p.y < 2.4 && dropHits(p.x, p.y, p.z)) { splat(p.x - d.vx * dt * 0.5, p.z - d.vz * dt * 0.5, 'drop', 0.06 + d.r * 4, undefined, 0, p.y + 0.15, 0.7); d.life = 0; }   // (a smaller mark: most of it's on what it hit)
  else if (p.y <= 0.015) {
    // where it lands: a mark the size of the drop, and a big one bursts into a few specks thrown on the way it was going
    splat(p.x, p.z, 'drop', 0.06 + d.r * 7);
    if (d.r > 0.02) { const h = Math.hypot(d.vx, d.vz) || 1; for (let s = 0, n = 2 + (rand() * 3 | 0); s < n; s++) { const f = rr(0.06, 0.28); splat(p.x + d.vx / h * f + rr(-0.06, 0.06), p.z + d.vz / h * f + rr(-0.06, 0.06), 'drop', rr(0.05, 0.1)); } }
    d.life = 0;
  }
  if (d.life <= 0) return;
  // head first along its path, turned its own way round it; the tail longer the faster it goes
  if (sp > 0.05) { _dv.set(d.vx / sp, d.vy / sp, d.vz / sp); d.q.setFromUnitVectors(_dz, _dv).multiply(_dq.setFromAxisAngle(_dz, d.roll)); }
  const sh = Math.max(0.55, Math.min(1, d.life / 1.2)) * d.r;
  d.s.set(sh * d.sq, sh, sh * (0.62 + Math.min(1.3, sp * 0.1)));
}
// dust, sparks, smoke and embers are soft sprites (effects/puffs.js), blood comes out as droplets, and grit stays as
// little tumbling bits
export function burst(x, y, z, n, kind, dirx, dirz, force) {
  if (kind === 'blood') return bloodDrops(x, y, z, n, dirx, dirz, force);
  if (kind === 'dust') return dustBurst(x, y, z, n, dirx, dirz, force);
  if (kind === 'spark') return sparkBurst(x, y, z, n, dirx, dirz, force);
  if (kind === 'smoke') { for (let k = 0; k < n; k++) fx('smoke', x + rr(-0.3, 0.3), y + rr(0, 0.3), z + rr(-0.3, 0.3), rr(-0.8, 0.8), rr(0.3, 1.2), rr(-0.8, 0.8), rr(0.3, 0.5), rr(1.2, 2), rr(1.4, 2.4), rr(0.3, 0.45)); return; }
  if (kind === 'ember') { for (let k = 0; k < n; k++) fx('ember', x + rr(-0.15, 0.15), y, z + rr(-0.15, 0.15), (dirx || 0) * (force || 1) + rr(-1.2, 1.2), rr(0.5, 2.6), (dirz || 0) * (force || 1) + rr(-1.2, 1.2), rr(0.06, 0.12), 0.02, rr(0.5, 1.2), 0.9); return; }
  cubeBurst(x, y, z, n, kind, dirx, dirz, force);
}
export function cubeBurst(x, y, z, n, kind, dirx, dirz, force, scl) {
  for (let k = 0; k < n; k++) {
    const p = parts[pIdx = (pIdx + 1) % parts.length];
    const isBlood = kind === 'blood';
    p.kind = kind; p.landed = false;
    p.m.material = isBlood ? (rand() < .5 ? PMAT.blood : PMAT.blood2) : PMAT[kind]; p.m.visible = true; p.m.position.set(x, y, z);
    p.m.scale.setScalar((isBlood ? rr(.4, 1.3) : rr(.6, 1.6)) * (scl || 1));
    p.vx = (dirx || 0) * (force || 2) * rr(.3, 1.2) + rr(-1.1, 1.1); p.vz = (dirz || 0) * (force || 2) * rr(.3, 1.2) + rr(-1.1, 1.1); p.vy = rr(0.8, 3.6);
    p.life = rr(1.2, 2.2);
    if (kind === 'spark') { p.life = rr(0.08, 0.24); p.m.scale.setScalar(rr(0.25, 0.5)); p.vx *= 1.6; p.vz *= 1.6; p.vy = rr(0.5, 3); }
  }
}
export const gibs = [];
// blood and dust particles, growing decals and flying gibs
export function stepParticles(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue; p.life -= dt;
    const m = p.m;
    if (p.kind === 'smoke') { m.position.y += dt * 1.2; m.position.x += p.vx * dt * 0.2; m.position.z += p.vz * dt * 0.2; m.scale.setScalar(Math.min(4, m.scale.x + dt * 3)); }
    else if (p.kind === 'ember' && p.vy < 3) { m.position.y += dt * 1.5; m.position.x += p.vx * dt * 0.3; m.position.z += p.vz * dt * 0.3; }
    else if (m.position.y > 0.035) { p.vy -= 14 * dt; m.position.x += p.vx * dt; m.position.y += p.vy * dt; m.position.z += p.vz * dt; m.rotation.x += dt * 8; }
    else {
      m.position.y = 0.035; p.vx = p.vz = 0;
      if (!p.landed) { p.landed = true; if (p.kind === 'blood') { if (rand() < 0.55) splat(m.position.x, m.position.z, 'drop', rr(0.12, 0.3)); p.life = Math.min(p.life, 0.05); } }
    }
    if (p.life < 0.4) m.scale.setScalar(Math.max(0.01, p.life / 0.4) * (p.kind === 'smoke' ? 3 : 1));
    if (p.life <= 0) m.visible = false;
  }
  stepDrops(dt);
  const gdt = P.dead ? P.deathDt || 0 : dt;   // the world is frozen once you're down, but the blood in the air still lands
  stepBloodMap(gdt);   // new splashes into the farm's blood map (effects/blood-map.js)
  for (let k = gibs.length - 1; k >= 0; k--) {
    const g = gibs[k]; g.life -= dt;
    if (!g.landed) {
      g.vy -= 14 * dt; g.m.position.x += g.vx * dt; g.m.position.y += g.vy * dt; g.m.position.z += g.vz * dt; g.m.rotation.x += g.spin * dt; g.m.rotation.z += g.spin * 0.6 * dt;
      if (bulletBlocked(g.m.position.x, g.m.position.z)) { g.vx *= -0.3; g.vz *= -0.3; }
      if (rand() < 0.5) burst(g.m.position.x, g.m.position.y, g.m.position.z, 1, 'blood', 0, 0, 0.3);
      if (g.m.position.y < 0.12) { g.m.position.y = 0.12; if (Math.abs(g.vy) > 2) { g.vy *= -0.35; g.vx *= 0.5; g.vz *= 0.5; splat(g.m.position.x, g.m.position.z, 'drop', rr(.4, .6)); } else { g.landed = true; splat(g.m.position.x, g.m.position.z, 'drop', rr(0.3, 0.45)); } }
    }
    g.m.visible = visAt(g.m.position.x, g.m.position.z) > 0.2;
    if (g.life < 1) g.m.position.y -= dt * 0.3;
    if (g.life <= 0) { scene.remove(g.m); zFree(g.m); gibs.splice(k, 1); }
  }
}
