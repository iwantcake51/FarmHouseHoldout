// Sounds placed in the world. They're heard from a listener hung over the middle of the view, higher the further out you
// zoom (HEAR.h / cam.zoom), so a sound gets quieter as you zoom out and, from off to one side of the screen, sits in that
// ear (StereoPanner). Every one plays through a gain and a panner of its own into the master bus (audio/audio.js).
const HEAR = { h: 5.4, ref: 3, pan: 0.6 };   // listener height at zoom 1 (m), the distance a sound plays at full volume, how far it pans
function hearAt(x, z) {
  const zm = Math.max(0.1, cam.zoom || 1), dx = x - camTarget.x, dz = z - camTarget.z;
  const halfW = VIEW * (innerWidth / Math.max(1, innerHeight)) / zm, across = dx * RIGHT.x + dz * RIGHT.z;
  return { gain: Math.min(1, HEAR.ref / Math.hypot(dx, dz, HEAR.h / zm)), pan: clamp(across / halfW, -1, 1) * HEAR.pan };
}
// play part of a buffer (o.at for o.dur seconds, or all of it) at a point on the ground (o.x, o.z), at o.vol and o.rate
function playAt(buf, o) {
  if (!AC || !buf) return;
  const h = hearAt(o.x, o.z), src = AC.createBufferSource(), g = AC.createGain();
  src.buffer = buf; src.playbackRate.value = o.rate || 1; g.gain.value = (o.vol ?? 1) * h.gain;
  src.connect(g);
  if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = h.pan; g.connect(p); p.connect(master); } else g.connect(master);
  if (o.dur) src.start(AC.currentTime, o.at || 0, o.dur); else src.start(AC.currentTime, o.at || 0);
}
// a recorded sound's file: fetched by the page from dist/sounds, or carried inside the one-file build (window.SOUND_DATA,
// tools/build.mjs). Its bytes are fetched straight away and decoded once there's an audio context (audioInit)
const SOUNDS = {};
function loadSound(url) {
  const s = SOUNDS[url] = { bytes: null, buf: null };
  fetch((window.SOUND_DATA && window.SOUND_DATA[url]) || url).then(r => r.ok ? r.arrayBuffer() : null).then(b => { s.bytes = b; decodeSounds(); }).catch(() => {});
  return s;
}
function decodeSounds() {
  if (!AC) return;
  Object.values(SOUNDS).forEach(s => { if (s.bytes && !s.buf && !s.busy) { s.busy = true; AC.decodeAudioData(s.bytes.slice(0), b => { s.buf = b; }, () => {}); } });
}
