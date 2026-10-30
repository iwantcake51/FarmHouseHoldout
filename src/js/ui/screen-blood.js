// Blood on your view: a limb taken off or blown to red mist, or a head burst, close to you (yours or a teammate's doing)
// spatters the screen with droplets of blood, as if on your face or your glasses: thrown from the side it came from,
// a spray of fine drops round a few big ones, a smear or two among them, soft and out of focus as anything that close
// to your eye is, each a dark rim round a glossy middle with a glint on it. They hang a moment, the big ones run down a
// little, and they fade away.

import { cam, V3 } from '../core/renderer.js';
import { clamp, rand, rr } from '../core/math.js';
import { P } from '../player/player.js';

// how near it has to be (metres) and how much of it comes by distance (none past near, all of it within full); how many
// drops (n, at its strongest), how big the fine ones and the big ones are (shares of the screen's height), how long they
// hang before they fade and how long the fade takes (s), how fast a big one runs (screen heights a second), and the
// canvas's resolution against the screen's (it's blurred anyway: res)
const SBLOOD = { near: 3.2, full: 1.2, n: [24, 110], fine: [0.002, 0.007], big: [0.012, 0.03], hold: [0.35, 0.8], fade: [1.4, 2.4], run: 0.035, res: 0.5 };
const sbDrops = [], _sbV = new V3();
let sbCv = null, sbCx = null, sbRaf = 0, sbLast = 0;
function sbEnsure() {
  if (sbCv) return;
  sbCv = document.createElement('canvas'); sbCv.id = 'screenBlood'; document.body.appendChild(sbCv); sbCx = sbCv.getContext('2d');
}
// a zombie's limb or head gone at (z.x, z.z): its blood on your view, k of it at its strongest
export function goreNear(z, k) {
  if (P.dead) return;
  const d = Math.hypot(z.x - P.x, z.z - P.z); if (d > SBLOOD.near) return;
  const f = k * clamp((SBLOOD.near - d) / (SBLOOD.near - SBLOOD.full), 0, 1); if (f < 0.05) return;
  // (from the side of the view it's on; behind you, from the edge nearest it)
  _sbV.set(z.x, 1.2, z.z).project(cam); const behind = _sbV.z > 1;
  screenBlood(f, clamp(behind ? -Math.sign(_sbV.x || 1) : _sbV.x, -1, 1), clamp(behind ? 0 : _sbV.y, -1, 1));
}
// a spatter, strength k (0 to 1), thrown from (sx, sy) on the screen (-1 to 1 each way)
function screenBlood(k, sx, sy) {
  sbEnsure();
  const W = Math.round(innerWidth * SBLOOD.res), H = Math.round(innerHeight * SBLOOD.res);
  if (sbCv.width !== W || sbCv.height !== H) { sbCv.width = W; sbCv.height = H; }
  const ox = (sx * 0.5 + 0.5) * W, oy = (0.5 - sy * 0.5) * H, n = Math.round(SBLOOD.n[0] + (SBLOOD.n[1] - SBLOOD.n[0]) * k), now = performance.now() / 1000;
  for (let i = 0; i < n; i++) {
    // flung out from where it came, most of them in a broad fan across the view, thinning out the further they go
    const a = rand() * Math.PI * 2, far = Math.pow(rand(), 0.6) * H * rr(0.25, 0.75);
    const big = rand() < 0.08 + 0.06 * k, r = H * (big ? rr(...SBLOOD.big) : rr(...SBLOOD.fine) * (1 + 1.5 * Math.pow(rand(), 3)));
    sbDrops.push({ x: ox + Math.cos(a) * far + (W / 2 - ox) * rr(0, 0.5), y: oy + Math.sin(a) * far * 0.8, r, el: big && rand() < 0.4 ? rr(1.4, 2.4) : rr(1, 1.25), ang: rand() * Math.PI,
      a: rr(0.45, 0.8) * (0.5 + 0.5 * k), t0: now, hold: rr(...SBLOOD.hold), fade: rr(...SBLOOD.fade), run: big ? rr(0.4, 1) * SBLOOD.run * H : 0, gl: rand() < (big ? 0.9 : 0.35) });
  }
  if (sbDrops.length > 400) sbDrops.splice(0, sbDrops.length - 400);
  sbCv.style.opacity = '1';
  if (!sbRaf) { sbLast = now; sbRaf = requestAnimationFrame(sbStep); }
}
function sbDrop(d, al) {
  sbCx.save(); sbCx.translate(d.x, d.y); sbCx.rotate(d.ang); sbCx.scale(1, d.el);
  const g = sbCx.createRadialGradient(-d.r * 0.2, -d.r * 0.2, 0, 0, 0, d.r);   // (a dark rim round a deeper, glossy red)
  g.addColorStop(0, `rgba(120,10,8,${al * 0.42})`); g.addColorStop(0.55, `rgba(92,5,4,${al * 0.6})`); g.addColorStop(0.86, `rgba(40,0,0,${al * 0.95})`); g.addColorStop(1, 'rgba(30,0,0,0)');
  sbCx.fillStyle = g; sbCx.beginPath(); sbCx.arc(0, 0, d.r, 0, Math.PI * 2); sbCx.fill();
  if (d.gl) { sbCx.fillStyle = `rgba(255,190,180,${al * 0.4})`; sbCx.beginPath(); sbCx.arc(-d.r * 0.35, -d.r * 0.35, d.r * 0.22, 0, Math.PI * 2); sbCx.fill(); }   // (the glint)
  sbCx.restore();
}
function sbStep() {
  const now = performance.now() / 1000, dt = Math.min(0.1, now - sbLast); sbLast = now;
  sbCx.clearRect(0, 0, sbCv.width, sbCv.height);
  for (let i = sbDrops.length - 1; i >= 0; i--) {
    const d = sbDrops[i], t = now - d.t0, u = (t - d.hold) / d.fade;
    if (u >= 1) { sbDrops.splice(i, 1); continue; }
    if (d.run && t > d.hold * 0.5) { d.y += d.run * dt; d.run *= Math.pow(0.35, dt); d.el = Math.min(3, d.el + dt * 0.4); }   // (a big one running down, slowing as it thins)
    sbDrop(d, d.a * (u <= 0 ? 1 : 1 - u * u * (3 - 2 * u)));
  }
  if (sbDrops.length) sbRaf = requestAnimationFrame(sbStep); else { sbRaf = 0; sbCv.style.opacity = '0'; }
}
// the end of a run: none of it carried over
export function clearScreenBlood() { sbDrops.length = 0; if (sbCx) sbCx.clearRect(0, 0, sbCv.width, sbCv.height); }
