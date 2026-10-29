// HUD text helpers, toasts, announcements, slots, the pickup feed and floating labels.

import { $ } from '../core/dom.js';
import { GI, GI_VB } from './game-icons.js';
import { cam } from '../core/renderer.js';
import { cache, clamp, rand, rr, smooth } from '../core/math.js';
import { P } from '../player/player.js';
import { SLOTS } from '../weapons/slots.js';
import { WEAP } from '../weapons/gun-stats.js';
import { W8 } from '../game/run-state.js';
import { onScreen } from '../game/view-cam.js';
import { projV } from './crosshair.js';
import { gunArt, gunArtKey } from './melee-art.js';
import { RUN_CHAIN } from './run-stats.js';

export const setT = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } };
export const setH = (id, v) => { if (cache['h' + id] !== v) { cache['h' + id] = v; $(id).innerHTML = v; } };
// counters that roll like the drums of a slot machine: every digit is a drum (a strip of 0-9) that spins to its new
// value, up when the number goes up and down when it goes down. A big jump (a reload, an ammo box) spins each drum a
// whole extra turn and they stop one after another, left to right. setRoll stands in for setT on a counter; digits in
// a bit of text roll the same way, and the rest of the text just changes
const ROLL_N = 50;   // five copies of 0-9: a drum rests in the middle copy, so it can spin a full turn either way
function rollDrum() {
  const c = document.createElement('span'); c.className = 'rc';
  c.innerHTML = '<span class="rp">0</span><span class="rs">' + Array.from({ length: ROLL_N }, (_, k) => `<span>${k % 10}</span>`).join('') + '</span>';
  c._s = c.lastChild; c._p = 20; c._end = 0; c._s.style.setProperty('--p', -20);
  return c;
}
function drumTo(c, d, dir, spins, dur, now) {
  // back to the middle copy while it's still, so the next spin has room
  if (now > c._end && Math.floor(c._p / 10) !== 2) { c._p = 20 + (c._p % 10); c._s.style.transition = 'none'; c._s.style.setProperty('--p', -c._p); void c._s.offsetWidth; }
  const cur = c._p % 10;
  let t = dir > 0 ? c._p + ((d - cur + 10) % 10) + 10 * spins : dir < 0 ? c._p - ((cur - d + 10) % 10) - 10 * spins : c._p + d - cur;
  if (t > ROLL_N - 1 || t < 0) t = 20 + d;   // ran off the strip in a long run of quick changes: settle in the middle copy
  if (t === c._p) return;
  c._p = t; c._end = now + dur * 1000 + 60;
  c._s.style.transition = dur ? `transform ${dur}s cubic-bezier(.2,.9,.3,1.08)` : 'none'; c._s.style.setProperty('--p', -t);
}
function rollNum(sp, v, prev, now, str, spin) {
  const s = str || String(v), dir = Math.sign(v - prev), big = spin || Math.abs(v - prev) >= 10, cols = sp._cols;
  while (cols.length > s.length) sp.removeChild(cols.shift());                                                          // fewer digits: the leading drums go
  let added = false;
  while (cols.length < s.length) { const c = rollDrum(); sp.insertBefore(c, sp.firstChild); cols.unshift(c); added = true; }   // more: new ones start at 0
  if (added && prev !== v) void sp.offsetWidth;   // laid out at 0 first, so they roll up from there instead of appearing
  for (let k = 0; k < s.length; k++) drumTo(cols[k], +s[k], dir, big && dir ? 1 : 0, prev === v ? 0 : big ? 0.42 + 0.12 * k : 0.18, now);
}
// spin: every change spins its drums a whole extra turn (the wave number), not just a big jump
export function rollText(el, text, spin) {
  if (el._rt === text) return;
  el._rt = text;
  const now = performance.now(), parts = String(text).split(/(\d+)/), shape = parts.map((p, i) => i % 2 ? '#' : p).join('');
  const st = el._roll;
  if (st && st.shape === shape) { let j = 0; parts.forEach((p, i) => { if (i % 2) { const n = st.nums[j++], v = +p; rollNum(n.sp, v, n.v, now, p, spin); n.v = v; } }); return; }
  el.textContent = ''; const nums = [];
  parts.forEach((p, i) => {
    if (i % 2) { const sp = document.createElement('span'); sp.className = 'rn'; sp._cols = []; el.appendChild(sp); rollNum(sp, +p, +p, now, p); nums.push({ sp, v: +p }); }
    else if (p) el.appendChild(document.createTextNode(p));
  });
  el._roll = { shape, nums };
}
export const setRoll = (id, v, spin) => rollText($(id), v, spin);
export const popEl = id => { const el = $(id); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
let toastT = 0, annT = 0;
// a notification card: an icon tile, a short title and an optional hint line, coloured by kind (bad, warn, info, good)
export function toast(t, opt) {
  const o = opt || {}, el = $('toast');
  $('toastT').textContent = t; $('toastS').textContent = o.sub || ''; $('toastIc').innerHTML = FEED_ICON[o.icon] || FEED_ICON.gear;
  el.className = 'hud ' + (o.kind || 'info'); void el.offsetWidth; el.classList.add('show'); toastT = 2.6;
}
// the big centre-screen card: a small eyebrow, the headline, a rule that draws out from the middle, and a subtitle ribbon.
// a chain of kills (each within RUN_CHAIN of the last: ui/run-stats.js) called out from the second on: a small card under
// the middle with its name (STREAK), a pip for each kill in it, what it's paid past the third (zombies/damage.js), and a
// thin bar draining over the time left to keep it going. Each kill pops it in again, its glow hotter the longer it runs;
// it's there as long as the chain can still go on, and fades once it can't
const STREAK = [[10, 'Unstoppable'], [7, 'Massacre'], [5, 'Rampage'], [4, 'Quad kill'], [3, 'Triple kill'], [2, 'Double kill']], STREAK_PIPS = 10;
let streakT = 0;
export function streakShow(n, paid) {
  const s = STREAK.find(([k]) => n >= k), el = $('streak'); if (!s) return;
  const pips = '<i></i>'.repeat(Math.min(n, STREAK_PIPS)) + (n > STREAK_PIPS ? `<em>+${n - STREAK_PIPS}</em>` : '');
  el.innerHTML = `<b>${s[1]}</b><span class="pips">${pips}</span>` + (paid ? `<small>+${paid} scrap</small>` : '') + `<u></u>`;
  el.style.setProperty('--lv', Math.min(5, n - 1)); el.style.setProperty('--t', RUN_CHAIN + 's');
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop', 'on');
  clearTimeout(streakT); streakT = setTimeout(() => el.classList.remove('on'), RUN_CHAIN * 1000);
}
// kind '' is orange, 'gold' for a cleared wave, 'red' for brute nights
export function announce(a, b, opt) {
  const o = opt || {}, el = $('announce');
  $('annEye').textContent = o.eye || ''; $('annBig').textContent = a; $('annSmall').textContent = b;
  el.className = 'hud' + (o.kind ? ' ' + o.kind : ''); void el.offsetWidth; el.classList.add('show');
  el.style.opacity = 1; annT = 2.8;
}
// the slot row under the ammo count: each weapon you carry as a picture of its own model (ui/melee-art.js: gunArt), with
// whatever's fitted to it, by the number that picks it; the one in your hands lit, an empty slot just its number. Each
// picture is shown SLOT_ART.h tall, as wide as that makes it (between min and max), so every slot is only as wide as
// what's in it and the gaps between them come out even. The pictures are kept, so a slot's only drawn again when what's
// in it changes
const SLOT_ART = { h: 26, min: 28, max: 76 };
export function renderSlots() {
  const k = SLOTS.map(s => (W8.slot[s] ? gunArtKey(W8.slot[s]) : '-') + (W8.cur === s ? 'c' : '')).join();
  if (cache.slots === k) return; cache.slots = k;
  $('slots').innerHTML = SLOTS.map((s, i) => {
    const id = W8.slot[s], a = id && gunArt(id), nm = id ? WEAP[id].name : 'Empty';
    const aw = a ? `--aw:${clamp(SLOT_ART.h * a.w / a.h, SLOT_ART.min, SLOT_ART.max).toFixed(0)}px` : '';
    return `<span class="${W8.cur === s ? 'on' : ''}${id ? '' : ' lock'}" style="${aw}" aria-label="${i + 1}: ${nm}"><em>${i + 1}</em>${a ? `<i style="--art:url(${a.url})"></i>` : ''}</span>`;
  }).join('');
}
// pickup feed: entries slide in, matching ones stack their amounts
export const FEED_ICON = { scrap: GI.scrap, planks: GI.planks, metal: GI.metal, ammo: GI.ammo, med: GI.med, supply: GI.supply, gear: GI.gear };   // (ui/game-icons.js)
export const feedItems = [];
export function feed(kind, amount, label) {
  const now = performance.now();
  const ex = feedItems.find(f => f.kind === kind && f.label === label && now - f.t < 2600 && amount);
  if (ex) { ex.amount += amount; ex.t = now; ex.el.querySelector('b').textContent = '+' + ex.amount; ex.el.classList.remove('bump'); void ex.el.offsetWidth; ex.el.classList.add('bump'); ex.el.classList.toggle('alt'); return; }   // (alt: its timer runs from full again)
  const el = document.createElement('div'); el.className = 'fd ' + kind;
  el.innerHTML = `<i class="fdI"><svg viewBox="${GI_VB}">${FEED_ICON[kind] || FEED_ICON.gear}</svg></i>${amount ? '<b></b>' : ''}<span></span>`;
  if (amount) el.querySelector('b').textContent = '+' + amount;
  el.querySelector('span').textContent = label;
  $('feed').appendChild(el); feedItems.push({ kind, label, amount, t: now, el });
  while (feedItems.length > 5) { const f = feedItems.shift(); f.el.remove(); }
}
function tickFeed() {
  const now = performance.now();
  for (let k = feedItems.length - 1; k >= 0; k--) { const f = feedItems[k]; if (now - f.t > 3000 && !f.out) { f.out = true; f.el.classList.add('out'); } if (now - f.t > 3500) { f.el.remove(); feedItems.splice(k, 1); } }
}
export const floats = [];
// what you picked up, popping up off where it lay and easing up (FLOAT_UP): its kind's icon spinning in, glowing in the
// drop's colour, then how many in that colour and what, in small capitals underneath with a slash of colour under it
// (a weapon off the ground: just its name). kind is the feed's (FEED_ICON)
export function floatText(x, z, text, color, kind) {
  const el = document.createElement('div'), m = /^\+(\d+)\s*(.*)$/.exec(text || '');
  el.className = 'float pick' + (m ? '' : ' named'); if (color) el.style.setProperty('--fc', color);
  el.innerHTML = `<i class="pkI"><svg viewBox="${GI_VB}">${FEED_ICON[kind] || FEED_ICON.gear}</svg></i><span class="pkT">${m ? '<b></b>' : ''}<em></em></span>`;
  if (m) el.querySelector('b').textContent = '+' + m[1];
  el.querySelector('em').textContent = m ? m[2] : text;
  document.body.appendChild(el); floats.push({ el, x, z, t: 0 });
}
// how the labels move. A damage number (FLOAT_DMG) bursts off the zombie on a little arc, flung up and out to one side
// (up, side: px a second at 1080 high) and falling back (grav), tipped as it pops in and leaning the way it's going
// (tilt, degrees), over life seconds, its last fade of it fading and shrinking away. A pickup's label (FLOAT_UP) rises
// rise metres, quick and then slowing, over its life, popping in and fading over its last fade
const FLOAT_DMG = { life: 0.95, up: [230, 300], side: [35, 95], grav: 720, tilt: 14, pop: 0.16, fade: 0.38 };
const FLOAT_UP = { life: 1.15, rise: 1.1, pop: 0.22, fade: 0.32 };
const floatBack = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };   // (overshoots, then settles)
// the little labels that float up when you grab a drop, the damage numbers, and the pickup feed
export function stepFloats(rdt) {
  const px = innerHeight / 1080;
  for (let k = floats.length - 1; k >= 0; k--) {
    const f = floats[k]; f.t += rdt;
    let ox = 0, oy = 0, sc = 1, rot = 0, op = 1;
    if (f.dmg) {
      const D = FLOAT_DMG, t = f.t, u = t / D.life;
      if (f.vx === undefined) { f.vx = rr(...D.side) * (rand() < 0.5 ? -1 : 1); f.vy = rr(...D.up); f.r0 = rr(-D.tilt, D.tilt); }
      ox = f.vx * t * px; oy = -(f.vy * t - 0.5 * D.grav * t * t) * px;
      sc = t < D.pop ? 0.35 + 0.65 * floatBack(t / D.pop) : 1 - 0.18 * smooth(clamp((u - (1 - D.fade)) / D.fade, 0, 1));
      rot = f.r0 * (1 - smooth(clamp(t / 0.22, 0, 1))) + Math.sign(f.vx) * 6 * smooth(clamp((t - 0.25) / 0.6, 0, 1));
      op = (1 - smooth(clamp((u - (1 - D.fade)) / D.fade, 0, 1))) * (P.dead ? 0 : 1);
      projV.set(f.x, f.y0, f.z).project(cam);
      if (u >= 1) { f.el.remove(); floats.splice(k, 1); continue; }
    } else {
      const U = FLOAT_UP, u = f.t / U.life;
      sc = f.t < U.pop ? 0.5 + 0.5 * floatBack(f.t / U.pop) : 1;
      op = 1 - smooth(clamp((u - (1 - U.fade)) / U.fade, 0, 1));
      projV.set(f.x, (f.y0 !== undefined ? f.y0 : 1.2) + U.rise * (1 - Math.pow(1 - Math.min(1, u), 3)), f.z).project(cam);
      if (u >= 1) { f.el.remove(); floats.splice(k, 1); continue; }
    }
    f.el.style.transform = `translate(${((projV.x + 1) / 2 * innerWidth + ox).toFixed(1)}px,${((1 - projV.y) / 2 * innerHeight + oy).toFixed(1)}px) translate(-50%,-50%) rotate(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
    f.el.style.opacity = (onScreen(projV) ? op : 0).toFixed(3);   // (behind you in first person: game/view-cam.js)
  }
  tickFeed();
}
// toast and wave announcement timers
export function tickMessages(rdt) {
  if (toastT > 0) { toastT -= rdt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if (annT > 0) { annT -= rdt; if (annT <= 0) { $('announce').style.opacity = 0; $('announce').classList.remove('show'); } }
}

// setters for the variables above that other files change (an imported variable can only be read)
export function setAnnT(v) { return (annT = v); }
