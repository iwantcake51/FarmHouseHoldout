// Gun materials and the per-slot weapon groups held by the player.

import { basic, lam } from '../core/shaders.js';
import { PM } from '../player/player.js';
import { SLOTS } from './slots.js';

// ---- gun models: each gun has its own shape, mods and tiers add their own parts ----
export const GM = {
  metal: lam(0x2a2b2e), metal2: lam(0x45474a), steel: lam(0x8a8d90), wood: lam(0x5b3f2a), wood2: lam(0x7a5434), brass: lam(0xb08a3e), shell: lam(0x9c2e22), shellB: lam(0x2f62b0), shellO: lam(0xd8682a), shellW: lam(0xe2ded4),
  olive: lam(0x4a5236), oliveD: lam(0x3c4330), red: basic(0xff4a32), laserG: basic(0x5cff74), bat: lam(0x9c7a52), nail: lam(0x9a9a94), wire: lam(0x3a3a38), blade: lam(0xb8bcbf), copper: lam(0xb0663a), filter: lam(0xc0682a), filterB: lam(0x1f4f9a), label: lam(0xe6e2d6), tape: lam(0x8a8a82),
  lens: basic(0xfff2c8), lens2: basic(0x5a8aa8), holo: basic(0x6ad0c0), ember: basic(0xff7a2a), orange: lam(0xd8692c),
  hi: lam(0x7c8188), poly: lam(0x1d1e20), rubber: lam(0x131313), blued: lam(0x252b32), park: lam(0x3a3c36), walnut: lam(0x6a4226), pad: lam(0x3c2c2e), glockS: lam(0x222326), glockT: lam(0x232325), stainless: lam(0xc2c6c9), stainlessD: lam(0x8e9296), walnutD: lam(0x4a2d18), walnut2: lam(0x84552f), engr: lam(0x6f6b63), engrD: lam(0x5a5650),
  dot: basic(0xeae4cc), dotR: basic(0xff5a2a), glass: lam(0x2c5468), holoGlass: new THREE.MeshBasicMaterial({ color: 0x7ab8c8, transparent: true, opacity: 0.35, depthWrite: false }), tan: lam(0x9a8460), fiber: basic(0xf0405a), anoIn: (m => (m.side = THREE.BackSide, m))(lam(0x1c1d20)), filterD: lam(0x14335f), odTape: lam(0x52563a), ano: lam(0x34373c), anoL: lam(0x303236), furn: lam(0x404042), hgPoly: lam(0x3b3c3f), rail: lam(0x3e4146), steelDk: lam(0x56595e), magAl: lam(0x3a3c40),
  fde: lam(0x9c8260), fdeP: lam(0x8e7049), fdeG: lam(0x9f8866)   // the SCAR's flat dark earth: its aluminium upper, its polymer lower, stock and mag, its grips
};
const glowMats = [GM.metal, GM.metal2, GM.wood, GM.brass, GM.bat, GM.steel, GM.wood2, GM.poly, GM.park, GM.blued, GM.walnut, GM.olive, GM.ano, GM.furn, GM.anoL, GM.hgPoly, GM.rail,
  GM.oliveD, GM.glockS, GM.glockT, GM.stainless, GM.stainlessD, GM.walnutD, GM.walnut2, GM.engr, GM.engrD, GM.pad, GM.steelDk, GM.magAl, GM.fde, GM.fdeP, GM.fdeG];
export const GLOW_SET = new Set(glowMats);   // the ones that take the upgrade glow (player/animation.js)
export const gunMeshes = {}, MUZ = {}, AKX = 0.2, X = 0.1, SLIDES = {}, MAGPOS = {}, MAGG = {}, CRANE = {}, HOLDS = {}, CHARGE = {}, BRK = {}, BELT = {}, BIPOD = {};
export let stowDirty = true;
// the guns are built the right way round, but held in the upper body, which is drawn mirrored (player/player.js): each
// hold carries its gun in a group flipped back about the gun's own centre line (x = X), so it's drawn as it was built.
// A point on the gun goes through it (flipOf) to reach the hold's frame
const FLIPS = new WeakMap();
export function flipIn(h) { const f = new THREE.Group(); f.position.x = 2 * X; f.scale.x = -1; f.userData.flip = true; f.userData.side = h.userData.side; f.userData.x0 = h.userData.x0; h.add(f); f.updateMatrix(); FLIPS.set(h, f); return f; }
export const flipOf = h => (h && (FLIPS.get(h) || h.children.find(c => c.userData.flip))) || null;   // (a copy's own too: player/stow.js)
SLOTS.forEach(s => { const g = new THREE.Group(); (s === 'melee' ? PM.armR : PM.upper).add(g); gunMeshes[s] = g; });
gunMeshes.melee.position.set(0, 0, 0.5);

// setters for the variables above that other files change (an imported variable can only be read)
export function setStowDirty(v) { return (stowDirty = v); }
// what fn adds to g, anywhere under it, marked as fitted to the gun: an attachment, which the slot row draws in gold
// (ui/melee-art.js). The attachments go on through it (weapons/build-weapons.js), and the models that build their own
// optic, laser or light build them in it
export function fitted(g, fn) { const was = new Set(); g.traverse(o => was.add(o)); const r = fn(); g.traverse(o => { if (!was.has(o)) o.userData.att = true; }); return r; }
