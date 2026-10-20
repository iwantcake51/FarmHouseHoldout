// The loadout panel: docked against the workbench's right side (as the stats sheet is on its left), it lists what
// you've bought for the gun in your hands and lets you change what's on it for nothing: load any kind of round you own
// for it (weapons/rounds.js), go back to a lighter powder, take an attachment off or put back one you had before.
// Nothing you've bought is lost by it (W8.own, ownTier and fitTier, W8.ownAtt and setAtt in game/run-state.js); buying
// the next step at the bench still fits that one. It comes out from behind the bench as that unrolls, or pops out when your first purchase for
// the gun gives it something to show, and a marker slides to whatever you pick (styles/loadout.css).

let wlKey = '', wlSel = '', wlCloseT = 0, wlOpenT = 0, wlOpts = [], wlGrps = [];
const WL_LINE = { supp: 'Muzzle', choke: 'Muzzle', sight: 'Sight', laser: 'Laser', light: 'Light', loader: 'Loader' };
const pctPlus = m => '+' + Math.round((m - 1) * 100) + '%';
// every choice for the gun in your hands, a group a line: [{ g: group, label, opts: [{ k, n, att, name, sub }] }]
function wlGroups(id) {
  const D = id && WEAP[id]; if (!D || D.melee) return [];
  const out = [], line = (k, n) => tierName(k, n - 1, id);
  const rk = roundTypes(id).filter(k => roundOwned(id, k));
  if (rk.length > 1) out.push({ g: 'rounds', label: 'Rounds', opts: rk.map(k => ({ rk: k, n: 1, name: roundName(id, k) })) });
  const a = ownTier(id, 'ammo');
  if (a) out.push({ g: 'ammo', label: 'Powder', opts: Array.from({ length: a + 1 }, (_, n) => ({ k: 'ammo', n,
    name: n ? line('ammo', n) : 'Factory loads', sub: n ? pctPlus(AMMO_DMG[n]) + ' damage' + (n >= 3 ? ' · headshots +' + HEAD_UP.ammo + '×' : '') : 'As the gun comes' })) });
  // a shotgun's can and choke share the muzzle: one group, so picking one takes the other off
  // (and the muzzle devices from mods, weapons/gun-mods.js)
  const mods = (W8.mods[id] || []).concat(modsOff(id)).filter(m => MODS[m] && MODS[m].w === id && !modReplaced(m));
  const mz = ['supp', 'choke'].flatMap(k => Array.from({ length: ownTier(id, k) }, (_, i) => ({ k, n: i + 1, name: line(k, i + 1) })))
    .concat(mods.filter(m => MODS[m].muzzle).map(m => ({ mod: m, n: 1, name: modName(m) })));
  if (mz.length) out.push({ g: 'muzzle', label: 'Muzzle', opts: [{ k: 'muzzle', n: 0, name: 'Bare muzzle' }, ...mz] });
  // the magazine: any size you've bought for it, or the one it came with (swapping empties it into your reserve: wlPick)
  { const n = ownTier(id, 'mag'); if (n) { const cap = t => Math.max(1, Math.round(WEAP[id].mag * (MAG_UP[id] || MAG_UP.all)[t] * S.magMul));
    out.push({ g: 'mag', label: 'Magazine', note: 'Swapping empties it', opts: Array.from({ length: n + 1 }, (_, t) => ({ k: 'mag', n: t, name: t ? line('mag', t) : 'Standard', sub: cap(t) + ' rounds' })) }); } }
  for (const k of ['sight', 'laser', 'light', 'loader']) {
    const n = ownTier(id, k); if (!n) continue;
    const label = k === 'loader' && (D.breakOpen || id === 'scar') ? 'Reload' : WL_LINE[k], off = { sight: 'Iron sights', laser: 'No laser', light: 'No light', loader: D.breakOpen ? 'One shell at a time' : id === 'scar' ? 'Standard magwell' : 'Load by hand' }[k];
    out.push({ g: k, label, opts: [{ k, n: 0, name: off }, ...Array.from({ length: n }, (_, i) => ({ k, n: i + 1, name: line(k, i + 1) }))] });
  }
  // every other mod on its own line, on or off (the Navy trigger group, the drum, the long barrel...)
  for (const m of mods) if (!MODS[m].muzzle) out.push({ g: 'mod:' + m, label: MODS[m].fm ? 'Trigger' : 'Upgrade', opts: [{ mod: m, n: 0, name: 'Off' }, { mod: m, n: 1, name: modName(m) }] });
  // the bayonet on a long gun, the stock on a sidearm (each bought for that gun alone)
  if (D.slot === 'long' && ownAtt(id, 'bayonet')) out.push({ g: 'bayonet', label: 'Bayonet', opts: [{ att: 'bayonet', n: 0, name: 'Off' }, { att: 'bayonet', n: 1, name: 'Bayonet', sub: 'Shove stabs for 45' }] });
  if (D.slot === 'side' && ownAtt(id, 'stock')) out.push({ g: 'stock', label: 'Stock', opts: [{ att: 'stock', n: 0, name: 'Off' }, { att: 'stock', n: 1, name: 'Shoulder stock', sub: 'Less kick' }] });
  return out;
}
// is this choice what's on the gun now
function wlIsOn(id, o) {
  if (o.rk) return roundOn(id) === o.rk;
  if (o.att) return gunAtt(id, o.att) === !!o.n;
  if (o.mod) return hasMod(o.mod) === !!o.n;
  if (o.k === 'muzzle') return !gunTier(id, 'supp') && !gunTier(id, 'choke') && !(W8.mods[id] || []).some(m => MODS[m].muzzle);
  return gunTier(id, o.k) === o.n;
}
// a different magazine: the one in the gun comes out with whatever's in it, back into your reserve, and the new one
// goes in empty, so it needs a reload (no mag still in it to wait for: W8.pin, game/run-state.js)
function magUnload(id, fit) {
  const D = W(id), left = W8.mag[id] || 0;
  if (D.ammo && left) { W8.reserve[D.ammo] += left; feed('ammo', left, 'back in your pouch'); }
  W8.mag[id] = 0; if (W8.akMag && W8.akMag[id]) W8.akMag[id] = { L: 0, R: 0 };
  W8.hudSpent[id] = 0; if (W8.spent) W8.spent[id] = 0;
  if (W8.reloading && curId() === id) { W8.reloading = null; W8.reloadT = 0; }
  delete W8.relSave[id];
  fit(); delete W8.pin[id];
}
function wlPick(i) {
  const id = curId(), o = wlOpts[i]; if (!id || !o || wlIsOn(id, o)) return;
  const was = wlGrps[o.gi].opts.find(q => wlIsOn(id, q));   // (what it was, for the feed's line when it comes off)
  exitScope();
  if (o.rk) loadRound(id, o.rk, true);   // (the mag's emptied and filled again with the new kind)
  else magChange(id, () => {
    const mzOff = () => (W8.mods[id] || []).filter(m => MODS[m].muzzle).forEach(m => setMod(id, m, false));
    if (o.att) setAtt(id, o.att, !!o.n);
    else if (o.mod) setMod(id, o.mod, !!o.n);
    else if (o.k === 'muzzle') { fitTier(id, 'supp', 0); fitTier(id, 'choke', 0); mzOff(); }
    else if (o.k === 'mag') magUnload(id, () => fitTier(id, 'mag', o.n));
    else { if (o.k === 'supp' || o.k === 'choke') mzOff(); fitTier(id, o.k, o.n); }
    recomputeEff();
  });
  if (o.k === 'mag') delete W8.pin[id];   // (emptied and swapped: there's no old mag left in it for magChange to keep)
  if (!o.rk) buildGuns(id);
  gunGlow = 1; SFX.click();
  feed(o.rk ? 'ammo' : 'gear', 0, o.n ? o.name + (o.rk || o.k === 'ammo' ? ' loaded' : ' on') : (was ? was.name : o.name) + (o.k === 'ammo' ? ' unloaded' : ' off'));
  if (openSt) renderStation();   // the bench's cards measure against what's on the gun now
  const b = $('wLoad').querySelector(`button[data-i="${i}"]`); if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
}
$('wLoad').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) wlPick(+b.dataset.i); });
// the marker in each group slides to the picked choice (instantly the first time the group is laid out)
function wlMarks(still) {
  $('wLoad').querySelectorAll('.wlGrp').forEach(gr => {
    const on = gr.querySelector('button.on'), m = gr.querySelector('.wlMark'); if (!on || !m) return;
    m.classList.toggle('still', !!still);
    m.style.setProperty('--y', on.offsetTop + 'px'); m.style.setProperty('--h', on.offsetHeight + 'px');
  });
}
// every frame: shown while you're at the workbench with a gun that has something to swap, docked on its right
function updateLoadout() {
  const el = $('wLoad'), id = curId(), st = $('station'), groups = state === 'play' && !P.dead && wsAtBench() ? wlGroups(id) : [], on = groups.length > 0;
  if (!st.classList.contains('closing')) { st.classList.toggle('withLoad', on); document.documentElement.classList.toggle('dkL', on); }
  if (on && (el.hidden || el.classList.contains('closing'))) {
    clearTimeout(wlCloseT); const was = !el.hidden; el.classList.remove('closing', 'opening'); el.hidden = false; wlKey = ''; if (was) void el.offsetWidth; el.classList.add('opening');   // (a forced layout only to restart one still on screen)
    clearTimeout(wlOpenT); wlOpenT = setTimeout(() => el.classList.remove('opening'), 900);
  } else if (!on && !el.hidden && !el.classList.contains('closing')) {
    el.classList.remove('opening'); el.classList.add('closing');
    clearTimeout(wlCloseT); wlCloseT = setTimeout(() => { el.classList.remove('closing'); el.hidden = true; }, 220);
  }
  if (!on) return;
  const key = id + '|' + groups.map(g => g.g + ':' + g.opts.map(o => o.name).join(',')).join('|');
  if (key !== wlKey) {
    // a group that wasn't there a moment ago (the first rounds or attachment just bought for this gun) rises in on its own
    const had = wlKey.startsWith(id + '|') ? new Set(wlGrps.map(g => g.g)) : null;
    wlKey = key; wlOpts = []; wlGrps = groups; let k = 0;
    const D = WEAP[id];
    el.innerHTML = `<div class="wlHead" style="--k:${k++}"><b>Loadout</b><span>${D.short || D.name}</span></div><p class="wlNote" style="--k:${k++}">Swap or take off for free. Whatever you've bought stays yours.</p>` +
      groups.map((g, gi) => `<div class="wlSub${had && !had.has(g.g) ? ' new' : ''}" style="--k:${Math.min(9, k++)}">${g.label}${g.note ? `<small>${g.note}</small>` : ''}</div><div class="wlGrp${had && !had.has(g.g) ? ' new' : ''}" data-g="${g.g}" style="--k:${Math.min(9, k++)}"><i class="wlMark"></i>` +
        g.opts.map(o => { o.gi = gi; const i = wlOpts.push(o) - 1; return `<button type="button" data-i="${i}"><b>${o.name}</b>${o.sub ? `<em>${o.sub}</em>` : ''}</button>`; }).join('') + '</div>').join('');
    wlSel = '';
  }
  const sel = wlOpts.map(o => wlIsOn(id, o) ? 1 : 0).join('');
  if (sel !== wlSel) {
    const first = !wlSel; wlSel = sel;
    el.querySelectorAll('button[data-i]').forEach(b => { const on = sel[+b.dataset.i] === '1'; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    requestAnimationFrame(() => wlMarks(first));   // (next frame, before anything's changed: reading where the buttons are now would lay the page out mid-frame)
  }
}
