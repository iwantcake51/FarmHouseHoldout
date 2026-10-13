// Player state (P), the player model, backpack and cap.

const P = { stam: 1, exh: false, stamT: 9, x: cxw(21), z: cxw(22), hp: 100, aim: Math.PI, phase: 0, moving: false, vault: null, slow: 0, stun: 0, adr: 0, still: 0, vx: 0, vz: 0 };
const PM = human(0xd2a07c, 0x4e5a3c, 0x2f3238);
scene.add(PM.g);
// the survivor's look, all blocky pieces on the shared rig: a face, a worn cap, a work shirt, belt and boots
const SURV = {
  hair: lam(0x3a2a1e), skinDk: lam(0xb88762), eye: lam(0x221c18), cap: lam(0xc4612a), capDk: lam(0x8e4220), patch: lam(0xe6d6b0),
  belt: lam(0x2e241a), brass: lam(0xb08a3a), boot: lam(0x3e2e22), sole: lam(0x1e1a16), lace: lam(0x8a7a5a), patchP: lam(0x454a52)
};
PM.mats.shirtDk = lam(0x3e4830);   // seams, collar and cuffs; build-weapons.js recolours it with the shirt
// the survivor's skin tone is dealt fresh for every run, from light to deep; ears and nose take a shade darker
const SKIN_TONES = [0xf2cfae, 0xe3b48f, 0xd2a07c, 0xbd8761, 0x9c6a46, 0x7a4e32, 0x5a3824];
function rollLook() { const c = pick(SKIN_TONES); PM.mats.skin.color.setHex(c); SURV.skinDk.color.setHex(c).multiplyScalar(0.86); }
const PBOOT = [];
{
  const sil = m => { m.userData.sil = true; return m; }, H = PM.head, TO = PM.torso, xc = (g, r, len, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  // face: eyes, brows, a nose, ears, stubble and the hair showing under the cap
  [-1, 1].forEach(s => {
    box(H, 0.05, 0.05, 0.02, SURV.eye, s * 0.075, 0.03, 0.163);
    box(H, 0.08, 0.022, 0.02, SURV.hair, s * 0.075, 0.078, 0.165).rotation.z = s * -0.12;
    box(H, 0.03, 0.08, 0.07, SURV.skinDk, s * 0.172, 0.0, -0.01);
    box(H, 0.012, 0.12, 0.1, SURV.hair, s * 0.166, 0.03, -0.077);
  });
  box(H, 0.05, 0.06, 0.04, SURV.skinDk, 0, -0.03, 0.178);
  box(H, 0.3, 0.07, 0.024, SURV.hair, 0, -0.122, 0.166); box(H, 0.1, 0.02, 0.026, SURV.skinDk, 0, -0.102, 0.168);   // stubble round a mouth
  box(H, 0.33, 0.13, 0.05, SURV.hair, 0, 0.05, -0.15);
  // cap: crown, band, a little button on top, a patch on the front and a brim tipped down a touch
  sil(box(H, 0.35, 0.1, 0.36, SURV.cap, 0, 0.17, -0.005));
  box(H, 0.355, 0.026, 0.365, SURV.capDk, 0, 0.126, -0.005);
  box(H, 0.06, 0.024, 0.06, SURV.capDk, 0, 0.23, -0.005);
  box(H, 0.11, 0.06, 0.012, SURV.patch, 0, 0.172, 0.178);
  const brim = sil(box(H, 0.3, 0.032, 0.17, SURV.cap, 0, 0.128, 0.255)); brim.rotation.x = 0.14;
  box(brim, 0.294, 0.008, 0.164, SURV.capDk, 0, -0.019, 0);
  // shirt: collar, a button placket, a chest pocket, short sleeves with rolled cuffs, and a belt with a brass buckle
  [-1, 1].forEach(s => box(TO, 0.12, 0.04, 0.08, PM.mats.shirtDk, s * 0.07, 0.295, 0.125).rotation.y = s * 0.35);
  box(TO, 0.05, 0.5, 0.016, PM.mats.shirtDk, 0, 0.0, 0.157);
  for (let k = 0; k < 4; k++) box(TO, 0.022, 0.022, 0.012, SURV.patch, 0, 0.19 - k * 0.12, 0.168);
  box(TO, 0.085, 0.085, 0.016, PM.mats.shirtDk, -0.07, 0.03, 0.157); box(TO, 0.09, 0.022, 0.018, PM.mats.shirt, -0.07, 0.07, 0.161);
  [PM.armL, PM.armR].forEach(a => { box(a, 0.156, 0.156, 0.16, PM.mats.shirt, 0, 0, 0.05); box(a, 0.168, 0.168, 0.04, PM.mats.shirtDk, 0, 0, 0.13); });
  box(TO, 0.52, 0.07, 0.32, SURV.belt, 0, -0.27, 0); box(TO, 0.08, 0.06, 0.02, SURV.brass, 0, -0.27, 0.165); box(TO, 0.04, 0.03, 0.022, SURV.belt, 0, -0.27, 0.167);
  // trousers: a knee patch, a cargo pocket on the left thigh, and laced work boots
  box(PM.legL, 0.012, 0.13, 0.12, PM.mats.pants, -0.1, -0.2, 0.0); box(PM.legL, 0.016, 0.03, 0.13, SURV.patchP, -0.101, -0.14, 0.0);
  box(PM.legR, 0.11, 0.09, 0.012, SURV.patchP, 0.01, -0.28, 0.114);
  // (gear.js hides these when you've upgraded your footwear)
  [PM.legL, PM.legR].forEach(l => {
    PBOOT.push(box(l, 0.2, 0.1, 0.27, SURV.boot, 0, -0.495, 0.03), box(l, 0.205, 0.035, 0.28, SURV.sole, 0, -0.54, 0.032),
      box(l, 0.11, 0.012, 0.09, SURV.lace, 0, -0.444, 0.1), box(l, 0.204, 0.025, 0.232, SURV.boot, 0, -0.445, 0.0));
  });
  // the backpack: canvas body, a lid with buckled straps, side pockets with a bottle, a bottom pouch,
  // a bedroll on top and shoulder straps over the front. The back face stays at z -0.33, where the planks and slung guns ride.
  const U = PM.upper, canvas = lam(0x5a4a34), canvasDk = lam(0x463928), canvasLt = lam(0x6e5c40), web = lam(0x2c2620), roll = lam(0x7a3a2a), steel = lam(0x8a8d90);
  sil(box(U, 0.42, 0.44, 0.18, canvas, 0, 0.93, -0.24));
  sil(box(U, 0.44, 0.08, 0.21, canvasDk, 0, 1.15, -0.245));
  box(U, 0.32, 0.13, 0.02, canvasDk, 0, 1.06, -0.343);
  [-1, 1].forEach(s => {
    box(U, 0.04, 0.24, 0.012, web, s * 0.1, 1.04, -0.352); box(U, 0.05, 0.04, 0.019, SURV.brass, s * 0.1, 0.96, -0.354);
    box(U, 0.05, 0.2, 0.11, canvasLt, s * 0.235, 0.84, -0.245); if (s < 0) box(U, 0.058, 0.045, 0.118, canvasDk, s * 0.236, 0.95, -0.245);
    box(U, 0.061, 0.02, 0.33, web, s * 0.15, 1.17, -0.005);
    box(U, 0.065, 0.4, 0.02, web, s * 0.15, 0.97, 0.158); box(U, 0.05, 0.035, 0.026, SURV.brass, s * 0.15, 0.79, 0.16);
    xc(U, 0.075, 0.03, web, s * 0.13, 1.255, -0.25);
  });
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.15, 10), steel); bottle.position.set(0.235, 0.96, -0.245); bottle.castShadow = true; U.add(bottle);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8), web); cap.position.y = 0.09; bottle.add(cap);
  box(U, 0.25, 0.03, 0.014, web, 0, 1.02, 0.164); box(U, 0.058, 0.042, 0.02, SURV.sole, 0, 1.02, 0.166);
  sil(box(U, 0.38, 0.15, 0.15, canvasLt, 0, 0.64, -0.25)); box(U, 0.3, 0.012, 0.01, web, 0, 0.67, -0.327); box(U, 0.02, 0.04, 0.012, SURV.brass, 0.12, 0.65, -0.329);
  sil(xc(U, 0.07, 0.4, roll, 0, 1.255, -0.25)); xc(U, 0.03, 0.41, canvasDk, 0, 1.255, -0.25);
  // fold the small pieces into one mesh per material on each body part; the boots are merged on their own so gear can hide them
  unfight(PM.g, { fixed: new Set([PM.torso, PM.head, PM.armL, PM.armR, PM.legL, PM.legR]) });
  const boots = PBOOT.splice(0), rig = new Set([PM.torso, PM.head, PM.armL, PM.armR, PM.legL, PM.legR, ...boots]);
  const live = { live: new Set([PM.mats.shirt, PM.mats.shirtDk, SURV.skinDk]) };   // recoloured at runtime, so kept out of the baked colours
  [H, TO, U, PM.armL, PM.armR, PM.legL, PM.legR].forEach(p => mergeInto(p, finePieces(p, rig), live));
  [PM.legL, PM.legR].forEach(l => PBOOT.push(...mergeInto(l, boots.filter(o => o.parent === l))));
}
const armorG = new THREE.Group();
PM.upper.add(armorG);
const pBlob = blobShadow(1.15, 0.38);
// bandage rolls clipped in pouches, one per bandage in the bag: three in the pouch at your left side, and two more in
// the second pouch on the front of your belt that comes with the Med pouch upgrade (player/gear.js shows it)
const bandRolls = [], bandPouch2 = new THREE.Group();
{
  const roll = new THREE.CylinderGeometry(0.048, 0.048, 0.07, 10), white = lam(0xeae4d6), cross = lam(0xb3261c), canvas = lam(0x3a3226), flap = lam(0x2e281e);
  const addRoll = (g, x, y, z, along) => {
    const m = new THREE.Mesh(roll, white); if (along === 'z') m.rotation.x = Math.PI / 2; else m.rotation.z = Math.PI / 2;
    m.position.set(x, y, z); m.castShadow = true; g.add(m);
    box(m, 0.03, 0.072, 0.008, cross, 0, 0, 0); box(m, 0.008, 0.072, 0.03, cross, 0, 0, 0);   // a little red cross on each end
    m.visible = false; bandRolls.push(m);
  };
  // on the torso, so it stays in one spot on your left side rather than turning with your hips
  const pouch = new THREE.Group(); pouch.position.set(-0.275, 0.64, 0.02); PM.upper.add(pouch);
  box(pouch, 0.05, 0.11, 0.3, canvas, 0.012, 0.012, 0);   // strap and backing
  [0.1, 0, -0.1].forEach(z => addRoll(pouch, -0.03, 0.03, z));
  // the second pouch rides on the belt buckle's right, the rolls' ends facing out
  bandPouch2.position.set(0.13, 0.6, 0.175); bandPouch2.visible = false; PM.upper.add(bandPouch2);
  box(bandPouch2, 0.17, 0.11, 0.035, canvas, 0, 0, 0); box(bandPouch2, 0.18, 0.026, 0.06, flap, 0, 0.062, 0.012);
  [-0.045, 0.045].forEach(x => addRoll(bandPouch2, x, -0.004, 0.047, 'z'));
}
// a barely-there light rim round your own character, just enough to pick yourself out in the dark or in a crowd
rollLook();
const pOutline = outline(PM.g, 0xf2e8d0, 0, 0.01, null, o => !o.userData.fine); pOutline.opacity = 0.1; pOutline.depthWrite = false;
