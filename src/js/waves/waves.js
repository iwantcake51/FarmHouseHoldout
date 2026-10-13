// Wave building, spawning schedule, breaks and wave clear.

// how many of each kind come is set by the wave number alone, whatever the time of day: sprinters from wave 3 (a
// tenth of the wave, rising to three in ten by wave 12), brutes from wave 5 (one in twenty-five, up to one in eight),
// and every fifth wave two more brutes on top. They come in a shuffled order.
const waveMix = n => ({ runner: n >= 3 ? Math.min(0.3, 0.1 + (n - 3) * 0.022) : 0, brute: n >= 5 ? Math.min(0.125, 0.04 + (n - 5) * 0.0085) : 0 });
function buildWave(n) {
  const count = 5 + Math.round(n * 3.4), mix = waveMix(n);
  const runners = Math.round(count * mix.runner), brutes = Math.round(count * mix.brute);
  const list = Array.from({ length: Math.max(0, count - runners - brutes) }, () => 'walker');
  if (n % 5 === 0) list.push('brute', 'brute');
  for (let k = 0; k < runners; k++) list.push('runner');
  for (let k = 0; k < brutes; k++) list.push('brute');
  for (let k = list.length - 1; k > 0; k--) { const j = (rand() * (k + 1)) | 0; [list[k], list[j]] = [list[j], list[k]]; }
  return list;
}
function startWave() {
  run.wave++; phase = 'wave'; spawnQ = buildWave(run.wave); spawnT = 1.2; S.windUsed = false;   // an open station menu stays open
  bloodAge();   // the blood from a few waves back starts to soak away (effects/blood-map.js)
  const firsts = { 3: 'Sprinters are coming', 5: 'Something big is coming' };
  run.waveTotal = spawnQ.length;
  const brutes = run.wave === 5 || run.wave % 5 === 0;
  announce('Wave ' + run.wave, firsts[run.wave] || (run.wave % 5 === 0 ? 'Brutes in the treeline' : spawnQ.length + ' in the dark'), { eye: brutes ? 'Horde night' : 'Incoming', kind: brutes ? 'red' : '' });
  SFX.wave();
}
function beginBreak(t) { phase = 'break'; breakT = breakMax = t; }
// the thin bar under the wave number: the break running out, then the wave's zombies being whittled down
let breakMax = 20;
function waveBar(frac, mode) {
  const k = mode + ':' + Math.round(clamp(frac, 0, 1) * 300);
  if (cache.wBar === k) return; cache.wBar = k;
  $('wBarFill').style.transform = `scaleX(${clamp(frac, 0, 1).toFixed(3)})`; $('waveBox').dataset.ph = mode;
}
function waveCleared() { phase = 'cleared'; clearT = 2.6; slowTo = 0.25; slowIn = 0.4; slowHold = 1.0; announce('Wave ' + run.wave, 'Cleared · Prepare for the next wave', { eye: 'Survived', kind: 'gold' }); SFX.cleared(); }
// zombie path field, break timer, spawning and wave clear. Returns true when the upgrade screen opens
function updateWaves(dt) {
  flowT -= dt; if (flowT <= 0 || flowDirty) { computeFlow(); flowT = 0.25; flowDirty = false; }

  if (phase === 'break') {
    breakT -= dt;
    setH('wSub', `Next wave in ${Math.ceil(Math.max(0, breakT))}s · <kbd>T</kbd> to start now`);
    waveBar(breakT / breakMax, 'break');
    if (breakT <= 0) startWave();
  } else if (phase === 'wave') {
    spawnT -= dt;
    if (spawnQ.length && spawnT <= 0 && zombies.length < 40) {
      spawnZombie(spawnQ.shift()); spawnT = Math.max(0.3, 1.35 - run.wave * 0.08) * rr(.6, 1.4);
    }
    const left = spawnQ.length + zombies.length;
    setH('wSub', `<b>${left}</b>` + (left === 1 ? ' zombie left' : ' zombies left'));
    waveBar(left / Math.max(1, run.waveTotal || left), 'wave');
    if (!spawnQ.length && !zombies.length && !P.dead) waveCleared();
  } else if (phase === 'cleared') {
    setH('wSub', 'Wave cleared'); waveBar(1, 'clear');
    clearT -= dt / Math.max(timeScale, 0.3);
    if (clearT <= 0) { openUpgrade(); return true; }
  }

  return false;
}
