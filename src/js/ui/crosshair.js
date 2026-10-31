// The crosshair.

import { $, replay } from '../core/dom.js';
import { kbd } from '../input/keybinds.js';
import { cam, FP_CAM, GUN_Y, V3 } from '../core/renderer.js';
import { angDiff, cache, clamp, smooth } from '../core/math.js';
import { ci } from '../world/grid.js';
import { thinRay } from '../world/thin-walls.js';
import { bulletBlocked } from '../world/collision.js';
import { P } from '../player/player.js';
import { roundOn } from '../weapons/rounds.js';
import { curId, magCap, stamMax, W, W8 } from '../game/run-state.js';
import { MUZ } from '../weapons/gun-materials.js';
import { zombies } from '../zombies/zombie-types.js';
import { bloom, camRoll, setBloom, state } from '../game/state.js';
import { aimPt, hasMouse, mouseX, mouseY } from '../input/keyboard-mouse.js';
import { scoped } from '../player/aiming.js';
import { usingTouch } from '../input/touch.js';
import { relRingP, relUnseen } from '../weapons/reload.js';
import { AK_ON, akBusy, akMags, akPer, akU } from '../weapons/akimbo.js';
import { aimRay, muzzle, scopeDist, scopeSpread, scopeUse, SG_FP, spreadOf } from '../weapons/firing.js';
import { rollText } from './hud-text.js';
import { los } from '../lighting/lightmap.js';
import { fpOn, fpSighted, freeOn, onScreen, VCAM, xhAt } from '../game/view-cam.js';
import { muzzleWorld } from '../effects/muzzle-flash.js';
import { ANIM } from '../player/animation.js';

export const projV = new V3();
// a hit's marker on the crosshair (zombies/damage.js): kind 'hit', 'head' (a hit through the head) or 'kill', with head
// for a kill through the head; flashed afresh each time, so a burst's hits each show. Not while the crosshair's put away
// (down the sights in first person, where the sights are what you aim with): a hit there never marks it, so nothing's
// left over to show as you come off the sights, however long after
const xhMark = $('xhHit');
export function hitMark(kind, head) {
  // down the sights, where the crosshair's put away: a marker of its own over the sight, and a kick through it (ADS_HIT)
  if (fpSighted()) { adsHit.classList.remove('hit', 'head', 'kill'); replay(adsHit, kind === 'kill' ? 'kill' : 'hit', ...(head || kind === 'head' ? ['head'] : [])); return; }
  if (xh.hidden) return;
  xhMark.classList.remove('hit', 'head', 'kill');
  replay(xhMark, kind === 'kill' ? 'kill' : 'hit', ...(head || kind === 'head' ? ['head'] : []));
}
// and taken off once it's played: left on, it played again every time the crosshair was shown (coming back off the
// sights), a kill's red marker with nothing hit
const hitMarkOff = () => xhMark.classList.remove('hit', 'head', 'kill');
// the down-the-sights marker: four short ticks round the middle of the screen
const adsHit = (() => { const d = document.createElement('div'); d.id = 'adsHit'; d.innerHTML = '<i></i><i></i><i></i><i></i>'; document.body.appendChild(d); d.addEventListener('animationend', () => d.classList.remove('hit', 'head', 'kill')); return d; })();
xhMark.addEventListener('animationend', hitMarkOff);
const xh = $('xh'), xhRing = $('xhReload'), xhAmmo = $('xhAmmo'), xhAmmoBg = $('xhAmmoBg'), xhGl = $('xhGl'), xhSpread = $('xhSpread');
// an akimbo pair's left gun: its own arc and reload ring, mirrored on the left
const xhAmmoL = $('xhAmmoL'), xhAmmoBgL = $('xhAmmoBgL'), xhRingL = $('xhReloadL');
// the reload on each side: the track behind the fill, the bead on its leading end, and what it was last frame (for
// the flash as it finishes). The right arc runs up from its bottom end (42° below the right), the left one up from
// its bottom end too (138°)
const RL = { R: { ring: xhRing, track: $('xhRTrack'), head: $('xhRHead'), a0: 42, dir: -1, on: false, u: 0 }, L: { ring: xhRingL, track: $('xhRTrackL'), head: $('xhRHeadL'), a0: 138, dir: 1, on: false, u: 0 } };
// (the fill doesn't jump to where the reload's got to: it glides there (RL_EASE: how quickly a second, up and back), and
// when a fumble sets it back (by more than knock) it's knocked back with a jolt, the arc and its bead flaring red and
// shaking, styles/crosshair.css: .knock)
const RL_EASE = { up: 22, back: 12, knock: 0.015, knockMs: 550 };
function reloadDraw(side, on, u, rdt = 1 / 60) {
  const r = RL[side], A = ARC(); u = clamp(u, 0, 1);
  if (on && r.on && r.disp !== undefined) {
    if (u < r.disp - RL_EASE.knock && performance.now() - (r.knockAt || 0) > 350) { r.knockAt = performance.now(); [r.ring, r.head, r.track].forEach(el => { el.classList.remove('knock'); void el.getBBox(); el.classList.add('knock'); }); }
    r.disp += (u - r.disp) * (1 - Math.exp(-rdt * (u < r.disp ? RL_EASE.back : RL_EASE.up))); u = r.disp;
  } else r.disp = u;
  // (the jolt's class taken off once it's played, or it would stand in for the finishing flash and a round's pulse after it)
  if (r.knockAt && (performance.now() - r.knockAt > RL_EASE.knockMs || !on)) { r.knockAt = 0; [r.ring, r.head, r.track].forEach(el => el.classList.remove('knock')); }
  // a round's pulse is over once the reload is: its class would otherwise outrank the finishing flash and leave the arc lit
  if (!on && r.on) { [r.ring, r.head, r.track].forEach(el => el.classList.remove('tick')); $('xhRPing').classList.remove('tick'); }
  // finished: a flash over the rounds now in it, exactly as the ammo arc shows them (only for a reload that ran its
  // course on the gun still in your hands: not one cut short by putting the gun away)
  const id = curId(), done = !on && r.on && r.u > 0.85 && r.id === id && !W8.relSave[id];
  if (done) { r.ring.setAttribute('stroke-dasharray', ammoNow(side)); r.ring.classList.remove('done'); void r.ring.getBBox(); r.ring.classList.add('done'); }
  else if (!on && r.on) r.ring.classList.remove('done');
  // filling: its fill as far as the reload's come (and the last one's finishing flash, if it's still showing, put out)
  if (on) { r.id = id; if (!r.on) r.ring.classList.remove('done'); r.ring.setAttribute('stroke-dasharray', (A * u).toFixed(1) + ' 999'); }
  if (!r.ring.classList.contains('done') || on) r.ring.style.opacity = on ? 1 : 0;
  else r.ring.style.opacity = 1;
  r.track.setAttribute('stroke-dasharray', A.toFixed(1) + ' 999'); r.track.style.opacity = on ? 1 : 0;
  const a = (r.a0 + r.dir * 84 * u) * Math.PI / 180; r.head.setAttribute('cx', (aR * Math.cos(a)).toFixed(1)); r.head.setAttribute('cy', (aR * Math.sin(a)).toFixed(1)); r.head.style.opacity = on && u > 0.02 ? 1 : 0;
  r.on = on; if (on) r.u = u;
  // a round just went in: the pulse, from where the bead is now (reloadTick)
  if (!on) r.tick = false;   // (the last one in finishes it: that's the .done flash instead)
  if (r.tick && on) { r.tick = false; const P0 = $('xhRPing'); P0.setAttribute('cx', r.head.getAttribute('cx')); P0.setAttribute('cy', r.head.getAttribute('cy')); [r.ring, r.head, r.track, P0].forEach(el => { el.classList.remove('tick'); void el.getBBox(); el.classList.add('tick'); }); }
}
// a shell or cartridge loaded by hand (weapons/reload.js): the reload arc pulses as it goes in (styles/crosshair.css)
export function reloadTick() { RL.R.tick = true; }
const tks = [0, 1, 2, 3].map(k => $('tk' + k)), xhSgSh = $('xhSgSh'), xhSgR = $('xhSgR');
// the shotgun reticle: four short arcs of a ring as wide as the spread, one on each diagonal like corner brackets, with
// wide gaps at the top, bottom and each side. Each arc covers under two fifths of its quarter (never less than 3 px), so
// even a tight spread reads as four brackets round the dot, never a whole circle. The dark under-stroke's arcs run a
// little longer so it outlines each arc's ends
function sgRing(r) {
  const seg = 2 * Math.PI * r / 4, g = seg - Math.max(3, seg * 0.38), gs = Math.max(0.5, g - 2.4);
  const dash = (el, gap) => { el.setAttribute('r', r); el.setAttribute('stroke-dasharray', `${(seg - gap).toFixed(2)} ${gap.toFixed(2)}`); el.setAttribute('stroke-dashoffset', (seg - gap / 2).toFixed(2)); };
  dash(xhSgSh, gs); dash(xhSgR, g);
}
// flechettes: NEEDLE_N needles, each NEEDLE_LEN long, pointing in to the middle from the spread's edge
const NEEDLE_N = 8, NEEDLE_LEN = 5, xhFl = $('xhFl');
xhFl.innerHTML = Array.from({ length: NEEDLE_N }, (_, k) => `<g transform="rotate(${k * 360 / NEEDLE_N})"><line class="flSh" y1="0" y2="${NEEDLE_LEN}"></line><line class="fl" y1="0" y2="${NEEDLE_LEN}"></line></g>`).join('');
const flNeedles = [...xhFl.children];
function flRing(r) { flNeedles.forEach((g, k) => g.setAttribute('transform', `rotate(${k * 360 / NEEDLE_N}) translate(0,${-r})`)); }
// dragon's breath: three arcs, each DB_ARC of its third, centred on the top and the two lower diagonals
const DB_ARC = 0.42, xhDbSh = $('xhDbSh'), xhDbR = $('xhDbR');
function dbRing(r) {
  const seg = 2 * Math.PI * r / 3, top = (Math.PI * r / 6) % seg;   // (the top of the circle, 270° round from its start, within a third)
  const dash = (el, d) => { el.setAttribute('r', r); el.setAttribute('stroke-dasharray', `${d.toFixed(2)} ${(seg - d).toFixed(2)}`); el.setAttribute('stroke-dashoffset', (d / 2 - top).toFixed(2)); };
  const d = Math.max(3, seg * DB_ARC); dash(xhDbSh, d + 2.4); dash(xhDbR, d);
}
// which reticle a shotgun shows for the shell in it (weapons/rounds.js): slugs the four ticks, like a rifle
const SG_XH = { std: 'ring', slug: null, flech: 'needle', fire: 'tri' };
let gapCur = 10, lastGap = -1;
// the ammo arc (on the right) and the stamina arc (underneath) ride just outside the reticle, so it never reaches into
// or over them: their radius grows from where they sit when it's tight (aR, sR) to keep a clear gap outside its outer
// edge (the ticks reach TICK_L past the spread, the shotgun's arcs sit on it), and the grenade launcher's arc and the
// warning text move out with them
let aR = 30, sR = 22, lastXh = '';
const TICK_L = 10.7, XH_CLEAR = { a: 6, s: 5 }, XH_SG_MAX = 150;
const ARC = () => 2 * Math.PI * aR * (84 / 360), M_ARC = () => 2 * Math.PI * sR * (64 / 360);
// the rounds in the gun this moment, drawn as its ammo arc is (side: an akimbo pair's left gun's, or the right's), so the
// flash as a reload finishes always shows what's just gone in, never what was there a frame before
function ammoNow(side) {
  const id = curId(), D = W(id) || {}, ak = !!D.akimbo, am = ak && akMags(id), n = ak ? akPer(id) : magCap(id);
  return ammoDash(n, ak ? am[side === 'L' ? AK_ON.left : AK_ON.right] : W8.mag[id] || 0)[0];
}
// the struck-out stretch of the stamina arc: short slashes from `from` along `len` of it, like the bar's hazard stripes
function cutDash(from, len) {
  const n = Math.max(1, Math.floor(len / 2.6)), seg = len / n;
  return `0 ${from.toFixed(2)} ` + Array(n).fill(`${(seg * 0.55).toFixed(2)} ${(seg * 0.45).toFixed(2)}`).join(' ') + ' 0 999';
}
function ammoDash(n, filled) {
  const A = ARC();
  if (n > 40) return [`${(A * filled / n).toFixed(2)} 999`, `${A.toFixed(2)} 999`];
  const seg = A / n, d = (seg * 0.7).toFixed(2), g = (seg * 0.3).toFixed(2);
  const fg = filled ? Array(filled).fill(d + ' ' + g).join(' ') + ' 0 999' : '0 999';
  return [fg, Array(n).fill(d + ' ' + g).join(' ') + ' 0 999'];
}
// the melee brackets' springs: their size (s) and twist (r, in degrees), and the cooldown they're recovering against
// XHM_TWIST: how many times harder than the camera's roll the brackets twist
const XHM = { s: 1, vs: 0, r: 0, vr: 0, cd: 0, max: 0, ready: true }, XHM_TWIST = 12;
// the warning under the crosshair: its numbers ("Loading 3/6") roll like the HUD's counters (ui/hud-text.js); text
// with a key cap in it, and the bandaging percentage (plain), are just written
function awText(aw, t, plain) {
  let sp = aw.firstElementChild; if (!sp || !sp.classList.contains('aw')) { aw.innerHTML = '<span class="aw"></span>'; sp = aw.firstElementChild; }
  if (plain || t.includes('<')) { sp._rt = sp._roll = null; sp.innerHTML = t; } else rollText(sp, t);
}
// the crosshair: spread ticks, ammo arc, reload ring, melee ring, stamina arc
// whether a shot from your muzzle would be stopped short of where you're aiming: something that stops bullets (a wall, a
// tall prop: bulletBlocked) on the line before the cell the cursor's on. Zombies, boards and the low furniture you shoot
// across don't count; aiming at a wall itself doesn't either (that's what you'd hit)
function blockedShot() {
  // the gun's muzzle itself jammed into a wall or past a corner (muzzle(), weapons/firing.js, falls back to just in front
  // of you then): blocked whatever you're aiming at
  { const len = MUZ[W8.cur] || 0.9, tx = P.x + Math.sin(P.aim) * len, tz = P.z + Math.cos(P.aim) * len; if (bulletBlocked(tx, tz) || !los(P.x, P.z, tx, tz)) return true; }
  const m = muzzle(), dx = aimPt.x - m.ox, dz = aimPt.z - m.oz, L = Math.hypot(dx, dz); if (L < 0.3) return false;
  const ux = dx / L, uz = dz / L, ti = ci(aimPt.x), tj = ci(aimPt.z);
  if (thinRay(m.ox, m.oz, ux, uz, L) < L - 0.05) return true;   // an inside wall on the way (world/thin-walls.js)
  for (let t = 0.1; t < L; t += 0.1) { const x = m.ox + ux * t, z = m.oz + uz * t; if (bulletBlocked(x, z)) return !(ci(x) === ti && ci(z) === tj); }
  return false;
}
const xhX = $('xhX');
const XH_SPRINT = 0.45, _xhP = [0, 0];   // how far down the gun's come (ANIM.ready) when the crosshair's quite gone
// from your own eyes a gun's crosshair is out in the world, on whatever your line of sight meets (VCAM.aimD): drawn as big as
// it would be at ref metres off, so it grows as you come right up to a wall or a zombie and eases back down further
// off (between min and max of its size, eased at ease a second); and when the gun's blocked nearer than that (its muzzle
// up against a wall, a corner between it and what you're looking at), it slides to where the round would really hit,
// the point it'd stop at, eased at slide
const XH_WORLD = { ref: 2.4, min: 1, max: 1.75, ease: 12, slide: 16 };
const XHW = { s: 1, k: 0, x: 0, y: 0 }, _xwA = new V3(), _xwB = new V3();
// where a round from the muzzle toward what you're looking at would stop, on the screen (out: [x, y] pixels), or false
function shotStop(out) {
  const m = muzzleWorld(); if (!Number.isFinite(m.x)) return false;
  _xwA.copy(m); _xwB.set(aimPt.x, VCAM.aimY, aimPt.z).sub(_xwA);
  const L = Math.hypot(_xwB.x, _xwB.z); if (L < 0.05) return false;
  const ux = _xwB.x / L, uz = _xwB.z / L; let t = bulletBlocked(m.x, m.z) ? 0 : L;
  if (t) { t = thinRay(m.x, m.z, ux, uz, L); for (let q = 0.05; q < t; q += 0.05) if (bulletBlocked(m.x + ux * q, m.z + uz * q)) { t = q; break; } }
  _xwA.addScaledVector(_xwB, t / L).project(FP_CAM);   // (as far along it in the air as across the ground) if (_xwA.z > 1) return false;
  out[0] = (_xwA.x + 1) / 2 * innerWidth; out[1] = (1 - _xwA.y) / 2 * innerHeight; return true;
}
const _xwS = [0, 0];
export function updateCrosshair(rdt, D) {
  const showXh = state === 'play' && hasMouse && !usingTouch && !scoped && !freeOn() && !fpSighted();   // (none flying the free camera, nor down the sights in first person, where the sights are what you aim with: game/view-cam.js)
  // (hidden, a finished reload's flash is put out: shown again, the browser would play it over again, a pop each time
  // you come off the sights)
  if (!showXh && !xh.hidden) { hitMarkOff(); Object.values(RL).forEach(r => [r.ring, r.head, r.track].forEach(el => el.classList.remove('done', 'tick'))); $('xhRPing').classList.remove('tick'); }   // (the ping at the arc's end too: its pop would play again as it's shown)
  if (showXh && xh.hidden) hitMarkOff();   // (and anything marked as it was put away cleared as it comes back)
  xh.hidden = !showXh;
  if (showXh) {
    xhAt(_xhP);   // on the cursor, or wandering off it at low health (player/shaky-hands.js), and from your own eyes kicked with the gun (game/view-cam.js)
    // (from your own eyes, out in the world: XH_WORLD)
    { const fp = fpOn() && !D.melee, W_ = XH_WORLD, ts = fp ? clamp(W_.ref / Math.max(0.3, VCAM.aimD), W_.min, W_.max) : 1, stop = fp && cache.xhX && shotStop(_xwS);   // (not a melee weapon's: it stays its size, in the middle)
      XHW.s += (ts - XHW.s) * Math.min(1, rdt * W_.ease);
      if (stop) { if (XHW.k < 0.01) { XHW.x = _xwS[0]; XHW.y = _xwS[1]; } else { const k = Math.min(1, rdt * W_.slide); XHW.x += (_xwS[0] - XHW.x) * k; XHW.y += (_xwS[1] - XHW.y) * k; } }
      XHW.k += ((stop ? 1 : 0) - XHW.k) * Math.min(1, rdt * W_.slide);
      const x = _xhP[0] + (XHW.x - _xhP[0]) * XHW.k, y = _xhP[1] + (XHW.y - _xhP[1]) * XHW.k;
      xh.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)` + (Math.abs(XHW.s - 1) > 0.005 ? ` scale(${XHW.s.toFixed(3)})` : ''); }
    // from your own eyes it fades out as the gun comes down for a sprint (it can't fire there), and back as it comes up
    { const f = fpOn() ? (1 - smooth(clamp((ANIM.ready || 0) / XH_SPRINT, 0, 1))).toFixed(2) : '1'; if (cache.xhRun !== f) { cache.xhRun = f; xh.style.opacity = f; } }
    xh.classList.toggle('healing', P.bandT > 0 || ANIM.bandDone > 0);   // both hands are on the bandage: no reticle, just the ring filling
    const id = curId();
    { const bx = !D.melee && !(P.bandT > 0) && blockedShot(); if (cache.xhX !== bx) { cache.xhX = bx; xhX.classList.toggle('on', bx); xh.classList.toggle('blocked', bx); } }   // (the whole reticle goes red with it)
    // shotguns get a ring the width of their spread, drawn by the shell they're loaded with (SG_XH); other guns four ticks
    const sgk = !D.melee && D.ammo === 'shells' ? SG_XH[roundOn(id)] === undefined ? 'ring' : SG_XH[roundOn(id)] : null, sg = !!sgk;
    $('xhTicks').style.display = D.melee || sg ? 'none' : ''; $('xhSg').toggleAttribute('hidden', sgk !== 'ring'); xhFl.toggleAttribute('hidden', sgk !== 'needle'); $('xhDb').toggleAttribute('hidden', sgk !== 'tri'); $('xhMelee').toggleAttribute('hidden', !D.melee); $('xhDot').style.display = D.melee ? 'none' : '';
    // stamina under the reticle, with any weapon: it shows as soon as you use some (a swing, a shove, a vault) and fades
    // away once it's full again
    {
      const sd = ANIM.stamD, st = $('xhStam'), sm = stamMax(), cls = P.exh ? 'st exh' : sd < 0.35 * sm ? 'st tired' : 'st', on = P.stam < 0.995 * sm || P.exh;
      if (on || cache.xhSt !== false) {
        st.setAttribute('stroke-dasharray', `${(sd * M_ARC()).toFixed(2)} 999`); $('xhStamBg').setAttribute('stroke-dasharray', `${M_ARC().toFixed(2)} 999`);
        // what you've used, just past it, as on the bar under your health (stamDrain, ui/hud.js)
        const sr = $('xhStamRun'); sr.setAttribute('stroke-dasharray', `0 ${(sd * M_ARC()).toFixed(2)} ${(ANIM.drainD * M_ARC()).toFixed(2)} 999`);
        const rc = 'stRun' + (ANIM.drainSt ? ' ' + ANIM.drainSt : ''); if (sr.getAttribute('class') !== rc) sr.setAttribute('class', rc);
        // and what a Broken stride took, for good, at the end of the arc: struck out (upgrades/sacrifice.js)
        const sc = $('xhStamCut'); sc.toggleAttribute('hidden', sm >= 1); if (sm < 1) sc.setAttribute('stroke-dasharray', cutDash(sm * M_ARC() + 3.2, (1 - sm) * M_ARC() - 3.2));
      }
      if (st.getAttribute('class') !== cls) st.setAttribute('class', cls);
      if (cache.xhSt !== on) { cache.xhSt = on; $('xhStamG').classList.toggle('on', on); }
    }
    // the brackets pinch in and dim through the swing's recovery and ease back out as it comes back, with a soft pop
    // when it's ready; they twist with the camera as a swing rolls it, the same way the picture turns but much harder,
    // snapping round and back. Recovery runs against the cooldown the swing started with (a tired swing's is longer), so
    // they always open from fully in
    if (W8.cd > XHM.cd + 1e-4) XHM.max = W8.cd;
    XHM.cd = W8.cd;
    if (D.melee) {
      const rd = XHM.max > 0 ? 1 - clamp(W8.cd / XHM.max, 0, 1) : 1, ready = rd >= 1;
      if (ready && !XHM.ready) XHM.vs += 0.9;
      XHM.ready = ready;
      const sT = 0.62 + 0.38 * smooth(rd), rT = clamp(camRoll * 57.3 * XHM_TWIST, -40, 40);
      for (let t = Math.min(rdt, 0.1); t > 1e-6; t -= 1 / 120) {
        const h = Math.min(t, 1 / 120);
        XHM.vs += ((sT - XHM.s) * 260 - XHM.vs * 22) * h; XHM.s += XHM.vs * h;
        XHM.vr += ((rT - XHM.r) * 900 - XHM.vr * 38) * h; XHM.r += XHM.vr * h;   // stiff: quick to snap round, a small overshoot
      }
      const k = XHM.s.toFixed(3) + ':' + XHM.r.toFixed(1) + ':' + Math.round(rd * 50);
      if (cache.xhBr !== k) { cache.xhBr = k; const b = $('xhBr'); b.setAttribute('transform', `rotate(${XHM.r.toFixed(1)}) scale(${XHM.s.toFixed(3)})`); b.style.opacity = (0.45 + 0.55 * smooth(rd)).toFixed(2); }
    }
    // bandage ring: shown only while a bandage is going on, filling as it does, and full for a moment once it's done
    // (or stopped at full health: BAND_DONE, player/bandages.js), so it always ends at 100%
    const bandPct = P.bandT > 0 ? clamp(1 - P.bandT / (P.bandMax || 1), 0, 1) : ANIM.bandDone > 0 ? 1 : -1;
    { const L = 2 * Math.PI * 23, band = bandPct >= 0, hp = Math.max(0, bandPct);
      const hk = band ? String(Math.round(hp * 200)) : '';
      if (cache.xhHeal !== hk) { cache.xhHeal = hk; const el = $('xhHeal'); el.setAttribute('stroke-dasharray', `${(clamp(hp, 0, 1) * L).toFixed(1)} 999`); el.style.opacity = band ? 1 : 0; $('xhHealBg').style.opacity = band ? 1 : 0; } }
    if (bandPct >= 0) { const aw = $('ammoWarn'), t = 'Bandaging ' + Math.round(bandPct * 100) + '%'; if (cache.aw !== 'heal' + t) { cache.aw = 'heal' + t; aw.hidden = false; aw.classList.remove('low', 'out', 'loading'); aw.classList.add('heal'); awText(aw, t, true); } }
    else if (cache.aw && cache.aw.startsWith('heal')) { cache.aw = null; $('ammoWarn').classList.remove('heal'); $('ammoWarn').hidden = true; }
    if (D.melee && cache.aw && bandPct < 0) { cache.aw = ''; $('ammoWarn').hidden = true; }
    xhAmmo.style.display = xhAmmoBg.style.display = RL.R.track.style.display = RL.R.head.style.display = xhRing.style.display = D.melee ? 'none' : '';
    const ak = !D.melee && !!D.akimbo; [xhAmmoL, xhAmmoBgL, xhRingL, RL.L.track, RL.L.head].forEach(c => c.toggleAttribute('hidden', !ak));
    setBloom(bloom * Math.exp(-rdt * 9));
    const mz = muzzle();
    projV.set(mz.ox, GUN_Y, mz.oz).project(cam);
    const px = (projV.x + 1) / 2 * innerWidth, py = (1 - projV.y) / 2 * innerHeight;
    // (how far the spread opens on the screen: by the cursor's distance from the muzzle, or in first person by the view's own angle)
    const dpx = fpOn() ? innerHeight / 2 / Math.tan(FP_CAM.fov * Math.PI / 360) : Math.hypot(mouseX - px, mouseY - py);
    // (from your own eyes a shotgun's ring is drawn where its pattern really goes, SG_FP.ring of its spread: weapons/firing.js)
    const fpPat = fpOn() && !D.melee && (D.pellets || 1) > 1 ? SG_FP.ring : 1;
    const target = clamp(5 + Math.tan(D.melee ? 0 : scopeUse() ? scopeSpread(id, scopeDist()) : spreadOf(id) * fpPat) * dpx + bloom, 5, sg ? XH_SG_MAX : 56);   // through a scope it tightens with range; a shotgun's ring can open wider, to show the whole pattern on the move
    gapCur += (target - gapCur) * Math.min(1, rdt * 18);
    const gap = Math.round(gapCur * 2) / 2, xk = gap + (D.melee ? 'm' : sg ? 's' : 't');
    if (gap !== lastGap) { lastGap = gap; tks.forEach((t, k) => t.setAttribute('transform', `rotate(${k * 90}) translate(0,${-gap})`)); xhSpread.setAttribute('r', gap); sgRing(gap); flRing(gap); dbRing(gap); }
    if (xk !== lastXh) {
      lastXh = xk;
      const outer = D.melee ? 17.5 : sg ? gap + 2.2 : gap + TICK_L;   // the melee brackets at full stretch, the shotgun's arcs, or the ticks' tips
      aR = Math.max(30, outer + XH_CLEAR.a); sR = Math.max(22, outer + XH_CLEAR.s);
      [xhAmmo, xhAmmoBg, xhRing, xhAmmoL, xhAmmoBgL, xhRingL, RL.R.track, RL.L.track].forEach(c => c.setAttribute('r', aR)); xhGl.setAttribute('r', aR + 6); $('xhStam').setAttribute('r', sR); $('xhStamBg').setAttribute('r', sR); $('xhStamRun').setAttribute('r', sR); $('xhStamCut').setAttribute('r', sR);
      $('ammoWarn').style.top = (80 + Math.max(38, sR + 16)) + 'px'; xh.style.setProperty('--ar', aR + 'px'); cache.ammoKey = null;
    }
    xhSpread.style.opacity = gap > 9 && !sg ? 1 : 0;
    let tgt = false;
    if (!D.melee) { const hz = aimRay(mz.ox, mz.oz, mz.a, 22).z; tgt = !!hz && zInView(hz); }   // (only one you can see: not off the screen, in the dark or behind a wall)
    else tgt = zombies.some(z => { const th = z.atkBoard && Math.hypot(z.atkBoard.x - P.x, z.atkBoard.z - P.z) < 1.5 ? 0.75 : 0; return Math.hypot(z.x - P.x, z.z - P.z) < D.range + z.T.r + th && Math.abs(angDiff(Math.atan2(z.x - P.x, z.z - P.z), P.aim)) < D.arc + (th ? 0.25 : 0); });
    xh.classList.toggle('tgt', tgt);
    if (!D.melee) {
      // two guns: each arc is its own gun's mag (the one on your right on the right, AK_ON), each turning yellow under a quarter
      const am = ak && akMags(id), n = ak ? akPer(id) : magCap(id), have = ak ? am[AK_ON.right] : W8.mag[id] || 0, haveL = ak ? am[AK_ON.left] : 0, key = n + ':' + have + ':' + aR + (ak ? ':' + haveL : '');
      const healing = bandPct >= 0, lowAt = Math.max(1, n * 0.25);
      if (cache.ammoKey !== key) {
        cache.ammoKey = key; const [fg, bg] = ammoDash(n, have); xhAmmo.setAttribute('stroke-dasharray', fg); xhAmmoBg.setAttribute('stroke-dasharray', bg);
        if (ak) { const [fgL, bgL] = ammoDash(n, haveL); xhAmmoL.setAttribute('stroke-dasharray', fgL); xhAmmoBgL.setAttribute('stroke-dasharray', bgL); xhAmmoL.classList.toggle('low', haveL <= lowAt); }
        xhAmmo.classList.toggle('low', have <= lowAt);
      }
      // (a reload's finishing flash kept to the arc as it is now: the same rounds, the same size as the crosshair opens or
      // closes under it)
      for (const [side, arc] of [['R', xhAmmo], ['L', xhAmmoL]]) { const rg = RL[side].ring; if (rg.classList.contains('done')) { const d = arc.getAttribute('stroke-dasharray'); if (rg.getAttribute('stroke-dasharray') !== d) rg.setAttribute('stroke-dasharray', d); } }
      // yellow under a quarter, red and asking for a reload when empty. With two guns it's both mags together: low once
      // they add up to a quarter or less, and "No ammo" (with the reload key, if there's any to load) only when both are
      // empty; a single empty gun is shown by its own arc flashing red
      const res = W8.reserve[D.ammo] || 0, aw = $('ammoWarn'), tot = W8.mag[id] || 0, dry = ak ? am.L === 0 && am.R === 0 : have === 0;
      // while reloading the same spot reads "Reloading", or counts the shells going in
      const mode = W8.reloading ? 'loading' : dry ? (res > 0 ? 'reload' : 'none') : tot <= Math.max(1, Math.floor(magCap(id) * 0.25)) ? 'low' : '';
      const txt = mode === 'loading' ? (W8.reloading === 'shell' ? `Loading ${W8.shellsIn}/${W8.shellsNeed}` : 'Reloading') : mode === 'low' ? 'Low ammo' : mode === 'reload' ? (ak ? 'No ammo ' + kbd('reload') + '' : 'Reload ' + kbd('reload') + '') : mode === 'none' ? 'No ammo' : '';
      if (!healing && cache.aw !== mode + txt) {
        cache.aw = mode + txt; aw.hidden = !mode;
        aw.classList.remove('low', 'out', 'loading', 'heal'); if (mode) aw.classList.add(mode === 'low' || mode === 'loading' ? mode : 'out');
        awText(aw, txt);
      }
    }
    let rp = 0;
    if (ak) {
      // each gun's ring fills through its own turn, and only its arc dims while it's down being reloaded; a gun running low
      // pulses its arc yellow, and an empty one flashes its whole arc red until it's reloaded
      const am2 = akMags(id), lowA = Math.max(1, akPer(id) * 0.25);
      for (const [s, side, arc, bg] of [[AK_ON.right, 'R', xhAmmo, xhAmmoBg], [AK_ON.left, 'L', xhAmmoL, xhAmmoBgL]]) {
        const busy = akBusy(s), n = am2[s]; reloadDraw(side, busy, busy ? akU(s) : 0); arc.style.opacity = busy ? 0.25 : 1;
        arc.classList.toggle('flash', n > 0 && n <= lowA && !busy); bg.classList.toggle('out', n === 0 && !busy);
      }
    } else {
    xhAmmo.classList.remove('flash'); xhAmmoBg.classList.remove('out');
    // a shell at a time: by time, through to the gun closed or racked after (weapons/reload.js: relRingP)
    const sp = relRingP(), on = W8.reloading === 'mag' || sp >= 0;
    if (W8.reloading === 'mag') { const kn = W8.reloadMax - relUnseen(); rp = clamp((W8.reloadMax - W8.reloadT) / Math.max(kn, 1e-3), 0, 1); } else if (sp >= 0) rp = sp;   // (a fumble's time only once it's happened: relUnseen)
    reloadDraw('R', on, rp, rdt); reloadDraw('L', false, 0, rdt);
    xhAmmo.style.opacity = on ? 0.25 : 1;
    }
    const glArc = 2 * Math.PI * (aR + 6) * (84 / 360);
    xhGl.style.display = D.gl ? '' : 'none';
    if (D.gl) xhGl.setAttribute('stroke-dasharray', (glArc * (1 - W8.glCd / (D.glRecharge || 6))).toFixed(1) + ' 999');
  }
}
// a zombie you can actually see: in sight (the fog of war's vis, lighting/vision.js) and on the screen
const _xhV = new V3();
function zInView(z) { if (z.vis !== undefined && z.vis < 0.35) return false; _xhV.set(z.x, 1, z.z).project(cam); return onScreen(_xhV) && Math.abs(_xhV.x) < 0.98 && Math.abs(_xhV.y) < 0.98; }
