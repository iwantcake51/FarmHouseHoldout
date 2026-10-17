// Part helpers and the model builder for every gun.

// the right fist; melee models are built handle-down along +y
// where the hunting rifle's bolt knob sits on its bolt (the firing hand works the bolt by it in player/hold.js)
const BOLT_KNOB = [-0.054, -0.046, -0.008];
// the revolver's cylinder: its axis height, radius and the circle its chambers sit on (the speed loader matches it,
// player/hold.js)
const REV_CYL = { y: 1.1415, r: 0.0245, ch: 0.0137 };
// the revolver's optic rail: from just ahead of the hammer (where the rear sight was) forward along the barrel, stopping
// short of the front sight on a short barrel
const REV_RAIL = { z0: 0.55, z1: 0.8 };
// small builders for gun parts: cylinders along the bore, rings, and a light strip that fakes a top-edge highlight. Any
// cylinder barrel-sized or bigger gets sides enough for its size (about one per millimetre of radius), so a barrel, a
// can or a tube always reads round, never faceted
const cyl = (g, r, len, mat, x, y, z, seg) => { const m = cylZ(r, len, mat, Math.max(seg || 10, r >= 0.008 ? Math.min(48, Math.round(r * 900)) : 0)); m.position.set(x, y, z); g.add(m); return m; };
const ring = (g, r, w, mat, x, y, z) => cyl(g, r, w, mat, x, y, z, 14);
const hi = (g, w, d, x, y, z) => box(g, w, 0.007, d, GM.hi, x, y, z);
// a side profile (points in z, y) pushed out to width w across the gun and centred on x, with a soft bevel if asked
function profile(g, shape, w, mat, x, bev, segs) {
  const geo = new THREE.ExtrudeGeometry(shape, bev ? { depth: w, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: segs || 1, curveSegments: 8 } : { depth: w, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, -w / 2); geo.rotateY(-Math.PI / 2);   // the outline's x runs down the gun (+z), the width across it
  const m = new THREE.Mesh(geo, mat); m.position.x = x; m.castShadow = true; g.add(m); return m;
}
// a port cut through a profile (w wide, bevel bev) should only show on the shooter's right: plug the left half of the
// cut with the body's own material, flush with its outside, and put a dark wall down the middle
function portFill(g, z0, y0, z1, y1, w, bev, mat) {
  const h = w / 2 + bev; box(g, h, y1 - y0, z1 - z0, mat, X + h / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  box(g, 0.002, y1 - y0, z1 - z0, GM.rubber, X - 0.001, (y0 + y1) / 2, (z0 + z1) / 2);
}
// a bevel grows a profile's outline by its size all round: pull a traced outline in by d first so it comes out the size
// it was traced at (a negative d pushes it out, for the hole through a bevelled piece)
// is X near the edge B..C (within span of both ends), so joining the neighbours there doesn't throw a spike out
const t1ok = (X0, B, C, span) => Math.hypot(X0[0] - B[0], X0[1] - B[1]) < span && Math.hypot(X0[0] - C[0], X0[1] - C[1]) < span;
function inset(pts, d) {
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
function zAt(P, y) { for (let i = 0; i < P.length - 1; i++) if ((y - P[i][1]) * (y - P[i + 1][1]) <= 0) return P[i][0] + (P[i + 1][0] - P[i][0]) * (y - P[i][1]) / ((P[i + 1][1] - P[i][1]) || 1); return P[Math.abs(y - P[0][1]) < Math.abs(y - P[P.length - 1][1]) ? 0 : P.length - 1][0]; }
// a rounded solid from a traced side outline (points in z, y): W thick in all, its edges rounded over r in three
// steps, and still the traced size from the side (grips, stocks and forends, so they don't read as flat slabs)
function solid(g, pts, W, mat, x, r, holes) { return profile(g, shp(inset(pts, r), holes), Math.max(0.001, W - 2 * r), mat, x, r, 3); }
// a smooth function through [z, value] points, eased between them (flat past the ends)
const pw = P => z => { if (z <= P[0][0]) return P[0][1]; for (let i = 1; i < P.length; i++) if (z <= P[i][0]) { const t = (z - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * (1 - Math.cos(Math.PI * t)) / 2; } return P[P.length - 1][1]; };
// the part of the outline P (points in z, y) inside the convex polygon C, so a panel can never run past the edge
function clipTo(P, C) {
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
function pullInside(P, O) {
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
// bumps on a jittered grid gap apart (one mesh)
function stipple(g, poly, xo, gap, mat, dotMat) {
  if (poly.length < 3) return;
  [-1, 1].forEach(sd => profile(g, shp(poly), 0.0008, mat, X + sd * xo, 0.0002));
  const zs = poly.map(p => p[0]), ys = poly.map(p => p[1]), pos = [], bx = new THREE.BoxGeometry(0.0011, 0.0011, 0.0011).toNonIndexed(); let k = 0;
  for (let y = Math.min(...ys) + gap / 2; y < Math.max(...ys); y += gap * 0.87) for (let z = Math.min(...zs) + gap / 2 + (k++ % 2) * gap / 2; z < Math.max(...zs); z += gap) {
    const jz = z + (Math.sin(z * 9137 + y * 4271) * 0.3) * gap, jy = y + (Math.sin(z * 3571 - y * 7919) * 0.3) * gap; if (!inPoly(poly, jz, jy)) continue;
    [-1, 1].forEach(sd => { const gg = bx.clone(); gg.translate(X + sd * (xo + 0.0006), jy, jz); pos.push(gg.attributes.position.array); });
  }
  if (!pos.length) return;
  const P = new Float32Array(pos.reduce((n, a) => n + a.length, 0)); let at = 0; pos.forEach(a => { P.set(a, at); at += a.length; });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, dotMat));
}
// checkering on both sides of a stock: a dark panel (poly, points in z, y) lying on the faces at X +- xo, and two
// crossing sets of fine raised lines over it (gap apart, at +-ang to the gun), each cut off at the panel's edge so none
// of them run past it (walnut unless the panel and line materials are given)
function checker(g, poly, xo, gap, ang, pm, lm) {
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
function boxes(g, B, mat) {
  const pos = [], nor = [], mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  B.forEach(([w, h, d, x, y, z, rx]) => { const gg = new THREE.BoxGeometry(w, h, d).toNonIndexed(); gg.applyMatrix4(mx.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rx || 0, 0, 0)), one)); pos.push(gg.attributes.position.array); nor.push(gg.attributes.normal.array); });
  if (!pos.length) return null;
  const cat = L => { const A = new Float32Array(L.reduce((n, a) => n + a.length, 0)); let at = 0; L.forEach(a => { A.set(a, at); at += a.length; }); return A; };
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3));
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m;
}
// slim a stock down the gun: every piece in the group has its width about X scaled by wf(z), so the wrist can be
// narrower than the butt and the panels and lines on the faces stay on them
function taperX(grp, wf) {
  grp.children.forEach(o => {
    if (!o.isMesh) return; o.updateMatrix(); let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); geo.applyMatrix4(o.matrix);
    geo = tessZ(geo, 0.008);   // fine enough down the gun that every surface bends with the squeeze, together
    const p = geo.attributes.position, nm = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      // squeeze the point, and carry its normal through the squeeze (so a flat face that now bends gently stays smooth
      // instead of showing every triangle)
      const z = p.getZ(i), f = wf(z), df = (wf(z + 0.002) - wf(z - 0.002)) / 0.004, dx = p.getX(i) - X;
      if (nm) { const nx = nm.getX(i) / f, ny = nm.getY(i), nz = nm.getZ(i) - dx * df / f * nm.getX(i), l = Math.hypot(nx, ny, nz) || 1; nm.setXYZ(i, nx / l, ny / l, nz / l); }
      p.setX(i, X + dx * f);
    }
    o.geometry = geo; o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
  });
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
function xsec(g, shape, z0, z1, mat, bev) {
  const geo = new THREE.ExtrudeGeometry(shape, bev ? { depth: z1 - z0, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 8 } : { depth: z1 - z0, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, z0); const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m;
}
// an outline from [z, y] points, with optional holes (shapes or paths)
function shp(pts, holes) { const s = new THREE.Shape(); pts.forEach(([a, b], i) => i ? s.lineTo(a, b) : s.moveTo(a, b)); s.closePath(); if (holes) holes.forEach(h => s.holes.push(h instanceof THREE.Shape ? new THREE.Path(h.getPoints()) : h)); return s; }
// a rounded rectangle path, for windows through a profile
function rrect(z0, y0, z1, y1, r) { const p = new THREE.Path(); p.moveTo(z0 + r, y0); p.lineTo(z1 - r, y0); p.quadraticCurveTo(z1, y0, z1, y0 + r); p.lineTo(z1, y1 - r); p.quadraticCurveTo(z1, y1, z1 - r, y1); p.lineTo(z0 + r, y1); p.quadraticCurveTo(z0, y1, z0, y1 - r); p.lineTo(z0, y0 + r); p.quadraticCurveTo(z0, y0, z0 + r, y0); return p; }
// a tube along the bore with n long ribs round it (the grooves between sunk by dep), squashed sideways by sx and
// narrowing to tp of its radius at the front
function ribTube(g, r, len, mat, x, y, z, n, dep, sx, tp) {
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
function knurl(g, r, len, mat, x, y, z, n, rows, dep) {
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
// a box magazine seen side on, the way a rifle mag runs: straight for Ls under the well, then bending forward on an arc
// of radius R for La more. Points are placed by r, the distance from the arc's centre (R is the middle of the mag, so
// R - d/2 its front and R + d/2 its back), and s, the length down the mag from its top. shape(r0, r1, s0, s1, up) is the
// band between two r over a stretch of s (up: carry it straight on up into the well by that much); at(r, s) is a point;
// ang(s) is how far it has turned there
function bentMag(z0, yTop, Ls, La, R) {
  const C = [z0 + R, yTop - Ls], ang = q => q > Ls ? (q - Ls) / R : 0;
  const at = (r, q) => q <= Ls ? [C[0] - r, yTop - q] : [C[0] - r * Math.cos(ang(q)), C[1] - r * Math.sin(ang(q))];
  const shape = (r0, r1, s0, s1, up) => {
    const sh = new THREE.Shape(), N = Math.max(2, Math.ceil((s1 - s0) / 0.01)), q = i => s0 + (s1 - s0) * i / N;
    if (up) { sh.moveTo(C[0] - r1, yTop + up); sh.lineTo(C[0] - r0, yTop + up); } else sh.moveTo(...at(r0, s0));
    for (let i = 0; i <= N; i++) sh.lineTo(...at(r0, q(i)));
    for (let i = N; i >= 0; i--) sh.lineTo(...at(r1, q(i)));
    sh.closePath(); return sh;
  };
  return { at, ang, shape, len: Ls + La };
}
// a revolved shape round the bore: pts are [radius, z] from back to front
function lathe(g, pts, mat, x, y, seg) {
  const geo = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg || 32); geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0); m.castShadow = true; g.add(m); return m;
}
// a few turns of olive tape round the tube at (x, y) and the thing taped beside it at (tx, ty): a band round the tube
// and a wrap round the pair
function tapeWrap(g, x, y, z, r, tx, ty, sx) {
  ring(g, r, 0.018, GM.odTape, x, y, z).scale.x = sx || 1; r *= sx || 1;
  const x0 = Math.min(x, tx), x1 = Math.max(x + r * 0.6, tx), y0 = Math.min(y - r * 0.5, ty - 0.016), y1 = Math.max(y + r * 0.5, ty + 0.016);
  box(g, x1 - x0, y1 - y0, 0.018, GM.odTape, (x0 + x1) / 2 + 0.002, (y0 + y1) / 2, z);
}
const taper = (g, r0, r1, len, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 18), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
function guard(g, y, z0, z1, mat) { box(g, 0.016, 0.012, z1 - z0, mat, X, y, (z0 + z1) / 2); box(g, 0.016, 0.05, 0.012, mat, X, y + 0.025, z1); box(g, 0.009, 0.034, 0.01, GM.metal2, X, y + 0.025, z0 + (z1 - z0) * 0.45).rotation.x = 0.25; }
// the MP5 (sub, below), built round on the lines traced off its side photo: the barrel's axis (ax), the cocking tube's
// axis and radius (ct), the receiver's half width, top and bottom (rw, top, bot) and where it ends at the front
// (rcvEnd), where the front sight block starts (fs), the muzzle, where the cocking handle rests, and how far back the
// SD's front sight sits (sdShift)
const MP5 = { ax: 1.119, ct: { y: 1.159, r: 0.0125 }, rw: 0.022, top: 1.1745, bot: 1.1116, rcvEnd: 0.7985, fs: 1.0365, muzzle: 1.1225, handle: 0.945, sdShift: -0.0542 };
// the A2 stock's width down the gun, as a share of its full width: full at the butt, slimmer through the wrist, full again
// where it takes the receiver
const STK_W = pw([[0.2, 1], [0.34, 0.84], [0.43, 0.84], [0.49, 1]]);
// its front sight block, dz further along (the SD's sits further back and has no barrel out front): round the front of
// the cocking tube a collar with the tube's knurled end cap on it; up off it on a neck the hooded ring, the post inside;
// under it, round the barrel, the clamp with its bolt and the sling loop on the left; out ahead the barrel's collar with
// its three lugs and the knurled thread protector, open at the bore
function mp5Front(g, dz, barrel) {
  const K = GM.metal, ct = MP5.ct, z = v => v + dz;
  cyl(g, 0.0152, 0.03, K, X, ct.y, z(1.0545), 24);                                                         // the collar round the tube
  lathe(g, [[0, z(1.0695)], [0.018, z(1.0695)], [0.019, z(1.0703)], [0.019, z(1.0722)], [0.0176, z(1.0734)], [0.009, z(1.0739)], [0, z(1.0739)]], K, X, ct.y, 28);   // the end cap
  ribTube(g, 0.0192, 0.0026, K, X, ct.y, z(1.0712), 20, 0.0007);                                           // its knurled rim
  const hy = 1.2144 - 0.021;   // (its top where the photo has it)
  box(g, 0.012, hy - 0.019 - ct.y, 0.02, K, X, (hy - 0.019 + ct.y) / 2 + 0.006, z(1.0555));              // the hood's neck
  lathe(g, [[0.014, z(1.0458)], [0.019, z(1.0448)], [0.021, z(1.0468)], [0.021, z(1.0642)], [0.019, z(1.0662)], [0.014, z(1.0652)], [0.014, z(1.0458)]], K, X, hy, 28);   // the hooded ring
  box(g, 0.0028, 0.013, 0.004, K, X, hy - 0.0072, z(1.0555));                                             // the post in it
  if (!barrel) return;
  const ax = MP5.ax;
  cyl(g, 0.0166, 0.033, K, X, ax, z(1.0532), 24);                                                          // the barrel clamp
  box(g, 0.02, ct.y - ax, 0.026, K, X, (ct.y + ax) / 2, z(1.0545));                                        // the web joining it to the collar
  cyl(g, 0.0046, 0.006, GM.metal2, X + 0.0172, ax, z(1.0535), 6).rotation.set(0, 0, Math.PI / 2);         // the clamp bolt's head, on the left
  { const t = new THREE.Mesh(new THREE.TorusGeometry(0.0072, 0.0015, 6, 16), GM.metal2); t.position.set(X + 0.0185, ax - 0.0115, z(1.043)); t.rotation.y = Math.PI / 2; t.castShadow = true; g.add(t); }   // the sling loop
  lathe(g, [[0, z(1.0695)], [0.0113, z(1.0695)], [0.0113, z(1.0912)], [0, z(1.0912)]], K, X, ax, 24);      // the lug collar
  [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 - 2.094].forEach(a => { const b = box(g, 0.006, 0.006, 0.013, K, X + Math.cos(a) * 0.0122, ax + Math.sin(a) * 0.0122, z(1.0805)); b.rotation.z = a - Math.PI / 2; });   // its three lugs
  lathe(g, [[0, z(1.0912)], [0.0106, z(1.0912)], [0.0106, z(1.1193)], [0.0093, z(1.1225)], [0, z(1.1225)]], K, X, ax, 24);   // the thread protector
  ribTube(g, 0.0107, 0.018, K, X, ax, z(1.103), 16, 0.0007);                                               // its knurling
  cyl(g, 0.0052, 0.002, GM.rubber, X, ax, z(1.1228), 12);                                                  // the bore
}
// its cocking handle at z: a short stem out of the slot on the tube's left side, pointing out and a little up and
// forward, and the knob on it, a knurled mushroom with a domed face
const _mpD = new V3(0.85, 0.45, 0.2).normalize(), _mpQ = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), _mpD);
function mp5Handle(g, z) {
  const ct = MP5.ct, rl = Math.hypot(_mpD.x, _mpD.y), h = new THREE.Group(); g.add(h);
  h.position.set(X + ct.r * _mpD.x / rl * 0.9, ct.y + ct.r * _mpD.y / rl * 0.9, z); h.quaternion.copy(_mpQ);
  cyl(h, 0.0034, 0.009, GM.steel, 0, 0, 0.0035, 12);                                                       // the stem
  ribTube(h, 0.0128, 0.0062, GM.metal, 0, 0, 0.0108, 18, 0.0009);                                          // the knob's knurled rim
  lathe(h, [[0, 0.0139], [0.0085, 0.0164], [0.0122, 0.0139], [0.0128, 0.0139], [0.0128, 0.0077], [0.007, 0.0068], [0, 0.0068]], GM.metal, 0, 0, 22);   // and its domed face
}
// the receiver's section: flat sides under a round top, the bottom corners taken off, and pressed into the left side
// (L) and the right (Rt) the long channel under the round, the rolled lip under it standing out ([out from the side,
// y] from the bottom up)
const MP5_CH = [[0, 1.1222], [0.0009, 1.1232], [0.0013, 1.1252], [0.0009, 1.1272], [-0.001, 1.1284], [-0.0042, 1.1296], [-0.005, 1.1318], [-0.005, 1.1462], [-0.004, 1.149], [-0.0012, 1.15]];
function mp5Section(L, Rt) {
  const R = MP5.rw, yc = MP5.top - R, b = MP5.bot, c = 0.0015, sh = new THREE.Shape();
  sh.moveTo(X - R + c, b); sh.lineTo(X + R - c, b); sh.lineTo(X + R, b + c);
  if (L) MP5_CH.forEach(([d, y]) => sh.lineTo(X + R + d, y));
  for (let i = 0; i <= 16; i++) { const a = Math.PI * i / 16; sh.lineTo(X + R * Math.cos(a), yc + R * Math.sin(a)); }
  if (Rt) MP5_CH.slice().reverse().forEach(([d, y]) => sh.lineTo(X - R - d, y));
  sh.lineTo(X - R, b + c); sh.closePath(); return sh;
}
// its rear sight: a plate clamped down on the receiver's round top; on it the housing, a floor between two ears that
// slope off at the back, the windage screw lying in it and a cross-head screw in the right ear; the drum standing in
// the front of the housing leaning forward, a plain band at its foot, knurled above, the top a cup with its rim cut
// away front and back (the open notch) and an aperture through it; the detent's nub under its front
const MP5_TILT = 0.35, MP5_DRUM = { y: 1.1784, z: 0.5725, r: 0.013 };
function mp5Rear(g) {
  const K = GM.metal, M2 = GM.metal2, R = MP5.rw, yc = MP5.top - R, D = MP5_DRUM;
  { const sh = new THREE.Shape(), w = 0.0159, rb = R - 0.0003, a0 = Math.atan2(Math.sqrt(rb * rb - w * w), w);
    sh.moveTo(X + w, 1.1792); sh.lineTo(X - w, 1.1792); sh.absarc(X, yc, rb, Math.PI - a0, a0, true); sh.closePath();
    xsec(g, sh, 0.5249, 0.5914, K, 0.0006); }                                                                              // the clamp plate
  solid(g, [[0.5262, 1.176], [0.5262, 1.1805], [0.5318, 1.1812], [0.5352, 1.1868], [0.5665, 1.1868], [0.5665, 1.176]], 0.028, K, X, 0.0006);   // the housing's floor
  [-1, 1].forEach(s2 => solid(g, [[0.5345, 1.1765], [0.5345, 1.1905], [0.5352, 1.1942], [0.5372, 1.1975], [0.5402, 1.1997], [0.5435, 1.2005], [0.5652, 1.2005], [0.5672, 1.1985], [0.5672, 1.1765]], 0.0029, K, X + s2 * 0.01475, 0.0006));   // its ears
  { const ws = lathe(g, [[0, 0], [0.0054, 0], [0.0054, 0.0006], [0.0042, 0.0014], [0, 0.0016]], M2, X, 1.1868, 18); ws.rotation.x = -Math.PI / 2; ws.position.z = 0.5505; }   // the windage screw
  box(g, 0.0094, 0.0008, 0.001, GM.rubber, X, 1.1884, 0.5505).rotation.y = 0.5;                                              // and its slot
  cyl(g, 0.0027, 0.0008, M2, X - 0.0164, 1.1872, 0.5428, 14).rotation.set(0, 0, Math.PI / 2);                               // the right ear's screw
  [0, Math.PI / 2].forEach(a => { const c = box(g, 0.0004, 0.0036, 0.0007, GM.rubber, X - 0.0168, 1.1872, 0.5428); c.rotation.x = a + Math.PI / 4; });   // its cross
  cyl(g, 0.0032, 0.016, GM.steel, X, 1.1796, 0.5908, 14).rotation.set(0, 0, Math.PI / 2);                                  // the detent's nub
  const d = new THREE.Group(); d.position.set(X, D.y, D.z); d.rotation.x = MP5_TILT - Math.PI / 2; g.add(d);   // (its z up the drum, its y back)
  lathe(d, [[0, 0], [D.r - 0.0006, 0], [D.r - 0.0006, 0.0074], [D.r - 0.0012, 0.008], [0, 0.008]], M2, 0, 0, 32);          // the plain band
  knurl(d, D.r, 0.0115, K, 0, 0, 0.01375, 26, 3, 0.0007);                                                                   // the knurling
  cyl(d, D.r - 0.0036, 0.0004, GM.rubber, 0, 0, 0.0197, 20);                                                                // the cup's floor
  const gap = 0.34; [0, Math.PI].forEach(a => { const sh = new THREE.Shape(); sh.absarc(0, 0, D.r, a - Math.PI / 2 + gap, a + Math.PI / 2 - gap, false); sh.absarc(0, 0, D.r - 0.0036, a + Math.PI / 2 - gap, a - Math.PI / 2 + gap, true); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.0048, bevelEnabled: false, curveSegments: 10 }); geo.translate(0, 0, 0.0195); const m = new THREE.Mesh(geo, K); m.castShadow = true; d.add(m); });   // the rim, cut for the notch
  const h = 0.0138; cyl(g, 0.0019, 2 * D.r / Math.cos(MP5_TILT) + 0.0004, GM.rubber, X, D.y + h * Math.cos(MP5_TILT), D.z + h * Math.sin(MP5_TILT), 12);   // the aperture, through it
}
function stockPad(g, w, h, z, y) { box(g, w + 0.004, h, 0.025, GM.rubber, X, y, z); }
// a pistol magazine inside the grip, tilted with it, with its base plate just below the grip; it lives in the mag group so it can drop out
function gripMag(g, y, z, tilt, w, h, d) {
  const m = new THREE.Group(); m.position.set(X, y, z); m.rotation.x = tilt; (g.userData.magG || g).add(m);
  box(m, w, h, d, GM.metal2, 0, -0.005, 0); box(m, w + 0.014, 0.014, d + 0.02, GM.poly, 0, -h / 2 - 0.012, 0.004);
}
// Gun models. Each builder adds meshes to the group g (axis +z is the barrel, X is the right-hand offset)
// and returns where the muzzle is plus mount points for magazines, sights and the moving slide or bolt.
// a shotgun shell's hull by the kind loaded (weapons/rounds.js): flechettes white, dragon's breath orange, slugs blue,
// buckshot red. Everywhere a shell shows: the pump's side saddle, a band round the auto shotgun's mag, the shells in the
// hand as they're fed in (player/hold.js), the chest rig's shell pouch (player/gear.js), the hulls thrown out
// (SHELL_HULL, weapons/casings.js) and the HUD's shells (#rounds.rflech and the rest, styles/hud-weapon.css)
const SHELL_MAT = { fire: GM.shellO, slug: GM.shellB, flech: GM.shellW };
const shellMat = id => SHELL_MAT[roundOn(id)] || GM.shell;
const GUN_MODELS = {
  // 9mm pistol: a Glock 17 Gen 5, traced off a side-on photo. The slide (serrations front and back, the sights, the
  // ejection port on the right with the barrel's hood in it) rides on a polymer frame: the dust cover with its rail
  // slot, the squared trigger guard with the safety-blade trigger, the slide stop, takedown lever and magazine
  // release, and the raked grip with its stippled panels. The magazine follows the tier: flush, a +5 base pad, a
  // 33-round stick, then a 50-round drum
  pistol(g, m) {
    const F = GM.poly, S2 = GM.glockS, mg = g.userData.magG || g, mt = T('mag');
    // ---- frame: dust cover and rail, the guard, the grip; the levers
    profile(g, shp([[0.839, 1.124], [0.727, 1.124], [0.727, 1.097], [0.741, 1.1], [0.79, 1.1], [0.798, 1.102], [0.82, 1.104], [0.833, 1.106], [0.839, 1.108]]), 0.028, F, X, 0.002);
    box(g, 0.022, 0.004, 0.006, GM.rubber, X, 1.1, 0.79);
    profile(g, shp([[0.732, 1.124], [0.655, 1.124], [0.655, 1.061], [0.668, 1.053], [0.73, 1.053], [0.732, 1.06]], [shp([[0.722, 1.098], [0.665, 1.098], [0.665, 1.066], [0.673, 1.061], [0.722, 1.061]])]), 0.026, F, X, 0.0015);
    // the grip, measured row by row: the beavertail's thin tang out under the slide, the web curving in beneath it,
    // the back strap and front strap raking back at 22 degrees, the rounded heel and the flared mag well
    const GB = [[0.5685, 1.102], [0.5665, 1.09], [0.5636, 1.0747], [0.561, 1.0669], [0.5577, 1.0592], [0.5551, 1.0514], [0.5513, 1.0437], [0.5467, 1.0359], [0.5429, 1.0281], [0.5377, 1.0204], [0.5331, 1.0126], [0.5293, 1.0048], [0.5254, 0.9971], [0.5228, 0.9893], [0.5215, 0.9815], [0.5204, 0.9738]];
    const GF = [[0.6393, 1.0514], [0.6354, 1.0437], [0.6328, 1.0359], [0.6295, 1.0281], [0.6263, 1.0204], [0.6231, 1.0126], [0.6198, 1.0048], [0.6173, 0.9971], [0.6134, 0.9893], [0.6108, 0.9815], [0.6082, 0.9738], [0.6071, 0.97]];
    profile(g, shp(inset([[0.657, 1.126], [0.541, 1.126], [0.534, 1.1238], [0.527, 1.1218], [0.5252, 1.1195], [0.5258, 1.1172], [0.529, 1.116], [0.538, 1.1152], [0.548, 1.1138], [0.556, 1.1115], [0.5625, 1.108], [0.567, 1.1045], ...GB,
      [0.5205, 0.9695], [0.5222, 0.9655], [0.5258, 0.9625], [0.531, 0.9605], [0.54, 0.9597], [0.602, 0.9597], [0.6055, 0.9615], [0.6068, 0.965], ...GF.slice().reverse(), [0.6412, 1.0565], [0.6455, 1.0605], [0.651, 1.0625], [0.657, 1.063]], 0.0025)), 0.028, F, X, 0.0025);
    // the stippled panels: the whole grip but a smooth band along the top and the flare at the bottom
    const pn = [[0.6435, 1.099]]; for (let k = 0; k <= 8; k++) { const yy = 1.052 - k * 0.0095; pn.push([zAt(GF, yy) - 0.0045, yy]); }
    for (let k = 0; k <= 8; k++) { const yy = 0.976 + k * 0.0154; pn.push([zAt(GB, yy) + 0.0045, yy]); }
    [-1, 1].forEach(sd => profile(g, shp(pn), 0.002, GM.glockT, X + sd * 0.0165, 0.0005));
    profile(g, shp([[0.706, 1.098], [0.712, 1.098], [0.716, 1.085], [0.714, 1.072], [0.708, 1.068], [0.709, 1.082], [0.705, 1.092]]), 0.007, F, X, 0.0008);
    box(g, 0.004, 0.006, 0.014, F, X, 1.09, 0.71);
    box(g, 0.003, 0.006, 0.022, GM.metal2, X + 0.016, 1.122, 0.662); box(g, 0.003, 0.007, 0.012, GM.metal2, X + 0.016, 1.112, 0.734); box(g, 0.004, 0.012, 0.012, F, X + 0.016, 1.085, 0.645);
    // ---- the barrel and chamber under the slide, the recoil guide in the dust cover
    cyl(g, 0.0105, 0.29, GM.metal2, X, 1.142, 0.695, 14); box(g, 0.022, 0.018, 0.06, GM.metal2, X, 1.142, 0.575); cyl(g, 0.006, 0.25, GM.metal2, X, 1.115, 0.72, 10);
    // ---- the slide (rides back on each shot, locks open on an empty mag)
    const sl = new THREE.Group(); g.add(sl);
    profile(sl, shp([[0.542, 1.1245], [0.842, 1.1245], [0.845, 1.137], [0.845, 1.146], [0.841, 1.157], [0.836, 1.16], [0.548, 1.161], [0.542, 1.158]], [rrect(0.687, 1.133, 0.757, 1.155, 0.003)]), 0.028, S2, X, 0.0025);
    portFill(sl, 0.687, 1.133, 0.757, 1.155, 0.028, 0.0025, S2);
    box(sl, 0.006, 0.014, 0.066, GM.metal2, X - 0.009, 1.146, 0.72);   // the barrel's hood in the port
    [-1, 1].forEach(sd => { for (let k = 0; k < 7; k++) box(sl, 0.002, 0.026, 0.003, GM.rubber, X + sd * 0.0166, 1.142, 0.549 + k * 0.0075); for (let k = 0; k < 5; k++) box(sl, 0.002, 0.026, 0.003, GM.rubber, X + sd * 0.0166, 1.142, 0.788 + k * 0.0075); });
    box(sl, 0.004, 0.008, 0.008, GM.rubber, X, 1.165, 0.829); box(sl, 0.003, 0.003, 0.002, GM.dot, X, 1.167, 0.825);
    box(sl, 0.016, 0.008, 0.01, GM.rubber, X, 1.165, 0.555); [-0.005, 0.005].forEach(o => box(sl, 0.0026, 0.0026, 0.002, GM.dot, X + o, 1.167, 0.561));
    cyl(sl, 0.0065, 0.002, GM.rubber, X, 1.142, 0.8455, 12);
    // ---- the magazine, lying back at the grip's rake (it drops out along it): the body up inside the grip, then the
    // tier's base under the mag well: flush, a +5 base pad, a 33-round stick, a 50-round drum on its neck
    const t = 0.38, sn = Math.sin(t), cs = Math.cos(t), dn = (z, y, d) => [z - sn * d, y - cs * d];
    box(mg, 0.022, 0.13, 0.05, GM.metal2, X, 1.03, 0.587).rotation.x = t;
    const base = (f, b, y) => profile(mg, shp(inset([[b + 0.002, y], [f - 0.001, y], [f + 0.0015, y - 0.007], [f - 0.002, y - 0.0145], [f - 0.007, y - 0.016], [b + 0.003, y - 0.016], [b - 0.0015, y - 0.0128], [b - 0.0028, y - 0.0065]], 0.002)), 0.03, F, X, 0.002);
    if (mt === 0) base(0.6045, 0.5365, 0.9605);
    else if (mt === 1) profile(mg, shp(inset([[0.5385, 0.9605], [0.6045, 0.9605], [0.6058, 0.952], [0.598, 0.93], [0.596, 0.9255], [0.591, 0.9225], [0.534, 0.9225], [0.5292, 0.9258], [0.5285, 0.931], [0.5355, 0.952]], 0.002)), 0.032, F, X, 0.002);   // a +5 base pad
    else if (mt === 2) {   // a 33-round stick, nearly as long again as the grip, its base plate at the bottom
      const L = 0.178, [f1, y1] = dn(0.599, 0.962, L), [b1] = dn(0.544, 0.962, L);
      profile(mg, shp(inset([[0.544, 0.962], [0.599, 0.962], [f1, y1], [b1, y1]], 0.0015)), 0.023, F, X, 0.0015);
      [-1, 1].forEach(sd => profile(mg, shp([[0.549, 0.955], [0.553, 0.955], [b1 + 0.009, y1 + 0.012], [b1 + 0.005, y1 + 0.012]]), 0.001, GM.glockT, X + sd * 0.013, 0.0003));   // the seam down its back
      base(f1 + 0.004, b1 - 0.002, y1 + 0.001);
    } else {   // a 50-round drum: a neck down out of the grip into a drum lying along the gun, its winding key at the back
      const [nf, ny] = dn(0.597, 0.962, 0.05), [nb] = dn(0.548, 0.962, 0.05), r = 0.08, [cz] = dn(0.5725, 0.962, 0.07), cy = ny - 0.02 - r * 0.8;
      profile(mg, shp(inset([[0.548, 0.962], [0.597, 0.962], [nf, ny - 0.02], [nb, ny - 0.02]], 0.0015)), 0.026, F, X, 0.0015);
      lathe(mg, [[0.001, -0.036], [r - 0.012, -0.036], [r - 0.004, -0.033], [r, -0.026], [r, 0.026], [r - 0.004, 0.033], [r - 0.012, 0.036], [0.001, 0.036]].map(([rr, zz]) => [rr, cz + zz]), F, X, cy, 36);
      ring(mg, r + 0.0015, 0.006, GM.glockT, X, cy, cz + 0.012); ring(mg, r + 0.0015, 0.006, GM.glockT, X, cy, cz - 0.012);   // the seams round its rim
      cyl(mg, 0.026, 0.008, GM.glockT, X, cy, cz - 0.038, 20); box(mg, 0.034, 0.008, 0.006, GM.rubber, X, cy, cz - 0.044);   // the winding key
    }
    let front = 0.845;
    if (m.match) { const e = 0.04 * (m.match - 1); cyl(g, 0.0125, 0.11 + e, GM.metal2, X, 1.142, 0.9 + e / 2); ring(g, 0.0145, 0.012, GM.steel, X, 1.142, 0.95 + e); front = 0.955 + e; }   // a longer barrel with each level
    if (m.auto) box(sl, 0.006, 0.012, 0.04, GM.orange, X + 0.017, 1.135, 0.56);   // the auto sear's selector
    if (m.burst) { box(sl, 0.03, 0.03, 0.016, GM.metal2, X, 1.142, 0.536); box(sl, 0.01, 0.016, 0.02, GM.orange, X + 0.016, 1.15, 0.53).rotation.y = 0.35; }
    return { front, y: 1.142, magZ: 0.567, magY: 1.05, slide: sl, travel: 0.07, lock: true, top: 1.161, sz: 0.6, ownMags: true, laser: { y: 1.1, z: 0.786 } };   // the laser on the dust cover's rail
  },
  // .357 revolver: a stainless Smith & Wesson, measured off side-on photos (a 6" 617 for the frame, a snub-nosed 986
  // for the grips). The frame has a real window for the cylinder (so it's empty when the cylinder swings out), a thin
  // top strap with the rear sight, the hammer's checkered spur behind it, the trigger guard loop with a wide smooth
  // trigger; the fluted cylinder rides a crane hinged at its lower left and swings out to the left like a real one; the
  // barrel is a round tube with a rib and a full underlug, a ramped front sight with its red insert, longer with each
  // level (snub, 4", 6", 8 3/8"); the grips are finger-grooved wood with the medallion. Any optic goes on a picatinny
  // rail screwed down the top strap and on along the barrel's rib, in place of the rear sight (a Weigand-style mount)
  revolver(g, m) {
    const S2 = GM.stainless, D = GM.stainlessD, cy0 = REV_CYL.y, cr = REV_CYL.r, optic = T('sight') > 0;
    // ---- frame: grip frame, recoil shield, the window round the cylinder, the yoke's seat, the trigger guard
    profile(g, shp([[0.53, 1.118], [0.514, 1.134], [0.515, 1.158], [0.54, 1.155], [0.552, 1.165], [0.562, 1.174], [0.672, 1.174], [0.672, 1.125], [0.666, 1.115], [0.664, 1.088], [0.64, 1.087], [0.636, 1.081], [0.632, 1.062], [0.622, 1.048], [0.606, 1.042], [0.583, 1.04], [0.571, 1.043], [0.566, 1.061], [0.552, 1.061], [0.545, 1.064]],
      [rrect(0.577, 1.114, 0.662, 1.167, 0.004), shp([[0.628, 1.078], [0.624, 1.062], [0.614, 1.052], [0.598, 1.048], [0.584, 1.049], [0.577, 1.056], [0.577, 1.08]])]), 0.03, S2, X, 0.0025);
    box(g, 0.024, 0.05, 0.08, GM.rubber, X, 1.141, 0.62);   // the frame's inner wall behind the cylinder, so the window isn't see-through
    if (!optic) { box(g, 0.016, 0.009, 0.012, GM.rubber, X, 1.178, 0.558); box(g, 0.004, 0.004, 0.003, GM.dot, X, 1.181, 0.552); }   // rear sight
    [[0.548, 1.1], [0.556, 1.075]].forEach(([z, yy]) => cyl(g, 0.0035, 0.033, D, X, yy, z, 10).rotation.set(0, 0, Math.PI / 2));   // side plate screws
    box(g, 0.004, 0.008, 0.016, D, X + 0.016, 1.15, 0.566);   // the cylinder release, on the left
    profile(g, shp([[0.535, 1.135], [0.548, 1.162], [0.54, 1.168], [0.522, 1.166], [0.512, 1.162], [0.52, 1.156], [0.532, 1.152]]), 0.009, m.fan ? GM.brass : GM.steelDk, X, 0.001);   // hammer
    profile(g, shp([[0.594, 1.113], [0.609, 1.113], [0.618, 1.094], [0.616, 1.072], [0.606, 1.056], [0.596, 1.054], [0.604, 1.066], [0.605, 1.084], [0.598, 1.1]]), 0.01, GM.steel, X, 0.0012);   // the wide smooth trigger
    // ---- the grips, traced off the photo: black rubber up over the back strap to just under the hammer, a finger
    // groove down the front, pebbled sides inside a smooth border, the medallion and the screw; steel shows above the
    // rubber's top edge
    profile(g, shp([[0.4951, 1.1259], [0.5009, 1.1286], [0.511, 1.1291], [0.5145, 1.128], [0.5167, 1.1258], [0.5216, 1.1117], [0.5254, 1.1063], [0.5324, 1.1007], [0.5465, 1.0935], [0.5522, 1.0898], [0.5572, 1.0838], [0.5605, 1.0752], [0.5655, 1.061], [0.571, 1.061], [0.571, 1.12], [0.53, 1.138], [0.512, 1.138]]), 0.026, S2, X, 0.002);
    const RG = [[0.5605, 1.0752], [0.5572, 1.0838], [0.5522, 1.0898], [0.5465, 1.0935], [0.5324, 1.1007], [0.5254, 1.1063], [0.5216, 1.1117], [0.5167, 1.1258], [0.5145, 1.128], [0.511, 1.1291], [0.5009, 1.1286], [0.4951, 1.1259], [0.4926, 1.1232], [0.4905, 1.1116], [0.4881, 1.104], [0.4851, 1.0973], [0.4793, 1.0881], [0.4748, 1.0837], [0.4703, 1.0765], [0.4655, 1.0703], [0.4618, 1.0635], [0.4579, 1.0565], [0.4555, 1.0485], [0.4534, 1.0447], [0.4503, 1.0333], [0.4493, 1.0236], [0.4471, 1.0151], [0.4452, 1.002], [0.4438, 0.9969], [0.4425, 0.9915], [0.4407, 0.9841], [0.4406, 0.9799], [0.4415, 0.9773], [0.4445, 0.9754], [0.4491, 0.9739], [0.4588, 0.9733], [0.4694, 0.9724], [0.4811, 0.9711], [0.4989, 0.9711], [0.5062, 0.972], [0.5078, 0.9734], [0.5088, 0.9758], [0.5092, 0.9866], [0.5112, 0.9911], [0.5164, 0.9991], [0.5174, 1.0025], [0.5168, 1.0088], [0.5155, 1.0096], [0.515, 1.0153], [0.5154, 1.0185], [0.5168, 1.0221], [0.5234, 1.0323], [0.5248, 1.0488], [0.5272, 1.0543], [0.5311, 1.0591], [0.5346, 1.0615], [0.539, 1.0631], [0.5427, 1.0648], [0.5469, 1.0641], [0.5517, 1.0617], [0.5605, 1.0575]];
    solid(g, RG, 0.038, GM.poly, X, 0.008);
    stipple(g, clipTo(inset(RG, 0.0095), [[0.42, 0.95], [0.6, 0.95], [0.6, 1.083], [0.42, 1.083]]), 0.019, 0.0026, GM.ano, GM.poly);
    [-1, 1].forEach(sd => { cyl(g, 0.0093, 0.0016, GM.ano, X + sd * 0.0197, 1.0113, 0.4777, 24).rotation.set(0, 0, Math.PI / 2); cyl(g, 0.0068, 0.002, GM.poly, X + sd * 0.0199, 1.0113, 0.4777, 24).rotation.set(0, 0, Math.PI / 2); });   // the medallions
    cyl(g, 0.0042, 0.0018, D, X + 0.0199, 1.037, 0.4777, 12).rotation.set(0, 0, Math.PI / 2);   // the grip screw
    // ---- the cylinder on its crane (weapons/reload.js swings it out): fluted, the chamber mouths at its back, the
    // ejector rod in front; the crane's arm
    const crane = new THREE.Group(); crane.position.set(X + 0.014, cy0 - 0.02, 0.62); g.add(crane);
    const cg = new THREE.Group(); cg.position.set(-0.014, 0.02, 0); crane.add(cg);
    cyl(cg, cr, 0.08, S2, 0, 0, 0, 24);
    for (let k = 0; k < 6; k++) { const a = (k + 0.5) * Math.PI / 3; const f = box(cg, 0.007, 0.004, 0.048, D, Math.cos(a) * (cr - 0.0005), Math.sin(a) * (cr - 0.0005), -0.004); f.rotation.z = a + Math.PI / 2; }   // the flutes
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; cyl(cg, 0.0052, 0.003, GM.rubber, Math.cos(a) * REV_CYL.ch, Math.sin(a) * REV_CYL.ch, -0.04, 10); }   // chamber mouths, seen when it swings out
    cyl(cg, 0.0035, 0.07, GM.steel, 0, 0, 0.074, 10); cyl(cg, 0.005, 0.008, GM.steel, 0, 0, 0.11, 10);   // ejector rod and its knob
    box(crane, 0.008, 0.02, 0.012, S2, -0.006, 0.006, 0.042);   // the crane's arm
    // ---- barrel: tube, rib, full underlug round the ejector rod, the front sight, the bore
    const bl = [0.085, 0.14, 0.195, 0.255][m.longbarrel || 0], z1 = 0.672 + bl;
    cyl(g, 0.0172, bl, S2, X, 1.152, 0.672 + bl / 2, 24);
    box(g, 0.012, 0.005, bl, S2, X, 1.1705, 0.672 + bl / 2);
    profile(g, shp([[0.672, 1.14], [z1 - 0.004, 1.14], [z1, 1.135], [z1 - 0.003, 1.126], [0.672, 1.125]]), 0.024, S2, X, 0.002);
    profile(g, shp([[z1 - 0.034, 1.173], [z1 - 0.012, 1.182], [z1 - 0.006, 1.182], [z1 - 0.004, 1.173]]), 0.004, S2, X, 0.0005); box(g, 0.0046, 0.004, 0.004, GM.dotR, X, 1.179, z1 - 0.012);
    cyl(g, 0.0062, 0.004, GM.rubber, X, 1.152, z1 + 0.0005, 14);
    // ---- the rail, with an optic: flat on the top strap, then on a base saddled over the barrel's top (the rib under it),
    // the picatinny section on that with its cross slots, the base's screw showing each side; it stops short of the front
    // sight. The scope that goes on it is a handgun scope, shorter and slimmer than a rifle's, its long eye relief
    // putting it forward over the cylinder and barrel, low in its rings (weapons/attachments.js)
    let top = 1.174;
    if (optic) {
      const r0 = REV_RAIL.z0, r1 = Math.min(REV_RAIL.z1, z1 - 0.042), b0 = 1.1725, RT = b0 + 0.0105;
      xsec(g, shp([[X - 0.011, 1.165], [X + 0.011, 1.165], [X + 0.013, 1.169], [X + 0.013, b0 + 0.0012], [X - 0.013, b0 + 0.0012], [X - 0.013, 1.169]]), 0.672, r1, GM.rail, 0.0006);   // its base saddled over the barrel
      xsec(g, shp([[X - 0.0125, b0], [X + 0.0125, b0], [X + 0.0168, b0 + 0.003], [X + 0.0168, b0 + 0.005], [X + 0.0148, RT], [X - 0.0148, RT], [X - 0.0168, b0 + 0.005], [X - 0.0168, b0 + 0.003]]), r0, r1, GM.rail, 0.0006);
      for (let z = r0 + 0.012; z < r1 - 0.008; z += 0.0172) box(g, 0.0338, 0.0034, 0.0065, GM.rubber, X, RT - 0.0015, z);   // the cross slots, flush with its top
      [-1, 1].forEach(sd => cyl(g, 0.0028, 0.003, GM.steelDk, X + sd * 0.0132, 1.168, (0.672 + r1) / 2, 10).rotation.set(0, 0, Math.PI / 2));   // the base's screw, through it each side
      top = RT;
    }
    return { front: z1, y: 1.152, top, sz: 0.62, crane, laser: { y: 1.125, z: z1 - 0.05 }, scopeH: 0.04, scopeK: 0.74, scopeR: 0.8, scopeZ: 0.652 };   // the laser clamped under the lug
  },
  // .50 hand cannon: a stainless Desert Eagle Mark XIX, traced off a side-on photo. A fixed barrel block (a slotted
  // rail along its top, chamfered shoulders, a long flute down each side), the slide behind it (slanted serrations, the
  // round safety levers, the rear sight), the frame's lip under the barrel with its takedown buttons and slide stop, a
  // squared trigger guard, the steel grip with a beavertail and black rubber panels, and the magazine's base
  deagle(g, m) {
    const S2 = GM.stainless, D = GM.stainlessD;
    // ---- barrel block, its rail, flutes, front sight
    profile(g, shp([[0.674, 1.126], [0.905, 1.126], [0.913, 1.149], [0.916, 1.161], [0.915, 1.176], [0.91, 1.183], [0.674, 1.183]]), 0.026, S2, X, 0.003);
    xsec(g, shp([[X - 0.0105, 1.181], [X + 0.0105, 1.181], [X + 0.0085, 1.1875], [X - 0.0085, 1.1875]]), 0.674, 0.908, S2, 0.0006);
    for (let k = 0; k < 9; k++) box(g, 0.022, 0.003, 0.005, D, X, 1.1865, 0.745 + k * 0.0165);
    [-1, 1].forEach(sd => { box(g, 0.0022, 0.011, 0.194, D, X + sd * 0.0156, 1.161, 0.776); box(g, 0.0016, 0.003, 0.226, D, X + sd * 0.0152, 1.177, 0.792); });
    box(g, 0.004, 0.011, 0.012, GM.rubber, X, 1.192, 0.901);
    cyl(g, 0.0062, 0.004, GM.rubber, X, 1.16, 0.9165, 14);
    // ---- frame: the lip under the barrel, takedown buttons, slide stop, the guard and trigger, the hammer
    box(g, 0.03, 0.008, 0.22, S2, X, 1.122, 0.782);
    [[0.708, 1.111], [0.705, 1.1235]].forEach(([z, yy]) => cyl(g, 0.0042, 0.034, D, X, yy, z, 12).rotation.set(0, 0, Math.PI / 2));
    cyl(g, 0.0053, 0.003, D, X + 0.0165, 1.0749, 0.6426, 16).rotation.set(0, 0, Math.PI / 2);   // the magazine release, on the left
    [-1, 1].forEach(sd => box(g, 0.0025, 0.006, 0.06, D, X + sd * 0.0168, 1.1155, 0.628));
    // the guard, traced: its rear sweeping round into the front strap, a flat bottom, the front leaning forward as it
    // rises to the frame; the broad curved trigger blade sweeping back almost to the loop's rear wall
    profile(g, shp(inset([[0.7238, 1.124], [0.643, 1.124], [0.643, 1.0622], [0.6496, 1.0643], [0.6561, 1.0647], [0.6648, 1.062], [0.6693, 1.0616], [0.7042, 1.0619], [0.7096, 1.0624], [0.7111, 1.0633], [0.7127, 1.0664], [0.7109, 1.0787], [0.7117, 1.0885], [0.7138, 1.0954], [0.7162, 1.1002], [0.7195, 1.1048], [0.7238, 1.1091]], 0.0015),
      [shp(inset([[0.6492, 1.108], [0.648, 1.0959], [0.6468, 1.0912], [0.6466, 1.0868], [0.6471, 1.0833], [0.6488, 1.0791], [0.6517, 1.0748], [0.6541, 1.0725], [0.6582, 1.07], [0.6636, 1.0686], [0.6761, 1.0682], [0.6983, 1.0684], [0.7022, 1.07], [0.7044, 1.0729], [0.7048, 1.0747], [0.7044, 1.0905], [0.7031, 1.0969], [0.7019, 1.0994], [0.6992, 1.1017], [0.6975, 1.1048], [0.691, 1.1085], [0.6847, 1.1097], [0.6726, 1.11]], -0.0015))]), 0.022, S2, X, 0.0015);
    profile(g, shp([[0.655, 1.112], [0.6726, 1.112], [0.6726, 1.1093], [0.6655, 1.1073], [0.6634, 1.1036], [0.6605, 1.0941], [0.6607, 1.088], [0.6627, 1.0793], [0.6672, 1.0717], [0.6657, 1.0687], [0.664, 1.0699], [0.658, 1.0729], [0.6553, 1.0754], [0.6522, 1.0795], [0.6501, 1.0843], [0.6493, 1.0878], [0.6492, 1.0955], [0.65, 1.105]]), 0.008, GM.steel, X, 0.0008);
    profile(g, shp([[0.534, 1.165], [0.54, 1.165], [0.541, 1.175], [0.532, 1.182], [0.529, 1.178]]), 0.012, D, X, 0.001);
    // ---- the grip, traced off the photo: a rounded steel core (the beavertail's tang out over the hand, the web curving
    // in under it, the back strap raking back, the straight front strap flaring at its foot), the thick rubber panels
    // proud on each side (their own traced outline, notched under the slide stop, steel showing round them), the
    // medallion and the screw; the magazine's base with its finger lip
    const GO = [[0.6462, 1.122], [0.536, 1.122], [0.5346, 1.1327], [0.533, 1.1302], [0.5293, 1.1272], [0.5169, 1.1258], [0.51, 1.1241], [0.5021, 1.1206], [0.4972, 1.1162], [0.4979, 1.1132], [0.4998, 1.1109], [0.5019, 1.1098], [0.5296, 1.1096], [0.5386, 1.1077], [0.5437, 1.1048], [0.5477, 1.1011], [0.5502, 1.0978], [0.5526, 1.0923], [0.5537, 1.0859], [0.5531, 1.0765], [0.5498, 1.0634], [0.5377, 1.0379], [0.5289, 1.0168], [0.5249, 1.002], [0.5221, 0.9829], [0.5218, 0.9764], [0.5238, 0.9725], [0.528, 0.9695], [0.548, 0.9665], [0.6, 0.9648], [0.627, 0.9643], [0.6321, 0.9657], [0.6292, 0.975], [0.6271, 0.9824], [0.6274, 0.989], [0.6401, 1.0548], [0.643, 1.0602], [0.6459, 1.0626], [0.6462, 1.122]];
    solid(g, GO, 0.032, S2, X, 0.004);
    const RO = clipTo([[0.5297, 0.9756], [0.6109, 0.976], [0.619, 1.0153], [0.6321, 1.0845], [0.6325, 1.11], [0.6015, 1.11], [0.594, 1.112], [0.5933, 1.1215], [0.5745, 1.1215], [0.5606, 1.0784], [0.5548, 1.0694], [0.5482, 1.0561], [0.5406, 1.0398], [0.5349, 1.0238], [0.5279, 1.0078], [0.5257, 0.9984], [0.5234, 0.9808], [0.5247, 0.9764]], [[0.4, 0.9], [0.7, 0.9], [0.7, 1.1215], [0.4, 1.1215]]);
    const RI = pullInside(RO, inset(GO, 0.0035)), RF = inset(RI, 0.0045);
    // the stippled fields: one above the smooth band that runs down across the panel through the medallion, one below
    stipple(g, pullInside([[0.6255, 1.065], [0.6255, 1.0995], [0.586, 1.1005], [0.575, 1.085], [0.565, 1.065], [0.556, 1.04], [0.553, 1.027]], RF), 0.0215, 0.0026, GM.poly, GM.rubber);
    stipple(g, pullInside([[0.6085, 0.985], [0.616, 1.02], [0.6225, 1.057], [0.548, 0.998], [0.5495, 0.987]], RF), 0.0215, 0.0026, GM.poly, GM.rubber);
    [-1, 1].forEach(sd => {
      solid(g, RI, 0.006, GM.rubber, X + sd * 0.0185, 0.0024);
      cyl(g, 0.0098, 0.0012, GM.poly, X + sd * 0.0218, 1.0475, 0.5866, 24).rotation.set(0, 0, Math.PI / 2); cyl(g, 0.0074, 0.0016, GM.rubber, X + sd * 0.0219, 1.0475, 0.5866, 24).rotation.set(0, 0, Math.PI / 2);   // the medallion
      cyl(g, 0.0032, 0.0016, D, X + sd * 0.0219, 1.0156, 0.5404, 12).rotation.set(0, 0, Math.PI / 2);   // the grip screw
    });
    { const mg = g.userData.magG || g; solid(mg, [[0.5491, 0.9636], [0.6196, 0.9639], [0.6201, 0.962], [0.6319, 0.9613], [0.6334, 0.9594], [0.6327, 0.9578], [0.6171, 0.9554], [0.5541, 0.9549], [0.5463, 0.9584], [0.5483, 0.9599]], 0.036, GM.poly, X, 0.0015); box(mg, 0.024, 0.15, 0.06, GM.metal2, X, 1.03, 0.578).rotation.x = 0.16; }
    // ---- the slide: it rides back on each shot and locks open on an empty mag (player/hold.js)
    const sl = new THREE.Group(); g.add(sl);
    profile(sl, shp([[0.536, 1.122], [0.672, 1.122], [0.672, 1.188], [0.6, 1.188], [0.564, 1.185], [0.553, 1.175], [0.548, 1.17], [0.536, 1.17]]), 0.03, S2, X, 0.003);
    for (let k = 0; k < 9; k++) [-1, 1].forEach(sd => { const sr = box(sl, 0.002, 0.044, 0.0035, D, X + sd * 0.0181, 1.152, 0.6 + k * 0.0072); sr.rotation.x = 0.26; });
    [-1, 1].forEach(sd => { cyl(sl, 0.0078, 0.003, D, X + sd * 0.0188, 1.171, 0.566, 18).rotation.set(0, 0, Math.PI / 2); cyl(sl, 0.0062, 0.004, GM.steel, X + sd * 0.0198, 1.171, 0.566, 18).rotation.set(0, 0, Math.PI / 2); const lv = box(sl, 0.003, 0.006, 0.026, GM.steel, X + sd * 0.0198, 1.167, 0.578); lv.rotation.x = 0.22; box(sl, 0.0032, 0.0028, 0.0028, GM.red, X + sd * 0.0198, 1.164, 0.561); });
    box(sl, 0.024, 0.006, 0.02, S2, X, 1.19, 0.58); [-0.0075, 0.0075].forEach(o => box(sl, 0.006, 0.008, 0.012, GM.rubber, X + o, 1.196, 0.576));
    // the bolt in the slide's mouth, seen when it runs back
    cyl(g, 0.012, 0.075, GM.steel, X, 1.16, 0.64, 14); box(g, 0.024, 0.03, 0.08, GM.rubber, X, 1.15, 0.636);
    let front = 0.916; if (m.comp) { const L = 0.1 + 0.03 * (m.comp - 1); profile(g, shp([[0.916, 1.128], [0.916 + L, 1.132], [0.916 + L, 1.183], [0.916, 1.185]]), 0.03, S2, X, 0.003); for (let k = 0; k < 2 + m.comp; k++) box(g, 0.026, 0.006, 0.012, GM.rubber, X, 1.188, 0.935 + k * 0.025); front = 0.916 + L; }   // longer, with another port, each level
    if (roundOn(tierCtx) === 'boom') box(g.userData.magG || g, 0.0366, 0.0035, 0.07, GM.red, X, 0.9595, 0.589);   // explosive tips: the mag's base plate painted with a red band
    return { front, y: 1.16, magZ: 0.588, magY: 1.07, slide: sl, travel: 0.07, lock: true, top: 1.188, sz: 0.61, laser: { y: 1.118, z: 0.81 }, stickMags: true };   // the laser under the frame's lip
  },
  // pump shotgun: a Mossberg 500 Field, traced off a side-on photo. The receiver is a slab with its rear top rolled down
  // onto the tang (the safety button sits there) and the ejection port on the shooter's right, the bolt showing in it;
  // the barrel is long and slim with a vent rib and a bead, the magazine tube under it ends in its cap and swivel
  // stud; the wood forend (finger groove, checkering) rides the tube on its action bars; the stock has a Mossberg's
  // hooked pistol grip with checkering, and a rubber pad with its diamond grooves
  pump(g, m) {
    const W = GM.walnut, K = GM.metal, B = GM.blued;
    // ---- stock (traced: the comb, the hollow of the wrist sweeping down into the grip, the belly to the toe), the pad
    // and its spacer, the sling stud, the checkering along the wrist; the wrist slimmer than the butt
    const sg = new THREE.Group(); g.add(sg);
    const SO = [[0.1645, 1.0964], [0.2083, 1.1025], [0.3798, 1.1207], [0.3896, 1.1207], [0.4041, 1.117], [0.4186, 1.1176], [0.4251, 1.1195], [0.471, 1.1404], [0.4802, 1.144], [0.4832, 1.1437], [0.5, 1.1437], [0.506, 1.14], [0.506, 1.104], [0.4939, 1.103], [0.4899, 1.1002], [0.4761, 1.0958], [0.4623, 1.0899], [0.45, 1.0817], [0.4417, 1.074], [0.4334, 1.0633], [0.4256, 1.0469], [0.4203, 1.0367], [0.415, 1.0364], [0.3713, 1.0462], [0.3584, 1.0442], [0.2157, 0.9858], [0.1996, 0.9798], [0.168, 0.9674]];
    solid(sg, SO, 0.052, W, X, 0.01);
    solid(sg, [[0.1393, 1.0948], [0.136, 1.0898], [0.135, 1.0726], [0.139, 1.0022], [0.1388, 0.9625], [0.1395, 0.9587], [0.1418, 0.9571], [0.1655, 0.9665], [0.1625, 1.0962]], 0.054, GM.pad, X, 0.008);
    profile(sg, shp([[0.1625, 1.0962], [0.1655, 0.9665], [0.169, 0.968], [0.1662, 1.0966]]), 0.05, GM.rubber, X, 0.002);   // the spacer
    for (let r = 0; r < 8; r++) for (let c = 0; c < 2; c++) [-1, 1].forEach(sd => { const d = box(sg, 0.002, 0.008, 0.008, GM.rubber, X + sd * 0.027, 0.975 + r * 0.0145 + c * 0.007, 0.147 + c * 0.009); d.rotation.x = Math.PI / 4; });   // the pad's diamond grooves
    checker(sg, clipTo(inset(SO, 0.0115), [[0.378, 1.072], [0.40, 1.079], [0.44, 1.093], [0.465, 1.108], [0.477, 1.135], [0.46, 1.13], [0.43, 1.118], [0.40, 1.106], [0.384, 1.097]].reverse()), 0.026, 0.0034, 0.52);
    taperX(sg, pw([[0.3, 1], [0.42, 0.82], [0.48, 0.84], [0.5, 0.8]]));
    { const t = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.002, 6, 10), GM.metal2); t.rotation.y = Math.PI / 2; t.position.set(X, 0.98, 0.207); g.add(t); box(g, 0.006, 0.008, 0.01, GM.metal2, X, 0.987, 0.207); }
    // ---- receiver: the port on the right (a window through it, filled behind so it reads as a recess), the pins, the
    // safety on the tang
    profile(g, shp([[0.489, 1.146], [0.495, 1.151], [0.503, 1.157], [0.52, 1.161], [0.6, 1.163], [0.717, 1.163], [0.718, 1.106], [0.612, 1.105], [0.598, 1.101], [0.497, 1.103], [0.489, 1.101]], [rrect(0.617, 1.139, 0.694, 1.157, 0.003)]), 0.038, K, X, 0.003);
    portFill(g, 0.617, 1.139, 0.694, 1.157, 0.038, 0.003, K);
    box(g, 0.02, 0.012, 0.024, GM.metal2, X, 1.165, 0.518); box(g, 0.006, 0.004, 0.012, GM.orange, X, 1.172, 0.521);
    [[0.523, 1.13], [0.537, 1.15]].forEach(([z, yy]) => cyl(g, 0.0042, 0.046, GM.metal2, X, yy, z, 10).rotation.set(0, 0, Math.PI / 2));
    // ---- trigger guard (rounded at the back, square at the front) and the trigger
    profile(g, shp([[0.52, 1.104], [0.579, 1.104], [0.579, 1.066], [0.536, 1.066], [0.524, 1.074], [0.519, 1.088]], [shp([[0.527, 1.1], [0.572, 1.1], [0.572, 1.072], [0.538, 1.072], [0.53, 1.078], [0.526, 1.09]])]), 0.012, K, X, 0.0015);
    profile(g, shp([[0.548, 1.102], [0.556, 1.102], [0.56, 1.088], [0.557, 1.077], [0.551, 1.073], [0.553, 1.085], [0.549, 1.095]]), 0.006, GM.metal2, X, 0.0008);
    // ---- barrel with its vent rib (a strip on posts) and bead; the collar where it meets the receiver
    cyl(g, 0.0125, 0.016, B, X, 1.15, 0.726, 18); cyl(g, 0.0095, 0.66, B, X, 1.15, 1.058, 18);
    box(g, 0.009, 0.0024, 0.655, B, X, 1.1635, 1.058);
    for (let z = 0.75; z < 1.38; z += 0.057) box(g, 0.004, 0.004, 0.026, B, X, 1.1605, z);
    { const bd = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 6), GM.dot); bd.position.set(X, 1.168, 1.378); g.add(bd); }
    // ---- magazine tube and its cap, the barrel's lug that clamps onto it, the swivel stud; with an extension, the tube
    // runs on toward the muzzle and a clamp holds it to the barrel
    const tEnd = [1.146, 1.25, 1.32, 1.385][T('mag')];   // (its magazine line: Tube extension, Long tube, Full-length tube)
    cyl(g, 0.0088, tEnd - 0.718, GM.metal, X, 1.1225, (tEnd + 0.718) / 2, 16);
    box(g, 0.012, 0.022, 0.03, B, X, 1.135, 1.13);
    cyl(g, 0.0102, 0.026, B, X, 1.1225, tEnd - 0.011, 16); cyl(g, 0.0036, 0.012, GM.metal2, X, 1.1225, tEnd + 0.004, 10);
    if (T('mag')) { ring(g, 0.0118, 0.004, GM.metal2, X, 1.1225, 1.146); box(g, 0.014, 0.034, 0.016, GM.metal2, X, 1.137, tEnd - 0.05); }
    // ---- the forend and its action bars ride together (the pump cycle slides this group, player/hold.js)
    const fe = new THREE.Group(); g.add(fe);
    const FE = [[0.8048, 1.0935], [0.797, 1.0955], [0.7967, 1.0985], [0.7992, 1.1018], [0.8012, 1.1245], [0.8048, 1.1383], [0.8071, 1.142], [0.8269, 1.1496], [0.864, 1.1504], [1.0052, 1.1496], [1.0225, 1.1487], [1.028, 1.1436], [1.0299, 1.125], [1.0294, 1.1069], [1.0286, 1.102], [1.026, 1.1], [0.93, 1.0968], [0.87, 1.095]];
    solid(fe, FE, 0.058, W, X, 0.01);
    [-1, 1].forEach(sd => box(fe, 0.002, 0.004, 0.17, GM.walnut2, X + sd * 0.0292, 1.117, 0.93));   // the flute
    checker(fe, clipTo(inset(FE, 0.0115), [[0.875, 1.0], [0.995, 1.0], [0.985, 1.119], [0.885, 1.119]]), 0.029, 0.0034, 0.52);
    [-1, 1].forEach(sd => box(fe, 0.003, 0.006, 0.12, GM.metal2, X + sd * 0.008, 1.134, 0.758));
    // ---- the bolt in the port, which runs back with the forend
    const bolt = box(g, 0.004, 0.017, 0.074, GM.steel, X - 0.0176, 1.148, 0.656);
    // a side saddle of spare shells on the left of the receiver, longer with each magazine tier
    const sm = shellMat(tierCtx);   // in the colour of the shells loaded
    const n = Math.min(8, 4 + T('mag') * 2);
    box(g, 0.006, 0.05, 0.024 * n + 0.01, GM.poly, X + 0.025, 1.132, 0.51 + n * 0.012);
    for (let k = 0; k < n; k++) { const z = 0.522 + k * 0.024; cyl(g, 0.0105, 0.054, sm, X + 0.039, 1.14, z, 10).rotation.set(0, 0, 0); cyl(g, 0.0112, 0.014, GM.brass, X + 0.039, 1.106, z, 10).rotation.set(0, 0, 0); }   // stood upright in it
    return { front: 1.39, y: 1.15, slide: fe, bolts: [bolt], travel: 0.15, cyc: true, top: 1.165, sz: 0.6 };
  },
  // double barrel: a side-by-side, traced off side-on photos: a hammerless sidelock (the lock plates with their
  // engraved border, the top lever and the safety on the tang, the action bar running forward under the barrels to the
  // rounded knuckle), blued barrels with a matted rib and a bead, a slim splinter forend, a long tang guard round the
  // double triggers and a walnut stock with a rounded grip knob and a pad. The sawn-off is a coach gun: short barrels,
  // a deep forend reaching nearly to the muzzle and a taped pistol grip. The barrels, rib, forend and extractor hang on
  // the hinge pin in their own group, so the gun really breaks open to be loaded (player/hold.js); the shells' brass
  // heads show in the chambers
  dbl(g, m) {
    const B = GM.blued, E = GM.engr, W = GM.walnut, bl = m.sawn ? 0.343 : 0.788, z0 = 0.612, z1 = z0 + bl;
    // ---- the action: lock plates and standing breech, the bar and knuckle, top lever and safety, guard and triggers
    profile(g, shp([[0.542, 1.133], [0.552, 1.136], [0.57, 1.137], [0.582, 1.141], [0.585, 1.152], [z0, 1.152], [z0, 1.12], [0.7, 1.12], [0.712, 1.112], [0.716, 1.1], [0.711, 1.088], [0.7, 1.082], [0.637, 1.08], [0.6, 1.08], [0.542, 1.082]]), 0.05, E, X, 0.004);
    [-1, 1].forEach(sd => { profile(g, shp([[0.548, 1.088], [0.606, 1.088], [0.606, 1.13], [0.578, 1.13], [0.548, 1.124]], [shp([[0.552, 1.092], [0.602, 1.092], [0.602, 1.126], [0.579, 1.126], [0.552, 1.121]])]), 0.002, GM.engrD, X + sd * 0.0285, 0.0005);
      cyl(g, 0.0055, 0.004, GM.engrD, X + sd * 0.029, 1.096, 0.705, 14).rotation.set(0, 0, Math.PI / 2); cyl(g, 0.003, 0.004, GM.steelDk, X + sd * 0.029, 1.11, 0.565, 10).rotation.set(0, 0, Math.PI / 2); });
    { const tg = new THREE.Group(); tg.position.set(X, 0, z0 - 0.006); g.add(tg); profile(tg, shp([[0.572 - z0 + 0.006, 1.151], [0.006, 1.151], [0.006, 1.159], [0.58 - z0 + 0.006, 1.161]]), 0.012, GM.steel, -0.004, 0.001); tg.rotation.y = -0.25; }   // top lever on its spindle, swung to the right
    box(g, 0.008, 0.004, 0.014, GM.steel, X, 1.138, 0.556);   // safety on the tang
    profile(g, shp([[0.536, 1.082], [0.648, 1.082], [0.632, 1.067], [0.61, 1.058], [0.586, 1.058], [0.565, 1.07], [0.55, 1.078], [0.536, 1.078]], [shp([[0.635, 1.078], [0.626, 1.069], [0.608, 1.063], [0.588, 1.063], [0.57, 1.073], [0.566, 1.078]])]), 0.01, GM.steelDk, X, 0.0012);
    [0.6, 0.582].forEach(z => profile(g, shp([[z, 1.08], [z + 0.007, 1.08], [z + 0.011, 1.069], [z + 0.008, 1.06], [z + 0.002, 1.059], [z + 0.004, 1.068]]), 0.006, m.both ? GM.brass : GM.steel, X, 0.0008));
    if (m.both) box(g, 0.004, 0.004, 0.024, GM.brass, X, 1.067, 0.596);   // the triggers linked to fire both
    // ---- the stock, or a sawn-off's taped pistol grip
    if (!m.sawn) {
      // traced off the photo: the straight comb, the wrist dipping then rising into the lock plates, the pistol grip
      // down to its cap, the long belly to the toe; slimmer through the wrist; checkering on the grip; the black pad
      const sg = new THREE.Group(); g.add(sg);
      const SO = [[0.188, 1.1035], [0.2823, 1.1113], [0.4461, 1.1259], [0.459, 1.1245], [0.4741, 1.116], [0.4835, 1.1162], [0.5318, 1.1285], [0.5521, 1.1373], [0.549, 1.084], [0.5429, 1.0817], [0.5248, 1.0717], [0.508, 1.058], [0.4818, 1.0211], [0.4718, 1.0186], [0.4482, 1.0274], [0.4384, 1.0344], [0.433, 1.0478], [0.3007, 0.9936], [0.2843, 0.9871], [0.2045, 0.9549]];
      solid(sg, SO, 0.054, W, X, 0.011);
      solid(sg, [[0.1639, 1.1033], [0.188, 1.1035], [0.2045, 0.9549], [0.1853, 0.9472], [0.1802, 0.9493], [0.176, 0.9546], [0.1695, 1.0052], [0.1552, 1.0851], [0.1562, 1.0956]], 0.056, GM.pad, X, 0.007);
      checker(sg, clipTo(inset(SO, 0.0125), [[0.452, 1.04], [0.478, 1.032], [0.51, 1.07], [0.538, 1.105], [0.536, 1.13], [0.49, 1.12], [0.46, 1.1]]), 0.027, 0.0034, 0.52);
      taperX(sg, pw([[0.3, 1], [0.44, 0.8], [0.5, 0.8], [0.548, 1.02]]));
    } else {
      solid(g, [[0.371, 1.04], [0.39, 1.07], [0.41, 1.09], [0.427, 1.101], [0.455, 1.114], [0.474, 1.12], [0.489, 1.13], [0.546, 1.134], [0.546, 1.084], [0.491, 1.066], [0.467, 1.066], [0.457, 1.06], [0.437, 1.044], [0.418, 1.018], [0.403, 1.015], [0.395, 1.018], [0.378, 1.028]], 0.05, W, X, 0.01);
      profile(g, shp([[0.369, 1.042], [0.39, 1.072], [0.402, 1.064], [0.392, 1.04], [0.382, 1.023], [0.375, 1.028]]), 0.05, GM.rubber, X, 0.004);   // tape round its end
    }
    // ---- the barrels and everything on them, hung on the hinge pin
    const brk = new THREE.Group(); brk.position.set(X, 1.096, 0.705); g.add(brk);
    const bx = (x, yy, z) => [x, yy - 1.096, z - 0.705];
    [-1, 1].forEach(sd => {
      cyl(brk, 0.0145, bl, B, ...bx(sd * 0.0155, 1.14, z0 + bl / 2), 18);
      cyl(brk, 0.0158, 0.05, B, ...bx(sd * 0.0155, 1.14, z0 + 0.025), 18);
      cyl(brk, 0.0105, 0.002, GM.rubber, ...bx(sd * 0.0155, 1.14, z1 + 0.0005), 14);
      cyl(brk, 0.0105, 0.002, GM.rubber, ...bx(sd * 0.0155, 1.14, z0 - 0.0005), 14);
    });
    box(brk, 0.012, 0.011, bl - 0.01, B, ...bx(0, 1.1535, z0 + bl / 2));   // the rib, sunk into the valley between them
    box(brk, 0.008, 0.006, bl - 0.02, B, ...bx(0, 1.124, z0 + bl / 2));
    { const bd = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 6), GM.dot); bd.position.set(...bx(0, 1.161, z1 - 0.012)); brk.add(bd); }
    box(brk, 0.022, 0.024, 0.07, B, ...bx(0, 1.114, z0 + 0.04));   // the lumps, down into the bar
    box(brk, 0.012, 0.008, 0.004, GM.steel, ...bx(0, 1.152, z0 + 0.0015));   // extractor
    profile(brk, shp([[0.012, 0.024], [0.06, 0.028], [0.06, 0.006], [0.04, -0.006], [0.016, -0.012], [0.006, -0.006]]), 0.044, GM.engrD, 0, 0.002);   // forend iron
    if (!m.sawn) profile(brk, shp([[0.72, 1.12], [0.972, 1.126], [0.975, 1.119], [0.96, 1.112], [0.86, 1.11], [0.79, 1.104], [0.72, 1.1]].map(([z, yy]) => [z - 0.705, yy - 1.096])), 0.038, W, 0, 0.005);
    else profile(brk, shp([[0.72, 1.12], [0.939, 1.121], [0.934, 1.112], [0.92, 1.104], [0.85, 1.096], [0.78, 1.088], [0.72, 1.09]].map(([z, yy]) => [z - 0.705, yy - 1.096])), 0.046, W, 0, 0.006);
    // the brass heads of the shells in the chambers, shown while loaded
    const rims = [-1, 1].map(sd => cyl(brk, 0.0125, 0.003, GM.brass, ...bx(sd * 0.0155, 1.14, z0 - 0.0015), 16));
    return { front: z1, y: 1.14, top: 1.155, sz: 0.66, brk, rims };
  },
  // automatic shotgun: an AA-12, traced off a level side-on photo. One long slab is receiver and stock together (square
  // at the front round the barrel's shoulder with a cross pin through it, the textured panel and the latch on its left,
  // the ejection port on the right, the sling pin at the butt); the tall folding front sight, the A-frame rear sight
  // and the little fin of the charging handle on top (it's open bolt: the reload pulls the fin back); under it the
  // polymer grip with its thumb-hole curve and textured insert, the selector plate, the steel guard (a bar under the
  // trigger, a rod down the back of the mag well and a long bar back to the foot of the grip), the trigger, and the
  // drum in the mag well
  auto12(g, m) {
    const K = GM.metal, St = GM.steel, mg = g.userData.magG || g;
    // ---- the slab and the housing under it (trigger housing and mag well)
    const SL = [[1.1963, 1.1742], [1.1956, 1.1894], [1.1904, 1.1972], [0.13, 1.1985], [0.1122, 1.1932], [0.1062, 1.1908], [0.1021, 1.1871], [0.0994, 1.1811], [0.0972, 1.1679], [0.1021, 1.0197], [0.1043, 1.0126], [0.1084, 1.0081], [0.1138, 1.0062], [0.1239, 1.0058], [0.2587, 1.0365], [0.3542, 1.0578], [0.4078, 1.0687], [0.4333, 1.079], [0.4355, 1.0829], [0.6177, 1.091], [0.9693, 1.091], [1.0047, 1.0937], [1.0475, 1.0978], [1.1534, 1.1027], [1.1696, 1.1028], [1.1937, 1.1043], [1.1963, 1.1116]];
    solid(g, SL, 0.068, K, X, 0.012);
    solid(g, [[0.586, 1.097], [0.8101, 1.097], [0.8101, 1.0797], [0.7775, 1.0771], [0.6744, 1.0494], [0.6594, 1.0488], [0.586, 1.0461]], 0.05, K, X, 0.004);
    const panel = rrect(0.858, 1.118, 1.126, 1.166, 0.008).getPoints(4).map(p => [p.x, p.y]);
    stipple(g, panel, 0.034, 0.0034, GM.poly, GM.rubber);                                                                // the textured panels
    cyl(g, 0.005, 0.071, St, X, 1.151, 1.186, 12).rotation.set(0, 0, Math.PI / 2);                                          // the cross pin
    cyl(g, 0.0045, 0.071, St, X, 1.1235, 0.13, 12).rotation.set(0, 0, Math.PI / 2);                                         // the sling pin
    box(g, 0.004, 0.009, 0.04, St, X + 0.0345, 1.1425, 0.822); cyl(g, 0.004, 0.004, St, X + 0.0365, 1.1425, 0.84, 10).rotation.set(0, 0, Math.PI / 2);   // the latch
    // ---- barrel, its bore; the folding front sight, the tall rear sight
    cyl(g, 0.0163, 0.112, St, X, 1.13, 1.247, 18); cyl(g, 0.0095, 0.002, GM.rubber, X, 1.13, 1.3035, 12);
    profile(g, shp([[1.108, 1.192], [1.1995, 1.192], [1.1995, 1.275], [1.194, 1.29], [1.188, 1.29], [1.181, 1.277], [1.1747, 1.2537], [1.1685, 1.2305], [1.154, 1.2273], [1.1332, 1.2186], [1.1114, 1.2121]], [shp([[1.1785, 1.258], [1.191, 1.258], [1.191, 1.279], [1.1855, 1.279]])]), 0.012, St, X, 0.0012);
    profile(g, shp([[0.4688, 1.192], [0.534, 1.192], [0.5339, 1.2393], [0.5331, 1.2939], [0.5302, 1.2989], [0.522, 1.3002], [0.5148, 1.3032], [0.5081, 1.2945], [0.4975, 1.2648], [0.4861, 1.2258], [0.4802, 1.206], [0.4688, 1.2051]], [shp([[0.5145, 1.276], [0.527, 1.276], [0.527, 1.29], [0.5145, 1.29]]), shp([[0.497, 1.215], [0.522, 1.215], [0.522, 1.255], [0.505, 1.255]])]), 0.02, St, X, 0.0012);
    // ---- the charging handle's fin on top: its own group so the reload can pull it back
    const ch = new THREE.Group(); g.add(ch);
    profile(ch, shp([[0.8152, 1.192], [0.8793, 1.192], [0.8793, 1.2026], [0.8709, 1.2034], [0.8628, 1.2072], [0.8584, 1.2114], [0.8565, 1.2156], [0.8553, 1.2222], [0.8591, 1.2344], [0.8574, 1.2379], [0.8555, 1.2382], [0.8452, 1.232], [0.8364, 1.2234], [0.8304, 1.2091], [0.8265, 1.2074], [0.8184, 1.2073], [0.8152, 1.2046]]), 0.008, St, X, 0.0012);
    // ---- the ejection port on the right with the bolt in it, running back on each shot and held open when empty
    profile(g, shp([[0.66, 1.127], [0.77, 1.127], [0.77, 1.165], [0.66, 1.165]]), 0.002, GM.rubber, X - 0.0345, 0.0004);
    const bc = box(g, 0.003, 0.03, 0.06, St, X - 0.0352, 1.146, 0.74); bc.userData.clip = 0.66;
    // ---- the grip (its textured insert), the selector, the steel guard, the trigger
    const GR = [[0.4313, 1.0828], [0.4551, 1.0844], [0.4621, 1.0841], [0.4785, 1.0799], [0.4866, 1.0747], [0.493, 1.068], [0.5021, 1.0531], [0.5053, 1.0427], [0.5059, 1.0321], [0.5021, 1.0189], [0.4959, 1.0063], [0.4848, 0.994], [0.4769, 0.9829], [0.4667, 0.9642], [0.4579, 0.9391], [0.4546, 0.915], [0.4559, 0.9092], [0.4605, 0.9031], [0.4693, 0.8985], [0.4791, 0.8883], [0.4883, 0.8862], [0.5084, 0.8874], [0.5221, 0.8845], [0.5266, 0.8858], [0.5314, 0.8904], [0.5238, 0.8998], [0.5224, 0.9084], [0.5283, 0.9327], [0.5383, 0.959], [0.5475, 0.9773], [0.5584, 0.9939], [0.5668, 1.0013], [0.5746, 1.0024], [0.5763, 1.0099], [0.5702, 1.0174], [0.5681, 1.0269], [0.5699, 1.0339], [0.5737, 1.0397], [0.5789, 1.0437], [0.588, 1.0461], [0.588, 1.095], [0.43, 1.095]];
    solid(g, GR, 0.044, K, X, 0.009);
    stipple(g, clipTo(inset(GR, 0.013), [[0.44, 0.905], [0.56, 0.905], [0.56, 1.008], [0.44, 1.008]]), 0.022, 0.003, GM.poly, GM.rubber);
    box(g, 0.002, 0.02, 0.04, St, X + 0.0225, 1.07, 0.557); { const lv = box(g, 0.003, 0.004, 0.022, St, X + 0.025, 1.068, 0.553); lv.rotation.x = -0.9; }   // the selector
    profile(g, shp([[0.4971, 0.886], [0.5242, 0.8791], [0.5391, 0.873], [0.5494, 0.8685], [0.5731, 0.8582], [0.5896, 0.854], [0.6647, 0.8467], [0.6715, 0.8474], [0.6754, 0.8497], [0.6779, 0.8547], [0.6715, 0.8545], [0.59, 0.861], [0.5735, 0.8652], [0.5498, 0.8755], [0.5395, 0.88], [0.5246, 0.8861], [0.4975, 0.893]]), 0.012, St, X, 0.0012);   // the long bar
    profile(g, shp([[0.6655, 0.8475], [0.6779, 0.8475], [0.6921, 0.8637], [0.6872, 0.9018], [0.6768, 1.0155], [0.6742, 1.0502], [0.6667, 1.0502], [0.6693, 1.0155], [0.6797, 0.9018], [0.684, 0.866], [0.6735, 0.8545]]), 0.01, St, X, 0.0012);   // the rod
    profile(g, shp([[0.574, 1.0045], [0.6697, 1.0075], [0.6697, 1.0145], [0.574, 1.0115]]), 0.01, St, X, 0.001);   // the bar under the trigger
    if (m.well) { const L = 0.12 + 0.012 * (m.well - 1); box(g, 0.064, 0.02, L, GM.metal2, X, 1.052, 0.737); box(g, 0.07, 0.005, L + 0.01, St, X, 1.041, 0.737); }   // the flared mag well: a funnel lip round the top of the mag, standing out below the housing
    profile(g, shp([[0.598, 1.047], [0.607, 1.047], [0.612, 1.035], [0.609, 1.022], [0.602, 1.016], [0.604, 1.03], [0.6, 1.04]]), 0.007, St, X, 0.0008);   // the trigger
    // ---- the magazine (in the mag group, so the reload can drop it): its own 8-shell box, raked a little forward with
    // ribs down its sides and a base plate; or, with its one magazine upgrade, the drum: face forward, a hub in the
    // middle, the chrome band round its back edge (a stripe on either in the colour of the shells loaded, if they aren't buckshot)
    const dy = 0.956, dz = 0.735, dr = 0.114;
    if (T('mag')) {
      cyl(mg, dr, 0.078, K, X, dy, dz, 40); cyl(mg, dr + 0.0015, 0.008, St, X, dy, dz - 0.035, 40);
      cyl(mg, 0.02, 0.004, GM.rubber, X, dy, dz + 0.0405, 20); cyl(mg, 0.006, 0.004, GM.metal2, X, dy - dr + 0.016, dz + 0.0405, 10);
      if (SHELL_MAT[roundOn(tierCtx)]) cyl(mg, dr + 0.002, 0.012, SHELL_MAT[roundOn(tierCtx)], X, dy, dz + 0.016, 40);
    } else {
      const bm = new THREE.Group(); bm.position.set(X, 1.075, dz); bm.rotation.x = -0.08; mg.add(bm);
      box(bm, 0.05, 0.215, 0.095, K, 0, -0.1075, 0); box(bm, 0.056, 0.016, 0.103, GM.poly, 0, -0.218, 0.002);
      [-1, 1].forEach(sd => { box(bm, 0.003, 0.16, 0.012, GM.metal2, sd * 0.026, -0.105, 0.022); box(bm, 0.003, 0.16, 0.012, GM.metal2, sd * 0.026, -0.105, -0.022); });
      if (SHELL_MAT[roundOn(tierCtx)]) box(bm, 0.052, 0.014, 0.097, SHELL_MAT[roundOn(tierCtx)], 0, -0.17, 0);
    }
    return { front: 1.3025, y: 1.13, slide: bc, bolts: [], travel: 0.115, lock: true, mz: dz, magY: 1.05, top: 1.1985, sz: 0.62, charge: ch, chargeAt: [X, 1.215, 0.85], chargeTravel: 0.1 };
  },

  // hunting rifle: a Winchester Model 70, traced off a side-on photo. A one-piece walnut stock (a straight comb, a
  // pistol grip and a long slim forend, checkered at the grip and forend, swivels under the butt and forend, a black
  // pad); a round receiver with the ejection port on the shooter's right, the bolt showing in it; a slim barrel tapering
  // to a hooded front sight on its ramp, a notch rear sight on the receiver ring; the guard loop and its floorplate.
  // The bolt handle sweeps out and down to its knob, the way a Model 70's does
  hunting(g, m) {
    const W = GM.walnut, B = GM.blued, sight = T('sight');
    // ---- stock (traced off the photo: the straight comb, the wrist rising into the tang, the pistol grip, the long
    // forend), slimmer through the wrist and toward the tip; the black pad; checkering on the grip and the forend, cut
    // to the stock's own outline; the swivels
    const sg = new THREE.Group(); g.add(sg);
    const SO = [[0.1765, 1.1093], [0.1935, 1.1088], [0.2259, 1.1176], [0.4095, 1.1161], [0.419, 1.1131], [0.4325, 1.1025], [0.4404, 1.1], [0.452, 1.1], [0.536, 1.1262], [0.57, 1.128], [0.6, 1.129], [0.728, 1.129], [0.745, 1.134], [1.03, 1.132], [1.056, 1.13], [1.0724, 1.1213], [1.0705, 1.1093], [1.0617, 1.1027], [0.9993, 1.0975], [0.8713, 1.0926], [0.8178, 1.0897], [0.7598, 1.0838], [0.7431, 1.0814], [0.7362, 1.078], [0.6048, 1.0691], [0.5974, 1.0663], [0.5527, 1.0662], [0.528, 1.0688], [0.5124, 1.0694], [0.4932, 1.0633], [0.4766, 1.0534], [0.468, 1.0437], [0.4487, 1.0116], [0.415, 1.0167], [0.4007, 1.0237], [0.395, 1.0334], [0.3833, 1.0336], [0.2543, 0.9945], [0.2297, 0.9868], [0.171, 0.9683]];
    solid(sg, SO, 0.05, W, X, 0.01);
    solid(sg, [[0.1396, 1.0607], [0.1404, 1.1003], [0.1434, 1.1076], [0.147, 1.1099], [0.1775, 1.1093], [0.172, 0.9683], [0.1491, 0.9614], [0.1441, 0.9631], [0.1426, 0.969]], 0.052, GM.rubber, X, 0.006);
    checker(sg, clipTo(inset(SO, 0.0115), [[0.438, 1.03], [0.452, 1.018], [0.47, 1.045], [0.5, 1.07], [0.533, 1.105], [0.533, 1.13], [0.5, 1.115], [0.462, 1.1], [0.44, 1.07]]), 0.025, 0.0034, 0.52);
    checker(sg, clipTo(inset(SO, 0.0115), [[0.78, 1.0], [0.985, 1.0], [0.985, 1.118], [0.79, 1.112]]), 0.025, 0.0034, 0.52);
    taperX(sg, pw([[0.3, 1], [0.44, 0.8], [0.55, 0.8], [0.65, 0.88], [0.95, 0.88], [1.07, 0.76]]));
    [[0.25, 0.996], [1.0, 1.1]].forEach(([z, yy]) => { box(g, 0.008, 0.008, 0.012, GM.metal2, X, yy + 0.003, z); const t = new THREE.Mesh(new THREE.TorusGeometry(0.0075, 0.002, 6, 10), GM.metal2); t.rotation.y = Math.PI / 2; t.position.set(X, yy - 0.007, z); g.add(t); });
    // ---- receiver: round, its ring in front, the port on the right (cut through, filled behind on the left), the
    // tang behind; recoil lug and floorplate underneath
    profile(g, shp([[0.575, 1.124], [0.575, 1.14], [0.6, 1.143], [0.762, 1.14], [0.768, 1.148], [0.86, 1.148], [0.866, 1.152], [0.892, 1.152], [0.9, 1.146], [0.928, 1.145], [0.928, 1.124], [0.827, 1.124], [0.8, 1.128], [0.77, 1.124]], [rrect(0.648, 1.13, 0.752, 1.149, 0.004)]), 0.027, B, X, 0.0025);
    portFill(g, 0.648, 1.13, 0.752, 1.149, 0.027, 0.0025, B);
    box(g, 0.02, 0.008, 0.08, B, X, 1.122, 0.6);
    // ---- the guard: an oval loop traced off the photo, its top up in the stock (the floorplate ahead of it lies flush
    // in the stock's belly), the trigger near its back
    profile(g, shp(inset([[0.531, 1.07], [0.5308, 1.0613], [0.5335, 1.044], [0.5357, 1.0415], [0.5389, 1.0385], [0.5443, 1.0357], [0.5477, 1.0335], [0.5703, 1.0335], [0.5803, 1.0361], [0.586, 1.0399], [0.59, 1.0459], [0.5911, 1.0507], [0.5918, 1.06], [0.5925, 1.07]], 0.0012),
      [shp(inset([[0.5373, 1.0665], [0.5378, 1.0473], [0.542, 1.0419], [0.5478, 1.0399], [0.5535, 1.0394], [0.5611, 1.0392], [0.579, 1.0419], [0.5857, 1.048], [0.5854, 1.0624], [0.585, 1.0665]], -0.0012))]), 0.011, B, X, 0.0012);
    profile(g, shp([[0.5442, 1.068], [0.5502, 1.068], [0.5499, 1.0601], [0.5495, 1.0506], [0.5518, 1.048], [0.5527, 1.0447], [0.5522, 1.0433], [0.5486, 1.0428], [0.5476, 1.0456], [0.5451, 1.0479], [0.5442, 1.063]]), 0.006, GM.metal2, X, 0.0008);
    // ---- barrel, tapering to the muzzle, and its sights
    taper(g, 0.0118, 0.0078, 0.552, B, X, 1.14, 1.204);
    profile(g, shp([[1.39, 1.144], [1.415, 1.149], [1.468, 1.151], [1.468, 1.144]]), 0.012, B, X, 0.001);
    if (sight < 3) {   // iron sights till a scope goes on
      profile(g, shp([[1.42, 1.15], [1.452, 1.15], [1.452, 1.153], [1.42, 1.153]]), 0.024, B, X, 0);
      { const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.036, 16, 1, true, -Math.PI / 2, Math.PI), B); hood.rotation.x = Math.PI / 2; hood.position.set(X, 1.155, 1.44); g.add(hood); hood.material.side = THREE.DoubleSide; }
      box(g, 0.003, 0.012, 0.004, GM.steel, X, 1.157, 1.436);
      [-0.0065, 0.0065].forEach(o => box(g, 0.005, 0.012, 0.008, B, X + o, 1.158, 0.9)); box(g, 0.02, 0.006, 0.02, B, X, 1.152, 0.9);
    }
    // ---- the bolt: a polished body in the receiver, the shroud and its safety out the back, the handle out to the
    // right and down to its knob (at BOLT_KNOB). It turns about the bore and runs back and forward (player/hold.js)
    const bh = new THREE.Group(); bh.position.set(X, 1.14, 0.6); g.add(bh);
    cyl(bh, 0.0115, 0.17, GM.steel, 0, 0, 0.075, 16);
    lathe(bh, [[0.001, -0.052], [0.0105, -0.05], [0.014, -0.04], [0.0145, -0.012], [0.012, 0.0]], B, 0, 0, 18);
    box(bh, 0.005, 0.01, 0.016, GM.steel, 0, 0.015, -0.032);
    { const arm = box(bh, 0.009, 0.06, 0.012, m.bolt ? GM.steel : GM.metal2, -0.03, -0.025, -0.004); arm.rotation.z = -0.87; }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 10, 8), m.bolt ? GM.steel : GM.metal2); knob.scale.set(1, 0.95, 1.25); knob.position.set(BOLT_KNOB[0], BOLT_KNOB[1], BOLT_KNOB[2]); knob.castShadow = true; bh.add(knob);
    // ---- scopes off the bench: the plain one, or the big high-power one, in rings on two bases; the ACOG on a one-piece
    // picatinny base along the receiver, stepped down over its lower rear bridge (weapons/attachments.js puts it on)
    const big = sight >= 5, scope = sight === 3 || big;
    let top = 1.152;
    if (sight === 4) {
      const z0 = 0.63, z1 = 0.915, b0 = 1.156, RT = b0 + 0.0105;
      profile(g, shp([[z0, 1.1405], [0.762, 1.1405], [0.768, 1.1478], [z1, 1.1478], [z1, b0 + 0.001], [z0, b0 + 0.001]]), 0.022, B, X, 0.0008);
      xsec(g, shp([[X - 0.0125, b0], [X + 0.0125, b0], [X + 0.0168, b0 + 0.003], [X + 0.0168, b0 + 0.005], [X + 0.0148, RT], [X - 0.0148, RT], [X - 0.0168, b0 + 0.005], [X - 0.0168, b0 + 0.003]]), z0, z1, GM.rail, 0.0006);
      for (let z = z0 + 0.012; z < z1 - 0.008; z += 0.0172) box(g, 0.0338, 0.0034, 0.0065, GM.rubber, X, RT - 0.0015, z);   // its cross slots
      top = RT;
    }
    if (scope) {
      const sr = big ? 0.0215 : 0.019, sy = big ? 1.212 : 1.198, ob = big ? 0.036 : 0.03, oc = big ? 0.026 : 0.024, z0 = big ? 0.6 : 0.63, z1 = big ? 0.97 : 0.93;
      cyl(g, sr, z1 - z0 - 0.12, GM.metal, X, sy, (z0 + z1) / 2, 20);
      lathe(g, [[sr, z1 - 0.062], [sr * 1.15, z1 - 0.045], [ob, z1 - 0.012], [ob, z1], [ob * 0.86, z1 + 0.002]], GM.metal, X, sy, 24);   // objective bell
      lathe(g, [[oc * 0.8, z0 - 0.004], [oc, z0], [oc, z0 + 0.03], [sr * 1.1, z0 + 0.058], [sr, z0 + 0.062]], GM.metal, X, sy, 24);   // eyepiece
      cyl(g, ob * 0.86, 0.003, GM.glass, X, sy, z1 + 0.002, 20); cyl(g, oc * 0.82, 0.003, GM.glass, X, sy, z0 - 0.0035, 20);
      { const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 12), GM.metal2); tt.position.set(X, sy + sr + 0.007, (z0 + z1) / 2); g.add(tt);
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 12), GM.metal2); st.rotation.z = Math.PI / 2; st.position.set(X + sr + 0.007, sy, (z0 + z1) / 2); g.add(st); }
      [0.69, 0.885].forEach(z => { box(g, 0.02, sy - 1.152, 0.018, B, X, (sy + 1.152) / 2, z); ring(g, sr + 0.004, 0.018, B, X, sy, z); });
    }
    return { front: 1.48, y: 1.14, noSight: scope, top, sz: 0.76, slide: bh, travel: 0.13, cyc: true };
  },
  // machine pistol: a B&T MP9, its outline traced off a side-on photo. A slim receiver with grooves down its front
  // half, a rail along the top with a little front sight on its end and the rear sight leaning back behind it; the
  // T-handle's wings at the very back (pulled on a reload, like the rifle's), the hinge block under them where the stock
  // folds; a threaded muzzle; the ejection port on the right. Under it the vertical foregrip raked forward with the
  // finger hook in front of it, the slanted trigger guard, the grip with its ridges front and back and the safety button,
  // the magazine in the grip with its count windows; the stock out: a flat bar to a tall butt that leans back at the toe
  smg(g, m) {
    const P = GM.poly, K = GM.metal, mg = g.userData.magG || g, mt = T('mag');
    // ---- receiver (the rear hinge block under the handle), rail and slots, the sights, the threaded muzzle
    profile(g, shp(inset([[0.8684, 1.159], [0.8776, 1.1484], [0.8847, 1.1378], [0.8895, 1.131], [0.8985, 1.128], [0.8985, 1.097], [0.906, 1.0945], [0.906, 1.0915], [0.8985, 1.089], [0.8985, 1.062], [0.53, 1.0595], [0.5271, 1.0636], [0.4762, 1.0681], [0.4662, 1.0725], [0.4631, 1.0815], [0.4607, 1.0846], [0.4471, 1.0857], [0.4471, 1.1107], [0.4495, 1.1205], [0.4538, 1.1216], [0.4812, 1.1217], [0.4851, 1.1234], [0.4855, 1.1375], [0.4877, 1.164], [0.5613, 1.164], [0.566, 1.159]], 0.003)), 0.04, P, X, 0.003);
    xsec(g, shp([[X - 0.011, 1.158], [X + 0.011, 1.158], [X + 0.0125, 1.1615], [X + 0.011, 1.1656], [X - 0.011, 1.1656], [X - 0.0125, 1.1615]]), 0.578, 0.842, K, 0.0006);
    for (let k = 0; k < 16; k++) box(g, 0.026, 0.0034, 0.0072, GM.rubber, X, 1.1648, 0.5875 + k * 0.0157);
    profile(g, shp([[0.838, 1.164], [0.862, 1.159], [0.849, 1.1685], [0.842, 1.1685]]), 0.012, K, X, 0.0008);                                   // front sight
    profile(g, shp([[0.5368, 1.163], [0.5613, 1.163], [0.5418, 1.1806], [0.5392, 1.1806], [0.5368, 1.1707]]), 0.022, K, X, 0.001);              // rear sight
    box(g, 0.008, 0.008, 0.004, GM.rubber, X, 1.174, 0.5395);
    for (let k = 0; k < 5; k++) [-1, 1].forEach(sd => { const y = 1.149 - k * 0.0075, z1 = zAt([[0.8684, 1.159], [0.8776, 1.1484], [0.8847, 1.1378], [0.8895, 1.131], [0.8985, 1.128], [0.8985, 1.1]], y) - 0.008; box(g, 0.0014, 0.0022, z1 - 0.772, GM.rubber, X + sd * 0.0232, y, (z1 + 0.772) / 2); });   // the grooves down its front half
    box(g, 0.0016, 0.016, 0.045, GM.rubber, X + 0.0232, 1.105, 0.68);   // the plate on its left
    cyl(g, 0.0183, 0.041, K, X, 1.113, 0.9185, 18); for (let k = 0; k < 5; k++) ring(g, 0.0186, 0.0025, GM.rubber, X, 1.113, 0.906 + k * 0.006); cyl(g, 0.0062, 0.002, GM.rubber, X, 1.113, 0.9395, 12);
    let front = 0.94;
    if (m.ported) { const e = 0.04 + 0.01 * (m.ported - 1); cyl(g, 0.0172, e, K, X, 1.113, 0.939 + e / 2, 18); for (let k = 0; k < 3; k++) box(g, 0.012, 0.004, 0.008, GM.rubber, X, 1.1295, 0.947 + k * (e - 0.012) / 2.6); cyl(g, 0.006, 0.002, GM.rubber, X, 1.113, 0.94 + e, 12); front += e; }   // a ported extension, longer each level
    // ---- the T-handle's wings at the back (the reload pulls it, player/hold.js)
    const ch = new THREE.Group(); g.add(ch);
    profile(ch, shp(inset([[0.4895, 1.1462], [0.5165, 1.1462], [0.5165, 1.1686], [0.4895, 1.1686]], 0.002)), 0.054, K, X, 0.002);
    [-1, 1].forEach(sd => { for (let k = 0; k < 4; k++) box(ch, 0.001, 0.016, 0.002, GM.rubber, X + sd * 0.0285, 1.1574, 0.494 + k * 0.006); });
    // ---- the port on the right, and the bolt in it
    profile(g, shp([[0.6, 1.12], [0.68, 1.12], [0.68, 1.146], [0.6, 1.146]]), 0.002, GM.rubber, X - 0.0232, 0.0004);
    const bc = box(g, 0.003, 0.021, 0.05, GM.steel, X - 0.0243, 1.133, 0.655); bc.userData.clip = 0.6;   // it runs right back out of sight past the port's rear edge
    // ---- the foregrip (the finger hook in front of it) and its ridges
    const FF = [[0.8763, 0.9236], [0.8723, 0.9593], [0.8672, 0.9862], [0.8584, 1.0202], [0.8489, 1.0482]], FB = [[0.8217, 0.9142], [0.82, 0.9159], [0.8127, 0.9482], [0.8064, 0.9936], [0.8048, 1.0359]];
    profile(g, shp(inset([[0.8292, 0.9133], [0.8678, 0.9189], [0.8736, 0.9207], ...FF, [0.8478, 1.0566], [0.8495, 1.0615], [0.8562, 1.0679], [0.8794, 1.071], [0.8966, 1.0735], [0.8966, 1.0815], [0.8946, 1.085], [0.7684, 1.0854], [0.7649, 1.0834], [0.765, 1.0483], [0.7714, 1.0527], [0.7753, 1.0527], [0.7891, 1.0477], [0.7976, 1.0397], [0.8036, 1.0379], ...FB.slice().reverse()], 0.003)), 0.03, P, X, 0.003);
    profile(g, shp([[0.8794, 1.0725], [0.8873, 1.0667], [0.8925, 1.056], [0.8952, 1.0472], [0.8985, 1.0478], [0.8988, 1.06], [0.8975, 1.0765], [0.888, 1.0775]]), 0.022, P, X, 0.001);   // the finger hook
    for (let k = 0; k < 9; k++) { const y = 0.978 + k * 0.0052, z0 = zAt(FB, y) + 0.005, z1 = zAt(FF, y) - 0.005; [-1, 1].forEach(sd => box(g, 0.0012, 0.0018, z1 - z0, GM.rubber, X + sd * 0.0181, y, (z0 + z1) / 2)); }
    // ---- trigger guard, trigger, the grip and its ridges, the safety
    profile(g, shp([[0.6943, 1.024], [0.7343, 1.0238], [0.7422, 1.0258], [0.748, 1.0298], [0.77, 1.0518], [0.7751, 1.0538], [0.7752, 1.0658], [0.7717, 1.0678], [0.6873, 1.0674], [0.6853, 1.0639], [0.6854, 1.0299], [0.6874, 1.0263]],
      [shp([[0.742, 1.0595], [0.748, 1.055], [0.7541, 1.0463], [0.7431, 1.0353], [0.7376, 1.0325], [0.6925, 1.0325], [0.6897, 1.035], [0.6897, 1.0595]])]), 0.02, P, X, 0.0015);
    profile(g, shp([[0.708, 1.061], [0.722, 1.061], [0.7245, 1.05], [0.7258, 1.04], [0.7235, 1.0338], [0.7195, 1.0335], [0.7178, 1.038], [0.7135, 1.0445], [0.708, 1.05]]), 0.007, K, X, 0.0008);
    const GF = [[0.6644, 0.9198], [0.665, 0.9764], [0.6775, 1.0201], [0.6816, 1.0248]], GBk = [[0.5806, 0.9174], [0.5809, 0.9725], [0.5954, 1.0274], [0.596, 1.0461]];
    profile(g, shp(inset([[0.5923, 0.9148], [0.66, 0.911], ...GF, [0.6886, 1.0267], [0.6897, 1.0288], [0.6897, 1.065], [0.6885, 1.07], [0.5539, 1.07], [0.5508, 1.0676], [0.5503, 1.063], [0.5522, 1.0605], [0.5762, 1.056], [0.5946, 1.0489], ...GBk.slice().reverse()], 0.003)), 0.036, P, X, 0.003);
    for (let k = 0; k < 11; k++) { const y = 0.928 + k * 0.0068; [-1, 1].forEach(sd => { const f = zAt(GF, y); box(g, 0.0012, 0.0018, 0.014, GM.rubber, X + sd * 0.0211, y, f - 0.011); if (y < 1.012) { const b = zAt(GBk, y); box(g, 0.0012, 0.0018, 0.016, GM.rubber, X + sd * 0.0211, y, b + 0.012); } }); }
    cyl(g, 0.0058, 0.044, K, X, 1.041, 0.6727, 14).rotation.set(0, 0, Math.PI / 2);   // the safety button through the grip
    // ---- the stock, out: the flat bar, the butt leaning back at its toe, the pin through it. One of a pair has it
    // folded, swung round its hinge flat along the right of the receiver with the butt beside the guard (so a gun
    // tucked against the chest for a two-handed reload doesn't jab its stock up into the chin)
    let sk = g;
    if (m.akimbo2) { const H = [X - 0.017, 0, 0.447], f = new THREE.Group(); f.position.set(H[0], 0, H[2]); f.rotation.y = Math.PI; g.add(f); sk = new THREE.Group(); sk.position.set(-H[0], 0, -H[2]); f.add(sk); }
    profile(sk, shp([[0.452, 1.1095], [0.262, 1.1095], [0.262, 1.0822], [0.357, 1.0835], [0.4327, 1.0873], [0.452, 1.0873]]), 0.012, K, X, 0.001);
    profile(sk, shp([[0.4327, 1.0873], [0.4471, 1.0873], [0.4471, 1.1107], [0.4327, 1.1107]]), 0.026, K, X, 0.0015);   // its knuckle on the hinge
    box(sk, 0.0135, 0.0025, 0.16, GM.rubber, X, 1.0985, 0.355);   // the groove down the bar
    profile(sk, shp(inset([[0.185, 0.9272], [0.2017, 0.9283], [0.2068, 0.933], [0.2277, 1.0321], [0.2239, 1.0446], [0.224, 1.0523], [0.2299, 1.0606], [0.2381, 1.0645], [0.2485, 1.074], [0.2688, 1.0822], [0.2695, 1.1068], [0.2676, 1.1103], [0.1965, 1.1084], [0.1906, 1.1066], [0.188, 1.1037], [0.1864, 1.0696], [0.1837, 1.0617], [0.1811, 0.9729], [0.1782, 0.9363], [0.1794, 0.9309]], 0.003)), 0.024, P, X, 0.003);
    cyl(sk, 0.0042, 0.032, GM.steel, X, 0.997, 0.2015, 12).rotation.set(0, 0, Math.PI / 2);
    // ---- the magazine: its top up in the grip, a stick longer each tier with its count windows, or a drum at the top
    box(mg, 0.026, 0.15, 0.056, K, X, 0.995, 0.629);
    if (mt < 3) {
      const L = 0.133 + 0.05 * mt, yb = 0.912 - L;
      profile(mg, shp(inset([[0.5993, 0.925], [0.66, 0.925], [0.66, yb + 0.028], [0.6585, yb + 0.002], [0.654, yb], [0.6074, yb], [0.6014, yb + 0.002], [0.5991, yb + 0.006]], 0.002)), 0.026, P, X, 0.002);
      [-1, 1].forEach(sd => { for (let k = 0; k < 3 + mt; k++) box(mg, 0.001, 0.016, 0.007, GM.rubber, X + sd * 0.0149, 0.885 - k * 0.04, 0.646); });
    } else {
      profile(mg, shp(inset([[0.5993, 0.925], [0.66, 0.925], [0.66, 0.885], [0.5993, 0.885]], 0.002)), 0.026, P, X, 0.002);
      cyl(mg, 0.08, 0.056, P, X, 0.81, 0.629, 32).rotation.set(0, 0, Math.PI / 2); cyl(mg, 0.03, 0.06, K, X, 0.81, 0.629, 18).rotation.set(0, 0, Math.PI / 2);
    }
    return { front, y: 1.113, magZ: 0.629, magY: 0.89, slide: bc, bolts: [], travel: 0.085, lock: true, top: 1.1656, sz: 0.7, ownMags: true, charge: ch, chargeAt: [X, 1.163, 0.503], laser: { side: -1, x: X - 0.0215, y: 1.1, z: 0.83 } };   // the laser on the right-hand rail
  },
  // SMG: an H&K MP5A2, traced off a side-on photo (and the MP5SD's can off another). The fixed A2 stock with its rubber
  // butt plate and sling slots; the stamped receiver tube with a rib down each side, the drum rear sight on top and the
  // ejection port on the right; the cocking tube running forward over the barrel to the hooded front sight, its handle on
  // the left (pulled back and slapped down on a reload); the slim handguard with a flute down each side; the barrel's
  // nub; the polymer trigger housing with the grip and the guard in one; the curved magazine, longer with each
  // magazine upgrade. Its suppressor line (the SD's integral can) swaps the handguard and barrel for the SD's ribbed
  // handguard round the back of a fat can, its bare front longer each level
  sub(g, m) {
    const P = GM.poly, K = GM.metal, St = GM.steel, mg = g.userData.magG || g, sd = T('supp');   // its suppressor line is the SD's integral can
    // ---- the stock: the A2's moulded polymer, its edges rounded right over and slimmer through the wrist than at the butt
    // or where it takes the receiver (STK_W); the rubber butt pad ribbed down its face; the sling plate on the left (a
    // hexagon round a slot with a bar across it), two plugs on the right
    const stk = new THREE.Group(); g.add(stk);
    solid(stk, [[0.146, 1.1268], [0.1674, 1.1274], [0.3683, 1.1302], [0.3778, 1.1313], [0.3947, 1.1346], [0.4125, 1.1399], [0.429, 1.148], [0.453, 1.1626], [0.4637, 1.1683], [0.4654, 1.1698], [0.4836, 1.1801], [0.4903, 1.1818], [0.497, 1.1822], [0.505, 1.1818], [0.505, 1.0642], [0.4705, 1.0641], [0.4663, 1.0648], [0.4552, 1.0684], [0.4417, 1.0687], [0.4342, 1.068], [0.411, 1.0595], [0.3822, 1.0476], [0.3661, 1.0411], [0.3217, 1.0234], [0.2965, 1.0132], [0.2701, 1.0024], [0.2542, 0.9967], [0.2247, 0.9846], [0.2009, 0.9744], [0.1903, 0.9708], [0.1843, 0.9678], [0.1796, 0.9669], [0.1606, 0.9659], [0.15, 0.9662]], 0.044, P, X, 0.017);
    solid(stk, [[0.1393, 1.1188], [0.1401, 1.1217], [0.1425, 1.1239], [0.148, 1.1261], [0.159, 1.1273], [0.159, 0.966], [0.1557, 0.9661], [0.151, 0.9684], [0.1482, 0.9725], [0.1464, 0.9834], [0.1461, 1.0049], [0.1443, 1.0245], [0.1437, 1.0465], [0.1429, 1.0565], [0.1419, 1.0593], [0.1407, 1.0833], [0.1395, 1.0937]], 0.046, GM.rubber, X, 0.008);
    taperX(stk, STK_W);
    for (let k = -2; k <= 2; k++) { const r = box(g, 0.0024, 0.13, 0.002, GM.rubber, X + k * 0.0072, 1.044, 0.1418); r.rotation.x = -0.053; }   // the pad's ribs
    { const zs = 0.218, xs = X + 0.022 * STK_W(zs); const hx = new THREE.Mesh(new THREE.CylinderGeometry(0.0172, 0.0172, 0.003, 6), GM.metal2); hx.position.set(xs, 1.062, zs); hx.rotation.set(Math.PI / 6, 0, Math.PI / 2); hx.castShadow = true; g.add(hx);
      box(g, 0.0012, 0.019, 0.011, GM.rubber, xs + 0.0016, 1.062, zs); box(g, 0.004, 0.021, 0.0042, K, xs + 0.0025, 1.062, zs); }   // the sling plate, its slot and bar
    [0.222, 0.308].forEach(z => cyl(g, 0.0055, 0.002, GM.rubber, X - 0.022 * STK_W(z) - 0.0004, 1.079, z, 12).rotation.set(0, 0, Math.PI / 2));   // the plugs
    // ---- the upper, on the lines traced off the photo but built round, the way the steel really is: the receiver a tube
    // with flat sides and a round top, the channel pressed down each side with its lip standing out (mp5Section), the
    // mag well under its front, the drum rear sight on top (mp5Rear) with the notched claw-mount tabs ahead of it; the
    // port on the right with the bolt in it
    // (the channel stops short of the mag well, and on the right round the port; its ends are rounded off)
    [[0.47, 0.595, 1, 1], [0.595, 0.665, 1, 0], [0.665, 0.711, 1, 1], [0.711, MP5.rcvEnd, 0, 0]].forEach(([z0, z1, l, r]) => xsec(g, mp5Section(l, r), z0, z1, K, 0));
    [[1, 0.711], [-1, 0.711], [-1, 0.595], [-1, 0.665]].forEach(([s2, z]) => cyl(g, 0.0102, 0.0052, K, X + s2 * (MP5.rw - 0.0026), 1.1398, z, 16).rotation.set(0, 0, Math.PI / 2));
    [[1, 0.48, 0.705], [-1, 0.48, 0.59], [-1, 0.67, 0.705]].forEach(([s2, z0, z1]) => box(g, 0.0006, 0.0062, z1 - z0, GM.rubber, X + s2 * (MP5.rw - 0.0047), 1.1462, (z0 + z1) / 2));   // the shadow up under its top edge
    solid(g, [[0.717, 1.0565], [0.7865, 1.0565], [0.7858, 1.0735], [0.7847, 1.077], [0.785, 1.0804], [0.7874, 1.0851], [0.7946, 1.0886], [MP5.rcvEnd, 1.0886], [MP5.rcvEnd, 1.115], [0.717, 1.115]], 0.044, K, X, 0.004);   // the mag well
    mp5Rear(g);
    [0.667, 0.6913].forEach(z => { const t = MP5.top; solid(g, [[z - 0.0042, t - 0.002], [z - 0.0042, t + 0.001], [z - 0.0024, t + 0.0036], [z + 0.0024, t + 0.0036], [z + 0.0042, t + 0.001], [z + 0.0042, t - 0.002]], 0.016, K, X, 0.0005);
      box(g, 0.0168, 0.0016, 0.0014, GM.rubber, X, t + 0.0029, z); });                                              // the claw-mount tabs, notched for the claws
    profile(g, shp([[0.6, 1.128], [0.66, 1.128], [0.66, 1.156], [0.6, 1.156]]), 0.002, GM.rubber, X - 0.0222, 0.0004);   // the port, and its bolt
    const bc = box(g, 0.003, 0.022, 0.05, St, X - 0.0232, 1.142, 0.63); bc.userData.clip = 0.6;
    // ---- the cocking tube's handle on the left, at the front of its slot (it stays forward as the gun fires: the bolt in
    // the port is what cycles): an arm angled out, up and forward, and the knurled ball on its end; the slot runs back
    // from it to the notch it's slapped up into
    const sl = new THREE.Group(); g.add(sl); mp5Handle(sl, MP5.handle);
    box(g, 0.0016, 0.0046, MP5.handle - 0.828, GM.rubber, X + MP5.ct.r - 0.0003, MP5.ct.y, (MP5.handle + 0.828) / 2);   // the slot
    { const n = box(g, 0.0016, 0.0046, 0.014, GM.rubber, X + MP5.ct.r - 0.0003, MP5.ct.y + 0.004, 0.83); n.rotation.x = -0.75; }   // and its notch
    let front;
    if (!sd) {
      solid(g, [[0.7975, 1.15], [1.0385, 1.15], [1.0365, 1.0966], [0.9969, 1.0933], [0.9489, 1.0878], [0.937, 1.0872], [0.8976, 1.0833], [0.8774, 1.0814], [0.8585, 1.0793], [0.8048, 1.0732], [0.8018, 1.0736], [0.7992, 1.0751], [0.798, 1.0791], [0.7969, 1.0869]], 0.052, P, X, 0.016);   // the handguard
      [-1, 1].forEach(s2 => box(g, 0.002, 0.007, 0.17, GM.rubber, X + s2 * 0.0262, 1.118, 0.925));                     // its flutes
      cyl(g, MP5.ct.r, MP5.fs - MP5.rcvEnd + 0.004, K, X, MP5.ct.y, (MP5.rcvEnd + MP5.fs) / 2, 24);                    // the cocking tube
      mp5Front(g, 0, true); front = MP5.muzzle;
    } else {
      // ---- the SD: its cocking tube and front sight further back, the ribbed handguard round the back of the can,
      // then the can's bare front, longer each level
      const L = 0.14 + 0.05 * (sd - 1), z1 = 1.023, z2 = z1 + L;
      cyl(g, MP5.ct.r, MP5.fs + MP5.sdShift - MP5.rcvEnd + 0.004, K, X, MP5.ct.y, (MP5.rcvEnd + MP5.fs + MP5.sdShift) / 2, 24);
      mp5Front(g, MP5.sdShift, false);
      ribTube(g, 0.034, z1 - 0.797, P, X, 1.12, (0.797 + z1) / 2, 18, 0.004, 1);
      cyl(g, 0.0235, z2 - z1 + 0.01, K, X, 1.12, (z1 + z2) / 2, 22); ring(g, 0.025, 0.008, K, X, 1.12, z2 - 0.004); cyl(g, 0.006, 0.002, GM.rubber, X, 1.12, z2 + 0.0005, 10);
      front = z2;
    }
    // ---- the trigger housing: the block, bevelled, the selector's markings side (its bottom runs along the top of the
    // guard's opening, then up into the grip); the guard a narrower loop under it, its front post coming down from the
    // block and its bar running back into the grip; the grip on its own, rounded right over (nearly oval across), its
    // heel flared; the mag release paddle hanging behind the magazine; the trigger hanging in the opening; the push
    // pins; the selector
    solid(g, [[0.4801, 1.0641], [0.4801, 1.1121], [0.7196, 1.1121], [0.7197, 1.0632], [0.7273, 1.0289], [0.6906, 1.0277], [0.6249, 1.0297], [0.5389, 1.0635], [0.5237, 1.0645]], 0.04, P, X, 0.004);
    solid(g, [[0.6816, 1.032], [0.7201, 1.032], [0.7201, 1.0281], [0.716, 1.0274], [0.7111, 1.0279], [0.7048, 1.0249], [0.7022, 1.0225], [0.6993, 1.0178], [0.6869, 0.985], [0.6808, 0.9788], [0.6724, 0.9747], [0.635, 0.9749], [0.6254, 0.9766], [0.6107, 0.9841], [0.6037, 0.9834], [0.596, 0.985], [0.597, 0.9935], [0.6102, 0.9935], [0.6205, 0.9892], [0.6296, 0.9852], [0.6658, 0.9833], [0.6705, 0.9838], [0.6758, 0.9864], [0.6814, 0.9929], [0.6914, 1.0212], [0.6916, 1.0243], [0.6906, 1.0269], [0.6878, 1.0282], [0.6816, 1.0289]], 0.022, P, X, 0.0025);   // the guard
    profile(g, shp(inset([[0.6249, 1.0297], [0.6222, 1.0287], [0.6161, 1.0178], [0.6098, 1.0038], [0.609, 0.9997], [0.6102, 0.9963], [0.6045, 0.9875], [0.5992, 0.9797], [0.595, 0.9739], [0.5849, 0.9511], [0.5665, 0.9134], [0.5661, 0.9097], [0.5673, 0.9043], [0.5669, 0.9016], [0.5646, 0.8986], [0.5616, 0.8978], [0.5562, 0.8986], [0.5308, 0.9121], [0.5035, 0.9291], [0.4966, 0.9343], [0.4954, 0.9361], [0.4948, 0.9386], [0.4967, 0.9432], [0.5051, 0.9552], [0.5125, 0.9675], [0.5191, 0.9764], [0.5264, 0.9885], [0.5393, 1.0073], [0.5407, 1.0103], [0.5506, 1.0243], [0.5546, 1.0339], [0.5549, 1.0403], [0.5525, 1.049], [0.5482, 1.0569], [0.5445, 1.0603], [0.5389, 1.0635], [0.535, 1.085], [0.628, 1.085]], 0.013)), 0.01, P, X, 0.013, 6);   // the grip (as solid, with more steps round its edges)
    solid(g, [[0.7273, 1.034], [0.7273, 1.0289], [0.7237, 1.0222], [0.7229, 1.0162], [0.72, 1.0132], [0.7186, 1.0099], [0.7155, 1.0084], [0.7144, 1.0111], [0.7201, 1.0246], [0.7201, 1.034]], 0.012, K, X, 0.0008);   // the mag release paddle
    profile(g, shp([[0.6296, 1.047], [0.6488, 1.047], [0.6488, 1.0287], [0.6458, 1.0245], [0.6427, 1.0185], [0.6418, 1.0132], [0.6424, 1.0049], [0.6498, 0.9902], [0.6492, 0.9877], [0.6465, 0.987], [0.6421, 0.9889], [0.64, 0.9907], [0.6376, 0.9937], [0.6344, 1.0], [0.6325, 1.0122], [0.6335, 1.0242], [0.6326, 1.0271], [0.6296, 1.0295]]), 0.008, P, X, 0.0008);
    [[0.513, 1.089], [0.709, 1.093]].forEach(([z, y]) => { cyl(g, 0.0042, 0.0432, GM.metal2, X, y, z, 14).rotation.set(0, 0, Math.PI / 2); cyl(g, 0.0016, 0.0434, GM.rubber, X, y, z, 10).rotation.set(0, 0, Math.PI / 2); });   // the push pins holding it on, standing out each side
    { const lv = box(g, 0.003, 0.006, 0.026, St, X + 0.0215, 1.085, 0.66); lv.rotation.x = 0.5; cyl(g, 0.006, 0.003, St, X + 0.021, 1.085, 0.655, 12).rotation.set(0, 0, Math.PI / 2); }
    // ---- the curved magazine (in the mag group so the reload drops it), longer with each magazine upgrade: its spines
    // rounded front and back, a raised panel pressed down each side, the floor plate on its foot with the pin through it
    const k = [1, 1.3, 1.6, 1.9][T('mag')], dd = [0.085, -0.218], ext = ([z, y]) => { const f = clamp((1.05 - y) / 0.21, 0, 1) * (k - 1); return [z + dd[0] * f, y + dd[1] * f]; };
    const MO = [[0.7225, 1.0578], [0.7879, 1.0573], [0.7887, 1.0528], [0.7859, 1.0474], [0.7907, 1.0248], [0.8017, 0.9825], [0.8103, 0.9563], [0.8253, 0.9181], [0.8405, 0.8865], [0.8583, 0.8542], [0.8573, 0.849], [0.8223, 0.8286], [0.8162, 0.8315], [0.8099, 0.842], [0.7895, 0.8815], [0.7756, 0.9123], [0.7582, 0.9606], [0.7477, 0.9966], [0.743, 1.0183], [0.738, 1.0315], [0.7271, 1.0286], [0.7225, 1.03]].map(ext);
    solid(mg, MO, 0.026, K, X, 0.005);
    solid(mg, inset(MO, 0.0105), 0.0278, K, X, 0.0007);                                                                          // the panel
    { const b1 = ext([0.8223, 0.8286]), b2 = ext([0.8573, 0.849]), l = Math.hypot(b2[0] - b1[0], b2[1] - b1[1]), u = [(b2[0] - b1[0]) / l, (b2[1] - b1[1]) / l];
      const at = (p, a, b) => [p[0] + u[0] * a - u[1] * b, p[1] + u[1] * a + u[0] * b];   // a along the foot, b up into the mag
      solid(mg, [at(b1, -0.005, -0.0015), at(b2, 0.005, -0.0015), at(b2, 0.005, 0.007), at(b1, -0.005, 0.007)], 0.0295, K, X, 0.0012);   // the floor plate
      const c = at(b1, l / 2, 0.0028); cyl(mg, 0.0019, 0.0298, GM.rubber, X, c[1], c[0], 10).rotation.set(0, 0, Math.PI / 2); }      // its pin
    return { front, y: 1.119, magZ: 0.772, magY: 1.07, slide: bc, bolts: [], travel: 0.065, lock: true, top: 1.1742, sz: 0.66, ownMags: true, laser: { y: sd ? 1.088 : 1.0867, z: 0.88 } };   // the laser clamped under the handguard
  },
  // assault rifle: a Colt M4 carbine, traced off a side-on photo (the open dust cover off another). The six-position
  // stock on its buffer tube; the lower with its magwell, the guard and trigger, its pins and the mag release; the A2
  // grip and its checkered panels; the flat-top upper with the forward assist, the port with the carrier in it and the
  // dust cover hanging open under it, the carry handle clamped on its rail; the delta ring, the ribbed two-piece
  // handguard, the A-frame front sight, the stepped carbine barrel and the A2 birdcage. Everything round is turned
  // round, and the slots, panels and pins are set into the surfaces they belong to
  ar(g, m) {
    const y0 = 1.13, RT = 1.18, HR = 0.05, mt = T('mag'), sight = T('sight'), mg = g.userData.magG || g;
    const A = GM.ano, L = GM.anoL, F = GM.furn, H = GM.hgPoly;
    // ---- the stock: its body round the buffer tube, two rows of slots down each side; under it the web with the lock
    // lever, its pin and the sling slot through it; the wide butt and the sling loop at its toe
    const SB = [[0.1265, 1.088], [0.1264, 1.1057], [0.1241, 1.1516], [0.1285, 1.1636], [0.1395, 1.1648], [0.1489, 1.1591], [0.3884, 1.1584], [0.3984, 1.1566], [0.3981, 1.091], [0.37, 1.088]];
    solid(g, SB, 0.062, F, X, 0.012);
    for (let k = 0; k < 5; k++) [1.1222, 1.111].forEach(yy => { const z0 = 0.147 + k * 0.0448; profile(g, shp(rrect(z0, yy - 0.0028, z0 + 0.041, yy + 0.0028, 0.0027).getPoints().map(p => [p.x, p.y])), 0.0626, GM.rubber, X); });   // the slots, flush with the faces
    solid(g, [[0.1275, 1.1], [0.37, 1.1], [0.3609, 1.0863], [0.3518, 1.0779], [0.3466, 1.0628], [0.3399, 1.0557], [0.3348, 1.0523], [0.2867, 1.0529], [0.2421, 1.0144], [0.2347, 1.0105], [0.2322, 1.0114], [0.231, 1.0171], [0.2321, 1.0361], [0.2341, 1.0414], [0.2327, 1.043], [0.1991, 1.0289], [0.1757, 0.9938], [0.1771, 0.9831], [0.168, 0.97], [0.1517, 0.9623], [0.1479, 0.964], [0.1447, 0.9713], [0.1337, 1.0353], [0.1272, 1.095]], 0.044, F, X, 0.003,
      [shp(inset([[0.1533, 1.0795], [0.2108, 1.0795], [0.2108, 1.0878], [0.1533, 1.0878]], -0.003))]);   // the web, the sling slot through it
    solid(g, [[0.1447, 0.9713], [0.1337, 1.0353], [0.1264, 1.1057], [0.1241, 1.1516], [0.1285, 1.1636], [0.1395, 1.1648], [0.1489, 1.1591], [0.152, 1.15], [0.148, 1.1057], [0.1545, 1.0353], [0.164, 0.98], [0.168, 0.97], [0.1517, 0.9623], [0.1479, 0.964]], 0.066, F, X, 0.008);   // the butt
    cyl(g, 0.024, 0.0445, GM.anoL, X, 1.055, 0.177, 24).rotation.set(0, 0, Math.PI / 2);                   // the round dimple in the web
    cyl(g, 0.0075, 0.012, GM.metal2, X, 1.047, 0.306, 14).rotation.x = 0;          // the lock lever's pin
    { const t = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.0024, 6, 14), GM.metal2); t.rotation.set(0.5, Math.PI / 2, 0); t.position.set(X, 0.967, 0.18); g.add(t); }   // the sling loop
    // the buffer tube, the castle nut and the lower's rear tower round it
    cyl(g, 0.0226, 0.06, L, X, y0, 0.414, 24); ribTube(g, 0.027, 0.012, L, X, y0, 0.436, 8, 0.0022);
    // ---- the lower (its own shade): the receiver, the wider magwell and its flared lip, the guard (narrower, its
    // opening traced) and the trigger in it; the pins, the selector, the mag release in its fence, the bolt catch
    profile(g, shp(inset([[0.4435, 1.0775], [0.4435, 1.157], [0.4565, 1.157], [0.4565, 1.1125], [0.597, 1.1125], [0.597, 1.104], [0.7575, 1.104], [0.7575, 1.0907], [0.7533, 1.0886], [0.7495, 1.0859], [0.739, 1.0815], [0.7341, 1.0727], [0.734, 1.045], [0.628, 1.045], [0.628, 1.052], [0.53, 1.052], [0.505, 1.0557], [0.4771, 1.0606], [0.4654, 1.0713]], 0.003)), 0.044, L, X, 0.003, 2);
    solid(g, [[0.6268, 1.078], [0.7345, 1.078], [0.7345, 1.034], [0.6268, 1.034]], 0.056, L, X, 0.004);
    solid(g, [[0.6262, 1.036], [0.7375, 1.036], [0.738, 1.0241], [0.7335, 1.0205], [0.6295, 1.0205], [0.6262, 1.026]], 0.06, L, X, 0.003);
    const GH = [[0.5614, 1.0097], [0.55, 1.0192], [0.547, 1.0252], [0.546, 1.0331], [0.5479, 1.0399], [0.5527, 1.0459], [0.5614, 1.0506], [0.6056, 1.052], [0.6195, 1.0449], [0.6242, 1.0372], [0.6255, 1.0273], [0.6231, 1.0196], [0.6158, 1.0108], [0.5793, 1.0094]];
    solid(g, [[0.508, 1.058], [0.6285, 1.058], [0.6285, 1.012], [0.627, 1.004], [0.6203, 1.0026], [0.6163, 1.0052], [0.5614, 1.0047], [0.5568, 1.0027], [0.5368, 1.0038], [0.5307, 1.0023], [0.5294, 1.0004], [0.522, 0.99], [0.515, 1.0]], 0.03, L, X, 0.002, [shp(inset(GH, -0.002))]);
    profile(g, shp([[0.5658, 1.056], [0.5658, 1.0498], [0.5635, 1.0392], [0.5642, 1.0303], [0.5685, 1.0197], [0.5755, 1.0118], [0.5793, 1.0104], [0.5771, 1.0139], [0.5722, 1.0232], [0.571, 1.0326], [0.5736, 1.0423], [0.5802, 1.0505], [0.5802, 1.056]]), 0.007, GM.steelDk, X, 0.0008);
    [[0.462, 1.1005, 0.0062], [0.751, 1.0955, 0.004], [0.548, 1.08, 0.0032], [0.578, 1.0765, 0.0032]].forEach(([z, yy, r]) => cyl(g, r, 0.0508, GM.metal2, X, yy, z, 12).rotation.set(0, 0, Math.PI / 2));   // takedown and pivot pins, hammer and trigger pins
    cyl(g, 0.0062, 0.0508, GM.metal2, X, 1.08, 0.502, 14).rotation.set(0, 0, Math.PI / 2);                   // the selector's barrel through the receiver
    { const lv = box(g, 0.004, 0.007, 0.026, GM.metal2, X + 0.0265, 1.08, 0.507); lv.rotation.x = -0.6; }    // its lever, on the left
    profile(g, shp([[0.598, 1.0585], [0.625, 1.0585], [0.625, 1.0865], [0.598, 1.0865]], [rrect(0.6025, 1.063, 0.6205, 1.082, 0.006)]), 0.005, L, X - 0.0255, 0.0008);   // the mag release's fence, on the right
    cyl(g, 0.0055, 0.006, GM.metal2, X - 0.026, 1.0725, 0.6115, 14).rotation.set(0, 0, Math.PI / 2);         // and its button
    box(g, 0.005, 0.024, 0.012, GM.metal2, X + 0.0265, 1.087, 0.619);                                        // bolt catch, on the left
    // ---- the A2 grip, traced, its checkered panels set in from its edges
    const GP = [[0.4034, 0.9175], [0.4146, 0.9123], [0.4801, 0.8976], [0.4851, 0.8995], [0.489, 0.9044], [0.4899, 0.9078], [0.4841, 0.9153], [0.4846, 0.921], [0.5065, 0.9601], [0.5124, 0.9657], [0.5218, 0.965], [0.5245, 0.9675], [0.5201, 0.9759], [0.5197, 0.981], [0.522, 0.99], [0.515, 1.04], [0.508, 1.064], [0.473, 1.064], [0.4808, 1.0531], [0.4812, 1.0438], [0.4775, 1.0329], [0.4018, 0.9236]];
    solid(g, GP, 0.042, F, X, 0.006);
    checker(g, pullInside([[0.4655, 1.006], [0.472, 1.0115], [0.482, 1.013], [0.493, 1.011], [0.4995, 1.005], [0.501, 0.995], [0.497, 0.965], [0.489, 0.94], [0.48, 0.92], [0.473, 0.915], [0.43, 0.92], [0.421, 0.925], [0.42, 0.932]], inset(GP, 0.0075)), 0.021, 0.0028, 0.62, GM.rubber, F);
    // ---- the upper: built in two halves meeting down the middle, the port cut through the right one only (a dark wall
    // behind it); the shoulders closing in to the rail and the rail with its cross slots; the forward assist and the
    // brass deflector on the right
    const UP = [[0.4555, 1.1105], [0.5975, 1.1105], [0.5975, 1.1025], [0.7525, 1.1025], [0.7525, 1.1645], [0.4555, 1.1645]];
    profile(g, shp(UP), 0.022, A, X + 0.013, 0.002);
    profile(g, shp(UP, [rrect(0.616, 1.125, 0.732, 1.156, 0.005)]), 0.022, A, X - 0.013, 0.002);
    box(g, 0.001, 0.027, 0.112, GM.rubber, X - 0.0006, 1.1405, 0.674);
    xsec(g, shp([[X - 0.026, 1.162], [X + 0.026, 1.162], [X + 0.0185, 1.1705], [X - 0.0185, 1.1705]]), 0.4565, 0.7515, A, 0.001);
    xsec(g, shp([[X - 0.0125, 1.1695], [X + 0.0125, 1.1695], [X + 0.0168, 1.1725], [X + 0.0168, 1.1745], [X + 0.0148, RT], [X - 0.0148, RT], [X - 0.0168, 1.1745], [X - 0.0168, 1.1725]]), 0.4585, 0.7515, GM.rail, 0.0006);
    for (let k = 0; k < 17; k++) box(g, 0.0338, 0.0034, 0.0065, GM.rubber, X, RT - 0.0015, 0.4655 + k * 0.0172);   // the rail's cross slots, flush with its top
    lathe(g, [[0.0001, 0.5605], [0.0128, 0.5605], [0.0135, 0.566], [0.0135, 0.588], [0.011, 0.5955], [0.006, 0.598], [0.0001, 0.598]], A, X - 0.0255, 1.1475, 18);   // the forward assist's housing
    cyl(g, 0.0105, 0.008, GM.metal2, X - 0.0255, 1.1475, 0.557, 16);                                          // and its button
    profile(g, shp([[0.5975, 1.128], [0.6135, 1.128], [0.6145, 1.15], [0.611, 1.1655], [0.5975, 1.1655]]), 0.007, A, X - 0.0255, 0.0015);   // the brass deflector
    // the bolt carrier in the port (it runs back on each shot); the steel dust cover swung down on its hinge rod under the
    // port, lying against the receiver, its rim standing up round it and its latch at its foot
    const bc = box(g, 0.0202, 0.0272, 0.104, GM.steel, X - 0.0109, 1.1405, 0.674);
    cyl(g, 0.002, 0.13, GM.metal2, X - 0.0255, 1.1225, 0.673, 8);
    const DC = [[0.609, 1.1215], [0.737, 1.1215], [0.737, 1.0835], [0.7335, 1.08], [0.6125, 1.08], [0.609, 1.0835]];
    profile(g, shp(DC), 0.003, GM.blued, X - 0.0265, 0.0006);
    profile(g, shp(DC, [shp(inset(DC, 0.004))]), 0.0016, GM.blued, X - 0.0292, 0.0004);                      // its rim
    box(g, 0.003, 0.009, 0.016, GM.metal2, X - 0.0294, 1.0865, 0.673);
    // the charging handle's T at the back of the upper (its own group: the reload draws it back, weapons/reload.js)
    const ch = new THREE.Group(); g.add(ch);
    profile(ch, shp([[0.4545, 1.1585], [0.4705, 1.1585], [0.4705, 1.177], [0.4585, 1.177], [0.4548, 1.172]]), 0.058, GM.metal2, X, 0.0015);
    box(ch, 0.006, 0.006, 0.012, GM.metal2, X + 0.031, 1.1715, 0.468);                                       // its latch
    // ---- without an optic: the carry handle clamped on the rail, the A2 rear sight in its back end (the aperture between
    // its ears, the windage knob, the elevation drum), the clamp's screws
    if (!sight) {
      profile(g, shp(inset([[0.4798, 1.1795], [0.4914, 1.2045], [0.5464, 1.2045], [0.5464, 1.2378], [0.5875, 1.2359], [0.7197, 1.224], [0.7272, 1.2221], [0.7443, 1.2194], [0.7494, 1.2148], [0.7518, 1.2099], [0.7521, 1.1795]], 0.0025),
        [shp(inset([[0.5756, 1.1873], [0.7156, 1.1869], [0.7233, 1.1944], [0.7356, 1.196], [0.7356, 1.2063], [0.7301, 1.2126], [0.7216, 1.2141], [0.5755, 1.2141], [0.5685, 1.2109], [0.5661, 1.2077], [0.565, 1.2027], [0.5655, 1.1953]], -0.0025))]), 0.025, A, X, 0.0025, 2);
      solid(g, [[0.479, 1.1765], [0.7525, 1.1765], [0.7525, 1.1885], [0.479, 1.1885]], 0.04, A, X, 0.002);    // its base round the rail
      [-1, 1].forEach(sd => profile(g, shp([[0.4983, 1.2045], [0.546, 1.2045], [0.5464, 1.2378], [0.5396, 1.2404], [0.5125, 1.2418], [0.5054, 1.2382], [0.4983, 1.2312]]), 0.005, A, X + sd * 0.0105, 0.001));   // the ears
      box(g, 0.015, 0.03, 0.006, A, X, 1.2195, 0.52); box(g, 0.004, 0.004, 0.0065, GM.rubber, X, 1.227, 0.52);   // the aperture plate and its hole
      cyl(g, 0.0108, 0.008, GM.metal2, X - 0.0165, 1.2255, 0.517, 18).rotation.set(0, 0, Math.PI / 2);        // windage knob
      ribTube(g, 0.0085, 0.033, GM.metal2, X, 1.1985, 0.5235, 12, 0.0012).rotation.set(0, Math.PI / 2, 0);    // the elevation drum
      [0.533, 0.735].forEach(z => { cyl(g, 0.0068, 0.042, GM.metal2, X, 1.1835, z, 14).rotation.set(0, 0, Math.PI / 2); cyl(g, 0.009, 0.007, GM.metal2, X + 0.0235, 1.1835, z, 14).rotation.set(0, 0, Math.PI / 2); });   // the clamp's screws and thumb nuts
    } else {
      // with an optic, a folded backup sight at the back of the rail
      box(g, 0.03, 0.007, 0.034, A, X, RT + 0.0035, 0.478); box(g, 0.024, 0.005, 0.028, GM.metal2, X, RT + 0.0095, 0.476).rotation.x = -0.08;
    }
    // ---- the barrel nut and the knurled delta ring against the upper; the handguard in two halves split down the
    // sides, its rear lip, the ribs round it tapering forward and its front rounded into the cap, the heat shield dark
    // inside; the barrel inside it all
    cyl(g, 0.03, 0.008, A, X, y0, 0.7555, 24);
    ribTube(g, 0.041, 0.028, A, X, y0, 0.773, 30, 0.0012, 1, 0.86);
    {
      const base = z => 0.0512 - 0.02 * (z - 0.797), pts = [[0.03, 0.7865], [0.0518, 0.7865], [0.0532, 0.7885], [0.0532, 0.7955], [base(0.797), 0.797]];
      for (let k = 0; k < 11; k++) { const zc = 0.8105 + k * 0.0197; pts.push([base(zc - 0.0028), zc - 0.0028], [base(zc) + 0.0014, zc - 0.0016], [base(zc) + 0.0014, zc + 0.0016], [base(zc + 0.0028), zc + 0.0028]); }
      pts.push([base(1.02), 1.02], [0.0462, 1.0265], [0.04, 1.0295], [0.0335, 1.0305], [0.0335, 1.0365], [0.03, 1.0365], [0.03, 0.7865]);
      [0, 1].forEach(h => {
        const geo = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), 26, Math.PI / 2 + h * Math.PI + 0.02, Math.PI - 0.04); geo.rotateX(Math.PI / 2);
        const hm = new THREE.Mesh(geo, H); hm.position.set(X, y0, 0); hm.scale.x = 0.95; hm.castShadow = true; g.add(hm);
      });
      cyl(g, 0.0435, 0.236, GM.rubber, X, y0, 0.906, 24).scale.x = 0.95;
    }
    // ---- barrel, turned: through the front sight, the groove cut for a launcher's clamp, then on to the muzzle (thicker
    // with each heavy-barrel level)
    const br = [0.0119, 0.0135, 0.0152, 0.017][m.heavy || 0];
    lathe(g, [[0.0001, 0.75], [br, 0.75], [br, 1.164], [br - 0.0018, 1.1695], [br - 0.0018, 1.2011], [br, 1.2052], [br, 1.3445], [0.0001, 1.3445]], GM.blued, X, y0, 24);
    // ---- the A-frame front sight: its base clamped round the barrel with the bayonet lug under it, the tower and its
    // window, the ears round the post, the sling swivel hanging under it
    solid(g, [[1.0365, 1.1162], [1.0901, 1.1162], [1.0945, 1.111], [1.095, 1.0959], [1.0987, 1.0937], [1.1075, 1.0936], [1.1092, 1.0981], [1.1202, 1.0986], [1.1239, 1.1026], [1.1237, 1.1107], [1.1185, 1.1139], [1.1185, 1.1175], [1.1115, 1.1175], [1.1115, 1.161], [1.0365, 1.161]], 0.032, A, X, 0.004);
    solid(g, [[1.0371, 1.158], [1.0379, 1.1677], [1.0706, 1.2115], [1.1112, 1.2115], [1.1115, 1.158]], 0.022, A, X, 0.002,
      [shp(inset([[1.0553, 1.163], [1.1006, 1.163], [1.1016, 1.1695], [1.1016, 1.207], [1.0843, 1.207], [1.0806, 1.2068], [1.0774, 1.2045], [1.0517, 1.1691], [1.0522, 1.1656]], -0.002))]);
    [-1, 1].forEach(sd => profile(g, shp([[1.0812, 1.205], [1.1112, 1.205], [1.1109, 1.2244], [1.1078, 1.2311], [1.1019, 1.2345], [1.0956, 1.2336], [1.0917, 1.2346], [1.0841, 1.229]]), 0.005, A, X + sd * 0.0085, 0.001));
    profile(g, shp([[1.0918, 1.185], [1.1016, 1.185], [1.1016, 1.2305], [1.0918, 1.2305]]), 0.0045, GM.metal2, X, 0.0006);   // the post
    box(g, 0.012, 0.024, 0.012, A, X, 1.104, 1.0525);
    { const t = new THREE.Mesh(new THREE.TorusGeometry(0.0098, 0.0022, 6, 14), GM.metal2); t.rotation.set(-0.35, Math.PI / 2, 0); t.position.set(X, 1.0805, 1.0525); g.add(t); }
    // ---- the A2 birdcage, turned: its lock washer, two rings, five slots round the top and sides (closed underneath, the
    // dark bore seen through them) and the chamfered mouth (a can threads on in its place)
    let front = 1.3445;
    if (!T('supp')) {
      lathe(g, [[0.0001, 1.3445], [0.0142, 1.3445], [0.0152, 1.3479], [0.0167, 1.3517], [0.0167, 1.3625], [0.016, 1.3646], [0.0167, 1.3667], [0.0167, 1.3726], [0.016, 1.3747], [0.0167, 1.3768], [0.0167, 1.3885], [0.011, 1.3885]], A, X, y0, 24);
      lathe(g, [[0.011, 1.4155], [0.0167, 1.4155], [0.0167, 1.4191], [0.0128, 1.4259], [0.0105, 1.4259], [0.0105, 1.4155], [0.011, 1.4155]], A, X, y0, 24);
      cyl(g, 0.0106, 0.04, GM.rubber, X, y0, 1.405, 16);
      const S = [-1.55, -0.78, 0, 0.78, 1.55].map(a => Math.PI + a), half = 0.11;   // slot centres, measured from straight down
      for (let i = 0; i < S.length; i++) {
        const a0 = S[i] + half, a1 = (i + 1 < S.length ? S[i + 1] : S[0] + Math.PI * 2) - half, sh = new THREE.Shape(), N = Math.max(2, Math.ceil((a1 - a0) / 0.2));
        const pt = (r, a) => [X + r * Math.sin(a), y0 - r * Math.cos(a)];
        for (let k = 0; k <= N; k++) { const p = pt(0.0167, a0 + (a1 - a0) * k / N); k ? sh.lineTo(...p) : sh.moveTo(...p); }
        for (let k = N; k >= 0; k--) sh.lineTo(...pt(0.011, a0 + (a1 - a0) * k / N));
        sh.closePath(); xsec(g, sh, 1.388, 1.4158, A);
      }
      front = 1.4259;
    }
    // ---- the magazine (in the mag group, so the reload can drop it): a 30-round STANAG traced off the photo, straight
    // under the well and then bending forward, two ribs pressed out down each side following it and the floor plate on
    // its foot; a 40-round polymer one the same, only longer; or a drum
    const mz = 0.6813, mtop = 1.0205;
    if (mt <= 1) {
      const k = mt === 1 ? 1.32 : 1, w = 0.046, mat = mt === 1 ? F : GM.magAl;
      const st = (z0, [z, y]) => y >= 0.99 ? [z, y] : [z0 + (z - z0) * k, 0.99 - (0.99 - y) * k];
      const BK = [[0.6293, 1.066], [0.6293, 1.0021], [0.6315, 0.975], [0.6348, 0.9494], [0.6398, 0.9229], [0.6505, 0.882], [0.6628, 0.8394]].map(p => st(0.6293, p));
      const FR = [[0.7335, 1.066], [0.7335, 1.0], [0.7348, 0.975], [0.7384, 0.9575], [0.7451, 0.9283], [0.7545, 0.895], [0.7646, 0.8611]].map(p => st(0.7335, p));
      solid(mg, [...BK, ...FR.slice().reverse()], w, mat, X, 0.004);
      const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      [0.26, 0.72].forEach(f => { const rib = []; for (let i = 1; i < 7; i++) rib.push(lerp(BK[i], FR[i], f - 0.03)); for (let i = 6; i > 0; i--) rib.push(lerp(BK[i], FR[i], f + 0.03)); rib[0][1] -= 0.006; rib[rib.length - 1][1] -= 0.006; rib[5][1] += 0.01; rib[6][1] += 0.01; profile(mg, shp(rib), w + 0.003, mat, X, 0.0008); });
      const b0 = BK[6], b1 = FR[6], ul = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]), u = [(b1[0] - b0[0]) / ul, (b1[1] - b0[1]) / ul], n = [-u[1], u[0]];
      const at = (p, a, c) => [p[0] + u[0] * a + n[0] * c, p[1] + u[1] * a + n[1] * c];
      solid(mg, [at(b0, -0.003, -0.0035), at(b1, 0.003, -0.0035), at(b1, 0.003, 0.009), at(b0, -0.003, 0.009)], w + 0.005, mt === 1 ? GM.rubber : GM.metal2, X, 0.002);   // the floor plate
    } else {
      const big = mt >= 3, r = big ? 0.085 : 0.07, len = big ? 0.17 : 0.142, ox = X + 0.01, cz = mz + 0.006, cyy = 0.955 - r * 0.78;
      box(mg, 0.046, 0.1, 0.1, F, X, 1.005, mz); for (let k = 0; k < 3; k++) box(mg, 0.05, 0.0035, 0.102, GM.rubber, X, 1.0 - k * 0.018, mz);
      box(mg, 0.058, 0.034, 0.12, F, X + 0.004, 0.956, mz + 0.004);
      cyl(mg, r, len, F, ox, cyy, cz, 32);
      [-1, 1].forEach(sd => {
        ring(mg, r + 0.0035, 0.012, F, ox, cyy, cz + sd * (len / 2 - 0.008)).geometry = new THREE.CylinderGeometry(r + 0.0035, r + 0.0035, 0.012, 32);
        cyl(mg, r * 0.72, 0.005, F, ox, cyy, cz + sd * (len / 2 + 0.002), 28); cyl(mg, r * 0.3, 0.004, GM.metal2, ox, cyy, cz + sd * (len / 2 + 0.005), 18);
      });
      ring(mg, r + 0.002, 0.009, GM.rubber, ox, cyy, cz).geometry = new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.009, 32);
      box(mg, 0.012, 0.034, 0.009, GM.metal2, ox + r * 0.35, cyy + r * 0.2, cz - len / 2 - 0.01); cyl(mg, 0.0095, 0.01, GM.metal2, ox, cyy, cz - len / 2 - 0.01, 14);
    }
    // ---- optics sit straight on the rail (weapons/attachments.js builds the holo and the scope; the red dot is an
    // Aimpoint-style tube on a low mount, built here)
    const top = RT, sz = 0.6;
    if (sight === 1) {
      const sy = top + 0.038;
      profile(g, shp([[sz - 0.03, top], [sz + 0.03, top], [sz + 0.024, top + 0.017], [sz - 0.024, top + 0.017]]), 0.032, A, X, 0.001);
      box(g, 0.012, 0.011, 0.02, A, X + 0.019, top + 0.006, sz); cyl(g, 0.0055, 0.01, GM.metal2, X + 0.026, top + 0.006, sz, 12).rotation.set(0, 0, Math.PI / 2);
      [-0.03, 0.03].forEach(o => { box(g, 0.011, 0.015, 0.015, A, X, top + 0.016, sz + o); ring(g, 0.025, 0.013, A, X, sy, sz + o); });
      cyl(g, 0.021, 0.115, A, X, sy, sz, 20);
      taper(g, 0.021, 0.025, 0.025, A, X, sy, sz + 0.068); ring(g, 0.0252, 0.011, GM.metal2, X, sy, sz + 0.085);
      cyl(g, 0.022, 0.004, GM.glass, X, sy, sz + 0.091, 20); ring(g, 0.023, 0.011, GM.metal2, X, sy, sz - 0.062); cyl(g, 0.019, 0.003, GM.glass, X, sy, sz - 0.069, 20);
      box(g, 0.004, 0.004, 0.002, GM.red, X, sy, sz - 0.0715);
      cyl(g, 0.0085, 0.013, GM.metal2, X, sy + 0.026, sz + 0.008, 14).rotation.set(0, 0, 0); cyl(g, 0.0085, 0.013, GM.metal2, X - 0.026, sy, sz + 0.008, 14).rotation.set(0, 0, Math.PI / 2);
    }
    // ---- laser, taped to the left of the handguard with olive tape: a pointer, then a proper module
    if (T('laser')) {
      const lx = X + HR * 0.95 + 0.013, ly = y0, lz = 0.96, em = new THREE.Object3D();
      if (T('laser') === 1) { cyl(g, 0.011, 0.11, GM.metal2, lx, ly, lz); ring(g, 0.0125, 0.012, A, lx, ly, lz + 0.05); box(g, 0.008, 0.008, 0.004, GM.red, lx, ly, lz + 0.057); em.position.set(lx, ly, lz + 0.06); }
      else { box(g, 0.03, 0.036, 0.11, GM.tan, lx + 0.004, ly, lz); box(g, 0.01, 0.01, 0.004, GM.laserG, lx + 0.004, ly + 0.008, lz + 0.056); box(g, 0.01, 0.01, 0.004, GM.glass, lx + 0.004, ly - 0.008, lz + 0.056); box(g, 0.012, 0.006, 0.02, GM.metal2, lx + 0.004, ly + 0.02, lz - 0.02); em.position.set(lx + 0.004, ly + 0.008, lz + 0.059); }
      [lz - 0.032, lz + 0.03].forEach(z => tapeWrap(g, X, y0, z, HR + 0.002, lx + (T('laser') === 1 ? 0.012 : 0.02), ly, 0.95));
      em.userData.isLaser = true; g.add(em); g.userData.laserEm = em;   // (isLaser: found again on the copy you carry, weapons/laser.js)
    }
    // ---- light, on the barrel ahead of the front sight, low on the left: taped on, then a weapon light in a barrel ring
    if (T('light')) {
      const lx = X + 0.024, ly = y0 - 0.029, lz = 1.25;
      if (T('light') === 1) {
        cyl(g, 0.016, 0.13, GM.metal2, lx, ly, lz); ring(g, 0.02, 0.03, A, lx, ly, lz + 0.075); cyl(g, 0.017, 0.004, GM.lens, lx, ly, lz + 0.091);
        [lz - 0.035, lz + 0.03].forEach(z => tapeWrap(g, X, y0, z, br + 0.003, lx + 0.017, ly - 0.004));
      } else {
        ring(g, br + 0.006, 0.028, A, X, y0, lz - 0.02); box(g, 0.015, 0.028, 0.024, A, X + 0.014, y0 - 0.016, lz - 0.02).rotation.z = 0.6;
        cyl(g, 0.018, 0.13, A, lx, ly, lz); ring(g, 0.024, 0.034, GM.metal2, lx, ly, lz + 0.08); cyl(g, 0.021, 0.004, GM.lens, lx, ly, lz + 0.098);
        ring(g, 0.015, 0.014, GM.rubber, lx, ly, lz - 0.072); box(g, 0.006, 0.013, 0.028, GM.rubber, lx + 0.019, ly, lz - 0.038);
      }
    }
    if (m.gl) {   // an M203 under the handguard
      box(g, 0.028, 0.026, 0.22, A, X, y0 - HR - 0.011, 0.92); cyl(g, 0.034, 0.23, A, X, y0 - HR - 0.058, 0.92); ring(g, 0.036, 0.012, GM.metal2, X, y0 - HR - 0.058, 1.035);
      box(g, 0.046, 0.046, 0.07, A, X, y0 - HR - 0.04, 0.78); box(g, 0.011, 0.028, 0.011, GM.metal2, X, y0 - HR - 0.072, 0.78);
    }
    return { front, y: y0, magZ: 0, magY: mtop, slide: bc, bolts: [], travel: 0.12, lock: true, mz, top, sz, scopeH: 0.05, noSight: sight === 1, noLaser: true, noLight: true, charge: ch, chargeAt: [X + 0.026, 1.172, 0.462], chargeTravel: 0.11 };
  },
  // light machine gun: the classic M60, traced off a side-on photo, with the hard green 100-round box off another. The
  // stock with its ribbed sides and steel butt plate; the receiver with the charging handle's track and knob on the
  // right, the feed cover on top and the ladder rear sight standing in front of it (folded flat under an optic); the
  // trigger housing, the raked pistol grip with its grooves, the big round guard; the forearm, ribbed down its sides,
  // with the heat shield and its row of oval holes over the barrel; the turned barrel and its two collars, the thin
  // A-frame front sight, the slotted flash hider; the gas cylinder under the barrel and the bipod folded back along it
  // (down on its legs with the bipod mod); the ammo box hanging on the left, its lid propped open and the belt rising
  // out of it into the feed tray
  lmg(g, m) {
    const K = GM.metal, P = GM.furn, y0 = 1.13, mg = g.userData.magG || g, sight = T('sight');
    // ---- the stock: ribs down both sides, the steel butt plate with the shoulder rest folded on top
    const ST = [[0.0605, 0.9989], [0.0632, 1.0294], [0.0634, 1.0782], [0.0598, 1.1458], [0.0558, 1.1806], [0.0573, 1.1859], [0.0647, 1.1899], [0.0638, 1.1962], [0.0724, 1.1979], [0.0742, 1.2005], [0.0883, 1.1992], [0.1095, 1.1864], [0.1182, 1.1849], [0.1237, 1.1872], [0.1304, 1.1862], [0.1357, 1.1801], [0.1735, 1.17], [0.179, 1.1655], [0.1848, 1.1654], [0.1875, 1.1688], [0.1928, 1.1701], [0.258, 1.1695], [0.258, 1.0495], [0.2384, 1.0492], [0.2281, 1.0458], [0.141, 0.9888], [0.1257, 0.9821], [0.0981, 0.9767], [0.0837, 0.9773], [0.0674, 0.9835]];
    solid(g, ST, 0.066, P, X, 0.012);
    { const R = []; for (let yy = 1.006; yy < 1.162; yy += 0.0093) { const z0 = 0.084, edge = yy < 1.0458 ? 0.141 + (yy - 0.9888) / (1.0458 - 0.9888) * 0.0871 : 0.26, z1 = Math.min(0.244, edge - 0.016); if (z1 - z0 > 0.02) R.push([0.0666, 0.0026, z1 - z0, X, yy, (z0 + z1) / 2]); } boxes(g, R, GM.rubber); }   // the ribs' grooves, flush with the faces
    solid(g, [[0.0605, 0.9989], [0.0632, 1.0294], [0.0634, 1.0782], [0.0598, 1.1458], [0.0558, 1.1806], [0.0573, 1.1859], [0.0647, 1.1899], [0.0638, 1.1962], [0.0724, 1.1979], [0.0742, 1.2005], [0.08, 1.2], [0.0745, 1.185], [0.0745, 1.1458], [0.0762, 1.0782], [0.0762, 1.0294], [0.0742, 0.99], [0.0674, 0.9835]], 0.07, K, X, 0.004);   // the butt plate
    // ---- the receiver: its body, the feed cover on top, the trigger housing under it; on the right the charging
    // handle's track with the handle in it and the vent holes
    solid(g, [[0.2545, 1.0607], [0.6793, 1.0607], [0.6794, 1.1564], [0.6764, 1.1589], [0.646, 1.165], [0.44, 1.172], [0.4395, 1.1844], [0.3668, 1.1711], [0.3629, 1.1744], [0.2871, 1.1686], [0.254, 1.1693]], 0.064, K, X, 0.004);
    solid(g, [[0.4395, 1.168], [0.646, 1.168], [0.6463, 1.18], [0.645, 1.1852], [0.6408, 1.1846], [0.639, 1.1816], [0.6331, 1.184], [0.624, 1.1799], [0.6218, 1.1835], [0.5856, 1.1863], [0.5823, 1.1926], [0.5777, 1.1911], [0.5727, 1.1939], [0.5388, 1.1941], [0.5213, 1.1885], [0.5174, 1.1901], [0.4961, 1.1895], [0.4914, 1.1846], [0.4887, 1.1883], [0.4505, 1.1861], [0.4482, 1.1856], [0.446, 1.1817], [0.4395, 1.1844]], 0.06, GM.metal2, X, 0.003);
    solid(g, [[0.4338, 1.064], [0.619, 1.064], [0.619, 1.0457], [0.4338, 1.0456]], 0.05, K, X, 0.003);
    box(g, 0.003, 0.009, 0.148, GM.rubber, X - 0.0316, 1.093, 0.326);                                         // the handle's track
    const sl = new THREE.Group(); g.add(sl);
    box(sl, 0.008, 0.012, 0.02, GM.metal2, X - 0.034, 1.093, 0.385); cyl(sl, 0.0085, 0.02, GM.steel, X - 0.046, 1.093, 0.385, 16).rotation.set(0, 0, Math.PI / 2);
    [0.455, 0.465, 0.475].forEach(z => cyl(g, 0.0032, 0.0646, GM.rubber, X, 1.135, z, 10).rotation.set(0, 0, Math.PI / 2));
    // the ejection port on the right, the bolt in it running right back past its rear edge on each shot (the charging
    // handle stays where it is: it doesn't ride with the bolt)
    profile(g, shp([[0.47, 1.103], [0.575, 1.103], [0.575, 1.13], [0.47, 1.13]]), 0.002, GM.rubber, X - 0.0322, 0.0004);
    const bolt = box(g, 0.003, 0.021, 0.06, GM.steel, X - 0.0333, 1.1165, 0.545); bolt.userData.clip = 0.47;
    // the rear sight: the ladder standing up in front of the feed cover (lying flat under an optic)
    const RS = [[0.6539, 1.158], [0.6577, 1.169], [0.658, 1.1789], [0.6552, 1.1851], [0.6625, 1.1993], [0.657, 1.2022], [0.6601, 1.2081], [0.6565, 1.2248], [0.6605, 1.2338], [0.6606, 1.2575], [0.6651, 1.2585], [0.6672, 1.2307], [0.6712, 1.2197], [0.6684, 1.208], [0.6731, 1.2035], [0.6684, 1.2002], [0.6684, 1.1939], [0.6744, 1.184], [0.6764, 1.1589]];
    if (!sight) { profile(g, shp(RS), 0.012, K, X, 0.0012); cyl(g, 0.0065, 0.03, GM.metal2, X, 1.195, 0.665, 14).rotation.set(0, 0, Math.PI / 2); }
    else box(g, 0.014, 0.006, 0.06, K, X, 1.1615, 0.69);
    // ---- the pistol grip, raked back, with its grooves; the big round guard and the trigger in it
    const GR = [[0.4329, 1.064], [0.4331, 1.0447], [0.4353, 1.0384], [0.4381, 1.0364], [0.455, 1.034], [0.4604, 1.0281], [0.4627, 1.0207], [0.4636, 1.0099], [0.4615, 0.9988], [0.4366, 0.9632], [0.4334, 0.9553], [0.435, 0.9418], [0.4443, 0.9356], [0.464, 0.9306], [0.494, 0.9306], [0.4961, 0.9338], [0.4952, 0.9453], [0.4981, 0.9586], [0.5144, 0.9875], [0.5226, 0.9976], [0.535, 1.012], [0.535, 1.064]];
    solid(g, GR, 0.04, P, X, 0.006);
    { const R = [], bk = [[0.4334, 0.9553], [0.4615, 0.9988]], fr = [[0.4952, 0.9453], [0.5144, 0.9875]]; for (let yy = 0.946; yy < 0.99; yy += 0.0085) { const z0 = zAt(bk, yy) + 0.008, z1 = zAt(fr, yy) - 0.008; R.push([0.0406, 0.0026, z1 - z0, X, yy, (z0 + z1) / 2]); } boxes(g, R, GM.rubber); }
    solid(g, [[0.53, 1.05], [0.619, 1.05], [0.619, 1.0362], [0.6132, 1.0332], [0.6086, 1.0069], [0.597, 0.9949], [0.5843, 0.99], [0.5681, 0.9899], [0.5328, 0.9994], [0.5226, 0.9976], [0.528, 1.02]], 0.03, K, X, 0.002,
      [shp(inset([[0.5578, 1.0203], [0.5597, 1.0134], [0.5626, 1.0079], [0.565, 1.0017], [0.581, 1.001], [0.5933, 1.0023], [0.6014, 1.008], [0.6042, 1.0191], [0.6026, 1.031], [0.5915, 1.0364], [0.5671, 1.0361], [0.5613, 1.0328], [0.5592, 1.0274]], -0.002))]);
    profile(g, shp([[0.5655, 1.048], [0.5655, 1.03], [0.5665, 1.02], [0.5705, 1.009], [0.574, 1.008], [0.5715, 1.019], [0.5712, 1.03], [0.5735, 1.048]]), 0.007, GM.metal2, X, 0.0008);
    // ---- the forearm: ribbed down its sides, rounded under; over the barrel the heat shield with its oval holes, the
    // carrying handle's hinge behind it
    solid(g, [[0.6591, 1.0451], [0.6696, 1.0385], [0.6739, 1.037], [0.7119, 1.0391], [1.0254, 1.0414], [1.0313, 1.0522], [1.0321, 1.0694], [1.0392, 1.0708], [1.0392, 1.12], [0.66, 1.12]], 0.072, P, X, 0.012);
    { const R = []; for (let z = 0.692; z < 1.022; z += 0.0084) R.push([0.0726, 0.052, 0.0026, X, 1.0805, z]); boxes(g, R, GM.rubber); }   // its rib grooves, flush with the sides
    const HS = [[0.77, 1.114], [1.03, 1.114], [1.03, 1.1586], [1.0237, 1.1624], [0.9543, 1.1596], [0.905, 1.1604], [0.899, 1.1586], [0.8621, 1.1591], [0.851, 1.1574], [0.8414, 1.1616], [0.826, 1.1644], [0.771, 1.1672]];
    { const holes = []; for (let k = 0; k < 9; k++) { const z = 0.853 + k * 0.0204; holes.push(shp(inset(rrect(z - 0.004, 1.128, z + 0.004, 1.152, 0.0039).getPoints().map(p => [p.x, p.y]), -0.002))); } solid(g, HS, 0.054, K, X, 0.002, holes); }
    box(g, 0.03, 0.044, 0.25, GM.rubber, X, 1.136, 0.9);                                                      // dark inside it, seen through the holes
    solid(g, [[0.676, 1.115], [0.771, 1.115], [0.771, 1.1672], [0.7655, 1.1702], [0.7322, 1.1702], [0.7238, 1.1691], [0.7232, 1.1629], [0.7283, 1.1593], [0.7234, 1.1542], [0.7182, 1.1536], [0.7092, 1.1565], [0.6814, 1.1566], [0.676, 1.158]], 0.05, K, X, 0.004);
    // ---- barrel, turned: its two collars, a band under the front sight, then thicker to the flash hider
    lathe(g, [[0.0001, 0.67], [0.0117, 0.67], [0.0117, 1.155], [0.0172, 1.1575], [0.0178, 1.165], [0.0172, 1.178], [0.0117, 1.1805], [0.0117, 1.2215], [0.0172, 1.224], [0.0178, 1.236], [0.0172, 1.246], [0.0117, 1.2485], [0.0117, 1.3405], [0.0178, 1.3425], [0.0178, 1.3915], [0.0165, 1.393], [0.0165, 1.43], [0.0001, 1.43]], GM.blued, X, y0, 28);
    // the A-frame front sight, a thin blade with its window, standing on the band
    profile(g, shp([[1.3423, 1.1415], [1.3924, 1.1415], [1.3924, 1.1446], [1.3903, 1.1466], [1.384, 1.2081], [1.3843, 1.2279], [1.3819, 1.2325], [1.3748, 1.236], [1.3738, 1.2316], [1.3697, 1.2311], [1.3681, 1.2289], [1.3471, 1.1643]],
      [shp(inset([[1.3524, 1.1521], [1.3763, 1.1468], [1.38, 1.148], [1.3804, 1.1532], [1.3773, 1.2042], [1.3735, 1.2066], [1.3681, 1.2045]], -0.001))]), 0.006, K, X, 0.001);
    // the flash hider, turned, with four long slots round it (the dark bore seen through them)
    lathe(g, [[0.0001, 1.43], [0.0165, 1.43], [0.0165, 1.449], [0.0105, 1.449]], K, X, y0, 28);
    lathe(g, [[0.0105, 1.514], [0.0165, 1.514], [0.0165, 1.522], [0.0128, 1.535], [0.0098, 1.535], [0.0098, 1.514], [0.0105, 1.514]], K, X, y0, 28);
    cyl(g, 0.0102, 0.07, GM.rubber, X, y0, 1.483, 16);
    { const S = [0, Math.PI / 2, Math.PI, Math.PI * 1.5], half = 0.16; for (let i = 0; i < 4; i++) { const a0 = S[i] + half, a1 = S[(i + 1) % 4] + (i === 3 ? Math.PI * 2 : 0) - half, sh = new THREE.Shape(), N = 5, pt = (r, a) => [X + r * Math.sin(a), y0 - r * Math.cos(a)];
      for (let k = 0; k <= N; k++) { const pp = pt(0.0165, a0 + (a1 - a0) * k / N); k ? sh.lineTo(...pp) : sh.moveTo(...pp); } for (let k = N; k >= 0; k--) sh.lineTo(...pt(0.0105, a0 + (a1 - a0) * k / N)); sh.closePath(); xsec(g, sh, 1.448, 1.5145, K); } }
    // ---- the gas cylinder under the barrel and the block joining them under the sight; the bipod on its yoke at the
    // front, legs folded back along the cylinder (perforated, their feet hanging at the back), or down on them
    cyl(g, 0.0105, 0.36, K, X, 1.094, 1.215, 20); cyl(g, 0.0128, 0.022, GM.metal2, X, 1.094, 1.388, 20);
    solid(g, [[1.355, 1.09], [1.4, 1.09], [1.4, 1.135], [1.355, 1.135]], 0.02, K, X, 0.003);
    solid(g, [[1.395, 1.062], [1.43, 1.062], [1.43, 1.116], [1.395, 1.116]], 0.032, K, X, 0.004);   // the yoke
    if (!m.bipod) cyl(g, 0.0068, 0.032, GM.metal2, X, 1.069, 1.17, 14).rotation.x = 0;                     // the clamp holding the folded legs, up into the cylinder
    {
      const legH = []; for (let k = 0; k < 12; k++) { const z = -0.315 + k * 0.0205; legH.push(shp(inset(rrect(z - 0.004, -0.0095, z + 0.004, -0.0005, 0.0038).getPoints().map(p => [p.x, p.y]), -0.0008))); }
      [-1, 1].forEach(sd => {
        const lg = new THREE.Group(); lg.position.set(X + sd * 0.0172, 1.1, 1.41); g.add(lg);
        profile(lg, shp([[-0.375, -0.03], [0, -0.03], [0, 0.017], [-0.375, 0.017]], legH), 0.0024, K, 0, 0.0008);
        profile(lg, shp([[-0.3535, -0.072], [-0.3465, -0.072], [-0.344, -0.03], [-0.344, 0.004], [-0.355, 0.004], [-0.356, -0.03]]), 0.012, K, sd * 0.004, 0.001);   // its foot
        if (m.bipod) lg.rotation.set(-1.72, 0, sd * 0.2, 'ZYX');   // swung down, then splayed
      });
    }
    // ---- the ammo box (in the mag group, so the reload can swap it): the hard olive 100-round box hanging on the left
    // under the feed tray, rounded at its corners, screwed at its edges, its lid propped open on the hinge along its
    // outer top edge, flipped back out of the way (taller with the belt and mag upgrades)
    const bh = 0.22 + 0.03 * T('mag'), bt = 1.1, bz0 = 0.448, bz1 = 0.622, bx0 = X + 0.032, bx1 = X + 0.132, bxm = (bx0 + bx1) / 2, bzm = (bz0 + bz1) / 2;
    {
      const sh = new THREE.Shape(), r = 0.011; sh.moveTo(bx0 + r, bz0); sh.lineTo(bx1 - r, bz0); sh.quadraticCurveTo(bx1, bz0, bx1, bz0 + r); sh.lineTo(bx1, bz1 - r); sh.quadraticCurveTo(bx1, bz1, bx1 - r, bz1); sh.lineTo(bx0 + r, bz1); sh.quadraticCurveTo(bx0, bz1, bx0, bz1 - r); sh.lineTo(bx0, bz0 + r); sh.quadraticCurveTo(bx0, bz0, bx0 + r, bz0);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: bh - 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 6 });
      geo.rotateX(Math.PI / 2); geo.translate(0, bt - 0.003, 0);
      const bm = new THREE.Mesh(geo, GM.olive); bm.castShadow = true; mg.add(bm);
      box(mg, bx1 - bx0 - 0.008, 0.002, bz1 - bz0 - 0.01, GM.rubber, bxm, bt + 0.0006, bzm);                   // the open top, dark inside
      [[bz0 + 0.013, bt - 0.013], [bz1 - 0.013, bt - 0.013], [bz0 + 0.013, bt - bh + 0.013], [bz1 - 0.013, bt - bh + 0.013]].forEach(([z, yy]) => cyl(mg, 0.0028, 0.003, GM.oliveD, bx1 + 0.0008, yy, z, 10).rotation.set(0, 0, Math.PI / 2));   // screws
      cyl(mg, 0.0032, bz1 - bz0 - 0.008, GM.oliveD, bx1 - 0.002, bt + 0.003, bzm, 10);                          // the lid's hinge
      const lid = new THREE.Group(); lid.position.set(bx1 - 0.002, bt + 0.003, 0); lid.rotation.z = -1.95; mg.add(lid);   // flipped back past upright
      solid(lid, [[bz0 + 0.004, -0.0015], [bz1 - 0.004, -0.0015], [bz1 - 0.004, 0.0015], [bz0 + 0.004, 0.0015]], bx1 - bx0 - 0.004, GM.olive, -(bx1 - bx0 - 0.004) / 2, 0.0012);
    }
    // the belt: rounds pointing forward, each held in its link, looping up out of the box and over into the feed tray.
    // It shows what's left: under ten rounds they go from the box end first, and an empty gun shows none (player/hold.js)
    const belt = [];
    {
      const P0 = [X + 0.03, 1.146], P1 = [X + 0.15, 1.23], P2 = [bxm, 1.09], bez = t => [0, 1].map(c => (1 - t) * (1 - t) * P0[c] + 2 * (1 - t) * t * P1[c] + t * t * P2[c]);
      let prev = bez(0), run = 0; const pts = [prev];
      for (let i = 1; i <= 600 && pts.length < 10; i++) { const q = bez(i / 600); run += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; if (run >= 0.0165) { pts.push(q); run = 0; } }
      pts.forEach(([x, yy]) => {
        const rd = new THREE.Group(); mg.add(rd);
        cyl(rd, 0.0072, 0.072, GM.brass, x, yy, 0.535, 14); taper(rd, 0.0062, 0.0018, 0.026, GM.copper, x, yy, 0.584);
        [-0.021, 0.021].forEach(o => ring(rd, 0.0099, 0.007, GM.metal2, x, yy, 0.535 + o));   // its link's loops, hooked into the next
        belt.push(rd);
      });
    }
    // ---- optics sit on the feed cover
    return { front: 1.535, y: y0, slide: bolt, bolts: [], travel: 0.11, lock: true, mz: 0.535, top: 1.194, sz: 0.515, belt };
  }
};
