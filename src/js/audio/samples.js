// Recorded sounds and the reverb inside the house.
//
// The recordings are in src/sounds/ (cut from the packs in assets/sounds/ by tools/make-sounds.mjs). They load once
// audio starts; until one's in, or if the browser can't decode it, its synthesized sound in audio/sfx.js plays instead.

// how loud each plays, and (gap, s) the least time between two of it, so eight pellets into one zombie are one hit
const SAMPLES = {
  shot_pistol: { vol: 0.9 }, shot_revolver: { vol: 1.0 }, shot_deagle: { vol: 1.15 }, shot_pump: { vol: 1.1 }, shot_dbl: { vol: 1.15 },
  shot_auto12: { vol: 0.95 }, shot_hunting: { vol: 1.15 }, shot_scar: { vol: 1.1 }, shot_smg: { vol: 0.72 }, shot_sub: { vol: 0.78 }, shot_ar: { vol: 0.85 },
  shot_lmg: { vol: 0.9 }, shot_gl: { vol: 0.9 },
  supp_pistol: { vol: 0.6 }, supp_smg: { vol: 0.55 }, supp_rifle: { vol: 0.65 }, supp_sniper: { vol: 0.7 }, supp_shotgun: { vol: 0.7 },
  dry_pistol: { vol: 0.45 }, dry_smg: { vol: 0.45 }, dry_rifle: { vol: 0.45 },
  magout_pistol: { vol: 0.42 }, magout_smg: { vol: 0.42 }, magout_rifle: { vol: 0.45 },
  magin_pistol: { vol: 0.5 }, magin_smg: { vol: 0.5 }, magin_rifle: { vol: 0.55 },
  shell_load: { vol: 0.5 }, brute_wall: { vol: 0.85 }, round_in: { vol: 0.42 },
  charge_pull_rifle: { vol: 0.4 }, charge_slam_rifle: { vol: 0.55 }, charge_pull_smg: { vol: 0.4 }, charge_slam_smg: { vol: 0.5 },
  slide_pull: { vol: 0.38 }, slide_drop: { vol: 0.5 },
  pump_back: { vol: 0.5 }, pump_home: { vol: 0.6 }, pump_back_2: { vol: 0.5 }, pump_home_2: { vol: 0.6 },
  safety_1: { vol: 0.4 }, safety_2: { vol: 0.4 },
  mag_drop: { vol: 0.32, gap: 0.03 }, gun_drop: { vol: 0.5 },
  boom_close: { vol: 1.25, gap: 0.08 }, boom_far: { vol: 0.9, gap: 0.08 },
  swing_light_1: { vol: 0.35 }, swing_light_2: { vol: 0.35 }, swing_heavy_1: { vol: 0.45 }, swing_heavy_2: { vol: 0.45 }, swing_heavy_3: { vol: 0.45 },
  swing_knife: { vol: 0.4 }, draw_blade: { vol: 0.38 }, draw_knife: { vol: 0.38 },
  hit_blunt_1: { vol: 0.6 }, hit_blunt_2: { vol: 0.6 }, hit_blunt_big_1: { vol: 0.75 }, hit_blunt_big_2: { vol: 0.75 },
  hit_blade_1: { vol: 0.55 }, hit_blade_2: { vol: 0.55 }, hit_chop_1: { vol: 0.7 }, hit_chop_2: { vol: 0.7 },
  flesh_1: { vol: 0.32 }, flesh_2: { vol: 0.32 }, head_hit: { vol: 0.28 },
  sever: { vol: 0.48 }, head_pop: { vol: 0.58 },
  wood_hit_1: { vol: 0.45 }, wood_hit_2: { vol: 0.45 }, wood_break: { vol: 0.55 },
  craft: { vol: 0.5 }, pickup: { vol: 0.5 }, equip: { vol: 0.42 }, upgrade: { vol: 0.45 }, crate_open: { vol: 0.55 }, medkit: { vol: 0.45 }
};
const SOUND_HASH = {};   // file -> a hash of it, written in by tools/build.mjs
const sbuf = {}, sGapT = {}, sLast = {};
let verbIn = null, echoIn = null, echoLp = null, echoOut = null, sVoices = 0;
// the house's own sound: a short, boxy room. Noise dying away over about 0.85 s, darker as it goes (the walls soak up
// the highs first), after a few hard early reflections off the walls close by
function houseIR() {
  const sr = AC.sampleRate, len = Math.floor(sr * 1.2), ir = AC.createBuffer(2, len, sr), pre = Math.floor(sr * 0.006);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr, a = Math.max(0.05, 0.7 - t * 1.4);
      lp += a * ((rand() * 2 - 1) - lp); d[i] = lp * Math.exp(-t * 6.9 / 0.85);
    }
    for (const [ms, g] of [[8, 0.9], [13, 0.7], [19, 0.55], [26, 0.45], [34, 0.35], [45, 0.25]]) d[Math.floor((ms + c * 1.9) * sr / 1000)] += rand() < 0.5 ? -g : g;
  }
  return ir;
}
// the farm's echo, for gunshots: the shot comes back off the tree line, the barn and the hills, a few distinct
// slap-backs smeared by distance (FAR_ECHO.taps: when, in ms, and how loud) over a long low roll that swells in after a
// beat and dies away over FAR_ECHO.tail seconds, darker as it goes (the air soaks up the highs first). Each ear hears it
// a little differently, so it's wide
const FAR_ECHO = { taps: [[180, 0.55], [290, 0.4], [430, 0.32], [610, 0.22], [820, 0.15]], tail: 2.6, gap: 0.09 };
function farIR() {
  const sr = AC.sampleRate, len = Math.floor(sr * (FAR_ECHO.tail + 0.6)), ir = AC.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = Math.floor(sr * FAR_ECHO.gap); i < len; i++) {
      const t = i / sr, env = Math.min(1, (t - FAR_ECHO.gap) / 0.25) * Math.exp(-t * 6.9 / FAR_ECHO.tail) * 0.22, a = Math.max(0.03, 0.35 - t * 0.12);
      lp += a * ((rand() * 2 - 1) - lp); d[i] += lp * env;
    }
    for (const [ms, g] of FAR_ECHO.taps) {
      const at = Math.floor((ms + rr(-14, 14)) * sr / 1000), w = Math.floor(sr * 0.035); let l2 = 0;
      for (let k = 0; k < w * 3 && at + k < len; k++) { l2 += 0.25 * ((rand() * 2 - 1) - l2); d[at + k] += l2 * g * Math.exp(-k / w) * 3; }
    }
  }
  return ir;
}
// how the echo reaches you: out in the open, clear (ECHO_AT.out: its level and the top it keeps); indoors, through the
// walls, quieter and dull (ECHO_AT.in), while the room rings with the shot itself (the shots' verb, audio/sfx.js)
const ECHO_AT = { out: [0.6, 4200], in: [0.32, 800] };
function echoSet(inside) {
  if (!echoOut) return;
  const [g, f] = inside ? ECHO_AT.in : ECHO_AT.out, t = AC.currentTime;
  echoOut.gain.setTargetAtTime(g, t, 0.05); echoLp.frequency.setTargetAtTime(f, t, 0.05);
}
function samplesInit() {
  try {
    const cv = AC.createConvolver(), hp = AC.createBiquadFilter(), lp = AC.createBiquadFilter();
    cv.buffer = houseIR(); hp.type = 'highpass'; hp.frequency.value = 160; lp.type = 'lowpass'; lp.frequency.value = 6500;
    verbIn = AC.createGain(); verbIn.connect(cv); cv.connect(hp); hp.connect(lp); lp.connect(master);
  } catch (e) { verbIn = null; }
  try {
    const cv = AC.createConvolver(), hp = AC.createBiquadFilter();
    cv.buffer = farIR(); hp.type = 'highpass'; hp.frequency.value = 90; echoLp = AC.createBiquadFilter(); echoLp.type = 'lowpass'; echoLp.frequency.value = ECHO_AT.out[1];
    echoOut = AC.createGain(); echoOut.gain.value = ECHO_AT.out[0];
    echoIn = AC.createGain(); echoIn.connect(cv); cv.connect(hp); hp.connect(echoLp); echoLp.connect(echoOut); echoOut.connect(master);
  } catch (e) { echoIn = null; }
  // asked for by a hash of their contents (tools/build.mjs fills SOUND_HASH in), or carried inside the one-file build
  for (const name in SAMPLES) {
    const f = name + '.ogg', url = 'sounds/' + f + (SOUND_HASH[f] ? '?v=' + SOUND_HASH[f] : '');
    fetch((window.SOUND_DATA && window.SOUND_DATA[url]) || url).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(ab => new Promise((ok, no) => AC.decodeAudioData(ab, ok, no))).then(b => { sbuf[name] = b; }, () => {});
  }
}
// whether you're inside the farmhouse
const indoors = () => inHouseRect(P.x, P.z, 0);
// plays a recorded sound (or one of a list, not the same one twice running). False if it isn't loaded, so the caller
// plays its synthesized one. o: vol (times its own), rate, jit (the rate's varied by up to this either way, each
// time), echo (how much goes to the farm's echo: FAR_ECHO), lp (a lowpass at this), hp (a highpass at this), dur (only its first this many seconds, faded out over the
// back of them), tone (a bump or dip of up to this many dB somewhere in the mids), pan, verb (how much goes to the
// house's reverb), gap (overrides its own)
function playS(name, o) {
  if (!AC) return false;
  o = o || {};
  const key = Array.isArray(name) ? name[0] : name;
  if (Array.isArray(name)) { const ok = name.filter(n => sbuf[n]); if (!ok.length) return false; name = ok.length > 1 ? pick(ok.filter(n => n !== sLast[key])) : ok[0]; sLast[key] = name; }
  const b = sbuf[name], d = SAMPLES[name]; if (!b) return false;
  // from somewhere on the farm (o.at, or soundAt's SND_AT): quieter with distance, off to its side, muffled through walls
  const at = o.at || SND_AT, ear = at ? earFrom(at.x ?? at[0], at.z ?? at[1], at.w) : null;
  const t = AC.currentTime, gap = o.gap ?? d.gap;
  if (gap && t - (sGapT[key] ?? -9) < gap) return true;   // one just played: this is covered by it
  if (sVoices > 48) return true;
  sGapT[key] = t;
  const s = AC.createBufferSource(), g = AC.createGain(), jit = o.jit ?? 0.04;
  s.buffer = b; s.playbackRate.value = (o.rate || 1) * rr(1 - jit, 1 + jit);
  g.gain.value = d.vol * (o.vol ?? 1) * rr(0.9, 1) * (ear ? ear.vol : 1);
  let n = s;
  const lp = Math.min(o.lp || 20000, ear ? ear.lp : 20000);
  if (lp < 20000) { const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.6; n.connect(f); n = f; }
  if (o.hp) { const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; f.Q.value = 0.7; n.connect(f); n = f; }
  if (o.low) { const f = AC.createBiquadFilter(); f.type = 'lowshelf'; f.frequency.value = o.low[0]; f.gain.value = o.low[1]; n.connect(f); n = f; }   // (o.low: [Hz, dB] more or less bass under that)
  if (o.tone) { const f = AC.createBiquadFilter(); f.type = 'peaking'; f.frequency.value = rr(350, 3200); f.Q.value = 0.9; f.gain.value = rr(-o.tone, o.tone); n.connect(f); n = f; }
  n.connect(g); n = g;
  const pan = o.pan ?? (ear ? ear.pan : 0);
  if (pan && AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
  n.connect(master);
  if (o.verb && verbIn && !(ear && ear.walls)) { const v = AC.createGain(); v.gain.value = o.verb; n.connect(v); v.connect(verbIn); }
  if (o.echo && echoIn) { const v = AC.createGain(); v.gain.value = o.echo; n.connect(v); v.connect(echoIn); }   // (the farm's echo: FAR_ECHO)
  sVoices++; s.onended = () => { sVoices--; };
  if (o.dur) { const v = g.gain.value; g.gain.setValueAtTime(v, t + o.dur * 0.35); g.gain.linearRampToValueAtTime(0, t + o.dur); s.start(t); s.stop(t + o.dur + 0.02); return true; }
  s.start(t);
  return true;
}
// a recording played round and round for as long as something lasts (the bandage going on): each pass a touch
// faster or slower than the last and faded in over the tail of the one before (LOOP_XF), so the join can't be heard.
// Its tick() lines up the next pass shortly before it's due (call it every frame while it should keep going); stop()
// fades the whole thing out over fade seconds and then cuts it. Null if the recording isn't loaded
const LOOP_XF = 0.16;
function loopS(name, o) {
  if (!AC || !sbuf[name]) return null;
  o = o || {};
  const b = sbuf[name], out = AC.createGain(), xf = Math.min(LOOP_XF, b.duration * 0.3);
  out.gain.value = SAMPLES[name].vol * (o.vol ?? 1); out.connect(master);
  const h = { on: true, srcs: [], next: 0 };
  const pass = (t, first) => {
    const s = AC.createBufferSource(), g = AC.createGain(); s.buffer = b; s.playbackRate.value = (o.rate || 1) * rr(0.95, 1.05);
    const d = b.duration / s.playbackRate.value, fin = first ? 0.04 : xf;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fin); g.gain.setValueAtTime(1, t + d - xf); g.gain.linearRampToValueAtTime(0, t + d);
    s.connect(g); g.connect(out); s.start(t); s.stop(t + d + 0.02); h.srcs.push(s); sVoices++;
    s.onended = () => { sVoices--; const i = h.srcs.indexOf(s); if (i >= 0) h.srcs.splice(i, 1); };
    return t + d - xf;
  };
  h.tick = () => { if (h.on && AC.currentTime > h.next - 0.25) h.next = pass(Math.max(h.next, AC.currentTime)); };
  h.stop = fade => {
    if (!h.on) return; h.on = false;
    const t = AC.currentTime, f = Math.max(0.03, fade ?? 0.3);
    // eased away (most of it gone in the first half), then cut once it's silent
    out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.setTargetAtTime(0, t, f / 4);
    h.srcs.forEach(s => { try { s.stop(t + f + 0.05); } catch (e) {} });
    setTimeout(() => out.disconnect(), (f + 0.2) * 1000);
  };
  h.next = pass(AC.currentTime, true); h.tick();
  return h;
}
// which family of gun the one in your hands is, for its reload and dry-fire sounds
const GUN_KIND = { pistol: 'pistol', revolver: 'pistol', deagle: 'pistol', smg: 'smg', sub: 'smg', ar: 'rifle', lmg: 'rifle', hunting: 'rifle', scar: 'rifle', auto12: 'rifle', pump: 'shotgun', dbl: 'shotgun' };
const gunKind = () => GUN_KIND[curId()] || 'rifle';
const SUPP_SFX = { pistol: 'supp_pistol', revolver: 'supp_pistol', deagle: 'supp_pistol', smg: 'supp_smg', sub: 'supp_smg', ar: 'supp_rifle', lmg: 'supp_rifle', hunting: 'supp_sniper', scar: 'supp_sniper', pump: 'supp_shotgun', dbl: 'supp_shotgun', auto12: 'supp_shotgun' };
