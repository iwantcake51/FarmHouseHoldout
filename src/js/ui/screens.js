// Title, pause and death screens, starting a run and dying.

// the death camera's timings and where it's up to (below: startDeath, tickDeathCine). Up here, as a new run clears it
const DEATH_CINE = { push: 0.55, pushT: 3.2, roll: 0.07, vig: 0.85, vigT: 2.4, spec: 2.3, black: 0.55 };
const DC = { on: false, t: 0, side: 1, spec: false, fading: false, z0: 1 };

let best = 0;
try { best = +localStorage.getItem('kessler-best') || 0; } catch (e) {}
['pHist', 'upHist', 'pBuy'].forEach(id => smoothWheel($(id)));   // the history lists scroll smoothly too
const showBest = () => { const t = best ? 'Best run: wave ' + best : ''; $('best').textContent = t; $('deadBest').textContent = t; };
showBest();
function setState(s) {
  state = s;
  if (s !== 'play') exitScope();
  ['title', 'upgrade', 'paused', 'dead'].forEach(id => $(id).hidden = id !== s);
  ['waveBox', 'vitals', 'arms', 'moodles'].forEach(id => $(id).hidden = s === 'title');
  $('scrim').style.opacity = s === 'title' ? 0.4 : 1;
  document.body.classList.toggle('playing', s === 'play');
  document.body.classList.toggle('menu', s === 'paused' || s === 'upgrade');   // the HUD dims behind a menu (styles/screens.css)
  if (s !== 'play') { closeStation(); $('prompt').classList.remove('on'); cache.promptOn = false; }
  if (s === 'paused') { renderHistory('pHist', 'pHistN'); renderBought('pBuy', 'pBuyN'); }
  if (s === 'upgrade') renderHistory('upHist', 'upHistN');
  if (s === 'play') { last = performance.now(); cv.focus({ preventScroll: true }); }
  keys.clear(); mouseDown = mouseDownR = false;
}
// wipe the farm back to a fresh run: bodies, drops, debris, boards, stats, your character
function resetRun(keepLook) {
  houseLayout(NET.on && NET.inGame && NET.houseSeed != null ? NET.houseSeed : (Math.random() * 2147483647) | 0, true);   // a new floor plan (world/interior.js), the host's in co-op
  zombies.forEach(z => { scene.remove(z.m.g); zFree(z.m.g); if (z.blob) scene.remove(z.blob); }); zombies.length = 0;
  ragdolls.forEach(r => { scene.remove(r.g); zFree(r.g); if (r.blob) scene.remove(r.blob); }); ragdolls.length = 0; unragYou();
  gibs.forEach(g => { scene.remove(g.m); zFree(g.m); }); gibs.length = 0;
  grenades.forEach(g => scene.remove(g.m)); grenades.length = 0; clearSpit();
  pickups.forEach(p => scene.remove(p.g)); pickups.length = 0;
  resetDrops();   // nothing on its way, no flare (stations/supply-drop.js)
  bloodMapClear(); clearBodyBlood(); drops.forEach(d => { d.life = 0; d.m.visible = false; }); parts.forEach(p => { p.m.visible = false; p.life = 0; }); casings.concat(mags, SL_DROPS).forEach(c => { c.g.visible = false; c.life = 0; }); smokes.forEach(p => { p.life = 0; p.m.visible = false; });
  resetBoards(); clearHoles(); freshRun(); if (!keepLook && !NET.on) rollLook(); buildGuns();   // a new look for every run (player/look.js); the title already dealt one (in co-op you keep the one your teammates have)
  deathCineEnd();
  P.x = cxw(21); P.z = cxw(22); P.hp = S.maxHp; P.blood = 0; P.bleed = 0; P.bloodFeet = 0; ANIM.bandSwitch = null; P.stam = 1; P.exh = false; P.stamT = 9; P.runDebt = 0; P.runT = 9; P.spdF = 1; P.fatigued = false; P.sprint = false; P.sprintLock = false; P.skid = 0; P.pivot = null; P.fireQ = null; P.pushT = 0; P.runUp = 0; P.carveW = 0; ANIM.sprintK = ANIM.ready = ANIM.faceK = ANIM.skidK = ANIM.pivK = ANIM.scrK = ANIM.bobK = ANIM.pivBank = ANIM.bobSlow = ANIM.rgK = ANIM.rgT = ANIM.vrgT = 0; P.band = 0; P.bandT = 0; P.wraps = 0; P.heal = 0; P.conc = 0; P.kbx = P.kbz = 0; P.dead = false; P.deathT = 0; P.hitFrom = undefined; document.body.classList.remove('dying'); if (ANIM.dropped) { scene.remove(ANIM.dropped.g); ANIM.dropped = null; } P.aim = Math.PI; P.vault = null; P.slow = P.stun = P.adr = P.eye = 0; P.adrCd = 0; tod = 15;
  P.shove = null; P.shoveCd = 0; P.vaultHeat = 0; ANIM.land = 0; ANIM.shoveHit = 0; INTRO.t = -1; benchTipsStart();
  zoomT = ZOOM_MAX; hurtFx = 0; flowDirty = true; timeScale = 1; camPunch = 0;   // the intro glides in all the way to the closest zoom
  $('feed').innerHTML = ''; feedItems.length = 0; clearGear();
  floats.forEach(f => f.el.remove()); floats.length = 0;
  netRunStart();   // (co-op: net/sync.js)
}
// soft: straight off the title, where the survivor you see is the one you play, so the camera glides down from the
// title shot without a cut; dark: it's coming up out of black instead (cineRun), so it glides in from high up, and the
// new house's paint is on already
function newRun(soft, dark) {
  audioInit(); resetRun(soft);
  // build every shader now, behind the intro's dark veil, so the first blood, ragdoll or spark never stalls a frame
  R.compile(scene, cam);
  setState('play'); beginBreak(10);
  if (dark) stepPaint(PAINT_FADE * 2);
  startIntro(soft && !dark);   // game/intro.js: the camera glides in, you get up off one knee, then the night is announced
}
// back to the title from the death screen, with the farm reset behind it
function backToMenu() {
  resetRun(); deathCineEnd(); setState('title'); $('title').scrollTop = 0;
  if (NET.on) { NET.inGame = false; toggleCoop(true); }   // still in a co-op game: back in its lobby
  // the HUD stops updating on the title, so clear the dying screen effects by hand
  cv.style.filter = ''; cache.grey = null; ['hurt', 'lowTint', 'slowmo', 'eyeVig', 'healVig', 'conc', 'hitVig', 'bleedVig', 'nearVig'].forEach(id => { $(id).style.opacity = 0; }); hitVig = bleedVig = 0; cache.nearVig = null; hitVigUp = false; resetHeart(); cache.hitVig = cache.bleedVig = cache.bleeding = null; $('vitals').classList.remove('bleed'); cache.redTint = null;
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
function enterRun() { if (NET.on && !NET.inGame) { if (NET.host) netStart(); return; } audioInit(); if (state === 'title') cineRun(); else switchScreens(true, () => newRun(false)); }
// off the title, cinematically: the menu slides away as the picture slowly dims to black and letterbox bars close in
// (CINE.out, ms), the run's set up in the dark (the new farm, every shader built), and after a held beat (hold) it
// opens slowly out of black on the intro's glide down onto you, the bars drawing back over bars ms as you get up
const CINE = { out: 1000, hold: 300, bars: 1500 };
function cineRun() {
  if (switching) return; switching = true;
  const t = $('title'); t.classList.add('leaving'); t.classList.remove('arrive');
  $('fadeVeil').classList.add('cine'); $('cineBars').classList.add('on'); veil(true);
  setTimeout(() => {
    t.classList.remove('leaving');
    newRun(true, true);
    // (two frames, so the new view's been drawn, then the held beat)
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      veil(false); switching = false;
      setTimeout(() => $('cineBars').classList.remove('on'), CINE.bars * 0.4);
      setTimeout(() => $('fadeVeil').classList.remove('cine'), CINE.bars * 1.6);
    }, CINE.hold)));
  }, CINE.out);
}
// to the title: a dip to black, and the menu comes in piece by piece as it lifts
function leaveToMenu() { switchScreens(true, () => { backToMenu(); $('title').classList.add('arrive'); }); }
// the pause screen fades in and out instead of snapping
function pauseRun() { if (state !== 'play' || P.dead || switching) return; $('quitBtn').hidden = netLink(); setState('paused'); }   // (in co-op the farm goes on while you're paused, and there's no abandoning it for the others)
function resumeRun() {
  const el = $('paused'); if (state !== 'paused' || switching || el.classList.contains('closing')) return;
  cancelLeave();
  el.classList.add('closing'); setTimeout(() => { el.classList.remove('closing'); if (state === 'paused') setState('play'); }, 180);
}
$('startBtn').onclick = enterRun;
$('againBtn').onclick = enterRun;
$('menuBtn').onclick = leaveToMenu;
// leaving a run from the pause screen asks first: the buttons give way to the question, and a yes, or a cancel (Esc)
// that puts them back
const P_SURE = {
  menu: { q: 'Leave for the main menu? This run will be lost.', yes: 'Leave run', go: () => { saveBest(); if (netLink()) netLeave(); leaveToMenu(); } },
  quit: { q: 'Abandon this run? It ends here, as if you fell.', yes: 'Abandon', go: () => die() }
};
let pSure = null;
function askLeave(k) { pSure = k; $('pSureQ').textContent = P_SURE[k].q; $('pSureYes').textContent = P_SURE[k].yes; $('pBtns').hidden = true; $('pSure').hidden = false; $('pSureNo').focus({ preventScroll: true }); }
function cancelLeave() { if (!pSure) return false; pSure = null; $('pSure').hidden = true; $('pBtns').hidden = false; return true; }
$('pMenuBtn').onclick = () => askLeave('menu');
$('quitBtn').onclick = () => askLeave('quit');
$('pSureYes').onclick = () => { const k = pSure; cancelLeave(); if (k) P_SURE[k].go(); };
$('pSureNo').onclick = cancelLeave;
$('resumeBtn').onclick = resumeRun;
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });
// the first look at the farm comes up out of the dark too
requestAnimationFrame(() => requestAnimationFrame(() => { veil(false); $('title').classList.add('arrive'); }));
// the run ends PZ-style: you go down where you stand, the HUD drains away, they close in, then the tally
function startDeath() {
  if (cheatSaves()) return;   // god mode (ui/cheats.js)
  runStat('downs');
  P.dead = true; P.deathT = 0; P.deathAt = performance.now(); P.vault = null; P.vx = P.vz = 0; turnedDown(NET.id);   // (co-op: back next wave as one of them, net/sync.js)
  exitScope(); closeStation(); W8.reloading = null; W8.swing = 0; mouseDown = mouseDownR = false;
  ANIM.deathSign = Math.cos(angDiff(P.hitFrom === undefined ? ANIM.yaw : P.hitFrom, ANIM.yaw)) >= 0 ? 1 : -1;
  ANIM.deathTwist = rr(-0.1, 0.1);
  ragYou();   // you go down as a ragdoll, the way the zombies do (player/player-ragdoll.js)
  timeScale = DEATH_SLOW; P.deathDt = 0;
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
  if (DC.fading && DC.t > DEATH_CINE.spec + DEATH_CINE.black) { DC.spec = true; zoomT = DC.z0; zoom = zoomT; $('cineBars').classList.remove('on'); setTimeout(() => { if (DC.spec) veil(false); }, 80); }   // (lifted once the teammate's view has drawn)
}
// the push in and the tip, for the camera (game/camera.js); nothing once you're watching someone else
const deathZoomK = () => DC.on && !DC.spec ? 1 + DEATH_CINE.push * smooth(clamp(DC.t / DEATH_CINE.pushT, 0, 1)) : 1;
const deathRollK = () => DC.on && !DC.spec ? DC.side * DEATH_CINE.roll * smooth(clamp(DC.t / DEATH_CINE.pushT, 0, 1)) : 0;
// back up (a respawn, a new run, the menu): the bars, the dark and the veil all lifted
function deathCineEnd() { if (!DC.on) return; DC.on = false; DC.spec = false; $('cineBars').classList.remove('on'); $('deathVig').style.opacity = 0; if (DC.fading) veil(false); DC.fading = false; }
// dying plays out in slow motion on its own clock: the world winds down and stops dead the moment your body
// hits the ground, so nothing keeps closing in, while the fall, the dropped weapon and the blood pool finish
const DEATH_RATE = 0.55, DEATH_GROUND = 0.86, DEATH_SLOW = 0.6;
function tickDeath(rdt) {
  P.deathDt = rdt * DEATH_RATE; P.deathT += P.deathDt;
  tickDeathCine(rdt);
  if (netLink()) return;   // co-op: you're down, not out, until everyone is (net/sync.js)
  timeScale = DEATH_SLOW * Math.pow(1 - clamp(P.deathT / DEATH_GROUND, 0, 1), 1.6);
  if (P.deathT > 1.2 && performance.now() - P.deathAt > 3800 && state === 'play') die();
}
function die() {
  $('cineBars').classList.remove('on');   // (the end screen comes up over the farm as it lies, still close in on you)
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
