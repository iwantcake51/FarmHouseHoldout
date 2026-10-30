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
import { run } from '../game/run-state.js';
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
import { smoke } from '../effects/smoke.js';
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
    icon: 'gooBurst', does: 'Bursts into a cloud of red mist when it dies: it hurts and dazes you up close, and staggers the zombies round it', stats: '2.6 m burst · ×3 health · 40% damage reduction', down: 'Popped' }
};
// (called out no more than once in ELITE_CALL seconds: a blood moon's are many)
const ELITE_CALL = 8;
// the burst (VOLATILE: how far it reaches the zombies round it, how long it staggers one at its middle (s, and at its
// edge s0) and how hard it throws them (kb, a brute only stag of it); you within you.r of it: how much it hurts at its
// middle and how long it leaves you reeling (daze: the screen swimming, your aim going wide, slowed); and its cloud:
// mist puffs of red, how far they spread, how big they grow and how long they hang in the air)
const VOLATILE = { r: 3.2, s: 1.6, s0: 0.5, kb: 6, brute: 0.35, you: { r: 2.6, dmg: 35, daze: 1, slow: 0.45 },
  mist: { n: 16, r: 1.4, s0: [0.6, 1.1], s1: [2.4, 3.6], life: [2.6, 4.2], a: 0.6, col: [0x8e1010, 0x6a0808, 0xa82018] } };

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
// a zombie made one (zombies/spawn.js): what it does differently, and the call that one's coming, saying what it does.
// (No rolls in here: the call can be skipped on one screen and not another, and a roll there would leave the rest of a
// co-op spawn's seeded rolls out of step)
export function makeElite(z, kind) {
  const K = ELITE_KIND[kind];
  z.elite = { kind };
  z.speed *= K.speed; z.T.dmg *= K.dmg; z.T.bdps *= K.dmg; z.atkK = K.atk;
  soundAt(z.x, z.z, () => SFX.groan(1.1, z.voice * 0.8, z.type), true);
  if (run.time - (run.eliteCall ?? -1e9) < ELITE_CALL) return; run.eliteCall = run.time;
  SFX.eliteIn(kind);
  eliteCall({ col: hex(K.col), icon: K.icon, eye: 'Elite incoming', name: K.name, line: K.does, tip: K.stats });
}
// one put down (zombies/damage.js): its card, in gold, with what it paid
export function eliteDown(z, paid) {
  const K = ELITE_KIND[z.elite.kind];
  SFX.eliteDown();
  eliteCall({ col: hex(K.col), icon: 'deathSkull', eye: K.name + ' · down', name: K.down, line: '+' + paid + ' scrap · and its drop', down: true, t: 2.4 });
}
// a volatile one down: it bursts a beat after it falls (not inside the kill, so a chain of them goes off one after another
// rather than all inside the first) into a cloud of red mist that hangs and drifts, blood thrown everywhere, everything
// near it thrown back. It bursts on everyone's screen, and each player's own game takes what it does to them
const BURSTS = [], BURST_DELAY = 0.14;
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
      P.conc = Math.max(P.conc || 0, V.you.daze * (0.5 + 0.5 * f)); P.slow = Math.min(1, (P.slow || 0) + V.you.slow * f); }
    // the zombies round it aren't hurt: thrown back off it and staggered, the nearer the longer (a brute barely moved)
    for (const o of zombies) {
      if (o.dead) continue; const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz); if (d > V.r * K) continue;
      const f = 1 - d / (V.r * K), nx = dx / (d || 1), nz = dz / (d || 1), br = o.type === 'brute' ? V.brute : 1;
      o.stagger = Math.max(o.stagger || 0, (V.s0 + (V.s - V.s0) * f) * br); o.vx += nx * V.kb * f * br / o.T.scale; o.vz += nz * V.kb * f * br / o.T.scale;
      zAnimHit(o, nx, nz, 'torso', 0.6 + 0.8 * f * br);
    }
  }
}
