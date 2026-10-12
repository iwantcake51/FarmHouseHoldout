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
