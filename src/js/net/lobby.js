// The co-op lobby on the title screen: your name, hosting a game or joining one by its code, who's in, and the host's
// start button. And the team list in the run: everyone else, with their health.

import { $ } from '../core/dom.js';
import { GI, GI_VB } from '../ui/game-icons.js';
import { cache, clamp } from '../core/math.js';
import {
  NET, NET_COL, NET_MAX, netHost, netJoin, netLeave, netLink, netName, netRoster, netSend, netStart
} from './net.js';
import { METAL } from '../barricades/planks.js';
import { audioInit } from '../audio/audio.js';
import { SFX } from '../audio/sfx.js';
import { state } from '../game/state.js';
import { BASE_HP } from '../ui/hud.js';
import { frAdd, frAnnounce, friendsUp, frOf, frRender, PALS } from './friends.js';

const lobbySeen = new Set();   // who's been shown in the seats already
export function lobbyRender() {
  const on = NET.on, room = on && (NET.host || NET.peers.size > 0);
  $('coopPick').hidden = on;
  $('coopRoom').hidden = !room;
  $('coopShow').textContent = NET.code;
  $('coopMsg').textContent = NET.status || (room && !NET.host ? 'Waiting for the host to start…' : room && NET.peers.size === 0 ? 'Send this code to your friends. They join from their title screen.' : '');
  $('coopGo').hidden = !NET.host; $('coopGo').disabled = NET.inGame;
  $('startBtn').hidden = on;
  // the players: the host first, then everyone in the order they came, and the empty places
  const list = on ? netRoster() : [];
  if (on && !NET.host) { list.length = 0; list.push({ id: NET.id, name: netName(), idx: NET.idx }, ...[...NET.peers.values()]); }
  list.sort((a, b) => a.idx - b.idx);
  const ol = $('coopList'); ol.textContent = '';
  for (const p of list) {
    const li = document.createElement('li'); li.style.setProperty('--pc', NET_COL[p.idx] || '#888'); li.textContent = p.name || 'Survivor';
    if (!lobbySeen.has(p.id)) { lobbySeen.add(p.id); li.className = 'new'; }   // (someone just in slides into their seat)
    const tag = document.createElement('em'); tag.textContent = (p.id === NET.hostId ? 'Host' : '') + (p.id === NET.id ? (p.id === NET.hostId ? ' · You' : 'You') : ''); li.appendChild(tag);
    // someone you're playing with who isn't on your friends list yet: one click to add them (net/friends.js)
    if (p.id !== NET.id && p.fid && p.fid !== PALS.me && !frOf(p.fid)) { const b = document.createElement('button'); b.type = 'button'; b.className = 'coopCopy'; b.textContent = 'Add friend'; b.onclick = () => frAdd(p.fid, p.name); li.appendChild(b); }
    ol.appendChild(li);
  }
  for (let k = list.length; k < NET_MAX; k++) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Open seat'; ol.appendChild(li); }
  if (!on) lobbySeen.clear();
  frAnnounce(); frRender();
}
// the sheet slides in, and back out before it's gone
let coopShut = 0;
export function toggleCoop(open) {
  const el = $('coop'), shown = !el.hidden && !el.classList.contains('closing'), show = open ?? !shown;
  $('coopBtn').setAttribute('aria-expanded', String(show));
  clearTimeout(coopShut); el.classList.remove('closing');
  if (show) { el.hidden = false; $('coopName').value = NET.name; friendsUp(); lobbyRender(); }
  else if (!el.hidden) { el.classList.add('closing'); coopShut = setTimeout(() => { el.hidden = true; el.classList.remove('closing'); }, 200); }
}
$('coopBtn').onclick = () => { audioInit(); toggleCoop(); };
$('coopName').addEventListener('input', e => {
  NET.name = e.target.value.trim().slice(0, 16);
  try { localStorage.setItem('fhh-name', NET.name); } catch (er) {}
  if (NET.on) netSend('name', { name: netName() });
  lobbyRender();
});
$('coopHost').onclick = () => netHost();
$('coopJoin').onclick = () => netJoin($('coopCode').value);
$('coopCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') netJoin($('coopCode').value); });
$('coopName').addEventListener('keydown', e => e.stopPropagation());   // typing a name never starts the run (T)
$('coopGo').onclick = () => netStart();
$('coopLeave').onclick = () => netLeave();
$('coopCopy').onclick = () => { try { navigator.clipboard.writeText(NET.code); $('coopCopy').textContent = 'Copied'; setTimeout(() => { $('coopCopy').textContent = 'Copy'; }, 1400); } catch (e) {} };
// a link with ?join=CODE opens the lobby and joins straight away
{ const m = /[?&]join=([A-Za-z0-9]{4})/.exec(location.search); if (m) setTimeout(() => { toggleCoop(true); $('coopCode').value = m[1].toUpperCase(); netJoin(m[1]); }, 300); }

// ---- in the run: your teammates over your own health, each a smaller copy of it (no heart trace): their name, their
// health and its bar, and their planks, scrap and kills
const TEAM_RES = ['planks', 'scrap', 'kills'];
// a teammate's health bar drawn like yours (ui/hud.js): the fill, with anything past the base 100 (armour, Tough skin,
// Stubborn) in its own colour; the red that trails a hit away (the .bar b's slower width); and the blue of healing
// still to come from a bandage or a medkit
export function paintBar(bar, hp, mx, heal, dead) {
  const f = dead ? 0 : clamp(hp / mx, 0, 1), inc = dead ? 0 : Math.min(1 - f, (heal || 0) / mx), i = bar.querySelector('i');
  i.style.setProperty('--hp', f * 100 + '%'); bar.querySelector('b').style.width = f * 100 + '%';
  i.style.setProperty('--b', Math.min(100, BASE_HP / mx * 100).toFixed(1) + '%');
  const s = bar.querySelector('s'); s.style.left = f * 100 + '%'; s.style.width = inc * 100 + '%';
}
export function renderTeam() {
  const el = $('team'), on = netLink() && state !== 'title';
  if (el.hidden === on) { el.hidden = !on; liftFeed(); }
  if (!on) return;
  const ps = [...NET.peers.values()].sort((a, b) => a.idx - b.idx);
  const key = ps.map(p => [p.id, p.name, Math.round(p.hp ?? 100), p.maxHp, p.heal || 0, p.dead ? 1 : 0, ...(p.stats || [])].join(':')).join('|');
  if (cache.team === key) return; cache.team = key;
  if (el.childElementCount !== ps.length || [...el.children].some((c, k) => c.dataset.id !== ps[k].id)) {
    el.textContent = '';
    for (const p of ps) {
      const d = document.createElement('div'); d.className = 'tm'; d.dataset.id = p.id; d.style.setProperty('--pc', NET_COL[p.idx] || '#888');
      d.innerHTML = '<div class="tmTop"><i></i><b class="tmName"></b><span class="tmHp"><em class="big"></em><span></span></span></div><div class="bar"><b></b><i></i><s></s></div>' +
        '<div class="res">' + TEAM_RES.map(r => { const m = r === 'planks' && METAL.on ? 'metal' : r; return `<span title="${m[0].toUpperCase() + m.slice(1)}"><svg viewBox="${GI_VB}" data-gi="${r}">${GI[m] || ''}</svg><b></b></span>`; }).join('') + '</div>';
      el.appendChild(d);
    }
  }
  ps.forEach((p, k) => {
    const d = el.children[k], hp = Math.max(0, Math.round(p.hp ?? 100)), mx = p.maxHp || 100;
    d.classList.toggle('down', !!p.dead); d.classList.toggle('low', !p.dead && hp / mx < 0.3);
    d.querySelector('.tmName').textContent = p.name;
    d.querySelector('.tmHp em').textContent = p.dead ? '' : hp; d.querySelector('.tmHp span').textContent = p.dead ? 'Down' : '/ ' + mx;
    paintBar(d.querySelector('.bar'), hp, mx, p.heal, p.dead);
    d.querySelectorAll('.res b').forEach((b, i) => { b.textContent = (p.stats || [])[i] ?? 0; });
  });
  liftFeed();
}
// a teammate going down: their card flashes red as it greys out (the bar left red and empty, their name struck
// through: styles/coop.css), and a small notice slides in at the top of the screen in their colour for TEAM_DOWN_T
// seconds; more than one at once stack under each other
const TEAM_DOWN_T = 3.6;
export function teamDown(p) {
  const d = [...$('team').children].find(c => c.dataset.id === p.id);
  if (d) { d.classList.remove('fell'); void d.offsetWidth; d.classList.add('fell'); }
  const box = $('teamNotes'), n = document.createElement('div');
  n.className = 'tdNote'; n.style.setProperty('--pc', NET_COL[p.idx] || '#888');
  n.innerHTML = `<svg viewBox="${GI_VB}">${GI.kills}</svg><b></b><span>is down</span>`; n.querySelector('b').textContent = p.name;
  box.appendChild(n); setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 450); }, TEAM_DOWN_T * 1000);
  SFX.thud();
}
// the pickup feed sits over your health, FEED_GAP clear of its top; whatever makes that panel taller (the team's cards
// over it in co-op, anything else on it) lifts the feed by as much, so the two never overlap. Measured whenever the
// panel changes size (both are zoomed the same, styles/hud-feed.css, so its height on screen is taken back out of it)
const FEED_GAP = 47, FEED_BASE = 158, HUD_ZOOM = 1.12;
function liftFeed() {
  const v = $('vitals'); if (v.hidden) return;
  const top = 18 + v.getBoundingClientRect().height / HUD_ZOOM;   // (its top, up from the bottom of the screen: it stands 18 up, styles/hud-vitals.css; by its height, which its sliding in at the start of a run doesn't change)
  $('feed').style.setProperty('--lift', Math.max(0, Math.round(top + FEED_GAP - FEED_BASE)) + 'px');
}
if (typeof ResizeObserver === 'function') new ResizeObserver(() => liftFeed()).observe($('vitals'));
