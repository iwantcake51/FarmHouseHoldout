// The loadout panel: docked against the workbench's right side (as the stats sheet is on its left), it lists what
// you've bought for the gun in your hands and lets you change what's on it for nothing: load any kind of round you own
// for it (weapons/rounds.js), go back to a lighter powder, take an attachment off or put back one you had before.
// Nothing you've bought is lost by it (W8.own, ownTier and fitTier, W8.ownAtt and setAtt in game/run-state.js); buying
// the next step at the bench still fits that one. It comes out from behind the bench as that unrolls, or pops out when your first purchase for
// the gun gives it something to show, and a marker slides to whatever you pick (styles/loadout.css).

import { $ } from '../core/dom.js';
import { clamp } from '../core/math.js';
import { P } from '../player/player.js';
import { WEAP } from '../weapons/gun-stats.js';
import { loadRound, roundName, roundOn, roundOwned, ROUNDS, roundTypes } from '../weapons/rounds.js';
import { MODS } from '../melee/melee-mods.js';
import { modLocks, modName, modReplaced, modsOff, setMod } from '../weapons/mod-levels.js';
import { tierName, TIERS } from '../upgrades/tier-table.js';
import {
  AMMO_DMG, curId, fitTier, gunAtt, gunTier, hasMod, HEAD_UP, MAG_UP, magChange, ownAtt, ownTier, recomputeEff, S,
  setAtt, W, W8
} from '../game/run-state.js';
import { buildGuns } from '../weapons/build-weapons.js';
import { openSt, renderStation } from '../stations/station-ui.js';
import { SFX } from '../audio/sfx.js';
import { glowGun, state } from '../game/state.js';
import { exitScope } from '../player/aiming.js';
import { STOCK } from '../weapons/firing.js';
import {
  chip, CHIP_MARK, chipCls, compareFx, fmt1, gunStats, MOD_FEATURE, roundFeat
} from '../upgrades/upgrade-info.js';
import { feed } from './hud-text.js';
import { wsAtBench } from './weapon-stats.js';

let wlKey = '', wlSel = '', wlCloseT = 0, wlOpenT = 0, wlOpts = [], wlGrps = [];
const WL_LINE = { supp: 'Muzzle', choke: 'Muzzle', sight: 'Sight', laser: 'Laser', light: 'Light', loader: 'Loader' };
const pctPlus = m => '+' + Math.round((m - 1) * 100) + '%';
// every choice for the gun in your hands, a group a line: [{ g: group, label, opts: [{ k, n, att, name, sub }] }]
function wlGroups(id) {
  const D = id && WEAP[id]; if (!D || D.melee) return [];
  const out = [], line = (k, n) => tierName(k, n - 1, id);
  const rk = roundTypes(id).filter(k => roundOwned(id, k));
  if (rk.length > 1) out.push({ g: 'rounds', label: 'Rounds', opts: rk.map(k => ({ rk: k, n: 1, name: roundName(id, k) })) });
  const a = ownTier(id, 'ammo');
  if (a) out.push({ g: 'ammo', label: 'Powder', opts: Array.from({ length: a + 1 }, (_, n) => ({ k: 'ammo', n,
    name: n ? line('ammo', n) : 'Factory loads', sub: n ? pctPlus(AMMO_DMG[n]) + ' damage' + (n >= 3 ? ' · headshots +' + HEAD_UP.ammo + '×' : '') : 'As the gun comes' })) });
  // a shotgun's can and choke share the muzzle: one group, so picking one takes the other off
  // (and the muzzle devices from mods, weapons/gun-mods.js)
  const mods = (W8.mods[id] || []).concat(modsOff(id)).filter(m => MODS[m] && MODS[m].w === id && !modReplaced(m));
  const mz = ['supp', 'choke'].flatMap(k => Array.from({ length: ownTier(id, k) }, (_, i) => ({ k, n: i + 1, name: line(k, i + 1) })))
    .concat(mods.filter(m => MODS[m].muzzle).map(m => ({ mod: m, n: 1, name: modName(m) })));
  if (mz.length) out.push({ g: 'muzzle', label: 'Muzzle', opts: [{ k: 'muzzle', n: 0, name: 'Bare muzzle' }, ...mz] });
  // the magazine: any size you've bought for it, or the one it came with (swapping empties it into your reserve: wlPick)
  { const n = modLocks(id, 'mag') ? 0 : ownTier(id, 'mag'); if (n) { const cap = t => Math.max(1, Math.round(WEAP[id].mag * (MAG_UP[id] || MAG_UP.all)[t] * S.magMul));
    out.push({ g: 'mag', label: 'Magazine', note: 'Swapping empties it', opts: Array.from({ length: n + 1 }, (_, t) => ({ k: 'mag', n: t, name: t ? line('mag', t) : 'Standard', sub: cap(t) + ' rounds' })) }); } }
  for (const k of ['sight', 'laser', 'light', 'loader']) {
    const n = modLocks(id, k) ? 0 : ownTier(id, k); if (!n) continue;   // (a line a mod's taken the place of isn't offered)
    const label = k === 'loader' && (D.breakOpen || id === 'scar') ? 'Reload' : WL_LINE[k], off = { sight: 'Iron sights', laser: 'No laser', light: 'No light', loader: D.breakOpen ? 'One shell at a time' : id === 'scar' ? 'Standard magwell' : 'Load by hand' }[k];
    out.push({ g: k, label, opts: [{ k, n: 0, name: off }, ...Array.from({ length: n }, (_, i) => ({ k, n: i + 1, name: line(k, i + 1) }))] });
  }
  // every other mod on its own line, on or off (the Navy trigger group, the drum, the long barrel...)
  for (const m of mods) if (!MODS[m].muzzle) out.push({ g: 'mod:' + m, label: MODS[m].fm ? 'Trigger' : 'Upgrade', opts: [{ mod: m, n: 0, name: 'Off' }, { mod: m, n: 1, name: modName(m) }] });
  // the bayonet on a long gun, the stock on a sidearm (each bought for that gun alone)
  if (D.slot === 'long' && ownAtt(id, 'bayonet')) out.push({ g: 'bayonet', label: 'Bayonet', opts: [{ att: 'bayonet', n: 0, name: 'Off' }, { att: 'bayonet', n: 1, name: 'Bayonet', sub: 'Shove stabs for 45' }] });
  if (D.slot === 'side' && ownAtt(id, 'stock')) out.push({ g: 'stock', label: 'Stock', opts: [{ att: 'stock', n: 0, name: 'Off' }, { att: 'stock', n: 1, name: 'Shoulder stock', sub: 'Less kick' }] });
  return out;
}
// is this choice what's on the gun now
function wlIsOn(id, o) {
  if (o.rk) return roundOn(id) === o.rk;
  if (o.att) return gunAtt(id, o.att) === !!o.n;
  if (o.mod) return hasMod(o.mod) === !!o.n;
  if (o.k === 'muzzle') return !gunTier(id, 'supp') && !gunTier(id, 'choke') && !(W8.mods[id] || []).some(m => MODS[m].muzzle);
  return gunTier(id, o.k) === o.n;
}
// a different magazine: the one in the gun comes out with whatever's in it, back into your reserve, and the new one
// goes in empty, so it needs a reload (no mag still in it to wait for: W8.pin, game/run-state.js)
function magUnload(id, fit) {
  const D = W(id), left = W8.mag[id] || 0;
  if (D.ammo && left) { W8.reserve[D.ammo] += left; feed('ammo', left, 'back in your pouch'); }
  W8.mag[id] = 0; if (W8.akMag && W8.akMag[id]) W8.akMag[id] = { L: 0, R: 0 };
  W8.hudSpent[id] = 0; if (W8.spent) W8.spent[id] = 0;
  if (W8.reloading && curId() === id) { W8.reloading = null; W8.reloadT = 0; }
  delete W8.relSave[id];
  fit(); delete W8.pin[id];
}
function wlPick(i) {
  const id = curId(), o = wlOpts[i]; if (!id || !o || wlIsOn(id, o)) return;
  const was = wlGrps[o.gi].opts.find(q => wlIsOn(id, q));   // (what it was, for the feed's line when it comes off)
  exitScope();
  if (o.rk) loadRound(id, o.rk, true);   // (the mag's emptied and filled again with the new kind)
  else magChange(id, () => {
    const mzOff = () => (W8.mods[id] || []).filter(m => MODS[m].muzzle).forEach(m => setMod(id, m, false));
    if (o.att) setAtt(id, o.att, !!o.n);
    else if (o.mod) setMod(id, o.mod, !!o.n);
    else if (o.k === 'muzzle') { fitTier(id, 'supp', 0); fitTier(id, 'choke', 0); mzOff(); }
    else if (o.k === 'mag') magUnload(id, () => fitTier(id, 'mag', o.n));
    else { if (o.k === 'supp' || o.k === 'choke') mzOff(); fitTier(id, o.k, o.n); }
    recomputeEff();
  });
  if (o.k === 'mag') delete W8.pin[id];   // (emptied and swapped: there's no old mag left in it for magChange to keep)
  if (!o.rk) buildGuns(id);
  glowGun(id); SFX.click();
  feed(o.rk ? 'ammo' : 'gear', 0, o.n ? o.name + (o.rk || o.k === 'ammo' ? ' loaded' : ' on') : (was ? was.name : o.name) + (o.k === 'ammo' ? ' unloaded' : ' off'));
  if (openSt) renderStation();   // the bench's cards measure against what's on the gun now
  const b = $('wLoad').querySelector(`button[data-i="${i}"]`); if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  if (wlTipOn) wlTip(wlTipOn);   // (what it says changes once it's on)
}
$('wLoad').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) wlPick(+b.dataset.i); });
// the marker in each group slides to the picked choice (instantly the first time the group is laid out)
function wlMarks(still) {
  $('wLoad').querySelectorAll('.wlGrp').forEach(gr => {
    const on = gr.querySelector('button.on'), m = gr.querySelector('.wlMark'); if (!on || !m) return;
    m.classList.toggle('still', !!still);
    m.style.setProperty('--y', on.offsetTop + 'px'); m.style.setProperty('--h', on.offsetHeight + 'px');
  });
}
// every frame: shown while you're at the workbench with a gun that has something to swap, docked on its right
export function updateLoadout() {
  const el = $('wLoad'), id = curId(), st = $('station'), groups = state === 'play' && !P.dead && wsAtBench() ? wlGroups(id) : [], on = groups.length > 0;
  if (!st.classList.contains('closing')) { st.classList.toggle('withLoad', on); document.documentElement.classList.toggle('dkL', on); }
  if (on && (el.hidden || el.classList.contains('closing'))) {
    clearTimeout(wlCloseT); const was = !el.hidden; el.classList.remove('closing', 'opening'); el.hidden = false; wlKey = ''; if (was) void el.offsetWidth; el.classList.add('opening');   // (a forced layout only to restart one still on screen)
    clearTimeout(wlOpenT); wlOpenT = setTimeout(() => el.classList.remove('opening'), 900);
  } else if (!on && !el.hidden && !el.classList.contains('closing')) {
    wlTipOn = null; wlTip(null); el.classList.remove('opening'); el.classList.add('closing');
    clearTimeout(wlCloseT); wlCloseT = setTimeout(() => { el.classList.remove('closing'); el.hidden = true; }, 220);
  }
  if (!on) return;
  const key = id + '|' + groups.map(g => g.g + ':' + g.opts.map(o => o.name).join(',')).join('|');
  if (key !== wlKey) {
    // a group that wasn't there a moment ago (the first rounds or attachment just bought for this gun) rises in on its own
    const had = wlKey.startsWith(id + '|') ? new Set(wlGrps.map(g => g.g)) : null;
    wlKey = key; wlOpts = []; wlGrps = groups; let k = 0; wlTipOn = null; wlTip(null);
    const D = WEAP[id];
    el.innerHTML = `<div class="wlHead" style="--k:${k++}"><b>Loadout</b><span>${D.short || D.name}</span></div><p class="wlNote" style="--k:${k++}">Swap or take off for free. Whatever you've bought stays yours.</p>` +
      groups.map((g, gi) => `<div class="wlSub${had && !had.has(g.g) ? ' new' : ''}" style="--k:${Math.min(9, k++)}">${g.label}${g.note ? `<small>${g.note}</small>` : ''}</div><div class="wlGrp${had && !had.has(g.g) ? ' new' : ''}" data-g="${g.g}" style="--k:${Math.min(9, k++)}"><i class="wlMark"></i>` +
        g.opts.map(o => { o.gi = gi; const i = wlOpts.push(o) - 1; return `<button type="button" data-i="${i}"><b>${o.name}</b>${o.sub ? `<em>${o.sub}</em>` : ''}</button>`; }).join('') + '</div>').join('');
    wlSel = '';
  }
  const sel = wlOpts.map(o => wlIsOn(id, o) ? 1 : 0).join('');
  if (sel !== wlSel) {
    const first = !wlSel; wlSel = sel;
    el.querySelectorAll('button[data-i]').forEach(b => { const on = sel[+b.dataset.i] === '1'; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    requestAnimationFrame(() => wlMarks(first));   // (next frame, before anything's changed: reading where the buttons are now would lay the page out mid-frame)
  }
}
// The tip over a choice you point at: what it is, what it does, and what it changes on the gun, as the bench's chips.
// Every number is the gun's own, tried for real: the choice is put on the gun's numbers for a moment (only the numbers:
// nothing's taken out of the mag, nothing rebuilt), read and put straight back. A choice you could swap to is measured
// against the gun as it is now; the one that's on, against the group's bare choice, so it says what it's adding
const wlTipEl = $('wlTip');
const WL_OFF_TEXT = { muzzle: 'Nothing on the muzzle.', sight: 'The gun\'s own iron sights.', laser: 'No laser on the gun.', light: 'No light on the gun.', ammo: 'The rounds as they come from the box.', mag: 'The magazine the gun came with.' };
// the gun's numbers as they stand, with what's only applied as you fire (the can's damage, the stock's steadier kick)
function wlRead(id) {
  const D = W(id), s = gunStats(id, D), g = (W8.gt && W8.gt[id]) || {};
  if (!D.quiet && g.supp && !(D.ammo === 'shells' && g.choke)) s.dmg *= [1, 1.1, 1.2, 1.3][g.supp];
  s.kick = (D.shake || 0) * (gunAtt(id, 'stock') ? STOCK.kick : 1);
  return { D, s };
}
// choice o on gun id, tried and put back
function wlTry(id, o) {
  const gt0 = W8.gt[id], m0 = W8.mods[id], fm0 = W8.fm[id], r = W8.rounds[id], r0 = r && r.on, at0 = W8.att[id];
  const gt = W8.gt[id] = { ...(gt0 || {}) }; let mods = (m0 || []).slice();
  const bareMuzzle = () => { delete gt.supp; delete gt.choke; mods = mods.filter(k => !MODS[k].muzzle); };
  if (o.rk) W8.rounds[id] = { ...(r || { own: [] }), on: o.rk };
  else if (o.att) W8.att[id] = { ...(at0 || {}), [o.att]: !!o.n };
  else if (o.mod) {
    const M = MODS[o.mod];
    if (o.n) { if (M.muzzle) bareMuzzle(); if (M.need && !mods.includes(M.need)) mods.push(M.need); mods = mods.filter(k => k !== o.mod && k !== M.replaces); mods.push(o.mod); if (M.fm) W8.fm[id] = o.mod; (M.locks || []).forEach(k => delete gt[k]); }
    else { mods = mods.filter(k => k !== o.mod && MODS[k].need !== o.mod); if (M.replaces && !mods.includes(M.replaces)) mods.push(M.replaces); if (W8.fm[id] === o.mod || (M.semi && W8.fm[id] === 'semi')) W8.fm[id] = null; }
  }
  else if (o.k === 'muzzle') bareMuzzle();
  else { if (o.k === 'supp' || o.k === 'choke') bareMuzzle(); if (o.n) gt[o.k] = o.n; else delete gt[o.k]; }
  W8.mods[id] = mods; recomputeEff();
  const out = wlRead(id);
  if (gt0) W8.gt[id] = gt0; else delete W8.gt[id];
  if (m0) W8.mods[id] = m0; else delete W8.mods[id];
  W8.fm[id] = fm0; if (r) W8.rounds[id] = r; else delete W8.rounds[id];
  if (at0) W8.att[id] = at0; else delete W8.att[id];
  recomputeEff();
  return out;
}
// what it is, in a line
function wlDesc(id, o) {
  const D = WEAP[id], tx = t => typeof t === 'function' ? t(D, id) : t || '';
  if (o.rk) return tx(ROUNDS[o.rk].text);
  if (o.att) return o.n ? (o.att === 'bayonet' ? 'A blade under the muzzle: your shove stabs for 45 damage.' : 'Braced against your shoulder, the gun kicks far less, and quick shots open up slower.') : 'Taken off the gun.';
  if (o.mod) return o.n ? tx(MODS[o.mod].text) : 'Taken off the gun.';
  if (!o.n) return WL_OFF_TEXT[o.k] || (o.k === 'loader' ? (D.breakOpen ? 'One shell at a time.' : 'Loaded the usual way.') : 'As the gun comes.');
  const T = TIERS[o.k] && TIERS[o.k].t[o.n - 1]; return T ? tx(T.text) : '';
}
// the chips: from (a) to (b), and what it brings that isn't a number
function wlFx(id, o, a, b) {
  let fx = compareFx(a.s, b.s);
  // a burst's rate is bursts a second, not rounds: said as the burst instead
  if (!a.D.burst !== !b.D.burst) { const B = b.D.burst ? b.D : a.D; fx = fx.filter(f => !f.t.startsWith('RATE')); fx.push({ t: `${b.D.burst ? '' : 'No more '}${B.burst}-round bursts, ${fmt1(1 / B.rate)} a second`, good: null }); }
  { const base = WEAP[id].shake || 1, k = chip('KICK', a.s.kick, b.s.kick, false, v => Math.round(v / base * 100) + '%'); if (k) fx.push(k); }
  if (a.s.mag && a.D.magX !== b.D.magX && b.D.magX > a.D.magX) fx.push({ t: 'Slower to walk with', good: false });
  for (const k in MOD_FEATURE) if (b.D[k] && !a.D[k]) fx.push({ t: MOD_FEATURE[k], good: true }); else if (a.D[k] && !b.D[k]) fx.push({ t: 'No more: ' + MOD_FEATURE[k].toLowerCase(), good: false });
  const f0 = roundFeat(a.D), f1 = roundFeat(b.D);
  if (f1.pierce !== f0.pierce) fx.push({ t: `PIERCE ${f0.pierce} → ${f1.pierce}`, good: f1.pierce > f0.pierce });
  if (f1.sever > f0.sever) fx.push({ t: f1.sever > 2 ? 'Every limb it hits comes off' : 'Limbs off twice as easily', good: true });
  if ((b.D.burst || 0) !== (a.D.burst || 0) && a.D.burst && b.D.burst) fx.push({ t: `BURST ${a.D.burst} → ${b.D.burst}`, good: b.D.burst > a.D.burst });
  const line = o.k === 'muzzle' ? null : o.k, on = !!o.n;
  if (line === 'supp' && on) fx.push({ t: o.n > 1 ? 'Even quieter' : 'Quiet shots', good: true });
  if (line === 'light' && on) fx.push({ t: o.n > 1 ? 'Brighter, wider beam' : 'Night beam ahead of you', good: true });
  if (line === 'laser' && on) fx.push({ t: 'Aim beam', good: true });
  if (line === 'sight' && o.n >= 3) fx.push({ t: ['Zooms in when you aim', 'Zooms in further', 'Zooms in furthest'][o.n - 3], good: true });
  if (o.att === 'bayonet' && on) fx.push({ t: 'Shove stab: 45 damage', good: true });
  return fx;
}
function wlTip(btn) {
  const id = curId(), o = btn && wlOpts[+btn.dataset.i];
  if (!id || !o || !wlGrps[o.gi]) { wlTipEl.classList.remove('on'); return; }
  // what's on the gun is measured against the step below it on its line (+P loads against hand-loads, the third sight
  // against the second), or against nothing there for the first step and anything that isn't a line of steps
  const on = wlIsOn(id, o), opts = wlGrps[o.gi].opts, bare = opts.find(q => q !== o && (q.rk ? q.rk === 'std' : !q.n));
  const below = o.k && o.n > 1 ? opts.find(q => q.k === o.k && q.n === o.n - 1) : null, base = below || bare;
  let a = null, b = null;
  if (!on) { a = wlRead(id); b = wlTry(id, o); } else if (base) { a = wlTry(id, base); b = wlRead(id); }
  const fx = a ? wlFx(id, o, a, b) : [];
  wlTipEl.innerHTML = `<span class="wtK">${on ? (below ? 'On the gun · over ' + below.name : bare ? 'On the gun · what it adds' : 'On the gun') : 'Swap to it · free'}</span><b>${o.name}</b><p>${wlDesc(id, o)}</p>` +
    (fx.length ? `<div class="fx">${fx.map(f => `<i class="${chipCls(f)}">${CHIP_MARK[chipCls(f)]} ${f.t}</i>`).join('')}</div>` : on ? '' : '<div class="fx"><i class="eq">• No change to the numbers</i></div>');
  // beside the panel, level with the choice: on its far side from the bench if there's room, otherwise over the bench
  const P0 = $('wLoad').getBoundingClientRect(), r = btn.getBoundingClientRect(), w = wlTipEl.offsetWidth, h = wlTipEl.offsetHeight;
  const x = P0.right + 10 + w < innerWidth - 8 ? P0.right + 10 : P0.left - 10 - w;
  wlTipEl.style.left = Math.max(8, x) + 'px'; wlTipEl.style.top = clamp(r.top + r.height / 2 - h / 2, 8, innerHeight - h - 8) + 'px';
  wlTipEl.classList.add('on');
}
let wlTipOn = null;
$('wLoad').addEventListener('pointerover', e => { const b = e.target.closest('button[data-i]'); if (b !== wlTipOn) { wlTipOn = b; wlTip(b); } });
$('wLoad').addEventListener('pointerleave', () => { wlTipOn = null; wlTip(null); });
$('wLoad').addEventListener('focusin', e => { const b = e.target.closest('button[data-i]'); wlTipOn = b; wlTip(b); });
$('wLoad').addEventListener('focusout', () => { wlTipOn = null; wlTip(null); });
