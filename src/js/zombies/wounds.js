// Wounds: where a bullet goes into a zombie and where it comes out, and what's left when part of a limb is shot away.
// They aren't pieces stuck on: they're painted by the same shader as the blood on it (effects/body-blood.js), up to
// WOUND_N on each zombie, each a point in the frame of the part it's on as that shader sees it (the head, the chest,
// an arm from the shoulder down, a leg from the hip down, all at rest), so they move with the body, ragdoll and all,
// and cost nothing to draw. A bullet hole: black in a dark ring, blood running down from it. A headshot that kills
// mostly leaves the head on: a small hole going in, the back of the skull blown out (pale bone round a dark crater),
// and what was in it sprayed out behind. An arm or a leg shot through below the elbow or knee loses just that much
// first: the forearm or shin comes off at the joint, the raw end left with a stub of bone sticking out.

import { scene, V3 } from '../core/renderer.js';
import { rand, rr } from '../core/math.js';
import { lam } from '../core/shaders.js';
import { WOUND_N } from '../effects/body-blood.js';
import { run } from '../game/run-state.js';
import { splatLater, spray } from '../effects/blood-map.js';
import { burst, gibs } from '../effects/particles.js';
import { fx } from '../effects/puffs.js';
import { flingPart, goCrawl, LIMB_STAGGER } from './damage.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { netRec, NREP } from '../net/sync.js';

export const WOUND_ZONE = { torso: 0, armL: 1, armR: 2, legL: 3, legR: 4, head: 5 };
// each part's box as the shader sees it (lo, hi): an arm or a leg reaches on past its joint while the forearm or shin
// is still on (zombies/zombie-anim.js: Z_ELBOW, Z_KNEE)
function woundBox(z, part) {
  if (part === 'head') return [[-0.16, -0.16, -0.16], [0.16, 0.16, 0.16]];
  if (part === 'torso') return [[-0.25, -0.3, -0.15], [0.25, 0.3, 0.15]];
  const cut = z.cut && z.cut[part];
  if (part[0] === 'a') return [[-0.07, -0.07, -0.02], [0.07, 0.07, cut ? 0.27 : 0.54]];
  return [[-0.095, cut ? -0.29 : -0.55, -0.11], [0.095, 0, 0.11]];
}
export const _wInv = new THREE.Matrix4(), _wD = new V3(), _wP = new V3(), _wB = new V3();
// a shot travelling (dx, dz) through part: where it goes in and comes out, in the part's frame. It passes through a
// point inside the part (the head's near its middle, eyes to brow, as that's what's aimed at)
function woundPath(z, part, dx, dz) {
  const mesh = z.m[part]; if (!mesh || !mesh.parent) return null;
  mesh.updateWorldMatrix(true, false); _wInv.copy(mesh.matrixWorld).invert();
  _wD.set(dx, 0, dz).transformDirection(_wInv);
  const [lo, hi] = woundBox(z, part), k = part === 'head' ? 0.45 : 0.75;
  for (let i = 0; i < 3; i++) _wP.setComponent(i, (lo[i] + hi[i]) / 2 + rr(-1, 1) * (hi[i] - lo[i]) / 2 * k);
  if (part === 'head') _wP.y = rr(-0.07, 0.06);
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    const d = _wD.getComponent(i), p = _wP.getComponent(i);
    if (Math.abs(d) < 1e-6) continue;
    let a = (lo[i] - p) / d, b = (hi[i] - p) / d; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  if (!(t0 < t1) || !isFinite(t0)) return null;
  return { zone: WOUND_ZONE[part], inn: _wP.clone().addScaledVector(_wD, t0), out: _wP.clone().addScaledVector(_wD, t1) };
}
// a wound on z: zone, p in that part's frame, radius r, kind 0 a hole, 1 an exit, 2 a stump. When they're all used a
// new one goes over the oldest hole; exits and stumps stay
export function addWound(z, zone, p, r, kind) {
  const st = z.stain; if (!st) return;
  const u = st.u, n = u.uWoundN.value, K = u.uWoundK.value, age = st.wAge || (st.wAge = []);
  let i = n;
  if (n >= WOUND_N) { let best = Infinity; for (let k = 0; k < WOUND_N; k++) { const a = age[k] + (K[k] >= 10 ? 1e6 : 0); if (a < best) { best = a; i = k; } } }
  else u.uWoundN.value = n + 1;
  u.uWound.value[i].set(p.x, p.y, p.z, r); K[i] = zone + 10 * kind; age[i] = st.wSeq = (st.wSeq || 0) + 1;
}
// a bullet hitting part: a hole where it goes in, sized by the round; a big round can come out the far side, and one
// through the head that kills (or nearly takes it off) blows the back of it open
export function shotWound(z, part, dx, dz, D, dealt, kill) {
  if (!z.stain || D.melee) return;
  const wp = woundPath(z, part, dx, dz); if (!wp) return;
  const pellet = D.ammo === 'shells', big = D.ammo === 'magnum' || D.ammo === 'rifle' || (D.dmg || 0) >= 60;
  const r = pellet ? rr(0.014, 0.018) : big ? rr(0.026, 0.032) : rr(0.019, 0.024);
  addWound(z, wp.zone, wp.inn, r, 0);
  if (part === 'head') { if (kill || dealt >= 70) addWound(z, wp.zone, wp.out, big || pellet ? rr(0.08, 0.095) : rr(0.065, 0.078), 1); }
  else if (big && !pellet && rand() < 0.5) addWound(z, wp.zone, wp.out, r * 1.9, 0);
}
// the kill shot through the head, the head left on: the back of it sprays out along the shot (blood, a pink mist, a
// few chips of bone and scalp) and the head's thrown back on its neck
const CHIP_G = new THREE.BoxGeometry(0.045, 0.02, 0.04), CHIP_M = [lam(0xd8cdb6), lam(0x7a1410), lam(0x4e0b08)];
CHIP_M.forEach(m => { m.userData.mobile = true; });
export function headShot(z, dx, dz) {
  const head = z.m.head; if (!head || !head.parent || !z.limbs.head) return;
  netRec('h');
  head.getWorldPosition(_wB);
  const bx = _wB.x + dx * 0.17, by = _wB.y + 0.02, bz = _wB.z + dz * 0.17;
  burst(bx, by, bz, 14, 'blood', dx, dz, 5.4);
  for (let k = 0; k < 4; k++) { const s = rr(1.4, 3.2); fx('mist', bx + rr(-0.05, 0.05), by + rr(-0.05, 0.08), bz + rr(-0.05, 0.05), dx * s + rr(-0.5, 0.5), rr(0, 0.8), dz * s + rr(-0.5, 0.5), rr(0.1, 0.16), rr(0.5, 0.8), rr(0.35, 0.6), 0.45); }
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Mesh(CHIP_G, CHIP_M[k % 3]); c.position.set(bx, by, bz); c.rotation.set(rr(0, 6), rr(0, 6), rr(0, 6)); c.scale.setScalar(rr(0.6, 1.1)); c.castShadow = true; scene.add(c);
    gibs.push({ m: c, vx: dx * rr(2.5, 4.5) + rr(-1, 1), vy: rr(1.5, 3.2), vz: dz * rr(2.5, 4.5) + rr(-1, 1), spin: rr(8, 16), life: 6, landed: false });
  }
  spray(bx, bz, dx, dz, rr(1.5, 2.3)); splatLater(0.3, bx + dx * rr(1.2, 2), bz + dz * rr(1.2, 2), 'spray', rr(0.8, 1.2), Math.atan2(dz, dx));
  z.spurts.push({ part: 'head', t: 1.2, o: head, p: [0, 0, 0] });   // (its sound is the kill's own: zombies/damage.js killZombie)
}
// an arm's forearm or a leg's shin shot off at the joint: it flies off like a severed limb, the end left raw with the
// bone showing (a stump wound and a stub of bone), and the limb can still come off whole later. A leg without its
// shin can't take a step: it goes down to crawl, the same as one without the leg
const BONE_G = new THREE.BoxGeometry(0.036, 0.036, 0.06), BONE_M = lam(0xe2d9c4); BONE_M.userData.mobile = true;
export function severLower(z, part, dx, dz) {
  const arm = part[0] === 'a', key = (arm ? 'fore' : 'shin') + part.slice(3), low = z.m[key];
  if (!low || !low.parent || !z.limbs[part] || (z.cut && z.cut[part]) || (!arm && z.type === 'brute')) return false;   // (a brute's legs stay on: zombies/damage.js sever)
  (z.cut || (z.cut = {}))[part] = true; netRec('l', part);
  flingPart(z, low, dx, dz, 0.8);
  z.m[key] = new THREE.Object3D();   // a stand-in for the poses to bend (zombies/zombie-anim.js, zombies/deaths.js)
  const end = arm ? _wP.set(0, 0, 0.27) : _wP.set(0, -0.29, 0);
  addWound(z, WOUND_ZONE[part], end, arm ? 0.085 : 0.11, 2);
  const b = new THREE.Mesh(BONE_G, BONE_M); b.castShadow = true;
  if (arm) b.position.set(rr(-0.01, 0.01), rr(-0.01, 0.01), 0.29); else { b.position.set(rr(-0.01, 0.01), -0.31, rr(-0.01, 0.01)); b.rotation.x = Math.PI / 2; }
  z.m[part].add(b);
  z.spurts.push({ part, t: 1.2, o: z.m[part], p: arm ? [0, 0, 0.28] : [0, -0.3, 0] });   // from the stump
  if (!NREP) run.limbs++; z.stagger = Math.max(z.stagger || 0, LIMB_STAGGER * 0.7);
  soundAt(z.x, z.z, () => SFX.sever());
  if (!arm && !z.crawl && !z.dead) goCrawl(z);
  return true;
}
