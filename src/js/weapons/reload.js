// Switching weapons and reloading.

import { clamp, rand, rr } from '../core/math.js';
import { P } from '../player/player.js';
import { AMMO_NAME } from './ammo.js';
import { curId, magSize, magSwapIn, REV_OPEN_T, REV_QUICK, ROW_GAP, S, W, W8 } from '../game/run-state.js';
import { CHARGE, CRANE } from './gun-materials.js';
import { chamberCycle, chamberT, dropMag, EJECT, ejectCasing, needsRack, openAction, racked } from './casings.js';
import { openSt } from '../stations/station-ui.js';
import { SFX } from '../audio/sfx.js';
import { setShake, shake, state } from '../game/state.js';
import { mouseDown } from '../input/keyboard-mouse.js';
import { exitScope } from '../player/aiming.js';
import { akStartReload, akTickReload } from './akimbo.js';
import { runStat } from '../ui/run-stats.js';
import { toast } from '../ui/hud-text.js';
import { rgReload, RUN_RELOAD, runRelK, sprintKey } from '../player/sprint.js';
import { SHAKY } from '../player/shaky-hands.js';
import { reloadJolt } from '../game/camera.js';
import { reloadTick } from '../ui/crosshair.js';
import { ANIM } from '../player/animation.js';
import { inspectCut } from '../player/inspect.js';
import { relKnock } from '../player/hold-kick.js';
import { dropLoader, HSH_FEED } from '../player/hold-loaders.js';
import { drawMul, startSwap, swapFire, swapSt } from '../player/swap.js';

// force: draw it again even if it's the slot in your hands (a new weapon just went into it)
export function equip(s, force) {
  if (!W8.slot[s] || (W8.cur === s && !force)) return;
  exitScope(); ANIM.sw = 0.35; W8.swing = 0;   // (an action held open stays so, put away and drawn again: W8.held, weapons/casings.js)
  startSwap(W8.cur === s ? null : W8.cur, s);   // put the old one away and draw this one (player/swap.js)
  if ((W(W8.slot[s]) || {}).melee) ANIM.mDrawT = 0;   // a flourish once it's drawn (melee/melee-anim.js: it waits for the draw)
  if (W8.cur === s) { W8.reloading = null; W8.reloadT = 0; } else cutReload();   // (a reload put away part done is picked up again: cutReload)
  W8.cur = s; W8.burstLeft = 0; W8.akBurst.L = W8.akBurst.R = 0; W8.cd = Math.max(W8.cd, swapFire(s) * drawMul(W8.slot[s]) / S.swapMul); SFX.equip();
}
// reloading slows you down: a little with a sidearm, more with a long gun, and more again the bigger the magazine
// (a 13-round pistol about 15%, a 30-round rifle about a quarter, the 100-round LMG belt nearly half); reloading one of
// a pair, a gun still in the other hand, slows you AK_WALK more
export function reloadSlow() {
  if (!W8.reloading) return 1;
  const id = curId(), D = W(id); if (!D || D.melee) return 1;
  const base = D.slot === 'side' ? 0.12 : D.slot === 'long' ? 0.2 : 0.17;
  return 1 - Math.min(0.48, base + Math.min(0.28, magSize(id) / 360) + (D.akimbo ? AK_WALK : 0));
}
const AK_WALK = 0.14;
// how far through a missed magwell (relPlan) the mag's top hits the lip (player/hold-mags.js poses it to the same mark)
export const MISS_HIT = 0.4;
// each reload's own feel (player/hold.js): how far the gun's turned for it, a bulge in the hand's way there, a wobble
// (the next shell of a run of them keeps the seed of the one before: the gun's restless drift through the reload runs
// on from shell to shell rather than jumping to a new spot, player/hold.js)
export const relJitter = (next = false) => { W8.relJit = { k: rr(0.82, 1.18), dx: rr(-0.03, 0.03), dy: rr(-0.025, 0.025), seed: next && W8.relJit ? W8.relJit.seed : rr(0, 20) }; };
// how much Quick hands shortens a reload: the revolver's no more than REV_QUICK (game/run-state.js), so it always takes its time
export const relMul = id => id === 'revolver' ? Math.max(REV_QUICK, S.reloadMul) : S.reloadMul;
// the time before the first round goes in: the revolver's cylinder swung out and its empties dumped first
export const firstShell = id => id === 'revolver' ? REV_OPEN_T : 0.12;
export const reserveOf = id => { const D = W(id); return D.ammo ? W8.reserve[D.ammo] : 0; };
// hurt hands (SHAKY.k, player/shaky-hands.js: low health, eased): a reload goes up to HURT_REL.slow slower, and now
// and then the hands fumble it (up to HURT_REL.fumble of the time a reload, of the time a shell for one fed a round at
// a time): they stall partway, the gun knocked and something clacking, for a moment before they carry on
// (never with the revolver: its cylinder's fed and shut with no hesitation). A fumble doesn't freeze the hands: they
// slow to a near stop and pick up again (fumbleW), moving FUMBLE.adv of the stall's own time through the reload on the
// way, at full speed going into it and coming out of it, so nothing jolts to a halt or jumps away
const HURT_REL = { slow: 0.35, fumble: 0.4, shellFumble: 0.18, stall: [0.28, 0.55] }, FUMBLE = { adv: 0.35, knock: 0.6 };
const hurtRel = () => 1 + HURT_REL.slow * SHAKY.k;
const rollFumble = (chance, B, id) => id !== 'revolver' && SHAKY.k > 0.02 && rand() < chance * SHAKY.k ? [{ t: rr(0.25, 0.7) * B, d: rr(HURT_REL.stall[0], HURT_REL.stall[1]) * (0.6 + 0.4 * SHAKY.k), kind: 'fumble' }] : [];
// how far a fumble's base has gone at k of the way through it (in its own time): a cubic that leaves at full speed,
// slows to a near stop in the middle and is back at full speed at the end, FUMBLE.adv along
const fumbleW = k => 2 * k * k * k - 3 * k * k + k + FUMBLE.adv * (3 * k * k - 2 * k * k * k);
const segAdv = g => g.kind === 'fumble' ? FUMBLE.adv * g.d : 0;
// missing the magwell: the fresh mag's top comes up off the well's line and catches its lip, bounces back off it and is
// lined up again before it goes in (player/hold-mags.js: magMiss). Now and then with steady hands (calm: the chance of
// one), and with hurt ones most of the time, once, twice or as many as three times running, each slower (hurt: the
// chance at the worst, the most in a row; d: how long one takes, seconds, and how much longer hurt). Each is a beat
// of its own written into the reload's timeline (relPlan), so the reload takes that much longer, all of it shown
const MAG_MISS = { calm: 0.07, hurt: 0.85, most: 3, d: [0.34, 0.46], slow: 0.6, at: 0.8, B: 2.2, lo: 0.7 };   // (B, lo: a quicker reload's misses quicker too, as it is to B seconds, down to lo of them)
function rollMisses(B) {
  const k = SHAKY.k, n = k > 0.05 && rand() < MAG_MISS.hurt * k ? 1 + Math.floor(rand() * (1 + (MAG_MISS.most - 1) * k)) : rand() < MAG_MISS.calm ? 1 : 0;
  // (at the point of the base where the mag's just short of the well: MAG_MISS.at of its way up from the pouch)
  const at = (MAG_TAKE_U + MAG_MISS.at * (MAG_SEAT - MAG_TAKE_U)) * magK() * B, out = [];
  for (let i = 0; i < Math.min(n, MAG_MISS.most); i++) out.push({ t: at, d: rr(MAG_MISS.d[0], MAG_MISS.d[1]) * (1 + MAG_MISS.slow * k) * clamp(B / MAG_MISS.B, MAG_MISS.lo, 1.1), kind: 'miss', side: i && out[i - 1] ? -out[i - 1].side : rand() < 0.5 ? -1 : 1, fwd: rr(-1, 1), amt: rr(0.4, 0.95), pre: rr(0.35, 1), bounce: rr(0.25, 1), hit: false });   // (no two alike: each its own size, drop and bounce (player/hold-mags.js: magMiss), and one after another from the other side)
  return out;
}
const MAG_TAKE_U = 0.42;   // (player/hold-mags.js: MAG_TAKE, where the mag's taken from the pouch)
// A reload's own timeline: its base length (B, seconds), which every mark of the animation is a fraction of (the old
// mag out, the new one seated, the slide dropped, a shell in), and the beats slipped into it (segs: a fumble, a missed
// magwell), each at a point of the base (t, seconds) for d seconds of its own, in which the base stands still. The reload
// takes the lot (reloadMax), and the crosshair's ring fills over all of it, so it follows the reload as it really goes
function relPlan(B, segs) { segs.sort((a, b) => a.t - b.t); W8.relTL = { B, segs }; W8.reloadMax = W8.reloadT = B + segs.reduce((a, g) => a + g.d - segAdv(g), 0); relStep(); }
// where the reload's base is now (W8.relU, 0 to 1: what player/hold.js and the marks below go by), and any beat it's in
// (W8.relSeg, W8.relSegK how far through it)
function relStep() {
  const TL = W8.relTL, e = W8.reloadMax - W8.reloadT;
  W8.relSeg = null; W8.relSegK = 0;
  if (!TL || !TL.B) { W8.relU = W8.reloadMax > 0 ? 1 - W8.reloadT / W8.reloadMax : 0; return; }
  let acc = 0, base = -1;
  for (const g of TL.segs) {
    const s0 = g.t + acc;
    if (e < s0) { base = e - acc; break; }
    if (e < s0 + g.d) { W8.relSeg = g; W8.relSegK = (e - s0) / g.d; base = g.t + (g.kind === 'fumble' ? g.d * fumbleW(W8.relSegK) : 0); break; }
    acc += g.d - segAdv(g);
  }
  if (base < 0) base = e - acc;
  W8.relU = clamp(base / TL.B, 0, 1);
}
// the time the beats of this go not yet reached will add (a fumble, a missed magwell): the ring isn't told of one until
// it happens, so it fills as the reload's planned to go, and only stretches out once the hands actually fumble
export function relUnseen() {
  const TL = W8.relTL; if (!TL || !TL.segs.length || !W8.reloading) return 0;
  const e = W8.reloadMax - W8.reloadT; let acc = 0, n = 0;
  for (const g of TL.segs) { const s0 = g.t + acc, add = g.d - segAdv(g); if (e < s0) n += add; acc += add; }
  return n;
}
// how many shells this go loads, fixed as it starts (so counting some in partway through doesn't change it), and
// whether they go in one at a time off a row in the palm (the pump with Quick hands) rather than together
function goSize(id, D) { if (!W8.goN) W8.goN = Math.max(1, Math.min(D.loadN || 1, magSize(id) - (W8.mag[id] || 0), reserveOf(id))); return W8.goN; }
export const rowLoad = (id, D) => (D.loadN || 1) > 1 && EJECT[id] === 'pump';
// how long one go takes: a row of n shells is stretched, if it has to be, so each is thumbed in at least ROW_GAP after
// the last ("in, in, in", not all in one go), the row's pushes taking HSH_FEED of the go (player/hold.js)
export const shellGo = (id, D, n = D.loadN || 1) => Math.max(D.perShell * relMul(id), n > 1 && rowLoad(id, D) ? n * ROW_GAP / (HSH_FEED[1] - HSH_FEED[0]) : 0);
// n shells in: counted, the reload ring pulsed, each heard (the double barrel's pair a beat apart), the gun jolted
function shellIn(id, D, n) {
  W8.mag[id] = (W8.mag[id] || 0) + n; W8.reserve[D.ammo] -= n; W8.shellsIn += n; W8.goIn += n; reloadTick(); SFX.shell(); for (let k = 1; k < n; k++) setTimeout(() => SFX.shell(), 55 * k);
  reloadJolt(0.09 + 0.03 * (n - 1)); setShake(Math.max(shake, 0.06));
}
export function startReload() {
  const id = curId(), D = W(id); if (!D || D.melee || W8.reloading || P.vault || P.bandT > 0 || swapSt) return;   // hands are busy with the bandage, or still drawing
  // a reload cut short past its mag coming out or going in picks up from there (staged reloads, below)
  const sv = W8.relSave[id]; delete W8.relSave[id];
  if (sv && (sv.st === 'out' || sv.st === 'in')) { resumeStage(id, D, sv); return; }
  const missing = magSize(id) - (W8.mag[id] || 0); if (missing <= 0) return;
  if (reserveOf(id) <= 0) { toast('No ' + AMMO_NAME[D.ammo] + ' left', { kind: 'bad', icon: 'ammo', sub: 'Craft some at the workbench' }); return; }
  runStat('reloads'); inspectCut();   // (looking it over: straight back to reload, player/inspect.js)
  // the revolver dumps every empty at once, a beat after the cylinder swings out; with a speed loader the live rounds go
  // too (the whole cylinder's tipped out for the loader's full six), back into your pouch
  if (id === 'revolver' && D.speedload && (W8.mag[id] | 0) > 0) { const live = W8.mag[id] | 0; W8.reserve[D.ammo] += live; W8.mag[id] = 0; W8.spent[id] = (W8.spent[id] || 0) + live; W8.hudSpent[id] = (W8.hudSpent[id] || 0) + live; }
  if (EJECT[id] === 'breach' && W8.spent[id] > 0) { const n = W8.spent[id]; W8.spent[id] = 0; if (id === 'revolver') setTimeout(() => { if (W8.reloading && curId() === id) { ejectCasing(D.ammo, n, 'dump'); reloadJolt(0.12); } else W8.spent[id] = (W8.spent[id] || 0) + n; }, 130); else ejectCasing(D.ammo, n, 'breach'); }
  W8.relStyle = D && D.akKit ? 1 : Math.floor(Math.random() * 3); relJitter();   // which of its ways this reload is done (an AK mag only one: hooked in at the front and rocked back), and its own feel (player/hold.js)
  W8.relStop = false; W8.shutQ = false; W8.shutFire = 0; W8.magOut = W8.filled = false; W8.relTL = null; W8.grabT = 0;
  if (D.akimbo && !D.perShell && !D.speedload) { akStartReload(id, D); return; }   // each gun its own (weapons/akimbo.js)
  if (D.perShell) {
    // a reload cuts a rack short (the gun's left open and racked once you stop reloading, weapons/casings.js). The
    // rifle's bolt is pulled back by hand to feed it, and so is an empty pump's forend, held back while it's loaded and
    // pushed home at the end (openAction, chamberCycle); the first round waits for it (W8.relWait)
    if (W8.cyc && W8.cyc.id === id) { if (!W8.cyc.done) ejectCasing(D.ammo, 1, EJECT[id]); W8.cyc = null; }
    W8.relWait = racked(id) && !W8.held[id] && (EJECT[id] === 'bolt' || (W8.mag[id] || 0) <= 0) ? openAction(id) : 0;
    W8.reloading = 'shell'; W8.shellsIn = 0; W8.shellsNeed = Math.min(missing, reserveOf(id)); W8.goN = 0; W8.goIn = 0;
    { const B = (shellGo(id, D, goSize(id, D)) + firstShell(id)) * hurtRel(); relPlan(B, rollFumble(HURT_REL.shellFumble, B, id)); }
    W8.relRing = { id, el: 0, tot: W8.relWait + W8.reloadT + shellGo(id, D) * hurtRel() * (Math.ceil(W8.shellsNeed / (D.loadN || 1)) - 1), tail: relTail(id, D), p0: -1, t0: -1 };
  } else if (D.speedload) { W8.reloading = 'mag'; { const B = D.reload * relMul(id) * hurtRel(); relPlan(B, rollFumble(HURT_REL.fumble, B, id)); } W8.slLive = W8.mag[id] | 0; W8.seated = W8.pulled = W8.slammed = false; SFX.cylOpen(); reloadJolt(0.12); }   // the cylinder swings out
  else {
    // a pistol with rounds still in it swaps the mag and that's all (a touch quicker); an empty one ends by dropping the
    // slide off its stop, one of two ways. Any gun run dry takes EMPTY_MUL longer
    const empty = (W8.mag[id] || 0) <= 0, tac = slideReload(id) && !empty;
    W8.reloading = 'mag'; W8.relEmpty = slideReload(id) && !tac; W8.relDry = empty; W8.relVar = Math.random() < 0.5 ? 0 : 1;
    { const B = D.reload * S.reloadMul * (tac ? TAC_MUL : 1) * (empty && !D.detach ? EMPTY_MUL : 1) * hurtRel(); relPlan(B, [...rollFumble(HURT_REL.fumble, B, id), ...rollMisses(B)]); }   // (the rifle's box: its bolt's worked after only if it was run dry)
    W8.seated = W8.pulled = W8.slammed = false;
    SFX.magOut(); reloadJolt(0.12);   // (the old mag falls a beat later, at magOutP: tickReload)
  }
}
// the revolver's speed loader, through its reload: the rounds go into the cylinder, the loader is twisted and let go
// to fall, and the cylinder is snapped shut (player/hold.js moves the hand and the loader to the same marks)
export const SL_IN = 0.56, SL_DROP = 0.7, SL_SHUT = 0.84;
// how far through a mag reload the mag is pushed home, and (for a rifle with a charging handle) when the handle is
// pulled and let go; player/hold.js poses the hands to the same marks
export const MAG_SEAT = 0.84, CH_MAG = 0.76, CH_PULL = 0.845, CH_SLAM = 0.875;
// the charging handle's beats (player/hold.js): the hand leaves the grip for it as the other hand's still coming away
// from slapping the mag home (the two overlapping, not one after the other), and is on its way up to it over CH_REACH
// (unhurried: about a seventh of the reload), settles onto it and starts drawing it at CH_DRAW (back by CH_PULL, the
// spring taking up as it goes), lets go at CH_SLAM, and is back on the grip over CH_BACK; the handle bounces CH_BOUNCE
// of its travel back off its stop
export const CH_REACH = [0.645, 0.775], CH_DRAW = 0.765, CH_BACK = [0.89, 1], CH_BOUNCE = 0.06;
// a magazine gun run dry takes EMPTY_MUL longer to reload than one with rounds left (it's fumbled out of an empty gun,
// and the gun's charged or its slide dropped at the end). Pistols whose slide locks back on the last round
// (player/hold.js holds it there, in the hand and in the holster): a
// reload with rounds still in it is TAC_MUL of the time and leaves the slide alone; an empty one changes the mag in the
// first PS_MAG of it, then drops the slide: a slingshot (variant 0: grab the back of it, tug it off the stop and let it
// fly) or a thumb on the slide stop (variant 1), let go at PS_REL by variant. The slingshot is a steady tug, eased in
// and out over about a tenth of a second (more for the hand cannon), not a snatch
export const SLIDE_PISTOLS = { pistol: 1, deagle: 1 }, TAC_MUL = 0.85, EMPTY_MUL = 1.25, PS_MAG = 0.68, PS_TUG = 0.815, PS_REL = [0.917, 0.872];
const slideReload = id => !!SLIDE_PISTOLS[id] && !(W(id) || {}).akimbo;
// (a gun's only charged when it was run dry: with a round still in the chamber the mag's swapped and that's all, W8.relDry)
const hasCharge = () => !!CHARGE[W8.cur] && W8.relDry !== false;
// Staged reloads. A reload cut short by anything but the trigger (switching weapons, a shove, a sprint, a vault, a
// bandage) keeps the last of its marks it got to, for that gun (W8.relSave[id], cutReload): begun ('start'), the old
// mag out ('out': what was left in it goes back in your pouch and the gun stands empty, its well bare), the new one in
// ('in': it's loaded, and only charging it, dropping the slide or shutting the cylinder is left), or, loading a shell
// or round at a time, part loaded ('shell': what's in stays in). It picks up from that mark by itself as soon as the gun
// is in your hands and they're free (resumeReload, each frame from weapons/combat-update.js). Till it has, a gun with
// its mag out, or in but not charged, won't fire; a shot fired first forgets a 'start' or a 'shell'
export const MAG_DROP_T = 0.14;   // seconds into a mag change the old mag comes free and falls (no more than 0.3 of the change)
// an AK mag isn't dropped straight out: it's rocked forward off its front lug first (the battle rifle's AK kit,
// player/hold.js), and comes free AKM_DROP_T in
export const AKM_DROP_T = 0.3, magDropT = () => { const D = W(curId()); return D && D.akKit ? AKM_DROP_T : MAG_DROP_T; };
// where in a mag reload (0 to 1) the old mag falls and the new one's seated (player/hold.js poses the hands the same)
const magK = () => hasCharge() ? CH_MAG : W8.relEmpty ? PS_MAG : 1;
const magOutP = () => Math.min(0.3, magDropT() / Math.max(0.3, W8.reloadMax)) * magK();
const magSeatP = () => MAG_SEAT * magK();
export const relHeld = id => { const sv = W8.relSave[id]; return !!sv && (sv.st === 'out' || sv.st === 'in'); };
export function cutReload() {
  const id = curId(), D = W(id), rel = W8.reloading;
  if (rel && D && !D.melee && D.ammo) {
    let sv = null;
    if (rel === 'shell') sv = { st: 'shell' };
    else if (D.akimbo && !D.speedload) sv = { st: 'start' };   // (a pair's own reload: weapons/akimbo.js)
    else if (W8.seated) { if ((hasCharge() || W8.relEmpty || D.speedload) && !W8.slammed) sv = { st: 'in', p: D.speedload ? (W8.pulled ? SL_DROP : SL_IN) : magSeatP(), pulled: !!(D.speedload && W8.pulled) }; }
    else if (W8.magOut) { sv = { st: 'out', p: magOutP() }; W8.reserve[D.ammo] += W8.mag[id] || 0; W8.mag[id] = 0; }
    else sv = { st: 'start' };
    if (sv) W8.relSave[id] = Object.assign(sv, { max: W8.relTL ? W8.relTL.B : W8.reloadMax, relEmpty: W8.relEmpty, relDry: W8.relDry, relVar: W8.relVar, relStyle: W8.relStyle, jit: W8.relJit });
  }
  W8.reloading = null; W8.reloadT = 0; W8.relTL = null;
}
function resumeStage(id, D, sv) {
  if (sv.st === 'out' && reserveOf(id) <= 0) { toast('No ' + AMMO_NAME[D.ammo] + ' left', { kind: 'bad', icon: 'ammo', sub: 'Craft some at the workbench' }); return; }
  W8.reloading = 'mag'; W8.relTL = null; W8.reloadMax = sv.max; W8.reloadT = sv.max * (1 - sv.p);   // (picked up with nothing slipped in: the base is the whole of it)
  W8.relEmpty = sv.relEmpty; W8.relDry = sv.relDry; W8.relVar = sv.relVar; W8.relStyle = sv.relStyle; if (sv.jit) W8.relJit = sv.jit;
  W8.magOut = true; W8.seated = W8.filled = sv.st === 'in'; W8.pulled = sv.pulled; W8.slammed = false; W8.relStop = false;
  SFX.click(); reloadJolt(0.1);
}
// each frame: back to a reload left part done, once the gun's in your hands and they're free (and, for one only begun
// or part loaded, you're not holding the trigger or the sprint key)
export function resumeReload() {
  const id = curId(), sv = id && W8.relSave[id]; if (!sv || W8.reloading || state !== 'play' || P.dead) return;
  if (P.vault || P.bandT > 0 || swapSt || W8.swing > 0 || P.shove || openSt || (P.sprint && !rgReload())) return;
  if (sprintKey() && P.moving && !P.sprintLock && !rgReload()) return;
  if ((sv.st === 'start' || sv.st === 'shell') && (mouseDown || P.fireQ)) return;
  startReload();
}
// what's to go in goes in as the mag's seated
function fillMag(id, D) {
  W8.filled = true; const take = Math.min(magSize(id) - (W8.mag[id] || 0), W8.reserve[D.ammo]);
  if (take > 0) { W8.mag[id] = (W8.mag[id] || 0) + take; W8.reserve[D.ammo] -= take; }
}
export function tickReload(dt) {
  if (!W8.reloading) return;
  const id = curId(), D = W(id);
  if (W8.reloading === 'mag' && D.akimbo && !D.speedload) { akTickReload(dt, id, D); return; }   // one gun at a time (weapons/akimbo.js)
  if (W8.reloading === 'shell' && W8.relWait > 0) { W8.relWait -= dt; if (W8.relRing) W8.relRing.el += dt; return; }   // the action being pulled back first
  const rdt = dt * (1 - (1 - RUN_RELOAD.rel) * runRelK());
  W8.reloadT -= rdt;   // (a little slower at a sprint: player/sprint.js)
  if (W8.reloading === 'shell' && W8.relRing) W8.relRing.el += rdt;
  relStep();
  // the beats slipped in (relPlan): a fumble (hurt hands, HURT_REL), the hands stalling, the gun knocked and something
  // clacking as it starts; a missed magwell, the mag's top clacking off the well's lip as it catches it (MISS_HIT of the
  // way through it), the gun knocked by it
  { const g = W8.relSeg;
    if (g && g.kind === 'fumble' && !g.hit && W8.relSegK >= 0.3) { g.hit = true; const K = FUMBLE.knock; relKnock(rr(1.4, 2.4) * K, rr(-2.6, 2.6) * K, -0.25 * K, rr(-0.5, 0.2) * K); reloadJolt(0.06); SFX.click(); }   // (as it slows: a softer knock, FUMBLE.knock)
    if (g && g.kind === 'miss' && !g.hit && W8.relSegK >= MISS_HIT) { g.hit = true; const a = g.amt ?? 1; relKnock(rr(0.5, 1) * a, rr(-1.2, 1.2) * g.side * a, -0.15 * a, rr(-0.3, 0.3)); reloadJolt(0.07 * a); SFX.magTap(); } }
  if (W8.reloading === 'mag' && D.speedload) {
    const p = W8.relU;
    if (!W8.seated && p >= SL_IN) { W8.seated = true; fillMag(id, D); SFX.shell(); setTimeout(() => SFX.shell(), 45); reloadJolt(0.2); }
    if (!W8.pulled && p >= SL_DROP) { W8.pulled = true; dropLoader(); }
    if (!W8.slammed && p >= SL_SHUT) { W8.slammed = true; reloadJolt(0.16); }   // flicked shut (player/hold.js: its click as it latches)
  } else if (W8.reloading === 'mag') {
    const p = W8.relU, ch = hasCharge(), ps = W8.relEmpty, seat = magSeatP();
    if (!W8.magOut && p >= magOutP()) { W8.magOut = true; dropMag(id); magSwapIn(id); reloadJolt(0.08); }   // the old mag falls; a newer one bought since comes out of the pouch
    if (!W8.seated && p >= seat) { W8.seated = true; fillMag(id, D); SFX.magIn(); reloadJolt(0.26); setShake(Math.max(shake, D.ammo === 'rifle' || (D.mag || 0) > 30 ? 0.16 : 0.12)); }   // slapped home
    if (ch && !W8.pulled && p >= CH_PULL) { W8.pulled = true; SFX.chargePull(); reloadJolt(0.1); }
    if (ch && !W8.slammed && p >= CH_SLAM) { W8.slammed = true; SFX.chargeSlam(); reloadJolt(0.2); setShake(Math.max(shake, 0.1)); }
    if (ps && !W8.pulled && W8.relVar === 0 && p >= PS_TUG) { W8.pulled = true; SFX.chargePull(); reloadJolt(0.06); }   // tugged off the stop
    if (ps && !W8.slammed && p >= PS_REL[W8.relVar]) { W8.slammed = true; SFX.slideDrop(); reloadJolt(0.22); setShake(Math.max(shake, 0.09)); }   // and it slams home
  }
  // the pump's row of shells off the palm (Quick hands): each one counted in as its push ends, one after another (as
  // player/hold.js thumbs them in, HSH_FEED), whatever's left as the go ends
  if (W8.reloading === 'shell' && rowLoad(id, D)) {
    const n = goSize(id, D), due = Math.min(n, Math.floor(n * clamp((W8.relU - HSH_FEED[0]) / (HSH_FEED[1] - HSH_FEED[0]), 0, 1)));
    while (W8.goIn < due) shellIn(id, D, 1);
  }
  if (W8.reloadT > 0) return;
  if (W8.reloading === 'shell') {
    // one shell a go, or two or three with a speed loader (the double barrel's pair both at once; the pump's row one at
    // a time, the rest of it here)
    const n = goSize(id, D) - W8.goIn;
    if (n > 0) shellIn(id, D, n);
    W8.goN = 0; W8.goIn = 0;
    if (W8.mag[id] < magSize(id) && reserveOf(id) > 0 && !W8.relStop) {   // the next shell, its own way
      const B = shellGo(id, D, goSize(id, D)) * hurtRel(), f = rollFumble(HURT_REL.shellFumble, B, id); relPlan(B, f); W8.relStyle = Math.floor(Math.random() * 3); relJitter(true);
      if (W8.relRing && f.length) W8.relRing.tot += f[0].d - segAdv(f[0]);   // (the ring takes the fumble's time too)
    }
    // done: a pump or bolt gun that's open has its action pushed home straight away (weapons/casings.js), one that's
    // chambered is ready as it is; anything else snaps shut
    // (a pump's support hand comes from the loading port to the forend and takes hold of it first: PUMP_GRAB)
    else if (racked(id)) { W8.reloading = null; if (!needsRack(id)) reloadJolt(0.1); else if (EJECT[id] === 'pump') { W8.grabT = W8.grabMax = PUMP_GRAB * S.reloadMul; W8.grabId = id; W8.grabHeld = !!W8.held[id] && W8.mag[id] > 0; } else if (W8.held[id] && W8.mag[id] > 0) { chamberCycle(id); delete W8.held[id]; } }
    else if (D.breakOpen) W8.reloading = null;   // the barrels are closed next, before it'll fire (tickShut)
    else { W8.reloading = null; if (!(CRANE[W8.cur] || []).length) { SFX.rack(); reloadJolt(0.22); setShake(Math.max(shake, 0.12)); } W8.cd = Math.max(W8.cd, 0.25); }   // (a revolver's cylinder is pushed shut by hand next: tickShut)
  } else {
    if (!W8.filled) fillMag(id, D);
    W8.reloading = null; magSwapIn(id);
    if (D.detach && W8.relDry !== false) { W8.open[id] = true; delete W8.held[id]; }   // the rifle's box in: run dry, the bolt's worked to chamber a round (tickCycle, weapons/casings.js); with one still chambered it's left shut
    if (!W8.seated && !D.speedload) { SFX.magIn(); reloadJolt(0.26); setShake(Math.max(shake, 0.12)); }   // (seated already, unless it was cut short)
  }
}
// the crosshair's reload ring for a shell-at-a-time reload (ui/crosshair.js), by time rather than by shells, so it
// fills evenly however many go in a go (both at once with Sleight of Hand, two or three in the pump with Quick hands)
// and doesn't end till the gun will fire: W8.relRing, set as it starts, holds the time the shells take (tot: the first
// go, with the gun opened, then one go per loadN of them), the time spent so far (el), and what comes after the last
// shell (tail: the double barrel closed, or a pump or bolt gun racked, as long as that takes with its fire rate). The
// shells fill the ring up to where the tail starts; once they're in (or it's stopped part way), what's left of it (from
// p0) runs out over the tail as it actually goes. 0 to 1, or -1 when there's no ring
const relTail = (id, D) => D.breakOpen ? BRK_SHUT * S.reloadMul * (D.shutMul || 1) : cylShut(D) ? CYL_SHUT * S.reloadMul : racked(id) && needsRack(id) ? chamberT(id) + (EJECT[id] === 'pump' ? PUMP_GRAB * S.reloadMul : 0) : 0;
export function relRingP() {
  const R = W8.relRing, id = curId(); if (!R) return -1;
  const tot = R.tot - (W8.reloading === 'shell' && R.id === id ? relUnseen() : 0), shellK = tot / (tot + R.tail);
  if (W8.reloading === 'shell' && R.id === id) return Math.min(shellK, R.el / (tot + R.tail));
  if (W8.reloading || R.id !== id) { W8.relRing = null; return -1; }
  if (R.p0 < 0) R.p0 = Math.min(shellK, R.el / (tot + R.tail));
  let f = -1;
  if (W8.shutT > 0) f = 1 - W8.shutT / W8.shutMax;   // the barrels being closed
  else if (W8.brkOpen) f = 0;   // (they start closing this frame)
  else if (W8.cyc && W8.cyc.id === id && !W8.cyc.homed) {   // racked: done as the round's driven home
    const c = W8.cyc, end = c.delay + c.v.beat.home * c.dur; if (R.t0 < 0) R.t0 = c.t;
    f = clamp((c.t - R.t0) / Math.max(0.01, end - R.t0), 0, 1);
  } else if (!W8.cyc && needsRack(id) && (W8.mag[id] || 0) > 0 && R.t0 < 0) f = 0;   // (it's racked once your hands are free)
  if (f < 0) { W8.relRing = null; return -1; }
  return R.p0 + (1 - R.p0) * f;
}
// the double barrel's shell reload (D.breakOpen): one shell a go, or both together with Sleight of Hand (the loader
// tier, game/run-state.js). Pulling the trigger part way through stops it: with a shell already in, at once (unless
// the next is already in the chamber, then it's pushed home first); with none, once the one in the hand is in. However
// a reload ends (done, stopped, a sprint, a shove, a vault), the barrels are swung up and latched before the gun fires
// again: BRK_SHUT long (Quick hands quickens it, and Sleight of Hand: D.shutMul), the support hand coming back to the forend for the first BRK_GRAB of
// it and lifting the barrels shut on it for the rest (player/hold.js poses it to the same marks). A trigger pulled
// during it is kept, and the shot goes off as it latches (W8.shutQ, then W8.shutFire: weapons/combat-update.js)
export const BRK_SHUT = 0.3, BRK_GRAB = 0.42, SHELL_IN = 0.7, SHUT_FIRE_WAIT = 0.5;
// the revolver loaded a round at a time (no speed loader) is shut the same way, by hand: CYL_SHUT long, the support
// hand going to the open cylinder for the first CYL_GRAB of it, pushing it round into the frame till it latches at
// CYL_LATCH, and back onto the grip after (player/hold.js poses it to the same marks)
export const CYL_SHUT = 0.46, CYL_GRAB = 0.36, CYL_LATCH = 0.74;
export const cylShut = D => !!D && !D.breakOpen && !D.akimbo && !!D.perShell && !D.speedload && (CRANE[W8.cur] || []).length > 0;
// a pump, once its last shell's in: the support hand comes back from the loading port onto the forend and takes hold of
// it (PUMP_GRAB seconds) before it's worked (weapons/casings.js: tickCycle; player/hold.js eases the hand on)
const PUMP_GRAB = 0.2;
// a pull of the trigger during a break-action's reload or its closing: whether it's taken here (the gun doesn't fire)
export function breakTrigger(id, D) {
  if (!D.breakOpen && !cylShut(D)) return false;
  if (W8.reloading === 'shell') {
    const rp = W8.relU;
    if ((W8.mag[id] || 0) > 0 && rp < SHELL_IN) W8.reloading = null; else W8.relStop = true;
    W8.shutQ = true; return true;
  }
  if (W8.brkOpen || W8.shutT > 0) { W8.shutQ = true; return true; }
  return false;
}
// how far through closing (-1: not closing; 0 too on the frame a reload's stopped, before tickShut has started it)
export const brkShutP = () => W8.shutT > 0 ? 1 - W8.shutT / W8.shutMax : W8.brkOpen && W8.reloading !== 'shell' ? 0 : -1;
export function tickShut(dt) {
  if (W8.shutFire > 0) W8.shutFire -= dt;
  const D = W(curId());
  if (!D || (!D.breakOpen && !cylShut(D))) { W8.brkOpen = false; W8.shutT = 0; W8.shutQ = false; return; }
  if (W8.reloading === 'shell') { W8.brkOpen = true; return; }
  if (W8.brkOpen) { W8.brkOpen = false; W8.shutT = W8.shutMax = (D.breakOpen ? BRK_SHUT * (D.shutMul || 1) : CYL_SHUT) * S.reloadMul; }
  if (W8.shutT <= 0) return;
  W8.shutT -= dt;
  if (W8.shutT > 0) return;
  W8.shutT = 0; if (D.breakOpen) { SFX.brkShut(); reloadJolt(0.22); setShake(Math.max(shake, 0.12)); }   // latched (the cylinder's own click as it latches: player/hold.js)
  if (W8.shutQ) { W8.shutQ = false; W8.shutFire = SHUT_FIRE_WAIT; }
}
