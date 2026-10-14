// Switching weapons and reloading.

// force: draw it again even if it's the slot in your hands (a new weapon just went into it)
function equip(s, force) {
  if (!W8.slot[s] || (W8.cur === s && !force)) return;
  exitScope(); ANIM.sw = 0.35; W8.swing = 0; W8.boltOpen = false;
  startSwap(W8.cur === s ? null : W8.cur, s);   // put the old one away and draw this one (player/swap.js)
  if ((W(W8.slot[s]) || {}).melee) ANIM.meleeEqT = -(SWAP_T.end - 0.06);   // a flourish once it's drawn (player/hold.js)
  W8.cur = s; W8.reloading = null; W8.reloadT = 0; W8.burstLeft = 0; W8.akBurst.L = W8.akBurst.R = 0; W8.cd = Math.max(W8.cd, SWAP_FIRE); SFX.click();
}
// reloading slows you down: a little with a sidearm, more with a long gun, and more again the bigger the magazine
// (a 13-round pistol about 15%, a 30-round rifle about a quarter, the 100-round LMG belt nearly half)
function reloadSlow() {
  if (!W8.reloading) return 1;
  const id = curId(), D = W(id); if (!D || D.melee) return 1;
  const base = D.slot === 'side' ? 0.12 : D.slot === 'long' ? 0.2 : 0.17;
  return 1 - Math.min(0.48, base + Math.min(0.28, magSize(id) / 360));
}
const reserveOf = id => { const D = W(id); return D.ammo ? W8.reserve[D.ammo] : 0; };
function startReload() {
  const id = curId(), D = W(id); if (!D || D.melee || W8.reloading || P.vault || P.bandT > 0 || swapSt) return;   // hands are busy with the bandage, or still drawing
  const missing = magSize(id) - (W8.mag[id] || 0); if (missing <= 0) return;
  if (reserveOf(id) <= 0) { toast('No ' + AMMO_NAME[D.ammo] + ' left', { kind: 'bad', icon: 'ammo', sub: 'Craft some at the workbench' }); return; }
  // the revolver dumps every empty at once, a beat after the cylinder swings out
  if (EJECT[id] === 'breach' && W8.spent[id] > 0) { const n = W8.spent[id]; W8.spent[id] = 0; if (id === 'revolver') setTimeout(() => { if (W8.reloading && curId() === id) { ejectCasing(D.ammo, n, 'dump'); reloadJolt(0.12); } else W8.spent[id] = (W8.spent[id] || 0) + n; }, 130); else ejectCasing(D.ammo, n, 'breach'); }
  W8.relStyle = Math.floor(Math.random() * 3);   // which of its ways this reload is done (player/hold.js)
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
    // slide off its stop, one of two ways
    const tac = slideReload(id) && (W8.mag[id] || 0) > 0;
    W8.reloading = 'mag'; W8.relEmpty = slideReload(id) && !tac; W8.relVar = Math.random() < 0.5 ? 0 : 1;
    W8.reloadT = W8.reloadMax = D.reload * S.reloadMul * (tac ? TAC_MUL : 1); W8.seated = W8.pulled = W8.slammed = false;
    SFX.magOut(); reloadJolt(0.12); setTimeout(() => { if (W8.reloading === 'mag' && curId() === id) { dropMag(id); reloadJolt(0.08); } }, 140);
  }
}
// the revolver's speed loader, through its reload: the rounds go into the cylinder, the loader is twisted and let go
// to fall, and the cylinder is snapped shut (player/hold.js moves the hand and the loader to the same marks)
const SL_IN = 0.56, SL_DROP = 0.7, SL_SHUT = 0.84;
// how far through a mag reload the mag is pushed home, and (for a rifle with a charging handle) when the handle is
// pulled and let go; player/hold.js poses the hands to the same marks
const MAG_SEAT = 0.84, CH_MAG = 0.76, CH_PULL = 0.86, CH_SLAM = 0.9;
// pistols whose slide locks back on the last round (player/hold.js holds it there, in the hand and in the holster): a
// reload with rounds still in it is TAC_MUL of the time and leaves the slide alone; an empty one changes the mag in the
// first PS_MAG of it, then drops the slide: a slingshot (variant 0: grab the back of it, tug it off the stop and let it
// fly) or a thumb on the slide stop (variant 1), let go at PS_REL by variant. The slingshot is a steady tug, eased in
// and out over about a tenth of a second (more for the hand cannon), not a snatch
const SLIDE_PISTOLS = { pistol: 1, deagle: 1 }, TAC_MUL = 0.85, PS_MAG = 0.68, PS_TUG = 0.815, PS_REL = [0.917, 0.872];
const slideReload = id => !!SLIDE_PISTOLS[id] && !(W(id) || {}).akimbo;
const slideLocked = id => !!SLIDE_PISTOLS[id] && ((W(id) || {}).akimbo ? akMags(id).R <= 0 : (W8.mag[id] || 0) <= 0);   // a pair's holstered one is the right
const hasCharge = () => !!CHARGE[W8.cur];
function tickReload(dt) {
  if (!W8.reloading) return;
  const id = curId(), D = W(id);
  if (W8.reloading === 'mag' && D.akimbo && !D.speedload) { akTickReload(dt, id, D); return; }   // one gun at a time (weapons/akimbo.js)
  W8.reloadT -= dt;
  if (W8.reloading === 'mag' && D.speedload) {
    const p = 1 - W8.reloadT / W8.reloadMax;
    if (!W8.seated && p >= SL_IN) { W8.seated = true; SFX.shell(); setTimeout(() => SFX.shell(), 45); reloadJolt(0.2); }
    if (!W8.pulled && p >= SL_DROP) { W8.pulled = true; dropLoader(); }
    if (!W8.slammed && p >= SL_SHUT) { W8.slammed = true; SFX.rack(); reloadJolt(0.24); shake = Math.max(shake, 0.1); }
  } else if (W8.reloading === 'mag') {
    const p = 1 - W8.reloadT / W8.reloadMax, ch = hasCharge(), ps = W8.relEmpty, seat = ch ? MAG_SEAT * CH_MAG : ps ? MAG_SEAT * PS_MAG : MAG_SEAT;
    if (!W8.seated && p >= seat) { W8.seated = true; SFX.magIn(); reloadJolt(0.26); shake = Math.max(shake, D.ammo === 'rifle' || (D.mag || 0) > 30 ? 0.16 : 0.12); }   // slapped home
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
    if (W8.mag[id] < magSize(id) && reserveOf(id) > 0) { W8.reloadT = W8.reloadMax = D.perShell * S.reloadMul; W8.relStyle = Math.floor(Math.random() * 3); }   // the next shell, its own way
    // done: a pump or bolt gun that's open is racked next (weapons/casings.js), one that's chambered is ready as it is;
    // anything else snaps shut
    else if (racked(id)) { W8.reloading = null; if (!needsRack(id)) reloadJolt(0.1); }
    else { W8.reloading = null; SFX.rack(); reloadJolt(0.22); shake = Math.max(shake, 0.12); W8.cd = Math.max(W8.cd, 0.25); }
  } else {
    const need = magSize(id) - (W8.mag[id] || 0), take = Math.min(need, W8.reserve[D.ammo]);
    W8.mag[id] = (W8.mag[id] || 0) + take; W8.reserve[D.ammo] -= take;
    W8.reloading = null;
    if (!W8.seated && !D.speedload) { SFX.magIn(); reloadJolt(0.26); shake = Math.max(shake, 0.12); }   // (seated already, unless it was cut short)
  }
}
