// Blood on the screen: splatters thrown up on the side a hit came from, that run down in drips and fade, and drops
// that land at the edges while you bleed.

// each splat is drawn once into its own little canvas when it lands (a wet blob with a dark rim, a spatter of droplets
// and streaks flung outward, a glint of wet on it) and laid onto a half-size canvas over the screen each frame while
// any are left. SCR_BLOOD: how long one hangs before it fades (seconds) and how long the fade takes, how big a hit's
// splats are (as a share of the screen's height) and a bleeding drop's, and how many at most
const SCR_BLOOD = { hold: [2.6, 4.2], fade: 1.8, big: [0.055, 0.1], drop: [0.025, 0.05], most: 26, scale: 0.5 };
const scrBlood = [];
let sbCv = null, sbCtx = null, sbW = 0, sbH = 0, sbDirty = false;
function sbCanvas() {
  if (!sbCv) { sbCv = $('scrBlood'); sbCtx = sbCv.getContext('2d'); }
  const w = Math.round(innerWidth * SCR_BLOOD.scale), h = Math.round(innerHeight * SCR_BLOOD.scale);
  if (w !== sbW || h !== sbH) { sbW = sbCv.width = w; sbH = sbCv.height = h; }
}
// one splat's picture, r pixels across its blob, flung toward (ox, oy) (a unit vector, out from the middle of the screen)
function sbSplat(r, ox, oy) {
  const pad = r * 2.6, S = Math.ceil(pad * 2), c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), cx = S / 2, cy = S / 2;
  // the blob: a lumpy round, wetter and darker in the middle
  const n = 20, ph = Math.random() * 6.28, rs = [];
  for (let k = 0; k < n; k++) rs.push(r * (0.72 + 0.28 * Math.sin(k * 2.1 + ph) * Math.sin(k * 0.7 + ph * 1.7) + Math.random() * 0.22));
  g.beginPath();
  for (let k = 0; k <= n; k++) {
    const a0 = k / n * 6.283, a1 = (k + 0.5) / n * 6.283, r0 = rs[k % n], r1 = (rs[k % n] + rs[(k + 1) % n]) / 2;
    const x0 = cx + Math.cos(a0) * r0, y0 = cy + Math.sin(a0) * r0, x1 = cx + Math.cos(a1) * r1, y1 = cy + Math.sin(a1) * r1;
    if (k === 0) g.moveTo(x0, y0); else g.quadraticCurveTo(x0, y0, x1, y1);
  }
  g.closePath();
  const gr = g.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r * 1.1);
  gr.addColorStop(0, 'rgba(92,2,2,0.96)'); gr.addColorStop(0.65, 'rgba(128,8,5,0.9)'); gr.addColorStop(1, 'rgba(150,14,8,0.78)');
  g.fillStyle = gr; g.fill();
  g.lineWidth = Math.max(1, r * 0.07); g.strokeStyle = 'rgba(55,0,0,0.55)'; g.stroke();
  // droplets and streaks flung out from it, most of them outward
  for (let k = 0, m = 8 + (Math.random() * 10 | 0); k < m; k++) {
    const out = Math.random() < 0.7, a = out ? Math.atan2(oy, ox) + (Math.random() - 0.5) * 1.8 : Math.random() * 6.28;
    const d = r * (1.05 + Math.random() * 1.3), s = r * (0.04 + Math.random() * 0.13), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    g.fillStyle = `rgba(${110 + (Math.random() * 40 | 0)},6,4,${0.75 + Math.random() * 0.2})`;
    g.beginPath();
    if (Math.random() < 0.35) { g.ellipse(x, y, s * 2.6, s * 0.7, a, 0, 6.283); } else g.arc(x, y, s, 0, 6.283);
    g.fill();
  }
  // a glint of wet
  g.fillStyle = 'rgba(255,215,205,0.16)'; g.beginPath(); g.ellipse(cx - r * 0.32, cy - r * 0.34, r * 0.22, r * 0.09, -0.6, 0, 6.283); g.fill();
  return c;
}
// splats where a blow came from: (fx, fy) the spot on the screen's edge it came from (0..1 across and down), amount
// how hard (1 a normal hit); kept out toward the edges, off the middle where you're looking
function screenBlood(fx, fy, amount) {
  sbCanvas();
  const k = clamp(amount || 1, 0.4, 2.5), n = Math.round(1 + k * 1.3);
  for (let i = 0; i < n; i++) {
    let x = clamp(fx + (Math.random() - 0.5) * 0.3, 0.02, 0.98), y = clamp(fy + (Math.random() - 0.5) * 0.3, 0.03, 0.97);
    const ox = x - 0.5, oy = y - 0.5, ol = Math.hypot(ox, oy) || 1;
    if (ol < 0.32) { x = 0.5 + ox / ol * 0.36; y = 0.5 + oy / ol * 0.36; }   // pushed out of the middle
    const B = SCR_BLOOD.big, r = sbH * (B[0] + Math.random() * (B[1] - B[0])) * (0.7 + 0.3 * k) * (i ? 0.6 : 1);
    sbAdd(x, y, r, ox / ol, oy / ol, 1);
  }
}
// a drop landing at the edge while you bleed
function screenBleedDrop() {
  sbCanvas();
  const a = Math.random() * 6.283, x = 0.5 + Math.cos(a) * rr(0.38, 0.5), y = 0.5 + Math.sin(a) * rr(0.36, 0.48), D = SCR_BLOOD.drop;
  sbAdd(clamp(x, 0.02, 0.98), clamp(y, 0.03, 0.97), sbH * (D[0] + Math.random() * (D[1] - D[0])), Math.cos(a), Math.sin(a), 0.6);
}
function sbAdd(x, y, r, ox, oy, life) {
  if (scrBlood.length >= SCR_BLOOD.most) scrBlood.shift();
  const H = SCR_BLOOD.hold, img = sbSplat(r, ox, oy);
  // the drips it runs down in: one or two off its lower edge, fast at first and slowing as they thin
  const drips = []; for (let k = 0, m = Math.random() < 0.8 ? 1 + (Math.random() * 2 | 0) : 0; k < m; k++) drips.push({ dx: (Math.random() - 0.5) * r * 1.1, w: r * rr(0.09, 0.16), v: r * rr(0.5, 1.2), len: 0, most: r * rr(1.5, 4) });
  scrBlood.push({ x: x * sbW, y: y * sbH, r, img, t: 0, hold: (H[0] + Math.random() * (H[1] - H[0])) * life, drips });
  sbDirty = true;
}
function stepScreenBlood(rdt) {
  if (!scrBlood.length) { if (sbDirty) { sbCtx.clearRect(0, 0, sbW, sbH); sbDirty = false; } return; }
  sbCanvas(); const g = sbCtx; g.clearRect(0, 0, sbW, sbH); sbDirty = true;
  for (let i = scrBlood.length - 1; i >= 0; i--) {
    const s = scrBlood[i]; s.t += rdt;
    const a = s.t < 0.08 ? s.t / 0.08 : s.t < s.hold ? 1 : 1 - (s.t - s.hold) / SCR_BLOOD.fade;
    if (a <= 0) { scrBlood.splice(i, 1); continue; }
    g.globalAlpha = a;
    // the drips first, under the blob: a thin run with a bead at its foot
    for (const d of s.drips) {
      if (d.len < d.most) { d.len = Math.min(d.most, d.len + d.v * rdt); d.v *= Math.exp(-rdt * 0.6); }
      const x = s.x + d.dx, y0 = s.y + s.r * 0.5, w = d.w * (1 - 0.3 * d.len / d.most);
      g.fillStyle = 'rgba(118,6,4,0.88)'; g.fillRect(x - w / 2, y0, w, d.len);
      g.beginPath(); g.arc(x, y0 + d.len, w * 0.9, 0, 6.283); g.fill();
    }
    const S = s.img.width, sc = Math.min(1, 0.6 + s.t / 0.12 * 0.4);   // it lands with a quick spread
    g.drawImage(s.img, s.x - S * sc / 2, s.y - S * sc / 2, S * sc, S * sc);
  }
  g.globalAlpha = 1;
}
function clearScreenBlood() { scrBlood.length = 0; }
