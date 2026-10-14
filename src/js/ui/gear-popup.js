// Gear you get: a card that rises at the bottom middle of the screen whenever you buy or are given something that stays
// with you (an attachment, a mod, a gun upgrade, a tune-up, rounds, a medicine upgrade, a weapon off the radio),
// saying what it is, what it's on and what it does; and the list of all of it in the pause screen.

// what a gun's called in a sentence: plain, without its calibre ("your pistol", not "your 9mm pistol")
const gunCall = id => WEAP[id].name.replace(/^[.\d]+[a-z]*\s+/i, '').toLowerCase();
// how each kind of thing is marked, in the popup and the list
const GEAR_COL = { gear: '#d9a83e', ammo: '#d4b25c', med: '#d0432c', supply: '#d8692c' };
// o: { ic, kind (what sort of thing), name, gun (the weapon it's on) or whom (who it's for), text (what it does), fx (chips) }
function gotGear(o) {
  const on = o.gun ? 'On your ' + gunCall(o.gun) : o.whom ? 'For ' + o.whom : '';
  run.bought.push({ name: o.name, kind: o.kind, on, text: o.text, ic: o.ic || 'gear', wave: Math.max(1, run.wave) });
  gearQ.push(Object.assign({ on }, o)); if (!gearShowing) nextGear();
}
const gearQ = []; let gearShowing = false, gearT = 0;
const gearEl = (() => {
  const el = document.createElement('div'); el.id = 'gearPop'; el.className = 'hud'; el.hidden = true;
  el.innerHTML = `<span class="gpIc"><svg viewBox="${GI_VB}"></svg></span><span class="gpTx"><i class="gpEye"></i><b class="gpName"></b><em class="gpText"></em><span class="gpFx"></span></span><i class="gpBar"></i>`;
  document.body.appendChild(el); return el;
})();
// one at a time: each stays a few seconds (less while more are waiting), rolls up into place, and rolls back down out
// of sight before the next one comes up
function nextGear() {
  const o = gearQ.shift(); if (!o) { gearShowing = false; return; }
  gearShowing = true; const el = gearEl, hold = gearQ.length ? 2.6 : 4.6;
  el.style.setProperty('--gc', GEAR_COL[o.ic] || GEAR_COL.gear); el.style.setProperty('--hold', hold + 's');
  el.querySelector('svg').innerHTML = GI[o.ic] || GI.gear;
  el.querySelector('.gpEye').textContent = o.kind + (o.on ? ' · ' + o.on : '');
  el.querySelector('.gpName').textContent = o.name; el.querySelector('.gpText').textContent = o.text || '';
  el.querySelector('.gpFx').innerHTML = (o.fx || []).filter(Boolean).slice(0, 4).map(f => `<i class="${f.good ? 'up' : 'down'}">${f.good ? '▲' : '▼'} ${f.t}</i>`).join('');
  el.hidden = false; el.classList.remove('out', 'in'); void el.offsetWidth; el.classList.add('in');
  SFX.pick && SFX.pick();
  clearTimeout(gearT); gearT = setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); gearT = setTimeout(() => { el.hidden = true; el.classList.remove('out'); nextGear(); }, 260); }, hold * 1000);
}
function clearGear() { gearQ.length = 0; clearTimeout(gearT); gearShowing = false; gearEl.hidden = true; gearEl.classList.remove('in', 'out'); }
// the pause screen's list of what you've bought or been given, newest first
function renderBought(list, countEl) {
  const el = $(list); el.innerHTML = ''; $(countEl).textContent = run.bought.length;
  if (!run.bought.length) { el.innerHTML = '<div class="none">Nothing yet. Buy attachments, mods and upgrades at the workbench.</div>'; return; }
  run.bought.slice().reverse().forEach(h => {
    const r = document.createElement('div'); r.className = 'hrow gear'; r.style.setProperty('--rc', GEAR_COL[h.ic] || GEAR_COL.gear); r.style.setProperty('--rc2', GEAR_COL[h.ic] || GEAR_COL.gear);
    r.innerHTML = '<span class="hn"></span><span class="ht"></span><span class="hw"></span><span class="hd"></span>';
    r.querySelector('.hn').textContent = h.name; r.querySelector('.ht').textContent = h.kind + (h.on ? ' · ' + h.on : '');
    r.querySelector('.hw').textContent = 'Wave ' + h.wave; r.querySelector('.hd').textContent = h.text || '';
    el.appendChild(r);
  });
}
