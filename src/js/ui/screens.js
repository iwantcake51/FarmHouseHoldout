// Title, pause and death screens, starting a run and dying.

import { wallBloodClear } from '../effects/wall-blood.js';
import { $, smoothWheel } from '../core/dom.js';
import { cv, scene, setZoom, setZoomT, ZOOM_MAX, zoomT } from '../core/renderer.js';
import { angDiff, cache, clamp, rr, setLast, smooth } from '../core/math.js';
import { mistReset } from '../world/mist.js';
import { NET, netAllReady, netLeave, netLink, netReady, netSend, netStart } from '../net/net.js';
import { cxw } from '../world/grid.js';
import { PAINT_FADE, stepPaint } from '../world/house.js';
import { houseLayout } from '../world/interior.js';
import { P } from '../player/player.js';
import { rollLook, spawnLook } from '../player/look.js';
import { clearBodyBlood } from '../effects/body-blood.js';
import { SLOTS } from '../weapons/slots.js';
import { curId, freshRun, run, S, stamMax, W, W8 } from '../game/run-state.js';
import { SET } from './settings.js';
import { gunMeshes } from '../weapons/gun-materials.js';
import { buildGuns } from '../weapons/build-weapons.js';
import { casings, mags } from '../weapons/casings.js';
import { smokes } from '../effects/smoke.js';
import { bloodMapClear } from '../effects/blood-map.js';
import { clearDrops, gibs, parts } from '../effects/particles.js';
import { dropCopy, makeDrop } from '../effects/weapon-drop.js';
import { clearHoles } from '../effects/bullet-holes.js';
import { pickups } from '../pickups/pickups.js';
import { ragdolls } from '../zombies/deaths.js';
import { zombies } from '../zombies/zombie-types.js';
import { zFree } from '../zombies/zombie-kit.js';
import { setTimeScale } from '../game/hit-feedback.js';
import { clearArmorBits } from '../zombies/armor-break.js';
import { grenades } from '../weapons/explosives.js';
import { resetBoards, setFlowDirty } from '../barricades/planks.js';
import { closeStation } from '../stations/station-ui.js';
import { AC, audioInit, muff } from '../audio/audio.js';
import { SFX } from '../audio/sfx.js';
import { musicLeave } from '../audio/music.js';
import { setCamPunch, setHurtFx, setStateRaw, setTod, state } from '../game/state.js';
import { keys, setMouseDown, setMouseDownR } from '../input/keyboard-mouse.js';
import { exitScope } from '../player/aiming.js';
import { beginBreak } from '../waves/waves.js';
import { renderHistory } from '../upgrades/upgrade-screen.js';
import { renderRunStats, runStat } from './run-stats.js';
import { INTRO, startIntro } from '../game/intro.js';
import { feedItems, floats } from './hud-text.js';
import { titleSky } from '../lighting/day-night.js';
import { resetDrops } from '../stations/supply-drop.js';
import { clearSpit } from '../zombies/spitter.js';
import { clearBursts } from '../zombies/elites.js';
import { quitPull, wantLock } from '../game/view-cam.js';
import { resetHeart } from './vitals.js';
import { ragYou, unragYou } from '../player/player-ragdoll.js';
import { ANIM } from '../player/animation.js';
import { SL_DROPS } from '../player/hold-loaders.js';
import { setBleedVig, setHitVig, setHitVigUp } from './hud.js';
import { benchTipsStart } from './bench-tips.js';
import { clearGear, renderBought } from './gear-popup.js';
import { cheatSaves } from './cheats.js';
import { netDown, netRunStart, nr, turnedDown } from '../net/sync.js';
import { toggleCoop } from '../net/lobby.js';
import { setWarmQ } from '../game/loop.js';
import { clearScreenBlood } from './screen-blood.js';

// the death camera's timings and where it's up to (below: startDeath, tickDeathCine). Up here, as a new run clears it
const DEATH_CINE = { push: 0.55, pushT: 3.2, roll: 0.07, vig: 0.85, vigT: 2.4, spec: 2.3, black: 0.55 };
export const DC = { on: false, t: 0, side: 1, spec: false, fading: false, z0: 1 };

let best = 0;
try { best = +localStorage.getItem('kessler-best') || 0; } catch (e) {}
['pHist', 'upHist', 'pBuy'].forEach(id => smoothWheel($(id)));   // the history lists scroll smoothly too
const showBest = () => { const t = best ? 'Best run: wave ' + best : ''; $('best').textContent = t; $('deadBest').textContent = t; };
showBest();
export function setState(s) {
  setStateRaw(s);
  if (s !== 'play') exitScope();
  ['title', 'upgrade', 'paused', 'dead'].forEach(id => $(id).hidden = id !== s);
  ['waveBox', 'vitals', 'arms', 'moodles'].forEach(id => $(id).hidden = s === 'title');
  $('scrim').style.opacity = s === 'title' ? 0.22 : 1;
  document.body.classList.toggle('playing', s === 'play');
  document.body.classList.toggle('menu', s === 'paused' || s === 'upgrade');   // the HUD dims behind a menu (styles/screens.css)
  if (s !== 'play') { closeStation(); $('prompt').classList.remove('on'); cache.promptOn = false; }
  if (s === 'paused') { renderHistory('pHist', 'pHistN'); renderBought('pBuy', 'pBuyN'); }
  if (s === 'upgrade') renderHistory('upHist', 'upHistN');
  if (s === 'play') { setLast(performance.now()); cv.focus({ preventScroll: true }); }
  keys.clear(); setMouseDown(false); setMouseDownR(false);
}
// wipe the farm back to a fresh run: bodies, drops, debris, boards, stats, your character
function resetRun(keepLook) {
  houseLayout(NET.on && NET.inGame && NET.houseSeed != null ? NET.houseSeed : (Math.random() * 2147483647) | 0, true);   // a new floor plan (world/interior.js), the host's in co-op
  zombies.forEach(z => { scene.remove(z.m.g); zFree(z.m.g); if (z.blob) scene.remove(z.blob); }); zombies.length = 0;
  ragdolls.forEach(r => { scene.remove(r.g); zFree(r.g); if (r.blob) scene.remove(r.blob); }); ragdolls.length = 0; unragYou(); clearArmorBits();
  gibs.forEach(g => { scene.remove(g.m); zFree(g.m); }); gibs.length = 0;
  grenades.forEach(g => scene.remove(g.m)); grenades.length = 0; clearSpit(); clearBursts();
  pickups.forEach(p => scene.remove(p.g)); pickups.length = 0;
  resetDrops();   // nothing on its way, no flare (stations/supply-drop.js)
  bloodMapClear(); wallBloodClear(); clearBodyBlood(); clearDrops(); parts.forEach(p => { p.m.visible = false; p.life = 0; }); casings.concat(mags, SL_DROPS).forEach(c => { c.g.visible = false; c.life = 0; }); smokes.forEach(p => { p.life = 0; p.m.visible = false; });
  resetBoards(); clearHoles(); freshRun(); if (!keepLook && !NET.on) rollLook(spawnLook()); buildGuns();   // a new look for every run, or the one you're keeping (player/look.js: spawnLook, made in the title's Character menu); the title already dealt one (in co-op you keep the one your teammates have)
  deathCineEnd(); mistReset();
  clearScreenBlood(); P.shoveN = 0; P.shoveLast = undefined; P.x = cxw(21); P.z = cxw(22); P.hp = S.maxHp; P.blood = 0; P.bleed = 0; P.bloodFeet = 0; P.shock = 0; P.shockStun = 0; ANIM.bandSwitch = null; P.stam = stamMax(); P.exh = false; P.stamT = 9; P.runDebt = 0; P.runT = 9; P.spdF = 1; P.fatigued = false; P.sprint = false; P.sprintLock = false; P.skid = 0; P.pivot = null; P.fireQ = null; P.pushT = 0; P.runUp = 0; P.carveW = 0; ANIM.sprintK = ANIM.ready = ANIM.readyV = ANIM.faceK = ANIM.skidK = ANIM.pivK = ANIM.scrK = ANIM.bobK = ANIM.pivBank = ANIM.bobSlow = ANIM.rgK = ANIM.rgT = ANIM.vrgT = 0; P.band = 0; P.bandT = 0; P.wraps = 0; P.heal = 0; P.conc = 0; P.kbx = P.kbz = 0; P.dead = false; P.deathT = 0; P.hitFrom = undefined; document.body.classList.remove('dying'); if (ANIM.dropped) { scene.remove(ANIM.dropped.g); ANIM.dropped = null; } P.aim = Math.PI; P.vault = null; P.slow = P.stun = P.adr = P.eye = 0; P.adrCd = 0; setTod(15);
  P.shove = null; P.shoveCd = 0; P.vaultHeat = 0; ANIM.land = 0; ANIM.shoveHit = 0; INTRO.t = -1; benchTipsStart();
  setZoomT(ZOOM_MAX); setHurtFx(0); setFlowDirty(true); setTimeScale(1); setCamPunch(0);   // the intro glides in all the way to the closest zoom
  $('feed').innerHTML = ''; feedItems.length = 0; clearGear();
  floats.forEach(f => f.el.remove()); floats.length = 0;
  netRunStart();   // (co-op: net/sync.js)
}
// soft: straight off the title, where the survivor you see is the one you play, so the camera glides down from the
// title shot without a cut; dark: it's coming up out of black instead (cineRun), so it glides in from high up, and the
// new house's paint is on already
function newRun(soft, dark) {
  audioInit(); resetRun(soft);
  run.noPerks = (netLink() ? NET.runMode : SET.mode) === 'noperks';   // (no-perk mode, picked on the title or in the co-op lobby, the host's: no cards between waves, waves/waves.js)
  // build every shader now, behind the intro's dark veil, so the first blood, ragdoll or spark never stalls a frame
  // (game/loop.js: warmShaders, on the next frame's targets)
  setWarmQ(true);
  setState('play'); beginBreak(10);
  if (dark) stepPaint(PAINT_FADE * 2);
  startIntro(soft && !dark);   // game/intro.js: the camera glides in, you get up off one knee, then the night is announced
}
// back to the title from the death screen, with the farm reset behind it
function backToMenu() {
  resetRun(); deathCineEnd(); titleSky(); setState('title'); $('title').scrollTop = 0;
  if (NET.on) { NET.inGame = false; toggleCoop(true); }   // still in a co-op game: back in its lobby
  // the HUD stops updating on the title, so clear the dying screen effects by hand
  cv.style.filter = ''; cache.grey = null; ['hurt', 'lowTint', 'slowmo', 'eyeVig', 'healVig', 'conc', 'hitVig', 'bleedVig', 'nearVig'].forEach(id => { $(id).style.opacity = 0; }); setHitVig(0); setBleedVig(0); cache.nearVig = null; setHitVigUp(false); resetHeart(); cache.hitVig = cache.bleedVig = cache.bleeding = null; $('vitals').classList.remove('bleed'); cache.redTint = null;
  if (muff && AC) muff.frequency.setTargetAtTime(20000, AC.currentTime, 0.1);
}
// Moving between the title and a run is never a cut: the screen you're on slides away, and wherever the farm has to be
// reset behind your back it happens under a dip to black (#fadeVeil) that lifts once the new scene has drawn.
let switching = false;
const SWITCH_MS = 480;
function veil(on) { $('fadeVeil').classList.toggle('on', on); }
function switchScreens(dark, fn) {
  if (switching) return; switching = true;
  const from = $(state); if (from) from.classList.add('leaving');
  $('title').classList.remove('arrive');
  if (dark) veil(true);
  setTimeout(() => {
    if (from) from.classList.remove('leaving');
    fn();
    // two frames, so the new view has been drawn once before the dark lifts
    requestAnimationFrame(() => requestAnimationFrame(() => { veil(false); switching = false; }));
  }, SWITCH_MS);
}
const saveBest = () => { if (run.wave > best) { best = run.wave; try { localStorage.setItem('kessler-best', best); } catch (e) {} showBest(); } };
// start a run: off the title it's a cut through black (cineRun), so the new house and yard are never seen swapping in
// for the title's; after a death it dips to black. In a co-op lobby only the host starts it, for everyone (net/net.js)
export function enterRun() { if (NET.on && !NET.inGame) { if (NET.host) { if (netAllReady()) wantLock(true); netStart(); } else netReady(!NET.ready); return; } audioInit(); wantLock(true); if (state === 'title') cineRun(); else switchScreens(true, () => newRun(false)); }
// off the title, cinematically. Start pressed: the menu drifts away line by line, the title camera starts a slow push
// in on the farm (CINE.push: how far in, as a share of its zoom) as a vignette closes round it and letterbox bars come
// in, and the picture dims to black (from CINE.dim ms in, over the rest of CINE.out); the music's been fading since
// the press (audio/music.js: musicLeave), timed to be gone halfway through the glide down onto you. In the dark the run
// is set up (the new farm, every shader built); after a held beat (hold) it opens slowly out of black and out of a
// soft blur (CINE.blur ms) on the intro's glide down, the vignette lifting and the bars drawing back as you get up
const CINE = { out: 1700, dim: 450, hold: 450, bars: 1600, push: 0.3, blur: 1700 };
let cineT0 = 0;
// the title camera's push in once Start's pressed (game/camera.js): an ease in, so it gathers pace into the dark
export const cinePush = () => cineT0 ? 1 + CINE.push * Math.pow(clamp((performance.now() - cineT0) / CINE.out, 0, 1), 2) : 1;
function cineRun() {
  if (switching) return; switching = true;
  const t = $('title'); t.classList.add('leaving', 'cineOut'); t.classList.remove('arrive');
  cineT0 = performance.now(); document.body.classList.add('cineGo');
  musicLeave((CINE.out + CINE.hold) / 1000 + INTRO.cam * 0.5);
  $('fadeVeil').classList.add('cine'); $('cineBars').classList.add('on');
  setTimeout(() => veil(true), CINE.dim);
  setTimeout(() => {
    t.classList.remove('leaving', 'cineOut'); cineT0 = 0;
    cv.classList.add('cineBlur');   // (out of focus while it's dark, sharpening as the dark lifts)
    newRun(true, true);
    // (two frames, so the new view's been drawn, then the held beat)
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      veil(false); switching = false;
      cv.classList.add('cineSharp'); cv.classList.remove('cineBlur'); document.body.classList.remove('cineGo');
      setTimeout(() => cv.classList.remove('cineSharp'), CINE.blur + 100);
      setTimeout(() => $('cineBars').classList.remove('on'), CINE.bars * 0.5);
      setTimeout(() => $('fadeVeil').classList.remove('cine'), CINE.bars * 1.8);
    }, CINE.hold)));
  }, CINE.out);
}
// to the title: a dip to black, and the menu comes in piece by piece as it lifts
export function leaveToMenu() { switchScreens(true, () => { backToMenu(); $('title').classList.add('arrive'); }); }
// the pause screen fades in and out instead of snapping
export function pauseRun() { if (state !== 'play' || P.dead || switching) return; $('quitBtn').hidden = netLink(); setState('paused'); }   // (in co-op the farm goes on while you're paused, and there's no abandoning it for the others)
export function resumeRun() {
  const el = $('paused'); if (state !== 'paused' || switching || el.classList.contains('closing')) return;
  cancelLeave();
  wantLock();   // (in first person the mouse is taken straight back, without a click: game/view-cam.js)
  el.classList.add('closing'); setTimeout(() => { el.classList.remove('closing'); if (state === 'paused') setState('play'); }, 180);
}
$('pauseX').onclick = () => resumeRun();   // (the cross on the pause screen: as Resume)
$('startBtn').onclick = enterRun;
$('againBtn').onclick = enterRun;
$('menuBtn').onclick = leaveToMenu;
// leaving a run from the pause screen asks first: the buttons give way to the question, and a yes, or a cancel (Esc)
// that puts them back
const P_SURE = {
  menu: { q: 'Leave for the main menu? This run will be lost.', yes: 'Leave run', go: () => { saveBest(); if (netLink()) netLeave(); leaveToMenu(); } },
  quit: { q: 'Abandon this run? It ends here, as if you fell.', yes: 'Abandon', go: () => { quitPull(); die(); } }   // (from your own eyes, the view drawn back out over you: game/view-cam.js)
};
let pSure = null;
function askLeave(k) { pSure = k; $('pSureQ').textContent = P_SURE[k].q; $('pSureYes').textContent = P_SURE[k].yes; $('pBtns').hidden = true; $('pSure').hidden = false; $('pSureNo').focus({ preventScroll: true }); }
export function cancelLeave() { if (!pSure) return false; pSure = null; $('pSure').hidden = true; $('pBtns').hidden = false; return true; }
$('pMenuBtn').onclick = () => askLeave('menu');
$('quitBtn').onclick = () => askLeave('quit');
$('pSureYes').onclick = () => { const k = pSure; cancelLeave(); if (k) P_SURE[k].go(); };
$('pSureNo').onclick = cancelLeave;
$('resumeBtn').onclick = resumeRun;
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });
// the first look at the farm comes up out of the dark too
requestAnimationFrame(() => requestAnimationFrame(() => { veil(false); $('title').classList.add('arrive'); }));
// the run ends PZ-style: you go down where you stand, the HUD drains away, they close in, then the tally
export function startDeath() {
  if (cheatSaves()) return;   // god mode (ui/cheats.js)
  runStat('downs');
  P.dead = true; P.deathT = 0; P.deathAt = performance.now(); P.vault = null; P.vx = P.vz = 0; turnedDown(NET.id);   // (co-op: back next wave as one of them, net/sync.js)
  exitScope(); closeStation(); W8.reloading = null; W8.swing = 0; setMouseDown(false); setMouseDownR(false);
  ANIM.deathSign = Math.cos(angDiff(P.hitFrom === undefined ? ANIM.yaw : P.hitFrom, ANIM.yaw)) >= 0 ? 1 : -1;
  ANIM.deathTwist = rr(-0.1, 0.1);
  ragYou();   // you go down as a ragdoll, the way the zombies do (player/player-ragdoll.js)
  setTimeScale(DEATH_SLOW); P.deathDt = 0;
  deathCineStart();   // the camera's last look at you (below)
  if (netLink()) netDown();   // co-op: no slow motion, the farm goes on (net/sync.js)
  // the weapon slips out of your hands and falls (effects/weapon-drop.js); in co-op your teammates see it fall the
  // same, from this one throw. It's only to look at: nobody picks it up
  const gg = gunMeshes[W8.cur];
  if (gg) {
    const c = dropCopy(gg), v = [Math.sin(ANIM.yaw) * 0.9 + rr(-0.5, 0.5), 1.2, Math.cos(ANIM.yaw) * 0.9 + rr(-0.5, 0.5)], w = [rr(-5, 5), rr(-2, 2), rr(-5, 5)];
    ANIM.dropped = makeDrop(c.g, c.h, v, w, !!(W(curId()) || {}).melee);
    if (netLink()) netSend('wdrop', { s: SLOTS.indexOf(W8.cur), p: c.g.position.toArray().map(nr), q: c.g.quaternion.toArray().map(x => Math.round(x * 1e4) / 1e4), v: v.map(nr), w: w.map(nr) });
  }
  document.body.classList.add('dying');
  SFX.hurt(); setTimeout(() => { if (P.dead) SFX.thump(); }, 0.85 / DEATH_RATE * 1000); SFX.wave();
}
// ---- going down, filmed: the view closes in on you slowly and tips over a little the way you fell, black bars slide
// in top and bottom, the edges darken and the sound goes dull and far away (ui/hud.js). In co-op, once you've lain
// there DEATH_CINE.spec seconds, it dips to black, and comes up again on the teammate you'll watch (net/spectate.js:
// camFocus, from DC.spec); the bars go as it does. Solo, the end screen comes up over it (die)
// (DEATH_CINE and DC, the death camera's timings and where it's up to, are at the top of the file)
function deathCineStart() {
  Object.assign(DC, { on: true, t: 0, side: ANIM.deathSign || 1, spec: false, fading: false, z0: zoomT });
  $('cineBars').classList.add('on'); $('fadeVeil').classList.remove('cine');
}
function tickDeathCine(rdt) {
  if (!DC.on) return;
  DC.t += rdt;
  $('deathVig').style.opacity = DC.spec ? 0 : (DEATH_CINE.vig * smooth(clamp(DC.t / DEATH_CINE.vigT, 0, 1))).toFixed(3);
  if (!netLink() || DC.spec) return;
  // co-op: to black, then up again on a teammate, the bars gone and the view as it was
  if (!DC.fading && DC.t > DEATH_CINE.spec) { DC.fading = true; veil(true); }
  if (DC.fading && DC.t > DEATH_CINE.spec + DEATH_CINE.black) { DC.spec = true; setZoomT(DC.z0); setZoom(zoomT); $('cineBars').classList.remove('on'); setTimeout(() => { if (DC.spec) veil(false); }, 80); }   // (lifted once the teammate's view has drawn)
}
// the push in and the tip, for the camera (game/camera.js); nothing once you're watching someone else
export const deathZoomK = () => DC.on && !DC.spec ? 1 + DEATH_CINE.push * smooth(clamp(DC.t / DEATH_CINE.pushT, 0, 1)) : 1;
export const deathRollK = () => DC.on && !DC.spec ? DC.side * DEATH_CINE.roll * smooth(clamp(DC.t / DEATH_CINE.pushT, 0, 1)) : 0;
// back up (a respawn, a new run, the menu): the bars, the dark and the veil all lifted
export function deathCineEnd() { if (!DC.on) return; DC.on = false; DC.spec = false; $('cineBars').classList.remove('on'); $('deathVig').style.opacity = 0; if (DC.fading) veil(false); DC.fading = false; }
// dying plays out in slow motion on its own clock: the world winds down and stops dead the moment your body
// hits the ground, so nothing keeps closing in, while the fall, the dropped weapon and the blood pool finish
const DEATH_RATE = 0.55, DEATH_GROUND = 0.86, DEATH_SLOW = 0.6;
export function tickDeath(rdt) {
  P.deathDt = rdt * DEATH_RATE; P.deathT += P.deathDt;
  tickDeathCine(rdt);
  if (netLink()) return;   // co-op: you're down, not out, until everyone is (net/sync.js)
  setTimeScale(DEATH_SLOW * Math.pow(1 - clamp(P.deathT / DEATH_GROUND, 0, 1), 1.6));
  if (P.deathT > 1.2 && performance.now() - P.deathAt > 3800 && state === 'play') die();
}
export function die() {
  $('cineBars').classList.remove('on');   // (the end screen comes up over the farm as it lies, still close in on you)
  document.body.classList.add('dying');   // (the HUD gone from under it, however the run ended: styles/hud-feed.css)
  if (run.wave > best) { best = run.wave; try { localStorage.setItem('kessler-best', best); } catch (e) {} }
  showBest();
  $('deadTitle').textContent = (netLink() ? 'Overrun on wave ' : 'Dead on wave ') + Math.max(1, run.wave);
  $('againBtn').hidden = NET.on && !NET.host;   // (in co-op the host starts the next one)
  if (NET.on) NET.inGame = false;
  const acc = run.shots ? Math.round(run.hits / run.shots * 100) + '%' : '—';
  const mins = Math.floor(run.time / 60), secs = String(Math.floor(run.time % 60)).padStart(2, '0');
  $('deadStats').innerHTML = '';
  [['Kills', run.kills], ['Limbs taken', run.limbs], ['Accuracy', acc], ['Survived', mins + ':' + secs]].forEach(([l, v]) => {
    const d = document.createElement('div'); d.className = 'lbl'; d.innerHTML = '<b></b>'; d.firstChild.textContent = v; d.append(l); $('deadStats').appendChild(d);
  });
  renderRunStats();   // (the full stats, folded away under them: ui/run-stats.js)
  setState('dead');
}
