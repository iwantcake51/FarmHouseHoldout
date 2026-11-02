// The run in numbers, for the end screen's Full run stats (it folds open under the four big ones: ui/screens.js, die).
// Tallied as things happen, in run.st (runStat), the kills by what they were and what did them (runKill), and every
// frame what's easier watched than counted where it happens (runWatch): the ground you covered, the health you lost
// and got back, the scrap that came in and went out, your closest call.

import { $ } from '../core/dom.js';
import { NET } from '../net/net.js';
import { P } from '../player/player.js';
import { WEAP } from '../weapons/gun-stats.js';
import { EFF, run, S, W } from '../game/run-state.js';
import { state } from '../game/state.js';

export function runStat(k, n) { if (run && run.st) run.st[k] = (run.st[k] || 0) + (n === undefined ? 1 : n); }
// a kill of yours: what it was, what did it, from how far, and whether it came in a chain (kills RUN_CHAIN s apart)
export const RUN_CHAIN = 1.6;   // (a touch longer than it was, 1.2: room to line up the next one)
export function runKill(z, wId, part) {
  const st = run.st; if (!st) return;
  runStat('k_' + (z.crawl ? 'crawler' : z.type));
  if (part === 'head') runStat('headKills');
  const D = W(wId) || EFF[wId] || {};
  if (D.melee) runStat('meleeKills'); else if (wId && !WEAP[wId]) runStat('blastKills');
  if (wId && WEAP[wId]) { st.wk = st.wk || {}; st.wk[wId] = (st.wk[wId] || 0) + 1; }
  const d = Math.hypot(z.x - P.x, z.z - P.z); if (!D.melee && d > (st.farKill || 0)) st.farKill = d;
  st.chain = run.time - (st.lastKill ?? -99) < RUN_CHAIN ? (st.chain || 1) + 1 : 1; st.lastKill = run.time;
  if (st.chain > (st.bestChain || 0)) st.bestChain = st.chain;
}
// each frame of a run: what changed since the last (and nothing counted across going down and coming back)
const RUN_W = { x: 0, z: 0, hp: 0, scrap: 0, live: false, dip: undefined, dipT: 0 };
const CLOSE_CALL = 3;
export function runWatch() {
  const st = run.st; if (!st) return;
  if (P.dead || state !== 'play') { RUN_W.live = false; if (P.dead) RUN_W.dip = undefined; return; }
  if (RUN_W.live) {
    const d = Math.hypot(P.x - RUN_W.x, P.z - RUN_W.z); if (d < 3) st.walked = (st.walked || 0) + d;   // (not a respawn or a teleport)
    const dh = P.hp - RUN_W.hp; if (dh < 0) st.hurt = (st.hurt || 0) - dh; else if (dh > 0) st.healed = (st.healed || 0) + dh;
    const ds = S.scrap - RUN_W.scrap; if (ds > 0) st.scrapIn = (st.scrapIn || 0) + ds; else if (ds < 0) st.scrapOut = (st.scrapOut || 0) - ds;
  }
  // your closest call: the lowest you got and lived through, counted once you've come through it (CLOSE_CALL seconds
  // later and still standing), so the blow that finished you off never counts as one
  if (P.hp > 0) {
    if (RUN_W.dip === undefined || P.hp < RUN_W.dip) { RUN_W.dip = P.hp; RUN_W.dipT = run.time; }
    else if (run.time - RUN_W.dipT >= CLOSE_CALL) { if (st.lowHp === undefined || RUN_W.dip < st.lowHp) st.lowHp = RUN_W.dip; RUN_W.dip = undefined; }
  }
  Object.assign(RUN_W, { x: P.x, z: P.z, hp: P.hp, scrap: S.scrap, live: true });
}

// ---- the panel: groups of stats, then the skills and gear the run was built from
const ZNAME = { walker: 'Walkers', runner: 'Runners', spitter: 'Spitters', brute: 'Brutes', crawler: 'Crawlers' };
const rsEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rsN = n => Math.round(n || 0).toLocaleString();
function runStatsHtml() {
  const st = run.st || {}, n = k => st[k] || 0, co = NET.on || n('sent') || n('received') || n('assists');
  const acc = run.shots ? Math.round(run.hits / run.shots * 100) + '%' : '—';
  const fav = Object.entries(st.wk || {}).sort((a, b) => b[1] - a[1])[0];
  const groups = [
    ['Combat', [
      ['Kills', rsN(run.kills)], ['Headshot kills', rsN(n('headKills'))], ['Melee kills', rsN(n('meleeKills'))], ['Explosive kills', rsN(n('blastKills'))],
      ['Shots fired', rsN(run.shots)], ['Accuracy', acc], ['Heads taken off', rsN(run.heads)], ['Limbs taken off', rsN(run.limbs)],
      ['Biggest chain', st.bestChain > 1 ? st.bestChain + ' kills' : '—'], ['Longest kill', st.farKill ? st.farKill.toFixed(1) + ' m' : '—'],
      ['Favourite weapon', fav ? `${rsEsc(WEAP[fav[0]].name)} <small>${fav[1]} kills</small>` : '—'], ['Reloads', rsN(n('reloads'))],
      ['Shoves', rsN(n('shoves'))], ['Grenades', rsN(n('grenades'))]]],
    ['The dead', Object.keys(ZNAME).filter(t => n('k_' + t)).map(t => [ZNAME[t], rsN(n('k_' + t))])],
    ['By weapon', Object.entries(st.wk || {}).filter(([id, k]) => k > 0 && WEAP[id]).sort((a, b) => b[1] - a[1]).map(([id, k]) => [rsEsc(WEAP[id].name), rsN(k) + (k === 1 ? ' kill' : ' kills')])],
    ['Holding the house', [
      ['Boards nailed up', rsN(n('planks'))], ['Grates put up', rsN(n('grates'))], ['Repairs', rsN(n('repairs'))], ['Boards torn down', rsN(n('tears'))],
      ['Windows climbed', rsN(n('vaults'))], ['Fences hopped', rsN(n('hops'))], ['Ground covered', Math.round(n('walked')) + ' m']]],
    ['Staying alive', [
      ...(co ? [['Times down', rsN(n('downs'))]] : []), ['Damage taken', rsN(n('hurt'))], ['Health got back', rsN(n('healed'))],
      ['Closest call', st.lowHp !== undefined ? Math.max(1, Math.ceil(st.lowHp)) + ' health' : '—'], ['Bandages used', rsN(n('bandages'))], ['Times bled', rsN(n('bleeds'))]]],
    ['Scrap', [
      ['Earned', rsN(n('scrapIn') - n('received'))], ['Spent', rsN(n('scrapOut') - n('sent'))], ['Gear bought', rsN(run.bought.length)], ['Supply drops called', rsN(n('drops'))],
      ...(co ? [['Sent to teammates', rsN(n('sent'))], ['Received', rsN(n('received'))], ['Assists', rsN(n('assists'))], ['Team bonuses', rsN(n('teamBonus'))]] : [])]]
  ];
  let h = groups.filter(g => g[1].length).map(([t, rows]) => `<section class="rsG"><h4>${t}</h4><dl>${rows.map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl></section>`).join('');
  // the skills, perks and aid taken, in the order they came, each in its rarity's colour
  const sk = run.taken.map(t => `<span class="rsChip r-${t.r}" title="${rsEsc(t.text || '')}">${rsEsc(t.name)}${t.n > 1 ? `<i>×${t.n}</i>` : ''}<em>W${t.wave}</em></span>`).join('');
  h += `<section class="rsG rsWide"><h4>Skills and perks <small>${run.taken.length}</small></h4>${sk ? `<div class="rsChips">${sk}</div>` : '<p class="rsNone">None taken this run</p>'}</section>`;
  return h;
}
export function renderRunStats() { $('runStatsBody').innerHTML = runStatsHtml(); $('runMore').open = false; }
