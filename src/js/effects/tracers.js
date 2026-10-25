// Bullet tracers: every round streaks from the muzzle to whatever it stops in as a white-hot slug with a glowing head,
// its tail running back from it through yellow to orange, and lays a hot line through the air behind it that cools to
// a dull red and thins away. Where it stops the head pops. How fat, bright and long-lived all of it is follows the
// round's power (tracerPower): a 9mm leaves a quick thin streak, a shotgun a spray of hot needles, a rifle or a magnum a
// fat bolt of light with a halo round it, a long glowing wake that drifts up as it cools and a star where it lands.

import { CAM_OFF, cam, scene, V3 } from '../core/renderer.js';
import { clamp, rand, rr, smooth } from '../core/math.js';
import { S } from '../game/run-state.js';
import { TEX_CORE, TEX_STAR } from './textures.js';
import { lightLevelAt } from './smoke.js';
import { flashes } from '../weapons/explosives.js';
import { setLmT } from '../game/state.js';

const TR_N = 64, TR_SNAP = 0.05, TR_VIEW = CAM_OFF.clone().normalize();
// strips that run from their origin along +z, each turned about that line to face the camera (trAim)
const TR_G = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
// f(u, t): u across the strip (-1..1), t along it from its tail (0) to its head (1)
function trTex(w, h, f) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), im = x.createImageData(w, h);
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) { const i = (r * w + q) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = 255 * clamp(f((q + 0.5) / w * 2 - 1, r / (h - 1)), 0, 1); }
  x.putImageData(im, 0, 0); return new THREE.CanvasTexture(c);
}
// the slug: soft across, nothing at the tail rising to full at the head, rounded off at the very tip
const TR_STREAK = trTex(32, 256, (u, t) => Math.exp(-u * u * 7) * Math.pow(t, 1.7) * Math.min(1, (1 - t) * 30));
// the line it leaves: soft across, faded in at the muzzle and out at the far end, a little uneven along its length
const TR_WAKE = trTex(32, 256, (u, t) => Math.exp(-u * u * 5) * Math.min(1, t * 10, (1 - t) * 14) * (0.78 + 0.22 * Math.sin(t * 41 + Math.sin(t * 13) * 2)));
// colours for each kind of round: the core, the glow round it, the line it leaves; all of them cool toward TR_EMBER
const TR_STYLE = {
  std: { core: 0xfff8e4, glow: 0xffb850, wake: 0xffa848 },
  hot: { core: 0xffecc8, glow: 0xff8030, wake: 0xff7028 },      // +P loads
  dragon: { core: 0xffd890, glow: 0xff4c12, wake: 0xff400c },   // dragon's breath
  supp: { core: 0xcfcac0, glow: 0x6e6a64, wake: 0x5c5852 }       // through a suppressor: a dim grey streak, no fire (smoke does the rest, smokeTrail)
};
const TR_EMBER = new THREE.Color(0x7a1806), TR_HOT = new THREE.Color(0xfff0c0);
const trMat = map => new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const trSprite = map => new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
const tracers = [];
for (let k = 0; k < TR_N; k++) {
  const t = { glow: new THREE.Mesh(TR_G, trMat(TR_STREAK.clone())), core: new THREE.Mesh(TR_G, trMat(TR_STREAK.clone())), wake: new THREE.Mesh(TR_G, trMat(TR_WAKE)), haze: new THREE.Mesh(TR_G, trMat(TR_WAKE)),
    head: trSprite(TEX_CORE), star: trSprite(TEX_STAR), on: false, age: 0, end: 0, s: new V3(), d: new V3(), L: 0, wakeC: new THREE.Color(), hazeC: new THREE.Color() };
  t.parts = [t.glow, t.core, t.wake, t.haze, t.head, t.star];
  t.parts.forEach(m => { m.visible = false; m.frustumCulled = false; m.renderOrder = 4; scene.add(m); });
  tracers.push(t);
}
// how hard a round hits, as far as its tracer goes: about 0.25 for a shotgun pellet or an SMG round, 0.35 a 9mm, 0.6 a
// rifle round on full auto or a .357, 0.9 the .50 and 1.25 the hunting rifle; hotter loads push it up
export function tracerPower(D) { return clamp(Math.pow(D.dmg * S.dmgMul / 120, 0.7) + (D.ammo === 'rifle' ? 0.18 : 0), 0.18, 1.45); }
const _trX = new V3(), _trY = new V3(), _trM = new THREE.Matrix4();
// turn a strip running along d about that line so its flat side faces the camera: from above, the view's own fixed
// way; from your own eyes (a perspective camera), toward your eye from the strip's middle, again each frame as you and
// it move, so a round's streak is seen face on as it goes, never edge on and flat
function trAim(m, d, at) {
  let v = TR_VIEW;
  if (at && cam.isPerspectiveCamera) { v = _trV.subVectors(cam.position, at); const l = v.length(); if (l > 1e-4) v.multiplyScalar(1 / l); else v = TR_VIEW; }
  _trX.crossVectors(d, v); if (_trX.lengthSq() < 1e-8) _trX.set(1, 0, 0).cross(d); _trX.normalize(); _trY.crossVectors(d, _trX);
  m.quaternion.setFromRotationMatrix(_trM.makeBasis(_trX, _trY, d));
}
// from your own eyes the streaks pass right by you, so they're drawn slimmer than from above (FP_TR: how much)
const FP_TR = { w: 0.55 }, _trV = new V3(), _trC = new V3();
const trW = w => cam.isPerspectiveCamera ? w * FP_TR.w : w;
// lay a strip along the shot from a to b metres out, w wide
function trLay(t, m, a, b, w) {
  m.position.copy(t.s).addScaledVector(t.d, a); m.scale.set(trW(w), 1, Math.max(0.001, b - a));
  if (cam.isPerspectiveCamera) trAim(m, t.d, _trC.copy(t.s).addScaledVector(t.d, (a + b) / 2));
}
// a round from (x0, y0, z0) to (x1, y1, z1); pw its power (tracerPower), style a key of TR_STYLE
export function tracer(x0, y0, z0, x1, y1, z1, pw, style) {
  pw = pw || 0.35;
  const t = tracers.find(t => !t.on) || tracers.reduce((a, b) => b.age / b.end > a.age / a.end ? b : a);
  t.s.set(x0, y0, z0); t.d.set(x1 - x0, y1 - y0, z1 - z0); t.L = t.d.length(); if (t.L < 0.05) return; t.d.divideScalar(t.L);
  const st = TR_STYLE[style] || TR_STYLE.std, supp = style === 'supp', big = supp ? 0 : smooth(clamp((pw - 0.45) / 0.7, 0, 1));   // no halo, star or light for a suppressed one
  t.pw = pw; t.big = big; t.age = 0; t.on = true; t.lit = 0; t.supp = supp;
  t.dur = clamp(t.L / (210 + 90 * pw), 0.016, 0.11);                       // slower than a real round, so you see it go
  t.streak = Math.min(t.L, 1.6 + 2.6 * pw + t.L * 0.1);                    // and draw a longer slug
  t.wW = 0.014 + 0.03 * pw; t.wLife = 0.12 + 0.42 * pw; t.wA = (0.2 + 0.3 * pw) * (supp ? 0.35 : 1);
  t.hW = 0.06 + 0.22 * big; t.hLife = 0.25 + 0.95 * big; t.hA = 0.03 + 0.2 * big;   // the halo of heat round a big round's wake
  t.pop = 0.06 + 0.09 * pw; t.popS = (0.25 + 0.7 * pw) * (supp ? 0.4 : 1); t.headS = (0.12 + 0.38 * pw) * (supp ? 0.45 : 1);
  t.end = t.dur + Math.max(TR_SNAP, t.wLife, t.hLife, t.pop);
  t.glow.material.color.setHex(st.glow).lerp(TR_HOT, 0.25 * big); t.core.material.color.setHex(st.core);
  t.wakeC.setHex(st.wake); t.hazeC.setHex(st.glow);
  t.head.material.color.setHex(st.core).lerp(t.glow.material.color, 0.3); t.star.material.color.copy(t.glow.material.color).lerp(TR_HOT, 0.4);
  t.star.material.rotation = rand() * 6.28;
  for (const m of [t.glow, t.core, t.wake, t.haze]) trAim(m, t.d);
  t.parts.forEach(m => { m.visible = true; });
  t.star.visible = false; t.haze.visible = big > 0.02;
}
export function stepTracers(rdt) {
  for (const t of tracers) {
    if (!t.on) continue;
    const a = t.age += rdt;
    if (a >= t.end) { t.on = false; t.parts.forEach(m => { m.visible = false; }); continue; }
    const fl = Math.min(1, a / t.dur), head = t.L * fl, after = Math.max(0, a - t.dur), flick = rr(0.88, 1.12);
    // the slug, from its tail to its head; once it lands its tail catches up to it in TR_SNAP
    if (after < TR_SNAP) {
      const sn = after / TR_SNAP, tail = after > 0 ? t.L - t.streak * (1 - sn) * (1 - sn) : Math.max(0, head - t.streak), o = 1 - sn;
      // (just out of the muzzle the slug's shorter than its length: only its front's drawn, so it's bright right from
      // the muzzle rather than fading in from nothing some way in front of it)
      const f = clamp((head - tail) / t.streak, 0.02, 1); t.glow.material.map.repeat.y = t.core.material.map.repeat.y = f;
      trLay(t, t.glow, tail, head, (0.07 + 0.17 * t.pw) * flick); trLay(t, t.core, tail, head, 0.018 + 0.04 * t.pw);
      t.glow.material.opacity = 0.75 * o * (t.supp ? 0.3 : 1); t.core.material.opacity = o * (t.supp ? 0.45 : 1);
    } else t.glow.visible = t.core.visible = false;
    // a big round lights the ground under it as it goes (lighting/lightmap.js), and where it lands
    if (after <= 0 && t.big > 0.3 && a >= t.lit) { t.lit = a + 0.03; flashes.push({ x: t.s.x + t.d.x * head, z: t.s.z + t.d.z * head, r: 2.2 + 2 * t.big, int: 0.45 + 0.6 * t.big, col: [1, 0.72, 0.38], t: 0.12, max: 0.12 }); setLmT(0); }
    // the head glows as it flies and pops where it lands, a star bursting off a big round's
    if (after <= 0) {
      t.head.position.copy(t.s).addScaledVector(t.d, head); t.head.scale.setScalar(t.headS * flick); t.head.material.opacity = t.supp ? 0.3 : 1;
      if (t.big > 0.45) { t.star.visible = true; t.star.position.copy(t.head.position); t.star.scale.setScalar(t.headS * 1.7 * t.big * flick); t.star.material.opacity = 0.7; t.star.material.rotation += rdt * 9; }   // a big round's head flares
    }
    else if (after < t.pop) {
      if (t.lit >= 0 && t.big > 0.3) { t.lit = -1; flashes.push({ x: t.s.x + t.d.x * (t.L - 0.3), z: t.s.z + t.d.z * (t.L - 0.3), r: 3 + 2.5 * t.big, int: 1.1 * t.big, col: [1, 0.66, 0.32], t: 0.2, max: 0.2 }); setLmT(0); }
      const k = after / t.pop;
      t.head.position.copy(t.s).addScaledVector(t.d, Math.max(0, t.L - 0.06)); t.head.scale.setScalar(t.popS * (0.6 + 0.8 * Math.sqrt(k))); t.head.material.opacity = (1 - k) * (1 - k) * (t.supp ? 0.3 : 1);
      if (t.big > 0.3) { t.star.visible = true; t.star.position.copy(t.head.position); t.star.scale.setScalar(t.popS * (1.2 + 1.4 * k) * t.big); t.star.material.opacity = (1 - k) * (1 - k) * (1 - k); }
    } else t.head.visible = t.star.visible = false;
    // the line it leaves, laid down behind the head, then cooling, spreading and thinning away
    const kw = clamp(after / t.wLife, 0, 1);
    if (kw < 1) {
      trLay(t, t.wake, Math.min(0.12, head), head, t.wW * (1 + 1.6 * kw));
      t.wake.material.color.copy(t.wakeC).lerp(TR_EMBER, Math.pow(kw, 0.6)); t.wake.material.opacity = t.wA * Math.pow(1 - kw, 1.5);
    } else t.wake.visible = false;
    // and round a big round's line, a wide soft halo of heat that drifts up as it goes
    const kh = clamp(after / t.hLife, 0, 1);
    if (t.haze.visible && kh < 1) {
      trLay(t, t.haze, Math.min(0.3, head), head, t.hW * (1 + 2.2 * kh)); t.haze.position.y += 0.18 * after;
      t.haze.material.color.copy(t.hazeC).lerp(TR_EMBER, kh); t.haze.material.opacity = t.hA * Math.min(1, a * 30) * Math.pow(1 - kh, 1.3);
    } else t.haze.visible = false;
  }
}
// ---- smoke trails: heavy rounds (and every suppressed one) leave a thin grey line through the air that widens, drifts
// up and thins out; enough of them for a suppressed SMG on full auto ----
const TRAIL_TEX = (() => {
  const c = document.createElement('canvas'); c.width = 32; c.height = 128; const x = c.getContext('2d'), im = x.createImageData(32, 128);
  for (let v = 0; v < 128; v++) for (let u = 0; u < 32; u++) {
    const across = Math.pow(Math.sin(Math.PI * (u + 0.5) / 32), 2), ends = Math.min(1, v / 12, (127 - v) / 30), n = 0.7 + 0.3 * Math.sin(v * 0.37 + Math.sin(v * 0.11) * 3);
    const i = (v * 32 + u) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = 255 * across * ends * n;
  }
  x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); return t;
})();
const TRAIL_G = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
const trails = [];
for (let k = 0; k < 40; k++) { const m = new THREE.Mesh(TRAIL_G, new THREE.MeshBasicMaterial({ map: TRAIL_TEX, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide })); m.visible = false; m.renderOrder = 3; scene.add(m); trails.push({ m, life: 0, max: 1, a: 0, w0: 0.05, mx: 0, mz: 0, d: new V3(), L: 0, fp: false }); }
// strength 0..1: how thick and how long it hangs (a hunting rifle 1, a revolver a bit less, rifle-calibre automatics about half).
// It runs along the shot itself, up into the sky or down at the ground as much as across, turned to face you like a tracer
export function smokeTrail(x0, y0, z0, x1, y1, z1, strength) {
  // (from above it lies flat along the shot at its height, as a line of smoke seen from over it does: turned to face
  // that camera, a shot toward it would stand up off the ground in a short banded strip)
  const fp = cam.isPerspectiveCamera, L = fp ? Math.hypot(x1 - x0, y1 - y0, z1 - z0) : Math.hypot(x1 - x0, z1 - z0); if (L < 0.6 || !strength) return;
  const t = trails.reduce((a, b) => b.life < a.life ? b : a);
  if (fp) { t.d.set(x1 - x0, y1 - y0, z1 - z0).divideScalar(L); t.m.position.set(x0, y0, z0); trAim(t.m, t.d); }
  else { t.d.set(x1 - x0, 0, z1 - z0).divideScalar(L); t.m.position.set(x0, (y0 + y1) / 2, z0); t.m.rotation.set(0, Math.atan2(x1 - x0, z1 - z0), 0); }
  t.fp = fp; t.m.scale.set(0.05, 1, L); t.m.visible = true;
  t.max = t.life = 0.9 + 1.3 * strength; t.a = 0.05 + 0.33 * strength; t.w0 = 0.04 + 0.04 * strength; t.mx = (x0 + x1) / 2; t.mz = (z0 + z1) / 2; t.L = L;
}
export function stepTrails(dt) {
  for (const t of trails) {
    if (t.life <= 0) continue; t.life -= dt; if (t.life <= 0) { t.m.visible = false; continue; }
    const k = 1 - t.life / t.max;
    t.m.scale.x = trW(t.w0 + k * 0.32); t.m.position.y += dt * 0.12;
    if (t.fp && cam.isPerspectiveCamera) trAim(t.m, t.d, _trC.copy(t.m.position).addScaledVector(t.d, t.L / 2));
    t.m.material.opacity = t.a * Math.min(1, k * 14) * Math.pow(1 - k, 1.4);
    t.m.material.color.setHex(0xc9c4ba).multiplyScalar(Math.min(1.1, 0.14 + lightLevelAt(t.mx, t.mz) * 0.85));
  }
}
