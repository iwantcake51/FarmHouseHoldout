// Sounds placed in the world. They're heard from a listener hung over the middle of the view, higher the further out you
// zoom (HEAR.h / cam.zoom), so a sound gets quieter as you zoom out and, from off to one side of the screen, sits in that
// ear (StereoPanner). Every one plays through a gain and a panner of its own into the master bus (audio/audio.js).
import { cam, RIGHT, VIEW, zoom, ZOOM_MIN } from '../core/renderer.js';
import { clamp, smooth } from '../core/math.js';
import { cell, ci, idx, inb, OPEN, openAt, WALL } from '../world/grid.js';
import { thinWalk } from '../world/thin-walls.js';
import { P } from '../player/player.js';
import { shutN } from '../barricades/planks.js';
import { AC, master, MASTER_VOL, setSND_AT, SND_AT } from './audio.js';
import { camTarget } from '../game/camera.js';
import { camFocus } from '../net/spectate.js';
import { SET } from '../ui/settings.js';

const HEAR = { h: 5.4, ref: 3, pan: 0.6 };   // listener height at zoom 1 (m), the distance a sound plays at full volume, how far it pans
function hearAt(x, z) {
  const zm = Math.max(0.1, cam.zoom || 1), dx = x - camTarget.x, dz = z - camTarget.z;
  const halfW = VIEW * (innerWidth / Math.max(1, innerHeight)) / zm, across = dx * RIGHT.x + dz * RIGHT.z;
  // (divided by the master's own zoom fade, zoomVol, which these already have from the listener's height)
  return { gain: Math.min(1, HEAR.ref / Math.hypot(dx, dz, HEAR.h / zm)) / zoomVol(), pan: clamp(across / halfW, -1, 1) * HEAR.pan };
}
// every sound quieter the further out you zoom: full from the default zoom in, down to ZOOM_EAR.low at the furthest out,
// set on the master bus each frame (zoomEars, from game/visuals.js)
const ZOOM_EAR = { from: 1, low: 0.45 };
const zoomVol = () => 1 - (1 - ZOOM_EAR.low) * smooth(clamp((ZOOM_EAR.from - zoom) / (ZOOM_EAR.from - ZOOM_MIN), 0, 1));
export function zoomEars() { if (master) master.gain.setTargetAtTime(MASTER_VOL * zoomVol() * SET.vol / 100, AC.currentTime, 0.08); }   // (and the settings' volume: ui/settings.js)
// The farmhouse's walls between you and a sound muffle it: each one it comes through takes the top off it (a lowpass
// down to WALL_MUFF.lp, then lower again for a second) and turns it down (WALL_MUFF.vol). A board-up window counts as a
// wall, an open one or a doorway doesn't. Counted along the straight line from you (or the teammate you're watching)
const WALL_MUFF = { lp: [20000, 1300, 650], vol: [1, 0.6, 0.38] };
function wallsBetween(x0, z0, x1, z1) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 0.2); let walls = thinWalk(x0, z0, x1, z1, true), inWall = false;   // (the house's inside walls: world/thin-walls.js)
  if (walls >= 2) return 2;
  for (let s = 1; s < n; s++) {
    const i = ci(x0 + (x1 - x0) * s / n), j = ci(z0 + (z1 - z0) * s / n); if (!inb(i, j)) continue;
    const k = idx(i, j), t = cell[k], o = openAt[k], solid = t === WALL || (t === OPEN && o && shutN(o) >= 2);
    if (solid && !inWall && ++walls >= 2) return 2;
    inWall = solid;
  }
  return walls;
}
// how a sound from (x, z) reaches you: its volume for how far off it is (EAR_FAR: past this it's at its quietest) and the
// walls it comes through, its lowpass, and how far it sits to one side. wallsOnly: a sound that already sets its own
// volume by distance (a blast, a groan) takes only the walls' muffling
const EAR_FAR = 34;
export function earFrom(x, z, wallsOnly) {
  const f = typeof camFocus === 'function' ? camFocus() : P, d = Math.hypot(x - f.x, z - f.z), w = d < 0.5 ? 0 : wallsBetween(f.x, f.z, x, z);
  if (wallsOnly) return { vol: WALL_MUFF.vol[w], lp: WALL_MUFF.lp[w], pan: 0, walls: w };
  return { vol: clamp(1.1 - d / EAR_FAR, 0.18, 1) * WALL_MUFF.vol[w], lp: d > 10 ? Math.min(WALL_MUFF.lp[w], clamp(16000 - d * 450, 2500, 16000)) : WALL_MUFF.lp[w], pan: clamp(((x - f.x) * RIGHT.x + (z - f.z) * RIGHT.z) / 14, -0.6, 0.6), walls: w };
}
// a synth sound through its walls' lowpass on its way to the master bus
export function earOut(e) {
  if (e.lp >= 20000) return master;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = e.lp; f.Q.value = 0.6; f.connect(master); return f;
}
// make whatever sounds fn plays come from (x, z)
export function soundAt(x, z, fn, wallsOnly) { const o = SND_AT; setSND_AT({ x, z, w: !!wallsOnly }); try { fn(); } finally { setSND_AT(o); } }
// play part of a buffer (o.at for o.dur seconds, or all of it) at a point on the ground (o.x, o.z), at o.vol and o.rate;
// through the house's walls, muffled
export function playAt(buf, o) {
  if (!AC || !buf) return;
  const h = hearAt(o.x, o.z), src = AC.createBufferSource(), g = AC.createGain(), f = typeof camFocus === 'function' ? camFocus() : P, w = wallsBetween(f.x, f.z, o.x, o.z);
  src.buffer = buf; src.playbackRate.value = o.rate || 1; g.gain.value = (o.vol ?? 1) * h.gain * WALL_MUFF.vol[w];
  if (w) { const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = WALL_MUFF.lp[w]; lp.Q.value = 0.6; src.connect(lp); lp.connect(g); } else src.connect(g);
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
