// The cheat menu (F9), for testing. Along the top, a search box that looks through every cheat at once and the switches
// you reach for most (god mode, endless scrap and ammo, a bottomless magazine, one-hit kills, the waves off, the game's
// speed); down the side, its sections: you (supplies), health and status effects, weapons (every one, turning in 3D,
// and the upgrades and mods of the one in your hands), skills and perks, curses (taken, lifted, or a sacrifice promised
// for the next hand), zombies (any kind in any outfit sent in, their armour cracked or stripped, the waves) and the
// world (the hour, fog). The game keeps running behind it. The switches (CHEAT) are kept between runs and page loads;
// everything else acts on the run you're in.

import { $ } from '../core/dom.js';
import { keyIcon } from './input-icons.js';
import { keyOn } from '../input/keybinds.js';
import { CURSE_ICON, GI, GI_VB } from './game-icons.js';
import { BOARD, BOARD_VB } from './board-icons-data.js';
import { cv } from '../core/renderer.js';
import { rand } from '../core/math.js';
import { NET } from '../net/net.js';
import { P } from '../player/player.js';
import { LE, lookAct, lookEditor, lookKeepSwitch, lookLive, LOOK_TABS } from './look-editor.js';
import { addBlood } from '../effects/body-blood.js';
import { SLOT_NAME, SLOTS } from '../weapons/slots.js';
import { WEAP } from '../weapons/gun-stats.js';
import { AMMO_CAN } from '../weapons/ammo.js';
import { loadRound, roundName, roundOn, roundOwned, roundText, roundTypes } from '../weapons/rounds.js';
import { MODS } from '../melee/melee-mods.js';
import {
  addMod, improveMod, MOD_MAX, MOD_UP, modLv, modName, modOffer, modReplaced, muzzleTaken, roman
} from '../weapons/mod-levels.js';
import { tierName, TIERS } from '../upgrades/tier-table.js';
import {
  curId, fitTier, freshStats, hasMod, hpCap, magChange, magSize, ownTier, recomputeEff, run, S, setS, stamMax, W, W8
} from '../game/run-state.js';
import { buildGuns } from '../weapons/build-weapons.js';
import { burst } from '../effects/particles.js';
import { zombies, ZT } from '../zombies/zombie-types.js';
import { spawnZombie } from '../zombies/spawn.js';
import { breakArmor, crackArmor } from '../zombies/armor-break.js';
import { killZombie } from '../zombies/damage.js';
import { PLANK_MAX } from '../barricades/planks.js';
import { tierMax } from '../stations/recipes.js';
import { SFX } from '../audio/sfx.js';
import { breakT, glowGun, phase, setBreakT, setShake, setTod, shake, spawnQ, state, tod } from '../game/state.js';
import { exitScope } from '../player/aiming.js';
import { equip } from '../weapons/reload.js';
import { bandMax, interruptBandage, startBandage } from '../player/bandages.js';
import { AID, giveWeapon, NO_SIGHT, SKILLS, tierFits, UPG } from '../upgrades/upgrades.js';
import { clashes, curseRewards, CURSES, dropCurse, SAC, takeCurse } from '../upgrades/sacrifice.js';
import { startDeath } from './screens.js';
import { feed, popEl, toast } from './hud-text.js';
import { curDark } from '../lighting/day-night.js';
import { VCAM, wantLock } from '../game/view-cam.js';
import { ANIM } from '../player/animation.js';
import { hitFromAt } from './hud.js';
import { gunView, hideGun, showFigure, showGun } from './gun-view.js';
import { pickView } from './settings.js';

const CHEAT_KEY = 'kessler-cheats';
const CHEAT = { god: false, scrap: false, ammo: false, mag: false, onehit: false, noWaves: false, clock: false, fog: false, speed: 1, zAI: 'on', zSpeed: 1, zDmg: 1, zHp: 1 };
try { Object.assign(CHEAT, JSON.parse(localStorage.getItem(CHEAT_KEY) || '{}')); } catch (e) {}
const saveCheats = () => { try { localStorage.setItem(CHEAT_KEY, JSON.stringify(CHEAT)); } catch (e) {} };
const CHEAT_TOGGLES = {
  god: { ico: ['b', 'shield'], name: 'God mode', short: 'God', text: 'Health stays full and nothing can kill you. Bleeding and other effects still show.' },
  scrap: { ico: ['g', 'scrap'], name: 'Infinite scrap', short: '∞ Scrap', text: 'Scrap never drops below 999. Buy anything at the stations.' },
  ammo: { ico: ['g', 'ammo'], name: 'Infinite ammo', short: '∞ Ammo', text: 'Every ammo type stays at 999 in reserve. You still reload.' },
  mag: { ico: ['b', 'tokens_stack'], name: 'Bottomless magazine', short: 'No reload', text: 'The gun in your hands never runs dry: its magazine stays full, so you never have to reload.' },
  onehit: { ico: ['b', 'skull'], name: 'One-hit kills', short: 'One hit', text: 'Anything you hit dies, armour, brutes and all.' },
  noWaves: { ico: ['b', 'flag_triangle'], name: 'Waves off', short: 'Waves off', text: 'No zombies spawn. The break timer stops, and a wave in progress stops sending more.' },
  clock: { ico: ['b', 'hourglass'], name: 'Freeze clock', short: 'Clock frozen', text: 'The time of day stays where you set it, even during a wave.' },
  fog: { ico: ['g', 'night'], name: 'Fog every wave', short: 'Fog', text: 'Every wave is a fog round: it rolls in off the fields as the wave starts (world/mist.js).' }
};
// the switches along the top, always in reach, and the speeds the game can run at
const CH_QUICK = ['god', 'scrap', 'ammo', 'mag', 'onehit', 'noWaves'];
const SPEEDS = [0.25, 0.5, 1, 2];
// (there's a cheat menu in this build: the stub that stands in for this file says not, tools/build.mjs)
export const cheatsBuilt = true;
export let cheatOn = false, cheatTab = 'player', cheatFind = '', cheatLive = 0, cheatShutAt = -1e9;   // (cheatShutAt: when it was last put away, input/keyboard-mouse.js lockLost)
try { cheatTab = localStorage.getItem(CHEAT_KEY + '-tab') || 'player'; } catch (e) {}

// never in co-op: the menu won't open (and shuts if it was), and the switches do nothing there, though they're kept
// for your next game on your own (cheatIs: whether a switch is on and counts, what the rest of the game asks)
const cheatsOff = () => NET.on;
export const cheatIs = k => !!CHEAT[k] && !cheatsOff();
// how fast the game runs (game/loop.js): set from the quick bar, never in co-op
export const cheatSpeed = () => cheatsOff() ? 1 : CHEAT.speed || 1;
// what the zombies' minds are set to (zombies/ai.js, zombies/spawn.js): off (they stand where they are), passive (they
// come for you but never lay a hand on you or the boards), and their speed, their damage to you and new ones' health
const AI_NORMAL = { off: false, passive: false, speed: 1, dmg: 1, hp: 1 };
export const cheatAI = () => cheatsOff() ? AI_NORMAL : { off: CHEAT.zAI === 'off', passive: CHEAT.zAI === 'passive', speed: CHEAT.zSpeed ?? 1, dmg: CHEAT.zDmg ?? 1, hp: CHEAT.zHp ?? 1 };
// every frame of play (game/update.js): keep what the switches promise
export function cheatTick() {
  if (cheatsOff()) { if (cheatOn) toggleCheats(false); const t = $('cheatTag'); if (!t.hidden) t.hidden = true; return; }
  CHEAT_HELD.forEach(k => CHEAT_FX[k].hold && CHEAT_FX[k].hold());
  if (CHEAT.god) P.hp = hpCap();
  if (CHEAT.scrap && S.scrap < 999) S.scrap = 999;
  if (CHEAT.ammo) for (const a in W8.reserve) if (W8.reserve[a] < 999) W8.reserve[a] = 999;
  if (CHEAT.mag) { const id = curId(), D = id && W(id); if (D && !D.melee && !D.akimbo && W8.mag[id] < magSize(id)) W8.mag[id] = magSize(id); }
}
// god mode: a hit that would have killed you leaves you standing (ui/screens.js: startDeath)
export const cheatSaves = () => { if (!cheatIs('god')) return false; P.hp = hpCap(); return true; };

// ---- status effects: each one the status icons top right can show (ui/moodles.js), what turns it on, what keeps it on
// while it's held (every frame, ui/cheats.js: cheatTick) and what clears it. on: whether its icon is showing
const fxHp = f => { P.hp = Math.max(1, Math.round(S.maxHp * f)); };
const CHEAT_FX = {
  bleed: { name: 'Bleeding', text: 'Loses about 1.7 health a second until it stops or a bandage goes on.', on: () => P.bleed > 0, ap: () => { P.bleed = 14; }, hold: () => { P.bleed = Math.max(P.bleed || 0, 2); }, off: () => { P.bleed = 0; } },
  adren: { name: 'Adrenaline', text: '15% faster on your feet, heart racing.', on: () => P.adr > 0, ap: () => { P.adr = 8; }, hold: () => { P.adr = Math.max(P.adr || 0, 0.5); }, off: () => { P.adr = 0; } },
  slowed: { name: 'Slowed', text: 'A hit has you stumbling.', on: () => P.slow > 0.15 && P.slow <= 0.45, ap: () => { P.slow = 0.4; }, hold: () => { P.slow = Math.max(P.slow, 0.3); }, off: () => { P.slow = 0; } },
  pinned: { name: 'Pinned', text: 'Grabbed and barely moving.', on: () => P.slow > 0.45, ap: () => { P.slow = 1; }, hold: () => { P.slow = Math.max(P.slow, 0.9); }, off: () => { P.slow = 0; P.stun = 0; } },
  conc: { name: 'Concussed', text: 'The screen swims and your aim goes wide.', on: () => P.conc > 0.15, ap: () => { P.conc = 1; }, hold: () => { P.conc = Math.max(P.conc || 0, 0.8); }, off: () => { P.conc = 0; } },
  winded: { name: 'Winded', text: 'Out of stamina: no sprinting until it\'s back to half.', on: () => !!(P.exh || P.sprintLock), ap: () => { P.stam = 0; P.exh = P.sprintLock = true; P.sprint = false; }, hold: () => { P.stam = 0; P.exh = P.sprintLock = true; P.sprint = false; }, off: () => { P.stam = stamMax(); P.runDebt = 0; P.exh = P.sprintLock = P.fatigued = false; } },
  healing: { name: 'Healing', text: 'Health coming back over time, as after a bandage.', on: () => P.bandT <= 0 && P.heal > 0, ap: () => { if (P.hp >= S.maxHp) fxHp(0.5); P.heal = (P.heal || 0) + 50; }, hold: () => { P.heal = Math.max(P.heal || 0, 5); }, off: () => { P.heal = 0; } },
  bandaging: { name: 'Bandaging', text: 'A bandage going on (one is added to your bag if you have none).', on: () => P.bandT > 0, ap: () => { P.band = Math.max(P.band || 0, 1); if (P.hp >= S.maxHp && !(P.bleed > 0)) fxHp(0.9); startBandage(); popEl('bands'); }, off: () => { if (P.bandT > 0) { P.bandT = 0; ANIM.healCut = true; } } },
  hurt: { name: 'Hurt', text: 'Down to 60% health. Off while god mode is on.', on: () => P.hp / S.maxHp < 0.7 && P.hp / S.maxHp >= 0.35, ap: () => fxHp(0.6), off: () => { P.hp = hpCap(); } },
  badly: { name: 'Badly hurt', text: 'Down to 20% health. Off while god mode is on.', on: () => P.hp / S.maxHp < 0.35, ap: () => fxHp(0.2), off: () => { P.hp = hpCap(); } },
  last: { name: 'Last stand', text: 'Gives you the Last stand perk if you haven\'t got it, and drops you to 25% health.', on: () => S.lastStand && P.hp / S.maxHp < 0.3, ap: () => { if (!S.lastStand) chSkill('p:Last stand', 1); fxHp(0.25); }, off: () => { P.hp = hpCap(); } },
  wind: { name: 'Second wind ready', text: 'Gives you the Second wind perk if you haven\'t got it, ready to go again.', on: () => S.secondWind && !S.windUsed, ap: () => { if (!S.secondWind) chSkill('p:Second wind', 1); S.windUsed = false; }, off: () => { S.windUsed = true; } },
  heavy: { name: 'Heavy load', text: 'Puts the light machine gun in your hands.', on: () => !!(W(curId()) || {}).slow, ap: () => { exitScope(); if (W8.slot.auto === 'lmg') equip('auto'); else chGive('lmg'); }, off: () => { if ((W(curId()) || {}).slow) equip('side'); } },
  dark: { name: 'Dark', text: 'Sets the clock to midnight.', on: () => curDark > 0.6, ap: () => { setTod(0); }, off: () => { setTod(12); } }
};
// held effects: kept on every frame until you let go (for this page only)
const CHEAT_HELD = new Set();

// ---- the panel ----------------------------------------------------------------------------------------------------
const chEl = $('cheat'), chBody = $('chBody'), chFind = $('chFind');
export function toggleCheats(on) {
  if (cheatsOff() && on !== false) { if (!cheatOn) toast('No cheats in co-op', { kind: 'bad', sub: 'The cheat menu only works in a game on your own' }); return; }
  cheatOn = on === undefined ? !cheatOn : on;
  chEl.hidden = !cheatOn;
  if (!cheatOn) { cheatShutAt = performance.now(); wantLock(); }   // (in first person, the mouse straight back: game/view-cam.js)
  clearInterval(cheatLive);
  if (cheatOn) { renderCheats(); cheatLive = setInterval(cheatLiveTick, 200); }
  else { hideGun(); if (document.activeElement && chEl.contains(document.activeElement)) { document.activeElement.blur(); cv.focus({ preventScroll: true }); } }
  SFX.click();
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chBtn = (label, act, data = {}, cls = '', off = false) => `<button type="button" class="chBtn ${cls}" data-act="${act}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}${off ? ' disabled' : ''}>${label}</button>`;
const chStep = (act, data, label, canDown, canUp, title = '') => `<div class="chStep"${title ? ` title="${esc(title)}"` : ''}>${chBtn('−', act, Object.assign({ d: -1 }, data), 'sq', !canDown)}<span>${label}</span>${chBtn('+', act, Object.assign({ d: 1 }, data), 'sq', !canUp)}</div>`;
const chHead = (t, sub = '', ic = null) => `<h4 class="chH">${ic ? ico(ic) : ''}${t}${sub ? `<small>${sub}</small>` : ''}</h4>`;
const chToggle = k => `<button type="button" class="chTg${CHEAT[k] ? ' on' : ''}" data-act="tg" data-k="${k}" aria-pressed="${CHEAT[k]}"><i class="sw"></i><b>${ico(CHEAT_TOGGLES[k].ico)}${CHEAT_TOGGLES[k].name}</b><em>${CHEAT_TOGGLES[k].text}</em></button>`;
const clockText = h => { const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
// an icon from game-icons.net (['g', name]: ui/game-icons.js) or Kenney's board game pack (['b', name]: ui/board-icons-data.js)
const ico = ([set, k], cls = '') => set === 'b' ? `<svg class="chIco ${cls}" viewBox="${BOARD_VB}" aria-hidden="true"><path d="${BOARD[k]}"/></svg>` : `<svg class="chIco ${cls}" viewBox="${GI_VB}" aria-hidden="true">${GI[k]}</svg>`;
const curseIcon = id => `<svg class="chCi" viewBox="${GI_VB}" aria-hidden="true">${CURSE_ICON[id]}</svg>`;

// the sections down the side: their names and marks (ui/game-icons.js, from game-icons.net)
const RAIL = [['player', 'You', 'person'], ['look', 'Character', 'poloShirt'], ['health', 'Health', 'heartPlus'], ['weapons', 'Weapons', 'pistolGun'], ['skills', 'Skills', 'skills'], ['curses', 'Curses', 'cursedStar'], ['zombies', 'Zombies', 'zombie'], ['world', 'World', 'sunCloud']];
function renderRail() {
  const badge = { curses: (S.curses || []).length, skills: run.taken.filter(t => !t.on && t.r !== 'x').length };
  $('chRail').innerHTML = RAIL.map(([k, name, ico]) => `<button type="button" role="tab" data-tab="${k}" class="${!cheatFind && cheatTab === k ? 'on' : ''}" aria-selected="${!cheatFind && cheatTab === k}"><svg viewBox="${GI_VB}" aria-hidden="true">${GI[ico]}</svg><span>${name}</span>${badge[k] ? `<em>${badge[k]}</em>` : ''}</button>`).join('');
}
function renderQuick() {
  $('chQuick').innerHTML = CH_QUICK.map(k => `<button type="button" class="chQ${CHEAT[k] ? ' on' : ''}" data-act="tg" data-k="${k}" aria-pressed="${CHEAT[k]}" title="${esc(CHEAT_TOGGLES[k].text)}">${ico(CHEAT_TOGGLES[k].ico)}${CHEAT_TOGGLES[k].short}</button>`).join('') +
    '';
  // the game's speed, up beside the search
  $('chSpeed').innerHTML = `<small>${ico(['b', 'hourglass'])}Speed</small>${SPEEDS.map(v => `<button type="button" class="${(CHEAT.speed || 1) === v ? 'on' : ''}" data-act="speed" data-v="${v}">${v === 0.25 ? '¼' : v === 0.5 ? '½' : v}×</button>`).join('')}`;
}
function renderCheats() {
  renderRail(); renderQuick();
  const keepScroll = chBody.scrollTop, q = cheatFind.trim(), view = q ? 'search' : cheatTab;
  chBody.innerHTML = q ? searchAll(q) : (CHEAT_TABS[cheatTab] || CHEAT_TABS.player)();
  // it slides in when the section changes (not on every click inside one), and a weapon's bars grow when it's picked
  chBody.classList.toggle('in', chBody.dataset.view !== view); chBody.dataset.view = view;
  const wc = chBody.querySelector('.chWc'); if (wc && wc.dataset.id !== lastCard) { wc.classList.add('new'); lastCard = wc.dataset.id; }
  // the turning weapon: the one canvas, kept from render to render so it keeps its picture
  const slot = chBody.querySelector('.chViewSlot');
  if (slot) { slot.prepend(gunView); if (slot.classList.contains('fig')) { showFigure(LE.part, LE.fresh, LE.gear); LE.fresh = false; } else showGun(chPick()); } else hideGun();
  chBody.scrollTop = keepScroll;   // (once the view's back in its slot: put back before it, the page would be a view shorter and jump)
  cheatTag(); cheatLiveTick();
}
// the readouts that change on their own while the menu is open
function cheatLiveTick() {
  if (!cheatOn) return;
  const set = (k, v) => chBody.querySelectorAll(`[data-live="${k}"]`).forEach(el => { if (el.textContent !== String(v)) el.textContent = v; });
  set('hp', `${Math.ceil(P.hp)} / ${S.maxHp}`); set('scrap', S.scrap); set('planks', `${S.planks} / ${PLANK_MAX}`); set('bands', `${P.band || 0} / ${bandMax()}`);
  set('clock', clockText(tod)); set('wave', Math.max(0, run.wave)); set('wavenext', phase === 'wave' ? 'In progress' : `Next up: wave ${run.wave + 1}`); set('zeds', zombies.filter(z => !z.dead).length + spawnQ.length);
  set('armed', zombies.filter(z => !z.dead && z.armor && Object.values(z.armor).some(a => !a.broken)).length);
  set('phase', state === 'title' ? 'On the title screen' : phase === 'wave' ? `Wave ${run.wave} in progress` : phase === 'cleared' ? 'Wave cleared' : CHEAT.noWaves ? 'Break (waves off)' : `Break · next wave in ${Math.ceil(Math.max(0, breakT))}s`);
  const id = curId(); if (id && WEAP[id].ammo) set('mag', `${W8.mag[id] || 0} / ${magSize(id)} · ${W8.reserve[W(id).ammo]} spare`);
  const sl = $('chTime'); if (sl && document.activeElement !== sl && Math.abs(+sl.value - tod) > 0.02) sl.value = tod;
  const hs = $('chHp'); if (hs && document.activeElement !== hs && Math.abs(+hs.value - P.hp) > 0.5) hs.value = Math.ceil(P.hp);
  chBody.querySelectorAll('[data-fxon]').forEach(el => el.classList.toggle('on', !!CHEAT_FX[el.dataset.fxon].on()));
}
// a small reminder on the HUD while any switch is on
function cheatTag() {
  const on = Object.keys(CHEAT_TOGGLES).filter(k => CHEAT[k]).map(k => CHEAT_TOGGLES[k].short);
  if ((CHEAT.speed || 1) !== 1) on.push('Speed ' + CHEAT.speed + '×');
  if (CHEAT.zAI !== 'on') on.push('Zombies ' + (CHEAT.zAI === 'off' ? 'switched off' : 'passive'));
  [['zSpeed', 'speed'], ['zDmg', 'damage'], ['zHp', 'health']].forEach(([k, n]) => { if ((CHEAT[k] ?? 1) !== 1) on.push(`Zombie ${n} ${CHEAT[k]}×`); });
  const el = $('cheatTag'); el.hidden = !on.length || cheatsOff();
  el.textContent = on.length ? 'Cheats · ' + on.join(' · ') + ' · F9' : '';
}

// ---- the rows each section is made of, so the search can show any of them ------------------------------------------
const fxRow = k => { const f = CHEAT_FX[k]; return `<div class="chRow chFx" data-fx="${k}"><i class="chDot" data-fxon="${k}"></i><span class="chK">${f.name}<small>${esc(f.text)}</small></span><span class="chGrp">${chBtn('Apply', 'fx', { k })}${f.hold ? chBtn('Hold', 'fxhold', { k }, CHEAT_HELD.has(k) ? 'have' : '') : ''}${chBtn('Clear', 'fxoff', { k }, 'ghost')}</span></div>`; };
const skillRow = r => `<div class="chRow${r.n ? ' have' : ''}"><span class="chK chMod">${esc(r.name)}<small>${esc(r.text)}</small></span>${chStep('skill', { key: r.key }, r.count, r.n > 0, r.canUp)}</div>`;
function curseRow(c) {
  const on = (S.curses || []).includes(c.id), clash = !on && clashes(c.id);
  return `<div class="chCurse${on ? ' on' : ''}${clash ? ' clash' : ''}">${curseIcon(c.id)}<span class="chK"><b>${esc(c.name)}</b><small>${esc(c.text)}${clash ? '<br><i>Clashes with a curse you have: the cards never offer the two together</i>' : ''}</small></span>${on ? chBtn('Lift', 'curse', { id: c.id, d: -1 }, 'ghost') : chBtn('Take', 'curse', { id: c.id, d: 1 }, 'warn')}</div>`;
}
const weapTile = id => { const D = WEAP[id], inHand = curId() === id, own = W8.slot[D.slot] === id;
  return `<button type="button" class="chWt${chPick() === id ? ' sel' : ''}${own ? ' own' : ''}" data-act="pick" data-id="${id}" title="${esc(D.name)}"><b>${esc(D.short || D.name)}</b><small>${D.melee ? 'Melee' : esc(calibre(id))}</small>${inHand ? '<em>In hand</em>' : own ? '<em>Carried</em>' : ''}</button>`; };
// what the search looks through: every switch, status effect, weapon, skill, curse and zombie, by name and what it does
function searchAll(q) {
  const ql = q.toLowerCase(), hit = (...s) => s.join(' ').toLowerCase().includes(ql);
  const parts = [];
  const tg = Object.keys(CHEAT_TOGGLES).filter(k => hit(CHEAT_TOGGLES[k].name, CHEAT_TOGGLES[k].text)); if (tg.length) parts.push(chHead('Switches') + tg.map(chToggle).join(''));
  const fx = Object.keys(CHEAT_FX).filter(k => hit(CHEAT_FX[k].name, CHEAT_FX[k].text)); if (fx.length) parts.push(chHead('Status effects') + fx.map(fxRow).join(''));
  const wp = Object.keys(WEAP).filter(id => hit(WEAP[id].name, WEAP[id].short || '', SLOT_NAME[WEAP[id].slot], WEAP[id].melee ? '' : calibre(id))); if (wp.length) parts.push(chHead('Weapons', 'Pick one to look it over, then give it to yourself') + `<div class="chWeaps">${wp.map(weapTile).join('')}</div>`);
  const sk = chSkillRows().filter(r => hit(r.name, r.text, r.kind)); if (sk.length) parts.push(chHead('Skills and perks') + sk.map(skillRow).join(''));
  const cu = CURSES.filter(c => hit(c.name, c.text, 'curse')); if (cu.length) parts.push(chHead('Curses') + cu.map(curseRow).join(''));
  if (hit('zombie ai minds passive switched off hunting speed damage health')) parts.push(mindsCard());
  if (hit('character look appearance face hair beard hat top shirt trousers shoes skin eyes gloves wrist watch customise customize')) parts.push(chHead('Character') + `<div class="chBtns">${chBtn(ico(['g', 'poloShirt']) + 'Change how you look', 'goto', { t: 'look' }, 'big')}</div>`);
  const zt = Object.keys(ZT).filter(t => hit(t, 'zombie spawn')); if (zt.length) parts.push(chHead('Zombies') + `<div class="chBtns">${zt.map(t => chBtn('Send in a ' + t, 'spawn', { t, n: 1 })).join('')}</div>`);
  return parts.join('') || `<p class="chNone">Nothing matches “${esc(q)}”.</p>`;
}

const CHEAT_TABS = {
  player() {
    return chHead('Switches') + `<div class="chTgs">${['god', 'scrap', 'ammo', 'mag', 'onehit'].map(chToggle).join('')}</div>` +
      chHead('Supplies', '', ['b', 'pouch']) + `<div class="chCard">` +
      `<div class="chRow"><span class="chK">${ico(['g', 'bandage'], 'lead')}Bandages</span><b data-live="bands"></b>${chBtn('Fill', 'bands')}</div>` +
      `<div class="chRow"><span class="chK">${ico(['g', 'scrap'], 'lead')}Scrap</span><b data-live="scrap"></b><span class="chGrp">${chBtn('+50', 'scrap', { n: 50 })}${chBtn('+500', 'scrap', { n: 500 })}${chBtn('0', 'scrap', { n: 0 })}</span></div>` +
      `<div class="chRow"><span class="chK">${ico(['g', 'planks'], 'lead')}Planks</span><b data-live="planks"></b>${chBtn('Fill', 'planks')}</div>` +
      `<div class="chRow"><span class="chK">${ico(['g', 'ammo'], 'lead')}Ammo</span><b data-live="mag" class="wide">—</b>${chBtn('Refill all', 'ammo')}</div></div>` +
      `<div class="chBtns">${chBtn('Refill everything', 'refill', {}, 'big')}</div>`;
  },
  health() {
    return chHead('Health', '', ['b', 'suit_hearts']) + `<div class="chCard">` +
      `<div class="chHp"><b data-live="hp" class="chClock"></b><input id="chHp" type="range" min="1" max="${S.maxHp}" step="1" value="${Math.ceil(P.hp)}" aria-label="Health"></div>` +
      (CHEAT.god ? '<p class="chNote">God mode is on, so your health goes straight back to full. Switch it off up top to stay hurt.</p>' : '') +
      `<div class="chRow"><span class="chK">Hurt yourself<small>A hit from a random side, with the flinch and the red edge</small></span><span class="chGrp">${[10, 25, 50].map(n => chBtn('−' + n, 'hurt', { n }, 'warn')).join('')}</span></div>` +
      `<div class="chRow"><span class="chK">Heal yourself</span><span class="chGrp">${[10, 25].map(n => chBtn('+' + n, 'healn', { n })).join('')}${chBtn('Full', 'heal')}</span></div>` +
      `<div class="chRow"><span class="chK">Max health</span><b>${S.maxHp}</b>${chStep('maxhp', {}, '±25', S.maxHp > 25, true)}</div></div>` +
      chHead('Status effects', 'The icons top right. Apply sets it off once; Hold keeps it on until you let go', ['b', 'flask_full']) +
      Object.keys(CHEAT_FX).map(fxRow).join('') +
      `<div class="chBtns">${chBtn('Clear every effect', 'fxall', {}, 'warn')}</div>`;
  },
  weapons() {
    const pk = chPick(), PD = WEAP[pk];
    let h = `<div class="chViewSlot">${PD ? weapCard(pk) : ''}</div>`;
    for (const s of SLOTS) {
      h += chHead(SLOT_NAME[s]) + `<div class="chWeaps">` + Object.keys(WEAP).filter(id => WEAP[id].slot === s).map(weapTile).join('') +
        (s === 'long' || s === 'auto' ? `<button type="button" class="chWt ghost" data-act="empty" data-s="${s}"${W8.slot[s] ? '' : ' disabled'}><b>Empty</b><small>Nothing in the slot</small></button>` : '') + '</div>';
    }
    const id = curId(), D = id && WEAP[id];
    if (!D) return h;
    h += chHead(`In your hands: ${esc(D.name)}`, 'Upgrades, rounds and mods, straight onto it');
    if (!D.melee) {
      const lines = CH_GUN_LINES.filter(k => chLineFits(k, id));
      h += '<div class="chCard">' + lines.map(k => {
        const n = ownTier(id, k), max = tierMax(k, id), up = tierFits(k, id) && (k !== 'choke' || D.ammo === 'shells');
        const why = !up && n < max ? (k === 'supp' || k === 'choke' ? 'The muzzle is taken' : '') : '';
        return `<div class="chRow"><span class="chK">${CH_LINE[k]}</span><span class="chTier">${n ? esc(tierName(k, n - 1, id)) : '<i>None</i>'}<small>${n}/${max}${why ? ' · ' + why : ''}</small><u style="--f:${max ? n / max : 0}"></u></span>${chStep('tier', { k }, '', n > 0, up)}</div>`;
      }).join('') + '</div>';
    }
    // the kinds of round it takes: give and load any of them (weapons/rounds.js)
    if (!D.melee && roundTypes(id).length > 1) {
      h += chHead('Rounds');
      h += roundTypes(id).map(k => { const own = roundOwned(id, k), on = roundOn(id) === k;
        return `<div class="chRow${own ? ' have' : ''}"><span class="chK chMod" title="${esc(roundText(id, k))}">${esc(roundName(id, k))}<small>${on ? 'Loaded' : own ? 'Owned' : esc(roundText(id, k))}</small></span>${chBtn(on ? 'Loaded' : 'Load', 'round', { k }, '', on)}</div>`; }).join('');
    }
    const mods = Object.keys(MODS).filter(m => MODS[m].w === id);
    if (mods.length) {
      h += chHead('Mods');
      h += mods.map(m => {
        const have = hasMod(m), lv = modLv(m), upOk = have && MOD_UP[m] && lv < MOD_MAX;
        const why = have ? '' : modReplaced(m) ? 'Replaced by a better mod' : MODS[m].need && !(hasMod(MODS[m].need) && modLv(MODS[m].need) >= (MODS[m].needLv || 1)) ? `Needs ${MODS[MODS[m].need].name}${MODS[m].needLv > 1 ? ' ' + roman(MODS[m].needLv) : ''}` : MODS[m].muzzle && muzzleTaken(id) ? 'The muzzle is taken' : '';
        return `<div class="chRow${have ? ' have' : ''}"><span class="chK chMod" title="${esc(MODS[m].text)}">${esc(have ? modName(m) : MODS[m].name)}<small>${have ? 'Level ' + roman(lv) + ' of ' + (MOD_UP[m] ? MOD_MAX : 1) : why || esc(MODS[m].text)}</small></span>` +
          (have ? chStep('mod', { m }, '', true, upOk) : chBtn('Add', 'mod', { m, d: 1 }, '', !modOffer(m))) + '</div>';
      }).join('');
    }
    h += chHead('Whole weapon') + `<div class="chRow"><span class="chK">Workbench tune-up</span><b class="wide">${W8.tune[id] ? 'Tuned' : 'Stock'}</b>${chBtn(W8.tune[id] ? 'Remove' : 'Tune up', 'tune')}</div>` +
      `<div class="chBtns">${chBtn('Strip to stock', 'stock', {}, 'warn')}${D.melee ? '' : chBtn('Max every upgrade', 'maxgun')}</div>`;
    return h;
  },
  skills() {
    const rows = chSkillRows();
    let h = `<div class="chBtns top">${chBtn('Remove all', 'noskills', {}, 'warn')}</div>`;
    for (const kind of ['Skill', 'Perk', 'Gear']) {
      const ks = rows.filter(r => r.kind === kind); if (!ks.length) continue;
      h += chHead(kind === 'Gear' ? 'Tiered (armour, boots, senses…)' : kind + 's') + ks.map(skillRow).join('');
    }
    return h;
  },
  curses() {
    const have = (S.curses || []).length, left = curseRewards().length;
    return chHead('Curses', have ? `${have} on you, shown under your health bar` : 'Taken here, a curse is on you at once, with nothing given for it', ['g', 'cursedStar']) +
      CURSES.map(curseRow).join('') +
      (have ? `<div class="chBtns">${chBtn('Lift every curse', 'nocurses', {}, 'ghost')}</div>` : '') +
      chHead('Sacrifices', 'Promise the next hand of cards an offer', ['b', 'cards_fan']) +
      `<div class="chCard"><div class="chRow"><span class="chK">Next hand offers<small>${SAC.force ? `A ${SAC.force} sacrifice, once the wave's done` : 'Whatever the odds give it'}${left < 3 ? ' · too few legendaries left for a curse to pay for' : ''}</small></span><span class="chGrp">${chBtn('Scrap', 'sacforce', { k: 'scrap' }, SAC.force === 'scrap' ? 'have' : '')}${chBtn('Curse', 'sacforce', { k: 'curse' }, SAC.force === 'curse' ? 'have' : '')}${chBtn(ico(['b', 'dice']) + 'Chance', 'sacforce', { k: '' }, 'ghost', !SAC.force)}</span></div></div>`;
  },
  zombies() {
    return mindsCard() + chHead('Waves', '', ['b', 'flag_triangle']) + `<div class="chTgs">${chToggle('noWaves')}</div>` + `<div class="chCard">` +
      `<div class="chRow"><span class="chK">Now</span><b data-live="phase" class="wide"></b></div>` +
      `<div class="chRow"><span class="chK">Wave<small data-live="wavenext"></small></span><b data-live="wave"></b>${chStep('wave', {}, '', run.wave > 0, true)}</div>` +
      `<div class="chRow"><span class="chK">Zombies left</span><b data-live="zeds"></b><span class="chGrp">${chBtn(ico(['b', 'skull']) + 'Kill all', 'killall', {}, 'warn')}${chBtn('Next wave now', 'nextwave', {}, '', CHEAT.noWaves || phase !== 'break' || state === 'title')}</span></div></div>` +
      chHead('Send one in', 'Any kind, in any outfit, at the fence or right in front of you', ['g', 'zombie']) +
      `<div class="chCard chSpawn">` +
      `<div class="chSeg" data-seg="t">${Object.keys(ZT).map(t => `<button type="button" class="${SPAWN.t === t ? 'on' : ''}" data-act="seg" data-g="t" data-v="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>` +
      `<div class="chSeg" data-seg="j">${SPAWN_JOBS.map(([j, n]) => `<button type="button" class="${SPAWN.j === j ? 'on' : ''}" data-act="seg" data-g="j" data-v="${j}">${n}</button>`).join('')}</div>` +
      `<div class="chSeg" data-seg="at">${[['edge', 'At the fence'], ['near', 'In front of you']].map(([a, n]) => `<button type="button" class="${SPAWN.at === a ? 'on' : ''}" data-act="seg" data-g="at" data-v="${a}">${n}</button>`).join('')}</div>` +
      `<div class="chBtns">${[1, 5, 10].map(n => chBtn(`Send ${n}`, 'spawn', { n }, n === 1 ? 'big' : '', state !== 'play')).join('')}</div></div>` +
      chHead('Armour', 'On the zombies wearing it', ['b', 'shield']) +
      `<div class="chCard"><div class="chRow"><span class="chK">Wearing armour</span><b data-live="armed"></b><span class="chGrp">${chBtn('Crack it', 'armor', { k: 'crack' })}${chBtn('Break it off', 'armor', { k: 'break' }, 'warn')}</span></div></div>`;
  },
  look() { return lookSection(); },
  world() {
    return viewCard() + chHead('Time of day', '', ['b', 'hourglass']) + `<div class="chCard"><div class="chTime"><b data-live="clock" class="chClock"></b><input id="chTime" type="range" min="0" max="23.99" step="0.05" value="${tod}" aria-label="Time of day"></div>` +
      `<div class="chBtns">${[['Midnight', 0], ['Dawn', 6], ['Noon', 12], ['Afternoon', 15], ['Dusk', 18.5], ['Night', 21]].map(([l, h]) => chBtn(`${l}<small>${clockText(h)}</small>`, 'time', { h })).join('')}</div></div>` +
      `<div class="chTgs">${chToggle('clock')}${chToggle('fog')}</div>`;
  }
};

// ---- the camera: the isometric view, first person, or the free camera flying anywhere (game/view-cam.js) ------------------
const VIEWS = [['iso', 'Isometric', 'From above the farm, as the game is played.'], ['fp', 'First person', 'Out of your own eyes: the mouse looks about, W A S D walk you where you face. The view key (#) switches to it and back.'],
  ['free', 'Free camera', 'Fly anywhere to watch: W A S D where it looks, Space and Ctrl up and down, Shift faster, the wheel its speed. Every zombie shows, wherever it is. You stand where you were.']];
function viewCard() {
  const v = VIEWS.find(x => x[0] === VCAM.mode) || VIEWS[0];
  return chHead('Camera', 'How you see the farm', ['g', 'cctvCamera']) + `<div class="chCard chSpawn">` +
    `<div class="chSeg">${VIEWS.map(([k, n]) => `<button type="button" class="${VCAM.mode === k ? 'on' : ''}" data-act="view" data-v="${k}">${k === 'free' ? ico(['g', 'binoculars']) : ''}${n}</button>`).join('')}</div>` +
    `<p class="chNote">${v[2].replace('#', keyOn('view'))}</p></div>`;
}

// ---- zombies' minds: on, passive or off, and how fast, how hard and how tough ------------------------------------------
const MINDS = [['on', 'Hunting', 'As the game has them: they come for you, tear at the boards and hit you.'], ['passive', 'Passive', 'They come for you and crowd round, but never hit you or tear at the boards; spitters hold their acid and brutes never charge.'],
  ['off', 'Switched off', 'They stand where they are and do nothing at all, wherever they were.']];
const chSlider = (label, k, min, max, step, sub = '') => `<div class="chSl"><span class="chK">${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="range" data-ck="${k}" min="${min}" max="${max}" step="${step}" value="${CHEAT[k] ?? 1}" aria-label="${esc(label)}"><b data-slv="${k}">${(+(CHEAT[k] ?? 1)).toFixed(2)}×</b></div>`;
function mindsCard() {
  const m = MINDS.find(x => x[0] === CHEAT.zAI) || MINDS[0], normal = CHEAT.zAI === 'on' && ['zSpeed', 'zDmg', 'zHp'].every(k => (CHEAT[k] ?? 1) === 1);
  return chHead('Zombie minds', 'What they do, and how fast, how hard and how tough', ['g', 'brain']) + `<div class="chCard chSpawn">` +
    `<div class="chSeg">${MINDS.map(([v, n]) => `<button type="button" class="${CHEAT.zAI === v ? 'on' : ''}" data-act="zai" data-v="${v}">${n}</button>`).join('')}</div><p class="chNote">${m[2]}</p>` +
    chSlider('Speed', 'zSpeed', 0.25, 3, 0.05, 'How fast they walk, run and crawl') + chSlider('Damage to you', 'zDmg', 0, 3, 0.05, 'How hard their hits land on you') + chSlider('Health', 'zHp', 0.25, 5, 0.05, 'How tough the ones that turn up from now on are') +
    `<div class="chBtns">${chBtn('Back to normal', 'zreset', {}, 'ghost', normal)}</div></div>`;
}

// ---- you: every part of your look, changed and built on you at once (ui/look-editor.js), the studio gliding in to it ----
function lookSection() {
  const name = (LOOK_TABS.find(t => t[0] === LE.part) || LOOK_TABS[0])[1], whole = LE.part === 'body';
  return `<div class="chViewSlot fig"><div class="chFigTools"><button type="button" class="chLkT${LE.gear ? ' on' : ''}" data-act="lkgear" aria-pressed="${LE.gear}"><i class="sw"></i>Upgrade gear</button><span>Drag to turn · scroll to zoom</span></div>` +
    `<div class="chFigNav">${LOOK_TABS.map(([k, n]) => `<button type="button" class="${LE.part === k ? 'on' : ''}" data-act="lkpart" data-p="${k}">${n}</button>`).join('')}</div></div>` +
    `<div class="chLkHead">${chHead(whole ? 'All of you' : name, whole ? 'Pick a part to change it' : 'Changes go on you straight away')}${chBtn(ico(['g', 'dice']) + (whole ? 'Re-roll everything' : 'Re-roll the ' + name.toLowerCase()), 'lkrand', { p: LE.part }, whole ? 'warn' : '')}</div>` +
    `<div class="chLook">${lookEditor(LE.part)}</div>` +
    `<div class="chLkTs chLkKeep">${lookKeepSwitch()}</div>`;
}
// ---- weapons: the one picked (looked over in 3D) and its card ---------------------------------------------------------
let cheatPick = null, lastCard = null;
// the calibre a gun fires as it is now: its own (WEAP: cal), or what a conversion kit makes of it
const calibre = id => { const D = W(id) || WEAP[id]; return D.tenmm ? '10mm Auto' : id === 'scar' && hasMod('akkit') ? '7.62×39mm' : WEAP[id].cal || ''; };
const chPick = () => (cheatPick && WEAP[cheatPick]) ? cheatPick : curId() || 'pistol';
// how each of a weapon's numbers compares with the best of its kind, for the bars on its card
const STAT_TOP = () => { const g = Object.values(WEAP).filter(D => !D.melee); return { dmg: Math.max(...g.map(D => D.dmg * (D.pellets || 1))), rps: Math.max(...g.map(D => 1 / D.rate)), mag: Math.max(...g.map(D => D.mag || 0)), rel: Math.max(...g.map(D => D.reload || 0)) }; };   // (worked out when a card's drawn: upgrades change them)
function weapCard(id) {
  const D = W(id) || WEAP[id], B = WEAP[id], top = STAT_TOP(), inHand = curId() === id, own = W8.slot[B.slot] === id;
  const bar = (name, v, f, txt) => `<div class="chSt"><span>${name}</span><u style="--f:${Math.max(0.04, Math.min(1, f)).toFixed(3)}"></u><b>${txt}</b></div>`;
  const stats = B.melee ? bar('Damage', D.dmg, D.dmg / 120, Math.round(D.dmg)) + bar('Reach', D.range || 1, (D.range || 1) / 2.4, (D.range || 1).toFixed(1) + ' m')
    : bar('Damage', D.dmg, D.dmg * (D.pellets || 1) / top.dmg, Math.round(D.dmg) + (D.pellets > 1 ? ` × ${D.pellets}` : '')) + bar('Fire rate', 1 / D.rate, (1 / D.rate) / top.rps, Math.round(60 / D.rate) + ' rpm') +
      bar('Magazine', D.mag, (magSize(id) || D.mag) / top.mag, magSize(id) || D.mag) + bar('Reload', D.reload, 1 - D.reload / (top.rel * 1.15), (D.reload || 0).toFixed(1) + ' s');
  return `<div class="chWc" data-id="${id}"><div class="chWcHead"><b>${esc(B.name)}</b><small>${SLOT_NAME[B.slot]}${inHand ? ' · in your hands' : own ? ' · carried' : ''}</small>${B.melee ? '' : `<span class="chCal">${ico(['g', 'ammo'])}${esc(calibre(id))}</span>`}</div><div class="chWcStats">${stats}</div>` +
    `<div class="chBtns">${inHand ? chBtn('In your hands', 'give', { id }, 'have', true) : chBtn(own ? 'Take it out' : 'Give it to me', 'give', { id }, 'big')}</div><p class="chHint">${keyIcon('mouse1')} turn it ${keyIcon('mouse2')} move it ${keyIcon('mouse3')} zoom · double-click to reset</p></div>`;
}

// ---- the gun in your hands ----------------------------------------------------------------------------------------
const CH_GUN_LINES = ['ammo', 'trigger', 'mag', 'supp', 'choke', 'sight', 'laser', 'light', 'loader'];
const CH_LINE = { ammo: 'Powder', trigger: 'Trigger', mag: 'Magazine', supp: 'Suppressor', choke: 'Choke', sight: 'Sight', laser: 'Laser', light: 'Light', loader: 'Speed loader' };
function chLineFits(k, id) {
  const D = WEAP[id];
  if (tierMax(k, id) <= 0) return false;
  if (k === 'choke') return D.ammo === 'shells';
  if (k === 'sight' && NO_SIGHT.has(id)) return false;
  if (k === 'loader') return id === 'revolver' || id === 'scar' || !!D.breakOpen;
  return true;
}
// change the weapon, then let it take the change at once: a new magazine goes straight in, topped up
function chGun(id, fn) {
  exitScope();
  magChange(id, fn);
  delete W8.pin[id]; recomputeEff(); buildGuns(); glowGun(id);
  if (!W(id).melee) W8.mag[id] = magSize(id);
}
// a weapon into its slot and your hands, the way one off the radio arrives (stations/supply-drop.js): giveWeapon only
// changes the stats, so the models in your hands and on your back are rebuilt for it too
function chGive(id) { exitScope(); giveWeapon(id); buildGuns(); glowGun(id); }
function chRemoveMod(id, m) {
  W8.mods[id] = (W8.mods[id] || []).filter(k => k !== m && MODS[k].need !== m);   // and anything that needed it
  Object.keys(MODS).forEach(k => { if (!(W8.mods[id] || []).includes(k) && MODS[k].w === id) delete W8.modLv[k]; });
  if (W8.fm[id] && !(W8.mods[id] || []).includes(W8.fm[id]) && W8.fm[id] !== 'semi') W8.fm[id] = null;
  recomputeEff();
}

// ---- skills and perks -----------------------------------------------------------------------------------------------
// every skill and perk the cards after a wave can give you (not aid, weapons or the Gunsmith, which works on a gun), and
// the tiered lines (armour, boots, hammer, senses, feeding). A plain one counts how often you took it (run.taken), a
// tiered one its step
const CH_TIER_NAME = { armor: 'Body armour', boots: 'Footwear', hammer: 'Hammer', eyes: 'Awareness', night: 'Night vision', feed: 'Feeding', strong: 'Strong arms', rungun: 'Run and gun', soles: 'Thick soles', walkw: 'Walking wounded', quick: 'Quick hands' };
const chPlain = () => UPG.filter(u => !u.weaponOf && !u.tierOf && !u.card && !AID.has(u.name));
const chTiers = () => UPG.filter(u => u.tierOf).map(u => u.tierOf);
const takenN = name => { const h = run.taken.find(t => t.name === name && !t.on); return h ? h.n : 0; };
function chSkillRows() {
  const plain = chPlain().map(u => { const n = takenN(u.name); return { key: 'p:' + u.name, kind: SKILLS.has(u.name) ? 'Skill' : 'Perk', name: u.name, text: u.text, n, count: n ? (n > 1 ? '×' + n : 'Have') : '0', canUp: !!(!u.can || u.can()) }; });
  const tiers = chTiers().map(k => { const L = TIERS[k], n = S.tier[k], st = L.t[Math.min(n, L.t.length - 1)];
    return { key: 't:' + k, kind: 'Gear', name: CH_TIER_NAME[k] || L.tag, text: n ? L.t[n - 1].name + (n < L.t.length ? ' · next: ' + st.name + ', ' + st.text : ' · maxed') : st.name + ': ' + st.text, n, count: n + '/' + L.t.length, canUp: n < L.t.length && (!L.can || L.can()) }; });
  return plain.concat(tiers);
}
// in the run's history (the pause screen's list) the same way a card puts it there (upgrades/upgrade-screen.js)
function chLog(name, tag, text, r, d) {
  const i = run.taken.findIndex(t => t.name === name && !t.on);
  if (d > 0) { if (i >= 0) { run.taken[i].n++; run.taken[i].wave = Math.max(1, run.wave); } else run.taken.push({ name, on: '', tag, text, r, wave: Math.max(1, run.wave), n: 1, total: '' }); }
  else if (i >= 0) { if (--run.taken[i].n <= 0) run.taken.splice(i, 1); }
}
// what the skills you have make of the stats a run starts with: plain [[card, times]], tiers { line: step }; the curses
// on you count too (their stats only: upgrades/sacrifice.js), so taking a skill away never lifts one
function replaySkills(plain, tiers) {
  const keep = S, hp = P.hp, cursed = (keep.curses || []).map(id => CURSES.find(c => c.id === id)).filter(Boolean);
  setS(freshStats());
  try {
    plain.forEach(([u, n]) => { for (let i = 0; i < n; i++) u.ap(); });
    for (const k in tiers) for (let i = 0; i < tiers[k]; i++) { TIERS[k].t[S.tier[k]].ap(); S.tier[k]++; }
    cursed.forEach(c => c.st());
    return S;
  } finally { setS(keep); P.hp = hp; }
}
// taking a skill away: work out the stats with and without it from a fresh start, and set only the stats skills touch
// to the without, so scrap, planks, what you bought at the bench and the like stay as they are
function setSkills(plain, tiers) {
  const base = freshStats(), now = replaySkills(chPlain().map(u => [u, takenN(u.name)]), Object.fromEntries(chTiers().map(k => [k, S.tier[k]])));
  const next = replaySkills(plain, tiers);
  for (const k in base) if (typeof base[k] !== 'object' && (now[k] !== base[k] || next[k] !== base[k])) S[k] = next[k];
  for (const k of chTiers()) S.tier[k] = next.tier[k];
  P.hp = Math.min(P.hp, hpCap());
}
function chSkill(key, d) {
  const [t, nm] = [key.slice(0, 1), key.slice(2)];
  if (t === 'p') {
    const u = chPlain().find(x => x.name === nm); if (!u) return;
    if (d > 0) { if (u.can && !u.can()) return; u.ap(); }
    else { const n = takenN(nm); if (!n) return; setSkills(chPlain().map(x => [x, x === u ? n - 1 : takenN(x.name)]), Object.fromEntries(chTiers().map(k => [k, S.tier[k]]))); }
    chLog(u.name, u.tag, u.text, u.r, d);
  } else {
    const L = TIERS[nm], n = S.tier[nm]; if (!L) return;
    if (d > 0) { if (n >= L.t.length || (L.can && !L.can())) return; L.t[n].ap(); S.tier[nm]++; chLog(L.t[n].name, `${L.tag} · Tier ${n + 1} of ${L.t.length}`, L.t[n].text, L.t[n].r, 1); }
    else { if (!n) return; setSkills(chPlain().map(x => [x, takenN(x.name)]), Object.fromEntries(chTiers().map(k => [k, k === nm ? n - 1 : S.tier[k]]))); chLog(L.t[n - 1].name, '', '', '', -1); }
  }
  buildGuns();   // armour and the like show on you
}
function chNoSkills() {
  const names = new Set(chPlain().map(u => u.name)); chTiers().forEach(k => TIERS[k].t.forEach(st => names.add(st.name)));
  setSkills([], {});
  run.taken = run.taken.filter(t => t.on || !names.has(t.name));
  buildGuns();
}

// ---- zombies: what the next one sent in is (its kind, its outfit, where) ---------------------------------------------
const SPAWN = { t: 'walker', j: '', at: 'edge' };
const SPAWN_JOBS = [['', 'Any outfit'], ['swat', 'SWAT'], ['riot', 'Riot'], ['soldier', 'Soldier'], ['construction', 'Builder']];
function chSpawn(t, n) {
  if (state !== 'play') return;
  for (let i = 0; i < n; i++) {
    spawnZombie(t || SPAWN.t, SPAWN.j || undefined); const z = zombies[zombies.length - 1];
    if (SPAWN.at === 'near') { const a = P.aim + (i - (n - 1) / 2) * 0.35, d = 2.6 + (i % 3) * 0.5; z.x = P.x + Math.sin(a) * d; z.z = P.z + Math.cos(a) * d; z.out = false; z.face = a + Math.PI; }
  }
}

// ---- what the buttons do ----------------------------------------------------------------------------------------------
const CHEAT_ACTS = {
  tg: d => { CHEAT[d.k] = !CHEAT[d.k]; saveCheats(); if (CHEAT[d.k]) cheatTick(); },
  speed: d => { CHEAT.speed = +d.v; saveCheats(); },
  heal: () => { P.hp = hpCap(); P.bleed = 0; P.slow = 0; },
  healn: d => { P.hp = Math.min(hpCap(), P.hp + +d.n); },
  // a hit like a zombie's (zombies/ai.js), from a random side: no armour, no dodging it
  hurt: d => { if (P.dead) return; const a = rand() * Math.PI * 2; P.hp -= +d.n; P.hitFrom = a; hitFromAt(P.x + Math.sin(a) * 2, P.z + Math.cos(a) * 2); interruptBandage();
    addBlood(0.05); ANIM.flinch = 1; ANIM.flinchSide = rand() < 0.5 ? -1 : 1; SFX.hurt(); setShake(Math.max(shake, 0.22)); burst(P.x, 1, P.z, 6, 'blood');
    if (P.hp <= 0) { P.hp = 0; startDeath(); } },
  fx: d => { if (!P.dead) CHEAT_FX[d.k].ap(); },
  fxhold: d => { if (CHEAT_HELD.has(d.k)) CHEAT_HELD.delete(d.k); else { CHEAT_HELD.add(d.k); CHEAT_FX[d.k].ap(); } },
  fxoff: d => { CHEAT_HELD.delete(d.k); CHEAT_FX[d.k].off(); },
  fxall: () => { CHEAT_HELD.clear(); ['bleed', 'adren', 'pinned', 'conc', 'winded', 'healing', 'bandaging'].forEach(k => CHEAT_FX[k].off()); },
  maxhp: d => { S.maxHp = Math.max(25, S.maxHp + 25 * d.d); P.hp = d.d > 0 ? P.hp + 25 : Math.min(P.hp, S.maxHp); },
  bands: () => { P.band = bandMax(); popEl('bands'); },
  scrap: d => { S.scrap = +d.n ? S.scrap + +d.n : 0; popEl('scrap'); },
  planks: () => { S.planks = PLANK_MAX; popEl('planks'); },
  ammo: () => { SLOTS.forEach(s => { const id = W8.slot[s]; if (id && WEAP[id].ammo) { W8.mag[id] = magSize(id); W8.reserve[W(id).ammo] = Math.max(W8.reserve[W(id).ammo], 3 * AMMO_CAN[W(id).ammo]); } }); },
  refill: () => { CHEAT_ACTS.ammo(); CHEAT_ACTS.bands(); CHEAT_ACTS.planks(); CHEAT_ACTS.heal(); },
  pick: d => { cheatPick = d.id; },
  give: d => { cheatPick = d.id; chGive(d.id); feed('gear', 0, WEAP[d.id].name); },
  empty: d => { if (!W8.slot[d.s]) return; if (W8.cur === d.s) equip('side', true); W8.slot[d.s] = null; buildGuns(); },
  tier: d => { const id = curId(), k = d.k, n = ownTier(id, k), dd = +d.d;
    if (dd > 0 ? !tierFits(k, id) : n <= 0) return;
    chGun(id, () => { fitTier(id, k, n + dd); W8.own[id][k] = n + dd; }); },   // down a step is gone, not just taken off
  mod: d => { const id = curId(), m = d.m, dd = +d.d;
    if (!hasMod(m)) { if (dd > 0 && modOffer(m)) chGun(id, () => addMod(id, m)); return; }
    const lv = modLv(m);
    if (dd > 0) { if (MOD_UP[m] && lv < MOD_MAX) chGun(id, () => improveMod(m)); }
    else chGun(id, () => { if (lv > 1) { W8.modLv[m] = lv - 1; recomputeEff(); } else chRemoveMod(id, m); }); },
  tune: () => { const id = curId(); chGun(id, () => { if (W8.tune[id]) delete W8.tune[id]; else W8.tune[id] = 1; }); },
  stock: () => { const id = curId(); chGun(id, () => { W8.gt[id] = {}; (W8.mods[id] || []).forEach(m => delete W8.modLv[m]); W8.mods[id] = []; W8.fm[id] = null; delete W8.tune[id]; delete W8.rounds[id]; delete W8.att[id]; W8.own[id] = {}; delete W8.ownAtt[id]; }); },
  round: d => { const id = curId(); exitScope(); loadRound(id, d.k, true); glowGun(id); },
  maxgun: () => { const id = curId(); chGun(id, () => { W8.gt[id] = W8.gt[id] || {}; for (const k of CH_GUN_LINES) if (chLineFits(k, id)) while (tierFits(k, id)) fitTier(id, k, ownTier(id, k) + 1); recomputeEff(); }); },
  skill: d => chSkill(d.key, +d.d),
  noskills: () => chNoSkills(),
  curse: d => { const c = CURSES.find(x => x.id === d.id); if (!c) return; if (+d.d > 0) { if (c.can()) takeCurse(c); } else dropCurse(c); },
  nocurses: () => { CURSES.forEach(dropCurse); },
  sacforce: d => { SAC.force = d.k || null; },
  zai: d => { CHEAT.zAI = d.v; saveCheats(); },
  // (first person's kept in the settings; the free camera's only for now, and the menu closes to fly it)
  view: d => { pickView(d.v); if (d.v === 'free') toggleCheats(false); },   // (ui/settings.js)
  zreset: () => { CHEAT.zAI = 'on'; CHEAT.zSpeed = CHEAT.zDmg = CHEAT.zHp = 1; saveCheats(); },
  goto: d => { cheatTab = d.t; cheatFind = ''; chFind.value = ''; chBody.scrollTop = 0; },
  ...Object.fromEntries(['lkpart', 'lkgear', 'lk', 'lkwrist', 'lkrand', 'lkkeep'].map(a => [a, d => lookAct(a, d)])),   // your look (ui/look-editor.js)
  seg: d => { SPAWN[d.g] = d.v; },
  spawn: d => chSpawn(d.t, +d.n || 1),
  armor: d => { zombies.filter(z => !z.dead && z.armor).forEach(z => Object.keys(z.armor).forEach(k => { if (d.k === 'crack') crackArmor(z, k); else breakArmor(z, k, rand() - 0.5, rand() - 0.5); })); },
  wave: d => { run.wave = Math.max(0, run.wave + +d.d); },
  killall: () => { spawnQ.length = 0; zombies.filter(z => !z.dead).forEach(z => killZombie(z, 0, 1, curId(), 'torso', 0)); },
  nextwave: () => { if (phase === 'break' && !CHEAT.noWaves) setBreakT(0); },
  time: d => { setTod(+d.h); }
};
chEl.addEventListener('click', e => {
  const t = e.target.closest('#chRail [data-tab]');
  if (t) { cheatTab = t.dataset.tab; cheatFind = ''; chFind.value = ''; try { localStorage.setItem(CHEAT_KEY + '-tab', cheatTab); } catch (er) {} chBody.scrollTop = 0; renderCheats(); SFX.click(); return; }
  if (e.target.closest('#chClose')) { toggleCheats(false); return; }
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const fn = CHEAT_ACTS[b.dataset.act]; if (!fn) return;
  fn(b.dataset); SFX.click(); renderCheats();
});
// a weapon double-clicked goes straight into your hands
chEl.addEventListener('dblclick', e => { const b = e.target.closest('[data-act="pick"]'); if (b) { CHEAT_ACTS.give(b.dataset); renderCheats(); } });
// buttons don't take the keyboard's focus, so Space and the number keys still go to the game after a click
chEl.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); if (e.button === 1 || e.button === 2) e.stopPropagation(); });   // (a middle or right drag on the turning gun moves it, nothing the game's bound to those buttons)
chEl.addEventListener('input', e => {
  if (e.target.id === 'chTime') { setTod(+e.target.value); cheatLiveTick(); }
  if (e.target.id === 'chHp') { P.hp = +e.target.value; cheatLiveTick(); }
  if (e.target.id === 'chFind') { cheatFind = e.target.value; chBody.scrollTop = 0; renderCheats(); }
  // the zombies' sliders: set as you drag, the number beside them following
  const ck = e.target.dataset.ck; if (ck) { CHEAT[ck] = +e.target.value; saveCheats(); const b = chBody.querySelector(`[data-slv="${ck}"]`); if (b) b.textContent = (+e.target.value).toFixed(2) + '×'; cheatTag(); }
  // your look's colours and sliders: put on you a few times a second as you drag, and once more where you let go
  if (e.target.dataset.lf) lookLive(e.target, false, lookMoved, renderCheats);
});
chEl.addEventListener('change', e => { if (e.target.dataset.lf) lookLive(e.target, true, lookMoved, renderCheats); });
const lookMoved = () => { if (cheatOn) showFigure(LE.part, true, LE.gear); };
// typing in the search box or dragging the slider doesn't move you or fire; F9 and Esc still close the menu (Esc clears
// a search first), Enter hands the keyboard back to the game
chEl.addEventListener('keydown', e => {
  if (!e.target.closest('input')) return;
  e.stopPropagation();
  if (e.key === 'Escape' && e.target === chFind && chFind.value) { e.preventDefault(); chFind.value = cheatFind = ''; renderCheats(); }
  else if (e.key === 'F9' || e.key === 'Escape') { e.preventDefault(); toggleCheats(false); }
  else if (e.key === 'Enter') { e.target.blur(); cv.focus({ preventScroll: true }); }
});
chEl.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
// F9, drawn as the game draws every key (Kenney's input prompts: ui/input-icons.js)
chEl.querySelector('.chTop kbd').outerHTML = keyIcon('f9');
cheatTag();
