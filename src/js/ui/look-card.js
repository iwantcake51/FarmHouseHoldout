// A survivor's still for their seat in the co-op lobby (net/lobby.js): the survivor they've made (player/look.js),
// stood easy under the same studio lights as the character menu's (ui/gun-view.js), drawn once by a small renderer of
// its own (started the first time it's wanted) and kept as a picture by its look. Each look's figure is built once
// (lookFigure, net/avatars.js) and the last few kept.
import { BLOB_TEX } from '../core/geometry.js';
import { lookFigure } from '../net/avatars.js';
import { plain, standEasy, STUDIO_LIGHT } from './gun-view.js';

// the camera's field of view (degrees), where it looks (m up from the feet), how far back and how high it stands; how
// many looks are kept built; the picture's size (CSS px)
const LCARD = { fov: 22, at: 0.9, dist: 5.0, up: 1.35, keep: 6, w: 164, h: 216 };
const lcBuilt = new Map();
let lcR = null, lcScene = null, lcCam = null;

// the still itself: the figure in that studio, turned a
// little off straight on, drawn once and kept as a picture by its look
const LTHUMB = { yaw: 0.42, keep: 16 }, thumbs = new Map();
export function lookThumb(look) {
  const k = JSON.stringify(look); if (thumbs.has(k)) return thumbs.get(k);
  let url = '';
  try {
    if (!lcR) lcSetup();
    const f = lcFigure(look); if (!f) return '';
    lcScene.add(f); f.rotation.y = LTHUMB.yaw;
    lcR.render(lcScene, lcCam); url = lcR.domElement.toDataURL('image/png');   // (read straight after it's drawn, before the page shows it)
    lcScene.remove(f);
  } catch (e) { console.warn('look thumb', e); return ''; }
  thumbs.set(k, url); if (thumbs.size > LTHUMB.keep) thumbs.delete(thumbs.keys().next().value);
  return url;
}
function lcSetup() {
  lcR = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true });
  lcR.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); lcR.setSize(LCARD.w, LCARD.h, false);
  lcScene = new THREE.Scene(); lcCam = new THREE.PerspectiveCamera(LCARD.fov, LCARD.w / LCARD.h, 0.1, 30);
  lcCam.position.set(0, LCARD.up, LCARD.dist); lcCam.lookAt(0, LCARD.at, 0);
  const L = STUDIO_LIGHT; lcScene.add(new THREE.HemisphereLight(L.sky[0], L.sky[1], L.sky[2]));
  for (const [c, k, x, y, z] of [L.key, L.fill, L.rimW, L.rimC]) { const d = new THREE.DirectionalLight(c, k); d.position.set(x, y, z); lcScene.add(d); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: BLOB_TEX, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
  floor.scale.set(1.1, 1, 0.8); floor.position.y = 0.004; lcScene.add(floor);
}
// their survivor stood easy, in the model's own colours (plain: no farm light map), built once per look and the
// least lately shown let go when there are more than LCARD.keep
function lcFigure(look) {
  const k = JSON.stringify(look); let f = lcBuilt.get(k);
  if (f) { lcBuilt.delete(k); lcBuilt.set(k, f); return f; }
  try {
    const rig = lookFigure(look); standEasy(o => rig.partMap.get(o));
    rig.g.traverse(o => { if (o.isMesh) { o.material = plain(o.material); o.castShadow = false; } });
    f = rig.g; f.position.set(0, 0, 0); f.rotation.set(0, 0, 0);
  } catch (e) { console.warn('look card', e); return null; }
  lcBuilt.set(k, f);
  for (const [k0, g0] of lcBuilt) {
    if (lcBuilt.size <= LCARD.keep) break;
    lcBuilt.delete(k0); g0.traverse(o => { if (o.isMesh && o.userData.fine) o.geometry.dispose(); });   // (only what the look made for it: the body's own pieces are yours too)
  }
  return f;
}
