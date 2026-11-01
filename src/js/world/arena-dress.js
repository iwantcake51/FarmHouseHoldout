// What the end of the world left on every arena map, laid over each as it's built (world/arena.js arBuildMap), none
// of it changing the fight: nothing it adds stands on the floor higher than a boot (the tallest, a sleeping bag or a
// body bag, about a quarter metre: under a crouched body's cover, never in a line of sight), nothing it adds stops
// you or a round (no footprint in the grid), and whatever goes on a wall is laid flat on the wall's own face, found by
// a ray from the floor in front of it (so it never hangs in the air, off an edge or into an opening). What it adds:
//  - the floor's grime and wear, painted over the map's own floor on one transparent sheet: the shade along the foot
//    of every wall and everything tall (where dust and dirt gather and the light doesn't reach), grit drifts, dried
//    blood with the smears where someone was dragged, scorch, oil, ash, cracks, fallen leaves outdoors
//  - litter scattered over the floor as people left it: papers and leaflets, flattened cardboard, cans and bottles,
//    rags and clothes, spent cases where a fight was, bricks and broken planks, a tyre, more of it against the walls
//    than out in the open
//  - where survivors camped in a corner out of the wind: a sleeping bag, a ring of stones with the fire's ash and
//    charred sticks in it, a pot, a pack, empty tins; a body bag or two left by a wall
//  - on the walls and on what stands tall: what was sprayed and written as the town emptied (THEY'RE INSIDE, NO WAY
//    OUT, the search teams' X marks with their dates and counts, tallies of the days), bloody handprints and smears,
//    bullet holes, missing posters, soot licked up from fires, rust and water stains
//  - outdoors, smoke from what's still burning beyond the map, rising slowly (on the far side from the camera from
//    above, so it never hides the play)

import { seeded } from '../core/math.js';
import { lam, lit } from '../core/shaders.js';
import { cxw } from './grid.js';
import { threadJob, threadRun } from '../core/threads.js';

// how much of each, per square metre of open floor (litter) or per metre of wall along the floor (decals)
const AD = { px: 40, litter: 0.55, wallDecals: 0.16, camps: 4, bodyBags: 3, top: 0.26 };
// kinds that are thin (a tree's trunk, a post): no shade drawn round their whole cell, nothing hung on them
const AD_THIN = 'TP';
const adOpen = c => '.ABF'.includes(c);

export function arDress(g, M) {
  const plan = M.plan, W = plan[0].length, H = plan.length, r = seeded([...M.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
  const kind = (ii, jj) => (plan[jj] && plan[jj][ii]) || '#';
  const tall = c => !adOpen(c) && c !== '#' ? (M.h[c] || 0) >= 1.5 && !M.low.has(c) : c === '#';
  const X = ii => cxw(M.b[0] + ii), Z = jj => cxw(M.b[1] + jj), x0 = X(0) - 0.5, z0 = Z(0) - 0.5;
  const outdoor = !M.indoor;
  const open = []; for (let jj = 0; jj < H; jj++) for (let ii = 0; ii < W; ii++) if (adOpen(kind(ii, jj))) open.push([ii, jj]);
  const wallSide = (ii, jj) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => { const c = kind(ii + a, jj + b); return tall(c) && !AD_THIN.includes(c); });
  // ---- the floor's sheet
  const camps = adCamps(open, wallSide, r);
  adFloorSheet(g, M, W, H, x0, z0, kind, tall, wallSide, open, camps, outdoor, r);
  // ---- the walls' decals and what's left on the tops of things (found by rays against what's built so far, before
  // anything of ours is in the group)
  const targets = adTargets(g);
  adWalls(g, M, W, H, X, Z, kind, tall, open, wallSide, r, targets);
  adRoofs(g, M, W, H, X, Z, kind, tall, r, targets);
  // ---- litter, camps, body bags (instanced: a few draws for the lot)
  adLitter(g, W, H, X, Z, open, wallSide, camps, outdoor, r);
  // ---- smoke beyond the map, outdoors
  if (outdoor) adSmoke(g, x0, z0, W, H, r);
}

// corners out of the wind where people camped: open cells with tall things on two sides at right angles
function adCamps(open, wallSide, r) {
  const c = open.filter(([i, j]) => { const s = wallSide(i, j); return s.some(a => a[0]) && s.some(a => a[1]); });
  const out = [];
  for (let k = 0; k < 40 && out.length < AD.camps && c.length; k++) { const p = c[Math.floor(r() * c.length)]; if (out.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > 8)) out.push(p); }
  return out;
}

// ---- the floor: one transparent sheet over the map's own floor, a hair above it, painted with what wears into a
// floor that's been lived on and fought over. Painting it (a few thousand gradients and strokes over a picture up to
// 1700 px across) is the slowest part of dressing a map, so it's done off the main thread: one of the game's worker
// threads (core/threads.js) paints it on an OffscreenCanvas from a description of the plan and hands back the picture
// (an ImageBitmap, transferred, not copied), and the sheet shows once it's in. Where there are no workers it's painted
// here instead, the same function either way (adPaintFloor: everything it needs is in its arguments, so the worker's
// copy of it is its own source)
function adFloorSheet(g, M, W, H, x0, z0, kind, tall, wallSide, open, camps, outdoor, r) {
  const P = AD.px, cells = new Uint8Array(W * H);
  for (const [i, j] of open) { let v = 1; for (const [a, b] of wallSide(i, j)) v |= a > 0 ? 2 : a < 0 ? 4 : b > 0 ? 8 : 16; cells[j * W + i] = v; }
  const job = { W, H, P, cells, camps, outdoor, seed: Math.floor(r() * 4294967296) };
  const tex = new THREE.Texture(); tex.flipY = false; tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;   // (the picture is painted upside down to match: adPaintFloor's caller flips it)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), lam(0xffffff, { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x0 + W / 2, 0.03, z0 + H / 2); m.receiveShadow = true; m.renderOrder = 1; m.visible = false; g.add(m);
  const show = img => { tex.image = img; tex.needsUpdate = true; m.visible = true; };
  threadRun('floor', job).then(show, () => {});   // (core/threads.js: painted on one of the game's worker threads)
}
// the painting itself: d = { W, H, P (px a metre), cells (per plan cell: 1 open, then 2/4/8/16 a wall east/west/south/
// north of it), camps ([[i, j]]), outdoor, seed }. Uses nothing from outside itself (it's run in a worker as is: a job
// of the game's threads, core/threads.js)
function adPaintFloor(d) {
  // (its own canvas, in a worker or here: painted upside down, as the floor's texture reads it, flipY off)
  const cw = d.W * d.P, ch = d.H * d.P, c = globalThis.OffscreenCanvas ? new globalThis.OffscreenCanvas(cw, ch) : Object.assign(document.createElement('canvas'), { width: cw, height: ch }), x = c.getContext('2d');
  x.translate(0, ch); x.scale(1, -1);
  const { W, H, P, cells, camps, outdoor } = d;
  let st = d.seed >>> 0; const r = () => { st = (st + 0x6D2B79F5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const open = []; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (cells[j * W + i] & 1) open.push([i, j]);
  const sides = (i, j) => { const v = cells[j * W + i], o = []; if (v & 2) o.push([1, 0]); if (v & 4) o.push([-1, 0]); if (v & 8) o.push([0, 1]); if (v & 16) o.push([0, -1]); return o; };
  const AO_W = 0.5, AO_A = 0.42;
  // the shade along the foot of what's tall (a soft band in from each face, and a darker pool into each corner), and
  // the grit blown up against it
  for (const [i, j] of open) {
    const s = sides(i, j);
    for (const [a, b] of s) {
      const ex = (i + 0.5 + a * 0.5) * P, ez = (j + 0.5 + b * 0.5) * P, w = AO_W * P;
      const gr = x.createLinearGradient(ex, ez, ex - a * w, ez - b * w); gr.addColorStop(0, `rgba(22,20,18,${AO_A})`); gr.addColorStop(1, 'rgba(22,20,18,0)');
      x.fillStyle = gr; if (a) x.fillRect(Math.min(ex, ex - a * w), j * P, w, P); else x.fillRect(i * P, Math.min(ez, ez - b * w), P, w);
      for (let k = 0; k < 18; k++) { const t = r() * r(); x.fillStyle = `rgba(${r() < 0.5 ? '96,84,66' : '60,54,46'},${0.25 + r() * 0.3})`; const px = a ? ex - a * t * w : (i + r()) * P, pz = b ? ez - b * t * w : (j + r()) * P; x.fillRect(px, pz, 1 + r() * 2.5, 1 + r() * 2.5); }
    }
    if (s.some(q => q[0]) && s.some(q => q[1])) { const ax = s.find(q => q[0])[0], bz = s.find(q => q[1])[1], cx = (i + 0.5 + ax * 0.5) * P, cz = (j + 0.5 + bz * 0.5) * P, gr = x.createRadialGradient(cx, cz, 0, cx, cz, P * 0.8); gr.addColorStop(0, 'rgba(18,16,14,0.32)'); gr.addColorStop(1, 'rgba(18,16,14,0)'); x.fillStyle = gr; x.fillRect(cx - P, cz - P, 2 * P, 2 * P); }
  }
  const spot = () => { const p = open[Math.floor(r() * open.length)]; return [(p[0] + r()) * P, (p[1] + r()) * P]; };
  const blot = (cx, cz, rad, col, sq = 1, rot = 0) => { const gr = x.createRadialGradient(0, 0, 0, 0, 0, rad); gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); x.save(); x.translate(cx, cz); x.rotate(rot); x.scale(1, sq); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, rad, 0, 7); x.fill(); x.restore(); };
  const area = open.length;
  // cracks in the paving and the concrete
  x.lineCap = 'round';
  for (let k = 0; k < area / 14; k++) { let [a, b] = spot(); x.strokeStyle = `rgba(26,24,22,${0.25 + r() * 0.25})`; x.lineWidth = 0.6 + r(); x.beginPath(); x.moveTo(a, b); for (let q = 0; q < 6 + r() * 6; q++) { a += (r() - 0.5) * P * 0.5; b += (r() - 0.5) * P * 0.5; x.lineTo(a, b); } x.stroke(); }
  // oil and old stains, ash patches
  for (let k = 0; k < area / 45; k++) { const [a, b] = spot(); blot(a, b, (0.4 + r() * 0.9) * P, `rgba(${r() < 0.5 ? '18,18,20' : '44,38,30'},${0.18 + r() * 0.18})`, 0.5 + r() * 0.5, r() * 3); }
  for (let k = 0; k < area / 90; k++) { const [a, b] = spot(); blot(a, b, (0.5 + r() * 0.7) * P, 'rgba(70,68,64,0.3)', 0.6 + r() * 0.4, r() * 3); for (let q = 0; q < 30; q++) { x.fillStyle = `rgba(${r() < 0.5 ? '40,38,36' : '120,116,108'},0.5)`; x.fillRect(a + (r() - 0.5) * P, b + (r() - 0.5) * P * 0.7, 1.5, 1.5); } }
  // scorch where something burned: a black heart, a brown ring, ash flecks
  for (let k = 0; k < Math.max(2, area / 160); k++) { const [a, b] = spot(), rad = (0.8 + r() * 1.1) * P; blot(a, b, rad * 1.25, 'rgba(70,46,26,0.28)'); blot(a, b, rad, 'rgba(12,10,9,0.62)', 0.8 + r() * 0.3, r() * 3); for (let q = 0; q < 50; q++) { x.fillStyle = `rgba(${r() < 0.6 ? '20,18,16' : '150,146,140'},${0.4 + r() * 0.4})`; x.fillRect(a + (r() - 0.5) * rad * 2.4, b + (r() - 0.5) * rad * 2.4, 1 + r() * 2, 1 + r() * 2); } }
  // dried blood: a pool, its drops, and now and then the smear where someone was dragged away
  for (let k = 0; k < area / 55; k++) {
    const [a, b] = spot(), rad = (0.2 + r() * 0.45) * P, col = `rgba(${62 + r() * 30 | 0},${10 + r() * 8 | 0},${8 + r() * 6 | 0},`;
    x.fillStyle = col + (0.5 + r() * 0.3) + ')'; x.beginPath(); x.ellipse(a, b, rad, rad * (0.5 + r() * 0.5), r() * 3, 0, 7); x.fill();
    for (let q = 0; q < 8; q++) { x.beginPath(); x.arc(a + (r() - 0.5) * rad * 5, b + (r() - 0.5) * rad * 5, 0.8 + r() * 2.4, 0, 7); x.fill(); }
    if (r() < 0.45) { const ang = r() * 6.28, L = (1.2 + r() * 2.8) * P; x.strokeStyle = col + '0.32)'; x.lineWidth = rad * 0.9; x.beginPath(); x.moveTo(a, b); x.bezierCurveTo(a + Math.cos(ang) * L * 0.4 + (r() - 0.5) * P, b + Math.sin(ang) * L * 0.4 + (r() - 0.5) * P, a + Math.cos(ang) * L * 0.7, b + Math.sin(ang) * L * 0.7, a + Math.cos(ang) * L, b + Math.sin(ang) * L); x.stroke(); x.lineWidth = rad * 0.3; x.strokeStyle = col + '0.25)'; x.stroke(); }
  }
  // a trail of boot prints across the open now and then
  for (let k = 0; k < area / 160; k++) { let [a, b] = spot(); const ang = r() * 6.28; for (let q = 0; q < 14; q++) { a += Math.cos(ang) * 0.38 * P; b += Math.sin(ang) * 0.38 * P; x.save(); x.translate(a + (q % 2 ? 0.08 : -0.08) * P * Math.sin(ang), b - (q % 2 ? 0.08 : -0.08) * P * Math.cos(ang)); x.rotate(ang); x.fillStyle = 'rgba(40,30,22,0.22)'; x.fillRect(-0.13 * P, -0.05 * P, 0.26 * P, 0.1 * P); x.restore(); } }
  // fallen leaves and blown grass outdoors, in drifts against the walls and loose over the open
  if (outdoor) for (let k = 0; k < area * 1.6; k++) {
    const p = open[Math.floor(r() * open.length)], ws = sides(p[0], p[1]); if (!ws.length && r() < 0.6) continue;
    let a = (p[0] + r()) * P, b = (p[1] + r()) * P; if (ws.length) { const [u, v] = ws[0]; if (u) a = (p[0] + 0.5 + u * (0.5 - r() * r() * 0.6)) * P; if (v) b = (p[1] + 0.5 + v * (0.5 - r() * r() * 0.6)) * P; }
    x.save(); x.translate(a, b); x.rotate(r() * 6.28); x.fillStyle = ['rgba(122,82,36,0.75)', 'rgba(150,104,40,0.7)', 'rgba(92,70,38,0.75)', 'rgba(104,96,50,0.65)'][Math.floor(r() * 4)]; x.beginPath(); x.ellipse(0, 0, 0.05 * P + r() * 2, 0.025 * P + r(), 0, 0, 7); x.fill(); x.restore();
  }
  // the camps' ash, under their fire rings
  for (const [i, j] of camps) { const a = (i + 0.5) * P, b = (j + 0.5) * P; blot(a, b, 0.75 * P, 'rgba(30,28,26,0.7)'); blot(a, b, 1.1 * P, 'rgba(60,50,40,0.25)'); }

  // (handed back as a picture to move between threads where the canvas can make one, else the canvas itself)
  const out = c.transferToImageBitmap ? c.transferToImageBitmap() : c;
  return { out, transfer: c.transferToImageBitmap ? [out] : [] };
}

// ---- the walls: an atlas of what's on them (4 by 4 tiles), each decal a quad on the face a ray from the floor found
const AD_TILES = 16;
let adAtlas = null;
function adAtlasTex() {
  if (adAtlas) return adAtlas;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S * 4; const x = c.getContext('2d'), r = seeded(9001);
  const tile = (n, fn) => { x.save(); x.translate((n % 4) * S, Math.floor(n / 4) * S); x.beginPath(); x.rect(0, 0, S, S); x.clip(); fn(x, r); x.restore(); };
  const spray = (t, col, size, rot = 0) => (x, r) => {
    x.translate(S / 2, S / 2); x.rotate(rot); let f = size; x.font = `700 ${f}px "Permanent Marker", "Marker Felt", "Comic Sans MS", cursive`;
    const lines = t.split('\n'); while (lines.some(L => x.measureText(L).width > S - 20) && f > 14) { f -= 2; x.font = `700 ${f}px "Permanent Marker", "Marker Felt", "Comic Sans MS", cursive`; }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col;
    lines.forEach((L, k) => x.fillText(L, 0, (k - (lines.length - 1) / 2) * f * 1.05));
    for (let k = 0; k < 12; k++) x.fillRect((r() - 0.5) * (S - 40), (lines.length * f) / 2 - 4 + r() * 6, 2 + r() * 2, 10 + r() * 34);   // (the drips)
  };
  tile(0, spray("THEY'RE\nINSIDE", 'rgba(176,30,24,0.92)', 70, -0.05));
  tile(1, spray('NO WAY\nOUT', 'rgba(236,232,220,0.9)', 76, 0.04));
  tile(2, spray('GOD\nHELP US', 'rgba(20,20,20,0.9)', 70, -0.03));
  tile(3, spray('WE WERE\nHERE', 'rgba(236,232,220,0.85)', 64, 0.06));
  tile(4, spray('DONT\nOPEN', 'rgba(176,30,24,0.92)', 80, 0.02));
  tile(5, spray('3 ALIVE\nINSIDE →', 'rgba(236,232,220,0.9)', 58, -0.04));
  // the search teams' X: four quarters, the date, the team, the count, the hazard
  tile(6, (x, r) => { x.strokeStyle = 'rgba(214,120,30,0.9)'; x.lineWidth = 12; x.lineCap = 'round'; x.beginPath(); x.moveTo(40, 40); x.lineTo(216, 216); x.moveTo(216, 40); x.lineTo(40, 216); x.stroke(); x.fillStyle = 'rgba(214,120,30,0.9)'; x.font = '700 30px "Permanent Marker", cursive'; x.textAlign = 'center'; x.fillText('9/14', 128, 62); x.fillText('A3', 52, 136); x.fillText('2', 128, 222); x.fillText('Z', 206, 136); });
  // tally marks of the days
  tile(7, (x, r) => { x.strokeStyle = 'rgba(30,28,26,0.85)'; x.lineWidth = 6; x.lineCap = 'round'; for (let g2 = 0; g2 < 5; g2++) { const ox = 22 + (g2 % 3) * 76, oy = 60 + Math.floor(g2 / 3) * 100; for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(ox + k * 13, oy); x.lineTo(ox + k * 13 + (r() - 0.5) * 4, oy + 60); x.stroke(); } if (g2 < 4) { x.beginPath(); x.moveTo(ox - 6, oy + 48); x.lineTo(ox + 50, oy + 10); x.stroke(); } } });
  // bloody handprints, a smear dragged down
  tile(8, (x, r) => { for (let h = 0; h < 3; h++) { x.save(); x.translate(60 + h * 64 + r() * 20, 70 + r() * 110); x.rotate((r() - 0.5) * 0.8); x.fillStyle = `rgba(${90 + r() * 30 | 0},14,10,0.85)`; x.beginPath(); x.ellipse(0, 0, 20, 24, 0, 0, 7); x.fill(); for (let f = 0; f < 4; f++) { x.beginPath(); x.ellipse(-15 + f * 10, -36 - (f === 1 || f === 2 ? 8 : 0), 5, 14, (f - 1.5) * 0.12, 0, 7); x.fill(); } x.beginPath(); x.ellipse(24, -6, 5, 12, 0.9, 0, 7); x.fill(); x.restore(); } });
  tile(9, (x, r) => { const gr = x.createLinearGradient(0, 30, 0, 250); gr.addColorStop(0, 'rgba(100,14,10,0.9)'); gr.addColorStop(1, 'rgba(100,14,10,0)'); x.fillStyle = gr; for (let f = 0; f < 4; f++) x.fillRect(80 + f * 22 + r() * 6, 30 + r() * 20, 12, 160 + r() * 60); x.beginPath(); x.ellipse(128, 40, 70, 30, 0, 0, 7); x.fill(); });
  // bullet holes, a burst stitched across
  tile(10, (x, r) => { for (let k = 0; k < 16; k++) { const a = 30 + r() * 196, b = 60 + r() * 130 + (a - 128) * 0.25, rad = 4 + r() * 4; x.fillStyle = 'rgba(160,156,150,0.55)'; x.beginPath(); x.arc(a, b, rad * 2.2, 0, 7); x.fill(); x.fillStyle = 'rgba(14,12,12,0.95)'; x.beginPath(); x.arc(a, b, rad, 0, 7); x.fill(); } });
  // a missing poster, its photo and its words, a corner torn
  tile(11, (x, r) => { x.fillStyle = '#e8e2d2'; x.beginPath(); x.moveTo(50, 20); x.lineTo(206, 24); x.lineTo(210, 236); x.lineTo(60, 232); x.lineTo(46, 200); x.closePath(); x.fill(); x.fillStyle = '#111'; x.font = '900 36px Arial'; x.textAlign = 'center'; x.fillText('MISSING', 128, 62); x.fillStyle = '#6a6056'; x.fillRect(84, 78, 88, 96); x.fillStyle = '#3a342e'; x.beginPath(); x.arc(128, 116, 22, 0, 7); x.fill(); x.fillRect(102, 140, 52, 34); x.fillStyle = '#222'; for (let l = 0; l < 3; l++) x.fillRect(70, 190 + l * 12, 110 - l * 20, 5); });
  // soot licked up a wall from a fire at its foot
  tile(12, (x, r) => { for (let k = 0; k < 40; k++) { const a = 128 + (r() - 0.5) * 120, b = 256 - r() * r() * 230, gr = x.createRadialGradient(a, b, 0, a, b, 30 + r() * 40); gr.addColorStop(0, 'rgba(14,12,10,0.22)'); gr.addColorStop(1, 'rgba(14,12,10,0)'); x.fillStyle = gr; x.fillRect(0, 0, S, S); } });
  // rust and water run down from a crack
  tile(13, (x, r) => { for (let k = 0; k < 9; k++) { const a = 60 + r() * 136, gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(110,62,30,0.55)'); gr.addColorStop(1, 'rgba(110,62,30,0)'); x.fillStyle = gr; x.fillRect(a, 0, 4 + r() * 10, 120 + r() * 136); } });
  tile(14, spray('EVAC\nCANCELLED', 'rgba(176,30,24,0.9)', 54, -0.06));
  tile(15, spray('SHOOT\nTHE HEAD', 'rgba(20,20,20,0.88)', 62, 0.05));
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  adAtlas = t; return t;
}
// each tile's size on a wall (m, w by h) and how high its middle sits (m)
const AD_SIZE = [[1.6, 1.1, 1.5], [1.4, 1.0, 1.4], [1.3, 0.95, 1.5], [1.3, 0.9, 1.3], [1.2, 0.9, 1.4], [1.4, 0.95, 1.5], [1.0, 1.0, 1.55], [0.7, 0.7, 1.3], [0.8, 0.8, 1.2], [0.7, 0.9, 1.1], [0.8, 0.8, 1.3], [0.42, 0.42, 1.45], [1.3, 1.7, 0.9], [0.8, 1.4, 1.5], [1.3, 0.9, 1.6], [1.2, 0.85, 1.4]];
// what a ray can land on: the map's solid meshes as built (none of its pictures, glass or what's only drawn from your
// own eyes, like the roofs over the store and the market), sorted into a grid of 2 m buckets by where each stands, so a
// ray is tested only against what's near it (a few dozen pieces, not the thousands in a map: dressing the Farm went
// from nearly two seconds to a small fraction of one)
const AD_BUCKET = 2;
function adTargets(g) {
  g.updateMatrixWorld(true);
  const list = [], box = new THREE.Box3();
  g.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent || o.geometry.type === 'PlaneGeometry') return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    list.push(o);
  });
  const grid = new Map(), key = (a, b) => a * 4096 + b, cellOf = v => Math.floor(v / AD_BUCKET);
  for (const o of list) {
    box.setFromObject(o); if (box.isEmpty()) continue;
    for (let a = cellOf(box.min.x); a <= cellOf(box.max.x); a++) for (let b = cellOf(box.min.z); b <= cellOf(box.max.z); b++) { const k = key(a, b); let L = grid.get(k); if (!L) grid.set(k, L = []); L.push(o); }
  }
  // (what's near the segment from (x0, z0) to (x1, z1), no piece twice)
  return { near(x0, z0, x1, z1) { const out = new Set(); for (let a = cellOf(Math.min(x0, x1)); a <= cellOf(Math.max(x0, x1)); a++) for (let b = cellOf(Math.min(z0, z1)); b <= cellOf(Math.max(z0, z1)); b++) { const L = grid.get(key(a, b)); if (L) for (const o of L) out.add(o); } return [...out]; } };
}
function adWalls(g, M, W, H, X, Z, kind, tall, open, wallSide, r, targets) {
  const rc = new THREE.Raycaster(), V = (a, b, c) => new THREE.Vector3(a, b, c), nm = new THREE.Matrix3();
  const hitAt = (o, d, far) => { rc.set(o, d); rc.far = far; const h = rc.intersectObjects(targets.near(o.x, o.z, o.x + d.x * far, o.z + d.z * far), false)[0]; return h || null; };
  const cand = []; for (const [i, j] of open) for (const s of wallSide(i, j)) cand.push([i, j, s]);
  const want = Math.round(cand.length * AD.wallDecals), P = [], N = [], U = [], placed = [];
  for (let tries = 0; tries < want * 6 && placed.length < want; tries++) {
    const [i, j, [a, b]] = cand[Math.floor(r() * cand.length)], tl = Math.floor(r() * AD_TILES), [w, h, y] = AD_SIZE[tl];
    const k = kind(i + a, j + b), top = k === '#' ? 3 : M.h[k] || 0; if (y + h / 2 > top - 0.15) continue;
    const along = r() - 0.5, ox = X(i) + (b ? along * 0.8 : 0), oz = Z(j) + (a ? along * 0.8 : 0);
    const hit = hitAt(V(ox, y, oz), V(a, 0, b), 1.4); if (!hit || !hit.face) continue;
    nm.getNormalMatrix(hit.object.matrixWorld); const n = hit.face.normal.clone().applyMatrix3(nm).normalize();
    if (Math.abs(n.y) > 0.3 || n.x * a + n.z * b > -0.7) continue;
    // (what it hit is one of the plan's tall things, not a low prop in front of it)
    const hx = Math.floor(hit.point.x - n.x * 0.06 - X(0) + 0.5), hz = Math.floor(hit.point.z - n.z * 0.06 - Z(0) + 0.5), hk = kind(hx, hz);
    if (!tall(hk) || AD_THIN.includes(hk)) continue;
    if (placed.some(q => q.distanceTo(hit.point) < 1.8)) continue;
    // its corners all on the same face (none off an edge, into a doorway or over a gap)
    const u = V(-n.z, 0, n.x), up = V(0, 1, 0), base = hit.point.clone(); let ok = true;
    for (const [cu, cv] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      const p = base.clone().addScaledVector(u, cu * w).addScaledVector(up, cv * h).addScaledVector(n, 0.35), hh = hitAt(p, n.clone().negate(), 0.7);
      if (!hh || Math.abs(hh.distance - 0.35) > 0.04) { ok = false; break; }
    }
    if (!ok) continue;
    placed.push(base);
    const c0 = base.clone().addScaledVector(n, 0.012), tu = (tl % 4) / 4, tv = 1 - (Math.floor(tl / 4) + 1) / 4;
    const corner = (cu, cv) => c0.clone().addScaledVector(u, cu * w).addScaledVector(up, cv * h);
    const q = [corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5)], quv = [[tu, tv], [tu + 0.25, tv], [tu + 0.25, tv + 0.25], [tu, tv + 0.25]];
    for (const vi of [0, 1, 2, 0, 2, 3]) { P.push(q[vi].x, q[vi].y, q[vi].z); N.push(n.x, n.y, n.z); U.push(quv[vi][0], quv[vi][1]); }
  }
  if (!P.length) return;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  const mat = lit(new THREE.MeshLambertMaterial({ map: adAtlasTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 'tree');
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.renderOrder = 2; g.add(m);
}

// ---- the tops of what's tall (what the camera from above sees most of): grime, rust and standing water in patches
// over them, and now and then what someone left up there (a tarp weighed down with crates, jerry cans, a sleeping
// bag, sandbags round a lookout, a radio mast), each laid on a flat top found by a ray from above and kept wholly on
// it. Nothing up there is anywhere you stand or see through, so it changes no line of sight
let adRoofAtlas = null;
function adRoofTex() {
  if (adRoofAtlas) return adRoofAtlas;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S * 2; const x = c.getContext('2d'), r = seeded(4321);
  const blot = (cx, cz, rad, col) => { const gr = x.createRadialGradient(cx, cz, 0, cx, cz, rad); gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); x.fillStyle = gr; x.fillRect(cx - rad, cz - rad, rad * 2, rad * 2); };
  // rust bloom; dark grime and bird mess; standing water; ash and fallen leaves
  for (let k = 0; k < 30; k++) blot(20 + r() * 216, 20 + r() * 216, 14 + r() * 40, `rgba(${110 + r() * 30 | 0},${56 + r() * 20 | 0},26,0.35)`);
  for (let k = 0; k < 26; k++) blot(256 + 20 + r() * 216, 20 + r() * 216, 16 + r() * 44, 'rgba(24,22,20,0.32)'); for (let k = 0; k < 40; k++) { x.fillStyle = 'rgba(226,222,210,0.6)'; x.beginPath(); x.arc(256 + r() * 256, r() * 256, 1 + r() * 2.5, 0, 7); x.fill(); }
  for (let k = 0; k < 6; k++) blot(40 + r() * 176, 256 + 40 + r() * 176, 30 + r() * 50, 'rgba(44,58,66,0.55)');
  for (let k = 0; k < 18; k++) blot(256 + 30 + r() * 196, 256 + 30 + r() * 196, 20 + r() * 40, 'rgba(50,48,46,0.35)'); for (let k = 0; k < 90; k++) { x.save(); x.translate(256 + r() * 256, 256 + r() * 256); x.rotate(r() * 6.3); x.fillStyle = ['rgba(122,82,36,0.85)', 'rgba(150,104,40,0.8)', 'rgba(92,70,38,0.85)'][k % 3]; x.beginPath(); x.ellipse(0, 0, 6, 3, 0, 0, 7); x.fill(); x.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; adRoofAtlas = t; return t;
}
function adRoofs(g, M, W, H, X, Z, kind, tall, r, targets) {
  const rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), V3 = THREE.Vector3;
  const topAt = (x, z) => { rc.set(new V3(x, 9, z), down); rc.far = 9; const h = rc.intersectObjects(targets.near(x, z, x, z), false)[0]; return h && h.face ? h : null; };
  const cells = []; for (let jj = 0; jj < H; jj++) for (let ii = 0; ii < W; ii++) { const k = kind(ii, jj); if (tall(k) && k !== '#' && !AD_THIN.includes(k)) cells.push([ii, jj]); }
  const P = [], N = [], U = [], props = [];
  const flatTop = (x, z, hw, hd) => {   // (a top at this spot, flat and whole hw by hd round it, or null)
    const c = topAt(x, z); if (!c || c.point.y < 1.6 || c.point.y > 6) return null;
    const nm = new THREE.Matrix3().getNormalMatrix(c.object.matrixWorld), n = c.face.normal.clone().applyMatrix3(nm).normalize(); if (n.y < 0.95) return null;
    for (const [a, b] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) { const q = topAt(x + a, z + b); if (!q || Math.abs(q.point.y - c.point.y) > 0.03) return null; }
    return c.point.y;
  };
  for (const [ii, jj] of cells) {
    if (r() > 0.45) continue;
    const x = X(ii) + (r() - 0.5) * 0.4, z = Z(jj) + (r() - 0.5) * 0.4, s = 0.6 + r() * 0.5, y = flatTop(x, z, s / 2, s / 2); if (y === null) continue;
    const tl = Math.floor(r() * 4), tu = (tl % 2) / 2, tv = 1 - (Math.floor(tl / 2) + 1) / 2, a = r() * 6.28, ca = Math.cos(a) * s / 2, sa = Math.sin(a) * s / 2;
    const q = [[-ca + sa, -sa - ca], [ca + sa, sa - ca], [ca - sa, sa + ca], [-ca - sa, -sa + ca]].map(([dx, dz]) => [x + dx, y + 0.008, z + dz]), quv = [[tu, tv], [tu + 0.5, tv], [tu + 0.5, tv + 0.5], [tu, tv + 0.5]];
    for (const vi of [0, 2, 1, 0, 3, 2]) { P.push(...q[vi]); N.push(0, 1, 0); U.push(...quv[vi]); }
    if (r() < 0.22) props.push([x, y, z, r()]);
  }
  if (P.length) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    const m = new THREE.Mesh(geo, lit(new THREE.MeshLambertMaterial({ map: adRoofTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 'tree')); m.receiveShadow = true; m.renderOrder = 2; g.add(m);
  }
  // what's left up there: each kept on its top (checked over its whole footprint), dithered from above like the top
  // it stands on
  const B = [], add = (w, h, d, col, x, y, z, ry) => B.push([w, h, d, col, x, y, z, ry]);
  for (const [x, y, z, t] of props) {
    const ry = Math.floor(t * 40) * 0.157;
    if (t < 0.3 && flatTop(x, z, 0.9, 0.9) !== null) { add(1.7, 0.05, 1.3, 0x2f4a6a, x, y + 0.03, z, ry); add(0.4, 0.3, 0.4, 0x7a5a3a, x + 0.55, y + 0.2, z + 0.4, ry); add(0.4, 0.3, 0.4, 0x6a4a2a, x - 0.6, y + 0.2, z - 0.4, ry); }   // (a tarp, crates on its corners)
    else if (t < 0.5 && flatTop(x, z, 0.4, 0.4) !== null) { for (let k = 0; k < 3; k++) add(0.18, 0.46, 0.34, [0x4d5536, 0x8a2a20, 0x3a3c3e][k], x - 0.22 + k * 0.22, y + 0.23, z, ry); }   // (jerry cans)
    else if (t < 0.7 && flatTop(x, z, 0.5, 1.0) !== null) { add(0.75, 0.14, 1.9, 0x4d5536, x, y + 0.07, z, ry); add(0.5, 0.12, 0.35, 0x8a8478, x, y + 0.2, z - 0.7, ry); }   // (a sleeping bag and its pillow of clothes)
    else if (t < 0.88 && flatTop(x, z, 0.9, 0.9) !== null) { for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; add(0.5, 0.2, 0.3, 0x8f7c55, x + Math.cos(a) * 0.75, y + 0.1 + (k % 2) * 0.2, z + Math.sin(a) * 0.75, -a); } }   // (sandbags round a lookout)
    else if (flatTop(x, z, 0.3, 0.3) !== null) { add(0.05, 2.6, 0.05, 0x3a3c3e, x, y + 1.3, z, 0); add(0.7, 0.04, 0.04, 0x3a3c3e, x, y + 2.3, z, ry); add(0.5, 0.04, 0.04, 0x3a3c3e, x, y + 2.0, z, ry + 1.57); add(0.3, 0.2, 0.2, 0x55603e, x, y + 0.1, z + 0.2, 0); }   // (a radio mast and its set)
  }
  if (B.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lit(new THREE.MeshLambertMaterial({ color: 0xffffff }), 'tree'), B.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    B.forEach(([w, h, d, c, x, y, z, ry], n) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d)); im.setMatrixAt(n, m4); im.setColorAt(n, col.setHex(c)); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; g.add(im);
  }
}

// ---- litter, camps and body bags, all of it under a quarter metre: instanced by shape, each instance its colour
function adLitter(g, W, H, X, Z, open, wallSide, camps, outdoor, r) {
  const T = {
    paper: [new THREE.BoxGeometry(0.21, 0.004, 0.3), [0xe8e4da, 0xd8cfa8, 0xc8c8c0, 0xe0d0c0]],
    card: [new THREE.BoxGeometry(0.62, 0.012, 0.46), [0x9a7b52, 0x8a6a44, 0xa88a60]],
    can: [new THREE.CylinderGeometry(0.033, 0.033, 0.12, 8), [0xb2271f, 0x3e8a5a, 0xb8bcc0, 0x2f6aa0, 0xd8b23a]],
    bottle: [new THREE.CylinderGeometry(0.036, 0.036, 0.26, 8), [0x2e5a32, 0x5a3a1e, 0x3a6a7a]],
    rag: [new THREE.BoxGeometry(0.42, 0.025, 0.32), [0x3a3a44, 0x5a3a30, 0x4a5a6a, 0x6a6a5a, 0x7a2a24]],
    brass: [new THREE.CylinderGeometry(0.006, 0.006, 0.026, 6), [0xb08a3a, 0xc29a48]],
    brick: [new THREE.BoxGeometry(0.21, 0.065, 0.1), [0x7e4434, 0x8a8a84, 0x6e3a2c]],
    plank: [new THREE.BoxGeometry(0.95, 0.025, 0.12), [0x7a5a3a, 0x56402a, 0x3a2a1e]],
    tyre: [new THREE.TorusGeometry(0.3, 0.1, 6, 14), [0x1d1d1f]],
    bag: [new THREE.CapsuleGeometry(0.2, 1.3, 3, 8).scale(0.55, 1, 1), [0x4d5536, 0x2f4a7a, 0x7a2a24, 0x5a5a62]],
    body: [new THREE.CapsuleGeometry(0.24, 1.35, 3, 8).scale(0.5, 1, 1), [0x1a1c1e, 0x2a2c2e]],
    stone: [new THREE.DodecahedronGeometry(0.09, 0), [0x6a6660, 0x8a857c]],
    stick: [new THREE.CylinderGeometry(0.025, 0.03, 0.55, 5), [0x1f1b18, 0x2a2220]],
    pot: [new THREE.CylinderGeometry(0.13, 0.11, 0.13, 10), [0x3a3c3e]],
    pack: [new THREE.BoxGeometry(0.34, 0.2, 0.42), [0x4d5536, 0x6a3a2a, 0x2f3a4a]]
  };
  const L = Object.fromEntries(Object.keys(T).map(k => [k, []]));
  const put = (k, x, y, z, ry, rx = 0, rz = 0, s = 1) => L[k].push([x, y, z, ry, rx, rz, s]);
  // the litter: weighted toward the walls, where it's blown and kicked
  const n = Math.round(open.length * AD.litter);
  for (let k = 0; k < n; k++) {
    const [i, j] = open[Math.floor(r() * open.length)], ws = wallSide(i, j); if (!ws.length && r() < 0.55) continue;
    let x = X(i) + (r() - 0.5) * 0.9, z = Z(j) + (r() - 0.5) * 0.9; if (ws.length && r() < 0.7) { const [a, b] = ws[0]; if (a) x = X(i) + a * (0.25 + r() * 0.2); if (b) z = Z(j) + b * (0.25 + r() * 0.2); }
    const t = r(), ry = r() * 6.28;
    if (t < 0.3) put('paper', x, 0.035, z, ry, (r() - 0.5) * 0.1, (r() - 0.5) * 0.1);
    else if (t < 0.4) put('card', x, 0.04, z, ry);
    else if (t < 0.55) put('can', x, 0.063, z, ry, 0, Math.PI / 2);
    else if (t < 0.63) put('bottle', x, 0.066, z, ry, 0, Math.PI / 2);
    else if (t < 0.73) put('rag', x, 0.045, z, ry, 0, (r() - 0.5) * 0.15);
    else if (t < 0.83) { for (let q = 0; q < 6 + r() * 10; q++) put('brass', x + (r() - 0.5) * 0.7, 0.036, z + (r() - 0.5) * 0.7, r() * 6.28, 0, Math.PI / 2); }   // (where a fight was)
    else if (t < 0.92 && ws.length) { for (let q = 0; q < 2 + r() * 4; q++) put('brick', x + (r() - 0.5) * 0.5, 0.06, z + (r() - 0.5) * 0.5, r() * 6.28, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4); }
    else if (t < 0.97 && ws.length) put('plank', x, 0.05, z, ry, 0, (r() - 0.5) * 0.2);
    else if (ws.length && outdoor) put('tyre', x, 0.1, z, 0, Math.PI / 2);
  }
  // the camps: a sleeping bag along the wall, the fire ring, a pot, a pack, tins
  for (const [i, j] of camps) {
    const ws = wallSide(i, j), ax = ws.find(q => q[0])[0], bz = ws.find(q => q[1])[1], x = X(i), z = Z(j);
    put('bag', x + ax * 0.32, 0.11, z - bz * 0.1, 0, 0, Math.PI / 2, 1);
    const fx = x - ax * 0.3, fz = z - bz * 0.35;
    for (let s = 0; s < 8; s++) { const a = s / 8 * 6.28; put('stone', fx + Math.cos(a) * 0.3, 0.06, fz + Math.sin(a) * 0.3, r() * 6.28, r(), r()); }
    for (let s = 0; s < 3; s++) put('stick', fx, 0.05, fz, s * 1.1 + r(), 0, Math.PI / 2 - 0.1);
    put('pot', fx + 0.45, 0.065, fz - 0.2, 0); put('pack', x + ax * 0.2, 0.1, z + bz * 0.3, r() * 6.28);
    for (let s = 0; s < 4; s++) put('can', fx + (r() - 0.5) * 1.0, 0.063, fz + (r() - 0.5) * 1.0, r() * 6.28, 0, Math.PI / 2);
  }
  // body bags laid out by a wall
  const wallCells = open.filter(([i, j]) => wallSide(i, j).length === 1);
  for (let k = 0; k < AD.bodyBags && wallCells.length; k++) {
    const [i, j] = wallCells[Math.floor(r() * wallCells.length)], [a, b] = wallSide(i, j)[0];
    put('body', X(i) + a * 0.15, 0.12, Z(j) + b * 0.15, a ? Math.PI / 2 : 0, 0, Math.PI / 2, 1);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
  for (const k of Object.keys(T)) {
    const list = L[k]; if (!list.length) continue;
    const [geo, cols] = T[k], im = new THREE.InstancedMesh(geo, lam(0xffffff), list.length);
    list.forEach(([x, y, z, ry, rx, rz, s], n2) => {
      e.set(rx, ry, rz, 'YXZ'); q.setFromEuler(e); s3.setScalar(s); m4.compose(p3.set(x, Math.min(y, AD.top), z), q, s3); im.setMatrixAt(n2, m4);
      col.setHex(cols[n2 % cols.length]).multiplyScalar(0.8 + ((n2 * 7919) % 100) / 400); im.setColorAt(n2, col);
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = k === 'bag' || k === 'body' || k === 'tyre' || k === 'card'; im.receiveShadow = true; im.frustumCulled = false; g.add(im);
  }
}

// ---- smoke beyond the map: a few columns rising from fires still burning somewhere past its north and west edges
// (the far side from the camera from above), each puff drifting up, spreading and thinning, and starting again
let adSmokeTex = null;
function adSmoke(g, x0, z0, W, H, r) {
  if (!adSmokeTex) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), rr2 = seeded(77); for (let k = 0; k < 26; k++) { const a = 30 + rr2() * 68, b = 30 + rr2() * 68, rad = 18 + rr2() * 30, gr = x.createRadialGradient(a, b, 0, a, b, rad); gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); } adSmokeTex = new THREE.CanvasTexture(c); }
  const spots = [[x0 - 14 - r() * 10, z0 + H * (0.2 + r() * 0.4)], [x0 + W * (0.25 + r() * 0.2), z0 - 16 - r() * 10], [x0 + W * (0.7 + r() * 0.2), z0 - 22 - r() * 12]];
  const puffs = [];
  for (const [sx, sz] of spots) for (let k = 0; k < 9; k++) {
    const m = new THREE.SpriteMaterial({ map: adSmokeTex, color: 0x45403b, transparent: true, depthWrite: false, opacity: 0.5 });
    const sp = new THREE.Sprite(m); sp.userData = { sx, sz, ph: k / 9, sp: 0.018 + r() * 0.008, dx: (r() - 0.5) * 3 }; g.add(sp); puffs.push(sp);
  }
  // (one of them steps them all each frame it's drawn)
  puffs[0].onBeforeRender = () => {
    const t = performance.now() / 1000;
    for (const sp of puffs) {
      const u = sp.userData, f = (u.ph + t * u.sp) % 1;
      sp.position.set(u.sx + u.dx * f + f * f * 6, 2 + f * 22, u.sz - f * 3); sp.scale.setScalar(3 + f * 11); sp.material.opacity = 0.55 * Math.min(1, f * 6) * (1 - f);
    }
  };
}
threadJob('floor', adPaintFloor);
