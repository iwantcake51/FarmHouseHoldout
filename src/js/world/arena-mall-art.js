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
// ---- through the glass: two metres of a shop's floor (a cell a half), lit, its goods along the back and on tables,
// the glass's own frames and a streak of reflection over it
export function mallShopTex(type, seed) {
  const W = 512, H = 256, [c, x] = mallCan(W, H), r = seeded(seed);
  const back = { clothes: '#d9cfc0', tech: '#e8ecef', books: '#c9b48e', shoes: '#ddd5c8', jewel: '#2a2230', toys: '#f2e6c4' }[type] || '#ddd';
  x.fillStyle = back; x.fillRect(0, 0, W, H);
  // the ceiling's downlights and the floor (perspective: the far wall's foot two thirds down)
  const fy = H * 0.72; x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, 0, W, H * 0.12);
  for (let k = 0; k < 4; k++) { const g = x.createRadialGradient(64 + k * 128, 6, 2, 64 + k * 128, 6, 70); g.addColorStop(0, 'rgba(255,248,225,0.9)'); g.addColorStop(1, 'rgba(255,248,225,0)'); x.fillStyle = g; x.fillRect(0, 0, W, 90); }
  x.fillStyle = type === 'jewel' ? '#1a141f' : type === 'tech' ? '#b8bec4' : '#8f7a62'; x.beginPath(); x.moveTo(0, H); x.lineTo(0, fy + 10); x.lineTo(W, fy + 10); x.lineTo(W, H); x.fill();
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, fy + 6, W, 6);
  const col = () => `hsl(${Math.floor(r() * 360)},${30 + r() * 45}%,${30 + r() * 35}%)`;
  if (type === 'clothes') {
    for (const rx of [30, 280]) { x.fillStyle = '#555'; x.fillRect(rx, 70, 200, 4); for (let k = 0; k < 13; k++) { x.fillStyle = col(); const gx = rx + 6 + k * 15; x.fillRect(gx, 76, 12, 70 + r() * 40); } }
    // a mannequin in the window
    x.fillStyle = '#efe9e0'; x.beginPath(); x.arc(250, 70, 13, 0, 7); x.fill(); x.fillRect(236, 84, 28, 70); x.fillStyle = col(); x.fillRect(234, 92, 32, 60); x.fillStyle = '#efe9e0'; x.fillRect(240, 152, 8, 50); x.fillRect(252, 152, 8, 50); x.fillStyle = '#777'; x.fillRect(230, 200, 40, 5);
  } else if (type === 'tech') {
    for (let k = 0; k < 6; k++) { const sx = 20 + k * 82; x.fillStyle = '#111'; x.fillRect(sx, 50, 70, 44); const g = x.createLinearGradient(sx, 50, sx + 70, 94); g.addColorStop(0, `hsl(${190 + r() * 60},70%,55%)`); g.addColorStop(1, `hsl(${250 + r() * 60},60%,35%)`); x.fillStyle = g; x.fillRect(sx + 3, 53, 64, 38); }
    for (const tx of [60, 300]) { x.fillStyle = '#f5f5f5'; x.fillRect(tx, 150, 150, 10); x.fillStyle = '#ccc'; x.fillRect(tx + 10, 160, 8, 30); x.fillRect(tx + 132, 160, 8, 30); for (let k = 0; k < 5; k++) { x.fillStyle = '#222'; x.fillRect(tx + 10 + k * 28, 138, 20, 12); } }
  } else if (type === 'books') {
    for (let s = 0; s < 4; s++) { const y = 40 + s * 36; x.fillStyle = '#6a4a2e'; x.fillRect(16, y + 30, W - 32, 5); for (let bx = 18; bx < W - 22;) { const w = 5 + r() * 8, h = 18 + r() * 12; x.fillStyle = col(); x.fillRect(bx, y + 30 - h, w, h); bx += w + 1; } }
    x.fillStyle = '#7a5a3a'; x.fillRect(190, 168, 130, 14); x.fillStyle = '#5a3f28'; x.fillRect(196, 182, 10, 22); x.fillRect(304, 182, 10, 22); for (let k = 0; k < 6; k++) { x.fillStyle = col(); x.fillRect(196 + k * 20, 156, 16, 12); }
  } else if (type === 'shoes') {
    for (let s = 0; s < 4; s++) { const y = 46 + s * 32; x.fillStyle = '#fff'; x.fillRect(20, y + 18, W - 40, 4); for (let k = 0; k < 14; k++) { x.fillStyle = col(); const sx = 30 + k * 33; x.beginPath(); x.moveTo(sx, y + 18); x.lineTo(sx + 22, y + 18); x.lineTo(sx + 22, y + 10); x.quadraticCurveTo(sx + 8, y + 10, sx + 4, y + 2); x.lineTo(sx, y + 2); x.fill(); } }
    x.fillStyle = '#6b3a3a'; x.fillRect(200, 172, 110, 22);
  } else if (type === 'jewel') {
    for (const cx of [40, 290]) { x.fillStyle = '#3a2e40'; x.fillRect(cx, 140, 180, 50); x.fillStyle = 'rgba(200,220,255,0.35)'; x.fillRect(cx, 112, 180, 28); x.strokeStyle = '#c9a75a'; x.lineWidth = 2; x.strokeRect(cx, 112, 180, 78); for (let k = 0; k < 18; k++) { x.fillStyle = r() < 0.5 ? '#f2e2a0' : '#eef6ff'; x.beginPath(); x.arc(cx + 10 + r() * 160, 118 + r() * 18, 1.5 + r() * 2, 0, 7); x.fill(); } }
    for (let k = 0; k < 3; k++) { const g = x.createRadialGradient(80 + k * 170, 60, 2, 80 + k * 170, 60, 40); g.addColorStop(0, 'rgba(255,230,170,0.5)'); g.addColorStop(1, 'rgba(255,230,170,0)'); x.fillStyle = g; x.fillRect(0, 0, W, 120); }
  } else {   // toys
    for (let s = 0; s < 3; s++) { const y = 50 + s * 42; x.fillStyle = '#b07a3a'; x.fillRect(16, y + 32, W - 32, 5); for (let bx = 22; bx < W - 40;) { const w = 18 + r() * 22, h = 16 + r() * 16; x.fillStyle = `hsl(${Math.floor(r() * 360)},75%,55%)`; x.fillRect(bx, y + 32 - h, w, h); bx += w + 4; } }
    x.fillStyle = '#e04a3a'; x.beginPath(); x.arc(256, 185, 18, 0, 7); x.fill(); x.fillStyle = '#3a8ae0'; x.fillRect(320, 170, 34, 34);
  }
  // the glass: its frames (at each cell's edges and between), a soft reflection streak, a little door vinyl
  x.fillStyle = 'rgba(30,34,38,0.95)'; x.fillRect(0, 0, 6, H); x.fillRect(W - 6, 0, 6, H); x.fillRect(W / 2 - 4, 0, 8, H);
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0.0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(0.58, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, 0, W, H);
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
// ---- a kiosk's lit display (kind: 0 phones, 1 sunglasses, 2 perfume)
export function mallAdTex(kind) {
  const W = 256, H = 288, [c, x] = mallCan(W, H), hue = [205, 30, 320][kind % 3];
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `hsl(${hue},45%,72%)`); g.addColorStop(1, `hsl(${hue},40%,38%)`); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,0.85)';
  if (kind % 3 === 0) { x.fillStyle = '#16181c'; x.fillRect(84, 60, 88, 170); x.fillStyle = `hsl(${hue},70%,60%)`; x.fillRect(90, 70, 76, 148); }
  else if (kind % 3 === 1) { x.fillStyle = '#1a1a1a'; x.beginPath(); x.ellipse(90, 140, 40, 26, 0, 0, 7); x.ellipse(166, 140, 40, 26, 0, 0, 7); x.fill(); x.fillRect(120, 130, 16, 6); }
  else { x.fillStyle = 'rgba(255,240,250,0.8)'; x.fillRect(98, 110, 60, 110); x.fillStyle = '#c9a75a'; x.fillRect(116, 88, 24, 22); }
  x.fillStyle = '#fff'; mallFit(x, ['NEW SEASON', 'SUMMER SHADES', 'EAU DE NUIT'][kind % 3], W / 2, 34, W - 30, 30, '700', '"Archivo", Arial, sans-serif');
  mallFit(x, ['Cases from $9', '2 for $40', 'Try me'][kind % 3], W / 2, H - 28, W - 30, 22, '400', '"Archivo", Arial, sans-serif');
  return mallTexOf(c);
}
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
