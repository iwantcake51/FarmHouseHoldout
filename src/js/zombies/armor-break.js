// Armour coming off a zombie (zombies/damage.js wears it down: wearArmor). Half worn through, a piece cracks: a sharp
// tick, a few chips or sparks off it, and it goes dark and battered (crackArmor). Worn through, it breaks: a loud crack,
// and the piece splits along a jagged line and comes away in two, each half tumbling off the body away from the hit,
// bouncing on the ground with a clatter and settling flat, then fading after a while (breakArmor, stepArmorBits). The
// boxes the piece was built of (tagged as it was built: zArmor, zombies/zombie-kit.js) are copied into the falling
// halves and folded away to nothing on the zombie, so what was under it (the shirt, the hair) shows where it was.
import { scene, V3 } from '../core/renderer.js';
import { clamp, rr } from '../core/math.js';
import { lam } from '../core/shaders.js';
import { dustBurst, sparkBurst } from '../effects/puffs.js';
import { ARMOR_KIT } from './damage.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { netRec } from '../net/sync.js';

// the falling halves: how long they lie before fading and how long the fade takes (s), gravity, how much of a fall's
// speed a bounce gives back and how much sliding it keeps, the most lying about at once, and how dark a cracked piece goes
const ARMOR_BITS = { life: 10, fade: 1.6, g: 11, bounce: 0.3, fric: 0.55, max: 24, dark: 0.68 };
// the parts a piece can be on (a helmet on the head, a vest on the trunk, pads on the shins, a holster on the thigh)
const ARM_PARTS = ['head', 'torso', 'legL', 'legR', 'shinL', 'shinR'];
const bits = [];
const _abP = new V3(), _abQ = new THREE.Quaternion(), _abS = new V3(), _abX = new V3();

// each mesh's boxes of the piece on slot
function pieceBoxes(z, slot) {
  const out = [];
  for (const p of ARM_PARTS) { const mesh = z.m[p], arm = mesh && mesh.userData.arm; if (!arm) continue; const bx = arm.filter(b => b.slot === slot && !b.gone); if (bx.length) out.push([mesh, bx]); }
  return out;
}
// where on the body a piece is, for its sound and its chips
function pieceAt(z, slot) { const m = z.m[slot === 'legs' ? 'shinL' : slot]; if (!m) return null; m.updateMatrixWorld(true); return m.getWorldPosition(new V3()); }

// half worn through: battered dark, and a tick and a few chips off it
export function crackArmor(z, slot) {
  const A = z.armor && z.armor[slot]; if (!A || A.cracked || A.broken) return; A.cracked = true;
  netRec('ac', slot);
  const metal = !!(ARMOR_KIT[A.kind] || {}).metal;
  for (const [mesh, bx] of pieceBoxes(z, slot)) {
    const c = mesh.geometry.attributes.color;
    for (const b of bx) { const k = ARMOR_BITS.dark * rr(0.9, 1.1); for (let q = 0; q < 36; q++) { const i = b.v + q; c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); } }
    c.needsUpdate = true;
  }
  const at = pieceAt(z, slot); if (!at) return;
  soundAt(z.x, z.z, () => SFX.armorChip(metal));
  if (metal) sparkBurst(at.x, at.y, at.z, 4, 0, 0, 0.6); else dustBurst(at.x, at.y, at.z, 4, 0, 0, 0.5);
}

// worn through: it splits and falls off, away from the hit (dx, dz)
export function breakArmor(z, slot, dx, dz) {
  const A = z.armor && z.armor[slot]; if (!A || A.broken) return; A.broken = true; A.hp = 0;
  netRec('a', slot);
  const metal = !!(ARMOR_KIT[A.kind] || {}).metal, dl = Math.hypot(dx || 0, dz || 0) || 1, hx = (dx || 0) / dl, hz = (dz || 0) / dl;
  z.m.g.updateMatrixWorld(true);
  for (const [mesh, bx] of pieceBoxes(z, slot)) {
    const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color;
    // a jagged split across the piece, side to side (a pad or a holster on its own just comes off whole)
    const cut = rr(-0.035, 0.035), sides = slot === 'legs' ? [0] : [-1, 1];
    for (const sd of sides) {
      const P = [], N = [], C = [];
      for (const b of bx) {
        let lo = 1e9, hi = -1e9;
        for (let q = 0; q < 36; q++) { const x = pos.getX(b.v + q); if (x < lo) lo = x; if (x > hi) hi = x; }
        if ((sd < 0 && lo >= cut) || (sd > 0 && hi <= cut)) continue;   // all on the other side of the split
        for (let q = 0; q < 36; q++) {
          const i = b.v + q; let x = pos.getX(i); if (sd < 0) x = Math.min(x, cut + (pos.getY(i) * 0.25)); else if (sd > 0) x = Math.max(x, cut + (pos.getY(i) * 0.25));   // (the split leans a little: it's a crack, not a cut)
          P.push(x, pos.getY(i), pos.getZ(i)); N.push(nor.getX(i), nor.getY(i), nor.getZ(i)); C.push(col.getX(i), col.getY(i), col.getZ(i));
        }
      }
      if (P.length) spawnBit(mesh, P, N, C, sd, hx, hz, slot, metal);
    }
    // fold the piece away on the zombie: each box shrunk to a point
    for (const b of bx) { b.gone = true; const x = pos.getX(b.v), y = pos.getY(b.v), zz = pos.getZ(b.v); for (let q = 1; q < 36; q++) pos.setXYZ(b.v + q, x, y, zz); }
    pos.needsUpdate = true; g.computeBoundingSphere();
  }
  const at = pieceAt(z, slot);
  soundAt(z.x, z.z, () => SFX.armorCrack(metal));
  if (at) { if (metal) sparkBurst(at.x, at.y, at.z, 9, hx, hz, 1); dustBurst(at.x, at.y, at.z, metal ? 4 : 8, hx, hz, 0.8); }
}

// a half of a piece, out of mesh's frame into the world, sent off: side (sd) away from the split, away from the hit
function spawnBit(mesh, P, N, C, sd, hx, hz, slot, metal) {
  let cx = 0, cy = 0, cz = 0; const n = P.length / 3;
  for (let i = 0; i < P.length; i += 3) { cx += P[i]; cy += P[i + 1]; cz += P[i + 2]; } cx /= n; cy /= n; cz /= n;
  for (let i = 0; i < P.length; i += 3) { P[i] -= cx; P[i + 1] -= cy; P[i + 2] -= cz; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeBoundingSphere();
  const mat = lam(0xffffff, { vertexColors: true, transparent: true }), m = new THREE.Mesh(g, mat);
  mesh.matrixWorld.decompose(_abP, _abQ, _abS);
  m.position.set(cx, cy, cz).multiply(_abS).applyQuaternion(_abQ).add(_abP); m.quaternion.copy(_abQ); m.scale.copy(_abS);
  m.castShadow = true; scene.add(m);
  // off sideways from the split (the part's own side-to-side, in the world), away from the hit, and up: a helmet pops
  // off, a plate slumps away
  _abX.set(1, 0, 0).applyQuaternion(_abQ);
  const up = slot === 'head' ? rr(1.6, 2.6) : slot === 'torso' ? rr(0.6, 1.3) : rr(0.4, 0.9), out = slot === 'head' ? rr(1.2, 2.2) : rr(0.7, 1.4), side = sd ? rr(0.5, 1.1) : 0;
  const v = new V3(hx * out + _abX.x * sd * side + rr(-0.2, 0.2), up, hz * out + _abX.z * sd * side + rr(-0.2, 0.2));
  const w = new V3(rr(-7, 7), rr(-5, 5), rr(-7, 7)).multiplyScalar(slot === 'head' ? 1 : 0.6);
  const r = Math.max(0.02, g.boundingSphere.radius * _abS.x * 0.35);   // (how far its middle sits off the ground lying down: they're thin)
  bits.push({ m, v, w, r, t: 0, rest: false, metal, last: 0 });
  while (bits.length > ARMOR_BITS.max) dropBit(0);
}
function dropBit(i) { const b = bits[i]; scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); bits.splice(i, 1); }

// every frame: the halves falling, bouncing and settling flat, then fading
export function stepArmorBits(dt) {
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i], m = b.m; b.t += dt;
    if (!b.rest) {
      b.v.y -= ARMOR_BITS.g * dt; m.position.addScaledVector(b.v, dt);
      m.rotation.x += b.w.x * dt; m.rotation.y += b.w.y * dt; m.rotation.z += b.w.z * dt;
      if (m.position.y < b.r) {
        m.position.y = b.r;
        if (b.v.y < -1.2) {   // a bounce, with a clatter as loud as it lands
          const hit = clamp(-b.v.y / 5, 0.15, 1); b.v.y = -b.v.y * ARMOR_BITS.bounce; b.v.x *= ARMOR_BITS.fric; b.v.z *= ARMOR_BITS.fric; b.w.multiplyScalar(0.45);
          if (b.t - b.last > 0.08) { b.last = b.t; soundAt(m.position.x, m.position.z, () => b.metal ? SFX.metalDrop(hit * 0.8, true) : SFX.plankDrop(hit * 0.6)); }
        } else { b.v.y = 0; b.v.x *= Math.exp(-dt * 7); b.v.z *= Math.exp(-dt * 7); b.w.multiplyScalar(Math.exp(-dt * 9)); }
      }
      // lying down: it tips over onto its nearest flat side
      if (m.position.y <= b.r + 1e-3) {
        const flat = a => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
        m.rotation.x += (flat(m.rotation.x) - m.rotation.x) * Math.min(1, dt * 6); m.rotation.z += (flat(m.rotation.z) - m.rotation.z) * Math.min(1, dt * 6);
        if (Math.hypot(b.v.x, b.v.y, b.v.z) < 0.05 && b.w.lengthSq() < 0.01 && b.t > 0.5) b.rest = true;
      }
    }
    const f = b.t - ARMOR_BITS.life; if (f > 0) { m.material.opacity = 1 - f / ARMOR_BITS.fade; if (f >= ARMOR_BITS.fade) dropBit(i); }
  }
}
// a new run: none lying about
export function clearArmorBits() { while (bits.length) dropBit(bits.length - 1); }
