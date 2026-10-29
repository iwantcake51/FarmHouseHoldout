// Everything that stands still drawn only when it could be seen. From your own eyes (or the free camera) the house's
// outer walls are painted into the woods' depth picture (world/tree-cull.js) before the trees, so the trees behind the
// house are left out too; then, with the trees painted in as well, every piece of the house, its furniture and the
// yard's props is tested against it: one wholly behind a wall or a crown is left out of the frame. A wall's painted as
// the faces of its runs of wall cells (window and door cells are left out of them, so what's seen through an opening
// is always drawn), only where a face covers a cell whole, at the far end of it: never anything left out that shows.
// And from any view, a piece smaller on screen than VIEW_CULL.px is left out (an hinge, a nail, a screw far off): what
// size it is on screen comes from the camera's own field of view, so with a wide one small things far off go sooner,
// as they look smaller. What's out of the view altogether, behind you or off to the side, three.js leaves out as ever,
// from the same camera.
// Only the frame drawn from the camera it was worked out for: not the shadow map (the sun sees what you can't), not a
// scope's view.

import { scene } from '../core/renderer.js';
import { N } from '../core/math.js';
import { cell, cxw, WALL } from './grid.js';
import { walls } from './house.js';
import { occBoxHidden, occFace, OCC_HOOK, SH_PASS } from './tree-cull.js';

// a wall's solid part, up from the foundation (y0) to under its top (y1), and in from the cell's edges (inset); how
// often (frames) the pieces are looked over again for anything new or moved; the smallest a piece may be on screen
// (its radius, pixels)
const VIEW_CULL = { y0: 0.25, y1: 2.25, inset: 0.45, scan: 60, px: 0.6 };
const VC = { list: [], f: 1e9, frame: 0, cam: null, culled: 0 };
const _vwS = new THREE.Vector3();
// the pieces to test: every mesh under something marked still, but not under something that moves (an opening's boards,
// a door), each with its box in the world and its size, as they stand now
function vcGather() {
  const out = [];
  for (const r of scene.children) {
    if (!r.userData.still) continue;
    r.updateMatrixWorld(true);
    (function walk(o) {
      if (o.userData.moving) return;
      if (o.isMesh && o.geometry && o.geometry.attributes.position && o.frustumCulled !== false) {
        const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); if (!g.boundingSphere) g.computeBoundingSphere();
        let e = o.__vc; if (!e) { e = o.__vc = { o, box: new THREE.Box3(), r: 0, f: -1 }; o.intersectsFrustum = vcFrustum; }
        vcMeasure(e); out.push(e);
      }
      o.children.forEach(walk);
    })(r);
  }
  VC.list = out;
}
// its box and size as it stands (and where it stood, to see it's moved: a piece on a rack picked up, a part swung)
function vcMeasure(e) {
  const o = e.o, g = o.geometry, m = o.matrixWorld.elements;
  e.box.copy(g.boundingBox).applyMatrix4(o.matrixWorld); o.getWorldScale(_vwS); e.r = g.boundingSphere.radius * Math.max(Math.abs(_vwS.x), Math.abs(_vwS.y), Math.abs(_vwS.z));
  e.m = [m[0], m[5], m[10], m[12], m[13], m[14]];
}
// (three.js asks each mesh whether it's in view: one left out this frame says no, for the camera it was left out for)
function vcFrustum(f) { const e = this.__vc; if (e && e.f === VC.frame && SH_PASS.cam === VC.cam && !SH_PASS.on) return false; return f.intersectsObject(this); }
// the walls into the picture: each run of wall cells along a row or down a column, its two long faces
const _vcRun = new Uint8Array(N * N);
function vcPaint(cp) {
  _vcRun.fill(0);
  let any = false; for (const w of walls) if (w.g.visible && cell[w.k] === WALL) { _vcRun[w.k] = 1; any = true; }
  if (!any) return;
  const V = VIEW_CULL, hd = (x, z) => Math.hypot(x - cp.x, z - cp.z);
  const face = (ax, az, bx, bz) => occFace(ax, az, bx, bz, V.y0, V.y1, Math.max(hd(ax, az), hd(bx, bz)));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i; if (!_vcRun[k]) continue;
    // along the row from here, if this is where a run starts
    if (i === 0 || !_vcRun[k - 1]) { let e = i; while (e + 1 < N && _vcRun[k + e + 1 - i]) e++; const x0 = cxw(i) - V.inset, x1 = cxw(e) + V.inset, z = cxw(j); face(x0, z - V.inset, x1, z - V.inset); face(x0, z + V.inset, x1, z + V.inset); }
    // and down the column
    if (j === 0 || !_vcRun[k - N]) { let e = j; while (e + 1 < N && _vcRun[(e + 1) * N + i]) e++; const z0 = cxw(j) - V.inset, z1 = cxw(e) + V.inset, x = cxw(i); face(x - V.inset, z0, x - V.inset, z1); face(x + V.inset, z0, x + V.inset, z1); }
  }
}
// every piece tested: too small to see from here, or (from your own eyes) wholly behind what's painted
function vcTest(c, occ, fr, cp) {
  if (++VC.f >= VIEW_CULL.scan) { VC.f = 0; vcGather(); }
  VC.frame++; VC.cam = c; VC.culled = 0;
  const ppm = c.isPerspectiveCamera ? innerHeight / 2 / Math.tan(c.getEffectiveFOV() * Math.PI / 360) : innerHeight * c.zoom / (c.top - c.bottom);
  for (const e of VC.list) {
    const m = e.o.matrixWorld.elements; if (m[12] !== e.m[3] || m[13] !== e.m[4] || m[14] !== e.m[5] || m[0] !== e.m[0] || m[5] !== e.m[1] || m[10] !== e.m[2]) vcMeasure(e);
    const b = e.box;
    // (how far it is across the ground from the camera, to its nearest point)
    const dx = Math.max(b.min.x - cp.x, 0, cp.x - b.max.x), dz = Math.max(b.min.z - cp.z, 0, cp.z - b.max.z), near = Math.hypot(dx, dz);
    let out = false;
    if (c.isPerspectiveCamera) { const dy = Math.max(b.min.y - cp.y, 0, cp.y - b.max.y), d = Math.hypot(near, dy); out = d > 0.5 && e.r * ppm / d < VIEW_CULL.px; }
    else out = e.r * ppm < VIEW_CULL.px;
    if (!out && occ && near > 0.5 && fr.intersectsBox(b)) out = occBoxHidden(b, near);
    if (out) { e.f = VC.frame; VC.culled++; }
  }
}
OCC_HOOK.paint = vcPaint; OCC_HOOK.test = vcTest;
