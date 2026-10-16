// Web Audio setup and the two synth building blocks (noise and tone).

let AC = null, master = null, noiseBuf = null, muff = null;
// where the sound being made comes from, while soundAt runs (audio/spatial.js): the synth's noise and tones below, and
// the recorded ones (playS, audio/samples.js), are then quieter with distance and muffled through the house's walls
let SND_AT = null;
function audioInit() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.5; muff = AC.createBiquadFilter(); muff.type = 'lowpass'; muff.frequency.value = 20000; master.connect(muff); muff.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
  if (AC) samplesInit();   // the recorded sounds and the house's reverb (audio/samples.js)
  decodeSounds();   // the recorded ones fetched so far (audio/spatial.js)
}
function nz(dur, type, f0, f1, vol, q) {
  if (!AC) return; const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = type; f.Q.value = q || 0.8; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const e = SND_AT && earFrom(SND_AT.x, SND_AT.z, SND_AT.w); if (e) g.gain.setValueAtTime(vol * e.vol, t);
  s.connect(f); f.connect(g); g.connect(e ? earOut(e) : master); s.start(t, rand() * 0.5); s.stop(t + dur + 0.02);
}
function tn(dur, type, f0, f1, vol) {
  if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const e = SND_AT && earFrom(SND_AT.x, SND_AT.z, SND_AT.w); if (e) g.gain.setValueAtTime(vol * e.vol, t);
  o.connect(g); g.connect(e ? earOut(e) : master); o.start(t); o.stop(t + dur + 0.02);
}
