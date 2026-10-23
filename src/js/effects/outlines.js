// Outlines: inverted-hull rims for the x-ray through walls, and fading shadows (the outlines round whole models are
// effects/screen-outlines.js).

import { cam, R, V3 } from '../core/renderer.js';
import { bandRolls, PM } from '../player/player.js';
import { LOOK } from '../player/look.js';

// an inverted-hull rim: every piece of g drawn again a little bigger, back faces only, in mat (the x-ray's rims, below)
function hullOutline(g, col, scl, thick, mat, keep) {
  const om = mat || new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide, transparent: true, opacity: 0.95 });
  const list = []; g.traverse(o => { if (o.isMesh && !o.userData.isOutline && (!keep || keep(o))) list.push(o); });
  // each rim is the piece grown about its own middle, not its origin: a piece modelled away from its origin (a gun's
  // parts, a limb hung from its joint) would otherwise have its rim slid off it, out of line
  list.forEach(o => {
    const s = new THREE.Mesh(o.geometry, om); s.userData.isOutline = true;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    if (thick) { const sx = b.max.x - b.min.x || 0.01, sy = b.max.y - b.min.y || 0.01, sz = b.max.z - b.min.z || 0.01; s.scale.set((sx + thick * 2) / sx, (sy + thick * 2) / sy, (sz + thick * 2) / sz); }
    else s.scale.setScalar(scl || 1.14);
    const c = b.getCenter(new V3()); s.position.set(c.x * (1 - s.scale.x), c.y * (1 - s.scale.y), c.z * (1 - s.scale.z));
    o.add(s);
  });
  return om;
}
const XRAY_CLIP = [new THREE.Plane(new V3(0, 1, 0), -0.14)];
R.localClippingEnabled = true;
const RIM_STENCIL = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp };
export const rimMat = col => new THREE.MeshBasicMaterial(Object.assign({ color: col, side: THREE.BackSide, transparent: true, opacity: 0.95 }, RIM_STENCIL));
// drawn only where something solid stands between the camera and the zombie: a red rim over a dark fill,
// and for zombies a tinted silhouette of the whole body so you can read them through the wall at a glance.
// withSil: true for the red zombie silhouette, or a colour; keep(mesh) can leave meshes out;
// bias (world units) ignores occluders closer than that, so a gun held against the body never counts as a wall
// a see-through material drawn as halftone: a grid of dots on screen (cell pixels apart), each as big as the
// material's opacity allows, so as it fades the dots shrink away rather than the colour thinning out
function halftone(mat, cell) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
  { vec2 c = mod(gl_FragCoord.xy, ${cell.toFixed(1)}) - ${(cell / 2).toFixed(2)}; if (length(c) > ${(cell * 0.62).toFixed(2)} * sqrt(clamp(opacity, 0.0, 1.0))) discard; gl_FragColor.a = min(1.0, opacity * 3.0); }`);
  };
  mat.customProgramCacheKey = () => 'halftone' + cell;
  return mat;
}
export function xray(g, col, noClip, withSil, keep, bias, ht) {
  // clipped just above the ground so feet sinking into the dirt or a porch board never light up
  const rim = new THREE.MeshBasicMaterial(Object.assign({ color: col || 0xff3322, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, depthFunc: THREE.GreaterDepth, clippingPlanes: noClip ? null : XRAY_CLIP }, RIM_STENCIL));
  const fill = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilFail: THREE.ReplaceStencilOp });
  const ok = o => o.isMesh && !o.userData.isOutline && (!keep || keep(o));
  const list = []; g.traverse(o => { if (ok(o)) list.push(o); });
  list.forEach(o => { const f = new THREE.Mesh(o.geometry, fill); f.userData.isOutline = true; f.renderOrder = -5; o.add(f); });
  hullOutline(g, 0, 0, withSil ? 0.055 : 0.04, rim, keep); g.traverse(o => { if (o.material === rim) o.renderOrder = -2; });
  if (bias) rim.onBeforeCompile = biasDepth(bias);
  if (ht) halftone(rim, ht * 0.75);
  if (!withSil) return { rim, fill };
  // the silhouette marks each pixel with stencil 2 as it draws, so overlapping limbs don't stack up darker
  const sil = new THREE.MeshBasicMaterial({ color: withSil === true ? 0xd8382a : withSil, transparent: true, opacity: 0, depthWrite: false, depthFunc: THREE.GreaterDepth, clippingPlanes: XRAY_CLIP,
    stencilWrite: true, stencilRef: 2, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilZFail: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp });
  if (bias) sil.onBeforeCompile = biasDepth(bias);
  if (ht) halftone(sil, ht);
  list.forEach(o => { const m = new THREE.Mesh(o.geometry, sil); m.userData.isOutline = true; m.renderOrder = -1; o.add(m); });
  return { rim, fill, sil };
}
// pull a material's depth toward the camera by d world units (the camera is orthographic, so this is a flat shift)
const biasDepth = d => sh => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n  gl_Position.z -= ${(d * 2 / (cam.far - cam.near)).toFixed(5)} * gl_Position.w;`); };
// a zombie's shadow dissolves with it: its shadow-map depth is dithered away as it fades
export function fadeDepthMat() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), u = { value: 1 };
  m.userData.u = u;
  m.onBeforeCompile = sh => {
    sh.uniforms.uFade = u;
    sh.fragmentShader = 'uniform float uFade;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > uFade) discard;');
  };
  return m;
}
// you, seen through trees, walls and anything else in the way: a soft grey rim and a faint pale fill
// (blood spots and bandage rolls left out; the bias keeps your own gun from counting as cover)
export const pXray = xray(PM.g, 0xe6e2da, false, 0xcfcac0, o => !o.userData.fine && !bandRolls.includes(o) && !(o.parent && bandRolls.includes(o.parent)), 1.0);
pXray.rim.opacity = 0.75; pXray.sil.opacity = 0.2;
// pieces added later (each run's hat, player/look.js) get the same see-through fill, silhouette and rim as the rest of you
export function xrayAttach(list) {
  list.forEach(o => {
    const f = new THREE.Mesh(o.geometry, pXray.fill); f.userData.isOutline = true; f.renderOrder = -5; o.add(f);
    const m = new THREE.Mesh(o.geometry, pXray.sil); m.userData.isOutline = true; m.renderOrder = -1; o.add(m);
    hullOutline(o, 0, 0, 0.055, pXray.rim); o.children.forEach(c => { if (c.material === pXray.rim) c.renderOrder = -2; });
  });
}
LOOK.xrayReady = true;

