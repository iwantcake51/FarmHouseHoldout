// The words painted, sprayed and posted round every arena map, all drawn one way so they read as made things, not
// type laid over a picture (world/arena-route.js, arena-small.js, arena-farm.js, arena-mall-art.js, arena-dress.js):
//  - a sign board (paintSign): the board's own paint, faded where the sun's on it and grimed at its foot, a lined
//    border, letters in a sign-writer's face sitting a hair proud of it, the paint chipped back to what's under it at
//    the corners and edges (rusted steel or grey wood), a screw at each corner with its rust run down below it
//  - letters painted straight on a wall (paintLetters): the same letters with no board, worn through in places
//  - spray paint (paintSpray): a hurried hand in a marker face, the edges soft with overspray and a fine mist of dots
//    round them, runs dripping down from the bottoms of the strokes where the paint went on too thick
//  - a stencil (paintStencil): square capitals with the stencil's bridges left in the round letters, sprayed through
//    so the edges are soft, faded and patchy
//  - a notice (paintNotice): a printed sheet, typed, foxed and stained, its corners curling dark
// Each face comes from the page's own web fonts (index.html), asked for as soon as the game loads (so they're in long
// before a map goes up), and anything painted before one's arrived is painted again the moment it does (liveTex).
// Every bit of wear comes off the words' own dice, so a sign looks the same every time it's built.

import { seeded } from '../core/math.js';

// the faces: a sign-writer's condensed capitals, a road sign's plain face, a slab serif for the old shopfronts, a
// typewriter for what's printed, a marker for what's sprayed
const SIGN_FONT = { shop: '"Saira Extra Condensed", "Arial Narrow", sans-serif', road: '"Archivo", Arial, sans-serif', slab: '"Bitter", Georgia, serif', type: '"Special Elite", "Courier New", monospace', spray: '"Permanent Marker", "Archivo", sans-serif' };
const SIGN_WT = { shop: 800, road: 700, slab: 700, type: 400, spray: 400 };
const SIGN_LOAD = ['800 40px "Saira Extra Condensed"', '700 40px "Archivo"', '700 40px "Bitter"', '400 40px "Special Elite"', '400 40px "Permanent Marker"'];
// ---- painted again once the faces are in
const LIVE = [];
let liveDone = false;
function liveRepaint() { for (const L of LIVE) { const x = L.c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, L.c.width, L.c.height); L.paint(x, L.c.width, L.c.height); L.t.needsUpdate = true; } }
if (globalThis.document && document.fonts && document.fonts.load) {
  Promise.all(SIGN_LOAD.map(f => document.fonts.load(f).catch(() => null))).then(() => { liveDone = true; liveRepaint(); LIVE.length = 0; WHEN.splice(0).forEach(f => f()); });
}
// fn run once the faces are in (not at all if they already are: what was made with them is right as it is)
const WHEN = [];
export function whenFonts(fn) { if (!liveDone) WHEN.push(fn); }
// a picture painted on a w x h canvas by paint(ctx, w, h), as a texture; painted again if the faces weren't in yet
export function liveTex(w, h, paint, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (!liveDone) LIVE.push({ c, t, paint });
  return t;
}
const hashOf = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rgba = (hex, a) => { const n = parseInt(hex.slice(1, 7), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
// words set as big as they'll go in w by h (lines split on \n), with a little air between the letters
function fitFont(x, lines, face, w, h, sp = 0.04) {
  let s = Math.floor(h / lines.length / 1.08);
  const set = () => { x.font = `${SIGN_WT[face] || 700} ${s}px ${SIGN_FONT[face] || face}`; if ('letterSpacing' in x) x.letterSpacing = Math.round(s * sp) + 'px'; };
  set(); while (s > 8 && lines.some(L => x.measureText(L).width > w)) { s -= 2; set(); }
  return s;
}
// the paint come away: blotches of what's under it, most at the corners and edges (k: how worn)
function chips(x, W, H, r, under, k) {
  x.fillStyle = under;
  x.globalAlpha = 0.8;
  for (let n = Math.round(5 * k * (W / H)), i = 0; i < n; i++) {
    // (most where the board's been knocked: its corners, then along its edges; now and then a flake off its face)
    const at = r(), side = Math.floor(r() * 4);
    let cx = r() * W, cy = r() * H;
    if (at < 0.45) { cx = r() < 0.5 ? r() * H * 0.12 : W - r() * H * 0.12; cy = r() < 0.5 ? r() * H * 0.12 : H - r() * H * 0.12; }
    else if (at < 0.9) { if (side === 0) cy = r() * H * 0.04; else if (side === 1) cy = H - r() * H * 0.04; else if (side === 2) cx = r() * H * 0.04; else cx = W - r() * H * 0.04; }
    const R = H * (0.006 + r() * r() * 0.03);
    x.beginPath(); for (let a = 0; a < 7; a++) { const ang = a / 7 * Math.PI * 2, rr = R * (0.5 + r() * 0.7); x[a ? 'lineTo' : 'moveTo'](cx + Math.cos(ang) * rr * 1.5, cy + Math.sin(ang) * rr); } x.closePath(); x.fill();
  }
  x.globalAlpha = 1;
}
// grime and fading over a whole face: the sun bleaching the top, dirt and damp gathering at the foot
function weather(x, W, H, r, k) {
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `rgba(255,248,230,${0.1 * k})`); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(40,30,20,${0.28 * k})`);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 6 * k; i++) { const cx = r() * W, cy = H * (0.4 + r() * 0.6), R = H * (0.2 + r() * 0.5), gg = x.createRadialGradient(cx, cy, 0, cx, cy, R); gg.addColorStop(0, `rgba(50,38,26,${0.12 * k})`); gg.addColorStop(1, 'rgba(50,38,26,0)'); x.fillStyle = gg; x.fillRect(cx - R, cy - R, R * 2, R * 2); }
}
// ---- a sign board. o: text (\n for lines), bg, fg, face (SIGN_FONT key), under (what's beneath the paint), wear 0-1,
// frame (a lined border), screws, seed
export function paintSign(x, W, H, o) {
  const r = seeded(o.seed ?? hashOf(o.text + o.bg)), k = o.wear ?? 0.7, face = o.face || 'shop';
  x.fillStyle = o.bg; x.fillRect(0, 0, W, H);
  // (the brush's strokes along it, faint)
  for (let i = 0; i < 70; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)'; x.fillRect(r() * W, r() * H, W * (0.05 + r() * 0.3), 1 + r() * 2.5); }
  const m = H * 0.1;
  if (o.frame !== false) { x.strokeStyle = rgba(o.fg, 0.75); x.lineWidth = Math.max(2, H * 0.035); x.strokeRect(m, m, W - m * 2, H - m * 2); }
  const lines = String(o.text).split('\n'), s = fitFont(x, lines, face, W - m * 4.2, H - m * 3.4);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((L, i) => {
    const y = H / 2 + (i - (lines.length - 1) / 2) * s * 1.06 + s * 0.04;
    x.fillStyle = 'rgba(0,0,0,0.32)'; x.fillText(L, W / 2 + s * 0.02, y + s * 0.035);   // (the letters' edge)
    x.fillStyle = o.fg; x.fillText(L, W / 2, y);
  });
  chips(x, W, H, r, o.under || '#6e5a48', k);
  if (o.screws !== false) for (const [sx, sy] of [[m * 0.5, m * 0.5], [W - m * 0.5, m * 0.5], [m * 0.5, H - m * 0.5], [W - m * 0.5, H - m * 0.5]]) {
    const g = x.createLinearGradient(0, sy, 0, sy + H * 0.45); g.addColorStop(0, `rgba(120,64,30,${0.35 * k})`); g.addColorStop(1, 'rgba(120,64,30,0)');
    x.fillStyle = g; x.fillRect(sx - H * 0.012, sy, H * 0.024 + r() * H * 0.01, H * 0.45);
    x.fillStyle = '#3a342e'; x.beginPath(); x.arc(sx, sy, Math.max(2, H * 0.022), 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.arc(sx - H * 0.006, sy - H * 0.006, Math.max(1, H * 0.008), 0, 7); x.fill();
  }
  weather(x, W, H, r, k);
}
// ---- letters painted on a wall or a parapet, no board: worn through in patches (transparent between them)
export function paintLetters(x, W, H, o) {
  const r = seeded(o.seed ?? hashOf(o.text + 'L')), face = o.face || 'shop';
  const lines = String(o.text).split('\n'), s = fitFont(x, lines, face, W * 0.94, H * 0.86);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = o.fg;
  lines.forEach((L, i) => x.fillText(L, W / 2, H / 2 + (i - (lines.length - 1) / 2) * s * 1.06 + s * 0.04));
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6 * (o.wear ?? 0.7) * (W / H); i++) { const cx = r() * W, cy = r() * H, R = H * (0.015 + r() * r() * 0.06); x.globalAlpha = 0.25 + r() * 0.5; x.beginPath(); x.ellipse(cx, cy, R * 1.6, R, r() * 3, 0, 7); x.fill(); }
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
}
// ---- spray paint. o: text (\n for lines), col (#rrggbb), tilt, seed
export function paintSpray(x, W, H, o) {
  const r = seeded(o.seed ?? hashOf(o.text + o.col)), lines = String(o.text).split('\n');
  const off = document.createElement('canvas'); off.width = W; off.height = H; const y = off.getContext('2d');
  const s = fitFont(y, lines, 'spray', W * 0.88, H * 0.72, 0.01);
  y.fillStyle = o.col; y.textAlign = 'center'; y.textBaseline = 'middle';
  y.translate(W / 2, H * 0.44); y.rotate(o.tilt ?? (r() - 0.5) * 0.08);
  lines.forEach((L, i) => { const yy = (i - (lines.length - 1) / 2) * s * 1.02; y.fillText(L, (r() - 0.5) * s * 0.15, yy); });
  y.setTransform(1, 0, 0, 1, 0, 0);
  // runs down from the bottoms of the strokes, where it went on thick
  const D = y.getImageData(0, 0, W, H).data, a = (px, py) => D[(py * W + px) * 4 + 3];
  y.fillStyle = o.col;
  for (let px = 2; px < W - 2; px += Math.max(3, Math.round(s * 0.09))) {
    for (let py = H - 2; py > 1; py--) {
      if (a(px, py) > 128 && a(px, py + 1) < 40) {
        if (r() < 0.28) { const len = s * (0.1 + r() * r() * 0.8), w2 = Math.max(1.2, s * (0.018 + r() * 0.02)); y.fillRect(px - w2 / 2, py, w2, len); y.beginPath(); y.ellipse(px, py + len, w2 * 0.9, w2 * 1.3, 0, 0, 7); y.fill(); }
        py -= Math.round(s * 0.5);
      }
    }
  }
  // the overspray: a soft halo, then a fine mist of dots round the strokes; then the paint itself, a little patchy
  x.save(); x.filter = `blur(${Math.max(1, s * 0.05).toFixed(1)}px)`; x.globalAlpha = 0.45; x.drawImage(off, 0, 0); x.restore();
  x.fillStyle = o.col;
  for (let i = 0; i < W * H / 260; i++) { const px = Math.floor(r() * W), py = Math.floor(r() * H); let near = false; for (let d = 0; d < 3 && !near; d++) { const qx = Math.min(W - 1, Math.max(0, px + Math.round((r() - 0.5) * s * 0.25))), qy = Math.min(H - 1, Math.max(0, py + Math.round((r() - 0.5) * s * 0.25))); near = a(qx, qy) > 100; } if (near) { x.globalAlpha = 0.25 + r() * 0.4; x.fillRect(px, py, 1 + r() * 1.5, 1 + r() * 1.5); } }
  x.globalAlpha = 0.93; x.drawImage(off, 0, 0); x.globalAlpha = 1;
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) { x.globalAlpha = 0.15 + r() * 0.25; x.beginPath(); x.arc(r() * W, r() * H, s * (0.03 + r() * 0.08), 0, 7); x.fill(); }
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
}
// ---- a stencil sprayed through: capitals with their bridges, soft-edged, faded in patches. o: text, col, face, seed
const STENCIL_BRIDGE = new Set('ABDOPQRG0689&'.split(''));
export function paintStencil(x, W, H, o) {
  const r = seeded(o.seed ?? hashOf(o.text + 'S')), face = o.face || 'shop';
  const off = document.createElement('canvas'); off.width = W; off.height = H; const y = off.getContext('2d');
  const lines = String(o.text).toUpperCase().split('\n'), s = fitFont(y, lines, face, W * 0.92, H * 0.8, 0.12);
  y.fillStyle = o.col; y.textAlign = 'left'; y.textBaseline = 'middle';
  lines.forEach((L, i) => {
    const yy = H / 2 + (i - (lines.length - 1) / 2) * s * 1.05, tw = y.measureText(L).width; let cx = (W - tw) / 2;
    for (const ch of L) {
      const cw = y.measureText(ch).width; y.fillStyle = o.col; y.fillText(ch, cx, yy);
      if (STENCIL_BRIDGE.has(ch)) { y.save(); y.globalCompositeOperation = 'destination-out'; const bw = Math.max(2, s * 0.06); y.fillRect(cx + cw * 0.46 - bw / 2 - s * 0.03, yy - s * 0.6, bw, s * 1.2); y.restore(); }
      cx += cw;
    }
  });
  x.save(); x.filter = `blur(${Math.max(0.8, s * 0.025).toFixed(1)}px)`; x.globalAlpha = 0.5; x.drawImage(off, 0, 0); x.restore();
  x.globalAlpha = 0.9; x.drawImage(off, 0, 0); x.globalAlpha = 1;
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6 * (W / H); i++) { x.globalAlpha = 0.12 + r() * 0.3; const R = s * (0.05 + r() * r() * 0.25); x.beginPath(); x.ellipse(r() * W, r() * H, R * 1.4, R, r() * 3, 0, 7); x.fill(); }
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
}
// ---- a printed notice. o: title, lines [], paper, ink, seed
export function paintNotice(x, W, H, o) {
  const r = seeded(o.seed ?? hashOf(o.title)), paper = o.paper || '#ebe4d2', ink = o.ink || '#1c1a18';
  x.fillStyle = paper; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) { const cx = r() * W, cy = r() * H, R = Math.min(W, H) * (0.08 + r() * 0.25), g = x.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, 'rgba(150,118,70,0.18)'); g.addColorStop(0.8, 'rgba(150,118,70,0.06)'); g.addColorStop(1, 'rgba(150,118,70,0)'); x.fillStyle = g; x.fillRect(cx - R, cy - R, R * 2, R * 2); }
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  const ts = fitFont(x, [o.title], 'road', W * 0.86, H * 0.2, 0.02); x.fillText(o.title, W / 2, H * 0.17);
  x.fillRect(W * 0.1, H * 0.17 + ts * 0.62, W * 0.8, Math.max(1.5, H * 0.008));
  const L = o.lines || [], ls = Math.min(fitFont(x, L.length ? L : [' '], 'type', W * 0.84, H * 0.6, 0), H * 0.09);
  x.font = `400 ${ls}px ${SIGN_FONT.type}`; if ('letterSpacing' in x) x.letterSpacing = '0px';
  L.forEach((t, i) => x.fillText(t, W / 2, H * 0.36 + i * ls * 1.35));
  // (its edges foxed and dark, a corner curled)
  const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(90,70,40,0)'); g.addColorStop(1, 'rgba(90,70,40,0.35)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.moveTo(W, H - H * 0.14); x.lineTo(W, H); x.lineTo(W - H * 0.12, H); x.closePath(); x.fill(); x.globalCompositeOperation = 'source-over';
}
// ---- soot from a fire at a wall's foot: dark at the bottom, rising in tongues and thinning (a decal's picture)
export function paintSoot(x, W, H, seed) {
  const r = seeded(seed || 5);
  for (let i = 0; i < 46; i++) { const cx = W * (0.15 + r() * 0.7), cy = H - r() * r() * H * 0.95, R = W * (0.08 + r() * 0.18), g = x.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, 'rgba(16,13,11,0.26)'); g.addColorStop(1, 'rgba(16,13,11,0)'); x.fillStyle = g; x.fillRect(cx - R, cy - R, R * 2, R * 2); }
}
