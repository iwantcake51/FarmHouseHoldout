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

// ---- the kit: boxes in a part's frame, baked into one geometry ----
const _zkG = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), _zkPA = _zkG.attributes.position.array, _zkNA = _zkG.attributes.normal.array;
const _zkM = new THREE.Matrix4(), _zkQ = new THREE.Quaternion(), _zkE = new THREE.Euler(), _zkT = new V3(), _zkS = new V3(), _zkN = new V3(), _zkC = new THREE.Color();
const zKit = () => ({ p: [], n: [], c: [] });
// a box w by h by d of colour c, its middle at (x, y, z) in the part's frame, turned by (rx, ry, rz)
function zb(k, w, h, d, c, x, y, z, rx, ry, rz) {
  _zkQ.setFromEuler(_zkE.set(rx || 0, ry || 0, rz || 0)); _zkM.compose(_zkT.set(x, y, z), _zkQ, _zkS.set(w, h, d));
  const e = _zkM.elements; _zkC.set(c);
  for (let i = 0; i < _zkPA.length; i += 3) {
    const px = _zkPA[i], py = _zkPA[i + 1], pz = _zkPA[i + 2];
    k.p.push(e[0] * px + e[4] * py + e[8] * pz + e[12], e[1] * px + e[5] * py + e[9] * pz + e[13], e[2] * px + e[6] * py + e[10] * pz + e[14]);
    _zkN.set(_zkNA[i], _zkNA[i + 1], _zkNA[i + 2]).applyQuaternion(_zkQ); k.n.push(_zkN.x, _zkN.y, _zkN.z); k.c.push(_zkC.r, _zkC.g, _zkC.b);
  }
}
// no two boxes' faces share a plane where they overlap (a sleeve's over the arm's, a pocket's over the shirt's, the
// hair's over the skull's), or they'd flicker through each other as the zombie moves: each face that lies on another
// box's face is lifted off it along its normal, ZLAYER for every layer under it, so whatever was added later (the
// sleeve, the pocket, the hair) sits on top, as built. Faces are found every 6 vertices, boxes every 36 (zb)
const ZLAYER = 0.0007;
function zLayer(k) { for (let pass = 0; pass < 4 && zLayerPass(k); pass++); }
// one pass; true if it moved anything (a lifted face can land on a third one's plane, so it's run till nothing moves)
function zLayerPass(k) {
  const P = k.p, F = []; let moved = false;
  for (let v = 0; v + 5 < P.length / 3; v += 6) {
    const i = v * 3, ux = P[i + 3] - P[i], uy = P[i + 4] - P[i + 1], uz = P[i + 5] - P[i + 2], wx = P[i + 6] - P[i], wy = P[i + 7] - P[i + 1], wz = P[i + 8] - P[i + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz); if (l < 1e-12) continue; nx /= l; ny /= l; nz /= l;
    // the face's extent in two directions across it
    let ax = Math.abs(nx) < 0.9 ? 0 : -nz, ay = Math.abs(nx) < 0.9 ? nz : 0, az = Math.abs(nx) < 0.9 ? -ny : nx; const la = Math.hypot(ax, ay, az); ax /= la; ay /= la; az /= la;
    const bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let q = 0; q < 6; q++) { const j = i + q * 3, x = P[j] * ax + P[j + 1] * ay + P[j + 2] * az, y = P[j] * bx + P[j + 1] * by + P[j + 2] * bz; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    F.push({ v, box: Math.floor(v / 36), nx, ny, nz, d: P[i] * nx + P[i + 1] * ny + P[i + 2] * nz, x0, x1, y0, y1, key: Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz) ? (nx > 0 ? 0 : 1) : Math.abs(ny) >= Math.abs(nz) ? (ny > 0 ? 2 : 3) : (nz > 0 ? 4 : 5), lay: 0 });   // (grouped by the way it mostly faces; nearly the same way is checked below)
  }
  const groups = new Map(); for (const f of F) { const g = groups.get(f.key); if (g) g.push(f); else groups.set(f.key, [f]); }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.d - b.d);
    for (let s = 0; s < g.length;) {   // runs of faces on (all but) the same plane, layered in the order they were built
      let e = s + 1; while (e < g.length && g[e].d - g[e - 1].d < 2e-4) e++;
      if (e - s > 1) {
        const run = g.slice(s, e).sort((a, b) => a.v - b.v);
        for (let a = 1; a < run.length; a++) { const A = run[a]; for (let b = 0; b < a; b++) { const B = run[b]; if (B.box === A.box || A.nx * B.nx + A.ny * B.ny + A.nz * B.nz < 0.9998 || Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) <= 1e-5 || Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) <= 1e-5) continue; A.lay = Math.max(A.lay, B.lay + 1); } }
        for (const A of run) if (A.lay) { moved = true; const o = A.lay * ZLAYER; for (let q = 0; q < 6; q++) { const j = (A.v + q) * 3; P[j] += A.nx * o; P[j + 1] += A.ny * o; P[j + 2] += A.nz * o; } }
      }
      s = e;
    }
  }
  return moved;
}
function zBake(k) {
  zLayer(k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(k.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(k.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(k.c, 3));
  g.computeBoundingBox(); g.computeBoundingSphere(); g.userData.zg = true;
  return g;
}
// a zombie's own geometry let go of once it's off the scene for good (a body cleared away, a limb rotted off the ground)
function zFree(root) { if (root) root.traverse(o => { if (o.isMesh && o.geometry && o.geometry.userData.zg && !o.userData.isOutline) o.geometry.dispose(); }); }

// ---- colours ----
const zc = (c, k) => { const o = new THREE.Color(c).multiplyScalar(k); return o.setRGB(Math.min(1, o.r), Math.min(1, o.g), Math.min(1, o.b)).getHex(); };
const zmix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
// the colours clothes are really dyed (heathers, navies, olives, maroons, khakis, faded reds, stone), picked from
// rather than any hue at all, which gives magentas and limes nobody wears; and the colours a sneaker's flash comes in
const ZDYE = [0x6e7a8a, 0x8a8478, 0x5a2e2e, 0x2e3e5e, 0x4a5a3a, 0x9a8a5a, 0x6a3a2a, 0x3a5a6a, 0x8a4a3a, 0x5a4a6a, 0x7a8a9a, 0x4a3a2e, 0xb0a890, 0x9a3a32, 0x3e4a3e];
const ZFLASH = [0x9a2a22, 0x2a4a8a, 0x2a2a2c, 0x8a8a8a, 0x3a6a3a, 0xb8902a, 0xd8d4cc];
// clothes that have been through it: a little faded toward the colour of dirt, a little darker
const ZDIRT = 0x4e4636, worn = (c, k) => zc(zmix(c, ZDIRT, k === undefined ? rr(0.12, 0.28) : k), rr(0.86, 0.96));
// the living colour of someone's skin, gone grey-green, sallow or bruise-blue with death
const ZSKIN_LIVE = [0xf2cfae, 0xe3b48f, 0xd2a07c, 0xbd8761, 0x9c6a46, 0x7a4e32, 0x5a3824];
const ZROT = [0x728a62, 0x7c8a78, 0x8a9070, 0x6c7a7e, 0x7a8866];
const ZBLOOD = 0x4a120e, ZMEAT = 0x7a1c16, ZBONE = 0xcfc6ae, ZDARK = 0x16100e;

// ---- the body's measures in each part's frame (zombies/zombie-anim.js: the rig) ----
// the chest and waist: the chest's front is ZF.chest out, the waist's ZF.waist
const ZF = { chest: 0.15, waist: 0.13, chestW: 0.25, waistW: 0.21 };
// a thin panel on a face: lay is how far proud of the surface (so pieces stacked on each other never share a plane)
const zfront = (k, w, h, c, x, y, surf, lay) => zb(k, w, h, 0.006, c, x, y, surf + (lay || 0.004));
const zback = (k, w, h, c, x, y, surf, lay) => zb(k, w, h, 0.006, c, x, y, -surf - (lay || 0.004));
const zside = (k, s, w, h, c, z, y, surf, lay) => zb(k, 0.006, h, w, c, s * (surf + (lay || 0.004)), y, z);
// a strip running down the trunk across both the chest and the waist (a zip, a placket, a stripe): split where the
// chest steps in to the waist so each half lies on its own face. face 'f', 'b', 'l' or 'r'; on a side, x is along z
function ztall(k, face, w, y0, y1, c, x, lay) {
  const seg = (a, b, surf, sw) => { if (b - a < 0.005) return; const h = b - a, y = (a + b) / 2;
    if (face === 'f') zfront(k, w, h, c, x, y, surf, lay); else if (face === 'b') zback(k, w, h, c, x, y, surf, lay); else zside(k, face === 'l' ? -1 : 1, w, h, c, x, y, sw, lay); };
  seg(Math.max(y0, -0.02), y1, ZF.chest, ZF.chestW); seg(y0, Math.min(y1, -0.02), ZF.waist, ZF.waistW);
}
// a band round the chest or waist (a belt, a reflective stripe): a box just bigger than it
const zbandChest = (k, y, h, c, out) => zb(k, 0.5 + 2 * out, h, 0.3 + 2 * out, c, 0, y, 0);
const zbandWaist = (k, y, h, c, out) => zb(k, 0.42 + 2 * out, h, 0.26 + 2 * out, c, 0, y, 0);

// ---- the jobs: what they wore to work the day it ended ----
// each fills in the outfit: top (chest and waist), sleeve ('none', 'short', 'long', 'rolled') and its colour, legs
// ('long', 'shorts', 'bare') and their colour, shoes, gloves, hat, hair and anything else it carries (o.add: pieces
// added once the body's built, given the kits). w is how often each turns up among walkers, runners and brutes
const ZJOBS = {
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
      zb(K.torso, 0.46, 0.32, 0.34, vest, 0, 0.12, 0); zbandWaist(K.torso, -0.08, 0.14, vest, 0.016);
      for (let i = -1; i <= 1; i++) zb(K.torso, 0.1, 0.1, 0.05, zc(vest, 1.15), i * 0.12, -0.04, 0.18);
      zfront(K.torso, 0.16, 0.035, 0xd8d8d4, 0, 0.22, 0.17, 0.004); zback(K.torso, 0.3, 0.06, 0xd8d8d4, 0, 0.18, 0.17, 0.004);   // SWAT, front and back
      zb(K.torso, 0.06, 0.12, 0.05, 0x111214, -0.1, 0.18, 0.18);   // the radio on the plate
      // knee pads, and the thigh holster on the right
      ['L', 'R'].forEach(s => zb(K['shin' + s], 0.17, 0.08, 0.05, 0x161618, 0, -0.03, 0.115));
      zb(K.legR, 0.06, 0.15, 0.12, 0x141416, 0.105, -0.12, 0.0);
      zshoulderPatch(K, 0x26292e, 0xd8d8d4);
    });
  } },
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
      zb(K.torso, 0.48, 0.3, 0.33, 0x50563c, 0, 0.12, 0);   // the vest
      for (let i = -1; i <= 1; i++) zb(K.torso, 0.09, 0.1, 0.05, 0x44482f, i * 0.11, -0.02, 0.175);
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

// ---- dealing an outfit ----
const ZTYPE_I = { walker: 0, runner: 1, brute: 2 };
function zPickJob(type) {
  const i = ZTYPE_I[type] || 0; let tot = 0; for (const k in ZJOBS) tot += ZJOBS[k].w[i];
  let r = rand() * tot; for (const k in ZJOBS) { r -= ZJOBS[k].w[i]; if (r <= 0) return k; }
  return 'casual';
}
function zDeal(type, job) {
  const live = pick(ZSKIN_LIVE), dead = pick(ZROT);
  const o = { job: job || zPickJob(type), add: [], skin: zc(zmix(live, dead, rr(0.5, 0.74)), rr(0.8, 0.92)), rotCol: dead, hair: pick(['short', 'short', 'long', 'bald', 'balding', 'patchy', 'short']), hairCol: pick([0x2a2018, 0x3a2a1e, 0x5a4630, 0x8a8478, 0x1a1a1a, 0x6a3a1e, 0xa8a49c]),
    hat: 'none', hatCol: 0x2a2a2a, sleeve: 'short', legs: 'long', shoes: 'sneakers', gloves: 0, beard: rand() < 0.2, wear: rr(0.6, 1.3) };
  ZJOBS[o.job].f(o);
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
const ZTEETH = [0xbcb08a, 0xa89a72, 0xc8bc98, 0x8a7a58, 0xb0a07a];
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
  zb(H, F.jw, jh, 0.22, sk, F.jx, jy, 0.035, 0, 0, F.jr);                    // the jaw
  zb(H, 0.125, 0.1, 0.12, zc(sk, 0.92), 0, -0.19, -0.015);                   // the neck
  if (d > 0) {   // the mouth hanging open: the cheeks down to the jaw either side, the dark inside, the teeth
    const cw = (F.jw - F.mw) / 2;
    [-1, 1].forEach(s => zb(H, cw, d + 0.01, 0.2, sk, F.jx + s * (F.mw / 2 + cw / 2), lip - d / 2, 0.045));
    zb(H, F.mw, d + 0.012, 0.03, 0x2a1210, F.jx, lip - d / 2, 0.115);
    const nt = Math.round(F.mw / 0.017);
    for (let i = 0; i < nt; i++) { if (rand() < 0.28) continue; const th = rr(0.01, Math.min(0.02, d * 0.8)); zb(H, rr(0.011, 0.015), th, 0.016, pick(ZTEETH), F.jx - F.mw / 2 + (i + 0.5) * F.mw / nt + rr(-0.002, 0.002), lip - th / 2, 0.137, 0, 0, rr(-0.15, 0.15)); }
    for (let i = 0; i < nt - 1; i++) { if (rand() < 0.45) continue; const th = rr(0.008, Math.min(0.014, d * 0.6)); zb(H, rr(0.01, 0.014), th, 0.014, pick(ZTEETH), F.jx - F.mw / 2 + (i + 1) * F.mw / nt, lip - d + th / 2, 0.133); }
    jf(F.mw * 0.9, 0.012, dkLip, F.jx, lip - d - 0.006, 0.004);              // the lower lip
  } else fr(F.mw, 0.008, 0x2a1810, F.jx, lip + 0.008, 0.004, F.jr);          // shut: just the line of it
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
  if (F.drool) {   // run out of one corner of the mouth and down the chin, now and then the other too
    const ds = rand() < 0.5 ? -1 : 1, l = rr(0.03, jh);
    jf(rr(0.012, 0.018), l, blood, F.jx + ds * F.mw * rr(0.15, 0.4), lip - d - l / 2, 0.006);
    if (rand() < 0.3) { const l2 = rr(0.02, jh * 0.6); jf(0.01, l2, blood, F.jx - ds * F.mw * rr(0.2, 0.4), lip - d - l2 / 2, 0.006); }
    jf(F.mw * rr(0.3, 0.5), 0.012, blood, F.jx + ds * F.mw * 0.2, lip - d - 0.01, 0.005);
  }
  if (F.torn) {   // the cheek torn open from the corner of the mouth back toward the ear, the teeth along it
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
function zSpot(k, part, c, sz, lay) {
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
// ---- the wear: each mark somewhere it would come from, not scattered evenly over it ----
// rips where cloth gives (the shoulder seam, the side, the hem, the elbow, the knee), the skin showing grey through
// them; the hem and cuffs torn into strips, a sleeve or a trouser leg torn off; what it ate run down the front of it
// from the mouth; the bite that turned it, bled down the cloth under it; its hands red to the wrist; the knees muddy
// from going down on them, the back dirty from lying on it (and the grime that builds toward the hems and the feet is in
// the vertex colours: ZGRIME)
const ZRIP_AT = [[0.17, 0.24, 1], [0.13, -0.2, 1], [0.0, -0.24, 1], [0.06, 0.12, 0.4]];   // [x, y, how often] on the front, mirrored at random
function zRip(T, fn, cover, skin, x, y, f, lay, sz) {
  const w = sz * rr(0.9, 1.4), h = sz * rr(0.6, 1);
  fn(T, w + 0.014, h + 0.012, zc(cover, 0.72), x, y, f, lay - 0.003);   // the frayed edge, a shade darker
  fn(T, w, h, zc(skin, 0.82), x, y, f, lay);                           // the skin through it
  fn(T, w * 0.5, h * rr(0.4, 0.8), zc(skin, 0.82), x + rr(-0.5, 0.5) * w * 0.6, y - h * 0.45, f, lay);   // not a neat square: a second tear off it
  if (rand() < 0.5) fn(T, w * 0.7, h * 0.5, zc(cover, 0.9), x + rr(-0.3, 0.3) * w, y - h * 0.65, f, lay + 0.003);   // a flap hanging off it
}
function zTatter(K, o) {
  const w = o.wear, T = K.torso, cover = o.coat || o.top, lay = (o.shell || 0) + 0.012, blood = c => zmix(c, ZBLOOD, rr(0.55, 0.7)), mud = c => zmix(c, ZDIRT, rr(0.4, 0.55));
  // the rips, at the places cloth tears
  let nr = Math.round(rr(0.6, 2.2) * w);
  for (const [x, y, p] of ZRIP_AT) { if (nr <= 0) break; if (rand() > p * 0.6) continue; nr--; const sd = rand() < 0.5 ? -1 : 1, chest = y > -0.02;
    zRip(T, rand() < 0.7 ? zfront : zback, cover, o.skin, sd * x + rr(-0.02, 0.02), y + rr(-0.02, 0.02), chest ? ZF.chest : ZF.waist, lay, rr(0.035, 0.055)); }
  // the hem torn into a strip or two
  const nh = Math.round(rr(0.5, 2.5) * w);
  for (let i = 0; i < nh; i++) { const len = rr(0.03, 0.07); zb(T, rr(0.03, 0.055), len, 0.008, cover, rr(-0.17, 0.17), -0.3 - len / 2 + 0.012, (rand() < 0.6 ? 1 : -1) * (ZF.waist + 0.005), rr(-0.1, 0.1), 0, rr(-0.2, 0.2)); }
  // down the front from the mouth: a bib of it under the chin, run down in a stripe or two, drying darker at the top
  if (o.face.drool) {
    const x = o.face.jx + rr(-0.03, 0.03), b1 = blood(cover), l = rr(0.08, 0.2);
    zfront(T, rr(0.07, 0.11), rr(0.05, 0.08), zc(b1, 0.85), x, 0.27, ZF.chest, lay + 0.002);
    zfront(T, rr(0.04, 0.06), l, b1, x + rr(-0.015, 0.015), 0.25 - l / 2, ZF.chest, lay + 0.004);
    if (rand() < 0.6) { const l2 = rr(0.05, 0.12); zfront(T, 0.016, l2, b1, x + rr(0.03, 0.05) * (rand() < 0.5 ? -1 : 1), 0.24 - l2 / 2, ZF.chest, lay + 0.006); }
  }
  // the bite that turned it, and what it bled down the cloth under it (on a shoulder, a forearm or the side)
  const bite = pick(['shoulder', 'shoulder', 'fore', 'side', 'none']), bs = rand() < 0.5 ? -1 : 1, S = bs < 0 ? 'L' : 'R';
  if (bite === 'shoulder') { const b1 = blood(cover); zfront(T, 0.07, 0.06, zc(b1, 0.8), bs * 0.17, 0.25, ZF.chest, lay + 0.002); zfront(T, 0.05, rr(0.12, 0.22), b1, bs * 0.17, 0.12, ZF.chest, lay + 0.001); zfront(T, 0.03, 0.025, ZMEAT, bs * 0.17, 0.26, ZF.chest, lay + 0.006); }
  if (bite === 'side') { const b1 = blood(cover); zside(T, bs, 0.12, 0.2, b1, rr(-0.04, 0.04), -0.14, ZF.waistW, lay); zside(T, bs, 0.04, 0.035, ZMEAT, 0, -0.08, ZF.waistW, lay + 0.004); }
  if (bite === 'fore') { const fo = K['fore' + S], c = o.sleeve === 'long' ? blood(o.sleeveCol || cover) : zmix(o.skin, ZBLOOD, 0.5); zb(fo, 0.006, 0.07, 0.12, c, bs * 0.069, 0, 0.15); zb(fo, 0.006, 0.04, 0.045, ZMEAT, bs * 0.072, 0, 0.12); }
  // the arms: a ragged end to each sleeve, a sleeve torn away below the elbow, an elbow worn through
  ['L', 'R'].forEach(S => {
    const s = S === 'L' ? -1 : 1, up = K['arm' + S], fo = K['fore' + S], sl = o.sleeveCol || cover;
    if (o.sleeve === 'short') for (let i = 0; i < 2; i++) zb(up, 0.025, 0.006, rr(0.02, 0.04), sl, rr(-0.05, 0.05), (rand() < 0.5 ? 1 : -1) * 0.079, 0.158);
    if (o.sleeve === 'long') {
      if (rand() < 0.2 * w) { zb(fo, 0.136, 0.136, 0.2, o.skin, 0, 0, 0.17); for (let i = 0; i < 3; i++) zb(fo, 0.025, 0.006, rr(0.03, 0.05), sl, rr(-0.05, 0.05), (rand() < 0.5 ? 1 : -1) * 0.071, 0.075); }
      else if (rand() < 0.3 * w) { zb(up, 0.006, 0.05, 0.05, zc(sl, 0.7), 0, -0.074, 0.25); zb(up, 0.006, 0.036, 0.036, zc(o.skin, 0.82), 0, -0.077, 0.25); }   // the elbow worn through
    }
  });
  // the hands red to the wrist (or the gloves dark with it)
  if (rand() < 0.55) ['foreL', 'foreR'].forEach(p => { if (rand() < 0.8) zb(K[p], 0.114, 0.074, 0.134, zmix(o.gloves || o.skin, ZBLOOD, rr(0.4, 0.6)), 0, -0.005, 0.345); });
  // the legs: muddy knees, a knee torn through, frayed cuffs, sometimes a leg of the trousers torn off below the knee
  if (o.legs === 'long') ['L', 'R'].forEach(S => {
    const th = K['leg' + S], sh = K['shin' + S], pc = o.pants;
    if (rand() < 0.6) zb(sh, 0.15, rr(0.05, 0.09), 0.006, mud(pc), rr(-0.01, 0.01), -0.04, 0.111);
    if (rand() < 0.35 * w) { zfront(th, 0.075, 0.05, zc(pc, 0.7), rr(-0.02, 0.02), -0.255, 0.11, 0.008); zfront(th, 0.06, 0.036, zc(o.skin, 0.82), rr(-0.02, 0.02), -0.255, 0.11, 0.012); }
    if (rand() < 0.15 * w) { zb(sh, 0.19, 0.12, 0.22, o.skin, 0, -0.16, 0); for (let i = 0; i < 3; i++) zb(sh, 0.03, rr(0.03, 0.05), 0.006, pc, rr(-0.07, 0.07), -0.1, (i % 2 ? 1 : -1) * 0.111); }
    else if (o.shoes !== 'boots') for (let i = 0; i < 2; i++) zb(sh, 0.025, rr(0.02, 0.035), 0.006, pc, rr(-0.07, 0.07), -0.2, (i % 2 ? 1 : -1) * 0.111);
  });
  // the back: dirt from lying on it
  if (rand() < 0.6) zback(T, rr(0.22, 0.34), rr(0.14, 0.24), zmix(cover, ZDIRT, rr(0.25, 0.4)), rr(-0.05, 0.05), rr(-0.15, 0.05), ZF.chest, lay - 0.004);
}
// ---- the rot: a bruise or two on bare skin, now and then a belly torn open to the ribs or bone at the temple ----
function zRot(K, o) {
  const bare = ['foreL', 'foreR', 'shinL', 'shinR', 'armL', 'armR'].filter(p => !((p[0] === 's' && o.legs === 'long') || (p[0] === 'a' && o.sleeve !== 'none') || (p[0] === 'f' && o.sleeve === 'long')));
  for (let i = 0; i < 2 && bare.length; i++) if (rand() < 0.6) { const p = pick(bare); zSpot(K[p], p, zmix(o.skin, o.bruise, 0.7), rr(0.05, 0.08), 0.003); }
  if (rand() < 0.15 * o.wear) {   // the belly torn open, bled down the front of what it's wearing
    const x = rr(-0.08, 0.08), y = rr(-0.12, 0.04), f = y > -0.02 ? ZF.chest : ZF.waist, L = (o.shell || 0) + 0.016, cv = o.coat || o.top, ry = Math.max(-0.22, y - 0.08);
    zfront(K.torso, 0.07, rr(0.1, 0.2), zmix(cv, ZBLOOD, 0.6), x + rr(-0.01, 0.01), ry, ry > -0.02 ? ZF.chest : ZF.waist, L - 0.004);
    zRip(K.torso, zfront, cv, ZMEAT, x, y, f, L, 0.08);
    zfront(K.torso, 0.04, 0.025, 0x2a1210, x + rr(-0.01, 0.01), y, f, L + 0.006);
  }
  if (rand() < 0.12) { const s = rand() < 0.5 ? -1 : 1, hx = o.face.hw / 2; zb(K.head, 0.006, 0.06, 0.08, ZMEAT, s * (hx + 0.003), 0.06, -0.04); zb(K.head, 0.006, 0.03, 0.04, ZBONE, s * (hx + 0.006), 0.06, -0.04); }   // the skull showing at the temple
}
// the grime that builds up toward the ends of things, in the vertex colours: [axis, where it starts, where it's
// heaviest, how heavy]; the head's is the shadow under the jaw
const ZGRIME = { torso: [1, 0.1, -0.3, 0.22], head: [1, -0.1, -0.24, 0.4], foreL: [2, 0.12, 0.42, 0.22], foreR: [2, 0.12, 0.42, 0.22], legL: [1, -0.05, -0.29, 0.1], legR: [1, -0.05, -0.29, 0.1], shinL: [1, -0.02, -0.28, 0.32], shinR: [1, -0.02, -0.28, 0.32] };
const _zgD = new THREE.Color(zc(ZDIRT, 0.55));
function zGrime(k, gr) {
  if (!gr) return; const [ax, a, b, amt] = gr;
  for (let i = 0; i < k.p.length; i += 3) { const t = clamp((k.p[i + ax] - a) / (b - a), 0, 1), m = amt * t * t * (3 - 2 * t); if (m <= 0) continue; for (let j = 0; j < 3; j++) k.c[i + j] += ((j === 0 ? _zgD.r : j === 1 ? _zgD.g : _zgD.b) - k.c[i + j]) * m; }
}

// the same between parts, which are meshes of their own: the left and right legs meet as it walks, the forearm runs up
// inside the upper arm, and their faces would line up on one plane and flicker. Each limb is shifted by its own
// fraction of a millimetre (too little to see), so no two parts ever share a plane
const ZNUDGE = { legL: [0.0004, 0.0003, 0.0009], legR: [-0.0004, 0.0006, -0.0005], shinL: [0.0006, -0.0004, 0.0013], shinR: [-0.0006, 0.0008, -0.0011], armL: [0.0005, 0.0009, 0.0006], armR: [-0.0005, -0.0007, 0.0012], foreL: [-0.0011, 0.0005, -0.0008], foreR: [0.0011, -0.0010, 0.0007] };
// ---- dressing a zombie that's just been built: its parts get their geometry, all of them its own material ----
function dressZombie(m, type, job) {
  const o = zDeal(type, job), K = zBuild(o, type === 'brute'), mat = lam(0xffffff, { vertexColors: true });
  ZPARTS.forEach(p => { zGrime(K[p], ZGRIME[p]); m[p].geometry = zBake(K[p]); if (ZNUDGE[p]) m[p].geometry.translate(...ZNUDGE[p]); m[p].material = mat; });
  m.mats = { body: mat }; m.look = o; m.skinCol = o.skin;
  return o;
}
