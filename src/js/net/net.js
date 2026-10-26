// Online co-op: the connection between up to four players' games. One hosts: their game runs the farm itself (the
// zombies, the waves, the boards) and passes it on (net/sync.js); the others join with the host's four-letter code and
// each runs their own survivor, telling the rest what they do. Everything goes through the host, which hands each
// message on to the others: no two joiners talk to each other directly.
// Two ways to connect: WebRTC through PeerJS (vendor/peerjs.min.js, loaded the first time it's wanted; its public
// server only introduces the players to each other, the game itself runs player to player), or, with ?net=local in the
// address, a BroadcastChannel between tabs of one browser, for trying it out on one machine.

import { LOOK } from '../player/look.js';
import { setFlowDirty } from '../barricades/planks.js';
import { state } from '../game/state.js';
import { enterRun, leaveToMenu } from '../ui/screens.js';
import { announce, feed } from '../ui/hud-text.js';
import { netDropAvatar } from './avatars.js';
import { lobbyRender } from './lobby.js';
import { PALS } from './friends.js';
import { SET } from '../ui/settings.js';
import { setViewMode, VCAM } from '../game/view-cam.js';

export const NET_V = 1, NET_MAX = 4, NET_PREFIX = 'fhh-coop-', NET_QUIET = 15;   // (NET_QUIET: seconds without a word before a player counts as gone; a slow machine can stall that long building its shaders)
export const NET = { on: false, host: false, mode: /[?&]net=local/.test(location.search) ? 'local' : 'peer', id: '', hostId: '', code: '', name: '', inGame: false, status: '', idx: 0,
  view: 'iso',   // everyone's view in the run, the host's pick in the lobby (isometric or first person: netSetView)
  peers: new Map(),   // everyone else in the game, by id: { id, name, look, idx, heard, ... } (net/avatars.js adds their avatar)
  peer: null, conns: new Map(), conn: null, bc: null, beatT: 0 };
export const NET_ON = {};   // what to do with each kind of message: NET_ON.hit = m => ...
// each player's colour, by their place in the game (the host first): their name, their marker and their nameplate
export const NET_COL = ['#e0a050', '#5fb4e8', '#7ad07a', '#d87ad0'];
export const netLink = () => NET.on && NET.inGame;            // in a co-op run
export const netClient = () => NET.on && NET.inGame && !NET.host;   // in one someone else hosts: their game runs the zombies
try { NET.name = (localStorage.getItem('fhh-name') || '').slice(0, 16); } catch (e) {}
// PeerJS's own free server introduces the players by default; ?peer=host:port in the address uses another (one of
// your own: npx peerjs --port 9000)
export const PEER_OPTS = (() => {
  const m = /[?&]peer=([^&]+)/.exec(location.search); if (!m) return { debug: 1 };
  const [host, port] = decodeURIComponent(m[1]).split(':');
  return { debug: 1, host, port: +port || 443, secure: (+port || 443) === 443, path: '/' };
})();
export const netCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let k = 0; k < 4; k++) s += A[(Math.random() * A.length) | 0]; return s; };
export const netName = () => NET.name || 'Survivor';

// ---- sending: to everyone (a joiner's goes to the host, who hands it on), or to one player
export function netSend(t, d) { if (!NET.on) return; const m = Object.assign({ t, f: NET.id }, d); if (NET.host) netOut(m, null); else netRaw(NET.hostId, m); }
export function netTo(id, t, d) { if (!NET.on) return; const m = Object.assign({ t, f: NET.id, to: id }, d); netRaw(NET.host ? id : NET.hostId, m); }
// the host's own: to every joiner but `skip`
function netOut(m, skip) { for (const id of NET.peers.keys()) if (id !== skip) netRaw(id, m); }
function netRaw(id, m) {
  try {
    if (NET.mode === 'local') { if (NET.bc) NET.bc.postMessage({ to: id, from: NET.id, m }); return; }
    const c = NET.host ? NET.conns.get(id) : NET.conn; if (c && c.open) c.send(m);
  } catch (e) { console.warn('net send', e); }
}
// a message in: the host hands on what's for the others first, then everyone acts on what's for them
function netRecv(m) {
  if (!m || !m.t) return;
  const p = NET.peers.get(m.f); if (p) p.heard = performance.now();
  if (NET.host && m.f !== NET.id) {
    if (m.to && m.to !== NET.id) { netRaw(m.to, m); return; }
    if (!m.to && m.t !== 'hello' && m.t !== 'beat') netOut(m, m.f);
  }
  const fn = NET_ON[m.t];
  if (fn) { try { fn(m); } catch (e) { console.error('net ' + m.t, e); } }
}

// ---- hosting and joining
export function netLib() {
  if (window.Peer) return Promise.resolve();
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = window.PEERJS_SRC || './vendor/peerjs.min.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the connection library')); document.head.appendChild(s); });
}
function netReset() {
  try { if (NET.peer) NET.peer.destroy(); } catch (e) {}
  try { if (NET.bc) NET.bc.close(); } catch (e) {}
  for (const p of NET.peers.values()) netDropAvatar(p);
  Object.assign(NET, { on: false, host: false, id: '', hostId: '', code: '', inGame: false, idx: 0, peer: null, conn: null, bc: null });
  NET.conns.clear(); NET.peers.clear();
  if (VCAM.mode !== 'free') setViewMode(SET.view);   // (out of the game: your own view again, the one in the settings)
}
export async function netHost() {
  netReset(); NET.status = 'Opening a game…'; lobbyRender();
  const code = netCode();
  try {
    if (NET.mode === 'local') {
      Object.assign(NET, { on: true, host: true, code, id: 'H-' + code, hostId: 'H-' + code });
      NET.bc = new BroadcastChannel(NET_PREFIX + code); NET.bc.onmessage = e => { const x = e.data; if (x.to === NET.id) netRecv(x.m); };
    } else {
      await netLib();
      await new Promise((ok, no) => {
        const peer = new Peer(NET_PREFIX + code, PEER_OPTS); NET.peer = peer;
        peer.on('open', id => { Object.assign(NET, { on: true, host: true, code, id, hostId: id }); ok(); });
        peer.on('error', e => { if (!NET.on) no(e); else netProblem(e); });
        peer.on('connection', c => {
          c.on('open', () => NET.conns.set(c.peer, c));
          c.on('data', netRecv);
          c.on('close', () => netGone(c.peer, 'left'));
        });
      });
    }
    NET.idx = 0; NET.view = SET.view; NET.status = ''; lobbyRender();   // (the host's own view to start with: they can change it in the lobby)
  } catch (e) { netReset(); NET.status = 'Could not open a game: ' + (e.message || e.type || e); lobbyRender(); }
}
export async function netJoin(code) {
  code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) { NET.status = 'The code is four letters and numbers'; lobbyRender(); return; }
  netReset(); NET.status = 'Joining ' + code + '…'; lobbyRender();
  const hello = { t: 'hello', v: NET_V, name: netName(), look: LOOK.cur, fid: PALS.me };
  try {
    if (NET.mode === 'local') {
      Object.assign(NET, { on: true, code, id: 'P-' + Math.random().toString(36).slice(2, 8), hostId: 'H-' + code });
      NET.bc = new BroadcastChannel(NET_PREFIX + code); NET.bc.onmessage = e => { const x = e.data; if (x.to === NET.id) netRecv(x.m); };
    } else {
      await netLib();
      await new Promise((ok, no) => {
        const peer = new Peer(undefined, PEER_OPTS); NET.peer = peer;
        peer.on('error', e => { if (!NET.conn || !NET.conn.open) no(e); else netProblem(e); });
        peer.on('open', id => {
          Object.assign(NET, { on: true, code, id, hostId: NET_PREFIX + code });
          const c = peer.connect(NET.hostId, { reliable: true, serialization: 'json' }); NET.conn = c;
          c.on('open', ok); c.on('data', netRecv); c.on('close', () => netLost('The host closed the game'));
        });
      });
    }
    hello.f = NET.id; netRaw(NET.hostId, hello);
    // no answer: there's no game with that code (PeerJS says so itself; between tabs nobody would)
    setTimeout(() => { if (NET.on && !NET.host && !NET.peers.has(NET.hostId) && NET.code === code) netLost('No game with that code'); }, 4000);
  } catch (e) { netReset(); NET.status = e.type === 'peer-unavailable' ? 'No game with that code' : 'Could not join: ' + (e.message || e.type || e); lobbyRender(); }
}
export function netLeave() { if (NET.on) netSend('bye', {}); netReset(); NET.status = ''; lobbyRender(); }
function netProblem(e) { console.warn('net', e); if (e && e.type === 'peer-unavailable' && !NET.host) netLost('No game with that code'); }
// the host gone: back to the title, the run with them
function netLost(why) {
  const was = NET.inGame;
  netReset(); NET.status = why; lobbyRender();
  if (was && state !== 'title') { announce('Co-op', why, { eye: 'Disconnected', kind: 'red' }); setTimeout(() => { if (!NET.on && state !== 'title') leaveToMenu(); }, 2500); }
}
// a joiner gone: their survivor leaves the farm, and everyone's told
function netGone(id, why) {
  const p = NET.peers.get(id); if (!p) return;
  NET.peers.delete(id); NET.conns.delete(id); netDropAvatar(p);
  if (NET.host) { netOut({ t: 'roster', f: NET.id, list: netRoster(), view: NET.view }, null); setFlowDirty(true); }
  if (state !== 'title') feed('gear', 0, p.name + (why === 'left' ? ' left' : ' lost connection'));
  lobbyRender();
}
export const netRoster = () => [{ id: NET.id, name: netName(), look: LOOK.cur, idx: 0, fid: PALS.me }].concat([...NET.peers.values()].map(p => ({ id: p.id, name: p.name, look: p.look, idx: p.idx, fid: p.fid })));

// ---- the handshake: a joiner says hello, the host takes them in (or turns them away) and tells everyone who's in
NET_ON.hello = m => {
  if (!NET.host) return;
  const turn = why => { netRaw(m.f, { t: 'nope', f: NET.id, why }); if (NET.mode === 'local') return; const c = NET.conns.get(m.f); setTimeout(() => { try { c && c.close(); } catch (e) {} }, 300); NET.conns.delete(m.f); };
  if (m.v !== NET_V) return turn('Your game is a different version from the host’s');
  if (NET.inGame) return turn('That game has already started');
  if (NET.peers.size >= NET_MAX - 1) return turn('That game is full');
  const used = new Set([0, ...[...NET.peers.values()].map(p => p.idx)]); let idx = 1; while (used.has(idx)) idx++;
  NET.peers.set(m.f, { id: m.f, name: String(m.name || 'Survivor').slice(0, 16), look: m.look, idx, fid: m.fid, heard: performance.now() });
  netOut({ t: 'roster', f: NET.id, list: netRoster(), view: NET.view }, null);
  lobbyRender();
};
NET_ON.nope = m => netLost(m.why);
NET_ON.roster = m => {
  if (NET.host) return;
  const keep = new Set();
  for (const r of m.list) {
    if (r.id === NET.id) { NET.idx = r.idx; continue; }
    keep.add(r.id);
    const p = NET.peers.get(r.id);
    if (p) Object.assign(p, { name: r.name, idx: r.idx, fid: r.fid }); else NET.peers.set(r.id, { id: r.id, name: r.name, look: r.look, idx: r.idx, fid: r.fid, heard: performance.now() });
  }
  for (const id of [...NET.peers.keys()]) if (!keep.has(id)) netGone(id, 'left');
  if (m.view) NET.view = m.view;
  NET.status = ''; lobbyRender();
};
// the host's pick of the view everyone plays in: isometric or first person, from the lobby
export function netSetView(v) {
  if (!NET.host || NET.inGame || (v !== 'iso' && v !== 'fp')) return;
  NET.view = v; netSend('view', { view: v }); lobbyRender();
}
NET_ON.view = m => { if (NET.host || (m.view !== 'iso' && m.view !== 'fp')) return; NET.view = m.view; lobbyRender(); };
NET_ON.bye = m => { if (m.f === NET.hostId && !NET.host) netLost('The host closed the game'); else netGone(m.f, 'left'); };
NET_ON.name = m => { const p = NET.peers.get(m.f); if (p) { p.name = m.name; lobbyRender(); } };
NET_ON.beat = () => {};
// the host starts the run for everyone
export function netStart() {
  if (!NET.host || NET.inGame) return;
  NET.houseSeed = (Math.random() * 2147483647) | 0;   // everyone's farmhouse laid out alike (world/interior.js)
  netSend('start', { roster: netRoster(), house: NET.houseSeed, view: NET.view }); netBegin();
}
NET_ON.start = m => { if (NET.host) return; NET.houseSeed = m.house; if (m.view) NET.view = m.view; for (const r of m.roster) { const p = NET.peers.get(r.id); if (p) p.look = r.look; } netBegin(); };
function netBegin() { NET.inGame = true; if (VCAM.mode !== 'free') setViewMode(NET.view); lobbyRender(); enterRun(); }   // (everyone in the host's view: ui/settings.js keeps it for the run)
// every so often a word to say you're still there; anyone not heard from in NET_QUIET seconds is gone
export function netBeat(rdt) {
  if (!NET.on) return;
  NET.beatT -= rdt; if (NET.beatT > 0) return; NET.beatT = 1;
  if (!NET.inGame) netSend('beat', {});
  const now = performance.now();
  for (const p of [...NET.peers.values()]) {
    if (now - p.heard < NET_QUIET * 1000) continue;
    if (NET.host) netGone(p.id, 'lost'); else if (p.id === NET.hostId) netLost('Lost the connection to the host');
  }
}
addEventListener('pagehide', () => { if (NET.on) netSend('bye', {}); });
