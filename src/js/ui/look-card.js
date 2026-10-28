// A survivor's look on a card: hover someone's seat in the co-op lobby (net/lobby.js), or a friend on your friends list
// (net/friends.js), and the survivor they've made (player/look.js) stands on a little card beside it, turning slowly
// under the same studio lights as the character menu's (ui/gun-view.js). One small renderer of its own, started the
// first time it's wanted and drawing only while the card shows; each look is built once (lookFigure, net/avatars.js)
// and the last few kept, so going back and forth between seats shows them straight away.
import { BLOB_TEX } from '../core/geometry.js';
import { lookFigure } from '../net/avatars.js';
import { plain, standEasy, STUDIO_LIGHT } from './gun-view.js';

// how fast the survivor turns (radians a second) and which way round it starts (0: facing you); the camera's field of
// view (degrees), where it looks (m up from the feet), how far back and how high it stands; how many looks are kept
// built; how long the pointer has to rest on a row before the card shows (s: brushing past one doesn't flash it) and
// how long it takes to fade out; the canvas's size (CSS px) and the gap between the card and the sheet
const LCARD = { spin: 0.55, yaw0: 0.5, fov: 22, at: 0.9, dist: 5.0, up: 1.35, keep: 6, wait: 0.12, out: 0.2, w: 164, h: 216, gap: 14 };
const lcEl = document.createElement('div');
lcEl.className = 'lookCard'; lcEl.hidden = true; lcEl.setAttribute('aria-hidden', 'true');
lcEl.innerHTML = '<canvas></canvas><b></b><small></small>';
document.body.appendChild(lcEl);
const lcWho = new WeakMap(), lcBuilt = new Map();
let lcR = null, lcScene = null, lcCam = null, lcFig = null, lcRaf = 0, lcLast = 0, lcYaw = 0, lcAt = null, lcWait = 0, lcShut = 0;

// row li shows the card while the pointer's on it: key names whose it is (it finds the same row again when the list is
// redrawn under the pointer), get() says what to show: { look, name, col, sub }, or nothing to show no card
export function lookCardOn(li, key, get) {
  li.dataset.lc = key; lcWho.set(li, get);
  li.addEventListener('pointerenter', () => lcHover(li));
  li.addEventListener('pointerleave', () => { if (lcAt && lcAt.li === li) lcHide(); });
}
function lcHover(li) {
  clearTimeout(lcWait); clearTimeout(lcShut);
  lcAt = { li, key: li.dataset.lc };
  lcWait = setTimeout(() => lcShow(li), LCARD.wait * 1000);
}
function lcShow(li) {
  const get = lcWho.get(li), d = get && get(); if (!d || !d.look) { lcHide(); return; }
  if (!lcR) lcSetup();
  const f = lcFigure(d.look); if (!f) { lcHide(); return; }
  if (lcFig !== f) { if (lcFig) lcScene.remove(lcFig); lcScene.add(f); lcFig = f; lcYaw = LCARD.yaw0; }
  lcEl.style.setProperty('--pc', d.col || '#888');
  lcEl.querySelector('b').textContent = d.name || 'Survivor'; lcEl.querySelector('small').textContent = d.sub || '';
  lcEl.hidden = false; lcPlace(li); void lcEl.offsetWidth; lcEl.classList.add('on');
  if (!lcRaf) { lcLast = performance.now(); lcRaf = requestAnimationFrame(lcTick); }
}
function lcHide() {
  clearTimeout(lcWait); lcAt = null;
  if (lcEl.hidden) return;
  lcEl.classList.remove('on'); clearTimeout(lcShut);
  lcShut = setTimeout(() => { lcEl.hidden = true; if (lcRaf) cancelAnimationFrame(lcRaf); lcRaf = 0; }, LCARD.out * 1000);
}
// beside the sheet the row's on, level with the row (on its other side if there's no room), never off the screen
function lcPlace(li) {
  const r = li.getBoundingClientRect(), sheet = (li.closest('.frList, .coopSeats') || li).getBoundingClientRect(), w = lcEl.offsetWidth, h = lcEl.offsetHeight;
  const x = sheet.right + LCARD.gap + w <= innerWidth - 8 ? sheet.right + LCARD.gap : Math.max(8, sheet.left - LCARD.gap - w);
  const y = Math.min(Math.max(8, r.top + r.height / 2 - h / 2), innerHeight - h - 8);
  lcEl.style.left = Math.round(x) + 'px'; lcEl.style.top = Math.round(y) + 'px';
}
// a still of a survivor, for their seat in the co-op lobby (net/lobby.js): the card's studio and figure, turned a
// little off straight on, drawn once and kept as a picture by its look
const LTHUMB = { yaw: 0.42, keep: 16 }, thumbs = new Map();
export function lookThumb(look) {
  const k = JSON.stringify(look); if (thumbs.has(k)) return thumbs.get(k);
  let url = '';
  try {
    if (!lcR) lcSetup();
    const f = lcFigure(look); if (!f) return '';
    const shown = lcFig, y0 = f.rotation.y;
    if (shown && shown !== f) lcScene.remove(shown); lcScene.add(f); f.rotation.y = LTHUMB.yaw;
    lcR.render(lcScene, lcCam); url = lcR.domElement.toDataURL('image/png');   // (read straight after it's drawn, before the page shows it)
    f.rotation.y = y0; if (shown !== f) { lcScene.remove(f); if (shown) lcScene.add(shown); }
  } catch (e) { console.warn('look thumb', e); return ''; }
  thumbs.set(k, url); if (thumbs.size > LTHUMB.keep) thumbs.delete(thumbs.keys().next().value);
  return url;
}
function lcSetup() {
  const cv = lcEl.querySelector('canvas');
  lcR = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  lcR.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); lcR.setSize(LCARD.w, LCARD.h, false);
  lcScene = new THREE.Scene(); lcCam = new THREE.PerspectiveCamera(LCARD.fov, LCARD.w / LCARD.h, 0.1, 30);
  lcCam.position.set(0, LCARD.up, LCARD.dist); lcCam.lookAt(0, LCARD.at, 0);
  // the lights stay put while the survivor turns, so the key light's always on the side you're looking at
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
    if (g0 === lcFig) continue;
    lcBuilt.delete(k0); g0.traverse(o => { if (o.isMesh && o.userData.fine) o.geometry.dispose(); });   // (only what the look made for it: the body's own pieces are yours too)
  }
  return f;
}
function lcTick(t) {
  lcRaf = requestAnimationFrame(lcTick);
  const dt = Math.min(0.1, (t - lcLast) / 1000); lcLast = t;
  // the list redrawn under the pointer (someone joined, a friend came online): the card stays with the same row
  if (lcAt && !lcAt.li.isConnected) {
    const li = [...document.querySelectorAll('[data-lc]')].find(e => e.dataset.lc === lcAt.key);
    if (li && li.matches(':hover')) lcAt.li = li; else lcHide();
  }
  if (lcAt) { if (!lcAt.li.offsetParent) lcHide(); else lcPlace(lcAt.li); }   // (the sheet shut under it)
  lcYaw += LCARD.spin * dt; if (lcFig) lcFig.rotation.y = lcYaw;
  lcR.render(lcScene, lcCam);
}
