// Geometry helpers: cached boxes, flat-shaded meshes, cylinders and soft blob shadows.

const geoCache = {};
const bgeo = (w, h, d) => { const k = w.toFixed(3) + ',' + h.toFixed(3) + ',' + d.toFixed(3); return geoCache[k] || (geoCache[k] = new THREE.BoxGeometry(w, h, d)); };
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
  const live = (opt && opt.live) || null;
  parent.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert(), groups = new Map(), out = [];
  const bakeable = m => m.isMeshLambertMaterial && !m.transparent && !m.map && m.side === THREE.FrontSide && !m.vertexColors && m.customProgramCacheKey && m.customProgramCacheKey() === 'lit' && !(live && live.has(m));
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
// every mesh under g except the ones flagged userData.sil (kept whole for outlines) and anything under a stop node
function finePieces(g, stop) {
  const out = []; (function walk(o) { o.children.forEach(c => { if (stop && stop.has(c)) return; if (c.isMesh && !c.userData.sil && !c.userData.fine) out.push(c); walk(c); }); })(g);
  return out;
}
