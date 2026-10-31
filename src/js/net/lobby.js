// The co-op screen (opened from the title's Co-op): your name, hosting a game or joining one (by its code, or a
// friend's from the list of them hosting now), and once you're in one, its lobby: the four seats with each survivor's
// picture, who's set to go (a Ready stamp across their seat), the view everyone plays in, the lobby's chat
// (net/chat.js), the code and an invite link to send, and the host's Start, which waits until everyone's ready. Your
// friends down the side (net/friends.js). And the team list in the run: everyone else, with their health.

import { $ } from '../core/dom.js';
import { GI, GI_VB } from '../ui/game-icons.js';
import { cache, clamp } from '../core/math.js';
import {
  NET, NET_COL, NET_MAX, netAllReady, netHost, netJoin, netKick, netLeave, netLink, netName, netReady, netRoster, netSend, netSetGame, netSetMode, netSetView, netStart
} from './net.js';
import { METAL } from '../barricades/planks.js';
import { audioInit } from '../audio/audio.js';
import { SFX } from '../audio/sfx.js';
import { wantLock } from '../game/view-cam.js';
import { state } from '../game/state.js';
import { BASE_HP } from '../ui/hud.js';
import { frAdd, frAnnounce, friendsUp, frOf, frRender, invRender, PALS } from './friends.js';
import { LOOK } from '../player/look.js';
import { lookThumb } from '../ui/look-card.js';
import { chatRender } from './chat.js';
import { PVP, pvpMate } from '../pvp/pvp.js';

const lobbySeen = new Set();   // who's been shown in the seats already (someone just in slides into their seat)
let lookSent = '';
export function lobbyRender() {
  const on = NET.on, room = on && (NET.host || NET.peers.size > 0), host = NET.host;
  $('coopPick').hidden = on;
  $('coopRoom').hidden = !room;
  $('coopShow').textContent = NET.code;
  $('startBtn').hidden = on; $('titleView').hidden = on; $('titleMode').hidden = on;   // (your own view's for a run on your own: in co-op it's the lobby's)
  $('coopBtn').classList.toggle('inLobby', room);   // (the title's Co-op shows you're in one: styles/coop.css)
  $('coopMsg').textContent = NET.status || '';
  // your look, if it's changed since the others were told (the Character menu, between visits to the lobby)
  if (on) { const lk = JSON.stringify(LOOK.cur); if (lk !== lookSent) { lookSent = lk; netSend('look', { look: LOOK.cur }); } } else lookSent = '';
  // the view everyone plays in: the host's to pick (net/net.js), shown to the rest
  for (const b of $('coopView').querySelectorAll('button')) { b.setAttribute('aria-checked', String(b.dataset.v === NET.view)); b.disabled = !host || NET.inGame; }
  $('coopViewNote').textContent = host ? 'Everyone plays in it' : 'The host picks it';
  // and the run's mode, the same: normal or no perks
  for (const b of $('coopMode').querySelectorAll('button')) { b.setAttribute('aria-checked', String(b.dataset.m === NET.runMode)); b.disabled = !host || NET.inGame; }
  $('coopModeNote').textContent = host ? 'Everyone plays in it' : 'The host picks it';
  // and the game: the farm, or the arena and its mode (pvp/pvp.js); no perks only means anything on the farm
  for (const b of $('coopGame').querySelectorAll('button')) { b.setAttribute('aria-checked', String(b.dataset.g === NET.game)); b.disabled = !host || NET.inGame; }
  for (const b of $('coopArena').querySelectorAll('button')) { b.setAttribute('aria-checked', String(b.dataset.a === NET.arena)); b.disabled = !host || NET.inGame; }
  $('coopArena').hidden = NET.game !== 'arena'; $('coopMode').hidden = NET.game === 'arena';
  $('coopGameNote').textContent = host ? 'Everyone plays it' : 'The host picks it';
  $('coopArenaNote').textContent = ARENA_NOTE[NET.arena] || '';
  // what you can do: the host starts once everyone's ready; a joiner says they're ready (or not after all)
  const others = [...NET.peers.values()], waiting = others.filter(p => !p.ready).map(p => p.name);
  $('coopGo').hidden = !host; $('coopGo').classList.toggle('held', host && !netAllReady()); $('coopGo').disabled = NET.inGame;
  $('coopReady').hidden = host || !room;
  $('coopReady').classList.toggle('ghost', NET.ready); $('coopReady').firstChild.textContent = NET.ready ? 'Cancel ready ' : 'Ready ';
  $('coopLeave').textContent = host ? 'Close the lobby' : 'Leave';
  $('coopWait').textContent = !room ? '' : host ? (!others.length ? 'Starting on your own is fine too.' : waiting.length ? 'Waiting for ' + waiting.join(' and ') + ' to get ready' : 'Everyone\u2019s ready')
    : NET.ready ? 'Waiting for the host to start' : 'Ready up when you\u2019re set';
  renderSeats();
  if (!on) lobbySeen.clear();
  chatRender(); frAnnounce(); frRender(); invRender();
}
// the seats: the host first, then everyone in the order they came, and the open ones. Each a card in its player's
// colour with their survivor's picture (ui/look-card.js: lookThumb), their name and number, Host and You, a Ready stamp
// across it once they're set, Add friend for someone who isn't one yet, and for the host a cross to send a joiner out
function renderSeats() {
  const on = NET.on, list = on ? netRoster() : [];
  if (on && !NET.host) { list.length = 0; list.push({ id: NET.id, name: netName(), idx: NET.idx, look: LOOK.cur, ready: NET.ready }, ...[...NET.peers.values()]); }
  list.sort((a, b) => a.idx - b.idx);
  const ol = $('coopList'), key = JSON.stringify([NET.host, list.map(p => [p.id, p.name, p.idx, !!p.ready, JSON.stringify(p.look || null), p.fid && !!frOf(p.fid)])]);
  if (ol.dataset.key === key) return; ol.dataset.key = key;
  ol.textContent = '';
  for (const p of list) {
    const me = p.id === NET.id, isHost = p.id === NET.hostId, li = document.createElement('li');
    li.className = 'seat' + (me ? ' you' : '') + (p.ready && !isHost ? ' ready' : '') + (lobbySeen.has(p.id) ? '' : ' new'); lobbySeen.add(p.id);
    li.style.setProperty('--pc', NET_COL[p.idx] || '#888');
    const look = me ? LOOK.cur : (NET.peers.get(p.id) || p).look, pic = look ? lookThumb(look) : '';
    li.innerHTML = '<span class="sPic"></span><span class="sNum"></span><b class="sName"></b><em class="sTag"></em><span class="sStamp">Ready</span>';
    if (pic) { const im = document.createElement('img'); im.alt = ''; im.src = pic; li.querySelector('.sPic').appendChild(im); }
    li.querySelector('.sNum').textContent = p.idx + 1; li.querySelector('.sName').textContent = p.name || 'Survivor';
    li.querySelector('.sTag').textContent = [isHost ? 'Host' : p.ready ? '' : 'Not ready yet', me ? 'You' : ''].filter(Boolean).join(', ');
    // someone you're playing with who isn't on your friends list yet: one click to add them (net/friends.js)
    if (!me && p.fid && p.fid !== PALS.me && !frOf(p.fid)) { const b = document.createElement('button'); b.type = 'button'; b.className = 'coopCopy sAdd'; b.textContent = 'Add friend'; b.onclick = () => frAdd(p.fid, p.name); li.appendChild(b); }
    if (NET.host && !me && !NET.inGame) { const b = document.createElement('button'); b.type = 'button'; b.className = 'sKick'; b.textContent = '\u00d7'; b.setAttribute('aria-label', 'Remove ' + (p.name || 'Survivor') + ' from the lobby'); b.onclick = () => netKick(p.id); li.appendChild(b); }
    ol.appendChild(li);
  }
  for (let k = list.length; k < NET_MAX; k++) { const li = document.createElement('li'); li.className = 'seat empty'; li.innerHTML = '<span class="sPic"></span><span class="sNum"></span><b class="sName">Open seat</b><em class="sTag">Waiting for someone</em>'; li.querySelector('.sNum').textContent = k + 1; ol.appendChild(li); }
}
// the screen opens over the title and closes back to it (Esc, or Back)
let coopShut = 0;
export const coopOpen = () => !$('coop').hidden && !$('coop').classList.contains('closing');
export function toggleCoop(open) {
  const el = $('coop'), show = open ?? !coopOpen();
  $('coopBtn').setAttribute('aria-expanded', String(show));
  clearTimeout(coopShut); el.classList.remove('closing');
  if (show) { el.hidden = false; document.body.classList.add('coopOn'); $('coopName').value = NET.name; friendsUp(); lobbyRender(); invRender(); }
  else if (!el.hidden) { el.classList.add('closing'); coopShut = setTimeout(() => { el.hidden = true; el.classList.remove('closing'); document.body.classList.remove('coopOn'); invRender(); }, 220); }
}
$('coopBtn').onclick = () => { audioInit(); toggleCoop(); };
$('coopClose').onclick = () => toggleCoop(false);
$('coopX').onclick = () => toggleCoop(false);   // (and the cross by its title)
$('coopName').addEventListener('input', e => {
  NET.name = e.target.value.trim().slice(0, 16);
  try { localStorage.setItem('fhh-name', NET.name); } catch (er) {}
  if (NET.on) netSend('name', { name: netName() });
  lobbyRender();
});
$('coopHost').onclick = () => netHost();
$('coopJoin').onclick = () => netJoin($('coopCode').value);
// the code box takes the four characters however they come (pasted with a space, lower case) and joins on Enter
$('coopCode').addEventListener('input', e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); if (v !== e.target.value) e.target.value = v; });
$('coopCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') netJoin($('coopCode').value); });
$('coopName').addEventListener('keydown', e => e.stopPropagation());   // typing a name never starts the run (T)
$('coopGo').onclick = () => { if (netAllReady()) wantLock(true); netStart(); };   // (in first person the mouse is taken with this click: game/view-cam.js)
$('coopReady').onclick = () => { netReady(!NET.ready); SFX.click(); };
$('coopLeave').onclick = () => netLeave();
$('coopView').onclick = e => { const b = e.target.closest('button'); if (b && !b.disabled) netSetView(b.dataset.v); };
$('coopMode').onclick = e => { const b = e.target.closest('button'); if (b && !b.disabled) netSetMode(b.dataset.m); };
$('coopGame').onclick = e => { const b = e.target.closest('button'); if (b && !b.disabled) netSetGame(b.dataset.g); };
$('coopArena').onclick = e => { const b = e.target.closest('button'); if (b && !b.disabled) netSetGame('arena', b.dataset.a); };
// what each of the arena's modes is, in a line under its name
const ARENA_NOTE = { ffa: 'Everyone for themselves, first to 15 kills', tdm: 'Two sides, back in after you fall, first side to 20 kills', rounds: 'Two sides, one life a round, first to 5 rounds' };
// a Copy button: says so only once the clipboard's really taken it (a browser that won't let the page at it says that)
export function copyBtn(el, text) {
  const was = el.dataset.label || (el.dataset.label = el.textContent);
  const say = t => { el.textContent = t; clearTimeout(el._cp); el._cp = setTimeout(() => { el.textContent = was; }, 1400); };
  try { navigator.clipboard.writeText(text).then(() => say('Copied'), () => say('Can\'t copy')); } catch (e) { say('Can\'t copy'); }
}
$('coopCopy').onclick = () => copyBtn($('coopCopy'), NET.code);
// an invite link: this page with ?join=CODE, which opens the co-op screen and joins straight away (between tabs on one
// machine it keeps ?net=local)
$('coopLink').onclick = () => copyBtn($('coopLink'), location.origin + location.pathname + '?join=' + NET.code + (NET.mode === 'local' ? '&net=local' : ''));
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
  const ps = [...NET.peers.values()].filter(p => !PVP.on || pvpMate(p)).sort((a, b) => a.idx - b.idx);   // (in the arena, only your own side: pvp/pvp.js)
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
