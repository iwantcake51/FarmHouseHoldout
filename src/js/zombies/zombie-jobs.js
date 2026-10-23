// The jobs zombies had (ZJOBS): what each wore to work the day it ended, from a cop or a SWAT officer to a
// nurse or a farmer, and the trims they share (collars, buttons, shoulder patches).

import { pick, rand, rr } from '../core/math.js';
import { worn, zArmor, zb, zback, zbandChest, zbandWaist, zc, ZDYE, ZF, zfront, zside, ztall } from './zombie-kit.js';

// ---- the jobs: what they wore to work the day it ended ----
// each fills in the outfit: top (chest and waist), sleeve ('none', 'short', 'long', 'rolled') and its colour, legs
// ('long', 'shorts', 'bare') and their colour, shoes, gloves, hat, hair and anything else it carries (o.add: pieces
// added once the body's built, given the kits). w is how often each turns up among walkers, runners and brutes
export const ZJOBS = {
  casual: { w: [10, 5, 3], f: o => {
    o.top = worn(pick([0x8a8a86, 0x2e2e30, 0xa83a2a, 0x3a5a7a, 0xd8d2c4, 0x4e5a3c, pick(ZDYE)])); o.sleeve = rand() < 0.75 ? 'short' : 'long';
    o.legs = rand() < 0.15 ? 'shorts' : 'long'; o.pants = worn(pick([0x3a4a64, 0x2f3a52, 0x4a5a74, 0x2f3238, 0x6a5e44, 0x1e1e22])); o.shoes = pick(['sneakers', 'sneakers', 'boots']);
    if (rand() < 0.4) { const pc = pick([0xd8d2c4, 0xc8a040, 0xa83a2a, 0x2e2e30]); o.add.push(K => { zfront(K.torso, rr(0.12, 0.2), rr(0.08, 0.14), worn(pc, 0.2), 0, 0.14, ZF.chest); }); }   // something printed on the front
  } },
  hoodie: { w: [5, 4, 2], f: o => {
    o.top = worn(pick([0x6a6a6a, 0x2e3a54, 0x4a5236, 0x5e2a2a, 0x2a2a2c, pick(ZDYE)])); o.sleeve = 'long'; o.legs = 'long'; o.pants = worn(pick([0x3a4a64, 0x2f3238, 0x5a5a5e])); o.shoes = 'sneakers';
    const c = o.top; o.add.push(K => {
      zb(K.torso, 0.3, 0.09, 0.12, zc(c, 0.85), 0, 0.31, -0.1);   // the hood, down at the back of the neck
      zfront(K.torso, 0.3, 0.1, zc(c, 0.88), 0, -0.2, ZF.waist);   // the front pocket
      [-1, 1].forEach(s => zfront(K.torso, 0.012, 0.12, 0xd8d2c4, s * 0.04, 0.2, ZF.chest, 0.008));   // the drawstrings
    });
  } },
  office: { w: [6, 2, 2], f: o => {
    o.top = worn(pick([0xeceae4, 0xeceae4, 0xb8cce0, 0xd8d4cc, 0xe0c8c8]), 0.18); o.sleeve = rand() < 0.6 ? 'long' : 'rolled'; o.legs = 'long'; o.pants = worn(pick([0x2a2c30, 0x3a3c42, 0x4a4a4e, 0x2e3446])); o.shoes = 'dress';
    const tie = rand() < 0.65 ? pick([0x8a1e1e, 0x1e2a4a, 0x5a1a24, 0xb08a2a, 0x2a4a34]) : 0, card = rand() < 0.4;
    o.add.push(K => {
      zcollar(K, o.top);
      if (tie) { zfront(K.torso, 0.05, 0.05, zc(tie, 0.85), 0, 0.27, ZF.chest, 0.008); zfront(K.torso, 0.055, 0.26, tie, 0, 0.12, ZF.chest, 0.008); }   // knot and blade, loosened
      else zbuttons(K, 0.006);
      zbandWaist(K.torso, -0.26, 0.04, 0x1e1a18, 0.005);   // the belt
      if (card) { zfront(K.torso, 0.05, 0.07, 0xe8e6e0, 0.1, 0.06, ZF.chest, 0.008); zfront(K.torso, 0.012, 0.16, 0x2a4a8a, 0.1, 0.17, ZF.chest, 0.008); }   // a lanyard and its ID
    });
    if (rand() < 0.3) o.glasses = true;
  } },
  suit: { w: [3, 1, 1], f: o => {
    const sc = worn(pick([0x2a2c30, 0x1e2434, 0x18181a, 0x4a4a4e, 0x4a3a2a]), 0.1), shirt = worn(pick([0xeceae4, 0xb8cce0]), 0.15), tie = pick([0x8a1e1e, 0x1e2a4a, 0x141416, 0xb08a2a]);
    o.top = sc; o.sleeve = 'long'; o.legs = 'long'; o.pants = sc; o.shoes = 'dress';
    o.add.push(K => {
      zfront(K.torso, 0.13, 0.3, shirt, 0, 0.15, ZF.chest, 0.004); zfront(K.torso, 0.05, 0.24, tie, 0, 0.14, ZF.chest, 0.008);   // the open front: shirt and tie
      [-1, 1].forEach(s => { zfront(K.torso, 0.04, 0.16, zc(sc, 0.8), s * 0.085, 0.2, ZF.chest, 0.009, ); });   // the lapels
      zfront(K.torso, 0.012, 0.012, 0x8a8478, 0, -0.06, ZF.waist, 0.006);   // the one button
    });
  } },
  police: { w: [5, 3, 4], f: o => {
    const navy = worn(pick([0x1e2a44, 0x232c3e, 0x2a3446]), 0.12), black = 0x16171a;
    o.top = navy; o.sleeve = rand() < 0.5 ? 'short' : 'long'; o.legs = 'long'; o.pants = navy; o.shoes = 'boots'; o.boot = black;
    if (rand() < 0.6) o.hat = 'police';
    o.add.push(K => {
      zcollar(K, navy); zbuttons(K, 0.006, 0xb0a070);
      zfront(K.torso, 0.045, 0.055, 0xc8a040, -0.12, 0.17, ZF.chest, 0.008);   // the badge, over the heart
      zfront(K.torso, 0.08, 0.02, 0xd8d2c4, 0.12, 0.17, ZF.chest, 0.008);      // the name tag
      [-1, 1].forEach(s => zfront(K.torso, 0.1, 0.06, zc(navy, 1.3), s * 0.12, 0.12, ZF.chest, 0.004));   // the breast pockets
      // the duty belt: the holster on the right hip, the cuffs, the radio and the mag pouches
      zbandWaist(K.torso, -0.25, 0.06, black, 0.012);
      zb(K.torso, 0.06, 0.14, 0.09, black, 0.24, -0.29, 0.02); zb(K.torso, 0.03, 0.05, 0.04, 0x26272a, 0.24, -0.2, 0.04);   // holster and the grip in it
      zb(K.torso, 0.08, 0.05, 0.04, black, -0.12, -0.25, 0.15); zb(K.torso, 0.05, 0.08, 0.04, black, -0.22, -0.24, 0.07);   // pouches, radio
      zb(K.torso, 0.06, 0.04, 0.04, 0x8a8a8e, 0.1, -0.25, -0.15);   // cuffs at the back
      zshoulderPatch(K, 0x2a3a6a, 0xc8a040);
    });
  } },
  swat: { w: [1, 1, 6], f: o => {
    const base = worn(pick([0x1a1b1e, 0x1e2230, 0x26292e]), 0.1), vest = pick([0x22242a, 0x2a2e26, 0x1c1e22]);
    o.top = base; o.sleeve = 'long'; o.legs = 'long'; o.pants = base; o.shoes = 'boots'; o.boot = 0x141414; o.gloves = 0x18181a; o.hat = 'swat'; o.shell = 0.022;
    o.add.push(K => {
      // the plate carrier: plates front and back over the chest, a cummerbund round the waist, pouches across the front
      // (each tagged as armour, to break off when it's taken enough: zArmor, zombies/armor-break.js)
      zArmor('torso', () => {
        zb(K.torso, 0.46, 0.32, 0.34, vest, 0, 0.12, 0); zbandWaist(K.torso, -0.08, 0.14, vest, 0.016);
        for (let i = -1; i <= 1; i++) zb(K.torso, 0.1, 0.1, 0.05, zc(vest, 1.15), i * 0.12, -0.04, 0.18);
        zfront(K.torso, 0.16, 0.035, 0xd8d8d4, 0, 0.22, 0.17, 0.004); zback(K.torso, 0.3, 0.06, 0xd8d8d4, 0, 0.18, 0.17, 0.004);   // SWAT, front and back
        zb(K.torso, 0.06, 0.12, 0.05, 0x111214, -0.1, 0.18, 0.18);   // the radio on the plate
      });
      // knee pads, and the thigh holster on the right
      zArmor('legs', () => { ['L', 'R'].forEach(s => zb(K['shin' + s], 0.17, 0.08, 0.05, 0x161618, 0, -0.03, 0.115)); zb(K.legR, 0.06, 0.15, 0.12, 0x141416, 0.105, -0.12, 0.0); });
      zshoulderPatch(K, 0x26292e, 0xd8d8d4);
    });
  } },
  // a riot officer: the SWAT kit with the helmet's face shield down (ARMOR_KIT, zombies/damage.js: it blunts a headshot)
  riot: { w: [1, 1, 3], f: o => { ZJOBS.swat.f(o); o.hat = 'riot'; } },
  track: { w: [2, 12, 0], f: o => {
    const c1 = pick([0xc82a22, 0x2a54c8, 0xe8c020, 0x1e8a44, 0xe86a1e, 0xd8d8d8, 0x7a2ab8]), c2 = pick([0xe8e6e0, 0x141416, 0xe8c020, 0x2a54c8]);
    o.top = worn(c1, 0.15); o.sleeve = 'none'; o.legs = 'shorts'; o.pants = worn(c2 === 0xe8e6e0 ? 0x141416 : c2, 0.12); o.shoes = 'sneakers'; o.sneak = [pick([0xe86a1e, 0xd8e020, 0x2ac8e8, 0xe82a8a, 0xe8e6e0]), 0xe8e4dc, pick([0x141416, 0xe8e6e0])]; o.socks = 0xe8e6e0;
    o.thin = true; if (rand() < 0.6) o.hat = 'headband'; o.hatCol = pick([0xe8e6e0, c1, 0x141416]);
    const num = [rand(), rand(), rand()];
    o.add.push(K => {
      ['l', 'r'].forEach(f => ztall(K.torso, f, 0.2, -0.26, 0.26, c2, 0, 0.004));   // the singlet's stripes down each side
      // the race bib: a white square pinned to the chest, its number in black
      zfront(K.torso, 0.19, 0.14, 0xeceae4, 0, 0.1, ZF.chest, 0.006);
      num.forEach((n, i) => zfront(K.torso, 0.03, 0.06, 0x141416, (i - 1) * 0.05, 0.1, ZF.chest, 0.01 + n * 0.0001));
      zfront(K.torso, 0.17, 0.02, 0xc82a22, 0, 0.155, ZF.chest, 0.01);
      zb(K.foreL, 0.142, 0.142, 0.04, o.hatCol, 0, 0, 0.24);   // a wristband
    });
  } },
  jogger: { w: [3, 6, 0], f: o => {
    o.top = worn(pick([0x3a3c42, 0x8a8a8e, 0x2a4a7a, 0x7a2a3a, 0x2a2a2c, pick(ZDYE)]), 0.15); o.sleeve = rand() < 0.5 ? 'long' : 'short'; o.legs = 'long'; o.pants = worn(pick([0x1e1e22, 0x2a2c34, 0x4a4a50]), 0.1); o.shoes = 'sneakers'; o.thin = true;
    const stripe = pick([0xe8e6e0, 0xc82a22, 0xe8c020]);
    o.add.push(K => {
      ['L', 'R'].forEach(s => { const x = (s === 'L' ? -1 : 1); zside(K['leg' + s], x, 0.03, 0.28, stripe, 0, -0.145, 0.095, 0.004); zside(K['shin' + s], x, 0.03, 0.2, stripe, 0, -0.1, 0.092, 0.004); });   // the stripe down the side of each leg
      [-1, 1].forEach(s => zb(K.head, 0.02, 0.025, 0.02, 0xe8e6e0, s * 0.155, 0.0, 0.0));   // earbuds
      zb(K.head, 0.008, 0.2, 0.008, 0xe8e6e0, 0.15, -0.12, 0.0);
    });
  } },
  farmer: { w: [6, 2, 5], f: o => {
    const flannel = worn(pick([0x9a2e24, 0x3e5a3a, 0x34507a, 0x6a4a2a, 0x8a6a2a])), denim = worn(pick([0x3a4a64, 0x2f3a52, 0x4a5a74]));
    o.top = flannel; o.sleeve = rand() < 0.5 ? 'rolled' : 'long'; o.legs = 'long'; o.pants = denim; o.shoes = 'boots'; o.boot = worn(pick([0x5a3a1e, 0x3a2a1e, 0x6a4a2a]));
    o.plaid = zc(flannel, 0.6); o.hat = pick(['straw', 'trucker', 'none']); o.hatCol = pick([0xc8a040, 0x9a2a22, 0x3a5a3a, 0x2e4a6a]);
    if (rand() < 0.6) o.add.push(K => {   // the overalls: the bib up the chest, straps over the shoulders, the denim over the waist
      zbandWaist(K.torso, -0.16, 0.28, denim, 0.006); zfront(K.torso, 0.26, 0.2, denim, 0, 0.08, ZF.chest, 0.004);
      zfront(K.torso, 0.08, 0.06, zc(denim, 0.85), 0, 0.1, ZF.chest, 0.008);   // the bib pocket
      [-1, 1].forEach(s => { zfront(K.torso, 0.045, 0.14, denim, s * 0.1, 0.24, ZF.chest, 0.004); zb(K.torso, 0.045, 0.012, 0.32, denim, s * 0.1, 0.305, 0); ztall(K.torso, 'b', 0.045, -0.14, 0.26, denim, s * 0.08, 0.004); zfront(K.torso, 0.03, 0.03, 0xb0a070, s * 0.1, 0.17, ZF.chest, 0.008); });
    });
  } },
  construction: { w: [5, 2, 7], f: o => {
    const tee = worn(pick([0x8a8a86, 0xd8d2c4, 0x2e2e30, 0x3a5a7a])), vis = pick([0xe8761e, 0xd8e828, 0xe85a1e]);
    o.top = tee; o.sleeve = 'short'; o.legs = 'long'; o.pants = worn(pick([0x3a4a64, 0x5a4a30, 0x2f3238])); o.shoes = 'boots'; o.boot = worn(0x8a6a3a, 0.1);
    o.hat = 'hardhat'; o.hatCol = pick([0xe8c020, 0xe8e6e0, 0xe8761e, 0x2a54c8]); o.shell = 0.014;
    o.add.push(K => {
      // the hi-vis vest: its fluorescent panels with silver reflective bands round and up over the shoulders
      zb(K.torso, 0.51, 0.33, 0.315, worn(vis, 0.1), 0, 0.13, 0); zbandWaist(K.torso, -0.14, 0.24, worn(vis, 0.1), 0.008);
      zbandChest(K.torso, 0.06, 0.035, 0xc8ccd0, 0.012); zbandWaist(K.torso, -0.18, 0.035, 0xc8ccd0, 0.014);
      [-1, 1].forEach(s => { zfront(K.torso, 0.035, 0.3, 0xc8ccd0, s * 0.12, 0.12, ZF.chest, 0.012); zback(K.torso, 0.035, 0.3, 0xc8ccd0, s * 0.12, 0.12, ZF.chest, 0.012); });
      zfront(K.torso, 0.012, 0.3, zc(vis, 0.7), 0, 0.12, ZF.chest, 0.012);   // the zip
      // the tool belt, its pouches and a hammer
      zbandWaist(K.torso, -0.27, 0.05, 0x5a3a1e, 0.026);
      [-1, 1].forEach(s => zb(K.torso, 0.1, 0.1, 0.07, 0x6a4a28, s * 0.16, -0.3, 0.13));
      zb(K.torso, 0.025, 0.16, 0.025, 0x7a5a3a, 0.24, -0.33, -0.02); zb(K.torso, 0.08, 0.03, 0.03, 0x4a4c50, 0.24, -0.25, -0.02);
    });
  } },
  doctor: { w: [3, 1, 1], f: o => {
    const scrub = worn(pick([0x3a6a9a, 0x2a7a7a, 0x4a5a8a, 0x5a8aa8]), 0.12);
    o.top = 0xe8e6e0; o.sleeve = 'long'; o.legs = 'long'; o.pants = scrub; o.shoes = 'dress'; o.coat = 0xe2e0da; o.mask = rand() < 0.5 ? 0x8ab8d8 : 0;
    o.add.push(K => {
      zfront(K.torso, 0.14, 0.32, scrub, 0, 0.14, ZF.chest, 0.004);   // scrubs showing at the open front
      [-1, 1].forEach(s => zfront(K.torso, 0.05, 0.16, 0xd2d0ca, s * 0.09, 0.2, ZF.chest, 0.009));   // lapels
      // the stethoscope round the neck, its tubes down the front
      zb(K.torso, 0.2, 0.014, 0.014, 0x2a2a2c, 0, 0.3, 0.12); [-1, 1].forEach(s => zfront(K.torso, 0.014, 0.16, 0x2a2a2c, s * 0.05, 0.2, ZF.chest, 0.012)); zfront(K.torso, 0.035, 0.035, 0xb8bcc0, -0.05, 0.12, ZF.chest, 0.014);
      zfront(K.torso, 0.08, 0.1, 0xd8d6d0, 0.12, 0.12, ZF.chest, 0.009); zfront(K.torso, 0.012, 0.06, 0x2a4a8a, 0.13, 0.15, ZF.chest, 0.013);   // a breast pocket, a pen
    });
  } },
  nurse: { w: [4, 2, 1], f: o => {
    const scrub = worn(pick([0x3a6a9a, 0x2a7a7a, 0x8a4a7a, 0x4a8a6a, 0x5a8aa8, 0x2a3a5a]), 0.12);
    o.top = scrub; o.sleeve = 'short'; o.legs = 'long'; o.pants = scrub; o.shoes = 'sneakers'; o.sneak = [0xe8e6e0, 0xe8e4dc, 0xd8d8d8]; o.mask = rand() < 0.4 ? 0x8ab8d8 : 0;
    if (rand() < 0.5) o.hair = 'pony';
    o.add.push(K => { zfront(K.torso, 0.16, 0.08, zc(scrub, 0.8), 0, 0.27, ZF.chest, 0.004); zfront(K.torso, 0.1, 0.08, zc(scrub, 1.15), -0.11, 0.1, ZF.chest, 0.004); zfront(K.torso, 0.04, 0.05, 0xe8e6e0, 0.12, 0.17, ZF.chest, 0.008); });   // the V neck, a pocket, the ID
  } },
  patient: { w: [3, 3, 0], f: o => {
    const gown = worn(pick([0x9ab8c8, 0xa8c0b8, 0xc8c8d0]), 0.15);
    o.top = gown; o.sleeve = 'short'; o.legs = 'bare'; o.pants = gown; o.shoes = rand() < 0.5 ? 'bare' : 'socks'; o.socks = 0xd8d4c8; o.gown = gown;
    o.add.push(K => {
      for (let i = 0; i < 7; i++) zfront(K.torso, 0.02, 0.02, zc(gown, 0.75), rr(-0.18, 0.18), rr(-0.25, 0.25), i % 2 ? ZF.chest : ZF.waist, 0.004);   // its little print
      ztall(K.torso, 'b', 0.06, -0.29, 0.29, o.skin, 0, 0.006);   // open at the back
      zb(K.foreL, 0.142, 0.142, 0.03, 0xe8e6e0, 0, 0, 0.22);   // the hospital bracelet
      zb(K.foreR, 0.05, 0.012, 0.05, 0xe8e6e0, 0, 0.068, 0.1);  // where the drip went in
    });
  } },
  firefighter: { w: [2, 1, 6], f: o => {
    const coat = worn(pick([0x8a7a50, 0x8a7a50, 0x1e1e20, 0xa8904a]), 0.12), band = pick([0xd8e828, 0xc8ccd0]);
    o.top = coat; o.sleeve = 'long'; o.legs = 'long'; o.pants = coat; o.shoes = 'boots'; o.boot = 0x141414; o.gloves = 0x6a5a3a; o.hat = 'fire'; o.hatCol = pick([0x1e1e20, 0xc8a020, 0xe8e6e0, 0xa82a22]);
    o.add.push(K => {
      // the turnout coat's reflective bands: round the chest and the hem, round each arm and each shin
      zbandChest(K.torso, 0.08, 0.04, band, 0.006); zbandWaist(K.torso, -0.26, 0.04, band, 0.006);
      ['L', 'R'].forEach(s => { zb(K['fore' + s], 0.142, 0.142, 0.04, band, 0, 0, 0.2); zb(K['shin' + s], 0.196, 0.04, 0.226, band, 0, -0.12, 0); });
      ztall(K.torso, 'f', 0.03, -0.25, 0.25, 0x2a2a2a, 0.02, 0.008);   // the storm flap and its clasps
      // the air tank on the back in its harness
      zb(K.torso, 0.14, 0.4, 0.14, 0xc8c8cc, 0, 0.06, -0.24); zb(K.torso, 0.06, 0.06, 0.06, 0x2a2a2a, 0, 0.29, -0.24);
      [-1, 1].forEach(s => zfront(K.torso, 0.04, 0.32, 0x1e1e20, s * 0.14, 0.12, ZF.chest, 0.008));
    });
  } },
  chef: { w: [3, 1, 3], f: o => {
    o.top = worn(0xeceae4, 0.15); o.sleeve = rand() < 0.5 ? 'long' : 'rolled'; o.legs = 'long'; o.pants = worn(0x3a3a3c, 0.1); o.shoes = 'dress'; o.hat = rand() < 0.6 ? 'toque' : 'none';
    o.add.push(K => {
      for (let r = 0; r < 4; r++) [-1, 1].forEach(s => zfront(K.torso, 0.025, 0.025, 0x3a3a3c, s * 0.07, 0.24 - r * 0.08, ZF.chest, 0.008));   // the double row of buttons
      zfront(K.torso, 0.04, 0.3, zc(0xeceae4, 0.92), 0.07, 0.12, ZF.chest, 0.004);
      // the apron from the waist down over the thighs
      zfront(K.torso, 0.38, 0.28, worn(0xe2e0da, 0.2), 0, -0.16, ZF.waist, 0.008); zbandWaist(K.torso, -0.04, 0.03, worn(0xe2e0da, 0.2), 0.01);
      ['L', 'R'].forEach(s => zfront(K['leg' + s], 0.19, 0.22, worn(0xe2e0da, 0.2), 0, -0.11, 0.11, 0.008));
      // checked trousers
      ['legL', 'legR', 'shinL', 'shinR'].forEach(p => { for (let i = 0; i < 4; i++) zfront(K[p], 0.035, 0.035, 0xd8d6d0, rr(-0.06, 0.06), -0.04 - i * 0.06, p[0] === 'l' ? 0.11 : 0.107, 0.004); });
    });
  } },
  mechanic: { w: [4, 1, 4], f: o => {
    const cov = worn(pick([0x3a4a6a, 0x5a5e62, 0x4a5236, 0x2a3446, 0x6a5a3a]), 0.2);
    o.top = cov; o.sleeve = rand() < 0.5 ? 'long' : 'rolled'; o.legs = 'long'; o.pants = cov; o.shoes = 'boots'; o.boot = 0x2a2420;
    o.add.push(K => {
      ztall(K.torso, 'f', 0.012, -0.28, 0.28, zc(cov, 0.75), 0, 0.004);   // the zip, collar to crotch
      zfront(K.torso, 0.09, 0.05, 0xe8e6e0, -0.12, 0.17, ZF.chest, 0.006); zfront(K.torso, 0.07, 0.015, 0xa82a22, -0.12, 0.17, ZF.chest, 0.01);   // the oval name patch
      // grease: black smears on the chest, the thighs, the hands
      for (let i = 0; i < 5; i++) zfront(K.torso, rr(0.03, 0.08), rr(0.02, 0.06), 0x1c1a18, rr(-0.18, 0.18), rr(-0.25, 0.2), ZF.chest, 0.006);
      ['L', 'R'].forEach(s => zfront(K['leg' + s], 0.08, 0.06, 0x1c1a18, rr(-0.04, 0.04), rr(-0.08, -0.2), 0.11, 0.006));
      zb(K.torso, 0.08, 0.1, 0.02, 0xa82a22, 0.18, -0.32, -0.14);   // a rag hanging out of the back pocket
    });
  } },
  soldier: { w: [2, 2, 5], f: o => {
    const camo = [0x4a5236, 0x6a5e3e, 0x2a2c22, 0x5a6a3e], base = worn(camo[0], 0.08);
    o.top = base; o.sleeve = rand() < 0.4 ? 'rolled' : 'long'; o.legs = 'long'; o.pants = base; o.shoes = 'boots'; o.boot = pick([0x8a6a3a, 0x2a2420]); o.hat = 'helmet'; o.hatCol = 0x4a5236; o.camo = camo; o.shell = 0.018;
    o.add.push(K => {
      zArmor('torso', () => { zb(K.torso, 0.48, 0.3, 0.33, 0x50563c, 0, 0.12, 0); for (let i = -1; i <= 1; i++) zb(K.torso, 0.09, 0.1, 0.05, 0x44482f, i * 0.11, -0.02, 0.175); });   // the vest and its pouches
      zb(K.torso, 0.02, 0.012, 0.01, 0xb8bcc0, 0, 0.29, 0.155); zfront(K.torso, 0.03, 0.045, 0xb8bcc0, 0, 0.26, 0.165, 0.004);   // dog tags
      zbandWaist(K.torso, -0.25, 0.05, 0x3a3e2a, 0.012);
    });
  } },
  prisoner: { w: [3, 2, 3], f: o => {
    const or = worn(pick([0xe8761e, 0xe86a1e, 0xd8701e]), 0.15);
    o.top = or; o.sleeve = 'short'; o.legs = 'long'; o.pants = or; o.shoes = 'slip'; o.socks = 0xe8e6e0;
    o.add.push(K => { zcollar(K, or); zback(K.torso, 0.3, 0.08, 0x141416, 0, 0.18, ZF.chest, 0.004); zfront(K.torso, 0.1, 0.03, 0x141416, -0.11, 0.18, ZF.chest, 0.004); });   // the lettering on the back, the number on the chest
  } },
  hunter: { w: [3, 1, 4], f: o => {
    const orange = 0xe8621e, camo = [0x5a5236, 0x6a5e3e, 0x3a3a2a, 0x7a6a4a];
    o.top = worn(camo[0], 0.1); o.camo = camo; o.sleeve = 'long'; o.legs = 'long'; o.pants = worn(pick([camo[0], 0x3a4a64]), 0.12); o.shoes = 'boots'; o.boot = worn(0x5a3a1e);
    o.hat = pick(['trucker', 'beanie']); o.hatCol = orange; o.shell = 0.014;
    o.add.push(K => { zb(K.torso, 0.51, 0.33, 0.315, worn(orange, 0.12), 0, 0.13, 0); zbandWaist(K.torso, -0.14, 0.24, worn(orange, 0.12), 0.008); [-1, 1].forEach(s => zfront(K.torso, 0.1, 0.07, zc(orange, 0.8), s * 0.12, -0.14, ZF.waist, 0.012)); });   // the blaze orange vest
  } },
  biker: { w: [3, 1, 5], f: o => {
    const lea = worn(pick([0x1a1818, 0x221c18, 0x2a2220]), 0.06);
    o.top = lea; o.sleeve = 'long'; o.legs = 'long'; o.pants = worn(pick([0x2f3a52, 0x1e1e22, 0x3a4a64])); o.shoes = 'boots'; o.boot = 0x141212;
    o.hat = rand() < 0.5 ? 'bandana' : 'none'; o.hatCol = pick([0x141416, 0x9a2a22, 0x2e4a7a]); o.beard = rand() < 0.7; o.hair = pick(['long', 'bald', 'short']);
    const tee = pick([0x2a2a2c, 0xd8d2c4, 0x5a5a5e]);
    o.add.push(K => {
      zfront(K.torso, 0.12, 0.3, worn(tee), 0.02, 0.14, ZF.chest, 0.004);   // the shirt at the open front
      ztall(K.torso, 'f', 0.01, -0.15, 0.27, 0x9a9ca0, -0.05, 0.008);   // the zip, hanging open
      [-1, 1].forEach(s => zfront(K.torso, 0.06, 0.12, zc(lea, 1.4), s * 0.1, 0.22, ZF.chest, 0.008));   // the lapels
      zbandWaist(K.torso, -0.27, 0.04, 0x141212, 0.008); zfront(K.torso, 0.05, 0.04, 0x9a9ca0, 0, -0.27, ZF.waist, 0.03);   // the belt and its buckle
      if (rand() < 0.6) zback(K.torso, 0.24, 0.2, zc(lea, 1.8), 0, 0.14, ZF.chest, 0.004);   // the club's patch on the back
    });
  } },
  fastfood: { w: [4, 3, 1], f: o => {
    const shirt = worn(pick([0xa82a22, 0x2a54a8, 0x3a3a3c, 0xe8c020]), 0.15), trim = pick([0xe8c020, 0xe8e6e0, 0xa82a22]);
    o.top = shirt; o.sleeve = 'short'; o.legs = 'long'; o.pants = worn(0x1e1e22, 0.1); o.shoes = 'sneakers'; o.sneak = [0x1e1e20, 0x2a2a2c, 0x1e1e20];
    o.hat = 'visor'; o.hatCol = trim;
    o.add.push(K => {
      zcollar(K, trim); zfront(K.torso, 0.06, 0.025, 0xe8e6e0, 0.12, 0.18, ZF.chest, 0.008);   // the collar in the trim colour, the name tag
      zfront(K.torso, 0.36, 0.24, worn(0x2a2a2c, 0.1), 0, -0.17, ZF.waist, 0.008); zbandWaist(K.torso, -0.04, 0.025, 0x2a2a2c, 0.01);   // a short apron
    });
  } },
  paramedic: { w: [2, 3, 2], f: o => {
    const uni = worn(pick([0x1e2a44, 0x2a4a3a, 0x2a2e36]), 0.12);
    o.top = uni; o.sleeve = 'short'; o.legs = 'long'; o.pants = uni; o.shoes = 'boots'; o.boot = 0x141414; o.gloves = 0x4a7ac8;
    o.add.push(K => {
      zbandChest(K.torso, 0.04, 0.03, 0xc8ccd0, 0.006);   // a reflective band
      zfront(K.torso, 0.07, 0.07, 0xe8e6e0, -0.12, 0.17, ZF.chest, 0.008); zfront(K.torso, 0.04, 0.012, 0x2a54c8, -0.12, 0.17, ZF.chest, 0.012); zfront(K.torso, 0.012, 0.04, 0x2a54c8, -0.12, 0.17, ZF.chest, 0.012);   // the star of life
      zbandWaist(K.torso, -0.26, 0.04, 0x141414, 0.008);
      ['L', 'R'].forEach(s => zside(K['leg' + s], s === 'L' ? -1 : 1, 0.1, 0.1, zc(uni, 0.85), 0.0, -0.17, 0.095, 0.004));   // the cargo pockets
    });
  } },
  priest: { w: [1, 0, 1], f: o => {
    o.top = 0x1a1a1c; o.sleeve = 'long'; o.legs = 'long'; o.pants = 0x1a1a1c; o.shoes = 'dress';
    o.add.push(K => { zfront(K.torso, 0.05, 0.03, 0xeceae4, 0, 0.28, ZF.chest, 0.006); zb(K.torso, 0.16, 0.03, 0.18, 0x1a1a1c, 0, 0.3, 0.0); });   // the white tab at the collar
  } },
  mail: { w: [2, 2, 1], f: o => {
    o.top = worn(0x9ab8d8, 0.15); o.sleeve = 'short'; o.legs = rand() < 0.5 ? 'shorts' : 'long'; o.pants = worn(0x1e2a44, 0.1); o.shoes = 'sneakers'; o.sneak = [0x1e1e20, 0xe8e4dc, 0x1e1e20]; o.socks = 0x1e2a44;
    o.hat = rand() < 0.5 ? 'trucker' : 'none'; o.hatCol = 0x1e2a44;
    o.add.push(K => {
      zfront(K.torso, 0.06, 0.04, 0xe8e6e0, -0.12, 0.18, ZF.chest, 0.008);
      // the mail bag on its strap across the body
      for (let i = 0; i < 5; i++) zfront(K.torso, 0.05, 0.08, 0x3a2a1e, 0.17 - i * 0.085, 0.24 - i * 0.12, i < 2 ? ZF.chest : ZF.waist, 0.008);
      zb(K.torso, 0.08, 0.2, 0.26, 0x3a2a1e, -0.25, -0.3, 0.0);
    });
  } },
  baseball: { w: [1, 2, 1], f: o => {
    const team = pick([0x1e2a6a, 0xa82a22, 0x1e1e20, 0x1e5a3a]);
    o.top = worn(0xe8e6e0, 0.2); o.sleeve = 'short'; o.legs = 'long'; o.pants = worn(0xd8d6d0, 0.2); o.shoes = 'sneakers'; o.sneak = [0x1e1e20, 0xe8e4dc, 0xe8e6e0]; o.hat = 'trucker'; o.hatCol = team;
    o.add.push(K => {
      for (let i = -2; i <= 2; i++) { ztall(K.torso, 'f', 0.008, -0.28, 0.28, zc(team, 1.4), i * 0.09, 0.003); ztall(K.torso, 'b', 0.008, -0.28, 0.28, zc(team, 1.4), i * 0.09, 0.003); }   // pinstripes
      zback(K.torso, 0.14, 0.14, team, 0, 0.12, ZF.chest, 0.007); zfront(K.torso, 0.2, 0.05, team, 0, 0.17, ZF.chest, 0.007);   // the number and the team across the front
      ['L', 'R'].forEach(s => zside(K['leg' + s], s === 'L' ? -1 : 1, 0.04, 0.28, team, 0, -0.145, 0.095, 0.006));
    });
  } },
  robe: { w: [2, 0, 1], f: o => {
    const robe = worn(pick([0x8a6a7a, 0x5a6a8a, 0xb0a890, 0x7a2a2a, 0x3a5a4a]), 0.15), pj = worn(pick([0x6a8ab8, 0xa8a8b0, 0x8a6a6a]));
    o.top = robe; o.sleeve = 'long'; o.legs = 'long'; o.pants = pj; o.shoes = 'slip'; o.slip = zc(robe, 1.1); o.coat = robe;
    o.add.push(K => {
      zfront(K.torso, 0.12, 0.2, pj, 0, 0.2, ZF.chest, 0.004); zbandWaist(K.torso, -0.08, 0.04, zc(robe, 0.8), 0.012);   // the pyjama top at the open front, the belt tied round
      zb(K.torso, 0.03, 0.14, 0.02, zc(robe, 0.8), -0.08, -0.17, 0.155);
      ['legL', 'legR', 'shinL', 'shinR'].forEach(p => { for (let i = 0; i < 3; i++) zb(K[p], p[0] === 'l' ? 0.198 : 0.192, 0.012, p[0] === 'l' ? 0.228 : 0.222, zc(pj, 0.7), 0, -0.05 - i * 0.08, 0); });   // its stripes
    });
  } },
  dress: { w: [4, 2, 0], f: o => {
    const c = worn(pick([0x8a2a3a, 0x2a4a7a, 0x3a5a3a, 0x1e1e20, 0x9a7a4a, pick(ZDYE)]), 0.15);
    o.top = c; o.sleeve = rand() < 0.5 ? 'none' : 'short'; o.legs = 'bare'; o.pants = c; o.shoes = 'slip'; o.slip = pick([0x1e1e20, 0x6a2a2a, 0xb8a888]); o.gown = c; o.hair = pick(['long', 'long', 'pony']);
    o.add.push(K => { if (rand() < 0.5) for (let i = 0; i < 9; i++) zfront(K.torso, 0.018, 0.018, zc(c, 1.6), rr(-0.18, 0.18), rr(-0.25, 0.25), i % 2 ? ZF.chest : ZF.waist, 0.004); });   // a little floral print, sometimes
  } }
};
// the shirt's collar, turned down round the neck
function zcollar(K, c) { [-1, 1].forEach(s => zb(K.torso, 0.1, 0.04, 0.03, zc(c, 0.92), s * 0.055, 0.29, 0.13, 0, 0, s * 0.35)); zb(K.torso, 0.22, 0.04, 0.16, zc(c, 0.92), 0, 0.31, -0.04); }
// buttons down the placket
function zbuttons(K, lay, c) { ztall(K.torso, 'f', 0.03, -0.275, 0.275, zc(0xd8d4cc, 0.95), 0, 0.004); for (let i = 0; i < 5; i++) zfront(K.torso, 0.012, 0.012, c || 0xb8b4ac, 0, 0.24 - i * 0.12, i < 3 ? ZF.chest : ZF.waist, lay + 0.004); }
// a patch on the outside of each upper arm, by the shoulder
function zshoulderPatch(K, c, edge) { [['armL', -1], ['armR', 1]].forEach(([p, s]) => { zb(K[p], 0.006, 0.07, 0.07, edge, s * 0.074, 0, 0.05); zb(K[p], 0.006, 0.055, 0.055, c, s * 0.077, 0, 0.05); }); }
