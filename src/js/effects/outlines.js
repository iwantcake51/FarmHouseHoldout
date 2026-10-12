// Outlines: inverted-hull rims, x-ray rims through walls, and fading shadows.

function outline(g, col, scl, thick, mat) {
  const om = mat || new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide, transparent: true, opacity: 0.95 });
  const list = []; g.traverse(o => { if (o.isMesh && !o.userData.isOutline) list.push(o); });
  list.forEach(o => {
    const s = new THREE.Mesh(o.geometry, om); s.userData.isOutline = true;
    if (thick) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox, sx = b.max.x - b.min.x || 0.01, sy = b.max.y - b.min.y || 0.01, sz = b.max.z - b.min.z || 0.01; s.scale.set((sx + thick * 2) / sx, (sy + thick * 2) / sy, (sz + thick * 2) / sz); }
    else s.scale.setScalar(scl || 1.14);
    o.add(s);
  });
  return om;
}
const XRAY_CLIP = [new THREE.Plane(new V3(0, 1, 0), -0.14)];
R.localClippingEnabled = true;
const RIM_STENCIL = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp };
const rimMat = col => new THREE.MeshBasicMaterial(Object.assign({ color: col, side: THREE.BackSide, transparent: true, opacity: 0.95 }, RIM_STENCIL));
// drawn only where something solid stands between the camera and the zombie: a red rim over a dark fill,
// and for zombies a tinted silhouette of the whole body so you can read them through the wall at a glance
function xray(g, col, noClip, withSil) {
  // clipped just above the ground so feet sinking into the dirt or a porch board never light up
  const rim = new THREE.MeshBasicMaterial(Object.assign({ color: col || 0xff3322, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, depthFunc: THREE.GreaterDepth, clippingPlanes: noClip ? null : XRAY_CLIP }, RIM_STENCIL));
  const fill = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilFail: THREE.ReplaceStencilOp });
  const list = []; g.traverse(o => { if (o.isMesh && !o.userData.isOutline) list.push(o); });
  list.forEach(o => { const f = new THREE.Mesh(o.geometry, fill); f.userData.isOutline = true; f.renderOrder = -5; o.add(f); });
  outline(g, 0, 0, withSil ? 0.055 : 0.04, rim); g.traverse(o => { if (o.material === rim) o.renderOrder = -2; });
  if (!withSil) return { rim, fill };
  // the silhouette marks each pixel with stencil 2 as it draws, so overlapping limbs don't stack up darker
  const sil = new THREE.MeshBasicMaterial({ color: 0xd8382a, transparent: true, opacity: 0, depthWrite: false, depthFunc: THREE.GreaterDepth, clippingPlanes: XRAY_CLIP,
    stencilWrite: true, stencilRef: 2, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilZFail: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp });
  const body = []; g.traverse(o => { if (o.isMesh && !o.userData.isOutline) body.push(o); });
  body.forEach(o => { const m = new THREE.Mesh(o.geometry, sil); m.userData.isOutline = true; m.renderOrder = -1; o.add(m); });
  return { rim, fill, sil };
}
// a zombie's shadow dissolves with it: its shadow-map depth is dithered away as it fades
function fadeDepthMat() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), u = { value: 1 };
  m.userData.u = u;
  m.onBeforeCompile = sh => {
    sh.uniforms.uFade = u;
    sh.fragmentShader = 'uniform float uFade;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > uFade) discard;');
  };
  return m;
}
