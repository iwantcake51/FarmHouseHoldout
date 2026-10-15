// Sounds placed in the world. They're heard from a listener hung over the middle of the view, higher the further out you
// zoom (HEAR.h / cam.zoom), so a sound gets quieter as you zoom out and, from off to one side of the screen, sits in that
// ear (StereoPanner). Every one plays through a gain and a panner of its own into the master bus (audio/audio.js).
const HEAR = { h: 5.4, ref: 3, pan: 0.6 };   // listener height at zoom 1 (m), the distance a sound plays at full volume, how far it pans
function hearAt(x, z) {
  const zm = Math.max(0.1, cam.zoom || 1), dx = x - camTarget.x, dz = z - camTarget.z;
  const halfW = VIEW * (innerWidth / Math.max(1, innerHeight)) / zm, across = dx * RIGHT.x + dz * RIGHT.z;
  return { gain: Math.min(1, HEAR.ref / Math.hypot(dx, dz, HEAR.h / zm)), pan: clamp(across / halfW, -1, 1) * HEAR.pan };
}
// play part of a buffer (o.at for o.dur seconds, or all of it) at a point on the ground (o.x, o.z), at o.vol and o.rate;
// o.zoomK is how much zooming out quietens it (1, the default, fully; 0 not at all and dead centre, for the interface)
function playAt(buf, o) {
  if (!AC || !buf) return;
  const h = hearAt(o.x, o.z), zk = o.zoomK ?? 1, src = AC.createBufferSource(), g = AC.createGain();
  src.buffer = buf; src.playbackRate.value = o.rate || 1; g.gain.value = (o.vol ?? 1) * (1 - zk * (1 - h.gain));
  src.connect(g);
  if (AC.createStereoPanner && zk > 0) { const p = AC.createStereoPanner(); p.pan.value = h.pan; g.connect(p); p.connect(master); } else g.connect(master);
  if (o.dur) src.start(AC.currentTime, o.at || 0, o.dur); else src.start(AC.currentTime, o.at || 0);
}
// a recorded sound's file: fetched by the page from dist/sounds, or carried inside the one-file build (window.SOUND_DATA,
// tools/build.mjs). Its bytes are fetched (straight away, or with lazy once audio starts: audioInit) and decoded once
// there's an audio context. As it's decoded its loudness is measured (its loudest 30 ms), so a set of them can be
// played evenly (s.norm, audio/sound-bank.js); the file itself is played as it is
const SOUNDS = {};
function loadSound(url, lazy) {
  if (SOUNDS[url]) return SOUNDS[url];   // (one file in two sets is loaded once)
  const s = SOUNDS[url] = { url, bytes: null, buf: null, norm: 1, lazy: !!lazy };
  if (!lazy) fetchSound(s);
  return s;
}
function fetchSound(s) {
  s.lazy = false; s.asked = true;
  fetch((window.SOUND_DATA && window.SOUND_DATA[s.url]) || s.url).then(r => r.ok ? r.arrayBuffer() : null).then(b => { s.bytes = b; decodeSounds(); }).catch(() => {});
}
function decodeSounds() {
  if (!AC) return;
  Object.values(SOUNDS).forEach(s => {
    if (s.lazy && !s.asked) fetchSound(s);
    if (s.bytes && !s.buf && !s.busy) { s.busy = true; AC.decodeAudioData(s.bytes.slice(0), b => { s.norm = 1 / Math.max(0.01, peakRms(b)); s.buf = b; }, () => {}); }
  });
}
function peakRms(b) {
  const d = b.getChannelData(0), w = Math.max(1, Math.round(b.sampleRate * 0.03)), st = 4; let best = 0, sum = 0;
  for (let i = 0; i < d.length; i += st) { sum += d[i] * d[i]; if (i >= w) sum -= d[i - w] * d[i - w] || 0; }   // (a rough sliding window, every 4th sample)
  for (let i = 0, acc = 0, n = 0; i < d.length; i += st) { acc += d[i] * d[i]; n++; if (n * st >= w) { best = Math.max(best, acc / n); acc = 0; n = 0; } }
  return Math.sqrt(best);
}
