// Elites: now and then one of the horde is something more. From ELITE.from a zombie coming in has a small chance
// (more each wave, up to ELITE.max) of being one of the kinds below, rolled with the rest of its spawn, so in co-op the
// host's roll comes out the same everywhere (net/sync.js: netSpawn). Each is told apart from the rest at a glance: its
// eyes burn its own colour, and a ring of that colour pulses on the ground under it (seen from above and from your own
// eyes alike, and through cover in its colour). Each kind plays differently, and each one put down pays out (eliteLoot,
// zombies/damage.js): scrap and a guaranteed drop.
//  - Hulking: bigger, far tougher and hits harder, a little slower: something to empty a mag into
//  - Frenzied: fast and quick with its claws, burning red: something to put down before it reaches you
//  - Volatile: swollen with bile, glowing sores all over it, and it bursts when it dies, the blast and its acid hurting
//    everything round it, zombies and you: something to shoot in the middle of the crowd, not at the window

import { GLOW_LAYER } from '../effects/post.js';
import { rand, rr } from '../core/math.js';
import { basic } from '../core/shaders.js';
import { run } from '../game/run-state.js';
import { toast } from '../ui/hud-text.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { P } from '../player/player.js';
import { S } from '../game/run-state.js';
import { hitFromAt } from '../ui/hud.js';
import { interruptBandage } from '../player/bandages.js';
import { flashes } from '../weapons/explosives.js';
import { setLmT, setShake, shake } from '../game/state.js';
import { burst } from '../effects/particles.js';
import { zombies } from './zombie-types.js';
import { hurtZombie } from './damage.js';
import { bileBurst } from './spitter.js';

const ELITE = { from: 3, p: 0.035, per: 0.005, max: 0.09 };
// (and on a blood moon, waves/waves.js: TWISTS, that many times as often, up to its own most)
const BLOOD_ELITE = { k: 4, max: 0.3 };
// each kind: who it can be (types), how it's weighted, and what it does to them: health (hp), size (scale), pace
// (speed), the hit (dmg), how quickly it claws again (atk: its swing timer runs that much faster), its colour (col: eyes
// and ring) and its loot (scrap, and how likely a second drop is)
export const ELITE_KIND = {
  hulk: { name: 'Hulking', w: 1, types: ['walker', 'brute'], hp: 2.6, scale: 1.16, speed: 0.88, dmg: 1.3, atk: 1, col: 0xa66bff, scrap: 6, more: 0.6 },
  frenzy: { name: 'Frenzied', w: 1, types: ['walker', 'runner'], hp: 1.5, scale: 1, speed: 1.4, dmg: 1.1, atk: 1.6, col: 0xff2a24, scrap: 4, more: 0.4 },
  volatile: { name: 'Volatile', w: 0.8, from: 5, types: ['walker'], hp: 1.6, scale: 1.05, speed: 0.95, dmg: 1, atk: 1, col: 0x4dff5a, scrap: 5, more: 0.5 }
};
// the ring under it (metres across, in its own scale: inner and outer radius, how much it pulses, how fast)
const ELITE_CALL = 8;
const ELITE_RING = { r0: 0.42, r1: 0.56, pulse: 0.35, hz: 1.6 };
// the burst (VOLATILE: how far it reaches, what it does to a zombie at its middle (down to a share at its edge), to you
// within you.r of it, and how hard it throws them)
const VOLATILE = { r: 2.8, dmg: 95, edge: 0.35, you: { r: 2.2, dmg: 22 }, kb: 5 };
const RING_G = new THREE.RingGeometry(ELITE_RING.r0, ELITE_RING.r1, 40).rotateX(-Math.PI / 2);

// the roll for a zombie coming in (inside its spawn: its seeded rand), and the kind if it comes up
export function rollElite(type) {
  const bm = run.twist === 'bloodmoon', p = (ELITE.p + ELITE.per * (run.wave - ELITE.from)) * (bm ? BLOOD_ELITE.k : 1);
  if (run.wave < ELITE.from || rand() > Math.min(bm ? BLOOD_ELITE.max : ELITE.max, p)) return null;
  const ok = Object.keys(ELITE_KIND).filter(k => ELITE_KIND[k].types.includes(type) && run.wave >= (ELITE_KIND[k].from || 0));
  if (!ok.length) return null;
  let t = rand() * ok.reduce((a, k) => a + ELITE_KIND[k].w, 0);
  for (const k of ok) { t -= ELITE_KIND[k].w; if (t <= 0) return k; }
  return ok[ok.length - 1];
}
// its look, before its eyes are made (they take m.eyeCol): the colour, its ring, and a volatile's swollen, sore body
export function eliteLook(m, kind) {
  const K = ELITE_KIND[kind];
  m.eyeCol = K.col; m.eyeGlow = new THREE.Color(K.col);
  const ring = new THREE.Mesh(RING_G, new THREE.MeshBasicMaterial({ color: K.col, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.position.y = 0.03; ring.renderOrder = 3; ring.layers.enable(GLOW_LAYER); ring.castShadow = false; m.g.add(ring);
  if (kind === 'volatile') {
    m.torso.scale.multiply(new THREE.Vector3(1.14, 1.04, 1.3));
    const sore = basic(K.col), G = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2, y = rr(-0.18, 0.2), s = rr(0.022, 0.042), o = new THREE.Mesh(G, sore);
      o.position.set(Math.sin(a) * 0.15, y, Math.cos(a) * 0.1); o.scale.setScalar(s); o.layers.enable(GLOW_LAYER); m.torso.add(o);
    }
  }
  return ring;
}
// a zombie made one (zombies/spawn.js): what it does differently, and the call that one's coming
export function makeElite(z, kind, ring) {
  const K = ELITE_KIND[kind];
  z.elite = { kind, ring, ph: rand() * 6.28 };
  z.speed *= K.speed; z.T.dmg *= K.dmg; z.T.bdps *= K.dmg; z.atkK = K.atk;
  soundAt(z.x, z.z, () => SFX.groan(1.1, z.voice * 0.8, z.type), true);
  if (run.time - (run.eliteCall ?? -1e9) < ELITE_CALL) return; run.eliteCall = run.time;   // (called out no more than once in ELITE_CALL seconds: a blood moon's are many)
  toast(K.name + ' one coming', { kind: 'warn', icon: 'gear', sub: kind === 'volatile' ? 'It bursts when it dies: keep it off the house' : kind === 'frenzy' ? 'Fast and vicious: drop it before it reaches you' : 'Tough as a wall: worth the ammo, it pays' });
}
// the ring's pulse, each frame (zombies/zombie-visuals.js), and gone with it once it's dead
export function eliteTick(z, t) {
  const e = z.elite; if (!e) return;
  if (z.dead) { e.ring.visible = false; return; }
  const p = 0.5 + 0.5 * Math.sin(t * ELITE_RING.hz * Math.PI * 2 + e.ph);
  e.ring.material.opacity = 0.42 + 0.3 * p; e.ring.scale.setScalar(1 + ELITE_RING.pulse * 0.25 * p);
}
// a volatile one down: it bursts a beat after it falls (not inside the kill, so a chain of them goes off one after another
// rather than all inside the first), the bile and its acid everywhere, everything near it hurt and thrown back. It
// bursts on everyone's screen; what it does to the zombies is done once, by whoever killed it (mine), and what it does to
// you by each player's own game
const BURSTS = [], BURST_DELAY = 0.14;
export function eliteDies(z, mine) { if (z.elite && z.elite.kind === 'volatile') BURSTS.push({ x: z.x, z: z.z, t: BURST_DELAY, mine }); }
export function clearBursts() { BURSTS.length = 0; }
export function updateBursts(dt) {
  for (let i = BURSTS.length - 1; i >= 0; i--) {
    const b = BURSTS[i]; if ((b.t -= dt) > 0) continue; BURSTS.splice(i, 1);
    const V = VOLATILE, col = new THREE.Color(ELITE_KIND.volatile.col);
    bileBurst(b.x, b.z); burst(b.x, 1.0, b.z, 26, 'blood', 0, 0, 6);
    flashes.push({ x: b.x, y: 0.9, z: b.z, r: V.r * 2.6, int: 2.2, col: [col.r, col.g, col.b], t: 0.35, max: 0.35 }); setLmT(0);
    soundAt(b.x, b.z, () => { SFX.crush(); SFX.boom(Math.hypot(P.x - b.x, P.z - b.z), 1.4); }, true);
    const dp = Math.hypot(P.x - b.x, P.z - b.z); setShake(Math.max(shake, 0.45 * Math.max(0, 1 - dp / 9)));
    if (!P.dead && dp < V.you.r) { P.hp -= V.you.dmg * (1 - 0.6 * dp / V.you.r) * S.dmgTaken; hitFromAt(b.x, b.z, 1.4); interruptBandage(); }
    if (!b.mine) continue;
    for (const o of zombies.slice()) {
      if (o.dead) continue; const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz); if (d > V.r) continue;
      const f = 1 - d / V.r, nx = dx / (d || 1), nz = dz / (d || 1);
      hurtZombie(o, V.dmg * (V.edge + (1 - V.edge) * f), nx, nz, V.kb * f, 'boom', rand() < 0.3 ? 'head' : 'torso');
    }
  }
}
