// Sounds placed in the world. They're heard from a listener hung over the middle of the view, higher the further out you
// zoom (HEAR.h / cam.zoom), so a sound gets quieter as you zoom out and, from off to one side of the screen, sits in that
// ear (StereoPanner). Every one plays through a gain and a panner of its own into the master bus (audio/audio.js).
import { cam, RIGHT, VIEW, zoom, ZOOM_MIN } from '../core/renderer.js';
import { clamp, smooth } from '../core/math.js';
import { cell, ci, idx, inb, OBST, OPEN, openAt, WALL } from '../world/grid.js';
import { obstTop } from '../world/props.js';
import { thinWalk } from '../world/thin-walls.js';
import { P } from '../player/player.js';
import { shutN } from '../barricades/planks.js';
import { AC, master, MASTER_VOL, setSND_AT, SND_AT } from './audio.js';
import { isoOn, listener } from '../game/view-cam.js';
import { camTarget } from '../game/camera.js';
import { camFocus } from '../net/spectate.js';
import { SET } from '../ui/settings.js';
import { sndLive } from './samples.js';

const HEAR = { h: 5.4, ref: 3, pan: 0.6 };   // listener height at zoom 1 (m), the distance a sound plays at full volume, how far it pans
function hearAt(x, z) {
  // first person or the free camera: heard from the view itself, a sound to its right in the right ear (game/view-cam.js)
  if (!isoOn()) { const L = listener(), dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz); return { gain: Math.min(1, HEAR.ref / Math.hypot(d, L.y - 0.9, 1)), pan: clamp((dx * L.rx + dz * L.rz) / Math.max(1.5, d), -1, 1) * HEAR.pan }; }
  const zm = Math.max(0.1, cam.zoom || 1), dx = x - camTarget.x, dz = z - camTarget.z;
  const halfW = VIEW * (innerWidth / Math.max(1, innerHeight)) / zm, across = dx * RIGHT.x + dz * RIGHT.z;
  // (divided by the master's own zoom fade, zoomVol, which these already have from the listener's height)
  return { gain: Math.min(1, HEAR.ref / Math.hypot(dx, dz, HEAR.h / zm)) / zoomVol(), pan: clamp(across / halfW, -1, 1) * HEAR.pan };
}
// every sound quieter the further out you zoom: full from the default zoom in, down to ZOOM_EAR.low at the furthest out,
// set on the master bus each frame (zoomEars, from game/visuals.js)
const ZOOM_EAR = { from: 1, low: 0.45 };
const zoomVol = () => !isoOn() ? 1 : 1 - (1 - ZOOM_EAR.low) * smooth(clamp((ZOOM_EAR.from - zoom) / (ZOOM_EAR.from - ZOOM_MIN), 0, 1));
export function zoomEars() { if (master) master.gain.setTargetAtTime(MASTER_VOL * zoomVol() * SET.vol / 100, AC.currentTime, 0.08); }   // (and the settings' volume: ui/settings.js)
// Whatever stands full height between you and a sound muffles it: each wall, container, tall stack or boarded-up
// opening it comes through takes more of the top off it (a lowpass down to WALL_MUFF.lp, lower again for each more)
// and turns it down (WALL_MUFF.vol), up to three. Counted the whole way along the straight line from you (or whoever
// you're watching) to it, not only beside you: the farmhouse's walls and its inside ones (world/thin-walls.js), a
// board-up window (an open one or a doorway lets it through), the arena's walls, huts and containers. Anything low
// enough to see over (a barrier, sandbags, a fence: MUFF_LOW, its top in m) lets it through
const WALL_MUFF = { lp: [20000, 1500, 800, 480], vol: [1, 0.62, 0.42, 0.3] }, MUFF_MAX = 3, MUFF_LOW = 1.6;
function wallsBetween(x0, z0, x1, z1) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 0.2); let walls = Math.min(MUFF_MAX, thinWalk(x0, z0, x1, z1, true)), inWall = false;   // (the house's inside walls: world/thin-walls.js)
  const si = ci(x0), sj = ci(z0);
  for (let s = 1; s < n && walls < MUFF_MAX; s++) {
    const i = ci(x0 + (x1 - x0) * s / n), j = ci(z0 + (z1 - z0) * s / n); if (!inb(i, j) || (i === si && j === sj)) continue;
    const k = idx(i, j), t = cell[k], o = openAt[k], solid = t === WALL || (t === OPEN && o && shutN(o) >= 2) || (t === OBST && (obstTop.get(k) || 0) > MUFF_LOW);
    if (solid && !inWall) walls++;
    inWall = solid;
  }
  return walls;
}
// how a sound from (x, z) reaches you: its volume for how far off it is and the walls it comes through, its lowpass,
// and how far it sits to one side. Most sounds (a blow, a hit, a body going down, a shell on the floor) die away to
// nothing by EAR_NEAR, m, so nothing that small is heard from across a map; a gunshot (far) carries, quieter the
// further but never gone (EAR_FAR: past this it's at its quietest). wallsOnly: a sound that already sets its own volume
// by distance (a blast, a groan) takes only the walls' muffling
const EAR_FAR = 34, EAR_NEAR = 30, EAR_CURVE = 1.6;
// Only what's fully between you and it muffles it: a wall it can get round (past its end, over a gap beside it) lets
// it through, a little softened (BEND: how far aside it looks for the way round, m, as a share of the distance up to
// most; what it costs, a step down in volume and top, bend), so a shot just round a corner is clear and one through a
// building is dull
const BEND = { share: 0.35, most: 6, vol: 0.82, lp: 5200 };
function wallsAround(fx, fz, x, z, d) {
  const w = wallsBetween(fx, fz, x, z); if (!w || d < 1.5) return { w, bend: false };
  const o = Math.min(BEND.most, d * BEND.share), mx = (fx + x) / 2, mz = (fz + z) / 2, px = -(z - fz) / d, pz = (x - fx) / d;
  let best = w;
  for (const s of [-1, 1]) { const ax = mx + px * o * s, az = mz + pz * o * s; const n = wallsBetween(fx, fz, ax, az) + wallsBetween(ax, az, x, z); if (n < best) best = n; if (!best) break; }
  return best < w ? { w: best, bend: true } : { w, bend: false };
}
export function earFrom(x, z, wallsOnly, far) {
  const f = typeof camFocus === 'function' ? camFocus() : P, d = Math.hypot(x - f.x, z - f.z), A = d < 0.5 ? { w: 0, bend: false } : wallsAround(f.x, f.z, x, z, d), w = A.w, bk = A.bend ? BEND.vol : 1;
  if (wallsOnly) return { vol: WALL_MUFF.vol[w] * bk, lp: A.bend ? Math.min(WALL_MUFF.lp[w], BEND.lp) : WALL_MUFF.lp[w], pan: 0, walls: w };
  const wl = A.bend ? Math.min(WALL_MUFF.lp[w], BEND.lp) : WALL_MUFF.lp[w];
  return { vol: (far ? clamp(1.1 - d / EAR_FAR, 0.18, 1) : Math.pow(clamp(1.05 - d / EAR_NEAR, 0, 1), EAR_CURVE)) * WALL_MUFF.vol[w] * bk, lp: d > 10 ? Math.min(wl, clamp(16000 - d * 450, 2500, 16000)) : wl, pan: clamp(((x - f.x) * RIGHT.x + (z - f.z) * RIGHT.z) / 14, -0.6, 0.6), walls: w };
}
// a synth sound through its walls' lowpass on its way to the master bus
export function earOut(e) {
  let out = master;
  if (e.pan && AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = e.pan; p.connect(out); out = p; }   // (off to its side)
  if (e.lp >= 20000) return out;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = e.lp; f.Q.value = 0.6; f.connect(out); return f;
}
// make whatever sounds fn plays come from (x, z)
export function soundAt(x, z, fn, wallsOnly) { const o = SND_AT; setSND_AT({ x, z, w: !!wallsOnly }); try { fn(); } finally { setSND_AT(o); } }
// play part of a buffer (o.at for o.dur seconds, or all of it) at a point on the ground (o.x, o.z), at o.vol and o.rate;
// through the house's walls, muffled
export function playAt(buf, o) {
  if (!AC || !buf) return;
  const h = hearAt(o.x, o.z), src = AC.createBufferSource(), g = AC.createGain(), f = typeof camFocus === 'function' ? camFocus() : P, A = wallsAround(f.x, f.z, o.x, o.z, Math.hypot(o.x - f.x, o.z - f.z)), w = A.w;
  src.buffer = buf; src.playbackRate.value = o.rate || 1; sndLive(src);   // (slowed with the game: audio/samples.js)
  g.gain.value = (o.vol ?? 1) * h.gain * WALL_MUFF.vol[w] * (A.bend ? BEND.vol : 1);
  if (w || A.bend) { const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = A.bend ? Math.min(WALL_MUFF.lp[w], BEND.lp) : WALL_MUFF.lp[w]; lp.Q.value = 0.6; src.connect(lp); lp.connect(g); } else src.connect(g);
  if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = h.pan; g.connect(p); p.connect(master); } else g.connect(master);
  if (o.dur) src.start(AC.currentTime, o.at || 0, o.dur); else src.start(AC.currentTime, o.at || 0);
}
// a recorded sound's file: fetched by the page from dist/sounds, or carried inside the one-file build (window.SOUND_DATA,
// tools/build.mjs). Its bytes are fetched straight away and decoded once there's an audio context (audioInit)
const SOUNDS = {};
export function loadSound(url) {
  const s = SOUNDS[url] = { bytes: null, buf: null };
  fetch((window.SOUND_DATA && window.SOUND_DATA[url]) || url).then(r => r.ok ? r.arrayBuffer() : null).then(b => { s.bytes = b; decodeSounds(); }).catch(() => {});
  return s;
}
export function decodeSounds() {
  if (!AC) return;
  Object.values(SOUNDS).forEach(s => { if (s.bytes && !s.buf && !s.busy) { s.busy = true; AC.decodeAudioData(s.bytes.slice(0), b => { s.buf = b; }, () => {}); } });
}
