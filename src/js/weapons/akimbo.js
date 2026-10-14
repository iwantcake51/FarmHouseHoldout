// Akimbo: a gun in each hand, each with its own magazine, trigger and reload. Left click fires the left gun and right
// click the right (holding both, they take turns); there's no aiming down the sights with two guns out.
// W8.mag[id] stays the pair's total, so everything that only asks how much is loaded still works, and W8.akMag[id]
// splits it between the hands.

const AK_SIDES = ['L', 'R'];
// which gun is on which side as you see it: the rig's 'R' hand is the one on your left as you face (its 'L' on your
// right), so left click fires the 'R' gun, and the HUD and crosshair show it on the left
const AK_ON = { left: 'R', right: 'L' };
const akPer = id => Math.max(1, Math.round(magSize(id) / 2));   // one gun's magazine
// each hand's rounds. The total is the truth: when something else changed it (a new gun, a bigger mag), the difference
// is shared out, filling the right gun first and emptying the left first
function akMags(id) {
  let m = W8.akMag[id];
  const per = akPer(id), tot = W8.mag[id] || 0;
  if (!m) m = W8.akMag[id] = { L: 0, R: 0 };
  m.L = Math.min(m.L, per); m.R = Math.min(m.R, per);
  let d = tot - m.L - m.R;
  if (d > 0) { const r = Math.min(per - m.R, d); m.R += r; m.L += Math.min(per - m.L, d - r); }
  else if (d < 0) { const l = Math.min(m.L, -d); m.L -= l; m.R = Math.max(0, m.R + d + l); }
  W8.mag[id] = m.L + m.R;
  return m;
}
// a gun's turn to be reloaded: it goes down to the hip pouch while the other stays up on the aim and can still fire. Its
// mag flicks out at AK_OUT of its turn, the fresh one is seated at AK_IN, and a gun that ran dry has its slide dropped
// off the stop at AK_SLIDE as it comes back up (player/hold.js poses it on the same marks). Done one-handed it's slow:
// a gun with rounds left takes AK_TAC of a lone gun's reload, and one run dry AK_EMPTY (its mag fumbled out and the
// slide thumbed home with the same hand)
const AK_OUT = 0.08, AK_IN = 0.6, AK_SLIDE = 0.7, AK_TAC = 0.95, AK_EMPTY = 1.4;
const akBusy = s => W8.reloading === 'mag' && !!W8.akRel && W8.akRel.side === s;
// how far through its own reload a gun is (0 when it's up on the aim)
const akU = s => akBusy(s) ? clamp(W8.akRel.t / W8.akRel.dur, 0, 1) : 0;
// a gun's slide sits locked back once it's run dry, until its reload drops it
function akSlideBack(id, s) {
  if (akBusy(s) && W8.akRel.empty) return W8.akRel.t / W8.akRel.dur < akRelAt(id);
  return akMags(id)[s] <= 0;
}
const akDur = (D, empty) => D.reload * S.reloadMul * (empty ? AK_EMPTY : AK_TAC);
// a pair of machine pistols has charging handles, not slide stops: one run dry is charged two-handed once its fresh
// mag is in. The other gun goes flat across your chest (neither can fire till it's back up), its hand reaches over, draws
// the empty one's handle back and lets it go at AK_CH.rel, then takes its own gun back up. Each stretch is [in from,
// in by, out from, out by] of the empty gun's turn (player/hold.js poses it on the same marks)
const AK_CH = { chest: [0.44, 0.66, 0.86, 1.0], hold: [0.58, 0.7, 0.88, 1.0], reach: [0.6, 0.72, 0.86, 0.95], pull: [0.76, 0.83], rel: 0.84 };
const akHasCharge = id => { const D = W(id); return !!(D && D.akimbo && CHARGE[D.slot]); };
const akRelAt = id => akHasCharge(id) ? AK_CH.rel : AK_SLIDE;   // when an empty gun's slide or bolt goes home
function akChargeState(id) {
  const r = W8.akRel; if (W8.reloading !== 'mag' || !r || !r.side || !r.empty || !akHasCharge(id)) return null;
  const u = clamp(r.t / r.dur, 0, 1), env = k => smooth(clamp((u - k[0]) / (k[1] - k[0]), 0, 1)) * (1 - smooth(clamp((u - k[2]) / (k[3] - k[2]), 0, 1)));
  return { side: r.side, other: r.side === 'L' ? 'R' : 'L', u, chest: env(AK_CH.chest), hold: env(AK_CH.hold), reach: env(AK_CH.reach),
    pull: u < AK_CH.rel ? smooth(clamp((u - AK_CH.pull[0]) / (AK_CH.pull[1] - AK_CH.pull[0]), 0, 1)) : 0, slam: Math.sin(clamp((u - AK_CH.rel) / 0.07, 0, 1) * Math.PI) };
}
const akCharging = id => { const c = akChargeState(id); return (!!c && c.u >= AK_CH.chest[0]) || (ANIM.akCh || 0) > 0.3; };   // (and till it's most of the way back up)
// R: every gun that's short of a full mag is reloaded in turn, the emptier first (the right if they're even). Only one
// fired, only that one is reloaded, so it's quicker
function akStartReload(id, D) {
  const m = akMags(id), per = akPer(id);
  if (!AK_SIDES.some(s => m[s] < per)) return;
  W8.reloading = 'mag'; W8.akRel = { done: {}, side: null, t: 0, dur: 1, el: 0, empty: false, ev: 0 };
  akNextGun(id, D);
}
function akNextGun(id, D) {
  const r = W8.akRel, m = akMags(id), per = akPer(id);
  const left = AK_SIDES.filter(s => !r.done[s] && m[s] < per).sort((a, b) => m[a] - m[b] || (a === 'R' ? -1 : 1));
  if (!left.length || reserveOf(id) <= 0) { W8.reloading = null; r.side = null; return; }
  const s = left[0];
  r.side = s; r.t = 0; r.ev = 0; r.empty = m[s] <= 0; r.dur = akDur(D, r.empty); W8.relStyle = Math.floor(Math.random() * 3); relJitter();
  akRing(id, D);
}
// the reload ring and the HUD's timer run over the whole reload: this gun's turn and the other's, if it's still to come
function akRing(id, D) {
  const r = W8.akRel, m = akMags(id), o = r.side === 'L' ? 'R' : 'L';
  const rest = Math.max(0, r.dur - r.t) + (!r.done[o] && m[o] < akPer(id) ? akDur(D, m[o] <= 0) : 0);
  W8.reloadMax = Math.max(0.01, r.el + rest); W8.reloadT = rest;
}
function akTickReload(dt, id, D) {
  const r = W8.akRel; if (!r || !r.side) { W8.reloading = null; return; }
  const s = r.side; r.t += dt; r.el += dt;
  const u = r.t / r.dur;
  if (r.ev === 0 && u >= AK_OUT) { r.ev++; SFX.magOut(); dropMag(id, s); reloadJolt(0.1); }
  if (r.ev === 1 && u >= AK_IN) {
    // the fresh mag goes home and its rounds are in the count
    r.ev++; SFX.magIn(); reloadJolt(0.2); shake = Math.max(shake, 0.08);
    const m = akMags(id), take = Math.min(akPer(id) - m[s], W8.reserve[D.ammo]);
    m[s] += take; W8.mag[id] += take; W8.reserve[D.ammo] -= take;
  }
  if (akHasCharge(id)) {   // a machine pistol: its handle drawn back, then let go
    if (r.ev === 2 && r.empty && u >= AK_CH.pull[0]) { r.ev++; SFX.chargePull(); reloadJolt(0.06); }
    if (r.ev === 3 && u >= AK_CH.rel) { r.ev++; SFX.chargeSlam(); reloadJolt(0.18); shake = Math.max(shake, 0.07); }
  } else if (r.ev === 2 && r.empty && u >= AK_SLIDE) { r.ev++; SFX.slideDrop(); reloadJolt(0.16); shake = Math.max(shake, 0.06); }
  if (u >= 1) { r.done[s] = true; akNextGun(id, D); if (!W8.reloading) return; }
  akRing(id, D);
}
// the triggers. want.L / want.R are each gun's trigger (the mouse buttons, through AK_ON); want.any is a touch stick, one trigger for both, and the guns
// take turns on it. In single shots each gun fires once a click; a burst is a gun's own (three from that gun, both for
// six), repeating while its button is held and stopping where it is when it's let go
function akTriggers(dt, id, D, want) {
  // vaulting (Run and gun) the left hand's on the sill, its gun put away till it's drawn again after (player/hold.js),
  // so either button fires the right gun
  if (P.vault || ANIM.akIn) { want = { L: false, R: want.L || want.R || want.any, any: false }; }
  if (akCharging(id)) want = { L: false, R: false, any: false };   // one gun on your chest, a hand on the other's charging handle
  for (const s of AK_SIDES) {
    W8.akCd[s] -= dt;
    if (!want[s] && !want.any) { W8.akLock[s] = false; W8.akBurst[s] = 0; }
    if (W8.akBurst[s] > 0) {
      W8.akBurstT[s] -= dt;
      if (W8.akBurstT[s] <= 0) {
        if (akMags(id)[s] > 0 && !akBusy(s)) { W8.akBurst[s]--; W8.akBurstT[s] = 0.06; W8.inBurst = true; gunFire(id, D, s); W8.inBurst = false; if (W8.akBurst[s] <= 0) W8.akCd[s] = 0.45 / Math.sqrt(S.rateMul); }
        else W8.akBurst[s] = 0;
      }
    }
  }
  if (W8.cd > 0) return;
  // the other gun from the last shot gets the first chance, so holding both they alternate
  const order = W8.akSide > 0 ? ['L', 'R'] : ['R', 'L'];
  if (want.any) {
    // one trigger: whichever is ready and loaded, or a dry click from the first if neither has a round
    const m = akMags(id), ok = order.filter(s => !akBusy(s) && !W8.akLock[s] && W8.akCd[s] <= 0 && W8.akBurst[s] <= 0);
    const s = ok.find(q => m[q] > 0) || ok[0];
    if (s) gunFire(id, D, s);
    return;
  }
  for (const s of order) {
    if (!want[s] || W8.akLock[s] || W8.akCd[s] > 0 || W8.akBurst[s] > 0 || akBusy(s)) continue;
    gunFire(id, D, s); return;   // one shot a frame
  }
}
// one gun's shot: false if it can't (that gun's being reloaded, or it's dry and just clicks)
function akShot(id, D, s) {
  if (akBusy(s)) return false;
  const m = akMags(id);
  if (m[s] <= 0) { W8.akCd[s] = 0.25; if (semiAuto(id)) W8.akLock[s] = true; SFX.click(); const aw = $('ammoWarn'); aw.classList.remove('kick'); void aw.offsetWidth; aw.classList.add('kick'); return false; }
  m[s]--; W8.mag[id]--; W8.akSide = s === 'L' ? -1 : 1;
  // each gun at its own pace (two guns together fire as fast as D.rate), and a moment before the other can follow
  W8.akCd[s] = D.rate * 2 / S.rateMul; if (!W8.inBurst) W8.cd = D.rate * 0.6 / S.rateMul;
  if (D.burst && W8.akBurst[s] <= 0 && !W8.inBurst) { W8.akBurst[s] = D.burst - 1; W8.akBurstT[s] = 0.06; }
  else if (!W8.inBurst && semiAuto(id)) W8.akLock[s] = true;   // one shot a click
  return true;
}
