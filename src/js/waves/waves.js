// Wave building, spawning schedule, breaks and wave clear.

import { $ } from '../core/dom.js';
import { keyIcon } from '../ui/input-icons.js';
import { cache, clamp, rand, rr, smooth } from '../core/math.js';
import { mistRoll, mistSet } from '../world/mist.js';
import { netClient, netLink, netSend } from '../net/net.js';
import { computeFlow } from '../zombies/pathfinding.js';
import { run, S } from '../game/run-state.js';
import { cleanUpAfterWave } from '../effects/body-blood.js';
import { bloodAge } from '../effects/blood-map.js';
import { zombies } from '../zombies/zombie-types.js';
import { timeScale } from '../game/hit-feedback.js';
import { flowDirty, setFlowDirty } from '../barricades/planks.js';
import { SFX } from '../audio/sfx.js';
import {
  breakT, clearT, flowT, phase, setBreakT, setClearT, setFlowT, setPhase, setSlowHold, setSlowIn, setSlowTo, setSpawnQ,
  setSpawnT, spawnQ, spawnT
} from '../game/state.js';
import { openUpgrade } from '../upgrades/upgrade-screen.js';
import { sweepDrops } from '../pickups/pickups.js';
import { announce, setH } from '../ui/hud-text.js';
import { SPIT } from '../zombies/spitter.js';
import { cheatIs } from '../ui/cheats.js';
import { strayRoll } from '../stations/supply-drop.js';
import { eliteWave, planElites } from '../zombies/elites.js';
import {
  breakSub, clientWaves, netAllDown, netCleared, netSpawn, netTeam, netWaiting, respawnCheck, skipNeed, skipVotes,
  spawnTurned
} from '../net/sync.js';

// how many of each kind come is set by the wave number alone, whatever the time of day: sprinters from wave 3 (a
// tenth of the wave, rising to three in ten by wave 12), brutes from wave BRUTE_FROM (one in twenty-five, up to one in
// eight; they can dash from the first: zombies/brute-dash.js), and on that first wave and every fifth after it two
// more brutes on top; spitters (zombies/spitter.js) from wave SPIT.from. They come in a shuffled order.
export const BRUTE_FROM = 7;
// and how many brutes a wave may have, so they come in slowly: just the one on the first brute wave (in plain clothes,
// no armour on it: zombies/spawn.js), then more and more allowed a wave (1 + k times the waves since, to the power pow)
const BRUTE_RAMP = { k: 0.5, pow: 1.5 };
const bruteCap = n => 1 + Math.floor(BRUTE_RAMP.k * Math.pow(Math.max(0, n - BRUTE_FROM), BRUTE_RAMP.pow));
// From wave LATE.from it climbs faster, whatever you're carrying, so a good gun doesn't make the late waves easy: more
// of them each wave (LATE.count a wave on top), their health growing faster and faster (LATE.hp, times the square of the
// waves past it: zombies/spawn.js), and the sprinters' and brutes' shares let go past their usual caps, up to
// LATE.runner and LATE.brute
export const LATE = { from: 8, count: 1.3, hp: 0.014, runner: 0.42, runnerPer: 0.015, brute: 0.18, brutePer: 0.007 };
export const lateN = n => Math.max(0, n - LATE.from);
const waveMix = n => ({
  runner: n >= 3 ? Math.min(Math.min(LATE.runner, 0.3 + LATE.runnerPer * lateN(n)), 0.1 + (n - 3) * 0.022) : 0,
  brute: n >= BRUTE_FROM ? Math.min(Math.min(LATE.brute, 0.125 + LATE.brutePer * lateN(n)), 0.04 + (n - BRUTE_FROM) * 0.0085) : 0,
  spitter: n >= SPIT.from ? Math.min(SPIT.shareMax, SPIT.share + SPIT.sharePer * (n - SPIT.from)) : 0
});
// In co-op the horde grows with the team: 35% more for each survivor past the first
const teamK = () => 1 + 0.35 * (netTeam() - 1);
function buildWave(n, tw) {
  const T = TWISTS[tw] || {}, count = Math.round((5 + Math.round(n * 3.4) + Math.round(LATE.count * lateN(n))) * teamK() * (T.count || 1)), mix = waveMix(n);
  if (T.runner) mix.runner = Math.min(T.runnerMax, mix.runner + T.runner);
  const runners = Math.round(count * mix.runner), brutes = Math.round(count * mix.brute), spitters = Math.round(count * mix.spitter);
  const list = Array.from({ length: Math.max(0, count - runners - brutes - spitters) }, () => 'walker');
  for (let k = 0; k < spitters; k++) list.push('spitter');
  const bonus = n === BRUTE_FROM || (n > BRUTE_FROM && n % 5 === 0) ? 2 : 0, nb = n >= BRUTE_FROM ? Math.min(bruteCap(n), Math.max(1, brutes + bonus)) : 0;
  for (let k = 0; k < runners; k++) list.push('runner');
  for (let k = 0; k < nb; k++) list.push('brute');
  for (let k = nb; k < brutes; k++) list.push('walker');   // (the brutes held back for now come as walkers, so the wave's no smaller)
  for (let k = list.length - 1; k > 0; k--) { const j = (rand() * (k + 1)) | 0; [list[k], list[j]] = [list[j], list[k]]; }
  return list;
}
// A wave doesn't come as one even stream: it comes in surges. Each is a share of the wave (SURGE.share, between
// SURGE.min and SURGE.max of them) that starts as a trickle and quickens to a rush (the gap between spawns eased from
// SURGE.build down to SURGE.peak times the usual), then nothing spawns for a few seconds (SURGE.lull): a moment to reload
// or put a board back before the next one builds. The zombies already in keep coming through the lull; it's only the
// spawning that stops. A little left over joins the surge before it rather than making a surge of its own
const SURGE = { share: 0.28, min: 5, max: 16, build: 1.5, peak: 0.45, lull: [3, 4.5] };
// and each wave keeps to one rhythm of its own (SURGE_KIND), so no two run alike: the usual surges; a trickle of small
// ones close together; a few big rushes with long quiet between them; or one long stream that never lets up (a swarm's).
// Each sets what it changes from SURGE
const SURGE_KIND = {
  surges: {},
  trickle: { share: 0.15, min: 3, max: 8, build: 1.2, peak: 0.6, lull: [1.6, 2.6] },
  rushes: { share: 0.42, min: 8, max: 24, build: 1.7, peak: 0.3, lull: [5, 7] },
  stream: { share: 1, min: 999, max: 999, build: 1, peak: 0.55, lull: [0, 0] }
};
export const surge = { n: 0, done: 0, lull: 0, S: SURGE };
function nextSurge() {
  const S_ = surge.S, left = spawnQ.length, n = clamp(Math.round(run.waveTotal * S_.share * rr(0.85, 1.15)), Math.min(S_.min, left), S_.max);
  surge.n = left - n < S_.min ? left : n; surge.done = 0;
}
// the gap before the next spawn, by how far into its surge the wave is
const surgeGap = () => surge.S.build + (surge.S.peak - surge.S.build) * smooth(clamp(surge.done / Math.max(1, surge.n - 1), 0, 1));
// Now and then a wave comes with a twist (TWISTS): from TWIST.from, about one wave in TWIST.chance, never two running,
// never on a fog round or a wave that brings extra brutes. Each has its own name over the banner and its own line under
// it, changes who comes (count: times as many; runner: that much more of the wave sprinting, up to runnerMax), how tough
// they are (hp: times their health, zombies/spawn.js) and how they come (surge: SURGE_KIND), and pays a bounty when
// it's cleared (TWIST.pay + the wave's number, in scrap). A stampede: sprinters, a lot of them, in rushes; a swarm:
// half as many again, weaker, in one long stream; a siege: fewer, much tougher, in a trickle that doesn't stop; a blood
// moon: a red night, thick with elites
const TWIST = { from: 4, chance: 0.3, pay: 6 };
const TWISTS = {
  stampede: { from: 4, eye: 'Stampede', line: n => 'They\'re running · ' + n + ' incoming', runner: 0.25, runnerMax: 0.6, hp: 0.9, surge: 'rushes' },
  swarm: { from: 5, eye: 'Swarm', line: n => 'The whole county · ' + n + ' incoming', count: 1.45, hp: 0.7, surge: 'stream' },
  siege: { from: 6, eye: 'Siege', line: n => 'Fewer, and harder to put down · ' + n + ' incoming', count: 0.7, hp: 1.55, surge: 'trickle' },
  // a blood moon: the night goes red (lighting/day-night.js: BLOOD_MOON) and the elites come four times as often (zombies/elites.js)
  bloodmoon: { from: 6, eye: 'Blood moon', line: n => 'The marked ones are out · ' + n + ' incoming', count: 0.9, hp: 1, surge: 'surges' }
};
function rollTwist(n, fog) {
  if (n < TWIST.from || fog || run.twistLast === n - 1 || n === BRUTE_FROM || (n > BRUTE_FROM && n % 5 === 0) || rand() > TWIST.chance) return null;
  const ok = Object.keys(TWISTS).filter(k => n >= TWISTS[k].from && k !== run.twistKind); if (!ok.length) return null;
  return ok[Math.floor(rand() * ok.length)];
}
// what's said under an ordinary wave's number, one picked each wave
const WAVE_LINES = [n => n + ' closing in', n => n + ' on the way', n => n + ' coming out of the trees', n => 'They\'ve got your scent · ' + n + ' coming', n => n + ' shambling in', n => 'Hold the house · ' + n + ' incoming'];
function startWave() {
  const fog = mistRoll(run.wave + 1), tw = rollTwist(run.wave + 1, fog);   // (now and then a fog round: world/mist.js; or a twist: TWISTS)
  setSpawnQ(buildWave(run.wave + 1, tw)); const el = planElites(spawnQ, run.wave + 1, tw);   // (its elites settled now: zombies/elites.js)
  waveBegins(run.wave + 1, spawnQ.length, fog, tw, undefined, el);
  netSend('wave', { n: run.wave, tot: run.waveTotal, fog: fog ? 1 : 0, tw, np: run.noPerks ? 1 : 0, el });   // (co-op: everyone's wave starts with the host's, net/sync.js)
  spawnTurned();   // (and whoever went down last wave comes back out of the fog as one of them)
  surge.S = Object.assign({}, SURGE, SURGE_KIND[tw ? TWISTS[tw].surge : pickRhythm()]); surge.lull = 0; nextSurge();
}
// an ordinary wave's rhythm: the usual surges most often
const pickRhythm = () => { const r = rand(); return r < 0.5 ? 'surges' : r < 0.75 ? 'trickle' : 'rushes'; };
// the clear played out: the cards (game/upgrade-screen.js), or in no-perk mode straight on to the break, whatever's
// still lying about gliding in to you as it would after the cards. True when the cards open
export function clearedDone() {
  cleanUpAfterWave();   // (the blood and the bandages off you: effects/body-blood.js)
  if (!run.noPerks) { openUpgrade(); return true; }
  beginBreak(BREAK_AFTER); sweepDrops(); return false;
}
// a wave begins: on its own, or on a co-op joiner's screen when the host's does
export function waveBegins(n, total, fog, tw, np, el) {
  if (np !== undefined) run.noPerks = !!np;   // (a co-op joiner: the host's mode)
  run.wave = n; setPhase('wave'); skipVotes.clear(); mistSet(fog);   // (the vote to start it early, net/sync.js)
  const T = TWISTS[tw]; run.twist = T ? tw : null; run.waveHp = T ? T.hp : 1; if (T) { run.twistLast = n; run.twistKind = tw; }
  setSpawnT(1.2); S.windUsed = false; S.feedUsed = 0;   // an open station menu stays open
  bloodAge();   // the blood from a few waves back starts to soak away (effects/blood-map.js)
  strayRoll(n);   // (and now and then a crate dropped mid-wave: stations/supply-drop.js)
  eliteWave(el);   // (how many elites it's bringing: zombies/elites.js)
  const firsts = { 3: 'Sprinters are coming', [BRUTE_FROM]: 'Something big is coming' };
  firsts[SPIT.from] = (firsts[SPIT.from] ? firsts[SPIT.from] + ' · and spitters' : 'Spitters are coming') + ', keep moving';   // (zombies/spitter.js)
  run.waveTotal = total;
  const brutes = run.wave === BRUTE_FROM || (run.wave > BRUTE_FROM && run.wave % 5 === 0);   // the wording fits any hour: a wave can start in daylight
  if (fog) announce('Wave ' + run.wave, (firsts[run.wave] ? firsts[run.wave] + ' · ' : '') + 'Fog · ' + total + ' incoming', { eye: 'Fog', kind: brutes ? 'red' : '' });
  else if (T) announce('Wave ' + run.wave, (firsts[run.wave] ? firsts[run.wave] + ' · ' : '') + T.line(total), { eye: T.eye, kind: 'red' });
  else announce('Wave ' + run.wave, firsts[run.wave] || (brutes ? (run.wave === BRUTE_FROM ? 'A brute in the treeline' : 'Brutes in the treeline') : WAVE_LINES[Math.floor(rand() * WAVE_LINES.length)](total)), { eye: brutes ? 'Horde' : 'Incoming', kind: brutes ? 'red' : '' });
  SFX.wave(n, !!(T || brutes || fog));
}
// the count under the wave number; in a lull between surges, a word that they've let up for now
export function waveSub(left) { setH('wSub', `<b>${left}</b>` + (left === 1 ? ' zombie left' : ' zombies left')); }
export function beginBreak(t) { setPhase('break'); setBreakT(breakMax = t); }
// the thin bar under the wave number: the break running out, then the wave's zombies being whittled down
export let breakMax = 20;
export function waveBar(frac, mode) {
  const k = mode + ':' + Math.round(clamp(frac, 0, 1) * 300);
  if (cache.wBar === k) return; cache.wBar = k;
  $('wBarFill').style.transform = `scaleX(${clamp(frac, 0, 1).toFixed(3)})`; $('waveBox').dataset.ph = mode;
}
// no-perk mode (ui/settings.js: a run's mode, run.noPerks): no slow motion as the wave clears, no cards and no aid after
// it, just the break, from NO_PERKS.wait seconds after the last zombie falls
const NO_PERKS = { wait: 1 };
export const BREAK_AFTER = 25;   // (the break after a wave, the cards or not: upgrades/upgrade-screen.js)
export function waveCleared() {
  netCleared(); setPhase('cleared');
  if (run.noPerks) setClearT(NO_PERKS.wait); else { setClearT(2.6); setSlowTo(0.25); setSlowIn(0.3); setSlowHold(0.75); }
  // a twist's bounty, into everyone's scrap
  const T = TWISTS[run.twist], pay = T ? TWIST.pay + run.wave : 0; if (pay) S.scrap += pay;
  announce('Wave ' + run.wave, T ? T.eye + ' survived · +' + pay + ' scrap' : 'Cleared · Prepare for the next wave', { eye: 'Survived', kind: 'gold' }); SFX.cleared(run.wave, !!T);
  run.twist = null; run.waveHp = 1;
}
// zombie path field, break timer, spawning and wave clear. Returns true when the upgrade screen opens
export function updateWaves(dt) {
  if (netClient()) return clientWaves(dt);   // co-op, someone else hosting: their game runs the waves (net/sync.js)
  setFlowT(flowT - dt); if (flowT <= 0 || flowDirty) { computeFlow(flowDirty); setFlowT(0.25); setFlowDirty(false); }

  if (phase === 'break' && cheatIs('noWaves')) {   // the cheat menu switched the waves off (ui/cheats.js): the break never runs out
    setH('wSub', `Waves off · <kbd class="ki">${keyIcon('f9')}</kbd> cheat menu`);
    waveBar(1, 'break');
  } else if (phase === 'break' && netWaiting()) {
    respawnCheck();   // co-op: the break waits for everyone still choosing their find
    setH('wSub', netWaiting());
    waveBar(breakT / breakMax, 'break');
  } else if (phase === 'break') {
    setBreakT(breakT - dt); if (netLink() && skipVotes.size >= skipNeed()) setBreakT(0);   // (someone who hadn't voted left)
    setH('wSub', breakSub());
    waveBar(breakT / breakMax, 'break');
    if (breakT <= 0) startWave();
  } else if (phase === 'wave') {
    if (surge.lull > 0) { surge.lull -= dt; if (surge.lull <= 0) { nextSurge(); setSpawnT(0); } }   // the lull between surges
    else setSpawnT(spawnT - dt);
    if (spawnQ.length && surge.lull <= 0 && spawnT <= 0 && zombies.length < 40 + 12 * (netTeam() - 1) && !cheatIs('noWaves')) {
      netSpawn(spawnQ.shift()); setSpawnT(Math.max(0.3, 1.35 - run.wave * 0.08) * rr(.6, 1.4) / Math.sqrt(netTeam()) * surgeGap());
      if (++surge.done >= surge.n && spawnQ.length) { surge.lull = rr(surge.S.lull[0], surge.S.lull[1]); if (surge.lull <= 0) nextSurge(); }
    }
    const left = spawnQ.length + zombies.length;
    waveSub(left);
    waveBar(left / Math.max(1, run.waveTotal || left), 'wave');
    if (!spawnQ.length && !zombies.length && !netAllDown()) waveCleared();
  } else if (phase === 'cleared') {
    setH('wSub', 'Wave cleared'); waveBar(1, 'clear'); respawnCheck();   // (co-op: anyone down is back, net/sync.js)
    setClearT(clearT - (dt / Math.max(timeScale, 0.3)));
    if (clearT <= 0) return clearedDone();
  }

  return false;
}

// setters for the variables above that other files change (an imported variable can only be read)
export function setBreakMax(v) { return (breakMax = v); }
