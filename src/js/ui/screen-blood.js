// Blood on your view: a limb taken off or blown to red mist, a head burst or a volatile going up, close to you (yours or
// a teammate's doing), spatters the screen as if on your face or your glasses, and gets on you and what's in your
// hands as well (effects/body-blood.js). It's thrown from the side it came from: a faint red haze from that edge, a
// spray of fine specks, glossy drops among them (a deep body, a darker rim where it pools at the edge, a crescent of
// light off it and a pinpoint glint) and, from a close one, a splat or two with spikes flung out of it. Everything's
// soft and out of focus as anything that close to your eye is. It hangs a moment, the big drops run down leaving a
// thin trail, and it fades away. Taking a limb off throws less of it than blowing one to mist.

import { cam, FP_CAM, V3 } from '../core/renderer.js';
import { angDiff, clamp, rand, rr } from '../core/math.js';
import { fpOn, specFpOn, VCAM } from '../game/view-cam.js';
import { camFocus } from '../net/spectate.js';
import { P } from '../player/player.js';
import { addBlood } from '../effects/body-blood.js';
import { curId } from '../game/run-state.js';

// how near it has to be (metres) and how much of it comes by distance (none past near, all of it within full); how many
// specks, drops and splats there are (from the faintest to the strongest), how big each is (shares of the screen's
// height), how long they hang before they fade and how long the fade takes (s), how fast a big drop runs (screen
// heights a second), the canvas's resolution against the screen's (it's blurred anyway), and how much gets on you and
// your weapon at its strongest (body-blood.js: addBlood)
const SBLOOD = { near: 3.2, full: 1.2, specks: [40, 160], drops: [6, 26], splats: [1, 5], speck: [0.0012, 0.004], drop: [0.005, 0.016], splat: [0.022, 0.05],
  hold: [0.3, 0.9], fade: [1.4, 2.6], run: 0.045, res: 0.6, on: 0.09, gun: 0.14 };
const sbDrops = [], sbHaze = [], _sbV = new V3();
let sbCv = null, sbCx = null, sbRaf = 0, sbLast = 0;
function sbEnsure() {
  if (sbCv) return;
  sbCv = document.createElement('canvas'); sbCv.id = 'screenBlood'; document.body.appendChild(sbCv); sbCx = sbCv.getContext('2d');
}
// a zombie's limb or head gone at (z.x, z.z): its blood on your view, k of it at its strongest
export const goreNear = (z, k) => goreAt(z.x, z.z, 1.2, k);
// whose eyes it lands on: yours, or down and watching someone from their own eyes (net/spectate.js, game/view-cam.js
// specFpOn), theirs: where they stand and the way their view faces, so what would spatter their screen spatters yours
// (own: whether it's you, so it gets on you and your weapon too). Nobody's, down and not watching from anyone's eyes
const _sbE = { x: 0, z: 0, face: 0, own: true };
export function goreEye() {
  if (!P.dead) return Object.assign(_sbE, { x: P.x, z: P.z, face: fpOn() ? VCAM.yaw : P.aim, own: true });
  if (!specFpOn()) return null;
  const f = camFocus(); FP_CAM.getWorldDirection(_sbV);
  return Object.assign(_sbE, { x: f.x, z: f.z, face: Math.atan2(_sbV.x, _sbV.z), own: false });
}
// blood thrown from (x, y, zz) in the world, k of it at its strongest: on your view and on you and your weapon (near:
// how far it reaches, for a bigger burst than a limb's)
export function goreAt(x, zz, y, k, near = SBLOOD.near) {
  const E = goreEye(); if (!E) return;
  const d = Math.hypot(x - E.x, zz - E.z); if (d > near) return;
  const f = clamp(k, 0, 1.5) * clamp((near - d) / (near - SBLOOD.full), 0, 1); if (f < 0.05) return;
  if (E.own) addBlood(SBLOOD.on * f * k, curId(), SBLOOD.gun * f * k);   // (mist throws twice what a clean cut does)
  // where it came from, against the way you're facing (your eyes' way from your own eyes, your aim's from above): ahead
  // of you it bursts from about the middle of the view and covers the whole of it; off to one side it comes in from
  // that side; behind you none gets on your view at all (it can't reach your eyes). Right on top of you (your own
  // wound) it's ahead (SB_DIR)
  const a = d < SB_DIR.self ? 0 : angDiff(Math.atan2(x - E.x, zz - E.z), E.face);
  if (Math.abs(a) > SB_DIR.behind) return;
  const front = Math.abs(a) < SB_DIR.front;
  let sx, sy;
  if (front) { _sbV.set(x, y, zz).project(fpOn() ? FP_CAM : cam); sx = _sbV.z < 1 ? clamp(_sbV.x * 0.5, -0.35, 0.35) : 0; sy = _sbV.z < 1 ? clamp(_sbV.y * 0.4, -0.3, 0.3) : 0; }
  else { sx = clamp(-Math.sin(a) * 1.25, -1, 1); sy = rr(-0.25, 0.3); }   // (its side: a turn to the right of where you face is the screen's right)
  screenBlood(Math.min(1, f), sx, sy, front);
}
// where it's thought to come from (radians off the way you face): straight ahead within front, past behind it's behind
// you and none comes; a source closer than self (m) is your own
const SB_DIR = { front: 0.45, behind: 1.75, self: 0.6 };
const sbLerp = (r, k) => r[0] + (r[1] - r[0]) * k;
// a spatter, strength k (0 to 1), thrown from (sx, sy) on the screen (-1 to 1 each way)
function screenBlood(k, sx, sy, front) {
  sbEnsure();
  const W = Math.round(innerWidth * SBLOOD.res), H = Math.round(innerHeight * SBLOOD.res);
  if (sbCv.width !== W || sbCv.height !== H) { sbCv.width = W; sbCv.height = H; }
  const ox = (sx * 0.5 + 0.5) * W, oy = (0.5 - sy * 0.5) * H, now = performance.now() / 1000;
  // flung out from where it came across a broad fan of the view, thinning out the further they go
  // (ahead of you it's thrown wider, over the whole of the view; and each lands a moment after it's thrown, flung out
  // from where it came: fly)
  const wide = front ? 1.65 : 1;
  const at = spread => { const a = rand() * Math.PI * 2, far = Math.pow(rand(), front ? 0.55 : 0.7) * H * spread * wide; return [ox + Math.cos(a) * far * (front ? 1.35 : 1) + (W / 2 - ox) * rr(0, 0.55), oy + Math.sin(a) * far * 0.8]; };
  const fly = () => ({ ox, oy, ta: rr(...SB_FLY.t) });
  const hold = () => rr(...SBLOOD.hold), fade = () => rr(...SBLOOD.fade);
  sbHaze.push({ x: ox, y: oy, r: H * rr(0.45, 0.7) * (front ? 1.5 : 1), a: 0.3 * k, t0: now, hold: 0.15, fade: 0.9, rise: SB_FLY.haze });
  for (let i = Math.round(sbLerp(SBLOOD.specks, k)); i > 0; i--) {
    const [x, y] = at(rr(0.3, 1.1)); sbDrops.push({ kind: 0, x, y, r: H * rr(...SBLOOD.speck), a: rr(0.35, 0.75), t0: now, hold: hold(), fade: fade() * 0.8, ...fly() });
  }
  for (let i = Math.round(sbLerp(SBLOOD.drops, k)); i > 0; i--) {
    const [x, y] = at(rr(0.2, 0.95)), r = H * rr(...SBLOOD.drop) * (1 + Math.pow(rand(), 3)), runs = rand() < 0.55;
    sbDrops.push({ kind: 1, x, y, y0: y, r, sh: sbShape(9), el: rr(0.8, 1.15), ang: rand() * Math.PI, a: rr(0.6, 0.95), t0: now, hold: hold(), fade: fade(), run: runs ? rr(0.4, 1) * SBLOOD.run * H : 0, ...fly() });
  }
  for (let i = Math.round(sbLerp(SBLOOD.splats, k * k)); i > 0; i--) {
    const [x, y] = at(rr(0.1, 0.45)), r = H * rr(...SBLOOD.splat), n = 5 + (rand() * 5 | 0), lobes = [], spikes = [];
    for (let j = 0; j < n; j++) lobes.push([j / n * Math.PI * 2 + rr(-0.3, 0.3), r * rr(0.35, 0.6), r * rr(0.2, 0.45)]);
    for (let j = 3 + (rand() * 6 | 0); j > 0; j--) spikes.push([Math.atan2(y - oy, x - ox) + rr(-0.9, 0.9), r * rr(0.9, 2.2), r * rr(0.06, 0.14)]);
    sbDrops.push({ kind: 2, x, y, r, lobes, spikes, a: rr(0.75, 0.95), t0: now, hold: hold() * 1.3, fade: fade() * 1.2, ...fly() });
  }
  if (sbDrops.length > 600) sbDrops.splice(0, sbDrops.length - 600);
  sbCv.style.opacity = '1';
  if (!sbRaf) { sbLast = now; sbRaf = requestAnimationFrame(sbStep); }
}
// a drop on the glass: a flat, wobbly-edged smear of deep red, darker where it pools at the rim, lighter and thinner in
// the middle where the light comes through it, a soft sheen along its top edge and a small glint
const sbShape = n => { const a = []; for (let i = 0; i < n; i++) a.push(rr(0.78, 1.12)); return a; };
function sbPath(r, sh) {
  const c = sbCx, n = sh.length; c.beginPath();
  for (let i = 0; i <= n + 1; i++) {   // (through the midpoints between the wobbles, so the edge runs round smoothly)
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, r0 = r * sh[i % n], r1 = r * sh[(i + 1) % n];
    const x0 = Math.cos(a0) * r0, y0 = Math.sin(a0) * r0, mx = (x0 + Math.cos(a1) * r1) / 2, my = (y0 + Math.sin(a1) * r1) / 2;
    if (i === 0) c.moveTo(mx, my); else c.quadraticCurveTo(x0, y0, mx, my);
  }
  c.closePath();
}
function sbBody(d, al) {
  const c = sbCx, r = d.r;
  c.save(); c.translate(d.x, d.y); c.rotate(d.ang); c.scale(1, d.el);
  sbPath(r, d.sh);
  const g = c.createRadialGradient(r * 0.1, r * 0.15, 0, 0, 0, r * 1.1);
  g.addColorStop(0, `rgba(118,8,6,${al * 0.5})`); g.addColorStop(0.6, `rgba(88,4,3,${al * 0.68})`); g.addColorStop(0.88, `rgba(46,1,1,${al * 0.88})`); g.addColorStop(1, `rgba(30,0,0,${al * 0.9})`);
  c.fillStyle = g; c.fill();
  sbGlint(r, al);
  c.restore();
}
function sbGlint(r, al) {
  const c = sbCx;
  c.strokeStyle = `rgba(255,190,180,${al * 0.18})`; c.lineWidth = Math.max(0.5, r * 0.09); c.lineCap = 'round';
  c.beginPath(); c.arc(0, r * 0.08, r * 0.7, -2.4, -1.5); c.stroke();
  c.fillStyle = `rgba(255,228,220,${al * 0.35})`; c.beginPath(); c.arc(-r * 0.36, -r * 0.42, Math.max(0.4, r * 0.06), 0, Math.PI * 2); c.fill();
}
// a splat: lobes run together round a middle, spikes flung out of it, the whole of it a flat dark wet red
function sbSplat(d, al) {
  const c = sbCx;
  c.save(); c.translate(d.x, d.y);
  c.fillStyle = `rgba(66,2,2,${al * 0.8})`;
  c.beginPath(); c.arc(0, 0, d.r * 0.55, 0, Math.PI * 2); c.fill();
  for (const [a, o, s] of d.lobes) { c.beginPath(); c.arc(Math.cos(a) * o, Math.sin(a) * o, s, 0, Math.PI * 2); c.fill(); }
  for (const [a, l, w] of d.spikes) {
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa * w, py = ca * w;
    c.beginPath(); c.moveTo(ca * d.r * 0.4 + px, sa * d.r * 0.4 + py); c.lineTo(ca * l, sa * l); c.lineTo(ca * d.r * 0.4 - px, sa * d.r * 0.4 - py); c.fill();
    c.beginPath(); c.arc(ca * l * 1.08, sa * l * 1.08, w * 1.3, 0, Math.PI * 2); c.fill();   // (the bead at a spike's end)
  }
  const g = c.createRadialGradient(-d.r * 0.2, -d.r * 0.25, 0, 0, 0, d.r * 0.6);   // (the wet middle)
  g.addColorStop(0, `rgba(160,18,12,${al * 0.5})`); g.addColorStop(1, 'rgba(160,18,12,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, d.r * 0.6, 0, Math.PI * 2); c.fill();
  sbGlint(d.r * 0.5, al * 0.8);
  c.restore();
}
// how a drop flies onto the glass: how long (s) from thrown to landed, how big it starts (of its size), and its landing
// (how long, how far its size overshoots); the haze rising in (s)
const SB_FLY = { t: [0.05, 0.16], from: 0.3, land: 0.12, pop: 0.35, haze: 0.08 };
// a drop drawn somewhere along its flight, at a share s of its size
function sbFlying(d, x, y, s, al) {
  const c = sbCx;
  if (d.kind === 0) { c.fillStyle = `rgba(90,4,4,${al})`; c.beginPath(); c.arc(x, y, d.r * s, 0, Math.PI * 2); c.fill(); return; }
  const k = { ...d, x, y, r: d.r * s }; if (d.kind === 2) sbSplat(k, al); else sbBody(k, al);
}
const sbFade = (t, d) => { const u = (t - d.hold) / d.fade; return u >= 1 ? -1 : u <= 0 ? 1 : 1 - u * u * (3 - 2 * u); };
function sbStep() {
  const now = performance.now() / 1000, dt = Math.min(0.1, now - sbLast), c = sbCx; sbLast = now;
  c.clearRect(0, 0, sbCv.width, sbCv.height);
  for (let i = sbHaze.length - 1; i >= 0; i--) {
    const h = sbHaze[i], v = sbFade(now - h.t0, h) * (h.rise ? Math.min(1, (now - h.t0) / h.rise) : 1); if (v < 0) { sbHaze.splice(i, 1); continue; }
    const g = c.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r); g.addColorStop(0, `rgba(110,4,4,${h.a * v})`); g.addColorStop(1, 'rgba(110,4,4,0)');
    c.fillStyle = g; c.fillRect(0, 0, sbCv.width, sbCv.height);
  }
  for (let i = sbDrops.length - 1; i >= 0; i--) {
    const d = sbDrops[i], t = now - d.t0, v = sbFade(t, d);
    if (v < 0) { sbDrops.splice(i, 1); continue; }
    let al = d.a * v;
    // still in flight: thrown out from where it came, growing as it nears the glass, then landing with a little splat
    // (a quick overshoot of its size and settle: SB_FLY)
    if (d.ta && t < d.ta + SB_FLY.land) {
      if (t < d.ta) {
        const p = 1 - Math.pow(1 - t / d.ta, 3), x = d.ox + (d.x - d.ox) * p, y = d.oy + ((d.y0 ?? d.y) - d.oy) * p, s = SB_FLY.from + (1 - SB_FLY.from) * p;
        sbFlying(d, x, y, s, al * Math.min(1, t / d.ta * 2)); continue;
      }
      const u = (t - d.ta) / SB_FLY.land; sbFlying(d, d.x, d.y, 1 + SB_FLY.pop * Math.sin(Math.PI * u) * (1 - u), al); continue;
    }
    if (d.kind === 0) { c.fillStyle = `rgba(90,4,4,${al})`; c.beginPath(); c.arc(d.x, d.y, d.r, 0, Math.PI * 2); c.fill(); continue; }
    if (d.kind === 2) { sbSplat(d, al); continue; }
    if (d.run && t > d.hold * 0.5) { d.y += d.run * dt; d.run *= Math.pow(0.4, dt); d.el = Math.min(1.8, d.el + dt * 0.25); d.ang += (Math.PI / 2 - d.ang) * Math.min(1, dt * 3); }   // (running down, slowing as it thins)
    if (d.y - d.y0 > 1) {   // (the thin trail it leaves)
      const g = c.createLinearGradient(d.x, d.y0, d.x, d.y); g.addColorStop(0, 'rgba(70,2,2,0)'); g.addColorStop(1, `rgba(70,2,2,${al * 0.6})`);
      c.strokeStyle = g; c.lineWidth = d.r * 0.55; c.lineCap = 'round'; c.beginPath(); c.moveTo(d.x, d.y0); c.lineTo(d.x, d.y); c.stroke();
    }
    sbBody(d, al);
  }
  if (sbDrops.length || sbHaze.length) sbRaf = requestAnimationFrame(sbStep); else { sbRaf = 0; sbCv.style.opacity = '0'; }
}
// the end of a run: none of it carried over
export function clearScreenBlood() { sbDrops.length = 0; sbHaze.length = 0; if (sbCx) sbCx.clearRect(0, 0, sbCv.width, sbCv.height); }
