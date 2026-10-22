// The menu music: the piano pieces (src/sounds/menu_*.ogg, from the Piano Pack in assets/sounds/compressed.zip) playing
// one after another on the title (once you're down it's the drone instead: LOST, below), in a shuffled order with no
// piece twice running. Each one starts fading in MUSIC.fade seconds before the last one ends, the two crossed over on
// equal-power curves, so it never stops between them. It sounds a little way off: dulled (a lowpass), and partly heard
// through the farm's echo (audio/samples.js: farIR), as if it's drifting over from the house across the fields. It goes
// quiet over MUSIC.out seconds as a run starts. Its loudness is the Music setting's times the master volume
// (ui/settings.js); it has its own way out, so nothing done to the game's sound (dying's muffle) touches it.

const MUSIC = { files: ['sounds/menu_1.ogg', 'sounds/menu_2.ogg', 'sounds/menu_3.ogg', 'sounds/menu_4.ogg', 'sounds/menu_5.ogg', 'sounds/menu_6.ogg'],
  vol: 0.5, fade: 6, in: 3, out: 2.5, lp: 2300, echo: 0.32, ahead: 0.6 };
const MUS = { bus: null, tracks: null, cur: null, order: [], last: -1, on: false, leave: 0 };
function musicInit() {
  if (!AC || MUS.bus) return;
  MUS.tracks = MUSIC.files.map(f => loadSound(f));
  const bus = AC.createGain(), lp = AC.createBiquadFilter(), hp = AC.createBiquadFilter(), dry = AC.createGain();
  lp.type = 'lowpass'; lp.frequency.value = MUSIC.lp; lp.Q.value = 0.5; hp.type = 'highpass'; hp.frequency.value = 110;
  bus.gain.value = 0; bus.connect(hp); hp.connect(lp); lp.connect(dry); dry.gain.value = 0.85; dry.connect(AC.destination);
  try { const cv = AC.createConvolver(), send = AC.createGain(); cv.buffer = farIR(); send.gain.value = MUSIC.echo; lp.connect(send); send.connect(cv); cv.connect(AC.destination); } catch (e) {}
  MUS.bus = bus;
}
// the next piece: through a shuffled deck, never the one that just played
function musicNext() {
  if (!MUS.order.length) { MUS.order = MUS.tracks.map((_, i) => i).sort(() => rand() - 0.5); if (MUS.order[0] === MUS.last && MUS.order.length > 1) MUS.order.push(MUS.order.shift()); }
  for (let k = 0; k < MUS.order.length; k++) { const i = MUS.order[k]; if (MUS.tracks[i].buf) { MUS.order.splice(k, 1); return i; } }
  return -1;
}
// a piece started at time t, fading up over fade seconds (an equal-power curve, so a crossfade keeps its loudness)
const _musUp = new Float32Array(32).map((_, i) => Math.sin(i / 31 * Math.PI / 2)), _musDown = new Float32Array(32).map((_, i) => Math.cos(i / 31 * Math.PI / 2));
function musicStart(i, t, fade) {
  const buf = MUS.tracks[i].buf, src = AC.createBufferSource(), g = AC.createGain();
  src.buffer = buf; g.gain.value = 0; src.connect(g); g.connect(MUS.bus);
  g.gain.setValueCurveAtTime(_musUp, t, fade); src.start(t);
  MUS.last = i; return { src, g, end: t + buf.duration, i };
}
// Start pressed on the title: the music goes on one slow, even fade from where it is down to nothing over sec seconds
// (cineRun, ui/screens.js: timed to be gone halfway through the glide down onto you), left to run out on its own
const _musOut = new Float32Array(48).map((_, i) => Math.cos(i / 47 * Math.PI / 2) ** 2);
function musicLeave(sec) {
  if (!AC || !MUS.bus) return;
  const g = MUS.bus.gain, t = AC.currentTime, v = g.value;
  try { g.cancelScheduledValues(t); g.setValueCurveAtTime(_musOut.map(k => k * v), t, sec); } catch (e) { g.setTargetAtTime(0, t, sec / 3); }
  MUS.leave = t + sec;
}
// every frame: playing on the menus, the next piece lined up as this one nears its end, the volume as it's set
function musicTick() {
  if (!AC) return; musicInit(); if (!MUS.bus) return;
  lostTick();   // (the drone while you're down: below)
  const want = (state === 'title' || (state === 'dead' && !lostReady())) && SET.music > 0, t = AC.currentTime;
  if (MUS.leave && (want && state !== 'title' || t > MUS.leave + 0.1)) MUS.leave = 0;   // (its fade out on Start runs to the end untouched)
  if (!MUS.leave) MUS.bus.gain.setTargetAtTime(want ? MUSIC.vol * SET.music / 100 * SET.vol / 100 : 0, t, want ? 0.6 : MUSIC.out / 3);
  if (MUS.cur && MUS.cur.next && t > MUS.cur.end) MUS.cur = MUS.cur.next;
  if (!want) { if (MUS.cur && t > MUS.cur.end - 0.05) MUS.cur = null; return; }
  if (!MUS.cur || t > MUS.cur.end) { const i = musicNext(); if (i >= 0) MUS.cur = musicStart(i, t + 0.05, MUSIC.in); return; }
  // lined up a moment ahead: the next one in under this one's last MUSIC.fade seconds, and this one out under it
  const at = MUS.cur.end - MUSIC.fade;
  if (!MUS.cur.next && t > at - MUSIC.ahead) {
    const i = musicNext(); if (i < 0) return;
    const c = MUS.cur, s = Math.max(at, t + 0.02);
    try { c.g.gain.cancelScheduledValues(s); c.g.gain.setValueCurveAtTime(_musDown, s, Math.max(0.5, c.end - s)); } catch (e) { c.g.gain.linearRampToValueAtTime(0, c.end); }
    c.next = musicStart(i, s, Math.max(0.5, c.end - s));
  }
}
// (a browser lets sound start only after you've done something on the page: the first click or key anywhere wakes it,
// so the music's playing on the title before a run's ever started)
['pointerdown', 'keydown'].forEach(t => addEventListener(t, () => audioInit(), { once: true, capture: true }));

// The drone while you're down (src/sounds/lost.ogg, from assets/sounds: "Lost (Loop)"): from the moment you die,
// through the death screen or while you watch a teammate in co-op, till you're back on your feet. It comes in slowly
// over LOST.in seconds and goes slowly over LOST.out once you're up (or back on the title, where the piano takes over),
// and loops for as long as you're down with no seam: each pass starts LOST.xf seconds before the last one ends, the
// two crossed on the same equal-power curves as the piano's. It's kept low and far off: dulled hard (lp), thinned
// below (hp), and mostly heard through the farm's echo (echo), its own way out like the piano's, so dying's muffle
// doesn't touch it. Its loudness is LOST.vol times the Music setting's times the master volume
const LOST = { file: 'sounds/lost.ogg', vol: 0.3, in: 6, out: 4.5, xf: 6, lp: 850, hp: 70, echo: 0.55, dry: 0.6 };
const LST = { bus: null, track: null, cur: null, live: [] };
function lostInit() {
  if (!AC || LST.bus) return;
  LST.track = loadSound(LOST.file);
  const bus = AC.createGain(), lp = AC.createBiquadFilter(), hp = AC.createBiquadFilter(), dry = AC.createGain();
  lp.type = 'lowpass'; lp.frequency.value = LOST.lp; lp.Q.value = 0.4; hp.type = 'highpass'; hp.frequency.value = LOST.hp;
  bus.gain.value = 0; bus.connect(hp); hp.connect(lp); lp.connect(dry); dry.gain.value = LOST.dry; dry.connect(AC.destination);
  try { const cv = AC.createConvolver(), send = AC.createGain(); cv.buffer = farIR(); send.gain.value = LOST.echo; lp.connect(send); send.connect(cv); cv.connect(AC.destination); } catch (e) {}
  LST.bus = bus;
}
const lostReady = () => !!(LST.track && LST.track.buf);
// one pass of it from time t, faded up over fade s (0: straight in, the first, which the bus brings up instead), and
// faded back out over its last LOST.xf s, under the next one
function lostPass(t, fade) {
  const buf = LST.track.buf, src = AC.createBufferSource(), g = AC.createGain(), end = t + buf.duration;
  src.buffer = buf; src.connect(g); g.connect(LST.bus);
  if (fade > 0) { g.gain.value = 0; g.gain.setValueCurveAtTime(_musUp, t, fade); } else g.gain.value = 1;
  g.gain.setValueCurveAtTime(_musDown, end - LOST.xf, LOST.xf);
  src.start(t); src.stop(end + 0.05);
  const p = { src, end }; LST.live.push(p); src.onended = () => { const i = LST.live.indexOf(p); if (i >= 0) LST.live.splice(i, 1); };
  return p;
}
// every frame (from musicTick): wanted while you're down, the next pass lined up as this one nears its end, and when
// it's not wanted it fades and, once it's silent, stops
function lostTick() {
  lostInit(); if (!LST.bus) return;
  const t = AC.currentTime, want = P.dead && state !== 'title' && SET.music > 0 && lostReady();
  LST.bus.gain.setTargetAtTime(want ? LOST.vol * SET.music / 100 * SET.vol / 100 : 0, t, (want ? LOST.in : LOST.out) / 3);
  if (want) {
    if (!LST.cur) LST.cur = lostPass(t + 0.05, 0);
    else if (t > LST.cur.end - LOST.xf - 0.6) LST.cur = lostPass(LST.cur.end - LOST.xf, LOST.xf);
  } else if (LST.cur && LST.bus.gain.value < 0.002) {
    LST.live.slice().forEach(p => { try { p.src.stop(); } catch (e) {} }); LST.live.length = 0; LST.cur = null;   // (gone quiet: next time it starts from the top)
  }
}
