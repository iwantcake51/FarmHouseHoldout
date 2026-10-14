// The survivor's look, dealt fresh at the start of every run: skin tone, hair and its style, beard, eye colour, hat,
// top, trousers, shoes, the colours of the pack and its bedroll, and of the holster. The pieces sit in their own groups on the rig so they can be
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
  // facial hair, weighted by how often you'd see it on a farm in a bad week
  beard: ['none', 'none', 'none', 'stubble', 'stubble', 'stubble', 'heavyStubble', 'heavyStubble', 'full', 'full', 'longBeard', 'mustache', 'mustache', 'handlebar',
    'horseshoe', 'goatee', 'goatee', 'vandyke', 'soulPatch', 'chinstrap', 'muttonChops', 'sideburns'],
  // the face itself: eyes, brows, nose and mouth each one of a few shapes, and now and then a scar, tired eyes or lines
  eyeShape: ['beady', 'beady', 'narrow', 'narrow', 'tired', 'tired', 'wide', 'droopy', 'deepset', 'oneSquint'],
  brow: ['flat', 'flat', 'raised', 'furrow', 'furrow', 'heavy', 'thin', 'unibrow', 'arched', 'bushy', 'sparse', 'skeptic'],
  nose: ['small', 'long', 'long', 'wide', 'crooked', 'button', 'hooked'], mouth: ['line', 'line', 'thin', 'frown', 'smirk', 'smirk', 'grim'],
  // dark and light browns most often, then hazel, greens, blues, greys and amber
  eyes: [0x2e1e12, 0x3a2414, 0x4a2e1c, 0x4a2e1c, 0x5e3a1e, 0x6a4a28, 0x6a5a2a, 0x5a6a34, 0x3e7a48, 0x2e5e3a, 0x3e6e9e, 0x5a8ab8, 0x4a5e70, 0x6e7c84, 0x8a6a2a],
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
  // canvas and nylon packs (olive, coyote, khaki, black, navy, forest, grey, brown, maroon, hiking red, orange, blue,
  // teal), sleeping bags in their brighter nylons, and holsters in what they really come in: black most often, coyote,
  // tan, olive drab, ranger green, wolf grey, and brown, tan or oxblood leather
  pack: [0x5a4a34, 0x4a5236, 0x7a6a4a, 0x8a7a56, 0x2a2a2c, 0x2e3a54, 0x3a4a34, 0x55585a, 0x5e2a2a, 0x8a2e24, 0xa85a24, 0x34507a, 0x2e5a5a],
  roll: [0x7a3a2a, 0x3a5a3a, 0x5a5a6a, 0x8a6a3a, 0x6a2a3a, 0x2e4a7a, 0xa85a24, 0x4a3a6a, 0xb08a2a, 0x2a2a2c, 0x3e6e6a, 0x9a2a22],
  holster: [0x1d1d1f, 0x1d1d1f, 0x1d1d1f, 0x8a7656, 0xa08a62, 0x4e5236, 0x3e4632, 0x56585a, 0x5a3820, 0x8a5530, 0x4a2018]
};
// (held to 1 a channel: getHex doesn't clamp, so a lightened channel past full would wrap round to nearly nothing and
// a pale skin's scar come out teal)
const shade = (c, k) => { const o = new THREE.Color(c).multiplyScalar(k); return o.setRGB(Math.min(1, o.r), Math.min(1, o.g), Math.min(1, o.b)).getHex(); };
const hsl = (h, s, l) => new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l).getHex();
// a top in any colour: half the time one of the stock colours for that top, otherwise a fresh, slightly worn-looking shade
const rollTopCol = top => rand() < 0.45 ? pick(LOOKS.topCol[top]) : hsl(rand(), rr(0.18, top === 'tee' ? 0.62 : 0.5), rr(0.2, top === 'tee' ? 0.62 : 0.44));
// sneakers: an upper in any colour (white, grey and black come up often), a sole, and a stripe that stands out from the upper
function rollSneak() {
  const h = rand(), plain = rand() < 0.35, up = plain ? hsl(0, 0, pick([0.12, 0.45, 0.85])) : hsl(h, rr(0.35, 0.8), rr(0.28, 0.62));
  const stripe = hsl(h + rr(0.3, 0.7), rr(0.55, 0.85), rr(0.38, 0.6));
  return [up, pick([0xe8e4dc, 0xd8d2c4, 0xb08a5a, 0x2a2a2a]), stripe];
}
const lookMats = {}, lm = c => lookMats[c] || (lookMats[c] = lam(c));
// deal a look: anything in opt is kept as given (handy for testing), the rest is random
function dealLook(opt) {
  const o = opt || {}, L = {};
  L.skin = o.skin ?? pick(LOOKS.skin); L.hair = o.hair ?? pick(LOOKS.hair); L.hairStyle = o.hairStyle ?? pick(LOOKS.hairStyle);
  L.beard = o.beard ?? pick(LOOKS.beard);
  // eyes: from the list, now and then a shade of their own, and once in a while each eye a different colour
  const eyeCol = () => rand() < 0.2 ? hsl(rr(0.05, 0.6), rr(0.25, 0.55), rr(0.2, 0.42)) : pick(LOOKS.eyes);
  L.eyes = o.eyes ?? eyeCol(); L.eyes2 = o.eyes2 ?? (rand() < 0.05 ? eyeCol() : L.eyes);
  // a face of their own, a little lopsided like anyone's
  L.face = o.face ?? { eye: pick(LOOKS.eyeShape), brow: pick(LOOKS.brow), nose: pick(LOOKS.nose), mouth: pick(LOOKS.mouth), gap: rr(0.062, 0.08), eyeY: rr(0.018, 0.042), lop: rr(-0.006, 0.006),
    slit: rand() < 0.18 ? (rand() < 0.5 ? -1 : 1) : 0, scar: rand() < 0.22 ? pick(['cheek', 'brow', 'lip', 'nose']) : null, bags: rand() < 0.35, lines: rand() < 0.3, side: rand() < 0.5 ? -1 : 1,
    // and the rest that makes a face someone's: freckles, a mole, a cleft chin, big ears, the grime of the last few days,
    // or (rarely) a patch over one eye
    freckles: rand() < 0.14, mole: rand() < 0.16 ? [rr(-0.12, 0.12), rr(-0.11, 0.0)] : null, cleft: rand() < 0.15, ears: rand() < 0.2 ? 1.35 : rr(0.9, 1.1), grime: rand() < 0.3, patch: rand() < 0.04 };
  L.beardCol = L.hair === 0x9a948a ? 0xa8a49c : shade(L.hair, 0.9);
  L.hat = o.hat ?? pick(LOOKS.hat); L.hatCol = o.hatCol ?? (L.hat === 'none' ? 0 : pick(LOOKS.hatCol[L.hat]));
  L.top = o.top ?? pick(LOOKS.top); L.topCol = o.topCol ?? rollTopCol(L.top); L.print = o.print ?? (rand() < 0.5 ? pick([0xd8d2c4, 0xc8a040, 0xa83a2a, 0x2e2e30]) : 0);
  L.pants = o.pants ?? pick(LOOKS.pants); L.shoes = o.shoes ?? pick(LOOKS.shoes);
  L.sneak = o.sneak ?? rollSneak();
  // the pack and its bedroll: half the time a stock colour, otherwise a fresh muted shade (a brighter one for the bedroll)
  L.pack = o.pack ?? (rand() < 0.5 ? pick(LOOKS.pack) : hsl(rand(), rr(0.12, 0.45), rr(0.16, 0.38)));
  const rollCol = () => rand() < 0.5 ? pick(LOOKS.roll) : hsl(rand(), rr(0.3, 0.7), rr(0.24, 0.5));
  L.roll = o.roll ?? rollCol();
  // a bedroll that would vanish into the pack is dealt again
  const near = (a, b) => { const x = new THREE.Color(a), y = new THREE.Color(b); return Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b) < 0.25; };
  for (let k = 0; k < 8 && o.roll === undefined && near(L.roll, L.pack); k++) L.roll = rollCol();
  L.holster = o.holster ?? pick(LOOKS.holster);
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
  // ---- face: eyes, brows, nose, mouth and ears, each dealt one of a few shapes (L.face), set a little unevenly
  const F = L.face, brow = L.hairStyle === 'bald' ? beard : hair, dark = lm(0x141010), white = lm(0xe2dccf), scarM = lm(shade(L.skin, 1.16)), circ = lm(shade(L.skin, 0.68));
  [-1, 1].forEach(s => {
    const x = s * F.gap, y = F.eyeY + (s > 0 ? F.lop : 0), eyeM = lm(s > 0 ? L.eyes2 || L.eyes : L.eyes);
    if (F.patch && s === F.side) {   // a patch over this eye, its strap round the head
      box(H, 0.064, 0.056, 0.014, dark, x, y, 0.164); box(H, 0.34, 0.012, 0.008, dark, 0, y + 0.04, 0.163).rotation.z = -s * 0.22;
      [-1, 1].forEach(q => box(H, 0.006, 0.012, 0.32, dark, q * 0.163, y + 0.04 + q * s * 0.036, 0));
    }
    else if (F.eye === 'beady') { box(H, 0.026, 0.03, 0.012, eyeM, x, y, 0.162); box(H, 0.012, 0.016, 0.012, dark, x - s * 0.003, y, 0.165); }   // small dark eyes, no whites
    else if (F.eye === 'narrow' || (F.eye === 'oneSquint' && s === F.side)) { box(H, 0.05, 0.016, 0.012, white, x, y, 0.162); box(H, 0.022, 0.016, 0.012, dark, x - s * 0.004, y, 0.165); }   // a squint
    else if (F.eye === 'droopy') {   // the outer corners lower, the lids heavy
      const e = box(H, 0.05, 0.026, 0.012, white, x, y, 0.162); e.rotation.z = s * -0.22; box(H, 0.022, 0.024, 0.012, eyeM, x - s * 0.004, y, 0.164); box(H, 0.011, 0.013, 0.012, dark, x - s * 0.004, y, 0.167);
      box(H, 0.058, 0.012, 0.014, PM.mats.skinDk, x, y + 0.012, 0.169).rotation.z = s * -0.22;
    }
    else if (F.eye === 'deepset') {   // sunk under the brow, in its shadow
      box(H, 0.064, 0.016, 0.014, circ, x, y + 0.02, 0.163); box(H, 0.044, 0.024, 0.01, white, x, y, 0.161); box(H, 0.02, 0.022, 0.01, eyeM, x - s * 0.004, y, 0.163); box(H, 0.01, 0.012, 0.01, dark, x - s * 0.004, y, 0.165);
    }
    else {
      const h = F.eye === 'wide' ? 0.036 : 0.03;
      box(H, 0.05, h, 0.012, white, x, y, 0.162); box(H, 0.024, h - 0.002, 0.012, eyeM, x - s * 0.004, y, 0.164); box(H, 0.012, h * 0.5, 0.012, dark, x - s * 0.004, y, 0.167);
      if (F.eye === 'tired') { box(H, 0.056, 0.014, 0.014, PM.mats.skinDk, x, y + h / 2 - 0.004, 0.169); box(H, 0.05, 0.012, 0.01, circ, x, y - h / 2 - 0.008, 0.162); }   // heavy lids, dark circles under
    }
    if (F.bags) box(H, 0.046, 0.007, 0.012, PM.mats.skinDk, x, y - 0.026, 0.163);
    // brows: flat, raised at the middle, drawn down in a frown, heavy or thin; sometimes one with a slit shaved in it
    const by = y + (F.eye === 'tired' || F.eye === 'deepset' ? 0.04 : 0.046) + (F.brow === 'skeptic' && s === F.side ? 0.014 : 0);
    const bh = F.brow === 'heavy' || F.brow === 'bushy' ? 0.03 : F.brow === 'thin' || F.brow === 'sparse' ? 0.012 : F.brow === 'unibrow' ? 0.022 : 0.02, bw = F.brow === 'heavy' || F.brow === 'bushy' ? 0.088 : F.brow === 'sparse' ? 0.058 : 0.076;
    const tilt = F.brow === 'raised' ? s * 0.16 : F.brow === 'furrow' || F.brow === 'unibrow' ? s * -0.2 : F.brow === 'skeptic' ? (s === F.side ? s * 0.12 : s * -0.1) : s * -0.04;
    if (F.brow === 'unibrow' && s === 1) box(H, F.gap * 2 - 0.05, bh * 0.8, 0.02, brow, 0, by - 0.006, 0.165);   // joined over the nose
    if (F.brow === 'arched') {   // up from the inside to a peak, then down
      box(H, bw * 0.55, bh, 0.02, brow, x - s * bw * 0.2, by, 0.165).rotation.z = s * 0.28; box(H, bw * 0.5, bh, 0.02, brow, x + s * bw * 0.25, by + 0.004, 0.165).rotation.z = s * -0.32;
    } else if (F.slit === s) {   // two pieces with skin between, off-centre toward the outside
      const g = 0.012, a = (bw - g) * 0.62, b = bw - g - a;
      const p1 = box(H, a, bh, 0.02, brow, x - s * (bw / 2 - a / 2), by + (F.brow === 'furrow' ? -0.004 : 0.003), 0.165), p2 = box(H, b, bh, 0.02, brow, x + s * (bw / 2 - b / 2), by - (F.brow === 'furrow' ? -0.006 : 0.004), 0.165);
      p1.rotation.z = p2.rotation.z = tilt;
    } else box(H, bw, bh, 0.02, brow, x, by, 0.165).rotation.z = tilt;
    if (F.brow === 'bushy') box(H, 0.02, 0.014, 0.02, brow, x - s * 0.03, by + 0.018, 0.166).rotation.z = s * 0.5;   // a wild tuft at the inner end
    box(H, 0.03 * F.ears, 0.08 * F.ears, 0.07, PM.mats.skinDk, s * (0.172 + 0.012 * (F.ears - 1)), 0.0, -0.01);   // ears
  });
  // the nose: small, long, wide, broken and set crooked, a button or hooked
  const NOSE = { small: [0.04, 0.05, 0.035, -0.03], long: [0.042, 0.08, 0.04, -0.038], wide: [0.068, 0.05, 0.04, -0.036], crooked: [0.044, 0.066, 0.04, -0.034], button: [0.036, 0.034, 0.034, -0.042], hooked: [0.044, 0.07, 0.046, -0.032] };
  const N = NOSE[F.nose] || NOSE.small, nose = box(H, N[0], N[1], N[2], PM.mats.skinDk, F.nose === 'crooked' ? F.side * 0.008 : 0, N[3], 0.16 + N[2] / 2);
  if (F.nose === 'crooked') nose.rotation.z = F.side * 0.16;
  if (F.nose === 'hooked') box(H, N[0] * 0.8, 0.02, 0.02, PM.mats.skinDk, 0, N[3] + N[1] / 2 - 0.012, 0.19);   // the bridge's bump
  if (F.lines) [0.104, 0.122].forEach((y, k) => box(H, 0.12 - k * 0.03, 0.006, 0.01, PM.mats.skinDk, F.lop * 3, y, 0.161));   // lines across the forehead
  // a scar: down a cheek, through a brow, through the lip or across the nose
  if (F.scar === 'cheek') box(H, 0.009, 0.075, 0.01, scarM, F.side * 0.1, -0.035, 0.163).rotation.z = F.side * 0.3;
  else if (F.scar === 'brow') box(H, 0.009, 0.07, 0.024, scarM, F.side * (F.gap + 0.012), F.eyeY + 0.045, 0.166).rotation.z = F.side * 0.15;
  else if (F.scar === 'nose') box(H, 0.06, 0.008, 0.012, scarM, 0, N[3] + 0.01, 0.16 + N[2] + 0.002).rotation.z = F.side * 0.25;
  if (F.freckles) { const fr = lm(shade(L.skin, 0.74)); [[-0.1, -0.02], [-0.085, -0.04], [-0.115, -0.045], [0.1, -0.025], [0.088, -0.045], [0.118, -0.04], [-0.02, -0.012], [0.024, -0.016]].forEach(([fx, fy]) => box(H, 0.008, 0.008, 0.006, fr, fx, fy, 0.1615)); }
  if (F.mole) box(H, 0.012, 0.012, 0.008, lm(shade(L.skin, 0.5)), F.mole[0], F.mole[1], 0.1625);
  if (F.cleft) box(H, 0.006, 0.026, 0.006, PM.mats.skinDk, 0, -0.145, 0.1615);
  if (F.grime) { const gr = lm(new THREE.Color(L.skin).multiplyScalar(0.62).lerp(new THREE.Color(0x3a3020), 0.35).getHex()); box(H, 0.05, 0.03, 0.006, gr, F.side * 0.095, -0.06, 0.1612).rotation.z = 0.3; box(H, 0.04, 0.016, 0.006, gr, -F.side * 0.06, 0.12, 0.1612); }
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
  // ---- facial hair, then the mouth over it. Stubble is shadow, the skin and the hair mixed, not a solid block of hair
  const stub = k => lm(new THREE.Color(L.skin).lerp(new THREE.Color(L.beardCol), k).getHex());
  const bd = L.beard, jaw = (m, h) => { box(H, 0.3, h, 0.024, m, 0, -0.16 + h / 2, 0.166); [-1, 1].forEach(s => box(H, 0.014, 0.13, 0.12, m, s * 0.166, -0.08, 0.06)); };
  const tache = (w, y) => box(H, w, 0.026, 0.026, beard, 0, y ?? -0.072, 0.174);
  const chin = (w, h, y) => box(H, w, h, 0.032, beard, 0, y, 0.168);
  if (bd === 'stubble' || bd === 'heavyStubble') { const m = stub(bd === 'stubble' ? 0.38 : 0.62); jaw(m, 0.085); box(H, 0.11, 0.022, 0.022, m, 0, -0.074, 0.168); }
  else if (bd === 'full' || bd === 'longBeard') {
    jaw(beard, 0.13); tache(0.14);
    if (bd === 'longBeard') { box(H, 0.24, 0.1, 0.05, beard, 0, -0.205, 0.15); box(H, 0.16, 0.06, 0.045, beard, 0, -0.27, 0.14); }
  }
  else if (bd === 'mustache') tache(0.13);
  else if (bd === 'handlebar') { tache(0.1); [-1, 1].forEach(s => box(H, 0.05, 0.016, 0.024, beard, s * 0.07, -0.064, 0.174).rotation.z = s * 0.5); }   // waxed ends curling up
  else if (bd === 'horseshoe') { tache(0.13); [-1, 1].forEach(s => box(H, 0.022, 0.07, 0.026, beard, s * 0.056, -0.11, 0.172)); }
  else if (bd === 'goatee') { chin(0.1, 0.07, -0.135); tache(0.12); }
  else if (bd === 'vandyke') { chin(0.07, 0.06, -0.14); tache(0.12, -0.07); }
  else if (bd === 'soulPatch') chin(0.03, 0.03, -0.122);
  else if (bd === 'chinstrap') { [-1, 1].forEach(s => box(H, 0.014, 0.15, 0.11, beard, s * 0.166, -0.085, 0.06)); box(H, 0.3, 0.026, 0.026, beard, 0, -0.152, 0.168); }
  else if (bd === 'muttonChops') { [-1, 1].forEach(s => { box(H, 0.014, 0.16, 0.13, beard, s * 0.166, -0.06, 0.055); box(H, 0.07, 0.1, 0.024, beard, s * 0.12, -0.075, 0.166); }); tache(0.1, -0.074); }   // the chin left bare
  else if (bd === 'sideburns') [-1, 1].forEach(s => box(H, 0.014, 0.1, 0.06, beard, s * 0.166, -0.02, 0.07));
  // the mouth: no lips, just the line of it, dark and all but flush with the face (in front of a full beard): plain,
  // thin, turned down, a smirk up at one corner, or set grim with the chin creased under it
  const mY = -0.098, mZ = bd === 'full' || bd === 'longBeard' ? 0.187 : 0.1615, mouthM = lm(new THREE.Color(L.skin).multiplyScalar(0.48).lerp(new THREE.Color(0x4a1e18), 0.3).getHex());
  const mw = F.mouth === 'thin' ? 0.046 : 0.058, mh = F.mouth === 'thin' ? 0.005 : 0.008, mx = F.mouth === 'smirk' ? -F.side * 0.005 : 0;
  box(H, mw, mh, 0.004, mouthM, mx, mY, mZ);
  if (F.mouth === 'frown') [-1, 1].forEach(s => box(H, 0.012, 0.006, 0.004, mouthM, s * (mw / 2 + 0.003), mY - 0.005, mZ).rotation.z = s * 0.6);
  else if (F.mouth === 'smirk') box(H, 0.016, 0.006, 0.004, mouthM, mx + F.side * (mw / 2 + 0.005), mY + 0.004, mZ).rotation.z = F.side * 0.55;
  else if (F.mouth === 'grim') box(H, 0.034, 0.005, 0.004, PM.mats.skinDk, 0, mY - 0.026, mZ);   // the chin set under it
  if (F.scar === 'lip') box(H, 0.007, 0.04, 0.004, scarM, F.side * 0.02, mY + 0.004, mZ + 0.001);
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
