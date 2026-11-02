// A figure's pieces too small to see from where the camera is (an eye's lid, a buckle, a zip, a button, a stowed
// gun's pin: under LOD.px across on screen) are left out of the frame, its shadow and its outline mask, where each was
// a draw of its own in all three. They're moved onto a layer nothing draws (LOD.layer) and put back on their own
// layers as the camera comes close enough for them to show (first person, down the sights, zoomed in). From the
// usual height a figure is a few dozen pixels tall and most of its small pieces are well under a pixel.
// Only lit pieces: anything that glows (eyes in the dark, a laser's dot, an LED) is drawn however small, its light
// being what shows. A piece a little bigger, but still under LOD.shadow across, keeps its place in the frame and only
// stops casting a shadow: a shadow that size on the ground is a smudge nobody can see, and a draw of its own (yours and
// your teammates' only: a zombie turns its own shadows on and off, zombies/zombie-visuals.js). A figure's pixels to the
// metre come from its distance from the camera, each frame (lodFigures, before the frame is drawn: effects/post.js).
// A piece with a far shape of its own (core/geometry.js setLo: a spitter's acid sacs, rounds with fewer faces) wears it
// once the whole figure's under LOD.far tall on screen, and its own again as it comes nearer (with a little give
// either side, band, so it doesn't flick between them)
import { farOf } from '../core/geometry.js';
import { zombies } from '../zombies/zombie-types.js';
import { PM } from '../player/player.js';
import { NET } from '../net/net.js';

const LOD = { px: 1.2, shadow: 4, layer: 30, far: 140, tall: 1.8, band: 0.12, shadowR: 0.04 };
// (shadowR: and a piece smaller than that, metres out from its middle, casts none however close the camera is: the sun's
// shadows are softened over more than it is across, SHADOW_SOFT in core/renderer.js, so its shadow's never seen)
const LOD_BIT = 1 << LOD.layer, _lv = new THREE.Vector3(), _ls = new THREE.Vector3();
// a piece's size in the world (its bounding sphere's radius as scaled), measured once for each shape it's given; kept on
// the piece itself rather than in its userData, which a copy would carry over and which marks a piece as not to be
// folded (core/geometry.js). One with nothing in it yet (a bandage's wrap before it's wound: player/hold-bandage.js)
// isn't taken for small: it's measured again once it has its shape
function lodR(o) {
  const g = o.geometry; if (o.__lodR !== undefined && o.__lodG === g) return o.__lodR;
  if (!g.attributes.position || !g.attributes.position.count) return Infinity;
  if (!g.boundingSphere) g.computeBoundingSphere(); o.getWorldScale(_ls);
  const r = g.boundingSphere.radius * Math.max(_ls.x, _ls.y, _ls.z); if (!(r > 0)) return Infinity;
  o.__lodG = g; return (o.__lodR = r);
}
// (k: for a perspective camera, pixels to the metre one metre away; for the overhead orthographic one, pixels to the
// metre anywhere)
function lodFigure(root, c, k, shade) {
  if (!root || !root.visible) return;
  let ppm = k; if (c.isPerspectiveCamera) { root.getWorldPosition(_lv); ppm = k / Math.max(0.05, _lv.distanceTo(c.position)); }
  const far = LOD.tall * ppm < LOD.far * (root.__lodFar ? 1 + LOD.band : 1 - LOD.band); root.__lodFar = far;
  root.traverse(o => {
    if (o.isMesh && !o.isInstancedMesh) { const hi = o.__lodHi || o.geometry, lo = farOf(hi), want = far && lo ? lo : hi; if (o.geometry !== want) { o.__lodHi = hi; o.geometry = want; } }
    if (!o.isMesh || !o.material || !o.material.isMeshLambertMaterial || o.isInstancedMesh) return;
    // (a piece whose layers were set since it was put away is the game's again: a copy of one made while it was away,
    // or one moved onto a layer of its own)
    if (o.__lodMask !== undefined && o.layers.mask !== LOD_BIT) o.__lodMask = undefined;
    const px = lodR(o) * ppm, tiny = px < LOD.px;
    // (its shadow: off while it's small, on again as it grows, if it cast one: the game's own choice, castShadow,
    // is kept in __lodCast while it's off)
    if (shade && (px < LOD.shadow || lodR(o) < LOD.shadowR)) { if (o.castShadow) { o.castShadow = false; o.__lodCast = true; } }
    else if (shade && o.__lodCast) { o.castShadow = true; o.__lodCast = false; }
    if (tiny && o.__lodMask === undefined) { if (o.layers.mask === LOD_BIT) return; o.__lodMask = o.layers.mask; o.layers.mask = LOD_BIT; }
    else if (!tiny && o.layers.mask === LOD_BIT) { o.layers.mask = o.__lodMask ?? 1; o.__lodMask = undefined; }
  });
}
// every figure: you, the zombies, your teammates
export function lodFigures(c) {
  c.updateMatrixWorld();
  const k = c.isPerspectiveCamera ? (window.innerHeight / 2) / Math.tan(c.fov * Math.PI / 360) : window.innerHeight * c.zoom / (c.top - c.bottom);
  lodFigure(PM.g, c, k, true);
  for (const z of zombies) lodFigure(z.m.g, c, k, false);
  if (NET.on) NET.peers.forEach(p => { if (p.av) lodFigure(p.av.g, c, k, true); });
}
