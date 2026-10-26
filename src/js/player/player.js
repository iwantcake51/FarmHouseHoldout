// Player state (P) and the parts of the player model that never change: the belt, the backpack and the bandage pouches.
// The survivor's look (face, hair, hat, clothes, shoes) is dealt fresh each run in player/look.js.

import { scene } from '../core/renderer.js';
import { outline } from '../effects/screen-outlines.js';
import { lam } from '../core/shaders.js';
import { blobShadow, box, finePieces, mergeInto, trimShadows, unfight } from '../core/geometry.js';
import { cxw } from '../world/grid.js';
import { human } from '../characters/rig.js';

export const P = { stam: 1, exh: false, stamT: 9, x: cxw(21), z: cxw(22), hp: 100, aim: Math.PI, phase: 0, moving: false, vault: null, slow: 0, stun: 0, adr: 0, still: 0, vx: 0, vz: 0 };
export const PM = human(0xd2a07c, 0x4e5a3c, 0x2f3238);
scene.add(PM.g);
// knees: the survivor's legs are cut at the knee (KNEE_Y below the hip) and the shin hung from it, so a stride lifts
// its heel and a sprint kicks it up behind (the zombies keep their straight legs). The shins carry whatever's below the
// knee: the shoes (player/look.js), boots and knee pads (player/gear.js). The thigh runs a touch past the knee so no gap
// opens at its back when it bends
export const KNEE_Y = -0.27;
{
  const thigh = new THREE.BoxGeometry(0.19, 0.29, 0.22).translate(0, -0.145, 0), shin = new THREE.BoxGeometry(0.184, 0.28, 0.214).translate(0, -0.14, 0);
  ['L', 'R'].forEach(s => { const leg = PM['leg' + s], m = new THREE.Mesh(shin, leg.material); leg.geometry = thigh; m.position.y = KNEE_Y; m.castShadow = true; leg.add(m); PM['shin' + s] = m; });
}
const SURV = { belt: lam(0x2e241a), brass: lam(0xb08a3a), sole: lam(0x1e1a16) };
PM.mats.shirtDk = lam(0x3e4830);   // seams, collar and cuffs; coloured with the shirt (player/look.js, and build-weapons.js for the jacket)
PM.mats.skinDk = lam(0xb88762);    // ears and nose, a shade darker than the skin
// the backpack's cloth and bedroll, recoloured with each run's look
export const PACK = { canvas: lam(0x5a4a34), canvasDk: lam(0x463928), canvasLt: lam(0x6e5c40), roll: lam(0x7a3a2a) };
// the backpack hangs from the tops of its shoulder straps (packPivot) so it can swing on its own (updatePack,
// player/stow.js); packBody inside it is laid out in the upper body's own coordinates, so anything strapped to the pack
// (the planks, slung guns, the melee weapon) is placed just as if it were on the upper body
export const PACK_PIV = [0, 1.17, -0.16], packPivot = new THREE.Group(), packBody = new THREE.Group();
packPivot.position.set(...PACK_PIV); packBody.position.set(-PACK_PIV[0], -PACK_PIV[1], -PACK_PIV[2]);
PM.upper.add(packPivot); packPivot.add(packBody);
{
  const sil = m => { m.userData.sil = true; return m; }, TO = PM.torso, xc = (g, r, len, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  // the belt and its brass buckle
  box(TO, 0.52, 0.07, 0.32, SURV.belt, 0, -0.27, 0); box(TO, 0.08, 0.06, 0.02, SURV.brass, 0, -0.27, 0.165); box(TO, 0.04, 0.03, 0.022, SURV.belt, 0, -0.27, 0.167);
  // the backpack: a rucksack of padded canvas, its body and lid and pouches soft, rounded slabs (packPad: an outline with
  // rounded corners pushed out with rounded edges, never a sharp box) rather than crates; a lid over the top with its
  // buckled straps down the back, a zip round the back panel and three rows of webbing across it (all a few millimetres
  // proud, under where the planks and slung guns ride: the back face stays flat at z -0.33), compression straps with
  // ladder buckles down each side, a mesh pocket with a steel bottle on the right and a zipped one on the left, a
  // rounded pouch under it, a grab loop on top and the bedroll strapped under the lid with two cinch straps. The
  // harness is on you: padded shoulder straps over the shoulders and down your front, their webbing tails and buckles
  // below, and a sternum strap with its clip across them. The pack itself, with everything on it, is on packBody
  const U = PM.upper, B = packBody, { canvas, canvasDk, canvasLt, roll } = PACK, web = lam(0x2c2620), steel = lam(0x8a8d90), clip = lam(0x1a1a1b), zip = lam(0x3a3430);
  const rrect = (w, h, r) => { const sh = new THREE.Shape(), x = w / 2, y = h / 2; sh.moveTo(-x + r, -y); sh.lineTo(x - r, -y); sh.quadraticCurveTo(x, -y, x, -y + r); sh.lineTo(x, y - r); sh.quadraticCurveTo(x, y, x - r, y); sh.lineTo(-x + r, y); sh.quadraticCurveTo(-x, y, -x, y - r); sh.lineTo(-x, -y + r); sh.quadraticCurveTo(-x, -y, -x + r, -y); return sh; };
  // w x h across the back, d deep (z), corners rounded r, edges rounded bev; at x, y, z (its middle)
  const packPad = (g, w, h, d, r, bev, mat, x, y, z) => {
    const geo = new THREE.ExtrudeGeometry(rrect(w - 2 * bev, h - 2 * bev, Math.max(0.002, r - bev)), { depth: Math.max(0.001, d - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 5 });
    geo.translate(0, 0, -(d - 2 * bev) / 2); const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  sil(packPad(B, 0.42, 0.46, 0.18, 0.06, 0.024, canvas, 0, 0.93, -0.24));                        // the body
  sil(packPad(B, 0.44, 0.085, 0.205, 0.04, 0.02, canvasDk, 0, 1.15, -0.245));                    // the lid
  packPad(B, 0.34, 0.11, 0.016, 0.03, 0.006, canvasDk, 0, 1.08, -0.334);                         // its flap down the back
  // the zip round the back panel, and the webbing rows across it (bar-tacked every few centimetres)
  [[0, 1.0, 0.3, 0.004], [0, 0.71, 0.3, 0.004]].forEach(([x, y, w, h]) => box(B, w, h, 0.003, zip, x, y, -0.3315));
  [-1, 1].forEach(sd => box(B, 0.004, 0.29, 0.003, zip, sd * 0.15, 0.855, -0.3315));
  [0.78, 0.84, 0.9].forEach(y => { box(B, 0.3, 0.022, 0.004, web, 0, y, -0.332); for (let k = -2; k <= 2; k++) box(B, 0.004, 0.024, 0.005, canvasDk, k * 0.07, y, -0.333); });
  [-1, 1].forEach(sd => {
    // the lid's straps down the back to their buckles
    box(B, 0.03, 0.2, 0.004, web, sd * 0.1, 1.05, -0.343); box(B, 0.042, 0.032, 0.01, clip, sd * 0.1, 0.95, -0.344);
    // compression straps across each side, with their ladder buckles
    [0.8, 1.02].forEach(y => { box(B, 0.004, 0.024, 0.17, web, sd * 0.211, y, -0.24); box(B, 0.008, 0.03, 0.026, clip, sd * 0.213, y, -0.3); });
    // the shoulder straps: padded, over the top of each shoulder and down your front, a webbing tail on from their foot
    // through a ladder buckle, its loose end hanging
    packPad(U, 0.066, 0.026, 0.33, 0.012, 0.008, web, sd * 0.15, 1.172, -0.005);
    packPad(U, 0.068, 0.34, 0.024, 0.022, 0.008, web, sd * 0.15, 1.0, 0.162);
    box(U, 0.032, 0.12, 0.006, web, sd * 0.15, 0.77, 0.155); box(U, 0.044, 0.026, 0.012, clip, sd * 0.15, 0.82, 0.16); box(U, 0.03, 0.05, 0.005, web, sd * 0.15 + sd * 0.012, 0.79, 0.163).rotation.z = sd * 0.12;
  });
  // the sternum strap across the shoulder straps and its two-piece clip
  box(U, 0.25, 0.02, 0.008, web, 0, 1.03, 0.176); box(U, 0.05, 0.03, 0.014, clip, -0.012, 1.03, 0.178); box(U, 0.024, 0.022, 0.012, clip, 0.024, 1.03, 0.178);
  // side pockets: mesh on the right with the bottle in it, zipped on the left
  packPad(B, 0.05, 0.15, 0.12, 0.02, 0.012, canvasLt, 0.233, 0.83, -0.245);
  packPad(B, 0.046, 0.17, 0.12, 0.02, 0.012, canvasLt, -0.231, 0.85, -0.245); box(B, 0.003, 0.15, 0.003, zip, -0.2545, 0.86, -0.26);
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.15, 12), steel); bottle.position.set(0.235, 0.96, -0.245); bottle.castShadow = true; B.add(bottle);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10), web); cap.position.y = 0.09; bottle.add(cap);
  // the pouch under it, its zip and pull
  sil(packPad(B, 0.38, 0.15, 0.15, 0.05, 0.02, canvasLt, 0, 0.64, -0.25)); box(B, 0.28, 0.004, 0.003, zip, 0, 0.67, -0.3255); box(B, 0.012, 0.03, 0.004, steel, 0.12, 0.655, -0.327);
  // the grab loop on top of the lid
  box(B, 0.06, 0.006, 0.02, web, 0, 1.196, -0.18); [-1, 1].forEach(sd => box(B, 0.006, 0.02, 0.02, web, sd * 0.03, 1.19, -0.18));
  // the bedroll, strapped on top under the lid's overhang: the roll, its rolled-up ends a shade darker, and two cinch straps round it
  sil(xc(B, 0.07, 0.4, roll, 0, 1.255, -0.25));
  [-1, 1].forEach(sd => { xc(B, 0.055, 0.004, canvasDk, sd * 0.2, 1.255, -0.25); xc(B, 0.073, 0.026, web, sd * 0.12, 1.255, -0.25); });
  // fold the small pieces into one mesh per material on the torso, the upper body and the pack
  const rig = new Set([PM.torso, PM.head, PM.armL, PM.armR, PM.legL, PM.legR, PM.shinL, PM.shinR]);
  unfight(PM.g, { fixed: rig });
  const live = { live: new Set([PM.mats.shirt, PM.mats.shirtDk, PM.mats.skin, PM.mats.skinDk, PM.mats.pants, ...Object.values(PACK)]) };   // recoloured at runtime (a new look: player/look.js), so kept out of the baked colours
  mergeInto(TO, finePieces(TO, rig), live); mergeInto(U, finePieces(U, new Set([...rig, packPivot])), live); mergeInto(B, finePieces(B, rig), live);
  trimShadows(PM.g);
}
const armorG = new THREE.Group();
PM.upper.add(armorG);
export const pBlob = blobShadow(1.15, 0.38);
// bandage rolls standing in pouches, one per bandage in the bag, their tops showing: three in the pouch at your left side,
// and two more in the second pouch on the front of your belt that comes with the Med pouch upgrade (player/gear.js shows it).
// Each pouch has a plain red cross on its outer face.
export const bandRolls = [], bandPouch2 = new THREE.Group();
{
  const roll = new THREE.CylinderGeometry(0.036, 0.036, 0.07, 10), white = lam(0xeae4d6), red = lam(0xb3261c), canvas = lam(0x6a5a40), seam = lam(0x4a3e2c), redX = lam(0xd2301f);
  const addRoll = (g, x, y, z) => {
    const m = new THREE.Mesh(roll, white); m.position.set(x, y, z); m.castShadow = true; g.add(m);
    box(m, 0.024, 0.072, 0.007, red, 0, 0, 0); box(m, 0.007, 0.072, 0.024, red, 0, 0, 0);   // a little red cross on the top
    m.visible = false; bandRolls.push(m);
  };
  // a red cross laid on a face: n is the face's outward axis ('x' or 'z'), s its sign, at is where the face is
  const crossOn = (g, n, sg, at, y, c) => {
    const p = at + sg * 0.003;
    if (n === 'x') { box(g, 0.006, 0.086, 0.028, redX, p, y, c); box(g, 0.006, 0.028, 0.086, redX, p, y, c); }
    else { box(g, 0.028, 0.086, 0.006, redX, c, y, p); box(g, 0.086, 0.028, 0.006, redX, c, y, p); }
  };
  // on the torso, so it stays in one spot on your left side rather than turning with your hips
  const pouch = new THREE.Group(); pouch.position.set(-0.275, 0.64, 0.02); PM.upper.add(pouch);
  box(pouch, 0.074, 0.12, 0.254, canvas, -0.009, -0.01, 0); box(pouch, 0.078, 0.014, 0.258, seam, -0.009, 0.046, 0);   // the pouch and its rim
  crossOn(pouch, 'x', -1, -0.046, -0.012, 0);
  [0.08, 0, -0.08].forEach(z => addRoll(pouch, -0.009, 0.06, z));
  // the second pouch rides on the belt to the right of the buckle, cross facing out
  bandPouch2.position.set(0.13, 0.6, 0.175); bandPouch2.visible = false; PM.upper.add(bandPouch2);
  box(bandPouch2, 0.17, 0.11, 0.078, canvas, 0, -0.01, 0.012); box(bandPouch2, 0.174, 0.014, 0.082, seam, 0, 0.041, 0.012);
  crossOn(bandPouch2, 'z', 1, 0.051, -0.014, 0);
  [-0.045, 0.045].forEach(x => addRoll(bandPouch2, x, 0.055, 0.012));
}
// the upper body is built the other way round and drawn mirrored (its x flipped), so its own left is your left: the
// rig's armR is your right arm, the gun's in your right hand at your right shoulder and the left hand supports it,
// and every pose of the arms and the weapon comes out right-handed. Anything placed on it from the world's point of
// view turns the other way for it (the head's look, the pack's swing: player/animation.js, player/stow.js), and the
// guns themselves are flipped back in their holds so they aren't built backwards (weapons/build-weapons.js: FLIP)
PM.upper.scale.x = -1;
// a copy of you as you stand now, before your look, your gear and your weapons go on: a co-op teammate's survivor is
// built from it (net/avatars.js), the rig's parts found again by these names
['g', 'upper', 'lower', 'torso', 'head', 'armL', 'armR', 'legL', 'legR', 'shinL', 'shinR'].forEach(k => { PM[k].name = 'pm.' + k; });
packPivot.name = 'pm.pack';
export const PM_BASE = PM.g.clone(true), PM_BASE_SRC = []; PM.g.traverse(o => PM_BASE_SRC.push(o));   // (in the same order as the copy's own traverse: a part of yours to its part of theirs)
// a barely-there light rim round your own character, just enough to pick yourself out in the dark or in a crowd
export const pOutline = outline(PM.g, 0xf2e8d0, 0, 0.01, null, o => !o.userData.fine); pOutline.opacity = 0.1; pOutline.depthWrite = false;
