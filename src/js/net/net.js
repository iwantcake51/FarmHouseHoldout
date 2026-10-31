// Online co-op: the connection between up to four players' games. One hosts: their game runs the farm itself (the
// zombies, the waves, the boards) and passes it on (net/sync.js); the others join with the host's four-letter code and
// each runs their own survivor, telling the rest what they do. Everything goes through the host, which hands each
// message on to the others: no two joiners talk to each other directly.
// Two ways to connect: WebRTC through PeerJS (vendor/peerjs.min.js, loaded the first time it's wanted; its public
// server only introduces the players to each other, the game itself runs player to player), or, with ?net=local in the
// address, a BroadcastChannel between tabs of one browser, for trying it out on one machine.

import { dealLook, LOOK } from '../player/look.js';
import { setFlowDirty } from '../barricades/planks.js';
import { state } from '../game/state.js';
import { enterRun, leaveToMenu } from '../ui/screens.js';
import { announce, feed } from '../ui/hud-text.js';
import { SFX } from '../audio/sfx.js';
import { netDropAvatar } from './avatars.js';
import { lobbyRender, toggleCoop } from './lobby.js';
import { PALS } from './friends.js';
import { SET } from '../ui/settings.js';
import { setViewMode, VCAM } from '../game/view-cam.js';
import { chatClear, chatSys } from './chat.js';
import { frMet } from './friends.js';
import { PVP_MODES, pvpTeams } from '../pvp/pvp.js';
import { botName } from '../pvp/bots.js';

export const NET_V = 3, NET_PREFIX = 'fhh-coop-', NET_QUIET = 15;   // (NET_V: 3 since the arena and its bots, which a game before them doesn't know; NET_QUIET: seconds without a word before a player counts as gone; a slow machine can stall that long building its shaders)
export const NET = { on: false, host: false, mode: /[?&]net=local/.test(location.search) ? 'local' : 'peer', id: '', hostId: '', code: '', name: '', inGame: false, status: '', idx: 0,
  runMode: 'normal',   // everyone's run mode, the host's pick in the lobby (normal or no perks: netSetMode)
  view: 'iso',   // everyone's view in the run, the host's pick in the lobby (isometric or first person: netSetView)
  game: 'survival', arena: 'ffa', teams: null,   // the game everyone plays (the farm, or the arena: pvp/pvp.js), the arena's mode, and its sides (the host's, at the start)
  peers: new Map(),   // everyone else in the game, by id: { id, name, look, idx, heard, ... } (net/avatars.js adds their avatar)
  ready: false,   // a joiner's own word that they're set to go (the host's Start waits for everyone's: netAllReady)
  solo: false,   // the arena played on your own against bots: a lobby nobody can join, nothing sent anywhere
  botSkill: 1,   // how good the arena's bots are (pvp/bots.js: BOT_SKILLS), the host's pick in the lobby
  peer: null, conns: new Map(), conn: null, bc: null, beatT: 0 };
// this build of the game (the hash on game.js the page loaded, tools/build.mjs): a game a build behind or ahead of the
// host's (a page not refreshed since an update) is turned away, as the two would play different games
const NET_BUILD = (() => { try { const s = [...document.scripts].find(x => /game\.js/.test(x.src)); return (s && (/[?&]v=([^&]+)/.exec(s.src) || [])[1]) || ''; } catch (e) { return ''; } })();
// how many can play: four on the farm, six in the arena (pvp/pvp.js)
export const netMax = () => NET.game === 'arena' ? 6 : 4;
export const NET_ON = {};   // what to do with each kind of message: NET_ON.hit = m => ...
// and what the host does with one sent to a bot (pvp/bots.js: a hit on it, someone asking for its loadout): a bot's
// only in the host's game, so a message for it stops there
export const NET_BOT = {};
// each player's colour, by their place in the game (the host first): their name, their marker and their nameplate
export const NET_COL = ['#e0a050', '#5fb4e8', '#7ad07a', '#d87ad0', '#66d1c1', '#e8d35a'];
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
// the host's, for one of its bots (pvp/bots.js): sent as from the bot, to everyone or to one player
export function netAs(id, t, d, only) { if (!NET.on || !NET.host) return; const m = Object.assign({ t, f: id }, d); if (only) netRaw(only, m); else netOut(m, null); }
// the host's own: to every joiner but `skip` (never to a bot: there's nobody there)
function netOut(m, skip) { for (const [id, p] of NET.peers) if (id !== skip && !p.bot) netRaw(id, m); }
function netRaw(id, m) {
  if (NET.solo) return;
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
    if (m.to && m.to !== NET.id) { const b = NET.peers.get(m.to); if (b && b.bot) { const fb = NET_BOT[m.t]; if (fb) { try { fb(m); } catch (e) { console.error('net bot ' + m.t, e); } } } else netRaw(m.to, m); return; }
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
  Object.assign(NET, { on: false, host: false, solo: false, id: '', hostId: '', code: '', inGame: false, idx: 0, ready: false, peer: null, conn: null, bc: null });
  NET.conns.clear(); NET.peers.clear(); chatClear();
  if (VCAM.mode !== 'free') setViewMode(SET.view);   // (out of the game: your own view again, the one in the settings)
}
// (solo: the arena against bots, a lobby of your own with nothing to connect to, a couple of bots sat in it already)
export async function netHost(solo) {
  netReset(); NET.status = solo ? '' : 'Opening a game…'; lobbyRender();
  const code = netCode();
  if (solo) {
    Object.assign(NET, { on: true, host: true, solo: true, code: 'SOLO', id: 'H-SOLO', hostId: 'H-SOLO', idx: 0, view: SET.view, runMode: SET.mode, game: 'arena' });
    for (let k = 0; k < 3; k++) netBotAdd(true);
    chatSys('Solo arena: you and the bots. Add or remove them, pick the mode, and start.'); lobbyRender(); return;
  }
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
    NET.idx = 0; NET.view = SET.view; NET.runMode = SET.mode; NET.status = ''; chatSys('Lobby open. Send your friends the code ' + code + '.'); lobbyRender();   // (the host's own view to start with: they can change it in the lobby)
  } catch (e) { netReset(); NET.status = 'Could not open a game: ' + (e.message || e.type || e); lobbyRender(); }
}
export async function netJoin(code) {
  code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) { NET.status = 'The code is four letters and numbers'; lobbyRender(); return; }
  netReset(); NET.status = 'Joining ' + code + '…'; lobbyRender();
  const hello = { t: 'hello', v: NET_V, b: NET_BUILD, name: netName(), look: LOOK.cur, fid: PALS.me };
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
  if (NET.host) { rosterOut(); setFlowDirty(true); }
  const what = why === 'left' ? ' left' : why === 'kicked' ? ' was removed from the lobby' : ' lost connection';
  if (state !== 'title') feed('gear', 0, p.name + what); chatSys(p.name + what);
  lobbyRender();
}
// the host's: send someone out of the lobby (before the run: in it they'd take their survivor with them as if they'd left)
export function netKick(id) {
  if (!NET.host || NET.inGame || !NET.peers.has(id)) return;
  netRaw(id, { t: 'kick', f: NET.id });
  const c = NET.conns.get(id); setTimeout(() => { try { c && c.close(); } catch (e) {} }, 300);
  netGone(id, 'kicked');
}
NET_ON.kick = m => { if (!NET.host && m.f === NET.hostId) netLost('The host removed you from the lobby'); };
export const netRoster = () => [{ id: NET.id, name: netName(), look: LOOK.cur, idx: 0, fid: PALS.me, ready: true }].concat([...NET.peers.values()].map(p => ({ id: p.id, name: p.name, look: p.look, idx: p.idx, fid: p.fid, ready: !!p.ready, bot: p.bot ? 1 : 0 })));
// everyone in the lobby set to go (the host always is): the run starts only then
export const netAllReady = () => [...NET.peers.values()].every(p => p.ready);
const rosterOut = () => { netOut({ t: 'roster', f: NET.id, list: netRoster(), view: NET.view, rm: NET.runMode, gm: NET.game, am: NET.arena, bs: NET.botSkill }, null); frMet(netRoster()); };
// ---- the arena's bots (pvp/bots.js), sat in the lobby by the host: each takes a seat as a player would (and gives it
// up to someone joining), always ready, in a look of its own
export function netBotAdd(quiet) {
  if (!NET.host || NET.inGame || NET.game !== 'arena' || NET.peers.size >= netMax() - 1) return;
  const used = new Set([0, ...[...NET.peers.values()].map(p => p.idx)]); let idx = 1; while (used.has(idx)) idx++;
  const id = 'B-' + Math.random().toString(36).slice(2, 8), name = botName(new Set([...NET.peers.values()].map(p => p.name)));
  NET.peers.set(id, { id, name, look: dealLook(), idx, bot: true, ready: true, heard: performance.now() });
  rosterOut(); if (!quiet) { chatSys(name + ' (bot) sat down'); SFX.click(); } lobbyRender();
}
export function netBotDrop(id, quiet) {
  const p = NET.peers.get(id); if (!NET.host || NET.inGame || !p || !p.bot) return;
  NET.peers.delete(id); netDropAvatar(p); rosterOut(); if (!quiet) chatSys(p.name + ' (bot) left'); lobbyRender();
}
export function netSetBotSkill(v) { if (!NET.host || NET.inGame || !(v >= 0 && v <= 2)) return; NET.botSkill = v; rosterOut(); lobbyRender(); }

// ---- the handshake: a joiner says hello, the host takes them in (or turns them away) and tells everyone who's in
NET_ON.hello = m => {
  if (!NET.host) return;
  const turn = why => { netRaw(m.f, { t: 'nope', f: NET.id, why }); if (NET.mode === 'local') return; const c = NET.conns.get(m.f); setTimeout(() => { try { c && c.close(); } catch (e) {} }, 300); NET.conns.delete(m.f); };
  if (m.v !== NET_V || (m.b || '') !== NET_BUILD) return turn('Your game is a different version from the host’s: refresh the page (both of you) and try again');
  if (NET.inGame) return turn('That game has already started');
  if (NET.peers.size >= netMax() - 1) { const bot = [...NET.peers.values()].reverse().find(p => p.bot); if (bot) netBotDrop(bot.id, true); else return turn('That game is full'); }   // (a bot gives up its seat to a person)
  const used = new Set([0, ...[...NET.peers.values()].map(p => p.idx)]); let idx = 1; while (used.has(idx)) idx++;
  const name = String(m.name || 'Survivor').slice(0, 16);
  NET.peers.set(m.f, { id: m.f, name, look: m.look, idx, fid: m.fid, ready: false, heard: performance.now() });
  rosterOut(); chatSys(name + ' joined'); SFX.pick();
  lobbyRender();
};
NET_ON.nope = m => netLost(m.why);
NET_ON.roster = m => {
  if (NET.host) return;
  const keep = new Set(), first = NET.peers.size === 0;
  for (const r of m.list) {
    if (r.id === NET.id) { NET.idx = r.idx; NET.ready = !!r.ready; continue; }
    keep.add(r.id);
    const p = NET.peers.get(r.id);
    if (p) Object.assign(p, { name: r.name, idx: r.idx, fid: r.fid, ready: !!r.ready, bot: !!r.bot }, r.look ? { look: r.look } : {});
    else { NET.peers.set(r.id, { id: r.id, name: r.name, look: r.look, idx: r.idx, fid: r.fid, ready: !!r.ready, bot: !!r.bot, heard: performance.now() }); if (!first) chatSys(r.name + ' joined'); else if (r.id === NET.hostId) chatSys('You joined ' + r.name + '’s lobby'); }
  }
  for (const id of [...NET.peers.keys()]) if (!keep.has(id)) netGone(id, 'left');
  if (m.view) NET.view = m.view;
  if (RUN_MODES.includes(m.rm)) NET.runMode = m.rm;
  if (GAMES.includes(m.gm)) NET.game = m.gm; if (PVP_MODES[m.am]) NET.arena = m.am; if (m.bs >= 0) NET.botSkill = m.bs;
  NET.status = ''; frMet(m.list); lobbyRender();
};
// a joiner set to go, or not after all: the host keeps everyone's word and passes it round
export function netReady(r) { if (!NET.on || NET.host || NET.inGame) return; NET.ready = !!r; netSend('ready', { r: NET.ready }); lobbyRender(); }
NET_ON.ready = m => { if (!NET.host) return; const p = NET.peers.get(m.f); if (!p || NET.inGame) return; p.ready = !!m.r; if (netAllReady()) NET.status = ''; rosterOut(); if (p.ready) SFX.click(); lobbyRender(); };
// the host's pick of the view everyone plays in: isometric or first person, from the lobby
export function netSetView(v) {
  if (!NET.host || NET.inGame || (v !== 'iso' && v !== 'fp')) return;
  NET.view = v; netSend('view', { view: v }); chatSys('View set to ' + (v === 'fp' ? 'first person' : 'isometric')); lobbyRender();
}
// and the run's mode everyone plays (normal or no perks: ui/settings.js), the same way
const RUN_MODES = ['normal', 'noperks'], modeName = v => v === 'noperks' ? 'no perks' : 'normal';
export function netSetMode(v) {
  if (!NET.host || NET.inGame || !RUN_MODES.includes(v)) return;
  NET.runMode = v; netSend('rmode', { rm: v }); chatSys('Mode set to ' + modeName(v)); lobbyRender();
}
// and the game: the farm (survival) or the arena, and the arena's mode (pvp/pvp.js: PVP_MODES)
const GAMES = ['survival', 'arena'];
export function netSetGame(g, a) {
  if (!NET.host || NET.inGame) return;
  if (NET.solo && g === 'survival') return;   // (solo, it's the arena: a run on your own is the title's Start)
  if (g === 'survival' && [...NET.peers.values()].filter(p => !p.bot).length > 3) { NET.status = 'Survival takes four at most'; SFX.deny(); lobbyRender(); return; }   // (the arena takes six)
  if (GAMES.includes(g)) NET.game = g; if (PVP_MODES[a]) NET.arena = a;
  if (NET.game !== 'arena') for (const p of [...NET.peers.values()]) if (p.bot) netBotDrop(p.id, true);   // (no bots on the farm)
  netSend('gm', { gm: NET.game, am: NET.arena }); chatSys(NET.game === 'arena' ? 'Game set to the arena: ' + PVP_MODES[NET.arena] : 'Game set to survival'); lobbyRender();
}
NET_ON.gm = m => { if (NET.host) return; if (GAMES.includes(m.gm)) NET.game = m.gm; if (PVP_MODES[m.am]) NET.arena = m.am; chatSys(NET.game === 'arena' ? 'The host set the game to the arena: ' + PVP_MODES[NET.arena] : 'The host set the game to survival'); lobbyRender(); };
NET_ON.rmode = m => { if (NET.host || !RUN_MODES.includes(m.rm)) return; if (NET.runMode !== m.rm) chatSys('The host set the mode to ' + modeName(m.rm)); NET.runMode = m.rm; lobbyRender(); };
NET_ON.view = m => { if (NET.host || (m.view !== 'iso' && m.view !== 'fp')) return; if (NET.view !== m.view) chatSys('The host set the view to ' + (m.view === 'fp' ? 'first person' : 'isometric')); NET.view = m.view; lobbyRender(); };
NET_ON.bye = m => { if (m.f === NET.hostId && !NET.host) netLost('The host closed the game'); else netGone(m.f, 'left'); };
NET_ON.name = m => { const p = NET.peers.get(m.f); if (p) { p.name = String(m.name || 'Survivor').slice(0, 16); lobbyRender(); } };
// a joiner who's changed how they look in the Character menu while waiting: their seat's picture with it
NET_ON.look = m => { const p = NET.peers.get(m.f); if (p && m.look && typeof m.look === 'object') { p.look = m.look; lobbyRender(); } };
NET_ON.beat = () => {};
// the host starts the run for everyone
export function netStart() {
  if (!NET.host || NET.inGame) return false;
  if (!netAllReady()) { const w = [...NET.peers.values()].filter(p => !p.ready).map(p => p.name); NET.status = 'Waiting for ' + w.join(' and ') + ' to get ready'; SFX.deny(); lobbyRender(); return false; }
  NET.houseSeed = (Math.random() * 2147483647) | 0;   // everyone's farmhouse laid out alike (world/interior.js)
  NET.teams = NET.game === 'arena' ? pvpTeams(netRoster(), NET.arena) : null;   // (the arena's sides, everyone's the same)
  netSend('start', { roster: netRoster(), house: NET.houseSeed, view: NET.view, rm: NET.runMode, gm: NET.game, am: NET.arena, tm: NET.teams }); netBegin();
  return true;
}
NET_ON.start = m => { if (NET.host) return; NET.houseSeed = m.house; NET.game = GAMES.includes(m.gm) ? m.gm : 'survival'; NET.arena = PVP_MODES[m.am] ? m.am : 'ffa'; NET.teams = m.tm || null; if (m.view) NET.view = m.view; if (RUN_MODES.includes(m.rm)) NET.runMode = m.rm; for (const r of m.roster) { const p = NET.peers.get(r.id); if (p) p.look = r.look; } netBegin(); };
function netBegin() { NET.inGame = true; NET.status = ''; if (VCAM.mode !== 'free') setViewMode(NET.view); lobbyRender(); toggleCoop(false); enterRun(); }   // (the co-op screen put away as the run comes up)   // (everyone in the host's view: ui/settings.js keeps it for the run)
// every so often a word to say you're still there; anyone not heard from in NET_QUIET seconds is gone
export function netBeat(rdt) {
  if (!NET.on) return;
  NET.beatT -= rdt; if (NET.beatT > 0) return; NET.beatT = 1;
  if (!NET.inGame) netSend('beat', {});
  const now = performance.now();
  for (const p of [...NET.peers.values()]) {
    if (p.bot || now - p.heard < NET_QUIET * 1000) continue;
    if (NET.host) netGone(p.id, 'lost'); else if (p.id === NET.hostId) netLost('Lost the connection to the host');
  }
}
addEventListener('pagehide', () => { if (NET.on) netSend('bye', {}); });
