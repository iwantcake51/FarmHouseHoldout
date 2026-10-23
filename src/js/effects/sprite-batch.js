// The particle sprites (effects/puffs.js, effects/smoke.js) drawn all at once: one draw for every puff, spark, flame
// and wisp of smoke on screen, where each used to be a draw of its own (a fight's worth of them was hundreds).
//
// Each system still keeps its particles as it always has, each with a sprite-like record (sbSprite: a position, a
// scale, whether it's shown, and a material with its texture, turn, colour, opacity and blending), and moves and fades
// them the same way. Just before the frame is drawn, every one that's showing goes into one instanced quad, back to
// front, and all are drawn in that order in one go, the way three.js draws a sprite (turned in the screen's plane,
// scaled in world units, in the scene's fog). Normal and additive ones go in the same draw: blended as premultiplied
// colour, an additive one is just one that leaves the alpha behind it alone, so they mix in the right order whichever
// is in front.
//
// The particle textures (effects/textures.js) are all 128 x 128, so they're copied as they load into the layers of one
// array texture (SB.size: the layer size; the odd smaller one is scaled up), each the first time it's used.
import { scene } from '../core/renderer.js';

const SB = { size: 128, layers: 48, cap: 640 };
const sbAll = [];
// a particle's sprite-like record: what the particle systems set, and what the batch reads
export function sbSprite(map) {
  const s = { position: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1), visible: false,
    material: { map, rotation: 0, color: new THREE.Color(), opacity: 0, blending: THREE.NormalBlending, needsUpdate: false } };
  sbAll.push(s);
  return s;
}

// ---- the textures, as the layers of one array texture ----
const sbTex = new THREE.DataArrayTexture(new Uint8Array(SB.size * SB.size * 4 * SB.layers), SB.size, SB.size, SB.layers);
sbTex.minFilter = THREE.LinearMipmapLinearFilter; sbTex.magFilter = THREE.LinearFilter; sbTex.generateMipmaps = true; sbTex.needsUpdate = true;
const sbLayer = new Map(), sbWait = [], sbReady = new Set();
let sbCanvas = null;
// a texture's layer (-1 until its picture has loaded and been copied in)
function layerOf(tex) {
  if (!sbLayer.has(tex)) { const l = sbLayer.size; sbLayer.set(tex, l); if (l < SB.layers) { sbWait.push(tex); sbCopyIn(); } else console.warn('sprite batch: more textures than layers'); }
  return sbReady.has(tex) ? sbLayer.get(tex) : -1;
}
function sbCopyIn() {
  for (let k = sbWait.length - 1; k >= 0; k--) {
    const tex = sbWait[k], img = tex.image;
    if (!img || !(img.complete ?? true) || !(img.naturalWidth || img.width)) continue;
    if (!sbCanvas) sbCanvas = Object.assign(document.createElement('canvas'), { width: SB.size, height: SB.size });
    const x = sbCanvas.getContext('2d', { willReadFrequently: true }), N = SB.size;
    x.clearRect(0, 0, N, N); x.drawImage(img, 0, 0, N, N);
    const px = x.getImageData(0, 0, N, N).data, out = sbTex.image.data, l = sbLayer.get(tex), row = N * 4;
    // (upside down, as three.js turns an image texture over: a sprite's uv runs up from the bottom)
    for (let y = 0; y < N; y++) out.set(px.subarray((N - 1 - y) * row, (N - y) * row), (l * N + y) * row);
    sbTex.addLayerUpdate(l); sbTex.needsUpdate = true;
    sbWait.splice(k, 1); sbReady.add(tex);
  }
}

// ---- the batch: a quad per sprite ----
const sbGeo = new THREE.InstancedBufferGeometry();
sbGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
sbGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
sbGeo.setIndex([0, 1, 2, 0, 2, 3]);
const sbAttr = (n, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(SB.cap * n), n); a.setUsage(THREE.DynamicDrawUsage); sbGeo.setAttribute(k, a); return a; };
// where it is; its size (x, y); its colour and opacity; and its turn, layer and whether it's additive
const iPos = sbAttr(3, 'iPos'), iSize = sbAttr(2, 'iSize'), iCol = sbAttr(4, 'iCol'), iMisc = sbAttr(3, 'iMisc');
sbGeo.instanceCount = 0;
const sbMat = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tMap: { value: null } }]),
  vertexShader: `
attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iCol; attribute vec3 iMisc;
varying vec2 vUv; varying vec4 vCol; varying float vLayer, vAdd;
#include <fog_pars_vertex>
void main() {
  vUv = uv; vCol = iCol; vLayer = iMisc.y; vAdd = iMisc.z;
  vec4 mvPosition = viewMatrix * vec4(iPos, 1.0);
  vec2 p = position.xy * iSize; float c = cos(iMisc.x), s = sin(iMisc.x);
  mvPosition.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
  fragmentShader: `
precision highp sampler2DArray;
uniform sampler2DArray tMap;
varying vec2 vUv; varying vec4 vCol; varying float vLayer, vAdd;
#include <fog_pars_fragment>
void main() {
  vec4 c = vCol * texture(tMap, vec3(vUv, vLayer));
  gl_FragColor = c;
  #include <fog_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * c.a, vAdd > 0.5 ? 0.0 : c.a);
}`,
  fog: true, transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor
});
sbMat.uniforms.tMap.value = sbTex;
const sbMesh = new THREE.Mesh(sbGeo, sbMat);
sbMesh.frustumCulled = false; sbMesh.renderOrder = 2; sbMesh.userData.isSprites = true;   // (never outlined: effects/screen-outlines.js)
scene.add(sbMesh);

// every frame, before it's drawn (effects/post.js: renderFrame): the sprites that show, far ones first. (Not as the
// batch itself is drawn, onBeforeRender: three.js has sent this frame's buffers by then, so they'd lag a frame behind)
const sbOrder = new Uint16Array(SB.cap), sbDepth = new Float32Array(SB.cap), sbList = [], _sbF = new THREE.Vector3();
export function batchSprites(camera) {
  sbCopyIn();
  camera.getWorldDirection(_sbF);
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  let n = 0; sbList.length = 0;
  for (const s of sbAll) {
    if (!s.visible || n >= SB.cap) continue;
    const m = s.material; if (!(m.opacity > 0.001)) continue;
    const l = layerOf(m.map); if (l < 0) continue;
    sbList.push(s); s._l = l;
    sbDepth[n] = (s.position.x - cx) * _sbF.x + (s.position.y - cy) * _sbF.y + (s.position.z - cz) * _sbF.z; sbOrder[n] = n; n++;
  }
  const ord = sbOrder.subarray(0, n).sort((a, b) => sbDepth[b] - sbDepth[a]);
  const P = iPos.array, Z = iSize.array, C = iCol.array, M = iMisc.array;
  for (let k = 0; k < n; k++) {
    const s = sbList[ord[k]], m = s.material, c = m.color;
    P[k * 3] = s.position.x; P[k * 3 + 1] = s.position.y; P[k * 3 + 2] = s.position.z;
    Z[k * 2] = s.scale.x; Z[k * 2 + 1] = s.scale.y;
    C[k * 4] = c.r; C[k * 4 + 1] = c.g; C[k * 4 + 2] = c.b; C[k * 4 + 3] = m.opacity;
    M[k * 3] = m.rotation; M[k * 3 + 1] = s._l; M[k * 3 + 2] = m.blending === THREE.AdditiveBlending ? 1 : 0;
  }
  for (const a of [iPos, iSize, iCol, iMisc]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
  sbGeo.instanceCount = n;
}
