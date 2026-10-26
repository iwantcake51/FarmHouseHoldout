// The character editor: every part of your look (player/look.js), changed and built on you at once. Shared by the
// title's Character menu (ui/look-menu.js) and the cheat menu's character section (ui/cheats.js), each putting the
// pieces in its own frame round the studio's copy of you (ui/gun-view.js: showFigure). Its buttons carry data-act
// (lk: set a part of the look, lkpart: pick a part, lkwrist, lkrand: re-roll, lkgear, lkkeep), handled by lookAct;
// its colour pickers and sliders (data-lf) by lookLive
import { dealWrist, GLOVE_COLS, keepLook, LOOK, LOOK_SAVE, lookChanged, LOOKS, rollLook, shade, thermalOf, WRIST_KINDS } from '../player/look.js';
import { buildGuns } from '../weapons/build-weapons.js';
import { GI, GI_VB } from './game-icons.js';

const lkEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// an icon from game-icons.net (ui/game-icons.js)
export const lkIco = k => `<svg class="chIco" viewBox="${GI_VB}" aria-hidden="true">${GI[k]}</svg>`;

// which part of you is being changed (part: one of LOOK_TABS), whether the studio's copy of you wants making again
// (fresh: the look's just changed), and gear: the studio shows you with what your upgrades put on you (off: in just
// your own clothes, so what's being changed isn't hidden under the armour's jacket, boots or gloves)
export const LE = { part: 'body', fresh: true, gear: false };
export const LOOK_TABS = [['body', 'Whole'], ['face', 'Face'], ['hair', 'Hair'], ['hat', 'Hat'], ['top', 'Top'], ['legs', 'Trousers'], ['shoes', 'Shoes'], ['hands', 'Hands'], ['gear', 'Gear']];
// what each part's re-roll deals afresh
const LOOK_KEYS = { face: ['skin', 'eyes', 'eyes2', 'face'], hair: ['hair', 'hairStyle', 'beard', 'beardCol'], hat: ['hat', 'hatCol'], top: ['top', 'topCol', 'print', 'under', 'dress', 'tie', 'square'],
  legs: ['pants'], shoes: ['shoes', 'sneak', 'dressShoe'], hands: ['glove', 'wrist'], gear: ['pack', 'roll', 'holster'] };
const NICE = { tee: 'T-shirt', work: 'Work shirt', poloLong: 'Long-sleeve polo', polo: 'Polo', flannel: 'Flannel', hoodie: 'Hoodie', suit: 'Suit and tie', boots: 'Work boots', blackboots: 'Black boots', tanboots: 'Tan boots',
  sneakers: 'Sneakers', dress: 'Dress shoes', heavyStubble: 'Heavy stubble', longBeard: 'Long beard', soulPatch: 'Soul patch', muttonChops: 'Mutton chops', vandyke: 'Van Dyke', oneSquint: 'One squint', blackRed: 'Black and red',
  blueBlack: 'Blue and black', multicam: 'Multicam', tanLeather: 'Tan leather', allBlack: 'All black', none: 'None', stripe: 'Striped', paracord: 'Paracord', string: 'Strings' };
const nice = v => NICE[v] || String(v).replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).replace(/ ([A-Z])/g, (_, c) => ' ' + c.toLowerCase());
const hexOf = c => '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
const uniq = a => [...new Set(a)];
const lookGet = path => path.split('.').reduce((o, k) => o == null ? undefined : o[k], LOOK.cur);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// a row of choices, of colours (the stock ones, and any colour at all), a switch, a slider, and a titled group of them
function lkChoice(label, path, opts) {
  const cur = lookGet(path);
  return `<div class="chLk"><span class="chLkL">${label}</span><div class="chLkO">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, nice(o)]; return `<button type="button" class="${same(cur, v) ? 'on' : ''}" data-act="lk" data-f="${path}" data-v="${lkEsc(JSON.stringify(v))}">${lkEsc(l)}</button>`; }).join('')}</div></div>`;
}
function lkColour(label, path, sw, none) {
  const cur = lookGet(path), stock = uniq(sw);
  return `<div class="chLk"><span class="chLkL">${label}</span><div class="chLkO sw">${none ? `<button type="button" class="none${!cur ? ' on' : ''}" data-act="lk" data-f="${path}" data-v="0" title="None">${lkIco('crossMark')}</button>` : ''}` +
    stock.map(c => `<button type="button" class="${cur === c ? 'on' : ''}" style="--c:${hexOf(c)}" data-act="lk" data-f="${path}" data-v="${c}" title="${hexOf(c)}"></button>`).join('') +
    `<label class="any${cur && !stock.includes(cur) ? ' on' : ''}" title="Any colour"${cur && !stock.includes(cur) ? ` style="--c:${hexOf(cur)}"` : ''}><input type="color" data-lf="${path}" value="${hexOf(cur || 0x888888)}"></label></div></div>`;
}
const lkToggle = (label, path, onV = true, offV = false) => { const on = !!lookGet(path); return `<button type="button" class="chLkT${on ? ' on' : ''}" data-act="lk" data-f="${path}" data-v="${lkEsc(JSON.stringify(on ? offV : onV))}" aria-pressed="${on}"><i class="sw"></i>${label}</button>`; };
// a slider, with how far along it is
function lkSlider(label, path, min, max, step) {
  const v = lookGet(path), pc = Math.round((v - min) / (max - min) * 100);
  return `<div class="chLk"><span class="chLkL">${label}</span><div class="chLkR"><input type="range" data-lf="${path}" data-num="1" min="${min}" max="${max}" step="${step}" value="${v}" aria-label="${lkEsc(label)}"><output>${pc}%</output></div></div>`;
}
const lkGroup = (title, body, note = '') => body ? `<section class="chLkG"><h5>${title}</h5>${body}${note ? `<p class="chNote">${note}</p>` : ''}</section>` : '';
// the tie: a swatch for each colour, and the striped one
function lkTie() {
  const cur = LOOK.cur.tie;
  return `<div class="chLk"><span class="chLkL">Tie</span><div class="chLkO sw">${LOOKS.tie.filter(t => t !== 'stripe').map(c => `<button type="button" class="${cur === c ? 'on' : ''}" style="--c:${hexOf(c)}" data-act="lk" data-f="tie" data-v="${c}" title="${hexOf(c)}"></button>`).join('')}` +
    `<button type="button" class="txt${cur === 'stripe' ? ' on' : ''}" data-act="lk" data-f="tie" data-v="&quot;stripe&quot;">Striped</button></div></div>`;
}
const SNEAK_SW = [0xe8e4dc, 0x2a2a2a, 0x8a8a86, 0xb3261e, 0x2a6cc4, 0x3e7a48, 0xd8b030, 0xa85a24, 0x6a4a9a, 0xd8d2c4, 0xb08a5a];
const SQUARE_SW = [0xeceae4, 0x8a1e1e, 0xb08a2a, 0x1e2a4a], PRINT_SW = [0xd8d2c4, 0xc8a040, 0xa83a2a, 0x2e2e30];
// the tops worn over a thermal (and what's said where one can't go)
const takesThermal = top => LOOKS.underOdds[top] !== undefined;
// what on the face has a side to it: a patch, a squint, a smirk, a broken nose, a scar, a raised brow
const sided = F => F.patch || F.eye === 'oneSquint' || F.mouth === 'smirk' || F.nose === 'crooked' || !!F.scar || F.brow === 'skeptic';
// the whole of you at a glance: each part, its colours and what it is, a click away from changing it
function lookSummary(L) {
  const F = L.face || {}, dots = cs => `<span class="dots">${cs.filter(c => c || c === 0).map(c => `<i style="--c:${hexOf(c)}"></i>`).join('')}</span>`;
  const shoeCols = L.shoes === 'sneakers' ? L.sneak : L.shoes === 'dress' ? [L.dressShoe] : [{ boots: 0x3e2e22, blackboots: 0x1e1e20, tanboots: 0x7a5a3a }[L.shoes]];
  const wr = ['L', 'R'].map(s => (L.wrist || {})[s]).filter(Boolean).map(w => nice(w.kind).toLowerCase());
  const rows = {
    face: [[L.skin, L.eyes, L.eyes2 !== L.eyes ? L.eyes2 : null], `${nice(F.eye)} eyes, ${nice(F.brow).toLowerCase()} brows, ${nice(F.nose).toLowerCase()} nose`],
    hair: [[L.hair, L.beard !== 'none' ? L.beardCol : null], `${nice(L.hairStyle)}${L.beard !== 'none' ? ', ' + nice(L.beard).toLowerCase() : ''}`],
    hat: [[L.hat !== 'none' ? L.hatCol : null], L.hat === 'none' ? 'No hat' : nice(L.hat)],
    top: [[L.topCol, thermalOf(L) || null, L.top === 'suit' ? L.dress : null], nice(L.top) + (thermalOf(L) ? ' over a thermal' : '')],
    legs: [[L.pants], L.top === 'suit' && L.pants === L.topCol ? 'The suit\'s, pressed' : 'Cargo pocket, knee patch'],
    shoes: [shoeCols, nice(L.shoes)],
    hands: [[GLOVE_COLS[L.glove].back, GLOVE_COLS[L.glove].palm], `${nice(L.glove)} gloves${wr.length ? ', ' + wr.join(' and ') : ''}`],
    gear: [[L.pack, L.roll, L.holster], 'Pack, bedroll, holster']
  };
  return `<div class="chLkSum">${LOOK_TABS.slice(1).map(([k, n]) => `<button type="button" data-act="lkpart" data-p="${k}"><b>${n}</b>${dots(rows[k][0])}<em>${lkEsc(rows[k][1])}</em></button>`).join('')}</div>`;
}
export function lookEditor(p) {
  const L = LOOK.cur, F = L.face || {}, own = L.own || {};
  switch (p) {
    case 'face': return lkGroup('Colour', lkColour('Skin', 'skin', LOOKS.skin) + lkColour(own.odd ? 'Left eye' : 'Eyes', 'eyes', LOOKS.eyes) + (own.odd ? lkColour('Right eye', 'eyes2', LOOKS.eyes) : '') +
        `<div class="chLkTs">${lkToggle('A different colour in each eye', 'own.odd')}</div>`) +
      lkGroup('Features', lkChoice('Eyes', 'face.eye', uniq(LOOKS.eyeShape)) + lkChoice('Brows', 'face.brow', uniq(LOOKS.brow)) + lkChoice('Nose', 'face.nose', uniq(LOOKS.nose)) + lkChoice('Mouth', 'face.mouth', uniq(LOOKS.mouth))) +
      lkGroup('Marks', lkChoice('Scar', 'face.scar', [[null, 'None'], 'cheek', 'brow', 'lip', 'nose']) + lkChoice('Nicked brow', 'face.slit', [[0, 'None'], [-1, 'Left'], [1, 'Right']]) +
        `<div class="chLkTs">${lkToggle('Bags under the eyes', 'face.bags')}${lkToggle('Lines', 'face.lines')}${lkToggle('Freckles', 'face.freckles')}${lkToggle('Cleft chin', 'face.cleft')}${lkToggle('Grime', 'face.grime')}${lkToggle('A mole', 'face.mole', [0.07, -0.05], null)}${lkToggle('Eye patch', 'face.patch')}</div>` +
        (sided(F) ? lkChoice('Which side', 'face.side', [[-1, 'Left'], [1, 'Right']]) : ''), sided(F) ? 'The side the patch, the squint, the smirk, a broken nose, a raised brow and the scar are on.' : '') +
      lkGroup('Proportions', lkSlider('Eyes apart', 'face.gap', 0.055, 0.085, 0.001) + lkSlider('Eyes up the face', 'face.eyeY', 0.01, 0.05, 0.001) + lkSlider('Lopsided', 'face.lop', -0.008, 0.008, 0.0005) + lkSlider('Ears', 'face.ears', 0.85, 1.4, 0.01));
    case 'hair': {
      const brows = L.hairStyle === 'bald', showBeard = L.beard !== 'none' || brows;
      return lkGroup('Hair', lkChoice('Style', 'hairStyle', uniq(LOOKS.hairStyle)) + (L.hairStyle !== 'bald' ? lkColour('Colour', 'hair', LOOKS.hair) : '')) +
        lkGroup('Facial hair', lkChoice('Style', 'beard', uniq(LOOKS.beard)) + (showBeard ? lkColour('Colour', 'beardCol', LOOKS.hair.map(c => shade(c, 0.9))) +
          `<div class="chLkTs"><button type="button" class="chLkT${own.beard ? '' : ' on'}" data-act="lk" data-f="own.beard" data-v="${!own.beard}" aria-pressed="${!own.beard}"><i class="sw"></i>Follows the hair colour</button></div>` : ''),
        brows ? 'Bald, the brows take this colour.' : '');
    }
    case 'hat': return lkGroup('Hat', lkChoice('Hat', 'hat', uniq(LOOKS.hat)) + (L.hat !== 'none' ? lkColour('Colour', 'hatCol', LOOKS.hatCol[L.hat] || []) : ''), 'A helmet from the cards goes on instead of it.');
    case 'top': {
      const suit = L.top === 'suit';
      return lkGroup('Top', lkChoice('Top', 'top', uniq([...LOOKS.top, 'suit'])) + lkColour(suit ? 'Suit' : 'Colour', 'topCol', LOOKS.topCol[L.top] || []) +
          (['tee', 'polo', 'poloLong'].includes(L.top) ? lkColour(L.top === 'tee' ? 'Print' : 'Logo', 'print', PRINT_SW, true) : '')) +
        (takesThermal(L.top) ? lkGroup('Underneath', lkColour('Thermal', 'under', LOOKS.under, true), 'Its long sleeves show below the shirt\'s, and it shows at the neck.')
          : lkGroup('Underneath', '', `A ${nice(L.top).toLowerCase()} isn't worn over a thermal${L.under ? ' (the one you had goes back on with a top that is)' : ''}.`)) +
        (suit ? lkGroup('With the suit', lkColour('Shirt', 'dress', LOOKS.dress) + lkTie() + lkColour('Pocket square', 'square', SQUARE_SW, true)) : '');
    }
    case 'legs': return lkGroup('Trousers', lkColour('Colour', 'pants', uniq([...LOOKS.pants, ...(L.top === 'suit' ? [L.topCol] : [])])), L.top === 'suit' ? 'Change the suit\'s colour and its trousers follow, while they match it.' : '');
    case 'shoes': return lkGroup('Shoes', lkChoice('Shoes', 'shoes', uniq([...LOOKS.shoes, 'dress'])) + (L.shoes === 'sneakers' ? lkColour('Upper', 'sneak.0', SNEAK_SW) + lkColour('Sole', 'sneak.1', [0xe8e4dc, 0xd8d2c4, 0xb08a5a, 0x2a2a2a]) + lkColour('Stripe', 'sneak.2', SNEAK_SW) : '') +
      (L.shoes === 'dress' ? lkColour('Leather', 'dressShoe', LOOKS.dressShoe) : ''), 'Better footwear from the cards goes on over these.');
    case 'hands': return lkGroup('Gloves', `<div class="chLk"><span class="chLkL">Colourway</span><div class="chLkO">${Object.keys(GLOVE_COLS).map(k => { const C = GLOVE_COLS[k]; return `<button type="button" class="glv${L.glove === k ? ' on' : ''}" data-act="lk" data-f="glove" data-v="${lkEsc(JSON.stringify(k))}"><span class="dots">${[C.back, C.palm, C.accent].map(c => `<i style="--c:${hexOf(c)}"></i>`).join('')}</span>${nice(k)}</button>`; }).join('')}</div></div>`, 'Worn once you have Quick hands II: switch on Upgrade gear on the view to see them on you.') +
      lkGroup('Wrists', ['B', 'L', 'R'].map(sd => { const w = sd === 'B' ? lkBoth(L) : (L.wrist || {})[sd]; return `<div class="chLk"><span class="chLkL">${sd === 'B' ? 'Both' : sd === 'L' ? 'Left' : 'Right'}</span><div class="chLkO">${['none', ...uniq(WRIST_KINDS)].map(k => `<button type="button" class="${(w ? w.kind : 'none') === k ? 'on' : ''}" data-act="lkwrist" data-s="${sd}" data-k="${k}">${nice(k)}</button>`).join('')}${w ? `<button type="button" class="re" data-act="lkwrist" data-s="${sd}" data-k="${w.kind}" title="Another one">${lkIco('dice')}</button>` : ''}</div></div>`; }).join(''));
    case 'gear': return lkGroup('What you carry', lkColour('Backpack', 'pack', LOOKS.pack) + lkColour('Bedroll', 'roll', LOOKS.roll) + lkColour('Holster', 'holster', LOOKS.holster));
    default: return lookSummary(L);
  }
}
// what's on both wrists, when it's the same kind on each (Both)
const lkBoth = L => { const w = L.wrist || {}; return w.L && w.R && w.L.kind === w.R.kind ? w.L : null; };
// your look changed: built on you (and what you carry rebuilt with it), the studio's copy of you made again, and kept
// for new runs if you're keeping it (player/look.js: lookChanged)
function applyLook(L) { rollLook(L); buildGuns(); LE.fresh = true; lookChanged(); }
const stockHat = c => Object.values(LOOKS.hatCol).some(a => a.includes(c));
function lookSet(path, v) {
  const was = LOOK.cur, L = JSON.parse(JSON.stringify(was)), ks = path.split('.');
  let o = L; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = o[ks[i]] && typeof o[ks[i]] === 'object' ? o[ks[i]] : {};
  o[ks[ks.length - 1]] = v;
  // what goes with a change: a hat's own colours (a colour of your own kept), a suit's shirt, tie, trousers and shoes
  // (and they go with it, if they're still the suit's), the trousers following the suit's colour, the beard following
  // the hair (till it's given a colour of its own), both eyes the one colour (unless they're to differ)
  L.own = L.own || {};
  if (path === 'hat' && v !== 'none' && (!L.hatCol || (stockHat(L.hatCol) && !LOOKS.hatCol[v].includes(L.hatCol)))) L.hatCol = LOOKS.hatCol[v][0];
  if (path === 'top' && v === 'suit' && was.top !== 'suit') {
    if (!LOOKS.topCol.suit.includes(L.topCol)) L.topCol = LOOKS.topCol.suit[0];
    L.dress = L.dress ?? LOOKS.dress[0]; L.tie = L.tie ?? LOOKS.tie[0]; L.square = L.square ?? 0; L.shoes = 'dress'; L.dressShoe = L.dressShoe ?? LOOKS.dressShoe[0]; L.pants = L.topCol;
  }
  if (path === 'top' && v !== 'suit' && was.top === 'suit') { if (L.pants === was.topCol) L.pants = LOOKS.pants[0]; if (L.shoes === 'dress') L.shoes = LOOKS.shoes[0]; }
  if (path === 'topCol' && L.top === 'suit' && was.pants === was.topCol) L.pants = v;
  if (path === 'shoes' && v === 'dress') L.dressShoe = L.dressShoe ?? LOOKS.dressShoe[0];
  if (path === 'hair' && !L.own.beard) delete L.beardCol;
  if (path === 'beardCol') L.own.beard = true;
  if (path === 'own.beard' && !v) delete L.beardCol;
  if (path === 'eyes' && !L.own.odd) L.eyes2 = v;
  if (path === 'own.odd' && !v) L.eyes2 = L.eyes;
  applyLook(L);
}
// one part dealt afresh (or the whole of you)
function lookReroll(p) {
  if (p === 'body') { applyLook(undefined); return; }
  const L = JSON.parse(JSON.stringify(LOOK.cur)); (LOOK_KEYS[p] || []).forEach(k => delete L[k]);
  if (p === 'hair' && L.own) delete L.own.beard; if (p === 'face' && L.own) delete L.own.odd;
  // a fresh top that isn't a suit takes the suit's trousers and shoes off with it
  if (p === 'top' && LOOK.cur.top === 'suit') { if (L.pants === LOOK.cur.topCol) delete L.pants; if (L.shoes === 'dress') { delete L.shoes; delete L.dressShoe; } }
  applyLook(L);
}

// the switch that keeps this look for every run and every time you're back on your feet (player/look.js: keepLook)
export const lookKeepSwitch = (cls = 'chLkT') => `<button type="button" class="${cls}${LOOK_SAVE.on ? ' on' : ''}" data-act="lkkeep" aria-pressed="${LOOK_SAVE.on}"><i class="sw"></i>Keep this look every run</button>`;
// the editor's buttons: true if it was one of them (the look's changed, or the part or the studio's gear)
export function lookAct(act, d) {
  switch (act) {
    case 'lkpart': LE.part = d.p; return true;
    case 'lkgear': LE.gear = !LE.gear; LE.fresh = true; return true;
    case 'lk': lookSet(d.f, JSON.parse(d.v)); return true;
    case 'lkwrist': { const L = JSON.parse(JSON.stringify(LOOK.cur)); L.wrist = L.wrist || { L: null, R: null }; const it = d.k === 'none' ? null : dealWrist(d.k); if (d.s === 'B') { L.wrist.L = it; L.wrist.R = it && JSON.parse(JSON.stringify(it)); } else L.wrist[d.s] = it; applyLook(L); return true; }   // (Both: the same thing on each wrist)
    case 'lkrand': lookReroll(d.p); return true;
    case 'lkkeep': keepLook(!LOOK_SAVE.on); return true;
  }
  return false;
}
// a colour picked or a slider dragged (el: its input, data-lf its part of the look): put on you a few times a second
// as it moves (moved(): the studio's copy made again) and once more where it's let go (done(): the editor drawn again)
let lookLiveT = 0;
export function lookLive(el, last, moved, done) {
  const path = el.dataset.lf, v = el.dataset.num ? +el.value : parseInt(el.value.slice(1), 16), now = performance.now(), out = el.nextElementSibling;
  if (out && out.tagName === 'OUTPUT') out.textContent = Math.round((v - el.min) / (el.max - el.min) * 100) + '%';   // (how far along, as you drag)
  if (!last && now - lookLiveT < 140) return; lookLiveT = now;
  lookSet(path, v); if (last) done(); else moved();
}
