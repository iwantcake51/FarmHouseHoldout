// The gun rack: unlocking weapons with scrap, and swapping to any you've unlocked.

// Weapons aren't found or ordered: each is unlocked here, in order along its line (ARMORY_LINES), so a line's next
// weapon can only be bought once the one before it is yours, from the first to the last. A weapon you've unlocked is
// yours for the run (W8.owned): it goes into its slot and your hands, and what it replaces stays on the rack, to take
// back down for nothing whenever you like, as you left it. The melee line forks at the bat you start with into a blunt
// branch and a bladed one
const ARMORY_LINES = [
  { name: 'Sidearms', ids: ['pistol', 'revolver', 'deagle'] },
  { name: 'Shotguns', ids: ['dbl', 'pump', 'auto12'] },
  { name: 'Rifles', ids: ['hunting', 'ar', 'lmg'] },
  { name: 'Submachine guns', ids: ['smg', 'sub'] },
  { name: 'Blunt', ids: ['bat', 'crowbar', 'wrench', 'sledge'] },
  { name: 'Blades', ids: ['bat', 'machete', 'axe', 'katana'] }
];
// what each costs to unlock, in scrap: dearer along its line, a good deal dearer for each better gun, and the heavy
// ones at the ends (the auto shotgun, the assault rifle, the LMG) far dearer than anything else
// (about 0.7 scrap a kill: some 170 by wave 10 and 400 by wave 15, before what the bench and the cabinet take)
const UNLOCK_COST = { revolver: 18, deagle: 60, dbl: 22, pump: 55, auto12: 180, hunting: 70, ar: 150, lmg: 260, smg: 18, sub: 60,
  crowbar: 10, wrench: 24, sledge: 70, machete: 10, axe: 35, katana: 80 };
const owns = id => W8.owned.includes(id);
// each line's next weapon to unlock (null once it's all yours), and how far along it you are
function lineNext(L) { const k = L.ids.findIndex(id => !owns(id)); return k < 0 ? null : L.ids[k]; }
const lineHave = L => L.ids.filter(owns).length;
function unlockWeapon(id) {
  const D = WEAP[id], old = W8.slot[D.slot];
  exitScope(); giveWeapon(id); buildGuns(); gunGlow = 1;
  feed('gear', 0, D.name + ' unlocked');
  gotGear({ ic: 'gear', kind: 'Unlocked', name: D.name, on: old ? 'Your ' + gunCall(old) + ' is on the rack' : 'Your ' + SLOT_NAME[D.slot].toLowerCase(), text: statLine(id) });
}
// one off the rack into its slot and your hands, as you left it (rounds and all); the one it replaces goes up in its place
function takeFromRack(id) {
  const D = WEAP[id], s = D.slot;
  exitScope(); cutReload(); W8.slot[s] = id; delete W8.pin[id]; buildGuns(); equip(s, true); gunGlow = 1;
  feed('gear', 0, D.name);
}
// ---- the rack's panel (stations/station-ui.js hands it over, like the strongbox's): a tab a line, the pill sliding
// along under the open one, each tab's pips saying how far along that line you are (green yours, gold the next, lit when
// you can afford it). Its pane lays the line out as cards joined up in order, the ones you have ticked, the next one to
// buy lit with its price, the rest padlocked with theirs; melee forks at the bat into its two branches. The panes are
// stacked, so switching slides the old one out and the new one in rather than redrawing; they're rebuilt only when what
// you own changes, and the buy buttons' state (enough scrap or not) is kept up every frame. Your loadout is docked on
// its left, as the stats are at the workbench (rkSide, below)
const ARMORY_TABS = [{ name: 'Sidearms', lines: [0] }, { name: 'Shotguns', lines: [1] }, { name: 'Rifles', lines: [2] }, { name: 'SMGs', lines: [3] }, { name: 'Melee', lines: [4, 5] }];
const GUN_RACK = { tab: 0, pane: '', side: '' };
const SCRAP_IC = () => `<svg viewBox="${GI_VB}">${FEED_ICON.scrap}</svg>`;
const LOCK_IC = '<svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.5v11h-13V10zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>';
const TICK_IC = '<svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12l-1.6 1.6 5.8 5.8L20.3 8.6 18.7 7z"/></svg>';
const tabIds = T => [...new Set(T.lines.flatMap(l => ARMORY_LINES[l].ids))];
const nextIds = () => new Set(ARMORY_LINES.map(lineNext).filter(Boolean));
// one weapon's card: yours (and in your hands, or on the rack), the next to buy, or padlocked behind the one before it
function rackNode(L, id, k, nxt, full) {
  const D = WEAP[id], own = owns(id), tier = `<small class="rkTier">${k + 1}</small>`, desc = full && D.desc ? `<p class="rkDesc">${D.desc}</p>` : '';
  if (!own && id === nxt) return `<button type="button" class="rkNode next" data-buy="${id}">${tier}<b>${D.name}</b><em>${statLine(id)}</em>${desc}<span class="rkBuy">${SCRAP_IC()}<b>${UNLOCK_COST[id]}</b><i class="rkNeed"></i></span></button>`;
  const on = own && W8.slot[D.slot] === id;
  const tag = own ? `<span class="rkTag">${TICK_IC}${on ? 'Carrying' : 'On the rack'}</span>` : `<span class="rkTag">${LOCK_IC}After the ${WEAP[L.ids[k - 1]].short || WEAP[L.ids[k - 1]].name}</span><span class="rkBuy">${SCRAP_IC()}<b>${UNLOCK_COST[id]}</b></span>`;
  return `<div class="rkNode ${own ? 'own' : 'lock'}${on ? ' on' : ''}">${tier}<b>${D.name}</b><em>${statLine(id)}</em>${desc}${tag}</div>`;
}
function rackTree(L, from = 0, full = false) {   // (full: with each one's description, on a tab of one line)
  const nxt = lineNext(L);
  return L.ids.slice(from).map((id, k) => (k ? `<i class="rkLink${owns(id) ? ' own' : id === nxt ? ' next' : ''}"></i>` : '') + rackNode(L, id, k + from, nxt, full)).join('');
}
function rackPane(T, ti) {
  const ids = tabIds(T), have = ids.filter(owns).length, L0 = ARMORY_LINES[T.lines[0]];
  const head = `<div class="rkPaneHd"><b>${T.name}</b><span>${SLOT_NAME[WEAP[ids[ids.length - 1]].slot]}</span><em>${have} / ${ids.length}</em><i class="rkProg" style="--p:${have / ids.length}"></i></div>`;
  // melee: the bat you start with, forking into the blunt line and the blades
  if (T.lines.length > 1) return head + `<div class="rkFork"><div class="rkRoot">${rackNode(L0, L0.ids[0], 0, null)}</div><i class="rkSplit"></i><div class="rkBranches">${T.lines.map(l => {
    const L = ARMORY_LINES[l]; return `<div class="rkBranch${owns(L.ids[1]) ? ' own' : ''}"><span class="rkBrName">${L.name}</span><div class="rkTree">${rackTree(L, 1)}</div></div>`;
  }).join('')}</div></div>`;
  return head + `<div class="rkTree">${rackTree(L0, 0, true)}</div>`;
}
function renderRack() {
  setT('stTitle', 'Gun rack'); setT('stScrap', String(S.scrap)); $('station').classList.add('wide');
  const rows = $('stRows');
  if (stStruct !== 'rack') {
    stStruct = 'rack'; GUN_RACK.pane = '';
    rows.innerHTML = `<div class="rack" style="--k:0"><div class="rkTabs" role="tablist" style="--k:1;--n:${ARMORY_TABS.length}"><i class="rkPill"></i>${ARMORY_TABS.map((T, i) =>
      `<button type="button" role="tab" data-tab="${i}"><span><kbd>${i + 1}</kbd>${T.name}</span><span class="rkPips">${tabIds(T).map(id => `<i data-pip="${id}"></i>`).join('')}</span></button>`).join('')}</div>
      <div class="rkPanes">${ARMORY_TABS.map((T, i) => `<div class="rkPane" data-pane="${i}"></div>`).join('')}</div></div>`;
  }
  const rk = rows.querySelector('.rack'), t = GUN_RACK.tab;
  if (rk.style.getPropertyValue('--i') !== String(t)) {
    rk.style.setProperty('--i', t);
    rows.querySelectorAll('.rkTabs button').forEach(b => b.setAttribute('aria-selected', +b.dataset.tab === t));
    rows.querySelectorAll('.rkPane').forEach(p => { const d = +p.dataset.pane - t; p.dataset.at = d < 0 ? 'before' : d > 0 ? 'after' : 'on'; });
  }
  const key = W8.owned.join(',') + '|' + SLOTS.map(s => W8.slot[s]).join(',');
  if (GUN_RACK.pane !== key) {
    GUN_RACK.pane = key; const nx = nextIds();
    ARMORY_TABS.forEach((T, i) => { rows.querySelector(`[data-pane="${i}"]`).innerHTML = rackPane(T, i); });
    rows.querySelectorAll('[data-pip]').forEach(p => { const id = p.dataset.pip; p.className = owns(id) ? 'own' : nx.has(id) ? 'next' : ''; });
  }
  // each buy button, and its tab's pip: lit when you can afford it, saying how much more you need when you can't
  rows.querySelectorAll('[data-buy]').forEach(b => {
    const id = b.dataset.buy, c = UNLOCK_COST[id], short = S.scrap < c, txt = short ? `Need ${c - S.scrap} more` : 'Unlock';
    if (b._t !== txt) { b._t = txt; b.classList.toggle('short', short); b.querySelector('.rkNeed').textContent = txt; const p = rows.querySelector(`[data-pip="${id}"]`); if (p) p.classList.toggle('can', !short); }
  });
  setT('stNote', 'Each line unlocks in order, first to last · 1–5 or Tab picks a line · E to step away');
}
let rackSwapT = 0;
function rackTab(t) {
  t = (t + ARMORY_TABS.length) % ARMORY_TABS.length; if (GUN_RACK.tab === t) return;
  GUN_RACK.tab = t; SFX.click(); renderStation();
  // the new pane's cards rise in one after another (the class is taken off again after, so a frame that never runs
  // the animation can't leave them hidden)
  const rk = $('stRows').querySelector('.rack'); if (!rk) return;
  rk.classList.remove('swap'); void rk.offsetWidth; rk.classList.add('swap'); clearTimeout(rackSwapT); rackSwapT = setTimeout(() => rk.classList.remove('swap'), 650);
}
function rackClick(b) {
  if (b.dataset.tab) { rackTab(+b.dataset.tab); return; }
  if (b.dataset.take) { takeFromRack(b.dataset.take); SFX.craft(); renderStation(); return; }
  const id = b.dataset.buy; if (!id) return;
  const c = UNLOCK_COST[id];
  if (S.scrap < c) { SFX.click(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
  S.scrap -= c; popEl('scrap'); unlockWeapon(id); SFX.craft(); renderStation();
}
// the number keys in the panel pick a line
function rackKey(i) { if (i < ARMORY_TABS.length) rackTab(i); }
// ---- your loadout, docked against the rack's left side while it's open (as the stats sheet is at the workbench:
// ui/weapon-stats.js docks the panel and makes room for it): your four slots in key order, the weapon in each, the
// one in your hands edged orange, and the others you've unlocked for each slot to take down for nothing
let rkSideCloseT = 0, rkSideOpenT = 0;
const rkSideOn = () => state === 'play' && !P.dead && !!openSt && openSt.id === 'rack';
function rackSideHTML() {
  return `<div class="rlHead" style="--k:0"><b>Loadout</b><span>What you carry</span></div><p class="rlNote" style="--k:1">Take any weapon you've unlocked down off the rack for nothing, as you left it.</p>` + SLOTS.map((s, i) => {
    const id = W8.slot[s], others = W8.owned.filter(o => WEAP[o] && WEAP[o].slot === s && o !== id), cur = s === W8.cur;
    return `<div class="rlSlot${cur ? ' cur' : ''}" data-s="${s}" style="--k:${i + 2}"><div class="rlSlotHd"><kbd>${i + 1}</kbd><span>${SLOT_NAME[s]}</span>${cur ? '<i>In your hands</i>' : ''}</div>
      ${id ? `<b class="rlGun">${WEAP[id].name}</b><em>${statLine(id)}</em>` : '<b class="rlGun rlEmpty">Empty</b><em>Unlock one from the rack</em>'}
      ${others.length ? `<div class="rlAlt">${others.map(o => `<button type="button" data-take="${o}" title="${statLine(o)}"><span>Swap to</span><b>${WEAP[o].short || WEAP[o].name}</b></button>`).join('')}</div>` : ''}</div>`;
  }).join('');
}
// every frame: shown while the rack's open, rebuilt only when what you carry or own changes
function updateRackSide() {
  if (!GUN_RACK.built) rackGuns();
  const el = $('rkLoad'), on = rkSideOn();
  if (on && (el.hidden || el.classList.contains('closing'))) {
    clearTimeout(rkSideCloseT); el.classList.remove('closing', 'opening'); el.hidden = false; GUN_RACK.side = ''; void el.offsetWidth; el.classList.add('opening');
    clearTimeout(rkSideOpenT); rkSideOpenT = setTimeout(() => el.classList.remove('opening'), 900);
  } else if (!on && !el.hidden && !el.classList.contains('closing')) {
    el.classList.remove('opening'); el.classList.add('closing');
    clearTimeout(rkSideCloseT); rkSideCloseT = setTimeout(() => { el.classList.remove('closing'); el.hidden = true; }, 220);
  }
  if (!on) return;
  const key = W8.owned.join(',') + '|' + SLOTS.map(s => W8.slot[s]).join(',') + '|' + W8.cur;
  if (GUN_RACK.side !== key) { GUN_RACK.side = key; el.innerHTML = rackSideHTML(); }
}
$('rkLoad').addEventListener('click', e => {
  const b = e.target.closest('button[data-take]'); if (!b || !rkSideOn()) return;
  takeFromRack(b.dataset.take); SFX.craft(); renderStation(); updateRackSide();
  const n = $('rkLoad').querySelector(`[data-s="${WEAP[b.dataset.take].slot}"]`); if (n) { n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); }
});
// ---- the rack itself: a tall pine gun rack stood against the north wall between the window and the bed, a few long guns
// standing in it, butts in the notched shelf and barrels in the notched bar above ----
// the guns in it are the game's own models (RACK_GUNS), built as a teammate's are (teamWeapon, net/arsenal.js) and folded
// into a mesh or two each. That code loads after this, so they're put up on the first frame (rackGuns, from updateRackSide)
const RACK_GUNS = ['hunting', 'pump', 'dbl', 'ar'], RACK_W = 0.8, RACK_FACE = new THREE.Matrix4().makeBasis(new V3(0, 0, 1), new V3(1, 0, 0), new V3(0, 1, 0));
function rackGuns() {
  const R = GUN_RACK; if (R.built || !R.g) return; R.built = true;
  // each stood on its butt, muzzle up, its side to the room (its top toward +x); measured, so they're spaced by their
  // real size along the shelf
  const guns = RACK_GUNS.map(id => {
    let t; try { t = teamWeapon({}, id); } catch (e) { console.warn('rack gun', id, e); return null; }
    foldStatic(t.g, []);
    const w = new THREE.Group(); t.g.quaternion.setFromRotationMatrix(RACK_FACE); w.add(t.g); w.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(w), c = bb.getCenter(new V3());
    t.g.position.set(-c.x, -bb.min.y, -c.z); return { w, wide: bb.max.x - bb.min.x };
  }).filter(Boolean);
  const total = guns.reduce((a, q) => a + q.wide, 0), gap = (RACK_W - total) / (guns.length + 1);
  let x = -RACK_W / 2 + gap;
  guns.forEach(q => {
    const lean = new THREE.Group(); lean.position.set(x + q.wide / 2, 0.14, 0.02); lean.rotation.x = -0.09; lean.add(q.w); R.g.add(lean);   // leant back against the bar
    box(R.g, Math.min(0.1, q.wide * 0.7), 0.02, 0.2, HM.hole, x + q.wide / 2, 0.142, 0);   // its notch in the shelf
    x += q.wide + gap;
  });
  R.g.traverse(o => { if (o.isMesh) o.castShadow = true; });
}
{
  const g = new THREE.Group(); g.position.set(cxw(25), 0, cxw(HZ0) + 0.5 + 0.2); scene.add(g);
  const sil = m => { m.userData.sil = true; return m; };
  sil(box(g, 0.9, 1.56, 0.03, HM.oak, 0, 0.86, -0.17));                                          // the back board
  [-0.44, 0.44].forEach(x => sil(box(g, 0.05, 1.66, 0.32, HM.oakDk, x, 0.83, -0.02)));           // the uprights
  sil(box(g, 0.94, 0.05, 0.36, HM.oakDk, 0, 1.68, -0.02));                                       // the top
  sil(box(g, 0.84, 0.14, 0.3, HM.oak, 0, 0.07, -0.02));                                          // the shelf the butts stand in
  box(g, 0.84, 0.05, 0.1, HM.oakDk, 0, 1.22, 0.07);                                              // the bar the barrels rest in
  GUN_RACK.g = g;   // (the guns go in on the first frame: rackGuns)
  box(g, 0.2, 0.06, 0.012, HM.paper, 0, 1.5, -0.15); box(g, 0.14, 0.008, 0.013, HM.ink, 0, 1.5, -0.149);   // a label tacked to the back board
  unfight(g); mergeInto(g, finePieces(g));
  obstacle(25, HZ0 + 1);   // stood against the wall, tall: you can't see or shoot through it
  const st = { g, id: 'rack', name: 'Gun rack', x: cxw(25), z: cxw(HZ0 + 1) + 0.95 };
  st.om = outline(g, 0xf4f1ea, 0, 0.035, null, o => !o.userData.fine); st.om.visible = false;   // (as the others get theirs: stations/stations.js)
  STATIONS.push(st);
}
