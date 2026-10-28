// Friends: the people you play with, kept in this browser by their friend codes. While the game is open you can be
// reached at yours (a second, always-on PeerJS peer, separate from a game's), so your friends see whether you're
// around, hosting (and how full) or in a run (and on which wave), can join the lobby you're hosting in one click, and
// you can invite them into yours: an invite shows on their title screen whether or not they have co-op open. Someone
// who adds you is added back. The people you've been in a lobby with are kept too (played with recently), a click
// from being friends. Between tabs (?net=local) the same goes over a BroadcastChannel.

import { $ } from '../core/dom.js';
import { NET, NET_MAX, NET_V, netCode, netJoin, netLib, netName, PEER_OPTS } from './net.js';
import { SFX } from '../audio/sfx.js';
import { lobbyRender } from './lobby.js';
import { LOOK } from '../player/look.js';
import { lookCardOn } from '../ui/look-card.js';
import { copyBtn, toggleCoop } from './lobby.js';
import { run } from '../game/run-state.js';
import { state } from '../game/state.js';

const FR_PREFIX = 'fhh-pal-', FR_QUIET = 16, FR_RETRY = 20;   // (seconds before a silent friend shows as away; between tries at reaching one)
export const PALS = { me: '', list: [], st: new Map(), up: false, peer: null, bc: null, t: 0, said: '', msg: '', open: false };
try { PALS.me = localStorage.getItem('fhh-me') || ''; PALS.list = JSON.parse(localStorage.getItem('fhh-friends') || '[]').filter(f => f && f.c); } catch (e) {}
if (!/^[A-Z0-9]{6}$/.test(PALS.me)) { PALS.me = (netCode() + netCode()).slice(0, 6); try { localStorage.setItem('fhh-me', PALS.me); } catch (e) {} }
const frSave = () => { try { localStorage.setItem('fhh-friends', JSON.stringify(PALS.list)); } catch (e) {} };
// the people you've been in a lobby with lately (RECENT.keep of them, the latest first): their friend code, the name
// they had, and when
const RECENT = { keep: 8 };
try { PALS.recent = JSON.parse(localStorage.getItem('fhh-recent') || '[]').filter(r => r && /^[A-Z0-9]{6}$/.test(r.c)); } catch (e) { PALS.recent = []; }
export function frMet(roster) {
  let changed = false;
  for (const r of roster || []) {
    if (!r.fid || r.fid === PALS.me || !/^[A-Z0-9]{6}$/.test(r.fid)) continue;
    const k = PALS.recent.findIndex(x => x.c === r.fid); if (k >= 0) PALS.recent.splice(k, 1);
    PALS.recent.unshift({ c: r.fid, n: String(r.name || 'Survivor').slice(0, 16), t: Date.now() }); changed = true;
  }
  if (!changed) return;
  PALS.recent.length = Math.min(PALS.recent.length, RECENT.keep);
  try { localStorage.setItem('fhh-recent', JSON.stringify(PALS.recent)); } catch (e) {}
  frRender();
}
export const frOf = c => PALS.list.find(f => f.c === c);
// what each friend is up to, as they last said: { name, st ('menu' | 'lobby' | 'game'), game (a code to join, if they
// host a lobby with room), heard, conn, tried, inv (a game code they invited you to) }
const frState = c => PALS.st.get(c) || (PALS.st.set(c, { heard: 0, tried: 0 }), PALS.st.get(c));
const frOnline = c => { const s = PALS.st.get(c); return !!s && performance.now() - s.heard < FR_QUIET * 1000; };

// what you're doing, for them
function frHello(q) {
  const st = NET.inGame ? 'game' : NET.on ? 'lobby' : 'menu', room = NET.host && !NET.inGame ? NET_MAX - 1 - NET.peers.size : 0;
  return { t: 'hi', v: NET_V, name: netName(), st, game: room > 0 ? NET.code : '', room, wave: NET.inGame ? run.wave | 0 : 0, q: q ? 1 : 0, look: LOOK.cur };   // (look: your survivor, for the card they see on hovering you: ui/look-card.js)
}
function frSend(c, m) {
  try {
    if (NET.mode === 'local') { if (PALS.bc) PALS.bc.postMessage({ to: c, from: PALS.me, m }); return; }
    const s = PALS.st.get(c); if (s && s.conn && s.conn.open) s.conn.send(m);
  } catch (e) {}
}
function frRecv(c, m) {
  if (!m || !/^[A-Z0-9]{6}$/.test(c) || c === PALS.me) return;
  const s = frState(c); s.heard = performance.now();
  if (m.t === 'hi') {
    Object.assign(s, { name: String(m.name || 'Survivor').slice(0, 16), st: m.st, game: m.v === NET_V ? m.game || '' : '', room: m.room || 0, wave: m.wave | 0 });
    if (m.look && typeof m.look === 'object' && !Array.isArray(m.look)) s.look = m.look;
    let f = frOf(c);
    if (!f) { f = { c, n: s.name }; PALS.list.push(f); frSave(); PALS.msg = s.name + ' added you as a friend'; }   // they added you: added back
    else if (f.n !== s.name) { f.n = s.name; frSave(); }
    if (s.inv && s.game !== s.inv) s.inv = '';   // an invite to a game they're no longer hosting is gone
    if (m.q) frSend(c, frHello(false));
  } else if (m.t === 'inv') { s.inv = m.game; s.name = m.name || s.name; PALS.msg = ''; PALS.invFrom = c; SFX.pick && SFX.pick(); invRender(); }
  else if (m.t === 'bye') s.heard = 0;
  frRender();
}

// ---- reachable at your code
export async function friendsUp() {
  if (PALS.up) return; PALS.up = true;
  if (NET.mode === 'local') { PALS.bc = new BroadcastChannel('fhh-pals'); PALS.bc.onmessage = e => { const x = e.data; if (x && x.to === PALS.me) frRecv(x.from, x.m); }; frBeat(true); return; }
  try { await netLib(); } catch (e) { PALS.up = false; return; }
  const peer = new Peer(FR_PREFIX + PALS.me, PEER_OPTS); PALS.peer = peer;
  peer.on('open', () => frBeat(true));
  peer.on('connection', frConn);
  peer.on('error', e => { if (e.type === 'unavailable-id') { PALS.msg = 'Your friend code is already open in another tab'; frRender(); } });   // (a friend who's away just doesn't answer)
  peer.on('disconnected', () => setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) {} }, 4000));
}
function frConn(conn) {
  const c = String(conn.peer || '').replace(FR_PREFIX, ''), s = frState(c);
  conn.on('open', () => { s.conn = conn; frSend(c, frHello(true)); });
  conn.on('data', m => frRecv(c, m));
  conn.on('close', () => { if (s.conn === conn) s.conn = null; frRender(); });
}
// every few seconds: a word to each friend you can reach, and another try at the ones you can't
function frBeat(all) {
  const now = performance.now();
  for (const f of PALS.list) {
    const s = frState(f.c);
    if (NET.mode === 'local') { frSend(f.c, frHello(true)); continue; }
    if (s.conn && s.conn.open) frSend(f.c, frHello(all));
    else if (PALS.peer && PALS.peer.open && now - s.tried > FR_RETRY * 1000) { s.tried = now; try { frConn(PALS.peer.connect(FR_PREFIX + f.c, { reliable: true, serialization: 'json' })); } catch (e) {} }
  }
}
export function frTick(rdt) {
  if (!PALS.up) return;
  PALS.t -= rdt; if (PALS.t > 0) return; PALS.t = 5;
  frBeat(false); frRender(); invRender();
}
// whenever what you're doing changes (hosting, joining, starting, leaving), your friends hear about it straight away
export function frAnnounce() {
  if (!PALS.up) return;
  const h = frHello(false), key = h.st + h.game + h.room + h.name + h.wave; if (key === PALS.said) return; PALS.said = key;
  for (const f of PALS.list) if (frOnline(f.c)) frSend(f.c, h);
}
addEventListener('pagehide', () => { for (const f of PALS.list) frSend(f.c, { t: 'bye' }); });

// ---- the list
export function frAdd(code, name) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) { PALS.msg = 'A friend code is six letters and numbers'; frRender(); return false; }
  if (code === PALS.me) { PALS.msg = 'That’s your own code'; frRender(); return false; }
  if (!frOf(code)) { PALS.list.push({ c: code, n: name || '' }); frSave(); }
  PALS.msg = ''; friendsUp(); frState(code).tried = 0; frBeat(true); frRender(); lobbyRender();
  return true;
}
function frRemove(code) { PALS.list = PALS.list.filter(f => f.c !== code); PALS.del = ''; frSave(); frRender(); lobbyRender(); }
function frInvite(code) { if (!NET.host || NET.inGame) return; frSend(code, { t: 'inv', game: NET.code, name: netName() }); frState(code).sent = performance.now(); frRender(); }
function frJoin(code) { const s = PALS.st.get(code), g = s && (s.inv || s.game); if (!g || NET.inGame) return; s.inv = ''; if (PALS.invFrom === code) PALS.invFrom = ''; invRender(); netJoin(g); }
// what a friend's up to, in a few words
function frWhat(s, on) {
  if (!on) return 'Away';
  if (s.inv) return 'Invited you to their game';
  if (s.st === 'game') return s.wave ? 'In a run, wave ' + s.wave : 'In a run';
  if (s.game) return 'Hosting, ' + (NET_MAX - s.room) + ' of ' + NET_MAX + ' in';
  return s.st === 'lobby' ? 'In a lobby' : 'On the title screen';
}
export function frRender() {
  if ($('coop').hidden) return;
  $('frMe').textContent = PALS.me;
  $('frMsg').textContent = PALS.msg;
  const ul = $('frList'), now = performance.now();
  const rows = PALS.list.map(f => {
    const s = PALS.st.get(f.c) || {}, on = frOnline(f.c), name = s.name || f.n || 'Friend';
    const join = on && !NET.inGame && (s.inv || s.game) && NET.code !== (s.inv || s.game), invite = on && NET.host && !NET.inGame && s.st === 'menu' && NET.peers.size < NET_MAX - 1;
    return { f, on, name, what: frWhat(s, on), join, invite: invite && !(s.sent && now - s.sent < 8000), sent: invite && s.sent && now - s.sent < 8000, game: on && s.st === 'game', del: PALS.del === f.c };
  }).sort((a, b) => b.on - a.on || a.name.localeCompare(b.name));
  const key = JSON.stringify(rows.map(r => [r.f.c, r.on, r.name, r.what, r.join, r.invite, r.sent, r.del]));
  if (ul.dataset.key !== key) {
    ul.dataset.key = key; ul.textContent = '';
    if (!rows.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No friends yet. Swap friend codes with someone you play with, or add them from the people you\'ve played with below.'; ul.appendChild(li); }
    for (const r of rows) {
      const li = document.createElement('li'); li.className = r.on ? (r.game ? 'busy' : 'on') : 'off';
      li.innerHTML = '<i></i><b></b><small></small><em></em><span class="frBtns"></span>';
      li.querySelector('b').textContent = r.name; li.querySelector('small').textContent = r.f.c; li.querySelector('em').textContent = r.what;
      const btns = li.querySelector('.frBtns');
      if (r.join) frBtn(btns, 'Join', 'coopCopy go', () => frJoin(r.f.c));
      if (r.invite) frBtn(btns, 'Invite', 'coopCopy', () => frInvite(r.f.c));
      if (r.sent) frBtn(btns, 'Invited', 'coopCopy', () => {}).disabled = true;
      // removing someone asks first: the cross turns into Remove? for a few seconds
      if (r.del) frBtn(btns, 'Remove?', 'coopCopy warn', () => frRemove(r.f.c));
      else frBtn(btns, '×', 'frDel', () => { PALS.del = r.f.c; clearTimeout(PALS.delT); PALS.delT = setTimeout(() => { PALS.del = ''; frRender(); }, 3000); frRender(); }, 'Remove ' + r.name);
      lookCardOn(li, 'f:' + r.f.c, () => { const s = PALS.st.get(r.f.c); return s && s.look && { look: s.look, name: r.name, col: r.on ? '#6fd07a' : '#5c5850', sub: r.what }; });   // (their survivor, as they last said: ui/look-card.js)
      ul.appendChild(li);
    }
  }
  // played with recently: whoever's not a friend yet, a click from being one
  const rec = PALS.recent.filter(r => !frOf(r.c)), rl = $('frRecent'), rk = rec.map(r => r.c + r.n).join();
  $('frRecentWrap').hidden = !rec.length;
  if (rl.dataset.key !== rk) {
    rl.dataset.key = rk; rl.textContent = '';
    for (const r of rec) {
      const li = document.createElement('li'); li.className = 'off';
      li.innerHTML = '<i></i><b></b><small></small><em></em><span class="frBtns"></span>';
      li.querySelector('b').textContent = r.n; li.querySelector('small').textContent = r.c; li.querySelector('em').textContent = 'Played together ' + ago(r.t);
      frBtn(li.querySelector('.frBtns'), 'Add friend', 'coopCopy', () => frAdd(r.c, r.n));
      rl.appendChild(li);
    }
  }
  // friends hosting a lobby with room, to join from the co-op screen before you've a game of your own
  const open = NET.on ? [] : PALS.list.map(f => ({ f, s: PALS.st.get(f.c) || {} })).filter(({ f, s }) => frOnline(f.c) && s.game && s.st !== 'game'), ok = $('coopOpen'), okey = open.map(({ f, s }) => f.c + s.game + s.room + (s.inv ? 'i' : '')).join();
  $('coopOpenWrap').hidden = !open.length;
  if (ok.dataset.key !== okey) {
    ok.dataset.key = okey; ok.textContent = '';
    for (const { f, s } of open) {
      const li = document.createElement('li'), name = s.name || f.n || 'Friend';
      li.innerHTML = '<b></b><em></em>'; li.querySelector('b').textContent = name + '\u2019s game'; li.querySelector('em').textContent = (NET_MAX - s.room) + ' of ' + NET_MAX + ' in' + (s.inv ? ', invited you' : '');
      frBtn(li, 'Join', 'coopCopy go', () => frJoin(f.c));
      ok.appendChild(li);
    }
  }
}
function frBtn(box, t, cls, fn, label) { const x = document.createElement('button'); x.type = 'button'; x.className = cls; x.textContent = t; if (label) x.setAttribute('aria-label', label); x.onclick = fn; box.appendChild(x); return x; }
// how long ago, roughly
function ago(t) {
  const m = (Date.now() - t) / 60000;
  return m < 2 ? 'just now' : m < 60 ? Math.round(m) + ' minutes ago' : m < 120 ? 'an hour ago' : m < 1440 ? Math.round(m / 60) + ' hours ago' : m < 2880 ? 'yesterday' : Math.round(m / 1440) + ' days ago';
}
// an invite on the title screen, whether co-op's open or not: who it's from, Join and Not now
export function invRender() {
  const el = $('invToast'), c = PALS.invFrom, s = c && PALS.st.get(c), show = !!(s && s.inv && state === 'title' && $('coop').hidden && !NET.inGame && NET.code !== s.inv);
  if (el.hidden === !show && (!show || el.dataset.c === c)) return;
  el.hidden = !show; el.dataset.c = c || '';
  if (show) { el.querySelector('b').textContent = s.name || 'A friend'; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
}
$('invJoin').onclick = () => { const c = PALS.invFrom; toggleCoop(true); if (c) frJoin(c); };
$('invNo').onclick = () => { const s = PALS.st.get(PALS.invFrom); if (s) s.inv = ''; PALS.invFrom = ''; invRender(); frRender(); };
$('frCopy').onclick = () => copyBtn($('frCopy'), PALS.me);   // (net/lobby.js)
$('frAddBtn').onclick = () => { if (frAdd($('frCode').value)) $('frCode').value = ''; };
$('frCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && frAdd($('frCode').value)) $('frCode').value = ''; });
// with friends already on the list, you're reachable as soon as the game's open, so they see you're around
if (PALS.list.length) setTimeout(friendsUp, 1500);
