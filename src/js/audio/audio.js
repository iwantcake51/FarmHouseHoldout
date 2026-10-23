// Web Audio setup and the two synth building blocks (noise and tone).

import { rand } from '../core/math.js';
import { samplesInit } from './samples.js';
import { decodeSounds, earFrom, earOut } from './spatial.js';

export let AC = null, master = null, noiseBuf = null, muff = null;
export const MASTER_VOL = 0.5;   // the master bus, before the zoom's fade (zoomEars, audio/spatial.js)
// where the sound being made comes from, while soundAt runs (audio/spatial.js): the synth's noise and tones below, and
// the recorded ones (playS, audio/samples.js), are then quieter with distance and muffled through the house's walls
export let SND_AT = null;
export function audioInit() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = MASTER_VOL; muff = AC.createBiquadFilter(); muff.type = 'lowpass'; muff.frequency.value = 20000; master.connect(muff); muff.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
  if (AC) samplesInit();   // the recorded sounds and the house's reverb (audio/samples.js)
  decodeSounds();   // the recorded ones fetched so far (audio/spatial.js)
}
export function nz(dur, type, f0, f1, vol, q) {
  if (!AC) return; const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = type; f.Q.value = q || 0.8; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const e = SND_AT && earFrom(SND_AT.x, SND_AT.z, SND_AT.w); if (e) g.gain.setValueAtTime(vol * e.vol, t);
  s.connect(f); f.connect(g); g.connect(e ? earOut(e) : master); s.start(t, rand() * 0.5); s.stop(t + dur + 0.02);
}
export function tn(dur, type, f0, f1, vol) {
  if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const e = SND_AT && earFrom(SND_AT.x, SND_AT.z, SND_AT.w); if (e) g.gain.setValueAtTime(vol * e.vol, t);
  o.connect(g); g.connect(e ? earOut(e) : master); o.start(t); o.stop(t + dur + 0.02);
}

// setters for the variables above that other files change (an imported variable can only be read)
export function setSND_AT(v) { return (SND_AT = v); }
