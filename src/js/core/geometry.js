// Geometry helpers: cached boxes, flat-shaded meshes, cylinders and soft blob shadows.

const geoCache = {}, sharedGeo = new WeakSet();
const bgeo = (w, h, d) => { const k = w.toFixed(3) + ',' + h.toFixed(3) + ',' + d.toFixed(3); if (!geoCache[k]) sharedGeo.add(geoCache[k] = new THREE.BoxGeometry(w, h, d)); return geoCache[k]; };
// a model taken down for good (a weapon rebuilt for a new attachment, yours or a teammate's): its own geometry is let go
// of a few frames on (once the copies drawn from it are gone too), so the GPU doesn't keep every old model it was sent.
// The cached boxes stay, as other models still use them
function binModel(o) {
  if (o.parent) o.parent.remove(o);
  o.traverse(q => { if (q.isMesh && q.geometry && !sharedGeo.has(q.geometry)) modelBin.add(q.geometry); });
  modelBinT = 3;
}
const modelBin = new Set(); let modelBinT = 0;
function flushModels() { if (modelBin.size && --modelBinT <= 0) { modelBin.forEach(g => g.dispose()); modelBin.clear(); } }
function box(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(bgeo(w, h, d), mat);
  m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
const flat = g => { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; };
const BLOB_TEX = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const BLOB_G = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function blobShadow(size, op) { const m = new THREE.Mesh(BLOB_G, new THREE.MeshBasicMaterial({ map: BLOB_TEX, color: 0x000000, transparent: true, opacity: op, depthWrite: false })); m.scale.setScalar(size); m.renderOrder = 1; m.position.y = 0.02; scene.add(m); return m; }
const cylZ = (r, len, mat, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg || 10), mat); m.rotation.x = Math.PI / 2; m.castShadow = true; return m; };
function addCylZ(g, r, len, mat, x, y, z) { const m = cylZ(r, len, mat); m.position.set(x, y, z); g.add(m); return m; }
// Merge many small static pieces into as few meshes as possible, so a detailed model costs a handful of draw calls.
// Plain lit colours are baked into vertex colours and share one material; anything else (glows, double-sided or
// see-through materials, or the ones in opt.live that get recoloured at runtime) is merged per material.
// The pieces can sit anywhere under parent; the merged meshes are added to parent and flagged userData.fine
// (outlines and x-ray rims skip them, since their scaled-hull trick only works on single boxes).
const _mergeM = new THREE.Matrix4();
let BAKED_M = null;
function mergeInto(parent, list, opt) {
  const live = (opt && opt.live) || null, noBake = !!(opt && opt.noBake);
  parent.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert(), groups = new Map(), out = [];
  const bakeable = m => !noBake && m.isMeshLambertMaterial && !m.transparent && !m.map && m.side === THREE.FrontSide && !m.vertexColors && m.customProgramCacheKey && m.customProgramCacheKey() === 'lit' && !(live && live.has(m));
  list.forEach(o => {
    const bake = bakeable(o.material), k = (bake ? 'baked' : o.material.uuid) + (o.castShadow ? '+' : '-');
    if (!groups.has(k)) groups.set(k, { mat: o.material, bake, cast: o.castShadow, parts: [] });
    groups.get(k).parts.push(o);
  });
  groups.forEach(({ mat, bake, cast, parts }) => {
    const pos = [], nor = [], col = []; let n = 0;
    parts.forEach(o => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(_mergeM.multiplyMatrices(inv, o.matrixWorld));
      const a = g.attributes.position.array; pos.push(a); nor.push(g.attributes.normal.array); n += a.length;
      if (bake) { const c = o.material.color, cs = new Float32Array(a.length); for (let i = 0; i < a.length; i += 3) { cs[i] = c.r; cs[i + 1] = c.g; cs[i + 2] = c.b; } col.push(cs); }
      g.dispose();
    });
    const P = new Float32Array(n), N = new Float32Array(n), C = bake ? new Float32Array(n) : null; let at = 0;
    pos.forEach((a, k) => { P.set(a, at); N.set(nor[k], at); if (C) C.set(col[k], at); at += a.length; });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (C) geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    const m = new THREE.Mesh(geo, bake ? (BAKED_M || (BAKED_M = lam(0xffffff, { vertexColors: true }))) : mat);
    m.castShadow = cast; m.receiveShadow = true; m.userData.fine = true; parent.add(m); out.push(m);
  });
  list.forEach(o => { if (o.parent) o.parent.remove(o); });
  return out;
}
// pieces too small for their shadow to show from up here (an eye, a button, a buckle, a gun's pin) cast none: on a figure
// of loose pieces each would be a draw of its own in the sun's shadow pass. Folded meshes keep theirs (a piece folded in
// costs nothing there)
const _tsV = new THREE.Vector3();
function trimShadows(root, r) {
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || !o.castShadow || o.userData.fine || !o.geometry) return;
    const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); o.getWorldScale(_tsV);
    if (g.boundingSphere.radius * Math.max(_tsV.x, _tsV.y, _tsV.z) < (r || 0.06)) o.castShadow = false;
  });
}
// what doesn't move or change in a model folded together, a mesh per material (no colours baked: each keeps its own
// material, for what's done to materials later: a wall cell's cut-away fade and its paint, the blood on a weapon). Each
// piece goes into root's frame, so only pieces fixed to it fold: anything under a stop node (a moving part, a group
// that's shown and hidden), a hidden one, anything noted on (userData: a laser, a clip, a belt's rounds, a flash),
// and anything see-through (unless opt.see: a roof that fades as a whole), mapped, vertex-coloured or drawn in an order
// of its own stays as it is
const foldable = (o, see) => {
  const m = o.material;
  return o.isMesh && !o.isInstancedMesh && !Array.isArray(m) && m && (see || !m.transparent) && !m.map && !m.vertexColors && !m.alphaTest && m.colorWrite !== false && m.visible !== false
    && m.blending === THREE.NormalBlending && !o.renderOrder && !o.customDepthMaterial && o.geometry.attributes.normal && !o.geometry.morphAttributes.position;
};
function foldPieces(root, stop, opt) {
  const parts = [], see = !!(opt && opt.see);
  (function walk(o) { o.children.forEach(c => { if ((stop && stop.has(c)) || !c.visible || Object.keys(c.userData).length) return; if (foldable(c, see)) parts.push(c); walk(c); }); })(root);
  // (a piece with children of its own keeps its place, for them: only childless ones fold)
  const list = parts.filter(c => !c.children.length);
  return list.length > 1 ? mergeInto(root, list, { noBake: true }) : [];
}
// every mesh under g except the ones flagged userData.sil (kept whole for outlines) and anything under a stop node
function finePieces(g, stop) {
  const out = []; (function walk(o) { o.children.forEach(c => { if (stop && stop.has(c)) return; if (c.isMesh && !c.userData.sil && !c.userData.fine) out.push(c); walk(c); }); })(g);
  return out;
}
// Pull apart faces that sit exactly on top of each other (z-fighting). Every pair of triangles under root that
// lies in the same plane, faces the same way, overlaps and belongs to meshes of different materials is a fight;
// the thinner of the two pieces is pulled back 0.6 mm on that face: a box loses a sliver off that side, a
// cylinder off its end cap, or a hair of its radius for its flat sides. Three passes catch pieces with more than one.
// opt.fixed: meshes never to resize (the rig); opt.only: only these may be resized, and only pairs with one of them count.
// A pass after the first only has to look at pairs with a piece the pass before moved (and whatever rides on it): every
// other pair is just as it was, and it was settled then
const _ufV = new THREE.Vector3(), _ufN = new THREE.Vector3(), _ufE1 = new THREE.Vector3(), _ufE2 = new THREE.Vector3();
function unfight(root, opt) {
  const fixed = (opt && opt.fixed) || null, only = (opt && opt.only) || null, gap = 0.0006;
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M = new THREE.Matrix4();
  let T = ufTris(root, inv, M, null), moved = null, n = 0;
  for (let pass = 0; pass < 3; pass++) {
    const todo = ufPass(T, fixed, only, moved);
    todo.forEach(E => {
      if (E.face.radial) { const b = E.o.geometry.boundingBox, r = (b.max.x - b.min.x) / 2 * Math.abs(E.o.scale.x); if (r > gap * 3) { const f = 1 - gap / r; E.o.scale.x *= f; E.o.scale.z *= f; E.o.updateMatrixWorld(true); } }
      else shrinkFace(E.o, E.face.c, E.face.side, gap);
    });
    n += todo.size; if (!todo.size || pass === 2) break;
    moved = new Set(); todo.forEach(E => E.o.traverse(q => moved.add(q)));
    T = T.filter(t => !moved.has(t.o)).concat(ufTris(root, inv, M, moved));
  }
  return n;
}
// the triangles that could fight under root (only those of the meshes in just, if given), in root's frame
function ufTris(root, inv, M, just) {
  const T = [];
  root.traverse(o => {
    if (just && !just.has(o)) return;
    if (!o.isMesh || o.userData.isOutline || o.userData.isFlash || o.userData.fine || !o.visible) return;
    const m = o.material; if (!m || m.transparent || m.side !== THREE.FrontSide || m.colorWrite === false) return;
    const type = o.geometry.type; if (type !== 'BoxGeometry' && type !== 'CylinderGeometry') return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index; M.multiplyMatrices(inv, o.matrixWorld);
    const n = idx ? idx.count : pos.count, at = k => idx ? idx.getX(k) : k;
    for (let k = 0; k < n; k += 3) {
      const l = [0, 1, 2].map(q => new THREE.Vector3().fromBufferAttribute(pos, at(k + q)));
      _ufE1.subVectors(l[1], l[0]); _ufE2.subVectors(l[2], l[0]); const ln = new THREE.Vector3().crossVectors(_ufE1, _ufE2);
      if (ln.lengthSq() < 1e-14) continue; ln.normalize();
      const v = l.map(p => p.applyMatrix4(M)); _ufE1.subVectors(v[1], v[0]); _ufE2.subVectors(v[2], v[0]);
      const wn = new THREE.Vector3().crossVectors(_ufE1, _ufE2); if (wn.lengthSq() < 1e-14) continue; wn.normalize();
      // which face of the piece this triangle belongs to, in the piece's own terms
      let face;
      if (type === 'BoxGeometry') { const a = [ln.x, ln.y, ln.z].map(Math.abs), c = a.indexOf(Math.max(...a)); face = { c, side: Math.sign([ln.x, ln.y, ln.z][c]) }; }
      else face = Math.abs(ln.y) > 0.99 ? { c: 1, side: Math.sign(ln.y) } : { radial: true };
      const b = [0, 1, 2].map(c => Math.min(v[0].getComponent(c), v[1].getComponent(c), v[2].getComponent(c)) - 1e-3).concat([0, 1, 2].map(c => Math.max(v[0].getComponent(c), v[1].getComponent(c), v[2].getComponent(c)) + 1e-3));
      T.push({ o, v, n: wn, d: wn.dot(v[0]), face, b });   // (b: its bounds, a millimetre over: two that don't meet can't fight)
    }
  });
  return T;
}
// one pass: which face of which piece gives way (only pairs with a piece in moved count, if given)
function ufPass(T, fixed, only, moved) {
  // bucket by direction, then sweep by plane offset
  const B = new Map();
  T.forEach(t => { const k = Math.round(t.n.x * 40) + ',' + Math.round(t.n.y * 40) + ',' + Math.round(t.n.z * 40); (B.get(k) || B.set(k, []).get(k)).push(t); });
  const todo = new Map(), tol = 3e-4;
  const clip = (poly, a, b) => { const r = []; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], sp = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]), sq = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]); if (sp >= 0) r.push(p); if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); r.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } return r; };
  const area = p => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const thick = (o, f) => {
    const b = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox);
    if (f.radial) return (b.max.x - b.min.x) * Math.abs(o.scale.x);
    return ([b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z][f.c]) * Math.abs(o.scale[['x', 'y', 'z'][f.c]]);
  };
  const may = o => !(fixed && fixed.has(o)) && (!only || only.has(o));
  B.forEach(list => {
    list.sort((a, b) => a.d - b.d);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length && list[j].d - list[i].d < 0.02; j++) {
      const A = list[i], C = list[j];
      if (A.o === C.o || A.o.material === C.o.material) continue;
      const a = A.b, c = C.b; if (a[0] > c[3] || c[0] > a[3] || a[1] > c[4] || c[1] > a[4] || a[2] > c[5] || c[2] > a[5]) continue;
      if (A.n.dot(C.n) < 0.9999) continue;
      if (only && !only.has(A.o) && !only.has(C.o)) continue;
      if (moved && !moved.has(A.o) && !moved.has(C.o)) continue;
      if (C.v.some(p => Math.abs(A.n.dot(p) - A.d) > tol)) continue;
      // overlap in the plane
      const u = Math.abs(A.n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0); u.sub(_ufN.copy(A.n).multiplyScalar(u.dot(A.n))).normalize();
      const w = new THREE.Vector3().crossVectors(A.n, u), O = A.v[0], P = t => t.v.map(p => [_ufV.subVectors(p, O).dot(u), _ufV.dot(w)]);
      let pa = P(A), pc = P(C); if (area(pa) < 0) pa.reverse(); if (area(pc) < 0) pc.reverse();
      let poly = pc; for (let k = 0; k < 3 && poly.length; k++) poly = clip(poly, pa[k], pa[(k + 1) % 3]);
      if (poly.length < 3 || Math.abs(area(poly)) < 1e-6) continue;
      // the thinner piece gives way (or the one that's allowed to)
      let pickA = thick(A.o, A.face) <= thick(C.o, C.face);
      if (pickA && !may(A.o)) pickA = false; else if (!pickA && !may(C.o)) pickA = true;
      const E = pickA ? A : C; if (!may(E.o)) continue;
      const key = E.o.uuid + (E.face.radial ? ':r' : ':' + E.face.c + ':' + E.face.side);
      if (!todo.has(key)) todo.set(key, E);
    }
  });
  return todo;
}
// move one face of a mesh inward by d, keeping the opposite face where it is
function shrinkFace(o, c, side, d) {
  if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
  const b = o.geometry.boundingBox, mn = [b.min.x, b.min.y, b.min.z][c], mx = [b.max.x, b.max.y, b.max.z][c];
  const s = ['x', 'y', 'z'][c], S0 = o.scale[s], ext = (mx - mn) * Math.abs(S0); if (ext <= d * 3) return;
  const f = 1 - d / ext;
  _ufV.set(0, 0, 0); _ufV[s] = (side > 0 ? mn : mx) * S0 * (1 - f); _ufV.applyQuaternion(o.quaternion);
  o.scale[s] = S0 * f; o.position.add(_ufV); o.updateMatrixWorld(true);
}
