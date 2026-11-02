// Down in co-op, you watch a teammate till the wave's cleared (camFocus: the camera, the roof and walls fading round
// them, what you hear). Q or a left click watches the one before, E or a right click the next one still standing. Your own HUD gives way to theirs: a "Down" stamp up
// top with who you're watching, their health and planks, scrap and kills bottom left, their weapon and its ammo bottom
// right (sent with their pose: ammoOut in net/avatars.js)

import { $ } from '../core/dom.js';
import { cam, GUN_Y, scene, V3 } from '../core/renderer.js';
import { NET, NET_COL, netLink } from './net.js';
import { P } from '../player/player.js';
import { S, T, W } from '../game/run-state.js';
import { dropPickup, pickups } from '../pickups/pickups.js';
import { state } from '../game/state.js';
import { DC } from '../ui/screens.js';
import { paintBar } from './lobby.js';
import { meleeArt } from '../ui/melee-art.js';
import { specFpOn } from '../game/view-cam.js';
import { PVP, pvpFoe, pvpKiller, pvpMate, pvpSideOut } from '../pvp/pvp.js';

export const SPEC = { id: '', key: '' };
// who the camera's on: you, or once you've fallen, the teammate you picked if they're still standing, else the first.
// In the arena's Showdown, once your whole side's down (pvp/pvp.js pvpSideOut), the enemy who took the last of you down
// (pvpKiller: your own killer if you were the last), from their eyes as you'd watch a teammate; if they've gone down
// since, whichever of the other side's still up is nearest where they fell (Q and E step through the rest of them)
export function camFocus() {
  if (!netLink() || !P.dead) return P;
  const rounds = PVP.on && PVP.mode === 'rounds';
  { const K = pvpKiller(); if (K && !(rounds && DC.spec)) return K; }   // (the arena's death camera on whoever got you, while it lasts: pvp/pvp.js)
  if (!DC.spec) return P;   // (once the death camera's dipped to black: ui/screens.js)
  if (PVP.on && !rounds) return P;   // (in the arena you watch only in Showdown: pvp/pvp.js)
  if (rounds && pvpSideOut()) return foeFocus() || P;
  let first = null;
  for (const p of NET.peers.values()) {
    if (p.dead || p.x === undefined || (PVP.on && !pvpMate(p))) continue;
    if (p.id === SPEC.id) return p;
    if (!first || p.idx < first.idx) first = p;
  }
  return first || P;
}
// your side all down: the one you picked of theirs, the one who finished your side off, or the nearest of theirs still up
// to where that one fell; that one where they lie if none of the other side's left standing
function foeFocus() {
  const up = p => p && !p.dead && p.x !== undefined && pvpFoe(p), sel = NET.peers.get(SPEC.id); if (up(sel)) return sel;
  const K = PVP.wipeK ? NET.peers.get(PVP.wipeK) : null; if (up(K)) return K;
  let best = null, bd = Infinity;
  for (const p of NET.peers.values()) {
    if (!up(p)) continue;
    const d = K && K.x !== undefined ? Math.hypot(p.x - K.x, p.z - K.z) : p.idx;
    if (d < bd) { bd = d; best = p; }
  }
  return best || (K && K.x !== undefined ? K : null);
}
// watching the other side (the arena's death camera, or Showdown once your side's out)
const watchingFoe = f => PVP.on && f !== P && pvpFoe(f);
// who's still up that Q and E step through: your teammates, or once your side's out, theirs
const specPool = () => { const foes = PVP.on && PVP.mode === 'rounds' && pvpSideOut(); return [...NET.peers.values()].filter(p => !p.dead && p.x !== undefined && (!PVP.on || (foes ? pvpFoe(p) : pvpMate(p)))); };
export const spectating = () => camFocus() !== P;
// whose eyes the screen sees through: yours, or watching a teammate, theirs: where they stand and look, how wide they see
// round them (Wide eyes) and their night vision, sent with their pose (vw: net/avatars.js). The fog of war
// (lighting/vision.js) and night vision (lighting/lightmap.js, day-night.js) read it
const _view = { x: 0, z: 0, aim: 0, cone: 1.2, near: 2.4, nv: 0, night: 0 };
export function viewer() {
  const f = camFocus();
  if (f === P || !f.vw) return Object.assign(_view, { x: P.x, z: P.z, aim: P.aim, cone: S.cone, near: S.near, nv: S.nightVis || 0, night: T('night') || 0 });
  return Object.assign(_view, { x: f.x, z: f.z, aim: f.vw[0], cone: f.vw[1], near: f.vw[2], nv: f.vw[3], night: f.vw[4] });
}
// step to the next teammate still standing (dir 1) or the one before (-1), round and round
export function specStep(dir) {
  const up = specPool().sort((a, b) => a.idx - b.idx);
  if (up.length < 2) return;
  SPEC.id = up[(up.indexOf(camFocus()) + dir + up.length) % up.length].id; SPEC.key = '';
}
export function renderSpec() {
  const f = camFocus(), on = f !== P && (state === 'play' || state === 'paused'), el = $('spec');
  if (el.hidden === on) { el.hidden = !on; document.body.classList.toggle('spectating', on); SPEC.key = ''; }
  if (!on) return;
  const am = f.am || [], hp = Math.max(0, Math.round(f.hp ?? 100)), mx = f.maxHp || 100, st = f.stats || [];
  const up = specPool().length, foe = watchingFoe(f), out = foe && PVP.mode === 'rounds';
  const lg = f.lo && f.lo.guns && f.lo.guns[f.wid], key = [f.id, f.name, hp, mx, f.heal || 0, f.wn, f.wid, lg ? JSON.stringify([lg.mods, lg.lv]) : '', JSON.stringify(am), st.join(), up, foe, f.id === PVP.wipeK].join('|');
  if (SPEC.key === key) return; SPEC.key = key;
  const q = s => el.querySelector(s);
  el.style.setProperty('--pc', foe ? '#e2563f' : NET_COL[f.idx] || '#888');   // (in the arena someone on the other side in red, as their name is: net/avatars.js)
  // (and watching the other side, said plainly: an Enemy stamp in place of Down, and whose eyes they are)
  el.classList.toggle('foe', foe);
  q('.spStamp').textContent = foe ? 'Enemy' : 'Down';
  q('.spWho').firstChild.textContent = foe ? 'Watching the enemy ' : 'Watching ';
  q('.spWho em').textContent = f.name || 'Survivor';
  q('.spHint').hidden = up < 2; q('.spHint').textContent = out ? 'Q / left click · E / right click: watch another of them' : 'Q / left click · E / right click: watch someone else';
  q('.spText small:not(.spHint)').textContent = out ? (f.id === PVP.wipeK ? 'Your side is out · they took the last of you down · back next round' : 'Your side is out · back next round')
    : PVP.on ? (PVP.mode === 'rounds' ? 'Back next round' : 'Who got you · back in a moment') : 'Back on your feet when the wave is cleared';
  // their health
  q('.spName b').textContent = f.name || 'Survivor';
  q('.spHp').textContent = hp; q('.spMax').textContent = '/ ' + mx;
  paintBar(q('.spVit .bar'), hp, mx, f.heal, false);   // (net/lobby.js)
  q('.spVit').classList.toggle('low', hp / mx < 0.3);
  el.querySelectorAll('.spVit .res b').forEach((b, i) => { b.textContent = st[i] ?? 0; });
  // their weapon
  const [have, res, cap, rel, band] = am, melee = have === -1 || have === undefined;
  q('.spWName').textContent = f.wn || '';
  const ammo = q('.spAmmo'), n = Array.isArray(have) ? Math.min(...have) : have;   // (a pair: the emptier of the two)
  ammo.textContent = melee ? '—' : Array.isArray(have) ? have.join(' · ') : have;
  // a melee weapon: its picture where the count would be, as your own HUD shows it (ui/melee-art.js), with
  // the mods they've put on it at their levels (from their loadout, net/arsenal.js), not a dash (the dash only while
  // their weapon's not known yet)
  { const D = melee && f.wid ? W(f.wid) : null, img = q('.spMelee'), g = (f.lo && f.lo.guns && f.lo.guns[f.wid]) || {}, mods = g.mods || [], lv = g.lv || {};
    const art = D && D.melee ? meleeArt(f.wid, mods, m => lv[m] || 1) : null, ak = f.wid + ':' + mods.map(m => m + (lv[m] || 1)).join(',');
    img.hidden = !art; ammo.hidden = !!art;
    if (art && img.dataset.w !== ak) { img.dataset.w = ak; img.src = art.url; img.style.width = art.w.toFixed(0) + 'px'; } }
  ammo.classList.toggle('out', !melee && n === 0); ammo.classList.toggle('low', !melee && n > 0 && n <= Math.max(1, Math.floor((cap || 1) * 0.25)));
  q('.spRes').textContent = melee ? '' : '/ ' + res;
  q('.spRel').textContent = rel === 2 ? 'Loading shells' : rel === 1 ? 'Reloading' : '';
  q('.spBand b').textContent = band ?? 0; q('.spBand').classList.toggle('empty', !(band > 0));
}
// where the one you're watching is aiming: a crosshair of their own, ghostly, in their colour washed out to grey, its
// dashed ring turning slowly, so it reads as theirs and not yours (you're down). It glides after their aim (their pose
// sends it, ap: net/avatars.js; SPEC_XH.ease), draws in tighter while they're aiming down the sights, and fades in
// and out with the watching
const SPEC_XH = { ease: 12 }, _sxV = new V3();
// a cut from one survivor you're watching to another: a quick dip through dark (SPEC_CUT s), so the view isn't seen
// jumping from their eyes to someone else's across the map
const SPEC_CUT = { s: 0.32 }; let specCutId = '', specCutEl = null;
function specCut(f) {
  const id = P.dead && f !== P ? f.id : ''; if (id === specCutId) return;
  const was = specCutId; specCutId = id; if (!was || !id) return;
  if (!specCutEl) { specCutEl = document.createElement('div'); specCutEl.id = 'specCut'; specCutEl.style.setProperty('--t', SPEC_CUT.s + 's'); document.body.appendChild(specCutEl); }
  specCutEl.classList.remove('on'); void specCutEl.offsetWidth; specCutEl.classList.add('on');
}
export function updateSpecXh(rdt) {
  specCut(camFocus());
  const el = $('specXh'), f = camFocus(), on = f !== P && (state === 'play' || state === 'paused') && !!f.ap && !(PVP.on && pvpFoe(f) && !(PVP.mode === 'rounds' && specFpOn()));   // (never the crosshair of the one who got you on the death camera: a teammate's, or once your side's out, from the eyes of the one on the other side you're watching)
  if (el.classList.contains('on') !== on) el.classList.toggle('on', on);
  if (!on) { SPEC.xh = null; return; }
  _sxV.set(f.ap[0], GUN_Y, f.ap[1]).project(cam);   // (on the plane aims are taken on, input/keyboard-mouse.js)
  if (specFpOn()) _sxV.set(0, 0, 0);   // (from their eyes, the middle of the view: where they look)
  const tx = (_sxV.x * 0.5 + 0.5) * innerWidth, ty = (-_sxV.y * 0.5 + 0.5) * innerHeight;
  const c = SPEC.xh && SPEC.xh.id === f.id ? SPEC.xh : (SPEC.xh = { id: f.id, x: tx, y: ty }), k = 1 - Math.exp(-rdt * SPEC_XH.ease);
  c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
  el.style.transform = `translate(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px)`;
  el.style.setProperty('--pc', PVP.on && pvpFoe(f) ? '#e2563f' : NET_COL[f.idx] || '#888');   // (in the arena someone on the other side in red, as their name is: net/avatars.js)
  el.classList.toggle('ads', !!(f.fc && f.fc[3] > 0.5));
}
// the drops of the one you're watching (sent with their pose while anyone's down, dr: net/avatars.js), shown as ghosts
// among your pickups (p.ghost: never yours to take, pickups/pickups.js), kept in step with theirs: new ones dropped in,
// ones taken or gone taken away, a drop flying in to them moved with it. Watching no one, there are none
const DROP_KINDS = ['ammo', 'planks', 'med', 'supply'];
export function updateSpecDrops() {
  const f = camFocus(), id = f !== P && f.drops ? f.id : null, want = new Map();
  if (id) for (const d of f.drops) want.set(d[0], d);
  for (let k = pickups.length - 1; k >= 0; k--) {
    const p = pickups[k]; if (!p.ghost) continue;
    const d = p.ghost === id ? want.get(p.guid) : null;
    if (!d) { scene.remove(p.g); pickups.splice(k, 1); continue; }
    want.delete(p.guid);
    if (p.x !== d[2] || p.z !== d[3]) { p.x = d[2]; p.z = d[3]; p.g.position.x = p.x; p.g.position.z = p.z; }
  }
  for (const d of want.values()) { const p = dropPickup(d[2], d[3], DROP_KINDS[d[1]], d[5] || 1, d[4] || undefined); p.ghost = id; p.guid = d[0]; }
}
// yours, for a teammate who's down and might be watching you: what's lying on your farm to be picked up
export function myDrops() { return pickups.filter(p => !p.ghost && DROP_KINDS.includes(p.kind)).slice(-24).map(p => [p.uid, DROP_KINDS.indexOf(p.kind), Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100, p.ammoType || 0, p.amount | 0]); }
