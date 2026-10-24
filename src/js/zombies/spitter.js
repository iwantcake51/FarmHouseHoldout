// Spitters: zombies that hang back and spit acid at you, so holding one window and mowing the rest down as they climb in
// doesn't work.
//
// You can tell one a long way off: hunched over a swollen, glowing throat sac and a bloated belly, jaw hanging open
// with bile dribbling off its chin in strings, its skin gone a sick yellow-green, a green glow round its throat that
// shows in the dark, a wet gurgle as it comes, and in green through walls where the others are red (spitterLook).
//
// One with a clear line to whoever it's after, between SPIT.min and SPIT.max metres off (through a window too, so long
// as it isn't boarded shut), stops where it is, rears back while the sac swells and glows and the gurgle rises
// (SPIT.wind seconds: hit it hard enough to stagger it and the spit's lost), then retches forward and spits a glob in
// a low arc at where you're standing as it lets go, or flung straight in through a window if one's in the way (spitPath).
// Keep moving and it lands behind you; stand still and it splashes you (SPIT.dmg) and leaves a splat of acid that
// spreads, bubbles and steams, then dries up (SPIT.pool). Standing in it burns, a little at first and a little more the
// longer you stay (SPIT.pool.ramp), and drags at your feet. It spits again every SPIT.cd seconds while it can see you;
// once it can't, it comes on like any other zombie, and close up it claws like one. When one dies its sac bursts.
// In co-op the host's spitters decide when to spit (zombies/ai.js) and every game flies the same glob and makes the same
// splat ('spw' as it rears back, 'spt' as it lets go: net/sync.js), each burning only its own survivor.

import { scene, V3 } from '../core/renderer.js';
import { angDiff, clamp, mix, pick, rand, rr, smooth } from '../core/math.js';
import { netClient, netLink, netSend } from '../net/net.js';
import { basic, lam } from '../core/shaders.js';
import { cell, ci, idx, OPEN, openAt } from '../world/grid.js';
import { THIN, thinHit } from '../world/thin-walls.js';
import { surfaceY } from '../world/house.js';
import { P } from '../player/player.js';
import { run, S } from '../game/run-state.js';
import { SMOKE_GAIN, TEX_SMOKES } from '../effects/textures.js';
import { dropHits } from '../effects/particles.js';
import { fx, FXK, TEX_DOT, TEX_GLOWS } from '../effects/puffs.js';
import { zombies } from './zombie-types.js';
import { zBoost, ZJ, zMix } from './zombie-anim.js';
import { ZBONE, ZMEAT } from './zombie-kit.js';
import { ZTEETH } from './zombie-looks.js';
import { nz, tn } from '../audio/audio.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { setShake, shake, state } from '../game/state.js';
import { interruptBandage } from '../player/bandages.js';
import { addField, lightField, los } from '../lighting/lightmap.js';
import { curDark } from '../lighting/day-night.js';
import { visAt } from '../lighting/vision.js';
import { playerChecks } from './ai.js';
import { waveDmg } from './brute-dash.js';
import { ANIM } from '../player/animation.js';
import { hitFromAt } from '../ui/hud.js';

export const SPIT = {
  from: 5, share: 0.05, sharePer: 0.006, shareMax: 0.12,   // first wave, share of the wave, how it grows (waves/waves.js)
  min: 3.5, max: 11, wind: 0.95, cd: [3.6, 5], first: [0.8, 2.2],   // range, the rear back (s), between spits (s), the first
  speed: 6.5, g: 7, arc: 0.45, arcPer: 0.09, through: 1.45,   // the glob's speed across the ground (m/s) at most, its fall, how high it's lobbed over the line to where it lands (arc, and arcPer more each metre), the height it takes through a window
  flat: 11, dip: 0.12,   // spat in through a window: flung straight at your feet (flat m/s across the ground), dipping as it goes rather than lobbed up and over, at least dip (m)
  dmg: 10, splash: 1.0,   // a glob that catches you (half that at the splash's edge) and how far the splash reaches
  // the splat it leaves: how far it burns, how long it lasts, the burn a second (rising to max times that after ramp
  // seconds stood in it, and easing off again once you're out), the drag at your feet; it spreads over grow seconds and
  // dries up over its last dry
  pool: { r: 0.95, t: 6.5, dps: 2.5, max: 1.6, ramp: 4, slow: 0.2, grow: 0.35, dry: 2.2 },
  burst: { r: 0.7, t: 4 },   // a spitter's own sac bursting as it dies
  xray: 0x9fe03c
};
const globs = [], acidPools = [], spitters = new Set();
// the acid: a sick yellow-green, translucent and wet-looking, faintly lit from within
const ACID_GLOW = 0x142408, POOL_SELF = 0.6;   // (how much of a splat's own colour it gives off: emissiveMap, acidPool)
const GLOB_G = new THREE.IcosahedronGeometry(1, 2);
// the glob glows in its own colour in the dark, unlit (it's never darker than its green), with a halo round it, and
// the trail it draws out behind it the same
const GLOB_M = new THREE.MeshBasicMaterial({ color: 0xa8e83c, transparent: true, opacity: 0.94 });
const SPIT_TRAIL_M = new THREE.MeshBasicMaterial({ color: 0x96d634, transparent: true, opacity: 0.8, depthWrite: false });
const HALO_M = new THREE.SpriteMaterial({ map: TEX_GLOWS[0], color: 0x7fd02a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
// and green light thrown off it onto what's round it, and off a splat for as long as it's there, fading with it
// (spitLights, lighting/lightmap.js), SPIT_LIGHT its colour
const SPIT_LIGHT = [0.42, 1, 0.16], SPIT_LAMP = { glob: [3, 0.85], pool: [2.2, 0.55] };
// more kinds of soft sprite (effects/puffs.js): the acid flung off a glob or a splash, wet and catching the light and
// keeping its own green in the dark (self); the haze of fumes off a fresh splat; the steam it sizzles off whatever it
// lands on and the yellowish smoke of what it's eating into, both rising and drifting off on the wind; and the glow
// round a spitter's throat
FXK.acid = { tex: TEX_DOT, col: 0xc4e65a, col2: 0x6f8e1c, lit: true, self: 0.95, gain: 1.5, grav: 7, drag: 1.2, rise: 0, fin: 0.03, fade: 1.3 };
FXK.acidMist = { tex: TEX_SMOKES, col: 0xb4c87a, lit: true, self: 0.45, gain: SMOKE_GAIN, grav: 0, drag: 2.4, rise: 0.3, fin: 0.2, fade: 1.4, wind: 0.8 };
FXK.acidSteam = { tex: TEX_SMOKES, col: 0xdce8cc, col2: 0xb8c4a8, lit: true, self: 0.3, gain: SMOKE_GAIN, grav: 0, drag: 1.8, rise: 1.1, fin: 0.12, fade: 1.2, wind: 1 };
FXK.acidSmoke = { tex: TEX_SMOKES, col: 0x6a6c40, col2: 0x4a4a38, lit: true, gain: SMOKE_GAIN, grav: 0, drag: 2.2, rise: 0.55, fin: 0.2, fade: 1.4, wind: 1 };
// how much it steams and smokes (puffs a second, at a full-size splat while it's fresh: SIZZLE), and how often it
// crackles, the hiss loudest close to and fading as it cools
const SIZZLE = { steam: 6, smoke: 1.4, tiny: 1.2, glob: 30, crackle: [0.12, 0.35], hear: 9 };
FXK.acidGlow = { tex: TEX_GLOWS, add: true, col: 0x8fd832, grav: 0, drag: 0, rise: 0, fin: 0.25, fade: 1.2 };

// ---- the splats: a few drawn once, each a wet pool with streaks and droplets thrown out along one side (the way the
// glob was going), a dark rim where it's soaking in, a glossy middle and bubbles on it; laid down turned to the way it came
const SPLAT_TEX = Array.from({ length: 5 }, () => acidSplatTex());
function acidSplatTex() {
  const S_ = 256, c = document.createElement('canvas'); c.width = c.height = S_; const x = c.getContext('2d'), h = S_ / 2;
  const blobs = [], streaks = [], drops = [];
  for (let k = 0; k < 9; k++) { const a = rand() * 6.283, d = k ? rr(10, 34) : 0; blobs.push([h + Math.cos(a) * d - 6, h + Math.sin(a) * d * 0.85, k ? rr(18, 34) : rr(40, 50)]); }
  for (let k = 0; k < 12; k++) streaks.push([rr(-0.75, 0.75), rr(34, 50), rr(18, 62), rr(3, 8)]);
  for (let k = 0; k < 26; k++) { const a = rand() < 0.75 ? rr(-1, 1) : rr(-3.1, 3.1), d = rr(48, 118); drops.push([h + Math.cos(a) * d, h + Math.sin(a) * d, rr(1.5, 5)]); }
  const shape = (grow, col) => {
    x.fillStyle = col;
    for (const [bx, by, r] of blobs) { x.beginPath(); x.arc(bx, by, Math.max(1, r + grow), 0, 6.283); x.fill(); }
    for (const [a, d0, L, w] of streaks) { x.save(); x.translate(h + Math.cos(a) * d0, h + Math.sin(a) * d0); x.rotate(a); x.beginPath(); x.ellipse(L / 2, 0, L / 2 + grow, Math.max(0.8, w / 2 + grow * 0.6), 0, 0, 6.283); x.fill(); x.restore(); }
    for (const [dx, dy, r] of drops) { x.beginPath(); x.arc(dx, dy, Math.max(0.6, r + grow * 0.5), 0, 6.283); x.fill(); }
  };
  shape(2, 'rgba(56,68,14,0.8)');         // the rim, soaking into whatever it's on
  shape(-2, 'rgba(122,154,36,0.9)');       // the acid
  shape(-9, 'rgba(156,190,56,0.85)');      // thicker, brighter in the middle
  x.fillStyle = 'rgba(236,255,190,0.55)';  // wet highlights
  for (let k = 0; k < 6; k++) { const [bx, by, r] = blobs[(rand() * blobs.length) | 0]; x.beginPath(); x.ellipse(bx - r * 0.3, by - r * 0.35, r * rr(0.15, 0.3), r * rr(0.08, 0.15), -0.6, 0, 6.283); x.fill(); }
  x.strokeStyle = 'rgba(220,245,150,0.7)'; x.lineWidth = 1.2;   // bubbles
  for (let k = 0; k < 14; k++) { const [bx, by, r] = blobs[(rand() * blobs.length) | 0], a = rand() * 6.283, d = rand() * r * 0.7; x.beginPath(); x.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d, rr(1.2, 3.5), 0, 6.283); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}
const POOL_G = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
// a splat's bloom: a soft green glow lying over it, strongest in the dark, there as long as the splat is and fading
// with it (POOL_BLOOM: how bright, how far past the splat it spreads)
const POOL_BLOOM = { a: 0.5, r: 1.9 };

// ---- its look ----
// a spitter's turned further than the rest, and you can tell from across the yard: its skin gone a jaundiced, sick
// yellow-green (SPIT_TINT, by part: most at the face and hands), a sac of acid bulging out of its throat over the
// collarbone with blisters swelling off it, its chest burst open over a glowing gland under the ribs, its spine
// standing out of its hunched back in knuckles of bone, clusters of weeping pustules on its shoulders and arms, its
// clothes and skin eaten through in acid burns, and its eyes a sour green (SPIT_EYE: spawn.js, effects/eye-glow.js)
const SPIT_TINT = [0.66, 0.74, 0.3], SPIT_TINT_K = { head: 0.55, armL: 0.3, armR: 0.3, foreL: 0.42, foreR: 0.42, torso: 0.28 };
const SPIT_EYE = { col: 0xc8ff6a, glow: new THREE.Color(0xb4ff5a) };
export function spitterLook(m) {
  for (const p in SPIT_TINT_K) {
    const c = m[p] && m[p].geometry.attributes.color; if (!c) continue; const k = SPIT_TINT_K[p];
    for (let i = 0; i < c.count; i++) { const r = c.getX(i), g = c.getY(i), b = c.getZ(i); c.setXYZ(i, r + (SPIT_TINT[0] * (0.6 + r) - r) * k, g + (SPIT_TINT[1] * (0.6 + g) - g) * k, b + (SPIT_TINT[2] * (0.6 + b) - b) * k); }
    c.needsUpdate = true;
  }
  m.eyeCol = SPIT_EYE.col; m.eyeGlow = SPIT_EYE.glow;
  const sacM = lam(0xa8c84e, { emissive: 0x30520a, transparent: true, opacity: 0.9 }), coreM = basic(0xd8ff6a);
  const veinM = lam(0x3a1c22), bileM = lam(0x6a7a1c, { emissive: 0x141e02 }), soreM = lam(0xc8d86a, { emissive: 0x3a5a08 });
  const boneM = lam(ZBONE), meatM = lam(ZMEAT), holeM = lam(0x160806), burnM = lam(0x2a1a10), crustM = lam(0x9ab83a, { emissive: 0x1e3204 });
  [sacM, bileM, soreM, crustM].forEach(q => { q.userData.glow = true; });   // (their green kept in the dark: core/shaders.js)
  const glob = (par, mat, sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(GLOB_G, mat); o.scale.set(sx, sy, sz); o.position.set(x, y, z); par.add(o); return o; };
  const slab = (par, mat, w, h, d, x, y, z, rx, ry, rz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.rotation.set(rx || 0, ry || 0, rz || 0); par.add(o); return o; };
  // the sac: a swollen, glossy bag of acid bulging out of the throat over the collarbone, lit from inside, dark veins
  // over it and blisters swelling off its sides
  const sac = new THREE.Group(); sac.position.set(0, -0.21, 0.07); m.head.add(sac);
  glob(sac, sacM, 0.13, 0.115, 0.12, 0, 0, 0);
  const core = glob(sac, coreM, 0.075, 0.065, 0.07, 0, -0.005, 0.03);
  for (let k = 0; k < 3; k++) { const a = rr(-1.4, 1.4); glob(sac, sacM, rr(0.035, 0.05), rr(0.03, 0.045), rr(0.035, 0.05), Math.sin(a) * 0.11, rr(-0.06, 0.03), Math.cos(a) * 0.09); }
  for (let k = 0; k < 9; k++) { const a = rr(-1.5, 1.5); slab(sac, veinM, 0.006, 0.006, rr(0.08, 0.16), Math.sin(a) * 0.118, rr(-0.07, 0.06), Math.cos(a) * 0.108, rr(-0.7, 0.7), a, rr(-0.5, 0.5)); }
  // no jaw where it should be (zombies/zombie-looks.js leaves a dark hole under the upper teeth): a glow down its
  // throat, bile in strings off the teeth, and the jaw itself torn loose, hanging by what's left at the hinges
  const F = m.look.face, lip = -0.075;
  const throat = slab(m.head, coreM, 0.07, 0.03, 0.006, F.jx, lip - 0.032, 0.078);
  const strands = [];
  for (let k = 0; k < 3; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1, 0.012).translate(0, -0.5, 0), bileM); st.position.set(F.jx + rr(-0.035, 0.035), lip - 0.018, 0.13); st.userData.len = rr(0.06, 0.16); st.userData.ph = rand() * 6; m.head.add(st); strands.push(st); }
  const jaw = spitterJaw(m, F, lip);
  // (where it all goes: out on the torso's faces, FRONT, SIDE and BACK, over whatever it's wearing (rig: 0.5 by 0.6 by
  // 0.3), and along the arms, which run out along z from the shoulder, ARM_R their half-width)
  const FRONT = 0.172, SIDE = 0.268, BACK = -0.168, ARM_R = 0.074;
  // its chest burst open on one side: a ragged hole through shirt and skin, raw at the edges, the ribs across it and a
  // gland glowing in the dark under them
  const cs = rand() < 0.5 ? -1 : 1, cx = cs * 0.11;
  slab(m.torso, holeM, 0.14, 0.15, 0.004, cx, 0.08, FRONT);
  [[0, 0.083, 0.15, 0.022], [0, -0.075, 0.15, 0.022], [-0.07, 0, 0.022, 0.15], [0.07, 0, 0.022, 0.15]].forEach(([dx, dy, w, h]) => slab(m.torso, meatM, w, h, 0.012, cx + dx, 0.08 + dy, FRONT + 0.004, 0, 0, rr(-0.2, 0.2)));
  glob(m.torso, coreM, 0.04, 0.034, 0.012, cx + rr(-0.01, 0.01), 0.075, FRONT + 0.002);
  [0.125, 0.085, 0.045].forEach(y => slab(m.torso, boneM, 0.13, 0.013, 0.014, cx, y, FRONT + 0.01, 0, 0, cs * rr(0.12, 0.22)));
  // the bile down the chin and the front of it
  for (let k = 0; k < 4; k++) slab(m.torso, bileM, rr(0.025, 0.05), rr(0.12, 0.3), 0.004, -cx + rr(-0.06, 0.06), rr(0.05, 0.18), FRONT + 0.003);
  // its spine, standing out of its bent back in knuckles of bone, and pustules burst open between the shoulder blades
  for (let k = 0; k < 7; k++) { const y = 0.27 - k * 0.075; slab(m.torso, boneM, 0.04 - k * 0.003, 0.03, 0.036, 0, y, BACK - 0.012 * Math.sin(k / 6 * Math.PI), rr(-0.2, 0.2)); }
  for (let k = 0; k < 5; k++) glob(m.torso, soreM, rr(0.016, 0.03), rr(0.016, 0.03), 0.014, rr(-0.17, 0.17), rr(0, 0.22), BACK);
  // the belly swollen tight, sores weeping on it
  glob(m.torso, lam(0x9aa860, { emissive: 0x1a2a06 }), 0.17, 0.15, 0.09, 0, -0.14, 0.1);
  for (let k = 0; k < 7; k++) { const a = rr(-1, 1); glob(m.torso, soreM, 1, 1, 1, Math.sin(a) * 0.14, rr(-0.24, -0.06), 0.1 + Math.cos(a) * 0.085).scale.setScalar(rr(0.012, 0.026)); }
  // clusters of pustules swelling up out of its shoulders and down its upper arms, some of them big
  ['armL', 'armR'].forEach((p, i) => { const a = m[p]; if (!a) return; const sd = i ? 1 : -1;
    for (let k = 0; k < 7; k++) { const r = k < 2 ? rr(0.028, 0.04) : rr(0.012, 0.022), top = rand() < 0.6;
      glob(a, soreM, r, r * rr(0.8, 1.1), r, top ? rr(-0.05, 0.05) : sd * ARM_R, top ? ARM_R : rr(-0.05, 0.05), rr(0.02, 0.22)); } });
  // acid burns eaten into it: scorched patches through cloth and skin, a crust of green round each, on its sides and
  // its forearms
  const burn = (par, x, y, z, w, h) => { slab(par, crustM, 0.004, h + 0.024, w + 0.024, x, y, z); slab(par, burnM, 0.006, h, w, x + Math.sign(x) * 0.002, y, z); };
  burn(m.torso, SIDE * cs, rr(-0.12, 0.05), rr(-0.05, 0.05), rr(0.07, 0.1), rr(0.08, 0.12));
  burn(m.torso, -SIDE * cs, rr(0.05, 0.18), rr(-0.06, 0.06), rr(0.05, 0.08), rr(0.06, 0.09));
  [m.foreL, m.foreR].forEach((f, i) => { if (f) burn(f, (i ? 1 : -1) * ARM_R, rr(-0.03, 0.03), rr(0.08, 0.18), rr(0.05, 0.08), rr(0.05, 0.08)); });
  m.spit = { sac, sacM, core, throat, strands, jaw };
}
// the jaw, torn loose on one side and hanging by the other hinge (JAW.side picks which), dangling down beside the neck,
// clear of the sac: a U of bone and skin (its two sides and the chin across them), its bottom teeth in rotten gums, the
// tongue lolling in it and the torn hinge raw. Built hanging from its hinge along +z, its far side along +x (turned to
// run forward, toward the face, as it swings: jawStep)
const JAW = { len: 0.17, damp: 2.4, down: -0.3, inside: 0.02, out: 0.85, back: -0.55, fwd: 0.7, fling: 2.2 };
function spitterJaw(m, F, lip) {
  const side = rand() < 0.5 ? -1 : 1, g = new THREE.Group(); g.position.set(F.jx + side * (F.jw * 0.39 + 0.03), lip - 0.012, 0.0); m.head.add(g);
  const tint = new THREE.Color(m.skinCol).lerp(new THREE.Color(0x9aa860), 0.35);
  const skin = lam(tint.getHex()), meat = lam(ZMEAT), tooth = lam(pick(ZTEETH)), gum = lam(0x5a2a26), tongue = lam(0x6a2a2e), bone = lam(ZBONE);
  const L = JAW.len, W = F.jw * 0.86, bx = (w, h, d, mt, x, y, z, ry) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); b.position.set(x, y, z); if (ry) b.rotation.z = ry; g.add(b); return b; };
  bx(0.046, 0.034, L, skin, 0, 0, L / 2); bx(0.046, 0.034, L, skin, W, 0, L / 2);   // its two sides, the near one on the hinge
  bx(W + 0.046, 0.05, 0.05, skin, W / 2, 0, L);                                       // the chin across them
  bx(0.05, 0.04, 0.03, meat, 0, 0, 0.004); bx(0.016, 0.016, 0.02, bone, 0, 0.006, -0.01); bx(0.05, 0.04, 0.03, meat, W, 0, 0.004);   // the torn ends
  bx(W * 0.8, 0.03, 0.012, gum, W / 2, 0.012, L - 0.03);                              // the gums
  const nt = Math.round(W / 0.02);
  for (let i = 0; i < nt; i++) if (rand() > 0.3) bx(rr(0.011, 0.015), 0.014, rr(0.012, 0.022), tooth, W * 0.12 + (i + 0.5) * W * 0.76 / nt, 0.022, L - 0.045, rr(-0.25, 0.25));
  bx(W * 0.4, 0.014, 0.11, tongue, W / 2 + rr(-0.01, 0.01), 0.004, L * 0.55);         // the tongue
  return { g, side, L: JAW.len, rest: new V3(side * 0.3, -0.95, 0.08).normalize(), p: null, v: new V3(), lastThr: 0 };
}
// the jaw swinging: a weight on its hinge, pulled down, carried along by the head's every move and left behind when it
// stops, damped (JAW.damp); in the head's frame it's kept hanging (below JAW.down), on its own side of the neck (from
// JAW.inside out to JAW.out, never swung in under the chin into the sac) and between JAW.back and JAW.fwd; flung
// forward when it spits (JAW.fling, metres a second at the tip). Turned so it runs its length down from the hinge and
// its width forward toward the face, flat beside the neck
const _jh = new V3(), _jq = new THREE.Quaternion(), _jqi = new THREE.Quaternion(), _jd = new V3(), _jf = new V3(), _jx = new V3(), _jy = new V3(), _jm = new THREE.Matrix4();
function jawStep(z, J, dt, thr) {
  z.m.head.updateWorldMatrix(true, false); J.g.getWorldPosition(_jh); z.m.head.getWorldQuaternion(_jq); _jqi.copy(_jq).invert();
  if (!J.p) { J.p = J.rest.clone().applyQuaternion(_jq).multiplyScalar(J.L).add(_jh); J.v.set(0, 0, 0); J.dir = J.rest.clone(); }
  if (thr > J.lastThr + 0.5) J.v.addScaledVector(_jf.set(J.side * 0.3, -0.2, 1).applyQuaternion(_jq), JAW.fling);
  J.lastThr = thr;
  for (let n = Math.ceil(dt / (1 / 120)), h = dt / n, i = 0; i < n; i++) {
    J.v.y -= 9.8 * h; J.v.multiplyScalar(Math.exp(-JAW.damp * h)); J.p.addScaledVector(J.v, h);
    _jd.subVectors(J.p, _jh); _jd.divideScalar(_jd.length() || 1);
    J.v.addScaledVector(_jd, -J.v.dot(_jd));   // (only round the hinge, never stretching off it)
    _jd.applyQuaternion(_jqi);
    const lx = J.side * clamp(J.side * _jd.x, JAW.inside, JAW.out), ly = Math.min(_jd.y, JAW.down), lz = clamp(_jd.z, JAW.back, JAW.fwd);
    if (lx !== _jd.x || ly !== _jd.y || lz !== _jd.z) { _jd.set(lx, ly, lz).normalize(); J.v.multiplyScalar(0.5); }
    J.dir.copy(_jd); J.p.copy(_jd).applyQuaternion(_jq).multiplyScalar(J.L).add(_jh);
  }
  _jx.set(0, 0, 1).addScaledVector(J.dir, -J.dir.z).normalize(); _jy.crossVectors(J.dir, _jx);
  J.g.quaternion.setFromRotationMatrix(_jm.makeBasis(_jx, _jy, J.dir));
}
// how it carries itself: bent low over its belly, arms hanging; and it's kept track of for its drool and glow
export function spitterGait(z) { const g = z.an && z.an.g; if (g) { g.hunch = rr(0.28, 0.38); g.lean = rr(0.12, 0.2); g.arms = 2; g.limp = 0; } spitters.add(z); }

// ---- the AI (the host's, or alone): true while it's standing off to spit, so nothing else moves it this frame ----
export function spitStep(z, dt, t, dp) {
  const s = z.sp || (z.sp = { cd: rr(...SPIT.first), w: 0, thr: 0 });
  s.cd -= dt; s.thr = Math.max(0, s.thr - dt * 2.2);
  if (s.w > 0) {
    if (z.stagger > 0 || z.crawl || !z.limbs.head) { s.w = 0; s.cd = rr(0.8, 1.4); return false; }   // knocked out of it: the spit's lost
    z.face += angDiff(Math.atan2(t.x - z.x, t.z - z.z), z.face) * Math.min(1, dt * 7);
    s.w += dt / SPIT.wind;
    if (s.w >= 1) { s.w = 0; s.thr = 1; s.cd = rr(...SPIT.cd); spitAt(z, t.x, t.z); }
    return true;
  }
  if (z.crawl || t.dead || z.stagger > 0 || !z.limbs.head) return false;
  if (!(dp > SPIT.min && dp < SPIT.max && los(z.x, z.z, t.x, t.z))) return s.thr > 0.5;   // (a beat after it's spat, still)
  z.face += angDiff(Math.atan2(t.x - z.x, t.z - z.z), z.face) * Math.min(1, dt * 5);
  if (s.cd <= 0) { s.w = 0.001; spitWindFx(z); if (netLink() && z.id) netSend('spw', { id: z.id }); }
  return true;
}
// rearing back: a wet gurgle building in its throat, rising as the sac fills
export function spitWindFx(z) { soundAt(z.x, z.z, () => { nz(0.9, 'bandpass', 220, 640, 0.2, 4); nz(0.7, 'bandpass', 380, 900, 0.08, 6); tn(0.85, 'sawtooth', 60, 130, 0.035); }); }
// it lets go: the glob from its mouth to where they stand
function spitAt(z, tx, tz) {
  const h = z.m.head.getWorldPosition(new V3()), sf = Math.sin(z.face), cf = Math.cos(z.face);
  const x0 = h.x + sf * 0.2, y0 = h.y - 0.1, z0 = h.z + cf * 0.2, [T, vy, gr] = spitPath(x0, y0, z0, tx, tz);
  if (netLink() && z.id) netSend('spt', { id: z.id, a: [x0, y0, z0, tx, tz, T, vy, gr].map(v => Math.round(v * 1000) / 1000) });
  launchGlob(z, x0, y0, z0, tx, tz, T, vy, gr);
}
// the glob's flight, [how long it's in the air, how fast it starts up, its fall]: out in the open lobbed in an arc, its
// top SPIT.arc (and SPIT.arcPer a metre further) over the line to where it lands (an arc's top is g T² / 8 above the
// middle of that line), and never faster than SPIT.speed across the ground. Spat in through a window it's flung
// straight at you instead (SPIT.flat), dipping as it goes, through the middle of the window (SPIT.through, metres up)
// so it doesn't splash on the sill or the head, and down to your feet
function spitPath(x0, y0, z0, tx, tz) {
  const d = Math.hypot(tx - x0, tz - z0), ty = surfaceY(tx, tz) + 0.05, T0 = clamp(Math.max(d / SPIT.speed, Math.sqrt(8 * (SPIT.arc + SPIT.arcPer * d) / SPIT.g)), 0.45, 2.2);
  const lob = [T0, (ty - y0 + 0.5 * SPIT.g * T0 * T0) / T0, SPIT.g];
  for (let s = 0.1; s < d; s += 0.1) {
    const k = idx(ci(x0 + (tx - x0) * s / d), ci(z0 + (tz - z0) * s / d)), o = cell[k] === OPEN && openAt[k];
    if (!o || o.kind !== 'window') continue;
    const f = s / d; if (f < 0.05 || f > 0.95) return lob;
    // y(u) = y0 + a u - b u² along the way (u 0 to 1): through the window at f, down to y1 at the end
    const curve = y1 => { const b = (SPIT.through - y0 - (y1 - y0) * f) / (f * (1 - f)); return [y1 - y0 + b, b]; };
    let [a, b] = curve(ty);
    b = Math.max(b, SPIT.dip); const T = clamp(d / SPIT.flat, 0.3, 1.2);
    return [T, a / T, 2 * b / (T * T)];
  }
  return lob;
}
// the trail drawn out behind a glob: a strand of the acid along the very path it's flown (its last frames' places,
// g.hist), thickest at the glob and tapering to nothing SPIT_TRAIL.len behind it, round in section, wobbling a little as
// liquid does; built once and its points moved each frame
const SPIT_TRAIL = { len: 0.42, rings: 12, sides: 7, r: 0.045 };
function spitTrailGeo() {
  const n = SPIT_TRAIL.rings * SPIT_TRAIL.sides, g = new THREE.BufferGeometry(), idx = [];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  for (let i = 0; i < SPIT_TRAIL.rings - 1; i++) for (let j = 0; j < SPIT_TRAIL.sides; j++) { const a = i * SPIT_TRAIL.sides + j, b = i * SPIT_TRAIL.sides + (j + 1) % SPIT_TRAIL.sides, c = a + SPIT_TRAIL.sides, d = b + SPIT_TRAIL.sides; idx.push(a, c, b, b, c, d); }
  g.setIndex(idx); return g;
}
const _tP = new V3(), _tT = new V3(), _tN = new V3(), _tB = new V3(), _tU = new V3(0, 1, 0);
function spitTrailShape(geo, hist, t) {
  const pos = geo.attributes.position, R = SPIT_TRAIL.rings, Sd = SPIT_TRAIL.sides;
  // the points along it, every len / (rings - 1) back along the path
  let k = 0, acc = 0;
  for (let i = 0; i < R; i++) {
    const want = SPIT_TRAIL.len * i / (R - 1);
    while (k < hist.length - 2 && acc + hist[k].distanceTo(hist[k + 1]) < want) { acc += hist[k].distanceTo(hist[k + 1]); k++; }
    const a = hist[k], b = hist[Math.min(k + 1, hist.length - 1)], seg = a.distanceTo(b) || 1, f = clamp((want - acc) / seg, 0, 1);
    _tP.copy(a).lerp(b, f); _tT.copy(a).sub(b); if (_tT.lengthSq() < 1e-8) _tT.set(0, 0, 1); _tT.normalize();
    _tN.crossVectors(_tT, _tU); if (_tN.lengthSq() < 1e-6) _tN.set(1, 0, 0); _tN.normalize(); _tB.crossVectors(_tT, _tN);
    const u = i / (R - 1), r = SPIT_TRAIL.r * Math.pow(1 - u, 1.4) * (1 + 0.15 * Math.sin(t * 30 + i * 1.7)) * (want <= acc + seg ? 1 : 0);
    for (let j = 0; j < Sd; j++) { const a2 = j / Sd * 6.2832, c = Math.cos(a2) * r, s = Math.sin(a2) * r; pos.setXYZ(i * Sd + j, _tP.x + _tN.x * c + _tB.x * s, _tP.y + _tN.y * c + _tB.y * s, _tP.z + _tN.z * c + _tB.z * s); }
  }
  pos.needsUpdate = true;
}
// a glob's light, and a fresh splat's, into the light map with the lamps (called from lighting/lightmap.js)
export function spitLights(dark) {
  for (const g of globs) { const p = g.m.position; addField(lightField(p.x, p.z, SPIT_LAMP.glob[0]), SPIT_LAMP.glob[1] * (0.2 + dark), SPIT_LIGHT); }
  for (const q of acidPools) { if (q.tiny || !(q.glow > 0.02)) continue; addField(lightField(q.x, q.z, SPIT_LAMP.pool[0] * (0.6 + q.r * 0.5)), SPIT_LAMP.pool[1] * q.glow * (0.15 + dark), SPIT_LIGHT); }
}
// the crown a glob throws up as it bursts on the ground: a thin sheet of acid that flares up and out from where it
// hit, its rim broken into points that throw off drops, then slumps back down and thins out into the splat (CROWN.t);
// a few shapes of rim made once
const CROWN = { t: 0.42, r0: 0.04, r1: 0.36, h: 0.17 };
const CROWN_G = Array.from({ length: 3 }, () => {
  const g = new THREE.CylinderGeometry(1.3, 1, 1, 26, 2, true).translate(0, 0.5, 0), p = g.attributes.position, jag = Array.from({ length: 26 }, () => rr(0.35, 1.25));
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0.99) continue; const a = Math.atan2(p.getZ(i), p.getX(i)), j = jag[Math.floor(((a + Math.PI) / 6.2832) * 26) % 26]; p.setY(i, y * j); }
  g.computeVertexNormals(); return g;
});
const crowns = [];
function acidCrown(x, z) {
  const m = new THREE.Mesh(pick(CROWN_G), new THREE.MeshBasicMaterial({ color: 0x9cd838, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(x, surfaceY(x, z) + 0.01, z); m.rotation.y = rand() * 6.283; m.scale.set(CROWN.r0, 0.01, CROWN.r0); m.renderOrder = 2; scene.add(m);
  crowns.push({ m, t: 0 });
}
function stepCrowns(dt) {
  for (let k = crowns.length - 1; k >= 0; k--) {
    const c = crowns[k]; c.t += dt; const u = c.t / CROWN.t;
    if (u >= 1) { scene.remove(c.m); c.m.material.dispose(); crowns.splice(k, 1); continue; }
    const out = 1 - Math.pow(1 - u, 3), up = Math.sin(Math.PI * Math.min(1, u * 1.35)) * (1 - 0.4 * u), r = mix(CROWN.r0, CROWN.r1, out);
    c.m.scale.set(r, Math.max(0.01, CROWN.h * up), r); c.m.material.opacity = 0.8 * Math.pow(1 - u, 1.3);
  }
}
// the glob: a wobbling, stretched gob of acid glowing green, drawing a strand of itself out behind it
export function launchGlob(z, x0, y0, z0, tx, tz, T, vy, gr = SPIT.g) {
  const ty = surfaceY(tx, tz) + 0.05, m = new THREE.Mesh(GLOB_G, GLOB_M);
  m.position.set(x0, y0, z0); m.scale.setScalar(0.075); scene.add(m);
  const halo = new THREE.Sprite(HALO_M); halo.scale.setScalar(0.62); halo.position.set(x0, y0, z0); halo.renderOrder = 3; scene.add(halo);
  const trail = new THREE.Mesh(spitTrailGeo(), SPIT_TRAIL_M); trail.frustumCulled = false; trail.renderOrder = 2; scene.add(trail);
  globs.push({ m, tail: [halo, trail], halo, trail, hist: [new V3(x0, y0, z0)], vx: (tx - x0) / T, vy: vy ?? (ty - y0 + 0.5 * gr * T * T) / T, vz: (tz - z0) / T, gr, t: 0, ph: rand() * 6 });
  soundAt(x0, z0, () => { nz(0.18, 'bandpass', 900, 260, 0.26, 1.4); nz(0.12, 'highpass', 2200, 1100, 0.07); tn(0.12, 'sine', 180, 70, 0.06); });
  const sf = Math.sin(z.face), cf = Math.cos(z.face);
  for (let k = 0; k < 8; k++) fx('acid', x0, y0, z0, sf * rr(1, 3.5) + rr(-0.7, 0.7), rr(-0.6, 0.9), cf * rr(1, 3.5) + rr(-0.7, 0.7), rr(0.03, 0.06), 0.02, rr(0.3, 0.55), 1);
}

// ---- every frame: the spitters' drool and glow, the globs in the air, the splats on the ground, and (on a co-op
// joiner's screen) a puppet spitter's rearing back ----
const _sv = new V3(), _gq = new V3();
export function updateSpit(dt) {
  if (!(dt > 0)) return;
  const pup = netClient();
  spitters.forEach(z => {
    if (z.dead || !zombies.includes(z)) { spitters.delete(z); return; }
    const s = z.sp, sp = z.m.spit;
    if (pup && s) { if (s.w > 0) s.w = Math.min(0.98, s.w + dt / SPIT.wind); s.thr = Math.max(0, s.thr - dt * 2.2); }
    if (!sp || !z.limbs.head) return;
    const w = s ? smooth(clamp(s.w, 0, 1)) : 0, th = s ? s.thr : 0, pulse = 0.5 + 0.5 * Math.sin(run.time * 3.1 + z.phase);
    // the sac breathing, swelling as it rears back and emptying as it spits; it glows brighter as it fills
    sp.sac.scale.set(1 + 0.08 * pulse + 0.55 * w - 0.3 * th, 1 + 0.06 * pulse + 0.5 * w - 0.2 * th, 1 + 0.08 * pulse + 0.45 * w - 0.2 * th);
    sp.sacM.emissive.setRGB(0.17 + 0.08 * pulse + 0.5 * w, 0.3 + 0.12 * pulse + 0.6 * w, 0.04 + 0.1 * w);
    sp.throat.scale.y = 1 + 1.5 * w + 2.5 * th;
    jawStep(z, sp.jaw, dt, th);
    for (const st of sp.strands) { const u = st.userData; st.scale.y = u.len * (1 + 0.35 * Math.sin(run.time * 2.3 + u.ph)) * (1 + w); st.rotation.x = -0.25 * Math.sin(run.time * 1.7 + u.ph); }
    // the glow round its throat (seen across the yard, in the dark), and bile dripping off its chin
    if ((z.vis ?? 1) > 0.05 && (z.glowT = (z.glowT || 0) - dt) <= 0) { z.glowT = 0.1; sp.sac.getWorldPosition(_sv); fx('acidGlow', _sv.x, _sv.y, _sv.z, 0, 0, 0, 0.55 + 0.6 * w, 0.75 + 0.8 * w, 0.32, 0.35 + 0.25 * pulse + 0.4 * w); }
    if ((z.dripT = (z.dripT ?? rr(0.4, 1.4)) - dt) <= 0) {
      z.dripT = rr(0.5, 1.6); sp.strands[0].getWorldPosition(_sv);
      fx('acid', _sv.x, _sv.y - 0.1, _sv.z, rr(-0.1, 0.1), -0.4, rr(-0.1, 0.1), 0.03, 0.02, 0.5, 1);
      if (rand() < 0.5 && !z.vault) acidPool(_sv.x, _sv.z, rr(0.07, 0.12), rr(2.5, 4), rand() * 6.283, true);
    }
    if ((z.gurgT = (z.gurgT ?? rr(1, 4)) - dt) <= 0) { z.gurgT = rr(2.5, 5); if (Math.hypot(z.x - P.x, z.z - P.z) < 16) soundAt(z.x, z.z, () => nz(0.5, 'bandpass', 300, 180, 0.07, 5), true); }
  });
  for (let k = globs.length - 1; k >= 0; k--) {
    const g = globs[k], p = g.m.position, x0 = p.x, z0 = p.z;
    g.t += dt; g.vy -= g.gr * dt; p.x += g.vx * dt; p.y += g.vy * dt; p.z += g.vz * dt;
    // stretched along the way it's flying, wobbling as it goes, its drops following in its wake
    const v = Math.hypot(g.vx, g.vy, g.vz), wob = 1 + 0.12 * Math.sin(g.t * 34 + g.ph);
    _gq.set(p.x + g.vx, p.y + g.vy, p.z + g.vz); g.m.lookAt(_gq); g.m.scale.set(0.075 * wob, 0.075 / wob, 0.075 * (1 + v * 0.05));
    g.hist.unshift(p.clone()); if (g.hist.length > 24) g.hist.pop();
    g.halo.position.copy(p); g.halo.material.opacity = 0.5 + 0.1 * Math.sin(g.t * 23 + g.ph);
    spitTrailShape(g.trail.geometry, g.hist, g.t);
    // steaming as it goes, the vapour left hanging along its way
    if (rand() < dt * SIZZLE.glob) fx('acidSteam', p.x + rr(-0.03, 0.03), p.y, p.z + rr(-0.03, 0.03), rr(-0.1, 0.1), rr(0.1, 0.3), rr(-0.1, 0.1), rr(0.05, 0.08), rr(0.2, 0.32), rr(0.35, 0.6), 0.28);
    // now and then a drop sheds off the end of the trail and falls
    if (rand() < 0.22) { const e = g.hist[Math.min(g.hist.length - 1, 6)]; fx('acid', e.x, e.y, e.z, g.vx * 0.15 + rr(-0.15, 0.15), rr(-0.3, 0.1), g.vz * 0.15 + rr(-0.15, 0.15), rr(0.018, 0.03), 0.01, 0.45, 0.9); }
    // what it hits first: an inside wall, a wall, a sill or a board, or the ground. Never you in the air: it flies on
    // through, and only where it comes down does it splash you (acidSplash: SPIT.splash)
    const wall = (THIN.n && thinHit(x0, z0, p.x, p.z) <= 1) || dropHits(p.x, p.y, p.z), ground = p.y <= surfaceY(p.x, p.z) + 0.04;
    if (!wall && !ground && g.t < 3) continue;
    scene.remove(g.m); g.tail.forEach(q => scene.remove(q)); g.trail.geometry.dispose(); globs.splice(k, 1);
    // against a wall it runs down it, so the splat's on the side it came from, a little short of it, its streaks
    // thrown back off the wall; on the ground they run on the way it was going
    const L = Math.hypot(g.vx, g.vz) || 1, dx = g.vx / L, dz = g.vz / L, bx = wall ? x0 - dx * 0.25 : p.x, bz = wall ? z0 - dz * 0.25 : p.z;
    acidSplash(bx, Math.max(p.y, 0.1), bz, dx, dz, false, wall);
    if (!wall) acidCrown(bx, bz);   // (on the ground: the crown it throws up)
    acidPool(bx, bz, SPIT.pool.r * (wall ? 0.7 : 1), SPIT.pool.t, wall ? Math.atan2(dz, -dx) : Math.atan2(-dz, dx));
  }
  stepCrowns(dt);
  let inAcid = false;
  for (let k = acidPools.length - 1; k >= 0; k--) {
    const q = acidPools[k]; q.t += dt;
    if (q.t >= q.life) { dropPool(q); acidPools.splice(k, 1); continue; }
    // it spreads out fast as it lands, then lies there; drying up, it shrinks back a little, darkens and goes
    const grow = 1 - Math.pow(1 - clamp(q.t / SPIT.pool.grow, 0, 1), 3), dry = clamp((q.life - q.t) / SPIT.pool.dry, 0, 1);
    q.m.scale.setScalar(q.r * 1.25 * (0.3 + 0.7 * grow) * (0.88 + 0.12 * dry)); q.m.material.opacity = 0.92 * dry;
    // lit like the ground it's on, and glowing in its own green over that the whole time it's there (in the dark it's
    // as green as by day), dimming only as it dries and goes
    const glow = (q.tiny ? 0.6 : 1) * (1 - 0.35 * q.t / q.life) * dry; q.glow = glow;
    const dk = 1 - 0.3 * curDark;   // (by day mostly lit, at night mostly its own glow)
    q.m.material.color.setRGB((0.7 + 0.3 * dry) * dk, (0.7 + 0.3 * dry) * dk, (0.6 + 0.4 * dry) * dk);
    q.m.material.emissive.setScalar(POOL_SELF * glow * (0.15 + 0.85 * curDark));
    if (q.bloom) { q.bloom.material.opacity = POOL_BLOOM.a * glow * (0.25 + 0.75 * curDark) * (0.3 + 0.7 * grow) * (0.2 + 0.8 * visAt(q.x, q.z)); q.bloom.scale.setScalar(q.r * POOL_BLOOM.r * (0.5 + 0.5 * grow)); }
    // sizzling: steam off it, with a little smoke, most while it's fresh and less as it cools, and a crackling hiss
    const heat = Math.pow(clamp(1 - q.t / (q.life * 0.85), 0, 1), 0.7);
    if (heat > 0 && rand() < dt * (q.tiny ? SIZZLE.tiny : SIZZLE.steam * q.r) * heat) { const a = rand() * 6.283, d = Math.sqrt(rand()) * q.r * 0.6; fx('acidSteam', q.x + Math.cos(a) * d, q.y + 0.03, q.z + Math.sin(a) * d, rr(-0.06, 0.06), rr(0.25, 0.55), rr(-0.06, 0.06), (q.tiny ? 0.06 : 0.12) * rr(0.8, 1.2), (q.tiny ? 0.25 : 0.5) * rr(0.8, 1.3), rr(0.8, 1.4), (q.tiny ? 0.18 : 0.3) * heat); }
    if (q.tiny) continue;
    if (heat > 0 && rand() < dt * SIZZLE.smoke * q.r * heat) fx('acidSmoke', q.x + rr(-0.4, 0.4) * q.r, q.y + 0.05, q.z + rr(-0.4, 0.4) * q.r, rr(-0.05, 0.05), rr(0.2, 0.4), rr(-0.05, 0.05), 0.14, rr(0.45, 0.75), rr(1.4, 2.2), 0.2 * heat);
    if (heat > 0.05 && (q.crk = (q.crk ?? 0) - dt) <= 0) { q.crk = rr(...SIZZLE.crackle) / heat; const dme = Math.hypot(q.x - P.x, q.z - P.z); if (dme < SIZZLE.hear) soundAt(q.x, q.z, () => { nz(rr(0.04, 0.1), 'highpass', rr(3800, 6000), 2400, 0.03 * heat); if (rand() < 0.4) nz(rr(0.15, 0.3), 'bandpass', 2600, 900, 0.015 * heat, 3); }, true); }
    // bubbling and fuming while it's fresh
    const fresh = clamp(1 - q.t / (q.life * 0.7), 0, 1);
    if (rand() < dt * 9 * q.r * fresh) { const a = rand() * 6.283, d = Math.sqrt(rand()) * q.r * 0.7; fx('acid', q.x + Math.cos(a) * d, q.y + 0.02, q.z + Math.sin(a) * d, 0, rr(0.15, 0.4), 0, 0.02, 0.035, rr(0.2, 0.35), 0.8); }
    if (rand() < dt * 2.2 * q.r * fresh) fx('acidMist', q.x + rr(-0.5, 0.5) * q.r, q.y + 0.04, q.z + rr(-0.5, 0.5) * q.r, rr(-0.05, 0.05), rr(0.12, 0.3), rr(-0.05, 0.05), 0.2, rr(0.5, 0.9), rr(1.2, 1.8), 0.22 * fresh);
    // standing in it (still wet, and not climbing over it) burns: once however many splats you're in
    if (!inAcid && !P.dead && !P.vault && state === 'play' && dry >= 0.3 && Math.hypot(P.x - q.x, P.z - q.z) <= q.r * 0.8 * grow) inAcid = q;
  }
  // the burn creeps up the longer you've stood in it (P.acidT), and lets go again twice as fast once you're out; it
  // drags at your feet
  P.acidT = inAcid ? (P.acidT || 0) + dt : Math.max(0, (P.acidT || 0) - dt * 2);
  if (!inAcid) return;
  const q = inAcid, ramp = 1 + (SPIT.pool.max - 1) * smooth(clamp(P.acidT / SPIT.pool.ramp, 0, 1));
  P.hp -= SPIT.pool.dps * ramp * dt * S.dmgTaken * waveDmg(); P.slow = Math.max(P.slow || 0, SPIT.pool.slow * (1 - S.slowRes));
  if ((P.acidTick = (P.acidTick || 0) - dt) <= 0) { P.acidTick = 0.5; hitFromAt(q.x, q.z, 0.12 * ramp); soundAt(P.x, P.z, () => nz(0.35, 'highpass', 3400, 1600, 0.035 * ramp)); fx('acidMist', P.x, 0.12, P.z, 0, 0.5, 0, 0.15, 0.6, 0.7, 0.4); }
  playerChecks();
}
// the glob bursting as a liquid does: a crown of fine drops thrown out low all round it, most of them on the way it
// was going (back off a wall); a few heavier gobs thrown up and out; and the spatter they make coming down a moment
// after, specks round the splat, each streaked outward the way it flew. Then a wet slap and a hiss, and a breath of
// fume; if it caught you, the hurt (half at the splash's edge)
function acidSplash(x, y, z, dx, dz, direct, wall) {
  const fx0 = wall ? -dx : dx, fz0 = wall ? -dz : dz, fwd = Math.atan2(fz0, fx0);
  for (let k = 0; k < 28; k++) {
    const a = rand() * 6.283, lean = 0.55 + 0.45 * (Math.cos(a) * fx0 + Math.sin(a) * fz0), sp = rr(0.7, 2.4) * (0.45 + lean);
    fx('acid', x + Math.cos(a) * 0.05, y + 0.02, z + Math.sin(a) * 0.05, Math.cos(a) * sp + fx0 * 0.5, rr(0.4, 1.6), Math.sin(a) * sp + fz0 * 0.5, rr(0.015, 0.045), 0.01, rr(0.28, 0.5), 1);
  }
  for (let k = 0; k < 5; k++) fx('acid', x, y + 0.05, z, fx0 * rr(0.4, 1.4) + rr(-0.7, 0.7), rr(1.8, 3), fz0 * rr(0.4, 1.4) + rr(-0.7, 0.7), rr(0.05, 0.085), 0.03, rr(0.5, 0.75), 1);
  for (let k = 0; k < 11; k++) {
    const a = rand() < 0.7 ? fwd + rr(-1.3, 1.3) : rand() * 6.283, d = rr(0.3, 1.4), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    setTimeout(() => { if (state !== 'title') acidPool(px, pz, rr(0.035, 0.11) * (1.25 - d * 0.35), rr(2.5, 5), -a, true); }, (0.1 + d * 0.16) * 1000);
  }
  fx('acidMist', x, y, z, 0, 0.25, 0, 0.35, 1.1, 1.3, 0.35);
  for (let k = 0; k < 5; k++) fx('acidSteam', x + rr(-0.2, 0.2), y + 0.05, z + rr(-0.2, 0.2), rr(-0.3, 0.3), rr(0.4, 0.9), rr(-0.3, 0.3), rr(0.1, 0.16), rr(0.45, 0.8), rr(0.7, 1.2), 0.38);
  fx('acidSmoke', x, y + 0.1, z, 0, 0.35, 0, 0.18, 0.7, 1.6, 0.25);
  setTimeout(() => fx('acidMist', x + fx0 * 0.2, y + 0.05, z + fz0 * 0.2, 0, 0.2, 0, 0.25, 0.9, 1.6, 0.22), 250);
  soundAt(x, z, () => { nz(0.09, 'lowpass', 900, 250, 0.3); nz(0.6, 'highpass', 3000, 1100, 0.1); nz(0.25, 'bandpass', 1400, 600, 0.08, 2); });
  const d = Math.hypot(P.x - x, P.z - z);
  if (P.dead || P.vault || state !== 'play' || (!direct && d > SPIT.splash)) return;
  const k = direct ? 1 : 1 - 0.5 * d / SPIT.splash;
  P.hp -= SPIT.dmg * k * S.dmgTaken * waveDmg(); P.hitFrom = Math.atan2(-dx, -dz); hitFromAt(x - dx, z - dz, SPIT.dmg * k / 25);
  interruptBandage(); SFX.hurt(); ANIM.flinch = 1; ANIM.flinchSide = rand() < 0.5 ? -1 : 1; setShake(Math.max(shake, 0.18));
  P.slow = Math.min(1, (P.slow || 0) + 0.25 * (1 - S.slowRes));
  playerChecks();
}
// a splat on the ground, turned so its streaks run off along ang; tiny ones (drips, specks) are only for show
function acidPool(x, z, r, life, ang, tiny) {
  const y = surfaceY(x, z) + (tiny ? 0.018 : 0.022) + rand() * 0.002;
  const tx = pick(SPLAT_TEX), mt = lam(0xffffff, { map: tx, emissiveMap: tx, emissive: ACID_GLOW, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mt.userData.mobile = true; mt.userData.glow = true;
  const m = new THREE.Mesh(POOL_G, mt); m.position.set(x, y, z); m.rotation.y = ang || 0; m.renderOrder = 1; m.scale.setScalar(0.01); scene.add(m);
  let bloom = null;
  if (!tiny) { bloom = new THREE.Mesh(POOL_G, new THREE.MeshBasicMaterial({ map: TEX_GLOWS[0], color: 0x8fdc34, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); bloom.position.set(x, y + 0.01, z); bloom.renderOrder = 2; bloom.scale.setScalar(r * POOL_BLOOM.r); scene.add(bloom); }
  acidPools.push({ m, bloom, x, y, z, r, life, t: 0, tiny: !!tiny });
}
function dropPool(q) { scene.remove(q.m); q.m.material.dispose(); if (q.bloom) { scene.remove(q.bloom); q.bloom.material.dispose(); } }
// a spitter going down: its sac bursts
export function spitterDies(z) {
  if (z.type !== 'spitter') return;
  spitters.delete(z);
  const sp = z.m.spit, at = sp ? sp.sac.getWorldPosition(new V3()) : new V3(z.x, 1.2, z.z); if (sp) sp.sac.visible = false;
  acidSplash(at.x, at.y, at.z, Math.sin(z.face), Math.cos(z.face), false, false);
  acidPool(z.x + Math.sin(z.face) * 0.3, z.z + Math.cos(z.face) * 0.3, SPIT.burst.r, SPIT.burst.t, rand() * 6.283);
}
export function clearSpit() {
  globs.forEach(g => { scene.remove(g.m); g.tail.forEach(q => scene.remove(q)); g.trail.geometry.dispose(); }); globs.length = 0;
  crowns.forEach(c => { scene.remove(c.m); c.m.material.dispose(); }); crowns.length = 0;
  acidPools.forEach(dropPool); acidPools.length = 0; spitters.clear(); P.acidT = 0;
}

// ---- its pose: rearing back with its head thrown up and shaking as the sac swells (w), then retching forward, head
// and chest snapping down and out, as it spits (thr) ----
export function zSpitPose(z, a, T, K) {
  const s = z.sp; if (!s) return;
  const w = smooth(clamp(s.w, 0, 1)), th = Math.sin(Math.min(1, s.thr) * Math.PI * 0.5);
  if (w > 0.001) { zMix(T, { ux: -0.4, hx: -0.8, rx: -0.06, alx: -0.25, arx: -0.25, aly: -0.45, ary: 0.45, elL: -0.9, elR: -0.9, fw: -0.06, klx: 0.15, krx: 0.15 }, w); T[ZJ.hz] += 0.06 * Math.sin(a.t * 19) * w; }
  if (th > 0.001) { zMix(T, { ux: 0.62, hx: 0.6, fw: 0.14, alx: 0.35, arx: 0.35, elL: -0.4, elR: -0.4 }, th); zBoost(K, ['ux', 'hx', 'fw'], 2.8); }
}
