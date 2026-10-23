// PZ-style status icons.

import { $ } from '../core/dom.js';
import { GI, GI_VB } from './game-icons.js';
import { cache } from '../core/math.js';
import { P } from '../player/player.js';
import { curId, hpCap, S, W } from '../game/run-state.js';
import { curDark } from '../lighting/day-night.js';

const MOOD_ICON = { wound: GI.wound, heal: GI.heal, lungs: GI.lungs, pinned: GI.pinned, adren: GI.adren, night: GI.night, heavy: GI.heavy, wind: GI.wind, fire: GI.fire };   // (ui/game-icons.js)
export function renderMoodles() {
  const list = [];
  const hp = P.hp / hpCap();
  if (hp < 0.35) list.push(['bad', 'wound', 'Badly hurt']); else if (hp < 0.7) list.push(['warn', 'wound', 'Hurt']);
  if (P.slow > 0.45) list.push(['bad', 'pinned', 'Pinned']); else if (P.slow > 0.15) list.push(['warn', 'pinned', 'Slowed']);
  if (P.heal > 0) list.push(['good', 'heal', 'Healing']);   // no Bandaging icon: the ring round the cursor already shows it going on
  if (P.bleed > 0) list.push(['bad bleed', 'wound', 'Bleeding']);
  if (P.exh || P.sprintLock) list.push(['bad', 'lungs', 'Winded']);   // (blown from a sprint till you're back to half: player/sprint.js) else if (P.stam < 0.35 * stamMax()) list.push(['warn', 'lungs', 'Tired']);
  if (P.conc > 0.15) list.push(['bad', 'pinned', 'Concussed']);
  if (P.adr > 0) list.push(['good', 'adren', 'Adrenaline']);
  if (P.eye > 0) list.push(['good', 'fire', 'Dead eye']);
  if (S.lastStand && hp < 0.3) list.push(['good', 'fire', 'Last stand']);
  if (S.secondWind && !S.windUsed) list.push(['good', 'wind', 'Second wind ready']);
  const D = W(curId()); if (D && D.slow) list.push(['warn', 'heavy', 'Heavy load']);
  if (curDark > 0.6) list.push(['info', 'night', P.adapt > 0.9 ? 'Eyes adjusted' : P.adapt > 0.15 ? 'Eyes adjusting' : 'Dark']);
  const key = list.map(l => l[0] + l[2]).join('|');
  if (cache.mood === key) return; cache.mood = key;
  $('moodles').innerHTML = list.map(([c, i, t]) => `<div class="mood ${c}"><span>${t}</span><i><svg viewBox="${GI_VB}">${MOOD_ICON[i]}</svg></i></div>`).join('');
}
