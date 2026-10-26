// Sacrifices: now and then the cards after a wave come with an offer beside the scrap (upgrades/upgrade-screen.js).
//
// Give up most of your scrap (SAC.scrap of it) and three more cards are dealt from behind the three, the rarer ones a
// little likelier (SAC.boost), and you take two of the six. Or, rarer, take on a curse for the rest of the run
// (CURSES: half your stamina, healing that barely helps, a share of your health gone for good...; some never
// together, CLASH) and the hand turns to the best there is: three more cards, legendary perks and tiered skills fully
// upgraded, every step at once (curseRewards), beside the three already dealt; you take two. Never on a wave with a
// bonus hand (every BONUS_EVERY), and each curse only once.
import { pick, rand } from '../core/math.js';
import { P } from '../player/player.js';
import { TIERS } from './tier-table.js';
import { hpCap, run, S, T } from '../game/run-state.js';
import { UPG } from './upgrades.js';

// how often a hand comes with an offer (chance), how much of that a curse rather than scrap (curse), the share of your
// scrap it takes and the least you need for it to be worth offering (scrap, minScrap), and how much likelier the rarer
// cards are in the three it adds (boost, by rarity); force: the next hand comes with one of that kind whatever the odds
// ('scrap' or 'curse', set from the cheat menu)
export const SAC = { force: null, chance: 0.28, curse: 0.4, scrap: 0.75, minScrap: 8, boost: { c: 1, u: 1, r: 1.35, e: 1.6, l: 1.8 }, cards: 6, picks: 2 };
// the curses: what each costs you, for the rest of the run (st: the flags and stats, read where they bite; ap: those
// and what it does to you there and then; off: taken back, by the cheat menu, ui/cheats.js), and whether it's still
// there to take
export const CURSES = [
  { id: 'stride', name: 'Broken stride', short: 'Stamina ½', text: 'Your stamina is cut to half of its max, however much you gain.', can: () => !S.stamCap,
    st: () => { S.stamCap = 0.5; }, ap: () => { P.stam = Math.min(P.stam, 0.5); P.runDebt = 0; }, off: () => { S.stamCap = 0; } },
  { id: 'blood', name: 'Bad blood', short: 'Healing ¼', text: 'All healing is 75% weaker (supply crates aside), bleeding hurts 50% more and lasts 25% longer, and Second wind is gone for good. Kills pay double scrap.', can: () => !S.badBlood,
    st: () => { S.badBlood = true; S.healMul = 0.25; S.bleedX = 1.5; S.bleedLong = 1.25; S.secondWind = false; S.scrapX = 2; }, ap: () => { P.heal = (P.heal || 0) * 0.25; },
    off: () => { S.badBlood = false; delete S.healMul; delete S.bleedX; delete S.bleedLong; delete S.scrapX; } },
  { id: 'price', name: 'Blood price', short: 'Health −¼', text: 'A quarter of your max health is gone for good, however high it goes.', can: () => !S.hpCut,
    st: () => { S.hpCut = 0.25; }, ap: () => { P.hp = Math.min(P.hp, hpCap()); }, off: () => { S.hpCut = 0; } },
  { id: 'fingers', name: 'Butterfingers', short: 'Reloads +30%', text: 'Every reload takes 30% longer.', can: () => !S.butter,
    st: () => { S.butter = true; S.reloadMul *= 1.3; }, off: () => { S.butter = false; S.reloadMul /= 1.3; } },
  { id: 'fragile', name: 'Fragile', short: 'Hits +50%', text: 'Every hit you take does 50% more.', can: () => !S.fragile,
    st: () => { S.fragile = true; S.dmgTaken *= 1.5; }, off: () => { S.fragile = false; S.dmgTaken /= 1.5; } },
  { id: 'pockets', name: 'Empty pockets', short: 'Scrap ½', text: 'Kills pay half the scrap.', can: () => !S.scrapCut,
    st: () => { S.scrapCut = 0.5; }, off: () => { S.scrapCut = 0; } }
];
// curses that can't both be on you: whichever you took first keeps the other off the table (either way round). Bad
// blood's double scrap and Empty pockets' half would cancel out; weaker healing or less health on top of hits that hurt
// half again as much would be a death sentence, not a trade
const CLASH = [['blood', 'pockets'], ['blood', 'fragile'], ['price', 'fragile']];
export const clashes = id => CLASH.some(([a, b]) => (a === id || b === id) && (S.curses || []).includes(a === id ? b : a));
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
  const force = SAC.force; SAC.force = null;   // (the cheat menu can promise the next hand one: ui/cheats.js)
  if (!force && (bonusWave || run.wave < 1 || rand() >= SAC.chance)) return null;
  const curses = CURSES.filter(c => c.can() && !clashes(c.id));
  if ((force ? force === 'curse' : rand() < SAC.curse) && curses.length && curseRewards().length >= 3) return { kind: 'curse', curse: pick(curses) };
  if (S.scrap >= SAC.minScrap || force) return { kind: 'scrap', cost: sacCost() };
  return null;
}
// a curse taken: on you for good, and in the list of what you've taken this run, in its own colour
export function takeCurse(c) {
  c.st(); if (c.ap) c.ap(); (S.curses = S.curses || []).push(c.id);
  run.taken.push({ name: c.name, on: '', tag: 'Curse', text: c.text, r: 'x', wave: run.wave, n: 1, total: '' });
}
// a curse lifted (the cheat menu): its flags and stats back as they were, and gone from the list of what you've taken
export function dropCurse(c) {
  if (!(S.curses || []).includes(c.id)) return;
  c.off(); S.curses = S.curses.filter(k => k !== c.id);
  run.taken = run.taken.filter(t => !(t.r === 'x' && t.name === c.name));
}
