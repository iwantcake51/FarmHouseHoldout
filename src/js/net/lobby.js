// The co-op lobby on the title screen: your name, hosting a game or joining one by its code, who's in, and the host's
// start button. And the team list in the run: everyone else, with their health.

function lobbyRender() {
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
    const tag = document.createElement('em'); tag.textContent = (p.id === NET.hostId ? 'Host' : '') + (p.id === NET.id ? (p.id === NET.hostId ? ' · You' : 'You') : ''); li.appendChild(tag);
    ol.appendChild(li);
  }
  for (let k = list.length; k < NET_MAX; k++) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Open'; ol.appendChild(li); }
}
function toggleCoop(open) {
  const el = $('coop'), show = open ?? el.hidden;
  el.hidden = !show; $('coopBtn').setAttribute('aria-expanded', String(show));
  if (show) { $('coopName').value = NET.name; lobbyRender(); }
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

// ---- in the run: the team list under the clock
function renderTeam() {
  const el = $('team'), on = netLink() && state !== 'title';
  if (el.hidden === on) el.hidden = !on;
  if (!on) return;
  const ps = [...NET.peers.values()].sort((a, b) => a.idx - b.idx);
  const key = ps.map(p => p.id + ':' + Math.round((p.hp ?? 100) / (p.maxHp || 100) * 40) + (p.dead ? 'd' : '')).join('|');
  if (cache.team === key) return; cache.team = key;
  if (el.childElementCount !== ps.length || [...el.children].some((c, k) => c.dataset.id !== ps[k].id)) {
    el.textContent = '';
    for (const p of ps) { const d = document.createElement('div'); d.className = 'tm'; d.dataset.id = p.id; d.style.setProperty('--pc', NET_COL[p.idx] || '#888'); d.innerHTML = '<i></i><b></b><s><u></u></s>'; d.querySelector('b').textContent = p.name; el.appendChild(d); }
  }
  ps.forEach((p, k) => { const d = el.children[k]; d.classList.toggle('down', !!p.dead); d.querySelector('u').style.transform = `scaleX(${clamp((p.hp ?? 100) / (p.maxHp || 100), 0, 1).toFixed(3)})`; });
}
