// Character gear that shows up from body upgrades: armour, footwear, knee pads, gloves, eyewear, the hammer line,
// the canteen, pills, armband, bandana, helmet and stopwatch.
//
// Each item is built from small pieces in its own group on the body part it rides on; once everything is placed, the
// pieces are pulled apart where they'd z-fight and each item is merged into a mesh or two (core/geometry.js).

import { basic, lam } from '../core/shaders.js';
import { box, finePieces, mergeInto, trimShadows, unfight } from '../core/geometry.js';
import { bandPouch2, KNEE_Y, PM } from './player.js';
import { GLOVE_COLS, HAIR_W, LOOK, lookMats, PBOOT, shade } from './look.js';
import { setCharBloodDirty } from '../effects/body-blood.js';
import { S, setS, setW8, T, W8 } from '../game/run-state.js';
import { GM } from '../weapons/gun-materials.js';
import { shellMat } from '../weapons/gun-models.js';

const gearParts = [];
let gearList = gearParts;   // where each item's group is noted (a teammate's own list while theirs is built: gearOnAvatar)
const GEAR = {
  leather: lam(0x4a3524), leatherDk: lam(0x33241a), leatherLt: lam(0x6a4c32), sole: lam(0x1e1a16), solePale: lam(0xd8d0c0), lace: lam(0x2a2018),
  white: lam(0xd8d2c4), offWhite: lam(0xbcb6a8), red: lam(0xb8382a), redDk: lam(0x8a2a20), blue: lam(0x34607e), blueDk: lam(0x24465e), amber: lam(0xe0a030),
  olive: lam(0x4a5236), oliveDk: lam(0x363c28), oliveLt: lam(0x5e6844), coyote: lam(0x8a7656), coyoteDk: lam(0x6a5a40), tan: lam(0xae9670), tanDk: lam(0x8c7654), tanLt: lam(0xc4ae86), dark: lam(0x24262a), black: lam(0x161718),
  green: basic(0x7cf08a), lens: basic(0xe8c25a), lensDk: lam(0x6a4a14), orange: lam(0xd06a2a), orangeDk: lam(0xa04e1c), steel: lam(0x8a8d90), steelDk: lam(0x55585c),
  wood: lam(0x7a5434), woodDk: lam(0x5a3e26), yellow: lam(0xd8b030), canvas: lam(0x7a6a4a), canvasDk: lam(0x5e5036), cord: lam(0x4a3a24), brass: lam(0xb08a3a),
  pill: lam(0xd8742a), label: lam(0xe8e2d0), nail: lam(0xa8a8a0), foam: lam(0x3a3c40)
};
// a group on a body part, holding one item's pieces
function gearItem(part, x, y, z) { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); part.add(g); gearList.push(g); return g; }
const gb = (g, w, h, d, mat, x, y, z) => box(g, w, h, d, mat, x, y, z);
function gc(g, r, len, mat, x, y, z, axis, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg || 12), mat); m.position.set(x, y, z); m.castShadow = true;
  if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2; g.add(m); return m;
}

// ---- armour: the canvas jacket gives you long canvas sleeves over whatever you wear; a vest or plate carrier goes over
// it, and then the jacket's sleeves are rolled up to the elbow
function buildArmor(ar) {
  if (ar >= 1) {
    const rolled = ar >= 2;
    [PM.armL, PM.armR].forEach((a, i) => {
      const g = gearItem(a), len = rolled ? 0.27 : 0.47;
      gb(g, 0.172, 0.172, len, GEAR.canvas, 0, 0, -0.035 + len / 2);
      gb(g, 0.176, 0.06, len * 0.7, GEAR.canvasDk, 0, 0.06, -0.035 + len * 0.4);             // the seam down the top of the sleeve
      if (rolled) { gb(g, 0.19, 0.19, 0.07, GEAR.canvasDk, 0, 0, len - 0.03); gb(g, 0.186, 0.186, 0.025, GEAR.canvas, 0, 0, len + 0.005); }   // the roll
      else { gb(g, 0.184, 0.184, 0.05, GEAR.canvasDk, 0, 0, len - 0.035); gb(g, 0.04, 0.03, 0.03, GEAR.brass, i ? 0.08 : -0.08, 0.02, len - 0.035); }   // cuff and its snap
    });
    // the jacket over the torso (its colour is the shirt's, player/look.js): a corduroy collar, a snap placket,
    // two chest pockets with flaps and a hem band
    const g = gearItem(PM.torso);
    gb(g, 0.4, 0.07, 0.07, GEAR.cord, 0, 0.29, 0.14); [-1, 1].forEach(s => { const c = gb(g, 0.14, 0.11, 0.03, GEAR.cord, s * 0.1, 0.25, 0.16); c.rotation.z = s * 0.35; });
    if (!rolled) {
      gb(g, 0.05, 0.56, 0.016, GEAR.canvasDk, 0, -0.01, 0.158); for (let k = 0; k < 5; k++) gb(g, 0.018, 0.018, 0.008, GEAR.brass, 0, 0.2 - k * 0.11, 0.169);
      [-1, 1].forEach(s => { gb(g, 0.13, 0.12, 0.014, GEAR.canvasDk, s * 0.11, 0.1, 0.157); gb(g, 0.135, 0.04, 0.02, GEAR.canvas, s * 0.11, 0.165, 0.161); gb(g, 0.014, 0.014, 0.008, GEAR.brass, s * 0.11, 0.155, 0.173); });
      gb(g, 0.51, 0.06, 0.31, GEAR.canvasDk, 0, -0.27, 0);
    }
  }
  if (ar >= 2) {
    // soft armour, cut close to the body: thin front and back panels, flat shoulder straps, velcro side flaps, a name
    // tape and a light on the chest
    const g = gearItem(PM.torso), vest = ar >= 3 ? GEAR.tan : GEAR.oliveDk, vestDk = ar >= 3 ? GEAR.tanDk : GEAR.black;
    gb(g, 0.52, 0.44, 0.026, vest, 0, -0.02, 0.161); gb(g, 0.52, 0.48, 0.026, vest, 0, 0.0, -0.161);
    [-1, 1].forEach(s => { gb(g, 0.09, 0.025, 0.33, vest, s * 0.15, 0.31, 0); gb(g, 0.012, 0.26, 0.31, vestDk, s * 0.254, -0.06, 0); gb(g, 0.014, 0.11, 0.22, vest, s * 0.257, -0.06, 0); });   // straps over the shoulders, side flaps
    gb(g, 0.5, 0.035, 0.03, vestDk, 0, -0.23, 0.166);                                                 // the hem binding
    gb(g, 0.15, 0.045, 0.008, GEAR.offWhite, -0.12, 0.13, 0.177); gb(g, 0.09, 0.055, 0.008, vestDk, 0.13, 0.13, 0.177);   // name tape, velcro
    if (ar === 2) { gb(g, 0.04, 0.065, 0.025, GEAR.black, 0.16, 0.0, 0.186); gb(g, 0.026, 0.026, 0.008, GEAR.amber, 0.16, 0.015, 0.201); }   // a clip light
  }
  if (ar >= 3) {
    // the plate carrier, done like a modern chest rig in plain tan and sized to the body as a real one is: a plate bag
    // on the upper chest with a velcro field and a subdued patch, padded H-harness straps with laser-cut slots coming
    // down over it to the placard's corners (a push-to-talk clipped to the left one), and low on the chest the placard,
    // about a third the torso's height and a palm's depth: three open-top pouches across it with your long gun's ammo
    // standing a hand's breadth out of them (with two long guns, two for one and the third for the other; with none,
    // your sidearm's), an admin pouch on its face and rows of webbing either side. Wing pouches wrap round the flanks
    // from its ends: the sidearm's mags on the right if you've a long gun too, a zipped pouch with the radio's antenna
    // up out of it on the left. A plate bag behind
    const g = gearItem(PM.torso), t = GEAR.tan, td = GEAR.tanDk, tl = GEAR.tanLt;
    // a panel of the rig with its edges bound in a darker tape round its face, as webbing gear is
    const bound = (p, w, h, d, x, y, z, e) => { e = e || 0.006; gb(p, w, h, d, t, x, y, z); const f = z + d / 2 + 0.001; gb(p, w, e, 0.002, td, x, y + h / 2 - e / 2, f); gb(p, w, e, 0.002, td, x, y - h / 2 + e / 2, f); gb(p, e, h, 0.002, td, x - w / 2 + e / 2, y, f); gb(p, e, h, 0.002, td, x + w / 2 - e / 2, y, f); };
    // the plate bags, the front one's top corners cut, the velcro field across its top and a patch on it
    bound(g, 0.31, 0.24, 0.024, 0, 0.1, 0.186); bound(g, 0.25, 0.04, 0.024, 0, 0.238, 0.186); gb(g, 0.34, 0.33, 0.024, t, 0, 0.05, -0.186);
    gb(g, 0.19, 0.07, 0.003, td, 0, 0.19, 0.1995); gb(g, 0.072, 0.042, 0.003, GEAR.oliveDk, -0.05, 0.19, 0.2015); gb(g, 0.042, 0.042, 0.003, GEAR.coyoteDk, 0.04, 0.19, 0.2015);
    // the padded shoulder straps: down the front over the plate bag to the placard, over the shoulders and down the back
    [-1, 1].forEach(s => {
      const x = s * 0.135; bound(g, 0.07, 0.31, 0.018, x, 0.14, 0.208, 0.007); gb(g, 0.07, 0.016, 0.4, t, x, 0.306, 0.01); gb(g, 0.07, 0.3, 0.016, t, x, 0.15, -0.205);
      gb(g, 0.07, 0.004, 0.018, td, x, 0.29, 0.21);                                                              // a seam across it
      for (let k = 0; k < 4; k++) gb(g, 0.034, 0.007, 0.002, td, x, 0.06 + k * 0.055, 0.2185);                    // laser-cut slots
      gb(g, 0.05, 0.024, 0.02, td, x, 0.0, 0.216); gb(g, 0.036, 0.008, 0.022, GEAR.tanLt, x, 0.0, 0.217);         // the buckle onto the placard
    });
    gb(g, 0.03, 0.045, 0.022, GEAR.black, -0.135, 0.2, 0.228); gb(g, 0.014, 0.014, 0.008, GEAR.dark, -0.135, 0.21, 0.242);   // the push-to-talk and its button
    // the placard: three mag pouches across its top, each its own pocket, and below them the admin pouch and webbing
    const longs = [W8.slot.auto, W8.slot.long].filter(Boolean), fill = longs.length === 2 ? [longs[0], longs[0], longs[1]] : longs.length ? [longs[0], longs[0], longs[0]] : [W8.slot.side, W8.slot.side, W8.slot.side];
    const pz = 0.199, pd = 0.046, pf = pz + pd / 2, top = -0.025, ph = 0.17;
    bound(g, 0.36, ph, pd, 0, top - ph / 2, pz, 0.008);
    for (let k = 0; k < 3; k++) {
      const x = -0.1 + k * 0.1; bound(g, 0.094, 0.07, 0.008, x, top - 0.037, pf + 0.004, 0.005);              // the pouch's front
      if (fill[k]) pouchFill(g, fill[k], x, top, pz, 0.094, pd);
    }
    [-1, 1].forEach(s => [-0.125, -0.155].forEach(y => gb(g, 0.055, 0.008, 0.002, td, s * 0.13, top + y + 0.025, pf + 0.001)));   // webbing either side
    bound(g, 0.14, 0.085, 0.02, 0, top - 0.123, pf + 0.01, 0.005); gb(g, 0.142, 0.026, 0.022, tl, 0, top - 0.093, pf + 0.011);   // the admin pouch and its flap
    gb(g, 0.09, 0.04, 0.003, td, 0, top - 0.13, pf + 0.0215);                                                   // velcro on it
    // the wing pouches, angled round the flanks from the placard's ends
    const wing = s => { const w = new THREE.Group(); w.position.set(s * 0.215, -0.115, 0.18); w.rotation.y = s * 0.42; g.add(w); return w; };
    const zipped = (w, s) => {
      bound(w, 0.095, 0.17, 0.048, 0, 0, 0, 0.007); gb(w, 0.08, 0.004, 0.05, td, 0, 0.072, 0);                  // the body and its zip over the top
      gb(w, 0.006, 0.03, 0.006, td, -s * 0.035, 0.055, 0.028); gb(w, 0.012, 0.01, 0.008, tl, -s * 0.035, 0.038, 0.028);   // a zip pull on its cord
    };
    const wl = wing(-1); zipped(wl, -1);
    gc(wl, 0.009, 0.03, GEAR.black, 0.02, 0.095, -0.005, null, 8); const ant = gc(wl, 0.0032, 0.26, GEAR.black, 0.02, 0.23, -0.005, null, 6); ant.rotation.z = 0.1;   // the radio's antenna
    const wr = wing(1);
    if (longs.length && W8.slot.side) { bound(wr, 0.095, 0.14, 0.044, 0, -0.015, 0, 0.007); gb(wr, 0.097, 0.008, 0.046, td, 0, 0.051, 0); pouchFill(wr, W8.slot.side, 0, 0.055, 0, 0.09, 0.044); }
    else zipped(wr, 1);
  }
}
// what rides in a pouch for each gun, stowed as it would be: magazines upside down, floor plate up (two to a pouch for
// a handgun, with a divider), each held by a shock cord over its plate down to a pull tab; the revolver's speed loader;
// shotgun shells brass up through an elastic loop; rifle rounds tip up; or a fold of the machine gun's belt. Each mag
// is the gun's own: the AR's grey STANAG with its two pressed ribs, the MP5's curved steel one, the MP9's polymer one
// with its count windows, the auto shotgun's box, the pistol's polymer one with its flared base, the hand cannon's steel
const POUCH_FILL = {
  ar: { k: 'mag', w: 0.082, h: 0.092, d: 0.03, body: 'magAl', plate: 'metal2', ribs: 2, tilt: 0.07 },
  sub: { k: 'mag', w: 0.062, h: 0.09, d: 0.024, body: 'metal', plate: 'metal', ribs: 2, tilt: 0.2 },
  smg: { k: 'mag', w: 0.056, h: 0.082, d: 0.026, body: 'poly', plate: 'rubber', windows: true },
  scar: { k: 'mag', w: 0.09, h: 0.09, d: 0.034, body: 'fdeP', plate: 'fdeP', ribs: 2 },
  auto12: { k: 'mag', w: 0.086, h: 0.078, d: 0.036, body: 'metal2', plate: 'poly', ridges: true },
  pistol: { k: 'mag2', w: 0.036, h: 0.062, d: 0.021, body: 'poly', plate: 'rubber', flare: true },
  deagle: { k: 'mag2', w: 0.039, h: 0.064, d: 0.023, body: 'steelDk', plate: 'poly' },
  revolver: { k: 'loader' }, pump: { k: 'shells' }, dbl: { k: 'shells' }, hunting: { k: 'rounds', n: 5 }, lmg: { k: 'rounds', n: 6, belt: true }
};
const POUCH_TIP = new THREE.CylinderGeometry(0.0014, 0.0072, 0.02, 10);
function pouchFill(g, id, x, y, z, w, d) {
  const f = POUCH_FILL[id]; if (!f) return;
  const black = GEAR.black, cord = GEAR.tanDk;
  // a mag standing floor plate up out of the pouch mouth at y, raked a touch with its curve
  const mag = (mx, sc) => {
    const m = new THREE.Group(); m.position.set(mx, y, z); m.rotation.z = (f.tilt || 0) * (mx < x ? -1 : 1) * (f.k === 'mag2' ? 0 : 1); g.add(m);
    const mw = f.w * sc, L = f.h, md = f.d, B = GM[f.body], P = GM[f.plate];
    gb(m, mw, L + 0.02, md, B, 0, L / 2 - 0.01, 0);
    if (f.ribs) [-1, 1].forEach(s => gb(m, 0.006, L - 0.014, md + 0.003, B, s * mw * 0.24, L / 2 - 0.006, 0));   // ribs pressed out down each side
    if (f.windows) [0.25, 0.55].forEach(t => gb(m, 0.008, 0.007, md + 0.002, GM.rubber, mw * 0.25, L * t, 0));
    if (f.ridges) [0.3, 0.6].forEach(t => gb(m, mw + 0.003, 0.004, md + 0.003, GM.poly, 0, L * t, 0));
    gb(m, mw + 0.007, 0.011, md + 0.006, P, 0, L + 0.004, 0);                                           // the floor plate
    if (f.flare) gb(m, 0.008, 0.016, md + 0.008, P, mw / 2 + 0.002, L + 0.001, 0);                      // the base's lip at the front
    // the shock cord: two strands over the plate and down its front, and the pull tab standing up off it
    [-1, 1].forEach(s => { gb(m, 0.003, 0.003, md + 0.012, cord, s * 0.008, L + 0.011, 0); gb(m, 0.003, L * 0.55, 0.003, cord, s * 0.008, L * 0.74, md / 2 + 0.004); });
    const tab = gb(m, 0.018, 0.03, 0.005, cord, 0, L + 0.026, md / 2 - 0.002); tab.rotation.x = -0.25;
  };
  if (f.k === 'mag') mag(x, 1);
  else if (f.k === 'mag2') { [-1, 1].forEach(s => mag(x + s * w * 0.24, 1)); gb(g, 0.004, 0.012, d + 0.002, GEAR.tanDk, x, y - 0.004, z); }   // the divider between them
  else if (f.k === 'loader') {
    gc(g, 0.03, 0.03, black, x, y + 0.008, z, null, 16); gc(g, 0.032, 0.005, GEAR.dark, x, y + 0.021, z, null, 16);
    gc(g, 0.011, 0.018, GEAR.steelDk, x, y + 0.032, z, null, 12); gc(g, 0.0125, 0.005, GEAR.steelDk, x, y + 0.038, z, null, 12);   // the knurled knob
  } else if (f.k === 'shells') {
    for (let k = 0; k < 4; k++) {
      const sx = x + (k - 1.5) * w * 0.245; gc(g, 0.0118, 0.062, shellMat(id), sx, y + 0.016, z, null, 12); gc(g, 0.0125, 0.016, GM.brass, sx, y + 0.053, z, null, 12);
      gc(g, 0.0128, 0.0025, GM.brass, sx, y + 0.0623, z, null, 12); gc(g, 0.004, 0.002, GM.steel, sx, y + 0.0635, z, null, 8);   // the rim and the primer
    }
    gb(g, w * 0.96, 0.016, 0.004, GEAR.tanDk, x, y + 0.016, z + 0.0138);   // the elastic loop across them
  } else if (f.k === 'rounds') {
    const sp = w * (f.belt ? 0.155 : 0.185);
    for (let k = 0; k < f.n; k++) {
      const rx = x + (k - (f.n - 1) / 2) * sp; gc(g, 0.0072, 0.056, GM.brass, rx, y + 0.014, z, null, 10);
      const t = new THREE.Mesh(POUCH_TIP, GM.copper); t.position.set(rx, y + 0.052, z); t.castShadow = true; g.add(t);
      if (f.belt && k < f.n - 1) gb(g, sp * 0.5, 0.01, 0.014, GEAR.dark, rx + sp / 2, y + 0.008, z);   // the links between them
    }
    if (f.belt) gb(g, sp * (f.n - 1), 0.004, 0.016, GEAR.dark, x, y + 0.003, z);
    else gb(g, w * 0.96, 0.014, 0.004, GEAR.tanDk, x, y + 0.014, z + 0.009);   // the elastic loop across them
  }
}
// ---- footwear: good leather work boots, then white running shoes, then trail runners; Thick soles builds the sole up
function buildBoots(bt, thick) {
  [PM.shinL, PM.shinR].forEach((l, i) => {
    const g = gearItem(l, 0, -KNEE_Y, 0.05), sole = thick ? 0.04 + thick : 0.04;   // (laid out from the hip, as on the whole leg)
    if (bt === 1 || !bt) {   // work boots: a tall shaft, a toe cap, laces criss-crossing up the front, a pull tab, a heeled sole
      gb(g, 0.215, 0.22, 0.26, GEAR.leather, 0, -0.45, -0.03); gb(g, 0.21, 0.09, 0.15, GEAR.leather, 0, -0.505, 0.11);
      gb(g, 0.205, 0.07, 0.06, GEAR.leatherDk, 0, -0.515, 0.17); gb(g, 0.22, 0.03, 0.27, GEAR.leatherDk, 0, -0.34, -0.03);
      for (let k = 0; k < 4; k++) { const y = -0.37 - k * 0.04; gb(g, 0.12, 0.012, 0.012, GEAR.lace, 0, y, 0.102 + (k > 2 ? 0.04 : 0)).rotation.z = (k % 2 ? 1 : -1) * 0.35; }
      gb(g, 0.06, 0.06, 0.02, GEAR.leatherDk, 0, -0.32, -0.165);
      gb(g, 0.235, sole, 0.36, GEAR.sole, 0, -0.55 - sole / 2 + 0.02, 0.04); gb(g, 0.235, 0.03, 0.09, GEAR.sole, 0, -0.55 - sole + 0.005, -0.1);
    } else if (bt === 2) {   // running shoes: a white mesh upper, a red swoosh down each side, a thick foam sole, laces
      gb(g, 0.215, 0.11, 0.3, GEAR.white, 0, -0.49, 0.03); gb(g, 0.2, 0.06, 0.12, GEAR.white, 0, -0.52, 0.17);
      [-1, 1].forEach(s => { const sw = gb(g, 0.008, 0.035, 0.2, GEAR.red, s * 0.11, -0.5, 0.04); sw.rotation.x = -0.25; });
      for (let k = 0; k < 3; k++) gb(g, 0.1, 0.012, 0.012, GEAR.offWhite, 0, -0.45 - k * 0.03, 0.13 + k * 0.03);
      gb(g, 0.07, 0.06, 0.02, GEAR.red, 0, -0.43, -0.125);
      gb(g, 0.235, 0.05 + thick, 0.36, GEAR.solePale, 0, -0.55 - thick / 2, 0.04); gb(g, 0.24, 0.015, 0.33, GEAR.red, 0, -0.528, 0.04);
    } else {                 // trail runners: a blue upper with a rubber toe bumper, a lugged amber sole, a quick-lace toggle
      gb(g, 0.215, 0.12, 0.3, GEAR.blue, 0, -0.485, 0.03); gb(g, 0.2, 0.07, 0.12, GEAR.blue, 0, -0.515, 0.17);
      gb(g, 0.22, 0.05, 0.08, GEAR.blueDk, 0, -0.52, 0.205); gb(g, 0.22, 0.04, 0.3, GEAR.blueDk, 0, -0.44, 0.03);
      gb(g, 0.03, 0.03, 0.02, GEAR.amber, 0, -0.44, 0.19); gb(g, 0.005, 0.07, 0.005, GEAR.dark, 0, -0.47, 0.18);
      gb(g, 0.24, 0.05 + thick, 0.36, GEAR.amber, 0, -0.55 - thick / 2, 0.04);
      for (let k = 0; k < 4; k++) gb(g, 0.24, 0.02, 0.04, GEAR.orangeDk, 0, -0.585 - thick, -0.1 + k * 0.08);   // lugs
    }
  });
}
// ---- Quick hands II and III: full-finger mechanic's work gloves over the blocky hand (the arm's last 0.13), in this
// run's colourway (GLOVE_COLS, player/look.js). Up (+y) is the back of the hand and the thumb's on the inside. Tier 2
// is the plain kind: a stretch-mesh back with the fingers' seams down it, dark synthetic-leather palm and fingertips,
// piping down the outer side and a wide wrist strap with its logo tab. Tier 3 is the armoured kind over the same glove:
// a moulded rubber knuckle guard, a pad on each finger, a plate over the back of the hand, a thumb guard, a padded palm
// and a rubber pull tab on the strap
const gloveMat = c => lookMats[c] || (lookMats[c] = lam(c));
function buildGloves(armoured, C) {
  const m = k => gloveMat(C[k]);
  [PM.armL, PM.armR].forEach((a, i) => {
    const g = gearItem(a, 0, 0, 0.47), inS = i ? -1 : 1;   // which way the thumb is (toward the body)
    gb(g, 0.154, 0.154, 0.096, m('palm'), 0, 0, 0.024);                                   // the glove: palm and fingertips
    gb(g, 0.132, 0.008, 0.07, m('back'), 0, 0.079, 0.011);                                // the mesh back, stopping short of the fingertips
    [-0.034, 0, 0.034].forEach(x => gb(g, 0.006, 0.004, 0.03, m('palm'), x, 0.084, 0.034));   // the seams between the fingers
    if (C.camo) [[-0.04, -0.012, 0.03, 0.022, 0], [0.022, -0.006, 0.038, 0.018, 1], [-0.012, 0.022, 0.032, 0.02, 2], [0.04, 0.03, 0.024, 0.016, 3], [-0.046, 0.032, 0.02, 0.014, 4]]
      .forEach(([x, z, w, d, k]) => gb(g, w, 0.003, d, gloveMat(C.camo[k]), x, 0.0845, z));
    gb(g, 0.004, 0.012, 0.09, m('accent'), -inS * 0.079, 0.05, 0.02);                    // piping down the outer side
    gb(g, 0.11, 0.006, 0.05, gloveMat(shade(C.palm, 1.18)), 0, -0.079, 0.006);            // the palm's reinforcement
    gb(g, 0.166, 0.166, 0.045, m('strap'), 0, 0, -0.045);                                 // the wrist strap
    gb(g, 0.034, 0.006, 0.022, m('tab'), inS * 0.03, 0.085, -0.045);                      // its logo tab
    if (!armoured) return;
    gb(g, 0.144, 0.022, 0.03, m('armor'), 0, 0.09, 0.03); gb(g, 0.146, 0.006, 0.008, m('accent'), 0, 0.103, 0.03);   // the knuckle guard and its ridge
    [-0.051, -0.017, 0.017, 0.051].forEach(x => gb(g, 0.026, 0.012, 0.02, m('armor'), x, 0.086, 0.058));           // a pad on each finger
    gb(g, 0.09, 0.012, 0.04, m('armor'), 0, 0.087, -0.006); gb(g, 0.05, 0.004, 0.012, m('accent'), 0, 0.095, -0.006);   // the plate over the back of the hand
    gb(g, 0.012, 0.045, 0.05, m('armor'), inS * 0.083, 0.02, 0.004);                     // the thumb guard
    gb(g, 0.1, 0.01, 0.045, gloveMat(shade(C.palm, 0.8)), 0, -0.081, 0.0);                // the palm pad
    gb(g, 0.05, 0.012, 0.04, m('armor'), -inS * 0.03, 0.088, -0.045);                               // the strap's rubber pull tab
  });
}
export function buildGear() {
  gearParts.forEach(m => m.parent && m.parent.remove(m)); gearParts.length = 0;
  setCharBloodDirty(true);   // the blood on you is laid again on the new gear next frame (effects/body-blood.js)
  // footwear (the look's own shoes hide under it)
  const bt = T('boots'), thick = S.slowRes > 0 ? 0.035 : 0;
  PBOOT.forEach(m => { m.visible = !(bt || thick); });
  bandPouch2.visible = !!S.pouch;
  // the helmet goes on instead of your hat; the night vision's head mount goes on under it (a cap turned round back to
  // front to make room for the tubes, as you would), all but a cowboy hat, which comes off for it
  const hatL = (LOOK.cur || {}).hat;
  LOOK.g.hat.visible = !S.stubborn && !(T('night') && hatL === 'cowboy'); LOOK.g.hat.rotation.y = T('night') && hatL === 'cap' ? Math.PI : 0;
  gearPieces();
}
// how high round the head the night vision's band goes under a hat that stays on: just below its edge
const NV_UNDER = { cap: 0.089, beanie: 0.066 };
// every item your upgrades put on you, onto whatever PM's parts are (yours, or for a moment a teammate's: gearOnAvatar)
function gearPieces() {
  buildArmor(T('armor'));
  const bt = T('boots'), thick = S.slowRes > 0 ? 0.035 : 0;
  if (bt || thick) buildBoots(bt, thick);
  // Vault fire: hard-shell knee pads on elastic straps
  if (S.vaultMul < 1) [PM.shinL, PM.shinR].forEach(l => {
    const g = gearItem(l, 0, -0.27 - KNEE_Y, 0); gb(g, 0.2, 0.14, 0.04, GEAR.black, 0, 0, 0.125); gb(g, 0.15, 0.1, 0.02, GEAR.foam, 0, 0, 0.152);
    [-0.05, 0.05].forEach(y => gb(g, 0.205, 0.022, 0.235, GEAR.dark, 0, y, 0));
  });
  // Quick hands: fingerless shooting gloves, a knuckle pad and a velcro wrist strap; then work gloves (buildGloves)
  const qh = T('quick');
  if (qh === 1) [PM.armL, PM.armR].forEach(a => {
    const g = gearItem(a, 0, 0, 0.47); gb(g, 0.158, 0.158, 0.1, GEAR.black, 0, 0, 0.01); gb(g, 0.11, 0.03, 0.06, GEAR.dark, 0, 0.08, 0.03); gb(g, 0.164, 0.164, 0.03, GEAR.olive, 0, 0, -0.04);
  });
  if (qh >= 2) buildGloves(qh === 3, GLOVE_COLS[(LOOK.cur && LOOK.cur.glove) || 'blackRed']);
  // eyes: wraparound shooting glasses, then night-vision goggles on a head mount (one tube, then two)
  if (T('night')) {
    // worn on the bare head (the hat comes off for it, buildGear) or on the Stubborn helmet: a band right round the head
    // with straps over the crown, a shroud on the front of it with an arm down to the tubes, and the battery pack
    // clipped to the back of it
    const g = gearItem(PM.head, 0, 0, 0), n2 = T('night') === 2, hel = !!S.stubborn, L = LOOK.cur || {};
    // under a cap or a beanie: just the band, round the hair just below the hat's edge (NV_UNDER: where its middle is),
    // closer in than the hat so nothing lies in the same place as any of it; the straps over the crown are under the hat
    const under = !hel && NV_UNDER[L.hat];
    if (under) {
      const by = NV_UNDER[L.hat], bh = 0.034, r = 0.171, th = 0.014;
      gb(g, 2 * r + th, bh, th, GEAR.black, 0, by, r); gb(g, 2 * r + th, bh, th, GEAR.black, 0, by, -r);
      [-1, 1].forEach(sd => gb(g, th, bh, 2 * r, GEAR.black, sd * r, by, 0));
    }
    else if (!hel) {
      // the hair the hat was hiding, so the straps sit on hair, not a bare scalp
      // (from just under where it stopped for the hat, HAT_TUCK in player/look.js, up over the crown, so it joins up)
      if (L.hat !== 'none' && L.hat !== 'bandana' && L.hairStyle !== 'bald') { const bz = L.hairStyle === 'buzz', t = bz ? 0.168 : 0.2, w = (bz ? HAIR_W.buzz : HAIR_W.hair) - 0.002; gb(g, w, t - 0.1, w, lam(L.hair ?? 0x3a2a1a), 0, (t + 0.1) / 2, 0); }
      const by = 0.125, bh = 0.04;
      gb(g, 0.4, bh, 0.026, GEAR.black, 0, by, 0.178); gb(g, 0.4, bh, 0.026, GEAR.black, 0, by, -0.2);            // the band, front and back
      [-1, 1].forEach(sd => gb(g, 0.026, bh, 0.404, GEAR.black, sd * 0.187, by, -0.011));                     // and its sides
      gb(g, 0.045, 0.018, 0.404, GEAR.black, 0, 0.214, -0.011); gb(g, 0.4, 0.018, 0.045, GEAR.black, 0, 0.214, -0.03);   // the straps over the crown
      gb(g, 0.045, 0.1, 0.018, GEAR.black, 0, 0.17, 0.186); gb(g, 0.045, 0.1, 0.018, GEAR.black, 0, 0.17, -0.208);       // down to the band, front and back
      [-1, 1].forEach(sd => gb(g, 0.018, 0.1, 0.045, GEAR.black, sd * 0.195, 0.17, -0.03));
      gb(g, 0.14, 0.024, 0.14, GEAR.foam, 0, 0.214, -0.02);                                                      // the crown pad under them
    }
    const fz = hel ? 0.222 : 0.2, tz = fz + 0.05, tx = n2 ? 0 : 0.07;
    gb(g, 0.1, 0.075, 0.02, GEAR.dark, 0, under ? NV_UNDER[L.hat] + 0.03 : 0.15, fz);                         // the shroud
    gb(g, 0.045, 0.1, 0.045, GEAR.steelDk, 0, 0.1, fz + 0.03);                                                  // the mount arm, down from it
    gb(g, n2 ? 0.18 : 0.125, 0.032, 0.05, GEAR.dark, n2 ? 0 : tx / 2, 0.06, tz);                                // the bridge the tubes hang from
    (n2 ? [-0.065, 0.065] : [tx]).forEach(x => {
      gc(g, 0.04, 0.11, GEAR.dark, x, 0.03, tz, 'z', 10); gc(g, 0.046, 0.025, GEAR.black, x, 0.03, tz + 0.06, 'z', 10); gc(g, 0.03, 0.005, GEAR.green, x, 0.03, tz + 0.074, 'z', 10);
    });
    const bz = hel ? -0.24 : -0.222;
    gb(g, 0.12, 0.07, 0.04, GEAR.dark, 0, 0.13, bz); gb(g, 0.04, 0.02, 0.01, GEAR.green, 0.03, 0.15, bz - 0.022);   // the battery pack at the back
  } else if (T('eyes')) {
    const g = gearItem(PM.head, 0, 0.035, 0);
    gb(g, 0.31, 0.026, 0.03, GEAR.dark, 0, 0.03, 0.172); [-1, 1].forEach(s => { gb(g, 0.13, 0.055, 0.012, GEAR.lens, s * 0.072, 0, 0.181); gb(g, 0.13, 0.008, 0.014, GEAR.lensDk, s * 0.072, -0.03, 0.18); });
    gb(g, 0.03, 0.02, 0.02, GEAR.dark, 0, -0.005, 0.185);   // the bridge
    [-1, 1].forEach(s => { gb(g, 0.016, 0.022, 0.3, GEAR.dark, s * 0.168, 0.02, 0.03); gb(g, 0.02, 0.04, 0.03, GEAR.dark, s * 0.168, 0.0, -0.11); });
  }
  if (T('eyes') >= 2) {   // a little rear-view mirror on a wire stalk off your hat (or hair)
    const g = gearItem(PM.head, 0.16, LOOK.mirrorY, -0.06);
    gb(g, 0.012, 0.012, 0.09, GEAR.steelDk, 0, 0, -0.03); gb(g, 0.07, 0.05, 0.014, GEAR.dark, 0, 0.01, -0.08); gb(g, 0.06, 0.04, 0.004, GEAR.steel, 0, 0.01, -0.088);
  }
  // the hammer line hangs on the belt at your right hip: a claw hammer, a framing hammer, then a nail gun in a holster
  const hm = T('hammer');
  if (hm === 1 || hm === 2) {
    const g = gearItem(PM.upper, 0.29, 0.58, 0.05), L = hm === 2 ? 0.34 : 0.26;
    gb(g, 0.05, 0.05, 0.05, GEAR.leatherDk, 0, 0.0, 0);                                                   // belt loop
    gb(g, 0.032, L, 0.03, hm === 2 ? GEAR.yellow : GEAR.wood, 0, -L / 2 + 0.08, 0); gb(g, 0.04, L * 0.4, 0.038, hm === 2 ? GEAR.black : GEAR.woodDk, 0, -L + 0.08 + L * 0.2, 0);
    const hy = 0.1; gb(g, 0.05, 0.05, hm === 2 ? 0.09 : 0.07, GEAR.steelDk, 0, hy, 0.03); gb(g, 0.054, 0.054, 0.03, GEAR.steel, 0, hy, hm === 2 ? 0.085 : 0.075);
    const cl = gb(g, 0.04, 0.03, 0.1, GEAR.steelDk, 0, hy + (hm === 2 ? 0 : 0.012), -0.055); cl.rotation.x = hm === 2 ? 0 : -0.45;   // the claw: curved on the claw hammer, a straight rip claw on the framer
    gb(g, 0.012, 0.03, 0.06, GEAR.black, 0, hy + 0.012, -0.08);   // the split
  }
  if (hm === 3) {
    // a framing nailer hung nose-down on a belt hook: the orange motor head, a steel nose, the handle running back to
    // the air fitting, and the nail strip slanting up from the nose to the end of the handle
    const g = gearItem(PM.upper, 0.315, 0.6, 0.04);
    gb(g, 0.05, 0.06, 0.04, GEAR.leatherDk, -0.01, 0.02, 0);                                                // the belt hook
    gb(g, 0.07, 0.12, 0.11, GEAR.orange, 0, -0.03, 0.03); gb(g, 0.074, 0.03, 0.115, GEAR.black, 0, 0.04, 0.03);   // the motor head and its cap
    gb(g, 0.072, 0.07, 0.02, GEAR.orangeDk, 0, -0.04, 0.09); gb(g, 0.004, 0.05, 0.06, GEAR.black, 0.037, -0.03, 0.03);   // the front plate, a vent stripe
    gb(g, 0.03, 0.11, 0.032, GEAR.steel, 0, -0.14, 0.06); gb(g, 0.038, 0.03, 0.04, GEAR.steelDk, 0, -0.205, 0.06);   // the nose and its contact tip
    gb(g, 0.045, 0.05, 0.15, GEAR.black, 0, -0.015, -0.09); gb(g, 0.05, 0.035, 0.07, GEAR.foam, 0, -0.015, -0.11);   // the handle and its rubber grip
    gb(g, 0.016, 0.035, 0.018, GEAR.steelDk, 0, -0.055, -0.035);                                            // the trigger
    gc(g, 0.014, 0.04, GEAR.brass, 0, -0.015, -0.18, 'z', 8);                                              // the air fitting
    const mag = new THREE.Group(); mag.position.set(0, -0.14, -0.04); mag.rotation.x = -0.62; g.add(mag);
    gb(mag, 0.036, 0.034, 0.2, GEAR.dark, 0, 0, -0.03); gb(mag, 0.038, 0.012, 0.16, GEAR.orange, 0, 0.022, -0.04);
    for (let k = 0; k < 7; k++) gb(mag, 0.026, 0.004, 0.004, GEAR.nail, 0, -0.019, -0.11 + k * 0.026);    // nail heads along the strip
  }
  // Iron stomach line: a canteen in a belt cover, with its cap on a chain
  if (S.healOnKill) {
    const g = gearItem(PM.upper, 0.285, 0.62, -0.15);
    gc(g, 0.065, 0.16, GEAR.olive, 0, 0, 0, null, 14); gc(g, 0.07, 0.03, GEAR.oliveDk, 0, -0.065, 0, null, 14); gc(g, 0.07, 0.025, GEAR.oliveDk, 0, 0.05, 0, null, 14);
    gc(g, 0.025, 0.04, GEAR.black, 0, 0.1, 0, null, 10); gb(g, 0.05, 0.05, 0.02, GEAR.oliveDk, -0.05, 0.08, 0);
  }
  // Painkillers: an orange pill bottle in the chest strap, white cap and label
  if (S.regen) { const g = gearItem(PM.upper, 0.12, 1.02, 0.18); gc(g, 0.028, 0.07, GEAR.pill, 0, 0, 0); gc(g, 0.031, 0.022, GEAR.white, 0, 0.045, 0); gc(g, 0.0292, 0.035, GEAR.label, 0, -0.006, 0); }
  // Adrenaline: a red armband with a syringe of adrenaline tucked into it
  if (S.adrenaline) {
    const g = gearItem(PM.armL, 0, 0, 0.2); gb(g, 0.17, 0.17, 0.06, GEAR.red, 0, 0, 0); gb(g, 0.174, 0.174, 0.012, GEAR.redDk, 0, 0, -0.03); gb(g, 0.174, 0.174, 0.012, GEAR.redDk, 0, 0, 0.03);
    gc(g, 0.012, 0.11, GEAR.white, 0.09, 0.03, 0, 'z', 8); gc(g, 0.009, 0.07, GEAR.amber, 0.09, 0.03, 0.01, 'z', 8); gc(g, 0.003, 0.04, GEAR.steel, 0.09, 0.03, 0.075, 'z', 6);
  }
  // Second wind: a red bandana knotted round your neck, a triangle hanging down the front, white dots
  if (S.secondWind) {
    const g = gearItem(PM.upper, 0, 1.13, 0);
    gb(g, 0.36, 0.06, 0.34, GEAR.red, 0, 0.02, 0); const tr = gb(g, 0.2, 0.14, 0.02, GEAR.red, 0, -0.06, 0.175); tr.rotation.z = Math.PI / 4; tr.scale.set(0.8, 0.8, 1);
    [[-0.1, 0.02], [0.08, 0.03], [0, -0.04], [0.12, -0.0], [-0.05, -0.08]].forEach(([x, y]) => gb(g, 0.018, 0.018, 0.006, GEAR.white, x, y, 0.19));
    gb(g, 0.06, 0.05, 0.05, GEAR.redDk, 0.05, 0.02, -0.18); gb(g, 0.03, 0.08, 0.02, GEAR.red, 0.07, -0.04, -0.195);   // the knot at the back
  }
  // Stubborn: a steel helmet with a cloth cover band, a rim, a chin strap and goggles over the brim
  if (S.stubborn) {
    const g = gearItem(PM.head, 0, 0.13, 0);
    gb(g, 0.4, 0.1, 0.42, GEAR.olive, 0, 0.04, -0.005); gb(g, 0.36, 0.06, 0.38, GEAR.olive, 0, 0.11, -0.005); gb(g, 0.26, 0.04, 0.28, GEAR.olive, 0, 0.155, -0.005);
    gb(g, 0.42, 0.025, 0.44, GEAR.oliveDk, 0, -0.01, -0.005); gb(g, 0.405, 0.035, 0.425, GEAR.oliveLt, 0, 0.07, -0.005);   // rim and cover band
    [-1, 1].forEach(s => gb(g, 0.012, 0.2, 0.03, GEAR.black, s * 0.17, -0.13, 0.04));                              // chin strap
    if (!T('night')) { gb(g, 0.3, 0.05, 0.04, GEAR.black, 0, 0.06, 0.21); [-1, 1].forEach(s => gb(g, 0.1, 0.035, 0.012, GEAR.lens, s * 0.065, 0.06, 0.232)); }   // goggles on the brim (the night vision's mount takes the front instead)
  }
  // Fleet-footed: a stopwatch clipped to the chest strap on its lanyard
  if (S.speedMul > 1.3) {
    const g = gearItem(PM.upper, -0.256, 0.88, 0.17);
    gc(g, 0.04, 0.02, GEAR.steel, 0, 0, 0, 'z', 14); gc(g, 0.032, 0.022, GEAR.white, 0, 0, 0.002, 'z', 14); gb(g, 0.002, 0.024, 0.024, GEAR.black, 0, 0.008, 0.012);
    gc(g, 0.01, 0.02, GEAR.steelDk, 0, 0.05, 0, null, 8); gb(g, 0.012, 0.12, 0.008, GEAR.red, 0.02, 0.11, -0.005);
  }
  // pull apart any flush faces, then fold each item into a mesh or two
  const pieces = []; gearParts.forEach(g => g.traverse(o => { if (o.isMesh) pieces.push(o); }));
  unfight(PM.g, { only: new Set(pieces) });
  gearList.forEach(g => mergeInto(g, finePieces(g)));
  trimShadows(PM.g);
}

// ---- co-op: a teammate's survivor in the gear they've earned. Your loadout carries what decides it (gearSpec: the
// tiers and the perks the items come from); their game builds the same items onto their survivor with the same code,
// their tiers and perks, look and weapons standing in for yours while it runs (net/avatars.js)
const GEAR_T = ['armor', 'boots', 'night', 'quick', 'eyes', 'hammer'], GEAR_S = ['pouch', 'slowRes', 'stubborn', 'vaultMul', 'healOnKill', 'regen', 'adrenaline', 'secondWind', 'speedMul'];
const GEAR_PM = ['g', 'upper', 'torso', 'head', 'armL', 'armR', 'shinL', 'shinR'];
export function gearSpec() { const t = {}, s = {}; GEAR_T.forEach(k => { t[k] = T(k) | 0; }); GEAR_S.forEach(k => { s[k] = S[k]; }); return { t, s }; }
export function gearOnAvatar(a, spec, slots, L) {
  (a.gear || []).forEach(g => g.parent && g.parent.remove(g)); a.gear = [];
  if (!spec) return;
  const keep = { S, W8, cur: LOOK.cur, y: LOOK.mirrorY, pm: {} };
  try {
    setS(Object.assign({}, S, spec.s, { tier: Object.assign({}, S.tier, spec.t) })); setW8(Object.assign({}, W8, { slot: slots || {} }));
    LOOK.cur = L; LOOK.mirrorY = a.mirrorY ?? 0.214; gearList = a.gear;
    GEAR_PM.forEach(k => { keep.pm[k] = PM[k]; PM[k] = a[k]; });
    gearPieces();
  } catch (e) { console.warn('teammate gear', e); }
  finally { setS(keep.S); setW8(keep.W8); LOOK.cur = keep.cur; LOOK.mirrorY = keep.y; gearList = gearParts; GEAR_PM.forEach(k => { PM[k] = keep.pm[k]; }); }
  // what the gear covers: their shoes under boots, their hat under the helmet or the night vision's mount
  const t = spec.t, s = spec.s;
  if (a.shoes) a.shoes.forEach(o => { o.visible = !(t.boots || s.slowRes > 0); });
  if (a.hat) a.hat.visible = !s.stubborn && !t.night;
  if (a.pouch2) a.pouch2.visible = !!s.pouch;
}
