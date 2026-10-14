// Title, pause and death screens, starting a run and dying.

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
  if (s !== 'play') { closeStation(); $('prompt').classList.remove('on'); cache.promptOn = false; }
  if (s === 'paused') { renderHistory('pHist', 'pHistN'); renderBought('pBuy', 'pBuyN'); }
  if (s === 'upgrade') renderHistory('upHist', 'upHistN');
  if (s === 'play') { last = performance.now(); cv.focus({ preventScroll: true }); }
  keys.clear(); mouseDown = mouseDownR = false;
}
// wipe the farm back to a fresh run: bodies, drops, debris, boards, stats, your character
function resetRun(keepLook) {
  zombies.forEach(z => { scene.remove(z.m.g); if (z.blob) scene.remove(z.blob); }); zombies.length = 0;
  ragdolls.forEach(r => { scene.remove(r.g); if (r.blob) scene.remove(r.blob); }); ragdolls.length = 0;
  gibs.forEach(g => scene.remove(g.m)); gibs.length = 0;
  grenades.forEach(g => scene.remove(g.m)); grenades.length = 0;
  pickups.forEach(p => scene.remove(p.g)); pickups.length = 0;
  resetDrops();   // nothing on its way, no flare (stations/supply-drop.js)
  bloodMapClear(); drops.forEach(d => { d.life = 0; d.m.visible = false; }); parts.forEach(p => { p.m.visible = false; p.life = 0; }); casings.concat(mags).forEach(c => { c.g.visible = false; c.life = 0; }); smokes.forEach(p => { p.life = 0; p.m.visible = false; });
  resetBoards(); clearHoles(); freshRun(); if (!keepLook) rollLook(); buildGuns();   // a new look for every run (player/look.js); the title already dealt one
  P.x = cxw(21); P.z = cxw(22); P.hp = S.maxHp; P.blood = 0; P.bleed = 0; P.bloodFeet = 0; ANIM.bandSwitch = null; P.stam = 1; P.exh = false; P.stamT = 9; P.spdF = 1; P.fatigued = false; P.band = 0; P.bandT = 0; P.wraps = 0; P.heal = 0; P.conc = 0; P.kbx = P.kbz = 0; P.dead = false; P.deathT = 0; P.hitFrom = undefined; document.body.classList.remove('dying'); if (ANIM.dropped) { scene.remove(ANIM.dropped.g); ANIM.dropped = null; } P.aim = Math.PI; P.vault = null; P.slow = P.stun = P.adr = 0; P.adrCd = 0; tod = 15;
  P.shove = null; P.shoveCd = 0; P.vaultHeat = 0; ANIM.land = 0; ANIM.shoveHit = 0; INTRO.t = -1;
  zoomT = ZOOM_MAX; hurtFx = 0; flowDirty = true; timeScale = 1;   // the intro glides in all the way to the closest zoom
  $('feed').innerHTML = ''; feedItems.length = 0; $('bleedFx').innerHTML = ''; clearGear();
  floats.forEach(f => f.el.remove()); floats.length = 0;
}
// soft: straight off the title, where the farm is already fresh and the survivor you see is the one you play, so the
// camera glides down from the title shot without a cut
function newRun(soft) {
  audioInit(); resetRun(soft);
  // build every shader now, behind the intro's dark veil, so the first blood, ragdoll or spark never stalls a frame
  R.compile(scene, cam);
  setState('play'); beginBreak(10);
  startIntro(soft);   // game/intro.js: the camera glides in, you get up off one knee, then the night is announced
}
// back to the title from the death screen, with the farm reset behind it
function backToMenu() {
  resetRun(); setState('title'); $('title').scrollTop = 0;
  // the HUD stops updating on the title, so clear the dying screen effects by hand
  cv.style.filter = ''; cache.grey = null; ['hurt', 'lowTint', 'slowmo', 'healVig', 'conc'].forEach(id => { $(id).style.opacity = 0; }); cache.redTint = null;
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
// start a run: off the title the menu slides away and the camera swoops down onto you; after a death it dips to black
function enterRun() { audioInit(); const soft = state === 'title'; switchScreens(!soft, () => newRun(soft)); }
// to the title: a dip to black, and the menu comes in piece by piece as it lifts
function leaveToMenu() { switchScreens(true, () => { backToMenu(); $('title').classList.add('arrive'); }); }
// the pause screen fades in and out instead of snapping
function pauseRun() { if (state !== 'play' || P.dead || switching) return; setState('paused'); }
function resumeRun() {
  const el = $('paused'); if (state !== 'paused' || switching || el.classList.contains('closing')) return;
  el.classList.add('closing'); setTimeout(() => { el.classList.remove('closing'); if (state === 'paused') setState('play'); }, 180);
}
$('startBtn').onclick = enterRun;
$('againBtn').onclick = enterRun;
$('menuBtn').onclick = leaveToMenu;
$('pMenuBtn').onclick = () => { saveBest(); leaveToMenu(); };
$('resumeBtn').onclick = resumeRun;
$('quitBtn').onclick = () => die();
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });
// the first look at the farm comes up out of the dark too
requestAnimationFrame(() => requestAnimationFrame(() => { veil(false); $('title').classList.add('arrive'); }));
// the run ends PZ-style: you go down where you stand, the HUD drains away, they close in, then the tally
function startDeath() {
  P.dead = true; P.deathT = 0; P.deathAt = performance.now(); P.vault = null; P.vx = P.vz = 0;
  exitScope(); closeStation(); W8.reloading = null; W8.swing = 0; mouseDown = mouseDownR = false;
  ANIM.deathSign = Math.cos(angDiff(P.hitFrom === undefined ? ANIM.yaw : P.hitFrom, ANIM.yaw)) >= 0 ? 1 : -1;
  ANIM.deathTwist = rr(-0.1, 0.1); ANIM.deathPool = 0;
  timeScale = DEATH_SLOW; P.deathDt = 0; zoomT = Math.min(zoomT * 1.3, ZOOM_MAX);
  const gg = gunMeshes[W8.cur];
  if (gg) {   // the weapon slips out of your hands
    gg.updateMatrixWorld(true);
    const inv = gg.matrixWorld.clone().invert(), bb = new THREE.Box3(), tb = new THREE.Box3(), rel = new THREE.Matrix4();
    gg.traverse(o => { if (!o.isMesh) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); rel.multiplyMatrices(inv, o.matrixWorld); bb.union(tb.copy(o.geometry.boundingBox).applyMatrix4(rel)); });
    const ctr = bb.isEmpty() ? new V3() : bb.getCenter(new V3()), inner = gg.clone(true), c = new THREE.Group();
    inner.position.copy(ctr).negate(); inner.rotation.set(0, 0, 0); inner.visible = true; c.add(inner);
    const wq = new THREE.Quaternion(), ws = new V3(); gg.matrixWorld.decompose(new V3(), wq, ws);
    c.position.copy(ctr).applyMatrix4(gg.matrixWorld); c.quaternion.copy(wq); c.rotation.order = 'YXZ'; scene.add(c);
    ANIM.dropped = { g: c, vx: Math.sin(ANIM.yaw) * 0.9 + rr(-0.5, 0.5), vz: Math.cos(ANIM.yaw) * 0.9 + rr(-0.5, 0.5), vy: 1.2, spin: rr(-2.2, 2.2), landed: false, melee: !!(W(curId()) || {}).melee };
  }
  document.body.classList.add('dying');
  SFX.hurt(); setTimeout(() => { if (P.dead) SFX.thump(); }, 0.85 / DEATH_RATE * 1000); SFX.wave();
}
// dying plays out in slow motion on its own clock: the world winds down and stops dead the moment your body
// hits the ground, so nothing keeps closing in, while the fall, the dropped weapon and the blood pool finish
const DEATH_RATE = 0.55, DEATH_GROUND = 0.86, DEATH_SLOW = 0.6;
function tickDeath(rdt) {
  P.deathDt = rdt * DEATH_RATE; P.deathT += P.deathDt;
  timeScale = DEATH_SLOW * Math.pow(1 - clamp(P.deathT / DEATH_GROUND, 0, 1), 1.6);
  if (P.deathT > 1.2 && performance.now() - P.deathAt > 3800 && state === 'play') die();
}
function die() {
  if (run.wave > best) { best = run.wave; try { localStorage.setItem('kessler-best', best); } catch (e) {} }
  showBest();
  $('deadTitle').textContent = 'Dead on wave ' + Math.max(1, run.wave);
  const acc = run.shots ? Math.round(run.hits / run.shots * 100) + '%' : '—';
  const mins = Math.floor(run.time / 60), secs = String(Math.floor(run.time % 60)).padStart(2, '0');
  $('deadStats').innerHTML = '';
  [['Kills', run.kills], ['Limbs taken', run.limbs], ['Accuracy', acc], ['Survived', mins + ':' + secs]].forEach(([l, v]) => {
    const d = document.createElement('div'); d.className = 'lbl'; d.innerHTML = '<b></b>'; d.firstChild.textContent = v; d.append(l); $('deadStats').appendChild(d);
  });
  setState('dead');
}
