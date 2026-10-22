// The menu music: the piano pieces (src/sounds/menu_*.ogg, from the Piano Pack in assets/sounds/compressed.zip)
// playing one after another on the title and the end screen, in a shuffled order with no piece twice running. Each
// one starts fading in MUSIC.fade seconds before the last one ends, the two crossed over on equal-power curves, so
// it never stops between them. It sounds a little way off: dulled (a lowpass), and partly heard through the farm's
// echo (audio/samples.js: farIR), as if it's drifting over from the house across the fields. It goes quiet over
// MUSIC.out seconds as a run starts. Its loudness is the Music setting's times the master volume (ui/settings.js); it
// has its own way out, so nothing done to the game's sound (dying's muffle) touches it.

const MUSIC = { files: ['sounds/menu_1.ogg', 'sounds/menu_2.ogg', 'sounds/menu_3.ogg', 'sounds/menu_4.ogg', 'sounds/menu_5.ogg', 'sounds/menu_6.ogg'],
  vol: 0.5, fade: 6, in: 3, out: 2.5, lp: 2300, echo: 0.32, ahead: 0.6 };
const MUS = { bus: null, tracks: null, cur: null, order: [], last: -1, on: false };
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
// every frame: playing on the menus, the next piece lined up as this one nears its end, the volume as it's set
function musicTick() {
  if (!AC) return; musicInit(); if (!MUS.bus) return;
  const want = (state === 'title' || state === 'dead') && SET.music > 0, t = AC.currentTime;
  MUS.bus.gain.setTargetAtTime(want ? MUSIC.vol * SET.music / 100 * SET.vol / 100 : 0, t, want ? 0.6 : MUSIC.out / 3);
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
