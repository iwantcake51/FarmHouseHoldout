// Switching weapons and reloading.

// force: draw it again even if it's the slot in your hands (a new weapon just went into it)
function equip(s, force) {
  if (!W8.slot[s] || (W8.cur === s && !force)) return;
  exitScope(); ANIM.sw = 0.35; W8.swing = 0; W8.boltOpen = false;
  startSwap(W8.cur === s ? null : W8.cur, s);   // put the old one away and draw this one (player/swap.js)
  if ((W(W8.slot[s]) || {}).melee) ANIM.meleeEqT = -(SWAP_T.end - 0.06);   // a flourish once it's drawn (player/hold.js)
  if (W8.cur === s) { W8.reloading = null; W8.reloadT = 0; } else cutReload();   // (a reload put away part done is picked up again: cutReload)
  W8.cur = s; W8.burstLeft = 0; W8.akBurst.L = W8.akBurst.R = 0; W8.cd = Math.max(W8.cd, SWAP_FIRE / S.swapMul); SFX.equip();
}
// reloading slows you down: a little with a sidearm, more with a long gun, and more again the bigger the magazine
// (a 13-round pistol about 15%, a 30-round rifle about a quarter, the 100-round LMG belt nearly half); reloading one of
// a pair, a gun still in the other hand, slows you AK_WALK more
function reloadSlow() {
  if (!W8.reloading) return 1;
  const id = curId(), D = W(id); if (!D || D.melee) return 1;
  const base = D.slot === 'side' ? 0.12 : D.slot === 'long' ? 0.2 : 0.17;
  return 1 - Math.min(0.48, base + Math.min(0.28, magSize(id) / 360) + (D.akimbo ? AK_WALK : 0));
}
const AK_WALK = 0.14;
// each reload's own feel (player/hold.js): how far the gun's turned for it, a bulge in the hand's way there, a wobble
const relJitter = () => { W8.relJit = { k: rr(0.82, 1.18), dx: rr(-0.03, 0.03), dy: rr(-0.025, 0.025), seed: rr(0, 20) }; };
const reserveOf = id => { const D = W(id); return D.ammo ? W8.reserve[D.ammo] : 0; };
function startReload() {
  const id = curId(), D = W(id); if (!D || D.melee || W8.reloading || P.vault || P.bandT > 0 || swapSt) return;   // hands are busy with the bandage, or still drawing
  // a reload cut short past its mag coming out or going in picks up from there (staged reloads, below)
  const sv = W8.relSave[id]; delete W8.relSave[id];
  if (sv && (sv.st === 'out' || sv.st === 'in')) { resumeStage(id, D, sv); return; }
  const missing = magSize(id) - (W8.mag[id] || 0); if (missing <= 0) return;
  if (reserveOf(id) <= 0) { toast('No ' + AMMO_NAME[D.ammo] + ' left', { kind: 'bad', icon: 'ammo', sub: 'Craft some at the workbench' }); return; }
  // the revolver dumps every empty at once, a beat after the cylinder swings out
  if (EJECT[id] === 'breach' && W8.spent[id] > 0) { const n = W8.spent[id]; W8.spent[id] = 0; if (id === 'revolver') setTimeout(() => { if (W8.reloading && curId() === id) { ejectCasing(D.ammo, n, 'dump'); reloadJolt(0.12); } else W8.spent[id] = (W8.spent[id] || 0) + n; }, 130); else ejectCasing(D.ammo, n, 'breach'); }
  W8.relStyle = Math.floor(Math.random() * 3); relJitter();   // which of its ways this reload is done, and its own feel (player/hold.js)
  W8.relStop = false; W8.shutQ = false; W8.shutFire = 0; W8.magOut = W8.filled = false;
  if (D.akimbo && !D.perShell && !D.speedload) { akStartReload(id, D); return; }   // each gun its own (weapons/akimbo.js)
  if (D.perShell) {
    // a reload cuts a rack short (the gun's left open and racked once you stop reloading, weapons/casings.js), and the
    // rifle's bolt is opened to feed it
    if (W8.cyc && W8.cyc.id === id) { if (!W8.cyc.done) ejectCasing(D.ammo, 1, EJECT[id]); W8.cyc = null; }
    if (EJECT[id] === 'bolt') { W8.open[id] = true; W8.boltOpen = true; }
    W8.reloading = 'shell'; W8.shellsIn = 0; W8.shellsNeed = Math.min(missing, reserveOf(id));
    W8.reloadT = D.perShell * S.reloadMul + (id === 'revolver' ? 0.3 : 0.12); W8.reloadMax = W8.reloadT;
  } else if (D.speedload) { W8.reloading = 'mag'; W8.reloadT = W8.reloadMax = D.reload * S.reloadMul; W8.seated = W8.pulled = W8.slammed = false; SFX.click(); reloadJolt(0.12); }   // the cylinder swings out
  else {
    // a pistol with rounds still in it swaps the mag and that's all (a touch quicker); an empty one ends by dropping the
    // slide off its stop, one of two ways. Any gun run dry takes EMPTY_MUL longer
    const empty = (W8.mag[id] || 0) <= 0, tac = slideReload(id) && !empty;
    W8.reloading = 'mag'; W8.relEmpty = slideReload(id) && !tac; W8.relVar = Math.random() < 0.5 ? 0 : 1;
    W8.reloadT = W8.reloadMax = D.reload * S.reloadMul * (tac ? TAC_MUL : 1) * (empty ? EMPTY_MUL : 1); W8.seated = W8.pulled = W8.slammed = false;
    SFX.magOut(); reloadJolt(0.12);   // (the old mag falls a beat later, at magOutP: tickReload)
  }
}
// the revolver's speed loader, through its reload: the rounds go into the cylinder, the loader is twisted and let go
// to fall, and the cylinder is snapped shut (player/hold.js moves the hand and the loader to the same marks)
const SL_IN = 0.56, SL_DROP = 0.7, SL_SHUT = 0.84;
// how far through a mag reload the mag is pushed home, and (for a rifle with a charging handle) when the handle is
// pulled and let go; player/hold.js poses the hands to the same marks
const MAG_SEAT = 0.84, CH_MAG = 0.76, CH_PULL = 0.86, CH_SLAM = 0.9;
// a magazine gun run dry takes EMPTY_MUL longer to reload than one with rounds left (it's fumbled out of an empty gun,
// and the gun's charged or its slide dropped at the end). Pistols whose slide locks back on the last round
// (player/hold.js holds it there, in the hand and in the holster): a
// reload with rounds still in it is TAC_MUL of the time and leaves the slide alone; an empty one changes the mag in the
// first PS_MAG of it, then drops the slide: a slingshot (variant 0: grab the back of it, tug it off the stop and let it
// fly) or a thumb on the slide stop (variant 1), let go at PS_REL by variant. The slingshot is a steady tug, eased in
// and out over about a tenth of a second (more for the hand cannon), not a snatch
const SLIDE_PISTOLS = { pistol: 1, deagle: 1 }, TAC_MUL = 0.85, EMPTY_MUL = 1.25, PS_MAG = 0.68, PS_TUG = 0.815, PS_REL = [0.917, 0.872];
const slideReload = id => !!SLIDE_PISTOLS[id] && !(W(id) || {}).akimbo;
const slideLocked = id => !!SLIDE_PISTOLS[id] && ((W(id) || {}).akimbo ? akMags(id).R <= 0 : (W8.mag[id] || 0) <= 0);   // a pair's holstered one is the right
const hasCharge = () => !!CHARGE[W8.cur];
// Staged reloads. A reload cut short by anything but the trigger (switching weapons, a shove, a sprint, a vault, a
// bandage) keeps the last of its marks it got to, for that gun (W8.relSave[id], cutReload): begun ('start'), the old
// mag out ('out': what was left in it goes back in your pouch and the gun stands empty, its well bare), the new one in
// ('in': it's loaded, and only charging it, dropping the slide or shutting the cylinder is left), or, loading a shell
// or round at a time, part loaded ('shell': what's in stays in). It picks up from that mark by itself as soon as the gun
// is in your hands and they're free (resumeReload, each frame from weapons/combat-update.js). Till it has, a gun with
// its mag out, or in but not charged, won't fire; a shot fired first forgets a 'start' or a 'shell'
const MAG_DROP_T = 0.14;   // seconds into a mag change the old mag comes free and falls (no more than 0.3 of the change)
// where in a mag reload (0 to 1) the old mag falls and the new one's seated (player/hold.js poses the hands the same)
const magK = () => hasCharge() ? CH_MAG : W8.relEmpty ? PS_MAG : 1;
const magOutP = () => Math.min(0.3, MAG_DROP_T / Math.max(0.3, W8.reloadMax)) * magK();
const magSeatP = () => MAG_SEAT * magK();
const relHeld = id => { const sv = W8.relSave[id]; return !!sv && (sv.st === 'out' || sv.st === 'in'); };
function cutReload() {
  const id = curId(), D = W(id), rel = W8.reloading;
  if (rel && D && !D.melee && D.ammo) {
    let sv = null;
    if (rel === 'shell') sv = { st: 'shell' };
    else if (D.akimbo && !D.speedload) sv = { st: 'start' };   // (a pair's own reload: weapons/akimbo.js)
    else if (W8.seated) { if ((hasCharge() || W8.relEmpty || D.speedload) && !W8.slammed) sv = { st: 'in', p: D.speedload ? (W8.pulled ? SL_DROP : SL_IN) : magSeatP(), pulled: !!(D.speedload && W8.pulled) }; }
    else if (W8.magOut) { sv = { st: 'out', p: magOutP() }; W8.reserve[D.ammo] += W8.mag[id] || 0; W8.mag[id] = 0; }
    else sv = { st: 'start' };
    if (sv) W8.relSave[id] = Object.assign(sv, { max: W8.reloadMax, relEmpty: W8.relEmpty, relVar: W8.relVar, relStyle: W8.relStyle, jit: W8.relJit });
  }
  W8.reloading = null; W8.reloadT = 0;
}
function resumeStage(id, D, sv) {
  if (sv.st === 'out' && reserveOf(id) <= 0) { toast('No ' + AMMO_NAME[D.ammo] + ' left', { kind: 'bad', icon: 'ammo', sub: 'Craft some at the workbench' }); return; }
  W8.reloading = 'mag'; W8.reloadMax = sv.max; W8.reloadT = sv.max * (1 - sv.p);
  W8.relEmpty = sv.relEmpty; W8.relVar = sv.relVar; W8.relStyle = sv.relStyle; if (sv.jit) W8.relJit = sv.jit;
  W8.magOut = true; W8.seated = W8.filled = sv.st === 'in'; W8.pulled = sv.pulled; W8.slammed = false; W8.relStop = false;
  SFX.click(); reloadJolt(0.1);
}
// each frame: back to a reload left part done, once the gun's in your hands and they're free (and, for one only begun
// or part loaded, you're not holding the trigger or the sprint key)
function resumeReload() {
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
function tickReload(dt) {
  if (!W8.reloading) return;
  const id = curId(), D = W(id);
  if (W8.reloading === 'mag' && D.akimbo && !D.speedload) { akTickReload(dt, id, D); return; }   // one gun at a time (weapons/akimbo.js)
  W8.reloadT -= dt;
  if (W8.reloading === 'mag' && D.speedload) {
    const p = 1 - W8.reloadT / W8.reloadMax;
    if (!W8.seated && p >= SL_IN) { W8.seated = true; fillMag(id, D); SFX.shell(); setTimeout(() => SFX.shell(), 45); reloadJolt(0.2); }
    if (!W8.pulled && p >= SL_DROP) { W8.pulled = true; dropLoader(); }
    if (!W8.slammed && p >= SL_SHUT) { W8.slammed = true; reloadJolt(0.16); }   // flicked shut (player/hold.js: its click as it latches)
  } else if (W8.reloading === 'mag') {
    const p = 1 - W8.reloadT / W8.reloadMax, ch = hasCharge(), ps = W8.relEmpty, seat = magSeatP();
    if (!W8.magOut && p >= magOutP()) { W8.magOut = true; dropMag(id); magSwapIn(id); reloadJolt(0.08); }   // the old mag falls; a newer one bought since comes out of the pouch
    if (!W8.seated && p >= seat) { W8.seated = true; fillMag(id, D); SFX.magIn(); reloadJolt(0.26); shake = Math.max(shake, D.ammo === 'rifle' || (D.mag || 0) > 30 ? 0.16 : 0.12); }   // slapped home
    if (ch && !W8.pulled && p >= CH_PULL) { W8.pulled = true; SFX.chargePull(); reloadJolt(0.1); }
    if (ch && !W8.slammed && p >= CH_SLAM) { W8.slammed = true; SFX.chargeSlam(); reloadJolt(0.2); shake = Math.max(shake, 0.1); }
    if (ps && !W8.pulled && W8.relVar === 0 && p >= PS_TUG) { W8.pulled = true; SFX.chargePull(); reloadJolt(0.06); }   // tugged off the stop
    if (ps && !W8.slammed && p >= PS_REL[W8.relVar]) { W8.slammed = true; SFX.slideDrop(); reloadJolt(0.22); shake = Math.max(shake, 0.09); }   // and it slams home
  }
  if (W8.reloadT > 0) return;
  if (W8.reloading === 'shell') {
    // one shell a go, or two or three with a speed loader
    const n = Math.max(1, Math.min(D.loadN || 1, magSize(id) - (W8.mag[id] || 0), reserveOf(id)));
    W8.mag[id] = (W8.mag[id] || 0) + n; W8.reserve[D.ammo] -= n; W8.shellsIn += n; SFX.shell(); if (n > 1) setTimeout(() => SFX.shell(), 55); reloadJolt(0.09 + 0.03 * (n - 1)); shake = Math.max(shake, 0.06);
    if (W8.mag[id] < magSize(id) && reserveOf(id) > 0 && !W8.relStop) { W8.reloadT = W8.reloadMax = D.perShell * S.reloadMul; W8.relStyle = Math.floor(Math.random() * 3); relJitter(); }   // the next shell, its own way
    // done: a pump or bolt gun that's open is racked next (weapons/casings.js), one that's chambered is ready as it is;
    // anything else snaps shut
    else if (racked(id)) { W8.reloading = null; if (!needsRack(id)) reloadJolt(0.1); }
    else if (D.breakOpen) W8.reloading = null;   // the barrels are closed next, before it'll fire (tickShut)
    else { W8.reloading = null; if (!(CRANE[W8.cur] || []).length) SFX.rack(); reloadJolt(0.22); shake = Math.max(shake, 0.12); W8.cd = Math.max(W8.cd, 0.25); }   // (a revolver's flicked shut: player/hold.js)
  } else {
    if (!W8.filled) fillMag(id, D);
    W8.reloading = null; magSwapIn(id);
    if (!W8.seated && !D.speedload) { SFX.magIn(); reloadJolt(0.26); shake = Math.max(shake, 0.12); }   // (seated already, unless it was cut short)
  }
}
// the double barrel's shell reload (D.breakOpen): one shell a go, or both together with Sleight of Hand (the loader
// tier, game/run-state.js). Pulling the trigger part way through stops it: with a shell already in, at once (unless
// the next is already in the chamber, then it's pushed home first); with none, once the one in the hand is in. However
// a reload ends (done, stopped, a sprint, a shove, a vault), the barrels are swung up and latched before the gun fires
// again: BRK_SHUT long (Quick hands quickens it), the support hand coming back to the forend for the first BRK_GRAB of
// it and lifting the barrels shut on it for the rest (player/hold.js poses it to the same marks). A trigger pulled
// during it is kept, and the shot goes off as it latches (W8.shutQ, then W8.shutFire: weapons/combat-update.js)
const BRK_SHUT = 0.3, BRK_GRAB = 0.42, SHELL_IN = 0.7, SHUT_FIRE_WAIT = 0.5;
// a pull of the trigger during a break-action's reload or its closing: whether it's taken here (the gun doesn't fire)
function breakTrigger(id, D) {
  if (!D.breakOpen) return false;
  if (W8.reloading === 'shell') {
    const rp = 1 - W8.reloadT / W8.reloadMax;
    if ((W8.mag[id] || 0) > 0 && rp < SHELL_IN) W8.reloading = null; else W8.relStop = true;
    W8.shutQ = true; return true;
  }
  if (W8.brkOpen || W8.shutT > 0) { W8.shutQ = true; return true; }
  return false;
}
// how far through closing (-1: not closing; 0 too on the frame a reload's stopped, before tickShut has started it)
const brkShutP = () => W8.shutT > 0 ? 1 - W8.shutT / W8.shutMax : W8.brkOpen && W8.reloading !== 'shell' ? 0 : -1;
function tickShut(dt) {
  if (W8.shutFire > 0) W8.shutFire -= dt;
  const D = W(curId());
  if (!D || !D.breakOpen) { W8.brkOpen = false; W8.shutT = 0; W8.shutQ = false; return; }
  if (W8.reloading === 'shell') { W8.brkOpen = true; return; }
  if (W8.brkOpen) { W8.brkOpen = false; W8.shutT = W8.shutMax = BRK_SHUT * S.reloadMul; }
  if (W8.shutT <= 0) return;
  W8.shutT -= dt;
  if (W8.shutT > 0) return;
  W8.shutT = 0; SFX.brkShut(); reloadJolt(0.22); shake = Math.max(shake, 0.12);   // latched
  if (W8.shutQ) { W8.shutQ = false; W8.shutFire = SHUT_FIRE_WAIT; }
}
