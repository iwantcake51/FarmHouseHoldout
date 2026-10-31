// The title's Loadouts screen: the arena's eight classes (pvp/pvp.js PVP_CLASSES) with the guns and melee weapon each
// carries made your own. Down the left the classes, 1 to 8; in the middle the weapon being changed (Primary, Secondary
// or Melee along its top) turning slowly in the studio (ui/gun-view.js, built just as it's built for your hands, with
// what's on it), its numbers over it and its attachment slots under it, a tile each: click one for its next step, a
// step's own pip for that step, the cross to take it off. Down the right the weapons that can go in that slot, and the
// class's perks (set by the class: not yours to change).
//
// Pick 10: the two guns share ten points. Each gun costs one, each attachment step one more (a 3-step suppressor is
// three); the melee weapon is free. Whatever would take you past ten can't be picked, and the meter along the top says
// where you are. Only attachments proper go on (sights, cans, chokes, lasers, lights, loaders, triggers and mags, as far
// as each goes on that gun: the same lines Showdown's random loadouts draw from), never the powder, a workbench
// tune-up or a mod. A class you've never touched is carried as it comes (mods and all, PVP_CLASSES); once changed it's
// yours, its stock mods dropped, kept in this browser for good (AL_KEY) until Reset to default. Bots always carry the
// stock classes (pvp/bots.js). In a match your own class is alKit's (pvp/pvp.js pvpLoadout), and everyone else sees
// your guns as they are on you (net/arsenal.js sends them, attachments and all).
import { $ } from '../core/dom.js';
import { SFX } from '../audio/sfx.js';
import { WEAP } from '../weapons/gun-stats.js';
import { TIERS, tierName } from '../upgrades/tier-table.js';
import { MAG_STEPS, NO_SIGHT, NO_SUPP, NO_TRIGGER, UPG } from '../upgrades/upgrades.js';
import { magSize, recomputeEff, SCOPE_TOP, W, W8 } from '../game/run-state.js';
import { MODS } from '../melee/melee-mods.js';
import { gunArt, meleeArt } from './melee-art.js';
import { gunView, hideGun, showGun } from './gun-view.js';
import { PVP_CLASSES, PVP_DMG } from '../pvp/pvp.js';

// the budget; where your loadouts are kept; and the slots, in the order they're tabbed through
const AL_BUDGET = 10, AL_KEY = 'fhh-arena-loadouts', AL_TABS = [['p', 'Primary'], ['s', 'Secondary'], ['m', 'Melee']];
// the attachment lines a gun can carry here, in the order their tiles sit (the slot each fills on the gun, by name).
// Never 'ammo' (the powder) or a tune-up: they're a gun's insides, not something bolted on
const AL_LINES = [['sight', 'Optic'], ['supp', 'Suppressor'], ['choke', 'Choke'], ['laser', 'Laser'], ['light', 'Light'], ['loader', 'Loader'], ['trigger', 'Trigger'], ['mag', 'Magazine']];
// how far each line goes on a gun (0: it takes none), as the workbench has it (upgrades/upgrades.js tierFits) with no
// mods on: a sight up to the scopes on the guns that take them, a can on all but the double barrel, a choke on the
// shotguns, a loader on the revolver, the battle rifle and the double barrel, a trigger where the rate's the trigger's,
// a mag as far as that gun's go
function alMax(id, k) {
  const D = WEAP[id];
  if (!D || D.melee) return 0;
  if (k === 'sight') return NO_SIGHT.has(id) ? 0 : SCOPE_TOP[id] || 2;
  if (k === 'supp') return NO_SUPP.has(id) ? 0 : TIERS.supp.t.length;
  if (k === 'choke') return D.ammo === 'shells' ? TIERS.choke.t.length : 0;
  if (k === 'loader') return id === 'revolver' || id === 'scar' || D.breakOpen ? 1 : 0;
  if (k === 'trigger') return NO_TRIGGER.has(id) ? 0 : TIERS.trigger.t.length;
  if (k === 'mag') return MAG_STEPS[id] ?? TIERS.mag.t.length;
  return TIERS[k] ? TIERS[k].t.length : 0;
}
// the weapons the arena has: its guns (pvp/pvp.js PVP_DMG) and the classes' melee weapons. A primary is a long gun or
// an automatic; the secondary a sidearm or another gun that rides in a different slot from the primary (the Rusher's
// double barrel behind an SMG), or nothing at all
const alGuns = () => Object.keys(PVP_DMG).filter(id => WEAP[id] && !WEAP[id].melee);
const alPriOk = id => !!WEAP[id] && WEAP[id].slot !== 'side' && id in PVP_DMG;
const alSecOk = (id, pri) => !!WEAP[id] && id in PVP_DMG && id !== pri && (!pri || WEAP[id].slot !== WEAP[pri].slot);
const alMelees = () => [...new Set(PVP_CLASSES.map(c => c.melee))];
// a gun's points (one for it, one for each step on it), a loadout's (both guns'), and what's fitted cleaned up: only
// lines the gun takes, each within its reach, and a can or a choke (they share the muzzle), never both
const gunPts = g => g ? 1 + Object.values(g[1]).reduce((a, n) => a + n, 0) : 0;
const alPts = k => gunPts(k.p) + gunPts(k.s);
function alClean(id, gt) {
  const o = {};
  for (const [k] of AL_LINES) { const n = Math.min(alMax(id, k), Math.floor(+(gt || {})[k] || 0)); if (n > 0) o[k] = n; }
  if (o.supp && o.choke) delete o.choke;
  return o;
}
// a class's own kit as the editor holds it ({ p: [gun, steps], s: [gun, steps] or null, m: melee }): its stock guns
// and attachments without their mods
const alStock = C => ({ p: [C.guns[0][0], alClean(C.guns[0][0], C.guns[0][1])], s: C.guns[1] ? [C.guns[1][0], alClean(C.guns[1][0], C.guns[1][1])] : null, m: C.melee });
// a saved kit made safe to carry: anything that isn't the arena's or doesn't fit put back to the class's own, then
// trimmed to the budget (the secondary's top steps first, then the primary's, then the secondary itself). Every stock
// class costs ten or less as it comes, so this only ever bites on a kit kept from some other version of the rules
function alFix(k, C) {
  const st = alStock(C), o = { p: null, s: null, m: st.m };
  o.p = k && k.p && alPriOk(k.p[0]) ? [k.p[0], alClean(k.p[0], k.p[1])] : st.p;
  o.s = k && k.s === null ? null : k && k.s && alSecOk(k.s[0], o.p[0]) ? [k.s[0], alClean(k.s[0], k.s[1])] : st.s && alSecOk(st.s[0], o.p[0]) ? st.s : null;
  o.m = k && alMelees().includes(k.m) ? k.m : st.m;
  const drop = g => { if (!g) return false; const ks = Object.keys(g[1]); if (!ks.length) return false; const top = ks.sort((a, b) => g[1][b] - g[1][a])[0]; if (--g[1][top] <= 0) delete g[1][top]; return true; };
  while (alPts(o) > AL_BUDGET) { if (!drop(o.s) && !drop(o.p)) o.s = null; }
  return o;
}
// what's kept: { classId: kit } for the classes you've changed (a broken or missing store is just none changed)
let alSaved = {};
try { alSaved = JSON.parse(localStorage.getItem(AL_KEY) || '{}') || {}; if (typeof alSaved !== 'object') alSaved = {}; } catch (e) { alSaved = {}; }
function alStore() { try { localStorage.setItem(AL_KEY, JSON.stringify(alSaved)); } catch (e) {} }
const alClass = id => PVP_CLASSES.find(c => c.id === id);
// the kit a class is shown with here: yours if you've changed it, else its own
const alKitOf = C => alSaved[C.id] ? alFix(alSaved[C.id], C) : alStock(C);
// what you carry into the arena as class id (pvp/pvp.js pvpLoadout and the class picker): your changed kit, in the
// class's own shape (guns with their steps and no mods, the melee weapon, mags: one for a belt-fed kit, as the Gunner
// has it, else three; the class's perks), or null while it's still the class's own
export function alKit(id) {
  const C = alClass(id); if (!C || !alSaved[id]) return null;
  const k = alFix(alSaved[id], C), guns = [k.p, k.s].filter(Boolean).map(([g, gt]) => [g, Object.assign({}, gt), []]);
  return { id: C.id, name: C.name, role: C.role, guns, melee: k.m, mags: guns.some(g => g[0] === 'lmg') ? 1 : 3, perks: C.perks.slice() };
}
// (what changes it: a match re-equips you at the count-in only when this differs from what it gave you)
export const alKitKey = id => alSaved[id] ? JSON.stringify(alSaved[id]) : '';

// ---- a weapon as a kit has it, for its picture and its numbers: its steps on it for a moment (and nothing of the
// run's: no rounds or tune-up; mods only for a stock class as it comes), everything put back after (as pvp/pvp.js
// pvpGunArt does for the class cards)
function alWith(id, gt, fn, mods = []) {
  const keep = [], put = (o, k, v) => { if (!W8[o]) return; keep.push([o, k, k in W8[o], W8[o][k]]); if (v === undefined) delete W8[o][k]; else W8[o][k] = v; };
  put('gt', id, Object.assign({}, gt)); put('own', id, Object.assign({}, gt)); put('mods', id, mods.slice()); ['att', 'tune', 'rds', 'rounds', 'pin'].forEach(o => put(o, id, undefined));
  if (!W8.modLv) W8.modLv = {}; mods.forEach(m => put('modLv', m, 1));
  recomputeEff();
  try { return fn(); } finally { for (let i = keep.length - 1; i >= 0; i--) { const [o, k, had, v] = keep[i]; if (had) W8[o][k] = v; else delete W8[o][k]; } recomputeEff(); }
}
const alArtCache = {};
const alArt = id => alArtCache[id] ?? (alArtCache[id] = ((WEAP[id].melee ? meleeArt(id, []) : alWith(id, {}, () => gunArt(id))) || { url: '' }).url);
// its numbers against a man (the arena's damage: pvp/pvp.js PVP_DMG, every pellet), how fast it fires, what it holds
// and how long a reload takes; each bar out of the most any arena gun gets to (AL_STAT)
const AL_STAT = [['dmg', 'Damage', 120, ''], ['rpm', 'Fire rate', 900, ' rpm'], ['mag', 'Capacity', 100, ''], ['rel', 'Reload', 5, ' s']];
const alNums = (id, gt, mods) => alWith(id, gt, () => { const D = W(id); return { dmg: (PVP_DMG[id] || 0) * (D.pellets || 1), rpm: Math.round(60 / D.rate), mag: magSize(id), rel: +((D.perShell ? D.perShell * magSize(id) : D.reload) || 0).toFixed(1) }; }, mods);

// ---- the screen
const AL_BACK = 200;
const AL = { on: false, cls: 0, tab: 'p', hover: null, closeT: 0, keys: {}, view: '', shown: '' };
const alEl = $('alo');
const alEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const perkName = s => { const [k, n] = s.split(':'); return n ? TIERS[k].t[n - 1].name : s; };
const perkText = s => { const [k, n] = s.split(':'); const st = n ? TIERS[k].t[n - 1] : UPG.find(u => u.name === s); const t = st && (st.text || (st.card && st.card().text)); return typeof t === 'function' ? '' : t || ''; };
const cur = () => PVP_CLASSES[AL.cls];
const kitNow = () => alKitOf(cur());
// a change to the class on show: made on its kit (the stock one first, the first time), checked, kept
function alEdit(fn) {
  const C = cur(), k = alKitOf(C); fn(k);
  alSaved[C.id] = alFix(k, C); alStore(); alSync(true);
}
// the weapon a tab shows, and its steps
const tabGun = (k, t) => t === 'm' ? k.m : k[t] ? k[t][0] : null;
// what it'd cost to set line key to step n on the tab's gun (a can taking the choke off, or the other way, gives its
// points back), and whether that fits
function stepCost(k, t, key, n) { const gt = k[t][1], other = key === 'supp' ? 'choke' : key === 'choke' ? 'supp' : null; return n - (gt[key] || 0) - (other && n > 0 ? gt[other] || 0 : 0); }
const fits = (k, d) => alPts(k) + d <= AL_BUDGET;
function setStep(key, n) {
  const k = kitNow(), t = AL.tab; if (!k[t]) return;
  n = Math.max(0, Math.min(alMax(k[t][0], key), n));
  if (n === (k[t][1][key] || 0)) return;
  if (!fits(k, stepCost(k, t, key, n))) { alDeny(); return; }
  alEdit(k => { const gt = k[t][1]; if (n) gt[key] = n; else delete gt[key]; if (n && key === 'supp') delete gt.choke; if (n && key === 'choke') delete gt.supp; });
  SFX.click();
}
// a weapon picked for the tab's slot: a new gun starts bare (one point); a primary that rides where the secondary does
// takes its place, the secondary dropped
function pickGun(id) {
  const k = kitNow(), t = AL.tab;
  if (t === 'm') { if (k.m === id) return; alEdit(k => { k.m = id; }); SFX.click(); return; }
  if (t === 's' && id === '') { if (!k.s) return; alEdit(k => { k.s = null; }); SFX.click(); return; }
  if (k[t] && k[t][0] === id) return;
  if (t === 'p' ? !alPriOk(id) : !alSecOk(id, k.p[0])) return;
  const after = { p: t === 'p' ? [id, {}] : k.p, s: t === 's' ? [id, {}] : k.s && t === 'p' && WEAP[k.s[0]].slot === WEAP[id].slot ? null : k.s };
  if (alPts(after) > AL_BUDGET) { alDeny(); return; }
  alEdit(k => { k.p = after.p; k.s = after.s; });
  SFX.click();
}
// not enough points: the meter shakes
function alDeny() { const m = $('aloPts'); m.classList.remove('deny'); void m.offsetWidth; m.classList.add('deny'); SFX.deny(); }
$('aloPts').addEventListener('animationend', e => e.currentTarget.classList.remove('deny'));

// the class list and the tabs are built once; the weapons for the slot, the perks and the slot tiles again only when
// what they hold changes (keyed on it: AL.keys), and every change after only brought up to date (alSync), so pips fill,
// tiles light, the tabs' ink slides and the pictures stay put as things are picked
const swapIn = el => { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); };
function alPart(name, key, el, html) { if (AL.keys[name] === key) return false; AL.keys[name] = key; el.innerHTML = html(); return true; }
function alBuild() {
  const k = kitNow(), C = cur(), t = AL.tab, id = tabGun(k, t);
  alPart('cls', 1, $('aloCls'), () => PVP_CLASSES.map((c, i) => `<button type="button" class="aloC" data-i="${i}" role="tab"><kbd>${i + 1}</kbd><span><b>${alEsc(c.name)}</b><small></small></span><em></em></button>`).join(''));
  alPart('tabs', 1, $('aloTabs'), () => AL_TABS.map(([tk, n]) => `<button type="button" class="aloTab" role="tab" data-tab="${tk}"><small>${n}</small><b></b></button>`).join('') + '<i class="aloInk" aria-hidden="true"></i>');
  // the weapons for this slot, each with its picture and what it costs
  const list = t === 'm' ? alMelees() : t === 'p' ? alGuns().filter(alPriOk) : alGuns().filter(g => alSecOk(g, k.p[0])).sort((a, b) => (WEAP[a].slot !== 'side') - (WEAP[b].slot !== 'side'));
  if (alPart('pick', t + list.join(), $('aloPick'), () => (t === 's' ? `<button type="button" class="aloW none" data-w=""><span class="aloWArt nil"></span><span class="aloWTx"><b>None</b><small>Keep the point for the primary</small></span><em>0</em></button>` : '') +
    list.map(g => { const D = WEAP[g]; return `<button type="button" class="aloW" data-w="${g}"><span class="aloWArt"><img alt="" decoding="sync" src="${alArt(g)}"></span><span class="aloWTx"><b>${alEsc(D.name)}</b><small>${D.melee ? 'Melee' : alEsc(D.cal || '')}${t === 's' && D.slot !== 'side' ? ' · ' + (D.slot === 'long' ? 'Long gun' : 'Automatic') : ''}</small></span><em>${t === 'm' ? '' : 1}</em></button>`; }).join(''))) {
    $('aloPickHead').innerHTML = `<b>${t === 'm' ? 'Melee weapons' : t === 'p' ? 'Primary weapons' : 'Secondary weapons'}</b><small>${t === 'm' ? 'Free: no points' : 'A gun costs 1 point'}</small>`;
    swapIn($('aloPick'));
  }
  // the class's perks: set by it, shown for what they are
  alPart('perks', C.id, $('aloPerks'), () => `<div class="aloPerkHead"><b>Perks</b><small>Set by the class</small></div>` + C.perks.map(p => `<span class="aloPerk" title="${alEsc(perkText(p))}">${alEsc(perkName(p))}</span>`).join('') + `<p class="aloRole">${alEsc(C.role)}</p><p class="aloNote" id="aloNote"></p>`);
  // the slot tiles (none for a melee weapon, or with no secondary)
  const lines = id && t !== 'm' ? AL_LINES.filter(([key]) => alMax(id, key) > 0) : [];
  alPart('atts', t + id, $('aloAtts'), () => lines.length ? lines.map(([key, n]) => `<div class="aloA" data-k="${key}" role="group" aria-label="${n}"><button type="button" class="aloAMain" data-act="up"><small>${n}${key === 'supp' || key === 'choke' ? (alMax(id, key === 'supp' ? 'choke' : 'supp') ? '<i>Muzzle</i>' : '') : ''}</small><b></b></button><span class="aloPips">${Array.from({ length: alMax(id, key) }, (_, i) => `<button type="button" class="aloPip" data-n="${i + 1}" aria-label="${alEsc(tierName(key, i, id))}"></button>`).join('')}</span><button type="button" class="aloAX" data-act="off" aria-label="Take it off" title="Take it off"></button></div>`).join('')
    : `<p class="aloNone">${t === 'm' ? 'Melee weapons take no attachments, and cost nothing.' : 'No secondary: its point goes to the primary. Pick one from the list to carry one.'}</p>`);
  $('aloAtts').classList.toggle('empty', !lines.length);
  // a new class or slot (or a new weapon in it): the studio and the tiles swap in
  const view = AL.cls + t + id; if (AL.view !== view) { AL.view = view; swapIn($('aloStage')); swapIn($('aloAtts')); }
}
function alSync(changed) {
  alBuild();
  const k = kitNow(), C = cur(), t = AL.tab, id = tabGun(k, t);
  // the classes: each one's guns, its points, and whether it's yours now
  $('aloCls').querySelectorAll('.aloC').forEach((b, i) => {
    const c = PVP_CLASSES[i], ck = alKitOf(c); b.classList.toggle('on', i === AL.cls); b.setAttribute('aria-selected', String(i === AL.cls));
    b.querySelector('small').textContent = [ck.p, ck.s].filter(Boolean).map(g => WEAP[g[0]].short || WEAP[g[0]].name).join(' · ');
    b.querySelector('em').textContent = alPts(ck); b.classList.toggle('mine', !!alSaved[c.id]);
  });
  // the tabs: each slot's weapon under its name, the ink under the one on show
  $('aloTabs').querySelectorAll('.aloTab').forEach(b => { const w = tabGun(k, b.dataset.tab); b.querySelector('b').textContent = w ? WEAP[w].name : 'None'; b.classList.toggle('on', b.dataset.tab === t); b.classList.toggle('empty', !w); b.setAttribute('aria-selected', String(b.dataset.tab === t)); });
  const on = $('aloTabs').querySelector('.on'), ink = $('aloTabs').querySelector('.aloInk'); if (on) { ink.style.width = on.offsetWidth + 'px'; ink.style.translate = on.offsetLeft + 'px 0'; }
  $('aloPick').querySelectorAll('.aloW').forEach(b => {
    const w = b.dataset.w, sel = (w || null) === (t === 'm' ? k.m : k[t] ? k[t][0] : null);
    const after = t === 'm' ? null : { p: t === 'p' ? [w, {}] : k.p, s: t === 's' ? (w ? [w, {}] : null) : k.s && WEAP[k.s[0]].slot === WEAP[w].slot ? null : k.s };
    const over = !sel && after && alPts(after) > AL_BUDGET;
    b.classList.toggle('on', sel); b.classList.toggle('over', !!over); b.setAttribute('aria-disabled', String(!!over)); b.setAttribute('aria-pressed', String(sel));
    b.title = over ? 'Not enough points left' : t === 'p' && !sel && k.s && WEAP[k.s[0]].slot === WEAP[w].slot ? 'Takes the place of your ' + WEAP[k.s[0]].name + ' (same slot)' : '';
  });
  // the tiles: what's on, its step's pips lit, the ones it can't afford dimmed
  $('aloAtts').querySelectorAll('.aloA').forEach(a => {
    const key = a.dataset.k, n = k[t][1][key] || 0, mx = alMax(id, key);
    a.classList.toggle('on', n > 0); a.classList.toggle('max', n >= mx);
    a.querySelector('b').textContent = n ? tierName(key, n - 1, id) : 'None';
    a.querySelector('b').dataset.r = n ? TIERS[key].t[n - 1].r : '';
    a.querySelectorAll('.aloPip').forEach(p => { const pn = +p.dataset.n, can = pn <= n || fits(k, stepCost(k, t, key, pn)); p.classList.toggle('lit', pn <= n); p.classList.toggle('over', !can); p.dataset.r = TIERS[key].t[pn - 1].r;
      p.title = `${tierName(key, pn - 1, id)} · ${pn === n ? 'click to take this step off' : pn < n ? 'back to this step' : can ? '+' + stepCost(k, t, key, pn) + ' point' + (stepCost(k, t, key, pn) > 1 ? 's' : '') : 'not enough points'}`; });
    const up = n < mx && fits(k, stepCost(k, t, key, n + 1));
    a.classList.toggle('stuck', n < mx && !up);
    a.querySelector('.aloAMain').title = n >= mx ? 'As far as it goes' : up ? `Add ${tierName(key, n, id)} (+${stepCost(k, t, key, n + 1)})` : 'Not enough points left';
  });
  alMeter(k);
  // the weapon on show: its name and what it is, its numbers, and itself in the studio (a stock class's gun with its
  // stock mods on, as it'd be carried: they only come off once the class is changed)
  const D = id && WEAP[id], stockMods = D && !D.melee && !alSaved[C.id] ? ((C.guns.find(g => g[0] === id) || [])[2] || []) : [];
  $('aloName').innerHTML = D ? `<small>${AL_TABS.find(x => x[0] === t)[1]}${D.melee ? '' : ' · ' + alEsc(D.cal || '')}</small><b>${alEsc(D.name)}</b>` : `<small>Secondary</small><b>None</b>`;
  const st = $('aloStats');
  if (D && !D.melee) {
    const now = alNums(id, k[t][1], stockMods), base = alNums(id, {});
    st.innerHTML = AL_STAT.map(([s, n, mx, u]) => { const v = now[s], b = base[s], better = s === 'rel' ? v < b : v > b, worse = s === 'rel' ? v > b : v < b, f = x => Math.max(0.03, Math.min(1, s === 'rel' ? 1 - x / mx : x / mx));
      return `<div class="aloS${better ? ' up' : worse ? ' down' : ''}"><span>${n}<b>${v}${u}</b></span><i style="--b:${f(b)};--v:${f(v)}"></i></div>`; }).join('');
    st.hidden = false;
  } else { st.innerHTML = ''; st.hidden = true; }
  $('aloEmpty').hidden = !!D;
  if (D) {
    const sg = $('aloStage'); if (gunView.parentNode !== sg) sg.prepend(gunView); gunView.hidden = false; alWith(id, D.melee ? {} : k[t][1], () => showGun(id), stockMods);
    // (a weapon new to the studio starts from the same three-quarter view, then turns: the studio's own double-click
    // reset; and a notch further back than the studio frames it, AL_BACK, so a short gun turned toward the camera keeps
    // clear of its name over it and its numbers under it)
    if (AL.shown !== id) { AL.shown = id; gunView.dispatchEvent(new MouseEvent('dblclick')); gunView.dispatchEvent(new window.WheelEvent('wheel', { deltaY: AL_BACK, cancelable: true })); }
  }
  else { hideGun(); gunView.hidden = true; AL.shown = ''; }
  // the stock mods this class carries until it's changed, and what Reset does
  const mods = C.guns.flatMap(g => g[2] || []), mine = !!alSaved[C.id];
  $('aloNote').innerHTML = mine ? 'Your loadout. Mods are left off a changed class.' : mods.length ? `Stock kit, with ${mods.map(m => '<b>' + alEsc((MODS[m] || {}).name || m) + '</b>').join(', ')}. Change anything and the mods come off.` : 'Stock kit.';
  $('aloReset').disabled = !mine;
  if (changed) { const b = $('aloCls').querySelector('.aloC.on'); if (b) { b.classList.remove('saved'); void b.offsetWidth; b.classList.add('saved'); } }
}
// the meter: ten pips, the primary's lit in the accent, the secondary's paler; a hover over something it'd cost shows
// how many more it'd take (or that it won't go), and the number's big beside them
function alMeter(k) {
  const a = gunPts(k.p), b = gunPts(k.s), h = AL.hover, m = $('aloPts'), d = h ? h.d : 0;
  if (!m.firstChild) m.innerHTML = `<span class="aloPtsL">Points</span><span class="aloPtsBar">${'<i></i>'.repeat(AL_BUDGET)}</span><span class="aloPtsN"><b></b><small>/ ${AL_BUDGET}</small><em></em></span>`;
  m.querySelectorAll('.aloPtsBar i').forEach((p, i) => { const c = i < a ? 'p' : i < a + b ? 's' : ''; p.className = c + (d > 0 && !c && i < a + b + d ? ' ghost' : d < 0 && c && i >= a + b + d ? ' free' : ''); });
  const n = m.querySelector('.aloPtsN'); n.classList.toggle('over', a + b + d > AL_BUDGET); n.querySelector('b').textContent = a + b;
  n.querySelector('em').textContent = d ? (d > 0 ? '+' : '') + d : ''; n.classList.toggle('full', a + b === AL_BUDGET);
  m.setAttribute('aria-valuenow', String(a + b)); m.setAttribute('aria-valuetext', `${a + b} of ${AL_BUDGET} points`);
}
// what hovering something would cost, on the meter
function alHover(e) {
  const k = kitNow(), t = AL.tab; let d = null;
  const pip = e.target.closest('.aloPip'), main = e.target.closest('.aloAMain'), x = e.target.closest('.aloAX'), w = e.target.closest('.aloW');
  if (pip || main || x) { const key = (pip || main || x).closest('.aloA').dataset.k, n = k[t][1][key] || 0, to = pip ? (+pip.dataset.n === n ? n - 1 : +pip.dataset.n) : x ? 0 : Math.min(n + 1, alMax(k[t][0], key)); d = stepCost(k, t, key, to); }
  else if (w && t !== 'm') { const id = w.dataset.w, after = { p: t === 'p' ? [id, {}] : k.p, s: t === 's' ? (id ? [id, {}] : null) : k.s && WEAP[k.s[0]].slot === WEAP[id].slot ? null : k.s }; d = alPts(after) - alPts(k); }
  const nh = d ? { d } : null; if (JSON.stringify(nh) !== JSON.stringify(AL.hover)) { AL.hover = nh; alMeter(k); }
}

function openLoadouts(clsId) {
  clearTimeout(AL.closeT); AL.on = true;
  const i = PVP_CLASSES.findIndex(c => c.id === (clsId || (() => { try { return localStorage.getItem('fhh-class'); } catch (e) { return ''; } })())); AL.cls = i < 0 ? 0 : i;
  AL.tab = 'p'; AL.view = ''; AL.shown = ''; alEl.hidden = false; alSync(); requestAnimationFrame(() => { alEl.classList.add('on'); alSync(); });
  SFX.click();
}
function closeLoadouts() {
  if (alEl.hidden) return; AL.on = false; alEl.classList.remove('on'); AL.hover = null;
  AL.closeT = setTimeout(() => { alEl.hidden = true; hideGun(); }, 340);   // (once it's popped back down: styles/arena-loadouts.css)
}
// Reset to default asks first: a second press within a few seconds (as the settings' Reset every key does)
let alAskT = 0;
function alReset() {
  const C = cur(), b = $('aloReset'), t = b.firstChild; if (!alSaved[C.id]) return;
  if (performance.now() - alAskT > 3000) { alAskT = performance.now(); t.textContent = 'Reset ' + C.name + '? Again to confirm '; b.classList.add('ask'); SFX.click(); setTimeout(() => { if (performance.now() - alAskT >= 2900) { t.textContent = 'Reset to default '; b.classList.remove('ask'); } }, 3000); return; }
  alAskT = 0; t.textContent = 'Reset to default '; b.classList.remove('ask');
  delete alSaved[C.id]; alStore(); alSync(true); SFX.click();
}
const alClassTo = i => { if (i === AL.cls || i < 0 || i >= PVP_CLASSES.length) return; AL.cls = i; alAskT = 0; $('aloReset').firstChild.textContent = 'Reset to default '; $('aloReset').classList.remove('ask'); AL.tab = 'p'; AL.hover = null; alSync(); SFX.click(); };
const alTabTo = tk => { if (tk === AL.tab) return; AL.tab = tk; AL.hover = null; alSync(); SFX.click(); };
alEl.addEventListener('click', e => {
  if (e.target.classList.contains('aloBack') || e.target.closest('#aloX, #aloDone')) { closeLoadouts(); SFX.click(); return; }
  const c = e.target.closest('.aloC'); if (c) { alClassTo(+c.dataset.i); return; }
  const tb = e.target.closest('.aloTab'); if (tb) { alTabTo(tb.dataset.tab); return; }
  const w = e.target.closest('.aloW'); if (w) { pickGun(w.dataset.w); alHover(e); return; }
  const a = e.target.closest('.aloA');
  if (a) {
    const key = a.dataset.k, k = kitNow(), n = k[AL.tab][1][key] || 0, pip = e.target.closest('.aloPip');
    if (pip) setStep(key, +pip.dataset.n === n ? n - 1 : +pip.dataset.n);   // (its own step again takes that step off)
    else if (e.target.closest('.aloAX')) setStep(key, 0);
    else if (e.target.closest('.aloAMain')) { if (n >= alMax(k[AL.tab][0], key)) alDeny(); else setStep(key, n + 1); }
    alHover(e); return;
  }
  if (e.target.closest('#aloReset')) alReset();
});
// a right click on a tile takes a step off it
alEl.addEventListener('contextmenu', e => { const a = e.target.closest('.aloA'); if (!a) return; e.preventDefault(); const n = kitNow()[AL.tab][1][a.dataset.k] || 0; if (n) setStep(a.dataset.k, n - 1); alHover(e); });
alEl.addEventListener('pointerover', alHover);
alEl.addEventListener('pointerleave', () => { if (AL.hover) { AL.hover = null; alMeter(kitNow()); } });
// the keys while it's open, before the game's own (input/keyboard-mouse.js): 1-8 or up and down for the class, Q and E
// or left and right for the slot, R puts the class back to its own, Esc closes. Nothing else gets through (Tab, Space
// and Enter still get round the buttons as on any page)
addEventListener('keydown', e => {
  if (!AL.on) return;
  const k = e.key.toLowerCase(), n = +e.key, ti = AL_TABS.findIndex(x => x[0] === AL.tab);
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  e.stopImmediatePropagation();
  if (k === 'escape') { e.preventDefault(); closeLoadouts(); SFX.click(); }
  else if (n >= 1 && n <= PVP_CLASSES.length) alClassTo(n - 1);
  else if (k === 'arrowdown' || k === 'arrowup') { e.preventDefault(); alClassTo((AL.cls + (k === 'arrowdown' ? 1 : PVP_CLASSES.length - 1)) % PVP_CLASSES.length); }
  else if (k === 'q' || k === 'e' || k === 'arrowleft' || k === 'arrowright') { e.preventDefault(); alTabTo(AL_TABS[(ti + (k === 'e' || k === 'arrowright' ? 1 : AL_TABS.length - 1)) % AL_TABS.length][0]); }
  else if (k === 'r' && !e.repeat) alReset();
}, true);
addEventListener('resize', () => { if (AL.on) alSync(); });
$('aloBtnTitle').onclick = () => openLoadouts();
