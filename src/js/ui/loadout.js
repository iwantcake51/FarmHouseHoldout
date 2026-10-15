// The loadout panel: docked against the workbench's right side (as the stats sheet is on its left), it lists what
// you've bought for the gun in your hands and lets you change what's on it for nothing: load any rounds you've bought
// for it (standard, hollow points, +P, match-grade), take an attachment off or put back one you had before. Nothing
// you've bought is lost by it (W8.own, ownTier and fitTier in game/run-state.js); buying the next step at the bench
// still fits that one. It comes out from behind the bench as that unrolls, or pops out when your first purchase for
// the gun gives it something to show, and a marker slides to whatever you pick (styles/loadout.css).

let wlKey = '', wlSel = '', wlCloseT = 0, wlOpenT = 0, wlOpts = [], wlGrps = [];
const WL_LINE = { supp: 'Muzzle', choke: 'Muzzle', sight: 'Sight', laser: 'Laser', light: 'Light', loader: 'Loader' };
const pctPlus = m => '+' + Math.round((m - 1) * 100) + '%';
// every choice for the gun in your hands, a group a line: [{ g: group, label, opts: [{ k, n, att, name, sub }] }]
function wlGroups(id) {
  const D = id && WEAP[id]; if (!D || D.melee) return [];
  const out = [], line = (k, n) => tierName(k, n - 1, id);
  const a = ownTier(id, 'ammo');
  if (a) out.push({ g: 'ammo', label: 'Rounds', opts: Array.from({ length: a + 1 }, (_, n) => ({ k: 'ammo', n,
    name: n ? line('ammo', n) : 'Standard rounds', sub: n ? pctPlus(AMMO_DMG[n]) + ' damage' + (n >= 3 ? ' · headshots +' + HEAD_UP.ammo + '×' : '') : 'As the gun comes' })) });
  // a shotgun's can and choke share the muzzle: one group, so picking one takes the other off
  const mz = ['supp', 'choke'].flatMap(k => Array.from({ length: ownTier(id, k) }, (_, i) => ({ k, n: i + 1, name: line(k, i + 1) })));
  if (mz.length) out.push({ g: 'muzzle', label: 'Muzzle', opts: [{ k: 'muzzle', n: 0, name: 'Bare muzzle' }, ...mz] });
  for (const k of ['sight', 'laser', 'light', 'loader']) {
    const n = ownTier(id, k); if (!n) continue;
    const label = k === 'loader' && D.breakOpen ? 'Reload' : WL_LINE[k], off = { sight: 'Iron sights', laser: 'No laser', light: 'No light', loader: D.breakOpen ? 'One shell at a time' : 'Load by hand' }[k];
    out.push({ g: k, label, opts: [{ k, n: 0, name: off }, ...Array.from({ length: n }, (_, i) => ({ k, n: i + 1, name: line(k, i + 1) }))] });
  }
  // the run-wide ones, on every long gun or sidearm you carry
  if (D.slot === 'long' && ownAtt('bayonet')) out.push({ g: 'bayonet', label: 'Bayonet', note: 'every long gun', opts: [{ att: 'bayonet', n: 0, name: 'Off' }, { att: 'bayonet', n: 1, name: 'Bayonet', sub: 'Shove stabs for 45' }] });
  if (D.slot === 'side' && ownAtt('stock')) out.push({ g: 'stock', label: 'Stock', note: 'every sidearm', opts: [{ att: 'stock', n: 0, name: 'Off' }, { att: 'stock', n: 1, name: 'Shoulder stock', sub: 'Less kick' }] });
  return out;
}
// is this choice what's on the gun now
function wlIsOn(id, o) {
  if (o.att) return !!S.att[o.att] === !!o.n;
  if (o.k === 'muzzle') return !gunTier(id, 'supp') && !gunTier(id, 'choke');
  return gunTier(id, o.k) === o.n;
}
function wlPick(i) {
  const id = curId(), o = wlOpts[i]; if (!id || !o || wlIsOn(id, o)) return;
  const was = wlGrps[o.gi].opts.find(q => wlIsOn(id, q));   // (what it was, for the feed's line when it comes off)
  exitScope();
  magChange(id, () => {
    if (o.att) fitAtt(o.att, !!o.n);
    else if (o.k === 'muzzle') { fitTier(id, 'supp', 0); fitTier(id, 'choke', 0); }
    else fitTier(id, o.k, o.n);
    recomputeEff();
  });
  buildGuns(); gunGlow = 1; SFX.click();
  feed('gear', 0, o.n ? o.name + (o.k === 'ammo' ? ' loaded' : ' on') : (was ? was.name : o.name) + (o.k === 'ammo' ? ' unloaded' : ' off'));
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
    clearTimeout(wlCloseT); el.classList.remove('closing', 'opening'); el.hidden = false; wlKey = ''; void el.offsetWidth; el.classList.add('opening');
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
    wlMarks(first);
  }
}
