// What lies past each outdoor arena map, so it never just stops: ground running on out into the fog at the same level
// as the map's own (a hand under it, so the two never fight), and the place the map's a part of standing all round it
// out to the fog, nearest first and thinning out, none of it nearer than OUTER.near past the map's edge (so nothing out
// there is ever mistaken for part of the fight, and the camera from above never has it in the way). By the map:
//  - town (Hawthorne Square, Saltmarsh Quay's landward sides): terraces of two and three storeys in brick and render
//    under pitched slate roofs, a chimney here and there, the odd gap where one's burned out
//  - industrial (Yard 4): warehouses in corrugated sheet, stacks of containers, a light tower now and then
//  - farmland (Harlan Farm): fields, hedgerows along them, a copse of trees, a barn and a silo far off
//  - roadside (Route 9): scrub, a few low buildings left along the road, billboards, power poles
// The sea south of the quay runs on out as dark water under the map's own harbour (world/arena-small.js).
// All of it merged into a few meshes per map, built once with the map (world/arena.js arBuildMap).

import { seeded } from '../core/math.js';
import { lam, lit } from '../core/shaders.js';
import { mergeInto } from '../core/geometry.js';
import { cxw } from './grid.js';

// how near past the map's edge the first of it stands, how far out it goes, the ground's size (m)
const OUTER = { near: 9, far: 75, ground: 460 };
const OT = {
  // (clear: on the west and east sides, nothing from z0 to z1 nearer than d, where the map's own road out runs: the
  // square's up to the terrace across its end, the quay's into the headland it tunnels through, world/arena-small.js)
  square: { theme: 'town', ground: 0x56524b, clear: [-16, 16, 26] },
  quay: { theme: 'town', ground: 0x58554f, sea: 'south', clear: [-17, 14, 58] },
  yard: { theme: 'industrial', ground: 0x5c554b },
  farm: { theme: 'farm', ground: 0x5d5a3e },
  route: { theme: 'roadside', ground: 0x6a5c48 }
};
const tall = c => lit(lam(c), 'tree');
const OM = {
  brick: [tall(0x6e3c30), tall(0x7a4636), tall(0x5e3428)], render: [tall(0xb8b0a0), tall(0xa89c86), tall(0x9aa4a2), tall(0xb4a48e)], slate: tall(0x3a3e44),
  shed: [tall(0x56646a), tall(0x6a5440), tall(0x5e6a5c), tall(0x767670)], box: [tall(0x8a3a2a), tall(0x2f5a7a), tall(0xa86a2a), tall(0x3e6a4a), tall(0x6a6a6a)],
  steel: tall(0x4a4e52), hedge: tall(0x3a4a2a), tree: tall(0x34402a), trunk: tall(0x3a2e24), barn: tall(0x6e3026), silo: tall(0x9a9c98), board: tall(0xd8d0bc), pole: tall(0x4a3e32),
  sea: lam(0x1f3038)
};
export function arOuter(M, g) {
  const T = OT[M.id]; if (!T || M.indoor) return;
  const x0 = cxw(M.b[0]) - 0.5, x1 = cxw(M.b[2]) + 0.5, z0 = cxw(M.b[1]) - 0.5, z1 = cxw(M.b[3]) + 0.5, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const r = seeded([...M.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 11) >>> 0), parts = [], put = (w, h, d, mat, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.castShadow = false; m.receiveShadow = true; parts.push(m); return m; };
  // ---- the ground, on out into the fog (and the sea, past the quay)
  const G = OUTER.ground;
  if (T.sea === 'south') {
    const land = new THREE.Mesh(new THREE.PlaneGeometry(G, G / 2 + (z1 - cz)), lam(T.ground)); land.rotation.x = -Math.PI / 2; land.position.set(cx, -0.04, z1 - (G / 2 + (z1 - cz)) / 2 - 0.02); land.receiveShadow = true; g.add(land);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(G, G / 2), OM.sea); sea.rotation.x = -Math.PI / 2; sea.position.set(cx, -1.7, z1 + G / 4); g.add(sea);
  } else { const gr = new THREE.Mesh(new THREE.PlaneGeometry(G, G), lam(T.ground)); gr.rotation.x = -Math.PI / 2; gr.position.set(cx, -0.04, cz); gr.receiveShadow = true; g.add(gr); }
  // ---- what stands round it: along each side (not the sea), rows out from the edge, nearest first
  const sides = [['n', z0], ['s', z1], ['w', x0], ['e', x1]].filter(([s]) => !(T.sea === 'south' && s === 's'));
  for (const [s, e] of sides) {
    const along = s === 'n' || s === 's', lo = (along ? x0 : z0) - OUTER.far * 0.8, hi = T.sea === 'south' && !along ? z1 - 2 : (along ? x1 : z1) + OUTER.far * 0.8, out = s === 'n' || s === 'w' ? -1 : 1;   // (nothing standing out in the sea)
    for (let d = OUTER.near; d < OUTER.far; d += 0) {
      let a = lo;
      const rowD = T.theme === 'town' ? 9 : T.theme === 'industrial' ? 16 : T.theme === 'farm' ? 22 : 18;
      while (a < hi) {
        const at = (u, v) => along ? [u, e + out * v] : [e + out * v, u];   // (u along the side, v out from it)
        if (!along && T.clear && d < T.clear[2] && a + 9 > T.clear[0] && a < T.clear[1]) { a += 1; continue; }
        const step = OUTER_ITEM[T.theme](put, r, at, a, d, along, out, rowD);
        a += step;
      }
      d += rowD + r() * 4;
    }
  }
  const og = new THREE.Group(); g.add(og);
  for (const m of parts) og.add(m);
  mergeInto(og, parts);
}
// one thing (or a few) at u along the side, v out from it; returns how far along to the next
const OUTER_ITEM = {
  town(put, r, at, u, v, along, out) {
    if (r() < 0.08) return 6 + r() * 6;   // (a gap: one burned out, or a yard)
    const w = 5 + r() * 4, d = 6 + r() * 3, h = (v < 15 ? 6 : 7) + Math.floor(r() * 3) * 2.6, mat = r() < 0.5 ? OM.brick[Math.floor(r() * 3)] : OM.render[Math.floor(r() * 4)];
    const [x, z] = at(u + w / 2, v + d / 2);
    put(along ? w : d, h, along ? d : w, mat, x, h / 2, z);
    const rf = put(along ? w + 0.2 : d * 0.75, 0.15, along ? d * 0.75 : w + 0.2, OM.slate, x, h + 1.0, z); if (along) rf.rotation.x = 0.55 * (r() < 0.5 ? 1 : -1); else rf.rotation.z = 0.55 * (r() < 0.5 ? 1 : -1);
    if (r() < 0.45) { const [cxc, czc] = at(u + w * (0.25 + r() * 0.5), v + d * 0.4); put(0.6, 1.4, 0.6, OM.brick[2], cxc, h + 1.4, czc); }
    return w;
  },
  industrial(put, r, at, u, v, along) {
    const k = r();
    if (k < 0.45) {   // a warehouse
      const w = 14 + r() * 12, d = 10 + r() * 8, h = 7 + r() * 5, [x, z] = at(u + w / 2, v + d / 2), mat = OM.shed[Math.floor(r() * 4)];
      put(along ? w : d, h, along ? d : w, mat, x, h / 2, z); put(along ? w + 0.4 : d + 0.4, 0.4, along ? d + 0.4 : w + 0.4, OM.steel, x, h + 0.2, z);
      return w + 3 + r() * 6;
    }
    if (k < 0.85) {   // containers, stacked one to three high
      const n = 1 + Math.floor(r() * 3), [x, z] = at(u + 3.1, v + 1.3);
      for (let q = 0; q < n; q++) put(along ? 6.1 : 2.45, 2.6, along ? 2.45 : 6.1, OM.box[Math.floor(r() * 5)], x, 1.3 + q * 2.6, z, (r() - 0.5) * 0.04);
      return 7 + r() * 4;
    }
    { const [x, z] = at(u + 1, v + 2); put(0.5, 18, 0.5, OM.steel, x, 9, z); put(2.2, 0.8, 0.6, OM.steel, x, 18.2, z); return 10 + r() * 10; }   // a light tower
  },
  farm(put, r, at, u, v, along) {
    const k = r();
    if (k < 0.5) { const L = 18 + r() * 20, [x, z] = at(u + L / 2, v + 0.6); put(along ? L : 1.4, 1.6 + r() * 0.6, along ? 1.4 : L, OM.hedge, x, 0.9, z); return L + 4 + r() * 6; }   // a hedgerow along a field's edge
    if (k < 0.85) {   // a copse
      const n = 3 + Math.floor(r() * 5);
      for (let q = 0; q < n; q++) { const [x, z] = at(u + r() * 9, v + r() * 7), h = 6 + r() * 6; put(0.35, h * 0.45, 0.35, OM.trunk, x, h * 0.22, z); put(3 + r() * 2, h * 0.65, 3 + r() * 2, OM.tree, x, h * 0.62, z, r() * 3); }
      return 14 + r() * 10;
    }
    { const [x, z] = at(u + 6, v + 5); put(along ? 12 : 9, 7, along ? 9 : 12, OM.barn, x, 3.5, z); const rf = put(along ? 12.4 : 6.5, 0.2, along ? 6.5 : 12.4, OM.slate, x, 7.9, z); if (along) rf.rotation.x = 0.6; else rf.rotation.z = 0.6;
      if (r() < 0.6) { const [sx, sz] = at(u + 14, v + 4); put(4, 12, 4, OM.silo, sx, 6, sz); put(4.4, 0.6, 4.4, OM.steel, sx, 12.3, sz); return 24 + r() * 10; }   // (and a silo by it)
      return 20 + r() * 12; }
  },
  roadside(put, r, at, u, v, along) {
    const k = r();
    if (k < 0.3) { const w = 7 + r() * 8, d = 6 + r() * 5, h = 3.5 + r() * 2.5, [x, z] = at(u + w / 2, v + d / 2); put(along ? w : d, h, along ? d : w, OM.render[Math.floor(r() * 4)], x, h / 2, z); put(along ? w + 0.6 : d + 0.6, 0.3, along ? d + 0.6 : w + 0.6, OM.steel, x, h + 0.15, z); return w + 10 + r() * 14; }
    if (k < 0.5) { const [x, z] = at(u + 2, v + 1); for (const o of [-1.6, 1.6]) { const [px, pz] = at(u + 2 + o, v + 1); put(0.25, 6, 0.25, OM.pole, px, 3, pz); } put(along ? 5 : 0.2, 2.6, along ? 0.2 : 5, OM.board, x, 6.6, z); return 18 + r() * 14; }   // a billboard
    if (k < 0.75) { const [x, z] = at(u, v + 3); put(0.3, 9, 0.3, OM.pole, x, 4.5, z); put(along ? 0.2 : 2.4, 0.15, along ? 2.4 : 0.2, OM.pole, x, 8.4, z); return 14 + r() * 6; }   // a power pole
    { const [x, z] = at(u + 2, v + 2), h = 4 + r() * 3; put(0.3, h, 0.3, OM.trunk, x, h / 2, z); for (let q = 0; q < 3; q++) put(0.12, 1.8, 0.12, OM.trunk, x + (r() - 0.5) * 0.8, h - 0.5, z + (r() - 0.5) * 0.8, r() * 3); return 10 + r() * 12; }   // a dead tree
  }
};
