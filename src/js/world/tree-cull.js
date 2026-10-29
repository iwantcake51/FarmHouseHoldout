// The woods drawn as little as they can be. Every tree in a forest (world/trees.js: plantForest) is kept in a list of
// its own, and each frame only the ones the camera can see go into the instanced mesh that draws them (cullForests,
// before the frame: effects/post.js): those in the view (the whole forest was one mesh, drawn whole if any of it showed),
// and, from your own eyes, not those hidden behind nearer trees. That's worked out on a small depth picture of the
// view (OCC): nearest first, each tree that shows paints the solid heart of its crown into it (a box well inside its
// boughs, never past their edge, so nothing is ever left out that you'd have seen through the gaps), and a tree whose
// whole outline on the picture is behind what's painted there is left out.
// Their shadows don't go with them: a tree out of sight still throws its shadow into view. The trees in reach of the
// sun's shadows cast from a second mesh of all of them that only the shadow map draws (shadowOnly), and those beyond its
// reach lay a soft shadow on the ground away from the sun instead (sunShadows), kept turned with the sun as the day goes.

import { scene, sun, V3 } from '../core/renderer.js';
import { BLOB_TEX } from '../core/geometry.js';

const FORESTS = [];
// a mesh drawn only into the shadow map: left out of the frame (three.js asks it whether it's in view: it says no) and
// put in again for the shadow map's own look round the scene. SH_PASS.on is set by the first thing the shadow map draws
// (a mesh with nothing in it, the scene's first child) and cleared as each frame's drawing starts
const SH_PASS = { on: false };
{
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const flag = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); flag.castShadow = true; flag.frustumCulled = false;
  flag.onBeforeShadow = () => { SH_PASS.on = true; };
  scene.add(flag); scene.children.unshift(scene.children.pop());   // (first, so it's drawn before anything it's for)
  scene.onBeforeRender = () => { SH_PASS.on = false; };
}
function shadowOnly(m) { m.intersectsFrustum = f => SH_PASS.on && f.intersectsObject(m); return m; }
// the depth picture: cells across (its height by the view's shape); a crown's solid heart, as parts of how far its boughs
// reach (r) and how tall it is (up its crown from where the boughs start: y0 to y1); a tree nearer than near of its
// reach is never hidden (you're in among its boughs)
// (each tree's solid heart is its model's own: userData.solid, boxes standing inside its crown, world/trees.js)
const OCC = { w: 192, near: 2.5 };
let occD = null, occW = 0, occH = 0;
// a forest: trees [x, z, scale, variant, turn], one instanced mesh per variant into into, in mat; shadows: whether they
// cast in the shadow map (from their copy that only it draws). Each tree's lean and colour from tint (tilt(), col(c)),
// dealt in the order the woods were always dealt in
const _tcFo = new THREE.Object3D(), _tcFc = new THREE.Color();
export function plantForest(list, shadows, into, mat, tint) {
  const vars = [...new Set(list.map(t => t[3]))];
  vars.forEach(v => {
    const mine = list.filter(t => t[3] === v), n = mine.length, mats = new Float32Array(n * 16), cols = new Float32Array(n * 3), at = new Float32Array(n * 3);
    if (!v.g.boundingBox) v.g.computeBoundingBox(); const top = v.g.boundingBox.max.y;
    mine.forEach(([x, z, s, , r], k) => {
      _tcFo.position.set(x, 0, z); _tcFo.rotation.set(tint.tilt(), r, tint.tilt()); _tcFo.scale.setScalar(s); _tcFo.updateMatrix(); _tcFo.matrix.toArray(mats, k * 16);
      tint.col(_tcFc).toArray(cols, k * 3); at[k * 3] = x; at[k * 3 + 1] = z; at[k * 3 + 2] = s;
    });
    const mk = cast => {
      const im = new THREE.InstancedMesh(v.g, mat, n); im.instanceMatrix.array.set(mats); im.instanceColor = new THREE.InstancedBufferAttribute(cols.slice(), 3);
      im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); into.add(im); return im;
    };
    const vis = mk(false), F = { v, n, mats, cols, at, vis, top, r: v.r, solid: v.g.userData.solid || [], shown: new Int32Array(n), nShown: n, into };
    for (let k = 0; k < n; k++) F.shown[k] = k;
    if (shadows) F.sh = shadowOnly(mk(true));
    FORESTS.push(F);
  });
}
// ---- each frame: which trees show
const _tcFr = new THREE.Frustum(), _tcPM = new THREE.Matrix4(), _tcSp = new THREE.Sphere(), _tcCP = new V3(), _tcList = [];
export function cullForests(c) {
  c.updateMatrixWorld(); _tcPM.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); _tcFr.setFromProjectionMatrix(_tcPM);
  c.getWorldPosition(_tcCP);
  const occ = c.isPerspectiveCamera; if (occ) occStart(c);
  // every tree in view, from every forest that's drawn (the far woods only from your own eyes)
  _tcList.length = 0;
  for (const F of FORESTS) {
    F.next = F.next || new Int32Array(F.n); F.nn = 0;
    if (!tcShown(F.into)) continue;
    const h = F.top;
    for (let k = 0; k < F.n; k++) {
      const x = F.at[k * 3], z = F.at[k * 3 + 1], s = F.at[k * 3 + 2];
      _tcSp.center.set(x, h * 0.5 * s, z); _tcSp.radius = Math.hypot(F.r * s, h * 0.5 * s);
      if (!_tcFr.intersectsSphere(_tcSp)) continue;
      if (!occ) { F.next[F.nn++] = k; continue; }
      _tcList.push(F, k, Math.hypot(x - _tcCP.x, z - _tcCP.z), 0);
    }
  }
  if (occ) {
    // nearest first: each one tested against what's nearer, then (if it shows) painting its heart in for those behind
    const ord = Array.from({ length: _tcList.length / 4 }, (_, i) => i).sort((a, b) => _tcList[a * 4 + 2] - _tcList[b * 4 + 2]);
    for (const i of ord) {
      const F = _tcList[i * 4], k = _tcList[i * 4 + 1], d = _tcList[i * 4 + 2];
      const x = F.at[k * 3], z = F.at[k * 3 + 1], s = F.at[k * 3 + 2];
      if (d > OCC.near * F.r * s && occHidden(x, z, s, F, d)) continue;
      F.next[F.nn++] = k;
      if (d > OCC.near * F.r * s) occPaint(x, z, s, F, d);
    }
  }
  // what's drawn: only rewritten when it's changed
  for (const F of FORESTS) {
    if (!tcShown(F.into)) continue;
    let same = F.nn === F.nShown; if (same) for (let i = 0; i < F.nn; i++) if (F.next[i] !== F.shown[i]) { same = false; break; }
    if (same) continue;
    const M = F.vis.instanceMatrix.array, C = F.vis.instanceColor.array;
    for (let i = 0; i < F.nn; i++) { const k = F.next[i]; F.shown[i] = k; M.set(F.mats.subarray(k * 16, k * 16 + 16), i * 16); C.set(F.cols.subarray(k * 3, k * 3 + 3), i * 3); }
    F.nShown = F.nn; F.vis.count = F.nn; F.vis.instanceMatrix.needsUpdate = true; F.vis.instanceColor.needsUpdate = true;
  }
}
const tcShown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
// ---- the depth picture, in cells: how far (from the camera, metres) the nearest solid crown in each one is
const _tcVP = new THREE.Matrix4();
function occStart(c) {
  const w = OCC.w, h = Math.max(8, Math.round(w / (c.aspect || 1.6)));
  if (!occD || occW !== w || occH !== h) { occD = new Float32Array(w * h); occW = w; occH = h; }
  occD.fill(Infinity); _tcVP.copy(_tcPM);
}
// a point (x, y, z) on the picture: its cell across and down (fractional), or null behind the camera
function tcProj(x, y, z, out) {
  const e = _tcVP.elements, cw = e[3] * x + e[7] * y + e[11] * z + e[15]; if (cw < 0.05) return false;
  out.x = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw * 0.5 + 0.5) * occW; out.y = (0.5 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw * 0.5) * occH; return true;
}
const _tcA = { x: 0, y: 0 }, _tcB = { x: 0, y: 0 }, _tcC = { x: 0, y: 0 }, _tcD = { x: 0, y: 0 };
// a tree's whole outline on the picture (its upright box across the view, its full reach either side, ground to top),
// grown out to whole cells; hidden if every cell of it has something nearer in it than the tree's nearest point
function occHidden(x, z, s, F, d) {
  const R = F.r * s * 1.05, top = F.top * s * 1.02, sx = -(z - _tcCP.z) / d, sz = (x - _tcCP.x) / d;   // (across the view at the tree)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [u, y] of [[-1, 0], [1, 0], [-1, top], [1, top]]) for (const f of [-1, 1]) {
    const px = x + sx * R * u + (x - _tcCP.x) / d * R * f, pz = z + sz * R * u + (z - _tcCP.z) / d * R * f;
    if (!tcProj(px, y, pz, _tcA)) return false;
    x0 = Math.min(x0, _tcA.x); x1 = Math.max(x1, _tcA.x); y0 = Math.min(y0, _tcA.y); y1 = Math.max(y1, _tcA.y);
  }
  const i0 = Math.max(0, Math.floor(x0)), i1 = Math.min(occW - 1, Math.floor(x1)), j0 = Math.max(0, Math.floor(y0)), j1 = Math.min(occH - 1, Math.floor(y1));
  if (i0 > i1 || j0 > j1) return false;
  const near = d - R;
  for (let j = j0; j <= j1; j++) { const row = j * occW; for (let i = i0; i <= i1; i++) if (!(occD[row + i] < near)) return false; }
  return true;
}
// a tree's solid heart painted in: each of its boxes flat across the view at its far side, only the cells it covers whole
function occPaint(x, z, s, F, d) {
  const sx = -(z - _tcCP.z) / d, sz = (x - _tcCP.x) / d;
  for (const [y0, y1, hw] of F.solid) occBox(x, z, sx, sz, y0 * s, y1 * s, hw * s, d + hw * s);
}
function occBox(x, z, sx, sz, ya, yb, w, far) {
  // (its four corners on the picture, and the box inside all of them: looking up or down, or the view rolled, the box
  // across the view is a little off square there)
  if (!tcProj(x - sx * w, ya, z - sz * w, _tcA) || !tcProj(x + sx * w, ya, z + sz * w, _tcB) || !tcProj(x - sx * w, yb, z - sz * w, _tcC) || !tcProj(x + sx * w, yb, z + sz * w, _tcD)) return;
  const lf = _tcA.x < _tcB.x, L0 = lf ? _tcA : _tcB, R0 = lf ? _tcB : _tcA, L1 = lf ? _tcC : _tcD, R1 = lf ? _tcD : _tcC;
  const xl = Math.max(L0.x, L1.x), xr = Math.min(R0.x, R1.x), yt = Math.max(L1.y, R1.y), yd = Math.min(L0.y, R0.y);
  const i0 = Math.max(0, Math.ceil(xl)), i1 = Math.min(occW - 1, Math.floor(xr) - 1), j0 = Math.max(0, Math.ceil(yt)), j1 = Math.min(occH - 1, Math.floor(yd) - 1);
  for (let j = j0; j <= j1; j++) { const row = j * occW; for (let i = i0; i <= i1; i++) if (occD[row + i] > far) occD[row + i] = far; }
}
// ---- soft shadows on the ground for trees past the reach of the sun's: a long soft shape from the trunk away from the
// sun, as long as the tree's height over the sun's tan (no longer than long of its height), as wide as its crown, darker
// the stronger the sun (dark at most), turned with it whenever it's moved a little (turn, radians)
const SUN_SH = { long: 3.2, dark: 0.34, turn: 0.015, low: 0.12 };
const SUN_SH_TEX = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  // (narrow at the trunk, widest a third of the way out, tapering to the crown's tip, soft all round)
  x.filter = 'blur(6px)'; x.fillStyle = '#fff'; x.beginPath(); x.moveTo(32, 118); x.bezierCurveTo(4, 96, 6, 40, 32, 10); x.bezierCurveTo(58, 40, 60, 96, 32, 118); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
})();
const SUN_SH_G = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), SUN_SHADOWS = [];
export function sunShadows(list, into) {
  if (!list.length) return;
  const m = new THREE.InstancedMesh(SUN_SH_G, new THREE.MeshBasicMaterial({ map: SUN_SH_TEX, alphaMap: SUN_SH_TEX, color: 0x000000, transparent: true, opacity: SUN_SH.dark, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), list.length);
  m.renderOrder = 1; m.frustumCulled = false; into.add(m);
  SUN_SHADOWS.push({ m, list: list.map(([x, z, s, v]) => [x, z, s * (v.g.boundingBox || (v.g.computeBoundingBox(), v.g.boundingBox)).max.y, v.r * s * 2]), az: NaN, el: NaN });
}
const _tcSo = new THREE.Object3D(), _tcSd = new V3();
export function stepSunShadows() {
  if (!SUN_SHADOWS.length) return;
  _tcSd.copy(sun.position).sub(sun.target.position).normalize();
  const el = Math.asin(Math.max(-1, Math.min(1, _tcSd.y))), az = Math.atan2(_tcSd.x, _tcSd.z), on = el > SUN_SH.low;
  for (const S of SUN_SHADOWS) {
    S.m.visible = on; if (!on) continue;
    S.m.material.opacity = SUN_SH.dark * Math.min(1, sun.intensity / Math.PI / 0.6) * Math.min(1, (el - SUN_SH.low) / 0.15);
    if (Math.abs(az - S.az) < SUN_SH.turn && Math.abs(el - S.el) < SUN_SH.turn) continue;
    S.az = az; S.el = el; const len = 1 / Math.tan(el);
    S.list.forEach(([x, z, h, w], k) => {
      _tcSo.position.set(x, 0.02, z); _tcSo.rotation.set(0, az + Math.PI, 0); _tcSo.scale.set(w, 1, Math.min(h * len, h * SUN_SH.long)); _tcSo.updateMatrix(); S.m.setMatrixAt(k, _tcSo.matrix);
    });
    S.m.instanceMatrix.needsUpdate = true;
  }
}
// a soft dark pool of shade under each tree, as wide as its crown (as the farm's own have: world/trees.js)
export function shadePools(list, into) {
  if (!list.length) return;
  const ao = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: BLOB_TEX, color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }), list.length);
  list.forEach(([x, z, s, v], k) => { _tcSo.position.set(x, 0.015, z); _tcSo.rotation.set(0, 0, 0); _tcSo.scale.setScalar((v.shade || v.r * 3.2) * s); _tcSo.updateMatrix(); ao.setMatrixAt(k, _tcSo.matrix); });
  ao.renderOrder = 1; into.add(ao);
}
