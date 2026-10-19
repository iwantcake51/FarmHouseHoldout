// Wave building, spawning schedule, breaks and wave clear.

// how many of each kind come is set by the wave number alone, whatever the time of day: sprinters from wave 3 (a
// tenth of the wave, rising to three in ten by wave 12), brutes from wave 5 (one in twenty-five, up to one in eight),
// and every fifth wave two more brutes on top. They come in a shuffled order.
const waveMix = n => ({ runner: n >= 3 ? Math.min(0.3, 0.1 + (n - 3) * 0.022) : 0, brute: n >= 5 ? Math.min(0.125, 0.04 + (n - 5) * 0.0085) : 0 });
// In co-op the horde grows with the team: 35% more for each survivor past the first
const teamK = () => 1 + 0.35 * (netTeam() - 1);
function buildWave(n) {
  const count = Math.round((5 + Math.round(n * 3.4)) * teamK()), mix = waveMix(n);
  const runners = Math.round(count * mix.runner), brutes = Math.round(count * mix.brute);
  const list = Array.from({ length: Math.max(0, count - runners - brutes) }, () => 'walker');
  if (n % 5 === 0) list.push('brute', 'brute');
  for (let k = 0; k < runners; k++) list.push('runner');
  for (let k = 0; k < brutes; k++) list.push('brute');
  for (let k = list.length - 1; k > 0; k--) { const j = (rand() * (k + 1)) | 0; [list[k], list[j]] = [list[j], list[k]]; }
  return list;
}
// A wave doesn't come as one even stream: it comes in surges. Each is a share of the wave (SURGE.share, between
// SURGE.min and SURGE.max of them) that starts as a trickle and quickens to a rush (the gap between spawns eased from
// SURGE.build down to SURGE.peak times the usual), then nothing spawns for a few seconds (SURGE.lull): a moment to reload
// or put a board back before the next one builds. The zombies already in keep coming through the lull; it's only the
// spawning that stops. A little left over joins the surge before it rather than making a surge of its own
const SURGE = { share: 0.28, min: 5, max: 16, build: 1.5, peak: 0.45, lull: [3, 4.5] };
const surge = { n: 0, done: 0, lull: 0 };
function nextSurge() {
  const left = spawnQ.length, n = clamp(Math.round(run.waveTotal * SURGE.share * rr(0.85, 1.15)), SURGE.min, SURGE.max);
  surge.n = left - n < SURGE.min ? left : n; surge.done = 0;
}
// the gap before the next spawn, by how far into its surge the wave is
const surgeGap = () => SURGE.build + (SURGE.peak - SURGE.build) * smooth(clamp(surge.done / Math.max(1, surge.n - 1), 0, 1));
function startWave() {
  spawnQ = buildWave(run.wave + 1);
  waveBegins(run.wave + 1, spawnQ.length);
  netSend('wave', { n: run.wave, tot: run.waveTotal });   // (co-op: everyone's wave starts with the host's, net/sync.js)
  surge.lull = 0; nextSurge();
}
// a wave begins: on its own, or on a co-op joiner's screen when the host's does
function waveBegins(n, total) {
  run.wave = n; phase = 'wave'; skipVotes.clear();   // (the vote to start it early, net/sync.js)
  spawnT = 1.2; S.windUsed = false; S.feedUsed = 0;   // an open station menu stays open
  bloodAge();   // the blood from a few waves back starts to soak away (effects/blood-map.js)
  const firsts = { 3: 'Sprinters are coming', 5: 'Something big is coming' };
  run.waveTotal = total;
  const brutes = run.wave === 5 || run.wave % 5 === 0;   // the wording fits any hour: a wave can start in daylight
  announce('Wave ' + run.wave, firsts[run.wave] || (run.wave % 5 === 0 ? 'Brutes in the treeline' : total + ' closing in'), { eye: brutes ? 'Horde' : 'Incoming', kind: brutes ? 'red' : '' });
  SFX.wave();
}
// the count under the wave number; in a lull between surges, a word that they've let up for now
function waveSub(left) { setH('wSub', `<b>${left}</b>` + (left === 1 ? ' zombie left' : ' zombies left')); }
function beginBreak(t) { phase = 'break'; breakT = breakMax = t; }
// the thin bar under the wave number: the break running out, then the wave's zombies being whittled down
let breakMax = 20;
function waveBar(frac, mode) {
  const k = mode + ':' + Math.round(clamp(frac, 0, 1) * 300);
  if (cache.wBar === k) return; cache.wBar = k;
  $('wBarFill').style.transform = `scaleX(${clamp(frac, 0, 1).toFixed(3)})`; $('waveBox').dataset.ph = mode;
}
function waveCleared() { netCleared(); phase = 'cleared'; clearT = 2.6; slowTo = 0.25; slowIn = 0.3; slowHold = 0.75; announce('Wave ' + run.wave, 'Cleared · Prepare for the next wave', { eye: 'Survived', kind: 'gold' }); SFX.cleared(); }
// zombie path field, break timer, spawning and wave clear. Returns true when the upgrade screen opens
function updateWaves(dt) {
  if (netClient()) return clientWaves(dt);   // co-op, someone else hosting: their game runs the waves (net/sync.js)
  flowT -= dt; if (flowT <= 0 || flowDirty) { computeFlow(); flowT = 0.25; flowDirty = false; }

  if (phase === 'break' && cheatIs('noWaves')) {   // the cheat menu switched the waves off (ui/cheats.js): the break never runs out
    setH('wSub', 'Waves off · <kbd>F9</kbd> cheat menu');
    waveBar(1, 'break');
  } else if (phase === 'break' && netWaiting()) {
    respawnCheck();   // co-op: the break waits for everyone still choosing their find
    setH('wSub', netWaiting());
    waveBar(breakT / breakMax, 'break');
  } else if (phase === 'break') {
    breakT -= dt; if (netLink() && skipVotes.size >= skipNeed()) breakT = 0;   // (someone who hadn't voted left)
    setH('wSub', breakSub());
    waveBar(breakT / breakMax, 'break');
    if (breakT <= 0) startWave();
  } else if (phase === 'wave') {
    if (surge.lull > 0) { surge.lull -= dt; if (surge.lull <= 0) { nextSurge(); spawnT = 0; } }   // the lull between surges
    else spawnT -= dt;
    if (spawnQ.length && surge.lull <= 0 && spawnT <= 0 && zombies.length < 40 + 12 * (netTeam() - 1) && !cheatIs('noWaves')) {
      netSpawn(spawnQ.shift()); spawnT = Math.max(0.3, 1.35 - run.wave * 0.08) * rr(.6, 1.4) / Math.sqrt(netTeam()) * surgeGap();
      if (++surge.done >= surge.n && spawnQ.length) surge.lull = rr(SURGE.lull[0], SURGE.lull[1]);
    }
    const left = spawnQ.length + zombies.length;
    waveSub(left);
    waveBar(left / Math.max(1, run.waveTotal || left), 'wave');
    if (!spawnQ.length && !zombies.length && !netAllDown()) waveCleared();
  } else if (phase === 'cleared') {
    setH('wSub', 'Wave cleared'); waveBar(1, 'clear'); respawnCheck();   // (co-op: anyone down is back, net/sync.js)
    clearT -= dt / Math.max(timeScale, 0.3);
    if (clearT <= 0) { openUpgrade(); return true; }
  }

  return false;
}
