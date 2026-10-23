// What a zombie looks like: a body a little more like a person's than a stack of boxes (a chest over a narrower waist,
// a neck, a face dealt like the survivor's and set unevenly, plain block hands, feet in whatever shoes they died
// in), dressed for the job it had before (ZJOBS: a cop, a SWAT officer, a track runner, a nurse, a farmer, a chef, a
// firefighter...), the way Project Zomboid dresses its dead, and everything it wears gone ragged: rips through to the
// grey skin, hems and cuffs torn into strips, a sleeve torn off, a trouser leg ripped away, dirt and old blood.
//
// Each part (the head, the chest, each upper arm and forearm, each thigh and shin) is built up box by box in its own
// frame (zb) and baked into one mesh with its colours in its vertices (zBake), so however much it wears, a zombie still
// draws as the same ten pieces it always did. All of a zombie's pieces share one material of its own (white, coloured
// by its vertices), which its fade, its hit flash and its burning all work through. The dice are the zombie's own seed
// (rand), so in co-op every screen dresses it the same.

import { pick, rand, rr } from '../core/math.js';
import { lam } from '../core/shaders.js';
import { GLOVE_COLS } from '../player/look.js';
import { run } from '../game/run-state.js';
import {
  worn, zb, zback, zBake, zbandChest, zbandWaist, ZBLOOD, ZBONE, zc, ZDYE, ZF, ZFLASH, zfront, zKit, ZMEAT, zmix, ZROT,
  zside, ZSKIN_LIVE, ztall
} from './zombie-kit.js';
import { ZJOBS } from './zombie-jobs.js';
import { ZGRIME, zGrime, zRot, zTatter } from './zombie-wear.js';
import { ARMOR, ARMOR_FROM } from './damage.js';
import { state } from '../game/state.js';

// ---- dealing an outfit ----
const ZTYPE_I = { walker: 0, runner: 1, brute: 2 };
// (the armoured ones, ARMOR in zombies/damage.js, only from wave ARMOR_FROM, and a few more of them each wave after)
function zPickJob(type) {
  const i = ZTYPE_I[type] || 0, wv = (typeof run !== 'undefined' && run.wave) || 0, armed = state === 'play' && wv >= ARMOR_FROM;
  const w = k => ARMOR[k] ? (armed ? ZJOBS[k].w[i] * (1 + 0.12 * (wv - ARMOR_FROM)) : 0) : ZJOBS[k].w[i];
  let tot = 0; for (const k in ZJOBS) tot += w(k);
  let r = rand() * tot; for (const k in ZJOBS) { r -= w(k); if (r <= 0) return k; }
  return 'casual';
}
// a teammate who went down, back the next wave (net/sync.js: TURN_Q): dressed as they were from their own look (L)
// and gear: their skin gone grey, their hair and hat, their top (a flannel's checks, a tee's print), trousers, shoes and
// gloves, and the armour they'd bought (a canvas jacket, a vest, a plate carrier) and their boots; never their guns or
// their pack
const ZTURN_HAIR = { bald: 'bald', long: 'long', buzz: 'patchy', short: 'short' }, ZTURN_HAT = { cap: 'trucker', beanie: 'beanie', cowboy: 'straw', bandana: 'bandana' };
const ZTURN_ARMOR = { jacket: 0x6a5e44, vest: 0x3c4330, plate: 0x2e3033, strap: 0x1e1f21 };
function zTurned(o, L, gear) {
  const t = (gear && gear.t) || {}, s = (gear && gear.s) || {};
  o.skin = zc(zmix(L.skin, o.rotCol, rr(0.42, 0.58)), rr(0.84, 0.92));
  o.hair = ZTURN_HAIR[L.hairStyle] || 'short'; o.hairCol = L.hair; o.beard = !!L.beard && L.beard !== 'none';
  o.hat = t.night || s.stubborn ? 'helmet' : ZTURN_HAT[L.hat] || 'none'; o.hatCol = t.night || s.stubborn ? 0x3c4330 : L.hatCol || 0x2a2a2a;
  o.top = worn(L.topCol, 0.15); o.sleeve = L.top === 'tee' || L.top === 'polo' ? 'short' : 'long';
  if (L.top === 'flannel') o.plaid = zc(L.topCol, 0.6);
  if (L.top === 'tee' && L.print) { const pc = L.print; o.add.push(K => zfront(K.torso, 0.16, 0.11, worn(pc, 0.2), 0, 0.14, ZF.chest)); }
  o.legs = 'long'; o.pants = worn(L.pants, 0.18);
  o.shoes = t.boots || s.slowRes > 0 || /boot/.test(L.shoes || '') ? 'boots' : L.shoes === 'dress' ? 'dress' : 'sneakers';
  if (o.shoes === 'boots') o.boot = t.boots || s.slowRes > 0 ? 0x2a2420 : L.shoes === 'tanboots' ? worn(0x8a6a3a, 0.2) : L.shoes === 'blackboots' ? 0x141414 : undefined;
  if (o.shoes === 'sneakers' && L.sneak) o.sneak = L.sneak.map(c => worn(c, 0.25));
  if (L.glove && GLOVE_COLS[L.glove]) o.gloves = worn(GLOVE_COLS[L.glove].back, 0.15);
  const ar = t.armor | 0;
  if (ar >= 1) o.coat = worn(ZTURN_ARMOR.jacket, 0.12);   // the canvas jacket
  if (ar >= 2) o.add.push(K => {   // the vest over it, then the plate carrier's plates and straps
    const c = ar >= 3 ? ZTURN_ARMOR.plate : ZTURN_ARMOR.vest;
    zfront(K.torso, 0.42, 0.42, c, 0, 0.02, ZF.chest, 0.014); zback(K.torso, 0.42, 0.42, c, 0, 0.02, ZF.chest, 0.014);
    if (ar >= 3) { zfront(K.torso, 0.3, 0.26, zc(c, 1.25), 0, 0.08, ZF.chest, 0.024); [-1, 1].forEach(sd => zb(K.torso, 0.06, 0.04, 0.32, ZTURN_ARMOR.strap, sd * 0.15, 0.3, 0)); }
    [-1, 1].forEach(sd => zfront(K.torso, 0.08, 0.07, zc(c, 0.85), sd * 0.12, -0.12, ZF.waist, 0.03));   // its pouches
  });
}
function zDeal(type, job) {
  const live = pick(ZSKIN_LIVE), dead = pick(ZROT), turned = job && typeof job === 'object' ? job : null;
  if (turned) job = 'casual';
  const o = { job: job || zPickJob(type), add: [], skin: zc(zmix(live, dead, rr(0.5, 0.74)), rr(0.8, 0.92)), rotCol: dead, hair: pick(['short', 'short', 'long', 'bald', 'balding', 'patchy', 'short']), hairCol: pick([0x2a2018, 0x3a2a1e, 0x5a4630, 0x8a8478, 0x1a1a1a, 0x6a3a1e, 0xa8a49c]),
    hat: 'none', hatCol: 0x2a2a2a, sleeve: 'short', legs: 'long', shoes: 'sneakers', gloves: 0, beard: rand() < 0.2, wear: rr(0.6, 1.3) };
  if (turned) zTurned(o, turned.look, turned.gear); else ZJOBS[o.job].f(o);
  o.face = zDealFace(o);
  o.skinDk = zc(o.skin, 0.8); o.bruise = zmix(o.skin, 0x4a3a5a, 0.45);
  return o;
}

// ---- building it ----
// the parts' kits by name; L is the -x side
const ZPARTS = ['torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR'];
function zBuild(o, brute) {
  const K = {}; ZPARTS.forEach(p => { K[p] = zKit(); });
  const sk = o.skin, top = o.top, cover = o.coat || top;
  // the trunk: a chest over a narrower waist, the shoulders rounded off; a big one gets a belly on him
  zb(K.torso, 0.5, 0.32, 0.3, cover, 0, 0.14, 0); zb(K.torso, 0.42, 0.28, 0.26, o.coat ? cover : top, 0, -0.16, 0);
  [-1, 1].forEach(s => zb(K.torso, 0.15, 0.05, 0.26, zc(cover, 0.95), s * 0.12, 0.3, 0, 0, 0, -s * 0.32));
  if (brute || rand() < 0.15) zb(K.torso, 0.36, 0.2, 0.06, o.coat ? cover : top, 0, -0.14, 0.14);
  if (o.coat && o.coat !== top) ztall(K.torso, 'f', 0.12, -0.28, 0.28, top, 0, 0.002);
  // the arms: the sleeves as far as they go, then skin; the hands, plain blocks with no fingers
  ['L', 'R'].forEach(S => {
    const s = S === 'L' ? -1 : 1, up = K['arm' + S], fo = K['fore' + S], sl = o.sleeveCol || cover, hand = o.gloves || sk;
    const upCol = o.sleeve === 'none' ? sk : o.sleeve === 'short' ? sk : sl, foCol = o.sleeve === 'long' ? sl : sk;
    zb(up, 0.14, 0.14, 0.29, upCol, 0, 0, 0.125); zb(fo, 0.13, 0.13, 0.29, foCol, 0, 0, 0.135);
    if (o.sleeve === 'short') zb(up, 0.152, 0.152, 0.17, sl, 0, 0, 0.065);
    if (o.sleeve === 'rolled') zb(fo, 0.146, 0.146, 0.05, zc(sl, 0.9), 0, 0, 0.0);
    if (o.sleeve === 'long') zb(fo, 0.138, 0.138, 0.03, zc(sl, 0.85), 0, 0, 0.27);   // the cuff
    zb(fo, 0.11, 0.07, 0.13, hand, 0, -0.005, 0.345);   // the hand
  });
  // the legs: trousers, shorts or bare skin, and what's on the feet
  ['L', 'R'].forEach(S => {
    const s = S === 'L' ? -1 : 1, th = K['leg' + S], sh = K['shin' + S], pc = o.pants;
    const thCol = o.legs === 'long' ? pc : sk, shCol = o.legs === 'long' ? pc : sk;
    zb(th, 0.19, 0.29, 0.22, thCol, 0, -0.145, 0); zb(sh, 0.184, 0.28, 0.214, shCol, 0, -0.14, 0);
    if (o.legs === 'shorts') zb(th, 0.2, 0.17, 0.23, pc, 0, -0.085, 0);
    if (o.gown) zb(th, 0.204, 0.2, 0.234, o.gown, 0, -0.1, 0);   // a gown or a dress down over the thighs
    if (o.coat && o.coat !== o.pants) zb(th, 0.204, 0.22, 0.234, o.coat, 0, -0.11, 0);   // a long coat's skirts
    zShoe(sh, o, s);
  });
  // the head
  zHead(K.head, o);
  // camo blotches and plaid checks over whatever's made of it
  if (o.camo) ZPARTS.forEach(p => { if (p === 'head') return; const n = p === 'torso' ? 14 : 4; for (let i = 0; i < n; i++) zSpot(K[p], p, o.camo[1 + (i % (o.camo.length - 1))], rr(0.04, 0.09), 0.004); });
  if (o.plaid) zPlaid(K, o);
  o.add.forEach(f => f(K));
  zTatter(K, o);
  zRot(K, o);
  return K;
}
// shoes: boots with their shafts, sneakers with a stripe and a sole, dress shoes, slip-ons, socks or bare feet
function zShoe(sh, o, s) {
  const y = -0.2375, foot = (c, h) => zb(sh, 0.198, h || 0.085, 0.29, c, 0, -0.28 + (h || 0.085) / 2, 0.035);
  if (o.socks && o.shoes !== 'bare') zb(sh, 0.19, 0.05, 0.22, o.socks, 0, -0.18, 0);
  if (o.shoes === 'boots') { const b = o.boot || worn(pick([0x3a2a1e, 0x2a2420, 0x6a4a2a])); zb(sh, 0.196, 0.13, 0.226, b, 0, -0.19, 0); foot(b, 0.09); zb(sh, 0.204, 0.02, 0.296, 0x161412, 0, -0.272, 0.035); for (let i = 0; i < 3; i++) zb(sh, 0.06, 0.008, 0.012, 0x161412, 0, -0.16 - i * 0.025, 0.114); }
  else if (o.shoes === 'sneakers') { const sn = o.sneak || [worn(pick([0xe8e6e0, 0x8a8a8e, 0x2a2a2c, pick(ZDYE)]), 0.25), 0xe0dcd2, worn(pick(ZFLASH))]; foot(sn[0], 0.075); zb(sh, 0.204, 0.025, 0.296, worn(sn[1], 0.3), 0, -0.268, 0.035); zb(sh, 0.006, 0.03, 0.12, sn[2], s * 0.102, -0.245, 0.04); }
  else if (o.shoes === 'dress') { const c = pick([0x141416, 0x3e1a16, 0x4e2e1a]); foot(c, 0.065); zb(sh, 0.2, 0.012, 0.294, 0x0e0c0a, 0, -0.274, 0.035); }
  else if (o.shoes === 'slip') foot(o.slip || worn(0x2a2a2c), 0.05);
  else if (o.shoes === 'socks') foot(o.socks || 0xd8d4c8, 0.06);
  else { foot(o.skin, 0.06); for (let i = 0; i < 4; i++) zb(sh, 0.035, 0.035, 0.03, o.skinDk, -0.06 + i * 0.04, -0.262, 0.185); }   // bare feet, toes and all
}
// the face, dealt the way the survivor's is (player/look.js): eyes, brows, nose and mouth each one of a few shapes, set
// a little unevenly so no two halves match; then what dying did to it. ZFACE weights each by how often it turns up
const ZFACE = {
  eye: ['milky', 'milky', 'milky', 'half', 'half', 'wide', 'squint', 'bloodshot'],
  brow: ['flat', 'flat', 'furrow', 'furrow', 'heavy', 'thin', 'sparse', 'raised'],
  nose: ['straight', 'straight', 'straight', 'wide', 'wide', 'long', 'crooked', 'crooked', 'broken', 'button', 'button', 'gone'],
  mouth: ['slack', 'slack', 'slack', 'grim', 'grim', 'snarl', 'snarl', 'gaping']
};
// how far the jaw hangs (the gap between the lips) and how wide the mouth is, for each mouth
const ZMOUTH = { slack: [0.018, 0.028, 0.07, 0.09], gaping: [0.034, 0.044, 0.09, 0.11], snarl: [0.012, 0.02, 0.06, 0.08], grim: [0, 0, 0.06, 0.075] };
export const ZTEETH = [0xbcb08a, 0xa89a72, 0xc8bc98, 0x8a7a58, 0xb0a07a];
function zDealFace(o) {
  const eye = pick(ZFACE.eye), M = pick(ZFACE.mouth), m = ZMOUTH[M];
  return { hw: rr(0.265, 0.29), jw: rr(0.2, 0.235), jx: rr(-0.01, 0.01), jr: rr(-0.07, 0.07), mouth: M, drop: rr(m[0], m[1]), mw: rr(m[2], m[3]),
    eyes: [eye, rand() < 0.25 ? pick(ZFACE.eye) : eye], gap: rr(0.056, 0.066), eyeY: rr(0.022, 0.04), lop: rr(-0.009, 0.009), ex: rr(-0.006, 0.006),
    brow: pick(ZFACE.brow), nose: pick(ZFACE.nose), side: rand() < 0.5 ? -1 : 1, torn: rand() < 0.2, drool: rand() < 0.6, neckBite: rand() < 0.25 };
}
// the head: a skull down to the upper lip, a jaw hung below it as far as the mouth is open with the cheeks carried down
// to it either side, the dark of the mouth and a few bad teeth showing between; the neck; brow ridges over the eye
// sockets, the eyes in them (and the glowing pupils, their own meshes at o.eyeAt: zombies/spawn.js), the brows, nose
// and ears; then the hair (and a front hairline, so the forehead isn't a bare box), the beard, glasses, mask and hat
function zHead(H, o) {
  const sk = o.skin, F = o.face, hx = F.hw / 2, f = 0.15, lip = -0.075, d = F.drop, jh = 0.09 - d, jy = lip - d - jh / 2;
  const fr = (w, h, c, x, y, lay, rz) => zb(H, w, h, 0.006, c, x, y, f + lay, 0, 0, rz || 0);   // a thin piece on the face
  const jf = (w, h, c, x, y, lay) => zb(H, w, h, 0.006, c, x, y, 0.145 + lay);                   // ... on the front of the jaw
  const hc = o.hairCol, dkLip = zmix(sk, 0x4a2e3a, 0.4), blood = zmix(sk, ZBLOOD, 0.78);
  zb(H, F.hw, 0.16 - lip, 0.3, sk, 0, (0.16 + lip) / 2, 0);                  // the skull, down to the upper lip
  zb(H, 0.125, 0.1, 0.12, zc(sk, 0.92), 0, -0.19, -0.015);                   // the neck
  if (o.noJaw) {   // a spitter's jaw is torn loose and hangs (zombies/spitter.js): under the upper teeth only a dark hole
    zb(H, F.jw * 0.78, 0.07, 0.17, 0x1e0c0a, F.jx, lip - 0.035, -0.005);      // down the throat
    [-1, 1].forEach(s => { zb(H, 0.03, 0.055, 0.14, ZMEAT, F.jx + s * (F.jw * 0.39 + 0.012), lip - 0.026, 0.01); zb(H, 0.016, 0.02, 0.02, ZBONE, F.jx + s * (F.jw * 0.39 + 0.012), lip - 0.012, -0.05); });   // torn cheeks, the hinge's bone
    const nt = Math.round(F.mw / 0.017);
    for (let i = 0; i < nt; i++) { if (rand() < 0.3) continue; const th = rr(0.012, 0.024); zb(H, rr(0.011, 0.015), th, 0.016, pick(ZTEETH), F.jx - F.mw / 2 + (i + 0.5) * F.mw / nt + rr(-0.002, 0.002), lip - th / 2, 0.137, 0, 0, rr(-0.2, 0.2)); }
  } else zb(H, F.jw, jh, 0.22, sk, F.jx, jy, 0.035, 0, 0, F.jr);             // the jaw
  if (d > 0 && !o.noJaw) {   // the mouth hanging open: the cheeks down to the jaw either side, the dark inside, the teeth
    const cw = (F.jw - F.mw) / 2;
    [-1, 1].forEach(s => zb(H, cw, d + 0.01, 0.2, sk, F.jx + s * (F.mw / 2 + cw / 2), lip - d / 2, 0.045));
    zb(H, F.mw, d + 0.012, 0.03, 0x2a1210, F.jx, lip - d / 2, 0.115);
    const nt = Math.round(F.mw / 0.017);
    for (let i = 0; i < nt; i++) { if (rand() < 0.28) continue; const th = rr(0.01, Math.min(0.02, d * 0.8)); zb(H, rr(0.011, 0.015), th, 0.016, pick(ZTEETH), F.jx - F.mw / 2 + (i + 0.5) * F.mw / nt + rr(-0.002, 0.002), lip - th / 2, 0.137, 0, 0, rr(-0.15, 0.15)); }
    for (let i = 0; i < nt - 1; i++) { if (rand() < 0.45) continue; const th = rr(0.008, Math.min(0.014, d * 0.6)); zb(H, rr(0.01, 0.014), th, 0.014, pick(ZTEETH), F.jx - F.mw / 2 + (i + 1) * F.mw / nt, lip - d + th / 2, 0.133); }
    jf(F.mw * 0.9, 0.012, dkLip, F.jx, lip - d - 0.006, 0.004);              // the lower lip
  } else if (!o.noJaw) fr(F.mw, 0.008, 0x2a1810, F.jx, lip + 0.008, 0.004, F.jr);          // shut: just the line of it
  fr(F.mw + 0.012, 0.012, dkLip, F.jx, lip + 0.006, 0.003, F.jr * 0.5);      // the upper lip
  if (F.mouth === 'snarl') fr(0.03, 0.01, dkLip, F.jx + F.side * F.mw * 0.3, lip + 0.016, 0.005, F.side * 0.35);   // the lip curled up at one side
  // dead skin: one side of the face gone a shade greyer than the other, where the blood settled
  fr(rr(0.09, 0.12), rr(0.1, 0.15), zmix(sk, o.rotCol, 0.22), F.side * rr(0.05, 0.07), rr(-0.02, 0.04), 0.002);
  // the eyes: a shadowed socket, the eye in it (filmed over, bloodshot, staring, narrowed or the lid half down), and
  // its pupil, which is what glows; the brow over it, standing a little proud
  o.eyeAt = [];
  [-1, 1].forEach((s, i) => {
    const t = F.eyes[i], x = s * F.gap + F.ex, y = F.eyeY + (s === F.side ? F.lop : 0);
    fr(0.064, 0.044, zmix(zc(sk, 0.66), 0x3a2a3a, 0.2), x, y - 0.003, 0.004);
    const ew = t === 'wide' ? 0.05 : 0.045, eh = t === 'wide' ? 0.032 : t === 'squint' ? 0.013 : 0.026;
    fr(ew, eh, t === 'bloodshot' ? 0xa8786a : t === 'wide' ? 0xc0baa2 : 0xb2ae98, x, y, 0.008);
    if (t === 'half') fr(0.052, 0.017, zc(sk, 0.84), x, y + 0.006, 0.02);
    if (t === 'squint') { fr(0.052, 0.01, zc(sk, 0.84), x, y + 0.011, 0.02); fr(0.05, 0.008, zc(sk, 0.8), x, y - 0.011, 0.02); }
    const gw = t === 'wide' ? 0.022 : t === 'squint' ? 0.018 : 0.02, gh = t === 'wide' ? 0.02 : t === 'squint' ? 0.008 : t === 'half' ? 0.011 : 0.016;
    o.eyeAt.push([x + rr(-0.006, 0.006), t === 'half' ? y - 0.005 : y + rr(-0.002, 0.002), gw, gh, f + 0.015]);
    // the brow: flat, drawn down in a frown, heavy, thin, thinned out, or raised
    const B = F.brow, bc = o.hair === 'bald' && rand() < 0.5 ? zc(sk, 0.62) : hc;
    const bw = B === 'heavy' ? 0.072 : B === 'sparse' ? 0.04 : 0.062, bh = B === 'heavy' ? 0.022 : B === 'thin' || B === 'sparse' ? 0.01 : 0.015;
    const tilt = B === 'furrow' ? s * 0.24 : B === 'raised' ? -s * 0.16 : s * rr(-0.06, 0.06);
    zb(H, bw, bh, 0.016, bc, x + (B === 'sparse' ? -s * 0.012 : 0), y + 0.034 + (s === F.side ? rr(0, 0.006) : 0), f + 0.008, 0, 0, tilt);
  });
  // the nose, catching the light, with the nostrils under it; or crooked, broken, a button, or rotted to a hole
  const nc = zc(sk, 1.05), N = F.nose, nx = F.ex * 0.5;
  if (N === 'gone') { zb(H, 0.03, 0.026, 0.02, nc, nx, -0.008, f + 0.01); fr(0.034, 0.028, zmix(ZMEAT, 0x2a1210, 0.5), nx, -0.036, 0.004); fr(0.022, 0.02, 0x2a1210, nx, -0.037, 0.006); }   // the tip rotted away to the hole
  else {
    const [w, h, dz, y, rz] = N === 'wide' ? [0.05, 0.045, 0.03, -0.028, 0] : N === 'long' ? [0.03, 0.068, 0.03, -0.03, 0] : N === 'button' ? [0.03, 0.035, 0.024, -0.036, 0]
      : N === 'crooked' ? [0.034, 0.055, 0.03, -0.024, F.side * 0.16] : N === 'broken' ? [0.034, 0.03, 0.028, -0.008, -F.side * 0.3] : [0.034, 0.055, 0.03, -0.024, 0];
    zb(H, w, h, dz, nc, nx + (N === 'crooked' ? F.side * 0.006 : 0), y, f + dz / 2, 0, 0, rz);
    if (N === 'broken') zb(H, 0.036, 0.028, 0.032, nc, nx + F.side * 0.008, -0.04, f + 0.016, 0, 0, F.side * 0.2);
    [-1, 1].forEach(s => fr(0.009, 0.006, 0x2a1810, nx + s * 0.009 + (N === 'crooked' ? F.side * 0.008 : 0), -0.054, N === 'wide' ? 0.026 : 0.024));
  }
  // the ears (one sometimes torn away)
  [-1, 1].forEach(s => { if (rand() < 0.9) zb(H, 0.02, 0.058, 0.045, zc(sk, 0.9), s * (hx + 0.008), -0.005, -0.01); else zb(H, 0.006, 0.04, 0.04, ZMEAT, s * (hx + 0.002), -0.005, -0.01); });
  // what it last ate, down its chin; a cheek torn open to the teeth; the bite that turned it, in the side of the neck
  if (F.drool && !o.noJaw) {   // run out of one corner of the mouth and down the chin, now and then the other too
    const ds = rand() < 0.5 ? -1 : 1, l = rr(0.03, jh);
    jf(rr(0.012, 0.018), l, blood, F.jx + ds * F.mw * rr(0.15, 0.4), lip - d - l / 2, 0.006);
    if (rand() < 0.3) { const l2 = rr(0.02, jh * 0.6); jf(0.01, l2, blood, F.jx - ds * F.mw * rr(0.2, 0.4), lip - d - l2 / 2, 0.006); }
    jf(F.mw * rr(0.3, 0.5), 0.012, blood, F.jx + ds * F.mw * 0.2, lip - d - 0.01, 0.005);
  }
  if (F.torn && !o.noJaw) {   // the cheek torn open from the corner of the mouth back toward the ear, the teeth along it
    const s = F.side, w = rr(0.035, 0.05), x = F.jx + s * (F.mw / 2 + w / 2 - 0.004), y = lip - Math.max(d, 0.012) / 2 + 0.004, h = Math.max(d, 0.012) + 0.012;
    fr(w + 0.01, h + 0.01, zmix(sk, ZMEAT, 0.55), x, y, 0.004); fr(w, h, 0x2a1210, x, y, 0.006);
    for (let i = 0; i < 3; i++) fr(0.009, 0.01, pick(ZTEETH), x - s * w / 2 + s * (i + 0.5) * w / 3, y + h / 2 - 0.006, 0.008);
  }
  if (F.neckBite) { const s = -F.side; zb(H, 0.006, 0.06, 0.07, zc(sk, 0.55), s * 0.066, -0.19, 0.0); zb(H, 0.006, 0.045, 0.05, ZMEAT, s * 0.069, -0.19, 0.0); }
  if (o.beard) {   // stubble gone long: over the jaw, up the cheeks to the ears, and a moustache
    jf(F.jw + 0.004, jh * 0.85, hc, F.jx, jy - jh * 0.07, 0.002); [-1, 1].forEach(s => { zb(H, 0.01, jh, 0.16, hc, F.jx + s * (F.jw / 2 + 0.004), jy, 0.04); zb(H, 0.01, 0.1, 0.09, hc, s * (hx + 0.004), -0.03, 0.03); });
    fr(F.mw + 0.02, 0.016, hc, F.jx, lip + 0.016, 0.006);
  }
  if (o.glasses) o.eyeAt.forEach(([x, y]) => { const c = 0x18181a; fr(0.068, 0.006, c, x, y + 0.022, 0.026); fr(0.068, 0.006, c, x, y - 0.02, 0.026); [-1, 1].forEach(s => fr(0.006, 0.046, c, x + s * 0.034, y, 0.026)); });
  if (o.glasses) { fr(0.03, 0.006, 0x18181a, 0, o.eyeAt[0][1] + 0.016, 0.026); [-1, 1].forEach(s => zb(H, 0.006, 0.008, 0.17, 0x18181a, s * (hx + 0.004), F.eyeY + 0.02, 0.07)); }
  if (o.mask) { fr(0.2, 0.09, worn(o.mask, 0.1), 0, -0.1, 0.012); [-1, 1].forEach(s => zb(H, 0.006, 0.012, 0.16, 0xd8d8d8, s * (hx + 0.003), -0.02, 0.06)); }   // a surgical mask, pulled half down
  // the hair (under a hat only what shows below it)
  const hat = o.hat !== 'none' && o.hat !== 'headband' && o.hat !== 'bandana';
  if (o.hair !== 'bald') {
    if (!hat && o.hair !== 'balding') {
      zb(H, F.hw + 0.006, 0.026, 0.306, hc, 0, 0.172, 0);
      for (let i = 0; i < 3; i++) zb(H, rr(0.05, 0.1), rr(0.012, 0.024), rr(0.06, 0.12), hc, rr(-hx + 0.05, hx - 0.05), 0.186, rr(-0.1, 0.1), 0, rr(-0.5, 0.5), 0);   // uncombed
      if (o.hair === 'patchy') zb(H, 0.1, 0.006, 0.1, zmix(sk, ZMEAT, 0.4), rr(-0.06, 0.06), 0.188, rr(-0.06, 0.06));
      // the hairline over the forehead, ragged; long hair falls over it and down either side of the face
      fr(F.hw - 0.02, 0.02, hc, 0, 0.15, 0.003);
      for (let i = 0; i < 3; i++) fr(rr(0.03, 0.06), rr(0.008, 0.018), hc, rr(-hx + 0.04, hx - 0.04), 0.136, 0.003);
      if (o.hair === 'long') { for (let i = 0; i < 2; i++) { const h = rr(0.03, 0.06); fr(rr(0.04, 0.07), h, hc, rr(-0.06, 0.06), 0.14 - h / 2, 0.005, rr(-0.2, 0.2)); } [-1, 1].forEach(s => fr(0.035, rr(0.14, 0.2), hc, s * (hx - 0.02), 0.06, 0.006)); }
    }
    zb(H, F.hw + 0.006, 0.14, 0.03, hc, 0, 0.09, -0.158); [-1, 1].forEach(s => zb(H, 0.012, 0.09, 0.16, hc, s * (hx + 0.006), 0.11, -0.07));
    if (o.hair === 'long') { zb(H, F.hw + 0.01, 0.26, 0.04, hc, 0, -0.02, -0.168); [-1, 1].forEach(s => zb(H, 0.016, 0.22, 0.12, hc, s * (hx + 0.01), -0.02, -0.08)); }
    if (o.hair === 'pony') zb(H, 0.06, 0.18, 0.06, hc, 0, 0.0, -0.19, -0.3, 0, 0);
  }
  zHat(H, o);
}
function zHat(H, o) {
  const c = o.hatCol;
  switch (o.hat) {
    case 'police': zb(H, 0.3, 0.07, 0.32, 0x1e2434, 0, 0.19, 0); zb(H, 0.31, 0.02, 0.33, 0x141416, 0, 0.16, 0); zb(H, 0.24, 0.012, 0.09, 0x0e0e10, 0, 0.152, 0.19, 0.12, 0, 0); zfront(H, 0.04, 0.04, 0xc8a040, 0, 0.19, 0.16, 0.004); break;
    case 'swat': zb(H, 0.32, 0.12, 0.34, 0x1c1e22, 0, 0.17, -0.005); zb(H, 0.33, 0.06, 0.35, 0x1c1e22, 0, 0.1, -0.01); [-1, 1].forEach(s => zb(H, 0.03, 0.1, 0.1, 0x16181c, s * 0.165, 0.02, 0.0)); zb(H, 0.26, 0.05, 0.03, 0x2a3a4a, 0, 0.21, 0.16); break;   // helmet, ear covers, goggles pushed up
    // the SWAT helmet with its face shield down: a dark tinted visor over the whole face in a rubber frame, hinged at
    // the temples (the eyes glow through it: zombies/spawn.js)
    case 'riot': zb(H, 0.32, 0.12, 0.34, 0x1c1e22, 0, 0.17, -0.005); zb(H, 0.33, 0.06, 0.35, 0x1c1e22, 0, 0.1, -0.01); [-1, 1].forEach(s => zb(H, 0.03, 0.1, 0.1, 0x16181c, s * 0.165, 0.02, 0.0));
      zb(H, 0.3, 0.24, 0.012, 0x2e3e4c, 0, 0.0, 0.19); zb(H, 0.31, 0.025, 0.03, 0x111214, 0, 0.125, 0.18); zb(H, 0.31, 0.02, 0.025, 0x111214, 0, -0.12, 0.19); [-1, 1].forEach(s => { zb(H, 0.02, 0.24, 0.03, 0x111214, s * 0.155, 0.0, 0.18); zb(H, 0.04, 0.04, 0.04, 0x26292e, s * 0.16, 0.1, 0.12); });
      zb(H, 0.22, 0.03, 0.006, 0x56708a, 0, 0.07, 0.197); break;   // (a glint across it)
    case 'helmet': zb(H, 0.32, 0.12, 0.34, c, 0, 0.17, -0.005); zb(H, 0.34, 0.03, 0.36, zc(c, 0.85), 0, 0.12, 0); for (let i = 0; i < 4; i++) zb(H, 0.07, 0.04, 0.006, zc(c, 0.6), rr(-0.1, 0.1), rr(0.14, 0.2), 0.177); zb(H, 0.006, 0.08, 0.012, 0x2a2a20, 0.12, 0.05, 0.13); break;
    case 'hardhat': zb(H, 0.3, 0.11, 0.32, c, 0, 0.2, 0); zb(H, 0.36, 0.016, 0.38, c, 0, 0.155, 0.01); zb(H, 0.04, 0.05, 0.3, zc(c, 0.85), 0, 0.26, 0); zb(H, 0.2, 0.012, 0.06, c, 0, 0.16, 0.2); break;
    case 'fire': zb(H, 0.32, 0.12, 0.33, c, 0, 0.2, 0); zb(H, 0.38, 0.02, 0.36, c, 0, 0.15, -0.04); zb(H, 0.3, 0.02, 0.12, c, 0, 0.14, -0.22, -0.2, 0, 0); zb(H, 0.1, 0.12, 0.012, 0xc8a040, 0, 0.22, 0.17); break;   // the long tail at the back and the shield on the front
    case 'toque': zb(H, 0.29, 0.05, 0.31, 0xeceae4, 0, 0.18, 0); zb(H, 0.32, 0.18, 0.32, worn(0xeceae4, 0.15), 0, 0.3, 0); break;
    case 'straw': zb(H, 0.29, 0.1, 0.31, 0xc8a860, 0, 0.2, 0); zb(H, 0.5, 0.014, 0.5, 0xb89850, 0, 0.155, 0); zb(H, 0.295, 0.025, 0.315, 0x6a3a1e, 0, 0.17, 0); break;
    case 'trucker': zb(H, 0.3, 0.09, 0.32, c, 0, 0.19, 0); zb(H, 0.24, 0.014, 0.1, zc(c, 0.85), 0, 0.152, 0.2, 0.1, 0, 0); zb(H, 0.304, 0.06, 0.006, 0xe8e6e0, 0, 0.19, -0.162); break;
    case 'visor': zb(H, 0.29, 0.04, 0.31, c, 0, 0.12, 0); zb(H, 0.24, 0.012, 0.1, c, 0, 0.11, 0.2, 0.15, 0, 0); break;
    case 'beanie': zb(H, 0.3, 0.1, 0.32, c, 0, 0.18, 0); zb(H, 0.302, 0.03, 0.322, zc(c, 0.85), 0, 0.13, 0); break;
    case 'headband': zb(H, 0.292, 0.035, 0.312, c, 0, 0.11, 0); break;
    case 'bandana': zb(H, 0.29, 0.05, 0.31, c, 0, 0.16, 0); zb(H, 0.04, 0.07, 0.04, c, 0, 0.12, -0.175); for (let i = 0; i < 6; i++) zb(H, 0.012, 0.012, 0.006, 0xe8e6e0, rr(-0.11, 0.11), rr(0.15, 0.18), 0.158); break;
  }
}
// a spot on a part's surface (camo, grime): a thin patch on one of its faces, picked at random
export function zSpot(k, part, c, sz, lay) {
  const d = zDims(part), face = (rand() * 4) | 0, w = sz * rr(0.6, 1.4), h = sz * rr(0.6, 1.4);
  if (part === 'torso') { const chest = rand() < 0.55, y = chest ? rr(0.0, 0.28) : rr(-0.28, -0.04), f = chest ? ZF.chest : ZF.waist, sw = chest ? ZF.chestW : ZF.waistW;
    if (face === 0) zfront(k, w, h, c, rr(-sw + 0.04, sw - 0.04), y, f, lay); else if (face === 1) zback(k, w, h, c, rr(-sw + 0.04, sw - 0.04), y, f, lay); else zside(k, face === 2 ? -1 : 1, w, h, c, rr(-f + 0.04, f - 0.04), y, sw, lay); return; }
  const [hx, hy, hz, cy, cz] = d, along = part[0] === 'a' || part[0] === 'f';
  if (along) { const z = cz + rr(-hz, hz) * 0.8; if (face < 2) zb(k, w, 0.006, h, c, rr(-hx, hx) * 0.5, (face ? -1 : 1) * (hy + lay), z); else zb(k, 0.006, w, h, c, (face === 2 ? -1 : 1) * (hx + lay), rr(-hy, hy) * 0.5, z); }
  else { const y = cy + rr(-hy, hy) * 0.8; if (face < 2) zb(k, w, h, 0.006, c, rr(-hx, hx) * 0.5, y, (face ? -1 : 1) * (hz + lay)); else zb(k, 0.006, h, w, c, (face === 2 ? -1 : 1) * (hx + lay), y, rr(-hz, hz) * 0.5); }
}
// half sizes and middles of the limb boxes: [half x, half y, half z, middle y, middle z]
function zDims(part) {
  if (part[0] === 'a') return [0.07, 0.07, 0.145, 0, 0.125];
  if (part[0] === 'f') return [0.065, 0.065, 0.145, 0, 0.135];
  if (part[0] === 'l') return [0.095, 0.145, 0.11, -0.145, 0];
  return [0.092, 0.14, 0.107, -0.14, 0];
}
// a flannel's check: darker bands across and down the chest, round the arms
function zPlaid(K, o) {
  const c = o.plaid, c2 = zc(o.top, 1.25);
  [0.22, 0.08, -0.08, -0.22].forEach((y, i) => { const f = y > -0.02 ? 'chest' : 'waist'; (f === 'chest' ? zbandChest : zbandWaist)(K.torso, y, 0.03, i % 2 ? c : c2, 0.003); });
  [-0.15, -0.05, 0.05, 0.15].forEach((x, i) => { ztall(K.torso, 'f', 0.025, -0.28, 0.28, i % 2 ? c : c2, x, 0.006); ztall(K.torso, 'b', 0.025, -0.28, 0.28, c, x, 0.006); });
  ['armL', 'armR'].forEach(p => { if (o.sleeve !== 'none') [0.04, 0.14].forEach(z => zb(K[p], 0.146, 0.146, 0.025, c, 0, 0, z)); });
  if (o.sleeve === 'long') ['foreL', 'foreR'].forEach(p => [0.08, 0.18].forEach(z => zb(K[p], 0.136, 0.136, 0.025, c, 0, 0, z)));
}

// the same between parts, which are meshes of their own: the left and right legs meet as it walks, the forearm runs up
// inside the upper arm, and their faces would line up on one plane and flicker. Each limb is shifted by its own
// fraction of a millimetre (too little to see), so no two parts ever share a plane
const ZNUDGE = { legL: [0.0004, 0.0003, 0.0009], legR: [-0.0004, 0.0006, -0.0005], shinL: [0.0006, -0.0004, 0.0013], shinR: [-0.0006, 0.0008, -0.0011], armL: [0.0005, 0.0009, 0.0006], armR: [-0.0005, -0.0007, 0.0012], foreL: [-0.0011, 0.0005, -0.0008], foreR: [0.0011, -0.0010, 0.0007] };
// ---- dressing a zombie that's just been built: its parts get their geometry, all of them its own material ----
export function dressZombie(m, type, job) {
  const o = zDeal(type, job); o.noJaw = type === 'spitter';
  const K = zBuild(o, type === 'brute'), mat = lam(0xffffff, { vertexColors: true });
  ZPARTS.forEach(p => { zGrime(K[p], ZGRIME[p]); m[p].geometry = zBake(K[p]); if (ZNUDGE[p]) m[p].geometry.translate(...ZNUDGE[p]); m[p].material = mat; });
  m.mats = { body: mat }; m.look = o; m.skinCol = o.skin;
  return o;
}
