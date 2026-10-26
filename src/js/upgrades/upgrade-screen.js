// Dealing, showing and picking upgrade cards, and the upgrade history.

import { $ } from '../core/dom.js';
import { GI, GI_VB } from '../ui/game-icons.js';
import { rand, rr } from '../core/math.js';
import { netLink } from '../net/net.js';
import { P } from '../player/player.js';
import { SLOT_NAME } from '../weapons/slots.js';
import { WEAP } from '../weapons/gun-stats.js';
import { MODS } from '../melee/melee-mods.js';
import { TIERS } from './tier-table.js';
import { curId, run, S, T } from '../game/run-state.js';
import { buildGuns } from '../weapons/build-weapons.js';
import { sweepDrops } from '../pickups/pickups.js';
import { closeStation, starFillSvg, starRow, tierRars } from '../stations/station-ui.js';
import { SFX } from '../audio/sfx.js';
import { glowGun, setStateRaw, state } from '../game/state.js';
import { setMouseDown, setMouseDownR } from '../input/keyboard-mouse.js';
import { beginBreak } from '../waves/waves.js';
import { AID_CHANCE, AID_TWO, aidNeed, findKind, kindTag, RAR, UPG } from './upgrades.js';
import { CHIP_MARK, chipCls, STACKS, stackTotal, UPG_FX, upgradeInfo } from './upgrade-info.js';
import { curseRewards, rollSac, SAC, takeCurse } from './sacrifice.js';
import { burnCards } from './card-burn.js';
import { setState } from '../ui/screens.js';
import { feed, popEl, setAnnT } from '../ui/hud-text.js';
import { wantLock } from '../game/view-cam.js';
import { gunCall } from '../ui/gear-popup.js';
import { listNames, netChoosing, netPicked } from '../net/sync.js';

let dealt = [], cardsArmed = false, armTimer = 0;
// how many cards are still to be taken from this hand (two once a sacrifice is made: upgrades/sacrifice.js), the ones
// taken so far (by place), and what's on offer to sacrifice beside the scrap (null for nothing)
let picksLeft = 1, sac = null, baseN = 3;
const picked = new Set();
// a card still worth taking: one a pick has already made moot (the next tier of a line just taken whole, a perk you
// now have) is greyed out; and of the cards a sacrifice adds (from baseN on) you take one at most
const stillGood = u => u.maxAll ? T(u.tierOf) < TIERS[u.tierOf].t.length : (!u.can || u.can());
const isDead = i => {
  if (picked.has(i)) return false;
  if (!dealt[i]) return true;
  return !stillGood(dealt[i]) || (i >= baseN && [...picked].some(k => k >= baseN));
};
function markDead() { [...$('cards').children].forEach((b, i) => b.classList.toggle('dead', !picked.has(i) && isDead(i))); }
// every BONUS_EVERY waves (5, 10, 15...) a second hand follows the first: skills and perks only, no aid or weapons
const BONUS_EVERY = 5;
export let bonusHand = false;
const bonusKind = u => ['Skill', 'Perk'].includes(findKind(u, u));
// (and only while there's a skill or perk left to give)
export const bonusDue = () => run.wave > 0 && run.wave % BONUS_EVERY === 0 && UPG.some(u => (!u.can || u.can()) && bonusKind(u));
// or take none of them and SKIP_SCRAP scrap instead (from the first to the second, rolled with each hand), SKIP_WAVE more
// of it for each wave past the first, so it's still worth taking late on
const SKIP_SCRAP = [5, 10], SKIP_WAVE = 0.12;
let skipScrap = 0;
// who a card is for, in plain words at the top of it: a weapon of yours, all your guns, or you
const FOR_TAG = { Gun: 'For all your guns', Ammo: 'For all your guns', Melee: 'For your melee weapons' };
function cardFor(u, c) {
  if (u.weaponOf) return 'A new weapon for your ' + SLOT_NAME[WEAP[u.weaponOf].slot].toLowerCase() + ' slot';
  if (u.modOf) return 'For your ' + gunCall(MODS[u.modOf].w);
  if (u.target) return 'For your ' + gunCall(u.target);
  return FOR_TAG[c.tag.split(' ')[0]] || 'For you';
}
function rarWeight(r) { const w = run.wave; return { c: 60, u: 26 + w * 1.5, r: 9 + w * 1.4, e: 3 + w * 1.0, l: 0.8 + w * 0.5 }[r]; }
const cardWt = (u, boost) => rarWeight(u.r) * (boost ? SAC.boost[u.r] || 1 : 1) * (typeof u.w === 'function' ? u.w() : u.w || 1);
// pick one from a pool by weight, and take it out of the pool
function drawCard(pool, wt) {
  const tot = pool.reduce((a, u) => a + wt(u), 0); let r = rand() * tot, k = 0;
  for (; k < pool.length - 1; k++) { r -= wt(pool[k]); if (r <= 0) break; }
  return pool.splice(k, 1)[0];
}
// three cards after a wave: always at least one skill (a perk if there's no skill left to give), aid only some of the
// time and more often the shorter you are of something (AID_CHANCE, upgrades/upgrades.js), and the rest skills, perks
// and weapons
const isAid = u => findKind(u, u) === 'Aid';
function dealCards(bonus) {
  const pool = UPG.filter(u => (!u.can || u.can()) && (!bonus || bonusKind(u))); dealt = [];
  const wt = u => cardWt(u);
  const aid = pool.filter(isAid), rest = pool.filter(u => !isAid(u));
  const kindIn = k => rest.filter(u => findKind(u, u) === k);
  const anchorFrom = kindIn('Skill').length ? kindIn('Skill') : kindIn('Perk');
  let anchor = null;
  if (anchorFrom.length) { anchor = drawCard(anchorFrom, wt); rest.splice(rest.indexOf(anchor), 1); dealt.push(anchor); }
  const need = aidNeed(), nAid = bonus ? 0 : rand() < AID_CHANCE[0] + (AID_CHANCE[1] - AID_CHANCE[0]) * need ? (rand() < AID_TWO * need ? 2 : 1) : 0;
  for (let k = 0; k < nAid && aid.length && dealt.length < 3; k++) dealt.push(drawCard(aid, wt));
  while (dealt.length < 3 && rest.length) dealt.push(drawCard(rest, wt));
  while (dealt.length < 3 && aid.length) dealt.push(drawCard(aid, wt));   // (only when there's nothing else left to deal)
  // shuffled, so the skill isn't always the first card
  for (let i = dealt.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [dealt[i], dealt[j]] = [dealt[j], dealt[i]]; }
  const sk = 1 + SKIP_WAVE * Math.max(0, run.wave - 1);
  skipScrap = Math.round((SKIP_SCRAP[0] + rand() * (SKIP_SCRAP[1] - SKIP_SCRAP[0])) * sk);
  $('upSkip').innerHTML = `Take none · <b>+${skipScrap} scrap</b> instead`; delete $('upSkip').dataset.down; $('upSkip').classList.remove('taken', 'gone');
  const wrap = $('cards'); wrap.innerHTML = ''; wrap.classList.remove('six');
  dealt.forEach((u, i) => wrap.appendChild(renderCard(document.createElement('button'), u, i)));
}
// each card's tilt as it lies, by its place: the first row's, then the second's
const ROTS = [-1.6, 0.8, -0.4, 0.6, -1.2, 1.0];
// a card's face: what it is, who it's for, what it does; and how it answers the cursor (b: a fresh button, or one
// already on the table being turned over to a new face)
function renderCard(b, u, i) {
  const c = u.card ? u.card() : { r: u.r, tag: u.tag, name: u.name, text: u.text, vis: typeof u.vis === 'function' ? u.vis() : u.vis };
  c.for = cardFor(u, c); c.tag = kindTag(u, c);   // who it's for (read from its old tag), then a skill, a perk, aid or a weapon
  if (u.maxAll) c.tag += ' · Maxed';
  u.shown = c;
  // (a line handed over whole says what all of its steps add up to: upgrades/sacrifice.js)
  const info = u.maxAll ? { fx: u.steps.flatMap(n => UPG_FX[n] || []).map(t => ({ t, good: true })) } : upgradeInfo(u, c), stats = u.stats && !info.fx.length;
  b.className = 'card r-' + c.r + (u.maxAll ? ' maxed' : ''); b.type = 'button';
  b.style.setProperty('--i', i); b.style.setProperty('--r', ROTS[i] + 'deg');
  b.innerHTML = `<div class="glare"></div><div class="holo"></div><div class="taken">Taken</div><div class="k"><span></span></div><div class="for"></div><div class="t"></div><div class="d"></div>${info.fx.length ? '<div class="fx"></div>' : ''}${stats ? '<div class="s"></div>' : ''}${c.vis ? '<div class="v"></div>' : ''}<div class="stamp">${RAR[c.r]}</div>`;
  const L = u.tierOf && TIERS[u.tierOf];
  b.querySelector('.k span').textContent = c.tag; if (L) b.querySelector('.k span').insertAdjacentHTML('beforeend', starRow(u.maxAll ? L.t.length : T(u.tierOf), L.t.length, tierRars(u.tierOf))); b.querySelector('.for').textContent = c.for; b.querySelector('.t').textContent = c.name; b.querySelector('.d').textContent = c.text;
  // what you get, in numbers: before → after, green when it's better
  info.fx.forEach(f => { const s = document.createElement('span'); s.className = chipCls(f); s.textContent = CHIP_MARK[chipCls(f)] + ' ' + f.t; b.querySelector('.fx').appendChild(s); });
  if (stats) b.querySelector('.s').textContent = u.stats();
  if (c.vis) b.querySelector('.v').textContent = c.vis;
  if (b.dataset.wired) return b;
  b.dataset.wired = '1';
  // the card leans toward the cursor as you move over it, and its glare and foil follow
  b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5; b.style.setProperty('--ry', (px * 14).toFixed(1) + 'deg'); b.style.setProperty('--rx', (-py * 12).toFixed(1) + 'deg'); b.style.setProperty('--gx', ((px + 0.5) * 100).toFixed(0) + '%'); b.style.setProperty('--gy', ((py + 0.5) * 100).toFixed(0) + '%'); });
  b.addEventListener('pointerleave', () => { b.style.setProperty('--rx', '0deg'); b.style.setProperty('--ry', '0deg'); });
  b.addEventListener('pointerdown', () => { if (cardsArmed) b.dataset.down = '1'; });
  b.addEventListener('click', e => { if (e.detail === 0 || b.dataset.down === '1') pickCard(+b.style.getPropertyValue('--i')); });
  return b;
}
// three more cards (more, from boost's odds or the curse's hand) dealt out from behind the three on the table: those
// rise into the top row as the new ones slide down out from under them into the second (FLIP: each starts where it
// was, or behind the card above it, and glides to its place in the grid)
function dealMore(more) {
  const wrap = $('cards'), old = [...wrap.children], from = old.map(b => b.getBoundingClientRect()); baseN = old.length;
  more.forEach(u => { const i = dealt.length; dealt.push(u); const b = renderCard(document.createElement('button'), u, i); b.classList.add('late'); wrap.appendChild(b); });
  wrap.classList.add('six');
  const all = [...wrap.children], to = all.map(b => b.getBoundingClientRect());
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  all.forEach((b, i) => {
    const a = from[i < old.length ? i : i - old.length] || to[i], t = to[i], late = i >= old.length;
    const dx = a.left + a.width / 2 - (t.left + t.width / 2), dy = a.top + a.height / 2 - (t.top + t.height / 2), rot = ROTS[i];
    if (reduce) return;
    b.animate(late ? [
      { transform: `translate(${dx}px,${dy}px) rotate(${ROTS[i - old.length]}deg) scale(.9)`, opacity: 0, filter: 'brightness(.5)' },
      { offset: 0.25, transform: `translate(${dx}px,${dy}px) rotate(${ROTS[i - old.length]}deg) scale(.92)`, opacity: 1, filter: 'brightness(.6)' },
      { offset: 0.7, transform: `translate(${dx * 0.15}px,${dy * 0.12 - 10}px) rotate(${rot * 2}deg) scale(1.02)`, filter: 'brightness(1)' },
      { transform: `rotate(${rot}deg)`, opacity: 1, filter: 'brightness(1)' }
    ] : [
      { transform: `translate(${dx}px,${dy}px) rotate(${rot}deg)` },
      { offset: 0.35, transform: `translate(${dx}px,${dy - 14}px) rotate(${rot * 0.5}deg) scale(1.03)` },
      { transform: `rotate(${rot}deg)` }
    ], { duration: late ? 820 : 600, delay: late ? 120 + (i - old.length) * 110 : 0, easing: 'cubic-bezier(.25,.8,.3,1.05)', fill: 'backwards' });
  });
  setTimeout(() => all.forEach(b => b.classList.remove('late')), 1400);
}
// the offer beside the scrap: what it costs, and what you get for it
function showSac() {
  const btn = $('upSac'); btn.classList.remove('armed', 'taken', 'curse', 'gone'); delete btn.dataset.down; btn.hidden = !sac;
  if (!sac) return;
  // (short on the button; what it costs and gives in the tip over it, on hover or focus)
  if (sac.kind === 'scrap') { btn.innerHTML = `<span class="sk">Sacrifice</span> <b>${sac.cost} scrap</b>`; $('upSacTip').textContent = `Three more cards, the rarer ones likelier. Take two, one of them from the new row.`; }
  else { btn.classList.add('curse'); btn.innerHTML = `<span class="sk">Curse</span> <b>${sac.curse.name}</b>`; $('upSacTip').textContent = `${sac.curse.text} For the rest of the run. Three legendary cards join the hand: take two, one of them from the new row.`; }
}
// taking it: a first press arms it (it asks to be sure: a curse is for good), a second within SAC_SURE seconds seals it
const SAC_SURE = 3;
let sacArmT = 0;
function pressSac() {
  if (state !== 'upgrade' || !cardsArmed || !sac || picked.size) return;
  const btn = $('upSac');
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed'); btn.querySelector('.sk').textContent = sac.kind === 'curse' ? 'Sure? Click again' : 'Click again';
    clearTimeout(sacArmT); sacArmT = setTimeout(() => { btn.classList.remove('armed'); btn.querySelector('.sk').textContent = sac && sac.kind === 'curse' ? 'Curse' : 'Sacrifice'; }, SAC_SURE * 1000);
    return;
  }
  clearTimeout(sacArmT); btn.classList.remove('armed'); btn.classList.add('taken');
  const o = sac; sac = null; picksLeft = SAC.picks;
  $('upSkip').classList.add('gone'); $('upHead').textContent = 'Take two';
  $('upgrade').classList.add('sacked');
  if (o.kind === 'scrap') {
    S.scrap -= o.cost; feed('scrap', 0, `${o.cost} scrap sacrificed`); popEl('scrap'); SFX.upgrade();
    const have = new Set(dealt), pool = UPG.filter(u => (!u.can || u.can()) && !have.has(u)), more = [];
    while (more.length < SAC.cards - dealt.length && pool.length) more.push(drawCard(pool, u => cardWt(u, true)));
    dealMore(more);
  } else {
    takeCurse(o.curse); SFX.upgrade(); $('upgrade').classList.add('cursed');
    // the three on the table stay as they are; the curse's three, legendary, come out from behind them
    const pool = curseRewards();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    dealMore(pool.slice(0, SAC.cards - dealt.length));
  }
  cardsArmed = false; setTimeout(() => { if (state === 'upgrade') cardsArmed = true; }, 900);
  cardEnd = performance.now() + CARD_TIME * 1000;   // (a fresh clock to choose two)
}
// the list of upgrades taken this run, newest first, with what each one does
export function renderHistory(list, countEl) {
  const el = $(list); el.innerHTML = ''; $(countEl).textContent = run.taken.length;
  if (!run.taken.length) { el.innerHTML = '<div class="none">Nothing yet. Clear a wave to pick your first skill, perk or aid.</div>'; return; }
  run.taken.slice().reverse().forEach(h => {
    const r = document.createElement('div'); r.className = 'hrow r-' + h.r;
    r.innerHTML = '<span class="hn"></span><span class="ht"></span><span class="hw"></span><span class="hd"></span>';
    r.querySelector('.hn').textContent = h.name; if (h.n > 1) { const i = document.createElement('i'); i.textContent = '\u00d7' + h.n; r.querySelector('.hn').appendChild(i); }
    r.querySelector('.ht').textContent = h.tag + ' \u00b7 ' + (RAR[h.r] || 'For the rest of the run') + (h.on ? ' \u00b7 ' + h.on : ''); r.querySelector('.hw').textContent = 'Wave ' + h.wave; r.querySelector('.hd').textContent = h.text + (h.total ? ' · ' + h.total : '');
    el.appendChild(r);
  });
}
export function openUpgrade(bonus) {
  closeStation(); bonusHand = !!bonus;
  $('upEyebrow').textContent = bonus ? `Wave ${run.wave} bonus · every ${BONUS_EVERY} waves, one more` : 'Wave ' + run.wave + ' cleared · ' + run.kills + ' kills so far';
  $('upKinds').textContent = bonus ? 'Skills · Perks' : 'Skills · Perks · Aid';
  $('upHead').textContent = bonus ? 'One more' : 'Take one';
  $('upgrade').classList.toggle('bonus', bonusHand);
  dealCards(bonus); cardsArmed = false; setMouseDown(false); setMouseDownR(false);
  picksLeft = 1; picked.clear(); baseN = 3; sac = rollSac(bonus || run.wave % BONUS_EVERY === 0); showSac();
  $('upgrade').classList.remove('sacked', 'cursed');
  setState('upgrade');
  const el = $('upgrade'); el.classList.remove('show', 'armed', 'waiting');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  $('announce').style.opacity = 0; setAnnT(0);
  clearTimeout(armTimer);
  armTimer = setTimeout(() => { if (state !== 'upgrade') return; cardsArmed = true; el.classList.add('armed'); }, 1000);
  startCardClock();
}
// you have CARD_TIME seconds to choose: the clock over the cards runs down, red for the last few, and when it's out one
// of the three cards is taken for you at random (never the scrap)
const CARD_TIME = 20, CARD_WARN = 5;
let cardClock = 0, cardEnd = 0;
function startCardClock() {
  clearInterval(cardClock); cardEnd = performance.now() + CARD_TIME * 1000;
  const tick = () => {
    if (state !== 'upgrade') { clearInterval(cardClock); return; }
    const left = Math.max(0, (cardEnd - performance.now()) / 1000);
    $('upClockT').textContent = Math.ceil(left); $('upClockBar').style.transform = `scaleX(${(left / CARD_TIME).toFixed(4)})`;
    $('upClock').classList.toggle('warn', left <= CARD_WARN);
    if (left <= 0) {
      clearInterval(cardClock); if (pickWait !== null) return;
      $('upClock').classList.add('out');
      while (picksLeft > 0 && state === 'upgrade') {
        const live = dealt.map((u, i) => i).filter(i => !picked.has(i) && !isDead(i));
        if (!live.length) { picksLeft = 0; settleUpgrade([...$('cards').children].filter((b, k) => !picked.has(k))); break; }
        cardsArmed = true; pickCard(live[(Math.random() * live.length) | 0]);
      }
    }
  };
  tick(); cardClock = setInterval(tick, 100);
}
function pickCard(i) {
  if (state !== 'upgrade' || !cardsArmed || !dealt[i] || picked.has(i) || isDead(i)) return;
  const u = dealt[i], c = u.shown; cardsArmed = false; picked.add(i);
  $('upSac').classList.add('gone'); $('upSkip').classList.add('gone');   // (once a card's taken, the offers are off)
  // a tier's next star fills the moment it's taken, before the guns are rebuilt for it (stations/station-ui.js: starFillSvg)
  { const nx = $('cards').children[i].querySelector('.stars svg.next'); if (nx) nx.outerHTML = starFillSvg('on', nx.getAttribute('style') ? ` style="${nx.getAttribute('style')}"` : ''); }
  const st = !u.weaponOf && !u.modOf && !u.maxAll && STACKS[c.name], before = st ? st.v() : 0;
  u.ap(); buildGuns(); SFX.upgrade();
  if (u.weaponOf || ((u.target || u.modOf) && (u.target || u.modOf) === curId())) glowGun(u.weaponOf || u.target || u.modOf);   // the gun in your hands glows only if the card did something to it (a body perk doesn't)
  P.wraps = 0;   // the wave's bandages come off your arm while the cards are covering you
  // in the history: what it was and, for one that went on a gun, which gun (by its plain name: your pistol, not your 9mm)
  { const nm = u.weaponOf ? WEAP[u.weaponOf].name : c.name, on = u.target ? 'On your ' + gunCall(u.target) : '', prev = run.taken.find(h => h.name === nm && (h.on || '') === on), total = st ? stackTotal(c.name, before) : '';
    if (prev) { prev.n++; prev.wave = run.wave; prev.text = c.text; prev.total = total; } else run.taken.push({ name: nm, on, tag: c.tag, text: c.text, r: c.r, wave: run.wave, n: 1, total }); }
  feed('gear', 0, u.weaponOf ? WEAP[u.weaponOf].name : c.name);
  // the pick: your card pops forward and gets stamped, the others burn away to ash (upgrades/card-burn.js), then the
  // screen fades out
  const cards = [...$('cards').children];
  cards[i].classList.add('picked');
  // two to take (a sacrifice): the first stays stamped where it is, and the rest wait for the second
  // (and the ones that pick has made moot greyed out; with nothing left worth taking, the hand's done)
  if (--picksLeft > 0) {
    markDead();
    if (dealt.some((u, k) => !picked.has(k) && !isDead(k))) { $('upHead').textContent = 'One more'; setTimeout(() => { if (state === 'upgrade') cardsArmed = true; }, 380); return; }
  }
  settleUpgrade(cards.filter((b, k) => !picked.has(k)));
}
// none of them: the scrap shown under the cards instead, and all three burn
function skipCards() {
  if (state !== 'upgrade' || !cardsArmed || picked.size || picksLeft > 1) return;
  cardsArmed = false;
  S.scrap += skipScrap; feed('scrap', skipScrap, 'scrap'); SFX.upgrade();
  P.wraps = 0;
  // the button's stamped with what you took, and the scrap flies off it into your scrap count
  const btn = $('upSkip'); btn.innerHTML = `<b>+${skipScrap} scrap</b> taken`; btn.classList.add('taken');
  scrapFly(btn, skipScrap);
  settleUpgrade([...$('cards').children]);
}
// bits of scrap thrown up off el and arcing down into the scrap count at the top of the screen, a few at a time, each
// one bumping the count as it lands (one bit for every scrap or so, up to SCRAP_BITS); or into another element (to),
// which flashes as each lands (its 'got' class: a teammate's card at the strongbox, net/teamwork.js)
const SCRAP_BITS = 10;
export function scrapFly(el, n, to) {
  const land = () => { if (!to) { popEl('scrap'); return; } to.classList.remove('got'); void to.offsetWidth; to.classList.add('got'); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { land(); return; }
  const a = el.getBoundingClientRect(), t = (to || $('scrap')).getBoundingClientRect(), tx = t.width ? t.left + t.width / 2 : 40, ty = t.height ? t.top + t.height / 2 : 30;
  const sx = a.left + a.width / 2, sy = a.top + a.height / 2, cols = ['#c9b48e', '#a88a5a', '#d8c7a0', '#8f7b5c'];
  for (let k = 0, N = Math.min(SCRAP_BITS, Math.max(5, n)); k < N; k++) {
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), sz = rr(20, 30);
    b.setAttribute('viewBox', GI_VB); b.innerHTML = GI.scrap; b.classList.add('scrapBit'); b.style.width = b.style.height = sz + 'px'; b.style.fill = cols[k % cols.length];
    document.body.appendChild(b);
    // out of the button in a little burst, up over the top of the arc, then down into the count
    const x0 = sx - sz / 2 + rr(-a.width * 0.35, a.width * 0.35), y0 = sy - sz / 2, ox = rr(-90, 90), oy = rr(-110, -50);
    const mx = (x0 + tx) / 2 + rr(-80, 80), my = Math.min(y0, ty) - rr(60, 140), ex = tx - sz / 2, ey = ty - sz / 2, r0 = rr(-40, 40), r1 = r0 + rr(-540, 540);
    const an = b.animate([
      { transform: `translate(${x0}px,${y0}px) scale(.3) rotate(${r0}deg)`, opacity: 0 },
      { offset: 0.16, transform: `translate(${x0 + ox}px,${y0 + oy}px) scale(1.05) rotate(${r0 + (r1 - r0) * 0.2}deg)`, opacity: 1 },
      { offset: 0.55, transform: `translate(${mx}px,${my}px) scale(.95) rotate(${r0 + (r1 - r0) * 0.6}deg)`, opacity: 1 },
      { transform: `translate(${ex}px,${ey}px) scale(.45) rotate(${r1}deg)`, opacity: 0.85 }
    ], { duration: rr(820, 1050), delay: k * 55, easing: 'cubic-bezier(.3,.05,.45,1)', fill: 'both' });
    an.onfinish = () => { b.remove(); land(); };
  }
}
// co-op: once you've chosen, the screen stays up, your card stamped and the rest still lying there, with "Waiting for
// other players" under them and the clock still running down (the time they have left), till every teammate has chosen
// too (their pose says which hand they last chose from: cw, net/avatars.js); then the rest burn and it goes. Not past
// PICK_WAIT_MAX seconds after your own clock ran out, for someone who stops answering. Hands are counted, not waves, so
// a bonus wave's second hand waits for everyone like the first
export const handNo = () => run.wave * 2 + (bonusHand ? 1 : 0);
const PICK_WAIT_MAX = 12;
export let pickWait = null, waitClock = 0;
function settleUpgrade(burn) {
  run.cardHand = handNo(); netPicked();
  wantLock();   // (in first person the mouse is taken back with the click that picked: game/view-cam.js)
  if (!netLink() || !netChoosing().length) { leaveUpgrade(burn); return; }
  pickWait = burn;
  const el = $('upgrade'); el.classList.remove('armed'); el.classList.add('waiting');
  const tick = () => {
    if (state !== 'upgrade') { clearInterval(waitClock); el.classList.remove('waiting'); pickWait = null; return; }
    const who = netChoosing();
    $('upWaitWho').textContent = who.length ? listNames(who) + (who.length > 1 ? ' are' : ' is') + ' still choosing' : '';
    if (who.length && performance.now() < cardEnd + PICK_WAIT_MAX * 1000) return;
    clearInterval(waitClock); el.classList.remove('waiting');
    const b = pickWait; pickWait = null; leaveUpgrade(b);
  };
  clearInterval(waitClock); tick(); waitClock = setInterval(tick, 100);
}
function leaveUpgrade(burn) {
  const el = $('upgrade'); clearInterval(cardClock);
  el.classList.remove('armed'); el.classList.add('picking');
  burnCards(burn);
  setStateRaw('leaving');
  setTimeout(() => { el.classList.remove('show'); }, 1400);   // (after the taken card's star has filled)
  // on a bonus wave the second hand comes straight after the first (bonusDue); otherwise back to the farm
  setTimeout(() => { el.classList.remove('picking'); if (!bonusHand && bonusDue()) { openUpgrade(true); return; } setState('play'); beginBreak(25); sweepDrops(); }, 1800);
}
// (a press has to start once the cards are live, like a card's, so a click held over from the wave doesn't take it)
$('upSkip').addEventListener('pointerdown', () => { if (cardsArmed) $('upSkip').dataset.down = '1'; });
$('upSkip').addEventListener('click', e => { if (e.detail === 0 || $('upSkip').dataset.down === '1') skipCards(); });
$('upSac').addEventListener('pointerdown', () => { if (cardsArmed) $('upSac').dataset.down = '1'; });
$('upSac').addEventListener('click', e => { if (e.detail === 0 || $('upSac').dataset.down === '1') { delete $('upSac').dataset.down; pressSac(); } });
