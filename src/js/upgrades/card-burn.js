// The cards you pass on burn away when you pick one; nothing else does. Each card gets its own field of smooth noise,
// leaning from the corner the fire starts in, and a threshold sweeps up through it: below it the card is gone (a mask
// on the card), just above it a thin line of glowing embers, and above that a band of blackened, charred card (drawn
// on a layer inside the card, so it's cut by the same mask). Flakes of ash and a few sparks lift off the burning edge.

const BURN_T = 1.15, BURN_W = 72, BURN_H = 100;   // seconds to burn away; the noise field's size
// smooth 2D value noise, 0..1, from a hashed lattice
function burnNoise(seed) {
  const h = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y) => n(x, y) * 0.5 + n(x * 2.1 + 5.2, y * 2.1 + 1.3) * 0.3 + n(x * 4.3 + 9.1, y * 4.3 + 3.7) * 0.2;
}
// the field for one card: noise plus a lean from a random corner (or edge), so the fire starts there and eats across
function burnField() {
  const f = new Float32Array(BURN_W * BURN_H), noise = burnNoise(rand() * 100), o = pick([[0, 1], [1, 1], [0.5, 1], [0, 0.5], [1, 0.6]]);
  let lo = 9, hi = -9;
  for (let y = 0; y < BURN_H; y++) for (let x = 0; x < BURN_W; x++) {
    const u = x / (BURN_W - 1), v = y / (BURN_H - 1), d = Math.hypot((u - o[0]) * 0.8, v - o[1]) / 1.25;
    const val = noise(u * 4.2, v * 5.6) * 0.6 + d * 0.75; f[y * BURN_W + x] = val; lo = Math.min(lo, val); hi = Math.max(hi, val);
  }
  for (let k = 0; k < f.length; k++) f[k] = (f[k] - lo) / (hi - lo);
  return f;
}
// a flake of ash (grey, tumbling, drifting up and off) or a spark (small, bright, quick), from (x, y) on the screen
function burnFlake(host, x, y, spark) {
  const d = document.createElement('i'); d.className = 'ash' + (spark ? ' spark' : '');
  const sz = spark ? rr(2, 3.2) : rr(2.5, 6), dx = rr(-26, 26), dy = -rr(spark ? 50 : 30, spark ? 120 : 90), life = rr(spark ? 0.45 : 0.8, spark ? 0.8 : 1.4);
  d.style.cssText = `left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${sz.toFixed(1)}px;height:${(sz * rr(0.5, 1)).toFixed(1)}px;--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;--rot:${rr(-540, 540).toFixed(0)}deg;animation-duration:${life.toFixed(2)}s`;
  if (!spark) d.style.background = pick(['#2a2522', '#3d3733', '#5a524c', '#8a827a']);
  d.addEventListener('animationend', () => d.remove());
  host.appendChild(d);
}
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// burn the cards you didn't take
function burnCards(cards) {
  const host = $('upgrade');
  cards.forEach((card, k) => {
    const F = burnField(), mask = document.createElement('canvas'), fx = document.createElement('canvas');
    mask.width = fx.width = BURN_W; mask.height = fx.height = BURN_H;
    // (kept on the CPU, willReadFrequently: the mask's encoded every frame, and reading back a canvas the GPU holds
    // stalled the frame for every card burning)
    const mc = mask.getContext('2d', { willReadFrequently: true }), xc = fx.getContext('2d', { willReadFrequently: true }), mi = mc.createImageData(BURN_W, BURN_H), xi = xc.createImageData(BURN_W, BURN_H);
    fx.className = 'burnFx'; card.appendChild(fx); card.classList.add('burning');
    const t0 = performance.now(), delay = k * 0.09, edge = [];
    const step = () => {
      const t = (performance.now() - t0) / 1000 - delay, p = clamp(t / BURN_T, 0, 1), th = -0.04 + Math.pow(p, 1.2) * 1.08;   // slow to catch, then it runs
      edge.length = 0;
      for (let q = 0; q < F.length; q++) {
        const n = F[q], j = q * 4, alive = sstep(th, th + 0.018, n);
        mi.data[j] = mi.data[j + 1] = mi.data[j + 2] = 255; mi.data[j + 3] = alive * 255;
        // embers right at the edge (yellow-orange, brightest nearest the gap), then char, darkening the card toward it
        const e = n - th, ember = e > 0 && e < 0.04 ? 1 - e / 0.04 : 0, chr = e > 0 && e < 0.16 ? 1 - e / 0.16 : 0;
        if (ember > 0.7 && (q & 7) === 0) edge.push(q);
        xi.data[j] = 40 + 215 * ember; xi.data[j + 1] = 18 + 150 * ember * ember; xi.data[j + 2] = 8 + 30 * ember * ember * ember;
        xi.data[j + 3] = Math.min(255, (chr * chr * 0.9 + ember * 0.6) * 255);
      }
      mc.putImageData(mi, 0, 0); xc.putImageData(xi, 0, 0);
      const url = `url(${mask.toDataURL()})`; card.style.webkitMaskImage = card.style.maskImage = url;
      // ash and sparks off the burning edge
      if (t >= 0 && p < 0.97 && edge.length) {
        const r = card.getBoundingClientRect();
        for (let s = 0, ns = rand() < 0.7 ? 2 : 1; s < ns; s++) {
          const q = pick(edge), x = (q % BURN_W) / BURN_W, y = Math.floor(q / BURN_W) / BURN_H;
          burnFlake(host, r.left + x * r.width, r.top + y * r.height, rand() < 0.3);
        }
      }
      if (p < 1 && card.isConnected) requestAnimationFrame(step); else card.style.visibility = 'hidden';
    };
    step();
  });
}
