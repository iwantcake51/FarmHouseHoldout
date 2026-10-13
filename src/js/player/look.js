// The survivor's look, dealt fresh at the start of every run: skin tone, hair and its style, beard, eye colour, hat,
// top, trousers, shoes and the colour of the pack. The pieces sit in their own groups on the rig so they can be
// cleared and rebuilt; colours something else changes later (the shirt under a jacket, skin) stay shared materials,
// the rest is baked into a few merged meshes per body part.

const LOOK = { g: {}, cur: null, mirrorY: 0.214, xrayReady: false };
// each group and the rig part it rides on (the hat and the shoes get their own, so gear can hide them)
const LOOK_ON = { head: PM.head, hat: PM.head, torso: PM.torso, armL: PM.armL, armR: PM.armR, legL: PM.legL, legR: PM.legR, shoeL: PM.legL, shoeR: PM.legR };
for (const k in LOOK_ON) { const g = new THREE.Group(); LOOK_ON[k].add(g); LOOK.g[k] = g; }
const PBOOT = [LOOK.g.shoeL, LOOK.g.shoeR];   // hidden by gear.js when you've upgraded your footwear
const LOOKS = {
  skin: [0xf2cfae, 0xe3b48f, 0xd2a07c, 0xbd8761, 0x9c6a46, 0x7a4e32, 0x5a3824],
  hair: [0x1e1814, 0x3a2a1e, 0x5e4026, 0x8a4a26, 0xc8a060, 0x9a948a],
  hairStyle: ['short', 'short', 'long', 'buzz', 'bald'],
  beard: ['none', 'stubble', 'stubble', 'full', 'mustache', 'goatee'],
  eyes: [0x4a2e1c, 0x2e1e12, 0x3e6e9e, 0x3e7a48, 0x6e7c84, 0x7a5a2a],
  hat: ['cap', 'cap', 'beanie', 'cowboy', 'bandana', 'none'],
  hatCol: {
    cap: [0xc4612a, 0x9a2a22, 0x3a5a3a, 0x2e4a6a, 0x2a2a2a, 0xb09060], beanie: [0x3a4a5a, 0x8a2a22, 0x4a5a36, 0x2a2a2a, 0xc8a040],
    cowboy: [0x6a4a2a, 0x9a7a4a, 0x3a2a1e], bandana: [0x9a2a22, 0x2e4a7a, 0x2a2a2a]
  },
  top: ['work', 'work', 'tee', 'flannel', 'hoodie'],
  topCol: {
    work: [0x4e5a3c, 0x7a6a44, 0x4a6080, 0x6a4a30, 0x5a5e62], tee: [0x8a8a86, 0x2e2e30, 0xa83a2a, 0x3a5a7a, 0xd8d2c4, 0x4e5a3c],
    flannel: [0x9a2e24, 0x3e5a3a, 0x34507a, 0x6a4a2a], hoodie: [0x6a6a6a, 0x2e3a54, 0x4a5236, 0x5e2a2a, 0x2a2a2c]
  },
  pants: [0x2f3238, 0x3a4a64, 0x4a3a2a, 0x6a5e44, 0x1e1e22, 0x434a36],
  shoes: ['boots', 'boots', 'blackboots', 'tanboots', 'sneakers'],
  pack: [0x5a4a34, 0x4a5236, 0x55585a, 0x34405a, 0x5e3e2a], roll: [0x7a3a2a, 0x3a5a3a, 0x5a5a6a, 0x8a6a3a, 0x6a2a3a]
};
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const lookMats = {}, lm = c => lookMats[c] || (lookMats[c] = lam(c));
// deal a look: anything in opt is kept as given (handy for testing), the rest is random
function dealLook(opt) {
  const o = opt || {}, L = {};
  L.skin = o.skin ?? pick(LOOKS.skin); L.hair = o.hair ?? pick(LOOKS.hair); L.hairStyle = o.hairStyle ?? pick(LOOKS.hairStyle);
  L.beard = o.beard ?? pick(LOOKS.beard); L.eyes = o.eyes ?? pick(LOOKS.eyes);
  L.beardCol = L.hair === 0x9a948a ? 0xa8a49c : shade(L.hair, 0.9);
  L.hat = o.hat ?? pick(LOOKS.hat); L.hatCol = o.hatCol ?? (L.hat === 'none' ? 0 : pick(LOOKS.hatCol[L.hat]));
  L.top = o.top ?? pick(LOOKS.top); L.topCol = o.topCol ?? pick(LOOKS.topCol[L.top]); L.print = o.print ?? (rand() < 0.5 ? pick([0xd8d2c4, 0xc8a040, 0xa83a2a, 0x2e2e30]) : 0);
  L.pants = o.pants ?? pick(LOOKS.pants); L.shoes = o.shoes ?? pick(LOOKS.shoes);
  L.sneak = o.sneak ?? [pick([0xd8d4cc, 0x8a8a8a, 0x2a2a2a, 0x8a2a22, 0x2e4a7a]), pick([0xe8e4dc, 0xb08a5a]), pick([0xa83a2a, 0x3a6aa0, 0xc8a040, 0x2a2a2a])];
  L.pack = o.pack ?? pick(LOOKS.pack); L.roll = o.roll ?? pick(LOOKS.roll);
  return L;
}
// the shirt colours, unless body armour's canvas jacket is covering it (build-weapons.js calls this too)
function shirtColours(jacket) {
  const c = jacket ? 0x7a6a4a : (LOOK.cur ? LOOK.cur.topCol : 0x4e5a3c);
  PM.mats.shirt.color.setHex(c); PM.mats.shirtDk.color.setHex(jacket ? 0x5e5036 : shade(c, 0.76));
}
// clear the old look and build a new one; attach is false only for the first build, before the x-ray rim exists
function rollLook(opt) {
  const L = LOOK.cur = dealLook(opt);
  Object.values(LOOK.g).forEach(g => { while (g.children.length) { const c = g.children[0]; g.remove(c); c.traverse(o => { if (o.isMesh && o.userData.fine) o.geometry.dispose(); }); } });
  PM.mats.skin.color.setHex(L.skin); PM.mats.skinDk.color.setHex(shade(L.skin, 0.86)); PM.mats.pants.color.setHex(L.pants);
  shirtColours(false);   // a fresh run has no armour yet; buildGuns puts the jacket on later if you earn one
  PACK.canvas.color.setHex(L.pack); PACK.canvasDk.color.setHex(shade(L.pack, 0.78)); PACK.canvasLt.color.setHex(shade(L.pack, 1.22)); PACK.roll.color.setHex(L.roll);
  const sils = buildLook(L);
  // pull flush faces apart, then fold each group's small pieces into a few meshes
  const pieces = new Set(); Object.values(LOOK.g).forEach(g => g.traverse(o => { if (o.isMesh) pieces.add(o); }));
  unfight(PM.g, { only: pieces, fixed: new Set([PM.torso, PM.head, PM.armL, PM.armR, PM.legL, PM.legR]) });
  const live = { live: new Set([PM.mats.shirt, PM.mats.shirtDk, PM.mats.skinDk, PM.mats.pants]) };
  Object.values(LOOK.g).forEach(g => mergeInto(g, finePieces(g), live));
  // the hat's big pieces keep the faint rim and the see-through silhouette like the rest of you
  sils.forEach(m => outline(m, 0, 0, 0.01, pOutline));
  if (LOOK.xrayReady) xrayAttach(sils);
}
function buildLook(L) {
  const H = LOOK.g.head, HT = LOOK.g.hat, TO = LOOK.g.torso, sils = [], sil = m => { m.userData.sil = true; sils.push(m); return m; };
  const hair = lm(L.hair), beard = lm(L.beardCol), skinDk = PM.mats.skinDk, shirt = PM.mats.shirt, shirtDk = PM.mats.shirtDk;
  // ---- face: whites, irises and pupils, brows, ears and a nose
  [-1, 1].forEach(s => {
    box(H, 0.058, 0.04, 0.014, lm(0xe8e2d6), s * 0.075, 0.03, 0.162);
    box(H, 0.03, 0.036, 0.014, lm(L.eyes), s * 0.071, 0.03, 0.165);
    box(H, 0.014, 0.018, 0.014, lm(0x141010), s * 0.071, 0.03, 0.168);
    box(H, 0.08, 0.022, 0.02, L.hairStyle === 'bald' ? beard : hair, s * 0.075, 0.078, 0.165).rotation.z = s * -0.12;
    box(H, 0.03, 0.08, 0.07, skinDk, s * 0.172, 0.0, -0.01);
  });
  box(H, 0.05, 0.06, 0.04, skinDk, 0, -0.03, 0.178);
  // ---- hair: short, long, buzzed or none; the top only shows without a hat (or under a bandana)
  const top = L.hat === 'none' || L.hat === 'bandana';
  if (L.hairStyle === 'buzz') {
    box(H, 0.326, 0.014, 0.326, hair, 0, 0.165, 0); box(H, 0.326, 0.12, 0.012, hair, 0, 0.06, -0.165);
    [-1, 1].forEach(s => box(H, 0.012, 0.1, 0.12, hair, s * 0.165, 0.06, -0.08));
  } else if (L.hairStyle !== 'bald') {
    box(H, 0.33, 0.13, 0.05, hair, 0, 0.05, -0.15);
    [-1, 1].forEach(s => box(H, 0.012, 0.12, 0.1, hair, s * 0.166, 0.03, -0.077));
    if (L.hairStyle === 'long') { box(H, 0.34, 0.24, 0.07, hair, 0, -0.03, -0.155); [-1, 1].forEach(s => box(H, 0.016, 0.2, 0.14, hair, s * 0.168, -0.02, -0.07)); }
    if (top) { box(H, 0.334, 0.05, 0.334, hair, 0, 0.18, 0); box(H, 0.3, 0.045, 0.03, hair, 0.02, 0.15, 0.17).rotation.z = 0.06; }
  }
  const hairTop = L.hairStyle === 'bald' ? 0.16 : L.hairStyle === 'buzz' ? 0.172 : top ? 0.205 : 0.16;
  // ---- beard: none, stubble, full, a moustache or a goatee, all round a mouth
  const mouth = () => box(H, 0.08, 0.014, 0.02, skinDk, 0, -0.1, 0.165);
  if (L.beard === 'stubble') { box(H, 0.3, 0.07, 0.024, beard, 0, -0.122, 0.166); box(H, 0.1, 0.02, 0.026, skinDk, 0, -0.102, 0.168); }
  else if (L.beard === 'full') {
    box(H, 0.3, 0.13, 0.036, beard, 0, -0.13, 0.168); [-1, 1].forEach(s => box(H, 0.014, 0.15, 0.14, beard, s * 0.167, -0.09, 0.07));
    box(H, 0.14, 0.03, 0.03, beard, 0, -0.072, 0.178); box(H, 0.07, 0.012, 0.012, skinDk, 0, -0.098, 0.19);
  } else if (L.beard === 'mustache') { box(H, 0.14, 0.03, 0.028, beard, 0, -0.072, 0.172); mouth(); }
  else if (L.beard === 'goatee') { box(H, 0.1, 0.07, 0.032, beard, 0, -0.135, 0.168); box(H, 0.12, 0.022, 0.028, beard, 0, -0.074, 0.172); mouth(); }
  else mouth();
  // ---- hat
  const hc = L.hatCol, hcDk = lm(shade(hc, 0.72));
  if (L.hat === 'cap') {
    sil(box(HT, 0.35, 0.1, 0.36, lm(hc), 0, 0.17, -0.005));
    box(HT, 0.355, 0.026, 0.365, hcDk, 0, 0.126, -0.005); box(HT, 0.06, 0.024, 0.06, hcDk, 0, 0.23, -0.005);
    box(HT, 0.11, 0.06, 0.012, lm(hc === 0xb09060 ? 0x5a4a34 : 0xe6d6b0), 0, 0.172, 0.178);
    const brim = sil(box(HT, 0.3, 0.032, 0.17, lm(hc), 0, 0.128, 0.255)); brim.rotation.x = 0.14;
    box(brim, 0.294, 0.008, 0.164, hcDk, 0, -0.019, 0);
    LOOK.mirrorY = 0.214;
  } else if (L.hat === 'beanie') {
    sil(box(HT, 0.344, 0.12, 0.352, lm(hc), 0, 0.168, 0));
    box(HT, 0.352, 0.046, 0.36, hcDk, 0, 0.11, 0);
    if (rand() < 0.4) { const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), hcDk); pom.position.y = 0.25; pom.castShadow = true; HT.add(pom); }
    LOOK.mirrorY = 0.235;
  } else if (L.hat === 'cowboy') {
    sil(box(HT, 0.5, 0.018, 0.46, lm(hc), 0, 0.138, 0));
    sil(box(HT, 0.26, 0.12, 0.24, lm(hc), 0, 0.2, 0));
    box(HT, 0.266, 0.026, 0.246, hcDk, 0, 0.157, 0); box(HT, 0.06, 0.012, 0.2, hcDk, 0, 0.257, 0);
    [-1, 1].forEach(s => box(HT, 0.05, 0.022, 0.452, lm(hc), s * 0.235, 0.155, 0).rotation.z = s * 0.45);   // the brim's sides curl up
    LOOK.mirrorY = 0.16;
  } else if (L.hat === 'bandana') {
    sil(box(HT, 0.338, 0.05, 0.338, lm(hc), 0, 0.102, 0));
    box(HT, 0.06, 0.05, 0.04, hcDk, 0, 0.1, -0.185);
    [-1, 1].forEach(s => box(HT, 0.03, 0.09, 0.012, lm(hc), s * 0.02, 0.04, -0.19).rotation.z = s * 0.25);
    LOOK.mirrorY = hairTop + 0.02;
  } else LOOK.mirrorY = hairTop + 0.02;
  // ---- top: a work shirt, a tee, a flannel or a hoodie
  const sleeve = (len, cuff) => [LOOK.g.armL, LOOK.g.armR].forEach(a => {
    box(a, 0.156, 0.156, len, shirt, 0, 0, -0.03 + len / 2);
    if (cuff) box(a, cuff[0], cuff[0], cuff[1], shirtDk, 0, 0, -0.03 + len - cuff[1] / 2 + cuff[2]);
  });
  if (L.top === 'work' || L.top === 'flannel') {
    [-1, 1].forEach(s => box(TO, 0.12, 0.04, 0.08, shirtDk, s * 0.07, 0.295, 0.125).rotation.y = s * 0.35);
    box(TO, 0.05, 0.5, 0.016, shirtDk, 0, 0.0, 0.157);
    for (let k = 0; k < 4; k++) box(TO, 0.022, 0.022, 0.012, lm(0xe6d6b0), 0, 0.19 - k * 0.12, 0.168);
    box(TO, 0.085, 0.085, 0.016, shirtDk, -0.07, 0.03, 0.157); box(TO, 0.09, 0.022, 0.018, shirt, -0.07, 0.07, 0.161);
  }
  if (L.top === 'work') sleeve(0.16, [0.168, 0.04, 0.02]);
  else if (L.top === 'flannel') {
    // a dark check across the front, back and sides, and rolled-up long sleeves with a stripe
    const pl = lm(shade(L.topCol, 0.45));
    [-0.19, -0.1, 0.1, 0.19].forEach(x => [-1, 1].forEach(sg => box(TO, 0.02, 0.6, 0.008, pl, x, 0, sg * 0.153)));
    [-0.15, 0.0, 0.15].forEach(y => { [-1, 1].forEach(sg => box(TO, 0.496, 0.02, 0.008, pl, 0, y, sg * 0.153)); [-1, 1].forEach(sg => box(TO, 0.008, 0.02, 0.296, pl, sg * 0.253, y, 0)); });
    sleeve(0.3, [0.17, 0.045, 0.012]);
    [LOOK.g.armL, LOOK.g.armR].forEach(a => box(a, 0.159, 0.159, 0.02, pl, 0, 0, 0.1));
  } else if (L.top === 'tee') {
    box(TO, 0.2, 0.03, 0.05, shirtDk, 0, 0.29, 0.13);
    if (L.print) box(TO, 0.12, 0.09, 0.01, lm(L.print), 0, 0.08, 0.157);
    sleeve(0.15, [0.16, 0.02, 0.015]);
  } else if (L.top === 'hoodie') {
    box(TO, 0.34, 0.1, 0.12, shirt, 0, 0.32, -0.1);                                       // the hood, bunched behind your neck
    box(TO, 0.3, 0.13, 0.016, shirtDk, 0, -0.17, 0.157);                                 // the front pocket
    [-1, 1].forEach(s => box(TO, 0.012, 0.11, 0.01, lm(0xd8d2c4), s * 0.05, 0.22, 0.157));   // drawstrings
    sleeve(0.46, [0.164, 0.04, 0.006]);
  }
  // ---- trousers: a cargo pocket on one thigh and a knee patch on the other
  const pDk = lm(shade(L.pants, 0.7));
  box(LOOK.g.legL, 0.012, 0.13, 0.12, PM.mats.pants, -0.1, -0.2, 0.0); box(LOOK.g.legL, 0.016, 0.03, 0.13, pDk, -0.101, -0.14, 0.0);
  box(LOOK.g.legR, 0.11, 0.09, 0.012, pDk, 0.01, -0.28, 0.114);
  // ---- shoes: laced work boots (brown, black or tan) or sneakers
  const SH = { boots: [0x3e2e22, 0x1e1a16, 0x8a7a5a], blackboots: [0x1e1e20, 0x121212, 0x3a3a3a], tanboots: [0x7a5a3a, 0x2a2018, 0x4a3a2a] };
  [LOOK.g.shoeL, LOOK.g.shoeR].forEach(l => {
    if (L.shoes === 'sneakers') {
      const [up, sole, stripe] = L.sneak;
      box(l, 0.2, 0.085, 0.27, lm(up), 0, -0.5, 0.03); box(l, 0.205, 0.03, 0.28, lm(sole), 0, -0.54, 0.032);
      box(l, 0.204, 0.022, 0.12, lm(stripe), 0, -0.505, 0.02); box(l, 0.1, 0.012, 0.09, lm(0xe8e4dc), 0, -0.455, 0.1);
      box(l, 0.202, 0.05, 0.05, lm(sole), 0, -0.522, 0.152);
    } else {
      const [up, sole, lace] = SH[L.shoes];
      box(l, 0.2, 0.1, 0.27, lm(up), 0, -0.495, 0.03); box(l, 0.205, 0.035, 0.28, lm(sole), 0, -0.54, 0.032);
      box(l, 0.11, 0.012, 0.09, lm(lace), 0, -0.444, 0.1); box(l, 0.204, 0.025, 0.232, lm(up), 0, -0.445, 0.0);
    }
  });
  return sils;
}
rollLook();
