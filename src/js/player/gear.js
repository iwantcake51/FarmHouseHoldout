// Character gear that shows up from body upgrades: armour, footwear, knee pads, gloves, eyewear, the hammer line,
// the canteen, pills, armband, bandana, helmet and stopwatch.
//
// Each item is built from small pieces in its own group on the body part it rides on; once everything is placed, the
// pieces are pulled apart where they'd z-fight and each item is merged into a mesh or two (core/geometry.js).

const gearParts = [];
const GEAR = {
  leather: lam(0x4a3524), leatherDk: lam(0x33241a), leatherLt: lam(0x6a4c32), sole: lam(0x1e1a16), solePale: lam(0xd8d0c0), lace: lam(0x2a2018),
  white: lam(0xd8d2c4), offWhite: lam(0xbcb6a8), red: lam(0xb8382a), redDk: lam(0x8a2a20), blue: lam(0x34607e), blueDk: lam(0x24465e), amber: lam(0xe0a030),
  olive: lam(0x4a5236), oliveDk: lam(0x363c28), oliveLt: lam(0x5e6844), coyote: lam(0x8a7656), coyoteDk: lam(0x6a5a40), dark: lam(0x24262a), black: lam(0x161718),
  green: basic(0x7cf08a), lens: basic(0xe8c25a), lensDk: lam(0x6a4a14), orange: lam(0xd06a2a), orangeDk: lam(0xa04e1c), steel: lam(0x8a8d90), steelDk: lam(0x55585c),
  wood: lam(0x7a5434), woodDk: lam(0x5a3e26), yellow: lam(0xd8b030), canvas: lam(0x7a6a4a), canvasDk: lam(0x5e5036), cord: lam(0x4a3a24), brass: lam(0xb08a3a),
  pill: lam(0xd8742a), label: lam(0xe8e2d0), nail: lam(0xa8a8a0), foam: lam(0x3a3c40)
};
// a group on a body part, holding one item's pieces
function gearItem(part, x, y, z) { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); part.add(g); gearParts.push(g); return g; }
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
    // soft armour: front and back panels, shoulder straps, velcro side flaps, a name-tape patch and a light on the chest
    const g = gearItem(PM.torso), vest = ar >= 3 ? GEAR.coyote : GEAR.oliveDk, vestDk = ar >= 3 ? GEAR.coyoteDk : GEAR.black;
    gb(g, 0.54, 0.46, 0.05, vest, 0, -0.02, 0.165); gb(g, 0.54, 0.5, 0.05, vest, 0, 0.0, -0.165);
    [-1, 1].forEach(s => { gb(g, 0.11, 0.05, 0.36, vest, s * 0.15, 0.315, 0); gb(g, 0.02, 0.3, 0.32, vestDk, s * 0.255, -0.06, 0); gb(g, 0.024, 0.12, 0.24, vest, s * 0.258, -0.06, 0); });   // straps over the shoulders, side flaps
    gb(g, 0.5, 0.06, 0.06, vestDk, 0, -0.24, 0.17);                                                   // the hem binding
    gb(g, 0.16, 0.05, 0.012, GEAR.offWhite, -0.12, 0.13, 0.196); gb(g, 0.1, 0.06, 0.012, vestDk, 0.13, 0.13, 0.196);   // name tape, velcro
    if (ar === 2) { gb(g, 0.05, 0.08, 0.04, GEAR.black, 0.16, 0.0, 0.205); gb(g, 0.03, 0.03, 0.01, GEAR.amber, 0.16, 0.02, 0.229); }   // a clip light
  }
  if (ar >= 3) {
    // the plate carrier over it: thick chamfered plates front and back, three magazine pouches across the belly,
    // an admin pouch, padded shoulders, side plates, a drag handle and rows of webbing
    const g = gearItem(PM.torso), c = GEAR.coyote, cd = GEAR.coyoteDk;
    gb(g, 0.42, 0.38, 0.06, c, 0, 0.02, 0.215); gb(g, 0.36, 0.32, 0.016, cd, 0, 0.04, 0.249);
    gb(g, 0.42, 0.4, 0.06, c, 0, 0.03, -0.215);
    for (let k = 0; k < 3; k++) { gb(g, 0.38, 0.016, 0.012, cd, 0, -0.06 + k * 0.08, 0.258); gb(g, 0.38, 0.016, 0.012, cd, 0, -0.04 + k * 0.08, -0.25); }
    for (let k = 0; k < 3; k++) { const x = -0.13 + k * 0.13; gb(g, 0.11, 0.15, 0.07, c, x, -0.18, 0.25); gb(g, 0.112, 0.05, 0.075, cd, x, -0.12, 0.252); gb(g, 0.06, 0.07, 0.008, GEAR.black, x, -0.2, 0.289); }
    gb(g, 0.16, 0.1, 0.04, cd, 0, 0.16, 0.262);                                                       // admin pouch
    [-1, 1].forEach(s => { gb(g, 0.13, 0.06, 0.46, cd, s * 0.15, 0.335, 0); gb(g, 0.03, 0.24, 0.26, c, s * 0.262, -0.04, 0); });
    gb(g, 0.16, 0.035, 0.04, GEAR.black, 0, 0.25, -0.26); [-1, 1].forEach(s => gb(g, 0.03, 0.06, 0.03, GEAR.black, s * 0.07, 0.22, -0.258));   // drag handle
    gb(g, 0.06, 0.13, 0.05, GEAR.black, -0.2, 0.0, 0.275); gc(g, 0.006, 0.12, GEAR.black, -0.2, 0.12, 0.27);   // a radio and its antenna
  }
}
// ---- footwear: good leather work boots, then white running shoes, then trail runners; Thick soles builds the sole up
function buildBoots(bt, thick) {
  [PM.legL, PM.legR].forEach((l, i) => {
    const g = gearItem(l, 0, 0, 0.05), sole = thick ? 0.04 + thick : 0.04;
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
function buildGear() {
  gearParts.forEach(m => m.parent && m.parent.remove(m)); gearParts.length = 0;
  charBloodDirty = true;   // the blood on you is laid again on the new gear next frame (effects/body-blood.js)
  buildArmor(T('armor'));
  // footwear (the look's own shoes hide under it)
  const bt = T('boots'), thick = S.slowRes > 0 ? 0.035 : 0;
  PBOOT.forEach(m => { m.visible = !(bt || thick); });
  bandPouch2.visible = !!S.pouch;
  LOOK.g.hat.visible = !(S.slowRes >= 0.85);   // the helmet goes on instead of your hat
  if (bt || thick) buildBoots(bt, thick);
  // Light feet: hard-shell knee pads on elastic straps
  if (S.vaultMul < 1) [PM.legL, PM.legR].forEach(l => {
    const g = gearItem(l, 0, -0.27, 0); gb(g, 0.2, 0.14, 0.04, GEAR.black, 0, 0, 0.125); gb(g, 0.15, 0.1, 0.02, GEAR.foam, 0, 0, 0.152);
    [-0.05, 0.05].forEach(y => gb(g, 0.205, 0.022, 0.235, GEAR.dark, 0, y, 0));
  });
  // Quick hands: fingerless shooting gloves, a knuckle pad and a velcro wrist strap
  if (S.reloadMul < 1) [PM.armL, PM.armR].forEach(a => {
    const g = gearItem(a, 0, 0, 0.47); gb(g, 0.158, 0.158, 0.1, GEAR.black, 0, 0, 0.01); gb(g, 0.11, 0.03, 0.06, GEAR.dark, 0, 0.08, 0.03); gb(g, 0.164, 0.164, 0.03, GEAR.olive, 0, 0, -0.04);
  });
  // eyes: wraparound shooting glasses, then night-vision goggles on a head mount (one tube, then two)
  if (T('night')) {
    const g = gearItem(PM.head, 0, 0, 0), n2 = T('night') === 2;
    gb(g, 0.34, 0.04, 0.34, GEAR.black, 0, 0.12, 0); gb(g, 0.04, 0.2, 0.33, GEAR.black, 0, 0.17, -0.005);   // the head harness
    gb(g, 0.1, 0.08, 0.05, GEAR.dark, 0, 0.13, 0.19); gb(g, 0.04, 0.06, 0.06, GEAR.steelDk, 0, 0.08, 0.22);  // the mount
    (n2 ? [-0.065, 0.065] : [0.07]).forEach(x => {
      gc(g, 0.04, 0.11, GEAR.dark, x, 0.03, 0.25, 'z', 10); gc(g, 0.046, 0.025, GEAR.black, x, 0.03, 0.31, 'z', 10); gc(g, 0.03, 0.005, GEAR.green, x, 0.03, 0.324, 'z', 10);
    });
    if (n2) gb(g, 0.13, 0.03, 0.03, GEAR.dark, 0, 0.06, 0.24);
    gb(g, 0.12, 0.07, 0.05, GEAR.dark, 0, 0.04, -0.185); gb(g, 0.04, 0.02, 0.01, GEAR.green, 0.03, 0.06, -0.211);   // the battery pack at the back
  } else if (T('eyes')) {
    const g = gearItem(PM.head, 0, 0.035, 0);
    gb(g, 0.31, 0.026, 0.03, GEAR.dark, 0, 0.03, 0.172); [-1, 1].forEach(s => { gb(g, 0.13, 0.055, 0.012, GEAR.lens, s * 0.072, 0, 0.181); gb(g, 0.13, 0.008, 0.014, GEAR.lensDk, s * 0.072, -0.03, 0.18); });
    gb(g, 0.03, 0.02, 0.02, GEAR.dark, 0, -0.005, 0.185);   // the bridge
    [-1, 1].forEach(s => { gb(g, 0.016, 0.022, 0.3, GEAR.dark, s * 0.168, 0.02, 0.03); gb(g, 0.02, 0.04, 0.03, GEAR.dark, s * 0.168, 0.0, -0.11); });
  }
  if (T('eyes') >= 3) {   // a little rear-view mirror on a wire stalk off your hat (or hair)
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
  if (S.slowRes >= 0.85) {
    const g = gearItem(PM.head, 0, 0.13, 0);
    gb(g, 0.4, 0.1, 0.42, GEAR.olive, 0, 0.04, -0.005); gb(g, 0.36, 0.06, 0.38, GEAR.olive, 0, 0.11, -0.005); gb(g, 0.26, 0.04, 0.28, GEAR.olive, 0, 0.155, -0.005);
    gb(g, 0.42, 0.025, 0.44, GEAR.oliveDk, 0, -0.01, -0.005); gb(g, 0.405, 0.035, 0.425, GEAR.oliveLt, 0, 0.07, -0.005);   // rim and cover band
    [-1, 1].forEach(s => gb(g, 0.012, 0.2, 0.03, GEAR.black, s * 0.17, -0.13, 0.04));                              // chin strap
    gb(g, 0.3, 0.05, 0.04, GEAR.black, 0, 0.06, 0.21); [-1, 1].forEach(s => gb(g, 0.1, 0.035, 0.012, GEAR.lens, s * 0.065, 0.06, 0.232));   // goggles on the brim
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
  gearParts.forEach(g => mergeInto(g, finePieces(g)));
}
