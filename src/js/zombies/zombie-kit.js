// What zombies are built of: boxes in each part's frame baked into one geometry (zb, zBake), the colours
// clothes and skin come in, and the body's measures in each part's frame (zombies/zombie-looks.js puts them together).

import { V3 } from '../core/renderer.js';
import { rr } from '../core/math.js';

// ---- the kit: boxes in a part's frame, baked into one geometry ----
const _zkG = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), _zkPA = _zkG.attributes.position.array, _zkNA = _zkG.attributes.normal.array;
const _zkM = new THREE.Matrix4(), _zkQ = new THREE.Quaternion(), _zkE = new THREE.Euler(), _zkT = new V3(), _zkS = new V3(), _zkN = new V3(), _zkC = new THREE.Color();
export const zKit = () => ({ p: [], n: [], c: [] });
// a box w by h by d of colour c, its middle at (x, y, z) in the part's frame, turned by (rx, ry, rz)
export function zb(k, w, h, d, c, x, y, z, rx, ry, rz) {
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
export function zBake(k) {
  zLayer(k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(k.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(k.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(k.c, 3));
  g.computeBoundingBox(); g.computeBoundingSphere(); g.userData.zg = true;
  return g;
}
// a zombie's own geometry let go of once it's off the scene for good (a body cleared away, a limb rotted off the ground)
export function zFree(root) { if (root) root.traverse(o => { if (o.isMesh && o.geometry && o.geometry.userData.zg && !o.userData.isOutline) o.geometry.dispose(); }); }

// ---- colours ----
export const zc = (c, k) => { const o = new THREE.Color(c).multiplyScalar(k); return o.setRGB(Math.min(1, o.r), Math.min(1, o.g), Math.min(1, o.b)).getHex(); };
export const zmix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
// the colours clothes are really dyed (heathers, navies, olives, maroons, khakis, faded reds, stone), picked from
// rather than any hue at all, which gives magentas and limes nobody wears; and the colours a sneaker's flash comes in
export const ZDYE = [0x6e7a8a, 0x8a8478, 0x5a2e2e, 0x2e3e5e, 0x4a5a3a, 0x9a8a5a, 0x6a3a2a, 0x3a5a6a, 0x8a4a3a, 0x5a4a6a, 0x7a8a9a, 0x4a3a2e, 0xb0a890, 0x9a3a32, 0x3e4a3e];
export const ZFLASH = [0x9a2a22, 0x2a4a8a, 0x2a2a2c, 0x8a8a8a, 0x3a6a3a, 0xb8902a, 0xd8d4cc];
// clothes that have been through it: a little faded toward the colour of dirt, a little darker
export const ZDIRT = 0x4e4636, worn = (c, k) => zc(zmix(c, ZDIRT, k === undefined ? rr(0.12, 0.28) : k), rr(0.86, 0.96));
// the living colour of someone's skin, gone grey-green, sallow or bruise-blue with death
export const ZSKIN_LIVE = [0xf2cfae, 0xe3b48f, 0xd2a07c, 0xbd8761, 0x9c6a46, 0x7a4e32, 0x5a3824];
export const ZROT = [0x728a62, 0x7c8a78, 0x8a9070, 0x6c7a7e, 0x7a8866];
export const ZBLOOD = 0x4a120e, ZMEAT = 0x7a1c16, ZBONE = 0xcfc6ae;

// ---- the body's measures in each part's frame (zombies/zombie-anim.js: the rig) ----
// the chest and waist: the chest's front is ZF.chest out, the waist's ZF.waist
export const ZF = { chest: 0.15, waist: 0.13, chestW: 0.25, waistW: 0.21 };
// a thin panel on a face: lay is how far proud of the surface (so pieces stacked on each other never share a plane)
export const zfront = (k, w, h, c, x, y, surf, lay) => zb(k, w, h, 0.006, c, x, y, surf + (lay || 0.004));
export const zback = (k, w, h, c, x, y, surf, lay) => zb(k, w, h, 0.006, c, x, y, -surf - (lay || 0.004));
export const zside = (k, s, w, h, c, z, y, surf, lay) => zb(k, 0.006, h, w, c, s * (surf + (lay || 0.004)), y, z);
// a strip running down the trunk across both the chest and the waist (a zip, a placket, a stripe): split where the
// chest steps in to the waist so each half lies on its own face. face 'f', 'b', 'l' or 'r'; on a side, x is along z
export function ztall(k, face, w, y0, y1, c, x, lay) {
  const seg = (a, b, surf, sw) => { if (b - a < 0.005) return; const h = b - a, y = (a + b) / 2;
    if (face === 'f') zfront(k, w, h, c, x, y, surf, lay); else if (face === 'b') zback(k, w, h, c, x, y, surf, lay); else zside(k, face === 'l' ? -1 : 1, w, h, c, x, y, sw, lay); };
  seg(Math.max(y0, -0.02), y1, ZF.chest, ZF.chestW); seg(y0, Math.min(y1, -0.02), ZF.waist, ZF.waistW);
}
// a band round the chest or waist (a belt, a reflective stripe): a box just bigger than it
export const zbandChest = (k, y, h, c, out) => zb(k, 0.5 + 2 * out, h, 0.3 + 2 * out, c, 0, y, 0);
export const zbandWaist = (k, y, h, c, out) => zb(k, 0.42 + 2 * out, h, 0.26 + 2 * out, c, 0, y, 0);
