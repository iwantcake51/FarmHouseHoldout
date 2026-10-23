// The HUD each frame.

import { $ } from '../core/dom.js';
import { cam, cv, V3 } from '../core/renderer.js';
import { cache, clamp, smooth } from '../core/math.js';
import { P } from '../player/player.js';
import { roundHue, roundName, roundOn } from '../weapons/rounds.js';
import { fireModeOf, fireModes, modName } from '../weapons/mod-levels.js';
import { curId, magCap, run, S, W, W8 } from '../game/run-state.js';
import { gunExtras } from '../weapons/build-weapons.js';
import { timeScale } from '../game/hit-feedback.js';
import { eyeK } from '../zombies/damage.js';
import { PLANK_MAX } from '../barricades/planks.js';
import { AC, muff, tn } from '../audio/audio.js';
import { SFX } from '../audio/sfx.js';
import { hurtFx, phase, setHurtFx, state } from '../game/state.js';
import { hasMouse } from '../input/keyboard-mouse.js';
import { scoped } from '../player/aiming.js';
import { usingTouch } from '../input/touch.js';
import { AK_ON, akBusy, akMags, akPer } from '../weapons/akimbo.js';
import { bandHeal, bandProg } from '../player/bandages.js';
import { renderSlots, setRoll, setT } from './hud-text.js';
import { xhHit } from '../player/shaky-hands.js';
import { hitCam } from '../game/camera.js';
import { heartStartle, updateHeart } from './vitals.js';
import { renderMoodles } from './moodles.js';
import { hudMag, renderRounds } from './rounds.js';
import { renderMeleeArt } from './melee-art.js';
import { ANIM, hurtFace } from '../player/animation.js';
import { spectating } from '../net/spectate.js';

// health, ECG, ammo, weapon name, moodles, slots, screen tints
// a fresh run's max health: anything over it on the bar is bonus health, in its own colour
export const BASE_HP = 100;
// the stamina you've used and not yet won back (everything past the fill), and whether it's coming back yet ('back',
// dimmed) or not ('on': you're spending it or catching your breath first); '' once there's none
function stamDrain(rdt) {
  const up = P.stam > (ANIM.stamPrev ?? P.stam) + 1e-5, down = P.stam < (ANIM.stamPrev ?? P.stam) - 1e-5; ANIM.stamPrev = P.stam;
  ANIM.drainD = Math.max(0, 1 - ANIM.stamD);
  if (ANIM.drainD < 0.004) ANIM.drainSt = '';
  else if (down || !up) { if (down || ANIM.drainSt !== 'back' || (ANIM.drainHold = (ANIM.drainHold || 0) + rdt) > 0.25) { ANIM.drainSt = 'on'; ANIM.drainHold = 0; } }
  else { ANIM.drainSt = 'back'; ANIM.drainHold = 0; }
}
export function updateHUD(rdt, D) {
  // stamina readout eases toward the real value so it never jumps
  ANIM.stamD = (ANIM.stamD === undefined ? 1 : ANIM.stamD) + (P.stam - (ANIM.stamD === undefined ? 1 : ANIM.stamD)) * Math.min(1, rdt * 10);
  // and what you've used (a sprint, a swing, a shove, a vault) shows just past the fill, here and on the crosshair's ring
  // (ui/crosshair.js): bright while you're using it and till it starts coming back, then dimmed, the fill easing on
  // into it till it's gone
  stamDrain(rdt);
  { const sb = $('stamBar'), show = state === 'play' && (P.stam < 0.995 || (W(curId()) || {}).melee) ? 1 : 0, rd = ANIM.drainD, rs = ANIM.drainSt;
    const key = Math.round(ANIM.stamD * 400) + ':' + Math.round(rd * 400) + ':' + rs + ':' + show + ':' + P.exh + ':' + (P.stam < 0.35);
    if (cache.stam !== key) { cache.stam = key; $('stamFill').style.transform = `scaleX(${ANIM.stamD.toFixed(4)})`;
      const rb = $('stamRun'); rb.style.transform = `translateX(${(ANIM.stamD * 100).toFixed(2)}%) scaleX(${rd.toFixed(4)})`; rb.classList.toggle('on', rs === 'on'); rb.classList.toggle('back', rs === 'back'); sb.style.opacity = show; sb.classList.toggle('exh', P.exh); sb.classList.toggle('big', !!S.lungs); sb.classList.toggle('tired', !P.exh && P.stam < 0.35); } }
  if (state === 'title') return;
    setHurtFx(Math.max(0, hurtFx - rdt * 2));
    // (down in co-op and watching a teammate, it's their game you're seeing: only a little drained, no bleeding out: net/spectate.js)
    const spec = spectating(), hpF = P.hp / S.maxHp, low = !spec && hpF < 0.3 ? LOW_HP.pulse[0] + Math.sin(performance.now() / 260) * LOW_HP.pulse[1] : 0;
    $('hurt').style.opacity = Math.max(hurtFx * 0.9, low);
    { const ek = spec ? 0 : Math.round(eyeK() * 40) / 40; if (cache.eye !== ek) { cache.eye = ek; $('eyeVig').style.opacity = ek; $('eyeVig').classList.toggle('on', ek > 0); } }   // a dead eye (co-op Bullet time)
    // the world drains to grey as you bleed out (LOW_HP: from what health it starts and where it's all grey), lifted
    // brighter as it goes so you can still see what's coming, with only a touch of red at the very edges
    const grey = spec ? 0.4 : Math.round(clamp((LOW_HP.grey[0] - hpF) / (LOW_HP.grey[0] - LOW_HP.grey[1]), 0, 1) * 50) / 50;
    { const rt = spec ? 0 : Math.round(clamp((0.4 - hpF) / 0.3, 0, 1) * LOW_HP.red * 40) / 40; if (cache.redTint !== rt) { cache.redTint = rt; $('lowTint').style.opacity = rt; } }
    const near = spec || P.dead ? 0 : Math.round(smooth(clamp((NEAR_DEATH.from - hpF) / (NEAR_DEATH.from - NEAR_DEATH.to), 0, 1)) * 40) / 40;
    { const v = near ? near * NEAR_DEATH.vig * (1 - NEAR_DEATH.breath + NEAR_DEATH.breath * Math.sin(performance.now() / 1100)) : 0, vk = Math.round(v * 60) / 60; if (cache.nearVig !== vk) { cache.nearVig = vk; $('nearVig').style.opacity = vk; } }
    const blur = Math.round((P.conc || 0) * 2.6 * 10) / 10, slow = Math.round(clamp((1 - timeScale) / 0.75, 0, 1) * 60) / 60, dz = P.dead && !spec ? 1 : 0, fk = grey + ':' + blur + ':' + slow + ':' + near + ':' + dz;
    if (cache.grey !== fk) {
      cache.grey = fk;
      cv.style.filter = (grey ? `grayscale(${grey.toFixed(2)}) brightness(${(1 + grey * LOW_HP.bright).toFixed(2)}) contrast(${(1 + grey * 0.05).toFixed(2)}) ` : '') + (blur ? `blur(${blur}px) brightness(${(1 + blur * 0.06).toFixed(2)}) ` : '') + (slow ? `saturate(${(1 - slow * 0.4).toFixed(2)}) contrast(${(1 + slow * 0.08).toFixed(2)}) hue-rotate(${(-slow * 6).toFixed(1)}deg)` : '');
      $('slowmo').style.opacity = slow; $('slowmo').style.setProperty('--bar', slow);
      if (muff && AC && !(P.conc > 0.05)) muff.frequency.setTargetAtTime(Math.min(slow ? 20000 - slow * 18800 : 20000, 20000 * Math.pow(NEAR_DEATH.lp / 20000, near), dz ? DEATH_LP : 20000), AC.currentTime, dz ? 0.9 : near ? 0.4 : 0.12);   // (slow motion's, or close to death's: NEAR_DEATH)
    }
    setRoll('wNum', String(Math.max(1, run.wave)).padStart(2, '0'), true);   // it spins round to the new wave
    setT('hpTxt', String(Math.ceil(P.hp))); setT('hpMax', '/ ' + Math.round(S.maxHp));
    $('hpFill').style.setProperty('--hp', (hpF * 100) + '%'); $('hpLag').style.width = (hpF * 100) + '%';
    // health over the base 100 (armour, Tough skin, Stubborn...) shows in its own colour past where 100 would end
    { const b = Math.min(100, BASE_HP / S.maxHp * 100), bk = Math.round(b * 10); if (cache.hpB !== bk) { cache.hpB = bk; $('hpFill').style.setProperty('--b', b.toFixed(1) + '%'); } }
    // the blue part: healing still to come, and while a bandage goes on, as much of its healing as is wound so far
    { const inc = Math.min(1 - hpF, ((P.heal || 0) + bandHeal() * bandProg()) / S.maxHp), hk = Math.round(hpF * 500) + ':' + Math.round(inc * 500);
      if (cache.heal !== hk) { cache.heal = hk; const el = $('hpHeal'); el.style.left = (hpF * 100) + '%'; el.style.width = (inc * 100) + '%'; } }
    // the blue edge builds as a bandage goes on (player/hold.js, healFx), not the moment you start, and stays faint while it heals you
    { const hv = Math.round(Math.min(1, Math.max(0.85 * (ANIM.healFx || 0), 0.45 * Math.min(1, (P.heal || 0) / 12))) * 60) / 60; if (cache.hv !== hv) { cache.hv = hv; $('healVig').style.opacity = hv; } }
    setRoll('bands', String(P.band || 0)); { const e = !(P.band > 0); if (cache.bandE !== e) { cache.bandE = e; $('bandBox').classList.toggle('empty', e); } }
    $('vitals').classList.toggle('low', hpF < 0.3);
    setRoll('planks', String(S.planks)); if (cache.plFull !== (S.planks >= PLANK_MAX)) { cache.plFull = S.planks >= PLANK_MAX; $('planks').classList.toggle('full', cache.plFull); } setRoll('kills', String(run.kills)); setRoll('scrap', String(S.scrap));
    updateHeart(rdt, hpF);   // (ui/vitals.js)
    damageVignettes(rdt);
    renderMoodles();
    const id = curId();
    setT('wName', D.name);
    // what's on it, as chips edged in the workbench's colours: mods and gun upgrades blue, attachments teal, rounds gold
    const chips = (W8.mods[id] || []).map(m => ({ t: modName(m), k: 'upg' })).concat(gunExtras(id)), ck = chips.map(c => c.k + c.t).join('|');
    if (cache.wMods !== ck) { cache.wMods = ck; $('wMods').innerHTML = chips.map(c => `<span class="${c.k}">${c.t}</span>`).join(''); }
    // a gun in each hand shows each one's mag, the left's on the left (weapons/akimbo.js); a gun being reloaded dims
    const ak = !D.melee && !!D.akimbo, am = ak && akMags(id);
    if (cache.akHud !== ak) { cache.akHud = ak; $('arms').classList.toggle('ak', ak); }
    // the count in the colour of the kind of round loaded, as its shells and cartridges show (ROUND_HUE; low and out
    // still turn it yellow and red)
    const rc = !D.melee && roundHue(id, D);
    const ammoEl = (el, have, n, rl) => { el.classList.toggle('out', !D.melee && have === 0); el.classList.toggle('low', !D.melee && have > 0 && have <= Math.max(1, Math.floor(n * 0.25))); el.classList.toggle('rl', !!rl); if (el.dataset.rc !== (rc || '')) { el.dataset.rc = rc || ''; el.style.color = rc || ''; } };
    if (ak) { const per = akPer(id), lt = AK_ON.left, rt = AK_ON.right; setRoll('ammoL', String(am[lt])); setRoll('ammo', String(am[rt])); ammoEl($('ammoL'), am[lt], per, akBusy(lt)); ammoEl($('ammo'), am[rt], per, akBusy(rt)); }   // the left-click gun's on the left
    const hm = !D.melee && !ak && hudMag(id);   // through a mag change, what's in the gun as you'd see it (ui/rounds.js)
    if (!ak) { setRoll('ammo', D.melee ? '—' : String(hm.have)); ammoEl($('ammo'), D.melee ? 0 : hm.have, D.melee ? 0 : magCap(id), false); }
    setRoll('ammoRes', D.melee ? '' : '/ ' + (hm ? hm.res : W8.reserve[D.ammo]));
    if (D.melee) { if (cache.rounds !== 'melee') { cache.rounds = 'melee'; $('rounds').innerHTML = ''; } } else renderRounds(id, D);   // (kept up under the minimalist HUD too, only not shown)
    renderMeleeArt(id, D); renderFireMode(id);
    // reloading shows under the crosshair; touch play has no crosshair, so it stays here for touch
    const xhShown = hasMouse && !usingTouch && !scoped;
    setRoll('reloadTag', W8.reloading && !xhShown ? (W8.reloading === 'shell' ? `Loading ${W8.shellsIn}/${W8.shellsNeed}` : 'Reloading') : (!W8.reloading && !D.melee && !(W8.mag[id] > 0) && W8.reserve[D.ammo] === 0) ? 'Empty. Craft ammo or switch' : '');
    renderSlots();
    $('tbWave').hidden = phase !== 'break';
    $('tbAlt').hidden = !D.gl;
}
// the fire mode by the ammo count (styles/hud-weapon.css): its rounds and name, with B when the gun can switch; drawn
// again only when the mode or the gun changes
function renderFireMode(id) {
  const m = fireModeOf(id), el = $('fireMode'), key = m ? id + m.k + m.t : '';
  if (cache.fm === key) return;
  const sameGun = cache.fmId === id && !!cache.fm; cache.fm = key; cache.fmId = id;
  el.hidden = !m; if (!m) return;
  const g = el.querySelector('.fmG'), n = m.k === 'burst' ? Math.min(4, m.n) : m.k === 'auto' ? 5 : m.k === 'fan' ? 3 : m.k === 'both' ? 2 : 1;
  g.className = 'fmG ' + m.k + ({ rifle: ' rf', magnum: ' mg', p10: ' t10' }[W(id).ammo] || '') + (sameGun ? ' in' : ''); g.innerHTML = '<i></i>'.repeat(n);   // pointed rifle and magnum rounds
  el.querySelector('.fmT b').textContent = m.t; el.querySelector('.fmT kbd').hidden = fireModes(id).length < 2;
  if (sameGun) { el.classList.remove('sw'); void el.offsetWidth; el.classList.add('sw'); }
}
// switching fire mode (B): the selector clicks over in two steps, the new mode's name comes up beside the crosshair
// for a moment, and the HUD's rounds roll over to it
export function fireModeSwitched(id) {
  SFX.click(); tn(0.03, 'square', 900, 700, 0.06); setTimeout(() => tn(0.025, 'square', 1350, 1050, 0.05), 70);
  const m = fireModeOf(id), x = $('xhMode'); if (!m) return;
  x.textContent = m.t; x.classList.remove('show'); void x.offsetWidth; x.classList.add('show');
  renderFireMode(id);
}
// X loaded another kind of round (weapons/rounds.js): its name by the crosshair, where a new fire mode shows
export function roundSwitched(id) {
  SFX.click(); setTimeout(() => SFX.click(), 90);
  const x = $('xhMode'); x.textContent = roundName(id, roundOn(id)); x.classList.remove('show'); void x.offsetWidth; x.classList.add('show');
}
// getting hit (zombies/ai.js, weapons/explosives.js): red floods in from the side of the screen the blow came from and
// drains away again; a blow with no side to it (a blast right under you) flashes the whole edge instead (styles/overlays.css)
const _hvA = new V3(), _hvB = new V3();
export let hitVig = 0, hitVigUp = false, bleedVig = 0, bleedPh = 0, hitBlurV = 0, hitBlurK = 1;
// how strong the hurt blur is on the side of a blow, how long it takes to clear (seconds, for a normal hit), and how
// strong all round while you bleed, between throbs and at the height of one
const HURT_BLUR = { hit: 0.95, clear: 1.1, bleed: [0.3, 0.55] };
function hurtBlur(id, key, v) {
  v = Math.round(v * 50) / 50; if (cache[key] === v) return; cache[key] = v;
  const el = $(id); el.style.opacity = v; el.style.visibility = v > 0 ? 'visible' : 'hidden';   // (hidden, it costs nothing)
}
// low health: the health it starts going grey at and is fully grey by, how much brighter it's lifted when fully grey,
// how much of the red edge is left, and the faint pulse at the edges under a third health
const LOW_HP = { grey: [0.55, 0.12], bright: 0.24, red: 0.5, pulse: [0.1, 0.04] };
// close to death (from NEAR_DEATH.from of your health, worst by .to): everything you hear dulls a little, the top taken
// off it (down to .lp Hz at worst, through the master lowpass the slow motion uses: whichever's lower), and the edges
// of the view darken (#nearVig, up to .vig), slowly breathing (.breath of it, at about the rate you breathe)
const NEAR_DEATH = { from: 0.25, to: 0.04, lp: 4200, vig: 0.75, breath: 0.12 };
const DEATH_LP = 650;   // how dull and far off it all sounds while you lie there (ui/screens.js: the death camera)
const BLEED_PULSE = 1.5;   // seconds per throb of the bleeding edge: slow and heavy, whatever your heart is doing
// the side a blow came from, for the red flash and the blur on that side
function setHitSide(x, y) { for (const id of ['hitVig', 'hitBlur']) { const el = $(id); el.style.setProperty('--hx', x); el.style.setProperty('--hy', y); } }
// (amount: how hard the blow, for how hard your sight blurs on that side and how long it takes to clear; 1 a zombie's swipe)
export function hitFromAt(x, z, amount) {
  hurtFace(amount || 1);   // (and you wince: player/animation.js)
  hitCam(x, z, amount);   // (and the view's knocked with the blow: game/camera.js)
  xhHit(x, z, amount);   // (and the crosshair with it: player/shaky-hands.js)
  _hvA.set(P.x, 1, P.z).project(cam); _hvB.set(x, 1, z).project(cam);
  const w = innerWidth / 2, h = innerHeight / 2, dx = (_hvB.x - _hvA.x) * w, dy = -(_hvB.y - _hvA.y) * h, l = Math.hypot(dx, dy);
  hitBlurK = clamp(amount || 1, 0.5, 2);
  if (l < 2) { setHurtFx(1); heartStartle(); hitBlurV = Math.max(hitBlurV, 0.6 * hitBlurK); setHitSide('50%', '50%'); return; }
  const t = Math.min(w / Math.abs(dx / l || 1e-6), h / Math.abs(dy / l || 1e-6)) * 1.08, el = $('hitVig'), hx = (w + dx / l * t) / innerWidth, hy = (h + dy / l * t) / innerHeight;
  setHitSide((hx * 100).toFixed(1) + '%', (hy * 100).toFixed(1) + '%');
  hitVigUp = true; heartStartle(); hitBlurV = Math.max(hitBlurV, Math.min(1, 0.55 + 0.25 * hitBlurK));
}
// the hit side snaps in fast and eases out; bleeding throbs slowly at the edges, swelling in and ebbing away, and the
// health number, health bar and Bleeding icon throb with it
function damageVignettes(rdt) {
  if (hitVigUp) { hitVig = Math.min(1, hitVig + rdt / 0.07); if (hitVig >= 1) hitVigUp = false; } else hitVig = Math.max(0, hitVig - rdt / 0.45);
  { const v = Math.round(smooth(hitVig) * 100) / 100; if (cache.hitVig !== v) { cache.hitVig = v; $('hitVig').style.opacity = v; } }
  const bleeding = P.bleed > 0 && !P.dead;
  if (bleeding && bleedVig === 0) bleedPh = 0.1;   // the first throb comes straight away
  bleedVig = bleeding ? Math.min(1, bleedVig + rdt * 4) : Math.max(0, bleedVig - rdt * 2.5);
  bleedPh = (bleedPh + rdt / BLEED_PULSE) % 1;
  // your sight blurring at the edges (HURT_BLUR): on the side of a blow, clearing over a moment or so (longer for a
  // harder one), and all round while you bleed, swelling with each throb
  hitBlurV = Math.max(0, hitBlurV - rdt / (HURT_BLUR.clear * hitBlurK));
  const beatB = bleedPh < 0.35 ? smooth(bleedPh / 0.35) : 1 - smooth((bleedPh - 0.35) / 0.65);
  hurtBlur('hitBlur', 'hb', smooth(Math.min(1, hitBlurV)) * HURT_BLUR.hit);
  hurtBlur('bleedBlur', 'bb', bleedVig * (HURT_BLUR.bleed[0] + HURT_BLUR.bleed[1] * beatB));
  const beat = bleedPh < 0.35 ? smooth(bleedPh / 0.35) : 1 - smooth((bleedPh - 0.35) / 0.65), bp = Math.round(bleedVig * beat * 50) / 50, bo = Math.round((0.3 * bleedVig + 0.7 * bp) * 50) / 50;
  if (cache.bleedVig !== bo) { cache.bleedVig = bo; $('bleedVig').style.opacity = bo; $('vitals').style.setProperty('--bp', bp); $('moodles').style.setProperty('--bp', bp); }
  if (cache.bleeding !== bleeding) { cache.bleeding = bleeding; $('vitals').classList.toggle('bleed', bleeding); }
}

// setters for the variables above that other files change (an imported variable can only be read)
export function setHitVig(v) { return (hitVig = v); }
export function setHitVigUp(v) { return (hitVigUp = v); }
export function setBleedVig(v) { return (bleedVig = v); }
