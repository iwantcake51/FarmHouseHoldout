// Localized damage, dismemberment, crawlers and kills.

import { replay } from '../core/dom.js';
import { goreNear } from '../ui/screen-blood.js';
import { scene, V3 } from '../core/renderer.js';
import { clamp, pick, rand, rr, smooth } from '../core/math.js';
import { outline } from '../effects/screen-outlines.js';
import { netLink } from '../net/net.js';
import { lam, relit } from '../core/shaders.js';
import { box } from '../core/geometry.js';
import { P } from '../player/player.js';
import { addBlood, bloodZombie, stainMat } from '../effects/body-blood.js';
import { WEAP } from '../weapons/gun-stats.js';
import { roundOn } from '../weapons/rounds.js';
import { FEED } from '../upgrades/tier-table.js';
import { EFF, hasMod, healMul, hpCap, run, S, W, waveScrap } from '../game/run-state.js';
import { splatLater, spray } from '../effects/blood-map.js';
import { wallSpray } from '../effects/wall-blood.js';
import { bloodSpurt, burst, gibs } from '../effects/particles.js';
import { fx, hitMist } from '../effects/puffs.js';
import { dropPickup } from '../pickups/pickups.js';
import { makeRagdoll, ragdolls } from './deaths.js';
import { headMulFor, PART_Y, partMult, zombies } from './zombie-types.js';
import { zAnimHit } from './zombie-anim.js';
import { zFree } from './zombie-kit.js';
import { rimMat } from '../effects/outlines.js';
import { hitStop, timeScale } from '../game/hit-feedback.js';
import { breakArmor, crackArmor } from './armor-break.js';
import { _wB, addWound, headShot, severLower, shotWound, WOUND_ZONE } from './wounds.js';
import { METAL } from '../barricades/planks.js';
import { METAL_DROP } from '../barricades/metal-bars.js';
import { gunAmmo } from '../stations/recipes.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { camKick, camPunch, setCamPunch, setShake, setSlowHold, setSlowIn, setSlowTo, shake } from '../game/state.js';
import { ammoTypes } from '../upgrades/upgrades.js';
import { runKill, runStat } from '../ui/run-stats.js';
import { feed, floats, floatText, popEl, streakShow } from '../ui/hud-text.js';
import { spitterDies } from './spitter.js';
import { ELITE_KIND, eliteDies, eliteDown } from './elites.js';
import { hitMark } from '../ui/crosshair.js';
import { cheatIs } from '../ui/cheats.js';
import { netAct, netHitRec, netRec, NREC, NREP, NZ, setNREC } from '../net/sync.js';
import { teamAssist } from '../net/teamwork.js';

// blunt weapons and small calibres bruise and break, they don't cut things off
function canSever(wId) {
  if (wId === 'boom' || wId === 'fire' || wId === 'bleed') return true;
  const D = W(wId); if (!D) return true;
  if (D.ammo === 'p9') return false;
  if (wId === 'bat') return hasMod('nails');
  if (D.blunt) return false;
  return true;
}
export const LIMB_STAGGER = 0.5;   // seconds a zombie reels after losing a limb
// a brute's arms are thick with muscle: one takes BRUTE_ARM of its health to come off (an ordinary zombie's 0.3), so a
// shotgun blast or a heavy round no longer takes one off in a shot (zombies/spawn.js). And its bulk soaks up BRUTE_HIDE
// of every hit, whatever it's from, shown in steel with a shield like armour (dmgNumber): a hard enough hit (a bolt
// gun's round to the head) can still drop one in a shot
export const BRUTE_ARM = 0.8;
const BRUTE_HIDE = 0.4, ELITE_HIDE = { brute: 0.55 };
// armour, on the zombies that turned wearing it (their outfits: zombies/zombie-looks.js; soldiers, SWAT and riot police,
// ARMED_JOBS, only from wave ARMOR_FROM): each piece (ARMOR_KIT) soaks up a share of a hit where it's worn (a) and takes
// so much before it breaks (hp, a share of the zombie's own health). A soldier's helmet and vest; a SWAT officer's
// helmet, plate carrier and the pads and holster on the legs; a riot officer's the same with the face shield down, so
// a headshot does far less; a builder's hard hat, which stops little and splits soon. Heavier rounds go through more of
// it (ARMOR_CAL), slugs and piercing rounds most, hollow points least (ARMOR_ROUND); a melee blow by what it hits with
// (ARMOR_MELEE: how much of the armour still counts): a blunt one jars straight through it, a spiked one (nails, railroad
// spikes) catches on it and an edge (a blade, an axe) glances off; and a brute wears it thinner on its bulk
// (ARMOR_BRUTE). Every helmet is armour, a fireman's or a builder's hard hat only a little; one without a face shield
// only guards the top of the head (above the brow, HELM_BROW), so a shot in the face goes round it. A blast, fire and
// bleeding go round it all. Every hit it blunts shows its number in steel, with a shield (dmgNumber)
export const ARMOR_FROM = 4;
export const ARMED_JOBS = { soldier: 1, swat: 1, riot: 1 };
export const ARMOR_KIT = {
  helmet: { a: 0.3, hp: 0.6, metal: true }, swat: { a: 0.34, hp: 0.75, metal: true }, riot: { a: 0.5, hp: 0.9, metal: true, face: true }, hardhat: { a: 0.15, hp: 0.22 }, fire: { a: 0.12, hp: 0.25 },
  vest: { a: 0.35, hp: 1.1 }, carrier: { a: 0.4, hp: 1.4, metal: true }, pads: { a: 0.2, hp: 0.45 }
};
// what each armed job wears below the hat (the hat's own piece is the hat: zHat)
const JOB_ARMOR = { soldier: { torso: 'vest' }, swat: { torso: 'carrier', legs: 'pads' }, riot: { torso: 'carrier', legs: 'pads' } };
const ARMOR_CAL = { p9: 1, p10: 0.9, magnum: 0.8, rifle: 0.72, shells: 1.05 }, ARMOR_ROUND = { slug: 0.6, pierce: 0.5, flech: 0.85, hollow: 1.3 };
const ARMOR_MELEE = { blunt: 0.35, spiked: 0.8, edge: 0.9 }, ARMOR_BRUTE = 0.6;
// where a helmet's brim is on the head (metres up the head from its pivot): a round that lands below it is in the face
const HELM_BROW = 0.075;
// where on the zombie this round struck, as high as it was there (weapons/firing.js sets it before each hit; null where
// it's not known, a shot from above picking a part at random: then a head hit's on the top of it HELM_TOP of the time)
const HIT_AT = { y: null }, HELM_TOP = 0.35;
export const setHitY = y => { HIT_AT.y = y; };
const _hyV = new THREE.Vector3();
function onHelmet(z, D) {
  if (D.melee) return true;   // (a blow comes down on it)
  const y = HIT_AT.y; if (y === null || !z.m.head) return rand() < HELM_TOP;
  z.m.head.updateWorldMatrix(true, false); _hyV.set(z.x, y, z.z); z.m.head.worldToLocal(_hyV);
  return _hyV.y > HELM_BROW;
}
// the guns that punch through it on their own: the .50 hand cannon, and the battle rifle's full-power 7.62 (not once
// it's been converted to take AK mags: weapons/gun-mods.js)
const ARMOR_GUN = { deagle: 0.55, scar: 0.6 };
const armorGun = wId => ARMOR_GUN[wId] === undefined || (W(wId) || {}).akKit ? 1 : ARMOR_GUN[wId];
// how armour keeps up: thin and easy to punch through early, thicker later (k from its first wave to its last, eased),
// and stiffer the harder your gun hits against its stock damage (pow of what your upgrades added, up to powMax more), so
// it never stops mattering; never more than max of a hit. What wears a piece down: what it stopped, and wear of what
// still got through. At crack of its health left it cracks (zombies/armor-break.js: it darkens and chips), at none it
// breaks off
const ARMOR_SCALE = { wave: [2, 18], k: [0.55, 1.25], pow: 0.5, powMax: 0.35, max: 0.85, wear: 0.3, crack: 0.5 };
export function armorFor(look, hp) {
  const o = {}, put = (slot, k) => { if (k && ARMOR_KIT[k]) o[slot] = { kind: k, hp: ARMOR_KIT[k].hp * hp, max: ARMOR_KIT[k].hp * hp }; };
  put('head', look.hat); const J = JOB_ARMOR[look.job] || {}; put('torso', J.torso); put('legs', J.legs);
  return Object.keys(o).length ? o : null;
}
const armorWaveK = () => { const [a, b] = ARMOR_SCALE.wave, [k0, k1] = ARMOR_SCALE.k; return k0 + (k1 - k0) * smooth(clamp((run.wave - a) / (b - a), 0, 1)); };
const armorPowK = wId => { const B = WEAP[wId], E = EFF[wId]; return B && E && B.dmg ? 1 + Math.min(ARMOR_SCALE.powMax, ARMOR_SCALE.pow * Math.max(0, E.dmg / B.dmg - 1)) : 1; };
// the piece guarding part and how much of a hit on it it takes ({ slot, P, a }), or null where there's none
function armorOf(z, part, D, wId) {
  const A = z.armor; if (!A || wId === 'boom' || wId === 'fire' || wId === 'bleed') return null;
  const slot = part === 'legL' || part === 'legR' ? 'legs' : part, P = A[slot]; if (!P || P.broken) return null;
  if (slot === 'head' && !ARMOR_KIT[P.kind].face && !onHelmet(z, D)) return null;   // (in the face, under the brim)
  const k = D.melee ? ARMOR_MELEE[D.spiked ? 'spiked' : D.blunt ? 'blunt' : 'edge'] : (ARMOR_CAL[D.ammo] ?? 1) * (ARMOR_ROUND[roundOn(wId)] ?? 1) * armorGun(wId);
  return { slot, P, a: clamp(ARMOR_KIT[P.kind].a * k * armorWaveK() * armorPowK(wId) * (z.type === 'brute' ? ARMOR_BRUTE : 1), 0, ARMOR_SCALE.max) };
}
// a hit worn into a piece: it cracks, then comes off (zombies/armor-break.js)
function wearArmor(z, ar, w, dx, dz) {
  const P = ar.P; P.hp -= w;
  if (P.hp < P.max * ARMOR_SCALE.crack) crackArmor(z, ar.slot);
  if (P.hp <= 0) breakArmor(z, ar.slot, dx, dz);
}
// a zombie that's lost a limb bleeds out from the stump, slowly (health a second: a whole arm or leg, a forearm or a shin,
// the most however many it's lost): the same few a second whatever it started with, so one on a later night, with more
// health, takes longer to go down from it, and it's shown by its blood dripping, not by damage numbers
// (zombies/ai.js)
export const BLEED_OUT = { limb: 2.5, lower: 1.5, max: 7.5 };
export const bleedOut = (z, r) => { z.bleedOut = Math.min(BLEED_OUT.max, (z.bleedOut || 0) + r); };
// (mist: blown to a red mist where it was rather than torn off whole: a shotgun's pellets, mistPart)
export function sever(z, part, dx, dz, blast, mist) {
  if (part !== 'torso' && !z.limbs[part]) return;
  if (z.type === 'brute' && !blast && (part === 'legL' || part === 'legR')) return;   // a brute's legs are too thick to take off: it never ends up crawling
  z.limbs[part] = false; netRec('s', part, blast ? 1 : 0);   // (in co-op, what came off goes to the others: net/sync.js)
  const stub = part === 'armL' || part === 'armR' ? armStump(z, part) : null;   // (made before the arm goes: it's cut from it)
  if (mist) mistPart(z, z.m[part], dx, dz); else flingPart(z, z.m[part], dx, dz, 1);
  z.spurts.push(stub ? { part, t: STUMP_PUMP.t, o: stub, p: stub.userData.spurt, d: stub.userData.dir, pump: true } : { part, t: 1.4 });
  if (part !== 'torso') { if (!NREP) run.limbs++; z.stagger = Math.max(z.stagger || 0, LIMB_STAGGER); bleedOut(z, BLEED_OUT.limb); }   // losing an arm or a leg staggers it, slowed to a quarter pace, and it bleeds from the stump
  if (!blast) soundAt(z.x, z.z, () => { SFX.sever(); if (mist) SFX.crush(); });   // a blast plays one sound for the lot
  goreNear(z, mist ? 1 : 0.7);   // (close by, it spatters your view: ui/screen-blood.js)
  if ((part === 'legL' || part === 'legR') && !z.crawl && !z.dead) goCrawl(z);
}
// an arm taken off whole leaves nothing of it at the shoulder but the bone: the raw socket flat on the side of the
// chest where it came away, ragged meat round it and strings of it hanging, and the broken end of the upper-arm bone
// sticking out of it, splintered and bloodied, the shoulder bloodied round it. For STUMP_PUMP.t seconds it pumps blood
// out in spurts, weaker each beat
const STUMP_M = { raw: 0xa01c14, meat: 0xc8402e, dark: 0x5e0c08, bone: 0xdccfb8, boneB: 0xa8281e };
export const STUMP_PUMP = { t: 3.2, rate: 1.5 };
function armStump(z, part) {
  const arm = z.m[part], par = arm && arm.parent; if (!par) return null;
  // its own materials, fading with the body (z.fade) as the rest does
  const op = arm.material.opacity ?? 1, own = c => { const m = lam(c); m.userData.mobile = true; m.transparent = true; m.opacity = op; if (z.fade) z.fade.push(m); return m; };
  const raw = own(STUMP_M.raw), meat = own(STUMP_M.meat), dark = own(STUMP_M.dark), bone = own(STUMP_M.bone), boneB = own(STUMP_M.boneB);
  // (at the shoulder, +z down the side and y forward; the chest's side is sd*0.08 across, sd the way in to it)
  const sd = part === 'armL' ? 1 : -1, fx = sd * 0.08, s = new THREE.Group(); s.position.copy(arm.position); s.rotation.set(Math.PI / 2, 0, 0); par.add(s);
  box(s, 0.012, 0.13, 0.13, dark, fx - sd * 0.004, 0, 0.012);                       // the torn socket, flat on the chest
  box(s, 0.01, 0.1, 0.1, raw, fx - sd * 0.01, 0.004, 0.006);                        // raw muscle in it
  [[0.045, -0.04, 0.03], [-0.05, -0.02, 0.026], [0.03, 0.05, 0.034], [-0.035, 0.045, 0.022], [0, -0.06, 0.03]].forEach(([y, zz, w]) => {   // ragged meat round the edge
    box(s, rr(0.016, 0.03), w, w * rr(0.7, 1.2), rand() < 0.5 ? meat : raw, fx - sd * rr(0.012, 0.02), y, zz).rotation.x = rr(-0.6, 0.6);
  });
  // the bone: the head of it out of the socket, angled out and down, broken off in a splintered end, blood run down it
  const b = new THREE.Group(); b.position.set(fx - sd * 0.012, rr(-0.01, 0.01), 0.004); b.rotation.set(rr(-0.15, 0.15), 0, sd * rr(0.55, 0.8)); s.add(b);   // (its length along -sd x, tipped down)
  const L = rr(0.075, 0.095);
  box(b, L, 0.032, 0.03, bone, -sd * L / 2, 0, 0);
  box(b, 0.022, 0.044, 0.042, bone, -sd * 0.006, 0, 0);                             // the swell of its head at the socket
  [[0.012, 0.018, 0.4], [-0.01, 0.014, -0.5], [0.004, 0.022, 0.15]].forEach(([y, l, a]) => { box(b, l, 0.012, 0.014, bone, -sd * (L + l / 2 - 0.004), y, rr(-0.008, 0.008)).rotation.z = a * sd; });   // splinters off the break
  box(b, 0.006, 0.026, 0.026, boneB, -sd * (L - 0.002), 0, 0);                      // the marrow at the break, bloodied
  box(b, L * 0.7, 0.034, 0.008, boneB, -sd * L * 0.35, 0, 0.012);                   // blood run along it
  box(b, L * 0.5, 0.008, 0.032, boneB, -sd * L * 0.3, -0.017, 0); box(b, L * 0.35, 0.034, 0.007, dark, -sd * L * 0.2, 0, -0.016);   // and round the sides and under it
  box(b, 0.02, 0.036, 0.034, raw, -sd * 0.014, 0, 0);                               // meat still on it at the root
  // strings of meat hanging from the socket
  for (let k = 0; k < 3; k++) box(s, 0.01, 0.012, rr(0.04, 0.08), k ? raw : dark, fx - sd * rr(0.01, 0.03), rr(-0.04, 0.04), 0.07 + k * 0.006).rotation.x = rr(-0.2, 0.2);
  s.traverse(o => { if (o.isMesh) { o.castShadow = true; if (arm.customDepthMaterial) o.customDepthMaterial = arm.customDepthMaterial; } });   // (its shadow fades with the body's too)
  const t = z.m.torso; if (t) addWound(z, WOUND_ZONE.torso, new V3((part === 'armL' ? -1 : 1) * 0.24, 0.2, 0), 0.12, 2);   // the shoulder bloodied
  s.userData.spurt = [fx - sd * 0.02, 0, 0.01]; s.userData.dir = [-sd, 0, 0.45];   // (where it pumps from, and which way: out from the socket, a little down)
  return s;
}
// a piece of a zombie torn off (a limb, or just a forearm or shin: zombies/wounds.js) thrown out as a gib, a burst of
// blood where it came away; v scales how hard it's thrown
export function flingPart(z, mesh, dx, dz, v) {
  const wp = new V3(), wq = new THREE.Quaternion(), ws = new V3();
  mesh.getWorldPosition(wp); mesh.getWorldQuaternion(wq); mesh.getWorldScale(ws);
  mesh.parent.remove(mesh); mesh.children.filter(c => c.userData.isOutline).forEach(c => mesh.remove(c));
  mesh.traverse(o => { if (!o.isMesh || o.userData.isOutline) return; o.customDepthMaterial = undefined; if (z.fade) z.fade = z.fade.filter(mt => mt !== o.material); if (o.material.userData.bloodOf) { o.material.opacity = 1; o.material.transparent = false; o.material.depthWrite = true; o.material.colorWrite = true; } else { o.material = o.material.isMeshLambertMaterial ? relit(o.material) : o.material.clone(); o.material.opacity = 1; o.material.transparent = false; } });   // (only lit materials take the light-map patch: a glow can't)
  bloodZombie(z, 0.12); scene.add(mesh);
  mesh.position.copy(wp); mesh.quaternion.copy(wq); mesh.scale.copy(ws);
  gibs.push({ m: mesh, vx: (dx * rr(2, 4.5) + rr(-1.2, 1.2)) * v, vy: rr(2.5, 4.5) * (0.6 + 0.4 * v), vz: (dz * rr(2, 4.5) + rr(-1.2, 1.2)) * v, spin: rr(6, 14), life: 9, landed: false });
  burst(wp.x, wp.y, wp.z, 10, 'blood', dx, dz, 3); spray(wp.x, wp.z, dx, dz, rr(0.8, 1.3));
}
// a limb blown to red mist by a shotgun's pellets (sever, mist): it's simply gone, a cloud of red where it was (LIMB_MIST:
// how many puffs, how big they start and swell to, how long they hang), driven on along the shot, blood thrown out
// round it and rained on the ground, a few scraps of it tumbling away
const LIMB_MIST = { n: 10, s0: [0.16, 0.28], s1: [0.6, 1.0], life: [1.1, 1.8] };
function mistPart(z, mesh, dx, dz) {
  if (!mesh || !mesh.parent) return;
  mesh.getWorldPosition(_wB); const x = _wB.x, y = _wB.y, hz = _wB.z;
  mesh.parent.remove(mesh); zFree(mesh); bloodZombie(z, 0.25);
  burst(x, y, hz, 16, 'blood', dx, dz, 3);
  for (let k = 0; k < LIMB_MIST.n; k++) { const a = rand() * 6.28, sp = rr(0.2, 1), u = rand(); fx('redMist', x + Math.sin(a) * 0.08 * u, y + rr(-0.15, 0.15), hz + Math.cos(a) * 0.08 * u, Math.sin(a) * sp + dx * rr(0.4, 1.3), rr(-0.2, 0.6), Math.cos(a) * sp + dz * rr(0.4, 1.3), rr(...LIMB_MIST.s0), rr(...LIMB_MIST.s1), rr(...LIMB_MIST.life), rr(0.65, 0.85)); }
  for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(CRUSH_G, CRUSH_M[1 + (k % 3)]), a = rand() * 6.28, sp = rr(1, 2.6);
    c.position.set(x, y, hz); c.rotation.set(rr(0, 6), rr(0, 6), rr(0, 6)); c.scale.setScalar(rr(0.5, 1.1)); c.castShadow = true; scene.add(c);
    gibs.push({ m: c, vx: Math.sin(a) * sp + dx * rr(0.5, 1.5), vy: rr(0.8, 2.6), vz: Math.cos(a) * sp + dz * rr(0.5, 1.5), spin: rr(8, 16), life: 6, landed: false }); }
  spray(x, hz, dx, dz, rr(0.9, 1.4), 1.2);
  for (let k = 0; k < 6; k++) { const a = rand() * 6.28, d = rr(0.2, 1.2); splatLater(0.2 + d * 0.15, x + Math.sin(a) * d, hz + Math.cos(a) * d, 'drop', rr(0.25, 0.45)); }
}
// a leg (or its shin) goes and they buckle and fall forward onto their hands
export function goCrawl(z) {
  z.crawl = true; z.crawlT = 0; z.stagger = Math.max(z.stagger, 0.85); z.trail = 0;
  z.om = outline(z.m.g, 0, 0, 0.026, rimMat(0xe8dcc0)); z.om.opacity = z.vis * 0.5; z.lastVis = undefined;
}
// the fire axe coming down on a skull splits it in two: each half (everything on the head, hair, eyes and all, cut flat
// down the middle by clamping its corners to the cut) falls away to its own side, and the body goes down without it, the
// neck pumping (NECK_PUMP, zombies/zombie-visuals.js). Each piece is clamped to its own plane a little further back
// from the cut (SPLIT_STEP), so no two flat faces lie on top of each other and flicker; over them the raw face of the cut
// is built out in layers, each standing proud of the one under it: the pale rim of the skull, the red meat inside it,
// the brain packed into the top with its folds, a row of teeth along the front and the dark of the throat below, with
// strings of gore hanging off the bottom
const CUT_M = [lam(0x7a1410), lam(0x4e0b08), lam(0xc9b8a0), lam(0xc98a86), lam(0x8e4a4a), lam(0xe8e0cc), lam(0xae6660)], DEAD_EYE = lam(0x2e1612);
CUT_M.concat(DEAD_EYE).forEach(m => { m.userData.mobile = true; });
const SPLIT_STEP = 0.0015;
// the face of any other cut (across, or on a slant), sized to where it really runs through the head (lo, hi: its extent,
// y and z in the cut's frame) and laid out by which way the top of the head is (up): the skull's rim and the meat
// filling it, the brain toward the top with its folds, lumps of it and clots over the meat, and gore hanging off the
// bottom edge. Every layer stands out its own distance from the cut, never two in one plane
function splitFace(cut, half, sd, lo, hi, up) {
  const cy = (lo[0] + hi[0]) / 2, cz = (lo[1] + hi[1]) / 2, h = Math.max(0.05, hi[0] - lo[0]), w = Math.max(0.05, hi[1] - lo[1]);
  const uy = up.y, uz = up.z, ul = Math.hypot(uy, uz) || 1, ty = uy / ul, tz = uz / ul;   // (the top, across the face)
  cut(w * 0.98, h * 0.98, 0.012, 2, 0.004, cy, cz);   // the skull's rim
  cut(w * 0.88, h * 0.88, 0.012, 0, 0.009, cy, cz);   // the meat
  const by = cy + ty * h * 0.16, bz = cz + tz * w * 0.12;
  cut(w * 0.6, h * 0.5, 0.012, 3, 0.015, by, bz);   // the brain
  for (let k = -1; k <= 1; k++) cut(w * (0.5 - Math.abs(k) * 0.1), 0.008, 0.006, 4, 0.026, by + k * h * 0.12, bz);   // its folds
  for (let k = 0; k < 3; k++) cut(rr(0.04, 0.07), rr(0.035, 0.05), 0.006, 6, k % 2 ? 0.018 : 0.021, by + rr(-0.3, 0.3) * h * 0.4, bz + rr(-0.3, 0.3) * w * 0.4);   // lumps of it
  for (let k = 0; k < 4; k++) cut(rr(0.03, 0.05), rr(0.03, 0.05), 0.004, 1, 0.012, cy + rr(-0.35, 0.35) * h, cz + rr(-0.35, 0.35) * w);   // clots over the meat
  for (let k = 0; k < 2; k++) { const len = rr(0.04, 0.09), hy = cy - ty * h * 0.48 - len / 2; box(half, 0.012, len, 0.014, CUT_M[k], -sd * rr(0.006, 0.012), hy, cz + rr(-0.3, 0.3) * w); }   // gore hanging off it
}
// the cut face, in the head's frame: [w (front to back), h, thickness, material, how far it stands out of the cut, y, z]
const CUT_LAYERS = [
  [0.3, 0.3, 0.012, 2, 0.004, 0, 0],                 // the skull's rim
  [0.27, 0.27, 0.012, 0, 0.009, -0.004, 0],          // the meat
  [0.2, 0.15, 0.012, 3, 0.015, 0.055, -0.01],        // the brain, up in the top of it
  [0.17, 0.008, 0.006, 4, 0.026, 0.085, -0.01],      // its folds, over the lumps of it (below)
  [0.15, 0.008, 0.006, 4, 0.026, 0.055, -0.02],
  [0.13, 0.008, 0.006, 4, 0.026, 0.025, -0.005],
  [0.1, 0.07, 0.008, 1, 0.014, -0.08, -0.02]         // the throat
];
// the ways a head's cut (SPLIT_CUT): the axe's straight down the middle front to back (v) or clean across through the
// eyes (h), a blade's on a slant from one temple down to the other side of the jaw (d, e). Each is a plane through the
// head, its normal (n) and a point on it (o), in the head's own frame
const SPLIT_CUT = { v: { n: [1, 0, 0], o: [0, 0, 0] }, h: { n: [0, 1, 0], o: [0, 0.02, 0] }, d: { n: [0.71, 0.71, 0], o: [0, 0, 0] }, e: { n: [-0.71, 0.71, 0], o: [0, 0, 0] } };
// how often a katana or machete that kills with a blow to the head takes it off on a slant (the rest, as before)
const SLANT_SPLIT = 0.45;
export function splitHead(z, dx, dz, kind = 'v') {
  const head = z.m.head; if (!head || !z.limbs.head) return false;
  z.limbs.head = false; netRec('p', kind);
  head.updateWorldMatrix(true, true);
  const inv = head.matrixWorld.clone().invert(), wp = new V3(), wq = new THREE.Quaternion(), ws = new V3(), rel = new THREE.Matrix4(), mats = new Map();
  head.matrixWorld.decompose(wp, wq, ws);
  const pieces = []; head.traverse(o => { if (o.isMesh && !o.userData.isOutline && o.visible) pieces.push(o); });
  // the cut's own frame: its x along the plane's normal, through the point on it, so the cut is always x = 0 there (and
  // straight down the middle that's the head's own frame, as it was)
  const C = SPLIT_CUT[kind] || SPLIT_CUT.v, cq = new THREE.Quaternion().setFromUnitVectors(new V3(1, 0, 0), new V3(...C.n).normalize()), co = new V3(...C.o);
  const toCut = new THREE.Matrix4().compose(co, cq, new V3(1, 1, 1)).invert(), hq = wq.clone().multiply(cq);
  const across = new V3(1, 0, 0).applyQuaternion(hq), plain = kind === 'v';
  const up = new V3(0, 1, 0).applyQuaternion(cq.clone().invert());   // (the head's up, in the cut's frame)
  let lo = [9, 9], hi = [-9, -9];   // (how far the cut runs across the head: y and z in the cut's frame)
  [-1, 1].forEach(sd => {
    const half = new THREE.Group(); half.position.copy(co).multiply(ws).applyQuaternion(wq).add(wp).addScaledVector(across, sd * 0.03 * ws.x); half.quaternion.copy(hq); half.scale.copy(ws);   // (started a little apart, so the faces of the cut don't meet)
    pieces.forEach((o, k) => {
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)).applyMatrix4(toCut);
      const a = g.attributes.position.array, c = 0.001 + k * SPLIT_STEP; let any = false;
      // (where the cut goes through it: every edge of every face that crosses it, once, before it's flattened)
      if (sd < 0 && !o.material.isMeshBasicMaterial) for (let i = 0; i < a.length; i += 9) for (const [p, q] of [[0, 3], [3, 6], [6, 0]]) {
        const x0 = a[i + p], x1 = a[i + q]; if ((x0 > 0) === (x1 > 0)) continue;
        const t = x0 / (x0 - x1), y = a[i + p + 1] + (a[i + q + 1] - a[i + p + 1]) * t, zz = a[i + p + 2] + (a[i + q + 2] - a[i + p + 2]) * t;
        lo[0] = Math.min(lo[0], y); lo[1] = Math.min(lo[1], zz); hi[0] = Math.max(hi[0], y); hi[1] = Math.max(hi[1], zz);
      }
      for (let i = 0; i < a.length; i += 3) { if (a[i] * sd > c) any = true; a[i] = sd > 0 ? Math.max(c, a[i]) : Math.min(-c, a[i]); }
      if (!any) { g.dispose(); return; }
      g.computeVertexNormals();
      const om = o.material, st = om.userData.bloodOf && z.stain;
      let mt;
      if (om.isMeshBasicMaterial) mt = DEAD_EYE;
      else if (st) { mt = stainMat(om.userData.bloodOf, head, head, z.stain.u, 0, 5); z.stain.list.push([om.userData.bloodOf, mt]); }   // the pieces are in the head's own frame now
      else mt = mats.get(om) || (mats.set(om, relit(om)), mats.get(om));
      mt.opacity = 1; mt.transparent = false; mt.userData.mobile = true;
      const m = new THREE.Mesh(g, mt); m.castShadow = true; half.add(m);
    });
    // the face of the cut, built out toward the other half (-sd); a layer's outer face is `out` from the cut
    const cut = (w, h, t, mi, out, y, zz) => box(half, t, h, w, CUT_M[mi], -sd * (out - t / 2), y, zz);
    if (plain) {
      CUT_LAYERS.forEach(L => cut(L[0], L[1], L[2], L[3], L[4], L[5], L[6]));
      for (let k = 0; k < 4; k++) cut(rr(0.05, 0.08), rr(0.04, 0.06), 0.006, 6, k % 2 ? 0.018 : 0.021, rr(0.03, 0.08), rr(-0.08, 0.06));   // the brain swelling out in lumps
      for (let k = 0; k < 5; k++) cut(rr(0.03, 0.06), rr(0.03, 0.06), 0.004, 1, 0.012, rr(-0.12, 0.0), rr(-0.12, 0.12));   // clots of dark blood over the meat
      for (let k = 0; k < 4; k++) cut(0.022, 0.03, 0.01, 5, 0.017, -0.105, 0.13 - k * 0.028);   // teeth along the front
      for (let k = 0; k < 2; k++) { const len = rr(0.05, 0.11); box(half, 0.012, len, 0.014, CUT_M[k], -sd * rr(0.006, 0.012), -0.13 - len / 2, rr(-0.08, 0.06)); }   // gore hanging off it
    } else if (hi[0] > lo[0]) splitFace(cut, half, sd, lo, hi, up);
    scene.add(half);
    // (cut clean across, the top's knocked off along the blow and the jaw drops where it was; otherwise each half off
    // to its own side)
    if (kind === 'h') gibs.push({ m: half, vx: dx * (sd > 0 ? rr(1.6, 2.6) : rr(0.2, 0.5)), vy: sd > 0 ? rr(2, 3) : rr(0.3, 0.9), vz: dz * (sd > 0 ? rr(1.6, 2.6) : rr(0.2, 0.5)), spin: sd > 0 ? rr(4, 8) : rr(1, 2), life: 9, landed: false });
    else gibs.push({ m: half, vx: across.x * sd * rr(1.4, 2.2) + dx * rr(0.6, 1.4), vy: rr(1.8, 2.8), vz: across.z * sd * rr(1.4, 2.2) + dz * rr(0.6, 1.4), spin: sd * rr(3, 6), life: 9, landed: false });
  });
  head.parent.remove(head); zFree(head); bloodZombie(z, 0.35);
  // the blood: a burst on along the blow and one off each side with the halves, a red mist where the head was, chunks of
  // brain and bone thrown out, and the ground painted both ways
  burst(wp.x, wp.y, wp.z, 24, 'blood', dx, dz, 4); burst(wp.x, wp.y + 0.1, wp.z, 12, 'blood', across.x, across.z, 3); burst(wp.x, wp.y + 0.1, wp.z, 12, 'blood', -across.x, -across.z, 3);
  burst(wp.x, wp.y + 0.15, wp.z, 10, 'blood', 0, 0, 1.2);   // straight up out of the neck
  for (let k = 0; k < 6; k++) { const a = rand() * 6.28, sp = rr(0.5, 1.5); fx('mist', wp.x + Math.sin(a) * 0.06, wp.y + rr(-0.08, 0.1), wp.z + Math.cos(a) * 0.06, Math.sin(a) * sp + dx * 0.8, rr(-0.2, 0.6), Math.cos(a) * sp + dz * 0.8, rr(0.12, 0.2), rr(0.6, 1), rr(0.45, 0.75), 0.55); }
  for (let k = 0; k < 6; k++) {
    const sd = k % 2 ? 1 : -1, sp = rr(1, 2.6), c = new THREE.Mesh(CRUSH_G, k < 4 ? CUT_M[3] : CUT_M[2]);
    c.position.copy(wp); c.rotation.set(rr(0, 6), rr(0, 6), rr(0, 6)); c.scale.setScalar(rr(0.6, 1.2)); c.castShadow = true; scene.add(c);
    gibs.push({ m: c, vx: across.x * sd * sp + dx * rr(0.5, 1.5), vy: rr(1.2, 3), vz: across.z * sd * sp + dz * rr(0.5, 1.5), spin: rr(8, 16), life: 6, landed: false });
  }
  spray(wp.x, wp.z, dx, dz, rr(1.3, 1.8), 1.4); spray(wp.x, wp.z, across.x, across.z, rr(0.9, 1.3), 1.4); spray(wp.x, wp.z, -across.x, -across.z, rr(0.9, 1.3), 1.4);
  splatLater(0.3, z.x + dx * 0.25, z.z + dz * 0.25, 'pool', rr(0.6, 0.8), undefined, 0.8);
  // the hit: a crack through the skull and a wet split under the blade's own sound, a hard shake and a jolt of zoom, the
  // view driven on along the blow, and your weapon and you spattered
  soundAt(z.x, z.z, () => { SFX.sever(); SFX.hitBlade(true); SFX.split(); });
  if (!NREP) { setShake(Math.max(shake, 0.6)); setCamPunch(Math.max(camPunch, 0.05)); camKick.x += dx * 0.15; camKick.z += dz * 0.15; addBlood(0.05, 'axe', 0.15); run.heads++; run.limbs++; }
  goreNear(z, 1);
  return true;
}
// the sledgehammer coming down on a skull crushes it: the head caves in and bursts, gone in a spray of blood thrown
// out all round with chips of bone, scalp and brains, the blood raining down on the ground about the body, and the body
// drops without it, the neck still pumping as it falls (NECK_PUMP, zombies/zombie-visuals.js)
const CRUSH_G = new THREE.BoxGeometry(0.06, 0.03, 0.05), CRUSH_M = [lam(0xd8cdb6), lam(0x7a1410), lam(0x4e0b08), lam(0xc98a86)];
CRUSH_M.forEach(m => { m.userData.mobile = true; });
export const NECK_PUMP = 2.6;
const HEAD_MIST = { n: 14, s0: [0.22, 0.34], s1: [0.8, 1.25], life: [1.3, 2.1] };
export function crushHead(z, dx, dz) {
  const head = z.m.head; if (!head || !head.parent || !z.limbs.head) return false;
  z.limbs.head = false; netRec('c');
  head.getWorldPosition(_wB); const x = _wB.x, y = _wB.y, hz = _wB.z;
  head.parent.remove(head); zFree(head); bloodZombie(z, 0.4);
  // the burst: most of it driven on along the blow, the rest thrown out all round, and the head gone to a cloud of red
  // mist where it was (HEAD_MIST: how many puffs, how big they start and swell to, how long it hangs), pushed on a little
  // along the blow and sinking slowly as it thins
  burst(x, y, hz, 22, 'blood', dx, dz, 3);
  for (let k = 0; k < HEAD_MIST.n; k++) { const a = rand() * 6.28, sp = rr(0.2, 1.1), u = rand(); fx('redMist', x + Math.sin(a) * 0.1 * u, y + rr(-0.12, 0.12), hz + Math.cos(a) * 0.1 * u, Math.sin(a) * sp + dx * rr(0.4, 1.4), rr(-0.2, 0.7), Math.cos(a) * sp + dz * rr(0.4, 1.4), rr(HEAD_MIST.s0[0], HEAD_MIST.s0[1]), rr(HEAD_MIST.s1[0], HEAD_MIST.s1[1]), rr(HEAD_MIST.life[0], HEAD_MIST.life[1]), rr(0.7, 0.9)); }
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28 + rr(-0.3, 0.3); burst(x, y, hz, 4, 'blood', Math.sin(a), Math.cos(a), rr(2.5, 4.5)); }
  for (let k = 0; k < 8; k++) { const a = rand() * 6.28, sp = rr(0.6, 1.8); fx('mist', x + Math.sin(a) * 0.08, y + rr(-0.1, 0.1), hz + Math.cos(a) * 0.08, Math.sin(a) * sp + dx * 0.6, rr(-0.4, 0.6), Math.cos(a) * sp + dz * 0.6, rr(0.12, 0.2), rr(0.7, 1.1), rr(0.5, 0.8), 0.6); }
  // what's left of it: chips of skull, scalp in the zombie's own skin, brains and gore, tumbling off and bleeding as they go
  const scalp = lam(z.m.skinCol); scalp.userData.mobile = true;
  for (let k = 0; k < 10; k++) {
    const a = rand() * 6.28, sp = rr(1.2, 3.2), c = new THREE.Mesh(CRUSH_G, k < 2 ? scalp : CRUSH_M[k % 4]);
    c.position.set(x + rr(-0.06, 0.06), y + rr(-0.05, 0.05), hz + rr(-0.06, 0.06)); c.rotation.set(rr(0, 6), rr(0, 6), rr(0, 6)); c.scale.setScalar(rr(0.5, 1.3)); c.castShadow = true; scene.add(c);
    gibs.push({ m: c, vx: Math.sin(a) * sp + dx * rr(0.5, 1.5), vy: rr(1, 3.4), vz: Math.cos(a) * sp + dz * rr(0.5, 1.5), spin: rr(8, 16), life: 6, landed: false });
  }
  // the ground round it painted as it comes down: a heavy splash just past the body, sprays flung out every way (up the
  // walls too, from that height) and a ring of spatter, the further out the later
  splatLater(0.32, z.x + dx * 0.35, z.z + dz * 0.35, 'pool', rr(0.8, 1.0), undefined, 0.9);
  for (let k = 0; k < 5; k++) { const a = Math.atan2(dx, dz) + (k - 2) * 1.1 + rr(-0.3, 0.3); spray(x, hz, Math.sin(a), Math.cos(a), rr(0.9, 1.5) * (k === 2 ? 1.3 : 1), 1.6); }
  for (let k = 0; k < 12; k++) { const a = rand() * 6.28, d = rr(0.3, 1.8); splatLater(0.25 + d * rr(0.1, 0.18), z.x + Math.sin(a) * d, z.z + Math.cos(a) * d, 'drop', rr(0.25, 0.5)); }
  soundAt(z.x, z.z, () => SFX.crush()); if (!NREP) { setShake(Math.max(shake, 0.5)); run.heads++; }
  goreNear(z, 1);
  return true;
}
export function pickPart(z, rel, side, D) {
  const head = Math.min(0.85, 0.14 + S.headBonus);
  let p;
  if (Math.abs(rel) > 0.6) p = side > 0 ? 'armR' : 'armL';
  else { const r = rand(); p = r < head ? 'head' : r < head + 0.22 ? (side > 0 ? 'legR' : 'legL') : 'torso'; }
  if (z.crawl && (p === 'legL' || p === 'legR')) p = 'torso';
  if (!z.limbs[p]) p = 'torso';
  return p;
}
// what of a zombie a shot meets at height y above the ground (null: it goes over it, or through where a lost limb was):
// the head up top, the body (or an arm out at the side, rel as for pickPart) in the middle, a leg below; a crawler only
// low down. For a shot whose height on its way is known: one gone through the zombie you aimed at, or one in front of
// it (weapons/firing.js), so a round through one's head goes on over the next one's, not into its legs
export function partAt(z, y, rel, side) {
  const h = y / (z.T.scale || 1);
  if (z.crawl) return h < 0.62 ? (z.limbs.head && Math.abs(rel) < 0.4 && rand() < 0.35 ? 'head' : 'torso') : null;
  if (h > 1.82 || h < 0) return null;
  if (h > 1.4) return z.limbs.head ? 'head' : null;
  if (h > 0.78) { const arm = side > 0 ? 'armR' : 'armL'; return Math.abs(rel) > 0.6 ? (z.limbs[arm] ? arm : null) : 'torso'; }
  const leg = side > 0 ? 'legR' : 'legL'; return z.limbs[leg] ? leg : z.limbs[side > 0 ? 'legL' : 'legR'] && Math.abs(rel) < 0.3 ? (side > 0 ? 'legL' : 'legR') : null;
}
// set just before a scoped shot's hurtZombie when it lands a crit (weapons/firing.js), so the number shows it
let critNext = false, headNext = 1;   // the next hit's crit, and how much of its headshot bonus is left at that range (headFade, weapons/ammo.js)
// fire: one tick of burn damage (zombies/ai.js) with its own orange number; true if it killed
export const BURN_TICK = 0.5, BURN_DMG = 7;
export function burnHurt(z) {
  if (z.dead) return true;
  const dmg = BURN_DMG * (S.lastStand && P.hp < hpCap() * 0.3 ? 1.6 : 1);
  z.hp -= dmg; z.flash = Math.max(z.flash, 0.05);
  dmgNumber(z, dmg, false, 1.2 * z.T.scale * (z.crawl ? 0.4 : 1), false, 'burn');
  if (z.hp <= 0) { killZombie(z, -Math.sin(z.face), -Math.cos(z.face), 'fire', 'torso', 0); return true; }
  return false;
}
// bleeding: how long a cut keeps bleeding (each new one starts it over), how hard a blade bleeds it (health a
// second), and the most flechettes can make it bleed however many land
export const BLEED_T = 4, BLEED_R = 8, DART_BLEED_MAX = 12;
// in co-op the hit, and whatever it takes off or kills, goes to the other players as it happened here (netAct, net/sync.js)
// a leg shot that doesn't take the leg off slows it down: the worse its worst leg's been hurt, the slower it goes, down
// to LEG_SLOW.most of its pace (a brute, LEG_SLOW.brute); only a leg taken off (or the shin off it) puts it down crawling
const LEG_SLOW = { most: 0.5, brute: 0.25 };
export function legSlow(z) {
  let h = 0; for (const L of ['legL', 'legR']) if (z.limbs[L]) h = Math.max(h, 1 - z.lhp[L] / (z.maxHp * 0.4));
  return 1 - clamp(h, 0, 1) * (z.type === 'brute' ? LEG_SLOW.brute : LEG_SLOW.most);
}
export function hurtZombie(z, dmg, dx, dz, kb, wId, part) { return netAct(z, dx, dz, () => hurtZombie0(z, dmg, dx, dz, kb, wId, part)); }
function hurtZombie0(z, dmg, dx, dz, kb, wId, part) {
  const crit = critNext, headK = headNext; critNext = false; headNext = 1;
  if (z.dead) return false;
  const D = W(wId) || EFF[wId] || {};
  part = part || 'torso';
  if (part !== 'torso' && !z.limbs[part]) part = 'torso';
  if (S.lastStand && P.hp < hpCap() * 0.3) dmg *= 1.6;
  if (S.momentum && run.time - S.momT < MOM_T) dmg *= 1 + 0.05 * S.momK;   // Momentum: +5% for each quick kill, up to 5
  if (z.crawl) dmg *= 1.75;   // a crawler is already half dead
  if (z.type === 'brute' && D.bruteX) dmg *= D.bruteX;   // the SCAR's heavy rounds (weapons/gun-stats.js)
  // a melee weapon hits for what it says every time: where it lands only decides what comes off (sever, below), never
  // the damage, so there are no random weak arm hits or headshot spikes. Bullets still count where they hit
  let dealt = dmg * (D.melee ? 1 : part === 'head' ? 1 + (headMulFor(D) - 1) * headK : partMult(part));
  const ar = armorOf(z, part, D, wId), arm = ar ? ar.a : 0, through = dealt * (1 - arm); if (ar) wearArmor(z, ar, dealt * arm + through * ARMOR_SCALE.wear, dx, dz); dealt = through;   // (what it was wearing there: ARMOR_KIT)
  if (z.type === 'brute' || z.elite) dealt *= 1 - (z.type === 'brute' && z.elite ? ELITE_HIDE.brute : BRUTE_HIDE);   // (its bulk: BRUTE_HIDE; an elite's as thick, an elite brute's thicker: ELITE_HIDE)
  if (cheatIs('onehit') && wId !== 'bleed' && wId !== 'fire') dealt = Math.max(dealt, z.hp + 1);   // (the cheat menu's one-hit kills: ui/cheats.js)
  hitFx(z, dealt, dx, dz, kb, wId, part, D);
  z.myDmg = (z.myDmg || 0) + dealt; z.myAt = run.time;   // (your share of it, for an assist in co-op: net/teamwork.js)
  dmgNumber(z, dealt, part === 'head' && !D.melee, PART_Y[part] * z.T.scale * (z.crawl ? 0.4 : 1), crit, arm > 0 || z.type === 'brute' ? 'armor' : '');
  // a shotgun's load (buckshot, a slug or flechettes; not dragon's breath) counted by the part it lands on in one shot
  // (z.pel, kept by the time it was fired): enough of it on an arm or a leg (PEL_MIST: n, a dart counting dart of a
  // pellet, a slug all of it at once) and the limb's gone, blown to red mist, however much of it was left
  const pelOn = D.ammo === 'shells' && !D.dragon && !D.melee;
  if (pelOn) { if (z.pelT !== run.time) { z.pelT = run.time; z.pel = {}; } z.pel[part] = (z.pel[part] || 0) + ((D.pellets || 1) > 1 ? (D.dart ? PEL_MIST.dart : 1) : PEL_MIST.n); }
  if (pelOn && part !== 'torso' && part !== 'head' && z.limbs[part] && z.pel[part] >= PEL_MIST.n && canSever(wId)) sever(z, part, dx, dz, false, true);
  else if (part !== 'torso' && part !== 'head') {
    const mul = (D.ammo === 'shells' && !D.dart ? 2.6 : D.melee ? 1 + (D.sever || 0) * 2 : 1) * S.severMul * (D.severX || 1);   // (hollow points: weapons/rounds.js)
    z.lhp[part] -= dmg * mul;
    // shot through below the elbow or knee, it's mostly just that much that goes first (zombies/wounds.js), and what's
    // left of the limb takes a little more
    if ((z.lhp[part] <= 0 || D.alwaysSever) && canSever(wId)) {
      if (!(z.cut && z.cut[part]) && !D.alwaysSever && rand() < 0.65 && severLower(z, part, dx, dz)) z.lhp[part] = z.maxHp * (part[0] === 'a' ? (z.type === 'brute' ? 0.3 : 0.12) : 0.16);
      else sever(z, part, dx, dz);
    }
  }
  // a serrated blade opens one steady bleed; flechettes stack it, each dart that lands bleeding it a little harder
  if (D.bleed === true) { z.bleed = Math.max(z.bleed, BLEED_T); z.bleedR = Math.max(z.bleedR || 0, BLEED_R); }
  else if (D.bleed) { z.bleed = Math.max(z.bleed, BLEED_T); z.bleedR = Math.min(DART_BLEED_MAX, (z.bleedR || 0) + D.bleed); }
  netHitRec(z, dealt, part, kb, wId);
  { const dd = Math.hypot(z.x - P.x, z.z - P.z);
    if (D.melee) addBlood(0.025 + (z.limbs[part] === false ? 0.04 : 0), wId, 0.08 + (D.sever ? 0.04 : 0));
    else if (dd < 2.6) addBlood(D.ammo === 'shells' ? 0.03 : 0.015, wId, 0.035); }
  if (z.hp <= 0) { killZombie(z, dx, dz, wId, part, -z.hp); return true; }
  soundAt(z.x, z.z, () => { SFX.tick(); if (part === 'head') SFX.headHit(); });
  if (wId !== 'fire' && wId !== 'bleed') hitMark(part === 'head' ? 'head' : 'hit');   // (on your crosshair: ui/crosshair.js)
  return false;
}
// what a hit does to the body, whoever's it was: the health off it, the flash, the hole, the jolt, the blood, and the
// stagger and knockback (brutes shrug those off, but for the SCAR's stagger). A teammate's hits come through here too (net/sync.js)
export function hitFx(z, dealt, dx, dz, kb, wId, part, D) {
  z.hp -= dealt; z.flash = 0.14; z.squash = 1;
  if (!D.melee && wId !== 'boom' && wId !== 'fire' && wId !== 'bleed' && (D.ammo !== 'shells' || rand() < 0.6)) shotWound(z, part, dx, dz, D, dealt, z.hp <= 0);   // the hole it leaves (zombies/wounds.js)
  zAnimHit(z, dx, dz, part, 0.45 + Math.min(1.1, dealt / 55));   // the body rocked by it (zombies/zombie-anim.js)
  bloodZombie(z, (D.melee ? 0.1 : D.ammo === 'shells' ? 0.08 : 0.05) * (part === 'head' ? 1.4 : 1) * (1 + Math.min(1, dealt / 80)));
  for (const o of zombies) if (o !== z && Math.abs(o.x - z.x) < 1.3 && Math.abs(o.z - z.z) < 1.3 && Math.hypot(o.x - z.x, o.z - z.z) < 1.2) bloodZombie(o, 0.025);
  if (z.type !== 'brute') { z.stagger = Math.max(part === 'head' ? 0.3 : part === 'legL' || part === 'legR' ? 0.35 : 0.18, D.stagger || 0); z.vx += dx * kb / z.T.scale; z.vz += dz * kb / z.T.scale; }   // (a slug or the SCAR rocks it for longer: D.stagger)
  else if (D.bruteStagger) z.stagger = Math.max(z.stagger, D.bruteStagger);   // (only the SCAR's rounds stop a brute, and break off its charge: zombies/brute-dash.js)
  const y = PART_Y[part] * z.T.scale * (z.crawl ? 0.4 : 1);
  burst(z.x, y, z.z, part === 'head' ? 9 : 6, 'blood', dx, dz, 3.2); hitMist(z.x, y, z.z, dx, dz, part === 'head', dealt);
  if (wId !== 'fire' && wId !== 'bleed') wallSpray(z.x, y, z.z, dx, dz, clamp(0.35 + dealt / 70, 0.35, 1.1) * (D.ammo === 'shells' ? 1.2 : 1));   // up the wall behind it (effects/wall-blood.js)
  bloodSpurt(z.x, y, z.z, dx, dz, Math.round(clamp(5 + dealt / 6, 5, 16) * (part === 'head' ? 1.3 : 1)), 0.85 + Math.min(0.5, dealt / 120));   // gushing out of it (effects/particles.js)
  if (rand() < 0.7) spray(z.x, z.z, dx, dz, rr(0.6, 1.1));
}
// a zombie caught right in a blast comes apart: head, arms, legs and torso all thrown out and tumbling, a burst of
// blood and a red mist where it stood, and the ground round it painted
export function blowApart(z, dx, dz) {
  const x = z.x, zz = z.z, y = 0.9 * z.T.scale;
  netRec('b'); const rec = NREC; setNREC(null);   // (the others blow it apart their own way: just that it was)
  for (const part of ['head', 'armL', 'armR', 'legL', 'legR', 'torso']) {
    const a = Math.atan2(dx, dz) + rr(-1.4, 1.4), n0 = gibs.length;
    sever(z, part, Math.sin(a), Math.cos(a), true);
    for (let k = n0; k < gibs.length; k++) { const g = gibs[k]; g.vx *= 1.7; g.vz *= 1.7; g.vy += rr(1.5, 3.5); g.spin *= 1.5; }
  }
  for (let k = 0; k < 7; k++) { const a = rand() * 6.28; burst(x, y, zz, 5, 'blood', Math.sin(a), Math.cos(a), rr(4, 7)); }
  for (let k = 0; k < 7; k++) { const a = rand() * 6.28, sp = rr(0.8, 2.2); fx('mist', x + Math.sin(a) * 0.2, y + rr(-0.3, 0.3), zz + Math.cos(a) * 0.2, Math.sin(a) * sp, rr(0.2, 1.2), Math.cos(a) * sp, rr(0.3, 0.5), rr(1.2, 1.9), rr(0.7, 1.1), 0.75); }
  for (let k = 0; k < 6; k++) { const a = rand() * 6.28; spray(x, zz, Math.sin(a), Math.cos(a), rr(1.4, 2.6)); }
  for (let k = 0; k < 8; k++) { const a = k * 0.785 + rr(-0.3, 0.3); wallSpray(x, rr(0.5, 1.4), zz, Math.sin(a), Math.cos(a), 1.6); }   // painting the walls round it (effects/wall-blood.js)
  for (let k = 0; k < 10; k++) { const a = rand() * 6.28, d = rr(0.4, 2.4); splatLater(0.15 + d * rr(0.12, 0.2), x + Math.sin(a) * d, zz + Math.cos(a) * d, 'drop', rr(0.3, 0.6)); }   // the further out, the longer in the air
  scene.remove(z.m.g); zFree(z.m.g); if (z.blob) scene.remove(z.blob);
  soundAt(x, zz, () => SFX.sever()); setNREC(rec);
}
// Hoarder's odds of a doubled scrap drop, and Bullet time's: how likely a kill sets it off, how slow, how long, and the wait
// before it can go again
const HOARD_X = 0.25, BT = { chance: 0.2, to: 0.55, hold: 0.3, cd: 8 };
// Bullet time in co-op: time can't slow for you without slowing it for everyone, so the same kills give you a dead eye
// instead (P.eye), for BT_EYE.t seconds: every round goes exactly where you aim, even on the run, and every bullet or
// pellet that hits a zombie counts as a headshot (weapons/firing.js). Its glow fades over the last BT_EYE.fade seconds
const BT_EYE = { t: 3, fade: 0.6 };
export const eyeK = () => clamp((P.eye || 0) / BT_EYE.fade, 0, 1);
// Momentum keeps building while each kill comes within MOM_T seconds of the last
const MOM_T = 2.5;
// how loud a kill is, from the zombie (killEnd: SFX.kill)
const KILL_VOL = 0.5;
// (a kill that's not part of a hit, a burn or a bleed running out, is sent on its own in co-op)
export function killZombie(z, dx, dz, wId, part, overkill) { return netAct(z, dx, dz, () => killZombie0(z, dx, dz, wId, part, overkill)); }
export function killZombie0(z, dx, dz, wId, part, overkill) {
  z.knock = null;   // (killed lying down or getting up: it goes down from the pose it's in)
  if (z.dead) return;
  netRec('k', wId, part);
  const D0 = W(wId) || EFF[wId] || {};
  // what it'll sound like going down (killEnd), mine or a teammate's
  z.killKind = wId === 'fire' ? 'burn' : wId === 'bleed' ? 'bleed' : wId === 'boom' ? 'blast' : part === 'head' ? 'head' : D0.melee ? 'melee' : 'body';
  killBegin(z, dx, dz, NREP ? 0 : killShake(D0, wId, part, overkill));
  if (NREP) { teamAssist(z); if (z.elite) { eliteShare(z); eliteDown(z); } return; }   // (an elite's card and your share of it on every screen)   // a teammate's kill: what it took off and how it fell come next in their message (net/sync.js); yours an assist if you'd hurt it (net/teamwork.js)
  run.kills++; popEl('kills'); runKill(z, wId, part);
  killFeel(z, D0, wId, part);
  const D = W(wId) || EFF[wId] || {};
  // feeding (Iron stomach and on): only some kills, and only up to the wave's cap (FEED in upgrades/tier-table.js)
  if (S.healOnKill) { const f = FEED[S.healOnKill]; if ((S.feedUsed || 0) < f.cap && rand() < (part === 'head' ? f.ph : f.p) && P.hp < hpCap()) { const h = Math.min(f.h * healMul(), f.cap - (S.feedUsed || 0), hpCap() - P.hp); P.hp += h; S.feedUsed = (S.feedUsed || 0) + h; floatText(P.x, P.z, '+' + Math.round(h) + ' health', '#ef6a52', 'med'); } }
  if (S.adrenaline && !(P.adrCd > 0)) { P.adr = 1.2; P.adrCd = 4; }
  if (S.momentum) { S.momK = run.time - S.momT < MOM_T ? Math.min(5, S.momK + 1) : 1; S.momT = run.time; }   // a short burst, and not again for a few seconds
  // Bullet time: now and then a kill slows the world (you too) to BT.to for a moment, and not again for BT.cd seconds;
  // in co-op it gives you a dead eye instead (BT_EYE)
  if (S.bulletTime && (netLink() || timeScale > 0.8) && !(run.time < (S.btNext || 0)) && rand() < BT.chance) {
    S.btNext = run.time + BT.cd;
    if (netLink()) { P.eye = BT_EYE.t; SFX.upgrade(); } else { setSlowTo(BT.to); setSlowIn(0.15); setSlowHold(BT.hold); }
  }
  const shells = D.ammo === 'shells' && !D.dart, heavy = (D.dmg || 0) >= 80 || wId === 'boom';
  // the sledgehammer crushes the head of whatever it kills, wherever the blow landed: it comes down from overhead
  // (and the fire axe often splits it: either leaves no head for the rest of this to take)
  const crushed = wId === 'sledge' && crushHead(z, dx, dz);
  // (the fire axe straight down through it or clean across it; a katana's or machete's edge often on a slant)
  const split = !crushed && part === 'head' && z.limbs.head && (wId === 'axe' ? rand() < 0.85 && splitHead(z, dx, dz, rand() < 0.5 ? 'v' : 'h') : (wId === 'katana' || wId === 'machete') && rand() < SLANT_SPLIT && splitHead(z, dx, dz, rand() < 0.5 ? 'd' : 'e'));
  if (part === 'head' && z.limbs.head) {
    // a blade or a blast takes the head off; a bullet mostly goes in one side and out the other and leaves it on
    // (zombies/wounds.js), though buckshot from close up or a big round can still take it
    const bullet = !D.melee && wId !== 'boom' && wId !== 'fire' && wId !== 'bleed', close = Math.hypot(z.x - P.x, z.z - P.z) < 3;
    // (a shotgun's load always blows it to mist up close, and further off when enough of it went into the head: PEL_MIST)
    const pel = D.ammo === 'shells' && !D.dragon && !D.melee, pelHead = pel && z.pelT === run.time && z.pel && (z.pel.head || 0) >= PEL_MIST.head;
    const c = !canSever(wId) ? 0 : pel && (close || pelHead) ? 1 : shells ? 0.1 : D.melee ? 0.4 + (D.sever || 0) * 0.4 : bullet ? (heavy ? 0.1 : 0) : 0.8;
    // (a shotgun that takes it doesn't take it off whole: it blasts it to a red mist and gore, as the sledge's crush does)
    if (rand() < (c >= 1 ? 1 : Math.min(1, c * S.severMul))) { if (shells || pel) crushHead(z, dx, dz); else { sever(z, 'head', dx, dz); run.heads++; } }
    else if (bullet) headShot(z, dx, dz);
  }
  const extra = !canSever(wId) ? 0 : wId === 'boom' ? 3 : shells ? (rand() < 0.65 ? 1 + (rand() < 0.4 ? 1 : 0) : 0) : heavy && rand() < 0.35 ? 1 : 0;
  for (let k = 0; k < extra; k++) {
    const opts = ['armL', 'armR', 'legL', 'legR', 'head'].filter(p => z.limbs[p] && (p !== 'head' || wId === 'boom' || rand() < 0.3)); if (!opts.length) continue;
    const p = pick(opts); if (p === 'head' && shells) { crushHead(z, dx, dz); continue; }   // (blasted to mist, as above)
    if (p === 'head' || wId === 'boom' || (z.cut && z.cut[p]) || rand() < 0.4 || !severLower(z, p, dx, dz)) sever(z, p, dx, dz);   // a blast takes limbs whole; a shotgun often just the end of one
  }
  // (and thrown further the harder it was put down: RAG_OVER, the damage past what killed it, so a big round through a
  // walker flings it where a light one drops it)
  const force = (wId === 'boom' ? 9 : shells ? 5.5 : D.melee ? 3.5 + (D.kb || 0) * 0.4 : 2.2 + (D.kick || 1) * 0.6) * (1 + RAG_OVER.k * clamp((overkill || 0) / RAG_OVER.per, 0, 1));
  if (z.gib && wId === 'boom') blowApart(z, dx, dz);
  else { makeRagdoll(z, dx, dz, crushed || split ? 'crush' : part, force, wId); netRec('r', crushed || split ? 'crush' : part, Math.round(force * 100) / 100, crushed || split ? 1 : 0); if (crushed || split) ragdolls[ragdolls.length - 1].neck = NECK_PUMP; }
  killEnd(z);
  // a brute's drops are doubled: twice the scrap, and an ammo box, planks or bandages that hold twice as much
  const big = z.type === 'brute' ? 2 : 1;
  // scrap goes straight into yours, with the same odds and amounts it used to drop with (a brute always, others half
  // the time); Hoarder: a HOARD_X chance it's worth double
  if (rand() < (z.type === 'brute' ? 1 : 0.5)) { const hoard = S.hoard && rand() < HOARD_X; killScrap(z, ((z.type === 'brute' ? 3 : 1) + (rand() < 0.4 ? 1 : 0)) * big * (hoard ? 2 : 1), hoard); }
  if (rand() < (z.type === 'brute' ? 0.9 : 0.26) * S.dropMul) {
    // ammo is scarce: about half the ammo rolls come up empty, fewer of them for a kill made with a melee weapon (saving
    // rounds pays you back a little). Planks are the rarest roll, and the last 6.5% of the roll drops nothing, so a
    // plank comes off about one walker in 26 and bandages about one in 21; metal, once there's a metalwork bench
    // (barricades/metal-bars.js), a little less often than planks did (below METAL_DROP of the roll: one in 32)
    const r = rand(), opts = ammoTypes(), curA = gunAmmo(), mel = D.melee ? 0.15 : 0;
    if (r < 0.6) { if (opts.length && rand() < (z.type === 'brute' ? 0.7 : 0.5) + mel) ammoDrop(z.x, z.z, big); }
    else if (r < 0.75) { if (!METAL.on || r < METAL_DROP) dropPickup(z.x, z.z, 'planks', big); }
    else if (r < 0.935) dropPickup(z.x, z.z, 'med', big);
  }
  // an elite pays out (zombies/elites.js): its scrap, an ammo box for sure, and maybe something more
  if (z.elite) {
    const K = ELITE_KIND[z.elite.kind]; eliteShare(z); ammoDrop(z.x, z.z, 1);
    if (rand() < K.more) dropPickup(z.x + rr(-0.4, 0.4), z.z + rr(-0.4, 0.4), rand() < 0.6 ? 'med' : 'planks', 1);
    hitStop(ELITE_DOWN.stop); setCamPunch(Math.max(camPunch, ELITE_DOWN.punch));   // (a beat on it, and its card: zombies/elites.js)
    runStat('elites'); eliteDown(z);
  }
}
// an ammo box for your guns: most often for the one in your hands
export function ammoDrop(x, z, amount) { const opts = ammoTypes(), curA = gunAmmo(); if (opts.length) dropPickup(x, z, 'ammo', amount, curA && rand() < 0.6 ? curA : pick(opts)); }
// a kill's scrap, into yours there and then (only ever the killer's: a teammate's kill is played back without it,
// net/sync.js), shown rising off the body (the whole amount, marked (x2) and a brighter gold when Hoarder doubled it)
// and rolled into the counter
function killScrap(z, n, hoard, quiet) {
  n = waveScrap(n);   // (more each wave: game/run-state.js)
  if (S.scrapCut || S.scrapX) n = Math.max(1, Math.round(n * (1 - (S.scrapCut || 0)) * (S.scrapX || 1)));   // (Empty pockets halves it, Bad blood doubles it: upgrades/sacrifice.js)
  S.scrap += n; feed('scrap', n, 'scrap'); popEl('scrap'); SFX.scrap();
  if (!quiet) floatText(z.x, z.z, '+' + n + ' scrap' + (hoard ? ' (x2)' : ''), hoard ? '#ffd76a' : '#d4b25c', 'scrap');
}
// an elite's scrap, to everyone who hurt it, by how much of it they did (z.myDmg against its health): half of it or more
// and it's the whole of it (ELITE_SHARE), less and that much of it as a share of the half (a quarter of the damage, half
// the scrap), in whole scrap, nothing if it rounds to none. It goes in the pickups on the left, not over the body
const ELITE_SHARE = 0.5;
function eliteShare(z) {
  const K = ELITE_KIND[z.elite.kind], f = clamp((z.myDmg || 0) / (z.maxHp || 1), 0, 1);
  const n = f >= ELITE_SHARE ? K.scrap : Math.round(K.scrap * f / ELITE_SHARE);
  if (n > 0) killScrap(z, n, false, true);
}
// the start and the end of a kill, whoever made it: it's marked dead and its outlines go, blood flies off it onto those
// round it; then, after it's fallen (or come apart), it's off the list
const PEL_MIST = { n: 3, dart: 0.75, head: 2 };
const RAG_OVER = { k: 0.7, per: 90 }, ELITE_DOWN = { stop: 0.09, punch: 0.06 };
// (and a kill flashes it brighter than a hit does: KILL_FLASH, carried on by its ragdoll)
const KILL_FLASH = 0.24;
function killBegin(z, dx, dz, k) {
  spitterDies(z);   // (a spitter's sac bursts: zombies/spitter.js)
  eliteDies(z);   // (a volatile one bursts: zombies/elites.js)
  z.flash = Math.max(z.flash || 0, KILL_FLASH);
  z.dead = true; if (z.dn) z.dn.el.classList.add('kill'); if (z.redOl) z.redOl.visible = false; if (z.lightOl) z.lightOl.visible = false; if (z.om) z.om.visible = false; if (z.reachOl) z.reachOl.visible = false; if (z.burnOl) z.burnOl.visible = false; if (z.xr) { z.xr.rim.visible = false; z.xr.fill.visible = false; if (z.xr.sil) z.xr.sil.visible = false; }
  for (const o of zombies) if (o !== z && Math.hypot(o.x - z.x, o.z - z.z) < 1.5) bloodZombie(o, 0.06);   // the spray off a kill
  burst(z.x, 0.9 * z.T.scale, z.z, 16, 'blood', dx, dz, 4); bloodSpurt(z.x, 0.95 * z.T.scale, z.z, dx, dz, 14, 1.25);
  spray(z.x, z.z, dx, dz, rr(0.6, 0.9) * z.T.scale);   // what the shot throws out
  wallSpray(z.x, 0.95 * z.T.scale, z.z, dx, dz, 1.25);   // and up the wall behind it (effects/wall-blood.js)
  setShake(Math.max(shake, NREP ? 0.16 * clamp(1 - Math.hypot(z.x - P.x, z.z - P.z) / 14, 0, 1) : k));
}
// a kill of yours shakes the view by how hard it landed (KILL_SHAKE): a light round's a nudge, a heavy round, a shotgun
// at close range, a heavy blade or club much more, through the head a little more again, and a big overkill more still;
// a burn or a bleed running out barely at all
const KILL_SHAKE = { base: 0.08, dmg: 0.1, head: 0.04, over: 0.05, heavy: 0.08, dot: 0.04, max: 0.34 };
function killShake(D, wId, part, overkill) {
  if (wId === 'fire' || wId === 'bleed') return KILL_SHAKE.dot;
  const dmg = D.dmg || 30, heavy = dmg >= 80 || wId === 'boom' || (D.ammo === 'shells' && !D.dart) || (D.melee && (D.kb || 0) >= 3);
  return Math.min(KILL_SHAKE.max, KILL_SHAKE.base + KILL_SHAKE.dmg * clamp(dmg / 100, 0, 1) + (part === 'head' ? KILL_SHAKE.head : 0) + KILL_SHAKE.over * clamp((overkill || 0) / 60, 0, 1) + (heavy ? KILL_SHAKE.heavy : 0));
}
// and how it feels in the hands: the red mark on your crosshair and its tick (climbing through a chain of kills: ui/run-stats.js),
// and, playing alone, a hit-stop (game/hit-feedback.js) when it lands hard: through the head with anything but a fast
// automatic, a heavy round, a shotgun, a heavy blow (HIT_STOP: how long, in seconds of real time; never closer together
// than HIT_STOP.gap, so a run of kills doesn't stutter)
const CHAIN_SCRAP = 1;
const HIT_STOP = { head: 0.045, heavy: 0.065, melee: 0.055, gap: 0.3, fast: 0.12 };   // (fast: a gun firing quicker than this, s a shot, gets none for a headshot)
let hsLast = 0;
function killFeel(z, D, wId, part) {
  if (wId === 'fire' || wId === 'bleed') return;
  hitMark('kill', part === 'head');
  const chain = (run.st && run.st.chain) || 1;
  SFX.killTick(part === 'head', chain);
  // a chain of kills called out (ui/hud-text.js), each past the third worth CHAIN_SCRAP scrap more
  const paid = chain >= 3 ? CHAIN_SCRAP : 0; if (paid) { S.scrap += paid; popEl('scrap'); }
  streakShow(chain, paid);
  if (netLink() || timeScale < 0.8) return;
  const heavy = (D.dmg || 0) >= 80 || wId === 'boom' || (D.ammo === 'shells' && !D.dart);
  const t = heavy ? HIT_STOP.heavy : D.melee && ((D.kb || 0) >= 3 || part === 'head') ? HIT_STOP.melee : part === 'head' && (D.rate || 1) >= HIT_STOP.fast ? HIT_STOP.head : 0;
  const now = performance.now(); if (!t || now - hsLast < HIT_STOP.gap * 1000) return;
  hsLast = now; hitStop(t);
}
export function killEnd(z) {
  const i = zombies.indexOf(z); if (i >= 0) zombies.splice(i, 1);
  if (z.id) NZ.delete(z.id);
  soundAt(z.x, z.z, () => SFX.kill(z.killKind || 'body', KILL_VOL, z.voice || 1));   // by what made it, from the zombie itself (audio/sfx.js: kill)
}
// a damage number pops off the zombie (bursting off it on an arc: ui/hud-text.js, stepFloats), bigger the harder the
// hit (dmgSize: a 10 a touch smaller than plain, a 100 a quarter bigger, never past DMG_SIZE[1]); hits landing close
// together (shotgun pellets, bursts) add up into one number
const DMG_SIZE = [0.85, 1.5];
const dmgSize = d => clamp(0.7 + 0.28 * Math.log10(Math.max(1, d)), DMG_SIZE[0], DMG_SIZE[1]).toFixed(2);
function dmgNumber(z, dmg, head, y, crit, kind) {
  const now = performance.now();
  if (z.dn && now - z.dn.t0 < 160 && floats.includes(z.dn.f)) {
    z.dn.amt += dmg; z.dn.t0 = now; z.dn.num.textContent = Math.round(z.dn.amt); z.dn.f.t = Math.min(z.dn.f.t, 0.08); z.dn.el.style.setProperty('--s', dmgSize(z.dn.amt));
    if (head) z.dn.el.classList.add('head');
    if (crit) z.dn.el.classList.add('crit');
    if (kind === 'armor') z.dn.el.classList.add('armor');
    // the pop scales the inner number only: scaling the positioned element would scale its screen position too
    replay(z.dn.num, 'bump');
    return;
  }
  const el = document.createElement('div'), num = document.createElement('span'); el.className = 'float dmg' + (head ? ' head' : '') + (crit ? ' crit' : '') + (kind ? ' ' + kind : ''); num.textContent = Math.round(dmg); el.appendChild(num);
  el.style.setProperty('--s', dmgSize(dmg));
  document.body.appendChild(el);
  const f = { el, x: z.x + rr(-0.25, 0.25), z: z.z + rr(-0.25, 0.25), y0: y + 0.25, t: 0, dmg: true };
  floats.push(f); z.dn = { el, num, f, amt: dmg, t0: now };
}

// setters for the variables above that other files change (an imported variable can only be read)
export function setCritNext(v) { return (critNext = v); }
export function setHeadNext(v) { return (headNext = v); }
