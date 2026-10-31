// Co-op chat: what the players say to each other, in the lobby and in the run, with the lobby's own goings-on (who
// joined, who left, the view the host picked) as quieter lines among them. In the lobby it's the log on the co-op screen
// with a box under it (net/lobby.js); in the run, the last few lines sit over your health and fade a while after
// they're said, and Enter opens a box to say something (Enter again sends it, Esc puts it away).
// Everything goes through the host like any other message (net/net.js): theirs to everyone, a joiner's handed on.

import { $ } from '../core/dom.js';
import { NET, NET_COL, NET_ON, netLink, netName, netSend } from './net.js';
import { SFX } from '../audio/sfx.js';

// how many lines are kept, how long one stays up in the run before it fades (s), how many show there at once, the
// longest line, and the shortest wait between two of yours (s)
const CHAT = { keep: 60, show: 9, runN: 6, max: 120, gap: 0.6 };
const lines = [];   // { who, idx, text, sys, t }
let lastSaid = 0;
export function chatClear() { lines.length = 0; chatRender(); }
// a line from the lobby itself (someone joined, left, the view changed)
export function chatSys(text) { lines.push({ text, sys: true, t: performance.now() }); trim(); chatRender(); }
const trim = () => { while (lines.length > CHAT.keep) lines.shift(); };
// say something: on everyone's screen, yours included
function chatSay(text) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT.max);
  if (!text || !NET.on) return false;
  const now = performance.now(); if (now - lastSaid < CHAT.gap * 1000) return false; lastSaid = now;
  netSend('chat', { s: text });
  lines.push({ who: netName(), idx: NET.idx, text, t: now }); trim(); chatRender();
  return true;
}
NET_ON.chat = m => {
  const p = NET.peers.get(m.f); if (!p || typeof m.s !== 'string') return;
  lines.push({ who: p.name, idx: p.idx, text: m.s.slice(0, CHAT.max), t: performance.now() }); trim();
  SFX.click(); chatRender();
};

// ---- drawn: a line is its speaker's name in their colour and what they said; the lobby's own lines in grey italics
function lineEl(l) {
  const li = document.createElement('li');
  if (l.sys) { li.className = 'sys'; li.textContent = l.text; return li; }
  li.style.setProperty('--pc', NET_COL[l.idx] || '#888');
  const b = document.createElement('b'); b.textContent = l.who; li.append(b, document.createTextNode(l.text));
  return li;
}
let drawn = -1;
export function chatRender() {
  const key = lines.length ? lines.length + ':' + lines[lines.length - 1].t : 0;
  if (key === drawn) return; drawn = key;
  const log = $('coopChat');
  if (log) {
    log.textContent = ''; lines.forEach(l => log.appendChild(lineEl(l)));
    if (!lines.length) { const li = document.createElement('li'); li.className = 'sys'; li.textContent = 'Nothing said yet.'; log.appendChild(li); }
    log.scrollTop = log.scrollHeight;
  }
  runRender(true);
}
// in the run: the last few things said (not the lobby's own lines), each fading out CHAT.show seconds after it came;
// all of them while the box is open
function runRender(force) {
  const el = $('chatLog'); if (!el) return;
  const now = performance.now(), open = !$('chatBox').hidden, said = lines.filter(l => !l.sys).slice(-CHAT.runN);
  const shown = netLink() ? said.filter(l => open || now - l.t < CHAT.show * 1000) : [];
  const key = shown.map(l => l.t).join() + (open ? 'o' : '');
  if (!force && el.dataset.key === key) return; el.dataset.key = key;
  el.textContent = ''; shown.forEach(l => { const li = lineEl(l); li.style.setProperty('--age', open ? 0 : Math.max(0, (now - l.t) / 1000 - CHAT.show + 1.5)); el.appendChild(li); });
}
export function chatTick() { runRender(false); }
// the box in the run: Enter opens it (input/keyboard-mouse.js), Enter sends, Esc or an empty Enter closes it
export function chatStart() {
  if (!netLink()) return;
  $('chatBox').hidden = false; const i = $('chatIn'); i.value = ''; i.focus({ preventScroll: true }); runRender(true);
}
function chatStop() { $('chatBox').hidden = true; $('chatIn').blur(); runRender(true); }
$('chatIn').addEventListener('keydown', e => {
  e.stopPropagation();   // (nothing typed here reaches the game: no walking, no reloading on R)
  if (e.key === 'Enter') { e.preventDefault(); chatSay(e.target.value); chatStop(); }
  else if (e.key === 'Escape') { e.preventDefault(); chatStop(); }
});
$('chatIn').addEventListener('keyup', e => e.stopPropagation());
$('chatIn').addEventListener('blur', () => { if (!$('chatBox').hidden) chatStop(); });
// the lobby's box
$('coopSay').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); if (chatSay(e.target.value)) e.target.value = ''; }
  else if (e.key === 'Escape') e.target.blur();
});
