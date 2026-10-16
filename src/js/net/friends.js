// Friends: the people you play with, kept in this browser by their friend codes. While the game is open you can be
// reached at yours (a second, always-on PeerJS peer, separate from a game's), so your friends see whether you're
// around, hosting or in a run, can join the lobby you're hosting in one click, and you can invite them into yours.
// Someone who adds you is added back. Between tabs (?net=local) the same goes over a BroadcastChannel.

const FR_PREFIX = 'fhh-pal-', FR_QUIET = 16, FR_RETRY = 20;   // (seconds before a silent friend shows as away; between tries at reaching one)
const PALS = { me: '', list: [], st: new Map(), up: false, peer: null, bc: null, t: 0, said: '', msg: '', open: false };
try { PALS.me = localStorage.getItem('fhh-me') || ''; PALS.list = JSON.parse(localStorage.getItem('fhh-friends') || '[]').filter(f => f && f.c); } catch (e) {}
if (!/^[A-Z0-9]{6}$/.test(PALS.me)) { PALS.me = (netCode() + netCode()).slice(0, 6); try { localStorage.setItem('fhh-me', PALS.me); } catch (e) {} }
const frSave = () => { try { localStorage.setItem('fhh-friends', JSON.stringify(PALS.list)); } catch (e) {} };
const frOf = c => PALS.list.find(f => f.c === c);
// what each friend is up to, as they last said: { name, st ('menu' | 'lobby' | 'game'), game (a code to join, if they
// host a lobby with room), heard, conn, tried, inv (a game code they invited you to) }
const frState = c => PALS.st.get(c) || (PALS.st.set(c, { heard: 0, tried: 0 }), PALS.st.get(c));
const frOnline = c => { const s = PALS.st.get(c); return !!s && performance.now() - s.heard < FR_QUIET * 1000; };

// what you're doing, for them
function frHello(q) {
  const st = NET.inGame ? 'game' : NET.on ? 'lobby' : 'menu', room = NET.host && !NET.inGame ? NET_MAX - 1 - NET.peers.size : 0;
  return { t: 'hi', v: NET_V, name: netName(), st, game: room > 0 ? NET.code : '', room, q: q ? 1 : 0 };
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
    Object.assign(s, { name: String(m.name || 'Survivor').slice(0, 16), st: m.st, game: m.v === NET_V ? m.game || '' : '', room: m.room || 0 });
    let f = frOf(c);
    if (!f) { f = { c, n: s.name }; PALS.list.push(f); frSave(); PALS.msg = s.name + ' added you as a friend'; }   // they added you: added back
    else if (f.n !== s.name) { f.n = s.name; frSave(); }
    if (s.inv && s.game !== s.inv) s.inv = '';   // an invite to a game they're no longer hosting is gone
    if (m.q) frSend(c, frHello(false));
  } else if (m.t === 'inv') { s.inv = m.game; s.name = m.name || s.name; PALS.msg = (s.name || 'A friend') + ' invited you to their game'; SFX.pick && SFX.pick(); }
  else if (m.t === 'bye') s.heard = 0;
  frRender();
}

// ---- reachable at your code
async function friendsUp() {
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
function frTick(rdt) {
  if (!PALS.up) return;
  PALS.t -= rdt; if (PALS.t > 0) return; PALS.t = 5;
  frBeat(false); frRender();
}
// whenever what you're doing changes (hosting, joining, starting, leaving), your friends hear about it straight away
function frAnnounce() {
  if (!PALS.up) return;
  const h = frHello(false), key = h.st + h.game + h.room + h.name; if (key === PALS.said) return; PALS.said = key;
  for (const f of PALS.list) if (frOnline(f.c)) frSend(f.c, h);
}
addEventListener('pagehide', () => { for (const f of PALS.list) frSend(f.c, { t: 'bye' }); });

// ---- the list
function frAdd(code, name) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) { PALS.msg = 'A friend code is six letters and numbers'; frRender(); return false; }
  if (code === PALS.me) { PALS.msg = 'That’s your own code'; frRender(); return false; }
  if (!frOf(code)) { PALS.list.push({ c: code, n: name || '' }); frSave(); }
  PALS.msg = ''; friendsUp(); frState(code).tried = 0; frBeat(true); frRender(); lobbyRender();
  return true;
}
function frRemove(code) { PALS.list = PALS.list.filter(f => f.c !== code); frSave(); frRender(); lobbyRender(); }
function frInvite(code) { if (!NET.host || NET.inGame) return; frSend(code, { t: 'inv', game: NET.code, name: netName() }); frState(code).sent = performance.now(); frRender(); }
function frJoin(code) { const s = PALS.st.get(code), g = s && (s.inv || s.game); if (!g || NET.inGame) return; s.inv = ''; netJoin(g); }
function frRender() {
  if ($('coop').hidden) return;
  $('frMe').textContent = PALS.me;
  $('frMsg').textContent = PALS.msg;
  const ul = $('frList'), now = performance.now();
  const rows = PALS.list.map(f => {
    const s = PALS.st.get(f.c) || {}, on = frOnline(f.c), name = s.name || f.n || 'Friend';
    const what = !on ? 'Away' : s.inv ? 'Invited you' : s.st === 'game' ? 'In a run' : s.game ? `Hosting · ${NET_MAX - s.room}/${NET_MAX}` : s.st === 'lobby' ? 'In a lobby' : 'Online';
    const join = on && !NET.inGame && (s.inv || s.game) && NET.code !== (s.inv || s.game), invite = on && NET.host && !NET.inGame && s.st === 'menu' && NET.peers.size < NET_MAX - 1;
    return { f, on, name, what, join, invite: invite && !(s.sent && now - s.sent < 8000), sent: invite && s.sent && now - s.sent < 8000, game: on && s.st === 'game' };
  }).sort((a, b) => b.on - a.on || a.name.localeCompare(b.name));
  const key = JSON.stringify(rows.map(r => [r.f.c, r.on, r.name, r.what, r.join, r.invite, r.sent]));
  if (ul.dataset.key === key) return; ul.dataset.key = key;
  ul.textContent = '';
  if (!rows.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No friends yet. Swap codes with someone you play with.'; ul.appendChild(li); }
  for (const r of rows) {
    const li = document.createElement('li'); li.className = r.on ? (r.game ? 'busy' : 'on') : 'off';
    li.innerHTML = '<i></i><b></b><small></small><em></em><span class="frBtns"></span>';
    li.querySelector('b').textContent = r.name; li.querySelector('small').textContent = r.f.c; li.querySelector('em').textContent = r.what;
    const btns = li.querySelector('.frBtns'), btn = (t, cls, fn, label) => { const x = document.createElement('button'); x.type = 'button'; x.className = cls; x.textContent = t; if (label) x.setAttribute('aria-label', label); x.onclick = fn; btns.appendChild(x); };
    if (r.join) btn('Join', 'coopCopy go', () => frJoin(r.f.c));
    if (r.invite) btn('Invite', 'coopCopy', () => frInvite(r.f.c));
    if (r.sent) btn('Invited', 'coopCopy', () => {});
    btn('×', 'frDel', () => frRemove(r.f.c), 'Remove ' + r.name);
    ul.appendChild(li);
  }
}
$('frCopy').onclick = () => { try { navigator.clipboard.writeText(PALS.me); $('frCopy').textContent = 'Copied'; setTimeout(() => { $('frCopy').textContent = 'Copy'; }, 1400); } catch (e) {} };
$('frAddBtn').onclick = () => { if (frAdd($('frCode').value)) $('frCode').value = ''; };
$('frCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && frAdd($('frCode').value)) $('frCode').value = ''; });
// with friends already on the list, you're reachable as soon as the game's open, so they see you're around
if (PALS.list.length) setTimeout(friendsUp, 1500);
