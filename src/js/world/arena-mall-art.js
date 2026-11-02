// Larkspur Mall's printed and lit pictures (world/arena-mall.js puts them up): what's seen through each shop's glass,
// the shops' signs, the kiosks' displays, the directory boards, the food court's menus, the signs and posters back of
// house, the ceiling's tiles. Each drawn once on a canvas, its text always fitted inside its own margin (never run off
// an edge), and kept as a texture.

import { seeded } from '../core/math.js';

// the shops, in the order they're handed out along the concourse (type: what's drawn behind the glass; col: the sign)
export const MALL_STORES = [
  { name: 'Fern & Finch', type: 'clothes', col: '#2f4f5e' }, { name: 'VOLT', type: 'tech', col: '#1f2a3a' },
  { name: 'Paperleaf Books', type: 'books', col: '#3d5a3f' }, { name: 'Stride', type: 'shoes', col: '#6b3a3a' },
  { name: 'Pearl & Co.', type: 'jewel', col: '#5a4a6b' }, { name: 'Bramble Toys', type: 'toys', col: '#7a5a2a' },
  { name: 'Northline', type: 'clothes', col: '#3a3f46' }, { name: 'Lumen Optical', type: 'tech', col: '#2a4f4a' },
  { name: 'Copperpot Home', type: 'books', col: '#6a4a2e' }, { name: 'Pixel Games', type: 'toys', col: '#3a2e5a' }
];
// the two anchor stores (west, east)
export const MALL_ANCHORS = [{ name: "HARLOW'S", col: '#5c1f1f' }, { name: 'MERIDIAN', col: '#1f2f50' }];
const mallCan = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const mallTexOf = c => { const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };
// text in a box: as big as px, smaller till it fits w (never cut off)
function mallFit(x, s, cx, cy, w, px, weight = '700', fam = '"Bitter", Georgia, serif') {
  let p = px; x.font = `${weight} ${p}px ${fam}`;
  while (p > 8 && x.measureText(s).width > w) { p -= 2; x.font = `${weight} ${p}px ${fam}`; }
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, cx, cy);
}
// ---- through the glass: a shop's floor as the end left it. The room in perspective (the back wall, its sides running
// in, the floor's tiles and the ceiling's panels, most of its lights dead and one still on), its fittings drawn as
// solid things with their shading and the shadow under each shelf, the stock in muted shop colours and half of it
// gone (gaps on the shelves, things knocked onto the floor), a haze of dust in the air; and the glass itself, grimed
// toward its foot, smeared, now and then cracked, a streak of reflection across it
const mute = (r, l0 = 30, l1 = 58) => `hsl(${Math.floor(r() * 360)},${14 + r() * 26}%,${l0 + r() * (l1 - l0)}%)`;
const mallShade = (x, X, Y, w, h, c, r, k = 0.35) => {   // a block of colour with a lit top edge and a shaded side
  x.fillStyle = c; x.fillRect(X, Y, w, h); x.fillStyle = `rgba(0,0,0,${k})`; x.fillRect(X + w * 0.78, Y, w * 0.22, h); x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(X, Y, w, Math.max(1, h * 0.06));
};
export function mallShopTex(type, seed) {
  const W = 1024, H = 512, [c, x] = mallCan(W, H), r = seeded(seed);
  const wallC = { clothes: [206, 198, 186], tech: [196, 200, 204], books: [184, 168, 140], shoes: [204, 196, 184], jewel: [58, 50, 64], toys: [212, 200, 170] }[type] || [200, 200, 200];
  const vx = W * (0.4 + r() * 0.2), vy = H * 0.42, bx0 = W * 0.16, bx1 = W * 0.84, by0 = H * 0.16, by1 = H * 0.66;   // (the vanishing point; the back wall's box)
  const rgb = (a, k) => `rgb(${a.map(v => Math.round(v * k)).join(',')})`;
  // (the room: ceiling, side walls, floor, back wall, each its own light)
  x.fillStyle = rgb(wallC, 0.42); x.fillRect(0, 0, W, H);
  x.fillStyle = rgb(wallC, 0.55); x.beginPath(); x.moveTo(0, 0); x.lineTo(bx0, by0); x.lineTo(bx0, by1); x.lineTo(0, H); x.fill(); x.beginPath(); x.moveTo(W, 0); x.lineTo(bx1, by0); x.lineTo(bx1, by1); x.lineTo(W, H); x.fill();
  x.fillStyle = rgb(wallC, 0.35); x.beginPath(); x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(bx1, by0); x.lineTo(bx0, by0); x.fill();
  const flo = type === 'jewel' ? [40, 34, 44] : type === 'tech' ? [150, 154, 158] : [128, 112, 92];
  x.fillStyle = rgb(flo, 0.75); x.beginPath(); x.moveTo(0, H); x.lineTo(bx0, by1); x.lineTo(bx1, by1); x.lineTo(W, H); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1.5;
  for (let k = 0; k <= 12; k++) { const t = k / 12, fx = bx0 + (bx1 - bx0) * t; x.beginPath(); x.moveTo(fx, by1); x.lineTo(W * t, H); x.stroke(); }
  for (let k = 1; k < 6; k++) { const t = Math.pow(k / 6, 1.6), yy = by1 + (H - by1) * t, xl = bx0 * (1 - t), xr = bx1 + (W - bx1) * t; x.beginPath(); x.moveTo(xl, yy); x.lineTo(xr, yy); x.stroke(); }
  x.fillStyle = rgb(wallC, 0.78); x.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
  // (the ceiling's panels, dead, and the one light left, its pool on the back wall and the floor)
  for (let k = 0; k < 5; k++) { const t = (k + 0.5) / 5; x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(bx0 + (bx1 - bx0) * t - 30, by0 * (0.3 + 0.12 * k % 0.5), 60, 6); }
  const lx = bx0 + (bx1 - bx0) * (0.25 + r() * 0.5), pool = x.createRadialGradient(lx, by0, 4, lx, H * 0.55, H * 0.75); pool.addColorStop(0, 'rgba(255,240,205,0.55)'); pool.addColorStop(0.4, 'rgba(255,236,200,0.16)'); pool.addColorStop(1, 'rgba(255,236,200,0)');
  x.fillStyle = pool; x.fillRect(0, 0, W, H); x.fillStyle = 'rgba(255,246,220,0.9)'; x.fillRect(lx - 34, by0 * 0.42, 68, 7);
  const sy = by1, onFloor = [];   // (the back wall's foot: the fittings stand on it)
  // ---- the fittings and what's left on them
  if (type === 'books' || type === 'toys' || type === 'shoes') {
    const units = 3, uw = (bx1 - bx0 - 40) / units, rows = type === 'toys' ? 3 : 4;
    for (let u = 0; u < units; u++) {
      const ux = bx0 + 20 + u * uw, top = by0 + 18, hh = sy - top;
      x.fillStyle = '#3e3024'; x.fillRect(ux - 4, top - 6, uw - 4, hh + 6);   // (the unit's back, dark)
      for (let s2 = 0; s2 < rows; s2++) {
        const yb = top + (s2 + 1) * hh / rows - 6;
        // its stock along the shelf, with gaps where it's been taken
        for (let px = ux + 4; px < ux + uw - 14;) {
          if (r() < 0.22) { px += 10 + r() * 30; continue; }
          if (type === 'books') { const bw = 5 + r() * 9, bh = hh / rows * (0.55 + r() * 0.35), lean = r() < 0.08; const c2 = mute(r, 22, 50); x.save(); if (lean) { x.translate(px, yb); x.rotate(-0.35); x.translate(-px, -yb); } mallShade(x, px, yb - bh, bw, bh, c2, r, 0.3); x.fillStyle = 'rgba(230,214,170,0.55)'; x.fillRect(px + 1, yb - bh * 0.78, bw - 2, 2); x.fillRect(px + 1, yb - bh * 0.3, bw - 2, 1.5); x.restore(); px += bw + 0.6; }
          else if (type === 'toys') { const bw = 26 + r() * 30, bh = hh / rows * (0.45 + r() * 0.35), c2 = mute(r, 36, 60); mallShade(x, px, yb - bh, bw, bh, c2, r); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(px + bw * 0.15, yb - bh * 0.7, bw * 0.45, bh * 0.35); px += bw + 3; }
          else { const bw = 30 + r() * 8, bh = 16 + r() * 6, c2 = mute(r, 25, 55); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(px + 2, yb - 2, bw, 3); x.fillStyle = c2; x.beginPath(); x.moveTo(px, yb); x.lineTo(px + bw, yb); x.lineTo(px + bw, yb - bh * 0.45); x.quadraticCurveTo(px + bw * 0.35, yb - bh * 0.5, px + bw * 0.2, yb - bh); x.lineTo(px, yb - bh); x.fill(); x.fillStyle = 'rgba(240,236,228,0.8)'; x.fillRect(px, yb - 3, bw, 3); px += bw + 6; }
        }
        x.fillStyle = '#6a5440'; x.fillRect(ux - 4, yb, uw - 4, 6); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(ux - 4, yb + 6, uw - 4, 5);   // (the shelf's front edge and its shadow)
      }
      x.fillStyle = '#2e241a'; x.fillRect(ux - 6, top - 8, 6, hh + 8); x.fillRect(ux + uw - 10, top - 8, 6, hh + 8);   // (its uprights)
    }
    for (let k = 0; k < 9; k++) onFloor.push(type);
  } else if (type === 'clothes') {
    for (const [rx, rw] of [[bx0 + 20, (bx1 - bx0) * 0.42], [bx0 + (bx1 - bx0) * 0.52, (bx1 - bx0) * 0.44]]) {
      const ry = by0 + 40; x.fillStyle = '#7a7a78'; x.fillRect(rx, ry, rw, 5); x.fillRect(rx + 6, ry, 5, sy - ry); x.fillRect(rx + rw - 11, ry, 5, sy - ry);
      for (let gx = rx + 14; gx < rx + rw - 24;) {
        if (r() < 0.3) { gx += 14 + r() * 20; continue; }   // (taken)
        const gw = 26 + r() * 10, gh = 80 + r() * 70, c2 = mute(r, 24, 55);
        x.strokeStyle = '#555'; x.lineWidth = 2; x.beginPath(); x.moveTo(gx + gw / 2, ry + 5); x.lineTo(gx + gw / 2, ry + 12); x.stroke();
        x.fillStyle = c2; x.beginPath(); x.moveTo(gx + gw * 0.15, ry + 14); x.lineTo(gx + gw * 0.85, ry + 14); x.lineTo(gx + gw, ry + 26); x.lineTo(gx + gw * 0.9, ry + 14 + gh); x.lineTo(gx + gw * 0.1, ry + 14 + gh); x.lineTo(gx, ry + 26); x.fill();
        x.fillStyle = 'rgba(0,0,0,0.22)'; for (let f = 0; f < 3; f++) x.fillRect(gx + gw * (0.25 + f * 0.22), ry + 30, 2, gh - 20);   // (its folds)
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(gx + gw * 0.8, ry + 14, gw * 0.2, gh);
        gx += gw * 0.55;
      }
    }
    // a mannequin left standing, one arm gone
    const mx = bx0 + (bx1 - bx0) * 0.47, my = sy; x.fillStyle = '#d8d2c8'; x.beginPath(); x.ellipse(mx, my - 210, 14, 17, 0, 0, 7); x.fill(); x.fillRect(mx - 18, my - 192, 36, 95); x.fillRect(mx - 14, my - 97, 11, 92); x.fillRect(mx + 3, my - 97, 11, 92); x.fillRect(mx + 18, my - 188, 8, 70);
    x.fillStyle = mute(r, 22, 40); x.fillRect(mx - 20, my - 188, 40, 70); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(mx + 8, my - 192, 10, 190);
    for (let k = 0; k < 6; k++) onFloor.push('clothes');
  } else if (type === 'tech') {
    for (let k = 0; k < 5; k++) { const sx = bx0 + 24 + k * (bx1 - bx0 - 48) / 5, sw = (bx1 - bx0 - 48) / 5 - 14, syy = by0 + 30; x.fillStyle = '#0c0d0f'; x.fillRect(sx, syy, sw, sw * 0.58); const g2 = x.createLinearGradient(sx, syy, sx + sw, syy + sw * 0.58); g2.addColorStop(0, 'rgba(255,255,255,0.10)'); g2.addColorStop(0.5, 'rgba(255,255,255,0.02)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g2; x.fillRect(sx, syy, sw, sw * 0.58); if (r() < 0.4) { x.strokeStyle = 'rgba(220,230,240,0.5)'; x.lineWidth = 1; for (let q = 0; q < 5; q++) { x.beginPath(); x.moveTo(sx + sw * 0.5, syy + sw * 0.3); x.lineTo(sx + r() * sw, syy + r() * sw * 0.58); x.stroke(); } } }   // (the screens dead, one or two cracked)
    for (const tx of [bx0 + 30, bx0 + (bx1 - bx0) * 0.55]) { const tw = (bx1 - bx0) * 0.38, ty = sy - 70; mallShade(x, tx, ty, tw, 12, '#e8e8e6', r, 0.15); x.fillStyle = '#3a3c40'; x.fillRect(tx + 10, ty + 12, 10, 58); x.fillRect(tx + tw - 20, ty + 12, 10, 58); for (let q = 0; q < 6; q++) if (r() < 0.45) { x.fillStyle = '#1a1b1e'; x.fillRect(tx + 12 + q * (tw - 24) / 6, ty - 14, (tw - 24) / 6 - 8, 14); x.fillStyle = '#555'; x.fillRect(tx + 12 + q * (tw - 24) / 6 + 6, ty - 4, 4, 4); } }   // (the security cables, most of what they held gone)
    for (let k = 0; k < 7; k++) onFloor.push('tech');
  } else {   // jewel: the counters smashed, emptied
    for (const cx2 of [bx0 + 30, bx0 + (bx1 - bx0) * 0.53]) { const cw = (bx1 - bx0) * 0.4, cy2 = sy - 100; x.fillStyle = '#2a2230'; x.fillRect(cx2, cy2 + 40, cw, 60); x.fillStyle = 'rgba(190,210,235,0.18)'; x.fillRect(cx2, cy2, cw, 40); x.strokeStyle = '#a88a4a'; x.lineWidth = 2; x.strokeRect(cx2, cy2, cw, 100); x.strokeStyle = 'rgba(230,240,255,0.55)'; x.lineWidth = 1; for (let q = 0; q < 9; q++) { x.beginPath(); x.moveTo(cx2 + cw * r(), cy2); x.lineTo(cx2 + cw * r(), cy2 + 40); x.stroke(); } for (let q = 0; q < 3; q++) { x.fillStyle = r() < 0.5 ? '#e8d48a' : '#dfe8f2'; x.beginPath(); x.arc(cx2 + 10 + r() * (cw - 20), cy2 + 30 + r() * 8, 2, 0, 7); x.fill(); } }
    for (let k = 0; k < 10; k++) onFloor.push('glass');
  }
  // ---- what's on the floor: knocked off, dropped, kicked about
  for (const k of onFloor) {
    const t = r(), fx = bx0 * (1 - t) * r() + (bx0 + (bx1 - bx0) * r()) * (1 - (1 - t) * 0.6), fy = by1 + (H - by1) * Math.pow(t, 1.3) * 0.85, s2 = 0.6 + t * 1.2;
    if (k === 'glass') { x.fillStyle = 'rgba(220,232,245,0.45)'; for (let q = 0; q < 5; q++) { x.beginPath(); x.moveTo(fx + r() * 20, fy); x.lineTo(fx + r() * 20 + 6 * s2, fy + 3 * s2); x.lineTo(fx + r() * 20, fy + 5 * s2); x.fill(); } continue; }
    x.save(); x.translate(fx, fy); x.rotate((r() - 0.5) * 1.4);
    if (k === 'clothes') { x.fillStyle = mute(r, 22, 48); x.beginPath(); x.ellipse(0, 0, 26 * s2, 9 * s2, 0, 0, 7); x.fill(); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(-20 * s2, 2 * s2, 40 * s2, 3 * s2); }
    else { const w2 = (k === 'tech' ? 22 : k === 'books' ? 14 : 20) * s2, h2 = (k === 'books' ? 20 : 12) * s2; x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(-w2 / 2 + 3, -h2 / 2 + 3, w2, h2); mallShade(x, -w2 / 2, -h2 / 2, w2, h2, k === 'tech' ? '#2a2c30' : mute(r, 28, 55), r); }
    x.restore();
  }
  // ---- dust in the air, the far end hazier; then the glass: its frames, grime toward its foot, smears, the odd
  // crack, a streak of reflection, and the whole a little darker for being looked into from the light
  const hz = x.createLinearGradient(0, by0, 0, by1); hz.addColorStop(0, 'rgba(200,190,170,0.10)'); hz.addColorStop(1, 'rgba(200,190,170,0.04)'); x.fillStyle = hz; x.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
  const gr = x.createLinearGradient(0, H * 0.55, 0, H); gr.addColorStop(0, 'rgba(120,110,95,0)'); gr.addColorStop(1, 'rgba(120,110,95,0.45)'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
  for (let k = 0; k < 7; k++) { x.save(); x.translate(r() * W, H * (0.3 + r() * 0.6)); x.rotate((r() - 0.5) * 0.8); const sm = x.createLinearGradient(-60, 0, 60, 0); sm.addColorStop(0, 'rgba(230,226,215,0)'); sm.addColorStop(0.5, 'rgba(230,226,215,0.10)'); sm.addColorStop(1, 'rgba(230,226,215,0)'); x.fillStyle = sm; x.fillRect(-60, -10, 120, 20); x.restore(); }
  if (r() < 0.35) { const ox = W * (0.2 + r() * 0.6), oy = H * (0.25 + r() * 0.4); x.strokeStyle = 'rgba(235,240,245,0.6)'; x.lineWidth = 1.5; for (let q = 0; q < 8; q++) { x.beginPath(); x.moveTo(ox, oy); let px2 = ox, py2 = oy; const a = r() * 6.28; for (let st = 0; st < 4; st++) { px2 += Math.cos(a + (r() - 0.5) * 0.5) * (20 + r() * 40); py2 += Math.sin(a + (r() - 0.5) * 0.5) * (20 + r() * 40); x.lineTo(px2, py2); } x.stroke(); } }
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0.4, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.13)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(30,34,38,0.95)'; x.fillRect(0, 0, 10, H); x.fillRect(W - 10, 0, 10, H); x.fillRect(W / 2 - 6, 0, 12, H);
  x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(0, 0, W, H);
  return mallTexOf(c);
}
// ---- a shop's sign on its band: its name in light letters on its own colour, a lit edge
export function mallSignTex(name, col, w = 2) {
  const W = 128 * Math.max(2, Math.round(w * 2)), H = 128, [c, x] = mallCan(W, H);
  x.fillStyle = col; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(0, 0, W, 6); x.fillRect(0, H - 6, W, 6);
  x.shadowColor = 'rgba(255,240,210,0.9)'; x.shadowBlur = 14; x.fillStyle = '#fbf3e4';
  mallFit(x, name, W / 2, H / 2 + 3, W - 48, 84);
  return mallTexOf(c);
}
// ---- a kiosk's lit display: a printed ad behind its acrylic, the way they look after months of sun: a studio shot of
// the product (shaded like a photograph: its gloss, its shadow on the seamless backdrop), the brand's line in a proper
// face, the small print, the colours faded and gone toward cyan, a corner of the print come loose, the lightbox's glow
// uneven behind it (one tube gone)
export function mallAdTex(kind) {
  const W = 512, H = 576, [c, x] = mallCan(W, H), k3 = kind % 3, r = seeded(31 + kind * 7);
  const P = [{ bg: ['#d9e4ea', '#8fa6b4'], acc: '#1d3c55', head: 'NEW SEASON', sub: 'The phone that keeps up.', fine: 'Cases from $9 · Ask in store' },
    { bg: ['#f0dcc0', '#c48a52'], acc: '#4a2410', head: 'SUMMER SHADES', sub: 'Two pairs for $40', fine: 'Selected styles only · While stocks last' },
    { bg: ['#ead8e2', '#9a6a84'], acc: '#3a1a2e', head: 'EAU DE NUIT', sub: 'For the evenings that stay with you', fine: 'Try me at the counter' }][k3];
  // (the seamless backdrop, lit from above)
  const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, P.bg[0]); bg.addColorStop(1, P.bg[1]); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const sp = x.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, W * 0.7); sp.addColorStop(0, 'rgba(255,255,255,0.35)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = sp; x.fillRect(0, 0, W, H);
  // (the product, with its shadow on the backdrop under it)
  const cx = W / 2, cy = H * 0.45; x.fillStyle = 'rgba(0,0,0,0.22)'; x.beginPath(); x.ellipse(cx, cy + 130, 130, 18, 0, 0, 7); x.fill();
  if (k3 === 0) {
    x.save(); x.translate(cx, cy); x.rotate(-0.12);
    const body = x.createLinearGradient(-80, 0, 80, 0); body.addColorStop(0, '#2a2e34'); body.addColorStop(0.5, '#4a5058'); body.addColorStop(1, '#1c1f24'); x.fillStyle = body; mallRRect(x, -78, -150, 156, 300, 22); x.fill();
    const scr = x.createLinearGradient(-70, -140, 70, 140); scr.addColorStop(0, '#2b5a86'); scr.addColorStop(0.5, '#3f86a8'); scr.addColorStop(1, '#183650'); x.fillStyle = scr; mallRRect(x, -68, -138, 136, 276, 14); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.22)'; x.beginPath(); x.moveTo(-68, -138); x.lineTo(20, -138); x.lineTo(-68, 40); x.fill();
    x.fillStyle = '#0c0d10'; x.beginPath(); x.arc(0, -126, 4, 0, 7); x.fill(); x.restore();
  } else if (k3 === 1) {
    x.save(); x.translate(cx, cy + 20);
    for (const s2 of [-1, 1]) { const lg = x.createLinearGradient(s2 * 30, -40, s2 * 120, 40); lg.addColorStop(0, '#3a2a1e'); lg.addColorStop(0.6, '#140d08'); lg.addColorStop(1, '#5a3e24'); x.fillStyle = lg; x.beginPath(); x.ellipse(s2 * 74, 0, 64, 44, s2 * 0.08, 0, 7); x.fill(); x.fillStyle = 'rgba(255,240,220,0.35)'; x.beginPath(); x.ellipse(s2 * 74 - 20, -16, 22, 8, -0.4, 0, 7); x.fill(); }
    x.fillStyle = '#2a1c12'; x.fillRect(-14, -10, 28, 8); x.fillRect(-150, -18, 22, 6); x.fillRect(128, -18, 22, 6); x.restore();
  } else {
    x.save(); x.translate(cx, cy + 10);
    const gl = x.createLinearGradient(-70, 0, 70, 0); gl.addColorStop(0, 'rgba(120,60,90,0.9)'); gl.addColorStop(0.45, 'rgba(230,180,205,0.85)'); gl.addColorStop(1, 'rgba(90,40,70,0.95)'); x.fillStyle = gl; mallRRect(x, -70, -60, 140, 170, 18); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.45)'; x.fillRect(-50, -50, 12, 150);
    const cap = x.createLinearGradient(-26, 0, 26, 0); cap.addColorStop(0, '#8a6a2a'); cap.addColorStop(0.5, '#e8cc80'); cap.addColorStop(1, '#6a4e1e'); x.fillStyle = cap; x.fillRect(-26, -112, 52, 52); x.fillStyle = '#3a2a2e'; x.font = `600 22px ${'"Bitter", Georgia, serif'}`; x.textAlign = 'center'; x.fillText('nuit', 0, 40); x.restore();
  }
  // (the words)
  x.fillStyle = P.acc; x.textAlign = 'center'; mallFit(x, P.head, W / 2, 62, W - 70, 58, '800', '"Saira Extra Condensed", "Archivo", sans-serif');
  x.fillStyle = P.acc; mallFit(x, P.sub, W / 2, H - 96, W - 90, 26, '600', '"Bitter", Georgia, serif');
  x.fillStyle = 'rgba(0,0,0,0.55)'; mallFit(x, P.fine, W / 2, H - 52, W - 120, 15, '400', '"Archivo", Arial, sans-serif');
  // (months of sun: faded and gone a little cyan; the light behind it uneven, one tube out)
  x.fillStyle = 'rgba(190,225,230,0.18)'; x.fillRect(0, 0, W, H);
  const lb = x.createLinearGradient(0, 0, W, 0); lb.addColorStop(0, 'rgba(0,0,0,0.18)'); lb.addColorStop(0.35, 'rgba(0,0,0,0)'); lb.addColorStop(0.65, 'rgba(0,0,0,0)'); lb.addColorStop(1, `rgba(0,0,0,${0.15 + r() * 0.3})`); x.fillStyle = lb; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(30,24,20,0.85)'; x.beginPath(); x.moveTo(W, H - 70); x.lineTo(W, H); x.lineTo(W - 64, H); x.closePath(); x.fill();   // (the corner come loose, the dark behind it)
  x.fillStyle = 'rgba(245,240,230,0.85)'; x.beginPath(); x.moveTo(W, H - 70); x.lineTo(W - 64, H); x.lineTo(W - 50, H - 46); x.closePath(); x.fill();
  return mallTexOf(c);
}
function mallRRect(x, X, Y, w, h, rad) { x.beginPath(); x.moveTo(X + rad, Y); x.arcTo(X + w, Y, X + w, Y + h, rad); x.arcTo(X + w, Y + h, X, Y + h, rad); x.arcTo(X, Y + h, X, Y, rad); x.arcTo(X, Y, X + w, Y, rad); x.closePath(); }
// ---- the directory: the plan of the mall, the shops coloured in and listed, you are here
export function mallDirTex(plan, youI, youJ) {
  const W = 256, H = 448, [c, x] = mallCan(W, H), cw = plan[0].length, ch = plan.length, s = Math.floor((W - 24) / cw), ox = (W - cw * s) / 2, oy = 70;
  x.fillStyle = '#1d2226'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#e8e2d4'; mallFit(x, 'LARKSPUR MALL', W / 2, 26, W - 24, 26); x.fillStyle = '#9fb0b8'; mallFit(x, 'DIRECTORY', W / 2, 52, W - 24, 14, '400', '"Archivo", Arial, sans-serif');
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const k = plan[j][i], wall = k === '#' || k === 'h';
    x.fillStyle = wall ? '#56606a' : k === 'S' ? '#8a7a5a' : k === 'w' ? '#3f7f96' : j <= 6 ? '#3a3f44' : (i <= 6 || i >= cw - 7) && j <= 21 ? (i <= 6 ? '#6a3434' : '#344a6a') : j >= 23 ? '#5a4a36' : '#c9c1b0';
    x.fillRect(ox + i * s, oy + j * s, s, s);
  }
  x.fillStyle = '#e04a3a'; x.beginPath(); x.arc(ox + (youI + 0.5) * s, oy + (youJ + 0.5) * s, 5, 0, 7); x.fill();
  const ly = oy + ch * s + 16; x.fillStyle = '#e04a3a'; x.beginPath(); x.arc(20, ly, 5, 0, 7); x.fill(); x.fillStyle = '#e8e2d4'; x.textAlign = 'left'; x.font = '400 13px "Archivo", Arial, sans-serif'; x.fillText('You are here', 32, ly + 4);
  x.font = '400 11px "Archivo", Arial, sans-serif';
  const L = [MALL_ANCHORS[0].name, MALL_ANCHORS[1].name, ...MALL_STORES.map(t => t.name), 'Food court', 'Restrooms · Lifts'];
  L.forEach((n, k) => { const cx = k % 2 ? W / 2 + 6 : 14, cy = ly + 26 + Math.floor(k / 2) * 17; if (cy < H - 8) { x.fillStyle = '#c9c1b0'; x.fillText(n.slice(0, 18), cx, cy); } });
  return mallTexOf(c);
}
// ---- a food stall's menu board (n: which stall)
const MALL_FOOD = [['Wok & Roll', '#b8322a', ['Chow mein', 'Sweet & sour', 'Spring rolls', 'Fried rice']], ['Burger Barn', '#d08a2a', ['Classic', 'Double stack', 'Fries', 'Shakes']],
  ['Taco Loco', '#2a8a4a', ['Tacos', 'Burrito', 'Nachos', 'Churros']], ['Slice Corner', '#a8322a', ['Margherita', 'Pepperoni', 'Garlic knots', 'Soda']]];
export function mallMenuTex(n) {
  const W = 512, H = 192, [c, x] = mallCan(W, H), [name, col, items] = MALL_FOOD[n % MALL_FOOD.length];
  x.fillStyle = '#16181a'; x.fillRect(0, 0, W, H); x.fillStyle = col; x.fillRect(0, 0, W, 52);
  x.fillStyle = '#fff'; mallFit(x, name, W / 2, 28, W - 30, 36, '800', '"Archivo", Arial, sans-serif');
  items.forEach((t, k) => { const cx = 18 + (k % 2) * (W / 2), cy = 82 + Math.floor(k / 2) * 52; x.fillStyle = `hsl(${(n * 70 + k * 40) % 360},55%,50%)`; x.fillRect(cx, cy - 18, 48, 36); x.fillStyle = '#f2ead8'; x.textAlign = 'left'; x.font = '600 20px "Archivo", Arial, sans-serif'; x.fillText(t, cx + 58, cy + 2); x.fillStyle = '#e8c45a'; x.textAlign = 'right'; x.fillText('$' + (4 + ((n + k) * 7) % 6) + '.99', cx + W / 2 - 34, cy + 2); });
  return mallTexOf(c);
}
// ---- a printed sign (kind: 'staff', 'exit', 'safety', 'lift', 'sale'): plain, its words fitted
export function mallSignBoard(kind) {
  const D = { staff: ['#f2f0ea', '#1d2226', 'STAFF ONLY', 'Authorised personnel'], exit: ['#1e8a3e', '#ffffff', 'EXIT', ''], safety: ['#e8c42a', '#1d2226', 'SAFETY FIRST', 'Lift with your legs'],
    lift: ['#2a2e33', '#e8e2d4', 'LIFTS', 'Levels 1 – 2'], sale: ['#b8322a', '#ffffff', 'SALE', 'Up to 50% off'], fire: ['#c22a22', '#ffffff', 'FIRE', 'Extinguisher'] }[kind];
  const W = 256, H = kind === 'exit' ? 96 : 160, [c, x] = mallCan(W, H);
  x.fillStyle = D[0]; x.fillRect(0, 0, W, H); x.strokeStyle = D[1]; x.lineWidth = 4; x.strokeRect(6, 6, W - 12, H - 12); x.fillStyle = D[1];
  if (D[3]) { mallFit(x, D[2], W / 2, H * 0.4, W - 40, 44, '800', '"Archivo", Arial, sans-serif'); mallFit(x, D[3], W / 2, H * 0.74, W - 40, 20, '400', '"Archivo", Arial, sans-serif'); }
  else mallFit(x, D[2], W / 2, H / 2 + 2, W - 40, 56, '800', '"Archivo", Arial, sans-serif');
  return mallTexOf(c);
}
// ---- a banner hung from the ceiling over the concourse
export function mallBannerTex(n) {
  const W = 128, H = 384, [c, x] = mallCan(W, H), col = ['#5a2a4a', '#2a4a5a'][n % 2];
  x.fillStyle = col; x.fillRect(0, 0, W, H); x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(10, 10, W - 20, H - 20); x.fillStyle = col; x.fillRect(14, 14, W - 28, H - 28);
  x.fillStyle = '#f2ead8'; x.save(); x.translate(W / 2, H / 2); x.rotate(-Math.PI / 2); mallFit(x, n % 2 ? 'AUTUMN SALE' : 'LARKSPUR', 0, 0, H - 60, 52); x.restore();
  return mallTexOf(c);
}
// ---- the ceiling's tiles: 600 mm acoustic tiles in a light grid, a tile's worth (repeated)
export function mallCeilTex() {
  const W = 128, [c, x] = mallCan(W, W), r = seeded(77);
  x.fillStyle = '#e6e2da'; x.fillRect(0, 0, W, W);
  for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(120,112,100,${0.08 + r() * 0.12})`; x.fillRect(r() * W, r() * W, 1, 1); }
  x.fillStyle = '#b9b4aa'; x.fillRect(0, 0, W, 3); x.fillRect(0, 0, 3, W);
  const t = mallTexOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
