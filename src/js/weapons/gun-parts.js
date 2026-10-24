// Part builders for the gun models: cylinders and rings along the bore, profiles extruded from traced outlines,
// lathes, tapers, stippling and checkering, and the caches that keep shared shapes built once.

import { box, cylZ, sharedGeo } from '../core/geometry.js';
import { GM, X } from './gun-materials.js';

// small builders for gun parts: cylinders along the bore, rings, and a light strip that fakes a top-edge highlight. Any
// cylinder barrel-sized or bigger gets sides enough for its size (about one per millimetre of radius), so a barrel, a
// can or a tube always reads round, never faceted
export const cyl = (g, r, len, mat, x, y, z, seg) => { const m = cylZ(r, len, mat, Math.max(seg || 10, r >= 0.008 ? Math.min(48, Math.round(r * 900)) : 0)); m.position.set(x, y, z); g.add(m); return m; };
export const ring = (g, r, w, mat, x, y, z) => cyl(g, r, w, mat, x, y, z, 14);
export const hi = (g, w, d, x, y, z) => box(g, w, 0.007, d, GM.hi, x, y, z);
// A gun's pieces come out the same every time it's built, and it's built again whenever anything on it changes (an
// attachment, a mod), for you and for every teammate who sees it; so the slow ones (the profiles, the stippling, the
// squeezed stocks) are kept once made, by what they were made from, and shared by every build after. Nothing changes a
// piece once it's built, and the cached boxes' rule holds for them: binModel (core/geometry.js) leaves them be
function kept(M, cap, key, make) {
  let geo = M.get(key);
  if (geo !== undefined) { M.delete(key); M.set(key, geo); return geo; }   // (the most recently used last)
  geo = make(); if (geo) sharedGeo.add(geo); M.set(key, geo);
  if (M.size > cap) { const k0 = M.keys().next().value, g0 = M.get(k0); if (g0) sharedGeo.delete(g0); M.delete(k0); }   // (let go of with its gun, then)
  return geo;
}
const PROFILES = new Map();
// a side profile (points in z, y) pushed out to width w across the gun and centred on x, with a soft bevel if asked
export function profile(g, shape, w, mat, x, bev, segs) {
  const pts = (Array.isArray(shape) ? shape : [shape]).map(sh => { const e = sh.extractPoints(8); return [e.shape.map(v => [v.x, v.y]), e.holes.map(h => h.map(v => [v.x, v.y]))]; });
  const geo = kept(PROFILES, 2000, JSON.stringify([pts, w, bev || 0, segs || 1]), () => {
    const geo = new THREE.ExtrudeGeometry(shape, bev ? { depth: w, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: segs || 1, curveSegments: 8 } : { depth: w, bevelEnabled: false, curveSegments: 8 });
    geo.translate(0, 0, -w / 2); geo.rotateY(-Math.PI / 2);   // the outline's x runs down the gun (+z), the width across it
    return geo;
  });
  const m = new THREE.Mesh(geo, mat); m.position.x = x; m.castShadow = true; g.add(m); return m;
}
// a port cut through a profile (w wide, bevel bev) should only show on the shooter's right: plug the left half of the
// cut with the body's own material, flush with its outside, and put a dark wall down the middle
export function portFill(g, z0, y0, z1, y1, w, bev, mat) {
  const h = w / 2 + bev; box(g, h, y1 - y0, z1 - z0, mat, X + h / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  box(g, 0.002, y1 - y0, z1 - z0, GM.rubber, X - 0.001, (y0 + y1) / 2, (z0 + z1) / 2);
}
// a bevel grows a profile's outline by its size all round: pull a traced outline in by d first so it comes out the size
// it was traced at (a negative d pushes it out, for the hole through a bevelled piece)
// is X near the edge B..C (within span of both ends), so joining the neighbours there doesn't throw a spike out
const t1ok = (X0, B, C, span) => Math.hypot(X0[0] - B[0], X0[1] - B[1]) < span && Math.hypot(X0[0] - C[0], X0[1] - C[1]) < span;
export function inset(pts, d) {
  let P = pts.slice(), Q = P;
  for (let it = 0; it < 60; it++) {
    const n = P.length; if (n < 4) break;
    let a = 0; for (let i = 0; i < n; i++) a += P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1];
    const sg = a > 0 ? 1 : -1, N = P.map((p, i) => { const q = P[(i + 1) % n], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [-(q[1] - p[1]) / l * sg, (q[0] - p[0]) / l * sg]; });
    // each corner moves to where its two edges, pushed in by d, now meet (capped, so a sharp point doesn't shoot off)
    Q = P.map((p, i) => {
      const h = (i + n - 1) % n, n1 = N[h], n2 = N[i], c = n1[0] * n2[1] - n1[1] * n2[0];
      if (Math.abs(c) < 1e-6) return [p[0] + n2[0] * d, p[1] + n2[1] * d];
      let mx = n1[0] + n2[0], my = n1[1] + n2[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      const k = Math.sign(d) * Math.min(Math.abs(d) * 3, Math.abs(d) / Math.max(0.05, mx * n1[0] + my * n1[1])); return [p[0] + mx * k, p[1] + my * k];
    });
    // an edge shorter than the inset that turned round has folded over: take it out by running the edges either side of
    // it on until they meet, so the long traced edges keep their lines (only if they meet near it; otherwise drop its
    // far corner) and go again
    let bad = -1; for (let i = 0; i < n; i++) { const j = (i + 1) % n; if ((P[j][0] - P[i][0]) * (Q[j][0] - Q[i][0]) + (P[j][1] - P[i][1]) * (Q[j][1] - Q[i][1]) < 0) { bad = i; break; } }
    if (bad < 0) break;
    const i = bad, j = (i + 1) % n, h = (i + n - 1) % n, k = (j + 1) % n, A = P[h], B = P[i], C = P[j], D = P[k];
    const d1x = B[0] - A[0], d1y = B[1] - A[1], d2x = D[0] - C[0], d2y = D[1] - C[1], den = d1x * d2y - d1y * d2x;
    let X0 = null;
    if (Math.abs(den) > 1e-12) { const t = ((C[0] - A[0]) * d2y - (C[1] - A[1]) * d2x) / den; X0 = [A[0] + d1x * t, A[1] + d1y * t]; }
    const span = Math.hypot(C[0] - B[0], C[1] - B[1]) + Math.abs(d) * 2;
    if (X0 && t1ok(X0, B, C, span) && n > 4) P = P.map((q, m) => m === i ? X0 : q).filter((_, m) => m !== j);
    else P = P.filter((_, m) => m !== j);
  }
  return Q;
}
// where a traced edge (a run of [z, y] points, top to bottom or bottom to top) is at height y
export function zAt(P, y) { for (let i = 0; i < P.length - 1; i++) if ((y - P[i][1]) * (y - P[i + 1][1]) <= 0) return P[i][0] + (P[i + 1][0] - P[i][0]) * (y - P[i][1]) / ((P[i + 1][1] - P[i][1]) || 1); return P[Math.abs(y - P[0][1]) < Math.abs(y - P[P.length - 1][1]) ? 0 : P.length - 1][0]; }
// a rounded solid from a traced side outline (points in z, y): W thick in all, its edges rounded over r in three
// steps, and still the traced size from the side (grips, stocks and forends, so they don't read as flat slabs)
export function solid(g, pts, W, mat, x, r, holes) { return profile(g, shp(inset(pts, r), holes), Math.max(0.001, W - 2 * r), mat, x, r, 3); }
// a smooth function through [z, value] points, eased between them (flat past the ends)
export const pw = P => Object.assign(z => { if (z <= P[0][0]) return P[0][1]; for (let i = 1; i < P.length; i++) if (z <= P[i][0]) { const t = (z - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * (1 - Math.cos(Math.PI * t)) / 2; } return P[P.length - 1][1]; }, { key: JSON.stringify(P) });   // (its key: taperX keeps what it squeezed by it)
// the part of the outline P (points in z, y) inside the convex polygon C, so a panel can never run past the edge
export function clipTo(P, C) {
  let out = P; const n = C.length; let a = 0; for (let i = 0; i < n; i++) a += C[i][0] * C[(i + 1) % n][1] - C[(i + 1) % n][0] * C[i][1];
  for (let i = 0; i < n && out.length; i++) {
    const A = C[i], B = C[(i + 1) % n], f = q => ((B[0] - A[0]) * (q[1] - A[1]) - (B[1] - A[1]) * (q[0] - A[0])) * (a > 0 ? 1 : -1), inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}
// is the point (z, y) inside the outline P
function inPoly(P, z, y) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && z < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; }
// every point of P outside the outline O moved onto O's nearest edge, so a panel laid on a face stays on it
export function pullInside(P, O) {
  return P.map(([z, y]) => {
    if (inPoly(O, z, y)) return [z, y];
    let best = null, bd = Infinity;
    for (let i = 0; i < O.length; i++) {
      const a = O[i], b = O[(i + 1) % O.length], ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((z - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
      const q = [a[0] + ex * t, a[1] + ey * t], d = Math.hypot(q[0] - z, q[1] - y); if (d < bd) { bd = d; best = q; }
    }
    return best;
  });
}
// stippling on both sides: a lighter patch (poly, points in z, y) on the faces at X +- xo, dotted all over with tiny
// bumps on a jittered grid gap apart (one mesh, kept)
const STIPPLE = new Map();
export function stipple(g, poly, xo, gap, mat, dotMat) {
  if (poly.length < 3) return;
  [-1, 1].forEach(sd => profile(g, shp(poly), 0.0008, mat, X + sd * xo, 0.0002));
  const geo = kept(STIPPLE, 200, JSON.stringify([poly, xo, gap, X]), () => stippleDots(poly, xo, gap)); if (geo) g.add(new THREE.Mesh(geo, dotMat));
}
function stippleDots(poly, xo, gap) {
  const zs = poly.map(p => p[0]), ys = poly.map(p => p[1]), pos = [], bx = new THREE.BoxGeometry(0.0011, 0.0011, 0.0011).toNonIndexed(); let k = 0;
  for (let y = Math.min(...ys) + gap / 2; y < Math.max(...ys); y += gap * 0.87) for (let z = Math.min(...zs) + gap / 2 + (k++ % 2) * gap / 2; z < Math.max(...zs); z += gap) {
    const jz = z + (Math.sin(z * 9137 + y * 4271) * 0.3) * gap, jy = y + (Math.sin(z * 3571 - y * 7919) * 0.3) * gap; if (!inPoly(poly, jz, jy)) continue;
    [-1, 1].forEach(sd => { const gg = bx.clone(); gg.translate(X + sd * (xo + 0.0006), jy, jz); pos.push(gg.attributes.position.array); });
  }
  if (!pos.length) return null;
  const P = new Float32Array(pos.reduce((n, a) => n + a.length, 0)); let at = 0; pos.forEach(a => { P.set(a, at); at += a.length; });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.computeVertexNormals();
  return geo;
}
// checkering on both sides of a stock: a dark panel (poly, points in z, y) lying on the faces at X +- xo, and two
// crossing sets of fine raised lines over it (gap apart, at +-ang to the gun), each cut off at the panel's edge so none
// of them run past it (walnut unless the panel and line materials are given)
export function checker(g, poly, xo, gap, ang, pm, lm) {
  if (poly.length < 3) return;
  [-1, 1].forEach(sd => profile(g, shp(poly), 0.0012, pm || GM.walnutD, X + sd * (xo - 0.0002), 0.0003));   // its face 0.7 mm proud
  const pos = [], bx = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  [ang, -ang].forEach(an => {
    const dz = Math.cos(an), dy = Math.sin(an), nz = -dy, ny = dz, ds = poly.map(p => p[0] * nz + p[1] * ny);
    for (let d = Math.min(...ds) + gap / 2; d < Math.max(...ds); d += gap) {
      const ts = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], r = poly[(i + 1) % poly.length], fp = p[0] * nz + p[1] * ny - d, fr = r[0] * nz + r[1] * ny - d;
        if ((fp < 0) !== (fr < 0)) { const t = fp / (fp - fr); ts.push((p[0] + (r[0] - p[0]) * t) * dz + (p[1] + (r[1] - p[1]) * t) * dy); }
      }
      ts.sort((u, v) => u - v);
      for (let k = 0; k + 1 < ts.length; k++) {
        const s0 = ts[k] + 0.001, s1 = ts[k + 1] - 0.001; if (s1 - s0 < 0.003) continue;
        const sm = (s0 + s1) / 2; if (!inPoly(poly, sm * dz + d * nz, sm * dy + d * ny)) continue;   // keep only the stretches inside
        [-1, 1].forEach(sd => {
          mx.compose(new THREE.Vector3(X + sd * (xo + 0.0011), sm * dy + d * ny, sm * dz + d * nz), q.setFromEuler(e.set(Math.atan2(-dy, dz), 0, 0)), new THREE.Vector3(0.0012, 0.0010, s1 - s0));
          const gg = bx.clone(); gg.applyMatrix4(mx); pos.push(gg.attributes.position.array);
        });
      }
    }
  });
  if (!pos.length) return;
  const P = new Float32Array(pos.reduce((n, a) => n + a.length, 0)); let at = 0; pos.forEach(a => { P.set(a, at); at += a.length; });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, lm || GM.walnut2));   // all the lines are one mesh
}
// many small boxes as one mesh: the grooves, ribs and slots set flush into a face ([w, h, d, x, y, z, rx] each), one
// draw call however many there are
export function boxes(g, B, mat) {
  const pos = [], nor = [], mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  B.forEach(([w, h, d, x, y, z, rx]) => { const gg = new THREE.BoxGeometry(w, h, d).toNonIndexed(); gg.applyMatrix4(mx.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rx || 0, 0, 0)), one)); pos.push(gg.attributes.position.array); nor.push(gg.attributes.normal.array); });
  if (!pos.length) return null;
  const cat = L => { const A = new Float32Array(L.reduce((n, a) => n + a.length, 0)); let at = 0; L.forEach(a => { A.set(a, at); at += a.length; }); return A; };
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3));
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m;
}
// slim a stock down the gun: every piece in the group has its width about X scaled by wf(z), so the wrist can be
// narrower than the butt and the panels and lines on the faces stay on them. Each squeezed piece is kept (by a hash of
// the piece as it went in, and the squeeze's own key): splitting and bending them is most of what a pump, a double
// barrel or a hunting rifle takes to build
const TAPERED = new Map();
export function taperX(grp, wf) {
  grp.children.forEach(o => {
    if (!o.isMesh) return; o.updateMatrix(); const g0 = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g0.applyMatrix4(o.matrix);
    const squeeze = () => {
      const geo = tessZ(g0, 0.008);   // fine enough down the gun that every surface bends with the squeeze, together
      const p = geo.attributes.position, nm = geo.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        // squeeze the point, and carry its normal through the squeeze (so a flat face that now bends gently stays smooth
        // instead of showing every triangle)
        const z = p.getZ(i), f = wf(z), df = (wf(z + 0.002) - wf(z - 0.002)) / 0.004, dx = p.getX(i) - X;
        if (nm) { const nx = nm.getX(i) / f, ny = nm.getY(i), nz = nm.getZ(i) - dx * df / f * nm.getX(i), l = Math.hypot(nx, ny, nz) || 1; nm.setXYZ(i, nx / l, ny / l, nz / l); }
        p.setX(i, X + dx * f);
      }
      return geo;
    };
    o.geometry = wf.key ? kept(TAPERED, 300, wf.key + geoKey(g0), squeeze) : squeeze();
    o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
  });
}
// a hash of a geometry's points (and whatever else it carries), to know a piece seen before
function geoKey(geo) {
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9, k = '';
  for (const n of Object.keys(geo.attributes)) {
    const a = geo.attributes[n].array, u = new Uint32Array(a.buffer, a.byteOffset, a.byteLength >> 2);
    for (let i = 0; i < u.length; i++) { h1 = Math.imul(h1 ^ u[i], 16777619); h2 = Math.imul(h2 + u[i], 2246822519) ^ (h2 >>> 13); }
    k += '|' + n + ':' + u.length;
  }
  return k + '|' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
// split a (non-indexed) mesh's triangles until no edge runs more than maxDz along the gun. Whether an edge is split
// (at its middle) depends only on its two ends, so the triangles either side of it split it the same way and no seams
// open when the points are moved afterwards
function tessZ(geo, maxDz) {
  const names = Object.keys(geo.attributes), A = names.map(n => geo.attributes[n]), out = names.map(() => []);
  const vert = (t, k) => A.map(a => { const v = []; for (let c = 0; c < a.itemSize; c++) v.push(a.array[(t * 3 + k) * a.itemSize + c]); return v; });
  const zOf = v => v[names.indexOf('position')][2], mid = (u, v) => u.map((a, i) => a.map((x, c) => (x + v[i][c]) / 2));
  const emit = tri => tri.forEach(v => v.forEach((a, i) => out[i].push(...a)));
  const split = (tri, depth) => {
    const L = [0, 1, 2].map(k => Math.abs(zOf(tri[k]) - zOf(tri[(k + 1) % 3])) > maxDz);
    if (depth > 9 || !(L[0] || L[1] || L[2])) { emit(tri); return; }
    const [a, b, c] = tri, ab = L[0] && mid(a, b), bc = L[1] && mid(b, c), ca = L[2] && mid(c, a), d = depth + 1;
    if (ab && bc && ca) { split([a, ab, ca], d); split([ab, b, bc], d); split([ca, bc, c], d); split([ab, bc, ca], d); }
    else if (ab && bc) { split([a, ab, c], d); split([ab, b, bc], d); split([ab, bc, c], d); }
    else if (bc && ca) { split([a, b, ca], d); split([b, bc, ca], d); split([ca, bc, c], d); }
    else if (ab && ca) { split([a, ab, ca], d); split([ab, b, c], d); split([ab, c, ca], d); }
    else if (ab) { split([a, ab, c], d); split([ab, b, c], d); }
    else if (bc) { split([a, b, bc], d); split([a, bc, c], d); }
    else { split([a, b, ca], d); split([b, c, ca], d); }
  };
  for (let t = 0; t < A[0].count / 3; t++) split([vert(t, 0), vert(t, 1), vert(t, 2)], 0);
  const g2 = new THREE.BufferGeometry(); names.forEach((n, i) => g2.setAttribute(n, new THREE.BufferAttribute(new Float32Array(out[i]), A[i].itemSize))); return g2;
}
// a cross-section (points in x, y) run along the gun from z0 to z1, with a soft bevel if asked
export function xsec(g, shape, z0, z1, mat, bev) {
  const geo = new THREE.ExtrudeGeometry(shape, bev ? { depth: z1 - z0, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 8 } : { depth: z1 - z0, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, z0); const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m;
}
// an outline from [z, y] points, with optional holes (shapes or paths)
export function shp(pts, holes) { const s = new THREE.Shape(); pts.forEach(([a, b], i) => i ? s.lineTo(a, b) : s.moveTo(a, b)); s.closePath(); if (holes) holes.forEach(h => s.holes.push(h instanceof THREE.Shape ? new THREE.Path(h.getPoints()) : h)); return s; }
// a rounded rectangle path, for windows through a profile
export function rrect(z0, y0, z1, y1, r) { const p = new THREE.Path(); p.moveTo(z0 + r, y0); p.lineTo(z1 - r, y0); p.quadraticCurveTo(z1, y0, z1, y0 + r); p.lineTo(z1, y1 - r); p.quadraticCurveTo(z1, y1, z1 - r, y1); p.lineTo(z0 + r, y1); p.quadraticCurveTo(z0, y1, z0, y1 - r); p.lineTo(z0, y0 + r); p.quadraticCurveTo(z0, y0, z0 + r, y0); return p; }
// a tube along the bore with n long ribs round it (the grooves between sunk by dep), squashed sideways by sx and
// narrowing to tp of its radius at the front
export function ribTube(g, r, len, mat, x, y, z, n, dep, sx, tp) {
  const segs = n * 4, geo = new THREE.CylinderGeometry(r, r, len, segs, 1), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vz = p.getZ(i), rad = Math.hypot(vx, vz); if (rad < 1e-6) continue;
    const j = ((Math.round((Math.atan2(vx, vz) + Math.PI * 2) / (Math.PI * 2) * segs) % segs) + segs) % segs, f = (j % 4 < 2 ? 1 : 1 - dep / r) * (1 + ((tp || 1) - 1) * (p.getY(i) / len + 0.5));
    p.setXYZ(i, vx * f * (sx || 1), p.getY(i), vz * f);
  }
  geo.computeVertexNormals(); geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
}
// a tube along the bore knurled all over: a grid n round it and rows along it, every other point of it raised dep into
// a little pyramid (the ends left round to meet their caps)
export function knurl(g, r, len, mat, x, y, z, n, rows, dep) {
  const geo = new THREE.CylinderGeometry(r - dep, r - dep, len, n * 2, rows * 2), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vz = p.getZ(i); if (Math.hypot(vx, vz) < 1e-6) continue;
    const a = Math.round((Math.atan2(vx, vz) + Math.PI * 2) / (Math.PI * 2) * n * 2), b = Math.round((p.getY(i) / len + 0.5) * rows * 2);
    if (b > 0 && b < rows * 2 && (a % 2 || b % 2)) continue;
    const f = r / (r - dep); p.setXYZ(i, vx * f, p.getY(i), vz * f);
  }
  geo.computeVertexNormals(); geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
}
// a revolved shape round the bore: pts are [radius, z] from back to front
export function lathe(g, pts, mat, x, y, seg) {
  const geo = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg || 32); geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0); m.castShadow = true; g.add(m); return m;
}
// a few turns of olive tape round the tube at (x, y) and the thing taped beside it at (tx, ty): a band round the tube
// and a wrap round the pair
export function tapeWrap(g, x, y, z, r, tx, ty, sx) {
  ring(g, r, 0.018, GM.odTape, x, y, z).scale.x = sx || 1; r *= sx || 1;
  const x0 = Math.min(x, tx), x1 = Math.max(x + r * 0.6, tx), y0 = Math.min(y - r * 0.5, ty - 0.016), y1 = Math.max(y + r * 0.5, ty + 0.016);
  box(g, x1 - x0, y1 - y0, 0.018, GM.odTape, (x0 + x1) / 2 + 0.002, (y0 + y1) / 2, z);
}
export const taper = (g, r0, r1, len, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 18), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
// ---- iron sights, as they're looked through in first person (game/view-cam.js reads ironsOf)
// a rear sight blade: w across, h tall (its top at y), d deep, centred at z, with a square notch nw wide cut nd down its
// middle (the front post's tip sits level with the blade's top, in the notch); a white dot either side of the notch on
// its face toward you, if dot's a material
export function notchRear(g, x, y, z, w, h, d, nw, nd, mat, dot) {
  const ew = (w - nw) / 2;
  [-1, 1].forEach(s => box(g, ew, h, d, mat, x + s * (nw + ew) / 2, y - h / 2, z));
  box(g, nw, h - nd, d, mat, x, y - nd - (h - nd) / 2, z);
  if (dot) [-1, 1].forEach(s => box(g, 0.0024, 0.0024, 0.0012, dot, x + s * (nw + ew) / 2, y - nd * 0.6, z - d / 2 - 0.0004));
}
// what the gun's sights are: the line through them in its own frame, the rear sight's height (yr) and where along it
// (rz), the front's tip (yf) and where (fz); kind: 'notch' (a front post in a rear notch), 'ap' (a rear aperture, r its
// hole's radius, its parts in parts: drawn as the out-of-focus ring you look through; relief, how far behind it your eye
// is, if not the usual), or 'bead' (a bead down a rib)
export function irons(g, I) { g.userData.irons = Object.assign(g.userData.irons || {}, I); return g.userData.irons; }
// a rear aperture's parts (looked through from a hand's breadth away in first person, so they're out of focus)
export function apPart(m) { if (m) m.userData.apPart = true; return m; }
// a rear sight's aperture: a plate across the gun (hw each side of x, from y0 up to y1, rounded at its corners), from z0
// to z1 along it, the hole r round through it at yh, so you see through it down the gun
export function apPlate(g, x, hw, y0, y1, z0, z1, yh, r, mat) {
  const c = Math.min(hw, (y1 - y0) / 2) * 0.45, s = shp(rrect(x - hw, y0, x + hw, y1, c).getPoints(4).map(v => [v.x, v.y])), h = new THREE.Path();
  h.absarc(x, yh, r, 0, Math.PI * 2, true); s.holes.push(h);
  return apPart(xsec(g, s, z0, z1, mat, 0.0005));
}
