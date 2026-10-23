// Sacrifices: now and then the cards after a wave come with an offer beside the scrap (upgrades/upgrade-screen.js).
//
// Give up most of your scrap (SAC.scrap of it) and three more cards are dealt from behind the three, the rarer ones a
// little likelier (SAC.boost), and you take two of the six. Or, rarer, take on a curse for the rest of the run (CURSES:
// never sprint again, nothing heals you, a share of your health gone for good...) and the hand turns to the best there
// is: three more cards, legendary perks and tiered skills fully upgraded, every step at once (curseRewards), beside
// the three already dealt; you take two. Never on a wave with a bonus hand (every BONUS_EVERY), and each curse only once.
import { pick, rand } from '../core/math.js';
import { P } from '../player/player.js';
import { TIERS } from './tier-table.js';
import { hpCap, run, S, T } from '../game/run-state.js';
import { UPG } from './upgrades.js';

// how often a hand comes with an offer (chance), how much of that a curse rather than scrap (curse), the share of your
// scrap it takes and the least you need for it to be worth offering (scrap, minScrap), and how much likelier the rarer
// cards are in the three it adds (boost, by rarity)
export const SAC = { chance: 0.28, curse: 0.4, scrap: 0.75, minScrap: 8, boost: { c: 1, u: 1, r: 1.35, e: 1.6, l: 1.8 }, cards: 6, picks: 2 };
// the curses: what each costs you, for the rest of the run (each flag is read where it bites), and whether it's still
// there to take
const CURSES = [
  { id: 'stride', name: 'Broken stride', text: 'You can never sprint again.', can: () => !S.noSprint, ap: () => { S.noSprint = true; } },
  { id: 'blood', name: 'Bad blood', text: 'Nothing heals you again: bandages only stop the bleeding.', can: () => !S.noHeal, ap: () => { S.noHeal = true; P.heal = 0; } },
  { id: 'price', name: 'Blood price', text: 'A quarter of your max health is gone for good, however high it goes.', can: () => !S.hpCut, ap: () => { S.hpCut = 0.25; P.hp = Math.min(P.hp, hpCap()); } },
  { id: 'fingers', name: 'Butterfingers', text: 'Every reload takes 30% longer.', can: () => !S.butter, ap: () => { S.butter = true; S.reloadMul *= 1.3; } },
  { id: 'glass', name: 'Glass bones', text: 'Every hit you take does 25% more.', can: () => !S.glass, ap: () => { S.glass = true; S.dmgTaken *= 1.25; } },
  { id: 'pockets', name: 'Empty pockets', text: 'Kills pay half the scrap.', can: () => !S.scrapCut, ap: () => { S.scrapCut = 0.5; } }
];
// what the scrap offer costs right now
const sacCost = () => Math.max(1, Math.round(S.scrap * SAC.scrap));
// a tiered line handed over whole: every step you haven't got yet at once, as a legendary card
function maxedLine(k) {
  const L = TIERS[k], n = T(k), steps = L.t.slice(n), last = steps[steps.length - 1];
  return { tierOf: k, maxAll: true, r: 'l', steps: steps.map(s => s.name),
    card: () => ({ r: 'l', tag: L.tag, name: last.name, text: `${steps.length === L.t.length ? 'All' : 'The last'} ${steps.length} tiers at once. ${last.text}` }),
    ap: () => { while (T(k) < L.t.length) { L.t[T(k)].ap(); S.tier[k]++; } } };
}
// the hand a curse pays for: the legendary perks you can still take and every tiered line with two or more steps left
// to give, fully upgraded
export function curseRewards() {
  const out = UPG.filter(u => !u.tierOf && u.r === 'l' && (!u.can || u.can()));
  UPG.forEach(u => { if (!u.tierOf || !u.can()) return; const L = TIERS[u.tierOf]; if (L.t.length - T(u.tierOf) >= 2) out.push(maxedLine(u.tierOf)); });
  return out;
}
// what's on offer with this hand, if anything: { kind: 'scrap', cost } or { kind: 'curse', curse }. None on a bonus
// wave (bonusWave), none for scrap you haven't got, none for a curse with too little left to pay you with
export function rollSac(bonusWave) {
  if (bonusWave || run.wave < 1 || rand() >= SAC.chance) return null;
  const curses = CURSES.filter(c => c.can());
  if (rand() < SAC.curse && curses.length && curseRewards().length >= 3) return { kind: 'curse', curse: pick(curses) };
  if (S.scrap >= SAC.minScrap) return { kind: 'scrap', cost: sacCost() };
  return null;
}
// a curse taken: on you for good, and in the list of what you've taken this run, in its own colour
export function takeCurse(c) {
  c.ap(); (S.curses = S.curses || []).push(c.id);
  run.taken.push({ name: c.name, on: '', tag: 'Curse', text: c.text, r: 'x', wave: run.wave, n: 1, total: '' });
}
