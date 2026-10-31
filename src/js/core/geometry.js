// Geometry helpers: cached boxes, flat-shaded meshes, cylinders and soft blob shadows.

import { scene } from './renderer.js';
import { lam } from './shaders.js';

export const geoCache = {}, sharedGeo = new WeakSet();
export const bgeo = (w, h, d) => { const k = w.toFixed(3) + ',' + h.toFixed(3) + ',' + d.toFixed(3); if (!geoCache[k]) sharedGeo.add(geoCache[k] = new THREE.BoxGeometry(w, h, d)); return geoCache[k]; };
// a model taken down for good (a weapon rebuilt for a new attachment, yours or a teammate's): its own geometry is let go
// of a few frames on (once the copies drawn from it are gone too), so the GPU doesn't keep every old model it was sent.
// The cached boxes stay, as other models still use them
export function binModel(o) {
  if (o.parent) o.parent.remove(o);
  o.traverse(q => { if (q.isMesh && q.geometry && !sharedGeo.has(q.geometry)) modelBin.add(q.geometry); });
  modelBinT = 3;
}
const modelBin = new Set(); let modelBinT = 0;
export function flushModels() { if (modelBin.size && --modelBinT <= 0) { modelBin.forEach(g => g.dispose()); modelBin.clear(); } }
// Two pieces of one model with faces in the same plane, facing the same way, flicker through each other wherever they
// overlap (z-fighting). So each model's faces are noted as its boxes, profiles and bore cylinders go on (by the group
// they're added to: never the scene itself), with the patch of the plane each covers, and a face that would lie over
// one already there (in the same plane, facing the same way, the two patches overlapping) is pushed out ZFIGHT.nudge m
// for each one under it (up to ZFIGHT.max). The later piece (the detail on a body, as they're built) sits that hair
// proud and always shows; a tenth of a millimetre is nothing to see, and plenty for the depth buffer up close (a gun in
// your hands); a big piece (furniture, the house: over ZFIGHT.big m) is seen from much further off, so it's pushed
// ZFIGHT.far instead (unfight's gap). Pieces side by side in a row (a rail's slots) don't overlap, so they're left be
const ZFIGHT = { nudge: 0.0001, far: 0.0006, big: 0.25, q: 2e-5, cap: 6000, max: 3 };
const ZF_PLANES = new WeakMap();
// axis: which way the face looks (and its kind); at: where its plane is along that; r: [a0, a1, b0, b1], the patch it covers
export function zfPush(parent, axis, at, r, big) {
  if (!parent || parent.isScene) return 0;
  let M = ZF_PLANES.get(parent); if (!M) ZF_PLANES.set(parent, M = new Map());
  const q = Math.round(at / ZFIGHT.q), e = 1e-6; let n = 0;
  for (let k = q - 1; k <= q + 1; k++) { const L = M.get(axis + k); if (L) for (const o of L) if (o[0] < r[1] - e && r[0] < o[1] - e && o[2] < r[3] - e && r[2] < o[3] - e) n++; }
  if (M.size < ZFIGHT.cap) { const k = axis + q; let L = M.get(k); if (!L) M.set(k, L = []); if (L.length < 64) L.push(r); }
  return Math.min(n, ZFIGHT.max) * (big ? ZFIGHT.far : ZFIGHT.nudge);
}
// (a span c ± s/2 along one axis, over the patch r: its two faces pushed out as they need; the new middle and size)
export function zfSpan(parent, axis, c, s, r, big) { const a = zfPush(parent, axis + '-', c - s / 2, r, big), b = zfPush(parent, axis + '+', c + s / 2, r, big); return [c + (b - a) / 2, s + a + b]; }
export function box(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(bgeo(w, h, d), mat);
  x = x || 0; y = y || 0; z = z || 0;
  const big = Math.max(w, h, d) > ZFIGHT.big;
  const [cx, sw] = zfSpan(parent, 'x', x, w, [y - h / 2, y + h / 2, z - d / 2, z + d / 2], big), [cy, sh] = zfSpan(parent, 'y', y, h, [x - w / 2, x + w / 2, z - d / 2, z + d / 2], big), [cz, sd] = zfSpan(parent, 'z', z, d, [x - w / 2, x + w / 2, y - h / 2, y + h / 2], big);
  m.position.set(cx, cy, cz); m.castShadow = true; m.receiveShadow = true;
  if (sw !== w || sh !== h || sd !== d) m.scale.set(w ? sw / w : 1, h ? sh / h : 1, d ? sd / d : 1);   // (as a scale: bgeo's boxes are shared to the millimetre)
  parent.add(m); return m;
}
export const flat = g => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; };
// a line of points (Vector2s) with every point left out that it can do without: kept only where leaving it out would
// move the line more than tol (Douglas-Peucker), so a curve keeps all the points its bend needs and a straight run is two
export function simplifyLine(P, tol) {
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const run = (a, b) => {
    const A = P[a], B = P[b], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1e-12; let at = -1, far = tol;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((P[i].x - A.x) * dy - (P[i].y - A.y) * dx) / L; if (d > far) { far = d; at = i; } }
    if (at >= 0) { keep[at] = 1; run(a, at); run(at, b); }
  };
  run(0, P.length - 1); return P.filter((_, i) => keep[i]);
}
// a cylinder or a cone (rt, rb: its radius at the top and the bottom, h tall, n sides) with no more triangles than it
// needs: three.js fans each flat end from a point in its middle, a triangle a side, where a flat n-sided end needs only
// n - 2 fanned from one corner (the same face to see); and an end that can never be seen (under the ground, inside a
// crown of boughs) is left off altogether (caps: [top, bottom], whether each is closed). Non-indexed, only its points
export function tightCyl(rt, rb, h, n, caps = [true, true]) {
  const pos = [], ring = (r, y) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [r * Math.sin(a), y, r * Math.cos(a)]; });
  const T = ring(rt, h / 2), B = ring(rb, -h / 2), tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (rt > 0) tri(T[i], B[i], T[j]);
    if (rb > 0) tri(B[i], B[j], T[j]);
  }
  if (caps[0] && rt > 0) for (let i = 1; i < n - 1; i++) tri(T[0], T[i], T[i + 1]);
  if (caps[1] && rb > 0) for (let i = 1; i < n - 1; i++) tri(B[0], B[i + 1], B[i]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); return g;
}
export const BLOB_TEX = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const BLOB_G = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export function blobShadow(size, op) { const m = new THREE.Mesh(BLOB_G, new THREE.MeshBasicMaterial({ map: BLOB_TEX, color: 0x000000, transparent: true, opacity: op, depthWrite: false })); m.scale.setScalar(size); m.renderOrder = 1; m.position.y = 0.02; scene.add(m); return m; }
export const cylZ = (r, len, mat, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg || 10), mat); m.rotation.x = Math.PI / 2; m.castShadow = true; return m; };
// Merge many small static pieces into as few meshes as possible, so a detailed model costs a handful of draw calls.
// Plain lit colours are baked into vertex colours and share one material; anything else (glows, double-sided or
// see-through materials, or the ones in opt.live that get recoloured at runtime) is merged per material.
// The pieces can sit anywhere under parent; the merged meshes are added to parent and flagged userData.fine
// (outlines and x-ray rims skip them, since their scaled-hull trick only works on single boxes).
const _mergeM = new THREE.Matrix4();
let BAKED_M = null;
// ---- a far version of a detailed model (a gun: opt.lod), that looks the same but is made of far fewer triangles,
// drawn instead once it's too small on screen for the difference to show. Each piece's own far shape (loGeo): a round
// part (a barrel, a knob, a ring, a lathe-turned grip) with fewer sides, a curved outline drawn with fewer points, a
// stock bent along the gun in coarser slices (weapons/gun-parts.js taperX), and the stippling's dots and the checkering's
// lines (weapons/gun-parts.js) left off, the panel under them still there. A far shape that doesn't come out the same
// size as the near one (the near one moved or bent once it was made) isn't used: the piece goes as it is
const LO_GEO = new WeakMap();
// the far shape of g: another geometry, or null to leave the piece off (weapons/gun-parts.js gives its own)
export const setLo = (g, lo) => { LO_GEO.set(g, lo); return g; };
// the far shape given to g, if one was (a figure's, swapped in as it gets small: effects/lod.js)
export const farOf = g => LO_GEO.get(g);
const LO_SEG = { k: 0.5, min: 8, tube: 4, curve: 3, fit: 1e-4, line: 0.0005 };   // (line: how far a profile's far outline may stray from its own, metres)
function loGeo(g) {
  if (LO_GEO.has(g)) return LO_GEO.get(g);
  const p = g.parameters, T = g.type, half = n => Math.max(LO_SEG.min, Math.round(n * LO_SEG.k)); let lo = g;
  try {
    if (T === 'CylinderGeometry' && p.radialSegments > LO_SEG.min) lo = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, half(p.radialSegments), p.heightSegments, p.openEnded, p.thetaStart, p.thetaLength);
    else if (T === 'LatheGeometry' && p.segments > LO_SEG.min) lo = new THREE.LatheGeometry(p.points, half(p.segments), p.phiStart, p.phiLength);
    else if (T === 'SphereGeometry' && p.widthSegments > LO_SEG.min) lo = new THREE.SphereGeometry(p.radius, half(p.widthSegments), Math.max(6, Math.round(p.heightSegments * LO_SEG.k)), p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
    else if (T === 'TorusGeometry' && (p.tubularSegments > 12 || p.radialSegments > LO_SEG.tube)) lo = new THREE.TorusGeometry(p.radius, p.tube, Math.min(p.radialSegments, LO_SEG.tube), Math.max(8, Math.round(p.tubularSegments * LO_SEG.k)), p.arc);
    else if (T === 'ExtrudeGeometry') {
      // (its outline and holes with only the points a curve needs at this size, LO_SEG.line, and its bevel one step round)
      const thin = P => { if (P.length < 6) return P; let k = 1, far = -1; P.forEach((q, i) => { const d = q.distanceToSquared(P[0]); if (d > far) { far = d; k = i; } }); const L = [...simplifyLine(P.slice(0, k + 1), LO_SEG.line), ...simplifyLine([...P.slice(k), P[0]], LO_SEG.line).slice(1, -1)]; return L.length >= 3 ? L : P; };
      const shapes = (Array.isArray(p.shapes) ? p.shapes : [p.shapes]).map(sh => { const e = sh.extractPoints(LO_SEG.curve), o = new THREE.Shape(thin(e.shape)); e.holes.forEach(h => o.holes.push(new THREE.Path(thin(h)))); return o; });
      lo = new THREE.ExtrudeGeometry(shapes, Object.assign({}, p.options, { curveSegments: LO_SEG.curve, bevelSegments: Math.min(p.options.bevelSegments ?? 3, 1) }));
    }
  } catch (e) { lo = g; }
  if (lo !== g) { const f = loFit(lo, g); if (f !== lo) lo.dispose(); lo = f || g; }
  LO_GEO.set(g, lo); return lo;
}
// a far shape made again from g's own make (its parameters) put where g is, if it's g with fewer sides; else null. g may
// have been moved since it was made, and turned a quarter (a lathe-turned part laid along the gun): each way round is
// tried, by its box's size, and then its points checked against g's (a sample of them, each within a few percent of
// the part's size of one of g's: fewer sides only drops points round a curve, or moves them along it a little), which
// tells apart the ways round a box alone can't. Bent or turned any other way, it isn't used
const LO_FIT = { size: 0.02, near: 0.03, n: 40 }, _loS = new THREE.Vector3(), _loS2 = new THREE.Vector3(), _loM = new THREE.Matrix4();
const LO_TURNS = [[0, 0, 0], [Math.PI / 2, 0, 0], [-Math.PI / 2, 0, 0], [0, 0, Math.PI / 2], [0, 0, -Math.PI / 2], [0, Math.PI / 2, 0], [0, -Math.PI / 2, 0], [Math.PI, 0, 0]];
function loFit(lo, g) {
  const tri = q => (q.index ? q.index.count : q.attributes.position.count); if (tri(lo) >= tri(g)) return null;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox, diag = b.getSize(_loS).length(), tol = LO_FIT.size * diag + LO_SEG.fit, B = g.attributes.position.array, lim = (LO_FIT.near * diag + LO_SEG.fit) ** 2;
  for (const [rx, ry, rz] of LO_TURNS) {
    const q = rx || ry || rz ? lo.clone().applyMatrix4(_loM.makeRotationFromEuler(new THREE.Euler(rx, ry, rz))) : lo;
    q.computeBoundingBox(); q.boundingBox.getSize(_loS2);
    if (Math.abs(_loS.x - _loS2.x) > tol || Math.abs(_loS.y - _loS2.y) > tol || Math.abs(_loS.z - _loS2.z) > tol) { if (q !== lo) q.dispose(); continue; }
    q.translate(b.min.x - q.boundingBox.min.x, b.min.y - q.boundingBox.min.y, b.min.z - q.boundingBox.min.z);
    const A = q.attributes.position.array, step = Math.max(1, Math.floor(A.length / 3 / LO_FIT.n)); let ok = true;
    for (let i = 0; i < A.length / 3 && ok; i += step) {
      let best = Infinity; const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2];
      for (let j = 0; j < B.length && best > 1e-12; j += 3) { const dx = B[j] - x, dy = B[j + 1] - y, dz = B[j + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < best) best = d; }
      ok = best <= lim;
    }
    if (ok) return q;
    if (q !== lo) q.dispose();
  }
  return null;
}
// a near and a far version of one folded mesh, whichever suits how big it is on screen, for whichever camera is
// drawing it (the overhead view's, your own eyes', a scope's): the far one once the whole model it's part of (its span,
// userData.lodSpan, metres: a gun's every piece goes over together) is under LOD_GUN.px across (with a little give
// either side, band, so it doesn't flick between them right at the edge). Copied whole (a stowed gun is a copy of the
// one in your hands): its two levels come with it
const LOD_GUN = { px: 150, band: 0.12, save: 0.85 }, _lgV = new THREE.Vector3(), _lgB = new THREE.Box3(), _lgB2 = new THREE.Box3(), _lgM = new THREE.Matrix4(), _lgI = new THREE.Matrix4();
// how far a model reaches across (its box's diagonal, metres, in its own frame)
export function spanOf(root) {
  root.updateWorldMatrix(true, true); _lgI.copy(root.matrixWorld).invert(); _lgB.makeEmpty();
  root.traverse(o => { if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); _lgB.union(_lgB2.copy(g.boundingBox).applyMatrix4(_lgM.multiplyMatrices(_lgI, o.matrixWorld))); });
  return _lgB.isEmpty() ? 0 : _lgB.getSize(_lgV).length();
}
class FarLOD extends THREE.LOD {
  update(c) {
    const L = this.levels; if (L.length < 2) return;
    this.getWorldPosition(_lgV); const span = this.userData.lodSpan * this.matrixWorld.getMaxScaleOnAxis();
    const ppm = c.isPerspectiveCamera ? (innerHeight / 2) / Math.tan(c.getEffectiveFOV() * Math.PI / 360) / Math.max(0.05, _lgV.distanceTo(c.position)) : innerHeight * c.zoom / (c.top - c.bottom);
    const px = span * ppm, far = this._currentLevel === 1 ? px < LOD_GUN.px * (1 + LOD_GUN.band) : px < LOD_GUN.px * (1 - LOD_GUN.band);
    this._currentLevel = far ? 1 : 0; L[0].object.visible = !far; L[1].object.visible = far;
  }
}
export function mergeInto(parent, list, opt) {
  const live = (opt && opt.live) || null, noBake = !!(opt && opt.noBake), lod = !!(opt && opt.lod), span = (opt && opt.span) || (lod ? spanOf(parent) : 0);
  parent.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert(), groups = new Map(), out = [];
  const bakeable = m => !noBake && m.isMeshLambertMaterial && !m.transparent && !m.map && m.side === THREE.FrontSide && !m.vertexColors && m.customProgramCacheKey && m.customProgramCacheKey() === 'lit' && !(live && live.has(m));
  list.forEach(o => {
    const bake = bakeable(o.material), k = (bake ? 'baked' : o.material.uuid) + (o.castShadow ? '+' : '-');
    if (!groups.has(k)) groups.set(k, { mat: o.material, bake, cast: o.castShadow, parts: [] });
    groups.get(k).parts.push(o);
  });
  // the pieces of a group as one geometry (far: each piece's far shape, loGeo, those with none left off)
  const merged = (parts, bake, far) => {
    const pos = [], nor = [], col = []; let n = 0;
    parts.forEach(o => {
      const src = far ? loGeo(o.geometry) : o.geometry; if (!src) return;
      const g = src.index ? src.toNonIndexed() : src.clone();
      g.applyMatrix4(_mergeM.multiplyMatrices(inv, o.matrixWorld));
      const a = g.attributes.position.array; pos.push(a); nor.push(g.attributes.normal.array); n += a.length;
      if (bake) { const c = o.material.color, cs = new Float32Array(a.length); for (let i = 0; i < a.length; i += 3) { cs[i] = c.r; cs[i + 1] = c.g; cs[i + 2] = c.b; } col.push(cs); }
      g.dispose();
    });
    const P = new Float32Array(n), N = new Float32Array(n), C = bake ? new Float32Array(n) : null; let at = 0;
    pos.forEach((a, k) => { P.set(a, at); N.set(nor[k], at); if (C) C.set(col[k], at); at += a.length; });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (C) geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    return geo;
  };
  groups.forEach(({ mat, bake, cast, parts }) => {
    const mk = geo => { const m = new THREE.Mesh(geo, bake ? (BAKED_M || (BAKED_M = lam(0xffffff, { vertexColors: true }))) : mat); m.castShadow = cast; m.receiveShadow = true; m.userData.fine = true; return m; };
    const m = mk(merged(parts, bake, false));
    // (a far version only where it saves a fair part of the near one's triangles: LOD_GUN.save)
    const lo = lod && parts.some(o => loGeo(o.geometry) !== o.geometry) ? merged(parts, bake, true) : null;
    if (lo && lo.attributes.position.count < LOD_GUN.save * m.geometry.attributes.position.count) { const L = new FarLOD(); L.userData.lodSpan = span; L.addLevel(m, 0); L.addLevel(mk(lo), 1); parent.add(L); }
    else { if (lo) lo.dispose(); parent.add(m); }
    out.push(m);
  });
  list.forEach(o => { if (o.parent) o.parent.remove(o); });
  return out;
}
// pieces too small for their shadow to show from up here (an eye, a button, a buckle, a gun's pin) cast none: on a figure
// of loose pieces each would be a draw of its own in the sun's shadow pass. Folded meshes keep theirs (a piece folded in
// costs nothing there)
const _tsV = new THREE.Vector3();
export function trimShadows(root, r) {
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
export function foldPieces(root, stop, opt) {
  const parts = [], see = !!(opt && opt.see);
  (function walk(o) { o.children.forEach(c => { if ((stop && stop.has(c)) || !c.visible || Object.keys(c.userData).length) return; if (foldable(c, see)) parts.push(c); walk(c); }); })(root);
  // (a piece with children of its own keeps its place, for them: only childless ones fold)
  const list = parts.filter(c => !c.children.length);
  return list.length > 1 ? mergeInto(root, list, { noBake: true, lod: !!(opt && opt.lod), span: opt && opt.span }) : [];
}
// every mesh under g except the ones flagged userData.sil (kept whole for outlines) and anything under a stop node
export function finePieces(g, stop) {
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
export function unfight(root, opt) {
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
// a point round a rounded-off rectangle (half sizes ax, ay, corners r), u of the way round it from the middle of its
// +x side, counter-clockwise: out = [x, y, outward x, outward y] (an arm's section: a bandage's turns, a band round a
// wrist)
export function roundRectAt(u, ax, ay, r, out) {
  const sx = 2 * (ax - r), sy = 2 * (ay - r), arc = Math.PI * r / 2, L = 2 * sx + 2 * sy + 4 * arc;
  let s = (((u % 1) + 1) % 1) * L + sy / 2;   // (started from the middle of the side)
  const side = [sy, arc, sx, arc, sy, arc, sx, arc], cx = ax - r, cy = ay - r;
  let k = 0; while (k < 7 && s > side[k]) { s -= side[k]; k++; }
  if (k === 8) k = 0;
  const f = side[k] ? s / side[k] : 0, a = (Math.floor(k / 2) + f) * Math.PI / 2;
  switch (k) {
    case 0: out[0] = ax; out[1] = -cy + sy * f; out[2] = 1; out[3] = 0; break;
    case 2: out[0] = cx - sx * f; out[1] = ay; out[2] = 0; out[3] = 1; break;
    case 4: out[0] = -ax; out[1] = cy - sy * f; out[2] = -1; out[3] = 0; break;
    case 6: out[0] = -cx + sx * f; out[1] = -ay; out[2] = 0; out[3] = -1; break;
    default: { const c = [[cx, cy], , [-cx, cy], , [-cx, -cy], , [cx, -cy]][k - 1]; out[0] = c[0] + Math.cos(a) * r; out[1] = c[1] + Math.sin(a) * r; out[2] = Math.cos(a); out[3] = Math.sin(a); }
  }
  return out;
}
// how far round a rounded-off rectangle it is
export const roundRectLen = (ax, ay, r) => 4 * (ax - r) + 4 * (ay - r) + 2 * Math.PI * r;
// a band round it: a rounded-off rectangular ring (inside half sizes ax, ay, corners r) thick, len long along z and
// centred on 0, its edges softly rounded over (kept, one for each size)
const ringCache = {};
export function roundRing(ax, ay, r, len, thick) {
  const k = [ax, ay, r, len, thick].map(v => v.toFixed(4)).join(',');
  if (ringCache[k]) return ringCache[k];
  const sh = (hx, hy, rr, hole) => { const s = hole ? new THREE.Path() : new THREE.Shape(); s.moveTo(-hx + rr, -hy); s.lineTo(hx - rr, -hy); s.quadraticCurveTo(hx, -hy, hx, -hy + rr); s.lineTo(hx, hy - rr); s.quadraticCurveTo(hx, hy, hx - rr, hy); s.lineTo(-hx + rr, hy); s.quadraticCurveTo(-hx, hy, -hx, hy - rr); s.lineTo(-hx, -hy + rr); s.quadraticCurveTo(-hx, -hy, -hx + rr, -hy); return s; };
  const bv = Math.min(thick * 0.35, len * 0.3), o = sh(ax + thick - bv, ay + thick - bv, r + thick - bv);
  o.holes.push(sh(ax + bv, ay + bv, r + bv, true));
  const g = new THREE.ExtrudeGeometry(o, { depth: Math.max(1e-4, len - 2 * bv), bevelEnabled: true, bevelThickness: bv, bevelSize: bv * 0.9, bevelSegments: 2, curveSegments: 5 });
  g.translate(0, 0, -(len - 2 * bv) / 2); sharedGeo.add(g);
  return ringCache[k] = g;
}
