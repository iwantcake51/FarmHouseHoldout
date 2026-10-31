// Elites: now and then one of the horde is something more. From ELITE.from a zombie coming in has a small chance
// (more each wave, up to ELITE.max) of being one of the kinds below, rolled with the rest of its spawn, so in co-op the
// host's roll comes out the same everywhere (net/sync.js: netSpawn). Each is told apart from the rest by its eyes, which
// burn its own colour (and it's seen through cover in that colour), and each is called out as it comes in, with its
// own card (ui/hud-text.js: eliteCall). Each kind plays differently, and each one put down pays out (zombies/damage.js):
// scrap and a guaranteed drop.
//  - Hulking: bigger, five times as tough and hits far harder, a little slower: something to empty mags into
//  - Frenzied: fast and quick with its claws, burning red: something to put down before it reaches you
//  - Volatile: swollen, glowing sores all over it, and it bursts when it dies into a cloud of red mist that hangs in the
//    air: close enough and it hurts you and leaves you reeling; the zombies round it are only thrown back and staggered

import { rand, rr } from '../core/math.js';
import { basic } from '../core/shaders.js';
import { eliteCall } from '../ui/hud-text.js';
import { GLOW_LAYER } from '../effects/post.js';
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
import { zAnimHit } from './zombie-anim.js';
import { killZombie } from './damage.js';
import { smoke } from '../effects/smoke.js';
import { goreAt } from '../ui/screen-blood.js';
import { splat } from '../effects/blood-map.js';

const ELITE = { from: 3, p: 0.035, per: 0.005, max: 0.09 };
// (and on a blood moon, waves/waves.js: TWISTS, that many times as often, up to its own most)
const BLOOD_ELITE = { k: 4, max: 0.3 };
// each kind: who it can be (types), how it's weighted, and what it does to them: health (hp), size (scale), pace
// (speed), the hit (dmg), how quickly it claws again (atk: its swing timer runs that much faster), its colour (col: its
// eyes and its card), its loot (scrap, and how likely a second drop is), and its card: its icon (GI, ui/game-icons.js),
// what it does (does) and its numbers (stats), and the line when it's down
// any of them can be a walker, a sprinter or a brute (never a spitter); a brute one takes ELITE_BRUTE.hp of the kind's
// health (it's a brute's to start with), and every elite has a brute's hide (zombies/damage.js: ELITE_HIDE)
const ELITE_TYPES = ['walker', 'runner', 'brute'];
export const ELITE_BRUTE = { hp: 0.6, burst: 1.3 };
export const ELITE_KIND = {
  hulk: { name: 'Hulking', w: 1, types: ELITE_TYPES, hp: 5, scale: 1.18, speed: 0.88, dmg: 1.8, atk: 1, col: 0xa66bff, scrap: 12, more: 0.9,
    icon: 'brute', does: 'Bigger and far tougher, and every hit it lands is brutal', stats: '×5 health · ×1.8 damage · 40% damage reduction', down: 'The big one\'s down' },
  frenzy: { name: 'Frenzied', w: 1, types: ELITE_TYPES, hp: 3, scale: 1.03, speed: 1.5, dmg: 1.4, atk: 1.8, col: 0xff2a24, scrap: 9, more: 0.8,
    icon: 'enrage', does: 'Runs you down far faster than the rest and claws without letting up', stats: '×1.5 speed · ×1.8 attack speed · ×3 health · 40% damage reduction', down: 'The screaming\'s stopped' },
  volatile: { name: 'Volatile', w: 0.8, from: 5, types: ELITE_TYPES, hp: 3, scale: 1.06, speed: 0.95, dmg: 1.3, atk: 1, col: 0x4dff5a, scrap: 10, more: 0.85,
    icon: 'gooBurst', does: 'Bursts into a cloud of red mist when it dies or gets close to you: it hurts and dazes you, and staggers the zombies round it', stats: '3.8 m burst · goes off when it reaches you · ×3 health · 40% damage reduction', down: 'Popped' }
};
// the burst (VOLATILE: how far it reaches the zombies round it, how long it staggers one at its middle (s, and at its
// edge s0) and how hard it throws them (kb, a brute only stag of it); you within you.r of it: how much it hurts at its
// middle and how long it leaves you reeling (daze: the screen swimming, your aim going wide, slowed); and its cloud:
// mist puffs of red, how far they spread, how big they grow and how long they hang in the air)
const VOLATILE = { r: 4.4, s: 1.6, s0: 0.5, kb: 6, brute: 0.35, you: { r: 3.8, dmg: 35, daze: 1, slow: 0.45 },
  mist: { n: 22, r: 2, s0: [0.6, 1.1], s1: [2.4, 3.6], life: [2.6, 4.2], a: 0.6, col: [0x8e1010, 0x6a0808, 0xa82018] } };

// the roll for a zombie coming in on wave n (tw: its twist), and the kind if it comes up
function rollElite(type, n, tw) {
  const bm = tw === 'bloodmoon', p = (ELITE.p + ELITE.per * (n - ELITE.from)) * (bm ? BLOOD_ELITE.k : 1);
  if (n < ELITE.from || rand() > Math.min(bm ? BLOOD_ELITE.max : ELITE.max, p)) return null;
  const ok = Object.keys(ELITE_KIND).filter(k => ELITE_KIND[k].types.includes(type) && n >= (ELITE_KIND[k].from || 0));
  if (!ok.length) return null;
  let t = rand() * ok.reduce((a, k) => a + ELITE_KIND[k].w, 0);
  for (const k of ok) { t -= ELITE_KIND[k].w; if (t <= 0) return k; }
  return ok[ok.length - 1];
}
// a wave's elites settled as it starts (waves/waves.js: startWave, the host's): each zombie queued for it rolled, and an
// elite marked on its entry ('walker:hulk'), so the wave knows from the start how many it's bringing, and every screen
// spawns the same ones (net/sync.js: netSpawn sends the entry as it is). How many of each kind, for the call (eliteWave)
export function planElites(q, n, tw) {
  const c = {};
  for (let i = 0; i < q.length; i++) { if (typeof q[i] !== 'string' || q[i].indexOf(':') > 0) continue; const k = rollElite(q[i], n, tw); if (k) { q[i] += ':' + k; c[k] = (c[k] || 0) + 1; } }
  return c;
}
// its look, before its eyes are made (they take m.eyeCol): the colour, and a volatile's swollen, sore body
export function eliteLook(m, kind) {
  const K = ELITE_KIND[kind];
  m.eyeCol = K.col; m.eyeGlow = new THREE.Color(K.col);
  if (kind === 'volatile') {
    m.torso.scale.multiply(new THREE.Vector3(1.14, 1.04, 1.3));
    const sore = basic(K.col), G = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2, y = rr(-0.18, 0.2), s = rr(0.022, 0.042), o = new THREE.Mesh(G, sore);
      o.position.set(Math.sin(a) * 0.15, y, Math.cos(a) * 0.1); o.scale.setScalar(s); o.layers.enable(GLOW_LAYER); m.torso.add(o);
    }
  }
}
const hex = c => '#' + c.toString(16).padStart(6, '0');
// a zombie made one (zombies/spawn.js): what it does differently, and its roar as it comes in. (No rolls in here: a
// co-op spawn's seeded rolls have to stay in step on every screen)
export function makeElite(z, kind) {
  const K = ELITE_KIND[kind];
  z.elite = { kind };
  z.speed *= K.speed; z.T.dmg *= K.dmg; z.T.bdps *= K.dmg; z.atkK = K.atk;
  soundAt(z.x, z.z, () => SFX.groan(1.1, z.voice * 0.8, z.type), true);
}
// the call as a wave with elites in it starts (waves/waves.js: waveBegins, on every screen): how many are coming, and a
// row for each kind, how many of it and what it does, once the wave's own call (2.8 s, ui/hud-text.js: announce) has gone (ELITE_CALL_AT, s) so the two don't
// land on each other
const ELITE_CALL_AT = 3.4, TYPE_NAME = { walker: 'walker', runner: 'sprinter', brute: 'brute' };
export function eliteWave(c) {
  const ks = Object.keys(ELITE_KIND).filter(k => c && c[k] > 0); if (!ks.length) return;
  const n = ks.reduce((a, k) => a + c[k], 0), K0 = ELITE_KIND[ks[0]];
  setTimeout(() => {
    SFX.eliteIn(ks[0]);
    eliteCall({ col: hex(K0.col), icon: ks.length === 1 ? K0.icon : 'enrage', eye: 'Elites this wave', name: n === 1 ? '1 elite incoming' : n + ' elites incoming', t: 4.4,
      list: ks.map(k => ({ col: hex(ELITE_KIND[k].col), icon: ELITE_KIND[k].icon, n: c[k], name: ELITE_KIND[k].name, does: ELITE_KIND[k].does })) });
  }, ELITE_CALL_AT * 1000);
}
// one put down (zombies/damage.js), on every screen: its card, in gold (what it paid you goes in the pickups on the left)
export function eliteDown(z) {
  const K = ELITE_KIND[z.elite.kind];
  SFX.eliteDown();
  eliteCall({ col: hex(K.col), icon: 'deathSkull', eye: 'Elite down', name: K.down, line: K.name + ' ' + (TYPE_NAME[z.type] || z.type), down: true, t: 2.4 });
}
// a volatile one down: it bursts a beat after it falls (not inside the kill, so a chain of them goes off one after another
// rather than all inside the first) into a cloud of red mist that hangs and drifts, blood thrown everywhere, everything
// near it thrown back. It bursts on everyone's screen, and each player's own game takes what it does to them
const BURSTS = [], BURST_DELAY = 0.14;
// one that gets within VOL_FUSE.r of whoever it's after doesn't wait to be killed: it swells and shudders for
// VOL_FUSE.t seconds, shrieking, and goes off (killed by its own blast, so its burst follows: eliteDies). The host's
// game decides it in co-op (zombies/ai.js: updateZombies); true once it's gone off
const VOL_FUSE = { r: 1.7, t: 0.65, swell: 0.16 };
// caught in its burst: stunned for stun seconds at its middle, and how much of it (and of the blur, the grey and the
// ringing) even its edge leaves you with (k0)
const VOL_SHOCK = { stun: 1, k0: 0.55 };
export function volatileFuse(z, dp, dt) {
  if (!z.elite || z.elite.kind !== 'volatile' || z.dead) return false;
  if (!(z.fuse > 0)) {
    if (dp > VOL_FUSE.r) return false;
    z.fuse = VOL_FUSE.t; z.fuseS = z.m.g.scale.x;
    soundAt(z.x, z.z, () => SFX.groan(1, 1.35, 'runner'), true);
  }
  z.fuse -= dt; const u = 1 - Math.max(0, z.fuse) / VOL_FUSE.t;
  z.m.g.scale.setScalar(z.fuseS * (1 + VOL_FUSE.swell * u * u + 0.03 * Math.sin(u * 60)));   // (swelling, faster and faster, shaking)
  if (z.fuse > 0) return false;
  killZombie(z, -Math.sin(z.face), -Math.cos(z.face), 'boom', 'torso', 0);
  return true;
}
export function eliteDies(z) { if (z.elite && z.elite.kind === 'volatile') BURSTS.push({ x: z.x, z: z.z, t: BURST_DELAY, k: z.type === 'brute' ? ELITE_BRUTE.burst : 1 }); }
export function clearBursts() { BURSTS.length = 0; }
export function updateBursts(dt) {
  for (let i = BURSTS.length - 1; i >= 0; i--) {
    const b = BURSTS[i]; if ((b.t -= dt) > 0) continue; BURSTS.splice(i, 1);
    const V = VOLATILE, K = b.k || 1, M = V.mist;
    burst(b.x, 1.0, b.z, 34, 'blood', 0, 0, 7);
    for (let n = 0; n < M.n * K; n++) { const a = rand() * Math.PI * 2, d = rand() * M.r * K, sp = rr(0.4, 1.4);
      smoke(b.x + Math.sin(a) * d * 0.5, rr(0.4, 1.7), b.z + Math.cos(a) * d * 0.5, Math.sin(a) * sp, rr(0.05, 0.4), Math.cos(a) * sp, rr(...M.s0) * K, rr(...M.s1) * K, rr(...M.life), M.a, M.col[n % M.col.length], 0.4); }
    for (let n = 0; n < 5; n++) splat(b.x + rr(-1.2, 1.2) * K, b.z + rr(-1.2, 1.2) * K, 'spray', rr(0.9, 1.8) * K, rand() * 6.28);
    flashes.push({ x: b.x, y: 0.9, z: b.z, r: V.r * K * 2.2, int: 1.6, col: [1, 0.18, 0.12], t: 0.3, max: 0.3 }); setLmT(0);
    soundAt(b.x, b.z, () => { SFX.crush(); SFX.boom(Math.hypot(P.x - b.x, P.z - b.z), 1.2); }, true);
    const dp = Math.hypot(P.x - b.x, P.z - b.z); setShake(Math.max(shake, 0.45 * Math.max(0, 1 - dp / 9)));
    if (!P.dead && dp < V.you.r * K) { const f = 1 - dp / (V.you.r * K);
      P.hp -= V.you.dmg * K * (0.4 + 0.6 * f) * S.dmgTaken; hitFromAt(b.x, b.z, 1.4); interruptBandage();
      P.conc = Math.max(P.conc || 0, V.you.daze * (0.5 + 0.5 * f)); P.slow = Math.min(1, (P.slow || 0) + V.you.slow * f);
      // shell-shocked: stood there stunned (no moving, no shooting) for VOL_SHOCK.stun, the world blurred and drained
      // of colour as it clears (P.shock, ui/hud.js), and your ears ringing
      const sk = VOL_SHOCK.k0 + (1 - VOL_SHOCK.k0) * f;
      P.stun = Math.max(P.stun || 0, VOL_SHOCK.stun * sk); P.shockStun = Math.max(P.shockStun || 0, VOL_SHOCK.stun * sk); P.shock = Math.max(P.shock || 0, sk); P.sprint = false;
      SFX.tinnitus(sk); }
    goreAt(b.x, b.z, 1.0, 1.4 * K, V.you.r * K);   // (its blood all over your view, you and what's in your hands: ui/screen-blood.js)
    // the zombies round it aren't hurt: thrown back off it and staggered, the nearer the longer (a brute barely moved)
    for (const o of zombies) {
      if (o.dead) continue; const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz); if (d > V.r * K) continue;
      const f = 1 - d / (V.r * K), nx = dx / (d || 1), nz = dz / (d || 1), br = o.type === 'brute' ? V.brute : 1;
      o.stagger = Math.max(o.stagger || 0, (V.s0 + (V.s - V.s0) * f) * br); o.vx += nx * V.kb * f * br / o.T.scale; o.vz += nz * V.kb * f * br / o.T.scale;
      zAnimHit(o, nx, nz, 'torso', 0.6 + 0.8 * f * br);
    }
  }
}
