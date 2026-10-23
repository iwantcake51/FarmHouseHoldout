// The sun's shadows of everything that stands still, drawn in one go. The house's walls, its roofs and porch, the
// furniture and the yard's props are hundreds of meshes, and each was its own draw into the shadow map every frame:
// here they're copied, as they stand in the world, into one mesh a side (STILL_SH.proxies) that only the shadow map
// ever draws (it's hidden for everything else: the frame, the outlines' mask, the post passes), and the originals stop
// casting. What counts: whatever's under a scene object marked userData.still (the house's cells, the roofs, the
// porch, the furniture, the yard's props), less anything under one marked userData.moving (an opening's boards, the
// doors between rooms, a door's broken pieces).
//
// It keeps itself right: before each shadow draw every mesh it copied is checked, and one that's moved, changed shape
// or started casting on its own again goes back to casting itself for good (a gun on the rack, a part swung on a
// hinge), and one shown or hidden (the walls of this run's footprint, the sawhorse swapped for the metal bench) is
// copied in or left out again. Every STILL_SH.scan frames whatever's under the marked objects is looked over again,
// for anything new to take in. A new floor plan moves the furniture and the props on purpose: stillShadowsReset (from
// world/interior.js: houseLayout) takes them as they're left, rather than as having moved.

import { R, scene } from './renderer.js';

const STILL_SH = { scan: 90, f: 0, srcs: [], proxies: [], mine: new WeakSet(), moved: new WeakSet(), flips: new WeakMap(), dirty: true, reset: false };
const STILL_SIDE = { 0: THREE.BackSide, 1: THREE.FrontSide, 2: THREE.DoubleSide };   // (the face each side of a material casts from, as three.js draws shadows)
export function stillShadowsReset() { STILL_SH.reset = true; }
const _stillV = new THREE.Vector3();
// whether a mesh is drawn at all: it and every one above it shown, all the way up to the scene
function shownInScene(o) { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; } return false; }
// a mesh that can go in: drawn, casting (or put out of casting by this), a plain material, not one drawn in copies or
// bent by bones, and not one seen to move
function stillOk(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || STILL_SH.moved.has(o) || !(o.castShadow || STILL_SH.mine.has(o))) return false;
  const m = o.material, g = o.geometry;
  if (!m || Array.isArray(m) || !m.visible || m.alphaTest > 0 || o.customDepthMaterial || !g || !g.attributes.position || (g.morphAttributes && g.morphAttributes.position)) return false;
  return shownInScene(o);
}
function stillGather() {
  const out = [];
  for (const r of scene.children) {
    if (!r.userData.still) continue;
    (function walk(o) { if (o.userData.moving) return; if (stillOk(o)) out.push(o); o.children.forEach(walk); })(r);
  }
  return out;
}
// one mesh's copy as it stands: where it is (its world matrix), its shape and whether it's shown
const stillSrc = o => ({ o, m: o.matrixWorld.elements.slice(), geo: o.geometry, ver: o.geometry.attributes.position.version, side: o.material.shadowSide ?? STILL_SIDE[o.material.side] });
function stillBuild() {
  for (const p of STILL_SH.proxies) { scene.remove(p); p.geometry.dispose(); }
  STILL_SH.proxies.length = 0;
  const bySide = new Map();
  for (const s of STILL_SH.srcs) { if (!bySide.has(s.side)) bySide.set(s.side, []); bySide.get(s.side).push(s); }
  for (const [side, list] of bySide) {
    let nv = 0, ni = 0;
    for (const { o } of list) { const g = o.geometry, n = g.attributes.position.count; nv += n; ni += g.index ? g.index.count : n; }
    const pos = new Float32Array(nv * 3), ix = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v0 = 0, i0 = 0;
    for (const { o } of list) {
      const g = o.geometry, pa = g.attributes.position, n = pa.count, mw = o.matrixWorld;
      for (let k = 0; k < n; k++) { _stillV.fromBufferAttribute(pa, k).applyMatrix4(mw); pos[(v0 + k) * 3] = _stillV.x; pos[(v0 + k) * 3 + 1] = _stillV.y; pos[(v0 + k) * 3 + 2] = _stillV.z; }
      // (a mirrored one's triangles turned back round, as it would have been drawn with its faces the other way)
      const flip = mw.determinant() < 0, idx = g.index ? g.index.array : null, m = idx ? idx.length : n;
      for (let k = 0; k < m; k += 3) {
        const a = idx ? idx[k] : k, b = idx ? idx[k + 1] : k + 1, c = idx ? idx[k + 2] : k + 2;
        ix[i0 + k] = v0 + a; ix[i0 + k + 1] = v0 + (flip ? c : b); ix[i0 + k + 2] = v0 + (flip ? b : c);
      }
      v0 += n; i0 += m;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(ix, 1));
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false }); mat.shadowSide = side;
    const p = new THREE.Mesh(geo, mat); p.castShadow = true; p.receiveShadow = false; p.frustumCulled = false; p.matrixAutoUpdate = false; p.visible = false;
    p.name = 'stillShadows'; scene.add(p); STILL_SH.proxies.push(p);
  }
}
// let a mesh cast on its own again
function stillLetGo(o) { if (STILL_SH.mine.has(o)) { o.castShadow = true; STILL_SH.mine.delete(o); } }
// before each shadow draw: anything copied that's changed, and now and then anything new; built again if so
function stillCheck() {
  const S = STILL_SH;
  const fresh = S.reset;
  if (fresh) { S.reset = false; S.dirty = true; S.f = 0; for (const s of S.srcs) { s.m = null; s.geo = s.o.geometry; s.ver = s.o.geometry.attributes.position.version; } }
  let changed = S.dirty;
  for (let k = S.srcs.length - 1; k >= 0; k--) {
    const s = S.srcs[k], o = s.o, e = o.matrixWorld.elements;
    // (casting again of its own accord: something else wants it to)
    const recast = S.mine.has(o) && o.castShadow, gone = recast || !stillOk(o);
    let mv = recast;
    if (!gone && s.m) { for (let q = 0; q < 16; q++) if (e[q] !== s.m[q]) { mv = true; break; } if (o.geometry !== s.geo || o.geometry.attributes.position.version !== s.ver) mv = true; }
    if (!gone && !mv) { if (!s.m) s.m = e.slice(); continue; }
    // (it moved or changed: it casts itself from now on. Gone from view: out for now, back once it's shown, though one
    // that's shown and hidden over and over, not by a new floor plan, is let go for good too)
    if (mv) S.moved.add(o);
    else if (!fresh) { const n = (S.flips.get(o) || 0) + 1; S.flips.set(o, n); if (n > 4) S.moved.add(o); }
    stillLetGo(o); S.srcs.splice(k, 1); changed = true;
  }
  if (++S.f >= S.scan || S.dirty) {
    S.f = 0;
    const have = new Set(S.srcs.map(s => s.o));
    for (const o of stillGather()) if (!have.has(o)) { S.srcs.push(stillSrc(o)); changed = true; }
  }
  if (!changed) return;
  S.dirty = false;
  for (const s of S.srcs) { if (s.o.castShadow) { s.o.castShadow = false; S.mine.add(s.o); } if (!s.m) s.m = s.o.matrixWorld.elements.slice(); }
  stillBuild();
}
// the shadow map's own draw, with the copies shown just for it
{
  const draw = R.shadowMap.render;
  R.shadowMap.render = function (lights, sc, camera) {
    if (sc !== scene) return draw.call(this, lights, sc, camera);
    try { stillCheck(); } catch (e) { console.warn('still shadows', e); }
    for (const p of STILL_SH.proxies) p.visible = true;
    try { draw.call(this, lights, sc, camera); } finally { for (const p of STILL_SH.proxies) p.visible = false; }
  };
}
