// The wear on a zombie: rips and tatters where cloth gives, rot on bare skin, and grime where dirt would be.

import { clamp, pick, rand, rr } from '../core/math.js';
import { zb, zback, ZBLOOD, ZBONE, zc, ZDIRT, ZF, zfront, ZMEAT, zmix, zside } from './zombie-kit.js';
import { zSpot } from './zombie-looks.js';

// ---- the wear: each mark somewhere it would come from, not scattered evenly over it ----
// rips where cloth gives (the shoulder seam, the side, the hem, the elbow, the knee), the skin showing grey through
// them; the hem and cuffs torn into strips, a sleeve or a trouser leg torn off; what it ate run down the front of it
// from the mouth; the bite that turned it, bled down the cloth under it; its hands red to the wrist; the knees muddy
// from going down on them, the back dirty from lying on it (and the grime that builds toward the hems and the feet is in
// the vertex colours: ZGRIME)
const ZRIP_AT = [[0.17, 0.24, 1], [0.13, -0.2, 1], [0.0, -0.24, 1], [0.06, 0.12, 0.4]];   // [x, y, how often] on the front, mirrored at random
function zRip(T, fn, cover, skin, x, y, f, lay, sz) {
  const w = sz * rr(0.9, 1.4), h = sz * rr(0.6, 1);
  fn(T, w + 0.014, h + 0.012, zc(cover, 0.72), x, y, f, lay - 0.003);   // the frayed edge, a shade darker
  fn(T, w, h, zc(skin, 0.82), x, y, f, lay);                           // the skin through it
  fn(T, w * 0.5, h * rr(0.4, 0.8), zc(skin, 0.82), x + rr(-0.5, 0.5) * w * 0.6, y - h * 0.45, f, lay);   // not a neat square: a second tear off it
  if (rand() < 0.5) fn(T, w * 0.7, h * 0.5, zc(cover, 0.9), x + rr(-0.3, 0.3) * w, y - h * 0.65, f, lay + 0.003);   // a flap hanging off it
}
export function zTatter(K, o) {
  const w = o.wear, T = K.torso, cover = o.coat || o.top, lay = (o.shell || 0) + 0.012, blood = c => zmix(c, ZBLOOD, rr(0.55, 0.7)), mud = c => zmix(c, ZDIRT, rr(0.4, 0.55));
  // the rips, at the places cloth tears
  let nr = Math.round(rr(0.6, 2.2) * w);
  for (const [x, y, p] of ZRIP_AT) { if (nr <= 0) break; if (rand() > p * 0.6) continue; nr--; const sd = rand() < 0.5 ? -1 : 1, chest = y > -0.02;
    zRip(T, rand() < 0.7 ? zfront : zback, cover, o.skin, sd * x + rr(-0.02, 0.02), y + rr(-0.02, 0.02), chest ? ZF.chest : ZF.waist, lay, rr(0.035, 0.055)); }
  // the hem torn into a strip or two
  const nh = Math.round(rr(0.5, 2.5) * w);
  for (let i = 0; i < nh; i++) { const len = rr(0.03, 0.07); zb(T, rr(0.03, 0.055), len, 0.008, cover, rr(-0.17, 0.17), -0.3 - len / 2 + 0.012, (rand() < 0.6 ? 1 : -1) * (ZF.waist + 0.005), rr(-0.1, 0.1), 0, rr(-0.2, 0.2)); }
  // down the front from the mouth: a bib of it under the chin, run down in a stripe or two, drying darker at the top
  if (o.face.drool) {
    const x = o.face.jx + rr(-0.03, 0.03), b1 = blood(cover), l = rr(0.08, 0.2);
    zfront(T, rr(0.07, 0.11), rr(0.05, 0.08), zc(b1, 0.85), x, 0.27, ZF.chest, lay + 0.002);
    zfront(T, rr(0.04, 0.06), l, b1, x + rr(-0.015, 0.015), 0.25 - l / 2, ZF.chest, lay + 0.004);
    if (rand() < 0.6) { const l2 = rr(0.05, 0.12); zfront(T, 0.016, l2, b1, x + rr(0.03, 0.05) * (rand() < 0.5 ? -1 : 1), 0.24 - l2 / 2, ZF.chest, lay + 0.006); }
  }
  // the bite that turned it, and what it bled down the cloth under it (on a shoulder, a forearm or the side)
  const bite = pick(['shoulder', 'shoulder', 'fore', 'side', 'none']), bs = rand() < 0.5 ? -1 : 1, S = bs < 0 ? 'L' : 'R';
  if (bite === 'shoulder') { const b1 = blood(cover); zfront(T, 0.07, 0.06, zc(b1, 0.8), bs * 0.17, 0.25, ZF.chest, lay + 0.002); zfront(T, 0.05, rr(0.12, 0.22), b1, bs * 0.17, 0.12, ZF.chest, lay + 0.001); zfront(T, 0.03, 0.025, ZMEAT, bs * 0.17, 0.26, ZF.chest, lay + 0.006); }
  if (bite === 'side') { const b1 = blood(cover); zside(T, bs, 0.12, 0.2, b1, rr(-0.04, 0.04), -0.14, ZF.waistW, lay); zside(T, bs, 0.04, 0.035, ZMEAT, 0, -0.08, ZF.waistW, lay + 0.004); }
  if (bite === 'fore') { const fo = K['fore' + S], c = o.sleeve === 'long' ? blood(o.sleeveCol || cover) : zmix(o.skin, ZBLOOD, 0.5); zb(fo, 0.006, 0.07, 0.12, c, bs * 0.069, 0, 0.15); zb(fo, 0.006, 0.04, 0.045, ZMEAT, bs * 0.072, 0, 0.12); }
  // the arms: a ragged end to each sleeve, a sleeve torn away below the elbow, an elbow worn through
  ['L', 'R'].forEach(S => {
    const s = S === 'L' ? -1 : 1, up = K['arm' + S], fo = K['fore' + S], sl = o.sleeveCol || cover;
    if (o.sleeve === 'short') for (let i = 0; i < 2; i++) zb(up, 0.025, 0.006, rr(0.02, 0.04), sl, rr(-0.05, 0.05), (rand() < 0.5 ? 1 : -1) * 0.079, 0.158);
    if (o.sleeve === 'long') {
      if (rand() < 0.2 * w) { zb(fo, 0.136, 0.136, 0.2, o.skin, 0, 0, 0.17); for (let i = 0; i < 3; i++) zb(fo, 0.025, 0.006, rr(0.03, 0.05), sl, rr(-0.05, 0.05), (rand() < 0.5 ? 1 : -1) * 0.071, 0.075); }
      else if (rand() < 0.3 * w) { zb(up, 0.006, 0.05, 0.05, zc(sl, 0.7), 0, -0.074, 0.25); zb(up, 0.006, 0.036, 0.036, zc(o.skin, 0.82), 0, -0.077, 0.25); }   // the elbow worn through
    }
  });
  // the hands red to the wrist (or the gloves dark with it)
  if (rand() < 0.55) ['foreL', 'foreR'].forEach(p => { if (rand() < 0.8) zb(K[p], 0.114, 0.074, 0.134, zmix(o.gloves || o.skin, ZBLOOD, rr(0.4, 0.6)), 0, -0.005, 0.345); });
  // the legs: muddy knees, a knee torn through, frayed cuffs, sometimes a leg of the trousers torn off below the knee
  if (o.legs === 'long') ['L', 'R'].forEach(S => {
    const th = K['leg' + S], sh = K['shin' + S], pc = o.pants;
    if (rand() < 0.6) zb(sh, 0.15, rr(0.05, 0.09), 0.006, mud(pc), rr(-0.01, 0.01), -0.04, 0.111);
    if (rand() < 0.35 * w) { zfront(th, 0.075, 0.05, zc(pc, 0.7), rr(-0.02, 0.02), -0.255, 0.11, 0.008); zfront(th, 0.06, 0.036, zc(o.skin, 0.82), rr(-0.02, 0.02), -0.255, 0.11, 0.012); }
    if (rand() < 0.15 * w) { zb(sh, 0.19, 0.12, 0.22, o.skin, 0, -0.16, 0); for (let i = 0; i < 3; i++) zb(sh, 0.03, rr(0.03, 0.05), 0.006, pc, rr(-0.07, 0.07), -0.1, (i % 2 ? 1 : -1) * 0.111); }
    else if (o.shoes !== 'boots') for (let i = 0; i < 2; i++) zb(sh, 0.025, rr(0.02, 0.035), 0.006, pc, rr(-0.07, 0.07), -0.2, (i % 2 ? 1 : -1) * 0.111);
  });
  // the back: dirt from lying on it
  if (rand() < 0.6) zback(T, rr(0.22, 0.34), rr(0.14, 0.24), zmix(cover, ZDIRT, rr(0.25, 0.4)), rr(-0.05, 0.05), rr(-0.15, 0.05), ZF.chest, lay - 0.004);
}
// ---- the rot: a bruise or two on bare skin, now and then a belly torn open to the ribs or bone at the temple ----
export function zRot(K, o) {
  const bare = ['foreL', 'foreR', 'shinL', 'shinR', 'armL', 'armR'].filter(p => !((p[0] === 's' && o.legs === 'long') || (p[0] === 'a' && o.sleeve !== 'none') || (p[0] === 'f' && o.sleeve === 'long')));
  for (let i = 0; i < 2 && bare.length; i++) if (rand() < 0.6) { const p = pick(bare); zSpot(K[p], p, zmix(o.skin, o.bruise, 0.7), rr(0.05, 0.08), 0.003); }
  if (rand() < 0.15 * o.wear) {   // the belly torn open, bled down the front of what it's wearing
    const x = rr(-0.08, 0.08), y = rr(-0.12, 0.04), f = y > -0.02 ? ZF.chest : ZF.waist, L = (o.shell || 0) + 0.016, cv = o.coat || o.top, ry = Math.max(-0.22, y - 0.08);
    zfront(K.torso, 0.07, rr(0.1, 0.2), zmix(cv, ZBLOOD, 0.6), x + rr(-0.01, 0.01), ry, ry > -0.02 ? ZF.chest : ZF.waist, L - 0.004);
    zRip(K.torso, zfront, cv, ZMEAT, x, y, f, L, 0.08);
    zfront(K.torso, 0.04, 0.025, 0x2a1210, x + rr(-0.01, 0.01), y, f, L + 0.006);
  }
  if (rand() < 0.12) { const s = rand() < 0.5 ? -1 : 1, hx = o.face.hw / 2; zb(K.head, 0.006, 0.06, 0.08, ZMEAT, s * (hx + 0.003), 0.06, -0.04); zb(K.head, 0.006, 0.03, 0.04, ZBONE, s * (hx + 0.006), 0.06, -0.04); }   // the skull showing at the temple
}
// the grime that builds up toward the ends of things, in the vertex colours: [axis, where it starts, where it's
// heaviest, how heavy]; the head's is the shadow under the jaw
export const ZGRIME = { torso: [1, 0.1, -0.3, 0.22], head: [1, -0.1, -0.24, 0.4], foreL: [2, 0.12, 0.42, 0.22], foreR: [2, 0.12, 0.42, 0.22], legL: [1, -0.05, -0.29, 0.1], legR: [1, -0.05, -0.29, 0.1], shinL: [1, -0.02, -0.28, 0.32], shinR: [1, -0.02, -0.28, 0.32] };
const _zgD = new THREE.Color(zc(ZDIRT, 0.55));
export function zGrime(k, gr) {
  if (!gr) return; const [ax, a, b, amt] = gr;
  for (let i = 0; i < k.p.length; i += 3) { const t = clamp((k.p[i + ax] - a) / (b - a), 0, 1), m = amt * t * t * (3 - 2 * t); if (m <= 0) continue; for (let j = 0; j < 3; j++) k.c[i + j] += ((j === 0 ? _zgD.r : j === 1 ? _zgD.g : _zgD.b) - k.c[i + j]) * m; }
}
